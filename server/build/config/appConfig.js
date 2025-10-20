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
function loadFileConfig() {
    const explicitPath = process.env.APP_CONFIG_PATH;
    const defaultPath = join(__dirname, '../../config/app.config.json');
    const pathToUse = explicitPath ?? defaultPath;
    if (!existsSync(pathToUse)) {
        return {};
    }
    try {
        const contents = readFileSync(pathToUse, 'utf-8');
        const parsed = JSON.parse(contents);
        const result = fileConfigSchema.safeParse(parsed);
        if (!result.success) {
            console.warn('app.config.json is invalid. Falling back to environment variables.', result.error.flatten());
            return {};
        }
        return result.data;
    }
    catch (error) {
        console.warn('Failed to parse app.config.json. Falling back to environment variables.', error);
        return {};
    }
}
const fileConfig = loadFileConfig();
const rawNodeEnv = process.env.NODE_ENV;
const nodeEnvResult = nodeEnvSchema.safeParse(rawNodeEnv);
const nodeEnv = nodeEnvResult.success ? nodeEnvResult.data : 'development';
if (!nodeEnvResult.success && rawNodeEnv !== undefined) {
    console.warn(`Invalid NODE_ENV value "${rawNodeEnv}". Falling back to "development".`, nodeEnvResult.error.flatten());
}
const rawPort = process.env.PORT ?? fileConfig.server?.port ?? undefined;
const portResult = portSchema.safeParse(rawPort ?? 4000);
const port = portResult.success ? portResult.data : 4000;
if (!portResult.success && rawPort !== undefined) {
    console.warn(`Invalid PORT value "${rawPort}". Falling back to 4000.`, portResult.error.flatten());
}
function readOptionalEnv(key, schema) {
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
const envClientUrl = readOptionalEnv('CLIENT_URL', clientUrlSchema) ??
    (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : undefined);
const envDatabaseUrlDirect = readOptionalEnv('DATABASE_URL', databaseUrlSchema);
const envMysqlUrl = readOptionalEnv('MYSQL_URL', databaseUrlSchema);
const envMysqlPublicUrl = readOptionalEnv('MYSQL_PUBLIC_URL', databaseUrlSchema);
const mysqlDatabaseName = readOptionalEnv('MYSQL_DATABASE', mysqlIdentifierSchema) ??
    readOptionalEnv('MYSQLDATABASE', mysqlIdentifierSchema);
const mysqlHost = readOptionalEnv('MYSQLHOST', mysqlIdentifierSchema);
const mysqlPort = readOptionalEnv('MYSQLPORT', mysqlPortSchema);
const mysqlUser = readOptionalEnv('MYSQLUSER', mysqlIdentifierSchema);
const mysqlPassword = readOptionalEnv('MYSQLPASSWORD', mysqlPasswordSchema) ??
    readOptionalEnv('MYSQL_ROOT_PASSWORD', mysqlPasswordSchema);
function buildMysqlUrl() {
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
    console.warn('Detected partial MySQL configuration. Set MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, and MYSQL_DATABASE to construct DATABASE_URL automatically.');
}
const envDatabaseUrl = envDatabaseUrlDirect ?? envMysqlUrl ?? envMysqlPublicUrl ?? mysqlUrlFromParts ?? undefined;
if (!envDatabaseUrlDirect && envDatabaseUrl && !process.env.DATABASE_URL) {
    console.info('DATABASE_URL not provided. Using derived MySQL connection string.');
    process.env.DATABASE_URL = envDatabaseUrl;
}
const envSessionSecret = readOptionalEnv('SESSION_SECRET', sessionSecretSchema);
const envGoogleClientId = readOptionalEnv('GOOGLE_CLIENT_ID', z.string().min(1));
const envGoogleClientSecret = readOptionalEnv('GOOGLE_CLIENT_SECRET', z.string().min(1));
const envGoogleCallbackUrl = readOptionalEnv('GOOGLE_CALLBACK_URL', googleCallbackSchema);
const databaseUrl = envDatabaseUrl ?? fileConfig.database?.url ?? null;
if (!envDatabaseUrl && fileConfig.database?.url && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = fileConfig.database.url;
}
if (!databaseUrl) {
    console.warn('DATABASE_URL is not defined. Configure DATABASE_URL, MYSQL_URL, or MYSQL* variables so the API can reach the database.');
}
const clientUrl = fileConfig.client?.baseUrl ?? envClientUrl ?? 'http://localhost:5173';
if (!envClientUrl && !fileConfig.client?.baseUrl) {
    console.warn('CLIENT_URL is not defined in the environment or app.config.json. Defaulting to http://localhost:5173.');
}
const sessionSecret = envSessionSecret ?? fileConfig.session?.secret ?? randomBytes(32).toString('hex');
if (!envSessionSecret && fileConfig.session?.secret && !process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = fileConfig.session.secret;
}
if (!envSessionSecret && !fileConfig.session?.secret) {
    console.warn('SESSION_SECRET is not defined. Generated a temporary secret; active sessions reset on restart.');
}
const googleClientId = envGoogleClientId ?? fileConfig.auth?.google?.clientId;
const googleClientSecret = envGoogleClientSecret ?? fileConfig.auth?.google?.clientSecret;
const googleCallbackUrl = envGoogleCallbackUrl ??
    fileConfig.auth?.google?.callbackUrl ??
    (clientUrl ? `${clientUrl.replace(/\/?$/, '')}/api/auth/google/callback` : undefined);
let googleConfig = null;
if (googleClientId && !googleClientSecret) {
    console.warn('GOOGLE_CLIENT_SECRET is missing. Google OAuth will be disabled.');
}
if (googleClientSecret && !googleClientId) {
    console.warn('GOOGLE_CLIENT_ID is missing. Google OAuth will be disabled.');
}
if (googleClientId && googleClientSecret) {
    if (!googleCallbackUrl) {
        throw new Error('Google OAuth requires GOOGLE_CALLBACK_URL or auth.google.callbackUrl in config/app.config.json.');
    }
    googleConfig = {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        callbackUrl: googleCallbackUrl
    };
}
export const appConfig = {
    nodeEnv,
    host: fileConfig.server?.host ?? '0.0.0.0',
    port,
    clientUrl,
    databaseUrl,
    sessionSecret,
    google: googleConfig
};
