import mysql, {
  type FieldPacket,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise';

import { appConfig } from '../config/appConfig.js';

type EqDbQueryParams = Record<string, unknown> | unknown[];
type AppLogger = {
  debug?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
};

let eqDbPool: Pool | null = null;
let eqDbPoolPromise: Promise<Pool> | null = null;

const missingConfigMessage =
  'EQ content database is not configured. Set EQ_DB_HOST, EQ_DB_USER, EQ_DB_PASSWORD, and EQ_DB_NAME to enable remote lookups.';

function buildPool(): Pool {
  const config = appConfig.eqDatabase;

  if (!config) {
    throw new Error(missingConfigMessage);
  }

  return mysql.createPool({
    host: config.host,
    port: config.port ?? 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.poolLimit ?? 6,
    queueLimit: 0,
    namedPlaceholders: true,
    timezone: 'Z'
  });
}

export function isEqDbConfigured(): boolean {
  return Boolean(appConfig.eqDatabase);
}

async function ensurePool(): Promise<Pool> {
  if (eqDbPool) {
    return eqDbPool;
  }

  if (!eqDbPoolPromise) {
    eqDbPoolPromise = Promise.resolve()
      .then(() => buildPool())
      .then((pool) => {
        eqDbPool = pool;
        return pool;
      })
      .catch((error) => {
        eqDbPoolPromise = null;
        throw error;
      });
  }

  return eqDbPoolPromise;
}

export async function getEqDbPool(): Promise<Pool> {
  return ensurePool();
}

export async function initializeEqDbPool(logger?: AppLogger): Promise<void> {
  if (!isEqDbConfigured()) {
    logger?.debug?.('EQ content database is not configured; skipping pool initialization.');
    return;
  }

  try {
    const pool = await ensurePool();
    const connection = await pool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
    logger?.info?.('EQ content database connection pool ready.');
  } catch (error) {
    logger?.error?.({ err: error }, 'Failed to initialize EQ content database connection pool.');
    throw error;
  }
}

export async function withEqDbConnection<T>(
  handler: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  if (!isEqDbConfigured()) {
    throw new Error(missingConfigMessage);
  }

  const pool = await ensurePool();
  const connection = await pool.getConnection();

  try {
    return await handler(connection);
  } finally {
    connection.release();
  }
}

export async function executeEqDb<
  TResult extends RowDataPacket[] | RowDataPacket[][] | ResultSetHeader = RowDataPacket[]
>(
  sql: string,
  params?: EqDbQueryParams
): Promise<[TResult, FieldPacket[]]> {
  if (!isEqDbConfigured()) {
    throw new Error(missingConfigMessage);
  }

  const pool = await ensurePool();
  return pool.execute<TResult>(sql, params ?? []);
}

export async function queryEqDb<TResult = RowDataPacket[]>(
  sql: string,
  params?: EqDbQueryParams
): Promise<TResult> {
  const [rows] = await executeEqDb<RowDataPacket[]>(sql, params);
  return rows as TResult;
}

export async function closeEqDbPool(): Promise<void> {
  const pool = eqDbPool;
  eqDbPool = null;
  eqDbPoolPromise = null;

  if (pool) {
    await pool.end();
  }
}

process.on('SIGINT', () => {
  void closeEqDbPool();
});

export interface EqDbPollerOptions<TResult> {
  intervalMs: number;
  runOnStart?: boolean;
  onResult?: (result: TResult) => void;
  onError?: (error: unknown) => void;
}

export interface EqDbPoller {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

export function createEqDbPoller<TResult>(
  task: (connection: PoolConnection) => Promise<TResult>,
  options: EqDbPollerOptions<TResult>
): EqDbPoller {
  const interval = Math.max(options.intervalMs, 1000);
  let running = false;
  let timeout: NodeJS.Timeout | null = null;
  let inFlight = false;

  const scheduleNext = () => {
    if (!running) {
      return;
    }
    timeout = setTimeout(executeTask, interval);
    timeout.unref();
  };

  const executeTask = async () => {
    if (!running || inFlight) {
      scheduleNext();
      return;
    }

    inFlight = true;
    try {
      const result = await withEqDbConnection((connection) => task(connection));
      options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
      scheduleNext();
    }
  };

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      if (options.runOnStart) {
        void executeTask();
      } else {
        scheduleNext();
      }
    },
    stop() {
      running = false;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    },
    isRunning() {
      return running;
    }
  };
}
