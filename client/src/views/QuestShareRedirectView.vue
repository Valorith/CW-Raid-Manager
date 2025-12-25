<template>
  <div class="quest-share-redirect">
    <GlobalLoadingSpinner v-if="loading" />
    <div v-else-if="error" class="quest-share-redirect__error">
      <h2>Unable to Load Quest</h2>
      <p>{{ error }}</p>
      <router-link to="/" class="btn btn--outline">Return Home</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { api } from '../services/api';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  const assignmentId = route.params.assignmentId as string;

  if (!assignmentId) {
    error.value = 'Invalid share link.';
    loading.value = false;
    return;
  }

  try {
    const details = await api.fetchQuestShareDetails(assignmentId);

    // Redirect to the full quest tracker view with the appropriate parameters
    router.replace({
      name: 'GuildQuestTracker',
      params: { guildId: details.guildId },
      query: {
        blueprintId: details.blueprintId,
        assignmentId: details.assignmentId
      }
    });
  } catch (err: any) {
    loading.value = false;
    if (err?.response?.status === 404) {
      error.value = 'This quest progress link is no longer valid.';
    } else if (err?.response?.status === 403) {
      error.value = 'You do not have permission to view this quest progress.';
    } else {
      error.value = 'Failed to load quest progress. Please try again.';
    }
  }
});
</script>

<style scoped>
.quest-share-redirect {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 120px);
  padding: 2rem;
}

.quest-share-redirect__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: rgba(226, 232, 240, 0.9);
}

.quest-share-redirect__spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(148, 163, 184, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.quest-share-redirect__error {
  text-align: center;
  max-width: 400px;
}

.quest-share-redirect__error h2 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  color: #f87171;
}

.quest-share-redirect__error p {
  margin: 0 0 1.5rem;
  color: rgba(226, 232, 240, 0.8);
}
</style>
