import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

// EQEmu donation status values
const EQ_DONATION_STATUS_PENDING = 1;
const EQ_DONATION_STATUS_REJECTED = 2;

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
 */
function mapEqStatusToStatus(eqStatus: number): 'PENDING' | 'REJECTED' {
  return eqStatus === EQ_DONATION_STATUS_REJECTED ? 'REJECTED' : 'PENDING';
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

/**
 * Fetch pending donations for a guild from EQEmu database
 */
export async function fetchPendingDonations(appGuildId: string): Promise<EqGuildDonation[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ content database is not configured.');
  }

  const exists = await checkGuildDonationsTableExists();
  if (!exists) {
    return [];
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return [];
  }

  // Query donations with item details and donator name
  // Table schema: donationID, status, guildID, itemID, itemType, quantity, donatorID
  const query = `
    SELECT
      d.donationID as id,
      d.guildID as guildId,
      d.itemID as itemId,
      d.itemType as itemType,
      d.quantity as quantity,
      d.donatorID as donatorId,
      d.status as status,
      i.Name as itemName,
      i.icon as itemIconId,
      c.name as donatorName
    FROM guild_donations d
    LEFT JOIN items i ON d.itemID = i.id
    LEFT JOIN character_data c ON d.donatorID = c.id
    WHERE d.guildID = ? AND d.status = ?
    ORDER BY d.donationID DESC
    LIMIT 500
  `;

  try {
    const rows = await queryEqDb<RowDataPacket[]>(query, [eqGuildId, EQ_DONATION_STATUS_PENDING]);

    return rows.map((row) => ({
      id: Number(row.id),
      guildId: Number(row.guildId),
      itemId: Number(row.itemId),
      itemName: row.itemName ? String(row.itemName) : null,
      itemIconId: row.itemIconId ? Number(row.itemIconId) : null,
      itemType: Number(row.itemType ?? 0),
      quantity: Number(row.quantity ?? 1),
      donatorId: Number(row.donatorId ?? 0),
      donatorName: row.donatorName ? String(row.donatorName) : null,
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

  const exists = await checkGuildDonationsTableExists();
  if (!exists) {
    return 0;
  }

  const eqGuildId = await getEqGuildIdByAppGuildId(appGuildId);
  if (eqGuildId === null) {
    return 0;
  }

  try {
    const rows = await queryEqDb<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM guild_donations WHERE guildID = ? AND status = ?`,
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
