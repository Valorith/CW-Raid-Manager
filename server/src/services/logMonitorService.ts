import { randomUUID } from 'crypto';

interface LootMonitorSession {
  sessionId: string;
  raidId: string;
  guildId: string;
  userId: string;
  userDisplayName: string;
  fileName: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
}

// Loot council state types matching the frontend LootCouncilItemState structure
export interface LootCouncilStateInterest {
  playerKey: string;
  playerName: string;
  replacing?: string | null;
  replacingItemId?: number | null;
  replacingItemIconId?: number | null;
  mode: 'REPLACING' | 'NOT_REPLACING';
  votes?: number | null;
  lastUpdatedAt: string;
  source: 'LIVE' | 'SYNC';
  voters: string[];
  classHint?: string | null;
}

export interface LootCouncilStateItem {
  key: string;
  nameKey: string;
  instanceId: number;
  itemName: string;
  itemId?: number | null;
  itemIconId?: number | null;
  ordinal?: number | null;
  startedAt: string;
  lastUpdatedAt: string;
  status: 'ACTIVE' | 'AWARDED' | 'REMOVED';
  awardedTo?: string | null;
  interests: LootCouncilStateInterest[];
}

export interface LootCouncilState {
  items: LootCouncilStateItem[];
  lastUpdatedAt: string | null;
}

const sessions = new Map<string, LootMonitorSession>();
const lootCouncilStates = new Map<string, LootCouncilState>();

export const LOOT_MONITOR_HEARTBEAT_INTERVAL_MS = 10_000;
export const LOOT_MONITOR_SESSION_TTL_MS = 30_000;

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [raidId, session] of sessions) {
    if (now - session.lastHeartbeatAt.getTime() > LOOT_MONITOR_SESSION_TTL_MS) {
      sessions.delete(raidId);
    }
  }
}

export function getActiveLootMonitorSession(raidId: string) {
  purgeExpiredSessions();
  return sessions.get(raidId) ?? null;
}

export function startLootMonitorSession(input: {
  raidId: string;
  guildId: string;
  userId: string;
  userDisplayName: string;
  fileName: string;
}) {
  purgeExpiredSessions();

  if (sessions.has(input.raidId)) {
    throw new Error('LOOT_MONITOR_ACTIVE');
  }

  const now = new Date();
  const session: LootMonitorSession = {
    sessionId: randomUUID(),
    raidId: input.raidId,
    guildId: input.guildId,
    userId: input.userId,
    userDisplayName: input.userDisplayName,
    fileName: input.fileName,
    startedAt: now,
    lastHeartbeatAt: now
  };

  sessions.set(input.raidId, session);
  return session;
}

export function heartbeatLootMonitorSession(raidId: string, sessionId: string, userId: string) {
  purgeExpiredSessions();
  const session = sessions.get(raidId);

  if (!session || session.sessionId !== sessionId) {
    throw new Error('LOOT_MONITOR_NOT_FOUND');
  }

  if (session.userId !== userId) {
    throw new Error('LOOT_MONITOR_FORBIDDEN');
  }

  session.lastHeartbeatAt = new Date();
  return session;
}

export function stopLootMonitorSession(raidId: string) {
  const session = sessions.get(raidId);
  if (!session) {
    return null;
  }
  sessions.delete(raidId);
  // Also clear the loot council state when the monitor session stops
  lootCouncilStates.delete(raidId);
  return session;
}

// Loot council state management

export function getLootCouncilState(raidId: string): LootCouncilState {
  // Only return state if there's an active monitor session
  const session = getActiveLootMonitorSession(raidId);
  if (!session) {
    return { items: [], lastUpdatedAt: null };
  }

  return lootCouncilStates.get(raidId) ?? { items: [], lastUpdatedAt: null };
}

export function updateLootCouncilState(raidId: string, items: LootCouncilStateItem[]): void {
  lootCouncilStates.set(raidId, {
    items,
    lastUpdatedAt: new Date().toISOString()
  });
}
