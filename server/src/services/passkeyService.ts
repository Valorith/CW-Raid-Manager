import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential
} from '@simplewebauthn/server';

import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SUPPORTED_ALGORITHM_IDS = [-7, -257];
const TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb'
]);

type PasskeyChallengeType = 'REGISTRATION' | 'AUTHENTICATION';

export interface PasskeySummary {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  transports: AuthenticatorTransportFuture[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyAuthenticatedUser {
  id: string;
  email: string;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function copyToArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return copyToArrayBufferBytes(Buffer.from(value, 'base64url'));
}

function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  return copyToArrayBufferBytes(new TextEncoder().encode(value));
}

function challengeExpiresAt(): Date {
  return new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS);
}

function normalizeTransports(value: Prisma.JsonValue | null): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (transport): transport is AuthenticatorTransportFuture =>
      typeof transport === 'string' && TRANSPORTS.has(transport as AuthenticatorTransportFuture)
  );
}

function serializePasskey(passkey: {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  transports: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}): PasskeySummary {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    transports: normalizeTransports(passkey.transports),
    createdAt: passkey.createdAt.toISOString(),
    updatedAt: passkey.updatedAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null
  };
}

async function prunePasskeyChallenges(): Promise<void> {
  const consumedCutoff = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.passkeyChallenge.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { lt: consumedCutoff } }]
    }
  });
}

async function storeChallenge(
  type: PasskeyChallengeType,
  challenge: string,
  userId?: string
): Promise<void> {
  await prunePasskeyChallenges();
  await prisma.passkeyChallenge.create({
    data: {
      type,
      challengeHash: hashValue(challenge),
      userId: userId ?? null,
      expiresAt: challengeExpiresAt()
    }
  });
}

async function consumeExpectedChallenge(
  type: PasskeyChallengeType,
  challenge: string,
  userId?: string
): Promise<boolean> {
  const result = await prisma.passkeyChallenge.updateMany({
    where: {
      type,
      challengeHash: hashValue(challenge),
      userId: userId ?? null,
      consumedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    data: {
      consumedAt: new Date()
    }
  });

  return result.count === 1;
}

function defaultPasskeyName(count: number, deviceType?: string): string {
  if (count === 0) {
    return deviceType === 'multiDevice' ? 'Synced passkey' : 'This device';
  }

  return `Passkey ${count + 1}`;
}

export async function generatePasskeyRegistrationOptions(
  userId: string
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      nickname: true,
      passkeys: {
        select: {
          credentialId: true,
          transports: true
        }
      }
    }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const options = await generateRegistrationOptions({
    rpName: appConfig.passkeys.rpName,
    rpID: appConfig.passkeys.rpId,
    userID: utf8Bytes(user.id),
    userName: user.email,
    userDisplayName: user.nickname ?? user.displayName,
    timeout: 60_000,
    attestationType: 'none',
    excludeCredentials: user.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: normalizeTransports(passkey.transports)
    })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required'
    },
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS
  });

  await storeChallenge('REGISTRATION', options.challenge, user.id);
  return options;
}

export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON
): Promise<PasskeySummary> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: (challenge) => consumeExpectedChallenge('REGISTRATION', challenge, userId),
    expectedOrigin: appConfig.passkeys.origin,
    expectedRPID: appConfig.passkeys.rpId,
    requireUserVerification: true,
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration could not be verified.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const credentialIdHash = hashValue(credential.id);
  const existingPasskey = await prisma.userPasskey.findUnique({
    where: { credentialIdHash },
    select: { id: true }
  });

  if (existingPasskey) {
    throw new Error('This passkey is already registered.');
  }

  const existingCount = await prisma.userPasskey.count({ where: { userId } });
  const transports = response.response.transports ?? credential.transports ?? [];

  const passkey = await prisma.userPasskey.create({
    data: {
      userId,
      credentialIdHash,
      credentialId: credential.id,
      publicKey: bytesToBase64Url(credential.publicKey),
      counter: BigInt(credential.counter),
      transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: defaultPasskeyName(existingCount, credentialDeviceType)
    }
  });

  return serializePasskey(passkey);
}

export async function generatePasskeyAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: appConfig.passkeys.rpId,
    allowCredentials: [],
    timeout: 60_000,
    userVerification: 'required'
  });

  await storeChallenge('AUTHENTICATION', options.challenge);
  return options;
}

export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON
): Promise<PasskeyAuthenticatedUser> {
  const credentialId = response.id || response.rawId;
  const passkey = await prisma.userPasskey.findUnique({
    where: { credentialIdHash: hashValue(credentialId) },
    select: {
      id: true,
      credentialId: true,
      publicKey: true,
      counter: true,
      transports: true,
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  if (!passkey) {
    throw new Error('Passkey not recognized.');
  }

  const credential: WebAuthnCredential = {
    id: passkey.credentialId,
    publicKey: base64UrlToBytes(passkey.publicKey),
    counter: Number(passkey.counter),
    transports: normalizeTransports(passkey.transports)
  };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: (challenge) => consumeExpectedChallenge('AUTHENTICATION', challenge),
    expectedOrigin: appConfig.passkeys.origin,
    expectedRPID: appConfig.passkeys.rpId,
    credential,
    requireUserVerification: true
  });

  if (!verification.verified) {
    throw new Error('Passkey sign-in could not be verified.');
  }

  const { authenticationInfo } = verification;
  await prisma.userPasskey.update({
    where: { id: passkey.id },
    data: {
      counter: BigInt(authenticationInfo.newCounter),
      deviceType: authenticationInfo.credentialDeviceType,
      backedUp: authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date()
    }
  });

  return passkey.user;
}

export async function listUserPasskeys(userId: string): Promise<PasskeySummary[]> {
  const passkeys = await prisma.userPasskey.findMany({
    where: { userId },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }]
  });

  return passkeys.map(serializePasskey);
}

export async function renameUserPasskey(
  userId: string,
  passkeyId: string,
  name: string
): Promise<PasskeySummary> {
  const passkey = await prisma.userPasskey.findFirst({
    where: { id: passkeyId, userId },
    select: { id: true }
  });

  if (!passkey) {
    throw new Error('Passkey not found.');
  }

  const updated = await prisma.userPasskey.update({
    where: { id: passkey.id },
    data: { name }
  });

  return serializePasskey(updated);
}

export async function deleteUserPasskey(userId: string, passkeyId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleId: true,
      discordId: true,
      _count: {
        select: { passkeys: true }
      }
    }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.googleId && !user.discordId && user._count.passkeys <= 1) {
    throw new Error('Cannot remove your last login method.');
  }

  const result = await prisma.userPasskey.deleteMany({
    where: { id: passkeyId, userId }
  });

  if (result.count === 0) {
    throw new Error('Passkey not found.');
  }
}
