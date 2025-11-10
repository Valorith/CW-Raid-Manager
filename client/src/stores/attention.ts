import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export interface AttentionIndicator {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  active: boolean;
  requiresAttention: boolean;
  onToggle?: () => void;
}

type IndicatorRecord = Record<string, AttentionIndicator>;

export const useAttentionStore = defineStore('attention', () => {
  const indicators = ref<IndicatorRecord>({});

  const indicatorList = computed(() =>
    Object.values(indicators.value).sort((a, b) => a.label.localeCompare(b.label))
  );

  const hasIndicators = computed(() => indicatorList.value.length > 0);

  function registerIndicator(id: string, indicator: AttentionIndicator) {
    indicators.value = {
      ...indicators.value,
      [id]: { ...indicator, id }
    };
  }

  function updateIndicator(id: string, updates: Partial<AttentionIndicator>) {
    const existing = indicators.value[id];
    if (!existing) {
      return;
    }
    indicators.value = {
      ...indicators.value,
      [id]: { ...existing, ...updates, id }
    };
  }

  function unregisterIndicator(id: string) {
    if (!indicators.value[id]) {
      return;
    }
    const next = { ...indicators.value };
    delete next[id];
    indicators.value = next;
  }

  function triggerIndicator(id: string) {
    indicators.value[id]?.onToggle?.();
  }

  return {
    indicators,
    indicatorList,
    hasIndicators,
    registerIndicator,
    updateIndicator,
    unregisterIndicator,
    triggerIndicator
  };
});
