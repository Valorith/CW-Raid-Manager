/**
 * Money Tracker Scheduler
 *
 * Handles automatic daily snapshots based on admin-configured settings.
 * Uses a simple interval-based approach that checks every minute if it's time to run.
 */

import { isEqDbConfigured } from '../utils/eqDb.js';
import {
  createMoneySnapshot,
  getSettings,
  updateLastSnapshotTime
} from './moneyTrackerService.js';

type SchedulerLogger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

let schedulerInterval: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;
let logger: SchedulerLogger = console;

/**
 * Check if we should run the snapshot now
 */
async function shouldRunSnapshot(): Promise<boolean> {
  try {
    const settings = await getSettings();

    // Check if auto-snapshot is enabled
    if (!settings.autoSnapshotEnabled) {
      return false;
    }

    // Check if EQ database is configured
    if (!isEqDbConfigured()) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const todayDate = now.toISOString().split('T')[0];

    // Check if we're at the scheduled time
    if (currentHour !== settings.snapshotHour || currentMinute !== settings.snapshotMinute) {
      return false;
    }

    // Check if we already ran today (prevent duplicate runs within the same minute)
    if (lastRunDate === todayDate) {
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Error checking if should run snapshot:', error);
    return false;
  }
}

/**
 * Execute the scheduled snapshot
 */
async function executeScheduledSnapshot(): Promise<void> {
  const todayDate = new Date().toISOString().split('T')[0];

  try {
    logger.info('[MoneyTrackerScheduler] Starting scheduled snapshot...');

    await createMoneySnapshot();
    await updateLastSnapshotTime();

    // Mark that we've run today
    lastRunDate = todayDate;

    logger.info('[MoneyTrackerScheduler] Scheduled snapshot completed successfully.');
  } catch (error) {
    // If snapshot already exists for today, just mark as run
    if (error instanceof Error && error.message.includes('already exists')) {
      lastRunDate = todayDate;
      logger.info('[MoneyTrackerScheduler] Snapshot already exists for today, skipping.');
    } else {
      logger.error('[MoneyTrackerScheduler] Failed to create scheduled snapshot:', error);
    }
  }
}

/**
 * The main scheduler tick - runs every minute
 */
async function schedulerTick(): Promise<void> {
  try {
    if (await shouldRunSnapshot()) {
      await executeScheduledSnapshot();
    }
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Error in scheduler tick:', error);
  }
}

/**
 * Start the money tracker scheduler
 */
export function startMoneyTrackerScheduler(customLogger?: SchedulerLogger): void {
  if (schedulerInterval) {
    logger.info('[MoneyTrackerScheduler] Scheduler already running.');
    return;
  }

  if (customLogger) {
    logger = customLogger;
  }

  logger.info('[MoneyTrackerScheduler] Starting scheduler (checking every minute)...');

  // Run immediately on startup to check if we missed today's snapshot
  void schedulerTick();

  // Then run every minute
  schedulerInterval = setInterval(() => {
    void schedulerTick();
  }, 60 * 1000); // Every 60 seconds

  // Don't keep the process alive just for this interval
  schedulerInterval.unref();
}

/**
 * Stop the money tracker scheduler
 */
export function stopMoneyTrackerScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('[MoneyTrackerScheduler] Scheduler stopped.');
  }
}

/**
 * Check if the scheduler is currently running
 */
export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}

/**
 * Get the next scheduled snapshot time based on current settings
 */
export async function getNextScheduledTime(): Promise<Date | null> {
  try {
    const settings = await getSettings();

    if (!settings.autoSnapshotEnabled) {
      return null;
    }

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(settings.snapshotHour, settings.snapshotMinute, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    return next;
  } catch {
    return null;
  }
}

/**
 * Force reset the last run date (useful for testing or manual override)
 */
export function resetLastRunDate(): void {
  lastRunDate = null;
}
