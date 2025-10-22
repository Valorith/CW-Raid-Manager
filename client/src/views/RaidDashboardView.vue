<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
        <p>Select a guild to view and manage scheduled raids.</p>
      </div>
      <button class="btn" :disabled="!selectedGuildId" @click="openRaidModal">New Raid</button>
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
        <li
          v-for="raid in raids"
          :key="raid.id"
          class="raid-list__item"
          role="button"
          tabindex="0"
          @click="openRaid(raid.id)"
          @keydown.enter.prevent="openRaid(raid.id)"
          @keydown.space.prevent="openRaid(raid.id)"
        >
          <div class="raid-info">
            <strong>{{ raid.name }}</strong>
            <span class="muted">
              ({{ formatDate(raid.startTime) }}) • {{ raid.targetZones.join(', ') }}
            </span>
          </div>
          <div class="raid-meta">
            <span :class="['badge', getRaidStatus(raid.id).variant]">
              {{ getRaidStatus(raid.id).label }}
            </span>
            <button class="btn btn--outline" @click.stop="openRaid(raid.id)">
              Open
            </button>
          </div>
        </li>
      </ul>
    </div>
    <RaidModal
      v-if="showRaidModal"
      :guild-id="selectedGuildId"
      @close="handleRaidClose"
      @created="handleRaidCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';

import { api, type GuildSummary, type RaidEventSummary } from '../services/api';

type RaidStatusVariant = 'badge--neutral' | 'badge--positive' | 'badge--negative';
type RaidStatusBadge = { label: string; variant: RaidStatusVariant };

const guilds = ref<GuildSummary[]>([]);
const raids = ref<RaidEventSummary[]>([]);
const raidStatus = computed(() => {
  const map = new Map<string, RaidStatusBadge>();

  for (const raid of raids.value) {
    const events = raid.attendance ?? [];
    const latest = events.reduce<(typeof events)[number] | null>((current, event) => {
      if (!current) {
        return event;
      }

      return new Date(event.createdAt) > new Date(current.createdAt) ? event : current;
    }, null);

    let label: string;
    let variant: RaidStatusVariant;

    if (latest?.eventType === 'RESTART') {
      label = 'Restarted';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'START') {
      label = 'Started';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'END') {
      label = 'Ended';
      variant = 'badge--negative';
    } else if (raid.startedAt && !raid.endedAt) {
      label = 'Started';
      variant = 'badge--positive';
    } else if (raid.startedAt && raid.endedAt) {
      label = 'Ended';
      variant = 'badge--negative';
    } else {
      label = 'Planned';
      variant = 'badge--neutral';
    }

    map.set(raid.id, { label, variant });
  }

  return map;
});

const selectedGuildId = ref('');
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const router = useRouter();

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


function openRaidModal() {
  if (!selectedGuildId.value) {
    return;
  }
  showRaidModal.value = true;
}

function handleRaidCreated() {
  showRaidModal.value = false;
  loadRaids();
}

function handleRaidClose() {
  showRaidModal.value = false;
}

function getRaidStatus(raidId: string) {
  const status = raidStatus.value.get(raidId);
  return status ?? { label: 'Planned', variant: 'badge--neutral' };
}

function openRaid(raidId: string) {
  router.push({ name: 'RaidDetail', params: { raidId } });
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
  border: 1px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, border-color 0.2s ease;
}

.raid-list__item:hover,
.raid-list__item:focus {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
  outline: none;
}


.raid-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.muted {
  color: #94a3b8;
}

.btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  border: none;
  border-radius: 0.5rem;
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

</style>
