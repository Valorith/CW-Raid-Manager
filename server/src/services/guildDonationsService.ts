import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

// EQEmu donation status values
const EQ_DONATION_STATUS_REJECTED = 0;
const EQ_DONATION_STATUS_PENDING = 1;

// Cache TTL for guild ID mapping (5 minutes)
const GUILD_ID_CACHE_TTL_MS = 5 * 60 * 1000;

export interface EqGuildDonation {
  id: number;
  guildId: number;
  itemId: number;
  itemName: string | null;
  itemIconId: number | null;
  itemType: number;
  quantity: number;
  donatorId: number;
  donatorName: string | null;
  status: 'PENDING' | 'REJECTED';
}

// Cache for table existence check
let tableExists: boolean | null = null;

// Cache for guild ID mapping (app guild ID -> EQ guild ID)
const guildIdCache = new Map<string, { eqGuildId: number | null; expiresAt: number }>();

/**
 * Check if the guild_donations table exists in EQEmu database
 */
async function checkGuildDonationsTableExists(): Promise<boolean> {
  if (tableExists !== null) return tableExists;

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guild_donations'`
    );
    tableExists = rows.length > 0;
    return tableExists;
  } catch {
    return false;
  }
}

/**
 * Map EQEmu status number to our status string
 * EQEmu uses: 0 = REJECTED, 1 = PENDING
 */
function mapEqStatusToStatus(eqStatus: unknown): 'PENDING' | 'REJECTED' {
  const numStatus = Number(eqStatus);
  if (numStatus === EQ_DONATION_STATUS_REJECTED) {
    return 'REJECTED';
  }
  return 'PENDING';
}

/**
 * Get the EQEmu guild ID by matching guild name from the app database.
 * Results are cached for 5 minutes to avoid repeated lookups during polling.
 */
async function getEqGuildIdByAppGuildId(appGuildId: string): Promise<number | null> {
  // Check cache first
  const cached = guildIdCache.get(appGuildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.eqGuildId;
  }

  // First get the guild name from the app database
  const appGuild = await prisma.guild.findUnique({
    where: { id: appGuildId },
    select: { name: true }
  });

  if (!appGuild) {
    // Cache the null result too to avoid repeated lookups for invalid guilds
    guildIdCache.set(appGuildId, { eqGuildId: null, expiresAt: Date.now() + GUILD_ID_CACHE_TTL_MS });
    return null;
  }

  // Then find the matching guild in EQEmu by name
  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT id FROM guilds WHERE name = ? LIMIT 1`,
      [appGuild.name]
    );
    const eqGuildId = rows.length > 0 ? Number(rows[0].id) : null;

    // Cache the result
    guildIdCache.set(appGuildId, { eqGuildId, expiresAt: Date.now() + GUILD_ID_CACHE_TTL_MS });

    return eqGuildId;
  } catch {
    return null;
  }
}

export interface PaginatedDonationsResult {
  donations: EqGuildDonation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Fetch donations for a guild from EQEmu database with pagination
 */
export async function fetchGuildDonations(
  appGuildId: string,
  page = 1,
  limit = 25
): Promise<PaginatedDonationsResult> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const exists = await checkGuildDonationsTableExists();
  if (!exists) {
    return { donations: [], total: 0, page, limit, totalPages: 0 };
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return { donations: [], total: 0, page, limit, totalPages: 0 };
  }

  // Calculate offset
  const offset = (page - 1) * limit;

  // First get the total count
  const countQuery = `SELECT COUNT(*) as total FROM guild_donations WHERE guildID = ?`;

  // Query donations with item details and donator name, with pagination
  // Table schema: donationID, status, guildID, itemID, itemType, quantity, donatorID
  // Use unique alias 'donation_status' to avoid any potential column conflicts
  const query = `
    SELECT
      d.donationID as id,
      d.guildID as guildId,
      d.itemID as itemId,
      d.itemType as itemType,
      d.quantity as quantity,
      d.donatorID as donatorId,
      d.status as donation_status,
      i.Name as itemName,
      i.icon as itemIconId,
      c.name as donatorName
    FROM guild_donations d
    LEFT JOIN items i ON d.itemID = i.id
    LEFT JOIN character_data c ON d.donatorID = c.id
    WHERE d.guildID = ?
    ORDER BY d.status ASC, d.donationID DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const [countRows, donationRows] = await Promise.all([
      queryEqDb<RowDataPacket[]>(countQuery, [eqGuildId]),
      queryEqDb<RowDataPacket[]>(query, [eqGuildId, limit, offset])
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    const donations = donationRows.map((row) => {
      // Try multiple possible column names for status due to MySQL driver variations
      const statusValue = row.donation_status ?? row.donationStatus ?? row.status;
      return {
        id: Number(row.id),
        guildId: Number(row.guildId),
        itemId: Number(row.itemId),
        itemName: row.itemName ? String(row.itemName) : null,
        itemIconId: row.itemIconId ? Number(row.itemIconId) : null,
        itemType: Number(row.itemType ?? 0),
        quantity: Number(row.quantity ?? 1),
        donatorId: Number(row.donatorId ?? 0),
        donatorName: row.donatorName ? String(row.donatorName) : null,
        status: mapEqStatusToStatus(statusValue)
      };
    });

    return { donations, total, page, limit, totalPages };
  } catch (error) {
    console.error('Failed to fetch guild donations from EQEmu:', error);
    return { donations: [], total: 0, page, limit, totalPages: 0 };
  }
}

export interface DonationCounts {
  pending: number;
  total: number;
}

/**
 * Get the count of donations for a guild (both pending and total)
 */
export async function getDonationCounts(appGuildId: string): Promise<DonationCounts> {
  if (!isEqDbConfigured()) {
    return { pending: 0, total: 0 };
  }

  const exists = await checkGuildDonationsTableExists();
  if (!exists) {
    return { pending: 0, total: 0 };
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return { pending: 0, total: 0 };
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as pending
       FROM guild_donations WHERE guildID = ?`,
      [EQ_DONATION_STATUS_PENDING, eqGuildId]
    );
    return {
      pending: Number(rows[0]?.pending ?? 0),
      total: Number(rows[0]?.total ?? 0)
    };
  } catch {
    return { pending: 0, total: 0 };
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

  try {
    await queryEqDb(
      `UPDATE guild_donations SET status = ? WHERE donationID = ? AND guildID = ?`,
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

  try {
    const result = await queryEqDb<RowDataPacket[]>(
      `UPDATE guild_donations SET status = ? WHERE guildID = ? AND status = ?`,
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

  try {
    await queryEqDb(
      `DELETE FROM guild_donations WHERE donationID = ? AND guildID = ?`,
      [donationId, eqGuildId]
    );
    return true;
  } catch {
    return false;
  }
}
