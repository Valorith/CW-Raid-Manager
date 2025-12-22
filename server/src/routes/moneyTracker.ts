import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin } from '../services/adminService.js';
import {
  createMoneySnapshot,
  deleteSnapshot,
  fetchServerCurrencyTotals,
  fetchSharedBankTotals,
  fetchTopCharactersByCurrency,
  fetchTopSharedBanks,
  getLatestSnapshot,
  getMoneyTrackerSummary,
  getSettings,
  getSnapshotsInRange,
  updateSettings
} from '../services/moneyTrackerService.js';
import {
  getNextScheduledTime,
  isSchedulerRunning
} from '../services/moneyTrackerScheduler.js';
import { isEqDbConfigured } from '../utils/eqDb.js';

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply> {
  try {
    await ensureAdmin(request.user.userId);
  } catch (error) {
    request.log.warn({ error }, 'Non-admin attempted to access money tracker admin route.');
    return reply.forbidden('Administrator privileges required.');
  }
}

// Helper to convert BigInt to string for JSON serialization
function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
  );
}

export async function moneyTrackerRoutes(server: FastifyInstance): Promise<void> {
  // Check if EQ database is configured
  server.get(
    '/status',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async () => {
      return {
        configured: isEqDbConfigured()
      };
    }
  );

  // Get summary statistics
  server.get(
    '/summary',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const summary = await getMoneyTrackerSummary();
        return serializeBigInt(summary);
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch money tracker summary.');
        return reply.internalServerError('Unable to fetch money tracker summary.');
      }
    }
  );

  // Get historical snapshots for graphing
  server.get(
    '/snapshots',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const querySchema = z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.coerce.number().int().positive().max(365).default(90)
      });

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.badRequest('Invalid query parameters.');
      }

      try {
        const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : undefined;
        const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : undefined;

        const snapshots = await getSnapshotsInRange(startDate, endDate, parsed.data.limit);
        return serializeBigInt({ snapshots });
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch money snapshots.');
        return reply.internalServerError('Unable to fetch money snapshots.');
      }
    }
  );

  // Get the latest snapshot
  server.get(
    '/snapshots/latest',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const snapshot = await getLatestSnapshot();
        return serializeBigInt({ snapshot });
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch latest snapshot.');
        return reply.internalServerError('Unable to fetch latest snapshot.');
      }
    }
  );

  // Get current live data from EQEmu (not a snapshot)
  server.get(
    '/live',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      if (!isEqDbConfigured()) {
        return reply.badRequest('EQ database is not configured.');
      }

      try {
        const [totals, topCharacters, sharedBankTotals, topSharedBanks] = await Promise.all([
          fetchServerCurrencyTotals(),
          fetchTopCharactersByCurrency(20),
          fetchSharedBankTotals(),
          fetchTopSharedBanks(20)
        ]);

        // Calculate combined total including shared bank platinum
        // Character currency totals are in copper, shared bank is in platinum
        const sharedBankInCopper = sharedBankTotals.totalSharedPlatinum * BigInt(1000);
        const grandTotalPlatinumEquivalent = totals.totalPlatinumEquivalent + sharedBankInCopper;

        return serializeBigInt({
          totals: {
            ...totals,
            totalSharedPlatinum: sharedBankTotals.totalSharedPlatinum,
            grandTotalPlatinumEquivalent
          },
          topCharacters,
          topSharedBanks,
          sharedBankAccountCount: sharedBankTotals.accountCount,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch live currency data.');
        return reply.internalServerError('Unable to fetch live currency data.');
      }
    }
  );

  // Create a new snapshot (manual trigger)
  server.post(
    '/snapshots',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      if (!isEqDbConfigured()) {
        return reply.badRequest('EQ database is not configured.');
      }

      try {
        const snapshot = await createMoneySnapshot(request.user.userId);
        return serializeBigInt({ snapshot });
      } catch (error) {
        request.log.error({ error }, 'Failed to create money snapshot.');
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.conflict(error.message);
        }
        return reply.internalServerError('Unable to create money snapshot.');
      }
    }
  );

  // Delete a snapshot (admin only)
  server.delete(
    '/snapshots/:snapshotId',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        snapshotId: z.string()
      });

      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.badRequest('Invalid snapshot ID.');
      }

      try {
        await deleteSnapshot(parsed.data.snapshotId);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete money snapshot.');
        return reply.internalServerError('Unable to delete money snapshot.');
      }
    }
  );

  // Get auto-snapshot settings
  server.get(
    '/settings',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      try {
        const settings = await getSettings();
        const nextScheduledTime = await getNextScheduledTime();
        const schedulerRunning = isSchedulerRunning();

        return {
          ...settings,
          nextScheduledTime: nextScheduledTime?.toISOString() ?? null,
          schedulerRunning
        };
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch money tracker settings.');
        return reply.internalServerError('Unable to fetch settings.');
      }
    }
  );

  // Update auto-snapshot settings
  server.patch(
    '/settings',
    {
      preHandler: [authenticate, requireAdmin]
    },
    async (request, reply) => {
      const bodySchema = z.object({
        autoSnapshotEnabled: z.boolean().optional(),
        snapshotHour: z.number().int().min(0).max(23).optional(),
        snapshotMinute: z.number().int().min(0).max(59).optional()
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Invalid settings data.');
      }

      try {
        const settings = await updateSettings(parsed.data, request.user.userId);
        const nextScheduledTime = await getNextScheduledTime();
        const schedulerRunning = isSchedulerRunning();

        return {
          ...settings,
          nextScheduledTime: nextScheduledTime?.toISOString() ?? null,
          schedulerRunning
        };
      } catch (error) {
        request.log.error({ error }, 'Failed to update money tracker settings.');
        if (error instanceof Error) {
          return reply.badRequest(error.message);
        }
        return reply.internalServerError('Unable to update settings.');
      }
    }
  );
}
