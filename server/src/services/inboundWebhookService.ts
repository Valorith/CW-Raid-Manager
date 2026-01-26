import { createHash, randomBytes } from 'crypto';
import { prisma } from '../utils/prisma.js';
import type { InboundWebhookActionType, InboundWebhookMessageStatus } from '@prisma/client';
import { reviewCrashReport } from './geminiCrashReviewService.js';

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
      config: input.config ?? {},
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
        webhook: true,
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

export async function getInboundWebhookMessage(messageId: string) {
  return prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: true,
      assignedAdmin: {
        select: { id: true, displayName: true, nickname: true, email: true }
      },
      actionRuns: {
        include: { action: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
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
      data: { payload: payloadCopy }
    });
  }

  try {
    const { findings, attempts } = await reviewCrashReportWithRetry(extracted.combined, crashConfig);
    await prisma.inboundWebhookActionRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        result: findings,
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
      headers: input.headers ?? {},
      payload: normalizePayload(input.payload),
      rawBody: input.rawBody ?? null,
      status: 'RECEIVED'
    }
  });

  await prisma.inboundWebhook.update({
    where: { id: webhook.id },
    data: { lastReceivedAt: new Date() }
  });

  void runInboundWebhookActions(message.id, webhook.actions, input.payload);

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
      headers: { source: 'admin-test' },
      payload: normalizePayload(options.payload),
      rawBody: null,
      status: 'RECEIVED'
    }
  });

  await prisma.inboundWebhook.update({
    where: { id: webhook.id },
    data: { lastReceivedAt: new Date() }
  });

  if (options.runActions !== false) {
    void runInboundWebhookActions(message.id, webhook.actions, options.payload);
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
  payload: unknown
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
        await sendDiscordRelay(config.discordWebhookUrl, payloadForActions, config);
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
        const run = await prisma.inboundWebhookActionRun.create({
          data: {
            messageId,
            actionId: action.id,
            status: 'PENDING_REVIEW',
            result: { note: 'Crash review in progress.' }
          }
        });

        const message = await prisma.inboundWebhookMessage.findUnique({
          where: { id: messageId }
        });

        const crashConfig = normalizeActionConfig(action.config);
        const crashInput = buildCrashReviewInput(message?.payload, message?.rawBody, payloadForActions);
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
            data: { payload: payloadCopy }
          });
        }

        try {
          const { findings, attempts } = await reviewCrashReportWithRetry(extracted.combined, crashConfig);
          await prisma.inboundWebhookActionRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              result: findings,
              durationMs: Date.now() - startedAt
            }
          });
          summary.push({ actionId: action.id, status: 'SUCCESS' });
          payloadForActions = enrichPayloadWithCrashReview(payloadForActions, findings, attempts);
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

  const summary = Array.isArray(message?.actionSummary) ? [...message.actionSummary] : [];
  const index = summary.findIndex((item) => item.actionId === actionId);
  if (index >= 0) {
    summary[index] = { actionId, status };
  } else {
    summary.push({ actionId, status });
  }

  await prisma.inboundWebhookMessage.update({
    where: { id: messageId },
    data: { actionSummary: summary }
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
  config: InboundWebhookActionConfig
) {
  const body = buildDiscordPayload(payload, config);
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

function buildDiscordPayload(payload: unknown, config: InboundWebhookActionConfig) {
  if (config.discordMode !== 'RAW' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (record.crashReview && typeof record.crashReview === 'object') {
      return {
        content: formatDiscordCrashReviewContent(record.crashReview, config.discordTemplate)
      };
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

function formatDiscordCrashReviewContent(findings: unknown, template?: string) {
  const record = (findings ?? {}) as Record<string, unknown>;
  const summary = typeof record.summary === 'string' ? record.summary : 'Crash review completed.';
  const hypotheses = Array.isArray(record.hypotheses) ? record.hypotheses : [];
  const topHypotheses = hypotheses
    .slice(0, 3)
    .map((item) =>
      typeof item?.title === 'string' ? `- ${item.title} (${item.confidence ?? 'n/a'})` : '- Hypothesis'
    )
    .join('\n');
  const nextSteps = Array.isArray(record.recommendedNextSteps)
    ? record.recommendedNextSteps.slice(0, 5).map((step) => `- ${step}`).join('\n')
    : '';
  const json = safeJson(record);

  const defaultContent = [
    '**Crash Review Summary**',
    summary,
    topHypotheses ? `\n**Top Hypotheses**\n${topHypotheses}` : '',
    nextSteps ? `\n**Next Steps**\n${nextSteps}` : '',
    '\nSee Webhook Inbox for full JSON.'
  ]
    .filter(Boolean)
    .join('\n');

  if (!template) {
    return defaultContent.slice(0, 1500);
  }

  return template
    .replace(/\{\{summary\}\}/g, summary)
    .replace(/\{\{hypotheses\}\}/g, topHypotheses)
    .replace(/\{\{nextSteps\}\}/g, nextSteps)
    .replace(/\{\{json\}\}/g, json)
    .slice(0, 1500);
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

// ============================================================================
// Message Merging
// ============================================================================

export async function mergeWebhookMessages(messageIds: string[]) {
  if (messageIds.length < 2) {
    throw new Error('At least 2 messages are required to merge');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Fetch all messages
    const messages = await tx.inboundWebhookMessage.findMany({
      where: { id: { in: messageIds } }
    });

    if (messages.length !== messageIds.length) {
      throw new Error('Some messages were not found');
    }

    // 2. Validate same webhook
    const webhookIds = new Set(messages.map((m) => m.webhookId));
    if (webhookIds.size !== 1) {
      throw new Error('All messages must belong to the same webhook');
    }

    // 3. Order messages by the provided order (messageIds array)
    const ordered = messageIds.map((id) => messages.find((m) => m.id === id)!);

    // 4. Concatenate crash reports with separators
    const combinedRawBody = ordered
      .map((m, i) => {
        const separator = '='.repeat(47);
        const header = `\n${separator}\n=== Part ${i + 1} of ${ordered.length} | Received: ${m.receivedAt.toISOString()} ===\n${separator}\n`;
        const content = m.rawBody || JSON.stringify(m.payload, null, 2);
        return header + content;
      })
      .join('\n');

    // 5. Create merged message
    const merged = await tx.inboundWebhookMessage.create({
      data: {
        id: generateCuid(),
        webhookId: ordered[0].webhookId,
        receivedAt: new Date(),
        payload: { merged: true, partCount: ordered.length },
        rawBody: combinedRawBody,
        status: 'RECEIVED',
        mergedFromIds: messageIds,
        mergedAt: new Date(),
        headers: {}
      },
      include: {
        webhook: true,
        assignedAdmin: {
          select: { id: true, displayName: true, nickname: true, email: true }
        },
        actionRuns: {
          include: { action: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    // 6. Delete originals
    await tx.inboundWebhookMessage.deleteMany({
      where: { id: { in: messageIds } }
    });

    return merged;
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
        webhook: true,
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
