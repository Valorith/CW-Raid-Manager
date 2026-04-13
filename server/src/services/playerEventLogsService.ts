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
  characterId?: number;
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

export type ConnectionRelationshipOverlayType =
  | 'trade'
  | 'bazaar'
  | 'group'
  | 'raid'
  | 'rez'
  | 'give'
  | 'money';

export type ConnectionActivityIndicatorType =
  | 'kill'
  | 'loot'
  | 'death'
  | 'task'
  | 'level'
  | 'zone'
  | 'craft'
  | 'handin'
  | 'discovery'
  | 'merchant';

export interface ConnectionOverlayParticipant {
  characterId: number;
  characterName: string;
}

export interface ConnectionRelationshipOverlay {
  id: string;
  type: ConnectionRelationshipOverlayType;
  sourceCharacterId: number;
  sourceCharacterName: string;
  targetCharacterId: number;
  targetCharacterName: string;
  count: number;
  strength: number;
  label: string;
  lastSeenAt: string;
}

export interface ConnectionActivityIndicator {
  characterId: number;
  type: ConnectionActivityIndicatorType;
  count: number;
  intensity: 'low' | 'medium' | 'high';
  label: string;
  lastSeenAt: string;
}

export interface ConnectionEventOverlaySnapshot {
  relationshipOverlays: ConnectionRelationshipOverlay[];
  activityIndicators: ConnectionActivityIndicator[];
  windowHours: number;
  generatedAt: string;
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

type EventOverlayRow = RowDataPacket & {
  id: number;
  character_id: number;
  event_type_id: number;
  event_data: string | null;
  created_at: string;
};

type ConnectedCharacterLookup = {
  byId: Map<number, ConnectionOverlayParticipant>;
  byName: Map<string, ConnectionOverlayParticipant>;
};

type RelationshipOverlayAccumulator = ConnectionRelationshipOverlay;

type ActivityIndicatorAccumulator = Omit<ConnectionActivityIndicator, 'intensity'>;

const DEFAULT_CONNECTION_OVERLAY_WINDOW_HOURS = 6;

const RELATIONSHIP_EVENT_TYPES = [17, 18, 19, 20, 27, 28, 30, 35, 39] as const;
const ACTIVITY_EVENT_TYPES = [
  2, 12, 13, 14, 15, 16, 22, 24, 25, 26, 31, 32, 33, 38, 39, 42, 44, 45, 46, 47
] as const;
const CONNECTION_OVERLAY_EVENT_TYPES = Array.from(
  new Set<number>([...RELATIONSHIP_EVENT_TYPES, ...ACTIVITY_EVENT_TYPES])
);

// Cache for zone schema discovery
let zoneSchemaCache: {
  exists: boolean;
  idColumn: string | null;
  longNameColumn: string | null;
  hasVersionColumn: boolean;
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
    return rows.map((r) => String(r.col).toLowerCase());
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
    zoneSchemaCache = {
      exists: false,
      idColumn: null,
      longNameColumn: null,
      hasVersionColumn: false
    };
    return zoneSchemaCache;
  }

  const idCandidates = ['zoneidnumber', 'id', 'zoneid', 'zone_id'];
  const idColumn = idCandidates.find((c) => columns.includes(c)) || null;

  const longNameCandidates = ['long_name', 'longname', 'long'];
  const longNameColumn = longNameCandidates.find((c) => columns.includes(c)) || null;

  // Check if version column exists (zone table often has multiple entries per zone for different versions)
  const hasVersionColumn = columns.includes('version');

  zoneSchemaCache = {
    exists: true,
    idColumn,
    longNameColumn,
    hasVersionColumn
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
  const idColumn = idCandidates.find((c) => columns.includes(c)) || null;

  const nameCandidates = ['name', 'character_name', 'charname'];
  const nameColumn = nameCandidates.find((c) => columns.includes(c)) || null;

  characterSchemaCache = {
    exists: true,
    idColumn,
    nameColumn
  };
  return characterSchemaCache;
}

function normalizeCharacterName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function parseEventData(eventData: string | null): Record<string, unknown> | null {
  if (!eventData) {
    return null;
  }

  try {
    return JSON.parse(eventData);
  } catch {
    return null;
  }
}

function buildConnectedCharacterLookup(
  participants: ConnectionOverlayParticipant[]
): ConnectedCharacterLookup {
  const byId = new Map<number, ConnectionOverlayParticipant>();
  const byName = new Map<string, ConnectionOverlayParticipant>();

  for (const participant of participants) {
    byId.set(participant.characterId, participant);
    const normalizedName = normalizeCharacterName(participant.characterName);
    if (normalizedName && !byName.has(normalizedName)) {
      byName.set(normalizedName, participant);
    }
  }

  return { byId, byName };
}

function resolveConnectedParticipant(
  lookup: ConnectedCharacterLookup,
  candidateName: unknown,
  candidateId?: unknown
): ConnectionOverlayParticipant | null {
  const numericCandidateId =
    typeof candidateId === 'number'
      ? candidateId
      : typeof candidateId === 'string' && /^\d+$/.test(candidateId)
        ? Number(candidateId)
        : null;

  if (numericCandidateId !== null) {
    const byIdMatch = lookup.byId.get(numericCandidateId);
    if (byIdMatch) {
      return byIdMatch;
    }
  }

  if (typeof candidateName !== 'string') {
    return null;
  }

  return lookup.byName.get(normalizeCharacterName(candidateName)) ?? null;
}

function createRelationshipKey(
  type: ConnectionRelationshipOverlayType,
  sourceCharacterId: number,
  targetCharacterId: number,
  symmetric: boolean
): string {
  if (!symmetric) {
    return `${type}:${sourceCharacterId}:${targetCharacterId}`;
  }

  const [first, second] = [sourceCharacterId, targetCharacterId].sort((a, b) => a - b);
  return `${type}:${first}:${second}`;
}

function updateRelationshipOverlay(
  relationshipMap: Map<string, RelationshipOverlayAccumulator>,
  nextOverlay: Omit<ConnectionRelationshipOverlay, 'count' | 'strength'>
): void {
  const existing = relationshipMap.get(nextOverlay.id);
  if (!existing) {
    relationshipMap.set(nextOverlay.id, {
      ...nextOverlay,
      count: 1,
      strength: 1
    });
    return;
  }

  existing.count += 1;
  existing.strength += 1;
  if (new Date(nextOverlay.lastSeenAt) >= new Date(existing.lastSeenAt)) {
    existing.lastSeenAt = nextOverlay.lastSeenAt;
    existing.label = nextOverlay.label;
    existing.sourceCharacterName = nextOverlay.sourceCharacterName;
    existing.targetCharacterName = nextOverlay.targetCharacterName;
  }
}

function updateActivityIndicator(
  activityMap: Map<string, ActivityIndicatorAccumulator>,
  characterId: number,
  type: ConnectionActivityIndicatorType,
  label: string,
  lastSeenAt: string
): void {
  const key = `${characterId}:${type}`;
  const existing = activityMap.get(key);
  if (!existing) {
    activityMap.set(key, {
      characterId,
      type,
      count: 1,
      label,
      lastSeenAt
    });
    return;
  }

  existing.count += 1;
  if (new Date(lastSeenAt) >= new Date(existing.lastSeenAt)) {
    existing.lastSeenAt = lastSeenAt;
    existing.label = label;
  }
}

function formatIndicatorIntensity(count: number): ConnectionActivityIndicator['intensity'] {
  if (count >= 4) {
    return 'high';
  }
  if (count >= 2) {
    return 'medium';
  }
  return 'low';
}

function buildTradeLabel(eventData: Record<string, unknown> | null): string {
  if (!eventData) {
    return 'Trade exchange';
  }

  const firstItems = Array.isArray(eventData.character_1_give_items)
    ? eventData.character_1_give_items.length
    : 0;
  const secondItems = Array.isArray(eventData.character_2_give_items)
    ? eventData.character_2_give_items.length
    : 0;
  const fallbackItems = Array.isArray(eventData.items) ? eventData.items.length : 0;
  const totalItems = firstItems + secondItems + fallbackItems;
  if (totalItems > 0) {
    return `Trade: ${totalItems} item${totalItems === 1 ? '' : 's'}`;
  }
  if (eventData.character_1_give_money || eventData.character_2_give_money || eventData.money) {
    return 'Trade: coin exchange';
  }
  return 'Trade exchange';
}

function buildRelationshipOverlay(
  row: EventOverlayRow,
  eventData: Record<string, unknown> | null,
  lookup: ConnectedCharacterLookup
): Omit<ConnectionRelationshipOverlay, 'count' | 'strength'> | null {
  const sourceParticipant = lookup.byId.get(row.character_id);
  if (!sourceParticipant) {
    return null;
  }

  switch (row.event_type_id) {
    case 27: {
      const firstParticipant =
        resolveConnectedParticipant(
          lookup,
          eventData?.character_1_name,
          eventData?.character_1_id
        ) ?? sourceParticipant;
      const secondParticipant =
        resolveConnectedParticipant(
          lookup,
          eventData?.character_2_name,
          eventData?.character_2_id
        ) ??
        resolveConnectedParticipant(lookup, eventData?.with ?? eventData?.target) ??
        null;
      if (!secondParticipant || firstParticipant.characterId === secondParticipant.characterId) {
        return null;
      }

      const [first, second] =
        firstParticipant.characterId < secondParticipant.characterId
          ? [firstParticipant, secondParticipant]
          : [secondParticipant, firstParticipant];

      return {
        id: createRelationshipKey('trade', first.characterId, second.characterId, true),
        type: 'trade',
        sourceCharacterId: first.characterId,
        sourceCharacterName: first.characterName,
        targetCharacterId: second.characterId,
        targetCharacterName: second.characterName,
        label: buildTradeLabel(eventData),
        lastSeenAt: row.created_at
      };
    }
    case 28: {
      const targetParticipant = resolveConnectedParticipant(
        lookup,
        eventData?.target_name ?? eventData?.target ?? eventData?.with,
        eventData?.target_id
      );
      if (!targetParticipant || targetParticipant.characterId === sourceParticipant.characterId) {
        return null;
      }

      const itemName =
        typeof eventData?.item_name === 'string'
          ? eventData.item_name
          : typeof eventData?.item === 'string'
            ? eventData.item
            : null;

      return {
        id: createRelationshipKey(
          'give',
          sourceParticipant.characterId,
          targetParticipant.characterId,
          false
        ),
        type: 'give',
        sourceCharacterId: sourceParticipant.characterId,
        sourceCharacterName: sourceParticipant.characterName,
        targetCharacterId: targetParticipant.characterId,
        targetCharacterName: targetParticipant.characterName,
        label: itemName ? `Gave ${itemName}` : 'Gave item',
        lastSeenAt: row.created_at
      };
    }
    case 30: {
      const rezzer = resolveConnectedParticipant(
        lookup,
        eventData?.resurrecter_name ?? eventData?.rezzer ?? eventData?.from,
        eventData?.resurrecter_id ?? eventData?.rezzer_id
      );
      if (!rezzer || rezzer.characterId === sourceParticipant.characterId) {
        return null;
      }

      const spellName = typeof eventData?.spell_name === 'string' ? eventData.spell_name : null;
      return {
        id: createRelationshipKey('rez', rezzer.characterId, sourceParticipant.characterId, false),
        type: 'rez',
        sourceCharacterId: rezzer.characterId,
        sourceCharacterName: rezzer.characterName,
        targetCharacterId: sourceParticipant.characterId,
        targetCharacterName: sourceParticipant.characterName,
        label: spellName ? `Rez: ${spellName}` : 'Resurrection',
        lastSeenAt: row.created_at
      };
    }
    case 35: {
      const targetParticipant = resolveConnectedParticipant(
        lookup,
        eventData?.target_name ?? eventData?.target ?? eventData?.with,
        eventData?.target_id
      );
      if (!targetParticipant || targetParticipant.characterId === sourceParticipant.characterId) {
        return null;
      }

      return {
        id: createRelationshipKey(
          'money',
          sourceParticipant.characterId,
          targetParticipant.characterId,
          false
        ),
        type: 'money',
        sourceCharacterId: sourceParticipant.characterId,
        sourceCharacterName: sourceParticipant.characterName,
        targetCharacterId: targetParticipant.characterId,
        targetCharacterName: targetParticipant.characterName,
        label: 'Split coin',
        lastSeenAt: row.created_at
      };
    }
    case 39: {
      const buyer = resolveConnectedParticipant(lookup, eventData?.buyer_name, eventData?.buyer_id);
      if (!buyer || buyer.characterId === sourceParticipant.characterId) {
        return null;
      }

      const itemName = typeof eventData?.item_name === 'string' ? eventData.item_name : null;
      return {
        id: createRelationshipKey(
          'bazaar',
          sourceParticipant.characterId,
          buyer.characterId,
          false
        ),
        type: 'bazaar',
        sourceCharacterId: sourceParticipant.characterId,
        sourceCharacterName: sourceParticipant.characterName,
        targetCharacterId: buyer.characterId,
        targetCharacterName: buyer.characterName,
        label: itemName ? `Sold ${itemName}` : 'Bazaar sale',
        lastSeenAt: row.created_at
      };
    }
    case 17:
    case 18: {
      const leader = resolveConnectedParticipant(
        lookup,
        eventData?.leader ?? eventData?.group_leader,
        eventData?.leader_id ?? eventData?.group_leader_id
      );
      if (!leader || leader.characterId === sourceParticipant.characterId) {
        return null;
      }

      return {
        id: createRelationshipKey(
          'group',
          sourceParticipant.characterId,
          leader.characterId,
          false
        ),
        type: 'group',
        sourceCharacterId: sourceParticipant.characterId,
        sourceCharacterName: sourceParticipant.characterName,
        targetCharacterId: leader.characterId,
        targetCharacterName: leader.characterName,
        label: row.event_type_id === 17 ? 'Joined group' : 'Left group',
        lastSeenAt: row.created_at
      };
    }
    case 19:
    case 20: {
      const leader = resolveConnectedParticipant(
        lookup,
        eventData?.leader ?? eventData?.group_leader,
        eventData?.leader_id ?? eventData?.group_leader_id
      );
      if (!leader || leader.characterId === sourceParticipant.characterId) {
        return null;
      }

      return {
        id: createRelationshipKey('raid', sourceParticipant.characterId, leader.characterId, false),
        type: 'raid',
        sourceCharacterId: sourceParticipant.characterId,
        sourceCharacterName: sourceParticipant.characterName,
        targetCharacterId: leader.characterId,
        targetCharacterName: leader.characterName,
        label: row.event_type_id === 19 ? 'Joined raid' : 'Left raid',
        lastSeenAt: row.created_at
      };
    }
    default:
      return null;
  }
}

function buildActivityDescriptor(
  row: EventOverlayRow,
  eventData: Record<string, unknown> | null
): { type: ConnectionActivityIndicatorType; label: string } | null {
  switch (row.event_type_id) {
    case 2:
      return {
        type: 'zone',
        label:
          typeof eventData?.to_zone_long_name === 'string'
            ? `Zoned to ${eventData.to_zone_long_name}`
            : typeof eventData?.to === 'string'
              ? `Zoned to ${eventData.to}`
              : 'Zoned'
      };
    case 12:
    case 13:
      return {
        type: 'level',
        label:
          typeof eventData?.to_level === 'number' || typeof eventData?.new_level === 'number'
            ? `Level ${eventData.to_level ?? eventData.new_level}`
            : row.event_type_id === 12
              ? 'Level gain'
              : 'Level loss'
      };
    case 14:
      return {
        type: 'loot',
        label:
          typeof eventData?.item_name === 'string' ? `Looted ${eventData.item_name}` : 'Looted item'
      };
    case 15:
    case 16:
    case 38:
    case 39:
      return {
        type: 'merchant',
        label:
          typeof eventData?.item_name === 'string'
            ? `${row.event_type_id === 39 ? 'Sold' : 'Moved'} ${eventData.item_name}`
            : 'Market activity'
      };
    case 22:
      return {
        type: 'handin',
        label:
          typeof eventData?.npc_name === 'string' ? `Handin to ${eventData.npc_name}` : 'NPC handin'
      };
    case 24:
    case 25:
    case 26:
      return {
        type: 'task',
        label:
          typeof eventData?.task_name === 'string'
            ? eventData.task_name
            : row.event_type_id === 26
              ? 'Task complete'
              : 'Task activity'
      };
    case 31:
      return {
        type: 'death',
        label:
          typeof eventData?.killer_name === 'string'
            ? `Killed by ${eventData.killer_name}`
            : 'Death'
      };
    case 32:
    case 33:
    case 47:
      return {
        type: 'craft',
        label:
          typeof eventData?.recipe_name === 'string'
            ? eventData.recipe_name
            : row.event_type_id === 33
              ? 'Combine success'
              : 'Craft activity'
      };
    case 42:
      return {
        type: 'discovery',
        label:
          typeof eventData?.item_name === 'string'
            ? `Discovered ${eventData.item_name}`
            : 'Item discovery'
      };
    case 44:
    case 45:
    case 46:
      return {
        type: 'kill',
        label:
          typeof eventData?.npc_name === 'string'
            ? `Killed ${eventData.npc_name}`
            : row.event_type_id === 46
              ? 'Raid kill'
              : 'Kill'
      };
    default:
      return null;
  }
}

export async function fetchConnectionEventOverlaySnapshot(
  participants: ConnectionOverlayParticipant[],
  windowHours: number = DEFAULT_CONNECTION_OVERLAY_WINDOW_HOURS
): Promise<ConnectionEventOverlaySnapshot> {
  if (!isEqDbConfigured() || participants.length === 0) {
    return {
      relationshipOverlays: [],
      activityIndicators: [],
      windowHours,
      generatedAt: new Date().toISOString()
    };
  }

  const lookup = buildConnectedCharacterLookup(participants);
  const placeholders = participants.map(() => '?').join(', ');
  const cutoffDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await queryEqDb<EventOverlayRow[]>(
    `
      SELECT id, character_id, event_type_id, event_data, created_at
      FROM player_event_logs
      WHERE character_id IN (${placeholders})
        AND created_at >= ?
        AND event_type_id IN (${CONNECTION_OVERLAY_EVENT_TYPES.map(() => '?').join(', ')})
      ORDER BY created_at DESC
    `,
    [
      ...participants.map((participant) => participant.characterId),
      cutoffDate,
      ...CONNECTION_OVERLAY_EVENT_TYPES
    ]
  );

  const relationshipMap = new Map<string, RelationshipOverlayAccumulator>();
  const activityMap = new Map<string, ActivityIndicatorAccumulator>();

  for (const row of rows) {
    const eventData = parseEventData(row.event_data);
    const relationshipOverlay = buildRelationshipOverlay(row, eventData, lookup);
    if (relationshipOverlay) {
      updateRelationshipOverlay(relationshipMap, relationshipOverlay);
    }

    const activityDescriptor = buildActivityDescriptor(row, eventData);
    if (activityDescriptor) {
      updateActivityIndicator(
        activityMap,
        row.character_id,
        activityDescriptor.type,
        activityDescriptor.label,
        row.created_at
      );
    }
  }

  return {
    relationshipOverlays: Array.from(relationshipMap.values()).sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    }),
    activityIndicators: Array.from(activityMap.values())
      .map((indicator) => ({
        ...indicator,
        intensity: formatIndicatorIntensity(indicator.count)
      }))
      .sort((a, b) => {
        if (a.characterId !== b.characterId) {
          return a.characterId - b.characterId;
        }
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      }),
    windowHours,
    generatedAt: new Date().toISOString()
  };
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
    characterId,
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
  // Note: Zone table may have multiple entries per zoneidnumber (for different versions)
  // We use MIN(version) subquery to get one entry per zone and avoid duplicates
  if (zoneSchema?.exists && zoneSchema.idColumn && zoneSchema.longNameColumn) {
    selectFields += `,
    z.${zoneSchema.longNameColumn} as zone_name`;
    if (zoneSchema.hasVersionColumn) {
      // Use subquery to get the minimum version for each zone (handles zones that only have version > 0)
      joins += `
    LEFT JOIN zone z ON pel.zone_id = z.${zoneSchema.idColumn}
      AND z.version = (SELECT MIN(z2.version) FROM zone z2 WHERE z2.${zoneSchema.idColumn} = pel.zone_id)`;
    } else {
      joins += `
    LEFT JOIN zone z ON pel.zone_id = z.${zoneSchema.idColumn}`;
    }
  } else {
    selectFields += `,
    NULL as zone_name`;
  }

  // Apply filters
  // Use exact character_id match when available (preferred - no ambiguity)
  if (characterId !== undefined) {
    whereConditions.push(`pel.character_id = ?`);
    params.push(characterId);
  } else if (characterName) {
    // Fall back to name-based LIKE search only when no ID is provided
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
    character_name: characterSchema?.nameColumn
      ? `cd.${characterSchema.nameColumn}`
      : 'pel.character_id',
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
  if (statsCache.data && now - statsCache.timestamp < STATS_CACHE_TTL_MS) {
    return statsCache.data;
  }

  // Run queries in parallel for better performance
  const [[summaryResult], eventTypeRows, [recentResult]] = await Promise.all([
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
  if (zonesCache.data && now - zonesCache.timestamp < ZONES_CACHE_TTL_MS) {
    return zonesCache.data;
  }

  const zoneSchema = await discoverZoneSchema();

  let query: string;
  if (zoneSchema?.exists && zoneSchema.idColumn && zoneSchema.longNameColumn) {
    let joinCondition: string;
    if (zoneSchema.hasVersionColumn) {
      // Use subquery to get the minimum version for each zone
      joinCondition = `pel.zone_id = z.${zoneSchema.idColumn}
        AND z.version = (SELECT MIN(z2.version) FROM zone z2 WHERE z2.${zoneSchema.idColumn} = pel.zone_id)`;
    } else {
      joinCondition = `pel.zone_id = z.${zoneSchema.idColumn}`;
    }

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
