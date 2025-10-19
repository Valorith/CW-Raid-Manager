import { FastifyInstance } from 'fastify';

import { appConfig } from '../config/appConfig.js';
import { authenticate } from '../middleware/authenticate.js';
import { upsertGoogleUser } from '../services/authService.js';
import { prisma } from '../utils/prisma.js';

export async function authRoutes(server: FastifyInstance): Promise<void> {
  server.get('/google/callback', async (request, reply) => {
    try {
      const token = await server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const accessToken = token.token.access_token;

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

  server.get('/me', { preHandler: [authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        email: true,
        displayName: true
      }
    });

    if (!user) {
      return { user: null };
    }

    return {
      user: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName
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
