import {
  OutboundWebhookEndpoint,
  OutboundWebhookEndpointService,
  Prisma
} from '@prisma/client';

import { buildCrashReviewInput } from './inboundWebhookService.js';
import { prisma } from '../utils/prisma.js';
import { resolvePublicClientBaseUrl } from '../utils/publicClientUrl.js';

const OUTBOUND_WEBHOOK_TIMEOUT_MS = 15000;
const DEFAULT_WEBHOOK_SECRET_HEADER_NAME = 'X-Webhook-Secret';
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface CreateOutboundWebhookEndpointInput {
  label: string;
  description?: string | null;
  service?: OutboundWebhookEndpointService;
  url: string;
  webhookSecret?: string | null;
  webhookSecretHeaderName?: string | null;
  isEnabled?: boolean;
  autoSendCrashTelemetry?: boolean;
}

export interface UpdateOutboundWebhookEndpointInput {
  label?: string;
  description?: string | null;
  service?: OutboundWebhookEndpointService;
  url?: string;
  webhookSecret?: string | null;
  webhookSecretHeaderName?: string | null;
  clearWebhookSecret?: boolean;
  isEnabled?: boolean;
  autoSendCrashTelemetry?: boolean;
}

export type SerializedOutboundWebhookEndpoint = Omit<
  OutboundWebhookEndpoint,
  'webhookSecret'
> & {
  hasWebhookSecret: boolean;
};

export interface DevinCrashWebhookSendResult {
  endpointId: string;
  endpointLabel: string;
  sentAt: string;
}

export async function listOutboundWebhookEndpoints() {
  const endpoints = await prisma.outboundWebhookEndpoint.findMany({
    orderBy: [
      { service: 'asc' },
      { label: 'asc' }
    ]
  });
  return endpoints.map(serializeOutboundWebhookEndpoint);
}

export async function createOutboundWebhookEndpoint(
  userId: string,
  input: CreateOutboundWebhookEndpointInput
) {
  const service = input.service ?? OutboundWebhookEndpointService.CUSTOM;
  const endpoint = await prisma.outboundWebhookEndpoint.create({
    data: {
      label: input.label.trim(),
      description: input.description?.trim() || null,
      service,
      url: normalizeEndpointUrl(input.url),
      webhookSecret: normalizeWebhookSecret(input.webhookSecret),
      webhookSecretHeaderName: normalizeWebhookSecretHeaderName(
        input.webhookSecretHeaderName
      ),
      isEnabled: input.isEnabled ?? true,
      autoSendCrashTelemetry:
        service === OutboundWebhookEndpointService.DEVIN
          ? input.autoSendCrashTelemetry ?? false
          : false,
      createdById: userId
    }
  });
  return serializeOutboundWebhookEndpoint(endpoint);
}

export async function updateOutboundWebhookEndpoint(
  endpointId: string,
  input: UpdateOutboundWebhookEndpointInput
) {
  const data: Prisma.OutboundWebhookEndpointUpdateInput = {};

  if (typeof input.label === 'string') {
    data.label = input.label.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.service) {
    data.service = input.service;
    if (input.service !== OutboundWebhookEndpointService.DEVIN) {
      data.autoSendCrashTelemetry = false;
    }
  }
  if (typeof input.url === 'string') {
    data.url = normalizeEndpointUrl(input.url);
  }
  if (input.clearWebhookSecret) {
    data.webhookSecret = null;
  } else if (input.webhookSecret !== undefined) {
    data.webhookSecret = normalizeWebhookSecret(input.webhookSecret);
  }
  if (input.webhookSecretHeaderName !== undefined) {
    data.webhookSecretHeaderName = normalizeWebhookSecretHeaderName(
      input.webhookSecretHeaderName
    );
  }
  if (typeof input.isEnabled === 'boolean') {
    data.isEnabled = input.isEnabled;
  }
  if (typeof input.autoSendCrashTelemetry === 'boolean') {
    data.autoSendCrashTelemetry =
      input.service === OutboundWebhookEndpointService.CUSTOM
        ? false
        : input.autoSendCrashTelemetry;
  }

  const endpoint = await prisma.outboundWebhookEndpoint.update({
    where: { id: endpointId },
    data
  });
  return serializeOutboundWebhookEndpoint(endpoint);
}

export async function deleteOutboundWebhookEndpoint(endpointId: string) {
  await prisma.outboundWebhookEndpoint.delete({
    where: { id: endpointId }
  });
}

export async function sendCrashReportToDevinEndpoint(
  messageId: string,
  options: {
    endpointId?: string;
    trigger?: 'manual' | 'automatic';
  } = {}
): Promise<DevinCrashWebhookSendResult> {
  const endpoint = await prisma.outboundWebhookEndpoint.findFirst({
    where: {
      id: options.endpointId,
      service: OutboundWebhookEndpointService.DEVIN,
      isEnabled: true
    },
    orderBy: [
      { lastSentAt: 'desc' },
      { createdAt: 'asc' }
    ]
  });

  if (!endpoint) {
    throw new Error('Devin outbound endpoint is not configured.');
  }

  const webhookSecret = endpoint.webhookSecret?.trim();
  if (!webhookSecret) {
    throw new Error('Devin webhook secret is not configured.');
  }

  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    include: {
      webhook: true
    }
  });

  if (!message) {
    throw new Error('Webhook message not found.');
  }

  const crashReport = buildCrashReviewInput(message.payload, message.rawBody, message.payload);
  if (!crashReport.trim()) {
    throw new Error('Crash report text is empty.');
  }

  const sentAt = new Date();
  const body = buildDevinCrashPayload(message, crashReport, sentAt, options.trigger ?? 'manual');

  await postJson(endpoint.url, body, {
    [endpoint.webhookSecretHeaderName || DEFAULT_WEBHOOK_SECRET_HEADER_NAME]: webhookSecret
  });

  await prisma.outboundWebhookEndpoint.update({
    where: { id: endpoint.id },
    data: { lastSentAt: sentAt }
  });

  return {
    endpointId: endpoint.id,
    endpointLabel: endpoint.label,
    sentAt: sentAt.toISOString()
  };
}

export async function tryAutoSendCrashTelemetryToDevin(messageId: string) {
  const endpoint = await prisma.outboundWebhookEndpoint.findFirst({
    where: {
      service: OutboundWebhookEndpointService.DEVIN,
      isEnabled: true,
      autoSendCrashTelemetry: true,
      webhookSecret: { not: null }
    },
    orderBy: [
      { lastSentAt: 'desc' },
      { createdAt: 'asc' }
    ],
    select: { id: true, label: true }
  });

  if (!endpoint) {
    return null;
  }

  try {
    return await sendCrashReportToDevinEndpoint(messageId, {
      endpointId: endpoint.id,
      trigger: 'automatic'
    });
  } catch (error) {
    console.error(
      `[OutboundWebhookEndpoint] Failed to auto-send crash telemetry ${messageId} to Devin endpoint ${endpoint.id} (${endpoint.label}):`,
      error
    );
    return null;
  }
}

function normalizeEndpointUrl(value: string) {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Outbound webhook URL must use HTTP or HTTPS.');
  }
  return trimmed;
}

function normalizeWebhookSecret(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWebhookSecretHeaderName(value?: string | null) {
  const trimmed = value?.trim() || DEFAULT_WEBHOOK_SECRET_HEADER_NAME;
  if (!HTTP_HEADER_NAME_PATTERN.test(trimmed)) {
    throw new Error('Webhook secret header name is not valid.');
  }
  return trimmed;
}

function serializeOutboundWebhookEndpoint(
  endpoint: OutboundWebhookEndpoint
): SerializedOutboundWebhookEndpoint {
  const { webhookSecret, ...safeEndpoint } = endpoint;
  return {
    ...safeEndpoint,
    hasWebhookSecret: Boolean(webhookSecret?.trim())
  };
}

function buildDevinCrashPayload(
  message: Prisma.InboundWebhookMessageGetPayload<{
    include: {
      webhook: true;
    };
  }>,
  crashReport: string,
  sentAt: Date,
  trigger: 'manual' | 'automatic'
): Prisma.JsonObject {
  const inboxUrl = buildInboxUrl(message.id);

  return {
    event: 'crash.fix_requested',
    schemaVersion: 2,
    source: 'cwraidmanager.webhook_inbox',
    trigger,
    sentAt: sentAt.toISOString(),
    task: buildDevinTaskText(message, inboxUrl),
    message: {
      id: message.id,
      webhookId: message.webhookId,
      webhookLabel: message.webhook?.label ?? null,
      receivedAt: message.receivedAt.toISOString(),
      inboxUrl
    },
    telemetry: {
      crashReport,
      originalPayload: message.payload,
      rawBody: message.rawBody
    }
  };
}

function buildDevinTaskText(
  message: { id: string; webhook?: { label: string | null } | null },
  inboxUrl: string | null
) {
  const lines = [
    'Investigate and fix this EQEmu server crash using only the crash telemetry included in this webhook payload.',
    'Derive the root cause from the telemetry and source code; do not assume a preexisting diagnosis.',
    `Webhook inbox message: ${message.id}`,
    message.webhook?.label ? `Endpoint: ${message.webhook.label}` : null,
    inboxUrl ? `Nexus inbox link: ${inboxUrl}` : null
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function buildInboxUrl(messageId: string) {
  const baseUrl = resolvePublicClientBaseUrl('Devin crash handoff links');
  if (!baseUrl) return null;
  const url = new URL('/admin/webhooks', baseUrl);
  url.searchParams.set('messageId', messageId);
  return url.toString();
}

async function postJson(
  url: string,
  body: Prisma.JsonObject,
  extraHeaders: Record<string, string> = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTBOUND_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Outbound webhook responded with ${response.status}: ${errorText}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Outbound webhook request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
