<template>
  <section class="listings-tab">
    <header class="listings-tab__header">
      <div>
        <p class="eyebrow">Trader Listings Cache</p>
        <h2>Listings</h2>
        <p class="muted listings-tab__copy">
          Browse current bazaar listings cached from EQEmu trader data. The cache only checks for
          a fresh retrieval when this tab is opened after 15 minutes.
        </p>
      </div>
      <div class="listings-tab__header-actions">
        <button
          type="button"
          class="btn btn--outline btn--small"
          :disabled="loading || !hasActiveFilters"
          @click="resetFilters"
        >
          Clear Filters
        </button>
        <button
          type="button"
          class="btn btn--outline btn--small"
          :disabled="loading"
          @click="refreshListings"
        >
          {{ loading && hasLoaded ? 'Refreshing...' : 'Refresh Results' }}
        </button>
      </div>
    </header>

    <section
      class="listings-cooldown"
      :class="{ 'listings-cooldown--ready': listingsCooldownReady }"
      aria-live="polite"
    >
      <div class="listings-cooldown__row">
        <span class="listings-cooldown__label">EQEmu refresh window</span>
        <strong class="listings-cooldown__value">{{ listingsCooldownStatus }}</strong>
        <span v-if="listingsCooldownMeta" class="muted listings-cooldown__meta">
          {{ listingsCooldownMeta }}
        </span>
      </div>
      <div class="listings-cooldown__bar" aria-hidden="true">
        <span
          class="listings-cooldown__bar-fill"
          :style="{ width: `${listingsCooldownProgress}%` }"
        />
      </div>
    </section>

    <article class="panel">
      <div class="panel-head">
        <div>
          <h3>Active Bazaar Listings</h3>
          <p class="muted">
            Filter by item, seller, type, equipment slot, price, charges, and listing age.
          </p>
        </div>
        <span class="pill">
          {{
            activeFilterChips.length
              ? `${activeFilterChips.length} filters active`
              : 'All listings'
          }}
        </span>
      </div>

      <section class="filters">
        <div class="filters-shell">
          <div class="filters-shell__top">
            <label class="filter-search">
              <span class="filter-field__label">Search Listings</span>
              <input
                v-model="keywordQuery"
                type="search"
                class="input filter-search__input"
                placeholder="Search by item or seller..."
              />
            </label>

            <div class="filters-shell__actions">
              <button
                type="button"
                class="btn btn--outline btn--small filters-toggle"
                :class="{ 'filters-toggle--active': advancedFiltersOpen || hasAdvancedFilters }"
                :aria-expanded="advancedFiltersOpen"
                @click="advancedFiltersOpen = !advancedFiltersOpen"
              >
                {{ advancedFiltersOpen ? 'Hide Filters' : 'More Filters' }}
                <span v-if="hasAdvancedFilters" class="filters-toggle__count">
                  {{ advancedFilterCount }}
                </span>
              </button>

              <label class="filter-select">
                <span class="filter-field__label">Sort By</span>
                <select v-model="sortBy" class="input" :disabled="loading">
                  <option value="listedAt">Newest Listings</option>
                  <option value="price">Price</option>
                  <option value="analysis">Analysis</option>
                  <option value="charges">Charges</option>
                  <option value="itemName">Item Name</option>
                  <option value="sellerName">Seller</option>
                  <option value="slotId">Slot</option>
                </select>
              </label>
            </div>
          </div>

          <div class="filters-shell__row">
            <div class="filter-group">
              <span class="filter-group__label">Listed</span>
              <div class="choice-pills">
                <button
                  v-for="option in listedWithinOptions"
                  :key="option.value"
                  type="button"
                  class="choice-pill"
                  :class="{ 'choice-pill--active': listedWithinDays === option.value }"
                  :aria-pressed="listedWithinDays === option.value"
                  @click="listedWithinDays = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="filter-group">
              <span class="filter-group__label">Direction</span>
              <div class="choice-pills">
                <button
                  type="button"
                  class="choice-pill"
                  :class="{ 'choice-pill--active': sortOrder === 'desc' }"
                  :aria-pressed="sortOrder === 'desc'"
                  @click="sortOrder = 'desc'"
                >
                  Desc
                </button>
                <button
                  type="button"
                  class="choice-pill"
                  :class="{ 'choice-pill--active': sortOrder === 'asc' }"
                  :aria-pressed="sortOrder === 'asc'"
                  @click="sortOrder = 'asc'"
                >
                  Asc
                </button>
              </div>
            </div>

            <div class="filter-group">
              <span class="filter-group__label">Price Signal</span>
              <div class="choice-pills">
                <button
                  type="button"
                  class="choice-pill choice-pill--deal"
                  :class="{ 'choice-pill--deal-active': dealsOnly }"
                  :aria-pressed="dealsOnly"
                  @click="dealsOnly = !dealsOnly"
                >
                  <span class="deal-toggle__icon" aria-hidden="true">↘</span>
                  <span>See Deals</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="advancedFiltersOpen" class="filters-drawer">
            <div class="filters-drawer__grid">
              <label class="filter-field">
                <span class="filter-field__label">Item Type</span>
                <select v-model="itemTypeValue" class="input">
                  <option value="">All item types</option>
                  <option
                    v-for="option in itemTypeOptions"
                    :key="option.value"
                    :value="String(option.value)"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label class="filter-field">
                <span class="filter-field__label">Equip Slot</span>
                <select v-model="equipSlotValue" class="input">
                  <option value="">All equip slots</option>
                  <option
                    v-for="option in itemSlotOptions"
                    :key="option.slotId"
                    :value="String(option.slotId)"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label class="filter-field">
                <span class="filter-field__label">Item Name</span>
                <input
                  v-model="itemNameQuery"
                  type="search"
                  class="input"
                  placeholder="Specific item..."
                />
              </label>

              <label class="filter-field">
                <span class="filter-field__label">Seller</span>
                <input
                  v-model="sellerNameQuery"
                  type="search"
                  class="input"
                  placeholder="Trader name..."
                />
              </label>

              <div class="range-card">
                <span class="filter-field__label">Price Range (pp)</span>
                <div class="range-card__inputs">
                  <input
                    v-model="minPricePp"
                    type="number"
                    min="0"
                    step="0.1"
                    inputmode="decimal"
                    class="input"
                    placeholder="Min"
                  />
                  <input
                    v-model="maxPricePp"
                    type="number"
                    min="0"
                    step="0.1"
                    inputmode="decimal"
                    class="input"
                    placeholder="Max"
                  />
                </div>
              </div>

              <div class="range-card">
                <span class="filter-field__label">Charges</span>
                <div class="range-card__inputs">
                  <input
                    v-model="minCharges"
                    type="number"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    class="input"
                    placeholder="Min"
                  />
                  <input
                    v-model="maxCharges"
                    type="number"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    class="input"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-if="activeFilterChips.length" class="filter-chips">
            <button
              v-for="chip in activeFilterChips"
              :key="chip.key"
              type="button"
              class="filter-chip"
              @click="clearFilter(chip.key)"
            >
              <span>{{ chip.label }}</span>
              <span class="filter-chip__remove" aria-hidden="true">x</span>
            </button>
          </div>
        </div>
      </section>

      <div v-if="loading && !hasLoaded" class="empty muted">Loading cached bazaar listings...</div>

      <template v-else>
        <section class="stats">
          <article class="card card--accent">
            <span class="label">Listings</span>
            <strong>{{ formatNumber(summary.totalListings) }}</strong>
            <small>matching cached entries</small>
          </article>
          <article class="card">
            <span class="label">Sellers</span>
            <strong>{{ formatNumber(summary.distinctSellers) }}</strong>
            <small>distinct traders</small>
          </article>
          <article class="card">
            <span class="label">Items</span>
            <strong>{{ formatNumber(summary.distinctItems) }}</strong>
            <small>distinct item ids</small>
          </article>
          <article class="card">
            <span class="label">Newest</span>
            <strong>{{ formatCompactDate(summary.newestListingAt) }}</strong>
            <small>{{ formatTime(summary.newestListingAt) }}</small>
          </article>
        </section>

        <div v-if="validationMessage" class="status-banner status-banner--warning">
          {{ validationMessage }}
        </div>
        <div v-else-if="!listingsPage?.sourceAvailable" class="empty muted">
          {{ listingsPage?.message ?? unavailableMessage }}
        </div>
        <template v-else-if="displayListings.length">
          <div class="table-wrap">
            <table class="listings-table">
              <thead>
                <tr>
                  <th :aria-sort="getColumnAriaSort('itemName')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'itemName' }"
                      @click="toggleSort('itemName')"
                    >
                      <span>Item</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('itemName')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('price')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'price' }"
                      @click="toggleSort('price')"
                    >
                      <span>Price</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('price')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('analysis')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'analysis' }"
                      @click="toggleSort('analysis')"
                    >
                      <span>Analysis</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('analysis')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('charges')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'charges' }"
                      @click="toggleSort('charges')"
                    >
                      <span>Charges</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('charges')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('sellerName')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'sellerName' }"
                      @click="toggleSort('sellerName')"
                    >
                      <span>Seller</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('sellerName')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('listedAt')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'listedAt' }"
                      @click="toggleSort('listedAt')"
                    >
                      <span>Listed</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('listedAt')
                      }}</span>
                    </button>
                  </th>
                  <th :aria-sort="getColumnAriaSort('slotId')">
                    <button
                      type="button"
                      class="table-sort"
                      :class="{ 'table-sort--active': sortBy === 'slotId' }"
                      @click="toggleSort('slotId')"
                    >
                      <span>Slot</span>
                      <span class="table-sort__icon" aria-hidden="true">{{
                        getSortIndicator('slotId')
                      }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="listing in displayListings" :key="buildListingKey(listing)">
                  <td>
                    <button
                      type="button"
                      class="table-item"
                      @mouseenter="showListingTooltip($event, listing)"
                      @mousemove="updateMarketItemTooltipPosition($event)"
                      @mouseleave="hideMarketItemTooltip"
                      @click="emit('open-item', listing)"
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
                        <small class="muted">Item {{ formatNumber(listing.itemId) }}</small>
                      </span>
                    </button>
                  </td>
                  <td>{{ formatPlatinum(listing.price) }}</td>
                  <td>
                    <div
                      class="listing-analysis"
                      :class="getListingAnalysisClass(listing.price, listing.itemAveragePrice)"
                      :title="getListingAnalysisTitle(listing.price, listing.itemAveragePrice)"
                    >
                      <span class="listing-analysis__arrow" aria-hidden="true">
                        {{ getListingAnalysisArrow(listing.price, listing.itemAveragePrice) }}
                      </span>
                      <span
                        v-if="getListingAnalysisPercent(listing.price, listing.itemAveragePrice)"
                        class="listing-analysis__percent"
                      >
                        {{ getListingAnalysisPercent(listing.price, listing.itemAveragePrice) }}
                      </span>
                    </div>
                  </td>
                  <td>{{ formatOptionalNumber(listing.charges) }}</td>
                  <td>
                    <button
                      type="button"
                      class="character-history-link"
                      @click="emit('open-character', listing.sellerCharacterName)"
                    >
                      {{ listing.sellerCharacterName }}
                    </button>
                  </td>
                  <td>{{ formatDateTime(listing.listedAt) }}</td>
                  <td>{{ formatSlot(listing.slotId) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="listingsPage && listingsPage.totalPages > 1" class="pagination">
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="loading || currentPage <= 1"
              @click="changePage(currentPage - 1)"
            >
              Previous
            </button>
            <span class="pagination__meta muted">
              Page {{ currentPage }} of {{ listingsPage.totalPages }} ·
              {{ formatNumber(listingsPage.total) }} listings
            </span>
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="loading || currentPage >= listingsPage.totalPages"
              @click="changePage(currentPage + 1)"
            >
              Next
            </button>
          </div>
        </template>
        <p v-else class="empty muted">
          {{
            hasActiveFilters
              ? 'No cached bazaar listings match the current filters.'
              : 'No cached bazaar listings are currently available.'
          }}
        </p>
      </template>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { EQEMU_ITEM_SLOT_OPTIONS, EQEMU_ITEM_TYPE_OPTIONS } from '../../data/eqItemFilters';
import {
  api,
  type MarketListing,
  type MarketListingsFilters,
  type MarketListingsPage,
  type MarketListingsSortField
} from '../../services/api';
import { useItemTooltipStore } from '../../stores/itemTooltip';
import { resolveSlotPlacement, slotDisplayLabel } from '../../utils/inventory';
import { getLootIconSrc, hasValidIconId } from '../../utils/itemIcons';

const props = defineProps<{
  active: boolean;
}>();

const emit = defineEmits<{
  'open-item': [item: MarketListing];
  'open-character': [characterName: string];
  'sync-status-change': [lastRetrievedAt: string | null];
}>();

const tooltipStore = useItemTooltipStore();
const listingsPage = ref<MarketListingsPage | null>(null);
const loading = ref(false);
const hasLoaded = ref(false);
const currentPage = ref(1);

const keywordQuery = ref('');
const itemNameQuery = ref('');
const sellerNameQuery = ref('');
const itemTypeValue = ref('');
const equipSlotValue = ref('');
const minPricePp = ref('');
const maxPricePp = ref('');
const minCharges = ref('');
const maxCharges = ref('');
const listedWithinDays = ref('');
const dealsOnly = ref(false);
const sortBy = ref<MarketListingsSortField>('listedAt');
const sortOrder = ref<'asc' | 'desc'>('desc');
const advancedFiltersOpen = ref(false);

let activeRequestToken = 0;
let filterTimeout: ReturnType<typeof setTimeout> | null = null;
let cooldownInterval: ReturnType<typeof setInterval> | null = null;

const LISTINGS_PAGE_SIZE = 25;
const LISTINGS_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
const unavailableMessage = 'Bazaar listings are unavailable right now.';
const itemTypeOptions = EQEMU_ITEM_TYPE_OPTIONS;
const itemSlotOptions = EQEMU_ITEM_SLOT_OPTIONS;
const listedWithinOptions = [
  { value: '', label: 'Any time' },
  { value: '1', label: '1 day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' }
] as const;
const summary = computed(() =>
  validationMessage.value
    ? {
        totalListings: 0,
        distinctSellers: 0,
        distinctItems: 0,
        newestListingAt: null
      }
    : (listingsPage.value?.summary ?? {
        totalListings: 0,
        distinctSellers: 0,
        distinctItems: 0,
        newestListingAt: null
      })
);
const displayListings = computed(() =>
  validationMessage.value ? [] : (listingsPage.value?.listings ?? [])
);
const currentTimeMs = ref(Date.now());
const listingsLastRetrievedAt = computed(
  () => listingsPage.value?.syncStatus.lastRetrievedAt ?? null
);
const listingsNextEligibleAtMs = computed(() => {
  if (!listingsLastRetrievedAt.value) {
    return null;
  }

  return new Date(listingsLastRetrievedAt.value).getTime() + LISTINGS_REFRESH_COOLDOWN_MS;
});
const listingsCooldownRemainingMs = computed(() => {
  if (!listingsNextEligibleAtMs.value) {
    return 0;
  }

  return Math.max(0, listingsNextEligibleAtMs.value - currentTimeMs.value);
});
const listingsCooldownReady = computed(
  () => listingsLastRetrievedAt.value != null && listingsCooldownRemainingMs.value <= 0
);
const listingsCooldownProgress = computed(() => {
  if (!listingsLastRetrievedAt.value) {
    return 0;
  }

  const elapsed = LISTINGS_REFRESH_COOLDOWN_MS - listingsCooldownRemainingMs.value;
  return Math.max(0, Math.min(100, (elapsed / LISTINGS_REFRESH_COOLDOWN_MS) * 100));
});
const listingsCooldownStatus = computed(() => {
  if (!listingsLastRetrievedAt.value) {
    return 'Awaiting first retrieval';
  }

  return listingsCooldownReady.value
    ? 'Ready for refresh'
    : `Next refresh in ${formatCooldownClock(listingsCooldownRemainingMs.value)}`;
});
const listingsCooldownMeta = computed(() => {
  if (!listingsLastRetrievedAt.value) {
    return null;
  }

  const nextEligibleAt = new Date(listingsNextEligibleAtMs.value ?? Date.now()).toISOString();

  return listingsCooldownReady.value
    ? `Updated ${formatDateTime(listingsLastRetrievedAt.value)}`
    : `Updated ${formatDateTime(listingsLastRetrievedAt.value)} • Next ${formatRelativeDateTime(listingsLastRetrievedAt.value, nextEligibleAt)}`;
});

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function parseIntegerInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.trunc(parsed));
}

function parsePriceInputToCopper(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.round(parsed * 1000));
}

const activeFilters = computed<MarketListingsFilters>(() => ({
  q: normalizeText(keywordQuery.value) || undefined,
  itemName: normalizeText(itemNameQuery.value) || undefined,
  sellerName: normalizeText(sellerNameQuery.value) || undefined,
  itemType: parseIntegerInput(itemTypeValue.value) ?? undefined,
  equipSlot: parseIntegerInput(equipSlotValue.value) ?? undefined,
  minPrice: parsePriceInputToCopper(minPricePp.value) ?? undefined,
  maxPrice: parsePriceInputToCopper(maxPricePp.value) ?? undefined,
  minCharges: parseIntegerInput(minCharges.value) ?? undefined,
  maxCharges: parseIntegerInput(maxCharges.value) ?? undefined,
  listedWithinDays: parseIntegerInput(listedWithinDays.value) ?? undefined,
  dealsOnly: dealsOnly.value || undefined
}));

const validationMessage = computed(() => {
  if (
    activeFilters.value.minPrice != null &&
    activeFilters.value.maxPrice != null &&
    activeFilters.value.minPrice > activeFilters.value.maxPrice
  ) {
    return 'Minimum price must be less than or equal to maximum price.';
  }

  if (
    activeFilters.value.minCharges != null &&
    activeFilters.value.maxCharges != null &&
    activeFilters.value.minCharges > activeFilters.value.maxCharges
  ) {
    return 'Minimum charges must be less than or equal to maximum charges.';
  }

  return null;
});

const activeFilterChips = computed(() => {
  const chips: Array<{ key: string; label: string }> = [];

  if (activeFilters.value.q) {
    chips.push({ key: 'q', label: `Search: ${activeFilters.value.q}` });
  }
  if (activeFilters.value.itemName) {
    chips.push({ key: 'itemName', label: `Item: ${activeFilters.value.itemName}` });
  }
  if (activeFilters.value.sellerName) {
    chips.push({ key: 'sellerName', label: `Seller: ${activeFilters.value.sellerName}` });
  }
  if (activeFilters.value.itemType != null) {
    chips.push({
      key: 'itemType',
      label: `Type: ${getItemTypeLabel(activeFilters.value.itemType)}`
    });
  }
  if (activeFilters.value.equipSlot != null) {
    chips.push({
      key: 'equipSlot',
      label: `Equip Slot: ${getEquipSlotLabel(activeFilters.value.equipSlot)}`
    });
  }
  if (activeFilters.value.minPrice != null) {
    chips.push({
      key: 'minPrice',
      label: `Min Price: ${formatPlatinum(activeFilters.value.minPrice)}`
    });
  }
  if (activeFilters.value.maxPrice != null) {
    chips.push({
      key: 'maxPrice',
      label: `Max Price: ${formatPlatinum(activeFilters.value.maxPrice)}`
    });
  }
  if (activeFilters.value.minCharges != null) {
    chips.push({
      key: 'minCharges',
      label: `Min Charges: ${formatNumber(activeFilters.value.minCharges)}`
    });
  }
  if (activeFilters.value.maxCharges != null) {
    chips.push({
      key: 'maxCharges',
      label: `Max Charges: ${formatNumber(activeFilters.value.maxCharges)}`
    });
  }
  if (activeFilters.value.listedWithinDays != null) {
    chips.push({
      key: 'listedWithinDays',
      label: `Listed: ${activeFilters.value.listedWithinDays}d`
    });
  }
  if (activeFilters.value.dealsOnly) {
    chips.push({
      key: 'dealsOnly',
      label: 'See Deals'
    });
  }

  return chips;
});

const hasActiveFilters = computed(() => activeFilterChips.value.length > 0);
const advancedFilterCount = computed(
  () =>
    [
      activeFilters.value.itemName,
      activeFilters.value.sellerName,
      activeFilters.value.itemType,
      activeFilters.value.equipSlot,
      activeFilters.value.minPrice,
      activeFilters.value.maxPrice,
      activeFilters.value.minCharges,
      activeFilters.value.maxCharges
    ].filter((value) => value != null && value !== '').length
);
const hasAdvancedFilters = computed(() => advancedFilterCount.value > 0);

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatOptionalNumber(value: number | null) {
  return value == null ? '—' : formatNumber(value);
}

function getItemTypeLabel(value: number) {
  return itemTypeOptions.find((option) => option.value === value)?.label ?? `Type ${value}`;
}

function getEquipSlotLabel(value: number) {
  return itemSlotOptions.find((option) => option.slotId === value)?.label ?? `Slot ${value}`;
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

function formatCooldownClock(totalMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(value: string | null) {
  if (!value) return 'No listings';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value)
  );
}

function formatDateTime(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function formatRelativeDateTime(referenceValue: string | null, value: string | null) {
  if (!value) return 'n/a';

  const target = new Date(value);
  if (!referenceValue) {
    return formatDateTime(value);
  }

  const reference = new Date(referenceValue);
  const sameDay =
    target.getFullYear() === reference.getFullYear() &&
    target.getMonth() === reference.getMonth() &&
    target.getDate() === reference.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(target);
  }

  return formatDateTime(value);
}

function formatSlot(slotId: number) {
  const resolved = resolveSlotPlacement(slotId);
  if (resolved.area !== 'worn') {
    return 'General';
  }

  if (slotId === 1 || slotId === 4) {
    return 'Ear';
  }

  if (slotId === 9 || slotId === 10) {
    return 'Wrist';
  }

  if (slotId === 15 || slotId === 16) {
    return 'Finger';
  }

  return slotDisplayLabel(resolved);
}

function getListingAnalysisDirection(
  price: number,
  averagePrice: number | null | undefined
): 'up' | 'down' | 'flat' {
  if (averagePrice == null || averagePrice <= 0) {
    return 'flat';
  }

  if (price > averagePrice) {
    return 'up';
  }

  if (price < averagePrice) {
    return 'down';
  }

  return 'flat';
}

function getListingAnalysisArrow(price: number, averagePrice: number | null | undefined) {
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

function getListingAnalysisPercent(price: number, averagePrice: number | null | undefined) {
  if (averagePrice == null || averagePrice <= 0) {
    return null;
  }

  const deltaPercent = ((price - averagePrice) / averagePrice) * 100;
  if (Math.abs(deltaPercent) < 0.05) {
    return '0%';
  }

  return `${deltaPercent > 0 ? '+' : '-'}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(Math.abs(deltaPercent))}%`;
}

function getListingAnalysisClass(price: number, averagePrice: number | null | undefined) {
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') return 'listing-analysis--up';
  if (direction === 'down') return 'listing-analysis--down';
  return 'listing-analysis--flat';
}

function getListingAnalysisTitle(price: number, averagePrice: number | null | undefined) {
  if (averagePrice == null || averagePrice <= 0) {
    return 'No average sale price is established yet for this item.';
  }

  const percent = getListingAnalysisPercent(price, averagePrice) ?? '0%';
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') {
    return `Listed ${percent} above the average sale price.`;
  }

  if (direction === 'down') {
    return `Listed ${percent} below the average sale price.`;
  }

  return 'Listed at the average sale price.';
}

function getDefaultSortOrder(field: MarketListingsSortField): 'asc' | 'desc' {
  switch (field) {
    case 'itemName':
    case 'sellerName':
    case 'slotId':
    case 'analysis':
      return 'asc';
    case 'listedAt':
    case 'price':
    case 'charges':
    default:
      return 'desc';
  }
}

function toggleSort(field: MarketListingsSortField) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortBy.value = field;
  sortOrder.value = getDefaultSortOrder(field);
}

function getSortIndicator(field: MarketListingsSortField) {
  if (sortBy.value !== field) {
    return '↕';
  }

  return sortOrder.value === 'asc' ? '↑' : '↓';
}

function getColumnAriaSort(field: MarketListingsSortField) {
  if (sortBy.value !== field) {
    return 'none';
  }

  return sortOrder.value === 'asc' ? 'ascending' : 'descending';
}

function buildListingKey(listing: MarketListing) {
  return `${listing.sellerCharacterId}-${listing.itemId}-${listing.slotId}-${listing.listedAt ?? 'na'}`;
}

function scheduleListingsReload(delayMs = 220) {
  if (filterTimeout) {
    clearTimeout(filterTimeout);
  }

  if (!props.active || !hasLoaded.value || validationMessage.value) {
    return;
  }

  filterTimeout = setTimeout(() => {
    void loadListings(false);
  }, delayMs);
}

async function loadListings(refreshIfStale = false) {
  if (validationMessage.value) {
    listingsPage.value = {
      listings: [],
      summary: {
        totalListings: 0,
        distinctSellers: 0,
        distinctItems: 0,
        newestListingAt: null
      },
      page: currentPage.value,
      pageSize: LISTINGS_PAGE_SIZE,
      total: 0,
      totalPages: 1,
      sourceAvailable: true,
      message: null,
      syncStatus: listingsPage.value?.syncStatus ?? { lastRetrievedAt: null }
    };
    hasLoaded.value = true;
    return;
  }

  const token = ++activeRequestToken;
  loading.value = true;

  try {
    const page = await api.fetchMarketListingsPage({
      ...activeFilters.value,
      page: currentPage.value,
      pageSize: LISTINGS_PAGE_SIZE,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      refreshIfStale
    });

    if (token !== activeRequestToken) {
      return;
    }

    listingsPage.value = page;
    emit('sync-status-change', page.syncStatus.lastRetrievedAt);
    hasLoaded.value = true;
  } catch (error) {
    if (token !== activeRequestToken) {
      return;
    }

    console.error('Failed to load market listings.', error);
    listingsPage.value = {
      listings: [],
      summary: {
        totalListings: 0,
        distinctSellers: 0,
        distinctItems: 0,
        newestListingAt: null
      },
      page: currentPage.value,
      pageSize: LISTINGS_PAGE_SIZE,
      total: 0,
      totalPages: 1,
      sourceAvailable: false,
      message: unavailableMessage,
      syncStatus: listingsPage.value?.syncStatus ?? { lastRetrievedAt: null }
    };
    hasLoaded.value = true;
  } finally {
    if (token === activeRequestToken) {
      loading.value = false;
    }
  }
}

function refreshListings() {
  void loadListings(false);
}

function resetFilters() {
  keywordQuery.value = '';
  itemNameQuery.value = '';
  sellerNameQuery.value = '';
  itemTypeValue.value = '';
  equipSlotValue.value = '';
  minPricePp.value = '';
  maxPricePp.value = '';
  minCharges.value = '';
  maxCharges.value = '';
  listedWithinDays.value = '';
  dealsOnly.value = false;
  currentPage.value = 1;
  advancedFiltersOpen.value = false;
}

function clearFilter(key: string) {
  switch (key) {
    case 'q':
      keywordQuery.value = '';
      break;
    case 'itemName':
      itemNameQuery.value = '';
      break;
    case 'sellerName':
      sellerNameQuery.value = '';
      break;
    case 'itemType':
      itemTypeValue.value = '';
      break;
    case 'equipSlot':
      equipSlotValue.value = '';
      break;
    case 'minPrice':
      minPricePp.value = '';
      break;
    case 'maxPrice':
      maxPricePp.value = '';
      break;
    case 'minCharges':
      minCharges.value = '';
      break;
    case 'maxCharges':
      maxCharges.value = '';
      break;
    case 'listedWithinDays':
      listedWithinDays.value = '';
      break;
    case 'dealsOnly':
      dealsOnly.value = false;
      break;
    default:
      break;
  }
}

function changePage(page: number) {
  if (loading.value || page === currentPage.value) {
    return;
  }

  currentPage.value = page;
  void loadListings(false);
}

function showListingTooltip(event: MouseEvent, listing: MarketListing) {
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

function startCooldownTicker() {
  if (cooldownInterval) {
    return;
  }

  cooldownInterval = setInterval(() => {
    currentTimeMs.value = Date.now();
  }, 1000);
}

function stopCooldownTicker() {
  if (!cooldownInterval) {
    return;
  }

  clearInterval(cooldownInterval);
  cooldownInterval = null;
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      void loadListings(true);
    }
  },
  { immediate: true }
);

watch([sortBy, sortOrder], () => {
  if (!props.active || !hasLoaded.value) {
    return;
  }

  currentPage.value = 1;
  scheduleListingsReload(0);
});

watch(
  [
    keywordQuery,
    itemNameQuery,
    sellerNameQuery,
    itemTypeValue,
    equipSlotValue,
    minPricePp,
    maxPricePp,
    minCharges,
    maxCharges,
    listedWithinDays,
    dealsOnly
  ],
  () => {
    currentPage.value = 1;
    scheduleListingsReload();
  }
);

onMounted(() => {
  startCooldownTicker();
});

onBeforeUnmount(() => {
  if (filterTimeout) clearTimeout(filterTimeout);
  stopCooldownTicker();
  tooltipStore.hideTooltipImmediate();
});
</script>

<style scoped>
.listings-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.listings-tab__header,
.panel,
.card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.26);
}

.listings-cooldown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.54);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.listings-cooldown--ready {
  border-color: rgba(52, 211, 153, 0.18);
  background: rgba(9, 27, 23, 0.45);
}

.listings-cooldown__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
  align-items: baseline;
}

.listings-cooldown__label {
  font-size: 0.73rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}

.listings-cooldown__value {
  font-size: 0.95rem;
  font-weight: 700;
  color: #e2e8f0;
}

.listings-cooldown--ready .listings-cooldown__value {
  color: #bbf7d0;
}

.listings-cooldown__meta {
  font-size: 0.84rem;
}

.listings-cooldown__bar {
  position: relative;
  height: 0.3rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(51, 65, 85, 0.55);
}

.listings-cooldown__bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: rgba(125, 211, 252, 0.6);
  transition: width 1s linear, background 0.2s ease;
}

.listings-cooldown--ready .listings-cooldown__bar-fill {
  background: rgba(110, 231, 183, 0.7);
}

.listings-tab__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  border-radius: 1.2rem;
}

.listings-tab__header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.listings-tab__copy {
  margin: 0.55rem 0 0;
  max-width: 42rem;
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

.filters {
  margin-top: 1rem;
}

.filters-shell {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 38%),
    rgba(2, 6, 23, 0.5);
}

.filters-shell__top {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(18rem, 1fr);
  gap: 1rem;
  align-items: end;
}

.filters-shell__actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: end;
}

.filters-shell__row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.filter-search,
.filter-select,
.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.filter-search__input {
  min-height: 3.25rem;
  font-size: 1rem;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
}

.filter-group__label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.choice-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.choice-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.45rem;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.62);
  color: #cbd5e1;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.12s ease;
}

.choice-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(56, 189, 248, 0.35);
  color: #f8fafc;
}

.choice-pill--active {
  border-color: rgba(56, 189, 248, 0.38);
  background: rgba(14, 116, 144, 0.22);
  color: #bae6fd;
}

.choice-pill--deal {
  gap: 0.45rem;
}

.choice-pill--deal-active {
  border-color: rgba(52, 211, 153, 0.34);
  background: rgba(6, 95, 70, 0.3);
  color: #bbf7d0;
}

.deal-toggle__icon {
  color: #34d399;
  font-size: 1rem;
  line-height: 1;
}

.filters-toggle {
  min-height: 3rem;
}

.filters-toggle--active {
  border-color: rgba(56, 189, 248, 0.35);
  background: rgba(14, 116, 144, 0.18);
}

.filters-toggle__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.2);
  color: #fde68a;
  font-size: 0.76rem;
  font-weight: 700;
}

.filters-drawer {
  padding-top: 0.2rem;
}

.filters-drawer__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.range-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.9rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.46);
}

.range-card__inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.filter-field__label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.filter-chip,
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  border: 1px solid rgba(245, 158, 11, 0.26);
  color: #fde68a;
  font-size: 0.84rem;
  font-weight: 600;
}

.filter-chip {
  cursor: pointer;
  font: inherit;
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.22);
  color: #bae6fd;
}

.filter-chip__remove {
  color: #e2e8f0;
  font-size: 0.78rem;
  opacity: 0.85;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border-radius: 1rem;
}

.card strong {
  font-size: 1.45rem;
  line-height: 1.1;
}

.card small,
.label,
.muted {
  color: #94a3b8;
}

.card--accent .label,
.eyebrow {
  color: #fbbf24;
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
}

.eyebrow {
  margin: 0 0 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
}

.status-banner {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  font-size: 0.94rem;
}

.status-banner--warning {
  background: rgba(120, 53, 15, 0.24);
  border-color: rgba(251, 191, 36, 0.26);
  color: #fde68a;
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

.btn:disabled {
  cursor: default;
  opacity: 0.7;
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

.table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}

.listings-table {
  width: 100%;
  min-width: 58rem;
  border-collapse: collapse;
}

.listings-table th,
.listings-table td {
  padding: 0.8rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
  white-space: nowrap;
}

.listings-table th {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.table-sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.table-sort:hover {
  color: #e2e8f0;
}

.table-sort--active {
  color: #f8fafc;
}

.table-sort__icon {
  min-width: 0.8rem;
  color: #7dd3fc;
  font-size: 0.88rem;
  line-height: 1;
}

.listing-analysis {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  white-space: nowrap;
}

.listing-analysis__arrow {
  font-size: 1rem;
  line-height: 1;
}

.listing-analysis__percent {
  font-size: 0.88rem;
}

.listing-analysis--up {
  color: #f87171;
}

.listing-analysis--down {
  color: #34d399;
}

.listing-analysis--flat {
  color: #94a3b8;
}

.listings-table tbody tr:hover {
  background: rgba(30, 41, 59, 0.34);
}

.table-item,
.character-history-link {
  color: inherit;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
}

.table-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 14rem;
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

.table-item__text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.character-history-link {
  cursor: pointer;
  color: #7dd3fc;
  text-decoration: underline;
  text-decoration-color: rgba(125, 211, 252, 0.45);
  text-underline-offset: 0.14em;
}

.character-history-link:hover {
  color: #bae6fd;
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

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 9rem;
  margin-top: 1rem;
}

@media (max-width: 1280px) {
  .filters-shell__top {
    grid-template-columns: 1fr;
  }

  .filters-shell__actions {
    grid-template-columns: 1fr auto;
  }

  .filters-drawer__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .stats {
    grid-template-columns: 1fr;
  }

  .filters-shell__actions,
  .range-card__inputs {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .listings-tab__header,
  .panel {
    padding: 1rem;
  }

  .listings-cooldown {
    padding: 0.75rem 0.9rem;
  }

  .listings-cooldown__row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .listings-tab__header,
  .listings-tab__header-actions,
  .pagination {
    flex-direction: column;
    align-items: stretch;
  }

  .pagination__meta {
    order: -1;
  }

  .filters-shell {
    padding: 0.9rem;
  }

  .filters-shell__row,
  .filter-group {
    align-items: stretch;
  }
}
</style>
