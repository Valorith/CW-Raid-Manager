import { createHash } from 'crypto';

import { CodexJobStatus, Prisma } from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { appConfig } from '../config/appConfig.js';
import {
  claimNextCodexJob,
  cancelCodexJob,
  createAdHocCodexJob,
  getCodexJob,
  isCodexRunnerConfigured,
  listCodexJobs,
  retryCodexJob,
  updateCodexJobFromRunner
} from '../services/codexJobService.js';

const claimBodySchema = z.object({
  runnerId: z.string().min(1).max(120)
});

const statusBodySchema = z.object({
  runnerId: z.string().min(1).max(120),
  status: z.nativeEnum(CodexJobStatus).optional(),
  statusMessage: z.string().max(10_000).nullable().optional(),
  error: z.string().max(200_000).nullable().optional(),
  output: z.string().max(500_000).nullable().optional(),
  prUrl: z.string().url().nullable().optional(),
  prNumber: z.number().int().positive().nullable().optional(),
  result: z.unknown().optional()
});

const paramsSchema = z.object({
  jobId: z.string().min(1)
});

const listJobsQuerySchema = z.object({
  status: z.string().optional(),
  runnerId: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

const jobDetailQuerySchema = z.object({
  detail: z.string().optional()
});

const createJobBodySchema = z.object({
  targetRepository: z.string().min(3).max(120).optional(),
  baseBranch: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(160).optional(),
  prompt: z.string().min(10).max(180_000)
});

const cancelBodySchema = z.object({
  reason: z.string().max(1_000).optional()
});

export async function codexRunnerRoutes(server: FastifyInstance): Promise<void> {
  server.get('/health', async () => ({
    configured: isCodexRunnerConfigured()
  }));

  server.get('/jobs', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const queryResult = listJobsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.badRequest('Invalid Codex job list query.');
    }

    const statuses = parseStatusList(queryResult.data.status);
    if (!statuses.ok) {
      return reply.badRequest('Invalid Codex job status filter.');
    }

    try {
      const jobs = await listCodexJobs({
        statuses: statuses.value,
        runnerId: queryResult.data.runnerId,
        limit: queryResult.data.limit
      });
      return reply.send({ jobs });
    } catch (error) {
      request.log.error({ error }, 'Failed to list Codex jobs.');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to list Codex jobs.');
    }
  });

  server.post('/jobs', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const bodyResult = createJobBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.badRequest('Invalid Codex job creation payload.');
    }

    try {
      const job = await createAdHocCodexJob(bodyResult.data);
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to create Codex job.');
      return reply.badRequest(
        error instanceof Error ? error.message : 'Unable to create Codex job.'
      );
    }
  });

  server.post('/jobs/claim', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const bodyResult = claimBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.badRequest('Invalid Codex runner claim payload.');
    }

    try {
      const job = await claimNextCodexJob(bodyResult.data.runnerId);
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to claim Codex job.');
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to claim Codex job.');
    }
  });

  server.get('/jobs/:jobId', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const params = paramsSchema.parse(request.params);
    const queryResult = jobDetailQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.badRequest('Invalid Codex job detail query.');
    }

    try {
      const job = await getCodexJob(params.jobId, {
        includeDetail: parseBooleanQuery(queryResult.data.detail)
      });
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to read Codex job.');
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to read Codex job.');
    }
  });

  server.post('/jobs/:jobId/status', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const params = paramsSchema.parse(request.params);
    const bodyResult = statusBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.badRequest('Invalid Codex runner status payload.');
    }

    try {
      const { runnerId, result, ...rest } = bodyResult.data;
      const job = await updateCodexJobFromRunner(params.jobId, runnerId, {
        ...rest,
        ...(result === undefined ? {} : { result: result as Prisma.InputJsonValue })
      });
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to update Codex job.');
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(
        error instanceof Error ? error.message : 'Unable to update Codex job.'
      );
    }
  });

  server.post('/jobs/:jobId/cancel', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const params = paramsSchema.parse(request.params);
    const bodyResult = cancelBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.badRequest('Invalid Codex job cancel payload.');
    }

    try {
      const job = await cancelCodexJob(params.jobId, bodyResult.data.reason);
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to cancel Codex job.');
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(
        error instanceof Error ? error.message : 'Unable to cancel Codex job.'
      );
    }
  });

  server.post('/jobs/:jobId/retry', async (request, reply) => {
    if (!authenticateRunner(request, reply)) {
      return;
    }

    const params = paramsSchema.parse(request.params);

    try {
      const job = await retryCodexJob(params.jobId);
      return reply.send({ job });
    } catch (error) {
      request.log.error({ error }, 'Failed to retry Codex job.');
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.notFound(error.message);
      }
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to retry Codex job.');
    }
  });
}

function authenticateRunner(request: FastifyRequest, reply: FastifyReply) {
  const expectedToken = appConfig.codexRunner.token;
  if (!expectedToken) {
    reply.code(503).send({ error: 'Codex runner token is not configured.' });
    return false;
  }

  const authorization = request.headers.authorization;
  const token =
    typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice('bearer '.length).trim()
      : null;

  if (!token || !tokensMatch(token, expectedToken)) {
    reply.code(401).send({ error: 'Unauthorized Codex runner request.' });
    return false;
  }

  return true;
}

function tokensMatch(actual: string, expected: string) {
  const actualHash = createHash('sha256').update(actual).digest('hex');
  const expectedHash = createHash('sha256').update(expected).digest('hex');
  return actualHash === expectedHash;
}

function parseStatusList(value: string | undefined):
  | { ok: true; value: CodexJobStatus[] | undefined }
  | { ok: false } {
  if (!value?.trim()) {
    return { ok: true, value: undefined };
  }
  const statuses = value
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  const validStatuses = new Set(Object.values(CodexJobStatus));
  if (statuses.some((status) => !validStatuses.has(status as CodexJobStatus))) {
    return { ok: false };
  }
  return { ok: true, value: statuses as CodexJobStatus[] };
}

function parseBooleanQuery(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() || '');
}
