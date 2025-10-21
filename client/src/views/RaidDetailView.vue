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

    <section class="card raid-timing">
      <header class="card__header">
        <div>
          <h2>Raid Timing</h2>
          <p class="muted">Track actual raid start and end times.</p>
        </div>
        <div class="actions timing-actions">
          <button
            class="btn"
            :disabled="startingRaid || !!raid?.startedAt"
            @click="handleStartRaid"
          >
            {{ startingRaid ? 'Starting…' : raid?.startedAt ? 'Started' : 'Start Raid' }}
          </button>
          <button
            class="btn btn--outline"
            :disabled="endingRaid || !raid?.startedAt || !!raid?.endedAt"
            @click="handleEndRaid"
          >
            {{ endingRaid ? 'Ending…' : raid?.endedAt ? 'Ended' : 'End Raid' }}
          </button>
        </div>
      </header>

      <div class="timing-grid">
        <div class="timing-field">
          <span class="label">Scheduled Start</span>
          <p class="muted">{{ formatDate(raid.startTime) }}</p>
        </div>
        <div class="timing-field">
          <label for="actual-start">Actual Start</label>
          <input
            id="actual-start"
            v-model="startedAtInput"
            type="datetime-local"
            class="timing-input"
          />
        </div>
        <div class="timing-field">
          <label for="actual-end">Actual End</label>
          <input
            id="actual-end"
            v-model="endedAtInput"
            type="datetime-local"
            class="timing-input"
          />
        </div>
      </div>

      <div class="timing-controls">
        <button class="btn btn--outline" :disabled="!timesDirty || savingTimes" @click="resetTiming">
          Reset
        </button>
        <button class="btn" :disabled="!timesDirty || savingTimes" @click="saveTiming">
          {{ savingTimes ? 'Saving…' : 'Save Times' }}
        </button>
      </div>
    </section>

    <section class="card">
      <h2>Attendance Events</h2>
      <p v-if="attendanceLoading" class="muted">Loading attendance…</p>
      <p v-else-if="attendanceEvents.length === 0" class="muted">
        No attendance events have been recorded for this raid yet.
      </p>
      <ul class="attendance-list">
        <li
          v-for="event in attendanceEvents"
          :key="event.id"
          class="attendance-list__item"
          @click="openAttendanceEvent(event)"
        >
          <div>
            <strong>{{ formatDate(event.createdAt) }}</strong>
            <span class="muted attendees">({{ event.records.length }} attendees logged)</span>
          </div>
          <span class="muted arrow">View</span>
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

  <AttendanceEventModal
    v-if="selectedAttendanceEvent"
    :event="selectedAttendanceEvent"
    @close="closeAttendanceEvent"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import AttendanceEventModal from '../components/AttendanceEventModal.vue';
import { api } from '../services/api';
import type { AttendanceRecordInput, RaidDetail } from '../services/api';

const route = useRoute();
const raidId = route.params.raidId as string;

const raid = ref<RaidDetail | null>(null);
const attendanceEvents = ref<any[]>([]);
const attendanceLoading = ref(false);
const rosterPreview = ref<AttendanceRecordInput[] | null>(null);
const rosterMeta = ref<{ filename: string; uploadedAt: string } | null>(null);
const submittingAttendance = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedAttendanceEvent = ref<any | null>(null);
const startedAtInput = ref('');
const endedAtInput = ref('');
const initialStartedAt = ref('');
const initialEndedAt = ref('');
const savingTimes = ref(false);
const startingRaid = ref(false);
const endingRaid = ref(false);

async function loadRaid() {
  const data = await api.fetchRaid(raidId);
  raid.value = data;
  setTimingInputs(data);
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

function toInputValue(isoString: string | null | undefined) {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);

  return local.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return date.toISOString();
}

function setTimingInputs(current: RaidDetail) {
  const startValue = toInputValue(current.startedAt);
  const endValue = toInputValue(current.endedAt);
  startedAtInput.value = startValue;
  endedAtInput.value = endValue;
  initialStartedAt.value = startValue;
  initialEndedAt.value = endValue;
}

const timesDirty = computed(
  () =>
    startedAtInput.value !== initialStartedAt.value || endedAtInput.value !== initialEndedAt.value
);

function resetTiming() {
  startedAtInput.value = initialStartedAt.value;
  endedAtInput.value = initialEndedAt.value;
}

async function saveTiming() {
  if (!timesDirty.value) {
    return;
  }

  savingTimes.value = true;
  try {
    await api.updateRaid(raidId, {
      startedAt: startedAtInput.value ? fromInputValue(startedAtInput.value) : null,
      endedAt: endedAtInput.value ? fromInputValue(endedAtInput.value) : null
    });
    await loadRaid();
  } finally {
    savingTimes.value = false;
  }
}

function promptAttendanceUpload(action: 'start' | 'end') {
  const actionLabel = action === 'start' ? 'start' : 'end';
  const shouldUpload = window.confirm(
    `Raid ${actionLabel} time recorded. Would you like to upload an attendance log now?`
  );
  if (shouldUpload) {
    // trigger existing file upload workflow
    setTimeout(() => fileInput.value?.click(), 0);
  }
}

async function handleStartRaid() {
  if (startingRaid.value || raid.value?.startedAt) {
    return;
  }

  startingRaid.value = true;
  try {
    await api.startRaid(raidId);
    await loadRaid();
    promptAttendanceUpload('start');
  } finally {
    startingRaid.value = false;
  }
}

async function handleEndRaid() {
  if (endingRaid.value || !raid.value?.startedAt || raid.value?.endedAt) {
    return;
  }

  endingRaid.value = true;
  try {
    await api.endRaid(raidId);
    await loadRaid();
    promptAttendanceUpload('end');
  } finally {
    endingRaid.value = false;
  }
}

function openAttendanceEvent(event: any) {
  selectedAttendanceEvent.value = event;
}

function closeAttendanceEvent() {
  selectedAttendanceEvent.value = null;
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

.raid-timing {
  gap: 1.5rem;
}

.timing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.timing-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timing-field .label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.timing-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  color: #f8fafc;
}

.timing-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.timing-actions {
  display: flex;
  gap: 0.75rem;
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
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.attendance-list__item:hover {
  background: rgba(59, 130, 246, 0.2);
  transform: translateY(-1px);
}

.attendees {
  margin-left: 0.5rem;
}

.arrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
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
