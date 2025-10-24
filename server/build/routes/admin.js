import { GuildRole } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { deleteGuildByAdmin, deleteUserByAdmin, ensureAdmin, getGuildDetailForAdmin, listGuildsForAdmin, listUsersForAdmin, removeGuildMemberAsAdmin, updateGuildDetailsByAdmin, updateGuildMemberRoleAsAdmin, updateUserByAdmin, upsertGuildMembershipAsAdmin } from '../services/adminService.js';
async function requireAdmin(request, reply) {
    try {
        await ensureAdmin(request.user.userId);
    }
    catch (error) {
        request.log.warn({ error }, 'Non-admin attempted to access admin route.');
        return reply.forbidden('Administrator privileges required.');
    }
}
export async function adminRoutes(server) {
    server.get('/users', {
        preHandler: [authenticate, requireAdmin]
    }, async () => {
        const users = await listUsersForAdmin();
        return { users };
    });
    server.patch('/users/:userId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            userId: z.string()
        });
        const { userId } = paramsSchema.parse(request.params);
        const bodySchema = z
            .object({
            admin: z.boolean().optional(),
            displayName: z.string().min(1).max(120).optional(),
            nickname: z.string().max(120).nullable().optional(),
            email: z.string().email().optional()
        })
            .refine((value) => Object.keys(value).length > 0, {
            message: 'No fields provided for update.'
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            const user = await updateUserByAdmin(userId, parsed.data);
            return { user };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to update user.');
            if (error instanceof Error) {
                return reply.badRequest(error.message);
            }
            return reply.badRequest('Unable to update user.');
        }
    });
    server.delete('/users/:userId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            userId: z.string()
        });
        const { userId } = paramsSchema.parse(request.params);
        try {
            await deleteUserByAdmin(userId);
            return reply.code(204).send();
        }
        catch (error) {
            request.log.error({ error }, 'Failed to delete user.');
            return reply.badRequest('Unable to delete user.');
        }
    });
    server.get('/guilds', {
        preHandler: [authenticate, requireAdmin]
    }, async () => {
        const guilds = await listGuildsForAdmin();
        return { guilds };
    });
    server.get('/guilds/:guildId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const guild = await getGuildDetailForAdmin(guildId);
        if (!guild) {
            return reply.notFound('Guild not found.');
        }
        return { guild };
    });
    server.patch('/guilds/:guildId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const bodySchema = z
            .object({
            name: z.string().min(3).max(100).optional(),
            description: z.string().max(500).nullable().optional()
        })
            .refine((value) => Object.keys(value).length > 0, {
            message: 'No fields provided for update.'
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            const guild = await updateGuildDetailsByAdmin(guildId, parsed.data);
            return { guild };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to update guild details.');
            return reply.badRequest('Unable to update guild.');
        }
    });
    server.delete('/guilds/:guildId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const { guildId } = paramsSchema.parse(request.params);
        try {
            await deleteGuildByAdmin(guildId);
            return reply.code(204).send();
        }
        catch (error) {
            request.log.error({ error }, 'Failed to delete guild.');
            return reply.badRequest('Unable to delete guild.');
        }
    });
    server.post('/guilds/:guildId/members', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const { guildId } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            userId: z.string(),
            role: z.nativeEnum(GuildRole)
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid membership payload.');
        }
        try {
            const membership = await upsertGuildMembershipAsAdmin(guildId, parsed.data.userId, parsed.data.role);
            return reply.code(201).send({ membership });
        }
        catch (error) {
            request.log.error({ error }, 'Failed to upsert guild membership.');
            if (error instanceof Error) {
                return reply.badRequest(error.message);
            }
            return reply.badRequest('Unable to modify membership.');
        }
    });
    server.patch('/guilds/:guildId/members/:userId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string(),
            userId: z.string()
        });
        const { guildId, userId } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            role: z.nativeEnum(GuildRole)
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid membership update payload.');
        }
        try {
            const membership = await updateGuildMemberRoleAsAdmin(guildId, userId, parsed.data.role);
            return { membership };
        }
        catch (error) {
            request.log.error({ error }, 'Failed to update guild membership as admin.');
            if (error instanceof Error) {
                return reply.badRequest(error.message);
            }
            return reply.badRequest('Unable to update membership.');
        }
    });
    server.delete('/guilds/:guildId/members/:userId', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string(),
            userId: z.string()
        });
        const { guildId, userId } = paramsSchema.parse(request.params);
        try {
            await removeGuildMemberAsAdmin(guildId, userId);
            return reply.code(204).send();
        }
        catch (error) {
            request.log.error({ error }, 'Failed to remove guild member as admin.');
            return reply.badRequest('Unable to remove guild member.');
        }
    });
}
