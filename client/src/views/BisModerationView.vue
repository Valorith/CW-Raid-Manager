<template>
  <section class="bis-moderation">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>BiS Moderation</h1>
        <p class="muted">
          Ban abusive accounts from nominating or voting on the global BiS boards.
        </p>
      </div>
      <button type="button" class="btn btn--outline" :disabled="loading" @click="refresh">
        Refresh
      </button>
    </header>

    <div class="bis-moderation__grid">
      <article class="card bis-moderation__panel">
        <header class="card__header">
          <div>
            <h2>User Search</h2>
            <span class="muted small">Search by display name, nickname, or email</span>
          </div>
        </header>

        <input
          v-model="searchQuery"
          type="search"
          class="input input--search"
          placeholder="Search users"
        />

        <p v-if="searchLoading" class="muted">Searching…</p>
        <p v-else-if="searchQuery.trim().length >= 2 && searchResults.length === 0" class="muted">
          No users found.
        </p>

        <div v-if="selectedUser" class="bis-moderation__composer">
          <div class="bis-moderation__selected-user">
            <strong>{{ selectedUser.displayName }}</strong>
            <span class="muted">{{ selectedUser.email }}</span>
          </div>

          <label class="bis-moderation__field">
            <span>Reason</span>
            <textarea
              v-model="banReason"
              rows="3"
              placeholder="Optional moderation note"
            ></textarea>
          </label>

          <label class="bis-moderation__field">
            <span>Duration</span>
            <select v-model="banDuration">
              <option value="permanent">Permanent</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </label>

          <button
            type="button"
            class="btn btn--danger"
            :disabled="banSubmitting"
            @click="submitBan"
          >
            {{ banSubmitting ? 'Saving…' : 'Ban from BiS' }}
          </button>
        </div>

        <ul v-if="searchResults.length > 0" class="bis-moderation__user-list">
          <li v-for="user in searchResults" :key="user.id" class="bis-moderation__user-item">
            <button type="button" class="bis-moderation__user-button" @click="selectUser(user)">
              <div>
                <strong>{{ user.displayName }}</strong>
                <p class="muted small">{{ user.email }}</p>
              </div>
              <span v-if="user.activeBan" class="bis-moderation__active-ban">Banned</span>
            </button>
          </li>
        </ul>
      </article>

      <article class="card bis-moderation__panel">
        <header class="card__header">
          <div>
            <h2>Active Bans</h2>
            <span class="muted small">{{ bans.length }} active</span>
          </div>
        </header>

        <p v-if="loading" class="muted">Loading bans…</p>
        <p v-else-if="bans.length === 0" class="muted">No active BiS bans.</p>

        <ul v-else class="bis-moderation__ban-list">
          <li v-for="ban in bans" :key="ban.id" class="bis-moderation__ban-item">
            <div>
              <strong>{{ ban.user.displayName }}</strong>
              <p class="muted small">{{ ban.user.email }}</p>
              <p class="muted small">
                {{ ban.reason || 'No reason provided' }}
                <template v-if="ban.expiresAt">
                  · Expires {{ formatDateTime(ban.expiresAt) }}
                </template>
                <template v-else> · Permanent </template>
              </p>
            </div>
            <button
              type="button"
              class="btn btn--outline btn--small"
              :disabled="revokingBanId === ban.id"
              @click="revokeBan(ban.id)"
            >
              {{ revokingBanId === ban.id ? 'Revoking…' : 'Unban' }}
            </button>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

import { api, type BisBan, type BisModerationUserResult } from '../services/api';

const loading = ref(true);
const searchQuery = ref('');
const searchResults = ref<BisModerationUserResult[]>([]);
const searchLoading = ref(false);
const selectedUser = ref<BisModerationUserResult | null>(null);
const banReason = ref('');
const banDuration = ref<'permanent' | '7d' | '30d'>('permanent');
const banSubmitting = ref(false);
const bans = ref<BisBan[]>([]);
const revokingBanId = ref<string | null>(null);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

async function refresh() {
  loading.value = true;
  try {
    bans.value = await api.fetchBisBans();
  } finally {
    loading.value = false;
  }
}

function selectUser(user: BisModerationUserResult) {
  selectedUser.value = user;
  banReason.value = user.activeBan?.reason ?? '';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function buildExpiry(): string | null {
  const now = new Date();
  if (banDuration.value === '7d') {
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  }
  if (banDuration.value === '30d') {
    now.setDate(now.getDate() + 30);
    return now.toISOString();
  }
  return null;
}

async function submitBan() {
  if (!selectedUser.value) {
    return;
  }

  banSubmitting.value = true;
  try {
    await api.createBisBan({
      userId: selectedUser.value.id,
      reason: banReason.value.trim() || null,
      expiresAt: buildExpiry()
    });
    await refresh();
    if (searchQuery.value.trim().length >= 2) {
      searchResults.value = await api.searchBisModerationUsers(searchQuery.value.trim());
    }
  } finally {
    banSubmitting.value = false;
  }
}

async function revokeBan(banId: string) {
  revokingBanId.value = banId;
  try {
    await api.revokeBisBan(banId);
    await refresh();
    if (searchQuery.value.trim().length >= 2) {
      searchResults.value = await api.searchBisModerationUsers(searchQuery.value.trim());
    }
  } finally {
    revokingBanId.value = null;
  }
}

watch(
  searchQuery,
  (value) => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      searchResults.value = [];
      searchLoading.value = false;
      return;
    }

    searchLoading.value = true;
    searchDebounce = window.setTimeout(async () => {
      try {
        searchResults.value = await api.searchBisModerationUsers(trimmed);
      } finally {
        searchLoading.value = false;
      }
    }, 250);
  },
  { immediate: true }
);

refresh();
</script>

<style scoped>
.bis-moderation {
  --bis-panel: linear-gradient(180deg, rgba(22, 22, 22, 0.985), rgba(8, 8, 8, 0.995));
  --bis-panel-soft: linear-gradient(180deg, rgba(28, 28, 28, 0.985), rgba(12, 12, 12, 0.995));
  --bis-border: rgba(80, 80, 80, 0.8);
  --bis-border-soft: rgba(96, 96, 96, 0.32);
  --bis-text: #f5f0e6;
  --bis-muted: #b5aea2;
  --bis-accent: #d0a86a;
  min-height: calc(100vh - 6rem);
  color: var(--bis-text);
}

.bis-moderation :deep(.section-header) {
  margin-bottom: 1.25rem;
}

.bis-moderation :deep(.section-header__titles h1) {
  color: #fff7eb;
}

.bis-moderation :deep(.muted),
.bis-moderation :deep(.small) {
  color: var(--bis-muted);
}

.bis-moderation__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.15rem;
}

.bis-moderation__panel {
  min-height: 22rem;
  background: var(--bis-panel);
  border: 1px solid var(--bis-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(255, 255, 255, 0.015),
    0 24px 60px rgba(0, 0, 0, 0.42);
}

.bis-moderation :deep(.card__header h2) {
  color: #fff7eb;
}

.bis-moderation :deep(.input),
.bis-moderation__field textarea,
.bis-moderation__field select {
  border: 1px solid rgba(72, 72, 72, 0.9);
  background: linear-gradient(180deg, rgba(10, 10, 10, 0.985), rgba(3, 3, 3, 0.995));
  color: var(--bis-text);
  box-shadow: none;
}

.bis-moderation :deep(.input::placeholder),
.bis-moderation__field textarea::placeholder {
  color: #7f786d;
}

.bis-moderation :deep(.input:focus),
.bis-moderation__field textarea:focus,
.bis-moderation__field select:focus {
  outline: none;
  border-color: rgba(208, 168, 106, 0.72);
  box-shadow: 0 0 0 3px rgba(208, 168, 106, 0.12);
}

.bis-moderation__user-list,
.bis-moderation__ban-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: grid;
  gap: 0.75rem;
}

.bis-moderation__user-button,
.bis-moderation__ban-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(58, 58, 58, 0.88);
  background: var(--bis-panel-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.bis-moderation__user-button {
  cursor: pointer;
  text-align: left;
  transition:
    border-color 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease,
    background 120ms ease;
}

.bis-moderation__user-button:hover,
.bis-moderation__user-button:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: rgba(208, 168, 106, 0.52);
  background: linear-gradient(180deg, rgba(33, 33, 33, 0.985), rgba(15, 15, 15, 0.995));
  box-shadow:
    0 0 0 1px rgba(208, 168, 106, 0.12),
    0 12px 24px rgba(0, 0, 0, 0.2);
}

.bis-moderation__active-ban {
  color: #f0b1b1;
  font-size: 0.8rem;
  font-weight: 700;
}

.bis-moderation__composer {
  display: grid;
  gap: 0.85rem;
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 16px;
  background: var(--bis-panel-soft);
  border: 1px solid var(--bis-border-soft);
}

.bis-moderation__field {
  display: grid;
  gap: 0.4rem;
}

.bis-moderation__field span {
  color: #cec6ba;
}

.bis-moderation__field textarea,
.bis-moderation__field select {
  width: 100%;
}

.bis-moderation__selected-user strong {
  color: #fff7eb;
}

.bis-moderation :deep(.btn--outline) {
  border-color: rgba(84, 84, 84, 0.88);
  color: var(--bis-text);
  background: linear-gradient(180deg, rgba(24, 24, 24, 0.985), rgba(11, 11, 11, 0.995));
}

.bis-moderation :deep(.btn--outline:hover:not(:disabled)) {
  border-color: rgba(208, 168, 106, 0.62);
  color: #fff7eb;
}

.bis-moderation :deep(.btn--danger) {
  background: linear-gradient(180deg, rgba(119, 45, 45, 0.96), rgba(76, 27, 27, 0.99));
  border: 1px solid rgba(175, 89, 89, 0.7);
  color: #fff0f0;
}

.bis-moderation :deep(.btn--danger:hover:not(:disabled)) {
  box-shadow: 0 10px 24px rgba(83, 27, 27, 0.28);
}

.bis-moderation :deep(.btn:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 3px rgba(208, 168, 106, 0.12);
}

@media (max-width: 960px) {
  .bis-moderation__grid {
    grid-template-columns: 1fr;
  }
}
</style>
