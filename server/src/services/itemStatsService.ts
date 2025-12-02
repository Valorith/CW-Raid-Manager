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
  skillmodvalue: number;
  skillmodtype: number;
  strikethrough: number;
  stunresist: number;
  spelldmg: number;
  healamt: number;
  clairvoyance: number;

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
const cacheTimestamps = new Map<number, number>();

function isCacheValid(itemId: number): boolean {
  const timestamp = cacheTimestamps.get(itemId);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL_MS;
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

  // Check cache first
  if (itemStatsCache.has(itemId) && isCacheValid(itemId)) {
    return itemStatsCache.get(itemId) ?? null;
  }

  try {
    const rows = await queryEqDb<ItemStatsRow[]>(
      `SELECT
        id, Name as name, icon, itemtype, itemclass, slots,
        ac, damage, delay, \`range\`,
        astr, asta, aagi, adex, awis, aint, acha,
        heroic_str, heroic_sta, heroic_agi, heroic_dex, heroic_wis, heroic_int, heroic_cha,
        hp, mana, endur,
        fr, cr, dr, mr, pr, svcorruption,
        heroic_fr, heroic_cr, heroic_dr, heroic_mr, heroic_pr, heroic_svcorrup,
        reqlevel, reclevel, classes, races, deity,
        bagslots, bagsize, bagtype, bagwr,
        magic, nodrop, norent, notransfer, questitemflag, lore, lorefile,
        proceffect, proctype, proclevel2, proclevel, procrate,
        worneffect, worntype, wornlevel2, wornlevel,
        clickeffect, clicktype, clicklevel2, clicklevel, casttime,
        focuseffect, focustype, focuslevel2, focuslevel,
        scrolleffect, scrolltype, scrolllevel2, scrolllevel,
        bardeffect, bardeffecttype, bardlevel2, bardlevel,
        backstabdmg, skillmodvalue, skillmodtype, strikethrough, stunresist, spelldmg, healamt, clairvoyance,
        banedmgamt, banedmgraceamt, banedmgbody, banedmgrace,
        augtype, augslot1type, augslot2type, augslot3type, augslot4type, augslot5type, augslot6type,
        augslot1visible, augslot2visible, augslot3visible, augslot4visible, augslot5visible, augslot6visible,
        weight, size, stackable, stacksize,
        idfile, ldonsold, ldonsellbackrate, ldonprice, price, sellrate,
        attack, haste, accuracy, avoidance, combateffects, shielding, dotshielding, damageshield, dsmitigation,
        regen, manaregen, enduranceregen,
        extradmgamt, extradmgskill
      FROM items WHERE id = ? LIMIT 1`,
      [itemId]
    );

    if (rows.length === 0) {
      itemStatsCache.set(itemId, null);
      cacheTimestamps.set(itemId, Date.now());
      return null;
    }

    const item = rows[0] as ItemStats;
    itemStatsCache.set(itemId, item);
    cacheTimestamps.set(itemId, Date.now());
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

  // Filter valid IDs and check cache
  const validIds = itemIds.filter(id => Number.isFinite(id) && id > 0);
  const uncachedIds: number[] = [];

  for (const id of validIds) {
    if (itemStatsCache.has(id) && isCacheValid(id)) {
      const cached = itemStatsCache.get(id);
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
    const rows = await queryEqDb<ItemStatsRow[]>(
      `SELECT
        id, Name as name, icon, itemtype, itemclass, slots,
        ac, damage, delay, \`range\`,
        astr, asta, aagi, adex, awis, aint, acha,
        heroic_str, heroic_sta, heroic_agi, heroic_dex, heroic_wis, heroic_int, heroic_cha,
        hp, mana, endur,
        fr, cr, dr, mr, pr, svcorruption,
        heroic_fr, heroic_cr, heroic_dr, heroic_mr, heroic_pr, heroic_svcorrup,
        reqlevel, reclevel, classes, races, deity,
        bagslots, bagsize, bagtype, bagwr,
        magic, nodrop, norent, notransfer, questitemflag, lore, lorefile,
        proceffect, proctype, proclevel2, proclevel, procrate,
        worneffect, worntype, wornlevel2, wornlevel,
        clickeffect, clicktype, clicklevel2, clicklevel, casttime,
        focuseffect, focustype, focuslevel2, focuslevel,
        scrolleffect, scrolltype, scrolllevel2, scrolllevel,
        bardeffect, bardeffecttype, bardlevel2, bardlevel,
        backstabdmg, skillmodvalue, skillmodtype, strikethrough, stunresist, spelldmg, healamt, clairvoyance,
        banedmgamt, banedmgraceamt, banedmgbody, banedmgrace,
        augtype, augslot1type, augslot2type, augslot3type, augslot4type, augslot5type, augslot6type,
        augslot1visible, augslot2visible, augslot3visible, augslot4visible, augslot5visible, augslot6visible,
        weight, size, stackable, stacksize,
        idfile, ldonsold, ldonsellbackrate, ldonprice, price, sellrate,
        attack, haste, accuracy, avoidance, combateffects, shielding, dotshielding, damageshield, dsmitigation,
        regen, manaregen, enduranceregen,
        extradmgamt, extradmgskill
      FROM items WHERE id IN (${placeholders})`,
      uncachedIds
    );

    // Cache and add to results
    const foundIds = new Set<number>();
    for (const row of rows) {
      const item = row as ItemStats;
      itemStatsCache.set(item.id, item);
      cacheTimestamps.set(item.id, Date.now());
      results.set(item.id, item);
      foundIds.add(item.id);
    }

    // Cache nulls for items not found
    for (const id of uncachedIds) {
      if (!foundIds.has(id)) {
        itemStatsCache.set(id, null);
        cacheTimestamps.set(id, Date.now());
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
    return spellNameCache.get(spellId) ?? null;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      'SELECT name FROM spells_new WHERE id = ? LIMIT 1',
      [spellId]
    );

    const name = rows.length > 0 ? String(rows[0].name) : null;
    spellNameCache.set(spellId, name);
    return name;
  } catch (error) {
    console.error('Failed to fetch spell name:', error);
    spellNameCache.set(spellId, null);
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
      const cached = itemNameCache.get(normalized);
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
      itemNameCache.set(normalizedName, result);
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
        itemNameCache.set(normalized, null);
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
      const cached = spellNameCache.get(id);
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
      spellNameCache.set(id, name);
      results.set(id, name);
      foundIds.add(id);
    }

    for (const id of uncachedIds) {
      if (!foundIds.has(id)) {
        spellNameCache.set(id, null);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to batch fetch spell names:', error);
    return results;
  }
}
