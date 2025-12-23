<template>
  <div class="events-tab">
    <!-- Filters -->
    <div class="filters-bar">
      <div class="filter-group filter-group--event-types">
        <label>Event Types</label>
        <div class="searchable-dropdown" ref="dropdownRef">
          <div class="dropdown-trigger" @click="toggleDropdown">
            <div class="selected-tags">
              <span v-if="selectedEventTypes.length === 0" class="placeholder">All Event Types</span>
              <span
                v-for="typeId in selectedEventTypes"
                :key="typeId"
                class="tag"
              >
                {{ getEventTypeLabel(typeId) }}
                <button type="button" class="tag-remove" @click.stop="removeEventType(typeId)">&times;</button>
              </span>
            </div>
            <span class="dropdown-arrow">&#9662;</span>
          </div>
          <div v-if="dropdownOpen" class="dropdown-menu">
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
                :class="{ 'dropdown-option--selected': selectedEventTypes.includes(et.id) }"
                @click.stop="toggleEventType(et.id)"
              >
                <span class="option-checkbox">{{ selectedEventTypes.includes(et.id) ? '☑' : '☐' }}</span>
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
        <label>Zone</label>
        <select v-model="selectedZone" class="form-select">
          <option :value="undefined">All Zones</option>
          <option v-for="zone in store.eventZones" :key="zone.zoneId" :value="zone.zoneId">
            {{ zone.zoneName }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label>Date Range</label>
        <select v-model="datePreset" class="form-select" @change="applyDatePreset">
          <option value="all">All Time</option>
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div v-if="datePreset === 'custom'" class="filter-group filter-group--dates">
        <div>
          <label>From</label>
          <input type="datetime-local" v-model="customStartDate" class="form-input" />
        </div>
        <div>
          <label>To</label>
          <input type="datetime-local" v-model="customEndDate" class="form-input" />
        </div>
      </div>

      <button class="btn btn--primary" @click="applyFilters">Apply Filters</button>
      <button class="btn btn--secondary" @click="resetFilters">Reset</button>
    </div>

    <!-- Loading -->
    <div v-if="store.eventsState.loading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading events...</p>
    </div>

    <!-- Events Table -->
    <template v-else>
      <div class="events-summary">
        Showing {{ store.eventsState.events.length }} of {{ store.eventsState.total }} events
      </div>

      <div class="events-table-wrapper">
        <table class="events-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event Type</th>
              <th>Zone</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in store.eventsState.events" :key="event.id">
              <td class="col-time">{{ formatDate(event.createdAt) }}</td>
              <td class="col-type">
                <span class="event-badge" :class="getEventBadgeClass(event.eventTypeName)">
                  {{ event.eventTypeLabel }}
                </span>
              </td>
              <td class="col-zone">{{ event.zoneName }}</td>
              <td class="col-details">
                <EventDataDisplay :event="event" />
              </td>
            </tr>
            <tr v-if="store.eventsState.events.length === 0">
              <td colspan="4" class="no-data">No events found</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="store.eventsState.totalPages > 1" class="pagination">
        <button
          class="btn btn--small"
          :disabled="store.eventsState.page <= 1"
          @click="changePage(store.eventsState.page - 1)"
        >
          Previous
        </button>
        <span class="page-info">
          Page {{ store.eventsState.page }} of {{ store.eventsState.totalPages }}
        </span>
        <button
          class="btn btn--small"
          :disabled="store.eventsState.page >= store.eventsState.totalPages"
          @click="changePage(store.eventsState.page + 1)"
        >
          Next
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import EventDataDisplay from '../../EventDataDisplay.vue';

const store = useCharacterAdminStore();

const selectedEventTypes = ref<number[]>([]);
const selectedZone = ref<number | undefined>(undefined);
const datePreset = ref('all');
const customStartDate = ref('');
const customEndDate = ref('');

// Searchable dropdown state
const dropdownOpen = ref(false);
const eventTypeSearch = ref('');
const dropdownRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const filteredEventTypes = computed(() => {
  if (!eventTypeSearch.value) {
    return store.eventTypes;
  }
  const search = eventTypeSearch.value.toLowerCase();
  return store.eventTypes.filter(et =>
    et.label.toLowerCase().includes(search) ||
    et.name.toLowerCase().includes(search)
  );
});

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
  if (dropdownOpen.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else {
    eventTypeSearch.value = '';
  }
}

function closeDropdown() {
  dropdownOpen.value = false;
  eventTypeSearch.value = '';
}

function toggleEventType(typeId: number) {
  const index = selectedEventTypes.value.indexOf(typeId);
  if (index === -1) {
    selectedEventTypes.value.push(typeId);
  } else {
    selectedEventTypes.value.splice(index, 1);
  }
}

function removeEventType(typeId: number) {
  const index = selectedEventTypes.value.indexOf(typeId);
  if (index !== -1) {
    selectedEventTypes.value.splice(index, 1);
  }
}

function getEventTypeLabel(typeId: number): string {
  const eventType = store.eventTypes.find(et => et.id === typeId);
  return eventType?.label || `Type ${typeId}`;
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getEventBadgeClass(eventTypeName: string): string {
  const dangerEvents = ['DEATH', 'POSSIBLE_HACK', 'ITEM_DESTROY', 'LEVEL_LOSS', 'COMBINE_FAILURE'];
  const successEvents = ['LEVEL_GAIN', 'AA_GAIN', 'AA_PURCHASE', 'LOOT_ITEM', 'COMBINE_SUCCESS', 'TASK_COMPLETE', 'DISCOVER_ITEM', 'FORAGE_SUCCESS', 'FISH_SUCCESS'];
  const socialEvents = ['GROUP_JOIN', 'GROUP_LEAVE', 'RAID_JOIN', 'RAID_LEAVE', 'TRADE', 'GIVE_ITEM', 'SAY'];
  const combatEvents = ['KILLED_NPC', 'KILLED_NAMED_NPC', 'KILLED_RAID_NPC'];

  if (dangerEvents.includes(eventTypeName)) return 'event-badge--danger';
  if (successEvents.includes(eventTypeName)) return 'event-badge--success';
  if (socialEvents.includes(eventTypeName)) return 'event-badge--social';
  if (combatEvents.includes(eventTypeName)) return 'event-badge--combat';
  return 'event-badge--neutral';
}

function applyDatePreset() {
  if (datePreset.value === 'custom') return;

  const now = new Date();
  let startDate: Date | undefined;

  switch (datePreset.value) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  if (startDate) {
    customStartDate.value = startDate.toISOString().slice(0, 16);
    customEndDate.value = now.toISOString().slice(0, 16);
  } else {
    customStartDate.value = '';
    customEndDate.value = '';
  }
}

function applyFilters() {
  store.updateEventsFilters({
    eventTypes: selectedEventTypes.value.length > 0 ? selectedEventTypes.value : undefined,
    zoneId: selectedZone.value,
    startDate: customStartDate.value ? new Date(customStartDate.value).toISOString() : undefined,
    endDate: customEndDate.value ? new Date(customEndDate.value).toISOString() : undefined
  });
}

function resetFilters() {
  selectedEventTypes.value = [];
  selectedZone.value = undefined;
  datePreset.value = 'all';
  customStartDate.value = '';
  customEndDate.value = '';
  store.updateEventsFilters({
    eventTypes: undefined,
    zoneId: undefined,
    startDate: undefined,
    endDate: undefined
  });
}

function changePage(page: number) {
  store.setEventsPage(page);
}
</script>

<style scoped lang="scss">
.events-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  label {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &--dates {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;

    > div {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
}

.form-select,
.form-input {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  color: #f8fafc;
  padding: 0.5rem;
  font-size: 0.875rem;
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
}

// Searchable dropdown styles
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
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  padding: 0.375rem 0.5rem;
  min-height: 38px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: #475569;
  }
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.placeholder {
  color: #64748b;
  font-size: 0.875rem;
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

  &:hover {
    opacity: 1;
  }
}

.dropdown-arrow {
  color: #64748b;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  z-index: 100;
  max-height: 300px;
  display: flex;
  flex-direction: column;
}

.dropdown-search {
  padding: 0.5rem;
  border: none;
  border-bottom: 1px solid #334155;
  background: transparent;
  color: #f8fafc;
  font-size: 0.875rem;
  outline: none;

  &::placeholder {
    color: #64748b;
  }
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

  &:hover {
    background: #334155;
  }

  &--selected {
    background: rgba(59, 130, 246, 0.1);
  }
}

.option-checkbox {
  color: #64748b;
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
  color: #64748b;
  font-size: 0.875rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s ease;

  &--primary {
    background: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
    }
  }

  &--secondary {
    background: #334155;
    color: #e2e8f0;

    &:hover {
      background: #475569;
    }
  }

  &--small {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: #94a3b8;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.events-summary {
  font-size: 0.875rem;
  color: #94a3b8;
}

.events-table-wrapper {
  overflow-x: auto;
}

.events-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #334155;
  }

  th {
    background: #0f172a;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  td {
    color: #e2e8f0;
    font-size: 0.875rem;
  }

  tbody tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .col-time {
    white-space: nowrap;
    color: #94a3b8;
    font-size: 0.75rem;
  }

  .col-type {
    white-space: nowrap;
  }

  .col-zone {
    white-space: nowrap;
  }

  .col-details {
    max-width: 400px;
  }

  .no-data {
    text-align: center;
    color: #64748b;
    padding: 2rem;
  }
}

.event-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;

  &--danger {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  &--success {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  &--social {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }

  &--combat {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  &--neutral {
    background: rgba(100, 116, 139, 0.2);
    color: #94a3b8;
  }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
}

.page-info {
  font-size: 0.875rem;
  color: #94a3b8;
}
</style>
