<template>
  <section v-if="guild" class="guild-settings">
    <header class="section-header">
      <div>
        <h1>Guild Settings</h1>
        <p class="muted">Manage description and default raid times for {{ guild.name }}.</p>
      </div>
      <div class="header-actions">
        <RouterLink class="btn btn--outline" :to="{ name: 'GuildDetail', params: { guildId } }">
          ← Back to Guild
        </RouterLink>
      </div>
    </header>

    <form class="settings-form" @submit.prevent="saveSettings">
      <label class="form__field">
        <span>Guild Description</span>
        <textarea v-model="form.description" rows="4" maxlength="500" placeholder="Describe your guild"></textarea>
      </label>

      <div class="grid">
        <label class="form__field">
          <span>Default Raid Start Time</span>
          <input v-model="form.defaultRaidStartTime" type="time" />
          <small class="muted">Applied to the raid creation picker when scheduling future raids.</small>
        </label>
        <label class="form__field">
          <span>Default Raid End Time</span>
          <input v-model="form.defaultRaidEndTime" type="time" />
          <small class="muted">Used to prefill raid end times for your team.</small>
        </label>
      </div>

      <footer class="form__actions">
        <button class="btn btn--outline" type="button" :disabled="saving" @click="resetForm">Reset</button>
        <button class="btn" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </footer>
    </form>
  </section>
  <p v-else class="muted">Loading guild settings…</p>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { GuildDetail } from '../services/api';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const guildId = route.params.guildId as string;
const guild = ref<GuildDetail | null>(null);
const saving = ref(false);

const form = reactive({
  description: '',
  defaultRaidStartTime: '',
  defaultRaidEndTime: ''
});

const authStore = useAuthStore();

onMounted(async () => {
  await loadGuild();
});

watch(
  () => authStore.pendingApplication,
  () => {
    if (guild.value) {
      const role = guild.value.permissions?.userRole;
      if (!role || (role !== 'LEADER' && role !== 'OFFICER')) {
        router.replace({ name: 'GuildDetail', params: { guildId } });
      }
    }
  }
);

async function loadGuild() {
  guild.value = await api.fetchGuildDetail(guildId);
  const role = guild.value.permissions?.userRole;
  if (!role || (role !== 'LEADER' && role !== 'OFFICER')) {
    router.replace({ name: 'GuildDetail', params: { guildId } });
    return;
  }
  initializeForm();
}

function initializeForm() {
  form.description = guild.value?.description ?? '';
  form.defaultRaidStartTime = guild.value?.defaultRaidStartTime ?? '';
  form.defaultRaidEndTime = guild.value?.defaultRaidEndTime ?? '';
}

function resetForm() {
  initializeForm();
}

async function saveSettings() {
  if (!guild.value) {
    return;
  }
  saving.value = true;
  try {
    await api.updateGuildSettings(guildId, {
      description: form.description,
      defaultRaidStartTime: form.defaultRaidStartTime || null,
      defaultRaidEndTime: form.defaultRaidEndTime || null
    });
    await loadGuild();
  } catch (error) {
    window.alert('Unable to save guild settings.');
    console.error(error);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.guild-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

textarea,
input[type='time'] {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.6rem;
  padding: 0.6rem;
  color: #f8fafc;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
