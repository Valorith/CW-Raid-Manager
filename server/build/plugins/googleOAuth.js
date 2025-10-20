import fastifyOauth2 from '@fastify/oauth2';
import fp from 'fastify-plugin';
import { appConfig } from '../config/appConfig.js';
const oauthPlugin = fastifyOauth2;
const googleConfiguration = fastifyOauth2.GOOGLE_CONFIGURATION;
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
