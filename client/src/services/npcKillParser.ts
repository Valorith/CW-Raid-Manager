const timestampRegex =
  /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export const RAID_NPC_KILL_END_GRACE_MINUTES = 10;

export interface ParsedNpcKillEvent {
  timestamp: Date | null;
  npcName: string;
  killerName?: string | null;
  rawLine: string;
  zoneName?: string | null;
}

export interface NpcKillParserOptions {
  endGraceMinutes?: number;
  initialZoneName?: string | null;
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
  options?: Pick<NpcKillParserOptions, 'initialZoneName'>
): ParsedNpcKillEvent[] {
  const lines = logContent.split(/\r?\n/);
  const kills: ParsedNpcKillEvent[] = [];
  const initialZoneName = options?.initialZoneName?.trim() || null;

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
    if (
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
      break;
    }
  }

  return kills;
}
