import { createHash, randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const CLI_TOKEN_PREFIX = 'nxcli_';
const DEVICE_LOGIN_TTL_MS = 10 * 60 * 1000;
const CLI_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_SECONDS = 5;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USER_CODE_LENGTH = 8;
const DEFAULT_SCOPES = ['test-manager', 'webhook-inbox'] as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix = ''): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function normalizeUserCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function formatUserCode(value: string): string {
  const normalized = normalizeUserCode(value);
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function generateUserCode(): string {
  let code = '';
  for (let index = 0; index < USER_CODE_LENGTH; index += 1) {
    code += USER_CODE_ALPHABET[randomBytes(1)[0] % USER_CODE_ALPHABET.length];
  }
  return formatUserCode(code);
}

function sanitizeClientName(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 191) : 'Nexus CLI';
}

function verificationUrls(userCode: string) {
  const baseUrl = appConfig.clientUrl.replace(/\/+$/, '');
  const verificationUri = `${baseUrl}/cli/authorize`;
  const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;
  return { verificationUri, verificationUriComplete };
}

function serializeCliSession(session: {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null
  };
}

function serializeCliUser(user: {
  id: string;
  email: string;
  displayName: string;
  nickname: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.nickname?.trim() || user.displayName
  };
}

function normalizeScopes(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SCOPES];
  }

  return value.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0);
}

export async function createCliDeviceLogin(input: { clientName?: string | null }) {
  const deviceCode = randomToken('nxdev_');
  const expiresAt = new Date(Date.now() + DEVICE_LOGIN_TTL_MS);
  const clientName = sanitizeClientName(input.clientName);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = generateUserCode();
    try {
      await prisma.cliDeviceLogin.create({
        data: {
          deviceCodeHash: sha256(deviceCode),
          userCodeHash: sha256(normalizeUserCode(userCode)),
          userCode,
          clientName,
          requestedScopes: [...DEFAULT_SCOPES],
          expiresAt
        }
      });

      return {
        deviceCode,
        userCode,
        expiresAt: expiresAt.toISOString(),
        interval: POLL_INTERVAL_SECONDS,
        scopes: [...DEFAULT_SCOPES],
        ...verificationUrls(userCode)
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        attempt < 4
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to create a CLI login code.');
}

export async function getCliDeviceLoginForApproval(userCode: string) {
  const normalized = normalizeUserCode(userCode);
  if (normalized.length !== USER_CODE_LENGTH) {
    return null;
  }

  const login = await prisma.cliDeviceLogin.findUnique({
    where: { userCodeHash: sha256(normalized) },
    select: {
      id: true,
      userCode: true,
      clientName: true,
      requestedScopes: true,
      approvedAt: true,
      deniedAt: true,
      consumedAt: true,
      expiresAt: true,
      createdAt: true
    }
  });

  if (!login) {
    return null;
  }

  const now = new Date();
  const expired = login.expiresAt <= now;
  return {
    id: login.id,
    userCode: login.userCode,
    clientName: login.clientName,
    scopes: Array.isArray(login.requestedScopes) ? login.requestedScopes : [...DEFAULT_SCOPES],
    status: login.deniedAt
      ? 'denied'
      : login.consumedAt
        ? 'consumed'
        : login.approvedAt
          ? 'approved'
          : expired
            ? 'expired'
            : 'pending',
    createdAt: login.createdAt.toISOString(),
    expiresAt: login.expiresAt.toISOString()
  };
}

export async function approveCliDeviceLogin(actorUserId: string, userCode: string) {
  const normalized = normalizeUserCode(userCode);
  if (normalized.length !== USER_CODE_LENGTH) {
    throw new Error('Invalid CLI user code.');
  }

  const now = new Date();
  const login = await prisma.cliDeviceLogin.findUnique({
    where: { userCodeHash: sha256(normalized) }
  });
  if (!login) {
    throw new Error('CLI login request not found.');
  }
  if (login.expiresAt <= now) {
    throw new Error('CLI login request expired.');
  }
  if (login.approvedAt || login.deniedAt || login.consumedAt) {
    throw new Error('CLI login request is no longer pending.');
  }

  const updated = await prisma.cliDeviceLogin.updateMany({
    where: {
      id: login.id,
      approvedAt: null,
      deniedAt: null,
      consumedAt: null,
      expiresAt: { gt: now }
    },
    data: {
      approvedById: actorUserId,
      approvedAt: new Date(),
      deniedAt: null
    }
  });
  if (updated.count !== 1) {
    throw new Error('CLI login request is no longer pending.');
  }

  const approved = await prisma.cliDeviceLogin.findUniqueOrThrow({
    where: { id: login.id },
    select: {
      id: true,
      userCode: true,
      clientName: true,
      requestedScopes: true,
      approvedAt: true,
      deniedAt: true,
      consumedAt: true,
      expiresAt: true,
      createdAt: true
    }
  });

  return {
    id: approved.id,
    userCode: approved.userCode,
    clientName: approved.clientName,
    scopes: Array.isArray(approved.requestedScopes)
      ? approved.requestedScopes
      : [...DEFAULT_SCOPES],
    status: 'approved',
    createdAt: approved.createdAt.toISOString(),
    expiresAt: approved.expiresAt.toISOString()
  };
}

export async function denyCliDeviceLogin(actorUserId: string, userCode: string) {
  const normalized = normalizeUserCode(userCode);
  if (normalized.length !== USER_CODE_LENGTH) {
    throw new Error('Invalid CLI user code.');
  }

  const now = new Date();
  const login = await prisma.cliDeviceLogin.findUnique({
    where: { userCodeHash: sha256(normalized) }
  });
  if (!login) {
    throw new Error('CLI login request not found.');
  }
  if (login.expiresAt <= now) {
    throw new Error('CLI login request expired.');
  }
  if (login.approvedById && login.approvedById !== actorUserId) {
    throw new Error('CLI login request was already approved.');
  }
  if (login.approvedAt || login.deniedAt || login.consumedAt) {
    throw new Error('CLI login request is no longer pending.');
  }

  const updated = await prisma.cliDeviceLogin.updateMany({
    where: {
      id: login.id,
      approvedAt: null,
      deniedAt: null,
      consumedAt: null,
      expiresAt: { gt: now }
    },
    data: {
      deniedAt: new Date(),
      approvedById: null,
      approvedAt: null
    }
  });
  if (updated.count !== 1) {
    throw new Error('CLI login request is no longer pending.');
  }

  return getCliDeviceLoginForApproval(userCode);
}

export async function exchangeCliDeviceCode(deviceCode: string) {
  const login = await prisma.cliDeviceLogin.findUnique({
    where: { deviceCodeHash: sha256(deviceCode) },
    include: {
      approvedBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
          nickname: true
        }
      }
    }
  });

  if (!login) {
    return { status: 'invalid' as const };
  }
  if (login.deniedAt) {
    return { status: 'denied' as const };
  }
  if (login.expiresAt <= new Date()) {
    return { status: 'expired' as const };
  }
  if (login.consumedAt) {
    return { status: 'consumed' as const };
  }
  if (!login.approvedById || !login.approvedBy) {
    return { status: 'pending' as const, interval: POLL_INTERVAL_SECONDS };
  }

  const token = randomToken(CLI_TOKEN_PREFIX);
  const expiresAt = new Date(Date.now() + CLI_SESSION_TTL_MS);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.cliDeviceLogin.updateMany({
      where: {
        id: login.id,
        consumedAt: null
      },
      data: {
        consumedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      return null;
    }

    return tx.cliSession.create({
      data: {
        userId: login.approvedById!,
        tokenHash: sha256(token),
        name: login.clientName,
        scopes: login.requestedScopes ?? [...DEFAULT_SCOPES],
        expiresAt
      }
    });
  });

  if (!result) {
    return { status: 'consumed' as const };
  }

  return {
    status: 'approved' as const,
    token,
    session: serializeCliSession(result),
    user: serializeCliUser(login.approvedBy)
  };
}

export async function authenticateCliBearerToken(token: string) {
  if (!token.startsWith(CLI_TOKEN_PREFIX)) {
    return null;
  }

  const session = await prisma.cliSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          nickname: true
        }
      }
    }
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  await prisma.cliSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    userId: session.user.id,
    email: session.user.email,
    cliSessionId: session.id,
    cliScopes: normalizeScopes(session.scopes)
  };
}

export async function listCliSessions(userId: string) {
  const sessions = await prisma.cliSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }]
  });

  return { sessions: sessions.map(serializeCliSession) };
}

export async function revokeCliSession(userId: string, sessionId: string) {
  const session = await prisma.cliSession.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
    select: { id: true }
  });
  if (!session) {
    throw new Error('CLI session not found.');
  }

  await prisma.cliSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() }
  });
}
