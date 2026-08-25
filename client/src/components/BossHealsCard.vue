<template>
  <aside
    class="boss-heals-card"
    :class="{ 'boss-heals-card--editable': editable }"
    aria-labelledby="boss-heals-title"
  >
    <header class="boss-heals-card__heading">
      <div>
        <p>Raid utility</p>
        <h2 id="boss-heals-title">Heals</h2>
      </div>
      <span>{{ editable ? 'Set healing plan' : 'Healing plan' }}</span>
    </header>

    <div class="boss-heals-list" aria-label="Raid healing plan">
      <component
        :is="editable ? 'button' : 'div'"
        v-if="editable || heals.raidHeals"
        :type="editable ? 'button' : undefined"
        class="boss-heal boss-heal--raid is-active"
        :class="{ 'is-readonly': !editable, 'is-disabled': !heals.raidHeals }"
        :aria-pressed="editable ? heals.raidHeals : undefined"
        :disabled="editable ? saving : undefined"
        :title="editable ? 'Toggle Raid Heals' : 'Raid Heals selected'"
        @click="editable && emit('toggle-raid-heals')"
      >
        <span class="boss-heal__gem" aria-hidden="true">
          <img src="/icons/heals/spell-icon-118.gif" alt="" draggable="false" />
        </span>
        <span class="boss-heal__copy">
          <strong>Raid Heals</strong>
          <small>{{ heals.raidHeals ? 'Selected' : 'Not selected' }}</small>
        </span>
        <span v-if="editable" class="boss-heal__toggle" aria-hidden="true">
          <svg v-if="heals.raidHeals" viewBox="0 0 24 24">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
        <span v-else class="boss-heal__status" aria-hidden="true">Yes</span>
      </component>

      <div
        v-if="editable || hasCHealChain"
        class="boss-heal boss-heal--chain is-active"
        :class="{ 'is-disabled': !hasCHealChain }"
      >
        <span class="boss-heal__gem" aria-hidden="true">
          <img src="/icons/heals/spell-icon-99.gif" alt="" draggable="false" />
        </span>
        <span class="boss-heal__copy">
          <strong>{{ cHealChainLabel }}</strong>
          <small>{{ editable ? 'Select chain size' : 'Selected' }}</small>
        </span>
        <div
          v-if="editable"
          class="boss-heal__chain-selector"
          role="group"
          aria-label="CHeal chain size"
        >
          <button
            v-for="size in chainSizes"
            :key="size"
            type="button"
            :class="{ 'is-selected': heals.cHealChainSize === size }"
            :aria-pressed="heals.cHealChainSize === size"
            :aria-label="size === 0 ? 'No CHeal Chain' : `${size} Person CHeal Chain`"
            :disabled="saving"
            @click="emit('select-c-heal-chain', size)"
          >
            {{ size }}
          </button>
        </div>
        <span v-else class="boss-heal__status" aria-hidden="true">
          {{ heals.cHealChainSize }}x
        </span>
      </div>
      <p v-if="!editable && !heals.raidHeals && !hasCHealChain" class="boss-heals-empty">
        No raid healing utilities selected.
      </p>
    </div>

    <span v-if="saving" class="boss-heals-card__saving" role="status"> Saving healing plan… </span>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { BossHeals, CHealChainSize } from '../services/api';

const props = withDefaults(
  defineProps<{
    heals: BossHeals;
    editable?: boolean;
    saving?: boolean;
  }>(),
  {
    editable: false,
    saving: false
  }
);

const emit = defineEmits<{
  'toggle-raid-heals': [];
  'select-c-heal-chain': [size: CHealChainSize];
}>();

const chainSizes: CHealChainSize[] = [0, 2, 3, 4, 5];
const hasCHealChain = computed(() => props.heals.cHealChainSize > 0);
const cHealChainLabel = computed(() =>
  hasCHealChain.value ? `${props.heals.cHealChainSize} Person CHeal Chain` : 'No CHeal Chain'
);
</script>

<style scoped>
.boss-heals-card {
  --heal-color: #7ed7b6;
  --heal-rgb: 126 215 182;
  align-self: start;
  background:
    linear-gradient(135deg, rgba(101, 190, 157, 0.07), transparent 46%), rgba(6, 12, 23, 0.88);
  border: 1px solid rgba(111, 151, 192, 0.24);
  border-radius: 12px;
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px rgba(255, 255, 255, 0.025);
  padding: 0.72rem;
  position: relative;
  width: min(100%, 17.5rem);
}

.boss-heals-card--editable {
  border-color: rgba(69, 215, 223, 0.3);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px rgba(255, 255, 255, 0.025),
    0 0 0 1px rgba(69, 215, 223, 0.035);
}

.boss-heals-card__heading {
  align-items: center;
  border-bottom: 1px solid rgba(111, 151, 192, 0.14);
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.58rem;
  padding: 0.08rem 0.12rem 0.58rem;
}

.boss-heals-card__heading p {
  color: #6bcdd3;
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  margin: 0 0 0.1rem;
  text-transform: uppercase;
}

.boss-heals-card__heading h2 {
  color: #f0f5fa;
  font-family: var(--nx-font-display);
  font-size: 1rem;
  margin: 0;
}

.boss-heals-card__heading > span {
  color: #63778e;
  font-size: 0.53rem;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.boss-heals-list {
  display: grid;
  gap: 0.42rem;
}

.boss-heal {
  align-items: center;
  background:
    linear-gradient(90deg, rgb(var(--heal-rgb) / 0.11), transparent 72%), rgba(17, 27, 44, 0.76);
  border: 1px solid rgb(var(--heal-rgb) / 0.34);
  border-radius: 8px;
  box-shadow: inset 2px 0 var(--heal-color);
  color: var(--heal-color);
  display: grid;
  gap: 0.58rem;
  grid-template-columns: 2.25rem minmax(0, 1fr) auto;
  min-height: 2.85rem;
  padding: 0.3rem 0.42rem;
  text-align: left;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 150ms ease;
}

.boss-heal--raid.is-disabled {
  background: rgba(17, 27, 44, 0.58);
  border-color: rgba(113, 149, 185, 0.14);
  box-shadow: none;
  color: #7f93a9;
}

.boss-heal--chain.is-disabled {
  background: rgba(17, 27, 44, 0.58);
  border-color: rgba(113, 149, 185, 0.14);
  box-shadow: none;
  color: #7f93a9;
}

button.boss-heal {
  cursor: pointer;
  width: 100%;
}

button.boss-heal:hover {
  background: rgb(var(--heal-rgb) / 0.075);
  border-color: rgb(var(--heal-rgb) / 0.42);
  transform: translateY(-1px);
}

button.boss-heal:disabled {
  opacity: 1;
}

.boss-heal__gem {
  align-items: center;
  background:
    radial-gradient(circle at 35% 25%, rgb(var(--heal-rgb) / 0.14), transparent 54%), #0a1320;
  border: 1px solid rgb(var(--heal-rgb) / 0.25);
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.42),
    inset 0 -7px 13px rgba(0, 0, 0, 0.28),
    0 0 12px rgb(var(--heal-rgb) / 0.14);
  display: inline-flex;
  height: 2.25rem;
  justify-content: center;
  transition:
    opacity 150ms ease,
    transform 150ms ease;
  width: 2.25rem;
}

.boss-heal.is-disabled .boss-heal__gem {
  opacity: 0.48;
  transform: scale(0.94);
}

.boss-heal__gem img {
  border-radius: 4px;
  display: block;
  height: 2rem;
  image-rendering: pixelated;
  user-select: none;
  width: 2rem;
}

.boss-heal.is-disabled .boss-heal__gem img {
  filter: brightness(0.72) saturate(0.7);
}

.boss-heal__copy {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
}

.boss-heal__copy strong {
  color: currentColor;
  font-size: 0.68rem;
  line-height: 1.1;
}

.boss-heal__copy small {
  color: rgb(var(--heal-rgb) / 0.78);
  font-size: 0.53rem;
}

.boss-heal.is-disabled .boss-heal__copy small {
  color: #62778e;
}

.boss-heal__toggle {
  align-items: center;
  border: 1px solid rgba(113, 149, 185, 0.18);
  border-radius: 50%;
  color: #071019;
  display: inline-flex;
  height: 1rem;
  justify-content: center;
  transition: 150ms ease;
  width: 1rem;
}

.boss-heal:not(.is-disabled) .boss-heal__toggle {
  background: var(--heal-color);
  border-color: var(--heal-color);
  box-shadow: 0 0 8px rgb(var(--heal-rgb) / 0.25);
}

.boss-heal__toggle svg {
  fill: none;
  height: 0.68rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
  width: 0.68rem;
}

.boss-heal__status {
  color: var(--heal-color);
  font-size: 0.51rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}

.boss-heal__chain-selector {
  background: rgba(5, 11, 20, 0.7);
  border: 1px solid rgba(126, 215, 182, 0.18);
  border-radius: 7px;
  display: inline-grid;
  grid-column: 2 / -1;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
  width: 100%;
}

.boss-heals-card--editable .boss-heal--chain {
  grid-template-columns: 2.25rem minmax(0, 1fr);
}

.boss-heal__chain-selector button {
  background: transparent;
  border: 0;
  color: #6f8599;
  cursor: pointer;
  font-size: 0.58rem;
  font-weight: 800;
  height: 1.9rem;
  padding: 0;
  transition:
    background 140ms ease,
    color 140ms ease;
}

.boss-heal__chain-selector button + button {
  border-left: 1px solid rgba(126, 215, 182, 0.13);
}

.boss-heal__chain-selector button:hover,
.boss-heal__chain-selector button.is-selected {
  background: rgb(var(--heal-rgb) / 0.18);
  color: #a8f1d4;
}

.boss-heal__chain-selector button:disabled {
  cursor: default;
}

.boss-heals-card__saving {
  color: #7bdce1;
  display: block;
  font-size: 0.56rem;
  margin-top: 0.48rem;
  text-align: right;
}

.boss-heals-empty {
  color: #7f93a9;
  font-size: 0.64rem;
  line-height: 1.45;
  margin: 0;
  padding: 0.55rem 0.4rem 0.4rem;
}

@media (max-width: 540px) {
  .boss-heals-card {
    border-radius: 11px;
    width: min(100%, 17.25rem);
  }

  .boss-heal {
    min-height: 2.75rem;
  }
}
</style>
