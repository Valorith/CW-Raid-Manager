const lootIconBaseUrl = '/api/loot-icons';

export type LootIconFormat = 'gif' | 'png';

/**
 * Check if an icon ID is valid (not null, undefined, or 0).
 * Icon ID 0 means "no icon" in EverQuest.
 */
export function hasValidIconId(iconId: number | null | undefined): iconId is number {
  return iconId != null && iconId > 0;
}

export function getLootIconSrc(iconId: number, format?: LootIconFormat): string {
  const base = `${lootIconBaseUrl}/${iconId}`;
  return format ? `${base}?format=${format}` : base;
}
