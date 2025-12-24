<template>
  <div class="associates-tab">
    <!-- Add Manual Association -->
    <div class="add-association-section">
      <h4>Add Manual Association</h4>
      <div class="search-row">
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Search for a character..."
          class="form-input"
          @input="handleSearch"
        />
        <div v-if="store.searchLoading" class="search-loading">
          <span class="loading-spinner loading-spinner--small"></span>
        </div>
      </div>

      <!-- Search Results -->
      <div v-if="store.searchResults.length > 0" class="search-results">
        <div
          v-for="result in store.searchResults"
          :key="result.id"
          class="search-result"
          @click="selectCharacter(result)"
        >
          <span class="result-name">{{ result.name }}</span>
          <span class="result-details">
            Level {{ result.level }} {{ result.className }}
            <span class="result-account">(Account: {{ result.accountName }})</span>
          </span>
        </div>
      </div>

      <!-- Selected Character for Association -->
      <div v-if="selectedCharacter" class="selected-character">
        <div class="selected-info">
          <strong>{{ selectedCharacter.name }}</strong>
          <span>Level {{ selectedCharacter.level }} {{ selectedCharacter.className }}</span>
        </div>
        <div class="association-type-selector">
          <label class="type-label">Association Type:</label>
          <div class="type-buttons">
            <button
              type="button"
              class="type-btn"
              :class="{ 'type-btn--active': associationType === 'direct', 'type-btn--direct': associationType === 'direct' }"
              @click="associationType = 'direct'"
            >
              <span class="type-icon">&#9679;</span>
              Direct
            </button>
            <button
              type="button"
              class="type-btn"
              :class="{ 'type-btn--active': associationType === 'indirect', 'type-btn--indirect': associationType === 'indirect' }"
              @click="associationType = 'indirect'"
            >
              <span class="type-icon">&#9675;</span>
              Indirect
            </button>
          </div>
          <div class="type-description">
            {{ associationType === 'direct' ? 'Direct = same person (orange border on connections)' : 'Indirect = possible alt/associate (yellow border on connections)' }}
          </div>
        </div>
        <input
          type="text"
          v-model="associationReason"
          placeholder="Reason for association (optional)"
          class="form-input"
        />
        <div class="action-buttons">
          <button class="btn btn--primary" @click="addAssociation" :disabled="addingAssociation">
            {{ addingAssociation ? 'Adding...' : 'Add Association' }}
          </button>
          <button class="btn btn--secondary" @click="cancelSelection">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.associatesLoading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading associates...</p>
    </div>

    <!-- Associates List -->
    <template v-else>
      <div class="associates-summary">
        {{ store.associates.length }} associated character{{ store.associates.length !== 1 ? 's' : '' }}
      </div>

      <div class="associates-list">
        <div
          v-for="associate in paginatedAssociates"
          :key="associate.characterId"
          class="associate-card"
          :class="{ 'associate-card--watched': isAssociateWatched(associate.characterId) }"
        >
          <div class="associate-info">
            <div class="associate-header">
              <span class="associate-name">{{ getDisplayName(associate.characterName) }}</span>
              <span v-if="isDeleted(associate.characterName)" class="deleted-badge">Deleted</span>
              <span class="association-badge" :class="`badge--${associate.associationType}`">
                {{ getAssociationLabel(associate.associationType) }}
              </span>
              <span
                v-if="associate.associationType === 'manual' && associate.manualAssociationType"
                class="association-badge"
                :class="`badge--manual-${associate.manualAssociationType}`"
              >
                {{ associate.manualAssociationType === 'direct' ? 'Direct' : 'Indirect' }}
              </span>
            </div>
            <div class="associate-details">
              <span>Level {{ associate.level }} {{ associate.className }}</span>
              <span class="divider">|</span>
              <span>Account: {{ associate.accountName }} (#{{ associate.accountId }})</span>
            </div>
            <div v-if="associate.sharedIp" class="associate-ip">
              Shared IP: {{ associate.sharedIp }}
            </div>
            <div v-if="associate.manualReason" class="associate-reason">
              Reason: {{ associate.manualReason }}
            </div>
            <div v-if="associate.createdByName" class="associate-meta">
              Added by {{ associate.createdByName }}
              <span v-if="associate.createdAt">on {{ formatDate(associate.createdAt) }}</span>
            </div>
          </div>
          <div class="associate-actions">
            <button
              class="watch-toggle"
              :class="{ 'watch-toggle--active': isAssociateWatched(associate.characterId) }"
              :disabled="togglingWatchId === associate.characterId"
              @click="toggleAssociateWatch(associate)"
            >
              <span class="watch-icon">{{ isAssociateWatched(associate.characterId) ? '&#9733;' : '&#9734;' }}</span>
              <span class="watch-label">{{
                togglingWatchId === associate.characterId
                  ? '...'
                  : (isAssociateWatched(associate.characterId) ? 'Watching' : 'Watch')
              }}</span>
            </button>
            <button
              v-if="associate.associationType === 'manual'"
              class="btn btn--danger btn--small"
              @click="removeAssociation(associate.manualAssociationId!)"
              :disabled="removingId === associate.manualAssociationId"
            >
              {{ removingId === associate.manualAssociationId ? 'Removing...' : 'Remove' }}
            </button>
          </div>
        </div>

        <div v-if="store.associates.length === 0" class="no-data">
          No associated characters found
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button
          class="pagination-btn"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
        >
          &laquo; Prev
        </button>
        <span class="pagination-info">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <button
          class="pagination-btn"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
        >
          Next &raquo;
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import { api, type CharacterSearchResult } from '../../../services/api';

const store = useCharacterAdminStore();

// Pagination
const currentPage = ref(1);
const ITEMS_PER_PAGE = 10;

const totalPages = computed(() => Math.ceil(store.associates.length / ITEMS_PER_PAGE));

const paginatedAssociates = computed(() => {
  const start = (currentPage.value - 1) * ITEMS_PER_PAGE;
  return store.associates.slice(start, start + ITEMS_PER_PAGE);
});

// Reset to page 1 when associates list changes
watch(() => store.associates, () => {
  currentPage.value = 1;
});

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

// Compute set of watched character IDs for efficient lookups
const watchedCharacterIds = computed(() =>
  new Set(store.fullWatchList.map(w => w.eqCharacterId))
);

// Check if an associate is on the watch list
function isAssociateWatched(characterId: number): boolean {
  return watchedCharacterIds.value.has(characterId);
}

// Watch toggle for associates
const togglingWatchId = ref<number | null>(null);

async function toggleAssociateWatch(associate: { characterId: number; characterName: string; accountId: number }) {
  if (togglingWatchId.value === associate.characterId) return;

  togglingWatchId.value = associate.characterId;
  try {
    const isCurrentlyWatched = isAssociateWatched(associate.characterId);
    if (isCurrentlyWatched) {
      await api.removeCharacterWatch(associate.characterId);
    } else {
      await api.addCharacterWatch(associate.characterId, associate.characterName, associate.accountId);
    }
    // Reload watch list to update UI
    await store.loadWatchList();
  } catch (err) {
    console.error('Failed to toggle watch status:', err);
  } finally {
    togglingWatchId.value = null;
  }
}

const searchQuery = ref('');
const selectedCharacter = ref<CharacterSearchResult | null>(null);
const associationType = ref<'direct' | 'indirect'>('indirect');
const associationReason = ref('');
const addingAssociation = ref(false);
const removingId = ref<string | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function handleSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);

  if (searchQuery.value.length < 2) {
    store.clearSearchResults();
    return;
  }

  searchTimeout = setTimeout(() => {
    store.searchCharacters(searchQuery.value);
  }, 300);
}

function selectCharacter(char: CharacterSearchResult) {
  // Don't allow selecting the current character or existing associates
  if (char.id === store.character?.id) {
    return;
  }
  if (store.associates.some(a => a.characterId === char.id)) {
    return;
  }

  selectedCharacter.value = char;
  searchQuery.value = '';
  store.clearSearchResults();
}

function cancelSelection() {
  selectedCharacter.value = null;
  associationType.value = 'indirect';
  associationReason.value = '';
}

async function addAssociation() {
  if (!selectedCharacter.value) return;

  addingAssociation.value = true;
  try {
    await store.addAssociation(
      selectedCharacter.value.id,
      associationType.value,
      associationReason.value || undefined
    );
    selectedCharacter.value = null;
    associationType.value = 'indirect';
    associationReason.value = '';
  } catch (err) {
    console.error('Failed to add association:', err);
  } finally {
    addingAssociation.value = false;
  }
}

async function removeAssociation(associationId: string) {
  removingId.value = associationId;
  try {
    await store.removeAssociation(associationId);
  } catch (err) {
    console.error('Failed to remove association:', err);
  } finally {
    removingId.value = null;
  }
}

function getAssociationLabel(type: string): string {
  switch (type) {
    case 'same_account':
      return 'Same Account';
    case 'same_ip':
      return 'Same IP';
    case 'manual':
      return 'Manual';
    default:
      return type;
  }
}

function isDeleted(name: string): boolean {
  return name.toLowerCase().includes('-deleted-');
}

function getDisplayName(name: string): string {
  const deletedIndex = name.toLowerCase().indexOf('-deleted-');
  if (deletedIndex !== -1) {
    return name.substring(0, deletedIndex);
  }
  return name;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}
</script>

<style scoped lang="scss">
.associates-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.add-association-section {
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;

  h4 {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: #e2e8f0;
  }
}

.search-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.form-input {
  flex: 1;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  color: #f8fafc;
  padding: 0.5rem;
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
}

.search-loading {
  display: flex;
  align-items: center;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  &--small {
    width: 1rem;
    height: 1rem;
    border-width: 1px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.search-results {
  margin-top: 0.5rem;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
}

.search-result {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-bottom: 1px solid #334155;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #334155;
  }
}

.result-name {
  color: #f8fafc;
  font-weight: 500;
}

.result-details {
  font-size: 0.75rem;
  color: #94a3b8;
}

.result-account {
  color: #64748b;
}

.selected-character {
  margin-top: 1rem;
  padding: 1rem;
  background: #1e293b;
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.selected-info {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;

  strong {
    color: #f8fafc;
  }

  span {
    font-size: 0.875rem;
    color: #94a3b8;
  }
}

.association-type-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.type-label {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.type-buttons {
  display: flex;
  gap: 0.5rem;
}

.type-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  background: #1e293b;
  color: #94a3b8;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.15s ease;

  &:hover {
    border-color: #475569;
  }

  &--active {
    border-width: 2px;
  }

  &--direct {
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
  }

  &--indirect {
    border-color: #eab308;
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
  }
}

.type-icon {
  font-size: 0.75rem;
}

.type-description {
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s ease;

  &--primary {
    background: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
    }
  }

  &--secondary {
    background: #334155;
    color: #e2e8f0;

    &:hover {
      background: #475569;
    }
  }

  &--danger {
    background: #dc2626;
    color: white;

    &:hover {
      background: #b91c1c;
    }
  }

  &--small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: #94a3b8;
}

.associates-summary {
  font-size: 0.875rem;
  color: #94a3b8;
}

.associates-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.associate-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;
  border: 1px solid #334155;

  &--watched {
    border: 2px solid rgba(249, 115, 22, 0.6);
    animation: watchPulse 2s ease-in-out infinite;
  }
}

@keyframes watchPulse {
  0%, 100% {
    background-color: rgba(249, 115, 22, 0.08);
    border-color: rgba(249, 115, 22, 0.6);
  }
  50% {
    background-color: rgba(249, 115, 22, 0.18);
    border-color: rgba(249, 115, 22, 0.8);
  }
}

.associate-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.associate-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.associate-name {
  font-weight: 600;
  color: #f8fafc;
}

.deleted-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.association-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &.badge--same_account {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  &.badge--same_ip {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  &.badge--manual {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }

  &.badge--manual-direct {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  &.badge--manual-indirect {
    background: rgba(234, 179, 8, 0.2);
    color: #facc15;
  }
}

.associate-details {
  font-size: 0.875rem;
  color: #94a3b8;

  .divider {
    margin: 0 0.5rem;
    color: #475569;
  }
}

.associate-ip,
.associate-reason {
  font-size: 0.75rem;
  color: #64748b;
}

.associate-meta {
  font-size: 0.75rem;
  color: #475569;
  font-style: italic;
}

.associate-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
}

.watch-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.4);
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.4);
    color: #fb923c;
  }

  &--active {
    background: rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.5);
    color: #fb923c;
  }

  &--active:hover:not(:disabled) {
    background: rgba(249, 115, 22, 0.3);
    border-color: rgba(249, 115, 22, 0.6);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.watch-icon {
  font-size: 0.875rem;
}

.watch-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  padding: 0.5rem;
}

.pagination-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: #334155;
    color: #e2e8f0;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.pagination-info {
  font-size: 0.75rem;
  color: #94a3b8;
}

.no-data {
  text-align: center;
  padding: 2rem;
  color: #64748b;
}
</style>
