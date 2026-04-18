import { CharacterClass, Prisma } from '@prisma/client';

import { ensureAdmin } from './adminService.js';
import { getItemStats } from './itemStatsService.js';
import { searchDiscoveredItems } from './npcRespawnService.js';
import { prisma } from '../utils/prisma.js';
import { isEqDbConfigured, queryEqDb } from '../utils/eqDb.js';

const BIS_PLAYABLE_CLASSES = [
  CharacterClass.BARD,
  CharacterClass.BEASTLORD,
  CharacterClass.BERSERKER,
  CharacterClass.CLERIC,
  CharacterClass.DRUID,
  CharacterClass.ENCHANTER,
  CharacterClass.MAGICIAN,
  CharacterClass.MONK,
  CharacterClass.NECROMANCER,
  CharacterClass.PALADIN,
  CharacterClass.RANGER,
  CharacterClass.ROGUE,
  CharacterClass.SHADOWKNIGHT,
  CharacterClass.SHAMAN,
  CharacterClass.WARRIOR,
  CharacterClass.WIZARD
] as const;

export const BIS_WORN_SLOT_IDS = Array.from({ length: 23 }, (_, index) => index);

const BIS_SLOT_KEYS = [
  'charm',
  'ear1',
  'head',
  'face',
  'ear2',
  'neck',
  'shoulders',
  'arms',
  'back',
  'wrist1',
  'wrist2',
  'range',
  'hands',
  'primary',
  'secondary',
  'finger1',
  'finger2',
  'chest',
  'legs',
  'feet',
  'waist',
  'powersource',
  'ammo'
] as const;

const BIS_SLOT_LABELS = [
  'Charm',
  'Ear 1',
  'Head',
  'Face',
  'Ear 2',
  'Neck',
  'Shoulders',
  'Arms',
  'Back',
  'Wrist 1',
  'Wrist 2',
  'Range',
  'Hands',
  'Primary',
  'Secondary',
  'Finger 1',
  'Finger 2',
  'Chest',
  'Legs',
  'Feet',
  'Waist',
  'Power Source',
  'Ammo'
] as const;

const SLOT_BIT_BY_SLOT_ID: Record<number, number> = {
  0: 1,
  1: 2,
  2: 4,
  3: 8,
  4: 16,
  5: 32,
  6: 64,
  7: 128,
  8: 256,
  9: 512,
  10: 1024,
  11: 2048,
  12: 4096,
  13: 8192,
  14: 16384,
  15: 32768,
  16: 65536,
  17: 131072,
  18: 262144,
  19: 524288,
  20: 1048576,
  21: 2097152,
  22: 4194304
};

const CLASS_BIT_BY_CHARACTER_CLASS: Partial<Record<CharacterClass, number>> = {
  [CharacterClass.WARRIOR]: 1,
  [CharacterClass.CLERIC]: 2,
  [CharacterClass.PALADIN]: 4,
  [CharacterClass.RANGER]: 8,
  [CharacterClass.SHADOWKNIGHT]: 16,
  [CharacterClass.DRUID]: 32,
  [CharacterClass.MONK]: 64,
  [CharacterClass.BARD]: 128,
  [CharacterClass.ROGUE]: 256,
  [CharacterClass.SHAMAN]: 512,
  [CharacterClass.NECROMANCER]: 1024,
  [CharacterClass.WIZARD]: 2048,
  [CharacterClass.MAGICIAN]: 4096,
  [CharacterClass.ENCHANTER]: 8192,
  [CharacterClass.BEASTLORD]: 16384,
  [CharacterClass.BERSERKER]: 32768
};

export interface BisCandidateSummary {
  id: string;
  itemId: number;
  itemName: string;
  itemIconId: number | null;
  voteCount: number;
  submittedAt: string;
  submittedBy: {
    id: string;
    displayName: string;
  };
  isWinner: boolean;
}

export interface BisSlotSummary {
  slotId: number;
  slotKey: string;
  slotLabel: string;
  totalVotes: number;
  viewerVoteCandidateId: string | null;
  winner: BisCandidateSummary | null;
  candidates: BisCandidateSummary[];
}

export interface BisBoardResponse {
  characterClass: CharacterClass;
  slotSummaries: BisSlotSummary[];
  permissions: {
    canVote: boolean;
    isBanned: boolean;
    reason: string | null;
    expiresAt: string | null;
  };
}

export interface BisCompatibleDiscoveredItem {
  itemId: number;
  itemName: string;
  itemIconId: number | null;
}

export interface BisSearchCharacterResult {
  id: number;
  name: string;
  className: CharacterClass;
}

export interface BisModerationUserResult {
  id: string;
  displayName: string;
  nickname: string | null;
  email: string;
  isAdmin: boolean;
  isGuide: boolean;
  activeBan: {
    id: string;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
    bannedByDisplayName: string;
  } | null;
}

export interface BisBanSummary {
  id: string;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  bannedBy: {
    id: string;
    displayName: string;
  };
}

type ActiveBisBanRecord = Awaited<ReturnType<typeof getActiveBisBan>>;

function isPlayableBisClass(value: CharacterClass): value is (typeof BIS_PLAYABLE_CLASSES)[number] {
  return value !== CharacterClass.UNKNOWN;
}

function getPreferredDisplayName(user: { displayName: string; nickname: string | null }): string {
  return user.nickname?.trim() || user.displayName;
}

function assertPlayableBisClass(characterClass: CharacterClass): void {
  if (!isPlayableBisClass(characterClass)) {
    throw new Error('BiS boards are only available for playable classes.');
  }
}

function assertValidBisSlotId(slotId: number): void {
  if (!Number.isInteger(slotId) || slotId < 0 || slotId > 22) {
    throw new Error('Invalid BiS slot.');
  }
}

function isItemCompatibleWithClass(
  itemClassesMask: number,
  characterClass: CharacterClass
): boolean {
  const classBit = CLASS_BIT_BY_CHARACTER_CLASS[characterClass];
  if (!classBit) {
    return false;
  }

  if (itemClassesMask === 0 || itemClassesMask >= 65535) {
    return true;
  }

  return (itemClassesMask & classBit) === classBit;
}

function isItemCompatibleWithSlot(itemSlotsMask: number, slotId: number): boolean {
  const slotBit = SLOT_BIT_BY_SLOT_ID[slotId];
  if (!slotBit) {
    return false;
  }

  return (itemSlotsMask & slotBit) === slotBit;
}

async function getActiveBisBan(userId: string) {
  const now = new Date();
  return prisma.bisBan.findFirst({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      bannedBy: {
        select: {
          displayName: true,
          nickname: true
        }
      }
    }
  });
}

async function assertBisParticipationAllowed(userId: string): Promise<ActiveBisBanRecord> {
  const activeBan = await getActiveBisBan(userId);
  if (activeBan) {
    const untilText = activeBan.expiresAt ? ` until ${activeBan.expiresAt.toISOString()}` : '';
    throw new Error(`You are banned from participating in BiS voting${untilText}.`);
  }

  return null;
}

async function resolveCompatibleDiscoveredItem(
  characterClass: CharacterClass,
  slotId: number,
  itemId: number
): Promise<BisCompatibleDiscoveredItem> {
  assertPlayableBisClass(characterClass);
  assertValidBisSlotId(slotId);

  const itemStats = await getItemStats(itemId);
  if (!itemStats) {
    throw new Error('Item details could not be loaded for compatibility validation.');
  }

  if (!isItemCompatibleWithClass(itemStats.classes, characterClass)) {
    throw new Error('That item cannot be equipped by the selected class.');
  }

  if (!isItemCompatibleWithSlot(itemStats.slots, slotId)) {
    throw new Error('That item cannot be equipped in the selected slot.');
  }

  return {
    itemId: itemStats.id,
    itemName: itemStats.name,
    itemIconId: itemStats.icon ?? null
  };
}

function normalizeCandidate(
  candidate: {
    id: string;
    itemId: number;
    itemName: string;
    itemIconId: number | null;
    createdAt: Date;
    submittedBy: { id: string; displayName: string; nickname: string | null };
    _count: { votes: number };
  },
  isWinner: boolean
): BisCandidateSummary {
  return {
    id: candidate.id,
    itemId: candidate.itemId,
    itemName: candidate.itemName,
    itemIconId: candidate.itemIconId,
    voteCount: candidate._count.votes,
    submittedAt: candidate.createdAt.toISOString(),
    submittedBy: {
      id: candidate.submittedBy.id,
      displayName: getPreferredDisplayName(candidate.submittedBy)
    },
    isWinner
  };
}

export async function getBisBoard(
  characterClass: CharacterClass,
  userId: string
): Promise<BisBoardResponse> {
  assertPlayableBisClass(characterClass);

  const [activeBan, candidates, viewerVotes] = await Promise.all([
    getActiveBisBan(userId),
    prisma.bisSlotCandidate.findMany({
      where: { characterClass },
      include: {
        submittedBy: {
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        },
        _count: {
          select: {
            votes: true
          }
        }
      }
    }),
    prisma.bisVote.findMany({
      where: { userId, characterClass },
      select: {
        slotId: true,
        candidateId: true
      }
    })
  ]);

  const viewerVoteBySlot = new Map<number, string>();
  for (const vote of viewerVotes) {
    viewerVoteBySlot.set(vote.slotId, vote.candidateId);
  }

  const candidatesBySlot = new Map<number, typeof candidates>();
  for (const candidate of candidates) {
    const existing = candidatesBySlot.get(candidate.slotId) ?? [];
    existing.push(candidate);
    candidatesBySlot.set(candidate.slotId, existing);
  }

  const slotSummaries: BisSlotSummary[] = BIS_WORN_SLOT_IDS.map((slotId) => {
    const slotCandidates = [...(candidatesBySlot.get(slotId) ?? [])].sort((left, right) => {
      const voteDelta = right._count.votes - left._count.votes;
      if (voteDelta !== 0) {
        return voteDelta;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });

    const winner = slotCandidates[0] ?? null;
    const normalizedCandidates = slotCandidates.map((candidate) =>
      normalizeCandidate(candidate, winner?.id === candidate.id)
    );

    return {
      slotId,
      slotKey: BIS_SLOT_KEYS[slotId],
      slotLabel: BIS_SLOT_LABELS[slotId],
      totalVotes: slotCandidates.reduce((sum, candidate) => sum + candidate._count.votes, 0),
      viewerVoteCandidateId: viewerVoteBySlot.get(slotId) ?? null,
      winner: winner ? normalizeCandidate(winner, true) : null,
      candidates: normalizedCandidates
    };
  });

  return {
    characterClass,
    slotSummaries,
    permissions: {
      canVote: !activeBan,
      isBanned: Boolean(activeBan),
      reason: activeBan?.reason ?? null,
      expiresAt: activeBan?.expiresAt?.toISOString() ?? null
    }
  };
}

export async function searchCompatibleDiscoveredItems(
  characterClass: CharacterClass,
  slotId: number,
  query: string,
  limit: number = 12
): Promise<BisCompatibleDiscoveredItem[]> {
  assertPlayableBisClass(characterClass);
  assertValidBisSlotId(slotId);

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const rawItems = await searchDiscoveredItems(trimmedQuery, Math.min(limit * 5, 50));
  const results: BisCompatibleDiscoveredItem[] = [];
  const seenItemIds = new Set<number>();

  for (const item of rawItems) {
    if (results.length >= limit || seenItemIds.has(item.itemId)) {
      continue;
    }

    try {
      const compatible = await resolveCompatibleDiscoveredItem(characterClass, slotId, item.itemId);
      results.push(compatible);
      seenItemIds.add(item.itemId);
    } catch {
      // Ignore incompatible or unresolvable items.
    }
  }

  return results;
}

async function findOrCreateCandidate(
  tx: Prisma.TransactionClient,
  input: {
    characterClass: CharacterClass;
    slotId: number;
    itemId: number;
    itemName: string;
    itemIconId: number | null;
    submittedById: string;
  }
) {
  const existing = await tx.bisSlotCandidate.findUnique({
    where: {
      characterClass_slotId_itemId: {
        characterClass: input.characterClass,
        slotId: input.slotId,
        itemId: input.itemId
      }
    }
  });

  if (existing) {
    return existing;
  }

  const existingSubmissionForClass = await tx.bisSlotCandidate.findFirst({
    where: {
      characterClass: input.characterClass,
      submittedById: input.submittedById
    },
    select: {
      itemName: true,
      slotId: true
    }
  });

  if (existingSubmissionForClass) {
    throw new Error(
      `You already submitted ${existingSubmissionForClass.itemName} to the ${BIS_SLOT_LABELS[existingSubmissionForClass.slotId]} board for ${input.characterClass}. Each user can only have one item on a class vote board at a time.`
    );
  }

  try {
    return await tx.bisSlotCandidate.create({
      data: input
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const retry = await tx.bisSlotCandidate.findUnique({
        where: {
          characterClass_slotId_itemId: {
            characterClass: input.characterClass,
            slotId: input.slotId,
            itemId: input.itemId
          }
        }
      });
      if (retry) {
        return retry;
      }
    }

    throw error;
  }
}

export async function nominateBisCandidate(
  userId: string,
  input: {
    characterClass: CharacterClass;
    slotId: number;
    itemId: number;
  }
): Promise<{ candidateId: string }> {
  assertPlayableBisClass(input.characterClass);
  assertValidBisSlotId(input.slotId);
  await assertBisParticipationAllowed(userId);

  const item = await resolveCompatibleDiscoveredItem(
    input.characterClass,
    input.slotId,
    input.itemId
  );

  const candidate = await prisma.$transaction(async (tx) => {
    const createdCandidate = await findOrCreateCandidate(tx, {
      characterClass: input.characterClass,
      slotId: input.slotId,
      itemId: item.itemId,
      itemName: item.itemName,
      itemIconId: item.itemIconId,
      submittedById: userId
    });

    await tx.bisVote.upsert({
      where: {
        userId_characterClass_slotId: {
          userId,
          characterClass: input.characterClass,
          slotId: input.slotId
        }
      },
      update: {
        candidateId: createdCandidate.id
      },
      create: {
        candidateId: createdCandidate.id,
        userId,
        characterClass: input.characterClass,
        slotId: input.slotId
      }
    });

    return createdCandidate;
  });

  return { candidateId: candidate.id };
}

export async function voteForBisCandidate(
  userId: string,
  candidateId: string
): Promise<{ candidateId: string; characterClass: CharacterClass; slotId: number }> {
  await assertBisParticipationAllowed(userId);

  const candidate = await prisma.bisSlotCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      characterClass: true,
      slotId: true
    }
  });

  if (!candidate) {
    throw new Error('BiS candidate not found.');
  }

  await prisma.bisVote.upsert({
    where: {
      userId_characterClass_slotId: {
        userId,
        characterClass: candidate.characterClass,
        slotId: candidate.slotId
      }
    },
    update: {
      candidateId: candidate.id
    },
    create: {
      candidateId: candidate.id,
      userId,
      characterClass: candidate.characterClass,
      slotId: candidate.slotId
    }
  });

  return {
    candidateId: candidate.id,
    characterClass: candidate.characterClass,
    slotId: candidate.slotId
  };
}

function mapEqClassIdToCharacterClass(classId: number): CharacterClass {
  switch (classId) {
    case 1:
      return CharacterClass.WARRIOR;
    case 2:
      return CharacterClass.CLERIC;
    case 3:
      return CharacterClass.PALADIN;
    case 4:
      return CharacterClass.RANGER;
    case 5:
      return CharacterClass.SHADOWKNIGHT;
    case 6:
      return CharacterClass.DRUID;
    case 7:
      return CharacterClass.MONK;
    case 8:
      return CharacterClass.BARD;
    case 9:
      return CharacterClass.ROGUE;
    case 10:
      return CharacterClass.SHAMAN;
    case 11:
      return CharacterClass.NECROMANCER;
    case 12:
      return CharacterClass.WIZARD;
    case 13:
      return CharacterClass.MAGICIAN;
    case 14:
      return CharacterClass.ENCHANTER;
    case 15:
      return CharacterClass.BEASTLORD;
    case 16:
      return CharacterClass.BERSERKER;
    default:
      return CharacterClass.UNKNOWN;
  }
}

export async function searchBisCharactersByName(
  query: string,
  limit: number = 12
): Promise<BisSearchCharacterResult[]> {
  if (!isEqDbConfigured()) {
    return [];
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const rows = await queryEqDb<Array<{ id: number; name: string; class: number }>>(
    `SELECT id, name, class
     FROM character_data
     WHERE name LIKE ?
     ORDER BY name ASC
     LIMIT ?`,
    [`%${trimmedQuery}%`, limit]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    className: mapEqClassIdToCharacterClass(Number(row.class))
  }));
}

export async function ensureBisAdmin(userId: string): Promise<void> {
  await ensureAdmin(userId);
}

export async function searchBisUsers(
  query: string,
  limit: number = 20
): Promise<BisModerationUserResult[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { displayName: { contains: trimmedQuery } },
        { nickname: { contains: trimmedQuery } },
        { email: { contains: trimmedQuery } }
      ]
    },
    orderBy: { displayName: 'asc' },
    take: limit,
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      bisBansReceived: {
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          bannedBy: {
            select: {
              displayName: true,
              nickname: true
            }
          }
        }
      }
    }
  });

  return users.map((user) => {
    const activeBan = user.bisBansReceived[0] ?? null;
    return {
      id: user.id,
      displayName: user.displayName,
      nickname: user.nickname,
      email: user.email,
      isAdmin: Boolean(user.admin),
      isGuide: Boolean(user.guide),
      activeBan: activeBan
        ? {
            id: activeBan.id,
            reason: activeBan.reason ?? null,
            expiresAt: activeBan.expiresAt?.toISOString() ?? null,
            createdAt: activeBan.createdAt.toISOString(),
            bannedByDisplayName: getPreferredDisplayName(activeBan.bannedBy)
          }
        : null
    };
  });
}

export async function listActiveBisBans(): Promise<BisBanSummary[]> {
  const now = new Date();
  const bans = await prisma.bisBan.findMany({
    where: {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true
        }
      },
      bannedBy: {
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      }
    }
  });

  return bans.map((ban) => ({
    id: ban.id,
    reason: ban.reason ?? null,
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    createdAt: ban.createdAt.toISOString(),
    user: {
      id: ban.user.id,
      displayName: getPreferredDisplayName(ban.user),
      email: ban.user.email
    },
    bannedBy: {
      id: ban.bannedBy.id,
      displayName: getPreferredDisplayName(ban.bannedBy)
    }
  }));
}

export async function createOrReplaceBisBan(
  actorUserId: string,
  input: {
    userId: string;
    reason?: string | null;
    expiresAt?: Date | null;
  }
): Promise<BisBanSummary> {
  if (actorUserId === input.userId) {
    throw new Error('You cannot ban yourself from the BiS system.');
  }

  const now = new Date();
  const ban = await prisma.$transaction(async (tx) => {
    await tx.bisBan.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      data: {
        revokedAt: now,
        revokedById: actorUserId
      }
    });

    return tx.bisBan.create({
      data: {
        userId: input.userId,
        bannedById: actorUserId,
        reason: input.reason?.trim() || null,
        expiresAt: input.expiresAt ?? null
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            nickname: true,
            email: true
          }
        },
        bannedBy: {
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        }
      }
    });
  });

  return {
    id: ban.id,
    reason: ban.reason ?? null,
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    createdAt: ban.createdAt.toISOString(),
    user: {
      id: ban.user.id,
      displayName: getPreferredDisplayName(ban.user),
      email: ban.user.email
    },
    bannedBy: {
      id: ban.bannedBy.id,
      displayName: getPreferredDisplayName(ban.bannedBy)
    }
  };
}

export async function revokeBisBan(actorUserId: string, banId: string): Promise<void> {
  const result = await prisma.bisBan.updateMany({
    where: {
      id: banId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date(),
      revokedById: actorUserId
    }
  });

  if (result.count === 0) {
    throw new Error('BiS ban not found.');
  }
}
