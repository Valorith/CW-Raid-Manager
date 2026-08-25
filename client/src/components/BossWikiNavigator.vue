<template>
  <nav class="boss-wiki-navigator" aria-label="Boss strategy sections">
    <div class="boss-wiki-navigator__label">
      <span>On this page</span>
      <strong>{{ items.length }} sections</strong>
    </div>

    <div class="boss-wiki-navigator__links">
      <a
        v-for="item in items"
        :key="item.id"
        :href="`#${item.id}`"
        :class="{ 'is-active': item.id === activeId }"
        :aria-current="item.id === activeId ? 'location' : undefined"
        @click.prevent="emit('navigate', item.id)"
      >
        {{ item.label }}
      </a>
    </div>

    <label class="boss-wiki-navigator__select">
      <span>Jump to</span>
      <select :value="activeId || items[0]?.id" @change="handleSelect">
        <option v-for="item in items" :key="item.id" :value="item.id">
          {{ item.label }}
        </option>
      </select>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </label>
  </nav>
</template>

<script setup lang="ts">
import type { MediaWikiHeading } from '../utils/mediaWiki';

defineProps<{
  items: MediaWikiHeading[];
  activeId: string;
}>();

const emit = defineEmits<{
  navigate: [id: string];
}>();

function handleSelect(event: Event) {
  emit('navigate', (event.target as HTMLSelectElement).value);
}
</script>

<style scoped>
.boss-wiki-navigator {
  align-items: center;
  backdrop-filter: blur(16px);
  background: rgba(7, 14, 26, 0.9);
  border: 1px solid rgba(103, 146, 194, 0.2);
  border-radius: 11px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
  display: grid;
  gap: 1rem;
  grid-template-columns: auto minmax(0, 1fr);
  margin-bottom: 0.85rem;
  padding: 0.58rem 0.72rem;
  position: sticky;
  top: 4.35rem;
  z-index: 9;
}

.boss-wiki-navigator__label {
  border-right: 1px solid rgba(103, 146, 194, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.06rem;
  padding: 0.08rem 1rem 0.08rem 0.18rem;
  white-space: nowrap;
}

.boss-wiki-navigator__label span {
  color: #79dce2;
  font-size: 0.57rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.boss-wiki-navigator__label strong {
  color: #71869d;
  font-size: 0.58rem;
  font-weight: 650;
}

.boss-wiki-navigator__links {
  display: flex;
  gap: 0.18rem;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.boss-wiki-navigator__links::-webkit-scrollbar {
  display: none;
}

.boss-wiki-navigator__links a {
  border-radius: 7px;
  color: #8498af;
  flex: 0 0 auto;
  font-size: 0.66rem;
  font-weight: 700;
  max-width: 15rem;
  overflow: hidden;
  padding: 0.45rem 0.62rem;
  text-decoration: none;
  text-overflow: ellipsis;
  transition:
    background 140ms ease,
    color 140ms ease;
  white-space: nowrap;
}

.boss-wiki-navigator__links a:hover {
  background: rgba(69, 215, 223, 0.07);
  color: #c5edf0;
}

.boss-wiki-navigator__links a.is-active {
  background: rgba(69, 215, 223, 0.11);
  color: #9cecef;
}

.boss-wiki-navigator__select {
  display: none;
}

@media (max-width: 860px) {
  .boss-wiki-navigator {
    top: calc(6.3rem + env(safe-area-inset-top, 0px));
  }
}

@media (max-width: 680px) {
  .boss-wiki-navigator {
    display: block;
    margin-inline: 0.8rem;
    padding: 0.5rem;
  }

  .boss-wiki-navigator__label,
  .boss-wiki-navigator__links {
    display: none;
  }

  .boss-wiki-navigator__select {
    align-items: center;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .boss-wiki-navigator__select > span {
    color: #79dce2;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    padding-inline: 0.35rem 0.65rem;
    text-transform: uppercase;
  }

  .boss-wiki-navigator__select select {
    appearance: none;
    background: transparent;
    border: 0;
    color: #dbe7f2;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    min-width: 0;
    outline: 0;
    padding: 0.42rem 1.6rem 0.42rem 0.25rem;
    width: 100%;
  }

  .boss-wiki-navigator__select svg {
    fill: none;
    height: 1rem;
    pointer-events: none;
    stroke: #71869d;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
    width: 1rem;
  }
}
</style>
