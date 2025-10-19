import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';

import { appConfig } from './config/appConfig.js';
import { googleOAuthPlugin } from './plugins/googleOAuth.js';
import { registerRoutes } from './routes/index.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: appConfig.nodeEnv === 'development' ? 'debug' : 'info'
    }
  });

  server.register(fastifySensible);
  server.register(fastifyCookie, {
    secret: appConfig.sessionSecret,
    parseOptions: {
      sameSite: 'lax',
      httpOnly: true,
      secure: appConfig.nodeEnv === 'production'
    }
  });
  server.register(fastifyJwt, {
    secret: appConfig.sessionSecret,
    sign: {
      expiresIn: '7d'
    },
    cookie: {
      cookieName: 'cwraid_token',
      signed: true
    }
  });
  server.register(fastifyMultipart, {
    limits: {
      fileSize: 1024 * 1024 * 2 // 2 MB per upload cap to prevent abuse
    }
  });
  server.register(googleOAuthPlugin);

  registerRoutes(server);

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
