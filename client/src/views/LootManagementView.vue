<template>
  <section class="loot-management">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Loot Management</h1>
        <p class="muted">View and manage loot council data from the EQEmu database.</p>
      </div>
      <router-link to="/admin" class="btn btn--outline">
        Back to Admin
      </router-link>
    </header>

    <div class="loot-stats">
      <div class="stat-card">
        <span class="stat-card__label">Loot Master</span>
        <strong class="stat-card__value">{{ summary.lootMasterCount }}</strong>
        <span class="stat-card__meta">Total entries</span>
      </div>
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">LC Items</span>
        <strong class="stat-card__value">{{ summary.lcItemsCount }}</strong>
        <span class="stat-card__meta">Loot council items</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">LC Requests</span>
        <strong class="stat-card__value">{{ summary.lcRequestsCount }}</strong>
        <span class="stat-card__meta">Pending requests</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">LC Votes</span>
        <strong class="stat-card__value">{{ summary.lcVotesCount }}</strong>
        <span class="stat-card__meta">Total votes cast</span>
      </div>
    </div>

    <div class="tab-navigation">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-button', { 'tab-button--active': activeTab === tab.id }]"
        @click="setActiveTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <article class="card card--wide">
      <!-- Loot Master Table -->
      <template v-if="activeTab === 'loot-master'">
        <header class="card__header">
          <div>
            <h2>Loot Master</h2>
            <span class="muted small">{{ lootMasterResult.total }} entries</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingLootMaster"
            aria-label="Refresh"
            @click="loadLootMasterData"
          >
            ↻
          </button>
        </header>
        <input
          v-model="lootMasterSearch"
          type="search"
          class="input input--search"
          placeholder="Search by item, NPC, or zone name..."
          @input="debouncedLootMasterSearch"
        />
        <p v-if="loadingLootMaster" class="muted">Loading loot master data...</p>
        <p v-else-if="lootMasterResult.data.length === 0" class="muted">No entries found.</p>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>NPC</th>
                <th>Zone</th>
                <th>Drop %</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in lootMasterResult.data" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ entry.itemName ?? 'Unknown' }}</td>
                <td>{{ entry.npcName ?? '-' }}</td>
                <td>{{ entry.zoneName ?? '-' }}</td>
                <td>{{ entry.dropChance != null ? `${entry.dropChance}%` : '-' }}</td>
                <td>{{ formatDate(entry.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="lootMasterResult.totalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="lootMasterPage === 1"
            @click="setLootMasterPage(lootMasterPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ lootMasterPage }} of {{ lootMasterResult.totalPages }}</span>
          <button
            class="pagination__button"
            :disabled="lootMasterPage === lootMasterResult.totalPages"
            @click="setLootMasterPage(lootMasterPage + 1)"
          >
            Next
          </button>
        </div>
      </template>

      <!-- LC Items Table -->
      <template v-if="activeTab === 'lc-items'">
        <header class="card__header">
          <div>
            <h2>LC Items</h2>
            <span class="muted small">{{ lcItemsResult.total }} entries</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingLcItems"
            aria-label="Refresh"
            @click="loadLcItemsData"
          >
            ↻
          </button>
        </header>
        <input
          v-model="lcItemsSearch"
          type="search"
          class="input input--search"
          placeholder="Search by item or raid name..."
          @input="debouncedLcItemsSearch"
        />
        <p v-if="loadingLcItems" class="muted">Loading LC items data...</p>
        <p v-else-if="lcItemsResult.data.length === 0" class="muted">No entries found.</p>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Raid</th>
                <th>Status</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in lcItemsResult.data" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ entry.itemName ?? 'Unknown' }}</td>
                <td>{{ entry.raidName ?? '-' }}</td>
                <td>
                  <span :class="['badge', statusBadgeClass(entry.status)]">
                    {{ entry.status ?? 'Unknown' }}
                  </span>
                </td>
                <td>{{ formatDate(entry.dateAdded) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="lcItemsResult.totalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="lcItemsPage === 1"
            @click="setLcItemsPage(lcItemsPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ lcItemsPage }} of {{ lcItemsResult.totalPages }}</span>
          <button
            class="pagination__button"
            :disabled="lcItemsPage === lcItemsResult.totalPages"
            @click="setLcItemsPage(lcItemsPage + 1)"
          >
            Next
          </button>
        </div>
      </template>

      <!-- LC Requests Table -->
      <template v-if="activeTab === 'lc-requests'">
        <header class="card__header">
          <div>
            <h2>LC Requests</h2>
            <span class="muted small">{{ lcRequestsResult.total }} entries</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingLcRequests"
            aria-label="Refresh"
            @click="loadLcRequestsData"
          >
            ↻
          </button>
        </header>
        <input
          v-model="lcRequestsSearch"
          type="search"
          class="input input--search"
          placeholder="Search by item, character, or class..."
          @input="debouncedLcRequestsSearch"
        />
        <p v-if="loadingLcRequests" class="muted">Loading LC requests data...</p>
        <p v-else-if="lcRequestsResult.data.length === 0" class="muted">No entries found.</p>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Character</th>
                <th>Class</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Request Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in lcRequestsResult.data" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ entry.itemName ?? 'Unknown' }}</td>
                <td>{{ entry.characterName ?? '-' }}</td>
                <td>{{ entry.className ?? '-' }}</td>
                <td>{{ entry.priority ?? '-' }}</td>
                <td>
                  <span :class="['badge', statusBadgeClass(entry.status)]">
                    {{ entry.status ?? 'Unknown' }}
                  </span>
                </td>
                <td>{{ formatDate(entry.requestDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="lcRequestsResult.totalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="lcRequestsPage === 1"
            @click="setLcRequestsPage(lcRequestsPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ lcRequestsPage }} of {{ lcRequestsResult.totalPages }}</span>
          <button
            class="pagination__button"
            :disabled="lcRequestsPage === lcRequestsResult.totalPages"
            @click="setLcRequestsPage(lcRequestsPage + 1)"
          >
            Next
          </button>
        </div>
      </template>

      <!-- LC Votes Table -->
      <template v-if="activeTab === 'lc-votes'">
        <header class="card__header">
          <div>
            <h2>LC Votes</h2>
            <span class="muted small">{{ lcVotesResult.total }} entries</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingLcVotes"
            aria-label="Refresh"
            @click="loadLcVotesData"
          >
            ↻
          </button>
        </header>
        <input
          v-model="lcVotesSearch"
          type="search"
          class="input input--search"
          placeholder="Search by voter, item, or character..."
          @input="debouncedLcVotesSearch"
        />
        <p v-if="loadingLcVotes" class="muted">Loading LC votes data...</p>
        <p v-else-if="lcVotesResult.data.length === 0" class="muted">No entries found.</p>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Voter</th>
                <th>Item</th>
                <th>Character</th>
                <th>Vote</th>
                <th>Reason</th>
                <th>Vote Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in lcVotesResult.data" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ entry.voterName ?? '-' }}</td>
                <td>{{ entry.itemName ?? 'Unknown' }}</td>
                <td>{{ entry.characterName ?? '-' }}</td>
                <td>
                  <span :class="['badge', voteBadgeClass(entry.vote)]">
                    {{ entry.vote ?? '-' }}
                  </span>
                </td>
                <td class="truncate">{{ entry.reason ?? '-' }}</td>
                <td>{{ formatDate(entry.voteDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="lcVotesResult.totalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="lcVotesPage === 1"
            @click="setLcVotesPage(lcVotesPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ lcVotesPage }} of {{ lcVotesResult.totalPages }}</span>
          <button
            class="pagination__button"
            :disabled="lcVotesPage === lcVotesResult.totalPages"
            @click="setLcVotesPage(lcVotesPage + 1)"
          >
            Next
          </button>
        </div>
      </template>
    </article>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  api,
  type LootManagementSummary,
  type LootMasterEntry,
  type LcItemEntry,
  type LcRequestEntry,
  type LcVoteEntry,
  type PaginatedLootResult
} from '../services/api';

type TabId = 'loot-master' | 'lc-items' | 'lc-requests' | 'lc-votes';

interface Tab {
  id: TabId;
  label: string;
}

const tabs: Tab[] = [
  { id: 'loot-master', label: 'Loot Master' },
  { id: 'lc-items', label: 'LC Items' },
  { id: 'lc-requests', label: 'LC Requests' },
  { id: 'lc-votes', label: 'LC Votes' }
];

const activeTab = ref<TabId>('loot-master');

// Track which tabs have been loaded to avoid unnecessary reloads
const loadedTabs = ref<Set<TabId>>(new Set());

const summary = ref<LootManagementSummary>({
  lootMasterCount: 0,
  lcItemsCount: 0,
  lcRequestsCount: 0,
  lcVotesCount: 0
});

const pageSize = 25;

// Loot Master state
const loadingLootMaster = ref(false);
const lootMasterPage = ref(1);
const lootMasterSearch = ref('');
const lootMasterResult = ref<PaginatedLootResult<LootMasterEntry>>({
  data: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 0
});

// LC Items state
const loadingLcItems = ref(false);
const lcItemsPage = ref(1);
const lcItemsSearch = ref('');
const lcItemsResult = ref<PaginatedLootResult<LcItemEntry>>({
  data: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 0
});

// LC Requests state
const loadingLcRequests = ref(false);
const lcRequestsPage = ref(1);
const lcRequestsSearch = ref('');
const lcRequestsResult = ref<PaginatedLootResult<LcRequestEntry>>({
  data: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 0
});

// LC Votes state
const loadingLcVotes = ref(false);
const lcVotesPage = ref(1);
const lcVotesSearch = ref('');
const lcVotesResult = ref<PaginatedLootResult<LcVoteEntry>>({
  data: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 0
});

// Debounce timers - 500ms to reduce queries while typing
let lootMasterDebounce: ReturnType<typeof setTimeout> | null = null;
let lcItemsDebounce: ReturnType<typeof setTimeout> | null = null;
let lcRequestsDebounce: ReturnType<typeof setTimeout> | null = null;
let lcVotesDebounce: ReturnType<typeof setTimeout> | null = null;

async function loadSummary() {
  try {
    summary.value = await api.fetchLootManagementSummary();
  } catch (error) {
    console.error('Failed to load loot management summary', error);
  }
}

async function loadLootMasterData() {
  loadingLootMaster.value = true;
  try {
    lootMasterResult.value = await api.fetchLootMaster(
      lootMasterPage.value,
      pageSize,
      lootMasterSearch.value || undefined
    );
    loadedTabs.value.add('loot-master');
  } catch (error) {
    console.error('Failed to load loot master data', error);
  } finally {
    loadingLootMaster.value = false;
  }
}

async function loadLcItemsData() {
  loadingLcItems.value = true;
  try {
    lcItemsResult.value = await api.fetchLcItems(
      lcItemsPage.value,
      pageSize,
      lcItemsSearch.value || undefined
    );
    loadedTabs.value.add('lc-items');
  } catch (error) {
    console.error('Failed to load LC items data', error);
  } finally {
    loadingLcItems.value = false;
  }
}

async function loadLcRequestsData() {
  loadingLcRequests.value = true;
  try {
    lcRequestsResult.value = await api.fetchLcRequests(
      lcRequestsPage.value,
      pageSize,
      lcRequestsSearch.value || undefined
    );
    loadedTabs.value.add('lc-requests');
  } catch (error) {
    console.error('Failed to load LC requests data', error);
  } finally {
    loadingLcRequests.value = false;
  }
}

async function loadLcVotesData() {
  loadingLcVotes.value = true;
  try {
    lcVotesResult.value = await api.fetchLcVotes(
      lcVotesPage.value,
      pageSize,
      lcVotesSearch.value || undefined
    );
    loadedTabs.value.add('lc-votes');
  } catch (error) {
    console.error('Failed to load LC votes data', error);
  } finally {
    loadingLcVotes.value = false;
  }
}

function setActiveTab(tabId: TabId) {
  activeTab.value = tabId;
  // Load data for the selected tab only if not already loaded
  if (!loadedTabs.value.has(tabId)) {
    switch (tabId) {
      case 'loot-master':
        loadLootMasterData();
        break;
      case 'lc-items':
        loadLcItemsData();
        break;
      case 'lc-requests':
        loadLcRequestsData();
        break;
      case 'lc-votes':
        loadLcVotesData();
        break;
    }
  }
}

function setLootMasterPage(page: number) {
  lootMasterPage.value = Math.min(Math.max(1, page), lootMasterResult.value.totalPages);
  loadLootMasterData();
}

function setLcItemsPage(page: number) {
  lcItemsPage.value = Math.min(Math.max(1, page), lcItemsResult.value.totalPages);
  loadLcItemsData();
}

function setLcRequestsPage(page: number) {
  lcRequestsPage.value = Math.min(Math.max(1, page), lcRequestsResult.value.totalPages);
  loadLcRequestsData();
}

function setLcVotesPage(page: number) {
  lcVotesPage.value = Math.min(Math.max(1, page), lcVotesResult.value.totalPages);
  loadLcVotesData();
}

function debouncedLootMasterSearch() {
  if (lootMasterDebounce) clearTimeout(lootMasterDebounce);
  lootMasterDebounce = setTimeout(() => {
    lootMasterPage.value = 1;
    loadLootMasterData();
  }, 500);
}

function debouncedLcItemsSearch() {
  if (lcItemsDebounce) clearTimeout(lcItemsDebounce);
  lcItemsDebounce = setTimeout(() => {
    lcItemsPage.value = 1;
    loadLcItemsData();
  }, 500);
}

function debouncedLcRequestsSearch() {
  if (lcRequestsDebounce) clearTimeout(lcRequestsDebounce);
  lcRequestsDebounce = setTimeout(() => {
    lcRequestsPage.value = 1;
    loadLcRequestsData();
  }, 500);
}

function debouncedLcVotesSearch() {
  if (lcVotesDebounce) clearTimeout(lcVotesDebounce);
  lcVotesDebounce = setTimeout(() => {
    lcVotesPage.value = 1;
    loadLcVotesData();
  }, 500);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function statusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'badge--neutral';
  const lower = status.toLowerCase();
  if (lower.includes('approved') || lower.includes('complete') || lower.includes('awarded')) {
    return 'badge--positive';
  }
  if (lower.includes('denied') || lower.includes('rejected') || lower.includes('cancelled')) {
    return 'badge--negative';
  }
  if (lower.includes('pending') || lower.includes('waiting')) {
    return '';
  }
  return 'badge--neutral';
}

function voteBadgeClass(vote: string | null | undefined): string {
  if (!vote) return 'badge--neutral';
  const lower = vote.toLowerCase();
  if (lower.includes('yes') || lower.includes('approve') || lower === '+1' || lower === '1') {
    return 'badge--positive';
  }
  if (lower.includes('no') || lower.includes('deny') || lower === '-1' || lower === '0') {
    return 'badge--negative';
  }
  return 'badge--neutral';
}

onMounted(async () => {
  await loadSummary();
  await loadLootMasterData();
});
</script>

<style scoped>
.loot-management {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-bottom: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.section-header__titles h1 {
  margin: 0;
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.loot-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.45);
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 18px 40px rgba(59, 130, 246, 0.2);
}

.stat-card--accent {
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18));
}

.stat-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(226, 232, 240, 0.8);
}

.stat-card__value {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.stat-card__meta {
  font-size: 0.8rem;
  color: rgba(209, 213, 219, 0.75);
}

.tab-navigation {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tab-button {
  padding: 0.6rem 1.2rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.1s ease;
}

.tab-button:hover:not(.tab-button--active) {
  background: rgba(30, 41, 59, 0.75);
  border-color: rgba(148, 163, 184, 0.55);
  transform: translateY(-1px);
}

.tab-button--active {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(99, 102, 241, 0.2));
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
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

.card--wide {
  width: 100%;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card__header h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.icon-button {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: rgba(226, 232, 240, 0.85);
  border-radius: 999px;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.12s ease;
}

.icon-button:hover {
  color: #f8fafc;
  border-color: rgba(59, 130, 246, 0.65);
  transform: translateY(-1px);
}

.icon-button--refresh {
  width: 2rem;
  height: 2rem;
  font-size: 1rem;
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(148, 163, 184, 0.35);
}

.icon-button--refresh:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
  transform: translateY(-1px) rotate(-12deg);
}

.icon-button--refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(30, 41, 59, 0.75);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.table-wrapper {
  overflow-x: auto;
  margin: 0 -1.5rem;
  padding: 0 1.5rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.data-table th,
.data-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.data-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
  font-weight: 600;
  background: rgba(15, 23, 42, 0.5);
  white-space: nowrap;
}

.data-table tbody tr {
  transition: background 0.15s ease;
}

.data-table tbody tr:hover {
  background: rgba(30, 41, 59, 0.45);
}

.data-table td {
  color: #e2e8f0;
}

.truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
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
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.1s ease;
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

.btn {
  padding: 0.55rem 1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  text-decoration: none;
  transition:
    transform 0.1s ease,
    box-shadow 0.2s ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.btn--outline:hover {
  border-color: rgba(59, 130, 246, 0.65);
  color: #bae6fd;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .tab-navigation {
    width: 100%;
  }

  .tab-button {
    flex: 1;
    min-width: 120px;
    text-align: center;
  }

  .data-table th,
  .data-table td {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }
}
</style>
