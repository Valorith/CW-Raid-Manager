import { Prisma } from '@prisma/client';
import type { RowDataPacket } from 'mysql2/promise';

import { ensureMarketListingsFresh } from './marketListingsService.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';

const SELLER_EVENT_TYPE = 'TRADER_SELL';

type MarketListingSnapshot = {
  itemId: number;
  itemName: string;
  itemIconId: number | null;
  price: number;
  charges: number | null;
  sellerCharacterName: string;
  listedAt: Date | null;
};

type EqItemRow = RowDataPacket & {
  itemId: number | bigint | string;
  itemName: string | null;
  itemIconId: number | bigint | string | null;
};

export type MarketPriceWizardRecommendationSource =
  | 'listing-undercut'
  | 'historical-average'
  | 'none';

export interface MarketPriceWizardRecommendationRequest {
  itemId: number;
  variantCharges?: number | null;
}

export interface MarketPriceWizardRecommendationOptions {
  currentSellerName?: string | null;
}

export interface MarketPriceWizardRecommendation {
  itemId: number;
  variantCharges: number | null;
  itemName: string;
  itemIconId: number | null;
  matchedListings: number;
  lowestListingPrice: number | null;
  lowestListingSellerName: string | null;
  lowestListingCharges: number | null;
  historicalAveragePrice: number | null;
  recommendedPrice: number | null;
  recommendationSource: MarketPriceWizardRecommendationSource;
}

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

function normalizeCharges(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function buildRecommendationKey(itemId: number, variantCharges: number | null): string {
  return `${itemId}:${variantCharges ?? 'na'}`;
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

async function loadEqItemMetadata(
  itemIds: number[]
): Promise<Map<number, { itemName: string; itemIconId: number | null }>> {
  const metadata = new Map<number, { itemName: string; itemIconId: number | null }>();
  if (!isEqDbConfigured() || itemIds.length === 0) {
    return metadata;
  }

  const placeholders = itemIds.map(() => '?').join(', ');
  const rows = await queryEqDb<EqItemRow[]>(
    `
      SELECT
        i.id as itemId,
        i.Name as itemName,
        i.icon as itemIconId
      FROM items i
      WHERE i.id IN (${placeholders})
    `,
    itemIds
  );

  for (const row of rows) {
    const itemId = toNumber(row.itemId);
    if (itemId <= 0) {
      continue;
    }

    metadata.set(itemId, {
      itemName: row.itemName?.trim() || `Item ${itemId}`,
      itemIconId: toNullableNumber(row.itemIconId)
    });
  }

  return metadata;
}

export async function getMarketPriceWizardRecommendations(
  requests: MarketPriceWizardRecommendationRequest[],
  options: MarketPriceWizardRecommendationOptions = {}
): Promise<MarketPriceWizardRecommendation[]> {
  const normalizedRequests = requests
    .map((entry) => ({
      itemId: Math.trunc(entry.itemId),
      variantCharges: normalizeCharges(entry.variantCharges ?? null)
    }))
    .filter((entry) => Number.isInteger(entry.itemId) && entry.itemId > 0);

  if (normalizedRequests.length === 0) {
    return [];
  }

  await ensureMarketListingsFresh();

  const normalizedCurrentSellerName = options.currentSellerName?.trim().toLowerCase() || null;

  const uniqueItemIds = Array.from(new Set(normalizedRequests.map((entry) => entry.itemId)));

  const [listings, historicalAverages, saleMetadataRows, eqMetadata] = await Promise.all([
    prisma.marketListing
      .findMany({
        where: {
          itemId: {
            in: uniqueItemIds
          }
        },
        select: {
          itemId: true,
          itemName: true,
          itemIconId: true,
          price: true,
          charges: true,
          sellerCharacterName: true,
          listedAt: true
        }
      })
      .catch((error: unknown) => {
        if (isMarketListingCacheSchemaMissing(error)) {
          return [];
        }

        throw error;
      }),
    prisma.marketSaleEvent
      .groupBy({
        by: ['itemId'],
        where: {
          eventType: SELLER_EVENT_TYPE,
          itemId: {
            in: uniqueItemIds
          }
        },
        _avg: {
          price: true
        }
      })
      .catch((error: unknown) => {
        if (isMarketSaleEventTableMissing(error)) {
          return [];
        }

        throw error;
      }),
    prisma.marketSaleEvent
      .findMany({
        where: {
          eventType: SELLER_EVENT_TYPE,
          itemId: {
            in: uniqueItemIds
          }
        },
        select: {
          itemId: true,
          itemName: true,
          itemIconId: true,
          occurredAt: true
        },
        orderBy: [{ occurredAt: 'desc' }]
      })
      .catch((error: unknown) => {
        if (isMarketSaleEventTableMissing(error)) {
          return [];
        }

        throw error;
      }),
    loadEqItemMetadata(uniqueItemIds)
  ]);

  const listingsByItemId = new Map<number, MarketListingSnapshot[]>();
  const listingMetadataByItemId = new Map<
    number,
    { itemName: string; itemIconId: number | null }
  >();

  for (const listing of listings) {
    const itemId = listing.itemId;
    const snapshot: MarketListingSnapshot = {
      itemId,
      itemName: listing.itemName?.trim() || `Item ${itemId}`,
      itemIconId: listing.itemIconId,
      price: listing.price,
      charges: normalizeCharges(listing.charges),
      sellerCharacterName: listing.sellerCharacterName?.trim() || 'Unknown Trader',
      listedAt: listing.listedAt
    };

    const itemListings = listingsByItemId.get(itemId);
    if (itemListings) {
      itemListings.push(snapshot);
    } else {
      listingsByItemId.set(itemId, [snapshot]);
    }

    if (!listingMetadataByItemId.has(itemId)) {
      listingMetadataByItemId.set(itemId, {
        itemName: snapshot.itemName,
        itemIconId: snapshot.itemIconId
      });
    }
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

      return left.sellerCharacterName.localeCompare(right.sellerCharacterName);
    });
  }

  const historicalAverageByItemId = new Map<number, number>();
  for (const row of historicalAverages) {
    if (row.itemId == null) {
      continue;
    }

    historicalAverageByItemId.set(row.itemId, Math.round(row._avg.price ?? 0));
  }

  const salesMetadataByItemId = new Map<number, { itemName: string; itemIconId: number | null }>();
  for (const row of saleMetadataRows) {
    if (row.itemId == null) {
      continue;
    }

    if (salesMetadataByItemId.has(row.itemId)) {
      continue;
    }

    salesMetadataByItemId.set(row.itemId, {
      itemName: row.itemName?.trim() || `Item ${row.itemId}`,
      itemIconId: row.itemIconId
    });
  }

  const recommendationByKey = new Map<string, MarketPriceWizardRecommendation>();

  for (const request of normalizedRequests) {
    const key = buildRecommendationKey(request.itemId, request.variantCharges);
    if (recommendationByKey.has(key)) {
      continue;
    }

    const itemMetadata = eqMetadata.get(request.itemId) ??
      listingMetadataByItemId.get(request.itemId) ??
      salesMetadataByItemId.get(request.itemId) ?? {
        itemName: `Item ${request.itemId}`,
        itemIconId: null
      };

    const itemListings = listingsByItemId.get(request.itemId) ?? [];
    const matchedListings =
      request.variantCharges == null
        ? itemListings
        : itemListings.filter(
            (listing) => normalizeCharges(listing.charges) === request.variantCharges
          );
    const competingListings = normalizedCurrentSellerName
      ? matchedListings.filter(
          (listing) => listing.sellerCharacterName.trim().toLowerCase() !== normalizedCurrentSellerName
        )
      : matchedListings;
    const bestListing = competingListings[0] ?? null;
    const historicalAveragePrice = historicalAverageByItemId.get(request.itemId) ?? null;

    let recommendedPrice: number | null = null;
    let recommendationSource: MarketPriceWizardRecommendationSource = 'none';

    if (bestListing) {
      recommendedPrice = Math.max(0, bestListing.price - 1);
      recommendationSource = 'listing-undercut';
    } else if (historicalAveragePrice != null && historicalAveragePrice > 0) {
      recommendedPrice = historicalAveragePrice;
      recommendationSource = 'historical-average';
    }

    recommendationByKey.set(key, {
      itemId: request.itemId,
      variantCharges: request.variantCharges,
      itemName: itemMetadata.itemName,
      itemIconId: itemMetadata.itemIconId,
      matchedListings: competingListings.length,
      lowestListingPrice: bestListing?.price ?? null,
      lowestListingSellerName: bestListing?.sellerCharacterName ?? null,
      lowestListingCharges: bestListing?.charges ?? null,
      historicalAveragePrice,
      recommendedPrice,
      recommendationSource
    });
  }

  return normalizedRequests.map(
    (request) =>
      recommendationByKey.get(buildRecommendationKey(request.itemId, request.variantCharges))!
  );
}
