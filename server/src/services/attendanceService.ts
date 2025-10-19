import { AttendanceStatus, CharacterClass, Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { ensureUserCanEditRaid } from './raidService.js';

export interface AttendanceRecordInput {
  characterId?: string | null;
  characterName: string;
  level?: number | null;
  class?: CharacterClass | null;
  groupNumber?: number | null;
  status?: AttendanceStatus;
  flags?: string | null;
}

function normalizeNullableJsonInput(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

interface CreateAttendanceEventInput {
  raidEventId: string;
  createdById: string;
  note?: string | null;
  snapshot?: unknown;
  records: AttendanceRecordInput[];
}

export async function listAttendanceEvents(raidEventId: string) {
  return prisma.attendanceEvent.findMany({
    where: { raidEventId },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      },
      records: true
    }
  });
}

export async function getAttendanceEvent(attendanceEventId: string) {
  return prisma.attendanceEvent.findUnique({
    where: { id: attendanceEventId },
    include: {
      records: true,
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
          displayName: true
        }
      }
    }
  });
}

export async function createAttendanceEvent(input: CreateAttendanceEventInput) {
  await ensureUserCanEditRaid(input.raidEventId, input.createdById);

  return prisma.attendanceEvent.create({
    data: {
      raidEventId: input.raidEventId,
      createdById: input.createdById,
      note: input.note,
      snapshot: normalizeNullableJsonInput(input.snapshot),
      records: {
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
    },
    include: {
      records: true
    }
  });
}

export function resolveClassFromString(className?: string | null): CharacterClass | null {
  if (!className) {
    return null;
  }

  const normalized = className.trim().toLowerCase();
  const mapping: Record<string, CharacterClass> = {
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
