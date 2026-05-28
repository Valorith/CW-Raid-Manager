import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  approveCliDeviceLogin,
  createCliDeviceLogin,
  denyCliDeviceLogin,
  exchangeCliDeviceCode,
  getCliDeviceLoginForApproval,
  listCliSessions,
  revokeCliSession
} from '../services/cliAuthService.js';

const userCodeParamsSchema = z.object({
  userCode: z.string().trim().min(1).max(32)
});

const DEVICE_LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;
const DEVICE_LOGIN_RATE_LIMIT = 10;
const deviceLoginAttempts = new Map<string, number[]>();

function allowDeviceLoginAttempt(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - DEVICE_LOGIN_RATE_WINDOW_MS;
  const attempts = (deviceLoginAttempts.get(ip) ?? []).filter((timestamp) => timestamp > windowStart);
  attempts.push(now);
  deviceLoginAttempts.set(ip, attempts);
  return attempts.length <= DEVICE_LOGIN_RATE_LIMIT;
}

export async function cliAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post('/device', async (request, reply) => {
    if (!allowDeviceLoginAttempt(request.ip)) {
      return reply.code(429).send({
        error: 'Too Many Requests',
        message: 'Too many CLI login requests. Please wait before trying again.'
      });
    }

    const bodySchema = z.object({
      clientName: z.string().trim().max(191).optional()
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.badRequest('Invalid CLI device login payload.');
    }

    return createCliDeviceLogin(parsed.data);
  });

  server.post('/device/token', async (request, reply) => {
    const bodySchema = z.object({
      deviceCode: z.string().trim().min(1).max(512)
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.badRequest('Invalid CLI device token payload.');
    }

    const result = await exchangeCliDeviceCode(parsed.data.deviceCode);
    if (result.status === 'invalid') {
      return reply.badRequest('Invalid CLI device code.');
    }
    if (result.status === 'expired') {
      return reply.code(410).send({ status: 'expired' });
    }
    if (result.status === 'denied') {
      return reply.forbidden('CLI login request was denied.');
    }
    if (result.status === 'consumed') {
      return reply.conflict('CLI login request was already used.');
    }

    return result;
  });

  server.get('/device/:userCode', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = userCodeParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest('Invalid CLI user code.');
    }

    const login = await getCliDeviceLoginForApproval(parsed.data.userCode);
    if (!login) {
      return reply.notFound('CLI login request not found.');
    }

    return { login };
  });

  server.post(
    '/device/:userCode/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = userCodeParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid CLI user code.');
      }

      try {
        const login = await approveCliDeviceLogin(request.user.userId, parsed.data.userCode);
        return { login };
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : 'Unable to approve CLI login.'
        );
      }
    }
  );

  server.post('/device/:userCode/deny', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = userCodeParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest('Invalid CLI user code.');
    }

    try {
      const login = await denyCliDeviceLogin(request.user.userId, parsed.data.userCode);
      return { login };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : 'Unable to deny CLI login.');
    }
  });

  server.get('/sessions', { preHandler: [authenticate] }, async (request) => {
    return listCliSessions(request.user.userId);
  });

  server.delete('/sessions/:sessionId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ sessionId: z.string().trim().min(1) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest('Invalid CLI session id.');
    }

    try {
      await revokeCliSession(request.user.userId, parsed.data.sessionId);
      return reply.code(204).send();
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : 'Unable to revoke CLI session.'
      );
    }
  });

  server.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user.cliSessionId) {
      return reply.badRequest('The current request is not authenticated with a CLI session.');
    }

    await revokeCliSession(request.user.userId, request.user.cliSessionId);
    return { success: true };
  });
}
