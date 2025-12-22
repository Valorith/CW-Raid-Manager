import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GuildRole } from '@prisma/client';
import { z } from 'zod';

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
import { fetchServerConnections } from '../services/connectionsService.js';

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
        const connections = await fetchServerConnections();
        return { connections };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch server connections.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to fetch server connections.');
      }
    }
  );
}
