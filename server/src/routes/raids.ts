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
  emitRaidCreatedWebhook,
  endRaidEvent,
  restartRaidEvent,
  deleteRaidEvent,
  ensureCanManageRaid
} from '../services/raidService.js';
import { canManageGuild } from '../services/guildService.js';
import { getActiveLootMonitorSession } from '../services/logMonitorService.js';
import {
  listRaidSignups,
  replaceRaidSignupsForUser,
  RaidSignupLimitError,
  RaidSignupInvalidCharacterError,
  RaidSignupPermissionError,
  RaidSignupLockedError,
  RaidSignupNotFoundError,
  RaidSignupCharacterNotFoundError,
  RaidSignupAlreadyExistsError,
  updateSignupStatus,
  removeSignup,
  addSignupForCharacter,
  searchGuildCharactersForSignup
} from '../services/raidSignupService.js';
import { recordRaidNpcKills, deleteRaidNpcKillEvents } from '../services/raidNpcKillService.js';
import { prisma } from '../utils/prisma.js';

export async function raidsRoutes(server: FastifyInstance): Promise<void> {
  const recurrenceSchema = z
    .object({
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
      interval: z.number().int().min(1).max(52),
      endDate: z.string().datetime({ offset: true }).nullable().optional(),
      isActive: z.boolean().optional()
    })
    .strict();

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

      const signupEntrySchema = z.object({
        characterId: z.string(),
        status: z.enum(['CONFIRMED', 'NOT_ATTENDING']).optional()
      });

      const bodySchema = z.object({
        signups: z.array(signupEntrySchema)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid signup payload.');
      }

      try {
        const signups = await replaceRaidSignupsForUser(
          raidId,
          request.user.userId,
          parsed.data.signups
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
        if (error instanceof RaidSignupLockedError) {
          return reply.badRequest(error.message);
        }
        if (error instanceof Error && error.message === 'Raid event not found.') {
          return reply.notFound(error.message);
        }

        request.log.warn({ error }, 'Failed to update raid signups.');
        return reply.internalServerError('Unable to update raid signups.');
      }
    }
  );

  // Admin: Update a signup's status
  server.patch(
    '/:raidId/signups/:signupId',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string(),
        signupId: z.string()
      });
      const { raidId, signupId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        status: z.enum(['CONFIRMED', 'NOT_ATTENDING'])
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid status. Must be CONFIRMED or NOT_ATTENDING.');
      }

      // Verify admin permissions
      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });

      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      try {
        await ensureCanManageRaid(request.user.userId, raid.guildId);
      } catch (error) {
        return reply.forbidden('You do not have permission to manage signups for this raid.');
      }

      try {
        const signups = await updateSignupStatus(raidId, signupId, parsed.data.status);
        return { signups };
      } catch (error) {
        if (error instanceof RaidSignupNotFoundError) {
          return reply.notFound(error.message);
        }
        if (error instanceof RaidSignupLockedError) {
          return reply.badRequest(error.message);
        }
        request.log.warn({ error }, 'Failed to update signup status.');
        return reply.internalServerError('Unable to update signup status.');
      }
    }
  );

  // Admin: Remove a signup
  server.delete(
    '/:raidId/signups/:signupId',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string(),
        signupId: z.string()
      });
      const { raidId, signupId } = paramsSchema.parse(request.params);

      // Verify admin permissions
      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });

      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      try {
        await ensureCanManageRaid(request.user.userId, raid.guildId);
      } catch (error) {
        return reply.forbidden('You do not have permission to manage signups for this raid.');
      }

      try {
        const signups = await removeSignup(raidId, signupId);
        return { signups };
      } catch (error) {
        if (error instanceof RaidSignupNotFoundError) {
          return reply.notFound(error.message);
        }
        if (error instanceof RaidSignupLockedError) {
          return reply.badRequest(error.message);
        }
        request.log.warn({ error }, 'Failed to remove signup.');
        return reply.internalServerError('Unable to remove signup.');
      }
    }
  );

  // Admin: Add a character to a raid signup
  server.post(
    '/:raidId/signups',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        characterId: z.string(),
        status: z.enum(['CONFIRMED', 'NOT_ATTENDING']).optional()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid request body.');
      }

      // Verify admin permissions
      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });

      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      try {
        await ensureCanManageRaid(request.user.userId, raid.guildId);
      } catch (error) {
        return reply.forbidden('You do not have permission to manage signups for this raid.');
      }

      try {
        const signups = await addSignupForCharacter(
          raidId,
          parsed.data.characterId,
          parsed.data.status ?? 'CONFIRMED'
        );
        return { signups };
      } catch (error) {
        if (error instanceof RaidSignupCharacterNotFoundError) {
          return reply.notFound(error.message);
        }
        if (error instanceof RaidSignupAlreadyExistsError) {
          return reply.badRequest(error.message);
        }
        if (error instanceof RaidSignupLockedError) {
          return reply.badRequest(error.message);
        }
        request.log.warn({ error }, 'Failed to add signup.');
        return reply.internalServerError('Unable to add signup.');
      }
    }
  );

  // Admin: Search characters for signup
  server.get(
    '/:raidId/signups/search',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const querySchema = z.object({
        q: z.string().min(2).max(64)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Search query must be between 2 and 64 characters.');
      }

      // Verify admin permissions
      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });

      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      try {
        await ensureCanManageRaid(request.user.userId, raid.guildId);
      } catch (error) {
        return reply.forbidden('You do not have permission to search characters for this raid.');
      }

      try {
        const characters = await searchGuildCharactersForSignup(
          raid.guildId,
          raidId,
          parsed.data.q
        );
        return { characters };
      } catch (error) {
        request.log.warn({ error }, 'Failed to search characters.');
        return reply.internalServerError('Unable to search characters.');
      }
    }
  );

  server.post(
    '/:raidId/npc-kills',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const killsSchema = z.array(
        z.object({
          npcName: z.string().min(2).max(191),
          occurredAt: z.string().datetime({ offset: true }),
          killerName: z.string().min(1).max(191).optional(),
          rawLine: z.string().max(500).optional()
        })
      );

      const bodySchema = z.object({
        kills: killsSchema.max(500)
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid NPC kill payload.');
      }

      if (parsed.data.kills.length === 0) {
        return { inserted: 0 };
      }

      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });
      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      await ensureCanManageRaid(request.user.userId, raid.guildId);

      const normalizedKills = parsed.data.kills
        .map((kill) => {
          const occurredAt = new Date(kill.occurredAt);
          if (Number.isNaN(occurredAt.getTime())) {
            return null;
          }
          const npcName = kill.npcName.trim();
          if (!npcName) {
            return null;
          }
          return {
            npcName,
            occurredAt,
            killerName: kill.killerName?.trim() ?? null,
            rawLine: kill.rawLine ?? null
          };
        })
        .filter((kill): kill is NonNullable<typeof kill> => Boolean(kill));

      if (normalizedKills.length === 0) {
        return { inserted: 0 };
      }

      const result = await recordRaidNpcKills(raidId, raid.guildId, normalizedKills, request.log);
      return { inserted: result.inserted };
    }
  );

  server.delete(
    '/:raidId/npc-kills',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: { guildId: true }
      });
      if (!raid) {
        return reply.notFound('Raid event not found.');
      }

      await ensureCanManageRaid(request.user.userId, raid.guildId);
      await deleteRaidNpcKillEvents(raidId, raid.guildId);
      return reply.code(204).send();
    }
  );

  const targetsArraySchema = z
    .array(z.string())
    .optional()
    .transform((value) => {
      if (!value) {
        return [] as string[];
      }
      return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
    });

  const optionalTargetsArraySchema = z
    .array(z.string())
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
    });

  server.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const bodySchema = z.object({
      guildId: z.string(),
      name: z.string().min(3).max(120),
      startTime: z.string().datetime({ offset: true }),
      startedAt: z.string().datetime({ offset: true }).optional(),
      endedAt: z.string().datetime({ offset: true }).optional(),
      targetZones: targetsArraySchema,
      targetBosses: targetsArraySchema,
      notes: z.string().max(2000).optional(),
      discordVoiceUrl: z.union([z.string().url().max(512), z.literal('')]).optional(),
      recurrence: z.union([recurrenceSchema, z.null()]).optional()
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
        createdById: request.user.userId,
        recurrence: parsed.data.recurrence
          ? {
              frequency: parsed.data.recurrence.frequency,
              interval: parsed.data.recurrence.interval,
              endDate: parsed.data.recurrence.endDate
                ? new Date(parsed.data.recurrence.endDate)
                : null
            }
          : null
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
        targetZones: optionalTargetsArraySchema,
        targetBosses: optionalTargetsArraySchema,
        notes: z.string().max(2000).optional(),
        isActive: z.boolean().optional(),
        discordVoiceUrl: z.union([z.string().url().max(512), z.literal(''), z.null()]).optional(),
        recurrence: z.union([recurrenceSchema, z.null()]).optional()
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
        discordVoiceUrl: parsed.data.discordVoiceUrl,
        recurrence:
          parsed.data.recurrence === undefined
            ? undefined
            : parsed.data.recurrence
              ? {
                  frequency: parsed.data.recurrence.frequency,
                  interval: parsed.data.recurrence.interval,
                  endDate: parsed.data.recurrence.endDate
                    ? new Date(parsed.data.recurrence.endDate)
                    : null,
                  isActive: parsed.data.recurrence.isActive
                }
              : null
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
    '/:raidId/announce',
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        raidId: z.string()
      });
      const { raidId } = paramsSchema.parse(request.params);

      try {
        await emitRaidCreatedWebhook(raidId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.warn({ error }, 'Failed to emit raid announcement.');
        if (error instanceof Error) {
          if (error.message === 'Raid event not found.') {
            return reply.notFound(error.message);
          }
          if (error.message.includes('Insufficient permissions')) {
            return reply.forbidden('You do not have permission to announce this raid.');
          }
          return reply.badRequest(error.message);
        }
        return reply.badRequest('Unable to announce raid.');
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

      const bodySchema = z
        .object({
          scope: z.enum(['EVENT', 'SERIES']).optional()
        })
        .optional();

      const parsedBody = bodySchema.parse(request.body ?? {});
      const scope = parsedBody?.scope ?? 'EVENT';

      try {
        await deleteRaidEvent(raidId, request.user.userId, scope);
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
