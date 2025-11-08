import { createHash } from 'crypto';
import { prisma } from '../utils/prisma.js';
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
            logSignature: signature
        };
    })
        .filter((entry) => Boolean(entry));
    if (prepared.length === 0) {
        return { inserted: 0 };
    }
    let inserted = 0;
    for (const chunk of chunkArray(prepared, 100)) {
        try {
            const result = await prisma.raidNpcKillEvent.createMany({
                data: chunk,
                skipDuplicates: true
            });
            inserted += result.count;
        }
        catch (error) {
            logger?.warn({ error }, 'Failed to persist NPC kill chunk.');
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
