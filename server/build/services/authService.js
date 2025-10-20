import { prisma } from '../utils/prisma.js';
export async function upsertGoogleUser(profile) {
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
