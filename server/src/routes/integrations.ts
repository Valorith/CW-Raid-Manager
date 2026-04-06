import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { appConfig } from '../config/appConfig.js';
import { sendTelegramMessage } from '../services/telegramNotificationProvider.js';
import {
  activateTelegramChannel,
  activateWhatsappChannel
} from '../services/userNotificationService.js';
import { sendWhatsappMessage } from '../services/whatsappNotificationProvider.js';

const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.union([z.number(), z.string()])
      }),
      from: z
        .object({
          id: z.union([z.number(), z.string()]),
          username: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional()
        })
        .optional(),
      text: z.string().optional()
    })
    .optional()
});

function buildTelegramDisplayLabel(update: z.infer<typeof telegramUpdateSchema>): string {
  const from = update.message?.from;
  if (!from) {
    return 'Telegram user';
  }

  if (from.username) {
    return `@${from.username}`;
  }

  return [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Telegram user';
}

export async function integrationRoutes(server: FastifyInstance): Promise<void> {
  server.post('/telegram/webhook', async (request, reply) => {
    const expectedSecret = appConfig.telegram?.webhookSecret?.trim();
    if (expectedSecret) {
      const actualSecret = request.headers['x-telegram-bot-api-secret-token'];
      if (actualSecret !== expectedSecret) {
        return reply.forbidden('Invalid Telegram webhook secret.');
      }
    }

    const parsed = telegramUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(200).send({ ok: true });
    }

    const messageText = parsed.data.message?.text?.trim() ?? '';
    const match = messageText.match(/^\/start(?:@\S+)?\s+([A-Za-z0-9]+)$/);
    if (!match) {
      return { ok: true };
    }

    try {
      const connected = await activateTelegramChannel({
        token: match[1],
        telegramUserId: String(parsed.data.message?.from?.id ?? ''),
        telegramChatId: String(parsed.data.message?.chat.id ?? ''),
        displayLabel: buildTelegramDisplayLabel(parsed.data)
      });

      if (connected) {
        await sendTelegramMessage({
          chatId: String(parsed.data.message?.chat.id ?? ''),
          text: 'Your CW Raid Manager Telegram notifications are now connected.'
        }).catch(() => undefined);
      }
    } catch (error) {
      await sendTelegramMessage({
        chatId: String(parsed.data.message?.chat.id ?? ''),
        text:
          error instanceof Error
            ? error.message
            : 'Unable to connect Telegram notifications right now.'
      }).catch(() => undefined);
    }

    return { ok: true };
  });

  server.get('/whatsapp/webhook', async (request, reply) => {
    const query = z
      .object({
        'hub.mode': z.string(),
        'hub.verify_token': z.string(),
        'hub.challenge': z.string()
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.badRequest('Invalid webhook verification request.');
    }

    if (
      query.data['hub.mode'] !== 'subscribe' ||
      query.data['hub.verify_token'] !== appConfig.whatsapp?.webhookVerifyToken
    ) {
      return reply.forbidden('Webhook verification failed.');
    }

    return reply.type('text/plain').send(query.data['hub.challenge']);
  });

  server.post('/whatsapp/webhook', async (request, reply) => {
    const body = request.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from?: string;
              id?: string;
              text?: { body?: string };
              profile?: { name?: string };
            }>;
            contacts?: Array<{
              profile?: { name?: string };
              wa_id?: string;
            }>;
          };
        }>;
      }>;
    };

    const messages = body.entry?.flatMap((entry) => entry.changes ?? []) ?? [];

    for (const change of messages) {
      const inboundMessages = change.value?.messages ?? [];
      const contacts = change.value?.contacts ?? [];

      for (const message of inboundMessages) {
        const text = message.text?.body?.trim() ?? '';
        const match = text.match(/^CONNECT\s+([A-Za-z0-9]+)$/i);
        if (!match) {
          continue;
        }

        const contact = contacts.find((entry) => entry.wa_id === message.from);
        try {
          const connected = await activateWhatsappChannel({
            token: match[1],
            externalPhone: message.from ?? '',
            externalUserId: message.id ?? null,
            displayLabel: contact?.profile?.name ?? message.from ?? null
          });

          if (connected && message.from) {
            await sendWhatsappMessage({
              toPhoneNumber: message.from,
              text: 'Your CW Raid Manager WhatsApp notifications are now connected.'
            }).catch(() => undefined);
          }
        } catch (error) {
          if (message.from) {
            await sendWhatsappMessage({
              toPhoneNumber: message.from,
              text:
                error instanceof Error
                  ? error.message
                  : 'Unable to connect WhatsApp notifications right now.'
            }).catch(() => undefined);
          }
        }
      }
    }

    return reply.code(200).send({ ok: true });
  });
}
