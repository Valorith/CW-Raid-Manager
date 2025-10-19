<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
        <p>Select a guild to view and manage scheduled raids.</p>
      </div>
    </header>

    <label class="selector">
      <span>Guild</span>
      <select v-model="selectedGuildId" @change="loadRaids">
        <option value="">Choose guild</option>
        <option v-for="guild in guilds" :key="guild.id" :value="guild.id">
          {{ guild.name }}
        </option>
      </select>
    </label>

    <div v-if="selectedGuildId">
      <p v-if="loadingRaids" class="muted">Loading raids…</p>
      <p v-else-if="raids.length === 0" class="muted">No raids scheduled.</p>

      <ul class="raid-list">
        <li v-for="raid in raids" :key="raid.id" class="raid-list__item">
          <div>
            <strong>{{ raid.name }}</strong>
            <span class="muted">
              {{ formatDate(raid.startTime) }} • {{ raid.targetZones.join(', ') }}
            </span>
          </div>
          <RouterLink class="btn btn--outline" :to="{ name: 'RaidDetail', params: { raidId: raid.id } }">
            Open
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { api, type GuildSummary, type RaidEventSummary } from '../services/api';

const guilds = ref<GuildSummary[]>([]);
const raids = ref<RaidEventSummary[]>([]);
const selectedGuildId = ref('');
const loadingRaids = ref(false);

async function loadGuilds() {
  guilds.value = await api.fetchGuilds();
  if (guilds.value.length === 1) {
    selectedGuildId.value = guilds.value[0].id;
    loadRaids();
  }
}

async function loadRaids() {
  if (!selectedGuildId.value) {
    raids.value = [];
    return;
  }

  loadingRaids.value = true;
  try {
    raids.value = await api.fetchRaidsForGuild(selectedGuildId.value);
  } finally {
    loadingRaids.value = false;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

onMounted(loadGuilds);
</script>

<style scoped>
.raids {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(320px, 100%);
}

.selector select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  padding: 0.75rem;
  color: #f8fafc;
}

.raid-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 1rem;
  border-radius: 1rem;
}

.muted {
  color: #94a3b8;
}
</style>
