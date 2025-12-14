import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { getUserGuildRole } from '../services/guildService.js';
import { ensureUserCanViewGuild } from '../services/raidService.js';
import { prisma } from '../utils/prisma.js';

export async function guildDonationRoutes(server: FastifyInstance): Promise<void> {
  // Get pending donations for a guild
  server.get('/:guildId/donations', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch {
      return reply.forbidden('You must be a member of this guild to view donations.');
    }

    const donations = await prisma.guildDonation.findMany({
      where: {
        guildId,
        status: 'PENDING'
      },
      orderBy: { donatedAt: 'desc' },
      include: {
        raid: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return { donations };
  });

  // Get pending donation count for a guild (lightweight endpoint for badge)
  server.get('/:guildId/donations/count', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch {
      return reply.forbidden('You must be a member of this guild to view donations.');
    }

    const count = await prisma.guildDonation.count({
      where: {
        guildId,
        status: 'PENDING'
      }
    });

    return { count };
  });

  // Create a new donation (used when items are donated to guild during raids)
  server.post('/:guildId/donations', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      raidId: z.string().optional(),
      itemName: z.string().min(1).max(191),
      itemId: z.number().int().positive().nullable().optional(),
      itemIconId: z.number().int().positive().nullable().optional(),
      donatedAt: z.string().datetime().optional()
    });

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid donation payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to record donations.');
    }

    const donation = await prisma.guildDonation.create({
      data: {
        guildId,
        raidId: parsedBody.data.raidId ?? null,
        itemName: parsedBody.data.itemName,
        itemId: parsedBody.data.itemId ?? null,
        itemIconId: parsedBody.data.itemIconId ?? null,
        donatedAt: parsedBody.data.donatedAt ? new Date(parsedBody.data.donatedAt) : new Date(),
        status: 'PENDING'
      }
    });

    return reply.code(201).send({ donation });
  });

  // Create multiple donations at once (batch endpoint)
  server.post('/:guildId/donations/batch', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      raidId: z.string().optional(),
      donations: z.array(z.object({
        itemName: z.string().min(1).max(191),
        itemId: z.number().int().positive().nullable().optional(),
        itemIconId: z.number().int().positive().nullable().optional(),
        donatedAt: z.string().datetime().optional()
      })).min(1).max(100)
    });

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest('Invalid donations payload.');
    }

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to record donations.');
    }

    const created = await prisma.guildDonation.createMany({
      data: parsedBody.data.donations.map(d => ({
        guildId,
        raidId: parsedBody.data.raidId ?? null,
        itemName: d.itemName,
        itemId: d.itemId ?? null,
        itemIconId: d.itemIconId ?? null,
        donatedAt: d.donatedAt ? new Date(d.donatedAt) : new Date(),
        status: 'PENDING'
      }))
    });

    return reply.code(201).send({ count: created.count });
  });

  // Acknowledge a donation (mark as processed)
  server.patch('/:guildId/donations/:donationId/acknowledge', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), donationId: z.string() });
    const { guildId, donationId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to acknowledge donations.');
    }

    // Only officers and leaders can acknowledge donations
    if (!['LEADER', 'OFFICER', 'RAID_LEADER'].includes(membership.role)) {
      return reply.forbidden('Only officers and leaders can acknowledge donations.');
    }

    try {
      const donation = await prisma.guildDonation.update({
        where: {
          id: donationId,
          guildId
        },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedById: request.user.userId,
          acknowledgedAt: new Date()
        }
      });

      return { donation };
    } catch {
      return reply.notFound('Donation not found.');
    }
  });

  // Acknowledge all pending donations for a guild
  server.patch('/:guildId/donations/acknowledge-all', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to acknowledge donations.');
    }

    // Only officers and leaders can acknowledge donations
    if (!['LEADER', 'OFFICER', 'RAID_LEADER'].includes(membership.role)) {
      return reply.forbidden('Only officers and leaders can acknowledge donations.');
    }

    const result = await prisma.guildDonation.updateMany({
      where: {
        guildId,
        status: 'PENDING'
      },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedById: request.user.userId,
        acknowledgedAt: new Date()
      }
    });

    return { acknowledged: result.count };
  });

  // Delete a donation
  server.delete('/:guildId/donations/:donationId', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), donationId: z.string() });
    const { guildId, donationId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to delete donations.');
    }

    // Only officers and leaders can delete donations
    if (!['LEADER', 'OFFICER', 'RAID_LEADER'].includes(membership.role)) {
      return reply.forbidden('Only officers and leaders can delete donations.');
    }

    try {
      await prisma.guildDonation.delete({
        where: {
          id: donationId,
          guildId
        }
      });

      return reply.code(204).send();
    } catch {
      return reply.notFound('Donation not found.');
    }
  });
}
