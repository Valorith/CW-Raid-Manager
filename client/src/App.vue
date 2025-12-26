<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <RouterLink to="/dashboard" class="brand__title">CW Raid Manager</RouterLink>
      </div>
      <nav class="nav">
        <!-- Dashboard - No dropdown -->
        <RouterLink
          v-if="authStore.isAuthenticated"
          to="/dashboard"
          class="nav__link"
        >
          Dashboard
        </RouterLink>

        <!-- Guild - With dropdown when guild is selected -->
        <div
          v-if="authStore.isAuthenticated"
          class="nav__item"
          :class="{ 'nav__item--has-dropdown': primaryGuild }"
          @mouseenter="openDropdown('guild')"
          @mouseleave="closeDropdown('guild')"
        >
          <RouterLink :to="guildNavTo" class="nav__link">
            {{ guildNavLabel }}
            <svg v-if="primaryGuild" class="nav__chevron" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </RouterLink>
          <Transition name="dropdown">
            <div v-if="primaryGuild && activeDropdown === 'guild'" class="nav__dropdown">
              <RouterLink
                v-if="canManageGuildSettings"
                :to="{ name: 'GuildSettings', params: { guildId: primaryGuild.id } }"
                class="nav__dropdown-item"
              >
                Settings
              </RouterLink>
              <RouterLink
                :to="{ name: 'GuildMetrics', params: { guildId: primaryGuild.id } }"
                class="nav__dropdown-item"
              >
                Metrics
              </RouterLink>
              <RouterLink
                :to="{ name: 'GuildBank', params: { guildId: primaryGuild.id } }"
                class="nav__dropdown-item"
              >
                Bank
              </RouterLink>
              <RouterLink
                :to="{ name: 'GuildQuestTracker', params: { guildId: primaryGuild.id } }"
                class="nav__dropdown-item"
              >
                Quest Tracker
              </RouterLink>
              <RouterLink
                :to="{ name: 'GuildNpcRespawn', params: { guildId: primaryGuild.id } }"
                class="nav__dropdown-item"
              >
                NPC Respawn
              </RouterLink>
            </div>
          </Transition>
        </div>

        <!-- Raids - No dropdown -->
        <RouterLink
          v-if="authStore.isAuthenticated"
          to="/raids"
          class="nav__link"
        >
          Raids
        </RouterLink>

        <!-- Admin - With dropdown (different items for admin vs guide) -->
        <div
          v-if="authStore.isAdminOrGuide"
          class="nav__item nav__item--has-dropdown"
          @mouseenter="openDropdown('admin')"
          @mouseleave="closeDropdown('admin')"
        >
          <component
            :is="authStore.isAdmin ? 'RouterLink' : 'span'"
            :to="authStore.isAdmin ? '/admin' : undefined"
            class="nav__link"
            :class="{ 'nav__link--no-click': !authStore.isAdmin }"
          >
            Admin
            <svg class="nav__chevron" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </component>
          <Transition name="dropdown">
            <div v-if="activeDropdown === 'admin'" class="nav__dropdown">
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin/player-event-logs"
                class="nav__dropdown-item"
              >
                Player Event Logs
              </RouterLink>
              <RouterLink
                to="/admin/connections"
                class="nav__dropdown-item"
              >
                Server Connections
              </RouterLink>
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin/money-tracker"
                class="nav__dropdown-item"
              >
                Money Tracker
              </RouterLink>
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin/metallurgy"
                class="nav__dropdown-item"
              >
                Metallurgy Tracker
              </RouterLink>
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin/loot-management"
                class="nav__dropdown-item"
              >
                ML Diagnostics
              </RouterLink>
            </div>
          </Transition>
        </div>
      </nav>
      <div class="nav-alerts">
        <GuildDonationsNotification />
        <div
          v-if="attentionStore.hasIndicators"
          class="nav-attention"
          role="group"
          aria-label="Attention controls"
        >
          <button
            v-for="indicator in attentionStore.indicatorList"
            :key="indicator.id"
            type="button"
            class="nav-attention__button"
            :class="{
              'nav-attention__button--active': indicator.active,
              'nav-attention__button--pulse': indicator.requiresAttention,
              'nav-attention__button--lc': indicator.icon === 'scale' || indicator.label === 'Loot Council'
            }"
            :aria-label="indicator.description ?? indicator.label"
            @click="attentionStore.triggerIndicator(indicator.id)"
            :title="indicator.icon === 'scale' || indicator.label === 'Loot Council' ? 'Loot Council' : indicator.label"
          >
            <span class="nav-attention__badge" aria-hidden="true">
              <svg
                v-if="indicator.icon === 'scale' || indicator.label === 'Loot Council'"
                class="nav-attention__icon"
                viewBox="0 0 24 24"
                role="presentation"
                aria-hidden="true"
              >
                <path
                  d="M12 3v3m-7 5h4l-2 4-2-4Zm14 0h-4l2 4 2-4ZM5 19h14M8 11c0 2 1.5 3.6 4 3.6s4-1.6 4-3.6M12 6h6"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <span v-else>
                {{ indicator.icon ?? indicator.label.charAt(0).toUpperCase() }}
              </span>
            </span>
          </button>
        </div>
        <div
          v-if="monitorStore.indicatorVisible"
          class="nav-monitor"
          :class="{ 'nav-monitor--attention': monitorStore.hasPendingActions }"
        >
          <button
            type="button"
            class="nav-monitor__button"
            @click="goToActiveMonitor"
            :aria-label="monitorIndicatorLabel"
          >
            <span class="nav-monitor__pulse" aria-hidden="true"></span>
            <span class="nav-monitor__content">
              <span class="nav-monitor__label">
                {{ monitorStore.hasPendingActions ? 'Loot Actions Pending' : 'Monitoring Live' }}
              </span>
              <span class="nav-monitor__file">
                {{ monitorStore.activeSession?.raidName ?? 'Raid' }}
              </span>
            </span>
          </button>
        </div>
        <div v-if="monitorZoneVisible" class="nav-zone-pill" :title="monitorZoneTitle">
          <span class="nav-zone-pill__label">Zone</span>
          <span class="nav-zone-pill__value">{{ monitorStore.lastZone }}</span>
        </div>
      </div>
      <div class="auth">
        <RouterLink
          v-if="authStore.isAuthenticated"
          to="/settings/account"
          class="settings-link"
          aria-label="Account settings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              fill-rule="evenodd"
              d="M11.828 1.046c-.307-.684-1.32-.684-1.628 0l-.562 1.255a8.45 8.45 0 0 0-2.548 1.473l-1.352-.284c-.707-.148-1.336.48-1.188 1.188l.284 1.352a8.46 8.46 0 0 0-1.473 2.548l-1.255.562c-.684.306-.684 1.32 0 1.628l1.255.562a8.45 8.45 0 0 0 1.473 2.548l-.284 1.352c-.148.707.48 1.336 1.188 1.188l1.352-.284a8.45 8.45 0 0 0 2.548 1.473l.562 1.255c.307.684 1.32.684 1.628 0l.562-1.255a8.45 8.45 0 0 0 2.548-1.473l1.352.284c.707.148 1.336-.48 1.188-1.188l-.284-1.352a8.45 8.45 0 0 0 1.473-2.548l1.255-.562c.684-.307.684-1.32 0-1.628l-1.255-.562a8.45 8.45 0 0 0-1.473-2.548l.284-1.352c.148-.707-.48-1.336-1.188-1.188l-1.352.284a8.45 8.45 0 0 0-2.548-1.473l-.562-1.255ZM12 15.75a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5Z"
              clip-rule="evenodd"
            />
          </svg>
        </RouterLink>
        <template v-if="authStore.isAuthenticated">
          <span class="auth__user">Hi, {{ authStore.preferredName }}</span>
          <span v-if="authStore.isAdmin" class="auth__badge auth__badge--admin">Admin</span>
          <span v-else-if="authStore.isGuide" class="auth__badge auth__badge--guide">Guide</span>
          <button class="btn btn--outline" @click="logout">Log out</button>
        </template>
        <template v-else>
          <button class="btn btn--google" @click="loginWithGoogle">
            <svg class="btn__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button class="btn btn--discord" @click="loginWithDiscord">
            <svg class="btn__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
            </svg>
            Discord
          </button>
        </template>
      </div>
    </header>
    <div v-if="activeRaid" class="active-raid-banner">
      <div class="active-raid-banner__content">
        <div class="active-raid-banner__status">
          <span class="pulse-dot" aria-hidden="true"></span>
          <span class="label">Active Raid</span>
          <strong>{{ activeRaid.name }}</strong>
          <span class="muted">Started {{ formatDate(activeRaid.startedAt ?? activeRaid.startTime) }}</span>
        </div>
        <RouterLink
          class="btn btn--accent"
          :to="{ name: 'RaidDetail', params: { raidId: activeRaid.id } }"
        >
          View Raid
        </RouterLink>
      </div>
    </div>

    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast" tag="div">
        <div v-for="toast in toasts" :key="toast.id" class="toast">
          <strong>{{ toast.title }}</strong>
          <p>{{ toast.message }}</p>
        </div>
      </TransitionGroup>
    </div>
    <main class="app-content">
      <RouterView v-slot="{ Component, route }">
        <KeepAlive include="LootTrackerView">
          <component v-if="Component" :is="Component" :key="resolveViewKey(route)" />
        </KeepAlive>
      </RouterView>
    </main>
    <CharacterInventoryModal />
    <CharacterAdminModal />
    <ItemTooltip />
    <GuildDonationsModal />
    <NpcNotificationModal
      :notifications="npcNotifications"
      @dismiss="handleDismissNpcNotifications"
    />
    <DiscordWebhookDebugModal v-if="authStore.isAdmin" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, RouterView, useRouter, type RouteLocationNormalized } from 'vue-router';

import { useAuthStore } from './stores/auth';
import { api, type RaidEventSummary } from './services/api';
import { useMonitorStore } from './stores/monitor';
import { useAttentionStore } from './stores/attention';
import { useNpcRespawnStore } from './stores/npcRespawn';
import { playLootAlertChime } from './utils/audio';
import CharacterInventoryModal from './components/CharacterInventoryModal.vue';
import CharacterAdminModal from './components/Modals/CharacterAdminModal.vue';
import ItemTooltip from './components/ItemTooltip.vue';
import GuildDonationsNotification from './components/GuildDonationsNotification.vue';
import GuildDonationsModal from './components/GuildDonationsModal.vue';
import NpcNotificationModal from './components/NpcNotificationModal.vue';
import DiscordWebhookDebugModal from './components/DiscordWebhookDebugModal.vue';
import { useWebhookDebugStore } from './stores/webhookDebug';

const authStore = useAuthStore();
const webhookDebugStore = useWebhookDebugStore();
const activeRaid = ref<RaidEventSummary | null>(null);
const router = useRouter();
const monitorStore = useMonitorStore();
const attentionStore = useAttentionStore();
const npcRespawnStore = useNpcRespawnStore();

// Dropdown state for nav menu
const activeDropdown = ref<string | null>(null);
let dropdownTimeout: ReturnType<typeof setTimeout> | null = null;

function openDropdown(name: string) {
  if (dropdownTimeout) {
    clearTimeout(dropdownTimeout);
    dropdownTimeout = null;
  }
  activeDropdown.value = name;
}

function closeDropdown(name: string) {
  if (dropdownTimeout) {
    clearTimeout(dropdownTimeout);
  }
  dropdownTimeout = setTimeout(() => {
    if (activeDropdown.value === name) {
      activeDropdown.value = null;
    }
  }, 300);
}

// Computed for NPC notifications
const npcNotifications = computed(() => npcRespawnStore.activeNotifications);

function handleDismissNpcNotifications(ids: string[]) {
  npcRespawnStore.dismissNotifications(ids);
}

const toasts = ref<{ id: number; title: string; message: string }[]>([]);
let toastId = 0;

function addToast(payload: { title: string; message: string }) {
  const id = ++toastId;
  toasts.value.push({ id, ...payload });
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 5000);
}

const loadingActiveRaid = ref(false);

function handleActiveRaidEvent() {
  if (primaryGuild.value) {
    loadActiveRaid(primaryGuild.value.id);
  }
}

const primaryGuild = computed(() => authStore.primaryGuild);

const guildNavLabel = computed(() => primaryGuild.value?.name ?? 'Guilds');

const guildNavTo = computed(() => {
  if (!authStore.isAuthenticated) {
    return { path: '/guilds' };
  }

  return primaryGuild.value
    ? { name: 'GuildDetail', params: { guildId: primaryGuild.value.id } }
    : { path: '/guilds' };
});

const canManageGuildSettings = computed(() => {
  const role = primaryGuild.value?.role;
  return role === 'LEADER' || role === 'OFFICER';
});

function loginWithGoogle() {
  window.location.href = '/api/auth/google';
}

function loginWithDiscord() {
  window.location.href = '/api/auth/discord';
}

function handleLootAssigned(event: CustomEvent<{ raidId: string; itemName?: string; looterName?: string }>) {
  const detail = event.detail;
  if (!detail) {
    return;
  }
  const itemName = detail.itemName ?? 'Unknown Item';
  const looterName = detail.looterName ?? 'Unknown Raider';
  addToast({
    title: 'Loot Assigned',
    message: `${itemName} assigned to ${looterName}`
  });
}

function handleLootUpdated(event: CustomEvent<{ title?: string; message?: string }>) {
  const detail = event.detail ?? {};
  addToast({
    title: detail.title ?? 'Loot Updated',
    message: detail.message ?? 'Loot entry updated successfully.'
  });
}

function handleRaidShareCopied(event: CustomEvent<{ raidName?: string }>) {
  const detail = event.detail ?? {};
  const raidName = detail.raidName ?? 'Raid';
  addToast({
    title: 'Link Copied',
    message: `${raidName} share link copied to clipboard.`
  });
}

function handleShowToast(event: CustomEvent<{ title?: string; message?: string }>) {
  const detail = event.detail ?? {};
  addToast({
    title: detail.title ?? 'Notice',
    message: detail.message ?? ''
  });
}

async function logout() {
  await authStore.logout();
}

const monitorIndicatorLabel = computed(() => {
  if (!monitorStore.activeSession) {
    return 'Continuous monitoring status';
  }
  const raidName =
    monitorStore.activeSession.raidName && monitorStore.activeSession.raidName.length > 0
      ? monitorStore.activeSession.raidName
      : 'current raid';
  if (monitorStore.hasPendingActions) {
    return `Loot actions pending for ${raidName}. Click to return to the loot tracker.`;
  }
  return `Continuous monitoring active for ${raidName}. Click to return to the loot tracker.`;
});

const monitorZoneVisible = computed(
  () => monitorStore.indicatorVisible && Boolean(monitorStore.activeSession?.isOwner) && !!monitorStore.lastZone
);

const monitorZoneTitle = computed(() => {
  if (!monitorStore.lastZone) {
    return 'Last zone detected while monitoring';
  }
  return `Last detected zone: ${monitorStore.lastZone}`;
});

function goToActiveMonitor() {
  const session = monitorStore.activeSession;
  if (!session) {
    return;
  }
  router.push({ name: 'RaidLoot', params: { raidId: session.raidId } });
}

function resolveViewKey(route: RouteLocationNormalized) {
  if (route.name === 'RaidLoot') {
    const raidId = Array.isArray(route.params.raidId)
      ? route.params.raidId[0]
      : (route.params.raidId as string | undefined);
    return `raid-loot-${raidId ?? 'unknown'}`;
  }
  return route.fullPath;
}

function handleLootActionsPending(_event: Event) {
  playLootAlertChime();
}

// Start NPC respawn monitoring for a guild
async function startNpcRespawnMonitoring(guildId: string) {
  try {
    // Fetch subscriptions and tracker data
    await Promise.all([
      npcRespawnStore.fetchRespawnTracker(guildId),
      npcRespawnStore.fetchSubscriptions(guildId)
    ]);
    // Start auto-refresh for live updates (checks notifications every second)
    npcRespawnStore.startAutoRefresh(guildId);
  } catch (err) {
    console.warn('Unable to start NPC respawn monitoring:', err);
  }
}

// Stop NPC respawn monitoring
function stopNpcRespawnMonitoring() {
  npcRespawnStore.stopAutoRefresh();
}

onMounted(async () => {
  await authStore.fetchCurrentUser();
  if (primaryGuild.value) {
    await loadActiveRaid(primaryGuild.value.id);
    // Start NPC respawn monitoring for notifications
    await startNpcRespawnMonitoring(primaryGuild.value.id);
    // Initialize webhook debug store for admins
    if (authStore.isAdmin) {
      await webhookDebugStore.initialize(primaryGuild.value.id);
    }
  }

  window.addEventListener('active-raid-updated', handleActiveRaidEvent);
  window.addEventListener('loot-assigned', handleLootAssigned as EventListener);
  window.addEventListener('loot-updated', handleLootUpdated as EventListener);
  window.addEventListener('loot-actions-pending', handleLootActionsPending as EventListener);
  window.addEventListener('raid-share-copied', handleRaidShareCopied as EventListener);
  window.addEventListener('show-toast', handleShowToast as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('active-raid-updated', handleActiveRaidEvent);
  window.removeEventListener('loot-assigned', handleLootAssigned as EventListener);
  window.removeEventListener('loot-updated', handleLootUpdated as EventListener);
  window.removeEventListener('loot-actions-pending', handleLootActionsPending as EventListener);
  window.removeEventListener('raid-share-copied', handleRaidShareCopied as EventListener);
  window.removeEventListener('show-toast', handleShowToast as EventListener);
  // Stop NPC respawn monitoring when app unmounts
  stopNpcRespawnMonitoring();
  // Cleanup webhook debug store
  webhookDebugStore.cleanup();
});

watch(
  () => primaryGuild.value?.id,
  async (guildId, oldGuildId) => {
    if (guildId) {
      await loadActiveRaid(guildId);
      // Start NPC respawn monitoring for the new guild
      if (guildId !== oldGuildId) {
        stopNpcRespawnMonitoring();
        await startNpcRespawnMonitoring(guildId);
        // Initialize webhook debug store for admins
        if (authStore.isAdmin) {
          webhookDebugStore.cleanup();
          await webhookDebugStore.initialize(guildId);
        }
      }
    } else {
      activeRaid.value = null;
      stopNpcRespawnMonitoring();
      webhookDebugStore.cleanup();
    }
  }
);

async function loadActiveRaid(guildId: string) {
  loadingActiveRaid.value = true;
  try {
    const response = await api.fetchRaidsForGuild(guildId);
    const active = response.raids
      .filter((raid) => hasRaidStarted(raid) && !hasRaidEnded(raid))
      .sort(
        (a, b) =>
          new Date(b.startedAt ?? b.startTime).getTime() -
          new Date(a.startedAt ?? a.startTime).getTime()
      )[0];

    activeRaid.value = active ?? null;
  } catch (error) {
    console.warn('Unable to fetch active raid indicator.', error);
    activeRaid.value = null;
  } finally {
    loadingActiveRaid.value = false;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'recently';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function hasRaidEnded(raid: RaidEventSummary) {
  if (!raid.endedAt) {
    return false;
  }
  return new Date(raid.endedAt).getTime() <= Date.now();
}

function hasRaidStarted(raid: RaidEventSummary) {
  if (!raid.startedAt) {
    return false;
  }
  return new Date(raid.startedAt).getTime() <= Date.now();
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #10141a;
  color: #f1f5f9;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  gap: 1rem;
  flex-wrap: wrap;
  position: relative;
  z-index: 10000;
}

.brand__title {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.08em;
  color: #f1f5f9;
  text-decoration: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.nav__item {
  position: relative;
}

.nav__item--has-dropdown .nav__link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.nav-alerts {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.nav-attention {
  display: flex;
  gap: 0.5rem;
}

.nav-attention__button {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.28), rgba(15, 23, 42, 0.85));
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.35);
}

.nav-attention__button::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 2px solid rgba(59, 130, 246, 0.35);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.nav-attention__button--active {
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.4);
}

.nav-attention__button--pulse::after {
  animation: navAttentionPulse 2.8s ease-in-out infinite;
  opacity: 1;
}

.nav-attention__button--lc::after {
  animation: navAttentionPulse 2.4s ease-in-out infinite;
  border-color: rgba(251, 191, 36, 0.45);
}

.nav-attention__button:hover,
.nav-attention__button:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.45);
}

.nav-attention__badge {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.nav-attention__icon {
  width: 18px;
  height: 18px;
}

.nav__link {
  color: #e2e8f0;
  text-decoration: none;
  font-weight: 500;
  padding: 0.5rem 0.85rem;
  border-radius: 0.5rem;
  transition: background 0.2s ease, color 0.2s ease, transform 0.1s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.nav__link:hover {
  background: rgba(59, 130, 246, 0.12);
  color: #38bdf8;
}

.nav__link.router-link-active {
  color: #38bdf8;
  background: rgba(59, 130, 246, 0.15);
}

.nav__link--no-click {
  cursor: default;
}

.nav__chevron {
  width: 14px;
  height: 14px;
  fill: currentColor;
  opacity: 0.6;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.nav__item:hover .nav__chevron {
  transform: rotate(180deg);
  opacity: 1;
}

.nav__dropdown {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 50%;
  transform: translateX(-50%);
  min-width: 180px;
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.5rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 1px rgba(148, 163, 184, 0.3);
  z-index: 10000;
}

.nav__dropdown::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: rgba(15, 23, 42, 0.98);
  border-left: 1px solid rgba(148, 163, 184, 0.2);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

/* Invisible hit area to bridge the gap between nav link and dropdown */
.nav__dropdown::after {
  content: '';
  position: absolute;
  top: -1rem;
  left: -1rem;
  right: -1rem;
  height: 1.5rem;
  pointer-events: auto;
}

.nav__dropdown-item {
  display: block;
  padding: 0.6rem 0.85rem;
  color: #e2e8f0;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 0.45rem;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  white-space: nowrap;
}

.nav__dropdown-item:hover {
  background: rgba(59, 130, 246, 0.18);
  color: #38bdf8;
  transform: translateX(3px);
}

.nav__dropdown-item.router-link-active {
  background: rgba(59, 130, 246, 0.22);
  color: #38bdf8;
}

/* Dropdown animation */
.dropdown-enter-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.96);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px) scale(0.98);
}

.nav-monitor {
  margin-left: 0.5rem;
}

.nav-monitor__button {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.18);
  color: #e0f2fe;
  padding: 0.35rem 0.95rem 0.35rem 0.5rem;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.nav-monitor__button:hover,
.nav-monitor__button:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(94, 234, 212, 0.7);
  background: rgba(56, 189, 248, 0.25);
  color: #f8fafc;
  outline: none;
}

.nav-monitor__pulse {
  position: relative;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: #38bdf8;
}

.nav-monitor__pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55);
  animation: navMonitorPulse 2.1s ease-out infinite;
}

.nav-monitor__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.1;
}

.nav-monitor__label {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
}

.nav-monitor__file {
  font-size: 0.85rem;
  font-weight: 600;
  color: inherit;
}

.nav-monitor--attention .nav-monitor__button {
  border-color: rgba(248, 113, 113, 0.55);
  background: rgba(248, 113, 113, 0.18);
  color: #fee2e2;
}

.nav-monitor--attention .nav-monitor__button:hover,
.nav-monitor--attention .nav-monitor__button:focus-visible {
  border-color: rgba(248, 113, 113, 0.75);
  background: rgba(248, 113, 113, 0.25);
  color: #fff;
}

.nav-monitor--attention .nav-monitor__pulse {
  background: #f87171;
}

.nav-monitor--attention .nav-monitor__pulse::after {
  box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.6);
  animation-duration: 1.5s;
}

@keyframes navMonitorPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55);
  }
  70% {
    box-shadow: 0 0 0 0.55rem rgba(56, 189, 248, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
  }
}

.nav-monitor--attention .nav-monitor__pulse::after {
  animation-name: navMonitorPulseAlert;
}

.nav-zone-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 0.5rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.45);
  color: #ede9fe;
  box-shadow: 0 8px 16px rgba(76, 29, 149, 0.25);
}

.nav-zone-pill__label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.8;
}

.nav-zone-pill__value {
  font-weight: 700;
  font-size: 0.95rem;
  white-space: nowrap;
}

@keyframes navMonitorPulseAlert {
  0% {
    box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.6);
  }
  70% {
    box-shadow: 0 0 0 0.6rem rgba(248, 113, 113, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(248, 113, 113, 0);
  }
}

@keyframes navAttentionPulse {
  0% {
    opacity: 0.25;
    transform: scale(0.85);
  }
  55% {
    opacity: 0.6;
    transform: scale(1.1);
  }
  100% {
    opacity: 0;
    transform: scale(0.85);
  }
}

.auth {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.auth__user {
  font-size: 0.95rem;
  color: #cbd5f5;
}

.auth__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 0.35rem;
  white-space: nowrap;
}

.auth__badge--admin {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

.auth__badge--guide {
  background: rgba(74, 222, 128, 0.2);
  border: 1px solid rgba(74, 222, 128, 0.5);
  color: #86efac;
}

.settings-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  transition: transform 0.12s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.settings-link svg {
  width: 1.1rem;
  height: 1.1rem;
}

.settings-link:hover,
.settings-link:focus {
  transform: translateY(-1px);
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(59, 130, 246, 0.2);
  color: #38bdf8;
}

.settings-link:focus {
  outline: 2px solid rgba(59, 130, 246, 0.45);
  outline-offset: 2px;
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

.btn.character-edit-button {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.45);
  color: #e0f2fe;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.55), inset 0 0 12px rgba(14, 165, 233, 0.2);
  backdrop-filter: blur(6px);
}

.btn.character-edit-button:hover {
  border-color: rgba(14, 165, 233, 0.8);
  color: #f8fafc;
  background: rgba(59, 130, 246, 0.25);
  box-shadow: 0 14px 26px rgba(59, 130, 246, 0.25), inset 0 0 18px rgba(14, 165, 233, 0.35);
}

.btn.character-edit-button:focus-visible {
  outline: 2px solid rgba(14, 165, 233, 0.7);
  outline-offset: 2px;
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

.btn--google {
  background: #ffffff;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn--google:hover {
  background: #f8fafc;
}

.btn--discord {
  background: #5865F2;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn--discord:hover {
  background: #4752c4;
}

.btn__icon {
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}

.app-content {
  padding: 2rem;
  flex: 1;
}

.active-raid-banner {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(14, 165, 233, 0.12));
  border-bottom: 1px solid rgba(34, 197, 94, 0.3);
  padding: 0.7rem 2rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.active-raid-banner__content {
  max-width: 960px;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.active-raid-banner__status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  color: #f8fafc;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
}

.active-raid-banner__status .label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.active-raid-banner__status strong {
  font-size: 1.05rem;
}

.muted {
  color: #cbd5f5;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(74, 222, 128, 0.9);
  box-shadow: 0 0 0 rgba(74, 222, 128, 0.4);
  animation: pulse 1.8s infinite;
}

.btn--accent {
  padding: 0.55rem 1.25rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.85), rgba(14, 165, 233, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  color: #0f172a;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.25);
  text-decoration: none;
}

.btn--accent:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.5);
}

@media (max-width: 1100px) {
  .app-header {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1rem;
  }

  .brand {
    flex: 1 1 100%;
  }

  .nav {
    order: 3;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
  }

  .nav__dropdown {
    left: 0;
    transform: none;
  }

  .nav__dropdown::before {
    left: 24px;
    transform: rotate(45deg);
  }

  .dropdown-enter-from,
  .dropdown-leave-to {
    transform: translateY(-8px) scale(0.96);
  }

  .nav-alerts {
    order: 4;
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }

  .nav-monitor {
    width: 100%;
    margin-left: 0;
  }

  .nav-monitor__button {
    width: 100%;
    justify-content: center;
  }

  .nav-zone-pill {
    width: 100%;
    justify-content: center;
    margin-left: 0;
  }

  .auth {
    order: 2;
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
}

@media (max-width: 768px) {
  .app-header {
    padding: 0.75rem 1.25rem;
  }

  .nav {
    justify-content: flex-start;
  }

  .auth {
    justify-content: space-between;
    align-items: center;
  }

  .auth__user {
    flex: 1 1 auto;
    text-align: left;
  }

  .auth .btn {
    flex: 1 1 auto;
    min-width: 180px;
  }

  .app-content {
    padding: 1.25rem;
  }

  .active-raid-banner {
    padding: 0.75rem 1.25rem;
  }

  .active-raid-banner__content {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .nav {
    overflow-x: auto;
    gap: 0.5rem;
    padding-bottom: 0.25rem;
  }

  .nav__link {
    flex: 0 0 auto;
  }

  .auth {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .auth__user {
    width: 100%;
    text-align: center;
  }

  .auth .btn {
    width: 100%;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
  }
}


.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 9999;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.toast {
  background: rgba(15, 23, 42, 0.95);
  border-left: 4px solid #38bdf8;
  padding: 0.85rem 1.1rem;
  min-width: 240px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.45);
  border-radius: 0.7rem;
}

.toast strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.toast p {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5f5;
}

</style>
