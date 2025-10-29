import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  createRaidEvent,
  ensureUserCanViewGuild,
  getRaidEventById,
  listRaidEventsForGuild,
  updateRaidEvent,
  startRaidEvent,
  endRaidEvent,
  restartRaidEvent,
  deleteRaidEvent
} from '../services/raidService.js';
import { canManageGuild } from '../services/guildService.js';
import { getActiveLootMonitorSession } from '../services/logMonitorService.js';
import {
  listRaidSignups,
  replaceRaidSignupsForUser,
  RaidSignupLimitError,
  RaidSignupInvalidCharacterError,
  RaidSignupPermissionError
} from '../services/raidSignupService.js';

export async function raidsRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/guild/:guildId',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string()
      });
      const { guildId } = paramsSchema.parse(request.params);

      let membershipRole: Awaited<ReturnType<typeof ensureUserCanViewGuild>>;
      try {
        membershipRole = await ensureUserCanViewGuild(request.user.userId, guildId);
      } catch (error) {
        request.log.warn({ error }, 'User attempted unauthorized raid access.');
        return reply.forbidden('You are not a member of this guild.');
      }

      const raids = await listRaidEventsForGuild(guildId);
      const canManage = canManageGuild(membershipRole);

      const enrichedRaids = raids.map((raid) => {
        const session = getActiveLootMonitorSession(raid.id);
        return {
          ...raid,
          logMonitor: session
            ? {
                isActive: true,
                userId: session.userId,
                userDisplayName: session.userDisplayName,
                startedAt: session.startedAt.toISOString()
              }
            : null,
          permissions: {
            canManage,
            role: membershipRole
          }
        };
      });

      return {
        raids: enrichedRaids,
        permissions: {
          canManage,
          role: membershipRole
        }
      };
    }
  );

  server.get(
    '/:raidId',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const raid = await getRaidEventById(raidId);
      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      let membershipRole: Awaited<ReturnType<typeof ensureUserCanViewGuild>>;
      try {
        membershipRole = await ensureUserCanViewGuild(request.user.userId, raid.guildId);
      } catch (error) {
        request.log.warn({ error }, 'User attempted unauthorized raid access.');
        return reply.forbidden('You are not a member of this guild.');
      }

      const canManage = canManageGuild(membershipRole);

      const session = getActiveLootMonitorSession(raid.id);
      const signups = await listRaidSignups(raid.id);

      return {
        raid: {
          ...raid,
          signups,
          logMonitor: session
            ? {
                isActive: true,
                userId: session.userId,
                userDisplayName: session.userDisplayName,
                startedAt: session.startedAt.toISOString()
              }
            : null,
          permissions: {
            canManage,
            role: membershipRole
          }
        }
      };
    }
  );

  server.put(
    '/:raidId/signups/me',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        characterIds: z.array(z.string())
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid signup payload.');
      }

      try {
        const signups = await replaceRaidSignupsForUser(
          raidId,
          request.user.userId,
          parsed.data.characterIds
        );
        return { signups };
      } catch (error) {
        if (error instanceof RaidSignupLimitError) {
          return reply.badRequest(error.message);
        }
        if (error instanceof RaidSignupInvalidCharacterError) {
          return reply.badRequest(error.message);
        }
        if (error instanceof RaidSignupPermissionError) {
          return reply.forbidden(error.message);
        }
        if (error instanceof Error && error.message === 'Raid event not found.') {
          return reply.notFound(error.message);
        }

        request.log.warn({ error }, 'Failed to update raid signups.');
        return reply.internalServerError('Unable to update raid signups.');
      }
    }
  );

  server.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const bodySchema = z.object({
      guildId: z.string(),
      name: z.string().min(3).max(120),
      startTime: z.string().datetime({ offset: true }),
      startedAt: z.string().datetime({ offset: true }).optional(),
      endedAt: z.string().datetime({ offset: true }).optional(),
      targetZones: z.array(z.string().min(1)).min(1),
      targetBosses: z.array(z.string().min(1)).min(1),
      notes: z.string().max(2000).optional(),
      discordVoiceUrl: z.union([z.string().url().max(512), z.literal('')]).optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid raid payload.');
    }

    try {
      const raid = await createRaidEvent({
        guildId: parsed.data.guildId,
        name: parsed.data.name,
        startTime: new Date(parsed.data.startTime),
        startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : undefined,
        endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : undefined,
        targetZones: parsed.data.targetZones,
        targetBosses: parsed.data.targetBosses,
        notes: parsed.data.notes,
        discordVoiceUrl: parsed.data.discordVoiceUrl,
        createdById: request.user.userId
      });

      return reply.code(201).send({ raid });
    } catch (error) {
      request.log.warn({ error }, 'Failed to create raid event.');
      return reply.forbidden('You do not have permission to create raid events for this guild.');
    }
  });

  server.patch('/:raidId', { preHandler: [authenticate] }, async (request, reply) => {
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
        targetZones: z.array(z.string().min(1)).min(1).optional(),
        targetBosses: z.array(z.string().min(1)).min(1).optional(),
        notes: z.string().max(2000).optional(),
        isActive: z.boolean().optional(),
        discordVoiceUrl: z.union([z.string().url().max(512), z.literal(''), z.null()]).optional()
      })
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one field must be updated.'
      });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    try {
      const raid = await updateRaidEvent(raidId, request.user.userId, {
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
            : undefined,
        discordVoiceUrl: parsed.data.discordVoiceUrl
      });
      return { raid };
    } catch (error) {
      request.log.warn({ error }, 'Failed to update raid event.');
      return reply.forbidden('You do not have permission to modify this raid event.');
    }
  });

  server.post(
    '/:raidId/start',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        const raid = await startRaidEvent(raidId, request.user.userId);
        return { raid };
      } catch (error) {
        request.log.warn({ error }, 'Failed to start raid event.');
        if (error instanceof Error) {
          if (error.message === 'Raid event not found.') {
            return reply.notFound(error.message);
          }
          if (error.message.includes('Insufficient permissions')) {
            return reply.forbidden('You do not have permission to start this raid.');
          }
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to start raid.');
      }
    }
  );

  server.post(
    '/:raidId/end',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        const raid = await endRaidEvent(raidId, request.user.userId);
        return { raid };
      } catch (error) {
        request.log.warn({ error }, 'Failed to end raid event.');
        if (error instanceof Error) {
          if (error.message === 'Raid event not found.') {
            return reply.notFound(error.message);
          }
          if (error.message.includes('Insufficient permissions')) {
            return reply.forbidden('You do not have permission to end this raid.');
          }
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to end raid.');
      }
    }
  );

  server.post(
    '/:raidId/restart',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        const raid = await restartRaidEvent(raidId, request.user.userId);
        return { raid };
      } catch (error) {
        request.log.warn({ error }, 'Failed to restart raid event.');
        if (error instanceof Error) {
          if (error.message === 'Raid event not found.') {
            return reply.notFound(error.message);
          }
          if (error.message === 'Raid has not been ended.') {
            return reply.badRequest('Raid must be ended before it can be restarted.');
          }
          if (error.message.includes('Insufficient permissions')) {
            return reply.forbidden('You do not have permission to restart this raid.');
          }
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to restart raid.');
      }
    }
  );

  server.delete(
    '/:raidId',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        await deleteRaidEvent(raidId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.warn({ error }, 'Failed to delete raid event.');
        if (error instanceof Error) {
          if (error.message === 'Raid event not found.') {
            return reply.notFound(error.message);
          }
          if (error.message.includes('Insufficient permissions')) {
            return reply.forbidden('You do not have permission to delete this raid.');
          }
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to delete raid.');
      }
    }
  );
}
