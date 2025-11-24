import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { RaidLogMonitorSession } from '../services/api';

interface MonitorIndicatorSession {
  raidId: string;
  raidName: string;
  sessionId: string | null;
  fileName: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
  isOwner: boolean;
}

export const useMonitorStore = defineStore('monitor', () => {
  const activeSession = ref<MonitorIndicatorSession | null>(null);
  const hasPendingActions = ref(false);
  const lastZone = ref<string | null>(null);

  const indicatorVisible = computed(() => activeSession.value !== null);

  function setSession(raidId: string, raidName: string, session: RaidLogMonitorSession) {
    activeSession.value = {
      raidId,
      raidName,
      sessionId: session.sessionId ?? null,
      fileName: session.fileName,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt ?? null,
      isOwner: Boolean(session.isOwner)
    };
  }

  function clearSession() {
    activeSession.value = null;
    hasPendingActions.value = false;
    lastZone.value = null;
  }

  function setPendingActions(pending: boolean) {
    hasPendingActions.value = pending;
  }

  function setLastZone(zone: string) {
    lastZone.value = zone;
  }

  return {
    activeSession,
    hasPendingActions,
    lastZone,
    indicatorVisible,
    setSession,
    clearSession,
    setPendingActions,
    setLastZone
  };
});
