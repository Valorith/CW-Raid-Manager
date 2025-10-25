import { FastifyInstance } from 'fastify';
import { GuildRole } from '@prisma/client';

import { updateGuildMemberRole, getGuildById, listGuilds } from '../services/guildService.js';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  canManageGuild,
  createGuild,
  getUserGuildRole
} from '../services/guildService.js';
import { prisma } from '../utils/prisma.js';
import {
  applyToGuild,
  withdrawApplication,
  listPendingApplicationsForGuild,
  approveApplication,
  denyApplication,
  getPendingApplicationForUser
} from '../services/guildApplicationService.js';
import { detachUserCharactersFromGuild } from '../services/characterService.js';
import {
  DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS,
  DEFAULT_MENTION_SUBSCRIPTIONS,
  DISCORD_WEBHOOK_EVENT_DEFINITIONS,
  DISCORD_WEBHOOK_EVENT_KEYS,
  listGuildDiscordWebhooks,
  createGuildDiscordWebhook,
  updateGuildDiscordWebhook,
  deleteGuildDiscordWebhook
} from '../services/discordWebhookService.js';

export async function guildRoutes(server: FastifyInstance): Promise<void> {
  server.get('/', async () => {
    const guilds = await listGuilds();
    return { guilds };
  });

  server.get('/applications/me', { preHandler: [authenticate] }, async (request) => {
    const application = await getPendingApplicationForUser(request.user.userId);
    return { application };
  });

  server.get('/:guildId', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    let viewerUserId: string | null = null;
    try {
      await request.jwtVerify();
      viewerUserId = request.user.userId;
    } catch (error) {
      // optional auth
    }

    const guild = await getGuildById(guildId, { viewerUserId });

    if (!guild) {
      return reply.notFound('Guild not found.');
    }

    return { guild };
  });

  server.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(3).max(100),
      description: z.string().max(500).optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid guild data submitted.');
    }

    const userId = request.user.userId;
    const guild = await createGuild({
      name: parsed.data.name,
      description: parsed.data.description,
      creatorUserId: userId
    });

    return reply.code(201).send({ guild });
  });

  server.patch('/:guildId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string()
    });
    const params = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      name: z.string().min(3).max(100).optional(),
      description: z.string().max(500).optional()
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest('Invalid update payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, params.guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('Insufficient permissions to update this guild.');
    }

    const guild = await prisma.guild.update({
      where: { id: params.guildId },
      data: {
        name: body.data.name,
        description: body.data.description
      }
    });

    return { guild };
  });

  server.get('/:guildId/webhooks', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !(membership.role === GuildRole.LEADER || membership.role === GuildRole.OFFICER)) {
      return reply.forbidden('Only guild leaders or officers can view webhook settings.');
    }

    const webhooks = await listGuildDiscordWebhooks(guildId);

    return {
      webhooks,
      eventDefinitions: DISCORD_WEBHOOK_EVENT_DEFINITIONS,
      defaultEventSubscriptions: DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS,
      defaultMentionSubscriptions: DEFAULT_MENTION_SUBSCRIPTIONS
    };
  });

  server.post('/:guildId/webhooks', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      label: z.string().min(2).max(120),
      webhookUrl: z.union([z.string().url().max(512), z.literal('')]).optional().nullable(),
      isEnabled: z.boolean().optional(),
      usernameOverride: z.union([z.string().max(120), z.literal('')]).optional().nullable(),
      avatarUrl: z.union([z.string().url().max(512), z.literal('')]).optional().nullable(),
      mentionRoleId: z.union([z.string().max(120), z.literal('')]).optional().nullable(),
      eventSubscriptions: z.record(z.enum(DISCORD_WEBHOOK_EVENT_KEYS), z.boolean()).optional(),
      mentionSubscriptions: z.record(z.enum(DISCORD_WEBHOOK_EVENT_KEYS), z.boolean()).optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid webhook payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !(membership.role === GuildRole.LEADER || membership.role === GuildRole.OFFICER)) {
      return reply.forbidden('Only guild leaders or officers can manage webhooks.');
    }

    const sanitizedWebhookUrl = (parsed.data.webhookUrl ?? '').trim();
    if ((parsed.data.isEnabled ?? false) && sanitizedWebhookUrl.length === 0) {
      return reply.badRequest('Webhook URL is required when enabling Discord notifications.');
    }

    try {
      const webhook = await createGuildDiscordWebhook(guildId, {
        ...parsed.data,
        webhookUrl: sanitizedWebhookUrl.length > 0 ? sanitizedWebhookUrl : null,
        usernameOverride: (parsed.data.usernameOverride ?? '').trim() || null,
        avatarUrl: (parsed.data.avatarUrl ?? '').trim() || null,
        mentionRoleId: (parsed.data.mentionRoleId ?? '').trim() || null
      });

      return reply.code(201).send({ webhook });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Webhook URL is required when enabling Discord notifications.'
      ) {
        return reply.badRequest(error.message);
      }
      throw error;
    }
  });

  server.put('/:guildId/webhooks/:webhookId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), webhookId: z.string() });
    const { guildId, webhookId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      label: z.string().min(2).max(120).optional(),
      webhookUrl: z.union([z.string().url().max(512), z.literal('')]).optional().nullable(),
      isEnabled: z.boolean().optional(),
      usernameOverride: z.union([z.string().max(120), z.literal('')]).optional().nullable(),
      avatarUrl: z.union([z.string().url().max(512), z.literal('')]).optional().nullable(),
      mentionRoleId: z.union([z.string().max(120), z.literal('')]).optional().nullable(),
      eventSubscriptions: z.record(z.enum(DISCORD_WEBHOOK_EVENT_KEYS), z.boolean()).optional(),
      mentionSubscriptions: z.record(z.enum(DISCORD_WEBHOOK_EVENT_KEYS), z.boolean()).optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid webhook payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !(membership.role === GuildRole.LEADER || membership.role === GuildRole.OFFICER)) {
      return reply.forbidden('Only guild leaders or officers can manage webhooks.');
    }

    const sanitizedWebhookUrl =
      parsed.data.webhookUrl === undefined ? undefined : parsed.data.webhookUrl?.trim() ?? '';
    if (parsed.data.isEnabled === true && sanitizedWebhookUrl !== undefined && sanitizedWebhookUrl.length === 0) {
      return reply.badRequest('Webhook URL is required when enabling Discord notifications.');
    }

    try {
      const webhook = await updateGuildDiscordWebhook(webhookId, guildId, {
        ...parsed.data,
        webhookUrl:
          sanitizedWebhookUrl === undefined
            ? undefined
            : sanitizedWebhookUrl.length > 0
              ? sanitizedWebhookUrl
              : null,
        usernameOverride:
          parsed.data.usernameOverride === undefined
            ? undefined
            : (parsed.data.usernameOverride ?? '').trim() || null,
        avatarUrl:
          parsed.data.avatarUrl === undefined
            ? undefined
            : (parsed.data.avatarUrl ?? '').trim() || null,
        mentionRoleId:
          parsed.data.mentionRoleId === undefined
            ? undefined
            : (parsed.data.mentionRoleId ?? '').trim() || null
      });

      return { webhook };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Webhook not found.') {
          return reply.notFound(error.message);
        }
        if (error.message === 'Webhook URL is required when enabling Discord notifications.') {
          return reply.badRequest(error.message);
        }
      }
      throw error;
    }
  });

  server.delete('/:guildId/webhooks/:webhookId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), webhookId: z.string() });
    const { guildId, webhookId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !(membership.role === GuildRole.LEADER || membership.role === GuildRole.OFFICER)) {
      return reply.forbidden('Only guild leaders or officers can manage webhooks.');
    }

    try {
      await deleteGuildDiscordWebhook(webhookId, guildId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Webhook not found.') {
        return reply.notFound(error.message);
      }
      throw error;
    }
  });


  server.patch(
    '/:guildId/members/:memberId/role',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        memberId: z.string()
      });
      const { guildId, memberId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        role: z.nativeEnum(GuildRole)
      });
      const parsedBody = bodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.badRequest('Invalid role update payload.');
      }

      try {
        const membership = await updateGuildMemberRole({
          actorUserId: request.user.userId,
          guildId,
          targetUserId: memberId,
          newRole: parsedBody.data.role
        });

        return { membership };
      } catch (error) {
        request.log.warn({ error }, 'Failed to update guild member role.');
        if (error instanceof Error) {
          if (error.message === 'Guild not found.' || error.message === 'Membership not found.') {
            return reply.notFound(error.message);
          }
          return reply.forbidden(error.message);
        }

        return reply.badRequest('Unable to update member role.');
      }
    }
  );

  server.post('/:guildId/memberships', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string()
    });
    const params = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      userId: z.string(),
      role: z.nativeEnum(GuildRole)
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest('Invalid membership payload.');
    }

    const actorMembership = await getUserGuildRole(request.user.userId, params.guildId);
    if (!actorMembership || actorMembership.role === GuildRole.MEMBER) {
      return reply.forbidden('Insufficient permissions to modify memberships.');
    }

    if (
      body.data.role === GuildRole.LEADER &&
      actorMembership.role !== GuildRole.LEADER
    ) {
      return reply.forbidden('Only guild leaders can promote other leaders.');
    }

    const membership = await prisma.guildMembership.upsert({
      where: {
        guildId_userId: {
          guildId: params.guildId,
          userId: body.data.userId
        }
      },
      update: {
        role: body.data.role
      },
      create: {
        guildId: params.guildId,
        userId: body.data.userId,
        role: body.data.role
      }
    });

    return reply.code(201).send({ membership });
  });

  server.delete(
    '/:guildId/members/:memberId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        memberId: z.string()
      });
      const { guildId, memberId } = paramsSchema.parse(request.params);

      const actorMembership = await getUserGuildRole(request.user.userId, guildId);
      if (!actorMembership || (actorMembership.role !== GuildRole.LEADER && actorMembership.role !== GuildRole.OFFICER)) {
        return reply.forbidden('Only guild leaders or officers can remove members.');
      }

      const targetMembership = await prisma.guildMembership.findUnique({
        where: {
          guildId_userId: {
            guildId,
            userId: memberId
          }
        }
      });

      if (!targetMembership) {
        return reply.notFound('Membership not found.');
      }

      if (targetMembership.role === GuildRole.LEADER && actorMembership.role !== GuildRole.LEADER) {
        return reply.forbidden('Only the guild leader can remove another leader.');
      }

      if (targetMembership.role === GuildRole.OFFICER && actorMembership.role !== GuildRole.LEADER) {
        return reply.forbidden('Only the guild leader can remove officers.');
      }

      await prisma.guildMembership.delete({
        where: {
          guildId_userId: {
            guildId,
            userId: memberId
          }
        }
      });

      await detachUserCharactersFromGuild(guildId, memberId);

      return reply.code(204).send();
    }
  );

  server.post('/:guildId/applications', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string()
    });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      const application = await applyToGuild(guildId, request.user.userId);
      return reply.code(201).send({ application });
    } catch (error) {
      request.log.warn({ error }, 'Failed to apply to guild.');
      if (error instanceof Error) {
        return reply.badRequest(error.message);
      }

      return reply.badRequest('Unable to submit application.');
    }
  });

  server.delete('/:guildId/applications', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await withdrawApplication(guildId, request.user.userId);
      return reply.code(204).send();
    } catch (error) {
      request.log.warn({ error }, 'Failed to withdraw guild application.');
      if (error instanceof Error) {
        return reply.badRequest(error.message);
      }

      return reply.badRequest('Unable to withdraw application.');
    }
  });

  server.get('/:guildId/applications', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
      return reply.forbidden('Insufficient permissions to view applications.');
    }

    const applications = await listPendingApplicationsForGuild(guildId);
    return { applications };
  });

  server.post(
    '/:guildId/applications/:applicationId/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        applicationId: z.string()
      });
      const { applicationId } = paramsSchema.parse(request.params);

      try {
        await approveApplication(applicationId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.warn({ error }, 'Failed to approve guild application.');
        if (error instanceof Error) {
          if (error.message === 'Application not found.') {
            return reply.notFound(error.message);
          }
          return reply.forbidden(error.message);
        }

        return reply.badRequest('Unable to approve application.');
      }
    }
  );

  server.post(
    '/:guildId/applications/:applicationId/deny',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({
        guildId: z.string(),
        applicationId: z.string()
      });
      const { applicationId } = paramsSchema.parse(request.params);

      try {
        await denyApplication(applicationId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        request.log.warn({ error }, 'Failed to deny guild application.');
        if (error instanceof Error) {
          if (error.message === 'Application not found.') {
            return reply.notFound(error.message);
          }
          return reply.forbidden(error.message);
        }

        return reply.badRequest('Unable to deny application.');
      }
    }
  );
}
