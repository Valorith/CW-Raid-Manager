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

function parseItemDetails(
  itemRaw: string | undefined,
  existingItemId: number | null
): { itemName: string | undefined; itemId: number | null } {
  if (!itemRaw) {
    return { itemName: itemRaw, itemId: existingItemId };
  }

  const trimmed = itemRaw.trim();
  const trailingMatch = trimmed.match(/^(.+?)\s*\((\d{1,10})\)$/);
  if (trailingMatch) {
    const [, nameValue, idValue] = trailingMatch;
    const parsedId = Number(idValue);
    const normalizedId = Number.isFinite(parsedId) ? parsedId : existingItemId;
    return { itemName: nameValue?.trim() ?? '', itemId: normalizedId ?? existingItemId };
  }

  return { itemName: trimmed, itemId: existingItemId };
}

export function parseLootLog(
  logContent: string,
  raidStart: Date,
  patterns: GuildLootParserPattern[],
  raidEnd?: Date | null
): ParsedLootEvent[] {
  const lines = logContent.split(/\r?\n/);
  const results: ParsedLootEvent[] = [];

  for (const line of lines) {
    const timestamp = extractTimestamp(line);
    if (!timestamp || !isWithinRaid(timestamp, raidStart, raidEnd)) {
      continue;
    }

    for (const pattern of patterns) {
      if (!pattern?.pattern) {
        continue;
      }

      let regex: RegExp;
      try {
        regex = new RegExp(pattern.pattern, 'i');
      } catch (error) {
        if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
          console.warn('[lootParser] Skipping invalid loot pattern', {
            patternId: pattern.id,
            label: pattern.label,
            source: pattern.pattern,
            error
          });
        }
        continue;
      }
      const match = line.match(regex);
      if (match) {
        const itemSource = match.groups?.item ?? match[2] ?? match[1];
        const includesTrailingId =
          typeof itemSource === 'string' && /\(\d{1,10}\)\s*$/.test(itemSource.trim());
        const hasItemIdGroup = Object.prototype.hasOwnProperty.call(match.groups ?? {}, 'itemId');
        if (includesTrailingId && !hasItemIdGroup) {
          continue;
        }

        const itemIdRaw = match.groups?.itemId ?? null;
        const parsedItemId =
          typeof itemIdRaw === 'string' && itemIdRaw.trim().length > 0
            ? Number(itemIdRaw)
            : null;
        const { itemName: normalizedItemName, itemId: derivedItemId } = parseItemDetails(
          itemSource,
          Number.isFinite(parsedItemId) ? parsedItemId : null
        );

        results.push({
          timestamp,
          rawLine: line,
          itemId: derivedItemId ?? null,
          itemName: normalizedItemName,
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
