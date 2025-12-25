import type { FastifyReply } from 'fastify';
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

// Queue of pending debug messages per guild (for when no admin is connected)
const pendingMessages: Map<string, DebugWebhookMessage[]> = new Map();

// Maximum number of pending messages to queue per guild
const MAX_PENDING_MESSAGES = 50;

let messageIdCounter = 0;

function generateMessageId(): string {
  return `debug-${Date.now()}-${++messageIdCounter}`;
}

/**
 * Register an SSE client connection for webhook debugging
 */
export function registerDebugClient(
  guildId: string,
  userId: string,
  isAdmin: boolean,
  reply: FastifyReply
): void {
  if (!isAdmin) {
    console.log(`[WebhookDebug] Non-admin user ${userId} tried to register for guild ${guildId}`);
    return;
  }

  console.log(`[WebhookDebug] Admin ${userId} connected for guild ${guildId}`);

  const client: ConnectedClient = { guildId, userId, reply, isAdmin };

  const guildClients = connectedClients.get(guildId) ?? [];
  guildClients.push(client);
  connectedClients.set(guildId, guildClients);

  // Send any pending messages to the newly connected client
  const pending = pendingMessages.get(guildId) ?? [];
  if (pending.length > 0) {
    console.log(`[WebhookDebug] Sending ${pending.length} pending messages to ${userId}`);
    for (const message of pending) {
      sendToClient(client, message);
    }
    // Clear pending messages after sending
    pendingMessages.delete(guildId);
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
 * Broadcast a debug webhook message to all connected admin clients for a guild
 * Returns true if the message was sent to at least one client
 */
export function broadcastDebugWebhook(
  guildId: string,
  guildName: string,
  event: string,
  eventLabel: string,
  webhookLabel: string,
  payload: DiscordWebhookBody
): boolean {
  const message: DebugWebhookMessage = {
    id: generateMessageId(),
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

  // If no clients connected, queue the message
  if (!guildClients || guildClients.length === 0) {
    console.log(`[WebhookDebug] No clients connected, queueing message`);
    queuePendingMessage(guildId, message);
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

  // If no admin clients were connected, queue the message
  if (!sentToAny) {
    console.log(`[WebhookDebug] No admin clients, queueing message`);
    queuePendingMessage(guildId, message);
  }

  return sentToAny;
}

/**
 * Queue a message for later delivery when an admin connects
 */
function queuePendingMessage(guildId: string, message: DebugWebhookMessage): void {
  const pending = pendingMessages.get(guildId) ?? [];

  // Add the new message
  pending.push(message);

  // Trim to max size (remove oldest messages first)
  while (pending.length > MAX_PENDING_MESSAGES) {
    pending.shift();
  }

  pendingMessages.set(guildId, pending);
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
export function getPendingMessageCount(guildId: string): number {
  return pendingMessages.get(guildId)?.length ?? 0;
}
