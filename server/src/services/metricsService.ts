import { createHash } from 'crypto';

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
  start?: Date | null;
  end: Date;
}

export interface IgnoredUnknownAttendanceResult {
  characterName: string;
  ignoredThrough: IsoDateString;
}

const UNKNOWN_ATTENDANCE_IGNORE_PREFIX = 'metrics:unknownAttendanceIgnore';

function toIsoString(date: Date | null | undefined): IsoDateString | null {
  if (!date) {
    return null;
  }
  const iso = date.toISOString();
  return iso;
}

function normalizeUnknownAttendanceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getUnknownAttendanceIgnoreKey(guildId: string, normalizedName: string): string {
  const nameHash = createHash('sha1').update(normalizedName).digest('hex');
  return `${UNKNOWN_ATTENDANCE_IGNORE_PREFIX}:${guildId}:${nameHash}`;
}

function parseIgnoredUnknownAttendanceSetting(
  guildId: string,
  value: string
): { normalizedName: string; ignoredThrough: Date } | null {
  try {
    const parsed = JSON.parse(value) as {
      guildId?: unknown;
      normalizedName?: unknown;
      ignoredThrough?: unknown;
    };
    if (parsed.guildId !== guildId) {
      return null;
    }
    if (typeof parsed.normalizedName !== 'string' || typeof parsed.ignoredThrough !== 'string') {
      return null;
    }
    const ignoredThrough = new Date(parsed.ignoredThrough);
    if (Number.isNaN(ignoredThrough.getTime())) {
      return null;
    }
    return {
      normalizedName: parsed.normalizedName,
      ignoredThrough
    };
  } catch {
    return null;
  }
}

async function listIgnoredUnknownAttendance(guildId: string): Promise<Map<string, Date>> {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        startsWith: `${UNKNOWN_ATTENDANCE_IGNORE_PREFIX}:${guildId}:`
      }
    },
    select: {
      value: true
    }
  });

  const ignoredByName = new Map<string, Date>();
  for (const row of rows) {
    const parsed = parseIgnoredUnknownAttendanceSetting(guildId, row.value);
    if (!parsed) {
      continue;
    }
    const existing = ignoredByName.get(parsed.normalizedName);
    if (!existing || parsed.ignoredThrough.getTime() > existing.getTime()) {
      ignoredByName.set(parsed.normalizedName, parsed.ignoredThrough);
    }
  }
  return ignoredByName;
}

export async function ignoreUnknownAttendanceThrough({
  guildId,
  characterName,
  ignoredByUserId,
  ignoredThrough = new Date()
}: {
  guildId: string;
  characterName: string;
  ignoredByUserId: string;
  ignoredThrough?: Date;
}): Promise<IgnoredUnknownAttendanceResult> {
  const normalizedName = normalizeUnknownAttendanceName(characterName);
  if (!normalizedName) {
    throw new Error('Character name is required.');
  }

  const key = getUnknownAttendanceIgnoreKey(guildId, normalizedName);
  const payload = {
    guildId,
    characterName: characterName.trim(),
    normalizedName,
    ignoredThrough: ignoredThrough.toISOString(),
    ignoredByUserId,
    ignoredAt: new Date().toISOString()
  };

  await prisma.systemSetting.upsert({
    where: { key },
    update: {
      value: JSON.stringify(payload)
    },
    create: {
      key,
      value: JSON.stringify(payload)
    }
  });

  return {
    characterName: payload.characterName,
    ignoredThrough: payload.ignoredThrough
  };
}

async function findEarliestMetricsDate(guildId: string): Promise<Date | null> {
  const [earliestAttendanceRaid, earliestLootByCreatedAt, earliestLootByEventTime] =
    await Promise.all([
      prisma.raidEvent.findFirst({
        where: {
          guildId,
          attendance: {
            some: {
              records: {
                some: {}
              }
            }
          }
        },
        select: {
          startTime: true
        },
        orderBy: {
          startTime: 'asc'
        }
      }),
      prisma.raidLootEvent.findFirst({
        where: {
          guildId
        },
        select: {
          createdAt: true,
          eventTime: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      }),
      prisma.raidLootEvent.findFirst({
        where: {
          guildId,
          eventTime: {
            not: null
          }
        },
        select: {
          eventTime: true
        },
        orderBy: {
          eventTime: 'asc'
        }
      })
    ]);

  const candidates = [
    earliestAttendanceRaid?.startTime,
    earliestLootByCreatedAt?.createdAt,
    earliestLootByEventTime?.eventTime
  ].filter((date): date is Date => Boolean(date));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, candidate) =>
    candidate.getTime() < earliest.getTime() ? candidate : earliest
  );
}

export async function getGuildMetrics(options: GuildMetricsOptions): Promise<GuildMetricsPayload> {
  const { guildId, end } = options;
  const earliestMetricsDate = await findEarliestMetricsDate(guildId);
  const start =
    options.start ?? earliestMetricsDate ?? new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

  const attendanceRecordsRaw = await prisma.attendanceRecord.findMany({
    where: {
      attendanceEvent: {
        raid: {
          guildId,
          startTime: {
            gte: start,
            lte: end
          }
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

  const ignoredUnknownAttendance = await listIgnoredUnknownAttendance(guildId);
  const attendanceRecordsForMetrics = attendanceRecordsRaw.filter((record) => {
    const linkedUserId = record.character?.userId ?? record.character?.user?.id ?? null;
    if (linkedUserId) {
      return true;
    }
    const normalizedName = normalizeUnknownAttendanceName(
      record.character?.name ?? record.characterName ?? ''
    );
    const ignoredThrough = ignoredUnknownAttendance.get(normalizedName);
    if (!ignoredThrough) {
      return true;
    }
    const occurredAt = record.attendanceEvent.raid?.startTime ?? record.attendanceEvent.createdAt;
    return occurredAt.getTime() > ignoredThrough.getTime();
  });

  const attendanceRecords: AttendanceMetricRecord[] = [];
  const lootEvents: LootMetricEvent[] = [];

  const uniqueClasses = new Set<string>();
  const uniqueCharacters = new Map<string, GuildMetricsFilterOptions['characters'][number]>();
  const uniqueRaids = new Map<string, { id: string; name: string }>();
  const uniqueLooters = new Map<string, { name: string; looterClass: string | null }>();
  const summaryAttendanceCharacterKeys = new Set<string>();

  const guildMains = await prisma.character.findMany({
    where: {
      guildId,
      isMain: true
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
      attendanceRecordsForMetrics
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

  const resolveUserMains = (userId: string | null | undefined) => {
    if (!userId) {
      return [];
    }
    return mainByUserId.get(userId) ?? [];
  };

  const registerCharacter = (
    entry: GuildMetricsFilterOptions['characters'][number],
    key: string
  ) => {
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
  };

  const pushAttendanceRecord = (record: AttendanceMetricRecord) => {
    attendanceRecords.push(record);
  };

  for (const record of attendanceRecordsForMetrics) {
    const raid = record.attendanceEvent.raid;
    if (raid) {
      uniqueRaids.set(raid.id, { id: raid.id, name: raid.name });
    }

    const resolvedByName =
      !record.characterId && record.characterName
        ? resolvedCharacterMap.get(record.characterName.trim().toLowerCase())
        : null;

    const resolvedClass = record.class ?? record.character?.class ?? resolvedByName?.class ?? null;
    if (resolvedClass) {
      uniqueClasses.add(resolvedClass);
    }

    const characterId = record.character?.id ?? record.characterId ?? resolvedByName?.id ?? null;
    const characterName =
      record.character?.name ?? record.characterName ?? resolvedByName?.name ?? '';
    const isMainValue = Boolean(resolvedByName?.isMain ?? record.character?.isMain);
    const resolvedUserId =
      record.character?.userId ?? record.character?.user?.id ?? resolvedByName?.userId ?? null;
    const resolvedDisplayName =
      record.character?.user?.displayName ?? resolvedByName?.user?.displayName ?? null;
    const resolvedClassFinal = resolvedClass ?? resolvedByName?.class ?? null;
    const effectiveCharacterId = characterId;
    const effectiveCharacterName = characterName;
    const effectiveUserId = resolvedUserId;
    const effectiveDisplayName = resolvedDisplayName;
    const effectiveClass = resolvedClassFinal;
    const effectiveIsMain = isMainValue;

    const characterEntry = {
      id: effectiveCharacterId,
      name: effectiveCharacterName,
      class: effectiveClass,
      userId: effectiveUserId,
      userDisplayName: effectiveDisplayName,
      isMain: effectiveIsMain
    };

    if (effectiveCharacterId) {
      registerCharacter(characterEntry, `id:${effectiveCharacterId}`);
      summaryAttendanceCharacterKeys.add(`id:${effectiveCharacterId}`);
    } else {
      const fallbackKey = `name:${characterName.toLowerCase()}`;
      registerCharacter(characterEntry, fallbackKey);
      summaryAttendanceCharacterKeys.add(fallbackKey);
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
        id: effectiveCharacterId,
        name: effectiveCharacterName,
        class: effectiveClass,
        isMain: effectiveIsMain ? true : (record.character?.isMain ?? null),
        userId: effectiveUserId,
        userDisplayName: effectiveDisplayName
      }
    });

    const allMains = resolveUserMains(resolvedUserId);
    for (const main of allMains) {
      if (main.id === effectiveCharacterId) {
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
    uniqueAttendanceCharacters: summaryAttendanceCharacterKeys.size,
    lootEvents: lootEvents.length,
    uniqueLooters: uniqueLooters.size,
    raidsTracked: uniqueRaids.size
  };

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
    earliestRaidDate: toIsoString(earliestMetricsDate)
  };
}
