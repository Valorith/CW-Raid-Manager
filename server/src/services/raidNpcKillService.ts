import { createHash } from 'crypto';

import type { FastifyBaseLogger } from 'fastify';

import { prisma } from '../utils/prisma.js';

export type NpcKillInput = {
  npcName: string;
  occurredAt: Date;
  killerName?: string | null;
  rawLine?: string | null;
};

function normalizeNpcName(name: string) {
  return name.replace(/\s+/g, ' ').trim();
}

function normalizeKillerName(name?: string | null) {
  if (!name) {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildSignature(npcNameNormalized: string, occurredAt: Date, rawLine?: string | null) {
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function recordRaidNpcKills(
  raidId: string,
  guildId: string,
  kills: NpcKillInput[],
  logger?: FastifyBaseLogger
) {
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
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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
    } catch (error) {
      logger?.warn({ error }, 'Failed to persist NPC kill chunk.');
    }
  }

  return { inserted };
}

export async function listRaidNpcKillSummary(raidId: string) {
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

export async function listRaidNpcKillEvents(raidId: string) {
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

export async function deleteRaidNpcKillEvents(raidId: string, guildId: string) {
  await prisma.raidNpcKillEvent.deleteMany({
    where: {
      raidId,
      guildId
    }
  });
}
