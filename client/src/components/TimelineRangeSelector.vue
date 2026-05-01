<template>
  <section class="timeline timeline--overview" :class="{ 'timeline--disabled': disabled }">
    <header class="timeline__header">
      <div class="timeline__labels">
        <span class="timeline__label">{{ formatDate(viewStartMs) }}</span>
        <span class="timeline__label timeline__label--end">{{ formatDate(viewEndMs) }}</span>
      </div>
      <div class="timeline__summary">
        <slot />
      </div>
      <div class="timeline__mode">
        <span class="timeline__mode-filter">All available data</span>
        <button
          type="button"
          class="timeline__drill-btn"
          :disabled="disabled"
          @click="drillIntoDenseRange"
        >
          Drill down
        </button>
      </div>
    </header>

    <div
      ref="trackRef"
      class="timeline__track timeline__overview-track"
      @pointerdown="handleTrackPointerDown"
    >
      <div class="timeline__overview-frame">
        <div class="timeline__overview-range-label">
          <span>{{ formatDate(viewStartMs) }}</span>
          <strong>{{ overviewRangeLabel }}</strong>
          <span>{{ formatDate(viewEndMs) }}</span>
        </div>
        <div class="timeline__overview-months">
          <button
            v-for="bucket in overviewBuckets"
            :key="bucket.key"
            type="button"
            class="timeline__overview-month"
            :style="{ left: `${bucket.left}%`, width: `${bucket.width}%` }"
            :aria-label="`Drill into ${bucket.label}`"
            @pointerdown.stop
            @click="selectOverviewBucket(bucket)"
          >
            {{ bucket.label }}
          </button>
        </div>
        <div class="timeline__overview-bars" aria-hidden="true">
          <span
            v-for="bar in overviewActivityBars"
            :key="bar.key"
            class="timeline__overview-bar"
            :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
          >
            <span
              v-if="bar.raidHeight > 0"
              class="timeline__overview-bar-segment timeline__overview-bar-segment--raid"
              :style="{ height: `${bar.raidHeight}%` }"
            ></span>
            <span
              v-if="bar.lootHeight > 0"
              class="timeline__overview-bar-segment timeline__overview-bar-segment--loot"
              :style="{ height: `${bar.lootHeight}%` }"
            ></span>
            <span
              v-if="bar.attendanceHeight > 0"
              class="timeline__overview-bar-segment timeline__overview-bar-segment--attendance"
              :style="{ height: `${bar.attendanceHeight}%` }"
            ></span>
          </span>
        </div>
      </div>

      <div class="timeline__selection timeline__selection--overview" :style="selectionStyle">
        <button
          type="button"
          class="timeline__handle timeline__handle--start"
          @pointerdown.stop="handleHandlePointerDown('start', $event)"
          @dblclick.stop.prevent="moveHandleToBoundary('start')"
          :aria-label="`Adjust start date (${formatDateReadable(selectionStartMs)})`"
        ></button>
        <button
          type="button"
          class="timeline__handle timeline__handle--end"
          @pointerdown.stop="handleHandlePointerDown('end', $event)"
          @dblclick.stop.prevent="moveHandleToBoundary('end')"
          :aria-label="`Adjust end date (${formatDateReadable(selectionEndMs)})`"
        ></button>
      </div>
    </div>

    <div class="timeline__overview-legend" aria-label="Overview legend">
      <span class="timeline__legend-item timeline__legend-item--attendance">Attendance</span>
      <span class="timeline__legend-item timeline__legend-item--loot">Loot</span>
      <span class="timeline__legend-item timeline__legend-item--raid">Raids</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type TimelineActivityKind = 'attendance' | 'loot' | 'raid';

type TimelineActivityInput = {
  timestamp: string;
  kind: TimelineActivityKind;
};

type OverviewBucket = {
  key: string;
  startMs: number;
  endMs: number;
  label: string;
  left: number;
  width: number;
};

type OverviewActivityBar = {
  key: string;
  left: number;
  width: number;
  total: number;
  attendanceHeight: number;
  lootHeight: number;
  raidHeight: number;
};

// Time constants for range calculations
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const OVERVIEW_BAR_COUNT = 180;
const OVERVIEW_DRILL_RANGE_MS = MS_PER_DAY * 30;

// The earliest selectable date: 26 October 2025
const EARLIEST_DATE_MS = Date.UTC(2025, 9, 26); // Month is 0-indexed

const props = defineProps<{
  minDate: string;
  maxDate: string;
  startDate: string;
  endDate: string;
  disabled?: boolean;
  activityEvents?: TimelineActivityInput[];
}>();

const emit = defineEmits<{
  (e: 'update', range: { start: string; end: string }): void;
  (e: 'commit', range: { start: string; end: string }): void;
}>();

const trackRef = ref<HTMLDivElement | null>(null);

// Full timeline bounds shown by the ribbon.
const minMs = computed(() => Math.max(parseDate(props.minDate), EARLIEST_DATE_MS));
const maxMs = computed(() => parseDate(props.maxDate));
const totalRangeMs = computed(() => Math.max(maxMs.value - minMs.value, 1));

const viewStartMs = ref(0);
const viewEndMs = ref(0);

// Selection bounds
const selectionStartMs = ref(parseDate(props.startDate));
const selectionEndMs = ref(parseDate(props.endDate));

const draggingMode = ref<'start' | 'end' | 'range' | 'new' | null>(null);
const dragAnchorMs = ref<number | null>(null);
const dragStartSnapshot = ref<{ start: number; end: number } | null>(null);
const pointerCaptureEl = ref<HTMLElement | null>(null);
const activePointerId = ref<number | null>(null);

const activeViewRangeMs = computed(() => Math.max(maxMs.value - minMs.value, 1));

const overviewRangeLabel = computed(() => {
  const startLabel = formatDate(viewStartMs.value);
  const endLabel = formatDate(viewEndMs.value);
  return `${startLabel} — ${endLabel}`;
});

// Initialize view bounds when props change
function initializeViewBounds() {
  viewStartMs.value = minMs.value;
  viewEndMs.value = maxMs.value;
}

// Watch for prop changes and initialize/update bounds
watch(
  () => [props.minDate, props.maxDate],
  () => {
    initializeViewBounds();
  },
  { immediate: true }
);

watch(
  () => [props.startDate, props.endDate, minMs.value, maxMs.value],
  () => {
    if (draggingMode.value) {
      return;
    }
    const nextStart = clampMs(parseDate(props.startDate));
    const nextEnd = clampMs(parseDate(props.endDate));
    if (!nearlyEqual(selectionStartMs.value, nextStart)) {
      selectionStartMs.value = nextStart;
    }
    if (!nearlyEqual(selectionEndMs.value, nextEnd)) {
      selectionEndMs.value = nextEnd;
    }
    ensureOrder();
  }
);

const rangeMs = computed(() => activeViewRangeMs.value);

const selectionStyle = computed(() => {
  const startPercent = ((selectionStartMs.value - minMs.value) / rangeMs.value) * 100;
  const endPercent = ((selectionEndMs.value - minMs.value) / rangeMs.value) * 100;
  const left = Math.min(startPercent, endPercent);
  const width = Math.max(Math.abs(endPercent - startPercent), 0.5);
  // Clamp to visible area
  const clampedLeft = Math.max(0, left);
  const clampedRight = Math.min(100, left + width);
  const clampedWidth = Math.max(0, clampedRight - clampedLeft);
  return {
    left: `${clampedLeft}%`,
    width: `${clampedWidth}%`,
    top: '50%',
    transform: 'translateY(-50%)',
    display: clampedWidth > 0 ? 'flex' : 'none'
  };
});

const overviewBuckets = computed<OverviewBucket[]>(() => {
  const min = minMs.value;
  const max = maxMs.value;
  const range = totalRangeMs.value;
  const buckets: OverviewBucket[] = [];
  const bucketStarts: number[] = [];
  const first = new Date(min);
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1).getTime();

  while (cursor < max) {
    bucketStarts.push(cursor);
    const date = new Date(cursor);
    cursor = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  }

  const bucketRanges = bucketStarts.map((startMs, index) => {
    const nextStart = bucketStarts[index + 1] ?? max;
    const bucketStart = Math.max(startMs, min);
    const bucketEnd = Math.min(nextStart, max);
    return { startMs: bucketStart, endMs: bucketEnd };
  });

  for (const bucket of bucketRanges) {
    const date = new Date(bucket.startMs);
    const left = ((bucket.startMs - min) / range) * 100;
    const width = Math.max(((bucket.endMs - bucket.startMs) / range) * 100, 0.5);
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      startMs: bucket.startMs,
      endMs: bucket.endMs,
      label: date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      left,
      width
    });
  }

  return buckets;
});

const overviewActivityBars = computed<OverviewActivityBar[]>(() => {
  const min = minMs.value;
  const range = totalRangeMs.value;
  const binWidth = 100 / OVERVIEW_BAR_COUNT;
  const bins = Array.from({ length: OVERVIEW_BAR_COUNT }, () => ({
    attendance: 0,
    loot: 0,
    raid: 0,
    total: 0
  }));

  for (const event of props.activityEvents ?? []) {
    const eventMs = parseDate(event.timestamp);
    if (eventMs < minMs.value || eventMs > maxMs.value) {
      continue;
    }
    const index = clamp(
      Math.floor(((eventMs - min) / range) * OVERVIEW_BAR_COUNT),
      0,
      OVERVIEW_BAR_COUNT - 1
    );
    bins[index][event.kind] += 1;
    bins[index].total += 1;
  }

  const maxTotal = Math.max(1, ...bins.map((bin) => bin.total));

  return bins.map((bin, index) => {
    if (bin.total === 0) {
      return {
        key: `overview-bar-${index}`,
        left: index * binWidth,
        width: Math.max(binWidth * 0.72, 0.12),
        total: 0,
        attendanceHeight: 0,
        lootHeight: 0,
        raidHeight: 0
      };
    }

    const totalHeight = 9 + (bin.total / maxTotal) * 78;
    return {
      key: `overview-bar-${index}`,
      left: index * binWidth,
      width: Math.max(binWidth * 0.74, 0.12),
      total: bin.total,
      attendanceHeight: Math.max(
        (bin.attendance / bin.total) * totalHeight,
        bin.attendance > 0 ? 2.8 : 0
      ),
      lootHeight: Math.max((bin.loot / bin.total) * totalHeight, bin.loot > 0 ? 2.8 : 0),
      raidHeight: Math.max((bin.raid / bin.total) * totalHeight, bin.raid > 0 ? 3.5 : 0)
    };
  });
});

function moveHandleToBoundary(target: 'start' | 'end') {
  if (props.disabled) {
    return;
  }

  if (target === 'start') {
    selectionStartMs.value = minMs.value;
  } else {
    selectionEndMs.value = maxMs.value;
  }

  ensureOrder();
  emitSelectionUpdate();
  emitSelectionCommit();
}

function handleHandlePointerDown(mode: 'start' | 'end', event: PointerEvent) {
  if (props.disabled) {
    return;
  }
  event.preventDefault();
  beginDrag(mode, event);
}

function handleTrackPointerDown(event: PointerEvent) {
  if (props.disabled) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  const pointerMs = positionFromEvent(event);

  draggingMode.value = 'new';
  dragAnchorMs.value = pointerMs;
  selectionStartMs.value = pointerMs;
  selectionEndMs.value = pointerMs;
  emitSelectionUpdate();
  addPointerListeners();
}

function beginDrag(mode: 'start' | 'end' | 'range', event: PointerEvent) {
  draggingMode.value = mode;
  dragAnchorMs.value = positionFromEvent(event);
  dragStartSnapshot.value = { start: selectionStartMs.value, end: selectionEndMs.value };
  const target = event.target as HTMLElement | null;
  if (target?.setPointerCapture) {
    try {
      target.setPointerCapture(event.pointerId);
      pointerCaptureEl.value = target;
    } catch {
      pointerCaptureEl.value = null;
    }
  }
  activePointerId.value = event.pointerId;
  addPointerListeners();
}

function handlePointerMove(event: PointerEvent) {
  if (!draggingMode.value) {
    return;
  }
  const pointerMs = positionFromEvent(event);
  const min = minMs.value;
  const max = maxMs.value;

  if (draggingMode.value === 'start') {
    selectionStartMs.value = clamp(pointerMs, min, max);
  } else if (draggingMode.value === 'end') {
    selectionEndMs.value = clamp(pointerMs, min, max);
  } else if (draggingMode.value === 'range' && dragStartSnapshot.value) {
    const anchor = dragAnchorMs.value ?? pointerMs;
    const delta = pointerMs - anchor;
    let newStart = dragStartSnapshot.value.start + delta;
    let newEnd = dragStartSnapshot.value.end + delta;

    if (newStart < min) {
      const offset = min - newStart;
      newStart += offset;
      newEnd += offset;
    }

    if (newEnd > max) {
      const offset = newEnd - max;
      newStart -= offset;
      newEnd = max;
    }

    selectionStartMs.value = clamp(newStart, min, max);
    selectionEndMs.value = clamp(newEnd, min, max);
  } else if (draggingMode.value === 'new' && dragAnchorMs.value !== null) {
    selectionStartMs.value = clamp(Math.min(dragAnchorMs.value, pointerMs), min, max);
    selectionEndMs.value = clamp(Math.max(dragAnchorMs.value, pointerMs), min, max);
  }
  ensureOrder();
  emitSelectionUpdate();
}

function handlePointerUp(event: PointerEvent) {
  if (!draggingMode.value) {
    return;
  }
  const releaseId = activePointerId.value ?? event.pointerId;
  if (pointerCaptureEl.value?.releasePointerCapture && releaseId !== null) {
    try {
      pointerCaptureEl.value.releasePointerCapture(releaseId);
    } catch {
      // ignore
    }
  }
  pointerCaptureEl.value = null;
  activePointerId.value = null;
  draggingMode.value = null;
  dragAnchorMs.value = null;
  dragStartSnapshot.value = null;
  removePointerListeners();
  emitSelectionCommit();
}

function selectOverviewBucket(bucket: OverviewBucket) {
  if (props.disabled) {
    return;
  }
  selectionStartMs.value = clamp(bucket.startMs, minMs.value, maxMs.value);
  selectionEndMs.value = clamp(bucket.endMs, minMs.value, maxMs.value);
  ensureOrder();
  emitSelectionUpdate();
  emitSelectionCommit();
}

function drillIntoDenseRange() {
  if (props.disabled) {
    return;
  }

  const windowMs = Math.min(OVERVIEW_DRILL_RANGE_MS, totalRangeMs.value);
  const candidates = (props.activityEvents ?? [])
    .map((event) => parseDate(event.timestamp))
    .filter((eventMs) => eventMs >= minMs.value && eventMs <= maxMs.value)
    .sort((a, b) => a - b);

  if (candidates.length === 0) {
    selectionStartMs.value = Math.max(minMs.value, maxMs.value - windowMs);
    selectionEndMs.value = maxMs.value;
  } else {
    let bestStart = candidates[0];
    let bestCount = 0;
    let endIndex = 0;

    for (let startIndex = 0; startIndex < candidates.length; startIndex += 1) {
      const start = candidates[startIndex];
      const end = start + windowMs;
      while (endIndex < candidates.length && candidates[endIndex] <= end) {
        endIndex += 1;
      }
      const count = endIndex - startIndex;
      if (count > bestCount) {
        bestCount = count;
        bestStart = start;
      }
    }

    const nextStart = clamp(bestStart, minMs.value, Math.max(minMs.value, maxMs.value - windowMs));
    selectionStartMs.value = nextStart;
    selectionEndMs.value = Math.min(maxMs.value, nextStart + windowMs);
  }

  ensureOrder();
  emitSelectionUpdate();
  emitSelectionCommit();
}

function addPointerListeners() {
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: false });
  window.addEventListener('pointercancel', handlePointerUp, { once: false });
}

function removePointerListeners() {
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
  window.removeEventListener('pointercancel', handlePointerUp);
}

onMounted(() => {
  selectionStartMs.value = clampMs(selectionStartMs.value);
  selectionEndMs.value = clampMs(selectionEndMs.value);
  ensureOrder();
  initializeViewBounds();
});

onBeforeUnmount(() => {
  removePointerListeners();
});

function ensureOrder() {
  if (selectionStartMs.value > selectionEndMs.value) {
    const temp = selectionStartMs.value;
    selectionStartMs.value = selectionEndMs.value;
    selectionEndMs.value = temp;
  }
}

function emitSelectionUpdate() {
  const payload = {
    start: new Date(selectionStartMs.value).toISOString(),
    end: new Date(selectionEndMs.value).toISOString()
  };
  emit('update', payload);
}

function emitSelectionCommit() {
  const payload = {
    start: new Date(selectionStartMs.value).toISOString(),
    end: new Date(selectionEndMs.value).toISOString()
  };
  emit('commit', payload);
}

function positionFromEvent(event: PointerEvent): number {
  const track = trackRef.value;
  if (!track) {
    return minMs.value;
  }
  const rect = track.getBoundingClientRect();
  const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
  const clamped = Math.max(0, Math.min(1, ratio));
  const positionMs = minMs.value + clamped * activeViewRangeMs.value;
  return clamp(positionMs, minMs.value, maxMs.value);
}

function clampMs(ms: number): number {
  return clamp(ms, minMs.value, maxMs.value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function parseDate(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Date.now() : ms;
}

function formatDate(msOrIso: number | string): string {
  const ms = typeof msOrIso === 'string' ? parseDate(msOrIso) : msOrIso;
  return formatDateReadable(ms);
}

function formatDateReadable(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: rgba(15, 23, 42, 0.68);
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  padding: 1rem 1.25rem 1.75rem;
}

.timeline--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.timeline__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1.75rem;
}

.timeline__labels {
  display: flex;
  justify-content: space-between;
  flex: 1;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.timeline__label--end {
  text-align: right;
}

.timeline__summary {
  position: absolute;
  left: 50%;
  bottom: -0.35rem;
  transform: translateX(-50%);
}

.timeline__track {
  position: relative;
  height: 48px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.92));
  border: 1px solid rgba(148, 163, 184, 0.25);
  overflow: visible;
  cursor: crosshair;
}

.timeline__overview-track {
  height: 118px;
  border-radius: 0.65rem;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(14, 165, 233, 0.08), rgba(59, 130, 246, 0.06)),
    linear-gradient(180deg, rgba(8, 25, 52, 0.96), rgba(7, 23, 48, 0.9));
  border-color: rgba(56, 189, 248, 0.9);
  box-shadow:
    inset 0 0 0 1px rgba(14, 165, 233, 0.22),
    0 0 0 1px rgba(14, 165, 233, 0.18),
    0 0 24px rgba(14, 165, 233, 0.18);
}

.timeline__overview-track::before {
  content: '';
  position: absolute;
  inset: 34px 0 20px;
  background:
    repeating-linear-gradient(
      90deg,
      rgba(125, 211, 252, 0.08) 0,
      rgba(125, 211, 252, 0.08) 1px,
      transparent 1px,
      transparent 8px
    ),
    linear-gradient(180deg, rgba(14, 165, 233, 0.12), transparent);
  pointer-events: none;
  z-index: 0;
}

.timeline__overview-frame {
  position: absolute;
  inset: 0;
  padding: 0.65rem 0.8rem 0.75rem;
  z-index: 4;
  pointer-events: none;
}

.timeline__overview-range-label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.7rem;
  font-size: 0.58rem;
  letter-spacing: 0.03em;
  color: rgba(226, 232, 240, 0.66);
}

.timeline__overview-range-label strong {
  font-size: 0.64rem;
  color: rgba(226, 232, 240, 0.9);
  font-weight: 700;
  white-space: nowrap;
}

.timeline__overview-range-label span:last-child {
  text-align: right;
}

.timeline__overview-months {
  position: absolute;
  left: 0.8rem;
  right: 0.8rem;
  top: 2.35rem;
  height: 1rem;
}

.timeline__overview-month {
  position: absolute;
  top: 0;
  height: 1rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(191, 219, 254, 0.72);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  text-transform: uppercase;
  cursor: pointer;
  overflow: hidden;
  pointer-events: auto;
  white-space: nowrap;
}

.timeline__overview-month:hover,
.timeline__overview-month:focus-visible {
  color: #e0f2fe;
  outline: none;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.55);
}

.timeline__overview-bars {
  position: absolute;
  left: 0.8rem;
  right: 0.8rem;
  bottom: 0.85rem;
  height: 58px;
  pointer-events: none;
}

.timeline__overview-bars::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: rgba(125, 211, 252, 0.4);
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.28);
}

.timeline__overview-bar {
  position: absolute;
  bottom: 1px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  min-width: 1px;
  max-width: 5px;
  overflow: hidden;
  opacity: 0.92;
}

.timeline__overview-bar-segment {
  display: block;
  width: 100%;
  min-height: 1px;
}

.timeline__overview-bar-segment--attendance {
  background: linear-gradient(to top, rgba(14, 165, 233, 0.7), rgba(125, 211, 252, 0.95));
  box-shadow: 0 0 5px rgba(56, 189, 248, 0.35);
}

.timeline__overview-bar-segment--loot {
  background: linear-gradient(to top, rgba(217, 119, 6, 0.85), rgba(251, 191, 36, 0.95));
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.45);
}

.timeline__overview-bar-segment--raid {
  background: linear-gradient(to top, rgba(124, 58, 237, 0.78), rgba(196, 181, 253, 0.92));
  box-shadow: 0 0 6px rgba(167, 139, 250, 0.38);
}

.timeline__overview-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 1rem;
  margin-top: -0.25rem;
  font-size: 0.62rem;
  color: rgba(226, 232, 240, 0.72);
}

.timeline__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.timeline__legend-item::before {
  content: '';
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 2px;
}

.timeline__legend-item--attendance::before {
  background: #38bdf8;
}

.timeline__legend-item--loot::before {
  background: #f59e0b;
}

.timeline__legend-item--raid::before {
  background: #a78bfa;
}

.timeline__selection {
  position: absolute;
  left: 0;
  height: 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}

.timeline__selection::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.45), rgba(14, 165, 233, 0.3));
  border: 1px solid rgba(56, 189, 248, 0.65);
  border-radius: inherit;
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.22);
  pointer-events: none;
  z-index: 1;
}

.timeline__selection--overview {
  height: 86px;
  top: 58% !important;
  border-radius: 0.5rem;
  pointer-events: none;
  z-index: 5;
}

.timeline__selection--overview::before {
  background: rgba(14, 165, 233, 0.12);
  border-color: rgba(56, 189, 248, 0.92);
  box-shadow:
    inset 0 0 0 1px rgba(125, 211, 252, 0.24),
    0 0 18px rgba(14, 165, 233, 0.24);
}

.timeline__handle {
  pointer-events: auto;
  position: absolute;
  top: 50%;
  width: 14px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(15, 23, 42, 0.85);
  cursor: ew-resize;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
  transform: translate(-50%, -50%);
  z-index: 5;
}

.timeline__handle:hover,
.timeline__handle:focus-visible {
  transform: translate(-50%, -50%) scale(1.05);
  border-color: rgba(59, 130, 246, 0.8);
  background: rgba(2, 132, 199, 0.65);
}

.timeline__handle:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.65);
  outline-offset: 2px;
}

.timeline__handle--start {
  left: 0;
  transform: translate(-50%, -50%);
}

.timeline__handle--end {
  left: 100%;
  transform: translate(-50%, -50%);
}

.timeline__mode {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
  padding-left: 1rem;
}

.timeline__mode-filter {
  font-size: 0.68rem;
  font-weight: 700;
  color: rgba(125, 211, 252, 0.9);
  white-space: nowrap;
}

.timeline__mode-filter::after {
  content: '';
  display: inline-block;
  width: 0;
  height: 0;
  margin-left: 0.35rem;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-top: 4px solid currentColor;
  vertical-align: middle;
}

.timeline__drill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 0.4rem;
  background: rgba(15, 23, 42, 0.58);
  color: rgba(226, 232, 240, 0.86);
  font-size: 0.66rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.timeline__drill-btn:hover:not(:disabled),
.timeline__drill-btn:focus-visible {
  background: rgba(14, 165, 233, 0.14);
  border-color: rgba(56, 189, 248, 0.5);
  color: #e0f2fe;
  outline: none;
}

.timeline__drill-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .timeline {
    padding: 0.85rem 1rem;
  }
}
</style>
