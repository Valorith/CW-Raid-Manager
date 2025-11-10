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
          <div class="summary__actions" v-if="canEdit">
            <template v-if="isEditing">
              <button class="btn btn--success" type="button" @click="saveEdit" :disabled="saving">
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
              <button
                class="btn btn--danger"
                type="button"
                @click="handleCancelEdit"
                :disabled="saving"
              >
                Cancel
              </button>
            </template>
            <button v-else class="btn btn--outline" type="button" @click="startEdit">Edit</button>
            <button class="btn btn--primary" type="button" @click="upload">Upload Snapshot</button>
          </div>
        </div>
        <div class="summary__stats">
          <div v-for="status in visibleStatuses" :key="status" class="summary__stat">
            <span class="label">{{ statusLabels[status] }}</span>
            <strong>{{ statusCounts[status] ?? 0 }}</strong>
          </div>
          <div class="summary__stat">
            <span class="label">Total</span>
            <strong>{{ currentRecords.length }}</strong>
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
              <th v-if="isEditing" class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(record, index) in currentRecords" :key="record.id ?? index">
              <td class="name-cell">
                <span v-if="!isEditing" class="name-wrapper">
                  <CharacterLink class="name-link" :name="record.characterName" />
                  <span v-if="record.isMain" class="badge badge--main">Main</span>
                </span>
                <div v-else class="name-edit-wrapper">
                  <input
                    class="table-input"
                    type="text"
                    v-model="editableRecords[index].characterName"
                    placeholder="Character name"
                  />
                  <span v-if="editableRecords[index].isMain" class="badge badge--main">Main</span>
                </div>
              </td>
              <td>
                <span v-if="!isEditing">{{ record.level ?? '—' }}</span>
                <input
                  v-else
                  class="table-input"
                  type="number"
                  min="1"
                  max="95"
                  v-model.number="editableRecords[index].level"
                />
              </td>
              <td class="class-cell">
                <template v-if="!isEditing">
                  <span v-if="record.class" class="class-wrapper">
                    <img
                      v-if="getCharacterClassIcon(record.class!)"
                      :src="getCharacterClassIcon(record.class!) || undefined"
                      :alt="formatClass(record.class!)"
                      class="class-icon"
                    />
                    <span>{{ formatClass(record.class!) }}</span>
                  </span>
                  <span v-else>—</span>
                </template>
                <select
                  v-else
                  class="table-input class-select"
                  v-model="editableRecords[index].class"
                >
                  <option value="">—</option>
                  <option v-for="option in classOptions" :key="option" :value="option">
                    {{ formatClass(option as CharacterClass) }}
                  </option>
                </select>
              </td>
              <td>
                <span v-if="!isEditing">{{ formatStatus(record.status) }}</span>
                <select v-else class="table-input" v-model="editableRecords[index].status">
                  <option v-for="status in statusOptions" :key="status" :value="status">
                    {{ statusLabels[status] }}
                  </option>
                </select>
              </td>
              <td>
                <span v-if="!isEditing">{{ record.groupNumber ?? '—' }}</span>
                <input
                  v-else
                  class="table-input"
                  type="number"
                  min="1"
                  max="12"
                  v-model.number="editableRecords[index].groupNumber"
                />
              </td>
              <td>
                <span v-if="!isEditing">{{ record.flags || '—' }}</span>
                <input
                  v-else
                  class="table-input"
                  type="text"
                  v-model="editableRecords[index].flags"
                />
              </td>
              <td v-if="isEditing" class="actions-col">
                <button
                  class="icon-button icon-button--danger"
                  type="button"
                  @click="removeRecord(index)"
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button
          v-if="isEditing"
          class="btn btn--outline btn--small add-row-button"
          type="button"
          @click="addRecord"
          :disabled="saving"
        >
          + Add Character
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
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

type EditableAttendanceRecordInput = {
  characterId?: string | null;
  characterName: string;
  level?: number | null;
  class?: CharacterClass | null;
  groupNumber?: number | null;
  status?: AttendanceStatus | null;
  flags?: string | null;
  isMain?: boolean;
  id?: string;
};

const props = defineProps<{
  event: AttendanceEvent;
  canEdit?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'upload', attendanceEventId: string): void;
  (e: 'save', payload: { eventId: string; records: EditableAttendanceRecordInput[] }): void;
}>();

const isEditing = ref(false);
const editableRecords = ref<EditableAttendanceRecordInput[]>([]);

const formattedDate = computed(() =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(props.event.createdAt))
);
const saving = computed(() => props.saving ?? false);

const statusLabels: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  BENCHED: 'Left Early',
  ABSENT: 'Absent'
};

const statusOptions: AttendanceStatus[] = ['PRESENT', 'LATE', 'BENCHED', 'ABSENT'];

const classOptions = computed(() => Object.keys(characterClassLabels));

const currentRecords = computed(() =>
  isEditing.value ? editableRecords.value : props.event.records
);

const statusCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const record of currentRecords.value) {
    const key = record.status ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

const visibleStatuses = computed(() =>
  statusOptions.filter((status) => (statusCounts.value[status] ?? 0) > 0)
);

watch(
  () => props.event,
  () => {
    isEditing.value = false;
    resetEditableRecords();
  },
  { immediate: true }
);

function resetEditableRecords() {
  editableRecords.value = props.event.records.map((record) => ({
    id: record.id,
    characterId: record.characterId,
    characterName: record.characterName,
    level: record.level ?? null,
    class: record.class ?? null,
    groupNumber: record.groupNumber ?? null,
    status: (record.status as AttendanceStatus) ?? 'PRESENT',
    flags: record.flags ?? null,
    isMain: record.isMain
  }));
}

function close() {
  emit('close');
}

function upload() {
  emit('upload', props.event.id);
}

function startEdit() {
  if (!props.canEdit || isEditing.value) {
    return;
  }
  if (editableRecords.value.length === 0) {
    resetEditableRecords();
  }
  isEditing.value = true;
}

function saveEdit() {
  if (!isEditing.value || saving.value) {
    return;
  }
  const prepared = editableRecords.value
    .map((record) => ({
      characterId: record.characterId ?? undefined,
      characterName: record.characterName.trim(),
      level: normalizeNumber(record.level),
      class: normalizeClass(record.class),
      groupNumber: normalizeNumber(record.groupNumber),
      status: normalizeStatus(record.status),
      flags: normalizeString(record.flags)
    }))
    .filter((record) => record.characterName.length >= 2);

  emit('save', {
    eventId: props.event.id,
    records: prepared
  });
}

function addRecord() {
  editableRecords.value.push({
    characterId: null,
    characterName: '',
    level: null,
    class: null,
    groupNumber: null,
    status: 'PRESENT',
    flags: null,
    isMain: false
  });
  nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('input.table-input');
    inputs[inputs.length - 1]?.focus();
  });
}

function removeRecord(index: number) {
  editableRecords.value.splice(index, 1);
}

function handleCancelEdit() {
  if (!isEditing.value) {
    return;
  }
  if (saving.value) {
    return;
  }
  resetEditableRecords();
  isEditing.value = false;
}

function normalizeString(value?: string | null) {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value?: number | null) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClass(value?: CharacterClass | null) {
  if (!value) {
    return null;
  }
  return value;
}

function normalizeStatus(value?: AttendanceStatus | null): AttendanceStatus {
  if (value && statusOptions.includes(value)) {
    return value;
  }
  return 'PRESENT';
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
  width: min(1100px, 100%);
  max-height: min(760px, 90vh);
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

.btn--success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.85));
  color: #ecfdf5;
  box-shadow: 0 12px 24px rgba(34, 197, 94, 0.25);
}

.btn--danger {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.9), rgba(239, 68, 68, 0.85));
  color: #fef2f2;
  box-shadow: 0 12px 24px rgba(239, 68, 68, 0.2);
}

.btn--outline {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: #cbd5f5;
}

.btn--outline:focus-visible,
.btn--outline:hover {
  border-color: rgba(59, 130, 246, 0.6);
  color: #e2e8f0;
}

.btn--small {
  padding: 0.35rem 0.9rem;
  font-size: 0.8rem;
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
  flex-wrap: wrap;
}

.summary__actions {
  display: inline-flex;
  gap: 0.6rem;
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
  min-width: 140px;
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
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.5rem;
  max-height: 460px;
  overflow: auto;
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
  min-width: 180px;
}

.name-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.name-edit-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.name-link {
  font-weight: 600;
}

.class-cell {
  min-width: 160px;
}

.class-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
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
}

.badge--main {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.45), rgba(251, 191, 36, 0.25));
  color: #fef3c7;
  border: 1px solid rgba(252, 211, 77, 0.35);
}

.table-input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  padding: 0.35rem 0.6rem;
  font-size: 0.9rem;
}

.table-input:focus {
  outline: 2px solid rgba(59, 130, 246, 0.6);
  border-color: transparent;
}

.class-select {
  width: 90px;
  min-width: 80px;
  display: inline-block;
}

.actions-col {
  width: 60px;
  text-align: center;
}

.icon-button--danger {
  color: #f87171;
}

.icon-button--danger:hover {
  color: #fecaca;
  background: rgba(248, 113, 113, 0.15);
}

.add-row-button {
  margin-top: 0.75rem;
}

tbody tr:nth-child(even) {
  background: rgba(148, 163, 184, 0.02);
}
</style>
