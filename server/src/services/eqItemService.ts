import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

type AppLogger = {
  debug?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
};

const iconCache = new Map<number, number | null>();

export async function getItemIconId(itemId: number, logger?: AppLogger): Promise<number | null> {
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }

  if (!isEqDbConfigured()) {
    return null;
  }

  if (iconCache.has(itemId)) {
    return iconCache.get(itemId) ?? null;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      'SELECT `icon` FROM `items` WHERE `id` = ? LIMIT 1',
      [itemId]
    );
    const iconValue = rows.length > 0 ? Number(rows[0].icon) : null;
    const resolved = Number.isFinite(iconValue) ? iconValue : null;
    iconCache.set(itemId, resolved);
    return resolved;
  } catch (error) {
    logger?.error?.(
      { err: error, itemId },
      'Failed to load EverQuest item icon from EQ content database'
    );
    iconCache.set(itemId, null);
    return null;
  }
}

export function clearItemIconCache() {
  iconCache.clear();
}
