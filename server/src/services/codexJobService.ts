import { createHash, randomBytes } from 'crypto';

import { CodexJobStatus, InboundWebhookActionType, Prisma } from '@prisma/client';

import {
  buildCodexCrashHandoffPayload,
  buildCrashReviewInput,
  looksLikeCrashReport
} from './inboundWebhookService.js';
import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const MAX_PROMPT_CONTEXT_CHARS = 180_000;
const DEFAULT_CODEX_REPOSITORY = 'Valorith/Server';
const DEFAULT_CODEX_BASE_BRANCH = 'master';
const CODEX_CRASH_SOURCE_TYPE = 'crash_report';
const RECENT_SUCCEEDED_DEDUPE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const TERMINAL_JOB_STATUSES = new Set<CodexJobStatus>([
  CodexJobStatus.SUCCEEDED,
  CodexJobStatus.FAILED,
  CodexJobStatus.CANCELED
]);
const ACTIVE_DEDUPE_JOB_STATUSES = [
  CodexJobStatus.QUEUED,
  CodexJobStatus.CLAIMED,
  CodexJobStatus.RUNNING
] as const;

type CodexActionConfig = {
  slackCodexHandoffEnabled?: boolean;
  slackCodexRepository?: string;
  slackCodexBaseBranch?: string;
  slackCodexInstructions?: string;
};

type CodexJobRecord = Prisma.CodexJobGetPayload<{}>;

export type SerializedCodexJob = ReturnType<typeof serializeCodexJob>;

export type CreateCodexJobForWebhookMessageResult = {
  job: SerializedCodexJob;
  deduped: boolean;
  dedupeKey: string;
  dedupeReason: 'active_job' | 'recent_pr' | null;
};

export function isCodexRunnerConfigured(): boolean {
  return Boolean(appConfig.codexRunner.token);
}

export function serializeCodexJob(
  job: CodexJobRecord,
  options: {
    includePrompt?: boolean;
    includeContext?: boolean;
    includeOutput?: boolean;
  } = {}
) {
  return {
    id: job.id,
    messageId: job.messageId,
    status: job.status,
    sourceType: job.sourceType,
    dedupeKey: job.dedupeKey,
    targetRepository: job.targetRepository,
    baseBranch: job.baseBranch,
    branchName: job.branchName,
    runnerId: job.runnerId,
    statusMessage: job.statusMessage,
    error: job.error,
    output: options.includeOutput === false ? null : job.output,
    prUrl: job.prUrl,
    prNumber: job.prNumber,
    result: job.result,
    ...(options.includePrompt ? { prompt: job.prompt } : {}),
    ...(options.includeContext ? { context: job.context } : {}),
    claimedAt: job.claimedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

export async function listCodexJobs(options: {
  statuses?: CodexJobStatus[];
  runnerId?: string;
  limit?: number;
} = {}) {
  const where: Prisma.CodexJobWhereInput = {};
  if (options.statuses?.length) {
    where.status = { in: options.statuses };
  }
  if (options.runnerId) {
    where.runnerId = options.runnerId;
  }

  const jobs = await prisma.codexJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(options.limit ?? 50, 1), 200)
  });

  return jobs.map((job) =>
    serializeCodexJob(job, {
      includeOutput: false
    })
  );
}

export async function getCodexJobMetrics(options: {
  days?: number;
  bucketHours?: number;
  runnerId?: string;
  repository?: string;
} = {}) {
  const days = clampNumber(options.days ?? 30, 1, 180);
  const bucketHours = clampNumber(options.bucketHours ?? chooseBucketHours(days), 1, 168);
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const where: Prisma.CodexJobWhereInput = {
    createdAt: { gte: start }
  };

  if (options.runnerId) {
    where.runnerId = options.runnerId;
  }
  if (options.repository) {
    where.targetRepository = options.repository;
  }

  const jobs = await prisma.codexJob.findMany({
    where,
    select: {
      id: true,
      status: true,
      sourceType: true,
      dedupeKey: true,
      targetRepository: true,
      baseBranch: true,
      runnerId: true,
      statusMessage: true,
      error: true,
      prUrl: true,
      messageId: true,
      context: true,
      claimedAt: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { createdAt: 'asc' },
    take: 10_000
  });

  const bucketMs = bucketHours * 60 * 60 * 1000;
  const buckets = buildMetricBuckets(start, now, bucketMs);
  const statusCounts = new Map<CodexJobStatus, number>();
  const sourceCounts = new Map<string, number>();
  const runnerCounts = new Map<string, number>();
  const repositoryCounts = new Map<string, number>();
  const dedupeCounts = new Map<
    string,
    {
      dedupeKey: string;
      jobs: number;
      duplicateMessages: number;
      latestAt: string;
    }
  >();
  const queueWaitDurations: number[] = [];
  const runDurations: number[] = [];
  const completionDurations: number[] = [];
  const recentFailures: Array<{
    id: string;
    status: CodexJobStatus;
    runnerId: string | null;
    targetRepository: string;
    baseBranch: string;
    statusMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }> = [];

  for (const status of Object.values(CodexJobStatus)) {
    statusCounts.set(status, 0);
  }

  for (const job of jobs) {
    statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);
    incrementCount(sourceCounts, normalizeJobSource(job.sourceType, job.messageId));
    incrementCount(runnerCounts, job.runnerId || 'unassigned');
    incrementCount(repositoryCounts, `${job.targetRepository}:${job.baseBranch}`);

    const bucket = buckets.find(
      (entry) => job.createdAt.getTime() >= entry.startMs && job.createdAt.getTime() < entry.endMs
    );
    if (bucket) {
      bucket.total += 1;
      bucket.statuses[job.status] += 1;
      if (job.prUrl) {
        bucket.prOpened += 1;
      }
      const completedMs = elapsedMs(job.createdAt, job.completedAt);
      if (completedMs !== null) {
        bucket.completionDurations.push(completedMs);
      }
    }

    const queueMs = elapsedMs(job.createdAt, job.claimedAt);
    const runMs = elapsedMs(job.startedAt, job.completedAt);
    const completionMs = elapsedMs(job.createdAt, job.completedAt);
    if (queueMs !== null) {
      queueWaitDurations.push(queueMs);
    }
    if (runMs !== null) {
      runDurations.push(runMs);
    }
    if (completionMs !== null) {
      completionDurations.push(completionMs);
    }

    if (job.dedupeKey) {
      const duplicateMessages = countDedupeRelatedMessages(job.context);
      const existing = dedupeCounts.get(job.dedupeKey);
      dedupeCounts.set(job.dedupeKey, {
        dedupeKey: job.dedupeKey,
        jobs: (existing?.jobs ?? 0) + 1,
        duplicateMessages: (existing?.duplicateMessages ?? 0) + duplicateMessages,
        latestAt:
          existing && existing.latestAt > job.createdAt.toISOString()
            ? existing.latestAt
            : job.createdAt.toISOString()
      });
    }

    if (job.status === CodexJobStatus.FAILED) {
      recentFailures.push({
        id: job.id,
        status: job.status,
        runnerId: job.runnerId,
        targetRepository: job.targetRepository,
        baseBranch: job.baseBranch,
        statusMessage: job.statusMessage || truncateMetricText(job.error || ''),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString()
      });
    }
  }

  const activeStatuses = [
    CodexJobStatus.QUEUED,
    CodexJobStatus.CLAIMED,
    CodexJobStatus.RUNNING
  ];
  const total = jobs.length;
  const succeeded = statusCounts.get(CodexJobStatus.SUCCEEDED) ?? 0;
  const failed = statusCounts.get(CodexJobStatus.FAILED) ?? 0;
  const terminal = succeeded + failed + (statusCounts.get(CodexJobStatus.CANCELED) ?? 0);
  const prOpened = jobs.filter((job) => Boolean(job.prUrl)).length;
  const dedupeRows = Array.from(dedupeCounts.values()).sort(
    (left, right) =>
      right.duplicateMessages - left.duplicateMessages ||
      right.jobs - left.jobs ||
      right.latestAt.localeCompare(left.latestAt)
  );

  return {
    generatedAt: now.toISOString(),
    window: {
      start: start.toISOString(),
      end: now.toISOString(),
      days,
      bucketHours
    },
    totals: {
      jobs: total,
      active: activeStatuses.reduce((sum, status) => sum + (statusCounts.get(status) ?? 0), 0),
      queued: statusCounts.get(CodexJobStatus.QUEUED) ?? 0,
      claimed: statusCounts.get(CodexJobStatus.CLAIMED) ?? 0,
      running: statusCounts.get(CodexJobStatus.RUNNING) ?? 0,
      succeeded,
      failed,
      canceled: statusCounts.get(CodexJobStatus.CANCELED) ?? 0,
      prOpened,
      successRate: terminal > 0 ? succeeded / terminal : null,
      prRate: total > 0 ? prOpened / total : null,
      avgQueueWaitMs: averageNumber(queueWaitDurations),
      avgRunMs: averageNumber(runDurations),
      avgCompletionMs: averageNumber(completionDurations)
    },
    byStatus: Object.values(CodexJobStatus).map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0
    })),
    bySource: mapToRows(sourceCounts, 'source'),
    byRunner: mapToRows(runnerCounts, 'runnerId'),
    byRepository: mapToRows(repositoryCounts, 'repository'),
    buckets: buckets.map((bucket) => ({
      start: new Date(bucket.startMs).toISOString(),
      end: new Date(bucket.endMs).toISOString(),
      total: bucket.total,
      queued: bucket.statuses.QUEUED,
      claimed: bucket.statuses.CLAIMED,
      running: bucket.statuses.RUNNING,
      succeeded: bucket.statuses.SUCCEEDED,
      failed: bucket.statuses.FAILED,
      canceled: bucket.statuses.CANCELED,
      prOpened: bucket.prOpened,
      avgCompletionMs: averageNumber(bucket.completionDurations)
    })),
    dedupe: {
      uniqueKeys: dedupeRows.length,
      duplicateMessages: dedupeRows.reduce((sum, row) => sum + row.duplicateMessages, 0),
      topKeys: dedupeRows.slice(0, 10)
    },
    recentFailures: recentFailures
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8)
  };
}

export async function getCodexJob(
  jobId: string,
  options: {
    includeDetail?: boolean;
  } = {}
) {
  const job = await prisma.codexJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error('Codex job not found.');
  }

  return serializeCodexJob(job, {
    includePrompt: options.includeDetail === true,
    includeContext: options.includeDetail === true
  });
}

export async function createAdHocCodexJob(input: {
  targetRepository?: string;
  baseBranch?: string;
  prompt: string;
  title?: string | null;
  createdById?: string | null;
}) {
  if (!isCodexRunnerConfigured()) {
    throw new Error('CODEX_RUNNER_TOKEN is not configured for Nexus.');
  }

  const targetRepository = normalizeRepository(
    input.targetRepository?.trim() ||
      appConfig.codexRunner.repository ||
      DEFAULT_CODEX_REPOSITORY
  );
  const baseBranch = normalizeGitRef(
    input.baseBranch?.trim() || appConfig.codexRunner.baseBranch || DEFAULT_CODEX_BASE_BRANCH,
    'base branch'
  );
  const title = normalizeTaskTitle(input.title || firstNonEmptyLine(input.prompt));
  const branchName = buildAdHocBranchName(title);
  const requestedAt = new Date();
  const context = {
    source: 'runner-dashboard',
    title,
    targetRepository,
    baseBranch,
    requestedAt: requestedAt.toISOString()
  };
  const prompt = buildAdHocCodexPrompt({
    targetRepository,
    baseBranch,
    branchName,
    title,
    instructions: appConfig.codexRunner.instructions,
    taskPrompt: input.prompt
  });

  const job = await prisma.codexJob.create({
    data: {
      createdById: input.createdById || undefined,
      status: CodexJobStatus.QUEUED,
      targetRepository,
      baseBranch,
      branchName,
      prompt,
      context,
      statusMessage: 'Queued from the VPS runner dashboard.'
    }
  });

  return serializeCodexJob(job);
}

export async function cancelCodexJob(jobId: string, reason?: string | null) {
  const existing = await prisma.codexJob.findUnique({
    where: { id: jobId }
  });

  if (!existing) {
    throw new Error('Codex job not found.');
  }
  if (TERMINAL_JOB_STATUSES.has(existing.status)) {
    throw new Error(`Codex job is already ${existing.status.toLowerCase()}.`);
  }

  const message = reason?.trim()
    ? `Canceled from the runner dashboard: ${reason.trim()}`
    : 'Canceled from the runner dashboard.';
  const job = await prisma.codexJob.update({
    where: { id: jobId },
    data: {
      status: CodexJobStatus.CANCELED,
      statusMessage: message,
      completedAt: new Date()
    }
  });

  return serializeCodexJob(job);
}

export async function retryCodexJob(jobId: string) {
  const existing = await prisma.codexJob.findUnique({
    where: { id: jobId }
  });

  if (!existing) {
    throw new Error('Codex job not found.');
  }
  if (existing.status !== CodexJobStatus.FAILED && existing.status !== CodexJobStatus.CANCELED) {
    throw new Error('Only failed or canceled Codex jobs can be retried.');
  }

  const branchName = existing.messageId
    ? buildBranchName(existing.messageId)
    : buildAdHocBranchName(firstNonEmptyLine(existing.statusMessage || existing.prompt));
  const job = await prisma.codexJob.create({
    data: {
      messageId: existing.messageId,
      createdById: existing.createdById,
      status: CodexJobStatus.QUEUED,
      sourceType: existing.sourceType,
      dedupeKey: existing.dedupeKey,
      targetRepository: existing.targetRepository,
      baseBranch: existing.baseBranch,
      branchName,
      prompt: existing.prompt.replace(
        /^Runner branch: .+$/m,
        `Runner branch: ${branchName}`
      ),
      context:
        existing.context === null
          ? Prisma.JsonNull
          : (existing.context as Prisma.InputJsonValue),
      statusMessage: `Queued as a retry of ${existing.id}.`,
      result: {
        retriedFromJobId: existing.id
      }
    }
  });

  return serializeCodexJob(job);
}

export async function createCodexJobForWebhookMessage(
  messageId: string,
  createdById?: string
): Promise<CreateCodexJobForWebhookMessageResult> {
  if (!isCodexRunnerConfigured()) {
    throw new Error('CODEX_RUNNER_TOKEN is not configured for Nexus.');
  }

  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: {
        include: {
          actions: {
            orderBy: [
              { sortOrder: 'asc' },
              { createdAt: 'asc' }
            ]
          }
        }
      },
      actionRuns: {
        include: {
          action: {
            select: { type: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!message) {
    throw new Error('Webhook message not found.');
  }

  const crashReport = buildCrashReviewInput(message.payload, message.rawBody, message.payload);
  if (!crashReport.trim()) {
    throw new Error('Crash report text is empty.');
  }
  if (!looksLikeCrashReport(crashReport)) {
    throw new Error('Only crash reports can be sent to Codex.');
  }

  const targetConfig = resolveCodexTargetConfig(message.webhook.actions);
  const targetRepository = normalizeRepository(targetConfig.repository);
  const baseBranch = normalizeGitRef(targetConfig.baseBranch, 'base branch');
  const dedupe = buildCrashDedupeMetadata({
    crashReport,
    targetRepository,
    baseBranch,
    aiReview: getLatestReviewFromActionRuns(message.actionRuns)
  });
  const existingDedupeJob = await findExistingCodexCrashDedupeJob({
    dedupeKey: dedupe.key,
    targetRepository,
    baseBranch
  });
  if (existingDedupeJob) {
    const job = await appendDuplicateCrashEvidence(existingDedupeJob.job, {
      messageId,
      receivedAt: message.receivedAt,
      reason: existingDedupeJob.reason,
      dedupeKey: dedupe.key
    });

    return {
      job: serializeCodexJob(job),
      deduped: true,
      dedupeKey: dedupe.key,
      dedupeReason: existingDedupeJob.reason
    };
  }

  const branchName = buildBranchName(messageId);
  const sentAt = new Date();
  const context = {
    ...buildCodexCrashHandoffPayload(message, crashReport, sentAt),
    dedupe: {
      key: dedupe.key,
      sourceType: CODEX_CRASH_SOURCE_TYPE,
      fingerprint: dedupe.fingerprint,
      signals: dedupe.signals
    }
  };
  const prompt = buildCodexPrompt({
    targetRepository,
    baseBranch,
    branchName,
    instructions: targetConfig.instructions,
    messageId,
    webhookLabel: message.webhook.label,
    receivedAt: message.receivedAt,
    context
  });

  const job = await prisma.codexJob.create({
    data: {
      messageId,
      createdById,
      status: CodexJobStatus.QUEUED,
      sourceType: CODEX_CRASH_SOURCE_TYPE,
      dedupeKey: dedupe.key,
      targetRepository,
      baseBranch,
      branchName,
      prompt,
      context: context as Prisma.InputJsonValue,
      statusMessage: 'Queued for the VPS Codex runner.'
    }
  });

  return {
    job: serializeCodexJob(job),
    deduped: false,
    dedupeKey: dedupe.key,
    dedupeReason: null
  };
}

export async function claimNextCodexJob(runnerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextJob = await prisma.codexJob.findFirst({
      where: { status: CodexJobStatus.QUEUED },
      orderBy: { createdAt: 'asc' }
    });

    if (!nextJob) {
      return null;
    }

    const claimed = await prisma.codexJob.updateMany({
      where: {
        id: nextJob.id,
        status: CodexJobStatus.QUEUED
      },
      data: {
        status: CodexJobStatus.CLAIMED,
        runnerId,
        claimedAt: new Date(),
        statusMessage: `Claimed by ${runnerId}.`
      }
    });

    if (claimed.count === 1) {
      const job = await prisma.codexJob.findUniqueOrThrow({
        where: { id: nextJob.id }
      });
      return {
        ...serializeCodexJob(job),
        prompt: job.prompt
      };
    }
  }

  return null;
}

export async function updateCodexJobFromRunner(
  jobId: string,
  runnerId: string,
  input: {
    status?: CodexJobStatus;
    statusMessage?: string | null;
    error?: string | null;
    output?: string | null;
    prUrl?: string | null;
    prNumber?: number | null;
    result?: Prisma.InputJsonValue | null;
  }
) {
  const existing = await prisma.codexJob.findUnique({
    where: { id: jobId }
  });

  if (!existing) {
    throw new Error('Codex job not found.');
  }

  if (existing.runnerId && existing.runnerId !== runnerId) {
    throw new Error('Codex job is claimed by a different runner.');
  }

  if (
    existing.status === CodexJobStatus.CANCELED &&
    input.status &&
    input.status !== CodexJobStatus.CANCELED
  ) {
    return serializeCodexJob(existing);
  }

  const now = new Date();
  const data: Prisma.CodexJobUpdateInput = {
    runnerId
  };

  if (input.status) {
    data.status = input.status;
    if (input.status === CodexJobStatus.RUNNING && !existing.startedAt) {
      data.startedAt = now;
    }
    if (
      input.status === CodexJobStatus.SUCCEEDED ||
      input.status === CodexJobStatus.FAILED ||
      input.status === CodexJobStatus.CANCELED
    ) {
      data.completedAt = now;
    }
  }

  if (input.statusMessage !== undefined) {
    data.statusMessage = input.statusMessage;
  }
  if (input.error !== undefined) {
    data.error = input.error;
  }
  if (input.output !== undefined) {
    data.output = input.output;
  }
  if (input.prUrl !== undefined) {
    data.prUrl = input.prUrl;
  }
  if (input.prNumber !== undefined) {
    data.prNumber = input.prNumber;
  }
  if (input.result !== undefined) {
    data.result = input.result === null ? Prisma.JsonNull : input.result;
  }

  const job = await prisma.codexJob.update({
    where: { id: jobId },
    data
  });

  return serializeCodexJob(job);
}

async function findExistingCodexCrashDedupeJob(options: {
  dedupeKey: string;
  targetRepository: string;
  baseBranch: string;
}): Promise<{ job: CodexJobRecord; reason: 'active_job' | 'recent_pr' } | null> {
  const activeJob = await prisma.codexJob.findFirst({
    where: {
      sourceType: CODEX_CRASH_SOURCE_TYPE,
      dedupeKey: options.dedupeKey,
      targetRepository: options.targetRepository,
      baseBranch: options.baseBranch,
      status: { in: [...ACTIVE_DEDUPE_JOB_STATUSES] }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (activeJob) {
    return { job: activeJob, reason: 'active_job' };
  }

  const recentSucceededJob = await prisma.codexJob.findFirst({
    where: {
      sourceType: CODEX_CRASH_SOURCE_TYPE,
      dedupeKey: options.dedupeKey,
      targetRepository: options.targetRepository,
      baseBranch: options.baseBranch,
      status: CodexJobStatus.SUCCEEDED,
      prUrl: { not: null },
      completedAt: {
        gte: new Date(Date.now() - RECENT_SUCCEEDED_DEDUPE_WINDOW_MS)
      }
    },
    orderBy: { completedAt: 'desc' }
  });

  return recentSucceededJob ? { job: recentSucceededJob, reason: 'recent_pr' } : null;
}

async function appendDuplicateCrashEvidence(
  job: CodexJobRecord,
  duplicate: {
    messageId: string;
    receivedAt: Date;
    reason: 'active_job' | 'recent_pr';
    dedupeKey: string;
  }
): Promise<CodexJobRecord> {
  if (job.messageId === duplicate.messageId) {
    return job;
  }

  const context = normalizeJsonObject(job.context);
  const dedupeContext = normalizeJsonObject(context.dedupe);
  const relatedMessages = Array.isArray(dedupeContext.relatedMessages)
    ? dedupeContext.relatedMessages.filter((entry): entry is Prisma.JsonObject =>
        Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      )
    : [];

  if (relatedMessages.some((entry) => entry.messageId === duplicate.messageId)) {
    return job;
  }

  const nextContext: Prisma.JsonObject = {
    ...context,
    dedupe: {
      ...dedupeContext,
      key: dedupeContext.key ?? duplicate.dedupeKey,
      sourceType: dedupeContext.sourceType ?? CODEX_CRASH_SOURCE_TYPE,
      relatedMessages: [
        ...relatedMessages,
        {
          messageId: duplicate.messageId,
          receivedAt: duplicate.receivedAt.toISOString(),
          linkedAt: new Date().toISOString(),
          reason: duplicate.reason
        }
      ]
    }
  };

  return prisma.codexJob.update({
    where: { id: job.id },
    data: {
      context: nextContext as Prisma.InputJsonValue
    }
  });
}

function getLatestReviewFromActionRuns(
  runs: Array<{
    status: string;
    result: Prisma.JsonValue | null;
    createdAt: Date;
    action: { type: InboundWebhookActionType } | null;
  }>
): Prisma.JsonObject | null {
  const run = runs.find(
    (candidate) => candidate.action?.type === InboundWebhookActionType.CRASH_REVIEW
  );
  return run?.result && typeof run.result === 'object' && !Array.isArray(run.result)
    ? (run.result as Prisma.JsonObject)
    : null;
}

function buildCrashDedupeMetadata(options: {
  crashReport: string;
  targetRepository: string;
  baseBranch: string;
  aiReview: Prisma.JsonObject | null;
}) {
  const signature = normalizeJsonObject(options.aiReview?.signature);
  const topApplicationFrame = findTopApplicationFrame(options.crashReport);
  const signals = [
    `source:${CODEX_CRASH_SOURCE_TYPE}`,
    `repository:${options.targetRepository.toLowerCase()}`,
    `base:${options.baseBranch.toLowerCase()}`,
    `exception:${normalizeCrashSignal(firstStringValue(signature.exception) || firstCrashLine(options.crashReport))}`,
    `top-frame:${normalizeCrashSignal(firstStringValue(signature.topFrame) || topApplicationFrame)}`,
    `quest:${normalizeCrashSignal(findQuestErrorLine(options.crashReport))}`,
    `modules:${normalizeModuleStack(options.crashReport).join('|')}`
  ].filter((signal) => !signal.endsWith(':') && !signal.endsWith(':unknown'));
  const fallback = normalizeCrashReportForDedupe(options.crashReport);
  const fingerprintInput = signals.length >= 4 ? signals.join('\n') : fallback;
  const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

  return {
    key: `crash:${fingerprint}`,
    fingerprint,
    signals
  };
}

function normalizeJsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...(value as Prisma.JsonObject) } as Prisma.JsonObject)
    : {};
}

function firstStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstCrashLine(crashReport: string): string {
  return crashReport
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function findQuestErrorLine(crashReport: string): string {
  return (
    crashReport
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.includes('[QuestErrors]')) || ''
  );
}

function findTopApplicationFrame(crashReport: string): string {
  const lines = crashReport.split(/\r?\n/).map((line) => line.trim());
  return (
    lines.find((line) => /(?:zone|world|ucs|queryserv|shared_memory|loginserver)\.exe:/i.test(line)) ||
    lines.find((line) => /\.(?:exe|dll):/i.test(line)) ||
    ''
  );
}

function normalizeModuleStack(crashReport: string): string[] {
  return crashReport
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\.(?:exe|dll):/i.test(line))
    .slice(0, 8)
    .map((line) => normalizeCrashSignal(line))
    .filter(Boolean);
}

function normalizeCrashReportForDedupe(crashReport: string): string {
  return crashReport
    .split(/\r?\n/)
    .map((line) => normalizeCrashSignal(line))
    .filter(Boolean)
    .slice(0, 120)
    .join('\n');
}

function normalizeCrashSignal(value: string): string {
  return value
    .toLowerCase()
    .replace(/0x[0-9a-f]+/gi, '0xaddr')
    .replace(/\b[0-9a-f]{8,}\b/gi, 'hex')
    .replace(/\b\d{5,}\b/g, 'num')
    .replace(/[a-z]:\\[^,\s)]+/gi, 'path')
    .replace(/\/[^\s,)]+/g, 'path')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCodexTargetConfig(
  actions: Array<{
    type: InboundWebhookActionType;
    isEnabled: boolean;
    config: Prisma.JsonValue;
  }>
) {
  const configuredAction = actions.find((action) => {
    if (action.type !== InboundWebhookActionType.SLACK_RELAY || !action.isEnabled) {
      return false;
    }
    return normalizeCodexActionConfig(action.config).slackCodexHandoffEnabled === true;
  });
  const config = configuredAction ? normalizeCodexActionConfig(configuredAction.config) : {};

  return {
    repository:
      config.slackCodexRepository?.trim() ||
      appConfig.codexRunner.repository ||
      DEFAULT_CODEX_REPOSITORY,
    baseBranch:
      config.slackCodexBaseBranch?.trim() ||
      appConfig.codexRunner.baseBranch ||
      DEFAULT_CODEX_BASE_BRANCH,
    instructions:
      config.slackCodexInstructions?.trim() ||
      appConfig.codexRunner.instructions
  };
}

function buildAdHocCodexPrompt(options: {
  targetRepository: string;
  baseBranch: string;
  branchName: string;
  title: string;
  instructions: string;
  taskPrompt: string;
}) {
  return [
    'You are Codex running from the Nexus VPS runner for an autonomous admin task.',
    '',
    `Target repository: ${options.targetRepository}`,
    `Base branch: ${options.baseBranch}`,
    `Runner branch: ${options.branchName}`,
    `Task title: ${options.title}`,
    '',
    'Required outcome:',
    '- Investigate the request below.',
    '- Implement the smallest safe change in the checked-out repository.',
    '- Run the relevant tests or build checks you can determine from the repo.',
    '- Leave all code changes in the working tree. The runner will commit, push the runner branch, and open the PR.',
    '',
    'Safety rules:',
    '- Do not push directly to the base branch.',
    '- Do not mutate production, shared databases, live services, or secrets.',
    '- Do not create the PR yourself; the Nexus runner owns the final commit, push, and PR creation.',
    `- ${options.instructions}`,
    '',
    'Admin task:',
    '```text',
    truncateForPrompt(options.taskPrompt.trim()),
    '```'
  ].join('\n');
}

function normalizeCodexActionConfig(config: unknown): CodexActionConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }
  const raw = config as Record<string, unknown>;
  return {
    slackCodexHandoffEnabled:
      typeof raw.slackCodexHandoffEnabled === 'boolean'
        ? raw.slackCodexHandoffEnabled
        : undefined,
    slackCodexRepository:
      typeof raw.slackCodexRepository === 'string' ? raw.slackCodexRepository : undefined,
    slackCodexBaseBranch:
      typeof raw.slackCodexBaseBranch === 'string' ? raw.slackCodexBaseBranch : undefined,
    slackCodexInstructions:
      typeof raw.slackCodexInstructions === 'string' ? raw.slackCodexInstructions : undefined
  };
}

function buildCodexPrompt(options: {
  targetRepository: string;
  baseBranch: string;
  branchName: string;
  instructions: string;
  messageId: string;
  webhookLabel: string | null;
  receivedAt: Date;
  context: Prisma.JsonObject;
}) {
  const contextJson = truncateForPrompt(JSON.stringify(options.context, null, 2));

  return [
    'You are Codex running from the Nexus VPS runner for an autonomous crash-fix workflow.',
    '',
    `Target repository: ${options.targetRepository}`,
    `Base branch: ${options.baseBranch}`,
    `Runner branch: ${options.branchName}`,
    `Nexus message ID: ${options.messageId}`,
    `Webhook label: ${options.webhookLabel ?? 'unknown'}`,
    `Received at: ${options.receivedAt.toISOString()}`,
    '',
    'Required outcome:',
    '- Investigate the crash report and related AI review below.',
    '- Implement the smallest safe fix in the checked-out repository.',
    '- Run the relevant tests or build checks you can determine from the repo.',
    '- Leave all code changes in the working tree. The runner will commit, push the runner branch, and open the PR.',
    '',
    'Safety rules:',
    '- Do not push directly to the base branch.',
    '- Do not mutate production, shared databases, live services, or secrets.',
    '- Do not create the PR yourself; the Nexus runner owns the final commit, push, and PR creation.',
    `- ${options.instructions}`,
    '',
    'Nexus crash context:',
    '```json',
    contextJson,
    '```'
  ].join('\n');
}

function buildBranchName(messageId: string) {
  const suffix = randomBytes(3).toString('hex');
  const messagePart = sanitizeGitRefSegment(messageId).slice(-12) || 'message';
  return `codex/nexus-crash-${messagePart}-${suffix}`;
}

function buildAdHocBranchName(title: string) {
  const suffix = randomBytes(3).toString('hex');
  const titlePart = sanitizeGitRefSegment(title.toLowerCase()).slice(0, 40) || 'task';
  return `codex/nexus-task-${titlePart}-${suffix}`;
}

function normalizeRepository(value: string) {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error('Codex target repository must use the owner/repo format.');
  }
  return trimmed;
}

function normalizeGitRef(value: string, label: string) {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('@{') ||
    trimmed.startsWith('/') ||
    trimmed.endsWith('/') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/.test(trimmed)
  ) {
    throw new Error(`Codex ${label} is not a safe Git ref.`);
  }
  return trimmed;
}

function sanitizeGitRefSegment(value: string) {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'Codex task';
}

function normalizeTaskTitle(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 120) || 'Codex task';
}

function truncateForPrompt(value: string) {
  if (value.length <= MAX_PROMPT_CONTEXT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_PROMPT_CONTEXT_CHARS)}\n... truncated by Nexus ...`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function chooseBucketHours(days: number) {
  if (days <= 2) {
    return 1;
  }
  if (days <= 14) {
    return 6;
  }
  return 24;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function normalizeJobSource(sourceType: string | null, messageId: string | null) {
  if (sourceType?.trim()) {
    return sourceType.trim();
  }
  return messageId ? 'webhook' : 'dashboard';
}

function buildMetricBuckets(start: Date, end: Date, bucketMs: number) {
  const first = Math.floor(start.getTime() / bucketMs) * bucketMs;
  const last = Math.ceil(end.getTime() / bucketMs) * bucketMs;
  const buckets: Array<{
    startMs: number;
    endMs: number;
    total: number;
    statuses: Record<CodexJobStatus, number>;
    prOpened: number;
    completionDurations: number[];
  }> = [];

  for (let startMs = first; startMs < last; startMs += bucketMs) {
    buckets.push({
      startMs,
      endMs: startMs + bucketMs,
      total: 0,
      statuses: {
        QUEUED: 0,
        CLAIMED: 0,
        RUNNING: 0,
        SUCCEEDED: 0,
        FAILED: 0,
        CANCELED: 0
      },
      prOpened: 0,
      completionDurations: []
    });
  }

  return buckets;
}

function elapsedMs(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return null;
  }
  const duration = end.getTime() - start.getTime();
  return duration >= 0 ? duration : null;
}

function averageNumber(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function mapToRows(map: Map<string, number>, keyName: string) {
  return Array.from(map.entries())
    .map(([key, count]) => ({
      [keyName]: key,
      count
    }))
    .sort((left, right) => {
      const leftCount = typeof left.count === 'number' ? left.count : 0;
      const rightCount = typeof right.count === 'number' ? right.count : 0;
      return rightCount - leftCount;
    });
}

function countDedupeRelatedMessages(context: Prisma.JsonValue | null) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return 0;
  }
  const dedupe = (context as Prisma.JsonObject).dedupe;
  if (!dedupe || typeof dedupe !== 'object' || Array.isArray(dedupe)) {
    return 0;
  }
  const relatedMessages = (dedupe as Prisma.JsonObject).relatedMessages;
  return Array.isArray(relatedMessages) ? relatedMessages.length : 0;
}

function truncateMetricText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 280 ? `${normalized.slice(0, 280)}...` : normalized || null;
}
