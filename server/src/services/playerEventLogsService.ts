import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

/**
 * Event type IDs mapped to their names
 */
export const EVENT_TYPE_MAP: Record<number, string> = {
  1: 'GM_COMMAND',
  2: 'ZONING',
  3: 'AA_GAIN',
  4: 'AA_PURCHASE',
  5: 'FORAGE_SUCCESS',
  6: 'FORAGE_FAILURE',
  7: 'FISH_SUCCESS',
  8: 'FISH_FAILURE',
  9: 'ITEM_DESTROY',
  10: 'WENT_ONLINE',
  11: 'WENT_OFFLINE',
  12: 'LEVEL_GAIN',
  13: 'LEVEL_LOSS',
  14: 'LOOT_ITEM',
  15: 'MERCHANT_PURCHASE',
  16: 'MERCHANT_SELL',
  17: 'GROUP_JOIN',
  18: 'GROUP_LEAVE',
  19: 'RAID_JOIN',
  20: 'RAID_LEAVE',
  21: 'GROUNDSPAWN_PICKUP',
  22: 'NPC_HANDIN',
  23: 'SKILL_UP',
  24: 'TASK_ACCEPT',
  25: 'TASK_UPDATE',
  26: 'TASK_COMPLETE',
  27: 'TRADE',
  28: 'GIVE_ITEM',
  29: 'SAY',
  30: 'REZ_ACCEPTED',
  31: 'DEATH',
  32: 'COMBINE_FAILURE',
  33: 'COMBINE_SUCCESS',
  34: 'DROPPED_ITEM',
  35: 'SPLIT_MONEY',
  36: 'DZ_JOIN',
  37: 'DZ_LEAVE',
  38: 'TRADER_PURCHASE',
  39: 'TRADER_SELL',
  40: 'BANDOLIER_CREATE',
  41: 'BANDOLIER_SWAP',
  42: 'DISCOVER_ITEM',
  43: 'POSSIBLE_HACK',
  44: 'KILLED_NPC',
  45: 'KILLED_NAMED_NPC',
  46: 'KILLED_RAID_NPC',
  47: 'ITEM_CREATION'
};

/**
 * Event type display labels (human readable)
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  GM_COMMAND: 'GM Command',
  ZONING: 'Zoning',
  AA_GAIN: 'AA Gain',
  AA_PURCHASE: 'AA Purchase',
  FORAGE_SUCCESS: 'Forage Success',
  FORAGE_FAILURE: 'Forage Failure',
  FISH_SUCCESS: 'Fish Success',
  FISH_FAILURE: 'Fish Failure',
  ITEM_DESTROY: 'Item Destroyed',
  WENT_ONLINE: 'Went Online',
  WENT_OFFLINE: 'Went Offline',
  LEVEL_GAIN: 'Level Gain',
  LEVEL_LOSS: 'Level Loss',
  LOOT_ITEM: 'Loot Item',
  MERCHANT_PURCHASE: 'Merchant Purchase',
  MERCHANT_SELL: 'Merchant Sell',
  GROUP_JOIN: 'Group Join',
  GROUP_LEAVE: 'Group Leave',
  RAID_JOIN: 'Raid Join',
  RAID_LEAVE: 'Raid Leave',
  GROUNDSPAWN_PICKUP: 'Groundspawn Pickup',
  NPC_HANDIN: 'NPC Handin',
  SKILL_UP: 'Skill Up',
  TASK_ACCEPT: 'Task Accept',
  TASK_UPDATE: 'Task Update',
  TASK_COMPLETE: 'Task Complete',
  TRADE: 'Trade',
  GIVE_ITEM: 'Give Item',
  SAY: 'Say',
  REZ_ACCEPTED: 'Rez Accepted',
  DEATH: 'Death',
  COMBINE_FAILURE: 'Combine Failure',
  COMBINE_SUCCESS: 'Combine Success',
  DROPPED_ITEM: 'Dropped Item',
  SPLIT_MONEY: 'Split Money',
  DZ_JOIN: 'DZ Join',
  DZ_LEAVE: 'DZ Leave',
  TRADER_PURCHASE: 'Trader Purchase',
  TRADER_SELL: 'Trader Sell',
  BANDOLIER_CREATE: 'Bandolier Create',
  BANDOLIER_SWAP: 'Bandolier Swap',
  DISCOVER_ITEM: 'Discover Item',
  POSSIBLE_HACK: 'Possible Hack',
  KILLED_NPC: 'Killed NPC',
  KILLED_NAMED_NPC: 'Killed Named NPC',
  KILLED_RAID_NPC: 'Killed Raid NPC',
  ITEM_CREATION: 'Item Creation'
};

export interface PlayerEventLog {
  id: number;
  accountId: number;
  characterId: number;
  characterName: string;
  zoneId: number;
  zoneName: string;
  instanceId: number;
  eventTypeId: number;
  eventTypeName: string;
  eventTypeLabel: string;
  eventData: Record<string, unknown> | null;
  createdAt: string;
}

export interface PlayerEventLogFilters {
  page?: number;
  pageSize?: number;
  characterName?: string;
  eventTypes?: number[];
  zoneId?: number;
  startDate?: string;
  endDate?: string;
  sortBy?: 'created_at' | 'character_name' | 'event_type_id' | 'zone_id';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PlayerEventLogResponse {
  events: PlayerEventLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PlayerEventLogStats {
  totalEvents: number;
  uniqueCharacters: number;
  uniqueZones: number;
  eventTypeCounts: Array<{ eventTypeId: number; eventTypeName: string; count: number }>;
  recentActivity: {
    last24Hours: number;
    last7Days: number;
  };
}

type EventLogRow = RowDataPacket & {
  id: number;
  account_id: number;
  character_id: number;
  character_name: string | null;
  zone_id: number;
  zone_name: string | null;
  instance_id: number;
  event_type_id: number;
  event_data: string | null;
  created_at: string;
};

// Cache for zone schema discovery
let zoneSchemaCache: {
  exists: boolean;
  idColumn: string | null;
  longNameColumn: string | null;
} | null = null;

// Cache for character data schema discovery
let characterSchemaCache: {
  exists: boolean;
  idColumn: string | null;
  nameColumn: string | null;
} | null = null;

// Cache for stats with TTL (avoid repeated expensive queries)
let statsCache: {
  data: PlayerEventLogStats | null;
  timestamp: number;
} = { data: null, timestamp: 0 };
const STATS_CACHE_TTL_MS = 30000; // 30 seconds

// Cache for zones list
let zonesCache: {
  data: Array<{ zoneId: number; zoneName: string }> | null;
  timestamp: number;
} = { data: null, timestamp: 0 };
const ZONES_CACHE_TTL_MS = 60000; // 1 minute

// Performance limits
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;

async function getTableColumns(tableName: string): Promise<string[]> {
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return rows.map(r => String(r.col).toLowerCase());
  } catch {
    return [];
  }
}

async function discoverZoneSchema(): Promise<typeof zoneSchemaCache> {
  if (zoneSchemaCache !== null) {
    return zoneSchemaCache;
  }

  const columns = await getTableColumns('zone');
  if (columns.length === 0) {
    zoneSchemaCache = { exists: false, idColumn: null, longNameColumn: null };
    return zoneSchemaCache;
  }

  const idCandidates = ['zoneidnumber', 'id', 'zoneid', 'zone_id'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || null;

  const longNameCandidates = ['long_name', 'longname', 'long'];
  const longNameColumn = longNameCandidates.find(c => columns.includes(c)) || null;

  zoneSchemaCache = {
    exists: true,
    idColumn,
    longNameColumn
  };
  return zoneSchemaCache;
}

async function discoverCharacterSchema(): Promise<typeof characterSchemaCache> {
  if (characterSchemaCache !== null) {
    return characterSchemaCache;
  }

  const columns = await getTableColumns('character_data');
  if (columns.length === 0) {
    characterSchemaCache = { exists: false, idColumn: null, nameColumn: null };
    return characterSchemaCache;
  }

  const idCandidates = ['id', 'charid', 'character_id'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || null;

  const nameCandidates = ['name', 'character_name', 'charname'];
  const nameColumn = nameCandidates.find(c => columns.includes(c)) || null;

  characterSchemaCache = {
    exists: true,
    idColumn,
    nameColumn
  };
  return characterSchemaCache;
}

/**
 * Fetch player event logs with filtering, pagination, and sorting
 */
export async function fetchPlayerEventLogs(
  filters: PlayerEventLogFilters = {}
): Promise<PlayerEventLogResponse> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable player event logs.'
    );
  }

  const {
    page = 1,
    pageSize: requestedPageSize = 25,
    characterName,
    eventTypes,
    zoneId,
    startDate,
    endDate,
    sortBy = 'created_at',
    sortOrder = 'desc',
    search: rawSearch
  } = filters;

  // Enforce performance limits
  const pageSize = Math.min(Math.max(1, requestedPageSize), MAX_PAGE_SIZE);
  const search = rawSearch ? rawSearch.slice(0, MAX_SEARCH_LENGTH) : undefined;

  // Discover schemas
  const [zoneSchema, characterSchema] = await Promise.all([
    discoverZoneSchema(),
    discoverCharacterSchema()
  ]);

  // Build the query dynamically
  let selectFields = `
    pel.id,
    pel.account_id,
    pel.character_id,
    pel.zone_id,
    pel.instance_id,
    pel.event_type_id,
    pel.event_data,
    pel.created_at`;

  let joins = `FROM player_event_logs pel`;
  const whereConditions: string[] = [];
  const params: (string | number)[] = [];

  // Add character_data join if available
  if (characterSchema?.exists && characterSchema.idColumn && characterSchema.nameColumn) {
    selectFields += `,
    cd.${characterSchema.nameColumn} as character_name`;
    joins += `
    LEFT JOIN character_data cd ON pel.character_id = cd.${characterSchema.idColumn}`;
  } else {
    selectFields += `,
    NULL as character_name`;
  }

  // Add zone join if available
  if (zoneSchema?.exists && zoneSchema.idColumn && zoneSchema.longNameColumn) {
    selectFields += `,
    z.${zoneSchema.longNameColumn} as zone_name`;
    if (zoneSchema.idColumn === 'zoneidnumber') {
      joins += `
    LEFT JOIN zone z ON pel.zone_id = z.zoneidnumber`;
    } else {
      joins += `
    LEFT JOIN zone z ON pel.zone_id = z.${zoneSchema.idColumn}`;
    }
  } else {
    selectFields += `,
    NULL as zone_name`;
  }

  // Apply filters
  if (characterName) {
    if (characterSchema?.exists && characterSchema.nameColumn) {
      whereConditions.push(`cd.${characterSchema.nameColumn} LIKE ?`);
      params.push(`%${characterName}%`);
    }
  }

  if (eventTypes && eventTypes.length > 0) {
    whereConditions.push(`pel.event_type_id IN (${eventTypes.map(() => '?').join(', ')})`);
    params.push(...eventTypes);
  }

  if (zoneId !== undefined) {
    whereConditions.push(`pel.zone_id = ?`);
    params.push(zoneId);
  }

  if (startDate) {
    whereConditions.push(`pel.created_at >= ?`);
    params.push(startDate);
  }

  if (endDate) {
    whereConditions.push(`pel.created_at <= ?`);
    params.push(endDate);
  }

  // General search - only search character name (event_data LIKE is too expensive)
  if (search && characterSchema?.exists && characterSchema.nameColumn) {
    whereConditions.push(`cd.${characterSchema.nameColumn} LIKE ?`);
    params.push(`%${search}%`);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Validate sort column to prevent SQL injection
  const validSortColumns: Record<string, string> = {
    created_at: 'pel.created_at',
    character_name: characterSchema?.nameColumn ? `cd.${characterSchema.nameColumn}` : 'pel.character_id',
    event_type_id: 'pel.event_type_id',
    zone_id: 'pel.zone_id'
  };
  const sortColumn = validSortColumns[sortBy] || 'pel.created_at';
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Get total count - use optimized query without unnecessary JOINs when possible
  // Only need JOINs if filtering by character name or searching
  const needsCharacterJoinForCount = !!(characterName || search);
  let countJoins = 'FROM player_event_logs pel';
  if (needsCharacterJoinForCount && characterSchema?.exists && characterSchema.idColumn) {
    countJoins += ` LEFT JOIN character_data cd ON pel.character_id = cd.${characterSchema.idColumn}`;
  }

  const countQuery = `SELECT COUNT(*) as total ${countJoins} ${whereClause}`;
  const [countResult] = await queryEqDb<RowDataPacket[]>(countQuery, params);
  const total = Number(countResult?.total || 0);

  // Calculate pagination
  const offset = (page - 1) * pageSize;
  const totalPages = Math.ceil(total / pageSize);

  // Get paginated results
  const dataQuery = `
    SELECT ${selectFields}
    ${joins}
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT ? OFFSET ?
  `;

  const rows = await queryEqDb<EventLogRow[]>(dataQuery, [...params, pageSize, offset]);

  const events: PlayerEventLog[] = rows.map((row) => {
    const eventTypeName = EVENT_TYPE_MAP[row.event_type_id] || 'UNKNOWN';
    let parsedEventData: Record<string, unknown> | null = null;

    if (row.event_data) {
      try {
        parsedEventData = JSON.parse(row.event_data);
      } catch {
        // If JSON parsing fails, store as raw string
        parsedEventData = { raw: row.event_data };
      }
    }

    return {
      id: row.id,
      accountId: row.account_id,
      characterId: row.character_id,
      characterName: row.character_name || `Character ${row.character_id}`,
      zoneId: row.zone_id,
      zoneName: row.zone_name || `Zone ${row.zone_id}`,
      instanceId: row.instance_id,
      eventTypeId: row.event_type_id,
      eventTypeName,
      eventTypeLabel: EVENT_TYPE_LABELS[eventTypeName] || eventTypeName,
      eventData: parsedEventData,
      createdAt: row.created_at
    };
  });

  return {
    events,
    total,
    page,
    pageSize,
    totalPages
  };
}

/**
 * Get statistics about player event logs
 * Uses caching to avoid repeated expensive queries
 */
export async function getPlayerEventLogStats(): Promise<PlayerEventLogStats> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable player event logs.'
    );
  }

  // Return cached stats if still valid
  const now = Date.now();
  if (statsCache.data && (now - statsCache.timestamp) < STATS_CACHE_TTL_MS) {
    return statsCache.data;
  }

  // Run queries in parallel for better performance
  const [
    [summaryResult],
    eventTypeRows,
    [recentResult]
  ] = await Promise.all([
    // Combined query for total, unique characters, unique zones
    queryEqDb<RowDataPacket[]>(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT character_id) as unique_characters,
        COUNT(DISTINCT zone_id) as unique_zones
      FROM player_event_logs
    `),
    // Event type counts (limited to top 20 for performance)
    queryEqDb<RowDataPacket[]>(`
      SELECT event_type_id, COUNT(*) as count
      FROM player_event_logs
      GROUP BY event_type_id
      ORDER BY count DESC
      LIMIT 20
    `),
    // Combined recent activity query
    queryEqDb<RowDataPacket[]>(`
      SELECT
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as last_24h,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as last_7d
      FROM player_event_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `)
  ]);

  const totalEvents = Number(summaryResult?.total_events || 0);
  const uniqueCharacters = Number(summaryResult?.unique_characters || 0);
  const uniqueZones = Number(summaryResult?.unique_zones || 0);

  const eventTypeCounts = eventTypeRows.map((row) => ({
    eventTypeId: row.event_type_id,
    eventTypeName: EVENT_TYPE_MAP[row.event_type_id] || 'UNKNOWN',
    count: Number(row.count)
  }));

  const last24Hours = Number(recentResult?.last_24h || 0);
  const last7Days = Number(recentResult?.last_7d || 0);

  const stats: PlayerEventLogStats = {
    totalEvents,
    uniqueCharacters,
    uniqueZones,
    eventTypeCounts,
    recentActivity: {
      last24Hours,
      last7Days
    }
  };

  // Update cache
  statsCache = { data: stats, timestamp: now };

  return stats;
}

/**
 * Get all available event types with their metadata
 */
export function getEventTypes(): Array<{ id: number; name: string; label: string }> {
  return Object.entries(EVENT_TYPE_MAP).map(([id, name]) => ({
    id: Number(id),
    name,
    label: EVENT_TYPE_LABELS[name] || name
  }));
}

/**
 * Get unique zones that have events logged
 * Uses caching to avoid repeated queries
 */
export async function getEventLogZones(): Promise<Array<{ zoneId: number; zoneName: string }>> {
  if (!isEqDbConfigured()) {
    return [];
  }

  // Return cached zones if still valid
  const now = Date.now();
  if (zonesCache.data && (now - zonesCache.timestamp) < ZONES_CACHE_TTL_MS) {
    return zonesCache.data;
  }

  const zoneSchema = await discoverZoneSchema();

  let query: string;
  if (zoneSchema?.exists && zoneSchema.idColumn && zoneSchema.longNameColumn) {
    const joinCondition = zoneSchema.idColumn === 'zoneidnumber'
      ? 'pel.zone_id = z.zoneidnumber'
      : `pel.zone_id = z.${zoneSchema.idColumn}`;

    // Use subquery with LIMIT for better performance on large tables
    query = `
      SELECT DISTINCT pel.zone_id, z.${zoneSchema.longNameColumn} as zone_name
      FROM player_event_logs pel
      LEFT JOIN zone z ON ${joinCondition}
      ORDER BY z.${zoneSchema.longNameColumn} ASC
      LIMIT 500
    `;
  } else {
    query = `
      SELECT DISTINCT zone_id, NULL as zone_name
      FROM player_event_logs
      ORDER BY zone_id ASC
      LIMIT 500
    `;
  }

  const rows = await queryEqDb<RowDataPacket[]>(query);

  const zones = rows.map((row) => ({
    zoneId: row.zone_id,
    zoneName: row.zone_name || `Zone ${row.zone_id}`
  }));

  // Update cache
  zonesCache = { data: zones, timestamp: now };

  return zones;
}
