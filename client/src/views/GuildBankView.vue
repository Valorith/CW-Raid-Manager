<template>
  <section class="guild-bank">
    <header class="guild-bank__hero">
      <div class="guild-bank__breadcrumb">
        <RouterLink :to="{ name: 'GuildDetail', params: { guildId } }">← Back to Guild</RouterLink>
        <span class="guild-bank__badge">Guild Bank</span>
      </div>
      <div class="guild-bank__headline">
        <div>
          <p class="eyebrow">Collective holdings</p>
          <h1>{{ guildName || 'Guild Bank' }}</h1>
          <p class="muted">
            Track every item stored on your designated bank characters. Searches span worn gear,
            personal bags, cursor stacks, and full bank inventories.
          </p>
        </div>
        <div class="guild-bank__hero-actions">
          <div class="refresh-indicator">
            <span class="refresh-indicator__label">Last sync</span>
            <strong>{{ lastRefreshLabel }}</strong>
            <span class="refresh-indicator__sub">
              Next refresh {{ refreshCountdownLabel }}
            </span>
          </div>
          <button
            class="icon-button icon-button--refresh"
            :disabled="loadingSnapshot || !canRefreshNow"
            @click="refreshSnapshot()"
            :aria-label="loadingSnapshot ? 'Refreshing guild bank' : 'Refresh guild bank'"
            title="Refresh from database"
          >
            <span v-if="loadingSnapshot" class="spinner" aria-hidden="true"></span>
            <span v-else class="refresh-icon" aria-hidden="true">⟳</span>
          </button>
          <button
            class="icon-button icon-button--cart-main"
            type="button"
            :aria-label="'Open cart (' + cartCount + ' items)'"
            @click="toggleCart"
            title="View shopping cart"
          >
            🛒
            <span v-if="cartCount" class="cart-badge">{{ cartCount }}</span>
          </button>
        </div>
      </div>
      <div class="guild-bank__stat-row">
        <div class="stat-chip">
          <span class="stat-chip__label">Tracked characters</span>
          <div class="stat-chip__value">{{ snapshot?.characters.length ?? 0 }}</div>
        </div>
        <div class="stat-chip">
          <span class="stat-chip__label">Unique items</span>
          <div class="stat-chip__value">{{ groupedItems.length }}</div>
          <span class="stat-chip__hint">{{ totalItemCount }} total pieces</span>
        </div>
        <div class="stat-chip stat-chip--muted">
          <span class="stat-chip__label">Missing in EQ DB</span>
          <div class="stat-chip__value">{{ missingCount }}</div>
          <span class="stat-chip__hint">Update names if spelling changed</span>
        </div>
      </div>
    </header>

    <div class="guild-bank__body">
      <aside class="guild-bank__panel">
        <header class="panel__header">
          <div>
            <p class="eyebrow">Bank characters</p>
            <h2>Roster</h2>
          </div>
          <span v-if="!canManageBank" class="muted small">View only</span>
        </header>
        <p class="muted small">
          Leaders and officers can add the character names that hold guild items. We never store
          inventory data—only this roster.
        </p>
        <div
          v-if="missingCachedNames.length && canManageBank"
          class="alert alert--warning"
        >
          <p class="alert__title">We detected missing bank characters</p>
          <p class="alert__body">
            {{ missingCachedNames.length }} name{{ missingCachedNames.length === 1 ? '' : 's' }} were in your local backup but are not on the server.
          </p>
          <button
            class="btn btn--secondary"
            type="button"
            :disabled="restoringNames"
            @click="restoreMissingCachedCharacters"
          >
            {{ restoringNames ? 'Restoring…' : 'Restore from backup' }}
          </button>
        </div>

        <form v-if="canManageBank" class="add-bank-character" @submit.prevent="addCharacter">
          <input
            v-model="newCharacterName"
            type="text"
            class="input"
            name="character"
            placeholder="e.g. Copperkeep"
            :disabled="addingCharacter"
          />
          <button class="btn btn--secondary" type="submit" :disabled="addingCharacter || !newCharacterName.trim().length">
            {{ addingCharacter ? 'Adding…' : 'Add character' }}
          </button>
        </form>

        <ul class="bank-character-list">
          <li
            v-for="character in snapshot?.characters ?? []"
            :key="character.id"
            class="bank-character"
          >
            <label class="bank-character__meta" @click="toggleCharacterSelection(character.name)">
              <input
                type="checkbox"
                :checked="isCharacterSelected(character.name)"
                @click.stop
                class="bank-character__checkbox"
              />
              <strong>{{ character.name }}</strong>
              <span
                :class="[
                  'bank-character__status',
                  character.foundInEq ? 'bank-character__status--ok' : 'bank-character__status--warn'
                ]"
              >
                {{ character.foundInEq ? 'Found in EQ' : 'Not found' }}
              </span>
            </label>
            <button
              v-if="canManageBank"
              class="icon-button"
              :disabled="removingId === character.id"
              @click="removeCharacter(character.id)"
              :aria-label="`Remove ${character.name}`"
            >
              <span class="icon-button__glyph" aria-hidden="true">🗑️</span>
            </button>
          </li>
        </ul>

        <div v-if="missingCount > 0" class="alert alert--warning">
          <p class="alert__title">Missing characters</p>
          <p class="alert__body">
            {{ missingCount }} tracked character{{ missingCount === 1 ? '' : 's' }} were not found
            in the EQ database. Double-check spelling or recent renames.
          </p>
        </div>
      </aside>

      <main class="guild-bank__main">
        <div class="guild-bank__filters">
          <div class="search-field search-field--hero">
            <span class="search-field__icon" aria-hidden="true">🔎</span>
            <input
              v-model="searchQuery"
              type="search"
              class="input input--search input--hero"
              placeholder="Search every bank item by name or holder"
            />
            <button
              class="search-field__clear"
              type="button"
              v-if="searchQuery.trim().length"
              @click="searchQuery = ''"
              aria-label="Clear search"
            >
              ×
            </button>
          </div>
        </div>

        <div v-if="snapshotError" class="alert alert--danger">
          <p class="alert__title">Unable to load guild bank</p>
          <p class="alert__body">{{ snapshotError }}</p>
        </div>

        <div v-else-if="loadingSnapshot && groupedItems.length === 0" class="guild-bank__empty">
          <div class="skeleton skeleton--headline"></div>
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </div>

        <div v-else-if="groupedItems.length === 0" class="guild-bank__empty">
          <p class="muted">No items discovered yet.</p>
          <p class="muted small">Add bank characters and refresh to pull inventories from EQ.</p>
        </div>

        <div v-if="totalPages > 1" class="guild-bank__pagination guild-bank__pagination--top">
          <button class="pagination__button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">
            Previous
          </button>
          <span class="pagination__label">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button class="pagination__button" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)">
            Next
          </button>
        </div>

        <ul class="guild-bank__list guild-bank__list--grid">
          <li v-for="item in pagedItems" :key="item.key" class="guild-bank-item">
            <div class="guild-bank-item__header">
              <div class="guild-bank-item__icon" :class="{ 'guild-bank-item__icon--placeholder': !item.itemIconId }">
                <img
                  v-if="item.itemIconId"
                  :src="getLootIconSrc(item.itemIconId)"
                  :alt="`${item.itemName} icon`"
                  loading="lazy"
                />
                <span v-else>?</span>
              </div>
              <strong class="guild-bank-item__name">{{ item.itemName }}</strong>
            </div>
            <div class="guild-bank-item__details">
              <div class="guild-bank-item__meta">
                <span class="pill pill--quantity">×{{ item.totalQuantity }}</span>
                <span
                  v-for="loc in item.locations"
                  :key="`${item.key}-${loc}`"
                  class="pill pill--location"
                >
                  {{ loc }}
                </span>
                <a
                  v-if="item.itemId"
                  class="pill pill--link pill--link-button"
                  :href="`https://alla.clumsysworld.com/?a=item&id=${item.itemId}`"
                  target="_blank"
                  rel="noreferrer"
                  title="View on Alla"
                >
                  <span aria-hidden="true">🔗</span>
                  <span>Alla</span>
                </a>
                <button
                  class="icon-button icon-button--cart-floating"
                  type="button"
                  :aria-label="`Add ${item.itemName} to cart`"
                  title="Add to cart"
                  @click.stop="cartHasItem(item.key) ? removeCartItem(item.key) : openRequestModal(item)"
                  :class="{ 'icon-button--cart-floating--active': cartHasItem(item.key) }"
                >
                  <span class="cart-floating__icon">🛒</span>
                  <span v-if="cartHasItem(item.key)" class="cart-floating__icon cart-floating__icon--hover">🗑️</span>
                </button>
              </div>
              <div class="guild-bank-item__owners">
                <span
                  v-for="owner in visibleOwners(item)"
                  :key="`${owner.characterName}-${owner.locationLabel}`"
                  class="owner-chip owner-chip--inline owner-chip--truncate"
                >
                  {{ owner.characterName }} ({{ owner.locationLabel }}) · ×{{ owner.totalQuantity }}
                </span>
                <button
                  v-if="ownerOverflow(item)"
                  type="button"
                  class="owner-more-button"
                  @click="openOwnerModal(item)"
                  :title="`${ownerOverflowCount(item)} more source${ownerOverflowCount(item) === 1 ? '' : 's'}`"
                >
                  +
                </button>
              </div>
            </div>
          </li>
        </ul>
        <div v-if="totalPages > 1" class="guild-bank__pagination">
          <button class="pagination__button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">
            Previous
          </button>
          <span class="pagination__label">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button class="pagination__button" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)">
            Next
          </button>
        </div>
      </main>
    </div>

    <div v-if="ownerModal.open && ownerModal.item" class="modal-backdrop" @click.self="closeOwnerModal">
      <div class="modal owner-modal">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Item holders</p>
            <h3>{{ ownerModal.item.itemName }}</h3>
          </div>
          <button type="button" class="icon-button" @click="closeOwnerModal" aria-label="Close">
            <span class="icon-button__glyph">×</span>
          </button>
        </header>
        <div class="owner-modal__body">
          <ul class="owner-modal__list">
            <li v-for="owner in ownerModal.item.ownerSummaries" :key="`${owner.characterName}-${owner.locationLabel}`">
              <span class="owner-chip owner-chip--inline">
                {{ owner.characterName }} ({{ owner.locationLabel }}) · ×{{ owner.totalQuantity }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      v-if="showRequestModal && requestModalItem"
      class="modal-backdrop"
      @click.self="closeRequestModal"
    >
      <div class="modal request-modal" :key="requestModalItem?.itemKey">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Add to Cart</p>
            <h3>{{ requestModalItem.itemName }}</h3>
          </div>
          <button class="icon-button" type="button" @click="closeRequestModal" aria-label="Close">
            ×
          </button>
        </header>
        <div class="request-modal__body">
          <div class="request-modal__quantity">
            <label>Quantity (max {{ requestModalItem.maxQuantity }})</label>
            <input
              v-model.number="requestQuantity"
              type="number"
              min="1"
              :max="requestModalItem.maxQuantity"
              class="input"
            />
            <input
              v-model.number="requestQuantity"
              type="range"
              min="1"
              :max="requestModalItem.maxQuantity"
              step="1"
            />
          </div>
          <div class="request-modal__sources">
            <p class="muted small">Available from:</p>
            <ul>
              <li v-for="src in requestModalItem.sources" :key="`${src.characterName}-${src.location}`">
                {{ src.characterName }} ({{ src.location }}) · ×{{ src.quantity }}
              </li>
            </ul>
          </div>
          <p v-if="requestQuantity > requestModalItem.maxQuantity" class="status status--error">
            Quantity cannot exceed available.
          </p>
        </div>
        <footer class="modal__footer">
          <button class="btn btn--secondary" type="button" @click="closeRequestModal">Cancel</button>
          <button
            class="btn"
            type="button"
            :disabled="requestQuantity < 1 || requestQuantity > requestModalItem.maxQuantity"
            @click="handleRequestModalConfirm"
          >
            Add to Cart
          </button>
        </footer>
      </div>
    </div>

    <div v-if="showCart" class="cart-overlay" @click.self="toggleCart">
      <div class="cart-panel">
        <header class="cart-panel__header">
          <h3>Shopping Cart</h3>
          <button class="icon-button" type="button" @click="toggleCart" aria-label="Close cart">×</button>
        </header>
        <p v-if="cartDistinct === 0" class="muted small">Your cart is empty.</p>
        <ul v-else class="cart-list">
          <li v-for="entry in aggregatedCartSources" :key="entry.itemKey" class="cart-item">
            <div class="cart-item__info">
              <div class="guild-bank-item__icon" :class="{ 'guild-bank-item__icon--placeholder': !entry.itemIconId }">
                <img
                  v-if="entry.itemIconId"
                  :src="getLootIconSrc(entry.itemIconId)"
                  :alt="`${entry.itemName} icon`"
                  loading="lazy"
                />
                <span v-else>?</span>
              </div>
              <div>
                <strong>{{ entry.itemName }}</strong>
                <p class="muted small">Requested: ×{{ entry.quantity }} (max {{ entry.maxQuantity }})</p>
                <ul class="cart-item__sources">
                  <li
                    v-for="src in displaySources(entry)"
                    :key="`${entry.itemKey}-${src.characterName}-${src.location}`"
                  >
                    {{ src.characterName }} ({{ src.location }}) · ×{{ src.quantity }}
                  </li>
                </ul>
              </div>
            </div>
            <div class="cart-item__actions">
              <input
                :value="entry.quantity"
                type="number"
                min="1"
                :max="entry.maxQuantity"
                @input="(e) => updateCartEntry({ ...entry, quantity: clampQuantity(Number((e.target as HTMLInputElement).value), entry.maxQuantity) })"
              />
              <button class="icon-button icon-button--danger" type="button" @click="removeCartItem(entry.itemKey)" aria-label="Remove item">
                🗑️
              </button>
            </div>
          </li>
        </ul>
        <footer class="cart-panel__footer">
          <div class="cart-summary">
            <span>{{ cartDistinct }} item{{ cartDistinct === 1 ? '' : 's' }} ({{ cartCount }} total)</span>
          </div>
          <div class="cart-actions">
            <button class="btn btn--secondary" type="button" @click="resetCart" :disabled="cartDistinct === 0">
              Clear Cart
            </button>
            <button class="btn" type="button" :disabled="cartDistinct === 0 || submittingCart" @click="submitCart">
              {{ submittingCart ? 'Requesting…' : 'Request All Items' }}
            </button>
          </div>
          <p v-if="cartError" class="status status--error">{{ cartError }}</p>
          <p v-if="cartSuccess" class="status status--success">{{ cartSuccess }}</p>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { api, type GuildBankSnapshot, type GuildBankItem } from '../services/api';
import type { GuildRole } from '../services/types';
import { getLootIconSrc } from '../utils/itemIcons';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const route = useRoute();
const router = useRouter();

const guildId = computed(() => route.params.guildId as string);

const guildName = ref<string>('');
const guildRole = ref<GuildRole | null>(null);

const snapshot = ref<GuildBankSnapshot | null>(null);
const loadingSnapshot = ref(false);
const snapshotError = ref<string | null>(null);
const lastFetchedAt = ref<number | null>(null);

const newCharacterName = ref('');
const addingCharacter = ref(false);
const removingId = ref<string | null>(null);
const restoringNames = ref(false);
const cachedNames = ref<string[]>([]);

const searchQuery = ref('');
const selectedCharacters = ref<Set<string>>(new Set());

const now = ref(Date.now());
let timer: number | null = null;

const canManageBank = computed(() =>
  guildRole.value ? ['LEADER', 'OFFICER'].includes(guildRole.value) : false
);

const cacheKey = computed(() => `guild-bank:${guildId.value}`);
const cacheNamesKey = computed(() => `guild-bank:names:${guildId.value}:v1`);
const autoRestoreAttempted = ref(false);

function isCharacterSelected(name: string): boolean {
  const key = name.toLowerCase();
  return selectedCharacters.value.size === 0 || selectedCharacters.value.has(key);
}

function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey.value);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { snapshot: GuildBankSnapshot; fetchedAt: number };
    if (!parsed || !parsed.snapshot || !parsed.fetchedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(currentSnapshot: GuildBankSnapshot) {
  try {
    localStorage.setItem(
      cacheKey.value,
      JSON.stringify({ snapshot: currentSnapshot, fetchedAt: Date.now() })
    );
  } catch {
    // ignore cache errors
  }
}

function loadCachedNames() {
  try {
    const raw = localStorage.getItem(cacheNamesKey.value);
    if (!raw) {
      cachedNames.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    cachedNames.value = Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry === 'string')
      : [];
  } catch {
    cachedNames.value = [];
  }
}

function saveCachedNames(names: string[]) {
  cachedNames.value = [...names];
  try {
    localStorage.setItem(cacheNamesKey.value, JSON.stringify(names));
  } catch {
    // ignore cache errors
  }
}

function mergeNamesCaseInsensitive(names: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  return merged;
}

function diffNamesCaseInsensitive(full: string[], subset: string[]): string[] {
  const subsetKeys = new Set(subset.map((name) => name.toLowerCase()));
  return full.filter((name) => !subsetKeys.has(name.toLowerCase()));
}

const canRefreshNow = computed(() => {
  if (!lastFetchedAt.value) {
    return true;
  }
  return now.value - lastFetchedAt.value >= FIVE_MINUTES_MS;
});

const refreshCountdownMs = computed(() => {
  if (!lastFetchedAt.value) {
    return 0;
  }
  return Math.max(0, FIVE_MINUTES_MS - (now.value - lastFetchedAt.value));
});

const refreshCountdownLabel = computed(() => {
  if (canRefreshNow.value) {
    return 'available now';
  }
  const minutes = Math.floor(refreshCountdownMs.value / 60000);
  const seconds = Math.floor((refreshCountdownMs.value % 60000) / 1000);
  if (minutes > 0) {
    return `in ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `in ${seconds}s`;
});

const lastRefreshLabel = computed(() => {
  if (!lastFetchedAt.value) {
    return 'Never';
  }
  const diff = now.value - lastFetchedAt.value;
  if (diff < 60_000) {
    return 'Just now';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
});

const missingCount = computed(() => snapshot.value?.missingCharacters.length ?? 0);

function buildItemKey(itemId: number | null | undefined, itemName: string): string {
  return itemId != null ? `id:${itemId}` : `name:${itemName.toLowerCase()}`;
}

function aggregateItems(items: GuildBankItem[]) {
  const map = new Map<
    string,
    {
      key: string;
      itemId: number | null;
      itemName: string;
      itemIconId: number | null;
      totalQuantity: number;
      owners: Array<{ characterName: string; quantity: number; location: GuildBankItem['location']; locationLabel: string }>;
      ownerSummaries: Map<string, { characterName: string; locationLabel: string; totalQuantity: number }>;
      locationSet: Set<string>;
    }
  >();

  for (const entry of items) {
    const quantity = entry.charges && entry.charges > 0 ? entry.charges : 1;
    const key = buildItemKey(entry.itemId ?? null, entry.itemName);
    const existing = map.get(key);
    const locationLabel =
      entry.location === 'WORN'
        ? 'Worn'
        : entry.location === 'BANK'
          ? 'Bank'
          : entry.location === 'CURSOR'
            ? 'Cursor'
            : 'Inventory';

    if (!existing) {
      map.set(key, {
        key,
        itemId: entry.itemId ?? null,
        itemName: entry.itemName,
        itemIconId: entry.itemIconId ?? null,
        totalQuantity: quantity,
        owners: [
          {
            characterName: entry.characterName,
            quantity,
            location: entry.location,
            locationLabel
          }
        ],
        ownerSummaries: new Map([
          [
            `${entry.characterName}-${locationLabel}`,
            {
              characterName: entry.characterName,
              locationLabel,
              totalQuantity: quantity
            }
          ]
        ]),
        locationSet: new Set([locationLabel])
      });
    } else {
      existing.totalQuantity += quantity;
      existing.locationSet.add(locationLabel);
      existing.owners.push({
        characterName: entry.characterName,
        quantity,
        location: entry.location,
        locationLabel
      });
      const keyOwner = `${entry.characterName}-${locationLabel}`;
      const summary = existing.ownerSummaries.get(keyOwner);
      if (summary) {
        summary.totalQuantity += quantity;
      } else {
        existing.ownerSummaries.set(keyOwner, {
          characterName: entry.characterName,
          locationLabel,
          totalQuantity: quantity
        });
      }
    }
  }

  return Array.from(map.values())
    .map(({ locationSet, ownerSummaries, ...rest }) => ({
      ...rest,
      locations: Array.from(locationSet),
      ownerSummaries: Array.from(ownerSummaries.values()),
      sources: Array.from(ownerSummaries.values()).map((owner) => ({
        characterName: owner.characterName,
        location: owner.locationLabel,
        quantity: owner.totalQuantity
      }))
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

const groupedItems = computed(() => {
  if (!snapshot.value) {
    return [];
  }

  const allowed =
    selectedCharacters.value.size > 0
      ? selectedCharacters.value
      : new Set(snapshot.value.characters.map((c) => c.name.toLowerCase()));
  const filteredItems = snapshot.value.items.filter((item) =>
    allowed.has(item.characterName.toLowerCase())
  );

  const aggregated = aggregateItems(filteredItems);
  const normalizedQuery = searchQuery.value.trim().toLowerCase();
  if (!normalizedQuery) {
    return aggregated;
  }
  return aggregated.filter(
    (item) =>
      item.itemName.toLowerCase().includes(normalizedQuery) ||
      item.ownerSummaries.some((owner) =>
        owner.characterName.toLowerCase().includes(normalizedQuery)
      )
  );
});

const totalItemCount = computed(() =>
  groupedItems.value.reduce((sum, item) => sum + item.totalQuantity, 0)
);

const currentPage = ref(1);
const pageSize = 18;

const totalPages = computed(() =>
  Math.max(1, Math.ceil(groupedItems.value.length / pageSize))
);

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return groupedItems.value.slice(start, start + pageSize);
});

watch(
  () => groupedItems.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
  }
);

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

const missingCachedNames = computed(() => {
  if (!snapshot.value || cachedNames.value.length === 0) {
    return [];
  }
  const current = new Set(
    snapshot.value.characters.map((entry) => entry.name.toLowerCase())
  );
  return cachedNames.value.filter((name) => !current.has(name.toLowerCase()));
});

async function restoreMissingCachedCharacters() {
  if (!missingCachedNames.value.length || restoringNames.value) {
    return;
  }
  restoringNames.value = true;
  snapshotError.value = null;
  try {
    for (const name of missingCachedNames.value) {
      await api.addGuildBankCharacter(guildId.value, name);
    }
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value =
      error?.response?.data?.message ?? 'Unable to restore missing bank characters.';
  } finally {
    restoringNames.value = false;
  }
}

const OWNER_LIMIT = 2;

function visibleOwners(item: typeof groupedItems.value[number]) {
  return item.ownerSummaries.slice(0, OWNER_LIMIT);
}

function ownerOverflow(item: typeof groupedItems.value[number]) {
  return item.ownerSummaries.length > OWNER_LIMIT;
}

function ownerOverflowCount(item: typeof groupedItems.value[number]) {
  return Math.max(0, item.ownerSummaries.length - OWNER_LIMIT);
}

const ownerModal = ref<{
  item: typeof groupedItems.value[number] | null;
  open: boolean;
}>({
  item: null,
  open: false
});

function openOwnerModal(item: typeof groupedItems.value[number]) {
  ownerModal.value = { item, open: true };
}

function closeOwnerModal() {
  ownerModal.value = { item: null, open: false };
}

// Cart state
type CartEntry = {
  itemKey: string;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  maxQuantity: number;
  sources: Array<{ characterName: string; location: string; quantity: number }>;
  quantity: number;
};

const cart = ref<CartEntry[]>([]);
const showCart = ref(false);
const showRequestModal = ref(false);
const requestModalItem = ref<CartEntry | null>(null);
const requestQuantity = ref(1);

const cartStorageKey = computed(() => `guild-bank-cart:${guildId.value}`);

function loadCart() {
  try {
    const raw = localStorage.getItem(cartStorageKey.value);
    if (!raw) {
      cart.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    cart.value = Array.isArray(parsed)
      ? parsed
          .map((entry: any) => ({
            itemKey: typeof entry?.itemKey === 'string' ? entry.itemKey : '',
            itemId:
              typeof entry?.itemId === 'number'
                ? entry.itemId
                : entry?.itemId == null
                  ? null
                  : null,
            itemName: typeof entry?.itemName === 'string' ? entry.itemName : 'Unknown',
            itemIconId:
              typeof entry?.itemIconId === 'number'
                ? entry.itemIconId
                : entry?.itemIconId == null
                  ? null
                  : null,
            maxQuantity: typeof entry?.maxQuantity === 'number' ? entry.maxQuantity : 1,
            sources: Array.isArray(entry?.sources)
              ? entry.sources
                  .filter(
                    (src: any) =>
                      typeof src?.characterName === 'string' &&
                      typeof src?.location === 'string' &&
                      typeof src?.quantity === 'number'
                  )
                  .map((src: any) => ({
                    characterName: src.characterName,
                    location: src.location,
                    quantity: src.quantity
                  }))
              : [],
            quantity: typeof entry?.quantity === 'number' ? entry.quantity : 1
          }))
          .filter((entry: CartEntry) => entry.itemKey)
      : [];
  } catch {
    cart.value = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey.value, JSON.stringify(cart.value));
  } catch {
    // ignore
  }
}

function resetCart() {
  cart.value = [];
  saveCart();
}

const cartCount = computed(() => cart.value.reduce((sum, entry) => sum + entry.quantity, 0));
const cartDistinct = computed(() => cart.value.length);
const submittingCart = ref(false);
const cartError = ref<string | null>(null);
const cartSuccess = ref<string | null>(null);

function openRequestModal(item: typeof groupedItems.value[number]) {
  const existing = cart.value.find((entry) => entry.itemKey === item.key);
  const maxQuantity = item.totalQuantity;
  requestQuantity.value = Math.min(existing?.quantity ?? 1, maxQuantity);
  const sources =
    (item as any).sources && (item as any).sources.length
      ? (item as any).sources
      : item.ownerSummaries.map((owner) => ({
          characterName: owner.characterName,
          location: owner.locationLabel,
          quantity: owner.totalQuantity
        })) || [];
  requestModalItem.value = {
    itemKey: item.key,
    itemId: item.itemId ?? null,
    itemName: item.itemName,
    itemIconId: item.itemIconId ?? null,
    maxQuantity,
    sources,
    quantity: requestQuantity.value
  };
  showRequestModal.value = true;
}

function closeRequestModal() {
  showRequestModal.value = false;
  requestModalItem.value = null;
  requestQuantity.value = 1;
}

function updateCartEntry(entry: CartEntry) {
  const existingIndex = cart.value.findIndex((e) => e.itemKey === entry.itemKey);
  if (existingIndex >= 0) {
    cart.value.splice(existingIndex, 1, entry);
  } else {
    cart.value.push(entry);
  }
  saveCart();
}

function handleRequestModalConfirm() {
  if (!requestModalItem.value) return;
  const clampedQty = Math.max(
    1,
    Math.min(requestModalItem.value.maxQuantity, requestQuantity.value)
  );
  updateCartEntry({
    ...requestModalItem.value,
    quantity: clampedQty
  });
  closeRequestModal();
}

function removeCartItem(itemKey: string) {
  cart.value = cart.value.filter((entry) => entry.itemKey !== itemKey);
  saveCart();
}

function toggleCart() {
  showCart.value = !showCart.value;
}

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function cartHasItem(itemKey: string) {
  return cart.value.some((entry) => entry.itemKey === itemKey);
}

const aggregatedCartSources = computed(() =>
  cart.value.map((entry) => {
    const sources =
      entry.sources && entry.sources.length
        ? entry.sources
        : [{ characterName: 'Guild Bank', location: 'Bank', quantity: entry.maxQuantity }];
    return {
      ...entry,
      sources
    };
  })
);

function reconcileCartWithSnapshot() {
  if (!snapshot.value) {
    return;
  }
  const aggregated = aggregateItems(snapshot.value.items);
  const lookup = new Map<string, (typeof aggregated)[number]>();
  aggregated.forEach((item) => lookup.set(item.key, item));

  cart.value = cart.value.map((entry) => {
    const latest = lookup.get(entry.itemKey);
    if (!latest) {
      return entry;
    }
    const maxQuantity = latest.totalQuantity;
    const clampedQty = Math.min(entry.quantity, maxQuantity);
    return {
      ...entry,
      maxQuantity,
      quantity: clampedQty,
      sources: latest.sources
    };
  });
  saveCart();
}

function displaySources(entry: CartEntry) {
  const allocated: Array<{ characterName: string; location: string; quantity: number }> = [];
  let remaining = entry.quantity;
  for (const src of entry.sources ?? []) {
    if (remaining <= 0) break;
    const take = Math.min(src.quantity, remaining);
    if (take > 0) {
      allocated.push({ characterName: src.characterName, location: src.location, quantity: take });
      remaining -= take;
    }
  }
  if (remaining > 0 && allocated.length === 0) {
    allocated.push({ characterName: 'Guild Bank', location: 'Bank', quantity: remaining });
  }
  return allocated;
}

watch(requestQuantity, (value) => {
  if (!requestModalItem.value) return;
  if (value > requestModalItem.value.maxQuantity) {
    requestQuantity.value = requestModalItem.value.maxQuantity;
  } else if (value < 1) {
    requestQuantity.value = 1;
  }
});

watch(
  () => requestModalItem.value?.itemKey,
  (key) => {
    if (!key || !requestModalItem.value) return;
    const existing = cart.value.find((entry) => entry.itemKey === key);
    const next = Math.min(existing?.quantity ?? 1, requestModalItem.value.maxQuantity);
    requestQuantity.value = next;
  }
);

watch(
  () => snapshot.value?.characters?.map((c) => c.name).join('|'),
  (names) => {
    if (!names) return;
    syncSelectionWithSnapshot();
  },
  { immediate: true }
);

async function submitCart() {
  if (cartDistinct.value === 0 || submittingCart.value) {
    return;
  }
  submittingCart.value = true;
  cartError.value = null;
  cartSuccess.value = null;
  try {
    const itemsPayload = cart.value.map((entry) => ({
      itemId: entry.itemId,
      itemName: entry.itemName,
      quantity: entry.quantity
    }));
    await api.requestGuildBankItems(guildId.value, itemsPayload);
    cartSuccess.value = 'Request sent!';
    resetCart();
  } catch (error: any) {
    const message =
      error?.response?.data?.message ??
      error?.message ??
      'Unable to submit guild bank request. Ensure the webhook is enabled.';
    cartError.value = message;
  } finally {
    submittingCart.value = false;
  }
}

function syncSelectionWithSnapshot() {
  if (!snapshot.value) {
    return;
  }
  const names = snapshot.value.characters.map((c) => c.name.toLowerCase());
  const nameSet = new Set(names);
  // Always include all current characters by default
  selectedCharacters.value = nameSet;
}

function toggleCharacterSelection(name: string) {
  const key = name.toLowerCase();
  const next = new Set(selectedCharacters.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  selectedCharacters.value = next;
}

async function loadGuildMeta() {
  try {
    const detail = await api.fetchGuildDetail(guildId.value);
    guildName.value = detail.name;
    guildRole.value = detail.permissions?.userRole ?? null;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ?? 'Unable to load guild details. Returning to guild list.';
    setTimeout(() => {
      router.push({ name: 'Guilds' });
    }, 1200);
    throw new Error(message);
  }
}

async function refreshSnapshot(force = false) {
  if (loadingSnapshot.value) {
    return;
  }
  if (!force && !canRefreshNow.value) {
    return;
  }

  loadingSnapshot.value = true;
  snapshotError.value = null;
  try {
    const result = await api.fetchGuildBank(guildId.value);
    const serverNames = result.characters.map((entry) => entry.name);
    const mergedNames = mergeNamesCaseInsensitive([...serverNames, ...cachedNames.value]);
    const missingOnServer = diffNamesCaseInsensitive(mergedNames, serverNames);

    if (
      canManageBank.value &&
      missingOnServer.length > 0 &&
      !autoRestoreAttempted.value &&
      !restoringNames.value
    ) {
      autoRestoreAttempted.value = true;
      restoringNames.value = true;
      try {
        for (const name of missingOnServer) {
          await api.addGuildBankCharacter(guildId.value, name);
        }
        restoringNames.value = false;
        await refreshSnapshot(true);
        return;
      } catch (error: any) {
        restoringNames.value = false;
        snapshotError.value =
          error?.response?.data?.message ??
          'Some bank characters were missing and could not be restored automatically.';
      }
    }

    snapshot.value = result;
    lastFetchedAt.value = Date.now();
    saveCache(result);
    saveCachedNames(mergedNames);
    reconcileCartWithSnapshot();
  } catch (error: any) {
    const message =
      error?.response?.data?.message ??
      error?.message ??
      'Something went wrong while loading the guild bank.';
    snapshotError.value = message;
  } finally {
    loadingSnapshot.value = false;
  }
}

async function addCharacter() {
  if (!newCharacterName.value.trim()) {
    return;
  }
  addingCharacter.value = true;
  snapshotError.value = null;
  try {
    const created = await api.addGuildBankCharacter(guildId.value, newCharacterName.value.trim());
    snapshot.value = {
      characters: [...(snapshot.value?.characters ?? []), created],
      items: snapshot.value?.items ?? [],
      missingCharacters: snapshot.value?.missingCharacters ?? []
    };
    saveCachedNames(snapshot.value.characters.map((entry) => entry.name));
    newCharacterName.value = '';
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value =
      error?.response?.data?.message ?? 'Unable to add guild bank character.';
  } finally {
    addingCharacter.value = false;
  }
}

async function removeCharacter(id: string) {
  removingId.value = id;
  snapshotError.value = null;
  try {
    const removedName = snapshot.value?.characters.find((entry) => entry.id === id)?.name ?? null;
    await api.deleteGuildBankCharacter(guildId.value, id);
    snapshot.value = snapshot.value
      ? {
          characters: snapshot.value.characters.filter((entry) => entry.id !== id),
          items: removedName
            ? snapshot.value.items.filter((entry) => entry.characterName !== removedName)
            : snapshot.value.items,
          missingCharacters: snapshot.value.missingCharacters
        }
      : null;
    saveCachedNames(snapshot.value?.characters?.map((entry) => entry.name) ?? []);
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value = error?.response?.data?.message ?? 'Unable to remove character.';
  } finally {
    removingId.value = null;
  }
}

function applyCachedSnapshot() {
  const cached = loadCache();
  if (cached) {
    snapshot.value = cached.snapshot;
    lastFetchedAt.value = cached.fetchedAt;
  } else {
    snapshot.value = null;
    lastFetchedAt.value = null;
  }
  loadCachedNames();
}

watch(
  () => guildId.value,
  async () => {
    applyCachedSnapshot();
    autoRestoreAttempted.value = false;
    loadCart();
    try {
      await loadGuildMeta();
    } catch {
      return;
    }
    currentPage.value = 1;
    const cacheAge = lastFetchedAt.value ? now.value - lastFetchedAt.value : Infinity;
    const cacheIsFresh = cacheAge < ONE_HOUR_MS;
    if (!snapshot.value) {
      await refreshSnapshot();
    } else if (canRefreshNow.value && !cacheIsFresh) {
      await refreshSnapshot();
    }
  },
  { immediate: true }
);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  loadCart();
  syncSelectionWithSnapshot();
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
});
</script>
