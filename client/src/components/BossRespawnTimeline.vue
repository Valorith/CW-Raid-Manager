<template>
  <div
    v-if="countdown"
    class="boss-respawn-timeline"
    :class="`boss-respawn-timeline--${countdown.status}`"
    :style="countdownStyle"
    role="img"
    :aria-label="countdown.ariaLabel"
    :title="countdown.ariaLabel"
  >
    <span class="boss-respawn-timeline__track" aria-hidden="true">
      <span class="boss-respawn-timeline__progress"></span>
      <span
        v-if="countdown.remainingPercent !== null"
        class="boss-respawn-timeline__marker"
      ></span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';

import type { NpcRespawnTrackerEntry } from '../services/api';
import { buildBossRespawnCountdown } from '../utils/bossRespawnPresentation';

const props = defineProps<{
  entries: NpcRespawnTrackerEntry[];
  now: number;
}>();

const countdown = computed(() => buildBossRespawnCountdown(props.entries, props.now));

const countdownStyle = computed(
  () =>
    ({
      '--boss-remaining': `${countdown.value?.remainingPercent ?? 0}%`
    }) as CSSProperties
);
</script>

<style scoped>
.boss-respawn-timeline {
  --boss-respawn-tone: 112, 129, 150;
  align-items: center;
  bottom: 2px;
  display: flex;
  height: 6px;
  left: 1.05rem;
  opacity: 0.78;
  pointer-events: none;
  position: absolute;
  right: 1.05rem;
  transition:
    filter 180ms ease,
    opacity 180ms ease;
  z-index: 4;
}

.boss-respawn-timeline--down {
  --boss-respawn-tone: 248, 113, 113;
}

.boss-respawn-timeline--window {
  --boss-respawn-tone: 251, 146, 60;
}

.boss-respawn-timeline--up {
  --boss-respawn-tone: 74, 222, 128;
}

.boss-respawn-timeline__track {
  background: rgba(111, 137, 164, 0.14);
  border: 1px solid rgba(145, 173, 201, 0.13);
  border-radius: 999px;
  box-shadow: inset 0 1px 2px rgba(1, 5, 12, 0.5);
  height: 4px;
  position: relative;
  width: 100%;
}

.boss-respawn-timeline__progress {
  background: linear-gradient(
    90deg,
    rgba(var(--boss-respawn-tone), 0.24),
    rgba(var(--boss-respawn-tone), 0.78)
  );
  border-radius: inherit;
  bottom: -1px;
  overflow: hidden;
  left: 0;
  max-width: 100%;
  position: absolute;
  top: -1px;
  transition: width 900ms linear;
  width: var(--boss-remaining);
}

.boss-respawn-timeline__progress::after {
  animation: boss-respawn-flow 3.8s cubic-bezier(0.42, 0, 0.25, 1) infinite;
  animation-delay: calc(var(--card-delay, 0ms) * -4);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(238, 249, 252, 0.34),
    transparent
  );
  bottom: 0;
  content: '';
  left: -44%;
  opacity: 0;
  position: absolute;
  top: 0;
  transform: translateX(0);
  width: 44%;
}

.boss-respawn-timeline__marker {
  animation: boss-respawn-marker-pulse 3s ease-in-out infinite;
  animation-delay: calc(var(--card-delay, 0ms) * -2);
  background: rgb(var(--boss-respawn-tone));
  border: 1px solid rgba(235, 244, 250, 0.82);
  border-radius: 999px;
  box-shadow:
    0 0 0 2px rgba(5, 11, 22, 0.9),
    0 0 7px rgba(var(--boss-respawn-tone), 0.62);
  height: 6px;
  left: clamp(3px, var(--boss-remaining), calc(100% - 3px));
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: left 900ms linear;
  width: 6px;
}

@keyframes boss-respawn-flow {
  0%,
  18% {
    opacity: 0;
    transform: translateX(0);
  }

  34% {
    opacity: 0.48;
  }

  78% {
    opacity: 0.38;
  }

  100% {
    opacity: 0;
    transform: translateX(330%);
  }
}

@keyframes boss-respawn-marker-pulse {
  50% {
    box-shadow:
      0 0 0 2px rgba(5, 11, 22, 0.9),
      0 0 10px rgba(var(--boss-respawn-tone), 0.76);
  }
}

.boss-respawn-timeline--unknown .boss-respawn-timeline__progress {
  display: none;
}

:global(.boss-card-shell:hover) .boss-respawn-timeline,
:global(.boss-card:focus-visible) .boss-respawn-timeline {
  filter: brightness(1.08);
  opacity: 0.96;
}

@media (prefers-reduced-motion: reduce) {
  .boss-respawn-timeline,
  .boss-respawn-timeline__marker,
  .boss-respawn-timeline__progress {
    animation: none;
    transition: none;
  }

  .boss-respawn-timeline__progress::after {
    animation: none;
    display: none;
  }
}
</style>
