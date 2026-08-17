import { GuildRole } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';

export class BossLibraryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 | 413
  ) {
    super(message);
  }
}

interface BossEditor {
  userId: string;
  displayName: string;
}

interface BossInput {
  groupId: string;
  name: string;
  imageUrl?: string | null;
  imageUpload?: BossImageUpload;
  notes?: string | null;
  sortOrder?: number;
}

interface BossUpdateInput {
  groupId?: string;
  name?: string;
  imageUrl?: string | null;
  imageUpload?: BossImageUpload;
  notes?: string | null;
  sortOrder?: number;
}

export interface BossImageUpload {
  data: Buffer;
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string | null;
}

export const BOSS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function isBossOfficer(role: GuildRole): boolean {
  return role === GuildRole.LEADER || role === GuildRole.OFFICER;
}

export function getBossLibraryPermissions(role: GuildRole, isContributor: boolean) {
  const isOfficer = isBossOfficer(role);
  return {
    role,
    isContributor,
    canEdit: isOfficer || isContributor,
    canDelete: isOfficer,
    canManageContributors: isOfficer
  };
}

export function buildBossGroupOrderUpdates(existingIds: string[], orderedIds: string[]) {
  const existingIdSet = new Set(existingIds);
  const orderedIdSet = new Set(orderedIds);
  const containsEveryGroup = existingIds.every((id) => orderedIdSet.has(id));

  if (
    orderedIds.length !== existingIds.length ||
    orderedIdSet.size !== orderedIds.length ||
    !containsEveryGroup ||
    orderedIds.some((id) => !existingIdSet.has(id))
  ) {
    throw new BossLibraryError('The group order must include every boss group exactly once.', 400);
  }

  return orderedIds.map((id, sortOrder) => ({ id, sortOrder }));
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined || !value.trim()) {
    return null;
  }
  return value;
}

export function detectBossImageMime(data: Buffer): BossImageUpload['mimeType'] | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  const header = data.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') {
    return 'image/gif';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function prepareBossImageUpload(data: Buffer, fileName?: string): BossImageUpload {
  if (data.length === 0) {
    throw new BossLibraryError('Choose a non-empty image file.', 400);
  }
  if (data.length > BOSS_IMAGE_MAX_BYTES) {
    throw new BossLibraryError('Boss images must be 2 MB or smaller.', 413);
  }
  const mimeType = detectBossImageMime(data);
  if (!mimeType) {
    throw new BossLibraryError('Use a PNG, JPEG, GIF, or WebP image.', 400);
  }
  const normalizedFileName = fileName
    ? (fileName.split(/[\\/]/).pop() ?? '')
        .split('')
        .filter((character) => {
          const codePoint = character.charCodeAt(0);
          return codePoint > 31 && codePoint !== 127;
        })
        .join('')
        .trim()
        .slice(0, 191) || null
    : null;
  return { data, mimeType, fileName: normalizedFileName };
}

function serializeBossImage<
  T extends {
    id: string;
    imageUrl: string | null;
    image: { updatedAt: Date } | null;
  }
>(guildId: string, boss: T) {
  const { image, ...details } = boss;
  return {
    ...details,
    imageUrl: image
      ? `/api/guilds/${encodeURIComponent(guildId)}/bosses/${encodeURIComponent(boss.id)}/image?v=${image.updatedAt.getTime()}`
      : boss.imageUrl,
    imageSource: image ? ('upload' as const) : boss.imageUrl ? ('url' as const) : null
  };
}

async function getBossAccess(userId: string, guildId: string) {
  const membership = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    },
    select: {
      role: true,
      isBossContributor: true
    }
  });

  if (!membership) {
    throw new BossLibraryError('You must be a guild member to view this boss library.', 403);
  }

  return getBossLibraryPermissions(membership.role, membership.isBossContributor);
}

export async function ensureBossEditor(userId: string, guildId: string) {
  const access = await getBossAccess(userId, guildId);
  if (!access.canEdit) {
    throw new BossLibraryError(
      'A guild officer must grant you Contributor access before you can edit boss content.',
      403
    );
  }
  return access;
}

export async function ensureBossOfficer(userId: string, guildId: string) {
  const access = await getBossAccess(userId, guildId);
  if (!access.canManageContributors) {
    throw new BossLibraryError('Only guild leaders or officers can perform this action.', 403);
  }
  return access;
}

export async function resolveBossEditor(guildId: string, userId: string): Promise<BossEditor> {
  const membership = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    },
    include: {
      user: {
        select: {
          displayName: true,
          nickname: true
        }
      }
    }
  });

  if (!membership) {
    throw new BossLibraryError('Guild membership not found.', 404);
  }

  return {
    userId,
    displayName: withPreferredDisplayName(membership.user).displayName
  };
}

export async function listGuildBossLibrary(guildId: string, userId: string) {
  const access = await getBossAccess(userId, guildId);
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      bossGroups: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          bosses: {
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              imageUrl: true,
              image: {
                select: { updatedAt: true }
              },
              sortOrder: true,
              updatedAt: true
            }
          }
        }
      }
    }
  });

  if (!guild) {
    throw new BossLibraryError('Guild not found.', 404);
  }

  return {
    guild: {
      id: guild.id,
      name: guild.name
    },
    groups: guild.bossGroups.map((group) => ({
      ...group,
      bosses: group.bosses.map((boss) => serializeBossImage(guildId, boss))
    })),
    permissions: access
  };
}

export async function getGuildBoss(guildId: string, bossId: string, userId: string) {
  const access = await getBossAccess(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: {
      id: bossId,
      guildId
    },
    include: {
      group: {
        select: {
          id: true,
          name: true
        }
      },
      image: {
        select: { updatedAt: true }
      }
    }
  });

  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }

  return {
    boss: serializeBossImage(guildId, boss),
    permissions: access
  };
}

async function ensureGroupBelongsToGuild(guildId: string, groupId: string) {
  const group = await prisma.guildBossGroup.findFirst({
    where: {
      id: groupId,
      guildId
    }
  });
  if (!group) {
    throw new BossLibraryError('Boss group not found.', 404);
  }
  return group;
}

export async function createGuildBossGroup(guildId: string, userId: string, name: string) {
  await ensureBossEditor(userId, guildId);
  const trimmedName = name.trim();
  const existing = await prisma.guildBossGroup.findFirst({
    where: { guildId, name: trimmedName }
  });
  if (existing) {
    throw new BossLibraryError('A boss group with that name already exists.', 409);
  }

  const highest = await prisma.guildBossGroup.aggregate({
    where: { guildId },
    _max: { sortOrder: true }
  });
  return prisma.guildBossGroup.create({
    data: {
      guildId,
      name: trimmedName,
      sortOrder: (highest._max.sortOrder ?? -1) + 1
    }
  });
}

export async function updateGuildBossGroup(
  guildId: string,
  groupId: string,
  userId: string,
  input: { name?: string; sortOrder?: number }
) {
  await ensureBossEditor(userId, guildId);
  await ensureGroupBelongsToGuild(guildId, groupId);

  const name = input.name?.trim();
  if (name) {
    const duplicate = await prisma.guildBossGroup.findFirst({
      where: {
        guildId,
        name,
        NOT: { id: groupId }
      }
    });
    if (duplicate) {
      throw new BossLibraryError('A boss group with that name already exists.', 409);
    }
  }

  return prisma.guildBossGroup.update({
    where: { id: groupId },
    data: {
      ...(name ? { name } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    }
  });
}

export async function reorderGuildBossGroups(
  guildId: string,
  userId: string,
  orderedIds: string[]
) {
  await ensureBossEditor(userId, guildId);
  const groups = await prisma.guildBossGroup.findMany({
    where: { guildId },
    select: { id: true }
  });
  const updates = buildBossGroupOrderUpdates(
    groups.map((group) => group.id),
    orderedIds
  );

  await prisma.$transaction(
    updates.map(({ id, sortOrder }) =>
      prisma.guildBossGroup.update({
        where: { id },
        data: { sortOrder }
      })
    )
  );

  return updates;
}

export async function deleteGuildBossGroup(guildId: string, groupId: string, userId: string) {
  await ensureBossOfficer(userId, guildId);
  await ensureGroupBelongsToGuild(guildId, groupId);
  const bossCount = await prisma.guildBoss.count({ where: { guildId, groupId } });
  if (bossCount > 0) {
    throw new BossLibraryError('Move or delete the bosses in this group before deleting it.', 409);
  }
  await prisma.guildBossGroup.delete({ where: { id: groupId } });
}

export async function createGuildBoss(guildId: string, userId: string, input: BossInput) {
  await ensureBossEditor(userId, guildId);
  await ensureGroupBelongsToGuild(guildId, input.groupId);
  const name = input.name.trim();
  const duplicate = await prisma.guildBoss.findFirst({ where: { guildId, name } });
  if (duplicate) {
    throw new BossLibraryError('A boss with that name already exists in this guild.', 409);
  }

  const editor = await resolveBossEditor(guildId, userId);
  const highest = await prisma.guildBoss.aggregate({
    where: { guildId, groupId: input.groupId },
    _max: { sortOrder: true }
  });

  const boss = await prisma.$transaction(async (transaction) => {
    const created = await transaction.guildBoss.create({
      data: {
        guildId,
        groupId: input.groupId,
        name,
        imageUrl: input.imageUpload ? null : normalizeOptionalText(input.imageUrl),
        notes: normalizeOptionalText(input.notes),
        sortOrder: input.sortOrder ?? (highest._max.sortOrder ?? -1) + 1,
        lastEditedById: editor.userId,
        lastEditedByName: editor.displayName
      }
    });
    if (input.imageUpload) {
      await transaction.guildBossImage.create({
        data: {
          bossId: created.id,
          mimeType: input.imageUpload.mimeType,
          fileName: input.imageUpload.fileName,
          data: input.imageUpload.data
        }
      });
    }
    return transaction.guildBoss.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        group: { select: { id: true, name: true } },
        image: { select: { updatedAt: true } }
      }
    });
  });
  return serializeBossImage(guildId, boss);
}

export async function updateGuildBoss(
  guildId: string,
  bossId: string,
  userId: string,
  input: BossUpdateInput
) {
  await ensureBossEditor(userId, guildId);
  const existing = await prisma.guildBoss.findFirst({ where: { id: bossId, guildId } });
  if (!existing) {
    throw new BossLibraryError('Boss not found.', 404);
  }

  if (input.groupId !== undefined) {
    await ensureGroupBelongsToGuild(guildId, input.groupId);
  }

  const name = input.name?.trim();
  if (name) {
    const duplicate = await prisma.guildBoss.findFirst({
      where: {
        guildId,
        name,
        NOT: { id: bossId }
      }
    });
    if (duplicate) {
      throw new BossLibraryError('A boss with that name already exists in this guild.', 409);
    }
  }

  const editor = await resolveBossEditor(guildId, userId);
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.guildBoss.update({
      where: { id: bossId },
      data: {
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(name ? { name } : {}),
        ...(input.imageUpload
          ? { imageUrl: null }
          : input.imageUrl !== undefined
            ? { imageUrl: normalizeOptionalText(input.imageUrl) }
            : {}),
        ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        lastEditedById: editor.userId,
        lastEditedByName: editor.displayName
      }
    });
    if (input.imageUpload) {
      await transaction.guildBossImage.upsert({
        where: { bossId },
        create: {
          bossId,
          mimeType: input.imageUpload.mimeType,
          fileName: input.imageUpload.fileName,
          data: input.imageUpload.data
        },
        update: {
          mimeType: input.imageUpload.mimeType,
          fileName: input.imageUpload.fileName,
          data: input.imageUpload.data
        }
      });
    } else if (input.imageUrl !== undefined) {
      await transaction.guildBossImage.deleteMany({ where: { bossId } });
    }
    return transaction.guildBoss.findUniqueOrThrow({
      where: { id: bossId },
      include: {
        group: { select: { id: true, name: true } },
        image: { select: { updatedAt: true } }
      }
    });
  });
  return serializeBossImage(guildId, updated);
}

export async function getGuildBossImage(guildId: string, bossId: string, userId: string) {
  await getBossAccess(userId, guildId);
  const image = await prisma.guildBossImage.findFirst({
    where: {
      bossId,
      boss: { guildId }
    },
    select: {
      data: true,
      mimeType: true,
      fileName: true
    }
  });
  if (!image) {
    throw new BossLibraryError('Boss image not found.', 404);
  }
  return {
    data: Buffer.from(image.data),
    mimeType: image.mimeType,
    fileName: image.fileName
  };
}

export async function deleteGuildBoss(guildId: string, bossId: string, userId: string) {
  await ensureBossOfficer(userId, guildId);
  const existing = await prisma.guildBoss.findFirst({ where: { id: bossId, guildId } });
  if (!existing) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  await prisma.guildBoss.delete({ where: { id: bossId } });
}

export async function listBossContributors(guildId: string, userId: string) {
  await ensureBossOfficer(userId, guildId);
  const members = await prisma.guildMembership.findMany({
    where: { guildId },
    select: {
      userId: true,
      role: true,
      isBossContributor: true,
      user: {
        select: {
          displayName: true,
          nickname: true
        }
      }
    }
  });

  return members
    .map((membership) => ({
      userId: membership.userId,
      displayName: withPreferredDisplayName(membership.user).displayName,
      role: membership.role,
      isContributor: membership.isBossContributor,
      hasImplicitAccess: isBossOfficer(membership.role)
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function setBossContributor(
  guildId: string,
  targetUserId: string,
  userId: string,
  isContributor: boolean
) {
  await ensureBossOfficer(userId, guildId);
  const target = await prisma.guildMembership.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId: targetUserId
      }
    }
  });
  if (!target) {
    throw new BossLibraryError('Guild member not found.', 404);
  }

  return prisma.guildMembership.update({
    where: {
      guildId_userId: {
        guildId,
        userId: targetUserId
      }
    },
    data: { isBossContributor: isContributor },
    select: {
      userId: true,
      role: true,
      isBossContributor: true
    }
  });
}
