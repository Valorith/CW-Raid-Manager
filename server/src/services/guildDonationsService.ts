import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

// EQEmu donation status values
const EQ_DONATION_STATUS_PENDING = 1;
const EQ_DONATION_STATUS_REJECTED = 2;

export interface EqGuildDonation {
  id: number;
  guildId: number;
  guildName: string | null;
  itemName: string | null;
  itemId: number | null;
  itemIconId: number | null;
  donatedAt: string | null;
  status: 'PENDING' | 'REJECTED';
}

// Cache for table column detection
let donationsTableColumns: string[] | null = null;

/**
 * Get the column names for the guild_donations table
 */
async function getGuildDonationsColumns(): Promise<string[]> {
  if (donationsTableColumns) return donationsTableColumns;

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COLUMN_NAME as columnName FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guild_donations'`
    );
    donationsTableColumns = rows.map((r) => String(r.columnName).toLowerCase());
    return donationsTableColumns;
  } catch {
    return [];
  }
}

/**
 * Check if the guild_donations table exists in EQEmu database
 */
async function checkGuildDonationsTableExists(): Promise<boolean> {
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guild_donations'`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Find a column from a list of possible names
 */
function findColumn(columns: string[], possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    if (columns.includes(name.toLowerCase())) {
      return name;
    }
  }
  return null;
}

/**
 * Map EQEmu status number to our status string
 */
function mapEqStatusToStatus(eqStatus: number): 'PENDING' | 'REJECTED' {
  return eqStatus === EQ_DONATION_STATUS_REJECTED ? 'REJECTED' : 'PENDING';
}

/**
 * Get the EQEmu guild ID by matching guild name from the app database
 */
async function getEqGuildIdByAppGuildId(appGuildId: string): Promise<number | null> {
  // First get the guild name from the app database
  const appGuild = await prisma.guild.findUnique({
    where: { id: appGuildId },
    select: { name: true }
  });

  if (!appGuild) return null;

  // Then find the matching guild in EQEmu by name
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT id FROM guilds WHERE name = ? LIMIT 1`,
      [appGuild.name]
    );
    return rows.length > 0 ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch pending donations for a guild from EQEmu database
 */
export async function fetchPendingDonations(appGuildId: string): Promise<EqGuildDonation[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const tableExists = await checkGuildDonationsTableExists();
  if (!tableExists) {
    return [];
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return [];
  }

  const columns = await getGuildDonationsColumns();

  // Detect column names for flexible schema support
  const idCol = findColumn(columns, ['id']) ?? 'id';
  const guildIdCol = findColumn(columns, ['guild_id', 'guildid']) ?? 'guild_id';
  const itemNameCol = findColumn(columns, ['item_name', 'itemname', 'name']) ?? 'item_name';
  const itemIdCol = findColumn(columns, ['item_id', 'itemid']) ?? 'item_id';
  const statusCol = findColumn(columns, ['status']) ?? 'status';
  const donatedAtCol = findColumn(columns, ['donated_at', 'donatedat', 'date_added', 'created_at', 'timestamp']) ?? 'donated_at';

  // Check if we have item icon column
  const iconCol = findColumn(columns, ['item_icon', 'icon_id', 'icon', 'itemicon']);

  // Build select columns
  const selectCols = [
    `d.${idCol} as id`,
    `d.${guildIdCol} as guildId`,
    `d.${itemNameCol} as itemName`,
    `d.${itemIdCol} as itemId`,
    `d.${statusCol} as status`,
    `d.${donatedAtCol} as donatedAt`
  ];

  if (iconCol) {
    selectCols.push(`d.${iconCol} as itemIconId`);
  } else {
    // Try to get icon from items table
    selectCols.push(`i.icon as itemIconId`);
  }

  // Query with optional join to items table for icon lookup
  const query = `
    SELECT ${selectCols.join(', ')}, g.name as guildName
    FROM guild_donations d
    LEFT JOIN guilds g ON d.${guildIdCol} = g.id
    ${!iconCol ? `LEFT JOIN items i ON d.${itemIdCol} = i.id` : ''}
    WHERE d.${guildIdCol} = ? AND d.${statusCol} = ?
    ORDER BY d.${donatedAtCol} DESC
    LIMIT 500
  `;

  try {
    const rows = await queryEqDb<RowDataPacket[]>(query, [eqGuildId, EQ_DONATION_STATUS_PENDING]);

    return rows.map((row) => ({
      id: Number(row.id),
      guildId: Number(row.guildId),
      guildName: row.guildName ? String(row.guildName) : null,
      itemName: row.itemName ? String(row.itemName) : null,
      itemId: row.itemId ? Number(row.itemId) : null,
      itemIconId: row.itemIconId ? Number(row.itemIconId) : null,
      donatedAt: row.donatedAt ? String(row.donatedAt) : null,
      status: mapEqStatusToStatus(Number(row.status))
    }));
  } catch (error) {
    console.error('Failed to fetch guild donations from EQEmu:', error);
    return [];
  }
}

/**
 * Get the count of pending donations for a guild
 */
export async function getPendingDonationCount(appGuildId: string): Promise<number> {
  if (!isEqDbConfigured()) {
    return 0;
  }

  const tableExists = await checkGuildDonationsTableExists();
  if (!tableExists) {
    return 0;
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return 0;
  }

  const columns = await getGuildDonationsColumns();
  const guildIdCol = findColumn(columns, ['guild_id', 'guildid']) ?? 'guild_id';
  const statusCol = findColumn(columns, ['status']) ?? 'status';

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM guild_donations WHERE ${guildIdCol} = ? AND ${statusCol} = ?`,
      [eqGuildId, EQ_DONATION_STATUS_PENDING]
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Mark a donation as rejected in EQEmu database
 */
export async function rejectDonation(appGuildId: string, donationId: number): Promise<boolean> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return false;
  }

  const columns = await getGuildDonationsColumns();
  const guildIdCol = findColumn(columns, ['guild_id', 'guildid']) ?? 'guild_id';
  const statusCol = findColumn(columns, ['status']) ?? 'status';

  try {
    await queryEqDb(
      `UPDATE guild_donations SET ${statusCol} = ? WHERE id = ? AND ${guildIdCol} = ?`,
      [EQ_DONATION_STATUS_REJECTED, donationId, eqGuildId]
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark all pending donations as rejected for a guild
 */
export async function rejectAllDonations(appGuildId: string): Promise<number> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return 0;
  }

  const columns = await getGuildDonationsColumns();
  const guildIdCol = findColumn(columns, ['guild_id', 'guildid']) ?? 'guild_id';
  const statusCol = findColumn(columns, ['status']) ?? 'status';

  try {
    const result = await queryEqDb<RowDataPacket[]>(
      `UPDATE guild_donations SET ${statusCol} = ? WHERE ${guildIdCol} = ? AND ${statusCol} = ?`,
      [EQ_DONATION_STATUS_REJECTED, eqGuildId, EQ_DONATION_STATUS_PENDING]
    );
    // MySQL returns affectedRows in the result for UPDATE
    return (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Delete a donation from EQEmu database
 */
export async function deleteDonation(appGuildId: string, donationId: number): Promise<boolean> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return false;
  }

  const columns = await getGuildDonationsColumns();
  const guildIdCol = findColumn(columns, ['guild_id', 'guildid']) ?? 'guild_id';

  try {
    await queryEqDb(
      `DELETE FROM guild_donations WHERE id = ? AND ${guildIdCol} = ?`,
      [donationId, eqGuildId]
    );
    return true;
  } catch {
    return false;
  }
}
