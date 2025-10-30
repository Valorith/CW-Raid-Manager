<template>
  <section class="timeline" :class="{ 'timeline--disabled': disabled }">
    <header class="timeline__header">
      <div class="timeline__labels">
        <span class="timeline__label">{{ formatDate(minDate) }}</span>
        <span class="timeline__label timeline__label--end">{{ formatDate(maxDate) }}</span>
      </div>
      <div class="timeline__summary">
        <slot />
      </div>
    </header>

    <div
      ref="trackRef"
      class="timeline__track"
      @pointerdown="handleTrackPointerDown"
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

const minMs = computed(() => parseDate(props.minDate));
const maxMs = computed(() => parseDate(props.maxDate));

const selectionStartMs = ref(parseDate(props.startDate));
const selectionEndMs = ref(parseDate(props.endDate));

const draggingMode = ref<'start' | 'end' | 'range' | 'new' | null>(null);
const dragAnchorMs = ref<number | null>(null);
const dragStartSnapshot = ref<{ start: number; end: number } | null>(null);
const pointerCaptureEl = ref<HTMLElement | null>(null);
const activePointerId = ref<number | null>(null);

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

const rangeMs = computed(() => Math.max(maxMs.value - minMs.value, 1));

const selectionStyle = computed(() => {
  const startPercent = ((selectionStartMs.value - minMs.value) / rangeMs.value) * 100;
  const endPercent = ((selectionEndMs.value - minMs.value) / rangeMs.value) * 100;
  const left = Math.min(startPercent, endPercent);
  const width = Math.max(Math.abs(endPercent - startPercent), 0.5);
  return {
    left: `${left}%`,
    width: `${width}%`,
    top: '50%',
    transform: 'translateY(-50%)'
  };
});

const tickMarkers = computed(() => {
  const ticks: Array<{ date: string; percent: number; label: string }> = [];
  const min = minMs.value;
  const max = maxMs.value;

  const pushTick = (targetMs: number) => {
    const clamped = clamp(targetMs, min, max);
    const percent = ((clamped - min) / rangeMs.value) * 100;
    const last = ticks[ticks.length - 1];
    if (last && Math.abs(last.percent - percent) < 0.05) {
      return;
    }
    ticks.push({
      date: new Date(clamped).toISOString(),
      percent,
      label: formatTickLabel(targetMs)
    });
  };

  pushTick(min);

  let cursor = nextDayStartMs(min);
  while (cursor < max) {
    pushTick(cursor);
    cursor = nextDayStartMs(cursor);
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
  const min = minMs.value;
  const max = maxMs.value;
  if (max <= min) {
    return segments;
  }

  let bandStart = min;
  let bandIndex = 0;

  while (bandStart < max) {
    const bandEndCandidate = nextDayStartMs(bandStart);
    const bandEnd = Math.min(bandEndCandidate, max);
    const widthMs = bandEnd - bandStart;
    if (widthMs > 0) {
      const left = ((bandStart - min) / rangeMs.value) * 100;
      const width = (widthMs / rangeMs.value) * 100;
      const center = left + width / 2;
      segments.push({
        key: `band-${bandStart}`,
        left,
        width,
        center,
        label: formatDayLabel(bandStart),
        alt: bandIndex % 2 === 1
      });
      bandIndex += 1;
    }
    if (bandEnd <= bandStart) {
      break;
    }
    bandStart = bandEnd;
  }

  return segments;
});

const eventSegments = computed<EventSegment[]>(() => {
  const events = props.eventDates ?? [];
  const segments: EventSegment[] = [];

  events.forEach(({ start, end, label, startLabel, endLabel }, idx) => {
    const startMs = parseDate(start);
    const endMs = parseDate(end);
    const clampedStart = clamp(Math.min(startMs, endMs), minMs.value, maxMs.value);
    const clampedEnd = clamp(Math.max(startMs, endMs), minMs.value, maxMs.value);
    if (clampedEnd <= clampedStart) {
      return;
    }
    const left = ((clampedStart - minMs.value) / rangeMs.value) * 100;
    const width = ((clampedEnd - clampedStart) / rangeMs.value) * 100;
    const finalStartIso = new Date(clampedStart).toISOString();
    const finalEndIso = new Date(clampedEnd).toISOString();
    segments.push({
      key: `${start}-${end}-${idx}`,
      left,
      width,
      label: label ?? `${formatDateTime(clampedStart)} — ${formatDateTime(clampedEnd)}`,
      start: finalStartIso,
      end: finalEndIso,
      startLabel: startLabel ?? formatDateTime(clampedStart),
      endLabel: endLabel ?? formatDateTime(clampedEnd)
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
    const length = Math.max(dragStartSnapshot.value.end - dragStartSnapshot.value.start, 0);
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
    return minMs.value;
  }
  const rect = track.getBoundingClientRect();
  const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
  const clamped = Math.max(0, Math.min(1, ratio));
  return clamp(minMs.value + clamped * rangeMs.value, minMs.value, maxMs.value);
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

function nextDayStartMs(ms: number): number {
  const date = new Date(ms);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function formatDate(iso: string): string {
  return formatDateReadable(parseDate(iso));
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

function formatTickLabel(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
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
  padding: 1rem 1.25rem;
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

@media (max-width: 640px) {
  .timeline {
    padding: 0.85rem 1rem;
  }

  .timeline__tick-label {
    display: none;
  }
}
</style>
