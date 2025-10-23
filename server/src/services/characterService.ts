import { CharacterClass, Prisma } from '@prisma/client';

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
  return prisma.character.findMany({
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
  });
}

export async function createCharacter(input: CreateCharacterInput) {
  const desiredIsMain = input.isMain === undefined ? false : input.isMain;

  if (desiredIsMain) {
    await assertMainCapacity(input.userId);
  }

  return prisma.character.create({
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

  return prisma.character.update({
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
