import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { ensureMarketSalesFresh, getMarketItemHistory, getMarketRecentSalesPage, getMarketSummary, searchMarketItems } from '../services/marketService.js';
export async function marketRoutes(server) {
    server.get('/summary', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const querySchema = z.object({
            days: z.coerce.number().int().min(1).max(3650).optional(),
            topItemsSort: z.enum(['quantity', 'value']).default('quantity')
        });
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.badRequest('Invalid query parameters.');
        }
        try {
            await ensureMarketSalesFresh({ logger: request.log });
            const summary = await getMarketSummary(parsed.data.days, parsed.data.topItemsSort);
            return { summary };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch market summary.');
            return reply.internalServerError('Unable to fetch market summary.');
        }
    });
    server.get('/items/search', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const querySchema = z.object({
            q: z.string().trim().min(2).max(100),
            limit: z.coerce.number().int().min(1).max(25).default(12)
        });
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.badRequest('Search query must be at least 2 characters.');
        }
        try {
            await ensureMarketSalesFresh({ logger: request.log, maxBatches: 2 });
            const items = await searchMarketItems(parsed.data.q, parsed.data.limit);
            return { items };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to search market items.');
            return reply.internalServerError('Unable to search market items.');
        }
    });
    server.get('/sales', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const querySchema = z.object({
            itemId: z.coerce.number().int().positive().optional(),
            itemName: z.string().trim().min(1).max(191).optional(),
            days: z.coerce.number().int().min(1).max(3650).optional(),
            page: z.coerce.number().int().min(1).default(1),
            pageSize: z.coerce.number().int().min(5).max(50).default(10)
        });
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.badRequest('Invalid query parameters.');
        }
        try {
            await ensureMarketSalesFresh({ logger: request.log });
            const salesPage = await getMarketRecentSalesPage({
                itemId: parsed.data.itemId,
                itemName: parsed.data.itemName,
                rangeDays: parsed.data.days,
                page: parsed.data.page,
                pageSize: parsed.data.pageSize
            });
            return { salesPage };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch market sales page.');
            return reply.internalServerError('Unable to fetch market sales.');
        }
    });
    server.get('/history', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const querySchema = z
            .object({
            itemId: z.coerce.number().int().positive().optional(),
            itemName: z.string().trim().min(1).max(191).optional(),
            days: z.coerce.number().int().min(1).max(3650).optional(),
            pointLimit: z.coerce.number().int().min(20).max(500).default(200)
        })
            .refine((value) => value.itemId != null || Boolean(value.itemName), {
            message: 'Provide either itemId or itemName.'
        });
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
        }
        try {
            await ensureMarketSalesFresh({ logger: request.log });
            const history = await getMarketItemHistory({
                itemId: parsed.data.itemId,
                itemName: parsed.data.itemName,
                rangeDays: parsed.data.days,
                pointLimit: parsed.data.pointLimit
            });
            if (!history) {
                return reply.notFound('No market history found for that item.');
            }
            return { history };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to fetch market item history.');
            return reply.internalServerError('Unable to fetch market item history.');
        }
    });
}
