import { SignupStatus } from '@prisma/client';

import { queueUserNotification } from './userNotificationService.js';
import { prisma } from '../utils/prisma.js';

async function getConfirmedRaidSignupUsers(raidId: string): Promise<string[]> {
  const signups = await prisma.raidSignup.findMany({
    where: {
      raidId,
      status: SignupStatus.CONFIRMED
    },
    select: {
      userId: true
    },
    distinct: ['userId']
  });

  return signups.map((signup) => signup.userId);
}

export async function queueRaidChangedNotifications(raidId: string): Promise<void> {
  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!raid) {
    return;
  }

  const userIds = await getConfirmedRaidSignupUsers(raidId);
  await Promise.all(
    userIds.map((userId) =>
      queueUserNotification({
        userId,
        scopeType: 'GUILD',
        scopeId: raid.guildId,
        eventKey: 'raid.changed',
        payload: {
          raidId: raid.id,
          raidName: raid.name,
          guildName: raid.guild.name,
          startTime: raid.startTime.toISOString()
        },
        dedupeSeed: `${raid.id}:${raid.updatedAt.toISOString()}`
      })
    )
  );
}

export async function queueRaidCanceledNotifications(raidId: string): Promise<void> {
  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!raid) {
    return;
  }

  const userIds = await getConfirmedRaidSignupUsers(raidId);
  await Promise.all(
    userIds.map((userId) =>
      queueUserNotification({
        userId,
        scopeType: 'GUILD',
        scopeId: raid.guildId,
        eventKey: 'raid.canceled',
        payload: {
          raidId: raid.id,
          raidName: raid.name,
          guildName: raid.guild.name
        },
        dedupeSeed: `${raid.id}:${raid.canceledAt?.toISOString() ?? raid.updatedAt.toISOString()}`
      })
    )
  );
}

export async function queueDueRaidReminderNotifications(referenceTime = new Date()): Promise<number> {
  const windowStart = new Date(referenceTime.getTime() + 55 * 60 * 1000);
  const windowEnd = new Date(referenceTime.getTime() + 65 * 60 * 1000);

  const raids = await prisma.raidEvent.findMany({
    where: {
      canceledAt: null,
      isActive: true,
      startTime: {
        gte: windowStart,
        lte: windowEnd
      }
    },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  let queued = 0;

  for (const raid of raids) {
    const userIds = await getConfirmedRaidSignupUsers(raid.id);
    const counts = await Promise.all(
      userIds.map((userId) =>
        queueUserNotification({
          userId,
          scopeType: 'GUILD',
          scopeId: raid.guildId,
          eventKey: 'raid.reminder.60m',
          payload: {
            raidId: raid.id,
            raidName: raid.name,
            guildName: raid.guild.name,
            startTime: raid.startTime.toISOString()
          },
          dedupeSeed: `raid-reminder:${raid.id}`
        })
      )
    );

    queued += counts.reduce((sum, count) => sum + count, 0);
  }

  return queued;
}
