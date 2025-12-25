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
