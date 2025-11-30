<template>
  <section class="timeline" :class="{ 'timeline--disabled': disabled }">
    <header class="timeline__header">
      <div class="timeline__labels">
        <span class="timeline__label">{{ formatDate(viewStartMs) }}</span>
        <span class="timeline__label timeline__label--end">{{ formatDate(viewEndMs) }}</span>
      </div>
      <div class="timeline__summary">
        <slot />
      </div>
      <div class="timeline__zoom-controls">
        <button
          type="button"
          class="timeline__zoom-btn"
          :disabled="disabled || !canZoomIn"
          @click="handleZoomIn"
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <span class="timeline__zoom-level">{{ zoomLevelLabel }}</span>
        <button
          type="button"
          class="timeline__zoom-btn"
          :disabled="disabled || !canZoomOut"
          @click="handleZoomOut"
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button
          type="button"
          class="timeline__zoom-btn timeline__zoom-btn--reset"
          :disabled="disabled || isFullyZoomedOut"
          @click="resetZoom"
          aria-label="Reset zoom"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    </header>

    <div
      ref="trackRef"
      class="timeline__track"
      @pointerdown="handleTrackPointerDown"
      @wheel.prevent="handleWheel"
    >
      <div class="timeline__ticks">
        <span
          v-for="tick in tickMarkers"
          :key="tick.date"
          class="timeline__tick"
          :style="{ left: `${tick.percent}%` }"
        >
          <span class="timeline__tick-label">{{ tick.label }}</span>
        </span>
      </div>

      <div class="timeline__daybands">
        <span
          v-for="band in dayBands"
          :key="band.key"
          class="timeline__dayband"
          :class="{ 'timeline__dayband--alt': band.alt }"
          :style="{ left: `${band.left}%`, width: `${band.width}%` }"
        ></span>
        <span
          v-for="band in dayBands"
          :key="`${band.key}-label`"
          class="timeline__dayband-label"
          :style="{ left: `${band.center}%` }"
        >
          <span class="timeline__dayband-label-inner">{{ band.label }}</span>
        </span>
      </div>

      <div class="timeline__event-range">
        <span
          v-for="segment in eventSegments"
          :key="segment.key"
          :class="['timeline__event', { 'timeline__event--active': hoveredEvent?.key === segment.key }]"
          :style="{ left: `${segment.left}%`, width: `${segment.width}%` }"
          role="presentation"
          tabindex="0"
          :aria-label="segment.label"
          @mouseenter="setActiveEvent(segment)"
          @mouseleave="clearActiveEvent(segment)"
          @focus="setActiveEvent(segment)"
          @blur="clearActiveEvent(segment)"
        >
          <span
            v-if="hoveredEvent?.key === segment.key"
            class="timeline__event-tooltip"
            role="tooltip"
          >
            <strong class="timeline__event-tooltip-title">{{ segment.label }}</strong>
            <span class="timeline__event-tooltip-row">
              <span class="timeline__event-tooltip-term">Start</span>
              <span class="timeline__event-tooltip-value">{{ segment.startLabel }}</span>
            </span>
            <span class="timeline__event-tooltip-row">
              <span class="timeline__event-tooltip-term">End</span>
              <span class="timeline__event-tooltip-value">{{ segment.endLabel }}</span>
            </span>
          </span>
        </span>
      </div>

      <div
        class="timeline__selection"
        :style="selectionStyle"
        @pointerdown="handleSelectionPointerDown"
      >
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
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type TimelineEventInput = {
  start: string;
  end: string;
  label?: string;
  startLabel?: string;
  endLabel?: string;
};

type EventSegment = {
  key: string;
  left: number;
  width: number;
  label: string;
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
};

// Time constants for zoom levels
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

// Minimum visible range (1 hour) to prevent over-zooming
const MIN_VISIBLE_RANGE_MS = MS_PER_HOUR;

// The earliest selectable date: 26 October 2025
const EARLIEST_DATE_MS = Date.UTC(2025, 9, 26); // Month is 0-indexed

const props = defineProps<{
  minDate: string;
  maxDate: string;
  startDate: string;
  endDate: string;
  disabled?: boolean;
  eventDates?: TimelineEventInput[];
}>();

const emit = defineEmits<{
  (e: 'update', range: { start: string; end: string }): void;
  (e: 'commit', range: { start: string; end: string }): void;
}>();

const trackRef = ref<HTMLDivElement | null>(null);
const hoveredEvent = ref<EventSegment | null>(null);

// Full timeline bounds (never changes based on zoom)
const minMs = computed(() => Math.max(parseDate(props.minDate), EARLIEST_DATE_MS));
const maxMs = computed(() => parseDate(props.maxDate));
const totalRangeMs = computed(() => Math.max(maxMs.value - minMs.value, 1));

// Zoomed view bounds (what's currently visible)
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

// The currently visible range in ms
const viewRangeMs = computed(() => Math.max(viewEndMs.value - viewStartMs.value, 1));

// Zoom level computation
const zoomRatio = computed(() => totalRangeMs.value / viewRangeMs.value);
const canZoomIn = computed(() => viewRangeMs.value > MIN_VISIBLE_RANGE_MS);
const canZoomOut = computed(() => zoomRatio.value > 1.01);
const isFullyZoomedOut = computed(() => !canZoomOut.value);

// Human-readable zoom level label
const zoomLevelLabel = computed(() => {
  const range = viewRangeMs.value;
  if (range >= MS_PER_YEAR * 2) {
    const years = Math.round(range / MS_PER_YEAR);
    return `${years}y`;
  }
  if (range >= MS_PER_YEAR) {
    const months = Math.round(range / MS_PER_MONTH);
    return `${months}mo`;
  }
  if (range >= MS_PER_MONTH) {
    const months = Math.round(range / MS_PER_MONTH);
    return `${months}mo`;
  }
  if (range >= MS_PER_WEEK) {
    const weeks = Math.round(range / MS_PER_WEEK);
    return `${weeks}w`;
  }
  if (range >= MS_PER_DAY) {
    const days = Math.round(range / MS_PER_DAY);
    return `${days}d`;
  }
  const hours = Math.max(1, Math.round(range / MS_PER_HOUR));
  return `${hours}h`;
});

// Initialize view bounds when props change
function initializeViewBounds() {
  viewStartMs.value = minMs.value;
  viewEndMs.value = maxMs.value;
}

// Zoom in/out with optional focus point (0-1 ratio of track position)
function zoom(factor: number, focusRatio = 0.5) {
  const currentRange = viewRangeMs.value;
  let newRange = currentRange / factor;

  // Clamp to min/max ranges
  newRange = Math.max(MIN_VISIBLE_RANGE_MS, Math.min(newRange, totalRangeMs.value));

  // Calculate the focus point in ms
  const focusMs = viewStartMs.value + currentRange * focusRatio;

  // Calculate new bounds centered on focus point
  let newStart = focusMs - newRange * focusRatio;
  let newEnd = focusMs + newRange * (1 - focusRatio);

  // Clamp to overall bounds
  if (newStart < minMs.value) {
    const shift = minMs.value - newStart;
    newStart = minMs.value;
    newEnd = Math.min(newEnd + shift, maxMs.value);
  }
  if (newEnd > maxMs.value) {
    const shift = newEnd - maxMs.value;
    newEnd = maxMs.value;
    newStart = Math.max(newStart - shift, minMs.value);
  }

  viewStartMs.value = newStart;
  viewEndMs.value = newEnd;
}

function handleZoomIn() {
  zoom(1.5, 0.5);
}

function handleZoomOut() {
  zoom(0.67, 0.5);
}

function resetZoom() {
  initializeViewBounds();
}

function handleWheel(event: WheelEvent) {
  if (props.disabled) return;

  const track = trackRef.value;
  if (!track) return;

  // Calculate focus point based on mouse position
  const rect = track.getBoundingClientRect();
  const focusRatio = rect.width === 0 ? 0.5 : (event.clientX - rect.left) / rect.width;
  const clampedFocus = Math.max(0, Math.min(1, focusRatio));

  // Determine zoom direction and strength
  // Normalize delta for consistent behavior across browsers/devices
  const delta = event.deltaY || event.deltaX;
  const zoomStrength = Math.min(Math.abs(delta) / 100, 0.5) + 0.1;

  if (delta < 0) {
    // Scroll up = zoom in
    zoom(1 + zoomStrength, clampedFocus);
  } else if (delta > 0) {
    // Scroll down = zoom out
    zoom(1 / (1 + zoomStrength), clampedFocus);
  }
}

// Watch for prop changes and initialize/update bounds
watch(
  () => [props.minDate, props.maxDate],
  () => {
    // When overall bounds change, re-initialize view if needed
    if (viewStartMs.value === 0 || viewEndMs.value === 0) {
      initializeViewBounds();
    } else {
      // Clamp existing view to new bounds
      viewStartMs.value = Math.max(viewStartMs.value, minMs.value);
      viewEndMs.value = Math.min(viewEndMs.value, maxMs.value);
      // Ensure minimum visible range
      if (viewEndMs.value - viewStartMs.value < MIN_VISIBLE_RANGE_MS) {
        initializeViewBounds();
      }
    }
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

// Use view bounds for calculations instead of full bounds
const rangeMs = computed(() => viewRangeMs.value);

const selectionStyle = computed(() => {
  const startPercent = ((selectionStartMs.value - viewStartMs.value) / rangeMs.value) * 100;
  const endPercent = ((selectionEndMs.value - viewStartMs.value) / rangeMs.value) * 100;
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

const tickMarkers = computed(() => {
  const ticks: Array<{ date: string; percent: number; label: string }> = [];
  const min = viewStartMs.value;
  const max = viewEndMs.value;
  const range = viewRangeMs.value;

  // Adaptive tick spacing based on visible range
  let tickInterval: number;
  if (range <= MS_PER_DAY) {
    // Less than a day: show hourly ticks
    tickInterval = MS_PER_HOUR;
  } else if (range <= MS_PER_WEEK) {
    // Less than a week: show 6-hour ticks
    tickInterval = MS_PER_HOUR * 6;
  } else if (range <= MS_PER_MONTH) {
    // Less than a month: show daily ticks
    tickInterval = MS_PER_DAY;
  } else if (range <= MS_PER_MONTH * 3) {
    // Less than 3 months: show weekly ticks
    tickInterval = MS_PER_WEEK;
  } else if (range <= MS_PER_YEAR) {
    // Less than a year: show monthly ticks
    tickInterval = MS_PER_MONTH;
  } else {
    // More than a year: show quarterly ticks
    tickInterval = MS_PER_MONTH * 3;
  }

  // Minimum pixel spacing between ticks (prevents overcrowding)
  const minTickSpacingPercent = 3;

  const pushTick = (targetMs: number) => {
    const clamped = clamp(targetMs, min, max);
    const percent = ((clamped - min) / range) * 100;
    const last = ticks[ticks.length - 1];
    if (last && Math.abs(last.percent - percent) < minTickSpacingPercent) {
      return;
    }
    ticks.push({
      date: new Date(clamped).toISOString(),
      percent,
      label: formatTickLabelAdaptive(targetMs, range)
    });
  };

  pushTick(min);

  // Find first aligned tick point after min
  let cursor = Math.ceil(min / tickInterval) * tickInterval;
  while (cursor < max) {
    pushTick(cursor);
    cursor += tickInterval;
  }

  pushTick(max);

  return ticks;
});

const dayBands = computed(() => {
  const segments: Array<{
    key: string;
    left: number;
    width: number;
    center: number;
    alt: boolean;
    label: string;
  }> = [];
  const min = viewStartMs.value;
  const max = viewEndMs.value;
  const range = viewRangeMs.value;

  if (max <= min) {
    return segments;
  }

  // Adaptive band sizing based on visible range
  let bandInterval: number;
  let formatFn: (ms: number) => string;

  if (range <= MS_PER_DAY * 2) {
    // Less than 2 days: show 6-hour bands
    bandInterval = MS_PER_HOUR * 6;
    formatFn = (ms) => formatTimeOnly(ms);
  } else if (range <= MS_PER_WEEK * 2) {
    // Less than 2 weeks: show daily bands
    bandInterval = MS_PER_DAY;
    formatFn = formatDayLabel;
  } else if (range <= MS_PER_MONTH * 3) {
    // Less than 3 months: show weekly bands
    bandInterval = MS_PER_WEEK;
    formatFn = (ms) => formatWeekLabel(ms);
  } else if (range <= MS_PER_YEAR * 2) {
    // Less than 2 years: show monthly bands
    bandInterval = MS_PER_MONTH;
    formatFn = (ms) => formatMonthLabel(ms);
  } else {
    // More than 2 years: show quarterly bands
    bandInterval = MS_PER_MONTH * 3;
    formatFn = (ms) => formatQuarterLabel(ms);
  }

  // Align band start to interval boundary
  let bandStart = Math.floor(min / bandInterval) * bandInterval;
  let bandIndex = Math.floor(bandStart / bandInterval);

  while (bandStart < max) {
    const bandEndCandidate = bandStart + bandInterval;
    const visibleStart = Math.max(bandStart, min);
    const visibleEnd = Math.min(bandEndCandidate, max);
    const widthMs = visibleEnd - visibleStart;

    if (widthMs > 0) {
      const left = ((visibleStart - min) / range) * 100;
      const width = (widthMs / range) * 100;
      const center = left + width / 2;
      segments.push({
        key: `band-${bandStart}`,
        left,
        width,
        center,
        label: formatFn(bandStart),
        alt: bandIndex % 2 === 1
      });
    }

    bandStart = bandEndCandidate;
    bandIndex += 1;

    if (bandStart <= min && bandEndCandidate <= min) {
      break;
    }
  }

  return segments;
});

const eventSegments = computed<EventSegment[]>(() => {
  const events = props.eventDates ?? [];
  const segments: EventSegment[] = [];
  const min = viewStartMs.value;
  const max = viewEndMs.value;
  const range = viewRangeMs.value;

  events.forEach(({ start, end, label, startLabel, endLabel }, idx) => {
    const startMs = parseDate(start);
    const endMs = parseDate(end);
    const eventStart = Math.min(startMs, endMs);
    const eventEnd = Math.max(startMs, endMs);

    // Skip events entirely outside the view
    if (eventEnd <= min || eventStart >= max) {
      return;
    }

    // Clamp to visible range
    const clampedStart = clamp(eventStart, min, max);
    const clampedEnd = clamp(eventEnd, min, max);

    if (clampedEnd <= clampedStart) {
      return;
    }

    const left = ((clampedStart - min) / range) * 100;
    const width = ((clampedEnd - clampedStart) / range) * 100;
    const finalStartIso = new Date(eventStart).toISOString();
    const finalEndIso = new Date(eventEnd).toISOString();
    segments.push({
      key: `${start}-${end}-${idx}`,
      left,
      width,
      label: label ?? `${formatDateTime(eventStart)} — ${formatDateTime(eventEnd)}`,
      start: finalStartIso,
      end: finalEndIso,
      startLabel: startLabel ?? formatDateTime(eventStart),
      endLabel: endLabel ?? formatDateTime(eventEnd)
    });
  });

  return segments;
});

watch(
  () => eventSegments.value,
  () => {
    hoveredEvent.value = null;
  }
);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      hoveredEvent.value = null;
    }
  }
);

function setActiveEvent(segment: EventSegment) {
  if (props.disabled) {
    return;
  }
  hoveredEvent.value = segment;
}

function clearActiveEvent(segment: EventSegment) {
  if (hoveredEvent.value?.key === segment.key) {
    hoveredEvent.value = null;
  }
}

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
  hoveredEvent.value = null;
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
  hoveredEvent.value = null;
  const pointerMs = positionFromEvent(event);
  const selectionStart = selectionStartMs.value;
  const selectionEnd = selectionEndMs.value;
  const lower = Math.min(selectionStart, selectionEnd);
  const upper = Math.max(selectionStart, selectionEnd);

  if (pointerMs >= lower && pointerMs <= upper) {
    beginDrag('range', event);
    return;
  }

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
  hoveredEvent.value = null;
  removePointerListeners();
  emitSelectionCommit();
}

function handleSelectionPointerDown(event: PointerEvent) {
  if (props.disabled) {
    return;
  }
  event.stopPropagation();
  event.preventDefault();
  hoveredEvent.value = null;
  beginDrag('range', event);
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
    return viewStartMs.value;
  }
  const rect = track.getBoundingClientRect();
  const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
  const clamped = Math.max(0, Math.min(1, ratio));
  // Map position to view bounds, but clamp result to full bounds
  const positionMs = viewStartMs.value + clamped * viewRangeMs.value;
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

function formatDayLabel(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatTimeOnly(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatWeekLabel(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function formatMonthLabel(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  });
}

function formatQuarterLabel(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
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

function formatTickLabelAdaptive(ms: number, range: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  // Adapt format based on visible range
  if (range <= MS_PER_DAY) {
    // Show time for sub-day ranges
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  if (range <= MS_PER_WEEK * 2) {
    // Show day and month for up to 2 weeks
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }
  if (range <= MS_PER_MONTH * 6) {
    // Show month and day for up to 6 months
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }
  // Show month and year for longer ranges
  return date.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  });
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

function formatDateTime(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.92));
  border: 1px solid rgba(148, 163, 184, 0.25);
  overflow: visible;
  cursor: crosshair;
}

.timeline__ticks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.timeline__tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.timeline__tick::before {
  content: '';
  width: 2px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(148, 163, 184, 0.32),
    rgba(148, 163, 184, 0.18)
  );
  box-shadow:
    0 0 6px rgba(148, 163, 184, 0.18),
    0 0 1px rgba(148, 163, 184, 0.35);
}

.timeline__tick::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.55);
  box-shadow: 0 0 8px rgba(148, 163, 184, 0.45);
}

.timeline__tick-label {
  position: absolute;
  top: 100%;
  transform: translate(-50%, 0.35rem);
  font-size: 0.7rem;
  white-space: nowrap;
  color: rgba(226, 232, 240, 0.62);
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.9);
}

.timeline__daybands {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.timeline__dayband {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(148, 163, 184, 0.06);
}

.timeline__dayband--alt {
  background: rgba(148, 163, 184, 0.1);
}

.timeline__dayband-label {
  position: absolute;
  top: -1.65rem;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 4;
  white-space: nowrap;
}

.timeline__dayband-label-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: rgba(226, 232, 240, 0.85);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.35);
}

.timeline__event-range {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
  display: block;
}

.timeline__event {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0.4));
  pointer-events: auto;
  border-radius: inherit;
  cursor: pointer;
  transition:
    background 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

.timeline__event:hover,
.timeline__event:focus-visible,
.timeline__event--active {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.32), rgba(249, 115, 22, 0.6));
  box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.3);
  outline: none;
}

.timeline__event:focus-visible {
  box-shadow:
    inset 0 0 0 1px rgba(249, 115, 22, 0.55),
    0 0 0 2px rgba(249, 115, 22, 0.35);
}

.timeline__event-tooltip {
  position: absolute;
  top: -0.75rem;
  left: 50%;
  transform: translate(-50%, -100%) translateY(-0.35rem);
  min-width: 12rem;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(249, 115, 22, 0.35);
  padding: 0.4rem 0.6rem;
  border-radius: 0.65rem;
  font-size: 0.68rem;
  color: #fed7aa;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.45);
  z-index: 6;
}

.timeline__event-tooltip-title {
  font-weight: 600;
  font-size: 0.72rem;
  color: #fed7aa;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.6);
}

.timeline__event-tooltip-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
}

.timeline__event-tooltip-term {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(226, 232, 240, 0.7);
}

.timeline__event-tooltip-value {
  font-size: 0.68rem;
  color: #e2e8f0;
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

.timeline__zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  padding-left: 1rem;
}

.timeline__zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.6);
  color: rgba(226, 232, 240, 0.85);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.timeline__zoom-btn svg {
  width: 14px;
  height: 14px;
}

.timeline__zoom-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  color: rgba(226, 232, 240, 1);
  transform: scale(1.05);
}

.timeline__zoom-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.timeline__zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.timeline__zoom-btn--reset {
  margin-left: 0.25rem;
}

.timeline__zoom-level {
  font-size: 0.68rem;
  font-weight: 500;
  min-width: 2.5rem;
  text-align: center;
  color: rgba(148, 163, 184, 0.9);
  letter-spacing: 0.02em;
  padding: 0.15rem 0.35rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

@media (max-width: 640px) {
  .timeline {
    padding: 0.85rem 1rem;
  }

  .timeline__tick-label {
    display: none;
  }

  .timeline__zoom-controls {
    position: absolute;
    right: 0;
    top: -0.25rem;
    padding-left: 0;
  }

  .timeline__zoom-level {
    display: none;
  }

  .timeline__zoom-btn {
    width: 22px;
    height: 22px;
  }

  .timeline__zoom-btn svg {
    width: 12px;
    height: 12px;
  }
}
</style>
