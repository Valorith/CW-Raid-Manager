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
    .optional(),
  defaultLogFileName: z
    .union([
      z
        .string()
        .trim()
        .max(255, 'Default log file name cannot exceed 255 characters.'),
      z.null()
    ])
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
        nickname: true,
        defaultLogFileName: true
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
        nickname: user.nickname ?? null,
        defaultLogFileName: user.defaultLogFileName ?? null
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

    const updateData: Record<string, string | null> = {};

    if (parsed.data.nickname !== undefined) {
      const trimmed = parsed.data.nickname.trim();
      updateData.nickname = trimmed.length > 0 ? trimmed : null;
    }

    if (parsed.data.defaultLogFileName !== undefined) {
      if (typeof parsed.data.defaultLogFileName === 'string') {
        const trimmed = parsed.data.defaultLogFileName.trim();
        updateData.defaultLogFileName = trimmed.length > 0 ? trimmed : null;
      } else {
        updateData.defaultLogFileName = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return reply.badRequest('No profile updates provided.');
    }

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        nickname: true,
        defaultLogFileName: true
      }
    });

    return {
      profile: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        nickname: user.nickname ?? null,
        defaultLogFileName: user.defaultLogFileName ?? null
      }
    };
  });
}
