import { appConfig } from '../config/appConfig.js';
import { authenticate } from '../middleware/authenticate.js';
import { upsertGoogleUser } from '../services/authService.js';
import { prisma } from '../utils/prisma.js';
export async function authRoutes(server) {
    if (server.hasDecorator('googleOAuth2') && server.googleOAuth2) {
        server.get('/google/callback', async (request, reply) => {
            try {
                const token = await server.googleOAuth2?.getAccessTokenFromAuthorizationCodeFlow(request);
                const accessToken = token?.token.access_token;
                if (!accessToken) {
                    request.log.error('Missing Google access token in OAuth callback response.');
                    return reply.internalServerError('Unable to complete Google sign-in.');
                }
                const googleUserResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                if (!googleUserResponse.ok) {
                    request.log.error({ status: googleUserResponse.status, statusText: googleUserResponse.statusText }, 'Failed to fetch Google user profile');
                    return reply.internalServerError('Unable to complete Google sign-in.');
                }
                const profile = (await googleUserResponse.json());
                const user = await upsertGoogleUser(profile);
                const jwt = await reply.jwtSign({
                    userId: user.id,
                    email: user.email
                }, {
                    sign: {
                        expiresIn: '7d'
                    }
                });
                reply.setCookie('cwraid_token', jwt, {
                    signed: true,
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: appConfig.nodeEnv === 'production',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 7
                });
                return reply.redirect(`${appConfig.clientUrl}/auth/callback`);
            }
            catch (error) {
                request.log.error({ error }, 'Error during Google OAuth callback');
                return reply.internalServerError('Unable to complete Google sign-in.');
            }
        });
    }
    else {
        server.log.warn('Google OAuth plugin unavailable. Skipping Google callback route registration.');
    }
    server.get('/me', { preHandler: [authenticate] }, async (request) => {
        const user = await prisma.user.findUnique({
            where: { id: request.user.userId },
            select: {
                id: true,
                email: true,
                displayName: true,
                nickname: true,
                admin: true,
                guildMemberships: {
                    select: {
                        role: true,
                        guild: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                },
                guildApplications: {
                    select: {
                        id: true,
                        guildId: true,
                        status: true,
                        guild: {
                            select: {
                                id: true,
                                name: true,
                                description: true
                            }
                        },
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });
        if (!user) {
            return { user: null };
        }
        const pendingApplication = user.guildApplications.find((application) => application.status === 'PENDING');
        return {
            user: {
                userId: user.id,
                email: user.email,
                displayName: user.nickname ?? user.displayName,
                nickname: user.nickname ?? null,
                isAdmin: user.admin,
                guilds: user.guildMemberships.map((membership) => ({
                    id: membership.guild.id,
                    name: membership.guild.name,
                    role: membership.role
                })),
                pendingApplication: pendingApplication
                    ? {
                        id: pendingApplication.id,
                        guildId: pendingApplication.guildId,
                        status: pendingApplication.status,
                        guild: pendingApplication.guild
                    }
                    : null
            }
        };
    });
    server.post('/logout', async (request, reply) => {
        if (request.cookies.cwraid_token) {
            reply.clearCookie('cwraid_token', {
                path: '/'
            });
        }
        return { success: true };
    });
}
