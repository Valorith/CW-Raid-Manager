<template>
  <section class="auth-callback">
    <div class="card">
      <template v-if="errorMessage">
        <h1>Sign-in did not finish</h1>
        <p>{{ errorMessage }}</p>
        <div class="actions">
          <a class="btn btn--primary" :href="retryHref">Try again</a>
          <RouterLink class="btn btn--secondary" to="/">Return home</RouterLink>
        </div>
      </template>
      <template v-else-if="needsSignIn">
        <h1>Sign in to {{ APP_NAME }}</h1>
        <p>Use a passkey for the fastest sign-in, or choose a linked provider.</p>
        <input
          ref="passkeyAutofillInputRef"
          class="passkey-input"
          autocomplete="username webauthn"
          placeholder="Passkey"
          aria-label="Passkey sign-in"
        />
        <div class="actions">
          <button class="btn btn--primary" :disabled="passkeyBusy" @click="handlePasskeySignIn">
            {{ passkeyBusy ? 'Checking...' : 'Sign in with passkey' }}
          </button>
          <a class="btn btn--primary" :href="googleHref">Sign in with Google</a>
          <a class="btn btn--secondary" :href="discordHref">Sign in with Discord</a>
        </div>
        <p v-if="passkeyMessage" class="passkey-message">{{ passkeyMessage }}</p>
      </template>
      <template v-else>
        <h1>Entering {{ APP_NAME }}...</h1>
        <p>Please wait while we finalize authentication.</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { APP_NAME } from '../constants/branding';
import { useAuthStore } from '../stores/auth';
import {
  authenticateWithPasskey,
  cancelActivePasskeyPrompt,
  getPasskeyErrorMessage,
  isPasskeyCancel,
  supportsPasskeyAutofill,
  supportsPasskeys
} from '../composables/usePasskeyAuth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const needsSignIn = ref(false);
const passkeyBusy = ref(false);
const passkeyMessage = ref('');
const passkeyAutofillInputRef = ref<HTMLInputElement | null>(null);

const errorMessage = computed(() =>
  typeof route.query.error === 'string' ? route.query.error : ''
);
const redirectPath = computed(() =>
  typeof route.query.redirect === 'string' &&
  route.query.redirect.startsWith('/') &&
  !route.query.redirect.startsWith('//')
    ? route.query.redirect
    : ''
);
const loginQuery = computed(() =>
  redirectPath.value ? `?redirect=${encodeURIComponent(redirectPath.value)}` : ''
);
const googleHref = computed(() => `/api/auth/google${loginQuery.value}`);
const discordHref = computed(() => `/api/auth/discord${loginQuery.value}`);
const retryHref = computed(() => {
  const provider = typeof route.query.provider === 'string' ? route.query.provider : 'google';
  return provider === 'discord' ? discordHref.value : googleHref.value;
});

async function completePasskeySignIn(useBrowserAutofill: boolean) {
  if (passkeyBusy.value || !supportsPasskeys()) {
    return;
  }

  passkeyBusy.value = true;
  passkeyMessage.value = '';
  try {
    await authenticateWithPasskey({
      useBrowserAutofill,
      verifyBrowserAutofillInput: useBrowserAutofill
    });
    await authStore.fetchCurrentUser();
    if (authStore.isAuthenticated) {
      router.replace(redirectPath.value || '/');
    }
  } catch (error) {
    if (!isPasskeyCancel(error)) {
      passkeyMessage.value = getPasskeyErrorMessage(error, 'Unable to sign in with passkey.');
    }
  } finally {
    passkeyBusy.value = false;
  }
}

async function startAutofillPasskeySignIn() {
  await nextTick();
  if (!passkeyAutofillInputRef.value || !(await supportsPasskeyAutofill())) {
    return;
  }
  completePasskeySignIn(true);
}

function handlePasskeySignIn() {
  completePasskeySignIn(false);
}

onMounted(async () => {
  if (errorMessage.value) {
    return;
  }

  await authStore.fetchCurrentUser();
  if (authStore.isAuthenticated) {
    const redirect = redirectPath.value || '/';
    router.replace(redirect);
  } else {
    needsSignIn.value = true;
    startAutofillPasskeySignIn();
  }
});

onBeforeUnmount(() => {
  cancelActivePasskeyPrompt();
});
</script>

<style scoped>
.auth-callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.card {
  padding: 2rem 3rem;
  background: rgba(15, 23, 42, 0.9);
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  text-align: center;
  max-width: min(90vw, 32rem);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.passkey-input {
  width: min(100%, 24rem);
  margin: 0 auto 1rem;
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(45, 212, 191, 0.45);
  border-radius: 0.75rem;
  color: #f8fafc;
  padding: 0.75rem 0.9rem;
}

.passkey-message {
  margin: 1rem 0 0;
  color: #fecaca;
}

.btn {
  border: 0;
  border-radius: 8px;
  color: #f8fafc;
  cursor: pointer;
  font-weight: 700;
  line-height: 1;
  padding: 0.75rem 1rem;
  text-decoration: none;
}

.btn--primary {
  background: #2563eb;
}

.btn--secondary {
  background: rgba(51, 65, 85, 0.9);
}
</style>
