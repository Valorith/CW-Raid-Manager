import { createHash, randomBytes } from 'crypto';

import {
  Prisma,
  type InboundWebhookActionType,
  type InboundWebhookIntakeType,
  type InboundWebhookMessageStatus
} from '@prisma/client';

import {
  getEqemuOracleContextForCrashReport,
  type EqemuOracleContextTelemetry
} from './eqemuOracleContextService.js';
import { reviewCrashReport, sortCrashReportSegments } from './geminiCrashReviewService.js';
import {
  buildSlackPayloadFromText,
  buildSlackPayloadFromUnknown,
  getSlackWebhookUrlFromConfig,
  redactSlackConfig,
  sendSlackIncomingWebhook,
  summarizeSlackConnectionFromConfig
} from './slackIntegrationService.js';
import { queueUserNotification } from './userNotificationService.js';
import { appConfig } from '../config/appConfig.js';
import { staticZoneNameMap } from '../data/zoneNames.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';
import { prisma } from '../utils/prisma.js';
import { resolvePublicClientBaseUrl } from '../utils/publicClientUrl.js';

// ============================================================================
// SERVICE LOADED - AUTO-MERGE VERSION 2.0
// ============================================================================

// Server identifier for per-server settings (e.g., 'production', 'local', 'dev')
const SERVER_ID = process.env.SERVER_ID || 'default';
const WEBHOOK_DEBUG_LOGS =
  appConfig.nodeEnv === 'development' || process.env.WEBHOOK_DEBUG_LOGS === 'true';
const OPENAI_ESCALATION_MODEL = 'gpt-5.4-mini';
const SERVER_CRASH_REPORT_INTAKE: InboundWebhookIntakeType = 'EQEMU_SERVER_CRASH_REPORT';
const REPEATED_REPORT_COALESCE_WINDOW_SECONDS = Math.max(
  1,
  Number.parseInt(process.env.WEBHOOK_REPEAT_COALESCE_WINDOW_SECONDS ?? '', 10) || 30 * 60
);
const REPEATED_REPORT_LOOKBACK_LIMIT = 100;
const INTAKE_REPEAT_META_KEY = 'intakeRepeat';

function debugLog(...args: unknown[]): void {
  if (WEBHOOK_DEBUG_LOGS) {
    console.log(...args);
  }
}

debugLog('========================================');
debugLog('[InboundWebhookService] LOADED - AUTO-MERGE v2.0');
debugLog('[InboundWebhookService] Delayed processing ENABLED');
debugLog(`[InboundWebhookService] Server ID: ${SERVER_ID}`);
debugLog('========================================');

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
  debugLog(`[InboundWebhookService] Webhook processing ${enabled ? 'ENABLED' : 'DISABLED'} for server "${SERVER_ID}"`);
}

// ============================================================================
// Auto-Merge Timer Tracking
// ============================================================================

// Pending auto-merge group info
interface PendingMergeGroup {
  groupKey: string;           // Crash file identifier or 'default'
  familyKey: string | null;
  fileGroupKey: string | null;
  mergeKind: CrashMergeIdentityKind;
  webhookId: string;
  messageIds: string[];
  firstMessageAt: Date;
  expiresAt: Date;
  timer: NodeJS.Timeout | null;  // null when processing
  status: 'pending' | 'processing';
}

type CrashMergeIdentityKind = 'file' | 'zone' | 'quest' | 'unknown' | 'mixed';

interface CrashMergeIdentity {
  groupKey: string | null;
  familyKey: string | null;
  kind: CrashMergeIdentityKind;
}

type RepeatReportMetadata = {
  fingerprint: string;
  occurrenceCount: number;
  firstReceivedAt: string;
  lastReceivedAt: string;
  latestSourceIp: string | null;
};

// Track pending merge groups by a composite key: webhookId:groupKey
const pendingMergeGroups = new Map<string, PendingMergeGroup>();

// Legacy timer map for backwards compatibility during transition
const pendingProcessingTimers = new Map<string, NodeJS.Timeout>();

// Track auto-merge retry counts to limit retries
const autoMergeRetryCounts = new Map<string, number>();
const AUTO_MERGE_MAX_RETRIES = 1;
const AUTO_CRASH_REVIEW_RETRY_DELAYS_MS = [
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  20 * 60_000,
  30 * 60_000
] as const;
const AUTO_CRASH_REVIEW_MAX_SCHEDULED_RETRIES = AUTO_CRASH_REVIEW_RETRY_DELAYS_MS.length;
const scheduledCrashReviewRetries = new Map<string, NodeJS.Timeout>();

// Track webhooks currently being processed to prevent concurrent processing
const processingWebhooks = new Set<string>();

// Track groups currently being processed to prevent concurrent processing
const processingGroups = new Set<string>();

// Resolve public client base URL for Discord links. Localhost is intentionally rejected.
const clientBaseUrl = resolvePublicClientBaseUrl('Webhook Inbox Discord links');

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
  slackTemplate?: string;
  slackWebhookUrl?: string;
  webhookUrl?: string;
  configurationUrl?: string | null;
  slackTeamId?: string | null;
  slackTeamName?: string | null;
  slackChannelId?: string | null;
  slackChannelName?: string | null;
  connectedAt?: string | null;
  slackConnection?: ReturnType<typeof summarizeSlackConnectionFromConfig>;
  customWebhookUrl?: string;
  crashModel?: string;
  crashMaxInputChars?: number;
  crashMaxOutputTokens?: number;
  crashTemperature?: number;
  crashPromptTemplate?: string;
  useEqemuOracleContext?: boolean;
}

type CrashReviewProvider = 'gemini' | 'openai';

interface CrashReviewRunOptions {
  provider?: CrashReviewProvider;
  model?: string;
  relayAfterReview?: boolean;
  fallbackToDiscordOnFailure?: boolean;
  useEqemuOracleContext?: boolean;
}

export interface CreateInboundWebhookInput {
  label: string;
  description?: string | null;
  isEnabled?: boolean;
  intakeType?: InboundWebhookIntakeType;
  retentionPolicy?: InboundWebhookRetentionPolicy | null;
}

export interface UpdateInboundWebhookInput {
  label?: string;
  description?: string | null;
  isEnabled?: boolean;
  intakeType?: InboundWebhookIntakeType;
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

export interface ScriptErrorContext {
  zoneShortName: string | null;
  zoneName: string | null;
  npcTypeId: number | null;
  npcName: string | null;
  npcNameSource: 'payload' | 'scriptFile' | 'eqDb' | null;
  scriptFile: string | null;
  packageName: string | null;
}

const GEMINI_TIMEOUT_MS = 120_000;
const MODULES_MAX_LINES = 400;
const MODULES_MAX_CHARS = 60_000;
const RAW_HEAD_CHARS = 25_000;
const RAW_TAIL_CHARS = 25_000;
const EXTRACT_MAX_CHARS = 120_000;
const RETENTION_DELETE_BATCH_SIZE = 500;

export interface CrashTelemetryReport {
  id: string;
  messageId: string;
  webhookId: string;
  webhookLabel: string | null;
  receivedAt: string;
  status: InboundWebhookMessageStatus;
  fingerprint: string;
  platformName: string | null;
  crashReport: string;
  serverVersion: string;
  compileDate: string | null;
  compileTime: string | null;
  serverName: string | null;
  serverShortName: string | null;
  uptimeSeconds: number | null;
  osMachine: string | null;
  osRelease: string | null;
  osVersion: string | null;
  osSysname: string | null;
  processId: number | null;
  rssMemoryMb: number | null;
  cpus: number | null;
  originationInfo: string | null;
  lineCount: number;
  reviewStatus: string | null;
  reviewSummary: string | null;
}

export interface CrashTelemetryVersionGroup {
  serverVersion: string;
  compileDate: string | null;
  compileTime: string | null;
  platformName: string | null;
  latestServerName: string | null;
  latestOs: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalCrashes: number;
  uniqueCrashes: number;
  reviewedCrashes: number;
  affectedServers: number;
}

export interface CrashTelemetrySummary {
  groups: CrashTelemetryVersionGroup[];
  totalCrashes: number;
  uniqueCrashes: number;
  versions: number;
  reviewedCrashes: number;
  latestCrashAt: string | null;
}

export function generateWebhookToken(): string {
  return randomBytes(24).toString('base64url');
}

function isServerCrashReportIntake(
  webhook: { intakeType?: InboundWebhookIntakeType | null } | null | undefined
): boolean {
  return webhook?.intakeType === SERVER_CRASH_REPORT_INTAKE;
}

function applyInboxMessageVisibilityFilter(where: Prisma.InboundWebhookMessageWhereInput): void {
  where.webhook = {
    is: {
      intakeType: {
        not: SERVER_CRASH_REPORT_INTAKE
      }
    }
  };
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

function toRetentionPolicy(value: unknown): InboundWebhookRetentionPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalizeRetentionPolicy(null);
  }
  return normalizeRetentionPolicy(value as InboundWebhookRetentionPolicy);
}

function compactActionRunResult(result: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }

  const record = result as Record<string, unknown>;
  const telemetry =
    record.telemetry && typeof record.telemetry === 'object' && !Array.isArray(record.telemetry)
      ? (record.telemetry as Record<string, unknown>)
      : null;
  const compactTelemetry = telemetry
    ? {
        model: telemetry.model,
        inputChars: telemetry.inputChars,
        outputChars: telemetry.outputChars,
        attempts: telemetry.attempts,
        finishReason: telemetry.finishReason,
        thinkingTokens: telemetry.thinkingTokens,
        outputTokens: telemetry.outputTokens,
        totalTokens: telemetry.totalTokens,
        eqemuOracleContext: compactOracleContextTelemetry(telemetry.eqemuOracleContext)
      }
    : undefined;

  return {
    summary: record.summary,
    signature: record.signature,
    telemetry: compactTelemetry
  } as Prisma.JsonObject;
}

function compactOracleContextTelemetry(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled,
    available: record.available,
    sourceCommit: record.sourceCommit,
    selectedRecordIds: Array.isArray(record.selectedRecordIds)
      ? record.selectedRecordIds.slice(0, 8)
      : [],
    recordCount: record.recordCount,
    charCount: record.charCount,
    lookupMs: record.lookupMs,
    skippedReason: record.skippedReason
  };
}

type InboundWebhookActionRecord = {
  id: string;
  type: InboundWebhookActionType;
  config: Prisma.JsonValue;
};

function redactInboundWebhookActionConfig<T extends InboundWebhookActionRecord>(action: T): T {
  if (action.type !== 'SLACK_RELAY') {
    return action;
  }

  return {
    ...action,
    config: redactSlackConfig(action.config) as Prisma.JsonValue
  };
}

function redactInboundWebhookActions<T extends { actions?: InboundWebhookActionRecord[] }>(
  webhook: T
): T {
  if (!Array.isArray(webhook.actions)) {
    return webhook;
  }

  return {
    ...webhook,
    actions: webhook.actions.map((action) => redactInboundWebhookActionConfig(action))
  };
}

function redactInboundWebhookActionRun<T extends { action?: InboundWebhookActionRecord | null }>(
  run: T
): T {
  if (!run.action) {
    return run;
  }
  return {
    ...run,
    action: redactInboundWebhookActionConfig(run.action)
  };
}

export async function listInboundWebhooks() {
  const webhooks = await prisma.inboundWebhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  return webhooks.map((webhook) => redactInboundWebhookActions(webhook));
}

export async function createInboundWebhook(userId: string, input: CreateInboundWebhookInput) {
  const retentionPolicy = normalizeRetentionPolicy(input.retentionPolicy ?? null);
  const token = generateWebhookToken();

  const webhook = await prisma.inboundWebhook.create({
    data: {
      label: input.label.trim(),
      description: input.description?.trim() || null,
      isEnabled: input.isEnabled ?? true,
      intakeType: input.intakeType ?? 'GENERIC',
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

  return redactInboundWebhookActions(webhook);
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
  if (input.intakeType !== undefined) {
    data.intakeType = input.intakeType;
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

  const webhook = await prisma.inboundWebhook.update({
    where: { id: webhookId },
    data,
    include: {
      actions: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  return redactInboundWebhookActions(webhook);
}

export async function deleteInboundWebhook(webhookId: string) {
  await prisma.inboundWebhook.delete({
    where: { id: webhookId }
  });
}

export async function createInboundWebhookAction(webhookId: string, input: CreateInboundWebhookActionInput) {
  const action = await prisma.inboundWebhookAction.create({
    data: {
      webhookId,
      type: input.type,
      name: input.name.trim(),
      isEnabled: input.isEnabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      sortOrder: input.sortOrder ?? 0
    }
  });

  return redactInboundWebhookActionConfig(action);
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

  const action = await prisma.inboundWebhookAction.update({
    where: { id: actionId },
    data
  });

  return redactInboundWebhookActionConfig(action);
}

export async function deleteInboundWebhookAction(actionId: string) {
  await prisma.inboundWebhookAction.delete({ where: { id: actionId } });
}

export async function disconnectInboundWebhookActionSlack(actionId: string) {
  const action = await prisma.inboundWebhookAction.findUnique({
    where: { id: actionId },
    select: { id: true, type: true, config: true }
  });

  if (!action || action.type !== 'SLACK_RELAY') {
    throw new Error('Slack relay action not found.');
  }

  const nextConfig = { ...((action.config && typeof action.config === 'object' && !Array.isArray(action.config))
    ? (action.config as Record<string, unknown>)
    : {}) };
  delete nextConfig.webhookUrl;
  delete nextConfig.slackWebhookUrl;
  delete nextConfig.configurationUrl;
  delete nextConfig.slackTeamId;
  delete nextConfig.slackTeamName;
  delete nextConfig.slackChannelId;
  delete nextConfig.slackChannelName;
  delete nextConfig.connectedAt;

  const updated = await prisma.inboundWebhookAction.update({
    where: { id: actionId },
    data: { config: nextConfig as Prisma.InputJsonValue }
  });

  return redactInboundWebhookActionConfig(updated);
}

export async function sendSlackRelayTestForAction(actionId: string) {
  const action = await prisma.inboundWebhookAction.findUnique({
    where: { id: actionId },
    include: { webhook: true }
  });

  if (!action || action.type !== 'SLACK_RELAY') {
    throw new Error('Slack relay action not found.');
  }

  const config = normalizeActionConfig(action.config);
  const slackUrl = getSlackWebhookUrlFromConfig(config);
  if (!slackUrl) {
    throw new Error('Slack incoming webhook is not connected.');
  }

  await sendSlackIncomingWebhook(
    slackUrl,
    buildSlackPayloadFromText({
      title: 'CW Nexus Slack Relay Test',
      text: `Slack relay action "${action.name}" is connected for ${action.webhook.label}.`,
      url: clientBaseUrl ? `${clientBaseUrl}/admin/webhooks` : null
    })
  );

  return redactInboundWebhookActionConfig(action);
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
  applyInboxMessageVisibilityFilter(where);

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

  return {
    messages: messages.map((message) => ({
      ...message,
      webhook: message.webhook ? redactInboundWebhookActions(message.webhook) : message.webhook,
      actionRuns: message.actionRuns.map((run) => redactInboundWebhookActionRun(run))
    })),
    total
  };
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
      testChangeLinks: {
        include: {
          linkedBy: {
            select: { id: true, displayName: true, nickname: true, email: true }
          },
          change: {
            select: {
              id: true,
              publicId: true,
              title: true,
              status: true,
              priority: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
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

  const scriptErrorContext = await getScriptErrorContext(message.payload, message.rawBody);

  // Transform to include computed fields for consistency with enhanced list
  return {
    ...message,
    webhook: message.webhook ? redactInboundWebhookActions(message.webhook) : message.webhook,
    actionRuns: message.actionRuns.map((run) => redactInboundWebhookActionRun(run)),
    scriptErrorContext,
    labels: message.labelAssignments.map((la) => la.label),
    linkedTestChanges: message.testChangeLinks.map((link) => ({
      id: link.id,
      changeId: link.changeId,
      publicId: link.change.publicId,
      title: link.change.title,
      status: link.change.status,
      priority: link.change.priority,
      linkedAt: link.createdAt.toISOString(),
      linkedBy: link.linkedBy
    })),
    isRead: userId && message.readStatuses ? message.readStatuses.length > 0 : undefined,
    isStarred: userId && message.stars ? message.stars.length > 0 : undefined,
    labelAssignments: undefined,
    testChangeLinks: undefined,
    readStatuses: undefined,
    stars: undefined
  };
}

export async function getCrashTelemetrySummary(options: { includeArchived?: boolean } = {}): Promise<CrashTelemetrySummary> {
  const reports = await listCrashTelemetryReports(options);
  const groups = buildCrashTelemetryGroups(reports);
  const uniqueFingerprints = new Set(reports.map((report) => report.fingerprint));

  return {
    groups,
    totalCrashes: reports.length,
    uniqueCrashes: uniqueFingerprints.size,
    versions: groups.length,
    reviewedCrashes: reports.filter((report) => report.reviewStatus === 'SUCCESS').length,
    latestCrashAt: reports[0]?.receivedAt ?? null
  };
}

export async function listCrashTelemetryReports(options: {
  version?: string;
  includeArchived?: boolean;
} = {}): Promise<CrashTelemetryReport[]> {
  const where: Prisma.InboundWebhookMessageWhereInput = {
    webhook: {
      is: {
        intakeType: SERVER_CRASH_REPORT_INTAKE
      }
    }
  };
  if (!options.includeArchived) {
    where.archivedAt = null;
  }

  const messages = await prisma.inboundWebhookMessage.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      webhookId: true,
      receivedAt: true,
      payload: true,
      rawBody: true,
      status: true,
      webhook: {
        select: {
          id: true,
          label: true,
          intakeType: true
        }
      },
      actionRuns: {
        select: {
          status: true,
          result: true,
          createdAt: true,
          action: {
            select: {
              type: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  const reports = messages
    .map((message) => toCrashTelemetryReport(message))
    .filter((report): report is CrashTelemetryReport => Boolean(report));

  if (!options.version) {
    return reports;
  }

  return reports.filter((report) => report.serverVersion === options.version);
}

export async function retryCrashReviewForMessage(
  messageId: string,
  options: CrashReviewRunOptions = {}
) {
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

  let crashAction = webhook.actions.find((action) => action.type === 'CRASH_REVIEW');
  if (!crashAction) {
    const nextSortOrder =
      webhook.actions.reduce((max, action) => Math.max(max, action.sortOrder), -1) + 1;
    crashAction = await prisma.inboundWebhookAction.create({
      data: {
        webhookId: webhook.id,
        type: 'CRASH_REVIEW',
        name: 'Crash Review',
        isEnabled: true,
        config: {},
        sortOrder: nextSortOrder
      }
    });
  }

  const crashConfig = normalizeActionConfig(crashAction.config);
  const useEqemuOracleContext =
    options.useEqemuOracleContext ?? (crashConfig.useEqemuOracleContext !== false);

  const run = await prisma.inboundWebhookActionRun.create({
    data: {
      messageId,
      actionId: crashAction.id,
      status: 'PENDING_REVIEW',
      result: {
        note:
          options.provider === 'openai'
            ? `OpenAI escalation review in progress${useEqemuOracleContext ? ' with Oracle context' : ''}.`
            : `Crash review retry in progress${useEqemuOracleContext ? ' with Oracle context' : ''}.`
      }
    }
  });

  const crashInput = buildCrashReviewInput(message.payload, message.rawBody, message.payload);
  const extracted = extractCrashReportSections(crashInput);
  const crashReportExtract = buildCrashReportExtract(extracted);

  if (message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)) {
    const payloadCopy = { ...(message.payload as Record<string, unknown>) };
    payloadCopy.crashReport = crashReportExtract;

    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: { payload: payloadCopy as Prisma.InputJsonValue }
    });
  }

  try {
    const { findings, attempts } = await reviewCrashReportWithRetry(
      extracted.combined,
      crashConfig,
      options
    );
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
    if (discordAction && options.relayAfterReview !== false) {
      const discordConfig = normalizeActionConfig(discordAction.config);
      const discordUrl = getDiscordUrl(discordConfig, webhook.devMode);
      if (discordUrl) {
        const discordStartedAt = Date.now();
        try {
          // Build enriched payload with crash review findings and error type
          const enrichedPayload = enrichPayloadWithCrashReview(message.payload, findings, attempts, errorType);
          await sendDiscordRelay(discordUrl, enrichedPayload, discordConfig, messageId);
          await queueCrashReportMessengerNotifications(messageId, webhook.label, enrichedPayload).catch((error) => {
            console.error('Failed to queue crash report messenger notifications:', error);
          });
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
    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: { status: 'FAILED' }
    });
    if (options.fallbackToDiscordOnFailure === false) {
      throw error;
    }
    await sendRawCrashReportFallbackToDiscord(messageId, webhook, message.payload, message.rawBody, error);
  }

  await applyLabelAutomationIfComplete(messageId);
  return getInboundWebhookMessage(messageId);
}

function getLatestCrashReviewResult(
  runs: Array<{
    status: string;
    result: Prisma.JsonValue | null;
    createdAt: Date;
    action: { type: InboundWebhookActionType } | null;
  }>
): Prisma.JsonObject | null {
  const reviewRun = [...runs]
    .filter(
      (run) =>
        run.action?.type === 'CRASH_REVIEW' &&
        run.status === 'SUCCESS' &&
        run.result &&
        typeof run.result === 'object' &&
        !Array.isArray(run.result)
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!reviewRun || !reviewRun.result || Array.isArray(reviewRun.result)) {
    return null;
  }

  return reviewRun.result as Prisma.JsonObject;
}

function buildManualDiscordPayload(
  payload: Prisma.JsonValue,
  review: Prisma.JsonObject
): Prisma.JsonObject {
  const basePayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...(payload as Prisma.JsonObject) }
      : ({ payload } as Prisma.JsonObject);

  return {
    ...basePayload,
    crashReview: review,
    _manualDiscordRelay: true,
    _manualDiscordRelayAt: new Date().toISOString()
  };
}

export async function sendManualDiscordSummaryForMessage(messageId: string) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: {
        include: {
          actions: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      actionRuns: {
        include: {
          action: true
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!message) {
    throw new Error('Webhook message not found.');
  }

  const discordAction = message.webhook.actions.find(
    (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
  );
  if (!discordAction) {
    throw new Error('Enabled Discord relay action is not configured.');
  }

  const discordConfig = normalizeActionConfig(discordAction.config);
  const discordUrl = getDiscordUrl(discordConfig, message.webhook.devMode);
  if (!discordUrl?.trim()) {
    throw new Error(
      message.webhook.devMode
        ? 'Dev Discord webhook URL is not configured.'
        : 'Discord webhook URL is not configured.'
    );
  }

  const review = getLatestCrashReviewResult(message.actionRuns);
  const summary = typeof review?.summary === 'string' ? review.summary.trim() : '';
  if (!review || !summary) {
    throw new Error('A completed AI review summary is required before sending to Discord.');
  }

  const startedAt = Date.now();
  const enrichedPayload = buildManualDiscordPayload(message.payload, review);

  try {
    await sendDiscordRelay(discordUrl.trim(), enrichedPayload, discordConfig, messageId);
    await prisma.inboundWebhookActionRun.create({
      data: {
        messageId,
        actionId: discordAction.id,
        status: 'SUCCESS',
        result: {
          manual: true,
          target: message.webhook.devMode ? 'DEV_DISCORD' : 'PRIMARY_DISCORD'
        },
        durationMs: Date.now() - startedAt
      }
    });
    await updateActionSummary(messageId, discordAction.id, 'SUCCESS');
  } catch (error) {
    await prisma.inboundWebhookActionRun.create({
      data: {
        messageId,
        actionId: discordAction.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown Discord error',
        result: { manual: true },
        durationMs: Date.now() - startedAt
      }
    });
    await updateActionSummary(messageId, discordAction.id, 'FAILED');
    await applyLabelAutomationIfComplete(messageId);
    throw error;
  }

  await applyLabelAutomationIfComplete(messageId);
  return getInboundWebhookMessage(messageId);
}

export async function resolveInboundWebhookMessage(messageId: string, resolvingUserId: string) {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: {
        include: {
          actions: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      assignedAdmin: {
        select: { id: true, displayName: true, nickname: true, email: true }
      },
      actionRuns: {
        include: {
          action: true
        },
        orderBy: { createdAt: 'desc' }
      },
      labelAssignments: {
        include: { label: true }
      }
    }
  });

  if (!message) {
    throw new Error('Webhook message not found.');
  }

  const discordAction = message.webhook.actions.find(
    (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
  );
  if (!discordAction) {
    throw new Error('Enabled Discord relay action is not configured.');
  }

  const discordConfig = normalizeActionConfig(discordAction.config);
  const discordUrl = getDiscordUrl(discordConfig, message.webhook.devMode);
  if (!discordUrl?.trim()) {
    throw new Error(
      message.webhook.devMode
        ? 'Dev Discord webhook URL is not configured.'
        : 'Discord webhook URL is not configured.'
    );
  }

  const startedAt = Date.now();
  const resolvedPayload = await buildResolvedDiscordPayload(message);

  try {
    await sendDiscordRelay(discordUrl.trim(), resolvedPayload, discordConfig, messageId);
    await prisma.inboundWebhookActionRun.create({
      data: {
        messageId,
        actionId: discordAction.id,
        status: 'SUCCESS',
        result: {
          manual: true,
          resolved: true,
          target: message.webhook.devMode ? 'DEV_DISCORD' : 'PRIMARY_DISCORD'
        },
        durationMs: Date.now() - startedAt
      }
    });
    await updateActionSummary(messageId, discordAction.id, 'SUCCESS');
    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: {
        archivedAt: new Date(),
        assignedAdminId: resolvingUserId,
        assignedAt: new Date()
      }
    });
  } catch (error) {
    await prisma.inboundWebhookActionRun.create({
      data: {
        messageId,
        actionId: discordAction.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown Discord error',
        result: { manual: true, resolved: true },
        durationMs: Date.now() - startedAt
      }
    });
    await updateActionSummary(messageId, discordAction.id, 'FAILED');
    throw error;
  }

  await applyLabelAutomationIfComplete(messageId);
  return getInboundWebhookMessage(messageId);
}

async function buildResolvedDiscordPayload(message: {
  id: string;
  webhookId: string;
  receivedAt: Date;
  sourceIp: string | null;
  payload: Prisma.JsonValue;
  rawBody: string | null;
  status: InboundWebhookMessageStatus;
  webhook: { id: string; label: string };
  assignedAdmin?: { displayName: string | null; nickname: string | null; email: string | null } | null;
  actionRuns: Array<{
    status: string;
    result: Prisma.JsonValue | null;
    createdAt: Date;
    action: { type: InboundWebhookActionType } | null;
  }>;
  labelAssignments?: Array<{ label: { name: string } }>;
}): Promise<DiscordEmbedPayload> {
  const review = getLatestCrashReviewResult(message.actionRuns);
  const description = getResolvedIssueDescription(message, review);
  const signature = review?.signature as { exception?: string | null; topFrame?: string | null } | undefined;
  const scriptErrorContext = await getScriptErrorContext(message.payload, message.rawBody);
  const messageUrl = clientBaseUrl
    ? `${clientBaseUrl}/admin/webhooks?messageId=${encodeURIComponent(message.id)}`
    : null;
  const labelNames =
    message.labelAssignments?.map((assignment) => assignment.label.name).filter(Boolean) ?? [];
  const assignedName =
    message.assignedAdmin?.nickname ||
    message.assignedAdmin?.displayName ||
    message.assignedAdmin?.email ||
    'Unassigned';

  const fields: DiscordEmbed['fields'] = [
    {
      name: 'Issue',
      value: truncateText(description, 900),
      inline: false
    },
    {
      name: 'Message ID',
      value: `\`${truncateText(message.id, 96)}\``,
      inline: true
    },
    {
      name: 'Webhook',
      value: truncateText(message.webhook.label || message.webhookId, 120),
      inline: true
    },
    {
      name: 'Received',
      value: `<t:${Math.floor(message.receivedAt.getTime() / 1000)}:f>`,
      inline: true
    }
  ];

  if (signature?.exception || signature?.topFrame) {
    const signatureParts = [
      signature.exception ? `Type: \`${truncateText(signature.exception, 90)}\`` : '',
      signature.topFrame ? `Location: \`${truncateText(signature.topFrame, 90)}\`` : ''
    ].filter(Boolean);
    fields.push({
      name: 'Identifier',
      value: signatureParts.join('\n'),
      inline: false
    });
  }

  const contextLines = formatResolvedDiscordContext(scriptErrorContext);
  if (contextLines.length > 0) {
    fields.push({
      name: 'Context',
      value: contextLines.join('\n'),
      inline: false
    });
  }

  fields.push({
    name: 'Status',
    value: [
      `Inbox status: \`${message.status}\``,
      `Assigned: ${truncateText(assignedName, 90)}`,
      labelNames.length ? `Labels: ${truncateText(labelNames.join(', '), 160)}` : null
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n'),
    inline: false
  });

  if (messageUrl) {
    fields.push({
      name: 'Inbox',
      value: `[Open resolved item](${messageUrl})`,
      inline: false
    });
  }

  return {
    embeds: [
      {
        title: '✅ Issue Resolved',
        description: 'This webhook inbox item has been marked resolved and archived.',
        color: DISCORD_EMBED_COLORS.success,
        fields,
        footer: { text: 'CWRaidManager Webhook Inbox' },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function formatResolvedDiscordContext(context: ScriptErrorContext | null): string[] {
  if (!context) {
    return [];
  }

  const lines: string[] = [];
  const zoneLabel = formatScriptErrorZoneLabel(context);
  const npcName = formatNpcDisplayName(context.npcName, null);

  if (zoneLabel) {
    lines.push(`Zone: ${zoneLabel}`);
  }
  if (npcName) {
    lines.push(`NPC: ${truncateText(npcName, 160)}`);
  }
  if (context.npcTypeId) {
    lines.push(`NPC Type ID: \`${context.npcTypeId}\``);
  }
  if (context.scriptFile) {
    lines.push(`Script: \`${truncateText(context.scriptFile, 160)}\``);
  }

  return lines;
}

function formatScriptErrorZoneLabel(context: ScriptErrorContext): string | null {
  if (context.zoneName && context.zoneShortName) {
    return `${truncateText(context.zoneName, 120)} (\`${truncateText(context.zoneShortName, 60)}\`)`;
  }
  if (context.zoneName) {
    return truncateText(context.zoneName, 160);
  }
  if (context.zoneShortName) {
    return `\`${truncateText(context.zoneShortName, 80)}\``;
  }
  return null;
}

function getResolvedIssueDescription(
  message: { payload: Prisma.JsonValue; rawBody: string | null },
  review: Prisma.JsonObject | null
): string {
  const reviewSummary = typeof review?.summary === 'string' ? review.summary.trim() : '';
  if (reviewSummary) {
    return reviewSummary;
  }

  const rawText = buildCrashReviewInput(message.payload, message.rawBody, message.payload)
    .replace(/\s+/g, ' ')
    .trim();
  if (rawText) {
    return truncateText(rawText, 260);
  }

  return 'Webhook inbox item marked resolved.';
}

function scheduleAutoDevinCrashTelemetryHandoff(messageId: string) {
  void import('./outboundWebhookEndpointService.js')
    .then(({ tryAutoSendCrashTelemetryToDevin }) =>
      tryAutoSendCrashTelemetryToDevin(messageId)
    )
    .catch((error) => {
      console.error(
        `[InboundWebhookService] Failed to schedule auto Devin crash handoff for ${messageId}:`,
        error
      );
    });
}

export async function receiveInboundWebhookMessage(input: InboundWebhookMessageInput) {
  debugLog(`[WEBHOOK RECEIVE] ========== NEW MESSAGE RECEIVED ==========`);
  debugLog(`[WEBHOOK RECEIVE] webhookId: ${input.webhookId}`);

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

  debugLog(`[WEBHOOK RECEIVE] Webhook found: ${webhook.label}, autoMerge=${webhook.autoMerge}, mergeWindow=${webhook.mergeWindowSeconds}s`);
  const isServerCrashEndpoint = isServerCrashReportIntake(webhook);
  if (isServerCrashEndpoint && !hasServerCrashReportPayload(input.payload, input.rawBody ?? null)) {
    throw new Error('Invalid EQEmu Server crash report payload.');
  }

  const processingEnabled = await isWebhookProcessingEnabled();

  // Check if the message has any obvious text content for labels, while still
  // allowing structured non-crash payloads to pass through to relay actions.
  const messageContent = extractActualMessageContent(input.payload, input.rawBody ?? null);

  // Log payload structure for debugging
  const payloadType = typeof input.payload;
  const payloadKeys = input.payload && typeof input.payload === 'object' ? Object.keys(input.payload as object) : [];
  debugLog(`[WEBHOOK RECEIVE] Payload type: ${payloadType}, keys: [${payloadKeys.join(', ')}], rawBody: ${input.rawBody ? 'present' : 'null'}`);
  debugLog(`[WEBHOOK RECEIVE] Content check: hasContent=${!!messageContent}, contentLength=${messageContent?.length ?? 0}`);
  if (!hasRelayableWebhookPayload(input.payload, input.rawBody ?? null)) {
    debugLog(`[WEBHOOK RECEIVE] >>>>>> DISCARDING MESSAGE - EMPTY PAYLOAD <<<<<<`);
    // Return a minimal response but don't create a message record
    return { id: 'discarded', webhookId: webhook.id, status: 'DISCARDED' as const };
  }

  const repeatFingerprint = messageContent ? createRepeatedReportFingerprint(messageContent) : null;
  if (repeatFingerprint) {
    const coalescedMessage = await coalesceRepeatedReportOccurrence({
      webhookId: webhook.id,
      fingerprint: repeatFingerprint,
      sourceIp: input.sourceIp ?? null
    });

    if (coalescedMessage) {
      await prisma.inboundWebhook.update({
        where: { id: webhook.id },
        data: { lastReceivedAt: new Date() }
      });
      debugLog(
        `[WEBHOOK RECEIVE] Coalesced repeated report into existing message ${coalescedMessage.id}`
      );
      debugLog(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
      return coalescedMessage;
    }
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
  if (messageContent) {
    await applyImmediateLabels(message.id, messageContent, webhook.label);
  }
  if (isServerCrashEndpoint) {
    await addDefaultLabelsToMessage(message.id, ['CRASH']);
  }

  if (!processingEnabled) {
    debugLog(`[WEBHOOK RECEIVE] Processing DISABLED - stored message ${message.id} without running actions`);
    if (isServerCrashEndpoint) {
      scheduleAutoDevinCrashTelemetryHandoff(message.id);
    }
    debugLog(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
    return message;
  }

  if (isServerCrashEndpoint) {
    debugLog(`[WEBHOOK RECEIVE] Message created: ${message.id}, server crash telemetry endpoint - running actions immediately`);
    await runInboundWebhookActions(
      message.id,
      webhook.actions,
      message.payload,
      webhook.label,
      webhook.devMode,
      { forceCrashReview: true }
    );
    scheduleAutoDevinCrashTelemetryHandoff(message.id);
    debugLog(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
    return message;
  }

  if (!shouldUseCrashMergePipeline(input.payload, input.rawBody ?? null, input.payload)) {
    debugLog(`[WEBHOOK RECEIVE] Message created: ${message.id}, non-crash payload detected - running actions immediately`);
    if (messageContent) {
      await applyPassthroughLabels(message.id, messageContent);
    }
    await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
    debugLog(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
    return message;
  }

  // Add message to pending merge group with fixed timer from first message
  const mergeWindow = webhook.mergeWindowSeconds ?? 60;
  const mergeIdentity = extractCrashMergeIdentity(input.payload, input.rawBody ?? null);
  const groupKey = mergeIdentity.groupKey || 'default';
  debugLog(`[WEBHOOK RECEIVE] Message created: ${message.id}, adding to group "${groupKey}" (merge window: ${mergeWindow}s)`);
  addMessageToPendingGroup(
    webhook.id,
    message.id,
    groupKey,
    mergeWindow,
    mergeIdentity.familyKey,
    mergeIdentity.kind
  );

  debugLog(`[WEBHOOK RECEIVE] ========== MESSAGE RECEIVE COMPLETE ==========`);
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

  const isServerCrashEndpoint = isServerCrashReportIntake(webhook);
  if (isServerCrashEndpoint && !hasServerCrashReportPayload(options.payload, null)) {
    throw new Error('Invalid EQEmu Server crash report payload.');
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
  if (isServerCrashEndpoint) {
    await addDefaultLabelsToMessage(message.id, ['CRASH']);
  }

  if (options.runActions !== false) {
    if (isServerCrashEndpoint) {
      await runInboundWebhookActions(
        message.id,
        webhook.actions,
        message.payload,
        webhook.label,
        webhook.devMode,
        { forceCrashReview: true }
      );
      return message;
    }

    if (!shouldUseCrashMergePipeline(options.payload, null, options.payload)) {
      if (messageContent) {
        await applyPassthroughLabels(message.id, messageContent);
      }
      await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
      return message;
    }

    // Add message to pending merge group with fixed timer from first message
    const mergeWindow = webhook.mergeWindowSeconds ?? 60;
    const mergeIdentity = extractCrashMergeIdentity(options.payload, null);
    const groupKey = mergeIdentity.groupKey || 'default';
    addMessageToPendingGroup(
      webhook.id,
      message.id,
      groupKey,
      mergeWindow,
      mergeIdentity.familyKey,
      mergeIdentity.kind
    );
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
  devMode = false,
  options: { forceCrashReview?: boolean } = {}
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
        await queueCrashReportMessengerNotifications(messageId, webhookLabel ?? 'Webhook', payloadForActions).catch((error) => {
          console.error('Failed to queue crash report messenger notifications:', error);
        });
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

      if (action.type === 'SLACK_RELAY') {
        const config = normalizeActionConfig(action.config);
        const slackUrl = getSlackWebhookUrlFromConfig(config);
        if (!slackUrl) {
          throw new Error('Slack incoming webhook is not connected.');
        }
        await sendSlackRelay(slackUrl, payloadForActions, config, messageId);
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

      if (action.type === 'CUSTOM_WEBHOOK') {
        const config = normalizeActionConfig(action.config);
        if (!config.customWebhookUrl) {
          throw new Error('Custom webhook POST URL is missing.');
        }
        await sendCustomWebhookRelay(config.customWebhookUrl, payloadForActions);
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
        await prisma.inboundWebhookActionRun.create({
          data: {
            messageId,
            actionId: action.id,
            status: 'SKIPPED',
            result: { note: 'ClawdBot integration has been removed.' },
            durationMs: Date.now() - startedAt
          }
        });
        summary.push({ actionId: action.id, status: 'SKIPPED' });
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
        if (!options.forceCrashReview && !looksLikeCrashReport(crashInput)) {
          await applyPassthroughLabels(messageId, crashInput);
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
          const shouldRetry = isTransientCrashReviewError(error);
          await prisma.inboundWebhookActionRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              durationMs: Date.now() - startedAt
            }
          });
          if (shouldRetry) {
            summary.push({ actionId: action.id, status: 'PENDING_REVIEW' });
            scheduleTransientCrashReviewRetry(messageId, error);
            break;
          }
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
  await applyLabelAutomationIfComplete(messageId);
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

function hasRelayableWebhookPayload(payload: unknown, rawBody: string | null): boolean {
  const messageContent = extractActualMessageContent(payload, rawBody);
  if (messageContent && messageContent.trim().length > 0) {
    return true;
  }

  if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
    return true;
  }

  if (payload === undefined || payload === null) {
    return false;
  }

  if (typeof payload === 'string') {
    return payload.trim().length > 0;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.length > 0;
  }

  if (Array.isArray(payload)) {
    return payload.length > 0;
  }

  if (typeof payload === 'object') {
    return Object.keys(payload as Record<string, unknown>).length > 0;
  }

  return true;
}

function stripLightMarkdown(value: string): string {
  return value.replace(/\*\*/g, '').replace(/__/g, '');
}

function canonicalizeReportText(value: string): string {
  return stripLightMarkdown(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createStableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isChunkedCrashSegment(value: string): boolean {
  if (extractChunkNumber(value) !== null) {
    return true;
  }
  return /\*?\*?Chunk\*?\*?\s*\[\d+\]/i.test(value);
}

function shouldCoalesceRepeatedReport(rawText: string): boolean {
  if (isChunkedCrashSegment(rawText)) {
    return false;
  }
  return detectQuestError(undefined, '', rawText);
}

function createRepeatedReportFingerprint(rawText: string): string | null {
  if (!shouldCoalesceRepeatedReport(rawText)) {
    return null;
  }

  const canonical = canonicalizeReportText(rawText);
  return canonical ? createStableHash(canonical) : null;
}

function readRepeatReportMetadata(
  payload: Record<string, unknown>,
  fallbackReceivedAt: Date
): RepeatReportMetadata {
  const raw = payload[INTAKE_REPEAT_META_KEY];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const occurrenceCount =
      typeof record.occurrenceCount === 'number' && Number.isSafeInteger(record.occurrenceCount)
        ? Math.max(1, record.occurrenceCount)
        : 1;
    return {
      fingerprint: typeof record.fingerprint === 'string' ? record.fingerprint : '',
      occurrenceCount,
      firstReceivedAt:
        typeof record.firstReceivedAt === 'string'
          ? record.firstReceivedAt
          : fallbackReceivedAt.toISOString(),
      lastReceivedAt:
        typeof record.lastReceivedAt === 'string'
          ? record.lastReceivedAt
          : fallbackReceivedAt.toISOString(),
      latestSourceIp: typeof record.latestSourceIp === 'string' ? record.latestSourceIp : null
    };
  }

  return {
    fingerprint: '',
    occurrenceCount: 1,
    firstReceivedAt: fallbackReceivedAt.toISOString(),
    lastReceivedAt: fallbackReceivedAt.toISOString(),
    latestSourceIp: null
  };
}

function payloadToObject(payload: Prisma.JsonValue): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>) };
  }
  return {};
}

function getStoredRepeatedReportFingerprint(message: {
  payload: Prisma.JsonValue;
  rawBody: string | null;
}): string | null {
  const payload = payloadToObject(message.payload);
  const rawMetadata = payload[INTAKE_REPEAT_META_KEY];
  if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    const fingerprint = (rawMetadata as Record<string, unknown>).fingerprint;
    if (typeof fingerprint === 'string' && fingerprint.length > 0) {
      return fingerprint;
    }
  }

  const content = extractActualMessageContent(message.payload, message.rawBody);
  return content ? createRepeatedReportFingerprint(content) : null;
}

async function coalesceRepeatedReportOccurrence(options: {
  webhookId: string;
  fingerprint: string;
  sourceIp: string | null;
}) {
  const cutoff = new Date(Date.now() - REPEATED_REPORT_COALESCE_WINDOW_SECONDS * 1000);
  const candidates = await prisma.inboundWebhookMessage.findMany({
    where: {
      webhookId: options.webhookId,
      archivedAt: null,
      receivedAt: { gte: cutoff }
    },
    orderBy: { receivedAt: 'desc' },
    take: REPEATED_REPORT_LOOKBACK_LIMIT,
    select: {
      id: true,
      payload: true,
      rawBody: true,
      receivedAt: true
    }
  });

  const existing = candidates.find(
    (message) => getStoredRepeatedReportFingerprint(message) === options.fingerprint
  );
  if (!existing) {
    return null;
  }

  const payload = payloadToObject(existing.payload);
  const existingMetadata = readRepeatReportMetadata(payload, existing.receivedAt);
  const now = new Date();
  payload[INTAKE_REPEAT_META_KEY] = {
    fingerprint: options.fingerprint,
    occurrenceCount: existingMetadata.occurrenceCount + 1,
    firstReceivedAt: existingMetadata.firstReceivedAt,
    lastReceivedAt: now.toISOString(),
    latestSourceIp: options.sourceIp
  } satisfies RepeatReportMetadata;

  return prisma.inboundWebhookMessage.update({
    where: { id: existing.id },
    data: {
      payload: payload as Prisma.InputJsonValue
    }
  });
}

function shouldUseCrashMergePipeline(
  payload: unknown,
  rawBody: string | null | undefined,
  fallbackPayload: unknown
): boolean {
  if (hasServerCrashReportPayload(payload, rawBody)) {
    return false;
  }

  const crashInput = buildCrashReviewInput(payload, rawBody, fallbackPayload);
  if (looksLikeExplicitPassthroughReport(crashInput)) {
    return false;
  }
  return looksLikeCrashReport(crashInput);
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

async function reviewCrashReportWithRetry(
  input: string,
  config: InboundWebhookActionConfig,
  options: CrashReviewRunOptions = {}
) {
  let attempt = 0;
  let lastError: unknown;
  const provider = options.provider ?? 'gemini';
  const model =
    provider === 'openai'
      ? options.model ?? OPENAI_ESCALATION_MODEL
      : options.model ?? config.crashModel;
  const useEqemuOracleContext =
    options.useEqemuOracleContext ?? (config.useEqemuOracleContext !== false);
  const oracleContext =
    !useEqemuOracleContext
      ? {
          promptText: '',
          telemetry: {
            enabled: false,
            available: false,
            selectedRecordIds: [],
            recordCount: 0,
            charCount: 0,
            lookupMs: 0,
            skippedReason: 'disabled'
          } satisfies EqemuOracleContextTelemetry
        }
      : getEqemuOracleContextForCrashReport(input);

  while (attempt < 2) {
    attempt += 1;
    try {
      const findings = await withTimeout(
        reviewCrashReport(input, {
          provider,
          model,
          maxInputChars: config.crashMaxInputChars,
          maxOutputTokens: config.crashMaxOutputTokens,
          temperature: config.crashTemperature,
          promptTemplate: config.crashPromptTemplate,
          eqemuOracleContext: oracleContext.promptText,
          eqemuOracleContextTelemetry: oracleContext.telemetry
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

function scheduleTransientCrashReviewRetry(
  messageId: string,
  originalError: unknown,
  retryAttempt = 1
): void {
  if (scheduledCrashReviewRetries.has(messageId)) {
    debugLog(`[CrashReviewRetry] Retry already scheduled for message ${messageId}`);
    return;
  }

  if (retryAttempt > AUTO_CRASH_REVIEW_MAX_SCHEDULED_RETRIES) {
    void sendRawCrashReportFallbackForMessage(messageId, originalError);
    return;
  }

  const delayMs =
    AUTO_CRASH_REVIEW_RETRY_DELAYS_MS[retryAttempt - 1] ??
    AUTO_CRASH_REVIEW_RETRY_DELAYS_MS[AUTO_CRASH_REVIEW_RETRY_DELAYS_MS.length - 1];
  debugLog(
    `[CrashReviewRetry] Scheduling retry ${retryAttempt}/${AUTO_CRASH_REVIEW_MAX_SCHEDULED_RETRIES} for message ${messageId} in ${delayMs}ms after transient failure: ${getErrorMessage(originalError)}`
  );
  void updateLatestCrashReviewSummary(messageId, 'PENDING_REVIEW').catch((error) => {
    console.error(`[CrashReviewRetry] Failed to mark retry pending for message ${messageId}:`, error);
  });

  const timer = setTimeout(() => {
    scheduledCrashReviewRetries.delete(messageId);
    void (async () => {
      try {
        const state = await getCrashReviewRunState(messageId);
        if (state !== 'needs-review') {
          debugLog(`[CrashReviewRetry] Skipping retry for message ${messageId}; state=${state}`);
          return;
        }

        await retryCrashReviewForMessage(messageId, {
          relayAfterReview: true,
          fallbackToDiscordOnFailure: false
        });
      } catch (error) {
        if (isTransientCrashReviewError(error) && retryAttempt < AUTO_CRASH_REVIEW_MAX_SCHEDULED_RETRIES) {
          scheduleTransientCrashReviewRetry(messageId, error, retryAttempt + 1);
          return;
        }

        console.error(
          `[CrashReviewRetry] Retry ${retryAttempt}/${AUTO_CRASH_REVIEW_MAX_SCHEDULED_RETRIES} failed for message ${messageId}; sending raw crash report fallback:`,
          error
        );
        await sendRawCrashReportFallbackForMessage(messageId, error);
      }
    })();
  }, delayMs);
  scheduledCrashReviewRetries.set(messageId, timer);
}

async function updateLatestCrashReviewSummary(
  messageId: string,
  status: 'SUCCESS' | 'FAILED' | 'PENDING_REVIEW' | 'SKIPPED'
): Promise<void> {
  const run = await prisma.inboundWebhookActionRun.findFirst({
    where: {
      messageId,
      action: { type: 'CRASH_REVIEW' }
    },
    select: { actionId: true },
    orderBy: { createdAt: 'desc' }
  });

  if (run) {
    await updateActionSummary(messageId, run.actionId, status);
  }
}

async function getCrashReviewRunState(
  messageId: string
): Promise<'complete' | 'pending' | 'needs-review'> {
  const run = await prisma.inboundWebhookActionRun.findFirst({
    where: {
      messageId,
      status: { in: ['SUCCESS', 'PENDING_REVIEW'] },
      action: { type: 'CRASH_REVIEW' }
    },
    select: { status: true },
    orderBy: { createdAt: 'desc' }
  });

  if (run?.status === 'SUCCESS') {
    return 'complete';
  }
  if (run?.status === 'PENDING_REVIEW') {
    return 'pending';
  }
  return 'needs-review';
}

function isTransientCrashReviewError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('"code":503') ||
    message.includes('code 503') ||
    message.includes('status code 503') ||
    message.includes('"status":"unavailable"') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('try again later') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('fetch failed')
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function buildCrashReviewInput(
  payload: unknown,
  rawBody: string | null | undefined,
  fallbackPayload: unknown
) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (typeof record.crash_report === 'string') {
      return record.crash_report;
    }
    if (typeof record.crashReportText === 'string') {
      return record.crashReportText;
    }
    const discordText = extractDiscordPayloadText(record);
    if (discordText) {
      return discordText;
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

async function getScriptErrorContext(
  payload: unknown,
  rawBody: string | null | undefined
): Promise<ScriptErrorContext | null> {
  const context = extractScriptErrorContext(payload, rawBody);
  if (!context) {
    return null;
  }

  if (context.npcTypeId && !context.npcName && isEqDbConfigured()) {
    const npcName = await lookupNpcTypeName(context.npcTypeId);
    if (npcName) {
      context.npcName = npcName;
      context.npcNameSource = 'eqDb';
    }
  }

  if (!context.zoneShortName && !context.zoneName && !context.npcTypeId && !context.npcName) {
    return null;
  }

  return context;
}

function extractScriptErrorContext(
  payload: unknown,
  rawBody: string | null | undefined
): ScriptErrorContext | null {
  const record = extractPayloadRecord(payload, rawBody ?? null);
  const text = buildCrashReviewInput(payload, rawBody, payload);
  const strippedText = stripLightMarkdown(text);
  const packageName = extractBracketValue(strippedText, 'Package');
  const scriptPath = extractQuestScriptPath(strippedText);
  const zoneToken =
    readFirstString(record, [
      'zone_short_name',
      'zoneShortName',
      'zone_shortname',
      'zoneShortname',
      'short_name',
      'zone'
    ]) ||
    extractBracketValue(strippedText, 'Zone') ||
    scriptPath?.zoneShortName ||
    null;
  const { zoneShortName, zoneName } = resolveScriptErrorZone(zoneToken);
  let npcTypeId =
    readFirstInteger(record, [
      'npc_type_id',
      'npcTypeId',
      'npcTypeID',
      'npc_typeid',
      'npcid',
      'npc_id'
    ]) ?? null;
  let npcName = readFirstString(record, [
    'npc_name',
    'npcName',
    'npc',
    'npc_display_name',
    'npcDisplayName'
  ]);
  let npcNameSource: ScriptErrorContext['npcNameSource'] = npcName ? 'payload' : null;

  const packageNpcToken = packageName?.match(/^qst_npc_(.+)$/i)?.[1] ?? null;
  if (packageNpcToken) {
    const packageNpcTypeId = parsePositiveInteger(packageNpcToken);
    if (packageNpcTypeId) {
      npcTypeId ??= packageNpcTypeId;
    } else if (!npcName) {
      npcName = formatNpcDisplayName(packageNpcToken, null);
      npcNameSource = 'payload';
    }
  }

  if (scriptPath?.fileStem) {
    const scriptNpcTypeId = parsePositiveInteger(scriptPath.fileStem);
    if (scriptNpcTypeId) {
      npcTypeId ??= scriptNpcTypeId;
    } else if (!npcName) {
      npcName = formatNpcDisplayName(scriptPath.fileStem, null);
      npcNameSource = 'scriptFile';
    }
  }

  if (npcName && parsePositiveInteger(npcName)) {
    npcTypeId ??= parsePositiveInteger(npcName);
    npcName = null;
    npcNameSource = null;
  } else if (npcName) {
    npcName = formatNpcDisplayName(npcName, null) ?? npcName;
  }

  const scriptFile = scriptPath
    ? `${scriptPath.zoneShortName ? `${scriptPath.zoneShortName}/` : ''}${scriptPath.fileStem}.pl`
    : null;

  if (!zoneShortName && !zoneName && !npcTypeId && !npcName && !packageName && !scriptFile) {
    return null;
  }

  return {
    zoneShortName,
    zoneName,
    npcTypeId,
    npcName,
    npcNameSource,
    scriptFile,
    packageName
  };
}

function extractBracketValue(text: string, label: string): string | null {
  const match = text.match(new RegExp(`${label}\\s*\\[([^\\]]+)\\]`, 'i'));
  return normalizeContextToken(match?.[1]);
}

function extractQuestScriptPath(text: string): { zoneShortName: string | null; fileStem: string } | null {
  const match = text.match(/(?:^|[\s"'`])\.?\/?quests[\\/]+([^\\/\s]+)[\\/]+([^\\/\s]+)\.pl\b/i);
  if (!match) {
    return null;
  }
  const fileStem = normalizeContextToken(match[2]);
  if (!fileStem) {
    return null;
  }
  return {
    zoneShortName: normalizeContextToken(match[1]),
    fileStem
  };
}

function resolveScriptErrorZone(value: string | null): Pick<ScriptErrorContext, 'zoneShortName' | 'zoneName'> {
  const normalized = normalizeContextToken(value);
  if (!normalized) {
    return { zoneShortName: null, zoneName: null };
  }
  const mappedName = staticZoneNameMap[normalized.toLowerCase()] ?? null;
  return {
    zoneShortName: normalized,
    zoneName: mappedName
  };
}

function normalizeContextToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripLightMarkdown(value)
    .replace(/^[\s[\]`"'{}()]+|[\s[\]`"'{}()]+$/g, '')
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function readFirstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = normalizeContextToken(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readFirstInteger(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = parsePositiveInteger(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  const text =
    typeof value === 'number' ? String(value) : normalizeContextToken(value)?.replace(/^#/, '');
  if (!text || !/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function lookupNpcTypeName(npcTypeId: number): Promise<string | null> {
  try {
    const rows = await queryEqDb<Array<{ name?: string | null; lastname?: string | null }>>(
      'SELECT name, lastname FROM npc_types WHERE id = ? LIMIT 1',
      [npcTypeId]
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return formatNpcDisplayName(row.name, row.lastname);
  } catch (error) {
    debugLog(`[Webhook Inbox] Failed to look up NPC type ${npcTypeId}:`, error);
    return null;
  }
}

function formatNpcDisplayName(name: string | null | undefined, lastname: string | null | undefined): string | null {
  const baseName = normalizeNpcNameToken(name);
  const lastName = normalizeNpcNameToken(lastname);
  const displayName = [baseName, lastName].filter(Boolean).join(' ');
  return displayName || null;
}

function normalizeNpcNameToken(value: unknown): string | null {
  const token = normalizeContextToken(value);
  if (!token) {
    return null;
  }
  const normalized = token.replace(/#/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
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

  if (looksLikeExplicitPassthroughReport(stripped)) {
    return false;
  }

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

type CrashTelemetryMessage = {
  id: string;
  webhookId: string;
  receivedAt: Date;
  payload: Prisma.JsonValue;
  rawBody: string | null;
  status: InboundWebhookMessageStatus;
  webhook: { id: string; label: string; intakeType: InboundWebhookIntakeType } | null;
  actionRuns: Array<{
    status: string;
    result: Prisma.JsonValue | null;
    createdAt: Date;
    action: { type: InboundWebhookActionType } | null;
  }>;
};

function buildCrashTelemetryGroups(reports: CrashTelemetryReport[]): CrashTelemetryVersionGroup[] {
  const groups = new Map<
    string,
    {
      serverVersion: string;
      compileDate: string | null;
      compileTime: string | null;
      platformName: string | null;
      latestServerName: string | null;
      latestOs: string | null;
      firstSeenAt: string;
      lastSeenAt: string;
      totalCrashes: number;
      reviewedCrashes: number;
      serverNames: Set<string>;
      fingerprints: Set<string>;
    }
  >();

  for (const report of reports) {
    const group = groups.get(report.serverVersion);
    const osLabel = formatCrashOs(report);
    if (!group) {
      groups.set(report.serverVersion, {
        serverVersion: report.serverVersion,
        compileDate: report.compileDate,
        compileTime: report.compileTime,
        platformName: report.platformName,
        latestServerName: report.serverName ?? report.serverShortName,
        latestOs: osLabel,
        firstSeenAt: report.receivedAt,
        lastSeenAt: report.receivedAt,
        totalCrashes: 1,
        reviewedCrashes: report.reviewStatus === 'SUCCESS' ? 1 : 0,
        serverNames: new Set([report.serverName, report.serverShortName].filter(Boolean) as string[]),
        fingerprints: new Set([report.fingerprint])
      });
      continue;
    }

    group.totalCrashes += 1;
    if (report.reviewStatus === 'SUCCESS') {
      group.reviewedCrashes += 1;
    }
    group.fingerprints.add(report.fingerprint);
    if (report.serverName) group.serverNames.add(report.serverName);
    if (report.serverShortName) group.serverNames.add(report.serverShortName);
    if (new Date(report.receivedAt).getTime() > new Date(group.lastSeenAt).getTime()) {
      group.lastSeenAt = report.receivedAt;
      group.latestServerName = report.serverName ?? report.serverShortName ?? group.latestServerName;
      group.latestOs = osLabel ?? group.latestOs;
      group.platformName = report.platformName ?? group.platformName;
      group.compileDate = report.compileDate ?? group.compileDate;
      group.compileTime = report.compileTime ?? group.compileTime;
    }
    if (new Date(report.receivedAt).getTime() < new Date(group.firstSeenAt).getTime()) {
      group.firstSeenAt = report.receivedAt;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      serverVersion: group.serverVersion,
      compileDate: group.compileDate,
      compileTime: group.compileTime,
      platformName: group.platformName,
      latestServerName: group.latestServerName,
      latestOs: group.latestOs,
      firstSeenAt: group.firstSeenAt,
      lastSeenAt: group.lastSeenAt,
      totalCrashes: group.totalCrashes,
      uniqueCrashes: group.fingerprints.size,
      reviewedCrashes: group.reviewedCrashes,
      affectedServers: group.serverNames.size
    }))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

function toCrashTelemetryReport(message: CrashTelemetryMessage): CrashTelemetryReport | null {
  const payloadRecord = extractPayloadRecord(message.payload, message.rawBody);
  if (!payloadRecord) {
    return null;
  }

  const crashReport = readString(payloadRecord, 'crash_report');
  if (!crashReport) {
    return null;
  }

  const serverVersion = readString(payloadRecord, 'server_version') ?? 'unknown';
  const latestReviewRun = getLatestCrashReviewRun(message.actionRuns);
  const latestReview = getLatestCrashReviewResult(message.actionRuns);
  const reviewSummary =
    latestReview && typeof latestReview.summary === 'string' ? latestReview.summary.trim() : null;

  return {
    id: message.id,
    messageId: message.id,
    webhookId: message.webhookId,
    webhookLabel: message.webhook?.label ?? null,
    receivedAt: message.receivedAt.toISOString(),
    status: message.status,
    fingerprint: createCrashFingerprint(crashReport),
    platformName: readString(payloadRecord, 'platform_name'),
    crashReport,
    serverVersion,
    compileDate: readString(payloadRecord, 'compile_date'),
    compileTime: readString(payloadRecord, 'compile_time'),
    serverName: readString(payloadRecord, 'server_name'),
    serverShortName: readString(payloadRecord, 'server_short_name'),
    uptimeSeconds: readNumber(payloadRecord, 'uptime'),
    osMachine: readString(payloadRecord, 'os_machine'),
    osRelease: readString(payloadRecord, 'os_release'),
    osVersion: readString(payloadRecord, 'os_version'),
    osSysname: readString(payloadRecord, 'os_sysname'),
    processId: readNumber(payloadRecord, 'process_id'),
    rssMemoryMb: readNumber(payloadRecord, 'rss_memory'),
    cpus: readNumber(payloadRecord, 'cpus'),
    originationInfo: readString(payloadRecord, 'origination_info'),
    lineCount: countLines(crashReport),
    reviewStatus: latestReviewRun?.status ?? null,
    reviewSummary
  };
}

function getLatestCrashReviewRun(
  runs: CrashTelemetryMessage['actionRuns']
): CrashTelemetryMessage['actionRuns'][number] | null {
  return runs.find((run) => run.action?.type === 'CRASH_REVIEW') ?? null;
}

function hasServerCrashReportPayload(
  payload: unknown,
  rawBody: string | null | undefined
): boolean {
  const record = extractPayloadRecord(payload, rawBody ?? null);
  return Boolean(record && readString(record, 'crash_report'));
}

function extractPayloadRecord(
  payload: unknown,
  rawBody: string | null | undefined
): Record<string, unknown> | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function createCrashFingerprint(crashReport: string): string {
  return createHash('sha256').update(crashReport).digest('hex');
}

function countLines(value: string): number {
  return value.split(/\r\n|\r|\n/).length;
}

function formatCrashOs(report: Pick<CrashTelemetryReport, 'osSysname' | 'osRelease' | 'osMachine'>): string | null {
  return [report.osSysname, report.osRelease, report.osMachine].filter(Boolean).join(' ') || null;
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

async function queueCrashReportMessengerNotifications(
  messageId: string,
  webhookLabel: string,
  payload: unknown
): Promise<void> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return;
  }

  const record = payload as Record<string, unknown>;
  const crashReview = record.crashReview;
  if (!crashReview || typeof crashReview !== 'object' || Array.isArray(crashReview)) {
    return;
  }

  const findings = crashReview as Record<string, unknown>;
  const errorType = findings.errorType === 'script_error' ? 'script_error' : 'crash';
  const messageUrl = clientBaseUrl
    ? `${clientBaseUrl}/admin/webhooks?messageId=${encodeURIComponent(messageId)}`
    : null;
  const notificationPayload = {
    messageId,
    webhookLabel,
    messageUrl,
    errorType,
    typeLabel: errorType === 'script_error' ? 'Script Error Report' : 'Crash Report',
    summary: typeof findings.summary === 'string' ? findings.summary : 'AI review completed.',
    signature:
      findings.signature && typeof findings.signature === 'object' && !Array.isArray(findings.signature)
        ? findings.signature
        : null,
    hypotheses: Array.isArray(findings.hypotheses) ? findings.hypotheses : [],
    recommendedNextSteps: Array.isArray(findings.recommendedNextSteps)
      ? findings.recommendedNextSteps
      : []
  };

  const admins = await prisma.user.findMany({
    where: { admin: true },
    select: { id: true }
  });

  await Promise.all(
    admins.map((admin) =>
      queueUserNotification({
        userId: admin.id,
        scopeType: 'GLOBAL',
        scopeId: 'global',
        eventKey: 'webhook.crash_error_report',
        payload: notificationPayload as Prisma.InputJsonValue,
        dedupeSeed: messageId
      })
    )
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('AI review request timed out.'));
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
    slackTemplate: typeof raw.slackTemplate === 'string' ? raw.slackTemplate : undefined,
    slackWebhookUrl:
      typeof raw.slackWebhookUrl === 'string'
        ? raw.slackWebhookUrl
        : typeof raw.webhookUrl === 'string'
          ? raw.webhookUrl
          : undefined,
    webhookUrl: typeof raw.webhookUrl === 'string' ? raw.webhookUrl : undefined,
    configurationUrl:
      typeof raw.configurationUrl === 'string' ? raw.configurationUrl : undefined,
    slackTeamId: typeof raw.slackTeamId === 'string' ? raw.slackTeamId : undefined,
    slackTeamName: typeof raw.slackTeamName === 'string' ? raw.slackTeamName : undefined,
    slackChannelId: typeof raw.slackChannelId === 'string' ? raw.slackChannelId : undefined,
    slackChannelName: typeof raw.slackChannelName === 'string' ? raw.slackChannelName : undefined,
    connectedAt: typeof raw.connectedAt === 'string' ? raw.connectedAt : undefined,
    customWebhookUrl: typeof raw.customWebhookUrl === 'string' ? raw.customWebhookUrl : undefined,
    crashModel: typeof raw.crashModel === 'string' ? raw.crashModel : undefined,
    crashMaxInputChars: typeof raw.crashMaxInputChars === 'number' ? raw.crashMaxInputChars : undefined,
    crashMaxOutputTokens:
      typeof raw.crashMaxOutputTokens === 'number' ? raw.crashMaxOutputTokens : undefined,
    crashTemperature: typeof raw.crashTemperature === 'number' ? raw.crashTemperature : undefined,
    crashPromptTemplate: typeof raw.crashPromptTemplate === 'string' ? raw.crashPromptTemplate : undefined,
    useEqemuOracleContext:
      typeof raw.useEqemuOracleContext === 'boolean' ? raw.useEqemuOracleContext : undefined,
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

async function sendSlackRelay(
  url: string,
  payload: unknown,
  config: InboundWebhookActionConfig,
  messageId?: string
) {
  const messageUrl =
    clientBaseUrl && messageId
      ? `${clientBaseUrl}/admin/webhooks?messageId=${encodeURIComponent(messageId)}`
      : null;
  const slackPayload = buildSlackRelayPayload(payload, config, messageUrl);
  await sendSlackIncomingWebhook(url, slackPayload);
}

function buildSlackRelayPayload(
  payload: unknown,
  config: InboundWebhookActionConfig,
  messageUrl: string | null
) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const crashReview = record.crashReview;
    if (crashReview && typeof crashReview === 'object' && !Array.isArray(crashReview)) {
      const findings = crashReview as Record<string, unknown>;
      const title =
        findings.errorType === 'script_error' ? 'Script Error Review' : 'Crash Review';
      const lines = [
        typeof findings.summary === 'string' ? findings.summary : 'AI review completed.',
        Array.isArray(findings.recommendedNextSteps) && findings.recommendedNextSteps.length > 0
          ? `Recommended next steps:\n${findings.recommendedNextSteps
              .slice(0, 5)
              .map((step, index) => `${index + 1}. ${String(step)}`)
              .join('\n')}`
          : null
      ].filter(Boolean);

      return buildSlackPayloadFromText({
        title,
        text: lines.join('\n\n'),
        url: messageUrl
      });
    }
  }

  return buildSlackPayloadFromUnknown(payload, {
    title: 'Webhook Payload',
    template: config.slackTemplate,
    messageUrl
  });
}

async function sendCustomWebhookRelay(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom webhook responded with ${response.status}: ${errorText}`);
  }
}

async function sendRawCrashReportFallbackForMessage(messageId: string, error: unknown): Promise<void> {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: {
        include: { actions: true }
      }
    }
  });

  if (!message?.webhook) {
    console.error(`[CrashReviewRetry] Could not send raw fallback; message ${messageId} was not found.`);
    return;
  }

  await sendRawCrashReportFallbackToDiscord(
    messageId,
    message.webhook,
    message.payload,
    message.rawBody,
    error,
    { retriesExhausted: true }
  );
  await prisma.inboundWebhookMessage.update({
    where: { id: messageId },
    data: { status: 'FAILED' }
  });
  await applyLabelAutomationIfComplete(messageId);
}

async function sendRawCrashReportFallbackToDiscord(
  messageId: string,
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
  payload: unknown,
  rawBody: string | null,
  error: unknown,
  options: { retriesExhausted?: boolean } = {}
) {
  const discordAction = webhook.actions.find(
    (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
  );
  if (!discordAction) {
    return;
  }

  const config = normalizeActionConfig(discordAction.config);
  const discordUrl = getDiscordUrl(config, webhook.devMode);
  if (!discordUrl) {
    return;
  }

  const fallbackPayload = buildRawCrashReportFallbackPayload(payload, rawBody);

  const startedAt = Date.now();
  try {
    await sendDiscordRelay(discordUrl, fallbackPayload, config, messageId);
    await prisma.inboundWebhookActionRun.create({
      data: {
        messageId,
        actionId: discordAction.id,
        status: 'SUCCESS',
        result: {
          note: options.retriesExhausted
            ? 'Raw crash report sent to Discord after AI review retries were exhausted.'
            : 'Raw crash report sent to Discord after AI review failure.',
          aiReviewError: getErrorMessage(error)
        },
        durationMs: Date.now() - startedAt
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
        durationMs: Date.now() - startedAt
      }
    });
    await updateActionSummary(messageId, discordAction.id, 'FAILED');
  }
}

function buildRawCrashReportFallbackPayload(payload: unknown, rawBody: string | null) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = { ...(payload as Record<string, unknown>) };
    delete record.crashReview;
    delete record.crashReviewAttempts;

    if (hasDiscordPayloadShape(record)) {
      delete record.crashReport;
    }

    return record;
  }

  const text = buildCrashReviewInput(payload, rawBody, payload);
  return text ? { content: truncateText(text, 1900) } : payload;
}

function hasDiscordPayloadShape(record: Record<string, unknown>): boolean {
  return (
    (typeof record.content === 'string' && record.content.trim().length > 0) ||
    (Array.isArray(record.embeds) && record.embeds.length > 0) ||
    (Array.isArray(record.files) && record.files.length > 0) ||
    (Array.isArray(record.attachments) && record.attachments.length > 0)
  );
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
  const telemetry = record.telemetry as {
    model?: string;
    attempts?: number;
    eqemuOracleContext?: { recordCount?: number };
  } | undefined;

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
  if (
    telemetry?.eqemuOracleContext &&
    typeof telemetry.eqemuOracleContext.recordCount === 'number' &&
    telemetry.eqemuOracleContext.recordCount > 0
  ) {
    footerParts.push(`Oracle refs: ${telemetry.eqemuOracleContext.recordCount}`);
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
  const whereMessage: Prisma.InboundWebhookMessageWhereInput = {
    archivedAt: null,
    readStatuses: {
      none: { userId }
    }
  };
  if (webhookId) {
    whereMessage.webhookId = webhookId;
  }
  applyInboxMessageVisibilityFilter(whereMessage);

  return prisma.inboundWebhookMessage.count({
    where: whereMessage
  });
}

export async function getPendingActionMessageCount() {
  return prisma.inboundWebhookMessage.count({
    where: {
      archivedAt: null,
      webhook: {
        is: {
          intakeType: {
            not: SERVER_CRASH_REPORT_INTAKE
          }
        }
      },
      actionRuns: {
        some: {
          status: 'PENDING_REVIEW'
        }
      }
    }
  });
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

export async function createWebhookLabel(input: {
  name: string;
  color: string;
  autoArchive?: boolean;
  autoDelete?: boolean;
}) {
  return prisma.webhookMessageLabel.create({
    data: {
      id: generateCuid(),
      name: input.name.trim(),
      color: input.color,
      autoArchive: input.autoArchive ?? false,
      autoDelete: input.autoDelete ?? false
    }
  });
}

// Standard label colors
const STANDARD_LABEL_COLORS: Record<string, string> = {
  'crash': '#dc2626',        // Red
  'script error': '#ea580c', // Orange
  'test': '#8b5cf6',         // Purple
  'live': '#059669',         // Green
  'passthrough': '#64748b',  // Slate
  'cheat': '#facc15'         // Yellow
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
  input: { name?: string; color?: string; sortOrder?: number; autoArchive?: boolean; autoDelete?: boolean }
) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.color !== undefined) data.color = input.color;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.autoArchive !== undefined) data.autoArchive = input.autoArchive;
  if (input.autoDelete !== undefined) data.autoDelete = input.autoDelete;

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

  await applyLabelAutomationIfComplete(messageId);
}

async function applyLabelAutomationIfComplete(messageId: string): Promise<void> {
  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      archivedAt: true,
      actionSummary: true,
      actionRuns: {
        select: { status: true }
      },
      labelAssignments: {
        include: { label: true }
      }
    }
  });

  if (!message) return;

  const hasPendingRun = message.actionRuns.some((run) => run.status === 'PENDING_REVIEW');
  const summary = Array.isArray(message.actionSummary)
    ? (message.actionSummary as Array<{ status?: unknown }>)
    : [];
  const hasPendingSummary = summary.some((entry) => entry?.status === 'PENDING_REVIEW');
  if (hasPendingRun || hasPendingSummary) return;

  const automationAction = resolveLabelAutomationAction(
    message.labelAssignments.map((assignment) => assignment.label)
  );
  if (automationAction === 'delete') {
    await prisma.inboundWebhookMessage.delete({
      where: { id: messageId }
    });
    return;
  }

  if (automationAction === 'archive' && !message.archivedAt) {
    await prisma.inboundWebhookMessage.update({
      where: { id: messageId },
      data: { archivedAt: new Date() }
    });
  }
}

function resolveLabelAutomationAction(
  labels: Array<{ autoArchive: boolean; autoDelete: boolean }>
): 'archive' | 'delete' | null {
  // Multiple labels can apply to one report. Delete is terminal, so it takes precedence
  // over archive when any matching label requests deletion.
  if (labels.some((label) => label.autoDelete)) return 'delete';
  if (labels.some((label) => label.autoArchive)) return 'archive';
  return null;
}

// Default label definitions
const DEFAULT_LABELS = {
  CRASH: { name: 'Crash', color: '#dc2626' },           // Red
  SCRIPT_ERROR: { name: 'Script Error', color: '#ea580c' }, // Orange
  TEST: { name: 'Test', color: '#8b5cf6' },             // Purple
  LIVE: { name: 'Live', color: '#059669' },             // Green
  PASSTHROUGH: { name: 'Passthrough', color: '#64748b' }, // Slate
  CHEAT: { name: 'Cheat', color: '#facc15' },           // Yellow
  DEBUG: { name: 'Debug', color: '#06b6d4' }            // Cyan
} as const;

type DefaultLabelType = keyof typeof DEFAULT_LABELS;

function getDefaultLabelSortOrder(type: DefaultLabelType): number {
  switch (type) {
    case 'CRASH':
    case 'SCRIPT_ERROR':
      return 1;
    case 'PASSTHROUGH':
    case 'CHEAT':
    case 'DEBUG':
      return 2;
    case 'TEST':
    case 'LIVE':
      return 3;
    default:
      return 0;
  }
}

// Get or create a default label
async function getOrCreateDefaultLabel(type: DefaultLabelType): Promise<string> {
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
        sortOrder: getDefaultLabelSortOrder(type)
      }
    });
  }

  return label.id;
}

async function addDefaultLabelsToMessage(
  messageId: string,
  labelTypes: DefaultLabelType[]
): Promise<string[]> {
  const uniqueTypes = Array.from(new Set(labelTypes));
  if (uniqueTypes.length === 0) return [];

  const labels = await Promise.all(
    uniqueTypes.map(async (type) => ({
      type,
      id: await getOrCreateDefaultLabel(type),
      name: DEFAULT_LABELS[type].name
    }))
  );

  await prisma.webhookMessageLabelAssignment.createMany({
    data: labels.map((label) => ({
      id: generateCuid(),
      messageId,
      labelId: label.id
    })),
    skipDuplicates: true
  });

  return labels.map((label) => label.name);
}

function looksLikeCheatReport(text: string): boolean {
  const stripped = text.replace(/\*\*/g, '').replace(/__/g, '');
  const lower = stripped.toLowerCase();
  return lower.includes('[cheat]') || /\bmqfastmem\b/i.test(stripped);
}

function looksLikeQuestDebugReport(text: string): boolean {
  const stripped = text.replace(/\*\*/g, '').replace(/__/g, '');
  return /\[quest debug\]/i.test(stripped);
}

function looksLikeClientLimitKickReport(text: string): boolean {
  const stripped = text.replace(/\*\*/g, '').replace(/__/g, '');
  return /\bkicked with \d+ of \d+ allowed clients detected on IP:/i.test(stripped);
}

function looksLikeExplicitPassthroughReport(text: string): boolean {
  return looksLikeQuestDebugReport(text) || looksLikeClientLimitKickReport(text);
}

async function applyPassthroughLabels(messageId: string, rawText: string): Promise<void> {
  try {
    const labelTypes: DefaultLabelType[] = ['PASSTHROUGH'];
    if (looksLikeCheatReport(rawText)) {
      labelTypes.push('CHEAT');
    }
    if (looksLikeQuestDebugReport(rawText)) {
      labelTypes.push('DEBUG');
    }

    const labelNames = await addDefaultLabelsToMessage(messageId, labelTypes);
    debugLog(`[WEBHOOK RECEIVE] Applied passthrough labels to message ${messageId}: [${labelNames.join(', ')}]`);
  } catch (error) {
    // Don't fail the whole process if passthrough labeling fails
    console.error('Passthrough labeling failed:', error);
  }
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

    if (looksLikeCrashReport(rawText)) {
      // Detect if this is a quest/script error vs crash using pattern matching.
      const isQuestError = detectQuestError(
        undefined, // No signature needed for pattern detection
        '',        // No summary needed
        rawText    // Raw text is sufficient for detection
      );

      // Add crash type label (Crash or Script Error) only for actual crash/script reports.
      const crashLabelId = await getOrCreateDefaultLabel(isQuestError ? 'SCRIPT_ERROR' : 'CRASH');
      labelsToAdd.push(crashLabelId);
      labelNames.push(isQuestError ? 'Script Error' : 'Crash');
    }

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
    if (labelsToAdd.length > 0) {
      await prisma.webhookMessageLabelAssignment.createMany({
        data: labelsToAdd.map((labelId) => ({
          id: generateCuid(),
          messageId,
          labelId
        })),
        skipDuplicates: true
      });
    }

    debugLog(`[WEBHOOK RECEIVE] Applied immediate labels to message ${messageId}: [${labelNames.join(', ')}]`);
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
    await tx.inboundWebhookMessage.create({
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
      webhook: result.webhook ? redactInboundWebhookActions(result.webhook) : result.webhook,
      actionRuns: result.actionRuns.map((run) => redactInboundWebhookActionRun(run)),
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
  const where: Prisma.InboundWebhookMessageWhereInput = {};
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
  applyInboxMessageVisibilityFilter(where);

  // Avoid Prisma relation-filter joins here because older webhook label migrations
  // created assignment columns with a different MySQL collation than message IDs.
  if (labelIds && labelIds.length > 0) {
    const matchingMessageIds = await getMessageIdsForWebhookLabelFilter(labelIds);
    if (matchingMessageIds.length === 0) {
      return { messages: [], total: 0 };
    }
    where.id = { in: matchingMessageIds };
  }

  // Starred filter
  if (starred === true) {
    where.stars = {
      some: { userId }
    };
  }

  if (readStatus === 'read') {
    where.readStatuses = {
      some: { userId }
    };
  } else if (readStatus === 'unread') {
    where.readStatuses = {
      none: { userId }
    };
  }

  const [messages, total] = await Promise.all([
    prisma.inboundWebhookMessage.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        webhookId: true,
        receivedAt: true,
        sourceIp: true,
        payload: true,
        rawBody: true,
        status: true,
        actionSummary: true,
        assignedAdminId: true,
        assignedAt: true,
        archivedAt: true,
        mergedFromIds: true,
        mergedAt: true,
        webhook: {
          select: {
            id: true,
            label: true,
            description: true,
            isEnabled: true,
            intakeType: true,
            token: true,
            retentionPolicy: true,
            mergeWindowSeconds: true,
            autoMerge: true,
            devMode: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            lastReceivedAt: true,
            actions: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        assignedAdmin: {
          select: { id: true, displayName: true, nickname: true, email: true }
        },
        actionRuns: {
          select: {
            id: true,
            messageId: true,
            actionId: true,
            status: true,
            error: true,
            result: true,
            durationMs: true,
            createdAt: true,
            action: true
          },
          orderBy: { createdAt: 'asc' }
        },
        labelAssignments: {
          include: { label: true }
        },
        testChangeLinks: {
          include: {
            linkedBy: {
              select: { id: true, displayName: true, nickname: true, email: true }
            },
            change: {
              select: {
                id: true,
                publicId: true,
                title: true,
                status: true,
                priority: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
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
    webhook: msg.webhook ? redactInboundWebhookActions(msg.webhook) : msg.webhook,
    headers: {},
    payload: msg.payload,
    rawBody: msg.rawBody,
    actionRuns: msg.actionRuns.map((run) => ({
      ...redactInboundWebhookActionRun(run),
      result: compactActionRunResult(run.result)
    })),
    isRead: msg.readStatuses.length > 0,
    isStarred: msg.stars.length > 0,
    labels: msg.labelAssignments.map((la) => la.label),
    linkedTestChanges: msg.testChangeLinks.map((link) => ({
      id: link.id,
      changeId: link.changeId,
      publicId: link.change.publicId,
      title: link.change.title,
      status: link.change.status,
      priority: link.change.priority,
      linkedAt: link.createdAt.toISOString(),
      linkedBy: link.linkedBy
    })),
    // Clean up internal fields
    readStatuses: undefined,
    stars: undefined,
    labelAssignments: undefined,
    testChangeLinks: undefined
  }));

  return { messages: enhancedMessages, total };
}

async function getMessageIdsForWebhookLabelFilter(labelIds: string[]): Promise<string[]> {
  const labelIdSql = Prisma.join(
    labelIds.map((labelId) => Prisma.sql`${labelId} COLLATE utf8mb4_unicode_ci`)
  );
  const rows = await prisma.$queryRaw<Array<{ messageId: string }>>`
    SELECT DISTINCT \`messageId\`
    FROM \`WebhookMessageLabelAssignment\`
    WHERE \`labelId\` COLLATE utf8mb4_unicode_ci IN (${labelIdSql})
  `;
  return rows.map((row) => row.messageId);
}

export async function enforceInboundWebhookRetention(now = new Date()) {
  const webhooks = await prisma.inboundWebhook.findMany({
    select: {
      id: true,
      retentionPolicy: true
    }
  });

  let deletedByAge = 0;
  let deletedByMaxCount = 0;

  for (const webhook of webhooks) {
    const policy = toRetentionPolicy(webhook.retentionPolicy);

    if (policy.mode === 'days') {
      const cutoff = new Date(now);
      cutoff.setUTCDate(cutoff.getUTCDate() - (policy.days ?? 30));
      const result = await prisma.inboundWebhookMessage.deleteMany({
        where: {
          webhookId: webhook.id,
          receivedAt: { lt: cutoff }
        }
      });
      deletedByAge += result.count;
      continue;
    }

    if (policy.mode === 'maxCount') {
      const keepCount = policy.maxCount ?? 5000;
      const oldestMessageToKeep = await prisma.inboundWebhookMessage.findFirst({
        where: { webhookId: webhook.id },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: keepCount - 1,
        select: { id: true, receivedAt: true }
      });

      if (!oldestMessageToKeep) {
        continue;
      }

      let hasMoreStaleMessages = true;
      while (hasMoreStaleMessages) {
        const staleMessages = await prisma.inboundWebhookMessage.findMany({
          where: {
            webhookId: webhook.id,
            OR: [
              { receivedAt: { lt: oldestMessageToKeep.receivedAt } },
              {
                receivedAt: oldestMessageToKeep.receivedAt,
                id: { lt: oldestMessageToKeep.id }
              }
            ]
          },
          orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
          take: RETENTION_DELETE_BATCH_SIZE,
          select: { id: true }
        });
        const ids = staleMessages.map((message) => message.id);
        if (ids.length === 0) {
          hasMoreStaleMessages = false;
          break;
        }
        const result = await prisma.inboundWebhookMessage.deleteMany({
          where: { id: { in: ids } }
        });
        deletedByMaxCount += result.count;
      }
    }
  }

  return {
    webhooksScanned: webhooks.length,
    deletedByAge,
    deletedByMaxCount
  };
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
  mergeWindowSeconds: number,
  familyKey: string | null = null,
  mergeKind: CrashMergeIdentityKind = 'unknown'
) {
  const now = new Date();
  let targetGroupKey = groupKey;
  let compositeKey = `${webhookId}:${groupKey}`;
  let matchedByFamily = false;
  const incomingFileGroupKey = getCrashFileGroupKey(groupKey, mergeKind);

  const familyGroup = findCompatibleCrashFamilyGroup(webhookId, familyKey, mergeKind, incomingFileGroupKey);
  if (familyGroup && familyGroup.groupKey !== groupKey) {
    targetGroupKey = familyGroup.groupKey;
    compositeKey = `${webhookId}:${targetGroupKey}`;
    matchedByFamily = true;
    familyGroup.mergeKind = mergeCrashIdentityKinds(familyGroup.mergeKind, mergeKind);
    if (!familyGroup.fileGroupKey && incomingFileGroupKey) {
      familyGroup.fileGroupKey = incomingFileGroupKey;
    }
    debugLog(
      `[Webhook ${webhookId}] Message ${messageId} group "${groupKey}" joined compatible crash family "${familyKey}" in group "${targetGroupKey}"`
    );
  }

  // If this message has no identifier ('default'), try to find an existing group for this webhook
  // This handles the case where only some chunks contain the crash filename
  if (!matchedByFamily && groupKey === 'default') {
    const existingWebhookGroup = findExistingGroupForWebhook(webhookId);
    if (existingWebhookGroup) {
      targetGroupKey = existingWebhookGroup.groupKey;
      compositeKey = `${webhookId}:${targetGroupKey}`;
      debugLog(`[Webhook ${webhookId}] Message ${messageId} has no identifier, joining existing group "${targetGroupKey}"`);
    }
  } else if (!matchedByFamily) {
    // This message HAS an identifier - check if there's a 'default' group we should merge into this one
    const defaultGroup = pendingMergeGroups.get(`${webhookId}:default`);
    if (defaultGroup) {
      // Move all messages from 'default' group to this new identified group
      debugLog(`[Webhook ${webhookId}] Found identifier "${groupKey}" - absorbing ${defaultGroup.messageIds.length} messages from 'default' group`);

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
        if (!existingGroup.familyKey && (familyKey || defaultGroup.familyKey)) {
          existingGroup.familyKey = familyKey ?? defaultGroup.familyKey;
        }
        if (!existingGroup.fileGroupKey && (incomingFileGroupKey || defaultGroup.fileGroupKey)) {
          existingGroup.fileGroupKey = incomingFileGroupKey ?? defaultGroup.fileGroupKey;
        }
        existingGroup.mergeKind = mergeCrashIdentityKinds(
          mergeCrashIdentityKinds(existingGroup.mergeKind, defaultGroup.mergeKind),
          mergeKind
        );
        debugLog(`[Webhook ${webhookId}] Merged into existing group "${groupKey}" (${existingGroup.messageIds.length} messages)`);
        return;
      } else {
        // Create new group with default group's messages + this message
        const expiresAt = defaultGroup.expiresAt; // Keep original expiry time
        const remainingMs = expiresAt.getTime() - now.getTime();

        const timer = setTimeout(() => {
          debugLog(`[Webhook ${webhookId}] Group "${groupKey}" timer FIRED at ${new Date().toISOString()}`);
          void processGroupWhenReady(compositeKey);
        }, Math.max(remainingMs, 1000)); // At least 1 second

        const group: PendingMergeGroup = {
          groupKey,
          familyKey: familyKey ?? defaultGroup.familyKey ?? null,
          fileGroupKey: incomingFileGroupKey ?? defaultGroup.fileGroupKey ?? null,
          mergeKind: mergeCrashIdentityKinds(defaultGroup.mergeKind, mergeKind),
          webhookId,
          messageIds: [...defaultGroup.messageIds, messageId],
          firstMessageAt: defaultGroup.firstMessageAt,
          expiresAt,
          timer,
          status: 'pending'
        };

        pendingMergeGroups.set(compositeKey, group);
        debugLog(`[Webhook ${webhookId}] Created group "${groupKey}" with ${group.messageIds.length} messages (absorbed from default)`);
        return;
      }
    }
  }

  const existingGroup = pendingMergeGroups.get(compositeKey);

  if (existingGroup) {
    // Add message to existing group - timer stays fixed from first message
    existingGroup.messageIds.push(messageId);
    if (!existingGroup.familyKey && familyKey) {
      existingGroup.familyKey = familyKey;
    }
    if (!existingGroup.fileGroupKey && incomingFileGroupKey) {
      existingGroup.fileGroupKey = incomingFileGroupKey;
    }
    existingGroup.mergeKind = mergeCrashIdentityKinds(existingGroup.mergeKind, mergeKind);
    debugLog(`[Webhook ${webhookId}] Added message ${messageId} to existing group "${targetGroupKey}" (${existingGroup.messageIds.length} messages, expires at ${existingGroup.expiresAt.toISOString()})`);
  } else {
    // Create new group with fixed timer
    const expiresAt = new Date(now.getTime() + mergeWindowSeconds * 1000);

    const timer = setTimeout(() => {
      debugLog(`[Webhook ${webhookId}] Group "${targetGroupKey}" timer FIRED at ${new Date().toISOString()}`);
      void processGroupWhenReady(compositeKey);
    }, mergeWindowSeconds * 1000);

    const group: PendingMergeGroup = {
      groupKey: targetGroupKey,
      familyKey,
      fileGroupKey: incomingFileGroupKey,
      mergeKind,
      webhookId,
      messageIds: [messageId],
      firstMessageAt: now,
      expiresAt,
      timer,
      status: 'pending'
    };

    pendingMergeGroups.set(compositeKey, group);
    debugLog(`[Webhook ${webhookId}] Created NEW group "${targetGroupKey}" with message ${messageId}, expires at ${expiresAt.toISOString()} (in ${mergeWindowSeconds}s)`);
  }
}

function mergeCrashIdentityKinds(
  left: CrashMergeIdentityKind,
  right: CrashMergeIdentityKind
): CrashMergeIdentityKind {
  if (left === right) {
    return left;
  }
  if (left === 'unknown') {
    return right;
  }
  if (right === 'unknown') {
    return left;
  }
  if (
    (left === 'file' && right === 'zone') ||
    (left === 'zone' && right === 'file') ||
    left === 'mixed' ||
    right === 'mixed'
  ) {
    return 'mixed';
  }
  return left;
}

function getCrashFileGroupKey(groupKey: string, kind: CrashMergeIdentityKind): string | null {
  return kind === 'file' ? groupKey : null;
}

function isCompatibleCrashFamilyGroup(
  group: PendingMergeGroup,
  incomingKind: CrashMergeIdentityKind,
  incomingFileGroupKey: string | null
): boolean {
  if (incomingKind === 'file') {
    if (group.fileGroupKey && group.fileGroupKey !== incomingFileGroupKey) {
      return false;
    }
    return group.mergeKind === 'zone' || group.mergeKind === 'mixed';
  }

  if (incomingKind === 'zone') {
    return group.mergeKind === 'file' || group.mergeKind === 'mixed';
  }

  if (incomingKind === 'mixed') {
    return group.mergeKind === 'file' || group.mergeKind === 'zone' || group.mergeKind === 'mixed';
  }

  return false;
}

function findCompatibleCrashFamilyGroup(
  webhookId: string,
  familyKey: string | null,
  incomingKind: CrashMergeIdentityKind,
  incomingFileGroupKey: string | null
): PendingMergeGroup | null {
  if (!familyKey || (incomingKind !== 'file' && incomingKind !== 'zone' && incomingKind !== 'mixed')) {
    return null;
  }

  const candidates: PendingMergeGroup[] = [];
  for (const group of pendingMergeGroups.values()) {
    if (
      group.webhookId === webhookId &&
      group.status === 'pending' &&
      group.familyKey === familyKey &&
      isCompatibleCrashFamilyGroup(group, incomingKind, incomingFileGroupKey)
    ) {
      candidates.push(group);
    }
  }

  if (candidates.length > 1) {
    debugLog(
      `[Webhook ${webhookId}] Crash family "${familyKey}" matched ${candidates.length} pending groups; keeping incoming group separate`
    );
    return null;
  }

  return candidates[0] ?? null;
}

/**
 * Find an existing pending group for a webhook (any group key).
 * Used when a message has no identifier but should probably join an existing group.
 */
function findExistingGroupForWebhook(webhookId: string): PendingMergeGroup | null {
  for (const group of pendingMergeGroups.values()) {
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
    debugLog(`[processGroupWhenReady] Group ${compositeKey} not found, already processed?`);
    return;
  }

  // Mark as processing (don't delete yet - keep showing in UI)
  group.status = 'processing';
  group.timer = null;
  debugLog(`[processGroupWhenReady] Group ${compositeKey} now processing`);

  try {
    await processSpecificGroup(group);
  } finally {
    // Remove from pending after processing completes
    pendingMergeGroups.delete(compositeKey);
    debugLog(`[processGroupWhenReady] Group ${compositeKey} processing complete, removed from pending`);
  }
}

/**
 * Manually trigger processing of a pending group (skip timer).
 */
export async function processGroupNow(webhookId: string, groupKey: string): Promise<boolean> {
  const compositeKey = `${webhookId}:${groupKey}`;
  const group = pendingMergeGroups.get(compositeKey);

  if (!group) {
    debugLog(`[processGroupNow] Group ${compositeKey} not found`);
    return false;
  }

  // Clear the timer and mark as processing
  if (group.timer) {
    clearTimeout(group.timer);
  }
  group.status = 'processing';
  group.timer = null;

  debugLog(`[Webhook ${webhookId}] Manually processing group "${groupKey}" with ${group.messageIds.length} messages`);

  try {
    await processSpecificGroup(group);
  } finally {
    // Remove from pending after processing completes
    pendingMergeGroups.delete(compositeKey);
    debugLog(`[processGroupNow] Group ${compositeKey} processing complete, removed from pending`);
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
function _scheduleDelayedProcessing(webhookId: string, mergeWindowSeconds: number) {
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
    debugLog(`[Webhook ${webhookId}] Group "${groupKey}" already processing, skipping`);
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
      debugLog(`[Webhook ${webhookId}] Webhook not found, skipping group "${groupKey}"`);
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
      debugLog(`[Webhook ${webhookId}] No messages found for group "${groupKey}" (already processed?)`);
      return;
    }

    debugLog(`[Webhook ${webhookId}] Processing group "${groupKey}" with ${messages.length} message(s), autoMerge=${webhook.autoMerge}`);

    if (messages.length === 1) {
      // Single message - process actions normally
      const message = messages[0];
      debugLog(`[Webhook ${webhookId}] Processing single message ${message.id}`);
      await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
    } else if (webhook.autoMerge) {
      // Multiple messages with auto-merge enabled - merge and process
      debugLog(`[Webhook ${webhookId}] Auto-merging ${messages.length} messages for "${groupKey}"`);
      try {
        await processAutoMergeGroup(messages, webhook);
      } catch (error) {
        console.error(`[Webhook ${webhookId}] Auto-merge failed for ${messages.length} messages:`, error);
        // Mark messages as PENDING_MERGE for manual intervention
        await markMessagesAsPendingMerge(messages.map(m => m.id));
      }
    } else {
      // Multiple messages without auto-merge - mark as pending merge decision
      debugLog(`[Webhook ${webhookId}] Marking ${messages.length} messages as pending merge (auto-merge disabled)`);
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
    debugLog(`[Webhook ${webhookId}] Already processing, skipping`);
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
      debugLog(`[Webhook ${webhookId}] Webhook not found, skipping`);
      return;
    }

    // Find all RECEIVED messages from this webhook within the merge window
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
      debugLog(`[Webhook ${webhookId}] No pending messages to process`);
      autoMergeRetryCounts.delete(retryKey);
      return;
    }

    debugLog(`[Webhook ${webhookId}] Processing ${pendingMessages.length} pending message(s), autoMerge=${webhook.autoMerge}`);

    // Group messages by crash file identifier (e.g., crash_xxx.log)
    // This ensures chunks from the same crash are merged together, while unrelated crashes stay separate
    const messageGroups = groupMessagesByCrashFile(pendingMessages);
    debugLog(`[Webhook ${webhookId}] Grouped into ${messageGroups.length} crash file group(s)`);

    for (const group of messageGroups) {
      const groupKey = extractCrashFileIdentifier(group[0].payload, group[0].rawBody) || 'unknown';
      debugLog(`[Webhook ${webhookId}] Processing group "${groupKey}" with ${group.length} message(s)`);

      if (group.length === 1) {
        // Single message - process actions normally
        const message = group[0];
        debugLog(`[Webhook ${webhookId}] Processing single message ${message.id}`);
        await runInboundWebhookActions(message.id, webhook.actions, message.payload, webhook.label, webhook.devMode);
      } else if (webhook.autoMerge) {
        // Multiple messages with auto-merge enabled - merge and process
        debugLog(`[Webhook ${webhookId}] Auto-merging ${group.length} messages for "${groupKey}"`);
        try {
          await processAutoMergeGroup(group, webhook);
        } catch (error) {
          console.error(`[Webhook ${webhookId}] Auto-merge failed for ${group.length} messages:`, error);
          // Mark messages as PENDING_MERGE for manual intervention
          await markMessagesAsPendingMerge(group.map(m => m.id));
        }
      } else {
        // Multiple messages without auto-merge - mark as pending merge decision
        debugLog(`[Webhook ${webhookId}] Marking ${group.length} messages as pending merge (auto-merge disabled)`);
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
        debugLog(`[Webhook ${webhookId}] Scheduling retry`);
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
      debugLog(`[Webhook ${webhookId}] Found ${newMessages.length} new message(s) that arrived during processing - will process shortly`);
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
    debugLog(`[Webhook ${webhook.id}] No Discord action configured, skipping notification`);
    return;
  }

  const config = normalizeActionConfig(discordAction.config);
  const discordUrl = getDiscordUrl(config, webhook.devMode);
  if (!discordUrl) {
    debugLog(`[Webhook ${webhook.id}] No Discord webhook URL configured, skipping notification`);
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
      debugLog(`[Webhook ${webhook.id}] Sent pending merge notification for ${messages.length} messages`);
    }
  } catch (error) {
    console.error(`[Webhook ${webhook.id}] Error sending pending merge notification:`, error);
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
  return extractCrashMergeIdentity(payload, rawBody).groupKey;
}

function extractCrashMergeIdentity(
  payload: unknown,
  rawBody: string | null
): CrashMergeIdentity {
  const text = extractTextForSorting(payload, rawBody);
  const strippedText = stripLightMarkdown(text);

  // Pattern 1: "File [crash_xxx.log]" format
  const fileMatch = strippedText.match(/File\s*\[([^\]]+\.log)\]/i);
  if (fileMatch) {
    const fileName = fileMatch[1];
    return {
      groupKey: fileName,
      familyKey: buildCrashZoneFamilyKey(extractCrashLogZone(fileName)),
      kind: 'file'
    };
  }

  // Pattern 2: Direct crash log filename pattern
  const crashLogMatch = strippedText.match(/(crash_[a-zA-Z0-9_]+\.log)/i);
  if (crashLogMatch) {
    const fileName = crashLogMatch[1];
    return {
      groupKey: fileName,
      familyKey: buildCrashZoneFamilyKey(extractCrashLogZone(fileName)),
      kind: 'file'
    };
  }

  // Pattern 3: Script error identifier - use stable quest error content if present
  const questScriptErrorMatch = strippedText.match(
    /\[QuestErrors?\]\s*Zone\s*\[([^\]]+)\]\s*Script Error\s*\|\s*Package\s*\[([^\]]+)\]\s*Event\s*\[([^\]]+)\]\s*Error\s*\[([^\]\n\r]+)/i
  );
  if (questScriptErrorMatch) {
    const [, zoneName, packageName, eventName, errorHead] = questScriptErrorMatch;
    const keySeed = canonicalizeReportText([zoneName, packageName, eventName, errorHead].join('|'));
    return {
      groupKey: `quest_error_${createStableHash(keySeed).slice(0, 16)}`,
      familyKey: null,
      kind: 'quest'
    };
  }

  const questErrorMatch = strippedText.match(/\[QuestErrors?\]\s*([^\n\r]+)/i);
  if (questErrorMatch) {
    const keySeed = canonicalizeReportText(questErrorMatch[1]);
    return {
      groupKey: `quest_error_${createStableHash(keySeed).slice(0, 16)}`,
      familyKey: null,
      kind: 'quest'
    };
  }

  // Pattern 4: Look for zone/server identifier in crash header
  const zoneMatch = strippedText.match(/\[Crash\]\s*Zone\s*\[([^\]]+)\]/i);
  if (zoneMatch) {
    const familyKey = buildCrashZoneFamilyKey(zoneMatch[1]);
    return {
      groupKey: familyKey,
      familyKey,
      kind: 'zone'
    };
  }

  return { groupKey: null, familyKey: null, kind: 'unknown' };
}

function extractCrashLogZone(fileName: string): string | null {
  const basename = fileName.split(/[\\/]/).pop() ?? fileName;
  const match = basename.match(/^crash_(.+?)_version_/i);
  return match ? normalizeCrashZoneToken(match[1]) : null;
}

function normalizeCrashZoneToken(value: string | null | undefined): string | null {
  const normalized = stripLightMarkdown(value ?? '')
    .replace(/[`'"]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase()
    .trim();
  return normalized || null;
}

function buildCrashZoneFamilyKey(zoneName: string | null | undefined): string | null {
  const zone = normalizeCrashZoneToken(zoneName);
  if (!zone) {
    return null;
  }
  return `crash_zone_${zone}`;
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
  const identities = new Map<string, CrashMergeIdentity>();
  const familyKinds = new Map<string, Set<CrashMergeIdentityKind>>();
  const familyFileKeys = new Map<string, Set<string>>();
  for (const message of messages) {
    const identity = extractCrashMergeIdentity(message.payload, message.rawBody);
    identities.set(message.id, identity);
    if (identity.familyKey) {
      const kinds = familyKinds.get(identity.familyKey) ?? new Set<CrashMergeIdentityKind>();
      kinds.add(identity.kind);
      familyKinds.set(identity.familyKey, kinds);

      if (identity.kind === 'file' && identity.groupKey) {
        const fileKeys = familyFileKeys.get(identity.familyKey) ?? new Set<string>();
        fileKeys.add(identity.groupKey);
        familyFileKeys.set(identity.familyKey, fileKeys);
      }
    }
  }

  const groups = new Map<string, typeof messages>();

  for (const message of messages) {
    const identity = identities.get(message.id) ?? {
      groupKey: null,
      familyKey: null,
      kind: 'unknown' as const
    };
    let key = identity.groupKey;

    if (identity.familyKey) {
      const kinds = familyKinds.get(identity.familyKey);
      const fileKeys = familyFileKeys.get(identity.familyKey);
      if (kinds?.has('file') && kinds.has('zone') && fileKeys?.size === 1) {
        key = identity.familyKey;
      }
    }

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
function _groupMessagesForMerge(messages: Array<{
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

function buildRepeatedPayloadMergeText(messages: Array<{
  payload: unknown;
  rawBody: string | null;
}>): string | null {
  if (messages.length < 2) {
    return null;
  }

  const texts = messages.map((message) => extractTextForSorting(message.payload, message.rawBody));
  const canonicalTexts = texts.map(canonicalizeReportText).filter(Boolean);
  if (canonicalTexts.length !== texts.length || new Set(canonicalTexts).size !== 1) {
    return null;
  }

  const representativeText = texts[0].trim();
  if (!representativeText) {
    return null;
  }

  return [
    representativeText,
    '',
    '--- Intake repeat summary ---',
    `Occurrences collapsed: ${messages.length}`,
    'Reason: identical webhook payloads received in the same merge group.'
  ].join('\n');
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
  const repeatedPayloadText = buildRepeatedPayloadMergeText(messages);
  if (repeatedPayloadText) {
    const mergedMessage = await mergeWebhookMessages(messages.map((message) => message.id), repeatedPayloadText);
    try {
      await retryCrashReviewForMessage(mergedMessage.id);
      debugLog(`[Auto-merge] Collapsed ${messages.length} identical repeated payloads into ${mergedMessage.id}`);
    } catch (error) {
      console.error('[Auto-merge] AI review failed after repeated payload collapse:', error);
    }
    return;
  }

  // Build segments for sorting
  const segments = messages.map(msg => ({
    id: msg.id,
    text: extractTextForSorting(msg.payload, msg.rawBody)
  }));

  const deterministicOrder = orderSegmentsByChunkNumber(segments);
  let orderedIds: string[];
  let removeIds: string[] = [];

  if (deterministicOrder) {
    orderedIds = deterministicOrder;
    debugLog(`[Auto-merge] Ordered ${orderedIds.length} segments by chunk markers without AI`);
  } else {
    try {
      const sortResult = await sortCrashReportSegments(segments);
      orderedIds = sortResult.orderedIds;
      removeIds = sortResult.removeIds;
    } catch (error) {
      console.error('Failed to sort crash segments:', error);
      throw error;
    }
  }

  // Filter out segments marked for removal
  const removeSet = new Set(removeIds);
  const orderedMessages = orderedIds
    .filter(id => !removeSet.has(id))
    .map(id => messages.find(m => m.id === id)!)
    .filter(Boolean);

  // If after removing duplicates we have 0-1 messages, handle appropriately
  if (orderedMessages.length === 0) {
    // All messages were duplicates - delete them all
    if (removeIds.length > 0) {
      await prisma.inboundWebhookMessage.deleteMany({
        where: { id: { in: removeIds } }
      });
    }
    return;
  }

  if (orderedMessages.length === 1) {
    // Only one message left after dedup - delete duplicates and process the single message
    if (removeIds.length > 0) {
      await prisma.inboundWebhookMessage.deleteMany({
        where: { id: { in: removeIds } }
      });
    }
    // Process the single message normally
    await runInboundWebhookActions(orderedMessages[0].id, webhook.actions, orderedMessages[0].payload, webhook.label, webhook.devMode);
    return;
  }

  // Delete duplicate/redundant messages identified by the sort
  if (removeIds.length > 0) {
    await prisma.inboundWebhookMessage.deleteMany({
      where: { id: { in: removeIds } }
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
    debugLog(`[Auto-merge] Completed: ${messageIds.length} messages merged into ${mergedMessage.id}`);
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
    // Native EQEmu Server crash telemetry posts the full report in snake_case.
    if (typeof record.crash_report === 'string' && record.crash_report.trim().length > 0) {
      return record.crash_report;
    }
    // Check for crashReportText (primary field for crash reports)
    if (typeof record.crashReportText === 'string' && record.crashReportText.trim().length > 0) {
      return record.crashReportText;
    }
    // Discord-style webhook payloads can split the visible report between content and embeds.
    const discordText = extractDiscordPayloadText(record);
    if (discordText) {
      return discordText;
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
    if (typeof record.crash_report === 'string') {
      return record.crash_report;
    }
    if (typeof record.crashReportText === 'string') {
      return record.crashReportText;
    }
    const discordText = extractDiscordPayloadText(record);
    if (discordText) {
      return discordText;
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

function extractDiscordPayloadText(record: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed.length === 0 || parts.includes(trimmed)) return;
    parts.push(trimmed);
  };

  add(record.message);
  add(record.content);
  add(record.text);
  add(record.body);

  if (Array.isArray(record.embeds)) {
    for (const embed of record.embeds) {
      if (!embed || typeof embed !== 'object' || Array.isArray(embed)) continue;
      const embedRecord = embed as Record<string, unknown>;
      add(embedRecord.title);
      add(embedRecord.description);

      if (Array.isArray(embedRecord.fields)) {
        for (const field of embedRecord.fields) {
          if (!field || typeof field !== 'object' || Array.isArray(field)) continue;
          const fieldRecord = field as Record<string, unknown>;
          const name = typeof fieldRecord.name === 'string' ? fieldRecord.name.trim() : '';
          const value = typeof fieldRecord.value === 'string' ? fieldRecord.value.trim() : '';
          if (name && value) {
            add(`${name}: ${value}`);
          } else {
            add(name || value);
          }
        }
      }

      if (embedRecord.footer && typeof embedRecord.footer === 'object' && !Array.isArray(embedRecord.footer)) {
        add((embedRecord.footer as Record<string, unknown>).text);
      }
      if (embedRecord.author && typeof embedRecord.author === 'object' && !Array.isArray(embedRecord.author)) {
        add((embedRecord.author as Record<string, unknown>).name);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

function extractChunkNumber(text: string): number | null {
  const patterns = [
    /\bChunk\D{0,12}(\d{1,4})\b/i,
    /\bSegment\D{0,12}(\d{1,4})\b/i,
    /\bPart\D{0,12}(\d{1,4})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(value) && value > 0) {
        return value;
      }
    }
  }

  return null;
}

function orderSegmentsByChunkNumber(segments: Array<{ id: string; text: string }>): string[] | null {
  const numbered = segments.map((segment) => ({
    id: segment.id,
    chunk: extractChunkNumber(segment.text)
  }));

  if (numbered.some((segment) => segment.chunk === null)) {
    return null;
  }

  const chunks = numbered.map((segment) => segment.chunk as number);
  const uniqueChunks = new Set(chunks);
  if (uniqueChunks.size !== chunks.length) {
    return null;
  }

  return [...numbered]
    .sort((a, b) => (a.chunk as number) - (b.chunk as number))
    .map((segment) => segment.id);
}

// Helper to generate CUID-like IDs
function generateCuid() {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `c${timestamp}${random}`;
}
