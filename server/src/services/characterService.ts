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
  return prisma.character.create({
    data: {
      name: input.name,
      level: input.level,
      class: input.class,
      archetype: input.archetype,
      guildId: input.guildId ?? undefined,
      userId: input.userId,
      isMain: input.isMain ?? true
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
