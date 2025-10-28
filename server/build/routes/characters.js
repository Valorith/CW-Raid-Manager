import { CharacterArchetype, CharacterClass } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createCharacter, listCharactersForUser, updateCharacter, MainCharacterLimitError } from '../services/characterService.js';
import { getUserGuildRole, canManageGuild } from '../services/guildService.js';
import { prisma } from '../utils/prisma.js';
export async function charactersRoutes(server) {
    server.get('/', { preHandler: [authenticate] }, async (request) => {
        const characters = await listCharactersForUser(request.user.userId);
        return { characters };
    });
    server.post('/', { preHandler: [authenticate] }, async (request, reply) => {
        const bodySchema = z.object({
            name: z.string().min(2).max(64),
            level: z.number().int().min(1).max(125),
            class: z.nativeEnum(CharacterClass),
            archetype: z.nativeEnum(CharacterArchetype).optional(),
            guildId: z.string().optional(),
            isMain: z.boolean().optional()
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid character payload.');
        }
        if (parsed.data.guildId) {
            const membership = await prisma.guildMembership.findUnique({
                where: {
                    guildId_userId: {
                        guildId: parsed.data.guildId,
                        userId: request.user.userId
                    }
                }
            });
            if (!membership) {
                return reply.forbidden('You must be a member of this guild to assign a character to it.');
            }
        }
        try {
            const character = await createCharacter({
                ...parsed.data,
                userId: request.user.userId
            });
            return reply.code(201).send({ character });
        }
        catch (error) {
            if (error instanceof MainCharacterLimitError) {
                return reply.badRequest(error.message);
            }
            request.log.error({ error }, 'Failed to create character.');
            return reply.internalServerError('Unable to create character.');
        }
    });
    server.patch('/:characterId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            characterId: z.string()
        });
        const { characterId } = paramsSchema.parse(request.params);
        const bodySchema = z
            .object({
            name: z.string().min(2).max(64).optional(),
            level: z.number().int().min(1).max(125).optional(),
            class: z.nativeEnum(CharacterClass).optional(),
            archetype: z.nativeEnum(CharacterArchetype).nullable().optional(),
            guildId: z.string().nullable().optional(),
            isMain: z.boolean().optional(),
            contextGuildId: z.string().optional()
        })
            .refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update.'
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        const characterRecord = await prisma.character.findUnique({
            where: { id: characterId },
            select: { userId: true, guildId: true }
        });
        if (!characterRecord) {
            return reply.notFound('Character not found.');
        }
        let actingUserOwnerId = characterRecord.userId;
        const isOwner = characterRecord.userId === request.user.userId;
        if (parsed.data.guildId && isOwner) {
            const membership = await prisma.guildMembership.findUnique({
                where: {
                    guildId_userId: {
                        guildId: parsed.data.guildId,
                        userId: request.user.userId
                    }
                }
            });
            if (!membership) {
                return reply.forbidden('You must be a member of this guild to assign a character to it.');
            }
        }
        if (!isOwner) {
            const guildId = characterRecord.guildId ?? parsed.data.contextGuildId ?? parsed.data.guildId ?? undefined;
            if (!guildId) {
                return reply.forbidden('Only the character owner can edit this record.');
            }
            const membership = await getUserGuildRole(request.user.userId, guildId);
            const role = membership?.role ?? null;
            if (!role || !canManageGuild(role)) {
                return reply.forbidden('Only guild leadership can edit member characters.');
            }
        }
        try {
            const character = await updateCharacter(characterId, actingUserOwnerId, parsed.data);
            return { character };
        }
        catch (error) {
            if (error instanceof MainCharacterLimitError) {
                return reply.badRequest(error.message);
            }
            if (error instanceof Error && error.message === 'Character not found.') {
                return reply.notFound('Character not found.');
            }
            request.log.warn({ error }, 'Failed to update character.');
            return reply.internalServerError('Unable to update character.');
        }
    });
}
