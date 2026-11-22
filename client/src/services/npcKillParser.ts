const timestampRegex =
  /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export const RAID_NPC_KILL_END_GRACE_MINUTES = 10;

export interface ParsedNpcKillEvent {
  timestamp: Date | null;
  npcName: string;
  killerName?: string | null;
  rawLine: string;
  zoneName?: string | null;
  // Set when no death line was logged and the kill was inferred from the corpse's loot listing.
  inferredFromLoot?: boolean;
}

interface PendingLootInferredKill {
  identity: string;
  timestampMs: number;
  event: ParsedNpcKillEvent;
}

// Carries loot-inference context between incremental chunks of the same log.
export interface NpcKillParserState {
  lootListingSeenAt: Map<string, number>;
  lastKillAtByNpc: Map<string, number>;
  pendingLootKills: PendingLootInferredKill[];
}

export interface NpcKillParserOptions {
  endGraceMinutes?: number;
  initialZoneName?: string | null;
  // Reuse one state for a live log so loot inference can span chunks. Without a state the
  // content is treated as a complete log and unconfirmed loot inferences are emitted at its end.
  state?: NpcKillParserState;
  flushPendingLootKills?: boolean;
}

export function createNpcKillParserState(): NpcKillParserState {
  return { lootListingSeenAt: new Map(), lastKillAtByNpc: new Map(), pendingLootKills: [] };
}

// Pattern to extract zone entry: "[...] You have entered South Ro." or "There is X hours, Y minutes remaining..."
// Some zones have period in name like "S. Ro" or "N. Ro" - handle those
const zoneEntryPattern = /\] You have entered (?<zone>.+?)\.$/i;
const CLASSIC_BRAAG_NAME = 'braag the morphling';
const NON_IDENTIFYING_INSTANCE_ZONES = new Set(['anarenapvparea', 'arenapvp', 'arenapvparea']);

function normalizeZoneIdentity(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function isNonIdentifyingInstanceZone(value?: string | null) {
  return NON_IDENTIFYING_INSTANCE_ZONES.has(normalizeZoneIdentity(value));
}

export function extractLastIdentifyingZoneFromLog(logContent: string) {
  const lines = logContent.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const zoneName = line.match(zoneEntryPattern)?.groups?.zone?.trim();
    if (zoneName && !isNonIdentifyingInstanceZone(zoneName)) {
      return zoneName;
    }
  }
  return null;
}

function isClassicBraagZone(value?: string | null) {
  return normalizeZoneIdentity(value) === 'shadowspine';
}

const killPatterns: Array<{
  regex: RegExp;
  map: (match: RegExpMatchArray) => { npcName: string; killerName?: string | null } | null;
}> = [
  {
    // Pattern: "[timestamp] You have slain NpcName!"
    // Allow trailing whitespace after the exclamation mark
    regex: /\] You have slain (?<npc>.+?)!\s*$/i,
    map: (match) => {
      const npcName = match.groups?.npc ?? match[1];
      return npcName ? { npcName: npcName.trim(), killerName: 'You' } : null;
    }
  },
  {
    // Pattern: "[timestamp] NpcName has been slain by KillerName!"
    // Allow trailing whitespace after the exclamation mark
    regex: /\] (?<npc>.+?) has been slain by (?<killer>.+?)!\s*$/i,
    map: (match) => {
      const npcName = match.groups?.npc ?? match[1];
      if (!npcName) {
        return null;
      }
      return {
        npcName: npcName.trim(),
        killerName: (match.groups?.killer ?? match[2] ?? '').trim() || null
      };
    }
  }
];

// Some scripted encounters complete without the tracked boss dying. Keep these signals explicit:
// generic despawn text can also be emitted by failed or reset encounters and must not award credit.
const encounterCompletionPatterns: typeof killPatterns = [
  {
    // Blacksmith Yragbor becomes untargetable, five giants must be defeated, then this line is
    // emitted as Yragbor disappears and the encounter's giant loot chest spawns.
    regex: /\] Blacksmith Yragbor is pulled away by an unseen force\.\s*$/i,
    map: () => ({ npcName: 'Blacksmith Yragbor', killerName: null })
  },
  {
    // Classic Braag's apparent death is an intermediate morph. At 5% in his final form he
    // depops with this shout, fears the raid, and spawns the ancient loot chest.
    regex: /\] Braag the Morphling shouts ['"]Until next time\.\.\.['"]\s*$/i,
    map: () => ({ npcName: 'Braag the Morphling', killerName: null })
  },
  {
    // Corflunk can depart outside the player's combat-log range, so no death line is emitted.
    // This NPC-specific line is immediately followed by Zarchoomi's death and the Twins chest.
    regex:
      /\] Enraged Corflunk says ['"“”‘’]Your destiny lies at the hands of the Greenbloods\.['"“”‘’]\s*$/i,
    map: () => ({ npcName: 'Enraged Corflunk', killerName: null })
  }
];

const npcKillEventPatterns = [...killPatterns, ...encounterCompletionPatterns];

// Loot listings name the NPC that dropped each item, for example:
//   "1) [lakeofillomen] Herald's Sleeves\t | Status: Pending\t | NPC: Grand Magus D`Nor "
//   "| 1) [emeraldjungle] Brass Earring\t | Status: Pending | NPC: a tottering gorilla"
const lootListingPattern =
  /^\[[^\]]+\] (?:\| )?\d+\) \[(?<zone>[^\]]+)\] (?<item>.+?)\s*\| Status: [^|]*\| NPC: (?<npc>.+?)\s*(?:<--.*)?$/;

// EQ shows death lines only to nearby players and omits them for some deaths (such as a DoT
// tick), so a boss can die without any "slain" text; its loot listing is then the only evidence.
// Listings repeat while items stay pending and can first appear minutes before or well after a
// logged death, so a kill is inferred only from a listing not seen recently, with no death of
// that NPC shortly before it, and only after the confirmation window passes without one.
export const LOOT_INFERRED_KILL_CONFIRM_MS = 5 * 60 * 1000;
const LOOT_KILL_ATTRIBUTION_WINDOW_MS = 30 * 60 * 1000;
const LOOT_LISTING_MEMORY_MS = 6 * 60 * 60 * 1000;

// Collapses the name variants EQ uses for one NPC across death and loot lines, such as
// "Prince Thirneg" / "Prince Thirneg the Petulant" and "All-Seeing Eye" / "AllSeeing Eye".
function getNpcIdentity(name: string) {
  const normalized = name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const withoutArticle = normalized.replace(/^the /, '');
  const titleIndex = withoutArticle.indexOf(' the ');
  const base = titleIndex > 0 ? withoutArticle.slice(0, titleIndex) : withoutArticle;
  return base.replace(/[^a-z0-9]/g, '');
}

function confirmPendingLootKills(
  state: NpcKillParserState,
  kills: ParsedNpcKillEvent[],
  nowMs: number | null
) {
  if (state.pendingLootKills.length === 0) {
    return;
  }
  const stillPending: PendingLootInferredKill[] = [];
  for (const pending of state.pendingLootKills) {
    if (nowMs === null || nowMs - pending.timestampMs >= LOOT_INFERRED_KILL_CONFIRM_MS) {
      kills.push(pending.event);
      state.lastKillAtByNpc.set(pending.identity, pending.timestampMs);
    } else {
      stillPending.push(pending);
    }
  }
  state.pendingLootKills = stillPending;
}

function findLastTimestampMs(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const timestamp = extractTimestamp(lines[index] ?? '');
    if (timestamp) {
      return timestamp.getTime();
    }
  }
  return null;
}

function extractTimestamp(line: string) {
  const match = line.match(timestampRegex);
  if (!match?.groups) {
    return null;
  }
  const { day, month, date, time, year } = match.groups;
  const composed = `${day} ${month} ${date} ${time} ${year}`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinRaid(timestamp: Date, raidStart: Date, raidEnd?: Date | null) {
  if (timestamp < raidStart) {
    return false;
  }
  if (raidEnd && timestamp > raidEnd) {
    return false;
  }
  return true;
}

export function parseNpcKills(
  logContent: string,
  raidStart: Date,
  raidEnd?: Date | null,
  options?: NpcKillParserOptions
): ParsedNpcKillEvent[] {
  const endGraceMinutes = Math.max(0, options?.endGraceMinutes ?? 0);
  const effectiveRaidEnd =
    raidEnd && endGraceMinutes > 0
      ? new Date(raidEnd.getTime() + endGraceMinutes * 60 * 1000)
      : raidEnd;

  return parseNpcKillEvents(logContent, options).filter(
    (kill) => kill.timestamp && isWithinRaid(kill.timestamp, raidStart, effectiveRaidEnd)
  );
}

export function parseNpcKillEvents(
  logContent: string,
  options?: Omit<NpcKillParserOptions, 'endGraceMinutes'>
): ParsedNpcKillEvent[] {
  const lines = logContent.split(/\r?\n/);
  const kills: ParsedNpcKillEvent[] = [];
  const initialZoneName = options?.initialZoneName?.trim() || null;
  const state = options?.state ?? createNpcKillParserState();
  const flushPendingLootKills = options?.flushPendingLootKills ?? !options?.state;

  // Track zone changes with timestamps so we can match zones to kills
  const zoneChanges: Array<{ timestamp: Date; zoneName: string }> = [];

  // First pass: extract all zone changes within the raid window
  for (const line of lines) {
    if (!line.includes('You have entered')) {
      continue;
    }

    const timestamp = extractTimestamp(line);
    if (!timestamp) {
      continue;
    }

    const zoneMatch = line.match(zoneEntryPattern);
    if (zoneMatch?.groups?.zone) {
      const zoneName = zoneMatch.groups.zone.trim();
      // EQ raid instances identify themselves only as an Arena. Retain the most recent real
      // source zone so duplicate tracker definitions can be resolved without guessing.
      if (zoneName && !isNonIdentifyingInstanceZone(zoneName)) {
        zoneChanges.push({ timestamp, zoneName });
      }
    }
  }

  // Sort zone changes by timestamp
  zoneChanges.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Helper to find the current zone at a given timestamp
  function getZoneAtTime(timestamp: Date): string | null {
    // Find the most recent zone change before or at the given timestamp
    let currentZone: string | null = isNonIdentifyingInstanceZone(initialZoneName)
      ? null
      : initialZoneName;
    for (const change of zoneChanges) {
      if (change.timestamp <= timestamp) {
        currentZone = change.zoneName;
      } else {
        break;
      }
    }
    return currentZone;
  }

  // Second pass: extract kills and attach zone context
  for (const line of lines) {
    const normalizedLine = line.toLowerCase();
    const isLootListing = normalizedLine.includes('| npc: ');
    if (
      !isLootListing &&
      !normalizedLine.includes('slain') &&
      !normalizedLine.includes('pulled away by an unseen force') &&
      !normalizedLine.includes('until next time...') &&
      !normalizedLine.includes('your destiny lies at the hands of the greenbloods')
    ) {
      continue;
    }

    const timestamp = extractTimestamp(line);
    if (!timestamp) {
      continue;
    }
    const timestampMs = timestamp.getTime();
    confirmPendingLootKills(state, kills, timestampMs);

    if (isLootListing) {
      const lootMatch = line.match(lootListingPattern);
      const npcName = lootMatch?.groups?.npc?.replace(/\s+/g, ' ').trim() ?? '';
      const identity = getNpcIdentity(npcName);
      if (!lootMatch?.groups || !identity) {
        continue;
      }
      const listingKey = [
        identity,
        lootMatch.groups.zone.trim().toLowerCase(),
        lootMatch.groups.item.replace(/\s+/g, ' ').trim().toLowerCase()
      ].join('|');
      const lastListedAt = state.lootListingSeenAt.get(listingKey);
      state.lootListingSeenAt.set(listingKey, timestampMs);
      if (lastListedAt !== undefined && timestampMs - lastListedAt <= LOOT_LISTING_MEMORY_MS) {
        continue;
      }
      const lastKillAt = state.lastKillAtByNpc.get(identity);
      if (
        (lastKillAt !== undefined && timestampMs - lastKillAt <= LOOT_KILL_ATTRIBUTION_WINDOW_MS) ||
        state.pendingLootKills.some((pending) => pending.identity === identity)
      ) {
        continue;
      }
      state.pendingLootKills.push({
        identity,
        timestampMs,
        event: {
          timestamp,
          npcName,
          killerName: null,
          rawLine: line,
          zoneName: getZoneAtTime(timestamp),
          inferredFromLoot: true
        }
      });
      continue;
    }

    for (const pattern of npcKillEventPatterns) {
      const match = line.match(pattern.regex);
      if (!match) {
        continue;
      }
      const details = pattern.map(match);
      if (!details || !details.npcName) {
        continue;
      }
      const npcName = details.npcName.replace(/\s+/g, ' ').trim();
      if (!npcName) {
        continue;
      }

      // Get the zone at the time of this kill
      const zoneName = getZoneAtTime(timestamp);

      // Phase 1 Braag logs a normal death before immediately respawning for Phase 2. Do not
      // turn that intermediate morph transition into tracker credit for the Classic encounter.
      if (
        normalizedLine.includes('slain') &&
        npcName.toLowerCase() === CLASSIC_BRAAG_NAME &&
        isClassicBraagZone(zoneName)
      ) {
        break;
      }

      kills.push({
        timestamp,
        npcName,
        killerName: details.killerName ?? null,
        rawLine: line,
        zoneName
      });
      // A logged death supersedes a loot inference for the same NPC that is still unconfirmed.
      const identity = getNpcIdentity(npcName);
      state.lastKillAtByNpc.set(identity, timestampMs);
      state.pendingLootKills = state.pendingLootKills.filter(
        (pending) => pending.identity !== identity
      );
      break;
    }
  }

  confirmPendingLootKills(state, kills, flushPendingLootKills ? null : findLastTimestampMs(lines));

  return kills.sort(
    (left, right) => (left.timestamp?.getTime() ?? 0) - (right.timestamp?.getTime() ?? 0)
  );
}
