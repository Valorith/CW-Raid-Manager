import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { EQEMU_ITEM_SLOT_IDS, EQEMU_ITEM_TYPE_VALUES } from '../data/eqItemFilters.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  ensureMarketListingsFresh,
  getMarketListingsPage
} from '../services/marketListingsService.js';
import {
  addMarketFavoriteCharacter,
  addMarketFavoriteItem,
  getMarketFavorites,
  getMarketCharacterHistoryPage,
  getMarketItemActivity,
  getMarketItemHistory,
  getMarketRecentSalesPage,
  getMarketSummary,
  removeMarketFavoriteCharacter,
  removeMarketFavoriteItem,
  searchMarketCharacters,
  searchMarketItems
} from '../services/marketService.js';
import { searchDiscoveredItems } from '../services/npcRespawnService.js';

export async function marketRoutes(server: FastifyInstance): Promise<void> {
  const itemTypeValues = new Set<number>(EQEMU_ITEM_TYPE_VALUES);
  const itemSlotIds = new Set<number>(EQEMU_ITEM_SLOT_IDS);

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
          equipSlot: z.coerce.number().int().optional(),
          minPrice: z.coerce.number().int().min(0).optional(),
          maxPrice: z.coerce.number().int().min(0).optional(),
          minCharges: z.coerce.number().int().min(0).optional(),
          maxCharges: z.coerce.number().int().min(0).optional(),
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
        })
        .refine((value) => value.equipSlot == null || itemSlotIds.has(value.equipSlot), {
          message: 'Invalid equipment slot.'
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

  server.get(
    '/favorites',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      try {
        const favorites = await getMarketFavorites(request.user.userId);
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
        const summary = await getMarketSummary(parsed.data.days, parsed.data.topItemsSort);
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
