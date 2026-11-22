import { findBestTrackedNpcNameMatches, npcNamesReferToSameNpc } from './npcNameMatching.js';
import { staticZoneNameMap } from '../data/zoneNames.js';

// Loot listings can first appear well after (or shortly before) the death they belong to.
export const INFERRED_KILL_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
// Stands in for the raw log line in an inferred kill's signature, so stored inferred kills can be
// recognized later and replaced when the real death line arrives.
export const INFERRED_KILL_SIGNATURE_SOURCE = 'loot-inferred-kill';
export const INFERRED_KILL_NOTE = 'Auto-recorded from raid loot (no death line in log)';

export interface KillMoment {
  npcName: string;
  occurredAt: Date;
  logSignature: string;
}

function isNearbyKillOfSameNpc(kill: KillMoment, other: KillMoment) {
  return (
    other.logSignature !== kill.logSignature &&
    Math.abs(other.occurredAt.getTime() - kill.occurredAt.getTime()) <=
      INFERRED_KILL_DUPLICATE_WINDOW_MS &&
    npcNamesReferToSameNpc(other.npcName, kill.npcName)
  );
}

// A loot-inferred kill only approximates a death, so keep it for tracked NPCs only and drop it
// when any other kill of the same NPC is known near that time, whether stored or in this batch
// (a death line always wins). Ordinary kills always pass. A retry of the same inferred kill
// shares its signature and is kept so tracker recording stays idempotent.
export function selectInferredKillsToKeep<T extends { inferred: boolean; row: KillMoment }>(
  entries: readonly T[],
  existingKills: readonly KillMoment[],
  definitions: readonly { npcName: string }[]
) {
  const deaths = entries.filter((entry) => !entry.inferred).map((entry) => entry.row);
  const accepted: T[] = [];
  for (const entry of entries) {
    if (entry.inferred) {
      const nearby = (other: KillMoment) => isNearbyKillOfSameNpc(entry.row, other);
      if (
        findBestTrackedNpcNameMatches(entry.row.npcName, definitions, {
          allowOmittedTitle: true
        }).length === 0 ||
        existingKills.some(nearby) ||
        deaths.some(nearby) ||
        accepted.some((candidate) => candidate.inferred && nearby(candidate.row))
      ) {
        continue;
      }
    }
    accepted.push(entry);
  }
  return accepted;
}

// Stored inferred kills that a newly received death line of the same NPC replaces.
export function findInferredKillsSupersededByDeaths<T extends KillMoment>(
  storedInferredKills: readonly T[],
  deaths: readonly KillMoment[]
) {
  return storedInferredKills.filter((stored) =>
    deaths.some((death) => isNearbyKillOfSameNpc(stored, death))
  );
}

// Loot listings tag the drop zone ("1) [lakeofillomen] ..."), which is more reliable than the
// logging player's own zone when the player was away from the boss.
export function resolveInferredKillZone(rawLine: string | null | undefined, fallback: string | null) {
  const shortName = rawLine?.match(/\d+\) \[([^\]]+)\]/)?.[1]?.trim().toLowerCase();
  return (shortName && staticZoneNameMap[shortName]) || fallback;
}
