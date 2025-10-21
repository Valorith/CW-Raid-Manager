<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h2>Attendance Snapshot</h2>
          <p class="muted">{{ formattedDate }}</p>
        </div>
        <button class="icon-button" @click="close">✕</button>
      </header>

      <section class="summary">
        <p v-if="event.note" class="muted note">“{{ event.note }}”</p>
        <div class="summary__stats">
          <div
            v-for="status in visibleStatuses"
            :key="status"
            class="summary__stat"
          >
            <span class="label">{{ statusLabels[status] }}</span>
            <strong>{{ statusCounts[status] ?? 0 }}</strong>
          </div>
          <div class="summary__stat">
            <span class="label">Total</span>
            <strong>{{ event.records.length }}</strong>
          </div>
        </div>
      </section>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Level</th>
              <th>Class</th>
              <th>Status</th>
              <th>Group</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(record, index) in event.records" :key="index">
              <td>{{ record.characterName }}</td>
              <td>{{ record.level ?? '—' }}</td>
              <td>{{ record.class ?? '—' }}</td>
              <td>{{ formatStatus(record.status) }}</td>
              <td>{{ record.groupNumber ?? '—' }}</td>
              <td>{{ record.flags || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { AttendanceStatus } from '../services/types';

interface AttendanceRecord {
  characterName: string;
  level?: number | null;
  class?: string | null;
  status?: AttendanceStatus | null;
  groupNumber?: number | null;
  flags?: string | null;
}

interface AttendanceEvent {
  id: string;
  createdAt: string;
  note?: string | null;
  records: AttendanceRecord[];
}

const props = defineProps<{
  event: AttendanceEvent;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const formattedDate = computed(() =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(props.event.createdAt))
);

const statusLabels: Record<string, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  BENCHED: 'Benched',
  ABSENT: 'Absent'
};

const statusCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const record of props.event.records) {
    const key = record.status ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

const visibleStatuses = computed(() =>
  Object.keys(statusLabels).filter((status) => (statusCounts.value[status] ?? 0) > 0)
);

function close() {
  emit('close');
}

function formatStatus(status?: AttendanceStatus | null) {
  if (!status) {
    return '—';
  }

  return statusLabels[status] ?? status;
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 100;
}

.modal {
  width: min(720px, 100%);
  max-height: min(720px, 90vh);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: hidden;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.muted {
  color: #94a3b8;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.note {
  font-style: italic;
}

.summary__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.summary__stat {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary__stat .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #cbd5f5;
}

.summary__stat strong {
  font-size: 1.25rem;
  font-weight: 600;
}

.table-wrapper {
  overflow: auto;
  border-radius: 0.75rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

tbody tr:nth-child(even) {
  background: rgba(148, 163, 184, 0.02);
}
</style>
