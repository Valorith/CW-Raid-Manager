import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../utils/prisma.js';

const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .max(40, 'Nickname cannot exceed 40 characters.')
    .refine((value) => value.length === 0 || value.length >= 2, {
      message: 'Nickname must be at least 2 characters.'
    })
    .optional()
});

export async function accountRoutes(server: FastifyInstance): Promise<void> {
  server.get('/profile', { preHandler: [authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        nickname: true
      }
    });

    if (!user) {
      return { profile: null };
    }

    return {
      profile: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        nickname: user.nickname ?? null
      }
    };
  });

  server.patch('/profile', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(
        parsed.error.issues[0]?.message ?? 'Invalid profile update payload.'
      );
    }

    const nickname =
      parsed.data?.nickname === undefined ? null : parsed.data.nickname.trim() || null;

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: {
        nickname
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        nickname: true
      }
    });

    return {
      profile: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        nickname: user.nickname ?? null
      }
    };
  });
}
