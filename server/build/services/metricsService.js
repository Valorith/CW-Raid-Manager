import { prisma } from '../utils/prisma.js';
function toIsoString(date) {
    if (!date) {
        return null;
    }
    const iso = date.toISOString();
    return iso;
}
export async function getGuildMetrics(options) {
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
    const attendanceRecords = [];
    const lootEvents = [];
    const uniqueClasses = new Set();
    const uniqueCharacters = new Map();
    const uniqueRaids = new Map();
    const uniqueLooters = new Map();
    const attendanceCharacterKeys = new Set();
    for (const record of attendanceRecordsRaw) {
        const raid = record.attendanceEvent.raid;
        if (raid) {
            uniqueRaids.set(raid.id, { id: raid.id, name: raid.name });
        }
        const resolvedClass = record.class ?? record.character?.class ?? null;
        if (resolvedClass) {
            uniqueClasses.add(resolvedClass);
        }
        const characterId = record.character?.id ?? record.characterId ?? null;
        const characterName = record.character?.name ?? record.characterName;
        const isMainValue = Boolean(record.character?.isMain);
        const characterEntry = {
            id: characterId,
            name: characterName,
            class: resolvedClass,
            userId: record.character?.userId ?? record.character?.user?.id ?? null,
            userDisplayName: record.character?.user?.displayName ?? null,
            isMain: isMainValue
        };
        if (characterId) {
            const key = `id:${characterId}`;
            const existing = uniqueCharacters.get(key);
            if (existing) {
                uniqueCharacters.set(key, {
                    ...existing,
                    class: existing.class ?? characterEntry.class,
                    userId: existing.userId ?? characterEntry.userId,
                    userDisplayName: existing.userDisplayName ?? characterEntry.userDisplayName,
                    isMain: existing.isMain || characterEntry.isMain
                });
            }
            else {
                uniqueCharacters.set(key, characterEntry);
            }
            attendanceCharacterKeys.add(`id:${characterId}`);
        }
        else {
            const key = `name:${characterName.toLowerCase()}`;
            const existing = uniqueCharacters.get(key);
            if (existing) {
                uniqueCharacters.set(key, {
                    ...existing,
                    class: existing.class ?? characterEntry.class,
                    userId: existing.userId ?? characterEntry.userId,
                    userDisplayName: existing.userDisplayName ?? characterEntry.userDisplayName,
                    isMain: existing.isMain || characterEntry.isMain
                });
            }
            else {
                uniqueCharacters.set(key, characterEntry);
            }
            attendanceCharacterKeys.add(key);
        }
        attendanceRecords.push({
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
    const summary = {
        attendanceRecords: attendanceRecords.length,
        uniqueAttendanceCharacters: attendanceCharacterKeys.size,
        lootEvents: lootEvents.length,
        uniqueLooters: uniqueLooters.size,
        raidsTracked: uniqueRaids.size
    };
    let earliestDate = null;
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
    }
    catch (error) {
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
        }
        catch (error) {
            // ignore and fall back to metrics range
        }
    }
    const filterOptions = {
        classes: Array.from(uniqueClasses).sort(),
        characters: Array.from(uniqueCharacters.values()).sort((a, b) => a.name.localeCompare(b.name)),
        raids: Array.from(uniqueRaids.values()).sort((a, b) => a.name.localeCompare(b.name)),
        lootParticipants: Array.from(uniqueLooters.values()).sort((a, b) => a.name.localeCompare(b.name))
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
