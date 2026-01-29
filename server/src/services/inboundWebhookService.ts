import { createHash, randomBytes } from 'crypto';
import { prisma } from '../utils/prisma.js';
import { Prisma, type InboundWebhookActionType, type InboundWebhookMessageStatus } from '@prisma/client';
import { reviewCrashReport, sortCrashReportSegments } from './geminiCrashReviewService.js';
import { appConfig } from '../config/appConfig.js';

// ============================================================================
// SERVICE LOADED - AUTO-MERGE VERSION 2.0
// ============================================================================

// Server identifier for per-server settings (e.g., 'production', 'local', 'dev')
const SERVER_ID = process.env.SERVER_ID || 'default';

console.log('========================================');
console.log('[InboundWebhookService] LOADED - AUTO-MERGE v2.0');
console.log('[InboundWebhookService] Delayed processing ENABLED');
console.log(`[InboundWebhookService] Server ID: ${SERVER_ID}`);
console.log('========================================');

// ============================================================================
// System Settings Helpers
// ============================================================================

// Per-server setting key
const PROCESSING_ENABLED_KEY = `webhookProcessingEnabled:${SERVER_ID}`;

/**
 * Check if webhook processing is enabled for this server instance.
 * Uses SERVER_ID env var to store per-server settings in the shared database.
 */
async function isWebhookProcessingEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: PROCESSING_ENABLED_KEY }
    });
    // Default to enabled if no setting exists for this server
    return setting?.value !== 'false';
  } catch {
    // If table doesn't exist yet, default to enabled
    return true;
  }
}

/**
 * Get the webhook processing enabled setting (simple boolean).
 */
export async function getWebhookProcessingEnabled(): Promise<boolean> {
  return isWebhookProcessingEnabled();
}

/**
 * Get detailed webhook processing status for this server.
 */
export async function getWebhookProcessingStatus(): Promise<{
  effectivelyEnabled: boolean;
  serverId: string;
}> {
  const effectivelyEnabled = await isWebhookProcessingEnabled();

  return {
    effectivelyEnabled,
    serverId: SERVER_ID
  };
}

/**
 * Set the webhook processing enabled setting for this server.
 */
export async function setWebhookProcessingEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: PROCESSING_ENABLED_KEY },
    update: { value: enabled ? 'true' : 'false' },
    create: { key: PROCESSING_ENABLED_KEY, value: enabled ? 'true' : 'false' }
  });
  console.log(`[InboundWebhookService] Webhook processing ${enabled ? 'ENABLED' : 'DISABLED'} for server "${SERVER_ID}"`);
}

// ============================================================================
// Auto-Merge Timer Tracking
// ============================================================================

// Pending auto-merge group info
interface PendingMergeGroup {
  groupKey: string;           // Crash file identifier or 'default'
  webhookId: string;
  messageIds: string[];
  firstMessageAt: Date;
  expiresAt: Date;
  timer: NodeJS.Timeout | null;  // null when processing
  status: 'pending' | 'processing';
}

// Track pending merge groups by a composite key: webhookId:groupKey
const pendingMergeGroups = new Map<string, PendingMergeGroup>();

// Legacy timer map for backwards compatibility during transition
const pendingProcessingTimers = new Map<string, NodeJS.Timeout>();

// Track auto-merge retry counts to limit retries
const autoMergeRetryCounts = new Map<string, number>();
const AUTO_MERGE_MAX_RETRIES = 1;

// Track webhooks currently being processed to prevent concurrent processing
const processingWebhooks = new Set<string>();

// Track groups currently being processed to prevent concurrent processing
const processingGroups = new Set<string>();

// Resolve client base URL for building links
const clientBaseUrl = resolveClientBaseUrl();

function resolveClientBaseUrl(): string | null {
  const candidates = [
    appConfig.clientUrl,
    process.env.CLIENT_URL,
    process.env.PUBLIC_CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.WEB_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
    process.env.RENDER_EXTERNAL_URL,
    process.env.DEPLOYMENT_URL
  ];

  const normalizedCandidates = candidates
    .map((value) => {
      if (!value || typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        const url = new URL(withScheme);
        return `${url.protocol}//${url.host}`.replace(/\/$/, '');
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  const isLocalHost = (value: string): boolean => {
    try {
      const { hostname } = new URL(value);
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.') || hostname.endsWith('.local');
    } catch {
      return false;
    }
  };

  const nonLocal = normalizedCandidates.find((value) => !isLocalHost(value));
  return nonLocal ?? normalizedCandidates[0] ?? null;
}

export interface InboundWebhookRetentionPolicy {
  mode: 'indefinite' | 'days' | 'maxCount';
  days?: number;
  maxCount?: number;
}

export interface InboundWebhookActionConfig {
  discordWebhookUrl?: string;
  devDiscordWebhookUrl?: string;
  discordMode?: 'RAW' | 'WRAP';
  discordTemplate?: string;
  crashModel?: string;
  crashMaxInputChars?: number;
  crashMaxOutputTokens?: number;
  crashTemperature?: number;
  crashPromptTemplate?: string;
  // ClawdBot relay fields
  clawdbotWebhookUrl?: string;
  devClawdbotWebhookUrl?: string;
  clawdbotMode?: 'RAW' | 'WRAP';
  clawdbotTemplate?: string;
}

export interface CreateInboundWebhookInput {
  label: string;
  description?: string | null;
  isEnabled?: boolean;
  retentionPolicy?: InboundWebhookRetentionPolicy | null;
}

export interface UpdateInboundWebhookInput {
  label?: string;
  description?: string | null;
  isEnabled?: boolean;
  retentionPolicy?: InboundWebhookRetentionPolicy | null;
  mergeWindowSeconds?: number;
  autoMerge?: boolean;
  devMode?: boolean;
}

export interface CreateInboundWebhookActionInput {
  type: InboundWebhookActionType;
  name: string;
  isEnabled?: boolean;
  config?: InboundWebhookActionConfig | null;
  sortOrder?: number;
}

export interface UpdateInboundWebhookActionInput {
  name?: string;
  isEnabled?: boolean;
  config?: InboundWebhookActionConfig | null;
  sortOrder?: number;
}

export interface InboundWebhookMessageInput {
  webhookId: string;
  token: string;
  payload: unknown;
  rawBody?: string | null;
  headers?: Record<string, unknown>;
  sourceIp?: string | null;
}

const GEMINI_TIMEOUT_MS = 120_000;
const MODULES_MAX_LINES = 400;
const MODULES_MAX_CHARS = 60_000;
const RAW_HEAD_CHARS = 25_000;
const RAW_TAIL_CHARS = 25_000;
const EXTRACT_MAX_CHARS = 120_000;

export function generateWebhookToken(): string {
  return randomBytes(24).toString('base64url');
}

export function normalizeRetentionPolicy(input?: InboundWebhookRetentionPolicy | null) {
  if (!input || !input.mode) {
    return { mode: 'indefinite' } satisfies InboundWebhookRetentionPolicy;
  }

  if (input.mode === 'days') {
    const days = typeof input.days === 'number' && input.days > 0 ? Math.floor(input.days) : 30;
    return { mode: 'days', days } satisfies InboundWebhookRetentionPolicy;
  }

  if (input.mode === 'maxCount') {
    const maxCount =
      typeof input.maxCount === 'number' && input.maxCount > 0 ? Math.floor(input.maxCount) : 5000;
    return { mode: 'maxCount', maxCount } satisfies InboundWebhookRetentionPolicy;
  }

  return { mode: 'indefinite' } satisfies InboundWebhookRetentionPolicy;
}

export async function listInboundWebhooks() {
  return prisma.inboundWebhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
}

export async function createInboundWebhook(userId: string, input: CreateInboundWebhookInput) {
  const retentionPolicy = normalizeRetentionPolicy(input.retentionPolicy ?? null);
  const token = generateWebhookToken();

  return prisma.inboundWebhook.create({
    data: {
      label: input.label.trim(),
      description: input.description?.trim() || null,
      isEnabled: input.isEnabled ?? true,
      token,
      retentionPolicy,
      createdById: userId
    },
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
}

export async function updateInboundWebhook(webhookId: string, input: UpdateInboundWebhookInput) {
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) {
    data.label = input.label.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.isEnabled !== undefined) {
    data.isEnabled = input.isEnabled;
  }
  if (input.retentionPolicy !== undefined) {
    data.retentionPolicy = normalizeRetentionPolicy(input.retentionPolicy ?? null);
  }
  if (input.mergeWindowSeconds !== undefined) {
    data.mergeWindowSeconds = input.mergeWindowSeconds;
  }
  if (input.autoMerge !== undefined) {
    data.autoMerge = input.autoMerge;
  }
  if (input.devMode !== undefined) {
    data.devMode = input.devMode;
  }

  return prisma.inboundWebhook.update({
    where: { id: webhookId },
    data,
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
}

export async function deleteInboundWebhook(webhookId: string) {
  await prisma.inboundWebhook.delete({
    where: { id: webhookId }
  });
}

export async function createInboundWebhookAction(webhookId: string, input: CreateInboundWebhookActionInput) {
  return prisma.inboundWebhookAction.create({
    data: {
      webhookId,
      type: input.type,
      name: input.name.trim(),
      isEnabled: input.isEnabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      sortOrder: input.sortOrder ?? 0
    }
  });
}

export async function updateInboundWebhookAction(actionId: string, input: UpdateInboundWebhookActionInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    data.name = input.name.trim();
  }
  if (input.isEnabled !== undefined) {
    data.isEnabled = input.isEnabled;
  }
  if (input.config !== undefined) {
    data.config = input.config ?? {};
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }

  return prisma.inboundWebhookAction.update({
    where: { id: actionId },
    data
  });
}

export async function deleteInboundWebhookAction(actionId: string) {
  await prisma.inboundWebhookAction.delete({ where: { id: actionId } });
}

export async function listInboundWebhookMessages(options: {
  page: number;
  pageSize: number;
  webhookId?: string;
  status?: InboundWebhookMessageStatus;
  includeArchived?: boolean;
}) {
  const { page, pageSize, webhookId, status, includeArchived } = options;
  const where: Record<string, unknown> = {};
  if (webhookId) {
    where.webhookId = webhookId;
  }
  if (status) {
    where.status = status;
  }
  // If includeArchived is false, only show non-archived; if true, show all
  if (!includeArchived) {
    where.archivedAt = null;
  }

  const [messages, total] = await Promise.all([
    prisma.inboundWebhookMessage.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        webhook: {
          include: { actions: true }
        },
        assignedAdmin: {
          select: { id: true, displayName: true, nickname: true, email: true }
        },
        actionRuns: {
          include: { action: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    }),
    prisma.inboundWebhookMessage.count({ where })
  ]);

  return { messages, total };
}

export async function getInboundWebhookMessage(messageId: string, userId?: string) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: {
        include: { actions: true }
      },
      assignedAdmin: {
        select: { id: true, displayName: true, nickname: true, email: true }
      },
      actionRuns: {
        include: { action: true },
        orderBy: { createdAt: 'asc' }
      },
      labelAssignments: {
        include: { label: true }
      },
      readStatuses: userId
        ? { where: { userId }, take: 1 }
        : false,
      stars: userId
        ? { where: { userId }, take: 1 }
        : false
    }
  });

  if (!message) return null;

  // Transform to include computed fields for consistency with enhanced list
  return {
    ...message,
    labels: message.labelAssignments.map((la) => la.label),
    isRead: userId && message.readStatuses ? message.readStatuses.length > 0 : undefined,
    isStarred: userId && message.stars ? message.stars.length > 0 : undefined,
    labelAssignments: undefined,
    readStatuses: undefined,
    stars: undefined
  };
}

export async function retryCrashReviewForMessage(messageId: string) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw new Error('Webhook message not found.');
  }

  const webhook = await prisma.inboundWebhook.findUnique({
    where: { id: message.webhookId },
    include: { actions: true }
  });

  if (!webhook) {
    throw new Error('Webhook not found.');
  }

  const crashAction = webhook.actions.find((action) => action.type === 'CRASH_REVIEW');
  if (!crashAction) {
    throw new Error('Crash review action not configured.');
  }

  const run = await prisma.inboundWebhookActionRun.create({
    data: {
      messageId,
      actionId: crashAction.id,
      status: 'PENDING_REVIEW',
      result: { note: 'Crash review retry in progress.' }
    }
  });

  const crashConfig = normalizeActionConfig(crashAction.config);
  const crashInput = buildCrashReviewInput(message.payload, message.rawBody, message.payload);
  const extracted = extractCrashReportSections(crashInput);
  const crashReportExtract = buildCrashReportExtract(extracted);

  if (message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)) {
    const payloadCopy = { ...(message.payload as Record<string, unknown>) };
    const crashReportText = typeof payloadCopy.crashReportText === 'string' ? payloadCopy.crashReportText : null;

    if (crashReportText && crashReportText.length > RAW_HEAD_CHARS + RAW_TAIL_CHARS) {
      payloadCopy.crashReportText = undefined;
    }

    payloadCopy.crashReport = crashReportExtract;

    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: { payload: payloadCopy as Prisma.InputJsonValue }
    });
  }

  try {
    const { findings, attempts } = await reviewCrashReportWithRetry(extracted.combined, crashConfig);
    await prisma.inboundWebhookActionRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        result: findings as Prisma.InputJsonValue,
        durationMs: Date.now() - new Date(run.createdAt).getTime()
      }
    });
    await updateActionSummary(messageId, crashAction.id, 'SUCCESS');
    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: {
        status: 'PROCESSED'
      }
    });

    // Detect crash type (script error vs crash) once for both labeling and Discord
    const findingsRecord = findings as Record<string, unknown> | null;
    const signature = findingsRecord?.signature as { exception?: string | null; topFrame?: string | null } | undefined;
    const summaryText = typeof findingsRecord?.summary === 'string' ? findingsRecord.summary as string : '';
    const isQuestError = detectQuestError(signature, summaryText, crashInput);
    const errorType = isQuestError ? 'script_error' : 'crash';

    // Auto-label based on crash type and webhook source
    await autoLabelMessage(messageId, findings, signature ?? { exception: extracted.exceptionLine }, webhook.label, crashInput);

    // After successful AI review, trigger Discord action if configured
    const discordAction = webhook.actions.find(
      (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
    );
    if (discordAction) {
      const discordConfig = normalizeActionConfig(discordAction.config);
      const discordUrl = getDiscordUrl(discordConfig, webhook.devMode);
      if (discordUrl) {
        const discordStartedAt = Date.now();
        try {
          // Build enriched payload with crash review findings and error type
          const enrichedPayload = enrichPayloadWithCrashReview(message.payload, findings, attempts, errorType);
          await sendDiscordRelay(discordUrl, enrichedPayload, discordConfig, messageId);
          await prisma.inboundWebhookActionRun.create({
            data: {
              messageId,
              actionId: discordAction.id,
              status: 'SUCCESS',
              durationMs: Date.now() - discordStartedAt
            }
          });
          await updateActionSummary(messageId, discordAction.id, 'SUCCESS');
        } catch (discordError) {
          await prisma.inboundWebhookActionRun.create({
            data: {
              messageId,
              actionId: discordAction.id,
              status: 'FAILED',
              error: discordError instanceof Error ? discordError.message : 'Unknown Discord error',
              durationMs: Date.now() - discordStartedAt
            }
          });
          await updateActionSummary(messageId, discordAction.id, 'FAILED');
          // Don't throw - Discord failure shouldn't fail the whole operation
          console.error('Discord relay failed after AI review:', discordError);
        }
      }
    }

    // After successful AI review, also trigger ClawdBot action if configured
    const clawdbotAction = webhook.actions.find(
      (action) => action.type === 'CLAWDBOT_RELAY' && action.isEnabled
    );
    if (clawdbotAction) {
      const clawdbotConfig = normalizeActionConfig(clawdbotAction.config);
      const clawdbotUrl = getClawdbotUrl(clawdbotConfig, webhook.devMode);
      if (clawdbotUrl) {
        const clawdbotStartedAt = Date.now();
        try {
          // Send the full crash text (rawBody), NOT the AI findings
          // The rawBody contains the sorted/merged crash report text
          await sendClawdbotRelay(clawdbotUrl, message.payload, clawdbotConfig, message.rawBody);
          await prisma.inboundWebhookActionRun.create({
            data: {
              messageId,
              actionId: clawdbotAction.id,
              status: 'SUCCESS',
              durationMs: Date.now() - clawdbotStartedAt
            }
          });
          await updateActionSummary(messageId, clawdbotAction.id, 'SUCCESS');
        } catch (clawdbotError) {
          await prisma.inboundWebhookActionRun.create({
            data: {
              messageId,
              actionId: clawdbotAction.id,
              status: 'FAILED',
              error: clawdbotError instanceof Error ? clawdbotError.message : 'Unknown ClawdBot error',
              durationMs: Date.now() - clawdbotStartedAt
            }
          });
          await updateActionSummary(messageId, clawdbotAction.id, 'FAILED');
          console.error('ClawdBot relay failed after AI review:', clawdbotError);
        }
      }
    }
  } catch (error) {
    await prisma.inboundWebhookActionRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - new Date(run.createdAt).getTime()
      }
    });
    await updateActionSummary(messageId, crashAction.id, 'FAILED');
  }

  return getInboundWebhookMessage(messageId);
}

export async function receiveInboundWebhookMessage(input: InboundWebhookMessageInput) {
  console.log(`[WEBHOOK RECEIVE] ========== NEW MESSAGE RECEIVED ==========`);
  console.log(`[WEBHOOK RECEIVE] webhookId: ${input.webhookId}`);

  // Check if webhook processing is disabled (for testing with shared database)
  const processingEnabled = await isWebhookProcessingEnabled();
  if (!processingEnabled) {
    console.log(`[WEBHOOK RECEIVE] Processing DISABLED - skipping (enable in Webhook Settings or remove DISABLE_WEBHOOK_PROCESSING env var)`);
    return { id: 'skipped', webhookId: input.webhookId, status: 'SKIPPED' as const };
  }

  const webhook = await prisma.inboundWebhook.findUnique({
    where: { id: input.webhookId },
    include: { actions: true }
  });

  if (!webhook || webhook.token !== input.token) {
    throw new Error('Webhook not found.');
  }

  if (!webhook.isEnabled) {
    throw new Error('Webhook is disabled.');
  }

  console.log(`[WEBHOOK RECEIVE] Webhook found: ${webhook.label}, autoMerge=${webhook.autoMerge}, mergeWindow=${webhook.mergeWindowSeconds}s`);

  // Check if the message has any meaningful crash report content
  // This specifically looks for crashReportText, message, content, or rawBody
  // and does NOT fall back to JSON stringification of the payload
  const messageContent = extractActualMessageContent(input.payload, input.rawBody ?? null);

  // Log payload structure for debugging
  const payloadType = typeof input.payload;
  const payloadKeys = input.payload && typeof input.payload === 'object' ? Object.keys(input.payload as object) : [];
  console.log(`[WEBHOOK RECEIVE] Payload type: ${payloadType}, keys: [${payloadKeys.join(', ')}], rawBody: ${input.rawBody ? 'present' : 'null'}`);
  console.log(`[WEBHOOK RECEIVE] Content check: hasContent=${!!messageContent}, contentLength=${messageContent?.length ?? 0}`);
  if (!messageContent || messageContent.trim().length === 0) {
    console.log(`[WEBHOOK RECEIVE] >>>>>> DISCARDING MESSAGE - NO CONTENT <<<<<<`);
    // Return a minimal response but don't create a message record
    return { id: 'discarded', webhookId: webhook.id, status: 'DISCARDED' as const };
  }

  const message = await prisma.inboundWebhookMessage.create({
    data: {
      webhookId: webhook.id,
      sourceIp: input.sourceIp ?? null,
      headers: (input.headers ?? {}) as Prisma.InputJsonValue,
      payload: normalizePayload(input.payload) as Prisma.InputJsonValue,
      rawBody: input.rawBody ?? null,
      status: 'RECEIVED'
    }
  });

  await prisma.inboundWebhook.update({
    where: { id: webhook.id },
    data: { lastReceivedAt: new Date() }
  });

  // Apply labels immediately using pattern-based detection (no AI needed)
  // This ensures merge group detection works right away in the UI
  await applyImmediateLabels(message.id, messageContent, webhook.label);

  // Add message to pending merge group with fixed timer from first message
  const mergeWindow = webhook.mergeWindowSeconds ?? 60;
  const groupKey = extractCrashFileIdentifier(input.payload, input.rawBody ?? null) || 'default';
  console.log(`[WEBHOOK RECEIVE] Message created: ${message.id}, adding to group "${groupKey}" (merge window: ${mergeWindow}s)`);
  addMessageToPendingGroup(webhook.id, message.id, groupKey, mergeWindow);

  console.log(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
  return message;
}

export async function createInboundWebhookMessageForAdmin(options: {
  webhookId: string;
  payload: unknown;
  runActions?: boolean;
}) {
  const webhook = await prisma.inboundWebhook.findUnique({
    where: { id: options.webhookId },
    include: { actions: true }
  });

  if (!webhook) {
    throw new Error('Webhook not found.');
  }

  const message = await prisma.inboundWebhookMessage.create({
    data: {
      webhookId: webhook.id,
      sourceIp: 'admin-test',
      headers: { source: 'admin-test' } as Prisma.InputJsonValue,
      payload: normalizePayload(options.payload) as Prisma.InputJsonValue,
      rawBody: null,
      status: 'RECEIVED'
    }
  });

  await prisma.inboundWebhook.update({
    where: { id: webhook.id },
    data: { lastReceivedAt: new Date() }
  });

  // Apply labels immediately using pattern-based detection (no AI needed)
  const messageContent = extractActualMessageContent(options.payload, null);
  if (messageContent) {
    await applyImmediateLabels(message.id, messageContent, webhook.label);
  }

  if (options.runActions !== false) {
    // Add message to pending merge group with fixed timer from first message
    const mergeWindow = webhook.mergeWindowSeconds ?? 60;
    const groupKey = extractCrashFileIdentifier(options.payload, null) || 'default';
    addMessageToPendingGroup(webhook.id, message.id, groupKey, mergeWindow);
  } else {
    await prisma.inboundWebhookMessage.update({
      where: { id: message.id },
      data: {
        status: 'PROCESSED',
        actionSummary: []
      }
    });
  }

  return message;
}

async function runInboundWebhookActions(
  messageId: string,
  actions: Array<{
    id: string;
    type: InboundWebhookActionType;
    isEnabled: boolean;
    config: unknown;
  }>,
  payload: unknown,
  webhookLabel?: string,
  devMode = false
) {
  let overallStatus: InboundWebhookMessageStatus = 'PROCESSED';
  const summary: Array<{ actionId: string; status: string }> = [];
  let payloadForActions: unknown = payload;

  const crashActions = actions.filter((action) => action.type === 'CRASH_REVIEW');
  const otherActions = actions.filter((action) => action.type !== 'CRASH_REVIEW');
  const orderedActions = [...crashActions, ...otherActions];

  for (const action of orderedActions) {
    if (!action.isEnabled) {
      summary.push({ actionId: action.id, status: 'SKIPPED' });
      continue;
    }

    const startedAt = Date.now();
    try {
      if (action.type === 'DISCORD_RELAY') {
        const config = normalizeActionConfig(action.config);
        const discordUrl = getDiscordUrl(config, devMode);
        if (!discordUrl) {
          throw new Error('Discord webhook URL is missing.');
        }
        await sendDiscordRelay(discordUrl, payloadForActions, config, messageId);
        await prisma.inboundWebhookActionRun.create({
          data: {
            messageId,
            actionId: action.id,
            status: 'SUCCESS',
            durationMs: Date.now() - startedAt
          }
        });
        summary.push({ actionId: action.id, status: 'SUCCESS' });
        continue;
      }

      if (action.type === 'CLAWDBOT_RELAY') {
        // ClawdBot relay is deferred until after AI review completes
        // This ensures we send the final merged crash report, not the initial payload
        // The relay will be triggered in retryCrashReviewForMessage after AI processing
        console.log(`[ClawdBot] Skipping immediate relay - will send after AI review`);
        summary.push({ actionId: action.id, status: 'PENDING_REVIEW' });
        continue;
      }

      if (action.type === 'CRASH_REVIEW') {
        const message = await prisma.inboundWebhookMessage.findUnique({
          where: { id: messageId }
        });

        const crashConfig = normalizeActionConfig(action.config);
        const crashInput = buildCrashReviewInput(message?.payload, message?.rawBody, payloadForActions);

        // Check if this message looks like a crash report or script error
        // If not, skip AI review and let it pass through to Discord unchanged
        if (!looksLikeCrashReport(crashInput)) {
          await prisma.inboundWebhookActionRun.create({
            data: {
              messageId,
              actionId: action.id,
              status: 'SKIPPED',
              result: { note: 'Message does not appear to be a crash report or script error.' },
              durationMs: Date.now() - startedAt
            }
          });
          summary.push({ actionId: action.id, status: 'SKIPPED' });
          continue;
        }

        const run = await prisma.inboundWebhookActionRun.create({
          data: {
            messageId,
            actionId: action.id,
            status: 'PENDING_REVIEW',
            result: { note: 'Crash review in progress.' }
          }
        });

        const extracted = extractCrashReportSections(crashInput);
        const crashReportExtract = buildCrashReportExtract(extracted);

        if (message?.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)) {
          const payloadCopy = { ...(message.payload as Record<string, unknown>) };
          const crashReportText = typeof payloadCopy.crashReportText === 'string' ? payloadCopy.crashReportText : null;

          if (crashReportText && crashReportText.length > RAW_HEAD_CHARS + RAW_TAIL_CHARS) {
            payloadCopy.crashReportText = undefined;
          }

          payloadCopy.crashReport = crashReportExtract;

          await prisma.inboundWebhookMessage.update({
            where: { id: messageId },
            data: { payload: payloadCopy as Prisma.InputJsonValue }
          });
        }

        try {
          const { findings, attempts } = await reviewCrashReportWithRetry(extracted.combined, crashConfig);
          await prisma.inboundWebhookActionRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              result: findings as Prisma.InputJsonValue,
              durationMs: Date.now() - startedAt
            }
          });
          summary.push({ actionId: action.id, status: 'SUCCESS' });

          // Detect crash type (script error vs crash) once for both labeling and Discord
          const findingsRecord = findings as Record<string, unknown> | null;
          const signature = findingsRecord?.signature as { exception?: string | null; topFrame?: string | null } | undefined;
          const summaryText = typeof findingsRecord?.summary === 'string' ? findingsRecord.summary as string : '';
          const isQuestError = detectQuestError(signature, summaryText, crashInput);
          const errorType = isQuestError ? 'script_error' : 'crash';

          payloadForActions = enrichPayloadWithCrashReview(payloadForActions, findings, attempts, errorType);

          // Auto-label based on crash type and webhook source
          await autoLabelMessage(messageId, findings, signature ?? { exception: extracted.exceptionLine }, webhookLabel, crashInput);
        } catch (error) {
          overallStatus = 'FAILED';
          await prisma.inboundWebhookActionRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              durationMs: Date.now() - startedAt
            }
          });
          summary.push({ actionId: action.id, status: 'FAILED' });
        }
        continue;
      }

      await prisma.inboundWebhookActionRun.create({
        data: {
          messageId,
          actionId: action.id,
          status: 'SKIPPED',
          result: { note: 'Unknown action type.' },
          durationMs: Date.now() - startedAt
        }
      });
      summary.push({ actionId: action.id, status: 'SKIPPED' });
    } catch (error) {
      overallStatus = 'FAILED';
      await prisma.inboundWebhookActionRun.create({
        data: {
          messageId,
          actionId: action.id,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startedAt
        }
      });
      summary.push({ actionId: action.id, status: 'FAILED' });
    }
  }

  await prisma.inboundWebhookMessage.update({
    where: { id: messageId },
    data: {
      status: overallStatus,
      actionSummary: summary
    }
  });
}

function normalizePayload(payload: unknown) {
  if (payload === undefined) {
    return {};
  }
  if (payload === null) {
    return { value: null };
  }
  if (typeof payload === 'string') {
    return { raw: payload };
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return { value: payload };
  }
  return payload as Record<string, unknown>;
}

async function updateActionSummary(
  messageId: string,
  actionId: string,
  status: 'SUCCESS' | 'FAILED' | 'PENDING_REVIEW' | 'SKIPPED'
) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    select: { actionSummary: true }
  });

  const summary = Array.isArray(message?.actionSummary)
    ? ([...message.actionSummary] as Array<{ actionId: string; status: string }>)
    : [];
  const index = summary.findIndex((item) => item?.actionId === actionId);
  if (index >= 0) {
    summary[index] = { actionId, status };
  } else {
    summary.push({ actionId, status });
  }

  await prisma.inboundWebhookMessage.update({
    where: { id: messageId },
    data: { actionSummary: summary as Prisma.InputJsonValue }
  });
}

async function reviewCrashReportWithRetry(input: string, config: InboundWebhookActionConfig) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 2) {
    attempt += 1;
    try {
      const findings = await withTimeout(
        reviewCrashReport(input, {
          model: config.crashModel,
          maxInputChars: config.crashMaxInputChars,
          maxOutputTokens: config.crashMaxOutputTokens,
          temperature: config.crashTemperature,
          promptTemplate: config.crashPromptTemplate
        }, attempt),
        GEMINI_TIMEOUT_MS
      );
      if (findings.telemetry?.parseError && attempt < 2) {
        lastError = new Error(findings.telemetry.parseError);
        await delay(1000 * attempt);
        continue;
      }
      return { findings, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= 2) {
        throw error;
      }
      await delay(1000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown crash review error.');
}

function buildCrashReviewInput(
  payload: unknown,
  rawBody: string | null | undefined,
  fallbackPayload: unknown
) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (typeof record.crashReportText === 'string') {
      return record.crashReportText;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.content === 'string') {
      return record.content;
    }
    if (record.crashReport && typeof record.crashReport === 'object') {
      return JSON.stringify(record.crashReport, null, 2);
    }
  }

  if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
    return rawBody;
  }

  if (typeof fallbackPayload === 'string') {
    return fallbackPayload;
  }

  try {
    return JSON.stringify(payload ?? fallbackPayload ?? {}, null, 2);
  } catch {
    return String(payload ?? fallbackPayload ?? '');
  }
}

/**
 * Determines if text content looks like a crash report or script error.
 * Returns true if it appears to be a crash/error report that should be reviewed by AI.
 * Returns false for other types of messages (which should pass through unchanged).
 */
function looksLikeCrashReport(text: string): boolean {
  // Strip markdown formatting (**, __, etc.) for more reliable detection
  const stripped = text.replace(/\*\*/g, '').replace(/__/g, '');
  const lower = stripped.toLowerCase();
  const trimmed = stripped.trim();

  // Check for explicit crash markers
  if (trimmed.startsWith('[Crash]') || lower.startsWith('[crash]')) {
    return true;
  }

  // Check for quest/script error markers
  if (lower.includes('[questerrors]') || lower.includes('[script error]')) {
    return true;
  }

  // Check for common crash report indicators
  if (lower.includes('symint:') || lower.includes('syminit:')) {
    return true;
  }
  if (lower.includes('os-version:')) {
    return true;
  }
  if (lower.includes('exception_access_violation') || lower.includes('0xc000')) {
    return true;
  }

  // Check for module loading patterns (common in crash dumps)
  const modulePattern = /\.(exe|dll):/i;
  const lines = text.split(/\r?\n/).slice(0, 20); // Check first 20 lines
  let moduleLineCount = 0;
  for (const line of lines) {
    if (modulePattern.test(line)) {
      moduleLineCount++;
      if (moduleLineCount >= 3) {
        // Multiple module lines suggest a crash dump
        return true;
      }
    }
  }

  return false;
}

function extractCrashReportSections(text: string) {
  const lines = text.split(/\r?\n/);
  let exceptionLine = '';
  let symInitLine = '';
  let osVersionLine = '';
  let questErrorLine = '';
  const moduleLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!exceptionLine && trimmed.length > 0) {
      exceptionLine = trimmed;
    }
    if (!questErrorLine && trimmed.includes('[QuestErrors]')) {
      questErrorLine = trimmed;
    }
    if (!symInitLine && trimmed.startsWith('SymInit:')) {
      symInitLine = trimmed;
    }
    if (!osVersionLine && trimmed.startsWith('OS-Version:')) {
      osVersionLine = trimmed;
    }

    const lower = trimmed.toLowerCase();
    if ((lower.includes('.exe:') || lower.includes('.dll:')) && moduleLines.length < MODULES_MAX_LINES) {
      moduleLines.push(trimmed);
      if (moduleLines.join('\n').length >= MODULES_MAX_CHARS) {
        break;
      }
    }
  }

  const rawHead = text.slice(0, RAW_HEAD_CHARS);
  const rawTail = text.length > RAW_TAIL_CHARS ? text.slice(-RAW_TAIL_CHARS) : '';
  const modulesSnippet = moduleLines.join('\n').slice(0, MODULES_MAX_CHARS);
  const sections = [
    questErrorLine ? `Quest Error: ${questErrorLine}` : '',
    exceptionLine ? `Exception: ${exceptionLine}` : '',
    symInitLine ? `SymInit: ${symInitLine}` : '',
    osVersionLine ? `OS-Version: ${osVersionLine}` : '',
    modulesSnippet ? `Modules:\n${modulesSnippet}` : '',
    rawHead ? `Raw Head:\n${rawHead}` : '',
    rawTail ? `Raw Tail:\n${rawTail}` : ''
  ].filter(Boolean);

  const combined = sections.join('\n\n').slice(0, EXTRACT_MAX_CHARS);
  return { exceptionLine, symInitLine, osVersionLine, modulesSnippet, rawHead, rawTail, combined };
}

function buildCrashReportExtract(extracted: {
  exceptionLine: string;
  symInitLine: string;
  osVersionLine: string;
  modulesSnippet: string;
  rawHead: string;
  rawTail: string;
}) {
  const hash = createHash('sha256')
    .update(`${extracted.rawHead}${extracted.rawTail}`)
    .digest('hex');
  return {
    exception: extracted.exceptionLine || null,
    symInit: extracted.symInitLine || null,
    osVersion: extracted.osVersionLine || null,
    modulesSnippet: extracted.modulesSnippet || null,
    rawHead: extracted.rawHead || null,
    rawTail: extracted.rawTail || null,
    hash
  };
}

function enrichPayloadWithCrashReview(
  payload: unknown,
  findings: unknown,
  attempts: number,
  errorType?: 'crash' | 'script_error'
) {
  // Enrich findings with error type if provided
  const enrichedFindings = findings && typeof findings === 'object' && !Array.isArray(findings)
    ? { ...(findings as Record<string, unknown>), errorType }
    : findings;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      crashReview: enrichedFindings,
      crashReviewAttempts: attempts
    };
  }

  return {
    crashReview: enrichedFindings,
    crashReviewAttempts: attempts,
    originalPayload: payload
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('Gemini request timed out.'));
      });
    })
  ]);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActionConfig(config: unknown): InboundWebhookActionConfig {
  if (!config || Array.isArray(config) || typeof config !== 'object') {
    return { discordMode: 'WRAP' };
  }
  const raw = config as Record<string, unknown>;
  return {
    discordWebhookUrl: typeof raw.discordWebhookUrl === 'string' ? raw.discordWebhookUrl : undefined,
    devDiscordWebhookUrl: typeof raw.devDiscordWebhookUrl === 'string' ? raw.devDiscordWebhookUrl : undefined,
    discordMode: raw.discordMode === 'RAW' ? 'RAW' : 'WRAP',
    discordTemplate: typeof raw.discordTemplate === 'string' ? raw.discordTemplate : undefined,
    crashModel: typeof raw.crashModel === 'string' ? raw.crashModel : undefined,
    crashMaxInputChars: typeof raw.crashMaxInputChars === 'number' ? raw.crashMaxInputChars : undefined,
    crashMaxOutputTokens:
      typeof raw.crashMaxOutputTokens === 'number' ? raw.crashMaxOutputTokens : undefined,
    crashTemperature: typeof raw.crashTemperature === 'number' ? raw.crashTemperature : undefined,
    crashPromptTemplate: typeof raw.crashPromptTemplate === 'string' ? raw.crashPromptTemplate : undefined,
    // ClawdBot relay fields
    clawdbotWebhookUrl: typeof raw.clawdbotWebhookUrl === 'string' ? raw.clawdbotWebhookUrl : undefined,
    devClawdbotWebhookUrl: typeof raw.devClawdbotWebhookUrl === 'string' ? raw.devClawdbotWebhookUrl : undefined,
    clawdbotMode: raw.clawdbotMode === 'RAW' ? 'RAW' : 'WRAP',
    clawdbotTemplate: typeof raw.clawdbotTemplate === 'string' ? raw.clawdbotTemplate : undefined,
  };
}

/**
 * Get the appropriate Discord webhook URL based on devMode setting.
 * When devMode is enabled and a dev URL is configured, use the dev URL.
 * Otherwise, fall back to the normal Discord webhook URL.
 */
function getDiscordUrl(config: InboundWebhookActionConfig, devMode: boolean): string | undefined {
  if (devMode && config.devDiscordWebhookUrl) {
    return config.devDiscordWebhookUrl;
  }
  return config.discordWebhookUrl;
}

/**
 * Get the appropriate ClawdBot webhook URL based on devMode setting.
 */
function getClawdbotUrl(config: InboundWebhookActionConfig, devMode: boolean): string | undefined {
  if (devMode && config.devClawdbotWebhookUrl) {
    return config.devClawdbotWebhookUrl;
  }
  return config.clawdbotWebhookUrl;
}

/**
 * Send payload to a ClawdBot webhook endpoint.
 * Similar to Discord relay but targets ClawdBot's webhook ingress.
 */
async function sendClawdbotRelay(
  url: string,
  payload: unknown,
  config: InboundWebhookActionConfig,
  rawBody?: string | null
) {
  const body = buildClawdbotPayload(payload, config, rawBody);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClawdBot responded with ${response.status}: ${errorText}`);
  }
}

function buildClawdbotPayload(payload: unknown, config: InboundWebhookActionConfig, rawBody?: string | null) {
  if (config.clawdbotMode === 'RAW') {
    return payload;
  }

  // WRAP mode: format payload with optional template
  const raw = safeJson(payload);
  if (!raw) {
    return { title: 'Webhook Relay', description: 'Webhook relay received an empty payload.' };
  }
  const trimmed = raw.length > 4000 ? `${raw.slice(0, 4000)}...` : raw;

  // Extract actual message text (e.g., crash report text)
  // Prioritize rawBody which contains the full sorted/merged crash text
  const messageText = (rawBody && typeof rawBody === 'string' && rawBody.trim())
    ? rawBody
    : (extractActualMessageContent(payload, null) || '');

  if (config.clawdbotTemplate) {
    // Try to parse template as JSON for structured payloads
    try {
      // Parse template as JSON first
      const template = JSON.parse(config.clawdbotTemplate);

      // Recursively replace placeholders in the template
      const result = JSON.parse(JSON.stringify(template, (key, value) => {
        if (typeof value === 'string') {
          return value
            .replace(/\{\{text\}\}/g, messageText)
            .replace(/\{\{json\}\}/g, trimmed)
            .replace(/\{\{raw\}\}/g, raw);
        }
        return value;
      }));

      return result;
    } catch (err) {
      // If template is not valid JSON, treat it as plain text template
      const templateStr = config.clawdbotTemplate
        .replace(/\{\{text\}\}/g, messageText)
        .replace(/\{\{json\}\}/g, trimmed)
        .replace(/\{\{raw\}\}/g, raw);

      return { title: 'Webhook Relay', description: templateStr };
    }
  }

  return { title: 'Webhook Relay', description: messageText || `Webhook payload:\n\n${trimmed}` };
}

async function sendDiscordRelay(
  url: string,
  payload: unknown,
  config: InboundWebhookActionConfig,
  messageId?: string
) {
  const body = buildDiscordPayload(payload, config, messageId);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord responded with ${response.status}: ${errorText}`);
  }
}

function buildDiscordPayload(payload: unknown, config: InboundWebhookActionConfig, messageId?: string) {
  if (config.discordMode !== 'RAW' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (record.crashReview && typeof record.crashReview === 'object') {
      return buildCrashReviewEmbed(record.crashReview, config.discordTemplate, messageId);
    }
  }

  if (config.discordMode === 'RAW') {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : { content: formatDiscordContent(payload, config.discordTemplate) };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { content: formatDiscordContent(payload, config.discordTemplate) };
  }

  const record = payload as Record<string, unknown>;
  const hasContent = typeof record.content === 'string' && record.content.trim().length > 0;
  const hasEmbeds = Array.isArray(record.embeds) && record.embeds.length > 0;
  const hasFiles = Array.isArray(record.files) && record.files.length > 0;
  const hasAttachments = Array.isArray(record.attachments) && record.attachments.length > 0;

  if (hasContent || hasEmbeds || hasFiles || hasAttachments) {
    return record;
  }

  return { content: formatDiscordContent(record, config.discordTemplate) };
}

function formatDiscordContent(payload: unknown, template?: string) {
  const raw = safeJson(payload);
  if (!raw) {
    return 'Webhook relay received an empty payload.';
  }
  const trimmed = raw.length > 1800 ? `${raw.slice(0, 1800)}...` : raw;
  const defaultContent = `Webhook payload:\n\n\`\`\`json\n${trimmed}\n\`\`\``;
  if (!template) {
    return defaultContent;
  }
  return template
    .replace(/\{\{json\}\}/g, trimmed)
    .replace(/\{\{raw\}\}/g, raw);
}

// Discord embed color palette (matches discordWebhookService.ts)
const DISCORD_EMBED_COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  info: 0x00b0f4
};

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordEmbedPayload {
  embeds: DiscordEmbed[];
}

function buildCrashReviewEmbed(findings: unknown, _template?: string, messageId?: string): DiscordEmbedPayload {
  const record = (findings ?? {}) as Record<string, unknown>;
  const summary = typeof record.summary === 'string' ? record.summary : 'Crash analysis completed.';
  const hypotheses = Array.isArray(record.hypotheses) ? record.hypotheses : [];
  const recommendedNextSteps = Array.isArray(record.recommendedNextSteps) ? record.recommendedNextSteps : [];
  const signature = record.signature as { exception?: string | null; topFrame?: string | null } | undefined;
  const telemetry = record.telemetry as { model?: string; attempts?: number } | undefined;

  // Use errorType from findings if available (set by enrichPayloadWithCrashReview),
  // otherwise fall back to detection (for backwards compatibility)
  const errorType = record.errorType as 'crash' | 'script_error' | undefined;
  const isQuestError = errorType
    ? errorType === 'script_error'
    : detectQuestError(signature, summary);

  // Build link to webhook inbox for this message
  const messageUrl = messageId && clientBaseUrl
    ? `${clientBaseUrl}/admin/webhooks?messageId=${encodeURIComponent(messageId)}`
    : null;

  // Always use polished embed format for crash reviews (template parameter is now ignored)
  // Build polished embed
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  // Exception signature (if available)
  if (signature?.exception || signature?.topFrame) {
    const exceptionParts: string[] = [];
    if (signature.exception) {
      exceptionParts.push(`**Type:** \`${truncateText(signature.exception, 100)}\``);
    }
    if (signature.topFrame) {
      exceptionParts.push(`**Location:** \`${truncateText(signature.topFrame, 100)}\``);
    }
    fields.push({
      name: '🔴 Exception',
      value: exceptionParts.join('\n'),
      inline: false
    });
  }

  // Top hypotheses with confidence bars
  if (hypotheses.length > 0) {
    const hypothesesText = hypotheses
      .slice(0, 3)
      .map((h, idx) => {
        const title = typeof h?.title === 'string' ? h.title : 'Unknown';
        const confidence = typeof h?.confidence === 'number' ? h.confidence : 0;
        const confidencePercent = Math.round(confidence * 100);
        const confidenceBar = getConfidenceBar(confidence);
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        return `${medal} **${truncateText(title, 80)}**\n${confidenceBar} ${confidencePercent}%`;
      })
      .join('\n\n');

    fields.push({
      name: '🔍 Root Cause Analysis',
      value: hypothesesText || 'No hypotheses generated.',
      inline: false
    });

    // Add evidence for top hypothesis if available
    const topHypothesis = hypotheses[0];
    if (topHypothesis && Array.isArray(topHypothesis.evidence) && topHypothesis.evidence.length > 0) {
      const evidenceText = topHypothesis.evidence
        .slice(0, 3)
        .map((e: unknown) => `• ${truncateText(String(e), 120)}`)
        .join('\n');
      fields.push({
        name: '📋 Supporting Evidence',
        value: evidenceText,
        inline: false
      });
    }
  }

  // Recommended next steps
  if (recommendedNextSteps.length > 0) {
    const stepsText = recommendedNextSteps
      .slice(0, 4)
      .map((step, idx) => `${idx + 1}. ${truncateText(String(step), 100)}`)
      .join('\n');
    fields.push({
      name: '🛠️ Recommended Actions',
      value: stepsText,
      inline: false
    });
  }

  // Determine embed color based on top hypothesis confidence
  const topConfidence = hypotheses[0]?.confidence;
  let embedColor = DISCORD_EMBED_COLORS.info;
  if (typeof topConfidence === 'number') {
    if (topConfidence >= 0.8) {
      embedColor = DISCORD_EMBED_COLORS.success; // High confidence - likely found the issue
    } else if (topConfidence >= 0.5) {
      embedColor = DISCORD_EMBED_COLORS.warning; // Medium confidence
    } else {
      embedColor = DISCORD_EMBED_COLORS.danger; // Low confidence - needs more investigation
    }
  }

  // Add link to view full report
  if (messageUrl) {
    fields.push({
      name: '🔗 Full Report',
      value: `[View in Webhook Inbox](${messageUrl})`,
      inline: false
    });
  }

  // Build footer with telemetry info
  const footerParts: string[] = [];
  if (telemetry?.model) {
    footerParts.push(`Model: ${telemetry.model}`);
  }
  if (telemetry?.attempts && telemetry.attempts > 1) {
    footerParts.push(`Attempts: ${telemetry.attempts}`);
  }
  if (footerParts.length === 0) {
    footerParts.push(isQuestError ? 'AI-powered script analysis' : 'AI-powered crash analysis');
  }

  // Choose title based on error type
  const embedTitle = isQuestError ? '📜 Script Error Analysis' : '💥 Crash Report Analysis';

  return {
    embeds: [
      {
        title: embedTitle,
        description: summary,
        color: embedColor,
        fields,
        footer: { text: footerParts.join(' • ') },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function detectQuestError(
  signature: { exception?: string | null; topFrame?: string | null } | undefined,
  summary: string,
  rawText?: string
): boolean {
  const exception = signature?.exception?.toLowerCase() ?? '';
  const summaryLower = summary.toLowerCase();
  const rawLower = rawText?.toLowerCase() ?? '';

  // MOST RELIABLE: Check raw text for explicit markers first
  // Check for QuestErrors marker (with or without markdown formatting)
  // This takes priority over everything else
  if (
    rawLower.includes('[questerrors]') ||
    rawLower.includes('[**questerrors**]') ||
    rawLower.includes('questerrors]') ||
    rawLower.includes('**questerrors**')
  ) {
    return true;
  }
  if (
    rawLower.includes('[script error]') ||
    rawLower.includes('[**script error**]') ||
    rawLower.includes('script error |')
  ) {
    return true;
  }

  // Check for explicit crash indicators in raw text - these definitively indicate a crash, NOT a script error
  // Crash report title/header markers
  if (rawLower.includes('crash report |') || rawLower.includes('**crash report**')) {
    return false;
  }
  // Crash log file names (e.g., crash_mischiefplane_version_0_inst_id_0_port_7001_6832.log)
  if (/crash_\w+.*\.log/i.test(rawText ?? '')) {
    return false;
  }
  // If raw text starts with [Crash] markers (e.g., "[Crash] Zone [zonename]"), it's NOT a script error
  const rawStripped = rawText?.replace(/\*\*/g, '').replace(/__/g, '').toLowerCase() ?? '';
  if (rawStripped.startsWith('[crash]') || /^\[crash\]\s+zone\s+\[/.test(rawStripped)) {
    return false;
  }

  // Check if the raw text looks like a crash dump (multiple DLL/EXE module lines)
  // This is characteristic of native crashes, not script errors
  if (rawText) {
    const modulePattern = /\.(exe|dll):\w+.*\(0x[0-9a-f]+\)/gi;
    const moduleMatches = rawText.match(modulePattern);
    if (moduleMatches && moduleMatches.length >= 3) {
      // Multiple module load lines indicate a native crash dump
      return false;
    }
  }

  // Check if summary explicitly starts with the type prefix
  if (summaryLower.startsWith('native crash:')) {
    return false;
  }
  if (summaryLower.startsWith('script error:')) {
    return true;
  }

  // Check for native crash indicators - these take precedence
  const hasNativeCrashIndicators =
    exception.includes('exception_access_violation') ||
    exception.includes('exception_stack_overflow') ||
    exception.includes('exception_') ||
    exception.includes('0xc000') ||
    exception.includes('syminit') ||
    summaryLower.includes('native crash') ||
    summaryLower.includes('access violation') ||
    summaryLower.includes('memory access') ||
    summaryLower.includes('null pointer') ||
    summaryLower.includes('segmentation fault');

  if (hasNativeCrashIndicators) {
    return false;
  }

  // Check for script error indicators
  // NOTE: Be careful not to match Perl DLL paths (C:\Strawberry\perl\...) as script errors
  // Only match if there's explicit script error context, not just perl in a path
  const hasScriptErrorIndicators =
    exception.includes('[questerrors]') ||
    exception.includes('script error') ||
    summaryLower.includes('quest script') ||
    // Match "perl script" only if it's about a script, not a perl DLL path
    (summaryLower.includes('perl script') && !rawLower.includes('strawberry\\perl\\')) ||
    summaryLower.includes('lua script') ||
    summaryLower.includes('script error') ||
    summaryLower.includes('[questerrors]');

  return hasScriptErrorIndicators;
}

function getConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function safeJson(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '';
  }
}

// ============================================================================
// Read Status Operations
// ============================================================================

export async function markMessageRead(messageId: string, userId: string, read: boolean) {
  if (read) {
    // Upsert read status
    await prisma.webhookMessageReadStatus.upsert({
      where: {
        messageId_userId: { messageId, userId }
      },
      create: {
        id: generateCuid(),
        messageId,
        userId,
        readAt: new Date()
      },
      update: {
        readAt: new Date()
      }
    });
  } else {
    // Delete read status to mark as unread
    await prisma.webhookMessageReadStatus.deleteMany({
      where: { messageId, userId }
    });
  }
}

export async function getUnreadCount(userId: string, webhookId?: string) {
  const whereMessage: Record<string, unknown> = {
    archivedAt: null
  };
  if (webhookId) {
    whereMessage.webhookId = webhookId;
  }

  // Count messages that don't have a read status for this user
  const totalMessages = await prisma.inboundWebhookMessage.count({
    where: whereMessage
  });

  const readMessages = await prisma.webhookMessageReadStatus.count({
    where: {
      userId,
      message: whereMessage
    }
  });

  return totalMessages - readMessages;
}

// ============================================================================
// Star Operations
// ============================================================================

export async function toggleMessageStar(messageId: string, userId: string, starred: boolean) {
  if (starred) {
    // Upsert star
    await prisma.webhookMessageStar.upsert({
      where: {
        messageId_userId: { messageId, userId }
      },
      create: {
        id: generateCuid(),
        messageId,
        userId
      },
      update: {}
    });
  } else {
    // Delete star
    await prisma.webhookMessageStar.deleteMany({
      where: { messageId, userId }
    });
  }
}

// ============================================================================
// Label Operations
// ============================================================================

export async function listWebhookLabels() {
  return prisma.webhookMessageLabel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  });
}

export async function createWebhookLabel(input: { name: string; color: string }) {
  return prisma.webhookMessageLabel.create({
    data: {
      id: generateCuid(),
      name: input.name.trim(),
      color: input.color
    }
  });
}

// Standard label colors
const STANDARD_LABEL_COLORS: Record<string, string> = {
  'crash': '#dc2626',        // Red
  'script error': '#ea580c', // Orange
  'test': '#8b5cf6',         // Purple
  'live': '#059669'          // Green
};

// Generate a consistent color based on label name (same name = same color)
function generateColorFromName(name: string): string {
  // Simple hash function for consistent color
  let hash = 0;
  const normalizedName = name.toLowerCase().trim();
  for (let i = 0; i < normalizedName.length; i++) {
    const char = normalizedName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Generate HSL color with good saturation and lightness for visibility
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 16) % 15);  // 45-60%

  // Convert HSL to hex
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export async function findOrCreateWebhookLabel(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Label name is required');
  }

  // Try to find existing label (case-insensitive search via fetching all and filtering)
  const allLabels = await prisma.webhookMessageLabel.findMany();
  const existingLabel = allLabels.find(
    (l) => l.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (existingLabel) {
    return existingLabel;
  }

  // Determine color: use standard color if matching, otherwise generate consistent color
  const lowerName = trimmedName.toLowerCase();
  const color = STANDARD_LABEL_COLORS[lowerName] ?? generateColorFromName(trimmedName);

  // Create new label
  return prisma.webhookMessageLabel.create({
    data: {
      id: generateCuid(),
      name: trimmedName,
      color
    }
  });
}

export async function updateWebhookLabel(
  labelId: string,
  input: { name?: string; color?: string; sortOrder?: number }
) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.color !== undefined) data.color = input.color;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return prisma.webhookMessageLabel.update({
    where: { id: labelId },
    data
  });
}

export async function deleteWebhookLabel(labelId: string) {
  await prisma.webhookMessageLabel.delete({
    where: { id: labelId }
  });
}

export async function setMessageLabels(messageId: string, labelIds: string[]) {
  // Delete existing assignments
  await prisma.webhookMessageLabelAssignment.deleteMany({
    where: { messageId }
  });

  // Create new assignments
  if (labelIds.length > 0) {
    await prisma.webhookMessageLabelAssignment.createMany({
      data: labelIds.map((labelId) => ({
        id: generateCuid(),
        messageId,
        labelId
      }))
    });
  }
}

// Default label definitions
const DEFAULT_LABELS = {
  CRASH: { name: 'Crash', color: '#dc2626' },           // Red
  SCRIPT_ERROR: { name: 'Script Error', color: '#ea580c' }, // Orange
  TEST: { name: 'Test', color: '#8b5cf6' },             // Purple
  LIVE: { name: 'Live', color: '#059669' }              // Green
} as const;

// Get or create a default label
async function getOrCreateDefaultLabel(type: keyof typeof DEFAULT_LABELS): Promise<string> {
  const labelDef = DEFAULT_LABELS[type];

  // Try to find existing label by name
  let label = await prisma.webhookMessageLabel.findFirst({
    where: { name: labelDef.name }
  });

  // Create if it doesn't exist
  if (!label) {
    label = await prisma.webhookMessageLabel.create({
      data: {
        id: generateCuid(),
        name: labelDef.name,
        color: labelDef.color,
        sortOrder: type === 'CRASH' ? 1 : 2
      }
    });
  }

  return label.id;
}

// Apply labels immediately when a message is received (pattern-based, no AI)
// This ensures merge group detection works right away
async function applyImmediateLabels(
  messageId: string,
  rawText: string,
  webhookLabel?: string
): Promise<void> {
  try {
    const labelsToAdd: string[] = [];
    const labelNames: string[] = [];

    // Detect if this is a quest/script error vs crash using pattern matching
    const isQuestError = detectQuestError(
      undefined, // No signature needed for pattern detection
      '',        // No summary needed
      rawText    // Raw text is sufficient for detection
    );

    // Add crash type label (Crash or Script Error)
    const crashLabelId = await getOrCreateDefaultLabel(isQuestError ? 'SCRIPT_ERROR' : 'CRASH');
    labelsToAdd.push(crashLabelId);
    labelNames.push(isQuestError ? 'Script Error' : 'Crash');

    // Check webhook label for Test/Live server indicators
    if (webhookLabel) {
      const lowerLabel = webhookLabel.toLowerCase();
      if (lowerLabel.includes('test server')) {
        const testLabelId = await getOrCreateDefaultLabel('TEST');
        labelsToAdd.push(testLabelId);
        labelNames.push('Test');
      } else if (lowerLabel.includes('live server')) {
        const liveLabelId = await getOrCreateDefaultLabel('LIVE');
        labelsToAdd.push(liveLabelId);
        labelNames.push('Live');
      }
    }

    // Add labels to the message
    for (const labelId of labelsToAdd) {
      await prisma.webhookMessageLabelAssignment.create({
        data: {
          id: generateCuid(),
          messageId,
          labelId
        }
      });
    }

    console.log(`[WEBHOOK RECEIVE] Applied immediate labels to message ${messageId}: [${labelNames.join(', ')}]`);
  } catch (error) {
    // Don't fail the whole process if immediate labeling fails
    console.error('Immediate labeling failed:', error);
  }
}

// Auto-label a message based on crash review findings
// Note: This is called after AI review and may add additional labels,
// but won't override crash type labels set by applyImmediateLabels
async function autoLabelMessage(
  messageId: string,
  findings: unknown,
  signature: { exception?: string | null } | undefined,
  webhookLabel?: string,
  rawText?: string
): Promise<void> {
  try {
    // Get existing labels for the message first
    const existingAssignments = await prisma.webhookMessageLabelAssignment.findMany({
      where: { messageId },
      include: { label: true }
    });
    const existingLabelIds = new Set(existingAssignments.map((a) => a.labelId));
    const existingLabelNames = new Set(existingAssignments.map((a) => a.label.name));

    const labelsToAdd: string[] = [];

    // Only add crash type label if neither Crash nor Script Error label exists
    // (immediate labeling should have already set one based on pattern detection)
    const hasCrashTypeLabel = existingLabelNames.has('Crash') || existingLabelNames.has('Script Error');
    if (!hasCrashTypeLabel) {
      // Detect if this is a quest/script error vs crash
      const isQuestError = detectQuestError(
        signature as { exception?: string | null; topFrame?: string | null },
        typeof (findings as Record<string, unknown>)?.summary === 'string'
          ? (findings as Record<string, unknown>).summary as string
          : '',
        rawText
      );

      // Add crash type label (Crash or Script Error)
      const crashLabelId = await getOrCreateDefaultLabel(isQuestError ? 'SCRIPT_ERROR' : 'CRASH');
      labelsToAdd.push(crashLabelId);
    }

    // Check webhook label for Test/Live server indicators
    if (webhookLabel) {
      const lowerLabel = webhookLabel.toLowerCase();
      if (lowerLabel.includes('test server') && !existingLabelNames.has('Test')) {
        const testLabelId = await getOrCreateDefaultLabel('TEST');
        labelsToAdd.push(testLabelId);
      } else if (lowerLabel.includes('live server') && !existingLabelNames.has('Live')) {
        const liveLabelId = await getOrCreateDefaultLabel('LIVE');
        labelsToAdd.push(liveLabelId);
      }
    }

    // Add labels that aren't already present
    for (const labelId of labelsToAdd) {
      if (!existingLabelIds.has(labelId)) {
        await prisma.webhookMessageLabelAssignment.create({
          data: {
            id: generateCuid(),
            messageId,
            labelId
          }
        });
      }
    }
  } catch (error) {
    // Don't fail the whole process if auto-labeling fails
    console.error('Auto-labeling failed:', error);
  }
}

// ============================================================================
// Message Merging
// ============================================================================

export async function mergeWebhookMessages(messageIds: string[], combinedText: string) {
  if (messageIds.length < 2) {
    throw new Error('At least 2 messages are required to merge');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch all messages with their labels
    const messages = await tx.inboundWebhookMessage.findMany({
      where: { id: { in: messageIds } },
      include: {
        labelAssignments: {
          include: { label: true }
        }
      }
    });

    if (messages.length !== messageIds.length) {
      throw new Error('Some messages were not found');
    }

    // 2. Validate same webhook
    const webhookIds = new Set(messages.map((m) => m.webhookId));
    if (webhookIds.size !== 1) {
      throw new Error('All messages must belong to the same webhook');
    }

    // 3. Collect unique label IDs from all messages
    const labelIds = new Set<string>();
    for (const msg of messages) {
      for (const la of msg.labelAssignments) {
        labelIds.add(la.labelId);
      }
    }

    // 4. Create merged message using the client-provided combined text
    // No actions are triggered - user must manually start AI review
    const mergedId = generateCuid();
    const merged = await tx.inboundWebhookMessage.create({
      data: {
        id: mergedId,
        webhookId: messages[0].webhookId,
        receivedAt: new Date(),
        payload: { merged: true, partCount: messageIds.length, crashReportText: combinedText },
        rawBody: combinedText,
        status: 'RECEIVED',
        mergedFromIds: messageIds,
        mergedAt: new Date(),
        headers: {}
      }
    });

    // 5. Copy labels to merged message
    if (labelIds.size > 0) {
      await tx.webhookMessageLabelAssignment.createMany({
        data: Array.from(labelIds).map((labelId) => ({
          id: generateCuid(),
          messageId: mergedId,
          labelId
        }))
      });
    }

    // 6. Delete originals (this will cascade delete their label assignments)
    await tx.inboundWebhookMessage.deleteMany({
      where: { id: { in: messageIds } }
    });

    // 7. Fetch the complete merged message with all relations
    const result = await tx.inboundWebhookMessage.findUniqueOrThrow({
      where: { id: mergedId },
      include: {
        webhook: {
          include: { actions: true }
        },
        assignedAdmin: {
          select: { id: true, displayName: true, nickname: true, email: true }
        },
        actionRuns: {
          include: { action: true },
          orderBy: { createdAt: 'asc' }
        },
        labelAssignments: {
          include: { label: true }
        }
      }
    });

    // Transform to match expected response format
    return {
      ...result,
      labels: result.labelAssignments.map((la) => la.label),
      labelAssignments: undefined
    };
  });
}

// ============================================================================
// Bulk Actions
// ============================================================================

export type BulkActionType =
  | 'markRead'
  | 'markUnread'
  | 'archive'
  | 'unarchive'
  | 'delete'
  | 'star'
  | 'unstar'
  | 'rerunCrashReview'
  | 'setLabels';

export async function bulkMessageAction(
  messageIds: string[],
  action: BulkActionType,
  userId: string,
  options?: { labelIds?: string[] }
) {
  let success = 0;
  let failed = 0;

  for (const messageId of messageIds) {
    try {
      switch (action) {
        case 'markRead':
          await markMessageRead(messageId, userId, true);
          break;
        case 'markUnread':
          await markMessageRead(messageId, userId, false);
          break;
        case 'archive':
          await prisma.inboundWebhookMessage.update({
            where: { id: messageId },
            data: { archivedAt: new Date() }
          });
          break;
        case 'unarchive':
          await prisma.inboundWebhookMessage.update({
            where: { id: messageId },
            data: { archivedAt: null }
          });
          break;
        case 'delete':
          await prisma.inboundWebhookMessage.delete({
            where: { id: messageId }
          });
          break;
        case 'star':
          await toggleMessageStar(messageId, userId, true);
          break;
        case 'unstar':
          await toggleMessageStar(messageId, userId, false);
          break;
        case 'rerunCrashReview':
          await retryCrashReviewForMessage(messageId);
          break;
        case 'setLabels':
          if (options?.labelIds) {
            await setMessageLabels(messageId, options.labelIds);
          }
          break;
      }
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

// ============================================================================
// Enhanced Message List with Read/Star/Label Status
// ============================================================================

export async function listInboundWebhookMessagesEnhanced(options: {
  page: number;
  pageSize: number;
  userId: string;
  webhookId?: string;
  status?: InboundWebhookMessageStatus;
  includeArchived?: boolean;
  readStatus?: 'read' | 'unread' | 'all';
  starred?: boolean;
  labelIds?: string[];
}) {
  const {
    page,
    pageSize,
    userId,
    webhookId,
    status,
    includeArchived,
    readStatus,
    starred,
    labelIds
  } = options;

  // Build base where clause
  const where: Record<string, unknown> = {};
  if (webhookId) {
    where.webhookId = webhookId;
  }
  if (status) {
    where.status = status;
  }
  // If includeArchived is false, only show non-archived; if true, show all
  if (!includeArchived) {
    where.archivedAt = null;
  }

  // Label filter
  if (labelIds && labelIds.length > 0) {
    where.labelAssignments = {
      some: { labelId: { in: labelIds } }
    };
  }

  // Starred filter
  if (starred === true) {
    where.stars = {
      some: { userId }
    };
  }

  // Read status filter requires a subquery approach
  let messageIdsToInclude: string[] | undefined;
  let messageIdsToExclude: string[] | undefined;

  if (readStatus === 'read') {
    // Get message IDs that have been read by this user
    const readStatuses = await prisma.webhookMessageReadStatus.findMany({
      where: { userId },
      select: { messageId: true }
    });
    messageIdsToInclude = readStatuses.map((r) => r.messageId);
    if (messageIdsToInclude.length === 0) {
      // No read messages, return empty
      return { messages: [], total: 0 };
    }
    where.id = { in: messageIdsToInclude };
  } else if (readStatus === 'unread') {
    // Get message IDs that have been read by this user (to exclude)
    const readStatuses = await prisma.webhookMessageReadStatus.findMany({
      where: { userId },
      select: { messageId: true }
    });
    messageIdsToExclude = readStatuses.map((r) => r.messageId);
    if (messageIdsToExclude.length > 0) {
      where.id = { notIn: messageIdsToExclude };
    }
  }

  const [messages, total] = await Promise.all([
    prisma.inboundWebhookMessage.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        webhook: {
          include: { actions: true }
        },
        assignedAdmin: {
          select: { id: true, displayName: true, nickname: true, email: true }
        },
        actionRuns: {
          include: { action: true },
          orderBy: { createdAt: 'asc' }
        },
        labelAssignments: {
          include: { label: true }
        },
        readStatuses: {
          where: { userId },
          take: 1
        },
        stars: {
          where: { userId },
          take: 1
        }
      }
    }),
    prisma.inboundWebhookMessage.count({ where })
  ]);

  // Transform to include computed fields
  const enhancedMessages = messages.map((msg) => ({
    ...msg,
    isRead: msg.readStatuses.length > 0,
    isStarred: msg.stars.length > 0,
    labels: msg.labelAssignments.map((la) => la.label),
    // Clean up internal fields
    readStatuses: undefined,
    stars: undefined,
    labelAssignments: undefined
  }));

  return { messages: enhancedMessages, total };
}

// ============================================================================
// Delayed Message Processing (Merge Window Handling)
// ============================================================================

/**
 * Add a message to a pending merge group. Creates a new group if one doesn't exist.
 * Uses a FIXED timer from the first message - subsequent messages don't reset the timer.
 */
function addMessageToPendingGroup(
  webhookId: string,
  messageId: string,
  groupKey: string,
  mergeWindowSeconds: number
) {
  const now = new Date();
  let targetGroupKey = groupKey;
  let compositeKey = `${webhookId}:${groupKey}`;

  // If this message has no identifier ('default'), try to find an existing group for this webhook
  // This handles the case where only some chunks contain the crash filename
  if (groupKey === 'default') {
    const existingWebhookGroup = findExistingGroupForWebhook(webhookId);
    if (existingWebhookGroup) {
      targetGroupKey = existingWebhookGroup.groupKey;
      compositeKey = `${webhookId}:${targetGroupKey}`;
      console.log(`[Webhook ${webhookId}] Message ${messageId} has no identifier, joining existing group "${targetGroupKey}"`);
    }
  } else {
    // This message HAS an identifier - check if there's a 'default' group we should merge into this one
    const defaultGroup = pendingMergeGroups.get(`${webhookId}:default`);
    if (defaultGroup) {
      // Move all messages from 'default' group to this new identified group
      console.log(`[Webhook ${webhookId}] Found identifier "${groupKey}" - absorbing ${defaultGroup.messageIds.length} messages from 'default' group`);

      // Clear the default group's timer
      if (defaultGroup.timer) {
        clearTimeout(defaultGroup.timer);
      }
      pendingMergeGroups.delete(`${webhookId}:default`);

      // Check if a group with this key already exists
      const existingGroup = pendingMergeGroups.get(compositeKey);
      if (existingGroup) {
        // Add default group's messages to existing group
        existingGroup.messageIds.push(...defaultGroup.messageIds);
        existingGroup.messageIds.push(messageId);
        console.log(`[Webhook ${webhookId}] Merged into existing group "${groupKey}" (${existingGroup.messageIds.length} messages)`);
        return;
      } else {
        // Create new group with default group's messages + this message
        const expiresAt = defaultGroup.expiresAt; // Keep original expiry time
        const remainingMs = expiresAt.getTime() - now.getTime();

        const timer = setTimeout(() => {
          console.log(`[Webhook ${webhookId}] Group "${groupKey}" timer FIRED at ${new Date().toISOString()}`);
          void processGroupWhenReady(compositeKey);
        }, Math.max(remainingMs, 1000)); // At least 1 second

        const group: PendingMergeGroup = {
          groupKey,
          webhookId,
          messageIds: [...defaultGroup.messageIds, messageId],
          firstMessageAt: defaultGroup.firstMessageAt,
          expiresAt,
          timer,
          status: 'pending'
        };

        pendingMergeGroups.set(compositeKey, group);
        console.log(`[Webhook ${webhookId}] Created group "${groupKey}" with ${group.messageIds.length} messages (absorbed from default)`);
        return;
      }
    }
  }

  const existingGroup = pendingMergeGroups.get(compositeKey);

  if (existingGroup) {
    // Add message to existing group - timer stays fixed from first message
    existingGroup.messageIds.push(messageId);
    console.log(`[Webhook ${webhookId}] Added message ${messageId} to existing group "${targetGroupKey}" (${existingGroup.messageIds.length} messages, expires at ${existingGroup.expiresAt.toISOString()})`);
  } else {
    // Create new group with fixed timer
    const expiresAt = new Date(now.getTime() + mergeWindowSeconds * 1000);

    const timer = setTimeout(() => {
      console.log(`[Webhook ${webhookId}] Group "${targetGroupKey}" timer FIRED at ${new Date().toISOString()}`);
      void processGroupWhenReady(compositeKey);
    }, mergeWindowSeconds * 1000);

    const group: PendingMergeGroup = {
      groupKey: targetGroupKey,
      webhookId,
      messageIds: [messageId],
      firstMessageAt: now,
      expiresAt,
      timer,
      status: 'pending'
    };

    pendingMergeGroups.set(compositeKey, group);
    console.log(`[Webhook ${webhookId}] Created NEW group "${targetGroupKey}" with message ${messageId}, expires at ${expiresAt.toISOString()} (in ${mergeWindowSeconds}s)`);
  }
}

/**
 * Find an existing pending group for a webhook (any group key).
 * Used when a message has no identifier but should probably join an existing group.
 */
function findExistingGroupForWebhook(webhookId: string): PendingMergeGroup | null {
  for (const [key, group] of pendingMergeGroups) {
    if (group.webhookId === webhookId) {
      return group;
    }
  }
  return null;
}

/**
 * Process a group when its timer fires.
 */
async function processGroupWhenReady(compositeKey: string) {
  const group = pendingMergeGroups.get(compositeKey);
  if (!group) {
    console.log(`[processGroupWhenReady] Group ${compositeKey} not found, already processed?`);
    return;
  }

  // Mark as processing (don't delete yet - keep showing in UI)
  group.status = 'processing';
  group.timer = null;
  console.log(`[processGroupWhenReady] Group ${compositeKey} now processing`);

  try {
    await processSpecificGroup(group);
  } finally {
    // Remove from pending after processing completes
    pendingMergeGroups.delete(compositeKey);
    console.log(`[processGroupWhenReady] Group ${compositeKey} processing complete, removed from pending`);
  }
}

/**
 * Manually trigger processing of a pending group (skip timer).
 */
export async function processGroupNow(webhookId: string, groupKey: string): Promise<boolean> {
  const compositeKey = `${webhookId}:${groupKey}`;
  const group = pendingMergeGroups.get(compositeKey);

  if (!group) {
    console.log(`[processGroupNow] Group ${compositeKey} not found`);
    return false;
  }

  // Clear the timer and mark as processing
  if (group.timer) {
    clearTimeout(group.timer);
  }
  group.status = 'processing';
  group.timer = null;

  console.log(`[Webhook ${webhookId}] Manually processing group "${groupKey}" with ${group.messageIds.length} messages`);

  try {
    await processSpecificGroup(group);
  } finally {
    // Remove from pending after processing completes
    pendingMergeGroups.delete(compositeKey);
    console.log(`[processGroupNow] Group ${compositeKey} processing complete, removed from pending`);
  }

  return true;
}

/**
 * Get all pending merge groups for the UI.
 */
export function getPendingMergeGroups(): Array<{
  compositeKey: string;
  groupKey: string;
  webhookId: string;
  messageCount: number;
  messageIds: string[];
  firstMessageAt: Date;
  expiresAt: Date;
  remainingSeconds: number;
  status: 'pending' | 'processing';
}> {
  const now = Date.now();
  return Array.from(pendingMergeGroups.entries()).map(([compositeKey, group]) => ({
    compositeKey,
    groupKey: group.groupKey,
    webhookId: group.webhookId,
    messageCount: group.messageIds.length,
    messageIds: group.messageIds,
    firstMessageAt: group.firstMessageAt,
    expiresAt: group.expiresAt,
    remainingSeconds: Math.max(0, Math.ceil((group.expiresAt.getTime() - now) / 1000)),
    status: group.status
  }));
}

/**
 * Legacy function for backwards compatibility - schedules using old approach.
 * @deprecated Use addMessageToPendingGroup instead
 */
function scheduleDelayedProcessing(webhookId: string, mergeWindowSeconds: number) {
  // This is kept for any code paths that haven't been migrated yet
  const existingTimer = pendingProcessingTimers.get(webhookId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    pendingProcessingTimers.delete(webhookId);
    void processWebhookMessages(webhookId);
  }, mergeWindowSeconds * 1000);

  pendingProcessingTimers.set(webhookId, timer);
}

/**
 * Check if a webhook is currently waiting for its merge window to close or actively processing.
 */
export function isWebhookProcessingPending(webhookId: string): boolean {
  // Check both old-style timers and new group-based pending
  const hasLegacyTimer = pendingProcessingTimers.has(webhookId);
  const hasPendingGroup = Array.from(pendingMergeGroups.values()).some(g => g.webhookId === webhookId);
  const isProcessing = processingWebhooks.has(webhookId) || Array.from(processingGroups).some(k => k.startsWith(`${webhookId}:`));
  return hasLegacyTimer || hasPendingGroup || isProcessing;
}

/**
 * Get all webhook IDs that are currently waiting for processing or actively processing.
 * Includes both webhooks with pending timers AND webhooks actively running AI review.
 */
export function getPendingProcessingWebhookIds(): string[] {
  const pendingIds = new Set([
    ...Array.from(pendingProcessingTimers.keys()),
    ...Array.from(pendingMergeGroups.values()).map(g => g.webhookId),
    ...Array.from(processingWebhooks),
    ...Array.from(processingGroups).map(k => k.split(':')[0])
  ]);
  return Array.from(pendingIds);
}

/**
 * Process a specific group of messages by their IDs.
 * This is called when a group's timer fires or when manually triggered.
 */
async function processSpecificGroup(group: PendingMergeGroup) {
  const { webhookId, groupKey, messageIds } = group;
  const compositeKey = `${webhookId}:${groupKey}`;

  // Prevent concurrent processing for the same group
  if (processingGroups.has(compositeKey)) {
    console.log(`[Webhook ${webhookId}] Group "${groupKey}" already processing, skipping`);
    return;
  }

  processingGroups.add(compositeKey);

  try {
    // Get webhook with its settings and actions
    const webhook = await prisma.inboundWebhook.findUnique({
      where: { id: webhookId },
      include: { actions: true }
    });

    if (!webhook) {
      console.log(`[Webhook ${webhookId}] Webhook not found, skipping group "${groupKey}"`);
      return;
    }

    // Fetch the actual messages by ID
    const messages = await prisma.inboundWebhookMessage.findMany({
      where: {
        id: { in: messageIds },
        status: 'RECEIVED',
        archivedAt: null,
        mergedAt: null
      },
      include: {
        labelAssignments: {
          include: { label: true }
        }
      },
      orderBy: { receivedAt: 'asc' }
    });

    if (messages.length === 0) {
      console.log(`[Webhook ${webhookId}] No messages found for group "${groupKey}" (already processed?)`);
      return;
    }

    console.log(`[Webhook ${webhookId}] Processing group "${groupKey}" with ${messages.length} message(s), autoMerge=${webhook.autoMerge}`);

    if (messages.length === 1) {
      // Single message - process actions normally
      const message = messages[0];
      console.log(`[Webhook ${webhookId}] Processing single message ${message.id}`);
      await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
    } else if (webhook.autoMerge) {
      // Multiple messages with auto-merge enabled - merge and process
      console.log(`[Webhook ${webhookId}] Auto-merging ${messages.length} messages for "${groupKey}"`);
      try {
        await processAutoMergeGroup(messages, webhook);
      } catch (error) {
        console.error(`[Webhook ${webhookId}] Auto-merge failed for ${messages.length} messages:`, error);
        // Mark messages as PENDING_MERGE for manual intervention
        await markMessagesAsPendingMerge(messages.map(m => m.id));
      }
    } else {
      // Multiple messages without auto-merge - mark as pending merge decision
      console.log(`[Webhook ${webhookId}] Marking ${messages.length} messages as pending merge (auto-merge disabled)`);
      await markMessagesAsPendingMerge(messages.map(m => m.id));

      // Send a notification about pending review
      const inboxUrl = clientBaseUrl ? `${clientBaseUrl}/admin/webhooks?tab=inbox` : null;
      const pendingText = `📋 **${messages.length} messages pending merge review** for ${webhook.label}${groupKey !== 'default' ? ` (${groupKey})` : ''}${inboxUrl ? `\n🔗 [View in inbox](${inboxUrl})` : ''}`;

      const discordAction = webhook.actions.find(
        (action) => action.isEnabled && action.type === 'DISCORD_RELAY'
      );
      if (discordAction) {
        const config = normalizeActionConfig(discordAction.config);
        const discordUrl = getDiscordUrl(config, webhook.devMode);
        if (discordUrl) {
          await sendDiscordRelay(discordUrl, { content: pendingText }, config, messages[0].id);
        }
      }

      const clawdbotAction = webhook.actions.find(
        (action) => action.isEnabled && action.type === 'CLAWDBOT_RELAY'
      );
      if (clawdbotAction) {
        const cbConfig = normalizeActionConfig(clawdbotAction.config);
        const cbUrl = getClawdbotUrl(cbConfig, webhook.devMode);
        if (cbUrl) {
          await sendClawdbotRelay(cbUrl, { text: pendingText }, cbConfig);
        }
      }
    }
  } finally {
    processingGroups.delete(compositeKey);
  }
}

/**
 * Process webhook messages after merge window closes.
 * Handles both single messages and merge candidates appropriately.
 * @deprecated Use processSpecificGroup instead - this is kept for legacy code paths
 */
async function processWebhookMessages(webhookId: string, isRetry = false) {
  // Prevent concurrent processing for the same webhook
  if (processingWebhooks.has(webhookId)) {
    console.log(`[Webhook ${webhookId}] Already processing, skipping`);
    return;
  }

  processingWebhooks.add(webhookId);
  const retryKey = webhookId;

  try {
    // Get webhook with its settings and actions
    const webhook = await prisma.inboundWebhook.findUnique({
      where: { id: webhookId },
      include: { actions: true }
    });

    if (!webhook) {
      console.log(`[Webhook ${webhookId}] Webhook not found, skipping`);
      return;
    }

    const mergeWindowSeconds = webhook.mergeWindowSeconds ?? 60;

    // Find all RECEIVED messages from this webhook within the merge window
    const windowStart = new Date(Date.now() - mergeWindowSeconds * 1000);

    const pendingMessages = await prisma.inboundWebhookMessage.findMany({
      where: {
        webhookId,
        status: 'RECEIVED',
        archivedAt: null,
        mergedAt: null
      },
      include: {
        labelAssignments: {
          include: { label: true }
        }
      },
      orderBy: { receivedAt: 'asc' }
    });

    if (pendingMessages.length === 0) {
      console.log(`[Webhook ${webhookId}] No pending messages to process`);
      autoMergeRetryCounts.delete(retryKey);
      return;
    }

    console.log(`[Webhook ${webhookId}] Processing ${pendingMessages.length} pending message(s), autoMerge=${webhook.autoMerge}`);

    // Group messages by crash file identifier (e.g., crash_xxx.log)
    // This ensures chunks from the same crash are merged together, while unrelated crashes stay separate
    const messageGroups = groupMessagesByCrashFile(pendingMessages);
    console.log(`[Webhook ${webhookId}] Grouped into ${messageGroups.length} crash file group(s)`);

    for (const group of messageGroups) {
      const groupKey = extractCrashFileIdentifier(group[0].payload, group[0].rawBody) || 'unknown';
      console.log(`[Webhook ${webhookId}] Processing group "${groupKey}" with ${group.length} message(s)`);

      if (group.length === 1) {
        // Single message - process actions normally
        const message = group[0];
        console.log(`[Webhook ${webhookId}] Processing single message ${message.id}`);
        await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
      } else if (webhook.autoMerge) {
        // Multiple messages with auto-merge enabled - merge and process
        console.log(`[Webhook ${webhookId}] Auto-merging ${group.length} messages for "${groupKey}"`);
        try {
          await processAutoMergeGroup(group, webhook);
        } catch (error) {
          console.error(`[Webhook ${webhookId}] Auto-merge failed for ${group.length} messages:`, error);
          // Mark messages as PENDING_MERGE for manual intervention
          await markMessagesAsPendingMerge(group.map(m => m.id));
        }
      } else {
        // Multiple messages without auto-merge - mark as pending merge decision
        console.log(`[Webhook ${webhookId}] Marking ${group.length} messages as pending merge (auto-merge disabled)`);
        await markMessagesAsPendingMerge(group.map(m => m.id));

        // Send a single Discord notification about pending review
        await sendPendingMergeNotification(webhook, group);
      }
    }

    // Clear retry count on success
    autoMergeRetryCounts.delete(retryKey);
  } catch (error) {
    console.error(`[Webhook ${webhookId}] Processing error:`, error);

    // Handle retry logic
    if (!isRetry) {
      const currentRetries = autoMergeRetryCounts.get(retryKey) ?? 0;
      if (currentRetries < AUTO_MERGE_MAX_RETRIES) {
        autoMergeRetryCounts.set(retryKey, currentRetries + 1);
        console.log(`[Webhook ${webhookId}] Scheduling retry`);
        setTimeout(() => {
          void processWebhookMessages(webhookId, true);
        }, 5000);
      } else {
        console.error(`[Webhook ${webhookId}] Max retries exceeded, leaving for manual intervention`);
        autoMergeRetryCounts.delete(retryKey);
      }
    }
  } finally {
    processingWebhooks.delete(webhookId);

    // Check if any new messages arrived while we were processing
    // If so, we need to process them too (they would have scheduled a new timer)
    const newMessages = await prisma.inboundWebhookMessage.findMany({
      where: {
        webhookId,
        status: 'RECEIVED',
        archivedAt: null,
        mergedAt: null
      },
      select: { id: true }
    });

    if (newMessages.length > 0) {
      console.log(`[Webhook ${webhookId}] Found ${newMessages.length} new message(s) that arrived during processing - will process shortly`);
      // Clear any pending timer and schedule immediate reprocessing
      const existingTimer = pendingProcessingTimers.get(webhookId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        pendingProcessingTimers.delete(webhookId);
      }
      // Schedule processing with a short delay to allow any in-flight messages to complete
      setTimeout(() => {
        void processWebhookMessages(webhookId);
      }, 2000);
    }
  }
}

/**
 * Mark messages as pending merge decision (waiting for user action).
 */
async function markMessagesAsPendingMerge(messageIds: string[]) {
  await prisma.inboundWebhookMessage.updateMany({
    where: { id: { in: messageIds } },
    data: { status: 'PENDING_MERGE' }
  });
}

/**
 * Send a Discord notification about messages pending merge review.
 */
async function sendPendingMergeNotification(
  webhook: {
    id: string;
    label: string;
    devMode: boolean;
    actions: Array<{
      id: string;
      type: InboundWebhookActionType;
      isEnabled: boolean;
      config: unknown;
    }>;
  },
  messages: Array<{
    id: string;
    payload: unknown;
    labelAssignments?: Array<{ label: { name: string } }>;
  }>
) {
  // Find the Discord action
  const discordAction = webhook.actions.find(
    (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
  );

  if (!discordAction) {
    console.log(`[Webhook ${webhook.id}] No Discord action configured, skipping notification`);
    return;
  }

  const config = normalizeActionConfig(discordAction.config);
  const discordUrl = getDiscordUrl(config, webhook.devMode);
  if (!discordUrl) {
    console.log(`[Webhook ${webhook.id}] No Discord webhook URL configured, skipping notification`);
    return;
  }

  // Determine if this is a crash or script error based on labels
  const labels = messages[0]?.labelAssignments?.map(la => la.label.name.toLowerCase()) ?? [];
  const isScriptError = labels.some(l => l.includes('script'));
  const errorType = isScriptError ? 'Script Error' : 'Crash Report';

  // Build the inbox URL
  const inboxUrl = clientBaseUrl
    ? `${clientBaseUrl}/admin/webhooks?tab=inbox`
    : null;

  // Build Discord embed
  const embed: {
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer: { text: string };
    timestamp: string;
  } = {
    title: `📋 ${errorType} - Review Required`,
    description: `**${messages.length} messages** received that may need to be merged before processing.`,
    color: 0xf59e0b, // Orange/amber color
    fields: [
      {
        name: 'Webhook',
        value: webhook.label,
        inline: true
      },
      {
        name: 'Message Count',
        value: `${messages.length} segments`,
        inline: true
      },
      {
        name: 'Action Required',
        value: 'Review and merge these messages in the Webhook Inbox, then run AI Review.',
        inline: false
      }
    ],
    footer: { text: 'Auto-merge is disabled for this webhook' },
    timestamp: new Date().toISOString()
  };

  // Add link field if we have the URL
  if (inboxUrl) {
    embed.fields.push({
      name: '🔗 Review Now',
      value: `[Open Webhook Inbox](${inboxUrl})`,
      inline: false
    });
  }

  try {
    const response = await fetch(discordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Webhook ${webhook.id}] Failed to send pending merge notification: ${response.status} ${errorText}`);
    } else {
      console.log(`[Webhook ${webhook.id}] Sent pending merge notification for ${messages.length} messages`);
    }
  } catch (error) {
    console.error(`[Webhook ${webhook.id}] Error sending pending merge notification:`, error);
  }

  // Also notify ClawdBot if configured
  const clawdbotAction = webhook.actions.find(
    (action) => action.type === 'CLAWDBOT_RELAY' && action.isEnabled
  );
  if (clawdbotAction) {
    const cbConfig = normalizeActionConfig(clawdbotAction.config);
    const cbUrl = getClawdbotUrl(cbConfig, webhook.devMode);
    if (cbUrl) {
      const cbText = `📋 **${messages.length} messages pending merge review** for ${webhook.label}${inboxUrl ? `\n🔗 ${inboxUrl}` : ''}`;
      try {
        await sendClawdbotRelay(cbUrl, { text: cbText }, cbConfig);
      } catch (err) {
        console.error(`[Webhook ${webhook.id}] ClawdBot pending merge notification failed:`, err);
      }
    }
  }
}

/**
 * Process messages after user manually merges them.
 * Called after mergeWebhookMessages completes.
 */
export async function processMessagesAfterManualMerge(mergedMessageId: string) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: mergedMessageId },
    include: {
      webhook: {
        include: { actions: true }
      }
    }
  });

  if (!message || !message.webhook) {
    throw new Error('Merged message or webhook not found');
  }

  // Run AI review on the merged message
  await retryCrashReviewForMessage(mergedMessageId);
}

/**
 * Process single messages that user dismisses from merge.
 * Called when user decides not to merge and wants to process individually.
 */
export async function processDismissedMergeMessages(messageIds: string[]) {
  for (const messageId of messageIds) {
    const message = await prisma.inboundWebhookMessage.findUnique({
      where: { id: messageId },
      include: {
        webhook: {
          include: { actions: true }
        }
      }
    });

    if (!message || !message.webhook) {
      continue;
    }

    // Update status back to RECEIVED and process
    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: { status: 'RECEIVED' }
    });

    await runInboundWebhookActions(messageId, message.webhook.actions, message.payload, message.webhook.label, message.webhook.devMode);
  }
}

/**
 * Extract crash file identifier from message content.
 * Looks for patterns like "File [crash_xxx.log]" or "crash_xxx.log"
 * Returns null if no identifier found.
 */
function extractCrashFileIdentifier(payload: unknown, rawBody: string | null): string | null {
  const text = extractTextForSorting(payload, rawBody);

  // Pattern 1: "File [crash_xxx.log]" format
  const fileMatch = text.match(/File\s*\[([^\]]+\.log)\]/i);
  if (fileMatch) {
    return fileMatch[1];
  }

  // Pattern 2: Direct crash log filename pattern
  const crashLogMatch = text.match(/(crash_[a-zA-Z0-9_]+\.log)/i);
  if (crashLogMatch) {
    return crashLogMatch[1];
  }

  // Pattern 3: Script error identifier - use quest/script name if present
  const questErrorMatch = text.match(/\[QuestErrors?\]\s*([^\n\r]+)/i);
  if (questErrorMatch) {
    // Use first 50 chars of the error as identifier
    return `quest_error_${questErrorMatch[1].slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  // Pattern 4: Look for zone/server identifier in crash header
  const zoneMatch = text.match(/\[Crash\]\s*Zone\s*\[([^\]]+)\]/i);
  if (zoneMatch) {
    // Combine with timestamp approximation for uniqueness
    const timeKey = Math.floor(Date.now() / 60000); // 1-minute buckets
    return `crash_zone_${zoneMatch[1]}_${timeKey}`;
  }

  return null;
}

/**
 * Group messages by crash file identifier.
 * Messages with the same crash file are grouped together for merging.
 * Messages without an identifier are grouped by time proximity.
 */
function groupMessagesByCrashFile(messages: Array<{
  id: string;
  payload: unknown;
  rawBody: string | null;
  receivedAt: Date;
  labelAssignments: Array<{ labelId: string; label: { id: string; name: string } }>;
}>): Array<typeof messages> {
  const groups = new Map<string, typeof messages>();
  let unknownCounter = 0;

  for (const message of messages) {
    let key = extractCrashFileIdentifier(message.payload, message.rawBody);

    if (!key) {
      // No identifier found - use time-based grouping (messages within 30 seconds)
      // This prevents unrelated messages from being merged
      const timeKey = Math.floor(message.receivedAt.getTime() / 30000); // 30-second buckets
      key = `__unknown_${timeKey}__`;
    }

    const existing = groups.get(key) || [];
    existing.push(message);
    groups.set(key, existing);
  }

  return Array.from(groups.values());
}

/**
 * Group messages by their label sets for merging.
 * Messages with identical label sets can be merged together.
 * @deprecated Use groupMessagesByCrashFile instead
 */
function groupMessagesForMerge(messages: Array<{
  id: string;
  labelAssignments: Array<{ labelId: string; label: { id: string; name: string } }>;
  payload: unknown;
  rawBody: string | null;
}>): Array<typeof messages> {
  const groups = new Map<string, typeof messages>();

  for (const message of messages) {
    // Create a key based on sorted label IDs
    const labelIds = message.labelAssignments.map(la => la.labelId).sort();
    const key = labelIds.join('|') || '__no_labels__';

    const existing = groups.get(key) || [];
    existing.push(message);
    groups.set(key, existing);
  }

  return Array.from(groups.values());
}

/**
 * Process a single merge group: sort, remove duplicates, merge, and run AI review.
 */
async function processAutoMergeGroup(
  messages: Array<{
    id: string;
    payload: unknown;
    rawBody: string | null;
  }>,
  webhook: {
    id: string;
    label: string;
    devMode: boolean;
    actions: Array<{
      id: string;
      type: InboundWebhookActionType;
      isEnabled: boolean;
      config: unknown;
    }>;
  }
) {
  // Build segments for sorting
  const segments = messages.map(msg => ({
    id: msg.id,
    text: extractTextForSorting(msg.payload, msg.rawBody)
  }));

  // Sort segments using AI
  let sortResult;
  try {
    sortResult = await sortCrashReportSegments(segments);
  } catch (error) {
    console.error('Failed to sort crash segments:', error);
    throw error;
  }

  // Filter out segments marked for removal
  const removeSet = new Set(sortResult.removeIds);
  const orderedMessages = sortResult.orderedIds
    .filter(id => !removeSet.has(id))
    .map(id => messages.find(m => m.id === id)!)
    .filter(Boolean);

  // If after removing duplicates we have 0-1 messages, handle appropriately
  if (orderedMessages.length === 0) {
    // All messages were duplicates - delete them all
    if (sortResult.removeIds.length > 0) {
      await prisma.inboundWebhookMessage.deleteMany({
        where: { id: { in: sortResult.removeIds } }
      });
    }
    return;
  }

  if (orderedMessages.length === 1) {
    // Only one message left after dedup - delete duplicates and process the single message
    if (sortResult.removeIds.length > 0) {
      await prisma.inboundWebhookMessage.deleteMany({
        where: { id: { in: sortResult.removeIds } }
      });
    }
    // Process the single message normally
    await runInboundWebhookActions(orderedMessages[0].id, webhook.actions, orderedMessages[0].payload, webhook.label, webhook.devMode);
    return;
  }

  // Delete duplicate/redundant messages identified by the sort
  if (sortResult.removeIds.length > 0) {
    await prisma.inboundWebhookMessage.deleteMany({
      where: { id: { in: sortResult.removeIds } }
    });
  }

  // Build combined text from ordered segments
  const combinedText = orderedMessages
    .map(msg => extractTextForSorting(msg.payload, msg.rawBody))
    .join('\n\n---\n\n');

  // Merge the messages
  const messageIds = orderedMessages.map(m => m.id);
  const mergedMessage = await mergeWebhookMessages(messageIds, combinedText);

  // Run AI review on the merged message
  try {
    await retryCrashReviewForMessage(mergedMessage.id);
    console.log(`[Auto-merge] Completed: ${messageIds.length} messages merged into ${mergedMessage.id}`);
  } catch (error) {
    console.error('[Auto-merge] AI review failed after merge:', error);
    // The merge succeeded, AI review failed - leave for manual intervention
  }
}

/**
 * Extract actual message content for determining if a message should be discarded.
 * Unlike extractTextForSorting, this does NOT fall back to JSON.stringify.
 * Returns null/empty if no actual crash report text is found.
 */
function extractActualMessageContent(payload: unknown, rawBody: string | null): string | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    // Check for crashReportText (primary field for crash reports)
    if (typeof record.crashReportText === 'string' && record.crashReportText.trim().length > 0) {
      return record.crashReportText;
    }
    // Check for message field
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message;
    }
    // Check for content field
    if (typeof record.content === 'string' && record.content.trim().length > 0) {
      return record.content;
    }
    // Check for text field (common alternative)
    if (typeof record.text === 'string' && record.text.trim().length > 0) {
      return record.text;
    }
    // Check for body field
    if (typeof record.body === 'string' && record.body.trim().length > 0) {
      return record.body;
    }
    // Check for raw field (used when payload was a raw string that got normalized)
    if (typeof record.raw === 'string' && record.raw.trim().length > 0) {
      return record.raw;
    }
  }

  // Check rawBody as last resort
  if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
    return rawBody;
  }

  // No actual content found - return null (DO NOT fall back to JSON.stringify)
  return null;
}

/**
 * Extract text content from a message payload for sorting and merging.
 */
function extractTextForSorting(payload: unknown, rawBody: string | null): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (typeof record.crashReportText === 'string') {
      return record.crashReportText;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.content === 'string') {
      return record.content;
    }
    // Check for raw field (used when payload was a raw string that got normalized)
    if (typeof record.raw === 'string') {
      return record.raw;
    }
  }

  if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
    return rawBody;
  }

  try {
    return JSON.stringify(payload ?? {}, null, 2);
  } catch {
    return String(payload ?? '');
  }
}

// Helper to generate CUID-like IDs
function generateCuid() {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `c${timestamp}${random}`;
}
