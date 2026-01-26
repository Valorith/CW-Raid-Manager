import { prisma } from '../utils/prisma.js';
import { ensureUserCanViewGuild } from './raidService.js';
/**
 * Get user's availability entries for a guild within a date range
 */
export async function getUserAvailability(userId, guildId, startDate, endDate) {
    await ensureUserCanViewGuild(userId, guildId);
    const entries = await prisma.calendarAvailability.findMany({
        where: {
            userId,
            guildId,
            date: {
                gte: startDate,
                lte: endDate
            }
        },
        orderBy: {
            date: 'asc'
        }
    });
    return entries.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        guildId: entry.guildId,
        date: formatDateToISO(entry.date),
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
    }));
}
/**
 * Get availability summary for a guild (counts of available/unavailable users per date)
 */
export async function getGuildAvailabilitySummary(guildId, startDate, endDate) {
    const entries = await prisma.calendarAvailability.groupBy({
        by: ['date', 'status'],
        where: {
            guildId,
            date: {
                gte: startDate,
                lte: endDate
            }
        },
        _count: {
            id: true
        }
    });
    // Group by date
    const summaryMap = new Map();
    for (const entry of entries) {
        const dateKey = formatDateToISO(entry.date);
        const current = summaryMap.get(dateKey) ?? { unavailableCount: 0, availableCount: 0 };
        if (entry.status === 'UNAVAILABLE') {
            current.unavailableCount = entry._count.id;
        }
        else if (entry.status === 'AVAILABLE') {
            current.availableCount = entry._count.id;
        }
        summaryMap.set(dateKey, current);
    }
    return Array.from(summaryMap.entries()).map(([date, counts]) => ({
        date,
        ...counts
    }));
}
/**
 * Update or create multiple availability entries for a user
 */
export async function updateUserAvailability(userId, guildId, updates) {
    await ensureUserCanViewGuild(userId, guildId);
    if (updates.length === 0) {
        return [];
    }
    // Normalize and deduplicate updates by date
    const normalizedUpdates = new Map();
    for (const update of updates) {
        const dateKey = normalizeDate(update.date);
        if (dateKey) {
            normalizedUpdates.set(dateKey, {
                date: dateKey,
                status: update.status
            });
        }
    }
    const upsertOperations = Array.from(normalizedUpdates.values()).map((update) => {
        const dateObj = new Date(update.date + 'T00:00:00.000Z');
        return prisma.calendarAvailability.upsert({
            where: {
                userId_guildId_date: {
                    userId,
                    guildId,
                    date: dateObj
                }
            },
            update: {
                status: update.status
            },
            create: {
                userId,
                guildId,
                date: dateObj,
                status: update.status
            }
        });
    });
    const results = await prisma.$transaction(upsertOperations);
    return results.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        guildId: entry.guildId,
        date: formatDateToISO(entry.date),
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
    }));
}
/**
 * Delete availability entries for specific dates
 */
export async function deleteUserAvailability(userId, guildId, dates) {
    await ensureUserCanViewGuild(userId, guildId);
    if (dates.length === 0) {
        return 0;
    }
    const normalizedDates = dates
        .map((date) => normalizeDate(date))
        .filter((date) => date !== null)
        .map((date) => new Date(date + 'T00:00:00.000Z'));
    if (normalizedDates.length === 0) {
        return 0;
    }
    const result = await prisma.calendarAvailability.deleteMany({
        where: {
            userId,
            guildId,
            date: {
                in: normalizedDates
            }
        }
    });
    return result.count;
}
/**
 * Check if a user is unavailable on a specific date
 */
export async function isUserUnavailable(userId, guildId, date) {
    const entry = await prisma.calendarAvailability.findUnique({
        where: {
            userId_guildId_date: {
                userId,
                guildId,
                date
            }
        },
        select: {
            status: true
        }
    });
    return entry?.status === 'UNAVAILABLE';
}
/**
 * Get all users who are unavailable on a specific date
 */
export async function getUnavailableUsersForDate(guildId, date) {
    const entries = await prisma.calendarAvailability.findMany({
        where: {
            guildId,
            date,
            status: 'UNAVAILABLE'
        },
        select: {
            userId: true
        }
    });
    return entries.map((entry) => entry.userId);
}
/**
 * Get main characters for users who are unavailable on a specific date
 */
export async function getUnavailableMainCharacters(guildId, date) {
    const unavailableUserIds = await getUnavailableUsersForDate(guildId, date);
    if (unavailableUserIds.length === 0) {
        return [];
    }
    const mainCharacters = await prisma.character.findMany({
        where: {
            userId: {
                in: unavailableUserIds
            },
            guildId,
            isMain: true
        },
        select: {
            id: true,
            userId: true,
            name: true,
            class: true,
            level: true
        }
    });
    return mainCharacters.map((char) => ({
        userId: char.userId,
        characterId: char.id,
        characterName: char.name,
        characterClass: char.class,
        characterLevel: char.level
    }));
}
/**
 * Get detailed availability (with user info) for a specific date
 */
export async function getGuildAvailabilityDetails(guildId, date) {
    const entries = await prisma.calendarAvailability.findMany({
        where: {
            guildId,
            date
        },
        include: {
            user: {
                select: {
                    id: true,
                    displayName: true,
                    nickname: true,
                    characters: {
                        where: {
                            guildId,
                            isMain: true
                        },
                        select: {
                            id: true,
                            name: true,
                            class: true,
                            level: true
                        }
                    }
                }
            }
        }
    });
    return entries.map((entry) => ({
        userId: entry.userId,
        // Prefer nickname over displayName (nickname is user-set display name)
        displayName: entry.user.nickname?.trim() || entry.user.displayName,
        status: entry.status,
        mainCharacters: entry.user.characters
    }));
}
/**
 * Format a Date object to ISO date string (YYYY-MM-DD)
 */
function formatDateToISO(date) {
    return date.toISOString().split('T')[0];
}
/**
 * Normalize a date string to YYYY-MM-DD format
 */
function normalizeDate(dateStr) {
    try {
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return formatDateToISO(date);
    }
    catch {
        return null;
    }
}
