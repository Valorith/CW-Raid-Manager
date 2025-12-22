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

// Cache for table existence checks
let hasZoneTable: boolean | null = null;
let hasGuildsTable: boolean | null = null;

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return Number(rows[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function checkZoneTable(): Promise<boolean> {
  if (hasZoneTable === null) {
    hasZoneTable = await checkTableExists('zone');
  }
  return hasZoneTable;
}

async function checkGuildsTable(): Promise<boolean> {
  if (hasGuildsTable === null) {
    hasGuildsTable = await checkTableExists('guilds');
  }
  return hasGuildsTable;
}

/**
 * Fetch all currently connected characters from the EQEmu server
 * Joins with character_data for character details, zone for zone names, and guilds for guild names
 */
export async function fetchServerConnections(): Promise<ServerConnection[]> {
  if (!isEqDbConfigured()) {
    throw new Error(
      'EQ content database is not configured; set EQ_DB_* values to enable connections lookup.'
    );
  }

  // Check which tables are available
  const [zoneAvailable, guildsAvailable] = await Promise.all([
    checkZoneTable(),
    checkGuildsTable()
  ]);

  // Build query dynamically based on available tables
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

  if (zoneAvailable) {
    selectFields += `,
      z.long_name as zone_long_name,
      z.short_name as zone_short_name`;
    joins += `
    LEFT JOIN zone z ON cd.zone_id = z.zoneidnumber`;
  } else {
    selectFields += `,
      NULL as zone_long_name,
      NULL as zone_short_name`;
  }

  if (guildsAvailable) {
    selectFields += `,
      g.name as guild_name`;
    joins += `
    LEFT JOIN guilds g ON cd.guild_id = g.id AND cd.guild_id > 0`;
  } else {
    selectFields += `,
      NULL as guild_name`;
  }

  const query = `SELECT ${selectFields} ${joins} ORDER BY cd.name ASC`;

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
      guildName: row.guild_name || null
    }));
  } catch (error) {
    // If the query fails, try a simpler query without joins
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
