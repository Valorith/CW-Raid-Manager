import { randomBytes } from 'crypto';

import { CodexJobStatus, InboundWebhookActionType, Prisma } from '@prisma/client';

import {
  buildCodexCrashHandoffPayload,
  buildCrashReviewInput,
  looksLikeCrashReport
} from './inboundWebhookService.js';
import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const MAX_PROMPT_CONTEXT_CHARS = 180_000;

type CodexActionConfig = {
  slackCodexHandoffEnabled?: boolean;
  slackCodexRepository?: string;
  slackCodexBaseBranch?: string;
  slackCodexInstructions?: string;
};

type CodexJobRecord = Prisma.CodexJobGetPayload<{}>;

export type SerializedCodexJob = ReturnType<typeof serializeCodexJob>;

export function isCodexRunnerConfigured(): boolean {
  return Boolean(appConfig.codexRunner.token);
}

export function serializeCodexJob(job: CodexJobRecord) {
  return {
    id: job.id,
    messageId: job.messageId,
    status: job.status,
    targetRepository: job.targetRepository,
    baseBranch: job.baseBranch,
    branchName: job.branchName,
    runnerId: job.runnerId,
    statusMessage: job.statusMessage,
    error: job.error,
    output: job.output,
    prUrl: job.prUrl,
    prNumber: job.prNumber,
    claimedAt: job.claimedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

export async function createCodexJobForWebhookMessage(messageId: string, createdById?: string) {
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
  const branchName = buildBranchName(messageId);
  const sentAt = new Date();
  const context = buildCodexCrashHandoffPayload(message, crashReport, sentAt);
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
      targetRepository,
      baseBranch,
      branchName,
      prompt,
      context: context as Prisma.InputJsonValue,
      statusMessage: 'Queued for the VPS Codex runner.'
    }
  });

  return serializeCodexJob(job);
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
      'Valorith/Server',
    baseBranch:
      config.slackCodexBaseBranch?.trim() ||
      appConfig.codexRunner.baseBranch ||
      'master',
    instructions:
      config.slackCodexInstructions?.trim() ||
      appConfig.codexRunner.instructions
  };
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

function truncateForPrompt(value: string) {
  if (value.length <= MAX_PROMPT_CONTEXT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_PROMPT_CONTEXT_CHARS)}\n... truncated by Nexus ...`;
}
