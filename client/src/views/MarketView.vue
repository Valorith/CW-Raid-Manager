<template>
  <section class="market-view">
    <header class="hero">
      <div>
        <p class="eyebrow">Bazaar Intelligence</p>
        <h1>Market</h1>
        <p class="muted hero-copy">
          Search persisted bazaar sales, inspect item price history, and monitor overall market flow
          from synced trader purchase and sell logs.
        </p>
        <div class="hero-meta">
          <span class="pill">{{ selectedRangeLabel }}</span>
          <span class="pill pill--muted"
            >Last sync {{ formatSyncTime(summary?.syncStatus.lastSyncedAt ?? null) }}</span
          >
        </div>
      </div>
      <div class="hero-actions">
        <select v-model="selectedRangeDays" class="input">
          <option :value="null">All time</option>
          <option :value="7">7 days</option>
          <option :value="30">30 days</option>
          <option :value="90">90 days</option>
          <option :value="180">180 days</option>
          <option :value="365">365 days</option>
        </select>
        <button type="button" class="btn btn--accent" :disabled="refreshing" @click="refreshAll">
          {{ refreshing ? 'Refreshing...' : 'Refresh Market' }}
        </button>
      </div>
    </header>

    <article class="panel" ref="searchPanelRef">
      <div class="panel-head">
        <div>
          <h2>Item Search</h2>
          <p class="muted">Select an item to see its seller-side history.</p>
        </div>
      </div>
      <div class="search-wrap">
        <input
          v-model="searchQuery"
          type="search"
          class="input search-input"
          placeholder="Search items..."
          @focus="handleSearchFocus"
        />
        <small v-if="searchLoading" class="muted search-hint">Searching...</small>
        <div v-if="showSearchResults" class="search-results">
          <button
            v-for="result in searchResults"
            :key="`${result.itemId ?? 'name'}-${result.itemName}`"
            type="button"
            class="search-row"
            @click="selectSearchResult(result)"
          >
            <span v-if="hasValidIconId(result.itemIconId)" class="item-icon">
              <img
                :src="getLootIconSrc(result.itemIconId!)"
                :alt="result.itemName"
                loading="lazy"
              />
            </span>
            <span class="search-row__text">
              <strong>{{ result.itemName }}</strong>
              <small class="muted"
                >{{ result.saleCount }} sales · {{ formatCompactDate(result.lastSoldAt) }}</small
              >
            </span>
          </button>
          <p
            v-if="!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0"
            class="search-empty muted"
          >
            No matching sale history found.
          </p>
        </div>
      </div>
    </article>

    <GlobalLoadingSpinner v-if="showLoading" />

    <template v-else>
      <section class="stats">
        <article class="card card--accent">
          <span class="label">Sales</span>
          <strong>{{ formatNumber(summary?.totalSales ?? 0) }}</strong>
          <small>seller-side transactions</small>
        </article>
        <article class="card">
          <span class="label">Units</span>
          <strong>{{ formatNumber(summary?.totalUnitsSold ?? 0) }}</strong>
          <small>total quantity moved</small>
        </article>
        <article class="card">
          <span class="label">Revenue</span>
          <strong>{{ formatPlatinum(summary?.totalRevenue ?? 0) }}</strong>
          <small>gross traded value</small>
        </article>
        <article class="card">
          <span class="label">Items</span>
          <strong>{{ formatNumber(summary?.uniqueItems ?? 0) }}</strong>
          <small>distinct items sold</small>
        </article>
      </section>

      <article class="panel panel--chart-fill">
        <div class="panel-head">
          <div>
            <h2>Market Flow</h2>
            <p class="muted">Revenue and units sold across the selected timeline.</p>
          </div>
        </div>
        <div class="chart-box">
          <Line v-if="overallChartData" :data="overallChartData" :options="overallChartOptions" />
          <p v-else class="empty muted">No synced sales are available for this timeline.</p>
        </div>
      </article>

      <section class="market-summary-layout">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>Recent Bazaar Sales</h2>
              <p class="muted">Latest synced seller-side transactions.</p>
            </div>
          </div>
          <div v-if="displaySales.length" class="table-wrap">
            <table class="market-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Seller</th>
                  <th>Buyer</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="sale in displaySales" :key="sale.id">
                  <td>
                    <button
                      type="button"
                      class="table-item table-item-button"
                      @click="selectSaleItem(sale)"
                    >
                      <span v-if="hasValidIconId(sale.itemIconId)" class="item-icon">
                        <img
                          :src="getLootIconSrc(sale.itemIconId!)"
                          :alt="sale.itemName"
                          loading="lazy"
                        />
                      </span>
                      <span>{{ sale.itemName }}</span>
                    </button>
                  </td>
                  <td>{{ formatPlatinum(sale.price) }}</td>
                  <td>{{ formatNumber(sale.quantity) }}</td>
                  <td>{{ formatPlatinum(sale.totalCost) }}</td>
                  <td><CharacterLink :name="sale.sellerCharacterName" /></td>
                  <td>
                    <CharacterLink v-if="sale.buyerCharacterName" :name="sale.buyerCharacterName" />
                    <span v-else class="muted">—</span>
                  </td>
                  <td>{{ formatDateTime(sale.occurredAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="salesPage && salesPage.totalPages > 1" class="pagination">
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="salesLoading || salesPage.page <= 1"
              @click="changeSalesPage(salesPage.page - 1)"
            >
              Previous
            </button>
            <span class="pagination__meta muted">
              Page {{ salesPage.page }} of {{ salesPage.totalPages }} ·
              {{ formatNumber(salesPage.total) }} sales
            </span>
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="salesLoading || salesPage.page >= salesPage.totalPages"
              @click="changeSalesPage(salesPage.page + 1)"
            >
              Next
            </button>
          </div>
          <p v-else class="empty muted">No recent market sales have been synced yet.</p>
        </article>

        <article class="panel market-summary-layout__sidebar">
          <div class="panel-head">
            <div>
              <h2>Top Movers</h2>
              <p class="muted">Click an item to inspect its history.</p>
            </div>
            <div class="segmented-control" role="group" aria-label="Sort top movers">
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': topItemsSort === 'quantity' }"
                :disabled="refreshing"
                @click="setTopItemsSort('quantity')"
              >
                Quantity
              </button>
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': topItemsSort === 'value' }"
                :disabled="refreshing"
                @click="setTopItemsSort('value')"
              >
                Value
              </button>
            </div>
          </div>
          <div v-if="summary?.topItems.length" class="movers">
            <button
              v-for="item in summary.topItems"
              :key="`${item.itemId ?? 'name'}-${item.itemName}`"
              type="button"
              class="mover"
              @click="selectTopItem(item)"
            >
              <div class="mover__main">
                <span v-if="hasValidIconId(item.itemIconId)" class="item-icon">
                  <img
                    :src="getLootIconSrc(item.itemIconId!)"
                    :alt="item.itemName"
                    loading="lazy"
                  />
                </span>
                <div>
                  <strong>{{ item.itemName }}</strong>
                  <small class="muted"
                    >{{ item.salesCount }} sales · {{ item.unitsSold }} units</small
                  >
                </div>
              </div>
              <div class="mover__meta">
                <strong>{{ formatPlatinum(item.totalRevenue) }}</strong>
                <small class="muted">avg {{ formatPlatinum(item.averagePrice) }}</small>
              </div>
            </button>
          </div>
          <p v-else class="empty muted">Top movers will appear once sales have been synced.</p>
        </article>
      </section>
    </template>

    <Teleport to="body">
      <div
        v-if="isItemModalOpen && activeModalItem"
        class="market-modal-backdrop"
        @click.self="closeItemModal"
      >
        <div
          class="market-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="marketModalTitleId"
        >
          <header class="market-modal__header">
            <div class="market-modal__header-copy">
              <p class="eyebrow">Sale Trend</p>
              <h2 :id="marketModalTitleId">{{ history?.itemName ?? activeModalItem.itemName }}</h2>
              <p class="muted">Price trend and volume history for the selected item.</p>
            </div>
            <div class="market-modal__actions">
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="historyLoading"
                @click="reloadSelectedItem"
              >
                {{ historyLoading ? 'Loading...' : 'Reload Item' }}
              </button>
              <button
                type="button"
                class="market-modal__close"
                aria-label="Close item trends"
                @click="closeItemModal"
              >
                ×
              </button>
            </div>
          </header>

          <div v-if="historyLoading" class="empty muted market-modal__loading">
            Loading item history...
          </div>
          <template v-else-if="history">
            <section class="stats stats--focus">
              <article class="card card--spotlight">
                <span class="label">Avg Price</span>
                <strong>{{ formatPlatinum(history.stats.averagePrice) }}</strong>
                <small>per unit</small>
              </article>
              <article class="card">
                <span class="label">Price Range</span>
                <strong>{{ formatPlatinum(history.stats.minPrice) }}</strong>
                <small>to {{ formatPlatinum(history.stats.maxPrice) }}</small>
              </article>
              <article class="card">
                <span class="label">Units Sold</span>
                <strong>{{ formatNumber(history.stats.totalUnitsSold) }}</strong>
                <small>{{ history.stats.totalSales }} sales</small>
              </article>
              <article class="card">
                <span class="label">Revenue</span>
                <strong>{{ formatPlatinum(history.stats.totalRevenue) }}</strong>
                <small>{{ formatCompactDate(history.stats.lastSoldAt) }}</small>
              </article>
            </section>

            <div class="layout">
              <article class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Price History</h2>
                    <p class="muted">Each point represents a sale price per unit.</p>
                  </div>
                </div>
                <div class="chart-box">
                  <Line
                    v-if="itemPriceChartData"
                    :data="itemPriceChartData"
                    :options="itemPriceChartOptions"
                  />
                  <p v-else class="empty muted">No price points available.</p>
                </div>
              </article>

              <article class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Daily Trend</h2>
                    <p class="muted">Average price and units sold by day.</p>
                  </div>
                </div>
                <div class="chart-box">
                  <Line
                    v-if="itemDailyChartData"
                    :data="itemDailyChartData"
                    :options="itemDailyChartOptions"
                  />
                  <p v-else class="empty muted">No daily trend available.</p>
                </div>
              </article>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';

import CharacterLink from '../components/CharacterLink.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useToastBus } from '../components/ToastBus';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import {
  api,
  type MarketItemHistory,
  type MarketItemSearchResult,
  type MarketRecentSale,
  type MarketRecentSalesPage,
  type MarketSummary,
  type MarketTopItemsSort,
  type MarketTopItem
} from '../services/api';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import { ensureChartJsRegistered } from '../utils/registerCharts';

ensureChartJsRegistered();

const { addToast } = useToastBus();
const loading = ref(true);
const showLoading = useMinimumLoading(loading, 900);
const refreshing = ref(false);
const searchLoading = ref(false);
const historyLoading = ref(false);
const salesLoading = ref(false);

const summary = ref<MarketSummary | null>(null);
const history = ref<MarketItemHistory | null>(null);
const salesPage = ref<MarketRecentSalesPage | null>(null);
const activeModalItem = ref<MarketItemSearchResult | null>(null);
const isItemModalOpen = ref(false);
const selectedRangeDays = ref<number | null>(null);
const topItemsSort = ref<MarketTopItemsSort>('quantity');
const salesPageNumber = ref(1);
const salesPageSize = 10;
const searchQuery = ref('');
const searchResults = ref<MarketItemSearchResult[]>([]);
const showSearchResults = ref(false);
const searchPanelRef = ref<HTMLElement | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let activeSearchToken = 0;
const marketModalTitleId = 'market-item-trend-title';

const displaySales = computed<MarketRecentSale[]>(() => salesPage.value?.sales ?? []);

const selectedRangeLabel = computed(() =>
  selectedRangeDays.value == null ? 'All available data' : `Window ${selectedRangeDays.value} days`
);

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPlatinum(valueInCopper: number) {
  const platinum = valueInCopper / 1000;
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: platinum < 100 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(platinum)} pp`;
}

function formatCompactDate(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

function formatDateTime(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function formatSyncTime(value: string | null) {
  if (!value) return 'pending first sync';
  return formatDateTime(value);
}

function buildDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

function buildDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

const overallChartData = computed(() => {
  if (!summary.value?.dailyActivity.length) return null;
  return {
    labels: summary.value.dailyActivity.map((point) => buildDateLabel(point.saleDate)),
    datasets: [
      {
        label: 'Revenue (pp)',
        data: summary.value.dailyActivity.map((point) =>
          Number((point.totalRevenue / 1000).toFixed(1))
        ),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.18)',
        fill: true,
        yAxisID: 'revenue'
      },
      {
        label: 'Units Sold',
        data: summary.value.dailyActivity.map((point) => point.unitsSold),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        fill: false,
        yAxisID: 'units'
      }
    ]
  };
});

const overallChartOptions = {
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    revenue: {
      type: 'linear' as const,
      position: 'left' as const,
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { callback: (value: string | number) => `${value} pp` }
    },
    units: {
      type: 'linear' as const,
      position: 'right' as const,
      grid: { display: false }
    }
  }
};

const itemPriceChartData = computed(() => {
  if (!history.value?.pricePoints.length) return null;
  return {
    labels: history.value.pricePoints.map((point) => buildDateTimeLabel(point.occurredAt)),
    datasets: [
      {
        label: 'Price Per Unit (pp)',
        data: history.value.pricePoints.map((point) => Number((point.price / 1000).toFixed(2))),
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.18)',
        fill: true
      }
    ]
  };
});

const itemPriceChartOptions = {
  maintainAspectRatio: false,
  scales: {
    y: {
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { callback: (value: string | number) => `${value} pp` }
    }
  }
};

const itemDailyChartData = computed(() => {
  if (!history.value?.dailyTrend.length) return null;
  return {
    labels: history.value.dailyTrend.map((point) => buildDateLabel(point.saleDate)),
    datasets: [
      {
        label: 'Average Price (pp)',
        data: history.value.dailyTrend.map((point) =>
          Number((point.averagePrice / 1000).toFixed(2))
        ),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.16)',
        fill: true,
        yAxisID: 'price'
      },
      {
        label: 'Units Sold',
        data: history.value.dailyTrend.map((point) => point.unitsSold),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.12)',
        fill: false,
        yAxisID: 'units'
      }
    ]
  };
});

const itemDailyChartOptions = {
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    price: {
      type: 'linear' as const,
      position: 'left' as const,
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { callback: (value: string | number) => `${value} pp` }
    },
    units: {
      type: 'linear' as const,
      position: 'right' as const,
      grid: { display: false }
    }
  }
};

async function loadSummary(initial = false) {
  if (initial) loading.value = true;
  else refreshing.value = true;
  try {
    summary.value = await api.fetchMarketSummary(selectedRangeDays.value, topItemsSort.value);
  } catch (error) {
    console.error('Failed to load market summary.', error);
    addToast({
      title: 'Market Load Failed',
      message: 'Unable to load market summary.',
      variant: 'error'
    });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function setTopItemsSort(sort: MarketTopItemsSort) {
  if (topItemsSort.value === sort || refreshing.value) {
    return;
  }

  topItemsSort.value = sort;
  await loadSummary(false);
}

async function loadSelectedItemHistory() {
  if (!activeModalItem.value) {
    history.value = null;
    return;
  }
  historyLoading.value = true;
  try {
    history.value = await api.fetchMarketItemHistory({
      itemId: activeModalItem.value.itemId ?? undefined,
      itemName: activeModalItem.value.itemName,
      days: selectedRangeDays.value,
      pointLimit: 220
    });
  } catch (error) {
    console.error('Failed to load market item history.', error);
    history.value = null;
    addToast({
      title: 'Item History Failed',
      message: `Unable to load history for ${activeModalItem.value.itemName}.`,
      variant: 'error'
    });
  } finally {
    historyLoading.value = false;
  }
}

async function loadSalesPage(page = salesPageNumber.value) {
  salesLoading.value = true;
  salesPageNumber.value = page;
  try {
    salesPage.value = await api.fetchMarketSalesPage({
      days: selectedRangeDays.value,
      page,
      pageSize: salesPageSize
    });
  } catch (error) {
    console.error('Failed to load market sales page.', error);
    salesPage.value = null;
    addToast({
      title: 'Sales Feed Failed',
      message: 'Unable to load recent market sales.',
      variant: 'error'
    });
  } finally {
    salesLoading.value = false;
  }
}

async function refreshAll() {
  await loadSummary(false);
  if (isItemModalOpen.value && activeModalItem.value) await loadSelectedItemHistory();
  await loadSalesPage(1);
}

function openItemModal(item: MarketItemSearchResult) {
  activeModalItem.value = item;
  isItemModalOpen.value = true;
  showSearchResults.value = false;
  void loadSelectedItemHistory();
}

function selectSearchResult(item: MarketItemSearchResult) {
  openItemModal(item);
}

function selectTopItem(item: MarketTopItem) {
  openItemModal({
    itemId: item.itemId,
    itemName: item.itemName,
    itemIconId: item.itemIconId,
    saleCount: item.salesCount,
    lastSoldAt: item.lastSoldAt
  });
}

function reloadSelectedItem() {
  void loadSelectedItemHistory();
}

function closeItemModal() {
  isItemModalOpen.value = false;
}

function selectSaleItem(sale: MarketRecentSale) {
  selectSearchResult({
    itemId: sale.itemId,
    itemName: sale.itemName,
    itemIconId: sale.itemIconId,
    saleCount: 0,
    lastSoldAt: sale.occurredAt
  });
}

function changeSalesPage(page: number) {
  if (salesLoading.value) {
    return;
  }

  void loadSalesPage(page);
}

function handleSearchFocus() {
  if (searchResults.value.length > 0) showSearchResults.value = true;
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null;
  if (target && !searchPanelRef.value?.contains(target)) showSearchResults.value = false;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isItemModalOpen.value) {
    closeItemModal();
  }
}

watch(selectedRangeDays, async () => {
  await loadSummary(false);
  if (isItemModalOpen.value && activeModalItem.value) await loadSelectedItemHistory();
  await loadSalesPage(1);
});

watch(searchQuery, (value) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  const query = value.trim();
  if (query.length < 2) {
    searchLoading.value = false;
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }
  searchTimeout = setTimeout(async () => {
    const token = ++activeSearchToken;
    searchLoading.value = true;
    try {
      const results = await api.searchMarketItems(query, 10);
      if (token !== activeSearchToken) return;
      searchResults.value = results;
      showSearchResults.value = true;
    } catch (error) {
      if (token !== activeSearchToken) return;
      console.error('Failed to search market items.', error);
      searchResults.value = [];
      showSearchResults.value = true;
    } finally {
      if (token === activeSearchToken) searchLoading.value = false;
    }
  }, 220);
});

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleWindowKeydown);
  await loadSummary(true);
  await loadSalesPage(1);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleWindowKeydown);
  if (searchTimeout) clearTimeout(searchTimeout);
});
</script>

<style scoped>
.market-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  color: #e5edf5;
}
.btn,
.input {
  border-radius: 0.9rem;
  font: inherit;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.7rem 1rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}
.btn:hover {
  transform: translateY(-1px);
}
.btn--accent {
  background: linear-gradient(135deg, #f59e0b, #38bdf8);
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.22);
}
.btn--outline {
  background: rgba(15, 23, 42, 0.68);
  border-color: rgba(148, 163, 184, 0.28);
  color: #e2e8f0;
}
.btn--small {
  padding: 0.5rem 0.8rem;
  font-size: 0.88rem;
}
.input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.62);
  color: #f8fafc;
  padding: 0.8rem 0.95rem;
}
.input:focus {
  outline: 2px solid rgba(56, 189, 248, 0.35);
  outline-offset: 1px;
  border-color: rgba(56, 189, 248, 0.45);
}
.hero,
.panel,
.card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.26);
}
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.25rem;
  padding: 1.8rem;
  border-radius: 1.4rem;
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.24), transparent 32%),
    radial-gradient(circle at left center, rgba(56, 189, 248, 0.16), transparent 40%),
    linear-gradient(135deg, rgba(16, 24, 39, 0.98), rgba(15, 23, 42, 0.94));
}
.eyebrow,
.label {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
  color: #94a3b8;
}
.eyebrow {
  margin: 0 0 0.6rem;
  color: #fbbf24;
}
.hero h1,
.panel h2 {
  margin: 0;
}
.hero h1 {
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  line-height: 0.96;
  letter-spacing: -0.04em;
}
.hero-copy {
  margin: 0.85rem 0 0;
  max-width: 52rem;
  line-height: 1.6;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1rem;
}
.pill {
  display: inline-flex;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  border: 1px solid rgba(245, 158, 11, 0.26);
  color: #fde68a;
  font-size: 0.84rem;
  font-weight: 600;
}
.pill--muted {
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(148, 163, 184, 0.22);
  color: #cbd5e1;
}
.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 13rem;
}
.panel {
  padding: 1.25rem;
  border-radius: 1.2rem;
  overflow: hidden;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.panel-head p {
  margin: 0.3rem 0 0;
}
.table-item-button {
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.table-item-button:hover {
  color: #f8fafc;
}
.search-wrap {
  position: relative;
  margin-top: 1rem;
}
.search-input {
  width: 100%;
  min-height: 3.1rem;
  padding-inline: 1rem;
  border-radius: 1rem;
}
.search-hint {
  display: inline-flex;
  margin-top: 0.45rem;
}
.search-results {
  margin-top: 0.7rem;
  border-radius: 1rem;
  overflow: hidden;
  background: rgba(2, 6, 23, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.search-row,
.mover {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}
.search-row + .search-row {
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}
.search-row:hover,
.mover:hover {
  background: rgba(30, 41, 59, 0.72);
  transform: translateY(-1px);
}
.search-row__text,
.mover__main {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}
.mover__main > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}
.search-row__text {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}
.search-empty,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 7rem;
}
.selection {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(56, 189, 248, 0.12));
  border: 1px solid rgba(52, 211, 153, 0.18);
}
.selection p {
  margin: 0.2rem 0 0;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.stats--focus {
  margin-top: 1rem;
  margin-bottom: 1rem;
}
.card {
  padding: 1.05rem 1.1rem;
  border-radius: 1.05rem;
}
.card strong {
  display: block;
  margin-top: 0.65rem;
  font-size: clamp(1.35rem, 2vw, 1.95rem);
  letter-spacing: -0.04em;
}
.card small {
  display: block;
  margin-top: 0.35rem;
  color: #94a3b8;
}
.card--accent {
  background: linear-gradient(145deg, rgba(245, 158, 11, 0.16), rgba(15, 23, 42, 0.95));
  border-color: rgba(245, 158, 11, 0.22);
}
.card--spotlight {
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.16), rgba(15, 23, 42, 0.95));
  border-color: rgba(16, 185, 129, 0.22);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.95fr);
  gap: 1rem;
}
.market-summary-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.95fr);
  gap: 1rem;
  align-items: stretch;
}
.market-summary-layout__sidebar {
  height: 100%;
}
.chart-box {
  height: 20rem;
  margin-top: 1rem;
}
.panel--chart-fill {
  display: flex;
  flex-direction: column;
}
.panel--chart-fill .chart-box {
  flex: 1;
  height: auto;
  min-height: 20rem;
}
.panel--chart-fill :deep(canvas) {
  height: 100% !important;
}
.movers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
.mover {
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.56);
}
.mover__meta {
  text-align: right;
}
.segmented-control {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.segmented-control__button {
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.segmented-control__button--active {
  background: rgba(56, 189, 248, 0.16);
  color: #e2e8f0;
}
.segmented-control__button:disabled {
  cursor: default;
  opacity: 0.7;
}
.table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
}
.pagination__meta {
  text-align: center;
  flex: 1;
}
.market-table {
  width: 100%;
  border-collapse: collapse;
}
.market-table th,
.market-table td {
  padding: 0.82rem 0.88rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
}
.market-table th {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 16rem;
}
.market-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(6px);
}
.market-modal {
  width: min(1100px, calc(100vw - 3rem));
  max-height: calc(100vh - 3rem);
  overflow: auto;
  padding: 1.35rem;
  border-radius: 1.35rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94));
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.48);
}
.market-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.market-modal__header-copy p {
  margin: 0.3rem 0 0;
}
.market-modal__actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.market-modal__close {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}
.market-modal__close:hover {
  background: rgba(30, 41, 59, 0.9);
}
.market-modal__loading {
  min-height: 18rem;
}
.item-icon {
  width: 2.25rem;
  height: 2.25rem;
  overflow: hidden;
  border-radius: 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.85);
  flex-shrink: 0;
}
.item-icon--lg {
  width: 2.7rem;
  height: 2.7rem;
}
.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.muted {
  color: #94a3b8;
}
@media (max-width: 1100px) {
  .hero,
  .layout,
  .market-summary-layout {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hero-actions {
    min-width: 0;
  }
}
@media (max-width: 768px) {
  .hero,
  .panel {
    padding: 1rem;
  }
  .stats {
    grid-template-columns: 1fr;
  }
  .panel-head {
    flex-direction: column;
  }
  .segmented-control {
    width: 100%;
    justify-content: stretch;
  }
  .segmented-control__button {
    flex: 1;
  }
  .mover {
    flex-direction: column;
    align-items: flex-start;
  }
  .mover__meta {
    text-align: left;
  }
  .chart-box {
    height: 17rem;
  }
  .market-modal-backdrop {
    padding: 0.75rem;
  }
  .market-modal {
    width: 100%;
    max-height: calc(100vh - 1.5rem);
    padding: 1rem;
  }
  .market-modal__header,
  .market-modal__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .market-modal__close {
    align-self: flex-end;
  }
  .pagination {
    flex-direction: column;
    align-items: stretch;
  }
  .pagination__meta {
    text-align: left;
  }
}
</style>
