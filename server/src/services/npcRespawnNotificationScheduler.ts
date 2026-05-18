import { processNotificationOutbox } from './notificationOutboxService.js';
import { checkAndSendRespawnNotifications } from './npcRespawnNotificationService.js';

const NPC_RESPAWN_NOTIFICATION_INTERVAL_MS = 60 * 1000;

type SchedulerLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

let schedulerInterval: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let logger: SchedulerLogger = console;

async function schedulerTick(): Promise<void> {
  if (schedulerRunning) {
    logger.debug?.('[NpcRespawnNotificationScheduler] Previous tick still running; skipping.');
    return;
  }

  schedulerRunning = true;
  try {
    await checkAndSendRespawnNotifications();
  } catch (error) {
    logger.error?.('[NpcRespawnNotificationScheduler] Error checking respawn notifications.', error);
  }

  try {
    const processed = await processNotificationOutbox();
    if (processed > 0) {
      logger.info?.(
        `[NpcRespawnNotificationScheduler] Processed ${processed} notification delivery row(s).`
      );
    }
  } catch (error) {
    logger.error?.('[NpcRespawnNotificationScheduler] Error processing notification outbox.', error);
  } finally {
    schedulerRunning = false;
  }
}

export function startNpcRespawnNotificationScheduler(customLogger?: SchedulerLogger): void {
  if (schedulerInterval) {
    return;
  }

  if (customLogger) {
    logger = customLogger;
  }

  logger.info?.('[NpcRespawnNotificationScheduler] Starting scheduler (checking every minute)...');
  void schedulerTick();

  schedulerInterval = setInterval(() => {
    void schedulerTick();
  }, NPC_RESPAWN_NOTIFICATION_INTERVAL_MS);
}

export function stopNpcRespawnNotificationScheduler(): void {
  if (!schedulerInterval) {
    return;
  }

  clearInterval(schedulerInterval);
  schedulerInterval = null;
  logger.info?.('[NpcRespawnNotificationScheduler] Scheduler stopped.');
}

export function isNpcRespawnNotificationSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
