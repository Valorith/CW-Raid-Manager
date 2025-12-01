import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api, type ItemStats } from '../services/api';

export interface TooltipItem {
  itemId: number;
  itemName: string;
  itemIconId?: number | null;
  // Augment item IDs socketed in this item
  augSlot1?: number | null;
  augSlot2?: number | null;
  augSlot3?: number | null;
  augSlot4?: number | null;
  augSlot5?: number | null;
  augSlot6?: number | null;
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

export interface AugmentInfo {
  slotIndex: number;
  itemId: number;
  stats: ItemStats;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const HIDE_DELAY_MS = 50; // Delay before hiding to prevent flicker from transform animations

export const useItemTooltipStore = defineStore('itemTooltip', () => {
  // State
  const visible = ref(false);

  // Timer for debounced hide (prevents flicker when hover transforms shift elements)
  let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const position = ref<TooltipPosition>({ x: 0, y: 0 });
  const currentItem = ref<TooltipItem | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const itemStats = ref<ItemStats | null>(null);
  const spellNames = ref<Record<number, string>>({});
  const augmentStats = ref<AugmentInfo[]>([]);

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

    // Cancel any pending hide to prevent flicker
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId);
      hideTimeoutId = null;
    }

    currentItem.value = item;
    position.value = pos;
    visible.value = true;
    error.value = null;
    augmentStats.value = [];

    // Collect augment IDs
    const augmentIds: { slotIndex: number; itemId: number }[] = [];
    if (item.augSlot1 && item.augSlot1 > 0) augmentIds.push({ slotIndex: 1, itemId: item.augSlot1 });
    if (item.augSlot2 && item.augSlot2 > 0) augmentIds.push({ slotIndex: 2, itemId: item.augSlot2 });
    if (item.augSlot3 && item.augSlot3 > 0) augmentIds.push({ slotIndex: 3, itemId: item.augSlot3 });
    if (item.augSlot4 && item.augSlot4 > 0) augmentIds.push({ slotIndex: 4, itemId: item.augSlot4 });
    if (item.augSlot5 && item.augSlot5 > 0) augmentIds.push({ slotIndex: 5, itemId: item.augSlot5 });
    if (item.augSlot6 && item.augSlot6 > 0) augmentIds.push({ slotIndex: 6, itemId: item.augSlot6 });

    // Check cache first
    if (isCacheValid(item.itemId)) {
      const cached = statsCache.get(item.itemId)!;
      itemStats.value = cached.stats;
      spellNames.value = cached.spellNames;
      loading.value = false;

      // Load augment stats from cache or fetch
      await loadAugmentStats(augmentIds);
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

      // Load augment stats
      await loadAugmentStats(augmentIds);
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
   * Load augment stats from cache or fetch from server.
   */
  async function loadAugmentStats(augments: { slotIndex: number; itemId: number }[]) {
    if (augments.length === 0) return;

    const augInfos: AugmentInfo[] = [];
    const uncachedAugments: { slotIndex: number; itemId: number }[] = [];

    // Check cache for each augment
    for (const aug of augments) {
      if (isCacheValid(aug.itemId)) {
        const cached = statsCache.get(aug.itemId)!;
        augInfos.push({
          slotIndex: aug.slotIndex,
          itemId: aug.itemId,
          stats: cached.stats
        });
        // Merge spell names
        Object.assign(spellNames.value, cached.spellNames);
      } else {
        uncachedAugments.push(aug);
      }
    }

    // Fetch uncached augments
    if (uncachedAugments.length > 0) {
      try {
        const augItemIds = uncachedAugments.map(a => a.itemId);
        const response = await api.fetchItemStatsBatch(augItemIds);
        const now = Date.now();

        // Cache and add to results
        for (const aug of uncachedAugments) {
          const stats = response.items[aug.itemId];
          if (stats) {
            statsCache.set(aug.itemId, {
              stats,
              spellNames: response.spellNames,
              fetchedAt: now
            });
            augInfos.push({
              slotIndex: aug.slotIndex,
              itemId: aug.itemId,
              stats
            });
          }
        }

        // Merge spell names
        Object.assign(spellNames.value, response.spellNames);
      } catch (err) {
        console.error('Failed to fetch augment stats:', err);
      }
    }

    // Sort by slot index and update state
    augInfos.sort((a, b) => a.slotIndex - b.slotIndex);
    augmentStats.value = augInfos;
  }

  /**
   * Update the tooltip position (for mouse tracking).
   */
  function updatePosition(pos: TooltipPosition) {
    position.value = pos;
  }

  /**
   * Hide the tooltip with a small delay to prevent flicker from hover transforms.
   */
  function hideTooltip() {
    // Use a small delay to prevent flicker when CSS transforms shift elements
    // If showTooltip is called before the delay expires, the hide is cancelled
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId);
    }
    hideTimeoutId = setTimeout(() => {
      hideTimeoutId = null;
      visible.value = false;
      currentItem.value = null;
      itemStats.value = null;
      spellNames.value = {};
      augmentStats.value = [];
      error.value = null;
    }, HIDE_DELAY_MS);
  }

  /**
   * Immediately hide the tooltip without delay (for cleanup scenarios).
   */
  function hideTooltipImmediate() {
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId);
      hideTimeoutId = null;
    }
    visible.value = false;
    currentItem.value = null;
    itemStats.value = null;
    spellNames.value = {};
    augmentStats.value = [];
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
    augmentStats,

    // Computed
    isVisible,

    // Actions
    showTooltip,
    updatePosition,
    hideTooltip,
    hideTooltipImmediate,
    clearCache,
    prefetchStats
  };
});
