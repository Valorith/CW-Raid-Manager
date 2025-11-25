import { AttendanceEventType, AttendanceStatus, CharacterClass } from '@prisma/client';

import { prisma } from '../utils/prisma.js';

type IsoDateString = string;

export interface MetricsDateRange {
  start: IsoDateString;
  end: IsoDateString;
}

export interface AttendanceMetricRecord {
  id: string;
  status: AttendanceStatus;
  timestamp: IsoDateString;
  eventType: AttendanceEventType;
  raid: {
    id: string;
    name: string;
    startTime: IsoDateString | null;
  };
  character: {
    id: string | null;
    name: string;
    class: CharacterClass | null;
    isMain: boolean | null;
    userId: string | null;
    userDisplayName: string | null;
  };
}

export interface LootMetricEvent {
  id: string;
  timestamp: IsoDateString;
  createdAt: IsoDateString;
  itemName: string;
  itemId: number | null;
  itemIconId: number | null;
  looterName: string;
  looterClass: string | null;
  emoji: string | null;
  raid: {
    id: string;
    name: string;
    startTime: IsoDateString | null;
  };
}

export interface GuildMetricsSummary {
  attendanceRecords: number;
  uniqueAttendanceCharacters: number;
  lootEvents: number;
  uniqueLooters: number;
  raidsTracked: number;
}

export interface GuildMetricsFilterOptions {
  classes: string[];
  characters: Array<{
    id: string | null;
    name: string;
    class: CharacterClass | null;
    userId: string | null;
    userDisplayName: string | null;
    isMain: boolean;
  }>;
  raids: Array<{ id: string; name: string }>;
  lootParticipants: Array<{ name: string; looterClass: string | null }>;
}

export interface GuildMetricsPayload {
  range: MetricsDateRange;
  attendanceRecords: AttendanceMetricRecord[];
  lootEvents: LootMetricEvent[];
  summary: GuildMetricsSummary;
  filterOptions: GuildMetricsFilterOptions;
  earliestRaidDate: IsoDateString | null;
}

export interface GuildMetricsOptions {
  guildId: string;
  start: Date;
  end: Date;
}

function toIsoString(date: Date | null | undefined): IsoDateString | null {
  if (!date) {
    return null;
  }
  const iso = date.toISOString();
  return iso;
}

export async function getGuildMetrics(options: GuildMetricsOptions): Promise<GuildMetricsPayload> {
  const { guildId, start, end } = options;

  const attendanceRecordsRaw = await prisma.attendanceRecord.findMany({
    where: {
      attendanceEvent: {
        raid: {
          guildId
        },
        createdAt: {
          gte: start,
          lte: end
        }
      }
    },
    include: {
      attendanceEvent: {
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          raid: {
            select: {
              id: true,
              name: true,
              startTime: true
            }
          }
        }
      },
      character: {
        select: {
          id: true,
          name: true,
          class: true,
          isMain: true,
          userId: true,
          user: {
            select: {
              id: true,
              displayName: true
            }
          }
        }
      }
    },
    orderBy: {
      attendanceEvent: {
        createdAt: 'asc'
      }
    }
  });

  const lootEventsRaw = await prisma.raidLootEvent.findMany({
    where: {
      guildId,
      createdAt: {
        gte: start,
        lte: end
      }
    },
    include: {
      raid: {
        select: {
          id: true,
          name: true,
          startTime: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  const attendanceRecords: AttendanceMetricRecord[] = [];
  const lootEvents: LootMetricEvent[] = [];

  const uniqueClasses = new Set<string>();
  const uniqueCharacters = new Map<string, GuildMetricsFilterOptions['characters'][number]>();
  const uniqueRaids = new Map<string, { id: string; name: string }>();
  const uniqueLooters = new Map<string, { name: string; looterClass: string | null }>();
  const attendanceCharacterKeys = new Set<string>();

  const guildMains = await prisma.character.findMany({
    where: {
      guildId,
      isMain: true
    },
    select: {
      id: true,
      name: true,
      class: true,
      userId: true,
      user: {
        select: {
          displayName: true
        }
      }
    }
  });

  const mainByUserId = new Map<string, typeof guildMains>();
  for (const main of guildMains) {
    if (!main.userId) {
      continue;
    }
    const list = mainByUserId.get(main.userId) ?? [];
    list.push(main);
    mainByUserId.set(main.userId, list);
  }

  const missingIds = Array.from(
    new Set(
      attendanceRecordsRaw
        .filter((record) => !record.characterId)
        .map((record) => record.characterName?.trim().toLowerCase())
        .filter(Boolean) as string[]
    )
  );

  const resolvedCharactersByName =
    missingIds.length > 0
      ? await prisma.character.findMany({
          where: {
            guildId,
            name: { in: missingIds }
          },
          select: {
            id: true,
            name: true,
            class: true,
            isMain: true,
            userId: true,
            user: {
              select: {
                displayName: true
              }
            }
          }
        })
      : [];
  const resolvedCharacterMap = new Map<string, (typeof resolvedCharactersByName)[number]>();
  for (const character of resolvedCharactersByName) {
    resolvedCharacterMap.set(character.name.toLowerCase(), character);
  }

  const registerCharacter = (entry: GuildMetricsFilterOptions['characters'][number], key: string) => {
    const existing = uniqueCharacters.get(key);
    if (existing) {
      uniqueCharacters.set(key, {
        ...existing,
        class: existing.class ?? entry.class,
        userId: existing.userId ?? entry.userId,
        userDisplayName: existing.userDisplayName ?? entry.userDisplayName,
        isMain: existing.isMain || entry.isMain
      });
    } else {
      uniqueCharacters.set(key, entry);
    }
    attendanceCharacterKeys.add(key);
  };

  const pushAttendanceRecord = (record: AttendanceMetricRecord) => {
    attendanceRecords.push(record);
  };

  for (const record of attendanceRecordsRaw) {
    const raid = record.attendanceEvent.raid;
    if (raid) {
      uniqueRaids.set(raid.id, { id: raid.id, name: raid.name });
    }

    const resolvedClass = record.class ?? record.character?.class ?? resolvedByName?.class ?? null;
    if (resolvedClass) {
      uniqueClasses.add(resolvedClass);
    }

    const resolvedByName =
      !record.characterId && record.characterName
        ? resolvedCharacterMap.get(record.characterName.trim().toLowerCase())
        : null;

    const characterId = record.character?.id ?? record.characterId ?? resolvedByName?.id ?? null;
    const characterName = record.character?.name ?? record.characterName ?? resolvedByName?.name ?? '';
    const isMainValue = resolvedByName?.isMain ?? Boolean(record.character?.isMain);
    const resolvedUserId = record.character?.userId ?? record.character?.user?.id ?? resolvedByName?.userId ?? null;
    const resolvedDisplayName = record.character?.user?.displayName ?? resolvedByName?.user?.displayName ?? null;
    const resolvedClassFinal = resolvedClass ?? resolvedByName?.class ?? null;

    const characterEntry = {
      id: characterId,
      name: characterName,
      class: resolvedClassFinal,
      userId: resolvedUserId,
      userDisplayName: resolvedDisplayName,
      isMain: isMainValue
    };

    if (characterId) {
      const key = `id:${characterId}`;
      registerCharacter(characterEntry, key);
    } else {
      const key = `name:${characterName.toLowerCase()}`;
      registerCharacter(characterEntry, key);
    }

    pushAttendanceRecord({
      id: record.id,
      status: record.status,
      timestamp: record.attendanceEvent.createdAt.toISOString(),
      eventType: record.attendanceEvent.eventType,
      raid: {
        id: raid?.id ?? '',
        name: raid?.name ?? 'Unknown Raid',
        startTime: toIsoString(raid?.startTime)
      },
      character: {
        id: characterId,
        name: characterName,
        class: resolvedClass,
        isMain: record.character?.isMain ?? null,
        userId: record.character?.userId ?? record.character?.user?.id ?? null,
        userDisplayName: record.character?.user?.displayName ?? null
      }
    });

    const userId = record.character?.userId ?? record.character?.user?.id ?? null;
    const isMain = Boolean(record.character?.isMain);
    if (userId && !isMain) {
      const mains = mainByUserId.get(userId) ?? [];
      for (const main of mains) {
        if (main.id === characterId) {
          continue;
        }
        const mainKey = main.id ? `id:${main.id}` : `name:${main.name.toLowerCase()}`;
        registerCharacter(
          {
            id: main.id,
            name: main.name,
            class: main.class,
            userId: main.userId,
            userDisplayName: main.user?.displayName ?? null,
            isMain: true
          },
          mainKey
        );
        pushAttendanceRecord({
          id: `${record.id}:main:${main.id ?? main.name}`,
          status: record.status,
          timestamp: record.attendanceEvent.createdAt.toISOString(),
          eventType: record.attendanceEvent.eventType,
          raid: {
            id: raid?.id ?? '',
            name: raid?.name ?? 'Unknown Raid',
            startTime: toIsoString(raid?.startTime)
          },
          character: {
            id: main.id,
            name: main.name,
            class: main.class,
            isMain: true,
            userId: main.userId,
            userDisplayName: main.user?.displayName ?? null
          }
        });
      }
    }
  }

  for (const event of lootEventsRaw) {
    const normalizedLooter = event.looterName?.trim().toLowerCase();
    if (normalizedLooter === 'master looter') {
      continue;
    }
    const raid = event.raid;
    if (raid) {
      uniqueRaids.set(raid.id, { id: raid.id, name: raid.name });
    }
    if (event.looterClass) {
      uniqueClasses.add(event.looterClass);
    }
    const looterKey = event.looterName.toLowerCase();
    if (!uniqueLooters.has(looterKey)) {
      uniqueLooters.set(looterKey, {
        name: event.looterName,
        looterClass: event.looterClass ?? null
      });
    }

    lootEvents.push({
      id: event.id,
      timestamp: toIsoString(event.eventTime) ?? event.createdAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
      itemName: event.itemName,
      itemId: event.itemId ?? null,
      itemIconId: event.itemIconId ?? null,
      looterName: event.looterName,
      looterClass: event.looterClass ?? null,
      emoji: event.emoji ?? null,
      raid: {
        id: raid?.id ?? '',
        name: raid?.name ?? 'Unknown Raid',
        startTime: toIsoString(raid?.startTime)
      }
    });
  }

  const summary: GuildMetricsSummary = {
    attendanceRecords: attendanceRecords.length,
    uniqueAttendanceCharacters: attendanceCharacterKeys.size,
    lootEvents: lootEvents.length,
    uniqueLooters: uniqueLooters.size,
    raidsTracked: uniqueRaids.size
  };

  let earliestDate: IsoDateString | null = null;

  try {
    const earliestRaid = await prisma.raidEvent.findFirst({
      where: {
        guildId,
        endedAt: {
          not: null
        }
      },
      select: {
        endedAt: true
      },
      orderBy: {
        endedAt: 'asc'
      }
    });

    if (earliestRaid?.endedAt) {
      earliestDate = earliestRaid.endedAt.toISOString();
    }
  } catch (error) {
    // ignore and fall back to attendance events
  }

  if (!earliestDate) {
    try {
      const earliestAttendance = await prisma.attendanceEvent.findFirst({
        where: {
          raid: {
            guildId
          }
        },
        select: {
          createdAt: true,
          raid: {
            select: {
              startTime: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (earliestAttendance) {
        earliestDate =
          earliestAttendance.raid.startTime?.toISOString() ??
          earliestAttendance.createdAt.toISOString();
      }
    } catch (error) {
      // ignore and fall back to metrics range
    }
  }

  const filterOptions: GuildMetricsFilterOptions = {
    classes: Array.from(uniqueClasses).sort(),
    characters: Array.from(uniqueCharacters.values()).sort((a, b) => a.name.localeCompare(b.name)),
    raids: Array.from(uniqueRaids.values()).sort((a, b) => a.name.localeCompare(b.name)),
    lootParticipants: Array.from(uniqueLooters.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  };

  return {
    range: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    attendanceRecords,
    lootEvents,
    summary,
    filterOptions,
    earliestRaidDate: earliestDate
  };
}
