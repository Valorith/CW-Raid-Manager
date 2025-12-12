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
          <div class="stat-chip__value">{{ snapshot?.characters.filter(c => c.isTracked !== false).length ?? 0 }}</div>
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
        <div
          v-if="missingCachedNames.length && canManageBank"
          class="alert alert--warning"
        >
          <p class="alert__title">We detected missing tracked characters</p>
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

        <div class="roster-stack">
          <section
            :class="['roster-card', activeRoster === 'guild' ? 'roster-card--open' : 'roster-card--collapsed']"
          >
            <button
              type="button"
              class="roster-card__header"
              :aria-expanded="activeRoster === 'guild'"
              @click="setActiveRoster('guild')"
            >
              <div>
                <p class="eyebrow">Guild bank characters</p>
                <h2>Roster</h2>
                <p class="muted small roster-card__hint">
                  Leaders and officers can add the characters that hold guild items.
                </p>
              </div>
              <div class="roster-card__status">
                <span v-if="!canManageBank" class="muted small">View only</span>
                <span class="roster-card__chevron" aria-hidden="true">
                  {{ activeRoster === 'guild' ? '▾' : '▸' }}
                </span>
              </div>
            </button>
            <div v-show="activeRoster === 'guild'" class="roster-card__body">
              <div class="roster-card__controls" v-if="guildRoster.length">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="setRosterSelection('guild', !allGuildSelected)"
                >
                  {{ allGuildSelected ? 'Disable all' : 'Enable all' }}
                </button>
              </div>
              <form
                v-if="canManageBank"
                class="add-bank-character"
                @submit.prevent="addCharacter(false)"
              >
                <input
                  v-model="newGuildCharacterName"
                  type="text"
                  class="input"
                  name="guild-character"
                  placeholder="e.g. Copperkeep"
                  :disabled="addingCharacter"
                />
                <button
                  class="btn btn--secondary"
                  type="submit"
                  :disabled="addingCharacter || !newGuildCharacterName.trim().length"
                >
                  {{ addingCharacter ? 'Adding…' : 'Add character' }}
                </button>
              </form>

              <ul class="bank-character-list">
                <li
                  v-for="character in guildRoster"
                  :key="character.id"
                  class="bank-character"
                >
                  <label class="bank-character__meta">
                    <input
                      type="checkbox"
                      :checked="isCharacterSelected(character.name, false)"
                      @change="toggleCharacterSelection(character.name, false)"
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
            </div>
          </section>

          <section
            :class="['roster-card', activeRoster === 'personal' ? 'roster-card--open' : 'roster-card--collapsed']"
          >
            <button
              type="button"
              class="roster-card__header"
              :aria-expanded="activeRoster === 'personal'"
              @click="setActiveRoster('personal')"
            >
              <div>
                <p class="eyebrow">Personal characters</p>
                <h2>Roster</h2>
                <p class="muted small roster-card__hint">
                  Keep your personal characters separate. They stay disabled until you check them.
                </p>
              </div>
              <div class="roster-card__status">
                <span class="roster-card__chevron" aria-hidden="true">
                  {{ activeRoster === 'personal' ? '▾' : '▸' }}
                </span>
              </div>
            </button>
            <div v-show="activeRoster === 'personal'" class="roster-card__body">
              <div class="roster-card__controls" v-if="personalRoster.length">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="setRosterSelection('personal', !allPersonalSelected)"
                >
                  {{ allPersonalSelected ? 'Disable all' : 'Enable all' }}
                </button>
              </div>
              <form
                v-if="canManagePersonal"
                class="add-bank-character"
                @submit.prevent="addCharacter(true)"
              >
                <input
                  v-model="newPersonalCharacterName"
                  type="text"
                  class="input"
                  name="personal-character"
                  placeholder="e.g. Altcollector"
                  :disabled="addingCharacter"
                />
                <button
                  class="btn btn--secondary"
                  type="submit"
                  :disabled="addingCharacter || !newPersonalCharacterName.trim().length"
                >
                  {{ addingCharacter ? 'Adding…' : 'Add character' }}
                </button>
              </form>

              <ul class="bank-character-list">
                <li
                  v-for="character in personalRoster"
                  :key="character.id"
                  class="bank-character"
                >
                  <label class="bank-character__meta">
                    <input
                      type="checkbox"
                      :checked="isCharacterSelected(character.name, true)"
                      @change="toggleCharacterSelection(character.name, true)"
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
                    v-if="canManagePersonal"
                    class="icon-button"
                    :disabled="removingId === character.id"
                    @click="removeCharacter(character.id)"
                    :aria-label="`Remove ${character.name}`"
                  >
                    <span class="icon-button__glyph" aria-hidden="true">🗑️</span>
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </div>

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
          <li
            v-for="item in pagedItems"
            :key="item.key"
            class="guild-bank-item"

          >
            <div class="guild-bank-item__header">
              <div
                class="guild-bank-item__icon"
                :class="{ 'guild-bank-item__icon--placeholder': !item.itemIconId }"
                @mouseenter="showItemTooltip($event, item)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideItemTooltip"
              >
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
                  @click.stop
                >
                  <span aria-hidden="true">🔗</span>
                  <span>Alla</span>
                </a>
                <button
                  v-if="item.guildQuantity > 0"
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
                  @click.stop="openInventoryModal(item, owner.characterName)"
                  role="button"
                  tabindex="0"
                  style="cursor: pointer"
                >
                  {{ owner.characterName }} ({{ owner.locationLabel }}) · ×{{ owner.totalQuantity }}
                </span>
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



    <div
      v-if="showRequestModal && requestModalItem"
      class="modal-backdrop"
      @click.self="closeRequestModal"
    >
      <div class="modal request-modal" :key="requestModalItem?.itemKey">
        <header class="modal__header">
          <div class="request-modal__title">
            <div
              class="request-modal__icon"
              :class="{ 'request-modal__icon--placeholder': !requestModalItem.itemIconId }"
              @mouseenter="showItemTooltip($event, requestModalItem)"
              @mousemove="updateTooltipPosition($event)"
              @mouseleave="hideItemTooltip"
            >
              <img
                v-if="requestModalItem.itemIconId"
                :src="getLootIconSrc(requestModalItem.itemIconId)"
                :alt="`${requestModalItem.itemName} icon`"
                loading="lazy"
              />
              <span v-else>?</span>
            </div>
            <div class="request-modal__text">
              <p class="eyebrow">Add to Cart</p>
              <h3>{{ requestModalItem.itemName }}</h3>
            </div>
          </div>
          <button class="icon-button" type="button" @click="closeRequestModal" aria-label="Close">
            ×
          </button>
        </header>
        <div class="request-modal__body">
          <div class="request-modal__quantity">
            <label>
              Quantity
              <span class="request-modal__badge">Max {{ requestModalItem.maxQuantity }}</span>
            </label>
            <input
              v-model.number="requestQuantity"
              type="number"
              min="1"
              :max="requestModalItem.maxQuantity"
              class="input"
            />
            <input
              type="range"
              :min="requestModalItem.maxQuantity === 1 ? 0 : 1"
              :max="requestModalItem.maxQuantity === 1 ? 1 : requestModalItem.maxQuantity"
              step="1"
              :value="Math.min(requestQuantity, requestModalItem.maxQuantity)"
              @input="onRangeChange"
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

    <div v-if="cartConfirmOpen" class="modal-backdrop modal-backdrop--top" style="z-index: 140" @click.self="cartConfirmOpen = false">
      <div class="modal confirm-modal">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Confirm request</p>
            <h3>Submit Request?</h3>
          </div>
          <button class="icon-button" type="button" @click="cartConfirmOpen = false" aria-label="Close">
            ×
          </button>
        </header>
        <div class="confirm-modal__body">
          Confirm that you want to send this request for items from the guild bank to guild Officers
          for consideration. This request will send a notification to guild leadership with your list
          of requested items.
        </div>
        <footer class="modal__footer confirm-modal__footer">
          <button class="btn btn--secondary" type="button" @click="cartConfirmOpen = false">
            Cancel
          </button>
          <button class="btn" type="button" :disabled="submittingCart" @click="submitCart(true)">
            {{ submittingCart ? 'Requesting…' : 'Send Request' }}
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
              <div
                class="guild-bank-item__icon"
                :class="{ 'guild-bank-item__icon--placeholder': !entry.itemIconId }"
                @mouseenter="showItemTooltip($event, entry)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideItemTooltip"
              >
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
            <button class="btn" type="button" :disabled="cartDistinct === 0 || submittingCart" @click="cartConfirmOpen = true">
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
import { computed, onBeforeUnmount, onMounted, ref, watch, shallowRef } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { api, type GuildBankSnapshot, type GuildBankItem } from '../services/api';
import { getCharacterClassIcon, type CharacterClass, type GuildRole } from '../services/types';
import { getLootIconSrc } from '../utils/itemIcons';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';

const route = useRoute();
const router = useRouter();
const store = useGuildBankStore();
const tooltipStore = useItemTooltipStore();

const guildId = computed(() => route.params.guildId as string);

// Tooltip handlers for item icons
function showItemTooltip(event: MouseEvent, item: {
  itemId?: number | null;
  itemName: string;
  itemIconId?: number | null;
  augSlot1?: number | null;
  augSlot2?: number | null;
  augSlot3?: number | null;
  augSlot4?: number | null;
  augSlot5?: number | null;
  augSlot6?: number | null;
}) {
  if (!item.itemId) return;
  tooltipStore.showTooltip(
    {
      itemId: item.itemId,
      itemName: item.itemName,
      itemIconId: item.itemIconId ?? null,
      augSlot1: item.augSlot1,
      augSlot2: item.augSlot2,
      augSlot3: item.augSlot3,
      augSlot4: item.augSlot4,
      augSlot5: item.augSlot5,
      augSlot6: item.augSlot6
    },
    { x: event.clientX, y: event.clientY }
  );
}

function updateTooltipPosition(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function hideItemTooltip() {
  tooltipStore.hideTooltip();
}

const guildName = ref<string>('');
const guildRole = ref<GuildRole | null>(null);

const snapshot = computed(() => store.snapshot);
const loadingSnapshot = computed(() => store.loading);
const snapshotError = computed(() => store.error);
const lastFetchedAt = computed(() => store.lastFetchedAt);

type RosterType = 'guild' | 'personal';

function toBooleanFlag(value: any): boolean {
  return value === true || value === 1 || value === '1';
}

const activeRoster = ref<RosterType>('guild');
const newGuildCharacterName = ref('');
const newPersonalCharacterName = ref('');
const addingCharacter = ref(false);
const removingId = ref<string | null>(null);
const restoringNames = ref(false);
const cachedNames = ref<Array<{ name: string; isPersonal: boolean }>>([]);

const searchQuery = ref('');
const selectedGuild = ref<Set<string>>(new Set());
const selectedPersonal = ref<Set<string>>(new Set());
const hasUserSelection = ref(false);

const now = ref(Date.now());
let timer: number | null = null;

const canManageBank = computed(() =>
  guildRole.value ? ['LEADER', 'OFFICER'].includes(guildRole.value) : false
);
const canManagePersonal = computed(() => !!guildRole.value);

const cacheKey = computed(() => `guild-bank:${guildId.value}`);
const cacheNamesKey = computed(() => `guild-bank:names:${guildId.value}:v1`);
const autoRestoreAttempted = ref(false);
const initialFetchDone = ref(false);

function aggregateItems(items: GuildBankItem[]) {
    const map = new Map<
        string,
        {
            key: string;
            itemId: number | null;
            itemName: string;
            itemIconId: number | null;
            totalQuantity: number;
            guildQuantity: number;
            owners: Array<{
                characterName: string;
                quantity: number;
                location: GuildBankItem['location'];
                locationLabel: string;
                isPersonal: boolean;
                slotId: number | null;
            }>;
            ownerSummaries: Map<
                string,
                { characterName: string; locationLabel: string; totalQuantity: number; isPersonal: boolean }
            >;
            locationSet: Set<string>;
            slotPlacements: Array<{
                characterName: string;
                location: GuildBankItem['location'];
                locationLabel: string;
                isPersonal: boolean;
                slotId: number | null;
                quantity: number;
            }>;
        }
    >();

    for (const entry of items) {
        const quantity = normalizeQuantity(entry.charges);
        const key = buildItemKey(entry.itemId ?? null, entry.itemName);
        const locationLabel =
            entry.location === 'WORN'
                ? 'Worn'
                : entry.location === 'BANK'
                    ? 'Bank'
                    : entry.location === 'CURSOR'
                        ? 'Cursor'
                        : 'Inventory';
        const isPersonal = (entry as any)?.isPersonal === true || (entry as any)?.isPersonal === 1;
        const slotId = typeof entry.slotId === 'number' ? entry.slotId : null;

        const existing = map.get(key);
        if (!existing) {
            map.set(key, {
                key,
                itemId: entry.itemId ?? null,
                itemName: entry.itemName,
                itemIconId: entry.itemIconId ?? null,
                totalQuantity: quantity,
                guildQuantity: isPersonal ? 0 : quantity,
                owners: [
                    {
                        characterName: entry.characterName,
                        quantity,
                        location: entry.location,
                        locationLabel,
                        isPersonal,
                        slotId
                    }
                ],
                ownerSummaries: new Map([
                    [
                        `${entry.characterName}-${locationLabel}`,
                        {
                            characterName: entry.characterName,
                            locationLabel,
                            totalQuantity: quantity,
                            isPersonal
                        }
                    ]
                ]),
                locationSet: new Set([locationLabel]),
                slotPlacements: [
                    {
                        characterName: entry.characterName,
                        location: entry.location,
                        locationLabel,
                        isPersonal,
                        slotId,
                        quantity
                    }
                ]
            });
        } else {
            existing.totalQuantity += quantity;
            if (!isPersonal) {
                existing.guildQuantity += quantity;
            }
            existing.locationSet.add(locationLabel);
            existing.owners.push({
                characterName: entry.characterName,
                quantity,
                location: entry.location,
                locationLabel,
                isPersonal,
                slotId
            });
            const keyOwner = `${entry.characterName}-${locationLabel}`;
            const summary = existing.ownerSummaries.get(keyOwner);
            if (summary) {
                summary.totalQuantity += quantity;
            } else {
                existing.ownerSummaries.set(keyOwner, {
                    characterName: entry.characterName,
                    locationLabel,
                    totalQuantity: quantity,
                    isPersonal
                });
            }
            existing.slotPlacements.push({
                characterName: entry.characterName,
                location: entry.location,
                locationLabel,
                isPersonal,
                slotId,
                quantity
            });
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
                quantity: owner.totalQuantity,
                isPersonal: owner.isPersonal
            }))
        }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

const groupedItems = computed(() => {
  if (!snapshot.value) {
    return [];
  }

  const characterPersonalMap = new Map<string, boolean>();
  snapshot.value.characters.forEach((entry) => {
    characterPersonalMap.set(entry.name.toLowerCase(), toBooleanFlag(entry.isPersonal));
  });

  const allowed = new Set([...selectedGuild.value, ...selectedPersonal.value]);

  const filteredItems =
    allowed.size === 0
      ? []
      : snapshot.value.items
          .filter((item) => allowed.has(item.characterName.toLowerCase()))
          .map((item) => ({
            ...item,
            isPersonal: characterPersonalMap.get(item.characterName.toLowerCase()) ?? false
          }));

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
    snapshot.value.characters
      .filter((entry) => entry.isTracked !== false)
      .map((entry) =>
        characterKey({ name: entry.name, isPersonal: toBooleanFlag(entry.isPersonal) })
      )
  );
  return cachedNames.value.filter((entry) => !current.has(characterKey(entry)));
});

async function restoreMissingCachedCharacters() {
  if (!missingCachedNames.value.length || restoringNames.value) {
    return;
  }
  restoringNames.value = true;
  try {
    for (const entry of missingCachedNames.value) {
      await api.addGuildBankCharacter(guildId.value, entry.name, {
        isPersonal: entry.isPersonal
      });
    }
    await store.fetchSnapshot(guildId.value, true);
  } catch (error: any) {
    console.error('Failed to restore characters', error);
  } finally {
    restoringNames.value = false;
  }
}

function visibleOwners(item: typeof groupedItems.value[number]) {
  return item.ownerSummaries;
}

const MAX_REASONABLE_QUANTITY = 1000000;

function normalizeQuantity(raw: any): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 1;
  if (num > MAX_REASONABLE_QUANTITY) return 1;
  return num;
}

function buildItemKey(itemId: number | null | undefined, itemName: string): string {
  return itemId != null ? `id:${itemId}` : `name:${itemName.toLowerCase()}`;
}

const fallbackClassIcon = '/class-icons/Warrioricon.PNG.webp';

function openInventoryModal(
  item: typeof groupedItems.value[number],
  characterName?: string
) {
  const targetName = characterName ?? item.ownerSummaries[0]?.characterName;
  if (targetName) {
    const placement = item.slotPlacements.find(
      (p) => p.characterName.toLowerCase() === targetName.toLowerCase()
    );
    store.openModal(guildId.value, targetName, placement?.slotId ?? undefined);
  }
}



const missingCount = computed(() => snapshot.value?.missingCharacters.length ?? 0);

const guildRoster = computed(
  () =>
    snapshot.value?.characters.filter(
      (entry) => !toBooleanFlag(entry.isPersonal) && entry.isTracked !== false
    ) ?? []
);
const personalRoster = computed(
  () =>
    snapshot.value?.characters.filter((entry) => toBooleanFlag(entry.isPersonal)) ?? []
);

const allGuildSelected = computed(
  () =>
    guildRoster.value.length > 0 &&
    guildRoster.value.every((entry) => selectedGuild.value.has(entry.name.toLowerCase()))
);
const allPersonalSelected = computed(
  () =>
    personalRoster.value.length > 0 &&
    personalRoster.value.every((entry) => selectedPersonal.value.has(entry.name.toLowerCase()))
);

function isCharacterSelected(name: string, isPersonal: boolean): boolean {
  const key = name.toLowerCase();
  return isPersonal
    ? selectedPersonal.value.has(key)
    : selectedGuild.value.has(key);
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
    const normalizedCharacters = Array.isArray(parsed.snapshot?.characters)
      ? parsed.snapshot.characters.map((entry: any) => ({
          ...entry,
          isPersonal: toBooleanFlag(entry?.isPersonal)
        }))
      : [];
    return {
      snapshot: {
        ...parsed.snapshot,
        characters: normalizedCharacters
      },
      fetchedAt: parsed.fetchedAt
    };
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
    if (!Array.isArray(parsed)) {
      cachedNames.value = [];
      return;
    }
    cachedNames.value = parsed
      .map((entry: any) => {
        if (typeof entry === 'string') {
          return { name: entry, isPersonal: false };
        }
        if (entry && typeof entry.name === 'string') {
          return { name: entry.name, isPersonal: toBooleanFlag(entry.isPersonal) };
        }
        return null;
      })
      .filter((entry): entry is { name: string; isPersonal: boolean } => Boolean(entry));
  } catch {
    cachedNames.value = [];
  }
}

function saveCachedNames(
  names: Array<{ name: string; isPersonal: boolean }>
) {
  const merged = mergeNamesCaseInsensitive(names);
  cachedNames.value = [...merged];
  try {
    localStorage.setItem(cacheNamesKey.value, JSON.stringify(merged));
  } catch {
    // ignore cache errors
  }
}

function characterKey(entry: { name: string; isPersonal: boolean }): string {
  return entry.name.toLowerCase();
}

function mergeNamesCaseInsensitive(
  names: Array<{ name: string; isPersonal: boolean }>
): Array<{ name: string; isPersonal: boolean }> {
  const seen = new Set<string>();
  const merged: Array<{ name: string; isPersonal: boolean }> = [];
  for (const name of names) {
    const key = characterKey(name);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  return merged;
}

function diffNamesCaseInsensitive(
  full: Array<{ name: string; isPersonal: boolean }>,
  subset: Array<{ name: string; isPersonal: boolean }>
): Array<{ name: string; isPersonal: boolean }> {
  const subsetKeys = new Set(subset.map((entry) => characterKey(entry)));
  return full.filter((entry) => !subsetKeys.has(characterKey(entry)));
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
const cartConfirmOpen = ref(false);

function openRequestModal(item: typeof groupedItems.value[number]) {
  const existing = cart.value.find((entry) => entry.itemKey === item.key);
  const guildMaxQuantity = Math.max(item.guildQuantity ?? 0, 0);
  const maxQuantity = Math.max(guildMaxQuantity, existing?.quantity ?? 0);
  requestQuantity.value = Math.min(existing?.quantity ?? 1, maxQuantity || 1);
  const sources =
    (item as any).sources && (item as any).sources.length
      ? (item as any).sources.filter((src: any) => src.isPersonal !== true)
      : item.ownerSummaries
          .filter((owner) => owner.isPersonal !== true)
          .map((owner) => ({
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

function onRangeChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = Number(target.value);
  if (!requestModalItem.value) {
    return;
  }
  if (requestModalItem.value.maxQuantity === 1) {
    requestQuantity.value = 1;
    return;
  }
  const clamped = Math.max(1, Math.min(requestModalItem.value.maxQuantity, value));
  requestQuantity.value = clamped;
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
        ? entry.sources.filter((src) => (src as any).isPersonal !== true)
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
  () =>
    snapshot.value?.characters
      ?.map((c) => `${c.name}:${c.isPersonal ? 1 : 0}`)
      .join('|'),
  (names) => {
    if (!names) return;
    syncSelectionWithSnapshot();
  },
  { immediate: true }
);

async function submitCart(skipConfirm = false) {
  if (cartDistinct.value === 0 || submittingCart.value) {
    return;
  }
  if (!skipConfirm) {
    cartConfirmOpen.value = true;
    return;
  }
  submittingCart.value = true;
  cartConfirmOpen.value = false;
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
    const status = error?.response?.status;
    const serverMessage = error?.response?.data?.message;

    if (status === 409) {
      // Webhook not enabled - show prominent toast notification
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: {
            title: 'Requests Temporarily Disabled',
            message: 'Guild bank requests require the Discord webhook to be enabled. Please contact a guild officer.'
          }
        })
      );
      cartError.value = 'Bank requests are currently disabled.';
    } else {
      const message =
        serverMessage ??
        error?.message ??
        'Unable to submit guild bank request. Please try again.';
      cartError.value = message;
    }
  } finally {
    submittingCart.value = false;
  }
}

function syncSelectionWithSnapshot() {
  if (!snapshot.value) {
    selectedGuild.value = new Set();
    selectedPersonal.value = new Set();
    return;
  }
  const prevGuild = new Set(selectedGuild.value);
  const prevPersonal = new Set(selectedPersonal.value);
  // Default (first load or no manual changes): enable all characters.
  if (!hasUserSelection.value && prevGuild.size === 0 && prevPersonal.size === 0) {
    const guildDefaults = snapshot.value.characters
      .filter((entry) => !toBooleanFlag(entry.isPersonal))
      .map((entry) => entry.name.toLowerCase());
    const personalDefaults = snapshot.value.characters
      .filter((entry) => toBooleanFlag(entry.isPersonal))
      .map((entry) => entry.name.toLowerCase());
    selectedGuild.value = new Set(guildDefaults);
    selectedPersonal.value = new Set(personalDefaults);
    return;
  }

  const currentCharacters = new Set(
    snapshot.value.characters.map((entry) => entry.name.toLowerCase())
  );

  const nextGuild = new Set<string>();
  for (const key of prevGuild) {
    if (currentCharacters.has(key)) {
      nextGuild.add(key);
    }
  }

  const nextPersonal = new Set<string>();
  for (const key of prevPersonal) {
    if (currentCharacters.has(key)) {
      nextPersonal.add(key);
    }
  }

  selectedGuild.value = nextGuild;
  selectedPersonal.value = nextPersonal;
}

function setActiveRoster(roster: RosterType) {
  activeRoster.value = roster;
}

function setRosterSelection(roster: RosterType, enable: boolean) {
  hasUserSelection.value = true;
  if (roster === 'guild') {
    if (enable) {
      selectedGuild.value = new Set(guildRoster.value.map((entry) => entry.name.toLowerCase()));
    } else {
      selectedGuild.value = new Set();
    }
  } else {
    if (enable) {
      selectedPersonal.value = new Set(
        personalRoster.value.map((entry) => entry.name.toLowerCase())
      );
    } else {
      selectedPersonal.value = new Set();
    }
  }
}

function toggleCharacterSelection(name: string, isPersonal: boolean) {
  hasUserSelection.value = true;
  const key = name.toLowerCase();
  if (isPersonal) {
    const next = new Set(selectedPersonal.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selectedPersonal.value = next;
  } else {
    const next = new Set(selectedGuild.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selectedGuild.value = next;
  }
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

async function addCharacter(isPersonal: boolean) {
  const targetRef = isPersonal ? newPersonalCharacterName : newGuildCharacterName;
  if (!targetRef.value.trim()) {
    return;
  }
  addingCharacter.value = true;
  try {
    const created = await api.addGuildBankCharacter(guildId.value, targetRef.value.trim(), {
      isPersonal
    });
    
    const key = created.name.toLowerCase();
    if (isPersonal) {
      selectedPersonal.value = new Set([...selectedPersonal.value, key]);
    } else {
      selectedGuild.value = new Set([...selectedGuild.value, key]);
    }
    hasUserSelection.value = true;
    saveCachedNames(
      (store.snapshot?.characters ?? []).map((entry) => ({
        name: entry.name,
        isPersonal: toBooleanFlag(entry.isPersonal)
      }))
    );
    targetRef.value = '';
    await store.fetchSnapshot(guildId.value, true);
  } catch (error: any) {
    console.error('Failed to add character', error);
  } finally {
    addingCharacter.value = false;
  }
}

async function removeCharacter(id: string) {
  removingId.value = id;
  try {
    await api.deleteGuildBankCharacter(guildId.value, id);
    saveCachedNames(
      store.snapshot?.characters?.map((entry) => ({
        name: entry.name,
        isPersonal: toBooleanFlag(entry.isPersonal)
      })) ?? []
    );
    await store.fetchSnapshot(guildId.value, true);
  } catch (error: any) {
    console.error('Failed to remove character', error);
  } finally {
    removingId.value = null;
  }
}



async function refreshSnapshot() {
  await store.fetchSnapshot(guildId.value, true);
}

watch(
  () => guildId.value,
  async () => {
    autoRestoreAttempted.value = false;
    loadCart();
    try {
      await loadGuildMeta();
    } catch {
      return;
    }
    currentPage.value = 1;
    await store.fetchSnapshot(guildId.value);
    initialFetchDone.value = true;
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
