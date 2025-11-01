import { GuildRole } from '@prisma/client';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { canManageGuild, getUserGuildRole } from './guildService.js';
import { emitDiscordWebhookEvent, isDiscordWebhookEventEnabled } from './discordWebhookService.js';
const MAX_RECURRENCE_INTERVAL = 52;
const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];
export async function ensureCanManageRaid(userId, guildId) {
    const membership = await getUserGuildRole(userId, guildId);
    if (!membership || !canManageGuild(membership.role)) {
        throw new Error('Insufficient permissions to manage raid events for this guild.');
    }
    return membership.role;
}
export async function listRaidEventsForGuild(guildId) {
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
    return raids.map((raid) => {
        const formatted = formatRaidWithRecurrence(raid);
        return {
            ...formatted,
            createdBy: withPreferredDisplayName(raid.createdBy)
        };
    });
}
export async function createRaidEvent(input) {
    await ensureCanManageRaid(input.createdById, input.guildId);
    const discordVoiceUrl = sanitizeUrl(input.discordVoiceUrl);
    const recurrenceSettings = normalizeRecurrenceInput(input.recurrence);
    let recurrenceSeriesId;
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
            targetZones: input.targetZones,
            targetBosses: input.targetBosses,
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
        createdBy: withPreferredDisplayName(raid.createdBy)
    };
}
export async function updateRaidEvent(raidId, userId, data) {
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
    const targetZonesUpdate = data.targetZones === undefined
        ? undefined
        : data.targetZones;
    const targetBossesUpdate = data.targetBosses === undefined
        ? undefined
        : data.targetBosses;
    const discordVoiceUrlUpdate = data.discordVoiceUrl === undefined ? undefined : sanitizeUrl(data.discordVoiceUrl);
    const updateData = {
        name: data.name ?? existing.name,
        startTime: data.startTime ?? existing.startTime,
        startedAt: data.startedAt === undefined ? existing.startedAt : data.startedAt ?? null,
        endedAt: data.endedAt === undefined ? existing.endedAt : data.endedAt ?? null,
        targetZones: targetZonesUpdate ?? existing.targetZones,
        targetBosses: targetBossesUpdate ?? existing.targetBosses,
        notes: data.notes ?? existing.notes,
        isActive: data.isActive ?? existing.isActive
    };
    if (discordVoiceUrlUpdate !== undefined) {
        updateData.discordVoiceUrl = discordVoiceUrlUpdate;
    }
    const recurrenceInput = data.recurrence === undefined ? undefined : normalizeRecurrenceInput(data.recurrence);
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
            }
            else if (existing.recurrenceSeriesId) {
                await raidSeries(tx).update({
                    where: { id: existing.recurrenceSeriesId },
                    data: {
                        frequency: recurrenceInput.frequency,
                        interval: recurrenceInput.interval,
                        endDate: recurrenceInput.endDate ?? null,
                        isActive: recurrenceInput.isActive ?? true
                    }
                });
            }
            else {
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
        const raidUpdate = {
            ...updateData
        };
        if (data.recurrence !== undefined) {
            if (nextSeriesId) {
                raidUpdate.recurrenceSeries = {
                    connect: { id: nextSeriesId }
                };
            }
            else {
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
    return formatRaidWithRecurrence(updatedRaid);
}
export async function getRaidEventById(raidId) {
    const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        include: {
            guild: {
                select: {
                    id: true,
                    name: true,
                    defaultRaidStartTime: true,
                    defaultRaidEndTime: true
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
    const raidSignupNotificationsEnabled = await isDiscordWebhookEventEnabled(raid.guildId, 'raid.signup');
    const formatted = formatRaidWithRecurrence(raid);
    return {
        ...formatted,
        raidSignupNotificationsEnabled,
        createdBy: withPreferredDisplayName(raid.createdBy)
    };
}
export async function startRaidEvent(raidId, userId) {
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
    return formatRaidWithRecurrence(updated);
}
export async function endRaidEvent(raidId, userId) {
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
        const attendeeCount = await tx.attendanceRecord.count({
            where: {
                attendanceEvent: {
                    raidEventId: raidId
                }
            }
        });
        const lootCount = await tx.raidLootEvent.count({
            where: { raidId }
        });
        await maybeCreateNextRecurringRaid(tx, updatedRaid, userId);
        return { updatedRaid, attendeeCount, lootCount };
    });
    const { updatedRaid, attendeeCount, lootCount } = transactionResult;
    emitDiscordWebhookEvent(existing.guildId, 'raid.ended', {
        guildName: existing.guild.name,
        raidId,
        raidName: existing.name,
        startedAt: updatedRaid.startedAt,
        endedAt: updatedRaid.endedAt ?? new Date(),
        attendeeCount,
        lootCount
    });
    return formatRaidWithRecurrence(updatedRaid);
}
export async function restartRaidEvent(raidId, userId) {
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
    return formatRaidWithRecurrence(updated);
}
export async function deleteRaidEvent(raidId, userId, scope = 'EVENT') {
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
    await prisma.$transaction(async (tx) => {
        if (scope === 'EVENT') {
            await maybeCreateNextRecurringRaid(tx, existing, userId);
        }
        else if (scope === 'SERIES' && existing.recurrenceSeriesId) {
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
    });
    emitDiscordWebhookEvent(existing.guildId, 'raid.deleted', {
        guildName: existing.guild?.name ?? 'Guild',
        raidId,
        raidName: existing.name ?? 'Unnamed Raid'
    });
}
export async function ensureUserCanViewGuild(userId, guildId) {
    const membership = await getUserGuildRole(userId, guildId);
    if (!membership) {
        throw new Error('You must be a member of the guild to access this raid event.');
    }
    return membership.role;
}
export function roleCanEditRaid(role) {
    return role === GuildRole.LEADER || role === GuildRole.OFFICER || role === GuildRole.RAID_LEADER;
}
export async function ensureUserCanEditRaid(raidId, userId) {
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
};
function raidSeries(client) {
    return client.raidEventSeries;
}
function formatRaidWithRecurrence(raid) {
    const { recurrenceSeries, ...rest } = raid;
    return {
        ...rest,
        isRecurring: Boolean(recurrenceSeries),
        recurrence: formatRecurrenceForResponse(recurrenceSeries ?? null)
    };
}
function formatRecurrenceForResponse(series) {
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
async function maybeCreateNextRecurringRaid(tx, raid, actorId) {
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
            targetZones: raid.targetZones,
            targetBosses: raid.targetBosses,
            notes: raid.notes,
            discordVoiceUrl: raid.discordVoiceUrl,
            recurrenceSeriesId: raid.recurrenceSeriesId
        }
    });
}
function calculateNextOccurrence(startTime, series) {
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
function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}
function addMonths(date, months) {
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
    return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, milliseconds));
}
function normalizeRecurrenceInput(settings) {
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
function normalizeStringArray(value) {
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
function sanitizeUrl(value) {
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
    }
    catch (error) {
        try {
            const prefixed = new URL(`https://${trimmed}`);
            return prefixed.toString();
        }
        catch (nestedError) {
            return null;
        }
    }
}
