import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api, type ItemStats } from '../services/api';

export interface TooltipItem {
  itemId: number;
  itemName: string;
  itemIconId?: number | null;
}

export interface TooltipPosition {
  x: number;
  y: number;
}

interface CachedItemStats {
  stats: ItemStats;
  spellNames: Record<number, string>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const useItemTooltipStore = defineStore('itemTooltip', () => {
  // State
  const visible = ref(false);
  const position = ref<TooltipPosition>({ x: 0, y: 0 });
  const currentItem = ref<TooltipItem | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const itemStats = ref<ItemStats | null>(null);
  const spellNames = ref<Record<number, string>>({});

  // Cache
  const statsCache = new Map<number, CachedItemStats>();

  // Computed
  const isVisible = computed(() => visible.value && currentItem.value !== null);

  function isCacheValid(itemId: number): boolean {
    const cached = statsCache.get(itemId);
    if (!cached) return false;
    return Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  }

  /**
   * Show the tooltip for an item at the specified position.
   */
  async function showTooltip(item: TooltipItem, pos: TooltipPosition) {
    // Don't show tooltip for items without an ID
    if (!item.itemId || item.itemId <= 0) {
      return;
    }

    currentItem.value = item;
    position.value = pos;
    visible.value = true;
    error.value = null;

    // Check cache first
    if (isCacheValid(item.itemId)) {
      const cached = statsCache.get(item.itemId)!;
      itemStats.value = cached.stats;
      spellNames.value = cached.spellNames;
      loading.value = false;
      return;
    }

    // Fetch item stats
    loading.value = true;
    try {
      const response = await api.fetchItemStats(item.itemId);
      itemStats.value = response.item;
      spellNames.value = response.spellNames;

      // Cache the result
      statsCache.set(item.itemId, {
        stats: response.item,
        spellNames: response.spellNames,
        fetchedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to fetch item stats:', err);
      error.value = 'Failed to load item stats';
      itemStats.value = null;
      spellNames.value = {};
    } finally {
      loading.value = false;
    }
  }

  /**
   * Update the tooltip position (for mouse tracking).
   */
  function updatePosition(pos: TooltipPosition) {
    position.value = pos;
  }

  /**
   * Hide the tooltip.
   */
  function hideTooltip() {
    visible.value = false;
    currentItem.value = null;
    itemStats.value = null;
    spellNames.value = {};
    error.value = null;
  }

  /**
   * Clear the stats cache.
   */
  function clearCache() {
    statsCache.clear();
  }

  /**
   * Prefetch item stats for multiple items (e.g., when opening inventory).
   */
  async function prefetchStats(itemIds: number[]) {
    const uncachedIds = itemIds.filter(id => id > 0 && !isCacheValid(id));
    if (uncachedIds.length === 0) return;

    try {
      const response = await api.fetchItemStatsBatch(uncachedIds);
      const now = Date.now();

      for (const [idStr, stats] of Object.entries(response.items)) {
        const id = Number(idStr);
        statsCache.set(id, {
          stats,
          spellNames: response.spellNames,
          fetchedAt: now
        });
      }
    } catch (err) {
      console.error('Failed to prefetch item stats:', err);
    }
  }

  return {
    // State
    visible,
    position,
    currentItem,
    loading,
    error,
    itemStats,
    spellNames,

    // Computed
    isVisible,

    // Actions
    showTooltip,
    updatePosition,
    hideTooltip,
    clearCache,
    prefetchStats
  };
});
