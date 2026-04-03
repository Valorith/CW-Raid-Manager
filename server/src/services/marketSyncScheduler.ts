import { isEqDbConfigured } from '../utils/eqDb.js';
import { syncMarketSaleEvents } from './marketService.js';

type SchedulerLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

let schedulerInterval: NodeJS.Timeout | null = null;
let logger: SchedulerLogger = console;

async function schedulerTick(): Promise<void> {
  if (!isEqDbConfigured()) {
    return;
  }

  try {
    await syncMarketSaleEvents({
      logger,
      maxBatches: 6
    });
  } catch (error) {
    logger.error?.('[MarketSyncScheduler] Error syncing market sale events.', error);
  }
}

export function startMarketSyncScheduler(customLogger?: SchedulerLogger): void {
  if (schedulerInterval) {
    return;
  }

  if (customLogger) {
    logger = customLogger;
  }

  logger.info?.('[MarketSyncScheduler] Starting scheduler (checking every minute)...');
  void schedulerTick();

  schedulerInterval = setInterval(() => {
    void schedulerTick();
  }, 60 * 1000);
}

export function stopMarketSyncScheduler(): void {
  if (!schedulerInterval) {
    return;
  }

  clearInterval(schedulerInterval);
  schedulerInterval = null;
  logger.info?.('[MarketSyncScheduler] Scheduler stopped.');
}

export function isMarketSyncSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
