import { AttendanceEventType, AttendanceStatus, CharacterClass, Prisma } from '@prisma/client';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { ensureUserCanEditRaid } from './raidService.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
import { syncRaidSignupsWithAttendance } from './raidSignupService.js';
function normalizeNullableJsonInput(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return Prisma.JsonNull;
    }
    return value;
}
export async function listAttendanceEvents(raidEventId) {
    const events = await prisma.attendanceEvent.findMany({
        where: { raidEventId },
        orderBy: { createdAt: 'desc' },
        include: {
            createdBy: {
                select: {
                    id: true,
                    displayName: true,
                    nickname: true
                }
            },
            records: {
                include: {
                    character: {
                        select: {
                            id: true,
                            name: true,
                            isMain: true
                        }
                    }
                }
            }
        }
    });
    const fallbackNames = new Set();
    for (const event of events) {
        for (const record of event.records) {
            if (!record.character?.isMain && !record.characterId && record.characterName) {
                fallbackNames.add(record.characterName);
            }
        }
    }
    const fallbackMainByName = await fetchMainFlagsByName(Array.from(fallbackNames));
    return events.map((event) => ({
        ...event,
        createdBy: withPreferredDisplayName(event.createdBy),
        records: event.records.map(({ character, ...rest }) => ({
            ...rest,
            isMain: resolveRecordIsMain(rest, character, fallbackMainByName)
        }))
    }));
}
export async function getAttendanceEvent(attendanceEventId) {
    const attendanceEvent = await prisma.attendanceEvent.findUnique({
        where: { id: attendanceEventId },
        include: {
            records: {
                include: {
                    character: {
                        select: {
                            id: true,
                            name: true,
                            isMain: true
                        }
                    }
                }
            },
            raid: {
                select: {
                    id: true,
                    guildId: true,
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
    if (!attendanceEvent) {
        return null;
    }
    const fallbackMainByName = await fetchMainFlagsByName(attendanceEvent.records
        .filter((record) => !record.character?.isMain && !record.characterId && record.characterName)
        .map((record) => record.characterName));
    return {
        ...attendanceEvent,
        createdBy: withPreferredDisplayName(attendanceEvent.createdBy),
        records: attendanceEvent.records.map(({ character, ...rest }) => ({
            ...rest,
            isMain: resolveRecordIsMain(rest, character, fallbackMainByName)
        }))
    };
}
export async function deleteAttendanceEvent(attendanceEventId) {
    const event = await prisma.attendanceEvent.findUnique({
        where: { id: attendanceEventId },
        select: { raidEventId: true }
    });
    if (!event) {
        return;
    }
    await prisma.attendanceRecord.deleteMany({
        where: { attendanceEventId }
    });
    await prisma.attendanceEvent.delete({
        where: { id: attendanceEventId }
    });
    await syncRaidSignupsWithAttendance(event.raidEventId);
}
export async function createAttendanceEvent(input) {
    const { guildId } = await ensureUserCanEditRaid(input.raidEventId, input.createdById);
    const raid = await prisma.raidEvent.findUnique({
        where: { id: input.raidEventId },
        select: {
            id: true,
            name: true,
            guild: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    if (!raid) {
        throw new Error('Raid event not found.');
    }
    const event = await prisma.attendanceEvent.create({
        data: {
            raidEventId: input.raidEventId,
            createdById: input.createdById,
            eventType: input.eventType ?? AttendanceEventType.LOG,
            note: input.note,
            snapshot: normalizeNullableJsonInput(input.snapshot),
            records: input.records && input.records.length > 0
                ? {
                    create: input.records.map((record) => ({
                        characterId: record.characterId ?? undefined,
                        characterName: record.characterName,
                        level: record.level ?? undefined,
                        class: record.class ?? undefined,
                        groupNumber: record.groupNumber ?? undefined,
                        status: record.status ?? AttendanceStatus.PRESENT,
                        flags: record.flags ?? undefined
                    }))
                }
                : undefined
        },
        include: {
            records: {
                include: {
                    character: {
                        select: {
                            id: true,
                            name: true,
                            isMain: true
                        }
                    }
                }
            }
        }
    });
    const fallbackMainByName = await fetchMainFlagsByName(event.records
        .filter((record) => !record.character?.isMain && !record.characterId && record.characterName)
        .map((record) => record.characterName));
    emitDiscordWebhookEvent(guildId, 'attendance.logged', {
        guildName: raid.guild.name,
        raidId: raid.id,
        raidName: raid.name,
        attendanceEventId: event.id,
        eventType: event.eventType,
        note: event.note ?? null,
        createdAt: event.createdAt,
        characters: formatAttendanceCharacters(event.records.map((record) => ({
            characterName: record.characterName,
            class: record.class ?? null
        })))
    });
    await syncRaidSignupsWithAttendance(input.raidEventId);
    return {
        ...event,
        records: event.records.map(({ character, ...rest }) => ({
            ...rest,
            isMain: resolveRecordIsMain(rest, character, fallbackMainByName)
        }))
    };
}
export async function overwriteAttendanceEventRecords(input) {
    const existing = await prisma.attendanceEvent.findUnique({
        where: { id: input.attendanceEventId },
        select: {
            id: true,
            raidEventId: true
        }
    });
    if (!existing) {
        throw new Error('Attendance event not found.');
    }
    await ensureUserCanEditRaid(existing.raidEventId, input.actorUserId);
    await prisma.attendanceRecord.deleteMany({
        where: { attendanceEventId: input.attendanceEventId }
    });
    if (input.records.length > 0) {
        await prisma.attendanceRecord.createMany({
            data: input.records.map((record) => ({
                attendanceEventId: input.attendanceEventId,
                characterId: record.characterId ?? undefined,
                characterName: record.characterName,
                level: record.level ?? undefined,
                class: record.class ?? undefined,
                groupNumber: record.groupNumber ?? undefined,
                status: record.status ?? AttendanceStatus.PRESENT,
                flags: record.flags ?? undefined
            }))
        });
    }
    await prisma.attendanceEvent.update({
        where: { id: input.attendanceEventId },
        data: {
            snapshot: normalizeNullableJsonInput(input.snapshot),
            note: input.note ?? undefined
        }
    });
    const updated = await getAttendanceEvent(input.attendanceEventId);
    if (!updated) {
        throw new Error('Attendance event not found.');
    }
    const raid = await prisma.raidEvent.findUnique({
        where: { id: existing.raidEventId },
        select: {
            id: true,
            name: true,
            guild: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    if (raid) {
        emitDiscordWebhookEvent(raid.guild.id, 'attendance.updated', {
            guildName: raid.guild.name,
            raidId: raid.id,
            raidName: raid.name,
            attendanceEventId: input.attendanceEventId,
            updatedAt: new Date(),
            characters: formatAttendanceCharacters(input.records.map((record) => ({
                characterName: record.characterName,
                class: record.class ?? null
            })))
        });
    }
    await syncRaidSignupsWithAttendance(existing.raidEventId);
    return updated;
}
export async function listRecentAttendanceForUser(userId, limit = 10) {
    const [memberships, characters] = await Promise.all([
        prisma.guildMembership.findMany({
            where: { userId },
            select: { guildId: true }
        }),
        prisma.character.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                isMain: true
            }
        })
    ]);
    if (characters.length === 0) {
        return [];
    }
    const recordFilters = [];
    const characterIds = characters.map((character) => character.id);
    const characterNames = characters.map((character) => character.name);
    if (characterIds.length > 0) {
        recordFilters.push({ characterId: { in: characterIds } });
    }
    if (characterNames.length > 0) {
        recordFilters.push({ characterName: { in: characterNames } });
    }
    if (recordFilters.length === 0) {
        return [];
    }
    const guildIds = memberships.map((membership) => membership.guildId);
    const raidGuildFilter = guildIds.length > 0
        ? {
            guildId: {
                in: guildIds
            }
        }
        : undefined;
    const attendanceEvents = await prisma.attendanceEvent.findMany({
        where: {
            raid: raidGuildFilter ? { ...raidGuildFilter } : undefined,
            records: {
                some: {
                    OR: recordFilters
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: limit,
        include: {
            raid: {
                select: {
                    id: true,
                    name: true,
                    startTime: true,
                    guild: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            },
            records: {
                where: {
                    OR: recordFilters
                },
                include: {
                    character: {
                        select: {
                            id: true,
                            isMain: true
                        }
                    }
                }
            }
        }
    });
    const mainCharactersById = new Set(characters.filter((character) => character.isMain).map((character) => character.id));
    const mainCharactersByName = new Set(characters
        .filter((character) => character.isMain)
        .map((character) => character.name.toLowerCase()));
    return attendanceEvents.map((event) => ({
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        eventType: event.eventType,
        note: event.note ?? null,
        raid: {
            id: event.raid.id,
            name: event.raid.name,
            startTime: event.raid.startTime.toISOString(),
            guild: {
                id: event.raid.guild.id,
                name: event.raid.guild.name
            }
        },
        characters: event.records.map(({ character, ...record }) => ({
            id: record.id,
            characterId: record.characterId ?? null,
            characterName: record.characterName,
            status: record.status,
            flags: record.flags ?? null,
            level: record.level ?? null,
            class: record.class ?? null,
            isMain: resolveRecordIsMain(record, character, null, mainCharactersById, mainCharactersByName)
        }))
    }));
}
async function fetchMainFlagsByName(names) {
    const uniqueNames = Array.from(new Set(names.filter(Boolean)));
    if (uniqueNames.length === 0) {
        return new Map();
    }
    const characters = await prisma.character.findMany({
        where: {
            name: {
                in: uniqueNames
            }
        },
        select: {
            name: true,
            isMain: true
        }
    });
    const map = new Map();
    for (const character of characters) {
        map.set(character.name.toLowerCase(), character.isMain);
    }
    return map;
}
function resolveRecordIsMain(record, character, fallbackByName, mainCharactersById, mainCharactersByName) {
    if (character?.isMain) {
        return true;
    }
    if (record.characterId && mainCharactersById?.has(record.characterId)) {
        return true;
    }
    const name = record.characterName?.toLowerCase();
    if (!name) {
        return false;
    }
    if (fallbackByName?.has(name)) {
        return fallbackByName.get(name) ?? false;
    }
    if (mainCharactersByName?.has(name)) {
        return true;
    }
    return false;
}
export function resolveClassFromString(className) {
    if (!className) {
        return null;
    }
    const normalized = className.trim().toLowerCase();
    const mapping = {
        bard: CharacterClass.BARD,
        beastlord: CharacterClass.BEASTLORD,
        berserker: CharacterClass.BERSERKER,
        cleric: CharacterClass.CLERIC,
        druid: CharacterClass.DRUID,
        enchanter: CharacterClass.ENCHANTER,
        magician: CharacterClass.MAGICIAN,
        monk: CharacterClass.MONK,
        necromancer: CharacterClass.NECROMANCER,
        paladin: CharacterClass.PALADIN,
        ranger: CharacterClass.RANGER,
        rogue: CharacterClass.ROGUE,
        'shadow knight': CharacterClass.SHADOWKNIGHT,
        shaman: CharacterClass.SHAMAN,
        warrior: CharacterClass.WARRIOR,
        wizard: CharacterClass.WIZARD
    };
    return mapping[normalized] ?? CharacterClass.UNKNOWN;
}
const CLASS_ABBREVIATIONS = {
    [CharacterClass.BARD]: 'BRD',
    [CharacterClass.BEASTLORD]: 'BST',
    [CharacterClass.BERSERKER]: 'BER',
    [CharacterClass.CLERIC]: 'CLR',
    [CharacterClass.DRUID]: 'DRU',
    [CharacterClass.ENCHANTER]: 'ENC',
    [CharacterClass.MAGICIAN]: 'MAG',
    [CharacterClass.MONK]: 'MNK',
    [CharacterClass.NECROMANCER]: 'NEC',
    [CharacterClass.PALADIN]: 'PAL',
    [CharacterClass.RANGER]: 'RNG',
    [CharacterClass.ROGUE]: 'ROG',
    [CharacterClass.SHADOWKNIGHT]: 'SHD',
    [CharacterClass.SHAMAN]: 'SHM',
    [CharacterClass.WARRIOR]: 'WAR',
    [CharacterClass.WIZARD]: 'WIZ',
    [CharacterClass.UNKNOWN]: 'UNK'
};
function formatAttendanceCharacters(records) {
    return records.map((record) => {
        const name = record.characterName?.trim() || 'Unknown';
        const abbreviation = getClassAbbreviation(record.class);
        return `${name} (${abbreviation})`;
    });
}
function getClassAbbreviation(characterClass) {
    if (!characterClass) {
        return CLASS_ABBREVIATIONS[CharacterClass.UNKNOWN];
    }
    return CLASS_ABBREVIATIONS[characterClass] ?? CLASS_ABBREVIATIONS[CharacterClass.UNKNOWN];
}
