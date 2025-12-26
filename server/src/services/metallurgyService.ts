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

// Column name cache for inventory table
let cachedInventoryCharIdColumn: string | null = null;
let cachedInventorySlotColumn: string | null = null;
let cachedInventoryItemIdColumn: string | null = null;
let cachedInventoryChargesColumn: string | null = null;

// Column name cache for sharedbank table
let cachedSharedBankItemIdColumn: string | null = null;
let cachedSharedBankChargesColumn: string | null = null;
let cachedSharedBankAcctIdColumn: string | null = null;

/**
 * Resolve inventory table column names dynamically
 */
async function resolveInventoryColumns(): Promise<{
  charIdColumn: string;
  slotColumn: string;
  itemIdColumn: string;
  chargesColumn: string;
}> {
  if (cachedInventoryCharIdColumn && cachedInventorySlotColumn &&
      cachedInventoryItemIdColumn && cachedInventoryChargesColumn) {
    return {
      charIdColumn: cachedInventoryCharIdColumn,
      slotColumn: cachedInventorySlotColumn,
      itemIdColumn: cachedInventoryItemIdColumn,
      chargesColumn: cachedInventoryChargesColumn
    };
  }

  const rows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory'`
  );

  const columns = rows.map((r) => (r.columnName as string).toLowerCase());

  // Resolve character ID column
  const charIdOptions = ['charid', 'char_id', 'character_id'];
  cachedInventoryCharIdColumn = charIdOptions.find((c) => columns.includes(c)) || 'charid';

  // Resolve slot column
  const slotOptions = ['slotid', 'slot_id', 'slot'];
  cachedInventorySlotColumn = slotOptions.find((c) => columns.includes(c)) || 'slotid';

  // Resolve item ID column
  const itemIdOptions = ['itemid', 'item_id'];
  cachedInventoryItemIdColumn = itemIdOptions.find((c) => columns.includes(c)) || 'itemid';

  // Resolve charges column
  const chargesOptions = ['charges', 'stacksize', 'stack_size'];
  cachedInventoryChargesColumn = chargesOptions.find((c) => columns.includes(c)) || 'charges';

  return {
    charIdColumn: cachedInventoryCharIdColumn,
    slotColumn: cachedInventorySlotColumn,
    itemIdColumn: cachedInventoryItemIdColumn,
    chargesColumn: cachedInventoryChargesColumn
  };
}

/**
 * Resolve sharedbank table column names dynamically
 */
async function resolveSharedBankColumns(): Promise<{
  itemIdColumn: string;
  chargesColumn: string;
  acctIdColumn: string;
}> {
  if (cachedSharedBankItemIdColumn && cachedSharedBankChargesColumn && cachedSharedBankAcctIdColumn) {
    return {
      itemIdColumn: cachedSharedBankItemIdColumn,
      chargesColumn: cachedSharedBankChargesColumn,
      acctIdColumn: cachedSharedBankAcctIdColumn
    };
  }

  const rows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'sharedbank'`
  );

  const columns = rows.map((r) => (r.columnName as string).toLowerCase());

  // Resolve item ID column
  const itemIdOptions = ['itemid', 'item_id'];
  cachedSharedBankItemIdColumn = itemIdOptions.find((c) => columns.includes(c)) || 'itemid';

  // Resolve charges column
  const chargesOptions = ['charges', 'stacksize', 'stack_size'];
  cachedSharedBankChargesColumn = chargesOptions.find((c) => columns.includes(c)) || 'charges';

  // Resolve account ID column
  const acctIdOptions = ['acctid', 'acct_id', 'account_id', 'accountid'];
  cachedSharedBankAcctIdColumn = acctIdOptions.find((c) => columns.includes(c)) || 'acctid';

  console.log('[metallurgyService] Resolved sharedbank columns:', {
    itemIdColumn: cachedSharedBankItemIdColumn,
    chargesColumn: cachedSharedBankChargesColumn,
    acctIdColumn: cachedSharedBankAcctIdColumn
  });

  return {
    itemIdColumn: cachedSharedBankItemIdColumn,
    chargesColumn: cachedSharedBankChargesColumn,
    acctIdColumn: cachedSharedBankAcctIdColumn
  };
}

/**
 * Fetch all metallurgy ore inventory data from character inventories and shared banks
 */
export async function fetchMetallurgyOreData(): Promise<OreInventorySummary[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  // Resolve column names dynamically
  const invCols = await resolveInventoryColumns();
  const sbCols = await resolveSharedBankColumns();

  // Build slot WHERE clause with resolved column name
  const ALL_INVENTORY_RANGES = [...INVENTORY_SLOT_RANGES.personal, ...INVENTORY_SLOT_RANGES.bank];
  const slotWhereClause = ALL_INVENTORY_RANGES.map((range) =>
    range.start === range.end
      ? `inv.\`${invCols.slotColumn}\` = ${range.start}`
      : `(inv.\`${invCols.slotColumn}\` BETWEEN ${range.start} AND ${range.end})`
  ).join(' OR ');

  const itemIdPlaceholders = ORE_ITEM_IDS.map(() => '?').join(', ');

  // Query 1: Get ore counts from character inventories (personal + bank)
  const characterInventoryQuery = `
    SELECT
      cd.id as characterId,
      cd.name as characterName,
      inv.\`${invCols.itemIdColumn}\` as itemId,
      SUM(GREATEST(COALESCE(inv.\`${invCols.chargesColumn}\`, 1), 1)) as quantity
    FROM inventory inv
    INNER JOIN character_data cd ON cd.id = inv.\`${invCols.charIdColumn}\`
    WHERE inv.\`${invCols.itemIdColumn}\` IN (${itemIdPlaceholders})
      AND (${slotWhereClause})
    GROUP BY cd.id, cd.name, inv.\`${invCols.itemIdColumn}\`
  `;

  // Query 2: Get ore counts from shared banks (account level)
  const sharedBankQuery = `
    SELECT
      a.id as accountId,
      a.name as accountName,
      sb.\`${sbCols.itemIdColumn}\` as itemId,
      SUM(GREATEST(COALESCE(sb.\`${sbCols.chargesColumn}\`, 1), 1)) as quantity
    FROM sharedbank sb
    INNER JOIN account a ON a.id = sb.\`${sbCols.acctIdColumn}\`
    WHERE sb.\`${sbCols.itemIdColumn}\` IN (${itemIdPlaceholders})
    GROUP BY a.id, a.name, sb.\`${sbCols.itemIdColumn}\`
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

  // Debug: First query data_buckets directly without join to see raw values
  const debugQuery = `
    SELECT db.\`key\`, db.value
    FROM data_buckets db
    WHERE db.\`key\` LIKE '%-metallurgy'
    ORDER BY CAST(db.value AS DECIMAL(20,10)) DESC
    LIMIT 20
  `;
  const debugRows = await queryEqDb<RowDataPacket[]>(debugQuery);
  console.log('[metallurgyService] Raw data_buckets entries (top 20 by value):', debugRows);

  // Query data_buckets for metallurgy keys and join with character_data for names
  // Using LIKE pattern to match keys ending with '-metallurgy'
  // Read the raw value and handle conversion in JavaScript to avoid SQL casting issues
  const query = `
    SELECT
      cd.id as characterId,
      cd.name as characterName,
      db.value as rawWeight
    FROM data_buckets db
    INNER JOIN character_data cd ON cd.id = CAST(SUBSTRING_INDEX(db.\`key\`, '-', 1) AS UNSIGNED)
    WHERE db.\`key\` LIKE '%-metallurgy'
      AND db.value IS NOT NULL
      AND db.value != ''
      AND db.value != '0'
  `;

  const rows = await queryEqDb<RowDataPacket[]>(query);

  // Convert raw values to numbers and filter/sort in JavaScript
  const results = rows
    .map((row) => ({
      characterId: Number(row.characterId),
      characterName: row.characterName as string,
      weight: parseFloat(row.rawWeight) || 0
    }))
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  console.log('[metallurgyService] Parsed weights (first 10):', results.slice(0, 10));

  return results;
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
