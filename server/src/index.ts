import 'dotenv/config';

import { appConfig } from './config/appConfig.js';
import { buildServer } from './app.js';
import { initializeEqDbPool, isEqDbConfigured } from './utils/eqDb.js';
import { startMoneyTrackerScheduler } from './services/moneyTrackerScheduler.js';

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

    if (isEqDbConfigured()) {
      void initializeEqDbPool(server.log).catch((error) => {
        server.log.error(
          { err: error },
          'EQ content database pool failed to initialize; remote lookups will be unavailable.'
        );
      });

      // Start the money tracker scheduler for automatic daily snapshots
      startMoneyTrackerScheduler({
        info: (...args) => server.log.info(args[0]),
        error: (...args) => server.log.error(args[0]),
        debug: (...args) => server.log.debug(args[0])
      });
    } else {
      server.log.debug('EQ content database not configured; skipping pool initialization.');
    }
  } catch (error) {
    server.log.error(error, 'Failed to start CW Raid Manager API server');
    process.exit(1);
  }
}

void start();
