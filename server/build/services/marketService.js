import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { getItemIconId } from './eqItemService.js';
const TRADER_PURCHASE_EVENT_TYPE_ID = 38;
const TRADER_SELL_EVENT_TYPE_ID = 39;
const DEFAULT_SYNC_BATCH_SIZE = 500;
const MARKET_SYNC_STATE_KEY = 'marketLogSyncState';
const SELLER_EVENT_TYPE = 'TRADER_SELL';
let characterSchemaCache = null;
let marketSyncPromise = null;
let marketTableMissingWarned = false;
function normalizeItemName(value) {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function asInt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    return null;
}
function toNumber(value) {
    if (typeof value === 'bigint') {
        return Number(value);
    }
    return Number(value ?? 0);
}
function isMarketSaleEventTableMissing(error) {
    return (error instanceof Prisma.PrismaClientKnownRequestError &&
        ((error.code === 'P2021' &&
            (error.meta?.modelName === 'MarketSaleEvent' || error.meta?.table === 'MarketSaleEvent')) ||
            (error.code === 'P2010' &&
                error.meta?.code === '1146' &&
                typeof error.meta?.message === 'string' &&
                error.meta.message.includes('MarketSaleEvent'))));
}
function logMissingMarketTable(logger) {
    if (marketTableMissingWarned) {
        return;
    }
    marketTableMissingWarned = true;
    logger?.warn?.('[MarketSync] MarketSaleEvent table is missing. Apply the market migration to enable persisted market history.');
}
function createEmptyMarketSummary(rangeDays, syncStatus = { lastEqLogId: null, lastSyncedAt: null }) {
    return {
        rangeDays,
        totalSales: 0,
        totalUnitsSold: 0,
        totalRevenue: 0,
        uniqueItems: 0,
        averageSalePrice: 0,
        lastSaleAt: null,
        syncStatus,
        dailyActivity: [],
        topItems: [],
        recentSales: []
    };
}
async function getTableColumns(tableName) {
    try {
        const rows = await queryEqDb(`SELECT COLUMN_NAME as col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tableName]);
        return rows.map((row) => String(row.col).toLowerCase());
    }
    catch {
        return [];
    }
}
async function discoverCharacterSchema() {
    if (characterSchemaCache) {
        return characterSchemaCache;
    }
    const columns = await getTableColumns('character_data');
    if (columns.length === 0) {
        characterSchemaCache = { exists: false, idColumn: null, nameColumn: null };
        return characterSchemaCache;
    }
    const idCandidates = ['id', 'charid', 'character_id'];
    const nameCandidates = ['name', 'character_name', 'charname'];
    characterSchemaCache = {
        exists: true,
        idColumn: idCandidates.find((candidate) => columns.includes(candidate)) ?? null,
        nameColumn: nameCandidates.find((candidate) => columns.includes(candidate)) ?? null
    };
    return characterSchemaCache;
}
async function getMarketSyncState() {
    const row = await prisma.systemSetting.findUnique({
        where: { key: MARKET_SYNC_STATE_KEY }
    });
    if (!row) {
        return { lastEqLogId: '0', lastSyncedAt: null };
    }
    try {
        const parsed = JSON.parse(row.value);
        return {
            lastEqLogId: parsed.lastEqLogId && parsed.lastEqLogId.length > 0 ? parsed.lastEqLogId : '0',
            lastSyncedAt: parsed.lastSyncedAt ?? null
        };
    }
    catch {
        return { lastEqLogId: row.value || '0', lastSyncedAt: null };
    }
}
async function setMarketSyncState(state) {
    await prisma.systemSetting.upsert({
        where: { key: MARKET_SYNC_STATE_KEY },
        create: {
            key: MARKET_SYNC_STATE_KEY,
            value: JSON.stringify(state)
        },
        update: {
            value: JSON.stringify(state)
        }
    });
}
async function fetchEqTraderLogBatch(afterId, limit) {
    const characterSchema = await discoverCharacterSchema();
    const hasCharacterJoin = characterSchema.exists && characterSchema.idColumn && characterSchema.nameColumn;
    const selectName = hasCharacterJoin
        ? `cd.${characterSchema.nameColumn} as actor_character_name`
        : 'NULL as actor_character_name';
    const joinClause = hasCharacterJoin
        ? `LEFT JOIN character_data cd ON pel.character_id = cd.${characterSchema.idColumn}`
        : '';
    return queryEqDb(`
      SELECT
        pel.id,
        pel.character_id,
        ${selectName},
        pel.event_type_id,
        pel.created_at,
        pel.event_data
      FROM player_event_logs pel
      ${joinClause}
      WHERE pel.event_type_id IN (?, ?)
        AND pel.id > ?
      ORDER BY pel.id ASC
      LIMIT ?
    `, [TRADER_PURCHASE_EVENT_TYPE_ID, TRADER_SELL_EVENT_TYPE_ID, afterId, limit]);
}
async function normalizeBatchRows(rows, logger) {
    const parsedRows = rows.map((row) => {
        let payload = {};
        if (row.event_data) {
            try {
                payload = JSON.parse(row.event_data);
            }
            catch {
                payload = {};
            }
        }
        return {
            row,
            payload,
            itemId: asInt(payload.item_id ?? payload.itemId)
        };
    });
    const itemIdsNeedingIcons = Array.from(new Set(parsedRows.map((entry) => entry.itemId).filter((value) => value != null)));
    const iconMap = new Map();
    await Promise.all(itemIdsNeedingIcons.map(async (itemId) => {
        const iconId = await getItemIconId(itemId, logger);
        iconMap.set(itemId, iconId);
    }));
    return parsedRows
        .map(({ row, payload, itemId }) => {
        const isPurchase = row.event_type_id === TRADER_PURCHASE_EVENT_TYPE_ID;
        const itemName = String(payload.item_name ?? payload.itemName ?? '').trim() ||
            (itemId != null ? `Item ${itemId}` : '');
        const itemNameNormalized = normalizeItemName(itemName);
        if (itemNameNormalized.length === 0) {
            return null;
        }
        const price = asInt(payload.price) ?? 0;
        const quantity = Math.max(1, asInt(payload.quantity) ?? 1);
        const totalCost = asInt(payload.total_cost ?? payload.totalCost) ?? price * quantity;
        const charges = asInt(payload.charges);
        const counterpartyCharacterId = asInt(isPurchase ? (payload.trader_id ?? payload.traderId) : (payload.buyer_id ?? payload.buyerId));
        const counterpartyCharacterName = String(isPurchase
            ? (payload.trader_name ?? payload.traderName ?? '')
            : (payload.buyer_name ?? payload.buyerName ?? '')).trim() || null;
        return {
            eqLogId: BigInt(row.id),
            eventType: isPurchase ? 'TRADER_PURCHASE' : 'TRADER_SELL',
            occurredAt: new Date(row.created_at),
            syncedAt: new Date(),
            actorCharacterId: row.character_id,
            actorCharacterName: row.actor_character_name?.trim() ||
                (isPurchase ? `Buyer ${row.character_id}` : `Seller ${row.character_id}`),
            counterpartyCharacterId,
            counterpartyCharacterName,
            itemId,
            itemName,
            itemNameNormalized,
            itemIconId: itemId != null ? (iconMap.get(itemId) ?? null) : null,
            price,
            quantity,
            charges,
            totalCost,
            playerMoneyBalance: asInt(payload.player_money_balance ?? payload.playerMoneyBalance),
            rawEventData: payload
        };
    })
        .filter((entry) => entry !== null);
}
async function fetchRecentSales(where, limit = 12) {
    const rows = await prisma.marketSaleEvent.findMany({
        where: {
            ...where,
            eventType: SELLER_EVENT_TYPE
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        select: {
            id: true,
            occurredAt: true,
            itemId: true,
            itemName: true,
            itemIconId: true,
            price: true,
            quantity: true,
            charges: true,
            totalCost: true,
            actorCharacterId: true,
            actorCharacterName: true,
            counterpartyCharacterId: true,
            counterpartyCharacterName: true
        }
    });
    return rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        itemId: row.itemId,
        itemName: row.itemName,
        itemIconId: row.itemIconId,
        price: row.price,
        quantity: row.quantity,
        charges: row.charges,
        totalCost: row.totalCost,
        sellerCharacterId: row.actorCharacterId,
        sellerCharacterName: row.actorCharacterName,
        buyerCharacterId: row.counterpartyCharacterId,
        buyerCharacterName: row.counterpartyCharacterName
    }));
}
async function fetchRecentSalesPage(where, page, pageSize) {
    const skip = (page - 1) * pageSize;
    const salesWhere = {
        ...where,
        eventType: SELLER_EVENT_TYPE
    };
    const [total, rows] = await Promise.all([
        prisma.marketSaleEvent.count({ where: salesWhere }),
        prisma.marketSaleEvent.findMany({
            where: salesWhere,
            orderBy: { occurredAt: 'desc' },
            skip,
            take: pageSize,
            select: {
                id: true,
                occurredAt: true,
                itemId: true,
                itemName: true,
                itemIconId: true,
                price: true,
                quantity: true,
                charges: true,
                totalCost: true,
                actorCharacterId: true,
                actorCharacterName: true,
                counterpartyCharacterId: true,
                counterpartyCharacterName: true
            }
        })
    ]);
    return {
        sales: rows.map((row) => ({
            id: row.id,
            occurredAt: row.occurredAt.toISOString(),
            itemId: row.itemId,
            itemName: row.itemName,
            itemIconId: row.itemIconId,
            price: row.price,
            quantity: row.quantity,
            charges: row.charges,
            totalCost: row.totalCost,
            sellerCharacterId: row.actorCharacterId,
            sellerCharacterName: row.actorCharacterName,
            buyerCharacterId: row.counterpartyCharacterId,
            buyerCharacterName: row.counterpartyCharacterName
        })),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
}
function buildRangeStart(rangeDays) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - rangeDays);
    return start;
}
function buildOccurredAtRange(rangeDays) {
    if (rangeDays == null) {
        return undefined;
    }
    return { gte: buildRangeStart(rangeDays) };
}
export async function getMarketSyncStatus() {
    const state = await getMarketSyncState();
    return {
        lastEqLogId: state.lastEqLogId !== '0' ? state.lastEqLogId : null,
        lastSyncedAt: state.lastSyncedAt
    };
}
export async function syncMarketSaleEvents(options = {}) {
    if (!isEqDbConfigured()) {
        return {
            processed: 0,
            inserted: 0,
            batches: 0,
            lastEqLogId: null,
            lastSyncedAt: null
        };
    }
    if (marketSyncPromise) {
        return marketSyncPromise;
    }
    const { logger, batchSize = DEFAULT_SYNC_BATCH_SIZE, maxBatches = 20 } = options;
    marketSyncPromise = (async () => {
        try {
            const currentState = await getMarketSyncState();
            let cursor = currentState.lastEqLogId || '0';
            let processed = 0;
            let inserted = 0;
            let batches = 0;
            while (batches < maxBatches) {
                const rows = await fetchEqTraderLogBatch(cursor, batchSize);
                if (rows.length === 0) {
                    break;
                }
                const normalizedRows = await normalizeBatchRows(rows, logger);
                if (normalizedRows.length > 0) {
                    const result = await prisma.marketSaleEvent.createMany({
                        data: normalizedRows,
                        skipDuplicates: true
                    });
                    inserted += result.count;
                }
                processed += rows.length;
                batches += 1;
                cursor = String(rows[rows.length - 1].id);
                await setMarketSyncState({
                    lastEqLogId: cursor,
                    lastSyncedAt: new Date().toISOString()
                });
            }
            if (processed === 0) {
                await setMarketSyncState({
                    lastEqLogId: cursor || '0',
                    lastSyncedAt: new Date().toISOString()
                });
            }
            const summary = await getMarketSyncStatus();
            logger?.debug?.(`[MarketSync] processed=${processed} inserted=${inserted} batches=${batches} lastEqLogId=${summary.lastEqLogId ?? '0'}`);
            return {
                processed,
                inserted,
                batches,
                lastEqLogId: summary.lastEqLogId,
                lastSyncedAt: summary.lastSyncedAt
            };
        }
        catch (error) {
            if (isMarketSaleEventTableMissing(error)) {
                logMissingMarketTable(logger);
                const summary = await getMarketSyncStatus();
                return {
                    processed: 0,
                    inserted: 0,
                    batches: 0,
                    lastEqLogId: summary.lastEqLogId,
                    lastSyncedAt: summary.lastSyncedAt
                };
            }
            throw error;
        }
    })();
    try {
        return await marketSyncPromise;
    }
    finally {
        marketSyncPromise = null;
    }
}
export async function ensureMarketSalesFresh(options = {}) {
    if (!isEqDbConfigured()) {
        return;
    }
    const { logger, maxStaleMs = 2 * 60 * 1000, maxBatches = 3 } = options;
    const [status, totalRows] = await Promise.all([
        getMarketSyncStatus(),
        prisma.marketSaleEvent.count().catch((error) => {
            if (isMarketSaleEventTableMissing(error)) {
                logMissingMarketTable(logger);
                return 0;
            }
            throw error;
        })
    ]);
    const lastSyncedMs = status.lastSyncedAt ? new Date(status.lastSyncedAt).getTime() : 0;
    const stale = !lastSyncedMs || Date.now() - lastSyncedMs > maxStaleMs;
    if (totalRows === 0 || stale) {
        await syncMarketSaleEvents({ logger, maxBatches });
    }
}
export async function getMarketSummary(rangeDays = null, topItemsSort = 'quantity') {
    const occurredAtRange = buildOccurredAtRange(rangeDays);
    const where = {
        eventType: SELLER_EVENT_TYPE,
        ...(occurredAtRange ? { occurredAt: occurredAtRange } : {})
    };
    const rangeFilterSql = occurredAtRange
        ? Prisma.sql `AND occurredAt >= ${occurredAtRange.gte}`
        : Prisma.empty;
    const topItemsOrderSql = topItemsSort === 'value'
        ? Prisma.sql `totalRevenue DESC, unitsSold DESC, salesCount DESC, lastSoldAt DESC`
        : Prisma.sql `unitsSold DESC, salesCount DESC, totalRevenue DESC, lastSoldAt DESC`;
    try {
        const [aggregate, topItemsRaw, dailyActivityRaw, recentSales, syncStatus, uniqueItems] = await Promise.all([
            prisma.marketSaleEvent.aggregate({
                where,
                _count: { _all: true },
                _sum: { quantity: true, totalCost: true },
                _avg: { price: true },
                _max: { occurredAt: true }
            }),
            prisma.$queryRaw(Prisma.sql `
        SELECT
          itemId,
          itemName,
          MAX(itemIconId) as itemIconId,
          COUNT(*) as salesCount,
          COALESCE(SUM(quantity), 0) as unitsSold,
          COALESCE(SUM(totalCost), 0) as totalRevenue,
          AVG(price) as averagePrice,
          MAX(occurredAt) as lastSoldAt
        FROM MarketSaleEvent
        WHERE eventType = ${SELLER_EVENT_TYPE}
          ${rangeFilterSql}
        GROUP BY itemId, itemNameNormalized, itemName
        ORDER BY ${topItemsOrderSql}
        LIMIT 8
      `),
            prisma.$queryRaw(Prisma.sql `
        SELECT
          DATE(occurredAt) as saleDate,
          COUNT(*) as salesCount,
          COALESCE(SUM(quantity), 0) as unitsSold,
          COALESCE(SUM(totalCost), 0) as totalRevenue
        FROM MarketSaleEvent
        WHERE eventType = ${SELLER_EVENT_TYPE}
          ${rangeFilterSql}
        GROUP BY DATE(occurredAt)
        ORDER BY saleDate ASC
      `),
            fetchRecentSales(occurredAtRange ? { occurredAt: occurredAtRange } : {}, 14),
            getMarketSyncStatus(),
            prisma.marketSaleEvent.groupBy({
                by: ['itemNameNormalized'],
                where
            })
        ]);
        return {
            rangeDays,
            totalSales: aggregate._count._all ?? 0,
            totalUnitsSold: aggregate._sum.quantity ?? 0,
            totalRevenue: aggregate._sum.totalCost ?? 0,
            uniqueItems: uniqueItems.length,
            averageSalePrice: Math.round(aggregate._avg.price ?? 0),
            lastSaleAt: aggregate._max.occurredAt?.toISOString() ?? null,
            syncStatus,
            dailyActivity: dailyActivityRaw.map((row) => ({
                saleDate: new Date(row.saleDate).toISOString(),
                salesCount: toNumber(row.salesCount),
                unitsSold: toNumber(row.unitsSold),
                totalRevenue: toNumber(row.totalRevenue)
            })),
            topItems: topItemsRaw.map((row) => ({
                itemId: row.itemId,
                itemName: row.itemName,
                itemIconId: row.itemIconId,
                salesCount: toNumber(row.salesCount),
                unitsSold: toNumber(row.unitsSold),
                totalRevenue: toNumber(row.totalRevenue),
                averagePrice: Math.round(row.averagePrice ?? 0),
                lastSoldAt: new Date(row.lastSoldAt).toISOString()
            })),
            recentSales
        };
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return createEmptyMarketSummary(rangeDays, await getMarketSyncStatus());
        }
        throw error;
    }
}
export async function searchMarketItems(query, limit = 12) {
    const normalizedQuery = normalizeItemName(query);
    if (normalizedQuery.length === 0) {
        return [];
    }
    let rows;
    try {
        rows = await prisma.$queryRaw(Prisma.sql `
      SELECT
        itemId,
        itemName,
        MAX(itemIconId) as itemIconId,
        COUNT(*) as saleCount,
        MAX(occurredAt) as lastSoldAt
      FROM MarketSaleEvent
      WHERE eventType = ${SELLER_EVENT_TYPE}
        AND itemNameNormalized LIKE ${`%${normalizedQuery}%`}
      GROUP BY itemId, itemNameNormalized, itemName
      ORDER BY lastSoldAt DESC, saleCount DESC
      LIMIT ${limit}
    `);
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return [];
        }
        throw error;
    }
    return rows.map((row) => ({
        itemId: row.itemId,
        itemName: row.itemName,
        itemIconId: row.itemIconId,
        saleCount: toNumber(row.saleCount),
        lastSoldAt: new Date(row.lastSoldAt).toISOString()
    }));
}
export async function getMarketItemHistory(options) {
    const { itemId, itemName, rangeDays = null, pointLimit = 200 } = options;
    const normalizedName = normalizeItemName(itemName);
    if (itemId == null && normalizedName.length === 0) {
        return null;
    }
    const occurredAtRange = buildOccurredAtRange(rangeDays);
    const where = {
        eventType: SELLER_EVENT_TYPE,
        ...(occurredAtRange ? { occurredAt: occurredAtRange } : {}),
        ...(itemId != null
            ? { itemId }
            : {
                itemNameNormalized: normalizedName
            })
    };
    const itemRangeFilterSql = occurredAtRange
        ? Prisma.sql `AND occurredAt >= ${occurredAtRange.gte}`
        : Prisma.empty;
    const marketData = await Promise.all([
        prisma.marketSaleEvent.aggregate({
            where,
            _count: { _all: true },
            _sum: { quantity: true, totalCost: true },
            _avg: { price: true },
            _min: { price: true },
            _max: { price: true, occurredAt: true }
        }),
        prisma.marketSaleEvent.findFirst({
            where,
            orderBy: [{ itemIconId: 'desc' }, { occurredAt: 'desc' }],
            select: {
                itemId: true,
                itemName: true,
                itemIconId: true
            }
        }),
        prisma.marketSaleEvent.findMany({
            where,
            orderBy: { occurredAt: 'asc' },
            take: pointLimit,
            select: {
                occurredAt: true,
                price: true,
                quantity: true,
                totalCost: true
            }
        }),
        fetchRecentSales(where, 20),
        prisma.$queryRaw(itemId != null
            ? Prisma.sql `
              SELECT
                DATE(occurredAt) as saleDate,
                COUNT(*) as salesCount,
                COALESCE(SUM(quantity), 0) as unitsSold,
                AVG(price) as averagePrice,
                MIN(price) as minPrice,
                MAX(price) as maxPrice,
                COALESCE(SUM(totalCost), 0) as totalRevenue
              FROM MarketSaleEvent
              WHERE eventType = ${SELLER_EVENT_TYPE}
                ${itemRangeFilterSql}
                AND itemId = ${itemId}
              GROUP BY DATE(occurredAt)
              ORDER BY saleDate ASC
            `
            : Prisma.sql `
              SELECT
                DATE(occurredAt) as saleDate,
                COUNT(*) as salesCount,
                COALESCE(SUM(quantity), 0) as unitsSold,
                AVG(price) as averagePrice,
                MIN(price) as minPrice,
                MAX(price) as maxPrice,
                COALESCE(SUM(totalCost), 0) as totalRevenue
              FROM MarketSaleEvent
              WHERE eventType = ${SELLER_EVENT_TYPE}
                ${itemRangeFilterSql}
                AND itemNameNormalized = ${normalizedName}
              GROUP BY DATE(occurredAt)
              ORDER BY saleDate ASC
            `)
    ]).catch((error) => {
        if (isMarketSaleEventTableMissing(error)) {
            return null;
        }
        throw error;
    });
    if (!marketData) {
        return null;
    }
    const [aggregate, representative, pricePoints, recentSales, dailyTrendRaw] = marketData;
    if (!representative || (aggregate._count._all ?? 0) === 0) {
        return null;
    }
    return {
        itemId: representative.itemId,
        itemName: representative.itemName,
        itemIconId: representative.itemIconId,
        rangeDays,
        stats: {
            totalSales: aggregate._count._all ?? 0,
            totalUnitsSold: aggregate._sum.quantity ?? 0,
            totalRevenue: aggregate._sum.totalCost ?? 0,
            averagePrice: Math.round(aggregate._avg.price ?? 0),
            minPrice: aggregate._min.price ?? 0,
            maxPrice: aggregate._max.price ?? 0,
            lastSoldAt: aggregate._max.occurredAt?.toISOString() ?? null
        },
        pricePoints: pricePoints.map((point) => ({
            occurredAt: point.occurredAt.toISOString(),
            price: point.price,
            quantity: point.quantity,
            totalCost: point.totalCost
        })),
        dailyTrend: dailyTrendRaw.map((row) => ({
            saleDate: new Date(row.saleDate).toISOString(),
            salesCount: toNumber(row.salesCount),
            unitsSold: toNumber(row.unitsSold),
            averagePrice: Math.round(row.averagePrice ?? 0),
            minPrice: row.minPrice ?? 0,
            maxPrice: row.maxPrice ?? 0,
            totalRevenue: toNumber(row.totalRevenue)
        })),
        recentSales
    };
}
export async function getMarketRecentSalesPage(options) {
    const { itemId, itemName, rangeDays = null, page = 1, pageSize = 10 } = options;
    const normalizedName = normalizeItemName(itemName);
    const occurredAtRange = buildOccurredAtRange(rangeDays);
    const where = {
        ...(occurredAtRange ? { occurredAt: occurredAtRange } : {}),
        ...(itemId != null
            ? { itemId }
            : normalizedName.length > 0
                ? { itemNameNormalized: normalizedName }
                : {})
    };
    try {
        return await fetchRecentSalesPage(where, page, pageSize);
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return {
                sales: [],
                page,
                pageSize,
                total: 0,
                totalPages: 1
            };
        }
        throw error;
    }
}
