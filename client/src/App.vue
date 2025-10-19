<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand__title">CW Raid Manager</span>
      </div>
      <nav class="nav">
        <RouterLink to="/dashboard" class="nav__link">Dashboard</RouterLink>
        <RouterLink to="/guilds" class="nav__link">Guilds</RouterLink>
        <RouterLink to="/raids" class="nav__link">Raids</RouterLink>
      </nav>
      <div class="auth">
        <template v-if="authStore.isAuthenticated">
          <span class="auth__user">Hi, {{ authStore.user?.displayName }}</span>
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
import { onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';

import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

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
