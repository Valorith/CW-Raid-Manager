import { GuildApplicationStatus, GuildRole } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';

export async function ensureAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true }
  });

  if (!user?.admin) {
    throw new Error('Administrator privileges required.');
  }
}

export async function listUsersForAdmin() {
  const users = await prisma.user.findMany({
    orderBy: [
      { admin: 'desc' },
      { displayName: 'asc' }
    ],
    select: {
      id: true,
      email: true,
      displayName: true,
      nickname: true,
      admin: true,
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
  data: { admin?: boolean | null; displayName?: string; nickname?: string | null; email?: string }
) {
  const update: Record<string, unknown> = {};

  if (typeof data.admin === 'boolean') {
    update.admin = data.admin;
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    guildMemberships: user.guildMemberships.map((membership) => ({
      role: membership.role,
      createdAt: membership.createdAt,
      guild: membership.guild
    }))
  };
}

export async function deleteUserByAdmin(userId: string) {
  await prisma.user.delete({
    where: { id: userId }
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
  await prisma.guildMembership.delete({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });
}
