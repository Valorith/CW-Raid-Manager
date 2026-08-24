<template>
  <aside
    class="boss-cures-card"
    :class="{ 'boss-cures-card--editable': editable }"
    aria-labelledby="boss-cures-title"
  >
    <header class="boss-cures-card__heading">
      <div>
        <p>Raid utility</p>
        <h2 id="boss-cures-title">Cures</h2>
      </div>
      <span>{{ editable ? 'Click to toggle' : 'Required types' }}</span>
    </header>
    <div class="boss-cures-list" aria-label="Required cure types">
      <component
        :is="editable ? 'button' : 'div'"
        v-for="cure in cureOptions"
        :key="cure.key"
        :type="editable ? 'button' : undefined"
        class="boss-cure"
        :class="[
          `boss-cure--${cure.key}`,
          {
            'is-needed': cures[cure.key],
            'is-readonly': !editable
          }
        ]"
        :aria-pressed="editable ? cures[cure.key] : undefined"
        :disabled="editable ? saving : undefined"
        :title="editable ? `Toggle ${cure.label}` : `${cure.label} cure status`"
        @click="editable && emit('toggle', cure.key)"
      >
        <span class="boss-cure__gem" aria-hidden="true">
          <img :src="cure.icon" alt="" draggable="false" />
        </span>
        <span class="boss-cure__copy">
          <strong>{{ cure.label }}</strong>
          <small>{{ cures[cure.key] ? 'Required' : 'Not needed' }}</small>
        </span>
        <span v-if="editable" class="boss-cure__toggle" aria-hidden="true">
          <svg v-if="cures[cure.key]" viewBox="0 0 24 24">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
        <span v-else class="boss-cure__status" aria-hidden="true">
          {{ cures[cure.key] ? 'Yes' : 'No' }}
        </span>
      </component>
    </div>
    <span v-if="saving" class="boss-cures-card__saving" role="status"> Saving cure setup… </span>
  </aside>
</template>

<script setup lang="ts">
import type { BossCures } from '../services/api';

withDefaults(
  defineProps<{
    cures: BossCures;
    editable?: boolean;
    saving?: boolean;
  }>(),
  {
    editable: false,
    saving: false
  }
);

const emit = defineEmits<{
  toggle: [key: keyof BossCures];
}>();

const cureOptions: Array<{ key: keyof BossCures; label: string; icon: string }> = [
  { key: 'curse', label: 'Curse', icon: '/icons/cures/spell-icon-139.png' },
  { key: 'poison', label: 'Poison', icon: '/icons/cures/spell-icon-42.png' },
  { key: 'disease', label: 'Disease', icon: '/icons/cures/spell-icon-41.png' }
];
</script>

<style scoped>
.boss-cures-card {
  align-self: start;
  background:
    linear-gradient(135deg, rgba(123, 155, 190, 0.055), transparent 46%), rgba(6, 12, 23, 0.88);
  border: 1px solid rgba(111, 151, 192, 0.24);
  border-radius: 12px;
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px rgba(255, 255, 255, 0.025);
  justify-self: end;
  padding: 0.72rem;
  position: relative;
  width: min(100%, 17.5rem);
}

.boss-cures-card--editable {
  border-color: rgba(69, 215, 223, 0.3);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px rgba(255, 255, 255, 0.025),
    0 0 0 1px rgba(69, 215, 223, 0.035);
}

.boss-cures-card__heading {
  align-items: center;
  border-bottom: 1px solid rgba(111, 151, 192, 0.14);
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.58rem;
  padding: 0.08rem 0.12rem 0.58rem;
}

.boss-cures-card__heading p {
  color: #6bcdd3;
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  margin: 0 0 0.1rem;
  text-transform: uppercase;
}

.boss-cures-card__heading h2 {
  color: #f0f5fa;
  font-family: var(--nx-font-display);
  font-size: 1rem;
  margin: 0;
}

.boss-cures-card__heading > span {
  color: #63778e;
  font-size: 0.53rem;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.boss-cures-list {
  display: grid;
  gap: 0.42rem;
}

.boss-cure {
  --cure-color: #8ca0b8;
  --cure-rgb: 140 160 184;
  align-items: center;
  background: rgba(17, 27, 44, 0.58);
  border: 1px solid rgba(113, 149, 185, 0.14);
  border-radius: 8px;
  color: #7f93a9;
  display: grid;
  gap: 0.58rem;
  grid-template-columns: 2.25rem minmax(0, 1fr) 1.15rem;
  min-height: 2.85rem;
  padding: 0.3rem 0.42rem;
  text-align: left;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 150ms ease;
}

.boss-cure--curse {
  --cure-color: #b594f5;
  --cure-rgb: 181 148 245;
}

.boss-cure--poison {
  --cure-color: #70d16d;
  --cure-rgb: 112 209 109;
}

.boss-cure--disease {
  --cure-color: #d7a14b;
  --cure-rgb: 215 161 75;
}

.boss-cure:not(.is-readonly) {
  cursor: pointer;
}

.boss-cure:not(.is-readonly):hover {
  background: rgb(var(--cure-rgb) / 0.075);
  border-color: rgb(var(--cure-rgb) / 0.36);
  transform: translateY(-1px);
}

.boss-cure:disabled {
  opacity: 1;
}

.boss-cure.is-needed {
  background:
    linear-gradient(90deg, rgb(var(--cure-rgb) / 0.13), transparent 72%), rgba(17, 27, 44, 0.76);
  border-color: rgb(var(--cure-rgb) / 0.42);
  box-shadow: inset 2px 0 var(--cure-color);
  color: var(--cure-color);
}

.boss-cure__gem {
  align-items: center;
  background:
    radial-gradient(circle at 35% 25%, rgb(var(--cure-rgb) / 0.14), transparent 54%), #0a1320;
  border: 1px solid rgb(var(--cure-rgb) / 0.25);
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.42),
    inset 0 -7px 13px rgba(0, 0, 0, 0.28);
  color: var(--cure-color);
  display: inline-flex;
  height: 2.25rem;
  justify-content: center;
  opacity: 0.48;
  transform: scale(0.94);
  transition:
    opacity 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
  width: 2.25rem;
}

.boss-cure.is-needed .boss-cure__gem {
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.42),
    inset 0 -7px 13px rgba(0, 0, 0, 0.28),
    0 0 12px rgb(var(--cure-rgb) / 0.16);
  opacity: 1;
  transform: scale(1);
}

.boss-cure__gem img {
  border-radius: 4px;
  display: block;
  filter: brightness(0.82) saturate(0.9);
  height: 2rem;
  image-rendering: pixelated;
  transition: filter 150ms ease;
  user-select: none;
  width: 2rem;
}

.boss-cure.is-needed .boss-cure__gem img {
  filter: brightness(1.05) saturate(1.08);
}

.boss-cure__copy {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
}

.boss-cure__copy strong {
  color: currentColor;
  font-size: 0.68rem;
  line-height: 1.1;
}

.boss-cure__copy small {
  color: #62778e;
  font-size: 0.53rem;
}

.boss-cure.is-needed .boss-cure__copy small {
  color: rgb(var(--cure-rgb) / 0.8);
}

.boss-cure__toggle {
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

.boss-cure.is-needed .boss-cure__toggle {
  background: var(--cure-color);
  border-color: var(--cure-color);
  box-shadow: 0 0 8px rgb(var(--cure-rgb) / 0.25);
}

.boss-cure__toggle svg {
  fill: none;
  height: 0.68rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
  width: 0.68rem;
}

.boss-cure__status {
  color: #60758c;
  font-size: 0.51rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}

.boss-cure.is-needed .boss-cure__status {
  color: var(--cure-color);
}

.boss-cures-card__saving {
  color: #7bdce1;
  display: block;
  font-size: 0.56rem;
  margin-top: 0.48rem;
  text-align: right;
}

@media (max-width: 540px) {
  .boss-cures-card {
    border-radius: 11px;
    width: min(100%, 17.25rem);
  }

  .boss-cure {
    min-height: 2.75rem;
  }
}
</style>
