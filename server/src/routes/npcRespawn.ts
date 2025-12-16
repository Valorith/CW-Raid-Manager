import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { ensureUserCanViewGuild, roleCanEditRaid } from '../services/raidService.js';
import {
  listNpcDefinitions,
  getNpcDefinition,
  createNpcDefinition,
  updateNpcDefinition,
  deleteNpcDefinition,
  listKillRecords,
  listKillRecordsForNpc,
  createKillRecord,
  deleteKillRecord,
  getUserSubscriptions,
  upsertSubscription,
  deleteSubscription,
  getRespawnTrackerData
} from '../services/npcRespawnService.js';
import { prisma } from '../utils/prisma.js';
import { withPreferredDisplayName } from '../utils/displayName.js';

// Schema definitions
const lootItemSchema = z.object({
  itemId: z.number().nullable().optional(),
  itemName: z.string().trim().min(1, 'Item name is required').max(191),
  itemIconId: z.number().nullable().optional(),
  allaLink: z.string().max(512).nullable().optional()
});

const npcDefinitionBodySchema = z.object({
  npcName: z.string().trim().min(1, 'NPC name is required').max(191),
  zoneName: z.string().trim().max(191).nullable().optional(),
  respawnMinMinutes: z.number().int().min(0).nullable().optional(),
  respawnMaxMinutes: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  allaLink: z.string().max(512).nullable().optional(),
  lootItems: z.array(lootItemSchema).optional().default([])
});

const killRecordBodySchema = z.object({
  npcDefinitionId: z.string().min(1, 'NPC definition ID is required'),
  killedAt: z.string().datetime().or(z.date()),
  killedByName: z.string().trim().max(191).nullable().optional(),
  notes: z.string().max(500).nullable().optional()
});

const subscriptionBodySchema = z.object({
  npcDefinitionId: z.string().min(1, 'NPC definition ID is required'),
  notifyMinutes: z.number().int().min(0).max(1440).optional(),
  isEnabled: z.boolean().optional()
});

async function resolveGuildMemberDisplayName(
  guildId: string,
  user: {
    userId: string;
    displayName?: string | null;
    nickname?: string | null;
    email?: string | null;
  }
) {
  const membership = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId: user.userId
      }
    },
    include: {
      user: {
        select: {
          displayName: true,
          nickname: true
        }
      }
    }
  });

  if (membership?.user) {
    return withPreferredDisplayName(membership.user).displayName;
  }

  return (
    user.displayName ??
    user.nickname ??
    user.email ??
    'Unknown'
  );
}

export async function npcRespawnRoutes(server: FastifyInstance): Promise<void> {
  // Get respawn tracker data (combined view with status calculations)
  server.get('/:guildId/npc-respawn', { preHandler: [authenticate] }, async (request) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    const npcs = await getRespawnTrackerData(guildId);

    return {
      npcs,
      canManage: roleCanEditRaid(role),
      viewerRole: role
    };
  });

  // List all NPC definitions for a guild
  server.get('/:guildId/npc-definitions', { preHandler: [authenticate] }, async (request) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    const definitions = await listNpcDefinitions(guildId);

    return {
      definitions,
      canManage: roleCanEditRaid(role),
      viewerRole: role
    };
  });

  // Get a single NPC definition
  server.get('/:guildId/npc-definitions/:npcDefinitionId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string(),
      npcDefinitionId: z.string()
    });
    const { guildId, npcDefinitionId } = paramsSchema.parse(request.params);

    await ensureUserCanViewGuild(request.user.userId, guildId);
    const definition = await getNpcDefinition(guildId, npcDefinitionId);

    if (!definition) {
      return reply.notFound('NPC definition not found.');
    }

    return { definition };
  });

  // Create a new NPC definition
  server.post('/:guildId/npc-definitions', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    if (!roleCanEditRaid(role)) {
      return reply.forbidden('You do not have permission to create NPC definitions.');
    }

    const parsedBody = npcDefinitionBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest('Invalid NPC definition payload: ' + parsedBody.error.message);
    }

    const creatorName = await resolveGuildMemberDisplayName(guildId, request.user);

    try {
      const definition = await createNpcDefinition(
        guildId,
        { userId: request.user.userId, displayName: creatorName },
        parsedBody.data
      );
      return { definition };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : 'Failed to create NPC definition.');
    }
  });

  // Update an NPC definition
  server.put('/:guildId/npc-definitions/:npcDefinitionId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string(),
      npcDefinitionId: z.string()
    });
    const { guildId, npcDefinitionId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    if (!roleCanEditRaid(role)) {
      return reply.forbidden('You do not have permission to update NPC definitions.');
    }

    const parsedBody = npcDefinitionBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest('Invalid NPC definition payload: ' + parsedBody.error.message);
    }

    try {
      const definition = await updateNpcDefinition(guildId, npcDefinitionId, parsedBody.data);
      return { definition };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : 'Failed to update NPC definition.');
    }
  });

  // Delete an NPC definition
  server.delete('/:guildId/npc-definitions/:npcDefinitionId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string(),
      npcDefinitionId: z.string()
    });
    const { guildId, npcDefinitionId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    if (!roleCanEditRaid(role)) {
      return reply.forbidden('You do not have permission to delete NPC definitions.');
    }

    await deleteNpcDefinition(guildId, npcDefinitionId);
    return reply.code(204).send();
  });

  // List kill records for a guild
  server.get('/:guildId/npc-kills', { preHandler: [authenticate] }, async (request) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const querySchema = z.object({
      npcDefinitionId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional()
    });

    const { guildId } = paramsSchema.parse(request.params);
    const { npcDefinitionId, limit } = querySchema.parse(request.query ?? {});

    await ensureUserCanViewGuild(request.user.userId, guildId);

    const records = npcDefinitionId
      ? await listKillRecordsForNpc(guildId, npcDefinitionId, limit ?? 20)
      : await listKillRecords(guildId, limit ?? 50);

    return { records };
  });

  // Create a kill record
  server.post('/:guildId/npc-kills', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    await ensureUserCanViewGuild(request.user.userId, guildId);

    const parsedBody = killRecordBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest('Invalid kill record payload: ' + parsedBody.error.message);
    }

    const data = parsedBody.data;

    try {
      const record = await createKillRecord(guildId, {
        npcDefinitionId: data.npcDefinitionId,
        killedAt: new Date(data.killedAt),
        killedByName: data.killedByName ?? null,
        killedById: request.user.userId,
        notes: data.notes ?? null
      });
      return { record };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : 'Failed to create kill record.');
    }
  });

  // Delete a kill record
  server.delete('/:guildId/npc-kills/:killRecordId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string(),
      killRecordId: z.string()
    });
    const { guildId, killRecordId } = paramsSchema.parse(request.params);

    const role = await ensureUserCanViewGuild(request.user.userId, guildId);
    if (!roleCanEditRaid(role)) {
      return reply.forbidden('You do not have permission to delete kill records.');
    }

    await deleteKillRecord(guildId, killRecordId);
    return reply.code(204).send();
  });

  // Get user's subscriptions for a guild
  server.get('/:guildId/npc-subscriptions', { preHandler: [authenticate] }, async (request) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    await ensureUserCanViewGuild(request.user.userId, guildId);

    const subscriptions = await getUserSubscriptions(request.user.userId, guildId);
    return { subscriptions };
  });

  // Create or update a subscription
  server.post('/:guildId/npc-subscriptions', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    await ensureUserCanViewGuild(request.user.userId, guildId);

    const parsedBody = subscriptionBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.badRequest('Invalid subscription payload: ' + parsedBody.error.message);
    }

    // Verify the NPC definition belongs to this guild
    const npcDefinition = await prisma.npcDefinition.findFirst({
      where: {
        id: parsedBody.data.npcDefinitionId,
        guildId
      }
    });
    if (!npcDefinition) {
      return reply.notFound('NPC definition not found in this guild.');
    }

    const subscription = await upsertSubscription(request.user.userId, parsedBody.data);
    return { subscription };
  });

  // Delete a subscription
  server.delete('/:guildId/npc-subscriptions/:npcDefinitionId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string(),
      npcDefinitionId: z.string()
    });
    const { guildId, npcDefinitionId } = paramsSchema.parse(request.params);

    await ensureUserCanViewGuild(request.user.userId, guildId);

    // Verify the NPC definition belongs to this guild before allowing deletion
    const npcDefinition = await prisma.npcDefinition.findFirst({
      where: {
        id: npcDefinitionId,
        guildId
      }
    });
    if (!npcDefinition) {
      return reply.notFound('NPC definition not found in this guild.');
    }

    await deleteSubscription(request.user.userId, npcDefinitionId);
    return reply.code(204).send();
  });

  // Search discovered items from EQEmu discovered_items table
  server.get('/:guildId/discovered-items', { preHandler: [authenticate] }, async (request) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const querySchema = z.object({
      q: z.string().trim().min(1).max(100).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional()
    });

    const { guildId } = paramsSchema.parse(request.params);
    const { q: searchQuery, limit = 20 } = querySchema.parse(request.query ?? {});

    await ensureUserCanViewGuild(request.user.userId, guildId);

    const { searchDiscoveredItems } = await import('../services/npcRespawnService.js');
    const items = await searchDiscoveredItems(searchQuery ?? '', limit);

    return { items };
  });
}
