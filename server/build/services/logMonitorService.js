import { randomUUID } from 'crypto';
const sessions = new Map();
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
export function getActiveLootMonitorSession(raidId) {
    purgeExpiredSessions();
    return sessions.get(raidId) ?? null;
}
export function startLootMonitorSession(input) {
    purgeExpiredSessions();
    if (sessions.has(input.raidId)) {
        throw new Error('LOOT_MONITOR_ACTIVE');
    }
    const now = new Date();
    const session = {
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
export function heartbeatLootMonitorSession(raidId, sessionId, userId) {
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
export function stopLootMonitorSession(raidId) {
    const session = sessions.get(raidId);
    if (!session) {
        return null;
    }
    sessions.delete(raidId);
    return session;
}
