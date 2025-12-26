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
          <span class="stat-card__label">Total Snapshots</span>
          <strong class="stat-card__value">{{ summary?.totalSnapshots ?? 0 }}</strong>
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
          :disabled="creatingSnapshot"
          @click="takeSnapshot"
        >
          {{ creatingSnapshot ? 'Creating Snapshot...' : 'Take Snapshot Now' }}
        </button>
        <button
          type="button"
          class="btn btn--outline"
          :disabled="refreshing"
          @click="refreshData"
        >
          {{ refreshing ? 'Refreshing...' : 'Refresh Live Data' }}
        </button>
      </div>

      <!-- Date Range Filter -->
      <div class="metallurgy-admin__filters">
        <label class="metallurgy-admin__filter">
          <span>Date Range:</span>
          <select v-model="dateRange" class="input">
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="180">Last 6 Months</option>
            <option value="365">Last Year</option>
            <option value="all">All Time</option>
          </select>
        </label>
      </div>

      <!-- Chart Section -->
      <article class="metallurgy-admin__chart-card">
        <header class="metallurgy-admin__chart-header">
          <div>
            <h2>Metallurgy Trends Over Time</h2>
            <span class="muted small">Total weight and ore counts</span>
          </div>
          <button
            type="button"
            class="btn btn--outline btn--sm"
            @click="openSnapshotHistory"
          >
            View All Snapshots
          </button>
        </header>
        <div class="metallurgy-admin__chart">
          <Line
            v-if="hasChartData"
            :data="chartData"
            :options="chartOptions"
          />
          <p v-else class="metallurgy-admin__chart-empty muted">
            No snapshots available. Click "Take Snapshot Now" to create your first snapshot.
          </p>
        </div>
      </article>

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

    <!-- Snapshot History Modal -->
    <div v-if="showSnapshotHistory" class="modal-backdrop" @click.self="closeSnapshotHistory">
      <div class="modal modal--wide">
        <header class="modal__header">
          <div>
            <h2 class="modal__title">Snapshot History</h2>
            <p class="muted">All recorded metallurgy snapshots</p>
          </div>
          <button class="icon-button" @click="closeSnapshotHistory">✕</button>
        </header>

        <div class="modal__body">
          <GlobalLoadingSpinner v-if="showLoadingAllSnapshots" />
          <div v-else-if="allSnapshots.length === 0" class="modal__empty">
            <p class="muted">No snapshots found.</p>
          </div>
          <div v-else class="modal__table-wrapper">
            <table class="snapshot-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Taken At</th>
                  <th>Total Weight</th>
                  <th>Accounts</th>
                  <th>Tin</th>
                  <th>Copper</th>
                  <th>Iron</th>
                  <th>Zinc</th>
                  <th>Nickel</th>
                  <th>Cobalt</th>
                  <th>Manganese</th>
                  <th>Tungsten</th>
                  <th>Chromium</th>
                  <th class="snapshot-history-table__th-actions"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="snapshot in paginatedHistorySnapshots" :key="snapshot.id">
                  <td class="snapshot-history-table__date">
                    {{ formatSnapshotDate(snapshot.snapshotDate) }}
                  </td>
                  <td class="snapshot-history-table__time">
                    {{ formatSnapshotTime(snapshot.createdAt) }}
                  </td>
                  <td class="snapshot-history-table__weight">
                    {{ formatWeight(snapshot.totalWeight) }}
                  </td>
                  <td>{{ snapshot.accountCount }}</td>
                  <td>{{ snapshot.tinOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.copperOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.ironOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.zincOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.nickelOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.cobaltOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.manganeseOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.tungstenOreCount.toLocaleString() }}</td>
                  <td>{{ snapshot.chromiumOreCount.toLocaleString() }}</td>
                  <td class="snapshot-history-table__actions">
                    <button
                      type="button"
                      class="btn btn--danger btn--sm"
                      :disabled="deletingSnapshotId === snapshot.id"
                      @click="confirmDeleteSnapshot(snapshot)"
                    >
                      {{ deletingSnapshotId === snapshot.id ? 'Deleting...' : 'Delete' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- Pagination Controls -->
            <div v-if="snapshotHistoryTotalPages > 1" class="snapshot-history-pagination">
              <button
                class="pagination__button"
                :disabled="snapshotHistoryPage === 1"
                @click="snapshotHistoryPage = snapshotHistoryPage - 1"
              >
                Previous
              </button>
              <span class="pagination__label">
                Page {{ snapshotHistoryPage }} of {{ snapshotHistoryTotalPages }}
              </span>
              <button
                class="pagination__button"
                :disabled="snapshotHistoryPage === snapshotHistoryTotalPages"
                @click="snapshotHistoryPage = snapshotHistoryPage + 1"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <footer class="modal__actions">
          <button class="btn btn--outline" @click="closeSnapshotHistory">Close</button>
        </footer>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="cancelDelete">
      <div class="modal modal--sm">
        <header class="modal__header">
          <h2 class="modal__title">Delete Snapshot?</h2>
          <button class="icon-button" @click="cancelDelete">✕</button>
        </header>
        <div class="modal__body">
          <p>Are you sure you want to delete the snapshot from <strong>{{ snapshotToDelete ? formatSnapshotDate(snapshotToDelete.snapshotDate) : '' }}</strong>?</p>
          <p class="muted small">This action cannot be undone.</p>
        </div>
        <footer class="modal__actions">
          <button class="btn btn--outline" @click="cancelDelete">Cancel</button>
          <button
            class="btn btn--danger"
            :disabled="deletingSnapshotId !== null"
            @click="executeDeleteSnapshot"
          >
            {{ deletingSnapshotId ? 'Deleting...' : 'Delete' }}
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';

import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { ensureChartJsRegistered } from '../utils/registerCharts';
import {
  api,
  type MetallurgyData,
  type MetallurgyWeight,
  type MetallurgySnapshot,
  type MetallurgySummary
} from '../services/api';

ensureChartJsRegistered();

// Loading state
const loading = ref(false);
const showLoading = useMinimumLoading(loading);
const refreshing = ref(false);
const creatingSnapshot = ref(false);

// Data
const data = ref<MetallurgyData | null>(null);
const snapshots = ref<MetallurgySnapshot[]>([]);
const allSnapshots = ref<MetallurgySnapshot[]>([]);
const summary = ref<MetallurgySummary | null>(null);

// Date range filter
const dateRange = ref('90');

// Snapshot history modal
const showSnapshotHistory = ref(false);
const loadingAllSnapshots = ref(false);
const showLoadingAllSnapshots = useMinimumLoading(loadingAllSnapshots);
const snapshotHistoryPage = ref(1);
const snapshotHistoryPageSize = 10;

// Delete state
const showDeleteConfirm = ref(false);
const snapshotToDelete = ref<MetallurgySnapshot | null>(null);
const deletingSnapshotId = ref<string | null>(null);

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

// Computed: Pagination for weights
const totalWeightPages = computed(() =>
  Math.max(1, Math.ceil(filteredWeights.value.length / weightsPerPage))
);

const weightStartIndex = computed(() => (weightPage.value - 1) * weightsPerPage);

const paginatedWeights = computed(() => {
  const start = weightStartIndex.value;
  return filteredWeights.value.slice(start, start + weightsPerPage);
});

// Computed: Pagination for snapshot history
const snapshotHistoryTotalPages = computed(() => {
  return Math.max(1, Math.ceil(allSnapshots.value.length / snapshotHistoryPageSize));
});

const paginatedHistorySnapshots = computed(() => {
  const startIndex = (snapshotHistoryPage.value - 1) * snapshotHistoryPageSize;
  const endIndex = startIndex + snapshotHistoryPageSize;
  return allSnapshots.value.slice(startIndex, endIndex);
});

// Computed: Chart data availability
const hasChartData = computed(() => snapshots.value.length > 0);

// Computed: Chart data with multiple datasets
const chartData = computed(() => {
  const labels = snapshots.value.map((s) => {
    const date = new Date(s.snapshotDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  });

  return {
    labels,
    datasets: [
      {
        label: 'Total Weight (kg)',
        data: snapshots.value.map((s) => s.totalWeight),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        fill: false,
        tension: 0.35,
        yAxisID: 'yWeight'
      },
      {
        label: 'Tin Ore',
        data: snapshots.value.map((s) => s.tinOreCount),
        borderColor: '#4ade80',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Copper Ore',
        data: snapshots.value.map((s) => s.copperOreCount),
        borderColor: '#f97316',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Iron Ore',
        data: snapshots.value.map((s) => s.ironOreCount),
        borderColor: '#a3a3a3',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Zinc Ore',
        data: snapshots.value.map((s) => s.zincOreCount),
        borderColor: '#a78bfa',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Nickel Ore',
        data: snapshots.value.map((s) => s.nickelOreCount),
        borderColor: '#22d3d8',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Cobalt Ore',
        data: snapshots.value.map((s) => s.cobaltOreCount),
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Manganese Ore',
        data: snapshots.value.map((s) => s.manganeseOreCount),
        borderColor: '#ec4899',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Tungsten Ore',
        data: snapshots.value.map((s) => s.tungstenOreCount),
        borderColor: '#eab308',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      },
      {
        label: 'Chromium Ore',
        data: snapshots.value.map((s) => s.chromiumOreCount),
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        yAxisID: 'yOre'
      }
    ]
  };
});

// Computed: Chart options
const chartOptions = computed(() => {
  return {
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      yWeight: {
        type: 'linear' as const,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Weight (kg)'
        },
        ticks: {
          callback: (value: number) => `${value.toFixed(1)} kg`
        }
      },
      yOre: {
        type: 'linear' as const,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Ore Count'
        },
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          callback: (value: number) => value.toLocaleString()
        }
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 0
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        callbacks: {
          title: (context: { dataIndex: number }[]) => {
            if (context.length === 0) return '';
            const snapshot = snapshots.value[context[0].dataIndex];
            if (!snapshot) return '';
            const snapshotDate = formatSnapshotDate(snapshot.snapshotDate);
            const createdTime = formatSnapshotTime(snapshot.createdAt);
            return [snapshotDate, `Taken: ${createdTime}`];
          }
        }
      }
    }
  };
});

// Reset page when search changes
watch(weightSearch, () => {
  weightPage.value = 1;
});

// Watch date range changes and reload snapshots
watch(dateRange, async () => {
  await loadSnapshots();
});

// Format weight as kg with 2 decimal places
function formatWeight(weight: number): string {
  return `${weight.toFixed(2)} kg`;
}

// Format snapshot date
function formatSnapshotDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

// Format snapshot time
function formatSnapshotTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Toggle ore expansion
function toggleOreExpanded(itemId: number) {
  if (expandedOres.value.has(itemId)) {
    expandedOres.value.delete(itemId);
  } else {
    expandedOres.value.add(itemId);
  }
}

// Load live data
async function loadData() {
  loading.value = true;
  try {
    const [metallurgyData, snapshotSummary] = await Promise.all([
      api.fetchMetallurgyData(),
      api.fetchMetallurgySummary()
    ]);
    data.value = metallurgyData;
    summary.value = snapshotSummary;
    await loadSnapshots();
  } catch (error) {
    console.error('Failed to load metallurgy data:', error);
    window.alert('Failed to load metallurgy data. Please try again.');
  } finally {
    loading.value = false;
  }
}

// Load snapshots based on date range
async function loadSnapshots() {
  try {
    const options = dateRange.value === 'all'
      ? undefined
      : { days: parseInt(dateRange.value, 10) };
    snapshots.value = await api.fetchMetallurgySnapshots(options);
  } catch (error) {
    console.error('Failed to load snapshots:', error);
  }
}

// Refresh live data
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

// Take a new snapshot
async function takeSnapshot() {
  creatingSnapshot.value = true;
  try {
    await api.createMetallurgySnapshot();
    // Reload snapshots and summary
    const [snapshotSummary] = await Promise.all([
      api.fetchMetallurgySummary(),
      loadSnapshots()
    ]);
    summary.value = snapshotSummary;
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    window.alert('Failed to create snapshot. Please try again.');
  } finally {
    creatingSnapshot.value = false;
  }
}

// Open snapshot history modal
async function openSnapshotHistory() {
  showSnapshotHistory.value = true;
  snapshotHistoryPage.value = 1;
  loadingAllSnapshots.value = true;
  try {
    allSnapshots.value = await api.fetchMetallurgySnapshots();
    // Sort by date descending for history view
    allSnapshots.value.sort((a, b) =>
      new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
    );
  } catch (error) {
    console.error('Failed to load all snapshots:', error);
  } finally {
    loadingAllSnapshots.value = false;
  }
}

// Close snapshot history modal
function closeSnapshotHistory() {
  showSnapshotHistory.value = false;
}

// Confirm delete snapshot
function confirmDeleteSnapshot(snapshot: MetallurgySnapshot) {
  snapshotToDelete.value = snapshot;
  showDeleteConfirm.value = true;
}

// Cancel delete
function cancelDelete() {
  showDeleteConfirm.value = false;
  snapshotToDelete.value = null;
}

// Execute delete snapshot
async function executeDeleteSnapshot() {
  if (!snapshotToDelete.value) return;

  deletingSnapshotId.value = snapshotToDelete.value.id;
  try {
    await api.deleteMetallurgySnapshot(snapshotToDelete.value.id);
    // Remove from lists
    allSnapshots.value = allSnapshots.value.filter((s) => s.id !== snapshotToDelete.value?.id);
    snapshots.value = snapshots.value.filter((s) => s.id !== snapshotToDelete.value?.id);
    // Update summary
    summary.value = await api.fetchMetallurgySummary();
    showDeleteConfirm.value = false;
    snapshotToDelete.value = null;
  } catch (error) {
    console.error('Failed to delete snapshot:', error);
    window.alert('Failed to delete snapshot. Please try again.');
  } finally {
    deletingSnapshotId.value = null;
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
  gap: 1.75rem;
  padding-bottom: 2rem;
}

.metallurgy-admin__content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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

.section-header__titles .muted {
  margin: 0.35rem 0 0;
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
  border-color: rgba(59, 130, 246, 0.4);
  background: linear-gradient(140deg, rgba(59, 130, 246, 0.15), rgba(30, 41, 59, 0.75));
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

/* Actions */
.metallurgy-admin__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Buttons */
.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  transition:
    transform 0.1s ease,
    box-shadow 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--accent {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #0f172a;
  border: none;
}

.btn--accent:hover:not(:disabled) {
  box-shadow: 0 12px 28px rgba(99, 102, 241, 0.35);
}

.btn--outline {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
}

.btn--outline:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
}

.btn--sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
}

.btn--danger {
  background: rgba(248, 113, 113, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.3);
  border-color: rgba(248, 113, 113, 0.6);
  box-shadow: 0 10px 24px rgba(248, 113, 113, 0.2);
}

/* Filters */
.metallurgy-admin__filters {
  display: flex;
  gap: 1rem;
}

.metallurgy-admin__filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.metallurgy-admin__filter .input {
  padding: 0.5rem 0.75rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: inherit;
  font-size: 0.875rem;
}

/* Chart Card */
.metallurgy-admin__chart-card {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.7));
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.35);
}

.metallurgy-admin__chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.metallurgy-admin__chart-header h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  color: #e2e8f0;
}

.metallurgy-admin__chart {
  height: 400px;
}

.metallurgy-admin__chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
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
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.7));
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.35);
}

.metallurgy-admin__card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.metallurgy-admin__card-header h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  color: #e2e8f0;
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
  overflow: visible;
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
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
  border-radius: 0.55rem;
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

.pagination__label {
  font-size: 0.85rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.12em;
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
  z-index: 9999;
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

/* Modal Styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 13, 23, 0.76);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 2rem;
}

.modal {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.88));
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(11, 19, 33, 0.65);
}

.modal--wide {
  max-width: 1200px;
}

.modal--sm {
  max-width: 400px;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.5rem 1.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.modal__title {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.modal__body {
  padding: 1.5rem 1.75rem;
  overflow-y: auto;
  flex: 1;
}

.modal__empty {
  text-align: center;
  padding: 2rem;
}

.modal__table-wrapper {
  overflow-x: auto;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.25rem 1.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  flex-wrap: wrap;
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
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
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

/* Snapshot History Table */
.snapshot-history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.snapshot-history-table th,
.snapshot-history-table td {
  padding: 0.625rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #334155);
  white-space: nowrap;
}

.snapshot-history-table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
  position: sticky;
  top: 0;
  background: rgb(15, 23, 42);
}

.snapshot-history-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.snapshot-history-table__date {
  font-weight: 500;
}

.snapshot-history-table__time {
  color: var(--color-muted, #94a3b8);
}

.snapshot-history-table__weight {
  font-weight: 600;
  color: var(--color-accent, #60a5fa);
}

.snapshot-history-table__th-actions {
  width: 80px;
}

.snapshot-history-table__actions {
  text-align: right;
}

.snapshot-history-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  margin-top: 1rem;
  border-top: 1px solid var(--color-border, #334155);
}

/* Responsive */
@media (max-width: 768px) {
  .metallurgy-admin {
    padding: 1rem;
  }

  .metallurgy-admin__stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .metallurgy-admin__chart {
    height: 300px;
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
