import { appConfig } from '../config/appConfig.js';
import { authenticate } from '../middleware/authenticate.js';
import { linkDiscordToUser, linkGoogleToUser, upsertDiscordUser, upsertGoogleUser } from '../services/authService.js';
import { prisma } from '../utils/prisma.js';
export async function authRoutes(server) {
    if (server.hasDecorator('googleOAuth2') && server.googleOAuth2) {
        server.get('/google/callback', async (request, reply) => {
            try {
                // Check if this is a linking flow (user is linking account, not logging in)
                const linkCookie = request.cookies.cwraid_link_user;
                let linkingUserId = null;
                if (linkCookie) {
                    const unsignedCookie = reply.unsignCookie(linkCookie);
                    if (unsignedCookie.valid && unsignedCookie.value) {
                        linkingUserId = unsignedCookie.value;
                    }
                    // Clear the linking cookie regardless
                    reply.clearCookie('cwraid_link_user', { path: '/' });
                }
                const token = await server.googleOAuth2?.getAccessTokenFromAuthorizationCodeFlow(request);
                const accessToken = token?.token.access_token;
                if (!accessToken) {
                    request.log.error('Missing Google access token in OAuth callback response.');
                    if (linkingUserId) {
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to complete Google account linking.')}`);
                    }
                    return reply.internalServerError('Unable to complete Google sign-in.');
                }
                const googleUserResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                if (!googleUserResponse.ok) {
                    request.log.error({ status: googleUserResponse.status, statusText: googleUserResponse.statusText }, 'Failed to fetch Google user profile');
                    if (linkingUserId) {
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Google profile.')}`);
                    }
                    return reply.internalServerError('Unable to complete Google sign-in.');
                }
                const profile = (await googleUserResponse.json());
                // If this is a linking flow, link the account and redirect back to settings
                if (linkingUserId) {
                    try {
                        await linkGoogleToUser(linkingUserId, profile);
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?linked=google`);
                    }
                    catch (linkError) {
                        const message = linkError instanceof Error ? linkError.message : 'Failed to link Google account.';
                        request.log.error({ error: linkError }, 'Error linking Google account');
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent(message)}`);
                    }
                }
                // Normal login flow
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
    if (server.hasDecorator('discordOAuth2') && server.discordOAuth2) {
        server.get('/discord/callback', async (request, reply) => {
            // Check if this is a linking flow (user is linking account, not logging in)
            const linkCookie = request.cookies.cwraid_link_user;
            let linkingUserId = null;
            if (linkCookie) {
                const unsignedCookie = reply.unsignCookie(linkCookie);
                if (unsignedCookie.valid && unsignedCookie.value) {
                    linkingUserId = unsignedCookie.value;
                }
                // Clear the linking cookie regardless
                reply.clearCookie('cwraid_link_user', { path: '/' });
            }
            // Step 1: Exchange authorization code for access token
            let accessToken;
            try {
                // Log diagnostic info for debugging OAuth issues
                const queryParams = request.query;
                if (queryParams.error) {
                    request.log.error({ error: queryParams.error }, 'Discord OAuth returned an error in callback');
                    if (linkingUserId) {
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Discord OAuth was cancelled or failed.')}`);
                    }
                    return reply.internalServerError('Unable to complete Discord sign-in.');
                }
                request.log.info({
                    hasCode: Boolean(queryParams.code),
                    hasState: Boolean(queryParams.state),
                    hasStateCookie: Boolean(request.cookies?.['oauth2-redirect-state']),
                    isLinkingFlow: Boolean(linkingUserId)
                }, 'Discord OAuth callback received');
                const token = await server.discordOAuth2?.getAccessTokenFromAuthorizationCodeFlow(request);
                if (!token?.token.access_token) {
                    request.log.error('Missing Discord access token in OAuth callback response.');
                    if (linkingUserId) {
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to complete Discord account linking.')}`);
                    }
                    return reply.internalServerError('Unable to complete Discord sign-in.');
                }
                accessToken = token.token.access_token;
            }
            catch (tokenError) {
                const errorMessage = tokenError instanceof Error ? tokenError.message : 'Unknown token exchange error';
                const errorDetails = tokenError instanceof Error ? tokenError.stack : String(tokenError);
                request.log.error({
                    error: tokenError,
                    errorMessage,
                    errorDetails,
                    callbackUrl: appConfig.discord?.callbackUrl
                }, 'Discord OAuth token exchange failed');
                if (linkingUserId) {
                    return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to complete Discord account linking.')}`);
                }
                return reply.internalServerError('Unable to complete Discord sign-in.');
            }
            // Step 2: Fetch Discord user profile
            let profile;
            try {
                const discordUserResponse = await fetch('https://discord.com/api/users/@me', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                if (!discordUserResponse.ok) {
                    request.log.error({ status: discordUserResponse.status, statusText: discordUserResponse.statusText }, 'Failed to fetch Discord user profile');
                    if (linkingUserId) {
                        return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Discord profile.')}`);
                    }
                    return reply.internalServerError('Unable to complete Discord sign-in.');
                }
                profile = (await discordUserResponse.json());
            }
            catch (fetchError) {
                request.log.error({ error: fetchError }, 'Error fetching Discord user profile');
                if (linkingUserId) {
                    return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Discord profile.')}`);
                }
                return reply.internalServerError('Unable to complete Discord sign-in.');
            }
            // Step 3: Validate email exists
            if (!profile.email) {
                request.log.error('Discord profile missing email. User may not have granted email scope.');
                if (linkingUserId) {
                    return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent('Discord account must have a verified email address.')}`);
                }
                return reply.badRequest('Discord account must have a verified email address.');
            }
            // If this is a linking flow, link the account and redirect back to settings
            if (linkingUserId) {
                try {
                    await linkDiscordToUser(linkingUserId, profile);
                    return reply.redirect(`${appConfig.clientUrl}/settings/account?linked=discord`);
                }
                catch (linkError) {
                    const message = linkError instanceof Error ? linkError.message : 'Failed to link Discord account.';
                    request.log.error({ error: linkError }, 'Error linking Discord account');
                    return reply.redirect(`${appConfig.clientUrl}/settings/account?error=${encodeURIComponent(message)}`);
                }
            }
            // Step 4: Create or update user in database (login flow)
            let user;
            try {
                user = await upsertDiscordUser(profile);
            }
            catch (dbError) {
                request.log.error({ error: dbError, discordId: profile.id }, 'Failed to upsert Discord user');
                return reply.internalServerError('Unable to complete Discord sign-in.');
            }
            // Step 5: Create JWT and set cookie
            try {
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
            catch (jwtError) {
                request.log.error({ error: jwtError }, 'Failed to sign JWT for Discord user');
                return reply.internalServerError('Unable to complete Discord sign-in.');
            }
        });
    }
    else {
        server.log.warn('Discord OAuth plugin unavailable. Skipping Discord callback route registration.');
    }
    // ============ OAuth Account Linking Routes ============
    // These routes set a linking cookie then redirect to the standard OAuth flow.
    // The main callbacks detect this cookie and link instead of logging in.
    // Google account linking - initiate
    if (server.hasDecorator('googleOAuth2') && server.googleOAuth2) {
        server.get('/google/link', { preHandler: [authenticate] }, async (request, reply) => {
            // Store the user ID in a cookie so we know who to link to after OAuth
            reply.setCookie('cwraid_link_user', request.user.userId, {
                signed: true,
                httpOnly: true,
                sameSite: 'lax',
                secure: appConfig.nodeEnv === 'production',
                path: '/',
                maxAge: 60 * 10 // 10 minutes
            });
            // Redirect to the standard Google OAuth start path
            return reply.redirect('/api/auth/google');
        });
    }
    // Discord account linking - initiate
    if (server.hasDecorator('discordOAuth2') && server.discordOAuth2) {
        server.get('/discord/link', { preHandler: [authenticate] }, async (request, reply) => {
            // Store the user ID in a cookie so we know who to link to after OAuth
            reply.setCookie('cwraid_link_user', request.user.userId, {
                signed: true,
                httpOnly: true,
                sameSite: 'lax',
                secure: appConfig.nodeEnv === 'production',
                path: '/',
                maxAge: 60 * 10 // 10 minutes
            });
            // Redirect to the standard Discord OAuth start path
            return reply.redirect('/api/auth/discord');
        });
    }
    server.get('/me', { preHandler: [authenticate] }, async (request) => {
        const user = await prisma.user.findUnique({
            where: { id: request.user.userId },
            select: {
                id: true,
                email: true,
                displayName: true,
                nickname: true,
                defaultLogFileName: true,
                admin: true,
                guide: true,
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
                defaultLogFileName: user.defaultLogFileName ?? null,
                isAdmin: user.admin,
                isGuide: user.guide,
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
