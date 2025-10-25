import { prisma } from '../utils/prisma.js';
import { convertPlaceholdersToRegex } from '../utils/patternPlaceholders.js';
const DEFAULT_PATTERN_PHRASES = [
    '{timestamp} {item} has been awarded to {looter} by the {method}.',
    '{timestamp} {item} has been awarded to {looter} by {method}.',
    '{timestamp} {item} has been donated to the Master Looter\'s guild.'
];
const DEFAULT_LOOT_PATTERNS = DEFAULT_PATTERN_PHRASES.map((phrase, index) => {
    const mapping = [
        { id: 'standard-master-looter', label: 'Awarded by Master Looter / Loot Council' },
        { id: 'standard-random-roll', label: 'Awarded by random roll' },
        { id: 'donation-to-guild', label: 'Donations to Master Looter guild' }
    ][index];
    return {
        id: mapping?.id ?? `default-${index}`,
        label: mapping?.label ?? `Pattern ${index + 1}`,
        pattern: convertPlaceholdersToRegex(phrase)
    };
});
const DEFAULT_LOOT_EMOJI = '💎';
const LEGACY_LOOT_PATTERN_FRAGMENT = '(?:loots|obtains|picks up)';
const AWARDING_PATTERN_FRAGMENT = 'has\\s+been\\s+awarded';
export async function getGuildLootParserSettings(guildId) {
    const settings = await prisma.guildLootParserSettings.findUnique({ where: { guildId } });
    return normalizeParserSettings(settings);
}
export async function updateGuildLootParserSettings(guildId, input) {
    const cleanedPatterns = Array.isArray(input.patterns)
        ? input.patterns.map((pattern, index) => {
            const compiledPattern = convertPlaceholdersToRegex(pattern.pattern);
            return {
                id: pattern.id || `pattern-${index}`,
                label: pattern.label || `Pattern ${index + 1}`,
                pattern: compiledPattern || DEFAULT_LOOT_PATTERNS[0].pattern
            };
        })
        : DEFAULT_LOOT_PATTERNS;
    const record = await prisma.guildLootParserSettings.upsert({
        where: { guildId },
        update: {
            patterns: cleanedPatterns,
            emoji: input.emoji ?? DEFAULT_LOOT_EMOJI
        },
        create: {
            guildId,
            patterns: cleanedPatterns,
            emoji: input.emoji ?? DEFAULT_LOOT_EMOJI
        }
    });
    return normalizeParserSettings(record);
}
export async function listRaidLootEvents(raidId) {
    return prisma.raidLootEvent.findMany({
        where: { raidId },
        orderBy: { eventTime: 'asc' }
    });
}
export async function createRaidLootEvents(options) {
    if (!options.events || options.events.length === 0) {
        return [];
    }
    const created = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const event of options.events) {
            const record = await tx.raidLootEvent.create({
                data: {
                    raidId: options.raidId,
                    guildId: options.guildId,
                    itemName: event.itemName,
                    looterName: event.looterName,
                    looterClass: event.looterClass ?? null,
                    eventTime: event.eventTime ? new Date(event.eventTime) : null,
                    emoji: event.emoji ?? null,
                    note: event.note ?? null,
                    createdById: options.createdById
                }
            });
            results.push(record);
        }
        return results;
    });
    return created;
}
export async function updateRaidLootEvent(lootId, guildId, data) {
    return prisma.raidLootEvent.update({
        where: {
            id: lootId,
            guildId
        },
        data: {
            itemName: data.itemName ?? undefined,
            looterName: data.looterName ?? undefined,
            looterClass: data.looterClass ?? undefined,
            eventTime: data.eventTime ? new Date(data.eventTime) : undefined,
            emoji: data.emoji ?? undefined,
            note: data.note ?? undefined
        }
    });
}
export async function deleteRaidLootEvent(lootId, guildId) {
    await prisma.raidLootEvent.delete({
        where: {
            id: lootId,
            guildId
        }
    });
}
export async function listRecentLootForUser(userId, options) {
    const characters = await prisma.character.findMany({
        where: { userId },
        select: { name: true }
    });
    if (!characters.length) {
        return { total: 0, loot: [] };
    }
    const characterNames = characters.map((character) => character.name);
    const [total, loot] = await prisma.$transaction([
        prisma.raidLootEvent.count({
            where: {
                looterName: {
                    in: characterNames
                }
            }
        }),
        prisma.raidLootEvent.findMany({
            where: {
                looterName: {
                    in: characterNames
                }
            },
            orderBy: [
                { eventTime: 'desc' },
                { createdAt: 'desc' }
            ],
            skip: options.offset,
            take: options.limit,
            include: {
                raid: {
                    include: {
                        guild: {
                            select: { id: true, name: true }
                        }
                    }
                }
            }
        })
    ]);
    return { total, loot };
}
function normalizeParserSettings(record) {
    if (!record) {
        return {
            patterns: DEFAULT_LOOT_PATTERNS,
            emoji: DEFAULT_LOOT_EMOJI
        };
    }
    const patterns = Array.isArray(record.patterns) && record.patterns.length > 0 ? record.patterns : DEFAULT_LOOT_PATTERNS;
    return {
        patterns: mergeWithAwardingDefaults(patterns),
        emoji: record.emoji ?? DEFAULT_LOOT_EMOJI
    };
}
export const defaultLootPatterns = DEFAULT_LOOT_PATTERNS;
export const defaultLootEmoji = DEFAULT_LOOT_EMOJI;
function mergeWithAwardingDefaults(patterns) {
    const hasAwardingPattern = patterns.some((pattern) => pattern.pattern?.includes(AWARDING_PATTERN_FRAGMENT));
    if (hasAwardingPattern) {
        return patterns;
    }
    const hasLegacyPattern = patterns.some((pattern) => pattern.pattern?.includes(LEGACY_LOOT_PATTERN_FRAGMENT));
    if (!hasLegacyPattern) {
        return patterns;
    }
    const missingDefaults = DEFAULT_LOOT_PATTERNS.filter((defaultPattern) => !patterns.some((pattern) => pattern.pattern === defaultPattern.pattern));
    return [...missingDefaults, ...patterns];
}
