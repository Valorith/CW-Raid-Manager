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
  getSnapshotByDate,
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
 * Check if a snapshot already exists for today in the database
 * This is used to prevent duplicate snapshots after server restarts
 */
async function hasSnapshotForToday(): Promise<boolean> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const snapshot = await getSnapshotByDate(today);
    return snapshot !== null;
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Error checking for existing snapshot:', error);
    return false;
  }
}

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

    // Check if we already ran today (in-memory check for current process)
    if (lastRunDate === todayDate) {
      return false;
    }

    // Also check the database for existing snapshot (handles server restarts)
    // This prevents duplicate attempts when the server restarts on the scheduled minute
    if (await hasSnapshotForToday()) {
      // Update in-memory state to match database
      lastRunDate = todayDate;
      logger.debug?.('[MoneyTrackerScheduler] Snapshot already exists for today (found in database).');
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
 * Initialize the scheduler state from the database
 * This syncs the in-memory lastRunDate with actual database state
 */
async function initializeSchedulerState(): Promise<void> {
  try {
    // Check if a snapshot already exists for today
    if (await hasSnapshotForToday()) {
      const todayDate = new Date().toISOString().split('T')[0];
      lastRunDate = todayDate;
      logger.info('[MoneyTrackerScheduler] Found existing snapshot for today, marking as already run.');
    }
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Error initializing scheduler state:', error);
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

  // Initialize state from database (async, but we don't wait for it)
  // This syncs lastRunDate if a snapshot was already taken today before server restart
  void initializeSchedulerState();

  // Run immediately on startup to check if we missed today's snapshot
  void schedulerTick();

  // Then run every minute
  schedulerInterval = setInterval(() => {
    void schedulerTick();
  }, 60 * 1000); // Every 60 seconds

  // NOTE: We intentionally do NOT call .unref() here.
  // The scheduler must keep the Node.js process alive to ensure
  // auto-snapshots work even when there's no other activity.
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
