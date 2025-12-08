import { AvailabilityStatus } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { ensureUserCanViewGuild } from './raidService.js';

export interface AvailabilityEntry {
  id: string;
  userId: string;
  guildId: string;
  date: string;
  status: AvailabilityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityUpdate {
  date: string;
  status: AvailabilityStatus;
}

export interface AvailabilitySummary {
  date: string;
  unavailableCount: number;
  availableCount: number;
}

/**
 * Get user's availability entries for a guild within a date range
 */
export async function getUserAvailability(
  userId: string,
  guildId: string,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityEntry[]> {
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
export async function getGuildAvailabilitySummary(
  guildId: string,
  startDate: Date,
  endDate: Date
): Promise<AvailabilitySummary[]> {
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
  const summaryMap = new Map<string, { unavailableCount: number; availableCount: number }>();

  for (const entry of entries) {
    const dateKey = formatDateToISO(entry.date);
    const current = summaryMap.get(dateKey) ?? { unavailableCount: 0, availableCount: 0 };

    if (entry.status === 'UNAVAILABLE') {
      current.unavailableCount = entry._count.id;
    } else if (entry.status === 'AVAILABLE') {
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
export async function updateUserAvailability(
  userId: string,
  guildId: string,
  updates: AvailabilityUpdate[]
): Promise<AvailabilityEntry[]> {
  await ensureUserCanViewGuild(userId, guildId);

  if (updates.length === 0) {
    return [];
  }

  // Normalize and deduplicate updates by date
  const normalizedUpdates = new Map<string, AvailabilityUpdate>();
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
export async function deleteUserAvailability(
  userId: string,
  guildId: string,
  dates: string[]
): Promise<number> {
  await ensureUserCanViewGuild(userId, guildId);

  if (dates.length === 0) {
    return 0;
  }

  const normalizedDates = dates
    .map((date) => normalizeDate(date))
    .filter((date): date is string => date !== null)
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
export async function isUserUnavailable(
  userId: string,
  guildId: string,
  date: Date
): Promise<boolean> {
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
export async function getUnavailableUsersForDate(
  guildId: string,
  date: Date
): Promise<string[]> {
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
export async function getUnavailableMainCharacters(
  guildId: string,
  date: Date
): Promise<Array<{
  userId: string;
  characterId: string;
  characterName: string;
  characterClass: string;
  characterLevel: number | null;
}>> {
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

export interface AvailabilityUserDetail {
  userId: string;
  displayName: string;
  status: AvailabilityStatus;
  mainCharacter?: {
    id: string;
    name: string;
    class: string;
    level: number | null;
  } | null;
}

/**
 * Get detailed availability (with user info) for a specific date
 */
export async function getGuildAvailabilityDetails(
  guildId: string,
  date: Date
): Promise<AvailabilityUserDetail[]> {
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
            },
            take: 1
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
    mainCharacter: entry.user.characters[0] ?? null
  }));
}

/**
 * Format a Date object to ISO date string (YYYY-MM-DD)
 */
function formatDateToISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Normalize a date string to YYYY-MM-DD format
 */
function normalizeDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return formatDateToISO(date);
  } catch {
    return null;
  }
}
