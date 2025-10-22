import { GuildRole } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { slugify } from '../utils/slugify.js';
export async function listGuilds() {
    return prisma.guild.findMany({
        orderBy: {
            name: 'asc'
        },
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            members: {
                select: {
                    id: true,
                    role: true,
                    user: {
                        select: {
                            id: true,
                            displayName: true
                        }
                    }
                }
            }
        }
    });
}
export async function getGuildById(id) {
    return prisma.guild.findUnique({
        where: { id },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            displayName: true
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
                    user: {
                        select: {
                            id: true,
                            displayName: true
                        }
                    }
                }
            }
        }
    });
}
async function ensureUniqueSlug(name) {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;
    while (true) {
        const existing = await prisma.guild.findUnique({ where: { slug } });
        if (!existing) {
            return slug;
        }
        counter += 1;
        slug = `${baseSlug}-${counter}`;
    }
}
export async function createGuild({ name, description, creatorUserId }) {
    const slug = await ensureUniqueSlug(name);
    return prisma.guild.create({
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
}
export async function getUserGuildRole(userId, guildId) {
    return prisma.guildMembership.findUnique({
        where: {
            guildId_userId: {
                guildId,
                userId
            }
        }
    });
}
export function canManageGuild(role) {
    return (role === GuildRole.LEADER || role === GuildRole.OFFICER || role === GuildRole.RAID_LEADER);
}
export async function updateGuildMemberRole({ actorUserId, guildId, targetUserId, newRole }) {
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
