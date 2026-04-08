import { FastifyInstance } from 'fastify';
import { NotificationProvider, Prisma } from '@prisma/client';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { getLinkedProviders, unlinkDiscord, unlinkGoogle } from '../services/authService.js';
import { updateMarketFavoriteNotificationSettings } from '../services/marketNotificationService.js';
import { getMarketFavorites } from '../services/marketService.js';
import { sendNotificationTestMessage } from '../services/notificationOutboxService.js';
import {
  createTelegramLinkSession,
  createWhatsappLinkSession,
  disconnectNotificationChannel,
  listNotificationChannels,
  listNotificationProviderAvailability,
  listNotificationPreferences,
  updateNotificationPreferences
} from '../services/userNotificationService.js';
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
    .optional(),
  eqGameDirectoryName: z
    .union([
      z
        .string()
        .trim()
        .max(255, 'EQ game directory name cannot exceed 255 characters.'),
      z.null()
    ])
    .optional()
});

const accountProfileSelect = {
  id: true,
  email: true,
  displayName: true,
  nickname: true,
  defaultLogFileName: true,
  eqGameDirectoryName: true
} satisfies Prisma.UserSelect;

const legacyAccountProfileSelect = {
  id: true,
  email: true,
  displayName: true,
  nickname: true,
  defaultLogFileName: true
} satisfies Prisma.UserSelect;

type AccountProfileRecord =
  | Prisma.UserGetPayload<{ select: typeof accountProfileSelect }>
  | Prisma.UserGetPayload<{ select: typeof legacyAccountProfileSelect }>;

function isEqGameDirectoryNameColumnMissing(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === 'P2022' && typeof error.meta?.column === 'string') {
    return error.meta.column.includes('eqGameDirectoryName');
  }

  return (
    error.code === 'P2010' &&
    typeof error.meta?.message === 'string' &&
    error.meta.message.includes('Unknown column') &&
    error.meta.message.includes('eqGameDirectoryName')
  );
}

function serializeAccountProfile(user: AccountProfileRecord) {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    nickname: user.nickname ?? null,
    defaultLogFileName: user.defaultLogFileName ?? null,
    eqGameDirectoryName:
      'eqGameDirectoryName' in user ? user.eqGameDirectoryName ?? null : null
  };
}

export async function accountRoutes(server: FastifyInstance): Promise<void> {
  const notificationProviderSchema = z.enum(['TELEGRAM', 'WHATSAPP']);

  server.get('/profile', { preHandler: [authenticate] }, async (request) => {
    let user: AccountProfileRecord | null = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: accountProfileSelect
      });
    } catch (error) {
      if (!isEqGameDirectoryNameColumnMissing(error)) {
        throw error;
      }

      request.log.warn(
        { error },
        'User.eqGameDirectoryName is unavailable. Falling back to legacy account profile select.'
      );
      user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: legacyAccountProfileSelect
      });
    }

    if (!user) {
      return { profile: null };
    }

    return {
      profile: serializeAccountProfile(user)
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

    if (parsed.data.eqGameDirectoryName !== undefined) {
      if (typeof parsed.data.eqGameDirectoryName === 'string') {
        const trimmed = parsed.data.eqGameDirectoryName.trim();
        updateData.eqGameDirectoryName = trimmed.length > 0 ? trimmed : null;
      } else {
        updateData.eqGameDirectoryName = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return reply.badRequest('No profile updates provided.');
    }

    let user: AccountProfileRecord;
    try {
      user = await prisma.user.update({
        where: { id: request.user.userId },
        data: updateData,
        select: accountProfileSelect
      });
    } catch (error) {
      if (!isEqGameDirectoryNameColumnMissing(error)) {
        throw error;
      }

      request.log.warn(
        { error },
        'User.eqGameDirectoryName is unavailable. Falling back to legacy account profile update.'
      );
      const { eqGameDirectoryName: _ignored, ...legacyUpdateData } = updateData;
      if (Object.keys(legacyUpdateData).length === 0) {
        const existingUser = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: legacyAccountProfileSelect
        });
        if (!existingUser) {
          return reply.notFound('Profile not found.');
        }
        user = existingUser;
      } else {
        user = await prisma.user.update({
          where: { id: request.user.userId },
          data: legacyUpdateData,
          select: legacyAccountProfileSelect
        });
      }
    }

    return {
      profile: serializeAccountProfile(user)
    };
  });

  // Get linked OAuth providers
  server.get('/linked-providers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const providers = await getLinkedProviders(request.user.userId);
      return { providers };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get linked providers.';
      return reply.internalServerError(message);
    }
  });

  // Unlink Google account
  server.post('/unlink/google', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      await unlinkGoogle(request.user.userId);
      const providers = await getLinkedProviders(request.user.userId);
      return { success: true, providers };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlink Google.';
      return reply.badRequest(message);
    }
  });

  // Unlink Discord account
  server.post('/unlink/discord', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      await unlinkDiscord(request.user.userId);
      const providers = await getLinkedProviders(request.user.userId);
      return { success: true, providers };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlink Discord.';
      return reply.badRequest(message);
    }
  });

  server.get('/notification-channels', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const channels = await listNotificationChannels(request.user.userId);
      const availability = listNotificationProviderAvailability();
      return { channels, availability };
    } catch (error) {
      request.log.error({ error }, 'Failed to load notification channels.');
      return reply.internalServerError('Unable to load notification channels.');
    }
  });

  server.post(
    '/notification-channels/telegram/link',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const link = await createTelegramLinkSession(request.user.userId);
        return { link };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to create Telegram link.';
        return reply.badRequest(message);
      }
    }
  );

  server.post(
    '/notification-channels/whatsapp/link',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const link = await createWhatsappLinkSession(request.user.userId);
        return { link };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to create WhatsApp link.';
        return reply.badRequest(message);
      }
    }
  );

  server.post(
    '/notification-channels/:provider/disconnect',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = z
        .object({
          provider: notificationProviderSchema
        })
        .safeParse(request.params);

      if (!parsed.success) {
        return reply.badRequest('Invalid provider.');
      }

      try {
        await disconnectNotificationChannel(request.user.userId, parsed.data.provider);
        const channels = await listNotificationChannels(request.user.userId);
        return { channels };
      } catch (error) {
        request.log.error({ error }, 'Failed to disconnect notification channel.');
        return reply.internalServerError('Unable to disconnect notification channel.');
      }
    }
  );

  server.post(
    '/notification-channels/:provider/test',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = z
        .object({
          provider: notificationProviderSchema
        })
        .safeParse(request.params);

      if (!parsed.success) {
        return reply.badRequest('Invalid provider.');
      }

      try {
        await sendNotificationTestMessage(
          request.user.userId,
          parsed.data.provider as NotificationProvider
        );
        const channels = await listNotificationChannels(request.user.userId);
        return { success: true, channels };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to send test message.';
        return reply.badRequest(message);
      }
    }
  );

  server.get(
    '/notification-preferences',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const preferences = await listNotificationPreferences(request.user.userId);
        return { preferences };
      } catch (error) {
        request.log.error({ error }, 'Failed to load notification preferences.');
        return reply.internalServerError('Unable to load notification preferences.');
      }
    }
  );

  server.patch(
    '/notification-preferences',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = z
        .object({
          updates: z.array(
            z.object({
              scopeType: z.enum(['GLOBAL', 'GUILD']),
              scopeId: z.string().trim().min(1).max(191),
              eventKey: z.string().trim().min(1).max(191),
              isEnabled: z.boolean(),
              providerTargets: z
                .object({
                  TELEGRAM: z.boolean().optional(),
                  WHATSAPP: z.boolean().optional()
                })
                .partial()
                .optional()
            })
          )
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply.badRequest('Invalid notification preference payload.');
      }

      try {
        const preferences = await updateNotificationPreferences(
          request.user.userId,
          parsed.data.updates
        );
        return { preferences };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to update notification preferences.';
        return reply.badRequest(message);
      }
    }
  );

  server.get(
    '/market-notification-settings',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const favorites = await getMarketFavorites(request.user.userId);
        return {
          settings: {
            items: favorites.items.map((item) => ({
              id: item.id,
              notificationSettings: item.notificationSettings
            })),
            characters: favorites.characters.map((character) => ({
              id: character.id,
              notificationSettings: character.notificationSettings
            })),
            traders: favorites.traders.map((trader) => ({
              id: trader.id,
              notificationSettings: trader.notificationSettings
            }))
          }
        };
      } catch (error) {
        request.log.error({ error }, 'Failed to load market notification settings.');
        return reply.internalServerError('Unable to load market notification settings.');
      }
    }
  );

  server.patch(
    '/market-notification-settings/:favoriteId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = z
        .object({
          favoriteId: z.string().trim().min(1)
        })
        .safeParse(request.params);
      const body = z
        .object({
          notifyOnTradeActivity: z.boolean().optional(),
          notifyOnListingActivity: z.boolean().optional(),
          notifyOnUndercut: z.boolean().optional(),
          undercutOnly: z.boolean().optional(),
          onlyNewUndercuts: z.boolean().optional(),
          maxListingPriceCopper: z.number().int().min(0).nullable().optional(),
          maxTradePriceCopper: z.number().int().min(0).nullable().optional(),
          listingBelowRecentAveragePercent: z.number().min(0).max(100).nullable().optional()
        })
        .safeParse(request.body);

      if (!parsed.success || !body.success) {
        return reply.badRequest('Invalid market notification settings payload.');
      }

      try {
        const notificationSettings = await updateMarketFavoriteNotificationSettings(
          request.user.userId,
          parsed.data.favoriteId,
          body.data
        );
        return { notificationSettings };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to update market notification settings.';
        return reply.badRequest(message);
      }
    }
  );
}
