import { Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';

export interface PageFavoriteInput {
  id?: string;
  label: string;
  path: string;
  addedAt?: string | null;
}

export interface PageFavoriteSummary {
  id: string;
  label: string;
  path: string;
  addedAt: string;
}

interface NormalizedPageFavoriteInput {
  id: string;
  label: string;
  path: string;
  addedAt: string;
}

const MAX_PAGE_FAVORITES = 24;

const pageFavoriteSelect = {
  id: true,
  label: true,
  path: true,
  addedAt: true
} satisfies Prisma.PageFavoriteSelect;

type PageFavoriteRecord = Prisma.PageFavoriteGetPayload<{ select: typeof pageFavoriteSelect }>;

export function isPageFavoriteStorageUnavailable(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === 'P2021' || error.code === 'P2022') {
    return true;
  }

  return (
    error.code === 'P2010' &&
    typeof error.meta?.message === 'string' &&
    (error.meta.message.includes('PageFavorite') || error.meta.message.includes('page favorite'))
  );
}

function normalizeFavoriteId(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed.slice(0, 191) : undefined;
}

function normalizeFavoriteLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeFavoritePath(value: string) {
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '';
  }
  return path.slice(0, 240);
}

function normalizeAddedAt(value: string | null | undefined) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function serializePageFavorite(favorite: PageFavoriteRecord): PageFavoriteSummary {
  return {
    id: favorite.id,
    label: favorite.label,
    path: favorite.path,
    addedAt: favorite.addedAt.toISOString()
  };
}

function normalizeFavorites(input: PageFavoriteInput[]) {
  const seenPaths = new Set<string>();
  const normalized: NormalizedPageFavoriteInput[] = [];

  for (const favorite of input) {
    const label = normalizeFavoriteLabel(favorite.label);
    const path = normalizeFavoritePath(favorite.path);

    if (!label || !path || seenPaths.has(path)) {
      continue;
    }

    seenPaths.add(path);
    normalized.push({
      id: normalizeFavoriteId(favorite.id) ?? '',
      label,
      path,
      addedAt: normalizeAddedAt(favorite.addedAt).toISOString()
    });

    if (normalized.length >= MAX_PAGE_FAVORITES) {
      break;
    }
  }

  return normalized;
}

export async function listPageFavorites(userId: string): Promise<PageFavoriteSummary[]> {
  const favorites = await prisma.pageFavorite.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { addedAt: 'desc' }],
    select: pageFavoriteSelect
  });

  return favorites.map(serializePageFavorite);
}

export async function replacePageFavorites(
  userId: string,
  input: PageFavoriteInput[]
): Promise<PageFavoriteSummary[]> {
  const favorites = normalizeFavorites(input);

  await prisma.$transaction(async (tx) => {
    await tx.pageFavorite.deleteMany({
      where: { userId }
    });

    if (favorites.length === 0) {
      return;
    }

    await tx.pageFavorite.createMany({
      data: favorites.map((favorite, index) => ({
        ...(favorite.id ? { id: favorite.id } : {}),
        userId,
        label: favorite.label,
        path: favorite.path,
        sortOrder: index,
        addedAt: new Date(favorite.addedAt)
      }))
    });
  });

  return listPageFavorites(userId);
}
