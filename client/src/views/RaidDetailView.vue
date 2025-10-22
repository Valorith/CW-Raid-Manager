<template>
  <section v-if="raid" class="raid-detail">
    <header class="section-header">
      <div>
        <h1>{{ raid.name }}</h1>
        <p class="muted">
          {{ formatDate(raid.startTime) }} • Targets: {{ raid.targetZones.join(', ') }}
        </p>
        <span v-if="userGuildRoleLabel" class="badge">{{ userGuildRoleLabel }}</span>
      </div>
      <div class="header-actions">
        <button class="btn" :disabled="!canManageRaid" @click="fileInput?.click()">
          Upload Attendance
        </button>
        <button
          class="btn btn--danger"
          :disabled="!canManageRaid"
          @click="confirmDeleteRaid"
        >
          Delete Raid
        </button>
      </div>
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
            :disabled="startingRaid || !!raid?.startedAt || !canManageRaid"
            @click="handleStartRaid"
          >
            {{ startingRaid ? 'Starting…' : raid?.startedAt ? 'Started' : 'Start Raid' }}
          </button>
          <button
            class="btn btn--outline"
            :disabled="endingRaid || !raid?.startedAt || !!raid?.endedAt || !canManageRaid"
            @click="handleEndRaid"
          >
            {{ endingRaid ? 'Ending…' : raid?.endedAt ? 'Ended' : 'End Raid' }}
          </button>
          <button
            class="btn btn--outline"
            :disabled="restartingRaid || !canRestartRaid"
            @click="handleRestartRaid"
          >
            {{ restartingRaid ? 'Restarting…' : 'Restart Raid' }}
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
            :disabled="!canManageRaid"
          />
        </div>
        <div class="timing-field">
          <label for="actual-end">Actual End</label>
          <input
            id="actual-end"
            v-model="endedAtInput"
            type="datetime-local"
            class="timing-input"
            :disabled="!canManageRaid"
          />
        </div>
      </div>

      <div class="timing-controls">
        <button
          class="btn btn--outline"
          :disabled="!timesDirty || savingTimes || !canManageRaid"
          @click="resetTiming"
        >
          Reset
        </button>
        <button class="btn" :disabled="!timesDirty || savingTimes || !canManageRaid" @click="saveTiming">
          {{ savingTimes ? 'Saving…' : 'Save Times' }}
        </button>
      </div>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <p v-else-if="!canManageRaid" class="muted">
        You do not have permission to manage raid timing or attendance.
      </p>
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
        >
          <div class="event-main" @click.stop="openAttendanceEvent(event)">
            <div class="event-header">
              <strong>{{ formatDate(event.createdAt) }}</strong>
              <span
                v-if="resolveEventTypeBadge(event.eventType)"
                :class="['badge', resolveEventTypeBadge(event.eventType)?.variant]"
              >
                {{ resolveEventTypeBadge(event.eventType)?.label }}
              </span>
            </div>
            <span class="muted attendees">{{ resolveEventSubtitle(event) }}</span>
          </div>
          <div class="event-actions">
            <button class="icon-button" @click.stop="openAttendanceEvent(event)">
              View
            </button>
            <button
              v-if="canManageRaid"
              class="icon-button icon-button--danger"
              :disabled="deletingAttendanceId === event.id"
              @click.stop="confirmDeleteAttendance(event)"
            >
              {{ deletingAttendanceId === event.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

      </section>
  <p v-else class="muted">Loading raid…</p>

  <RosterPreviewModal
    v-if="rosterPreview && showRosterModal"
    :entries="rosterPreview"
    :meta="rosterMeta"
    :saving="submittingAttendance"
    @close="handleRosterModalClose"
    @discard="handleRosterModalDiscard"
    @save="handleRosterModalSave"
  />
  <AttendanceEventModal
    v-if="selectedAttendanceEvent"
    :event="selectedAttendanceEvent"
    @close="closeAttendanceEvent"
  />
  <ConfirmationModal
    v-if="confirmModal.visible"
    :title="confirmModal.title"
    :description="confirmModal.message"
    :confirm-label="confirmModal.confirmLabel"
    :cancel-label="confirmModal.cancelLabel"
    @confirm="resolveConfirmation(true)"
    @cancel="resolveConfirmation(false)"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AttendanceEventModal from '../components/AttendanceEventModal.vue';
import ConfirmationModal from '../components/ConfirmationModal.vue';
import RosterPreviewModal from '../components/RosterPreviewModal.vue';
import { api } from '../services/api';
import type { AttendanceRecordInput, RaidDetail } from '../services/api';

const route = useRoute();
const router = useRouter();
const raidId = route.params.raidId as string;

const raid = ref<RaidDetail | null>(null);
const attendanceEvents = ref<any[]>([]);
const deletingAttendanceId = ref<string | null>(null);
const attendanceLoading = ref(false);
const showRosterModal = ref(false);
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
const restartingRaid = ref(false);
const confirmModal = reactive({
  visible: false,
  title: '',
  message: undefined as string | undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel'
});

let confirmResolver: ((value: boolean) => void) | null = null;
const actionError = ref<string | null>(null);
const pendingEventTypes = ref<Array<'START' | 'END' | 'RESTART'>>([]);
const canManageRaid = computed(() => {
  const permissions = raid.value?.permissions;
  if (!permissions) {
    return false;
  }

  if (typeof permissions.canManage === 'boolean') {
    return permissions.canManage;
  }

  const role = permissions.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canRestartRaid = computed(() => canManageRaid.value && Boolean(raid.value?.endedAt));
const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member'
};
const userGuildRoleLabel = computed(() => {
  const role = raid.value?.permissions?.role;
  if (!role) {
    return null;
  }
  return roleLabels[role] ?? role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
});

async function loadRaid() {
  const data = await api.fetchRaid(raidId);
  raid.value = data;
  setTimingInputs(data);
  actionError.value = null;
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
    showRosterModal.value = true;
  } finally {
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function discardPreview(removePending = true) {
  rosterPreview.value = null;
  rosterMeta.value = null;
  showRosterModal.value = false;
  if (removePending && pendingEventTypes.value.length > 0) {
    pendingEventTypes.value.pop();
  }
}

async function saveAttendance(entries?: AttendanceRecordInput[]) {
  if (entries) {
    rosterPreview.value = entries;
  }

  if (!rosterPreview.value) {
    return;
  }

  submittingAttendance.value = true;
  try {
    const eventType = pendingEventTypes.value.shift();
    await api.createAttendanceEvent(raidId, {
      note: `Imported from ${rosterMeta.value?.filename ?? 'roster file'}`,
      snapshot: {
        filename: rosterMeta.value?.filename,
        uploadedAt: rosterMeta.value?.uploadedAt
      },
      records: rosterPreview.value,
      eventType
    });
    discardPreview(false);
    showRosterModal.value = false;
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

function showConfirmation(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return new Promise<boolean>((resolve) => {
    confirmModal.visible = true;
    confirmModal.title = options.title;
    confirmModal.message = options.message;
    confirmModal.confirmLabel = options.confirmLabel ?? 'Confirm';
    confirmModal.cancelLabel = options.cancelLabel ?? 'Cancel';
    confirmResolver = resolve;
  });
}

function resolveConfirmation(result: boolean) {
  confirmModal.visible = false;
  confirmModal.title = '';
  confirmModal.message = undefined;
  confirmModal.confirmLabel = 'Confirm';
  confirmModal.cancelLabel = 'Cancel';
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(result);
}


function confirmDeleteAttendance(event: any) {
  if (!canManageRaid.value) {
    return;
  }

  showConfirmation({
    title: 'Delete Attendance Event',
    message: 'This will remove the attendance snapshot and all associated records.',
    confirmLabel: 'Delete Event',
    cancelLabel: 'Cancel'
  }).then(async (confirmed) => {
    if (!confirmed) {
      return;
    }

    deletingAttendanceId.value = event.id;
    actionError.value = null;

    try {
      await api.deleteAttendanceEvent(event.id);
      attendanceEvents.value = attendanceEvents.value.filter((item) => item.id !== event.id);
      if (selectedAttendanceEvent.value?.id === event.id) {
        selectedAttendanceEvent.value = null;
      }
    } catch (error) {
      actionError.value = extractErrorMessage(error, 'Unable to delete attendance event. Please try again.');
    } finally {
      deletingAttendanceId.value = null;
    }
  });
}


function handleRosterModalClose() {
  discardPreview();
}

function handleRosterModalDiscard() {
  discardPreview();
}

async function handleRosterModalSave(entries: AttendanceRecordInput[]) {
  await saveAttendance(entries);
}

function triggerAttendanceUpload() {
  requestAnimationFrame(() => {
    fileInput.value?.click();
  });
}

function confirmDeleteRaid() {
  if (!canManageRaid.value) {
    return;
  }

  showConfirmation({
    title: 'Delete Raid',
    message: 'This will remove the raid and all associated attendance events. This action cannot be undone.',
    confirmLabel: 'Delete Raid',
    cancelLabel: 'Cancel'
  }).then(async (confirmed) => {
    if (!confirmed) {
      return;
    }

    actionError.value = null;
    try {
      await api.deleteRaid(raidId);
      router.push({ name: 'Raids' });
    } catch (error) {
      actionError.value = extractErrorMessage(error, 'Unable to delete raid. Please try again.');
    }
  });
}

async function handleStartRaid() {
  if (startingRaid.value || raid.value?.startedAt) {
    return;
  }

  startingRaid.value = true;
  actionError.value = null;
  try {
    await api.startRaid(raidId);
    pendingEventTypes.value.push('START');
    const shouldUpload = await showConfirmation({
      title: 'Raid Started',
      message: 'Raid start time recorded. Upload an attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      triggerAttendanceUpload();
    }
    await loadRaid();
    await loadAttendance();
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to start raid. Please try again.');
    if (pendingEventTypes.value.length > 0 && pendingEventTypes.value[pendingEventTypes.value.length - 1] === 'START') {
      pendingEventTypes.value.pop();
    }
  } finally {
    startingRaid.value = false;
  }
}

async function handleEndRaid() {
  if (endingRaid.value || !raid.value?.startedAt || raid.value?.endedAt) {
    return;
  }

  endingRaid.value = true;
  actionError.value = null;
  try {
    await api.endRaid(raidId);
    pendingEventTypes.value.push('END');
    const shouldUpload = await showConfirmation({
      title: 'Raid Ended',
      message: 'Raid end time recorded. Upload the final attendance log?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      triggerAttendanceUpload();
    }
    await loadRaid();
    await loadAttendance();
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to end raid. Please try again.');
    if (pendingEventTypes.value.length > 0 && pendingEventTypes.value[pendingEventTypes.value.length - 1] === 'END') {
      pendingEventTypes.value.pop();
    }
  } finally {
    endingRaid.value = false;
  }
}

async function handleRestartRaid() {
  if (restartingRaid.value || !canRestartRaid.value) {
    return;
  }

  restartingRaid.value = true;
  actionError.value = null;
  try {
    await api.restartRaid(raidId);
    pendingEventTypes.value.push('RESTART');
    const shouldUpload = await showConfirmation({
      title: 'Raid Restarted',
      message: 'Raid restart recorded. Upload a fresh attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      triggerAttendanceUpload();
    }
    await loadRaid();
    await loadAttendance();
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to restart raid. Please try again.');
    if (pendingEventTypes.value.length > 0 && pendingEventTypes.value[pendingEventTypes.value.length - 1] === 'RESTART') {
      pendingEventTypes.value.pop();
    }
  } finally {
    restartingRaid.value = false;
  }
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (data && typeof data === 'object') {
      const message =
        'message' in data && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'error' in data && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : null;
      if (message) {
        return message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function resolveEventTypeBadge(eventType?: string | null) {
  switch (eventType) {
    case 'START':
      return { label: 'Raid Started', variant: 'badge--positive' };
    case 'END':
      return { label: 'Raid Ended', variant: 'badge--negative' };
    case 'RESTART':
      return { label: 'Raid Restarted', variant: 'badge--positive' };
    default:
      return null;
  }
}

function resolveEventSubtitle(event: any) {
  switch (event.eventType) {
    case 'START':
      return 'Raid start recorded';
    case 'END':
      return 'Raid end recorded';
    case 'RESTART':
      return 'Raid restart recorded';
    default:
      return `${Array.isArray(event.records) ? event.records.length : 0} attendees logged`;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 0.35rem;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
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

.timing-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.error {
  color: #f87171;
  margin: 0;
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

.event-main {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.attendees {
  margin-left: 0;
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

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn--danger {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.btn--danger:hover {
  background: rgba(248, 113, 113, 0.25);
  color: #fee2e2;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--outline:disabled {
  border-color: rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.5);
}

.btn--danger:disabled {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(248, 113, 113, 0.2);
  color: rgba(252, 165, 165, 0.5);
}


.event-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.4rem;
  transition: color 0.2s ease, background 0.2s ease;
}

.icon-button:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.icon-button--danger {
  color: #fca5a5;
}

.icon-button--danger:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

</style>
