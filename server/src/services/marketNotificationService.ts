import { MarketFavoriteListType, type MarketFavorite, type Prisma } from '@prisma/client';

import {
  DEFAULT_PROVIDER_TARGETS,
  getDefaultMarketFavoriteNotificationSettings,
  NOTIFICATION_EVENT_DEFINITION_MAP,
  type NotificationProviderKey,
  type MarketFavoriteNotificationSettings
} from './notificationConstants.js';
import {
  listUserIdsWithEnabledNotificationPreference,
  queueUserNotification
} from './userNotificationService.js';
import { prisma } from '../utils/prisma.js';

type SaleEventInput = {
  eqLogId: bigint | number | string;
  eventType: string;
  occurredAt: Date;
  actorCharacterName: string;
  counterpartyCharacterName?: string | null;
  itemId?: number | null;
  itemName: string;
  price: number;
  totalCost: number;
};

type CanonicalTradeEvent = {
  eqLogIds: string[];
  occurredAt: Date;
  sellerCharacterName: string;
  buyerCharacterName: string | null;
  itemId?: number | null;
  itemName: string;
  price: number;
  totalCost: number;
};

type MarketNotificationEventKey =
  | 'market.all.trade_activity'
  | 'market.item.trade_activity'
  | 'market.item.listing_activity'
  | 'market.item.price_rule_triggered'
  | 'market.character.trade_activity'
  | 'market.character.listing_activity'
  | 'market.trader.trade_activity'
  | 'market.trader.listing_activity'
  | 'market.trader.undercut';

type NotificationCandidate = {
  eventKey: MarketNotificationEventKey;
  line: string;
  priority: number;
};

type NotificationBucket = {
  userId: string;
  provider: NotificationProviderKey;
  eventKey: MarketNotificationEventKey;
  lines: string[];
};

type EnabledProvidersMatrix = Map<
  string,
  Map<MarketNotificationEventKey, Set<NotificationProviderKey>>
>;

type ListingSnapshot = {
  id: string;
  sellerCharacterName: string;
  itemId: number;
  itemName: string;
  itemIconId: number | null;
  price: number;
  charges: number | null;
  slotId: number;
  listedAt: Date | null;
};

type ListingRankStatus = 'leading' | 'matching' | 'undercut';

const TRADE_NOTIFICATION_PRIORITY: Record<MarketNotificationEventKey, number> = {
  'market.all.trade_activity': 0,
  'market.trader.trade_activity': 1,
  'market.character.trade_activity': 2,
  'market.item.price_rule_triggered': 3,
  'market.item.trade_activity': 4,
  'market.trader.undercut': 99,
  'market.trader.listing_activity': 99,
  'market.character.listing_activity': 99,
  'market.item.listing_activity': 99
};

const LISTING_NOTIFICATION_PRIORITY: Record<MarketNotificationEventKey, number> = {
  'market.trader.undercut': 0,
  'market.trader.listing_activity': 1,
  'market.character.listing_activity': 2,
  'market.item.price_rule_triggered': 3,
  'market.item.listing_activity': 4,
  'market.all.trade_activity': 99,
  'market.trader.trade_activity': 99,
  'market.character.trade_activity': 99,
  'market.item.trade_activity': 99
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatCopperCurrency(value: number): string {
  const totalCopper = Math.max(0, Math.trunc(value));
  const platinum = Math.floor(totalCopper / 1000);
  const gold = Math.floor((totalCopper % 1000) / 100);
  const silver = Math.floor((totalCopper % 100) / 10);
  const copper = totalCopper % 10;
  const parts: string[] = [];

  if (platinum > 0) {
    parts.push(`${platinum.toLocaleString()}pp`);
  }

  if (gold > 0) {
    parts.push(`${gold}gp`);
  }

  if (silver > 0) {
    parts.push(`${silver}sp`);
  }

  if (copper > 0 || parts.length === 0) {
    parts.push(`${copper}cp`);
  }

  return parts.join(' ');
}

function namesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function toCanonicalTradeEvent(event: SaleEventInput): CanonicalTradeEvent | null {
  const sellerCharacterName =
    event.eventType === 'TRADER_SELL'
      ? event.actorCharacterName.trim()
      : (event.counterpartyCharacterName?.trim() ?? '');
  const buyerCharacterName =
    event.eventType === 'TRADER_SELL'
      ? (event.counterpartyCharacterName?.trim() ?? null)
      : event.actorCharacterName.trim() || null;
  const itemName = event.itemName.trim();

  if (!sellerCharacterName || !itemName) {
    return null;
  }

  return {
    eqLogIds: [String(event.eqLogId)],
    occurredAt: event.occurredAt,
    sellerCharacterName,
    buyerCharacterName,
    itemId: event.itemId ?? null,
    itemName,
    price: event.price,
    totalCost: event.totalCost
  };
}

function buildCanonicalTradeFingerprint(event: CanonicalTradeEvent): string {
  return [
    event.occurredAt.toISOString(),
    normalizeText(event.sellerCharacterName),
    normalizeText(event.buyerCharacterName),
    event.itemId ?? `name:${normalizeText(event.itemName)}`,
    event.price,
    event.totalCost
  ].join('|');
}

function canonicalizeTradeEvents(events: SaleEventInput[]): CanonicalTradeEvent[] {
  const tradesByFingerprint = new Map<string, CanonicalTradeEvent>();

  for (const event of events) {
    const canonicalEvent = toCanonicalTradeEvent(event);
    if (!canonicalEvent) {
      continue;
    }

    const fingerprint = buildCanonicalTradeFingerprint(canonicalEvent);
    const existing = tradesByFingerprint.get(fingerprint);
    if (!existing) {
      tradesByFingerprint.set(fingerprint, canonicalEvent);
      continue;
    }

    existing.eqLogIds = Array.from(new Set([...existing.eqLogIds, ...canonicalEvent.eqLogIds]));

    if (event.eventType === 'TRADER_SELL') {
      existing.sellerCharacterName = canonicalEvent.sellerCharacterName;
      existing.buyerCharacterName = canonicalEvent.buyerCharacterName;
    } else if (!existing.buyerCharacterName && canonicalEvent.buyerCharacterName) {
      existing.buyerCharacterName = canonicalEvent.buyerCharacterName;
    }
  }

  return [...tradesByFingerprint.values()];
}

function buildTradeNotificationDedupeSeed(events: CanonicalTradeEvent[]): string {
  return Array.from(new Set(events.flatMap((event) => event.eqLogIds)))
    .sort()
    .join(',');
}

function normalizeProviderTargets(value: unknown): Record<NotificationProviderKey, boolean> {
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const targets = parsed as Record<string, unknown>;

  return {
    TELEGRAM:
      typeof targets.TELEGRAM === 'boolean'
        ? targets.TELEGRAM
        : (DEFAULT_PROVIDER_TARGETS.TELEGRAM ?? false),
    WHATSAPP:
      typeof targets.WHATSAPP === 'boolean'
        ? targets.WHATSAPP
        : (DEFAULT_PROVIDER_TARGETS.WHATSAPP ?? false)
  };
}

function getEnabledProvidersForEvent(
  matrix: EnabledProvidersMatrix,
  userId: string,
  eventKey: MarketNotificationEventKey
): Set<NotificationProviderKey> {
  return matrix.get(userId)?.get(eventKey) ?? new Set<NotificationProviderKey>();
}

async function buildEnabledProvidersMatrix(
  userIds: string[],
  eventKeys: MarketNotificationEventKey[]
): Promise<EnabledProvidersMatrix> {
  const normalizedUserIds = [...new Set(userIds.filter(Boolean))];
  const normalizedEventKeys = [...new Set(eventKeys)];

  if (normalizedUserIds.length === 0 || normalizedEventKeys.length === 0) {
    return new Map();
  }

  const [channels, preferences] = await Promise.all([
    prisma.userNotificationChannel.findMany({
      where: {
        userId: { in: normalizedUserIds },
        status: 'ACTIVE'
      },
      select: {
        userId: true,
        provider: true
      }
    }),
    prisma.userNotificationPreference.findMany({
      where: {
        userId: { in: normalizedUserIds },
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: { in: normalizedEventKeys }
      },
      select: {
        userId: true,
        eventKey: true,
        isEnabled: true,
        providerTargets: true
      }
    })
  ]);

  const activeProvidersByUser = new Map<string, Set<NotificationProviderKey>>();
  for (const channel of channels) {
    const providers =
      activeProvidersByUser.get(channel.userId) ?? new Set<NotificationProviderKey>();
    providers.add(channel.provider);
    activeProvidersByUser.set(channel.userId, providers);
  }

  const preferenceMap = new Map(
    preferences.map(
      (preference) => [`${preference.userId}:${preference.eventKey}`, preference] as const
    )
  );

  const matrix: EnabledProvidersMatrix = new Map();

  for (const userId of normalizedUserIds) {
    const activeProviders = activeProvidersByUser.get(userId);
    if (!activeProviders || activeProviders.size === 0) {
      continue;
    }

    const eventsByUser = new Map<MarketNotificationEventKey, Set<NotificationProviderKey>>();

    for (const eventKey of normalizedEventKeys) {
      const definition = NOTIFICATION_EVENT_DEFINITION_MAP.get(eventKey);
      if (!definition) {
        continue;
      }

      const preference = preferenceMap.get(`${userId}:${eventKey}`);
      const isEnabled = preference?.isEnabled ?? definition.recommended;
      if (!isEnabled) {
        continue;
      }

      const providerTargets = preference
        ? normalizeProviderTargets(preference.providerTargets)
        : normalizeProviderTargets(DEFAULT_PROVIDER_TARGETS);
      const enabledProviders = new Set<NotificationProviderKey>();

      for (const provider of activeProviders) {
        if (providerTargets[provider] !== false) {
          enabledProviders.add(provider);
        }
      }

      if (enabledProviders.size > 0) {
        eventsByUser.set(eventKey, enabledProviders);
      }
    }

    if (eventsByUser.size > 0) {
      matrix.set(userId, eventsByUser);
    }
  }

  return matrix;
}

function addNotificationCandidate(
  candidatesByUser: Map<string, Map<string, NotificationCandidate[]>>,
  userId: string,
  fingerprint: string,
  candidate: NotificationCandidate
): void {
  const candidatesByFingerprint =
    candidatesByUser.get(userId) ?? new Map<string, NotificationCandidate[]>();
  const candidates = candidatesByFingerprint.get(fingerprint) ?? [];
  candidates.push(candidate);
  candidatesByFingerprint.set(fingerprint, candidates);
  candidatesByUser.set(userId, candidatesByFingerprint);
}

function finalizeNotificationBuckets(
  candidatesByUser: Map<string, Map<string, NotificationCandidate[]>>,
  enabledProvidersMatrix: EnabledProvidersMatrix
): NotificationBucket[] {
  const buckets = new Map<string, NotificationBucket>();

  for (const [userId, candidatesByFingerprint] of candidatesByUser.entries()) {
    for (const candidates of candidatesByFingerprint.values()) {
      const relevantProviders = new Set<NotificationProviderKey>();

      for (const candidate of candidates) {
        for (const provider of getEnabledProvidersForEvent(
          enabledProvidersMatrix,
          userId,
          candidate.eventKey
        )) {
          relevantProviders.add(provider);
        }
      }

      for (const provider of relevantProviders) {
        const providerCandidates = candidates.filter((candidate) =>
          getEnabledProvidersForEvent(enabledProvidersMatrix, userId, candidate.eventKey).has(
            provider
          )
        );
        const bestCandidate = providerCandidates
          .slice()
          .sort((left, right) => left.priority - right.priority)[0];

        if (!bestCandidate) {
          continue;
        }

        const bucketKey = `${userId}:${provider}:${bestCandidate.eventKey}`;
        const bucket =
          buckets.get(bucketKey) ??
          ({
            userId,
            provider,
            eventKey: bestCandidate.eventKey,
            lines: []
          } satisfies NotificationBucket);

        const winningLines = new Set(
          providerCandidates
            .filter(
              (candidate) =>
                candidate.priority === bestCandidate.priority &&
                candidate.eventKey === bestCandidate.eventKey
            )
            .map((candidate) => candidate.line)
        );

        bucket.lines.push(...winningLines);
        buckets.set(bucketKey, bucket);
      }
    }
  }

  return [...buckets.values()];
}

function formatCharacterTradeLine(
  watchedCharacterName: string,
  event: Pick<
    CanonicalTradeEvent,
    'sellerCharacterName' | 'buyerCharacterName' | 'itemName' | 'price'
  >
): string {
  const watchedIsSeller = namesMatch(watchedCharacterName, event.sellerCharacterName);
  const watchedIsBuyer = namesMatch(watchedCharacterName, event.buyerCharacterName);
  const watchedDisplayName = watchedCharacterName.trim();
  const buyerName = event.buyerCharacterName?.trim() || null;
  const sellerName = event.sellerCharacterName.trim();
  const priceText = formatCopperCurrency(event.price);

  if (watchedIsSeller) {
    return buyerName
      ? `${watchedDisplayName} sold ${event.itemName} for ${priceText} to ${buyerName}.`
      : `${watchedDisplayName} sold ${event.itemName} for ${priceText}.`;
  }

  if (watchedIsBuyer) {
    return `${watchedDisplayName} bought ${event.itemName} for ${priceText} from ${sellerName}.`;
  }

  return `${watchedDisplayName} traded ${event.itemName} for ${priceText}.`;
}

function formatTraderSaleLine(
  traderCharacterName: string,
  event: Pick<CanonicalTradeEvent, 'itemName' | 'price' | 'buyerCharacterName'>
): string {
  const traderDisplayName = traderCharacterName.trim();
  const buyerName = event.buyerCharacterName?.trim() || null;
  const priceText = formatCopperCurrency(event.price);

  return buyerName
    ? `${traderDisplayName} sold ${event.itemName} for ${priceText} to ${buyerName}.`
    : `${traderDisplayName} sold ${event.itemName} for ${priceText}.`;
}

function formatMarketSaleLine(
  event: Pick<
    CanonicalTradeEvent,
    'sellerCharacterName' | 'itemName' | 'price' | 'buyerCharacterName'
  >
): string {
  return formatTraderSaleLine(event.sellerCharacterName, event);
}

function formatCharacterListingLine(
  watchedCharacterName: string,
  listing: Pick<ListingSnapshot, 'itemName' | 'price'>,
  previousPrice?: number | null
): string {
  const priceChange = formatListingPriceChange(previousPrice, listing.price);
  return `${buildListingChangeEmoji(previousPrice, listing.price)} ${watchedCharacterName.trim()} listed ${listing.itemName} for ${formatCopperCurrency(listing.price)}${priceChange}.`;
}

function buildListingChangeEmoji(
  previousPrice: number | null | undefined,
  currentPrice: number
): string {
  if (previousPrice == null) {
    return '🆕';
  }

  if (currentPrice < previousPrice) {
    return '🟢⬇️';
  }

  if (currentPrice > previousPrice) {
    return '🔴⬆️';
  }

  return '🏷️';
}

function formatListingPriceChange(
  previousPrice: number | null | undefined,
  currentPrice: number
): string {
  if (previousPrice == null || previousPrice === currentPrice) {
    return '';
  }

  return ` (was ${formatCopperCurrency(previousPrice)})`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizeMarketFavoriteNotificationSettings(
  favorite: Pick<MarketFavorite, 'listType' | 'notificationSettings'>
): MarketFavoriteNotificationSettings {
  const defaults = getDefaultMarketFavoriteNotificationSettings(favorite.listType);
  const raw = asObject(favorite.notificationSettings);

  return {
    ...defaults,
    ...raw
  };
}

export async function updateMarketFavoriteNotificationSettings(
  userId: string,
  favoriteId: string,
  updates: MarketFavoriteNotificationSettings
): Promise<MarketFavoriteNotificationSettings> {
  const favorite = await prisma.marketFavorite.findFirst({
    where: {
      id: favoriteId,
      userId
    }
  });

  if (!favorite) {
    throw new Error('Watchlist entry not found.');
  }

  const merged = {
    ...normalizeMarketFavoriteNotificationSettings(favorite),
    ...updates
  };

  await prisma.marketFavorite.update({
    where: { id: favorite.id },
    data: {
      notificationSettings: merged as Prisma.InputJsonValue
    }
  });

  return merged;
}

export async function processMarketSaleNotifications(events: SaleEventInput[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const canonicalEvents = canonicalizeTradeEvents(events);
  if (canonicalEvents.length === 0) {
    return;
  }

  const itemIds = [
    ...new Set(
      canonicalEvents.map((event) => event.itemId).filter((value): value is number => value != null)
    )
  ];
  const itemNames = [
    ...new Set(canonicalEvents.map((event) => normalizeText(event.itemName)).filter(Boolean))
  ];
  const characterNames = [
    ...new Set(
      canonicalEvents
        .flatMap((event) => [event.sellerCharacterName, event.buyerCharacterName])
        .map((name) => normalizeText(name))
        .filter(Boolean)
    )
  ];

  const favorites = await prisma.marketFavorite.findMany({
    where: {
      OR: [
        {
          listType: MarketFavoriteListType.FAVORITE_ITEMS,
          OR: [
            itemIds.length > 0 ? { itemId: { in: itemIds } } : undefined,
            itemNames.length > 0
              ? { targetKey: { in: itemNames.map((name) => `item-name:${name}`) } }
              : undefined
          ].filter(Boolean) as Prisma.MarketFavoriteWhereInput[]
        },
        {
          listType: MarketFavoriteListType.FAVORITE_CHARACTERS,
          targetKey: { in: characterNames.map((name) => `character:${name}`) }
        },
        {
          listType: MarketFavoriteListType.MY_TRADERS,
          targetKey: { in: characterNames.map((name) => `trader:${name}`) }
        }
      ]
    }
  });
  const allSaleNotificationUserIds =
    canonicalEvents.length > 0
      ? await listUserIdsWithEnabledNotificationPreference({
          scopeType: 'GLOBAL',
          scopeId: 'global',
          eventKey: 'market.all.trade_activity'
        })
      : [];
  const relevantUserIds = [
    ...new Set([...favorites.map((favorite) => favorite.userId), ...allSaleNotificationUserIds])
  ];
  const enabledProvidersMatrix = await buildEnabledProvidersMatrix(relevantUserIds, [
    'market.all.trade_activity',
    'market.item.trade_activity',
    'market.item.price_rule_triggered',
    'market.character.trade_activity',
    'market.trader.trade_activity'
  ]);
  const candidatesByUser = new Map<string, Map<string, NotificationCandidate[]>>();

  for (const userId of allSaleNotificationUserIds) {
    for (const event of canonicalEvents) {
      addNotificationCandidate(candidatesByUser, userId, buildCanonicalTradeFingerprint(event), {
        eventKey: 'market.all.trade_activity',
        line: formatMarketSaleLine(event),
        priority: TRADE_NOTIFICATION_PRIORITY['market.all.trade_activity']
      });
    }
  }

  for (const favorite of favorites) {
    const settings = normalizeMarketFavoriteNotificationSettings(favorite);
    const matchingEvents = canonicalEvents.filter((event) => {
      if (favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS) {
        return (
          (favorite.itemId != null && event.itemId === favorite.itemId) ||
          normalizeText(favorite.itemName) === normalizeText(event.itemName)
        );
      }

      if (favorite.listType === MarketFavoriteListType.MY_TRADERS) {
        const normalizedFavoriteName = normalizeText(favorite.characterName);
        return normalizedFavoriteName === normalizeText(event.sellerCharacterName);
      }

      const normalizedFavoriteName = normalizeText(favorite.characterName);
      return (
        normalizedFavoriteName === normalizeText(event.sellerCharacterName) ||
        normalizedFavoriteName === normalizeText(event.buyerCharacterName)
      );
    });

    if (matchingEvents.length === 0) {
      continue;
    }

    for (const event of matchingEvents) {
      const fingerprint = buildCanonicalTradeFingerprint(event);

      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS &&
        settings.notifyOnTradeActivity !== false
      ) {
        addNotificationCandidate(candidatesByUser, favorite.userId, fingerprint, {
          eventKey: 'market.item.trade_activity',
          line: `${event.itemName}: ${event.sellerCharacterName} sold for ${formatCopperCurrency(event.price)}`,
          priority: TRADE_NOTIFICATION_PRIORITY['market.item.trade_activity']
        });
      }

      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS &&
        settings.maxTradePriceCopper != null &&
        event.price <= settings.maxTradePriceCopper
      ) {
        addNotificationCandidate(candidatesByUser, favorite.userId, fingerprint, {
          eventKey: 'market.item.price_rule_triggered',
          line: `${event.itemName} traded at ${formatCopperCurrency(event.price)} (rule <= ${formatCopperCurrency(settings.maxTradePriceCopper)})`,
          priority: TRADE_NOTIFICATION_PRIORITY['market.item.price_rule_triggered']
        });
      }

      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_CHARACTERS &&
        settings.notifyOnTradeActivity !== false
      ) {
        if (!favorite.characterName) {
          continue;
        }

        addNotificationCandidate(candidatesByUser, favorite.userId, fingerprint, {
          eventKey: 'market.character.trade_activity',
          line: formatCharacterTradeLine(favorite.characterName, event),
          priority: TRADE_NOTIFICATION_PRIORITY['market.character.trade_activity']
        });
      }

      if (
        favorite.listType === MarketFavoriteListType.MY_TRADERS &&
        settings.notifyOnTradeActivity !== false
      ) {
        if (!favorite.characterName) {
          continue;
        }

        addNotificationCandidate(candidatesByUser, favorite.userId, fingerprint, {
          eventKey: 'market.trader.trade_activity',
          line: formatTraderSaleLine(favorite.characterName, event),
          priority: TRADE_NOTIFICATION_PRIORITY['market.trader.trade_activity']
        });
      }
    }
  }
  const tradeDedupeSeed = buildTradeNotificationDedupeSeed(canonicalEvents);
  const notificationBuckets = finalizeNotificationBuckets(candidatesByUser, enabledProvidersMatrix);

  await Promise.all([
    ...notificationBuckets.map((bucket) =>
      queueUserNotification({
        userId: bucket.userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: bucket.eventKey,
        payload: { lines: bucket.lines } as Prisma.InputJsonValue,
        dedupeSeed: tradeDedupeSeed,
        providers: [bucket.provider]
      })
    )
  ]);
}

function buildListingFingerprint(listing: ListingSnapshot): string {
  return [
    listing.sellerCharacterName.toLowerCase(),
    listing.itemId,
    listing.slotId,
    listing.charges ?? 'na'
  ].join(':');
}

function buildListingNotificationFingerprint(
  listing: ListingSnapshot,
  previousPrice?: number | null
): string {
  return `${buildListingFingerprint(listing)}:${previousPrice ?? 'na'}:${listing.price}`;
}

function getRankedStatuses(listings: ListingSnapshot[]): Map<string, ListingRankStatus> {
  const grouped = new Map<number, ListingSnapshot[]>();
  for (const listing of listings) {
    const group = grouped.get(listing.itemId) ?? [];
    group.push(listing);
    grouped.set(listing.itemId, group);
  }

  const statuses = new Map<string, ListingRankStatus>();

  for (const [, group] of grouped) {
    const bestPrice = Math.min(...group.map((listing) => listing.price));
    const samePriceListings = group.filter((listing) => listing.price === bestPrice);

    for (const listing of group) {
      if (listing.price > bestPrice) {
        statuses.set(buildListingFingerprint(listing), 'undercut');
      } else if (samePriceListings.length > 1) {
        statuses.set(buildListingFingerprint(listing), 'matching');
      } else {
        statuses.set(buildListingFingerprint(listing), 'leading');
      }
    }
  }

  return statuses;
}

export async function processMarketListingNotifications(options: {
  previousListings: ListingSnapshot[];
  currentListings: ListingSnapshot[];
  syncedAt: Date;
}): Promise<void> {
  const { previousListings, currentListings, syncedAt } = options;
  const previousByFingerprint = new Map(
    previousListings.map((listing) => [buildListingFingerprint(listing), listing] as const)
  );
  const currentStatuses = getRankedStatuses(currentListings);
  const previousStatuses = getRankedStatuses(previousListings);

  const favoriteItems = await prisma.marketFavorite.findMany({
    where: {
      listType: {
        in: [
          MarketFavoriteListType.FAVORITE_ITEMS,
          MarketFavoriteListType.FAVORITE_CHARACTERS,
          MarketFavoriteListType.MY_TRADERS
        ]
      }
    }
  });
  const relevantUserIds = [...new Set(favoriteItems.map((favorite) => favorite.userId))];
  const enabledProvidersMatrix = await buildEnabledProvidersMatrix(relevantUserIds, [
    'market.item.listing_activity',
    'market.item.price_rule_triggered',
    'market.character.listing_activity',
    'market.trader.listing_activity',
    'market.trader.undercut'
  ]);
  const candidatesByUser = new Map<string, Map<string, NotificationCandidate[]>>();

  for (const favorite of favoriteItems) {
    const settings = normalizeMarketFavoriteNotificationSettings(favorite);

    if (favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS) {
      for (const listing of currentListings) {
        const matches =
          (favorite.itemId != null && listing.itemId === favorite.itemId) ||
          normalizeText(favorite.itemName) === normalizeText(listing.itemName);
        if (!matches) {
          continue;
        }

        const previous = previousByFingerprint.get(buildListingFingerprint(listing));
        const notificationFingerprint = buildListingNotificationFingerprint(
          listing,
          previous?.price
        );
        const isNewOrChanged = !previous || previous.price !== listing.price;
        if (isNewOrChanged && settings.notifyOnListingActivity !== false) {
          addNotificationCandidate(candidatesByUser, favorite.userId, notificationFingerprint, {
            eventKey: 'market.item.listing_activity',
            line: `${buildListingChangeEmoji(previous?.price, listing.price)} ${listing.itemName} listed by ${listing.sellerCharacterName} for ${formatCopperCurrency(listing.price)}${formatListingPriceChange(previous?.price, listing.price)}`,
            priority: LISTING_NOTIFICATION_PRIORITY['market.item.listing_activity']
          });
        }

        if (
          settings.maxListingPriceCopper != null &&
          listing.price <= settings.maxListingPriceCopper
        ) {
          addNotificationCandidate(candidatesByUser, favorite.userId, notificationFingerprint, {
            eventKey: 'market.item.price_rule_triggered',
            line: `${listing.itemName} listed at ${formatCopperCurrency(listing.price)} (rule <= ${formatCopperCurrency(settings.maxListingPriceCopper)})`,
            priority: LISTING_NOTIFICATION_PRIORITY['market.item.price_rule_triggered']
          });
        }
      }
    } else if (favorite.listType === MarketFavoriteListType.FAVORITE_CHARACTERS) {
      if (settings.notifyOnListingActivity === false) {
        continue;
      }

      if (!favorite.characterName) {
        continue;
      }

      for (const listing of currentListings) {
        if (normalizeText(favorite.characterName) !== normalizeText(listing.sellerCharacterName)) {
          continue;
        }

        const previous = previousByFingerprint.get(buildListingFingerprint(listing));
        if (!previous || previous.price !== listing.price) {
          addNotificationCandidate(
            candidatesByUser,
            favorite.userId,
            buildListingNotificationFingerprint(listing, previous?.price),
            {
              eventKey: 'market.character.listing_activity',
              line: formatCharacterListingLine(favorite.characterName, listing, previous?.price),
              priority: LISTING_NOTIFICATION_PRIORITY['market.character.listing_activity']
            }
          );
        }
      }
    } else {
      const relevantListings = currentListings.filter(
        (listing) =>
          normalizeText(favorite.characterName) === normalizeText(listing.sellerCharacterName)
      );

      if (relevantListings.length === 0) {
        continue;
      }

      if (settings.notifyOnListingActivity !== false && settings.undercutOnly !== true) {
        for (const listing of relevantListings) {
          const previous = previousByFingerprint.get(buildListingFingerprint(listing));
          if (!previous || previous.price !== listing.price) {
            addNotificationCandidate(
              candidatesByUser,
              favorite.userId,
              buildListingNotificationFingerprint(listing, previous?.price),
              {
                eventKey: 'market.trader.listing_activity',
                line: `${buildListingChangeEmoji(previous?.price, listing.price)} ${favorite.characterName}: ${listing.itemName} at ${formatCopperCurrency(listing.price)}${formatListingPriceChange(previous?.price, listing.price)}`,
                priority: LISTING_NOTIFICATION_PRIORITY['market.trader.listing_activity']
              }
            );
          }
        }
      }

      if (settings.notifyOnUndercut !== false) {
        for (const listing of relevantListings) {
          const fingerprint = buildListingFingerprint(listing);
          const currentStatus = currentStatuses.get(fingerprint) ?? 'leading';
          const previousStatus = previousStatuses.get(fingerprint);
          const becameUndercut = currentStatus === 'undercut' && previousStatus !== 'undercut';
          if (!becameUndercut) {
            continue;
          }

          addNotificationCandidate(
            candidatesByUser,
            favorite.userId,
            buildListingNotificationFingerprint(
              listing,
              previousByFingerprint.get(fingerprint)?.price
            ),
            {
              eventKey: 'market.trader.undercut',
              line: `${favorite.characterName}: ${listing.itemName} is now undercut at ${formatCopperCurrency(listing.price)}`,
              priority: LISTING_NOTIFICATION_PRIORITY['market.trader.undercut']
            }
          );
        }
      }
    }
  }

  const dedupeSeed = syncedAt.toISOString();
  const notificationBuckets = finalizeNotificationBuckets(candidatesByUser, enabledProvidersMatrix);

  await Promise.all([
    ...notificationBuckets.map((bucket) =>
      queueUserNotification({
        userId: bucket.userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: bucket.eventKey,
        payload: { lines: bucket.lines } as Prisma.InputJsonValue,
        dedupeSeed: dedupeSeed,
        providers: [bucket.provider]
      })
    )
  ]);
}
