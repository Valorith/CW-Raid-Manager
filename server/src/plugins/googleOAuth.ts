import fastifyOauth2, { FastifyOAuth2Options, OAuth2Namespace, ProviderConfiguration } from '@fastify/oauth2';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import { appConfig } from '../config/appConfig.js';

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
  }
}

const oauthPlugin = fastifyOauth2 as unknown as FastifyPluginCallback<FastifyOAuth2Options>;
const googleConfiguration = (fastifyOauth2 as unknown as { GOOGLE_CONFIGURATION: ProviderConfiguration }).GOOGLE_CONFIGURATION;

export const googleOAuthPlugin = fp(async (fastify) => {
  if (!appConfig.google) {
    fastify.log.warn('Google OAuth credentials missing. Skipping Google OAuth plugin registration.');
    return;
  }

  fastify.register(oauthPlugin, {
    name: 'googleOAuth2',
    scope: ['profile', 'email'],
    credentials: {
      client: {
        id: appConfig.google.clientId,
        secret: appConfig.google.clientSecret
      },
      auth: googleConfiguration
    },
    startRedirectPath: '/api/auth/google',
    callbackUri: appConfig.google.callbackUrl
  });
});
