<template>
  <section class="npc-respawn">
    <header class="section-header">
      <div class="header-content">
        <div class="header-title">
          <h1>NPC Respawn Tracker</h1>
          <p class="muted">Track NPC kills and anticipate respawn times</p>
        </div>
        <div class="header-actions">
          <RouterLink
            v-if="canManage"
            class="btn btn--primary"
            :to="{ name: 'GuildNpcManagement', params: { guildId } }"
          >
            Manage NPCs
          </RouterLink>
          <button
            class="btn btn--outline"
            :disabled="loading"
            @click="refreshData"
          >
            {{ loading ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="error" class="error-banner">
      {{ error }}
    </div>

    <div class="filters">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="search"
          class="input input--search"
          placeholder="Search NPCs..."
        />
      </div>
      <div class="filter-group filter-group--buttons">
        <button
          v-for="status in statusFilters"
          :key="status.value"
          :class="['filter-btn', { 'filter-btn--active': activeStatusFilter === status.value }]"
          @click="activeStatusFilter = status.value"
        >
          <span v-if="status.icon" class="filter-icon">{{ status.icon }}</span>
          {{ status.label }}
          <span class="filter-count">{{ getStatusCount(status.value) }}</span>
        </button>
      </div>
      <div class="filter-group">
        <select v-model="activeZoneFilter" class="input input--select">
          <option value="all">All Zones</option>
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading && npcs.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>Loading NPC data...</p>
    </div>

    <div v-else-if="filteredNpcs.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3>No NPCs Found</h3>
      <p class="muted">
        {{ npcs.length === 0
          ? 'Add NPCs to start tracking their respawn times.'
          : 'No NPCs match your current filters.' }}
      </p>
      <RouterLink
        v-if="canManage && npcs.length === 0"
        class="btn btn--primary"
        :to="{ name: 'GuildNpcManagement', params: { guildId } }"
      >
        Add NPCs
      </RouterLink>
    </div>

    <div v-else class="npc-table-container">
      <table class="npc-table">
        <thead>
          <tr>
            <th class="col-status">Status</th>
            <th class="col-name">NPC Name</th>
            <th class="col-zone">Zone</th>
            <th class="col-respawn">Respawn Timer</th>
            <th class="col-killed">Last Killed</th>
            <th class="col-loot">Loot</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="npc in filteredNpcs"
            :key="npc.id"
            :class="['npc-row', `npc-row--${npc.respawnStatus}`]"
          >
            <td class="col-status">
              <span :class="['status-badge', `status-badge--${npc.respawnStatus}`]">
                {{ getStatusLabel(npc.respawnStatus) }}
              </span>
            </td>
            <td class="col-name">
              <div class="npc-name-cell">
                <strong>{{ npc.npcName }}</strong>
                <a
                  v-if="npc.allaLink"
                  :href="npc.allaLink"
                  target="_blank"
                  rel="noopener"
                  class="alla-link"
                  title="View on Allakhazam"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </td>
            <td class="col-zone">
              <span class="zone-badge">{{ npc.zoneName ?? 'Unknown' }}</span>
            </td>
            <td class="col-respawn">
              <div v-if="npc.lastKill && npc.respawnMinMinutes !== null" class="respawn-timer">
                <div class="progress-bar-container">
                  <div
                    class="progress-bar"
                    :class="[`progress-bar--${npc.respawnStatus}`]"
                    :style="{ width: `${npc.progressPercent ?? 0}%` }"
                  ></div>
                </div>
                <div class="timer-labels">
                  <span v-if="npc.respawnStatus === 'down'" class="timer-countdown">
                    {{ formatTimeRemaining(npc.respawnMinTime) }}
                  </span>
                  <span v-else-if="npc.respawnStatus === 'window'" class="timer-window">
                    Window open
                    <span v-if="npc.respawnMaxTime" class="timer-max">
                      ({{ formatTimeRemaining(npc.respawnMaxTime) }} max)
                    </span>
                  </span>
                  <span v-else-if="npc.respawnStatus === 'up'" class="timer-up">
                    Should be up!
                  </span>
                </div>
                <div class="respawn-range muted">
                  {{ formatRespawnRange(npc.respawnMinMinutes, npc.respawnMaxMinutes) }}
                </div>
              </div>
              <span v-else class="muted">
                {{ npc.respawnMinMinutes !== null ? 'No kill recorded' : 'Unknown spawn time' }}
              </span>
            </td>
            <td class="col-killed">
              <div v-if="npc.lastKill" class="kill-info">
                <div class="kill-date">{{ formatKillDate(npc.lastKill.killedAt) }}</div>
                <div class="kill-time">{{ formatKillTime(npc.lastKill.killedAt) }}</div>
                <div v-if="npc.lastKill.killedByName" class="kill-by muted">
                  by {{ npc.lastKill.killedByName }}
                </div>
              </div>
              <span v-else class="muted">Never</span>
            </td>
            <td class="col-loot">
              <div v-if="npc.lootItems.length > 0" class="loot-items">
                <div
                  v-for="item in npc.lootItems.slice(0, 3)"
                  :key="item.id"
                  class="loot-item"
                  :title="item.itemName"
                >
                  <img
                    v-if="hasValidIconId(item.itemIconId)"
                    :src="getLootIconSrc(item.itemIconId)"
                    :alt="item.itemName"
                    class="loot-icon"
                    loading="lazy"
                  />
                  <span v-else class="loot-icon-placeholder">?</span>
                </div>
                <span v-if="npc.lootItems.length > 3" class="loot-more">
                  +{{ npc.lootItems.length - 3 }}
                </span>
              </div>
              <span v-else class="muted">-</span>
            </td>
            <td class="col-actions">
              <div class="action-buttons">
                <button
                  class="action-btn action-btn--kill"
                  title="Record Kill"
                  @click="openKillModal(npc)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  :class="['action-btn action-btn--notify', { 'action-btn--active': isSubscribed(npc.id) }]"
                  title="Toggle Notifications"
                  @click="toggleNotify(npc.id)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Kill Recording Modal -->
    <div v-if="showKillModal" class="modal-backdrop" @click.self="closeKillModal">
      <div class="modal">
        <header class="modal__header">
          <h3>Record Kill: {{ selectedNpc?.npcName }}</h3>
          <button class="modal__close" @click="closeKillModal">&times;</button>
        </header>
        <div class="modal__body">
          <div class="form-group">
            <label for="kill-date">Kill Date & Time</label>
            <input
              id="kill-date"
              v-model="killForm.killedAt"
              type="datetime-local"
              class="input"
            />
          </div>
          <div class="form-group">
            <label for="kill-by">Killed By (optional)</label>
            <input
              id="kill-by"
              v-model="killForm.killedByName"
              type="text"
              class="input"
              placeholder="Character name"
            />
          </div>
          <div class="form-group">
            <label for="kill-notes">Notes (optional)</label>
            <input
              id="kill-notes"
              v-model="killForm.notes"
              type="text"
              class="input"
              placeholder="Any additional notes"
            />
          </div>
        </div>
        <footer class="modal__actions">
          <button class="btn btn--outline" @click="closeKillModal">Cancel</button>
          <button
            class="btn btn--primary"
            :disabled="submittingKill"
            @click="submitKill"
          >
            {{ submittingKill ? 'Recording...' : 'Record Kill' }}
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNpcRespawnStore } from '../stores/npcRespawn';
import type { NpcRespawnTrackerEntry, NpcRespawnStatus } from '../services/api';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';

const route = useRoute();
const guildId = route.params.guildId as string;
const store = useNpcRespawnStore();

// State
const searchQuery = ref('');
const activeStatusFilter = ref<'all' | NpcRespawnStatus>('all');
const activeZoneFilter = ref('all');
const showKillModal = ref(false);
const selectedNpc = ref<NpcRespawnTrackerEntry | null>(null);
const submittingKill = ref(false);

const killForm = ref({
  killedAt: '',
  killedByName: '',
  notes: ''
});

// Computed
const loading = computed(() => store.loading);
const error = computed(() => store.error);
const npcs = computed(() => store.npcs);
const canManage = computed(() => store.canManage);

const zones = computed(() => {
  const uniqueZones = new Set(npcs.value.map(n => n.zoneName ?? 'Unknown').filter(Boolean));
  return Array.from(uniqueZones).sort();
});

const statusFilters = [
  { value: 'all' as const, label: 'All', icon: '' },
  { value: 'up' as const, label: 'Up', icon: '🟢' },
  { value: 'window' as const, label: 'Window', icon: '🟡' },
  { value: 'down' as const, label: 'Down', icon: '🔴' },
  { value: 'unknown' as const, label: 'Unknown', icon: '⚪' }
];

const filteredNpcs = computed(() => {
  let result = store.sortedNpcs;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(n =>
      n.npcName.toLowerCase().includes(query) ||
      (n.zoneName?.toLowerCase().includes(query) ?? false)
    );
  }

  // Filter by status
  if (activeStatusFilter.value !== 'all') {
    result = result.filter(n => n.respawnStatus === activeStatusFilter.value);
  }

  // Filter by zone
  if (activeZoneFilter.value !== 'all') {
    result = result.filter(n => (n.zoneName ?? 'Unknown') === activeZoneFilter.value);
  }

  return result;
});

// Methods
function getStatusCount(status: 'all' | NpcRespawnStatus): number {
  if (status === 'all') return npcs.value.length;
  return npcs.value.filter(n => n.respawnStatus === status).length;
}

function getStatusLabel(status: NpcRespawnStatus): string {
  const labels: Record<NpcRespawnStatus, string> = {
    up: 'UP',
    window: 'WINDOW',
    down: 'DOWN',
    unknown: '?'
  };
  return labels[status] ?? status;
}

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return '--';
  const target = new Date(isoString).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return 'Now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatRespawnRange(min: number | null, max: number | null): string {
  if (min === null) return 'Unknown';
  const minHours = Math.floor(min / 60);
  const minMins = min % 60;
  const minStr = minHours > 0 ? `${minHours}h ${minMins}m` : `${minMins}m`;

  if (max === null || max === min) return minStr;

  const maxHours = Math.floor(max / 60);
  const maxMins = max % 60;
  const maxStr = maxHours > 0 ? `${maxHours}h ${maxMins}m` : `${maxMins}m`;

  return `${minStr} - ${maxStr}`;
}

function formatKillDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(isoString));
}

function formatKillTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(isoString));
}

function isSubscribed(npcId: string): boolean {
  return store.subscribedNpcIds.has(npcId);
}

async function toggleNotify(npcId: string) {
  try {
    await store.toggleSubscription(guildId, npcId);
  } catch (err) {
    console.error('Failed to toggle subscription:', err);
  }
}

function openKillModal(npc: NpcRespawnTrackerEntry) {
  selectedNpc.value = npc;
  // Default to current time in local timezone
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  killForm.value = {
    killedAt: now.toISOString().slice(0, 16),
    killedByName: '',
    notes: ''
  };
  showKillModal.value = true;
}

function closeKillModal() {
  showKillModal.value = false;
  selectedNpc.value = null;
}

async function submitKill() {
  if (!selectedNpc.value || submittingKill.value) return;

  submittingKill.value = true;
  try {
    await store.recordKill(guildId, {
      npcDefinitionId: selectedNpc.value.id,
      killedAt: new Date(killForm.value.killedAt).toISOString(),
      killedByName: killForm.value.killedByName || null,
      notes: killForm.value.notes || null
    });
    closeKillModal();
  } catch (err: any) {
    alert(err?.response?.data?.message ?? err?.message ?? 'Failed to record kill');
  } finally {
    submittingKill.value = false;
  }
}

async function refreshData() {
  await store.fetchRespawnTracker(guildId, true);
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    store.fetchRespawnTracker(guildId),
    store.fetchSubscriptions(guildId)
  ]);
  store.startAutoRefresh(guildId);
});

onUnmounted(() => {
  store.stopAutoRefresh();
});

// Reset filters when leaving guild
watch(() => route.params.guildId, (newGuildId) => {
  if (newGuildId !== guildId) {
    searchQuery.value = '';
    activeStatusFilter.value = 'all';
    activeZoneFilter.value = 'all';
  }
});
</script>

<style scoped>
.npc-respawn {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.section-header {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8));
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem 2rem;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  text-align: center;
}

@media (min-width: 640px) {
  .header-content {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
  }
}

.header-title h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: linear-gradient(135deg, #f8fafc, #94a3b8);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}

.header-title p {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.error-banner {
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 0.75rem;
  padding: 1rem;
  color: #fca5a5;
  text-align: center;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
}

@media (min-width: 768px) {
  .filters {
    flex-direction: row;
    align-items: center;
  }
}

.filter-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-group--buttons {
  flex: 1;
  justify-content: center;
}

.input--search {
  min-width: 200px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  color: #f8fafc;
}

.input--search::placeholder {
  color: rgba(148, 163, 184, 0.7);
}

.input--select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  color: #f8fafc;
  min-width: 150px;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #cbd5e1;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  border-color: rgba(148, 163, 184, 0.5);
  color: #f8fafc;
}

.filter-btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  color: #f8fafc;
}

.filter-icon {
  font-size: 0.75rem;
}

.filter-count {
  background: rgba(15, 23, 42, 0.6);
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 1rem;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(148, 163, 184, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: rgba(148, 163, 184, 0.5);
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}

.npc-table-container {
  overflow-x: auto;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
}

.npc-table {
  width: 100%;
  border-collapse: collapse;
}

.npc-table th,
.npc-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.npc-table th {
  background: rgba(30, 41, 59, 0.6);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  font-weight: 600;
}

.npc-table th:first-child {
  border-top-left-radius: 1rem;
}

.npc-table th:last-child {
  border-top-right-radius: 1rem;
}

.npc-row {
  transition: background 0.15s ease;
}

.npc-row:hover {
  background: rgba(59, 130, 246, 0.08);
}

.npc-row--up {
  background: rgba(34, 197, 94, 0.05);
}

.npc-row--up:hover {
  background: rgba(34, 197, 94, 0.12);
}

.npc-row--window {
  background: rgba(250, 204, 21, 0.05);
}

.npc-row--window:hover {
  background: rgba(250, 204, 21, 0.12);
}

.col-status { width: 80px; text-align: center; }
.col-name { min-width: 150px; }
.col-zone { width: 120px; }
.col-respawn { min-width: 180px; }
.col-killed { width: 120px; }
.col-loot { width: 100px; }
.col-actions { width: 100px; text-align: center; }

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.status-badge--up {
  background: rgba(34, 197, 94, 0.25);
  border: 1px solid rgba(34, 197, 94, 0.5);
  color: #86efac;
}

.status-badge--window {
  background: rgba(250, 204, 21, 0.2);
  border: 1px solid rgba(250, 204, 21, 0.5);
  color: #fde047;
}

.status-badge--down {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.status-badge--unknown {
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #94a3b8;
}

.npc-name-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.npc-name-cell strong {
  color: #f1f5f9;
}

.alla-link {
  display: inline-flex;
  align-items: center;
  color: #64748b;
  transition: color 0.15s ease;
}

.alla-link:hover {
  color: #3b82f6;
}

.alla-link svg {
  width: 14px;
  height: 14px;
}

.zone-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 0.3rem;
  font-size: 0.75rem;
  color: #a5b4fc;
}

.respawn-timer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.progress-bar-container {
  height: 8px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.progress-bar--down {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

.progress-bar--window {
  background: linear-gradient(90deg, #eab308, #facc15);
  animation: pulse 2s ease-in-out infinite;
}

.progress-bar--up {
  background: linear-gradient(90deg, #22c55e, #4ade80);
  animation: glow 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px rgba(34, 197, 94, 0.5); }
  50% { box-shadow: 0 0 15px rgba(34, 197, 94, 0.8); }
}

.timer-labels {
  font-size: 0.85rem;
}

.timer-countdown {
  color: #fca5a5;
  font-weight: 600;
}

.timer-window {
  color: #fde047;
  font-weight: 600;
}

.timer-max {
  font-weight: 400;
  color: #94a3b8;
}

.timer-up {
  color: #86efac;
  font-weight: 600;
}

.respawn-range {
  font-size: 0.7rem;
}

.kill-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.kill-date {
  font-weight: 600;
  color: #e2e8f0;
}

.kill-time {
  font-size: 0.8rem;
  color: #94a3b8;
}

.kill-by {
  font-size: 0.75rem;
}

.loot-items {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.loot-item {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.loot-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.loot-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.8rem;
  color: #64748b;
}

.loot-more {
  font-size: 0.75rem;
  color: #64748b;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #f8fafc;
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.action-btn--kill:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
  color: #86efac;
}

.action-btn--notify.action-btn--active {
  background: rgba(250, 204, 21, 0.2);
  border-color: rgba(250, 204, 21, 0.5);
  color: #fde047;
}

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.modal__header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal__close:hover {
  color: #f8fafc;
}

.modal__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.6rem 0.9rem;
  color: #f8fafc;
  font-size: 0.95rem;
}

.input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.btn--primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--outline {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
}

.btn--outline:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.5);
}

.btn--outline:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.muted {
  color: #64748b;
}
</style>
