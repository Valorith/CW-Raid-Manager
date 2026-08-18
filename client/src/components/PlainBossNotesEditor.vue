<template>
  <div ref="editorRef" class="visual-boss-editor">
    <div class="visual-boss-editor__bar">
      <div class="visual-boss-editor__identity">
        <span class="visual-boss-editor__status-dot" aria-hidden="true"></span>
        <span>
          <strong>Editing strategy</strong>
          <small>Click the words you want to change</small>
        </span>
      </div>
      <div class="visual-boss-editor__tools" role="toolbar" aria-label="Editing tools">
        <span class="visual-boss-editor__word-count">
          {{ wordCount }} {{ wordCount === 1 ? 'word' : 'words' }}
        </span>
        <button
          type="button"
          :disabled="!canUndo"
          title="Undo (Command or Control + Z)"
          aria-label="Undo"
          @click="undo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7 4 12l5 5" />
            <path d="M5 12h8a6 6 0 0 1 6 6" />
          </svg>
        </button>
        <button
          type="button"
          :disabled="!canRedo"
          title="Redo (Shift + Command or Control + Z)"
          aria-label="Redo"
          @click="redo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 7 5 5-5 5" />
            <path d="M19 12h-8a6 6 0 0 0-6 6" />
          </svg>
        </button>
        <button
          type="button"
          class="visual-boss-editor__help-button"
          :class="{ 'is-active': showHelp }"
          :aria-expanded="showHelp"
          title="About safe editing"
          aria-label="About safe editing"
          @click="showHelp = !showHelp"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="showHelp" class="visual-boss-editor__help">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.8 2.8 8.3 7 10 4.2-1.7 7-5.2 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <p>
        <strong>Your page structure is protected.</strong>
        Change the visible wording here without touching links, images, tables, or formatting.
      </p>
      <button type="button" @click="emit('request-source')">Edit advanced source</button>
    </div>

    <nav v-if="sections.length > 1" class="visual-boss-editor__sections" aria-label="Page sections">
      <span>Jump to</span>
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        :class="{ 'is-active': section.id === activeSectionId }"
        @click="scrollToLine(section.id)"
      >
        {{ section.label }}
      </button>
    </nav>

    <div class="visual-boss-editor__page">
      <template v-for="block in editorBlocks" :key="block.id">
        <div v-if="block.type === 'table'" class="visual-table-wrap">
          <table class="visual-table">
            <tbody>
              <tr v-for="(row, rowIndex) in block.rows" :key="row.id">
                <td
                  v-for="cell in row.cells"
                  :key="cell.id"
                  :colspan="row.cells.length === 1 ? block.columnCount : undefined"
                  :class="{ 'visual-table__heading': rowIndex === 0 }"
                >
                  <div class="visual-segments">
                    <template
                      v-for="(segment, segmentIndex) in cell.segments"
                      :key="segmentKey(segment, segmentIndex)"
                    >
                      <label
                        v-if="segment.type === 'editable'"
                        class="visual-field"
                        :style="fieldStyle(segment)"
                      >
                        <span class="sr-only">{{ fieldLabel(segment, 'Table cell') }}</span>
                        <textarea
                          :value="modelValue[segment.id] ?? ''"
                          data-plain-field
                          rows="1"
                          wrap="soft"
                          maxlength="200000"
                          :aria-label="fieldLabel(segment, 'Table cell')"
                          @input="updateSegment(segment, $event)"
                          @focus="activateLine('')"
                          @keydown="handleFieldKeydown"
                        ></textarea>
                      </label>
                      <span
                        v-else-if="segment.kind === 'media'"
                        class="visual-inline-media"
                        :title="segment.label"
                        role="note"
                        tabindex="0"
                        :aria-label="`${mediaDisplayName(segment)} image is preserved`"
                      >
                        <img
                          v-if="!failedMedia.has(segment.label)"
                          :src="mediaUrl(segment)"
                          :alt="mediaDisplayName(segment)"
                          loading="lazy"
                          @error="markMediaFailed(segment.label)"
                        />
                        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <circle cx="8.5" cy="9" r="1.5" />
                          <path d="m4 17 5-5 4 4 2-2 5 4" />
                        </svg>
                        <span>{{ mediaDisplayName(segment) }}</span>
                      </span>
                      <span
                        v-else-if="protectedVisible(segment)"
                        class="visual-protected-inline"
                        :class="`visual-protected-inline--${segment.kind}`"
                        :title="`${segment.label}. Preserved automatically.`"
                        role="note"
                        tabindex="0"
                        :aria-label="`${segment.label}. Preserved automatically.`"
                      >
                        <svg v-if="isLinkSegment(segment)" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="m10 13.5 4-4m-6.2 7.7-1 .9a3.5 3.5 0 0 1-4.9-4.9l3-3a3.5 3.5 0 0 1 4.9 0m6.4-3.4 1-.9a3.5 3.5 0 0 1 4.9 4.9l-3 3a3.5 3.5 0 0 1-4.9 0"
                          />
                        </svg>
                        {{ protectedText(segment) }}
                      </span>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-else-if="block.line.kind === 'blank'"
          class="visual-paragraph-break"
          aria-hidden="true"
        ></div>

        <label v-else-if="block.line.kind === 'append'" class="visual-append">
          <span>Continue writing</span>
          <textarea
            :value="editableValue(block.line.segments[0])"
            rows="4"
            maxlength="200000"
            placeholder="Add a new paragraph…"
            @input="updateSegment(block.line.segments[0], $event)"
            @focus="activateLine(block.line.id)"
          ></textarea>
          <small>Press Enter for a new paragraph.</small>
        </label>

        <hr v-else-if="block.line.label === 'Divider'" class="visual-divider" />

        <figure
          v-else-if="mediaSegment(block.line)"
          class="visual-media"
          :class="{ 'visual-media--failed': failedMedia.has(block.line.id) }"
        >
          <img
            v-if="!failedMedia.has(block.line.id)"
            :src="mediaUrl(mediaSegment(block.line)!)"
            :alt="mediaDisplayName(mediaSegment(block.line)!)"
            loading="lazy"
            @error="markMediaFailed(block.line.id)"
          />
          <div v-else class="visual-media__fallback" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9" r="1.5" />
              <path d="m4 17 5-5 4 4 2-2 5 4" />
            </svg>
          </div>
          <figcaption>
            {{ mediaDisplayName(mediaSegment(block.line)!) }}
            <span>Image preserved</span>
          </figcaption>
        </figure>

        <div v-else-if="categorySegment(block.line)" class="visual-category">
          {{ protectedText(categorySegment(block.line)!) }}
        </div>

        <div
          v-else
          :id="lineAnchor(block.line.id)"
          class="visual-line"
          :class="[
            `visual-line--${block.line.kind}`,
            { 'visual-line--numbered': block.line.label === 'Numbered item' }
          ]"
          :style="lineStyle(block.line)"
        >
          <span
            v-if="block.line.kind === 'list-item'"
            class="visual-line__marker"
            aria-hidden="true"
          >
            {{ block.line.label === 'Numbered item' ? '1.' : '•' }}
          </span>
          <div class="visual-segments">
            <template
              v-for="(segment, segmentIndex) in block.line.segments"
              :key="segmentKey(segment, segmentIndex)"
            >
              <label
                v-if="segment.type === 'editable'"
                class="visual-field"
                :style="fieldStyle(segment)"
              >
                <span class="sr-only">{{ fieldLabel(segment, block.line.label) }}</span>
                <textarea
                  :value="modelValue[segment.id] ?? ''"
                  data-plain-field
                  rows="1"
                  wrap="soft"
                  maxlength="200000"
                  :aria-label="fieldLabel(segment, block.line.label)"
                  @input="updateSegment(segment, $event)"
                  @focus="activateLine(block.line.id)"
                  @keydown="handleFieldKeydown"
                ></textarea>
              </label>
              <span
                v-else-if="protectedVisible(segment)"
                class="visual-protected-inline"
                :class="`visual-protected-inline--${segment.kind}`"
                :title="`${segment.label}. Preserved automatically.`"
                role="note"
                tabindex="0"
                :aria-label="`${segment.label}. Preserved automatically.`"
              >
                <svg v-if="isLinkSegment(segment)" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="m10 13.5 4-4m-6.2 7.7-1 .9a3.5 3.5 0 0 1-4.9-4.9l3-3a3.5 3.5 0 0 1 4.9 0m6.4-3.4 1-.9a3.5 3.5 0 0 1 4.9 4.9l-3 3a3.5 3.5 0 0 1-4.9 0"
                  />
                </svg>
                {{ protectedText(segment) }}
              </span>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type {
  PlainBossNotesDocument,
  PlainBossNotesLine,
  PlainBossNotesSegment
} from '../services/api';

type ProtectedSegment = Extract<PlainBossNotesSegment, { type: 'protected' }>;

interface EditorCell {
  id: string;
  segments: PlainBossNotesSegment[];
}

interface EditorRow {
  id: string;
  cells: EditorCell[];
}

type EditorBlock =
  | { id: string; type: 'line'; line: PlainBossNotesLine }
  | { id: string; type: 'table'; rows: EditorRow[]; columnCount: number };

const props = defineProps<{
  document: PlainBossNotesDocument;
  modelValue: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>];
  'request-source': [];
}>();

const editorRef = ref<HTMLElement | null>(null);
const failedMedia = ref(new Set<string>());
const showHelp = ref(false);
const activeLineId = ref('');
const history = ref<Record<string, string>[]>([]);
const historyIndex = ref(-1);

const wordCount = computed(() => {
  const words = Object.values(props.modelValue).join(' ').trim().match(/\S+/g);
  return words?.length ?? 0;
});

const sections = computed(() =>
  props.document.lines.flatMap((line) => {
    if (line.kind !== 'heading') return [];
    const editable = line.segments.find(
      (segment): segment is Extract<PlainBossNotesSegment, { type: 'editable' }> =>
        segment.type === 'editable'
    );
    const label = editable ? (props.modelValue[editable.id] ?? '').trim() : '';
    return label ? [{ id: line.id, label }] : [];
  })
);

const activeSectionId = computed(() => {
  if (!activeLineId.value) return '';
  let sectionId = '';
  for (const line of props.document.lines) {
    if (line.kind === 'heading') sectionId = line.id;
    if (line.id === activeLineId.value) break;
  }
  return sectionId;
});

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(
  () => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1
);

watch(
  () => props.document.revision,
  () => {
    history.value = [{ ...props.modelValue }];
    historyIndex.value = 0;
    activeLineId.value = '';
    void nextTick(resizeAllFields);
  },
  { immediate: true }
);

onMounted(() => {
  void nextTick(resizeAllFields);
});

const editorBlocks = computed<EditorBlock[]>(() => {
  const blocks: EditorBlock[] = [];
  let tableRows: EditorRow[] | null = null;
  let currentRow: EditorRow | null = null;
  let tableId = '';

  const finishTable = () => {
    if (!tableRows) return;
    const rows = tableRows.filter((row) => row.cells.length > 0);
    if (rows.length > 0) {
      blocks.push({
        id: tableId,
        type: 'table',
        rows,
        columnCount: Math.max(1, ...rows.map((row) => row.cells.length))
      });
    }
    tableRows = null;
    currentRow = null;
    tableId = '';
  };

  for (const line of props.document.lines) {
    if (line.kind === 'protected' && line.label === 'Table layout') {
      if (tableRows) finishTable();
      else {
        tableRows = [];
        tableId = `table-${line.id}`;
      }
      continue;
    }

    if (tableRows) {
      if (line.kind === 'protected' && line.label === 'Table row') {
        currentRow = { id: line.id, cells: [] };
        tableRows.push(currentRow);
        continue;
      }
      if (line.kind === 'table-cell') {
        if (!currentRow) {
          currentRow = { id: `row-${line.id}`, cells: [] };
          tableRows.push(currentRow);
        }
        currentRow.cells.push(...splitTableCells(line));
        continue;
      }
      continue;
    }

    blocks.push({ id: line.id, type: 'line', line });
  }

  finishTable();
  return blocks;
});

function splitTableCells(line: PlainBossNotesLine): EditorCell[] {
  const cells: EditorCell[] = [{ id: `${line.id}-cell-1`, segments: [] }];
  for (const segment of line.segments) {
    if (
      segment.type === 'protected' &&
      segment.kind === 'structure' &&
      segment.label === 'Next table cell'
    ) {
      cells.push({ id: `${line.id}-cell-${cells.length + 1}`, segments: [] });
    } else {
      cells[cells.length - 1]!.segments.push(segment);
    }
  }
  return cells;
}

function segmentKey(segment: PlainBossNotesSegment, index: number) {
  return segment.type === 'editable' ? segment.id : `${segment.kind}-${segment.label}-${index}`;
}

function editableValue(segment: PlainBossNotesSegment | undefined) {
  return segment?.type === 'editable' ? (props.modelValue[segment.id] ?? '') : '';
}

function updateSegment(segment: PlainBossNotesSegment | undefined, event: Event) {
  if (segment?.type !== 'editable') return;
  const target = event.target as HTMLTextAreaElement;
  const nextValue = { ...props.modelValue, [segment.id]: target.value };
  recordHistory(nextValue);
  emit('update:modelValue', nextValue);
  resizeField(target);
  void nextTick(() => resizeField(target));
}

function fieldLabel(
  segment: Extract<PlainBossNotesSegment, { type: 'editable' }>,
  fallback: string
) {
  return segment.role === 'link-label' ? 'Link text' : fallback;
}

function fieldStyle(segment: Extract<PlainBossNotesSegment, { type: 'editable' }>) {
  const value = props.modelValue[segment.id] ?? '';
  return { '--visual-field-width': `${Math.min(Math.max(value.length + 1, 5), 52)}ch` };
}

function lineStyle(line: PlainBossNotesLine) {
  return { '--visual-indent': `${Math.min(Math.max(line.depth - 1, 0), 6) * 1.15}rem` };
}

function focusNextField(event: KeyboardEvent) {
  const fields = Array.from(
    event.currentTarget instanceof HTMLElement
      ? (event.currentTarget
          .closest('.visual-boss-editor')
          ?.querySelectorAll<HTMLElement>('[data-plain-field]') ?? [])
      : []
  );
  const index = fields.indexOf(event.currentTarget as HTMLElement);
  fields[index + 1]?.focus();
}

function handleFieldKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    focusNextField(event);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (event.ctrlKey && event.key.toLocaleLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
}

function recordHistory(value: Record<string, string>) {
  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push({ ...value });
  if (history.value.length > 120) history.value.shift();
  historyIndex.value = history.value.length - 1;
}

function applyHistory(index: number) {
  const value = history.value[index];
  if (!value) return;
  historyIndex.value = index;
  emit('update:modelValue', { ...value });
  void nextTick(resizeAllFields);
}

function undo() {
  if (canUndo.value) applyHistory(historyIndex.value - 1);
}

function redo() {
  if (canRedo.value) applyHistory(historyIndex.value + 1);
}

function resizeField(field: HTMLTextAreaElement) {
  field.style.height = 'auto';
  field.style.height = `${Math.max(field.scrollHeight, 32)}px`;
}

function resizeAllFields() {
  editorRef.value?.querySelectorAll<HTMLTextAreaElement>('[data-plain-field]').forEach(resizeField);
}

function activateLine(lineId: string) {
  activeLineId.value = lineId;
}

function lineAnchor(lineId: string) {
  return `plain-editor-${lineId}`;
}

function scrollToLine(lineId: string) {
  const line = document.getElementById(lineAnchor(lineId));
  line?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => line?.querySelector<HTMLElement>('[data-plain-field]')?.focus(), 250);
}

function protectedVisible(segment: ProtectedSegment) {
  return !(
    segment.kind === 'structure' ||
    segment.kind === 'formatting' ||
    segment.kind === 'category' ||
    segment.kind === 'media'
  );
}

function isLinkSegment(segment: ProtectedSegment) {
  return segment.kind === 'link';
}

function protectedText(segment: ProtectedSegment) {
  return segment.label
    .replace(/^(?:External )?Link target preserved$/i, '')
    .replace(/^Link preserved:\s*/i, '')
    .replace(/^Category preserved:\s*/i, '')
    .replace(/ preserved(?::\s*)?/i, '')
    .trim();
}

function mediaSegment(line: PlainBossNotesLine): ProtectedSegment | null {
  return (
    line.segments.find(
      (segment): segment is ProtectedSegment =>
        segment.type === 'protected' && segment.kind === 'media'
    ) ?? null
  );
}

function categorySegment(line: PlainBossNotesLine): ProtectedSegment | null {
  return (
    line.segments.find(
      (segment): segment is ProtectedSegment =>
        segment.type === 'protected' && segment.kind === 'category'
    ) ?? null
  );
}

function mediaName(segment: ProtectedSegment) {
  return segment.label.replace(/^Media preserved:\s*/i, '').trim();
}

function mediaDisplayName(segment: ProtectedSegment) {
  return mediaName(segment)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ');
}

function mediaUrl(segment: ProtectedSegment) {
  const fileName = mediaName(segment);
  return `https://wiki.clumsysworld.com/index.php?title=Special%3ARedirect%2Ffile%2F${encodeURIComponent(fileName)}&width=720`;
}

function markMediaFailed(lineId: string) {
  failedMedia.value = new Set([...failedMedia.value, lineId]);
}
</script>

<style scoped>
.visual-boss-editor {
  background: rgba(4, 9, 18, 0.54);
  border: 1px solid rgba(126, 162, 199, 0.18);
  border-radius: 16px;
  box-shadow: 0 20px 55px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  position: relative;
}

.visual-boss-editor__bar {
  align-items: center;
  background: rgba(12, 21, 35, 0.78);
  border-bottom: 1px solid rgba(126, 162, 199, 0.14);
  color: rgba(178, 202, 226, 0.64);
  display: flex;
  font-size: 0.72rem;
  justify-content: space-between;
  min-height: 48px;
  padding: 0.65rem 1rem;
}

.visual-boss-editor__identity,
.visual-boss-editor__tools {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.visual-boss-editor__identity > span:last-child {
  display: grid;
  gap: 0.08rem;
}

.visual-boss-editor__bar strong {
  color: #eef9ff;
  font-size: 0.76rem;
  letter-spacing: 0.015em;
}

.visual-boss-editor__bar small {
  color: rgba(178, 202, 226, 0.54);
  font-size: 0.66rem;
}

.visual-boss-editor__status-dot {
  background: #50d5bc;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(80, 213, 188, 0.1);
  height: 6px;
  width: 6px;
}

.visual-boss-editor__word-count {
  color: rgba(178, 202, 226, 0.5);
  font-size: 0.66rem;
  margin-right: 0.2rem;
  white-space: nowrap;
}

.visual-boss-editor__tools button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: rgba(178, 202, 226, 0.65);
  display: inline-flex;
  height: 30px;
  justify-content: center;
  padding: 0;
  transition: 140ms ease;
  width: 30px;
}

.visual-boss-editor__tools button:hover:not(:disabled),
.visual-boss-editor__tools button:focus-visible,
.visual-boss-editor__tools button.is-active {
  background: rgba(69, 215, 223, 0.08);
  color: #8ee9ed;
  outline: none;
}

.visual-boss-editor__tools button:disabled {
  color: rgba(178, 202, 226, 0.2);
  cursor: default;
}

.visual-boss-editor__tools svg {
  fill: none;
  height: 15px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 15px;
}

.visual-boss-editor__help {
  align-items: center;
  background: rgba(34, 120, 128, 0.08);
  border-bottom: 1px solid rgba(69, 215, 223, 0.13);
  color: rgba(195, 217, 235, 0.68);
  display: grid;
  gap: 0.75rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 0.8rem 1rem;
}

.visual-boss-editor__help > svg {
  fill: none;
  height: 20px;
  stroke: #59d6da;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  width: 20px;
}

.visual-boss-editor__help p {
  font-size: 0.72rem;
  line-height: 1.45;
  margin: 0;
}

.visual-boss-editor__help strong {
  color: #e7f5fb;
  margin-right: 0.25rem;
}

.visual-boss-editor__help button {
  background: transparent;
  border: 0;
  color: #76dfe3;
  font-size: 0.69rem;
  font-weight: 700;
  padding: 0.35rem 0.2rem;
  white-space: nowrap;
}

.visual-boss-editor__help button:hover,
.visual-boss-editor__help button:focus-visible {
  color: #c0f9fb;
  outline: none;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.visual-boss-editor__sections {
  align-items: center;
  background: rgba(7, 14, 25, 0.9);
  border-bottom: 1px solid rgba(126, 162, 199, 0.12);
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.55rem 1rem;
  scrollbar-width: thin;
}

.visual-boss-editor__sections > span {
  color: rgba(178, 202, 226, 0.42);
  flex: 0 0 auto;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-right: 0.2rem;
  text-transform: uppercase;
}

.visual-boss-editor__sections button {
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: rgba(187, 210, 230, 0.62);
  flex: 0 0 auto;
  font-size: 0.67rem;
  max-width: 18rem;
  overflow: hidden;
  padding: 0.35rem 0.62rem;
  text-overflow: ellipsis;
  transition: 140ms ease;
  white-space: nowrap;
}

.visual-boss-editor__sections button:hover,
.visual-boss-editor__sections button:focus-visible,
.visual-boss-editor__sections button.is-active {
  background: rgba(69, 215, 223, 0.08);
  color: #8ce9ed;
  outline: none;
}

.visual-boss-editor__page {
  background:
    radial-gradient(circle at 50% 0%, rgba(44, 92, 129, 0.06), transparent 34%),
    rgba(5, 11, 21, 0.4);
  color: #e7f0f8;
  min-height: 420px;
  padding: clamp(1.5rem, 3.8vw, 3.25rem) clamp(1.1rem, 5vw, 4.75rem) 2.5rem;
}

.visual-line {
  align-items: baseline;
  border-radius: 7px;
  display: flex;
  min-width: 0;
  padding-left: var(--visual-indent);
  transition: background-color 140ms ease;
}

.visual-line:focus-within {
  background: rgba(69, 215, 223, 0.025);
}

.visual-line--paragraph {
  font-size: 0.98rem;
  line-height: 1.75;
}

.visual-line--heading {
  border-bottom: 1px solid rgba(126, 162, 199, 0.14);
  margin: 1.9rem 0 0.65rem;
  padding-bottom: 0.48rem;
}

.visual-line--heading:first-child {
  margin-top: 0;
}

.visual-line--heading .visual-field textarea {
  color: #f7fbff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.15rem, 2vw, 1.45rem);
  font-weight: 600;
  letter-spacing: 0.005em;
}

.visual-line--list-item {
  align-items: flex-start;
  gap: 0.55rem;
  line-height: 1.65;
  margin: 0.16rem 0;
}

.visual-line__marker {
  color: #55dbe0;
  flex: 0 0 1rem;
  font-size: 0.8rem;
  padding-top: 0.32rem;
  text-align: right;
}

.visual-segments {
  align-items: center;
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.16rem 0.38rem;
  min-width: 0;
}

.visual-field {
  flex: 0 1 var(--visual-field-width);
  min-width: min(100%, 4ch);
  max-width: 100%;
}

.visual-field:only-child {
  flex-grow: 1;
}

.visual-field textarea,
.visual-append textarea {
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: inherit;
  font: inherit;
  line-height: inherit;
  outline: none;
  transition:
    background-color 130ms ease,
    box-shadow 130ms ease;
  width: 100%;
}

.visual-field textarea {
  box-shadow: inset 0 -1px transparent;
  field-sizing: content;
  min-height: 2rem;
  overflow: hidden;
  padding: 0.18rem 0.22rem;
  resize: none;
  text-align: inherit;
  white-space: pre-wrap;
}

.visual-line:hover .visual-field textarea,
.visual-table td:hover .visual-field textarea {
  background: rgba(126, 162, 199, 0.045);
}

.visual-field textarea:focus,
.visual-append textarea:focus {
  background: rgba(72, 205, 214, 0.055);
  box-shadow:
    inset 0 -1px #48cdd6,
    0 0 0 3px rgba(72, 205, 214, 0.07);
}

.visual-protected-inline {
  align-items: center;
  color: rgba(174, 204, 229, 0.6);
  display: inline-flex;
  font-size: 0.76rem;
  gap: 0.24rem;
  line-height: 1.3;
  padding: 0.2rem 0.1rem;
}

.visual-protected-inline svg {
  fill: none;
  flex: 0 0 13px;
  height: 13px;
  stroke: #54cfd8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 13px;
}

.visual-protected-inline:focus-visible,
.visual-inline-media:focus-visible {
  border-radius: 5px;
  outline: 2px solid rgba(84, 207, 216, 0.65);
  outline-offset: 3px;
}

.visual-protected-inline--comment,
.visual-protected-inline--reference,
.visual-protected-inline--template {
  background: rgba(126, 162, 199, 0.06);
  border: 1px solid rgba(126, 162, 199, 0.1);
  border-radius: 999px;
  padding: 0.25rem 0.48rem;
}

.visual-paragraph-break {
  height: 0.72rem;
}

.visual-divider {
  border: 0;
  border-top: 1px solid rgba(126, 162, 199, 0.2);
  clear: both;
  margin: 1.7rem 0;
}

.visual-media {
  background: rgba(10, 18, 30, 0.65);
  border: 1px solid rgba(126, 162, 199, 0.14);
  border-radius: 12px;
  display: inline-flex;
  flex-direction: column;
  margin: 0 0 1.35rem;
  max-width: min(100%, 520px);
  overflow: hidden;
  width: min(100%, 520px);
}

.visual-media img {
  display: block;
  max-height: 360px;
  object-fit: contain;
  width: 100%;
}

.visual-media figcaption {
  align-items: center;
  color: rgba(213, 228, 241, 0.75);
  display: flex;
  font-size: 0.72rem;
  gap: 0.75rem;
  justify-content: space-between;
  padding: 0.55rem 0.7rem;
}

.visual-media figcaption span {
  color: rgba(80, 213, 188, 0.72);
  font-size: 0.64rem;
  white-space: nowrap;
}

.visual-media__fallback {
  align-items: center;
  color: rgba(126, 162, 199, 0.4);
  display: flex;
  height: 120px;
  justify-content: center;
  width: 240px;
}

.visual-media__fallback svg,
.visual-inline-media svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.visual-media__fallback svg {
  height: 32px;
  width: 32px;
}

.visual-inline-media {
  align-items: flex-start;
  color: rgba(80, 213, 188, 0.7);
  display: flex;
  flex-direction: column;
  font-size: 0.72rem;
  gap: 0.35rem;
  max-width: 100%;
}

.visual-inline-media svg {
  height: 16px;
  width: 16px;
}

.visual-inline-media img {
  border-radius: 6px;
  display: block;
  max-height: 280px;
  max-width: min(100%, 620px);
  object-fit: contain;
}

.visual-inline-media span {
  color: rgba(190, 214, 233, 0.52);
  font-size: 0.64rem;
}

.visual-category {
  background: rgba(73, 183, 159, 0.08);
  border: 1px solid rgba(73, 183, 159, 0.16);
  border-radius: 999px;
  color: rgba(130, 221, 199, 0.76);
  display: inline-flex;
  font-size: 0.68rem;
  margin: 1.25rem 0.35rem 0 0;
  padding: 0.3rem 0.55rem;
}

.visual-table-wrap {
  margin: 0 0 1.6rem;
  max-width: 100%;
  overflow-x: auto;
}

.visual-table {
  border-collapse: separate;
  border-spacing: 0;
  min-width: min(100%, 480px);
  overflow: hidden;
  width: 100%;
}

.visual-table td {
  background: rgba(12, 23, 38, 0.48);
  border-bottom: 1px solid rgba(126, 162, 199, 0.14);
  border-right: 1px solid rgba(126, 162, 199, 0.14);
  padding: 0.5rem 0.65rem;
  vertical-align: middle;
}

.visual-table tr:first-child td {
  border-top: 1px solid rgba(126, 162, 199, 0.14);
}

.visual-table td:first-child {
  border-left: 1px solid rgba(126, 162, 199, 0.14);
}

.visual-table tr:first-child td:first-child {
  border-top-left-radius: 8px;
}

.visual-table tr:first-child td:last-child {
  border-top-right-radius: 8px;
}

.visual-table tr:last-child td:first-child {
  border-bottom-left-radius: 8px;
}

.visual-table tr:last-child td:last-child {
  border-bottom-right-radius: 8px;
}

.visual-table__heading {
  background: rgba(148, 101, 41, 0.28) !important;
  color: #fff2d9;
  font-weight: 700;
  text-align: center;
}

.visual-append {
  border-top: 1px solid rgba(126, 162, 199, 0.14);
  clear: both;
  display: grid;
  gap: 0.38rem;
  margin-top: 2rem;
  padding-top: 1.35rem;
}

.visual-append > span {
  color: rgba(199, 219, 237, 0.72);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.035em;
}

.visual-append textarea {
  background: rgba(126, 162, 199, 0.035);
  border: 1px dashed rgba(126, 162, 199, 0.18);
  line-height: 1.65;
  min-height: 94px;
  padding: 0.7rem;
  resize: vertical;
}

.visual-append small {
  color: rgba(174, 204, 229, 0.45);
  font-size: 0.66rem;
}

@media (min-width: 901px) {
  .visual-media:first-child {
    float: right;
    margin-left: 2rem;
    width: min(38%, 520px);
  }

  .visual-media:first-child + .visual-table-wrap {
    width: calc(62% - 2rem);
  }
}

@media (max-width: 680px) {
  .visual-boss-editor__bar {
    align-items: flex-start;
    gap: 0.45rem;
  }

  .visual-boss-editor__identity {
    align-items: flex-start;
    gap: 0.16rem;
    padding-left: 0.9rem;
    position: relative;
  }

  .visual-boss-editor__status-dot {
    left: 0;
    position: absolute;
    top: 0.36rem;
  }

  .visual-boss-editor__word-count {
    display: none;
  }

  .visual-boss-editor__help {
    align-items: start;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .visual-boss-editor__help button {
    grid-column: 2;
    justify-self: start;
  }

  .visual-boss-editor__sections {
    padding-inline: 0.75rem;
  }

  .visual-boss-editor__page {
    padding: 1.4rem 0.9rem 2rem;
  }

  .visual-line {
    padding-left: min(var(--visual-indent), 2.3rem);
  }

  .visual-table {
    min-width: 430px;
  }

  .visual-media img {
    max-height: 300px;
  }

  .visual-media figcaption {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.2rem;
  }
}
</style>
