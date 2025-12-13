import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

export interface LootMasterEntry {
  id: number;
  itemId: number;
  itemName: string | null;
  npcName: string | null;
  zoneName: string | null;
  dropChance: number | null;
  createdAt: string | null;
}

export interface LcItemEntry {
  id: number;
  itemId: number;
  itemName: string | null;
  raidId: number;
  npcId: number;
  status: number | null;
  type: number | null;
  awardee: number | null;
}

export interface LcRequestEntry {
  id: number;
  eventId: number;
  charId: number;
  itemId: number;
  itemName: string | null;
  replacedItemId: number | null;
}

export interface LcVoteEntry {
  id: number;
  requestId: number;
  voterId: number;
  voterName: string | null;
  itemName: string | null;
  characterName: string | null;
  vote: string | null;
  voteDate: string | null;
  reason: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LootManagementSummary {
  lootMasterCount: number;
  lcItemsCount: number;
  lcRequestsCount: number;
  lcVotesCount: number;
}

type LootMasterRow = RowDataPacket & {
  id: number;
  item_id?: number;
  itemid?: number;
  item_name?: string;
  itemname?: string;
  npc_name?: string;
  npcname?: string;
  zone_name?: string;
  zonename?: string;
  zone?: string;
  drop_chance?: number;
  dropchance?: number;
  chance?: number;
  created_at?: string;
  createdat?: string;
  date?: string;
};

type LcItemRow = RowDataPacket & {
  id: number;
  item_id?: number;
  itemid?: number;
  item_name?: string;
  itemname?: string;
  raid_name?: string;
  raidname?: string;
  raid?: string;
  date_added?: string;
  dateadded?: string;
  created_at?: string;
  status?: string;
};

type LcRequestRow = RowDataPacket & {
  id: number;
  item_id?: number;
  itemid?: number;
  item_name?: string;
  itemname?: string;
  character_name?: string;
  charactername?: string;
  char_name?: string;
  class_name?: string;
  classname?: string;
  class?: string;
  request_date?: string;
  requestdate?: string;
  created_at?: string;
  priority?: number;
  notes?: string;
  status?: string;
};

type LcVoteRow = RowDataPacket & {
  id: number;
  request_id?: number;
  requestid?: number;
  voter_id?: number;
  voterid?: number;
  voter_name?: string;
  votername?: string;
  item_name?: string;
  itemname?: string;
  character_name?: string;
  charactername?: string;
  vote?: string;
  vote_value?: string;
  vote_date?: string;
  votedate?: string;
  created_at?: string;
  reason?: string;
  comment?: string;
};

function ensureEqDbConfigured(): void {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured. Set EQ_DB_HOST, EQ_DB_USER, EQ_DB_PASSWORD, and EQ_DB_NAME.'
    );
  }
}

// Cache for table existence checks - tables don't change at runtime
const tableExistsCache = new Map<string, boolean>();
const tableColumnsCache = new Map<string, string[]>();

// Get column names for a table
async function getTableColumns(tableName: string): Promise<string[]> {
  const cached = tableColumnsCache.get(tableName);
  if (cached) return cached;

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as columnName FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    const columns = rows.map((r) => String(r.columnName).toLowerCase());
    tableColumnsCache.set(tableName, columns);
    return columns;
  } catch {
    return [];
  }
}

// Helper to find the first matching value from a row given possible column names
function findValue<T>(row: RowDataPacket, possibleNames: string[], defaultVal: T): T {
  for (const name of possibleNames) {
    // Check exact match first
    if (row[name] !== undefined) return row[name] as T;
    // Check lowercase version
    const lower = name.toLowerCase();
    if (row[lower] !== undefined) return row[lower] as T;
  }
  // Check all row keys for partial matches
  const rowKeys = Object.keys(row);
  for (const name of possibleNames) {
    const baseName = name.replace(/_/g, '').toLowerCase();
    for (const key of rowKeys) {
      if (key.toLowerCase().replace(/_/g, '') === baseName && row[key] !== undefined) {
        return row[key] as T;
      }
    }
  }
  return defaultVal;
}

async function checkTableExists(tableName: string): Promise<boolean> {
  const cached = tableExistsCache.get(tableName);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    const exists = rows.length > 0;
    tableExistsCache.set(tableName, exists);
    return exists;
  } catch {
    tableExistsCache.set(tableName, false);
    return false;
  }
}

// Get all table existence in a single query
async function getExistingTables(): Promise<Set<string>> {
  const tableNames = ['loot_master', 'lc_items', 'lc_requests', 'lc_votes'];

  // Check cache first
  const allCached = tableNames.every((name) => tableExistsCache.has(name));
  if (allCached) {
    return new Set(tableNames.filter((name) => tableExistsCache.get(name)));
  }

  try {
    const placeholders = tableNames.map(() => '?').join(', ');
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT TABLE_NAME as tableName FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
      tableNames
    );

    const existing = new Set<string>();
    for (const row of rows) {
      const name = row.tableName as string;
      existing.add(name);
      tableExistsCache.set(name, true);
    }

    // Cache non-existing tables too
    for (const name of tableNames) {
      if (!existing.has(name)) {
        tableExistsCache.set(name, false);
      }
    }

    return existing;
  } catch {
    return new Set();
  }
}

export async function getLootManagementSummary(): Promise<LootManagementSummary> {
  ensureEqDbConfigured();

  const existingTables = await getExistingTables();

  // Build a single query to get all counts at once
  const countParts: string[] = [];

  if (existingTables.has('loot_master')) {
    countParts.push(`(SELECT COUNT(*) FROM loot_master) as loot_master_count`);
  }
  if (existingTables.has('lc_items')) {
    countParts.push(`(SELECT COUNT(*) FROM lc_items) as lc_items_count`);
  }
  if (existingTables.has('lc_requests')) {
    countParts.push(`(SELECT COUNT(*) FROM lc_requests) as lc_requests_count`);
  }
  if (existingTables.has('lc_votes')) {
    countParts.push(`(SELECT COUNT(*) FROM lc_votes) as lc_votes_count`);
  }

  if (countParts.length === 0) {
    return {
      lootMasterCount: 0,
      lcItemsCount: 0,
      lcRequestsCount: 0,
      lcVotesCount: 0
    };
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(`SELECT ${countParts.join(', ')}`);
    const row = rows[0] ?? {};

    return {
      lootMasterCount: Number(row.loot_master_count ?? 0),
      lcItemsCount: Number(row.lc_items_count ?? 0),
      lcRequestsCount: Number(row.lc_requests_count ?? 0),
      lcVotesCount: Number(row.lc_votes_count ?? 0)
    };
  } catch {
    return {
      lootMasterCount: 0,
      lcItemsCount: 0,
      lcRequestsCount: 0,
      lcVotesCount: 0
    };
  }
}

export async function fetchLootMaster(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LootMasterEntry>> {
  ensureEqDbConfigured();

  const exists = await checkTableExists('loot_master');
  if (!exists) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const offset = (page - 1) * pageSize;
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE item_name LIKE ? OR npc_name LIKE ? OR zone_name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  // Use SQL_CALC_FOUND_ROWS to get count and data in fewer round trips
  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS * FROM loot_master
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LootMasterRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    const data: LootMasterEntry[] = rows.map((row) => ({
      id: row.id,
      itemId: findValue<number>(row, ['item_id', 'itemid', 'itemID', 'ItemId'], 0),
      itemName: findValue<string | null>(row, ['item_name', 'itemname', 'ItemName', 'name', 'Name'], null),
      npcName: findValue<string | null>(row, ['npc_name', 'npcname', 'NpcName', 'npc', 'Npc', 'mob', 'Mob'], null),
      zoneName: findValue<string | null>(row, ['zone_name', 'zonename', 'ZoneName', 'zone', 'Zone'], null),
      dropChance: findValue<number | null>(row, ['drop_chance', 'dropchance', 'DropChance', 'chance', 'Chance', 'rate', 'Rate'], null),
      createdAt: findValue<string | null>(row, ['created_at', 'createdat', 'CreatedAt', 'date', 'Date', 'timestamp'], null)
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }
}

export async function fetchLcItems(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcItemEntry>> {
  ensureEqDbConfigured();

  const exists = await checkTableExists('lc_items');
  if (!exists) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const offset = (page - 1) * pageSize;
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE i.Name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern);
  }

  // JOIN with items table to get item names
  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS
      lc.id, lc.guildid, lc.raidid, lc.npcid, lc.itemid, lc.status, lc.type, lc.awardee,
      i.Name as item_name
    FROM lc_items lc
    LEFT JOIN items i ON lc.itemid = i.id
    ${whereClause}
    ORDER BY lc.id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LcItemRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    const data: LcItemEntry[] = rows.map((row) => ({
      id: row.id,
      itemId: findValue<number>(row, ['itemid', 'item_id', 'itemID', 'ItemId'], 0),
      itemName: findValue<string | null>(row, ['item_name', 'Name', 'name', 'itemname'], null),
      raidId: findValue<number>(row, ['raidid', 'raid_id'], 0),
      npcId: findValue<number>(row, ['npcid', 'npc_id'], 0),
      status: findValue<number | null>(row, ['status', 'Status'], null),
      type: findValue<number | null>(row, ['type', 'Type'], null),
      awardee: findValue<number | null>(row, ['awardee', 'Awardee', 'awarded_to'], null)
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }
}

export async function fetchLcRequests(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcRequestEntry>> {
  ensureEqDbConfigured();

  const exists = await checkTableExists('lc_requests');
  if (!exists) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const offset = (page - 1) * pageSize;
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE i.Name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern);
  }

  // JOIN with items table to get item names
  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS
      lr.*,
      i.Name as item_name
    FROM lc_requests lr
    LEFT JOIN items i ON lr.itemid = i.id
    ${whereClause}
    ORDER BY lr.id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LcRequestRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    // Log actual columns for debugging
    if (rows.length > 0) {
      console.log('[LC_REQUESTS] Actual columns:', Object.keys(rows[0]));
      console.log('[LC_REQUESTS] First row sample:', JSON.stringify(rows[0], null, 2));
    }

    const data: LcRequestEntry[] = rows.map((row) => ({
      id: row.id,
      eventId: findValue<number>(row, ['eventid', 'event_id', 'EventId'], 0),
      charId: findValue<number>(row, ['charid', 'char_id', 'CharId', 'character_id'], 0),
      itemId: findValue<number>(row, ['itemid', 'item_id', 'itemID', 'ItemId'], 0),
      itemName: findValue<string | null>(row, ['item_name', 'Name', 'name', 'itemname'], null),
      replacedItemId: findValue<number | null>(row, ['replaceditemid', 'replaced_item_id', 'ReplacedItemId'], null)
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }
}

export async function fetchLcVotes(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcVoteEntry>> {
  ensureEqDbConfigured();

  const exists = await checkTableExists('lc_votes');
  if (!exists) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const offset = (page - 1) * pageSize;
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE voter_name LIKE ? OR item_name LIKE ? OR character_name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS * FROM lc_votes
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LcVoteRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    // Log actual columns for debugging
    if (rows.length > 0) {
      console.log('[LC_VOTES] Actual columns:', Object.keys(rows[0]));
      console.log('[LC_VOTES] First row sample:', JSON.stringify(rows[0], null, 2));
    }

    const data: LcVoteEntry[] = rows.map((row) => ({
      id: row.id,
      requestId: findValue<number>(row, ['request_id', 'requestid', 'RequestId', 'req_id', 'reqid'], 0),
      voterId: findValue<number>(row, ['voter_id', 'voterid', 'VoterId', 'user_id', 'userid'], 0),
      voterName: findValue<string | null>(row, ['voter_name', 'votername', 'VoterName', 'voter', 'Voter', 'user', 'User'], null),
      itemName: findValue<string | null>(row, ['item_name', 'itemname', 'ItemName', 'name', 'Name'], null),
      characterName: findValue<string | null>(row, ['character_name', 'charactername', 'CharacterName', 'char_name', 'charname', 'player', 'Player'], null),
      vote: findValue<string | null>(row, ['vote', 'Vote', 'vote_value', 'voteValue', 'value', 'Value'], null),
      voteDate: findValue<string | null>(row, ['vote_date', 'votedate', 'VoteDate', 'created_at', 'createdAt', 'date', 'Date', 'timestamp'], null),
      reason: findValue<string | null>(row, ['reason', 'Reason', 'comment', 'Comment', 'note', 'Note', 'notes', 'Notes'], null)
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }
}
