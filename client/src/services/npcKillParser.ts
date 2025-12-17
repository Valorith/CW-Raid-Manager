const timestampRegex = /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export interface ParsedNpcKillEvent {
  timestamp: Date | null;
  npcName: string;
  killerName?: string | null;
  rawLine: string;
  zoneName?: string | null;
}

// Pattern to extract zone entry: "[...] You have entered South Ro." or "There is X hours, Y minutes remaining..."
// Some zones have period in name like "S. Ro" or "N. Ro" - handle those
const zoneEntryPattern = /\] You have entered (?<zone>.+?)\.$/i;

const killPatterns: Array<{ regex: RegExp; map: (match: RegExpMatchArray) => { npcName: string; killerName?: string | null } | null }> = [
  {
    regex: /\] You have slain (?<npc>.+?)!$/i,
    map: (match) => {
      const npcName = match.groups?.npc ?? match[1];
      return npcName ? { npcName: npcName.trim(), killerName: 'You' } : null;
    }
  },
  {
    regex: /\] (?<npc>.+?) has been slain by (?<killer>.+?)!$/i,
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
  raidEnd?: Date | null
): ParsedNpcKillEvent[] {
  const lines = logContent.split(/\r?\n/);
  const kills: ParsedNpcKillEvent[] = [];

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
      if (zoneName) {
        zoneChanges.push({ timestamp, zoneName });
      }
    }
  }

  // Sort zone changes by timestamp
  zoneChanges.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Helper to find the current zone at a given timestamp
  function getZoneAtTime(timestamp: Date): string | null {
    // Find the most recent zone change before or at the given timestamp
    let currentZone: string | null = null;
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
    if (!line.includes('slain')) {
      continue;
    }

    const timestamp = extractTimestamp(line);
    if (!timestamp || !isWithinRaid(timestamp, raidStart, raidEnd)) {
      continue;
    }

    for (const pattern of killPatterns) {
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
