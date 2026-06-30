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

// Safety timeout — force exit if cron hangs (e.g., dead DB connection)
const CRON_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const timeoutTimer = setTimeout(() => {
  console.error('[CronSnapshot] TIMEOUT: Cron job exceeded 2 minutes. Force exiting.');
  process.exit(1);
}, CRON_TIMEOUT_MS);
timeoutTimer.unref(); // Don't prevent normal exit

interface CronDependencies {
  enforceInboundWebhookRetention: typeof import('./services/inboundWebhookService.js').enforceInboundWebhookRetention;
  syncMarketListings: typeof import('./services/marketListingsService.js').syncMarketListings;
  syncMarketSaleEvents: typeof import('./services/marketService.js').syncMarketSaleEvents;
  createMoneySnapshot: typeof import('./services/moneyTrackerService.js').createMoneySnapshot;
  getSettings: typeof import('./services/moneyTrackerService.js').getSettings;
  updateLastSnapshotTime: typeof import('./services/moneyTrackerService.js').updateLastSnapshotTime;
  processNotificationOutbox: typeof import('./services/notificationOutboxService.js').processNotificationOutbox;
  checkAndSendRespawnNotifications: typeof import('./services/npcRespawnNotificationService.js').checkAndSendRespawnNotifications;
  queueDueRaidReminderNotifications: typeof import('./services/raidNotificationService.js').queueDueRaidReminderNotifications;
  isEqDbConfigured: typeof import('./utils/eqDb.js').isEqDbConfigured;
}

let cleanupCronDependencies: (() => Promise<void>) | undefined;

function isTruthyEnv(value: string | undefined): boolean {
  return value ? ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()) : false;
}

function getRailwayEnvironmentName(): string {
  return process.env.RAILWAY_ENVIRONMENT_NAME ?? '';
}

function isRailwayPullRequestEnvironment(): boolean {
  return /(?:^|-)pr-\d+$/i.test(getRailwayEnvironmentName());
}

function shouldSkipCronForEnvironment(): boolean {
  if (isTruthyEnv(process.env.CW_NEXUS_RUN_CRON_IN_PR_ENV)) {
    return false;
  }

  return isRailwayPullRequestEnvironment();
}

async function loadCronDependencies(): Promise<CronDependencies> {
  const [
    inboundWebhookService,
    marketListingsService,
    marketService,
    moneyTrackerService,
    notificationOutboxService,
    npcRespawnNotificationService,
    raidNotificationService,
    eqDb,
    prismaModule
  ] = await Promise.all([
    import('./services/inboundWebhookService.js'),
    import('./services/marketListingsService.js'),
    import('./services/marketService.js'),
    import('./services/moneyTrackerService.js'),
    import('./services/notificationOutboxService.js'),
    import('./services/npcRespawnNotificationService.js'),
    import('./services/raidNotificationService.js'),
    import('./utils/eqDb.js'),
    import('./utils/prisma.js')
  ]);

  cleanupCronDependencies = async () => {
    const results = await Promise.allSettled([
      eqDb.closeEqDbPool(),
      prismaModule.prisma.$disconnect()
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[CronSnapshot] Error during cleanup:', result.reason);
      }
    }
  };

  return {
    enforceInboundWebhookRetention: inboundWebhookService.enforceInboundWebhookRetention,
    syncMarketListings: marketListingsService.syncMarketListings,
    syncMarketSaleEvents: marketService.syncMarketSaleEvents,
    createMoneySnapshot: moneyTrackerService.createMoneySnapshot,
    getSettings: moneyTrackerService.getSettings,
    updateLastSnapshotTime: moneyTrackerService.updateLastSnapshotTime,
    processNotificationOutbox: notificationOutboxService.processNotificationOutbox,
    checkAndSendRespawnNotifications:
      npcRespawnNotificationService.checkAndSendRespawnNotifications,
    queueDueRaidReminderNotifications: raidNotificationService.queueDueRaidReminderNotifications,
    isEqDbConfigured: eqDb.isEqDbConfigured
  };
}

async function main(): Promise<void> {
  if (shouldSkipCronForEnvironment()) {
    console.log(
      `[CronSnapshot] Skipping scheduled tasks in Railway PR environment "${getRailwayEnvironmentName()}".`
    );
    console.log('[CronSnapshot] Set CW_NEXUS_RUN_CRON_IN_PR_ENV=true to opt in for testing.');
    return;
  }

  const dependencies = await loadCronDependencies();

  console.log('[CronJob] Starting scheduled tasks...');

  console.log('[CronJob] Syncing market sale events...');
  try {
    const syncResult = await dependencies.syncMarketSaleEvents({ maxBatches: 20 });
    console.log(
      `[CronJob] Market sync complete. Processed ${syncResult.processed} rows, inserted ${syncResult.inserted}.`
    );
  } catch (error) {
    console.error('[CronJob] Error syncing market sale events:', error);
  }

  console.log('[CronJob] Syncing market listings cache...');
  try {
    const listingsResult = await dependencies.syncMarketListings({ logger: console });
    console.log(
      `[CronJob] Market listings sync complete. Retrieved ${listingsResult.retrieved} listings.`
    );
  } catch (error) {
    console.error('[CronJob] Error syncing market listings:', error);
  }

  // Task 1: Check and send NPC respawn notifications
  // This runs every time the cron job fires (every 5 minutes)
  console.log('[CronJob] Checking NPC respawn notifications...');
  try {
    await dependencies.checkAndSendRespawnNotifications();
    console.log('[CronJob] NPC respawn notification check complete.');
  } catch (error) {
    console.error('[CronJob] Error checking respawn notifications:', error);
    // Continue with other tasks even if this fails
  }

  console.log('[CronJob] Queueing due raid reminder notifications...');
  try {
    const queued = await dependencies.queueDueRaidReminderNotifications();
    console.log(`[CronJob] Raid reminder queueing complete. Queued ${queued} deliveries.`);
  } catch (error) {
    console.error('[CronJob] Error queueing raid reminder notifications:', error);
  }

  console.log('[CronJob] Processing notification outbox...');
  try {
    const processed = await dependencies.processNotificationOutbox();
    console.log(`[CronJob] Notification outbox processing complete. Processed ${processed} rows.`);
  } catch (error) {
    console.error('[CronJob] Error processing notification outbox:', error);
  }

  console.log('[CronJob] Enforcing inbound webhook retention policies...');
  try {
    const retention = await dependencies.enforceInboundWebhookRetention();
    console.log(
      `[CronJob] Webhook retention complete. Scanned ${retention.webhooksScanned} webhooks, deleted ${retention.deletedByAge + retention.deletedByMaxCount} messages.`
    );
  } catch (error) {
    console.error('[CronJob] Error enforcing webhook retention:', error);
  }

  // Task 2: Check if money/metallurgy snapshot should be taken
  // This only runs if EQ database is configured and conditions are met
  try {
    await checkAndCreateSnapshot(dependencies);
  } catch (error) {
    console.error('[CronJob] Error checking/creating snapshot:', error);
  }
}

async function checkAndCreateSnapshot({
  createMoneySnapshot,
  getSettings,
  isEqDbConfigured,
  updateLastSnapshotTime
}: Pick<
  CronDependencies,
  'createMoneySnapshot' | 'getSettings' | 'isEqDbConfigured' | 'updateLastSnapshotTime'
>): Promise<void> {
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
    await cleanupCronDependencies?.();
    console.log('[CronSnapshot] Done.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[CronSnapshot] Error:', error);
    await cleanupCronDependencies?.();
    process.exit(1);
  });
