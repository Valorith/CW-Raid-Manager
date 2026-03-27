<template>
  <section class="connections">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Server Connections</h1>
        <p class="muted">Currently connected characters on the EQEmu server.</p>
      </div>
      <div class="section-header__actions">
        <router-link to="/admin" class="btn btn--outline"> Back to Admin </router-link>
        <div v-if="authStore.isAdmin" class="auto-link-wrapper">
          <span class="auto-link-label">
            Last: {{ lastAutoLinkDate ? formatAutoLinkDate : 'Never' }}
          </span>
          <button
            type="button"
            class="btn btn--outline"
            :title="'Scan account_ip table for shared IPs and create associations'"
            @click="showAutoLinkConfirmation = true"
          >
            Auto-Link Shared IPs
          </button>
        </div>
        <button
          type="button"
          class="btn btn--outline"
          :disabled="loading"
          @click="refreshConnections"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="connections-stats">
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">Players Online</span>
        <strong class="stat-card__value">{{ connections.length }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Unique IPs</span>
        <strong class="stat-card__value">{{ uniqueIps }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Unique Zones</span>
        <strong class="stat-card__value">{{ uniqueZones }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Auto-Refresh</span>
        <strong class="stat-card__value">{{ autoRefreshEnabled ? 'ON' : 'OFF' }}</strong>
        <button type="button" class="stat-card__toggle" @click="toggleAutoRefresh">
          {{ autoRefreshEnabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>

    <!-- Character Search -->
    <div class="character-search-section">
      <div class="character-search">
        <label class="character-search__label">Global Search</label>
        <div class="search-input-wrapper">
          <input
            type="text"
            v-model="globalSearchQuery"
            :placeholder="globalSearchPlaceholder"
            class="character-search__input"
            @input="handleGlobalSearch"
            @focus="showSearchResults = true"
          />
          <span v-if="activeGlobalSearchLoading" class="search-spinner"></span>
        </div>
        <div class="character-search__toggle" role="tablist" aria-label="Global search mode">
          <button
            type="button"
            class="character-search__toggle-button"
            :class="{ 'character-search__toggle-button--active': globalSearchMode === 'items' }"
            :aria-pressed="globalSearchMode === 'items'"
            @click="setGlobalSearchMode('items')"
          >
            Items
          </button>
          <button
            type="button"
            class="character-search__toggle-button"
            :class="{
              'character-search__toggle-button--active': globalSearchMode === 'characters'
            }"
            :aria-pressed="globalSearchMode === 'characters'"
            @click="setGlobalSearchMode('characters')"
          >
            Characters
          </button>
        </div>
        <div v-if="showSearchResults && showGlobalSearchDropdown" class="character-search__results">
          <template v-if="globalSearchMode === 'characters'">
            <div
              v-for="result in characterAdminStore.searchResults"
              :key="result.id"
              class="character-search__result"
              @click="openCharacterAdmin(result)"
            >
              <span class="result-name">{{ result.name }}</span>
              <span class="result-details">
                Level {{ result.level }} {{ result.className }}
                <span class="result-account">({{ result.accountName }})</span>
              </span>
            </div>
          </template>
          <template v-else>
            <div
              v-for="result in itemSearchResults"
              :key="result.itemId"
              class="character-search__result"
              @click="openItemOwnershipModal(result)"
            >
              <div class="result-name-row">
                <span v-if="hasSearchResultIcon(result.itemIconId)" class="result-item-icon">
                  <img
                    :src="getLootIconSrc(result.itemIconId!)"
                    :alt="result.itemName"
                    loading="lazy"
                  />
                </span>
                <span class="result-name">{{ result.itemName }}</span>
              </div>
              <span class="result-details">Item ID {{ result.itemId }}</span>
            </div>
          </template>
          <div
            v-if="showGlobalSearchNoResults && !activeGlobalSearchLoading"
            class="character-search__no-results"
          >
            {{ globalSearchNoResultsText }}
          </div>
          <div v-else-if="itemSearchError" class="character-search__no-results">
            {{ itemSearchError }}
          </div>
        </div>
      </div>
    </div>

    <article class="card">
      <header class="card__header">
        <div>
          <h2>Connected Characters</h2>
          <span class="muted small"
            >{{ filteredConnections.length }} characters from
            {{ filteredIpGroups.length }} IPs</span
          >
        </div>
        <input
          v-model="searchQuery"
          type="search"
          class="input input--search"
          placeholder="Search by name, zone, or guild..."
        />
      </header>

      <GlobalLoadingSpinner v-if="showLoading" />
      <p v-else-if="error" class="error-message">
        {{ error }}
      </p>
      <p v-else-if="filteredConnections.length === 0" class="muted empty-message">
        {{
          searchQuery ? 'No characters match your search.' : 'No characters currently connected.'
        }}
      </p>

      <div v-else class="ip-groups">
        <div
          v-for="group in paginatedIpGroups"
          :key="group.ip"
          class="ip-group"
          :class="{
            'ip-group--hack-warning': getIpGroupHackStatus(group) === 'warning',
            'ip-group--hack-critical': getIpGroupHackStatus(group) === 'critical'
          }"
        >
          <div class="ip-group__header">
            <div class="ip-group__left">
              <code class="ip-address">{{ group.ip }}</code>
              <span class="ip-group__count"
                >{{ getTotalGroupCount(group) }} character{{
                  getTotalGroupCount(group) !== 1 ? 's' : ''
                }}</span
              >
            </div>
            <span
              class="ip-group__outside-count"
              :class="{
                'ip-group__outside-count--warning':
                  getOutsideHomeCount(group) > 0 &&
                  getOutsideHomeCount(group) <= getIpLimit(group.ip),
                'ip-group__outside-count--danger': getOutsideHomeCount(group) > getIpLimit(group.ip)
              }"
            >
              Active: {{ getOutsideHomeCount(group) }}/{{ getIpLimit(group.ip) }}
            </span>
          </div>
          <!-- Trader Sub-group -->
          <div v-if="group.traders.length > 0" class="trader-subgroup">
            <div class="trader-subgroup__header">
              <svg
                class="subgroup-icon subgroup-icon--trader"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
              <span class="trader-subgroup__label">Traders</span>
              <span class="trader-subgroup__count">{{ group.traders.length }}</span>
            </div>
            <div class="table-wrapper">
              <table class="connections-table connections-table--traders">
                <thead>
                  <tr>
                    <th class="col-class">Class</th>
                    <th class="col-name">Character</th>
                    <th class="col-level">Level</th>
                    <th class="col-zone">Zone</th>
                    <th class="col-guild">Guild</th>
                    <th class="col-last-sale">Last Sale</th>
                    <th class="col-total-sales">Total Sales</th>
                    <th class="col-hack-count">Hacks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(trader, index) in group.traders"
                    :key="`trader-${trader.connectId}-${index}`"
                    :class="getRowClass(trader, group)"
                  >
                    <td class="col-class">
                      <div class="class-cell">
                        <img
                          v-if="getClassIcon(trader.className)"
                          :src="getClassIcon(trader.className) ?? undefined"
                          :alt="formatClass(trader.className)"
                          class="class-icon"
                        />
                        <span class="class-label">{{ formatClass(trader.className) }}</span>
                      </div>
                    </td>
                    <td class="col-name">
                      <CharacterLink :name="trader.characterName" :admin-mode="true" />
                    </td>
                    <td class="col-level">{{ trader.level }}</td>
                    <td class="col-zone">{{ trader.zoneName }}</td>
                    <td class="col-guild">
                      <span v-if="trader.guildName" class="guild-tag">{{ trader.guildName }}</span>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-last-sale">
                      <div v-if="trader.lastSaleItemName" class="last-sale-cell">
                        <div
                          class="last-sale-header"
                          @mouseenter="showTraderItemTooltip($event, trader)"
                          @mousemove="updateTooltipPosition($event)"
                          @mouseleave="hideItemTooltip"
                        >
                          <span
                            v-if="hasValidIconId(trader.lastSaleItemIconId)"
                            class="last-sale-icon"
                          >
                            <img
                              :src="getLootIconSrc(trader.lastSaleItemIconId!)"
                              :alt="trader.lastSaleItemName"
                              loading="lazy"
                            />
                          </span>
                          <span class="last-sale-item">{{ trader.lastSaleItemName }}</span>
                        </div>
                        <div class="last-sale-details">
                          <span class="last-sale-price">{{
                            formatMoney(trader.lastSalePrice)
                          }}</span>
                          <span class="last-sale-time">{{
                            formatRelativeTime(trader.lastSaleAt!)
                          }}</span>
                        </div>
                      </div>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-total-sales">
                      <button
                        v-if="trader.totalSalesCount && trader.totalSalesCount > 0"
                        class="total-sales-cell total-sales-cell--clickable"
                        @click="openTraderSales(trader.characterId)"
                        :title="`View ${trader.totalSalesCount} sale${trader.totalSalesCount !== 1 ? 's' : ''}`"
                      >
                        <span class="total-sales-amount">{{
                          formatMoney(trader.totalSalesAmount)
                        }}</span>
                        <span class="total-sales-count"
                          >({{ trader.totalSalesCount }} item{{
                            trader.totalSalesCount !== 1 ? 's' : ''
                          }})</span
                        >
                      </button>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-hack-count">
                      <span
                        class="hack-risk-indicator"
                        :class="`hack-risk-indicator--${getHackRiskDisplay(trader).level}`"
                        :title="getHackRiskDisplay(trader).tooltip"
                      >
                        {{ getHackRiskDisplay(trader).label }}
                      </span>
                      <button
                        v-if="trader.hackCount > 0"
                        class="hack-count-badge hack-count-badge--clickable"
                        @click="openHackEvents(trader.characterId)"
                        :title="`View ${trader.hackCount} hack event${trader.hackCount !== 1 ? 's' : ''}`"
                      >
                        {{ trader.hackCount }}
                      </button>
                      <span v-else class="muted">0</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Fighter Sub-group -->
          <div v-if="group.fighters.length > 0" class="fighter-subgroup">
            <div class="fighter-subgroup__header">
              <svg
                class="subgroup-icon subgroup-icon--fighter"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14.5 17.5L3 6V3h3l11.5 11.5"></path>
                <path d="M13 19l6-6"></path>
                <path d="M16 16l4 4"></path>
                <path d="M19 21l2-2"></path>
                <path d="M9.5 6.5L21 18v3h-3L6.5 9.5"></path>
                <path d="M11 5l-6 6"></path>
                <path d="M8 8L4 4"></path>
                <path d="M5 3L3 5"></path>
              </svg>
              <span class="fighter-subgroup__label">Fighters</span>
              <span class="fighter-subgroup__count">{{ group.fighters.length }}</span>
            </div>
            <div class="table-wrapper">
              <table class="connections-table connections-table--fighters">
                <thead>
                  <tr>
                    <th class="col-class">Class</th>
                    <th class="col-name">Character</th>
                    <th class="col-level">Level</th>
                    <th class="col-zone">Zone</th>
                    <th class="col-guild">Guild</th>
                    <th class="col-last-kill">Last Kill</th>
                    <th class="col-last-action">Last Action</th>
                    <th class="col-hack-count">Hacks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(fighter, index) in group.fighters"
                    :key="`fighter-${fighter.connectId}-${index}`"
                    :class="getRowClass(fighter, group)"
                  >
                    <td class="col-class">
                      <div class="class-cell">
                        <img
                          v-if="getClassIcon(fighter.className)"
                          :src="getClassIcon(fighter.className) ?? undefined"
                          :alt="formatClass(fighter.className)"
                          class="class-icon"
                        />
                        <span class="class-label">{{ formatClass(fighter.className) }}</span>
                      </div>
                    </td>
                    <td class="col-name">
                      <CharacterLink :name="fighter.characterName" :admin-mode="true" />
                    </td>
                    <td class="col-level">{{ fighter.level }}</td>
                    <td class="col-zone">{{ fighter.zoneName }}</td>
                    <td class="col-guild">
                      <span v-if="fighter.guildName" class="guild-tag">{{
                        fighter.guildName
                      }}</span>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-last-kill">
                      <div
                        v-if="fighter.lastKillNpcName"
                        class="last-kill-cell"
                        :title="formatLastKillTooltip(fighter)"
                      >
                        <span class="last-kill-name">{{
                          formatNpcName(fighter.lastKillNpcName)
                        }}</span>
                        <span v-if="fighter.lastKillAt" class="last-kill-time">{{
                          formatRelativeTime(fighter.lastKillAt)
                        }}</span>
                      </div>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-last-action">
                      <div v-if="fighter.lastActionAt" class="last-action-cell">
                        <span :title="formatFullDate(fighter.lastActionAt)">
                          {{ formatRelativeTime(fighter.lastActionAt) }}
                        </span>
                        <span
                          class="event-type-badge"
                          :title="formatFullDate(fighter.lastActionAt)"
                        >
                          {{ getEventTypeLabel(fighter.lastActionEventTypeId) }}
                        </span>
                      </div>
                      <span v-else class="muted">-</span>
                    </td>
                    <td class="col-hack-count">
                      <span
                        class="hack-risk-indicator"
                        :class="`hack-risk-indicator--${getHackRiskDisplay(fighter).level}`"
                        :title="getHackRiskDisplay(fighter).tooltip"
                      >
                        {{ getHackRiskDisplay(fighter).label }}
                      </span>
                      <button
                        v-if="fighter.hackCount > 0"
                        class="hack-count-badge hack-count-badge--clickable"
                        @click="openHackEvents(fighter.characterId)"
                        :title="`View ${fighter.hackCount} hack event${fighter.hackCount !== 1 ? 's' : ''}`"
                      >
                        {{ fighter.hackCount }}
                      </button>
                      <span v-else class="muted">0</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          class="pagination__button"
          :disabled="currentPage === 1"
          @click="setPage(currentPage - 1)"
        >
          Previous
        </button>
        <span class="pagination__label">Page {{ currentPage }} of {{ totalPages }}</span>
        <button
          class="pagination__button"
          :disabled="currentPage === totalPages"
          @click="setPage(currentPage + 1)"
        >
          Next
        </button>
      </div>
    </article>

    <p v-if="lastUpdated" class="last-updated muted small">Last updated: {{ formatLastUpdated }}</p>

    <!-- Confirmation Modal for Auto-Link -->
    <ConfirmationModal
      v-if="showAutoLinkConfirmation"
      title="Auto-Link Shared IPs"
      description="This will scan the account_ip table for IP addresses used by multiple accounts and create indirect associations between all characters on those accounts. This operation may take some time depending on the size of your database."
      confirm-label="Start Scan"
      cancel-label="Cancel"
      @confirm="startAutoLink"
      @cancel="showAutoLinkConfirmation = false"
    />

    <!-- Progress Modal for Auto-Link -->
    <AutoLinkProgressModal :is-open="showAutoLinkProgress" @close="handleAutoLinkClose" />

    <div
      v-if="itemOwnershipModalOpen"
      class="item-ownership-modal-backdrop"
      @click.self="closeItemOwnershipModal"
    >
      <div class="item-ownership-modal">
        <header class="item-ownership-modal__header">
          <div class="item-ownership-modal__title-group">
            <div v-if="itemOwnershipResult" class="item-ownership-modal__title-row">
              <span
                v-if="hasSearchResultIcon(itemOwnershipResult.item.itemIconId)"
                class="item-ownership-modal__icon"
              >
                <img
                  :src="getLootIconSrc(itemOwnershipResult.item.itemIconId!)"
                  :alt="itemOwnershipResult.item.itemName"
                  loading="lazy"
                />
              </span>
              <div>
                <p class="item-ownership-modal__eyebrow">Item Ownership</p>
                <h2>{{ itemOwnershipResult.item.itemName }}</h2>
              </div>
            </div>
            <div v-else>
              <p class="item-ownership-modal__eyebrow">Item Ownership</p>
              <h2>Loading item owners...</h2>
            </div>
            <p v-if="itemOwnershipResult" class="item-ownership-modal__summary">
              Item ID {{ itemOwnershipResult.item.itemId }} •
              {{ itemOwnershipResult.totalCharacterCount }} character{{
                itemOwnershipResult.totalCharacterCount === 1 ? '' : 's'
              }}
              • {{ itemOwnershipResult.totalItemCount }} total item{{
                itemOwnershipResult.totalItemCount === 1 ? '' : 's'
              }}
            </p>
          </div>
          <button
            type="button"
            class="item-ownership-modal__close"
            aria-label="Close item ownership modal"
            @click="closeItemOwnershipModal"
          >
            ×
          </button>
        </header>

        <div class="item-ownership-modal__body">
          <GlobalLoadingSpinner v-if="itemOwnershipLoading" />
          <p v-else-if="itemOwnershipError" class="error-message">
            {{ itemOwnershipError }}
          </p>
          <p
            v-else-if="itemOwnershipResult && itemOwnershipResult.owners.length === 0"
            class="muted empty-message"
          >
            No character inventories currently contain this item.
          </p>
          <div v-else-if="itemOwnershipResult" class="item-ownership-content">
            <div class="item-ownership-content__meta">
              <span class="muted small">
                Showing {{ itemOwnershipRangeStart }}-{{ itemOwnershipRangeEnd }} of
                {{ itemOwnershipResult.owners.length }} inventory entries
              </span>
            </div>

            <div class="item-ownership-table-wrapper">
              <table class="item-ownership-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>Account</th>
                    <th>Level / Class</th>
                    <th>Guild</th>
                    <th>Location</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="owner in paginatedItemOwners"
                    :key="`${owner.characterId}-${owner.slotId}-${owner.location}`"
                  >
                    <td>
                      <button
                        type="button"
                        class="item-owner-link"
                        @click="openCharacterAdminById(owner.characterId)"
                      >
                        {{ owner.characterName }}
                      </button>
                    </td>
                    <td>{{ owner.accountName }}</td>
                    <td>Level {{ owner.level }} {{ formatClass(owner.className) }}</td>
                    <td>
                      <span v-if="owner.guildName" class="guild-tag">{{ owner.guildName }}</span>
                      <span v-else class="muted">-</span>
                    </td>
                    <td>{{ formatItemLocation(owner.location, owner.slotId) }}</td>
                    <td>x{{ owner.quantity }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="itemOwnershipTotalPages > 1" class="pagination item-ownership-pagination">
              <button
                class="pagination__button"
                :disabled="itemOwnershipPage === 1"
                @click="setItemOwnershipPage(itemOwnershipPage - 1)"
              >
                Previous
              </button>
              <span class="pagination__label">
                Page {{ itemOwnershipPage }} of {{ itemOwnershipTotalPages }}
              </span>
              <button
                class="pagination__button"
                :disabled="itemOwnershipPage === itemOwnershipTotalPages"
                @click="setItemOwnershipPage(itemOwnershipPage + 1)"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CharacterLink from '../components/CharacterLink.vue';
import ConfirmationModal from '../components/ConfirmationModal.vue';
import AutoLinkProgressModal from '../components/AutoLinkProgressModal.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import {
  api,
  type AdminItemOwnershipResult,
  type AdminItemSearchResult,
  type GuildBankLocation,
  type IpExemption,
  type ServerConnection
} from '../services/api';
import { characterClassLabels, characterClassIcons, type CharacterClass } from '../services/types';
import { useAuthStore } from '../stores/auth';
import { useCharacterAdminStore } from '../stores/characterAdmin';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';

const authStore = useAuthStore();

const DEFAULT_OUTSIDE_LIMIT = 2;

// Use shared watch list from characterAdmin store
const characterAdminStore = useCharacterAdminStore();
const tooltipStore = useItemTooltipStore();
// Orange border: directly watched characters
const watchedCharacterIds = computed(
  () => new Set(characterAdminStore.fullWatchList.map((w) => w.eqCharacterId))
);
// Orange border: characters on the same account as watched characters
const watchedAccountIds = computed(
  () => new Set(characterAdminStore.fullWatchList.map((w) => w.eqAccountId))
);
// Orange border: characters with direct associations to watched characters
const directAssociatedIds = computed(
  () => new Set(characterAdminStore.directAssociatedCharacterIds)
);
// Yellow border: characters with indirect associations to watched characters
const indirectAssociatedIds = computed(
  () => new Set(characterAdminStore.indirectAssociatedCharacterIds)
);

interface IpGroup {
  ip: string;
  traders: ServerConnection[];
  fighters: ServerConnection[];
}

// A trader is a character in The Bazaar with no kill history
function isTrader(conn: ServerConnection): boolean {
  return conn.zoneName === 'The Bazaar' && !conn.lastKillNpcName;
}

const connections = ref<ServerConnection[]>([]);
const ipExemptions = ref<IpExemption[]>([]);
const loading = ref(true);
const showLoading = useMinimumLoading(loading);
const error = ref<string | null>(null);
const searchQuery = ref('');
const currentPage = ref(1);
const itemsPerPage = 10; // Groups per page
const autoRefreshEnabled = ref(true);
const lastUpdated = ref<Date | null>(null);
const showAutoLinkConfirmation = ref(false);
const showAutoLinkProgress = ref(false);
const lastAutoLinkDate = ref<Date | null>(null);

// Global character search
const globalSearchQuery = ref('');
const showSearchResults = ref(false);
const globalSearchMode = ref<'characters' | 'items'>('characters');
const itemSearchResults = ref<AdminItemSearchResult[]>([]);
const itemSearchLoading = ref(false);
const itemSearchError = ref<string | null>(null);
const itemOwnershipModalOpen = ref(false);
const itemOwnershipLoading = ref(false);
const itemOwnershipError = ref<string | null>(null);
const itemOwnershipResult = ref<AdminItemOwnershipResult | null>(null);
const itemOwnershipPage = ref(1);
const itemOwnershipPageSize = 25;
let globalSearchTimeout: ReturnType<typeof setTimeout> | null = null;

const normalizedGlobalSearchQuery = computed(() => globalSearchQuery.value.trim());
const isGlobalItemIdQuery = computed(() => /^\d+$/.test(normalizedGlobalSearchQuery.value));
const canSearchCharacters = computed(() => normalizedGlobalSearchQuery.value.length >= 2);
const canSearchItems = computed(
  () => isGlobalItemIdQuery.value || normalizedGlobalSearchQuery.value.length >= 2
);
const activeGlobalSearchLoading = computed(() =>
  globalSearchMode.value === 'characters'
    ? characterAdminStore.searchLoading
    : itemSearchLoading.value
);
const globalSearchPlaceholder = computed(() =>
  globalSearchMode.value === 'characters'
    ? 'Search any character by name...'
    : 'Search by item name or item ID...'
);
const showGlobalSearchDropdown = computed(() => {
  if (globalSearchMode.value === 'characters') {
    return characterAdminStore.searchResults.length > 0 || canSearchCharacters.value;
  }

  return (
    itemSearchResults.value.length > 0 || canSearchItems.value || Boolean(itemSearchError.value)
  );
});
const showGlobalSearchNoResults = computed(() => {
  if (globalSearchMode.value === 'characters') {
    return characterAdminStore.searchResults.length === 0 && canSearchCharacters.value;
  }

  return itemSearchResults.value.length === 0 && canSearchItems.value && !itemSearchError.value;
});
const globalSearchNoResultsText = computed(() =>
  globalSearchMode.value === 'characters' ? 'No characters found' : 'No items found'
);
const itemOwnershipTotalPages = computed(() =>
  Math.max(1, Math.ceil((itemOwnershipResult.value?.owners.length ?? 0) / itemOwnershipPageSize))
);
const paginatedItemOwners = computed(() => {
  const owners = itemOwnershipResult.value?.owners ?? [];
  const start = (itemOwnershipPage.value - 1) * itemOwnershipPageSize;
  return owners.slice(start, start + itemOwnershipPageSize);
});
const itemOwnershipRangeStart = computed(() => {
  const totalOwners = itemOwnershipResult.value?.owners.length ?? 0;
  if (totalOwners === 0) {
    return 0;
  }

  return (itemOwnershipPage.value - 1) * itemOwnershipPageSize + 1;
});
const itemOwnershipRangeEnd = computed(() => {
  const totalOwners = itemOwnershipResult.value?.owners.length ?? 0;
  if (totalOwners === 0) {
    return 0;
  }

  return Math.min(itemOwnershipPage.value * itemOwnershipPageSize, totalOwners);
});

const rawServerHackAverage = computed(() => {
  if (connections.value.length === 0) return 0;
  const totalHackEvents = connections.value.reduce((sum, conn) => sum + conn.hackCount, 0);
  return totalHackEvents / connections.value.length;
});

const serverHackAverage = computed(() => Math.ceil(rawServerHackAverage.value));
type HackRiskLevel = 'normal' | 'elevated' | 'high' | 'critical';
type HackRiskDisplay = {
  level: HackRiskLevel;
  label: string;
  tooltip: string;
};

const DEFAULT_HACK_RISK_DISPLAY: HackRiskDisplay = {
  level: 'normal',
  label: 'Normal',
  tooltip: 'Normal risk: 0 hack events.'
};

const HACK_RISK_MIN_COUNTS = {
  elevated: 5,
  high: 10,
  critical: 15
} as const;
function getHackRiskLevelForCount(
  hackCount: number,
  average: number
): { level: HackRiskLevel; label: string } {
  if (hackCount <= 0) return { level: 'normal', label: 'Normal' };

  if (average <= 0) {
    if (hackCount >= HACK_RISK_MIN_COUNTS.critical) return { level: 'critical', label: 'Critical' };
    if (hackCount >= HACK_RISK_MIN_COUNTS.high) return { level: 'high', label: 'High' };
    if (hackCount >= HACK_RISK_MIN_COUNTS.elevated) return { level: 'elevated', label: 'Elevated' };
    return { level: 'normal', label: 'Normal' };
  }

  const ratio = hackCount / average;
  if (ratio >= 5 && hackCount >= HACK_RISK_MIN_COUNTS.critical) {
    return { level: 'critical', label: 'Critical' };
  }

  if (ratio >= 3 && hackCount >= HACK_RISK_MIN_COUNTS.high) {
    return { level: 'high', label: 'High' };
  }

  if (ratio >= 1.5 && hackCount >= HACK_RISK_MIN_COUNTS.elevated) {
    return { level: 'elevated', label: 'Elevated' };
  }

  return { level: 'normal', label: 'Normal' };
}
const hackRiskByCharacterId = computed(() => {
  const average = serverHackAverage.value;
  const result = new Map<number, HackRiskDisplay>();

  for (const conn of connections.value) {
    const risk = getHackRiskLevelForCount(conn.hackCount, average);

    if (average <= 0) {
      result.set(conn.characterId, {
        ...risk,
        tooltip: `${risk.label} risk: ${conn.hackCount} hack event${conn.hackCount !== 1 ? 's' : ''}.`
      });
      continue;
    }

    const ratio = conn.hackCount / average;
    result.set(conn.characterId, {
      ...risk,
      tooltip: `${risk.label} risk: ${conn.hackCount} hack event${
        conn.hackCount !== 1 ? 's' : ''
      } vs server average ${average} (${ratio.toFixed(1)}x).`
    });
  }

  return result;
});

function getHackRiskDisplay(conn: ServerConnection): HackRiskDisplay {
  return hackRiskByCharacterId.value.get(conn.characterId) ?? DEFAULT_HACK_RISK_DISPLAY;
}

function clearGlobalSearchResults() {
  characterAdminStore.clearSearchResults();
  itemSearchResults.value = [];
  itemSearchError.value = null;
}

async function searchItems(query: string) {
  itemSearchLoading.value = true;
  itemSearchError.value = null;

  try {
    itemSearchResults.value = await api.searchAdminItems(query);
  } catch (err) {
    console.error('Failed to search items:', err);
    itemSearchResults.value = [];
    itemSearchError.value = err instanceof Error ? err.message : 'Failed to search items.';
  } finally {
    itemSearchLoading.value = false;
  }
}

function handleGlobalSearch() {
  if (globalSearchTimeout) clearTimeout(globalSearchTimeout);

  if (globalSearchMode.value === 'characters' && !canSearchCharacters.value) {
    clearGlobalSearchResults();
    return;
  }

  if (globalSearchMode.value === 'items' && !canSearchItems.value) {
    clearGlobalSearchResults();
    return;
  }

  globalSearchTimeout = setTimeout(() => {
    const query = normalizedGlobalSearchQuery.value;
    if (globalSearchMode.value === 'characters') {
      characterAdminStore.searchCharacters(query);
      return;
    }

    searchItems(query);
  }, 300);
}

function setGlobalSearchMode(mode: 'characters' | 'items') {
  if (globalSearchMode.value === mode) {
    return;
  }

  globalSearchMode.value = mode;
  clearGlobalSearchResults();

  if (normalizedGlobalSearchQuery.value) {
    showSearchResults.value = true;
    handleGlobalSearch();
  } else {
    showSearchResults.value = false;
  }
}

function openCharacterAdmin(result: { id: number; name: string }) {
  characterAdminStore.openById(result.id);
  globalSearchQuery.value = '';
  showSearchResults.value = false;
  clearGlobalSearchResults();
}

function openCharacterAdminById(characterId: number) {
  closeItemOwnershipModal();
  characterAdminStore.openById(characterId);
}

async function openItemOwnershipModal(item: AdminItemSearchResult) {
  itemOwnershipModalOpen.value = true;
  itemOwnershipLoading.value = true;
  itemOwnershipError.value = null;
  itemOwnershipResult.value = null;
  itemOwnershipPage.value = 1;
  globalSearchQuery.value = '';
  showSearchResults.value = false;
  clearGlobalSearchResults();

  try {
    itemOwnershipResult.value = await api.fetchAdminItemOwnership(item.itemId);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    console.error('Failed to fetch item ownership:', err);
    itemOwnershipError.value =
      error.response?.data?.message || error.message || 'Failed to load item ownership.';
  } finally {
    itemOwnershipLoading.value = false;
  }
}

function closeItemOwnershipModal() {
  itemOwnershipModalOpen.value = false;
  itemOwnershipLoading.value = false;
  itemOwnershipError.value = null;
  itemOwnershipResult.value = null;
  itemOwnershipPage.value = 1;
}

function setItemOwnershipPage(page: number) {
  itemOwnershipPage.value = Math.min(Math.max(1, page), itemOwnershipTotalPages.value);
}

function openHackEvents(characterId: number) {
  characterAdminStore.openByIdWithEventFilter(characterId, 'POSSIBLE_HACK');
}

function openTraderSales(characterId: number) {
  characterAdminStore.openByIdWithEventFilter(characterId, 'TRADER_SELL');
}

// Item tooltip handlers for trader items
function showTraderItemTooltip(event: MouseEvent, trader: ServerConnection) {
  if (!trader.lastSaleItemId) return;
  tooltipStore.showTooltip(
    {
      itemId: trader.lastSaleItemId,
      itemName: trader.lastSaleItemName || 'Unknown',
      itemIconId: trader.lastSaleItemIconId ?? undefined
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

function hasSearchResultIcon(iconId: number | null | undefined): iconId is number {
  return typeof iconId === 'number' && Number.isFinite(iconId) && iconId >= 0;
}

function formatItemLocation(location: GuildBankLocation, slotId: number): string {
  switch (location) {
    case 'WORN':
      return `Worn (slot ${slotId})`;
    case 'PERSONAL':
      return slotId >= 4000 ? `Bag (slot ${slotId})` : `Personal (slot ${slotId})`;
    case 'CURSOR':
      return `Cursor (slot ${slotId})`;
    case 'BANK':
      return `Bank (slot ${slotId})`;
    default:
      return `Slot ${slotId}`;
  }
}

// Close search results when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.character-search')) {
    showSearchResults.value = false;
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

const filteredConnections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return connections.value;
  }

  return connections.value.filter((conn) => {
    return (
      conn.characterName.toLowerCase().includes(query) ||
      conn.zoneName.toLowerCase().includes(query) ||
      (conn.guildName && conn.guildName.toLowerCase().includes(query)) ||
      conn.ip.includes(query)
    );
  });
});

const filteredIpGroups = computed((): IpGroup[] => {
  const groupMap = new Map<string, { traders: ServerConnection[]; fighters: ServerConnection[] }>();

  for (const conn of filteredConnections.value) {
    const existing = groupMap.get(conn.ip);
    if (existing) {
      if (isTrader(conn)) {
        existing.traders.push(conn);
      } else {
        existing.fighters.push(conn);
      }
    } else {
      if (isTrader(conn)) {
        groupMap.set(conn.ip, { traders: [conn], fighters: [] });
      } else {
        groupMap.set(conn.ip, { traders: [], fighters: [conn] });
      }
    }
  }

  // Sort groups by total count (descending), then by IP
  return Array.from(groupMap.entries())
    .map(([ip, { traders, fighters }]) => ({ ip, traders, fighters }))
    .sort((a, b) => {
      const totalA = a.traders.length + a.fighters.length;
      const totalB = b.traders.length + b.fighters.length;
      if (totalB !== totalA) {
        return totalB - totalA;
      }
      return a.ip.localeCompare(b.ip);
    });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredIpGroups.value.length / itemsPerPage))
);

const paginatedIpGroups = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredIpGroups.value.slice(start, start + itemsPerPage);
});

const uniqueIps = computed(() => {
  const ips = new Set(connections.value.map((c) => c.ip));
  return ips.size;
});

const uniqueZones = computed(() => {
  const zones = new Set(connections.value.map((c) => c.zoneName));
  return zones.size;
});

const formatLastUpdated = computed(() => {
  if (!lastUpdated.value) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(lastUpdated.value);
});

const formatAutoLinkDate = computed(() => {
  if (!lastAutoLinkDate.value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(lastAutoLinkDate.value);
});

function getClassIcon(className: string): string | null {
  return characterClassIcons[className as CharacterClass] ?? null;
}

function formatClass(className: string): string {
  return characterClassLabels[className as CharacterClass] ?? className;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatLastKillTooltip(conn: ServerConnection): string {
  if (!conn.lastKillAt) return '';
  return `Killed ${formatNpcName(conn.lastKillNpcName)} on ${formatFullDate(conn.lastKillAt)}`;
}

function formatLastSaleTooltip(conn: ServerConnection): string {
  if (!conn.lastSaleAt) return '';
  return `Sold ${conn.lastSaleItemName} on ${formatFullDate(conn.lastSaleAt)}`;
}

function formatMoney(copper: number | null): string {
  if (copper === null || copper === 0) return '0c';
  const platinum = Math.floor(copper / 1000);
  const gold = Math.floor((copper % 1000) / 100);
  const silver = Math.floor((copper % 100) / 10);
  const copperRemainder = copper % 10;
  const parts: string[] = [];
  if (platinum > 0) parts.push(`${platinum.toLocaleString()}p`);
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0) parts.push(`${silver}s`);
  if (copperRemainder > 0 || parts.length === 0) parts.push(`${copperRemainder}c`);
  return parts.join(' ');
}

function getTotalGroupCount(group: IpGroup): number {
  return group.traders.length + group.fighters.length;
}

/**
 * Smartly insert spaces into concatenated NPC names
 * e.g., "PrinceThirnegthePetulant" -> "Prince Thirneg the Petulant"
 */
function formatNpcName(name: string | null): string {
  if (!name) return '';

  // If the name already has spaces, return as-is (just clean up underscores)
  if (name.includes(' ')) {
    return name.replace(/_/g, ' ');
  }

  // Replace underscores with spaces first
  let result = name.replace(/_/g, ' ');

  // Insert space before uppercase letters that follow lowercase letters
  result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Handle common lowercase words that got stuck to previous words
  // e.g., "Thirnegthe Petulant" -> "Thirneg the Petulant"
  result = result.replace(/([a-z])(the)(\s|$)/gi, '$1 the$3');
  result = result.replace(/([a-z])(of)(\s|$)/gi, '$1 of$3');
  result = result.replace(/([a-z])(and)(\s|$)/gi, '$1 and$3');

  // Handle cases where common words are stuck between two capitalized words
  result = result.replace(/([A-Z][a-z]+)(the)([A-Z])/g, '$1 the $3');
  result = result.replace(/([A-Z][a-z]+)(of)([A-Z])/g, '$1 of $3');
  result = result.replace(/([A-Z][a-z]+)(and)([A-Z])/g, '$1 and $3');

  // Clean up any double spaces
  return result.replace(/\s+/g, ' ').trim();
}

const EVENT_TYPE_LABELS: Record<number, string> = {
  1: 'GM Command',
  2: 'Zoning',
  3: 'AA Gain',
  4: 'AA Purchase',
  5: 'Forage Success',
  6: 'Forage Failure',
  7: 'Fish Success',
  8: 'Fish Failure',
  9: 'Item Destroyed',
  10: 'Went Online',
  11: 'Went Offline',
  12: 'Level Gain',
  13: 'Level Loss',
  14: 'Loot Item',
  15: 'Merchant Purchase',
  16: 'Merchant Sell',
  17: 'Group Join',
  18: 'Group Leave',
  19: 'Raid Join',
  20: 'Raid Leave',
  21: 'Groundspawn Pickup',
  22: 'NPC Handin',
  23: 'Skill Up',
  24: 'Task Accept',
  25: 'Task Update',
  26: 'Task Complete',
  27: 'Trade',
  28: 'Give Item',
  29: 'Say',
  30: 'Rez Accepted',
  31: 'Death',
  32: 'Combine Failure',
  33: 'Combine Success',
  34: 'Dropped Item',
  35: 'Split Money',
  36: 'DZ Join',
  37: 'DZ Leave',
  38: 'Trader Purchase',
  39: 'Trader Sell',
  40: 'Bandolier Create',
  41: 'Bandolier Swap',
  42: 'Discover Item',
  43: 'Possible Hack',
  44: 'Killed NPC',
  45: 'Killed Named NPC',
  46: 'Killed Raid NPC',
  47: 'Item Creation'
};

function getEventTypeLabel(eventTypeId: number | null): string {
  if (!eventTypeId) return '';
  return EVENT_TYPE_LABELS[eventTypeId] || 'Event';
}

const INACTIVE_ZONES = ["Clumsy's Home", 'The Bazaar', 'Guild Hall'];

function isOutsideHome(conn: ServerConnection): boolean {
  return !INACTIVE_ZONES.includes(conn.zoneName);
}

function getOutsideHomeCount(group: IpGroup): number {
  // Traders are in The Bazaar (inactive zone), so only fighters count as active.
  return group.fighters.filter(isOutsideHome).length;
}

function getIpLimit(ip: string): number {
  const exemption = ipExemptions.value.find((e) => e.ip === ip);
  return exemption ? exemption.exemptionAmount : DEFAULT_OUTSIDE_LIMIT;
}

function getIpGroupHackStatus(group: IpGroup): 'critical' | 'warning' | null {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let hasCritical = false;
  let hasWarning = false;

  const allConnections = [...group.traders, ...group.fighters];
  for (const conn of allConnections) {
    if (conn.lastHackAt) {
      const hackTime = new Date(conn.lastHackAt);
      if (hackTime >= oneHourAgo) {
        hasCritical = true;
        break; // Critical is highest priority
      } else if (hackTime >= twentyFourHoursAgo) {
        hasWarning = true;
      }
    }
  }

  if (hasCritical) return 'critical';
  if (hasWarning) return 'warning';
  return null;
}

function getRowClass(conn: ServerConnection, group: IpGroup): string {
  const classes: string[] = [];

  // Check watch status:
  // Orange: directly watched OR same account as watched OR direct association
  // Yellow: indirect association (IP-based)
  if (
    watchedCharacterIds.value.has(conn.characterId) ||
    watchedAccountIds.value.has(conn.accountId) ||
    directAssociatedIds.value.has(conn.characterId)
  ) {
    classes.push('row--watched');
  } else if (indirectAssociatedIds.value.has(conn.characterId)) {
    classes.push('row--watched-associated');
  }

  if (!isOutsideHome(conn)) {
    return classes.join(' '); // In home zone, only watched styling if applicable
  }

  const outsideCount = getOutsideHomeCount(group);
  const limit = getIpLimit(group.ip);
  if (outsideCount > limit) {
    classes.push('row--danger'); // Red theme: exceeds limit for this IP
  } else {
    classes.push('row--warning'); // Green theme: within limit for this IP
  }

  return classes.join(' ');
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

async function loadConnections(isRefresh = false) {
  if (isRefresh) {
    loading.value = true;
  }
  error.value = null;
  try {
    const response = await api.fetchAdminConnections();
    connections.value = response.connections;
    ipExemptions.value = response.ipExemptions;
    lastUpdated.value = new Date();

    // Sync IP group associations in the background
    syncIpAssociations(response.connections);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load server connections.';
  } finally {
    if (isRefresh) {
      loading.value = false;
    }
  }
}

async function syncIpAssociations(conns: typeof connections.value) {
  // Only sync if there are multi-account IP groups
  const ipGroups = new Map<string, typeof conns>();
  for (const conn of conns) {
    const existing = ipGroups.get(conn.ip);
    if (existing) {
      existing.push(conn);
    } else {
      ipGroups.set(conn.ip, [conn]);
    }
  }

  // Check if any IP group has multiple accounts
  let hasMultiAccountGroup = false;
  for (const group of ipGroups.values()) {
    const uniqueAccounts = new Set(group.map((c) => c.accountId));
    if (uniqueAccounts.size > 1) {
      hasMultiAccountGroup = true;
      break;
    }
  }

  if (!hasMultiAccountGroup) {
    return;
  }

  // Sync associations
  try {
    await api.syncIpGroupAssociations(
      conns.map((c) => ({
        characterId: c.characterId,
        characterName: c.characterName,
        accountId: c.accountId,
        ip: c.ip
      }))
    );
  } catch (err) {
    console.error('Failed to sync IP group associations:', err);
  }
}

async function refreshConnections() {
  await loadConnections(true);
}

async function loadAutoLinkSettings() {
  try {
    const settings = await api.getAutoLinkSettings();
    if (settings?.lastRunAt) {
      lastAutoLinkDate.value = new Date(settings.lastRunAt);
    }
  } catch (err) {
    console.error('Failed to load auto-link settings:', err);
  }
}

function startAutoLink() {
  showAutoLinkConfirmation.value = false;
  showAutoLinkProgress.value = true;
}

function handleAutoLinkClose() {
  showAutoLinkProgress.value = false;
  // Reload settings to get the updated last run time
  loadAutoLinkSettings();
}

function toggleAutoRefresh() {
  autoRefreshEnabled.value = !autoRefreshEnabled.value;
  if (autoRefreshEnabled.value) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    if (!loading.value) {
      loadConnections();
    }
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

onMounted(async () => {
  try {
    // Load connections, watch list (from shared store), and auto-link settings
    await Promise.all([
      loadConnections(),
      characterAdminStore.watchListLoaded ? Promise.resolve() : characterAdminStore.loadWatchList(),
      loadAutoLinkSettings()
    ]);
    if (autoRefreshEnabled.value) {
      startAutoRefresh();
    }
  } finally {
    loading.value = false;
  }
  // Add click outside listener for search results
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  stopAutoRefresh();
  document.removeEventListener('click', handleClickOutside);
  if (globalSearchTimeout) {
    clearTimeout(globalSearchTimeout);
  }
});
</script>

<style scoped>
.connections {
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
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.section-header__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.auto-link-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.auto-link-label {
  font-size: 0.65rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.connections-stats {
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
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18));
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

.stat-card__toggle {
  margin-top: 0.5rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 0.5rem;
  color: #bae6fd;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.stat-card__toggle:hover {
  background: rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.6);
}

/* Character Search Section */
.character-search-section {
  width: 100%;
}

.character-search {
  position: relative;
  width: 500px;
  margin: 0 auto;
}

.character-search__label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(148, 163, 184, 0.7);
  text-align: center;
  margin-bottom: 0.5rem;
}

.search-input-wrapper {
  position: relative;
}

.character-search__toggle {
  display: inline-flex;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  margin-top: 0.75rem;
}

.character-search__toggle-button {
  min-width: 120px;
  padding: 0.45rem 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.12s ease;
}

.character-search__toggle-button:hover {
  border-color: rgba(59, 130, 246, 0.45);
  color: #dbeafe;
  transform: translateY(-1px);
}

.character-search__toggle-button--active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(37, 99, 235, 0.2));
  border-color: rgba(96, 165, 250, 0.6);
  color: #eff6ff;
  box-shadow: 0 10px 30px rgba(37, 99, 235, 0.22);
}

.character-search__input {
  width: 100%;
  padding: 0.75rem 1rem;
  padding-right: 2.5rem;
  font-size: 0.95rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  color: #f8fafc;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.character-search__input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.character-search__input::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.search-spinner {
  position: absolute;
  right: 1rem;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.character-search__results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.5rem;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

.character-search__result {
  padding: 0.75rem 1rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  transition: background 0.15s ease;
}

.character-search__result:last-child {
  border-bottom: none;
}

.character-search__result:hover {
  background: rgba(59, 130, 246, 0.15);
}

.character-search__result .result-name {
  color: #f8fafc;
  font-weight: 500;
}

.result-name-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.result-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.35rem;
}

.result-item-icon img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.character-search__result .result-details {
  font-size: 0.8rem;
  color: #94a3b8;
}

.character-search__result .result-account {
  color: #64748b;
}

.character-search__no-results {
  padding: 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.875rem;
}

.card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.card__header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #e2e8f0;
}

.input--search {
  width: 280px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.input--search:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.ip-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ip-group {
  background: rgba(30, 41, 59, 0.3);
  border: 2px solid rgba(100, 116, 139, 0.5);
  border-radius: 0.75rem;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.1);
}

.ip-group--hack-warning {
  border: 2px solid rgba(249, 115, 22, 0.7);
  box-shadow: 0 0 12px rgba(249, 115, 22, 0.25);
}

.ip-group--hack-critical {
  border: 2px solid rgba(239, 68, 68, 0.8);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.35);
  animation: hackCriticalPulse 1.5s ease-in-out infinite;
}

@keyframes hackCriticalPulse {
  0%,
  100% {
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.35);
  }
  50% {
    box-shadow: 0 0 24px rgba(239, 68, 68, 0.5);
  }
}

.ip-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.ip-group__left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ip-group__count {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ip-group__outside-count {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.ip-group__outside-count--warning {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.ip-group__outside-count--danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.table-wrapper {
  overflow-x: auto;
}

.connections-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  table-layout: fixed;
}

.connections-table th,
.connections-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.connections-table th {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.3);
}

.connections-table tbody tr {
  transition: background 0.15s ease;
}

.connections-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.connections-table tbody tr.row--warning {
  background: rgba(34, 197, 94, 0.12);
  border-left: 3px solid rgba(34, 197, 94, 0.6);
}

.connections-table tbody tr.row--warning:hover {
  background: rgba(34, 197, 94, 0.2);
}

.connections-table tbody tr.row--warning td {
  color: #86efac;
}

.connections-table tbody tr.row--danger {
  background: rgba(239, 68, 68, 0.12);
  border-left: 3px solid rgba(239, 68, 68, 0.6);
}

.connections-table tbody tr.row--danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.connections-table tbody tr.row--danger td {
  color: #fca5a5;
}

/* Watched character styling - pulsing orange (using box-shadow for table compatibility) */
.connections-table tbody tr.row--watched {
  animation: watchPulse 2s ease-in-out infinite;
}

.connections-table tbody tr.row--watched td {
  box-shadow:
    inset 0 2px 0 rgba(249, 115, 22, 0.6),
    inset 0 -2px 0 rgba(249, 115, 22, 0.6);
}

.connections-table tbody tr.row--watched td:first-child {
  box-shadow:
    inset 3px 2px 0 rgba(249, 115, 22, 0.6),
    inset 0 -2px 0 rgba(249, 115, 22, 0.6);
}

.connections-table tbody tr.row--watched td:last-child {
  box-shadow:
    inset 0 2px 0 rgba(249, 115, 22, 0.6),
    inset -3px -2px 0 rgba(249, 115, 22, 0.6);
}

@keyframes watchPulse {
  0%,
  100% {
    background-color: rgba(249, 115, 22, 0.08);
  }
  50% {
    background-color: rgba(249, 115, 22, 0.18);
  }
}

/* Associated character styling - pulsing yellow */
.connections-table tbody tr.row--watched-associated {
  animation: watchAssociatedPulse 2s ease-in-out infinite;
}

.connections-table tbody tr.row--watched-associated td {
  box-shadow:
    inset 0 2px 0 rgba(234, 179, 8, 0.6),
    inset 0 -2px 0 rgba(234, 179, 8, 0.6);
}

.connections-table tbody tr.row--watched-associated td:first-child {
  box-shadow:
    inset 3px 2px 0 rgba(234, 179, 8, 0.6),
    inset 0 -2px 0 rgba(234, 179, 8, 0.6);
}

.connections-table tbody tr.row--watched-associated td:last-child {
  box-shadow:
    inset 0 2px 0 rgba(234, 179, 8, 0.6),
    inset -3px -2px 0 rgba(234, 179, 8, 0.6);
}

@keyframes watchAssociatedPulse {
  0%,
  100% {
    background-color: rgba(234, 179, 8, 0.08);
  }
  50% {
    background-color: rgba(234, 179, 8, 0.18);
  }
}

.connections-table tbody tr:last-child td {
  border-bottom: none;
}

.col-class {
  width: 100px;
}

.col-name {
  width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-level {
  width: 60px;
  text-align: center;
}

.col-zone {
  width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-guild {
  width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-last-kill {
  width: 175px;
  overflow: hidden;
}

.col-last-action {
  width: 150px;
  white-space: nowrap;
}

.col-hack-count {
  width: 135px;
  text-align: center;
}

.hack-risk-indicator {
  display: inline-block;
  min-width: 60px;
  margin-bottom: 0.25rem;
  padding: 0.15rem 0.35rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.hack-risk-indicator--normal {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.hack-risk-indicator--elevated {
  background: rgba(250, 204, 21, 0.15);
  color: #facc15;
}

.hack-risk-indicator--high {
  background: rgba(249, 115, 22, 0.18);
  color: #fb923c;
}

.hack-risk-indicator--critical {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.hack-count-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-radius: 4px;
  border: none;
  font-family: inherit;
}

.hack-count-badge--clickable {
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.hack-count-badge--clickable:hover {
  background-color: rgba(239, 68, 68, 0.3);
  transform: scale(1.05);
}

.hack-count-badge--clickable:active {
  transform: scale(0.95);
}

.last-kill-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  cursor: help;
}

.last-kill-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
  color: #e2e8f0;
}

.last-kill-time {
  font-size: 0.7rem;
  color: #64748b;
}

/* Trader Sub-group Styles */
.trader-subgroup {
  margin-top: 0.5rem;
  border-top: 1px dashed rgba(148, 163, 184, 0.2);
  background: rgba(45, 212, 191, 0.04);
}

.trader-subgroup__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(45, 212, 191, 0.08);
  border-bottom: 1px solid rgba(45, 212, 191, 0.15);
}

.trader-subgroup__label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #2dd4bf;
}

.trader-subgroup__count {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: rgba(45, 212, 191, 0.2);
  color: #2dd4bf;
}

.connections-table--traders th {
  background: rgba(45, 212, 191, 0.05);
}

/* Sub-group Icon Styles */
.subgroup-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.subgroup-icon--trader {
  color: #2dd4bf;
}

.subgroup-icon--fighter {
  color: #c08457;
}

/* Fighter Sub-group Styles */
.fighter-subgroup {
  margin-top: 0.5rem;
  border-top: 1px dashed rgba(148, 163, 184, 0.2);
  background: rgba(192, 132, 87, 0.06);
}

.fighter-subgroup__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(192, 132, 87, 0.1);
  border-bottom: 1px solid rgba(192, 132, 87, 0.2);
}

.fighter-subgroup__label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d6b08a;
}

.fighter-subgroup__count {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: rgba(192, 132, 87, 0.18);
  color: #d6b08a;
}

.connections-table--fighters th {
  background: rgba(192, 132, 87, 0.06);
}

.col-last-sale {
  width: 175px;
  overflow: hidden;
}

.col-total-sales {
  width: 150px;
  white-space: nowrap;
}

.last-sale-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  cursor: help;
}

.last-sale-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.last-sale-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 3px;
  border: 1px solid rgba(100, 116, 139, 0.25);
}

.last-sale-icon img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.last-sale-item {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  color: #e2e8f0;
}

.last-sale-details {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 24px;
}

.last-sale-price {
  font-size: 0.75rem;
  color: #2dd4bf;
  font-weight: 500;
}

.last-sale-time {
  font-size: 0.7rem;
  color: #64748b;
}

.total-sales-cell {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  background: transparent;
  border: none;
  padding: 0;
  font-family: inherit;
  text-align: left;
}

.total-sales-cell--clickable {
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  margin: -0.2rem -0.4rem;
  border-radius: 0.25rem;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.total-sales-cell--clickable:hover {
  background-color: rgba(45, 212, 191, 0.15);
}

.total-sales-cell--clickable:active {
  transform: scale(0.98);
}

.total-sales-amount {
  color: #2dd4bf;
  font-weight: 600;
}

.total-sales-count {
  font-size: 0.7rem;
  color: #94a3b8;
}

.last-action-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.event-type-badge {
  display: inline-block;
  padding: 0.15rem 0.35rem;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background-color: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-radius: 3px;
  white-space: nowrap;
}

.class-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.class-icon {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
}

.class-label {
  font-weight: 600;
  color: #bfdbfe;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.guild-tag {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.ip-address {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  color: #e2e8f0;
  background: rgba(59, 130, 246, 0.15);
  padding: 0.3rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.loading-message,
.empty-message {
  padding: 2rem;
  text-align: center;
}

.error-message {
  padding: 1rem;
  text-align: center;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.75rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
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

.item-ownership-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(6px);
}

.item-ownership-modal {
  width: min(980px, 100%);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.94));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 30px 80px rgba(2, 6, 23, 0.5);
}

.item-ownership-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.item-ownership-modal__title-group h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 1.35rem;
}

.item-ownership-modal__title-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.item-ownership-modal__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.75rem;
}

.item-ownership-modal__icon img {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.item-ownership-modal__eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(96, 165, 250, 0.82);
}

.item-ownership-modal__summary {
  margin: 0.75rem 0 0;
  color: #94a3b8;
  font-size: 0.88rem;
}

.item-ownership-modal__close {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.12s ease;
}

.item-ownership-modal__close:hover {
  background: rgba(148, 163, 184, 0.2);
  transform: scale(1.04);
}

.item-ownership-modal__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.item-ownership-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.item-ownership-content__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.item-ownership-table-wrapper {
  flex: 1;
  min-height: 0;
  max-height: min(60vh, 34rem);
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.35);
}

.item-ownership-table {
  width: 100%;
  border-collapse: collapse;
}

.item-ownership-table th,
.item-ownership-table td {
  padding: 0.85rem 0.9rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  text-align: left;
}

.item-ownership-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.72);
  background: rgba(15, 23, 42, 0.92);
}

.item-ownership-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.item-ownership-pagination {
  margin-top: 0;
  padding-top: 0.25rem;
}

.item-owner-link {
  padding: 0;
  border: none;
  background: transparent;
  color: #93c5fd;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.item-owner-link:hover {
  color: #dbeafe;
  text-decoration: underline;
}

.last-updated {
  text-align: center;
}

.btn {
  padding: 0.55rem 1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition:
    transform 0.1s ease,
    box-shadow 0.2s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .section-header__titles h1 {
    font-size: 1.4rem;
  }

  .section-header__actions {
    width: 100%;
  }

  .section-header__actions .btn {
    flex: 1;
  }

  .card {
    padding: 1rem;
  }

  .character-search {
    width: 100%;
  }

  .card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .input--search {
    width: 100%;
  }

  .ip-group__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .ip-group__left {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
  }

  .ip-address {
    font-size: 0.75rem;
  }

  .connections-table {
    font-size: 0.8rem;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.5rem 0.5rem;
  }

  .col-class {
    width: 70px;
  }

  .class-label {
    display: none;
  }

  .class-icon {
    width: 20px;
    height: 20px;
  }

  .col-level {
    width: 50px;
  }

  .col-zone {
    min-width: 120px;
  }

  .col-guild {
    min-width: 100px;
  }

  .col-last-kill {
    min-width: 100px;
    max-width: 150px;
  }

  .col-last-action {
    width: 130px;
  }

  .col-hack-count {
    width: 50px;
  }

  .col-last-sale {
    min-width: 100px;
    max-width: 150px;
  }

  .col-total-sales {
    width: 130px;
  }

  .character-search__toggle {
    flex-wrap: wrap;
  }

  .character-search__toggle-button {
    flex: 1;
  }

  .last-sale-icon {
    width: 16px;
    height: 16px;
  }

  .last-sale-icon img {
    width: 14px;
    height: 14px;
  }

  .last-sale-item {
    max-width: 80px;
    font-size: 0.7rem;
  }

  .last-sale-details {
    padding-left: 20px;
  }

  .last-sale-price {
    font-size: 0.65rem;
  }

  .last-sale-time {
    font-size: 0.6rem;
  }

  .total-sales-amount {
    font-size: 0.75rem;
  }

  .total-sales-count {
    font-size: 0.6rem;
  }

  .last-kill-name {
    max-width: 120px;
    font-size: 0.7rem;
  }

  .last-kill-time {
    font-size: 0.6rem;
  }

  .event-type-badge {
    padding: 0.1rem 0.25rem;
    font-size: 0.55rem;
  }

  .hack-count-badge {
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
  }

  .guild-tag {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
  }

  .pagination {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination__button {
    padding: 0.4rem 0.7rem;
    font-size: 0.65rem;
  }

  .pagination__label {
    width: 100%;
    text-align: center;
    order: -1;
    font-size: 0.75rem;
  }

  .stat-card__value {
    font-size: 1.4rem;
  }

  .item-ownership-modal-backdrop {
    padding: 0.75rem;
  }

  .item-ownership-modal__header {
    padding: 1rem;
  }

  .item-ownership-modal__body {
    padding: 1rem;
  }

  .item-ownership-modal__title-row {
    align-items: flex-start;
  }

  .item-ownership-content__meta {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .connections {
    gap: 1rem;
  }

  .section-header__titles h1 {
    font-size: 1.2rem;
  }

  .connections-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-card {
    padding: 0.75rem;
  }

  .stat-card__label {
    font-size: 0.65rem;
  }

  .stat-card__value {
    font-size: 1.2rem;
  }

  .card {
    padding: 0.75rem;
    border-radius: 0.75rem;
  }

  .card__header h2 {
    font-size: 1rem;
  }

  .item-ownership-modal__title-row {
    flex-direction: column;
  }

  .item-ownership-table th,
  .item-ownership-table td {
    padding: 0.7rem 0.55rem;
    font-size: 0.8rem;
  }

  .item-ownership-table-wrapper {
    max-height: min(55vh, 28rem);
  }

  .ip-group {
    border-radius: 0.5rem;
  }

  .ip-group__header {
    padding: 0.5rem 0.75rem;
  }

  .connections-table {
    font-size: 0.75rem;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.4rem 0.35rem;
  }

  .connections-table th {
    font-size: 0.6rem;
  }

  .col-guild,
  .col-last-kill,
  .col-last-action,
  .col-hack-count,
  .col-last-sale,
  .col-total-sales {
    display: none;
  }

  .class-icon {
    width: 18px;
    height: 18px;
  }

  .ip-address {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
  }

  .ip-group__count {
    font-size: 0.65rem;
  }

  .ip-group__outside-count {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
  }
}

@media (max-width: 360px) {
  .section-header__actions {
    flex-direction: column;
  }

  .connections-stats {
    grid-template-columns: 1fr;
  }

  .col-zone {
    min-width: 80px;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.35rem 0.25rem;
  }
}
</style>
