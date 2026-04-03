import { isEqDbConfigured } from '../utils/eqDb.js';
import { syncMarketSaleEvents } from './marketService.js';
let schedulerInterval = null;
let logger = console;
async function schedulerTick() {
    if (!isEqDbConfigured()) {
        return;
    }
    try {
        await syncMarketSaleEvents({
            logger,
            maxBatches: 6
        });
    }
    catch (error) {
        logger.error?.('[MarketSyncScheduler] Error syncing market sale events.', error);
    }
}
export function startMarketSyncScheduler(customLogger) {
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
export function stopMarketSyncScheduler() {
    if (!schedulerInterval) {
        return;
    }
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info?.('[MarketSyncScheduler] Scheduler stopped.');
}
export function isMarketSyncSchedulerRunning() {
    return schedulerInterval !== null;
}
