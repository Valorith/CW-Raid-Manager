<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
      </div>
      <button
        v-if="canCreateRaid && selectedGuildId"
        class="btn"
        @click="openRaidModal"
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

        <p v-if="displayedRaids.length === 0" class="muted empty-state">{{ emptyStateMessage }}</p>

        <ul v-else class="raid-list">
          <li
            v-for="raid in displayedRaids"
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
                    ({{ formatDate(raid.startTime) }}) • {{ formatTargetZones(raid.targetZones) }}
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
      @close="handleRaidClose"
      @created="handleRaidCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';

import { api, type RaidEventSummary } from '../services/api';
import type { GuildRole } from '../services/types';
import { useAuthStore } from '../stores/auth';

type RaidStatusVariant = 'badge--neutral' | 'badge--positive' | 'badge--negative';
type RaidStatusBadge = { label: string; variant: RaidStatusVariant };

const raids = ref<RaidEventSummary[]>([]);
const selectedGuildPermissions = ref<{ canManage: boolean; role: GuildRole } | null>(null);
let raidsRefreshTimer: number | null = null;
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
const router = useRouter();
const activeTab = ref<'active' | 'history'>('active');
const copyingRaidId = ref<string | null>(null);
const sharingRaidId = ref<string | null>(null);
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

const activeRaids = computed(() =>
  raids.value
    .filter((raid) => !isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
);
const historyRaids = computed(() =>
  raids.value
    .filter((raid) => isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
);

const displayedRaids = computed(() =>
  activeTab.value === 'active' ? activeRaids.value : historyRaids.value
);

const emptyStateMessage = computed(() =>
  activeTab.value === 'active'
    ? 'No active raids scheduled.'
    : 'No completed raids found.'
);


function openRaidModal() {
  if (!selectedGuildId.value || !canCreateRaid.value) {
    return;
  }
  showRaidModal.value = true;
}

function handleRaidCreated() {
  showRaidModal.value = false;
  loadRaids();
}

function handleRaidClose() {
  showRaidModal.value = false;
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
    return 'Unknown Target';
  }

  const labels = zones
    .map((zone) => (typeof zone === 'string' ? zone.trim() : zone))
    .filter((zone): zone is string => typeof zone === 'string' && zone.length > 0);

  return labels.length > 0 ? labels.join(', ') : 'Unknown Target';
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
  if (guildId) {
    ensureGuildDefaults(guildId);
    startRaidsRefreshPolling();
  } else {
    stopRaidsRefreshPolling();
  }
});

onUnmounted(() => {
  stopRaidsRefreshPolling();
});
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

</style>
