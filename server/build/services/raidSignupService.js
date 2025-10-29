import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
import { emitDiscordWebhookEvent } from './discordWebhookService.js';
import { ensureUserCanViewGuild } from './raidService.js';
const CHARACTER_CLASS_ABBREVIATIONS = {
    BARD: 'BRD',
    BEASTLORD: 'BST',
    BERSERKER: 'BER',
    CLERIC: 'CLR',
    DRUID: 'DRU',
    ENCHANTER: 'ENC',
    MAGICIAN: 'MAG',
    MONK: 'MNK',
    NECROMANCER: 'NEC',
    PALADIN: 'PAL',
    RANGER: 'RNG',
    ROGUE: 'ROG',
    SHADOWKNIGHT: 'SHD',
    SHAMAN: 'SHM',
    WARRIOR: 'WAR',
    WIZARD: 'WIZ',
    UNKNOWN: 'UNK'
};
export class RaidSignupLimitError extends Error {
    constructor() {
        super('You may only sign up two characters for a raid.');
        this.name = 'RaidSignupLimitError';
    }
}
export class RaidSignupInvalidCharacterError extends Error {
    constructor() {
        super('One or more selected characters could not be used for this raid.');
        this.name = 'RaidSignupInvalidCharacterError';
    }
}
export class RaidSignupPermissionError extends Error {
    constructor() {
        super('You do not have permission to manage signups for this raid.');
        this.name = 'RaidSignupPermissionError';
    }
}
export class RaidSignupLockedError extends Error {
    constructor() {
        super('Raid signups are locked once the raid has started.');
        this.name = 'RaidSignupLockedError';
    }
}
export async function listRaidSignups(raidId) {
    const signups = await prisma.raidSignup.findMany({
        where: { raidId },
        include: {
            user: {
                select: {
                    id: true,
                    displayName: true,
                    nickname: true
                }
            },
            character: {
                select: {
                    id: true,
                    name: true,
                    class: true,
                    level: true,
                    isMain: true
                }
            }
        },
        orderBy: [
            {
                createdAt: 'asc'
            }
        ]
    });
    return signups.map((signup) => {
        const preferredUser = withPreferredDisplayName(signup.user);
        return {
            id: signup.id,
            raidId: signup.raidId,
            userId: signup.userId,
            characterId: signup.characterId,
            characterName: signup.characterName,
            characterClass: signup.characterClass,
            characterLevel: signup.characterLevel,
            isMain: signup.isMain,
            createdAt: signup.createdAt,
            updatedAt: signup.updatedAt,
            user: {
                id: preferredUser.id,
                displayName: preferredUser.displayName,
                nickname: preferredUser.nickname ?? null
            },
            character: {
                id: signup.character.id,
                name: signup.characterName ?? signup.character.name,
                class: signup.characterClass,
                level: signup.characterLevel ?? signup.character.level ?? null,
                isMain: signup.character.isMain ?? signup.isMain
            }
        };
    });
}
export async function replaceRaidSignupsForUser(raidId, userId, characterIds) {
    const normalizedIds = Array.from(new Set(characterIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)));
    if (normalizedIds.length > 2) {
        throw new RaidSignupLimitError();
    }
    const raid = await prisma.raidEvent.findUnique({
        where: { id: raidId },
        select: {
            id: true,
            name: true,
            startedAt: true,
            startTime: true,
            guildId: true,
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
    try {
        await ensureUserCanViewGuild(userId, raid.guildId);
    }
    catch (error) {
        throw new RaidSignupPermissionError();
    }
    if (raid.startedAt) {
        throw new RaidSignupLockedError();
    }
    const [existingSignups, userRecord] = await Promise.all([
        prisma.raidSignup.findMany({
            where: {
                raidId,
                userId
            },
            select: {
                characterId: true,
                characterName: true,
                characterClass: true
            }
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                displayName: true,
                nickname: true
            }
        })
    ]);
    const preferredUser = withPreferredDisplayName(userRecord ?? {
        id: userId,
        displayName: 'Member',
        nickname: null
    });
    const eventContext = {
        guildId: raid.guildId,
        guildName: raid.guild?.name ?? 'Guild',
        raidId: raid.id,
        raidName: raid.name ?? 'Raid',
        raidStartTime: raid.startTime
    };
    if (normalizedIds.length === 0) {
        const removals = existingSignups.map((signup) => ({
            characterName: signup.characterName,
            characterClass: signup.characterClass
        }));
        if (removals.length > 0) {
            await prisma.raidSignup.deleteMany({
                where: {
                    raidId,
                    userId
                }
            });
            const updated = await listRaidSignups(raidId);
            await emitSignupNotifications(eventContext, preferredUser.displayName, [], removals);
            return updated;
        }
        await prisma.raidSignup.deleteMany({
            where: {
                raidId,
                userId
            }
        });
        return listRaidSignups(raidId);
    }
    const characters = await prisma.character.findMany({
        where: {
            id: {
                in: normalizedIds
            },
            userId
        },
        select: {
            id: true,
            name: true,
            class: true,
            level: true,
            isMain: true
        }
    });
    if (characters.length !== normalizedIds.length) {
        throw new RaidSignupInvalidCharacterError();
    }
    const existingIdSet = new Set(existingSignups.map((signup) => signup.characterId));
    const additions = characters.filter((character) => !existingIdSet.has(character.id));
    const normalizedIdSet = new Set(normalizedIds);
    const removals = existingSignups.filter((signup) => !normalizedIdSet.has(signup.characterId));
    await prisma.$transaction([
        prisma.raidSignup.deleteMany({
            where: {
                raidId,
                userId,
                characterId: {
                    notIn: normalizedIds
                }
            }
        }),
        ...characters.map((character) => prisma.raidSignup.upsert({
            where: {
                raidId_characterId: {
                    raidId,
                    characterId: character.id
                }
            },
            update: {
                userId,
                characterName: character.name,
                characterClass: character.class,
                characterLevel: character.level,
                isMain: character.isMain
            },
            create: {
                raidId,
                userId,
                characterId: character.id,
                characterName: character.name,
                characterClass: character.class,
                characterLevel: character.level,
                isMain: character.isMain
            }
        }))
    ]);
    const updatedSignups = await listRaidSignups(raidId);
    if (additions.length > 0 || removals.length > 0) {
        await emitSignupNotifications(eventContext, preferredUser.displayName, additions.map((character) => ({ name: character.name, class: character.class })), removals.map((signup) => ({
            characterName: signup.characterName,
            characterClass: signup.characterClass
        })));
    }
    return updatedSignups;
}
function getCharacterClassAbbreviation(characterClass) {
    const key = (characterClass ?? 'UNKNOWN');
    return CHARACTER_CLASS_ABBREVIATIONS[key] ?? CHARACTER_CLASS_ABBREVIATIONS.UNKNOWN;
}
async function emitSignupNotifications(context, userDisplayName, additions, removals) {
    const tasks = [];
    const now = new Date();
    if (additions.length > 0) {
        tasks.push(emitDiscordWebhookEvent(context.guildId, 'raid.signup', {
            guildId: context.guildId,
            guildName: context.guildName,
            raidId: context.raidId,
            raidName: context.raidName,
            entries: additions.map((character) => ({
                characterName: character.name,
                characterClass: character.class,
                characterClassLabel: getCharacterClassAbbreviation(character.class)
            })),
            userDisplayName,
            signedAt: now,
            raidStartTime: context.raidStartTime
        }));
    }
    for (const signup of removals) {
        tasks.push(emitDiscordWebhookEvent(context.guildId, 'raid.withdraw', {
            guildId: context.guildId,
            guildName: context.guildName,
            raidId: context.raidId,
            raidName: context.raidName,
            characterName: signup.characterName,
            characterClass: signup.characterClass,
            characterClassLabel: getCharacterClassAbbreviation(signup.characterClass),
            userDisplayName,
            withdrawnAt: now
        }));
    }
    if (tasks.length > 0) {
        await Promise.allSettled(tasks);
    }
}
