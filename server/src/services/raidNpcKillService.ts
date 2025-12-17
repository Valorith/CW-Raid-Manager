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
  const raidTargetNpcLookup = new Map<string, string>();
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
      } catch (error) {
        logger?.warn({ error }, 'Failed to persist NPC kill chunk.');
      }
    }
  }

  // Record kills in the NPC Respawn Tracker for any tracked NPCs
  // This happens regardless of Discord webhook settings
  // IMPORTANT: Process ALL prepared kills, not just newly inserted ones!
  // A kill might already be in RaidNpcKillEvent but not yet in the respawn tracker
  // (e.g., if the respawn tracker recording failed or was skipped previously)
  // The respawn tracker service has its own deduplication logic
  const pendingClarifications: PendingInstanceClarification[] = [];
  const pendingZoneClarifications: PendingZoneClarification[] = [];
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
        }, {
          // Auto-record as overworld for continuous monitoring
          // This avoids requiring user clarification during live tracking
          autoRecordAsOverworld: true
        });
        logger?.info?.({
          npcName: entry.npcName,
          recorded: result.recorded,
          needsInstanceClarification: result.needsInstanceClarification,
          needsZoneClarification: result.needsZoneClarification
        }, 'Respawn tracker result');
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
        // Log error and continue - NPC may not be tracked in respawn tracker
        logger?.warn?.({ error, npcName: entry.npcName }, 'Failed to record kill in respawn tracker');
      }
    }
  }

  // Emit Discord webhook for kills of NPCs that are flagged as raid targets in the respawn tracker
  // Only emit for newly inserted kills to avoid duplicate notifications
  if (uniqueEntries.length > 0 && raidTargetNpcLookup.size > 0) {
    const raidTargetKills = uniqueEntries
      .filter((entry) => raidTargetNpcLookup.has(entry.npcNameNormalized))
      .map((entry) => ({
        npcName: raidTargetNpcLookup.get(entry.npcNameNormalized) ?? entry.npcName,
        killerName: entry.killerName,
        occurredAt: entry.occurredAt
      }));

    if (raidTargetKills.length > 0) {
      await emitDiscordWebhookEvent(guildId, 'raid.targetKilled', {
        guildName: raidContext?.guild?.name ?? 'Guild',
        raidId,
        raidName: raidContext?.name ?? 'Raid',
        kills: raidTargetKills
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
