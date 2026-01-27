import { prisma } from '../utils/prisma.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { resetRespawnNotification } from './npcRespawnNotificationService.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
// Valid content flags for NPC definitions
export const NPC_CONTENT_FLAGS = ['Christmas', 'Halloween'];
// Helper functions
function normalizeNpcName(name) {
    // Collapse multiple spaces to single space, trim, and lowercase
    // Must match normalization in raidNpcKillService.ts for consistent lookups
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}
function normalizeAllaLink(input) {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol;
}
function formatNpcDefinition(record, lastKillOverride) {
    const lastKill = lastKillOverride !== undefined ? lastKillOverride : (record.killRecords[0] ?? null);
    return {
        id: record.id,
        guildId: record.guildId,
        npcName: record.npcName,
        npcNameNormalized: record.npcNameNormalized,
        zoneName: record.zoneName ?? null,
        respawnMinMinutes: record.respawnMinMinutes ?? null,
        respawnMaxMinutes: record.respawnMaxMinutes ?? null,
        isRaidTarget: record.isRaidTarget ?? false,
        hasInstanceVersion: record.hasInstanceVersion ?? false,
        contentFlag: record.contentFlag ?? null,
        notes: record.notes ?? null,
        allaLink: record.allaLink ?? null,
        createdById: record.createdById ?? null,
        createdByName: record.createdByName ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastKill: lastKill
            ? {
                id: lastKill.id,
                killedAt: lastKill.killedAt,
                killedByName: lastKill.killedByName ?? null,
                killedById: lastKill.killedById ?? null,
                notes: lastKill.notes ?? null,
                isInstance: lastKill.isInstance ?? false
            }
            : null
    };
}
function formatKillRecord(record) {
    return {
        id: record.id,
        guildId: record.guildId,
        npcDefinitionId: record.npcDefinitionId,
        npcName: record.npcDefinition.npcName,
        zoneName: record.npcDefinition.zoneName ?? null,
        respawnMinMinutes: record.npcDefinition.respawnMinMinutes ?? null,
        respawnMaxMinutes: record.npcDefinition.respawnMaxMinutes ?? null,
        killedAt: record.killedAt,
        killedByName: record.killedByName ?? null,
        killedById: record.killedById ?? null,
        notes: record.notes ?? null,
        isInstance: record.isInstance ?? false,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
    };
}
// NPC Definition CRUD operations
export async function listNpcDefinitions(guildId) {
    const definitions = await prisma.npcDefinition.findMany({
        where: { guildId },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 1
            }
        },
        orderBy: { npcName: 'asc' }
    });
    return definitions.map(def => formatNpcDefinition(def));
}
export async function getNpcDefinition(guildId, npcDefinitionId) {
    const definition = await prisma.npcDefinition.findFirst({
        where: { guildId, id: npcDefinitionId },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 1
            }
        }
    });
    return definition ? formatNpcDefinition(definition) : null;
}
export async function getNpcDefinitionByName(guildId, npcName) {
    const normalized = normalizeNpcName(npcName);
    const definition = await prisma.npcDefinition.findFirst({
        where: { guildId, npcNameNormalized: normalized },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 1
            }
        }
    });
    return definition ? formatNpcDefinition(definition) : null;
}
export async function createNpcDefinition(guildId, creator, input) {
    const npcName = input.npcName.trim();
    if (!npcName) {
        throw new Error('NPC name is required.');
    }
    const normalized = normalizeNpcName(npcName);
    // Check for duplicates - same name AND same zone is not allowed
    // Fetch all NPCs with same name and check zone programmatically to handle null/empty string differences
    const inputZone = input.zoneName?.trim() || null;
    const existingWithSameName = await prisma.npcDefinition.findMany({
        where: {
            guildId,
            npcNameNormalized: normalized
        }
    });
    const duplicate = existingWithSameName.find(npc => {
        const npcZone = npc.zoneName?.trim() || null;
        // Compare zones case-insensitively, treating null and empty string as equivalent
        if (inputZone === null && npcZone === null)
            return true;
        if (inputZone === null || npcZone === null)
            return false;
        return inputZone.toLowerCase() === npcZone.toLowerCase();
    });
    if (duplicate) {
        const existingZone = duplicate.zoneName || '(no zone)';
        const newZone = inputZone || '(no zone)';
        throw new Error(`An NPC named "${duplicate.npcName}" already exists in zone "${existingZone}". You tried to add it to zone "${newZone}".`);
    }
    const record = await prisma.npcDefinition.create({
        data: {
            guildId,
            npcName,
            npcNameNormalized: normalized,
            zoneName: input.zoneName?.trim() || null,
            respawnMinMinutes: input.respawnMinMinutes ?? null,
            respawnMaxMinutes: input.respawnMaxMinutes ?? null,
            isRaidTarget: input.isRaidTarget ?? false,
            hasInstanceVersion: input.hasInstanceVersion ?? false,
            contentFlag: input.contentFlag ?? null,
            notes: input.notes?.trim() || null,
            allaLink: normalizeAllaLink(input.allaLink),
            createdById: creator.userId,
            createdByName: creator.displayName
        },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 1
            }
        }
    });
    return formatNpcDefinition(record);
}
export async function updateNpcDefinition(guildId, npcDefinitionId, input) {
    const existing = await prisma.npcDefinition.findFirst({
        where: { guildId, id: npcDefinitionId }
    });
    if (!existing) {
        throw new Error('NPC definition not found.');
    }
    const npcName = input.npcName.trim();
    if (!npcName) {
        throw new Error('NPC name is required.');
    }
    const normalized = normalizeNpcName(npcName);
    // Check for duplicates if name or zone changed - same name AND same zone is not allowed
    // Fetch all other NPCs with same name and check zone programmatically
    const newZone = input.zoneName?.trim() || null;
    const existingZone = existing.zoneName?.trim() || null;
    const nameChanged = normalized !== existing.npcNameNormalized;
    const zoneChanged = newZone?.toLowerCase() !== existingZone?.toLowerCase();
    if (nameChanged || zoneChanged) {
        const othersWithSameName = await prisma.npcDefinition.findMany({
            where: {
                guildId,
                npcNameNormalized: normalized,
                id: { not: npcDefinitionId }
            }
        });
        const duplicate = othersWithSameName.find(npc => {
            const npcZone = npc.zoneName?.trim() || null;
            if (newZone === null && npcZone === null)
                return true;
            if (newZone === null || npcZone === null)
                return false;
            return newZone.toLowerCase() === npcZone.toLowerCase();
        });
        if (duplicate) {
            throw new Error('An NPC with this name already exists in this zone.');
        }
    }
    const updated = await prisma.npcDefinition.update({
        where: { id: npcDefinitionId },
        data: {
            npcName,
            npcNameNormalized: normalized,
            zoneName: input.zoneName?.trim() || null,
            respawnMinMinutes: input.respawnMinMinutes ?? null,
            respawnMaxMinutes: input.respawnMaxMinutes ?? null,
            isRaidTarget: input.isRaidTarget ?? false,
            hasInstanceVersion: input.hasInstanceVersion ?? false,
            contentFlag: input.contentFlag ?? null,
            notes: input.notes?.trim() || null,
            allaLink: normalizeAllaLink(input.allaLink)
        },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 1
            }
        }
    });
    return formatNpcDefinition(updated);
}
export async function deleteNpcDefinition(guildId, npcDefinitionId) {
    const existing = await prisma.npcDefinition.findFirst({
        where: { guildId, id: npcDefinitionId }
    });
    if (!existing) {
        return;
    }
    await prisma.npcDefinition.delete({ where: { id: npcDefinitionId } });
}
// NPC Kill Record operations
export async function listKillRecords(guildId, limit = 50) {
    const records = await prisma.npcKillRecord.findMany({
        where: { guildId },
        include: { npcDefinition: true },
        orderBy: { killedAt: 'desc' },
        take: limit
    });
    return records.map(formatKillRecord);
}
export async function listKillRecordsForNpc(guildId, npcDefinitionId, limit = 20) {
    const records = await prisma.npcKillRecord.findMany({
        where: { guildId, npcDefinitionId },
        include: { npcDefinition: true },
        orderBy: { killedAt: 'desc' },
        take: limit
    });
    return records.map(formatKillRecord);
}
export async function createKillRecord(guildId, input) {
    // Verify NPC definition exists and belongs to guild
    const definition = await prisma.npcDefinition.findFirst({
        where: { guildId, id: input.npcDefinitionId }
    });
    if (!definition) {
        throw new Error('NPC definition not found.');
    }
    const record = await prisma.npcKillRecord.create({
        data: {
            guildId,
            npcDefinitionId: input.npcDefinitionId,
            killedAt: input.killedAt,
            killedByName: input.killedByName?.trim() || null,
            killedById: input.killedById || null,
            notes: input.notes?.trim() || null,
            isInstance: input.isInstance ?? false
        },
        include: { npcDefinition: true }
    });
    return formatKillRecord(record);
}
export async function deleteKillRecord(guildId, killRecordId) {
    const existing = await prisma.npcKillRecord.findFirst({
        where: { guildId, id: killRecordId }
    });
    if (!existing) {
        return;
    }
    await prisma.npcKillRecord.delete({ where: { id: killRecordId } });
}
// Subscription operations
export async function getUserSubscriptions(userId, guildId) {
    const subscriptions = await prisma.npcRespawnSubscription.findMany({
        where: {
            userId,
            npcDefinition: { guildId }
        },
        include: {
            npcDefinition: {
                include: {
                    killRecords: {
                        orderBy: { killedAt: 'desc' },
                        take: 1
                    }
                }
            }
        }
    });
    return subscriptions.map((sub) => ({
        id: sub.id,
        npcDefinitionId: sub.npcDefinitionId,
        notifyMinutes: sub.notifyMinutes,
        isEnabled: sub.isEnabled,
        isInstanceVariant: sub.isInstanceVariant,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        npcDefinition: formatNpcDefinition(sub.npcDefinition)
    }));
}
export async function upsertSubscription(userId, input) {
    const isInstanceVariant = input.isInstanceVariant ?? false;
    const existing = await prisma.npcRespawnSubscription.findUnique({
        where: {
            npcDefinitionId_userId_isInstanceVariant: {
                npcDefinitionId: input.npcDefinitionId,
                userId,
                isInstanceVariant
            }
        }
    });
    if (existing) {
        return prisma.npcRespawnSubscription.update({
            where: { id: existing.id },
            data: {
                notifyMinutes: input.notifyMinutes ?? existing.notifyMinutes,
                isEnabled: input.isEnabled ?? existing.isEnabled
            }
        });
    }
    return prisma.npcRespawnSubscription.create({
        data: {
            npcDefinitionId: input.npcDefinitionId,
            userId,
            notifyMinutes: input.notifyMinutes ?? 5,
            isEnabled: input.isEnabled ?? true,
            isInstanceVariant
        }
    });
}
export async function deleteSubscription(userId, npcDefinitionId, isInstanceVariant = false) {
    const existing = await prisma.npcRespawnSubscription.findUnique({
        where: {
            npcDefinitionId_userId_isInstanceVariant: {
                npcDefinitionId,
                userId,
                isInstanceVariant
            }
        }
    });
    if (existing) {
        await prisma.npcRespawnSubscription.delete({ where: { id: existing.id } });
    }
}
// Record a kill for a tracked NPC (called automatically from raid NPC kill detection)
// Only records if the NPC is already configured in the respawn tracker
// For NPCs with hasInstanceVersion, does NOT auto-record - returns needsInstanceClarification=true instead
// If multiple NPCs have the same name (different zones), tries to match by zone from log
// If zone can't be determined, returns needsZoneClarification=true with zone options
export async function recordKillForTrackedNpc(guildId, input, options) {
    // Find all NPC definitions by normalized name (could be multiple in different zones)
    const definitions = await prisma.npcDefinition.findMany({
        where: {
            guildId,
            npcNameNormalized: input.npcNameNormalized
        }
    });
    console.log('[recordKillForTrackedNpc] Lookup result:', {
        guildId,
        npcName: input.npcName,
        npcNameNormalized: input.npcNameNormalized,
        zoneName: input.zoneName,
        definitionsFound: definitions.length,
        definitions: definitions.map(d => ({ id: d.id, npcName: d.npcName, npcNameNormalized: d.npcNameNormalized, zoneName: d.zoneName, hasInstanceVersion: d.hasInstanceVersion }))
    });
    if (definitions.length === 0) {
        // NPC is not tracked in the respawn tracker, skip
        console.log('[recordKillForTrackedNpc] NPC not found in respawn tracker');
        return { recorded: false, needsInstanceClarification: false };
    }
    let definition = definitions[0];
    // If multiple NPCs have the same name (different zones), try to match by zone
    if (definitions.length > 1) {
        if (input.zoneName) {
            // Try to find a matching zone (case-insensitive exact match first)
            const inputZone = input.zoneName.trim().toLowerCase();
            let matched = definitions.find((d) => d.zoneName && d.zoneName.trim().toLowerCase() === inputZone);
            // If no exact match, try fuzzy matching for common typos/variations
            if (!matched) {
                // Try partial matching - check if zone names are similar (handles typos like Drakkal vs Drakkel)
                matched = definitions.find((d) => {
                    if (!d.zoneName)
                        return false;
                    const defZone = d.zoneName.trim().toLowerCase();
                    // Check if one contains the other or if they share a significant prefix
                    if (defZone.includes(inputZone) || inputZone.includes(defZone)) {
                        return true;
                    }
                    // Check for similar zone names (same prefix, minor suffix differences)
                    // This handles cases like "Kael Drakkal" vs "Kael Drakkel"
                    const minLen = Math.min(defZone.length, inputZone.length);
                    if (minLen >= 5) {
                        // Count matching characters from the start
                        let matchingChars = 0;
                        for (let i = 0; i < minLen; i++) {
                            if (defZone[i] === inputZone[i]) {
                                matchingChars++;
                            }
                            else {
                                break;
                            }
                        }
                        // If at least 80% of the shorter string matches from the start, consider it a match
                        if (matchingChars >= minLen * 0.8) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            if (matched) {
                // Found a match by zone
                definition = matched;
            }
            else {
                // Zone from log doesn't match any configured zones - need user clarification
                return {
                    recorded: false,
                    needsInstanceClarification: false,
                    needsZoneClarification: true,
                    zoneOptions: definitions.map((d) => ({
                        npcDefinitionId: d.id,
                        zoneName: d.zoneName
                    })),
                    npcName: input.npcName,
                    killedAt: input.killedAt,
                    killedByName: input.killedByName
                };
            }
        }
        else {
            // No zone from log - need user clarification
            return {
                recorded: false,
                needsInstanceClarification: false,
                needsZoneClarification: true,
                zoneOptions: definitions.map((d) => ({
                    npcDefinitionId: d.id,
                    zoneName: d.zoneName
                })),
                npcName: input.npcName,
                killedAt: input.killedAt,
                killedByName: input.killedByName
            };
        }
    }
    // If NPC has instance version tracking, behavior depends on options
    console.log('[recordKillForTrackedNpc] Checking instance version:', {
        npcName: definition.npcName,
        hasInstanceVersion: definition.hasInstanceVersion,
        definitionId: definition.id
    });
    if (definition.hasInstanceVersion) {
        // Check if we already have a kill record for this exact time to avoid duplicates
        const existingKill = await prisma.npcKillRecord.findFirst({
            where: {
                guildId,
                npcDefinitionId: definition.id,
                killedAt: input.killedAt
            }
        });
        console.log('[recordKillForTrackedNpc] Existing kill check:', {
            hasExistingKill: !!existingKill,
            existingKillId: existingKill?.id ?? null,
            killedAt: input.killedAt
        });
        if (existingKill) {
            // Already recorded this kill
            return { recorded: true, needsInstanceClarification: false };
        }
        // If autoRecordAsOverworld is enabled, record as overworld without clarification
        // This is used for continuous monitoring where we don't want to interrupt with dialogs
        if (options?.autoRecordAsOverworld) {
            console.log('[recordKillForTrackedNpc] Auto-recording as overworld (hasInstanceVersion=true, autoRecordAsOverworld=true)');
            const killRecord = await prisma.npcKillRecord.create({
                data: {
                    guildId,
                    npcDefinitionId: definition.id,
                    killedAt: input.killedAt,
                    killedByName: input.killedByName?.trim() || null,
                    killedById: null,
                    notes: 'Auto-recorded from raid log (overworld)',
                    isInstance: false
                }
            });
            // Reset respawn notification tracking for this NPC (new kill = new respawn cycle)
            await resetRespawnNotification(definition.id, false, killRecord.id);
            // Trigger webhook for raid target NPCs
            if (definition.isRaidTarget) {
                const guild = await prisma.guild.findUnique({
                    where: { id: guildId },
                    select: { name: true }
                });
                await emitDiscordWebhookEvent(guildId, 'raid.targetKilled', {
                    guildName: guild?.name ?? 'Guild',
                    guildId,
                    kills: [{
                            npcName: definition.npcName,
                            killerName: input.killedByName ?? null,
                            occurredAt: input.killedAt
                        }]
                });
            }
            return { recorded: true, needsInstanceClarification: false };
        }
        // Needs clarification from user
        console.log('[recordKillForTrackedNpc] Returning needsInstanceClarification=true');
        return {
            recorded: false,
            needsInstanceClarification: true,
            npcDefinitionId: definition.id,
            npcName: definition.npcName,
            killedAt: input.killedAt,
            killedByName: input.killedByName
        };
    }
    // Check if we already have a kill record for this exact time
    // to avoid duplicates from multiple log uploads
    const existingKill = await prisma.npcKillRecord.findFirst({
        where: {
            guildId,
            npcDefinitionId: definition.id,
            killedAt: input.killedAt
        }
    });
    if (existingKill) {
        // Already recorded this kill
        return { recorded: true, needsInstanceClarification: false };
    }
    // Create the kill record (default to overworld for NPCs without instance tracking)
    const killRecord = await prisma.npcKillRecord.create({
        data: {
            guildId,
            npcDefinitionId: definition.id,
            killedAt: input.killedAt,
            killedByName: input.killedByName?.trim() || null,
            killedById: null,
            notes: 'Auto-recorded from raid log',
            isInstance: false
        }
    });
    // Reset respawn notification tracking for this NPC (new kill = new respawn cycle)
    await resetRespawnNotification(definition.id, false, killRecord.id);
    // Trigger webhook for raid target NPCs
    if (definition.isRaidTarget) {
        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: { name: true }
        });
        await emitDiscordWebhookEvent(guildId, 'raid.targetKilled', {
            guildName: guild?.name ?? 'Guild',
            guildId,
            kills: [{
                    npcName: definition.npcName,
                    killerName: input.killedByName ?? null,
                    occurredAt: input.killedAt
                }]
        });
    }
    return { recorded: true, needsInstanceClarification: false };
}
// Helper to calculate respawn status from a kill record
// Accepts optional `now` timestamp to avoid creating multiple Date objects when called in a loop
function calculateRespawnStatus(lastKill, respawnMinMinutes, respawnMaxMinutes, now = new Date()) {
    let respawnStatus = 'unknown';
    let respawnMinTime = null;
    let respawnMaxTime = null;
    let progressPercent = null;
    if (lastKill && respawnMinMinutes !== null) {
        // NPC has a configured respawn timer
        const killedTime = new Date(lastKill.killedAt).getTime();
        respawnMinTime = new Date(killedTime + respawnMinMinutes * 60 * 1000);
        if (respawnMaxMinutes !== null) {
            respawnMaxTime = new Date(killedTime + respawnMaxMinutes * 60 * 1000);
        }
        const totalWindowMs = (respawnMaxMinutes ?? respawnMinMinutes) * 60 * 1000;
        const elapsedMs = now.getTime() - killedTime;
        progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalWindowMs) * 100));
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
    else if (lastKill && respawnMinMinutes === null) {
        // NPC has no configured respawn timer but has a kill record
        // Use 24 hours as default threshold for up/down status
        const killedTime = new Date(lastKill.killedAt).getTime();
        const defaultRespawnMs = 24 * 60 * 60 * 1000; // 24 hours
        const elapsedMs = now.getTime() - killedTime;
        if (elapsedMs >= defaultRespawnMs) {
            respawnStatus = 'up';
        }
        else {
            respawnStatus = 'down';
        }
        progressPercent = Math.min(100, Math.max(0, (elapsedMs / defaultRespawnMs) * 100));
    }
    return { respawnStatus, respawnMinTime, respawnMaxTime, progressPercent };
}
// Get respawn tracker data - combines NPC definitions with latest kills and respawn calculations
// For NPCs with hasInstanceVersion=true, returns two entries: one for overworld, one for instance
export async function getRespawnTrackerData(guildId) {
    // Fetch definitions with recent kill records (limited to avoid fetching entire history)
    // We need to separate overworld vs instance kills, so fetch enough recent records
    // to likely capture at least one of each type
    const definitions = await prisma.npcDefinition.findMany({
        where: { guildId },
        include: {
            killRecords: {
                orderBy: { killedAt: 'desc' },
                take: 10 // Limit to recent kills - we only need the latest of each type
            }
        },
        orderBy: { npcName: 'asc' }
    });
    const entries = [];
    // Create a single timestamp for all calculations to ensure consistency and avoid repeated Date creation
    const now = new Date();
    for (const def of definitions) {
        if (def.hasInstanceVersion) {
            // Create two entries: overworld and instance
            const overworldKills = def.killRecords.filter(k => !k.isInstance);
            const instanceKills = def.killRecords.filter(k => k.isInstance);
            const lastOverworldKill = overworldKills[0] ?? null;
            const lastInstanceKill = instanceKills[0] ?? null;
            // Overworld entry
            const overworldStatus = calculateRespawnStatus(lastOverworldKill, def.respawnMinMinutes, def.respawnMaxMinutes, now);
            entries.push({
                ...formatNpcDefinition(def, lastOverworldKill),
                ...overworldStatus,
                isInstanceVariant: false
            });
            // Instance entry
            const instanceStatus = calculateRespawnStatus(lastInstanceKill, def.respawnMinMinutes, def.respawnMaxMinutes, now);
            entries.push({
                ...formatNpcDefinition(def, lastInstanceKill),
                ...instanceStatus,
                isInstanceVariant: true
            });
        }
        else {
            // Regular NPC without instance tracking - use latest kill regardless of isInstance flag
            const lastKill = def.killRecords[0] ?? null;
            const status = calculateRespawnStatus(lastKill, def.respawnMinMinutes, def.respawnMaxMinutes, now);
            entries.push({
                ...formatNpcDefinition(def, lastKill),
                ...status,
                isInstanceVariant: false
            });
        }
    }
    return entries;
}
export async function searchDiscoveredItems(searchQuery, limit = 20) {
    if (!isEqDbConfigured()) {
        return [];
    }
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
        return [];
    }
    try {
        // Query discovered_items joined with items table to get item details
        // discovered_items has: item_id, char_name
        // items has: id, Name, icon
        const rows = await queryEqDb(`SELECT DISTINCT i.id as itemId, i.Name as itemName, i.icon as itemIconId
       FROM discovered_items di
       INNER JOIN items i ON di.item_id = i.id
       WHERE i.Name LIKE ?
       ORDER BY i.Name ASC
       LIMIT ?`, [`%${trimmedQuery}%`, limit]);
        return rows.map((row) => ({
            itemId: Number(row.itemId),
            itemName: String(row.itemName),
            itemIconId: row.itemIconId != null ? Number(row.itemIconId) : null
        }));
    }
    catch (error) {
        console.error('Failed to search discovered items:', error);
        return [];
    }
}
// Content flag to EQEmu database flag mapping
const CONTENT_FLAG_DB_MAPPING = {
    Christmas: 'cw_christmas',
    Halloween: 'cw_halloween'
};
// Get enabled content flags from EQEmu content_flags table
export async function getEnabledContentFlags() {
    if (!isEqDbConfigured()) {
        return [];
    }
    try {
        const dbFlagNames = Object.values(CONTENT_FLAG_DB_MAPPING);
        const placeholders = dbFlagNames.map(() => '?').join(', ');
        const rows = await queryEqDb(`SELECT flag_name FROM content_flags WHERE flag_name IN (${placeholders}) AND enabled = 1`, dbFlagNames);
        const enabledDbFlags = new Set(rows.map((row) => String(row.flag_name)));
        const enabledContentFlags = [];
        for (const [contentFlag, dbFlag] of Object.entries(CONTENT_FLAG_DB_MAPPING)) {
            if (enabledDbFlags.has(dbFlag)) {
                enabledContentFlags.push(contentFlag);
            }
        }
        return enabledContentFlags;
    }
    catch (error) {
        console.error('Failed to get enabled content flags:', error);
        return [];
    }
}
