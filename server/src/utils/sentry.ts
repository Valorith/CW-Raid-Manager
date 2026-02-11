import * as Sentry from '@sentry/node';

import { appConfig } from '../config/appConfig.js';

let initialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not set. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: appConfig.nodeEnv || 'production',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
    beforeSend(event, hint) {
      // Strip any sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      // Filter out expected HTTP errors (401, 403, 404) — not bugs
      const error = hint?.originalException;
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const code = (error as { statusCode: number }).statusCode;
        if (code === 401 || code === 403 || code === 404) return null;
      }
      return event;
    },
  });

  initialized = true;
  console.log(`[Sentry] Initialized (env: ${appConfig.nodeEnv})`);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

export { Sentry };
