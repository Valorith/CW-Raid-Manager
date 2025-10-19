<template>
  <section class="dashboard">
    <header class="section-header">
      <div>
        <h1>Dashboard</h1>
        <p>Quick overview of your characters and upcoming raids.</p>
      </div>
      <RouterLink class="btn" to="/raids">View Raids</RouterLink>
    </header>

    <div class="grid">
      <article class="card">
        <header class="card__header">
          <h2>Your Characters</h2>
          <button class="btn btn--outline" @click="showCharacterForm = true">
            Add Character
          </button>
        </header>

        <p v-if="loadingCharacters" class="muted">Loading characters...</p>
        <p v-else-if="characters.length === 0" class="muted">
          You have not registered any characters yet.
        </p>
        <ul v-else class="list">
          <li v-for="character in characters" :key="character.id" class="list__item">
            <div>
              <strong>{{ character.name }}</strong>
              <span class="muted">Lv {{ character.level }} {{ character.class }}</span>
            </div>
            <span v-if="character.guild" class="tag">{{ character.guild.name }}</span>
          </li>
        </ul>
      </article>

      <article class="card">
        <header class="card__header">
          <h2>Recent Raid Attendance</h2>
        </header>
        <p class="muted">
          Attendance analytics will appear here as raid events are logged.
        </p>
      </article>
    </div>

    <CharacterModal
      v-if="showCharacterForm"
      :guilds="guilds"
      @close="showCharacterForm = false"
      @created="handleCharacterCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CharacterModal from '../components/CharacterModal.vue';
import { api, type GuildSummary } from '../services/api';

const characters = ref<any[]>([]);
const guilds = ref<GuildSummary[]>([]);
const loadingCharacters = ref(false);
const showCharacterForm = ref(false);

async function loadCharacters() {
  loadingCharacters.value = true;
  try {
    characters.value = await api.fetchUserCharacters();
  } finally {
    loadingCharacters.value = false;
  }
}

async function loadGuilds() {
  guilds.value = await api.fetchGuilds();
}

function handleCharacterCreated() {
  showCharacterForm.value = false;
  loadCharacters();
}

onMounted(() => {
  loadCharacters();
  loadGuilds();
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-header h1 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
}

.muted {
  color: #94a3b8;
}

.tag {
  background: rgba(96, 165, 250, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
