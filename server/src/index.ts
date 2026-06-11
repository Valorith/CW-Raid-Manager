import 'dotenv/config';

import { buildServer } from './app.js';
import { appConfig } from './config/appConfig.js';
import { startMarketSyncScheduler } from './services/marketSyncScheduler.js';
import { startMoneyTrackerScheduler } from './services/moneyTrackerScheduler.js';
import { startNpcRespawnNotificationScheduler } from './services/npcRespawnNotificationScheduler.js';
import { initializeEqDbPool, isEqDbConfigured } from './utils/eqDb.js';

const MEMORY_LOG_INTERVAL_MS = 5 * 60 * 1000;

async function start(): Promise<void> {
  const server = buildServer();

  try {
    await server.listen({
      port: appConfig.port,
      host: appConfig.host
    });
    server.log.info(
      { port: appConfig.port, env: appConfig.nodeEnv },
      'CW Raid Manager API server started'
    );

    setInterval(() => {
      const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
      server.log.info(
        {
          rssMb: Math.round(rss / 1048576),
          heapUsedMb: Math.round(heapUsed / 1048576),
          heapTotalMb: Math.round(heapTotal / 1048576),
          externalMb: Math.round(external / 1048576)
        },
        'Process memory usage'
      );
    }, MEMORY_LOG_INTERVAL_MS).unref();

    if (appConfig.enableInProcessSchedulers) {
      startNpcRespawnNotificationScheduler({
        info: (...args) => server.log.info(args[0]),
        warn: (...args) => server.log.warn(args[0]),
        error: (...args) => server.log.error(args[0]),
        debug: (...args) => server.log.debug(args[0])
      });
    } else {
      server.log.info(
        '[Schedulers] Skipping in-process NPC respawn notification scheduler; use the cron service instead. Set ENABLE_IN_PROCESS_SCHEDULERS=true for single-service deployments.'
      );
    }

    if (isEqDbConfigured()) {
      void initializeEqDbPool(server.log).catch((error) => {
        server.log.error(
          { err: error },
          'EQ content database pool failed to initialize; remote lookups will be unavailable.'
        );
      });

      if (appConfig.enableInProcessSchedulers) {
        startMoneyTrackerScheduler({
          info: (...args) => server.log.info(args[0]),
          error: (...args) => server.log.error(args[0]),
          debug: (...args) => server.log.debug(args[0])
        });

        startMarketSyncScheduler({
          info: (...args) => server.log.info(args[0]),
          warn: (...args) => server.log.warn(args[0]),
          error: (...args) => server.log.error(args[0]),
          debug: (...args) => server.log.debug(args[0])
        });
      } else {
        server.log.info(
          '[Schedulers] Skipping in-process money and market schedulers; use the cron service instead. Set ENABLE_IN_PROCESS_SCHEDULERS=true for single-service deployments.'
        );
      }
    } else {
      server.log.debug('EQ content database not configured; skipping pool initialization.');
    }
  } catch (error) {
    server.log.error(error, 'Failed to start CW Raid Manager API server');
    process.exit(1);
  }
}

void start();
