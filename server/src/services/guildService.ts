import { GuildRole } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { slugify } from '../utils/slugify.js';

interface CreateGuildInput {
  name: string;
  description?: string;
  creatorUserId: string;
}

export async function listGuilds() {
  const guilds = await prisma.guild.findMany({
    orderBy: {
      name: 'asc'
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      defaultRaidStartTime: true,
      defaultRaidEndTime: true,
      createdAt: true,
      members: {
        select: {
          id: true,
          role: true,
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

  return guilds.map((guild) => ({
    ...guild,
    members: guild.members.map((member) => ({
      ...member,
      user: withPreferredDisplayName(member.user)
    }))
  }));
}

export async function getGuildById(id: string, options?: { viewerUserId?: string | null }) {
  const guild = await prisma.guild.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              nickname: true
            }
          }
        }
      },
      characters: {
        select: {
          id: true,
          name: true,
          class: true,
          level: true,
          isMain: true,
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

  const viewerUserId = options?.viewerUserId ?? null;

  let viewerMembership: { role: GuildRole } | null = null;
  if (viewerUserId) {
    viewerMembership = await prisma.guildMembership.findUnique({
      where: {
        guildId_userId: {
          guildId: id,
          userId: viewerUserId
        }
      }
    });
  }

  const canViewDetails = Boolean(viewerMembership);
  const canManageMembers = viewerMembership ? canManageGuild(viewerMembership.role) : false;

  const members = canViewDetails
    ? guild.members.map((member) => ({
        ...member,
        user: withPreferredDisplayName(member.user)
      }))
    : [];

  const characters = canViewDetails
    ? guild.characters.map((character) => ({
        ...character,
        user: withPreferredDisplayName(character.user)
      }))
    : [];

  const applicants = canManageMembers
    ? await prisma.guildApplication.findMany({
        where: {
          guildId: id,
          status: 'PENDING'
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
      })
    : [];

  let viewerApplication = null;
  if (viewerUserId) {
    const application = await prisma.guildApplication.findUnique({
      where: {
        guildId_userId: {
          guildId: id,
          userId: viewerUserId
        }
      }
    });
    if (application && application.status === 'PENDING') {
      viewerApplication = {
        id: application.id,
        status: application.status,
        guildId: application.guildId
      };
    }
  }

  return {
    id: guild.id,
    name: guild.name,
    slug: guild.slug,
    description: guild.description,
    defaultRaidStartTime: guild.defaultRaidStartTime,
    defaultRaidEndTime: guild.defaultRaidEndTime,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt,
    members,
    characters,
    applicants: applicants.map((application) => ({
      id: application.id,
      createdAt: application.createdAt,
      user: withPreferredDisplayName(application.user)
    })),
    permissions: {
      canViewDetails,
      canManageMembers,
      canViewApplicants: canManageMembers,
      userRole: viewerMembership?.role ?? null
    },
    viewerApplication
  };
}

async function ensureUniqueSlug(name: string): Promise<string> {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  let existing = await prisma.guild.findUnique({ where: { slug } });

  while (existing) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
    existing = await prisma.guild.findUnique({ where: { slug } });
  }

  return slug;
}

export async function createGuild({ name, description, creatorUserId }: CreateGuildInput) {
  const slug = await ensureUniqueSlug(name);

  const guild = await prisma.guild.create({
    data: {
      name,
      slug,
      description,
      createdById: creatorUserId,
      members: {
        create: {
          userId: creatorUserId,
          role: GuildRole.LEADER
        }
      }
    },
    include: {
      members: {
        include: {
          user: true
        }
      }
    }
  });
  return {
    ...guild,
    members: guild.members.map((member) => ({
      ...member,
      user: withPreferredDisplayName(member.user)
    }))
  };
}

export async function getUserGuildRole(userId: string, guildId: string) {
  return prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });
}

export function canManageGuild(role: GuildRole | null | undefined): boolean {
  return (
    role === GuildRole.LEADER || role === GuildRole.OFFICER || role === GuildRole.RAID_LEADER
  );
}


export async function updateGuildMemberRole({
  actorUserId,
  guildId,
  targetUserId,
  newRole
}: {
  actorUserId: string;
  guildId: string;
  targetUserId: string;
  newRole: GuildRole;
}) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      members: true
    }
  });

  if (!guild) {
    throw new Error('Guild not found.');
  }

  const actorMembership = guild.members.find((member) => member.userId === actorUserId);
  if (!actorMembership) {
    throw new Error('You must be a guild member to update roles.');
  }

  if (!canManageGuild(actorMembership.role)) {
    throw new Error('Insufficient permissions to update member roles.');
  }

  const targetMembership = guild.members.find((member) => member.userId === targetUserId);
  if (!targetMembership) {
    throw new Error('Membership not found.');
  }

  if (actorMembership.userId === targetMembership.userId && newRole !== GuildRole.LEADER) {
    // allow downgrading self when assigning new leader
    if (newRole === GuildRole.OFFICER || newRole === GuildRole.RAID_LEADER || newRole === GuildRole.MEMBER) {
      return prisma.guildMembership.update({
        where: {
          guildId_userId: {
            guildId,
            userId: targetUserId
          }
        },
        data: { role: newRole }
      });
    }
  }

  if (targetMembership.role === GuildRole.LEADER && actorMembership.role !== GuildRole.LEADER) {
    throw new Error('Only the guild leader can modify another leader.');
  }

  if (targetMembership.role === GuildRole.OFFICER && actorMembership.role !== GuildRole.LEADER) {
    throw new Error('Only the guild leader can modify other officers.');
  }

  if (newRole === GuildRole.LEADER) {
    if (actorMembership.role !== GuildRole.LEADER) {
      throw new Error('Only the guild leader can appoint a new leader.');
    }

    if (targetMembership.userId === actorMembership.userId) {
      return prisma.guildMembership.update({
        where: {
          guildId_userId: {
            guildId,
            userId: targetUserId
          }
        },
        data: { role: GuildRole.LEADER }
      });
    }

    await prisma.$transaction([
      prisma.guildMembership.update({
        where: {
          guildId_userId: {
            guildId,
            userId: targetMembership.userId
          }
        },
        data: { role: GuildRole.LEADER }
      }),
      prisma.guildMembership.update({
        where: {
          guildId_userId: {
            guildId,
            userId: actorMembership.userId
          }
        },
        data: { role: GuildRole.OFFICER }
      })
    ]);

    return prisma.guildMembership.findUnique({
      where: {
        guildId_userId: { guildId, userId: targetMembership.userId }
      }
    });
  }

  return prisma.guildMembership.update({
    where: {
      guildId_userId: {
        guildId,
        userId: targetUserId
      }
    },
    data: {
      role: newRole
    }
  });
}
