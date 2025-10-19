import fastifyOAuth2, { OAuth2Namespace } from '@fastify/oauth2';
import fp from 'fastify-plugin';

import { appConfig } from '../config/appConfig.js';

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
  }
}

export const googleOAuthPlugin = fp(async (fastify) => {
  fastify.register(fastifyOAuth2, {
    name: 'googleOAuth2',
    scope: ['profile', 'email'],
    credentials: {
      client: {
        id: appConfig.google.clientId,
        secret: appConfig.google.clientSecret
      },
      auth: fastifyOAuth2.GOOGLE_CONFIGURATION
    },
    startRedirectPath: '/api/auth/google',
    callbackUri: appConfig.google.callbackUrl
  });
});
