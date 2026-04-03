import { MarketFavoriteListType, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { getItemIconId } from './eqItemService.js';
const TRADER_PURCHASE_EVENT_TYPE_ID = 38;
const TRADER_SELL_EVENT_TYPE_ID = 39;
const DEFAULT_SYNC_BATCH_SIZE = 500;
const MARKET_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;
const MARKET_SYNC_STATE_KEY = 'marketLogSyncState';
const SELLER_EVENT_TYPE = 'TRADER_SELL';
const BUYER_EVENT_TYPE = 'TRADER_PURCHASE';
let characterSchemaCache = null;
let marketSyncPromise = null;
let marketTableMissingWarned = false;
function normalizeItemName(value) {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function normalizeDisplayText(value) {
    return (value ?? '').trim().replace(/\s+/g, ' ');
}
function normalizeCharacterName(value) {
    return normalizeDisplayText(value);
}
function normalizeCharacterNameKey(value) {
    return normalizeCharacterName(value).toLowerCase();
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
function buildMarketFavoriteItemKey(itemId, itemName) {
    if (itemId != null) {
        return `item:${itemId}`;
    }
    return `item-name:${normalizeItemName(itemName)}`;
}
function buildMarketFavoriteCharacterKey(characterName) {
    return `character:${normalizeCharacterNameKey(characterName)}`;
}
function createEmptyMarketFavoriteItemMetrics() {
    return {
        totalSales: 0,
        totalUnitsSold: 0,
        totalRevenue: 0,
        averagePrice: 0,
        lastPrice: null,
        lastSoldAt: null
    };
}
function createEmptyMarketFavoriteCharacterMetrics() {
    return {
        sellCount: 0,
        buyCount: 0,
        totalTransactions: 0,
        lastSeenAt: null
    };
}
async function getMarketFavoriteItemMetrics(input) {
    const normalizedItemName = normalizeItemName(input.itemName);
    const where = {
        eventType: SELLER_EVENT_TYPE,
        ...(input.itemId != null
            ? { itemId: input.itemId }
            : normalizedItemName.length > 0
                ? { itemNameNormalized: normalizedItemName }
                : {})
    };
    if (input.itemId == null && normalizedItemName.length === 0) {
        return createEmptyMarketFavoriteItemMetrics();
    }
    try {
        const [aggregate, latestSale] = await Promise.all([
            prisma.marketSaleEvent.aggregate({
                where,
                _count: { _all: true },
                _sum: { quantity: true, totalCost: true },
                _avg: { price: true },
                _max: { occurredAt: true }
            }),
            prisma.marketSaleEvent.findFirst({
                where,
                orderBy: { occurredAt: 'desc' },
                select: {
                    price: true,
                    occurredAt: true
                }
            })
        ]);
        return {
            totalSales: aggregate._count._all ?? 0,
            totalUnitsSold: aggregate._sum.quantity ?? 0,
            totalRevenue: aggregate._sum.totalCost ?? 0,
            averagePrice: Math.round(aggregate._avg.price ?? 0),
            lastPrice: latestSale?.price ?? null,
            lastSoldAt: latestSale?.occurredAt?.toISOString() ?? aggregate._max.occurredAt?.toISOString() ?? null
        };
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return createEmptyMarketFavoriteItemMetrics();
        }
        throw error;
    }
}
async function getMarketFavoriteCharacterMetrics(characterName) {
    const normalizedCharacterName = normalizeCharacterName(characterName);
    if (!normalizedCharacterName) {
        return createEmptyMarketFavoriteCharacterMetrics();
    }
    try {
        const [sellCount, buyCount, lastActorEvent, lastCounterpartyEvent] = await Promise.all([
            prisma.marketSaleEvent.count({
                where: {
                    eventType: SELLER_EVENT_TYPE,
                    actorCharacterName: normalizedCharacterName
                }
            }),
            prisma.marketSaleEvent.count({
                where: {
                    eventType: SELLER_EVENT_TYPE,
                    counterpartyCharacterName: normalizedCharacterName
                }
            }),
            prisma.marketSaleEvent.findFirst({
                where: {
                    actorCharacterName: normalizedCharacterName
                },
                orderBy: { occurredAt: 'desc' },
                select: { occurredAt: true }
            }),
            prisma.marketSaleEvent.findFirst({
                where: {
                    counterpartyCharacterName: normalizedCharacterName
                },
                orderBy: { occurredAt: 'desc' },
                select: { occurredAt: true }
            })
        ]);
        const lastSeenDate = [lastActorEvent?.occurredAt, lastCounterpartyEvent?.occurredAt]
            .filter((value) => value instanceof Date)
            .sort((left, right) => right.getTime() - left.getTime())[0];
        return {
            sellCount,
            buyCount,
            totalTransactions: sellCount + buyCount,
            lastSeenAt: lastSeenDate?.toISOString() ?? null
        };
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return createEmptyMarketFavoriteCharacterMetrics();
        }
        throw error;
    }
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
            eventType: true,
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
    return enrichMarketRecentSales(rows, where.occurredAt);
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
                eventType: true,
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
        sales: await enrichMarketRecentSales(rows, salesWhere.occurredAt),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
}
async function fetchMarketActivityPage(where, eventType, page, pageSize) {
    const skip = (page - 1) * pageSize;
    const pageWhere = {
        ...where,
        eventType
    };
    const [total, rows] = await Promise.all([
        prisma.marketSaleEvent.count({ where: pageWhere }),
        prisma.marketSaleEvent.findMany({
            where: pageWhere,
            orderBy: { occurredAt: 'desc' },
            skip,
            take: pageSize,
            select: {
                id: true,
                occurredAt: true,
                eventType: true,
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
        entries: rows.map(mapMarketSaleEventRow),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
}
function mapMarketSaleEventRow(row) {
    const isSellerEvent = row.eventType === SELLER_EVENT_TYPE;
    return {
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        itemId: row.itemId,
        itemName: row.itemName,
        itemIconId: row.itemIconId,
        price: row.price,
        quantity: row.quantity,
        charges: row.charges,
        totalCost: row.totalCost,
        sellerCharacterId: isSellerEvent ? row.actorCharacterId : (row.counterpartyCharacterId ?? 0),
        sellerCharacterName: isSellerEvent
            ? row.actorCharacterName
            : (row.counterpartyCharacterName ?? 'Unknown Trader'),
        buyerCharacterId: isSellerEvent ? row.counterpartyCharacterId : row.actorCharacterId,
        buyerCharacterName: isSellerEvent ? row.counterpartyCharacterName : row.actorCharacterName
    };
}
async function enrichMarketRecentSales(rows, occurredAt) {
    const sales = rows.map(mapMarketSaleEventRow);
    if (sales.length === 0) {
        return sales;
    }
    const averagePriceEntries = await Promise.all(Array.from(new Map(sales.map((sale) => [
        sale.itemId != null ? `item:${sale.itemId}` : `name:${normalizeItemName(sale.itemName)}`,
        sale
    ])).values()).map(async (sale) => {
        const averagePrice = await getMarketSaleAveragePrice({
            itemId: sale.itemId,
            itemName: sale.itemName
        }, occurredAt);
        return [
            sale.itemId != null ? `item:${sale.itemId}` : `name:${normalizeItemName(sale.itemName)}`,
            averagePrice
        ];
    }));
    const averagePriceByKey = new Map(averagePriceEntries);
    return sales.map((sale) => ({
        ...sale,
        itemAveragePrice: averagePriceByKey.get(sale.itemId != null ? `item:${sale.itemId}` : `name:${normalizeItemName(sale.itemName)}`) ?? null
    }));
}
async function getMarketSaleAveragePrice(item, occurredAt) {
    const normalizedItemName = normalizeItemName(item.itemName);
    if (item.itemId == null && normalizedItemName.length === 0) {
        return null;
    }
    const aggregate = await prisma.marketSaleEvent.aggregate({
        where: {
            eventType: SELLER_EVENT_TYPE,
            ...(occurredAt ? { occurredAt } : {}),
            ...(item.itemId != null ? { itemId: item.itemId } : { itemNameNormalized: normalizedItemName })
        },
        _avg: { price: true }
    });
    return aggregate._avg.price != null ? Math.round(aggregate._avg.price) : null;
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
    const { logger, batchSize = DEFAULT_SYNC_BATCH_SIZE, maxBatches = 20, minIntervalMs = MARKET_SYNC_MIN_INTERVAL_MS } = options;
    marketSyncPromise = (async () => {
        try {
            const currentState = await getMarketSyncState();
            const existingRows = await prisma.marketSaleEvent.count().catch((error) => {
                if (isMarketSaleEventTableMissing(error)) {
                    logMissingMarketTable(logger);
                    return 0;
                }
                throw error;
            });
            const lastSyncedMs = currentState.lastSyncedAt
                ? new Date(currentState.lastSyncedAt).getTime()
                : 0;
            if (existingRows > 0 && lastSyncedMs && Date.now() - lastSyncedMs < minIntervalMs) {
                const summary = await getMarketSyncStatus();
                logger?.debug?.(`[MarketSync] skipped early sync; lastSyncedAt=${summary.lastSyncedAt ?? 'n/a'}`);
                return {
                    processed: 0,
                    inserted: 0,
                    batches: 0,
                    lastEqLogId: summary.lastEqLogId,
                    lastSyncedAt: summary.lastSyncedAt
                };
            }
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
    let marketRows;
    try {
        marketRows = await prisma.$queryRaw(Prisma.sql `
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
            marketRows = [];
        }
        else {
            throw error;
        }
    }
    const results = new Map();
    const resultsByName = new Map();
    for (const row of marketRows) {
        const result = {
            itemId: row.itemId,
            itemName: row.itemName,
            itemIconId: row.itemIconId,
            saleCount: toNumber(row.saleCount),
            lastSoldAt: new Date(row.lastSoldAt).toISOString(),
            hasMarketData: true
        };
        results.set(buildMarketFavoriteItemKey(row.itemId, row.itemName), result);
        resultsByName.set(normalizeItemName(row.itemName), result);
    }
    if (isEqDbConfigured()) {
        const isNumericSearch = /^\d+$/.test(normalizedQuery);
        const namePrefixTerm = `${normalizedQuery}%`;
        const nameContainsTerm = `%${normalizedQuery}%`;
        const numericItemId = isNumericSearch ? Number(normalizedQuery) : null;
        const searchConditions = ['LOWER(i.Name) LIKE ?'];
        const params = [nameContainsTerm];
        if (numericItemId != null && Number.isFinite(numericItemId) && numericItemId > 0) {
            searchConditions.push('i.id = ?');
            params.push(numericItemId);
        }
        try {
            const eqRows = await queryEqDb(`
          SELECT
            i.id as item_id,
            i.Name as item_name,
            i.icon as item_icon_id
          FROM items i
          WHERE ${searchConditions.join(' OR ')}
          ORDER BY
            CASE
              WHEN ? IS NOT NULL AND i.id = ? THEN 0
              WHEN LOWER(i.Name) = ? THEN 1
              WHEN LOWER(i.Name) LIKE ? THEN 2
              ELSE 3
            END,
            i.Name ASC
          LIMIT ?
        `, [...params, numericItemId, numericItemId ?? 0, normalizedQuery, namePrefixTerm, limit]);
            for (const row of eqRows) {
                const itemId = Number(row.item_id);
                const itemName = String(row.item_name);
                const resultKey = buildMarketFavoriteItemKey(itemId, itemName);
                const normalizedItemName = normalizeItemName(itemName);
                const existing = results.get(resultKey) ?? resultsByName.get(normalizedItemName);
                if (existing) {
                    if (existing.itemId == null) {
                        existing.itemId = itemId;
                    }
                    if (existing.itemIconId == null && row.item_icon_id != null) {
                        existing.itemIconId = Number(row.item_icon_id);
                    }
                    continue;
                }
                results.set(resultKey, {
                    itemId,
                    itemName,
                    itemIconId: row.item_icon_id != null ? Number(row.item_icon_id) : null,
                    saleCount: 0,
                    lastSoldAt: null,
                    hasMarketData: false
                });
                resultsByName.set(normalizedItemName, results.get(resultKey));
            }
        }
        catch (error) {
            console.error('Failed to search EQ items for market search fallback:', error);
        }
    }
    return Array.from(results.values())
        .sort((left, right) => {
        if (left.hasMarketData !== right.hasMarketData) {
            return left.hasMarketData ? -1 : 1;
        }
        if (left.lastSoldAt && right.lastSoldAt) {
            const timeDifference = new Date(right.lastSoldAt).getTime() - new Date(left.lastSoldAt).getTime();
            if (timeDifference !== 0) {
                return timeDifference;
            }
        }
        else if (left.lastSoldAt || right.lastSoldAt) {
            return left.lastSoldAt ? -1 : 1;
        }
        if (left.saleCount !== right.saleCount) {
            return right.saleCount - left.saleCount;
        }
        return left.itemName.localeCompare(right.itemName);
    })
        .slice(0, limit);
}
export async function searchMarketCharacters(query, limit = 12) {
    const normalizedQuery = normalizeCharacterNameKey(query);
    if (normalizedQuery.length === 0) {
        return [];
    }
    let rows;
    try {
        rows = await prisma.$queryRaw(Prisma.sql `
      SELECT
        characterName,
        MAX(lastSeenAt) as lastSeenAt,
        COALESCE(SUM(sellCount), 0) as sellCount,
        COALESCE(SUM(buyCount), 0) as buyCount
      FROM (
        SELECT
          actorCharacterName as characterName,
          MAX(occurredAt) as lastSeenAt,
          SUM(CASE WHEN eventType = ${SELLER_EVENT_TYPE} THEN 1 ELSE 0 END) as sellCount,
          SUM(CASE WHEN eventType = ${BUYER_EVENT_TYPE} THEN 1 ELSE 0 END) as buyCount
        FROM MarketSaleEvent
        WHERE actorCharacterName IS NOT NULL
          AND actorCharacterName <> ''
          AND LOWER(actorCharacterName) LIKE ${`%${normalizedQuery}%`}
        GROUP BY actorCharacterName

        UNION ALL

        SELECT
          counterpartyCharacterName as characterName,
          MAX(occurredAt) as lastSeenAt,
          SUM(CASE WHEN eventType = ${BUYER_EVENT_TYPE} THEN 1 ELSE 0 END) as sellCount,
          SUM(CASE WHEN eventType = ${SELLER_EVENT_TYPE} THEN 1 ELSE 0 END) as buyCount
        FROM MarketSaleEvent
        WHERE counterpartyCharacterName IS NOT NULL
          AND counterpartyCharacterName <> ''
          AND LOWER(counterpartyCharacterName) LIKE ${`%${normalizedQuery}%`}
        GROUP BY counterpartyCharacterName
      ) matchedCharacters
      GROUP BY characterName
      ORDER BY lastSeenAt DESC, sellCount DESC, buyCount DESC, characterName ASC
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
        characterName: row.characterName,
        lastSeenAt: new Date(row.lastSeenAt).toISOString(),
        sellCount: toNumber(row.sellCount),
        buyCount: toNumber(row.buyCount)
    }));
}
export async function getMarketFavorites(userId) {
    const favorites = await prisma.marketFavorite.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }]
    });
    const itemFavorites = favorites.filter((favorite) => favorite.listType === MarketFavoriteListType.FAVORITE_ITEMS && Boolean(favorite.itemName));
    const itemMetrics = await Promise.all(itemFavorites.map((favorite) => getMarketFavoriteItemMetrics({
        itemId: favorite.itemId,
        itemName: favorite.itemName
    })));
    const characterFavorites = favorites.filter((favorite) => favorite.listType === MarketFavoriteListType.FAVORITE_CHARACTERS &&
        Boolean(favorite.characterName));
    const characterMetrics = await Promise.all(characterFavorites.map((favorite) => getMarketFavoriteCharacterMetrics(favorite.characterName ?? '')));
    return {
        items: itemFavorites.map((favorite, index) => ({
            id: favorite.id,
            itemId: favorite.itemId,
            itemName: favorite.itemName ?? 'Unknown Item',
            itemIconId: favorite.itemIconId,
            createdAt: favorite.createdAt.toISOString(),
            ...itemMetrics[index]
        })),
        characters: characterFavorites.map((favorite, index) => ({
            id: favorite.id,
            characterName: favorite.characterName ?? 'Unknown Character',
            createdAt: favorite.createdAt.toISOString(),
            ...characterMetrics[index]
        }))
    };
}
export async function addMarketFavoriteItem(userId, input) {
    const itemName = normalizeDisplayText(input.itemName);
    const itemId = input.itemId ?? null;
    const targetKey = buildMarketFavoriteItemKey(itemId, itemName);
    const favorite = await prisma.marketFavorite.upsert({
        where: {
            userId_listType_targetKey: {
                userId,
                listType: MarketFavoriteListType.FAVORITE_ITEMS,
                targetKey
            }
        },
        create: {
            userId,
            listType: MarketFavoriteListType.FAVORITE_ITEMS,
            targetKey,
            itemId,
            itemName,
            itemIconId: input.itemIconId ?? null
        },
        update: {
            itemName,
            itemIconId: input.itemIconId ?? null
        }
    });
    const metrics = await getMarketFavoriteItemMetrics({
        itemId: favorite.itemId,
        itemName: favorite.itemName
    });
    return {
        id: favorite.id,
        itemId: favorite.itemId,
        itemName: favorite.itemName ?? itemName,
        itemIconId: favorite.itemIconId,
        createdAt: favorite.createdAt.toISOString(),
        ...metrics
    };
}
export async function removeMarketFavoriteItem(userId, input) {
    const normalizedName = normalizeDisplayText(input.itemName);
    const targetKey = buildMarketFavoriteItemKey(input.itemId ?? null, normalizedName);
    await prisma.marketFavorite.deleteMany({
        where: {
            userId,
            listType: MarketFavoriteListType.FAVORITE_ITEMS,
            targetKey
        }
    });
}
export async function addMarketFavoriteCharacter(userId, characterName) {
    const normalizedCharacterName = normalizeCharacterName(characterName);
    const targetKey = buildMarketFavoriteCharacterKey(normalizedCharacterName);
    const favorite = await prisma.marketFavorite.upsert({
        where: {
            userId_listType_targetKey: {
                userId,
                listType: MarketFavoriteListType.FAVORITE_CHARACTERS,
                targetKey
            }
        },
        create: {
            userId,
            listType: MarketFavoriteListType.FAVORITE_CHARACTERS,
            targetKey,
            characterName: normalizedCharacterName
        },
        update: {
            characterName: normalizedCharacterName
        }
    });
    const metrics = await getMarketFavoriteCharacterMetrics(favorite.characterName ?? '');
    return {
        id: favorite.id,
        characterName: favorite.characterName ?? normalizedCharacterName,
        createdAt: favorite.createdAt.toISOString(),
        ...metrics
    };
}
export async function removeMarketFavoriteCharacter(userId, characterName) {
    await prisma.marketFavorite.deleteMany({
        where: {
            userId,
            listType: MarketFavoriteListType.FAVORITE_CHARACTERS,
            targetKey: buildMarketFavoriteCharacterKey(characterName)
        }
    });
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
export async function getMarketCharacterHistoryPage(options) {
    const { characterName, type = 'sell', rangeDays = null, page = 1, pageSize = 10 } = options;
    const trimmedName = characterName.trim();
    const occurredAtRange = buildOccurredAtRange(rangeDays);
    const where = {
        actorCharacterName: trimmedName,
        eventType: type === 'sell' ? SELLER_EVENT_TYPE : BUYER_EVENT_TYPE,
        ...(occurredAtRange ? { occurredAt: occurredAtRange } : {})
    };
    const skip = (page - 1) * pageSize;
    try {
        const [total, rows] = await Promise.all([
            prisma.marketSaleEvent.count({ where }),
            prisma.marketSaleEvent.findMany({
                where,
                orderBy: { occurredAt: 'desc' },
                skip,
                take: pageSize,
                select: {
                    id: true,
                    occurredAt: true,
                    eventType: true,
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
            characterName: trimmedName,
            type,
            entries: rows.map(mapMarketSaleEventRow),
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize))
        };
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return {
                characterName: trimmedName,
                type,
                entries: [],
                page,
                pageSize,
                total: 0,
                totalPages: 1
            };
        }
        throw error;
    }
}
export async function getMarketItemActivity(options) {
    const { itemId, itemName, rangeDays = null, buyersPage = 1, sellersPage = 1, pageSize = 10 } = options;
    const normalizedName = normalizeItemName(itemName);
    if (itemId == null && normalizedName.length === 0) {
        return null;
    }
    const occurredAtRange = buildOccurredAtRange(rangeDays);
    const where = {
        ...(occurredAtRange ? { occurredAt: occurredAtRange } : {}),
        ...(itemId != null
            ? { itemId }
            : {
                itemNameNormalized: normalizedName
            })
    };
    try {
        const [representative, buyers, sellers] = await Promise.all([
            prisma.marketSaleEvent.findFirst({
                where,
                orderBy: [{ itemIconId: 'desc' }, { occurredAt: 'desc' }],
                select: {
                    itemId: true,
                    itemName: true,
                    itemIconId: true
                }
            }),
            fetchMarketActivityPage(where, BUYER_EVENT_TYPE, buyersPage, pageSize),
            fetchMarketActivityPage(where, SELLER_EVENT_TYPE, sellersPage, pageSize)
        ]);
        if (!representative) {
            return null;
        }
        return {
            itemId: representative.itemId,
            itemName: representative.itemName,
            itemIconId: representative.itemIconId,
            rangeDays,
            buyers,
            sellers
        };
    }
    catch (error) {
        if (isMarketSaleEventTableMissing(error)) {
            return null;
        }
        throw error;
    }
}
