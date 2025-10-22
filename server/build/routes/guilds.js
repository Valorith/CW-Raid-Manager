import { GuildRole } from '@prisma/client';
import { updateGuildMemberRole } from '../services/guildService.js';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { canManageGuild, createGuild, getGuildById, getUserGuildRole, listGuilds } from '../services/guildService.js';
import { prisma } from '../utils/prisma.js';
export async function guildRoutes(server) {
    server.get('/', async () => {
        const guilds = await listGuilds();
        return { guilds };
    });
    server.get('/:guildId', async (request, reply) => {
        const { guildId } = request.params;
        const guild = await getGuildById(guildId);
        if (!guild) {
            return reply.notFound('Guild not found.');
        }
        return { guild };
    });
    server.post('/', { preHandler: [authenticate] }, async (request, reply) => {
        const bodySchema = z.object({
            name: z.string().min(3).max(100),
            description: z.string().max(500).optional()
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid guild data submitted.');
        }
        const userId = request.user.userId;
        const guild = await createGuild({
            name: parsed.data.name,
            description: parsed.data.description,
            creatorUserId: userId
        });
        return reply.code(201).send({ guild });
    });
    server.patch('/:guildId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const params = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            name: z.string().min(3).max(100).optional(),
            description: z.string().max(500).optional()
        });
        const body = bodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.badRequest('Invalid update payload.');
        }
        const membership = await getUserGuildRole(request.user.userId, params.guildId);
        if (!membership || !canManageGuild(membership.role)) {
            return reply.forbidden('Insufficient permissions to update this guild.');
        }
        const guild = await prisma.guild.update({
            where: { id: params.guildId },
            data: {
                name: body.data.name,
                description: body.data.description
            }
        });
        return { guild };
    });
    server.patch('/:guildId/members/:memberId/role', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string(),
            memberId: z.string()
        });
        const { guildId, memberId } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            role: z.nativeEnum(GuildRole)
        });
        const parsedBody = bodySchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.badRequest('Invalid role update payload.');
        }
        try {
            const membership = await updateGuildMemberRole({
                actorUserId: request.user.userId,
                guildId,
                targetUserId: memberId,
                newRole: parsedBody.data.role
            });
            return { membership };
        }
        catch (error) {
            request.log.warn({ error }, 'Failed to update guild member role.');
            if (error instanceof Error) {
                if (error.message === 'Guild not found.' || error.message === 'Membership not found.') {
                    return reply.notFound(error.message);
                }
                return reply.forbidden(error.message);
            }
            return reply.badRequest('Unable to update member role.');
        }
    });
    server.post('/:guildId/memberships', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            guildId: z.string()
        });
        const params = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            userId: z.string(),
            role: z.nativeEnum(GuildRole)
        });
        const body = bodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.badRequest('Invalid membership payload.');
        }
        const actorMembership = await getUserGuildRole(request.user.userId, params.guildId);
        if (!actorMembership || actorMembership.role === GuildRole.MEMBER) {
            return reply.forbidden('Insufficient permissions to modify memberships.');
        }
        if (body.data.role === GuildRole.LEADER &&
            actorMembership.role !== GuildRole.LEADER) {
            return reply.forbidden('Only guild leaders can promote other leaders.');
        }
        const membership = await prisma.guildMembership.upsert({
            where: {
                guildId_userId: {
                    guildId: params.guildId,
                    userId: body.data.userId
                }
            },
            update: {
                role: body.data.role
            },
            create: {
                guildId: params.guildId,
                userId: body.data.userId,
                role: body.data.role
            }
        });
        return reply.code(201).send({ membership });
    });
}
