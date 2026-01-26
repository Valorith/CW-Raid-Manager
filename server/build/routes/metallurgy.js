import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin } from '../services/adminService.js';
import { createMetallurgySnapshot, deleteMetallurgySnapshot, fetchAllMetallurgyData, fetchMetallurgyOreData, fetchMetallurgySnapshots, fetchMetallurgyWeights, getLatestMetallurgySnapshot, getMetallurgySnapshotSummary, METALLURGY_ORES } from '../services/metallurgyService.js';
async function requireAdmin(request, reply) {
    try {
        await ensureAdmin(request.user.userId);
    }
    catch (error) {
        request.log.warn({ error }, 'Non-admin attempted to access metallurgy admin route.');
        return reply.forbidden('Administrator privileges required.');
    }
}
export async function metallurgyRoutes(server) {
    /**
     * GET /api/admin/metallurgy
     * Fetch all metallurgy data (ores and weights) in a single request
     */
    server.get('/', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const data = await fetchAllMetallurgyData();
            return { data };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch metallurgy data.');
            return reply.internalServerError('Unable to fetch metallurgy data.');
        }
    });
    /**
     * GET /api/admin/metallurgy/ores
     * Fetch ore inventory data only
     */
    server.get('/ores', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const ores = await fetchMetallurgyOreData();
            return { ores };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch metallurgy ore data.');
            return reply.internalServerError('Unable to fetch ore inventory data.');
        }
    });
    /**
     * GET /api/admin/metallurgy/weights
     * Fetch metallurgy weight data only
     */
    server.get('/weights', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const weights = await fetchMetallurgyWeights();
            return { weights };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch metallurgy weight data.');
            return reply.internalServerError('Unable to fetch metallurgy weight data.');
        }
    });
    /**
     * GET /api/admin/metallurgy/ore-definitions
     * Get the list of ore definitions (names, IDs, tiers)
     */
    server.get('/ore-definitions', {
        preHandler: [authenticate, requireAdmin]
    }, async () => {
        return { ores: METALLURGY_ORES };
    });
    // =========================================================================
    // Snapshot Endpoints
    // =========================================================================
    /**
     * GET /api/admin/metallurgy/snapshots
     * Fetch metallurgy snapshots with optional date range filtering
     */
    server.get('/snapshots', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const { startDate, endDate, days } = request.query;
            let start;
            let end;
            // If days is provided, calculate date range
            if (days) {
                const daysNum = parseInt(days, 10);
                if (!isNaN(daysNum) && daysNum > 0) {
                    end = new Date();
                    start = new Date();
                    start.setDate(start.getDate() - daysNum);
                }
            }
            else {
                // Use explicit date range if provided
                if (startDate) {
                    start = new Date(startDate);
                    if (isNaN(start.getTime())) {
                        return reply.badRequest('Invalid startDate format');
                    }
                }
                if (endDate) {
                    end = new Date(endDate);
                    if (isNaN(end.getTime())) {
                        return reply.badRequest('Invalid endDate format');
                    }
                }
            }
            const snapshots = await fetchMetallurgySnapshots(start, end);
            return { snapshots };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch metallurgy snapshots.');
            return reply.internalServerError('Unable to fetch metallurgy snapshots.');
        }
    });
    /**
     * GET /api/admin/metallurgy/snapshots/latest
     * Get the most recent metallurgy snapshot
     */
    server.get('/snapshots/latest', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const snapshot = await getLatestMetallurgySnapshot();
            return { snapshot };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch latest metallurgy snapshot.');
            return reply.internalServerError('Unable to fetch latest snapshot.');
        }
    });
    /**
     * POST /api/admin/metallurgy/snapshots
     * Create a new metallurgy snapshot manually
     */
    server.post('/snapshots', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const snapshot = await createMetallurgySnapshot(request.user.userId);
            return { snapshot };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to create metallurgy snapshot.');
            return reply.internalServerError('Unable to create metallurgy snapshot.');
        }
    });
    /**
     * DELETE /api/admin/metallurgy/snapshots/:snapshotId
     * Delete a metallurgy snapshot by ID
     */
    server.delete('/snapshots/:snapshotId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const { snapshotId } = request.params;
            await deleteMetallurgySnapshot(snapshotId);
            return { success: true };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to delete metallurgy snapshot.');
            return reply.internalServerError('Unable to delete metallurgy snapshot.');
        }
    });
    /**
     * GET /api/admin/metallurgy/summary
     * Get metallurgy snapshot summary (count and date range)
     */
    server.get('/summary', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const summary = await getMetallurgySnapshotSummary();
            return { summary };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch metallurgy summary.');
            return reply.internalServerError('Unable to fetch metallurgy summary.');
        }
    });
}
