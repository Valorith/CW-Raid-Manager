import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  api,
  type NpcRespawnTrackerEntry,
  type NpcDefinition,
  type NpcKillRecord,
  type NpcRespawnSubscription,
  type NpcFavorite,
  type NpcDefinitionInput,
  type NpcKillRecordInput,
  type GuildRole,
  type NpcContentFlag
} from '../services/api';

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

  // Refresh interval for live updates
  let refreshInterval: number | null = null;

  // Computed
  const canRefreshNow = computed(() => {
    if (!lastFetchedAt.value) return true;
    return Date.now() - lastFetchedAt.value >= 30 * 1000; // 30 seconds
  });

  const sortedNpcs = computed(() => {
    return [...npcs.value].sort((a, b) => {
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

      // For down/window status: sort by progress percent (descending)
      // NPCs closer to respawning appear first
      if (a.respawnStatus === 'down' || a.respawnStatus === 'window') {
        if (a.progressPercent !== null && b.progressPercent !== null) {
          const progressDiff = b.progressPercent - a.progressPercent;
          if (progressDiff !== 0) return progressDiff;
        }
      }

      // For 'up' status (and as fallback): sort by respawn time (soonest first), then alphabetically
      // This helps users see which NPCs respawned most recently at the top
      if (a.respawnStatus === 'up' && b.respawnStatus === 'up') {
        // If both have respawn times, sort by most recent respawn (soonest first means most recently respawned)
        if (a.respawnMaxTime && b.respawnMaxTime) {
          const aTime = new Date(a.respawnMaxTime).getTime();
          const bTime = new Date(b.respawnMaxTime).getTime();
          const timeDiff = bTime - aTime; // More recent first
          if (timeDiff !== 0) return timeDiff;
        }
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
    return new Set(subscriptions.value.filter(s => s.isEnabled).map(s => s.npcDefinitionId));
  });

  // Helper to create a unique key for favorites lookup
  function getFavoriteKey(npcNameNormalized: string, isInstanceVariant: boolean): string {
    return `${npcNameNormalized}:${isInstanceVariant}`;
  }

  // Set of favorited NPC keys for fast lookup
  const favoritedNpcKeys = computed(() => {
    return new Set(favorites.value.map(f => getFavoriteKey(f.npcNameNormalized, f.isInstanceVariant)));
  });

  // Check if a specific NPC variant is favorited
  function isFavorited(npcNameNormalized: string, isInstanceVariant: boolean): boolean {
    return favoritedNpcKeys.value.has(getFavoriteKey(npcNameNormalized, isInstanceVariant));
  }

  // Actions
  async function fetchRespawnTracker(guildId: string, force = false) {
    if (loading.value) return;
    if (!force && !canRefreshNow.value && npcs.value.length > 0 && loadedGuildId.value === guildId) {
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
    } catch (err: any) {
      error.value = err?.response?.data?.message ?? err?.message ?? 'Failed to load NPC respawn tracker.';
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
    } catch (err: any) {
      console.error('[NpcRespawnStore] Error loading subscriptions:', err);
    }
  }

  async function createDefinition(guildId: string, input: NpcDefinitionInput): Promise<NpcDefinition> {
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
    const index = definitions.value.findIndex(d => d.id === npcDefinitionId);
    if (index >= 0) {
      definitions.value[index] = definition;
    }
    // Refresh tracker to get updated data
    await fetchRespawnTracker(guildId, true);
    return definition;
  }

  async function deleteDefinition(guildId: string, npcDefinitionId: string): Promise<void> {
    await api.deleteNpcDefinition(guildId, npcDefinitionId);
    definitions.value = definitions.value.filter(d => d.id !== npcDefinitionId);
    npcs.value = npcs.value.filter(n => n.id !== npcDefinitionId);
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

  async function toggleSubscription(guildId: string, npcDefinitionId: string): Promise<void> {
    const existing = subscriptions.value.find(s => s.npcDefinitionId === npcDefinitionId);
    if (existing?.isEnabled) {
      await api.deleteNpcSubscription(guildId, npcDefinitionId);
      subscriptions.value = subscriptions.value.filter(s => s.npcDefinitionId !== npcDefinitionId);
    } else {
      const subscription = await api.upsertNpcSubscription(guildId, {
        npcDefinitionId,
        isEnabled: true,
        notifyMinutes: 5
      });
      if (existing) {
        const index = subscriptions.value.findIndex(s => s.npcDefinitionId === npcDefinitionId);
        if (index >= 0) {
          subscriptions.value[index] = subscription;
        }
      } else {
        subscriptions.value.push(subscription);
      }
    }
  }

  async function toggleFavorite(guildId: string, npcNameNormalized: string, isInstanceVariant: boolean): Promise<void> {
    const currentlyFavorited = isFavorited(npcNameNormalized, isInstanceVariant);
    if (currentlyFavorited) {
      await api.removeNpcFavorite(guildId, npcNameNormalized, isInstanceVariant);
      favorites.value = favorites.value.filter(
        f => !(f.npcNameNormalized === npcNameNormalized && f.isInstanceVariant === isInstanceVariant)
      );
    } else {
      const favorite = await api.addNpcFavorite(guildId, npcNameNormalized, isInstanceVariant);
      favorites.value.push(favorite);
    }
  }

  function startAutoRefresh(guildId: string) {
    stopAutoRefresh();
    refreshInterval = window.setInterval(() => {
      // Recalculate respawn progress without hitting the server
      updateProgressLocally();
    }, 1000);

    // Periodically refresh from server
    const serverRefreshInterval = window.setInterval(() => {
      fetchRespawnTracker(guildId, true).catch(console.error);
    }, 60000); // Every minute

    // Store the server refresh interval separately
    (window as any).__npcRespawnServerInterval = serverRefreshInterval;
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    const serverInterval = (window as any).__npcRespawnServerInterval;
    if (serverInterval) {
      clearInterval(serverInterval);
      (window as any).__npcRespawnServerInterval = null;
    }
  }

  function updateProgressLocally() {
    const now = Date.now();
    for (const npc of npcs.value) {
      if (!npc.lastKill || npc.respawnMinMinutes === null) continue;

      const killedTime = new Date(npc.lastKill.killedAt).getTime();
      const respawnMinTimeMs = killedTime + npc.respawnMinMinutes * 60 * 1000;
      const respawnMaxTimeMs = npc.respawnMaxMinutes !== null
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
    deleteKillRecord,
    toggleSubscription,
    toggleFavorite,
    isFavorited,
    startAutoRefresh,
    stopAutoRefresh,
    clearStore
  };
});
