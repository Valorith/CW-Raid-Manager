import { Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';

export interface GuildNpcNoteInput {
  npcName: string;
  notes?: string | null;
  allaLink?: string | null;
  spells?: Array<{ name: string; allaLink: string }>;
  relatedNpcs?: Array<{ name: string; allaLink: string }>;
}

function normalizeNpcName(name: string) {
  return name.trim().toLowerCase();
}

function formatNote(record: Prisma.GuildNpcNoteGetPayload<{ include: { spells: true; relatedNpcs: true } }>) {
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

export function normalizeAllaLink(input?: string | null) {
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

export async function listGuildNpcNotes(guildId: string) {
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

export async function getGuildNpcNote(guildId: string, npcName: string) {
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

export async function upsertGuildNpcNote(
  guildId: string,
  editor: { userId: string; displayName: string },
  input: GuildNpcNoteInput
) {
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

export async function deleteGuildNpcNote(guildId: string, npcName: string) {
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

export async function approveGuildNpcNoteDeletion(guildId: string, npcName: string) {
  await deleteGuildNpcNote(guildId, npcName);
}

export async function requestGuildNpcNoteDeletion(
  guildId: string,
  npcName: string,
  requester: { userId: string; displayName: string }
) {
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

export async function denyGuildNpcNoteDeletion(guildId: string, npcName: string) {
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
