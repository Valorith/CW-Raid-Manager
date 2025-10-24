import { FastifyInstance } from 'fastify';
import { CharacterArchetype, CharacterClass } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  createCharacter,
  listCharactersForUser,
  updateCharacter,
  MainCharacterLimitError
} from '../services/characterService.js';
import { prisma } from '../utils/prisma.js';

export async function charactersRoutes(server: FastifyInstance): Promise<void> {
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
    } catch (error) {
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
        isMain: z.boolean().optional()
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update.'
      });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
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
      const character = await updateCharacter(characterId, request.user.userId, parsed.data);
      return { character };
    } catch (error) {
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
