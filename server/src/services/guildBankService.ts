import type { GuildRole, Prisma } from '@prisma/client';
import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

export type GuildBankSlotCategory = 'WORN' | 'PERSONAL' | 'CURSOR' | 'BANK';

export interface GuildBankCharacterEntry {
  id: string;
  name: string;
  userId: string | null;
  isPersonal: boolean;
  createdAt: Date;
  foundInEq: boolean;
  class?: string;
}

export interface GuildBankItem {
  characterName: string;
  slotId: number;
  location: GuildBankSlotCategory;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  charges: number | null;
  bagSlots: number | null;
  // Augment item IDs socketed in this item
  augSlot1: number | null;
  augSlot2: number | null;
  augSlot3: number | null;
  augSlot4: number | null;
  augSlot5: number | null;
  augSlot6: number | null;
}

export interface GuildBankSnapshot {
  characters: GuildBankCharacterEntry[];
  items: GuildBankItem[];
  debug?: any;
  missingCharacters: string[];
}

type SlotRange = { start: number; end: number };

const SLOT_GROUPS: Record<GuildBankSlotCategory, SlotRange[]> = {
  WORN: [{ start: 0, end: 22 }],
  PERSONAL: [
    { start: 23, end: 32 },
    // Common Titanium-style bag slot ranges
    { start: 251, end: 330 },
    // SoF+ bag slot ranges
    { start: 262, end: 341 },
    // General Slot 23
    { start: 4010, end: 4209 },
    // General Slot 24
    { start: 4210, end: 4409 },
    // General Slot 25
    { start: 4410, end: 4609 },
    // General Slot 26
    { start: 4610, end: 4809 },
    // General Slot 27
    { start: 4810, end: 5009 },
    // General Slot 28
    { start: 5010, end: 5209 },
    // General Slot 29
    { start: 5210, end: 5409 },
    // General Slot 30
    { start: 5410, end: 5609 },
    // General Slot 31
    { start: 5610, end: 5809 },
    // General Slot 32
    { start: 5810, end: 6009 }
  ],
  CURSOR: [
    { start: 31, end: 31 },
    { start: 33, end: 33 },
    // Cursor bag slots (SoF era)
    { start: 342, end: 351 },
    // Cursor bag slots (modern numbering)
    { start: 6010, end: 6209 }
  ],
  BANK: [
    { start: 2000, end: 2023 },
    // Bank bag slots (SoF era)
    { start: 2032, end: 2271 },
    // Bank bag slots (modern numbering)
    { start: 6210, end: 11009 }
  ]
};

const ALL_SLOT_RANGES: SlotRange[] = Array.from(
  new Map(
    Object.values(SLOT_GROUPS)
      .flat()
      .map((range) => [`${range.start}-${range.end}`, range])
  ).values()
);

const SLOT_WHERE_CLAUSE = ALL_SLOT_RANGES.map((range) =>
  range.start === range.end
    ? `inv.slotid = ${range.start}`
    : `(inv.slotid BETWEEN ${range.start} AND ${range.end})`
).join(' OR ');

let cachedInventoryCharIdColumn: string | null = null;
let cachedInventorySlotColumn: string | null = null;
let cachedInventoryItemIdColumn: string | null = null;
let cachedInventoryChargesColumn: string | null = null;
let cachedInventoryBagSlotsColumn: string | null = null;
let cachedHasAugSlotColumns: boolean | null = null;

async function resolveInventoryCharacterColumn(): Promise<string> {
  if (cachedInventoryCharIdColumn) {
    return cachedInventoryCharIdColumn;
  }

  const preferredColumns = ['charid', 'char_id', 'character_id', 'characterid'];

  const rows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory'
       AND COLUMN_NAME IN (${preferredColumns.map(() => '?').join(',')})
     ORDER BY FIELD(COLUMN_NAME, ${preferredColumns.map(() => '?').join(',')})
     LIMIT 1`,
    [...preferredColumns, ...preferredColumns]
  );

  const column = rows[0]?.columnName as string | undefined;
  if (!column) {
    throw new Error('inventory table is missing a character id column (charid/char_id).');
  }
  cachedInventoryCharIdColumn = column;
  return column;
}

async function resolveInventorySlotColumn(): Promise<string> {
  if (cachedInventorySlotColumn) {
    return cachedInventorySlotColumn;
  }

  const preferred = ['slotid', 'slot_id', 'slot'];
  const rows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory'
       AND COLUMN_NAME IN (${preferred.map(() => '?').join(',')})
     ORDER BY FIELD(COLUMN_NAME, ${preferred.map(() => '?').join(',')})
     LIMIT 1`,
    [...preferred, ...preferred]
  );

  const column = rows[0]?.columnName as string | undefined;
  if (!column) {
    throw new Error('inventory table is missing a slot column (slotid/slot_id).');
  }
  cachedInventorySlotColumn = column;
  return column;
}

async function resolveInventoryItemColumns(): Promise<{
  itemIdColumn: string;
  chargesColumn: string;
  bagSlotsColumn: string;
}> {
  if (cachedInventoryItemIdColumn && cachedInventoryChargesColumn && cachedInventoryBagSlotsColumn) {
    return {
      itemIdColumn: cachedInventoryItemIdColumn,
      chargesColumn: cachedInventoryChargesColumn,
      bagSlotsColumn: cachedInventoryBagSlotsColumn
    };
  }

  const itemIdPreferred = ['itemid', 'item_id', 'item_id1'];
  const chargesPreferred = ['charges', 'stacksize', 'stack_size'];
  const bagSlotsPreferred = ['bagslots', 'bag_slots', 'bagsize', 'bag_size'];

  // 1. Resolve columns from 'inventory' table
  const inventoryRows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory'
       AND COLUMN_NAME IN (${[...itemIdPreferred, ...chargesPreferred].map(() => '?').join(',')})
    `,
    [...itemIdPreferred, ...chargesPreferred]
  );

  const findInventoryColumn = (preferred: string[]) =>
    preferred.find((candidate) =>
      inventoryRows.some((row) => (row.columnName as string)?.toLowerCase() === candidate)
    );

  const itemIdColumn = findInventoryColumn(itemIdPreferred);
  const chargesColumn = findInventoryColumn(chargesPreferred);

  if (!itemIdColumn) {
    throw new Error('inventory table is missing an item id column (itemid/item_id).');
  }

  // 2. Resolve columns from 'items' table
  const itemRows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'items'
       AND COLUMN_NAME IN (${bagSlotsPreferred.map(() => '?').join(',')})
    `,
    bagSlotsPreferred
  );

  const findItemColumn = (preferred: string[]) =>
    preferred.find((candidate) =>
      itemRows.some((row) => (row.columnName as string)?.toLowerCase() === candidate)
    );

  const bagSlotsColumn = findItemColumn(bagSlotsPreferred);

  cachedInventoryItemIdColumn = itemIdColumn;
  cachedInventoryChargesColumn = chargesColumn ?? 'charges';
  cachedInventoryBagSlotsColumn = bagSlotsColumn ?? 'bagslots';

  return {
    itemIdColumn,
    chargesColumn: cachedInventoryChargesColumn,
    bagSlotsColumn: cachedInventoryBagSlotsColumn
  };
}

/**
 * Check if the inventory table has augslot columns (augslot1-6).
 * Some EQ database schemas may not have these columns.
 */
async function hasAugSlotColumns(): Promise<boolean> {
  if (cachedHasAugSlotColumns !== null) {
    return cachedHasAugSlotColumns;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'inventory'
         AND LOWER(COLUMN_NAME) LIKE 'augslot1%'
       LIMIT 1`
    );

    cachedHasAugSlotColumns = rows.length > 0;
    console.log(`[guildBankService] Augslot columns ${cachedHasAugSlotColumns ? 'available' : 'not available'} in inventory table`);

    // Log all inventory columns for debugging
    if (!cachedHasAugSlotColumns) {
      const allCols = await queryEqDb<RowDataPacket[]>(
        `SELECT COLUMN_NAME as columnName
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'inventory'
         ORDER BY ORDINAL_POSITION`
      );
      console.log('[guildBankService] Available inventory columns:', allCols.map(r => r.columnName).join(', '));
    }

    return cachedHasAugSlotColumns;
  } catch (error) {
    console.error('[guildBankService] Error checking for augslot columns:', error);
    cachedHasAugSlotColumns = false;
    return false;
  }
}

function normalizeName(name: string): { display: string; normalized: string } {
  const display = name.trim();
  return { display, normalized: display.toLowerCase() };
}

function canManageGuildBank(role: GuildRole | null | undefined): boolean {
  return role === 'LEADER' || role === 'OFFICER';
}

function isSlotInRange(slotId: number, ranges: SlotRange[]): boolean {
  return ranges.some((range) => slotId >= range.start && slotId <= range.end);
}

function resolveSlotCategory(slotId: number): GuildBankSlotCategory | null {
  if (isSlotInRange(slotId, SLOT_GROUPS.WORN)) {
    return 'WORN';
  }
  if (isSlotInRange(slotId, SLOT_GROUPS.PERSONAL)) {
    return 'PERSONAL';
  }
  if (isSlotInRange(slotId, SLOT_GROUPS.CURSOR)) {
    return 'CURSOR';
  }
  if (isSlotInRange(slotId, SLOT_GROUPS.BANK)) {
    return 'BANK';
  }
  return null;
}

const MAX_REASONABLE_CHARGES = 1000;

function computeQuantity(charges: unknown): number | null {
  if (typeof charges !== 'number') {
    return null;
  }
  if (!Number.isFinite(charges) || charges <= 0) {
    return null;
  }
  // Some items report sentinel values like 32767; treat anything absurdly high as a single item.
  if (charges > MAX_REASONABLE_CHARGES) {
    return 1;
  }
  return charges;
}

export async function listGuildBankCharacters(guildId: string, userId: string) {
  const records = await prisma.guildBankCharacter.findMany({
    where: {
      guildId,
      OR: [
        { isPersonal: false },
        { isPersonal: true, userId }
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  return records;
}

export async function addGuildBankCharacter(options: {
  guildId: string;
  name: string;
  isPersonal?: boolean;
  userId: string;
  actorRole: GuildRole;
}) {
  const isPersonal = Boolean(options.isPersonal);
  if (!isPersonal && !canManageGuildBank(options.actorRole)) {
    throw new Error('Insufficient permissions to manage guild bank characters.');
  }

  const { display, normalized } = normalizeName(options.name);
  if (!display) {
    throw new Error('Character name is required.');
  }

  const data: Prisma.GuildBankCharacterCreateInput = {
    guild: { connect: { id: options.guildId } },
    name: display,
    normalizedName: normalized,
    isPersonal,
    user: isPersonal ? { connect: { id: options.userId } } : undefined
  };

  return prisma.guildBankCharacter.create({ data });
}

export async function removeGuildBankCharacter(options: {
  guildId: string;
  characterId: string;
  userId: string;
  actorRole: GuildRole;
}) {
  const existing = await prisma.guildBankCharacter.findUnique({
    where: { id: options.characterId }
  });
  if (!existing || existing.guildId !== options.guildId) {
    throw new Error('Guild bank character not found.');
  }
  if (existing.isPersonal) {
    if (existing.userId !== options.userId) {
      throw new Error('Cannot remove another user’s personal character.');
    }
  } else if (!canManageGuildBank(options.actorRole)) {
    throw new Error('Insufficient permissions to manage guild bank characters.');
  }

  await prisma.guildBankCharacter.delete({
    where: { id: options.characterId }
  });
}

function mapEqClassIdToEnum(classId: number): string {
  switch (classId) {
    case 1: return 'WARRIOR';
    case 2: return 'CLERIC';
    case 3: return 'PALADIN';
    case 4: return 'RANGER';
    case 5: return 'SHADOWKNIGHT';
    case 6: return 'DRUID';
    case 7: return 'MONK';
    case 8: return 'BARD';
    case 9: return 'ROGUE';
    case 10: return 'SHAMAN';
    case 11: return 'NECROMANCER';
    case 12: return 'WIZARD';
    case 13: return 'MAGICIAN';
    case 14: return 'ENCHANTER';
    case 15: return 'BEASTLORD';
    case 16: return 'BERSERKER';
    default: return 'UNKNOWN';
  }
}

type EqCharacterRow = RowDataPacket & { id: number; name: string; class: number };

type EqInventoryRow = RowDataPacket & {
  charid: number;
  slotid: number;
  itemid: number | null;
  charges: number | null;
  itemName: string | null;
  iconId: number | null;
  bagslots: number | null;
  augslot1: number | null;
  augslot2: number | null;
  augslot3: number | null;
  augslot4: number | null;
  augslot5: number | null;
  augslot6: number | null;
};

export async function fetchGuildBankSnapshot(
  guildId: string,
  userId: string
): Promise<GuildBankSnapshot> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable guild bank lookups.'
    );
  }

  const tracked = await listGuildBankCharacters(guildId, userId);
  if (tracked.length === 0) {
    return { characters: [], items: [], missingCharacters: [] };
  }

  const trackedNames = tracked.map((entry) => entry.normalizedName);
  const namePlaceholders = trackedNames.map(() => '?').join(', ');

  const eqCharacters = await queryEqDb<EqCharacterRow[]>(
    `SELECT id, name, class FROM character_data WHERE LOWER(name) IN (${namePlaceholders})`,
    trackedNames
  );

  const eqById = new Map<number, EqCharacterRow>();
  const eqByNormalizedName = new Map<string, EqCharacterRow>();
  for (const row of eqCharacters) {
    const normalized = row.name?.toLowerCase();
    if (normalized) {
      eqByNormalizedName.set(normalized, row);
    }
    if (Number.isFinite(row.id)) {
      eqById.set(Number(row.id), row);
    }
  }

  const resolvedCharacters: GuildBankCharacterEntry[] = tracked.map((entry) => {
    const eqMatch = eqByNormalizedName.get(entry.normalizedName);
    return {
      id: entry.id,
      name: entry.name,
      userId: entry.userId,
      isPersonal: entry.isPersonal ?? false,
      createdAt: entry.createdAt,
      foundInEq: Boolean(eqMatch),
      class: eqMatch ? mapEqClassIdToEnum(eqMatch.class) : undefined
    };
  });

  const missingCharacters = resolvedCharacters
    .filter((entry) => !entry.foundInEq)
    .map((entry) => entry.name);

  const characterIds = Array.from(eqById.keys());
  if (characterIds.length === 0) {
    return { characters: resolvedCharacters, items: [], missingCharacters };
  }

  const idPlaceholders = characterIds.map(() => '?').join(', ');
  const charIdColumn = await resolveInventoryCharacterColumn();
  const slotColumn = await resolveInventorySlotColumn();
  const { itemIdColumn, chargesColumn, bagSlotsColumn } = await resolveInventoryItemColumns();
  const hasAugSlots = await hasAugSlotColumns();
  console.log('Resolved columns:', { itemIdColumn, chargesColumn, bagSlotsColumn, hasAugSlots });

  // Build augslot columns string if available
  const augSlotColumns = hasAugSlots
    ? ', inv.augslot1, inv.augslot2, inv.augslot3, inv.augslot4, inv.augslot5, inv.augslot6'
    : '';

  // Query inventory items
  const inventoryRows = await queryEqDb<EqInventoryRow[]>(
    `SELECT inv.\`${charIdColumn}\` as charid, inv.\`${slotColumn}\` as slotid, inv.\`${itemIdColumn}\` as itemid, inv.\`${chargesColumn}\` as charges, items.Name AS itemName, items.icon AS iconId, items.\`${bagSlotsColumn}\` as bagslots${augSlotColumns}
     FROM inventory AS inv
     LEFT JOIN items ON items.id = inv.\`${itemIdColumn}\`
     WHERE inv.\`${charIdColumn}\` IN (${idPlaceholders})
       AND (${SLOT_WHERE_CLAUSE.replace(/inv\.slotid/g, `inv.\`${slotColumn}\``)})
       AND inv.\`${itemIdColumn}\` IS NOT NULL
       AND inv.\`${itemIdColumn}\` > 0`,
    characterIds
  );

  // Debug logging for augments
  if (hasAugSlots) {
    const itemsWithAugs = inventoryRows.filter(row =>
      (row.augslot1 && row.augslot1 > 0) ||
      (row.augslot2 && row.augslot2 > 0) ||
      (row.augslot3 && row.augslot3 > 0) ||
      (row.augslot4 && row.augslot4 > 0) ||
      (row.augslot5 && row.augslot5 > 0) ||
      (row.augslot6 && row.augslot6 > 0)
    );
    console.log(`[guildBankService] Found ${itemsWithAugs.length} items with augments out of ${inventoryRows.length} total items`);
    if (itemsWithAugs.length > 0) {
      console.log('[guildBankService] Sample augmented item:', JSON.stringify(itemsWithAugs[0]));
    }
  }

  const items: GuildBankItem[] = [];

  for (const row of inventoryRows) {
    const category = resolveSlotCategory(Number(row.slotid));
    if (!category) {
      continue;
    }

    const owner = eqById.get(Number(row.charid));
    if (!owner) {
      continue;
    }

    const quantity = computeQuantity(row.charges);

    items.push({
      characterName: owner.name ?? 'Unknown',
      slotId: Number(row.slotid),
      location: category,
      itemId: row.itemid != null ? Number(row.itemid) : null,
      itemName: row.itemName ?? 'Unknown Item',
      itemIconId: row.iconId != null ? Number(row.iconId) : null,
      charges: quantity,
      bagSlots: row.bagslots != null ? Number(row.bagslots) : null,
      augSlot1: row.augslot1 != null && row.augslot1 > 0 ? Number(row.augslot1) : null,
      augSlot2: row.augslot2 != null && row.augslot2 > 0 ? Number(row.augslot2) : null,
      augSlot3: row.augslot3 != null && row.augslot3 > 0 ? Number(row.augslot3) : null,
      augSlot4: row.augslot4 != null && row.augslot4 > 0 ? Number(row.augslot4) : null,
      augSlot5: row.augslot5 != null && row.augslot5 > 0 ? Number(row.augslot5) : null,
      augSlot6: row.augslot6 != null && row.augslot6 > 0 ? Number(row.augslot6) : null
    });
  }

  return {
    characters: resolvedCharacters,
    items,
    missingCharacters
  };
}

export async function fetchCharacterInventory(characterName: string): Promise<GuildBankItem[]> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable character lookups.'
    );
  }

  const { normalized } = normalizeName(characterName);

  // 1. Find character ID
  const eqCharacters = await queryEqDb<EqCharacterRow[]>(
    `SELECT id, name, class FROM character_data WHERE LOWER(name) = ?`,
    [normalized]
  );

  if (eqCharacters.length === 0) {
    return [];
  }

  const character = eqCharacters[0];
  const charId = character.id;

  // 2. Resolve columns
  const charIdColumn = await resolveInventoryCharacterColumn();
  const slotColumn = await resolveInventorySlotColumn();
  const { itemIdColumn, chargesColumn, bagSlotsColumn } = await resolveInventoryItemColumns();
  const hasAugSlots = await hasAugSlotColumns();

  // Build augslot columns string if available
  const augSlotColumns = hasAugSlots
    ? ', inv.augslot1, inv.augslot2, inv.augslot3, inv.augslot4, inv.augslot5, inv.augslot6'
    : '';

  // 3. Query inventory
  const inventoryRows = await queryEqDb<EqInventoryRow[]>(
    `SELECT inv.\`${charIdColumn}\` as charid, inv.\`${slotColumn}\` as slotid, inv.\`${itemIdColumn}\` as itemid, inv.\`${chargesColumn}\` as charges, items.Name AS itemName, items.icon AS iconId, items.\`${bagSlotsColumn}\` as bagslots${augSlotColumns}
     FROM inventory AS inv
     LEFT JOIN items ON items.id = inv.\`${itemIdColumn}\`
     WHERE inv.\`${charIdColumn}\` = ?
       AND (${SLOT_WHERE_CLAUSE.replace(/inv\.slotid/g, `inv.\`${slotColumn}\``)})
       AND inv.\`${itemIdColumn}\` IS NOT NULL
       AND inv.\`${itemIdColumn}\` > 0`,
    [charId]
  );

  // 4. Map to GuildBankItem
  const items: GuildBankItem[] = [];

  for (const row of inventoryRows) {
    const category = resolveSlotCategory(Number(row.slotid));
    if (!category) {
      continue;
    }

    const quantity = computeQuantity(row.charges);

    items.push({
      characterName: character.name,
      slotId: Number(row.slotid),
      location: category,
      itemId: row.itemid != null ? Number(row.itemid) : null,
      itemName: row.itemName ?? 'Unknown Item',
      itemIconId: row.iconId != null ? Number(row.iconId) : null,
      charges: quantity,
      bagSlots: row.bagslots != null ? Number(row.bagslots) : null,
      augSlot1: row.augslot1 != null && row.augslot1 > 0 ? Number(row.augslot1) : null,
      augSlot2: row.augslot2 != null && row.augslot2 > 0 ? Number(row.augslot2) : null,
      augSlot3: row.augslot3 != null && row.augslot3 > 0 ? Number(row.augslot3) : null,
      augSlot4: row.augslot4 != null && row.augslot4 > 0 ? Number(row.augslot4) : null,
      augSlot5: row.augslot5 != null && row.augslot5 > 0 ? Number(row.augslot5) : null,
      augSlot6: row.augslot6 != null && row.augslot6 > 0 ? Number(row.augslot6) : null
    });
  }

  return items;
}
