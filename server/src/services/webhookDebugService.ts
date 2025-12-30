import type { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma.js';

export interface DebugWebhookMessage {
  id: string;
  guildId: string;
  guildName: string;
  event: string;
  eventLabel: string;
  payload: DiscordWebhookBody;
  timestamp: string;
  webhookLabel: string;
}

interface DiscordWebhookBody {
  [key: string]: unknown;
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
    thumbnail?: { url: string };
  }>;
  username?: string;
  avatar_url?: string;
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
  };
}

interface ConnectedClient {
  guildId: string;
  userId: string;
  reply: FastifyReply;
  isAdmin: boolean;
}

// Map of guildId -> array of connected admin clients
const connectedClients: Map<string, ConnectedClient[]> = new Map();

// Maximum number of pending messages to store per guild
const MAX_PENDING_MESSAGES = 50;

/**
 * Register an SSE client connection for webhook debugging
 */
export async function registerDebugClient(
  guildId: string,
  userId: string,
  isAdmin: boolean,
  reply: FastifyReply
): Promise<void> {
  if (!isAdmin) {
    console.log(`[WebhookDebug] Non-admin user ${userId} tried to register for guild ${guildId}`);
    return;
  }

  console.log(`[WebhookDebug] Admin ${userId} connected for guild ${guildId}`);

  const client: ConnectedClient = { guildId, userId, reply, isAdmin };

  const guildClients = connectedClients.get(guildId) ?? [];
  guildClients.push(client);
  connectedClients.set(guildId, guildClients);

  // Fetch and send any pending messages from the database
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { name: true }
    });
    const guildName = guild?.name ?? 'Unknown Guild';

    const pendingRecords = await prisma.webhookDebugMessage.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' },
      take: MAX_PENDING_MESSAGES
    });

    if (pendingRecords.length > 0) {
      console.log(`[WebhookDebug] Sending ${pendingRecords.length} pending messages from database to ${userId}`);
      for (const record of pendingRecords) {
        const message: DebugWebhookMessage = {
          id: record.id,
          guildId: record.guildId,
          guildName,
          event: record.event,
          eventLabel: record.eventLabel,
          webhookLabel: record.webhookLabel,
          payload: record.payload as DiscordWebhookBody,
          timestamp: record.createdAt.toISOString()
        };
        sendToClient(client, message);
      }

      // Delete delivered messages from the database
      await prisma.webhookDebugMessage.deleteMany({
        where: {
          id: { in: pendingRecords.map((r) => r.id) }
        }
      });
      console.log(`[WebhookDebug] Deleted ${pendingRecords.length} delivered messages from database`);
    }
  } catch (error) {
    console.error(`[WebhookDebug] Error fetching pending messages from database:`, error);
  }
}

/**
 * Unregister an SSE client connection
 */
export function unregisterDebugClient(guildId: string, userId: string): void {
  console.log(`[WebhookDebug] Client ${userId} disconnected from guild ${guildId}`);

  const guildClients = connectedClients.get(guildId);
  if (!guildClients) {
    return;
  }

  const filtered = guildClients.filter((client) => client.userId !== userId);
  if (filtered.length === 0) {
    connectedClients.delete(guildId);
  } else {
    connectedClients.set(guildId, filtered);
  }
}

/**
 * Check if webhook debug mode is enabled for a guild
 */
export async function isWebhookDebugModeEnabled(guildId: string): Promise<boolean> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { webhookDebugMode: true }
  });

  return guild?.webhookDebugMode ?? false;
}

/**
 * Toggle webhook debug mode for a guild
 */
export async function setWebhookDebugMode(guildId: string, enabled: boolean): Promise<boolean> {
  const guild = await prisma.guild.update({
    where: { id: guildId },
    data: { webhookDebugMode: enabled },
    select: { webhookDebugMode: true }
  });

  return guild.webhookDebugMode;
}

/**
 * Get webhook debug mode status for a guild
 */
export async function getWebhookDebugMode(guildId: string): Promise<boolean> {
  return isWebhookDebugModeEnabled(guildId);
}

/**
 * Broadcast a debug webhook message to all connected admin clients for a guild.
 * If no clients are connected, stores the message in the database for later delivery.
 * Returns true if the message was sent to at least one client.
 */
export async function broadcastDebugWebhook(
  guildId: string,
  guildName: string,
  event: string,
  eventLabel: string,
  webhookLabel: string,
  payload: DiscordWebhookBody
): Promise<boolean> {
  const message: DebugWebhookMessage = {
    id: randomUUID(),
    guildId,
    guildName,
    event,
    eventLabel,
    payload,
    timestamp: new Date().toISOString(),
    webhookLabel
  };

  const guildClients = connectedClients.get(guildId);
  const clientCount = guildClients?.length ?? 0;

  console.log(`[WebhookDebug] Broadcasting ${event} for guild ${guildId}, ${clientCount} clients connected`);

  // If no clients connected, queue the message in the database
  if (!guildClients || guildClients.length === 0) {
    console.log(`[WebhookDebug] No clients connected, storing message in database for later delivery`);
    await queuePendingMessage(guildId, message);
    return false;
  }

  // Broadcast to all connected admin clients
  let sentToAny = false;
  for (const client of guildClients) {
    if (client.isAdmin) {
      console.log(`[WebhookDebug] Sending to admin client ${client.userId}`);
      sendToClient(client, message);
      sentToAny = true;
    }
  }

  // If no admin clients were connected, queue the message in the database
  if (!sentToAny) {
    console.log(`[WebhookDebug] No admin clients, storing message in database for later delivery`);
    await queuePendingMessage(guildId, message);
  }

  return sentToAny;
}

/**
 * Queue a message for later delivery when an admin connects.
 * Stores in the database so messages persist across processes (e.g., cron jobs).
 */
async function queuePendingMessage(guildId: string, message: DebugWebhookMessage): Promise<void> {
  try {
    // Store the message in the database
    await prisma.webhookDebugMessage.create({
      data: {
        id: message.id,
        guildId,
        event: message.event,
        eventLabel: message.eventLabel,
        webhookLabel: message.webhookLabel,
        payload: message.payload
      }
    });

    // Clean up old messages if there are too many
    const count = await prisma.webhookDebugMessage.count({ where: { guildId } });
    if (count > MAX_PENDING_MESSAGES) {
      const toDelete = await prisma.webhookDebugMessage.findMany({
        where: { guildId },
        orderBy: { createdAt: 'asc' },
        take: count - MAX_PENDING_MESSAGES,
        select: { id: true }
      });
      if (toDelete.length > 0) {
        await prisma.webhookDebugMessage.deleteMany({
          where: { id: { in: toDelete.map((r) => r.id) } }
        });
      }
    }
  } catch (error) {
    console.error(`[WebhookDebug] Error storing pending message in database:`, error);
  }
}

/**
 * Send a message to a connected client via SSE
 */
function sendToClient(client: ConnectedClient, message: DebugWebhookMessage): void {
  try {
    const data = JSON.stringify(message);
    const written = client.reply.raw.write(`data: ${data}\n\n`);
    console.log(`[WebhookDebug] Sent message ${message.id} to client ${client.userId}, write result: ${written}`);
  } catch (err) {
    console.error(`[WebhookDebug] Failed to send to client ${client.userId}:`, err);
    // Client might have disconnected, remove them
    unregisterDebugClient(client.guildId, client.userId);
  }
}

/**
 * Get count of connected admin clients for a guild
 */
export function getConnectedAdminCount(guildId: string): number {
  const guildClients = connectedClients.get(guildId);
  if (!guildClients) {
    return 0;
  }
  return guildClients.filter((client) => client.isAdmin).length;
}

/**
 * Get pending message count for a guild
 */
export async function getPendingMessageCount(guildId: string): Promise<number> {
  return prisma.webhookDebugMessage.count({ where: { guildId } });
}
