import { GuildApplicationStatus, GuildRole } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { getUserGuildRole, canManageGuild } from './guildService.js';

export async function applyToGuild(guildId: string, userId: string) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) {
    throw new Error('Guild not found.');
  }

  const existingMembership = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });

  if (existingMembership) {
    throw new Error('You are already a member of this guild.');
  }

  const pendingApplication = await prisma.guildApplication.findFirst({
    where: {
      userId,
      status: GuildApplicationStatus.PENDING
    }
  });

  if (pendingApplication && pendingApplication.guildId !== guildId) {
    throw new Error('You already have a pending guild application. Withdraw it before applying again.');
  }

  const existingApplication = await prisma.guildApplication.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });

  if (existingApplication) {
    if (existingApplication.status === GuildApplicationStatus.PENDING) {
      return prisma.guildApplication.update({
        where: { id: existingApplication.id },
        data: {
          status: GuildApplicationStatus.PENDING
        }
      });
    }

    await prisma.guildApplication.delete({
      where: { id: existingApplication.id }
    });
  }

  return prisma.guildApplication.create({
    data: {
      guildId,
      userId
    }
  });
}

export async function withdrawApplication(guildId: string, userId: string) {
  const application = await prisma.guildApplication.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });

  if (!application || application.status !== GuildApplicationStatus.PENDING) {
    throw new Error('No pending application found for this guild.');
  }

  await prisma.guildApplication.delete({
    where: { id: application.id }
  });
}

export async function listPendingApplicationsForGuild(guildId: string) {
  return prisma.guildApplication.findMany({
    where: {
      guildId,
      status: GuildApplicationStatus.PENDING
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
}

export async function approveApplication(applicationId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.guildApplication.findUnique({
      where: { id: applicationId }
    });

    if (!application || application.status !== GuildApplicationStatus.PENDING) {
      throw new Error('Application not found.');
    }

    const actorMembership = await getUserGuildRole(actorUserId, application.guildId);
    if (!actorMembership || !canManageGuild(actorMembership.role)) {
      throw new Error('Insufficient permissions to approve applications.');
    }

    await tx.guildMembership.upsert({
      where: {
        guildId_userId: {
          guildId: application.guildId,
          userId: application.userId
        }
      },
      update: {
        role: GuildRole.MEMBER
      },
      create: {
        guildId: application.guildId,
        userId: application.userId,
        role: GuildRole.MEMBER
      }
    });

    await tx.guildApplication.delete({
      where: { id: application.id }
    });

    await tx.guildApplication.deleteMany({
      where: {
        userId: application.userId,
        status: GuildApplicationStatus.PENDING
      }
    });

    return true;
  });
}

export async function denyApplication(applicationId: string, actorUserId: string) {
  const application = await prisma.guildApplication.findUnique({
    where: { id: applicationId }
  });

  if (!application || application.status !== GuildApplicationStatus.PENDING) {
    throw new Error('Application not found.');
  }

  const actorMembership = await getUserGuildRole(actorUserId, application.guildId);
  if (!actorMembership || !canManageGuild(actorMembership.role)) {
    throw new Error('Insufficient permissions to deny applications.');
  }

  await prisma.guildApplication.delete({
    where: { id: application.id }
  });
}

export async function getPendingApplicationForUser(userId: string) {
  return prisma.guildApplication.findFirst({
    where: {
      userId,
      status: GuildApplicationStatus.PENDING
    },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          description: true
        }
      }
    }
  });
}

export async function findApplicationForGuild(guildId: string, userId: string) {
  return prisma.guildApplication.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });
}
