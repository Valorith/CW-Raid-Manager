<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
      </div>
      <button
        v-if="canCreateRaid && selectedGuildId"
        class="btn"
        @click="openRaidModal"
      >
        New Raid
      </button>
    </header>

    <div v-if="selectedGuildId">
      <p v-if="loadingRaids" class="muted">Loading raids…</p>

      <div v-else>
        <div class="tabs">
          <button
            :class="['tab', { 'tab--active': activeTab === 'active' }]"
            type="button"
            @click="activeTab = 'active'"
          >
            Active
          </button>
          <button
            :class="['tab', { 'tab--active': activeTab === 'history' }]"
            type="button"
            @click="activeTab = 'history'"
          >
            History
          </button>
        </div>

        <p v-if="displayedRaids.length === 0" class="muted empty-state">{{ emptyStateMessage }}</p>

        <ul v-else class="raid-list">
          <li
            v-for="raid in displayedRaids"
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
                ({{ formatDate(raid.startTime) }}) • {{ formatTargetZones(raid.targetZones) }}
              </span>
            </div>
            <div class="raid-meta">
              <span :class="['badge', getRaidStatus(raid.id).variant]">
                {{ getRaidStatus(raid.id).label }}
              </span>
              <button
                v-if="canCopyRaid(raid)"
                class="copy-button"
                type="button"
                :disabled="copyingRaidId === raid.id"
                @click.stop="copyRaid(raid)"
                title="Copy raid"
              >
                <span aria-hidden="true">📄</span>
                <span class="sr-only">Copy raid</span>
              </button>
              <button class="btn btn--outline" @click.stop="openRaid(raid.id)">
                Open
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
    <div v-else-if="hasGuildMembership" class="empty-state empty-state--member">
      You do not currently have access to any guild raids.
    </div>
    <div v-else class="empty-state">Join a guild to plan and review raids.</div>
    <RaidModal
      v-if="showRaidModal"
      :guild-id="selectedGuildId"
      :default-start-time="selectedGuildDefaults?.start ?? null"
      :default-end-time="selectedGuildDefaults?.end ?? null"
      @close="handleRaidClose"
      @created="handleRaidCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';

import { api, type RaidEventSummary } from '../services/api';
import type { GuildRole } from '../services/types';
import { useAuthStore } from '../stores/auth';

type RaidStatusVariant = 'badge--neutral' | 'badge--positive' | 'badge--negative';
type RaidStatusBadge = { label: string; variant: RaidStatusVariant };

const raids = ref<RaidEventSummary[]>([]);
const selectedGuildPermissions = ref<{ canManage: boolean; role: GuildRole } | null>(null);
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

    const ended = raidHasEnded(raid);
    const started = raidHasStarted(raid);

    if (latest?.eventType === 'RESTART') {
      label = 'Restarted';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'START' && started) {
      label = 'Started';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'END' || ended) {
      label = 'Ended';
      variant = 'badge--negative';
    } else if (started) {
      label = 'Started';
      variant = 'badge--positive';
    } else {
      label = 'Planned';
      variant = 'badge--neutral';
    }

    map.set(raid.id, { label, variant });
  }

  return map;
});

const authStore = useAuthStore();
const selectedGuildId = ref('');
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const router = useRouter();
const activeTab = ref<'active' | 'history'>('active');
const copyingRaidId = ref<string | null>(null);
const guildTimingDefaults = ref<Record<
  string,
  { start: string | null; end: string | null }
>>({});
const selectedGuildDefaults = computed(() => {
  if (!selectedGuildId.value) {
    return null;
  }
  return guildTimingDefaults.value[selectedGuildId.value] ?? null;
});

async function loadRaids() {
  if (!selectedGuildId.value) {
    raids.value = [];
    selectedGuildPermissions.value = null;
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
    return;
  }

  loadingRaids.value = true;
  activeTab.value = 'active';
  try {
    const response = await api.fetchRaidsForGuild(selectedGuildId.value);
    raids.value = response.raids;
    selectedGuildPermissions.value = response.permissions ?? null;
    await ensureGuildDefaults(selectedGuildId.value);
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } finally {
    loadingRaids.value = false;
  }
}

const canCreateRaid = computed(() => Boolean(selectedGuildPermissions.value?.canManage));
const hasGuildMembership = computed(() => (authStore.user?.guilds?.length ?? 0) > 0);

const activeRaids = computed(() =>
  raids.value
    .filter((raid) => !isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
);
const historyRaids = computed(() =>
  raids.value
    .filter((raid) => isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
);

const displayedRaids = computed(() =>
  activeTab.value === 'active' ? activeRaids.value : historyRaids.value
);

const emptyStateMessage = computed(() =>
  activeTab.value === 'active'
    ? 'No active raids scheduled.'
    : 'No completed raids found.'
);


function openRaidModal() {
  if (!selectedGuildId.value || !canCreateRaid.value) {
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
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown start';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatTargetZones(zones: unknown): string {
  if (!Array.isArray(zones)) {
    return 'Unknown Target';
  }

  const labels = zones
    .map((zone) => (typeof zone === 'string' ? zone.trim() : zone))
    .filter((zone): zone is string => typeof zone === 'string' && zone.length > 0);

  return labels.length > 0 ? labels.join(', ') : 'Unknown Target';
}

async function ensureGuildDefaults(guildId: string) {
  if (!guildId || guildTimingDefaults.value[guildId]) {
    return;
  }
  try {
    const detail = await api.fetchGuildDetail(guildId);
    guildTimingDefaults.value[guildId] = {
      start: detail.defaultRaidStartTime ?? null,
      end: detail.defaultRaidEndTime ?? null
    };
  } catch (error) {
    console.warn('Failed to load guild defaults for raid planning', error);
  }
}

function canCopyRaid(raid: RaidEventSummary) {
  if (typeof raid.permissions?.canManage === 'boolean') {
    return raid.permissions.canManage;
  }
  return Boolean(selectedGuildPermissions.value?.canManage);
}

async function copyRaid(raid: RaidEventSummary) {
  if (!canCopyRaid(raid) || copyingRaidId.value || !selectedGuildId.value) {
    return;
  }
  copyingRaidId.value = raid.id;
  try {
    await api.createRaidEvent({
      guildId: selectedGuildId.value,
      name: raid.name,
      startTime: raid.startTime,
      targetZones: ensureTargets(raid.targetZones),
      targetBosses: ensureTargets(raid.targetBosses),
      notes: raid.notes ?? undefined
    });
    await loadRaids();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    window.alert('Unable to copy raid. Please try again.');
    console.warn('Failed to copy raid', error);
  } finally {
    copyingRaidId.value = null;
  }
}

function ensureTargets(targets: RaidEventSummary['targetZones']) {
  if (Array.isArray(targets) && targets.length > 0) {
    return targets;
  }
  return ['Unspecified Target'];
}

function raidHasEnded(raid: RaidEventSummary) {
  if (!raid.endedAt) {
    return false;
  }
  return new Date(raid.endedAt).getTime() <= Date.now();
}

function raidHasStarted(raid: RaidEventSummary) {
  if (!raid.startedAt) {
    return false;
  }
  return new Date(raid.startedAt).getTime() <= Date.now();
}

function isHistoryRaid(raid: RaidEventSummary) {
  if (raidHasEnded(raid)) {
    return true;
  }

  const start = new Date(raid.startTime);
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return start <= twoDaysAgo;
}

watch(
  () => authStore.primaryGuild,
  (guild) => {
    const newId = guild?.id ?? '';
    if (newId !== selectedGuildId.value) {
      selectedGuildId.value = newId;
      if (selectedGuildId.value) {
        loadRaids();
      } else {
        raids.value = [];
        selectedGuildPermissions.value = null;
      }
    } else if (newId) {
      loadRaids();
    }
  },
  { immediate: true }
);

watch(selectedGuildId, (guildId) => {
  activeTab.value = 'active';
  if (guildId) {
    ensureGuildDefaults(guildId);
  }
});
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

.tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  margin: 1.5rem auto;
}

.tab {
  padding: 0.55rem 1.4rem;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  color: #cbd5f5;
  font-size: 0.9rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tab:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(148, 163, 184, 0.45);
  color: #e0f2fe;
}

.tab--active {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
  transform: translateY(-1px);
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  margin: 2rem 0;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
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

.copy-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: #cbd5f5;
  border-radius: 0.5rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.copy-button:hover:not(:disabled),
.copy-button:focus-visible {
  color: #e0f2fe;
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.15);
}

.copy-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
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
