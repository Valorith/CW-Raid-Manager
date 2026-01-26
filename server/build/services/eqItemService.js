import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
const iconCache = new Map();
export async function getItemIconId(itemId, logger) {
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
        const rows = await queryEqDb('SELECT `icon` FROM `items` WHERE `id` = ? LIMIT 1', [itemId]);
        const iconValue = rows.length > 0 ? Number(rows[0].icon) : null;
        // Icon ID 0 means "no icon" in EverQuest, treat it as null
        const resolved = iconValue != null && Number.isFinite(iconValue) && iconValue > 0 ? iconValue : null;
        iconCache.set(itemId, resolved);
        return resolved;
    }
    catch (error) {
        logger?.error?.({ err: error, itemId }, 'Failed to load EverQuest item icon from EQ content database');
        iconCache.set(itemId, null);
        return null;
    }
}
export function clearItemIconCache() {
    iconCache.clear();
}
