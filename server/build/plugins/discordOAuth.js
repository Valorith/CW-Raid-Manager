import fastifyOauth2 from '@fastify/oauth2';
import fp from 'fastify-plugin';
import { appConfig } from '../config/appConfig.js';
const oauthPlugin = fastifyOauth2;
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
    };
    fastify.register(oauthPlugin, oauthOptions);
    fastify.log.info('Discord OAuth plugin registered successfully.');
});
