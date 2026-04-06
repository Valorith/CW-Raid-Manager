<template>
  <section class="traders-tab">
    <header class="traders-tab__header">
      <div>
        <p class="eyebrow">Saved Trader Roster</p>
        <h2>My Traders</h2>
        <p class="muted traders-tab__copy">
          Save your trader characters, then scan active listings that are tied or undercut so you
          can reprice faster.
        </p>
      </div>
      <button
        type="button"
        class="btn btn--outline btn--small"
        :disabled="props.favoritesLoading"
        @click="emit('reload-favorites')"
      >
        {{ props.favoritesLoading ? 'Refreshing...' : 'Reload Traders' }}
      </button>
    </header>

    <section class="traders-summary">
      <article class="summary-card">
        <strong>{{ formatNumber(props.traderSummary.totalTraders) }}</strong>
        <span class="muted">Saved traders</span>
      </article>
      <article class="summary-card">
        <strong>{{ formatNumber(props.traderSummary.activeTraders) }}</strong>
        <span class="muted">Active now</span>
      </article>
      <article class="summary-card summary-card--warning">
        <strong>{{ formatNumber(props.traderSummary.tradersNeedingAttention) }}</strong>
        <span class="muted">Need repricing</span>
      </article>
      <article class="summary-card">
        <strong>{{ formatNumber(props.traderSummary.totalListings) }}</strong>
        <span class="muted">Active listings</span>
      </article>
      <article class="summary-card">
        <strong>{{ formatNumber(props.traderSummary.leadingListings) }}</strong>
        <span class="muted">Leading</span>
      </article>
      <article class="summary-card summary-card--danger">
        <strong>{{ formatNumber(props.traderSummary.undercutListings) }}</strong>
        <span class="muted">Undercut</span>
      </article>
    </section>

    <article class="panel">
      <div class="panel-head">
        <div>
          <h3>Manage Traders</h3>
          <p class="muted">
            Search market characters and save the traders you actively price-check.
          </p>
        </div>
        <span class="pill">{{ props.savedTraders.length }}</span>
      </div>

      <div class="search-wrap">
        <input
          v-model="characterQuery"
          type="search"
          class="input search-input"
          placeholder="Search market characters..."
        />
        <small v-if="characterSearchLoading" class="muted search-hint">Searching...</small>
        <div v-if="showCharacterSearchResults" class="search-results">
          <button
            v-for="character in characterSearchResults"
            :key="character.characterName"
            type="button"
            class="search-row"
            :disabled="isCharacterResultBusy(character.characterName)"
            @click="emitAddTrader(character.characterName)"
          >
            <span class="search-row__main">
              <span class="search-row__text">
                <strong>{{ character.characterName }}</strong>
                <small class="muted">
                  {{ character.sellCount }} sells · {{ character.buyCount }} buys ·
                  {{ formatCompactDate(character.lastSeenAt) }}
                </small>
              </span>
            </span>
            <span class="search-row__status muted">
              {{ getCharacterResultStatus(character.characterName) }}
            </span>
          </button>
          <p
            v-if="
              !characterSearchLoading &&
              characterQuery.trim().length >= 2 &&
              characterSearchResults.length === 0
            "
            class="search-empty muted"
          >
            No matching market characters found.
          </p>
        </div>
      </div>

      <div v-if="!props.traderSummary.sourceAvailable" class="status-banner status-banner--warning">
        {{ props.traderSummary.message ?? 'Trader listing insights are currently unavailable.' }}
      </div>
    </article>

    <div v-if="props.favoritesLoading && props.savedTraders.length === 0" class="empty muted">
      Loading trader insights...
    </div>
    <div v-else-if="props.savedTraders.length === 0" class="empty muted">No saved traders yet.</div>
    <section v-else class="trader-grid">
      <article
        v-for="trader in sortedTraders"
        :key="trader.id"
        class="trader-card"
        :class="getTraderCardToneClass(trader)"
      >
        <header class="trader-card__header">
          <div class="trader-card__identity">
            <button
              type="button"
              class="trader-card__name"
              @click="emit('open-character', trader.characterName)"
            >
              {{ trader.characterName }}
            </button>
            <span class="status-pill" :class="getTraderStatusClass(trader)">
              {{ getTraderStatusLabel(trader) }}
            </span>
          </div>
          <button
            type="button"
            class="btn btn--outline btn--small"
            :disabled="isTraderPending(trader.characterName)"
            @click="emitRemoveTrader(trader.characterName)"
          >
            {{ isTraderPending(trader.characterName) ? 'Removing...' : 'Remove' }}
          </button>
        </header>

        <div class="trader-card__meta muted">
          <span>Saved {{ formatCompactDate(trader.createdAt) }}</span>
          <span>Last listed {{ formatCompactDate(trader.lastListedAt) }}</span>
        </div>

        <div class="trader-card__alerts">
          <label class="alert-toggle">
            <input
              type="checkbox"
              :checked="trader.notificationSettings.notifyOnListingActivity !== false"
              :disabled="isSettingsBusy(trader.id)"
              @change="
                updateTraderNotificationSettings(trader.id, {
                  notifyOnListingActivity: ($event.target as HTMLInputElement).checked
                })
              "
            />
            <span>Listing changes</span>
          </label>
          <label class="alert-toggle">
            <input
              type="checkbox"
              :checked="trader.notificationSettings.notifyOnUndercut !== false"
              :disabled="isSettingsBusy(trader.id)"
              @change="
                updateTraderNotificationSettings(trader.id, {
                  notifyOnUndercut: ($event.target as HTMLInputElement).checked
                })
              "
            />
            <span>Undercuts</span>
          </label>
          <label class="alert-toggle">
            <input
              type="checkbox"
              :checked="trader.notificationSettings.undercutOnly === true"
              :disabled="isSettingsBusy(trader.id)"
              @change="
                updateTraderNotificationSettings(trader.id, {
                  undercutOnly: ($event.target as HTMLInputElement).checked
                })
              "
            />
            <span>Only notify when newly undercut</span>
          </label>
        </div>

        <div class="trader-card__stats">
          <span class="stat-chip">
            <strong>{{ formatNumber(trader.totalListings) }}</strong>
            <small>Listings</small>
          </span>
          <span class="stat-chip">
            <strong>{{ formatNumber(trader.uniqueItems) }}</strong>
            <small>Items</small>
          </span>
          <span class="stat-chip stat-chip--success">
            <strong>{{ formatNumber(trader.leadingListings) }}</strong>
            <small>Leading</small>
          </span>
          <span class="stat-chip stat-chip--warning">
            <strong>{{ formatNumber(trader.matchingListings) }}</strong>
            <small>Tied</small>
          </span>
          <span class="stat-chip stat-chip--danger">
            <strong>{{ formatNumber(trader.undercutListings) }}</strong>
            <small>Undercut</small>
          </span>
        </div>

        <div class="trader-card__body">
          <template v-if="trader.attentionListings.length">
            <div class="table-wrap trader-card__table-wrap">
              <table class="trader-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Your Price</th>
                    <th>Best</th>
                    <th>Gap</th>
                    <th>Rank</th>
                    <th>Listed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="listing in getPaginatedAttentionListings(trader)"
                    :key="buildListingKey(trader, listing)"
                  >
                    <td>
                      <button
                        type="button"
                        class="table-item"
                        @mouseenter="showListingTooltip($event, listing)"
                        @mousemove="updateMarketItemTooltipPosition($event)"
                        @mouseleave="hideMarketItemTooltip"
                        @click="
                          emit('open-item', {
                            itemId: listing.itemId,
                            itemName: listing.itemName,
                            itemIconId: listing.itemIconId
                          })
                        "
                      >
                        <span v-if="hasValidIconId(listing.itemIconId)" class="item-icon">
                          <img
                            :src="getLootIconSrc(listing.itemIconId!)"
                            :alt="listing.itemName"
                            loading="lazy"
                          />
                        </span>
                        <span class="table-item__text">
                          <strong>{{ listing.itemName }}</strong>
                          <small class="muted">Slot {{ listing.slotId }}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span class="status-pill" :class="getListingStatusClass(listing.status)">
                        {{ getListingStatusLabel(listing.status) }}
                      </span>
                    </td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="listing.price" /></td>
                    <td>
                      <CoinDisplay variant="platinum" :amount-in-copper="listing.bestPrice" />
                    </td>
                    <td>
                      <div class="gap-stack">
                        <CoinDisplay variant="platinum" :amount-in-copper="listing.priceDelta" />
                        <small v-if="listing.priceDeltaPercent != null" class="muted">
                          {{ formatPercent(listing.priceDeltaPercent) }}
                        </small>
                      </div>
                    </td>
                    <td>#{{ formatNumber(listing.priceRank) }}</td>
                    <td>{{ formatCompactDate(listing.listedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="getTraderAttentionTotalPages(trader) > 1" class="trader-pagination">
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="getTraderAttentionPage(trader) <= 1"
                @click="setTraderAttentionPage(trader, getTraderAttentionPage(trader) - 1)"
              >
                Previous
              </button>
              <span class="trader-pagination__meta muted">
                Page {{ getTraderAttentionPage(trader) }} of
                {{ getTraderAttentionTotalPages(trader) }} ·
                {{ formatNumber(trader.attentionListingsCount) }} flagged listings
              </span>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="getTraderAttentionPage(trader) >= getTraderAttentionTotalPages(trader)"
                @click="setTraderAttentionPage(trader, getTraderAttentionPage(trader) + 1)"
              >
                Next
              </button>
            </div>
          </template>
          <p v-else-if="trader.hasActiveListings" class="empty muted trader-card__empty">
            All current listings are holding the lead.
          </p>
          <p v-else class="empty muted trader-card__empty">
            No active bazaar listings were found for this trader in the current cache.
          </p>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import CoinDisplay from '../../components/CoinDisplay.vue';
import { useToastBus } from '../../components/ToastBus';
import { useErrorModal } from '../../composables/useErrorModal';
import {
  api,
  type MarketCharacterSearchResult,
  type MarketFavoriteTrader,
  type MarketTraderAttentionListing,
  type MarketTraderSummary
} from '../../services/api';
import { useItemTooltipStore } from '../../stores/itemTooltip';
import { getLootIconSrc, hasValidIconId } from '../../utils/itemIcons';

const props = defineProps<{
  savedTraders: MarketFavoriteTrader[];
  traderSummary: MarketTraderSummary;
  favoritesLoading: boolean;
  traderPendingKeys: string[];
}>();

const emit = defineEmits<{
  'reload-favorites': [];
  'add-trader': [characterName: string];
  'remove-trader': [characterName: string];
  'open-character': [characterName: string];
  'open-item': [item: { itemId: number; itemName: string; itemIconId: number | null }];
}>();

const characterQuery = ref('');
const characterSearchLoading = ref(false);
const characterSearchResults = ref<MarketCharacterSearchResult[]>([]);
const traderAttentionPages = ref<Record<string, number>>({});
const tooltipStore = useItemTooltipStore();

let characterSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let activeCharacterSearchToken = 0;
const TRADER_ATTENTION_PAGE_SIZE = 4;
const settingsBusyIds = ref<string[]>([]);
const { addToast } = useToastBus();
const { showErrorFromException } = useErrorModal();

const traderKeySet = computed(
  () => new Set(props.savedTraders.map((trader) => getTraderKey(trader.characterName)))
);
const traderPendingKeySet = computed(() => new Set(props.traderPendingKeys));
const showCharacterSearchResults = computed(() => characterQuery.value.trim().length >= 2);
const sortedTraders = computed(() =>
  [...props.savedTraders].sort((left, right) => {
    if (left.needsAttention !== right.needsAttention) {
      return left.needsAttention ? -1 : 1;
    }
    if (left.undercutListings !== right.undercutListings) {
      return right.undercutListings - left.undercutListings;
    }
    if (left.attentionListingsCount !== right.attentionListingsCount) {
      return right.attentionListingsCount - left.attentionListingsCount;
    }
    const rightLastListed = right.lastListedAt ? new Date(right.lastListedAt).getTime() : 0;
    const leftLastListed = left.lastListedAt ? new Date(left.lastListedAt).getTime() : 0;
    if (rightLastListed !== leftLastListed) {
      return rightLastListed - leftLastListed;
    }
    return left.characterName.localeCompare(right.characterName);
  })
);

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function getTraderKey(characterName: string) {
  return `trader:${normalizeText(characterName).toLowerCase()}`;
}

function formatCompactDate(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(value);
}

function isTraderPending(characterName: string) {
  return traderPendingKeySet.value.has(getTraderKey(characterName));
}

function isCharacterResultBusy(characterName: string) {
  return isTraderPending(characterName);
}

function isSettingsBusy(favoriteId: string) {
  return settingsBusyIds.value.includes(favoriteId);
}

async function updateTraderNotificationSettings(
  favoriteId: string,
  payload: Record<string, boolean | number | null>
) {
  if (isSettingsBusy(favoriteId)) {
    return;
  }

  settingsBusyIds.value = [...settingsBusyIds.value, favoriteId];
  try {
    await api.updateMarketNotificationSettings(favoriteId, payload);
    emit('reload-favorites');
    addToast({
      title: 'Trader Alerts Updated',
      message: 'Notification settings were saved.',
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, 'Unable to update trader notification settings.');
  } finally {
    settingsBusyIds.value = settingsBusyIds.value.filter((id) => id !== favoriteId);
  }
}

function getCharacterResultStatus(characterName: string) {
  const key = getTraderKey(characterName);
  if (traderPendingKeySet.value.has(key)) return 'Saving...';
  if (traderKeySet.value.has(key)) return 'Saved';
  return 'Save trader';
}

function emitAddTrader(characterName: string) {
  const key = getTraderKey(characterName);
  if (traderPendingKeySet.value.has(key) || traderKeySet.value.has(key)) {
    return;
  }

  characterQuery.value = '';
  characterSearchResults.value = [];
  emit('add-trader', characterName);
}

function emitRemoveTrader(characterName: string) {
  if (isTraderPending(characterName)) {
    return;
  }

  emit('remove-trader', characterName);
}

function buildListingKey(trader: MarketFavoriteTrader, listing: MarketTraderAttentionListing) {
  return `${trader.id}:${listing.itemId}:${listing.slotId}:${listing.listedAt ?? 'na'}`;
}

function showListingTooltip(event: MouseEvent, listing: MarketTraderAttentionListing) {
  if (!listing.itemId || listing.itemId <= 0) {
    return;
  }

  void tooltipStore.showTooltip(
    {
      itemId: listing.itemId,
      itemName: listing.itemName,
      itemIconId: listing.itemIconId
    },
    { x: event.clientX, y: event.clientY }
  );
}

function updateMarketItemTooltipPosition(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function hideMarketItemTooltip() {
  tooltipStore.hideTooltip();
}

function getTraderAttentionTotalPages(trader: MarketFavoriteTrader) {
  return Math.max(1, Math.ceil(trader.attentionListings.length / TRADER_ATTENTION_PAGE_SIZE));
}

function getTraderAttentionPage(trader: MarketFavoriteTrader) {
  const currentPage = traderAttentionPages.value[trader.id] ?? 1;
  return Math.min(Math.max(1, currentPage), getTraderAttentionTotalPages(trader));
}

function setTraderAttentionPage(trader: MarketFavoriteTrader, page: number) {
  traderAttentionPages.value = {
    ...traderAttentionPages.value,
    [trader.id]: Math.min(Math.max(1, page), getTraderAttentionTotalPages(trader))
  };
}

function getPaginatedAttentionListings(trader: MarketFavoriteTrader) {
  const currentPage = getTraderAttentionPage(trader);
  const startIndex = (currentPage - 1) * TRADER_ATTENTION_PAGE_SIZE;
  return trader.attentionListings.slice(startIndex, startIndex + TRADER_ATTENTION_PAGE_SIZE);
}

function getTraderStatusLabel(trader: MarketFavoriteTrader) {
  if (!trader.hasActiveListings) return 'No active listings';
  if (trader.undercutListings > 0) return 'Undercut';
  if (trader.matchingListings > 0) return 'Price tied';
  return 'Competitive';
}

function getTraderStatusClass(trader: MarketFavoriteTrader) {
  if (!trader.hasActiveListings) return 'status-pill--muted';
  if (trader.undercutListings > 0) return 'status-pill--danger';
  if (trader.matchingListings > 0) return 'status-pill--warning';
  return 'status-pill--success';
}

function getTraderCardToneClass(trader: MarketFavoriteTrader) {
  if (!trader.hasActiveListings) return 'trader-card--muted';
  if (trader.undercutListings > 0) return 'trader-card--danger';
  if (trader.matchingListings > 0) return 'trader-card--warning';
  return 'trader-card--success';
}

function getListingStatusLabel(status: MarketTraderAttentionListing['status']) {
  return status === 'undercut' ? 'Undercut' : 'Price tied';
}

function getListingStatusClass(status: MarketTraderAttentionListing['status']) {
  return status === 'undercut' ? 'status-pill--danger' : 'status-pill--warning';
}

watch(characterQuery, (value) => {
  if (characterSearchTimeout) clearTimeout(characterSearchTimeout);

  const query = value.trim();
  if (query.length < 2) {
    characterSearchLoading.value = false;
    characterSearchResults.value = [];
    return;
  }

  characterSearchTimeout = setTimeout(async () => {
    const token = ++activeCharacterSearchToken;
    characterSearchLoading.value = true;
    try {
      const results = await api.searchMarketCharacters(query, 8);
      if (token !== activeCharacterSearchToken) {
        return;
      }
      characterSearchResults.value = results;
    } catch (error) {
      if (token !== activeCharacterSearchToken) {
        return;
      }
      console.error('Failed to search market characters for traders.', error);
      characterSearchResults.value = [];
    } finally {
      if (token === activeCharacterSearchToken) {
        characterSearchLoading.value = false;
      }
    }
  }, 220);
});

watch(
  sortedTraders,
  (traders) => {
    const nextPages: Record<string, number> = {};
    for (const trader of traders) {
      nextPages[trader.id] = getTraderAttentionPage(trader);
    }
    traderAttentionPages.value = nextPages;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (characterSearchTimeout) clearTimeout(characterSearchTimeout);
  tooltipStore.hideTooltipImmediate();
});
</script>

<style scoped>
.traders-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.traders-tab__header,
.panel,
.trader-card,
.summary-card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.26);
}
.traders-tab__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  border-radius: 1.2rem;
}
.traders-tab__copy {
  margin: 0.55rem 0 0;
  max-width: 42rem;
}
.traders-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.75rem;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1rem;
  border-radius: 1rem;
}
.summary-card strong {
  font-size: 1.15rem;
}
.summary-card--warning {
  border-color: rgba(250, 204, 21, 0.26);
}
.summary-card--danger {
  border-color: rgba(248, 113, 113, 0.26);
}
.panel {
  padding: 1.25rem;
  border-radius: 1.2rem;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.panel-head h3 {
  margin: 0;
}
.panel-head p {
  margin: 0.3rem 0 0;
}
.eyebrow {
  margin: 0 0 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
  color: #fbbf24;
}
.muted {
  color: #94a3b8;
}
.pill,
.status-pill,
.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(51, 65, 85, 0.45);
  color: #e2e8f0;
}
.pill {
  background: rgba(245, 158, 11, 0.14);
  border-color: rgba(245, 158, 11, 0.26);
  color: #fde68a;
  font-size: 0.84rem;
  font-weight: 600;
}
.status-pill {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.status-pill--success,
.stat-chip--success {
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.26);
  background: rgba(22, 101, 52, 0.18);
}
.status-pill--warning,
.stat-chip--warning {
  color: #fde68a;
  border-color: rgba(250, 204, 21, 0.24);
  background: rgba(133, 77, 14, 0.18);
}
.status-pill--danger,
.stat-chip--danger {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(127, 29, 29, 0.22);
}
.status-pill--muted {
  color: #cbd5e1;
}
.stat-chip {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  min-width: 5.65rem;
  padding: 0.7rem 0.9rem 0.75rem;
  text-align: center;
  white-space: nowrap;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 24px rgba(2, 6, 23, 0.18);
}
.stat-chip strong {
  font-size: 1.3rem;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.stat-chip small {
  color: inherit;
  font-size: 0.69rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.78;
  text-transform: uppercase;
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
.search-wrap {
  position: relative;
  margin-top: 1rem;
}
.search-input {
  min-height: 3rem;
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
.search-row {
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
}
.search-row + .search-row {
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}
.search-row:hover:not(:disabled) {
  background: rgba(30, 41, 59, 0.72);
}
.search-row:disabled {
  cursor: default;
  opacity: 0.8;
}
.search-row__main,
.search-row__text {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}
.search-row__text {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}
.search-row__status {
  white-space: nowrap;
}
.status-banner {
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(250, 204, 21, 0.24);
}
.status-banner--warning {
  background: rgba(120, 53, 15, 0.2);
  color: #fde68a;
}
.trader-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.trader-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  padding: 1.25rem;
  border-radius: 1.2rem;
}
.trader-card--success {
  border-color: rgba(34, 197, 94, 0.22);
}
.trader-card--warning {
  border-color: rgba(250, 204, 21, 0.22);
}
.trader-card--danger {
  border-color: rgba(248, 113, 113, 0.24);
}
.trader-card__header,
.trader-card__identity,
.trader-card__meta,
.trader-card__stats {
  display: flex;
  gap: 0.75rem;
}
.trader-card__header {
  align-items: flex-start;
  justify-content: space-between;
}
.trader-card__identity {
  flex-wrap: wrap;
  align-items: center;
}
.trader-card__name {
  padding: 0;
  border: none;
  background: transparent;
  color: #f8fafc;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
}
.trader-card__meta {
  flex-wrap: wrap;
}
.trader-card__stats {
  flex-wrap: wrap;
  gap: 0.55rem;
}
.trader-card__alerts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.56);
  border: 1px solid rgba(148, 163, 184, 0.14);
}
.trader-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 20.5rem;
}
.trader-table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
}
.trader-table th,
.trader-table td {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
  white-space: nowrap;
}
.trader-table th {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.table-wrap {
  overflow-x: auto;
}
.trader-card__table-wrap {
  flex: 1;
}
.trader-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.9rem;
}
.trader-pagination__meta {
  font-size: 0.9rem;
  text-align: center;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 14rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.table-item__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
  min-width: 0;
}
.item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.55rem;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}
.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gap-stack {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}
.alert-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #cbd5e1;
  font-size: 0.84rem;
}
.alert-toggle input {
  margin: 0;
}
.empty {
  border-radius: 1rem;
  padding: 1rem 1.1rem;
  background: rgba(15, 23, 42, 0.68);
}
.trader-card__empty {
  margin: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
@media (max-width: 1200px) {
  .traders-summary,
  .trader-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .traders-tab__header,
  .trader-card__header {
    flex-direction: column;
  }
  .trader-pagination {
    flex-direction: column;
  }
  .trader-card__alerts {
    flex-direction: column;
    align-items: flex-start;
  }
  .traders-summary,
  .trader-grid {
    grid-template-columns: 1fr;
  }
}
</style>
