import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { RaidLogMonitorSession } from '../services/api';

interface MonitorIndicatorSession {
  raidId: string;
  raidName: string;
  sessionId: string;
  fileName: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
}

export const useMonitorStore = defineStore('monitor', () => {
  const activeSession = ref<MonitorIndicatorSession | null>(null);
  const hasPendingActions = ref(false);

  const indicatorVisible = computed(() => activeSession.value !== null);

  function setSession(raidId: string, raidName: string, session: RaidLogMonitorSession) {
    activeSession.value = {
      raidId,
      raidName,
      sessionId: session.sessionId,
      fileName: session.fileName,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt ?? null
    };
  }

  function clearSession() {
    activeSession.value = null;
    hasPendingActions.value = false;
  }

  function setPendingActions(pending: boolean) {
    hasPendingActions.value = pending;
  }

  return {
    activeSession,
    hasPendingActions,
    indicatorVisible,
    setSession,
    clearSession,
    setPendingActions
  };
});
