<template>
  <span
    class="coin-display"
    :class="`coin-display--${variant}`"
    :title="accessibleLabel"
    :aria-label="accessibleLabel"
  >
    <span v-for="segment in segments" :key="segment.key" class="coin-display__segment">
      <span class="coin-display__value">{{ segment.text }}</span>
      <img class="coin-display__icon" :src="segment.icon" alt="" aria-hidden="true" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type CoinKey = 'platinum' | 'gold' | 'silver' | 'copper';
type CoinSegment = {
  key: CoinKey;
  text: string;
  icon: string;
  label: string;
};

const props = withDefaults(
  defineProps<{
    amountInCopper?: number | null;
    platinum?: number | null;
    gold?: number | null;
    silver?: number | null;
    copper?: number | null;
    variant?: 'breakdown' | 'platinum';
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }>(),
  {
    amountInCopper: null,
    platinum: null,
    gold: null,
    silver: null,
    copper: null,
    variant: 'breakdown',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }
);

const COIN_ICONS: Record<CoinKey, string> = {
  platinum: '/assets/icons/coins/pp.png',
  gold: '/assets/icons/coins/gp.png',
  silver: '/assets/icons/coins/sp.png',
  copper: '/assets/icons/coins/cp.png'
};

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('en-US', options).format(value);
}

function roundMoneyValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

const segments = computed<CoinSegment[]>(() => {
  if (props.variant === 'platinum') {
    const rawCopper = typeof props.amountInCopper === 'number' ? props.amountInCopper : 0;
    const platinumValue = rawCopper / 1000;
    const minimumFractionDigits =
      platinumValue < 100 ? Math.max(props.minimumFractionDigits, 1) : props.minimumFractionDigits;

    return [
      {
        key: 'platinum',
        text: formatNumber(platinumValue, {
          minimumFractionDigits,
          maximumFractionDigits: props.maximumFractionDigits
        }),
        icon: COIN_ICONS.platinum,
        label: 'platinum'
      }
    ];
  }

  const hasExplicitBreakdown = [props.platinum, props.gold, props.silver, props.copper].some(
    (value) => value != null
  );

  const breakdown = hasExplicitBreakdown
    ? {
        platinum: roundMoneyValue(props.platinum ?? 0),
        gold: roundMoneyValue(props.gold ?? 0),
        silver: roundMoneyValue(props.silver ?? 0),
        copper: roundMoneyValue(props.copper ?? 0)
      }
    : (() => {
        const totalCopper = roundMoneyValue(props.amountInCopper ?? 0);
        return {
          platinum: Math.floor(totalCopper / 1000),
          gold: Math.floor((totalCopper % 1000) / 100),
          silver: Math.floor((totalCopper % 100) / 10),
          copper: totalCopper % 10
        };
      })();

  const result: CoinSegment[] = [];
  (Object.entries(breakdown) as Array<[CoinKey, number]>).forEach(([key, value]) => {
    if (value <= 0) {
      return;
    }

    result.push({
      key,
      text: key === 'platinum' ? formatNumber(value) : String(value),
      icon: COIN_ICONS[key],
      label: key
    });
  });

  if (result.length > 0) {
    return result;
  }

  return [
    {
      key: 'copper',
      text: '0',
      icon: COIN_ICONS.copper,
      label: 'copper'
    }
  ];
});

const accessibleLabel = computed(() =>
  segments.value.map((segment) => `${segment.text} ${segment.label}`).join(' ')
);
</script>

<style scoped>
.coin-display {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.3em;
  align-items: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.coin-display__segment {
  display: inline-flex;
  align-items: center;
  gap: 0.18em;
}

.coin-display__value {
  line-height: 1;
}

.coin-display__icon {
  width: 1.05em;
  height: 1.05em;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}
</style>
