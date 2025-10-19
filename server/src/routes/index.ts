import { FastifyInstance } from 'fastify';

import { authRoutes } from './auth.js';
import { attendanceRoutes } from './attendance.js';
import { charactersRoutes } from './characters.js';
import { guildRoutes } from './guilds.js';
import { raidsRoutes } from './raids.js';

export function registerRoutes(server: FastifyInstance): void {
  server.register(authRoutes, { prefix: '/api/auth' });
  server.register(guildRoutes, { prefix: '/api/guilds' });
  server.register(charactersRoutes, { prefix: '/api/characters' });
  server.register(raidsRoutes, { prefix: '/api/raids' });
  server.register(attendanceRoutes, { prefix: '/api/attendance' });
}
