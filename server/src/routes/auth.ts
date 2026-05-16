import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { appConfig } from '../config/appConfig.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  linkDiscordToUser,
  linkGoogleToUser,
  upsertDiscordUser,
  upsertGoogleUser
} from '../services/authService.js';
import { getTestManagerUserPermissions } from '../services/testManagerService.js';
import {
  captureOAuthException,
  fetchOAuthProvider,
  runOAuthOperationWithRetry,
  type OAuthProvider
} from '../utils/oauthReliability.js';
import { prisma } from '../utils/prisma.js';

const POST_AUTH_ORIGIN_COOKIE = 'cwraid_post_auth_origin';
const GENERIC_OAUTH_LOGIN_ERROR = 'Sign-in could not be completed. Please try again.';

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  );
}

function normalizeOrigin(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function buildOAuthLoginErrorUrl(
  postAuthBaseUrl: string,
  provider: OAuthProvider,
  message = GENERIC_OAUTH_LOGIN_ERROR
): string {
  const url = new URL('/auth/callback', postAuthBaseUrl);
  url.searchParams.set('error', message);
  url.searchParams.set('provider', provider);
  return url.toString();
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  const configuredClientOrigin = normalizeOrigin(appConfig.clientUrl);

  function getRequestedClientOrigin(request: FastifyRequest): string | null {
    const originHeader = request.headers.origin;
    const refererHeader = request.headers.referer;
    const originCandidate = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const refererCandidate = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
    const normalizedOrigin = normalizeOrigin(originCandidate);
    const normalizedReferer = normalizeOrigin(refererCandidate);

    return normalizedOrigin ?? normalizedReferer;
  }

  function isAllowedClientOrigin(origin: string): boolean {
    if (configuredClientOrigin && origin === configuredClientOrigin) {
      return true;
    }

    try {
      const url = new URL(origin);
      return appConfig.nodeEnv !== 'production' && isLoopbackHostname(url.hostname);
    } catch {
      return false;
    }
  }

  function setPostAuthOriginCookie(request: FastifyRequest, reply: FastifyReply): void {
    const requestedOrigin = getRequestedClientOrigin(request);

    if (!requestedOrigin || !isAllowedClientOrigin(requestedOrigin)) {
      reply.clearCookie(POST_AUTH_ORIGIN_COOKIE, { path: '/' });
      return;
    }

    reply.setCookie(POST_AUTH_ORIGIN_COOKIE, requestedOrigin, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: appConfig.nodeEnv === 'production',
      path: '/',
      maxAge: 60 * 10
    });
  }

  function getPostAuthBaseUrl(reply: FastifyReply, cookieValue?: string): string {
    if (cookieValue) {
      const unsignedCookie = reply.unsignCookie(cookieValue);
      if (
        unsignedCookie.valid &&
        unsignedCookie.value &&
        isAllowedClientOrigin(unsignedCookie.value)
      ) {
        return unsignedCookie.value;
      }
    }

    return appConfig.clientUrl;
  }

  if (server.hasDecorator('googleOAuth2') && server.googleOAuth2) {
    server.get('/google', async (request, reply) => {
      setPostAuthOriginCookie(request, reply);
      return reply.redirect('/api/auth/google/start');
    });
  }

  if (server.hasDecorator('googleOAuth2') && server.googleOAuth2) {
    server.get('/google/callback', async (request, reply) => {
      try {
        const postAuthBaseUrl = getPostAuthBaseUrl(reply, request.cookies[POST_AUTH_ORIGIN_COOKIE]);
        reply.clearCookie(POST_AUTH_ORIGIN_COOKIE, { path: '/' });

        // Check if this is a linking flow (user is linking account, not logging in)
        const linkCookie = request.cookies.cwraid_link_user;
        let linkingUserId: string | null = null;

        if (linkCookie) {
          const unsignedCookie = reply.unsignCookie(linkCookie);
          if (unsignedCookie.valid && unsignedCookie.value) {
            linkingUserId = unsignedCookie.value;
          }
          // Clear the linking cookie regardless
          reply.clearCookie('cwraid_link_user', { path: '/' });
        }

        const token = await runOAuthOperationWithRetry(
          () => {
            if (!server.googleOAuth2) {
              throw new Error('Google OAuth plugin is unavailable during callback.');
            }
            return server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
          },
          {
            provider: 'google',
            phase: 'token_exchange',
            request
          }
        );
        const accessToken = token?.token.access_token;

        if (!accessToken) {
          captureOAuthException(
            new Error('Google OAuth token response did not include an access token.'),
            {
              provider: 'google',
              phase: 'missing_access_token',
              request,
              extra: {
                callbackUrl: appConfig.google?.callbackUrl
              }
            }
          );
          request.log.error('Missing Google access token in OAuth callback response.');
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to complete Google account linking.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        let googleUserResponse: Response;
        try {
          googleUserResponse = await fetchOAuthProvider(
            request,
            'google',
            'profile_fetch',
            'https://www.googleapis.com/oauth2/v2/userinfo',
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );
        } catch (profileFetchError) {
          captureOAuthException(profileFetchError, {
            provider: 'google',
            phase: 'profile_fetch',
            request,
            extra: {
              callbackUrl: appConfig.google?.callbackUrl
            }
          });
          request.log.error({ error: profileFetchError }, 'Error fetching Google user profile');
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Google profile.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        if (!googleUserResponse.ok) {
          captureOAuthException(
            new Error(
              `Google profile request failed with HTTP ${googleUserResponse.status} ${googleUserResponse.statusText}`
            ),
            {
              provider: 'google',
              phase: 'profile_fetch',
              request,
              extra: {
                responseStatus: googleUserResponse.status,
                callbackUrl: appConfig.google?.callbackUrl
              }
            }
          );
          request.log.error(
            { status: googleUserResponse.status, statusText: googleUserResponse.statusText },
            'Failed to fetch Google user profile'
          );
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Google profile.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        let profile: {
          id: string;
          email: string;
          name?: string;
          verified_email?: boolean;
        };
        try {
          profile = (await googleUserResponse.json()) as typeof profile;
        } catch (profileParseError) {
          captureOAuthException(profileParseError, {
            provider: 'google',
            phase: 'profile_parse',
            request
          });
          request.log.error({ error: profileParseError }, 'Error parsing Google user profile');
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Google profile.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        // If this is a linking flow, link the account and redirect back to settings
        if (linkingUserId) {
          try {
            await linkGoogleToUser(linkingUserId, profile);
            return reply.redirect(`${postAuthBaseUrl}/settings/account?linked=google`);
          } catch (linkError) {
            const message =
              linkError instanceof Error ? linkError.message : 'Failed to link Google account.';
            request.log.error({ error: linkError }, 'Error linking Google account');
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent(message)}`
            );
          }
        }

        // Normal login flow
        let user;
        try {
          user = await upsertGoogleUser(profile);
        } catch (dbError) {
          captureOAuthException(dbError, {
            provider: 'google',
            phase: 'db_upsert',
            request
          });
          request.log.error(
            { error: dbError, googleId: profile.id },
            'Failed to upsert Google user'
          );
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        let jwt: string;
        try {
          jwt = await reply.jwtSign(
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
        } catch (jwtError) {
          captureOAuthException(jwtError, {
            provider: 'google',
            phase: 'jwt_sign',
            request
          });
          request.log.error({ error: jwtError }, 'Failed to sign JWT for Google user');
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
        }

        reply.setCookie('cwraid_token', jwt, {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          secure: appConfig.nodeEnv === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 7
        });

        return reply.redirect(`${postAuthBaseUrl}/auth/callback`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        captureOAuthException(error, {
          provider: 'google',
          phase: 'callback_unhandled',
          request,
          extra: {
            callbackUrl: appConfig.google?.callbackUrl
          }
        });
        request.log.error(
          {
            error,
            errorMessage: errMsg,
            errorStack: errStack,
            callbackUrl: appConfig.google?.callbackUrl,
            protocol: request.protocol,
            hostname: request.hostname,
            url: request.url,
            cookies: Object.keys(request.cookies || {})
          },
          'Error during Google OAuth callback'
        );
        const postAuthBaseUrl = getPostAuthBaseUrl(reply, request.cookies[POST_AUTH_ORIGIN_COOKIE]);
        return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'google'));
      }
    });
  } else {
    server.log.warn(
      'Google OAuth plugin unavailable. Skipping Google callback route registration.'
    );
  }

  if (server.hasDecorator('discordOAuth2') && server.discordOAuth2) {
    server.get('/discord', async (request, reply) => {
      setPostAuthOriginCookie(request, reply);
      return reply.redirect('/api/auth/discord/start');
    });

    server.get('/discord/callback', async (request, reply) => {
      const postAuthBaseUrl = getPostAuthBaseUrl(reply, request.cookies[POST_AUTH_ORIGIN_COOKIE]);
      reply.clearCookie(POST_AUTH_ORIGIN_COOKIE, { path: '/' });

      // Check if this is a linking flow (user is linking account, not logging in)
      const linkCookie = request.cookies.cwraid_link_user;
      let linkingUserId: string | null = null;

      if (linkCookie) {
        const unsignedCookie = reply.unsignCookie(linkCookie);
        if (unsignedCookie.valid && unsignedCookie.value) {
          linkingUserId = unsignedCookie.value;
        }
        // Clear the linking cookie regardless
        reply.clearCookie('cwraid_link_user', { path: '/' });
      }

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
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Discord OAuth was cancelled or failed.')}`
            );
          }
          return reply.redirect(
            buildOAuthLoginErrorUrl(
              postAuthBaseUrl,
              'discord',
              'Discord sign-in was cancelled or failed. Please try again.'
            )
          );
        }

        request.log.info(
          {
            hasCode: Boolean(queryParams.code),
            hasState: Boolean(queryParams.state),
            hasStateCookie: Boolean(request.cookies?.['oauth2-redirect-state']),
            isLinkingFlow: Boolean(linkingUserId)
          },
          'Discord OAuth callback received'
        );

        const token = await runOAuthOperationWithRetry(
          () => {
            if (!server.discordOAuth2) {
              throw new Error('Discord OAuth plugin is unavailable during callback.');
            }
            return server.discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
          },
          {
            provider: 'discord',
            phase: 'token_exchange',
            request
          }
        );
        if (!token?.token.access_token) {
          captureOAuthException(
            new Error('Discord OAuth token response did not include an access token.'),
            {
              provider: 'discord',
              phase: 'missing_access_token',
              request,
              extra: {
                callbackUrl: appConfig.discord?.callbackUrl
              }
            }
          );
          request.log.error('Missing Discord access token in OAuth callback response.');
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to complete Discord account linking.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
        }
        accessToken = token.token.access_token as string;
      } catch (tokenError) {
        const errorMessage =
          tokenError instanceof Error ? tokenError.message : 'Unknown token exchange error';
        const errorDetails = tokenError instanceof Error ? tokenError.stack : String(tokenError);
        captureOAuthException(tokenError, {
          provider: 'discord',
          phase: 'token_exchange',
          request,
          extra: {
            callbackUrl: appConfig.discord?.callbackUrl
          }
        });
        request.log.error(
          {
            error: tokenError,
            errorMessage,
            errorDetails,
            callbackUrl: appConfig.discord?.callbackUrl
          },
          'Discord OAuth token exchange failed'
        );
        if (linkingUserId) {
          return reply.redirect(
            `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to complete Discord account linking.')}`
          );
        }
        return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
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
        const discordUserResponse = await fetchOAuthProvider(
          request,
          'discord',
          'profile_fetch',
          'https://discord.com/api/users/@me',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        if (!discordUserResponse.ok) {
          captureOAuthException(
            new Error(
              `Discord profile request failed with HTTP ${discordUserResponse.status} ${discordUserResponse.statusText}`
            ),
            {
              provider: 'discord',
              phase: 'profile_fetch',
              request,
              extra: {
                responseStatus: discordUserResponse.status,
                callbackUrl: appConfig.discord?.callbackUrl
              }
            }
          );
          request.log.error(
            { status: discordUserResponse.status, statusText: discordUserResponse.statusText },
            'Failed to fetch Discord user profile'
          );
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Discord profile.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
        }

        try {
          profile = (await discordUserResponse.json()) as typeof profile;
        } catch (profileParseError) {
          captureOAuthException(profileParseError, {
            provider: 'discord',
            phase: 'profile_parse',
            request
          });
          request.log.error({ error: profileParseError }, 'Error parsing Discord user profile');
          if (linkingUserId) {
            return reply.redirect(
              `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Discord profile.')}`
            );
          }
          return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
        }
      } catch (fetchError) {
        captureOAuthException(fetchError, {
          provider: 'discord',
          phase: 'profile_fetch',
          request,
          extra: {
            callbackUrl: appConfig.discord?.callbackUrl
          }
        });
        request.log.error({ error: fetchError }, 'Error fetching Discord user profile');
        if (linkingUserId) {
          return reply.redirect(
            `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Unable to fetch Discord profile.')}`
          );
        }
        return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
      }

      // Step 3: Validate email exists
      if (!profile.email) {
        request.log.error('Discord profile missing email. User may not have granted email scope.');
        if (linkingUserId) {
          return reply.redirect(
            `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent('Discord account must have a verified email address.')}`
          );
        }
        return reply.redirect(
          buildOAuthLoginErrorUrl(
            postAuthBaseUrl,
            'discord',
            'Discord account must have a verified email address.'
          )
        );
      }

      // If this is a linking flow, link the account and redirect back to settings
      if (linkingUserId) {
        try {
          await linkDiscordToUser(linkingUserId, profile);
          return reply.redirect(`${postAuthBaseUrl}/settings/account?linked=discord`);
        } catch (linkError) {
          const message =
            linkError instanceof Error ? linkError.message : 'Failed to link Discord account.';
          request.log.error({ error: linkError }, 'Error linking Discord account');
          return reply.redirect(
            `${postAuthBaseUrl}/settings/account?error=${encodeURIComponent(message)}`
          );
        }
      }

      // Step 4: Create or update user in database (login flow)
      let user;
      try {
        user = await upsertDiscordUser(profile);
      } catch (dbError) {
        captureOAuthException(dbError, {
          provider: 'discord',
          phase: 'db_upsert',
          request
        });
        request.log.error(
          { error: dbError, discordId: profile.id },
          'Failed to upsert Discord user'
        );
        return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
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

        return reply.redirect(`${postAuthBaseUrl}/auth/callback`);
      } catch (jwtError) {
        captureOAuthException(jwtError, {
          provider: 'discord',
          phase: 'jwt_sign',
          request
        });
        request.log.error({ error: jwtError }, 'Failed to sign JWT for Discord user');
        return reply.redirect(buildOAuthLoginErrorUrl(postAuthBaseUrl, 'discord'));
      }
    });
  } else {
    server.log.warn(
      'Discord OAuth plugin unavailable. Skipping Discord callback route registration.'
    );
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
        tester: true,
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

    const pendingApplication = user.guildApplications.find(
      (application) => application.status === 'PENDING'
    );
    const testManagerPermissions = await getTestManagerUserPermissions(user);

    return {
      user: {
        userId: user.id,
        email: user.email,
        displayName: user.nickname ?? user.displayName,
        nickname: user.nickname ?? null,
        defaultLogFileName: user.defaultLogFileName ?? null,
        isAdmin: user.admin,
        isGuide: user.guide,
        isTester: user.tester,
        testManagerPermissions,
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
