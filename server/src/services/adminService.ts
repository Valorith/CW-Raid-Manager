import { GuildApplicationStatus, GuildRole, Prisma } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { detachUserCharactersFromGuild } from './characterService.js';

export async function ensureAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true }
  });

  if (!user?.admin) {
    throw new Error('Administrator privileges required.');
  }
}

export async function ensureGuideOrAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true, guide: true }
  });

  if (!user?.admin && !user?.guide) {
    throw new Error('Guide or Administrator privileges required.');
  }
}

export async function listUsersForAdmin() {
  const users = await prisma.user.findMany({
    orderBy: [
      { admin: 'desc' },
      { guide: 'desc' },
      { displayName: 'asc' }
    ],
    select: {
      id: true,
      email: true,
      displayName: true,
      nickname: true,
      admin: true,
      guide: true,
      createdAt: true,
      updatedAt: true,
      guildMemberships: {
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          role: true,
          createdAt: true,
          guild: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  return users.map((user) => {
    const preferred = withPreferredDisplayName(user);
    return {
      id: user.id,
      email: user.email,
      displayName: preferred.displayName,
      nickname: preferred.nickname ?? null,
      isAdmin: user.admin,
      isGuide: user.guide,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      guildMemberships: user.guildMemberships.map((membership) => ({
        role: membership.role,
        createdAt: membership.createdAt,
        guild: membership.guild
      }))
    };
  });
}

export async function updateUserByAdmin(
  userId: string,
  data: { admin?: boolean | null; guide?: boolean | null; displayName?: string; nickname?: string | null; email?: string }
) {
  const update: Record<string, unknown> = {};

  // Admin and Guide are mutually exclusive - setting one clears the other
  if (typeof data.admin === 'boolean') {
    update.admin = data.admin;
    if (data.admin) {
      update.guide = false; // Clear guide if setting admin
    }
  }

  if (typeof data.guide === 'boolean') {
    update.guide = data.guide;
    if (data.guide) {
      update.admin = false; // Clear admin if setting guide
    }
  }

  if (data.displayName !== undefined) {
    const displayName = data.displayName.trim();
    if (!displayName) {
      throw new Error('Display name cannot be empty.');
    }
    update.displayName = displayName;
  }

  if (data.nickname !== undefined) {
    if (data.nickname === null) {
      update.nickname = null;
    } else {
      const nickname = data.nickname.trim();
      update.nickname = nickname.length > 0 ? nickname : null;
    }
  }

  if (data.email !== undefined) {
    const email = data.email.trim();
    if (!email) {
      throw new Error('Email cannot be empty.');
    }
    update.email = email;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('No valid fields provided for update.');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      id: true,
      email: true,
      displayName: true,
      nickname: true,
      admin: true,
      guide: true,
      createdAt: true,
      updatedAt: true,
      guildMemberships: {
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          role: true,
          createdAt: true,
          guild: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  const preferred = withPreferredDisplayName(user);
  return {
    id: user.id,
    email: user.email,
    displayName: preferred.displayName,
    nickname: preferred.nickname ?? null,
    isAdmin: user.admin,
    isGuide: user.guide,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    guildMemberships: user.guildMemberships.map((membership) => ({
      role: membership.role,
      createdAt: membership.createdAt,
      guild: membership.guild
    }))
  };
}

export async function deleteUserByAdmin(userId: string, performedById: string) {
  if (userId === performedById) {
    throw new Error('You cannot delete your own account.');
  }

  const [targetUser, performedBy] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    }),
    prisma.user.findUnique({
      where: { id: performedById },
      select: { id: true }
    })
  ]);

  if (!targetUser) {
    throw new Error('User not found.');
  }

  if (!performedBy) {
    throw new Error('Admin user not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.guild.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.raidEvent.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.attendanceEvent.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.raidEventSeries.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.questBlueprint.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.questBlueprintFolder.updateMany({
      where: { createdById: userId },
      data: { createdById: performedById }
    });

    await tx.guildLootListEntry.updateMany({
      where: { createdById: userId },
      data: { createdById: null }
    });

    await tx.raidLootEvent.updateMany({
      where: { createdById: userId },
      data: { createdById: null }
    });

    await tx.guildMembership.deleteMany({
      where: { userId }
    });

    await tx.guildApplication.deleteMany({
      where: { userId }
    });

    await tx.raidSignup.deleteMany({
      where: { userId }
    });

    await tx.questAssignment.deleteMany({
      where: { userId }
    });

    const characters = await tx.character.findMany({
      where: { userId },
      select: { id: true }
    });

    const characterIds = characters.map((character) => character.id);
    if (characterIds.length > 0) {
      await tx.attendanceRecord.updateMany({
        where: { characterId: { in: characterIds } },
        data: { characterId: null }
      });

      await tx.questAssignment.updateMany({
        where: { characterId: { in: characterIds } },
        data: { characterId: null }
      });

      await tx.character.deleteMany({
        where: { id: { in: characterIds } }
      });
    }

    await tx.calendarAvailability.deleteMany({
      where: { userId }
    });

    await tx.npcFavorite.deleteMany({
      where: { userId }
    });

    await tx.npcRespawnSubscription.deleteMany({
      where: { userId }
    });

    await tx.guildBankCharacter.deleteMany({
      where: { userId }
    });

    await tx.user.delete({
      where: { id: userId }
    });
  });
}

export async function listGuildsForAdmin() {
  const guilds = await prisma.guild.findMany({
    orderBy: {
      name: 'asc'
    },
    include: {
      _count: {
        select: {
          members: true,
          characters: true,
          raids: true
        }
      }
    }
  });

  return guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    description: guild.description,
    slug: guild.slug,
    memberCount: guild._count.members,
    characterCount: guild._count.characters,
    raidCount: guild._count.raids,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt
  }));
}

export async function getGuildDetailForAdmin(guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      members: {
        orderBy: {
          createdAt: 'asc'
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              nickname: true
            }
          }
        }
      },
      _count: {
        select: {
          members: true,
          characters: true,
          raids: true
        }
      },
      characters: {
        orderBy: {
          name: 'asc'
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              nickname: true
            }
          }
        }
      }
    }
  });

  if (!guild) {
    return null;
  }

  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    slug: guild.slug,
    memberCount: guild._count.members,
    characterCount: guild._count.characters,
    raidCount: guild._count.raids,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt,
    members: guild.members.map((membership) => ({
      user: withPreferredDisplayName(membership.user),
      role: membership.role,
      joinedAt: membership.createdAt
    })),
    characters: guild.characters.map((character) => ({
      id: character.id,
      name: character.name,
      level: character.level,
      class: character.class,
      ownerId: character.userId,
      ownerName: withPreferredDisplayName(character.user).displayName
    }))
  };
}

export async function updateGuildDetailsByAdmin(
  guildId: string,
  data: { name?: string; description?: string | null }
) {
  const update: { name?: string; description?: string | null } = {};
  if (data.name !== undefined) {
    update.name = data.name;
  }
  if (data.description !== undefined) {
    update.description = data.description;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('No valid fields provided for update.');
  }

  const guild = await prisma.guild.update({
    where: { id: guildId },
    data: update,
    include: {
      _count: {
        select: {
          members: true,
          characters: true,
          raids: true
        }
      }
    }
  });

  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    slug: guild.slug,
    memberCount: guild._count.members,
    characterCount: guild._count.characters,
    raidCount: guild._count.raids,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt
  };
}

export async function deleteGuildByAdmin(guildId: string) {
  await prisma.guild.delete({
    where: { id: guildId }
  });
}

export async function upsertGuildMembershipAsAdmin(
  guildId: string,
  userId: string,
  role: GuildRole
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const membership = await prisma.$transaction(async (tx) => {
    const result = await tx.guildMembership.upsert({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      },
      update: {
        role
      },
      create: {
        guildId,
        userId,
        role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            nickname: true
          }
        }
      }
    });

    await tx.guildApplication.deleteMany({
      where: {
        userId,
        status: GuildApplicationStatus.PENDING
      }
    });

    return result;
  });

  return {
    user: withPreferredDisplayName(membership.user),
    role: membership.role,
    joinedAt: membership.createdAt
  };
}

export async function updateGuildMemberRoleAsAdmin(
  guildId: string,
  userId: string,
  role: GuildRole
) {
  const membership = await prisma.guildMembership.update({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          nickname: true
        }
      }
    }
  });

  return {
    user: withPreferredDisplayName(membership.user),
    role: membership.role,
    joinedAt: membership.createdAt
  };
}

export async function removeGuildMemberAsAdmin(guildId: string, userId: string) {
  const membership = await prisma.guildMembership.delete({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });

  await detachUserCharactersFromGuild(guildId, membership.userId);
}

export async function detachGuildCharacterByAdmin(guildId: string, characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId }
  });

  if (!character || character.guildId !== guildId) {
    throw new Error('Character not associated with this guild.');
  }

  const updated = await prisma.character.update({
    where: { id: characterId },
    data: {
      guildId: null
    }
  });

  return updated;
}

export async function listRaidEventsForAdmin() {
  const raids = await prisma.raidEvent.findMany({
    orderBy: {
      startTime: 'desc'
    },
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
          displayName: true,
          nickname: true
        }
      },
      _count: {
        select: {
          attendance: true
        }
      }
    }
  });

  return raids.map((raid) => ({
    id: raid.id,
    name: raid.name,
    guild: raid.guild ? { id: raid.guild.id, name: raid.guild.name } : null,
    startTime: raid.startTime,
    startedAt: raid.startedAt,
    endedAt: raid.endedAt,
    isActive: raid.isActive,
    attendanceCount: raid._count.attendance,
    createdAt: raid.createdAt,
    updatedAt: raid.updatedAt
  }));
}

export async function getRaidEventForAdmin(raidId: string) {
  const raid = await prisma.raidEvent.findUnique({
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
          displayName: true,
          nickname: true
        }
      },
      attendance: {
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          note: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  if (!raid) {
    return null;
  }

  return {
    id: raid.id,
    name: raid.name,
    guild: raid.guild ? { id: raid.guild.id, name: raid.guild.name } : null,
    startTime: raid.startTime,
    startedAt: raid.startedAt,
    endedAt: raid.endedAt,
    targetZones: Array.isArray(raid.targetZones) ? raid.targetZones : [],
    targetBosses: Array.isArray(raid.targetBosses) ? raid.targetBosses : [],
    notes: raid.notes,
    isActive: raid.isActive,
    createdAt: raid.createdAt,
    updatedAt: raid.updatedAt,
    attendanceCount: raid.attendance.length,
    attendance: raid.attendance
  };
}

export async function updateRaidEventByAdmin(
  raidId: string,
  data: {
    name?: string;
    startTime?: Date;
    startedAt?: Date | null;
    endedAt?: Date | null;
    targetZones?: string[];
    targetBosses?: string[];
    notes?: string | null;
    isActive?: boolean;
  }
) {
  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId }
  });

  if (!raid) {
    throw new Error('Raid event not found.');
  }

  const targetZonesUpdate =
    data.targetZones === undefined ? undefined : (data.targetZones as Prisma.InputJsonValue);
  const targetBossesUpdate =
    data.targetBosses === undefined ? undefined : (data.targetBosses as Prisma.InputJsonValue);

  await prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      name: data.name ?? raid.name,
      startTime: data.startTime ?? raid.startTime,
      startedAt: data.startedAt === undefined ? raid.startedAt : data.startedAt,
      endedAt: data.endedAt === undefined ? raid.endedAt : data.endedAt,
      targetZones: targetZonesUpdate ?? (raid.targetZones as Prisma.InputJsonValue),
      targetBosses: targetBossesUpdate ?? (raid.targetBosses as Prisma.InputJsonValue),
      notes: data.notes ?? raid.notes,
      isActive: data.isActive ?? raid.isActive
    }
  });

  return getRaidEventForAdmin(raidId);
}

export async function deleteRaidEventByAdmin(raidId: string) {
  await prisma.raidEvent.delete({
    where: { id: raidId }
  });
}
