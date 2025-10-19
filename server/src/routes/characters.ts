import { FastifyInstance } from 'fastify';
import { CharacterArchetype, CharacterClass } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  createCharacter,
  listCharactersForUser,
  updateCharacter
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
      const guildExists = await prisma.guild.findUnique({
        where: { id: parsed.data.guildId }
      });
      if (!guildExists) {
        return reply.badRequest('Provided guild does not exist.');
      }
    }

    const character = await createCharacter({
      ...parsed.data,
      userId: request.user.userId
    });

    return reply.code(201).send({ character });
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
      const guildExists = await prisma.guild.findUnique({
        where: { id: parsed.data.guildId }
      });
      if (!guildExists) {
        return reply.badRequest('Provided guild does not exist.');
      }
    }

    try {
      const character = await updateCharacter(characterId, request.user.userId, parsed.data);
      return { character };
    } catch (error) {
      request.log.warn({ error }, 'Failed to update character.');
      return reply.notFound('Character not found.');
    }
  });
}
