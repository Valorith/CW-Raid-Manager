<template>
  <section class="landing">
    <div class="hero">
      <h1>Coordinate EverQuest Raids with Confidence</h1>
      <p>
        CW Raid Manager keeps track of guild rosters, schedules raid targets, and records loot and
        attendance effortlessly.
      </p>
      <div class="actions">
        <button class="btn" @click="login">Sign in with Google</button>
        <a class="btn btn--outline" href="#features">Learn more</a>
      </div>
    </div>

    <div id="features" class="features">
      <article class="feature">
        <h2>Guild Roles & Permissions</h2>
        <p>
          Configure guild leadership, officers, and raid leaders with granular permissions for
          planning and attendance logging.
        </p>
      </article>
      <article class="feature">
        <h2>Attendance Imports</h2>
        <p>
          Upload EverQuest raid roster exports, verify entries, and save attendance snapshots in
          seconds.
        </p>
      </article>
      <article class="feature">
        <h2>Character Management</h2>
        <p>
          Track mains and alts across guilds, classes, and levels to plan optimized raid
          compositions.
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

function login() {
  window.location.href = '/api/auth/google';
}

onMounted(async () => {
  if (!authStore.user) {
    await authStore.fetchCurrentUser();
  }

  if (authStore.isAuthenticated) {
    router.replace('/dashboard');
  }
});
</script>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  gap: 4rem;
  align-items: center;
  text-align: center;
  padding-top: 2rem;
}

.hero {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  width: 100%;
}

.feature {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.75rem;
}
</style>
