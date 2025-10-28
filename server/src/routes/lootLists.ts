import { FastifyInstance } from 'fastify';
import { LootListType, Prisma } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  canManageGuild,
  getUserGuildRole
} from '../services/guildService.js';
import {
  createGuildLootListEntry,
  deleteGuildLootListEntry,
  getGuildLootListSummary,
  listGuildLootListEntries,
  updateGuildLootListEntry
} from '../services/lootListService.js';

const sortFields = ['itemName', 'itemId', 'createdAt'] as const;

export async function lootListRoutes(server: FastifyInstance) {
  server.get('/:guildId/loot-lists/summary', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('You do not have permission to view loot lists for this guild.');
    }

    const summary = await getGuildLootListSummary(guildId);
    return summary;
  });

  server.get('/:guildId/loot-lists', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const querySchema = z.object({
      type: z.nativeEnum(LootListType),
      search: z.string().max(191).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      sortBy: z.enum(sortFields).default('itemName'),
      sortDirection: z.enum(['asc', 'desc']).default('asc')
    });

    const parsedQuery = querySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.badRequest('Invalid loot list query parameters.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('You do not have permission to view loot lists for this guild.');
    }

    const result = await listGuildLootListEntries({
      guildId,
      type: parsedQuery.data.type,
      search: parsedQuery.data.search,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
      sortBy: parsedQuery.data.sortBy,
      sortDirection: parsedQuery.data.sortDirection
    });

    return result;
  });

  server.post('/:guildId/loot-lists', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      type: z.nativeEnum(LootListType),
      itemName: z.string().min(1).max(191),
      itemId: z.coerce.number().int().positive().optional().nullable()
    });

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid loot list entry payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('You do not have permission to modify loot lists for this guild.');
    }

    try {
      const entry = await createGuildLootListEntry({
        guildId,
        type: parsedBody.data.type,
        itemName: parsedBody.data.itemName,
        itemId: parsedBody.data.itemId ?? null,
        createdById: request.user.userId
      });

      return reply.code(201).send({ entry });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.conflict('A loot list entry with this identifier already exists.');
      }
      request.log.error({ error }, 'Failed to create loot list entry.');
      return reply.internalServerError('Unable to create loot list entry.');
    }
  });

  server.patch('/:guildId/loot-lists/:entryId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), entryId: z.string() });
    const { guildId, entryId } = paramsSchema.parse(request.params);

    const bodySchema = z
      .object({
        type: z.nativeEnum(LootListType).optional(),
        itemName: z.string().min(1).max(191).optional(),
        itemId: z
          .union([z.coerce.number().int().positive(), z.literal(null)])
          .optional()
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided.'
      });

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid loot list update payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('You do not have permission to modify loot lists for this guild.');
    }

    try {
      const entry = await updateGuildLootListEntry(entryId, guildId, {
        ...parsedBody.data
      });
      return { entry };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return reply.conflict('A loot list entry with this identifier already exists.');
        }
        if (error.code === 'P2025') {
          return reply.notFound('Loot list entry not found.');
        }
      }
      request.log.error({ error }, 'Failed to update loot list entry.');
      return reply.internalServerError('Unable to update loot list entry.');
    }
  });

  server.delete('/:guildId/loot-lists/:entryId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), entryId: z.string() });
    const { guildId, entryId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('You do not have permission to modify loot lists for this guild.');
    }

    try {
      await deleteGuildLootListEntry(entryId, guildId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.notFound('Loot list entry not found.');
      }
      request.log.error({ error }, 'Failed to delete loot list entry.');
      return reply.internalServerError('Unable to delete loot list entry.');
    }
  });
}
