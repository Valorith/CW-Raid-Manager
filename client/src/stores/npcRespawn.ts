import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  api,
  type NpcRespawnTrackerEntry,
  type NpcDefinition,
  type NpcKillRecord,
  type NpcRespawnSubscription,
  type NpcRespawnTelegramNotificationResult,
  type NpcFavorite,
  type NpcDefinitionInput,
  type NpcKillRecordInput,
  type NpcKillRecordUpdateInput,
  type GuildRole,
  type NpcContentFlag
} from '../services/api';
import type { NpcNotification } from '../components/NpcNotificationModal.vue';

export type NpcNotificationMode = 'none' | 'browser' | 'telegram' | 'both';

const DEBUG_RESPAWN_TEST_NPC_NAME_NORMALIZED = 'testnpc';
const DEBUG_RESPAWN_TEST_ZONE = 'Notification Test';
const DEBUG_RESPAWN_TEST_MARKER = '[CW_NEXUS_DEBUG_RESPAWN_TEST]';

export const useNpcRespawnStore = defineStore('npcRespawn', () => {
  // State
  const npcs = ref<NpcRespawnTrackerEntry[]>([]);
  const definitions = ref<NpcDefinition[]>([]);
  const subscriptions = ref<NpcRespawnSubscription[]>([]);
  const favorites = ref<NpcFavorite[]>([]);
  const enabledContentFlags = ref<NpcContentFlag[]>([]);
  const loadedGuildId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<number | null>(null);
  const canManage = ref(false);
  const viewerRole = ref<GuildRole | null>(null);

  // Notification state
  // Track dismissed notifications to prevent re-triggering
  // Key format: `${npcId}:${isInstanceVariant}:${status}:${lastKillId}`
  const dismissedNotificationKeys = ref<Set<string>>(new Set());
  // Currently active notifications to display
  const activeNotifications = ref<NpcNotification[]>([]);
  // Telegram notifications are delivered by the server, so keep client requests idempotent per kill/status.
  const queuedTelegramNotificationKeys = ref<Set<string>>(new Set());
  // Refresh interval for live updates
  let refreshInterval: number | null = null;
  let serverRefreshInterval: number | null = null;
  let activeRefreshGuildId: string | null = null;

  // Computed
  const canRefreshNow = computed(() => {
    if (!lastFetchedAt.value) return true;
    return Date.now() - lastFetchedAt.value >= 30 * 1000; // 30 seconds
  });

  const sortedNpcs = computed(() => {
    return [...npcs.value].sort((a, b) => {
      const aIsDebugTest = isDebugRespawnTestNpc(a);
      const bIsDebugTest = isDebugRespawnTestNpc(b);
      if (aIsDebugTest !== bIsDebugTest) {
        return aIsDebugTest ? -1 : 1;
      }

      // Sort by respawn status: down > window > up > unknown
      // This prioritizes NPCs that are actively being tracked (down/window) over those already up
      const statusOrder: Record<string, number> = {
        down: 0,
        window: 1,
        up: 2,
        unknown: 3
      };
      const statusDiff = (statusOrder[a.respawnStatus] ?? 3) - (statusOrder[b.respawnStatus] ?? 3);
      if (statusDiff !== 0) return statusDiff;

      // Within same status, favorites come first
      const aFavorited = isFavorited(a.npcNameNormalized, a.isInstanceVariant);
      const bFavorited = isFavorited(b.npcNameNormalized, b.isInstanceVariant);
      if (aFavorited !== bFavorited) {
        return aFavorited ? -1 : 1;
      }

      // Then by progress percent (descending) - NPCs closer to respawning appear first
      if (a.progressPercent !== null && b.progressPercent !== null) {
        const progressDiff = b.progressPercent - a.progressPercent;
        if (progressDiff !== 0) return progressDiff;
      }

      // Then alphabetically
      return a.npcName.localeCompare(b.npcName);
    });
  });

  const npcsByZone = computed(() => {
    const grouped = new Map<string, NpcRespawnTrackerEntry[]>();
    for (const npc of npcs.value) {
      const zone = npc.zoneName ?? 'Unknown Zone';
      if (!grouped.has(zone)) {
        grouped.set(zone, []);
      }
      grouped.get(zone)!.push(npc);
    }
    return grouped;
  });

  const subscribedNpcIds = computed(() => {
    return new Set(
      subscriptions.value
        .filter((subscription) => getNotificationModeFromSubscription(subscription) !== 'none')
        .map((subscription) => subscription.npcDefinitionId)
    );
  });

  // Check if a specific variant is subscribed for notifications
  function isVariantSubscribed(npcId: string, isInstanceVariant: boolean): boolean {
    return getNotificationMode(npcId, isInstanceVariant) !== 'none';
  }

  function isDebugRespawnTestNpc(
    npc: Pick<NpcRespawnTrackerEntry, 'npcNameNormalized' | 'zoneName' | 'notes'>
  ): boolean {
    return (
      npc.npcNameNormalized === DEBUG_RESPAWN_TEST_NPC_NAME_NORMALIZED &&
      npc.zoneName === DEBUG_RESPAWN_TEST_ZONE &&
      (npc.notes?.includes(DEBUG_RESPAWN_TEST_MARKER) ?? false)
    );
  }

  function clearNotificationKeysForVariant(npcDefinitionId: string, isInstanceVariant: boolean) {
    const prefix = `${npcDefinitionId}:${isInstanceVariant}:`;
    for (const key of Array.from(dismissedNotificationKeys.value)) {
      if (key.startsWith(prefix)) {
        dismissedNotificationKeys.value.delete(key);
      }
    }
    for (const key of Array.from(queuedTelegramNotificationKeys.value)) {
      if (key.startsWith(prefix)) {
        queuedTelegramNotificationKeys.value.delete(key);
      }
    }
    removeActiveNotificationsForVariant(npcDefinitionId, isInstanceVariant);
  }

  function getSubscription(
    npcId: string,
    isInstanceVariant: boolean
  ): NpcRespawnSubscription | undefined {
    return subscriptions.value.find(
      (subscription) =>
        subscription.npcDefinitionId === npcId &&
        subscription.isInstanceVariant === isInstanceVariant
    );
  }

  function getNotificationModeFromSubscription(
    subscription: NpcRespawnSubscription | undefined
  ): NpcNotificationMode {
    if (!subscription?.isEnabled) {
      return 'none';
    }

    const browserEnabled = subscription.browserNotificationsEnabled !== false;
    const telegramEnabled = subscription.telegramNotificationsEnabled === true;

    if (browserEnabled && telegramEnabled) {
      return 'both';
    }
    if (telegramEnabled) {
      return 'telegram';
    }
    if (browserEnabled) {
      return 'browser';
    }
    return 'none';
  }

  function getNotificationMode(npcId: string, isInstanceVariant: boolean): NpcNotificationMode {
    return getNotificationModeFromSubscription(getSubscription(npcId, isInstanceVariant));
  }

  function isBrowserNotificationEnabled(npcId: string, isInstanceVariant: boolean): boolean {
    const mode = getNotificationMode(npcId, isInstanceVariant);
    return mode === 'browser' || mode === 'both';
  }

  function isTelegramNotificationEnabled(npcId: string, isInstanceVariant: boolean): boolean {
    const mode = getNotificationMode(npcId, isInstanceVariant);
    return mode === 'telegram' || mode === 'both';
  }

  function getNextNotificationMode(mode: NpcNotificationMode): NpcNotificationMode {
    if (mode === 'none') return 'browser';
    if (mode === 'browser') return 'telegram';
    if (mode === 'telegram') return 'both';
    return 'none';
  }

  function upsertLocalSubscription(subscription: NpcRespawnSubscription) {
    const index = subscriptions.value.findIndex(
      (entry) =>
        entry.npcDefinitionId === subscription.npcDefinitionId &&
        entry.isInstanceVariant === subscription.isInstanceVariant
    );
    if (index >= 0) {
      subscriptions.value[index] = subscription;
    } else {
      subscriptions.value.push(subscription);
    }
  }

  function removeActiveNotificationsForVariant(
    npcDefinitionId: string,
    isInstanceVariant: boolean
  ) {
    const prefix = `${npcDefinitionId}:${isInstanceVariant}:`;
    activeNotifications.value = activeNotifications.value.filter(
      (notification) => !notification.id.startsWith(prefix)
    );
  }

  // Helper to create a unique key for favorites lookup
  function getFavoriteKey(npcNameNormalized: string, isInstanceVariant: boolean): string {
    return `${npcNameNormalized}:${isInstanceVariant}`;
  }

  // Set of favorited NPC keys for fast lookup
  const favoritedNpcKeys = computed(() => {
    return new Set(
      favorites.value.map((f) => getFavoriteKey(f.npcNameNormalized, f.isInstanceVariant))
    );
  });

  // Check if a specific NPC variant is favorited
  function isFavorited(npcNameNormalized: string, isInstanceVariant: boolean): boolean {
    return favoritedNpcKeys.value.has(getFavoriteKey(npcNameNormalized, isInstanceVariant));
  }

  // Actions
  async function fetchRespawnTracker(guildId: string, force = false) {
    if (loading.value) return;
    if (
      !force &&
      !canRefreshNow.value &&
      npcs.value.length > 0 &&
      loadedGuildId.value === guildId
    ) {
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      // Fetch respawn tracker data and favorites in parallel
      const [result, favs] = await Promise.all([
        api.fetchNpcRespawnTracker(guildId),
        api.fetchNpcFavorites(guildId)
      ]);
      npcs.value = result.npcs;
      favorites.value = favs;
      canManage.value = result.canManage;
      viewerRole.value = result.viewerRole;
      loadedGuildId.value = guildId;
      lastFetchedAt.value = Date.now();
      // Check for notifications after loading fresh data
      checkForNotifications(guildId);
    } catch (err: any) {
      error.value =
        err?.response?.data?.message ?? err?.message ?? 'Failed to load NPC respawn tracker.';
      console.error('[NpcRespawnStore] Error loading respawn tracker:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchDefinitions(guildId: string) {
    try {
      const result = await api.fetchNpcDefinitions(guildId);
      definitions.value = result.definitions;
      enabledContentFlags.value = result.enabledContentFlags ?? [];
      canManage.value = result.canManage;
      viewerRole.value = result.viewerRole;
    } catch (err: any) {
      console.error('[NpcRespawnStore] Error loading definitions:', err);
      throw err;
    }
  }

  async function fetchSubscriptions(guildId: string) {
    try {
      subscriptions.value = await api.fetchNpcSubscriptions(guildId);
      checkForNotifications(guildId);
    } catch (err: any) {
      console.error('[NpcRespawnStore] Error loading subscriptions:', err);
    }
  }

  async function createDefinition(
    guildId: string,
    input: NpcDefinitionInput
  ): Promise<NpcDefinition> {
    const definition = await api.createNpcDefinition(guildId, input);
    definitions.value.push(definition);
    // Refresh tracker to get updated data
    await fetchRespawnTracker(guildId, true);
    return definition;
  }

  async function updateDefinition(
    guildId: string,
    npcDefinitionId: string,
    input: NpcDefinitionInput
  ): Promise<NpcDefinition> {
    const definition = await api.updateNpcDefinition(guildId, npcDefinitionId, input);
    const index = definitions.value.findIndex((d) => d.id === npcDefinitionId);
    if (index >= 0) {
      definitions.value[index] = definition;
    }
    // Refresh tracker to get updated data
    await fetchRespawnTracker(guildId, true);
    return definition;
  }

  async function deleteDefinition(guildId: string, npcDefinitionId: string): Promise<void> {
    await api.deleteNpcDefinition(guildId, npcDefinitionId);
    definitions.value = definitions.value.filter((d) => d.id !== npcDefinitionId);
    npcs.value = npcs.value.filter((n) => n.id !== npcDefinitionId);
  }

  async function recordKill(guildId: string, input: NpcKillRecordInput): Promise<NpcKillRecord> {
    const record = await api.createNpcKillRecord(guildId, input);
    // Refresh tracker to get updated respawn times
    await fetchRespawnTracker(guildId, true);
    return record;
  }

  async function deleteKillRecord(guildId: string, killRecordId: string): Promise<void> {
    await api.deleteNpcKillRecord(guildId, killRecordId);
    // Refresh tracker to get updated data
    await fetchRespawnTracker(guildId, true);
  }

  async function updateKillRecord(
    guildId: string,
    killRecordId: string,
    input: NpcKillRecordUpdateInput
  ): Promise<NpcKillRecord> {
    const record = await api.updateNpcKillRecord(guildId, killRecordId, input);
    await fetchRespawnTracker(guildId, true);
    return record;
  }

  async function toggleSubscription(
    guildId: string,
    npcDefinitionId: string,
    isInstanceVariant: boolean
  ): Promise<void> {
    const currentMode = getNotificationMode(npcDefinitionId, isInstanceVariant);
    const nextMode = getNextNotificationMode(currentMode);
    const nextHasBrowser = nextMode === 'browser' || nextMode === 'both';
    const nextHasTelegram = nextMode === 'telegram' || nextMode === 'both';

    if (nextMode === 'none') {
      await api.deleteNpcSubscription(guildId, npcDefinitionId, isInstanceVariant);
      subscriptions.value = subscriptions.value.filter(
        (s) => !(s.npcDefinitionId === npcDefinitionId && s.isInstanceVariant === isInstanceVariant)
      );
      removeActiveNotificationsForVariant(npcDefinitionId, isInstanceVariant);
    } else {
      const existing = getSubscription(npcDefinitionId, isInstanceVariant);
      const subscription = await api.upsertNpcSubscription(guildId, {
        npcDefinitionId,
        isEnabled: true,
        notifyMinutes: existing?.notifyMinutes ?? 5,
        browserNotificationsEnabled: nextHasBrowser,
        telegramNotificationsEnabled: nextHasTelegram,
        isInstanceVariant
      });
      upsertLocalSubscription(subscription);

      if (!nextHasBrowser) {
        removeActiveNotificationsForVariant(npcDefinitionId, isInstanceVariant);
      }

      // If the NPC variant is already in up/window status, skip the current state
      // so enabling alerts does not immediately alarm for an NPC that's already up.
      const npc = npcs.value.find(
        (n) => n.id === npcDefinitionId && n.isInstanceVariant === isInstanceVariant
      );
      if (npc && (npc.respawnStatus === 'up' || npc.respawnStatus === 'window')) {
        const notificationKey = getNotificationKey(npc, npc.respawnStatus);
        if (nextHasBrowser) {
          dismissedNotificationKeys.value.add(notificationKey);
        }
        if (nextHasTelegram) {
          queuedTelegramNotificationKeys.value.add(notificationKey);
        }
      }
    }
  }

  async function addDebugRespawnTestNpc(guildId: string): Promise<void> {
    const npc = await api.createNpcRespawnDebugTestNpc(guildId);
    clearNotificationKeysForVariant(npc.id, false);
    npcs.value = [npc, ...npcs.value.filter((entry) => entry.id !== npc.id)];
    await fetchSubscriptions(guildId);
    checkForNotifications(guildId);
  }

  async function removeDebugRespawnTestNpc(
    guildId: string,
    npcDefinitionId: string
  ): Promise<void> {
    await api.deleteNpcRespawnDebugTestNpc(guildId, npcDefinitionId);
    clearNotificationKeysForVariant(npcDefinitionId, false);
    npcs.value = npcs.value.filter((entry) => entry.id !== npcDefinitionId);
    subscriptions.value = subscriptions.value.filter(
      (entry) => entry.npcDefinitionId !== npcDefinitionId
    );
  }

  async function toggleFavorite(
    guildId: string,
    npcNameNormalized: string,
    isInstanceVariant: boolean
  ): Promise<void> {
    const currentlyFavorited = isFavorited(npcNameNormalized, isInstanceVariant);
    if (currentlyFavorited) {
      await api.removeNpcFavorite(guildId, npcNameNormalized, isInstanceVariant);
      favorites.value = favorites.value.filter(
        (f) =>
          !(f.npcNameNormalized === npcNameNormalized && f.isInstanceVariant === isInstanceVariant)
      );
    } else {
      const favorite = await api.addNpcFavorite(guildId, npcNameNormalized, isInstanceVariant);
      favorites.value.push(favorite);
    }
  }

  function startAutoRefresh(guildId: string) {
    stopAutoRefresh();
    activeRefreshGuildId = guildId;
    refreshInterval = window.setInterval(() => {
      // Recalculate respawn progress without hitting the server
      updateProgressLocally();
    }, 1000);

    // Periodically refresh from server
    serverRefreshInterval = window.setInterval(() => {
      if (!document.hidden) {
        fetchRespawnTracker(guildId, true).catch(console.error);
      }
    }, 60000); // Every minute

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (serverRefreshInterval) {
      clearInterval(serverRefreshInterval);
      serverRefreshInterval = null;
    }
    activeRefreshGuildId = null;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  function handleVisibilityChange() {
    if (!document.hidden && activeRefreshGuildId) {
      fetchRespawnTracker(activeRefreshGuildId, true).catch(console.error);
    }
  }

  /**
   * Generate a unique key for a notification to track dismissals.
   * The key includes the kill ID so a new kill will generate a new notification.
   */
  function getNotificationKey(npc: NpcRespawnTrackerEntry, status: 'window' | 'up'): string {
    const killId = npc.lastKill?.id ?? 'no-kill';
    return `${npc.id}:${npc.isInstanceVariant}:${status}:${killId}`;
  }

  function queueTelegramNotificationIfNeeded(guildId: string, npc: NpcRespawnTrackerEntry) {
    if (!isTelegramNotificationEnabled(npc.id, npc.isInstanceVariant)) return;
    if (npc.respawnStatus !== 'window' && npc.respawnStatus !== 'up') return;

    const notificationKey = getNotificationKey(npc, npc.respawnStatus);
    if (queuedTelegramNotificationKeys.value.has(notificationKey)) return;

    queuedTelegramNotificationKeys.value.add(notificationKey);
    api
      .queueNpcRespawnTelegramNotification(guildId, {
        npcDefinitionId: npc.id,
        isInstanceVariant: npc.isInstanceVariant
      })
      .then((result) => handleTelegramNotificationResult(result))
      .catch((err) => {
        queuedTelegramNotificationKeys.value.delete(notificationKey);
        console.error('[NpcRespawnStore] Failed to queue Telegram respawn notification:', err);
      });
  }

  function handleTelegramNotificationResult(result: NpcRespawnTelegramNotificationResult) {
    if (result.lastError) {
      showNotificationToast({
        title: 'Telegram notification failed',
        message: result.lastError,
        variant: 'error'
      });
      return;
    }

    if (result.deliveryStatus === 'FAILED') {
      showNotificationToast({
        title: 'Telegram notification failed',
        message: result.lastError ?? 'Telegram delivery failed.',
        variant: 'error'
      });
      return;
    }

    if (result.queued === 0 && result.deliveryStatus === null) {
      showNotificationToast({
        title: 'Telegram notification not queued',
        message: 'Check that Telegram is connected and this notification type is enabled.',
        variant: 'warning'
      });
    }
  }

  function showNotificationToast(payload: {
    title: string;
    message: string;
    variant: 'warning' | 'error';
  }) {
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: payload
      })
    );
  }

  /**
   * Check subscribed NPCs for status changes and trigger notifications.
   */
  function checkForNotifications(guildId?: string | null) {
    const newNotifications: NpcNotification[] = [];

    for (const npc of npcs.value) {
      // Only notify for 'window' or 'up' status
      if (npc.respawnStatus !== 'window' && npc.respawnStatus !== 'up') continue;

      if (guildId) {
        queueTelegramNotificationIfNeeded(guildId, npc);
      }

      // Only show browser notifications for variants with browser alerts enabled.
      if (!isBrowserNotificationEnabled(npc.id, npc.isInstanceVariant)) continue;

      const notificationKey = getNotificationKey(npc, npc.respawnStatus);

      // Skip if already dismissed
      if (dismissedNotificationKeys.value.has(notificationKey)) continue;

      // Skip if already in active notifications
      const alreadyActive = activeNotifications.value.some((n) => n.id === notificationKey);
      if (alreadyActive) continue;

      // Create a new notification
      newNotifications.push({
        id: notificationKey,
        npcName: npc.npcName,
        zoneName: npc.zoneName,
        status: npc.respawnStatus,
        respawnMaxTime: npc.respawnMaxTime,
        hasInstanceVersion: npc.hasInstanceVersion,
        isInstanceVariant: npc.isInstanceVariant
      });
    }

    // Add new notifications to active list
    if (newNotifications.length > 0) {
      activeNotifications.value = [...activeNotifications.value, ...newNotifications];
    }
  }

  /**
   * Dismiss notifications by their IDs.
   * Dismissed notifications won't re-trigger until a new kill is recorded.
   */
  function dismissNotifications(notificationIds: string[]) {
    // Add to dismissed set
    for (const id of notificationIds) {
      dismissedNotificationKeys.value.add(id);
    }

    // Remove from active notifications
    activeNotifications.value = activeNotifications.value.filter(
      (n) => !notificationIds.includes(n.id)
    );
  }

  /**
   * Clear all dismissed notification keys.
   * Called when leaving the page or switching guilds.
   */
  function clearDismissedNotifications() {
    dismissedNotificationKeys.value.clear();
    activeNotifications.value = [];
  }

  function updateProgressLocally() {
    const now = Date.now();
    for (const npc of npcs.value) {
      if (!npc.lastKill || npc.respawnMinMinutes === null) continue;

      const killedTime = new Date(npc.lastKill.killedAt).getTime();
      const respawnMinTimeMs = killedTime + npc.respawnMinMinutes * 60 * 1000;
      const respawnMaxTimeMs =
        npc.respawnMaxMinutes !== null
          ? killedTime + npc.respawnMaxMinutes * 60 * 1000
          : respawnMinTimeMs;

      const totalWindowMs = (npc.respawnMaxMinutes ?? npc.respawnMinMinutes) * 60 * 1000;
      const elapsedMs = now - killedTime;
      npc.progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalWindowMs) * 100));

      // Update status based on current time
      if (now >= respawnMaxTimeMs) {
        npc.respawnStatus = 'up';
      } else if (now >= respawnMinTimeMs) {
        npc.respawnStatus = 'window';
      } else {
        npc.respawnStatus = 'down';
      }

      // Only update respawn times if they haven't been set yet
      // (they don't change once the kill time is recorded)
      if (!npc.respawnMinTime) {
        npc.respawnMinTime = new Date(respawnMinTimeMs).toISOString();
      }
      if (!npc.respawnMaxTime) {
        npc.respawnMaxTime = new Date(respawnMaxTimeMs).toISOString();
      }
    }

    // Check for new notifications after updating progress
    checkForNotifications(activeRefreshGuildId);
  }

  function clearStore() {
    stopAutoRefresh();
    npcs.value = [];
    definitions.value = [];
    subscriptions.value = [];
    favorites.value = [];
    enabledContentFlags.value = [];
    loadedGuildId.value = null;
    loading.value = false;
    error.value = null;
    lastFetchedAt.value = null;
    canManage.value = false;
    viewerRole.value = null;
    clearDismissedNotifications();
    queuedTelegramNotificationKeys.value.clear();
  }

  return {
    // State
    npcs,
    definitions,
    subscriptions,
    favorites,
    enabledContentFlags,
    loadedGuildId,
    loading,
    error,
    lastFetchedAt,
    canManage,
    viewerRole,
    activeNotifications,

    // Computed
    canRefreshNow,
    sortedNpcs,
    npcsByZone,
    subscribedNpcIds,
    favoritedNpcKeys,

    // Actions
    fetchRespawnTracker,
    fetchDefinitions,
    fetchSubscriptions,
    createDefinition,
    updateDefinition,
    deleteDefinition,
    recordKill,
    updateKillRecord,
    deleteKillRecord,
    toggleSubscription,
    addDebugRespawnTestNpc,
    removeDebugRespawnTestNpc,
    toggleFavorite,
    isFavorited,
    isVariantSubscribed,
    isDebugRespawnTestNpc,
    getNotificationMode,
    startAutoRefresh,
    stopAutoRefresh,
    clearStore,
    dismissNotifications,
    checkForNotifications
  };
});
