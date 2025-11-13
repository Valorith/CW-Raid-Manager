import { authRoutes } from './auth.js';
import { attendanceRoutes } from './attendance.js';
import { charactersRoutes } from './characters.js';
import { guildRoutes } from './guilds.js';
import { raidsRoutes } from './raids.js';
import { lootRoutes } from './loot.js';
import { accountRoutes } from './account.js';
import { adminRoutes } from './admin.js';
import { lootListRoutes } from './lootLists.js';
import { guildMetricsRoutes } from './metrics.js';
import { npcNotesRoutes } from './npcNotes.js';
import { questTrackerRoutes } from './questTracker.js';
export function registerRoutes(server) {
    server.register(authRoutes, { prefix: '/api/auth' });
    server.register(guildRoutes, { prefix: '/api/guilds' });
    server.register(lootListRoutes, { prefix: '/api/guilds' });
    server.register(guildMetricsRoutes, { prefix: '/api/guilds' });
    server.register(npcNotesRoutes, { prefix: '/api/guilds' });
    server.register(questTrackerRoutes, { prefix: '/api/guilds' });
    server.register(charactersRoutes, { prefix: '/api/characters' });
    server.register(raidsRoutes, { prefix: '/api/raids' });
    server.register(lootRoutes, { prefix: '/api' });
    server.register(attendanceRoutes, { prefix: '/api/attendance' });
    server.register(accountRoutes, { prefix: '/api/account' });
    server.register(adminRoutes, { prefix: '/api/admin' });
}
