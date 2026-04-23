import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

/**
 * EverQuest item stats structure matching the database schema.
 * Used for generating item hover tooltips similar to charbrowser.
 */
export interface ItemStats {
  id: number;
  name: string;
  icon: number;

  // Item type info
  itemtype: number;
  itemclass: number;

  // Equipment slots (bitmask)
  slots: number;

  // Basic stats
  ac: number;
  damage: number;
  delay: number;
  range: number;

  // Attributes
  astr: number;
  asta: number;
  aagi: number;
  adex: number;
  awis: number;
  aint: number;
  acha: number;

  // Heroic attributes
  heroic_str: number;
  heroic_sta: number;
  heroic_agi: number;
  heroic_dex: number;
  heroic_wis: number;
  heroic_int: number;
  heroic_cha: number;

  // Resources
  hp: number;
  mana: number;
  endur: number;

  // Resistances
  fr: number;
  cr: number;
  dr: number;
  mr: number;
  pr: number;
  svcorruption: number;

  // Heroic resistances
  heroic_fr: number;
  heroic_cr: number;
  heroic_dr: number;
  heroic_mr: number;
  heroic_pr: number;
  heroic_svcorrup: number;

  // Requirements
  reqlevel: number;
  reclevel: number;
  classes: number;
  races: number;
  deity: number;

  // Container properties
  bagslots: number;
  bagsize: number;
  bagtype: number;
  bagwr: number;

  // Item flags
  magic: number;
  attuneable: number;
  nodrop: number;
  norent: number;
  notransfer: number;
  questitemflag: number;
  lore: string;
  lorefile: string;

  // Effects
  proceffect: number;
  proctype: number;
  proclevel2: number;
  proclevel: number;
  procrate: number;

  worneffect: number;
  worntype: number;
  wornlevel2: number;
  wornlevel: number;

  clickeffect: number;
  clicktype: number;
  clicklevel2: number;
  clicklevel: number;
  casttime: number;

  focuseffect: number;
  focustype: number;
  focuslevel2: number;
  focuslevel: number;

  scrolleffect: number;
  scrolltype: number;
  scrolllevel2: number;
  scrolllevel: number;

  bardeffect: number;
  bardeffecttype: number;
  bardlevel2: number;
  bardlevel: number;

  // Combat stats
  backstabdmg: number;
  elemdmgtype: number;
  elemdmgamt: number;
  skillmodvalue: number;
  skillmodtype: number;
  strikethrough: number;
  stunresist: number;
  spelldmg: number;
  healamt: number;
  clairvoyance: number;
  bardtype: number;
  bardvalue: number;

  // Weapon details
  banedmgamt: number;
  banedmgraceamt: number;
  banedmgbody: number;
  banedmgrace: number;

  // Augmentation
  augtype: number;
  augslot1type: number;
  augslot2type: number;
  augslot3type: number;
  augslot4type: number;
  augslot5type: number;
  augslot6type: number;
  augslot1visible: number;
  augslot2visible: number;
  augslot3visible: number;
  augslot4visible: number;
  augslot5visible: number;
  augslot6visible: number;

  // Weight and size
  weight: number;
  size: number;

  // Stacking
  stackable: number;
  stacksize: number;

  // Misc
  idfile: string;
  light: number;
  ldonsold: number;
  ldonsellbackrate: number;
  ldonprice: number;
  price: number;
  sellrate: number;

  // Attack/haste
  attack: number;
  haste: number;
  accuracy: number;
  avoidance: number;
  combateffects: number;
  shielding: number;
  spellshield: number;
  dotshielding: number;
  damageshield: number;
  dsmitigation: number;

  // Regen
  regen: number;
  manaregen: number;
  enduranceregen: number;

  // Extradamage
  extradmgamt: number;
  extradmgskill: number;
}

type ItemStatsRow = RowDataPacket & ItemStats;

// Cache for item stats to reduce database load
const itemStatsCache = new Map<number, ItemStats | null>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ITEM_STATS_CACHE_MAX_ENTRIES = 1_000;
const SPELL_NAME_CACHE_MAX_ENTRIES = 2_000;
const ITEM_NAME_CACHE_MAX_ENTRIES = 1_000;
const cacheTimestamps = new Map<number, number>();
const tableColumnsCache = new Map<string, string[]>();
let cachedItemStatsSelectClause: string | null = null;

function isCacheValid(itemId: number): boolean {
  const timestamp = cacheTimestamps.get(itemId);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL_MS;
}

function deleteItemStatsCacheEntry(itemId: number): void {
  itemStatsCache.delete(itemId);
  cacheTimestamps.delete(itemId);
}

function pruneExpiredItemStatsCache(now = Date.now()): void {
  for (const [itemId, timestamp] of cacheTimestamps) {
    if (now - timestamp >= CACHE_TTL_MS) {
      deleteItemStatsCacheEntry(itemId);
    }
  }
}

function setItemStatsCacheEntry(itemId: number, value: ItemStats | null): void {
  if (itemStatsCache.has(itemId)) {
    deleteItemStatsCacheEntry(itemId);
  }

  itemStatsCache.set(itemId, value);
  cacheTimestamps.set(itemId, Date.now());

  while (itemStatsCache.size > ITEM_STATS_CACHE_MAX_ENTRIES) {
    const oldestKey = itemStatsCache.keys().next().value as number | undefined;
    if (oldestKey === undefined) {
      break;
    }
    deleteItemStatsCacheEntry(oldestKey);
  }
}

function touchItemStatsCacheEntry(itemId: number): ItemStats | null {
  const cached = itemStatsCache.get(itemId) ?? null;
  const timestamp = cacheTimestamps.get(itemId);
  deleteItemStatsCacheEntry(itemId);
  itemStatsCache.set(itemId, cached);
  if (timestamp) {
    cacheTimestamps.set(itemId, timestamp);
  }
  return cached;
}

function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function getBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K): V | undefined {
  if (!cache.has(key)) {
    return undefined;
  }
  const cached = cache.get(key) as V;
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const cached = tableColumnsCache.get(tableName);
  if (cached) {
    return cached;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    const columns = rows.map((row) => String(row.columnName).toLowerCase());
    tableColumnsCache.set(tableName, columns);
    return columns;
  } catch {
    return [];
  }
}

async function getItemStatsSelectClause(): Promise<string> {
  if (cachedItemStatsSelectClause) {
    return cachedItemStatsSelectClause;
  }

  const columns = new Set(await getTableColumns('items'));
  const optionalColumn = (columnName: string, fallback = '0') =>
    columns.has(columnName.toLowerCase()) ? columnName : `${fallback} as ${columnName}`;

  cachedItemStatsSelectClause = `
        id, Name as name, icon, itemtype, itemclass, slots,
        ac, damage, delay, \`range\`,
        astr, asta, aagi, adex, awis, aint, acha,
        heroic_str, heroic_sta, heroic_agi, heroic_dex, heroic_wis, heroic_int, heroic_cha,
        hp, mana, endur,
        fr, cr, dr, mr, pr, svcorruption,
        heroic_fr, heroic_cr, heroic_dr, heroic_mr, heroic_pr, heroic_svcorrup,
        reqlevel, reclevel, classes, races, deity,
        bagslots, bagsize, bagtype, bagwr,
        magic, ${optionalColumn('attuneable')}, nodrop, norent, notransfer, questitemflag, lore, lorefile,
        proceffect, proctype, proclevel2, proclevel, procrate,
        worneffect, worntype, wornlevel2, wornlevel,
        clickeffect, clicktype, clicklevel2, clicklevel, casttime,
        focuseffect, focustype, focuslevel2, focuslevel,
        scrolleffect, scrolltype, scrolllevel2, scrolllevel,
        bardeffect, bardeffecttype, bardlevel2, bardlevel,
        backstabdmg, ${optionalColumn('elemdmgtype')}, ${optionalColumn('elemdmgamt')}, skillmodvalue, skillmodtype, strikethrough, stunresist, spelldmg, healamt, clairvoyance, ${optionalColumn('bardtype')}, ${optionalColumn('bardvalue')},
        banedmgamt, banedmgraceamt, banedmgbody, banedmgrace,
        augtype, augslot1type, augslot2type, augslot3type, augslot4type, augslot5type, augslot6type,
        augslot1visible, augslot2visible, augslot3visible, augslot4visible, augslot5visible, augslot6visible,
        weight, size, stackable, stacksize,
        idfile, ${optionalColumn('light')}, ldonsold, ldonsellbackrate, ldonprice, price, sellrate,
        attack, haste, accuracy, avoidance, combateffects, shielding, ${optionalColumn('spellshield')}, dotshielding, damageshield, dsmitigation,
        regen, manaregen, enduranceregen,
        extradmgamt, extradmgskill`;

  return cachedItemStatsSelectClause;
}

/**
 * Fetches detailed item stats from the EQ database for tooltip display.
 */
export async function getItemStats(itemId: number): Promise<ItemStats | null> {
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }

  if (!isEqDbConfigured()) {
    return null;
  }

  pruneExpiredItemStatsCache();

  // Check cache first
  if (itemStatsCache.has(itemId) && isCacheValid(itemId)) {
    return touchItemStatsCacheEntry(itemId);
  }
  deleteItemStatsCacheEntry(itemId);

  try {
    const selectClause = await getItemStatsSelectClause();
    const rows = await queryEqDb<ItemStatsRow[]>(
      `SELECT ${selectClause} FROM items WHERE id = ? LIMIT 1`,
      [itemId]
    );

    if (rows.length === 0) {
      setItemStatsCacheEntry(itemId, null);
      return null;
    }

    const item = rows[0] as ItemStats;
    setItemStatsCacheEntry(itemId, item);
    return item;
  } catch (error) {
    console.error('Failed to fetch item stats:', error);
    return null;
  }
}

/**
 * Batch fetch item stats for multiple items.
 */
export async function getItemStatsBatch(itemIds: number[]): Promise<Map<number, ItemStats>> {
  const results = new Map<number, ItemStats>();

  if (!isEqDbConfigured() || itemIds.length === 0) {
    return results;
  }

  pruneExpiredItemStatsCache();

  // Filter valid IDs and check cache
  const validIds = itemIds.filter(id => Number.isFinite(id) && id > 0);
  const uncachedIds: number[] = [];

  for (const id of validIds) {
    if (itemStatsCache.has(id) && isCacheValid(id)) {
      const cached = touchItemStatsCacheEntry(id);
      if (cached) {
        results.set(id, cached);
      }
    } else {
      deleteItemStatsCacheEntry(id);
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return results;
  }

  try {
    const selectClause = await getItemStatsSelectClause();
    const placeholders = uncachedIds.map(() => '?').join(', ');
    const rows = await queryEqDb<ItemStatsRow[]>(
      `SELECT ${selectClause} FROM items WHERE id IN (${placeholders})`,
      uncachedIds
    );

    // Cache and add to results
    const foundIds = new Set<number>();
    for (const row of rows) {
      const item = row as ItemStats;
      setItemStatsCacheEntry(item.id, item);
      results.set(item.id, item);
      foundIds.add(item.id);
    }

    // Cache nulls for items not found
    for (const id of uncachedIds) {
      if (!foundIds.has(id)) {
        setItemStatsCacheEntry(id, null);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to batch fetch item stats:', error);
    return results;
  }
}

/**
 * Clear the item stats cache.
 */
export function clearItemStatsCache(): void {
  itemStatsCache.clear();
  cacheTimestamps.clear();
}

// Spell name cache for effects
const spellNameCache = new Map<number, string | null>();

/**
 * Get spell name by ID for effect display.
 */
export async function getSpellName(spellId: number): Promise<string | null> {
  if (!Number.isFinite(spellId) || spellId <= 0) {
    return null;
  }

  if (!isEqDbConfigured()) {
    return null;
  }

  if (spellNameCache.has(spellId)) {
    return getBoundedCacheEntry(spellNameCache, spellId) ?? null;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      'SELECT name FROM spells_new WHERE id = ? LIMIT 1',
      [spellId]
    );

    const name = rows.length > 0 ? String(rows[0].name) : null;
    setBoundedCacheEntry(spellNameCache, spellId, name, SPELL_NAME_CACHE_MAX_ENTRIES);
    return name;
  } catch (error) {
    console.error('Failed to fetch spell name:', error);
    setBoundedCacheEntry(spellNameCache, spellId, null, SPELL_NAME_CACHE_MAX_ENTRIES);
    return null;
  }
}

/**
 * Result of an item name search.
 */
export interface ItemNameSearchResult {
  itemId: number;
  itemIconId: number;
  itemName: string;
}

// Cache for item name lookups (name -> result)
const itemNameCache = new Map<string, ItemNameSearchResult | null>();

/**
 * Search items by exact name match (case-insensitive).
 * Returns a map of original search names to their item info.
 */
export async function searchItemsByName(names: string[]): Promise<Map<string, ItemNameSearchResult>> {
  const results = new Map<string, ItemNameSearchResult>();

  if (!isEqDbConfigured() || names.length === 0) {
    return results;
  }

  // Normalize names for cache lookup
  const normalizedToOriginal = new Map<string, string>();
  const uncachedNames: string[] = [];

  for (const name of names) {
    const normalized = name.trim().toLowerCase();
    normalizedToOriginal.set(normalized, name);

    if (itemNameCache.has(normalized)) {
      const cached = getBoundedCacheEntry(itemNameCache, normalized);
      if (cached) {
        results.set(name, cached);
      }
    } else {
      uncachedNames.push(name);
    }
  }

  if (uncachedNames.length === 0) {
    return results;
  }

  try {
    // Query items by name (case-insensitive)
    const placeholders = uncachedNames.map(() => '?').join(', ');
    const normalizedUncached = uncachedNames.map(n => n.trim().toLowerCase());
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT id, Name as name, icon FROM items WHERE LOWER(Name) IN (${placeholders})`,
      normalizedUncached
    );

    // Process results
    const foundNames = new Set<string>();
    for (const row of rows) {
      const itemId = Number(row.id);
      const itemName = String(row.name);
      const itemIconId = Number(row.icon);
      const normalizedName = itemName.toLowerCase();

      const result: ItemNameSearchResult = { itemId, itemIconId, itemName };
      setBoundedCacheEntry(itemNameCache, normalizedName, result, ITEM_NAME_CACHE_MAX_ENTRIES);
      foundNames.add(normalizedName);

      // Find the original search term that matches this result
      const originalName = normalizedToOriginal.get(normalizedName);
      if (originalName) {
        results.set(originalName, result);
      }
    }

    // Cache nulls for names not found
    for (const name of uncachedNames) {
      const normalized = name.trim().toLowerCase();
      if (!foundNames.has(normalized)) {
        setBoundedCacheEntry(itemNameCache, normalized, null, ITEM_NAME_CACHE_MAX_ENTRIES);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to search items by name:', error);
    return results;
  }
}

/**
 * Batch fetch spell names.
 */
export async function getSpellNamesBatch(spellIds: number[]): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  if (!isEqDbConfigured() || spellIds.length === 0) {
    return results;
  }

  const validIds = spellIds.filter(id => Number.isFinite(id) && id > 0);
  const uncachedIds: number[] = [];

  for (const id of validIds) {
    if (spellNameCache.has(id)) {
      const cached = getBoundedCacheEntry(spellNameCache, id);
      if (cached) {
        results.set(id, cached);
      }
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return results;
  }

  try {
    const placeholders = uncachedIds.map(() => '?').join(', ');
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT id, name FROM spells_new WHERE id IN (${placeholders})`,
      uncachedIds
    );

    const foundIds = new Set<number>();
    for (const row of rows) {
      const id = Number(row.id);
      const name = String(row.name);
      setBoundedCacheEntry(spellNameCache, id, name, SPELL_NAME_CACHE_MAX_ENTRIES);
      results.set(id, name);
      foundIds.add(id);
    }

    for (const id of uncachedIds) {
      if (!foundIds.has(id)) {
        setBoundedCacheEntry(spellNameCache, id, null, SPELL_NAME_CACHE_MAX_ENTRIES);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to batch fetch spell names:', error);
    return results;
  }
}
