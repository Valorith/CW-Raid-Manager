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
}

export interface GuildBankItem {
  characterName: string;
  slotId: number;
  location: GuildBankSlotCategory;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  charges: number | null;
}

export interface GuildBankSnapshot {
  characters: GuildBankCharacterEntry[];
  items: GuildBankItem[];
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
    { start: 262, end: 341 }
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
}> {
  if (cachedInventoryItemIdColumn && cachedInventoryChargesColumn) {
    return {
      itemIdColumn: cachedInventoryItemIdColumn,
      chargesColumn: cachedInventoryChargesColumn
    };
  }

  const itemIdPreferred = ['itemid', 'item_id', 'item_id1'];
  const chargesPreferred = ['charges', 'stacksize', 'stack_size'];

  const rows = await queryEqDb<RowDataPacket[]>(
    `SELECT COLUMN_NAME as columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory'
       AND COLUMN_NAME IN (${[...itemIdPreferred, ...chargesPreferred].map(() => '?').join(',')})
    `,
    [...itemIdPreferred, ...chargesPreferred]
  );

  const findColumn = (preferred: string[]) =>
    preferred.find((candidate) =>
      rows.some((row) => (row.columnName as string)?.toLowerCase() === candidate)
    );

  const itemIdColumn = findColumn(itemIdPreferred);
  const chargesColumn = findColumn(chargesPreferred);

  if (!itemIdColumn) {
    throw new Error('inventory table is missing an item id column (itemid/item_id).');
  }
  cachedInventoryItemIdColumn = itemIdColumn;
  cachedInventoryChargesColumn = chargesColumn ?? 'charges';

  return {
    itemIdColumn,
    chargesColumn: cachedInventoryChargesColumn
  };
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
  if (!canManageGuildBank(options.actorRole)) {
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
    isPersonal: Boolean(options.isPersonal),
    user: options.isPersonal ? { connect: { id: options.userId } } : undefined
  };

  return prisma.guildBankCharacter.create({ data });
}

export async function removeGuildBankCharacter(options: {
  guildId: string;
  characterId: string;
  userId: string;
  actorRole: GuildRole;
}) {
  if (!canManageGuildBank(options.actorRole)) {
    throw new Error('Insufficient permissions to manage guild bank characters.');
  }

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
  }

  await prisma.guildBankCharacter.delete({
    where: { id: options.characterId }
  });
}

type EqCharacterRow = RowDataPacket & { id: number; name: string };

type EqInventoryRow = RowDataPacket & {
  charid: number;
  slotid: number;
  itemid: number | null;
  charges: number | null;
  itemName: string | null;
  iconId: number | null;
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
    `SELECT id, name FROM character_data WHERE LOWER(name) IN (${namePlaceholders})`,
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
      foundInEq: Boolean(eqMatch)
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
  const { itemIdColumn, chargesColumn } = await resolveInventoryItemColumns();

  const inventoryRows = await queryEqDb<EqInventoryRow[]>(
    `SELECT inv.\`${charIdColumn}\` as charid, inv.\`${slotColumn}\` as slotid, inv.\`${itemIdColumn}\` as itemid, inv.\`${chargesColumn}\` as charges, items.Name AS itemName, items.icon AS iconId
     FROM inventory AS inv
     LEFT JOIN items ON items.id = inv.\`${itemIdColumn}\`
     WHERE inv.\`${charIdColumn}\` IN (${idPlaceholders})
       AND (${SLOT_WHERE_CLAUSE.replace(/inv\.slotid/g, `inv.\`${slotColumn}\``)})
       AND inv.\`${itemIdColumn}\` IS NOT NULL
       AND inv.\`${itemIdColumn}\` > 0`,
    characterIds
  );

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
      charges: quantity
    });
  }

  return {
    characters: resolvedCharacters,
    items,
    missingCharacters
  };
}
