import type { GuildLootListEntry } from '../services/api';

export type LootListLookup = {
  byId: Map<number, GuildLootListEntry>;
  byName: Map<string, GuildLootListEntry>;
};

export function normalizeLootItemName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildLootListLookup(entries: GuildLootListEntry[]): LootListLookup {
  const byId = new Map<number, GuildLootListEntry>();
  const byName = new Map<string, GuildLootListEntry>();

  for (const entry of entries) {
    if (entry.itemId != null) {
      byId.set(entry.itemId, entry);
    }
    const normalized =
      entry.itemNameNormalized && entry.itemNameNormalized.length > 0
        ? entry.itemNameNormalized
        : normalizeLootItemName(entry.itemName);
    byName.set(normalized, entry);
  }

  return { byId, byName };
}

export function matchesLootListEntry(
  lookup: LootListLookup,
  itemId: number | null | undefined,
  normalizedName: string | null
): GuildLootListEntry | null {
  if (itemId != null && lookup.byId.has(itemId)) {
    return lookup.byId.get(itemId) ?? null;
  }
  if (normalizedName && lookup.byName.has(normalizedName)) {
    return lookup.byName.get(normalizedName) ?? null;
  }
  return null;
}
