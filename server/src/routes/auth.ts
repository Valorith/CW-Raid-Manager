import { FastifyInstance } from 'fastify';

import { appConfig } from '../config/appConfig.js';
import { authenticate } from '../middleware/authenticate.js';
import { upsertDiscordUser, upsertGoogleUser } from '../services/authService.js';
import { prisma } from '../utils/prisma.js';

export async function authRoutes(server: FastifyInstance): Promise<void> {
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
          request.log.error(
            { status: googleUserResponse.status, statusText: googleUserResponse.statusText },
            'Failed to fetch Google user profile'
          );
          return reply.internalServerError('Unable to complete Google sign-in.');
        }

        const profile = (await googleUserResponse.json()) as {
          id: string;
          email: string;
          name?: string;
          verified_email?: boolean;
        };

        const user = await upsertGoogleUser(profile);
        const jwt = await reply.jwtSign(
          {
            userId: user.id,
            email: user.email
          },
          {
            sign: {
              expiresIn: '7d'
            }
          }
        );

        reply.setCookie('cwraid_token', jwt, {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          secure: appConfig.nodeEnv === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 7
        });

        return reply.redirect(`${appConfig.clientUrl}/auth/callback`);
      } catch (error) {
        request.log.error({ error }, 'Error during Google OAuth callback');
        return reply.internalServerError('Unable to complete Google sign-in.');
      }
    });
  } else {
    server.log.warn('Google OAuth plugin unavailable. Skipping Google callback route registration.');
  }

  if (server.hasDecorator('discordOAuth2') && server.discordOAuth2) {
    server.get('/discord/callback', async (request, reply) => {
      // Step 1: Exchange authorization code for access token
      let accessToken: string;
      try {
        // Log diagnostic info for debugging OAuth issues
        const queryParams = request.query as { code?: string; state?: string; error?: string };
        if (queryParams.error) {
          request.log.error(
            { error: queryParams.error },
            'Discord OAuth returned an error in callback'
          );
          return reply.internalServerError('Unable to complete Discord sign-in.');
        }

        request.log.info(
          {
            hasCode: Boolean(queryParams.code),
            hasState: Boolean(queryParams.state),
            hasStateCookie: Boolean(request.cookies?.['oauth2-redirect-state'])
          },
          'Discord OAuth callback received'
        );

        const token = await server.discordOAuth2?.getAccessTokenFromAuthorizationCodeFlow(request);
        if (!token?.token.access_token) {
          request.log.error('Missing Discord access token in OAuth callback response.');
          return reply.internalServerError('Unable to complete Discord sign-in.');
        }
        accessToken = token.token.access_token as string;
      } catch (tokenError) {
        const errorMessage =
          tokenError instanceof Error ? tokenError.message : 'Unknown token exchange error';
        const errorDetails = tokenError instanceof Error ? tokenError.stack : String(tokenError);
        request.log.error(
          {
            error: tokenError,
            errorMessage,
            errorDetails,
            callbackUrl: appConfig.discord?.callbackUrl
          },
          'Discord OAuth token exchange failed'
        );
        return reply.internalServerError('Unable to complete Discord sign-in.');
      }

      // Step 2: Fetch Discord user profile
      let profile: {
        id: string;
        email: string;
        username: string;
        global_name?: string;
        verified?: boolean;
      };
      try {
        const discordUserResponse = await fetch('https://discord.com/api/users/@me', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        if (!discordUserResponse.ok) {
          request.log.error(
            { status: discordUserResponse.status, statusText: discordUserResponse.statusText },
            'Failed to fetch Discord user profile'
          );
          return reply.internalServerError('Unable to complete Discord sign-in.');
        }

        profile = (await discordUserResponse.json()) as typeof profile;
      } catch (fetchError) {
        request.log.error({ error: fetchError }, 'Error fetching Discord user profile');
        return reply.internalServerError('Unable to complete Discord sign-in.');
      }

      // Step 3: Validate email exists
      if (!profile.email) {
        request.log.error('Discord profile missing email. User may not have granted email scope.');
        return reply.badRequest('Discord account must have a verified email address.');
      }

      // Step 4: Create or update user in database
      let user;
      try {
        user = await upsertDiscordUser(profile);
      } catch (dbError) {
        request.log.error({ error: dbError, discordId: profile.id }, 'Failed to upsert Discord user');
        return reply.internalServerError('Unable to complete Discord sign-in.');
      }

      // Step 5: Create JWT and set cookie
      try {
        const jwt = await reply.jwtSign(
          {
            userId: user.id,
            email: user.email
          },
          {
            sign: {
              expiresIn: '7d'
            }
          }
        );

        reply.setCookie('cwraid_token', jwt, {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          secure: appConfig.nodeEnv === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 7
        });

        return reply.redirect(`${appConfig.clientUrl}/auth/callback`);
      } catch (jwtError) {
        request.log.error({ error: jwtError }, 'Failed to sign JWT for Discord user');
        return reply.internalServerError('Unable to complete Discord sign-in.');
      }
    });
  } else {
    server.log.warn('Discord OAuth plugin unavailable. Skipping Discord callback route registration.');
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
