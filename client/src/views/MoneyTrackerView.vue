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

      <!-- Settings Panel -->
      <article class="money-tracker__settings-card">
        <header class="money-tracker__settings-header">
          <h2>Auto-Snapshot Settings</h2>
          <span v-if="settings?.autoSnapshotEnabled" class="status-badge status-badge--active">
            Enabled
          </span>
          <span v-else class="status-badge status-badge--inactive">
            Disabled
          </span>
        </header>
        <div class="money-tracker__settings-content">
          <label class="money-tracker__setting">
            <span class="money-tracker__setting-label">Enable Auto-Snapshot</span>
            <div class="toggle-switch">
              <input
                type="checkbox"
                :checked="settings?.autoSnapshotEnabled"
                :disabled="savingSettings"
                @change="toggleAutoSnapshot"
              />
              <span class="toggle-switch__slider"></span>
            </div>
          </label>
          <div class="money-tracker__setting">
            <span class="money-tracker__setting-label">Snapshot Time</span>
            <div class="money-tracker__time-inputs">
              <select
                v-model.number="settingsForm.snapshotHour"
                class="input input--time"
                :disabled="savingSettings || !settings?.autoSnapshotEnabled"
              >
                <option v-for="h in 24" :key="h - 1" :value="h - 1">
                  {{ String(h - 1).padStart(2, '0') }}
                </option>
              </select>
              <span class="time-separator">:</span>
              <select
                v-model.number="settingsForm.snapshotMinute"
                class="input input--time"
                :disabled="savingSettings || !settings?.autoSnapshotEnabled"
              >
                <option v-for="m in 60" :key="m - 1" :value="m - 1">
                  {{ String(m - 1).padStart(2, '0') }}
                </option>
              </select>
              <span class="muted small">{{ timezoneAbbr }}</span>
              <button
                type="button"
                class="btn btn--accent btn--sm"
                :disabled="savingSettings || !settings?.autoSnapshotEnabled || !hasUnsavedChanges"
                @click="saveSettings"
              >
                {{ savingSettings ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
          <div v-if="settings?.nextScheduledTime" class="money-tracker__setting">
            <span class="money-tracker__setting-label">Next Scheduled Snapshot</span>
            <span class="money-tracker__setting-value">
              {{ formatScheduledTime(settings.nextScheduledTime) }}
            </span>
          </div>
          <div v-if="settings?.lastSnapshotAt" class="money-tracker__setting">
            <span class="money-tracker__setting-label">Last Auto-Snapshot</span>
            <span class="money-tracker__setting-value">
              {{ formatScheduledTime(settings.lastSnapshotAt) }}
            </span>
          </div>
        </div>
      </article>

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
          <div>
            <h2>Server Currency Over Time</h2>
            <span class="muted small">Total platinum equivalent across all characters</span>
          </div>
          <button
            type="button"
            class="btn btn--outline btn--sm"
            @click="openSnapshotHistory"
          >
            View All Snapshots
          </button>
        </header>
        <div class="money-tracker__chart" @contextmenu="handleChartRightClick">
          <Line
            v-if="hasChartData"
            ref="chartRef"
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
        <header class="money-tracker__table-header money-tracker__table-header--with-action">
          <div>
            <h2>Top 20 Wealthiest Characters</h2>
            <span class="muted small">From {{ tableDataSource }}</span>
          </div>
          <button
            type="button"
            class="btn btn--icon"
            :disabled="refreshingCharacters"
            :title="refreshingCharacters ? 'Refreshing...' : 'Refresh character data'"
            @click="refreshTopCharacters"
          >
            <span :class="['refresh-icon', { 'refresh-icon--spinning': refreshingCharacters }]">↻</span>
          </button>
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
            <tfoot>
              <tr class="money-tracker__total-row">
                <td colspan="2" class="money-tracker__td--total-label">Total (All Characters)</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(totalCharacterPlatinum) }}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="money-tracker__empty muted">
          No character data available.
        </p>
      </article>

      <!-- Top 20 Shared Banks Table -->
      <article class="money-tracker__table-card">
        <header class="money-tracker__table-header money-tracker__table-header--with-action">
          <div>
            <h2>Top 20 Wealthiest Shared Banks</h2>
            <span class="muted small">From {{ tableDataSource }}</span>
          </div>
          <button
            type="button"
            class="btn btn--icon"
            :disabled="refreshingSharedBanks"
            :title="refreshingSharedBanks ? 'Refreshing...' : 'Refresh shared bank data'"
            @click="refreshTopSharedBanks"
          >
            <span :class="['refresh-icon', { 'refresh-icon--spinning': refreshingSharedBanks }]">↻</span>
          </button>
        </header>
        <div v-if="topSharedBanks.length > 0" class="money-tracker__table-wrapper">
          <table class="money-tracker__table">
            <thead>
              <tr>
                <th class="money-tracker__th--rank">#</th>
                <th class="money-tracker__th--name">Account</th>
                <th class="money-tracker__th--name">Last Character</th>
                <th class="money-tracker__th--total">Shared Plat (PP)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(account, index) in topSharedBanks" :key="account.id">
                <td class="money-tracker__td--rank">{{ index + 1 }}</td>
                <td class="money-tracker__td--name">{{ account.name }}</td>
                <td class="money-tracker__td--name">{{ account.charname || '—' }}</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(account.sharedplat) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="money-tracker__total-row">
                <td colspan="3" class="money-tracker__td--total-label">Total (All Shared Banks)</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(totalSharedBankPlatinum) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="money-tracker__empty muted">
          No shared bank data available. Refresh live data to see shared banks.
        </p>
      </article>

      <!-- Top 20 Guild Banks Table -->
      <article class="money-tracker__table-card">
        <header class="money-tracker__table-header money-tracker__table-header--with-action">
          <div>
            <h2>Top 20 Wealthiest Guilds</h2>
            <span class="muted small">From {{ tableDataSource }}</span>
          </div>
          <button
            type="button"
            class="btn btn--icon"
            :disabled="refreshingGuildBanks"
            :title="refreshingGuildBanks ? 'Refreshing...' : 'Refresh guild bank data'"
            @click="refreshTopGuildBanks"
          >
            <span :class="['refresh-icon', { 'refresh-icon--spinning': refreshingGuildBanks }]">↻</span>
          </button>
        </header>
        <div v-if="topGuildBanks.length > 0" class="money-tracker__table-wrapper">
          <table class="money-tracker__table">
            <thead>
              <tr>
                <th class="money-tracker__th--rank">#</th>
                <th class="money-tracker__th--name">Guild</th>
                <th class="money-tracker__th--total">Guild Bank (PP)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(guild, index) in topGuildBanks" :key="guild.id">
                <td class="money-tracker__td--rank">{{ index + 1 }}</td>
                <td class="money-tracker__td--name">{{ guild.name }}</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(guild.platinum) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="money-tracker__total-row">
                <td colspan="2" class="money-tracker__td--total-label">Total (All Guild Banks)</td>
                <td class="money-tracker__td--total">{{ formatPlatinum(totalGuildBankPlatinum) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="money-tracker__empty muted">
          No guild bank data available. Refresh live data to see guild banks.
        </p>
      </article>
    </div>

    <!-- Snapshot History Modal -->
    <div v-if="showSnapshotHistory" class="modal-backdrop" @click.self="closeSnapshotHistory">
      <div class="modal modal--wide">
        <header class="modal__header">
          <div>
            <h2 class="modal__title">Snapshot History</h2>
            <p class="muted">All recorded currency snapshots</p>
          </div>
          <button class="icon-button" @click="closeSnapshotHistory">✕</button>
        </header>

        <div class="modal__body">
          <div v-if="loadingAllSnapshots" class="modal__loading">
            <p class="muted">Loading snapshots...</p>
          </div>
          <div v-else-if="allSnapshots.length === 0" class="modal__empty">
            <p class="muted">No snapshots found.</p>
          </div>
          <div v-else class="modal__table-wrapper">
            <table class="snapshot-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Taken At</th>
                  <th>Total Wealth (PP)</th>
                  <th>Characters</th>
                  <th>Inventory</th>
                  <th>Bank</th>
                  <th>Cursor</th>
                  <th>Shared Bank</th>
                  <th>Guild Bank</th>
                  <th class="snapshot-history-table__th-actions"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="snapshot in allSnapshots" :key="snapshot.id">
                  <td class="snapshot-history-table__date">
                    {{ formatSnapshotDate(snapshot.snapshotDate) }}
                  </td>
                  <td class="snapshot-history-table__time">
                    {{ formatSnapshotTime(snapshot.createdAt) }}
                  </td>
                  <td class="snapshot-history-table__total">
                    {{ formatPlatinum(Number(snapshot.totalPlatinumEquivalent) / 1000) }}
                  </td>
                  <td>{{ snapshot.characterCount }}</td>
                  <td>{{ formatPlatinum(Number(snapshot.totalPlatinum)) }}</td>
                  <td>{{ formatPlatinum(Number(snapshot.totalPlatinumBank)) }}</td>
                  <td>{{ formatPlatinum(Number(snapshot.totalPlatinumCursor)) }}</td>
                  <td>{{ formatPlatinum(Number(snapshot.totalSharedPlatinum || 0)) }}</td>
                  <td>{{ formatPlatinum(Number(snapshot.totalGuildBankPlatinum || 0)) }}</td>
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

    <!-- Context Menu for Chart -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button class="context-menu__item context-menu__item--danger" @click="deleteFromContextMenu">
        Delete Snapshot
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import axios from 'axios';

import { ensureChartJsRegistered } from '../utils/registerCharts';
import { useToastBus } from '../components/ToastBus';

ensureChartJsRegistered();

const { addToast } = useToastBus();

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
  totalSharedPlatinum: string;
  totalGuildBankPlatinum: string;
  topCharacters: TopCharacterCurrency[];
  topGuildBanks: GuildBankAccount[];
  characterCount: number;
  sharedBankCount: number;
  guildBankCount: number;
  createdAt: string;
}

interface MoneyTrackerSummary {
  totalSnapshots: number;
  latestSnapshot: MoneySnapshot | null;
  oldestSnapshotDate: string | null;
  newestSnapshotDate: string | null;
}

interface SharedBankAccount {
  id: number;
  name: string;
  charname: string;
  sharedplat: number;
}

interface GuildBankAccount {
  id: number;
  name: string;
  platinum: number;
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
    totalSharedPlatinum: string;
    totalGuildBankPlatinum: string;
    grandTotalPlatinumEquivalent: string;
    characterCount: number;
  };
  topCharacters: TopCharacterCurrency[];
  topSharedBanks: SharedBankAccount[];
  topGuildBanks: GuildBankAccount[];
  sharedBankAccountCount: number;
  guildBankCount: number;
  timestamp: string;
}

interface MoneyTrackerSettingsResponse {
  autoSnapshotEnabled: boolean;
  snapshotHour: number;
  snapshotMinute: number;
  lastSnapshotAt: string | null;
  updatedAt: string;
  nextScheduledTime: string | null;
  schedulerRunning: boolean;
}

// Timezone conversion helpers
function utcToLocal(utcHour: number, utcMinute: number): { hour: number; minute: number } {
  // Create a date object with the UTC time
  const date = new Date();
  date.setUTCHours(utcHour, utcMinute, 0, 0);
  // Return local hour and minute
  return {
    hour: date.getHours(),
    minute: date.getMinutes()
  };
}

function localToUtc(localHour: number, localMinute: number): { hour: number; minute: number } {
  // Create a date object with the local time
  const date = new Date();
  date.setHours(localHour, localMinute, 0, 0);
  // Return UTC hour and minute
  return {
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function getTimezoneAbbreviation(): string {
  const date = new Date();
  const timeString = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
  // Extract timezone abbreviation (e.g., "EST", "PST", "GMT+5")
  const match = timeString.match(/[A-Z]{2,5}[+-]?\d*$/);
  return match ? match[0] : 'Local';
}

// State
const loading = ref(true);
const isConfigured = ref(true);
const creatingSnapshot = ref(false);
const refreshingLive = ref(false);
const refreshingCharacters = ref(false);
const refreshingSharedBanks = ref(false);
const refreshingGuildBanks = ref(false);
const savingSettings = ref(false);

// Individually refreshed data (overrides liveData when set)
const refreshedCharacters = ref<TopCharacterCurrency[] | null>(null);
const refreshedCharacterTotals = ref<{
  totalPlatinumEquivalent: string;
  characterCount: number;
} | null>(null);
const refreshedSharedBanks = ref<SharedBankAccount[] | null>(null);
const refreshedTotalSharedPlatinum = ref<number | null>(null);
const refreshedGuildBanks = ref<GuildBankAccount[] | null>(null);
const refreshedTotalGuildBankPlatinum = ref<number | null>(null);
const dateRange = ref('90');
const summary = ref<MoneyTrackerSummary | null>(null);
const snapshots = ref<MoneySnapshot[]>([]);
const allSnapshots = ref<MoneySnapshot[]>([]);
const showSnapshotHistory = ref(false);
const loadingAllSnapshots = ref(false);
const liveData = ref<LiveData | null>(null);
const settings = ref<MoneyTrackerSettingsResponse | null>(null);
const settingsForm = ref({
  snapshotHour: 3,  // Stored in local time for display
  snapshotMinute: 0
});
const timezoneAbbr = ref(getTimezoneAbbreviation());

// Delete state
const showDeleteConfirm = ref(false);
const snapshotToDelete = ref<MoneySnapshot | null>(null);
const deletingSnapshotId = ref<string | null>(null);

// Context menu state
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  snapshotIndex: -1
});

// Chart ref for right-click detection
const chartRef = ref<InstanceType<typeof Line> | null>(null);

// Computed
const latestSnapshot = computed(() => summary.value?.latestSnapshot ?? null);

const latestTotalPlatinum = computed(() => {
  if (liveData.value) {
    // Use grand total which includes shared bank and guild bank platinum
    return Number(liveData.value.totals.grandTotalPlatinumEquivalent) / 1000;
  }
  if (latestSnapshot.value) {
    // Calculate full server wealth from snapshot data
    // totalPlatinumEquivalent is in copper, shared/guild bank are in platinum
    const characterTotal = Number(latestSnapshot.value.totalPlatinumEquivalent) / 1000;
    const sharedBank = Number(latestSnapshot.value.totalSharedPlatinum || 0);
    const guildBank = Number(latestSnapshot.value.totalGuildBankPlatinum || 0);
    return characterTotal + sharedBank + guildBank;
  }
  return 0;
});

const topCharacters = computed<TopCharacterCurrency[]>(() => {
  // Prioritize individually refreshed data, but only show top 20 for display
  if (refreshedCharacters.value) {
    return refreshedCharacters.value.slice(0, 20);
  }
  if (liveData.value) {
    return liveData.value.topCharacters;
  }
  if (latestSnapshot.value) {
    return latestSnapshot.value.topCharacters;
  }
  return [];
});

const topSharedBanks = computed<SharedBankAccount[]>(() => {
  // Prioritize individually refreshed data, but only show top 20 for display
  if (refreshedSharedBanks.value) {
    return refreshedSharedBanks.value.slice(0, 20);
  }
  if (liveData.value) {
    return liveData.value.topSharedBanks;
  }
  return [];
});

const topGuildBanks = computed<GuildBankAccount[]>(() => {
  // Prioritize individually refreshed data, but only show top 20 for display
  if (refreshedGuildBanks.value) {
    return refreshedGuildBanks.value.slice(0, 20);
  }
  if (liveData.value) {
    return liveData.value.topGuildBanks;
  }
  return [];
});

// Total character currency (in platinum) - from all characters, not just top 20
const totalCharacterPlatinum = computed(() => {
  // Prioritize individually refreshed data
  if (refreshedCharacterTotals.value) {
    return Number(refreshedCharacterTotals.value.totalPlatinumEquivalent) / 1000;
  }
  if (liveData.value) {
    return Number(liveData.value.totals.totalPlatinumEquivalent) / 1000;
  }
  if (latestSnapshot.value) {
    return Number(latestSnapshot.value.totalPlatinumEquivalent) / 1000;
  }
  return 0;
});

// Total shared bank platinum - from all accounts, not just top 20
const totalSharedBankPlatinum = computed(() => {
  // Prioritize individually refreshed data
  if (refreshedTotalSharedPlatinum.value !== null) {
    return refreshedTotalSharedPlatinum.value;
  }
  if (liveData.value) {
    return Number(liveData.value.totals.totalSharedPlatinum);
  }
  return 0;
});

// Total guild bank platinum - from all guilds, not just top 20
const totalGuildBankPlatinum = computed(() => {
  // Prioritize individually refreshed data
  if (refreshedTotalGuildBankPlatinum.value !== null) {
    return refreshedTotalGuildBankPlatinum.value;
  }
  if (liveData.value) {
    return Number(liveData.value.totals.totalGuildBankPlatinum);
  }
  return 0;
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

const hasUnsavedChanges = computed(() => {
  if (!settings.value) return false;
  // Convert the UTC settings to local time for comparison with the form
  const localSettings = utcToLocal(settings.value.snapshotHour, settings.value.snapshotMinute);
  return (
    settingsForm.value.snapshotHour !== localSettings.hour ||
    settingsForm.value.snapshotMinute !== localSettings.minute
  );
});

const chartData = computed(() => {
  const labels = snapshots.value.map((s) => {
    const date = new Date(s.snapshotDate);
    // Use UTC for snapshot dates since they represent calendar days stored as UTC midnight
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  });

  const data = snapshots.value.map((s) => {
    // Calculate full server wealth: character currency + shared bank + guild bank
    // totalPlatinumEquivalent is in copper, shared/guild bank are in platinum
    const characterTotal = Number(s.totalPlatinumEquivalent) / 1000;
    const sharedBank = Number(s.totalSharedPlatinum || 0);
    const guildBank = Number(s.totalGuildBankPlatinum || 0);
    return characterTotal + sharedBank + guildBank;
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
        title: (context: { dataIndex: number }[]) => {
          if (context.length === 0) return '';
          const snapshot = snapshots.value[context[0].dataIndex];
          if (!snapshot) return '';
          // Show both the snapshot date and the creation time
          const snapshotDate = formatSnapshotDate(snapshot.snapshotDate);
          const createdTime = formatScheduledTime(snapshot.createdAt);
          return [snapshotDate, `Taken: ${createdTime}`];
        },
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
  // Use UTC for snapshot dates since they represent calendar days stored as UTC midnight
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function formatScheduledTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Not scheduled';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function formatSnapshotTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
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

async function fetchAllSnapshots(): Promise<void> {
  loadingAllSnapshots.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/snapshots', {
      params: { limit: '9999' }
    });
    // Sort by date descending (newest first)
    allSnapshots.value = response.data.snapshots.sort((a: MoneySnapshot, b: MoneySnapshot) => {
      return new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime();
    });
  } catch (error) {
    console.error('Failed to fetch all snapshots:', error);
  } finally {
    loadingAllSnapshots.value = false;
  }
}

async function openSnapshotHistory(): Promise<void> {
  showSnapshotHistory.value = true;
  if (allSnapshots.value.length === 0) {
    await fetchAllSnapshots();
  }
}

function closeSnapshotHistory(): void {
  showSnapshotHistory.value = false;
}

async function refreshLiveData(): Promise<void> {
  refreshingLive.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/live');
    liveData.value = response.data;
    // Clear individually refreshed data when full refresh happens
    refreshedCharacters.value = null;
    refreshedCharacterTotals.value = null;
    refreshedSharedBanks.value = null;
    refreshedTotalSharedPlatinum.value = null;
    refreshedGuildBanks.value = null;
    refreshedTotalGuildBankPlatinum.value = null;
  } catch (error) {
    console.error('Failed to fetch live data:', error);
  } finally {
    refreshingLive.value = false;
  }
}

async function refreshTopCharacters(): Promise<void> {
  refreshingCharacters.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/live/characters');
    refreshedCharacters.value = response.data.characters;
    refreshedCharacterTotals.value = {
      totalPlatinumEquivalent: response.data.totals.totalPlatinumEquivalent,
      characterCount: response.data.totals.characterCount
    };
    addToast({
      title: 'Characters Refreshed',
      message: `Loaded ${response.data.characters.length} characters with currency data.`
    });
  } catch (error) {
    console.error('Failed to refresh characters:', error);
    addToast({
      title: 'Error',
      message: 'Failed to refresh character data. Please try again.'
    });
  } finally {
    refreshingCharacters.value = false;
  }
}

async function refreshTopSharedBanks(): Promise<void> {
  refreshingSharedBanks.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/live/shared-banks');
    refreshedSharedBanks.value = response.data.sharedBanks;
    refreshedTotalSharedPlatinum.value = Number(response.data.totalSharedPlatinum);
    addToast({
      title: 'Shared Banks Refreshed',
      message: `Loaded ${response.data.sharedBanks.length} accounts with shared bank data.`
    });
  } catch (error) {
    console.error('Failed to refresh shared banks:', error);
    addToast({
      title: 'Error',
      message: 'Failed to refresh shared bank data. Please try again.'
    });
  } finally {
    refreshingSharedBanks.value = false;
  }
}

async function refreshTopGuildBanks(): Promise<void> {
  refreshingGuildBanks.value = true;
  try {
    const response = await axios.get('/api/admin/money-tracker/live/guild-banks');
    refreshedGuildBanks.value = response.data.guildBanks;
    refreshedTotalGuildBankPlatinum.value = Number(response.data.totalGuildBankPlatinum);
    addToast({
      title: 'Guild Banks Refreshed',
      message: `Loaded ${response.data.guildBanks.length} guilds with bank data.`
    });
  } catch (error) {
    console.error('Failed to refresh guild banks:', error);
    addToast({
      title: 'Error',
      message: 'Failed to refresh guild bank data. Please try again.'
    });
  } finally {
    refreshingGuildBanks.value = false;
  }
}

async function takeSnapshot(): Promise<void> {
  creatingSnapshot.value = true;
  try {
    const response = await axios.post('/api/admin/money-tracker/snapshots');
    console.log('Snapshot created:', response.data);

    // Refresh all data after creating a snapshot
    await Promise.all([fetchSummary(), fetchSnapshots()]);

    // Also refresh allSnapshots if the history modal has been opened
    if (allSnapshots.value.length > 0) {
      await fetchAllSnapshots();
    }

    liveData.value = null; // Clear live data to show the new snapshot
    addToast({
      title: 'Snapshot Created',
      message: 'Currency snapshot has been saved successfully.'
    });
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    const errorMessage = axios.isAxiosError(error) && error.response?.data?.message
      ? error.response.data.message
      : 'Failed to create snapshot. Please try again.';
    addToast({
      title: 'Error',
      message: errorMessage
    });
  } finally {
    creatingSnapshot.value = false;
  }
}

async function fetchSettings(): Promise<void> {
  try {
    const response = await axios.get('/api/admin/money-tracker/settings');
    settings.value = response.data;
    // Convert UTC time from server to local time for display
    const localTime = utcToLocal(response.data.snapshotHour, response.data.snapshotMinute);
    settingsForm.value.snapshotHour = localTime.hour;
    settingsForm.value.snapshotMinute = localTime.minute;
  } catch (error) {
    console.error('Failed to fetch settings:', error);
  }
}

async function toggleAutoSnapshot(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const enabled = target.checked;

  savingSettings.value = true;
  try {
    const response = await axios.patch('/api/admin/money-tracker/settings', {
      autoSnapshotEnabled: enabled
    });
    settings.value = response.data;
    // Use the form's local time for the toast message
    addToast({
      title: enabled ? 'Auto-Snapshot Enabled' : 'Auto-Snapshot Disabled',
      message: enabled
        ? `Daily snapshots will be taken at ${String(settingsForm.value.snapshotHour).padStart(2, '0')}:${String(settingsForm.value.snapshotMinute).padStart(2, '0')} ${timezoneAbbr.value}`
        : 'Automatic daily snapshots have been disabled.'
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    // Revert the checkbox
    target.checked = !enabled;
    addToast({
      title: 'Error',
      message: 'Failed to update auto-snapshot setting. Please try again.'
    });
  } finally {
    savingSettings.value = false;
  }
}

async function saveSettings(): Promise<void> {
  savingSettings.value = true;
  try {
    // Convert local time from form to UTC before sending to server
    const utcTime = localToUtc(settingsForm.value.snapshotHour, settingsForm.value.snapshotMinute);
    const response = await axios.patch('/api/admin/money-tracker/settings', {
      snapshotHour: utcTime.hour,
      snapshotMinute: utcTime.minute
    });
    settings.value = response.data;
    addToast({
      title: 'Settings Saved',
      message: `Auto-snapshot scheduled for ${String(settingsForm.value.snapshotHour).padStart(2, '0')}:${String(settingsForm.value.snapshotMinute).padStart(2, '0')} ${timezoneAbbr.value}`
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    addToast({
      title: 'Error',
      message: 'Failed to save settings. Please try again.'
    });
  } finally {
    savingSettings.value = false;
  }
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    isConfigured.value = await checkStatus();
    if (!isConfigured.value) {
      return;
    }

    await Promise.all([fetchSummary(), fetchSnapshots(), refreshLiveData(), fetchSettings()]);
  } finally {
    loading.value = false;
  }
}

// Delete snapshot functions
function confirmDeleteSnapshot(snapshot: MoneySnapshot): void {
  snapshotToDelete.value = snapshot;
  showDeleteConfirm.value = true;
}

function cancelDelete(): void {
  showDeleteConfirm.value = false;
  snapshotToDelete.value = null;
}

async function executeDeleteSnapshot(): Promise<void> {
  if (!snapshotToDelete.value) return;

  const snapshotId = snapshotToDelete.value.id;
  deletingSnapshotId.value = snapshotId;

  try {
    await axios.delete(`/api/admin/money-tracker/snapshots/${snapshotId}`);

    // Remove from local arrays
    allSnapshots.value = allSnapshots.value.filter((s) => s.id !== snapshotId);
    snapshots.value = snapshots.value.filter((s) => s.id !== snapshotId);

    // Refresh summary to update counts
    await fetchSummary();

    addToast({
      title: 'Snapshot Deleted',
      message: 'The snapshot has been successfully deleted.'
    });
  } catch (error) {
    console.error('Failed to delete snapshot:', error);
    addToast({
      title: 'Error',
      message: 'Failed to delete snapshot. Please try again.'
    });
  } finally {
    deletingSnapshotId.value = null;
    showDeleteConfirm.value = false;
    snapshotToDelete.value = null;
  }
}

// Context menu functions
function showContextMenu(event: MouseEvent, snapshotIndex: number): void {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    snapshotIndex
  };
}

function hideContextMenu(): void {
  contextMenu.value.visible = false;
  contextMenu.value.snapshotIndex = -1;
}

function deleteFromContextMenu(): void {
  if (contextMenu.value.snapshotIndex >= 0 && contextMenu.value.snapshotIndex < snapshots.value.length) {
    const snapshot = snapshots.value[contextMenu.value.snapshotIndex];
    confirmDeleteSnapshot(snapshot);
  }
  hideContextMenu();
}

function handleChartRightClick(event: MouseEvent): void {
  if (!chartRef.value?.chart) return;

  const chart = chartRef.value.chart;
  const elements = chart.getElementsAtEventForMode(
    event,
    'nearest',
    { intersect: true },
    false
  );

  if (elements.length > 0) {
    event.preventDefault();
    const dataIndex = elements[0].index;
    showContextMenu(event, dataIndex);
  }
}

// Watch for date range changes
watch(dateRange, () => {
  fetchSnapshots();
});

// Close context menu when clicking elsewhere
function handleDocumentClick(): void {
  if (contextMenu.value.visible) {
    hideContextMenu();
  }
}

// Initialize
onMounted(() => {
  loadData();
  document.addEventListener('click', handleDocumentClick);
});

// Cleanup
onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
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

.money-tracker__table-header--with-action {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.money-tracker__chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.money-tracker__chart-header h2,
.money-tracker__table-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

/* Icon button styles */
.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 0.5rem;
  background: transparent;
  border: 1px solid var(--color-border, #334155);
  color: var(--color-muted, #94a3b8);
  cursor: pointer;
  transition: all 0.2s;
}

.btn--icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text, #e2e8f0);
  border-color: var(--color-accent, #60a5fa);
}

.btn--icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Refresh icon styles */
.refresh-icon {
  display: inline-block;
  font-size: 1.25rem;
  line-height: 1;
  transition: transform 0.2s;
}

.refresh-icon--spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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

.money-tracker__table tfoot {
  border-top: 2px solid var(--color-border, #334155);
}

.money-tracker__total-row {
  background: rgba(96, 165, 250, 0.1);
  font-weight: 600;
}

.money-tracker__total-row td {
  border-bottom: none;
}

.money-tracker__td--total-label {
  text-align: right;
  padding-right: 1rem;
  color: var(--color-muted, #94a3b8);
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

.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
}

/* Settings Panel */
.money-tracker__settings-card {
  background: var(--color-surface, #1e293b);
  border-radius: 0.5rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border, #334155);
}

.money-tracker__settings-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.money-tracker__settings-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.status-badge--active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-badge--inactive {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.money-tracker__settings-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.money-tracker__setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.money-tracker__setting-label {
  font-size: 0.875rem;
  color: var(--color-muted, #94a3b8);
}

.money-tracker__setting-value {
  font-size: 0.875rem;
  font-weight: 500;
}

.money-tracker__time-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input--time {
  width: 4rem;
  padding: 0.375rem 0.5rem;
  text-align: center;
}

.time-separator {
  font-weight: 600;
  color: var(--color-muted, #94a3b8);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch__slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border, #334155);
  transition: 0.3s;
  border-radius: 24px;
}

.toggle-switch__slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-switch__slider {
  background-color: var(--color-accent, #3b82f6);
}

.toggle-switch input:checked + .toggle-switch__slider::before {
  transform: translateX(24px);
}

.toggle-switch input:disabled + .toggle-switch__slider {
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

  .money-tracker__setting {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* Modal Styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 120;
}

.modal {
  width: min(500px, 100%);
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.modal--wide {
  width: min(1200px, 95%);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modal__title {
  margin: 0;
  font-size: 1.25rem;
}

.modal__body {
  flex: 1;
  overflow: auto;
  min-height: 200px;
  max-height: 60vh;
}

.modal__loading,
.modal__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.modal__table-wrapper {
  overflow-x: auto;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0.25rem;
}

.icon-button:hover {
  color: #e2e8f0;
}

/* Snapshot History Table */
.snapshot-history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.snapshot-history-table th,
.snapshot-history-table td {
  padding: 0.75rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #334155);
  white-space: nowrap;
}

.snapshot-history-table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--color-muted, #94a3b8);
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
}

.snapshot-history-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.snapshot-history-table__date {
  font-weight: 600;
  color: var(--color-accent, #60a5fa);
}

.snapshot-history-table__time {
  font-size: 0.8rem;
  color: var(--color-muted, #94a3b8);
}

.snapshot-history-table__total {
  font-weight: 600;
}

/* Small modal variant for confirmations */
.modal--sm {
  width: min(400px, 90%);
}

.modal--sm .modal__body {
  min-height: auto;
  max-height: none;
}

/* Delete/danger button styles */
.btn--danger {
  background: var(--color-danger, #dc2626);
  color: white;
}

.btn--danger:hover:not(:disabled) {
  background: var(--color-danger-hover, #b91c1c);
}

/* Snapshot history table actions */
.snapshot-history-table__th-actions {
  width: 80px;
}

.snapshot-history-table__actions {
  text-align: center;
}

/* Context menu styles */
.context-menu {
  position: fixed;
  z-index: 150;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.25rem;
  min-width: 150px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.context-menu__item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background 0.15s;
}

.context-menu__item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu__item--danger {
  color: var(--color-danger, #f87171);
}

.context-menu__item--danger:hover {
  background: rgba(220, 38, 38, 0.2);
}

@media (max-width: 768px) {
  .modal {
    padding: 1rem;
  }

  .modal--wide {
    width: 100%;
  }

  .snapshot-history-table {
    font-size: 0.75rem;
  }

  .snapshot-history-table th,
  .snapshot-history-table td {
    padding: 0.5rem 0.25rem;
  }
}
</style>
