/**
 * Cron Job Trigger
 *
 * This script is designed to be run by Railway's cron job feature.
 * It handles multiple scheduled tasks:
 * 1. Money/Metallurgy snapshots (if enabled and at scheduled time)
 * 2. NPC respawn notifications (always runs to check for respawn events)
 *
 * Usage: node build/cronSnapshot.js
 * Recommended cron schedule: every 5 minutes
 *
 * Exit codes:
 * - 0: Success
 * - 1: Error
 */

import 'dotenv/config';

import { prisma } from './utils/prisma.js';
import { closeEqDbPool, isEqDbConfigured } from './utils/eqDb.js';
import { createMoneySnapshot, getSettings, updateLastSnapshotTime } from './services/moneyTrackerService.js';
import { checkAndSendRespawnNotifications } from './services/npcRespawnNotificationService.js';

async function main(): Promise<void> {
  console.log('[CronJob] Starting scheduled tasks...');

  // Task 1: Check and send NPC respawn notifications
  // This runs every time the cron job fires (every 5 minutes)
  console.log('[CronJob] Checking NPC respawn notifications...');
  try {
    await checkAndSendRespawnNotifications();
    console.log('[CronJob] NPC respawn notification check complete.');
  } catch (error) {
    console.error('[CronJob] Error checking respawn notifications:', error);
    // Continue with other tasks even if this fails
  }

  // Task 2: Check if money/metallurgy snapshot should be taken
  // This only runs if EQ database is configured and conditions are met
  await checkAndCreateSnapshot();
}

async function checkAndCreateSnapshot(): Promise<void> {
  // Check if EQ database is configured
  if (!isEqDbConfigured()) {
    console.log('[CronJob] EQ database not configured. Skipping snapshot check.');
    return;
  }

  // Get current settings
  const settings = await getSettings();

  // Check if auto-snapshot is enabled
  if (!settings.autoSnapshotEnabled) {
    console.log('[CronJob] Auto-snapshot is disabled. Skipping snapshot check.');
    return;
  }

  // Calculate the scheduled snapshot time for today (in UTC)
  const now = new Date();
  const scheduledTimeToday = new Date(now);
  scheduledTimeToday.setUTCHours(settings.snapshotHour, settings.snapshotMinute, 0, 0);

  console.log(`[CronJob] Current time (UTC): ${now.toISOString()}`);
  console.log(`[CronJob] Scheduled snapshot time today (UTC): ${scheduledTimeToday.toISOString()}`);

  // Check if the scheduled time has passed
  if (now < scheduledTimeToday) {
    console.log('[CronJob] Scheduled snapshot time has not yet passed for today.');
    return;
  }

  // Check if we already took a snapshot after today's scheduled time
  // This prevents multiple snapshots after the scheduled time passes
  if (settings.lastSnapshotAt) {
    const lastSnapshot = new Date(settings.lastSnapshotAt);
    if (lastSnapshot >= scheduledTimeToday) {
      console.log('[CronJob] Snapshot already taken after scheduled time today.');
      return;
    }
  }

  // Create the snapshot
  console.log('[CronJob] Scheduled time has passed. Creating snapshot...');
  await createMoneySnapshot();
  await updateLastSnapshotTime();
  console.log('[CronJob] Snapshot created successfully.');
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
