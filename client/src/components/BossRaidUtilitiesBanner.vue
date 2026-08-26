<template>
  <aside class="boss-utilities-banner" aria-label="Raid utilities">
    <section class="boss-utilities-banner__section boss-utilities-banner__section--heals">
      <header class="boss-utilities-banner__heading">
        <span aria-hidden="true"></span>
        <h2>Heals</h2>
      </header>
      <div class="boss-utilities-banner__content">
        <span class="boss-utilities-banner__gems" aria-hidden="true">
          <span
            class="boss-utilities-banner__gem boss-utilities-banner__gem--heals"
            :class="{ 'is-active': heals.raidHeals }"
          >
            <img src="/icons/heals/spell-icon-118.gif" alt="" draggable="false" />
          </span>
          <span
            class="boss-utilities-banner__gem boss-utilities-banner__gem--heals"
            :class="{ 'is-active': hasCHealChain }"
          >
            <img src="/icons/heals/spell-icon-99.gif" alt="" draggable="false" />
          </span>
        </span>
        <strong>{{ healsSummary }}</strong>
      </div>
    </section>

    <section class="boss-utilities-banner__section boss-utilities-banner__section--cures">
      <header class="boss-utilities-banner__heading">
        <span aria-hidden="true"></span>
        <h2>Cures</h2>
      </header>
      <div class="boss-utilities-banner__content">
        <span class="boss-utilities-banner__gems" aria-hidden="true">
          <span
            v-for="cure in cureOptions"
            :key="cure.key"
            class="boss-utilities-banner__gem"
            :class="[`boss-utilities-banner__gem--${cure.key}`, { 'is-active': cures[cure.key] }]"
          >
            <img :src="cure.icon" alt="" draggable="false" />
          </span>
        </span>
        <strong>{{ curesSummary }}</strong>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { BossCures, BossHeals } from '../services/api';

const props = defineProps<{
  heals: BossHeals;
  cures: BossCures;
}>();

const cureOptions: Array<{ key: keyof BossCures; label: string; icon: string }> = [
  { key: 'curse', label: 'Curse', icon: '/icons/cures/spell-icon-139.png' },
  { key: 'poison', label: 'Poison', icon: '/icons/cures/spell-icon-42.png' },
  { key: 'disease', label: 'Disease', icon: '/icons/cures/spell-icon-41.png' }
];

const hasCHealChain = computed(() => props.heals.cHealChainSize > 0);

const healsSummary = computed(() => {
  const plan = [
    props.heals.raidHeals ? 'Raid Heals' : null,
    hasCHealChain.value ? `${props.heals.cHealChainSize} Person CHeal Chain` : null
  ].filter(Boolean);

  return plan.join(' · ') || 'No special healing plan';
});

const curesSummary = computed(() => {
  const required = cureOptions.filter((cure) => props.cures[cure.key]);
  return required.map((cure) => cure.label).join(' · ') || 'None required';
});
</script>

<style scoped>
.boss-utilities-banner {
  background:
    linear-gradient(90deg, rgba(101, 190, 157, 0.065), transparent 42%),
    linear-gradient(270deg, rgba(123, 155, 190, 0.055), transparent 42%), rgba(6, 12, 23, 0.9);
  border: 1px solid rgba(111, 151, 192, 0.24);
  border-radius: 12px;
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.18),
    inset 0 1px rgba(255, 255, 255, 0.025);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  width: 100%;
}

.boss-utilities-banner__section {
  min-width: 0;
  padding: 0.68rem clamp(0.75rem, 2.2vw, 1.15rem) 0.72rem;
}

.boss-utilities-banner__section + .boss-utilities-banner__section {
  border-left: 1px solid rgba(111, 151, 192, 0.16);
}

.boss-utilities-banner__heading {
  align-items: center;
  display: flex;
  gap: 0.38rem;
  margin-bottom: 0.42rem;
}

.boss-utilities-banner__heading > span {
  background: #6bcdd3;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(107, 205, 211, 0.3);
  height: 0.3rem;
  width: 0.3rem;
}

.boss-utilities-banner__section--heals .boss-utilities-banner__heading > span {
  background: #7ed7b6;
  box-shadow: 0 0 8px rgba(126, 215, 182, 0.3);
}

.boss-utilities-banner__heading h2 {
  color: #9eafc1;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  margin: 0;
  text-transform: uppercase;
}

.boss-utilities-banner__content {
  align-items: center;
  display: flex;
  gap: 0.65rem;
  min-width: 0;
}

.boss-utilities-banner__content strong {
  color: #e7eef5;
  font-family: var(--nx-font-display);
  font-size: 0.74rem;
  line-height: 1.28;
  min-width: 0;
}

.boss-utilities-banner__section--heals .boss-utilities-banner__content strong {
  color: #a5e7ce;
}

.boss-utilities-banner__gems {
  display: inline-flex;
  flex: 0 0 auto;
  padding-left: 0.1rem;
}

.boss-utilities-banner__gem {
  --utility-color: 140 160 184;
  background: #0a1320;
  border: 1px solid rgb(var(--utility-color) / 0.22);
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.42);
  display: inline-flex;
  height: 1.8rem;
  opacity: 0.34;
  overflow: hidden;
  transform: scale(0.93);
  width: 1.8rem;
}

.boss-utilities-banner__gem + .boss-utilities-banner__gem {
  margin-left: -0.38rem;
}

.boss-utilities-banner__gem.is-active {
  border-color: rgb(var(--utility-color) / 0.5);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.42),
    0 0 9px rgb(var(--utility-color) / 0.18);
  opacity: 1;
  transform: scale(1);
  z-index: 1;
}

.boss-utilities-banner__gem--heals {
  --utility-color: 126 215 182;
}

.boss-utilities-banner__gem--curse {
  --utility-color: 181 148 245;
}

.boss-utilities-banner__gem--poison {
  --utility-color: 112 209 109;
}

.boss-utilities-banner__gem--disease {
  --utility-color: 215 161 75;
}

.boss-utilities-banner__gem img {
  display: block;
  height: 100%;
  image-rendering: pixelated;
  object-fit: cover;
  width: 100%;
}

@media (max-width: 540px) {
  .boss-utilities-banner {
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    gap: 0.6rem;
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .boss-utilities-banner__section {
    background: rgba(6, 12, 23, 0.9);
    border: 1px solid rgba(111, 151, 192, 0.24);
    border-radius: 11px;
    box-shadow:
      0 12px 26px rgba(0, 0, 0, 0.16),
      inset 0 1px rgba(255, 255, 255, 0.025);
    padding: 0.62rem 0.65rem 0.66rem;
  }

  .boss-utilities-banner__section--heals {
    background:
      linear-gradient(90deg, rgba(101, 190, 157, 0.075), transparent 70%),
      rgba(6, 12, 23, 0.9);
  }

  .boss-utilities-banner__section--cures {
    background:
      linear-gradient(90deg, rgba(123, 155, 190, 0.065), transparent 70%),
      rgba(6, 12, 23, 0.9);
  }

  .boss-utilities-banner__content {
    gap: 0.45rem;
  }

  .boss-utilities-banner__content strong {
    font-size: 0.65rem;
  }

  .boss-utilities-banner__gem {
    height: 1.55rem;
    width: 1.55rem;
  }

  .boss-utilities-banner__gem + .boss-utilities-banner__gem {
    margin-left: -0.48rem;
  }
}
</style>
