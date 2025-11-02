const lootIconBaseUrl = '/api/loot-icons';

export type LootIconFormat = 'gif' | 'png';

export function getLootIconSrc(iconId: number, format?: LootIconFormat): string {
  const base = `${lootIconBaseUrl}/${iconId}`;
  return format ? `${base}?format=${format}` : base;
}
