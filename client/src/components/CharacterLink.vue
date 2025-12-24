<template>
  <a
    v-if="!adminMode"
    :href="href"
    class="character-link"
    target="_blank"
    rel="noopener noreferrer"
    @click.stop
    @keydown.enter.stop
    @keydown.space.stop.prevent
  >
    <slot>{{ name }}</slot>
  </a>
  <button
    v-else
    class="character-link character-link--admin"
    @click.stop="openAdminModal"
    @keydown.enter.stop="openAdminModal"
    @keydown.space.stop.prevent="openAdminModal"
  >
    <slot>{{ name }}</slot>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCharacterAdminStore } from '../stores/characterAdmin';

const props = withDefaults(defineProps<{
  name: string;
  adminMode?: boolean;
}>(), {
  adminMode: false
});

const characterAdminStore = useCharacterAdminStore();

const href = computed(
  () => `https://magelo.clumsysworld.com/index.php?page=character&char=${encodeURIComponent(props.name.trim())}`
);

function openAdminModal() {
  characterAdminStore.openByName(props.name.trim());
}
</script>

<style scoped>
.character-link {
  color: #38bdf8;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.15s ease, text-shadow 0.15s ease;
}

.character-link:hover,
.character-link:focus-visible {
  color: #f8fafc;
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
}

.character-link--admin {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
}
</style>
