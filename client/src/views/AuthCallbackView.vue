<template>
  <section class="auth-callback">
    <div class="card">
      <h1>Signing you in…</h1>
      <p>Please wait while we finalize authentication.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

onMounted(async () => {
  await authStore.fetchCurrentUser();
  if (authStore.isAuthenticated) {
    const redirect = (route.query.redirect as string) ?? '/';
    router.replace(redirect);
  } else {
    router.replace('/');
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
  border-radius: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  text-align: center;
}
</style>
