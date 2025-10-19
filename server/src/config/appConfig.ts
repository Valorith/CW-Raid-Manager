import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { z } from 'zod';

const __dirname = dirname(fileURLToPath(new URL('.', import.meta.url)));

type FileConfig = {
  server?: {
    host?: string;
    port?: number;
  };
  client?: {
    baseUrl?: string;
  };
  auth?: {
    google?: {
      clientId?: string;
      clientSecret?: string;
      callbackUrl?: string;
    };
  };
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((value) => parseInt(value, 10)),
  CLIENT_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional()
});

function loadFileConfig(): FileConfig {
  const explicitPath = process.env.APP_CONFIG_PATH;
  const defaultPath = join(__dirname, '../../config/app.config.json');
  const pathToUse = explicitPath ?? defaultPath;

  if (!existsSync(pathToUse)) {
    return {};
  }

  try {
    const contents = readFileSync(pathToUse, 'utf-8');
    return JSON.parse(contents) as FileConfig;
  } catch (error) {
    console.warn('Failed to parse app.config.json. Falling back to environment variables.', error);
    return {};
  }
}

const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  CLIENT_URL:
    process.env.CLIENT_URL ??
    (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : undefined),
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL
});

const fileConfig = loadFileConfig();

if (!env.CLIENT_URL && !fileConfig.client?.baseUrl) {
  console.warn(
    'CLIENT_URL is not defined in the environment or app.config.json. Defaulting to http://localhost:5173.'
  );
}

const clientUrl = fileConfig.client?.baseUrl ?? env.CLIENT_URL ?? 'http://localhost:5173';

const googleClientId = env.GOOGLE_CLIENT_ID ?? fileConfig.auth?.google?.clientId;
const googleClientSecret = env.GOOGLE_CLIENT_SECRET ?? fileConfig.auth?.google?.clientSecret;
const googleCallbackUrl =
  env.GOOGLE_CALLBACK_URL ??
  fileConfig.auth?.google?.callbackUrl ??
  (clientUrl ? `${clientUrl.replace(/\/?$/, '')}/api/auth/google/callback` : undefined);

let googleConfig: {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
} | null = null;

if (googleClientId && !googleClientSecret) {
  console.warn('GOOGLE_CLIENT_SECRET is missing. Google OAuth will be disabled.');
}

if (googleClientSecret && !googleClientId) {
  console.warn('GOOGLE_CLIENT_ID is missing. Google OAuth will be disabled.');
}

if (googleClientId && googleClientSecret) {
  if (!googleCallbackUrl) {
    throw new Error(
      'Google OAuth requires GOOGLE_CALLBACK_URL or auth.google.callbackUrl in config/app.config.json.'
    );
  }

  googleConfig = {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    callbackUrl: googleCallbackUrl
  };
}

export const appConfig = {
  nodeEnv: env.NODE_ENV,
  host: fileConfig.server?.host ?? '0.0.0.0',
  port: fileConfig.server?.port ?? env.PORT,
  clientUrl,
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET,
  google: googleConfig
} as const;
