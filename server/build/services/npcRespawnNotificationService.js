/**
 * NPC Respawn Notification Service
 *
 * This service handles checking NPC respawn status and sending Discord webhook
 * notifications when raid targets enter their respawn window or become "up".
 *
 * Called by the cron job (cronSnapshot.ts) on a regular interval (e.g., every 5 minutes).
 */
import { prisma } from '../utils/prisma.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
// Logger for this service
const logger = {
    info: (message, ...args) => console.log(`[NpcRespawnNotification] ${message}`, ...args),
    error: (message, ...args) => console.error(`[NpcRespawnNotification] ${message}`, ...args),
    debug: (message, ...args) => console.log(`[NpcRespawnNotification] ${message}`, ...args)
};
/**
 * Calculate respawn status for an NPC based on last kill time and respawn timers.
 * Mirrors the logic in npcRespawnService.ts
 */
function calculateRespawnStatus(killedAt, respawnMinMinutes, respawnMaxMinutes, now = new Date()) {
    let respawnStatus = 'unknown';
    let respawnMinTime = null;
    let respawnMaxTime = null;
    if (killedAt && respawnMinMinutes !== null) {
        const killedTime = killedAt.getTime();
        respawnMinTime = new Date(killedTime + respawnMinMinutes * 60 * 1000);
        if (respawnMaxMinutes !== null) {
            respawnMaxTime = new Date(killedTime + respawnMaxMinutes * 60 * 1000);
        }
        if (now >= (respawnMaxTime ?? respawnMinTime)) {
            respawnStatus = 'up';
        }
        else if (now >= respawnMinTime) {
            respawnStatus = 'window';
        }
        else {
            respawnStatus = 'down';
        }
    }
    return { respawnStatus, respawnMinTime, respawnMaxTime };
}
/**
 * Check all guilds for NPC respawn notifications and send webhooks.
 * This is the main entry point called by the cron job.
 */
export async function checkAndSendRespawnNotifications() {
    const now = new Date();
    logger.info(`Starting respawn notification check at ${now.toISOString()}`);
    // Find all guilds that have at least one webhook subscribed to respawn events
    const guildsWithRespawnWebhooks = await prisma.guild.findMany({
        where: {
            discordWebhooks: {
                some: {
                    isEnabled: true,
                    webhookUrl: { not: null }
                }
            }
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
            }
        }
    });
    logger.debug(`Found ${guildsWithRespawnWebhooks.length} guild(s) with enabled webhooks`);
    // Filter to guilds that actually have respawn event subscriptions
    const guildsToProcess = guildsWithRespawnWebhooks.filter((guild) => {
        return guild.discordWebhooks.some((webhook) => {
            const subs = webhook.eventSubscriptions;
            const hasRespawnSubs = subs?.['respawn.windowOpen'] === true || subs?.['respawn.up'] === true;
            if (hasRespawnSubs) {
                logger.debug(`Guild ${guild.name} has respawn webhook subscriptions`);
            }
            return hasRespawnSubs;
        });
    });
    if (guildsToProcess.length === 0) {
        logger.info('No guilds with respawn webhook subscriptions found. Make sure you have enabled "Respawn Window Open" or "NPC Is Up" events in your Discord webhook settings.');
        return;
    }
    logger.info(`Processing respawn notifications for ${guildsToProcess.length} guild(s)...`);
    for (const guild of guildsToProcess) {
        try {
            await processGuildRespawnNotifications(guild.id, guild.name, now);
        }
        catch (error) {
            logger.error(`Error processing guild ${guild.id}:`, error);
        }
    }
    logger.info('Respawn notification check complete.');
}
/**
 * Process respawn notifications for a single guild.
 */
async function processGuildRespawnNotifications(guildId, guildName, now) {
    // Get all raid target NPCs with respawn times configured
    const npcDefinitions = await prisma.npcDefinition.findMany({
        where: {
            guildId,
            isRaidTarget: true,
            respawnMinMinutes: { not: null }
        },
        select: {
            id: true,
            npcName: true,
            zoneName: true,
            respawnMinMinutes: true,
            respawnMaxMinutes: true,
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
    logger.debug(`Found ${npcDefinitions.length} raid target NPC(s) with respawn times for guild ${guildName}`);
    if (npcDefinitions.length === 0) {
        logger.debug(`No raid target NPCs with respawn times configured for guild ${guildName}`);
        return;
    }
    // Build list of NPCs to check (handling instance variants separately)
    const npcsToCheck = [];
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
                isInstanceVariant: true,
                lastKillRecordId: lastInstanceKill?.id ?? null,
                killedAt: lastInstanceKill?.killedAt ?? null,
                guildId,
                guildName
            });
        }
        else {
            // Regular NPC
            const lastKill = def.killRecords[0] ?? null;
            npcsToCheck.push({
                npcDefinitionId: def.id,
                npcName: def.npcName,
                zoneName: def.zoneName,
                respawnMinMinutes: def.respawnMinMinutes,
                respawnMaxMinutes: def.respawnMaxMinutes,
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
    const notificationMap = new Map(existingNotifications.map((n) => [`${n.npcDefinitionId}:${n.isInstanceVariant}`, n]));
    // Check each NPC for state transitions
    const windowOpenNpcs = [];
    const upNpcs = [];
    for (const npc of npcsWithKills) {
        const key = `${npc.npcDefinitionId}:${npc.isInstanceVariant}`;
        const existing = notificationMap.get(key);
        const status = calculateRespawnStatus(npc.killedAt, npc.respawnMinMinutes, npc.respawnMaxMinutes, now);
        // Check if this is a new kill cycle (different kill record than what we tracked)
        const isNewKillCycle = existing?.lastKillRecordId !== npc.lastKillRecordId;
        logger.debug(`NPC ${npc.npcName}: status=${status.respawnStatus}, killedAt=${npc.killedAt?.toISOString()}, minTime=${status.respawnMinTime?.toISOString()}, maxTime=${status.respawnMaxTime?.toISOString()}, now=${now.toISOString()}`);
        logger.debug(`NPC ${npc.npcName}: isNewKillCycle=${isNewKillCycle}, hasExisting=${!!existing}, existingWindowNotified=${!!existing?.windowNotifiedAt}, existingUpNotified=${!!existing?.upNotifiedAt}`);
        if (status.respawnStatus === 'window') {
            // Check if we should send window notification
            const shouldNotify = !existing || isNewKillCycle || !existing.windowNotifiedAt;
            logger.debug(`NPC ${npc.npcName}: window status - shouldNotify=${shouldNotify}`);
            if (shouldNotify) {
                windowOpenNpcs.push(npc);
            }
        }
        else if (status.respawnStatus === 'up') {
            // Check if we should send up notification
            const shouldNotify = !existing || isNewKillCycle || !existing.upNotifiedAt;
            logger.debug(`NPC ${npc.npcName}: up status - shouldNotify=${shouldNotify}`);
            if (shouldNotify) {
                upNpcs.push(npc);
            }
        }
    }
    logger.debug(`NPCs to notify: windowOpen=${windowOpenNpcs.length}, up=${upNpcs.length}`);
    // Send window open notifications
    if (windowOpenNpcs.length > 0) {
        const windowPayloadNpcs = windowOpenNpcs.map((npc) => {
            const status = calculateRespawnStatus(npc.killedAt, npc.respawnMinMinutes, npc.respawnMaxMinutes, now);
            return {
                npcName: npc.npcName,
                zoneName: npc.zoneName,
                isInstance: npc.isInstanceVariant,
                killedAt: npc.killedAt,
                windowOpenTime: status.respawnMinTime,
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
            await upsertNotificationTracking(npc.npcDefinitionId, npc.isInstanceVariant, npc.lastKillRecordId, { windowNotifiedAt: now });
        }
        logger.info(`Sent window open notification for ${windowOpenNpcs.length} NPC(s) in guild ${guildId}`);
    }
    // Send up notifications
    if (upNpcs.length > 0) {
        const upPayloadNpcs = upNpcs.map((npc) => {
            const status = calculateRespawnStatus(npc.killedAt, npc.respawnMinMinutes, npc.respawnMaxMinutes, now);
            return {
                npcName: npc.npcName,
                zoneName: npc.zoneName,
                isInstance: npc.isInstanceVariant,
                killedAt: npc.killedAt,
                upSinceTime: status.respawnMaxTime ?? status.respawnMinTime
            };
        });
        await emitDiscordWebhookEvent(guildId, 'respawn.up', {
            guildId,
            guildName,
            npcs: upPayloadNpcs
        });
        // Update notification tracking
        for (const npc of upNpcs) {
            await upsertNotificationTracking(npc.npcDefinitionId, npc.isInstanceVariant, npc.lastKillRecordId, { upNotifiedAt: now });
        }
        logger.info(`Sent up notification for ${upNpcs.length} NPC(s) in guild ${guildId}`);
    }
}
/**
 * Upsert notification tracking record.
 */
async function upsertNotificationTracking(npcDefinitionId, isInstanceVariant, lastKillRecordId, updates) {
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
        }
        else {
            // Same kill cycle - just update the specific notification time
            await prisma.npcRespawnNotification.update({
                where: { id: existing.id },
                data: updates
            });
        }
    }
    else {
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
export async function resetRespawnNotification(npcDefinitionId, isInstanceVariant, newKillRecordId) {
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
    }
    catch (error) {
        logger.error('Failed to reset respawn notification tracking:', error);
    }
}
