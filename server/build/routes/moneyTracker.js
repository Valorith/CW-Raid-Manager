import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { ensureAdmin } from '../services/adminService.js';
import { createMoneySnapshot, deleteSnapshot, fetchGuildBankTotals, fetchServerCurrencyTotals, fetchSharedBankTotals, fetchTopCharactersByCurrency, fetchTopGuildBanks, fetchTopSharedBanks, getLatestSnapshot, getMoneyTrackerSummary, getSettings, getSnapshotsInRange, updateSettings } from '../services/moneyTrackerService.js';
import { getNextScheduledTime, isSchedulerRunning } from '../services/moneyTrackerScheduler.js';
import { isEqDbConfigured } from '../utils/eqDb.js';
async function requireAdmin(request, reply) {
    try {
        await ensureAdmin(request.user.userId);
    }
    catch (error) {
        request.log.warn({ error }, 'Non-admin attempted to access money tracker admin route.');
        return reply.forbidden('Administrator privileges required.');
    }
}
// Helper to convert BigInt to string for JSON serialization
function serializeBigInt(obj) {
    return JSON.parse(JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value)));
}
export async function moneyTrackerRoutes(server) {
    // Check if EQ database is configured
    server.get('/status', {
        preHandler: [authenticate, requireAdmin]
    }, async () => {
        return {
            configured: isEqDbConfigured()
        };
    });
    // Get summary statistics
    server.get('/summary', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const summary = await getMoneyTrackerSummary();
            return serializeBigInt(summary);
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch money tracker summary.');
            return reply.internalServerError('Unable to fetch money tracker summary.');
        }
    });
    // Get historical snapshots for graphing
    server.get('/snapshots', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const querySchema = z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.coerce.number().int().positive().max(10000).default(90)
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
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch money snapshots.');
            return reply.internalServerError('Unable to fetch money snapshots.');
        }
    });
    // Get the latest snapshot
    server.get('/snapshots/latest', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const snapshot = await getLatestSnapshot();
            return serializeBigInt({ snapshot });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch latest snapshot.');
            return reply.internalServerError('Unable to fetch latest snapshot.');
        }
    });
    // Get current live data from EQEmu (not a snapshot)
    server.get('/live', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        if (!isEqDbConfigured()) {
            return reply.badRequest('EQ database is not configured.');
        }
        try {
            const [totals, topCharacters, sharedBankTotals, topSharedBanks, guildBankTotals, topGuildBanks] = await Promise.all([
                fetchServerCurrencyTotals(),
                fetchTopCharactersByCurrency(20),
                fetchSharedBankTotals(),
                fetchTopSharedBanks(20),
                fetchGuildBankTotals(),
                fetchTopGuildBanks(20)
            ]);
            // Calculate combined total including shared bank and guild bank platinum
            // Character currency totals are in copper, shared bank and guild bank are in platinum
            const sharedBankInCopper = sharedBankTotals.totalSharedPlatinum * BigInt(1000);
            const guildBankInCopper = guildBankTotals.totalGuildBankPlatinum * BigInt(1000);
            const grandTotalPlatinumEquivalent = totals.totalPlatinumEquivalent + sharedBankInCopper + guildBankInCopper;
            return serializeBigInt({
                totals: {
                    ...totals,
                    totalSharedPlatinum: sharedBankTotals.totalSharedPlatinum,
                    totalGuildBankPlatinum: guildBankTotals.totalGuildBankPlatinum,
                    grandTotalPlatinumEquivalent
                },
                topCharacters,
                topSharedBanks,
                topGuildBanks,
                sharedBankAccountCount: sharedBankTotals.accountCount,
                guildBankCount: guildBankTotals.guildCount,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch live currency data.');
            return reply.internalServerError('Unable to fetch live currency data.');
        }
    });
    // Get live character currency data (all characters)
    server.get('/live/characters', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        if (!isEqDbConfigured()) {
            return reply.badRequest('EQ database is not configured.');
        }
        try {
            const [totals, characters] = await Promise.all([
                fetchServerCurrencyTotals(),
                fetchTopCharactersByCurrency() // No limit - fetch all
            ]);
            return serializeBigInt({
                characters,
                totals,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch character data.');
            return reply.internalServerError('Unable to fetch character data.');
        }
    });
    // Get live shared banks data (all accounts)
    server.get('/live/shared-banks', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        if (!isEqDbConfigured()) {
            return reply.badRequest('EQ database is not configured.');
        }
        try {
            const [sharedBankTotals, sharedBanks] = await Promise.all([
                fetchSharedBankTotals(),
                fetchTopSharedBanks() // No limit - fetch all
            ]);
            return serializeBigInt({
                sharedBanks,
                totalSharedPlatinum: sharedBankTotals.totalSharedPlatinum,
                sharedBankAccountCount: sharedBankTotals.accountCount,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch shared bank data.');
            return reply.internalServerError('Unable to fetch shared bank data.');
        }
    });
    // Get live guild banks data (all guilds with bank balances)
    server.get('/live/guild-banks', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        if (!isEqDbConfigured()) {
            return reply.badRequest('EQ database is not configured.');
        }
        try {
            const [guildBankTotals, guildBanks] = await Promise.all([
                fetchGuildBankTotals(),
                fetchTopGuildBanks() // No limit - fetch all
            ]);
            return serializeBigInt({
                guildBanks,
                totalGuildBankPlatinum: guildBankTotals.totalGuildBankPlatinum,
                guildBankCount: guildBankTotals.guildCount,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch guild bank data.');
            return reply.internalServerError('Unable to fetch guild bank data.');
        }
    });
    // Create a new snapshot (manual trigger)
    server.post('/snapshots', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        if (!isEqDbConfigured()) {
            return reply.badRequest('EQ database is not configured.');
        }
        try {
            const snapshot = await createMoneySnapshot(request.user.userId);
            return serializeBigInt({ snapshot });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to create money snapshot.');
            // Check for database unique constraint violation
            if (error instanceof Error && (error.message.includes('Unique constraint') ||
                error.message.includes('Duplicate entry'))) {
                return reply.conflict('A snapshot with this date already exists. Please delete the existing snapshot first or wait for the migration to complete.');
            }
            return reply.internalServerError('Unable to create money snapshot.');
        }
    });
    // Delete a snapshot (admin only)
    server.delete('/snapshots/:snapshotId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
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
        }
        catch (error) {
            request.log.error({ error }, 'Failed to delete money snapshot.');
            return reply.internalServerError('Unable to delete money snapshot.');
        }
    });
    // Get auto-snapshot settings
    server.get('/settings', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const settings = await getSettings();
            const nextScheduledTime = await getNextScheduledTime();
            const schedulerRunning = isSchedulerRunning();
            return {
                ...settings,
                nextScheduledTime: nextScheduledTime?.toISOString() ?? null,
                schedulerRunning
            };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch money tracker settings.');
            return reply.internalServerError('Unable to fetch settings.');
        }
    });
    // Update auto-snapshot settings
    server.patch('/settings', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
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
        }
        catch (error) {
            request.log.error({ error }, 'Failed to update money tracker settings.');
            if (error instanceof Error) {
                return reply.badRequest(error.message);
            }
            return reply.internalServerError('Unable to update settings.');
        }
    });
}
