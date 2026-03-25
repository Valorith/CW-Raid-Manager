import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { getItemIconId } from './eqItemService.js';

export interface ServerConnection {
  connectId: number;
  ip: string;
  accountId: number;
  characterId: number;
  characterName: string;
  level: number;
  className: string;
  classId: number;
  zoneName: string;
  zoneShortName: string;
  guildName: string | null;
  lastActionAt: string | null;
  lastActionEventTypeId: number | null;
  lastKillNpcName: string | null;
  lastKillAt: string | null;
  hackCount: number;
  lastHackAt: string | null;
  // Trader-specific fields (for characters in The Bazaar with no kills)
  lastSaleItemName: string | null;
  lastSaleItemId: number | null;
  lastSaleItemIconId: number | null;
  lastSalePrice: number | null;
  lastSaleAt: string | null;
  totalSalesAmount: number | null;
  totalSalesCount: number | null;
}

export interface IpExemption {
  ip: string;
  exemptionAmount: number;
}

export interface AdminItemSearchResult {
  itemId: number;
  itemName: string;
  itemIconId: number | null;
}

export interface ItemOwnershipCharacter {
  characterId: number;
  characterName: string;
  accountId: number;
  accountName: string;
  level: number;
  className: string;
  classId: number;
  guildName: string | null;
  slotId: number;
  location: 'WORN' | 'PERSONAL' | 'CURSOR' | 'BANK';
  quantity: number;
}

export interface ItemOwnershipResult {
  item: AdminItemSearchResult;
  owners: ItemOwnershipCharacter[];
  totalCharacterCount: number;
  totalItemCount: number;
}

type ConnectionRow = RowDataPacket & {
  connectid: number;
  ip: string;
  accountid: number;
  characterid: number;
  name: string;
  level: number;
  class: number;
  zone_id: number;
  zone_long_name: string | null;
  zone_short_name: string | null;
  guild_name: string | null;
};

function mapEqClassIdToName(classId: number): string {
  switch (classId) {
    case 1:
      return 'WARRIOR';
    case 2:
      return 'CLERIC';
    case 3:
      return 'PALADIN';
    case 4:
      return 'RANGER';
    case 5:
      return 'SHADOWKNIGHT';
    case 6:
      return 'DRUID';
    case 7:
      return 'MONK';
    case 8:
      return 'BARD';
    case 9:
      return 'ROGUE';
    case 10:
      return 'SHAMAN';
    case 11:
      return 'NECROMANCER';
    case 12:
      return 'WIZARD';
    case 13:
      return 'MAGICIAN';
    case 14:
      return 'ENCHANTER';
    case 15:
      return 'BEASTLORD';
    case 16:
      return 'BERSERKER';
    default:
      return 'UNKNOWN';
  }
}

// Cache for schema discovery
let schemaCache: {
  zoneTable: {
    exists: boolean;
    idColumn: string | null;
    longNameColumn: string | null;
    shortNameColumn: string | null;
    hasVersionColumn: boolean;
  } | null;
  guildsTable: { exists: boolean; idColumn: string | null; nameColumn: string | null } | null;
  guildMembersTable: {
    exists: boolean;
    charIdColumn: string | null;
    guildIdColumn: string | null;
  } | null;
  characterDataTable: {
    exists: boolean;
    idColumn: string | null;
    nameColumn: string | null;
    accountIdColumn: string | null;
  } | null;
  accountTable: { exists: boolean; idColumn: string | null; nameColumn: string | null } | null;
  inventoryTable: {
    exists: boolean;
    charIdColumn: string | null;
    slotColumn: string | null;
    itemIdColumn: string | null;
    chargesColumn: string | null;
  } | null;
} = {
  zoneTable: null,
  guildsTable: null,
  guildMembersTable: null,
  characterDataTable: null,
  accountTable: null,
  inventoryTable: null
};

type SlotRange = { start: number; end: number };

const SLOT_GROUPS: Record<ItemOwnershipCharacter['location'], SlotRange[]> = {
  WORN: [{ start: 0, end: 22 }],
  PERSONAL: [
    { start: 23, end: 32 },
    { start: 251, end: 330 },
    { start: 262, end: 341 },
    { start: 4010, end: 4209 },
    { start: 4210, end: 4409 },
    { start: 4410, end: 4609 },
    { start: 4610, end: 4809 },
    { start: 4810, end: 5009 },
    { start: 5010, end: 5209 },
    { start: 5210, end: 5409 },
    { start: 5410, end: 5609 },
    { start: 5610, end: 5809 },
    { start: 5810, end: 6009 }
  ],
  CURSOR: [
    { start: 31, end: 31 },
    { start: 33, end: 33 },
    { start: 342, end: 351 },
    { start: 6010, end: 6209 }
  ],
  BANK: [
    { start: 2000, end: 2023 },
    { start: 2032, end: 2271 },
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

const MAX_REASONABLE_CHARGES = 1000;

async function getTableColumns(tableName: string): Promise<string[]> {
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return rows.map((r) => String(r.col).toLowerCase());
  } catch {
    return [];
  }
}

async function discoverZoneSchema(): Promise<typeof schemaCache.zoneTable> {
  if (schemaCache.zoneTable !== null) {
    return schemaCache.zoneTable;
  }

  const columns = await getTableColumns('zone');
  if (columns.length === 0) {
    schemaCache.zoneTable = {
      exists: false,
      idColumn: null,
      longNameColumn: null,
      shortNameColumn: null,
      hasVersionColumn: false
    };
    return schemaCache.zoneTable;
  }

  // Find the zone ID column - try multiple options since character_data.zone_id might map to different columns
  // Priority: zoneidnumber first (standard EQEmu), then id
  const idCandidates = ['zoneidnumber', 'id', 'zoneid', 'zone_id'];
  const idColumn = idCandidates.find((c) => columns.includes(c)) || null;

  // Find the long name column
  const longNameCandidates = ['long_name', 'longname', 'long'];
  const longNameColumn = longNameCandidates.find((c) => columns.includes(c)) || null;

  // Find the short name column
  const shortNameCandidates = ['short_name', 'shortname', 'short'];
  const shortNameColumn = shortNameCandidates.find((c) => columns.includes(c)) || null;

  // Check if version column exists (zone table often has multiple entries per zone for different versions)
  const hasVersionColumn = columns.includes('version');

  schemaCache.zoneTable = {
    exists: true,
    idColumn,
    longNameColumn,
    shortNameColumn,
    hasVersionColumn
  };
  return schemaCache.zoneTable;
}

async function discoverGuildsSchema(): Promise<typeof schemaCache.guildsTable> {
  if (schemaCache.guildsTable !== null) {
    return schemaCache.guildsTable;
  }

  const columns = await getTableColumns('guilds');
  if (columns.length === 0) {
    schemaCache.guildsTable = { exists: false, idColumn: null, nameColumn: null };
    return schemaCache.guildsTable;
  }

  const idCandidates = ['id', 'guild_id', 'guildid'];
  const idColumn = idCandidates.find((c) => columns.includes(c)) || null;

  const nameCandidates = ['name', 'guild_name', 'guildname'];
  const nameColumn = nameCandidates.find((c) => columns.includes(c)) || null;

  schemaCache.guildsTable = {
    exists: true,
    idColumn,
    nameColumn
  };
  return schemaCache.guildsTable;
}

async function discoverGuildMembersSchema(): Promise<typeof schemaCache.guildMembersTable> {
  if (schemaCache.guildMembersTable !== null) {
    return schemaCache.guildMembersTable;
  }

  const columns = await getTableColumns('guild_members');
  if (columns.length === 0) {
    schemaCache.guildMembersTable = { exists: false, charIdColumn: null, guildIdColumn: null };
    return schemaCache.guildMembersTable;
  }

  // Find character ID column
  const charIdCandidates = ['char_id', 'charid', 'character_id', 'characterid'];
  const charIdColumn = charIdCandidates.find((c) => columns.includes(c)) || null;

  // Find guild ID column
  const guildIdCandidates = ['guild_id', 'guildid'];
  const guildIdColumn = guildIdCandidates.find((c) => columns.includes(c)) || null;

  schemaCache.guildMembersTable = {
    exists: true,
    charIdColumn,
    guildIdColumn
  };
  return schemaCache.guildMembersTable;
}

async function discoverCharacterDataSchema(): Promise<typeof schemaCache.characterDataTable> {
  if (schemaCache.characterDataTable !== null) {
    return schemaCache.characterDataTable;
  }

  const columns = await getTableColumns('character_data');
  if (columns.length === 0) {
    schemaCache.characterDataTable = {
      exists: false,
      idColumn: null,
      nameColumn: null,
      accountIdColumn: null
    };
    return schemaCache.characterDataTable;
  }

  const idCandidates = ['id', 'charid', 'character_id'];
  const nameCandidates = ['name', 'character_name', 'charname'];
  const accountIdCandidates = ['account_id', 'accountid', 'acct_id'];

  schemaCache.characterDataTable = {
    exists: true,
    idColumn: idCandidates.find((column) => columns.includes(column)) || 'id',
    nameColumn: nameCandidates.find((column) => columns.includes(column)) || 'name',
    accountIdColumn: accountIdCandidates.find((column) => columns.includes(column)) || 'account_id'
  };

  return schemaCache.characterDataTable;
}

async function discoverAccountSchema(): Promise<typeof schemaCache.accountTable> {
  if (schemaCache.accountTable !== null) {
    return schemaCache.accountTable;
  }

  const columns = await getTableColumns('account');
  if (columns.length === 0) {
    schemaCache.accountTable = { exists: false, idColumn: null, nameColumn: null };
    return schemaCache.accountTable;
  }

  const idCandidates = ['id', 'account_id', 'accountid'];
  const nameCandidates = ['name', 'account_name', 'accountname'];

  schemaCache.accountTable = {
    exists: true,
    idColumn: idCandidates.find((column) => columns.includes(column)) || 'id',
    nameColumn: nameCandidates.find((column) => columns.includes(column)) || 'name'
  };

  return schemaCache.accountTable;
}

async function discoverInventorySchema(): Promise<typeof schemaCache.inventoryTable> {
  if (schemaCache.inventoryTable !== null) {
    return schemaCache.inventoryTable;
  }

  const columns = await getTableColumns('inventory');
  if (columns.length === 0) {
    schemaCache.inventoryTable = {
      exists: false,
      charIdColumn: null,
      slotColumn: null,
      itemIdColumn: null,
      chargesColumn: null
    };
    return schemaCache.inventoryTable;
  }

  const charIdCandidates = ['charid', 'char_id', 'character_id', 'characterid'];
  const slotCandidates = ['slotid', 'slot_id', 'slot'];
  const itemIdCandidates = ['itemid', 'item_id', 'item_id1'];
  const chargesCandidates = ['charges', 'stacksize', 'stack_size'];

  schemaCache.inventoryTable = {
    exists: true,
    charIdColumn: charIdCandidates.find((column) => columns.includes(column)) || null,
    slotColumn: slotCandidates.find((column) => columns.includes(column)) || null,
    itemIdColumn: itemIdCandidates.find((column) => columns.includes(column)) || null,
    chargesColumn: chargesCandidates.find((column) => columns.includes(column)) || null
  };

  return schemaCache.inventoryTable;
}

function isSlotInRange(slotId: number, ranges: SlotRange[]): boolean {
  return ranges.some((range) => slotId >= range.start && slotId <= range.end);
}

function resolveSlotCategory(slotId: number): ItemOwnershipCharacter['location'] | null {
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

function computeQuantity(charges: unknown): number {
  if (typeof charges !== 'number' || !Number.isFinite(charges) || charges <= 0) {
    return 1;
  }

  if (charges > MAX_REASONABLE_CHARGES) {
    return 1;
  }

  return charges;
}

/**
 * Fetch all currently connected characters from the EQEmu server
 */
export async function fetchServerConnections(): Promise<ServerConnection[]> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable connections lookup.'
    );
  }

  // Discover schemas
  const [zoneSchema, guildsSchema, guildMembersSchema] = await Promise.all([
    discoverZoneSchema(),
    discoverGuildsSchema(),
    discoverGuildMembersSchema()
  ]);

  // Build query dynamically based on available tables and columns
  let selectFields = `
    c.connectid,
    c.ip,
    c.accountid,
    c.characterid,
    cd.name,
    cd.level,
    cd.class,
    cd.zone_id`;

  let joins = `
    FROM connections c
    LEFT JOIN character_data cd ON c.characterid = cd.id`;

  // Add zone join - try zoneidnumber first, then id
  const canJoinZone =
    zoneSchema?.exists &&
    zoneSchema.idColumn &&
    (zoneSchema.longNameColumn || zoneSchema.shortNameColumn);
  if (canJoinZone) {
    if (zoneSchema.longNameColumn) {
      selectFields += `,
      z.${zoneSchema.longNameColumn} as zone_long_name`;
    } else {
      selectFields += `,
      NULL as zone_long_name`;
    }
    if (zoneSchema.shortNameColumn) {
      selectFields += `,
      z.${zoneSchema.shortNameColumn} as zone_short_name`;
    } else {
      selectFields += `,
      NULL as zone_short_name`;
    }
    // Try joining on zoneidnumber first, if that's not the id column, also try id
    // Use MIN(version) subquery to avoid duplicates and handle zones that only have version > 0
    if (zoneSchema.hasVersionColumn) {
      joins += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}
      AND z.version = (SELECT MIN(z2.version) FROM zone z2 WHERE z2.${zoneSchema.idColumn} = cd.zone_id)`;
    } else {
      joins += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}`;
    }
  } else {
    selectFields += `,
      NULL as zone_long_name,
      NULL as zone_short_name`;
  }

  // Add guild join through guild_members table
  const canJoinGuilds =
    guildsSchema?.exists &&
    guildsSchema.idColumn &&
    guildsSchema.nameColumn &&
    guildMembersSchema?.exists &&
    guildMembersSchema.charIdColumn &&
    guildMembersSchema.guildIdColumn;
  if (canJoinGuilds) {
    selectFields += `,
      g.${guildsSchema.nameColumn} as guild_name`;
    joins += `
    LEFT JOIN guild_members gm ON cd.id = gm.${guildMembersSchema.charIdColumn}
    LEFT JOIN guilds g ON gm.${guildMembersSchema.guildIdColumn} = g.${guildsSchema.idColumn}`;
  } else {
    selectFields += `,
      NULL as guild_name`;
  }

  // Use GROUP BY to prevent duplicates from guild_members join (if character has multiple guild entries)
  const query = `SELECT ${selectFields} ${joins} GROUP BY c.connectid ORDER BY cd.name ASC`;

  try {
    const rows = await queryEqDb<ConnectionRow[]>(query);

    return rows.map((row) => ({
      connectId: row.connectid,
      ip: row.ip || '',
      accountId: row.accountid,
      characterId: row.characterid,
      characterName: row.name || 'Unknown',
      level: row.level || 0,
      className: mapEqClassIdToName(row.class),
      classId: row.class || 0,
      zoneName: row.zone_long_name || row.zone_short_name || `Zone ${row.zone_id || 0}`,
      zoneShortName: row.zone_short_name || '',
      guildName: row.guild_name || null,
      // Trader fields - populated later by fetchCharacterLastActivity
      lastActionAt: null,
      lastActionEventTypeId: null,
      lastKillNpcName: null,
      lastKillAt: null,
      hackCount: 0,
      lastHackAt: null,
      lastSaleItemName: null,
      lastSaleItemId: null,
      lastSaleItemIconId: null,
      lastSalePrice: null,
      lastSaleAt: null,
      totalSalesAmount: null,
      totalSalesCount: null
    }));
  } catch (error) {
    console.error('[connectionsService] Full query failed, trying simplified query:', error);

    const simpleQuery = `
      SELECT
        c.connectid,
        c.ip,
        c.accountid,
        c.characterid,
        cd.name,
        cd.level,
        cd.class,
        cd.zone_id
      FROM connections c
      LEFT JOIN character_data cd ON c.characterid = cd.id
      ORDER BY cd.name ASC
    `;

    const rows = await queryEqDb<RowDataPacket[]>(simpleQuery);

    return rows.map((row) => ({
      connectId: row.connectid,
      ip: row.ip || '',
      accountId: row.accountid,
      characterId: row.characterid,
      characterName: row.name || 'Unknown',
      level: row.level || 0,
      className: mapEqClassIdToName(row.class),
      classId: row.class || 0,
      zoneName: `Zone ${row.zone_id || 0}`,
      zoneShortName: '',
      guildName: null,
      // Trader fields - populated later by fetchCharacterLastActivity
      lastActionAt: null,
      lastActionEventTypeId: null,
      lastKillNpcName: null,
      lastKillAt: null,
      hackCount: 0,
      lastHackAt: null,
      lastSaleItemName: null,
      lastSaleItemId: null,
      lastSaleItemIconId: null,
      lastSalePrice: null,
      lastSaleAt: null,
      totalSalesAmount: null,
      totalSalesCount: null
    }));
  }
}

/**
 * Get the count of currently connected characters
 */
export async function getConnectionCount(): Promise<number> {
  if (!isEqDbConfigured()) {
    return 0;
  }

  const query = `SELECT COUNT(*) as count FROM connections`;
  const [row] = await queryEqDb<RowDataPacket[]>(query);
  return Number(row?.count || 0);
}

/**
 * Fetch IP exemptions from the EQEmu database
 * These define custom limits for specific IP addresses
 */
export async function fetchIpExemptions(): Promise<IpExemption[]> {
  if (!isEqDbConfigured()) {
    return [];
  }

  try {
    const query = `SELECT exemption_ip, exemption_amount FROM ip_exemptions`;
    const rows = await queryEqDb<RowDataPacket[]>(query);

    return rows.map((row) => ({
      ip: row.exemption_ip || '',
      exemptionAmount: Number(row.exemption_amount) || 0
    }));
  } catch {
    // Table may not exist, return empty array
    return [];
  }
}

/**
 * Last activity data for a character
 */
export interface CharacterLastActivity {
  characterId: number;
  lastActionAt: string | null;
  lastActionEventTypeId: number | null;
  lastKillNpcName: string | null;
  lastKillAt: string | null;
  hackCount: number;
  lastHackAt: string | null;
  // Trader-specific fields
  lastSaleItemName: string | null;
  lastSaleItemId: number | null;
  lastSaleItemIconId: number | null;
  lastSalePrice: number | null;
  lastSaleAt: string | null;
  totalSalesAmount: number | null;
  totalSalesCount: number | null;
}

type LastActionRow = RowDataPacket & {
  character_id: number;
  last_action_at: string;
  event_type_id: number;
};

type LastKillRow = RowDataPacket & {
  character_id: number;
  npc_name: string | null;
  killed_at: string;
};

type HackCountRow = RowDataPacket & {
  character_id: number;
  hack_count: number;
  last_hack_at: string | null;
};

type LastSaleRow = RowDataPacket & {
  character_id: number;
  item_name: string | null;
  price: number | null;
  sold_at: string;
};

type TotalSalesRow = RowDataPacket & {
  character_id: number;
  total_amount: number;
  total_count: number;
};

type ItemSearchRow = RowDataPacket & {
  item_id: number;
  item_name: string;
  item_icon_id: number | null;
};

type ItemOwnershipRow = RowDataPacket & {
  character_id: number;
  character_name: string;
  account_id: number;
  account_name: string;
  level: number;
  class: number;
  guild_name: string | null;
  slot_id: number;
  charges: number | null;
};

export async function searchItemsForOwnership(
  searchTerm: string,
  limit: number = 20
): Promise<AdminItemSearchResult[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const trimmedSearchTerm = searchTerm.trim();
  const isNumericSearch = /^\d+$/.test(trimmedSearchTerm);
  if (!trimmedSearchTerm || (!isNumericSearch && trimmedSearchTerm.length < 2)) {
    return [];
  }

  const normalizedSearchTerm = trimmedSearchTerm.toLowerCase();
  const namePrefixTerm = `${normalizedSearchTerm}%`;
  const nameContainsTerm = `%${normalizedSearchTerm}%`;
  const numericItemId = isNumericSearch ? Number(trimmedSearchTerm) : null;

  const searchConditions = ['LOWER(i.Name) LIKE ?'];
  const params: Array<string | number> = [nameContainsTerm];

  if (numericItemId !== null && Number.isFinite(numericItemId) && numericItemId > 0) {
    searchConditions.push('i.id = ?');
    params.push(numericItemId);
  }

  const rows = await queryEqDb<ItemSearchRow[]>(
    `
      SELECT
        i.id as item_id,
        i.Name as item_name,
        i.icon as item_icon_id
      FROM items i
      WHERE ${searchConditions.join(' OR ')}
      ORDER BY
        CASE
          WHEN ? IS NOT NULL AND i.id = ? THEN 0
          WHEN LOWER(i.Name) = ? THEN 1
          WHEN LOWER(i.Name) LIKE ? THEN 2
          ELSE 3
        END,
        i.Name ASC
      LIMIT ?
    `,
    [...params, numericItemId, numericItemId ?? 0, normalizedSearchTerm, namePrefixTerm, limit]
  );

  return rows.map((row) => ({
    itemId: Number(row.item_id),
    itemName: String(row.item_name),
    itemIconId: row.item_icon_id != null ? Number(row.item_icon_id) : null
  }));
}

export async function fetchItemOwnership(itemId: number): Promise<ItemOwnershipResult | null> {
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }

  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const [inventorySchema, characterSchema, accountSchema, guildsSchema, guildMembersSchema] =
    await Promise.all([
      discoverInventorySchema(),
      discoverCharacterDataSchema(),
      discoverAccountSchema(),
      discoverGuildsSchema(),
      discoverGuildMembersSchema()
    ]);

  if (
    !inventorySchema?.exists ||
    !inventorySchema.charIdColumn ||
    !inventorySchema.slotColumn ||
    !inventorySchema.itemIdColumn ||
    !characterSchema?.exists ||
    !characterSchema.idColumn ||
    !characterSchema.nameColumn ||
    !characterSchema.accountIdColumn ||
    !accountSchema?.exists ||
    !accountSchema.idColumn ||
    !accountSchema.nameColumn
  ) {
    throw new Error('Could not discover the EQ inventory schema.');
  }

  const itemRows = await queryEqDb<ItemSearchRow[]>(
    `
      SELECT
        i.id as item_id,
        i.Name as item_name,
        i.icon as item_icon_id
      FROM items i
      WHERE i.id = ?
      LIMIT 1
    `,
    [itemId]
  );

  if (itemRows.length === 0) {
    return null;
  }

  const canJoinGuilds = Boolean(
    guildsSchema?.exists &&
    guildsSchema.idColumn &&
    guildsSchema.nameColumn &&
    guildMembersSchema?.exists &&
    guildMembersSchema.charIdColumn &&
    guildMembersSchema.guildIdColumn
  );
  const guildNameSelect =
    canJoinGuilds && guildsSchema?.nameColumn ? `g.\`${guildsSchema.nameColumn}\`` : 'NULL';
  const guildJoinClause =
    canJoinGuilds &&
    guildMembersSchema?.charIdColumn &&
    guildMembersSchema.guildIdColumn &&
    guildsSchema?.idColumn
      ? `
      LEFT JOIN guild_members gm ON cd.\`${characterSchema.idColumn}\` = gm.\`${guildMembersSchema.charIdColumn}\`
      LEFT JOIN guilds g ON gm.\`${guildMembersSchema.guildIdColumn}\` = g.\`${guildsSchema.idColumn}\``
      : '';

  const ownershipRows = await queryEqDb<ItemOwnershipRow[]>(
    `
      SELECT DISTINCT
        cd.\`${characterSchema.idColumn}\` as character_id,
        cd.\`${characterSchema.nameColumn}\` as character_name,
        cd.\`${characterSchema.accountIdColumn}\` as account_id,
        a.\`${accountSchema.nameColumn}\` as account_name,
        cd.level,
        cd.class,
        ${guildNameSelect} as guild_name,
        inv.\`${inventorySchema.slotColumn}\` as slot_id,
        ${inventorySchema.chargesColumn ? `inv.\`${inventorySchema.chargesColumn}\`` : 'NULL'} as charges
      FROM inventory inv
      JOIN character_data cd ON inv.\`${inventorySchema.charIdColumn}\` = cd.\`${characterSchema.idColumn}\`
      JOIN account a ON cd.\`${characterSchema.accountIdColumn}\` = a.\`${accountSchema.idColumn}\`
      ${guildJoinClause}
      WHERE inv.\`${inventorySchema.itemIdColumn}\` = ?
        AND (${SLOT_WHERE_CLAUSE.replace(/inv\.slotid/g, `inv.\`${inventorySchema.slotColumn}\``)})
      ORDER BY cd.\`${characterSchema.nameColumn}\` ASC, inv.\`${inventorySchema.slotColumn}\` ASC
    `,
    [itemId]
  );

  const owners: ItemOwnershipCharacter[] = ownershipRows
    .map((row) => {
      const slotId = Number(row.slot_id);
      const location = resolveSlotCategory(slotId);
      if (!location) {
        return null;
      }

      return {
        characterId: Number(row.character_id),
        characterName: String(row.character_name),
        accountId: Number(row.account_id),
        accountName: String(row.account_name),
        level: Number(row.level) || 0,
        className: mapEqClassIdToName(Number(row.class)),
        classId: Number(row.class) || 0,
        guildName: row.guild_name ? String(row.guild_name) : null,
        slotId,
        location,
        quantity: computeQuantity(row.charges)
      };
    })
    .filter((owner): owner is ItemOwnershipCharacter => owner !== null);

  const totalCharacterCount = new Set(owners.map((owner) => owner.characterId)).size;
  const totalItemCount = owners.reduce((sum, owner) => sum + owner.quantity, 0);
  const item = itemRows[0];

  return {
    item: {
      itemId: Number(item.item_id),
      itemName: String(item.item_name),
      itemIconId: item.item_icon_id != null ? Number(item.item_icon_id) : null
    },
    owners,
    totalCharacterCount,
    totalItemCount
  };
}

/**
 * Fetch last activity data for a batch of character IDs
 * Returns last action timestamp and last kill info for each character
 */
export async function fetchCharacterLastActivity(
  characterIds: number[]
): Promise<Map<number, CharacterLastActivity>> {
  const result = new Map<number, CharacterLastActivity>();

  if (!isEqDbConfigured() || characterIds.length === 0) {
    return result;
  }

  // Initialize all characters with null/zero values
  for (const charId of characterIds) {
    result.set(charId, {
      characterId: charId,
      lastActionAt: null,
      lastActionEventTypeId: null,
      lastKillNpcName: null,
      lastKillAt: null,
      hackCount: 0,
      lastHackAt: null,
      lastSaleItemName: null,
      lastSaleItemId: null,
      lastSaleItemIconId: null,
      lastSalePrice: null,
      lastSaleAt: null,
      totalSalesAmount: null,
      totalSalesCount: null
    });
  }

  const placeholders = characterIds.map(() => '?').join(',');

  try {
    // Query 1: Get last action timestamp and event type for each character
    // Using a subquery approach for better performance with indexes
    const lastActionQuery = `
      SELECT pel.character_id, pel.created_at as last_action_at, pel.event_type_id
      FROM player_event_logs pel
      INNER JOIN (
        SELECT character_id, MAX(created_at) as max_created_at
        FROM player_event_logs
        WHERE character_id IN (${placeholders})
        GROUP BY character_id
      ) latest ON pel.character_id = latest.character_id AND pel.created_at = latest.max_created_at
      WHERE pel.character_id IN (${placeholders})
      GROUP BY pel.character_id
    `;

    const lastActionRows = await queryEqDb<LastActionRow[]>(lastActionQuery, [
      ...characterIds,
      ...characterIds
    ]);

    for (const row of lastActionRows) {
      const activity = result.get(row.character_id);
      if (activity) {
        activity.lastActionAt = row.last_action_at;
        activity.lastActionEventTypeId = row.event_type_id;
      }
    }

    // Query 2: Get last kill info for each character
    // Kill event types: 44 (KILLED_NPC), 45 (KILLED_NAMED_NPC), 46 (KILLED_RAID_NPC)
    const lastKillQuery = `
      SELECT pel.character_id, pel.event_data, pel.created_at as killed_at
      FROM player_event_logs pel
      INNER JOIN (
        SELECT character_id, MAX(created_at) as max_created_at
        FROM player_event_logs
        WHERE character_id IN (${placeholders})
          AND event_type_id IN (44, 45, 46)
        GROUP BY character_id
      ) latest ON pel.character_id = latest.character_id AND pel.created_at = latest.max_created_at
      WHERE pel.character_id IN (${placeholders})
        AND pel.event_type_id IN (44, 45, 46)
      GROUP BY pel.character_id
    `;

    const lastKillRows = await queryEqDb<LastKillRow[]>(lastKillQuery, [
      ...characterIds,
      ...characterIds
    ]);

    for (const row of lastKillRows) {
      const activity = result.get(row.character_id);
      if (activity) {
        activity.lastKillAt = row.killed_at;

        // Parse event_data to get NPC name
        if (row.npc_name) {
          activity.lastKillNpcName = row.npc_name;
        } else {
          // event_data is stored as JSON, try to extract npc_name
          try {
            const eventData = JSON.parse((row as RowDataPacket).event_data || '{}');
            activity.lastKillNpcName = eventData.npc_name || eventData.npcName || null;
          } catch {
            activity.lastKillNpcName = null;
          }
        }
      }
    }

    // Query 3: Get hack count and most recent hack timestamp for each character
    // Event type 43 = POSSIBLE_HACK
    const hackCountQuery = `
      SELECT character_id, COUNT(*) as hack_count, MAX(created_at) as last_hack_at
      FROM player_event_logs
      WHERE character_id IN (${placeholders})
        AND event_type_id = 43
      GROUP BY character_id
    `;

    const hackCountRows = await queryEqDb<HackCountRow[]>(hackCountQuery, characterIds);

    for (const row of hackCountRows) {
      const activity = result.get(row.character_id);
      if (activity) {
        activity.hackCount = row.hack_count;
        activity.lastHackAt = row.last_hack_at;
      }
    }

    // Query 4: Get last sale for each character (TRADER_SELL = event_type_id 39)
    const lastSaleQuery = `
      SELECT pel.character_id, pel.event_data, pel.created_at as sold_at
      FROM player_event_logs pel
      INNER JOIN (
        SELECT character_id, MAX(created_at) as max_created_at
        FROM player_event_logs
        WHERE character_id IN (${placeholders})
          AND event_type_id = 39
        GROUP BY character_id
      ) latest ON pel.character_id = latest.character_id AND pel.created_at = latest.max_created_at
      WHERE pel.character_id IN (${placeholders})
        AND pel.event_type_id = 39
      GROUP BY pel.character_id
    `;

    const lastSaleRows = await queryEqDb<LastSaleRow[]>(lastSaleQuery, [
      ...characterIds,
      ...characterIds
    ]);

    // Track items that need icon lookups
    const iconLookups: Array<{ activity: CharacterLastActivity; itemId: number }> = [];

    for (const row of lastSaleRows) {
      const activity = result.get(row.character_id);
      if (activity) {
        activity.lastSaleAt = row.sold_at;
        // Parse event_data to get item name, id, icon, and price
        try {
          const eventData = JSON.parse((row as RowDataPacket).event_data || '{}');
          activity.lastSaleItemName = eventData.item_name || eventData.itemName || null;
          activity.lastSaleItemId = eventData.item_id ?? eventData.itemId ?? null;
          activity.lastSaleItemIconId =
            eventData.item_icon ?? eventData.itemIcon ?? eventData.icon ?? null;
          activity.lastSalePrice =
            eventData.total_cost ?? eventData.totalCost ?? eventData.price ?? null;

          // If we have an item_id but no icon, queue for lookup from items table
          if (activity.lastSaleItemId && !activity.lastSaleItemIconId) {
            iconLookups.push({ activity, itemId: activity.lastSaleItemId });
          }
        } catch {
          activity.lastSaleItemName = null;
          activity.lastSaleItemId = null;
          activity.lastSaleItemIconId = null;
          activity.lastSalePrice = null;
        }
      }
    }

    // Look up icons from items table for items that didn't have icons in event_data
    if (iconLookups.length > 0) {
      const iconResults = await Promise.all(
        iconLookups.map(async ({ activity, itemId }) => {
          const iconId = await getItemIconId(itemId);
          return { activity, iconId };
        })
      );
      for (const { activity, iconId } of iconResults) {
        activity.lastSaleItemIconId = iconId;
      }
    }

    // Query 5: Get total sales for each character (sum of total_cost and count)
    const totalSalesQuery = `
      SELECT character_id, SUM(
        CAST(JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.total_cost')) AS UNSIGNED)
      ) as total_amount, COUNT(*) as total_count
      FROM player_event_logs
      WHERE character_id IN (${placeholders})
        AND event_type_id = 39
      GROUP BY character_id
    `;

    const totalSalesRows = await queryEqDb<TotalSalesRow[]>(totalSalesQuery, characterIds);

    for (const row of totalSalesRows) {
      const activity = result.get(row.character_id);
      if (activity) {
        activity.totalSalesAmount = row.total_amount || 0;
        activity.totalSalesCount = row.total_count || 0;
      }
    }
  } catch (error) {
    console.error('[connectionsService] Error fetching character last activity:', error);
    // Return partial results or empty map on error
  }

  return result;
}
