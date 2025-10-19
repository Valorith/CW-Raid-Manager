<template>
  <section v-if="guild" class="guild-detail">
    <header class="section-header">
      <div>
        <h1>{{ guild.name }}</h1>
        <p class="muted">{{ guild.description || 'No description provided.' }}</p>
      </div>
      <button class="btn" @click="showRaidModal = true">Plan Raid</button>
    </header>

    <div class="grid">
      <article class="card">
        <header class="card__header">
          <h2>Members</h2>
        </header>
        <ul class="list">
          <li v-for="member in guild.members" :key="member.id" class="list__item">
            <div>
              <strong>{{ member.user.displayName }}</strong>
              <span class="muted">{{ roleLabels[member.role] }}</span>
            </div>
          </li>
        </ul>
      </article>

      <article class="card">
        <header class="card__header">
          <h2>Roster</h2>
        </header>
        <ul class="list">
          <li v-for="character in guild.characters" :key="character.id" class="list__item">
            <div>
              <strong>{{ character.name }}</strong>
              <span class="muted">Lv {{ character.level }} {{ character.class }}</span>
            </div>
            <span class="muted small">{{ character.user.displayName }}</span>
          </li>
        </ul>
      </article>
    </div>

    <section class="raids">
      <header class="section-header">
        <h2>Raid Schedule</h2>
        <RouterLink class="btn btn--outline" :to="{ name: 'Raids' }">View All Raids</RouterLink>
      </header>
      <p v-if="loadingRaids" class="muted">Loading raids…</p>
      <p v-else-if="raids.length === 0" class="muted">No raid events scheduled yet.</p>
      <ul class="raid-list">
        <li v-for="raid in raids" :key="raid.id" class="raid-list__item">
          <div>
            <strong>{{ raid.name }}</strong>
            <span class="muted">
              {{ formatDate(raid.startTime) }} • {{ raid.targetZones.join(', ') }}
            </span>
          </div>
          <RouterLink class="btn btn--outline" :to="{ name: 'RaidDetail', params: { raidId: raid.id } }">
            Manage
          </RouterLink>
        </li>
      </ul>
    </section>

    <RaidModal
      v-if="showRaidModal"
      :guild-id="guild.id"
      @close="showRaidModal = false"
      @created="handleRaidCreated"
    />
  </section>
  <p v-else class="muted">Loading guild…</p>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';
import { api, type GuildDetail, type RaidEventSummary } from '../services/api';

const route = useRoute();
const guildId = route.params.guildId as string;

const guild = ref<GuildDetail | null>(null);
const raids = ref<RaidEventSummary[]>([]);
const loadingRaids = ref(false);
const showRaidModal = ref(false);

const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member'
};

async function loadGuild() {
  guild.value = await api.fetchGuildDetail(guildId);
}

async function loadRaids() {
  loadingRaids.value = true;
  try {
    raids.value = await api.fetchRaidsForGuild(guildId);
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

function handleRaidCreated() {
  showRaidModal.value = false;
  loadRaids();
}

onMounted(() => {
  loadGuild();
  loadRaids();
});
</script>

<style scoped>
.guild-detail {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.raids {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.small {
  font-size: 0.85rem;
}
</style>
