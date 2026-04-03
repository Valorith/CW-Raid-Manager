<template>
  <section class="favorites-tab">
    <header class="favorites-tab__header">
      <div>
        <p class="eyebrow">Personal Watchlist</p>
        <h2>Watchlist</h2>
        <p class="muted favorites-tab__copy">
          Keep quick-access lists for the items and characters you want to monitor most often.
        </p>
      </div>
      <button
        type="button"
        class="btn btn--outline btn--small"
        :disabled="props.favoritesLoading"
        @click="emit('reload-favorites')"
      >
        {{ props.favoritesLoading ? 'Refreshing...' : 'Reload Watchlist' }}
      </button>
    </header>

    <section class="favorites-grid">
      <article class="panel">
        <div class="panel-head">
          <div>
            <h3>Watched Items</h3>
            <p class="muted">Search any discovered item and add it to your watchlist.</p>
          </div>
          <span class="pill">{{ props.favoriteItems.length }}</span>
        </div>

        <div class="search-wrap">
          <input
            v-model="itemQuery"
            type="search"
            class="input search-input"
            placeholder="Search discovered items..."
          />
          <small v-if="itemSearchLoading" class="muted search-hint">Searching...</small>
          <div v-if="showItemSearchResults" class="search-results">
            <button
              v-for="item in itemSearchResults"
              :key="`${item.itemId ?? 'name'}-${item.itemName}`"
              type="button"
              class="search-row"
              :disabled="isItemResultBusy(item)"
              @click="emitAddItemFavorite(item)"
            >
              <span class="search-row__main">
                <span v-if="hasValidIconId(item.itemIconId)" class="item-icon">
                  <img
                    :src="getLootIconSrc(item.itemIconId!)"
                    :alt="item.itemName"
                    loading="lazy"
                  />
                </span>
                <span class="search-row__text">
                  <strong>{{ item.itemName }}</strong>
                  <small class="muted">
                    Item {{ formatNumber(item.itemId) }} · Discovered item
                  </small>
                </span>
              </span>
              <span class="search-row__status muted">
                {{ getItemResultStatus(item) }}
              </span>
            </button>
            <p
              v-if="
                !itemSearchLoading && itemQuery.trim().length >= 2 && itemSearchResults.length === 0
              "
              class="search-empty muted"
            >
              No matching discovered items found.
            </p>
          </div>
        </div>

        <div v-if="props.favoritesLoading && props.favoriteItems.length === 0" class="empty muted">
          Loading favorite items...
        </div>
        <template v-else-if="props.favoriteItems.length">
          <div class="table-wrap">
            <table class="favorites-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Avg Price</th>
                  <th>Last Price</th>
                  <th>Trend</th>
                  <th>Sales</th>
                  <th>Units</th>
                  <th>Revenue</th>
                  <th>Last Sold</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in paginatedFavoriteItems" :key="item.id">
                  <td>
                    <button type="button" class="table-item" @click="emit('open-item', item)">
                      <span v-if="hasValidIconId(item.itemIconId)" class="item-icon">
                        <img
                          :src="getLootIconSrc(item.itemIconId!)"
                          :alt="item.itemName"
                          loading="lazy"
                        />
                      </span>
                      <span class="table-item__text">
                        <strong>{{ item.itemName }}</strong>
                        <small class="muted">Added {{ formatCompactDate(item.createdAt) }}</small>
                      </span>
                    </button>
                  </td>
                  <td>{{ formatPlatinum(item.averagePrice) }}</td>
                  <td>{{ formatOptionalPlatinum(item.lastPrice) }}</td>
                  <td>
                    <span
                      class="trend-indicator"
                      :class="getPriceTrendClass(item.lastPrice, item.averagePrice)"
                      :title="getPriceTrendLabel(item.lastPrice, item.averagePrice)"
                    >
                      {{ getPriceTrendIcon(item.lastPrice, item.averagePrice) }}
                    </span>
                  </td>
                  <td>{{ formatNumber(item.totalSales) }}</td>
                  <td>{{ formatNumber(item.totalUnitsSold) }}</td>
                  <td>{{ formatPlatinum(item.totalRevenue) }}</td>
                  <td>{{ formatCompactDate(item.lastSoldAt) }}</td>
                  <td class="favorites-table__action">
                    <button
                      type="button"
                      class="btn btn--outline btn--small"
                      :disabled="isItemPending(item)"
                      @click="emitRemoveItemFavorite(item)"
                    >
                      {{ isItemPending(item) ? 'Removing...' : 'Remove' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="itemFavoriteTotalPages > 1" class="pagination">
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="itemFavoritesPage <= 1"
              @click="setItemFavoritesPage(itemFavoritesPage - 1)"
            >
              Previous
            </button>
            <span class="pagination__meta muted">
              Page {{ itemFavoritesPage }} of {{ itemFavoriteTotalPages }} ·
              {{ formatNumber(props.favoriteItems.length) }} watched items
            </span>
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="itemFavoritesPage >= itemFavoriteTotalPages"
              @click="setItemFavoritesPage(itemFavoritesPage + 1)"
            >
              Next
            </button>
          </div>
        </template>
        <p v-else class="empty muted">No watched items yet.</p>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <h3>Watched Characters</h3>
            <p class="muted">Track traders and buyers you revisit often.</p>
          </div>
          <span class="pill pill--muted">{{ props.favoriteCharacters.length }}</span>
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
              :disabled="isCharacterResultBusy(character)"
              @click="emitAddCharacterFavorite(character.characterName)"
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

        <div
          v-if="props.favoritesLoading && props.favoriteCharacters.length === 0"
          class="empty muted"
        >
          Loading favorite characters...
        </div>
        <template v-else-if="props.favoriteCharacters.length">
          <div class="table-wrap">
            <table class="favorites-table favorites-table--characters">
              <thead>
                <tr>
                  <th>Character</th>
                  <th>Sells</th>
                  <th>Buys</th>
                  <th>Total Trades</th>
                  <th>Last Seen</th>
                  <th>Saved</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="character in paginatedFavoriteCharacters" :key="character.id">
                  <td>
                    <button
                      type="button"
                      class="table-item table-item--compact"
                      @click="emit('open-character', character.characterName)"
                    >
                      <span class="table-item__text">
                        <strong>{{ character.characterName }}</strong>
                      </span>
                    </button>
                  </td>
                  <td>{{ formatNumber(character.sellCount) }}</td>
                  <td>{{ formatNumber(character.buyCount) }}</td>
                  <td>{{ formatNumber(character.totalTransactions) }}</td>
                  <td>{{ formatCompactDate(character.lastSeenAt) }}</td>
                  <td>{{ formatCompactDate(character.createdAt) }}</td>
                  <td class="favorites-table__action">
                    <button
                      type="button"
                      class="btn btn--outline btn--small"
                      :disabled="isCharacterPending(character.characterName)"
                      @click="emitRemoveCharacterFavorite(character.characterName)"
                    >
                      {{ isCharacterPending(character.characterName) ? 'Removing...' : 'Remove' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="characterFavoriteTotalPages > 1" class="pagination">
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="characterFavoritesPage <= 1"
              @click="setCharacterFavoritesPage(characterFavoritesPage - 1)"
            >
              Previous
            </button>
            <span class="pagination__meta muted">
              Page {{ characterFavoritesPage }} of {{ characterFavoriteTotalPages }} ·
              {{ formatNumber(props.favoriteCharacters.length) }} watched characters
            </span>
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="characterFavoritesPage >= characterFavoriteTotalPages"
              @click="setCharacterFavoritesPage(characterFavoritesPage + 1)"
            >
              Next
            </button>
          </div>
        </template>
        <p v-else class="empty muted">No watched characters yet.</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  api,
  type MarketCharacterSearchResult,
  type MarketDiscoveredItemSearchResult,
  type MarketFavoriteCharacter,
  type MarketFavoriteItem
} from '../../services/api';
import { getLootIconSrc, hasValidIconId } from '../../utils/itemIcons';

const props = defineProps<{
  favoriteItems: MarketFavoriteItem[];
  favoriteCharacters: MarketFavoriteCharacter[];
  favoritesLoading: boolean;
  itemPendingKeys: string[];
  characterPendingKeys: string[];
}>();

const emit = defineEmits<{
  'open-item': [item: MarketFavoriteItem];
  'open-character': [characterName: string];
  'reload-favorites': [];
  'add-item-favorite': [item: MarketDiscoveredItemSearchResult];
  'remove-item-favorite': [item: MarketFavoriteItem];
  'add-character-favorite': [characterName: string];
  'remove-character-favorite': [characterName: string];
}>();

const itemQuery = ref('');
const itemSearchLoading = ref(false);
const itemSearchResults = ref<MarketDiscoveredItemSearchResult[]>([]);
const itemFavoritesPage = ref(1);

const characterQuery = ref('');
const characterSearchLoading = ref(false);
const characterSearchResults = ref<MarketCharacterSearchResult[]>([]);
const characterFavoritesPage = ref(1);

let itemSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let characterSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let activeItemSearchToken = 0;
let activeCharacterSearchToken = 0;
const FAVORITES_PAGE_SIZE = 8;

const favoriteItemKeys = computed(
  () => new Set(props.favoriteItems.map((item) => getFavoriteItemKey(item)))
);
const favoriteCharacterKeys = computed(
  () =>
    new Set(
      props.favoriteCharacters.map((character) => getFavoriteCharacterKey(character.characterName))
    )
);
const itemPendingKeySet = computed(() => new Set(props.itemPendingKeys));
const characterPendingKeySet = computed(() => new Set(props.characterPendingKeys));
const showItemSearchResults = computed(() => itemQuery.value.trim().length >= 2);
const showCharacterSearchResults = computed(() => characterQuery.value.trim().length >= 2);
const itemFavoriteTotalPages = computed(() =>
  Math.max(1, Math.ceil(props.favoriteItems.length / FAVORITES_PAGE_SIZE))
);
const characterFavoriteTotalPages = computed(() =>
  Math.max(1, Math.ceil(props.favoriteCharacters.length / FAVORITES_PAGE_SIZE))
);
const paginatedFavoriteItems = computed(() => {
  const startIndex = (itemFavoritesPage.value - 1) * FAVORITES_PAGE_SIZE;
  return props.favoriteItems.slice(startIndex, startIndex + FAVORITES_PAGE_SIZE);
});
const paginatedFavoriteCharacters = computed(() => {
  const startIndex = (characterFavoritesPage.value - 1) * FAVORITES_PAGE_SIZE;
  return props.favoriteCharacters.slice(startIndex, startIndex + FAVORITES_PAGE_SIZE);
});

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeItemKey(itemId: number | null | undefined, itemName: string) {
  const normalizedName = normalizeText(itemName).toLowerCase();
  return itemId != null ? `item:${itemId}` : `item-name:${normalizedName}`;
}

function getFavoriteItemKey(item: Pick<MarketFavoriteItem, 'itemId' | 'itemName'>) {
  return normalizeItemKey(item.itemId, item.itemName);
}

function getSearchResultItemKey(
  item: Pick<MarketDiscoveredItemSearchResult, 'itemId' | 'itemName'>
) {
  return normalizeItemKey(item.itemId, item.itemName);
}

function getFavoriteCharacterKey(characterName: string) {
  return `character:${normalizeText(characterName).toLowerCase()}`;
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

function formatPlatinum(valueInCopper: number) {
  const platinum = valueInCopper / 1000;
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: platinum < 100 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(platinum)} pp`;
}

function formatOptionalPlatinum(valueInCopper: number | null) {
  return valueInCopper == null ? '—' : formatPlatinum(valueInCopper);
}

function getPriceTrendDirection(lastPrice: number | null | undefined, averagePrice: number | null | undefined) {
  if (lastPrice == null || averagePrice == null || averagePrice <= 0) {
    return 'unknown';
  }

  if (lastPrice > averagePrice) {
    return 'up';
  }

  if (lastPrice < averagePrice) {
    return 'down';
  }

  return 'flat';
}

function getPriceTrendIcon(lastPrice: number | null | undefined, averagePrice: number | null | undefined) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return '↗';
  if (direction === 'down') return '↘';
  if (direction === 'flat') return '→';
  return '•';
}

function getPriceTrendLabel(lastPrice: number | null | undefined, averagePrice: number | null | undefined) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return 'Last price is above average';
  if (direction === 'down') return 'Last price is below average';
  if (direction === 'flat') return 'Last price matches average';
  return 'Last price is unavailable';
}

function getPriceTrendClass(lastPrice: number | null | undefined, averagePrice: number | null | undefined) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return 'trend-indicator--up';
  if (direction === 'down') return 'trend-indicator--down';
  return 'trend-indicator--flat';
}

function setItemFavoritesPage(page: number) {
  itemFavoritesPage.value = Math.min(Math.max(1, page), itemFavoriteTotalPages.value);
}

function setCharacterFavoritesPage(page: number) {
  characterFavoritesPage.value = Math.min(Math.max(1, page), characterFavoriteTotalPages.value);
}

function isItemResultBusy(item: MarketDiscoveredItemSearchResult) {
  return itemPendingKeySet.value.has(getSearchResultItemKey(item));
}

function isCharacterResultBusy(character: MarketCharacterSearchResult) {
  return characterPendingKeySet.value.has(getFavoriteCharacterKey(character.characterName));
}

function isItemPending(item: Pick<MarketFavoriteItem, 'itemId' | 'itemName'>) {
  return itemPendingKeySet.value.has(getFavoriteItemKey(item));
}

function isCharacterPending(characterName: string) {
  return characterPendingKeySet.value.has(getFavoriteCharacterKey(characterName));
}

function getItemResultStatus(item: MarketDiscoveredItemSearchResult) {
  const key = getSearchResultItemKey(item);
  if (itemPendingKeySet.value.has(key)) return 'Watching...';
  if (favoriteItemKeys.value.has(key)) return 'Watching';
  return 'Watch';
}

function getCharacterResultStatus(characterName: string) {
  const key = getFavoriteCharacterKey(characterName);
  if (characterPendingKeySet.value.has(key)) return 'Watching...';
  if (favoriteCharacterKeys.value.has(key)) return 'Watching';
  return 'Watch';
}

function emitAddItemFavorite(item: MarketDiscoveredItemSearchResult) {
  if (isItemResultBusy(item) || favoriteItemKeys.value.has(getSearchResultItemKey(item))) {
    return;
  }

  setItemFavoritesPage(1);
  itemQuery.value = '';
  itemSearchResults.value = [];
  emit('add-item-favorite', item);
}

function emitRemoveItemFavorite(item: MarketFavoriteItem) {
  if (isItemPending(item)) {
    return;
  }

  emit('remove-item-favorite', item);
}

function emitAddCharacterFavorite(characterName: string) {
  if (
    isCharacterPending(characterName) ||
    favoriteCharacterKeys.value.has(getFavoriteCharacterKey(characterName))
  ) {
    return;
  }

  setCharacterFavoritesPage(1);
  characterQuery.value = '';
  characterSearchResults.value = [];
  emit('add-character-favorite', characterName);
}

function emitRemoveCharacterFavorite(characterName: string) {
  if (isCharacterPending(characterName)) {
    return;
  }

  emit('remove-character-favorite', characterName);
}

watch(itemQuery, (value) => {
  if (itemSearchTimeout) clearTimeout(itemSearchTimeout);

  const query = value.trim();
  if (query.length < 2) {
    itemSearchLoading.value = false;
    itemSearchResults.value = [];
    return;
  }

  itemSearchTimeout = setTimeout(async () => {
    const token = ++activeItemSearchToken;
    itemSearchLoading.value = true;
    try {
      const results = await api.searchMarketDiscoveredItems(query, 8);
      if (token !== activeItemSearchToken) {
        return;
      }
      itemSearchResults.value = results;
    } catch (error) {
      if (token !== activeItemSearchToken) {
        return;
      }
      console.error('Failed to search discovered market items.', error);
      itemSearchResults.value = [];
    } finally {
      if (token === activeItemSearchToken) {
        itemSearchLoading.value = false;
      }
    }
  }, 220);
});

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
      console.error('Failed to search market characters.', error);
      characterSearchResults.value = [];
    } finally {
      if (token === activeCharacterSearchToken) {
        characterSearchLoading.value = false;
      }
    }
  }, 220);
});

watch(
  () => props.favoriteItems.length,
  () => {
    setItemFavoritesPage(itemFavoritesPage.value);
  }
);

watch(
  () => props.favoriteCharacters.length,
  () => {
    setCharacterFavoritesPage(characterFavoritesPage.value);
  }
);

watch(
  () => props.favoritesLoading,
  (isLoading) => {
    if (isLoading) {
      return;
    }

    setItemFavoritesPage(itemFavoritesPage.value);
    setCharacterFavoritesPage(characterFavoritesPage.value);
  }
);

onBeforeUnmount(() => {
  if (itemSearchTimeout) clearTimeout(itemSearchTimeout);
  if (characterSearchTimeout) clearTimeout(characterSearchTimeout);
});
</script>

<style scoped>
.favorites-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.favorites-tab__header,
.panel {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.26);
}
.favorites-tab__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  border-radius: 1.2rem;
}
.favorites-tab__copy {
  margin: 0.55rem 0 0;
  max-width: 42rem;
}
.favorites-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
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
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}
.search-row + .search-row {
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}
.search-row:hover:not(:disabled) {
  background: rgba(30, 41, 59, 0.72);
  transform: translateY(-1px);
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
.table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}
.favorites-table {
  width: 100%;
  min-width: 54rem;
  border-collapse: collapse;
}
.favorites-table--characters {
  min-width: 46rem;
}
.favorites-table th,
.favorites-table td {
  padding: 0.8rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
  white-space: nowrap;
}
.favorites-table th {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.favorites-table tbody tr:hover {
  background: rgba(30, 41, 59, 0.34);
}
.favorites-table__action {
  text-align: right;
}
.trend-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.72);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}
.trend-indicator--up {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.26);
  background: rgba(16, 185, 129, 0.12);
}
.trend-indicator--down {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.26);
  background: rgba(239, 68, 68, 0.12);
}
.trend-indicator--flat {
  color: #94a3b8;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
}
.pagination__meta {
  font-size: 0.92rem;
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
.table-item--compact {
  min-width: 10rem;
}
.table-item__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
  min-width: 0;
}
.table-item__text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.empty,
.search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 7rem;
}
.item-icon {
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.14);
  overflow: hidden;
}
.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
@media (max-width: 980px) {
  .favorites-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 768px) {
  .favorites-tab__header,
  .panel {
    padding: 1rem;
  }
  .favorites-tab__header {
    flex-direction: column;
  }
  .pagination {
    flex-direction: column;
    align-items: stretch;
  }
  .pagination__meta {
    order: -1;
  }
}
</style>
