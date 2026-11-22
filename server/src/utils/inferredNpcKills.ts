import { findBestTrackedNpcNameMatches, npcNamesReferToSameNpc } from './npcNameMatching.js';

// Loot listings can first appear well after (or shortly before) the death they belong to.
export const INFERRED_KILL_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

export interface KillMoment {
  npcName: string;
  occurredAt: Date;
  logSignature: string;
}

// A loot-inferred kill only approximates a death, so keep it for tracked NPCs only and drop it
// when a kill of the same NPC is already known near that time. Ordinary kills always pass.
export function selectInferredKillsToKeep<T extends { inferred: boolean; row: KillMoment }>(
  entries: readonly T[],
  existingKills: readonly KillMoment[],
  definitions: readonly { npcName: string }[]
) {
  const accepted: T[] = [];
  for (const entry of entries) {
    if (entry.inferred) {
      const { row } = entry;
      // The same signature is a retry of this inferred kill, not a different kill.
      const isNearbyKill = (other: KillMoment) =>
        other.logSignature !== row.logSignature &&
        Math.abs(other.occurredAt.getTime() - row.occurredAt.getTime()) <=
          INFERRED_KILL_DUPLICATE_WINDOW_MS &&
        npcNamesReferToSameNpc(other.npcName, row.npcName);
      if (
        findBestTrackedNpcNameMatches(row.npcName, definitions).length === 0 ||
        existingKills.some(isNearbyKill) ||
        accepted.some((candidate) => isNearbyKill(candidate.row))
      ) {
        continue;
      }
    }
    accepted.push(entry);
  }
  return accepted;
}
