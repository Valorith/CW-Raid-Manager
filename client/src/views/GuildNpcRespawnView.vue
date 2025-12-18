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

    <div class="expansion-filters">
      <label class="raid-filter-checkbox" title="Show only raid targets">
        <input
          v-model="raidOnlyFilter"
          type="checkbox"
          class="raid-checkbox-input"
        />
        <span class="raid-filter-badge">RAID</span>
        <span class="raid-filter-text">Only</span>
      </label>
      <span class="filter-divider"></span>
      <div v-if="hasInstanceNpcs" class="variant-filters">
        <button
          :class="['variant-filter-btn', { 'variant-filter-btn--active': activeVariantFilter === 'all' }]"
          @click="activeVariantFilter = 'all'"
        >
          All
        </button>
        <button
          :class="['variant-filter-btn variant-filter-btn--overworld', { 'variant-filter-btn--active': activeVariantFilter === 'overworld' }]"
          @click="activeVariantFilter = 'overworld'"
          title="Show only Overworld entries"
        >
          <span class="variant-filter-badge variant-filter-badge--overworld">OW</span>
          Overworld
        </button>
        <button
          :class="['variant-filter-btn variant-filter-btn--instance', { 'variant-filter-btn--active': activeVariantFilter === 'instance' }]"
          @click="activeVariantFilter = 'instance'"
          title="Show only Instance entries"
        >
          <span class="variant-filter-badge variant-filter-badge--instance">INST</span>
          Instance
        </button>
      </div>
      <span v-if="hasInstanceNpcs" class="filter-divider"></span>
      <button
        v-if="expansions.length > 0"
        :class="['expansion-filter-btn', { 'expansion-filter-btn--active': activeExpansionFilter === 'all' }]"
        @click="activeExpansionFilter = 'all'"
      >
        All Expansions
      </button>
      <button
        v-for="exp in expansions"
        :key="exp.key"
        :class="['expansion-filter-btn expansion-filter-btn--icon-only', { 'expansion-filter-btn--active': activeExpansionFilter === exp.shortName }]"
        :title="exp.name"
        @click="activeExpansionFilter = exp.shortName"
      >
        <img :src="exp.icon" :alt="exp.shortName" class="expansion-filter-icon" />
      </button>
    </div>

    <!-- Pending Clarifications Section -->
    <div v-if="pendingClarifications.length > 0" class="pending-clarifications">
      <header class="pending-clarifications__header">
        <h3>
          <span class="pending-icon">⚠️</span>
          Pending Kill Clarifications
          <span class="pending-count">{{ pendingClarifications.length }}</span>
        </h3>
        <p class="muted small">Double-click to clarify instance/overworld status</p>
      </header>
      <div class="pending-clarifications__list">
        <div
          v-for="clarification in paginatedClarifications"
          :key="clarification.id"
          class="pending-item"
          @dblclick="openClarificationModal(clarification)"
        >
          <div class="pending-item__info">
            <strong>{{ clarification.npcName }}</strong>
            <span class="pending-item__type">
              {{ clarification.clarificationType === 'instance' ? 'Instance/Overworld?' : 'Zone?' }}
            </span>
          </div>
          <div class="pending-item__details">
            <span class="pending-item__time">{{ formatClarificationTime(clarification.killedAt) }}</span>
            <span v-if="clarification.killedByName" class="pending-item__killer">
              by {{ clarification.killedByName }}
            </span>
            <span v-if="clarification.raidName" class="pending-item__raid">
              from {{ clarification.raidName }}
            </span>
          </div>
          <div class="pending-item__actions">
            <button
              class="btn btn--small btn--primary"
              @click.stop="openClarificationModal(clarification)"
            >
              Clarify
            </button>
            <button
              v-if="canManage"
              class="btn btn--small btn--outline btn--danger"
              @click.stop="dismissClarification(clarification)"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
      <!-- Clarifications Pagination -->
      <div v-if="clarificationTotalPages > 1" class="clarifications-pagination">
        <button
          class="pagination-btn pagination-btn--small"
          :disabled="clarificationCurrentPage === 1"
          @click="clarificationCurrentPage = 1"
        >
          First
        </button>
        <button
          class="pagination-btn pagination-btn--small"
          :disabled="clarificationCurrentPage === 1"
          @click="clarificationCurrentPage--"
        >
          Prev
        </button>
        <span class="pagination-info pagination-info--small">
          {{ clarificationCurrentPage }} / {{ clarificationTotalPages }}
        </span>
        <button
          class="pagination-btn pagination-btn--small"
          :disabled="clarificationCurrentPage === clarificationTotalPages"
          @click="clarificationCurrentPage++"
        >
          Next
        </button>
        <button
          class="pagination-btn pagination-btn--small"
          :disabled="clarificationCurrentPage === clarificationTotalPages"
          @click="clarificationCurrentPage = clarificationTotalPages"
        >
          Last
        </button>
      </div>
    </div>

    <div v-if="loading && npcs.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>Loading NPC data...</p>
    </div>

    <div v-else-if="paginatedNpcs.length === 0" class="empty-state">
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
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="npc in paginatedNpcs"
            :key="`${npc.id}-${npc.isInstanceVariant}`"
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
                <span
                  v-if="npc.hasInstanceVersion"
                  :class="['variant-badge', npc.isInstanceVariant ? 'variant-badge--instance' : 'variant-badge--overworld']"
                  :title="npc.isInstanceVariant ? 'Instance version' : 'Overworld version'"
                >
                  {{ npc.isInstanceVariant ? 'INSTANCE' : 'OVERWORLD' }}
                </span>
                <span v-if="npc.isRaidTarget" class="raid-badge" title="Raid Target">RAID</span>
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
              <div class="zone-cell">
                <span class="zone-badge">{{ npc.zoneName ?? 'Unknown' }}</span>
                <img
                  v-if="getCachedExpansionForZone(npc.zoneName)"
                  :src="getCachedExpansionForZone(npc.zoneName)?.icon"
                  :alt="getCachedExpansionForZone(npc.zoneName)?.shortName"
                  :title="getCachedExpansionForZone(npc.zoneName)?.name"
                  class="expansion-icon"
                />
              </div>
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
                    <span class="countdown-time">{{ formatTimeRemaining(npc.respawnMinTime) }}</span>
                    <span class="countdown-label">until spawn window opens</span>
                  </span>
                  <span v-else-if="npc.respawnStatus === 'window'" class="timer-window">
                    <span class="countdown-time countdown-time--window">{{ formatTimeRemaining(npc.respawnMaxTime) }}</span>
                    <span class="countdown-label">until spawn window closes</span>
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
                  v-if="npc.respawnStatus !== 'up'"
                  class="action-btn action-btn--spawn"
                  title="It's Up! - Confirm NPC has spawned"
                  @click="confirmSpawnUp(npc)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
                <button
                  v-if="npc.respawnStatus !== 'down'"
                  class="action-btn action-btn--down"
                  title="It's Down! - Mark NPC as killed"
                  @click="confirmMarkDown(npc)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12l7 7 7-7" />
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

    <!-- Pagination Controls -->
    <div v-if="totalPages > 1" class="pagination">
      <button
        class="pagination-btn"
        :disabled="currentPage === 1"
        @click="currentPage = 1"
      >
        First
      </button>
      <button
        class="pagination-btn"
        :disabled="currentPage === 1"
        @click="currentPage--"
      >
        Prev
      </button>
      <span class="pagination-info">
        Page {{ currentPage }} of {{ totalPages }} ({{ filteredNpcs.length }} NPCs)
      </span>
      <button
        class="pagination-btn"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
      >
        Next
      </button>
      <button
        class="pagination-btn"
        :disabled="currentPage === totalPages"
        @click="currentPage = totalPages"
      >
        Last
      </button>
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
          <div v-if="selectedNpc?.hasInstanceVersion" class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input
                id="kill-instance"
                v-model="killForm.isInstance"
                type="checkbox"
                class="checkbox-input"
              />
              <span class="checkbox-text">Instance Kill</span>
            </label>
            <p class="checkbox-hint">
              Check this if the kill occurred in an instance (e.g., Agent of Change).
              Leave unchecked for overworld kills.
            </p>
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

    <!-- Clarification Modal -->
    <div v-if="showClarificationModal && selectedClarification" class="modal-backdrop" @click.self="closeClarificationModal">
      <div class="modal clarification-modal">
        <header class="modal__header">
          <h3>
            {{ selectedClarification.clarificationType === 'instance'
              ? 'Instance Kill Clarification'
              : 'Zone Clarification Required' }}
          </h3>
          <button class="modal__close" @click="closeClarificationModal">&times;</button>
        </header>
        <div class="modal__body">
          <div class="clarification-details">
            <p class="clarification-npc-name">{{ selectedClarification.npcName }}</p>
            <p class="clarification-time muted">
              Killed at {{ formatClarificationTime(selectedClarification.killedAt) }}
              <span v-if="selectedClarification.killedByName">
                by {{ selectedClarification.killedByName }}
              </span>
            </p>
            <p v-if="selectedClarification.raidName" class="clarification-raid muted">
              From raid: {{ selectedClarification.raidName }}
            </p>
          </div>

          <!-- Instance Clarification -->
          <div v-if="selectedClarification.clarificationType === 'instance'" class="clarification-options">
            <p class="clarification-prompt">Was this kill in an instance or overworld?</p>
            <div class="clarification-toggle">
              <label class="toggle-option" :class="{ 'toggle-option--active': !clarificationForm.isInstance }">
                <input
                  v-model="clarificationForm.isInstance"
                  type="radio"
                  :value="false"
                  name="instance-toggle"
                />
                <span class="toggle-label">Overworld</span>
              </label>
              <label class="toggle-option" :class="{ 'toggle-option--active': clarificationForm.isInstance }">
                <input
                  v-model="clarificationForm.isInstance"
                  type="radio"
                  :value="true"
                  name="instance-toggle"
                />
                <span class="toggle-label">Instance</span>
              </label>
            </div>
          </div>

          <!-- Zone Clarification -->
          <div v-else-if="selectedClarification.clarificationType === 'zone'" class="clarification-options">
            <p class="clarification-prompt">Which zone was this NPC killed in?</p>
            <select v-model="clarificationForm.npcDefinitionId" class="input input--select zone-select">
              <option
                v-for="option in (selectedClarification.zoneOptions ?? [])"
                :key="option.npcDefinitionId"
                :value="option.npcDefinitionId"
              >
                {{ option.zoneName ?? 'Unknown Zone' }}
              </option>
            </select>
          </div>
        </div>
        <footer class="modal__actions">
          <button class="btn btn--outline" @click="closeClarificationModal">Cancel</button>
          <button
            class="btn btn--primary"
            :disabled="submittingClarification"
            @click="submitClarification"
          >
            {{ submittingClarification ? 'Saving...' : 'Confirm Kill' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Error Modal -->
    <ErrorModal />

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNpcRespawnStore } from '../stores/npcRespawn';
import { api, type NpcRespawnTrackerEntry, type NpcRespawnStatus, type PendingNpcKillClarification } from '../services/api';
import { getExpansionForZone } from '../data/expansionZones';
import ErrorModal from '../components/ErrorModal.vue';
import { useErrorModal } from '../composables/useErrorModal';

const route = useRoute();
const guildId = route.params.guildId as string;
const store = useNpcRespawnStore();
const { showErrorFromException } = useErrorModal();

// State
const searchQuery = ref('');
const activeStatusFilter = ref<'all' | NpcRespawnStatus>('all');
const activeZoneFilter = ref('all');
const activeExpansionFilter = ref('all');
const raidOnlyFilter = ref(false);
const activeVariantFilter = ref<'all' | 'overworld' | 'instance'>('all');
const showKillModal = ref(false);
const selectedNpc = ref<NpcRespawnTrackerEntry | null>(null);
const submittingKill = ref(false);
const currentPage = ref(1);
const itemsPerPage = 10;

const killForm = ref({
  killedAt: '',
  killedByName: '',
  notes: '',
  isInstance: false
});

// Pending clarifications state
const pendingClarifications = ref<PendingNpcKillClarification[]>([]);
const loadingClarifications = ref(false);
const showClarificationModal = ref(false);
const selectedClarification = ref<PendingNpcKillClarification | null>(null);
const clarificationForm = ref({
  npcDefinitionId: '',
  isInstance: false
});
const submittingClarification = ref(false);
const clarificationCurrentPage = ref(1);
const clarificationsPerPage = 5;

// Computed
const loading = computed(() => store.loading);
const error = computed(() => store.error);
const npcs = computed(() => store.npcs);
const canManage = computed(() => store.canManage);

const zones = computed(() => {
  const uniqueZones = new Set(npcs.value.map(n => n.zoneName ?? 'Unknown').filter(Boolean));
  return Array.from(uniqueZones).sort();
});

// Memoize expansion lookups by zone name to avoid repeated function calls
const expansionByZone = computed(() => {
  const cache = new Map<string | null, ReturnType<typeof getExpansionForZone>>();
  for (const npc of npcs.value) {
    if (!cache.has(npc.zoneName)) {
      cache.set(npc.zoneName, getExpansionForZone(npc.zoneName));
    }
  }
  return cache;
});

// Helper to get expansion from cache (used in template and computed properties)
function getCachedExpansionForZone(zoneName: string | null | undefined) {
  return expansionByZone.value.get(zoneName ?? null) ?? getExpansionForZone(zoneName ?? null);
}

const expansions = computed(() => {
  const expansionMap = new Map<string, { key: string; name: string; shortName: string; icon: string }>();

  for (const npc of npcs.value) {
    const expansion = expansionByZone.value.get(npc.zoneName);
    if (expansion && !expansionMap.has(expansion.shortName)) {
      expansionMap.set(expansion.shortName, {
        key: expansion.shortName,
        name: expansion.name,
        shortName: expansion.shortName,
        icon: expansion.icon
      });
    }
  }

  return Array.from(expansionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const hasInstanceNpcs = computed(() => {
  return npcs.value.some(n => n.hasInstanceVersion);
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

  // Filter by expansion (use cached expansion lookups)
  if (activeExpansionFilter.value !== 'all') {
    result = result.filter(n => {
      const expansion = expansionByZone.value.get(n.zoneName);
      return expansion?.shortName === activeExpansionFilter.value;
    });
  }

  // Filter by raid targets only
  if (raidOnlyFilter.value) {
    result = result.filter(n => n.isRaidTarget);
  }

  // Filter by variant (overworld/instance)
  if (activeVariantFilter.value === 'overworld') {
    result = result.filter(n => !n.isInstanceVariant);
  } else if (activeVariantFilter.value === 'instance') {
    result = result.filter(n => n.isInstanceVariant);
  }

  return result;
});

const totalPages = computed(() => Math.ceil(filteredNpcs.value.length / itemsPerPage));

const paginatedNpcs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredNpcs.value.slice(start, start + itemsPerPage);
});

// Pending clarifications pagination
const clarificationTotalPages = computed(() => Math.ceil(pendingClarifications.value.length / clarificationsPerPage));

const paginatedClarifications = computed(() => {
  const start = (clarificationCurrentPage.value - 1) * clarificationsPerPage;
  return pendingClarifications.value.slice(start, start + clarificationsPerPage);
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
  // Use Date.parse() instead of new Date().getTime() to avoid creating Date objects
  const target = Date.parse(isoString);
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return 'Now';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  // Always include seconds for a live countdown feel
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatRespawnRange(min: number | null, max: number | null): string {
  if (min === null) return 'Unknown';

  const formatTime = (totalMinutes: number) => {
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;

    if (days > 0) {
      if (hours > 0 && mins > 0) return `${days}d ${hours}h ${mins}m`;
      if (hours > 0) return `${days}d ${hours}h`;
      if (mins > 0) return `${days}d ${mins}m`;
      return `${days}d`;
    }
    if (hours > 0) {
      if (mins > 0) return `${hours}h ${mins}m`;
      return `${hours}h`;
    }
    return `${mins}m`;
  };

  const minStr = formatTime(min);
  if (max === null || max === min) return minStr;
  return `${minStr} - ${formatTime(max)}`;
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
    notes: '',
    // Default isInstance based on whether we clicked on an instance variant row
    isInstance: npc.isInstanceVariant ?? false
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
      notes: killForm.value.notes || null,
      isInstance: killForm.value.isInstance
    });
    closeKillModal();
  } catch (err: any) {
    showErrorFromException(err, 'Failed to record kill');
  } finally {
    submittingKill.value = false;
  }
}

async function confirmSpawnUp(npc: NpcRespawnTrackerEntry) {
  const variantLabel = npc.hasInstanceVersion
    ? (npc.isInstanceVariant ? ' (Instance)' : ' (Overworld)')
    : '';
  const confirmed = confirm(
    `Confirm that "${npc.npcName}"${variantLabel} has spawned?\n\nThis will mark the NPC as Up.`
  );

  if (!confirmed) return;

  try {
    // Delete existing kill record if present
    if (npc.lastKill) {
      await store.deleteKillRecord(guildId, npc.lastKill.id);
    }

    // Create a backdated kill record to show as "Up"
    // Use the max respawn time + 1 minute, fallback to min time, or default to 24 hours if no respawn configured
    // This must match the server's logic which uses: respawnMaxTime ?? respawnMinTime
    const respawnMinutes = npc.respawnMaxMinutes ?? npc.respawnMinMinutes ?? (24 * 60);
    const respawnMs = (respawnMinutes + 1) * 60 * 1000;
    const oldKillTime = new Date(Date.now() - respawnMs);

    await store.recordKill(guildId, {
      npcDefinitionId: npc.id,
      killedAt: oldKillTime.toISOString(),
      killedByName: null,
      notes: 'Marked as spawned via "It\'s Up!" button',
      isInstance: npc.isInstanceVariant ?? false,
      triggerWebhook: false
    });
  } catch (err: any) {
    showErrorFromException(err, 'Failed to mark as spawned');
  }
}

async function confirmMarkDown(npc: NpcRespawnTrackerEntry) {
  const variantLabel = npc.hasInstanceVersion
    ? (npc.isInstanceVariant ? ' (Instance)' : ' (Overworld)')
    : '';
  const confirmed = confirm(
    `Mark "${npc.npcName}"${variantLabel} as killed (Down)?\n\nThis will start the respawn timer.`
  );

  if (!confirmed) return;

  try {
    // If there's an existing kill record, delete it first to avoid duplicates
    if (npc.lastKill) {
      await store.deleteKillRecord(guildId, npc.lastKill.id);
    }

    // Record a new kill with current timestamp
    await store.recordKill(guildId, {
      npcDefinitionId: npc.id,
      killedAt: new Date().toISOString(),
      killedByName: null,
      notes: 'Marked as killed via "It\'s Down!" button',
      isInstance: npc.isInstanceVariant ?? false,
      triggerWebhook: false
    });
  } catch (err: any) {
    showErrorFromException(err, 'Failed to mark as killed');
  }
}

async function refreshData() {
  await store.fetchRespawnTracker(guildId, true);
  await loadPendingClarifications();
}

// Pending clarifications methods
async function loadPendingClarifications() {
  loadingClarifications.value = true;
  try {
    const response = await api.fetchPendingNpcKillClarifications(guildId);
    pendingClarifications.value = response.clarifications;
    // Reset to page 1 if current page is beyond the new total
    const newTotalPages = Math.ceil(response.clarifications.length / clarificationsPerPage);
    if (clarificationCurrentPage.value > newTotalPages && newTotalPages > 0) {
      clarificationCurrentPage.value = newTotalPages;
    } else if (newTotalPages === 0) {
      clarificationCurrentPage.value = 1;
    }
  } catch (err) {
    console.error('Failed to load pending clarifications:', err);
  } finally {
    loadingClarifications.value = false;
  }
}

function openClarificationModal(clarification: PendingNpcKillClarification) {
  selectedClarification.value = clarification;
  if (clarification.clarificationType === 'instance' && clarification.npcDefinitionId) {
    clarificationForm.value = {
      npcDefinitionId: clarification.npcDefinitionId,
      isInstance: false
    };
  } else if (clarification.clarificationType === 'zone' && clarification.zoneOptions?.length) {
    clarificationForm.value = {
      npcDefinitionId: clarification.zoneOptions[0].npcDefinitionId,
      isInstance: false
    };
  }
  showClarificationModal.value = true;
}

function closeClarificationModal() {
  showClarificationModal.value = false;
  selectedClarification.value = null;
}

async function submitClarification() {
  if (!selectedClarification.value || submittingClarification.value) return;

  submittingClarification.value = true;
  try {
    await api.resolvePendingNpcKillClarification(
      guildId,
      selectedClarification.value.id,
      {
        npcDefinitionId: clarificationForm.value.npcDefinitionId,
        isInstance: clarificationForm.value.isInstance
      }
    );
    closeClarificationModal();
    // Refresh data to show the new kill record
    await Promise.all([
      store.fetchRespawnTracker(guildId, true),
      loadPendingClarifications()
    ]);
  } catch (err: any) {
    showErrorFromException(err, 'Failed to resolve clarification');
  } finally {
    submittingClarification.value = false;
  }
}

async function dismissClarification(clarification: PendingNpcKillClarification) {
  if (!confirm(`Dismiss this kill clarification for ${clarification.npcName}? The kill will not be recorded.`)) {
    return;
  }
  try {
    await api.dismissPendingNpcKillClarification(guildId, clarification.id);
    await loadPendingClarifications();
  } catch (err: any) {
    showErrorFromException(err, 'Failed to dismiss clarification');
  }
}

function formatClarificationTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    store.fetchRespawnTracker(guildId),
    store.fetchSubscriptions(guildId),
    loadPendingClarifications()
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
    currentPage.value = 1;
  }
});

// Reset page when filters change
watch([searchQuery, activeStatusFilter, activeZoneFilter, activeExpansionFilter, raidOnlyFilter, activeVariantFilter], () => {
  currentPage.value = 1;
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

.expansion-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
}

.expansion-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.expansion-filter-btn:hover {
  border-color: rgba(148, 163, 184, 0.5);
  color: #f8fafc;
}

.expansion-filter-btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  color: #f8fafc;
}

.expansion-filter-btn--icon-only {
  padding: 0.15rem;
  width: auto;
  height: auto;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 0.5rem;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}

.expansion-filter-btn--icon-only:hover {
  background: transparent;
  opacity: 0.85;
  transform: scale(1.05);
}

.expansion-filter-btn--icon-only.expansion-filter-btn--active {
  background: transparent;
  border-color: rgba(59, 130, 246, 0.7);
  opacity: 1;
}

.expansion-filter-icon {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.raid-filter-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.raid-filter-checkbox:hover {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
}

.raid-filter-checkbox:has(.raid-checkbox-input:checked) {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.raid-checkbox-input {
  width: 14px;
  height: 14px;
  accent-color: #ef4444;
  cursor: pointer;
}

.raid-filter-badge {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.raid-filter-text {
  font-weight: 500;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: rgba(148, 163, 184, 0.3);
  margin: 0 0.25rem;
}

.variant-filters {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.variant-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #cbd5e1;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.variant-filter-btn:hover {
  border-color: rgba(148, 163, 184, 0.5);
  color: #f8fafc;
}

.variant-filter-btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  color: #f8fafc;
}

.variant-filter-btn--overworld:hover,
.variant-filter-btn--overworld.variant-filter-btn--active {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
}

.variant-filter-btn--instance:hover,
.variant-filter-btn--instance.variant-filter-btn--active {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.5);
}

.variant-filter-badge {
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.variant-filter-badge--overworld {
  background: rgba(34, 197, 94, 0.3);
  color: #86efac;
}

.variant-filter-badge--instance {
  background: rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
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
  padding: 0.5rem 0.75rem;
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
  text-align: center;
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

.npc-row--down {
  background: rgba(239, 68, 68, 0.05);
}

.npc-row--down:hover {
  background: rgba(239, 68, 68, 0.12);
}

.col-status { width: 80px; text-align: center; }
.col-name { min-width: 150px; }
.col-zone { width: 240px; }
.col-respawn { min-width: 180px; }
.col-killed { width: 120px; }
.col-actions { width: 120px; text-align: center; }

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

.raid-badge {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 0.25rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fca5a5;
}

.variant-badge {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.variant-badge--overworld {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.variant-badge--instance {
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  color: #c4b5fd;
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

.zone-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.expansion-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  flex-shrink: 0;
  margin: -12px 0;
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

.timer-countdown,
.timer-window {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.countdown-time {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fca5a5;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.countdown-time--window {
  color: #fde047;
}

.countdown-label {
  font-size: 0.7rem;
  font-weight: 400;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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

.action-btn--spawn {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.35);
  color: #86efac;
}

.action-btn--spawn:hover {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.6);
  color: #4ade80;
}

.action-btn--down {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.action-btn--down:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.6);
  color: #f87171;
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

/* Checkbox styles for kill modal */
.form-group--checkbox {
  padding: 0.75rem;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
}

.checkbox-input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #8b5cf6;
  cursor: pointer;
}

.checkbox-text {
  font-size: 0.9rem;
  font-weight: 500;
  color: #e2e8f0;
}

.checkbox-hint {
  margin: 0.4rem 0 0 1.7rem;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
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

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
}

.pagination-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #e2e8f0;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pagination-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #f8fafc;
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-info {
  color: #94a3b8;
  font-size: 0.85rem;
}

/* Pending Clarifications */
.pending-clarifications {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.1), rgba(234, 179, 8, 0.05));
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.pending-clarifications__header {
  margin-bottom: 0.75rem;
}

.pending-clarifications__header h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  color: #fbbf24;
}

.pending-icon {
  font-size: 1.2rem;
}

.pending-count {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.pending-clarifications__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pending-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(30, 41, 59, 0.8);
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(234, 179, 8, 0.2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.pending-item:hover {
  background: rgba(30, 41, 59, 1);
  border-color: rgba(234, 179, 8, 0.4);
}

.pending-item__info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.pending-item__info strong {
  color: #f1f5f9;
  white-space: nowrap;
}

.pending-item__type {
  font-size: 0.75rem;
  color: #fbbf24;
  background: rgba(234, 179, 8, 0.15);
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  white-space: nowrap;
}

.pending-item__details {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  color: #94a3b8;
  font-size: 0.8rem;
}

.pending-item__time {
  white-space: nowrap;
}

.pending-item__killer,
.pending-item__raid {
  color: #64748b;
}

.pending-item__actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn--small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn--danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
}

.btn--danger:hover {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.5);
}

/* Clarifications Pagination */
.clarifications-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(234, 179, 8, 0.2);
}

.pagination-btn--small {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
}

.pagination-info--small {
  font-size: 0.75rem;
}

/* Clarification Modal */
.clarification-modal {
  max-width: 28rem;
}

.clarification-details {
  text-align: center;
  margin-bottom: 1.5rem;
}

.clarification-npc-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0 0 0.5rem;
}

.clarification-time,
.clarification-raid {
  font-size: 0.85rem;
  margin: 0.25rem 0;
}

.clarification-options {
  background: rgba(30, 41, 59, 0.5);
  padding: 1rem;
  border-radius: 0.5rem;
}

.clarification-prompt {
  text-align: center;
  margin: 0 0 1rem;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.clarification-toggle {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.toggle-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid #334155;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-option:hover {
  border-color: #475569;
}

.toggle-option--active {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
}

.toggle-option input {
  cursor: pointer;
}

.toggle-label {
  color: #e2e8f0;
  font-size: 0.9rem;
}

.zone-select {
  width: 100%;
  padding: 0.75rem;
  font-size: 0.9rem;
}
</style>
