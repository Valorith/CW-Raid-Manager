import type { RowDataPacket } from 'mysql2/promise';
import { prisma } from '../utils/prisma.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import {
  fetchPlayerEventLogs,
  type PlayerEventLogFilters,
  type PlayerEventLogResponse
} from './playerEventLogsService.js';

// Interfaces
export interface CharacterDetails {
  id: number;
  accountId: number;
  name: string;
  level: number;
  className: string;
  classId: number;
  zoneName: string;
  zoneId: number;
  race: string;
  raceId: number;
  gender: string;
  guildName: string | null;
  lastLogin: string | null;
  timePlayedMinutes: number;
  createdAt: string | null;
}

export interface AccountInfo {
  id: number;
  name: string;
  charname: string | null;
  status: number;
  lsAccountId: number | null;
  gmSpeed: number;
  hideme: number;
  suspendedReason: string | null;
  suspendedUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  timeCreation: number;
  ipExemptions: number;
  characterCount: number;
}

export interface CharacterCorpse {
  id: number;
  characterId: number;
  characterName: string;
  zoneName: string;
  zoneId: number;
  instanceId: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  timeofdeath: string;
  isBuried: boolean;
  isRezzed: boolean;
  wasAtGraveyard: boolean;
  itemCount: number;
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
}

export interface CharacterAssociate {
  characterId: number;
  characterName: string;
  accountId: number;
  accountName: string;
  level: number;
  className: string;
  associationType: 'same_account' | 'same_ip' | 'manual';
  sharedIp?: string;
  manualReason?: string;
  manualAssociationId?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface AccountNote {
  id: string;
  eqAccountId: number;
  content: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSearchResult {
  id: number;
  name: string;
  level: number;
  className: string;
  accountId: number;
  accountName: string;
}

// Cache for schema discovery
let schemaCache: {
  characterData: { idColumn: string; nameColumn: string; accountIdColumn: string } | null;
  account: { idColumn: string; nameColumn: string } | null;
  zone: { idColumn: string; longNameColumn: string } | null;
  characterCorpses: { exists: boolean } | null;
} = {
  characterData: null,
  account: null,
  zone: null,
  characterCorpses: null
};

// Class ID to name mapping
function mapEqClassIdToName(classId: number): string {
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

// Race ID to name mapping
function mapEqRaceIdToName(raceId: number): string {
  switch (raceId) {
    case 1: return 'Human';
    case 2: return 'Barbarian';
    case 3: return 'Erudite';
    case 4: return 'Wood Elf';
    case 5: return 'High Elf';
    case 6: return 'Dark Elf';
    case 7: return 'Half Elf';
    case 8: return 'Dwarf';
    case 9: return 'Troll';
    case 10: return 'Ogre';
    case 11: return 'Halfling';
    case 12: return 'Gnome';
    case 13: return 'Iksar';
    case 14: return 'Vah Shir';
    case 15: return 'Froglok';
    case 16: return 'Drakkin';
    default: return 'Unknown';
  }
}

// Gender ID to name mapping
function mapGenderIdToName(genderId: number): string {
  switch (genderId) {
    case 0: return 'Male';
    case 1: return 'Female';
    default: return 'Neutral';
  }
}

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

async function discoverCharacterDataSchema() {
  if (schemaCache.characterData !== null) {
    return schemaCache.characterData;
  }

  const columns = await getTableColumns('character_data');
  if (columns.length === 0) {
    return null;
  }

  const idCandidates = ['id', 'charid', 'character_id'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || 'id';

  const nameCandidates = ['name', 'character_name', 'charname'];
  const nameColumn = nameCandidates.find(c => columns.includes(c)) || 'name';

  const accountIdCandidates = ['account_id', 'accountid', 'acct_id'];
  const accountIdColumn = accountIdCandidates.find(c => columns.includes(c)) || 'account_id';

  schemaCache.characterData = { idColumn, nameColumn, accountIdColumn };
  return schemaCache.characterData;
}

async function discoverAccountSchema() {
  if (schemaCache.account !== null) {
    return schemaCache.account;
  }

  const columns = await getTableColumns('account');
  if (columns.length === 0) {
    return null;
  }

  const idCandidates = ['id', 'account_id', 'accountid'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || 'id';

  const nameCandidates = ['name', 'account_name', 'accountname'];
  const nameColumn = nameCandidates.find(c => columns.includes(c)) || 'name';

  schemaCache.account = { idColumn, nameColumn };
  return schemaCache.account;
}

async function discoverZoneSchema() {
  if (schemaCache.zone !== null) {
    return schemaCache.zone;
  }

  const columns = await getTableColumns('zone');
  if (columns.length === 0) {
    return null;
  }

  const idCandidates = ['zoneidnumber', 'id', 'zoneid', 'zone_id'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || 'zoneidnumber';

  const longNameCandidates = ['long_name', 'longname', 'long'];
  const longNameColumn = longNameCandidates.find(c => columns.includes(c)) || 'long_name';

  schemaCache.zone = { idColumn, longNameColumn };
  return schemaCache.zone;
}

async function checkCharacterCorpsesTable(): Promise<boolean> {
  if (schemaCache.characterCorpses !== null) {
    return schemaCache.characterCorpses.exists;
  }

  const columns = await getTableColumns('character_corpses');
  schemaCache.characterCorpses = { exists: columns.length > 0 };
  return schemaCache.characterCorpses.exists;
}

/**
 * Get character details by name
 */
export async function getCharacterByName(characterName: string): Promise<CharacterDetails | null> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const [charSchema, zoneSchema] = await Promise.all([
    discoverCharacterDataSchema(),
    discoverZoneSchema()
  ]);

  if (!charSchema) {
    throw new Error('Could not discover character_data schema.');
  }

  let query = `
    SELECT
      cd.${charSchema.idColumn} as id,
      cd.${charSchema.accountIdColumn} as account_id,
      cd.${charSchema.nameColumn} as name,
      cd.level,
      cd.class,
      cd.race,
      cd.gender,
      cd.zone_id,
      cd.time_played as time_played_minutes,
      cd.last_login
  `;

  if (zoneSchema) {
    query += `, z.${zoneSchema.longNameColumn} as zone_name`;
  } else {
    query += `, NULL as zone_name`;
  }

  query += `
    FROM character_data cd
  `;

  if (zoneSchema) {
    query += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}
    `;
  }

  query += `
    WHERE LOWER(cd.${charSchema.nameColumn}) = LOWER(?)
    LIMIT 1
  `;

  const rows = await queryEqDb<RowDataPacket[]>(query, [characterName]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // Get guild name if available
  let guildName: string | null = null;
  try {
    const guildRows = await queryEqDb<RowDataPacket[]>(`
      SELECT g.name as guild_name
      FROM guild_members gm
      JOIN guilds g ON gm.guild_id = g.id
      WHERE gm.char_id = ?
      LIMIT 1
    `, [row.id]);
    if (guildRows.length > 0) {
      guildName = guildRows[0].guild_name;
    }
  } catch {
    // Guild tables may not exist or have different schema
  }

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    level: row.level || 0,
    className: mapEqClassIdToName(row.class),
    classId: row.class || 0,
    zoneName: row.zone_name || `Zone ${row.zone_id}`,
    zoneId: row.zone_id || 0,
    race: mapEqRaceIdToName(row.race),
    raceId: row.race || 0,
    gender: mapGenderIdToName(row.gender),
    guildName,
    lastLogin: row.last_login || null,
    timePlayedMinutes: row.time_played_minutes || 0,
    createdAt: null
  };
}

/**
 * Get character details by ID
 */
export async function getCharacterById(characterId: number): Promise<CharacterDetails | null> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const [charSchema, zoneSchema] = await Promise.all([
    discoverCharacterDataSchema(),
    discoverZoneSchema()
  ]);

  if (!charSchema) {
    throw new Error('Could not discover character_data schema.');
  }

  let query = `
    SELECT
      cd.${charSchema.idColumn} as id,
      cd.${charSchema.accountIdColumn} as account_id,
      cd.${charSchema.nameColumn} as name,
      cd.level,
      cd.class,
      cd.race,
      cd.gender,
      cd.zone_id,
      cd.time_played as time_played_minutes,
      cd.last_login
  `;

  if (zoneSchema) {
    query += `, z.${zoneSchema.longNameColumn} as zone_name`;
  } else {
    query += `, NULL as zone_name`;
  }

  query += `
    FROM character_data cd
  `;

  if (zoneSchema) {
    query += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}
    `;
  }

  query += `
    WHERE cd.${charSchema.idColumn} = ?
    LIMIT 1
  `;

  const rows = await queryEqDb<RowDataPacket[]>(query, [characterId]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // Get guild name if available
  let guildName: string | null = null;
  try {
    const guildRows = await queryEqDb<RowDataPacket[]>(`
      SELECT g.name as guild_name
      FROM guild_members gm
      JOIN guilds g ON gm.guild_id = g.id
      WHERE gm.char_id = ?
      LIMIT 1
    `, [row.id]);
    if (guildRows.length > 0) {
      guildName = guildRows[0].guild_name;
    }
  } catch {
    // Guild tables may not exist or have different schema
  }

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    level: row.level || 0,
    className: mapEqClassIdToName(row.class),
    classId: row.class || 0,
    zoneName: row.zone_name || `Zone ${row.zone_id}`,
    zoneId: row.zone_id || 0,
    race: mapEqRaceIdToName(row.race),
    raceId: row.race || 0,
    gender: mapGenderIdToName(row.gender),
    guildName,
    lastLogin: row.last_login || null,
    timePlayedMinutes: row.time_played_minutes || 0,
    createdAt: null
  };
}

/**
 * Get events for a specific character
 */
export async function getCharacterEvents(
  characterId: number,
  filters: Omit<PlayerEventLogFilters, 'characterName' | 'search'> = {}
): Promise<PlayerEventLogResponse> {
  // Use the existing playerEventLogsService but filter by character_id directly
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const charSchema = await discoverCharacterDataSchema();
  if (!charSchema) {
    throw new Error('Could not discover character_data schema.');
  }

  // Get character name first
  const charRows = await queryEqDb<RowDataPacket[]>(
    `SELECT ${charSchema.nameColumn} as name FROM character_data WHERE ${charSchema.idColumn} = ?`,
    [characterId]
  );

  if (charRows.length === 0) {
    return { events: [], total: 0, page: 1, pageSize: filters.pageSize || 25, totalPages: 0 };
  }

  const characterName = charRows[0].name;

  // Use the existing fetchPlayerEventLogs with character name filter
  return fetchPlayerEventLogs({
    ...filters,
    characterName
  });
}

/**
 * Get account information by ID
 */
export async function getAccountInfo(accountId: number): Promise<AccountInfo | null> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const accountSchema = await discoverAccountSchema();
  if (!accountSchema) {
    throw new Error('Could not discover account schema.');
  }

  const charSchema = await discoverCharacterDataSchema();

  // Get account columns to query
  const accountColumns = await getTableColumns('account');

  // Build select fields dynamically based on available columns
  let selectFields = `a.${accountSchema.idColumn} as id, a.${accountSchema.nameColumn} as name`;

  if (accountColumns.includes('charname')) selectFields += ', a.charname';
  if (accountColumns.includes('status')) selectFields += ', a.status';
  if (accountColumns.includes('lsaccount_id')) selectFields += ', a.lsaccount_id as ls_account_id';
  if (accountColumns.includes('gmspeed')) selectFields += ', a.gmspeed as gm_speed';
  if (accountColumns.includes('hideme')) selectFields += ', a.hideme';
  if (accountColumns.includes('suspend_reason')) selectFields += ', a.suspend_reason';
  if (accountColumns.includes('suspendeduntil')) selectFields += ', a.suspendeduntil as suspended_until';
  if (accountColumns.includes('time_creation')) selectFields += ', a.time_creation';
  if (accountColumns.includes('ip_exemption_multiplier')) selectFields += ', a.ip_exemption_multiplier as ip_exemptions';
  if (accountColumns.includes('created_at')) selectFields += ', a.created_at';
  if (accountColumns.includes('updated_at')) selectFields += ', a.updated_at';

  const query = `SELECT ${selectFields} FROM account a WHERE a.${accountSchema.idColumn} = ?`;
  const rows = await queryEqDb<RowDataPacket[]>(query, [accountId]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // Get character count for this account
  let characterCount = 0;
  if (charSchema) {
    const countRows = await queryEqDb<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM character_data WHERE ${charSchema.accountIdColumn} = ?`,
      [accountId]
    );
    characterCount = Number(countRows[0]?.count || 0);
  }

  return {
    id: row.id,
    name: row.name,
    charname: row.charname || null,
    status: row.status || 0,
    lsAccountId: row.ls_account_id || null,
    gmSpeed: row.gm_speed || 0,
    hideme: row.hideme || 0,
    suspendedReason: row.suspend_reason || null,
    suspendedUntil: row.suspended_until || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    timeCreation: row.time_creation || 0,
    ipExemptions: row.ip_exemptions || 0,
    characterCount
  };
}

/**
 * Get all corpses for a character
 */
export async function getCharacterCorpses(characterId: number): Promise<CharacterCorpse[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const hasCorpsesTable = await checkCharacterCorpsesTable();
  if (!hasCorpsesTable) {
    return [];
  }

  const zoneSchema = await discoverZoneSchema();

  let query = `
    SELECT
      cc.id,
      cc.charid as character_id,
      cc.charname as character_name,
      cc.zone_id,
      cc.instance_id,
      cc.x,
      cc.y,
      cc.z,
      cc.heading,
      cc.time_of_death,
      cc.is_buried,
      cc.is_rezzed,
      cc.was_at_graveyard,
      cc.copper,
      cc.silver,
      cc.gold,
      cc.platinum
  `;

  if (zoneSchema) {
    query += `, z.${zoneSchema.longNameColumn} as zone_name`;
  } else {
    query += `, NULL as zone_name`;
  }

  query += `
    FROM character_corpses cc
  `;

  if (zoneSchema) {
    query += `
    LEFT JOIN zone z ON cc.zone_id = z.${zoneSchema.idColumn}
    `;
  }

  query += `
    WHERE cc.charid = ?
    ORDER BY cc.time_of_death DESC
  `;

  const rows = await queryEqDb<RowDataPacket[]>(query, [characterId]);

  // Get item counts for each corpse
  const corpseIds = rows.map(r => r.id);
  let itemCounts: Record<number, number> = {};

  if (corpseIds.length > 0) {
    try {
      const itemCountRows = await queryEqDb<RowDataPacket[]>(`
        SELECT corpse_id, COUNT(*) as item_count
        FROM character_corpse_items
        WHERE corpse_id IN (${corpseIds.map(() => '?').join(',')})
        GROUP BY corpse_id
      `, corpseIds);

      itemCounts = itemCountRows.reduce((acc, row) => {
        acc[row.corpse_id] = Number(row.item_count);
        return acc;
      }, {} as Record<number, number>);
    } catch {
      // Table may not exist
    }
  }

  return rows.map(row => ({
    id: row.id,
    characterId: row.character_id,
    characterName: row.character_name || 'Unknown',
    zoneName: row.zone_name || `Zone ${row.zone_id}`,
    zoneId: row.zone_id || 0,
    instanceId: row.instance_id || 0,
    x: row.x || 0,
    y: row.y || 0,
    z: row.z || 0,
    heading: row.heading || 0,
    timeofdeath: row.time_of_death,
    isBuried: Boolean(row.is_buried),
    isRezzed: Boolean(row.is_rezzed),
    wasAtGraveyard: Boolean(row.was_at_graveyard),
    itemCount: itemCounts[row.id] || 0,
    platinum: row.platinum || 0,
    gold: row.gold || 0,
    silver: row.silver || 0,
    copper: row.copper || 0
  }));
}

/**
 * Get all associated characters/accounts for a character
 */
export async function getCharacterAssociates(characterId: number): Promise<CharacterAssociate[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const [charSchema, accountSchema] = await Promise.all([
    discoverCharacterDataSchema(),
    discoverAccountSchema()
  ]);

  if (!charSchema || !accountSchema) {
    throw new Error('Could not discover required schemas.');
  }

  // Get the character's account ID
  const charRows = await queryEqDb<RowDataPacket[]>(
    `SELECT ${charSchema.accountIdColumn} as account_id FROM character_data WHERE ${charSchema.idColumn} = ?`,
    [characterId]
  );

  if (charRows.length === 0) {
    return [];
  }

  const accountId = charRows[0].account_id;
  const associates: CharacterAssociate[] = [];

  // 1. Get all characters on the same account
  const sameAccountChars = await queryEqDb<RowDataPacket[]>(`
    SELECT
      cd.${charSchema.idColumn} as id,
      cd.${charSchema.nameColumn} as name,
      cd.${charSchema.accountIdColumn} as account_id,
      cd.level,
      cd.class,
      a.${accountSchema.nameColumn} as account_name
    FROM character_data cd
    JOIN account a ON cd.${charSchema.accountIdColumn} = a.${accountSchema.idColumn}
    WHERE cd.${charSchema.accountIdColumn} = ? AND cd.${charSchema.idColumn} != ?
  `, [accountId, characterId]);

  for (const char of sameAccountChars) {
    associates.push({
      characterId: char.id,
      characterName: char.name,
      accountId: char.account_id,
      accountName: char.account_name,
      level: char.level || 0,
      className: mapEqClassIdToName(char.class),
      associationType: 'same_account'
    });
  }

  // 2. Get characters from same IP via connections table (current/recent connections)
  const seenCharIds = new Set(associates.map(a => a.characterId));

  try {
    // First, get all IPs this character has connected from (from connections table)
    const ipRows = await queryEqDb<RowDataPacket[]>(`
      SELECT DISTINCT ip
      FROM connections
      WHERE characterid = ?
    `, [characterId]);

    const ips = ipRows.map(r => r.ip).filter(Boolean);

    if (ips.length > 0) {
      // Find other characters that connected from the same IPs
      const sameIpChars = await queryEqDb<RowDataPacket[]>(`
        SELECT DISTINCT
          c.characterid as id,
          cd.${charSchema.nameColumn} as name,
          cd.${charSchema.accountIdColumn} as account_id,
          cd.level,
          cd.class,
          a.${accountSchema.nameColumn} as account_name,
          c.ip as shared_ip
        FROM connections c
        JOIN character_data cd ON c.characterid = cd.${charSchema.idColumn}
        JOIN account a ON cd.${charSchema.accountIdColumn} = a.${accountSchema.idColumn}
        WHERE c.ip IN (${ips.map(() => '?').join(',')})
        AND c.characterid != ?
        AND cd.${charSchema.accountIdColumn} != ?
      `, [...ips, characterId, accountId]);

      for (const char of sameIpChars) {
        if (!seenCharIds.has(char.id)) {
          seenCharIds.add(char.id);
          associates.push({
            characterId: char.id,
            characterName: char.name,
            accountId: char.account_id,
            accountName: char.account_name,
            level: char.level || 0,
            className: mapEqClassIdToName(char.class),
            associationType: 'same_ip',
            sharedIp: char.shared_ip
          });
        }
      }
    }
  } catch (err) {
    // Connections table may not exist or have different schema
    console.warn('[CharacterAdmin] Connections table IP lookup failed:', err);
  }

  // 2b. Also check player_event_logs for historical IP associations
  try {
    // Get all IPs this character has logged in from (from event logs)
    const ipRows = await queryEqDb<RowDataPacket[]>(`
      SELECT DISTINCT
        JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.ip_address')) as ip
      FROM player_event_logs
      WHERE character_id = ? AND event_type_id IN (10, 11)
      AND JSON_EXTRACT(event_data, '$.ip_address') IS NOT NULL
      LIMIT 100
    `, [characterId]);

    const ips = ipRows.map(r => r.ip).filter(Boolean);

    if (ips.length > 0) {
      // Find other characters that logged in from the same IPs
      const sameIpChars = await queryEqDb<RowDataPacket[]>(`
        SELECT DISTINCT
          pel.character_id as id,
          cd.${charSchema.nameColumn} as name,
          cd.${charSchema.accountIdColumn} as account_id,
          cd.level,
          cd.class,
          a.${accountSchema.nameColumn} as account_name,
          JSON_UNQUOTE(JSON_EXTRACT(pel.event_data, '$.ip_address')) as shared_ip
        FROM player_event_logs pel
        JOIN character_data cd ON pel.character_id = cd.${charSchema.idColumn}
        JOIN account a ON cd.${charSchema.accountIdColumn} = a.${accountSchema.idColumn}
        WHERE JSON_UNQUOTE(JSON_EXTRACT(pel.event_data, '$.ip_address')) IN (${ips.map(() => '?').join(',')})
        AND pel.character_id != ?
        AND cd.${charSchema.accountIdColumn} != ?
        AND pel.event_type_id IN (10, 11)
        LIMIT 200
      `, [...ips, characterId, accountId]);

      for (const char of sameIpChars) {
        if (!seenCharIds.has(char.id)) {
          seenCharIds.add(char.id);
          associates.push({
            characterId: char.id,
            characterName: char.name,
            accountId: char.account_id,
            accountName: char.account_name,
            level: char.level || 0,
            className: mapEqClassIdToName(char.class),
            associationType: 'same_ip',
            sharedIp: char.shared_ip
          });
        }
      }
    }
  } catch {
    // IP lookup may fail if event_data format is different
  }

  // 3. Get manual associations from our database
  const manualAssociations = await prisma.characterAssociation.findMany({
    where: {
      OR: [
        { sourceCharacterId: characterId },
        { targetCharacterId: characterId }
      ]
    }
  });

  for (const assoc of manualAssociations) {
    // Get the "other" character details
    const otherCharId = assoc.sourceCharacterId === characterId
      ? assoc.targetCharacterId
      : assoc.sourceCharacterId;
    const otherCharName = assoc.sourceCharacterId === characterId
      ? assoc.targetCharacterName
      : assoc.sourceCharacterName;

    // Check if already in list
    if (associates.some(a => a.characterId === otherCharId)) {
      continue;
    }

    // Get additional details from EQ database
    try {
      const charDetails = await queryEqDb<RowDataPacket[]>(`
        SELECT
          cd.${charSchema.idColumn} as id,
          cd.${charSchema.nameColumn} as name,
          cd.${charSchema.accountIdColumn} as account_id,
          cd.level,
          cd.class,
          a.${accountSchema.nameColumn} as account_name
        FROM character_data cd
        JOIN account a ON cd.${charSchema.accountIdColumn} = a.${accountSchema.idColumn}
        WHERE cd.${charSchema.idColumn} = ?
      `, [otherCharId]);

      if (charDetails.length > 0) {
        const char = charDetails[0];
        associates.push({
          characterId: char.id,
          characterName: char.name,
          accountId: char.account_id,
          accountName: char.account_name,
          level: char.level || 0,
          className: mapEqClassIdToName(char.class),
          associationType: 'manual',
          manualReason: assoc.reason || undefined,
          manualAssociationId: assoc.id,
          createdByName: assoc.createdByName,
          createdAt: assoc.createdAt.toISOString()
        });
      }
    } catch {
      // Character may no longer exist
      associates.push({
        characterId: otherCharId,
        characterName: otherCharName,
        accountId: assoc.targetAccountId,
        accountName: 'Unknown',
        level: 0,
        className: 'UNKNOWN',
        associationType: 'manual',
        manualReason: assoc.reason || undefined,
        manualAssociationId: assoc.id,
        createdByName: assoc.createdByName,
        createdAt: assoc.createdAt.toISOString()
      });
    }
  }

  return associates;
}

/**
 * Search for characters by name (for adding manual associations)
 */
export async function searchCharacters(
  searchTerm: string,
  limit: number = 20
): Promise<CharacterSearchResult[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  if (searchTerm.length < 2) {
    return [];
  }

  const [charSchema, accountSchema] = await Promise.all([
    discoverCharacterDataSchema(),
    discoverAccountSchema()
  ]);

  if (!charSchema || !accountSchema) {
    return [];
  }

  const rows = await queryEqDb<RowDataPacket[]>(`
    SELECT
      cd.${charSchema.idColumn} as id,
      cd.${charSchema.nameColumn} as name,
      cd.${charSchema.accountIdColumn} as account_id,
      cd.level,
      cd.class,
      a.${accountSchema.nameColumn} as account_name
    FROM character_data cd
    JOIN account a ON cd.${charSchema.accountIdColumn} = a.${accountSchema.idColumn}
    WHERE cd.${charSchema.nameColumn} LIKE ?
    ORDER BY cd.${charSchema.nameColumn}
    LIMIT ?
  `, [`%${searchTerm}%`, limit]);

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    level: row.level || 0,
    className: mapEqClassIdToName(row.class),
    accountId: row.account_id,
    accountName: row.account_name
  }));
}

/**
 * Add a manual character association
 */
export async function addManualAssociation(
  sourceCharacterId: number,
  targetCharacterId: number,
  reason: string | undefined,
  userId: string,
  userName: string
): Promise<void> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured.');
  }

  const charSchema = await discoverCharacterDataSchema();
  if (!charSchema) {
    throw new Error('Could not discover character_data schema.');
  }

  // Get both character details
  const chars = await queryEqDb<RowDataPacket[]>(`
    SELECT
      ${charSchema.idColumn} as id,
      ${charSchema.nameColumn} as name,
      ${charSchema.accountIdColumn} as account_id
    FROM character_data
    WHERE ${charSchema.idColumn} IN (?, ?)
  `, [sourceCharacterId, targetCharacterId]);

  if (chars.length < 2) {
    throw new Error('One or both characters not found.');
  }

  const sourceChar = chars.find(c => c.id === sourceCharacterId);
  const targetChar = chars.find(c => c.id === targetCharacterId);

  if (!sourceChar || !targetChar) {
    throw new Error('One or both characters not found.');
  }

  await prisma.characterAssociation.create({
    data: {
      sourceCharacterId,
      sourceCharacterName: sourceChar.name,
      targetCharacterId,
      targetCharacterName: targetChar.name,
      targetAccountId: targetChar.account_id,
      reason,
      createdById: userId,
      createdByName: userName
    }
  });
}

/**
 * Remove a manual character association
 */
export async function removeManualAssociation(associationId: string): Promise<void> {
  await prisma.characterAssociation.delete({
    where: { id: associationId }
  });
}

/**
 * Get notes for an account
 */
export async function getAccountNotes(accountId: number): Promise<AccountNote[]> {
  const notes = await prisma.accountNote.findMany({
    where: { eqAccountId: accountId },
    orderBy: { createdAt: 'desc' }
  });

  return notes.map(note => ({
    id: note.id,
    eqAccountId: note.eqAccountId,
    content: note.content,
    createdById: note.createdById,
    createdByName: note.createdByName,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  }));
}

/**
 * Create a note for an account
 */
export async function createAccountNote(
  accountId: number,
  content: string,
  userId: string,
  userName: string
): Promise<AccountNote> {
  const note = await prisma.accountNote.create({
    data: {
      eqAccountId: accountId,
      content,
      createdById: userId,
      createdByName: userName
    }
  });

  return {
    id: note.id,
    eqAccountId: note.eqAccountId,
    content: note.content,
    createdById: note.createdById,
    createdByName: note.createdByName,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  };
}

/**
 * Update a note
 */
export async function updateAccountNote(
  noteId: string,
  content: string
): Promise<AccountNote> {
  const note = await prisma.accountNote.update({
    where: { id: noteId },
    data: { content }
  });

  return {
    id: note.id,
    eqAccountId: note.eqAccountId,
    content: note.content,
    createdById: note.createdById,
    createdByName: note.createdByName,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  };
}

/**
 * Delete a note
 */
export async function deleteAccountNote(noteId: string): Promise<void> {
  await prisma.accountNote.delete({
    where: { id: noteId }
  });
}
