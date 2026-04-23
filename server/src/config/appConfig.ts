import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { z } from 'zod';

const __dirname = dirname(fileURLToPath(new URL('.', import.meta.url)));

const fileConfigSchema = z
  .object({
    server: z
      .object({
        host: z.string().min(1).optional(),
        port: z.number().int().positive().optional()
      })
      .optional(),
    client: z
      .object({
        baseUrl: z.string().url().optional()
      })
      .optional(),
    database: z
      .object({
        url: z.string().min(1).optional()
      })
      .optional(),
    eqDatabase: z
      .object({
        host: z.string().min(1).optional(),
        port: z.number().int().positive().optional(),
        user: z.string().min(1).optional(),
        password: z.string().optional(),
        name: z.string().min(1).optional(),
        poolLimit: z.number().int().positive().optional()
      })
      .optional(),
    session: z
      .object({
        secret: z.string().min(16).optional()
      })
      .optional(),
    auth: z
      .object({
        google: z
          .object({
            clientId: z.string().min(1).optional(),
            clientSecret: z.string().min(1).optional(),
            callbackUrl: z.string().url().optional()
          })
          .optional()
      })
      .optional(),
    notifications: z
      .object({
        telegram: z
          .object({
            botToken: z.string().min(1).optional(),
            botUsername: z.string().min(1).optional(),
            webhookUrl: z.string().url().optional(),
            webhookSecret: z.string().min(1).optional()
          })
          .optional(),
        whatsapp: z
          .object({
            accessToken: z.string().min(1).optional(),
            phoneNumber: z.string().min(1).optional(),
            phoneNumberId: z.string().min(1).optional(),
            businessAccountId: z.string().min(1).optional(),
            webhookVerifyToken: z.string().min(1).optional(),
            appSecret: z.string().min(1).optional(),
            webhookSecret: z.string().min(1).optional(),
            templateMap: z.record(z.string(), z.string().min(1)).optional()
          })
          .optional()
      })
      .optional()
  })
  .partial();

const nodeEnvSchema = z.enum(['development', 'production', 'test']);
const portSchema = z.coerce.number().int().positive();

const clientUrlSchema = z.string().url();
const databaseUrlSchema = z.string().min(1);
const sessionSecretSchema = z.string().min(16);
const googleCallbackSchema = z.string().url();
const mysqlIdentifierSchema = z.string().min(1);
const mysqlPasswordSchema = z.string();
const mysqlPortSchema = z.coerce.number().int().positive();
const booleanFlagSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return value;
}, z.boolean());

type FileConfig = z.infer<typeof fileConfigSchema>;

function loadFileConfig(): FileConfig {
  const explicitPath = process.env.APP_CONFIG_PATH;
  const defaultPath = join(__dirname, '../../config/app.config.json');
  const pathToUse = explicitPath ?? defaultPath;

  if (!existsSync(pathToUse)) {
    return {};
  }

  try {
    const contents = readFileSync(pathToUse, 'utf-8');
    const parsed = JSON.parse(contents) as unknown;
    const result = fileConfigSchema.safeParse(parsed);

    if (!result.success) {
      console.warn(
        'app.config.json is invalid. Falling back to environment variables.',
        result.error.flatten()
      );
      return {};
    }

    return result.data;
  } catch (error) {
    console.warn('Failed to parse app.config.json. Falling back to environment variables.', error);
    return {};
  }
}

const fileConfig = loadFileConfig();

const rawNodeEnv = process.env.NODE_ENV;
const nodeEnvResult = nodeEnvSchema.safeParse(rawNodeEnv);
const nodeEnv = nodeEnvResult.success ? nodeEnvResult.data : 'development';

if (!nodeEnvResult.success && rawNodeEnv !== undefined) {
  console.warn(
    `Invalid NODE_ENV value "${rawNodeEnv}". Falling back to "development".`,
    nodeEnvResult.error.flatten()
  );
}

const rawPort = process.env.PORT ?? fileConfig.server?.port ?? undefined;
const portResult = portSchema.safeParse(rawPort ?? 4000);
const port = portResult.success ? portResult.data : 4000;

if (!portResult.success && rawPort !== undefined) {
  console.warn(`Invalid PORT value "${rawPort}". Falling back to 4000.`, portResult.error.flatten());
}

function readOptionalEnv<T>(key: string, schema: z.ZodType<T>): T | undefined {
  const rawValue = process.env[key];

  if (rawValue === undefined || rawValue === '') {
    return undefined;
  }

  const result = schema.safeParse(rawValue);

  if (!result.success) {
    console.warn(`Invalid value provided for ${key}.`, result.error.flatten());
    return undefined;
  }

  return result.data;
}

const envClientUrl =
  readOptionalEnv('CLIENT_URL', clientUrlSchema) ??
  (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : undefined);

const envDatabaseUrlDirect = readOptionalEnv('DATABASE_URL', databaseUrlSchema);
const envMysqlUrl = readOptionalEnv('MYSQL_URL', databaseUrlSchema);
const envMysqlPublicUrl = readOptionalEnv('MYSQL_PUBLIC_URL', databaseUrlSchema);

const mysqlDatabaseName =
  readOptionalEnv('MYSQL_DATABASE', mysqlIdentifierSchema) ??
  readOptionalEnv('MYSQLDATABASE', mysqlIdentifierSchema);
const mysqlHost = readOptionalEnv('MYSQLHOST', mysqlIdentifierSchema);
const mysqlPort = readOptionalEnv('MYSQLPORT', mysqlPortSchema);
const mysqlUser = readOptionalEnv('MYSQLUSER', mysqlIdentifierSchema);
const mysqlPassword =
  readOptionalEnv('MYSQLPASSWORD', mysqlPasswordSchema) ??
  readOptionalEnv('MYSQL_ROOT_PASSWORD', mysqlPasswordSchema);

const eqDbHost = readOptionalEnv('EQ_DB_HOST', mysqlIdentifierSchema);
const eqDbPort = readOptionalEnv('EQ_DB_PORT', mysqlPortSchema);
const eqDbUser = readOptionalEnv('EQ_DB_USER', mysqlIdentifierSchema);
const eqDbPassword = readOptionalEnv('EQ_DB_PASSWORD', mysqlPasswordSchema);
const eqDbName = readOptionalEnv('EQ_DB_NAME', mysqlIdentifierSchema);
const eqDbPoolLimit = readOptionalEnv('EQ_DB_POOL_LIMIT', mysqlPortSchema);

function buildMysqlUrl(): string | undefined {
  if (!mysqlHost || !mysqlUser || !mysqlDatabaseName) {
    return undefined;
  }

  const encodedUser = encodeURIComponent(mysqlUser);
  const encodedPassword = mysqlPassword ? `:${encodeURIComponent(mysqlPassword)}` : '';
  const authority = `${encodedUser}${encodedPassword}@${mysqlHost}${mysqlPort ? `:${mysqlPort}` : ''}`;

  return `mysql://${authority}/${encodeURIComponent(mysqlDatabaseName)}`;
}

const mysqlUrlFromParts = buildMysqlUrl();

if (!mysqlUrlFromParts && (mysqlHost || mysqlPort || mysqlUser || mysqlPassword || mysqlDatabaseName)) {
  console.warn(
    'Detected partial MySQL configuration. Set MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, and MYSQL_DATABASE to construct DATABASE_URL automatically.'
  );
}

const envDatabaseUrl =
  envDatabaseUrlDirect ?? envMysqlUrl ?? envMysqlPublicUrl ?? mysqlUrlFromParts ?? undefined;

if (!envDatabaseUrlDirect && envDatabaseUrl && !process.env.DATABASE_URL) {
  console.info('DATABASE_URL not provided. Using derived MySQL connection string.');
  process.env.DATABASE_URL = envDatabaseUrl;
}

const eqDbSettingsProvided =
  eqDbHost !== undefined ||
  eqDbPort !== undefined ||
  eqDbUser !== undefined ||
  eqDbPassword !== undefined ||
  eqDbName !== undefined ||
  eqDbPoolLimit !== undefined;

let eqDatabaseConfig:
  | {
      host: string;
      port: number;
      user: string;
      password?: string;
      database: string;
      poolLimit?: number;
    }
  | null = null;

if (eqDbSettingsProvided) {
  if (!eqDbHost || !eqDbUser || !eqDbName) {
    console.warn(
      'EQ content database configuration incomplete. Provide EQ_DB_HOST, EQ_DB_USER, and EQ_DB_NAME.'
    );
  } else {
    eqDatabaseConfig = {
      host: eqDbHost,
      port: eqDbPort ?? 3306,
      user: eqDbUser,
      database: eqDbName,
      ...(eqDbPassword ? { password: eqDbPassword } : {}),
      ...(eqDbPoolLimit ? { poolLimit: eqDbPoolLimit } : {})
    };
  }
}

if (!eqDatabaseConfig && fileConfig.eqDatabase) {
  const { host, user, name, port: filePort, password: filePassword, poolLimit: filePoolLimit } =
    fileConfig.eqDatabase;
  if (!host || !user || !name) {
    console.warn(
      'config/app.config.json eqDatabase section is missing host, user, or name. Ignoring file configuration.'
    );
  } else {
    eqDatabaseConfig = {
      host,
      port: filePort ?? 3306,
      user,
      database: name,
      ...(filePassword ? { password: filePassword } : {}),
      ...(filePoolLimit ? { poolLimit: filePoolLimit } : {})
    };
  }
}

const envSessionSecret = readOptionalEnv('SESSION_SECRET', sessionSecretSchema);
const envGoogleClientId = readOptionalEnv('GOOGLE_CLIENT_ID', z.string().min(1));
const envGoogleClientSecret = readOptionalEnv('GOOGLE_CLIENT_SECRET', z.string().min(1));
const envGoogleCallbackUrl = readOptionalEnv('GOOGLE_CALLBACK_URL', googleCallbackSchema);
const envDiscordClientId = readOptionalEnv('DISCORD_CLIENT_ID', z.string().min(1));
const envDiscordClientSecret = readOptionalEnv('DISCORD_CLIENT_SECRET', z.string().min(1));
const envDiscordCallbackUrl = readOptionalEnv('DISCORD_CALLBACK_URL', googleCallbackSchema);
const envTelegramBotToken = readOptionalEnv('TELEGRAM_BOT_TOKEN', z.string().min(1));
const envTelegramBotUsername = readOptionalEnv('TELEGRAM_BOT_USERNAME', z.string().min(1));
const envTelegramWebhookUrl = readOptionalEnv('TELEGRAM_WEBHOOK_URL', googleCallbackSchema);
const envTelegramWebhookSecret = readOptionalEnv('TELEGRAM_WEBHOOK_SECRET', z.string().min(1));
const envWhatsappAccessToken = readOptionalEnv('WHATSAPP_ACCESS_TOKEN', z.string().min(1));
const envWhatsappPhoneNumber = readOptionalEnv('WHATSAPP_PHONE_NUMBER', z.string().min(1));
const envWhatsappPhoneNumberId = readOptionalEnv('WHATSAPP_PHONE_NUMBER_ID', z.string().min(1));
const envWhatsappBusinessAccountId = readOptionalEnv(
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  z.string().min(1)
);
const envWhatsappWebhookVerifyToken = readOptionalEnv(
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  z.string().min(1)
);
const envWhatsappAppSecret = readOptionalEnv('WHATSAPP_APP_SECRET', z.string().min(1));
const envWhatsappWebhookSecret = readOptionalEnv('WHATSAPP_WEBHOOK_SECRET', z.string().min(1));
const enableInProcessSchedulers =
  readOptionalEnv('ENABLE_IN_PROCESS_SCHEDULERS', booleanFlagSchema) ?? nodeEnv !== 'production';

let envWhatsappTemplateMap: Record<string, string> | undefined;
if (process.env.WHATSAPP_TEMPLATE_MAP) {
  try {
    const parsed = JSON.parse(process.env.WHATSAPP_TEMPLATE_MAP) as unknown;
    const result = z.record(z.string(), z.string().min(1)).safeParse(parsed);
    if (result.success) {
      envWhatsappTemplateMap = result.data;
    } else {
      console.warn('Invalid WHATSAPP_TEMPLATE_MAP value. Expected a JSON object of eventKey -> template name.');
    }
  } catch (error) {
    console.warn('Failed to parse WHATSAPP_TEMPLATE_MAP. Expected a JSON object.', error);
  }
}

const databaseUrl = envDatabaseUrl ?? fileConfig.database?.url ?? null;

if (!envDatabaseUrl && fileConfig.database?.url && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = fileConfig.database.url;
}

if (!databaseUrl) {
  console.warn(
    'DATABASE_URL is not defined. Configure DATABASE_URL, MYSQL_URL, or MYSQL* variables so the API can reach the database.'
  );
}

const clientUrl = envClientUrl ?? fileConfig.client?.baseUrl ?? 'http://localhost:5173';

if (!envClientUrl && !fileConfig.client?.baseUrl) {
  console.warn(
    'CLIENT_URL is not defined in the environment or app.config.json. Defaulting to http://localhost:5173.'
  );
} else if (!envClientUrl && fileConfig.client?.baseUrl) {
  console.info(
    'Using CLIENT_URL from config/app.config.json. Set CLIENT_URL in the environment to override for deployments.'
  );
}

const sessionSecret =
  envSessionSecret ?? fileConfig.session?.secret ?? randomBytes(32).toString('hex');

if (!envSessionSecret && fileConfig.session?.secret && !process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = fileConfig.session.secret;
}

if (!envSessionSecret && !fileConfig.session?.secret) {
  console.warn(
    'SESSION_SECRET is not defined. Generated a temporary secret; active sessions reset on restart.'
  );
}

const googleClientId = envGoogleClientId ?? fileConfig.auth?.google?.clientId;
const googleClientSecret = envGoogleClientSecret ?? fileConfig.auth?.google?.clientSecret;
const googleCallbackUrl =
  envGoogleCallbackUrl ??
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

const discordCallbackUrl =
  envDiscordCallbackUrl ??
  (clientUrl ? `${clientUrl.replace(/\/?$/, '')}/api/auth/discord/callback` : undefined);

let discordConfig: {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
} | null = null;

if (envDiscordClientId && !envDiscordClientSecret) {
  console.warn('DISCORD_CLIENT_SECRET is missing. Discord OAuth will be disabled.');
}

if (envDiscordClientSecret && !envDiscordClientId) {
  console.warn('DISCORD_CLIENT_ID is missing. Discord OAuth will be disabled.');
}

if (envDiscordClientId && envDiscordClientSecret) {
  if (!discordCallbackUrl) {
    throw new Error('Discord OAuth requires DISCORD_CALLBACK_URL.');
  }

  discordConfig = {
    clientId: envDiscordClientId,
    clientSecret: envDiscordClientSecret,
    callbackUrl: discordCallbackUrl
  };
}

const telegramBotToken = envTelegramBotToken ?? fileConfig.notifications?.telegram?.botToken;
const telegramBotUsername =
  envTelegramBotUsername ?? fileConfig.notifications?.telegram?.botUsername;
const telegramWebhookUrl = envTelegramWebhookUrl ?? fileConfig.notifications?.telegram?.webhookUrl;
const telegramWebhookSecret =
  envTelegramWebhookSecret ?? fileConfig.notifications?.telegram?.webhookSecret;

let telegramConfig: {
  botToken: string;
  botUsername: string;
  webhookUrl?: string;
  webhookSecret?: string;
} | null = null;

if (telegramBotToken || telegramBotUsername) {
  if (!telegramBotToken || !telegramBotUsername) {
    console.warn(
      'Telegram notifications require both TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME. Telegram messaging will be disabled.'
    );
  } else {
    telegramConfig = {
      botToken: telegramBotToken,
      botUsername: telegramBotUsername,
      ...(telegramWebhookUrl ? { webhookUrl: telegramWebhookUrl } : {}),
      ...(telegramWebhookSecret ? { webhookSecret: telegramWebhookSecret } : {})
    };
  }
}

const whatsappAccessToken =
  envWhatsappAccessToken ?? fileConfig.notifications?.whatsapp?.accessToken;
const whatsappPhoneNumberId =
  envWhatsappPhoneNumberId ?? fileConfig.notifications?.whatsapp?.phoneNumberId;
const whatsappPhoneNumber = envWhatsappPhoneNumber ?? fileConfig.notifications?.whatsapp?.phoneNumber;
const whatsappBusinessAccountId =
  envWhatsappBusinessAccountId ?? fileConfig.notifications?.whatsapp?.businessAccountId;
const whatsappWebhookVerifyToken =
  envWhatsappWebhookVerifyToken ?? fileConfig.notifications?.whatsapp?.webhookVerifyToken;
const whatsappAppSecret = envWhatsappAppSecret ?? fileConfig.notifications?.whatsapp?.appSecret;
const whatsappWebhookSecret =
  envWhatsappWebhookSecret ?? fileConfig.notifications?.whatsapp?.webhookSecret;
const whatsappTemplateMap =
  envWhatsappTemplateMap ?? fileConfig.notifications?.whatsapp?.templateMap;

let whatsappConfig: {
  accessToken: string;
  phoneNumber?: string;
  phoneNumberId: string;
  businessAccountId?: string;
  webhookVerifyToken: string;
  appSecret?: string;
  webhookSecret?: string;
  templateMap: Record<string, string>;
} | null = null;

if (
  whatsappAccessToken ||
  whatsappPhoneNumberId ||
  whatsappWebhookVerifyToken ||
  whatsappBusinessAccountId
) {
  if (!whatsappAccessToken || !whatsappPhoneNumberId || !whatsappWebhookVerifyToken) {
    console.warn(
      'WhatsApp notifications require WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_WEBHOOK_VERIFY_TOKEN. WhatsApp messaging will be disabled.'
    );
  } else {
    whatsappConfig = {
      accessToken: whatsappAccessToken,
      phoneNumberId: whatsappPhoneNumberId,
      webhookVerifyToken: whatsappWebhookVerifyToken,
      templateMap: whatsappTemplateMap ?? {},
      ...(whatsappPhoneNumber ? { phoneNumber: whatsappPhoneNumber } : {}),
      ...(whatsappBusinessAccountId ? { businessAccountId: whatsappBusinessAccountId } : {}),
      ...(whatsappAppSecret ? { appSecret: whatsappAppSecret } : {}),
      ...(whatsappWebhookSecret ? { webhookSecret: whatsappWebhookSecret } : {})
    };
  }
}

export const appConfig = {
  nodeEnv,
  host: fileConfig.server?.host ?? '0.0.0.0',
  port,
  clientUrl,
  databaseUrl,
  sessionSecret,
  eqDatabase: eqDatabaseConfig,
  google: googleConfig,
  discord: discordConfig,
  telegram: telegramConfig,
  whatsapp: whatsappConfig,
  enableInProcessSchedulers
} as const;
