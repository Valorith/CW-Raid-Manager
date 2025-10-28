import type { GuildDiscordWebhookSettings } from './api';

const timestampRegex = /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export interface GuildLootParserPattern {
  id: string;
  label: string;
  pattern: string;
  ignoredMethods?: string[];
}

export interface ParsedLootEvent {
  timestamp: Date | null;
  rawLine: string;
  itemId?: number | null;
  itemName?: string;
  looter?: string;
  method?: string | null;
  patternId?: string;
  context?: string;
}

export function parseLootLog(
  logContent: string,
  raidStart: Date,
  raidEnd?: Date | null,
  patterns: GuildLootParserPattern[]
): ParsedLootEvent[] {
  const lines = logContent.split(/\r?\n/);
  const results: ParsedLootEvent[] = [];

  for (const line of lines) {
    const timestamp = extractTimestamp(line);
    if (!timestamp || !isWithinRaid(timestamp, raidStart, raidEnd)) {
      continue;
    }

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      const match = line.match(regex);
      if (match) {
        results.push({
          timestamp,
          rawLine: line,
          itemName: match.groups?.item ?? match[1],
          looter: match.groups?.looter ?? match[2],
          method: match.groups?.method ?? match[3] ?? null,
          patternId: pattern.id,
          context: pattern.label
        });
        break;
      }
    }
  }

  return results;
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
