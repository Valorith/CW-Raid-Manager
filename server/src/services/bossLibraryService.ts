import { randomUUID } from 'node:crypto';

import { GuildRole } from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import {
  PlainBossNotesConversionError,
  applyPlainBossNotesEdits,
  createPlainBossNotesDocument
} from '../utils/plainBossNotes.js';
import { prisma } from '../utils/prisma.js';
import { slugify } from '../utils/slugify.js';

export class BossLibraryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 | 413,
    public readonly details?: Record<string, unknown>
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
  cures?: BossCures;
  sortOrder?: number;
}

export interface BossUpdateInput {
  groupId?: string;
  name?: string;
  imageUrl?: string | null;
  imageUpload?: BossImageUpload;
  notes?: string | null;
  cures?: BossCures;
  sortOrder?: number;
  editLeaseToken?: string;
  notesRevision?: string;
}

export interface BossCures {
  curse: boolean;
  poison: boolean;
  disease: boolean;
}

interface BossSuggestionInput {
  revision: string;
  fields: Record<string, string>;
  cures: BossCures;
}

export interface BossImageUpload {
  data: Buffer;
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string | null;
}

export const BOSS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BOSS_SLUG_MAX_LENGTH = 191;
export const BOSS_EDIT_LEASE_TTL_MS = 2 * 60 * 1000;

export type BossEditMode = 'plain' | 'source';

interface BossEditLeaseRecord {
  bossId: string;
  guildId: string;
  userId: string;
  holderName: string;
  token: string;
  mode: string;
  expiresAt: Date;
}

export function buildBossEditLeaseExpiry(now = new Date()) {
  return new Date(now.getTime() + BOSS_EDIT_LEASE_TTL_MS);
}

export function serializeBossEditLease(lease: BossEditLeaseRecord, viewerUserId: string) {
  const isMine = lease.userId === viewerUserId;
  return {
    bossId: lease.bossId,
    holderName: lease.holderName,
    mode: lease.mode === 'source' ? ('source' as const) : ('plain' as const),
    expiresAt: lease.expiresAt.toISOString(),
    isMine,
    ...(isMine ? { token: lease.token } : {})
  };
}

export function buildUniqueBossSlug(name: string, existingSlugs: Iterable<string>): string {
  const usedSlugs = new Set(Array.from(existingSlugs, (slug) => slug.toLocaleLowerCase()));
  const base = slugify(name).slice(0, BOSS_SLUG_MAX_LENGTH) || 'boss';
  let candidate = base;
  let counter = 2;

  while (usedSlugs.has(candidate.toLocaleLowerCase())) {
    const suffix = `-${counter}`;
    candidate = `${base.slice(0, BOSS_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    counter += 1;
  }

  return candidate;
}

function isBossOfficer(role: GuildRole): boolean {
  return role === GuildRole.LEADER || role === GuildRole.OFFICER;
}

export function getBossLibraryPermissions(role: GuildRole, isContributor: boolean) {
  const isOfficer = isBossOfficer(role);
  return {
    role,
    isContributor,
    canEdit: isOfficer || isContributor,
    canSuggest: true,
    canDelete: isOfficer,
    canManageContributors: isOfficer
  };
}

export function formatBossCures(cures: BossCures) {
  const selected = [
    cures.curse ? 'Curse' : null,
    cures.poison ? 'Poison' : null,
    cures.disease ? 'Disease' : null
  ].filter((value): value is string => Boolean(value));
  return selected.length > 0 ? selected.join(', ') : 'None';
}

export function bossCuresEqual(left: BossCures, right: BossCures) {
  return (
    left.curse === right.curse && left.poison === right.poison && left.disease === right.disease
  );
}

export function describeBossUpdate(input: BossUpdateInput) {
  const changes: string[] = [];
  if (input.notes !== undefined) changes.push('source notes');
  if (input.cures !== undefined) changes.push(`cures (${formatBossCures(input.cures)})`);
  if (
    input.groupId !== undefined ||
    input.name !== undefined ||
    input.imageUrl !== undefined ||
    input.imageUpload !== undefined ||
    input.sortOrder !== undefined
  ) {
    changes.push('boss details');
  }
  return `Updated ${changes.join(' and ') || 'boss page'}`;
}

export function serializeBossLibraryGuild(guild: { id: string; name: string; slug: string }) {
  return {
    id: guild.id,
    name: guild.name,
    slug: guild.slug
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
    cureCurse?: boolean;
    curePoison?: boolean;
    cureDisease?: boolean;
  }
>(guildId: string, boss: T) {
  const { image, cureCurse, curePoison, cureDisease, ...details } = boss;
  const hasCures =
    typeof cureCurse === 'boolean' &&
    typeof curePoison === 'boolean' &&
    typeof cureDisease === 'boolean';
  return {
    ...details,
    ...(hasCures
      ? {
          cures: {
            curse: cureCurse,
            poison: curePoison,
            disease: cureDisease
          }
        }
      : {}),
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

export async function ensureBossViewer(userId: string, guildId: string) {
  return getBossAccess(userId, guildId);
}

async function createBossSlug(guildId: string, name: string) {
  const bosses = await prisma.guildBoss.findMany({
    where: { guildId },
    select: { slug: true }
  });
  return buildUniqueBossSlug(
    name,
    bosses.map((boss) => boss.slug)
  );
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

async function findActiveBossEditLease(bossId: string, guildId: string, now = new Date()) {
  return prisma.guildBossEditLease.findFirst({
    where: {
      bossId,
      guildId,
      expiresAt: { gt: now }
    }
  });
}

function bossEditLeaseConflict(
  lease: BossEditLeaseRecord | null,
  userId: string,
  fallbackMessage = 'Your edit lock expired. Return to Preview, then open the editor again.'
) {
  const sameUser = lease?.userId === userId;
  const message = lease
    ? sameUser
      ? 'This boss page is being edited in another tab under your account.'
      : `This boss page is locked for editing by ${lease.holderName}.`
    : fallbackMessage;
  return new BossLibraryError(message, 409, {
    code: lease ? 'boss_edit_locked' : 'boss_edit_lock_lost',
    lock: lease ? serializeBossEditLease(lease, userId) : null
  });
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function acquireBossEditLease(
  guildId: string,
  bossId: string,
  userId: string,
  mode: BossEditMode
) {
  await ensureBossEditor(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: { id: true }
  });
  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }

  const editor = await resolveBossEditor(guildId, userId);
  const now = new Date();
  const expiresAt = buildBossEditLeaseExpiry(now);
  const token = randomUUID();
  const claim = {
    guildId,
    userId,
    holderName: editor.displayName,
    token,
    mode,
    expiresAt
  };

  const replaced = await prisma.guildBossEditLease.updateMany({
    where: {
      bossId,
      guildId,
      OR: [{ expiresAt: { lte: now } }, { userId }]
    },
    data: claim
  });

  let lease: BossEditLeaseRecord;
  if (replaced.count === 1) {
    lease = await prisma.guildBossEditLease.findUniqueOrThrow({ where: { bossId } });
  } else {
    try {
      lease = await prisma.guildBossEditLease.create({
        data: {
          bossId,
          ...claim
        }
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const activeLease = await findActiveBossEditLease(bossId, guildId, now);
      throw bossEditLeaseConflict(activeLease, userId);
    }
  }

  const currentBoss = await prisma.guildBoss.findUniqueOrThrow({
    where: { id: bossId },
    select: { notes: true }
  });
  return {
    lease: serializeBossEditLease(lease, userId),
    revision: createPlainBossNotesDocument(currentBoss.notes).revision,
    notes: currentBoss.notes ?? ''
  };
}

export async function heartbeatBossEditLease(
  guildId: string,
  bossId: string,
  userId: string,
  token: string,
  mode: BossEditMode
) {
  await ensureBossEditor(userId, guildId);
  const now = new Date();
  const renewed = await prisma.guildBossEditLease.updateMany({
    where: {
      bossId,
      guildId,
      userId,
      token,
      expiresAt: { gt: now }
    },
    data: {
      mode,
      expiresAt: buildBossEditLeaseExpiry(now)
    }
  });
  if (renewed.count !== 1) {
    throw bossEditLeaseConflict(await findActiveBossEditLease(bossId, guildId, now), userId);
  }
  const lease = await prisma.guildBossEditLease.findUniqueOrThrow({ where: { bossId } });
  return serializeBossEditLease(lease, userId);
}

export async function releaseBossEditLease(
  guildId: string,
  bossId: string,
  userId: string,
  token: string
) {
  await prisma.guildBossEditLease.deleteMany({
    where: {
      bossId,
      guildId,
      userId,
      token
    }
  });
}

async function ensureValidBossEditLease(
  guildId: string,
  bossId: string,
  userId: string,
  token: string | undefined
) {
  const now = new Date();
  if (!token) {
    throw new BossLibraryError('Open Edit or Source to lock this page before saving.', 409, {
      code: 'boss_edit_lock_required',
      lock: null
    });
  }
  const lease = await prisma.guildBossEditLease.findFirst({
    where: {
      bossId,
      guildId,
      userId,
      token,
      expiresAt: { gt: now }
    }
  });
  if (!lease) {
    throw bossEditLeaseConflict(await findActiveBossEditLease(bossId, guildId, now), userId);
  }
  return lease;
}

export async function listGuildBossLibrary(guildId: string, userId: string) {
  const access = await getBossAccess(userId, guildId);
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      slug: true,
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
              slug: true,
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
    guild: serializeBossLibraryGuild(guild),
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

export async function getGuildBossPlainNotes(guildId: string, bossId: string, userId: string) {
  await ensureBossViewer(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: { notes: true }
  });
  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  return createPlainBossNotesDocument(boss.notes);
}

export async function listGuildBossEditHistory(guildId: string, bossId: string, userId: string) {
  await ensureBossViewer(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: { id: true }
  });
  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  return prisma.guildBossEditHistory.findMany({
    where: { bossId, guildId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
}

function serializeBossSuggestion<
  T extends {
    id: string;
    bossId: string;
    submittedByName: string;
    proposedNotes: string | null;
    proposedCureCurse: boolean;
    proposedCurePoison: boolean;
    proposedCureDisease: boolean;
    status: string;
    reviewedByName: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }
>(suggestion: T) {
  return {
    id: suggestion.id,
    bossId: suggestion.bossId,
    submittedByName: suggestion.submittedByName,
    proposedNotes: suggestion.proposedNotes,
    proposedCures: {
      curse: suggestion.proposedCureCurse,
      poison: suggestion.proposedCurePoison,
      disease: suggestion.proposedCureDisease
    },
    status:
      suggestion.status === 'APPROVED'
        ? ('APPROVED' as const)
        : suggestion.status === 'REJECTED'
          ? ('REJECTED' as const)
          : ('PENDING' as const),
    reviewedByName: suggestion.reviewedByName,
    reviewedAt: suggestion.reviewedAt?.toISOString() ?? null,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString()
  };
}

export async function listGuildBossEditSuggestions(
  guildId: string,
  bossId: string,
  userId: string
) {
  await ensureBossEditor(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: { id: true }
  });
  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  const suggestions = await prisma.guildBossEditSuggestion.findMany({
    where: { bossId, guildId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' }
  });
  return suggestions.map(serializeBossSuggestion);
}

export async function createGuildBossEditSuggestion(
  guildId: string,
  bossId: string,
  userId: string,
  input: BossSuggestionInput
) {
  await ensureBossViewer(userId, guildId);
  const boss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: {
      notes: true,
      cureCurse: true,
      curePoison: true,
      cureDisease: true
    }
  });
  if (!boss) {
    throw new BossLibraryError('Boss not found.', 404);
  }

  let conversion: ReturnType<typeof applyPlainBossNotesEdits>;
  try {
    conversion = applyPlainBossNotesEdits(boss.notes, input.revision, input.fields);
  } catch (error) {
    return convertPlainNotesError(error);
  }
  const currentCures = {
    curse: boss.cureCurse,
    poison: boss.curePoison,
    disease: boss.cureDisease
  };
  if (!conversion.changed && bossCuresEqual(currentCures, input.cures)) {
    throw new BossLibraryError('Make at least one change before submitting a suggestion.', 400);
  }

  const submitter = await resolveBossEditor(guildId, userId);
  const suggestion = await prisma.guildBossEditSuggestion.create({
    data: {
      bossId,
      guildId,
      submittedById: submitter.userId,
      submittedByName: submitter.displayName,
      baseRevision: input.revision,
      proposedNotes: conversion.notes,
      baseCureCurse: currentCures.curse,
      baseCurePoison: currentCures.poison,
      baseCureDisease: currentCures.disease,
      proposedCureCurse: input.cures.curse,
      proposedCurePoison: input.cures.poison,
      proposedCureDisease: input.cures.disease
    }
  });
  return serializeBossSuggestion(suggestion);
}

export async function reviewGuildBossEditSuggestion(
  guildId: string,
  bossId: string,
  suggestionId: string,
  userId: string,
  action: 'approve' | 'reject'
) {
  await ensureBossEditor(userId, guildId);
  const suggestion = await prisma.guildBossEditSuggestion.findFirst({
    where: { id: suggestionId, bossId, guildId }
  });
  if (!suggestion) {
    throw new BossLibraryError('Edit suggestion not found.', 404);
  }
  if (suggestion.status !== 'PENDING') {
    throw new BossLibraryError('This edit suggestion has already been reviewed.', 409);
  }
  const reviewer = await resolveBossEditor(guildId, userId);

  if (action === 'reject') {
    const reviewed = await prisma.$transaction(async (transaction) => {
      const update = await transaction.guildBossEditSuggestion.updateMany({
        where: { id: suggestionId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedById: reviewer.userId,
          reviewedByName: reviewer.displayName,
          reviewedAt: new Date()
        }
      });
      if (update.count !== 1) {
        throw new BossLibraryError('This edit suggestion has already been reviewed.', 409);
      }
      return transaction.guildBossEditSuggestion.findUniqueOrThrow({
        where: { id: suggestionId }
      });
    });
    return { suggestion: serializeBossSuggestion(reviewed), boss: null };
  }

  const now = new Date();
  const activeLease = await findActiveBossEditLease(bossId, guildId, now);
  if (activeLease) {
    throw bossEditLeaseConflict(activeLease, userId);
  }
  const currentBoss = await prisma.guildBoss.findFirst({
    where: { id: bossId, guildId },
    select: {
      notes: true,
      cureCurse: true,
      curePoison: true,
      cureDisease: true
    }
  });
  if (!currentBoss) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  const currentRevision = createPlainBossNotesDocument(currentBoss.notes).revision;
  const curesStillMatch =
    currentBoss.cureCurse === suggestion.baseCureCurse &&
    currentBoss.curePoison === suggestion.baseCurePoison &&
    currentBoss.cureDisease === suggestion.baseCureDisease;
  if (currentRevision !== suggestion.baseRevision || !curesStillMatch) {
    throw new BossLibraryError(
      'This suggestion is stale because the boss page changed after it was submitted.',
      409,
      { code: 'boss_suggestion_stale' }
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    const suggestionUpdate = await transaction.guildBossEditSuggestion.updateMany({
      where: { id: suggestionId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        reviewedById: reviewer.userId,
        reviewedByName: reviewer.displayName,
        reviewedAt: now
      }
    });
    if (suggestionUpdate.count !== 1) {
      throw new BossLibraryError('This edit suggestion has already been reviewed.', 409);
    }
    const bossUpdate = await transaction.guildBoss.updateMany({
      where: {
        id: bossId,
        guildId,
        notes: currentBoss.notes,
        cureCurse: suggestion.baseCureCurse,
        curePoison: suggestion.baseCurePoison,
        cureDisease: suggestion.baseCureDisease
      },
      data: {
        notes: suggestion.proposedNotes,
        cureCurse: suggestion.proposedCureCurse,
        curePoison: suggestion.proposedCurePoison,
        cureDisease: suggestion.proposedCureDisease,
        lastEditedById: reviewer.userId,
        lastEditedByName: reviewer.displayName
      }
    });
    if (bossUpdate.count !== 1) {
      throw new BossLibraryError(
        'This suggestion is stale because the boss page changed after it was submitted.',
        409,
        { code: 'boss_suggestion_stale' }
      );
    }
    await transaction.guildBossEditHistory.create({
      data: {
        bossId,
        guildId,
        editorUserId: reviewer.userId,
        editorName: reviewer.displayName,
        editKind: 'suggestion_approved',
        summary: `Approved ${suggestion.submittedByName}'s suggested edit`
      }
    });
    const [reviewed, boss] = await Promise.all([
      transaction.guildBossEditSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }),
      transaction.guildBoss.findUniqueOrThrow({
        where: { id: bossId },
        include: {
          group: { select: { id: true, name: true } },
          image: { select: { updatedAt: true } }
        }
      })
    ]);
    return { reviewed, boss };
  });

  return {
    suggestion: serializeBossSuggestion(result.reviewed),
    boss: serializeBossImage(guildId, result.boss)
  };
}

function convertPlainNotesError(error: unknown): never {
  if (!(error instanceof PlainBossNotesConversionError)) throw error;
  if (error.code === 'revision_conflict') {
    throw new BossLibraryError(error.message, 409);
  }
  if (error.code === 'too_large') {
    throw new BossLibraryError(error.message, 413);
  }
  throw new BossLibraryError(error.message, 400);
}

export async function updateGuildBossPlainNotes(
  guildId: string,
  bossId: string,
  userId: string,
  input: { revision: string; fields: Record<string, string>; editLeaseToken: string }
) {
  await ensureBossEditor(userId, guildId);
  const existing = await prisma.guildBoss.findFirst({ where: { id: bossId, guildId } });
  if (!existing) {
    throw new BossLibraryError('Boss not found.', 404);
  }
  await ensureValidBossEditLease(guildId, bossId, userId, input.editLeaseToken);

  let conversion: ReturnType<typeof applyPlainBossNotesEdits>;
  try {
    conversion = applyPlainBossNotesEdits(existing.notes, input.revision, input.fields);
  } catch (error) {
    return convertPlainNotesError(error);
  }

  const editor = conversion.changed ? await resolveBossEditor(guildId, userId) : null;
  const boss = await prisma.$transaction(async (transaction) => {
    if (editor) {
      const leaseRenewal = await transaction.guildBossEditLease.updateMany({
        where: {
          bossId,
          guildId,
          userId,
          token: input.editLeaseToken,
          expiresAt: { gt: new Date() }
        },
        data: { expiresAt: buildBossEditLeaseExpiry() }
      });
      if (leaseRenewal.count !== 1) {
        throw new BossLibraryError(
          'Your edit lock expired. Return to Preview, then open the editor again.',
          409,
          { code: 'boss_edit_lock_lost', lock: null }
        );
      }
      const update = await transaction.guildBoss.updateMany({
        where: {
          id: bossId,
          guildId,
          notes: existing.notes
        },
        data: {
          notes: conversion.notes,
          lastEditedById: editor.userId,
          lastEditedByName: editor.displayName
        }
      });
      if (update.count !== 1) {
        throw new BossLibraryError(
          'These notes changed while you were editing. Reload before saving.',
          409
        );
      }
      await transaction.guildBossEditHistory.create({
        data: {
          bossId,
          guildId,
          editorUserId: editor.userId,
          editorName: editor.displayName,
          editKind: 'visual_notes',
          summary: 'Updated encounter notes in Edit mode'
        }
      });
    }
    return transaction.guildBoss.findUniqueOrThrow({
      where: { id: bossId },
      include: {
        group: { select: { id: true, name: true } },
        image: { select: { updatedAt: true } }
      }
    });
  });

  return {
    boss: serializeBossImage(guildId, boss),
    document: conversion.changed
      ? createPlainBossNotesDocument(conversion.notes)
      : conversion.document
  };
}

export async function getGuildBossBySlug(guildSlug: string, bossSlug: string, userId: string) {
  const guild = await prisma.guild.findUnique({
    where: { slug: guildSlug },
    select: { id: true, name: true, slug: true }
  });
  if (!guild) {
    throw new BossLibraryError('Guild not found.', 404);
  }

  const access = await getBossAccess(userId, guild.id);
  const boss = await prisma.guildBoss.findUnique({
    where: {
      guildId_slug: {
        guildId: guild.id,
        slug: bossSlug
      }
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
    guild,
    boss: serializeBossImage(guild.id, boss),
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
  const slug = await createBossSlug(guildId, name);
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
        slug,
        imageUrl: input.imageUpload ? null : normalizeOptionalText(input.imageUrl),
        notes: normalizeOptionalText(input.notes),
        cureCurse: input.cures?.curse ?? false,
        curePoison: input.cures?.poison ?? false,
        cureDisease: input.cures?.disease ?? false,
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
    await transaction.guildBossEditHistory.create({
      data: {
        bossId: created.id,
        guildId,
        editorUserId: editor.userId,
        editorName: editor.displayName,
        editKind: 'created',
        summary: 'Created the boss page'
      }
    });
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

  const requiresEditLease = input.notes !== undefined || input.cures !== undefined;
  if (requiresEditLease) {
    await ensureValidBossEditLease(guildId, bossId, userId, input.editLeaseToken);
  }
  if (input.notes !== undefined) {
    const currentRevision = createPlainBossNotesDocument(existing.notes).revision;
    if (!input.notesRevision || input.notesRevision !== currentRevision) {
      throw new BossLibraryError(
        'These notes changed while you were editing. Reload before saving.',
        409,
        { code: 'boss_notes_revision_conflict' }
      );
    }
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
    if (requiresEditLease) {
      const leaseRenewal = await transaction.guildBossEditLease.updateMany({
        where: {
          bossId,
          guildId,
          userId,
          token: input.editLeaseToken!,
          expiresAt: { gt: new Date() }
        },
        data: { expiresAt: buildBossEditLeaseExpiry() }
      });
      if (leaseRenewal.count !== 1) {
        throw new BossLibraryError(
          'Your edit lock expired. Return to Preview, then open the editor again.',
          409,
          { code: 'boss_edit_lock_lost', lock: null }
        );
      }
    }
    const update = await transaction.guildBoss.updateMany({
      where: {
        id: bossId,
        guildId,
        ...(input.notes !== undefined ? { notes: existing.notes } : {})
      },
      data: {
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(name ? { name } : {}),
        ...(input.imageUpload
          ? { imageUrl: null }
          : input.imageUrl !== undefined
            ? { imageUrl: normalizeOptionalText(input.imageUrl) }
            : {}),
        ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
        ...(input.cures !== undefined
          ? {
              cureCurse: input.cures.curse,
              curePoison: input.cures.poison,
              cureDisease: input.cures.disease
            }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        lastEditedById: editor.userId,
        lastEditedByName: editor.displayName
      }
    });
    if (update.count !== 1) {
      throw new BossLibraryError(
        'These notes changed while you were editing. Reload before saving.',
        409,
        { code: 'boss_notes_revision_conflict' }
      );
    }
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
    await transaction.guildBossEditHistory.create({
      data: {
        bossId,
        guildId,
        editorUserId: editor.userId,
        editorName: editor.displayName,
        editKind:
          input.notes !== undefined
            ? 'source_notes'
            : input.cures !== undefined
              ? 'cures'
              : 'details',
        summary: describeBossUpdate(input)
      }
    });
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
