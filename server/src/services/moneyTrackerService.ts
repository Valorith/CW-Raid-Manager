import type { RowDataPacket } from 'mysql2/promise';

import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

// Currency conversion constants
const COPPER_PER_SILVER = 10;
const COPPER_PER_GOLD = 100;
const COPPER_PER_PLATINUM = 1000;

export interface CharacterCurrencyRow extends RowDataPacket {
  id: number;
  name: string;
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  platinum_bank: number;
  gold_bank: number;
  silver_bank: number;
  copper_bank: number;
  platinum_cursor: number;
  gold_cursor: number;
  silver_cursor: number;
  copper_cursor: number;
}

export interface ServerCurrencyTotals {
  platinum: bigint;
  gold: bigint;
  silver: bigint;
  copper: bigint;
  platinumBank: bigint;
  goldBank: bigint;
  silverBank: bigint;
  copperBank: bigint;
  platinumCursor: bigint;
  goldCursor: bigint;
  silverCursor: bigint;
  copperCursor: bigint;
  totalPlatinumEquivalent: bigint;
  characterCount: number;
}

export interface TopCharacterCurrency {
  id: number;
  name: string;
  totalPlatinumEquivalent: number;
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  platinumBank: number;
  goldBank: number;
  silverBank: number;
  copperBank: number;
  platinumCursor: number;
  goldCursor: number;
  silverCursor: number;
  copperCursor: number;
}

export interface SharedBankAccount {
  id: number;
  name: string;
  charname: string;
  sharedplat: number;
}

export interface SharedBankTotals {
  totalSharedPlatinum: bigint;
  accountCount: number;
}

export interface MoneySnapshotData {
  id: string;
  snapshotDate: Date;
  totalPlatinum: bigint;
  totalGold: bigint;
  totalSilver: bigint;
  totalCopper: bigint;
  totalPlatinumBank: bigint;
  totalGoldBank: bigint;
  totalSilverBank: bigint;
  totalCopperBank: bigint;
  totalPlatinumCursor: bigint;
  totalGoldCursor: bigint;
  totalSilverCursor: bigint;
  totalCopperCursor: bigint;
  totalPlatinumEquivalent: bigint;
  topCharacters: TopCharacterCurrency[];
  characterCount: number;
  createdAt: Date;
}

/**
 * Calculate total platinum equivalent from all currency types
 * Returns value in copper to avoid floating point issues
 */
function calculatePlatinumEquivalentInCopper(
  platinum: number,
  gold: number,
  silver: number,
  copper: number
): number {
  return (
    platinum * COPPER_PER_PLATINUM +
    gold * COPPER_PER_GOLD +
    silver * COPPER_PER_SILVER +
    copper
  );
}

/**
 * Fetch current server currency totals from EQEmu database
 * Uses a single efficient query with SUM aggregation
 */
export async function fetchServerCurrencyTotals(): Promise<ServerCurrencyTotals> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  // Single aggregation query for server totals
  const totalsQuery = `
    SELECT
      COALESCE(SUM(platinum), 0) as total_platinum,
      COALESCE(SUM(gold), 0) as total_gold,
      COALESCE(SUM(silver), 0) as total_silver,
      COALESCE(SUM(copper), 0) as total_copper,
      COALESCE(SUM(platinum_bank), 0) as total_platinum_bank,
      COALESCE(SUM(gold_bank), 0) as total_gold_bank,
      COALESCE(SUM(silver_bank), 0) as total_silver_bank,
      COALESCE(SUM(copper_bank), 0) as total_copper_bank,
      COALESCE(SUM(platinum_cursor), 0) as total_platinum_cursor,
      COALESCE(SUM(gold_cursor), 0) as total_gold_cursor,
      COALESCE(SUM(silver_cursor), 0) as total_silver_cursor,
      COALESCE(SUM(copper_cursor), 0) as total_copper_cursor,
      COUNT(*) as character_count
    FROM character_currency
  `;

  const [totals] = await queryEqDb<RowDataPacket[]>(totalsQuery);
  const row = totals as RowDataPacket;

  const platinum = BigInt(row.total_platinum || 0);
  const gold = BigInt(row.total_gold || 0);
  const silver = BigInt(row.total_silver || 0);
  const copper = BigInt(row.total_copper || 0);
  const platinumBank = BigInt(row.total_platinum_bank || 0);
  const goldBank = BigInt(row.total_gold_bank || 0);
  const silverBank = BigInt(row.total_silver_bank || 0);
  const copperBank = BigInt(row.total_copper_bank || 0);
  const platinumCursor = BigInt(row.total_platinum_cursor || 0);
  const goldCursor = BigInt(row.total_gold_cursor || 0);
  const silverCursor = BigInt(row.total_silver_cursor || 0);
  const copperCursor = BigInt(row.total_copper_cursor || 0);

  // Calculate total platinum equivalent (in copper units for precision)
  const totalPlatinumEquivalent =
    (platinum + platinumBank + platinumCursor) * BigInt(COPPER_PER_PLATINUM) +
    (gold + goldBank + goldCursor) * BigInt(COPPER_PER_GOLD) +
    (silver + silverBank + silverCursor) * BigInt(COPPER_PER_SILVER) +
    (copper + copperBank + copperCursor);

  return {
    platinum,
    gold,
    silver,
    copper,
    platinumBank,
    goldBank,
    silverBank,
    copperBank,
    platinumCursor,
    goldCursor,
    silverCursor,
    copperCursor,
    totalPlatinumEquivalent,
    characterCount: Number(row.character_count || 0)
  };
}

/**
 * Fetch top N characters by total currency wealth
 * Uses a calculated field for sorting efficiency
 */
export async function fetchTopCharactersByCurrency(limit: number = 20): Promise<TopCharacterCurrency[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  // Query that calculates total wealth in copper and sorts by it
  const topCharactersQuery = `
    SELECT
      cd.id,
      cd.name,
      cc.platinum,
      cc.gold,
      cc.silver,
      cc.copper,
      cc.platinum_bank,
      cc.gold_bank,
      cc.silver_bank,
      cc.copper_bank,
      cc.platinum_cursor,
      cc.gold_cursor,
      cc.silver_cursor,
      cc.copper_cursor,
      (
        (COALESCE(cc.platinum, 0) + COALESCE(cc.platinum_bank, 0) + COALESCE(cc.platinum_cursor, 0)) * ${COPPER_PER_PLATINUM} +
        (COALESCE(cc.gold, 0) + COALESCE(cc.gold_bank, 0) + COALESCE(cc.gold_cursor, 0)) * ${COPPER_PER_GOLD} +
        (COALESCE(cc.silver, 0) + COALESCE(cc.silver_bank, 0) + COALESCE(cc.silver_cursor, 0)) * ${COPPER_PER_SILVER} +
        (COALESCE(cc.copper, 0) + COALESCE(cc.copper_bank, 0) + COALESCE(cc.copper_cursor, 0))
      ) as total_copper_value
    FROM character_currency cc
    INNER JOIN character_data cd ON cd.id = cc.id
    ORDER BY total_copper_value DESC
    LIMIT ?
  `;

  const rows = await queryEqDb<CharacterCurrencyRow[]>(topCharactersQuery, [limit]);

  return rows.map((row) => {
    const totalCopper = calculatePlatinumEquivalentInCopper(
      (row.platinum || 0) + (row.platinum_bank || 0) + (row.platinum_cursor || 0),
      (row.gold || 0) + (row.gold_bank || 0) + (row.gold_cursor || 0),
      (row.silver || 0) + (row.silver_bank || 0) + (row.silver_cursor || 0),
      (row.copper || 0) + (row.copper_bank || 0) + (row.copper_cursor || 0)
    );

    // Convert copper to platinum equivalent (as a number with decimal precision)
    const totalPlatinumEquivalent = totalCopper / COPPER_PER_PLATINUM;

    return {
      id: row.id,
      name: row.name,
      totalPlatinumEquivalent,
      platinum: row.platinum || 0,
      gold: row.gold || 0,
      silver: row.silver || 0,
      copper: row.copper || 0,
      platinumBank: row.platinum_bank || 0,
      goldBank: row.gold_bank || 0,
      silverBank: row.silver_bank || 0,
      copperBank: row.copper_bank || 0,
      platinumCursor: row.platinum_cursor || 0,
      goldCursor: row.gold_cursor || 0,
      silverCursor: row.silver_cursor || 0,
      copperCursor: row.copper_cursor || 0
    };
  });
}

/**
 * Fetch total shared bank platinum from all accounts
 */
export async function fetchSharedBankTotals(): Promise<SharedBankTotals> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  const totalsQuery = `
    SELECT
      COALESCE(SUM(sharedplat), 0) as total_shared_plat,
      COUNT(*) as account_count
    FROM account
    WHERE sharedplat > 0
  `;

  const [totals] = await queryEqDb<RowDataPacket[]>(totalsQuery);
  const row = totals as RowDataPacket;

  return {
    totalSharedPlatinum: BigInt(row.total_shared_plat || 0),
    accountCount: Number(row.account_count || 0)
  };
}

/**
 * Fetch top N accounts by shared bank platinum
 */
export async function fetchTopSharedBanks(limit: number = 20): Promise<SharedBankAccount[]> {
  if (!isEqDbConfigured()) {
    throw new Error('EQ database is not configured. Set EQ_DB_* environment variables.');
  }

  const topSharedBanksQuery = `
    SELECT
      id,
      name,
      charname,
      sharedplat
    FROM account
    WHERE sharedplat > 0
    ORDER BY sharedplat DESC
    LIMIT ?
  `;

  const rows = await queryEqDb<RowDataPacket[]>(topSharedBanksQuery, [limit]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name || '',
    charname: row.charname || '',
    sharedplat: Number(row.sharedplat || 0)
  }));
}

/**
 * Create a new money snapshot
 * This captures the current state of all server currency
 */
export async function createMoneySnapshot(createdById?: string): Promise<MoneySnapshotData> {
  // Get today's date (UTC) for the snapshot
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Check if a snapshot already exists for today
  const existing = await prisma.moneySnapshot.findUnique({
    where: { snapshotDate: today }
  });

  if (existing) {
    throw new Error(`A snapshot already exists for ${today.toISOString().split('T')[0]}. Only one snapshot per day is allowed.`);
  }

  // Fetch current data from EQEmu
  const [totals, topCharacters] = await Promise.all([
    fetchServerCurrencyTotals(),
    fetchTopCharactersByCurrency(20)
  ]);

  // Create the snapshot
  const snapshot = await prisma.moneySnapshot.create({
    data: {
      snapshotDate: today,
      totalPlatinum: totals.platinum,
      totalGold: totals.gold,
      totalSilver: totals.silver,
      totalCopper: totals.copper,
      totalPlatinumBank: totals.platinumBank,
      totalGoldBank: totals.goldBank,
      totalSilverBank: totals.silverBank,
      totalCopperBank: totals.copperBank,
      totalPlatinumCursor: totals.platinumCursor,
      totalGoldCursor: totals.goldCursor,
      totalSilverCursor: totals.silverCursor,
      totalCopperCursor: totals.copperCursor,
      totalPlatinumEquivalent: totals.totalPlatinumEquivalent,
      topCharacters: JSON.parse(JSON.stringify(topCharacters)),
      characterCount: totals.characterCount,
      createdById
    }
  });

  return {
    ...snapshot,
    topCharacters: snapshot.topCharacters as unknown as TopCharacterCurrency[]
  };
}

/**
 * Get all snapshots within a date range
 */
export async function getSnapshotsInRange(
  startDate?: Date,
  endDate?: Date,
  limit: number = 365
): Promise<MoneySnapshotData[]> {
  const where: { snapshotDate?: { gte?: Date; lte?: Date } } = {};

  if (startDate || endDate) {
    where.snapshotDate = {};
    if (startDate) {
      where.snapshotDate.gte = startDate;
    }
    if (endDate) {
      where.snapshotDate.lte = endDate;
    }
  }

  const snapshots = await prisma.moneySnapshot.findMany({
    where,
    orderBy: { snapshotDate: 'asc' },
    take: limit
  });

  return snapshots.map((snapshot) => ({
    ...snapshot,
    topCharacters: snapshot.topCharacters as unknown as TopCharacterCurrency[]
  }));
}

/**
 * Get the most recent snapshot
 */
export async function getLatestSnapshot(): Promise<MoneySnapshotData | null> {
  const snapshot = await prisma.moneySnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' }
  });

  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    topCharacters: snapshot.topCharacters as unknown as TopCharacterCurrency[]
  };
}

/**
 * Get snapshot for a specific date
 */
export async function getSnapshotByDate(date: Date): Promise<MoneySnapshotData | null> {
  const normalizedDate = new Date(date);
  normalizedDate.setUTCHours(0, 0, 0, 0);

  const snapshot = await prisma.moneySnapshot.findUnique({
    where: { snapshotDate: normalizedDate }
  });

  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    topCharacters: snapshot.topCharacters as unknown as TopCharacterCurrency[]
  };
}

/**
 * Delete a snapshot by ID (admin only)
 */
export async function deleteSnapshot(id: string): Promise<void> {
  await prisma.moneySnapshot.delete({
    where: { id }
  });
}

/**
 * Get summary statistics for the money tracker
 */
export async function getMoneyTrackerSummary(): Promise<{
  totalSnapshots: number;
  latestSnapshot: MoneySnapshotData | null;
  oldestSnapshotDate: Date | null;
  newestSnapshotDate: Date | null;
}> {
  const [count, oldest, newest, latest] = await Promise.all([
    prisma.moneySnapshot.count(),
    prisma.moneySnapshot.findFirst({
      orderBy: { snapshotDate: 'asc' },
      select: { snapshotDate: true }
    }),
    prisma.moneySnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true }
    }),
    getLatestSnapshot()
  ]);

  return {
    totalSnapshots: count,
    latestSnapshot: latest,
    oldestSnapshotDate: oldest?.snapshotDate || null,
    newestSnapshotDate: newest?.snapshotDate || null
  };
}

// ============================================================================
// Settings Management
// ============================================================================

export interface MoneyTrackerSettingsData {
  autoSnapshotEnabled: boolean;
  snapshotHour: number;
  snapshotMinute: number;
  lastSnapshotAt: Date | null;
  updatedAt: Date;
}

const SETTINGS_ID = 'singleton';

/**
 * Get the current auto-snapshot settings
 */
export async function getSettings(): Promise<MoneyTrackerSettingsData> {
  let settings = await prisma.moneyTrackerSettings.findUnique({
    where: { id: SETTINGS_ID }
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await prisma.moneyTrackerSettings.create({
      data: {
        id: SETTINGS_ID,
        autoSnapshotEnabled: false,
        snapshotHour: 3,
        snapshotMinute: 0
      }
    });
  }

  return {
    autoSnapshotEnabled: settings.autoSnapshotEnabled,
    snapshotHour: settings.snapshotHour,
    snapshotMinute: settings.snapshotMinute,
    lastSnapshotAt: settings.lastSnapshotAt,
    updatedAt: settings.updatedAt
  };
}

/**
 * Update auto-snapshot settings
 */
export async function updateSettings(
  data: {
    autoSnapshotEnabled?: boolean;
    snapshotHour?: number;
    snapshotMinute?: number;
  },
  updatedById?: string
): Promise<MoneyTrackerSettingsData> {
  // Validate hour and minute
  if (data.snapshotHour !== undefined && (data.snapshotHour < 0 || data.snapshotHour > 23)) {
    throw new Error('Snapshot hour must be between 0 and 23');
  }
  if (data.snapshotMinute !== undefined && (data.snapshotMinute < 0 || data.snapshotMinute > 59)) {
    throw new Error('Snapshot minute must be between 0 and 59');
  }

  const settings = await prisma.moneyTrackerSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      ...data,
      updatedById
    },
    create: {
      id: SETTINGS_ID,
      autoSnapshotEnabled: data.autoSnapshotEnabled ?? false,
      snapshotHour: data.snapshotHour ?? 3,
      snapshotMinute: data.snapshotMinute ?? 0,
      updatedById
    }
  });

  return {
    autoSnapshotEnabled: settings.autoSnapshotEnabled,
    snapshotHour: settings.snapshotHour,
    snapshotMinute: settings.snapshotMinute,
    lastSnapshotAt: settings.lastSnapshotAt,
    updatedAt: settings.updatedAt
  };
}

/**
 * Update the last snapshot timestamp (called by scheduler after successful snapshot)
 */
export async function updateLastSnapshotTime(): Promise<void> {
  await prisma.moneyTrackerSettings.update({
    where: { id: SETTINGS_ID },
    data: { lastSnapshotAt: new Date() }
  });
}
