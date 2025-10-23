<template>
  <section class="settings">
    <header class="settings__header">
      <h1>Account Settings</h1>
      <p class="muted">Customize how other players see your name across the app.</p>
    </header>

    <div v-if="loading" class="card card--center">
      <p class="muted">Loading your profile…</p>
    </div>

    <div v-else-if="!profile" class="card card--center">
      <p class="muted">We couldn’t load your account details. Please reload and try again.</p>
    </div>

    <div v-else class="card settings__content">
      <form class="form" @submit.prevent="saveNickname">
        <div class="form__field">
          <label for="nickname">Nickname</label>
          <input
            id="nickname"
            v-model="nickname"
            type="text"
            maxlength="40"
            placeholder="Optional nickname"
          />
          <p class="hint muted">2–40 characters. Leave blank to fall back to your account name.</p>
          <p v-if="nicknameValidationMessage" class="form__error">{{ nicknameValidationMessage }}</p>
        </div>

        <div class="preview">
          <h2>Preview</h2>
          <p class="preview__name">{{ previewName }}</p>
          <p class="muted small">
            This is how your name will appear to guild members, raid leaders, and across attendance logs.
          </p>
        </div>

        <div class="reference">
          <h3 class="reference__title">Account Name</h3>
          <p class="reference__value">{{ profile.displayName }}</p>
          <p class="muted small">Provided by your sign-in provider. This value is read-only.</p>
        </div>

        <div v-if="errorMessage" class="alert alert--error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="alert alert--success">{{ successMessage }}</div>

        <div class="actions">
          <button
            class="btn btn--outline"
            type="button"
            :disabled="saving || !isDirty"
            @click="resetNickname"
          >
            Reset
          </button>
          <button class="btn" type="submit" :disabled="saving || !isDirty || !isNicknameValid">
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { api, type AccountProfile } from '../services/api';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

const loading = ref(true);
const saving = ref(false);
const profile = ref<AccountProfile | null>(null);
const nickname = ref('');
const errorMessage = ref('');
const successMessage = ref('');

const previewName = computed(() => {
  const trimmed = nickname.value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  if (profile.value?.nickname) {
    return profile.value.nickname;
  }
  return authStore.preferredName ?? profile.value?.displayName ?? '';
});

const nicknameValidationMessage = computed(() => {
  const trimmed = nickname.value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length < 2) {
    return 'Nickname must be at least 2 characters.';
  }
  return '';
});

const isNicknameValid = computed(() => nicknameValidationMessage.value.length === 0);

const isDirty = computed(() => nickname.value !== (profile.value?.nickname ?? ''));

async function loadProfile() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await api.fetchAccountProfile();
    profile.value = result;
    nickname.value = result?.nickname ?? '';
  } catch (error) {
    console.error('Failed to load account profile', error);
    errorMessage.value = 'Unable to load your account details. Please try again.';
  } finally {
    loading.value = false;
  }
}

function resetNickname() {
  if (!profile.value) {
    return;
  }
  nickname.value = profile.value.nickname ?? '';
  successMessage.value = '';
  errorMessage.value = '';
}

watch(nickname, () => {
  successMessage.value = '';
  errorMessage.value = '';
});

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    if ('response' in error && typeof (error as any).response === 'object') {
      const response = (error as { response?: { data?: unknown } }).response;
      const data = response?.data;
      if (typeof data === 'object' && data !== null) {
        if ('message' in data && typeof (data as { message?: unknown }).message === 'string') {
          return (data as { message: string }).message;
        }
        if ('error' in data && typeof (data as { error?: unknown }).error === 'string') {
          return (data as { error: string }).error as string;
        }
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
  }
  return fallback;
}

async function saveNickname() {
  if (!profile.value || saving.value || !isDirty.value) {
    return;
  }

  saving.value = true;
  successMessage.value = '';
  errorMessage.value = '';

  try {
    const payloadNickname = nickname.value.trim();
    const updated = await api.updateAccountProfile({
      nickname: payloadNickname.length > 0 ? payloadNickname : null
    });
    profile.value = updated;
    nickname.value = updated.nickname ?? '';
    successMessage.value = 'Account settings saved.';
    await authStore.fetchCurrentUser();
  } catch (error) {
    errorMessage.value = extractErrorMessage(
      error,
      'Unable to save your account settings right now. Please try again.'
    );
  } finally {
    saving.value = false;
  }
}

onMounted(loadProfile);
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.settings__header h1 {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  padding: 2rem;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.45);
}

.card--center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
}

.settings__content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.form__field label {
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.form__field input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.6rem;
  padding: 0.65rem 0.85rem;
  color: #f8fafc;
}

.hint {
  font-size: 0.85rem;
}

.form__error {
  margin: 0;
  font-size: 0.85rem;
  color: #fecaca;
}

.preview,
.reference {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview h2,
.reference__title {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.preview__name,
.reference__value {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.95rem;
}

.alert--error {
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.alert--success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #bbf7d0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.85rem;
}
</style>
