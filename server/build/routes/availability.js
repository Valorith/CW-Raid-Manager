import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { getUserAvailability, updateUserAvailability, deleteUserAvailability, getGuildAvailabilitySummary, getGuildAvailabilityDetails } from '../services/availabilityService.js';
import { ensureUserCanViewGuild } from '../services/raidService.js';
export async function availabilityRoutes(server) {
    /**
     * GET /availability/guild/:guildId/me
     * Get current user's availability entries for a guild within a date range
     */
    server.get('/guild/:guildId/me', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const querySchema = z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const query = querySchema.parse(request.query);
        // Default to current month if no dates provided
        const now = new Date();
        const startDate = query.startDate
            ? new Date(query.startDate)
            : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = query.endDate
            ? new Date(query.endDate)
            : new Date(now.getFullYear(), now.getMonth() + 2, 0);
        try {
            const entries = await getUserAvailability(request.user.userId, guildId, startDate, endDate);
            return { availability: entries };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('member of the guild')) {
                return reply.forbidden('You are not a member of this guild.');
            }
            request.log.warn({ error }, 'Failed to fetch user availability.');
            return reply.internalServerError('Unable to fetch availability.');
        }
    });
    /**
     * GET /availability/guild/:guildId/summary
     * Get availability summary (counts) for a guild
     */
    server.get('/guild/:guildId/summary', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const querySchema = z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const query = querySchema.parse(request.query);
        try {
            await ensureUserCanViewGuild(request.user.userId, guildId);
        }
        catch (error) {
            return reply.forbidden('You are not a member of this guild.');
        }
        // Default to current month if no dates provided
        const now = new Date();
        const startDate = query.startDate
            ? new Date(query.startDate)
            : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = query.endDate
            ? new Date(query.endDate)
            : new Date(now.getFullYear(), now.getMonth() + 2, 0);
        try {
            const summary = await getGuildAvailabilitySummary(guildId, startDate, endDate);
            return { summary };
        }
        catch (error) {
            request.log.warn({ error }, 'Failed to fetch guild availability summary.');
            return reply.internalServerError('Unable to fetch availability summary.');
        }
    });
    /**
     * GET /availability/guild/:guildId/details
     * Get detailed availability (with user info) for a specific date
     */
    server.get('/guild/:guildId/details', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const querySchema = z.object({
            date: z.string()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const query = querySchema.safeParse(request.query);
        if (!query.success) {
            return reply.badRequest('Date parameter is required.');
        }
        try {
            await ensureUserCanViewGuild(request.user.userId, guildId);
        }
        catch (error) {
            return reply.forbidden('You are not a member of this guild.');
        }
        try {
            const date = new Date(query.data.date + 'T00:00:00.000Z');
            if (Number.isNaN(date.getTime())) {
                return reply.badRequest('Invalid date format.');
            }
            const details = await getGuildAvailabilityDetails(guildId, date);
            return { details };
        }
        catch (error) {
            request.log.warn({ error }, 'Failed to fetch guild availability details.');
            return reply.internalServerError('Unable to fetch availability details.');
        }
    });
    /**
     * PUT /availability/guild/:guildId/me
     * Update current user's availability entries
     */
    server.put('/guild/:guildId/me', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const bodySchema = z.object({
            updates: z.array(z.object({
                date: z.string(),
                status: z.enum(['AVAILABLE', 'UNAVAILABLE'])
            }))
        });
        const { guildId } = paramsSchema.parse(request.params);
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid availability payload.');
        }
        try {
            const entries = await updateUserAvailability(request.user.userId, guildId, parsed.data.updates);
            return { availability: entries };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('member of the guild')) {
                return reply.forbidden('You are not a member of this guild.');
            }
            request.log.warn({ error }, 'Failed to update user availability.');
            return reply.internalServerError('Unable to update availability.');
        }
    });
    /**
     * DELETE /availability/guild/:guildId/me
     * Delete availability entries for specific dates
     */
    server.delete('/guild/:guildId/me', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const bodySchema = z.object({
            dates: z.array(z.string())
        });
        const { guildId } = paramsSchema.parse(request.params);
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid deletion payload.');
        }
        try {
            const deleted = await deleteUserAvailability(request.user.userId, guildId, parsed.data.dates);
            return { deleted };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('member of the guild')) {
                return reply.forbidden('You are not a member of this guild.');
            }
            request.log.warn({ error }, 'Failed to delete user availability.');
            return reply.internalServerError('Unable to delete availability.');
        }
    });
}
