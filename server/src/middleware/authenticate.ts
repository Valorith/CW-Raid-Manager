import { FastifyReply, FastifyRequest } from 'fastify';

import { cliTokenCanAccessPath } from './cliScope.js';
import { authenticateCliBearerToken } from '../services/cliAuthService.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;
  const bearerMatch =
    typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization.trim()) : null;
  if (bearerMatch) {
    const cliUser = await authenticateCliBearerToken(bearerMatch[1]);
    if (cliUser) {
      if (!cliTokenCanAccessPath(request.url, cliUser.cliScopes)) {
        reply.forbidden('CLI session is not authorized for this API.');
        return;
      }

      request.user = cliUser;
      return;
    }

    reply.unauthorized('Invalid CLI session token.');
    return;
  }

  try {
    if (request.cookies?.cwraid_token) {
      await request.jwtVerify();
      return;
    }
  } catch (error) {
    request.log.warn({ error }, 'Failed to verify JWT');
  }

  reply.unauthorized('Authentication required.');
}
