import { AttendanceStatus, GuildRole, Prisma } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { canManageGuild, getUserGuildRole } from './guildService.js';
import { emitDiscordWebhookEvent, isDiscordWebhookEventEnabled } from './discordWebhookService.js';
import { stopLootMonitorSession } from './logMonitorService.js';
import { listRaidNpcKillSummary, listRaidNpcKillEvents } from './raidNpcKillService.js';

const MAX_RECURRENCE_INTERVAL = 52;
const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
type RaidRecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

const MASTER_LOOTER_NAMES = ['Master Looter', 'master looter', 'MASTER LOOTER'];

async function raidHasUnassignedLoot(raidId: string): Promise<boolean> {
  const count = await prisma.raidLootEvent.count({
    where: {
      raidId,
      looterName: {
        in: MASTER_LOOTER_NAMES
      }
    }
  });
  return count > 0;
}

async function getUnassignedLootFlags(raidIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (raidIds.length === 0) {
    return map;
  }
  const results = await prisma.raidLootEvent.findMany({
    where: {
      raidId: { in: raidIds },
      looterName: {
        in: MASTER_LOOTER_NAMES
      }
    },
    select: { raidId: true },
    distinct: ['raidId']
  });
  for (const row of results) {
    map.set(row.raidId, true);
  }
  return map;
}

type RecurrenceSettingsInput = {
  frequency: RaidRecurrenceFrequency;
  interval: number;
  endDate?: Date | null;
  isActive?: boolean;
};

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
  discordVoiceUrl?: string | null;
  recurrence?: RecurrenceSettingsInput | null;
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
  discordVoiceUrl?: string | null;
  recurrence?: RecurrenceSettingsInput | null;
}

export async function ensureCanManageRaid(userId: string, guildId: string) {
  const membership = await getUserGuildRole(userId, guildId);
  if (!membership || !canManageGuild(membership.role)) {
    throw new Error('Insufficient permissions to manage raid events for this guild.');
  }
  return membership.role;
}

export async function listRaidEventsForGuild(guildId: string) {
  const raids = await prisma.raidEvent.findMany({
    where: { guildId },
    orderBy: {
      startTime: 'desc'
    },
    include: {
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
          eventType: true
        }
      },
      recurrenceSeries: {
        select: {
          id: true,
          frequency: true,
          interval: true,
          endDate: true,
          isActive: true
        }
      }
    }
  });
  const raidIds = raids.map((raid) => raid.id);
  const unassignedMap = await getUnassignedLootFlags(raidIds);
  return raids.map((raid) => {
    const formatted = formatRaidWithRecurrence(raid);
    return {
      ...formatted,
      createdBy: withPreferredDisplayName(raid.createdBy),
      hasUnassignedLoot: unassignedMap.get(raid.id) ?? false
    };
  });
}

export async function createRaidEvent(input: CreateRaidInput) {
  await ensureCanManageRaid(input.createdById, input.guildId);

  const discordVoiceUrl = sanitizeUrl(input.discordVoiceUrl);

  const recurrenceSettings = normalizeRecurrenceInput(input.recurrence);
  let recurrenceSeriesId: string | undefined;

  if (recurrenceSettings) {
    const createdSeries = await raidSeries(prisma).create({
      data: {
        guildId: input.guildId,
        createdById: input.createdById,
        frequency: recurrenceSettings.frequency,
        interval: recurrenceSettings.interval,
        endDate: recurrenceSettings.endDate ?? null,
        isActive: recurrenceSettings.isActive ?? true
      }
    });
    recurrenceSeriesId = createdSeries.id;
  }

  const raid = await prisma.raidEvent.create({
    data: {
      guildId: input.guildId,
      createdById: input.createdById,
      name: input.name,
      startTime: input.startTime,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
  targetZones: sanitizeTargets(input.targetZones),
  targetBosses: sanitizeTargets(input.targetBosses),

      notes: input.notes,
      discordVoiceUrl,
      recurrenceSeriesId
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
      recurrenceSeries: {
        select: {
          id: true,
          frequency: true,
          interval: true,
          endDate: true,
          isActive: true
        }
      }
    }
  });

  emitDiscordWebhookEvent(input.guildId, 'raid.created', {
    guildName: raid.guild.name,
    raidId: raid.id,
    raidName: raid.name,
    startTime: raid.startTime,
    targetZones: normalizeStringArray(raid.targetZones),
    targetBosses: normalizeStringArray(raid.targetBosses),
    createdByName: withPreferredDisplayName(raid.createdBy).displayName
  });

  const formatted = formatRaidWithRecurrence(raid);

  return {
    ...formatted,
    createdBy: withPreferredDisplayName(raid.createdBy),
    hasUnassignedLoot: false
  };
}

export async function updateRaidEvent(
  raidId: string,
  userId: string,
  data: UpdateRaidInput
) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
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

  const discordVoiceUrlUpdate =
    data.discordVoiceUrl === undefined ? undefined : sanitizeUrl(data.discordVoiceUrl);

  const updateData: Prisma.RaidEventUpdateInput = {
    name: data.name ?? existing.name,
    startTime: (data.startTime as Date | undefined) ?? existing.startTime,
    startedAt: data.startedAt === undefined ? existing.startedAt : data.startedAt ?? null,
    endedAt: data.endedAt === undefined ? existing.endedAt : data.endedAt ?? null,
    targetZones:
      targetZonesUpdate !== undefined
        ? sanitizeTargets(targetZonesUpdate as string[])
        : sanitizeTargets(existing.targetZones as string[]),
    targetBosses:
      targetBossesUpdate !== undefined
        ? sanitizeTargets(targetBossesUpdate as string[])
        : sanitizeTargets(existing.targetBosses as string[]),
    notes: data.notes ?? existing.notes,
    isActive: data.isActive ?? existing.isActive
  };

  if (discordVoiceUrlUpdate !== undefined) {
    updateData.discordVoiceUrl = discordVoiceUrlUpdate;
  }

  const recurrenceInput =
    data.recurrence === undefined ? undefined : normalizeRecurrenceInput(data.recurrence);

  const updatedRaid = await prisma.$transaction(async (tx) => {
    let nextSeriesId = existing.recurrenceSeriesId ?? undefined;

    if (data.recurrence !== undefined) {
      if (!recurrenceInput) {
        if (existing.recurrenceSeriesId) {
          await raidSeries(tx).update({
            where: { id: existing.recurrenceSeriesId },
            data: {
              isActive: false,
              endDate: existing.startTime
            }
          });
        }
        nextSeriesId = undefined;
      } else if (existing.recurrenceSeriesId) {
        await raidSeries(tx).update({
          where: { id: existing.recurrenceSeriesId },
          data: {
            frequency: recurrenceInput.frequency,
            interval: recurrenceInput.interval,
            endDate: recurrenceInput.endDate ?? null,
            isActive: recurrenceInput.isActive ?? true
          }
        });
      } else {
        const newSeries = await raidSeries(tx).create({
          data: {
            guildId: existing.guildId,
            createdById: userId,
            frequency: recurrenceInput.frequency,
            interval: recurrenceInput.interval,
            endDate: recurrenceInput.endDate ?? null,
            isActive: recurrenceInput.isActive ?? true
          }
        });
        nextSeriesId = newSeries.id;
      }
    }

    const raidUpdate: Prisma.RaidEventUpdateInput = {
      ...updateData
    };

    if (data.recurrence !== undefined) {
      if (nextSeriesId) {
        raidUpdate.recurrenceSeries = {
          connect: { id: nextSeriesId }
        };
      } else {
        raidUpdate.recurrenceSeries = {
          disconnect: true
        };
      }
    }

    return tx.raidEvent.update({
      where: { id: raidId },
      data: raidUpdate,
      include: {
        recurrenceSeries: {
          select: recurrenceSelection
        }
      }
    });
  });

  const formatted = formatRaidWithRecurrence(updatedRaid);
  return {
    ...formatted,
    hasUnassignedLoot: await raidHasUnassignedLoot(raidId)
  };
}

export async function getRaidEventById(raidId: string) {
  const raid = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          defaultRaidStartTime: true,
          defaultRaidEndTime: true,
          blacklistSpells: true
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
        include: {
          records: true
        }
      },
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
  });
  if (!raid) {
    return null;
  }
  const raidSignupNotificationsEnabled = await isDiscordWebhookEventEnabled(
    raid.guildId,
    'raid.signup'
  );
  const formatted = formatRaidWithRecurrence(raid);
  const hasUnassignedLoot = await raidHasUnassignedLoot(raidId);
  const npcKills = await listRaidNpcKillSummary(raidId);
  const npcKillEvents = await listRaidNpcKillEvents(raidId);
  return {
    ...formatted,
    raidSignupNotificationsEnabled,
    createdBy: withPreferredDisplayName(raid.createdBy),
    hasUnassignedLoot,
    npcKills,
    npcKillEvents
  };
}

export async function startRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  const updated = await prisma.raidEvent.update({
    where: { id: raidId },
    data: {
      startedAt: new Date(),
      endedAt: null,
      isActive: true
    },
    include: {
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
  });

  emitDiscordWebhookEvent(existing.guildId, 'raid.started', {
    guildName: existing.guild.name,
    raidId,
    raidName: existing.name,
    startedAt: updated.startedAt ?? new Date()
  });

  const formatted = formatRaidWithRecurrence(updated);
  return {
    ...formatted,
    hasUnassignedLoot: await raidHasUnassignedLoot(raidId)
  };
}

export async function endRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      },
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  const shouldEmitRaidEnded = existing.isActive;

  const transactionResult = await prisma.$transaction(async (tx) => {
    const updatedRaid = await tx.raidEvent.update({
      where: { id: raidId },
      data: {
        endedAt: new Date(),
        isActive: false
      },
      include: {
        recurrenceSeries: {
          select: recurrenceSelection
        }
      }
    });

    let attendeeCount: number | null = null;
    let lootCount: number | null = null;

    if (shouldEmitRaidEnded) {
      const guildMemberAttendances = await tx.guildMembership.findMany({
        where: {
          guildId: existing.guildId,
          user: {
            characters: {
              some: {
                attendanceRecords: {
                  some: {
                    attendanceEvent: {
                      raidEventId: raidId
                    },
                    status: {
                      not: AttendanceStatus.ABSENT
                    }
                  }
                }
              }
            }
          }
        },
        select: {
          userId: true
        }
      });

      attendeeCount = new Set(guildMemberAttendances.map((membership) => membership.userId)).size;
      lootCount = await tx.raidLootEvent.count({
        where: { raidId }
      });
    }

    const nextRaid = await maybeCreateNextRecurringRaid(tx, updatedRaid, userId);

    return { updatedRaid, attendeeCount, lootCount, nextRaid };
  });

  const { updatedRaid, attendeeCount, lootCount, nextRaid } = transactionResult;

  stopLootMonitorSession(raidId);

  if (shouldEmitRaidEnded) {
    emitDiscordWebhookEvent(existing.guildId, 'raid.ended', {
      guildName: existing.guild.name,
      raidId,
      raidName: existing.name,
      startedAt: updatedRaid.startedAt,
      endedAt: updatedRaid.endedAt ?? new Date(),
      attendeeCount: attendeeCount ?? undefined,
      lootCount: lootCount ?? undefined
    });
  }

  if (nextRaid) {
    emitDiscordWebhookEvent(nextRaid.guildId, 'raid.created', {
      guildName: nextRaid.guild.name,
      raidId: nextRaid.id,
      raidName: nextRaid.name,
      startTime: nextRaid.startTime,
      targetZones: normalizeStringArray(nextRaid.targetZones),
      targetBosses: normalizeStringArray(nextRaid.targetBosses),
      createdByName: withPreferredDisplayName(nextRaid.createdBy).displayName
    });
  }

  const formatted = formatRaidWithRecurrence(updatedRaid);
  return {
    ...formatted,
    hasUnassignedLoot: await raidHasUnassignedLoot(raidId)
  };
}

export async function restartRaidEvent(raidId: string, userId: string) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
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
    },
    include: {
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
  });

  emitDiscordWebhookEvent(existing.guildId, 'raid.started', {
    guildName: existing.guild.name,
    raidId,
    raidName: existing.name,
    startedAt: updated.startedAt ?? new Date()
  });

  const formatted = formatRaidWithRecurrence(updated);
  return {
    ...formatted,
    hasUnassignedLoot: await raidHasUnassignedLoot(raidId)
  };
}

export async function deleteRaidEvent(
  raidId: string,
  userId: string,
  scope: 'EVENT' | 'SERIES' = 'EVENT'
) {
  const existing = await prisma.raidEvent.findUnique({
    where: { id: raidId },
    include: {
      guild: {
        select: {
          name: true
        }
      },
      recurrenceSeries: {
        select: recurrenceSelection
      }
    }
  });

  if (!existing) {
    throw new Error('Raid event not found.');
  }

  await ensureCanManageRaid(userId, existing.guildId);

  const nextRaid = await prisma.$transaction(async (tx) => {
    let createdRaid: Awaited<ReturnType<typeof maybeCreateNextRecurringRaid>> = null;
    if (scope === 'EVENT') {
      createdRaid = await maybeCreateNextRecurringRaid(tx, existing, userId);
    } else if (scope === 'SERIES' && existing.recurrenceSeriesId) {
      await raidSeries(tx).update({
        where: { id: existing.recurrenceSeriesId },
        data: {
          isActive: false,
          endDate: existing.startTime
        }
      });
    }

    await tx.attendanceRecord.deleteMany({
      where: {
        attendanceEvent: {
          raidEventId: raidId
        }
      }
    });

    await tx.attendanceEvent.deleteMany({
      where: { raidEventId: raidId }
    });

    await tx.raidLootEvent.deleteMany({
      where: { raidId }
    });

    await tx.raidSignup.deleteMany({
      where: { raidId }
    });

    await tx.raidEvent.delete({
      where: { id: raidId }
    });

    return createdRaid;
  });

  emitDiscordWebhookEvent(existing.guildId, 'raid.deleted', {
    guildName: existing.guild?.name ?? 'Guild',
    raidId,
    raidName: existing.name ?? 'Unnamed Raid'
  });

  if (nextRaid) {
    emitDiscordWebhookEvent(nextRaid.guildId, 'raid.created', {
      guildName: nextRaid.guild.name,
      raidId: nextRaid.id,
      raidName: nextRaid.name,
      startTime: nextRaid.startTime,
      targetZones: normalizeStringArray(nextRaid.targetZones),
      targetBosses: normalizeStringArray(nextRaid.targetBosses),
      createdByName: withPreferredDisplayName(nextRaid.createdBy).displayName
    });
  }
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

const recurrenceSelection = {
  id: true,
  frequency: true,
  interval: true,
  endDate: true,
  isActive: true
} as const;

type RecurrenceSelection = {
  id: string;
  frequency: RaidRecurrenceFrequency;
  interval: number;
  endDate: Date | null;
  isActive: boolean;
};

type RecurrenceSelectionValue = RecurrenceSelection | null | undefined;

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

function raidSeries(client: PrismaClientOrTx) {
  return (client as unknown as { raidEventSeries: any }).raidEventSeries;
}

function formatRaidWithRecurrence<T extends { recurrenceSeries?: RecurrenceSelectionValue }>(raid: T) {
  const { recurrenceSeries, ...rest } = raid;
  return {
    ...(rest as Record<string, unknown>),
    isRecurring: Boolean(recurrenceSeries),
    recurrence: formatRecurrenceForResponse(recurrenceSeries ?? null)
  } as any;
}

function formatRecurrenceForResponse(series: RecurrenceSelection | null) {
  if (!series) {
    return null;
  }
  return {
    id: series.id,
    frequency: series.frequency,
    interval: series.interval,
    endDate: series.endDate,
    isActive: series.isActive
  };
}

async function maybeCreateNextRecurringRaid(
  tx: Prisma.TransactionClient,
  raid: Prisma.RaidEventGetPayload<{
    include: { recurrenceSeries: { select: typeof recurrenceSelection } };
  }>,
  actorId: string
) {
  if (!raid.recurrenceSeriesId || !raid.recurrenceSeries || !raid.recurrenceSeries.isActive) {
    return null;
  }

  const nextStart = calculateNextOccurrence(raid.startTime, raid.recurrenceSeries);
  if (!nextStart) {
    return null;
  }

  if (raid.recurrenceSeries.endDate && nextStart > raid.recurrenceSeries.endDate) {
    return null;
  }

  const duplicate = await tx.raidEvent.findFirst({
    where: {
      recurrenceSeriesId: raid.recurrenceSeriesId,
      startTime: nextStart
    },
    select: {
      id: true
    }
  });

  if (duplicate) {
    return null;
  }

  return tx.raidEvent.create({
    data: {
      guildId: raid.guildId,
      createdById: actorId,
      name: raid.name,
      startTime: nextStart,
      targetZones: raid.targetZones as Prisma.InputJsonValue,
      targetBosses: raid.targetBosses as Prisma.InputJsonValue,
      notes: raid.notes,
      discordVoiceUrl: raid.discordVoiceUrl,
      recurrenceSeriesId: raid.recurrenceSeriesId
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
      }
    }
  });
}

function calculateNextOccurrence(
  startTime: Date,
  series: { frequency: RaidRecurrenceFrequency; interval: number }
) {
  const interval = Math.max(1, series.interval);
  switch (series.frequency) {
    case 'DAILY':
      return addDays(startTime, interval);
    case 'WEEKLY':
      return addDays(startTime, interval * 7);
    case 'MONTHLY':
      return addMonths(startTime, interval);
    default:
      return null;
  }
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, milliseconds)
  );
}

function normalizeRecurrenceInput(settings?: RecurrenceSettingsInput | null) {
  if (!settings) {
    return null;
  }

  const interval = Number.isFinite(settings.interval)
    ? Math.max(1, Math.min(Math.floor(settings.interval), MAX_RECURRENCE_INTERVAL))
    : 1;

  return {
    frequency: settings.frequency,
    interval,
    endDate: settings.endDate ?? null,
    isActive: settings.isActive ?? true
  };
}

function normalizeStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!value || !Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry === null || entry === undefined) {
        return '';
      }
      return String(entry).trim();
    })
    .filter((entry) => entry.length > 0);
}

function sanitizeUrl(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch (error) {
    try {
      const prefixed = new URL(`https://${trimmed}`);
      return prefixed.toString();
    } catch (nestedError) {
      return null;
    }
  }
}

function sanitizeTargets(values: string[] | null | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }
  const filtered = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
  return filtered.length > 0 ? filtered : [];
}
