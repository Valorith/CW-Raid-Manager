/**
 * NPC Respawn Notification Service
 *
 * This service handles checking NPC respawn status and sending Discord webhook
 * notifications when raid targets enter their respawn window or become "up".
 *
 * Called by the cron job (cronSnapshot.ts) on a regular interval (e.g., every 5 minutes).
 */

import { emitDiscordWebhookEvent } from './discordWebhookService.js';
import {
  buildNotificationDeliveryDedupeKey,
  queueUserNotification
} from './userNotificationService.js';
import { prisma } from '../utils/prisma.js';

// Logger for this service
const logger = {
  info: (message: string, ...args: unknown[]) => console.log(`[NpcRespawnNotification] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[NpcRespawnNotification] ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[NpcRespawnNotification] ${message}`, ...args)
};

type RespawnStatus = 'unknown' | 'up' | 'window' | 'down';

interface NpcWithRespawnData {
  npcDefinitionId: string;
  npcName: string;
  zoneName: string | null;
  respawnMinMinutes: number | null;
  respawnMaxMinutes: number | null;
  isRaidTarget: boolean;
  isInstanceVariant: boolean;
  lastKillRecordId: string | null;
  killedAt: Date | null;
  guildId: string;
  guildName: string;
}

interface RespawnStatusResult {
  respawnStatus: RespawnStatus;
  respawnMinTime: Date | null;
  respawnMaxTime: Date | null;
}

type NpcSubscriptionRecord = {
  userId: string;
  npcDefinitionId: string;
  isInstanceVariant: boolean;
  notifyMinutes: number;
};

export type RespawnTelegramQueueResult = {
  queued: number;
  dedupeKey: string | null;
};

function buildTelegramDedupeKey(options: {
  userId: string;
  guildId: string;
  eventKey: 'npc.respawn.window_open' | 'npc.respawn.up';
  dedupeSeed: string;
}): string {
  return buildNotificationDeliveryDedupeKey({
    userId: options.userId,
    scopeType: 'GUILD',
    scopeId: options.guildId,
    provider: 'TELEGRAM',
    eventKey: options.eventKey,
    dedupeSeed: options.dedupeSeed
  });
}

/**
 * Calculate respawn status for an NPC based on last kill time and respawn timers.
 * Mirrors the logic in npcRespawnService.ts
 */
function calculateRespawnStatus(
  killedAt: Date | null,
  respawnMinMinutes: number | null,
  respawnMaxMinutes: number | null,
  now: Date = new Date()
): RespawnStatusResult {
  let respawnStatus: RespawnStatus = 'unknown';
  let respawnMinTime: Date | null = null;
  let respawnMaxTime: Date | null = null;

  if (killedAt && respawnMinMinutes !== null) {
    const killedTime = killedAt.getTime();
    respawnMinTime = new Date(killedTime + respawnMinMinutes * 60 * 1000);

    if (respawnMaxMinutes !== null) {
      respawnMaxTime = new Date(killedTime + respawnMaxMinutes * 60 * 1000);
    }

    if (now >= (respawnMaxTime ?? respawnMinTime)) {
      respawnStatus = 'up';
    } else if (now >= respawnMinTime) {
      respawnStatus = 'window';
    } else {
      respawnStatus = 'down';
    }
  }

  return { respawnStatus, respawnMinTime, respawnMaxTime };
}

function buildNpcVariantKey(npcDefinitionId: string, isInstanceVariant: boolean) {
  return `${npcDefinitionId}:${isInstanceVariant}`;
}

function buildRespawnNotificationDedupeSeed(
  killRecordId: string,
  npcDefinitionId: string,
  isInstanceVariant: boolean
): string {
  return `${killRecordId}:${npcDefinitionId}:${isInstanceVariant}`;
}

function buildWindowEnteredRespawnNotificationDedupeSeed(
  killRecordId: string,
  npcDefinitionId: string,
  isInstanceVariant: boolean
): string {
  return `${buildRespawnNotificationDedupeSeed(killRecordId, npcDefinitionId, isInstanceVariant)}:window-entered`;
}

async function queueRespawnUserNotifications(options: {
  guildId: string;
  guildName: string;
  now: Date;
  npcs: Array<NpcWithRespawnData & { status: RespawnStatusResult }>;
  subscriptionsByVariant: Map<string, NpcSubscriptionRecord[]>;
}): Promise<void> {
  const { guildId, guildName, now, npcs, subscriptionsByVariant } = options;

  for (const npc of npcs) {
    const subscriptions =
      subscriptionsByVariant.get(buildNpcVariantKey(npc.npcDefinitionId, npc.isInstanceVariant)) ??
      [];

    if (subscriptions.length === 0 || !npc.lastKillRecordId) {
      continue;
    }

    for (const subscription of subscriptions) {
      if (npc.status.respawnMinTime && npc.status.respawnStatus === 'down') {
        const thresholdTime = new Date(
          npc.status.respawnMinTime.getTime() - subscription.notifyMinutes * 60 * 1000
        );

        if (now >= thresholdTime) {
          const minutesUntilWindow = Math.max(
            0,
            Math.ceil((npc.status.respawnMinTime.getTime() - now.getTime()) / 60000)
          );

          await queueUserNotification({
            userId: subscription.userId,
            scopeType: 'GUILD',
            scopeId: guildId,
            eventKey: 'npc.respawn.window_open',
            payload: {
              guildId,
              guildName,
              npcName: npc.npcName,
              zoneName: npc.zoneName,
              isInstanceVariant: npc.isInstanceVariant,
              killRecordId: npc.lastKillRecordId,
              respawnMinTime: npc.status.respawnMinTime.toISOString(),
              respawnMaxTime: npc.status.respawnMaxTime?.toISOString() ?? null,
              minutesUntilWindow
            },
            dedupeSeed: buildRespawnNotificationDedupeSeed(
              npc.lastKillRecordId,
              npc.npcDefinitionId,
              npc.isInstanceVariant
            ),
            providers: ['TELEGRAM']
          });
        }
      }

      if (npc.status.respawnMinTime && npc.status.respawnStatus === 'window') {
        await queueUserNotification({
          userId: subscription.userId,
          scopeType: 'GUILD',
          scopeId: guildId,
          eventKey: 'npc.respawn.window_open',
          payload: {
            guildId,
            guildName,
            npcName: npc.npcName,
            zoneName: npc.zoneName,
            isInstanceVariant: npc.isInstanceVariant,
            killRecordId: npc.lastKillRecordId,
            respawnMinTime: npc.status.respawnMinTime.toISOString(),
            respawnMaxTime: npc.status.respawnMaxTime?.toISOString() ?? null,
            minutesUntilWindow: 0
          },
          dedupeSeed: buildWindowEnteredRespawnNotificationDedupeSeed(
            npc.lastKillRecordId,
            npc.npcDefinitionId,
            npc.isInstanceVariant
          ),
          providers: ['TELEGRAM']
        });
      }

      if (npc.status.respawnStatus === 'up') {
        await queueUserNotification({
          userId: subscription.userId,
          scopeType: 'GUILD',
          scopeId: guildId,
          eventKey: 'npc.respawn.up',
          payload: {
            guildId,
            guildName,
            npcName: npc.npcName,
            zoneName: npc.zoneName,
            isInstanceVariant: npc.isInstanceVariant,
            killRecordId: npc.lastKillRecordId,
            upSinceTime:
              (npc.status.respawnMaxTime ?? npc.status.respawnMinTime)?.toISOString() ?? null
          },
          dedupeSeed: buildRespawnNotificationDedupeSeed(
            npc.lastKillRecordId,
            npc.npcDefinitionId,
            npc.isInstanceVariant
          ),
          providers: ['TELEGRAM']
        });
      }
    }
  }
}

export async function queueRespawnTelegramNotificationForUser(options: {
  userId: string;
  guildId: string;
  npcDefinitionId: string;
  isInstanceVariant: boolean;
}): Promise<RespawnTelegramQueueResult> {
  const subscription = await prisma.npcRespawnSubscription.findUnique({
    where: {
      npcDefinitionId_userId_isInstanceVariant: {
        npcDefinitionId: options.npcDefinitionId,
        userId: options.userId,
        isInstanceVariant: options.isInstanceVariant
      }
    },
    select: {
      userId: true,
      isEnabled: true,
      telegramNotificationsEnabled: true,
      notifyMinutes: true,
      npcDefinition: {
        select: {
          id: true,
          guildId: true,
          npcName: true,
          zoneName: true,
          respawnMinMinutes: true,
          respawnMaxMinutes: true,
          guild: {
            select: {
              name: true
            }
          },
          killRecords: {
            orderBy: { killedAt: 'desc' },
            take: 10,
            select: {
              id: true,
              killedAt: true,
              isInstance: true
            }
          }
        }
      }
    }
  });

  if (
    !subscription?.isEnabled ||
    !subscription.telegramNotificationsEnabled ||
    subscription.npcDefinition.guildId !== options.guildId
  ) {
    return { queued: 0, dedupeKey: null };
  }

  const npc = subscription.npcDefinition;
  const lastKill =
    npc.killRecords.find((kill) => Boolean(kill.isInstance) === options.isInstanceVariant) ?? null;
  if (!lastKill || npc.respawnMinMinutes === null) {
    return { queued: 0, dedupeKey: null };
  }

  const now = new Date();
  const status = calculateRespawnStatus(
    lastKill.killedAt,
    npc.respawnMinMinutes,
    npc.respawnMaxMinutes,
    now
  );

  if (status.respawnMinTime && status.respawnStatus === 'down') {
    const thresholdTime = new Date(
      status.respawnMinTime.getTime() - subscription.notifyMinutes * 60 * 1000
    );

    if (now < thresholdTime) {
      return { queued: 0, dedupeKey: null };
    }

    const minutesUntilWindow = Math.max(
      0,
      Math.ceil((status.respawnMinTime.getTime() - now.getTime()) / 60000)
    );

    const eventKey = 'npc.respawn.window_open';
    const dedupeSeed = buildRespawnNotificationDedupeSeed(
      lastKill.id,
      npc.id,
      options.isInstanceVariant
    );
    const queued = await queueUserNotification({
      userId: subscription.userId,
      scopeType: 'GUILD',
      scopeId: options.guildId,
      eventKey,
      payload: {
        guildId: options.guildId,
        guildName: npc.guild.name,
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        isInstanceVariant: options.isInstanceVariant,
        killRecordId: lastKill.id,
        respawnMinTime: status.respawnMinTime.toISOString(),
        respawnMaxTime: status.respawnMaxTime?.toISOString() ?? null,
        minutesUntilWindow
      },
      dedupeSeed,
      providers: ['TELEGRAM']
    });
    return {
      queued,
      dedupeKey: buildTelegramDedupeKey({
        userId: subscription.userId,
        guildId: options.guildId,
        eventKey,
        dedupeSeed
      })
    };
  }

  if (status.respawnMinTime && status.respawnStatus === 'window') {
    const eventKey = 'npc.respawn.window_open';
    const dedupeSeed = buildWindowEnteredRespawnNotificationDedupeSeed(
      lastKill.id,
      npc.id,
      options.isInstanceVariant
    );
    const queued = await queueUserNotification({
      userId: subscription.userId,
      scopeType: 'GUILD',
      scopeId: options.guildId,
      eventKey,
      payload: {
        guildId: options.guildId,
        guildName: npc.guild.name,
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        isInstanceVariant: options.isInstanceVariant,
        killRecordId: lastKill.id,
        respawnMinTime: status.respawnMinTime.toISOString(),
        respawnMaxTime: status.respawnMaxTime?.toISOString() ?? null,
        minutesUntilWindow: 0
      },
      dedupeSeed,
      providers: ['TELEGRAM']
    });
    return {
      queued,
      dedupeKey: buildTelegramDedupeKey({
        userId: subscription.userId,
        guildId: options.guildId,
        eventKey,
        dedupeSeed
      })
    };
  }

  if (status.respawnStatus === 'up') {
    const eventKey = 'npc.respawn.up';
    const dedupeSeed = buildRespawnNotificationDedupeSeed(
      lastKill.id,
      npc.id,
      options.isInstanceVariant
    );
    const queued = await queueUserNotification({
      userId: subscription.userId,
      scopeType: 'GUILD',
      scopeId: options.guildId,
      eventKey,
      payload: {
        guildId: options.guildId,
        guildName: npc.guild.name,
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        isInstanceVariant: options.isInstanceVariant,
        killRecordId: lastKill.id,
        upSinceTime: (status.respawnMaxTime ?? status.respawnMinTime)?.toISOString() ?? null
      },
      dedupeSeed,
      providers: ['TELEGRAM']
    });
    return {
      queued,
      dedupeKey: buildTelegramDedupeKey({
        userId: subscription.userId,
        guildId: options.guildId,
        eventKey,
        dedupeSeed
      })
    };
  }

  return { queued: 0, dedupeKey: null };
}

/**
 * Check all guilds for NPC respawn notifications and send webhooks/messenger alerts.
 * This is the main entry point called by the cron job.
 */
export async function checkAndSendRespawnNotifications(): Promise<void> {
  const now = new Date();
  logger.info(`Starting respawn notification check at ${now.toISOString()}`);

  const guildsWithRespawnNotifications = await prisma.guild.findMany({
    where: {
      OR: [
        {
          discordWebhooks: {
            some: {
              isEnabled: true,
              webhookUrl: { not: null }
            }
          }
        },
        {
          npcDefinitions: {
            some: {
              respawnMinMinutes: { not: null },
              subscriptions: {
                some: {
                  isEnabled: true,
                  telegramNotificationsEnabled: true
                }
              }
            }
          }
        }
      ]
    },
    select: {
      id: true,
      name: true,
      discordWebhooks: {
        where: {
          isEnabled: true,
          webhookUrl: { not: null }
        },
        select: {
          eventSubscriptions: true
        }
      },
      npcDefinitions: {
        where: {
          respawnMinMinutes: { not: null },
          subscriptions: {
            some: {
              isEnabled: true,
              telegramNotificationsEnabled: true
            }
          }
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  logger.debug(
    `Found ${guildsWithRespawnNotifications.length} guild(s) with respawn notification signals`
  );

  const guildsToProcess = guildsWithRespawnNotifications.filter((guild) => {
    const hasWebhookSubscriptions = guild.discordWebhooks.some((webhook) => {
      const subs = webhook.eventSubscriptions as Record<string, boolean> | null;
      return subs?.['respawn.windowOpen'] === true || subs?.['respawn.up'] === true;
    });
    const hasUserSubscriptions = guild.npcDefinitions.length > 0;

    if (hasWebhookSubscriptions) {
      logger.debug(`Guild ${guild.name} has respawn webhook subscriptions`);
    }
    if (hasUserSubscriptions) {
      logger.debug(`Guild ${guild.name} has user respawn subscriptions`);
    }

    return hasWebhookSubscriptions || hasUserSubscriptions;
  });

  if (guildsToProcess.length === 0) {
    logger.info('No guilds with respawn webhook subscriptions or user NPC respawn subscriptions found.');
    return;
  }

  logger.info(`Processing respawn notifications for ${guildsToProcess.length} guild(s)...`);

  for (const guild of guildsToProcess) {
    try {
      await processGuildRespawnNotifications(guild.id, guild.name, now);
    } catch (error) {
      logger.error(`Error processing guild ${guild.id}:`, error);
    }
  }

  logger.info('Respawn notification check complete.');
}

/**
 * Process respawn notifications for a single guild.
 */
async function processGuildRespawnNotifications(
  guildId: string,
  guildName: string,
  now: Date
): Promise<void> {
  // Get raid target NPCs for Discord plus any personally subscribed NPCs for messenger alerts.
  const npcDefinitions = await prisma.npcDefinition.findMany({
    where: {
      guildId,
      respawnMinMinutes: { not: null },
      OR: [
        {
          isRaidTarget: true
        },
        {
          subscriptions: {
            some: {
              isEnabled: true,
              telegramNotificationsEnabled: true
            }
          }
        }
      ]
    },
    select: {
      id: true,
      npcName: true,
      zoneName: true,
      respawnMinMinutes: true,
      respawnMaxMinutes: true,
      isRaidTarget: true,
      hasInstanceVersion: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 10, // Get recent kills to handle both instance and overworld
        select: {
          id: true,
          killedAt: true,
          isInstance: true
        }
      }
    }
  });

  logger.debug(`Found ${npcDefinitions.length} respawn-tracked NPC(s) with notification signals for guild ${guildName}`);

  if (npcDefinitions.length === 0) {
    logger.debug(`No respawn-tracked NPCs with notification signals for guild ${guildName}`);
    return;
  }

  // Build list of NPCs to check (handling instance variants separately)
  const npcsToCheck: NpcWithRespawnData[] = [];

  for (const def of npcDefinitions) {
    if (def.hasInstanceVersion) {
      // Separate overworld and instance kills
      const lastOverworldKill = def.killRecords.find((k) => !k.isInstance) ?? null;
      const lastInstanceKill = def.killRecords.find((k) => k.isInstance) ?? null;

      // Overworld variant
      npcsToCheck.push({
        npcDefinitionId: def.id,
        npcName: def.npcName,
        zoneName: def.zoneName,
        respawnMinMinutes: def.respawnMinMinutes,
        respawnMaxMinutes: def.respawnMaxMinutes,
        isRaidTarget: def.isRaidTarget,
        isInstanceVariant: false,
        lastKillRecordId: lastOverworldKill?.id ?? null,
        killedAt: lastOverworldKill?.killedAt ?? null,
        guildId,
        guildName
      });

      // Instance variant
      npcsToCheck.push({
        npcDefinitionId: def.id,
        npcName: def.npcName,
        zoneName: def.zoneName,
        respawnMinMinutes: def.respawnMinMinutes,
        respawnMaxMinutes: def.respawnMaxMinutes,
        isRaidTarget: def.isRaidTarget,
        isInstanceVariant: true,
        lastKillRecordId: lastInstanceKill?.id ?? null,
        killedAt: lastInstanceKill?.killedAt ?? null,
        guildId,
        guildName
      });
    } else {
      // Regular NPC
      const lastKill = def.killRecords[0] ?? null;
      npcsToCheck.push({
        npcDefinitionId: def.id,
        npcName: def.npcName,
        zoneName: def.zoneName,
        respawnMinMinutes: def.respawnMinMinutes,
        respawnMaxMinutes: def.respawnMaxMinutes,
        isRaidTarget: def.isRaidTarget,
        isInstanceVariant: false,
        lastKillRecordId: lastKill?.id ?? null,
        killedAt: lastKill?.killedAt ?? null,
        guildId,
        guildName
      });
    }
  }

  // Filter to only NPCs with a kill record (we can't track respawn without knowing when it died)
  const npcsWithKills = npcsToCheck.filter((npc) => npc.killedAt !== null && npc.lastKillRecordId !== null);

  logger.debug(`${npcsWithKills.length} NPC(s) have kill records to check`);

  if (npcsWithKills.length === 0) {
    logger.debug('No NPCs with kill records to process');
    return;
  }

  // Get existing notification tracking records
  const existingNotifications = await prisma.npcRespawnNotification.findMany({
    where: {
      npcDefinitionId: { in: npcsWithKills.map((n) => n.npcDefinitionId) }
    }
  });

  const notificationMap = new Map(
    existingNotifications.map((n) => [`${n.npcDefinitionId}:${n.isInstanceVariant}`, n])
  );
  const activeSubscriptions = await prisma.npcRespawnSubscription.findMany({
    where: {
      npcDefinitionId: { in: npcsWithKills.map((npc) => npc.npcDefinitionId) },
      isEnabled: true,
      telegramNotificationsEnabled: true
    },
    select: {
      userId: true,
      npcDefinitionId: true,
      isInstanceVariant: true,
      notifyMinutes: true
    }
  });
  const subscriptionsByVariant = new Map<string, NpcSubscriptionRecord[]>();

  for (const subscription of activeSubscriptions) {
    const key = buildNpcVariantKey(subscription.npcDefinitionId, subscription.isInstanceVariant);
    const current = subscriptionsByVariant.get(key) ?? [];
    current.push(subscription);
    subscriptionsByVariant.set(key, current);
  }

  // Check each NPC for state transitions
  const windowOpenNpcs: NpcWithRespawnData[] = [];
  const upNpcs: NpcWithRespawnData[] = [];
  const messengerCandidateNpcs: Array<NpcWithRespawnData & { status: RespawnStatusResult }> = [];

  for (const npc of npcsWithKills) {
    const key = `${npc.npcDefinitionId}:${npc.isInstanceVariant}`;
    const existing = notificationMap.get(key);
    const status = calculateRespawnStatus(
      npc.killedAt,
      npc.respawnMinMinutes,
      npc.respawnMaxMinutes,
      now
    );

    // Check if this is a new kill cycle (different kill record than what we tracked)
    const isNewKillCycle = existing?.lastKillRecordId !== npc.lastKillRecordId;

    logger.debug(`NPC ${npc.npcName}: status=${status.respawnStatus}, killedAt=${npc.killedAt?.toISOString()}, minTime=${status.respawnMinTime?.toISOString()}, maxTime=${status.respawnMaxTime?.toISOString()}, now=${now.toISOString()}`);
    logger.debug(`NPC ${npc.npcName}: isNewKillCycle=${isNewKillCycle}, hasExisting=${!!existing}, existingWindowNotified=${!!existing?.windowNotifiedAt}, existingUpNotified=${!!existing?.upNotifiedAt}`);

    if (
      subscriptionsByVariant.has(buildNpcVariantKey(npc.npcDefinitionId, npc.isInstanceVariant)) &&
      (status.respawnStatus === 'down' ||
        status.respawnStatus === 'window' ||
        status.respawnStatus === 'up')
    ) {
      messengerCandidateNpcs.push({
        ...npc,
        status
      });
    }

    if (npc.isRaidTarget && status.respawnStatus === 'window') {
      // Check if we should send window notification
      const shouldNotify = !existing || isNewKillCycle || !existing.windowNotifiedAt;
      logger.debug(`NPC ${npc.npcName}: window status - shouldNotify=${shouldNotify}`);
      if (shouldNotify) {
        windowOpenNpcs.push(npc);
      }
    } else if (npc.isRaidTarget && status.respawnStatus === 'up') {
      // Check if we should send up notification
      const shouldNotify = !existing || isNewKillCycle || !existing.upNotifiedAt;
      logger.debug(`NPC ${npc.npcName}: up status - shouldNotify=${shouldNotify}`);
      if (shouldNotify) {
        upNpcs.push(npc);
      }
    }
  }

  logger.debug(`NPCs to notify: windowOpen=${windowOpenNpcs.length}, up=${upNpcs.length}`);

  if (messengerCandidateNpcs.length > 0) {
    await queueRespawnUserNotifications({
      guildId,
      guildName,
      now,
      npcs: messengerCandidateNpcs,
      subscriptionsByVariant
    });
  }

  // Send window open notifications
  if (windowOpenNpcs.length > 0) {
    const windowPayloadNpcs = windowOpenNpcs.map((npc) => {
      const status = calculateRespawnStatus(
        npc.killedAt,
        npc.respawnMinMinutes,
        npc.respawnMaxMinutes,
        now
      );
      return {
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        isInstance: npc.isInstanceVariant,
        killedAt: npc.killedAt!,
        windowOpenTime: status.respawnMinTime!,
        windowCloseTime: status.respawnMaxTime
      };
    });

    await emitDiscordWebhookEvent(guildId, 'respawn.windowOpen', {
      guildId,
      guildName,
      npcs: windowPayloadNpcs
    });

    // Update notification tracking
    for (const npc of windowOpenNpcs) {
      await upsertNotificationTracking(
        npc.npcDefinitionId,
        npc.isInstanceVariant,
        npc.lastKillRecordId!,
        { windowNotifiedAt: now }
      );
    }

    logger.info(`Sent window open notification for ${windowOpenNpcs.length} NPC(s) in guild ${guildId}`);
  }

  // Send up notifications
  if (upNpcs.length > 0) {
    const upPayloadNpcs = upNpcs.map((npc) => {
      const status = calculateRespawnStatus(
        npc.killedAt,
        npc.respawnMinMinutes,
        npc.respawnMaxMinutes,
        now
      );
      return {
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        isInstance: npc.isInstanceVariant,
        killedAt: npc.killedAt!,
        upSinceTime: status.respawnMaxTime ?? status.respawnMinTime!
      };
    });

    await emitDiscordWebhookEvent(guildId, 'respawn.up', {
      guildId,
      guildName,
      npcs: upPayloadNpcs
    });

    // Update notification tracking
    for (const npc of upNpcs) {
      await upsertNotificationTracking(
        npc.npcDefinitionId,
        npc.isInstanceVariant,
        npc.lastKillRecordId!,
        { upNotifiedAt: now }
      );
    }

    logger.info(`Sent up notification for ${upNpcs.length} NPC(s) in guild ${guildId}`);
  }
}

/**
 * Upsert notification tracking record.
 */
async function upsertNotificationTracking(
  npcDefinitionId: string,
  isInstanceVariant: boolean,
  lastKillRecordId: string,
  updates: { windowNotifiedAt?: Date; upNotifiedAt?: Date }
): Promise<void> {
  const existing = await prisma.npcRespawnNotification.findUnique({
    where: {
      npcDefinitionId_isInstanceVariant: {
        npcDefinitionId,
        isInstanceVariant
      }
    }
  });

  if (existing) {
    // Check if we need to reset due to new kill cycle
    if (existing.lastKillRecordId !== lastKillRecordId) {
      // New kill - reset all notification times
      await prisma.npcRespawnNotification.update({
        where: { id: existing.id },
        data: {
          lastKillRecordId,
          windowNotifiedAt: updates.windowNotifiedAt ?? null,
          upNotifiedAt: updates.upNotifiedAt ?? null
        }
      });
    } else {
      // Same kill cycle - just update the specific notification time
      await prisma.npcRespawnNotification.update({
        where: { id: existing.id },
        data: updates
      });
    }
  } else {
    // Create new tracking record
    await prisma.npcRespawnNotification.create({
      data: {
        npcDefinitionId,
        isInstanceVariant,
        lastKillRecordId,
        windowNotifiedAt: updates.windowNotifiedAt ?? null,
        upNotifiedAt: updates.upNotifiedAt ?? null
      }
    });
  }
}

/**
 * Reset notification tracking when a new kill is recorded.
 * Called from the npcRespawn routes when a kill is added.
 */
export async function resetRespawnNotification(
  npcDefinitionId: string,
  isInstanceVariant: boolean,
  newKillRecordId: string
): Promise<void> {
  try {
    await prisma.npcRespawnNotification.upsert({
      where: {
        npcDefinitionId_isInstanceVariant: {
          npcDefinitionId,
          isInstanceVariant
        }
      },
      create: {
        npcDefinitionId,
        isInstanceVariant,
        lastKillRecordId: newKillRecordId,
        windowNotifiedAt: null,
        upNotifiedAt: null
      },
      update: {
        lastKillRecordId: newKillRecordId,
        windowNotifiedAt: null,
        upNotifiedAt: null
      }
    });
  } catch (error) {
    logger.error('Failed to reset respawn notification tracking:', error);
  }
}
