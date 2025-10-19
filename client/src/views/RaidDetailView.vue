<template>
  <section v-if="raid" class="raid-detail">
    <header class="section-header">
      <div>
        <h1>{{ raid.name }}</h1>
        <p class="muted">
          {{ formatDate(raid.startTime) }} • Targets: {{ raid.targetZones.join(', ') }}
        </p>
      </div>
      <button class="btn" @click="fileInput?.click()">Upload Attendance</button>
      <input
        ref="fileInput"
        type="file"
        accept=".txt"
        hidden
        @change="handleFileUpload"
      />
    </header>

    <section class="card">
      <h2>Attendance Events</h2>
      <p v-if="attendanceLoading" class="muted">Loading attendance…</p>
      <p v-else-if="attendanceEvents.length === 0" class="muted">
        No attendance events have been recorded for this raid yet.
      </p>
      <ul class="attendance-list">
        <li v-for="event in attendanceEvents" :key="event.id" class="attendance-list__item">
          <div>
            <strong>{{ formatDate(event.createdAt) }}</strong>
            <span class="muted">{{ event.records.length }} attendees logged</span>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="rosterPreview" class="card">
      <header class="card__header">
        <div>
          <h2>Roster Preview</h2>
          <p class="muted">{{ rosterMeta?.filename }}</p>
        </div>
        <div class="actions">
          <button class="btn btn--outline" @click="discardPreview">Discard</button>
          <button class="btn" :disabled="submittingAttendance" @click="saveAttendance">
            {{ submittingAttendance ? 'Saving…' : 'Save Attendance' }}
          </button>
        </div>
      </header>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Name</th>
              <th>Level</th>
              <th>Class</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in rosterPreview" :key="index">
              <td>{{ entry.groupNumber ?? '–' }}</td>
              <td>{{ entry.characterName }}</td>
              <td>{{ entry.level ?? '–' }}</td>
              <td>{{ entry.class }}</td>
              <td>{{ entry.flags || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
  <p v-else class="muted">Loading raid…</p>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { api } from '../services/api';
import type { AttendanceRecordInput } from '../services/api';

const route = useRoute();
const raidId = route.params.raidId as string;

const raid = ref<any>(null);
const attendanceEvents = ref<any[]>([]);
const attendanceLoading = ref(false);
const rosterPreview = ref<AttendanceRecordInput[] | null>(null);
const rosterMeta = ref<{ filename: string; uploadedAt: string } | null>(null);
const submittingAttendance = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function loadRaid() {
  raid.value = await api.fetchRaid(raidId);
}

async function loadAttendance() {
  attendanceLoading.value = true;
  try {
    attendanceEvents.value = await api.fetchAttendance(raidId);
  } finally {
    attendanceLoading.value = false;
  }
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    return;
  }

  const file = target.files[0];
  try {
    const response = await api.uploadRoster(raidId, file);
    rosterPreview.value = response.data.preview as AttendanceRecordInput[];
    rosterMeta.value = response.data.meta;
  } finally {
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function discardPreview() {
  rosterPreview.value = null;
  rosterMeta.value = null;
}

async function saveAttendance() {
  if (!rosterPreview.value) {
    return;
  }

  submittingAttendance.value = true;
  try {
    await api.createAttendanceEvent(raidId, {
      note: `Imported from ${rosterMeta.value?.filename ?? 'roster file'}`,
      snapshot: {
        filename: rosterMeta.value?.filename,
        uploadedAt: rosterMeta.value?.uploadedAt
      },
      records: rosterPreview.value
    });
    discardPreview();
    loadAttendance();
  } finally {
    submittingAttendance.value = false;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

onMounted(() => {
  loadRaid();
  loadAttendance();
});
</script>

<style scoped>
.raid-detail {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.attendance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.attendance-list__item {
  background: rgba(30, 41, 59, 0.4);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-wrapper {
  overflow: auto;
  max-height: 320px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

th {
  font-weight: 600;
  color: #cbd5f5;
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
}

.muted {
  color: #94a3b8;
}

.actions {
  display: flex;
  gap: 0.75rem;
}
</style>
