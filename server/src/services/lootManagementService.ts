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
  raidName: string | null;
  dateAdded: string | null;
  status: string | null;
}

export interface LcRequestEntry {
  id: number;
  itemId: number;
  itemName: string | null;
  characterName: string | null;
  className: string | null;
  requestDate: string | null;
  priority: number | null;
  notes: string | null;
  status: string | null;
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
      itemId: row.item_id ?? row.itemid ?? 0,
      itemName: row.item_name ?? row.itemname ?? null,
      npcName: row.npc_name ?? row.npcname ?? null,
      zoneName: row.zone_name ?? row.zonename ?? row.zone ?? null,
      dropChance: row.drop_chance ?? row.dropchance ?? row.chance ?? null,
      createdAt: row.created_at ?? row.createdat ?? row.date ?? null
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
    whereClause = `WHERE item_name LIKE ? OR raid_name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern);
  }

  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS * FROM lc_items
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LcItemRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    const data: LcItemEntry[] = rows.map((row) => ({
      id: row.id,
      itemId: row.item_id ?? row.itemid ?? 0,
      itemName: row.item_name ?? row.itemname ?? null,
      raidName: row.raid_name ?? row.raidname ?? row.raid ?? null,
      dateAdded: row.date_added ?? row.dateadded ?? row.created_at ?? null,
      status: row.status ?? null
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
    whereClause = `WHERE item_name LIKE ? OR character_name LIKE ? OR class_name LIKE ?`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS * FROM lc_requests
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const rows = await queryEqDb<LcRequestRow[]>(dataQuery, [...params, pageSize, offset]);
    const countRows = await queryEqDb<RowDataPacket[]>(`SELECT FOUND_ROWS() as total`);
    const total = Number(countRows[0]?.total ?? 0);

    const data: LcRequestEntry[] = rows.map((row) => ({
      id: row.id,
      itemId: row.item_id ?? row.itemid ?? 0,
      itemName: row.item_name ?? row.itemname ?? null,
      characterName: row.character_name ?? row.charactername ?? row.char_name ?? null,
      className: row.class_name ?? row.classname ?? row.class ?? null,
      requestDate: row.request_date ?? row.requestdate ?? row.created_at ?? null,
      priority: row.priority ?? null,
      notes: row.notes ?? null,
      status: row.status ?? null
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

    const data: LcVoteEntry[] = rows.map((row) => ({
      id: row.id,
      requestId: row.request_id ?? row.requestid ?? 0,
      voterId: row.voter_id ?? row.voterid ?? 0,
      voterName: row.voter_name ?? row.votername ?? null,
      itemName: row.item_name ?? row.itemname ?? null,
      characterName: row.character_name ?? row.charactername ?? null,
      vote: row.vote ?? row.vote_value ?? null,
      voteDate: row.vote_date ?? row.votedate ?? row.created_at ?? null,
      reason: row.reason ?? row.comment ?? null
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
