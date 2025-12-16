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

    <div v-if="loading && definitions.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>Loading NPCs...</p>
    </div>

    <div v-else-if="filteredDefinitions.length === 0" class="empty-state">
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
        v-for="npc in filteredDefinitions"
        :key="npc.id"
        class="npc-card"
      >
        <header class="npc-card__header">
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
          <span v-if="npc.zoneName" class="zone-badge">{{ npc.zoneName }}</span>
        </header>

        <div class="npc-card__body">
          <div class="info-row">
            <span class="info-label">Respawn Time</span>
            <span class="info-value">
              {{ formatRespawnRange(npc.respawnMinMinutes, npc.respawnMaxMinutes) }}
            </span>
          </div>

          <div v-if="npc.notes" class="info-row info-row--notes">
            <span class="info-label">Notes</span>
            <p class="notes-text">{{ npc.notes }}</p>
          </div>

          <div class="info-row info-row--meta">
            <span class="muted small">
              Added by {{ npc.createdByName ?? 'Unknown' }}
            </span>
          </div>
        </div>

        <footer class="npc-card__actions">
          <button class="btn btn--small btn--outline" @click="openEditModal(npc)">
            Edit
          </button>
          <button
            v-if="canManage"
            class="btn btn--small btn--danger-outline"
            @click="confirmDelete(npc)"
          >
            Delete
          </button>
        </footer>
      </article>
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

          <div class="form-row">
            <div class="form-group">
              <label for="respawn-min">Min Respawn (minutes)</label>
              <input
                id="respawn-min"
                v-model.number="form.respawnMinMinutes"
                type="number"
                min="0"
                class="input"
                placeholder="e.g., 420"
              />
            </div>
            <div class="form-group">
              <label for="respawn-max">Max Respawn (minutes)</label>
              <input
                id="respawn-max"
                v-model.number="form.respawnMaxMinutes"
                type="number"
                min="0"
                class="input"
                placeholder="e.g., 480"
              />
            </div>
          </div>

          <div class="respawn-helper muted small">
            <template v-if="form.respawnMinMinutes">
              {{ formatRespawnRange(form.respawnMinMinutes, form.respawnMaxMinutes) }}
            </template>
            <template v-else>
              Enter respawn times in minutes (e.g., 7 hours = 420 minutes)
            </template>
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

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useNpcRespawnStore } from '../stores/npcRespawn';
import type { NpcDefinition, NpcDefinitionInput } from '../services/api';

const route = useRoute();
const guildId = route.params.guildId as string;
const store = useNpcRespawnStore();

// State
const searchQuery = ref('');
const showModal = ref(false);
const showDeleteModal = ref(false);
const editingNpc = ref<NpcDefinition | null>(null);
const deletingNpc = ref<NpcDefinition | null>(null);
const submitting = ref(false);
const deleting = ref(false);

const form = ref<NpcDefinitionInput>({
  npcName: '',
  zoneName: null,
  respawnMinMinutes: null,
  respawnMaxMinutes: null,
  notes: null,
  allaLink: null
});

// Computed
const loading = computed(() => store.loading);
const definitions = computed(() => store.definitions);
const canManage = computed(() => store.canManage);

const filteredDefinitions = computed(() => {
  if (!searchQuery.value) return definitions.value;
  const query = searchQuery.value.toLowerCase();
  return definitions.value.filter(npc =>
    npc.npcName.toLowerCase().includes(query) ||
    (npc.zoneName?.toLowerCase().includes(query) ?? false)
  );
});

// Methods
function formatRespawnRange(min: number | null, max: number | null): string {
  if (min === null) return 'Unknown';
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
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
    notes: null,
    allaLink: null
  };
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
    notes: npc.notes,
    allaLink: npc.allaLink
  };
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
    alert(err?.response?.data?.message ?? err?.message ?? 'Failed to save NPC');
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
    alert(err?.response?.data?.message ?? err?.message ?? 'Failed to delete NPC');
  } finally {
    deleting.value = false;
  }
}

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
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.25rem;
  padding: 0 0.5rem;
}

.npc-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.npc-card:hover {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.npc-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem 1.25rem 0.75rem;
  background: rgba(30, 41, 59, 0.4);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.npc-card__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.npc-card__title h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
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
  font-size: 0.7rem;
  color: #a5b4fc;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.npc-card__body {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-row--notes {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
}

.info-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.info-value {
  font-weight: 500;
  color: #e2e8f0;
}

.notes-text {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
  line-height: 1.5;
}

.info-row--meta {
  margin-top: 0.25rem;
}

.npc-card__actions {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  background: rgba(30, 41, 59, 0.3);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
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

.respawn-helper {
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 0.4rem;
  border: 1px solid rgba(59, 130, 246, 0.2);
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
</style>
