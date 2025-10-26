<template>
  <section v-if="raid" class="loot-view">
    <header class="section-header">
      <div>
        <h1>Loot Tracker</h1>
        <p class="muted">{{ raid.name }} • {{ formatDate(raid.startTime) }}</p>
      </div>
      <div class="header-actions">
        <RouterLink class="btn btn--outline" :to="{ name: 'RaidDetail', params: { raidId: raid.id } }">
          Back to Raid
        </RouterLink>
        <button v-if="canManageLoot" class="btn btn--outline btn--settings" type="button" @click="showSettings = true">
          Parser Settings
        </button>
      </div>
    </header>

    <div class="parsing-window" role="status" aria-live="polite">
      <div class="parsing-window__icon">⏱</div>
      <div class="parsing-window__details">
        <p class="parsing-window__label">Parsing Window</p>
        <p class="parsing-window__range">
          {{ parsingWindowStart }} → {{ parsingWindowEnd }}
        </p>
        <p class="parsing-window__hint">Only log lines inside this window are analyzed when you upload a log.</p>
      </div>
      <button
        v-if="canManageLoot"
        class="btn btn--outline btn--small btn--modal-outline parsing-window__button"
        type="button"
        @click="openWindowModal"
      >
        Adjust Window
      </button>
      <button
        v-if="canManageLoot"
        class="btn btn--outline btn--small btn--modal-outline parsing-window__button parsing-window__button--debug"
        type="button"
        @click="showDebugConsole = !showDebugConsole"
        :aria-pressed="showDebugConsole"
      >
        <span aria-hidden="true">🔧</span>
        <span class="sr-only">Toggle Debug Console</span>
        <span class="parsing-window__button-text">Debug</span>
      </button>
    </div>

    <section v-if="canManageLoot && parsedLoot.length === 0" class="card">
      <header class="card__header">
        <div>
          <h2>Upload Log</h2>
          <p class="muted">Upload an EverQuest log to detect loot drops during this raid.</p>
        </div>
      </header>
      <div
        class="upload-drop"
        :class="{ 'upload-drop--active': dragActive }"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="handleDrop"
      >
        <div v-if="!parsing" class="upload-drop__prompt">
          <p>Drag a log file here or</p>
          <label class="btn btn--outline btn--small upload-drop__button">
            <span class="btn__icon">📁</span>
            Select Log File
            <input ref="fileInput" class="sr-only" type="file" accept=".txt,.log" @change="handleFileSelect" />
          </label>
        </div>
        <p v-else>Parsing log… {{ parseProgress }}%</p>
        <div v-if="parsing" class="progress"><div class="progress__bar" :style="{ width: `${parseProgress}%` }"></div></div>
      </div>
    </section>

    <section v-else-if="canManageLoot && parsedLoot.length > 0" class="card detected-card">
      <header class="card__header">
        <div>
          <h2>Detected Loot</h2>
          <p class="muted">We found {{ parsedLoot.length }} entries inside this parsing window.</p>
        </div>
      </header>
      <div class="detected-card__body">
        <p class="muted small">Use the controls below to review, save, or reset.</p>
        <div class="detected-card__buttons">
          <button class="btn btn--primary btn--detected" type="button" @click="showDetectedModal = true">
            Review Detected Loot
          </button>
          <button class="btn btn--modal-primary" type="button" :disabled="savingLoot || keptLoot.length === 0" @click="saveParsedLoot">
            {{ savingLoot ? 'Saving…' : 'Add Kept Loot' }}
          </button>
          <button class="btn btn--outline btn--small btn--modal-danger" type="button" @click="resetDetectedLoot">
            Reset
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <div>
          <h2>Existing Loot</h2>
          <p class="muted">{{ lootEvents.length }} entries recorded.</p>
        </div>
        <button
          v-if="canManageLoot"
          class="btn btn--outline btn--small btn--add-loot"
          type="button"
          @click="openManualModal"
        >
          <span class="btn__icon">+</span>
          Record Loot
        </button>
      </header>
      <p v-if="lootEvents.length === 0" class="muted">No loot recorded yet.</p>
      <div v-else class="loot-grid">
        <article
          v-for="entry in groupedExistingLoot"
          :key="entry.id"
          class="loot-card"
          role="button"
          tabindex="0"
          @click="openAllaSearch(entry.itemName)"
          @keyup.enter="openAllaSearch(entry.itemName)"
        >
          <div class="loot-card__count">{{ entry.count }}×</div>
          <header class="loot-card__header">
            <span class="loot-card__emoji">{{ entry.emoji }}</span>
            <div>
              <p class="loot-card__item">{{ entry.itemName }}</p>
              <p class="loot-card__looter">{{ entry.looterName }} <span v-if="entry.looterClass">({{ entry.looterClass }})</span></p>
            </div>
          </header>
          <p v-if="entry.note" class="loot-card__note">{{ entry.note }}</p>
          <footer v-if="canDeleteExistingLoot" class="loot-card__actions">
            <button
              class="icon-button icon-button--delete"
              type="button"
              @click.stop="deleteLootGroup(entry)"
              :aria-label="`Delete ${entry.itemName} for ${entry.looterName}`"
            >
              🗑️
            </button>
          </footer>
        </article>
      </div>
    </section>

    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <div class="modal modal--wide">
        <header class="modal__header">
          <div>
            <h3>Parser Settings</h3>
            <p class="muted small">Describe loot phrases using plain language. We convert them to precise patterns automatically.</p>
          </div>
          <button class="icon-button" type="button" @click="showSettings = false">✕</button>
        </header>
        <form class="settings-form" @submit.prevent="saveParserSettings">
          <div class="settings-form__body">
            <div class="settings-grid">
              <div class="settings-grid__side">
                <section class="settings-section">
                  <h4>General</h4>
                  <label class="form__field">
                    <span>Default Loot Emoji</span>
                    <input v-model="editableSettings.emoji" type="text" maxlength="4" />
                    <small class="muted">Used when the parser can’t find a specific emoji for an item.</small>
                  </label>
                </section>

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
                    <p class="muted x-small">Example: “{timestamp} {item} has been awarded to {looter} by the {method}.”</p>
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
                      <p class="muted small">Describe the exact log line and we’ll handle the complex regex for you.</p>
                    </div>
                    <button class="btn btn--outline btn--small btn--modal-outline" type="button" @click="addPattern()">
                      <span class="btn__icon">+</span>
                      Add Phrase
                    </button>
                  </div>

                  <div v-if="editableSettings.patterns.length === 0" class="pattern-card pattern-card--empty">
                    <p>No phrases yet. Start by describing how loot lines look in your logs.</p>
                    <button class="btn btn--small" type="button" @click="addPattern()">Create First Phrase</button>
                  </div>

                  <div v-else class="pattern-list">
                    <article
                      v-for="(pattern, index) in editableSettings.patterns"
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
                            <span class="pattern-card__chevron" :class="{ 'pattern-card__chevron--rotated': !collapsedPatternIds[pattern.id] }">⌄</span>
                          </button>
                          <input
                            v-model="pattern.label"
                            type="text"
                            placeholder="Description (e.g. Kael chest drops)"
                            @focus="setActivePattern(index)"
                          />
                        </div>
                        <button class="btn btn--danger btn--small btn--modal-danger" type="button" @click.stop="removePattern(index)">
                          <span class="btn__icon">×</span>
                          Remove
                        </button>
                      </div>
                      <div class="pattern-card__body" :id="`pattern-body-${pattern.id}`" v-show="!collapsedPatternIds[pattern.id]">
                        <label class="form__field">
                          <span>Plain-language phrase</span>
                          <textarea
                            v-model="pattern.pattern"
                            rows="3"
                            placeholder="{timestamp} {item} has been awarded to {looter} by the {method}."
                            :ref="(el) => setPatternTextareaRef(pattern.id, el)"
                            @focus="handleTextareaFocus(index, pattern.id)"
                            @keyup="updateCaretPosition(pattern.id)"
                            @mouseup="updateCaretPosition(pattern.id)"
                            @click="updateCaretPosition(pattern.id)"
                            @input="updateCaretPosition(pattern.id)"
                          ></textarea>
                        </label>
                        <div class="pattern-card__helper">
                          <span class="pattern-card__helper-label">Includes</span>
                          <div class="pattern-card__helper-content">
                            <template v-if="placeholderUsage(pattern.pattern).length > 0">
                              <span
                                v-for="placeholder in placeholderUsage(pattern.pattern)"
                                :key="placeholder.token"
                                class="pattern-chip"
                              >
                                {{ placeholder.label }}
                              </span>
                            </template>
                            <span v-else class="muted x-small">Add placeholders like {timestamp}, {item}, {looter}, {method} so we know what to capture.</span>
                          </div>
                        </div>
                        <div class="pattern-preview">
                          <div>
                            <p class="pattern-preview__label">Regex preview</p>
                            <code class="pattern-preview__code">{{ patternPreview(pattern.pattern) }}</code>
                          </div>
                          <p class="muted x-small">Sent to the parser automatically—no regex knowledge required.</p>
                        </div>
                        <div
                          v-if="sampleLogLine"
                          class="pattern-test"
                          :class="patternSampleResult(pattern.pattern).matches ? 'pattern-test--match' : 'pattern-test--miss'"
                        >
                          <template v-if="patternSampleResult(pattern.pattern).matches">
                            <p class="pattern-test__header">
                              <span class="pattern-test__status">Matches sample line</span>
                            </p>
                        <ul class="pattern-test__list">
                          <li>
                            <strong>Looter:</strong>
                            <span>{{ patternSampleResult(pattern.pattern).looter ?? 'Not captured' }}</span>
                          </li>
                          <li>
                            <strong>Item:</strong>
                            <span>{{ patternSampleResult(pattern.pattern).item ?? 'Not captured' }}</span>
                          </li>
                          <li>
                            <strong>Method:</strong>
                            <span>{{ patternSampleResult(pattern.pattern).method ?? 'Not captured' }}</span>
                          </li>
                        </ul>
                          </template>
                          <template v-else>
                            <p class="pattern-test__header">
                              <span class="pattern-test__status">No match for sample</span>
                              <span class="muted x-small">Try aligning this phrase with the wording of your log.</span>
                            </p>
                          </template>
                        </div>
                      </div>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <footer class="form__actions">
            <button class="btn btn--outline btn--modal-outline" type="button" @click="showSettings = false">Cancel</button>
            <button class="btn btn--modal-primary" type="submit" :disabled="updatingSettings">
              {{ updatingSettings ? 'Saving…' : 'Save Settings' }}
            </button>
          </footer>
        </form>
      </div>
    </div>

    <div v-if="showManualModal" class="modal-backdrop" @click.self="closeManualModal">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Manual Loot Entry</h3>
            <p class="muted small">Use this when you want to record a drop without importing a log line.</p>
          </div>
          <button class="icon-button" type="button" @click="closeManualModal">✕</button>
        </header>
        <form class="manual-form" @submit.prevent="createManualEntry">
          <div class="manual-form__grid">
            <input v-model="manualForm.itemName" type="text" placeholder="Item name" required />
            <input v-model="manualForm.looterName" type="text" placeholder="Looter" required />
            <input v-model="manualForm.looterClass" type="text" placeholder="Class" />
            <input v-model="manualForm.emoji" type="text" placeholder="Emoji" maxlength="4" />
            <textarea v-model="manualForm.note" rows="3" placeholder="Note (optional)"></textarea>
          </div>
          <footer class="form__actions">
            <button class="btn btn--outline" type="button" @click="closeManualModal">Cancel</button>
            <button class="btn" type="submit" :disabled="manualSaving">
              {{ manualSaving ? 'Adding…' : 'Add Loot' }}
            </button>
          </footer>
        </form>
      </div>
    </div>

    <div v-if="showWindowModal" class="modal-backdrop" @click.self="closeWindowModal">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Adjust Parsing Window</h3>
            <p class="muted small">This only affects log parsing and will not change the raid’s actual schedule.</p>
          </div>
          <button class="icon-button" type="button" @click="closeWindowModal">✕</button>
        </header>
        <form class="window-form" @submit.prevent="saveParsingWindow">
          <label class="form__field">
            <span>Start Date &amp; Time</span>
            <input v-model="parsingWindowForm.start" type="datetime-local" required />
          </label>
          <label class="form__field">
            <span>End Date &amp; Time</span>
            <input v-model="parsingWindowForm.end" type="datetime-local" />
            <small class="muted">Leave blank to parse until the end of the uploaded log file.</small>
          </label>
          <div class="window-form__controls">
            <button class="btn btn--outline btn--small btn--modal-outline" type="button" @click="resetWindowToRaidTimes">
              Reset to Raid Times
            </button>
            <div class="window-form__actions">
              <button class="btn btn--outline btn--modal-outline" type="button" @click="closeWindowModal">Cancel</button>
              <button class="btn btn--modal-primary" type="submit">Save Window</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <section v-if="canManageLoot && showDebugConsole" class="card debug-console">
      <header class="card__header">
        <h2>Debug Console</h2>
        <div class="debug-console__actions">
          <button class="btn btn--outline btn--small" type="button" :disabled="debugLogs.length === 0" @click="copyDebugLogs">
            Copy Logs
          </button>
          <button class="btn btn--outline btn--small" type="button" :disabled="debugLogs.length === 0" @click="debugLogs = []">
            Clear
          </button>
        </div>
      </header>
      <div class="debug-console__body">
        <p v-if="debugLogs.length === 0" class="muted small">No debug output yet.</p>
        <ul v-else class="debug-console__list">
          <li v-for="entry in debugLogs" :key="entry.id" class="debug-console__entry">
            <div>
              <p class="debug-console__timestamp">{{ formatDate(entry.timestamp.toISOString()) }}</p>
              <p class="debug-console__message">{{ entry.message }}</p>
            </div>
            <pre v-if="entry.context" class="debug-console__context">{{ formatContext(entry.context) }}</pre>
          </li>
        </ul>
      </div>
    </section>

    <div v-if="showDetectedModal" class="modal-backdrop" @click.self="showDetectedModal = false">
      <div class="modal modal--wide">
        <header class="modal__header">
          <div>
            <h3>Detected Loot</h3>
            <p class="muted small">Review each drop before adding it to the raid log.</p>
          </div>
          <button class="icon-button" type="button" @click="showDetectedModal = false">✕</button>
        </header>
        <div class="detected-controls">
          <button class="btn btn--outline btn--small" type="button" @click="setAllKept(true)">Keep All</button>
          <button class="btn btn--outline btn--small" type="button" @click="setAllKept(false)">Discard All</button>
        </div>
        <div class="detected-table-wrapper">
          <table class="loot-table">
            <thead>
              <tr>
                <th>Keep</th>
                <th>Time</th>
                <th>Looter</th>
                <th>Item</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in parsedLoot" :key="row.id" :class="{ 'loot-table__row--discarded': !row.keep }">
                <td>
                  <label class="toggle-keep">
                    <input type="checkbox" v-model="row.keep" />
                    <span>{{ row.keep ? 'Keep' : 'Discard' }}</span>
                  </label>
                </td>
                <td>{{ row.timestamp ? formatDate(row.timestamp.toISOString()) : '—' }}</td>
                <td>
                  <input v-model="row.looterName" type="text" />
                </td>
                <td>
                  <input v-model="row.itemName" type="text" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="form__actions">
          <button class="btn btn--outline btn--modal-outline" type="button" @click="showDetectedModal = false">Close</button>
          <button class="btn btn--modal-primary" type="button" :disabled="savingLoot || keptLoot.length === 0" @click="saveParsedLoot">
            {{ savingLoot ? 'Saving…' : 'Add Kept Loot' }}
          </button>
        </footer>
      </div>
    </div>
  </section>
  <p v-else class="muted">Loading raid…</p>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { api, type GuildLootParserSettings, type RaidDetail, type RaidLootEvent } from '../services/api';
import { parseLootLog, type GuildLootParserPattern } from '../services/lootParser';
import { convertPlaceholdersToRegex, convertRegexToPlaceholders } from '../utils/patternPlaceholders';

interface ParsedRow {
  id: string;
  timestamp: Date | null;
  rawLine: string;
  itemName: string;
  looterName: string;
  emoji: string;
  keep: boolean;
}

interface DebugLogEntry {
  id: number;
  timestamp: Date;
  message: string;
  context?: Record<string, unknown>;
}

interface GroupedLootEntry {
  id: string;
  itemName: string;
  looterName: string;
  looterClass?: string | null;
  emoji: string;
  note?: string | null;
  count: number;
  eventIds: string[];
}

const route = useRoute();
const raidId = route.params.raidId as string;

const raid = ref<RaidDetail | null>(null);
const lootEvents = ref<RaidLootEvent[]>([]);
const parserSettings = ref<GuildLootParserSettings | null>(null);
const parsedLoot = ref<ParsedRow[]>([]);
const parsing = ref(false);
const parseProgress = ref(0);
const dragActive = ref(false);
const savingLoot = ref(false);
const manualSaving = ref(false);
const showSettings = ref(false);
const showManualModal = ref(false);
const showWindowModal = ref(false);
const showDebugConsole = ref(false);
const showDetectedModal = ref(false);
const updatingSettings = ref(false);
const editableSettings = reactive<GuildLootParserSettings>({ patterns: [], emoji: '💎' });
const activePatternIndex = ref<number | null>(null);
const collapsedPatternIds = ref<Record<string, boolean>>({});
const patternTextareas = ref<Record<string, HTMLTextAreaElement | null>>({});
const patternCaretPositions = ref<Record<string, { start: number; end: number }>>({});
const sampleLogLine = ref('');
const manualForm = reactive({
  itemName: '',
  looterName: '',
  looterClass: '',
  emoji: '💎',
  note: ''
});
const parsingWindow = reactive<{ start: string | null; end: string | null }>({
  start: null,
  end: null
});
const parsingWindowForm = reactive({
  start: '',
  end: ''
});
const debugLogs = ref<DebugLogEntry[]>([]);
watch(
  () => [raid.value?.startTime, raid.value?.endedAt],
  ([start, end]) => {
    if (start && !parsingWindow.start) {
      parsingWindow.start = start;
    }
    if (end && !parsingWindow.end) {
      parsingWindow.end = end;
    }
  }
);
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

const defaultRegexPatterns: GuildLootParserPattern[] = [
  {
    id: 'default-master-method',
    label: 'Awarded by Master Looter / Loot Council',
    pattern: convertPlaceholdersToRegex('{timestamp} {item} has been awarded to {looter} by the {method}.')
  },
  {
    id: 'default-random-roll',
    label: 'Awarded by random roll',
    pattern: convertPlaceholdersToRegex('{timestamp} {item} has been awarded to {looter} by {method}.')
  },
  {
    id: 'default-donation',
    label: 'Donations to guild',
    pattern: convertPlaceholdersToRegex('{timestamp} {item} has been donated to the Master Looter\'s guild.')
  }
];

const fileInput = ref<HTMLInputElement | null>(null);

const canManageLoot = computed(() => raid.value?.permissions?.canManage ?? false);
const keptLoot = computed(() => parsedLoot.value.filter((row) => row.keep && row.itemName && row.looterName));
const canDeleteExistingLoot = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const groupedExistingLoot = computed<GroupedLootEntry[]>(() => {
  const grouped = new Map<string, GroupedLootEntry>();
  for (const event of lootEvents.value) {
    const key = `${event.looterName}::${event.itemName}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: event.id,
        itemName: event.itemName,
        looterName: event.looterName,
        looterClass: event.looterClass,
        emoji: event.emoji ?? parserSettings.value?.emoji ?? '💎',
        note: event.note,
        count: 0,
        eventIds: []
      });
    }
    const entry = grouped.get(key)!;
    entry.count += 1;
    entry.eventIds.push(event.id);
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
});
const parsingWindowStart = computed(() => {
  const { earlier } = resolveWindowBounds();
  return earlier ? formatDate(earlier) : 'Unknown start';
});
const parsingWindowEnd = computed(() => {
  const { later } = resolveWindowBounds();
  if (!later) {
    return 'Current time (log end)';
  }
  return formatDate(later);
});

async function loadData() {
  raid.value = await api.fetchRaid(raidId);
  lootEvents.value = await api.fetchRaidLoot(raidId);
  const guildSettings = await api.fetchGuildLootSettings(raid.value.guild.id);
  syncEditableParserSettings(guildSettings);
  resetManualForm();
  initializeParsingWindow();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    appendDebugLog('File selection cleared or empty');
    return;
  }
  appendDebugLog('File selected', { name: target.files[0].name, size: target.files[0].size });
  readLogFile(target.files[0]);
  target.value = '';
}

function handleDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  dragActive.value = false;
  if (file) {
    readLogFile(file);
  }
}

function readLogFile(file: File) {
  if (!raid.value) {
    appendDebugLog('Cannot parse log before raid data loads', { file: file.name });
    return;
  }

  parsing.value = true;
  parseProgress.value = 0;
  appendDebugLog('Parsing started', {
    file: file.name,
    windowStart: parsingWindowStart.value,
    windowEnd: parsingWindowEnd.value
  });
  const reader = new FileReader();

  reader.onprogress = (progressEvent) => {
    if (progressEvent.lengthComputable) {
      parseProgress.value = Math.round((progressEvent.loaded / progressEvent.total) * 100);
    }
  };

  reader.onload = () => {
    parseProgress.value = 100;
    const content = reader.result as string;
    const patterns = getPatternsForParsing();
    const emoji = parserSettings.value?.emoji ?? '💎';
    const startIso = parsingWindow.start ?? raid.value?.startTime ?? new Date().toISOString();
    const endIso = parsingWindow.end ?? raid.value?.endedAt ?? null;
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : undefined;
    const windowStats = computeLogWindowStats(content, start, end);
    appendDebugLog('Log window stats', windowStats);
    const parsed = parseLootLog(content, start, end, patterns);
    parsedLoot.value = parsed.map((entry, index) => ({
      id: `parsed-${index}`,
      timestamp: entry.timestamp,
      rawLine: entry.rawLine,
      itemName: entry.itemName ?? entry.looter ?? 'Unknown Item',
      looterName: entry.looter ?? entry.itemName ?? 'Unknown',
      emoji,
      keep: true
    }));
    appendDebugLog('Parsing completed', {
      parsedCount: parsed.length,
      patternsUsed: patterns.length
    });
    parsing.value = false;
  };

  reader.onerror = () => {
    parsing.value = false;
    appendDebugLog('Failed to read log file', { error: reader.error?.message });
  };

  reader.readAsText(file);
}

function setAllKept(value: boolean) {
  parsedLoot.value = parsedLoot.value.map((row) => ({ ...row, keep: value }));
}

async function saveParsedLoot() {
  if (!raid.value || keptLoot.value.length === 0) {
    appendDebugLog('Save skipped: no kept loot to persist');
    return;
  }
  savingLoot.value = true;
  try {
    await api.createRaidLoot(raidId, keptLoot.value.map((row) => ({
      itemName: row.itemName,
      looterName: row.looterName,
      eventTime: row.timestamp ? row.timestamp.toISOString() : undefined,
      emoji: row.emoji
    })));
    parsedLoot.value = [];
    lootEvents.value = await api.fetchRaidLoot(raidId);
    appendDebugLog('Kept loot saved', { count: keptLoot.value.length });
  } finally {
    savingLoot.value = false;
  }
}

async function createManualEntry() {
  if (!manualForm.itemName || !manualForm.looterName) {
    appendDebugLog('Manual entry blocked: missing item or looter');
    return;
  }
  manualSaving.value = true;
  try {
    await api.createRaidLoot(raidId, [manualForm]);
    lootEvents.value = await api.fetchRaidLoot(raidId);
    resetManualForm();
    showManualModal.value = false;
    appendDebugLog('Manual loot entry created');
  } finally {
    manualSaving.value = false;
  }
}

async function confirmDelete(event: RaidLootEvent) {
  if (!confirm('Remove this loot entry?')) {
    return;
  }
  await api.deleteRaidLoot(raidId, event.id);
  lootEvents.value = lootEvents.value.filter((loot) => loot.id !== event.id);
}

function openEdit(event: RaidLootEvent) {
  const itemName = prompt('Item name', event.itemName);
  if (!itemName) {
    return;
  }
  const looterName = prompt('Looter', event.looterName) ?? event.looterName;
  const emoji = prompt('Emoji', event.emoji ?? parserSettings.value?.emoji ?? '💎') ?? event.emoji ?? undefined;
  api
    .updateRaidLoot(raidId, event.id, {
      itemName,
      looterName,
      emoji
    })
    .then(async () => {
      lootEvents.value = await api.fetchRaidLoot(raidId);
    });
}

async function saveParserSettings() {
  updatingSettings.value = true;
  try {
    const payload = {
      emoji: editableSettings.emoji,
      patterns: editableSettings.patterns.map((pattern, index) => ({
        id: pattern.id || `pattern-${index}`,
        label: pattern.label || `Pattern ${index + 1}`,
        pattern: convertPlaceholdersToRegex(pattern.pattern)
      }))
    };
    const settings = await api.updateGuildLootSettings(raid.value!.guild.id, payload);
    syncEditableParserSettings(settings);
    showSettings.value = false;
  } finally {
    updatingSettings.value = false;
  }
}

function addPattern(initialPattern?: string) {
  editableSettings.patterns.push({
    id: `pattern-${Date.now()}`,
    label: 'New Pattern',
    pattern: typeof initialPattern === 'string' ? initialPattern : defaultPattern()
  });
  activePatternIndex.value = editableSettings.patterns.length - 1;
  const newId = editableSettings.patterns[activePatternIndex.value].id;
  collapsedPatternIds.value = {
    ...collapsedPatternIds.value,
    [newId]: false
  };
  const initialLength = editableSettings.patterns[activePatternIndex.value].pattern?.length ?? 0;
  patternCaretPositions.value[newId] = { start: initialLength, end: initialLength };
}

function removePattern(index: number) {
  const removed = editableSettings.patterns.splice(index, 1)[0];
  if (activePatternIndex.value === index) {
    activePatternIndex.value = editableSettings.patterns.length ? Math.max(0, index - 1) : null;
  }
  if (removed) {
    const { [removed.id]: _, ...rest } = collapsedPatternIds.value;
    collapsedPatternIds.value = rest;
    const { [removed.id]: __, ...caretRest } = patternCaretPositions.value;
    patternCaretPositions.value = caretRest;
    const { [removed.id]: ___, ...textareaRest } = patternTextareas.value;
    patternTextareas.value = textareaRest;
  }
}

function syncEditableParserSettings(settings: GuildLootParserSettings) {
  const preparedPatterns = preparePatternsForParsing(settings.patterns);
  parserSettings.value = { ...settings, patterns: preparedPatterns };
  const editablePatterns = preparedPatterns.map((pattern) => {
    const friendlyPattern = convertRegexToPlaceholders(pattern.pattern);
    return {
      ...pattern,
      pattern: friendlyPattern || pattern.pattern
    };
  });
  editableSettings.patterns = editablePatterns;
  editableSettings.emoji = settings.emoji;
  manualForm.emoji = settings.emoji;
  activePatternIndex.value = editablePatterns.length ? 0 : null;
  collapsedPatternIds.value = editablePatterns.reduce<Record<string, boolean>>((acc, pattern) => {
    acc[pattern.id] = false;
    return acc;
  }, {});
  patternCaretPositions.value = editablePatterns.reduce<Record<string, { start: number; end: number }>>((acc, pattern) => {
    const length = pattern.pattern?.length ?? 0;
    acc[pattern.id] = { start: length, end: length };
    return acc;
  }, {});
}

function defaultPattern() {
  return '{timestamp} {item} has been awarded to {looter} by the {method}.';
}

function setActivePattern(index: number) {
  activePatternIndex.value = index;
}

function appendPlaceholder(token: string) {
  if (!editableSettings.patterns.length) {
    addPattern('');
  }
  const index = activePatternIndex.value ?? editableSettings.patterns.length - 1;
  const target = editableSettings.patterns[index];
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

function patternPreview(phrase: string) {
  const preview = convertPlaceholdersToRegex(phrase);
  return preview || 'Waiting for placeholders…';
}

function patternSampleResult(phrase: string) {
  if (!sampleLogLine.value.trim()) {
    return { matches: false };
  }
  const compiled = convertPlaceholdersToRegex(phrase);
  if (!compiled.trim()) {
    return { matches: false };
  }
  try {
    const regex = new RegExp(compiled, 'i');
    const match = sampleLogLine.value.match(regex);
    if (!match) {
      return { matches: false };
    }
    const looter = match.groups?.looter ?? match[1];
    const item = match.groups?.item ?? match[2];
    const method = match.groups?.method ?? match[3];
    const normalizedMethod = method
      ? method
          .trim()
          .replace(/^./, (char) => char.toUpperCase())
      : undefined;
    return {
      matches: true,
      looter: looter?.trim(),
      item: item?.trim(),
      method: normalizedMethod
    };
  } catch (err) {
    return { matches: false, error: String(err) };
  }
}

function togglePatternCollapse(id: string) {
  collapsedPatternIds.value = {
    ...collapsedPatternIds.value,
    [id]: !collapsedPatternIds.value[id]
  };
}

function setPatternTextareaRef(id: string, el: HTMLTextAreaElement | null) {
  if (el) {
    patternTextareas.value[id] = el;
  } else {
    const { [id]: _, ...rest } = patternTextareas.value;
    patternTextareas.value = rest;
  }
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

function handleTextareaFocus(index: number, id: string) {
  setActivePattern(index);
  updateCaretPosition(id);
}

function openManualModal() {
  showManualModal.value = true;
}

function closeManualModal() {
  showManualModal.value = false;
  resetManualForm();
}

function resetManualForm() {
  manualForm.itemName = '';
  manualForm.looterName = '';
  manualForm.looterClass = '';
  manualForm.emoji = parserSettings.value?.emoji ?? '💎';
  manualForm.note = '';
}

function initializeParsingWindow() {
  parsingWindow.start = raid.value?.startTime ?? null;
  parsingWindow.end = raid.value?.endedAt ?? null;
}

function openWindowModal() {
  parsingWindowForm.start = toInputValue(parsingWindow.start ?? raid.value?.startTime ?? null);
  parsingWindowForm.end = toInputValue(parsingWindow.end ?? raid.value?.endedAt ?? null);
  showWindowModal.value = true;
}

function closeWindowModal() {
  showWindowModal.value = false;
}

function saveParsingWindow() {
  const startIso = fromInputValue(parsingWindowForm.start) ?? raid.value?.startTime ?? null;
  const endIso = fromInputValue(parsingWindowForm.end);
  parsingWindow.start = startIso;
  parsingWindow.end = endIso;
  showWindowModal.value = false;
  appendDebugLog('Parsing window updated', {
    startUtc: startIso,
    startLocal: startIso ? formatDate(startIso) : null,
    endUtc: endIso,
    endLocal: endIso ? formatDate(endIso) : 'Current log end'
  });
}

function resetWindowToRaidTimes() {
  initializeParsingWindow();
  parsingWindowForm.start = toInputValue(parsingWindow.start);
  parsingWindowForm.end = toInputValue(parsingWindow.end);
  appendDebugLog('Parsing window reset to raid times', {
    startUtc: parsingWindow.start,
    startLocal: parsingWindow.start ? formatDate(parsingWindow.start) : null,
    endUtc: parsingWindow.end,
    endLocal: parsingWindow.end ? formatDate(parsingWindow.end) : 'Current log end'
  });
}

function resolveWindowBounds() {
  const startIso = parsingWindow.start ?? raid.value?.startTime ?? null;
  const endIso = parsingWindow.end ?? raid.value?.endedAt ?? null;
  if (startIso && endIso) {
    const startDate = new Date(startIso).getTime();
    const endDate = new Date(endIso).getTime();
    if (startDate <= endDate) {
      return { earlier: startIso, later: endIso };
    }
    return { earlier: endIso, later: startIso };
  }
  return { earlier: startIso, later: endIso };
}

function toInputValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function computeLogWindowStats(content: string, start: Date, end?: Date) {
  const lines = content.split(/\r?\n/);
  let timestampedLines = 0;
  let withinWindowLines = 0;
  const samples: string[] = [];
  for (const line of lines) {
    const timestamp = extractConsoleTimestamp(line);
    if (!timestamp) {
      continue;
    }
    timestampedLines++;
    if (!isTimestampWithinWindow(timestamp, start, end)) {
      continue;
    }
    withinWindowLines++;
    if (samples.length < 3) {
      samples.push(line.trim());
    }
  }
  return { timestampedLines, withinWindowLines, samples };
}

function extractConsoleTimestamp(line: string) {
  const match = line.match(consoleTimestampRegex);
  if (!match?.groups) {
    return null;
  }
  const { day, month, date, time, year } = match.groups;
  const composed = `${day} ${month} ${date} ${time} ${year}`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTimestampWithinWindow(timestamp: Date, start: Date, end?: Date) {
  if (timestamp < start) {
    return false;
  }
  if (end && timestamp > end) {
    return false;
  }
  return true;
}

function getPatternsForParsing() {
  if (parserSettings.value?.patterns?.length) {
    return parserSettings.value.patterns;
  }
  return defaultRegexPatterns;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function ensureAwardingPatterns(patterns: GuildLootParserPattern[]) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return defaultRegexPatterns;
  }
  const hasAwarding = patterns.some((pattern) => pattern.pattern?.includes('has\\s+been\\s+awarded'));
  if (hasAwarding) {
    return patterns;
  }
  const missingDefaults = defaultRegexPatterns.filter(
    (pattern) => !patterns.some((existing) => existing.pattern === pattern.pattern)
  );
  return [...patterns, ...missingDefaults];
}

function preparePatternsForParsing(patterns: GuildLootParserPattern[]) {
  const merged = ensureAwardingPatterns(patterns);
  return merged.map((pattern) => ({
    ...pattern,
    pattern: pattern.pattern.includes('{') ? convertPlaceholdersToRegex(pattern.pattern) : pattern.pattern
  }));
}

const consoleTimestampRegex = /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

function appendDebugLog(message: string, context?: Record<string, unknown>) {
  const entry: DebugLogEntry = {
    id: Date.now() + Math.random(),
    timestamp: new Date(),
    message,
    context
  };
  debugLogs.value = [...debugLogs.value.slice(-199), entry];
}

function formatContext(context: Record<string, unknown>) {
  return JSON.stringify(context, null, 2);
}

async function copyDebugLogs() {
  if (debugLogs.value.length === 0) {
    return;
  }
  const serialized = debugLogs.value
    .map((entry) => {
      const base = `[${entry.timestamp.toISOString()}] ${entry.message}`;
      if (entry.context) {
        return `${base}\n${formatContext(entry.context)}`;
      }
      return base;
    })
    .join('\n\n');
  try {
    // @ts-expect-error: navigator may be undefined in SSR
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(serialized);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = serialized;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    appendDebugLog('Debug console copied to clipboard');
  } catch (error) {
    appendDebugLog('Failed to copy debug logs', { error: String(error) });
  }
}

function resetDetectedLoot() {
  parsedLoot.value = [];
  showDetectedModal.value = false;
  appendDebugLog('Detected loot reset');
}

async function deleteLootGroup(entry: GroupedLootEntry) {
  if (!canDeleteExistingLoot.value) {
    return;
  }
  const confirmed = confirm(
    `Remove ${entry.count} entr${entry.count === 1 ? 'y' : 'ies'} of ${entry.itemName} looted by ${entry.looterName}?`
  );
  if (!confirmed) {
    return;
  }
  try {
    await Promise.all(entry.eventIds.map((lootId) => api.deleteRaidLoot(raidId, lootId)));
    lootEvents.value = lootEvents.value.filter((event) => !entry.eventIds.includes(event.id));
    appendDebugLog('Deleted loot entries', {
      itemName: entry.itemName,
      looterName: entry.looterName,
      count: entry.count
    });
  } catch (error) {
    appendDebugLog('Failed to delete loot entries', { error: String(error) });
  }
}

function openAllaSearch(itemName: string) {
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const url = `${base}&iname=${encodeURIComponent(itemName)}`;
  window.open(url, '_blank');
}

onMounted(loadData);
</script>

<style scoped>
.loot-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.parsing-window {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 118, 214, 0.15));
  color: #e2e8f0;
  box-shadow: 0 12px 30px rgba(15, 118, 214, 0.15);
}

.parsing-window__icon {
  width: 44px;
  height: 44px;
  border-radius: 0.9rem;
  background: rgba(14, 165, 233, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.parsing-window__details {
  flex: 1;
  min-width: 220px;
}

.parsing-window__label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.parsing-window__range {
  margin: 0.15rem 0 0;
  font-weight: 600;
  font-size: 1rem;
}

.parsing-window__hint {
  margin: 0.1rem 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.parsing-window__button {
  margin-left: auto;
}

.parsing-window__button--debug {
  margin-left: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: auto;
}

.parsing-window__button-text {
  font-size: 0.85rem;
}

.btn--settings {
  border-color: rgba(14, 165, 233, 0.6);
  color: #bae6fd;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.25));
}

.btn--settings:hover {
  border-color: rgba(14, 165, 233, 0.85);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.35), rgba(99, 102, 241, 0.4));
}

.upload-drop {
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.upload-drop--active {
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(59, 130, 246, 0.08);
  color: #bae6fd;
}

.upload-drop__prompt {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.upload-drop__prompt p {
  margin: 0;
}

.upload-drop__button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border-color: rgba(59, 130, 246, 0.65);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(14, 165, 233, 0.3));
  box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
}

.upload-drop__button:hover {
  border-color: rgba(59, 130, 246, 0.9);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(14, 165, 233, 0.45));
  color: #fff;
}

.progress {
  margin-top: 0.75rem;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.progress__bar {
  height: 100%;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(99, 102, 241, 0.8));
}

.loot-table {
  width: 100%;
  border-collapse: collapse;
}

.loot-table th,
.loot-table td {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.loot-table__row--discarded {
  opacity: 0.6;
}

.loot-table input {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.4rem;
  color: #e2e8f0;
  padding: 0.4rem;
}

.toggle-keep {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.toggle-keep input {
  width: 18px;
  height: 18px;
}

.loot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.loot-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.35);
  position: relative;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}

.loot-card:hover,
.loot-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.45);
}

.loot-card__count {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.5);
  color: #bbf7d0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.65rem;
  font-weight: 700;
  font-size: 0.85rem;
}

.loot-card__header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding-right: 2.5rem;
}

.loot-card__emoji {
  font-size: 1.5rem;
}

.loot-card__item {
  margin: 0;
  font-weight: 700;
}

.loot-card__looter {
  margin: 0;
  color: #94a3b8;
}

.loot-card__note {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.loot-card__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}

.btn__icon {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1;
}

.btn--add-loot {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  border-color: rgba(59, 130, 246, 0.6);
  color: #bfdbfe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(14, 165, 233, 0.2));
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.25);
}

.btn--add-loot:hover {
  border-color: rgba(59, 130, 246, 0.85);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(14, 165, 233, 0.35));
}

.btn--add-loot .btn__icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem;
  background: rgba(14, 165, 233, 0.35);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  box-shadow: 0 0 8px rgba(14, 165, 233, 0.25);
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

.btn--detected {
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.85), rgba(147, 197, 253, 0.9));
  color: #0f172a;
  border: none;
  box-shadow: 0 12px 30px rgba(129, 140, 248, 0.35);
}

.btn--detected:hover {
  color: #020617;
  box-shadow: 0 14px 34px rgba(129, 140, 248, 0.45);
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

.window-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.window-form__controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.window-form__actions {
  display: flex;
  gap: 0.75rem;
}

.detected-card {
  text-align: center;
}

.detected-card__actions {
  display: none;
}

.detected-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.detected-card__buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.detected-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.detected-table-wrapper {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
}

.detected-table-wrapper .loot-table {
  margin: 0;
}

.detected-table-wrapper .loot-table input {
  background: rgba(15, 23, 42, 0.7);
}

.debug-console {
  background: rgba(15, 23, 42, 0.75);
}

.debug-console__body {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
}

.debug-console__actions {
  display: flex;
  gap: 0.5rem;
}

.debug-console__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.debug-console__entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.debug-console__entry:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.debug-console__timestamp {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.debug-console__message {
  margin: 0;
  font-weight: 600;
}

.debug-console__context {
  margin: 0;
  font-size: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0.5rem;
  padding: 0.5rem;
  color: #e2e8f0;
}


.manual-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.manual-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.manual-form__grid input,
.manual-form__grid textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 0.5rem;
  color: #f8fafc;
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

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  overflow: hidden;
}

.settings-form__body {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 1rem;
}

.settings-grid__side,
.settings-grid__main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form__field input,
.form__field textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #f8fafc;
  padding: 0.5rem;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.placeholder-panel {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  padding: 0.85rem;
  gap: 0.5rem;
}

.placeholder-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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

.placeholder-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
}

.placeholder-toolbar__label {
  min-width: 180px;
}

.placeholder-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
}

.placeholder-chip {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 0.65rem;
  padding: 0.5rem 0.85rem;
  background: rgba(59, 130, 246, 0.1);
  color: #e0f2fe;
  font-size: 0.85rem;
  cursor: pointer;
  min-width: 150px;
}

.placeholder-chip__token {
  font-weight: 600;
}

.placeholder-chip__text {
  font-size: 0.75rem;
  color: #bae6fd;
}

.sample-tester textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px dashed rgba(59, 130, 246, 0.4);
  border-radius: 0.5rem;
  padding: 0.6rem;
  color: #f8fafc;
}

.pattern-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.4);
}

.pattern-card--empty {
  align-items: flex-start;
  text-align: left;
  gap: 0.75rem;
}

.pattern-card--active {
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
}

.pattern-card--collapsed .pattern-card__body {
  display: none;
}

.pattern-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pattern-card__helper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.pattern-card__helper-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5f5;
}

.pattern-card__helper-content {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.pattern-card__header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.pattern-card__header-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
}

.pattern-card__toggle {
  width: 28px;
  height: 28px;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pattern-card__chevron {
  transition: transform 0.2s ease;
}

.pattern-card__chevron--rotated {
  transform: rotate(180deg);
}

.pattern-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(59, 130, 246, 0.15);
  color: #bfdbfe;
}

.pattern-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.35);
}

.pattern-preview__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.pattern-preview__code {
  display: block;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
  color: #f0abfc;
  word-break: break-all;
}

.pattern-test {
  border-radius: 0.65rem;
  padding: 0.65rem 0.85rem;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.pattern-test--match {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.1);
}

.pattern-test--miss {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
}

.pattern-test__header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.pattern-test__status {
  font-weight: 600;
  font-size: 0.9rem;
}

.pattern-test__list {
  list-style: none;
  padding: 0.25rem 0 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}

.pattern-test__list strong {
  font-weight: 600;
  color: #e2e8f0;
  margin-right: 0.25rem;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .settings-form__body {
    padding-right: 0;
  }
}

.pattern-card__header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 0.4rem;
  transition: color 0.2s ease, background 0.2s ease;
}

.icon-button--delete {
  color: rgba(248, 113, 113, 0.8);
}

.icon-button--delete:hover,
.icon-button--delete:focus-visible {
  color: rgba(248, 113, 113, 1);
  background: rgba(248, 113, 113, 0.15);
}

.sr-only {
  position: absolute;
  left: -9999px;
}
</style>
