import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

type AppLogger = {
  debug?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
};

const iconCache = new Map<number, number | null>();
const ICON_CACHE_MAX_ENTRIES = 5_000;

function getCachedIcon(itemId: number): number | null | undefined {
  if (!iconCache.has(itemId)) {
    return undefined;
  }

  const cached = iconCache.get(itemId) ?? null;
  iconCache.delete(itemId);
  iconCache.set(itemId, cached);
  return cached;
}

function setCachedIcon(itemId: number, iconId: number | null): void {
  if (iconCache.has(itemId)) {
    iconCache.delete(itemId);
  }
  iconCache.set(itemId, iconId);

  while (iconCache.size > ICON_CACHE_MAX_ENTRIES) {
    const oldestKey = iconCache.keys().next().value as number | undefined;
    if (oldestKey === undefined) {
      break;
    }
    iconCache.delete(oldestKey);
  }
}

export async function getItemIconId(itemId: number, logger?: AppLogger): Promise<number | null> {
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }

  if (!isEqDbConfigured()) {
    return null;
  }

  const cached = getCachedIcon(itemId);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      'SELECT `icon` FROM `items` WHERE `id` = ? LIMIT 1',
      [itemId]
    );
    const iconValue = rows.length > 0 ? Number(rows[0].icon) : null;
    // Icon ID 0 means "no icon" in EverQuest, treat it as null
    const resolved = iconValue != null && Number.isFinite(iconValue) && iconValue > 0 ? iconValue : null;
    setCachedIcon(itemId, resolved);
    return resolved;
  } catch (error) {
    logger?.error?.(
      { err: error, itemId },
      'Failed to load EverQuest item icon from EQ content database'
    );
    setCachedIcon(itemId, null);
    return null;
  }
}

export function clearItemIconCache() {
  iconCache.clear();
}
