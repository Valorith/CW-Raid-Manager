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

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getTableCount(tableName: string): Promise<number> {
  try {
    const exists = await tableExists(tableName);
    if (!exists) return 0;

    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM \`${tableName}\``
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getLootManagementSummary(): Promise<LootManagementSummary> {
  ensureEqDbConfigured();

  const [lootMasterCount, lcItemsCount, lcRequestsCount, lcVotesCount] = await Promise.all([
    getTableCount('loot_master'),
    getTableCount('lc_items'),
    getTableCount('lc_requests'),
    getTableCount('lc_votes')
  ]);

  return {
    lootMasterCount,
    lcItemsCount,
    lcRequestsCount,
    lcVotesCount
  };
}

export async function fetchLootMaster(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LootMasterEntry>> {
  ensureEqDbConfigured();

  const exists = await tableExists('loot_master');
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

  const countQuery = `SELECT COUNT(*) as total FROM loot_master ${whereClause}`;
  const countRows = await queryEqDb<RowDataPacket[]>(countQuery, params);
  const total = Number(countRows[0]?.total ?? 0);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const dataQuery = `
    SELECT * FROM loot_master
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await queryEqDb<LootMasterRow[]>(dataQuery, [...params, pageSize, offset]);

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
}

export async function fetchLcItems(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcItemEntry>> {
  ensureEqDbConfigured();

  const exists = await tableExists('lc_items');
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

  const countQuery = `SELECT COUNT(*) as total FROM lc_items ${whereClause}`;
  const countRows = await queryEqDb<RowDataPacket[]>(countQuery, params);
  const total = Number(countRows[0]?.total ?? 0);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const dataQuery = `
    SELECT * FROM lc_items
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await queryEqDb<LcItemRow[]>(dataQuery, [...params, pageSize, offset]);

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
}

export async function fetchLcRequests(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcRequestEntry>> {
  ensureEqDbConfigured();

  const exists = await tableExists('lc_requests');
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

  const countQuery = `SELECT COUNT(*) as total FROM lc_requests ${whereClause}`;
  const countRows = await queryEqDb<RowDataPacket[]>(countQuery, params);
  const total = Number(countRows[0]?.total ?? 0);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const dataQuery = `
    SELECT * FROM lc_requests
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await queryEqDb<LcRequestRow[]>(dataQuery, [...params, pageSize, offset]);

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
}

export async function fetchLcVotes(
  page: number = 1,
  pageSize: number = 25,
  search?: string
): Promise<PaginatedResult<LcVoteEntry>> {
  ensureEqDbConfigured();

  const exists = await tableExists('lc_votes');
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

  const countQuery = `SELECT COUNT(*) as total FROM lc_votes ${whereClause}`;
  const countRows = await queryEqDb<RowDataPacket[]>(countQuery, params);
  const total = Number(countRows[0]?.total ?? 0);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const dataQuery = `
    SELECT * FROM lc_votes
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await queryEqDb<LcVoteRow[]>(dataQuery, [...params, pageSize, offset]);

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
}
