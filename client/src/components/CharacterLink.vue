<template>
  <a
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
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: string;
}>();

const href = computed(
  () => `https://magelo.clumsysworld.com/index.php?page=character&char=${encodeURIComponent(props.name.trim())}`
);
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
</style>
