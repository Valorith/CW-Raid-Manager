import { createHash } from 'crypto';
import { prisma } from '../utils/prisma.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
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
function buildTargetLookup(targets) {
    const lookup = new Map();
    if (!Array.isArray(targets)) {
        return lookup;
    }
    for (const target of targets) {
        if (typeof target !== 'string') {
            continue;
        }
        const normalized = normalizeNpcName(target);
        if (!normalized) {
            continue;
        }
        lookup.set(normalized.toLowerCase(), target.trim());
    }
    return lookup;
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
            logSignature: signature
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
            targetBosses: true,
            guild: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    const targetLookup = buildTargetLookup(raidContext?.targetBosses);
    const signatures = prepared.map((entry) => entry.logSignature);
    let uniqueEntries = prepared;
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
        const seen = new Set(existing.map((item) => item.logSignature));
        uniqueEntries = [];
        for (const entry of prepared) {
            if (seen.has(entry.logSignature)) {
                continue;
            }
            seen.add(entry.logSignature);
            uniqueEntries.push(entry);
        }
    }
    if (uniqueEntries.length === 0) {
        return { inserted: 0 };
    }
    let inserted = 0;
    const insertedEntries = [];
    for (const chunk of chunkArray(uniqueEntries, 100)) {
        try {
            const result = await prisma.raidNpcKillEvent.createMany({
                data: chunk,
                skipDuplicates: true
            });
            inserted += result.count;
            insertedEntries.push(...chunk);
        }
        catch (error) {
            logger?.warn({ error }, 'Failed to persist NPC kill chunk.');
        }
    }
    if (insertedEntries.length > 0 && targetLookup.size > 0) {
        const targetKills = insertedEntries
            .filter((entry) => targetLookup.has(entry.npcNameNormalized))
            .map((entry) => ({
            npcName: targetLookup.get(entry.npcNameNormalized) ?? entry.npcName,
            killerName: entry.killerName,
            occurredAt: entry.occurredAt
        }));
        if (targetKills.length > 0) {
            await emitDiscordWebhookEvent(guildId, 'raid.targetKilled', {
                guildName: raidContext?.guild?.name ?? 'Guild',
                raidId,
                raidName: raidContext?.name ?? 'Raid',
                kills: targetKills
            });
        }
    }
    return { inserted };
}
export async function listRaidNpcKillSummary(raidId) {
    const grouped = await prisma.raidNpcKillEvent.groupBy({
        by: ['npcName'],
        where: { raidId },
        _count: { raidId: true },
        orderBy: [
            { _count: { raidId: 'desc' } },
            { npcName: 'asc' }
        ]
    });
    return grouped.map((row) => ({
        npcName: row.npcName,
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
