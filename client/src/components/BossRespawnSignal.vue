<template>
  <div
    class="boss-respawn-signal"
    :class="{ 'boss-respawn-signal--dual': lanes.length > 1 }"
    role="status"
    :aria-label="lanes.map((lane) => lane.ariaLabel).join('. ')"
  >
    <div
      v-for="lane in lanes"
      :key="lane.variant"
      class="boss-respawn-signal__lane"
      :class="`boss-respawn-signal__lane--${lane.status}`"
      :title="lane.ariaLabel"
    >
      <span class="boss-respawn-signal__variant">
        {{ lanes.length > 1 ? lane.compactVariantLabel : lane.variantLabel }}
      </span>
      <span class="boss-respawn-signal__pulse" aria-hidden="true"></span>
      <span class="boss-respawn-signal__copy">
        <strong>{{ lane.statusLabel }}</strong>
        <small v-if="lane.detail">{{ lane.detail }}</small>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { NpcRespawnTrackerEntry } from '../services/api';
import { buildBossRespawnLanes } from '../utils/bossRespawnPresentation';

const props = defineProps<{
  entries: NpcRespawnTrackerEntry[];
  now: number;
}>();

const lanes = computed(() => buildBossRespawnLanes(props.entries, props.now));
</script>

<style scoped>
.boss-respawn-signal {
  align-items: stretch;
  backdrop-filter: blur(18px) saturate(1.12);
  background:
    linear-gradient(90deg, rgba(4, 9, 18, 0.9), rgba(5, 12, 23, 0.78)),
    rgba(4, 9, 18, 0.82);
  border-top: 1px solid rgba(181, 210, 229, 0.16);
  bottom: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  left: 0;
  min-height: 3.05rem;
  pointer-events: none;
  position: absolute;
  right: 0;
  z-index: 2;
}

.boss-respawn-signal--dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.boss-respawn-signal__lane {
  align-items: center;
  display: grid;
  gap: 0.52rem;
  grid-template-columns: auto auto minmax(0, 1fr);
  min-width: 0;
  padding: 0.56rem 0.72rem 0.54rem;
  position: relative;
}

.boss-respawn-signal--dual .boss-respawn-signal__lane {
  gap: 0.38rem;
  padding-inline: 0.58rem;
}

.boss-respawn-signal--dual .boss-respawn-signal__lane + .boss-respawn-signal__lane {
  border-left: 1px solid rgba(181, 210, 229, 0.13);
}

.boss-respawn-signal__variant {
  color: #8194aa;
  font-family: var(--nx-font-mono);
  font-size: 0.53rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.boss-respawn-signal__pulse {
  background: #708196;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(112, 129, 150, 0.1);
  height: 0.43rem;
  width: 0.43rem;
}

.boss-respawn-signal__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.boss-respawn-signal__copy strong {
  color: #dce6ef;
  font-size: 0.63rem;
  font-weight: 800;
  letter-spacing: 0.015em;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-respawn-signal__copy small {
  color: #72859b;
  font-size: 0.51rem;
  line-height: 1.25;
  margin-top: 0.12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-respawn-signal__lane--up .boss-respawn-signal__pulse {
  background: #4ade80;
  box-shadow:
    0 0 0 3px rgba(74, 222, 128, 0.12),
    0 0 12px rgba(74, 222, 128, 0.68);
}

.boss-respawn-signal__lane--up .boss-respawn-signal__copy strong {
  color: #bff8d1;
}

.boss-respawn-signal__lane--window .boss-respawn-signal__pulse {
  background: #fb923c;
  box-shadow:
    0 0 0 3px rgba(251, 146, 60, 0.12),
    0 0 12px rgba(251, 146, 60, 0.58);
}

.boss-respawn-signal__lane--window .boss-respawn-signal__copy strong {
  color: #ffd2aa;
}

.boss-respawn-signal__lane--down .boss-respawn-signal__pulse {
  background: #f87171;
  box-shadow:
    0 0 0 3px rgba(248, 113, 113, 0.1),
    0 0 10px rgba(248, 113, 113, 0.42);
}

.boss-respawn-signal__lane--down .boss-respawn-signal__copy strong {
  color: #ffc1c1;
}

@media (prefers-reduced-motion: no-preference) {
  .boss-respawn-signal__lane--up .boss-respawn-signal__pulse {
    animation: boss-respawn-pulse 3.8s ease-in-out infinite;
  }
}

@keyframes boss-respawn-pulse {
  50% {
    box-shadow:
      0 0 0 4px rgba(74, 222, 128, 0.08),
      0 0 16px rgba(74, 222, 128, 0.76);
  }
}

@media (max-width: 420px) {
  .boss-respawn-signal__lane {
    padding-inline: 0.62rem;
  }
}
</style>
