import { createHash, randomBytes } from 'crypto';
import { prisma } from '../utils/prisma.js';
import { Prisma, type InboundWebhookActionType, type InboundWebhookMessageStatus } from '@prisma/client';
import { reviewCrashReport } from './geminiCrashReviewService.js';
import { appConfig } from '../config/appConfig.js';

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
  discordMode?: 'RAW' | 'WRAP';
  discordTemplate?: string;
  crashModel?: string;
  crashMaxInputChars?: number;
  crashMaxOutputTokens?: number;
  crashTemperature?: number;
  crashPromptTemplate?: string;
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

    // Auto-label based on crash type (script error vs crash) and webhook source
    const findingsRecord = findings as Record<string, unknown> | null;
    const signature = findingsRecord?.signature as { exception?: string | null } | undefined;
    await autoLabelMessage(messageId, findings, signature ?? { exception: extracted.exceptionLine }, webhook.label, crashInput);

    // After successful AI review, trigger Discord action if configured
    const discordAction = webhook.actions.find(
      (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
    );
    if (discordAction) {
      const discordConfig = normalizeActionConfig(discordAction.config);
      if (discordConfig.discordWebhookUrl) {
        const discordStartedAt = Date.now();
        try {
          // Build enriched payload with crash review findings
          const enrichedPayload = enrichPayloadWithCrashReview(message.payload, findings, attempts);
          await sendDiscordRelay(discordConfig.discordWebhookUrl, enrichedPayload, discordConfig, messageId);
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

  void runInboundWebhookActions(message.id, webhook.actions, input.payload, webhook.label);

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

  if (options.runActions !== false) {
    void runInboundWebhookActions(message.id, webhook.actions, options.payload, webhook.label);
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
  webhookLabel?: string
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
        if (!config.discordWebhookUrl) {
          throw new Error('Discord webhook URL is missing.');
        }
        await sendDiscordRelay(config.discordWebhookUrl, payloadForActions, config, messageId);
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
          payloadForActions = enrichPayloadWithCrashReview(payloadForActions, findings, attempts);

          // Auto-label based on crash type (script error vs crash) and webhook source
          const findingsRecord = findings as Record<string, unknown> | null;
          const signature = findingsRecord?.signature as { exception?: string | null } | undefined;
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

function enrichPayloadWithCrashReview(payload: unknown, findings: unknown, attempts: number) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      crashReview: findings,
      crashReviewAttempts: attempts
    };
  }

  return {
    crashReview: findings,
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
    discordMode: raw.discordMode === 'RAW' ? 'RAW' : 'WRAP',
    discordTemplate: typeof raw.discordTemplate === 'string' ? raw.discordTemplate : undefined,
    crashModel: typeof raw.crashModel === 'string' ? raw.crashModel : undefined,
    crashMaxInputChars: typeof raw.crashMaxInputChars === 'number' ? raw.crashMaxInputChars : undefined,
    crashMaxOutputTokens:
      typeof raw.crashMaxOutputTokens === 'number' ? raw.crashMaxOutputTokens : undefined,
    crashTemperature: typeof raw.crashTemperature === 'number' ? raw.crashTemperature : undefined,
    crashPromptTemplate: typeof raw.crashPromptTemplate === 'string' ? raw.crashPromptTemplate : undefined
  };
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

  // Detect if this is a quest/script error vs a crash report
  const isQuestError = detectQuestError(signature, summary);

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

  // DEBUG: Log what we're checking
  console.log('[detectQuestError] rawText first 200 chars:', rawText?.slice(0, 200));
  console.log('[detectQuestError] checking for questerrors:', rawLower.includes('questerrors'));

  // MOST RELIABLE: Check raw text for explicit markers first
  // Check for QuestErrors marker (with or without markdown formatting)
  // This takes priority over everything else
  if (
    rawLower.includes('[questerrors]') ||
    rawLower.includes('[**questerrors**]') ||
    rawLower.includes('questerrors]') ||
    rawLower.includes('**questerrors**')
  ) {
    console.log('[detectQuestError] MATCHED quest error marker, returning true');
    return true;
  }
  if (
    rawLower.includes('[script error]') ||
    rawLower.includes('[**script error**]') ||
    rawLower.includes('script error |')
  ) {
    return true;
  }

  // If raw text starts with [Crash] markers (e.g., "[Crash] Zone [zonename]"), it's NOT a script error
  const rawStripped = rawText?.replace(/\*\*/g, '').replace(/__/g, '').toLowerCase() ?? '';
  if (rawStripped.startsWith('[crash]') || /^\[crash\]\s+zone\s+\[/.test(rawStripped)) {
    return false;
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
  const hasScriptErrorIndicators =
    exception.includes('[questerrors]') ||
    exception.includes('script error') ||
    summaryLower.includes('quest script') ||
    summaryLower.includes('perl script') ||
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

// Auto-label a message based on crash review findings
async function autoLabelMessage(
  messageId: string,
  findings: unknown,
  signature: { exception?: string | null } | undefined,
  webhookLabel?: string,
  rawText?: string
): Promise<void> {
  try {
    const labelsToAdd: string[] = [];

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

    // Check webhook label for Test/Live server indicators
    if (webhookLabel) {
      const lowerLabel = webhookLabel.toLowerCase();
      if (lowerLabel.includes('test server')) {
        const testLabelId = await getOrCreateDefaultLabel('TEST');
        labelsToAdd.push(testLabelId);
      } else if (lowerLabel.includes('live server')) {
        const liveLabelId = await getOrCreateDefaultLabel('LIVE');
        labelsToAdd.push(liveLabelId);
      }
    }

    // Get existing labels for the message
    const existingAssignments = await prisma.webhookMessageLabelAssignment.findMany({
      where: { messageId },
      select: { labelId: true }
    });
    const existingLabelIds = new Set(existingAssignments.map((a) => a.labelId));

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

// Helper to generate CUID-like IDs
function generateCuid() {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `c${timestamp}${random}`;
}
