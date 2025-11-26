import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { getUserGuildRole } from '../services/guildService.js';
import {
  addGuildBankCharacter,
  fetchGuildBankSnapshot,
  listGuildBankCharacters,
  removeGuildBankCharacter
} from '../services/guildBankService.js';
import { ensureUserCanViewGuild } from '../services/raidService.js';
import { isDiscordWebhookEventEnabled, emitDiscordWebhookEvent } from '../services/discordWebhookService.js';
import { prisma } from '../utils/prisma.js';
import { withPreferredDisplayName } from '../utils/displayName.js';

export async function guildBankRoutes(server: FastifyInstance): Promise<void> {
  server.get('/:guildId/guild-bank', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch (error) {
      request.log.warn({ error }, 'Unauthorized guild bank access attempt.');
      return reply.forbidden('You must be a member of this guild to view the guild bank.');
    }

    try {
      const snapshot = await fetchGuildBankSnapshot(guildId);
      return {
        characters: snapshot.characters,
        items: snapshot.items,
        missingCharacters: snapshot.missingCharacters
      };
    } catch (error) {
      if (
        error instanceof Error &&
        /EQ content database is not configured/i.test(error.message ?? '')
      ) {
        return reply
          .serviceUnavailable(
            'EQ database is not configured; set EQ_DB_* environment variables to enable guild bank lookups.'
          );
      }
      request.log.error({ err: error, guildId }, 'Failed to load guild bank snapshot.');
      return reply.internalServerError('Unable to load guild bank inventory. Please try again later.');
    }
  });

  server.get('/:guildId/guild-bank/characters', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch {
      return reply.forbidden('You must be a member of this guild to view guild bank characters.');
    }

    const characters = await listGuildBankCharacters(guildId);
    return { characters };
  });

  server.post('/:guildId/guild-bank/characters', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      name: z.string().trim().min(2).max(64)
    });
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('A valid character name is required.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to manage the guild bank.');
    }

    try {
      const character = await addGuildBankCharacter({
        guildId,
        name: parsedBody.data.name,
        actorRole: membership.role
      });
      return reply.code(201).send({ character });
    } catch (error) {
      if (error instanceof Error && /Insufficient permissions/i.test(error.message)) {
        return reply.forbidden('Only guild leaders or officers can manage guild bank characters.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.conflict('That guild bank character is already tracked.');
      }
      request.log.error({ err: error, guildId }, 'Failed to add guild bank character.');
      return reply.internalServerError('Unable to add guild bank character.');
    }
  });

  server.delete('/:guildId/guild-bank/characters/:characterId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), characterId: z.string() });
    const { guildId, characterId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to manage the guild bank.');
    }

    try {
      await removeGuildBankCharacter({
        guildId,
        characterId,
        actorRole: membership.role
      });
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && /Insufficient permissions/i.test(error.message)) {
        return reply.forbidden('Only guild leaders or officers can manage guild bank characters.');
      }
      request.log.warn({ err: error, guildId, characterId }, 'Failed to remove guild bank character.');
      return reply.notFound('Guild bank character not found.');
    }
  });

  server.post('/:guildId/guild-bank/request-items', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      items: z
        .array(
          z.object({
            itemId: z.number().int().positive().nullable().optional(),
            itemName: z.string().min(1).max(191),
            quantity: z.number().int().min(1)
          })
        )
        .min(1)
    });

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid request items payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to request items.');
    }
    if (membership.role === 'FRIENDS_FAMILY') {
      return reply.forbidden('Friends and family cannot request guild bank items.');
    }

    const webhookEnabled = await isDiscordWebhookEventEnabled(guildId, 'bank.requested');
    if (!webhookEnabled) {
      return reply.conflict('Bank request webhook is not enabled. Please enable it in Discord Webhook settings.');
    }

    const snapshot = await fetchGuildBankSnapshot(guildId);

    const availableByKey = new Map<
      string,
      { total: number; entries: typeof snapshot.items }
    >();

    for (const item of snapshot.items) {
      const key = item.itemId != null ? `id:${item.itemId}` : `name:${item.itemName.toLowerCase()}`;
      if (!availableByKey.has(key)) {
        availableByKey.set(key, { total: 0, entries: [] as typeof snapshot.items });
      }
      const bucket = availableByKey.get(key)!;
      bucket.total += item.charges && item.charges > 0 ? item.charges : 1;
      bucket.entries.push(item);
    }

    const allocations: Array<{
      itemId: number | null;
      itemName: string;
      itemIconId: number | null;
      quantity: number;
      sources: Array<{ characterName: string; location: string; quantity: number }>;
    }> = [];

    for (const requestItem of parsedBody.data.items) {
      const key =
        requestItem.itemId != null
          ? `id:${requestItem.itemId}`
          : `name:${requestItem.itemName.toLowerCase()}`;
      const bucket = availableByKey.get(key);
      if (!bucket || bucket.total < requestItem.quantity) {
        return reply.badRequest(
          `Insufficient quantity for ${requestItem.itemName} (requested ${requestItem.quantity}, available ${bucket?.total ?? 0}).`
        );
      }

      let remaining = requestItem.quantity;
      const sources: Array<{ characterName: string; location: string; quantity: number }> = [];
      for (const entry of bucket.entries) {
        if (remaining <= 0) break;
        const available = entry.charges && entry.charges > 0 ? entry.charges : 1;
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        remaining -= take;
        sources.push({
          characterName: entry.characterName,
          location: entry.location,
          quantity: take
        });
      }

      if (remaining > 0) {
        return reply.badRequest(`Insufficient quantity for ${requestItem.itemName}.`);
      }

      allocations.push({
        itemId: requestItem.itemId ?? null,
        itemName: requestItem.itemName,
        itemIconId:
          bucket.entries.find((entry) => entry.itemIconId != null)?.itemIconId ?? null,
        quantity: requestItem.quantity,
        sources
      });
    }

    const [user, guild] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { displayName: true, nickname: true }
      }),
      prisma.guild.findUnique({ where: { id: guildId }, select: { name: true } })
    ]);
    const requestedByName = withPreferredDisplayName(user ?? { displayName: 'Guild Member' }).displayName;
    const guildName = guild?.name ?? 'Guild';

    try {
      await emitDiscordWebhookEvent(guildId, 'bank.requested', {
        guildId,
        guildName,
        requestedByName,
        items: allocations
      });
    } catch (error) {
      request.log.warn({ error }, 'Failed to emit bank.requested webhook.');
    }

    return { success: true };
  });
}
