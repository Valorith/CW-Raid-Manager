import { MarketFavoriteListType, type MarketFavorite, type Prisma } from '@prisma/client';

import {
  getDefaultMarketFavoriteNotificationSettings,
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

function formatCharacterTradeLine(
  watchedCharacterName: string,
  event: Pick<
    SaleEventInput,
    'eventType' | 'actorCharacterName' | 'counterpartyCharacterName' | 'itemName' | 'price'
  >
): string {
  const watchedIsActor = namesMatch(watchedCharacterName, event.actorCharacterName);
  const watchedIsCounterparty = namesMatch(watchedCharacterName, event.counterpartyCharacterName);
  const watchedDisplayName = watchedCharacterName.trim();
  const counterpartyName = event.counterpartyCharacterName?.trim() || null;
  const actorName = event.actorCharacterName.trim();
  const priceText = formatCopperCurrency(event.price);

  if (event.eventType === 'TRADER_SELL') {
    if (watchedIsActor) {
      return counterpartyName
        ? `${watchedDisplayName} sold ${event.itemName} for ${priceText} to ${counterpartyName}.`
        : `${watchedDisplayName} sold ${event.itemName} for ${priceText}.`;
    }

    if (watchedIsCounterparty) {
      return `${watchedDisplayName} bought ${event.itemName} for ${priceText} from ${actorName}.`;
    }
  }

  if (event.eventType === 'TRADER_PURCHASE') {
    if (watchedIsActor) {
      return counterpartyName
        ? `${watchedDisplayName} bought ${event.itemName} for ${priceText} from ${counterpartyName}.`
        : `${watchedDisplayName} bought ${event.itemName} for ${priceText}.`;
    }

    if (watchedIsCounterparty) {
      return `${watchedDisplayName} sold ${event.itemName} for ${priceText} to ${actorName}.`;
    }
  }

  return `${watchedDisplayName} traded ${event.itemName} for ${priceText}.`;
}

function formatTraderSaleLine(
  traderCharacterName: string,
  event: Pick<SaleEventInput, 'itemName' | 'price' | 'counterpartyCharacterName'>
): string {
  const traderDisplayName = traderCharacterName.trim();
  const buyerName = event.counterpartyCharacterName?.trim() || null;
  const priceText = formatCopperCurrency(event.price);

  return buyerName
    ? `${traderDisplayName} sold ${event.itemName} for ${priceText} to ${buyerName}.`
    : `${traderDisplayName} sold ${event.itemName} for ${priceText}.`;
}

function formatMarketSaleLine(
  event: Pick<SaleEventInput, 'actorCharacterName' | 'itemName' | 'price' | 'counterpartyCharacterName'>
): string {
  return formatTraderSaleLine(event.actorCharacterName, event);
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

  const sellerEvents = events.filter((event) => event.eventType === 'TRADER_SELL');
  const itemIds = [...new Set(events.map((event) => event.itemId).filter((value): value is number => value != null))];
  const itemNames = [...new Set(events.map((event) => normalizeText(event.itemName)).filter(Boolean))];
  const characterNames = [
    ...new Set(
      events
        .flatMap((event) => [event.actorCharacterName, event.counterpartyCharacterName ?? null])
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
            itemNames.length > 0 ? { targetKey: { in: itemNames.map((name) => `item-name:${name}`) } } : undefined
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

  const itemLinesByUser = new Map<string, string[]>();
  const characterLinesByUser = new Map<string, string[]>();
  const traderLinesByUser = new Map<string, string[]>();
  const priceRuleLinesByUser = new Map<string, string[]>();
  const allSaleLines = sellerEvents.map((event) => formatMarketSaleLine(event));

  for (const favorite of favorites) {
    const settings = normalizeMarketFavoriteNotificationSettings(favorite);
    const matchingEvents = events.filter((event) => {
      if (favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS) {
        return (
          (favorite.itemId != null && event.itemId === favorite.itemId) ||
          normalizeText(favorite.itemName) === normalizeText(event.itemName)
        );
      }

      if (favorite.listType === MarketFavoriteListType.MY_TRADERS) {
        const normalizedFavoriteName = normalizeText(favorite.characterName);
        return (
          event.eventType === 'TRADER_SELL' &&
          normalizedFavoriteName === normalizeText(event.actorCharacterName)
        );
      }

      const normalizedFavoriteName = normalizeText(favorite.characterName);
      return (
        normalizedFavoriteName === normalizeText(event.actorCharacterName) ||
        normalizedFavoriteName === normalizeText(event.counterpartyCharacterName)
      );
    });

    if (matchingEvents.length === 0) {
      continue;
    }

    for (const event of matchingEvents) {
      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS &&
        settings.notifyOnTradeActivity !== false
      ) {
        const lines = itemLinesByUser.get(favorite.userId) ?? [];
        lines.push(
          `${event.itemName}: ${event.actorCharacterName} sold for ${formatCopperCurrency(event.price)}`
        );
        itemLinesByUser.set(favorite.userId, lines);
      }

      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS &&
        settings.maxTradePriceCopper != null &&
        event.price <= settings.maxTradePriceCopper
      ) {
        const lines = priceRuleLinesByUser.get(favorite.userId) ?? [];
        lines.push(
          `${event.itemName} traded at ${formatCopperCurrency(event.price)} (rule <= ${formatCopperCurrency(settings.maxTradePriceCopper)})`
        );
        priceRuleLinesByUser.set(favorite.userId, lines);
      }

      if (
        favorite.listType === MarketFavoriteListType.FAVORITE_CHARACTERS &&
        settings.notifyOnTradeActivity !== false
      ) {
        if (!favorite.characterName) {
          continue;
        }

        const lines = characterLinesByUser.get(favorite.userId) ?? [];
        lines.push(formatCharacterTradeLine(favorite.characterName, event));
        characterLinesByUser.set(favorite.userId, lines);
      }

      if (
        favorite.listType === MarketFavoriteListType.MY_TRADERS &&
        settings.notifyOnTradeActivity !== false
      ) {
        if (!favorite.characterName) {
          continue;
        }

        const lines = traderLinesByUser.get(favorite.userId) ?? [];
        lines.push(formatTraderSaleLine(favorite.characterName, event));
        traderLinesByUser.set(favorite.userId, lines);
      }
    }
  }

  const allSaleNotificationUserIds =
    allSaleLines.length > 0
      ? await listUserIdsWithEnabledNotificationPreference({
          scopeType: 'GLOBAL',
          scopeId: 'global',
          eventKey: 'market.all.trade_activity'
        })
      : [];

  await Promise.all([
    ...allSaleNotificationUserIds.map((userId) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.all.trade_activity',
        payload: { lines: allSaleLines } as Prisma.InputJsonValue,
        dedupeSeed: sellerEvents.map((event) => String(event.eqLogId)).join(',')
      })
    ),
    ...[...itemLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.item.trade_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: events.map((event) => String(event.eqLogId)).join(',')
      })
    ),
    ...[...characterLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.character.trade_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: events.map((event) => String(event.eqLogId)).join(',')
      })
    ),
    ...[...traderLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.trader.trade_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: events.map((event) => String(event.eqLogId)).join(',')
      })
    ),
    ...[...priceRuleLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.item.price_rule_triggered',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: events.map((event) => String(event.eqLogId)).join(',')
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

  const itemLinesByUser = new Map<string, string[]>();
  const characterLinesByUser = new Map<string, string[]>();
  const traderListingLinesByUser = new Map<string, string[]>();
  const traderUndercutLinesByUser = new Map<string, string[]>();
  const itemPriceRuleLinesByUser = new Map<string, string[]>();

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
        const isNewOrChanged = !previous || previous.price !== listing.price;
        if (isNewOrChanged && settings.notifyOnListingActivity !== false) {
          const lines = itemLinesByUser.get(favorite.userId) ?? [];
          lines.push(
            `${buildListingChangeEmoji(previous?.price, listing.price)} ${listing.itemName} listed by ${listing.sellerCharacterName} for ${formatCopperCurrency(listing.price)}${formatListingPriceChange(previous?.price, listing.price)}`
          );
          itemLinesByUser.set(favorite.userId, lines);
        }

        if (
          settings.maxListingPriceCopper != null &&
          listing.price <= settings.maxListingPriceCopper
        ) {
          const lines = itemPriceRuleLinesByUser.get(favorite.userId) ?? [];
          lines.push(
            `${listing.itemName} listed at ${formatCopperCurrency(listing.price)} (rule <= ${formatCopperCurrency(settings.maxListingPriceCopper)})`
          );
          itemPriceRuleLinesByUser.set(favorite.userId, lines);
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
          const lines = characterLinesByUser.get(favorite.userId) ?? [];
          lines.push(formatCharacterListingLine(favorite.characterName, listing, previous?.price));
          characterLinesByUser.set(favorite.userId, lines);
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
            const lines = traderListingLinesByUser.get(favorite.userId) ?? [];
            lines.push(
              `${buildListingChangeEmoji(previous?.price, listing.price)} ${favorite.characterName}: ${listing.itemName} at ${formatCopperCurrency(listing.price)}${formatListingPriceChange(previous?.price, listing.price)}`
            );
            traderListingLinesByUser.set(favorite.userId, lines);
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

          const lines = traderUndercutLinesByUser.get(favorite.userId) ?? [];
          lines.push(
            `${favorite.characterName}: ${listing.itemName} is now undercut at ${formatCopperCurrency(listing.price)}`
          );
          traderUndercutLinesByUser.set(favorite.userId, lines);
        }
      }
    }
  }

  const dedupeSeed = syncedAt.toISOString();

  await Promise.all([
    ...[...itemLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.item.listing_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: `${dedupeSeed}:item-listings`
      })
    ),
    ...[...characterLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.character.listing_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: `${dedupeSeed}:character-listings`
      })
    ),
    ...[...traderListingLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.trader.listing_activity',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: `${dedupeSeed}:trader-listings`
      })
    ),
    ...[...traderUndercutLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.trader.undercut',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: `${dedupeSeed}:trader-undercut`
      })
    ),
    ...[...itemPriceRuleLinesByUser.entries()].map(([userId, lines]) =>
      queueUserNotification({
        userId,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'market.item.price_rule_triggered',
        payload: { lines } as Prisma.InputJsonValue,
        dedupeSeed: `${dedupeSeed}:item-price-rules`
      })
    )
  ]);
}
