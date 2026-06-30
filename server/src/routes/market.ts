import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { EQEMU_ITEM_SLOT_IDS, EQEMU_ITEM_TYPE_VALUES } from '../data/eqItemFilters.js';
import { authenticate } from '../middleware/authenticate.js';
import { createIpRateLimitPreHandler } from '../middleware/rateLimit.js';
import {
  ensureMarketListingsFresh,
  getMarketListingsPage
} from '../services/marketListingsService.js';
import {
  listMarketPriceWizardTraderFiles,
  pickMarketPriceWizardDirectory,
  readMarketPriceWizardTraderFile,
  saveMarketPriceWizardTraderFile
} from '../services/marketPriceWizardFileService.js';
import { getMarketPriceWizardRecommendations } from '../services/marketPriceWizardService.js';
import {
  addMarketFavoriteCharacter,
  addMarketFavoriteItem,
  addMarketTrader,
  getMarketFavorites,
  getMarketCharacterHistoryPage,
  getMarketItemActivity,
  getPublicMarketItemData,
  getMarketItemHistory,
  getMarketRecentSalesPage,
  getMarketSummary,
  removeMarketTrader,
  removeMarketFavoriteCharacter,
  removeMarketFavoriteItem,
  searchMarketCharacters,
  searchMarketItems,
  type MarketTraderListingsRefreshMode
} from '../services/marketService.js';
import { searchDiscoveredItems } from '../services/npcRespawnService.js';

const PUBLIC_MARKET_REFRESH_TIMEOUT_MS = 20_000;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

const marketTraderListingsRefreshModes = [
  'none',
  'stale',
  'force'
] as const satisfies readonly MarketTraderListingsRefreshMode[];

export async function marketRoutes(server: FastifyInstance): Promise<void> {
  const itemTypeValues = new Set<number>(EQEMU_ITEM_TYPE_VALUES);
  const itemSlotIds = new Set<number>(EQEMU_ITEM_SLOT_IDS);
  const publicMarketItemRateLimit = createIpRateLimitPreHandler({
    key: 'market-public-item',
    maxRequests: 60,
    windowMs: 60_000
  });
  const applyPublicMarketCors = (reply: { header: (name: string, value: string) => void }) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
  };
  let publicMarketListingsRefreshPromise: Promise<void> | null = null;

  server.options('/public/items/:itemId', async (_request, reply) => {
    applyPublicMarketCors(reply);
    return reply.code(204).send();
  });

  server.get(
    '/public/items/:itemId',
    {
      preHandler: [publicMarketItemRateLimit]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        itemId: z.coerce.number().int().positive()
      });
      const querySchema = z.object({
        days: z.coerce.number().int().min(1).max(3650).optional(),
        rangeDays: z.coerce.number().int().min(1).max(3650).optional(),
        pointLimit: z.coerce.number().int().min(20).max(300).default(120),
        listingLimit: z.coerce.number().int().min(1).max(25).default(10)
      });

      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.badRequest('Invalid item ID.');
      }

      const parsedQuery = querySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return reply.badRequest(
          parsedQuery.error.issues[0]?.message ?? 'Invalid query parameters.'
        );
      }

      try {
        if (!publicMarketListingsRefreshPromise) {
          publicMarketListingsRefreshPromise = withTimeout(
            ensureMarketListingsFresh({ logger: request.log }),
            PUBLIC_MARKET_REFRESH_TIMEOUT_MS,
            'Timed out refreshing market listings for public item lookup.'
          )
            .catch((error: unknown) => {
              request.log.warn(
                { error },
                'Failed to refresh market listings for public item lookup; serving cached data.'
              );
            })
            .finally(() => {
              publicMarketListingsRefreshPromise = null;
            });
          void publicMarketListingsRefreshPromise;
        }

        const rangeDays = parsedQuery.data.days ?? parsedQuery.data.rangeDays ?? 180;

        const marketData = await getPublicMarketItemData({
          itemId: parsedParams.data.itemId,
          rangeDays,
          pointLimit: parsedQuery.data.pointLimit,
          listingLimit: parsedQuery.data.listingLimit
        });

        applyPublicMarketCors(reply);
        reply.header('Cache-Control', 'public, max-age=60');

        return {
          ...marketData,
          message: marketData.hasMarketData ? null : 'No market data found for this item.'
        };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch public market item data.');
        return reply.internalServerError('Unable to fetch market item data.');
      }
    }
  );

  server.get(
    '/listings',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z
        .object({
          q: z.string().trim().max(100).optional(),
          itemId: z.coerce.number().int().positive().optional(),
          itemName: z.string().trim().max(100).optional(),
          sellerName: z.string().trim().max(100).optional(),
          itemType: z.coerce.number().int().optional(),
          equipSlots: z
            .string()
            .optional()
            .transform((value) => {
              if (!value) return undefined;
              const ids = value
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isInteger(n) && itemSlotIds.has(n));
              return ids.length > 0 ? ids : undefined;
            }),
          minPrice: z.coerce.number().int().min(0).optional(),
          maxPrice: z.coerce.number().int().min(0).optional(),
          minCharges: z.coerce.number().int().min(0).optional(),
          maxCharges: z.coerce.number().int().min(0).optional(),
          excludeAugs: z
            .preprocess(
              (value) =>
                value === true || value === 'true'
                  ? true
                  : value === false || value === 'false'
                    ? false
                    : undefined,
              z.boolean().optional()
            )
            .optional(),
          listedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
          dealsOnly: z
            .preprocess(
              (value) =>
                value === true || value === 'true'
                  ? true
                  : value === false || value === 'false'
                    ? false
                    : undefined,
              z.boolean().optional()
            )
            .optional(),
          bestPricesOnly: z
            .preprocess(
              (value) =>
                value === true || value === 'true'
                  ? true
                  : value === false || value === 'false'
                    ? false
                    : undefined,
              z.boolean().optional()
            )
            .optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(5).max(100).default(25),
          sortBy: z
            .enum([
              'listedAt',
              'price',
              'priceRank',
              'analysis',
              'charges',
              'itemName',
              'sellerName',
              'slotId'
            ])
            .default('listedAt'),
          sortOrder: z.enum(['asc', 'desc']).default('desc')
        })
        .refine(
          (value) =>
            value.minPrice == null || value.maxPrice == null || value.minPrice <= value.maxPrice,
          {
            message: 'Minimum price must be less than or equal to maximum price.'
          }
        )
        .refine(
          (value) =>
            value.minCharges == null ||
            value.maxCharges == null ||
            value.minCharges <= value.maxCharges,
          {
            message: 'Minimum charges must be less than or equal to maximum charges.'
          }
        )
        .refine((value) => value.itemType == null || itemTypeValues.has(value.itemType), {
          message: 'Invalid item type.'
        });
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
      }

      const refreshIfStale =
        typeof request.query === 'object' &&
        request.query !== null &&
        'refreshIfStale' in request.query &&
        (request.query.refreshIfStale === 'true' || request.query.refreshIfStale === true);

      try {
        if (refreshIfStale) {
          await ensureMarketListingsFresh({ logger: request.log });
        }

        const listingsPage = await getMarketListingsPage(parsed.data);
        return { listingsPage };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch cached market listings.');
        return reply.internalServerError('Unable to fetch market listings.');
      }
    }
  );

  server.post(
    '/price-wizard/recommendations',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        entries: z
          .array(
            z.object({
              itemId: z.coerce.number().int().positive(),
              variantCharges: z.coerce.number().int().min(0).nullable().optional()
            })
          )
          .min(1)
          .max(1500),
        currentSellerName: z.string().trim().min(1).max(191).optional()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid price wizard payload.');
      }

      try {
        const recommendations = await getMarketPriceWizardRecommendations(parsed.data.entries, {
          currentSellerName: parsed.data.currentSellerName
        });
        return { recommendations };
      } catch (error) {
        request.log.error({ error }, 'Failed to build market price wizard recommendations.');
        return reply.internalServerError('Unable to build market price recommendations.');
      }
    }
  );

  server.post(
    '/price-wizard/traders/pick-directory',
    {
      preHandler: [authenticate]
    },
    async (_request, reply) => {
      try {
        const directoryPath = await pickMarketPriceWizardDirectory();
        return { directoryPath };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to open the EQ directory picker.';
        return reply.badRequest(message);
      }
    }
  );

  server.post(
    '/price-wizard/traders',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        directoryPath: z.string().trim().min(1).max(512)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid EQ game directory path.');
      }

      try {
        const traderFiles = await listMarketPriceWizardTraderFiles(parsed.data.directoryPath);
        return { traderFiles };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to scan the EQ game directory.';
        return reply.badRequest(message);
      }
    }
  );

  server.post(
    '/price-wizard/traders/read',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        directoryPath: z.string().trim().min(1).max(512),
        fileName: z.string().trim().min(1).max(255)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid trader INI request.');
      }

      try {
        const traderFile = await readMarketPriceWizardTraderFile(
          parsed.data.directoryPath,
          parsed.data.fileName
        );
        return { traderFile };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to read the trader INI file.';
        return reply.badRequest(message);
      }
    }
  );

  server.post(
    '/price-wizard/traders/save',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        directoryPath: z.string().trim().min(1).max(512),
        fileName: z.string().trim().min(1).max(255),
        content: z.string()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid trader INI save payload.');
      }

      try {
        await saveMarketPriceWizardTraderFile(
          parsed.data.directoryPath,
          parsed.data.fileName,
          parsed.data.content
        );
        return { success: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to save the trader INI file.';
        return reply.badRequest(message);
      }
    }
  );

  server.get(
    '/favorites',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        traderListingsRefresh: z.enum(marketTraderListingsRefreshModes).default('none')
      });
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid market favorites query.');
      }

      try {
        const favorites = await getMarketFavorites(request.user.userId, {
          traderListingsRefresh: parsed.data.traderListingsRefresh,
          logger: request.log
        });
        return { favorites };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch market favorites.');
        return reply.internalServerError('Unable to fetch market favorites.');
      }
    }
  );

  server.post(
    '/favorites/items',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        itemId: z.coerce.number().int().positive().optional(),
        itemName: z.string().trim().min(1).max(191),
        itemIconId: z.coerce.number().int().positive().nullable().optional()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid favorite item payload.');
      }

      try {
        const favorite = await addMarketFavoriteItem(request.user.userId, parsed.data);
        return { favorite };
      } catch (error) {
        request.log.error({ error }, 'Failed to add market favorite item.');
        return reply.internalServerError('Unable to add favorite item.');
      }
    }
  );

  server.delete(
    '/favorites/items',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z
        .object({
          itemId: z.coerce.number().int().positive().optional(),
          itemName: z.string().trim().min(1).max(191).optional()
        })
        .refine((value) => value.itemId != null || Boolean(value.itemName), {
          message: 'Provide either itemId or itemName.'
        });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
      }

      try {
        await removeMarketFavoriteItem(request.user.userId, parsed.data);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove market favorite item.');
        return reply.internalServerError('Unable to remove favorite item.');
      }
    }
  );

  server.post(
    '/favorites/characters',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        characterName: z.string().trim().min(1).max(191)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid favorite character payload.');
      }

      try {
        const favorite = await addMarketFavoriteCharacter(
          request.user.userId,
          parsed.data.characterName
        );
        return { favorite };
      } catch (error) {
        request.log.error({ error }, 'Failed to add market favorite character.');
        return reply.internalServerError('Unable to add favorite character.');
      }
    }
  );

  server.delete(
    '/favorites/characters',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        characterName: z.string().trim().min(1).max(191)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        await removeMarketFavoriteCharacter(request.user.userId, parsed.data.characterName);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove market favorite character.');
        return reply.internalServerError('Unable to remove favorite character.');
      }
    }
  );

  server.post(
    '/favorites/traders',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        characterName: z.string().trim().min(1).max(191)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid trader payload.');
      }

      try {
        const favorite = await addMarketTrader(request.user.userId, parsed.data.characterName);
        return { favorite };
      } catch (error) {
        request.log.error({ error }, 'Failed to add market trader.');
        return reply.internalServerError('Unable to add trader.');
      }
    }
  );

  server.delete(
    '/favorites/traders',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        characterName: z.string().trim().min(1).max(191)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        await removeMarketTrader(request.user.userId, parsed.data.characterName);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove market trader.');
        return reply.internalServerError('Unable to remove trader.');
      }
    }
  );

  server.get(
    '/summary',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        days: z.coerce.number().int().min(1).max(3650).optional(),
        topItemsSort: z.enum(['quantity', 'value']).default('quantity')
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const summary = await getMarketSummary(
          parsed.data.days,
          parsed.data.topItemsSort,
          request.user.userId
        );
        return { summary };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch market summary.');
        return reply.internalServerError('Unable to fetch market summary.');
      }
    }
  );

  server.get(
    '/items/discovered-search',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        q: z.string().trim().min(2).max(100),
        limit: z.coerce.number().int().min(1).max(25).default(12)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Search query must be at least 2 characters.');
      }

      try {
        const items = await searchDiscoveredItems(parsed.data.q, parsed.data.limit);
        return { items };
      } catch (error) {
        request.log.error({ error }, 'Failed to search discovered market items.');
        return reply.internalServerError('Unable to search discovered market items.');
      }
    }
  );

  server.get(
    '/items/search',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        q: z.string().trim().min(2).max(100),
        limit: z.coerce.number().int().min(1).max(25).default(12)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Search query must be at least 2 characters.');
      }

      try {
        const items = await searchMarketItems(parsed.data.q, parsed.data.limit);
        return { items };
      } catch (error) {
        request.log.error({ error }, 'Failed to search market items.');
        return reply.internalServerError('Unable to search market items.');
      }
    }
  );

  server.get(
    '/characters/search',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        q: z.string().trim().min(2).max(100),
        limit: z.coerce.number().int().min(1).max(25).default(12)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Search query must be at least 2 characters.');
      }

      try {
        const characters = await searchMarketCharacters(parsed.data.q, parsed.data.limit);
        return { characters };
      } catch (error) {
        request.log.error({ error }, 'Failed to search market characters.');
        return reply.internalServerError('Unable to search market characters.');
      }
    }
  );

  server.get(
    '/sales',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        itemId: z.coerce.number().int().positive().optional(),
        itemName: z.string().trim().min(1).max(191).optional(),
        days: z.coerce.number().int().min(1).max(3650).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(50).default(10)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const salesPage = await getMarketRecentSalesPage({
          itemId: parsed.data.itemId,
          itemName: parsed.data.itemName,
          rangeDays: parsed.data.days,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize
        });
        return { salesPage };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch market sales page.');
        return reply.internalServerError('Unable to fetch market sales.');
      }
    }
  );

  server.get(
    '/character-history',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z.object({
        characterName: z.string().trim().min(1).max(191),
        type: z.enum(['sell', 'buy']).default('sell'),
        days: z.coerce.number().int().min(1).max(3650).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(50).default(10)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const historyPage = await getMarketCharacterHistoryPage({
          characterName: parsed.data.characterName,
          type: parsed.data.type,
          rangeDays: parsed.data.days,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize
        });
        return { historyPage };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character market history.');
        return reply.internalServerError('Unable to fetch character market history.');
      }
    }
  );

  server.get(
    '/history/activity',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z
        .object({
          itemId: z.coerce.number().int().positive().optional(),
          itemName: z.string().trim().min(1).max(191).optional(),
          days: z.coerce.number().int().min(1).max(3650).optional(),
          buyersPage: z.coerce.number().int().min(1).default(1),
          sellersPage: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(5).max(50).default(10)
        })
        .refine((value) => value.itemId != null || Boolean(value.itemName), {
          message: 'Provide either itemId or itemName.'
        });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
      }

      try {
        const activity = await getMarketItemActivity({
          itemId: parsed.data.itemId,
          itemName: parsed.data.itemName,
          rangeDays: parsed.data.days,
          buyersPage: parsed.data.buyersPage,
          sellersPage: parsed.data.sellersPage,
          pageSize: parsed.data.pageSize
        });

        return { activity };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch market item activity.');
        return reply.internalServerError('Unable to fetch market item activity.');
      }
    }
  );

  server.get(
    '/history',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const querySchema = z
        .object({
          itemId: z.coerce.number().int().positive().optional(),
          itemName: z.string().trim().min(1).max(191).optional(),
          days: z.coerce.number().int().min(1).max(3650).optional(),
          pointLimit: z.coerce.number().int().min(20).max(500).default(200)
        })
        .refine((value) => value.itemId != null || Boolean(value.itemName), {
          message: 'Provide either itemId or itemName.'
        });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
      }

      try {
        const history = await getMarketItemHistory({
          itemId: parsed.data.itemId,
          itemName: parsed.data.itemName,
          rangeDays: parsed.data.days,
          pointLimit: parsed.data.pointLimit
        });

        return { history };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch market item history.');
        return reply.internalServerError('Unable to fetch market item history.');
      }
    }
  );
}
