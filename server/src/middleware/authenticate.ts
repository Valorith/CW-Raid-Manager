import { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
