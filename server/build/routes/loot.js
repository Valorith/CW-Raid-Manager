import { createReadStream, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { canManageGuild, getUserGuildRole } from '../services/guildService.js';
import { ensureUserCanViewGuild, ensureCanManageRaid, getRaidEventById } from '../services/raidService.js';
import { createRaidLootEvents, deleteRaidLootEvent, deleteAllRaidLootEvents, getGuildLootParserSettings, listRaidLootEvents, listRecentLootForUser, updateGuildLootParserSettings, updateRaidLootEvent, defaultLootPatterns, defaultLootEmoji, InvalidLootPatternError } from '../services/lootService.js';
import { getActiveLootMonitorSession, heartbeatLootMonitorSession, LOOT_MONITOR_HEARTBEAT_INTERVAL_MS, LOOT_MONITOR_SESSION_TTL_MS, startLootMonitorSession, stopLootMonitorSession } from '../services/logMonitorService.js';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
const currentDir = fileURLToPath(new URL('.', import.meta.url));
const lootIconDirectoryCandidates = [
    resolve(process.cwd(), 'assets/icons/items'),
    resolve(process.cwd(), '../assets/icons/items'),
    resolve(currentDir, '../../assets/icons/items'),
    resolve(currentDir, '../../../assets/icons/items'),
    resolve(currentDir, '../../../../assets/icons/items')
];
const lootIconDirectory = lootIconDirectoryCandidates.find((candidate) => existsSync(candidate)) ?? null;
const lootEventSchema = z.object({
    itemName: z.string().min(2).max(191),
    itemId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
    looterName: z.string().min(2).max(191),
    looterClass: z.string().max(50).optional().nullable(),
    emoji: z.string().max(16).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    eventTime: z.string().optional().nullable()
});
const parserPatternSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    pattern: z.string().min(1),
    ignoredMethods: z
        .array(z
        .string()
        .trim()
        .min(1)
        .max(120))
        .max(25)
        .optional()
});
function serializeMonitorSession(viewerId, session) {
    if (!session) {
        return null;
    }
    return {
        sessionId: session.userId === viewerId ? session.sessionId : undefined,
        raidId: session.raidId,
        guildId: session.guildId,
        fileName: session.fileName,
        startedAt: session.startedAt.toISOString(),
        lastHeartbeatAt: session.lastHeartbeatAt.toISOString(),
        user: {
            id: session.userId,
            displayName: session.userDisplayName
        },
        isOwner: session.userId === viewerId
    };
}
export async function lootRoutes(server) {
    server.get('/loot-icons/:iconId', async (request, reply) => {
        const paramsSchema = z.object({
            iconId: z.coerce.number().int().nonnegative()
        });
        const querySchema = z
            .object({
            format: z.enum(['gif', 'png']).optional()
        })
            .partial();
        const params = paramsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.badRequest('Invalid icon identifier.');
        }
        const query = querySchema.safeParse(request.query ?? {});
        if (!query.success) {
            return reply.badRequest('Invalid icon query parameters.');
        }
        const preferredFormat = query.data.format ?? null;
        if (!lootIconDirectory || !existsSync(lootIconDirectory)) {
            request.log.warn({ lootIconDirectory, lootIconDirectoryCandidates, currentDir }, 'Item icon directory is not available on disk.');
            return reply.notFound('Item icons are currently unavailable.');
        }
        const extensionOrder = preferredFormat === 'png'
            ? ['png', 'gif']
            : preferredFormat === 'gif'
                ? ['gif', 'png']
                : ['gif', 'png'];
        let selectedPath = null;
        let selectedExtension = null;
        for (const extension of extensionOrder) {
            const candidatePath = join(lootIconDirectory, `${params.data.iconId}.${extension}`);
            if (existsSync(candidatePath)) {
                selectedPath = candidatePath;
                selectedExtension = extension;
                break;
            }
        }
        if (!selectedPath || !selectedExtension) {
            return reply.notFound('Icon not found.');
        }
        try {
            const stream = createReadStream(selectedPath);
            stream.on('error', (error) => {
                request.log.error({ err: error, iconId: params.data.iconId, extension: selectedExtension }, 'Failed to stream loot icon');
            });
            reply
                .header('Cache-Control', 'public, max-age=31536000, immutable')
                .type(selectedExtension === 'gif' ? 'image/gif' : 'image/png');
            return reply.send(stream);
        }
        catch (error) {
            request.log.error({ err: error, iconId: params.data.iconId }, 'Failed to load loot icon');
            return reply.internalServerError('Failed to load icon.');
        }
    });
    server.get('/user/recent-loot', { preHandler: [authenticate] }, async (request, reply) => {
        const querySchema = z.object({
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(50).default(6)
        });
        const parsedQuery = querySchema.safeParse(request.query ?? {});
        if (!parsedQuery.success) {
            return reply.badRequest('Invalid query parameters.');
        }
        const { page, limit } = parsedQuery.data;
        const offset = (page - 1) * limit;
        const { loot, total } = await listRecentLootForUser(request.user.userId, { limit, offset });
        const totalPages = Math.max(1, Math.ceil(total / limit));
        return {
            loot,
            page,
            totalPages,
            total
        };
    });
    server.get('/raids/:raidId/loot', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const { raidId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureUserCanViewGuild(request.user.userId, raid.guildId);
        }
        catch {
            return reply.forbidden('You are not a member of this guild.');
        }
        const loot = await listRaidLootEvents(raidId, request.log);
        return { loot };
    });
    server.get('/raids/:raidId/log-monitor', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const { raidId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureUserCanViewGuild(request.user.userId, raid.guildId);
        }
        catch {
            return reply.forbidden('You are not a member of this guild.');
        }
        const session = getActiveLootMonitorSession(raidId);
        return {
            session: serializeMonitorSession(request.user.userId, session),
            heartbeatIntervalMs: LOOT_MONITOR_HEARTBEAT_INTERVAL_MS,
            timeoutMs: LOOT_MONITOR_SESSION_TTL_MS
        };
    });
    server.post('/raids/:raidId/loot', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const { raidId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized loot create attempt.');
            return reply.forbidden('You do not have permission to modify loot for this raid.');
        }
        const bodySchema = z.object({
            events: z.array(lootEventSchema).min(1)
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid loot payload.');
        }
        const created = await createRaidLootEvents({
            raidId,
            guildId: raid.guildId,
            createdById: request.user.userId,
            events: parsed.data.events,
            notifyDiscord: true,
            logger: request.log
        });
        return reply.code(201).send({ loot: created });
    });
    server.patch('/raids/:raidId/loot/:lootId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string(), lootId: z.string() });
        const { raidId, lootId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized loot update attempt.');
            return reply.forbidden('You do not have permission to modify loot for this raid.');
        }
        const bodySchema = lootEventSchema.partial();
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid loot update payload.');
        }
        const loot = await updateRaidLootEvent(lootId, raid.guildId, parsed.data, request.log);
        return { loot };
    });
    server.delete('/raids/:raidId/loot/:lootId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string(), lootId: z.string() });
        const { raidId, lootId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized loot delete attempt.');
            return reply.forbidden('You do not have permission to delete loot for this raid.');
        }
        await deleteRaidLootEvent(lootId, raid.guildId);
        return reply.code(204).send();
    });
    server.delete('/raids/:raidId/loot', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const { raidId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized loot clear attempt.');
            return reply.forbidden('You do not have permission to clear loot for this raid.');
        }
        await deleteAllRaidLootEvents(raidId, raid.guildId);
        return reply.code(204).send();
    });
    server.post('/raids/:raidId/log-monitor/start', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const bodySchema = z.object({
            fileName: z.string().min(3).max(255)
        });
        const { raidId } = paramsSchema.parse(request.params);
        const parsedBody = bodySchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.badRequest('Invalid log monitor payload.');
        }
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized log monitor start attempt.');
            return reply.forbidden('You do not have permission to monitor logs for this raid.');
        }
        const profile = await prisma.user.findUnique({
            where: { id: request.user.userId },
            select: { displayName: true, nickname: true }
        });
        const preferred = withPreferredDisplayName({
            displayName: profile?.displayName ?? 'Unknown Raider',
            nickname: profile?.nickname ?? null
        });
        try {
            const session = startLootMonitorSession({
                raidId,
                guildId: raid.guildId,
                userId: request.user.userId,
                userDisplayName: preferred.displayName,
                fileName: parsedBody.data.fileName
            });
            return reply.code(201).send({
                session: serializeMonitorSession(request.user.userId, session),
                heartbeatIntervalMs: LOOT_MONITOR_HEARTBEAT_INTERVAL_MS,
                timeoutMs: LOOT_MONITOR_SESSION_TTL_MS
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'LOOT_MONITOR_ACTIVE') {
                return reply.conflict('Another member is already monitoring this raid.');
            }
            request.log.error({ error }, 'Failed to start log monitor session.');
            return reply.internalServerError('Unable to start log monitoring at this time.');
        }
    });
    server.post('/raids/:raidId/log-monitor/heartbeat', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const bodySchema = z.object({
            sessionId: z.string().uuid()
        });
        const { raidId } = paramsSchema.parse(request.params);
        const parsedBody = bodySchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.badRequest('Invalid heartbeat payload.');
        }
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        try {
            await ensureCanManageRaid(request.user.userId, raid.guildId);
        }
        catch {
            return reply.forbidden('You do not have permission to monitor logs for this raid.');
        }
        try {
            const session = heartbeatLootMonitorSession(raidId, parsedBody.data.sessionId, request.user.userId);
            return {
                session: serializeMonitorSession(request.user.userId, session)
            };
        }
        catch (error) {
            if (error instanceof Error) {
                if (error.message === 'LOOT_MONITOR_NOT_FOUND') {
                    return reply.notFound('No active monitoring session found.');
                }
                if (error.message === 'LOOT_MONITOR_FORBIDDEN') {
                    return reply.forbidden('Only the monitoring user can update this session.');
                }
            }
            request.log.error({ error }, 'Failed to process log monitor heartbeat.');
            return reply.internalServerError('Unable to update monitoring session.');
        }
    });
    server.post('/raids/:raidId/log-monitor/stop', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ raidId: z.string() });
        const bodySchema = z.object({
            sessionId: z.string().uuid().optional(),
            force: z.boolean().optional()
        });
        const { raidId } = paramsSchema.parse(request.params);
        const parsedBody = bodySchema.safeParse(request.body ?? {});
        if (!parsedBody.success) {
            return reply.badRequest('Invalid stop payload.');
        }
        const raid = await getRaidEventById(raidId);
        if (!raid) {
            return reply.notFound('Raid not found.');
        }
        let membershipRole;
        try {
            membershipRole = await ensureUserCanViewGuild(request.user.userId, raid.guildId);
        }
        catch {
            return reply.forbidden('You are not a member of this guild.');
        }
        const canForceStop = canManageGuild(membershipRole);
        const session = getActiveLootMonitorSession(raidId);
        if (!session) {
            return reply.code(204).send();
        }
        const isOwner = session.userId === request.user.userId;
        if (!isOwner && (!parsedBody.data.force || !canForceStop)) {
            return reply.forbidden("Only raid leadership can force stop another user's monitor.");
        }
        if (!parsedBody.data.force) {
            if (!parsedBody.data.sessionId) {
                return reply.badRequest('Session identifier required to stop monitoring.');
            }
            if (parsedBody.data.sessionId !== session.sessionId) {
                return reply.conflict('Session mismatch. Reload the page and try again.');
            }
        }
        else if (!canForceStop) {
            return reply.forbidden('You do not have permission to force stop monitoring.');
        }
        stopLootMonitorSession(raidId);
        return reply.code(204).send();
    });
    server.get('/guilds/:guildId/loot-settings', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string() });
        const { guildId } = paramsSchema.parse(request.params);
        const membership = await getUserGuildRole(request.user.userId, guildId);
        if (!membership) {
            return reply.forbidden('You are not a member of this guild.');
        }
        const settings = await getGuildLootParserSettings(guildId);
        return {
            settings,
            defaults: {
                patterns: defaultLootPatterns,
                emoji: defaultLootEmoji
            }
        };
    });
    server.put('/guilds/:guildId/loot-settings', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string() });
        const { guildId } = paramsSchema.parse(request.params);
        const membership = await getUserGuildRole(request.user.userId, guildId);
        if (!membership || membership.role === 'MEMBER') {
            return reply.forbidden('Only raid staff can update parser settings.');
        }
        const bodySchema = z.object({
            patterns: z.array(parserPatternSchema).min(1),
            emoji: z.string().max(16).optional().nullable()
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid parser settings payload.');
        }
        try {
            const settings = await updateGuildLootParserSettings(guildId, parsed.data);
            return { settings };
        }
        catch (error) {
            if (error instanceof InvalidLootPatternError) {
                return reply.badRequest(error.message);
            }
            throw error;
        }
    });
}
