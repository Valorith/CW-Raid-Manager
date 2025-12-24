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
import { autoLinkSharedIps } from './characterAdminService.js';
import { prisma } from '../utils/prisma.js';

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

    // Check if we already ran at this scheduled time today (in-memory check)
    // This prevents running multiple times during the same scheduled minute
    if (lastRunDate === todayDate) {
      return false;
    }

    // Check if the last snapshot was taken at this scheduled time today (handles server restarts)
    // This only prevents duplicate runs at the SAME scheduled time, not for earlier snapshots
    if (settings.lastSnapshotAt) {
      const lastSnapshot = new Date(settings.lastSnapshotAt);
      const lastSnapshotDate = lastSnapshot.toISOString().split('T')[0];
      const lastSnapshotHour = lastSnapshot.getUTCHours();
      const lastSnapshotMinute = lastSnapshot.getUTCMinutes();

      // If the last snapshot was today at this exact scheduled time, skip
      if (
        lastSnapshotDate === todayDate &&
        lastSnapshotHour === settings.snapshotHour &&
        lastSnapshotMinute === settings.snapshotMinute
      ) {
        lastRunDate = todayDate;
        logger.debug?.('[MoneyTrackerScheduler] Already ran at this scheduled time today.');
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Error checking if should run snapshot:', error);
    return false;
  }
}

/**
 * Execute the scheduled snapshot and other daily tasks
 */
async function executeScheduledSnapshot(): Promise<void> {
  const todayDate = new Date().toISOString().split('T')[0];

  try {
    logger.info('[MoneyTrackerScheduler] Starting scheduled snapshot...');

    await createMoneySnapshot();
    await updateLastSnapshotTime();

    // Mark that we've run at this scheduled time today
    lastRunDate = todayDate;

    logger.info('[MoneyTrackerScheduler] Scheduled snapshot completed successfully.');

    // Run auto-link for shared IPs (daily maintenance task)
    await executeAutoLinkSharedIps();
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Failed to create scheduled snapshot:', error);
  }
}

/**
 * Execute auto-linking of accounts that share IPs
 * Finds an admin user for audit trail purposes
 */
async function executeAutoLinkSharedIps(): Promise<void> {
  if (!isEqDbConfigured()) {
    return;
  }

  try {
    // Find an admin user for the audit trail
    const adminUser = await prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true, displayName: true, nickname: true }
    });

    if (!adminUser) {
      logger.info('[MoneyTrackerScheduler] No admin user found, skipping auto-link shared IPs.');
      return;
    }

    const userName = adminUser.nickname || adminUser.displayName;

    logger.info('[MoneyTrackerScheduler] Starting auto-link shared IPs...');
    const result = await autoLinkSharedIps(adminUser.id, userName);
    logger.info(
      `[MoneyTrackerScheduler] Auto-link completed: ${result.created} created, ${result.skipped} skipped, ${result.sharedIpsFound} shared IPs found.`
    );
  } catch (error) {
    logger.error('[MoneyTrackerScheduler] Failed to auto-link shared IPs:', error);
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
 * This syncs the in-memory lastRunDate if we already ran at the scheduled time today
 */
async function initializeSchedulerState(): Promise<void> {
  try {
    const settings = await getSettings();
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    // Check if the last snapshot was taken at the scheduled time today
    // This prevents duplicate runs if the server restarts during the scheduled minute
    if (settings.lastSnapshotAt) {
      const lastSnapshot = new Date(settings.lastSnapshotAt);
      const lastSnapshotDate = lastSnapshot.toISOString().split('T')[0];
      const lastSnapshotHour = lastSnapshot.getUTCHours();
      const lastSnapshotMinute = lastSnapshot.getUTCMinutes();

      if (
        lastSnapshotDate === todayDate &&
        lastSnapshotHour === settings.snapshotHour &&
        lastSnapshotMinute === settings.snapshotMinute
      ) {
        lastRunDate = todayDate;
        logger.info('[MoneyTrackerScheduler] Already ran at scheduled time today, marking as complete.');
      }
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
  // This syncs lastRunDate if we already ran at the scheduled time today
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
