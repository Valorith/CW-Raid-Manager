import { createHash, randomBytes } from 'crypto';

import {
  NotificationProvider,
  NotificationScopeType,
  type Prisma,
  type UserNotificationChannel,
  type UserNotificationPreference
} from '@prisma/client';

import {
  DEFAULT_PROVIDER_TARGETS,
  ADMIN_NOTIFICATION_EVENT_DEFINITIONS,
  GUILD_NOTIFICATION_EVENT_DEFINITIONS,
  MARKET_NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_DEFINITION_MAP,
  type NotificationProviderKey,
  type NotificationScopeTypeKey,
  type ProviderTargets
} from './notificationConstants.js';
import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const GLOBAL_SCOPE_ID = 'global';
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

type ChannelMetadata = {
  linkTokenHash?: string;
  linkTokenExpiresAt?: string;
  onboardingStartedAt?: string;
  onlyNewUndercutListingIds?: string[];
};

export interface NotificationChannelConnection {
  id: string;
  provider: NotificationProviderKey;
  status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | 'FAILED';
  displayLabel: string | null;
  externalUserId: string | null;
  externalChatId: string | null;
  externalPhone: string | null;
  verifiedAt: string | null;
  lastInboundAt: string | null;
  lastTestedAt: string | null;
}

export interface NotificationProviderAvailability {
  provider: NotificationProviderKey;
  isAvailable: boolean;
  unavailableReason: string | null;
}

export interface NotificationLinkSession {
  provider: NotificationProviderKey;
  status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | 'FAILED';
  deepLinkUrl: string;
  fallbackText: string;
  expiresAt: string;
}

export interface NotificationPreferenceSummary {
  scopeType: NotificationScopeTypeKey;
  scopeId: string;
  scopeLabel: string;
  eventKey: string;
  eventLabel: string;
  eventDescription: string;
  recommended: boolean;
  isEnabled: boolean;
  providerTargets: ProviderTargets;
}

export interface QueueUserNotificationInput {
  userId: string;
  scopeType: NotificationScopeTypeKey;
  scopeId: string;
  eventKey: string;
  payload: Prisma.InputJsonValue;
  dedupeSeed: string;
  deliverAt?: Date;
  providers?: NotificationProviderKey[];
}

export function buildNotificationDeliveryDedupeKey(input: {
  userId: string;
  scopeType: NotificationScopeTypeKey;
  scopeId: string;
  provider: NotificationProviderKey;
  eventKey: string;
  dedupeSeed: string;
}): string {
  return `${input.eventKey}:${input.provider}:${input.userId}:${input.scopeType}:${input.scopeId}:${input.dedupeSeed}`;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseChannelMetadata(value: unknown): ChannelMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as ChannelMetadata;
}

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeProviderTargets(value: unknown): ProviderTargets {
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const targets = parsed as Record<string, unknown>;

  return {
    TELEGRAM:
      typeof targets.TELEGRAM === 'boolean'
        ? targets.TELEGRAM
        : DEFAULT_PROVIDER_TARGETS.TELEGRAM ?? false,
    WHATSAPP:
      typeof targets.WHATSAPP === 'boolean'
        ? targets.WHATSAPP
        : DEFAULT_PROVIDER_TARGETS.WHATSAPP ?? false
  };
}

function serializeChannel(channel: UserNotificationChannel): NotificationChannelConnection {
  return {
    id: channel.id,
    provider: channel.provider,
    status: channel.status,
    displayLabel: channel.displayLabel ?? null,
    externalUserId: channel.externalUserId ?? null,
    externalChatId: channel.externalChatId ?? null,
    externalPhone: channel.externalPhone ?? null,
    verifiedAt: toIso(channel.verifiedAt),
    lastInboundAt: toIso(channel.lastInboundAt),
    lastTestedAt: toIso(channel.lastTestedAt)
  };
}

async function ensureNotificationIdentityAvailable(options: {
  provider: NotificationProvider;
  externalChatId?: string | null;
  externalPhone?: string | null;
  excludeChannelId: string;
}): Promise<void> {
  const conflict = await prisma.userNotificationChannel.findFirst({
    where: {
      provider: options.provider,
      id: {
        not: options.excludeChannelId
      },
      OR: [
        options.externalChatId
          ? {
              externalChatId: options.externalChatId
            }
          : undefined,
        options.externalPhone
          ? {
              externalPhone: options.externalPhone
            }
          : undefined
      ].filter(Boolean) as Prisma.UserNotificationChannelWhereInput[]
    }
  });

  if (conflict) {
    throw new Error('That messenger account is already linked to another CW Nexus user.');
  }
}

async function upsertPendingChannel(
  userId: string,
  provider: NotificationProvider,
  token: string
): Promise<UserNotificationChannel> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);
  const tokenHash = hashLinkToken(token);

  return prisma.userNotificationChannel.upsert({
    where: {
      userId_provider: {
        userId,
        provider
      }
    },
    create: {
      userId,
      provider,
      status: 'PENDING',
      metadata: {
        linkTokenHash: tokenHash,
        linkTokenExpiresAt: expiresAt.toISOString(),
        onboardingStartedAt: now.toISOString()
      }
    },
    update: {
      status: 'PENDING',
      metadata: {
        linkTokenHash: tokenHash,
        linkTokenExpiresAt: expiresAt.toISOString(),
        onboardingStartedAt: now.toISOString()
      }
    }
  });
}

async function findChannelByLinkToken(
  provider: NotificationProvider,
  token: string
): Promise<UserNotificationChannel | null> {
  const tokenHash = hashLinkToken(token);
  const channels = await prisma.userNotificationChannel.findMany({
    where: {
      provider,
      status: {
        in: ['PENDING', 'FAILED', 'ACTIVE']
      }
    }
  });

  for (const channel of channels) {
    const metadata = parseChannelMetadata(channel.metadata);
    if (metadata.linkTokenHash !== tokenHash) {
      continue;
    }

    if (!metadata.linkTokenExpiresAt) {
      continue;
    }

    if (new Date(metadata.linkTokenExpiresAt).getTime() < Date.now()) {
      continue;
    }

    return channel;
  }

  return null;
}

export async function listNotificationChannels(
  userId: string
): Promise<NotificationChannelConnection[]> {
  const channels = await prisma.userNotificationChannel.findMany({
    where: { userId },
    orderBy: { provider: 'asc' }
  });

  return channels.map(serializeChannel);
}

export function listNotificationProviderAvailability(): NotificationProviderAvailability[] {
  return [
    {
      provider: 'TELEGRAM',
      isAvailable: Boolean(appConfig.telegram),
      unavailableReason: appConfig.telegram
        ? null
        : 'Telegram notifications are not enabled on this server yet.'
    },
    {
      provider: 'WHATSAPP',
      isAvailable: Boolean(appConfig.whatsapp),
      unavailableReason: appConfig.whatsapp
        ? null
        : 'WhatsApp notifications are not enabled on this server yet.'
    }
  ];
}

export function getNotificationProviderUnavailableReason(
  provider: NotificationProviderKey
): string | null {
  if (provider === 'TELEGRAM') {
    return appConfig.telegram ? null : 'Telegram notifications are not enabled on this server yet.';
  }

  if (provider === 'WHATSAPP') {
    return appConfig.whatsapp ? null : 'WhatsApp notifications are not enabled on this server yet.';
  }

  return 'This notification provider is not enabled on this server yet.';
}

export async function createTelegramLinkSession(userId: string): Promise<NotificationLinkSession> {
  if (!appConfig.telegram?.botUsername) {
    throw new Error('Telegram is not configured.');
  }

  const token = randomBytes(24).toString('hex');
  const channel = await upsertPendingChannel(userId, NotificationProvider.TELEGRAM, token);
  const metadata = parseChannelMetadata(channel.metadata);
  const expiresAt = metadata.linkTokenExpiresAt ?? new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString();

  return {
    provider: 'TELEGRAM',
    status: channel.status,
    deepLinkUrl: `https://t.me/${appConfig.telegram.botUsername}?start=${token}`,
    fallbackText: `/start ${token}`,
    expiresAt
  };
}

export async function createWhatsappLinkSession(userId: string): Promise<NotificationLinkSession> {
  if (!appConfig.whatsapp?.phoneNumber) {
    throw new Error('WhatsApp is not configured.');
  }

  const token = randomBytes(24).toString('hex');
  const channel = await upsertPendingChannel(userId, NotificationProvider.WHATSAPP, token);
  const metadata = parseChannelMetadata(channel.metadata);
  const expiresAt = metadata.linkTokenExpiresAt ?? new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString();
  const fallbackText = `CONNECT ${token}`;

  return {
    provider: 'WHATSAPP',
    status: channel.status,
    deepLinkUrl: `https://wa.me/${appConfig.whatsapp.phoneNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
      fallbackText
    )}`,
    fallbackText,
    expiresAt
  };
}

export async function disconnectNotificationChannel(
  userId: string,
  provider: NotificationProviderKey
): Promise<void> {
  await prisma.userNotificationChannel.upsert({
    where: {
      userId_provider: {
        userId,
        provider
      }
    },
    create: {
      userId,
      provider,
      status: 'DISCONNECTED'
    },
    update: {
      status: 'DISCONNECTED',
      externalUserId: null,
      externalChatId: null,
      externalPhone: null,
      displayLabel: null,
      metadata: {},
      verifiedAt: null,
      lastInboundAt: null
    }
  });
}

export async function markNotificationChannelFailed(
  userId: string,
  provider: NotificationProviderKey,
  message: string
): Promise<void> {
  await prisma.userNotificationChannel.updateMany({
    where: {
      userId,
      provider
    },
    data: {
      status: 'FAILED',
      metadata: {
        error: message
      }
    }
  });
}

export async function activateTelegramChannel(options: {
  token: string;
  telegramUserId: string;
  telegramChatId: string;
  displayLabel: string;
}): Promise<NotificationChannelConnection | null> {
  const channel = await findChannelByLinkToken(NotificationProvider.TELEGRAM, options.token);
  if (!channel) {
    return null;
  }

  await ensureNotificationIdentityAvailable({
    provider: NotificationProvider.TELEGRAM,
    externalChatId: options.telegramChatId,
    excludeChannelId: channel.id
  });

  const now = new Date();
  const updated = await prisma.userNotificationChannel.update({
    where: { id: channel.id },
    data: {
      status: 'ACTIVE',
      externalUserId: options.telegramUserId,
      externalChatId: options.telegramChatId,
      displayLabel: options.displayLabel,
      metadata: {},
      verifiedAt: now,
      lastInboundAt: now
    }
  });

  return serializeChannel(updated);
}

export async function activateWhatsappChannel(options: {
  token: string;
  externalPhone: string;
  externalUserId?: string | null;
  displayLabel?: string | null;
}): Promise<NotificationChannelConnection | null> {
  const channel = await findChannelByLinkToken(NotificationProvider.WHATSAPP, options.token);
  if (!channel) {
    return null;
  }

  await ensureNotificationIdentityAvailable({
    provider: NotificationProvider.WHATSAPP,
    externalPhone: options.externalPhone,
    excludeChannelId: channel.id
  });

  const now = new Date();
  const updated = await prisma.userNotificationChannel.update({
    where: { id: channel.id },
    data: {
      status: 'ACTIVE',
      externalUserId: options.externalUserId ?? null,
      externalPhone: options.externalPhone,
      displayLabel: options.displayLabel ?? options.externalPhone,
      metadata: {},
      verifiedAt: now,
      lastInboundAt: now
    }
  });

  return serializeChannel(updated);
}

export async function listNotificationPreferences(
  userId: string
): Promise<NotificationPreferenceSummary[]> {
  const [user, guilds, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { admin: true }
    }),
    prisma.guildMembership.findMany({
      where: { userId },
      select: {
        guildId: true,
        guild: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.userNotificationPreference.findMany({
      where: { userId }
    })
  ]);

  const rowMap = new Map(
    rows.map((row) => [
      `${row.scopeType}:${row.scopeId}:${row.eventKey}`,
      row
    ])
  );

  const summaries: NotificationPreferenceSummary[] = [];

  for (const definition of MARKET_NOTIFICATION_EVENT_DEFINITIONS) {
    const row = rowMap.get(`${NotificationScopeType.GLOBAL}:${GLOBAL_SCOPE_ID}:${definition.key}`);
    summaries.push(buildPreferenceSummary(definition, 'GLOBAL', GLOBAL_SCOPE_ID, 'Account', row));
  }

  if (user?.admin) {
    for (const definition of ADMIN_NOTIFICATION_EVENT_DEFINITIONS) {
      const row = rowMap.get(`${NotificationScopeType.GLOBAL}:${GLOBAL_SCOPE_ID}:${definition.key}`);
      summaries.push(buildPreferenceSummary(definition, 'GLOBAL', GLOBAL_SCOPE_ID, 'Admin', row));
    }
  }

  for (const guild of guilds) {
    for (const definition of GUILD_NOTIFICATION_EVENT_DEFINITIONS) {
      const row = rowMap.get(`${NotificationScopeType.GUILD}:${guild.guildId}:${definition.key}`);
      summaries.push(
        buildPreferenceSummary(definition, 'GUILD', guild.guildId, guild.guild.name, row)
      );
    }
  }

  return summaries;
}

function buildPreferenceSummary(
  definition: { key: string; label: string; description: string; recommended: boolean },
  scopeType: NotificationScopeTypeKey,
  scopeId: string,
  scopeLabel: string,
  row: UserNotificationPreference | undefined
): NotificationPreferenceSummary {
  return {
    scopeType,
    scopeId,
    scopeLabel,
    eventKey: definition.key,
    eventLabel: definition.label,
    eventDescription: definition.description,
    recommended: definition.recommended,
    isEnabled: row?.isEnabled ?? definition.recommended,
    providerTargets: row
      ? normalizeProviderTargets(row.providerTargets)
      : normalizeProviderTargets(DEFAULT_PROVIDER_TARGETS)
  };
}

export async function updateNotificationPreferences(
  userId: string,
  updates: Array<{
    scopeType: NotificationScopeTypeKey;
    scopeId: string;
    eventKey: string;
    isEnabled: boolean;
    providerTargets?: ProviderTargets;
  }>
): Promise<NotificationPreferenceSummary[]> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { admin: true }
    }),
    prisma.guildMembership.findMany({
        where: { userId },
        select: { guildId: true }
      })
  ]);
  const guildIds = new Set(memberships.map((membership) => membership.guildId));

  for (const update of updates) {
    const definition = NOTIFICATION_EVENT_DEFINITION_MAP.get(update.eventKey);
    if (!definition) {
      throw new Error(`Unknown notification event "${update.eventKey}".`);
    }

    if (definition.scopeType !== update.scopeType) {
      throw new Error(`Event "${update.eventKey}" does not belong to ${update.scopeType}.`);
    }

    if (definition.adminOnly && !user?.admin) {
      throw new Error(`Event "${update.eventKey}" is only available to administrators.`);
    }

    if (update.scopeType === 'GLOBAL') {
      update.scopeId = GLOBAL_SCOPE_ID;
      continue;
    }

    if (!guildIds.has(update.scopeId)) {
      throw new Error('You do not have access to one or more selected guilds.');
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.userNotificationPreference.upsert({
        where: {
          userId_scopeType_scopeId_eventKey: {
            userId,
            scopeType: update.scopeType,
            scopeId: update.scopeId,
            eventKey: update.eventKey
          }
        },
        create: {
          userId,
          scopeType: update.scopeType,
          scopeId: update.scopeId,
          eventKey: update.eventKey,
          isEnabled: update.isEnabled,
          providerTargets: update.providerTargets ?? DEFAULT_PROVIDER_TARGETS
        },
        update: {
          isEnabled: update.isEnabled,
          providerTargets: update.providerTargets ?? DEFAULT_PROVIDER_TARGETS
        }
      })
    )
  );

  return listNotificationPreferences(userId);
}

export async function listUserIdsWithEnabledNotificationPreference(input: {
  scopeType: NotificationScopeTypeKey;
  scopeId: string;
  eventKey: string;
}): Promise<string[]> {
  const normalizedScopeId = input.scopeType === 'GLOBAL' ? GLOBAL_SCOPE_ID : input.scopeId;
  const rows = await prisma.userNotificationPreference.findMany({
    where: {
      scopeType: input.scopeType,
      scopeId: normalizedScopeId,
      eventKey: input.eventKey,
      isEnabled: true
    },
    select: {
      userId: true
    }
  });

  return rows.map((row) => row.userId);
}

export async function getActiveNotificationChannel(
  userId: string,
  provider: NotificationProviderKey
): Promise<UserNotificationChannel | null> {
  return prisma.userNotificationChannel.findFirst({
    where: {
      userId,
      provider,
      status: 'ACTIVE'
    }
  });
}

export async function markChannelTestMessageSent(
  userId: string,
  provider: NotificationProviderKey
): Promise<void> {
  await prisma.userNotificationChannel.updateMany({
    where: {
      userId,
      provider
    },
    data: {
      lastTestedAt: new Date()
    }
  });
}

export async function resolveNotificationTargets(input: {
  userId: string;
  scopeType: NotificationScopeTypeKey;
  scopeId: string;
  eventKey: string;
}): Promise<UserNotificationChannel[]> {
  const definition = NOTIFICATION_EVENT_DEFINITION_MAP.get(input.eventKey);
  if (!definition) {
    return [];
  }

  if (definition.adminOnly) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { admin: true }
    });
    if (!user?.admin) {
      return [];
    }
  }

  const normalizedScopeId = input.scopeType === 'GLOBAL' ? GLOBAL_SCOPE_ID : input.scopeId;
  const [channels, preference] = await Promise.all([
    prisma.userNotificationChannel.findMany({
      where: {
        userId: input.userId,
        status: 'ACTIVE'
      }
    }),
    prisma.userNotificationPreference.findUnique({
      where: {
        userId_scopeType_scopeId_eventKey: {
          userId: input.userId,
          scopeType: input.scopeType,
          scopeId: normalizedScopeId,
          eventKey: input.eventKey
        }
      }
    })
  ]);

  const isEnabled = preference?.isEnabled ?? definition.recommended;
  if (!isEnabled) {
    return [];
  }

  const providerTargets = preference
    ? normalizeProviderTargets(preference.providerTargets)
    : normalizeProviderTargets(DEFAULT_PROVIDER_TARGETS);

  return channels.filter(
    (channel) =>
      providerTargets[channel.provider] !== false &&
      getNotificationProviderUnavailableReason(channel.provider) === null
  );
}

export async function queueUserNotification(
  input: QueueUserNotificationInput
): Promise<number> {
  let targets = await resolveNotificationTargets({
    userId: input.userId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    eventKey: input.eventKey
  });

  if (input.providers && input.providers.length > 0) {
    const allowedProviders = new Set(input.providers);
    targets = targets.filter((channel) => allowedProviders.has(channel.provider));
  }

  if (targets.length === 0) {
    return 0;
  }

  const rows = targets.map((channel) => ({
    userId: input.userId,
    scopeType: input.scopeType,
    scopeId: input.scopeType === 'GLOBAL' ? GLOBAL_SCOPE_ID : input.scopeId,
    provider: channel.provider,
    eventKey: input.eventKey,
    payload: input.payload,
    deliverAt: input.deliverAt ?? new Date(),
    dedupeKey: buildNotificationDeliveryDedupeKey({
      userId: input.userId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      provider: channel.provider,
      eventKey: input.eventKey,
      dedupeSeed: input.dedupeSeed
    })
  }));

  const result = await prisma.notificationDelivery.createMany({
    data: rows,
    skipDuplicates: true
  });

  return result.count;
}

export { GLOBAL_SCOPE_ID };
