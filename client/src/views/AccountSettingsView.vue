<template>
  <section class="settings">
    <header class="settings__header">
      <h1>Account Settings</h1>
      <p class="muted">Customize how other players see your name across the app.</p>
    </header>

    <GlobalLoadingSpinner v-if="showLoading" />

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

      <section class="default-log">
        <div class="default-log__header">
          <h2>Default Log File</h2>
          <p class="muted small">
            When you select a log on the Loot page we can offer to reuse this file automatically.
          </p>
        </div>

        <p v-if="defaultLogFileName" class="default-log__current">
          Current default: <strong>{{ defaultLogFileName }}</strong>
        </p>
        <p v-else class="muted small">No default log file selected.</p>

        <p v-if="!supportsDefaultLog" class="alert alert--notice">
          Your browser doesn’t support storing a default log file. Use a Chromium-based browser to
          enable this feature.
        </p>
        <p v-else-if="defaultLogNeedsPermission" class="alert alert--warning">
          We need access to the saved file. Re-select it below to restore the permission.
        </p>

        <div class="default-log__actions">
          <button
            class="btn"
            type="button"
            :disabled="defaultLogSaving || !supportsDefaultLog"
            @click="chooseDefaultLogFile"
          >
            {{ defaultLogSaving ? 'Saving…' : defaultLogFileName ? 'Replace Log File' : 'Select Log File' }}
          </button>
          <button
            class="btn btn--outline"
            type="button"
            :disabled="defaultLogSaving || !defaultLogFileName"
            @click="clearDefaultLogFile"
          >
            Clear
          </button>
        </div>

        <p v-if="defaultLogMessage" class="muted small default-log__feedback">
          {{ defaultLogMessage }}
        </p>
        <p v-if="defaultLogError" class="form__error">{{ defaultLogError }}</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { api, type AccountProfile } from '../services/api';
import { useAuthStore } from '../stores/auth';
import {
  deleteDefaultLogHandle,
  getDefaultLogHandle,
  saveDefaultLogHandle
} from '../utils/defaultLogHandle';

const authStore = useAuthStore();

const loading = ref(true);
const showLoading = useMinimumLoading(loading);
const saving = ref(false);
const profile = ref<AccountProfile | null>(null);
const nickname = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const defaultLogSaving = ref(false);
const defaultLogMessage = ref('');
const defaultLogError = ref('');
const defaultLogHandleAvailable = ref(false);

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

const supportsDefaultLog = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof (window as any).showOpenFilePicker === 'function' &&
    typeof window.indexedDB !== 'undefined'
);

const defaultLogFileName = computed(() => profile.value?.defaultLogFileName ?? null);

const defaultLogNeedsPermission = computed(
  () =>
    Boolean(defaultLogFileName.value) &&
    !defaultLogHandleAvailable.value &&
    supportsDefaultLog.value
);

async function loadProfile() {
  loading.value = true;
  errorMessage.value = '';
  defaultLogMessage.value = '';
  defaultLogError.value = '';
  try {
    const result = await api.fetchAccountProfile();
    profile.value = result;
    nickname.value = result?.nickname ?? '';
    await refreshDefaultLogHandleState();
  } catch (error) {
    console.error('Failed to load account profile', error);
    errorMessage.value = 'Unable to load your account details. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function refreshDefaultLogHandleState() {
  if (!authStore.user || !supportsDefaultLog.value) {
    defaultLogHandleAvailable.value = false;
    return;
  }
  try {
    const handle = await getDefaultLogHandle(authStore.user.userId);
    if (!handle) {
      defaultLogHandleAvailable.value = false;
      return;
    }
    if (typeof handle.queryPermission === 'function') {
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission === 'denied') {
        defaultLogHandleAvailable.value = false;
        return;
      }
    }
    defaultLogHandleAvailable.value = true;
  } catch (error) {
    console.warn('Unable to inspect stored default log file handle.', error);
    defaultLogHandleAvailable.value = false;
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

async function chooseDefaultLogFile() {
  if (defaultLogSaving.value) {
    return;
  }
  if (!authStore.user) {
    defaultLogError.value = 'You must be signed in to configure a default log file.';
    return;
  }
  if (!supportsDefaultLog.value) {
    defaultLogError.value = 'Your browser does not support selecting a default log file.';
    return;
  }

  defaultLogSaving.value = true;
  defaultLogError.value = '';
  defaultLogMessage.value = '';

  try {
    const picker = (window as any).showOpenFilePicker as
      | ((options?: any) => Promise<FileSystemFileHandle[]>)
      | undefined;
    if (typeof picker !== 'function') {
      throw new Error('Default log selection is unavailable in this browser.');
    }

    const handles = await picker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'EverQuest Logs',
          accept: {
            'text/plain': ['.txt', '.log']
          }
        }
      ]
    });

    if (!Array.isArray(handles) || handles.length === 0) {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }

    const handle = handles[0];
    if (!handle) {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }

    if (typeof handle.queryPermission === 'function') {
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'read' });
      }
      if (permission !== 'granted') {
        defaultLogError.value = 'Read access to the selected log file was not granted.';
        return;
      }
    }

    await saveDefaultLogHandle(authStore.user.userId, handle);
    const updated = await api.updateAccountProfile({ defaultLogFileName: handle.name ?? null });
    if (profile.value) {
      profile.value = { ...profile.value, defaultLogFileName: updated.defaultLogFileName };
    } else {
      profile.value = updated;
    }
    defaultLogMessage.value = `Default log file set to ${handle.name}.`;
    defaultLogHandleAvailable.value = true;
    await refreshDefaultLogHandleState();
    await authStore.fetchCurrentUser();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }
    console.error('Failed to save default log file', error);
    defaultLogError.value = extractErrorMessage(
      error,
      'Unable to save your default log file. Please try again.'
    );
  } finally {
    defaultLogSaving.value = false;
  }
}

async function clearDefaultLogFile() {
  if (defaultLogSaving.value) {
    return;
  }
  if (!authStore.user) {
    defaultLogError.value = 'You must be signed in to update your default log file.';
    return;
  }

  defaultLogSaving.value = true;
  defaultLogError.value = '';
  defaultLogMessage.value = '';

  try {
    if (supportsDefaultLog.value) {
      try {
        await deleteDefaultLogHandle(authStore.user.userId);
      } catch (handleError) {
        console.warn('Failed to remove stored default log handle.', handleError);
      }
    }
    const updated = await api.updateAccountProfile({ defaultLogFileName: null });
    if (profile.value) {
      profile.value = { ...profile.value, defaultLogFileName: updated.defaultLogFileName };
    } else {
      profile.value = updated;
    }
    defaultLogHandleAvailable.value = false;
    defaultLogMessage.value = 'Default log file cleared.';
    await refreshDefaultLogHandleState();
    await authStore.fetchCurrentUser();
  } catch (error) {
    console.error('Failed to clear default log file', error);
    defaultLogError.value = extractErrorMessage(
      error,
      'Unable to clear your default log file. Please try again.'
    );
  } finally {
    defaultLogSaving.value = false;
  }
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

.alert--notice {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #bae6fd;
}

.alert--warning {
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fef08a;
}

.default-log {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.default-log__header h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.default-log__current {
  margin: 0;
  font-size: 0.95rem;
  color: #f8fafc;
}

.default-log__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.default-log__feedback {
  color: #bbf7d0;
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
