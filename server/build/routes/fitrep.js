import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { getActiveTemplates, getTemplateById, listReports, getReportById, createReport, updateReport, deleteReport, listExamples, createExample, deleteExample, createAiSession, seedE7E9Template, } from '../services/fitrepService.js';
export default async function fitrepRoutes(server) {
    server.addHook('onRequest', authenticate);
    // Templates
    server.get('/templates', async () => getActiveTemplates());
    server.get('/templates/:templateId', async (request, reply) => {
        const { templateId } = request.params;
        const template = await getTemplateById(templateId);
        if (!template)
            return reply.notFound('Template not found');
        return template;
    });
    server.post('/templates/seed', async () => seedE7E9Template());
    // Reports
    server.get('/:guildId/reports', async (request) => {
        const { guildId } = request.params;
        const query = request.query;
        return listReports(guildId, {
            status: query.status,
            limit: query.limit ? parseInt(query.limit) : undefined,
            offset: query.offset ? parseInt(query.offset) : undefined,
        });
    });
    server.get('/:guildId/reports/:reportId', async (request, reply) => {
        const { reportId } = request.params;
        const report = await getReportById(reportId);
        if (!report)
            return reply.notFound('Report not found');
        return report;
    });
    server.post('/:guildId/reports', async (request, reply) => {
        const { guildId } = request.params;
        const schema = z.object({
            templateId: z.string(),
            rateeName: z.string().min(1),
            rateeRank: z.string().optional(),
            raterName: z.string().min(1),
            raterRank: z.string().optional(),
            periodStart: z.string().optional(),
            periodEnd: z.string().optional(),
            formData: z.record(z.any()).default({}),
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success)
            return reply.badRequest(parsed.error.message);
        return reply.status(201).send(await createReport({
            guildId,
            ...parsed.data,
            periodStart: parsed.data.periodStart ? new Date(parsed.data.periodStart) : undefined,
            periodEnd: parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : undefined,
            createdById: request.user.userId,
        }));
    });
    server.patch('/:guildId/reports/:reportId', async (request, reply) => {
        const { reportId } = request.params;
        const schema = z.object({
            rateeName: z.string().optional(),
            rateeRank: z.string().optional(),
            raterName: z.string().optional(),
            raterRank: z.string().optional(),
            periodStart: z.string().optional(),
            periodEnd: z.string().optional(),
            formData: z.record(z.any()).optional(),
            status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED']).optional(),
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success)
            return reply.badRequest(parsed.error.message);
        return updateReport(reportId, {
            ...parsed.data,
            periodStart: parsed.data.periodStart ? new Date(parsed.data.periodStart) : undefined,
            periodEnd: parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : undefined,
            status: parsed.data.status,
        });
    });
    server.delete('/:guildId/reports/:reportId', async (request) => {
        const { reportId } = request.params;
        await deleteReport(reportId);
        return { success: true };
    });
    // Examples
    server.get('/:guildId/examples', async (request) => {
        const { guildId } = request.params;
        return listExamples(guildId, request.user.userId);
    });
    server.post('/:guildId/examples', async (request, reply) => {
        const { guildId } = request.params;
        const schema = z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            templateId: z.string().optional(),
            isPublic: z.boolean().default(false),
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success)
            return reply.badRequest(parsed.error.message);
        return reply.status(201).send(await createExample({
            guildId,
            ...parsed.data,
            uploadedById: request.user.userId,
        }));
    });
    server.delete('/:guildId/examples/:exampleId', async (request) => {
        const { exampleId } = request.params;
        await deleteExample(exampleId);
        return { success: true };
    });
    // AI Assist
    server.post('/:guildId/reports/:reportId/ai-assist', async (request, reply) => {
        const { reportId } = request.params;
        const schema = z.object({
            prompt: z.string().min(1),
            exampleIds: z.array(z.string()).optional(),
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success)
            return reply.badRequest(parsed.error.message);
        return createAiSession({
            reportId,
            prompt: parsed.data.prompt,
            exampleIds: parsed.data.exampleIds,
        });
    });
}
