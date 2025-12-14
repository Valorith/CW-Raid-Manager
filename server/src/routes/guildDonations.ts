import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import {
  deleteDonation,
  fetchGuildDonations,
  getPendingDonationCount,
  rejectAllDonations,
  rejectDonation
} from '../services/guildDonationsService.js';
import { getUserGuildRole } from '../services/guildService.js';
import { ensureUserCanViewGuild } from '../services/raidService.js';

export async function guildDonationRoutes(server: FastifyInstance): Promise<void> {
  // Get all donations for a guild (from EQEmu database)
  server.get('/:guildId/donations', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    try {
      await ensureUserCanViewGuild(request.user.userId, guildId);
    } catch {
      return reply.forbidden('You must be a member of this guild to view donations.');
    }

    try {
      const donations = await fetchGuildDonations(guildId);

      // Map to the expected client format
      const formattedDonations = donations.map((d) => ({
        id: String(d.id),
        guildId: guildId,
        itemName: d.itemName ?? 'Unknown Item',
        itemId: d.itemId,
        itemIconId: d.itemIconId,
        itemType: d.itemType,
        quantity: d.quantity,
        donatorId: d.donatorId,
        donatorName: d.donatorName,
        status: d.status
      }));

      return { donations: formattedDonations };
    } catch (error) {
      request.log.error({ err: error, guildId }, 'Failed to fetch guild donations.');
      return { donations: [] };
    }
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

    try {
      const count = await getPendingDonationCount(guildId);
      return { count };
    } catch {
      return { count: 0 };
    }
  });

  // Reject a donation (mark as rejected in EQEmu database)
  server.patch('/:guildId/donations/:donationId/reject', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string(), donationId: z.string() });
    const { guildId, donationId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to reject donations.');
    }

    // Only officers and leaders can reject donations
    if (!['LEADER', 'OFFICER', 'RAID_LEADER'].includes(membership.role)) {
      return reply.forbidden('Only officers and leaders can reject donations.');
    }

    try {
      const donationIdNum = parseInt(donationId, 10);
      if (isNaN(donationIdNum)) {
        return reply.badRequest('Invalid donation ID.');
      }

      const success = await rejectDonation(guildId, donationIdNum);
      if (!success) {
        return reply.notFound('Donation not found.');
      }

      return {
        donation: {
          id: donationId,
          status: 'REJECTED'
        }
      };
    } catch {
      return reply.notFound('Donation not found.');
    }
  });

  // Reject all pending donations for a guild
  server.patch('/:guildId/donations/reject-all', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsSchema = z.object({ guildId: z.string() });
    const { guildId } = paramsSchema.parse(request.params);

    const membership = await getUserGuildRole(request.user.userId, guildId);
    if (!membership) {
      return reply.forbidden('You must be a member of this guild to reject donations.');
    }

    // Only officers and leaders can reject donations
    if (!['LEADER', 'OFFICER', 'RAID_LEADER'].includes(membership.role)) {
      return reply.forbidden('Only officers and leaders can reject donations.');
    }

    try {
      const count = await rejectAllDonations(guildId);
      return { rejected: count };
    } catch {
      return { rejected: 0 };
    }
  });

  // Delete a donation from EQEmu database
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
      const donationIdNum = parseInt(donationId, 10);
      if (isNaN(donationIdNum)) {
        return reply.badRequest('Invalid donation ID.');
      }

      const success = await deleteDonation(guildId, donationIdNum);
      if (!success) {
        return reply.notFound('Donation not found.');
      }

      return reply.code(204).send();
    } catch {
      return reply.notFound('Donation not found.');
    }
  });
}
