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
