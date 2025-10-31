<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h2>Roster Preview</h2>
          <p v-if="meta" class="muted">{{ meta.filename }}</p>
        </div>
        <button class="icon-button" @click="close">✕</button>
      </header>

      <p class="muted">
        Review and adjust the roster before saving. Fields can be edited inline and empty values will be ignored.
      </p>

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
            <tr v-for="(entry, index) in editableEntries" :key="index">
              <td>
                <input
                  type="number"
                  min="1"
                  max="12"
                  :value="entry.groupNumber ?? ''"
                  @input="updateEntry(index, 'groupNumber', toOptionalNumber(getEventValue($event)))"
                />
              </td>
              <td>
                <input
                  type="text"
                  :value="entry.characterName"
                  @input="updateEntry(index, 'characterName', getEventValue($event))"
                />
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  max="125"
                  :value="entry.level ?? ''"
                  @input="updateEntry(index, 'level', toOptionalNumber(getEventValue($event)))"
                />
              </td>
              <td>
                <select
                  :value="entry.class ?? ''"
                  @change="updateEntry(index, 'class', getSelectClassValue($event))"
                >
                  <option value="">—</option>
                  <option
                    v-for="className in classOptions"
                    :key="className"
                    :value="className"
                  >
                    {{ className }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  type="text"
                  :value="entry.flags ?? ''"
                  @input="updateEntry(index, 'flags', getEventValue($event) || null)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="modal__actions">
        <button class="btn btn--outline" @click="discard">Discard</button>
        <button class="btn" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save Attendance' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { AttendanceRecordInput } from '../services/api';
import type { CharacterClass } from '../services/types';

const props = defineProps<{
  entries: AttendanceRecordInput[];
  meta: { filename: string; uploadedAt: string } | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'discard'): void;
  (e: 'save', entries: AttendanceRecordInput[]): void;
}>();

const editableEntries = ref<AttendanceRecordInput[]>(cloneEntries(props.entries));

watch(
  () => props.entries,
  (value) => {
    editableEntries.value = cloneEntries(value);
  },
  { deep: true }
);

const classOptions = computed(() =>
  [
    'BARD',
    'BEASTLORD',
    'BERSERKER',
    'CLERIC',
    'DRUID',
    'ENCHANTER',
    'MAGICIAN',
    'MONK',
    'NECROMANCER',
    'PALADIN',
    'RANGER',
    'ROGUE',
    'SHADOWKNIGHT',
    'SHAMAN',
    'WARRIOR',
    'WIZARD',
    'UNKNOWN'
  ] as CharacterClass[]
);

function cloneEntries(entries: AttendanceRecordInput[]) {
  return entries.map((entry) => ({ ...entry }));
}

function getEventValue(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  return target?.value ?? '';
}

function getSelectClassValue(event: Event): CharacterClass | null {
  const value = getEventValue(event);
  return value ? (value as CharacterClass) : null;
}

function updateEntry<K extends keyof AttendanceRecordInput>(index: number, key: K, value: AttendanceRecordInput[K]) {
  const next = [...editableEntries.value];
  next[index] = { ...next[index], [key]: value };
  editableEntries.value = next;
}

function toOptionalNumber(raw: string) {
  if (raw === '') {
    return null;
  }
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function discard() {
  emit('discard');
}

function close() {
  emit('close');
}

function save() {
  emit('save', cloneEntries(editableEntries.value));
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
  z-index: 150;
}

.modal {
  width: min(920px, 100%);
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

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.table-wrapper {
  overflow: auto;
  border-radius: 0.75rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

thead {
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.9);
}

th,
td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

tbody tr:nth-child(even) {
  background: rgba(148, 163, 184, 0.05);
}

input,
select {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.5rem 0.6rem;
  color: #f8fafc;
}

input:focus,
select:focus {
  outline: 2px solid rgba(59, 130, 246, 0.4);
  outline-offset: 1px;
}

.muted {
  color: #94a3b8;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1.15rem;
}

.icon-button:hover {
  color: #e2e8f0;
}

.btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  border: none;
  border-radius: 0.5rem;
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
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
</style>
