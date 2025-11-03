<template>
  <section
    class="inspector"
    :class="{ 'inspector--compact': entries.length === 0 }"
    :style="inspectorStyle"
  >
    <header class="inspector__header">
      <div class="inspector__heading">
        <h3>{{ inspectorTitle }}</h3>
        <span class="inspector__meta muted tiny">{{ headerSubtitle }}</span>
      </div>
      <button
        type="button"
        class="inspector__reset"
        :disabled="entries.length === 0"
        @click="handleResetClick"
      >
        Reset
      </button>
    </header>

    <div v-if="entries.length === 0" class="inspector__placeholder">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          fill="currentColor"
          d="M26 6a12 12 0 1 1 0 24 12 12 0 0 1 0-24Zm0 6a6 6 0 1 0 .001 12.001A6 6 0 0 0 26 12Zm25 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-5 26v-4c0-3.73-5.82-6-11.16-6h-.84c-1.88 0-3.71.22-5.42.63a21.97 21.97 0 0 1 1.35 2.49c.72 1.56 1.2 3.27 1.47 4.88 1.09-.06 2.12-.1 3.19-.1H37c2.58 0 5.6.33 8.08 1.07.22-.25.42-.55.6-.87ZM26 34c8.43 0 17 4.22 17 11.26V50H9v-4.74C9 38.22 17.57 34 26 34Z"
          opacity=".4"
        />
        <path
          fill="currentColor"
          d="M44.48 47.65c.69-.04 1.38-.06 2.07-.06h1.92c3.56 0 8.53.52 11.53 1.63V54H41.57C42.08 51.57 43.01 49.37 44.48 47.65ZM20 50h-8.51c1.01-4.01 6.75-7 14.51-7s13.5 2.99 14.51 7H20Zm31-22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        />
      </svg>
      <p>{{ inspectorPlaceholder }}</p>
    </div>

    <div v-else class="inspector__table" role="table" aria-label="Character comparison">
      <div class="inspector__row inspector__row--header" role="row">
        <div class="inspector__cell inspector__cell--label" role="columnheader">Metric</div>
        <div
          v-for="entry in entries"
          :key="`header-${entry.key}`"
          class="inspector__cell inspector__cell--header"
          :class="{
            'inspector__cell--header--dragging': draggingKey === entry.key,
            'inspector__cell--header--over': dragOverKey === entry.key && draggingKey !== entry.key
          }"
          role="columnheader"
          :draggable="entries.length > 1"
          :aria-grabbed="draggingKey === entry.key"
          @dragstart="handleDragStart($event, entry.key)"
          @dragenter="handleDragEnter($event, entry.key)"
          @dragover="handleDragOver($event)"
          @drop="handleDrop($event, entry.key)"
          @dragleave.self="handleDragLeave($event, entry.key)"
          @dragend="handleDragEnd"
        >
          <div class="inspector__name">
            <span v-if="entryIcon(entry)" class="inspector__name-icon">
              <img :src="entryIcon(entry)!" :alt="`${entry.label} class icon`" />
            </span>
            <CharacterLink
              v-if="linkMode === 'character'"
              class="inspector__name-link inspector__name-link--interactive"
              :name="entry.label"
              @click.prevent="handleEntryClick(entry)"
              @keydown.enter.prevent="handleEntryClick(entry)"
              @keydown.space.prevent="handleEntryClick(entry)"
            />
            <span
              v-else
              class="inspector__name-link inspector__name-link--plain inspector__name-link--interactive"
              role="button"
              tabindex="0"
              @click="handleEntryClick(entry)"
              @keydown.enter.prevent="handleEntryClick(entry)"
              @keydown.space.prevent="handleEntryClick(entry)"
            >
              {{ entry.label }}
            </span>
            <span v-if="entry.isMain" class="inspector__badge">Main</span>
          </div>
        </div>
      </div>
      <div
        v-for="row in statRows"
        :key="row.key"
        class="inspector__row"
        role="row"
      >
        <div class="inspector__cell inspector__cell--label" role="rowheader">
          {{ row.label }}
        </div>
        <div
          v-for="entry in entries"
          :key="`${row.key}-${entry.key}`"
          class="inspector__cell inspector__cell--value"
          role="cell"
        >
          <div class="inspector__value">
            <span :class="valueClass(row.key, entry.key)">{{ row.format(entry) }}</span>
            <span
              v-if="row.secondary && row.secondary(entry)"
              class="muted tiny"
              :class="secondaryClass(row.key, entry.key)"
            >
              {{ row.secondary(entry) }}
            </span>
          </div>
          <div
            v-if="row.key !== 'lastLootDate' && diffs.has(row.key) && diffs.get(row.key)?.has(entry.key)"
            class="inspector__diff"
            :class="diffClass(row.key, entry.key)"
          >
            {{ formatDiff(row.key, entry.key) }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CharacterLink from './CharacterLink.vue';
import { type CharacterClass, getCharacterClassIcon } from '../services/types';

interface InspectorEntry {
  key: string;
  label: string;
  class: CharacterClass | null;
  participationPercent: number;
  lootPercent: number;
  lootCount: number;
  lastLootDate: string | null;
  latePercent: number;
  lateRaidCount: number;
  leftEarlyPercent: number;
  leftEarlyRaidCount: number;
  absentPercent: number;
  presentEvents: number;
  totalAttendanceEvents: number;
  isMain: boolean;
}

const props = defineProps<{
  entries: InspectorEntry[];
  totalRaids: number;
  title?: string;
  linkMode?: 'character' | 'plain';
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
  (e: 'reorder', payload: string[]): void;
  (e: 'entrySelect', payload: { entry: InspectorEntry; mode: 'character' | 'plain' }): void;
}>();

const linkMode = computed<'character' | 'plain'>(() => props.linkMode ?? 'character');
const inspectorTitle = computed(() =>
  props.title ?? (linkMode.value === 'character' ? 'Character Inspector' : 'Member Inspector')
);
const inspectorPlaceholder = computed(() =>
  linkMode.value === 'character'
    ? 'Select one or more characters using the search box to compare raid participation, loot share, and attendance patterns.'
    : 'Select one or more members using the search box to compare member attendance, loot share, and participation.'
);

const hasMultipleEntries = computed(() => props.entries.length > 1);

const inspectorStyle = computed<Record<string, string>>(() => {
  if (props.entries.length === 0) {
    return {
      width: '100%',
      maxWidth: 'clamp(280px, 33vw, 520px)',
      margin: '0 auto'
    };
  }
  return {
    width: '100%',
    maxWidth: '100%',
    margin: '0'
  };
});

const headerSubtitle = computed(() => {
  if (props.totalRaids === 0) {
    return 'No raids analysed';
  }
  return `${props.totalRaids} raid${props.totalRaids === 1 ? '' : 's'} analysed`;
});

function formatNumber(value?: number): string {
  return (value ?? 0).toLocaleString();
}

function formatPercent(value: number): string {
  const clamp = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return `${clamp.toFixed(1)}%`;
}

function formatDiffValue(value: number, isPercent = false): string {
  const prefix = value > 0 ? '+' : '';
  return isPercent ? `${prefix}${value.toFixed(1)}%` : `${prefix}${formatNumber(value)}`;
}

function handleEntryClick(entry: InspectorEntry) {
  emit('entrySelect', { entry, mode: linkMode.value });
}

function formatDateLong(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatRelativeLootDate(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return isoDate;
  }
  const now = Date.now();
  const diffMs = now - parsed;
  const diffDays = Math.max(0, Math.round(diffMs / MS_PER_DAY));
  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return '1 day ago';
  }
  return `${diffDays} days ago`;
}

function computeLastLootAgeDays(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  const ageDays = (Date.now() - parsed) / MS_PER_DAY;
  return ageDays >= 0 ? ageDays : 0;
}

function approximatelyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) && !Number.isFinite(b)) {
    return true;
  }
  return Math.abs(a - b) < 0.01;
}

function entryIcon(entry: InspectorEntry): string | null {
  return getCharacterClassIcon(entry.class ?? null);
}

const draggingKey = ref<string | null>(null);
const dragOverKey = ref<string | null>(null);

function handleResetClick() {
  cleanupDragState();
  emit('reset');
}

function handleDragStart(event: DragEvent, key: string) {
  if (props.entries.length <= 1) {
    return;
  }
  draggingKey.value = key;
  dragOverKey.value = key;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  }
}

function handleDragEnter(event: DragEvent, key: string) {
  event.preventDefault();
  if (draggingKey.value) {
    dragOverKey.value = key;
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleDragLeave(event: DragEvent, key: string) {
  event.preventDefault();
  if (dragOverKey.value === key) {
    dragOverKey.value = null;
  }
}

function handleDrop(event: DragEvent, key: string) {
  event.preventDefault();
  const sourceKey =
    draggingKey.value ?? (event.dataTransfer ? event.dataTransfer.getData('text/plain') : null);
  if (!sourceKey || sourceKey === key) {
    cleanupDragState();
    return;
  }
  const keys = props.entries.map((entry) => entry.key);
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(key);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    cleanupDragState();
    return;
  }
  const reordered = [...keys];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  emit('reorder', reordered);
  cleanupDragState();
}

function handleDragEnd() {
  cleanupDragState();
}

function cleanupDragState() {
  draggingKey.value = null;
  dragOverKey.value = null;
}

watch(
  () => props.entries.length,
  () => {
    cleanupDragState();
  }
);

type StatKey =
  | 'participationPercent'
  | 'lootPercent'
  | 'lootCount'
  | 'lastLootDate'
  | 'latePercent'
  | 'leftEarlyPercent'
  | 'absentPercent'
  | 'presentEvents';

interface StatRow {
  key: StatKey;
  label: string;
  format: (entry: InspectorEntry) => string;
  secondary?: (entry: InspectorEntry) => string | null | undefined;
  diffType: 'percent' | 'number' | 'none';
  direction: 'higher' | 'lower';
}

const statRows = computed<StatRow[]>(() => [
  {
    key: 'participationPercent',
    label: 'Raid Participation',
    format: (entry: InspectorEntry) => formatPercent(entry.participationPercent),
    diffType: 'percent',
    direction: 'higher'
  },
  {
    key: 'presentEvents',
    label: 'Present Events',
    format: (entry: InspectorEntry) =>
      `${formatNumber(entry.presentEvents)} of ${formatNumber(entry.totalAttendanceEvents)}`,
    diffType: 'number',
    direction: 'higher'
  },
  {
    key: 'latePercent',
    label: 'Late',
    format: (entry: InspectorEntry) =>
      `${formatPercent(entry.latePercent)} (${formatNumber(entry.lateRaidCount)})`,
    diffType: 'percent',
    direction: 'lower'
  },
  {
    key: 'leftEarlyPercent',
    label: 'Left Early',
    format: (entry: InspectorEntry) =>
      `${formatPercent(entry.leftEarlyPercent)} (${formatNumber(entry.leftEarlyRaidCount)})`,
    diffType: 'percent',
    direction: 'lower'
  },
  {
    key: 'absentPercent',
    label: 'Absent',
    format: (entry: InspectorEntry) => formatPercent(entry.absentPercent),
    diffType: 'percent',
    direction: 'lower'
  },
  {
    key: 'lootPercent',
    label: 'Total Loot Share',
    format: (entry: InspectorEntry) => formatPercent(entry.lootPercent),
    secondary: (entry: InspectorEntry) => `${formatNumber(entry.lootCount)} items`,
    diffType: 'percent',
    direction: 'lower'
  },
  {
    key: 'lastLootDate',
    label: 'Date of Last Loot',
    format: (entry: InspectorEntry) =>
      entry.lastLootDate ? formatDateLong(entry.lastLootDate) : 'Never',
    secondary: (entry: InspectorEntry) =>
      entry.lastLootDate ? formatRelativeLootDate(entry.lastLootDate) : null,
    diffType: 'number',
    direction: 'lower'
  }
]);

const diffs = computed(() => {
  const map = new Map<StatKey, Map<string, number>>();
  if (!hasMultipleEntries.value) {
    return map;
  }
  const base = props.entries[0];
  for (const row of statRows.value) {
    if (row.diffType === 'none') {
      continue;
    }
    const diffMap = new Map<string, number>();
    for (const entry of props.entries.slice(1)) {
      let value = 0;
      let baseValue = 0;
      switch (row.key) {
        case 'participationPercent':
          value = entry.participationPercent;
          baseValue = base.participationPercent;
          break;
        case 'lootPercent':
          value = entry.lootPercent;
          baseValue = base.lootPercent;
          break;
        case 'latePercent':
          value = entry.latePercent;
          baseValue = base.latePercent;
          break;
        case 'leftEarlyPercent':
          value = entry.leftEarlyPercent;
          baseValue = base.leftEarlyPercent;
          break;
        case 'absentPercent':
          value = entry.absentPercent;
          baseValue = base.absentPercent;
          break;
        case 'presentEvents':
          value = entry.presentEvents;
          baseValue = base.presentEvents;
          break;
        case 'lootCount':
          value = entry.lootCount;
          baseValue = base.lootCount;
          break;
        case 'lastLootDate': {
          const entryDate = entry.lastLootDate ? Date.parse(entry.lastLootDate) : null;
          const baseDate = base.lastLootDate ? Date.parse(base.lastLootDate) : null;

          if (entryDate === null && baseDate === null) {
            diffMap.set(entry.key, 0);
            continue;
          }

          if (entryDate === null && baseDate !== null && !Number.isNaN(baseDate)) {
            const daysSinceBase = Math.round((Date.now() - baseDate) / MS_PER_DAY);
            diffMap.set(entry.key, -daysSinceBase);
            continue;
          }

          if (entryDate !== null && !Number.isNaN(entryDate) && baseDate === null) {
            const daysSinceEntry = Math.round((Date.now() - entryDate) / MS_PER_DAY);
            diffMap.set(entry.key, daysSinceEntry);
            continue;
          }

          if (entryDate !== null && baseDate !== null && !Number.isNaN(entryDate) && !Number.isNaN(baseDate)) {
            const diffDays = Math.round((entryDate - baseDate) / MS_PER_DAY);
            diffMap.set(entry.key, diffDays);
            continue;
          }

          diffMap.set(entry.key, 0);
          continue;
        }
      }
      diffMap.set(entry.key, value - baseValue);
    }
    map.set(row.key, diffMap);
  }
  return map;
});

const lastLootComparisonClasses = computed(() => {
  const map = new Map<string, string>();
  if (props.entries.length <= 1) {
    return map;
  }
  const ages = props.entries.map((entry) => ({
    key: entry.key,
    age: computeLastLootAgeDays(entry.lastLootDate)
  }));
  const ageValues = ages.map(({ age }) => age);
  const maxAge = Math.max(...ageValues);
  const minAge = Math.min(...ageValues);
  if (approximatelyEqual(maxAge, minAge)) {
    return map;
  }
  for (const { key, age } of ages) {
    if (approximatelyEqual(age, maxAge)) {
      map.set(key, 'inspector__diff--positive');
    } else if (approximatelyEqual(age, minAge)) {
      map.set(key, 'inspector__diff--negative');
    }
  }
  return map;
});

const allEntriesNever = computed(() => props.entries.every((entry) => !entry.lastLootDate));

function formatDiff(key: StatKey, entryKey: string) {
  const diff = diffs.value.get(key)?.get(entryKey);
  if (diff === undefined) {
    return '';
  }
  if (key === 'lastLootDate') {
    return '';
  }
  if (Math.abs(diff) < 0.05) {
    return '';
  }
  if (
    key === 'lootPercent' ||
    key === 'participationPercent' ||
    key === 'latePercent' ||
    key === 'leftEarlyPercent' ||
    key === 'absentPercent'
  ) {
    return formatDiffValue(diff, true);
  }
  return formatDiffValue(diff, false);
}

function diffClass(key: StatKey, entryKey: string) {
  const diff = diffs.value.get(key)?.get(entryKey) ?? 0;
  const row = statRows.value.find((item) => item.key === key);
  const direction = row?.direction ?? 'higher';
  if (direction === 'lower') {
    if (diff < 0) return 'inspector__diff--positive';
    if (diff > 0) return 'inspector__diff--negative';
  } else {
    if (diff > 0) return 'inspector__diff--positive';
    if (diff < 0) return 'inspector__diff--negative';
  }
  return 'inspector__diff--neutral';
}

function secondaryClass(key: StatKey, entryKey: string): string {
  if (key !== 'lastLootDate') {
    return '';
  }
  const entry = props.entries.find((item) => item.key === entryKey);
  if (!entry) {
    return '';
  }
  if (allEntriesNever.value) {
    return '';
  }
  if (!entry.lastLootDate) {
    return 'inspector__diff--positive';
  }
  const mapped = lastLootComparisonClasses.value.get(entryKey);
  if (mapped) {
    return mapped;
  }
  return '';
}

function valueClass(key: StatKey, entryKey: string): string {
  if (key !== 'lastLootDate') {
    return '';
  }
  const entry = props.entries.find((item) => item.key === entryKey);
  if (!entry) {
    return '';
  }
  if (allEntriesNever.value) {
    return '';
  }
  if (!entry.lastLootDate) {
    return 'inspector__diff--positive';
  }
  return '';
}
</script>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: rgba(15, 23, 42, 0.68);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.85rem;
  padding: 1rem;
  min-height: 220px;
}

.inspector--compact {
  align-self: center;
}

.inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.inspector__heading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.inspector__meta {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.inspector__reset {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
  font-size: 0.75rem;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.inspector__reset:hover:enabled,
.inspector__reset:focus-visible:enabled {
  border-color: rgba(59, 130, 246, 0.8);
  color: #60a5fa;
}

.inspector__reset:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.inspector__placeholder {
  margin: 0 auto;
  text-align: center;
  color: #94a3b8;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  align-items: center;
}

.inspector__placeholder svg {
  width: 64px;
  height: 64px;
}

.inspector__placeholder p {
  margin: 0;
  font-size: 0.9rem;
}

.inspector__table {
  display: grid;
  gap: 0.65rem;
}

.inspector__row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.65rem;
  align-items: flex-start;
  padding-top: 0.65rem;
}

.inspector__row--header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  padding-bottom: 0.35rem;
  padding-top: 0;
}

.inspector__row + .inspector__row {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.inspector__cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.inspector__cell--label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.inspector__cell--value {
  align-items: center;
  text-align: center;
}

.inspector__cell--header {
  align-items: center;
  text-align: center;
  cursor: grab;
  user-select: none;
}

.inspector__cell--header[draggable='false'] {
  cursor: default;
}

.inspector__cell--header .inspector__name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
}

.inspector__name-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.55);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25);
}

.inspector__cell--header--dragging {
  opacity: 0.65;
  cursor: grabbing;
}

.inspector__cell--header--over {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
  border-radius: 0.95rem;
}

.inspector__name-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.inspector__name-link {
  display: inline-block;
  text-align: center;
}

.inspector__name-link--plain {
  color: inherit;
  text-decoration: none;
  cursor: default;
}

.inspector__name-link--interactive {
  cursor: pointer;
}

.inspector__name-link--plain.inspector__name-link--interactive {
  color: #38bdf8;
  font-weight: 600;
}

.inspector__name-link--interactive:hover,
.inspector__name-link--interactive:focus-visible {
  text-decoration: underline;
  text-decoration-color: rgba(94, 234, 212, 0.7);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.inspector__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.25);
  border: 1px solid rgba(34, 197, 94, 0.45);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inspector__value {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  align-items: center;
  text-align: center;
}

.inspector__diff {
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.inspector__diff--positive {
  color: #34d399;
}

.inspector__diff--negative {
  color: #f87171;
}

.inspector__diff--neutral {
  color: #94a3b8;
}

@media (max-width: 720px) {
  .inspector {
    padding: 0.85rem;
  }

  .inspector__row {
    grid-template-columns: minmax(120px, 1fr) repeat(auto-fit, minmax(140px, 1fr));
  }
}
</style>
