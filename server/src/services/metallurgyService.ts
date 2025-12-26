import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

// Metallurgy ore item IDs (ordered from most rare to least rare)
export const METALLURGY_ORES = [
  { itemId: 150797, name: 'Chromium Ore', tier: 3 },
  { itemId: 150796, name: 'Tungsten Ore', tier: 3 },
  { itemId: 150795, name: 'Manganese Ore', tier: 3 },
  { itemId: 150794, name: 'Cobalt Ore', tier: 2 },
  { itemId: 150793, name: 'Nickel Ore', tier: 2 },
  { itemId: 150792, name: 'Zinc Ore', tier: 2 },
  { itemId: 150791, name: 'Iron Ore', tier: 1 },
  { itemId: 150790, name: 'Copper Ore', tier: 1 },
  { itemId: 150789, name: 'Tin Ore', tier: 1 }
] as const;

export const ORE_ITEM_IDS = METALLURGY_ORES.map((ore) => ore.itemId);

export interface OreOwner {
  name: string;
  quantity: number;
  source: 'character' | 'sharedbank';
  characterId?: number;
  accountId?: number;
}

export interface OreInventorySummary {
  itemId: number;
  name: string;
  tier: number;
  totalOwners: number;
  totalQuantity: number;
  owners: OreOwner[];
}

export interface MetallurgyWeight {
  characterId: number;
  characterName: string;
  weight: number;
}

export interface MetallurgyData {
  ores: OreInventorySummary[];
  weights: MetallurgyWeight[];
}

// Slot ranges for inventory categories (from guildBankService)
const INVENTORY_SLOT_RANGES = {
  // Personal inventory slots (worn + general)
  personal: [
    { start: 0, end: 32 },
    { start: 251, end: 341 },
    { start: 4010, end: 6009 }
  ],
  // Bank slots
  bank: [
    { start: 2000, end: 2023 },
    { start: 2032, end: 2271 },
    { start: 6210, end: 11009 }
  ]
};

// Build WHERE clause for inventory slot filtering
const ALL_INVENTORY_RANGES = [...INVENTORY_SLOT_RANGES.personal, ...INVENTORY_SLOT_RANGES.bank];
const SLOT_WHERE_CLAUSE = ALL_INVENTORY_RANGES.map((range) =>
  range.start === range.end
    ? `slotid = ${range.start}`
    : `(slotid BETWEEN ${range.start} AND ${range.end})`
).join(' OR ');

/**
 * Fetch all metallurgy ore inventory data from character inventories and shared banks
 */
export async function fetchMetallurgyOreData(): Promise<OreInventorySummary[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  const itemIdPlaceholders = ORE_ITEM_IDS.map(() => '?').join(', ');

  // Query 1: Get ore counts from character inventories (personal + bank)
  // Using SUM of charges for stackable items, with GREATEST to ensure minimum of 1
  const characterInventoryQuery = `
    SELECT
      cd.id as characterId,
      cd.name as characterName,
      inv.itemid as itemId,
      SUM(GREATEST(COALESCE(inv.charges, 1), 1)) as quantity
    FROM inventory inv
    INNER JOIN character_data cd ON cd.id = inv.charid
    WHERE inv.itemid IN (${itemIdPlaceholders})
      AND (${SLOT_WHERE_CLAUSE})
    GROUP BY cd.id, cd.name, inv.itemid
  `;

  // Query 2: Get ore counts from shared banks (account level)
  // Shared bank uses 'charges' for stack count
  const sharedBankQuery = `
    SELECT
      a.id as accountId,
      a.name as accountName,
      sb.itemid as itemId,
      SUM(GREATEST(COALESCE(sb.charges, 1), 1)) as quantity
    FROM sharedbank sb
    INNER JOIN account a ON a.id = sb.acctid
    WHERE sb.itemid IN (${itemIdPlaceholders})
    GROUP BY a.id, a.name, sb.itemid
  `;

  // Execute both queries in parallel
  const [characterRows, sharedBankRows] = await Promise.all([
    queryEqDb<RowDataPacket[]>(characterInventoryQuery, ORE_ITEM_IDS),
    queryEqDb<RowDataPacket[]>(sharedBankQuery, ORE_ITEM_IDS)
  ]);

  // Build a map of itemId -> owners
  const oreOwnersMap = new Map<number, OreOwner[]>();

  // Initialize map for all ores
  for (const ore of METALLURGY_ORES) {
    oreOwnersMap.set(ore.itemId, []);
  }

  // Process character inventory results
  for (const row of characterRows) {
    const itemId = Number(row.itemId);
    const owners = oreOwnersMap.get(itemId);
    if (owners) {
      owners.push({
        name: row.characterName,
        quantity: Number(row.quantity),
        source: 'character',
        characterId: Number(row.characterId)
      });
    }
  }

  // Process shared bank results
  for (const row of sharedBankRows) {
    const itemId = Number(row.itemId);
    const owners = oreOwnersMap.get(itemId);
    if (owners) {
      owners.push({
        name: row.accountName,
        quantity: Number(row.quantity),
        source: 'sharedbank',
        accountId: Number(row.accountId)
      });
    }
  }

  // Build final result with aggregated data
  const result: OreInventorySummary[] = METALLURGY_ORES.map((ore) => {
    const owners = oreOwnersMap.get(ore.itemId) || [];

    // Sort owners by quantity descending
    owners.sort((a, b) => b.quantity - a.quantity);

    const totalQuantity = owners.reduce((sum, owner) => sum + owner.quantity, 0);

    return {
      itemId: ore.itemId,
      name: ore.name,
      tier: ore.tier,
      totalOwners: owners.length,
      totalQuantity,
      owners
    };
  });

  return result;
}

/**
 * Fetch metallurgy weight data from data_buckets table
 * Keys are stored as "{characterId}-metallurgy"
 */
export async function fetchMetallurgyWeights(): Promise<MetallurgyWeight[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  // Query data_buckets for metallurgy keys and join with character_data for names
  // Using LIKE pattern to match keys ending with '-metallurgy'
  const query = `
    SELECT
      cd.id as characterId,
      cd.name as characterName,
      CAST(db.value AS DECIMAL(20, 4)) as weight
    FROM data_buckets db
    INNER JOIN character_data cd ON cd.id = CAST(SUBSTRING_INDEX(db.\`key\`, '-', 1) AS UNSIGNED)
    WHERE db.\`key\` LIKE '%-metallurgy'
      AND db.value IS NOT NULL
      AND db.value != ''
      AND db.value != '0'
      AND CAST(db.value AS DECIMAL(20, 4)) > 0
    ORDER BY CAST(db.value AS DECIMAL(20, 4)) DESC
  `;

  const rows = await queryEqDb<RowDataPacket[]>(query);

  return rows.map((row) => ({
    characterId: Number(row.characterId),
    characterName: row.characterName,
    weight: Number(row.weight)
  }));
}

/**
 * Fetch all metallurgy data (ores and weights) in a single call
 */
export async function fetchAllMetallurgyData(): Promise<MetallurgyData> {
  const [ores, weights] = await Promise.all([
    fetchMetallurgyOreData(),
    fetchMetallurgyWeights()
  ]);

  return { ores, weights };
}
