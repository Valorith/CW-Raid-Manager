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
        <p>Choose a provider to continue.</p>
        <div class="actions">
          <a class="btn btn--primary" :href="googleHref">Sign in with Google</a>
          <a class="btn btn--secondary" :href="discordHref">Sign in with Discord</a>
        </div>
      </template>
      <template v-else>
        <h1>Entering {{ APP_NAME }}...</h1>
        <p>Please wait while we finalize authentication.</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { APP_NAME } from '../constants/branding';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const needsSignIn = ref(false);

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
  }
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

.btn {
  border-radius: 8px;
  color: #f8fafc;
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
