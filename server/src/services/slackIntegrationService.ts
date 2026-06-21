import { randomBytes } from 'crypto';

import {
  InboundWebhookActionType,
  type Prisma,
  SlackInstallTargetType,
  type GuildSlackWebhook
} from '@prisma/client';

import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const SLACK_INSTALL_SCOPE = 'incoming-webhook';
const INSTALL_SESSION_TTL_MS = 15 * 60 * 1000;

export interface SlackInstallStartResult {
  authorizeUrl: string;
  expiresAt: string;
}

export interface SlackWebhookConnectionSummary {
  hasSlackWebhook: boolean;
  configurationUrl: string | null;
  slackTeamId: string | null;
  slackTeamName: string | null;
  slackChannelId: string | null;
  slackChannelName: string | null;
  connectedAt: string | null;
}

export interface SlackIncomingWebhookConnection {
  webhookUrl: string;
  configurationUrl: string | null;
  slackTeamId: string | null;
  slackTeamName: string | null;
  slackChannelId: string | null;
  slackChannelName: string | null;
  connectedAt: string;
}

export interface SlackWebhookBody {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

type SlackAccessResponse = {
  ok?: boolean;
  error?: string;
  team?: {
    id?: string;
    name?: string;
  };
  incoming_webhook?: {
    url?: string;
    channel?: string;
    channel_id?: string;
    configuration_url?: string;
  };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringField(record: Record<string, unknown>, key: string): string | null {
  return readString(record[key]);
}

function cleanReturnPath(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }
  return trimmed.slice(0, 512);
}

function cleanMetadata(value?: Prisma.InputJsonValue | null): Prisma.InputJsonValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function ensureSlackConfigured() {
  if (!appConfig.slack) {
    throw new Error('Slack incoming webhook installs are not configured.');
  }
  return appConfig.slack;
}

function buildAuthorizeUrl(state: string): string {
  const slack = ensureSlackConfigured();
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', slack.clientId);
  url.searchParams.set('scope', SLACK_INSTALL_SCOPE);
  url.searchParams.set('redirect_uri', slack.callbackUrl);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function createSlackInstallSession(input: {
  createdById: string;
  targetType: SlackInstallTargetType;
  targetId?: string | null;
  returnPath?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}): Promise<SlackInstallStartResult> {
  ensureSlackConfigured();

  const state = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INSTALL_SESSION_TTL_MS);

  await prisma.slackInstallSession.create({
    data: {
      state,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      returnPath: cleanReturnPath(input.returnPath),
      metadata: cleanMetadata(input.metadata),
      createdById: input.createdById,
      expiresAt
    }
  });

  return {
    authorizeUrl: buildAuthorizeUrl(state),
    expiresAt: expiresAt.toISOString()
  };
}

export async function completeSlackInstall(input: {
  code: string;
  state: string;
}): Promise<{ returnPath: string | null }> {
  const session = await prisma.slackInstallSession.findUnique({
    where: { state: input.state }
  });

  if (!session) {
    throw new Error('Slack install session was not found.');
  }

  if (session.completedAt) {
    throw new Error('Slack install session has already been used.');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error('Slack install session has expired.');
  }

  const connection = await exchangeSlackCode(input.code);

  await prisma.$transaction(async (tx) => {
    if (session.targetType === SlackInstallTargetType.INBOUND_WEBHOOK_ACTION) {
      await applyInboundWebhookActionConnection(tx, session.targetId, connection);
    } else if (session.targetType === SlackInstallTargetType.TEST_MANAGER_SETTINGS) {
      await applyTestManagerSettingsConnection(tx, connection);
    } else if (session.targetType === SlackInstallTargetType.GUILD_SLACK_WEBHOOK) {
      await applyGuildSlackWebhookConnection(tx, session.targetId, connection);
    }

    await tx.slackInstallSession.update({
      where: { id: session.id },
      data: { completedAt: new Date() }
    });
  });

  return { returnPath: session.returnPath };
}

async function exchangeSlackCode(code: string): Promise<SlackIncomingWebhookConnection> {
  const slack = ensureSlackConfigured();
  const body = new URLSearchParams({
    code,
    redirect_uri: slack.callbackUrl
  });

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${slack.clientId}:${slack.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = (await response.json().catch(() => null)) as SlackAccessResponse | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ? `Slack OAuth failed: ${data.error}` : 'Slack OAuth failed.');
  }

  const webhookUrl = readString(data.incoming_webhook?.url);
  if (!webhookUrl) {
    throw new Error('Slack did not return an incoming webhook URL.');
  }

  return {
    webhookUrl,
    configurationUrl: readString(data.incoming_webhook?.configuration_url),
    slackTeamId: readString(data.team?.id),
    slackTeamName: readString(data.team?.name),
    slackChannelId: readString(data.incoming_webhook?.channel_id),
    slackChannelName: readString(data.incoming_webhook?.channel),
    connectedAt: new Date().toISOString()
  };
}

async function applyInboundWebhookActionConnection(
  tx: Prisma.TransactionClient,
  actionId: string | null,
  connection: SlackIncomingWebhookConnection
) {
  if (!actionId) {
    throw new Error('Slack install target action is missing.');
  }

  const action = await tx.inboundWebhookAction.findUnique({
    where: { id: actionId },
    select: { type: true, config: true }
  });

  if (!action || action.type !== InboundWebhookActionType.SLACK_RELAY) {
    throw new Error('Slack relay action was not found.');
  }

  await tx.inboundWebhookAction.update({
    where: { id: actionId },
    data: {
      config: {
        ...asObject(action.config),
        ...connection
      } as Prisma.InputJsonValue
    }
  });
}

async function applyTestManagerSettingsConnection(
  tx: Prisma.TransactionClient,
  connection: SlackIncomingWebhookConnection
) {
  const setting = await tx.systemSetting.findUnique({
    where: { key: 'testManager.rolePermissions' }
  });
  const current = setting ? parseJsonObject(setting.value) : {};
  const slackNotifications = asObject(current.slackNotifications);

  const next = {
    ...current,
    slackNotifications: {
      ...slackNotifications,
      enabled: true,
      webhookUrl: connection.webhookUrl,
      configurationUrl: connection.configurationUrl,
      slackTeamId: connection.slackTeamId,
      slackTeamName: connection.slackTeamName,
      slackChannelId: connection.slackChannelId,
      slackChannelName: connection.slackChannelName,
      connectedAt: connection.connectedAt
    }
  };

  await tx.systemSetting.upsert({
    where: { key: 'testManager.rolePermissions' },
    create: {
      key: 'testManager.rolePermissions',
      value: JSON.stringify(next)
    },
    update: {
      value: JSON.stringify(next)
    }
  });
}

async function applyGuildSlackWebhookConnection(
  tx: Prisma.TransactionClient,
  webhookId: string | null,
  connection: SlackIncomingWebhookConnection
) {
  if (!webhookId) {
    throw new Error('Slack guild webhook target is missing.');
  }

  await tx.guildSlackWebhook.update({
    where: { id: webhookId },
    data: {
      webhookUrl: connection.webhookUrl,
      configurationUrl: connection.configurationUrl,
      slackTeamId: connection.slackTeamId,
      slackTeamName: connection.slackTeamName,
      slackChannelId: connection.slackChannelId,
      slackChannelName: connection.slackChannelName,
      isEnabled: true
    }
  });
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    return asObject(JSON.parse(value) as unknown);
  } catch {
    return {};
  }
}

export function summarizeSlackConnectionFromConfig(
  config: unknown
): SlackWebhookConnectionSummary {
  const record = asObject(config);
  return {
    hasSlackWebhook: Boolean(readStringField(record, 'webhookUrl') || readStringField(record, 'slackWebhookUrl')),
    configurationUrl:
      readStringField(record, 'configurationUrl') ?? readStringField(record, 'slackConfigurationUrl'),
    slackTeamId: readStringField(record, 'slackTeamId'),
    slackTeamName: readStringField(record, 'slackTeamName'),
    slackChannelId: readStringField(record, 'slackChannelId'),
    slackChannelName: readStringField(record, 'slackChannelName'),
    connectedAt: readStringField(record, 'connectedAt') ?? readStringField(record, 'slackConnectedAt')
  };
}

export function redactSlackConfig(config: unknown): Record<string, unknown> {
  const record = { ...asObject(config) };
  const summary = summarizeSlackConnectionFromConfig(record);
  delete record.webhookUrl;
  delete record.slackWebhookUrl;
  return {
    ...record,
    slackConnection: summary
  };
}

export function serializeGuildSlackWebhook(
  webhook: GuildSlackWebhook
): Omit<GuildSlackWebhook, 'webhookUrl'> & SlackWebhookConnectionSummary {
  const { webhookUrl, ...safeWebhook } = webhook;
  return {
    ...safeWebhook,
    hasSlackWebhook: Boolean(webhookUrl?.trim()),
    configurationUrl: webhook.configurationUrl ?? null,
    slackTeamId: webhook.slackTeamId ?? null,
    slackTeamName: webhook.slackTeamName ?? null,
    slackChannelId: webhook.slackChannelId ?? null,
    slackChannelName: webhook.slackChannelName ?? null,
    connectedAt: webhook.updatedAt?.toISOString?.() ?? null
  };
}

export async function listGuildSlackWebhooks(guildId: string) {
  const webhooks = await prisma.guildSlackWebhook.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' }
  });
  return webhooks.map(serializeGuildSlackWebhook);
}

export async function createGuildSlackWebhook(
  guildId: string,
  createdById: string,
  input: {
    label: string;
    isEnabled?: boolean;
    eventSubscriptions?: Record<string, boolean>;
  }
) {
  const webhook = await prisma.guildSlackWebhook.create({
    data: {
      guildId,
      createdById,
      label: sanitizeLabel(input.label),
      isEnabled: input.isEnabled ?? true,
      eventSubscriptions: normalizeBooleanMap(input.eventSubscriptions) as Prisma.InputJsonValue
    }
  });
  return serializeGuildSlackWebhook(webhook);
}

export async function updateGuildSlackWebhook(
  webhookId: string,
  guildId: string,
  input: {
    label?: string;
    isEnabled?: boolean;
    eventSubscriptions?: Record<string, boolean>;
  }
) {
  const existing = await prisma.guildSlackWebhook.findUnique({
    where: { id: webhookId }
  });
  if (!existing || existing.guildId !== guildId) {
    throw new Error('Slack webhook not found.');
  }

  const webhook = await prisma.guildSlackWebhook.update({
    where: { id: webhookId },
    data: {
      label: input.label !== undefined ? sanitizeLabel(input.label) : undefined,
      isEnabled: input.isEnabled,
      eventSubscriptions:
        input.eventSubscriptions !== undefined
          ? (normalizeBooleanMap(input.eventSubscriptions) as Prisma.InputJsonValue)
          : undefined
    }
  });
  return serializeGuildSlackWebhook(webhook);
}

export async function deleteGuildSlackWebhook(webhookId: string, guildId: string) {
  const existing = await prisma.guildSlackWebhook.findUnique({
    where: { id: webhookId },
    select: { guildId: true }
  });
  if (!existing || existing.guildId !== guildId) {
    throw new Error('Slack webhook not found.');
  }
  await prisma.guildSlackWebhook.delete({ where: { id: webhookId } });
}

export async function disconnectGuildSlackWebhook(webhookId: string, guildId: string) {
  const existing = await prisma.guildSlackWebhook.findUnique({
    where: { id: webhookId }
  });
  if (!existing || existing.guildId !== guildId) {
    throw new Error('Slack webhook not found.');
  }

  const webhook = await prisma.guildSlackWebhook.update({
    where: { id: webhookId },
    data: {
      webhookUrl: null,
      configurationUrl: null,
      slackTeamId: null,
      slackTeamName: null,
      slackChannelId: null,
      slackChannelName: null,
      isEnabled: false
    }
  });

  return serializeGuildSlackWebhook(webhook);
}

export async function sendGuildSlackWebhookTest(webhookId: string, guildId: string) {
  const webhook = await prisma.guildSlackWebhook.findUnique({
    where: { id: webhookId },
    include: { guild: { select: { name: true } } }
  });
  if (!webhook || webhook.guildId !== guildId) {
    throw new Error('Slack webhook not found.');
  }
  if (!webhook.webhookUrl) {
    throw new Error('Slack incoming webhook is not connected.');
  }

  await sendSlackIncomingWebhook(
    webhook.webhookUrl,
    buildSlackPayloadFromText({
      title: 'CW Nexus Guild Slack Test',
      text: `Slack notifications are connected for ${webhook.guild.name}.`,
      url: null
    })
  );

  await prisma.guildSlackWebhook.update({
    where: { id: webhook.id },
    data: { lastSentAt: new Date() }
  });
}

function sanitizeLabel(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'Slack Webhook';
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, boolean> = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (typeof enabled === 'boolean') {
      result[key] = enabled;
    }
  }
  return result;
}

export async function sendSlackIncomingWebhook(
  webhookUrl: string,
  payload: SlackWebhookBody
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack responded with ${response.status}: ${errorText}`);
  }
}

export function buildSlackPayloadFromText(input: {
  title: string;
  text: string;
  url?: string | null;
}): SlackWebhookBody {
  const title = truncateSlackText(input.title, 150);
  const text = truncateSlackText(input.text, 2900);
  const titleText = input.url ? `<${input.url}|${escapeSlackText(title)}>` : `*${escapeSlackText(title)}*`;

  return {
    text: `${title}: ${text}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: titleText
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: escapeSlackText(text)
        }
      }
    ]
  };
}

export function convertDiscordWebhookToSlackPayload(payload: {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
    url?: string;
  }>;
}): SlackWebhookBody {
  const embed = payload.embeds?.[0];
  const title = embed?.title ?? 'CW Nexus Notification';
  const description = embed?.description ?? payload.content ?? '';
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: embed?.url
          ? `<${embed.url}|${escapeSlackText(title)}>`
          : `*${escapeSlackText(title)}*`
      }
    }
  ];

  if (description.trim()) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: escapeSlackText(truncateSlackText(description, 2900))
      }
    });
  }

  const fields = embed?.fields
    ?.slice(0, 10)
    .map((field) => ({
      type: 'mrkdwn',
      text: `*${escapeSlackText(field.name)}*\n${escapeSlackText(
        truncateSlackText(field.value, 900)
      )}`
    }));

  if (fields?.length) {
    blocks.push({
      type: 'section',
      fields
    });
  }

  if (embed?.footer?.text || embed?.timestamp) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: escapeSlackText(
            [embed.footer?.text, embed.timestamp ? new Date(embed.timestamp).toLocaleString() : null]
              .filter(Boolean)
              .join(' • ')
          )
        }
      ]
    });
  }

  return {
    text: truncateSlackText([title, description].filter(Boolean).join(' - '), 3000),
    blocks
  };
}

export function buildSlackPayloadFromUnknown(
  payload: unknown,
  options: { title?: string; template?: string; messageUrl?: string | null } = {}
): SlackWebhookBody {
  const title = options.title ?? 'Webhook Payload';
  const text = options.template
    ? options.template.replace(/\{\{json\}\}/g, safeJson(payload)).replace(/\{\{raw\}\}/g, safeJson(payload))
    : safeJson(payload);

  return buildSlackPayloadFromText({
    title,
    text,
    url: options.messageUrl
  });
}

export function getSlackWebhookUrlFromConfig(config: unknown): string | null {
  const record = asObject(config);
  return readStringField(record, 'webhookUrl') ?? readStringField(record, 'slackWebhookUrl');
}

export function getSlackConnectionPatch(
  connection: SlackIncomingWebhookConnection
): Record<string, unknown> {
  return {
    webhookUrl: connection.webhookUrl,
    configurationUrl: connection.configurationUrl,
    slackTeamId: connection.slackTeamId,
    slackTeamName: connection.slackTeamName,
    slackChannelId: connection.slackChannelId,
    slackChannelName: connection.slackChannelName,
    connectedAt: connection.connectedAt
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateSlackText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, Math.max(0, maxLength - 1))}…` : trimmed;
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
