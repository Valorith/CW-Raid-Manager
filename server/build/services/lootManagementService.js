import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
function ensureEqDbConfigured() {
    if (!isEqDbConfigured()) {
        throw new Error('EQ content database is not configured. Set EQ_DB_HOST, EQ_DB_USER, EQ_DB_PASSWORD, and EQ_DB_NAME.');
    }
}
// Cache for table existence checks - tables don't change at runtime
const tableExistsCache = new Map();
const tableColumnsCache = new Map();
// Get column names for a table
async function getTableColumns(tableName) {
    const cached = tableColumnsCache.get(tableName);
    if (cached)
        return cached;
    try {
        const rows = await queryEqDb(`SELECT COLUMN_NAME as columnName FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tableName]);
        const columns = rows.map((r) => String(r.columnName).toLowerCase());
        tableColumnsCache.set(tableName, columns);
        return columns;
    }
    catch {
        return [];
    }
}
// Helper to find the first matching value from a row given possible column names
function findValue(row, possibleNames, defaultVal) {
    for (const name of possibleNames) {
        // Check exact match first
        if (row[name] !== undefined)
            return row[name];
        // Check lowercase version
        const lower = name.toLowerCase();
        if (row[lower] !== undefined)
            return row[lower];
    }
    // Check all row keys for partial matches
    const rowKeys = Object.keys(row);
    for (const name of possibleNames) {
        const baseName = name.replace(/_/g, '').toLowerCase();
        for (const key of rowKeys) {
            if (key.toLowerCase().replace(/_/g, '') === baseName && row[key] !== undefined) {
                return row[key];
            }
        }
    }
    return defaultVal;
}
async function checkTableExists(tableName) {
    const cached = tableExistsCache.get(tableName);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const rows = await queryEqDb(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tableName]);
        const exists = rows.length > 0;
        tableExistsCache.set(tableName, exists);
        return exists;
    }
    catch {
        tableExistsCache.set(tableName, false);
        return false;
    }
}
// Get all table existence in a single query
async function getExistingTables() {
    const tableNames = ['loot_master', 'lc_items', 'lc_requests', 'lc_votes'];
    // Check cache first
    const allCached = tableNames.every((name) => tableExistsCache.has(name));
    if (allCached) {
        return new Set(tableNames.filter((name) => tableExistsCache.get(name)));
    }
    try {
        const placeholders = tableNames.map(() => '?').join(', ');
        const rows = await queryEqDb(`SELECT TABLE_NAME as tableName FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`, tableNames);
        const existing = new Set();
        for (const row of rows) {
            const name = row.tableName;
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
    }
    catch {
        return new Set();
    }
}
export async function getLootManagementSummary() {
    ensureEqDbConfigured();
    const existingTables = await getExistingTables();
    // Build a single query to get all counts at once
    const countParts = [];
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
        const rows = await queryEqDb(`SELECT ${countParts.join(', ')}`);
        const row = rows[0] ?? {};
        return {
            lootMasterCount: Number(row.loot_master_count ?? 0),
            lcItemsCount: Number(row.lc_items_count ?? 0),
            lcRequestsCount: Number(row.lc_requests_count ?? 0),
            lcVotesCount: Number(row.lc_votes_count ?? 0)
        };
    }
    catch {
        return {
            lootMasterCount: 0,
            lcItemsCount: 0,
            lcRequestsCount: 0,
            lcVotesCount: 0
        };
    }
}
export async function fetchLootMaster(page = 1, pageSize = 25, search) {
    ensureEqDbConfigured();
    const exists = await checkTableExists('loot_master');
    if (!exists) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    const params = [];
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
        const rows = await queryEqDb(dataQuery, [...params, pageSize, offset]);
        const countRows = await queryEqDb(`SELECT FOUND_ROWS() as total`);
        const total = Number(countRows[0]?.total ?? 0);
        const data = rows.map((row) => ({
            id: row.id,
            itemId: findValue(row, ['item_id', 'itemid', 'itemID', 'ItemId'], 0),
            itemName: findValue(row, ['item_name', 'itemname', 'ItemName', 'name', 'Name'], null),
            npcName: findValue(row, ['npc_name', 'npcname', 'NpcName', 'npc', 'Npc', 'mob', 'Mob'], null),
            zoneName: findValue(row, ['zone_name', 'zonename', 'ZoneName', 'zone', 'Zone'], null),
            dropChance: findValue(row, ['drop_chance', 'dropchance', 'DropChance', 'chance', 'Chance', 'rate', 'Rate'], null),
            createdAt: findValue(row, ['created_at', 'createdat', 'CreatedAt', 'date', 'Date', 'timestamp'], null)
        }));
        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }
    catch {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
}
export async function fetchLcItems(page = 1, pageSize = 25, search) {
    ensureEqDbConfigured();
    const exists = await checkTableExists('lc_items');
    if (!exists) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    const params = [];
    if (search && search.trim()) {
        whereClause = `WHERE i.Name LIKE ?`;
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern);
    }
    // JOIN with items, npc_types, and character_data tables
    const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS
      lc.id, lc.guildid, lc.raidid, lc.npcid, lc.itemid, lc.status, lc.type, lc.awardee,
      i.Name as item_name,
      npc.name as npc_name,
      ch.name as awardee_name
    FROM lc_items lc
    LEFT JOIN items i ON lc.itemid = i.id
    LEFT JOIN npc_types npc ON lc.npcid = npc.id
    LEFT JOIN character_data ch ON lc.awardee = ch.id
    ${whereClause}
    ORDER BY lc.id DESC
    LIMIT ? OFFSET ?
  `;
    try {
        const rows = await queryEqDb(dataQuery, [...params, pageSize, offset]);
        const countRows = await queryEqDb(`SELECT FOUND_ROWS() as total`);
        const total = Number(countRows[0]?.total ?? 0);
        const data = rows.map((row) => ({
            id: row.id,
            itemId: findValue(row, ['itemid', 'item_id', 'itemID', 'ItemId'], 0),
            itemName: findValue(row, ['item_name', 'Name', 'name', 'itemname'], null),
            raidId: findValue(row, ['raidid', 'raid_id'], 0),
            npcId: findValue(row, ['npcid', 'npc_id'], 0),
            npcName: findValue(row, ['npc_name', 'npcname', 'NpcName'], null),
            status: findValue(row, ['status', 'Status'], null),
            type: findValue(row, ['type', 'Type'], null),
            awardee: findValue(row, ['awardee', 'Awardee', 'awarded_to'], null),
            awardeeName: findValue(row, ['awardee_name', 'awardeename', 'AwardeeName'], null)
        }));
        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }
    catch {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
}
export async function fetchLcRequests(page = 1, pageSize = 25, search) {
    ensureEqDbConfigured();
    const exists = await checkTableExists('lc_requests');
    if (!exists) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    const params = [];
    if (search && search.trim()) {
        whereClause = `WHERE i.Name LIKE ?`;
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern);
    }
    // JOIN with items and character_data tables to get names
    const dataQuery = `
    SELECT SQL_CALC_FOUND_ROWS
      lr.*,
      i.Name as item_name,
      ch.name as char_name,
      ri.Name as replaced_item_name
    FROM lc_requests lr
    LEFT JOIN items i ON lr.itemid = i.id
    LEFT JOIN character_data ch ON lr.charid = ch.id
    LEFT JOIN items ri ON lr.replaceditemid = ri.id
    ${whereClause}
    ORDER BY lr.id DESC
    LIMIT ? OFFSET ?
  `;
    try {
        const rows = await queryEqDb(dataQuery, [...params, pageSize, offset]);
        const countRows = await queryEqDb(`SELECT FOUND_ROWS() as total`);
        const total = Number(countRows[0]?.total ?? 0);
        // Log actual columns for debugging
        if (rows.length > 0) {
            console.log('[LC_REQUESTS] Actual columns:', Object.keys(rows[0]));
            console.log('[LC_REQUESTS] First row sample:', JSON.stringify(rows[0], null, 2));
        }
        const data = rows.map((row) => ({
            id: row.id,
            eventId: findValue(row, ['eventid', 'event_id', 'EventId'], 0),
            charId: findValue(row, ['charid', 'char_id', 'CharId', 'character_id'], 0),
            charName: findValue(row, ['char_name', 'charname', 'CharName', 'character_name'], null),
            itemId: findValue(row, ['itemid', 'item_id', 'itemID', 'ItemId'], 0),
            itemName: findValue(row, ['item_name', 'Name', 'name', 'itemname'], null),
            replacedItemId: findValue(row, ['replaceditemid', 'replaced_item_id', 'ReplacedItemId'], null),
            replacedItemName: findValue(row, ['replaced_item_name', 'replaceditemname', 'ReplacedItemName'], null)
        }));
        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }
    catch {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
}
export async function fetchLcVotes(page = 1, pageSize = 25, search) {
    ensureEqDbConfigured();
    const exists = await checkTableExists('lc_votes');
    if (!exists) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    const params = [];
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
        const rows = await queryEqDb(dataQuery, [...params, pageSize, offset]);
        const countRows = await queryEqDb(`SELECT FOUND_ROWS() as total`);
        const total = Number(countRows[0]?.total ?? 0);
        // Log actual columns for debugging
        if (rows.length > 0) {
            console.log('[LC_VOTES] Actual columns:', Object.keys(rows[0]));
            console.log('[LC_VOTES] First row sample:', JSON.stringify(rows[0], null, 2));
        }
        const data = rows.map((row) => ({
            id: row.id,
            requestId: findValue(row, ['request_id', 'requestid', 'RequestId', 'req_id', 'reqid'], 0),
            voterId: findValue(row, ['voter_id', 'voterid', 'VoterId', 'user_id', 'userid'], 0),
            voterName: findValue(row, ['voter_name', 'votername', 'VoterName', 'voter', 'Voter', 'user', 'User'], null),
            itemName: findValue(row, ['item_name', 'itemname', 'ItemName', 'name', 'Name'], null),
            characterName: findValue(row, ['character_name', 'charactername', 'CharacterName', 'char_name', 'charname', 'player', 'Player'], null),
            vote: findValue(row, ['vote', 'Vote', 'vote_value', 'voteValue', 'value', 'Value'], null),
            voteDate: findValue(row, ['vote_date', 'votedate', 'VoteDate', 'created_at', 'createdAt', 'date', 'Date', 'timestamp'], null),
            reason: findValue(row, ['reason', 'Reason', 'comment', 'Comment', 'note', 'Note', 'notes', 'Notes'], null)
        }));
        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }
    catch {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
}
