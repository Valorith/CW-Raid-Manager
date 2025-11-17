<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="modal modal--wide parser-modal">
      <header class="modal__header">
        <div>
          <h3>Parser Settings</h3>
          <p class="muted small">
            Describe loot phrases using plain language. We convert them to precise patterns
            automatically.
          </p>
        </div>
        <button class="icon-button" type="button" @click="handleClose">✕</button>
      </header>
      <form class="settings-form" @submit.prevent="saveSettings">
        <p v-if="loadingSettings" class="muted small">Loading parser settings…</p>
        <div v-else-if="loadError" class="error-state">
          <p class="error-text">{{ loadError }}</p>
          <button class="btn btn--modal-outline" type="button" @click="loadSettings">
            Retry
          </button>
        </div>
        <div v-else class="settings-form__body">
          <div v-if="formErrors.length" class="parser-modal__form-error" role="alert">
            <p>Fix these issues before saving:</p>
            <ul>
              <li v-for="(error, index) in formErrors" :key="`pattern-error-${index}`">{{ error }}</li>
            </ul>
          </div>
          <div class="settings-grid">
            <div class="settings-grid__side">

              <section class="settings-section sample-tester">
                <div>
                  <h4>Try a Log Line</h4>
                  <p class="muted small">Paste a log entry to see how each phrase would parse it.</p>
                </div>
                <textarea
                  v-model="sampleLogLine"
                  rows="3"
                  placeholder="[Sun Sep 14 21:36:45 2025] Eye of Eashen has been awarded to Loladin by the Master Looter."
                ></textarea>
              </section>

              <section class="settings-section placeholder-panel">
                <div class="placeholder-panel__header">
                  <div>
                    <h4>Placeholders</h4>
                    <p class="muted small">Click to insert into the phrase you’re editing.</p>
                  </div>
                  <p class="muted x-small">
                    Example: “{timestamp} {item} has been awarded to {looter} by the {method}.”
                  </p>
                </div>
                <div class="placeholder-toolbar">
                  <div class="placeholder-toolbar__chips">
                    <button
                      v-for="option in placeholderOptions"
                      :key="option.token"
                      class="placeholder-chip"
                      type="button"
                      @click="appendPlaceholder(option.token)"
                    >
                      <span class="placeholder-chip__token">{{ option.token }}</span>
                      <span class="placeholder-chip__text">{{ option.description }}</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div class="settings-grid__main">
              <section class="settings-section">
                <div class="section-heading section-heading--stacked">
                  <div>
                    <h4>Loot Phrase Builder</h4>
                    <p class="muted small">
                      Describe the exact log line and we’ll handle the complex regex for you.
                    </p>
                  </div>
                  <button class="btn btn--outline btn--small btn--modal-outline" type="button" @click="addPattern()">
                    <span class="btn__icon">+</span>
                    Add Phrase
                  </button>
                </div>

                <div v-if="editable.patterns.length === 0" class="pattern-card pattern-card--empty">
                  <p>No phrases yet. Start by describing how loot lines look in your logs.</p>
                  <button class="btn btn--small" type="button" @click="addPattern()">Create First Phrase</button>
                </div>

                <div v-else class="pattern-list">
                  <article
                    v-for="(pattern, index) in editable.patterns"
                    :key="pattern.id"
                    class="pattern-card"
                    :class="{
                      'pattern-card--active': activePatternIndex === index,
                      'pattern-card--collapsed': collapsedPatternIds[pattern.id]
                    }"
                  >
                    <div class="pattern-card__header">
                      <div class="pattern-card__header-main">
                        <button
                          class="pattern-card__toggle"
                          type="button"
                          @click.stop="togglePatternCollapse(pattern.id)"
                          :aria-expanded="!collapsedPatternIds[pattern.id]"
                          :aria-controls="`pattern-body-${pattern.id}`"
                        >
                          <span
                            class="pattern-card__chevron"
                            :class="{ 'pattern-card__chevron--rotated': !collapsedPatternIds[pattern.id] }"
                            >⌄</span
                          >
                        </button>
                        <input
                          v-model="pattern.label"
                          type="text"
                          placeholder="Description (e.g. Kael chest drops)"
                          @focus="setActivePattern(index)"
                        />
                      </div>
                      <button class="btn btn--danger btn--small btn--modal-danger" type="button" @click="removePattern(pattern.id)">
                        Delete
                      </button>
                    </div>
                    <transition name="pattern-card-collapse">
                      <div
                        v-show="!collapsedPatternIds[pattern.id]"
                        :id="`pattern-body-${pattern.id}`"
                        class="pattern-card__body"
                      >
                        <div class="pattern-card__body-grid">
                          <div class="pattern-form">
                            <label class="form__field">
                              <span>Loot Phrase</span>
                              <textarea
                                :ref="setPatternTextareaRef(pattern.id)"
                                v-model="pattern.pattern"
                                rows="3"
                                placeholder="{timestamp} {item} has been awarded to {looter} by the {method}."
                                @focus="handleTextareaFocus(index, pattern.id)"
                                @input="handlePatternInput(index, pattern.id)"
                              ></textarea>
                            </label>
                            <div class="pattern-card__helper">
                              <span class="pattern-card__helper-label">Placeholders in use</span>
                              <div class="pattern-card__helper-content">
                                <span
                                  v-for="placeholder in placeholderUsage(pattern.pattern)"
                                  :key="placeholder.token"
                                  class="pattern-chip"
                                >
                                  {{ placeholder.token }}
                                </span>
                              </div>
                            </div>
                            <div class="pattern-method-ignore">
                              <div class="method-input">
                                <label class="muted x-small" :for="`ignored-method-${pattern.id}`">Ignore loot method</label>
                                <input
                                  :id="`ignored-method-${pattern.id}`"
                                  v-model="pattern.methodInput"
                                  type="text"
                                  placeholder="Loot Council, Random, etc."
                                  @keyup.enter.prevent="addIgnoredMethod(index)"
                                />
                                <button class="btn btn--small" type="button" @click="addIgnoredMethod(index)">Add</button>
                              </div>
                              <div v-if="pattern.ignoredMethods.length" class="method-pill-container">
                                <span v-for="method in pattern.ignoredMethods" :key="method" class="method-pill">
                                  <span class="method-pill__label">{{ method }}</span>
                                  <button
                                    type="button"
                                    class="method-pill__remove"
                                    @click="removeIgnoredMethod(index, method)"
                                    aria-label="Remove ignored method"
                                  >
                                    ×
                                  </button>
                                </span>
                              </div>
                            </div>
                          </div>
                          <div class="pattern-preview">
                            <span class="pattern-preview__label">Regex Preview</span>
                            <code class="pattern-preview__code">{{ patternPreview(pattern.pattern) }}</code>
                          </div>
                        </div>

                        <div
                          v-if="sampleLogLine"
                          class="pattern-test"
                          :class="
                            patternSampleResult(pattern).matches ? 'pattern-test--match' : 'pattern-test--miss'
                          "
                        >
                          <template v-if="patternSampleResult(pattern).matches">
                            <p class="pattern-test__header">
                              <span class="pattern-test__status">Matches sample line</span>
                            </p>
                            <ul class="pattern-test__list">
                              <li>
                                <strong>Looter:</strong>
                                <span>{{ patternSampleResult(pattern).looter ?? 'Not captured' }}</span>
                              </li>
                              <li>
                                <strong>Item:</strong>
                                <span>{{ patternSampleResult(pattern).item ?? 'Not captured' }}</span>
                              </li>
                              <li v-if="patternSampleResult(pattern).itemId != null">
                                <strong>Item ID:</strong>
                                <span>{{ patternSampleResult(pattern).itemId }}</span>
                              </li>
                              <li>
                                <strong>Method:</strong>
                                <span>{{ patternSampleResult(pattern).method ?? 'Not captured' }}</span>
                              </li>
                            </ul>
                          </template>
                          <template v-else>
                            <p class="pattern-test__header">
                              <span class="pattern-test__status">{{
                                patternSampleResult(pattern).reason ?? 'No match for sample'
                              }}</span>
                            </p>
                            <p class="muted x-small" v-if="patternSampleResult(pattern).ignored">
                              This pattern is currently ignored because the loot method matches one of your ignored
                              methods.
                            </p>
                          </template>
                        </div>
                      </div>
                    </transition>
                  </article>
                </div>
              </section>
            </div>
          </div>
        </div>
        <footer v-if="!loadingSettings && !loadError" class="modal__footer">
          <button class="btn btn--outline btn--modal-outline" type="button" @click="handleClose">Cancel</button>
          <button class="btn btn--modal-primary" type="submit" :disabled="updatingSettings">
            {{ updatingSettings ? 'Saving…' : 'Save Settings' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isAxiosError } from 'axios';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';

import type { GuildLootParserPatternSettings, GuildLootParserSettings } from '../services/api';
import { api } from '../services/api';
import { convertPlaceholdersToRegex, convertRegexToPlaceholders } from '../utils/patternPlaceholders';

const props = defineProps<{
  guildId: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  saved: [settings: GuildLootParserSettings];
}>();

type EditablePattern = GuildLootParserPatternSettings & { methodInput: string };
type TemplateRefHandler = (el: Element | ComponentPublicInstance | null) => void;
interface PatternSampleResult {
  matches: boolean;
  reason?: string;
  ignored?: boolean;
  looter?: string;
  item?: string;
  itemId?: number | null;
  method?: string;
  error?: string;
}

const placeholderOptions = [
  {
    token: '{timestamp}',
    label: 'Timestamp',
    description: 'Matches the leading [Day Mon DD HH:MM:SS YYYY] text.'
  },
  {
    token: '{item}',
    label: 'Item',
    description: 'The item name pulled from the log line.'
  },
  {
    token: '{itemID}',
    label: 'Item ID',
    description: 'Numeric ID enclosed in parentheses, e.g. (12345).'
  },
  {
    token: '{looter}',
    label: 'Recipient',
    description: 'The character who received the loot.'
  },
  {
    token: '{method}',
    label: 'Loot method',
    description: 'How the item was awarded (Master Looter, random roll, Loot Council, etc.).'
  }
];

const defaultRegexPatterns: GuildLootParserPatternSettings[] = [
  {
    id: 'default-master-method',
    label: 'Awarded by Master Looter / Loot Council',
    pattern: convertPlaceholdersToRegex('{timestamp} {item} has been awarded to {looter} by the {method}.'),
    ignoredMethods: []
  },
  {
    id: 'default-random-roll',
    label: 'Awarded by random roll',
    pattern: convertPlaceholdersToRegex('{timestamp} {item} has been awarded to {looter} by {method}.'),
    ignoredMethods: []
  },
  {
    id: 'default-donation',
    label: 'Donations to guild',
    pattern: convertPlaceholdersToRegex("{timestamp} {item} has been donated to the Master Looter's guild."),
    ignoredMethods: []
  }
];

const editable = reactive<{ patterns: EditablePattern[]; emoji: string }>({
  patterns: [],
  emoji: '💎'
});
const sampleLogLine = ref('');
const activePatternIndex = ref<number | null>(null);
const collapsedPatternIds = ref<Record<string, boolean>>({});
const patternTextareas = ref<Record<string, HTMLTextAreaElement>>({});
const patternCaretPositions = ref<Record<string, { start: number; end: number }>>({});
const loadingSettings = ref(false);
const updatingSettings = ref(false);
const loadError = ref<string | null>(null);
const formErrors = ref<string[]>([]);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void loadSettings();
    } else {
      sampleLogLine.value = '';
      formErrors.value = [];
    }
  }
);

watch(
  () => props.guildId,
  (guildId, prev) => {
    if (guildId && guildId !== prev && props.visible) {
      void loadSettings();
    }
  }
);

async function loadSettings() {
  if (!props.guildId) {
    return;
  }
  loadingSettings.value = true;
  loadError.value = null;
  formErrors.value = [];
  try {
    const settings = await api.fetchGuildLootSettings(props.guildId);
    applySettings(settings);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loadingSettings.value = false;
  }
}

function applySettings(settings: GuildLootParserSettings) {
  const preparedPatterns = preparePatternsForEditing(settings.patterns);
  editable.patterns = preparedPatterns;
  activePatternIndex.value = preparedPatterns.length ? 0 : null;
  editable.emoji = settings.emoji ?? '💎';
  collapsedPatternIds.value = preparedPatterns.reduce<Record<string, boolean>>((acc, pattern) => {
    acc[pattern.id] = false;
    return acc;
  }, {});
  patternCaretPositions.value = preparedPatterns.reduce<Record<string, { start: number; end: number }>>((acc, pattern) => {
    const length = pattern.pattern?.length ?? 0;
    acc[pattern.id] = { start: length, end: length };
    return acc;
  }, {});
  formErrors.value = [];
}

function preparePatternsForEditing(patterns: GuildLootParserPatternSettings[]) {
  const merged = ensureDefaultPatterns(patterns);
  return merged.map((pattern) => {
    const friendlyPattern = convertRegexToPlaceholders(pattern.pattern);
    const rawIgnored = Array.isArray(pattern.ignoredMethods)
      ? pattern.ignoredMethods.map((method) => method.toString())
      : [];
    return {
      ...pattern,
      pattern: friendlyPattern || pattern.pattern,
      ignoredMethods: sanitizeIgnoredMethods(rawIgnored),
      methodInput: ''
    };
  });
}

function ensureDefaultPatterns(patterns: GuildLootParserPatternSettings[]) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return defaultRegexPatterns;
  }
  return [...patterns];
}

function handleClose() {
  emit('close');
}

async function saveSettings() {
  formErrors.value = [];

  if (editable.patterns.length === 0) {
    formErrors.value = ['Add at least one loot phrase before saving.'];
    return;
  }

  const fallbackPhrase = defaultPattern();
  const fallbackCompiled = convertPlaceholdersToRegex(fallbackPhrase);

  const preparedPatterns = editable.patterns.map((pattern, index) => {
    const label = pattern.label?.trim() || `Pattern ${index + 1}`;
    const rawPattern = typeof pattern.pattern === 'string' ? pattern.pattern.trim() : '';
    const compiledPattern =
      convertPlaceholdersToRegex(rawPattern || fallbackPhrase) || fallbackCompiled;
    const ignoredMethods = sanitizeIgnoredMethods(pattern.ignoredMethods ?? []);
    try {
      RegExp(compiledPattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      formErrors.value.push(`"${label}" is invalid: ${message}`);
    }
    return {
      id: pattern.id || `pattern-${index}`,
      label,
      pattern: compiledPattern || fallbackCompiled,
      ignoredMethods
    };
  });

  if (formErrors.value.length > 0) {
    return;
  }

  updatingSettings.value = true;
  try {
    const payload: GuildLootParserSettings = {
      emoji: editable.emoji ?? '💎',
      patterns: preparedPatterns
    };
    const updated = await api.updateGuildLootSettings(props.guildId, payload);
    applySettings(updated);
    emit('saved', updated);
    emit('close');
  } catch (error) {
    if (isAxiosError(error)) {
      const data = error.response?.data as { message?: string } | string | undefined;
      const message =
        typeof data === 'string'
          ? data
          : data?.message ?? error.message ?? 'Failed to save parser settings.';
      formErrors.value = [message];
    } else {
      formErrors.value = [
        error instanceof Error ? error.message : 'Failed to save parser settings.'
      ];
    }
  } finally {
    updatingSettings.value = false;
  }
}

function defaultPattern() {
  return '{timestamp} {item} has been awarded to {looter} by the {method}.';
}

function setActivePattern(index: number) {
  activePatternIndex.value = index;
}

function addPattern(initialPattern?: string) {
  editable.patterns.push({
    id: `pattern-${Date.now()}`,
    label: 'New Pattern',
    pattern: typeof initialPattern === 'string' ? initialPattern : defaultPattern(),
    ignoredMethods: [],
    methodInput: ''
  });
  activePatternIndex.value = editable.patterns.length - 1;
  const newId = editable.patterns[activePatternIndex.value].id;
  collapsedPatternIds.value = {
    ...collapsedPatternIds.value,
    [newId]: false
  };
  const initialLength = editable.patterns[activePatternIndex.value].pattern?.length ?? 0;
  patternCaretPositions.value[newId] = { start: initialLength, end: initialLength };
  nextTick(() => {
    const textarea = patternTextareas.value[newId];
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(initialLength, initialLength);
    }
  });
}


function removePattern(id: string) {
  const index = editable.patterns.findIndex((pattern) => pattern.id === id);
  if (index === -1) {
    return;
  }

  // Capture state before mutating
  const removed = editable.patterns.splice(index, 1)[0];
  delete collapsedPatternIds.value[id];
  delete patternCaretPositions.value[id];
  delete patternTextareas.value[id];

  if (editable.patterns.length === 0) {
    activePatternIndex.value = null;
  } else {
    const nextIndex = Math.min(index, editable.patterns.length - 1);
    activePatternIndex.value = nextIndex >= 0 ? nextIndex : 0;
  }
}

function appendPlaceholder(token: string) {
  if (!editable.patterns.length) {
    addPattern('');
  }
  const index = activePatternIndex.value ?? editable.patterns.length - 1;
  const target = editable.patterns[index];
  const patternId = target.id;
  const current = target.pattern ?? '';
  const caret = patternCaretPositions.value[patternId];
  const start = caret?.start ?? current.length;
  const end = caret?.end ?? start;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const updated = `${before}${token}${after}`;
  target.pattern = updated;
  const nextPos = start + token.length;
  patternCaretPositions.value[patternId] = { start: nextPos, end: nextPos };
  nextTick(() => {
    const textarea = patternTextareas.value[patternId];
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(nextPos, nextPos);
    }
  });
}

function placeholderUsage(pattern: string) {
  const lower = pattern?.toLowerCase() ?? '';
  return placeholderOptions.filter((option) => lower.includes(option.token.toLowerCase()));
}

function normalizeMethodName(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function addIgnoredMethod(patternIndex: number) {
  const pattern = editable.patterns[patternIndex];
  if (!pattern) {
    return;
  }
  const rawValue = pattern.methodInput?.trim();
  if (!rawValue) {
    return;
  }
  const normalized = normalizeMethodName(rawValue);
  if (!normalized) {
    pattern.methodInput = '';
    return;
  }
  const duplicate = pattern.ignoredMethods.some((method) => normalizeMethodName(method) === normalized);
  if (!duplicate) {
    pattern.ignoredMethods = [...pattern.ignoredMethods, rawValue];
  }
  pattern.methodInput = '';
}

function removeIgnoredMethod(patternIndex: number, method: string) {
  const pattern = editable.patterns[patternIndex];
  if (!pattern) {
    return;
  }
  pattern.ignoredMethods = pattern.ignoredMethods.filter((value) => value !== method);
}

function sanitizeIgnoredMethods(methods: string[]) {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const method of methods) {
    const trimmed = method?.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeMethodName(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    sanitized.push(trimmed);
  }
  return sanitized;
}

function patternPreview(phrase: string) {
  const preview = convertPlaceholdersToRegex(phrase);
  return preview || 'Waiting for placeholders…';
}

function normalizeCapturedItem(itemRaw: string | undefined, itemId: number | null) {
  if (!itemRaw) {
    return { itemName: itemRaw, itemId };
  }
  const trimmed = itemRaw.trim();
  const trailingMatch = trimmed.match(/^(.+?)\s*\((\d{1,10})\)$/);
  if (trailingMatch) {
    const [, name, idValue] = trailingMatch;
    const parsedId = Number(idValue);
    const normalizedId = Number.isFinite(parsedId) ? parsedId : itemId;
    return {
      itemName: name?.trim() ?? '',
      itemId: normalizedId ?? itemId
    };
  }
  return { itemName: trimmed, itemId };
}

const cachedPatternSampleResults = computed(() => {
  const sample = sampleLogLine.value.trim();
  const results = new Map<string, PatternSampleResult>();
  editable.patterns.forEach((pattern) => {
    const result = sample ? evaluatePatternSample(sample, pattern) : defaultSamplePromptResult();
    results.set(pattern.id, result);
  });
  return results;
});

function patternSampleResult(pattern: EditablePattern): PatternSampleResult {
  const cached = cachedPatternSampleResults.value.get(pattern.id);
  if (cached) {
    return cached;
  }
  return sampleLogLine.value.trim() ? noMatchResult() : defaultSamplePromptResult();
}

function evaluatePatternSample(sample: string, pattern: EditablePattern): PatternSampleResult {
  const compiled = convertPlaceholdersToRegex(pattern.pattern);
  if (!compiled.trim()) {
    return { matches: false, reason: 'Add placeholders to build a valid phrase.' };
  }
  try {
    const regex = new RegExp(compiled, 'i');
    const match = sample.match(regex);
    if (!match) {
      return noMatchResult();
    }

    const looter = match.groups?.looter ?? match[2];
    const itemSource = match.groups?.item ?? match[2] ?? match[1];
    const includesTrailingId = typeof itemSource === 'string' && /\(\d{1,10}\)\s*$/.test(itemSource.trim());
    const hasItemIdGroup = Object.prototype.hasOwnProperty.call(match.groups ?? {}, 'itemId');
    if (includesTrailingId && !hasItemIdGroup) {
      return {
        matches: false,
        reason: 'Includes an item ID, but the phrase is missing the {itemID} placeholder.'
      };
    }

    const itemIdRaw = match.groups?.itemId ?? null;
    const parsedItemId =
      typeof itemIdRaw === 'string' && itemIdRaw.trim().length > 0 ? Number(itemIdRaw) : null;
    const { itemName: normalizedItemName, itemId: derivedItemId } = normalizeCapturedItem(
      itemSource,
      Number.isFinite(parsedItemId) ? parsedItemId : null
    );

    const methodRaw = match.groups?.method ?? match[3];
    const displayMethod = methodRaw
      ? methodRaw.trim().replace(/^./, (char) => char.toUpperCase())
      : undefined;
    const normalizedMethod = normalizeMethodName(methodRaw);

    if (
      normalizedMethod &&
      Array.isArray(pattern.ignoredMethods) &&
      pattern.ignoredMethods.some((ignored) => normalizeMethodName(ignored) === normalizedMethod)
    ) {
      return {
        matches: false,
        ignored: true,
        reason: 'Matches sample line, but the loot method is currently ignored.'
      };
    }

    return {
      matches: true,
      looter: looter?.trim(),
      item: normalizedItemName,
      method: displayMethod,
      itemId: derivedItemId ?? null
    };
  } catch (error) {
    return {
      matches: false,
      reason: 'Invalid pattern. Check your placeholders.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function defaultSamplePromptResult(): PatternSampleResult {
  return { matches: false, reason: 'Enter a sample log line above.' };
}

function noMatchResult(): PatternSampleResult {
  return { matches: false, reason: 'No match for sample.' };
}

function togglePatternCollapse(id: string) {
  collapsedPatternIds.value = {
    ...collapsedPatternIds.value,
    [id]: !collapsedPatternIds.value[id]
  };
}

function setPatternTextareaRef(id: string): TemplateRefHandler {
  return (el) => {
    const textarea = el instanceof HTMLTextAreaElement ? el : null;
    if (textarea) {
      patternTextareas.value = { ...patternTextareas.value, [id]: textarea };
      return;
    }
    const next = { ...patternTextareas.value };
    delete next[id];
    patternTextareas.value = next;
  };
}

function handleTextareaFocus(index: number, id: string) {
  setActivePattern(index);
  updateCaretPosition(id);
}

function handlePatternInput(index: number, id: string) {
  setActivePattern(index);
  updateCaretPosition(id);
}

function updateCaretPosition(id: string) {
  const textarea = patternTextareas.value[id];
  if (!textarea) {
    return;
  }
  patternCaretPositions.value[id] = {
    start: textarea.selectionStart ?? textarea.value.length,
    end: textarea.selectionEnd ?? textarea.selectionStart ?? textarea.value.length
  };
}
</script>

<style scoped>
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  flex: 1;
  min-height: 0;
}

.settings-form__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.parser-modal__form-error {
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  color: #fecaca;
}

.parser-modal__form-error p {
  margin: 0;
  font-weight: 600;
  color: #fca5a5;
}

.parser-modal__form-error ul {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  color: #fee2e2;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.settings-grid {
  display: grid;
  gap: 1.5rem;
  min-width: 0;
}

.settings-grid__side,
.settings-grid__main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

.settings-section {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.9rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (min-width: 1024px) {
  .settings-grid {
    grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
    gap: 2rem;
  }
}

@media (max-width: 1023px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .placeholder-toolbar {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .modal {
    padding: 1.25rem;
  }

  .settings-section {
    padding: 0.85rem;
  }

  .placeholder-toolbar__chips {
    max-height: 200px;
  }
}

.settings-section h4 {
  margin: 0 0 0.5rem;
}

.sample-tester textarea {
  width: 100%;
  min-height: 130px;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.65);
  color: #f8fafc;
  padding: 0.75rem;
  font-family: inherit;
  resize: vertical;
}

.placeholder-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.placeholder-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.placeholder-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.placeholder-chip:hover {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(59, 130, 246, 0.15);
}

.placeholder-chip__token {
  font-weight: 600;
  font-size: 0.85rem;
}

.placeholder-chip__text {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.75);
}

.pattern-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.pattern-card {
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.7);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.pattern-card--active {
  border-color: rgba(99, 102, 241, 0.55);
  box-shadow: 0 16px 36px rgba(99, 102, 241, 0.18);
}

.pattern-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.pattern-card__header-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.pattern-card__toggle {
  width: 28px;
  height: 28px;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.pattern-card__chevron {
  transition: transform 0.2s ease;
}

.pattern-card__chevron--rotated {
  transform: rotate(180deg);
}

.pattern-card__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pattern-card__body-grid {
  display: grid;
  gap: 1.25rem;
  min-width: 0;
}

@media (min-width: 960px) {
  .pattern-card__body-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 240px);
  }
}

.pattern-form textarea {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.65);
  color: #f8fafc;
  padding: 0.75rem;
  font-family: inherit;
  min-height: 120px;
  resize: vertical;
}

.pattern-card__helper {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.pattern-card__helper-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.pattern-card__helper-content {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pattern-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #bfdbfe;
  font-size: 0.75rem;
}

.pattern-preview {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
  padding: 0.75rem;
}

.pattern-preview__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.pattern-preview__code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  color: #e2e8f0;
  word-break: break-all;
  white-space: pre-wrap;
  overflow-x: auto;
}

.pattern-method-ignore {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.method-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.method-input input {
  flex: 1 1 200px;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.65);
  color: #f8fafc;
  padding: 0.5rem 0.6rem;
}

.method-pill-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.method-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 0.25rem 0.6rem;
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  font-size: 0.75rem;
}

.method-pill__remove {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
}

.pattern-test {
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
}

.pattern-test--match {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.12);
}

.pattern-test--miss {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.15);
}

.pattern-test__header {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.pattern-test__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.error-text {
  color: #f87171;
  font-size: 0.85rem;
}

.error-state {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 200;
}

.modal {
  width: min(960px, 95vw);
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}

.parser-modal {
  width: min(1024px, 96vw);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.section-heading--stacked {
  flex-wrap: wrap;
  align-items: flex-start;
}

.btn--modal-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.9));
  border: none;
  color: #ecfccb;
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.35);
}

.btn--modal-primary:hover {
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.9), rgba(16, 185, 129, 1));
  color: #fff;
}

.btn--modal-outline {
  border-color: rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.4);
}

.btn--modal-outline:hover {
  border-color: rgba(148, 163, 184, 0.8);
  color: #fff;
  background: rgba(30, 41, 59, 0.6);
}

.btn--modal-danger {
  border-color: rgba(248, 113, 113, 0.5);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.25);
}

.btn--modal-danger:hover {
  border-color: rgba(248, 113, 113, 0.8);
  background: rgba(127, 29, 29, 0.45);
  color: #fff;
}

.pattern-card-collapse-enter-active,
.pattern-card-collapse-leave-active {
  transition: height 0.2s ease, opacity 0.2s ease;
}

.pattern-card-collapse-enter-from,
.pattern-card-collapse-leave-to {
  height: 0;
  opacity: 0;
}
</style>
.placeholder-panel {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.placeholder-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
