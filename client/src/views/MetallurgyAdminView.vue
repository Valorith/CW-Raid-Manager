<template>
  <section class="metallurgy-admin">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Metallurgy Tracker</h1>
        <p class="muted">Track metallurgy ore distribution and character weights across the server.</p>
      </div>
      <router-link to="/admin" class="btn btn--outline">
        ← Back to Admin
      </router-link>
    </header>

    <GlobalLoadingSpinner v-if="showLoading" />

    <div v-else class="metallurgy-admin__content">
      <!-- Summary Stats -->
      <div class="metallurgy-admin__stats">
        <div class="stat-card">
          <span class="stat-card__label">Total Ore Owners</span>
          <strong class="stat-card__value">{{ totalOreOwners }}</strong>
        </div>
        <div class="stat-card stat-card--accent">
          <span class="stat-card__label">Total Ore Items</span>
          <strong class="stat-card__value">{{ totalOreItems.toLocaleString() }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Accounts with Weight</span>
          <strong class="stat-card__value">{{ data?.weights.length ?? 0 }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Total Weight</span>
          <strong class="stat-card__value">{{ formatWeight(totalWeight) }}</strong>
        </div>
      </div>

      <!-- Actions -->
      <div class="metallurgy-admin__actions">
        <button
          type="button"
          class="btn btn--accent"
          :disabled="refreshing"
          @click="refreshData"
        >
          {{ refreshing ? 'Refreshing...' : 'Refresh Data' }}
        </button>
      </div>

      <!-- Main Content Grid -->
      <div class="metallurgy-admin__grid">
        <!-- Ore Inventory Section -->
        <article class="metallurgy-admin__card">
          <header class="metallurgy-admin__card-header">
            <h2>Ore Inventory</h2>
            <span class="muted small">{{ data?.ores.length ?? 0 }} ore types tracked</span>
          </header>
          <div class="ore-list">
            <div
              v-for="ore in data?.ores"
              :key="ore.itemId"
              class="ore-item"
            >
              <button
                type="button"
                class="ore-item__header"
                :class="{ 'ore-item__header--expanded': expandedOres.has(ore.itemId) }"
                @click="toggleOreExpanded(ore.itemId)"
              >
                <div class="ore-item__info">
                  <span class="ore-item__tier" :class="`ore-item__tier--${ore.tier}`">
                    T{{ ore.tier }}
                  </span>
                  <span class="ore-item__name">{{ ore.name }}</span>
                </div>
                <div class="ore-item__stats">
                  <span class="ore-item__owners">{{ ore.totalOwners }} owner{{ ore.totalOwners !== 1 ? 's' : '' }}</span>
                  <span class="ore-item__quantity">{{ ore.totalQuantity.toLocaleString() }} total</span>
                  <span class="ore-item__expand">{{ expandedOres.has(ore.itemId) ? '−' : '+' }}</span>
                </div>
              </button>
              <Transition name="expand">
                <div v-if="expandedOres.has(ore.itemId)" class="ore-item__owners-list">
                  <div v-if="ore.owners.length === 0" class="ore-item__empty">
                    No owners found
                  </div>
                  <div
                    v-for="owner in ore.owners"
                    :key="`${owner.source}-${owner.characterId ?? owner.accountId}`"
                    class="ore-owner"
                  >
                    <div class="ore-owner__info">
                      <span class="ore-owner__name">{{ owner.name }}</span>
                      <span class="ore-owner__source" :class="`ore-owner__source--${owner.source}`">
                        {{ owner.source === 'sharedbank' ? 'Shared Bank' : 'Character' }}
                      </span>
                    </div>
                    <span class="ore-owner__quantity">{{ owner.quantity.toLocaleString() }}</span>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </article>

        <!-- Metallurgy Weight Section -->
        <article class="metallurgy-admin__card">
          <header class="metallurgy-admin__card-header">
            <div>
              <h2>Metallurgy Weight</h2>
              <span class="muted small">Accounts sorted by weight (highest first)</span>
            </div>
          </header>

          <!-- Search -->
          <div class="metallurgy-admin__search">
            <input
              v-model="weightSearch"
              type="search"
              class="input input--search"
              placeholder="Search by account name..."
            />
          </div>

          <div v-if="filteredWeights.length === 0" class="metallurgy-admin__empty">
            <p class="muted">{{ data?.weights.length === 0 ? 'No accounts have metallurgy weight.' : 'No matching accounts found.' }}</p>
          </div>

          <div v-else class="metallurgy-admin__table-wrapper">
            <table class="metallurgy-admin__table">
              <thead>
                <tr>
                  <th class="metallurgy-admin__th--rank">#</th>
                  <th class="metallurgy-admin__th--name">Account</th>
                  <th class="metallurgy-admin__th--weight">Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(account, index) in paginatedWeights" :key="account.accountId">
                  <td class="metallurgy-admin__td--rank">{{ weightStartIndex + index + 1 }}</td>
                  <td class="metallurgy-admin__td--name account-cell">
                    <span
                      class="account-name"
                      @wheel.prevent="(e) => handleTooltipScroll(e, `tooltip-${account.accountId}`)"
                    >{{ account.accountName }}<div v-if="account.characters.length > 0" class="character-tooltip">
                        <div class="character-tooltip__header">
                          Characters ({{ account.characters.length }})
                        </div>
                        <div
                          :ref="(el) => setTooltipRef(`tooltip-${account.accountId}`, el)"
                          class="character-tooltip__list"
                        >
                          <div
                            v-for="char in account.characters"
                            :key="char.name"
                            class="character-tooltip__item"
                          >
                            <span class="character-tooltip__name">{{ char.name }}</span>
                            <span class="character-tooltip__details">
                              {{ char.level }} {{ char.className }}
                            </span>
                          </div>
                        </div>
                      </div></span>
                  </td>
                  <td class="metallurgy-admin__td--weight">{{ formatWeight(account.weight) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="filteredWeights.length > 0" class="metallurgy-admin__pagination">
            <button
              class="pagination__button"
              :disabled="weightPage === 1"
              @click="weightPage = weightPage - 1"
            >
              Previous
            </button>
            <span class="pagination__label">
              Page {{ weightPage }} of {{ totalWeightPages }}
              ({{ filteredWeights.length }} total)
            </span>
            <button
              class="pagination__button"
              :disabled="weightPage === totalWeightPages"
              @click="weightPage = weightPage + 1"
            >
              Next
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { api, type MetallurgyData, type MetallurgyWeight } from '../services/api';

const loading = ref(false);
const showLoading = useMinimumLoading(loading);
const refreshing = ref(false);
const data = ref<MetallurgyData | null>(null);

// Tooltip refs for scroll handling
const tooltipRefs = new Map<string, HTMLElement | null>();

function setTooltipRef(key: string, el: unknown) {
  tooltipRefs.set(key, el as HTMLElement | null);
}

function handleTooltipScroll(event: WheelEvent, tooltipKey: string) {
  const tooltipList = tooltipRefs.get(tooltipKey);
  if (tooltipList) {
    tooltipList.scrollTop += event.deltaY;
  }
}

// Expanded ore items
const expandedOres = ref<Set<number>>(new Set());

// Weight search and pagination
const weightSearch = ref('');
const weightPage = ref(1);
const weightsPerPage = 10;

// Computed: Total unique ore owners (across all ore types)
const totalOreOwners = computed(() => {
  if (!data.value) return 0;
  const ownerSet = new Set<string>();
  for (const ore of data.value.ores) {
    for (const owner of ore.owners) {
      const key = owner.source === 'character'
        ? `char-${owner.characterId}`
        : `acct-${owner.accountId}`;
      ownerSet.add(key);
    }
  }
  return ownerSet.size;
});

// Computed: Total ore items
const totalOreItems = computed(() => {
  if (!data.value) return 0;
  return data.value.ores.reduce((sum, ore) => sum + ore.totalQuantity, 0);
});

// Computed: Total metallurgy weight
const totalWeight = computed(() => {
  if (!data.value) return 0;
  return data.value.weights.reduce((sum, w) => sum + w.weight, 0);
});

// Computed: Filtered weights by search (searches account name and character names)
const filteredWeights = computed<MetallurgyWeight[]>(() => {
  if (!data.value) return [];
  const query = weightSearch.value.trim().toLowerCase();
  if (!query) return data.value.weights;
  return data.value.weights.filter((w) =>
    w.accountName.toLowerCase().includes(query) ||
    w.characters.some((c) => c.name.toLowerCase().includes(query))
  );
});

// Computed: Pagination
const totalWeightPages = computed(() =>
  Math.max(1, Math.ceil(filteredWeights.value.length / weightsPerPage))
);

const weightStartIndex = computed(() => (weightPage.value - 1) * weightsPerPage);

const paginatedWeights = computed(() => {
  const start = weightStartIndex.value;
  return filteredWeights.value.slice(start, start + weightsPerPage);
});

// Reset page when search changes
watch(weightSearch, () => {
  weightPage.value = 1;
});

// Format weight as kg with 2 decimal places
function formatWeight(weight: number): string {
  return `${weight.toFixed(2)} kg`;
}

// Toggle ore expansion
function toggleOreExpanded(itemId: number) {
  if (expandedOres.value.has(itemId)) {
    expandedOres.value.delete(itemId);
  } else {
    expandedOres.value.add(itemId);
  }
}

// Load data
async function loadData() {
  loading.value = true;
  try {
    data.value = await api.fetchMetallurgyData();
  } catch (error) {
    console.error('Failed to load metallurgy data:', error);
    window.alert('Failed to load metallurgy data. Please try again.');
  } finally {
    loading.value = false;
  }
}

// Refresh data
async function refreshData() {
  refreshing.value = true;
  try {
    data.value = await api.fetchMetallurgyData();
  } catch (error) {
    console.error('Failed to refresh metallurgy data:', error);
    window.alert('Failed to refresh metallurgy data. Please try again.');
  } finally {
    refreshing.value = false;
  }
}

onMounted(async () => {
  await loadData();
});
</script>

<style scoped>
.metallurgy-admin {
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
}

.section-header__titles .muted {
  margin: 0.25rem 0 0;
}

/* Stats Grid */
.metallurgy-admin__stats {
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
}

.stat-card--accent {
  border-color: rgba(59, 130, 246, 0.4);
  background: linear-gradient(140deg, rgba(59, 130, 246, 0.15), rgba(30, 41, 59, 0.75));
}

.stat-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
}

.stat-card__value {
  font-size: 1.5rem;
  font-weight: 700;
}

/* Actions */
.metallurgy-admin__actions {
  display: flex;
  gap: 1rem;
}

/* Main Grid */
.metallurgy-admin__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .metallurgy-admin__grid {
    grid-template-columns: 1fr;
  }
}

/* Card Styles */
.metallurgy-admin__card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metallurgy-admin__card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.metallurgy-admin__card-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

/* Search */
.metallurgy-admin__search {
  margin-bottom: 0.5rem;
}

.input--search {
  width: 100%;
  padding: 0.625rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: inherit;
  font-size: 0.875rem;
}

.input--search:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
}

/* Empty State */
.metallurgy-admin__empty {
  text-align: center;
  padding: 2rem;
}

/* Ore List Styles */
.ore-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 600px;
  overflow-y: auto;
}

.ore-item {
  border-radius: 0.75rem;
  background: rgba(30, 41, 59, 0.45);
  overflow: hidden;
}

.ore-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.ore-item__header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.ore-item__header--expanded {
  background: rgba(255, 255, 255, 0.03);
}

.ore-item__info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ore-item__tier {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}

.ore-item__tier--1 {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.ore-item__tier--2 {
  background: rgba(96, 165, 250, 0.2);
  color: #60a5fa;
}

.ore-item__tier--3 {
  background: rgba(251, 146, 60, 0.2);
  color: #fb923c;
}

.ore-item__name {
  font-weight: 600;
}

.ore-item__stats {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--color-muted, #94a3b8);
}

.ore-item__quantity {
  font-weight: 600;
  color: var(--color-accent, #60a5fa);
}

.ore-item__expand {
  font-size: 1.25rem;
  font-weight: 300;
  color: var(--color-muted, #94a3b8);
  width: 1.5rem;
  text-align: center;
}

/* Ore Owners List */
.ore-item__owners-list {
  padding: 0.5rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  max-height: 300px;
  overflow-y: auto;
}

.ore-item__empty {
  padding: 0.5rem;
  text-align: center;
  color: var(--color-muted, #94a3b8);
  font-size: 0.875rem;
}

.ore-owner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.5rem;
}

.ore-owner__info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ore-owner__name {
  font-weight: 500;
}

.ore-owner__source {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ore-owner__source--character {
  background: rgba(96, 165, 250, 0.2);
  color: #60a5fa;
}

.ore-owner__source--sharedbank {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.ore-owner__quantity {
  font-weight: 600;
  font-size: 0.875rem;
}

/* Expand Transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Table Styles */
.metallurgy-admin__table-wrapper {
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
}

.metallurgy-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.metallurgy-admin__table th,
.metallurgy-admin__table td {
  padding: 0.75rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #334155);
}

.metallurgy-admin__table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
}

.metallurgy-admin__table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.metallurgy-admin__th--rank {
  width: 50px;
  text-align: center;
}

.metallurgy-admin__td--rank {
  text-align: center;
  color: var(--color-muted, #94a3b8);
}

.metallurgy-admin__td--name {
  font-weight: 500;
}

.metallurgy-admin__td--weight {
  font-weight: 600;
  color: var(--color-accent, #60a5fa);
}

/* Pagination */
.metallurgy-admin__pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border, #334155);
  margin-top: 0.5rem;
}

.pagination__button {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--color-border, #334155);
  color: inherit;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--color-accent, #60a5fa);
}

.pagination__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination__label {
  font-size: 0.875rem;
  color: var(--color-muted, #94a3b8);
}

/* Account Cell with Tooltip */
.account-cell {
  overflow: visible;
}

.account-name {
  position: relative;
  cursor: help;
  border-bottom: 1px dotted var(--color-muted, #94a3b8);
}

.character-tooltip {
  display: none;
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  min-width: 220px;
  max-width: 300px;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  margin-left: 0.75rem;
  pointer-events: none;
}

.account-name:hover .character-tooltip {
  display: block;
}

.character-tooltip__header {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.character-tooltip__list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.character-tooltip__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.character-tooltip__item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.character-tooltip__name {
  font-weight: 500;
  color: #fff;
}

.character-tooltip__details {
  font-size: 0.75rem;
  color: var(--color-muted, #94a3b8);
  white-space: nowrap;
}

/* Responsive */
@media (max-width: 768px) {
  .metallurgy-admin {
    padding: 1rem;
  }

  .metallurgy-admin__stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .ore-item__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .ore-item__stats {
    width: 100%;
    justify-content: space-between;
  }

  .metallurgy-admin__table {
    font-size: 0.75rem;
  }

  .metallurgy-admin__table th,
  .metallurgy-admin__table td {
    padding: 0.5rem;
  }
}
</style>
