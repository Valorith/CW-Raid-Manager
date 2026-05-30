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
          class="passkey-autofill-input"
          autocomplete="username webauthn"
          aria-hidden="true"
          tabindex="-1"
        />
        <div class="actions actions--auth">
          <button
            class="btn btn--primary btn--passkey"
            :disabled="passkeySignInBusy"
            @click="handlePasskeySignIn"
          >
            <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="8" cy="15" r="4" stroke-width="2" />
              <path d="M11 12 21 2" stroke-width="2" stroke-linecap="round" />
              <path
                d="m16 7 2 2 3-3"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ passkeySignInBusy ? 'Opening passkey...' : 'Sign in with passkey' }}
          </button>
          <div class="provider-actions">
            <a class="btn btn--secondary" :href="googleHref">Sign in with Google</a>
            <a class="btn btn--secondary" :href="discordHref">Sign in with Discord</a>
          </div>
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
const passkeySignInBusy = ref(false);
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
  if ((!useBrowserAutofill && passkeySignInBusy.value) || !supportsPasskeys()) {
    return;
  }

  if (!useBrowserAutofill) {
    passkeySignInBusy.value = true;
  }
  passkeyMessage.value = '';
  try {
    await authenticateWithPasskey({
      useBrowserAutofill,
      verifyBrowserAutofillInput: useBrowserAutofill
    });
    await authStore.fetchCurrentUser();
    if (authStore.isAuthenticated) {
      router.replace(redirectPath.value || '/dashboard');
    }
  } catch (error) {
    if (!isPasskeyCancel(error)) {
      passkeyMessage.value = getPasskeyErrorMessage(error, 'Unable to sign in with passkey.');
    }
  } finally {
    if (!useBrowserAutofill) {
      passkeySignInBusy.value = false;
    }
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
    const redirect = redirectPath.value || '/dashboard';
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

.actions--auth {
  flex-direction: column;
  align-items: center;
}

.provider-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.passkey-autofill-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.passkey-message {
  margin: 1rem 0 0;
  color: #fecaca;
}

.btn {
  align-items: center;
  border: 0;
  border-radius: 8px;
  color: #f8fafc;
  cursor: pointer;
  display: inline-flex;
  gap: 0.5rem;
  justify-content: center;
  font-weight: 700;
  line-height: 1;
  padding: 0.75rem 1rem;
  text-decoration: none;
}

.btn--primary {
  background: #2563eb;
}

.btn--passkey {
  min-width: min(100%, 18rem);
}

.btn--secondary {
  background: rgba(51, 65, 85, 0.9);
}

.btn__icon {
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}
</style>
