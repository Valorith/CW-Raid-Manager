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
