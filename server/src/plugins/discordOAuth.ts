import fastifyOauth2, { FastifyOAuth2Options, OAuth2Namespace } from '@fastify/oauth2';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import { appConfig } from '../config/appConfig.js';

declare module 'fastify' {
  interface FastifyInstance {
    discordOAuth2?: OAuth2Namespace;
  }
}

const oauthPlugin = fastifyOauth2 as unknown as FastifyPluginCallback<FastifyOAuth2Options>;

export const discordOAuthPlugin = fp(async (fastify) => {
  if (!appConfig.discord) {
    fastify.log.warn('Discord OAuth credentials missing. Skipping Discord OAuth plugin registration.');
    return;
  }

  // Type assertion needed because @fastify/oauth2 types don't include cookie option
  // but the runtime supports it (added in v6.x)
  const oauthOptions = {
    name: 'discordOAuth2',
    scope: ['identify', 'email'],
    credentials: {
      client: {
        id: appConfig.discord.clientId,
        secret: appConfig.discord.clientSecret
      },
      auth: {
        authorizeHost: 'https://discord.com',
        authorizePath: '/oauth2/authorize',
        tokenHost: 'https://discord.com',
        tokenPath: '/api/oauth2/token'
      },
      options: {
        authorizationMethod: 'body'
      }
    },
    startRedirectPath: '/api/auth/discord',
    callbackUri: appConfig.discord.callbackUrl,
    cookie: {
      secure: appConfig.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      httpOnly: true
    }
  } as FastifyOAuth2Options;

  fastify.register(oauthPlugin, oauthOptions);

  fastify.log.info('Discord OAuth plugin registered successfully.');
});
