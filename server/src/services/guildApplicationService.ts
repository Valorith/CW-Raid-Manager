import { GuildApplicationStatus, GuildRole } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { getUserGuildRole, canManageGuild } from './guildService.js';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';

export async function applyToGuild(guildId: string, userId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true
    }
  });
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

  const application = await prisma.guildApplication.create({
    data: {
      guildId,
      userId
    }
  });

  const applicant = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      nickname: true
    }
  });

  if (applicant) {
    const applicantName = withPreferredDisplayName(applicant).displayName;
    emitDiscordWebhookEvent(guild.id, 'application.submitted', {
      guildName: guild.name,
      applicantName,
      submittedAt: application.createdAt
    });
  }

  return application;
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
  const actorProfilePromise = prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      displayName: true,
      nickname: true
    }
  });

  const approvalContext = await prisma.$transaction(async (tx) => {
    const application = await tx.guildApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        },
        guild: {
          select: {
            id: true,
            name: true
          }
        }
      }
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

    return {
      guildId: application.guildId,
      guildName: application.guild.name,
      applicantName: withPreferredDisplayName(application.user).displayName
    };
  });

  const actorProfile = await actorProfilePromise;
  const actorName = actorProfile
    ? withPreferredDisplayName(actorProfile).displayName
    : 'Guild Staff';

  emitDiscordWebhookEvent(approvalContext.guildId, 'application.approved', {
    guildName: approvalContext.guildName,
    applicantName: approvalContext.applicantName,
    actorName,
    resolvedAt: new Date()
  });

  return true;
}

export async function denyApplication(applicationId: string, actorUserId: string) {
  const application = await prisma.guildApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      },
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
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

  const actorProfile = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      displayName: true,
      nickname: true
    }
  });

  const actorName = actorProfile
    ? withPreferredDisplayName(actorProfile).displayName
    : 'Guild Staff';

  emitDiscordWebhookEvent(application.guildId, 'application.denied', {
    guildName: application.guild.name,
    applicantName: withPreferredDisplayName(application.user).displayName,
    actorName,
    resolvedAt: new Date()
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
