import {
  TestAssignmentKind,
  TestChangePriority,
  TestChangeStatus,
  TestResult
} from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin } from '../services/adminService.js';
import {
  TEST_MANAGER_DISCORD_EVENT_KEYS,
  TEST_MANAGER_PERMISSION_KEYS,
  TEST_MANAGER_ROLE_KEYS,
  type NextPatchChangeView,
  addTestChangeChecklistItem,
  countNextPatchChanges,
  createTestChange,
  createTestChangeChecklistGroup,
  updateTestChangeChecklistGroup,
  deleteChangeNote,
  deleteTestChange,
  deleteTestChangeChecklistItem,
  ensureCanManageTestManagerSettings,
  ensureCanManageTestManagerTesters,
  ensureCanViewTestManager,
  getCurrentTestServerVersion,
  getTestChange,
  getTestManagerDashboard,
  getTestManagerSettings,
  generateNextPatchNotes,
  linkWebhookReportToTestChange,
  listNextPatchChanges,
  listTestChanges,
  listTestManagerUsers,
  refreshTestChangeGithubMetadata,
  requestTester,
  resetNextPatch,
  retestChange,
  removeTesterFromChange,
  saveChangeNote,
  setTestChangeNextPatch,
  setTestChangeReadyToTest,
  setTestChangeChecklistItemShared,
  setTestChangeStatus,
  setTestChangeTestServerVersion,
  submitTesterResult,
  unlinkWebhookReportFromTestChange,
  updateCurrentLiveServerVersion,
  updateCurrentTestServerVersion,
  updateTestChange,
  updateTestChangeContextLinks,
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

async function requireCanView(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  try {
    await ensureCanViewTestManager(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'User attempted to access Test Manager without view permission.');
    return reply.forbidden('Test Manager view permission required.');
  }
}

async function requireCanManageSettings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  try {
    await ensureCanManageTestManagerSettings(request.user.userId);
  } catch (error) {
    request.log.warn(
      { error },
      'User attempted to access Test Manager settings without permission.'
    );
    return reply.forbidden('Test Manager settings permission required.');
  }
}

async function requireCanManageTesters(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  try {
    await ensureCanManageTestManagerTesters(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'User attempted to access Test Manager users without permission.');
    return reply.forbidden('Test Manager tester management permission required.');
  }
}

const richTextSchema = z.string().max(50000);
const currentServerVersionSchema = z.string().trim().max(80).nullable();
const testServerVersionSchema = currentServerVersionSchema.optional();
const testChangeChecklistSchemaLimit = 600;
const contextLinkSchema = z.object({
  id: z.string().trim().max(64).optional(),
  kind: z.enum(['DISCORD', 'GITHUB', 'DOCUMENT', 'OTHER']).optional(),
  label: z.string().trim().max(140).optional(),
  url: z.string().trim().url().max(1000),
  description: z.string().trim().max(500).optional()
});
const nextPatchQuerySchema = z.object({
  view: z.enum(['complete', 'incomplete']).default('complete')
});

export async function testManagerRoutes(server: FastifyInstance): Promise<void> {
  server.get('/dashboard', { preHandler: [authenticate, requireCanView] }, async (request) => {
    return getTestManagerDashboard(request.user.userId);
  });

  server.get('/server-version', { preHandler: [authenticate, requireCanView] }, async () => {
    return getCurrentTestServerVersion();
  });

  server.put(
    '/server-version',
    { preHandler: [authenticate, requireCanView, requireCanManageSettings] },
    async (request, reply) => {
      const bodySchema = z.object({
        currentTestServerVersion: currentServerVersionSchema
      });
      const parsed = bodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.badRequest('Invalid test server version payload.');
      }

      try {
        return await updateCurrentTestServerVersion(
          request.user.userId,
          parsed.data.currentTestServerVersion
        );
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update test server version.'
        );
      }
    }
  );

  server.put(
    '/live-server-version',
    { preHandler: [authenticate, requireCanView, requireCanManageSettings] },
    async (request, reply) => {
      const bodySchema = z.object({
        currentLiveServerVersion: currentServerVersionSchema
      });
      const parsed = bodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.badRequest('Invalid live server version payload.');
      }

      try {
        return await updateCurrentLiveServerVersion(
          request.user.userId,
          parsed.data.currentLiveServerVersion
        );
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update live server version.'
        );
      }
    }
  );

  server.get(
    '/next-patch',
    { preHandler: [authenticate, requireCanView] },
    async (request, reply) => {
      const parsed = nextPatchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid next patch view.');
      }
      return listNextPatchChanges(request.user.userId, parsed.data.view as NextPatchChangeView);
    }
  );

  server.get(
    '/next-patch/count',
    { preHandler: [authenticate, requireCanView] },
    async (request) => {
      return countNextPatchChanges(request.user.userId);
    }
  );

  server.post(
    '/next-patch/reset',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      try {
        return await resetNextPatch(request.user.userId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to reset next patch.'
        );
      }
    }
  );

  server.post(
    '/next-patch/patch-notes',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      try {
        return await generateNextPatchNotes(request.user.userId);
      } catch (error) {
        request.log.error({ error }, 'Failed to generate next patch notes.');
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to generate patch notes.'
        );
      }
    }
  );

  server.get('/changes', { preHandler: [authenticate, requireCanView] }, async (request, reply) => {
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

  server.post(
    '/changes',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const bodySchema = z.object({
        title: z.string().trim().min(3).max(191),
        description: richTextSchema,
        category: z.string().trim().min(1).max(80),
        subsystem: z.string().trim().min(1).max(80),
        priority: z.nativeEnum(TestChangePriority).default(TestChangePriority.MEDIUM),
        targetBuild: z.string().trim().max(120).nullable().optional(),
        testServerVersion: testServerVersionSchema,
        githubPrUrl: z.string().trim().max(500).nullable().optional(),
        githubIssueUrl: z.string().trim().max(500).nullable().optional(),
        contextLinks: z.array(contextLinkSchema).max(20).optional().default([]),
        includeInNextPatch: z.boolean().optional(),
        autoClosePassCount: z.number().int().min(0).max(99).optional(),
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
          .max(testChangeChecklistSchemaLimit)
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
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to create change.'
        );
      }
    }
  );

  server.get(
    '/changes/:changeId',
    { preHandler: [authenticate, requireCanView] },
    async (request, reply) => {
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
    }
  );

  server.post(
    '/changes/:changeId/github-metadata/refresh',
    { preHandler: [authenticate, requireCanView] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      const change = await refreshTestChangeGithubMetadata(
        parsed.data.changeId,
        request.user.userId
      );
      if (!change) {
        return reply.notFound('Change not found.');
      }

      return { change };
    }
  );

  server.patch(
    '/changes/:changeId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        title: z.string().trim().min(3).max(191),
        description: richTextSchema,
        category: z.string().trim().min(1).max(80),
        subsystem: z.string().trim().min(1).max(80),
        priority: z.nativeEnum(TestChangePriority).default(TestChangePriority.MEDIUM),
        targetBuild: z.string().trim().max(120).nullable().optional(),
        testServerVersion: testServerVersionSchema,
        githubPrUrl: z.string().trim().max(500).nullable().optional(),
        githubIssueUrl: z.string().trim().max(500).nullable().optional(),
        contextLinks: z.array(contextLinkSchema).max(20).optional(),
        includeInNextPatch: z.boolean().optional(),
        autoClosePassCount: z.number().int().min(0).max(99).optional(),
        dueAt: z.string().datetime().nullable().optional(),
        assignedToId: z.string().nullable().optional(),
        checklist: z
          .array(
            z.object({
              id: z.string().trim().min(1).optional(),
              title: z.string().trim().min(1).max(191),
              details: z.string().trim().max(1000).nullable().optional(),
              category: z.string().trim().max(80).nullable().optional()
            })
          )
          .max(testChangeChecklistSchemaLimit)
          .optional()
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid change update payload.');
      }

      try {
        const change = await updateTestChange(request.user.userId, params.data.changeId, {
          ...body.data,
          dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null
        });
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update change.'
        );
      }
    }
  );

  server.patch(
    '/changes/:changeId/context-links',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        contextLinks: z.array(contextLinkSchema).max(20).default([])
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid context link payload.');
      }

      try {
        const change = await updateTestChangeContextLinks(
          request.user.userId,
          params.data.changeId,
          body.data.contextLinks
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update context links.'
        );
      }
    }
  );

  server.patch(
    '/changes/:changeId/test-server-version',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({ testServerVersion: testServerVersionSchema });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid version update payload.');
      }

      try {
        const change = await setTestChangeTestServerVersion(
          request.user.userId,
          params.data.changeId,
          body.data.testServerVersion
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update change version.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/webhook-reports',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({ messageId: z.string().min(1) });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid webhook report link payload.');
      }

      try {
        const change = await linkWebhookReportToTestChange(
          request.user.userId,
          params.data.changeId,
          body.data.messageId
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to link webhook report.'
        );
      }
    }
  );

  server.delete(
    '/changes/:changeId/webhook-reports/:messageId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        messageId: z.string().min(1)
      });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.badRequest('Invalid webhook report unlink payload.');
      }

      try {
        const change = await unlinkWebhookReportFromTestChange(
          request.user.userId,
          params.data.changeId,
          params.data.messageId
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to unlink webhook report.'
        );
      }
    }
  );

  server.patch(
    '/changes/:changeId/status',
    { preHandler: [authenticate, requireCanView] },
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

  server.patch(
    '/changes/:changeId/next-patch',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({ includeInNextPatch: z.boolean() });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid next patch update payload.');
      }

      try {
        const change = await setTestChangeNextPatch(
          request.user.userId,
          params.data.changeId,
          body.data.includeInNextPatch
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update next patch.'
        );
      }
    }
  );

  server.patch(
    '/changes/:changeId/ready-to-test',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({ readyToTest: z.boolean() });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid ready-to-test update payload.');
      }

      try {
        const change = await setTestChangeReadyToTest(
          request.user.userId,
          params.data.changeId,
          body.data.readyToTest
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update ready-to-test status.'
        );
      }
    }
  );

  server.delete(
    '/changes/:changeId/testers/:testerId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        testerId: z.string().min(1)
      });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.badRequest(params.error.message);
      }

      try {
        const change = await removeTesterFromChange(
          request.user.userId,
          params.data.changeId,
          params.data.testerId
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to remove tester.'
        );
      }
    }
  );

  server.delete(
    '/changes/:changeId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
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
    { preHandler: [authenticate, requireCanView] },
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
    { preHandler: [authenticate, requireCanView] },
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
    { preHandler: [authenticate, requireCanView, requireAdmin] },
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
    '/changes/:changeId/checklist',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const bodySchema = z.object({
        title: z.string().trim().min(1).max(191),
        details: z.string().trim().max(1000).nullable().optional(),
        category: z.string().trim().max(80).nullable().optional()
      });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid checklist item payload.');
      }

      try {
        const change = await addTestChangeChecklistItem(
          request.user.userId,
          params.data.changeId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to add checklist item.'
        );
      }
    }
  );

  server.patch(
    '/changes/:changeId/checklist/:checklistItemId/shared',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        checklistItemId: z.string().min(1)
      });
      const bodySchema = z.object({ shared: z.boolean() });
      const params = paramsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid checklist sharing payload.');
      }

      try {
        const change = await setTestChangeChecklistItemShared(
          request.user.userId,
          params.data.changeId,
          params.data.checklistItemId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update checklist sharing.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/checklist/:checklistItemId',
    { preHandler: [authenticate, requireCanView] },
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
    { preHandler: [authenticate, requireCanView] },
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

  server.delete(
    '/changes/:changeId/checklist/:checklistItemId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        checklistItemId: z.string().min(1)
      });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.badRequest('Invalid checklist item payload.');
      }

      try {
        const change = await deleteTestChangeChecklistItem(
          request.user.userId,
          params.data.changeId,
          params.data.checklistItemId
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to delete checklist item.'
        );
      }
    }
  );

  const checklistGroupBodySchema = z.object({
    title: z.string().trim().min(1).max(191),
    category: z.string().trim().max(80).nullable().optional(),
    items: z.array(z.string()).min(1).max(500)
  });

  server.post(
    '/changes/:changeId/checklist/groups',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({ changeId: z.string().min(1) });
      const params = paramsSchema.safeParse(request.params);
      const body = checklistGroupBodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid sub-checklist payload.');
      }

      try {
        const change = await createTestChangeChecklistGroup(
          request.user.userId,
          params.data.changeId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to create sub-checklist.'
        );
      }
    }
  );

  server.put(
    '/changes/:changeId/checklist/groups/:groupId',
    { preHandler: [authenticate, requireCanView, requireAdmin] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        groupId: z.string().min(1)
      });
      const params = paramsSchema.safeParse(request.params);
      const body = checklistGroupBodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.badRequest('Invalid sub-checklist payload.');
      }

      try {
        const change = await updateTestChangeChecklistGroup(
          request.user.userId,
          params.data.changeId,
          params.data.groupId,
          body.data
        );
        return { change };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to update sub-checklist.'
        );
      }
    }
  );

  server.post(
    '/changes/:changeId/notes',
    { preHandler: [authenticate, requireCanView] },
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

  server.delete(
    '/changes/:changeId/notes/:noteId',
    { preHandler: [authenticate, requireCanView] },
    async (request, reply) => {
      const paramsSchema = z.object({
        changeId: z.string().min(1),
        noteId: z.string().min(1)
      });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.badRequest('Invalid note payload.');
      }

      try {
        const change = await deleteChangeNote(
          request.user.userId,
          params.data.changeId,
          params.data.noteId
        );
        return { change };
      } catch (error) {
        if (error instanceof Error && /own notes/i.test(error.message)) {
          return reply.forbidden(error.message);
        }
        return reply.badRequest(error instanceof Error ? error.message : 'Unable to delete note.');
      }
    }
  );

  server.get(
    '/users',
    { preHandler: [authenticate, requireCanView, requireCanManageTesters] },
    async () => {
      return listTestManagerUsers();
    }
  );

  server.patch(
    '/users/:userId',
    { preHandler: [authenticate, requireCanView, requireCanManageTesters] },
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

  server.get(
    '/settings',
    { preHandler: [authenticate, requireCanView, requireCanManageSettings] },
    async () => {
      return getTestManagerSettings();
    }
  );

  server.put(
    '/settings',
    { preHandler: [authenticate, requireCanView, requireCanManageSettings] },
    async (request, reply) => {
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
    }
  );
}
