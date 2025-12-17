import { createHash } from 'crypto';

import type { FastifyBaseLogger } from 'fastify';

import { prisma } from '../utils/prisma.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
import { recordKillForTrackedNpc, type RecordKillResult, type ZoneOption } from './npcRespawnService.js';

// Type for kills that need instance clarification
export type PendingInstanceClarification = {
  npcDefinitionId: string;
  npcName: string;
  killedAt: string;
  killedByName: string | null;
};

// Type for kills that need zone clarification (multiple NPCs with same name in different zones)
export type PendingZoneClarification = {
  npcName: string;
  killedAt: string;
  killedByName: string | null;
  zoneOptions: ZoneOption[];
};

export type NpcKillInput = {
  npcName: string;
  occurredAt: Date;
  killerName?: string | null;
  rawLine?: string | null;
  zoneName?: string | null;
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

function buildTargetLookup(targets?: unknown) {
  const lookup = new Map<string, string>();
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
        logSignature: signature,
        zoneName: entry.zoneName?.trim() || null
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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
  const insertedEntries: typeof uniqueEntries = [];
  for (const chunk of chunkArray(uniqueEntries, 100)) {
    try {
      const result = await prisma.raidNpcKillEvent.createMany({
        data: chunk,
        skipDuplicates: true
      });
      inserted += result.count;
      insertedEntries.push(...chunk);
    } catch (error) {
      logger?.warn({ error }, 'Failed to persist NPC kill chunk.');
    }
  }

  // Record kills in the NPC Respawn Tracker for any tracked NPCs
  // This happens regardless of Discord webhook settings
  // Collect any kills that need instance or zone clarification
  const pendingClarifications: PendingInstanceClarification[] = [];
  const pendingZoneClarifications: PendingZoneClarification[] = [];
  if (insertedEntries.length > 0) {
    for (const entry of insertedEntries) {
      try {
        const result = await recordKillForTrackedNpc(guildId, {
          npcName: entry.npcName,
          npcNameNormalized: entry.npcNameNormalized,
          killedAt: entry.occurredAt,
          killedByName: entry.killerName,
          zoneName: entry.zoneName
        });
        if (result.needsInstanceClarification && result.npcDefinitionId && result.npcName && result.killedAt) {
          pendingClarifications.push({
            npcDefinitionId: result.npcDefinitionId,
            npcName: result.npcName,
            killedAt: result.killedAt.toISOString(),
            killedByName: result.killedByName ?? null
          });
        } else if (result.needsZoneClarification && result.zoneOptions && result.npcName && result.killedAt) {
          pendingZoneClarifications.push({
            npcName: result.npcName,
            killedAt: result.killedAt.toISOString(),
            killedByName: result.killedByName ?? null,
            zoneOptions: result.zoneOptions
          });
        }
      } catch (error) {
        // Silently continue - NPC may not be tracked in respawn tracker
        logger?.debug?.({ error, npcName: entry.npcName }, 'NPC not tracked in respawn tracker or failed to record kill');
      }
    }
  }

  // Emit Discord webhook for target boss kills
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

  return { inserted, pendingClarifications, pendingZoneClarifications };
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
