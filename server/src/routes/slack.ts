import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { appConfig } from '../config/appConfig.js';
import { completeSlackInstall } from '../services/slackIntegrationService.js';

function buildRedirectUrl(returnPath: string | null, status: 'success' | 'error', message?: string) {
  const base = appConfig.clientUrl.replace(/\/+$/, '');
  const path = returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/';
  const url = new URL(path, `${base}/`);
  url.searchParams.set('slackInstall', status);
  if (message) {
    url.searchParams.set('slackMessage', message.slice(0, 240));
  }
  return url.toString();
}

export async function slackRoutes(server: FastifyInstance): Promise<void> {
  server.get('/oauth/callback', async (request, reply) => {
    const querySchema = z.object({
      code: z.string().min(1).optional(),
      state: z.string().min(1).optional(),
      error: z.string().optional()
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.redirect(buildRedirectUrl(null, 'error', 'Invalid Slack callback.'));
    }

    if (query.data.error) {
      return reply.redirect(buildRedirectUrl(null, 'error', query.data.error));
    }

    if (!query.data.code || !query.data.state) {
      return reply.redirect(buildRedirectUrl(null, 'error', 'Missing Slack OAuth code or state.'));
    }

    try {
      const result = await completeSlackInstall({
        code: query.data.code,
        state: query.data.state
      });
      return reply.redirect(buildRedirectUrl(result.returnPath, 'success'));
    } catch (error) {
      request.log.error({ error }, 'Slack OAuth install failed.');
      return reply.redirect(
        buildRedirectUrl(
          null,
          'error',
          error instanceof Error ? error.message : 'Slack OAuth install failed.'
        )
      );
    }
  });
}
