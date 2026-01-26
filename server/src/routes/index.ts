import { FastifyInstance } from 'fastify';

import { authRoutes } from './auth.js';
import { attendanceRoutes } from './attendance.js';
import { availabilityRoutes } from './availability.js';
import { charactersRoutes } from './characters.js';
import { guildRoutes } from './guilds.js';
import { raidsRoutes } from './raids.js';
import { lootRoutes } from './loot.js';
import { accountRoutes } from './account.js';
import { adminRoutes } from './admin.js';
import { lootListRoutes } from './lootLists.js';
import { guildMetricsRoutes } from './metrics.js';
import { npcNotesRoutes } from './npcNotes.js';
import { npcRespawnRoutes } from './npcRespawn.js';
import { questTrackerRoutes } from './questTracker.js';
import { questShareRoutes } from './questShare.js';
import { guildBankRoutes } from './guildBank.js';
import { guildDonationRoutes } from './guildDonations.js';
import { itemRoutes } from './items.js';
import { moneyTrackerRoutes } from './moneyTracker.js';
import { metallurgyRoutes } from './metallurgy.js';
import { webhookInboxRoutes } from './webhookInbox.js';

export function registerRoutes(server: FastifyInstance): void {
  server.register(authRoutes, { prefix: '/api/auth' });
  server.register(guildRoutes, { prefix: '/api/guilds' });
  server.register(lootListRoutes, { prefix: '/api/guilds' });
  server.register(guildMetricsRoutes, { prefix: '/api/guilds' });
  server.register(npcNotesRoutes, { prefix: '/api/guilds' });
  server.register(npcRespawnRoutes, { prefix: '/api/guilds' });
  server.register(questTrackerRoutes, { prefix: '/api/guilds' });
  server.register(questShareRoutes, { prefix: '/api/quests' });
  server.register(guildBankRoutes, { prefix: '/api/guilds' });
  server.register(guildDonationRoutes, { prefix: '/api/guilds' });
  server.register(charactersRoutes, { prefix: '/api/characters' });
  server.register(raidsRoutes, { prefix: '/api/raids' });
  server.register(lootRoutes, { prefix: '/api' });
  server.register(attendanceRoutes, { prefix: '/api/attendance' });
  server.register(availabilityRoutes, { prefix: '/api/availability' });
  server.register(accountRoutes, { prefix: '/api/account' });
  server.register(adminRoutes, { prefix: '/api/admin' });
  server.register(itemRoutes, { prefix: '/api' });
  server.register(moneyTrackerRoutes, { prefix: '/api/admin/money-tracker' });
  server.register(metallurgyRoutes, { prefix: '/api/admin/metallurgy' });
  server.register(webhookInboxRoutes, { prefix: '/api/webhook-inbox' });
}
