import type { NpcRespawnStatus, NpcRespawnTrackerEntry } from '../services/api';

export interface BossRespawnLane {
  variant: 'overworld' | 'instance';
  variantLabel: string;
  compactVariantLabel: string;
  status: NpcRespawnStatus;
  statusLabel: string;
  detail: string | null;
  ariaLabel: string;
}

export type BossRespawnTone = NpcRespawnStatus;

function formatRemaining(targetValue: string | null, nowMs: number) {
  if (!targetValue) return null;
  const remainingMs = Date.parse(targetValue) - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Now';

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function buildLane(entry: NpcRespawnTrackerEntry, isCompact: boolean, nowMs: number) {
  const variant: BossRespawnLane['variant'] = entry.isInstanceVariant ? 'instance' : 'overworld';
  const variantLabel = variant === 'instance' ? 'Instance' : 'Overworld';
  const compactVariantLabel = variant === 'instance' ? 'INST' : 'OW';

  let statusLabel = 'Unknown';
  let detail: string | null = 'No kill recorded';
  if (entry.respawnStatus === 'up') {
    statusLabel = isCompact ? 'Likely up' : 'Likely spawned';
    detail = null;
  } else if (entry.respawnStatus === 'window') {
    statusLabel = 'Spawn window';
    const remaining = formatRemaining(entry.respawnMaxTime, nowMs);
    detail = remaining && remaining !== 'Now' ? `${remaining} left` : 'Open now';
  } else if (entry.respawnStatus === 'down') {
    statusLabel = 'Down';
    const remaining = formatRemaining(entry.respawnMinTime, nowMs);
    detail = remaining && remaining !== 'Now' ? `${remaining} to window` : 'Window pending';
  }

  const ariaLabel = `${variantLabel}: ${statusLabel}${detail ? `, ${detail}` : ''}`;
  return {
    variant,
    variantLabel,
    compactVariantLabel,
    status: entry.respawnStatus,
    statusLabel,
    detail,
    ariaLabel
  } satisfies BossRespawnLane;
}

export function getBossRespawnTone(entries: NpcRespawnTrackerEntry[]): BossRespawnTone {
  if (entries.some((entry) => entry.respawnStatus === 'up')) return 'up';
  if (entries.some((entry) => entry.respawnStatus === 'window')) return 'window';
  if (entries.length > 0 && entries.every((entry) => entry.respawnStatus === 'down')) return 'down';
  return 'unknown';
}

export function buildBossRespawnLanes(
  entries: NpcRespawnTrackerEntry[],
  nowMs: number = Date.now()
) {
  const orderedEntries = [...entries].sort(
    (left, right) => Number(left.isInstanceVariant) - Number(right.isInstanceVariant)
  );
  const isCompact = orderedEntries.length > 1;
  return orderedEntries.map((entry) => buildLane(entry, isCompact, nowMs));
}
