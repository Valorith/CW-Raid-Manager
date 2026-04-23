import { createHash } from 'crypto';

import { Prisma } from '@prisma/client';
import type { RowDataPacket } from 'mysql2/promise';

import { processMarketListingNotifications } from './marketNotificationService.js';
import { EQEMU_ITEM_SLOT_IDS, EQEMU_ITEM_TYPE_VALUES } from '../data/eqItemFilters.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

type SortOrder = 'asc' | 'desc';
type MarketLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

type MarketListingsSummaryRow = RowDataPacket & {
  totalListings: number | bigint | string | null;
  distinctSellers: number | bigint | string | null;
  distinctItems: number | bigint | string | null;
  newestListingAt: Date | string | null;
};

type MarketListingRow = RowDataPacket & {
  id: string;
  sellerCharacterId: number | bigint | string | null;
  sellerCharacterName: string | null;
  itemId: number | bigint | string | null;
  itemName: string | null;
  itemIconId: number | bigint | string | null;
  itemAveragePrice: number | bigint | string | null;
  itemType: number | bigint | string | null;
  itemSlots: number | bigint | string | null;
  price: number | bigint | string | null;
  charges: number | bigint | string | null;
  slotId: number | bigint | string | null;
  listedAt: Date | string | null;
};

type MarketListingsSyncState = {
  lastRetrievedAt: string | null;
};

type MarketListingCacheRecord = {
  id: string;
  sellerCharacterId: number;
  sellerCharacterName: string;
  itemId: number;
  itemName: string;
  itemIconId: number | null;
  itemType: number | null;
  itemSlots: number | null;
  price: number;
  charges: number | null;
  slotId: number;
  listedAt: Date | null;
  syncedAt: Date;
};

export type MarketListingsSortField =
  | 'listedAt'
  | 'price'
  | 'priceRank'
  | 'analysis'
  | 'charges'
  | 'itemName'
  | 'sellerName'
  | 'slotId';

export interface MarketListingsFilters {
  q?: string;
  itemId?: number;
  itemName?: string;
  sellerName?: string;
  itemType?: number;
  equipSlots?: number[];
  minPrice?: number;
  maxPrice?: number;
  minCharges?: number;
  maxCharges?: number;
  excludeAugs?: boolean;
  listedWithinDays?: number;
  dealsOnly?: boolean;
  bestPricesOnly?: boolean;
}

export interface MarketListing {
  sellerCharacterId: number;
  sellerCharacterName: string;
  itemId: number;
  itemName: string;
  itemIconId: number | null;
  itemSlots: number | null;
  itemAveragePrice?: number | null;
  price: number;
  priceRank: number;
  charges: number | null;
  slotId: number;
  listedAt: string | null;
}

export interface MarketListingsSummary {
  totalListings: number;
  distinctSellers: number;
  distinctItems: number;
  newestListingAt: string | null;
}

export interface MarketListingsSyncStatus {
  lastRetrievedAt: string | null;
}

export interface MarketListingsPage {
  listings: MarketListing[];
  summary: MarketListingsSummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sourceAvailable: boolean;
  message: string | null;
  syncStatus: MarketListingsSyncStatus;
}

export interface MarketListingsSyncSummary {
  retrieved: number;
  lastRetrievedAt: string | null;
}

const MARKET_LISTINGS_SYNC_STATE_KEY = 'marketListingsSyncState';
const MARKET_LISTINGS_STALE_MS = 15 * 60 * 1000;
const MARKET_LISTINGS_CACHE_UNAVAILABLE_MESSAGE =
  'Bazaar listings cache is unavailable. Apply the market listings migration first.';
const CREATE_MANY_CHUNK_SIZE = 500;
const VALID_ITEM_TYPE_VALUES = new Set<number>(EQEMU_ITEM_TYPE_VALUES);
const VALID_EQUIP_SLOT_IDS = new Set<number>(EQEMU_ITEM_SLOT_IDS);
const SELLER_EVENT_TYPE = 'TRADER_SELL';

let marketListingsSyncPromise: Promise<MarketListingsSyncSummary> | null = null;
let marketListingsCacheMissingWarned = false;

function toNumber(value: number | bigint | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  return 0;
}

function toNullableNumber(value: number | bigint | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  return toNumber(value);
}

function toNullableDecimal(
  value:
    | number
    | bigint
    | string
    | { toNumber?: () => number }
    | null
    | undefined
): number | null {
  if (value == null) {
    return null;
  }

  if (Prisma.Decimal.isDecimal(value)) {
    return value.toNumber();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSearchQuery(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildPriceRankSameSellerCondition(candidateAlias: string, currentAlias: string): string {
  return `
    (
      ${candidateAlias}.sellerCharacterId IS NOT NULL
      AND ${currentAlias}.sellerCharacterId IS NOT NULL
      AND ${candidateAlias}.sellerCharacterId = ${currentAlias}.sellerCharacterId
    )
    OR (
      ${candidateAlias}.sellerCharacterId IS NULL
      AND ${currentAlias}.sellerCharacterId IS NULL
      AND LOWER(TRIM(COALESCE(${candidateAlias}.sellerCharacterName, ''))) =
        LOWER(TRIM(COALESCE(${currentAlias}.sellerCharacterName, '')))
    )
  `;
}

function buildPriceRankGroupKey(alias: string): string {
  return `
    CONCAT(
      CAST(${alias}.price AS CHAR),
      ':',
      CASE
        WHEN ${alias}.sellerCharacterId IS NOT NULL THEN
          CONCAT('id:', CAST(${alias}.sellerCharacterId AS CHAR))
        ELSE CONCAT('name:', LOWER(TRIM(COALESCE(${alias}.sellerCharacterName, ''))))
      END
    )
  `;
}

function buildPriceRankEarlierListingCondition(
  candidateAlias: string,
  currentAlias: string
): string {
  return `
    ${candidateAlias}.price < ${currentAlias}.price
    OR (
      ${candidateAlias}.price = ${currentAlias}.price
      AND NOT (${buildPriceRankSameSellerCondition(candidateAlias, currentAlias)})
      AND COALESCE(${candidateAlias}.listedAt, TIMESTAMP('9999-12-31 23:59:59')) <
        COALESCE(${currentAlias}.listedAt, TIMESTAMP('9999-12-31 23:59:59'))
    )
    OR (
      ${candidateAlias}.price = ${currentAlias}.price
      AND NOT (${buildPriceRankSameSellerCondition(candidateAlias, currentAlias)})
      AND COALESCE(${candidateAlias}.listedAt, TIMESTAMP('9999-12-31 23:59:59')) =
        COALESCE(${currentAlias}.listedAt, TIMESTAMP('9999-12-31 23:59:59'))
      AND ${candidateAlias}.id < ${currentAlias}.id
    )
  `;
}

function buildPriceRankExpression(currentAlias: string): string {
  return `
    (
      SELECT COUNT(DISTINCT ${buildPriceRankGroupKey('mlRank')})
      FROM MarketListing mlRank
      WHERE mlRank.itemId = ${currentAlias}.itemId
        AND (
          ${buildPriceRankEarlierListingCondition('mlRank', currentAlias)}
          OR (
            mlRank.price = ${currentAlias}.price
            AND (${buildPriceRankSameSellerCondition('mlRank', currentAlias)})
          )
        )
    )
  `;
}

function buildRangeStart(days: number): Date {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

function buildEmptyMarketListingsPage(
  page: number,
  pageSize: number,
  syncStatus: MarketListingsSyncStatus,
  message: string,
  sourceAvailable = false
): MarketListingsPage {
  return {
    listings: [],
    summary: {
      totalListings: 0,
      distinctSellers: 0,
      distinctItems: 0,
      newestListingAt: null
    },
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    sourceAvailable,
    message,
    syncStatus
  };
}

function isMissingMarketListingsSource(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const mysqlError = error as { code?: string; errno?: number };
  return (
    mysqlError.code === 'ER_NO_SUCH_TABLE' ||
    mysqlError.code === 'ER_BAD_FIELD_ERROR' ||
    mysqlError.errno === 1146 ||
    mysqlError.errno === 1054
  );
}

function isMarketListingCacheSchemaMissing(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (
    error.code === 'P2021' &&
    (error.meta?.modelName === 'MarketListing' || error.meta?.table === 'MarketListing')
  ) {
    return true;
  }

  if (error.code !== 'P2010' || typeof error.meta?.message !== 'string') {
    return false;
  }

  const message = error.meta.message;
  return (
    error.meta?.code === '1146' ||
    message.includes('MarketListing') ||
    message.includes("Unknown column 'itemType'") ||
    message.includes("Unknown column 'itemSlots'")
  );
}

function isMarketSaleEventTableMissing(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (
    error.code === 'P2021' &&
    (error.meta?.modelName === 'MarketSaleEvent' || error.meta?.table === 'MarketSaleEvent')
  ) {
    return true;
  }

  return (
    error.code === 'P2010' &&
    error.meta?.code === '1146' &&
    typeof error.meta?.message === 'string' &&
    error.meta.message.includes('MarketSaleEvent')
  );
}

function logMissingMarketListingsCache(logger?: MarketLogger): void {
  if (marketListingsCacheMissingWarned) {
    return;
  }

  marketListingsCacheMissingWarned = true;
  logger?.warn?.(
    '[MarketListings] MarketListing cache schema is missing expected columns. Apply the market listings migrations.'
  );
}

function buildWhereClause(filters: MarketListingsFilters): {
  clause: string;
  params: Array<string | number | Date>;
} {
  const conditions: string[] = [];
  const params: Array<string | number | Date> = [];
  const searchQuery = normalizeSearchQuery(filters.q);
  const itemName = normalizeSearchQuery(filters.itemName);
  const sellerName = normalizeSearchQuery(filters.sellerName);

  if (filters.itemId != null) {
    conditions.push('ml.itemId = ?');
    params.push(filters.itemId);
  }

  if (searchQuery) {
    const likeQuery = `%${searchQuery}%`;
    conditions.push(
      "(LOWER(COALESCE(ml.itemName, '')) LIKE ? OR LOWER(COALESCE(ml.sellerCharacterName, '')) LIKE ?)"
    );
    params.push(likeQuery, likeQuery);
  }

  if (itemName) {
    conditions.push("LOWER(COALESCE(ml.itemName, '')) LIKE ?");
    params.push(`%${itemName}%`);
  }

  if (sellerName) {
    conditions.push("LOWER(COALESCE(ml.sellerCharacterName, '')) LIKE ?");
    params.push(`%${sellerName}%`);
  }

  if (filters.itemType != null && VALID_ITEM_TYPE_VALUES.has(filters.itemType)) {
    conditions.push('ml.itemType = ?');
    params.push(filters.itemType);
  }

  if (filters.equipSlots != null && filters.equipSlots.length > 0) {
    const combinedMask = filters.equipSlots
      .filter((id) => VALID_EQUIP_SLOT_IDS.has(id))
      .reduce((mask, id) => mask | (2 ** id), 0);
    if (combinedMask > 0) {
      conditions.push('(COALESCE(ml.itemSlots, 0) & ?) <> 0');
      params.push(combinedMask);
    }
  }

  if (filters.excludeAugs) {
    conditions.push('ml.itemType != 54');
  }

  if (filters.minPrice != null) {
    conditions.push('ml.price >= ?');
    params.push(filters.minPrice);
  }

  if (filters.maxPrice != null) {
    conditions.push('ml.price <= ?');
    params.push(filters.maxPrice);
  }

  if (filters.minCharges != null) {
    conditions.push('COALESCE(ml.charges, 0) >= ?');
    params.push(filters.minCharges);
  }

  if (filters.maxCharges != null) {
    conditions.push('COALESCE(ml.charges, 0) <= ?');
    params.push(filters.maxCharges);
  }

  if (filters.listedWithinDays != null) {
    conditions.push('ml.listedAt >= ?');
    params.push(buildRangeStart(filters.listedWithinDays));
  }

  if (filters.dealsOnly) {
    conditions.push('saleAvg.averagePrice IS NOT NULL');
    conditions.push('ml.price < saleAvg.averagePrice');
  }

  if (filters.bestPricesOnly) {
    conditions.push(`
      NOT EXISTS (
        SELECT 1
        FROM MarketListing mlBest
        WHERE mlBest.itemId = ml.itemId
          AND (${buildPriceRankEarlierListingCondition('mlBest', 'ml')})
      )
    `);
  }

  if (conditions.length === 0) {
    return { clause: '', params: [] };
  }

  return {
    clause: `WHERE ${conditions.join(' AND ')}`,
    params
  };
}

function buildOrderByClause(
  sortBy: MarketListingsSortField,
  sortOrder: SortOrder,
  includeAveragePrice: boolean
): string {
  const priceRankExpression = buildPriceRankExpression('ml');

  switch (sortBy) {
    case 'price':
      return `ml.price ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'priceRank':
      return `${priceRankExpression} ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'analysis':
      if (!includeAveragePrice) {
        return `ml.listedAt DESC, ml.id DESC`;
      }

      return `
        CASE
          WHEN saleAvg.averagePrice IS NULL OR saleAvg.averagePrice <= 0 THEN 1
          ELSE 0
        END ASC,
        CASE
          WHEN saleAvg.averagePrice IS NULL OR saleAvg.averagePrice <= 0 THEN NULL
          ELSE (ml.price - saleAvg.averagePrice) / saleAvg.averagePrice
        END ${sortOrder},
        ml.listedAt DESC,
        ml.id DESC
      `;
    case 'charges':
      return `COALESCE(ml.charges, -1) ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'itemName':
      return `ml.itemName ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'sellerName':
      return `ml.sellerCharacterName ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'slotId':
      return `ml.slotId ${sortOrder}, ml.listedAt DESC, ml.id DESC`;
    case 'listedAt':
    default:
      return `ml.listedAt ${sortOrder}, ml.id ${sortOrder}`;
  }
}

function mapMarketListingRow(
  row: MarketListingRow,
  priceRankByListingId: ReadonlyMap<string, number>
): MarketListing {
  const sellerCharacterId = toNumber(row.sellerCharacterId);
  const itemId = toNumber(row.itemId);

  return {
    sellerCharacterId,
    sellerCharacterName: row.sellerCharacterName?.trim() || `Trader ${sellerCharacterId}`,
    itemId,
    itemName: row.itemName?.trim() || `Item ${itemId}`,
    itemIconId: toNullableNumber(row.itemIconId),
    itemSlots: toNullableNumber(row.itemSlots),
    itemAveragePrice: toNullableDecimal(row.itemAveragePrice),
    price: toNumber(row.price),
    priceRank: priceRankByListingId.get(row.id) ?? 1,
    charges: toNullableNumber(row.charges),
    slotId: toNumber(row.slotId),
    listedAt: row.listedAt ? new Date(row.listedAt).toISOString() : null
  };
}

async function buildPriceRankByListingId(itemIds: number[]): Promise<Map<string, number>> {
  const uniqueItemIds = Array.from(new Set(itemIds.filter((itemId) => itemId > 0)));
  const priceRankByListingId = new Map<string, number>();

  if (uniqueItemIds.length === 0) {
    return priceRankByListingId;
  }

  const listings = await prisma.marketListing.findMany({
    where: {
      itemId: {
        in: uniqueItemIds
      }
    },
    select: {
      id: true,
      itemId: true,
      sellerCharacterId: true,
      sellerCharacterName: true,
      price: true,
      listedAt: true
    }
  });

  const listingsByItemId = new Map<number, typeof listings>();
  for (const listing of listings) {
    const existing = listingsByItemId.get(listing.itemId);
    if (existing) {
      existing.push(listing);
      continue;
    }

    listingsByItemId.set(listing.itemId, [listing]);
  }

  for (const itemListings of listingsByItemId.values()) {
    itemListings.sort((left, right) => {
      if (left.price !== right.price) {
        return left.price - right.price;
      }

      const leftListedAt = left.listedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightListedAt = right.listedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftListedAt !== rightListedAt) {
        return leftListedAt - rightListedAt;
      }

      return left.id.localeCompare(right.id);
    });

    const rankByGroupKey = new Map<string, number>();
    let nextRank = 1;

    for (const listing of itemListings) {
      const sellerKey =
        listing.sellerCharacterId != null
          ? `id:${listing.sellerCharacterId}`
          : `name:${normalizeSearchQuery(listing.sellerCharacterName)}`;
      const groupKey = `${listing.price}:${sellerKey}`;
      const existingRank = rankByGroupKey.get(groupKey);

      if (existingRank != null) {
        priceRankByListingId.set(listing.id, existingRank);
        continue;
      }

      rankByGroupKey.set(groupKey, nextRank);
      priceRankByListingId.set(listing.id, nextRank);
      nextRank += 1;
    }
  }

  return priceRankByListingId;
}

function buildAveragePriceJoinClause(includeAveragePrice: boolean): string {
  if (!includeAveragePrice) {
    return '';
  }

  return `
    LEFT JOIN (
      SELECT
        mse.itemId as itemId,
        AVG(mse.price) as averagePrice
      FROM MarketSaleEvent mse
      WHERE mse.eventType = ?
      GROUP BY mse.itemId
    ) saleAvg ON saleAvg.itemId = ml.itemId
  `;
}

async function getMarketListingsSyncState(): Promise<MarketListingsSyncState> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: MARKET_LISTINGS_SYNC_STATE_KEY }
  });

  if (!row) {
    return { lastRetrievedAt: null };
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<MarketListingsSyncState>;
    return {
      lastRetrievedAt: parsed.lastRetrievedAt ?? null
    };
  } catch {
    return { lastRetrievedAt: null };
  }
}

async function setMarketListingsSyncState(
  state: MarketListingsSyncState,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await db.systemSetting.upsert({
    where: { key: MARKET_LISTINGS_SYNC_STATE_KEY },
    create: {
      key: MARKET_LISTINGS_SYNC_STATE_KEY,
      value: JSON.stringify(state)
    },
    update: {
      value: JSON.stringify(state)
    }
  });
}

async function fetchEqMarketListings(): Promise<MarketListingRow[]> {
  return queryEqDb<MarketListingRow[]>(
    `
      SELECT
        t.char_id as sellerCharacterId,
        COALESCE(NULLIF(TRIM(cd.name), ''), CONCAT('Trader ', t.char_id)) as sellerCharacterName,
        t.item_id as itemId,
        COALESCE(NULLIF(TRIM(i.Name), ''), CONCAT('Item ', t.item_id)) as itemName,
        i.icon as itemIconId,
        i.itemtype as itemType,
        i.slots as itemSlots,
        t.item_cost as price,
        t.item_charges as charges,
        t.slot_id as slotId,
        t.listing_date as listedAt
      FROM trader t
      LEFT JOIN character_data cd ON cd.id = t.char_id
      LEFT JOIN items i ON i.id = t.item_id
    `
  );
}

function buildCacheRecords(rows: MarketListingRow[], syncedAt: Date): MarketListingCacheRecord[] {
  return rows.map((row) => {
    const sellerCharacterId = toNumber(row.sellerCharacterId);
    const itemId = toNumber(row.itemId);
    const sellerCharacterName = row.sellerCharacterName?.trim() || `Trader ${sellerCharacterId}`;
    const charges = toNullableNumber(row.charges);
    const slotId = toNumber(row.slotId);

    return {
      id: buildStableMarketListingId({
        sellerCharacterId,
        sellerCharacterName,
        itemId,
        slotId,
        charges
      }),
      sellerCharacterId,
      sellerCharacterName,
      itemId,
      itemName: row.itemName?.trim() || `Item ${itemId}`,
      itemIconId: toNullableNumber(row.itemIconId),
      itemType: toNullableNumber(row.itemType),
      itemSlots: toNullableNumber(row.itemSlots),
      price: toNumber(row.price),
      charges,
      slotId,
      listedAt: row.listedAt ? new Date(row.listedAt) : null,
      syncedAt
    };
  });
}

function buildStableMarketListingId(input: {
  sellerCharacterId: number;
  sellerCharacterName: string;
  itemId: number;
  slotId: number;
  charges: number | null;
}): string {
  const sellerKey =
    input.sellerCharacterId > 0
      ? `seller-id:${input.sellerCharacterId}`
      : `seller-name:${normalizeSearchQuery(input.sellerCharacterName)}`;
  const fingerprint = [
    sellerKey,
    `item:${input.itemId}`,
    `slot:${input.slotId}`,
    `charges:${input.charges ?? 'na'}`
  ].join('|');

  return `ml_${createHash('sha1').update(fingerprint).digest('hex')}`;
}

async function refreshMarketListingsCache(records: MarketListingCacheRecord[], syncedAt: Date) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let index = 0; index < records.length; index += CREATE_MANY_CHUNK_SIZE) {
      const chunk = records.slice(index, index + CREATE_MANY_CHUNK_SIZE);
      if (chunk.length > 0) {
        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO \`MarketListing\` (
              \`id\`,
              \`sellerCharacterId\`,
              \`sellerCharacterName\`,
              \`itemId\`,
              \`itemName\`,
              \`itemIconId\`,
              \`itemType\`,
              \`itemSlots\`,
              \`price\`,
              \`charges\`,
              \`slotId\`,
              \`listedAt\`,
              \`syncedAt\`
            )
            VALUES ${Prisma.join(
              chunk.map((record) => Prisma.sql`(
                ${record.id},
                ${record.sellerCharacterId},
                ${record.sellerCharacterName},
                ${record.itemId},
                ${record.itemName},
                ${record.itemIconId},
                ${record.itemType},
                ${record.itemSlots},
                ${record.price},
                ${record.charges},
                ${record.slotId},
                ${record.listedAt},
                ${record.syncedAt}
              )`)
            )}
            ON DUPLICATE KEY UPDATE
              \`sellerCharacterId\` = VALUES(\`sellerCharacterId\`),
              \`sellerCharacterName\` = VALUES(\`sellerCharacterName\`),
              \`itemId\` = VALUES(\`itemId\`),
              \`itemName\` = VALUES(\`itemName\`),
              \`itemIconId\` = VALUES(\`itemIconId\`),
              \`itemType\` = VALUES(\`itemType\`),
              \`itemSlots\` = VALUES(\`itemSlots\`),
              \`price\` = VALUES(\`price\`),
              \`charges\` = VALUES(\`charges\`),
              \`slotId\` = VALUES(\`slotId\`),
              \`listedAt\` = VALUES(\`listedAt\`),
              \`syncedAt\` = VALUES(\`syncedAt\`)
          `
        );
      }
    }

    if (records.length === 0) {
      await tx.marketListing.deleteMany();
    } else {
      await tx.marketListing.deleteMany({
        where: {
          syncedAt: { lt: syncedAt }
        }
      });
    }

    await setMarketListingsSyncState({ lastRetrievedAt: syncedAt.toISOString() }, tx);
  });
}

export async function getMarketListingsSyncStatus(): Promise<MarketListingsSyncStatus> {
  const state = await getMarketListingsSyncState();
  return {
    lastRetrievedAt: state.lastRetrievedAt
  };
}

export async function syncMarketListings(
  options: {
    logger?: MarketLogger;
    minIntervalMs?: number;
  } = {}
): Promise<MarketListingsSyncSummary> {
  if (!isEqDbConfigured()) {
    return {
      retrieved: 0,
      lastRetrievedAt: (await getMarketListingsSyncStatus()).lastRetrievedAt
    };
  }

  if (marketListingsSyncPromise) {
    return marketListingsSyncPromise;
  }

  const { logger, minIntervalMs = MARKET_LISTINGS_STALE_MS } = options;

  marketListingsSyncPromise = (async () => {
    try {
      const status = await getMarketListingsSyncStatus();
      const existingRows = await prisma.marketListing.count().catch((error: unknown) => {
        if (isMarketListingCacheSchemaMissing(error)) {
          logMissingMarketListingsCache(logger);
          return 0;
        }

        throw error;
      });
      const lastRetrievedMs = status.lastRetrievedAt
        ? new Date(status.lastRetrievedAt).getTime()
        : 0;

      if (existingRows > 0 && lastRetrievedMs && Date.now() - lastRetrievedMs < minIntervalMs) {
        logger?.debug?.(
          `[MarketListings] skipped early retrieval; lastRetrievedAt=${status.lastRetrievedAt ?? 'n/a'}`
        );
        return {
          retrieved: 0,
          lastRetrievedAt: status.lastRetrievedAt
        };
      }

      const eqRows = await fetchEqMarketListings();
      const syncedAt = new Date();
      const records = buildCacheRecords(eqRows, syncedAt);
      const previousListings = await prisma.marketListing
        .findMany({
          select: {
            id: true,
            sellerCharacterName: true,
            itemId: true,
            itemName: true,
            itemIconId: true,
            price: true,
            charges: true,
            slotId: true,
            listedAt: true
          }
        })
        .catch((error: unknown) => {
          if (isMarketListingCacheSchemaMissing(error)) {
            logMissingMarketListingsCache(logger);
            return [];
          }

          throw error;
        });
      await refreshMarketListingsCache(records, syncedAt);
      await processMarketListingNotifications({
        previousListings,
        currentListings: records.map((record) => ({
          id: record.id,
          sellerCharacterName: record.sellerCharacterName,
          itemId: record.itemId,
          itemName: record.itemName,
          itemIconId: record.itemIconId,
          price: record.price,
          charges: record.charges,
          slotId: record.slotId,
          listedAt: record.listedAt
        })),
        syncedAt
      });

      logger?.debug?.(`[MarketListings] retrieved=${records.length}`);
      return {
        retrieved: records.length,
        lastRetrievedAt: syncedAt.toISOString()
      };
    } catch (error) {
      if (isMissingMarketListingsSource(error)) {
        logger?.warn?.(
          '[MarketListings] EQ trader tables are unavailable. Preserving the existing listings cache.'
        );
        return {
          retrieved: 0,
          lastRetrievedAt: (await getMarketListingsSyncStatus()).lastRetrievedAt
        };
      }

      if (isMarketListingCacheSchemaMissing(error)) {
        logMissingMarketListingsCache(logger);
        return {
          retrieved: 0,
          lastRetrievedAt: (await getMarketListingsSyncStatus()).lastRetrievedAt
        };
      }

      throw error;
    }
  })();

  try {
    return await marketListingsSyncPromise;
  } finally {
    marketListingsSyncPromise = null;
  }
}

export async function ensureMarketListingsFresh(
  options: {
    logger?: MarketLogger;
    maxStaleMs?: number;
  } = {}
): Promise<void> {
  if (!isEqDbConfigured()) {
    return;
  }

  const { logger, maxStaleMs = MARKET_LISTINGS_STALE_MS } = options;
  const [status, totalRows] = await Promise.all([
    getMarketListingsSyncStatus(),
    prisma.marketListing.count().catch((error: unknown) => {
      if (isMarketListingCacheSchemaMissing(error)) {
        logMissingMarketListingsCache(logger);
        return 0;
      }

      throw error;
    })
  ]);

  const lastRetrievedMs = status.lastRetrievedAt ? new Date(status.lastRetrievedAt).getTime() : 0;
  const stale = !lastRetrievedMs || Date.now() - lastRetrievedMs >= maxStaleMs;

  if (totalRows === 0 || stale) {
    await syncMarketListings({ logger });
  }
}

export async function getMarketListingsPage(
  options: {
    q?: string;
    itemId?: number;
    itemName?: string;
    sellerName?: string;
    itemType?: number;
    equipSlots?: number[];
    excludeAugs?: boolean;
    minPrice?: number;
    maxPrice?: number;
    minCharges?: number;
    maxCharges?: number;
    listedWithinDays?: number;
    dealsOnly?: boolean;
    bestPricesOnly?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: MarketListingsSortField;
    sortOrder?: SortOrder;
  } = {}
): Promise<MarketListingsPage> {
  const {
    q = '',
    itemId,
    itemName,
    sellerName,
    itemType,
    equipSlots,
    excludeAugs = false,
    minPrice,
    maxPrice,
    minCharges,
    maxCharges,
    listedWithinDays,
    dealsOnly = false,
    bestPricesOnly = false,
    page = 1,
    pageSize = 25,
    sortBy = 'listedAt',
    sortOrder = 'desc'
  } = options;

  const syncStatus = await getMarketListingsSyncStatus();
  const { clause, params } = buildWhereClause({
    q,
    itemId,
    itemName,
    sellerName,
    itemType,
    equipSlots,
    excludeAugs,
    minPrice,
    maxPrice,
    minCharges,
    maxCharges,
    listedWithinDays,
    dealsOnly,
    bestPricesOnly
  });
  const offset = (page - 1) * pageSize;

  const runListingsQuery = async (includeAveragePrice: boolean) => {
    const averagePriceJoinClause = buildAveragePriceJoinClause(includeAveragePrice);
    const queryParams = includeAveragePrice ? [SELLER_EVENT_TYPE, ...params] : params;
    const orderByClause = buildOrderByClause(sortBy, sortOrder, includeAveragePrice);

    const [summaryRows, listingRows] = await Promise.all([
      prisma.$queryRawUnsafe<MarketListingsSummaryRow[]>(
        `
          SELECT
            COUNT(*) as totalListings,
            COUNT(DISTINCT ml.sellerCharacterId) as distinctSellers,
            COUNT(DISTINCT ml.itemId) as distinctItems,
            MAX(ml.listedAt) as newestListingAt
          FROM MarketListing ml
          ${averagePriceJoinClause}
          ${clause}
        `,
        ...queryParams
      ),
      prisma.$queryRawUnsafe<MarketListingRow[]>(
        `
          SELECT
            ml.id as id,
            ml.sellerCharacterId as sellerCharacterId,
            ml.sellerCharacterName as sellerCharacterName,
            ml.itemId as itemId,
            ml.itemName as itemName,
            ml.itemIconId as itemIconId,
            ml.itemSlots as itemSlots,
            ${includeAveragePrice ? 'saleAvg.averagePrice' : 'NULL'} as itemAveragePrice,
            ml.price as price,
            ml.charges as charges,
            ml.slotId as slotId,
            ml.listedAt as listedAt
          FROM MarketListing ml
          ${averagePriceJoinClause}
          ${clause}
          ORDER BY ${orderByClause}
          LIMIT ? OFFSET ?
        `,
        ...queryParams,
        pageSize,
        offset
      )
    ]);

    const summaryRow = summaryRows[0];
    const summary: MarketListingsSummary = {
      totalListings: toNumber(summaryRow?.totalListings),
      distinctSellers: toNumber(summaryRow?.distinctSellers),
      distinctItems: toNumber(summaryRow?.distinctItems),
      newestListingAt: summaryRow?.newestListingAt
        ? new Date(summaryRow.newestListingAt).toISOString()
        : null
    };
    const priceRankByListingId = await buildPriceRankByListingId(
      listingRows.map((row) => toNumber(row.itemId))
    );

    return {
      listings: listingRows.map((row) => mapMarketListingRow(row, priceRankByListingId)),
      summary,
      page,
      pageSize,
      total: summary.totalListings,
      totalPages: Math.max(1, Math.ceil(summary.totalListings / pageSize)),
      sourceAvailable: true,
      message: null,
      syncStatus
    };
  };

  try {
    return await runListingsQuery(true);
  } catch (error) {
    if (isMarketSaleEventTableMissing(error)) {
      if (dealsOnly) {
        return {
          ...buildEmptyMarketListingsPage(
            page,
            pageSize,
            syncStatus,
            'No listings match the current filters.'
          ),
          sourceAvailable: true
        };
      }

      return runListingsQuery(false);
    }

    if (isMarketListingCacheSchemaMissing(error)) {
      return buildEmptyMarketListingsPage(
        page,
        pageSize,
        syncStatus,
        MARKET_LISTINGS_CACHE_UNAVAILABLE_MESSAGE
      );
    }

    throw error;
  }
}
