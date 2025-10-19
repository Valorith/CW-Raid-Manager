import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { appConfig } from './config/appConfig.js';
import { googleOAuthPlugin } from './plugins/googleOAuth.js';
import { registerRoutes } from './routes/index.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: appConfig.nodeEnv === 'development' ? 'debug' : 'info'
    }
  });

  const currentDir = dirname(fileURLToPath(new URL('.', import.meta.url)));
  const clientDistCandidates = [
    join(currentDir, '../../client/dist'),
    join(currentDir, '../../../client/dist')
  ];
  const clientIndexPath = clientDistCandidates
    .map((candidate) => join(candidate, 'index.html'))
    .find((candidate) => existsSync(candidate));
  const clientDistPath = clientIndexPath ? dirname(clientIndexPath) : null;
  const clientIndexHtml = clientIndexPath ? readFileSync(clientIndexPath, 'utf-8') : null;

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
  server.register(fastifySensible);
  server.register(googleOAuthPlugin);

  registerRoutes(server);

  server.get('/health', async () => ({ status: 'ok' }));

  if (clientIndexHtml && clientDistPath) {
    server.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      decorateReply: false
    });

    server.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api') &&
        request.headers.accept?.includes('text/html')
      ) {
        reply.type('text/html').send(clientIndexHtml);
        return;
      }

      reply.status(404).send({ error: 'Not Found' });
    });
  }

  return server;
}
