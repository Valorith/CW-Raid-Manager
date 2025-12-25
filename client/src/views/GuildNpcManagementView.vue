<template>
  <section class="npc-management">
    <header class="section-header">
      <div class="header-content">
        <div class="header-title">
          <RouterLink
            class="back-link"
            :to="{ name: 'GuildNpcRespawn', params: { guildId } }"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Tracker
          </RouterLink>
          <h1>Manage NPCs</h1>
          <p class="muted">Configure NPCs and respawn times</p>
        </div>
        <div class="header-actions">
          <button class="btn btn--primary" @click="openAddModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add NPC
          </button>
        </div>
      </div>
    </header>

    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="search"
        class="input input--search"
        placeholder="Search NPCs by name or zone..."
      />
    </div>

    <GlobalLoadingSpinner v-if="loading && definitions.length === 0" />

    <div v-else-if="paginatedDefinitions.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3>{{ definitions.length === 0 ? 'No NPCs Added Yet' : 'No Results' }}</h3>
      <p class="muted">
        {{ definitions.length === 0
          ? 'Add your first NPC to start tracking respawn times.'
          : 'No NPCs match your search criteria.' }}
      </p>
      <button v-if="definitions.length === 0" class="btn btn--primary" @click="openAddModal">
        Add Your First NPC
      </button>
    </div>

    <div v-else class="npc-grid">
      <article
        v-for="npc in paginatedDefinitions"
        :key="npc.id"
        class="npc-card"
      >
        <div class="npc-card__header">
          <div class="npc-card__zone">
            <img
              v-if="getExpansionForZone(npc.zoneName)"
              :src="getExpansionForZone(npc.zoneName)?.icon"
              :alt="getExpansionForZone(npc.zoneName)?.shortName"
              :title="getExpansionForZone(npc.zoneName)?.name"
              class="expansion-icon"
            />
            <span v-if="npc.zoneName" class="zone-name">{{ npc.zoneName }}</span>
          </div>
          <div class="npc-card__actions">
            <button class="btn btn--icon btn--outline" @click="openEditModal(npc)" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              v-if="canManage"
              class="btn btn--icon btn--danger-outline"
              @click="confirmDelete(npc)"
              title="Delete"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
        <div class="npc-card__body">
          <div class="npc-card__title">
            <h3>{{ npc.npcName }}</h3>
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
          <div class="npc-card__badges">
            <span v-if="npc.isRaidTarget" class="raid-badge">RAID</span>
            <span v-if="npc.hasInstanceVersion" class="instance-badge" title="Tracking both Overworld and Instance versions">INSTANCE</span>
            <span
              v-if="npc.contentFlag"
              :class="['content-flag-badge', isContentFlagEnabled(npc.contentFlag) ? 'content-flag-badge--enabled' : 'content-flag-badge--disabled']"
              :title="isContentFlagEnabled(npc.contentFlag) ? `${npc.contentFlag} event is active` : `${npc.contentFlag} event is inactive`"
            >
              {{ npc.contentFlag }}
            </span>
          </div>
          <div class="npc-card__respawn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>{{ formatRespawnRange(npc.respawnMinMinutes, npc.respawnMaxMinutes) }}</span>
          </div>
          <p v-if="npc.notes" class="npc-card__notes">{{ npc.notes }}</p>
        </div>
      </article>
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
        Page {{ currentPage }} of {{ totalPages }} ({{ filteredDefinitions.length }} NPCs)
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

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal modal--large">
        <header class="modal__header">
          <h3>{{ editingNpc ? 'Edit NPC' : 'Add New NPC' }}</h3>
          <button class="modal__close" @click="closeModal">&times;</button>
        </header>
        <div class="modal__body">
          <div class="form-row">
            <div class="form-group form-group--wide">
              <label for="npc-name">NPC Name *</label>
              <input
                id="npc-name"
                v-model="form.npcName"
                type="text"
                class="input"
                placeholder="e.g., Lord Nagafen"
                required
              />
            </div>
            <div class="form-group">
              <label for="npc-zone">Zone</label>
              <input
                id="npc-zone"
                v-model="form.zoneName"
                type="text"
                class="input"
                placeholder="e.g., Nagafen's Lair"
              />
            </div>
          </div>

          <div class="respawn-section">
            <div class="respawn-input-group">
              <label class="respawn-label">Min Respawn</label>
              <div class="time-inputs">
                <div class="time-input-field">
                  <input
                    id="respawn-min-days"
                    v-model.number="respawnMinDays"
                    type="number"
                    min="0"
                    max="99"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">d</span>
                </div>
                <div class="time-input-field">
                  <input
                    id="respawn-min-hours"
                    v-model.number="respawnMinHours"
                    type="number"
                    min="0"
                    max="23"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">h</span>
                </div>
                <div class="time-input-field">
                  <input
                    id="respawn-min-minutes"
                    v-model.number="respawnMinMins"
                    type="number"
                    min="0"
                    max="59"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">m</span>
                </div>
              </div>
            </div>

            <div class="respawn-input-group">
              <label class="respawn-label">Max Respawn</label>
              <div class="time-inputs">
                <div class="time-input-field">
                  <input
                    id="respawn-max-days"
                    v-model.number="respawnMaxDays"
                    type="number"
                    min="0"
                    max="99"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">d</span>
                </div>
                <div class="time-input-field">
                  <input
                    id="respawn-max-hours"
                    v-model.number="respawnMaxHours"
                    type="number"
                    min="0"
                    max="23"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">h</span>
                </div>
                <div class="time-input-field">
                  <input
                    id="respawn-max-minutes"
                    v-model.number="respawnMaxMins"
                    type="number"
                    min="0"
                    max="59"
                    class="input input--time"
                    placeholder="0"
                  />
                  <span class="time-unit">m</span>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="npc-alla">Allakhazam Link</label>
            <input
              id="npc-alla"
              v-model="form.allaLink"
              type="url"
              class="input"
              placeholder="https://alla.clumsysworld.com/..."
            />
          </div>

          <div class="form-group">
            <label for="npc-notes">Notes</label>
            <textarea
              id="npc-notes"
              v-model="form.notes"
              class="input input--textarea"
              rows="2"
              placeholder="Any additional notes about this NPC..."
            ></textarea>
          </div>

          <div class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input
                id="npc-raid-target"
                v-model="form.isRaidTarget"
                type="checkbox"
                class="checkbox-input"
              />
              <span class="checkbox-text">Raid Target</span>
            </label>
            <p class="checkbox-hint">
              When enabled, manual kills will trigger the "Raid Target Killed" Discord webhook notification.
            </p>
          </div>

          <div class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input
                id="npc-has-instance"
                v-model="form.hasInstanceVersion"
                type="checkbox"
                class="checkbox-input"
              />
              <span class="checkbox-text">Track Instance Version</span>
            </label>
            <p class="checkbox-hint">
              When enabled, this NPC will be tracked separately for Overworld and Instance kills.
              Two entries will appear on the tracker with independent respawn timers.
            </p>
          </div>

          <div class="form-group">
            <label for="npc-content-flag">Content Flag</label>
            <select
              id="npc-content-flag"
              v-model="form.contentFlag"
              class="input input--select"
            >
              <option :value="null">None (Always Visible)</option>
              <option v-for="flag in NPC_CONTENT_FLAGS" :key="flag" :value="flag">
                {{ flag }}
              </option>
            </select>
            <p class="field-hint">
              If set, this NPC will only appear on the tracker when the corresponding content flag is enabled in the game database.
            </p>
          </div>
        </div>
        <footer class="modal__actions">
          <button class="btn btn--outline" @click="closeModal">Cancel</button>
          <button
            class="btn btn--primary"
            :disabled="submitting || !form.npcName.trim()"
            @click="submitForm"
          >
            {{ submitting ? 'Saving...' : (editingNpc ? 'Save Changes' : 'Add NPC') }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-backdrop" @click.self="cancelDelete">
      <div class="modal">
        <header class="modal__header">
          <h3>Delete NPC</h3>
          <button class="modal__close" @click="cancelDelete">&times;</button>
        </header>
        <div class="modal__body">
          <p>
            Are you sure you want to delete <strong>{{ deletingNpc?.npcName }}</strong>?
          </p>
          <p class="muted small">
            This will also delete all kill records associated with this NPC. This action cannot be undone.
          </p>
        </div>
        <footer class="modal__actions">
          <button class="btn btn--outline" @click="cancelDelete">Cancel</button>
          <button
            class="btn btn--danger"
            :disabled="deleting"
            @click="executeDelete"
          >
            {{ deleting ? 'Deleting...' : 'Delete NPC' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Error Modal -->
    <ErrorModal />

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNpcRespawnStore } from '../stores/npcRespawn';
import type { NpcDefinition, NpcDefinitionInput, NpcContentFlag } from '../services/api';
import { NPC_CONTENT_FLAGS } from '../services/api';
import { getExpansionForZone } from '../data/expansionZones';
import ErrorModal from '../components/ErrorModal.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useErrorModal } from '../composables/useErrorModal';

const route = useRoute();
const guildId = route.params.guildId as string;
const store = useNpcRespawnStore();
const { showErrorFromException } = useErrorModal();

// State
const searchQuery = ref('');
const showModal = ref(false);
const showDeleteModal = ref(false);
const editingNpc = ref<NpcDefinition | null>(null);
const deletingNpc = ref<NpcDefinition | null>(null);
const submitting = ref(false);
const deleting = ref(false);
const currentPage = ref(1);
const itemsPerPage = 24;

const form = ref<NpcDefinitionInput>({
  npcName: '',
  zoneName: null,
  respawnMinMinutes: null,
  respawnMaxMinutes: null,
  isRaidTarget: false,
  hasInstanceVersion: false,
  contentFlag: null,
  notes: null,
  allaLink: null
});

// Respawn time inputs (days + hours + minutes for better UX)
const respawnMinDays = ref<number | null>(null);
const respawnMinHours = ref<number | null>(null);
const respawnMinMins = ref<number | null>(null);
const respawnMaxDays = ref<number | null>(null);
const respawnMaxHours = ref<number | null>(null);
const respawnMaxMins = ref<number | null>(null);

// Watch time inputs and update form values
watch([respawnMinDays, respawnMinHours, respawnMinMins], ([days, hours, mins]) => {
  const d = days ?? 0;
  const h = hours ?? 0;
  const m = mins ?? 0;
  form.value.respawnMinMinutes = (d > 0 || h > 0 || m > 0) ? d * 1440 + h * 60 + m : null;
});

watch([respawnMaxDays, respawnMaxHours, respawnMaxMins], ([days, hours, mins]) => {
  const d = days ?? 0;
  const h = hours ?? 0;
  const m = mins ?? 0;
  form.value.respawnMaxMinutes = (d > 0 || h > 0 || m > 0) ? d * 1440 + h * 60 + m : null;
});

// Populate days/hours/minutes from total minutes
function minutesToTimeInputs(totalMinutes: number | null): { days: number | null; hours: number | null; mins: number | null } {
  if (totalMinutes === null || totalMinutes === 0) {
    return { days: null, hours: null, mins: null };
  }
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  return {
    days: days > 0 ? days : null,
    hours: hours > 0 ? hours : null,
    mins: mins > 0 ? mins : null
  };
}

// Computed
const loading = computed(() => store.loading);
const definitions = computed(() => store.definitions);
const canManage = computed(() => store.canManage);
const enabledContentFlags = computed(() => store.enabledContentFlags);

const filteredDefinitions = computed(() => {
  if (!searchQuery.value) return definitions.value;
  const query = searchQuery.value.toLowerCase();
  return definitions.value.filter(npc =>
    npc.npcName.toLowerCase().includes(query) ||
    (npc.zoneName?.toLowerCase().includes(query) ?? false)
  );
});

const totalPages = computed(() => Math.ceil(filteredDefinitions.value.length / itemsPerPage));

const paginatedDefinitions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredDefinitions.value.slice(start, start + itemsPerPage);
});

function isContentFlagEnabled(flag: string | null): boolean {
  if (!flag) return true;
  return enabledContentFlags.value.includes(flag as typeof enabledContentFlags.value[number]);
}

// Methods
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

function resetForm() {
  form.value = {
    npcName: '',
    zoneName: null,
    respawnMinMinutes: null,
    respawnMaxMinutes: null,
    isRaidTarget: false,
    hasInstanceVersion: false,
    contentFlag: null,
    notes: null,
    allaLink: null
  };
  respawnMinDays.value = null;
  respawnMinHours.value = null;
  respawnMinMins.value = null;
  respawnMaxDays.value = null;
  respawnMaxHours.value = null;
  respawnMaxMins.value = null;
}

function openAddModal() {
  editingNpc.value = null;
  resetForm();
  showModal.value = true;
}

function openEditModal(npc: NpcDefinition) {
  editingNpc.value = npc;
  form.value = {
    npcName: npc.npcName,
    zoneName: npc.zoneName,
    respawnMinMinutes: npc.respawnMinMinutes,
    respawnMaxMinutes: npc.respawnMaxMinutes,
    isRaidTarget: npc.isRaidTarget ?? false,
    hasInstanceVersion: npc.hasInstanceVersion ?? false,
    contentFlag: npc.contentFlag ?? null,
    notes: npc.notes,
    allaLink: npc.allaLink
  };
  // Populate time inputs from total minutes
  const minTime = minutesToTimeInputs(npc.respawnMinMinutes);
  respawnMinDays.value = minTime.days;
  respawnMinHours.value = minTime.hours;
  respawnMinMins.value = minTime.mins;
  const maxTime = minutesToTimeInputs(npc.respawnMaxMinutes);
  respawnMaxDays.value = maxTime.days;
  respawnMaxHours.value = maxTime.hours;
  respawnMaxMins.value = maxTime.mins;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingNpc.value = null;
  resetForm();
}

async function submitForm() {
  if (submitting.value || !form.value.npcName.trim()) return;

  submitting.value = true;
  try {
    if (editingNpc.value) {
      await store.updateDefinition(guildId, editingNpc.value.id, form.value);
    } else {
      await store.createDefinition(guildId, form.value);
    }
    closeModal();
  } catch (err: any) {
    showErrorFromException(err, 'Failed to save NPC');
  } finally {
    submitting.value = false;
  }
}

function confirmDelete(npc: NpcDefinition) {
  deletingNpc.value = npc;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  deletingNpc.value = null;
}

async function executeDelete() {
  if (!deletingNpc.value || deleting.value) return;

  deleting.value = true;
  try {
    await store.deleteDefinition(guildId, deletingNpc.value.id);
    cancelDelete();
  } catch (err: any) {
    showErrorFromException(err, 'Failed to delete NPC');
  } finally {
    deleting.value = false;
  }
}

// Reset page when search changes
watch(searchQuery, () => {
  currentPage.value = 1;
});

// Lifecycle
onMounted(async () => {
  await store.fetchDefinitions(guildId);
});
</script>

<style scoped>
.npc-management {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1200px;
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
}

@media (min-width: 640px) {
  .header-content {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #64748b;
  text-decoration: none;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
  transition: color 0.15s ease;
}

.back-link:hover {
  color: #3b82f6;
}

.back-link svg {
  width: 16px;
  height: 16px;
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

.search-bar {
  padding: 0 1rem;
}

.input--search {
  width: 100%;
  max-width: 400px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.6rem 1rem;
  color: #f8fafc;
}

.input--search::placeholder {
  color: rgba(148, 163, 184, 0.7);
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

.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
  padding: 0 0.5rem;
}

.npc-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
  display: flex;
  flex-direction: column;
}

.npc-card:hover {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(15, 23, 42, 0.85);
}

.npc-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.6rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.npc-card__zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.expansion-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
}

.zone-name {
  font-size: 0.7rem;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npc-card__actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.npc-card__body {
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.npc-card__title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.npc-card__title h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alla-link {
  display: inline-flex;
  align-items: center;
  color: #64748b;
  transition: color 0.15s ease;
  flex-shrink: 0;
}

.alla-link:hover {
  color: #3b82f6;
}

.alla-link svg {
  width: 14px;
  height: 14px;
}

.npc-card__badges {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  min-height: 1.2rem;
}

.raid-badge {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
  padding: 0.15rem 0.4rem;
  border-radius: 0.2rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.instance-badge {
  background: rgba(139, 92, 246, 0.8);
  color: #fff;
  padding: 0.15rem 0.4rem;
  border-radius: 0.2rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.npc-card__respawn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: #94a3b8;
  font-size: 0.75rem;
}

.npc-card__respawn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}

.npc-card__notes {
  margin: 0;
  font-size: 0.7rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 0.3rem;
}

.btn--icon svg {
  width: 14px;
  height: 14px;
}

.content-flag-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 0.3rem;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.content-flag-badge--enabled {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.content-flag-badge--disabled {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
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
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal--large {
  max-width: 600px;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 1;
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

.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 480px) {
  .form-row {
    grid-template-columns: 1fr 1fr;
  }

  .form-group--wide {
    grid-column: span 1;
  }
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

.input--textarea {
  resize: vertical;
  min-height: 60px;
}

.input--small {
  width: 90px;
}

.input--time {
  width: 60px;
  text-align: center;
  padding: 0.5rem 0.4rem;
}

/* Respawn time section */
.respawn-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
}

.respawn-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.respawn-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.time-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-input-field {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.time-unit {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 500;
}

.form-section {
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.form-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.form-section__header h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  position: sticky;
  bottom: 0;
  background: inherit;
}

/* Button styles */
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
  border: 1px solid transparent;
}

.btn svg {
  width: 16px;
  height: 16px;
}

.btn--small {
  padding: 0.4rem 0.8rem;
  font-size: 0.75rem;
}

.btn--icon {
  padding: 0.4rem;
  width: 32px;
  height: 32px;
}

.btn--primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: rgba(59, 130, 246, 0.5);
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
  border-color: rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
}

.btn--outline:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.5);
}

.btn--danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fff;
}

.btn--danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #f87171, #ef4444);
}

.btn--danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger-outline {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.btn--danger-outline:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.muted {
  color: #64748b;
}

.small {
  font-size: 0.8rem;
}

/* Checkbox styles */
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
  accent-color: #3b82f6;
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

.input--select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2rem;
  cursor: pointer;
}

.input--select option {
  background: #1e293b;
  color: #f8fafc;
}

.field-hint {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
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
</style>
