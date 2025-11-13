import { prisma } from '../utils/prisma.js';
function normalizeNpcName(name) {
    return name.trim().toLowerCase();
}
function formatNote(record) {
    return {
        id: record.id,
        guildId: record.guildId,
        npcName: record.npcName,
        notes: record.notes ?? null,
        allaLink: record.allaLink ?? null,
        lastEditedById: record.lastEditedById ?? null,
        lastEditedByName: record.lastEditedByName ?? null,
        deletionRequestedById: record.deletionRequestedById ?? null,
        deletionRequestedByName: record.deletionRequestedByName ?? null,
        deletionRequestedAt: record.deletionRequestedAt ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        spells: record.spells.map((spell) => ({
            id: spell.id,
            name: spell.name,
            allaLink: spell.allaLink
        })),
        relatedNpcs: record.relatedNpcs.map((npc) => ({
            id: npc.id,
            name: npc.associatedNpcName,
            allaLink: npc.allaLink
        }))
    };
}
export function normalizeAllaLink(input) {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const withoutProtocol = withProtocol.replace(/^https?:\/\//i, '').toLowerCase();
    if (!withoutProtocol.startsWith('alla.clumsysworld.com')) {
        throw new Error('Alla links must start with alla.clumsysworld.com');
    }
    return withProtocol;
}
export async function listGuildNpcNotes(guildId) {
    const notes = await prisma.guildNpcNote.findMany({
        where: { guildId },
        include: {
            spells: true,
            relatedNpcs: true
        },
        orderBy: {
            npcName: 'asc'
        }
    });
    return notes.map((note) => formatNote(note));
}
export async function getGuildNpcNote(guildId, npcName) {
    const normalized = normalizeNpcName(npcName);
    const note = await prisma.guildNpcNote.findFirst({
        where: {
            guildId,
            npcNameNormalized: normalized
        },
        include: {
            spells: true,
            relatedNpcs: true
        }
    });
    return note ? formatNote(note) : null;
}
export async function upsertGuildNpcNote(guildId, editor, input) {
    const npcName = input.npcName.trim();
    if (!npcName) {
        throw new Error('NPC name is required.');
    }
    const normalized = normalizeNpcName(npcName);
    const noteData = {
        notes: input.notes?.trim() ? input.notes.trim() : null,
        allaLink: normalizeAllaLink(input.allaLink)
    };
    const spells = (input.spells ?? []).map((spell) => {
        const name = spell.name.trim();
        const link = normalizeAllaLink(spell.allaLink);
        if (!name || !link) {
            throw new Error('Spell name and Alla link are required.');
        }
        return { name, allaLink: link };
    });
    const relatedNpcs = (input.relatedNpcs ?? []).map((npc) => {
        const name = npc.name.trim();
        const link = normalizeAllaLink(npc.allaLink);
        if (!name || !link) {
            throw new Error('Associated NPC name and Alla link are required.');
        }
        return { name, allaLink: link };
    });
    const note = await prisma.$transaction(async (tx) => {
        const record = await tx.guildNpcNote.upsert({
            where: {
                guildId_npcNameNormalized: {
                    guildId,
                    npcNameNormalized: normalized
                }
            },
            update: {
                npcName,
                notes: noteData.notes,
                allaLink: noteData.allaLink,
                lastEditedById: editor.userId,
                lastEditedByName: editor.displayName,
                deletionRequestedById: null,
                deletionRequestedByName: null,
                deletionRequestedAt: null
            },
            create: {
                guildId,
                npcName,
                npcNameNormalized: normalized,
                notes: noteData.notes,
                allaLink: noteData.allaLink,
                lastEditedById: editor.userId,
                lastEditedByName: editor.displayName
            }
        });
        await tx.guildNpcNoteSpell.deleteMany({ where: { noteId: record.id } });
        await tx.guildNpcNoteAssociation.deleteMany({ where: { noteId: record.id } });
        if (spells.length > 0) {
            await tx.guildNpcNoteSpell.createMany({
                data: spells.map((spell) => ({
                    noteId: record.id,
                    name: spell.name,
                    allaLink: spell.allaLink
                }))
            });
        }
        if (relatedNpcs.length > 0) {
            await tx.guildNpcNoteAssociation.createMany({
                data: relatedNpcs.map((npc) => ({
                    noteId: record.id,
                    associatedNpcName: npc.name,
                    allaLink: npc.allaLink
                }))
            });
        }
        return record.id;
    });
    const updated = await prisma.guildNpcNote.findUnique({
        where: { id: note },
        include: {
            spells: true,
            relatedNpcs: true
        }
    });
    if (!updated) {
        throw new Error('NPC note could not be found after update.');
    }
    return formatNote(updated);
}
export async function deleteGuildNpcNote(guildId, npcName) {
    const normalized = normalizeNpcName(npcName);
    const existing = await prisma.guildNpcNote.findFirst({
        where: {
            guildId,
            npcNameNormalized: normalized
        }
    });
    if (!existing) {
        return;
    }
    await prisma.guildNpcNote.delete({ where: { id: existing.id } });
}
export async function approveGuildNpcNoteDeletion(guildId, npcName) {
    await deleteGuildNpcNote(guildId, npcName);
}
export async function requestGuildNpcNoteDeletion(guildId, npcName, requester) {
    const normalized = normalizeNpcName(npcName);
    const note = await prisma.guildNpcNote.findFirst({
        where: { guildId, npcNameNormalized: normalized }
    });
    if (!note) {
        throw new Error('NPC note not found.');
    }
    const updated = await prisma.guildNpcNote.update({
        where: { id: note.id },
        data: {
            deletionRequestedById: requester.userId,
            deletionRequestedByName: requester.displayName,
            deletionRequestedAt: new Date()
        },
        include: {
            spells: true,
            relatedNpcs: true
        }
    });
    return formatNote(updated);
}
export async function denyGuildNpcNoteDeletion(guildId, npcName) {
    const normalized = normalizeNpcName(npcName);
    const note = await prisma.guildNpcNote.findFirst({
        where: { guildId, npcNameNormalized: normalized }
    });
    if (!note) {
        throw new Error('NPC note not found.');
    }
    const updated = await prisma.guildNpcNote.update({
        where: { id: note.id },
        data: {
            deletionRequestedById: null,
            deletionRequestedByName: null,
            deletionRequestedAt: null
        },
        include: {
            spells: true,
            relatedNpcs: true
        }
    });
    return formatNote(updated);
}
