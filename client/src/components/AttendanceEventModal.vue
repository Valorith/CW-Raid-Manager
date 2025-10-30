<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h2>Attendance Snapshot</h2>
          <p class="muted">{{ formattedDate }}</p>
        </div>
        <button class="icon-button" type="button" @click="close">✕</button>
      </header>

      <section class="summary">
        <div class="summary__header">
          <p v-if="event.note" class="muted note">“{{ event.note }}”</p>
          <button
            v-if="canEdit"
            class="btn btn--primary"
            type="button"
            @click="upload"
          >
            Upload Snapshot
          </button>
        </div>
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
              <td class="name-cell">
                <span class="name-wrapper">
                  <CharacterLink class="name-link" :name="record.characterName" />
                  <span v-if="record.isMain" class="badge badge--main">Main</span>
                </span>
              </td>
              <td>{{ record.level ?? '—' }}</td>
              <td class="class-cell">
                <span v-if="record.class" class="class-wrapper">
                  <img
                    v-if="getCharacterClassIcon(record.class)"
                    :src="getCharacterClassIcon(record.class)"
                    :alt="formatClass(record.class)"
                    class="class-icon"
                  />
                  <span>{{ formatClass(record.class) }}</span>
                </span>
                <span v-else>—</span>
              </td>
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
import CharacterLink from './CharacterLink.vue';

import type { AttendanceRecordSummary } from '../services/api';
import type { AttendanceStatus, CharacterClass } from '../services/types';
import { characterClassLabels, getCharacterClassIcon } from '../services/types';

interface AttendanceEvent {
  id: string;
  createdAt: string;
  note?: string | null;
  records: AttendanceRecordSummary[];
}

const props = defineProps<{
  event: AttendanceEvent;
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'upload', attendanceEventId: string): void;
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

function upload() {
  emit('upload', props.event.id);
}

function formatClass(characterClass?: CharacterClass | null) {
  if (!characterClass) {
    return '—';
  }

  return characterClassLabels[characterClass] ?? characterClass;
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

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 1.1rem;
  border-radius: 0.65rem;
  border: 1px solid transparent;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
}

.btn--primary {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(14, 165, 233, 0.85));
  color: #f8fafc;
  box-shadow: 0 12px 28px rgba(14, 165, 233, 0.25);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.summary__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.note {
  font-style: italic;
  margin: 0;
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

.name-cell {
  white-space: nowrap;
}

.name-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.name-link {
  font-weight: 600;
}

.class-cell {
  white-space: nowrap;
}

.class-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.class-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.35));
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.badge--main {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.45), rgba(251, 191, 36, 0.25));
  color: #fef3c7;
  border-color: rgba(252, 211, 77, 0.4);
  box-shadow: 0 2px 6px rgba(250, 204, 21, 0.18);
}

tbody tr:nth-child(even) {
  background: rgba(148, 163, 184, 0.02);
}
</style>
