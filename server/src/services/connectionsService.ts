import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

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

// Cache for schema discovery
let schemaCache: {
  zoneTable: { exists: boolean; idColumn: string | null; longNameColumn: string | null; shortNameColumn: string | null } | null;
  guildsTable: { exists: boolean; idColumn: string | null; nameColumn: string | null } | null;
  guildMembersTable: { exists: boolean; charIdColumn: string | null; guildIdColumn: string | null } | null;
} = {
  zoneTable: null,
  guildsTable: null,
  guildMembersTable: null
};

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

async function discoverZoneSchema(): Promise<typeof schemaCache.zoneTable> {
  if (schemaCache.zoneTable !== null) {
    return schemaCache.zoneTable;
  }

  const columns = await getTableColumns('zone');
  if (columns.length === 0) {
    schemaCache.zoneTable = { exists: false, idColumn: null, longNameColumn: null, shortNameColumn: null };
    return schemaCache.zoneTable;
  }

  // Find the zone ID column - try multiple options since character_data.zone_id might map to different columns
  // Priority: zoneidnumber first (standard EQEmu), then id
  const idCandidates = ['zoneidnumber', 'id', 'zoneid', 'zone_id'];
  const idColumn = idCandidates.find(c => columns.includes(c)) || null;

  // Find the long name column
  const longNameCandidates = ['long_name', 'longname', 'long'];
  const longNameColumn = longNameCandidates.find(c => columns.includes(c)) || null;

  // Find the short name column
  const shortNameCandidates = ['short_name', 'shortname', 'short'];
  const shortNameColumn = shortNameCandidates.find(c => columns.includes(c)) || null;

  console.log('[connectionsService] Zone table schema:', { idColumn, longNameColumn, shortNameColumn });

  schemaCache.zoneTable = {
    exists: true,
    idColumn,
    longNameColumn,
    shortNameColumn
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
  const idColumn = idCandidates.find(c => columns.includes(c)) || null;

  const nameCandidates = ['name', 'guild_name', 'guildname'];
  const nameColumn = nameCandidates.find(c => columns.includes(c)) || null;

  console.log('[connectionsService] Guilds table schema:', { idColumn, nameColumn });

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
  const charIdColumn = charIdCandidates.find(c => columns.includes(c)) || null;

  // Find guild ID column
  const guildIdCandidates = ['guild_id', 'guildid'];
  const guildIdColumn = guildIdCandidates.find(c => columns.includes(c)) || null;

  console.log('[connectionsService] Guild_members table schema:', { columns, charIdColumn, guildIdColumn });

  schemaCache.guildMembersTable = {
    exists: true,
    charIdColumn,
    guildIdColumn
  };
  return schemaCache.guildMembersTable;
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
  const canJoinZone = zoneSchema?.exists && zoneSchema.idColumn && (zoneSchema.longNameColumn || zoneSchema.shortNameColumn);
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
    if (zoneSchema.idColumn === 'zoneidnumber') {
      joins += `
    LEFT JOIN zone z ON cd.zone_id = z.zoneidnumber`;
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
  const canJoinGuilds = guildsSchema?.exists && guildsSchema.idColumn && guildsSchema.nameColumn &&
                        guildMembersSchema?.exists && guildMembersSchema.charIdColumn && guildMembersSchema.guildIdColumn;
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

  const query = `SELECT ${selectFields} ${joins} ORDER BY cd.name ASC`;
  console.log('[connectionsService] Executing query:', query);

  try {
    const rows = await queryEqDb<ConnectionRow[]>(query);

    // Log first row for debugging
    if (rows.length > 0) {
      console.log('[connectionsService] First row sample:', {
        zone_id: rows[0].zone_id,
        zone_long_name: rows[0].zone_long_name,
        zone_short_name: rows[0].zone_short_name,
        guild_name: rows[0].guild_name
      });
    }

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
      guildName: row.guild_name || null
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
      guildName: null
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
