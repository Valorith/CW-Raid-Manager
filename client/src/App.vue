<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <RouterLink to="/dashboard" class="brand__title">CW Raid Manager</RouterLink>
      </div>
      <nav class="nav">
        <RouterLink
          v-if="authStore.isAuthenticated"
          to="/dashboard"
          class="nav__link"
        >
          Dashboard
        </RouterLink>
        <RouterLink
          v-if="authStore.isAuthenticated"
          :to="guildNavTo"
          class="nav__link"
        >
          {{ guildNavLabel }}
        </RouterLink>
        <RouterLink
          v-if="authStore.isAuthenticated"
          to="/raids"
          class="nav__link"
        >
          Raids
        </RouterLink>
        <RouterLink v-if="authStore.isAdmin" to="/admin" class="nav__link">Admin</RouterLink>
      </nav>
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
          <button class="btn btn--outline" @click="logout">Log out</button>
        </template>
        <template v-else>
          <button class="btn" @click="loginWithGoogle">Sign in with Google</button>
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
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, RouterView } from 'vue-router';

import { useAuthStore } from './stores/auth';
import { api, type RaidEventSummary } from './services/api';

const authStore = useAuthStore();
const activeRaid = ref<RaidEventSummary | null>(null);
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

function loginWithGoogle() {
  window.location.href = '/api/auth/google';
}

async function logout() {
  await authStore.logout();
}

onMounted(async () => {
  await authStore.fetchCurrentUser();
  if (primaryGuild.value) {
    await loadActiveRaid(primaryGuild.value.id);
  }

  window.addEventListener('active-raid-updated', handleActiveRaidEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('active-raid-updated', handleActiveRaidEvent);
});

watch(
  () => primaryGuild.value?.id,
  async (guildId) => {
    if (guildId) {
      await loadActiveRaid(guildId);
    } else {
      activeRaid.value = null;
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
}

.brand__title {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.08em;
  color: #f1f5f9;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 1.25rem;
}

.nav__link {
  color: #e2e8f0;
  text-decoration: none;
  font-weight: 500;
}

.nav__link.router-link-active {
  color: #38bdf8;
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

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover {
  border-color: #38bdf8;
  color: #38bdf8;
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
</style>
