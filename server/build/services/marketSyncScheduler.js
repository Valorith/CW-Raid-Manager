import { isEqDbConfigured } from '../utils/eqDb.js';
import { syncMarketSaleEvents } from './marketService.js';
const MARKET_SYNC_INTERVAL_MS = 15 * 60 * 1000;
let schedulerInterval = null;
let logger = console;
async function schedulerTick() {
    if (!isEqDbConfigured()) {
        return;
    }
    try {
        await syncMarketSaleEvents({
            logger,
            maxBatches: 20
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
    logger.info?.('[MarketSyncScheduler] Starting scheduler (checking every 15 minutes)...');
    void schedulerTick();
    schedulerInterval = setInterval(() => {
        void schedulerTick();
    }, MARKET_SYNC_INTERVAL_MS);
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
