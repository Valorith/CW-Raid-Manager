import { prisma } from '../utils/prisma.js';

export interface GoogleUserProfile {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface DiscordUserProfile {
  id: string;
  email: string;
  username: string;
  global_name?: string;
  verified?: boolean;
}

export async function upsertGoogleUser(profile: GoogleUserProfile) {
  if (!profile.email) {
    throw new Error('Google profile missing email.');
  }

  const displayName = profile.name ?? profile.email.split('@')[0];

  return prisma.user.upsert({
    where: { email: profile.email },
    update: {
      displayName,
      googleId: profile.id
    },
    create: {
      email: profile.email,
      displayName,
      googleId: profile.id
    }
  });
}

export async function upsertDiscordUser(profile: DiscordUserProfile) {
  if (!profile.email) {
    throw new Error('Discord profile missing email. Ensure the email scope is granted.');
  }

  const displayName = profile.global_name ?? profile.username ?? profile.email.split('@')[0];

  return prisma.user.upsert({
    where: { email: profile.email },
    update: {
      displayName,
      discordId: profile.id
    },
    create: {
      email: profile.email,
      displayName,
      discordId: profile.id
    }
  });
}

/**
 * Link a Google account to an existing user.
 * Throws if the Google ID is already linked to a different user.
 */
export async function linkGoogleToUser(userId: string, profile: GoogleUserProfile) {
  // Check if this Google ID is already linked to another account
  const existingUser = await prisma.user.findUnique({
    where: { googleId: profile.id },
    select: { id: true }
  });

  if (existingUser && existingUser.id !== userId) {
    throw new Error('This Google account is already linked to another user.');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { googleId: profile.id },
    select: {
      id: true,
      googleId: true,
      discordId: true
    }
  });
}

/**
 * Link a Discord account to an existing user.
 * Throws if the Discord ID is already linked to a different user.
 */
export async function linkDiscordToUser(userId: string, profile: DiscordUserProfile) {
  // Check if this Discord ID is already linked to another account
  const existingUser = await prisma.user.findUnique({
    where: { discordId: profile.id },
    select: { id: true }
  });

  if (existingUser && existingUser.id !== userId) {
    throw new Error('This Discord account is already linked to another user.');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { discordId: profile.id },
    select: {
      id: true,
      googleId: true,
      discordId: true
    }
  });
}

/**
 * Unlink Google from a user account.
 * Throws if the user would have no login methods remaining.
 */
export async function unlinkGoogle(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleId: true, discordId: true }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.googleId) {
    throw new Error('Google is not linked to this account.');
  }

  if (!user.discordId) {
    throw new Error('Cannot unlink Google. You must have at least one login method.');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { googleId: null },
    select: {
      id: true,
      googleId: true,
      discordId: true
    }
  });
}

/**
 * Unlink Discord from a user account.
 * Throws if the user would have no login methods remaining.
 */
export async function unlinkDiscord(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleId: true, discordId: true }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.discordId) {
    throw new Error('Discord is not linked to this account.');
  }

  if (!user.googleId) {
    throw new Error('Cannot unlink Discord. You must have at least one login method.');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { discordId: null },
    select: {
      id: true,
      googleId: true,
      discordId: true
    }
  });
}

/**
 * Get linked providers for a user.
 */
export async function getLinkedProviders(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleId: true, discordId: true }
  });

  if (!user) {
    throw new Error('User not found.');
  }

  return {
    google: Boolean(user.googleId),
    discord: Boolean(user.discordId)
  };
}
