import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { getUserGuildRole } from '../services/guildService.js';
import { ensureUserCanViewGuild, ensureCanManageRaid, getRaidEventById } from '../services/raidService.js';
import {
  createRaidLootEvents,
  deleteRaidLootEvent,
  getGuildLootParserSettings,
  listRaidLootEvents,
  listRecentLootForUser,
  updateGuildLootParserSettings,
  updateRaidLootEvent,
  defaultLootPatterns,
  defaultLootEmoji
} from '../services/lootService.js';

const lootEventSchema = z.object({
  itemName: z.string().min(2).max(191),
  looterName: z.string().min(2).max(191),
  looterClass: z.string().max(50).optional().nullable(),
  emoji: z.string().max(16).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  eventTime: z.string().optional().nullable()
});

const parserPatternSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  pattern: z.string().min(1)
});

export async function lootRoutes(server: FastifyInstance) {
  server.get('/user/recent-loot', { preHandler: [authenticate] }, async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(6)
    });

    const parsedQuery = querySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.badRequest('Invalid query parameters.');
    }

    const { page, limit } = parsedQuery.data;
    const offset = (page - 1) * limit;
    const { loot, total } = await listRecentLootForUser(request.user.userId, { limit, offset });
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      loot,
      page,
      totalPages,
      total
    };
  });

  server.get('/raids/:raidId/loot', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ raidId: z.string() });
    const { raidId } = paramsSchema.parse(request.params);

    const raid = await getRaidEventById(raidId);
    if (!raid) {
      return reply.notFound('Raid not found.');
    }

    try {
      await ensureUserCanViewGuild(request.user.userId, raid.guildId);
    } catch {
      return reply.forbidden('You are not a member of this guild.');
    }

    const loot = await listRaidLootEvents(raidId);
    return { loot };
  });

  server.post('/raids/:raidId/loot', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ raidId: z.string() });
    const { raidId } = paramsSchema.parse(request.params);

    const raid = await getRaidEventById(raidId);
    if (!raid) {
      return reply.notFound('Raid not found.');
    }

    try {
      await ensureCanManageRaid(request.user.userId, raid.guildId);
    } catch (error) {
      request.log.warn({ error }, 'Unauthorized loot create attempt.');
      return reply.forbidden('You do not have permission to modify loot for this raid.');
    }

    const bodySchema = z.object({
      events: z.array(lootEventSchema).min(1)
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid loot payload.');
    }

    const created = await createRaidLootEvents({
      raidId,
      guildId: raid.guildId,
      createdById: request.user.userId,
      events: parsed.data.events
    });

    return reply.code(201).send({ loot: created });
  });

  server.patch('/raids/:raidId/loot/:lootId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ raidId: z.string(), lootId: z.string() });
    const { raidId, lootId } = paramsSchema.parse(request.params);

    const raid = await getRaidEventById(raidId);
    if (!raid) {
      return reply.notFound('Raid not found.');
    }

    try {
      await ensureCanManageRaid(request.user.userId, raid.guildId);
    } catch (error) {
      request.log.warn({ error }, 'Unauthorized loot update attempt.');
      return reply.forbidden('You do not have permission to modify loot for this raid.');
    }

    const bodySchema = lootEventSchema.partial();
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid loot update payload.');
    }

    const loot = await updateRaidLootEvent(lootId, raid.guildId, parsed.data);
    return { loot };
  });

  server.delete('/raids/:raidId/loot/:lootId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ raidId: z.string(), lootId: z.string() });
    const { raidId, lootId } = paramsSchema.parse(request.params);

    const raid = await getRaidEventById(raidId);
    if (!raid) {
      return reply.notFound('Raid not found.');
    }

    try {
      await ensureCanManageRaid(request.user.userId, raid.guildId);
    } catch (error) {
      request.log.warn({ error }, 'Unauthorized loot delete attempt.');
      return reply.forbidden('You do not have permission to delete loot for this raid.');
    }

    await deleteRaidLootEvent(lootId, raid.guildId);
    return reply.code(204).send();
  });

  server.get('/guilds/:guildId/loot-settings', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You are not a member of this guild.');
    }

    const settings = await getGuildLootParserSettings(guildId);
    return {
      settings,
      defaults: {
        patterns: defaultLootPatterns,
        emoji: defaultLootEmoji
      }
    };
  });

  server.put('/guilds/:guildId/loot-settings', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || membership.role === 'MEMBER') {
      return reply.forbidden('Only raid staff can update parser settings.');
    }

    const bodySchema = z.object({
      patterns: z.array(parserPatternSchema).min(1),
      emoji: z.string().max(16).optional().nullable()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid parser settings payload.');
    }

    const settings = await updateGuildLootParserSettings(guildId, parsed.data);
    return { settings };
  });
}
