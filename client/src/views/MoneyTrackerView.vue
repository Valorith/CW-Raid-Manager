<template>
  <section class="money-tracker">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Money Tracker</h1>
        <p class="muted">Track server-wide currency trends over time.</p>
      </div>
      <router-link to="/admin" class="btn btn--outline">
        ← Back to Admin
      </router-link>
    </header>

    <div v-if="!isConfigured" class="money-tracker__error">
      <p>EQ Database is not configured. Please set EQ_DB_* environment variables.</p>
    </div>

    <div v-else-if="loading" class="money-tracker__loading">
      <p class="muted">Loading money tracker data...</p>
    </div>

    <div v-else class="money-tracker__content">
      <!-- Summary Stats -->
      <div class="money-tracker__stats">
        <div class="stat-card">
          <span class="stat-card__label">Total Snapshots</span>
          <strong class="stat-card__value">{{ summary?.totalSnapshots ?? 0 }}</strong>
        </div>
        <div class="stat-card stat-card--accent">
          <span class="stat-card__label">Current Server Wealth</span>
          <strong class="stat-card__value">{{ formatPlatinum(latestTotalPlatinum) }}</strong>
          <span class="stat-card__meta">platinum equivalent</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Characters Tracked</span>
          <strong class="stat-card__value">{{ latestSnapshot?.characterCount ?? 0 }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Latest Snapshot</span>
          <strong class="stat-card__value">{{ formatSnapshotDate(latestSnapshot?.snapshotDate) }}</strong>
        </div>
      </div>

      <!-- Actions -->
      <div class="money-tracker__actions">
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
          :disabled="refreshingLive"
          @click="refreshLiveData"
        >
          {{ refreshingLive ? 'Refreshing...' : 'Refresh Live Data' }}
        </button>
      </div>

      <!-- Date Range Filter -->
      <div class="money-tracker__filters">
        <label class="money-tracker__filter">
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
      <article class="money-tracker__chart-card">
        <header class="money-tracker__chart-header">
          <h2>Server Currency Over Time</h2>
          <span class="muted small">Total platinum equivalent across all characters</span>
        </header>
        <div class="money-tracker__chart">
          <Line
            v-if="hasChartData"
            :data="chartData"
            :options="chartOptions"
          />
          <p v-else class="money-tracker__empty muted">
            No snapshots available. Click "Take Snapshot Now" to create your first snapshot.
          </p>
        </div>
      </article>

      <!-- Top 20 Characters Table -->
      <article class="money-tracker__table-card">
        <header class="money-tracker__table-header">
          <h2>Top 20 Wealthiest Characters</h2>
          <span class="muted small">From {{ tableDataSource }}</span>
        </header>
        <div v-if="topCharacters.length > 0" class="money-tracker__table-wrapper">
          <table class="money-tracker__table">
            <thead>
              <tr>
                <th class="money-tracker__th--rank">#</th>
                <th class="money-tracker__th--name">Character</th>
                <th class="money-tracker__th--total">Total (PP)</th>
                <th class="money-tracker__th--inventory">Inventory</th>
                <th class="money-tracker__th--bank">Bank</th>
                <th class="money-tracker__th--cursor">Cursor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(char, index) in topCharacters" :key="char.id">
                <td class="money-tracker__td--rank">{{ index + 1 }}</td>
                <td class="money-tracker__td--name">{{ char.name }}</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(char.totalPlatinumEquivalent) }}</td>
                <td class="money-tracker__td--inventory">
                  <span class="currency-breakdown">
                    {{ formatCurrency(char.platinum, char.gold, char.silver, char.copper) }}
                  </span>
                </td>
                <td class="money-tracker__td--bank">
                  <span class="currency-breakdown">
                    {{ formatCurrency(char.platinumBank, char.goldBank, char.silverBank, char.copperBank) }}
                  </span>
                </td>
                <td class="money-tracker__td--cursor">
                  <span class="currency-breakdown">
                    {{ formatCurrency(char.platinumCursor, char.goldCursor, char.silverCursor, char.copperCursor) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="money-tracker__empty muted">
          No character data available.
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import axios from 'axios';

import { ensureChartJsRegistered } from '../utils/registerCharts';

ensureChartJsRegistered();

interface TopCharacterCurrency {
  id: number;
  name: string;
  totalPlatinumEquivalent: number;
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  platinumBank: number;
  goldBank: number;
  silverBank: number;
  copperBank: number;
  platinumCursor: number;
  goldCursor: number;
  silverCursor: number;
  copperCursor: number;
}

interface MoneySnapshot {
  id: string;
  snapshotDate: string;
  totalPlatinum: string;
  totalGold: string;
  totalSilver: string;
  totalCopper: string;
  totalPlatinumBank: string;
  totalGoldBank: string;
  totalSilverBank: string;
  totalCopperBank: string;
  totalPlatinumCursor: string;
  totalGoldCursor: string;
  totalSilverCursor: string;
  totalCopperCursor: string;
  totalPlatinumEquivalent: string;
  topCharacters: TopCharacterCurrency[];
  characterCount: number;
  createdAt: string;
}

interface MoneyTrackerSummary {
  totalSnapshots: number;
  latestSnapshot: MoneySnapshot | null;
  oldestSnapshotDate: string | null;
  newestSnapshotDate: string | null;
}

interface LiveData {
  totals: {
    platinum: string;
    gold: string;
    silver: string;
    copper: string;
    platinumBank: string;
    goldBank: string;
    silverBank: string;
    copperBank: string;
    platinumCursor: string;
    goldCursor: string;
    silverCursor: string;
    copperCursor: string;
    totalPlatinumEquivalent: string;
    characterCount: number;
  };
  topCharacters: TopCharacterCurrency[];
  timestamp: string;
}

// State
const loading = ref(true);
const isConfigured = ref(true);
const creatingSnapshot = ref(false);
const refreshingLive = ref(false);
const dateRange = ref('90');
const summary = ref<MoneyTrackerSummary | null>(null);
const snapshots = ref<MoneySnapshot[]>([]);
const liveData = ref<LiveData | null>(null);

// Computed
const latestSnapshot = computed(() => summary.value?.latestSnapshot ?? null);

const latestTotalPlatinum = computed(() => {
  if (liveData.value) {
    return Number(liveData.value.totals.totalPlatinumEquivalent) / 1000;
  }
  if (latestSnapshot.value) {
    return Number(latestSnapshot.value.totalPlatinumEquivalent) / 1000;
  }
  return 0;
});

const topCharacters = computed<TopCharacterCurrency[]>(() => {
  if (liveData.value) {
    return liveData.value.topCharacters;
  }
  if (latestSnapshot.value) {
    return latestSnapshot.value.topCharacters;
  }
  return [];
});

const tableDataSource = computed(() => {
  if (liveData.value) {
    return `live data (${formatSnapshotDate(liveData.value.timestamp)})`;
  }
  if (latestSnapshot.value) {
    return `latest snapshot (${formatSnapshotDate(latestSnapshot.value.snapshotDate)})`;
  }
  return 'no data';
});

const hasChartData = computed(() => snapshots.value.length > 0);

const chartData = computed(() => {
  const labels = snapshots.value.map((s) => {
    const date = new Date(s.snapshotDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const data = snapshots.value.map((s) => {
    // Convert from copper to platinum (divide by 1000)
    return Number(s.totalPlatinumEquivalent) / 1000;
  });

  return {
    labels,
    datasets: [
      {
        label: 'Server Wealth (Platinum)',
        data,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        fill: true,
        tension: 0.35
      }
    ]
  };
});

const chartOptions = computed(() => ({
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    y: {
      beginAtZero: false,
      ticks: {
        callback: (value: number) => formatPlatinum(value)
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
    tooltip: {
      callbacks: {
        label: (context: { parsed: { y: number } }) => {
          return `Total: ${formatPlatinum(context.parsed.y)} PP`;
        }
      }
    }
  }
}));

// Methods
function formatPlatinum(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatCurrency(pp: number, gp: number, sp: number, cp: number): string {
  const parts: string[] = [];
  if (pp > 0) parts.push(`${pp.toLocaleString()}pp`);
  if (gp > 0) parts.push(`${gp}gp`);
  if (sp > 0) parts.push(`${sp}sp`);
  if (cp > 0) parts.push(`${cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '0pp';
}

function formatSnapshotDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

async function checkStatus(): Promise<boolean> {
  try {
    const response = await axios.get('/api/admin/money-tracker/status');
    return response.data.configured;
  } catch {
    return false;
  }
}

async function fetchSummary(): Promise<void> {
  try {
    const response = await axios.get('/api/admin/money-tracker/summary');
    summary.value = response.data;
  } catch (error) {
    console.error('Failed to fetch summary:', error);
  }
}

async function fetchSnapshots(): Promise<void> {
  try {
    const params: Record<string, string> = {};
    if (dateRange.value !== 'all') {
      const days = parseInt(dateRange.value, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      params.startDate = startDate.toISOString().split('T')[0];
    }
    params.limit = '365';

    const response = await axios.get('/api/admin/money-tracker/snapshots', { params });
    snapshots.value = response.data.snapshots;
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
  }
}

async function refreshLiveData(): Promise<void> {
  refreshingLive.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/live');
    liveData.value = response.data;
  } catch (error) {
    console.error('Failed to fetch live data:', error);
  } finally {
    refreshingLive.value = false;
  }
}

async function takeSnapshot(): Promise<void> {
  creatingSnapshot.value = true;
  try {
    await axios.post('/api/admin/money-tracker/snapshots');
    // Refresh all data after creating a snapshot
    await Promise.all([fetchSummary(), fetchSnapshots()]);
    liveData.value = null; // Clear live data to show the new snapshot
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      alert('A snapshot already exists for today. Only one snapshot per day is allowed.');
    } else {
      console.error('Failed to create snapshot:', error);
      alert('Failed to create snapshot. Please try again.');
    }
  } finally {
    creatingSnapshot.value = false;
  }
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    isConfigured.value = await checkStatus();
    if (!isConfigured.value) {
      return;
    }

    await Promise.all([fetchSummary(), fetchSnapshots(), refreshLiveData()]);
  } finally {
    loading.value = false;
  }
}

// Watch for date range changes
watch(dateRange, () => {
  fetchSnapshots();
});

// Initialize
onMounted(() => {
  loadData();
});
</script>

<style scoped>
.money-tracker {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.section-header__titles h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.section-header__titles p {
  margin: 0;
}

.money-tracker__error,
.money-tracker__loading {
  padding: 2rem;
  text-align: center;
  background: var(--color-surface, #1e293b);
  border-radius: 0.5rem;
}

.money-tracker__error {
  color: var(--color-danger, #f87171);
}

.money-tracker__content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.money-tracker__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: var(--color-surface, #1e293b);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-card--accent {
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
}

.stat-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.stat-card__value {
  font-size: 1.5rem;
  font-weight: 600;
}

.stat-card__meta {
  font-size: 0.75rem;
  opacity: 0.6;
}

.money-tracker__actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.money-tracker__filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.money-tracker__filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.money-tracker__filter span {
  font-size: 0.875rem;
  color: var(--color-muted, #94a3b8);
}

.money-tracker__filter .input {
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  color: inherit;
  font-size: 0.875rem;
}

.money-tracker__chart-card,
.money-tracker__table-card {
  background: var(--color-surface, #1e293b);
  border-radius: 0.5rem;
  padding: 1.5rem;
}

.money-tracker__chart-header,
.money-tracker__table-header {
  margin-bottom: 1rem;
}

.money-tracker__chart-header h2,
.money-tracker__table-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.money-tracker__chart {
  height: 400px;
  position: relative;
}

.money-tracker__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
}

.money-tracker__table-wrapper {
  overflow-x: auto;
}

.money-tracker__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.money-tracker__table th,
.money-tracker__table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #334155);
}

.money-tracker__table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
}

.money-tracker__th--rank,
.money-tracker__td--rank {
  width: 3rem;
  text-align: center;
}

.money-tracker__th--total,
.money-tracker__td--total {
  font-weight: 600;
  color: var(--color-accent, #60a5fa);
}

.money-tracker__table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.currency-breakdown {
  font-size: 0.8rem;
  color: var(--color-muted, #94a3b8);
  white-space: nowrap;
}

.muted {
  color: var(--color-muted, #94a3b8);
}

.small {
  font-size: 0.875rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  border: none;
}

.btn--accent {
  background: var(--color-accent, #3b82f6);
  color: white;
}

.btn--accent:hover:not(:disabled) {
  background: var(--color-accent-hover, #2563eb);
}

.btn--outline {
  background: transparent;
  border: 1px solid var(--color-border, #334155);
  color: inherit;
}

.btn--outline:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .money-tracker {
    padding: 1rem;
  }

  .money-tracker__stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .money-tracker__chart {
    height: 300px;
  }

  .money-tracker__table {
    font-size: 0.75rem;
  }

  .money-tracker__table th,
  .money-tracker__table td {
    padding: 0.5rem;
  }
}
</style>
