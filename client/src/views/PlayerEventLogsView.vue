<template>
  <section class="player-event-logs">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Player Event Logs</h1>
        <p class="muted">View and search player events from the EQEmu server.</p>
      </div>
      <div class="section-header__actions">
        <router-link to="/admin" class="btn btn--outline">
          Back to Admin
        </router-link>
        <button
          type="button"
          class="btn btn--outline"
          :disabled="loading"
          @click="() => refreshData()"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="event-stats">
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">Total Events</span>
        <strong class="stat-card__value">{{ formatNumber(stats.totalEvents) }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Unique Characters</span>
        <strong class="stat-card__value">{{ formatNumber(stats.uniqueCharacters) }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Last 24 Hours</span>
        <strong class="stat-card__value">{{ formatNumber(stats.recentActivity.last24Hours) }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Auto-Refresh</span>
        <strong class="stat-card__value">{{ autoRefreshEnabled ? 'ON' : 'OFF' }}</strong>
        <button
          type="button"
          class="stat-card__toggle"
          @click="toggleAutoRefresh"
        >
          {{ autoRefreshEnabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>

    <article class="card">
      <header class="card__header">
        <div class="card__header-left">
          <h2>Event Log</h2>
          <span class="muted small">{{ total }} events found</span>
        </div>
        <div class="card__header-right">
          <button
            type="button"
            class="btn btn--outline btn--small"
            @click="toggleFilters"
          >
            {{ showFilters ? 'Hide Filters' : 'Show Filters' }}
          </button>
        </div>
      </header>

      <div v-if="showFilters" class="filters">
        <div class="filters__row">
          <div class="filter-group">
            <label class="filter-label">Search</label>
            <input
              v-model="filters.search"
              type="search"
              class="input input--search"
              placeholder="Search events..."
              @input="debouncedSearch"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Character</label>
            <input
              v-model="filters.characterName"
              type="text"
              class="input"
              placeholder="Character name..."
              @input="debouncedSearch"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Zone</label>
            <select v-model="filters.zoneId" class="select" @change="applyFilters">
              <option :value="undefined">All Zones</option>
              <option v-for="zone in zones" :key="zone.zoneId" :value="zone.zoneId">
                {{ zone.zoneName }}
              </option>
            </select>
          </div>
        </div>

        <div class="filters__row">
          <div class="filter-group filter-group--event-types">
            <label class="filter-label">Event Types</label>
            <div class="searchable-dropdown" ref="eventTypeDropdownRef">
              <div class="dropdown-trigger" @click="toggleEventTypeDropdown">
                <div class="selected-tags">
                  <span v-if="filters.eventTypes.length === 0" class="placeholder">All Event Types</span>
                  <span
                    v-for="typeId in filters.eventTypes"
                    :key="typeId"
                    class="tag"
                  >
                    {{ getEventTypeLabel(typeId) }}
                    <button type="button" class="tag-remove" @click.stop="removeEventType(typeId)">&times;</button>
                  </span>
                </div>
                <span class="dropdown-arrow">&#9662;</span>
              </div>
              <div v-if="showEventTypeDropdown" class="dropdown-menu">
                <input
                  type="text"
                  v-model="eventTypeSearch"
                  placeholder="Search event types..."
                  class="dropdown-search"
                  @click.stop
                  ref="searchInputRef"
                />
                <div class="dropdown-options">
                  <div
                    v-for="et in filteredEventTypes"
                    :key="et.id"
                    class="dropdown-option"
                    :class="{ 'dropdown-option--selected': filters.eventTypes.includes(et.id) }"
                    @click.stop="toggleEventType(et.id)"
                  >
                    <span class="option-checkbox">{{ filters.eventTypes.includes(et.id) ? '☑' : '☐' }}</span>
                    <span class="option-label">{{ et.label }}</span>
                  </div>
                  <div v-if="filteredEventTypes.length === 0" class="dropdown-empty">
                    No matching event types
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="filter-group">
            <label class="filter-label">Date Range</label>
            <select v-model="dateRange" class="select" @change="applyDateRange">
              <option value="all">All Time</option>
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div v-if="dateRange === 'custom'" class="filter-group">
            <label class="filter-label">Start Date</label>
            <input
              v-model="filters.startDate"
              type="datetime-local"
              class="input"
              @change="applyFilters"
            />
          </div>
          <div v-if="dateRange === 'custom'" class="filter-group">
            <label class="filter-label">End Date</label>
            <input
              v-model="filters.endDate"
              type="datetime-local"
              class="input"
              @change="applyFilters"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Sort By</label>
            <select v-model="filters.sortBy" class="select" @change="applyFilters">
              <option value="created_at">Date/Time</option>
              <option value="character_name">Character</option>
              <option value="event_type_id">Event Type</option>
              <option value="zone_id">Zone</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Order</label>
            <select v-model="filters.sortOrder" class="select" @change="applyFilters">
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          <div class="filter-group filter-group--actions">
            <button type="button" class="btn btn--outline btn--small" @click="clearFilters">
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <GlobalLoadingSpinner v-if="showLoading" />
      <p v-else-if="error" class="error-message">
        {{ error }}
      </p>
      <p v-else-if="events.length === 0" class="muted empty-message">
        No events found matching your criteria.
      </p>

      <div v-else class="events-table-wrapper">
        <table class="events-table">
          <thead>
            <tr>
              <th class="col-time" @click="sortBy('created_at')">
                <span class="sortable">
                  Time
                  <span v-if="filters.sortBy === 'created_at'" class="sort-indicator">
                    {{ filters.sortOrder === 'asc' ? '▲' : '▼' }}
                  </span>
                </span>
              </th>
              <th class="col-character" @click="sortBy('character_name')">
                <span class="sortable">
                  Character
                  <span v-if="filters.sortBy === 'character_name'" class="sort-indicator">
                    {{ filters.sortOrder === 'asc' ? '▲' : '▼' }}
                  </span>
                </span>
              </th>
              <th class="col-event" @click="sortBy('event_type_id')">
                <span class="sortable">
                  Event
                  <span v-if="filters.sortBy === 'event_type_id'" class="sort-indicator">
                    {{ filters.sortOrder === 'asc' ? '▲' : '▼' }}
                  </span>
                </span>
              </th>
              <th class="col-zone" @click="sortBy('zone_id')">
                <span class="sortable">
                  Zone
                  <span v-if="filters.sortBy === 'zone_id'" class="sort-indicator">
                    {{ filters.sortOrder === 'asc' ? '▲' : '▼' }}
                  </span>
                </span>
              </th>
              <th class="col-details">Details</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(event, index) in events" :key="`${event.id}-${index}`">
              <tr :class="getEventRowClass(event)">
                <td class="col-time">
                  <span class="time-display">{{ formatTime(event.createdAt) }}</span>
                  <span class="date-display muted">{{ formatDate(event.createdAt) }}</span>
                </td>
                <td class="col-character">
                  <CharacterLink :name="event.characterName" :admin-mode="true" />
                </td>
                <td class="col-event">
                  <span :class="['event-badge', getEventBadgeClass(event.eventTypeName)]">
                    {{ event.eventTypeLabel }}
                  </span>
                </td>
                <td class="col-zone">{{ event.zoneName }}</td>
                <td class="col-details">
                  <button
                    v-if="event.eventData"
                    type="button"
                    class="btn btn--outline btn--tiny"
                    @click="toggleEventDetails(index)"
                  >
                    {{ expandedEventId === String(index) ? 'Hide' : 'View' }}
                  </button>
                  <span v-else class="muted">-</span>
                </td>
              </tr>
              <tr v-if="expandedEventId === String(index) && event.eventData" class="details-row">
                <td colspan="5" class="event-details-cell">
                  <div class="event-details">
                    <div class="event-details__header">
                      <h4>Event Details</h4>
                      <button
                        type="button"
                        class="btn btn--outline btn--tiny"
                        @click="toggleRawJson(index)"
                      >
                        {{ showRawJson[String(index)] ? 'Formatted' : 'Raw JSON' }}
                      </button>
                    </div>
                    <div v-if="showRawJson[String(index)]" class="event-details__json">
                      <pre>{{ JSON.stringify(event.eventData, null, 2) }}</pre>
                    </div>
                    <div v-else class="event-details__formatted">
                      <EventDataDisplay :event="event" />
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          class="pagination__button"
          :disabled="page === 1"
          @click="setPage(page - 1)"
        >
          Previous
        </button>
        <div class="pagination__info">
          <span class="pagination__label">Page {{ page }} of {{ totalPages }}</span>
          <select v-model.number="filters.pageSize" class="select select--small" @change="applyFilters">
            <option :value="25">25 per page</option>
            <option :value="50">50 per page</option>
            <option :value="100">100 per page</option>
          </select>
        </div>
        <button
          class="pagination__button"
          :disabled="page === totalPages"
          @click="setPage(page + 1)"
        >
          Next
        </button>
      </div>
    </article>

    <p v-if="lastUpdated" class="last-updated muted small">
      Last updated: {{ formatLastUpdated }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch, nextTick } from 'vue';
import CharacterLink from '../components/CharacterLink.vue';
import EventDataDisplay from '../components/EventDataDisplay.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import {
  api,
  type PlayerEventLog,
  type PlayerEventLogStats,
  type PlayerEventType,
  type PlayerEventZone
} from '../services/api';

const loading = ref(true);
const showLoading = useMinimumLoading(loading);
const error = ref<string | null>(null);
const events = ref<PlayerEventLog[]>([]);
const total = ref(0);
const page = ref(1);
const totalPages = ref(1);
const autoRefreshEnabled = ref(false);
const lastUpdated = ref<Date | null>(null);
const showFilters = ref(true);
const expandedEventId = ref<string | null>(null);
const showRawJson = reactive<Record<string, boolean>>({});
const showEventTypeDropdown = ref(false);
const eventTypeDropdownRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const eventTypeSearch = ref('');

const stats = ref<PlayerEventLogStats>({
  totalEvents: 0,
  uniqueCharacters: 0,
  uniqueZones: 0,
  eventTypeCounts: [],
  recentActivity: {
    last24Hours: 0,
    last7Days: 0
  }
});

const eventTypes = ref<PlayerEventType[]>([]);
const zones = ref<PlayerEventZone[]>([]);

const filters = reactive({
  search: '',
  characterName: '',
  eventTypes: [] as number[],
  zoneId: undefined as number | undefined,
  startDate: '',
  endDate: '',
  sortBy: 'created_at' as 'created_at' | 'character_name' | 'event_type_id' | 'zone_id',
  sortOrder: 'desc' as 'asc' | 'desc',
  pageSize: 25
});

const dateRange = ref('all');

let refreshInterval: ReturnType<typeof setInterval> | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

const formatLastUpdated = computed(() => {
  if (!lastUpdated.value) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(lastUpdated.value);
});

const filteredEventTypes = computed(() => {
  if (!eventTypeSearch.value) {
    return eventTypes.value;
  }
  const search = eventTypeSearch.value.toLowerCase();
  return eventTypes.value.filter(et =>
    et.label.toLowerCase().includes(search) ||
    et.name.toLowerCase().includes(search)
  );
});

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

function formatTime(dateStr: string): string {
  // Parse the MySQL datetime string directly to avoid timezone conversion issues
  // Format: "2025-12-22 15:37:00" or ISO format
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return dateStr;
  }

  let hours = parseInt(match[4], 10);
  const minutes = match[5];
  const seconds = match[6];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

function formatDate(dateStr: string): string {
  // Parse the MySQL datetime string directly to avoid timezone conversion issues
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return dateStr;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[parseInt(match[2], 10) - 1];
  const day = parseInt(match[3], 10);

  return `${month} ${day}`;
}

function getEventRowClass(event: PlayerEventLog): string {
  const dangerEvents = ['DEATH', 'POSSIBLE_HACK', 'ITEM_DESTROY'];
  const successEvents = ['LEVEL_GAIN', 'AA_GAIN', 'LOOT_ITEM', 'COMBINE_SUCCESS', 'TASK_COMPLETE', 'DISCOVER_ITEM'];

  if (dangerEvents.includes(event.eventTypeName)) {
    return 'row--danger';
  }
  if (successEvents.includes(event.eventTypeName)) {
    return 'row--success';
  }
  return '';
}

function getEventBadgeClass(eventTypeName: string): string {
  const dangerEvents = ['DEATH', 'POSSIBLE_HACK', 'ITEM_DESTROY', 'LEVEL_LOSS', 'COMBINE_FAILURE'];
  const successEvents = ['LEVEL_GAIN', 'AA_GAIN', 'AA_PURCHASE', 'LOOT_ITEM', 'COMBINE_SUCCESS', 'TASK_COMPLETE', 'DISCOVER_ITEM', 'FORAGE_SUCCESS', 'FISH_SUCCESS'];
  const socialEvents = ['GROUP_JOIN', 'GROUP_LEAVE', 'RAID_JOIN', 'RAID_LEAVE', 'TRADE', 'GIVE_ITEM', 'SAY'];
  const combatEvents = ['KILLED_NPC', 'KILLED_NAMED_NPC', 'KILLED_RAID_NPC'];

  if (dangerEvents.includes(eventTypeName)) {
    return 'event-badge--danger';
  }
  if (successEvents.includes(eventTypeName)) {
    return 'event-badge--success';
  }
  if (socialEvents.includes(eventTypeName)) {
    return 'event-badge--social';
  }
  if (combatEvents.includes(eventTypeName)) {
    return 'event-badge--combat';
  }
  return 'event-badge--neutral';
}

function toggleFilters() {
  showFilters.value = !showFilters.value;
}

function toggleEventTypeDropdown() {
  showEventTypeDropdown.value = !showEventTypeDropdown.value;
  if (showEventTypeDropdown.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else {
    eventTypeSearch.value = '';
  }
}

function handleClickOutside(event: MouseEvent) {
  if (eventTypeDropdownRef.value && !eventTypeDropdownRef.value.contains(event.target as Node)) {
    showEventTypeDropdown.value = false;
    eventTypeSearch.value = '';
  }
}

function getEventTypeLabel(typeId: number): string {
  const eventType = eventTypes.value.find(et => et.id === typeId);
  return eventType?.label || `Type ${typeId}`;
}

function removeEventType(typeId: number) {
  const index = filters.eventTypes.indexOf(typeId);
  if (index !== -1) {
    filters.eventTypes.splice(index, 1);
    applyFilters();
  }
}

function toggleEventDetails(eventId: number | string) {
  const id = String(eventId);
  if (expandedEventId.value === id) {
    expandedEventId.value = null;
  } else {
    expandedEventId.value = id;
  }
}

function toggleRawJson(eventId: number | string) {
  const id = String(eventId);
  showRawJson[id] = !showRawJson[id];
}

function toggleEventType(eventTypeId: number) {
  const index = filters.eventTypes.indexOf(eventTypeId);
  if (index === -1) {
    filters.eventTypes.push(eventTypeId);
  } else {
    filters.eventTypes.splice(index, 1);
  }
  applyFilters();
}

function applyDateRange() {
  const now = new Date();

  switch (dateRange.value) {
    case '1h':
      filters.startDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      filters.endDate = '';
      break;
    case '24h':
      filters.startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      filters.endDate = '';
      break;
    case '7d':
      filters.startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      filters.endDate = '';
      break;
    case '30d':
      filters.startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      filters.endDate = '';
      break;
    case 'all':
      filters.startDate = '';
      filters.endDate = '';
      break;
    // 'custom' keeps whatever the user sets
  }

  if (dateRange.value !== 'custom') {
    applyFilters();
  }
}

function clearFilters() {
  filters.search = '';
  filters.characterName = '';
  filters.eventTypes = [];
  filters.zoneId = undefined;
  filters.startDate = '';
  filters.endDate = '';
  filters.sortBy = 'created_at';
  filters.sortOrder = 'desc';
  dateRange.value = 'all';
  page.value = 1;
  loadEvents(true);
}

function sortBy(column: typeof filters.sortBy) {
  if (filters.sortBy === column) {
    filters.sortOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    filters.sortBy = column;
    filters.sortOrder = 'desc';
  }
  applyFilters();
}

function setPage(newPage: number) {
  page.value = Math.min(Math.max(1, newPage), totalPages.value);
  loadEvents(true);
}

function applyFilters() {
  page.value = 1;
  loadEvents(true);
}

function debouncedSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  searchTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
}

async function loadEvents(isRefresh = false) {
  if (isRefresh) {
    loading.value = true;
  }
  error.value = null;
  // Reset expanded state when loading new events to prevent stale references
  expandedEventId.value = null;

  try {
    const response = await api.fetchPlayerEventLogs({
      page: page.value,
      pageSize: filters.pageSize,
      characterName: filters.characterName || undefined,
      eventTypes: filters.eventTypes.length > 0 ? filters.eventTypes : undefined,
      zoneId: filters.zoneId,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      search: filters.search || undefined
    });

    events.value = response.events;
    total.value = response.total;
    page.value = response.page;
    totalPages.value = response.totalPages;
    lastUpdated.value = new Date();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load player event logs.';
  } finally {
    if (isRefresh) {
      loading.value = false;
    }
  }
}

async function loadStats() {
  try {
    stats.value = await api.fetchPlayerEventLogStats();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadMetadata() {
  try {
    const [types, zoneList] = await Promise.all([
      api.fetchPlayerEventTypes(),
      api.fetchPlayerEventZones()
    ]);
    eventTypes.value = types;
    zones.value = zoneList;
  } catch (err) {
    console.error('Failed to load metadata:', err);
  }
}

async function refreshData(isRefresh = false) {
  await Promise.all([loadEvents(isRefresh), loadStats()]);
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
      refreshData(true);
    }
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

watch(() => filters.pageSize, () => {
  applyFilters();
});

onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  try {
    await loadMetadata();
    await refreshData();
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  stopAutoRefresh();
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
});
</script>

<style scoped>
.player-event-logs {
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
}

.event-stats {
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
  transition: transform 0.12s ease, box-shadow 0.2s ease, border-color 0.2s ease;
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
  transition: background 0.2s ease, border-color 0.2s ease;
}

.stat-card__toggle:hover {
  background: rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.6);
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

.card__header-left {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card__header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #e2e8f0;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: rgba(30, 41, 59, 0.4);
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.filters__row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 180px;
}

.filter-group--wide {
  flex: 1;
  min-width: 100%;
}

.filter-group--actions {
  align-self: flex-end;
  min-width: auto;
}

.filter-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

/* Searchable dropdown styles */
.filter-group--event-types {
  min-width: 200px;
  max-width: 350px;
  flex: 1;
}

.searchable-dropdown {
  position: relative;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  min-height: 38px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dropdown-trigger:hover {
  border-color: rgba(59, 130, 246, 0.45);
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.placeholder {
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.9rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-remove {
  background: none;
  border: none;
  color: #60a5fa;
  cursor: pointer;
  padding: 0;
  font-size: 0.875rem;
  line-height: 1;
  opacity: 0.7;
}

.tag-remove:hover {
  opacity: 1;
}

.dropdown-arrow {
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 220px;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  z-index: 100;
  max-height: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dropdown-search {
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  background: transparent;
  color: #f8fafc;
  font-size: 0.875rem;
  outline: none;
}

.dropdown-search::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.dropdown-options {
  overflow-y: auto;
  flex: 1;
  max-height: 250px;
}

.dropdown-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.1s ease;
}

.dropdown-option:hover {
  background: rgba(59, 130, 246, 0.15);
}

.dropdown-option--selected {
  background: rgba(59, 130, 246, 0.1);
}

.option-checkbox {
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.875rem;
}

.dropdown-option--selected .option-checkbox {
  color: #3b82f6;
}

.option-label {
  color: #e2e8f0;
  font-size: 0.875rem;
}

.dropdown-empty {
  padding: 1rem;
  text-align: center;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.875rem;
}

.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.input--search {
  width: 100%;
}

.select {
  appearance: none;
  width: 100%;
  padding: 0.5rem 2.5rem 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6)
    url('data:image/svg+xml,%3Csvg width="10" height="6" viewBox="0 0 10 6" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath fill="%23cbd5f5" d="M5 6 0 0h10L5 6Z"/%3E%3C/svg%3E')
    no-repeat right 0.75rem center/10px 6px;
  color: #f8fafc;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.select--small {
  padding: 0.35rem 2rem 0.35rem 0.6rem;
  font-size: 0.8rem;
  min-width: 120px;
  width: auto;
}

.events-table-wrapper {
  overflow-x: auto;
}

.events-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.events-table th,
.events-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.events-table th {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.3);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
}

.events-table th:hover {
  background: rgba(59, 130, 246, 0.1);
}

.sortable {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.sort-indicator {
  font-size: 0.6rem;
  color: #bae6fd;
}

.events-table tbody tr {
  transition: background 0.15s ease;
}

.events-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.events-table tbody tr.row--danger {
  background: rgba(239, 68, 68, 0.08);
}

.events-table tbody tr.row--danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

.events-table tbody tr.row--success {
  background: rgba(34, 197, 94, 0.08);
}

.events-table tbody tr.row--success:hover {
  background: rgba(34, 197, 94, 0.15);
}

.events-table tbody tr.details-row {
  background: transparent;
}

.events-table tbody tr.details-row:hover {
  background: transparent;
}

.col-time {
  width: 120px;
}

.col-character {
  min-width: 140px;
}

.col-event {
  min-width: 150px;
}

.col-zone {
  min-width: 160px;
}

.col-details {
  width: 80px;
  text-align: center;
}

.time-display {
  display: block;
  font-weight: 500;
  color: #e2e8f0;
}

.date-display {
  display: block;
  font-size: 0.75rem;
}

.event-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.event-badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.event-badge--success {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.event-badge--danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.event-badge--social {
  background: rgba(168, 85, 247, 0.2);
  color: #d8b4fe;
}

.event-badge--combat {
  background: rgba(249, 115, 22, 0.2);
  color: #fdba74;
}

.event-details-cell {
  padding: 0 !important;
  background: rgba(15, 23, 42, 0.4);
}

.event-details {
  padding: 1rem 1.5rem;
  border-left: 3px solid rgba(59, 130, 246, 0.5);
}

.event-details__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.event-details__header h4 {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #bae6fd;
}

.event-details__json pre {
  margin: 0;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0.5rem;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.event-details__formatted {
  padding: 0.5rem;
  background: rgba(15, 23, 42, 0.3);
  border-radius: 0.5rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.pagination__info {
  display: flex;
  align-items: center;
  gap: 1rem;
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
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
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

.last-updated {
  text-align: center;
}

.btn {
  padding: 0.55rem 1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
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

.btn--small {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
}

.btn--tiny {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.9rem;
}

@media (max-width: 1024px) {
  .filter-group {
    min-width: 150px;
  }
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

  .card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filters__row {
    flex-direction: column;
  }

  .filter-group {
    width: 100%;
    min-width: 100%;
  }

  .filter-group--actions {
    width: 100%;
  }

  .events-table {
    font-size: 0.8rem;
  }

  .events-table th,
  .events-table td {
    padding: 0.5rem 0.5rem;
  }

  .col-zone {
    display: none;
  }

  .col-time {
    width: 90px;
  }

  .event-badge {
    font-size: 0.6rem;
    padding: 0.2rem 0.4rem;
  }

  .pagination {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination__info {
    width: 100%;
    justify-content: center;
    order: -1;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-card__value {
    font-size: 1.4rem;
  }
}

@media (max-width: 480px) {
  .player-event-logs {
    gap: 1rem;
  }

  .section-header__titles h1 {
    font-size: 1.2rem;
  }

  .event-stats {
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

  .events-table {
    font-size: 0.75rem;
  }

  .events-table th,
  .events-table td {
    padding: 0.4rem 0.35rem;
  }

  .col-details {
    display: none;
  }

  .time-display {
    font-size: 0.75rem;
  }

  .date-display {
    font-size: 0.65rem;
  }
}
</style>
