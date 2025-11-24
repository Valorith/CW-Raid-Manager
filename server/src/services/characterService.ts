import { Character, CharacterClass, Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';

interface CreateCharacterInput {
  name: string;
  level: number;
  class: CharacterClass;
  archetype?: Prisma.CharacterCreateInput['archetype'];
  guildId?: string | null;
  userId: string;
  isMain?: boolean;
}

export class MainCharacterLimitError extends Error {
  constructor() {
    super('You can only designate up to two main characters.');
    this.name = 'MainCharacterLimitError';
  }
}

export async function listCharactersForUser(userId: string) {
  const [characters, memberships] = await Promise.all([
    prisma.character.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: {
        guild: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.guildMembership.findMany({
      where: { userId },
      select: { guildId: true }
    })
  ]);

  const allowedGuildIds = new Set(memberships.map((membership) => membership.guildId));

  return characters.map((character) => sanitizeCharacterGuild(character, allowedGuildIds));
}

export async function createCharacter(input: CreateCharacterInput) {
  const desiredIsMain = input.isMain === undefined ? false : input.isMain;

  if (desiredIsMain) {
    await assertMainCapacity(input.userId);
  }

  const character = await prisma.character.create({
    data: {
      name: input.name,
      level: input.level,
      class: input.class,
      archetype: input.archetype,
      guildId: input.guildId ?? undefined,
      userId: input.userId,
      isMain: desiredIsMain
    },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return ensureCharacterGuildForUser(character);
}

export async function updateCharacter(
  characterId: string,
  userId: string,
  data: Partial<Omit<CreateCharacterInput, 'userId'>>
) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, userId }
  });

  if (!character) {
    throw new Error('Character not found.');
  }

  if (data.isMain === true && character.isMain === false) {
    await assertMainCapacity(userId, characterId);
  }

  const updated = await prisma.character.update({
    where: { id: characterId },
    data: {
      name: data.name ?? character.name,
      level: data.level ?? character.level,
      class: (data.class as CharacterClass) ?? character.class,
      archetype: data.archetype ?? character.archetype,
      guildId: data.guildId ?? character.guildId,
      isMain: data.isMain ?? character.isMain
    },
    include: {
      guild: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return ensureCharacterGuildForUser(updated);
}

export async function deleteCharacter(characterId: string, userId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, userId }
  });

  if (!character) {
    throw new Error('Character not found.');
  }

  await prisma.$transaction([
    prisma.attendanceRecord.updateMany({
      where: { characterId },
      data: { characterId: null }
    }),
    prisma.questAssignment.updateMany({
      where: { characterId },
      data: { characterId: null }
    }),
    prisma.character.delete({ where: { id: characterId } })
  ]);
}

async function assertMainCapacity(userId: string, excludeCharacterId?: string) {
  const count = await prisma.character.count({
    where: {
      userId,
      isMain: true,
      ...(excludeCharacterId
        ? {
            id: {
              not: excludeCharacterId
            }
          }
        : {})
    }
  });

  if (count >= 2) {
    throw new MainCharacterLimitError();
  }
}

export async function detachUserCharactersFromGuild(guildId: string, userId: string) {
  await prisma.character.updateMany({
    where: {
      guildId,
      userId
    },
    data: {
      guildId: null
    }
  });
}

function sanitizeCharacterGuild<T extends Character & { guild: { id: string; name: string } | null }>(
  character: T,
  allowedGuildIds: Set<string>
): T {
  if (!character.guildId || allowedGuildIds.has(character.guildId)) {
    return character;
  }

  return {
    ...character,
    guild: null
  } as T;
}

async function ensureCharacterGuildForUser<T extends Character & { guild: { id: string; name: string } | null }>(
  character: T
): Promise<T> {
  if (!character.guildId) {
    return {
      ...character,
      guild: null
    } as T;
  }

  const membership = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId: character.guildId,
        userId: character.userId
      }
    },
    select: { guildId: true }
  });

  if (!membership) {
    return {
      ...character,
      guild: null
    } as T;
  }

  return character;
}
