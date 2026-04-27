import {
  TestAssignmentKind,
  TestChangePriority,
  TestChangeStatus,
  TestResult
} from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin, ensureTesterOrAdmin } from '../services/adminService.js';
import {
  TEST_MANAGER_DISCORD_EVENT_KEYS,
  TEST_MANAGER_PERMISSION_KEYS,
  TEST_MANAGER_ROLE_KEYS,
  createTestChange,
  deleteTestChange,
  getTestChange,
  getTestManagerDashboard,
  getTestManagerSettings,
  listTestChanges,
  listTestManagerUsers,
  requestTester,
  retestChange,
  saveChangeNote,
  setTestChangeStatus,
  submitTesterResult,
  updateTesterChecklistProgress,
  updateTestManagerSettings,
  updateTestManagerUserRole,
  volunteerForChange
} from '../services/testManagerService.js';

function isDiscordWebhookUrl(value: string): boolean {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(
        url.hostname
      ) &&
      /^\/api\/webhooks\/[^/]+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  try {
    await ensureAdmin(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'Non-admin attempted to access Test Manager admin route.');
    return reply.forbidden('Administrator privileges required.');
  }
}

async function requireTesterOrAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  try {
    await ensureTesterOrAdmin(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'Non-tester attempted to access Test Manager tester route.');
    return reply.forbidden('Tester or Administrator privileges required.');
  }
}

const richTextSchema = z.string().max(50000);

export async function testManagerRoutes(server: FastifyInstance): Promise<void> {
  server.get('/dashboard', { preHandler: [authenticate] }, async (request) => {
    return getTestManagerDashboard(request.user.userId);
  });

  server.get('/changes', { preHandler: [authenticate] }, async (request, reply) => {
    const querySchema = z.object({
      status: z.union([z.nativeEnum(TestChangeStatus), z.literal('ACTIVE')]).optional(),
      search: z.string().max(120).optional()
    });
    const parsed = querySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    return listTestChanges(request.user.userId, parsed.data);
  });

  server.post('/changes', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const bodySchema = z.object({
      title: z.string().trim().min(3).max(191),
      description: richTextSchema,
      category: z.string().trim().min(1).max(80),
      subsystem: z.string().trim().min(1).max(80),
      priority: z.nativeEnum(TestChangePriority).default(TestChangePriority.MEDIUM),
      targetBuild: z.string().trim().max(120).nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      assignedToId: z.string().nullable().optional(),
      checklist: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(191),
            details: z.string().trim().max(1000).nullable().optional(),
            category: z.string().trim().max(80).nullable().optional()
          })
        )
        .max(30)
        .default([])
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    try {
      const change = await createTestChange(request.user.userId, {
        ...parsed.data,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null
      });
      return reply.code(201).send({ change });
    } catch (error) {
      request.log.error({ error }, 'Failed to create test change.');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to create change.');
    }
  });

  server.get('/changes/:changeId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ changeId: z.string().min(1) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const change = await getTestChange(parsed.data.changeId, request.user.userId);
    if (!change) {
      return reply.notFound('Change not found.');
    }

    return { change };
  });

  server.patch(
    '/changes/:changeId/status',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        status: z.nativeEnum(TestChangeStatus),
        detail: z.string().max(1000).nullable().optional()
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid status update payload.');
      }

      try {
        const change = await setTestChangeStatus(
          request.user.userId,
          params.data.changeId,
          body.data.status,
          body.data.detail
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update status.'
        );
      }
    }
  );

  server.delete(
    '/changes/:changeId',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        await deleteTestChange(request.user.userId, parsed.data.changeId);
        return reply.code(204).send();
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to delete change.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/volunteer',
    { preHandler: [authenticate, requireTesterOrAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        const change = await volunteerForChange(request.user.userId, parsed.data.changeId);
        return { change };
      } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Unable to volunteer.');
      }
    }
  );

  server.post(
    '/changes/:changeId/retest',
    { preHandler: [authenticate, requireTesterOrAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      try {
        const change = await retestChange(request.user.userId, parsed.data.changeId);
        return { change };
      } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Unable to re-test.');
      }
    }
  );

  server.post(
    '/changes/:changeId/request',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        userId: z.string().min(1),
        assignment: z.nativeEnum(TestAssignmentKind).default(TestAssignmentKind.ADMIN_REQUESTED)
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid tester request payload.');
      }

      try {
        const change = await requestTester(
          request.user.userId,
          params.data.changeId,
          body.data.userId,
          body.data.assignment
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to request testing.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/checklist/:checklistItemId',
    { preHandler: [authenticate, requireTesterOrAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        checklistItemId: z.string().min(1)
      });
      const bodySchema = z
        .object({
          completed: z.boolean().optional(),
          notesHtml: richTextSchema.optional()
        })
        .refine(
          (value) => typeof value.completed === 'boolean' || typeof value.notesHtml === 'string',
          'A completed value or note is required.'
        );
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid checklist progress payload.');
      }

      try {
        const change = await updateTesterChecklistProgress(
          request.user.userId,
          params.data.changeId,
          params.data.checklistItemId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update checklist progress.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/result',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        result: z.nativeEnum(TestResult),
        notesHtml: richTextSchema.optional().default('')
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid test result payload.');
      }

      try {
        const change = await submitTesterResult(
          request.user.userId,
          params.data.changeId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to submit result.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/notes',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({ contentHtml: richTextSchema });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid note payload.');
      }

      try {
        const change = await saveChangeNote(
          request.user.userId,
          params.data.changeId,
          body.data.contentHtml
        );
        return { change };
      } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Unable to save note.');
      }
    }
  );

  server.get('/users', { preHandler: [authenticate] }, async () => {
    return listTestManagerUsers();
  });

  server.patch(
    '/users/:userId',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ userId: z.string().min(1) });
      const bodySchema = z.object({ tester: z.boolean() });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid user role payload.');
      }

      try {
        return updateTestManagerUserRole(request.user.userId, params.data.userId, body.data.tester);
      } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Unable to update user.');
      }
    }
  );

  server.get('/settings', { preHandler: [authenticate, requireAdmin] }, async () => {
    return getTestManagerSettings();
  });

  server.put('/settings', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const bodySchema = z.object({
      roles: z.array(
        z.object({
          key: z.enum(TEST_MANAGER_ROLE_KEYS),
          permissions: z.array(z.enum(TEST_MANAGER_PERMISSION_KEYS)).default([])
        })
      ),
      discordNotifications: z
        .object({
          enabled: z.boolean(),
          webhookUrl: z
            .string()
            .trim()
            .max(500)
            .refine(isDiscordWebhookUrl, 'Must be a valid Discord webhook URL.'),
          events: z.array(z.enum(TEST_MANAGER_DISCORD_EVENT_KEYS)).default([])
        })
        .optional()
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.badRequest('Invalid role permission settings payload.');
    }

    try {
      return await updateTestManagerSettings(request.user.userId, parsed.data);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : 'Unable to update role permission settings.'
      );
    }
  });
}
