import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin } from '../services/adminService.js';
import {
  fetchAllMetallurgyData,
  fetchMetallurgyOreData,
  fetchMetallurgyWeights,
  METALLURGY_ORES
} from '../services/metallurgyService.js';

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply> {
  try {
    await ensureAdmin(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'Non-admin attempted to access metallurgy admin route.');
    return reply.forbidden('Administrator privileges required.');
  }
}

export async function metallurgyRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/admin/metallurgy
   * Fetch all metallurgy data (ores and weights) in a single request
   */
  server.get(
    '/',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const data = await fetchAllMetallurgyData();
        return { data };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch metallurgy data.');
        return reply.internalServerError('Unable to fetch metallurgy data.');
      }
    }
  );

  /**
   * GET /api/admin/metallurgy/ores
   * Fetch ore inventory data only
   */
  server.get(
    '/ores',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const ores = await fetchMetallurgyOreData();
        return { ores };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch metallurgy ore data.');
        return reply.internalServerError('Unable to fetch ore inventory data.');
      }
    }
  );

  /**
   * GET /api/admin/metallurgy/weights
   * Fetch metallurgy weight data only
   */
  server.get(
    '/weights',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const weights = await fetchMetallurgyWeights();
        return { weights };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch metallurgy weight data.');
        return reply.internalServerError('Unable to fetch metallurgy weight data.');
      }
    }
  );

  /**
   * GET /api/admin/metallurgy/ore-definitions
   * Get the list of ore definitions (names, IDs, tiers)
   */
  server.get(
    '/ore-definitions',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      return { ores: METALLURGY_ORES };
    }
  );
}
