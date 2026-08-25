import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  BossLibraryError,
  acquireBossEditLease,
  createGuildBoss,
  createGuildBossEditSuggestion,
  createGuildBossGroup,
  deleteGuildBoss,
  deleteGuildBossGroup,
  getGuildBoss,
  getGuildBossBySlug,
  getGuildBossImage,
  getGuildBossPlainNotes,
  heartbeatBossEditLease,
  listBossContributors,
  listGuildBossEditHistory,
  listGuildBossEditSuggestions,
  listGuildBossLibrary,
  prepareBossImageUpload,
  releaseBossEditLease,
  reorderGuildBossGroups,
  reviewGuildBossEditSuggestion,
  setBossContributor,
  updateGuildBoss,
  updateGuildBossPlainNotes,
  updateGuildBossGroup
} from '../services/bossLibraryService.js';

const guildParamsSchema = z.object({ guildId: z.string().min(1) });
const groupParamsSchema = z.object({ guildId: z.string().min(1), groupId: z.string().min(1) });
const bossParamsSchema = z.object({ guildId: z.string().min(1), bossId: z.string().min(1) });
const bossSuggestionParamsSchema = bossParamsSchema.extend({
  suggestionId: z.string().min(1)
});
const bossSlugParamsSchema = z.object({
  guildSlug: z.string().min(1).max(191),
  bossSlug: z.string().min(1).max(191)
});
const contributorParamsSchema = z.object({
  guildId: z.string().min(1),
  userId: z.string().min(1)
});

const imageUrlSchema = z
  .union([
    z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//i.test(value), 'Image URL must use HTTP or HTTPS.'),
    z.literal('')
  ])
  .nullable();

const groupBodySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

const groupUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional()
  })
  .refine((value) => value.name !== undefined || value.sortOrder !== undefined);

const groupReorderSchema = z.object({
  groupIds: z.array(z.string().min(1)).max(500)
});

const bossCuresSchema = z.object({
  curse: z.boolean(),
  poison: z.boolean(),
  disease: z.boolean()
});

const bossHealsSchema = z.object({
  raidHeals: z.boolean(),
  cHealChainSize: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5)
  ])
});

const bossTrackerDefinitionSchema = z
  .union([z.string().trim().min(1), z.literal('').transform(() => null)])
  .nullable();

const bossBodySchema = z.object({
  groupId: z.string().min(1),
  name: z.string().trim().min(1).max(191),
  npcDefinitionId: bossTrackerDefinitionSchema.optional(),
  imageUrl: imageUrlSchema.optional(),
  notes: z.string().max(200000).nullable().optional(),
  cures: bossCuresSchema.optional(),
  heals: bossHealsSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional()
});

const bossUpdateSchema = z
  .object({
    groupId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(191).optional(),
    npcDefinitionId: bossTrackerDefinitionSchema.optional(),
    imageUrl: imageUrlSchema.optional(),
    notes: z.string().max(200000).nullable().optional(),
    cures: bossCuresSchema.optional(),
    heals: bossHealsSchema.optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    editLeaseToken: z.string().uuid().optional(),
    notesRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional()
  })
  .refine((value) =>
    ['groupId', 'name', 'npcDefinitionId', 'imageUrl', 'notes', 'cures', 'heals', 'sortOrder'].some(
      (field) => value[field as keyof typeof value] !== undefined
    )
  );

const bossImageCreateSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().trim().min(1).max(191),
  npcDefinitionId: bossTrackerDefinitionSchema.optional(),
  notes: z.string().max(200000).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional()
});

const bossImageUpdateSchema = z.object({
  groupId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(191).optional(),
  npcDefinitionId: bossTrackerDefinitionSchema.optional(),
  notes: z.string().max(200000).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  editLeaseToken: z.string().uuid().optional(),
  notesRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
});

const bossPlainNotesUpdateSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.record(z.string().max(200000)),
  editLeaseToken: z.string().uuid()
});

const bossEditLeaseAcquireSchema = z.object({
  mode: z.enum(['plain', 'source'])
});

const bossEditLeaseUpdateSchema = z.object({
  token: z.string().uuid(),
  mode: z.enum(['plain', 'source'])
});

const bossEditLeaseReleaseSchema = z.object({
  token: z.string().uuid()
});

const bossSuggestionCreateSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.record(z.string().max(200000)),
  cures: bossCuresSchema
});

const bossSuggestionReviewSchema = z.object({
  action: z.enum(['approve', 'reject'])
});

function sendBossError(reply: FastifyReply, error: unknown) {
  if (error instanceof BossLibraryError) {
    return reply.code(error.statusCode).send({ message: error.message, ...(error.details ?? {}) });
  }
  throw error;
}

async function readBossImageForm(request: FastifyRequest) {
  const fields: Record<string, string> = {};
  let image: ReturnType<typeof prepareBossImageUpload> | null = null;
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'image' || image) {
          part.file.resume();
          throw new BossLibraryError('Upload exactly one boss image.', 400);
        }
        image = prepareBossImageUpload(await part.toBuffer(), part.filename);
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new BossLibraryError('Boss images must be 2 MB or smaller.', 413);
    }
    throw error;
  }
  if (!image) {
    throw new BossLibraryError('Choose an image to upload.', 400);
  }
  return { fields, image };
}

export async function bossRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/by-slug/:guildSlug/bosses/:bossSlug',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildSlug, bossSlug } = bossSlugParamsSchema.parse(request.params);
      try {
        return await getGuildBossBySlug(guildSlug, bossSlug, request.user.userId);
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.get('/:guildId/bosses', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId } = guildParamsSchema.parse(request.params);
    try {
      return await listGuildBossLibrary(guildId, request.user.userId);
    } catch (error) {
      return sendBossError(reply, error);
    }
  });

  server.get(
    '/:guildId/bosses/contributors',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId } = guildParamsSchema.parse(request.params);
      try {
        return { contributors: await listBossContributors(guildId, request.user.userId) };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/contributors/:userId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, userId } = contributorParamsSchema.parse(request.params);
      const parsed = z.object({ isContributor: z.boolean() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid contributor update.');
      }
      try {
        const membership = await setBossContributor(
          guildId,
          userId,
          request.user.userId,
          parsed.data.isContributor
        );
        return { membership };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.get('/:guildId/bosses/:bossId', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId, bossId } = bossParamsSchema.parse(request.params);
    try {
      return await getGuildBoss(guildId, bossId, request.user.userId);
    } catch (error) {
      return sendBossError(reply, error);
    }
  });

  server.get(
    '/:guildId/bosses/:bossId/history',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        return {
          history: await listGuildBossEditHistory(guildId, bossId, request.user.userId)
        };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.get(
    '/:guildId/bosses/:bossId/suggestions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        return {
          suggestions: await listGuildBossEditSuggestions(guildId, bossId, request.user.userId)
        };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.post(
    '/:guildId/bosses/:bossId/suggestions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossSuggestionCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss edit suggestion. Reload and try again.');
      }
      try {
        const suggestion = await createGuildBossEditSuggestion(
          guildId,
          bossId,
          request.user.userId,
          parsed.data
        );
        return reply.code(201).send({ suggestion });
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/:bossId/suggestions/:suggestionId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId, suggestionId } = bossSuggestionParamsSchema.parse(request.params);
      const parsed = bossSuggestionReviewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Choose whether to approve or reject this suggestion.');
      }
      try {
        return await reviewGuildBossEditSuggestion(
          guildId,
          bossId,
          suggestionId,
          request.user.userId,
          parsed.data.action
        );
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.post(
    '/:guildId/bosses/:bossId/edit-lease',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossEditLeaseAcquireSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Choose a valid boss notes editor mode.');
      }
      try {
        return await acquireBossEditLease(guildId, bossId, request.user.userId, parsed.data.mode);
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/:bossId/edit-lease',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossEditLeaseUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss edit lock renewal.');
      }
      try {
        return {
          lease: await heartbeatBossEditLease(
            guildId,
            bossId,
            request.user.userId,
            parsed.data.token,
            parsed.data.mode
          )
        };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.post(
    '/:guildId/bosses/:bossId/edit-lease/release',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossEditLeaseReleaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss edit lock release.');
      }
      try {
        await releaseBossEditLease(guildId, bossId, request.user.userId, parsed.data.token);
        return reply.code(204).send();
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.get(
    '/:guildId/bosses/:bossId/plain-notes',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        return { document: await getGuildBossPlainNotes(guildId, bossId, request.user.userId) };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/:bossId/plain-notes',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossPlainNotesUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(
          'Invalid plain-text notes update. Reload the editor and try again.'
        );
      }
      try {
        return await updateGuildBossPlainNotes(guildId, bossId, request.user.userId, parsed.data);
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.get(
    '/:guildId/bosses/:bossId/image',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        const image = await getGuildBossImage(guildId, bossId, request.user.userId);
        return reply
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header('X-Content-Type-Options', 'nosniff')
          .type(image.mimeType)
          .send(image.data);
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.post('/:guildId/boss-groups', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId } = guildParamsSchema.parse(request.params);
    const parsed = groupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Enter a group name between 1 and 120 characters.');
    }
    try {
      const group = await createGuildBossGroup(guildId, request.user.userId, parsed.data.name);
      return reply.code(201).send({ group });
    } catch (error) {
      return sendBossError(reply, error);
    }
  });

  server.post(
    '/:guildId/boss-groups/reorder',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId } = guildParamsSchema.parse(request.params);
      const parsed = groupReorderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss group order.');
      }
      try {
        const groups = await reorderGuildBossGroups(
          guildId,
          request.user.userId,
          parsed.data.groupIds
        );
        return { groups };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/boss-groups/:groupId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, groupId } = groupParamsSchema.parse(request.params);
      const parsed = groupUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss group update.');
      }
      try {
        const group = await updateGuildBossGroup(
          guildId,
          groupId,
          request.user.userId,
          parsed.data
        );
        return { group };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.delete(
    '/:guildId/boss-groups/:groupId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, groupId } = groupParamsSchema.parse(request.params);
      try {
        await deleteGuildBossGroup(guildId, groupId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.post('/:guildId/bosses', { preHandler: [authenticate] }, async (request, reply) => {
    const { guildId } = guildParamsSchema.parse(request.params);
    const parsed = bossBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Invalid boss details.');
    }
    try {
      const boss = await createGuildBoss(guildId, request.user.userId, parsed.data);
      return reply.code(201).send({ boss });
    } catch (error) {
      return sendBossError(reply, error);
    }
  });

  server.post(
    '/:guildId/bosses/with-image',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId } = guildParamsSchema.parse(request.params);
      try {
        const { fields, image } = await readBossImageForm(request);
        const parsed = bossImageCreateSchema.safeParse(fields);
        if (!parsed.success) {
          return reply.badRequest('Invalid boss details.');
        }
        const boss = await createGuildBoss(guildId, request.user.userId, {
          ...parsed.data,
          imageUpload: image
        });
        return reply.code(201).send({ boss });
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/:bossId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      const parsed = bossUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid boss update.');
      }
      try {
        const boss = await updateGuildBoss(guildId, bossId, request.user.userId, parsed.data);
        return { boss };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.patch(
    '/:guildId/bosses/:bossId/with-image',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        const { fields, image } = await readBossImageForm(request);
        const parsed = bossImageUpdateSchema.safeParse(fields);
        if (!parsed.success) {
          return reply.badRequest('Invalid boss update.');
        }
        const boss = await updateGuildBoss(guildId, bossId, request.user.userId, {
          ...parsed.data,
          imageUpload: image
        });
        return { boss };
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );

  server.delete(
    '/:guildId/bosses/:bossId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { guildId, bossId } = bossParamsSchema.parse(request.params);
      try {
        await deleteGuildBoss(guildId, bossId, request.user.userId);
        return reply.code(204).send();
      } catch (error) {
        return sendBossError(reply, error);
      }
    }
  );
}
