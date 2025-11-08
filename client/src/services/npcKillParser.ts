const timestampRegex = /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export interface ParsedNpcKillEvent {
  timestamp: Date | null;
  npcName: string;
  killerName?: string | null;
  rawLine: string;
}

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
      kills.push({
        timestamp,
        npcName,
        killerName: details.killerName ?? null,
        rawLine: line
      });
      break;
    }
  }

  return kills;
}
