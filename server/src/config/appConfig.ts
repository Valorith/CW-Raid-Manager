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
  CLIENT_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string().url()
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
  CLIENT_URL: process.env.CLIENT_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL
});

const fileConfig = loadFileConfig();

export const appConfig = {
  nodeEnv: env.NODE_ENV,
  host: fileConfig.server?.host ?? '0.0.0.0',
  port: fileConfig.server?.port ?? env.PORT,
  clientUrl: fileConfig.client?.baseUrl ?? env.CLIENT_URL,
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET,
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: fileConfig.auth?.google?.callbackUrl ?? env.GOOGLE_CALLBACK_URL
  }
} as const;
