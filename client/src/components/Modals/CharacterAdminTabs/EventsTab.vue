<template>
  <div class="events-tab">
    <!-- Filters -->
    <div class="filters-bar">
      <div class="filter-group">
        <label>Event Types</label>
        <select v-model="selectedEventTypes" multiple class="multi-select">
          <option v-for="et in store.eventTypes" :key="et.id" :value="et.id">
            {{ et.label }}
          </option>
        </select>
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
import { ref, onMounted } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import EventDataDisplay from '../../EventDataDisplay.vue';

const store = useCharacterAdminStore();

const selectedEventTypes = ref<number[]>([]);
const selectedZone = ref<number | undefined>(undefined);
const datePreset = ref('all');
const customStartDate = ref('');
const customEndDate = ref('');

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

onMounted(() => {
  // Events are loaded when the tab is activated
});
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

.multi-select {
  min-height: 80px;
  max-height: 120px;
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
