import { appConfig } from '../config/appConfig.js';

const warnedPurposes = new Set<string>();

export function resolvePublicClientBaseUrl(purpose = 'Discord webhook links'): string | null {
  const candidates = [
    process.env.DISCORD_PUBLIC_CLIENT_URL,
    process.env.PUBLIC_CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.WEB_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
    process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : undefined,
    process.env.RENDER_EXTERNAL_URL,
    process.env.DEPLOYMENT_URL,
    process.env.CLIENT_URL,
    appConfig.clientUrl
  ];

  const nonLocal = candidates
    .map((value) => normalizePublicClientBaseUrl(value))
    .filter((value): value is string => Boolean(value))
    .find((value) => !isLocalClientBaseUrl(value));

  if (nonLocal) {
    return nonLocal;
  }

  if (!warnedPurposes.has(purpose)) {
    warnedPurposes.add(purpose);
    console.warn(
      `${purpose}: no non-local public client URL is configured; Discord messages will omit direct app links instead of using localhost. Set DISCORD_PUBLIC_CLIENT_URL or PUBLIC_CLIENT_URL to the live site URL.`
    );
  }

  return null;
}

function normalizePublicClientBaseUrl(value?: string | null): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isLocalClientBaseUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('127.') ||
      hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}
