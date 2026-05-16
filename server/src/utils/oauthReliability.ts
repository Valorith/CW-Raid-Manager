import { setTimeout as sleep } from 'node:timers/promises';

import type { FastifyRequest } from 'fastify';

import { captureException } from './sentry.js';

export type OAuthProvider = 'google' | 'discord';

export type OAuthPhase =
  | 'token_exchange'
  | 'missing_access_token'
  | 'profile_fetch'
  | 'profile_parse'
  | 'db_upsert'
  | 'jwt_sign'
  | 'callback_unhandled';

const DEFAULT_MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 250;
const PROVIDER_FETCH_TIMEOUT_MS = 7000;
const MESSAGE_MAX_LENGTH = 240;

const TRANSIENT_ERROR_CODES = new Set([
  'ABORT_ERR',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
]);

export class OAuthProviderHttpError extends Error {
  constructor(
    readonly provider: OAuthProvider,
    readonly phase: OAuthPhase,
    readonly status: number,
    readonly statusText: string
  ) {
    super(`${provider} OAuth ${phase} returned HTTP ${status} ${statusText}`.trim());
    this.name = 'OAuthProviderHttpError';
  }
}

interface NormalizedOAuthError {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
}

interface OAuthRetryOptions {
  provider: OAuthProvider;
  phase: OAuthPhase;
  request: FastifyRequest;
  maxAttempts?: number;
}

interface OAuthCaptureOptions extends OAuthRetryOptions {
  extra?: Record<string, unknown>;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getStringProperty(value: unknown, keys: string[]): string | undefined {
  const record = getRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function getNumberProperty(value: unknown, keys: string[]): number | undefined {
  const record = getRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function findNestedStatus(error: unknown): number | undefined {
  const directStatus = getNumberProperty(error, ['status', 'statusCode']);
  if (directStatus) {
    return directStatus;
  }

  const record = getRecord(error);
  return (
    getNumberProperty(record?.response, ['status', 'statusCode']) ??
    getNumberProperty(record?.output, ['statusCode']) ??
    getNumberProperty(record?.data, ['status', 'statusCode']) ??
    getNumberProperty(record?.cause, ['status', 'statusCode'])
  );
}

function sanitizeMessage(message?: string): string | undefined {
  if (!message) {
    return undefined;
  }

  return message
    .replace(/([?&](?:code|state|access_token|refresh_token|id_token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .slice(0, MESSAGE_MAX_LENGTH);
}

function normalizeOAuthError(error: unknown): NormalizedOAuthError {
  const record = getRecord(error);
  const code =
    getStringProperty(error, ['code', 'errorCode']) ??
    getStringProperty(record?.cause, ['code', 'errorCode']);
  const message =
    error instanceof Error
      ? error.message
      : getStringProperty(error, ['message', 'error_description', 'error']);

  return {
    name: error instanceof Error ? error.name : getStringProperty(error, ['name']),
    message: sanitizeMessage(message),
    code,
    status: findNestedStatus(error)
  };
}

function isTransientHttpStatus(status?: number): boolean {
  return Boolean(status && (status === 408 || status === 425 || status === 429 || status >= 500));
}

function isTransientOAuthError(error: unknown): boolean {
  const normalized = normalizeOAuthError(error);
  const code = normalized.code?.toUpperCase();
  const name = normalized.name?.toUpperCase();
  const message = normalized.message?.toLowerCase() ?? '';

  return (
    isTransientHttpStatus(normalized.status) ||
    name === 'ABORTERROR' ||
    Boolean(code && TRANSIENT_ERROR_CODES.has(code)) ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('socket') ||
    message.includes('network') ||
    message.includes('fetch failed')
  );
}

function getOAuthCallbackSummary(request: FastifyRequest): Record<string, unknown> {
  const query = getRecord(request.query);
  const providerError = getStringProperty(query, ['error']);

  return {
    hasCode: typeof query?.code === 'string' && query.code.length > 0,
    hasState: typeof query?.state === 'string' && query.state.length > 0,
    providerError: providerError ? sanitizeMessage(providerError) : undefined,
    hasOAuthStateCookie: Boolean(request.cookies?.['oauth2-redirect-state']),
    hasPostAuthOriginCookie: Boolean(request.cookies?.cwraid_post_auth_origin),
    hasLinkUserCookie: Boolean(request.cookies?.cwraid_link_user),
    callbackHost: request.hostname,
    callbackProtocol: request.protocol
  };
}

export async function runOAuthOperationWithRetry<T>(
  operation: () => Promise<T>,
  options: OAuthRetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isTransientOAuthError(error)) {
        throw error;
      }

      const normalized = normalizeOAuthError(error);
      options.request.log.warn(
        {
          provider: options.provider,
          phase: options.phase,
          attempt,
          maxAttempts,
          errorName: normalized.name,
          errorCode: normalized.code,
          errorStatus: normalized.status
        },
        'Retrying transient OAuth operation'
      );

      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

export async function fetchOAuthProvider(
  request: FastifyRequest,
  provider: OAuthProvider,
  phase: OAuthPhase,
  url: string,
  init: RequestInit
): Promise<Response> {
  return runOAuthOperationWithRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal
        });

        if (isTransientHttpStatus(response.status)) {
          throw new OAuthProviderHttpError(provider, phase, response.status, response.statusText);
        }

        return response;
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      provider,
      phase,
      request,
      maxAttempts: 3
    }
  );
}

export function captureOAuthException(
  error: unknown,
  options: OAuthCaptureOptions
): NormalizedOAuthError {
  const normalized = normalizeOAuthError(error);
  const capturedError = new Error(
    `${options.provider} OAuth ${options.phase} failed${
      normalized.message ? `: ${normalized.message}` : ''
    }`
  );
  capturedError.name = normalized.name ?? 'OAuthError';

  captureException(capturedError, {
    provider: options.provider,
    phase: options.phase,
    errorName: normalized.name,
    errorCode: normalized.code,
    errorStatus: normalized.status,
    ...getOAuthCallbackSummary(options.request),
    ...options.extra
  });

  return normalized;
}
