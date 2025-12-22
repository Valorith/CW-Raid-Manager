/**
 * Cron Snapshot Trigger
 *
 * This script is designed to be run by Railway's cron job feature.
 * It checks if an auto-snapshot should be taken and executes it if needed.
 *
 * Usage: node build/cronSnapshot.js
 * Recommended cron schedule: 0 * * * * (every hour)
 *
 * The script will:
 * 1. Check if auto-snapshot is enabled in settings
 * 2. Check if the configured snapshot time has passed for today
 * 3. Check if a snapshot already exists for today
 * 4. Create a snapshot if conditions are met
 * 5. Exit with code 0 on success, 1 on error
 */

import 'dotenv/config';

import { prisma } from './utils/prisma.js';
import { closeEqDbPool, isEqDbConfigured } from './utils/eqDb.js';
import { createMoneySnapshot, getSettings, updateLastSnapshotTime } from './services/moneyTrackerService.js';

async function main(): Promise<void> {
  console.log('[CronSnapshot] Starting scheduled snapshot check...');

  // Check if EQ database is configured
  if (!isEqDbConfigured()) {
    console.log('[CronSnapshot] EQ database not configured. Exiting.');
    return;
  }

  // Get current settings
  const settings = await getSettings();

  // Check if auto-snapshot is enabled
  if (!settings.autoSnapshotEnabled) {
    console.log('[CronSnapshot] Auto-snapshot is disabled. Exiting.');
    return;
  }

  // Calculate the scheduled snapshot time for today (in UTC)
  const now = new Date();
  const scheduledTimeToday = new Date(now);
  scheduledTimeToday.setUTCHours(settings.snapshotHour, settings.snapshotMinute, 0, 0);

  console.log(`[CronSnapshot] Current time (UTC): ${now.toISOString()}`);
  console.log(`[CronSnapshot] Scheduled time today (UTC): ${scheduledTimeToday.toISOString()}`);

  // Check if the scheduled time has passed
  if (now < scheduledTimeToday) {
    console.log('[CronSnapshot] Scheduled time has not yet passed for today. Exiting.');
    return;
  }

  // Check if we already have a snapshot for today
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  const existingSnapshot = await prisma.moneySnapshot.findFirst({
    where: {
      snapshotDate: {
        gte: todayStart,
        lt: tomorrowStart
      }
    }
  });

  if (existingSnapshot) {
    console.log('[CronSnapshot] Snapshot already exists for today. Exiting.');
    return;
  }

  // Create the snapshot
  console.log('[CronSnapshot] Scheduled time has passed and no snapshot exists. Creating snapshot...');
  await createMoneySnapshot();
  await updateLastSnapshotTime();
  console.log('[CronSnapshot] Snapshot created successfully.');
}

// Run and handle cleanup
main()
  .then(async () => {
    await closeEqDbPool();
    await prisma.$disconnect();
    console.log('[CronSnapshot] Done.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[CronSnapshot] Error:', error);
    await closeEqDbPool();
    await prisma.$disconnect();
    process.exit(1);
  });
