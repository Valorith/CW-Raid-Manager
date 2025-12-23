import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GuildRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

import { authenticate } from '../middleware/authenticate.js';
import {
  deleteGuildByAdmin,
  deleteRaidEventByAdmin,
  deleteUserByAdmin,
  detachGuildCharacterByAdmin,
  ensureAdmin,
  getGuildDetailForAdmin,
  getRaidEventForAdmin,
  listGuildsForAdmin,
  listRaidEventsForAdmin,
  listUsersForAdmin,
  removeGuildMemberAsAdmin,
  updateGuildDetailsByAdmin,
  updateGuildMemberRoleAsAdmin,
  updateRaidEventByAdmin,
  updateUserByAdmin,
  upsertGuildMembershipAsAdmin
} from '../services/adminService.js';
import {
  fetchLcItems,
  fetchLcRequests,
  fetchLcVotes,
  fetchLootMaster,
  getLootManagementSummary
} from '../services/lootManagementService.js';
import { fetchServerConnections, fetchIpExemptions } from '../services/connectionsService.js';
import {
  fetchPlayerEventLogs,
  getPlayerEventLogStats,
  getEventTypes,
  getEventLogZones
} from '../services/playerEventLogsService.js';
import {
  getCharacterByName,
  getCharacterById,
  getCharacterEvents,
  getAccountInfo,
  getCharacterCorpses,
  getCharacterAssociates,
  searchCharacters,
  addManualAssociation,
  removeManualAssociation,
  getAccountNotes,
  createAccountNote,
  updateAccountNote,
  deleteAccountNote
} from '../services/characterAdminService.js';

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply> {
  try {
    await ensureAdmin(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'Non-admin attempted to access admin route.');
    return reply.forbidden('Administrator privileges required.');
  }
}

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/users',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      const users = await listUsersForAdmin();
      return { users };
    }
  );

  server.patch(
    '/users/:userId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        userId: z.string()
      });
      const { userId } = paramsSchema.parse(request.params);

      const bodySchema = z
        .object({
          admin: z.boolean().optional(),
          displayName: z.string().min(1).max(120).optional(),
          nickname: z.string().max(120).nullable().optional(),
          email: z.string().email().optional()
        })
        .refine((value) => Object.keys(value).length > 0, {
          message: 'No fields provided for update.'
        });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        const user = await updateUserByAdmin(userId, parsed.data);
        return { user };
      } catch (error) {
        request.log.error({ error }, 'Failed to update user.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to update user.');
      }
    }
  );

  server.delete(
    '/users/:userId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        userId: z.string()
      });
      const { userId } = paramsSchema.parse(request.params);

      try {
        await deleteUserByAdmin(userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete user.');
        return reply.badRequest('Unable to delete user.');
      }
    }
  );

  server.get(
    '/guilds',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      const guilds = await listGuildsForAdmin();
      return { guilds };
    }
  );

  server.get(
    '/guilds/:guildId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string()
      });
      const { guildId } = paramsSchema.parse(request.params);

      const guild = await getGuildDetailForAdmin(guildId);
      if (!guild) {
        return reply.notFound('Guild not found.');
      }

      return { guild };
    }
  );

  server.patch(
    '/guilds/:guildId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string()
      });
      const { guildId } = paramsSchema.parse(request.params);

      const bodySchema = z
        .object({
          name: z.string().min(3).max(100).optional(),
          description: z.string().max(500).nullable().optional()
        })
        .refine((value) => Object.keys(value).length > 0, {
          message: 'No fields provided for update.'
        });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        const guild = await updateGuildDetailsByAdmin(guildId, parsed.data);
        return { guild };
      } catch (error) {
        request.log.error({ error }, 'Failed to update guild details.');
        return reply.badRequest('Unable to update guild.');
      }
    }
  );

  server.delete(
    '/guilds/:guildId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string()
      });
      const { guildId } = paramsSchema.parse(request.params);

      try {
        await deleteGuildByAdmin(guildId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete guild.');
        return reply.badRequest('Unable to delete guild.');
      }
    }
  );

  server.post(
    '/guilds/:guildId/members',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string()
      });
      const { guildId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        userId: z.string(),
        role: z.nativeEnum(GuildRole)
      });
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid membership payload.');
      }

      try {
        const membership = await upsertGuildMembershipAsAdmin(guildId, parsed.data.userId, parsed.data.role);
        return reply.code(201).send({ membership });
      } catch (error) {
        request.log.error({ error }, 'Failed to upsert guild membership.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to modify membership.');
      }
    }
  );

  server.patch(
    '/guilds/:guildId/members/:userId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        userId: z.string()
      });
      const { guildId, userId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        role: z.nativeEnum(GuildRole)
      });
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid membership update payload.');
      }

      try {
        const membership = await updateGuildMemberRoleAsAdmin(guildId, userId, parsed.data.role);
        return { membership };
      } catch (error) {
        request.log.error({ error }, 'Failed to update guild membership as admin.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to update membership.');
      }
    }
  );

  server.delete(
    '/guilds/:guildId/members/:userId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        userId: z.string()
      });
      const { guildId, userId } = paramsSchema.parse(request.params);

      try {
        await removeGuildMemberAsAdmin(guildId, userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove guild member as admin.');
        return reply.badRequest('Unable to remove guild member.');
      }
    }
  );

  server.delete(
    '/guilds/:guildId/characters/:characterId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        characterId: z.string()
      });
      const { guildId, characterId } = paramsSchema.parse(request.params);

      try {
        await detachGuildCharacterByAdmin(guildId, characterId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to detach character from guild.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to detach character from guild.');
      }
    }
  );

  server.get(
    '/raids',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      const raids = await listRaidEventsForAdmin();
      return { raids };
    }
  );

  server.get(
    '/raids/:raidId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const raid = await getRaidEventForAdmin(raidId);
      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      return { raid };
    }
  );

  server.patch(
    '/raids/:raidId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const bodySchema = z
        .object({
          name: z.string().min(3).max(120).optional(),
          startTime: z.string().datetime({ offset: true }).optional(),
          startedAt: z.string().datetime({ offset: true }).nullable().optional(),
          endedAt: z.string().datetime({ offset: true }).nullable().optional(),
          targetZones: z.array(z.string().min(1)).optional(),
          targetBosses: z.array(z.string().min(1)).optional(),
          notes: z.string().max(2000).nullable().optional(),
          isActive: z.boolean().optional()
        })
        .refine((value) => Object.keys(value).length > 0, {
          message: 'No fields provided for update.'
        });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        const updated = await updateRaidEventByAdmin(raidId, {
          ...parsed.data,
          startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : undefined,
          startedAt:
            parsed.data.startedAt !== undefined
              ? parsed.data.startedAt
                ? new Date(parsed.data.startedAt)
                : null
              : undefined,
          endedAt:
            parsed.data.endedAt !== undefined
              ? parsed.data.endedAt
                ? new Date(parsed.data.endedAt)
                : null
              : undefined
        });
        return { raid: updated };
      } catch (error) {
        request.log.error({ error }, 'Failed to update raid event as admin.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to update raid event.');
      }
    }
  );

  server.delete(
    '/raids/:raidId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        await deleteRaidEventByAdmin(raidId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete raid event.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to delete raid event.');
      }
    }
  );

  // Loot Management Routes
  server.get(
    '/loot-management/summary',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const summary = await getLootManagementSummary();
        return { summary };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch loot management summary.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch loot management summary.');
      }
    }
  );

  server.get(
    '/loot-management/loot-master',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
        search: z.string().optional()
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await fetchLootMaster(parsed.data.page, parsed.data.pageSize, parsed.data.search);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch loot master data.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch loot master data.');
      }
    }
  );

  server.get(
    '/loot-management/lc-items',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
        search: z.string().optional()
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await fetchLcItems(parsed.data.page, parsed.data.pageSize, parsed.data.search);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch LC items data.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch LC items data.');
      }
    }
  );

  server.get(
    '/loot-management/lc-requests',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
        search: z.string().optional()
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await fetchLcRequests(parsed.data.page, parsed.data.pageSize, parsed.data.search);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch LC requests data.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch LC requests data.');
      }
    }
  );

  server.get(
    '/loot-management/lc-votes',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
        search: z.string().optional()
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await fetchLcVotes(parsed.data.page, parsed.data.pageSize, parsed.data.search);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch LC votes data.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch LC votes data.');
      }
    }
  );

  // Server Connections Route
  server.get(
    '/connections',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const [connections, ipExemptions] = await Promise.all([
          fetchServerConnections(),
          fetchIpExemptions()
        ]);
        return { connections, ipExemptions };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch server connections.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch server connections.');
      }
    }
  );

  // Player Event Logs Routes
  server.get(
    '/player-event-logs',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(50),
        characterName: z.string().optional(),
        eventTypes: z.string().optional().transform((val) => {
          if (!val) return undefined;
          return val.split(',').map(Number).filter((n) => !Number.isNaN(n));
        }),
        zoneId: z.coerce.number().int().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sortBy: z.enum(['created_at', 'character_name', 'event_type_id', 'zone_id']).optional().default('created_at'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        search: z.string().optional()
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await fetchPlayerEventLogs(parsed.data);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch player event logs.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch player event logs.');
      }
    }
  );

  server.get(
    '/player-event-logs/stats',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const stats = await getPlayerEventLogStats();
        return { stats };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch player event log stats.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch player event log stats.');
      }
    }
  );

  server.get(
    '/player-event-logs/event-types',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      const eventTypes = getEventTypes();
      return { eventTypes };
    }
  );

  server.get(
    '/player-event-logs/zones',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const zones = await getEventLogZones();
        return { zones };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch player event log zones.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch player event log zones.');
      }
    }
  );

  // Character Admin Routes

  // Search characters (for adding manual associations)
  server.get(
    '/characters/search',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        q: z.string().min(2).max(100)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Search query must be at least 2 characters.');
      }

      try {
        const characters = await searchCharacters(parsed.data.q);
        return { characters };
      } catch (error) {
        request.log.error({ error }, 'Failed to search characters.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to search characters.');
      }
    }
  );

  // Get character by name
  server.get(
    '/characters/:name',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        name: z.string().min(1).max(100)
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character name.');
      }

      try {
        const character = await getCharacterByName(parsed.data.name);
        if (!character) {
          return reply.notFound('Character not found.');
        }
        return { character };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch character.');
      }
    }
  );

  // Get character by ID
  server.get(
    '/characters/id/:id',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character ID.');
      }

      try {
        const character = await getCharacterById(parsed.data.id);
        if (!character) {
          return reply.notFound('Character not found.');
        }
        return { character };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch character.');
      }
    }
  );

  // Get character events
  server.get(
    '/characters/id/:id/events',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });
      const querySchema = z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
        eventTypes: z.string().optional().transform((val) => {
          if (!val) return undefined;
          return val.split(',').map(Number).filter((n) => !Number.isNaN(n));
        }),
        zoneId: z.coerce.number().int().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sortBy: z.enum(['created_at', 'character_name', 'event_type_id', 'zone_id']).optional().default('created_at'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
      });

      const parsedParams = paramsSchema.safeParse(request.params);
      const parsedQuery = querySchema.safeParse(request.query);

      if (!parsedParams.success) {
        return reply.badRequest('Invalid character ID.');
      }
      if (!parsedQuery.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const result = await getCharacterEvents(parsedParams.data.id, parsedQuery.data);
        return result;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character events.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch character events.');
      }
    }
  );

  // Get character associates
  server.get(
    '/characters/id/:id/associates',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character ID.');
      }

      try {
        const associates = await getCharacterAssociates(parsed.data.id);
        return { associates };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character associates.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch character associates.');
      }
    }
  );

  // Add manual association
  server.post(
    '/characters/id/:id/associates',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });
      const bodySchema = z.object({
        targetCharacterId: z.number().int().positive(),
        reason: z.string().max(500).optional()
      });

      const parsedParams = paramsSchema.safeParse(request.params);
      const parsedBody = bodySchema.safeParse(request.body);

      if (!parsedParams.success) {
        return reply.badRequest('Invalid character ID.');
      }
      if (!parsedBody.success) {
        return reply.badRequest('Invalid request body.');
      }

      try {
        // Get user info for tracking who created the association
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { displayName: true, nickname: true }
        });
        const userName = user?.nickname || user?.displayName || 'Unknown Admin';

        await addManualAssociation(
          parsedParams.data.id,
          parsedBody.data.targetCharacterId,
          parsedBody.data.reason,
          request.user.userId,
          userName
        );
        return reply.code(201).send({ success: true });
      } catch (error) {
        request.log.error({ error }, 'Failed to add manual association.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to add manual association.');
      }
    }
  );

  // Get character corpses
  server.get(
    '/characters/id/:id/corpses',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character ID.');
      }

      try {
        const corpses = await getCharacterCorpses(parsed.data.id);
        return { corpses };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character corpses.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch character corpses.');
      }
    }
  );

  // Remove manual association
  server.delete(
    '/character-associations/:id',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.string()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid association ID.');
      }

      try {
        await removeManualAssociation(parsed.data.id);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove manual association.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to remove manual association.');
      }
    }
  );

  // Get account info
  server.get(
    '/accounts/:id',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid account ID.');
      }

      try {
        const account = await getAccountInfo(parsed.data.id);
        if (!account) {
          return reply.notFound('Account not found.');
        }
        return { account };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch account info.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch account info.');
      }
    }
  );

  // Get account notes
  server.get(
    '/accounts/:id/notes',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid account ID.');
      }

      try {
        const notes = await getAccountNotes(parsed.data.id);
        return { notes };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch account notes.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch account notes.');
      }
    }
  );

  // Create account note
  server.post(
    '/accounts/:id/notes',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.coerce.number().int().positive()
      });
      const bodySchema = z.object({
        content: z.string().min(1).max(10000)
      });

      const parsedParams = paramsSchema.safeParse(request.params);
      const parsedBody = bodySchema.safeParse(request.body);

      if (!parsedParams.success) {
        return reply.badRequest('Invalid account ID.');
      }
      if (!parsedBody.success) {
        return reply.badRequest('Invalid note content.');
      }

      try {
        // Get user info for tracking who created the note
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { displayName: true, nickname: true }
        });
        const userName = user?.nickname || user?.displayName || 'Unknown Admin';

        const note = await createAccountNote(
          parsedParams.data.id,
          parsedBody.data.content,
          request.user.userId,
          userName
        );
        return reply.code(201).send({ note });
      } catch (error) {
        request.log.error({ error }, 'Failed to create account note.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to create account note.');
      }
    }
  );

  // Update account note
  server.patch(
    '/account-notes/:id',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.string()
      });
      const bodySchema = z.object({
        content: z.string().min(1).max(10000)
      });

      const parsedParams = paramsSchema.safeParse(request.params);
      const parsedBody = bodySchema.safeParse(request.body);

      if (!parsedParams.success) {
        return reply.badRequest('Invalid note ID.');
      }
      if (!parsedBody.success) {
        return reply.badRequest('Invalid note content.');
      }

      try {
        const note = await updateAccountNote(parsedParams.data.id, parsedBody.data.content);
        return { note };
      } catch (error) {
        request.log.error({ error }, 'Failed to update account note.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to update account note.');
      }
    }
  );

  // Delete account note
  server.delete(
    '/account-notes/:id',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        id: z.string()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid note ID.');
      }

      try {
        await deleteAccountNote(parsed.data.id);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete account note.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to delete account note.');
      }
    }
  );

  // ============================================
  // Character Watch List Endpoints
  // ============================================

  // Get all watched characters
  server.get(
    '/character-watch',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const watchList = await prisma.characterWatch.findMany({
          orderBy: { createdAt: 'desc' }
        });
        return { watchList };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch character watch list.');
        return reply.badRequest('Unable to fetch character watch list.');
      }
    }
  );

  // Check if a specific character is watched
  server.get(
    '/character-watch/:characterId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        characterId: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character ID.');
      }

      try {
        const watch = await prisma.characterWatch.findUnique({
          where: { eqCharacterId: parsed.data.characterId }
        });
        return { isWatched: !!watch, watch };
      } catch (error) {
        request.log.error({ error }, 'Failed to check character watch status.');
        return reply.badRequest('Unable to check character watch status.');
      }
    }
  );

  // Add character to watch list
  server.post(
    '/character-watch',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        characterId: z.number().int().positive(),
        characterName: z.string().min(1).max(191),
        accountId: z.number().int().positive()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid request body.');
      }

      try {
        // Get user info for audit trail
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { displayName: true }
        });

        if (!user) {
          return reply.badRequest('User not found.');
        }

        const watch = await prisma.characterWatch.create({
          data: {
            eqCharacterId: parsed.data.characterId,
            eqCharacterName: parsed.data.characterName,
            eqAccountId: parsed.data.accountId,
            createdById: request.user.userId,
            createdByName: user.displayName
          }
        });

        return { watch };
      } catch (error) {
        // Handle unique constraint violation (already watched)
        if (error instanceof Error && error.message.includes('Unique constraint')) {
          return reply.badRequest('Character is already on the watch list.');
        }
        request.log.error({ error }, 'Failed to add character to watch list.');
        return reply.badRequest('Unable to add character to watch list.');
      }
    }
  );

  // Remove character from watch list
  server.delete(
    '/character-watch/:characterId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        characterId: z.coerce.number().int().positive()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid character ID.');
      }

      try {
        await prisma.characterWatch.delete({
          where: { eqCharacterId: parsed.data.characterId }
        });
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to remove character from watch list.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to remove character from watch list.');
      }
    }
  );
}
