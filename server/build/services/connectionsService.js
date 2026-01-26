import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { getItemIconId } from './eqItemService.js';
function mapEqClassIdToName(classId) {
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
let schemaCache = {
    zoneTable: null,
    guildsTable: null,
    guildMembersTable: null
};
async function getTableColumns(tableName) {
    try {
        const rows = await queryEqDb(`SELECT COLUMN_NAME as col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tableName]);
        return rows.map(r => String(r.col).toLowerCase());
    }
    catch {
        return [];
    }
}
async function discoverZoneSchema() {
    if (schemaCache.zoneTable !== null) {
        return schemaCache.zoneTable;
    }
    const columns = await getTableColumns('zone');
    if (columns.length === 0) {
        schemaCache.zoneTable = { exists: false, idColumn: null, longNameColumn: null, shortNameColumn: null, hasVersionColumn: false };
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
async function discoverGuildsSchema() {
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
    schemaCache.guildsTable = {
        exists: true,
        idColumn,
        nameColumn
    };
    return schemaCache.guildsTable;
}
async function discoverGuildMembersSchema() {
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
export async function fetchServerConnections() {
    if (!isEqDbConfigured()) {
        throw new Error('EQ content database is not configured; set EQ_DB_* values to enable connections lookup.');
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
        }
        else {
            selectFields += `,
      NULL as zone_long_name`;
        }
        if (zoneSchema.shortNameColumn) {
            selectFields += `,
      z.${zoneSchema.shortNameColumn} as zone_short_name`;
        }
        else {
            selectFields += `,
      NULL as zone_short_name`;
        }
        // Try joining on zoneidnumber first, if that's not the id column, also try id
        // Use MIN(version) subquery to avoid duplicates and handle zones that only have version > 0
        if (zoneSchema.hasVersionColumn) {
            joins += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}
      AND z.version = (SELECT MIN(z2.version) FROM zone z2 WHERE z2.${zoneSchema.idColumn} = cd.zone_id)`;
        }
        else {
            joins += `
    LEFT JOIN zone z ON cd.zone_id = z.${zoneSchema.idColumn}`;
        }
    }
    else {
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
    }
    else {
        selectFields += `,
      NULL as guild_name`;
    }
    // Use GROUP BY to prevent duplicates from guild_members join (if character has multiple guild entries)
    const query = `SELECT ${selectFields} ${joins} GROUP BY c.connectid ORDER BY cd.name ASC`;
    try {
        const rows = await queryEqDb(query);
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
    }
    catch (error) {
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
        const rows = await queryEqDb(simpleQuery);
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
export async function getConnectionCount() {
    if (!isEqDbConfigured()) {
        return 0;
    }
    const query = `SELECT COUNT(*) as count FROM connections`;
    const [row] = await queryEqDb(query);
    return Number(row?.count || 0);
}
/**
 * Fetch IP exemptions from the EQEmu database
 * These define custom limits for specific IP addresses
 */
export async function fetchIpExemptions() {
    if (!isEqDbConfigured()) {
        return [];
    }
    try {
        const query = `SELECT exemption_ip, exemption_amount FROM ip_exemptions`;
        const rows = await queryEqDb(query);
        return rows.map((row) => ({
            ip: row.exemption_ip || '',
            exemptionAmount: Number(row.exemption_amount) || 0
        }));
    }
    catch {
        // Table may not exist, return empty array
        return [];
    }
}
/**
 * Fetch last activity data for a batch of character IDs
 * Returns last action timestamp and last kill info for each character
 */
export async function fetchCharacterLastActivity(characterIds) {
    const result = new Map();
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
        const lastActionRows = await queryEqDb(lastActionQuery, [...characterIds, ...characterIds]);
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
        const lastKillRows = await queryEqDb(lastKillQuery, [...characterIds, ...characterIds]);
        for (const row of lastKillRows) {
            const activity = result.get(row.character_id);
            if (activity) {
                activity.lastKillAt = row.killed_at;
                // Parse event_data to get NPC name
                if (row.npc_name) {
                    activity.lastKillNpcName = row.npc_name;
                }
                else {
                    // event_data is stored as JSON, try to extract npc_name
                    try {
                        const eventData = JSON.parse(row.event_data || '{}');
                        activity.lastKillNpcName = eventData.npc_name || eventData.npcName || null;
                    }
                    catch {
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
        const hackCountRows = await queryEqDb(hackCountQuery, characterIds);
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
        const lastSaleRows = await queryEqDb(lastSaleQuery, [...characterIds, ...characterIds]);
        // Track items that need icon lookups
        const iconLookups = [];
        for (const row of lastSaleRows) {
            const activity = result.get(row.character_id);
            if (activity) {
                activity.lastSaleAt = row.sold_at;
                // Parse event_data to get item name, id, icon, and price
                try {
                    const eventData = JSON.parse(row.event_data || '{}');
                    activity.lastSaleItemName = eventData.item_name || eventData.itemName || null;
                    activity.lastSaleItemId = eventData.item_id ?? eventData.itemId ?? null;
                    activity.lastSaleItemIconId = eventData.item_icon ?? eventData.itemIcon ?? eventData.icon ?? null;
                    activity.lastSalePrice = eventData.total_cost ?? eventData.totalCost ?? eventData.price ?? null;
                    // If we have an item_id but no icon, queue for lookup from items table
                    if (activity.lastSaleItemId && !activity.lastSaleItemIconId) {
                        iconLookups.push({ activity, itemId: activity.lastSaleItemId });
                    }
                }
                catch {
                    activity.lastSaleItemName = null;
                    activity.lastSaleItemId = null;
                    activity.lastSaleItemIconId = null;
                    activity.lastSalePrice = null;
                }
            }
        }
        // Look up icons from items table for items that didn't have icons in event_data
        if (iconLookups.length > 0) {
            const iconResults = await Promise.all(iconLookups.map(async ({ activity, itemId }) => {
                const iconId = await getItemIconId(itemId);
                return { activity, iconId };
            }));
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
        const totalSalesRows = await queryEqDb(totalSalesQuery, characterIds);
        for (const row of totalSalesRows) {
            const activity = result.get(row.character_id);
            if (activity) {
                activity.totalSalesAmount = row.total_amount || 0;
                activity.totalSalesCount = row.total_count || 0;
            }
        }
    }
    catch (error) {
        console.error('[connectionsService] Error fetching character last activity:', error);
        // Return partial results or empty map on error
    }
    return result;
}
