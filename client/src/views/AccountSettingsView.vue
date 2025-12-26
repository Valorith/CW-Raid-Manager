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

      <section class="connected-accounts">
        <div class="connected-accounts__header">
          <h2>Connected Accounts</h2>
          <p class="muted small">
            Link additional sign-in providers to your account. You can then sign in with any linked
            provider.
          </p>
        </div>

        <div v-if="linkedProvidersLoading" class="connected-accounts__loading">
          <span class="muted">Loading...</span>
        </div>

        <div v-else class="connected-accounts__providers">
          <div class="provider-card">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--google">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">Google</span>
                <span
                  class="provider-card__status"
                  :class="linkedProviders.google ? 'provider-card__status--linked' : ''"
                >
                  {{ linkedProviders.google ? 'Connected' : 'Not connected' }}
                </span>
              </div>
            </div>
            <button
              v-if="linkedProviders.google"
              class="btn btn--outline btn--small"
              :disabled="unlinkingGoogle || !canUnlinkGoogle"
              :title="canUnlinkGoogle ? '' : 'You must have at least one login method'"
              @click="handleUnlinkGoogle"
            >
              {{ unlinkingGoogle ? 'Unlinking...' : 'Unlink' }}
            </button>
            <a v-else href="/api/auth/google/link" class="btn btn--small">Link Google</a>
          </div>

          <div class="provider-card">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--discord">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">Discord</span>
                <span
                  class="provider-card__status"
                  :class="linkedProviders.discord ? 'provider-card__status--linked' : ''"
                >
                  {{ linkedProviders.discord ? 'Connected' : 'Not connected' }}
                </span>
              </div>
            </div>
            <button
              v-if="linkedProviders.discord"
              class="btn btn--outline btn--small"
              :disabled="unlinkingDiscord || !canUnlinkDiscord"
              :title="canUnlinkDiscord ? '' : 'You must have at least one login method'"
              @click="handleUnlinkDiscord"
            >
              {{ unlinkingDiscord ? 'Unlinking...' : 'Unlink' }}
            </button>
            <a v-else href="/api/auth/discord/link" class="btn btn--small">Link Discord</a>
          </div>
        </div>

        <div v-if="linkedProvidersError" class="alert alert--error">{{ linkedProvidersError }}</div>
        <div v-if="linkedProvidersSuccess" class="alert alert--success">
          {{ linkedProvidersSuccess }}
        </div>
      </section>

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
import { useRoute, useRouter } from 'vue-router';

import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { api, type AccountProfile, type LinkedProviders } from '../services/api';
import { useAuthStore } from '../stores/auth';
import {
  deleteDefaultLogHandle,
  getDefaultLogHandle,
  saveDefaultLogHandle
} from '../utils/defaultLogHandle';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

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

// Connected accounts state
const linkedProviders = ref<LinkedProviders>({ google: false, discord: false });
const linkedProvidersLoading = ref(true);
const linkedProvidersError = ref('');
const linkedProvidersSuccess = ref('');
const unlinkingGoogle = ref(false);
const unlinkingDiscord = ref(false);

const canUnlinkGoogle = computed(() => linkedProviders.value.discord);
const canUnlinkDiscord = computed(() => linkedProviders.value.google);

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

async function loadLinkedProviders() {
  linkedProvidersLoading.value = true;
  linkedProvidersError.value = '';
  try {
    linkedProviders.value = await api.fetchLinkedProviders();
  } catch (error) {
    console.error('Failed to load linked providers', error);
    linkedProvidersError.value = 'Unable to load connected accounts.';
  } finally {
    linkedProvidersLoading.value = false;
  }
}

async function handleUnlinkGoogle() {
  if (unlinkingGoogle.value || !canUnlinkGoogle.value) return;

  unlinkingGoogle.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    linkedProviders.value = await api.unlinkGoogle();
    linkedProvidersSuccess.value = 'Google account unlinked successfully.';
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to unlink Google account.');
  } finally {
    unlinkingGoogle.value = false;
  }
}

async function handleUnlinkDiscord() {
  if (unlinkingDiscord.value || !canUnlinkDiscord.value) return;

  unlinkingDiscord.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    linkedProviders.value = await api.unlinkDiscord();
    linkedProvidersSuccess.value = 'Discord account unlinked successfully.';
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to unlink Discord account.');
  } finally {
    unlinkingDiscord.value = false;
  }
}

function handleUrlParams() {
  const linked = route.query.linked as string | undefined;
  const error = route.query.error as string | undefined;

  if (linked) {
    const providerName = linked === 'google' ? 'Google' : linked === 'discord' ? 'Discord' : linked;
    linkedProvidersSuccess.value = `${providerName} account linked successfully.`;
    // Clear the query params
    router.replace({ path: route.path, query: {} });
  } else if (error) {
    linkedProvidersError.value = error;
    router.replace({ path: route.path, query: {} });
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

onMounted(() => {
  handleUrlParams();
  loadProfile();
  loadLinkedProviders();
});
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

.connected-accounts {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.connected-accounts__header h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.connected-accounts__loading {
  padding: 1rem 0;
}

.connected-accounts__providers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
}

.provider-card__info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.provider-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
}

.provider-card__icon--google {
  background: rgba(66, 133, 244, 0.15);
  color: #4285f4;
}

.provider-card__icon--discord {
  background: rgba(88, 101, 242, 0.15);
  color: #5865f2;
}

.provider-card__details {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.provider-card__name {
  font-weight: 600;
  color: #f8fafc;
}

.provider-card__status {
  font-size: 0.85rem;
  color: #94a3b8;
}

.provider-card__status--linked {
  color: #4ade80;
}

.btn--small {
  padding: 0.4rem 0.85rem;
  font-size: 0.85rem;
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
