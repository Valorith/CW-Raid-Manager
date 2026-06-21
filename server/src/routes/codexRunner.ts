import { createHash } from 'crypto';

import { CodexJobStatus, Prisma } from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { appConfig } from '../config/appConfig.js';
import {
  claimNextCodexJob,
  isCodexRunnerConfigured,
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

export async function codexRunnerRoutes(server: FastifyInstance): Promise<void> {
  server.get('/health', async () => ({
    configured: isCodexRunnerConfigured()
  }));

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
