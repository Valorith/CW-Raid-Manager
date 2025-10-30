<template>
  <section class="metrics-view">
    <div v-if="metrics" class="metrics-content">
      <div v-if="error" class="metrics-inline-error">
        <p>{{ error }}</p>
        <button class="btn btn--outline btn--small" type="button" @click="reloadMetrics">
          Retry
        </button>
      </div>

      <header class="metrics-header">
        <div>
          <h1>Guild Metrics</h1>
          <p class="muted small">Attendance and loot trends for {{ activeRangeLabel }}</p>
        </div>
        <RouterLink
          class="btn btn--outline metrics-back"
          :to="{ name: 'GuildDetail', params: { guildId } }"
        >
          ← Back to Guild
        </RouterLink>
      </header>

      <TimelineRangeSelector
        v-if="timelineBounds"
        :min-date="timelineBounds.min"
        :max-date="timelineBounds.max"
        :start-date="currentRangeIso.start"
        :end-date="currentRangeIso.end"
        :disabled="loading"
        :event-dates="timelineEventDates"
        @update="handleTimelinePreview"
        @commit="handleTimelineCommit"
      >
        <div class="timeline-summary">
          <span class="timeline-summary__label">Selected Range</span>
          <span class="timeline-summary__value">{{ timelineSelectionLabel }}</span>
        </div>
      </TimelineRangeSelector>

      <div class="metrics-summary">
        <div v-for="card in summaryCards" :key="card.label" class="metrics-summary__item">
          <span class="metrics-summary__label">{{ card.label }}</span>
          <span class="metrics-summary__value">{{ formatNumber(card.value) }}</span>
        </div>
      </div>

      <div class="metrics-filters">
        <div class="metrics-search-container">
          <div class="metrics-search">
            <div class="metrics-search__input-wrapper">
              <input
                id="metrics-search"
                ref="searchInputRef"
                v-model="searchQuery"
                type="search"
                class="metrics-search__input"
                placeholder="Search characters or loot items"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @keydown="handleSearchKeydown"
            />
            <ul
              v-if="showSearchResults"
              ref="searchResultsRef"
              class="metrics-search__results"
              @mouseenter="handleSearchResultsHover(true)"
              @mouseleave="handleSearchResultsHover(false)"
            >
              <li
                v-for="option in filteredSearchOptions"
                :key="`${option.type}-${option.value}`"
                class="metrics-search__result"
                :class="{ 'metrics-search__result--active': isSearchOptionActive(option) }"
                @mousedown.prevent="handleSearchSelect(option)"
                @mouseenter="setActiveSearchOption(option)"
              >
                  <span class="metrics-search__result-primary">{{ option.label }}</span>
                  <span v-if="option.description" class="metrics-search__result-secondary">
                    {{ option.description }}
                  </span>
                </li>
                <li
                  v-if="filteredSearchOptions.length === 0"
                  class="metrics-search__result metrics-search__result--empty"
                >
                  No matches found
                </li>
              </ul>
            </div>
            <div v-if="selectedCharacterChips.length > 0" class="metrics-search__chips">
              <span v-for="chip in selectedCharacterChips" :key="chip.key" class="metrics-chip">
                <span>{{ chip.label }}</span>
                <button
                  type="button"
                  class="metrics-chip__remove"
                  @click="removeCharacterSelection(chip.key)"
                >
                  ×
                </button>
              </span>
            </div>
            <div
              v-if="selectedLootItemChips.length > 0"
              class="metrics-search__chips metrics-search__chips--items"
            >
              <span
                v-for="chip in selectedLootItemChips"
                :key="chip.key"
                class="metrics-chip metrics-chip--item"
              >
                <span>{{ chip.label }}</span>
                <button
                  type="button"
                  class="metrics-chip__remove"
                  @click="removeItemSelection(chip.label)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="metrics-inspector">
          <CharacterInspector
            :entries="characterInspectorEntries"
            :total-raids="allRaidIds.length"
            @reset="handleInspectorReset"
            @reorder="handleInspectorReorder"
          />
        </div>
      </div>

      <section class="metrics-section" v-if="isAttendanceSectionVisible">
        <header class="metrics-section__header">
          <div>
            <h2>Attendance Trends</h2>
            <p class="muted small">Track how often characters show up and in what status.</p>
          </div>
        </header>

        <div class="metrics-card-grid" :class="{ 'metrics-card-grid--maximized': maximizedCard }">
          <article
            v-if="!maximizedCard || maximizedCard === 'attendanceTimeline'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'attendanceTimeline' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Attendance Over Time</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('attendanceTimeline') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('attendanceTimeline')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Line
                v-if="attendanceTimelineHasData"
                :data="attendanceTimelineChartData"
                :options="attendanceTimelineChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No attendance records match the current filters.
              </p>
            </div>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'attendanceByCharacter'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'attendanceByCharacter' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Attendance Rate by Character</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('attendanceByCharacter') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('attendanceByCharacter')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="attendanceByCharacterHasData"
                :data="attendanceByCharacterChartData"
                :options="attendanceByCharacterChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                Not enough attendance activity for the selected filters.
              </p>
            </div>
          </article>

          <article v-if="!maximizedCard" class="metrics-card metrics-class-card">
            <header class="metrics-card__header">
              <h3>Filter by Class</h3>
              <p class="metrics-card__hint muted tiny">
                Click to include or exclude a class. No selection = every class.
              </p>
            </header>
            <div class="metrics-class-toggle metrics-class-toggle--grid">
              <button
                v-for="option in classIconOptions"
                :key="option.value"
                type="button"
                :class="[
                  'metrics-class-toggle__button',
                  {
                    'metrics-class-toggle__button--active': classSetHas(option.value),
                    'metrics-class-toggle__button--inactive':
                      !option.isAvailable && !classSetHas(option.value)
                  }
                ]"
                :aria-pressed="classSetHas(option.value)"
                :aria-label="option.label"
                @click="toggleClass(option.value)"
              >
                <span class="metrics-class-toggle__icon">
                  <img v-if="option.icon" :src="option.icon" :alt="option.label" />
                  <span v-else>{{ option.shortLabel }}</span>
                </span>
                <span class="metrics-class-toggle__label">{{ option.shortLabel }}</span>
              </button>
            </div>
          </article>
        </div>

        <div v-if="attendanceSpotlight.length > 0" class="metrics-spotlight">
          <h3>Character Spotlight</h3>
          <ul class="metrics-spotlight__list">
            <li
              v-for="entry in attendanceSpotlight"
              :key="entry.key"
              class="metrics-spotlight__item"
            >
              <div>
                <CharacterLink class="metrics-spotlight__name" :name="entry.name" />
                <span v-if="entry.class" class="muted small">
                  • {{ resolveClassLabel(entry.class) }}
                </span>
                <span v-if="entry.userDisplayName" class="muted small">
                  • {{ entry.userDisplayName }}
                </span>
              </div>
              <div class="metrics-spotlight__stats">
                <span>{{ formatPercent(attendanceRate(entry)) }} participation</span>
                <span class="muted tiny">
                  {{ entry.presentEvents }} present events · {{ entry.lateRaids }} late ·
                  {{ entry.leftEarlyRaids }} left early · {{ entry.absentRaids }} absent ·
                  {{ entry.totalRaids }} raids
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section class="metrics-section" v-if="isLootSectionVisible">
        <header class="metrics-section__header">
          <div>
            <h2>Loot Trends</h2>
            <p class="muted small">Monitor loot volume, recipients, and the most awarded items.</p>
          </div>
        </header>

        <div class="metrics-card-grid" :class="{ 'metrics-card-grid--maximized': maximizedCard }">
          <article
            v-if="!maximizedCard || maximizedCard === 'lootTimeline'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootTimeline' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Loot Over Time</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootTimeline') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootTimeline')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Line
                v-if="lootTimelineHasData"
                :data="lootTimelineChartData"
                :options="lootTimelineChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No loot awards found for the current filters.
              </p>
            </div>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'lootByParticipant'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootByParticipant' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Top Loot Recipients</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootByParticipant') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootByParticipant')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="lootByParticipantHasData"
                :data="lootByParticipantChartData"
                :options="lootByParticipantChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                Adjust filters to see loot distribution by character.
              </p>
            </div>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'lootByItem'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootByItem' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Most Awarded Items</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootByItem') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootByItem')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="lootByItemHasData"
                :data="lootByItemChartData"
                :options="lootByItemChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No loot items recorded within the selected filters.
              </p>
            </div>
          </article>
        </div>

        <div
          v-if="lootSpotlightCharacters.length > 0 || lootSpotlightItems.length > 0"
          class="metrics-spotlight"
        >
          <h3>Loot Spotlight</h3>
          <template v-if="lootSpotlightCharacters.length > 0">
            <h4 class="metrics-spotlight__subtitle">Selected Characters</h4>
            <ul class="metrics-spotlight__list">
              <li
                v-for="entry in lootSpotlightCharacters"
                :key="`character-${entry.name}`"
                class="metrics-spotlight__item"
              >
                <div>
                <CharacterLink class="metrics-spotlight__name" :name="entry.name" />
                  <span v-if="entry.class" class="muted small">
                    • {{ resolveGenericClassLabel(entry.class) }}
                  </span>
                </div>
                <div class="metrics-spotlight__stats">
                  <span>{{ formatNumber(entry.count) }} items</span>
                  <span v-if="entry.lastAwarded" class="muted tiny">
                    Last award {{ formatDateLong(entry.lastAwarded) }}
                  </span>
                </div>
              </li>
            </ul>
          </template>
          <template v-if="lootSpotlightItems.length > 0">
            <h4 class="metrics-spotlight__subtitle">Selected Items</h4>
            <ul class="metrics-spotlight__list">
              <li
                v-for="entry in lootSpotlightItems"
                :key="`item-${entry.itemName}`"
                class="metrics-spotlight__item"
              >
                <div>
                <strong>{{ entry.itemName }}</strong>
                </div>
                <div class="metrics-spotlight__stats">
                  <span>{{ formatNumber(entry.count) }} awards</span>
                  <span v-if="entry.lastAwarded" class="muted tiny">
                    Last award {{ formatDateLong(entry.lastAwarded) }}
                  </span>
                </div>
              </li>
            </ul>
          </template>
        </div>

        <div v-if="recentLootEvents.length > 0" class="metrics-recent">
          <h3>Recent Loot Events</h3>
          <div class="metrics-recent__grid">
            <article v-for="event in recentLootEvents" :key="event.id" class="metrics-recent__card">
              <header class="metrics-recent__header">
                <div class="metrics-recent__item-icon" aria-hidden="true">
                  <span aria-hidden="true">🪙</span>
                </div>
                <div class="metrics-recent__item-title">
                  <strong>{{ event.itemName }}</strong>
                  <span class="metrics-recent__raid muted tiny">{{ event.raid.name }}</span>
                </div>
                <span class="metrics-recent__time muted tiny">
                  {{ formatDateLong(eventPrimaryTimestamp(event)) }}
                </span>
              </header>
              <section class="metrics-recent__body">
                <div class="metrics-recent__looter">
                  <span class="metrics-recent__looter-label">Awarded to</span>
                  <CharacterLink class="metrics-recent__looter-name" :name="event.looterName" />
                </div>
                <span
                  v-if="event.emoji"
                  class="metrics-recent__emoji"
                  :title="`Reaction: ${event.emoji}`"
                >
                  {{ event.emoji }}
                </span>
              </section>
            </article>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="loading" class="metrics-state">
      <p>Loading metrics…</p>
    </div>

    <div v-else-if="error" class="metrics-state metrics-state--error">
      <p>{{ error }}</p>
      <button class="btn btn--outline" type="button" @click="reloadMetrics">Retry</button>
    </div>

    <div v-else class="metrics-state metrics-state--empty">
      <p>No metrics available yet.</p>
      <button class="btn btn--outline" type="button" @click="reloadMetrics">Refresh</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Bar, Line } from 'vue-chartjs';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import CharacterInspector from '../components/CharacterInspector.vue';
import CharacterLink from '../components/CharacterLink.vue';
import TimelineRangeSelector from '../components/TimelineRangeSelector.vue';
import {
  api,
  type AttendanceMetricRecord,
  type GuildMetrics,
  type GuildMetricsQuery,
  type GuildMetricsSummary,
  type LootMetricEvent,
  type MetricsCharacterOption
} from '../services/api';
import {
  characterClassLabels,
  getCharacterClassIcon,
  type AttendanceStatus,
  type CharacterClass
} from '../services/types';
import { ensureChartJsRegistered } from '../utils/registerCharts';

const ALL_CLASS_VALUES: CharacterClass[] = [
  'WARRIOR',
  'PALADIN',
  'SHADOWKNIGHT',
  'CLERIC',
  'DRUID',
  'SHAMAN',
  'MONK',
  'RANGER',
  'ROGUE',
  'BARD',
  'BEASTLORD',
  'BERSERKER',
  'MAGICIAN',
  'ENCHANTER',
  'NECROMANCER',
  'WIZARD'
];
const CHARACTER_CLASS_FRIENDLY_NAMES: Record<CharacterClass, string> = {
  WARRIOR: 'Warrior',
  PALADIN: 'Paladin',
  SHADOWKNIGHT: 'Shadow Knight',
  CLERIC: 'Cleric',
  DRUID: 'Druid',
  SHAMAN: 'Shaman',
  MONK: 'Monk',
  RANGER: 'Ranger',
  ROGUE: 'Rogue',
  BARD: 'Bard',
  BEASTLORD: 'Beastlord',
  BERSERKER: 'Berserker',
  MAGICIAN: 'Magician',
  ENCHANTER: 'Enchanter',
  NECROMANCER: 'Necromancer',
  WIZARD: 'Wizard',
  UNKNOWN: 'Unknown'
};

ensureChartJsRegistered();

const route = useRoute();
const guildId = computed(() => route.params.guildId as string);

const loading = ref(false);
const error = ref<string | null>(null);
const metrics = ref<GuildMetrics | null>(null);

const rangeForm = reactive({
  start: '',
  end: ''
});

type MaximizableCard =
  | 'attendanceTimeline'
  | 'attendanceByCharacter'
  | 'lootTimeline'
  | 'lootByParticipant'
  | 'lootByItem';

const selectedClasses = ref<string[]>([]);
const selectedCharacters = ref<string[]>([]);
const selectedLootItems = ref<string[]>([]);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchResultsRef = ref<HTMLUListElement | null>(null);
const searchQuery = ref('');
const searchFocused = ref(false);
const searchResultsHover = ref(false);
const activeSearchIndex = ref(-1);
const searchDropdownSuppressed = ref(false);
const ignoreNextSearchQueryReset = ref(false);
const globalSummary = ref<GuildMetricsSummary | null>(null);
const globalTimeline = ref<{ minMs: number; markers: Map<string, TimelineMarker> } | null>(null);
const maximizedCard = ref<MaximizableCard | null>(null);

const DEFAULT_BAR_LIMIT = 12;
const MAXIMIZED_BAR_LIMIT = 30;

const attendanceCards: MaximizableCard[] = ['attendanceTimeline', 'attendanceByCharacter'];
const lootCards: MaximizableCard[] = ['lootTimeline', 'lootByParticipant', 'lootByItem'];

const isAttendanceSectionVisible = computed(
  () => !maximizedCard.value || attendanceCards.includes(maximizedCard.value)
);
const isLootSectionVisible = computed(
  () => !maximizedCard.value || lootCards.includes(maximizedCard.value)
);

function toggleMaximizeCard(card: MaximizableCard) {
  maximizedCard.value = maximizedCard.value === card ? null : card;
}

function isCardMaximized(card: MaximizableCard): boolean {
  return maximizedCard.value === card;
}

function startOfDayUtcIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const utcStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(utcStart).toISOString();
}

function startOfDayLocalIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const localStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return localStart.toISOString();
}

function formatTimelineLabel(iso: string): string {
  return formatRangeDate(startOfDayUtcIso(iso));
}

function formatTimelineDisplay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseIsoToMs(iso?: string | null, floor = false): number | null {
  if (!iso) {
    return null;
  }
  const value = floor ? startOfDayLocalIso(iso) : iso;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return ms;
}

function startOfDayLocalMs(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const statusOrder: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'BENCHED'];
const statusLabels: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  BENCHED: 'Left Early'
};
const statusColors: Record<AttendanceStatus, { border: string; background: string }> = {
  PRESENT: { border: '#22c55e', background: 'rgba(34,197,94,0.25)' },
  LATE: { border: '#f97316', background: 'rgba(249,115,22,0.2)' },
  ABSENT: { border: '#ef4444', background: 'rgba(239,68,68,0.2)' },
  BENCHED: { border: '#a855f7', background: 'rgba(168,85,247,0.2)' }
};

const lastSubmittedQuery = ref<GuildMetricsQuery | undefined>(undefined);

const metricsClassSet = computed(() => {
  const set = new Set<string>();
  for (const entry of metrics.value?.filterOptions.classes ?? []) {
    const normalized = normalizeClassValue(entry);
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
});

const characterOptions = computed(() => metrics.value?.filterOptions.characters ?? []);

function normalizeClassValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

function normalizeCharacterClass(value?: string | null): CharacterClass | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return (ALL_CLASS_VALUES as readonly string[]).includes(normalized)
    ? (normalized as CharacterClass)
    : null;
}

interface ClassIconOption {
  value: string;
  label: string;
  shortLabel: string;
  icon: string | null;
  isAvailable: boolean;
}

const classIconOptions = computed<ClassIconOption[]>(() => {
  const available = metricsClassSet.value;
  return ALL_CLASS_VALUES.map((value) => {
    const shortLabel = characterClassLabels[value] ?? value.slice(0, 3);
    const label = CHARACTER_CLASS_FRIENDLY_NAMES[value] ?? resolveGenericClassLabel(value) ?? value;
    const icon = getCharacterClassIcon(value) ?? null;
    return {
      value,
      label,
      shortLabel,
      icon,
      isAvailable: available.size === 0 ? true : available.has(value)
    };
  });
});

interface LootItemOption {
  name: string;
  count: number;
  searchText: string;
}

const lootItemOptions = computed<LootItemOption[]>(() => {
  if (!metrics.value) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const event of metrics.value.lootEvents) {
    const name = event.itemName;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, searchText: name.toLowerCase() }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
});

interface SearchOptionEntry {
  type: 'character' | 'item';
  value: string;
  label: string;
  description?: string;
  searchText: string;
  normalizedValue: string;
  isMain?: boolean;
}

const searchOptions = computed<SearchOptionEntry[]>(() => {
  const options: SearchOptionEntry[] = [];
  for (const option of characterOptions.value) {
    const key = characterOptionKey(option);
    const classLabel = resolveClassLabel(option.class);
    options.push({
      type: 'character',
      value: key,
      label: option.name,
      description: classLabel ?? undefined,
      searchText: `${option.name} ${classLabel ?? ''}`.toLowerCase(),
      normalizedValue: key,
      isMain: option.isMain
    });
  }
  for (const item of lootItemOptions.value) {
    options.push({
      type: 'item',
      value: item.name,
      label: item.name,
      description: item.count === 1 ? '1 award' : `${item.count} awards`,
      searchText: item.searchText,
      normalizedValue: item.searchText
    });
  }
  return options;
});

const filteredSearchOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const selectedCharacterKeys = new Set(selectedCharacters.value);
  const selectedItemSet = new Set(selectedLootItems.value.map((name) => name.toLowerCase()));

  const matches = searchOptions.value.filter((option) => {
    if (option.type === 'character' && selectedCharacterKeys.has(option.value)) {
      return false;
    }
    if (option.type === 'item' && selectedItemSet.has(option.normalizedValue)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return option.searchText.includes(query);
  });

  return matches.slice(0, 8);
});

const showSearchResults = computed(() => {
  const hasMatches = filteredSearchOptions.value.length > 0;
  const shouldShowEmpty = searchQuery.value.trim().length > 0;
  if (searchDropdownSuppressed.value) {
    return false;
  }
  return (searchFocused.value || searchResultsHover.value) && (hasMatches || shouldShowEmpty);
});

watch(filteredSearchOptions, (options) => {
  if (activeSearchIndex.value >= options.length) {
    activeSearchIndex.value = options.length > 0 ? options.length - 1 : -1;
  }
});

watch(searchQuery, () => {
  if (ignoreNextSearchQueryReset.value) {
    ignoreNextSearchQueryReset.value = false;
    return;
  }
  searchDropdownSuppressed.value = false;
  activeSearchIndex.value = -1;
});

function resolveClassLabel(value: CharacterClass | null): string | null {
  if (!value) {
    return null;
  }
  return characterClassLabels[value] ?? value;
}

function resolveGenericClassLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  return (characterClassLabels as Record<string, string>)[upper] ?? value;
}

function characterOptionKey(option: MetricsCharacterOption): string {
  return option.id ? `id:${option.id}` : `name:${option.name.toLowerCase()}`;
}

function classSetHas(value: string): boolean {
  const normalized = normalizeClassValue(value);
  if (!normalized) {
    return false;
  }
  return selectedClassSet.value.has(normalized);
}

const characterKeyLookup = computed(() => {
  const map = new Map<string, MetricsCharacterOption>();
  for (const option of characterOptions.value) {
    map.set(characterOptionKey(option), option);
  }
  return map;
});

function getRecordCharacterKey(record: AttendanceMetricRecord): string {
  return record.character.id
    ? `id:${record.character.id}`
    : `name:${record.character.name.toLowerCase()}`;
}

interface CharacterIdentity {
  id: string | null;
  name: string;
}

function buildCompositeKeysForIdentity(raidId: string, identity: CharacterIdentity): string[] {
  const keys: string[] = [];
  if (identity.id) {
    keys.push(`${raidId}::id:${identity.id}`);
  }
  keys.push(`${raidId}::name:${identity.name.toLowerCase()}`);
  return keys;
}

function recordIdentity(record: AttendanceMetricRecord): CharacterIdentity {
  return {
    id: record.character.id ?? null,
    name: record.character.name
  };
}

const selectedClassSet = computed(() => {
  const set = new Set<string>();
  for (const entry of selectedClasses.value) {
    const normalized = normalizeClassValue(entry);
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
});

watch(selectedClasses, () => {
  const classSet = new Set(selectedClassSet.value);
  if (classSet.size > 0) {
    updateSelectedCharactersFromClasses(classSet);
  }
});

watch(selectedCharacters, () => {
  const classSet = new Set(selectedClassSet.value);
  if (classSet.size > 0) {
    updateSelectedCharactersFromClasses(classSet);
  }
});
const selectedCharacterKeySet = computed(() => new Set(selectedCharacters.value));
const selectedCharacterNameSet = computed(() => {
  const names = new Set<string>();
  const lookup = characterKeyLookup.value;
  for (const key of selectedCharacterKeySet.value) {
    const option = lookup.get(key);
    if (option) {
      names.add(option.name.toLowerCase());
    }
  }
  return names;
});
const selectedLootItemsSet = computed(() => {
  const set = new Set<string>();
  for (const name of selectedLootItems.value) {
    set.add(name.toLowerCase());
  }
  return set;
});

const selectedCharacterChips = computed(() =>
  selectedCharacters.value
    .map((key) => {
      const option = characterKeyLookup.value.get(key);
      if (!option) {
        return null;
      }
      const classLabel = resolveClassLabel(option.class);
      const base = option.name;
      return {
        key,
        label: classLabel ? `${base} (${classLabel})` : base
      };
    })
    .filter((entry): entry is { key: string; label: string } => entry !== null)
);

const selectedLootItemChips = computed(() =>
  selectedLootItems.value.map((name) => ({
    key: name.toLowerCase(),
    label: name
  }))
);

function isPresentStatus(status: AttendanceStatus): boolean {
  return status === 'PRESENT' || status === 'LATE' || status === 'BENCHED';
}

const derivedAttendanceStatuses = computed(() => {
  const lookup = new Map<string, AttendanceStatus>();

  if (!metrics.value) {
    return lookup;
  }

  const recordsByRaid = new Map<string, AttendanceMetricRecord[]>();
  for (const record of metrics.value.attendanceRecords) {
    const existing = recordsByRaid.get(record.raid.id);
    if (existing) {
      existing.push(record);
    } else {
      recordsByRaid.set(record.raid.id, [record]);
    }
  }

  for (const [raidId, records] of recordsByRaid.entries()) {
    const sorted = [...records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const eventTimes = Array.from(new Set(sorted.map((record) => record.timestamp))).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    if (eventTimes.length === 0) {
      continue;
    }
    const eventIndexByTime = new Map<string, number>();
    eventTimes.forEach((time, index) => {
      eventIndexByTime.set(time, index);
    });
    const lastEventIndex = eventTimes.length - 1;

    const presenceByCharacter = new Map<string, Set<number>>();
    const identityByCharacter = new Map<string, CharacterIdentity>();

    for (const record of sorted) {
      const baseKey = getRecordCharacterKey(record);
      identityByCharacter.set(baseKey, recordIdentity(record));
      if (!isPresentStatus(record.status)) {
        continue;
      }
      const eventIndex = eventIndexByTime.get(record.timestamp) ?? 0;
      const set = presenceByCharacter.get(baseKey);
      if (set) {
        set.add(eventIndex);
      } else {
        presenceByCharacter.set(baseKey, new Set([eventIndex]));
      }
    }

    const allCharacterKeys = new Set<string>(sorted.map((record) => getRecordCharacterKey(record)));

    for (const baseKey of allCharacterKeys) {
      const identity = identityByCharacter.get(baseKey) ?? {
        id: null,
        name: baseKey.startsWith('name:') ? baseKey.slice(5) : baseKey
      };
      const presenceSet = presenceByCharacter.get(baseKey);
      const hasPresence = Boolean(presenceSet && presenceSet.size > 0);

      let derived: AttendanceStatus;
      if (!hasPresence) {
        derived = 'ABSENT';
      } else {
        const set = presenceSet!;
        const presentAtFirst = set.has(0);
        const presentAtLast = set.has(lastEventIndex);
        if (!presentAtLast && set.size > 0) {
          derived = 'BENCHED';
        } else if (!presentAtFirst) {
          derived = 'LATE';
        } else {
          derived = 'PRESENT';
        }
      }

      const compositeKeys = buildCompositeKeysForIdentity(raidId, identity);
      for (const key of compositeKeys) {
        lookup.set(key, derived);
      }
    }
  }

  return lookup;
});

function getDerivedStatusForRaid(raidId: string, identity: CharacterIdentity): AttendanceStatus {
  const compositeKeys = buildCompositeKeysForIdentity(raidId, identity);
  for (const key of compositeKeys) {
    const status = derivedAttendanceStatuses.value.get(key);
    if (status) {
      return status;
    }
  }
  return 'ABSENT';
}

function resolveCharacterIdentity(key: string): CharacterIdentity | null {
  const option = characterKeyLookup.value.get(key);
  if (option) {
    return {
      id: option.id ?? null,
      name: option.name
    };
  }
  if (!metrics.value) {
    return null;
  }
  if (key.startsWith('id:')) {
    const id = key.slice(3);
    const record = metrics.value.attendanceRecords.find((entry) => entry.character.id === id);
    if (record) {
      return { id, name: record.character.name };
    }
    return { id, name: id };
  }
  if (key.startsWith('name:')) {
    return { id: null, name: key.slice(5) };
  }
  return { id: null, name: key };
}

function recordMatchesIdentity(record: AttendanceMetricRecord, identity: CharacterIdentity) {
  if (identity.id && record.character.id === identity.id) {
    return true;
  }
  return record.character.name.toLowerCase() === identity.name.toLowerCase();
}

const allRaidIds = computed(() => {
  if (!metrics.value) {
    return [] as string[];
  }
  const ids = new Set<string>();
  for (const record of metrics.value.attendanceRecords) {
    ids.add(record.raid.id);
  }
  for (const event of metrics.value.lootEvents) {
    ids.add(event.raid.id);
  }
  return Array.from(ids);
});

const mainCharacterNames = computed(() => {
  const set = new Set<string>();
  if (!metrics.value) {
    return set;
  }
  for (const record of metrics.value.attendanceRecords) {
    if (record.character.isMain) {
      set.add(record.character.name.toLowerCase());
    }
  }
  for (const option of characterOptions.value) {
    if (option.isMain) {
      set.add(option.name.toLowerCase());
    }
  }
  return set;
});

const lootTotals = computed(() => {
  if (!metrics.value) {
    return { main: 0, all: 0 };
  }
  const mainNames = mainCharacterNames.value;
  let mainCount = 0;
  for (const event of metrics.value.lootEvents) {
    if (mainNames.has(event.looterName.toLowerCase())) {
      mainCount += 1;
    }
  }
  return { main: mainCount, all: metrics.value.lootEvents.length };
});

const totalUniqueAttendanceEvents = computed(() => {
  if (!metrics.value) {
    return 0;
  }
  const events = new Set<string>();
  for (const record of metrics.value.attendanceRecords) {
    events.add(`${record.raid.id}::${record.timestamp}`);
  }
  return events.size;
});

const characterInspectorEntries = computed(() => {
  if (!metrics.value) {
    return [] as Array<{
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
    }>;
  }
  if (selectedCharacters.value.length === 0) {
    return [];
  }

  const raids = allRaidIds.value;
  const totalRaids = raids.length;
  const attendanceRecords = metrics.value.attendanceRecords;
  const totalAttendanceEvents = totalUniqueAttendanceEvents.value;
  const lootEvents = metrics.value.lootEvents;
  const lootTotalsValue = lootTotals.value;
  const lootDenominator =
    lootTotalsValue.main > 0
      ? lootTotalsValue.main
      : lootTotalsValue.all > 0
        ? lootTotalsValue.all
        : 1;

  return selectedCharacters.value
    .map((key) => {
      const identity = resolveCharacterIdentity(key);
      if (!identity) {
        return null;
      }
      const option = characterKeyLookup.value.get(key);
      const label = option?.name ?? identity.name;
      const optionIsMain = option?.isMain ?? false;
      const normalizedIdentityName = identity.name.toLowerCase();
      let characterClass: CharacterClass | null = option?.class ?? null;

      let lateRaids = 0;
      let leftEarlyRaids = 0;
      let absentRaids = 0;

      for (const raidId of raids) {
        const status = getDerivedStatusForRaid(raidId, identity);
        if (status === 'ABSENT') {
          absentRaids += 1;
          continue;
        }
        if (status === 'LATE') {
          lateRaids += 1;
        } else if (status === 'BENCHED') {
          leftEarlyRaids += 1;
        }
      }

      let presentEvents = 0;
      for (const record of attendanceRecords) {
        if (!recordMatchesIdentity(record, identity)) {
          continue;
        }
        if (!characterClass && record.character.class) {
          characterClass = record.character.class;
        }
        if (isPresentStatus(record.status)) {
          presentEvents += 1;
        }
      }

      let lootCount = 0;
      let lastLootTimestamp: string | null = null;
      for (const event of lootEvents) {
        if (event.looterName.toLowerCase() === normalizedIdentityName) {
          if (!characterClass) {
            characterClass = normalizeCharacterClass(event.looterClass);
          }
          lootCount += 1;
          const timestamp = eventPrimaryTimestamp(event);
          if (timestamp && (!lastLootTimestamp || timestamp > lastLootTimestamp)) {
            lastLootTimestamp = timestamp;
          }
        }
      }

      const nameIsMain = mainCharacterNames.value.has(normalizedIdentityName);
      const attendanceIsMain = attendanceRecords.some(
        (record) => record.character.isMain && recordMatchesIdentity(record, identity)
      );
      const isMain = optionIsMain || nameIsMain || attendanceIsMain;

      const lootShareCount = lootCount;
      return {
        key,
        label,
        class: characterClass,
        participationPercent:
          totalAttendanceEvents > 0 ? (presentEvents / totalAttendanceEvents) * 100 : 0,
      lootPercent: (lootShareCount / lootDenominator) * 100,
      lootCount,
      lastLootDate: lastLootTimestamp,
      latePercent: totalRaids > 0 ? (lateRaids / totalRaids) * 100 : 0,
      lateRaidCount: lateRaids,
      leftEarlyPercent: totalRaids > 0 ? (leftEarlyRaids / totalRaids) * 100 : 0,
      leftEarlyRaidCount: leftEarlyRaids,
      absentPercent: totalRaids > 0 ? (absentRaids / totalRaids) * 100 : 0,
      presentEvents,
      totalAttendanceEvents,
      isMain
    };
  })
    .filter(
      (
        entry
      ): entry is {
        key: string;
        label: string;
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
        class: CharacterClass | null;
      } => entry !== null
    );
});

interface AttendanceCharacterSummary {
  key: string;
  name: string;
  class: CharacterClass | null;
  participationPercent: number;
  presentEvents: number;
  lateRaids: number;
  leftEarlyRaids: number;
  absentRaids: number;
  totalAttendanceEvents: number;
  totalRaids: number;
  userDisplayName: string | null;
}

interface LootParticipantSummary {
  name: string;
  class: string | null;
  count: number;
  lastAwarded: string | null;
}

interface LootItemSummary {
  itemName: string;
  count: number;
  lastAwarded: string | null;
}

interface AttendanceTimelineEntry {
  date: string;
  counts: Record<AttendanceStatus, number>;
}

interface LootTimelineEntry {
  date: string;
  total: number;
  uniqueLooters: number;
}

interface TimelineMarker {
  start: string;
  end: string;
  label?: string;
  startLabel: string;
  endLabel: string;
}

const filteredAttendanceRecordsBase = computed<AttendanceMetricRecord[]>(() => {
  if (!metrics.value) {
    return [];
  }
  const classSet = selectedClassSet.value;
  const characterSet = selectedCharacterKeySet.value;
  const lootItemsSet = selectedLootItemsSet.value;
  return metrics.value.attendanceRecords.filter((record) => {
    if (classSet.size > 0) {
      const recordClass = record.character.class ? record.character.class.toUpperCase() : null;
      if (!recordClass || !classSet.has(recordClass)) {
        return false;
      }
    }
    if (characterSet.size > 0) {
      const key = getRecordCharacterKey(record);
      if (!characterSet.has(key)) {
        return false;
      }
    }
    if (lootItemsSet.size > 0) {
      const participatesInSelectedLoot = metrics.value.lootEvents.some((event) => {
        if (!event.itemName) {
          return false;
        }
        if (!lootItemsSet.has(event.itemName.toLowerCase())) {
          return false;
        }
        const normalizedLooter = event.looterName.toLowerCase();
        const recordName = record.character.name.toLowerCase();
        return (
          normalizedLooter === recordName ||
          selectedCharacterNameSet.value.has(normalizedLooter) ||
          (record.character.id && selectedCharacterKeySet.value.has(`id:${record.character.id}`))
        );
      });
      if (!participatesInSelectedLoot) {
        return false;
      }
    }
    return true;
  });
});

const filteredAttendanceRecords = computed<AttendanceMetricRecord[]>(
  () => filteredAttendanceRecordsBase.value
);

const filteredUniqueAttendanceEventsCount = computed(() => {
  const events = new Set<string>();
  for (const record of filteredAttendanceRecords.value) {
    events.add(`${record.raid.id}::${record.timestamp}`);
  }
  return events.size;
});

const filteredRaidIds = computed(() => {
  const ids = new Set<string>();
  for (const record of filteredAttendanceRecords.value) {
    ids.add(record.raid.id);
  }
  return ids;
});

const filteredLootEvents = computed<LootMetricEvent[]>(() => {
  if (!metrics.value) {
    return [];
  }
  const classSet = selectedClassSet.value;
  const lootItemsSet = selectedLootItemsSet.value;
  const characterNameSet = selectedCharacterNameSet.value;
  return metrics.value.lootEvents.filter((event) => {
    if (classSet.size > 0) {
      const eventClass = event.looterClass ? event.looterClass.toUpperCase() : null;
      if (!eventClass || !classSet.has(eventClass)) {
        return false;
      }
    }
    const looterName = event.looterName.toLowerCase();
    if (characterNameSet.size > 0 && !characterNameSet.has(looterName)) {
      return false;
    }
    const itemName = event.itemName.toLowerCase();
    if (lootItemsSet.size > 0 && !lootItemsSet.has(itemName)) {
      return false;
    }
    return true;
  });
});

const attendanceStatusTotals = computed<Record<AttendanceStatus, number>>(() => {
  const totals: Record<AttendanceStatus, number> = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    BENCHED: 0
  };
  for (const entry of attendanceTimelineEntries.value) {
    totals.PRESENT += entry.counts.PRESENT;
    totals.LATE += entry.counts.LATE;
    totals.ABSENT += entry.counts.ABSENT;
    totals.BENCHED += entry.counts.BENCHED;
  }
  return totals;
});

const attendanceTimelineEntries = computed<AttendanceTimelineEntry[]>(() => {
  const map = new Map<string, AttendanceTimelineEntry>();
  const lateTracker = new Set<string>();
  const leftEarlyTracker = new Set<string>();

  for (const record of filteredAttendanceRecords.value) {
    const baseTimestamp = record.timestamp || record.raid.startTime;
    if (!baseTimestamp) {
      continue;
    }
    const dayKey = baseTimestamp.slice(0, 10);
    if (!map.has(dayKey)) {
      map.set(dayKey, {
        date: dayKey,
        counts: {
          PRESENT: 0,
          LATE: 0,
          ABSENT: 0,
          BENCHED: 0
        }
      });
    }
    const entry = map.get(dayKey)!;

    const recordStatus = record.status as AttendanceStatus;
    if (recordStatus in entry.counts) {
      entry.counts[recordStatus] += 1;
    }

    const identity = recordIdentity(record);
    const derivedStatus = getDerivedStatusForRaid(record.raid.id, identity);
    const trackerKey = `${dayKey}::${record.raid.id}::${identity.name.toLowerCase()}`;

    if (derivedStatus === 'LATE' && !lateTracker.has(trackerKey)) {
      lateTracker.add(trackerKey);
      entry.counts.LATE += 1;
    } else if (derivedStatus === 'BENCHED' && !leftEarlyTracker.has(trackerKey)) {
      leftEarlyTracker.add(trackerKey);
      entry.counts.BENCHED += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
});

const attendanceTimelineChartData = computed(() => {
  const entries = attendanceTimelineEntries.value;
  const labels = entries.map((entry) => formatDateLabel(entry.date));
  const datasets = statusOrder.map((status) => ({
    label: statusLabels[status],
    data: entries.map((entry) => entry.counts[status]),
    borderColor: statusColors[status].border,
    backgroundColor: statusColors[status].background,
    fill: true,
    tension: 0.35
  }));
  return { labels, datasets };
});

const attendanceTimelineChartOptions = computed(() => ({
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  }
}));

const attendanceTimelineHasData = computed(
  () =>
    attendanceTimelineChartData.value.datasets.length > 0 &&
    attendanceTimelineChartData.value.datasets.some((dataset) =>
      dataset.data.some((value) => value > 0)
    )
);

function attendanceRateValue(entry: AttendanceCharacterSummary): number {
  return entry.participationPercent;
}

const attendanceByCharacterSummaries = computed<AttendanceCharacterSummary[]>(() => {
  const records = filteredAttendanceRecords.value;
  if (records.length === 0) {
    return [];
  }

  const identityByKey = new Map<string, CharacterIdentity>();
  const map = new Map<string, AttendanceCharacterSummary & { identity: CharacterIdentity }>();

  for (const record of records) {
    const key = getRecordCharacterKey(record);
    const identity = recordIdentity(record);
    identityByKey.set(key, identity);

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: record.character.name,
        class: record.character.class,
        participationPercent: 0,
        presentEvents: 0,
        lateRaids: 0,
        leftEarlyRaids: 0,
        absentRaids: 0,
        totalAttendanceEvents: 0,
        totalRaids: 0,
        userDisplayName: record.character.userDisplayName,
        identity
      });
    }

    const entry = map.get(key)!;
    entry.totalAttendanceEvents += 1;
    if (!entry.class && record.character.class) {
      entry.class = record.character.class;
    }
    if (!entry.userDisplayName && record.character.userDisplayName) {
      entry.userDisplayName = record.character.userDisplayName;
    }
    if (isPresentStatus(record.status)) {
      entry.presentEvents += 1;
    }
  }

  const raidIds = Array.from(filteredRaidIds.value);
  const denominator = filteredUniqueAttendanceEventsCount.value;

  for (const entry of map.values()) {
    let late = 0;
    let leftEarly = 0;
    let absent = 0;
    const identity = identityByKey.get(entry.key) ?? entry.identity;
    for (const raidId of raidIds) {
      const status = getDerivedStatusForRaid(raidId, identity);
      if (status === 'LATE') {
        late += 1;
      } else if (status === 'BENCHED') {
        leftEarly += 1;
      } else if (status === 'ABSENT') {
        absent += 1;
      }
    }
    entry.lateRaids = late;
    entry.leftEarlyRaids = leftEarly;
    entry.absentRaids = absent;
    entry.totalRaids = raidIds.length;

    const denom = denominator > 0 ? denominator : entry.totalAttendanceEvents;
    entry.participationPercent = denom > 0 ? (entry.presentEvents / denom) * 100 : 0;
  }

  const summaries: AttendanceCharacterSummary[] = [];
  for (const entry of map.values()) {
    const { identity: _ignored, ...rest } = entry;
    summaries.push(rest);
  }

  return summaries.sort((a, b) => {
    const diff = attendanceRateValue(b) - attendanceRateValue(a);
    if (diff !== 0) {
      return diff;
    }
    if (b.presentEvents !== a.presentEvents) {
      return b.presentEvents - a.presentEvents;
    }
    return b.totalAttendanceEvents - a.totalAttendanceEvents;
  });
});

const topAttendanceCharacters = computed(() => {
  const limit = maximizedCard.value === 'attendanceByCharacter' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  return attendanceByCharacterSummaries.value.slice(0, limit);
});

const attendanceByCharacterChartData = computed(() => {
  const entries = topAttendanceCharacters.value;
  return {
    labels: entries.map((entry) => entry.name),
    datasets: [
      {
        label: 'Raid Participation (%)',
        data: entries.map((entry) => Number(attendanceRateValue(entry).toFixed(1))),
        backgroundColor: entries.map(() => '#38bdf8'),
        borderRadius: 6
      }
    ]
  };
});

const attendanceByCharacterChartOptions = computed(() => {
  return {
    indexAxis: 'y' as const,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      axis: 'y' as const,
      intersect: true
    },
    hover: {
      mode: 'nearest' as const,
      intersect: true
    },
    animation: {
      duration: 0
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: {
          callback(value: number | string) {
            return `${value}%`;
          }
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context: any) {
            const entries = topAttendanceCharacters.value;
            const index = context.dataIndex as number;
            const entry = entries[index];
            const value =
              typeof context.parsed.x === 'number' ? context.parsed.x : Number(context.parsed);
            if (!entry) {
              return `${value.toFixed(1)}% participation`;
            }
            return [
              `Participation: ${value.toFixed(1)}%`,
              `Present Events: ${entry.presentEvents}`,
              `Late Raids: ${entry.lateRaids}`,
              `Left Early Raids: ${entry.leftEarlyRaids}`,
              `Absent Raids: ${entry.absentRaids}`,
              `Raids Considered: ${entry.totalRaids}`
            ];
          }
        }
      }
    }
  };
});

const attendanceByCharacterHasData = computed(
  () =>
    attendanceByCharacterChartData.value.datasets[0]?.data?.length &&
    attendanceByCharacterChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const attendanceSpotlight = computed(() => {
  if (selectedCharacterKeySet.value.size === 0) {
    return [];
  }
  const filterKeys = selectedCharacterKeySet.value;
  return attendanceByCharacterSummaries.value.filter((entry) => filterKeys.has(entry.key));
});

const lootTimelineEntries = computed<LootTimelineEntry[]>(() => {
  const map = new Map<string, { date: string; total: number; looters: Set<string> }>();
  for (const event of filteredLootEvents.value) {
    const timestamp = eventPrimaryTimestamp(event);
    if (!timestamp) {
      continue;
    }
    const dayKey = timestamp.slice(0, 10);
    if (!map.has(dayKey)) {
      map.set(dayKey, { date: dayKey, total: 0, looters: new Set<string>() });
    }
    const entry = map.get(dayKey)!;
    entry.total += 1;
    entry.looters.add(event.looterName.toLowerCase());
  }
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      total: entry.total,
      uniqueLooters: entry.looters.size
    }));
});

const lootTimelineChartData = computed(() => {
  const entries = lootTimelineEntries.value;
  const labels = entries.map((entry) => formatDateLabel(entry.date));
  return {
    labels,
    datasets: [
      {
        label: 'Loot Items',
        data: entries.map((entry) => entry.total),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.25)',
        fill: true,
        tension: 0.35
      },
      {
        label: 'Unique Looters',
        data: entries.map((entry) => entry.uniqueLooters),
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.2)',
        fill: false,
        tension: 0.35,
        yAxisID: 'y1',
        borderDash: [6, 4]
      }
    ]
  };
});

const lootTimelineChartOptions = computed(() => ({
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    },
    y1: {
      beginAtZero: true,
      position: 'right' as const,
      grid: { drawOnChartArea: false },
      ticks: { precision: 0 }
    }
  }
}));

const lootTimelineHasData = computed(() =>
  lootTimelineChartData.value.datasets.some((dataset) =>
    dataset.data.some((value) => Number(value) > 0)
  )
);

const lootByParticipantSummaries = computed<LootParticipantSummary[]>(() => {
  const map = new Map<string, LootParticipantSummary>();
  for (const event of filteredLootEvents.value) {
    const key = event.looterName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: event.looterName,
        class: event.looterClass ?? null,
        count: 0,
        lastAwarded: null
      });
    }
    const entry = map.get(key)!;
    entry.count += 1;
    const timestamp = eventPrimaryTimestamp(event);
    if (timestamp && (!entry.lastAwarded || timestamp > entry.lastAwarded)) {
      entry.lastAwarded = timestamp;
    }
    if (!entry.class && event.looterClass) {
      entry.class = event.looterClass;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
});

const topLootParticipants = computed(() => {
  const limit = maximizedCard.value === 'lootByParticipant' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  return lootByParticipantSummaries.value.slice(0, limit);
});

const lootByParticipantChartData = computed(() => {
  const entries = topLootParticipants.value;
  return {
    labels: entries.map((entry) => entry.name),
    datasets: [
      {
        label: 'Items Awarded',
        data: entries.map((entry) => entry.count),
        backgroundColor: entries.map(() => '#c084fc'),
        borderRadius: 6
      }
    ]
  };
});

const lootByParticipantChartOptions = computed(() => ({
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  },
  plugins: {
    legend: { display: false }
  }
}));

const lootByParticipantHasData = computed(
  () =>
    lootByParticipantChartData.value.datasets[0]?.data?.length &&
    lootByParticipantChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const lootByItemSummaries = computed<LootItemSummary[]>(() => {
  const map = new Map<string, LootItemSummary>();
  for (const event of filteredLootEvents.value) {
    const key = event.itemName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { itemName: event.itemName, count: 0, lastAwarded: null });
    }
    const entry = map.get(key)!;
    entry.count += 1;
    const timestamp = eventPrimaryTimestamp(event);
    if (timestamp && (!entry.lastAwarded || timestamp > entry.lastAwarded)) {
      entry.lastAwarded = timestamp;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
});

const topLootItems = computed(() => {
  const limit = maximizedCard.value === 'lootByItem' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  return lootByItemSummaries.value.slice(0, limit);
});

const lootByItemChartData = computed(() => {
  const entries = topLootItems.value;
  return {
    labels: entries.map((entry) => entry.itemName),
    datasets: [
      {
        label: 'Awards',
        data: entries.map((entry) => entry.count),
        backgroundColor: entries.map(() => '#f97316'),
        borderRadius: 6
      }
    ]
  };
});

const lootByItemChartOptions = computed(() => ({
  indexAxis: 'y' as const,
  maintainAspectRatio: false,
  interaction: {
    mode: 'nearest' as const,
    axis: 'y' as const,
    intersect: true
  },
  hover: {
    mode: 'nearest' as const,
    intersect: true
  },
  animation: {
    duration: 0
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: any) {
          const index = context.dataIndex as number;
          const entries = topLootItems.value;
          const entry = entries[index];
          const value =
            typeof context.parsed.x === 'number' ? context.parsed.x : Number(context.parsed);
          if (!entry) {
            return `${value} awards`;
          }
          const details = [`Awards: ${value}`];
          if (entry.lastAwarded) {
            details.push(`Last Award: ${formatDateLong(entry.lastAwarded)}`);
          }
          return details;
        }
      }
    }
  }
}));

const lootByItemHasData = computed(
  () =>
    lootByItemChartData.value.datasets[0]?.data?.length &&
    lootByItemChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const lootSpotlightCharacters = computed(() => {
  if (selectedCharacterNameSet.value.size === 0) {
    return [] as LootParticipantSummary[];
  }
  return lootByParticipantSummaries.value.filter((entry) =>
    selectedCharacterNameSet.value.has(entry.name.toLowerCase())
  );
});

const lootSpotlightItems = computed(() => {
  if (selectedLootItemsSet.value.size === 0) {
    return [] as LootItemSummary[];
  }
  return lootByItemSummaries.value.filter((entry) =>
    selectedLootItemsSet.value.has(entry.itemName.toLowerCase())
  );
});

const recentLootEvents = computed(() => {
  const sorted = [...filteredLootEvents.value].sort((a, b) => {
    const aStamp = eventPrimaryTimestamp(a);
    const bStamp = eventPrimaryTimestamp(b);
    return (bStamp ?? '').localeCompare(aStamp ?? '');
  });
  return sorted.slice(0, 8);
});

const summaryCards = computed(() => {
  const summary = globalSummary.value ?? metrics.value?.summary;
  if (!summary) {
    return [] as Array<{ label: string; value: number }>;
  }

  return [
    { label: 'Attendance Records', value: summary.attendanceRecords },
    { label: 'Unique Attendees', value: summary.uniqueAttendanceCharacters },
    { label: 'Loot Events', value: summary.lootEvents },
    { label: 'Unique Looters', value: summary.uniqueLooters },
    { label: 'Raids Covered', value: summary.raidsTracked }
  ];
});

const activeRangeLabel = computed(() =>
  metrics.value
    ? `${formatRangeDate(metrics.value.range.start)} – ${formatRangeDate(metrics.value.range.end)}`
    : 'selected period'
);

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return `${clamped.toFixed(1)}%`;
}

function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRangeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function eventPrimaryTimestamp(event: LootMetricEvent): string {
  return event.timestamp || event.createdAt;
}

function attendanceRate(entry: AttendanceCharacterSummary): number {
  return entry.participationPercent;
}

const timelineBounds = computed(() => {
  const now = new Date();

  if (globalTimeline.value) {
    const minMs = globalTimeline.value.minMs;
    return {
      min: new Date(minMs).toISOString(),
      max: now.toISOString()
    };
  }

  if (!metrics.value) {
    return null;
  }

  let minMs = Number.POSITIVE_INFINITY;
  const updateBounds = (iso?: string | null, floor = false) => {
    if (!iso) {
      return;
    }
    const value = floor ? startOfDayLocalIso(iso) : iso;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      return;
    }
    minMs = Math.min(minMs, ms);
  };

  updateBounds(metrics.value.range.start, true);
  for (const record of metrics.value.attendanceRecords) {
    updateBounds(record.timestamp);
    updateBounds(record.raid.startTime);
  }

  for (const event of metrics.value.lootEvents) {
    updateBounds(eventPrimaryTimestamp(event));
  }

  if (!Number.isFinite(minMs)) {
    minMs = Date.parse(metrics.value.range.start);
  }
  if (!Number.isFinite(minMs)) {
    minMs = Date.now();
  }

  return {
    min: new Date(minMs).toISOString(),
    max: now.toISOString()
  };
});

const currentRangeIso = computed(() => {
  const bounds = timelineBounds.value;
  const now = new Date();
  const fallbackStart = bounds?.min ?? startOfDayUtcIso(now.toISOString());
  const fallbackEnd = bounds?.max ?? now.toISOString();

  const startMs = Date.parse(rangeForm.start);
  const endMs = Date.parse(rangeForm.end);

  const startIso = Number.isNaN(startMs)
    ? fallbackStart
    : new Date(startMs).toISOString();
  const endIso = Number.isNaN(endMs)
    ? fallbackEnd
    : new Date(endMs).toISOString();

  return { start: startIso, end: endIso };
});

const timelineSelectionLabel = computed(() => {
  const startLabel = formatTimelineDisplay(currentRangeIso.value.start);
  const endLabel = formatTimelineDisplay(currentRangeIso.value.end);
  if (startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel} — ${endLabel}`;
});

const timelineEventDates = computed<
  Array<{ start: string; end: string; label?: string; startLabel: string; endLabel: string }>
>(() => {
  const nowMs = Date.now();
  const markerMap = globalTimeline.value?.markers;

  if (markerMap && markerMap.size > 0) {
    return Array.from(markerMap.values())
      .map((marker) => {
        const startMs = parseIsoToMs(marker.start);
        const endMs = parseIsoToMs(marker.end);
        if (startMs === null || endMs === null || endMs > nowMs || endMs <= startMs) {
          return null;
        }
        return {
          start: marker.start,
          end: marker.end,
          label: marker.label,
          startLabel: marker.startLabel,
          endLabel: marker.endLabel,
          startMs,
          endMs
        };
      })
      .filter(
        (
          entry
        ): entry is {
          start: string;
          end: string;
          label?: string;
          startLabel: string;
          endLabel: string;
          startMs: number;
          endMs: number;
        } =>
          entry !== null
      )
      .sort((a, b) => a.startMs - b.startMs)
      .map(({ start, end, label, startLabel, endLabel }) => ({
        start,
        end,
        label,
        startLabel,
        endLabel
      }));
  }

  if (!metrics.value) {
    return [];
  }

  const raidBounds = new Map<
    string,
    { startMs: number; endMs: number | null; start: string; end: string | null; label?: string }
  >();

  const records = metrics.value.attendanceRecords.slice().sort((a, b) => {
    const aMs = parseIsoToMs(a.timestamp) ?? 0;
    const bMs = parseIsoToMs(b.timestamp) ?? 0;
    return aMs - bMs;
  });

  for (const record of records) {
    const raidId = record.raid.id ?? `raid-${record.raid.name ?? 'unknown'}`;
    const timestampMs = parseIsoToMs(record.timestamp);
    if (timestampMs === null) {
      continue;
    }

    let bounds = raidBounds.get(raidId);
    if (!bounds) {
      const startIso = record.raid.startTime ?? record.timestamp;
      const startMs = parseIsoToMs(startIso) ?? timestampMs;
      bounds = {
        startMs,
        endMs: null,
        start: new Date(startMs).toISOString(),
        end: null,
        label: record.raid.name ?? `Raid ${raidId}`
      };
      raidBounds.set(raidId, bounds);
    } else if (timestampMs < bounds.startMs) {
      bounds.startMs = timestampMs;
      bounds.start = new Date(timestampMs).toISOString();
    }

    if (record.eventType === 'END') {
      bounds.endMs = timestampMs;
      bounds.end = record.timestamp;
    }
  }

  return Array.from(raidBounds.values())
    .filter((entry) => entry.endMs !== null && entry.endMs <= nowMs && entry.endMs > entry.startMs)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
    .map((entry) => ({
      start: entry.start,
      end: entry.end!,
      label: entry.label,
      startLabel: formatDateLong(entry.start),
      endLabel: formatDateLong(entry.end!)
    }));
});

function createTimelineMarker(startIso: string, endIso: string, label?: string): TimelineMarker {
  return {
    start: startIso,
    end: endIso,
    label,
    startLabel: formatDateLong(startIso),
    endLabel: formatDateLong(endIso)
  };
}

function syncFiltersWithOptions(): void {
  if (!metrics.value) {
    return;
  }
  const classSet = new Set(classIconOptions.value.map((entry) => entry.value));
  selectedClasses.value = selectedClasses.value
    .map((entry) => normalizeClassValue(entry))
    .filter((entry): entry is string => Boolean(entry && classSet.has(entry)));
  const normalizedClassSet = new Set(selectedClasses.value.map((entry) => normalizeClassValue(entry)).filter((entry): entry is string => Boolean(entry)));

  if (normalizedClassSet.size > 0) {
    updateSelectedCharactersFromClasses(normalizedClassSet);
  }

  const characterKeys = new Set(characterOptions.value.map((option) => characterOptionKey(option)));
  selectedCharacters.value = selectedCharacters.value.filter((key) => characterKeys.has(key));

  const lootItemSet = new Set(lootItemOptions.value.map((option) => option.name));
  selectedLootItems.value = selectedLootItems.value.filter((name) => lootItemSet.has(name));
}

async function loadMetrics(params?: GuildMetricsQuery) {
  if (!guildId.value) {
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const result = await api.fetchGuildMetrics(guildId.value, params);
    metrics.value = result;
    updateGlobalTimeline(result);
    rangeForm.start = result.range.start;
    rangeForm.end = result.range.end;
    if (!params) {
      const bounds = timelineBounds.value;
      const minIso = bounds?.min ?? result.range.start;
      const maxIso = bounds?.max ?? new Date().toISOString();
      rangeForm.start = minIso;
      rangeForm.end = maxIso;
    }
    if (!globalSummary.value) {
      globalSummary.value = { ...result.summary };
    }
    lastSubmittedQuery.value = params ? { ...params } : undefined;
    syncFiltersWithOptions();
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : 'Unable to load metrics. Please try again.';
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  selectedClasses.value = [];
  selectedCharacters.value = [];
  selectedLootItems.value = [];
  searchQuery.value = '';
}

function reloadMetrics() {
  void loadMetrics(lastSubmittedQuery.value);
}

function toggleClass(value: string) {
  const canonical = normalizeClassValue(value);
  if (!canonical) {
    return;
  }
  const existing = new Set(selectedClassSet.value);
  if (existing.has(canonical)) {
    existing.delete(canonical);
  } else {
    existing.add(canonical);
  }
  selectedClasses.value = Array.from(existing);
  updateSelectedCharactersFromClasses(existing);
}

function updateSelectedCharactersFromClasses(classSet: Set<string>) {
  if (classSet.size === 0) {
    if (selectedClasses.value.length === 0 && selectedCharacters.value.length > 0) {
      selectedCharacters.value = [];
    }
    return;
  }
  const matchingKeys: string[] = [];
  for (const option of characterOptions.value) {
    const optionClass = option.class ? option.class.toUpperCase() : null;
    if (optionClass && classSet.has(optionClass)) {
      matchingKeys.push(characterOptionKey(option));
    }
  }
  const retained = selectedCharacters.value.filter((key) => {
    const option = characterKeyLookup.value.get(key);
    if (!option) {
      return false;
    }
    const optionClass = option.class ? option.class.toUpperCase() : null;
    return optionClass !== null && classSet.has(optionClass);
  });
  const additions = matchingKeys.filter((key) => !retained.includes(key));
  const nextSelection = [...retained, ...additions];
  const current = selectedCharacters.value;
  if (
    nextSelection.length === current.length &&
    nextSelection.every((value, index) => value === current[index])
  ) {
    return;
  }
  selectedCharacters.value = nextSelection;
}

function handleTimelinePreview(range: { start: string; end: string }) {
  rangeForm.start = range.start;
  rangeForm.end = range.end;
}

function handleTimelineCommit(range: { start: string; end: string }) {
  const startMs = Date.parse(range.start);
  const endMs = Date.parse(range.end);
  const startIso = Number.isNaN(startMs) ? range.start : new Date(startMs).toISOString();
  const endIso = Number.isNaN(endMs) ? range.end : new Date(endMs).toISOString();
  rangeForm.start = startIso;
  rangeForm.end = endIso;
  const query: GuildMetricsQuery = {
    startDate: startIso,
    endDate: endIso
  };
  if (
    lastSubmittedQuery.value &&
    lastSubmittedQuery.value.startDate === query.startDate &&
    lastSubmittedQuery.value.endDate === query.endDate
  ) {
    handleTimelinePreview(range);
    return;
  }
  lastSubmittedQuery.value = { ...query };
  void loadMetrics(query);
}

function updateGlobalTimeline(result: GuildMetrics) {
  const previous = globalTimeline.value;
  const markers = new Map<string, TimelineMarker>(previous?.markers ?? []);
  const nowMs = Date.now();

  for (const [key, marker] of Array.from(markers.entries())) {
    const startMs = parseIsoToMs(marker.start);
    const endMs = parseIsoToMs(marker.end);
    if (startMs === null || endMs === null || endMs <= startMs) {
      markers.delete(key);
      continue;
    }
    if (!marker.startLabel || !marker.endLabel) {
      markers.set(key, {
        ...marker,
        startLabel: marker.startLabel ?? formatDateLong(marker.start),
        endLabel: marker.endLabel ?? formatDateLong(marker.end)
      });
    }
  }

  const considerMinFallbacks = (iso?: string | null, floor = false) => {
    const ms = parseIsoToMs(iso, floor);
    if (ms !== null) {
      fallbackMinMs = Math.min(fallbackMinMs, ms);
    }
  };

  let fallbackMinMs = previous?.minMs ?? Number.POSITIVE_INFINITY;
  const earliestExistingMarkerStart = Array.from(markers.values()).reduce<number | null>(
    (acc, marker) => {
      const ms = parseIsoToMs(marker.start);
      if (ms === null) {
        return acc;
      }
      if (acc === null || ms < acc) {
        return ms;
      }
      return acc;
    },
    null
  );
  if (earliestExistingMarkerStart !== null) {
    fallbackMinMs = Math.min(fallbackMinMs, earliestExistingMarkerStart);
  }
  const raidStartInfo = new Map<
    string,
    { ms: number; iso: string }
  >();

  for (const record of result.attendanceRecords) {
    const raidId = record.raid.id ?? `raid-${record.raid.name ?? 'unknown'}`;

    considerMinFallbacks(record.timestamp);
    considerMinFallbacks(record.raid.startTime);

    const candidateStarts = [record.raid.startTime, record.timestamp];
    for (const candidate of candidateStarts) {
      const ms = parseIsoToMs(candidate);
      if (ms === null) {
        continue;
      }
      const existing = raidStartInfo.get(raidId);
      if (!existing || ms < existing.ms) {
        raidStartInfo.set(raidId, { ms, iso: new Date(ms).toISOString() });
      }
    }

    if (record.eventType !== 'END' || !record.timestamp) {
      continue;
    }

    const endMs = parseIsoToMs(record.timestamp);
    if (endMs === null || endMs > nowMs) {
      continue;
    }

    const startInfo = raidStartInfo.get(raidId);
    let startMs = startInfo?.ms ?? endMs;
    const fallbackStartIso = startInfo?.iso ?? record.raid.startTime ?? record.timestamp;
    const parsedStartMs = parseIsoToMs(fallbackStartIso);
    if (parsedStartMs !== null) {
      startMs = parsedStartMs;
    }

    if (startMs > endMs) {
      startMs = endMs;
    }

    const label = record.raid.name ?? (record.raid.id ? `Raid ${record.raid.id}` : undefined);
    const existing = markers.get(raidId);

    const existingStartMs = existing ? parseIsoToMs(existing.start) ?? startMs : startMs;
    const existingEndMs = existing ? parseIsoToMs(existing.end) ?? endMs : endMs;
    const mergedStartMs = Math.min(existingStartMs, startMs);
    const mergedEndMs = Math.max(existingEndMs, endMs);
    const finalStartIso = new Date(mergedStartMs).toISOString();
    const finalEndIso = new Date(mergedEndMs).toISOString();
    const finalLabel = label ?? existing?.label;

    markers.set(raidId, createTimelineMarker(finalStartIso, finalEndIso, finalLabel));
  }

  for (const event of result.lootEvents) {
    considerMinFallbacks(eventPrimaryTimestamp(event));
  }

  considerMinFallbacks(result.earliestRaidDate, true);
  considerMinFallbacks(result.range.start);
  considerMinFallbacks(result.range.end);

  let minMs: number;
  const earliestMarker = Array.from(markers.values()).reduce<number | null>((acc, marker) => {
    const ms = parseIsoToMs(marker.start);
    if (ms === null) {
      return acc;
    }
    if (acc === null || ms < acc) {
      return ms;
    }
    return acc;
  }, null);

  if (earliestMarker !== null) {
    minMs = startOfDayLocalMs(earliestMarker);
  } else if (Number.isFinite(fallbackMinMs)) {
    minMs = startOfDayLocalMs(fallbackMinMs);
  } else {
    const fallback = parseIsoToMs(result.range.start) ?? Date.now();
    minMs = startOfDayLocalMs(fallback);
  }

  globalTimeline.value = {
    minMs,
    markers
  };
}

function handleSearchFocus() {
  searchFocused.value = true;
  searchDropdownSuppressed.value = false;
}

function handleSearchBlur() {
  searchFocused.value = false;
  setTimeout(() => {
    if (!searchResultsHover.value) {
      searchResultsHover.value = false;
    }
  }, 120);
}

function handleSearchResultsHover(state: boolean) {
  searchResultsHover.value = state;
  if (state) {
    searchDropdownSuppressed.value = false;
  } else if (!searchFocused.value) {
    activeSearchIndex.value = -1;
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  const options = filteredSearchOptions.value;
  const hasOptions = options.length > 0;
  const dropdownVisible = showSearchResults.value;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!hasOptions) {
      return;
    }
    event.preventDefault();
    searchDropdownSuppressed.value = false;
    const increment = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = normalizeSearchIndex(activeSearchIndex.value + increment, options.length);
    activeSearchIndex.value = nextIndex;
    scrollActiveSearchOptionIntoView();
    return;
  }
  if (event.key === 'Tab' && hasOptions) {
    if (!dropdownVisible) {
      return;
    }
    event.preventDefault();
    searchDropdownSuppressed.value = false;
    const increment = event.shiftKey ? -1 : 1;
    const nextIndex = normalizeSearchIndex(activeSearchIndex.value + increment, options.length);
    activeSearchIndex.value = nextIndex;
    scrollActiveSearchOptionIntoView();
    return;
  }
  if (event.key === 'Enter') {
    if (!hasOptions) {
      return;
    }
    event.preventDefault();
    const index = activeSearchIndex.value >= 0 ? activeSearchIndex.value : 0;
    const option = options[index];
    if (option) {
      handleSearchSelect(option);
    }
    return;
  }
  if (event.key === 'Escape') {
    searchDropdownSuppressed.value = true;
    activeSearchIndex.value = -1;
  }
}

function normalizeSearchIndex(index: number, length: number): number {
  if (length === 0) {
    return -1;
  }
  if (index < 0) {
    return length - 1;
  }
  if (index >= length) {
    return 0;
  }
  return index;
}

function setActiveSearchOption(option: SearchOptionEntry) {
  const options = filteredSearchOptions.value;
  const index = options.findIndex((entry) => entry === option);
  activeSearchIndex.value = index;
  searchDropdownSuppressed.value = false;
  scrollActiveSearchOptionIntoView();
}

function isSearchOptionActive(option: SearchOptionEntry): boolean {
  const options = filteredSearchOptions.value;
  const index = options.findIndex((entry) => entry === option);
  return index === activeSearchIndex.value;
}

function scrollActiveSearchOptionIntoView() {
  nextTick(() => {
    const list = searchResultsRef.value;
    if (!list) {
      return;
    }
    const items = list.querySelectorAll<HTMLLIElement>('.metrics-search__result');
    const index = activeSearchIndex.value;
    if (index < 0 || index >= items.length) {
      return;
    }
    const element = items[index];
    element.scrollIntoView({ block: 'nearest' });
  });
}

function handleSearchSelect(option: SearchOptionEntry) {
  if (option.type === 'character') {
    if (!selectedCharacterKeySet.value.has(option.value)) {
      selectedCharacters.value = [...selectedCharacters.value, option.value];
    }
  } else {
    if (!selectedLootItemsSet.value.has(option.normalizedValue)) {
      selectedLootItems.value = [...selectedLootItems.value, option.value];
    }
  }
  ignoreNextSearchQueryReset.value = true;
  searchQuery.value = '';
  nextTick(() => {
    searchInputRef.value?.focus();
  });
  activeSearchIndex.value = -1;
  searchDropdownSuppressed.value = true;
  searchResultsHover.value = false;
}

function removeCharacterSelection(key: string) {
  const target = key.toLowerCase();
  selectedCharacters.value = selectedCharacters.value.filter((entry) => {
    if (entry.toLowerCase() === target) {
      return false;
    }
    const option = characterKeyLookup.value.get(entry);
    if (option && option.name && option.name.toLowerCase() === target.replace(/^search:/, '')) {
      return false;
    }
    return true;
  });

  const option = characterKeyLookup.value.get(key);
  const optionClass = option?.class ? option.class.toUpperCase() : null;
  if (optionClass && selectedClassSet.value.has(optionClass)) {
    selectedClasses.value = selectedClasses.value.filter((entry) => entry.toUpperCase() !== optionClass);
  }
}

function removeItemSelection(name: string) {
  selectedLootItems.value = selectedLootItems.value.filter((entry) => entry !== name);
}

function handleInspectorReset() {
  if (selectedCharacters.value.length === 0) {
    return;
  }
  selectedCharacters.value = [];
  if (selectedClasses.value.length > 0) {
    selectedClasses.value = [];
  }
  if (selectedLootItems.value.length > 0) {
    selectedLootItems.value = [];
  }
  searchQuery.value = '';
  activeSearchIndex.value = -1;
  searchDropdownSuppressed.value = true;
  searchResultsHover.value = false;
}

function handleInspectorReorder(newOrder: string[]) {
  if (newOrder.length !== selectedCharacters.value.length) {
    return;
  }
  const currentKeys = new Set(selectedCharacters.value);
  for (const key of newOrder) {
    if (!currentKeys.has(key)) {
      return;
    }
  }
  selectedCharacters.value = [...newOrder];
}

watch(
  () => guildId.value,
  (next, prev) => {
    if (next && next !== prev) {
      resetFilters();
      lastSubmittedQuery.value = undefined;
      globalSummary.value = null;
      void loadMetrics();
    }
  }
);

onMounted(() => {
  if (guildId.value) {
    void loadMetrics();
  }
});
</script>

<style scoped>
.metrics-view {
  padding: 2rem 0 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.metrics-content {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.metrics-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-header h1 {
  margin: 0;
  font-size: 2rem;
}

.metrics-back {
  align-self: flex-start;
}

.metrics-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.timeline-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.85rem;
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);
  margin-bottom: 1.25rem;
}

.timeline-summary__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.75);
}

.timeline-summary__value {
  font-weight: 600;
}

.metrics-summary__item {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(14, 165, 233, 0.08));
  border-radius: 0.85rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.metrics-summary__label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5f5;
}

.metrics-summary__value {
  font-size: 1.85rem;
  font-weight: 600;
}

.metrics-filters {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: stretch;
}

.metrics-search-container {
  width: 100%;
}

.metrics-search {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-width: 560px;
  margin: 0 auto;
}

.metrics-inspector {
  width: 100%;
  display: flex;
  justify-content: center;
}

.metrics-inspector > * {
  width: 100%;
}

.metrics-search__input-wrapper {
  position: relative;
}

.metrics-search__input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.65rem;
  padding: 0.55rem 0.8rem;
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.metrics-search__input:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.65);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.15);
}

.metrics-search__results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  max-height: 14rem;
  overflow-y: auto;
  list-style: none;
  padding: 0.35rem 0;
  z-index: 5;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.45);
}

.metrics-search__result {
  padding: 0.55rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.metrics-search__result:hover {
  background: rgba(59, 130, 246, 0.2);
}

.metrics-search__result--active,
.metrics-search__result--active:hover {
  background: rgba(59, 130, 246, 0.3);
}

.metrics-search__result-primary {
  font-weight: 600;
}

.metrics-search__result-secondary {
  font-size: 0.8rem;
  color: #94a3b8;
}

.metrics-search__result--empty {
  color: #94a3b8;
  cursor: default;
}

.metrics-search__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.metrics-search__chips--items {
  margin-top: -0.2rem;
}

.metrics-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.35);
  font-size: 0.85rem;
}

.metrics-chip--item {
  background: rgba(249, 115, 22, 0.18);
  border-color: rgba(249, 115, 22, 0.35);
}

.metrics-chip__remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
  line-height: 1;
}

.metrics-chip__remove:hover {
  color: #fca5a5;
}

.metrics-class-toggle {
  display: grid;
  gap: 0.65rem;
}

.metrics-class-toggle--grid {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}

.metrics-class-toggle__button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.65rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
  cursor: pointer;
  min-width: 72px;
  transition:
    transform 0.15s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.metrics-class-toggle__button:hover,
.metrics-class-toggle__button:focus-visible {
  border-color: rgba(96, 165, 250, 0.55);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.4);
}

.metrics-class-toggle__button--active {
  border-color: rgba(59, 130, 246, 0.85);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(14, 165, 233, 0.18));
  box-shadow: 0 10px 22px rgba(30, 64, 175, 0.32);
}

.metrics-class-toggle__button--inactive {
  opacity: 0.6;
  border-color: rgba(148, 163, 184, 0.1);
}

.metrics-class-toggle__button--inactive:hover,
.metrics-class-toggle__button--inactive:focus-visible {
  opacity: 0.75;
  border-color: rgba(99, 102, 241, 0.4);
}

.metrics-class-toggle__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  overflow: hidden;
}

.metrics-class-toggle__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.metrics-class-toggle__icon span {
  font-size: 0.85rem;
  font-weight: 600;
}

.metrics-class-toggle__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5f5;
}

@media (max-width: 960px) {
  .metrics-class-toggle--grid {
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  }
}

.metrics-section {
  display: flex;
  flex-direction: column;
  gap: 1.3rem;
}

.metrics-section__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.metrics-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 260px;
}

.metrics-class-card {
  min-height: auto;
  gap: 1.25rem;
}

.metrics-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.metrics-card__header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.metrics-card__header--with-actions {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.metrics-card__hint {
  margin: 0;
  color: #94a3b8;
}

.metrics-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
  color: rgba(226, 232, 240, 0.85);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.metrics-card__action:hover,
.metrics-card__action:focus-visible {
  border-color: rgba(96, 165, 250, 0.85);
  background: rgba(30, 64, 175, 0.65);
  transform: scale(1.05);
}

.metrics-card__action svg {
  width: 1.1rem;
  height: 1.1rem;
}

.metrics-card__chart {
  flex: 1;
  min-height: 220px;
  position: relative;
}

.metrics-card__chart canvas {
  width: 100% !important;
  height: 100% !important;
}

.metrics-card-grid--maximized {
  display: block;
}

.metrics-card--maximized {
  grid-column: 1 / -1;
  width: 100%;
  min-height: min(85vh, 960px);
  display: flex;
  flex-direction: column;
}

.metrics-card--maximized .metrics-card__chart {
  flex: 1;
  min-height: unset;
}

.metrics-card--maximized .metrics-card__chart canvas {
  height: 100% !important;
}

.metrics-card__empty {
  margin: 0;
  text-align: center;
  padding: 2rem 0;
}

.metrics-status-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.metrics-status-summary__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.metrics-status-summary__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.metrics-status-summary__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-flex;
  background: rgba(148, 163, 184, 0.45);
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12);
}

.metrics-status-summary__item[data-status='PRESENT'] .metrics-status-summary__dot {
  background: rgba(34, 197, 94, 0.8);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
}

.metrics-status-summary__item[data-status='LATE'] .metrics-status-summary__dot {
  background: rgba(249, 115, 22, 0.8);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.25);
}

.metrics-status-summary__item[data-status='ABSENT'] .metrics-status-summary__dot {
  background: rgba(239, 68, 68, 0.8);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
}

.metrics-status-summary__item[data-status='BENCHED'] .metrics-status-summary__dot {
  background: rgba(168, 85, 247, 0.8);
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.25);
}

.metrics-status-summary__value {
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metrics-spotlight {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 1rem;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metrics-spotlight__subtitle {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
}

.metrics-spotlight__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.metrics-spotlight__item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  padding-bottom: 0.75rem;
}

.metrics-spotlight__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.metrics-spotlight__stats {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.9rem;
  color: #cbd5f5;
}

.metrics-spotlight__name {
  font-weight: 600;
  font-size: 1rem;
}

.metrics-recent {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.metrics-recent__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.1rem;
}

.metrics-recent__card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(135deg, rgba(13, 23, 42, 0.82), rgba(7, 89, 133, 0.45));
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 1.1rem;
  padding: 1.15rem 1.3rem;
  box-shadow: 0 18px 36px rgba(13, 23, 42, 0.38);
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.metrics-recent__card:hover,
.metrics-recent__card:focus-visible {
  transform: translateY(-3px);
  border-color: rgba(56, 189, 248, 0.45);
  background: linear-gradient(135deg, rgba(7, 89, 133, 0.58), rgba(14, 165, 233, 0.4));
}

.metrics-recent__header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.metrics-recent__item-icon {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.85rem;
  background: rgba(56, 189, 248, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
}

.metrics-recent__item-title {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metrics-recent__item-title strong {
  font-size: 1.05rem;
  color: #f8fafc;
}

.metrics-recent__raid {
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.metrics-recent__time {
  margin-left: auto;
}

.metrics-recent__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.metrics-recent__looter {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metrics-recent__looter-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.62rem;
  color: rgba(148, 163, 184, 0.75);
}

.metrics-recent__looter-name {
  font-weight: 600;
  font-size: 0.98rem;
}

.metrics-recent__emoji {
  font-size: 1.35rem;
  filter: drop-shadow(0 8px 14px rgba(14, 116, 144, 0.4));
}

.metrics-inline-error {
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(248, 113, 113, 0.32);
  border-radius: 0.85rem;
  padding: 0.75rem 1rem;
  color: #fecaca;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-inline-error p {
  margin: 0;
}

.metrics-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 0;
  color: #cbd5f5;
}

.metrics-state--error {
  color: #fca5a5;
}

.metrics-state button {
  align-self: center;
}

@media (max-width: 640px) {
  .metrics-filter__select {
    min-height: 6rem;
  }

  .metrics-card {
    min-height: 240px;
  }

  .metrics-card__chart {
    min-height: 200px;
  }
}
</style>
