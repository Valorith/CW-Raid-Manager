import { createHash } from 'crypto';
import { prisma } from '../utils/prisma.js';
import { recordKillForTrackedNpc } from './npcRespawnService.js';
function normalizeNpcName(name) {
    return name.replace(/\s+/g, ' ').trim();
}
function normalizeKillerName(name) {
    if (!name) {
        return null;
    }
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function buildSignature(npcNameNormalized, occurredAt, rawLine) {
    const hash = createHash('sha1');
    hash.update(npcNameNormalized);
    hash.update('|');
    hash.update(occurredAt.toISOString());
    if (rawLine) {
        hash.update('|');
        hash.update(rawLine.trim());
    }
    return hash.digest('hex');
}
function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
export async function recordRaidNpcKills(raidId, guildId, kills, logger) {
    if (kills.length === 0) {
        return { inserted: 0 };
    }
    const prepared = kills
        .map((entry) => {
        const normalizedName = normalizeNpcName(entry.npcName ?? '');
        if (!normalizedName) {
            return null;
        }
        if (!(entry.occurredAt instanceof Date) || Number.isNaN(entry.occurredAt.getTime())) {
            return null;
        }
        const npcNameNormalized = normalizedName.toLowerCase();
        const signature = buildSignature(npcNameNormalized, entry.occurredAt, entry.rawLine);
        return {
            raidId,
            guildId,
            npcName: normalizedName,
            npcNameNormalized,
            killerName: normalizeKillerName(entry.killerName),
            occurredAt: entry.occurredAt,
            logSignature: signature,
            zoneName: entry.zoneName?.trim() || null
        };
    })
        .filter((entry) => Boolean(entry));
    if (prepared.length === 0) {
        return { inserted: 0 };
    }
    const raidContext = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: {
            id: true,
            name: true,
            guild: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    // Build lookup of NPCs from the respawn tracker that are flagged as raid targets for webhook triggering
    const raidTargetNpcs = await prisma.npcDefinition.findMany({
        where: {
            guildId,
            isRaidTarget: true
        },
        select: {
            npcName: true,
            npcNameNormalized: true
        }
    });
    const raidTargetNpcLookup = new Map();
    for (const npc of raidTargetNpcs) {
        raidTargetNpcLookup.set(npc.npcNameNormalized, npc.npcName);
    }
    const signatures = prepared.map((entry) => entry.logSignature);
    let uniqueEntries = prepared;
    console.log('[recordRaidNpcKills] Processing NPC kills:', {
        raidId,
        guildId,
        preparedCount: prepared.length,
        preparedKills: prepared.slice(0, 5).map(e => ({ npcName: e.npcName, signature: e.logSignature.substring(0, 8) }))
    });
    if (signatures.length > 0) {
        const existing = await prisma.raidNpcKillEvent.findMany({
            where: {
                raidId,
                logSignature: {
                    in: signatures
                }
            },
            select: { logSignature: true }
        });
        console.log('[recordRaidNpcKills] Duplicate check result:', {
            raidId,
            existingCount: existing.length,
            existingSignatures: existing.slice(0, 5).map(e => e.logSignature.substring(0, 8))
        });
        const seen = new Set(existing.map((item) => item.logSignature));
        uniqueEntries = [];
        for (const entry of prepared) {
            if (seen.has(entry.logSignature)) {
                continue;
            }
            seen.add(entry.logSignature);
            uniqueEntries.push(entry);
        }
        console.log('[recordRaidNpcKills] After filtering duplicates:', {
            uniqueCount: uniqueEntries.length
        });
    }
    // Also check total count in database for this raid
    const totalInDb = await prisma.raidNpcKillEvent.count({ where: { raidId } });
    console.log('[recordRaidNpcKills] Total kills in DB for this raid:', totalInDb);
    let inserted = 0;
    if (uniqueEntries.length > 0) {
        for (const chunk of chunkArray(uniqueEntries, 100)) {
            try {
                const result = await prisma.raidNpcKillEvent.createMany({
                    data: chunk,
                    skipDuplicates: true
                });
                inserted += result.count;
            }
            catch (error) {
                logger?.warn({ error, errorMessage: String(error) }, 'Failed to persist NPC kill chunk.');
            }
        }
    }
    // Record kills in the NPC Respawn Tracker for any tracked NPCs
    // This happens regardless of Discord webhook settings
    // IMPORTANT: Process ALL prepared kills, not just newly inserted ones!
    // A kill might already be in RaidNpcKillEvent but not yet in the respawn tracker
    // (e.g., if the respawn tracker recording failed or was skipped previously)
    // The respawn tracker service has its own deduplication logic
    const pendingClarifications = [];
    const pendingZoneClarifications = [];
    if (prepared.length > 0) {
        logger?.info?.({ count: prepared.length }, 'Processing kills for respawn tracker');
        for (const entry of prepared) {
            try {
                logger?.info?.({
                    npcName: entry.npcName,
                    npcNameNormalized: entry.npcNameNormalized,
                    zoneName: entry.zoneName,
                    killedAt: entry.occurredAt
                }, 'Attempting to record kill in respawn tracker');
                const result = await recordKillForTrackedNpc(guildId, {
                    npcName: entry.npcName,
                    npcNameNormalized: entry.npcNameNormalized,
                    killedAt: entry.occurredAt,
                    killedByName: entry.killerName,
                    zoneName: entry.zoneName
                });
                logger?.info?.({
                    npcName: entry.npcName,
                    recorded: result.recorded,
                    needsInstanceClarification: result.needsInstanceClarification,
                    needsZoneClarification: result.needsZoneClarification
                }, 'Respawn tracker result');
                if (result.needsInstanceClarification && result.npcDefinitionId && result.npcName && result.killedAt) {
                    const clarificationId = `${guildId}-${result.npcDefinitionId}-${result.killedAt.toISOString()}`;
                    // Add to response array first (before database save which might fail)
                    pendingClarifications.push({
                        id: clarificationId,
                        npcDefinitionId: result.npcDefinitionId,
                        npcName: result.npcName,
                        killedAt: result.killedAt.toISOString(),
                        killedByName: result.killedByName ?? null
                    });
                    // Try to persist to database (non-blocking)
                    try {
                        await prisma.pendingNpcKillClarification.upsert({
                            where: { id: clarificationId },
                            create: {
                                id: clarificationId,
                                guildId,
                                raidId,
                                clarificationType: 'instance',
                                npcName: result.npcName,
                                killedAt: result.killedAt,
                                killedByName: result.killedByName ?? null,
                                npcDefinitionId: result.npcDefinitionId
                            },
                            update: {} // Don't update if already exists
                        });
                        // Limit to 2 most recent pending clarifications per NPC definition
                        // This prevents the user from having to action many clarifications for the same NPC
                        const existingClarifications = await prisma.pendingNpcKillClarification.findMany({
                            where: {
                                guildId,
                                npcDefinitionId: result.npcDefinitionId,
                                resolvedAt: null
                            },
                            orderBy: { killedAt: 'desc' },
                            select: { id: true }
                        });
                        // If more than 2, soft-delete the older ones
                        if (existingClarifications.length > 2) {
                            const idsToResolve = existingClarifications.slice(2).map(c => c.id);
                            await prisma.pendingNpcKillClarification.updateMany({
                                where: { id: { in: idsToResolve } },
                                data: { resolvedAt: new Date() }
                            });
                        }
                    }
                    catch (dbError) {
                        logger?.warn?.({ error: dbError, npcName: entry.npcName }, 'Failed to persist pending clarification to database');
                    }
                }
                else if (result.needsZoneClarification && result.zoneOptions && result.npcName && result.killedAt) {
                    const clarificationId = `${guildId}-zone-${result.npcName.toLowerCase()}-${result.killedAt.toISOString()}`;
                    // Add to response array first (before database save which might fail)
                    pendingZoneClarifications.push({
                        id: clarificationId,
                        npcName: result.npcName,
                        killedAt: result.killedAt.toISOString(),
                        killedByName: result.killedByName ?? null,
                        zoneOptions: result.zoneOptions
                    });
                    // Try to persist to database (non-blocking)
                    try {
                        await prisma.pendingNpcKillClarification.upsert({
                            where: { id: clarificationId },
                            create: {
                                id: clarificationId,
                                guildId,
                                raidId,
                                clarificationType: 'zone',
                                npcName: result.npcName,
                                killedAt: result.killedAt,
                                killedByName: result.killedByName ?? null,
                                zoneOptions: result.zoneOptions
                            },
                            update: {} // Don't update if already exists
                        });
                        // Limit to 2 most recent pending zone clarifications per NPC name
                        // This prevents the user from having to action many clarifications for the same NPC
                        const existingZoneClarifications = await prisma.pendingNpcKillClarification.findMany({
                            where: {
                                guildId,
                                npcName: result.npcName,
                                clarificationType: 'zone',
                                resolvedAt: null
                            },
                            orderBy: { killedAt: 'desc' },
                            select: { id: true }
                        });
                        // If more than 2, soft-delete the older ones
                        if (existingZoneClarifications.length > 2) {
                            const idsToResolve = existingZoneClarifications.slice(2).map(c => c.id);
                            await prisma.pendingNpcKillClarification.updateMany({
                                where: { id: { in: idsToResolve } },
                                data: { resolvedAt: new Date() }
                            });
                        }
                    }
                    catch (dbError) {
                        logger?.warn?.({ error: dbError, npcName: entry.npcName }, 'Failed to persist pending zone clarification to database');
                    }
                }
            }
            catch (error) {
                // Log error and continue - NPC may not be tracked in respawn tracker
                logger?.warn?.({ error, npcName: entry.npcName }, 'Failed to record kill in respawn tracker');
            }
        }
    }
    return { inserted, pendingClarifications, pendingZoneClarifications };
}
export async function listRaidNpcKillSummary(raidId) {
    const grouped = await prisma.raidNpcKillEvent.groupBy({
        by: ['npcName', 'zoneName'],
        where: { raidId },
        _count: { raidId: true },
        orderBy: [
            { _count: { raidId: 'desc' } },
            { npcName: 'asc' },
            { zoneName: 'asc' }
        ]
    });
    return grouped.map((row) => ({
        npcName: row.npcName,
        zoneName: row.zoneName,
        killCount: row._count?.raidId ?? 0
    }));
}
export async function listRaidNpcKillEvents(raidId) {
    const events = await prisma.raidNpcKillEvent.findMany({
        where: { raidId },
        orderBy: { occurredAt: 'asc' },
        select: {
            npcName: true,
            killerName: true,
            occurredAt: true
        }
    });
    return events.map((event) => ({
        npcName: event.npcName,
        killerName: event.killerName,
        occurredAt: event.occurredAt
    }));
}
export async function deleteRaidNpcKillEvents(raidId, guildId) {
    await prisma.raidNpcKillEvent.deleteMany({
        where: {
            raidId,
            guildId
        }
    });
}
