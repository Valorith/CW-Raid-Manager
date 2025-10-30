import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { ensureUserCanViewGuild } from '../services/raidService.js';
import { getGuildMetrics } from '../services/metricsService.js';

function parseDate(value?: string | null): { date: Date | null; original: string | null } {
  if (!value) {
    return { date: null, original: null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, original: value };
  }
  return { date: parsed, original: value };
}

function adjustEndOfDay(date: Date, original?: string | null) {
  if (!original) {
    return date;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(original)) {
    const adjusted = new Date(date);
    adjusted.setHours(23, 59, 59, 999);
    return adjusted;
  }
  return date;
}

export async function guildMetricsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/:guildId/metrics', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({
      guildId: z.string()
    });
    const querySchema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional()
    });

    const { guildId } = paramsSchema.parse(request.params);
    const parsedQuery = querySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      return reply.badRequest('Invalid metrics query.');
    }

    const { startDate: startRaw, endDate: endRaw } = parsedQuery.data;
    const { date: parsedStart, original: startOriginal } = parseDate(startRaw ?? null);
    const { date: parsedEnd, original: endOriginal } = parseDate(endRaw ?? null);

    if (startRaw && !parsedStart) {
      return reply.badRequest('Invalid startDate parameter.');
    }

    if (endRaw && !parsedEnd) {
      return reply.badRequest('Invalid endDate parameter.');
    }

    const now = new Date();
    const end = parsedEnd ? adjustEndOfDay(parsedEnd, endOriginal) : now;
    const start = parsedStart
      ? parsedStart
      : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

    if (start.getTime() > end.getTime()) {
      return reply.badRequest('startDate must be before endDate.');
    }

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch (error) {
      request.log.warn({ error }, 'Unauthorized metrics access attempt.');
      return reply.forbidden('You must be a guild member to view metrics.');
    }

    const metrics = await getGuildMetrics({
      guildId,
      start,
      end
    });

    return { metrics };
  });
}
