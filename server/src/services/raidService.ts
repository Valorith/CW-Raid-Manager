import { GuildRole, Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { canManageGuild, getUserGuildRole } from './guildService.js';

interface CreateRaidInput {
  guildId: string;
  createdById: string;
  name: string;
  startTime: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  targetZones: string[];
  targetBosses: string[];
  notes?: string | null;
}

interface UpdateRaidInput {
  name?: string;
  startTime?: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  targetZones?: string[];
  targetBosses?: string[];
  notes?: string | null;
  isActive?: boolean;
}

async function ensureCanManageRaid(userId: string, guildId: string) {
  const membership = await getUserGuildRole(userId, guildId);
  if (!membership || !canManageGuild(membership.role)) {
    throw new Error('Insufficient permissions to manage raid events for this guild.');
  }
  return membership.role;
}

export async function listRaidEventsForGuild(guildId: string) {
  return prisma.raidEvent.findMany({
    where: { guildId },
    orderBy: {
      startTime: 'desc'
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      },
      attendance: {
        select: {
          id: true,
          createdAt: true,
          eventType: true
        }
      }
    }
  });
}

export async function createRaidEvent(input: CreateRaidInput) {
  await ensureCanManageRaid(input.createdById, input.guildId);

  return prisma.raidEvent.create({
    data: {
      guildId: input.guildId,
      createdById: input.createdById,
      name: input.name,
      startTime: input.startTime,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      targetZones: input.targetZones,
      targetBosses: input.targetBosses,
      notes: input.notes
    }
  });
}

export async function updateRaidEvent(
  raidId: string,
  userId: string,
  data: UpdateRaidInput
) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  const targetZonesUpdate =
    data.targetZones === undefined
      ? undefined
      : (data.targetZones as Prisma.InputJsonValue);
  const targetBossesUpdate =
    data.targetBosses === undefined
      ? undefined
      : (data.targetBosses as Prisma.InputJsonValue);

  return prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      name: data.name ?? existing.name,
      startTime: (data.startTime as Date | undefined) ?? existing.startTime,
      startedAt: data.startedAt === undefined ? existing.startedAt : data.startedAt ?? null,
      endedAt: data.endedAt === undefined ? existing.endedAt : data.endedAt ?? null,
      targetZones: targetZonesUpdate ?? (existing.targetZones as Prisma.InputJsonValue),
      targetBosses: targetBossesUpdate ?? (existing.targetBosses as Prisma.InputJsonValue),
      notes: data.notes ?? existing.notes,
      isActive: data.isActive ?? existing.isActive
    }
  });
}

export async function getRaidEventById(raidId: string) {
  return prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      },
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      },
      attendance: {
        include: {
          records: true
        }
      }
    }
  });
}

export async function startRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  return prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      startedAt: new Date(),
      endedAt: null,
      isActive: true
    }
  });
}

export async function endRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  return prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      endedAt: new Date(),
      isActive: false
    }
  });
}

export async function restartRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  if (!existing.endedAt) {
    throw new Error('Raid has not been ended.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  const updated = await prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      startedAt: new Date(),
      endedAt: null,
      isActive: true
    }
  });

  return updated;
}

export async function deleteRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    select: {
      guildId: true
    }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  await prisma.attendanceRecord.deleteMany({
    where: {
      attendanceEvent: {
        raidEventId: raidId
      }
    }
  });

  await prisma.attendanceEvent.deleteMany({
    where: { raidEventId: raidId }
  });

  await prisma.raidEvent.delete({
    where: { id: raidId }
  });
}

export async function ensureUserCanViewGuild(userId: string, guildId: string) {
  const membership = await getUserGuildRole(userId, guildId);
  if (!membership) {
    throw new Error('You must be a member of the guild to access this raid event.');
  }
  return membership.role;
}

export function roleCanEditRaid(role: GuildRole) {
  return role === GuildRole.LEADER || role === GuildRole.OFFICER || role === GuildRole.RAID_LEADER;
}

export async function ensureUserCanEditRaid(raidId: string, userId: string) {
  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    select: {
      guildId: true
    }
  });

  if (!raid) {
    throw new Error('Raid event not found.');
  }

  const membership = await getUserGuildRole(userId, raid.guildId);
  if (!membership || !roleCanEditRaid(membership.role)) {
    throw new Error('Insufficient permissions to modify attendance for this raid.');
  }

  return { guildId: raid.guildId, membershipRole: membership.role };
}
