<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <RouterLink to="/dashboard" class="brand__title">CW Raid Manager</RouterLink>
      </div>
      <nav class="nav">
        <RouterLink to="/dashboard" class="nav__link">Dashboard</RouterLink>
        <RouterLink :to="guildNavTo" class="nav__link">{{ guildNavLabel }}</RouterLink>
        <RouterLink to="/raids" class="nav__link">Raids</RouterLink>
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
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';

import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

const primaryGuild = computed(() => authStore.primaryGuild);

const guildNavLabel = computed(() => primaryGuild.value?.name ?? 'Guilds');

const guildNavTo = computed(() =>
  primaryGuild.value
    ? { name: 'GuildDetail', params: { guildId: primaryGuild.value.id } }
    : { path: '/guilds' }
);

function loginWithGoogle() {
  window.location.href = '/api/auth/google';
}

async function logout() {
  await authStore.logout();
}

onMounted(async () => {
  await authStore.fetchCurrentUser();
});
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
</style>
