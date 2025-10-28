import { LootListMatchType, LootListType } from '@prisma/client';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
const CREATED_BY_INCLUDE = {
    createdBy: {
        select: {
            id: true,
            displayName: true,
            nickname: true
        }
    }
};
function mapEntry(entry) {
    return {
        ...entry,
        createdBy: entry.createdBy ? withPreferredDisplayName(entry.createdBy) : null
    };
}
export function normalizeLootItemName(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
export async function listGuildLootListEntries(options) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
    const skip = (page - 1) * pageSize;
    const sortBy = options.sortBy ?? 'itemName';
    const direction = options.sortDirection ?? 'asc';
    const where = {
        guildId: options.guildId,
        type: options.type
    };
    if (options.search) {
        const normalizedSearch = normalizeLootItemName(options.search);
        const numericSearch = Number.parseInt(options.search, 10);
        const orConditions = [
            {
                itemNameNormalized: {
                    contains: normalizedSearch
                }
            }
        ];
        if (!Number.isNaN(numericSearch)) {
            orConditions.push({
                itemId: numericSearch
            });
        }
        where.AND = [
            {
                OR: orConditions
            }
        ];
    }
    const orderBy = (() => {
        switch (sortBy) {
            case 'itemId':
                return [
                    { itemId: direction },
                    { itemNameNormalized: direction }
                ];
            case 'createdAt':
                return [
                    { createdAt: direction },
                    { itemNameNormalized: 'asc' }
                ];
            case 'itemName':
            default:
                return [
                    { itemNameNormalized: direction },
                    { itemId: 'asc' }
                ];
        }
    })();
    const [total, entries] = await prisma.$transaction([
        prisma.guildLootListEntry.count({ where }),
        prisma.guildLootListEntry.findMany({
            where,
            include: CREATED_BY_INCLUDE,
            orderBy,
            skip,
            take: pageSize
        })
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
        entries: entries.map(mapEntry),
        total,
        page,
        totalPages,
        pageSize
    };
}
export async function getGuildLootListSummary(guildId) {
    const entries = await prisma.guildLootListEntry.findMany({
        where: { guildId },
        include: CREATED_BY_INCLUDE,
        orderBy: [
            { type: 'asc' },
            { itemNameNormalized: 'asc' }
        ]
    });
    const whitelist = [];
    const blacklist = [];
    for (const entry of entries) {
        const mapped = mapEntry(entry);
        if (entry.type === LootListType.WHITELIST) {
            whitelist.push(mapped);
        }
        else {
            blacklist.push(mapped);
        }
    }
    return { whitelist, blacklist };
}
export async function findGuildLootListEntryByIdentifier(options) {
    if (options.itemId != null) {
        const byId = await prisma.guildLootListEntry.findFirst({
            where: {
                guildId: options.guildId,
                type: options.type,
                itemId: options.itemId
            },
            include: CREATED_BY_INCLUDE
        });
        if (byId) {
            return mapEntry(byId);
        }
    }
    if (options.itemName) {
        const normalized = normalizeLootItemName(options.itemName);
        const byName = await prisma.guildLootListEntry.findFirst({
            where: {
                guildId: options.guildId,
                type: options.type,
                itemNameNormalized: normalized
            },
            include: CREATED_BY_INCLUDE
        });
        if (byName) {
            return mapEntry(byName);
        }
    }
    return null;
}
export async function createGuildLootListEntry(options) {
    const normalizedName = normalizeLootItemName(options.itemName);
    const matchType = options.itemId != null ? LootListMatchType.ITEM_ID : LootListMatchType.ITEM_NAME;
    const existing = await prisma.guildLootListEntry.findFirst({
        where: options.itemId != null
            ? {
                guildId: options.guildId,
                type: options.type,
                itemId: options.itemId
            }
            : {
                guildId: options.guildId,
                type: options.type,
                itemNameNormalized: normalizedName
            }
    });
    const data = {
        guild: {
            connect: { id: options.guildId }
        },
        type: options.type,
        itemId: options.itemId ?? null,
        itemName: options.itemName,
        itemNameNormalized: normalizedName,
        matchType,
        createdBy: options.createdById
            ? {
                connect: { id: options.createdById }
            }
            : undefined
    };
    if (existing) {
        const updated = await prisma.guildLootListEntry.update({
            where: { id: existing.id },
            data: {
                itemName: options.itemName,
                itemNameNormalized: normalizedName,
                itemId: options.itemId ?? existing.itemId,
                matchType
            },
            include: CREATED_BY_INCLUDE
        });
        return mapEntry(updated);
    }
    const created = await prisma.guildLootListEntry.create({
        data,
        include: CREATED_BY_INCLUDE
    });
    return mapEntry(created);
}
export async function updateGuildLootListEntry(entryId, guildId, data) {
    const updateData = {};
    if (data.type) {
        updateData.type = data.type;
    }
    if (data.itemName !== undefined) {
        updateData.itemName = data.itemName;
        updateData.itemNameNormalized = normalizeLootItemName(data.itemName);
    }
    if (data.itemId !== undefined) {
        updateData.itemId = data.itemId;
        updateData.matchType =
            data.itemId != null ? LootListMatchType.ITEM_ID : LootListMatchType.ITEM_NAME;
    }
    const updated = await prisma.guildLootListEntry.update({
        where: { id: entryId, guildId },
        data: updateData,
        include: CREATED_BY_INCLUDE
    });
    return mapEntry(updated);
}
export async function deleteGuildLootListEntry(entryId, guildId) {
    await prisma.guildLootListEntry.delete({
        where: { id: entryId, guildId }
    });
}
