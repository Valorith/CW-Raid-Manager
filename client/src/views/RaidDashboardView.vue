<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
      </div>
      <button
        v-if="canCreateRaid && selectedGuildId"
        class="btn"
        @click="() => openRaidModal()"
      >
        New Raid
      </button>
    </header>

    <div v-if="selectedGuildId">
      <p v-if="loadingRaids" class="muted">Loading raids…</p>

      <div v-else>
        <div class="tabs">
          <button
            :class="['tab', { 'tab--active': activeTab === 'active' }]"
            type="button"
            @click="activeTab = 'active'"
          >
            Active
          </button>
          <button
            :class="['tab', { 'tab--active': activeTab === 'history' }]"
            type="button"
            @click="activeTab = 'history'"
          >
            History
          </button>
        </div>
        <div v-if="activeTab === 'active'" class="calendar-view" ref="calendarViewRef">
          <div class="calendar-toolbar">
            <div class="calendar-toolbar__main">
              <div>
                <p class="calendar-toolbar__eyebrow">Raid Schedule</p>
                <h2>{{ calendarMonthLabel }}</h2>
              </div>
            </div>
            <div class="calendar-toolbar__actions">
              <button class="calendar-nav-btn" type="button" @click="goToPreviousMonth">
                ‹
              </button>
              <button class="calendar-nav-btn calendar-nav-btn--today" type="button" @click="goToCurrentMonth">
                Today
              </button>
              <button class="calendar-nav-btn" type="button" @click="goToNextMonth">
                ›
              </button>
            </div>
          </div>
          <p class="calendar-subtitle">
            Showing every raid scheduled for {{ calendarMonthDescription }}
          </p>
          <p v-if="!monthHasRaids && !loadingRaids" class="muted calendar-empty-hint">
            No raids scheduled this month yet. Right-click a day to add one.
          </p>
          <div class="raid-calendar">
            <div class="raid-calendar__weekday-row raid-calendar--desktop">
              <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
            </div>
            <div class="raid-calendar__grid raid-calendar--desktop">
              <article
                v-for="day in calendarDays"
                :key="day.key"
              :class="[
                'raid-calendar__day',
                {
                  'raid-calendar__day--muted': !day.isCurrentMonth,
                  'raid-calendar__day--today': day.isToday
                }
              ]"
              @contextmenu.prevent.stop="handleCalendarDayContextMenu(day, $event)"
            >
                <header class="raid-calendar__day-header">
                  <span>{{ day.date.getDate() }}</span>
                  <span v-if="day.isToday" class="raid-calendar__today-pill">Today</span>
                </header>
                <div class="raid-calendar__events">
                  <div
                    v-for="raid in day.raids"
                    :key="raid.id"
                    class="raid-calendar-event"
                    :class="{ 'raid-calendar-event--active': raid.startedAt && !raid.endedAt }"
                    role="button"
                    tabindex="0"
                    @click="openRaid(raid.id)"
                    @keydown.enter.prevent="openRaid(raid.id)"
                    @keydown.space.prevent="openRaid(raid.id)"
                  >
                    <div class="raid-calendar-event__header">
                      <div class="raid-calendar-event__title">
                        <span
                          v-if="raid.hasUnassignedLoot"
                          class="raid-alert"
                          role="img"
                          aria-label="Loot pending assignment"
                          title="Loot pending assignment"
                        >
                          ❗
                        </span>
                        <span
                          v-if="raid.isRecurring"
                          class="raid-recurring-icon"
                          role="img"
                          :title="recurrenceTooltip(raid)"
                          :aria-label="recurrenceTooltip(raid)"
                        >
                          ♻️
                        </span>
                        <span>{{ raid.name }}</span>
                      </div>
                      <span :class="['badge', getRaidStatus(raid.id).variant]">
                        {{ getRaidStatus(raid.id).label }}
                      </span>
                    </div>
                    <p class="raid-calendar-event__meta">
                      <span>{{ formatTime(raid.startTime) }}</span>
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • <span>{{ formatTargetZones(raid.targetZones) }}</span>
                      </template>
                    </p>
                    <div class="raid-calendar-event__actions">
                      <span
                        v-if="raid.logMonitor?.isActive"
                        class="raid-monitor-indicator raid-monitor-indicator--small"
                        role="img"
                        :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <div class="raid-calendar-event__buttons">
                        <button
                          class="copy-button"
                          type="button"
                          :disabled="sharingRaidId === raid.id"
                          @click.stop="shareRaid(raid)"
                          title="Copy share link"
                        >
                          <span aria-hidden="true">🔗</span>
                          <span class="sr-only">Copy share link</span>
                        </button>
                        <button
                          v-if="canCopyRaid(raid)"
                          class="copy-button"
                          type="button"
                          :disabled="copyingRaidId === raid.id"
                          @click.stop="copyRaid(raid)"
                          title="Copy raid"
                        >
                          <span aria-hidden="true">📄</span>
                          <span class="sr-only">Copy raid</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <div class="raid-calendar--mobile">
              <div
                v-for="day in calendarAgendaDays"
                :key="day.key"
                class="raid-agenda-day"
              >
                <header class="raid-agenda-day__header">
                  <div>
                    <p class="raid-agenda-day__date">{{ day.dateLabel }}</p>
                    <p class="raid-agenda-day__weekday">{{ day.weekday }}</p>
                  </div>
                  <span class="raid-agenda-day__count">{{ day.raids.length }} raid{{ day.raids.length === 1 ? '' : 's' }}</span>
                </header>
                <div class="raid-agenda-day__events">
                  <div
                    v-for="raid in day.raids"
                    :key="raid.id"
                    class="raid-calendar-event raid-calendar-event--mobile"
                    :class="{ 'raid-calendar-event--active': raid.startedAt && !raid.endedAt }"
                    role="button"
                    tabindex="0"
                    @click="openRaid(raid.id)"
                    @keydown.enter.prevent="openRaid(raid.id)"
                    @keydown.space.prevent="openRaid(raid.id)"
                  >
                    <div class="raid-calendar-event__header">
                      <div class="raid-calendar-event__title">
                        <span
                          v-if="raid.hasUnassignedLoot"
                          class="raid-alert"
                          role="img"
                          aria-label="Loot pending assignment"
                          title="Loot pending assignment"
                        >
                          ❗
                        </span>
                        <span
                          v-if="raid.isRecurring"
                          class="raid-recurring-icon"
                          role="img"
                          :title="recurrenceTooltip(raid)"
                          :aria-label="recurrenceTooltip(raid)"
                        >
                          ♻️
                        </span>
                        <span>{{ raid.name }}</span>
                      </div>
                      <span :class="['badge', getRaidStatus(raid.id).variant]">
                        {{ getRaidStatus(raid.id).label }}
                      </span>
                    </div>
                    <p class="raid-calendar-event__meta">
                      <span>{{ formatTime(raid.startTime) }}</span>
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • <span>{{ formatTargetZones(raid.targetZones) }}</span>
                      </template>
                    </p>
                    <div class="raid-calendar-event__actions">
                      <span
                        v-if="raid.logMonitor?.isActive"
                        class="raid-monitor-indicator raid-monitor-indicator--small"
                        role="img"
                        :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <div class="raid-calendar-event__buttons">
                        <button
                          class="copy-button"
                          type="button"
                          :disabled="sharingRaidId === raid.id"
                          @click.stop="shareRaid(raid)"
                          title="Copy share link"
                        >
                          <span aria-hidden="true">🔗</span>
                          <span class="sr-only">Copy share link</span>
                        </button>
                        <button
                          v-if="canCopyRaid(raid)"
                          class="copy-button"
                          type="button"
                          :disabled="copyingRaidId === raid.id"
                          @click.stop="copyRaid(raid)"
                          title="Copy raid"
                        >
                          <span aria-hidden="true">📄</span>
                          <span class="sr-only">Copy raid</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-if="dayContextMenu.visible"
                  class="raid-calendar-context"
                  :style="{ top: `${dayContextMenu.y}px`, left: `${dayContextMenu.x}px` }"
                >
                  <p class="raid-calendar-context__label">
                    Plan new raid on {{ contextMenuDateLabel }}
                  </p>
                  <button type="button" class="raid-calendar-context__action" @click="scheduleContextRaid">
                    Create raid
                  </button>
                  <button type="button" class="raid-calendar-context__close" @click="hideDayContextMenu">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            v-if="dayContextMenu.visible"
            class="raid-calendar-context"
            :style="{ top: `${dayContextMenu.y}px`, left: `${dayContextMenu.x}px` }"
          >
            <p class="raid-calendar-context__label">
              Plan new raid on {{ contextMenuDateLabel }}
            </p>
            <button type="button" class="raid-calendar-context__action" @click="scheduleContextRaid">
              Create raid
            </button>
            <button type="button" class="raid-calendar-context__close" @click="hideDayContextMenu">
              Cancel
            </button>
          </div>
        </div>

        <div v-else>
          <p v-if="historyRaids.length === 0" class="muted empty-state">No completed raids found.</p>
          <ul v-else class="raid-list">
            <li
              v-for="raid in historyRaids"
              :key="raid.id"
              :class="[
                'raid-list__item',
                { 'raid-list__item--active': raid.startedAt && !raid.endedAt }
              ]"
              role="button"
              tabindex="0"
              @click="openRaid(raid.id)"
              @keydown.enter.prevent="openRaid(raid.id)"
              @keydown.space.prevent="openRaid(raid.id)"
            >
              <div class="raid-info">
                <div class="raid-info__primary">
                  <span
                    v-if="raid.hasUnassignedLoot"
                    class="raid-alert"
                    role="img"
                    aria-label="Loot pending assignment"
                    title="Loot pending assignment"
                  >
                    ❗
                  </span>
                  <div class="raid-info__content">
                    <strong>
                      <span
                        v-if="raid.isRecurring"
                        class="raid-recurring-icon"
                        role="img"
                        :title="recurrenceTooltip(raid)"
                        :aria-label="recurrenceTooltip(raid)"
                      >
                        ♻️
                      </span>
                      {{ raid.name }}
                    </strong>
                    <span class="muted">
                      ({{ formatDate(raid.startTime) }})
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • {{ formatTargetZones(raid.targetZones) }}
                      </template>
                    </span>
                  </div>
                </div>
              </div>
              <div class="raid-meta">
                <span
                  v-if="raid.logMonitor?.isActive"
                  class="raid-monitor-indicator"
                  role="img"
                  :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span :class="['badge', getRaidStatus(raid.id).variant]">
                  {{ getRaidStatus(raid.id).label }}
                </span>
                <button
                  class="copy-button"
                  type="button"
                  :disabled="sharingRaidId === raid.id"
                  @click.stop="shareRaid(raid)"
                  title="Copy share link"
                >
                  <span aria-hidden="true">🔗</span>
                  <span class="sr-only">Copy share link</span>
                </button>
                <button
                  v-if="canCopyRaid(raid)"
                  class="copy-button"
                  type="button"
                  :disabled="copyingRaidId === raid.id"
                  @click.stop="copyRaid(raid)"
                  title="Copy raid"
                >
                  <span aria-hidden="true">📄</span>
                  <span class="sr-only">Copy raid</span>
                </button>
                <button class="btn btn--outline" @click.stop="openRaid(raid.id)">
                  Open
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div v-else-if="hasGuildMembership" class="empty-state empty-state--member">
      You do not currently have access to any guild raids.
    </div>
    <div v-else class="empty-state">Join a guild to plan and review raids.</div>
    <RaidModal
      v-if="showRaidModal"
      :guild-id="selectedGuildId"
      :default-start-time="selectedGuildDefaults?.start ?? null"
      :default-end-time="selectedGuildDefaults?.end ?? null"
      :default-discord-voice-url="selectedGuildDefaults?.voice ?? null"
      :initial-start-date-time="scheduledStartDate"
      @close="handleRaidClose"
      @created="handleRaidCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';

import { api, type RaidEventSummary } from '../services/api';
import type { GuildRole } from '../services/types';
import { useAuthStore } from '../stores/auth';

type RaidStatusVariant = 'badge--neutral' | 'badge--positive' | 'badge--negative';
type RaidStatusBadge = { label: string; variant: RaidStatusVariant };

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const todayKey = formatDateKey(new Date());

const raids = ref<RaidEventSummary[]>([]);
const selectedGuildPermissions = ref<{ canManage: boolean; role: GuildRole } | null>(null);
let raidsRefreshTimer: number | null = null;
const calendarViewDate = ref(startOfMonth(new Date()));
const raidStatus = computed(() => {
  const map = new Map<string, RaidStatusBadge>();

  for (const raid of raids.value) {
    const events = raid.attendance ?? [];
    const latest = events.reduce<(typeof events)[number] | null>((current, event) => {
      if (!current) {
        return event;
      }

      return new Date(event.createdAt) > new Date(current.createdAt) ? event : current;
    }, null);

    let label: string;
    let variant: RaidStatusVariant;

    const ended = raidHasEnded(raid);
    const started = raidHasStarted(raid);

    if (latest?.eventType === 'RESTART') {
      label = 'Restarted';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'START' && started) {
      label = 'Started';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'END' || ended) {
      label = 'Ended';
      variant = 'badge--negative';
    } else if (started) {
      label = 'Started';
      variant = 'badge--positive';
    } else {
      label = 'Planned';
      variant = 'badge--neutral';
    }

    map.set(raid.id, { label, variant });
  }

  return map;
});

const authStore = useAuthStore();
const selectedGuildId = ref('');
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const scheduledStartDate = ref<string | null>(null);
const router = useRouter();
const activeTab = ref<'active' | 'history'>('active');
const copyingRaidId = ref<string | null>(null);
const sharingRaidId = ref<string | null>(null);
const calendarViewRef = ref<HTMLElement | null>(null);
const dayContextMenu = reactive<{ visible: boolean; x: number; y: number; date: Date | null }>({
  visible: false,
  x: 0,
  y: 0,
  date: null
});
const guildTimingDefaults = ref<Record<
  string,
  { start: string | null; end: string | null; voice: string | null }
>>({});
const selectedGuildDefaults = computed(() => {
  if (!selectedGuildId.value) {
    return null;
  }
  return guildTimingDefaults.value[selectedGuildId.value] ?? null;
});

async function loadRaids() {
  if (!selectedGuildId.value) {
    raids.value = [];
    selectedGuildPermissions.value = null;
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
    stopRaidsRefreshPolling();
    return;
  }

  loadingRaids.value = true;
  activeTab.value = 'active';
  try {
    const response = await api.fetchRaidsForGuild(selectedGuildId.value);
    raids.value = response.raids;
    selectedGuildPermissions.value = response.permissions ?? null;
    await ensureGuildDefaults(selectedGuildId.value);
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } finally {
    loadingRaids.value = false;
  }
}

function startRaidsRefreshPolling() {
  if (raidsRefreshTimer || !selectedGuildId.value) {
    return;
  }
  raidsRefreshTimer = window.setInterval(() => {
    if (selectedGuildId.value) {
      loadRaids();
    }
  }, 30_000);
}

function stopRaidsRefreshPolling() {
  if (raidsRefreshTimer) {
    clearInterval(raidsRefreshTimer);
    raidsRefreshTimer = null;
  }
}

const canCreateRaid = computed(() => Boolean(selectedGuildPermissions.value?.canManage));
const hasGuildMembership = computed(() => (authStore.user?.guilds?.length ?? 0) > 0);

const historyRaids = computed(() =>
  raids.value
    .filter((raid) => isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
);

const raidsByDate = computed(() => {
  const map = new Map<string, RaidEventSummary[]>();
  for (const raid of raids.value) {
    const key = formatDateKey(new Date(raid.startTime));
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(raid);
  }
  for (const [, value] of map) {
    value.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }
  return map;
});

const calendarDays = computed(() => {
  const days: Array<{
    key: string;
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    raids: RaidEventSummary[];
  }> = [];
  const start = startOfWeek(calendarViewDate.value);
  for (let i = 0; i < 42; i += 1) {
    const current = addDays(start, i);
    const key = formatDateKey(current);
    days.push({
      key,
      date: current,
      isCurrentMonth: current.getMonth() === calendarViewDate.value.getMonth(),
      isToday: key === todayKey,
      raids: raidsByDate.value.get(key) ?? []
    });
  }
  return days;
});

const calendarMonthLabel = computed(() => {
  return calendarViewDate.value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
});

const calendarMonthDescription = computed(() => {
  return calendarViewDate.value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
});

const monthHasRaids = computed(() =>
  calendarDays.value.some((day) => day.isCurrentMonth && day.raids.length)
);

const calendarAgendaDays = computed(() =>
  calendarDays.value
    .filter((day) => day.raids.length && day.isCurrentMonth)
    .map((day) => ({
      key: day.key,
      dateLabel: day.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
      weekday: WEEKDAY_LABELS[day.date.getDay()],
      raids: day.raids
    }))
);

const contextMenuDateLabel = computed(() => {
  if (!dayContextMenu.date) {
    return '';
  }
  return dayContextMenu.date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
});

function openRaidModal(prefillDate?: Date | null) {
  if (!selectedGuildId.value || !canCreateRaid.value) {
    return;
  }
  if (prefillDate) {
    scheduledStartDate.value = buildRaidStartDateTime(prefillDate);
  } else {
    scheduledStartDate.value = null;
  }
  hideDayContextMenu();
  showRaidModal.value = true;
}

function handleRaidCreated() {
  showRaidModal.value = false;
  scheduledStartDate.value = null;
  loadRaids();
}

function handleRaidClose() {
  showRaidModal.value = false;
  scheduledStartDate.value = null;
}

function getRaidStatus(raidId: string) {
  const status = raidStatus.value.get(raidId);
  return status ?? { label: 'Planned', variant: 'badge--neutral' };
}

function openRaid(raidId: string) {
  router.push({ name: 'RaidDetail', params: { raidId } });
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown start';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatDateOnly(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown date';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(parsed);
}

function formatTargetZones(zones: unknown): string {
  if (!Array.isArray(zones)) {
    return '';
  }

  const labels = zones
    .map((zone) => (typeof zone === 'string' ? zone.trim() : zone))
    .filter((zone): zone is string => typeof zone === 'string' && zone.length > 0);

  return labels.length > 0 ? labels.join(', ') : '';
}

function recurrenceTooltip(raid: RaidEventSummary) {
  if (!raid.isRecurring || !raid.recurrence) {
    return 'Recurring raid';
  }

  const unit = raid.recurrence.frequency === 'DAILY'
    ? 'day'
    : raid.recurrence.frequency === 'MONTHLY'
      ? 'month'
      : 'week';
  const interval = Math.max(1, raid.recurrence.interval);
  const everyLabel = interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;

  let summary = `Repeats ${everyLabel}`;
  if (raid.recurrence.endDate) {
    summary += ` until ${formatDateOnly(raid.recurrence.endDate)}`;
  }
  if (raid.recurrence.isActive === false) {
    summary += ' (paused)';
  }
  return summary;
}

async function ensureGuildDefaults(guildId: string) {
  if (!guildId || guildTimingDefaults.value[guildId]) {
    return;
  }
  try {
    const detail = await api.fetchGuildDetail(guildId);
    guildTimingDefaults.value[guildId] = {
      start: detail.defaultRaidStartTime ?? null,
      end: detail.defaultRaidEndTime ?? null,
      voice: detail.defaultDiscordVoiceUrl ?? null
    };
  } catch (error) {
    console.warn('Failed to load guild defaults for raid planning', error);
  }
}

function canCopyRaid(raid: RaidEventSummary) {
  if (typeof raid.permissions?.canManage === 'boolean') {
    return raid.permissions.canManage;
  }
  return Boolean(selectedGuildPermissions.value?.canManage);
}

async function shareRaid(raid: RaidEventSummary) {
  if (sharingRaidId.value === raid.id) {
    return;
  }
  sharingRaidId.value = raid.id;
  try {
    const resolved = router.resolve({ name: 'RaidDetail', params: { raidId: raid.id } }).href;
    const absoluteUrl = typeof window !== 'undefined'
      ? new URL(resolved, window.location.origin).toString()
      : resolved;

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(absoluteUrl);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = absoluteUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    window.dispatchEvent(
      new CustomEvent('raid-share-copied', {
        detail: {
          raidId: raid.id,
          raidName: raid.name
        }
      })
    );
  } catch (error) {
    console.warn('Failed to copy raid share link', error);
    window.alert('Unable to copy raid link. Please try again.');
  } finally {
    sharingRaidId.value = null;
  }
}

async function copyRaid(raid: RaidEventSummary) {
  if (!canCopyRaid(raid) || copyingRaidId.value || !selectedGuildId.value) {
    return;
  }
  copyingRaidId.value = raid.id;
  try {
    await api.createRaidEvent({
      guildId: selectedGuildId.value,
      name: raid.name,
      startTime: raid.startTime,
      targetZones: ensureTargets(raid.targetZones),
      targetBosses: ensureTargets(raid.targetBosses),
      notes: raid.notes ?? undefined,
      discordVoiceUrl: raid.discordVoiceUrl ?? undefined,
      recurrence:
        raid.isRecurring && raid.recurrence?.isActive !== false && raid.recurrence
          ? {
              frequency: raid.recurrence.frequency,
              interval: raid.recurrence.interval,
              endDate: raid.recurrence.endDate ?? null
            }
          : null
    });
    await loadRaids();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    window.alert('Unable to copy raid. Please try again.');
    console.warn('Failed to copy raid', error);
  } finally {
    copyingRaidId.value = null;
  }
}

function ensureTargets(targets: RaidEventSummary['targetZones']) {
  if (Array.isArray(targets) && targets.length > 0) {
    return targets;
  }
  return ['Unspecified Target'];
}

function raidHasEnded(raid: RaidEventSummary) {
  if (!raid.endedAt) {
    return false;
  }
  return new Date(raid.endedAt).getTime() <= Date.now();
}

function raidHasStarted(raid: RaidEventSummary) {
  if (!raid.startedAt) {
    return false;
  }
  return new Date(raid.startedAt).getTime() <= Date.now();
}

function isHistoryRaid(raid: RaidEventSummary) {
  if (raidHasEnded(raid)) {
    return true;
  }

  const start = new Date(raid.startTime);
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return start <= twoDaysAgo;
}

function formatTime(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function goToPreviousMonth() {
  const next = new Date(calendarViewDate.value);
  next.setMonth(next.getMonth() - 1);
  calendarViewDate.value = startOfMonth(next);
}

function goToNextMonth() {
  const next = new Date(calendarViewDate.value);
  next.setMonth(next.getMonth() + 1);
  calendarViewDate.value = startOfMonth(next);
}

function goToCurrentMonth() {
  calendarViewDate.value = startOfMonth(new Date());
}

function buildRaidStartDateTime(date: Date) {
  const draft = new Date(date);
  const defaultStart = selectedGuildDefaults.value?.start;
  if (defaultStart && /^([01]\d|2[0-3]):([0-5]\d)$/.test(defaultStart)) {
    const [hours, minutes] = defaultStart.split(':').map(Number);
    draft.setHours(hours, minutes, 0, 0);
  } else {
    draft.setHours(20, 0, 0, 0);
  }
  const offset = draft.getTimezoneOffset();
  const local = new Date(draft.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function handleCalendarDayContextMenu(day: { date: Date }, event: MouseEvent) {
  if (!canCreateRaid.value) {
    return;
  }
  const bounds = calendarViewRef.value?.getBoundingClientRect();
  const offsetX = bounds ? event.clientX - bounds.left : event.clientX;
  const offsetY = bounds ? event.clientY - bounds.top : event.clientY;
  dayContextMenu.visible = true;
  dayContextMenu.x = offsetX;
  dayContextMenu.y = offsetY;
  dayContextMenu.date = day.date;
}

function hideDayContextMenu() {
  dayContextMenu.visible = false;
  dayContextMenu.date = null;
}

function scheduleContextRaid() {
  if (!dayContextMenu.date) {
    return;
  }
  scheduleRaidOnDate(dayContextMenu.date);
}

function scheduleRaidOnDate(date: Date) {
  openRaidModal(date);
}

watch(
  () => authStore.primaryGuild,
  (guild) => {
    const newId = guild?.id ?? '';
    if (newId !== selectedGuildId.value) {
      selectedGuildId.value = newId;
      if (selectedGuildId.value) {
        loadRaids();
        startRaidsRefreshPolling();
      } else {
        stopRaidsRefreshPolling();
        raids.value = [];
        selectedGuildPermissions.value = null;
      }
    } else if (newId) {
      loadRaids();
      startRaidsRefreshPolling();
    }
  },
  { immediate: true }
);

watch(selectedGuildId, (guildId) => {
  activeTab.value = 'active';
  goToCurrentMonth();
  if (guildId) {
    ensureGuildDefaults(guildId);
    startRaidsRefreshPolling();
  } else {
    stopRaidsRefreshPolling();
  }
});

watch(activeTab, () => {
  hideDayContextMenu();
});

onUnmounted(() => {
  window.removeEventListener('click', hideDayContextMenu);
  window.removeEventListener('scroll', hideDayContextMenu, true);
  window.removeEventListener('contextmenu', hideDayContextMenu);
  stopRaidsRefreshPolling();
});

onMounted(() => {
  window.addEventListener('click', hideDayContextMenu);
  window.addEventListener('scroll', hideDayContextMenu, true);
  window.addEventListener('contextmenu', hideDayContextMenu);
});

function startOfMonth(date: Date) {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
</script>

<style scoped>
.raids {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  margin: 1.5rem auto;
}

.tab {
  padding: 0.55rem 1.4rem;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  color: #cbd5f5;
  font-size: 0.9rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tab:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(148, 163, 184, 0.45);
  color: #e0f2fe;
}

.tab--active {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
  transform: translateY(-1px);
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  margin: 2rem 0;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
}

.raid-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, border-color 0.2s ease;
}

.raid-list__item--active {
  border-color: rgba(34, 197, 94, 0.55);
  box-shadow: 0 0 14px rgba(34, 197, 94, 0.25);
}

.raid-list__item:hover,
.raid-list__item:focus {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
  outline: none;
}

.raid-list__item--active:hover,
.raid-list__item--active:focus {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.6);
}

.calendar-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;
}

.calendar-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.calendar-toolbar__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.calendar-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.calendar-nav-btn {
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.calendar-nav-btn:hover {
  border-color: rgba(59, 130, 246, 0.6);
  color: #bae6fd;
}

.calendar-nav-btn--today {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
}

.calendar-subtitle {
  margin: 0;
  color: #94a3b8;
}

.calendar-empty-hint {
  margin: 0;
  color: #94a3b8;
  font-size: 0.9rem;
}

.raid-calendar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.raid-calendar__weekday-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  color: #94a3b8;
}

.raid-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-auto-rows: 180px;
  border-radius: 1.2rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.raid-calendar__day {
  padding: 0.5rem;
  background: rgba(15, 23, 42, 0.75);
  border-right: 1px solid rgba(148, 163, 184, 0.15);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-calendar__day:nth-child(7n) {
  border-right: none;
}

.raid-calendar__day:nth-last-child(-n + 7) {
  border-bottom: none;
}

.raid-calendar__day--muted {
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.5);
}

.raid-calendar__day--today {
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.45);
}

.raid-calendar__day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 0.9rem;
}

.raid-calendar__today-pill {
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.2);
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: #bae6fd;
}

.raid-calendar__events {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  max-height: 320px;
  padding-right: 0.2rem;
}

.raid-calendar-event {
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.85);
  padding: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.1s ease;
}

.raid-calendar-event:hover,
.raid-calendar-event:focus-visible {
  border-color: rgba(59, 130, 246, 0.5);
  transform: translateY(-1px);
}

.raid-calendar-event--active {
  border-color: rgba(34, 197, 94, 0.5);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.18);
}

.raid-calendar-event__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.raid-calendar-event__title {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
}

.raid-calendar-event__meta {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.85);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.raid-calendar-event__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.raid-calendar-event__buttons {
  display: flex;
  gap: 0.35rem;
}

.raid-calendar-context {
  position: absolute;
  z-index: 10;
  min-width: 220px;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.95);
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.6);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.raid-calendar-context__label {
  margin: 0;
  font-size: 0.85rem;
  color: #e2e8f0;
}

.raid-calendar-context__action,
.raid-calendar-context__close {
  border: none;
  border-radius: 0.6rem;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
  font-weight: 600;
}

.raid-calendar-context__action {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #0f172a;
}

.raid-calendar-context__close {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #cbd5f5;
}

.raid-calendar-event--mobile {
  border: 1px solid rgba(59, 130, 246, 0.35);
}

.raid-calendar--mobile {
  display: none;
}

.raid-agenda-day {
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.75);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.raid-agenda-day__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.raid-agenda-day__date {
  margin: 0;
  font-weight: 600;
}

.raid-agenda-day__weekday {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.raid-agenda-day__count {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
  text-transform: uppercase;
}

.raid-agenda-day__events {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.raid-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-info__primary {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.raid-alert {
  color: #f87171;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
}

.raid-info__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-info strong {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.raid-recurring-icon {
  font-size: 1.05rem;
}

.raid-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-monitor-indicator {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.22), rgba(14, 165, 233, 0.05));
  border: 1px solid rgba(14, 165, 233, 0.6);
  color: #bae6fd;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.35);
}

.raid-monitor-indicator::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  border: 2px solid rgba(14, 165, 233, 0.35);
  animation: raid-monitor-pulse 2s infinite;
  pointer-events: none;
}

.raid-monitor-indicator svg {
  width: 18px;
  height: 18px;
}

.raid-monitor-indicator--small {
  width: 28px;
  height: 28px;
}

@keyframes raid-monitor-pulse {
  0% {
    opacity: 0.85;
    transform: scale(0.9);
  }
  70% {
    opacity: 0;
    transform: scale(1.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.45);
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.copy-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: #cbd5f5;
  border-radius: 0.5rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.copy-button:hover:not(:disabled),
.copy-button:focus-visible {
  color: #e0f2fe;
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.15);
}

.copy-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.muted {
  color: #94a3b8;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

@media (max-width: 900px) {
  .raid-calendar__day {
    min-height: 200px;
  }
}

@media (max-width: 768px) {
  .raid-calendar--desktop {
    display: none;
  }

  .raid-calendar--mobile {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
}

</style>
