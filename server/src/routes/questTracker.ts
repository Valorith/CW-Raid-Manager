import { FastifyInstance } from 'fastify';
import { QuestAssignmentStatus, QuestNodeProgressStatus, QuestNodeType, QuestBlueprintVisibility } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { getUserGuildRole } from '../services/guildService.js';
import {
  applyAssignmentProgressUpdates,
  canManageQuestBlueprints,
  canEditQuestBlueprint,
  canViewGuildQuestBoard,
  createQuestBlueprint,
  getQuestBlueprintDetail,
  listGuildQuestTrackerSummary,
  startQuestAssignment,
  updateAssignmentStatus,
  updateQuestBlueprintMetadata,
  upsertQuestBlueprintGraph,
  QUEST_BLUEPRINT_PERMISSION_ERROR
} from '../services/questTrackerService.js';

export async function questTrackerRoutes(server: FastifyInstance) {
  const guildIdParams = z.object({ guildId: z.string() });

  server.get('/:guildId/quest-tracker', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId } = guildIdParams.parse(request.params);
    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to view quest trackers.');
    }

    const summary = await listGuildQuestTrackerSummary({
      guildId,
      viewerUserId: request.user.userId
    });

    return {
      ...summary,
      permissions: {
        role: membership.role,
        canManageBlueprints: canManageQuestBlueprints(membership.role),
        canViewGuildBoard: canViewGuildQuestBoard(membership.role),
        canEditBlueprint: canManageQuestBlueprints(membership.role)
      }
    };
  });

  server.post('/:guildId/quest-tracker/blueprints', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId } = guildIdParams.parse(request.params);
    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership || !canManageQuestBlueprints(membership.role)) {
      return reply.forbidden('Only guild leaders or officers can create quest blueprints.');
    }

    const bodySchema = z.object({
      title: z.string().min(3).max(180),
      summary: z.string().max(500).optional().nullable(),
      visibility: z.nativeEnum(QuestBlueprintVisibility).optional()
    });
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid blueprint payload.');
    }

    const blueprint = await createQuestBlueprint({
      guildId,
      creatorUserId: request.user.userId,
      title: parsedBody.data.title,
      summary: parsedBody.data.summary,
      visibility: parsedBody.data.visibility
    });

    return reply.code(201).send({ blueprint });
  });

  server.get('/:guildId/quest-tracker/blueprints/:blueprintId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ blueprintId: z.string() });
    const { guildId, blueprintId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to view quest blueprints.');
    }

    try {
      const detail = await getQuestBlueprintDetail({
        guildId,
        blueprintId,
        viewerUserId: request.user.userId,
        includeGuildAssignments: canViewGuildQuestBoard(membership.role)
      });
      const canEditBlueprint = canEditQuestBlueprint(
        membership.role,
        request.user.userId,
        detail.blueprint.createdById
      );

      return {
        ...detail,
        permissions: {
          role: membership.role,
          canManageBlueprints: canManageQuestBlueprints(membership.role),
          canViewGuildBoard: canViewGuildQuestBoard(membership.role),
          canEditBlueprint
        },
        availableNodeTypes: Object.values(QuestNodeType)
      };
    } catch (error) {
      request.log.error({ error }, 'Failed to load quest blueprint detail');
      return reply.notFound('Quest blueprint not found.');
    }
  });

  server.patch('/:guildId/quest-tracker/blueprints/:blueprintId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ blueprintId: z.string() });
    const { guildId, blueprintId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to update quest blueprints.');
    }

    const bodySchema = z.object({
      title: z.string().min(3).max(180).optional(),
      summary: z.string().max(500).optional().nullable(),
      visibility: z.nativeEnum(QuestBlueprintVisibility).optional(),
      isArchived: z.boolean().optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid quest blueprint metadata payload.');
    }

    try {
      const blueprint = await updateQuestBlueprintMetadata({
        guildId,
        blueprintId,
        actorUserId: request.user.userId,
        actorRole: membership.role,
        data: parsed.data
      });
      return { blueprint };
    } catch (error) {
      if (error instanceof Error && error.message === QUEST_BLUEPRINT_PERMISSION_ERROR) {
        return reply.forbidden('Only the creator or guild leaders/officers can edit this quest blueprint.');
      }
      request.log.error({ error }, 'Failed to update quest blueprint');
      return reply.notFound('Quest blueprint not found.');
    }
  });

  server.put('/:guildId/quest-tracker/blueprints/:blueprintId/graph', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ blueprintId: z.string() });
    const { guildId, blueprintId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to edit quest blueprints.');
    }

    const nodeSchema = z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(191),
      description: z.string().max(1000).optional().nullable(),
      nodeType: z.nativeEnum(QuestNodeType),
      position: z.object({
        x: z.number().finite(),
        y: z.number().finite()
      }),
      sortOrder: z.number().int(),
      requirements: z.record(z.any()).optional(),
      metadata: z.record(z.any()).optional(),
      isGroup: z.boolean().optional()
    });

    const linkSchema = z.object({
      id: z.string().min(1),
      parentNodeId: z.string().min(1),
      childNodeId: z.string().min(1),
      conditions: z.record(z.any()).optional()
    });

    const bodySchema = z.object({
      nodes: z.array(nodeSchema),
      links: z.array(linkSchema)
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid quest blueprint graph payload.');
    }

    try {
      await upsertQuestBlueprintGraph({
        guildId,
        blueprintId,
        actorUserId: request.user.userId,
        actorRole: membership.role,
        nodes: parsed.data.nodes,
        links: parsed.data.links
      });
      const detail = await getQuestBlueprintDetail({
        guildId,
        blueprintId,
        viewerUserId: request.user.userId,
        includeGuildAssignments: canViewGuildQuestBoard(membership.role)
      });
      const canEditBlueprint = canEditQuestBlueprint(
        membership.role,
        request.user.userId,
        detail.blueprint.createdById
      );
      return {
        ...detail,
        permissions: {
          role: membership.role,
          canManageBlueprints: canManageQuestBlueprints(membership.role),
          canViewGuildBoard: canViewGuildQuestBoard(membership.role),
          canEditBlueprint
        },
        availableNodeTypes: Object.values(QuestNodeType)
      };
    } catch (error) {
      if (error instanceof Error && error.message === QUEST_BLUEPRINT_PERMISSION_ERROR) {
        return reply.forbidden('Only the creator or guild leaders/officers can edit this quest blueprint.');
      }
      request.log.error({ error }, 'Failed to update quest blueprint graph');
      const message =
        error instanceof Error && error.message ? error.message : 'Unable to update quest blueprint graph.';
      return reply.badRequest(message);
    }
  });

  server.post('/:guildId/quest-tracker/blueprints/:blueprintId/start', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ blueprintId: z.string() });
    const { guildId, blueprintId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to start a quest.');
    }

    const bodySchema = z.object({
      characterId: z.string().min(1, 'Character is required.')
    });
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Character selection is required to start this quest.');
    }

    try {
      const assignment = await startQuestAssignment({
        guildId,
        blueprintId,
        userId: request.user.userId,
        characterId: parsedBody.data.characterId
      });
      return reply.code(201).send({ assignment });
    } catch (error) {
      request.log.warn({ error }, 'Failed to start quest assignment');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to start quest.');
    }
  });

  server.patch('/:guildId/quest-tracker/assignments/:assignmentId/status', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ assignmentId: z.string() });
    const { guildId, assignmentId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to update quest progress.');
    }

    const bodySchema = z.object({
      status: z.nativeEnum(QuestAssignmentStatus)
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid quest assignment status payload.');
    }

    try {
      const assignment = await updateAssignmentStatus({
        guildId,
        assignmentId,
        actorUserId: request.user.userId,
        nextStatus: parsed.data.status,
        allowManagerOverride: canManageQuestBlueprints(membership.role)
      });
      return { assignment };
    } catch (error) {
      request.log.error({ error }, 'Failed to update quest assignment status');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to update quest assignment.');
    }
  });

  server.patch('/:guildId/quest-tracker/assignments/:assignmentId/progress', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = guildIdParams.extend({ assignmentId: z.string() });
    const { guildId, assignmentId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a guild member to update quest progress.');
    }

    const updateSchema = z.object({
      nodeId: z.string().min(1),
      status: z.nativeEnum(QuestNodeProgressStatus).optional(),
      progressCount: z.number().int().min(0).max(9999).optional(),
      notes: z.string().max(500).optional().nullable(),
      isDisabled: z.boolean().optional()
    });

    const bodySchema = z.object({
      updates: z.array(updateSchema).min(1)
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid quest progress payload.');
    }

    try {
      const assignment = await applyAssignmentProgressUpdates({
        guildId,
        assignmentId,
        actorUserId: request.user.userId,
        allowManagerOverride: canManageQuestBlueprints(membership.role),
        updates: parsed.data.updates
      });
      return { assignment };
    } catch (error) {
      request.log.error({ error }, 'Failed to update quest progress');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to update quest progress.');
    }
  });
}
