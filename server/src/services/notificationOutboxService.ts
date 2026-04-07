import { NotificationDeliveryStatus, NotificationProvider } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { renderNotificationEvent } from './notificationEventRenderer.js';
import { sendTelegramMessage } from './telegramNotificationProvider.js';
import { getActiveNotificationChannel, markChannelTestMessageSent } from './userNotificationService.js';
import { sendWhatsappMessage } from './whatsappNotificationProvider.js';

const MAX_DELIVERY_ATTEMPTS = 5;

function buildRetryDate(attemptCount: number): Date {
  const minutes = Math.min(5 * 2 ** Math.max(0, attemptCount - 1), 6 * 60);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function resolveNotificationRenderInput(delivery: {
  eventKey: string;
  payload: unknown;
}): Promise<{ eventKey: string; payload: unknown }> {
  if (delivery.eventKey !== 'raid.reminder.60m') {
    return {
      eventKey: delivery.eventKey,
      payload: delivery.payload
    };
  }

  const payload = asObject(delivery.payload);
  const raidId = asNonEmptyString(payload.raidId);
  if (!raidId) {
    return {
      eventKey: delivery.eventKey,
      payload: delivery.payload
    };
  }

  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    select: {
      id: true,
      name: true,
      startedAt: true
    }
  });

  if (!raid?.startedAt) {
    return {
      eventKey: delivery.eventKey,
      payload: delivery.payload
    };
  }

  return {
    eventKey: 'raid.started',
    payload: {
      ...payload,
      raidId: raid.id,
      raidName: asNonEmptyString(payload.raidName) ?? raid.name,
      startedAt: raid.startedAt.toISOString()
    }
  };
}

async function deliverNotification(deliveryId: string): Promise<void> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId }
  });

  if (!delivery || delivery.status !== NotificationDeliveryStatus.PROCESSING) {
    return;
  }

  const channel = await getActiveNotificationChannel(delivery.userId, delivery.provider);
  if (!channel) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        attemptCount: delivery.attemptCount + 1,
        lastError: 'No active notification channel is connected for this provider.',
        deliverAt: buildRetryDate(delivery.attemptCount + 1)
      }
    });
    return;
  }

  const renderInput = await resolveNotificationRenderInput(delivery);
  const rendered = renderNotificationEvent(renderInput.eventKey, renderInput.payload, {
    provider: delivery.provider
  });

  try {
    const result =
      delivery.provider === NotificationProvider.TELEGRAM
        ? await sendTelegramMessage({
            chatId: channel.externalChatId ?? '',
            text: rendered.text
          })
        : await sendWhatsappMessage({
            toPhoneNumber: channel.externalPhone ?? '',
            text: rendered.text
          });

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: NotificationDeliveryStatus.SENT,
        attemptCount: delivery.attemptCount + 1,
        providerMessageId: result.providerMessageId ?? null,
        lastError: null,
        sentAt: new Date()
      }
    });
  } catch (error) {
    const attempts = delivery.attemptCount + 1;
    const retryable = attempts < MAX_DELIVERY_ATTEMPTS;

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        attemptCount: attempts,
        lastError: error instanceof Error ? error.message : 'Notification delivery failed.',
        deliverAt: retryable ? buildRetryDate(attempts) : delivery.deliverAt
      }
    });
  }
}

export async function processNotificationOutbox(limit = 50): Promise<number> {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      status: {
        in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.FAILED]
      },
      deliverAt: {
        lte: new Date()
      },
      attemptCount: {
        lt: MAX_DELIVERY_ATTEMPTS
      }
    },
    orderBy: [{ deliverAt: 'asc' }, { createdAt: 'asc' }],
    take: limit
  });

  let processed = 0;

  for (const delivery of deliveries) {
    const claimed = await prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        status: delivery.status
      },
      data: {
        status: NotificationDeliveryStatus.PROCESSING
      }
    });

    if (claimed.count === 0) {
      continue;
    }

    await deliverNotification(delivery.id);
    processed += 1;
  }

  return processed;
}

export async function sendNotificationTestMessage(
  userId: string,
  provider: NotificationProvider
): Promise<void> {
  const channel = await getActiveNotificationChannel(userId, provider);
  if (!channel) {
    throw new Error(`No active ${provider.toLowerCase()} channel is connected.`);
  }

  const rendered = renderNotificationEvent('notification.test', { provider }, { provider });

  if (provider === NotificationProvider.TELEGRAM) {
    await sendTelegramMessage({
      chatId: channel.externalChatId ?? '',
      text: rendered.text
    });
  } else {
    await sendWhatsappMessage({
      toPhoneNumber: channel.externalPhone ?? '',
      text: rendered.text
    });
  }

  await markChannelTestMessageSent(userId, provider);
}
