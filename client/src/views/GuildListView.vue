<template>
  <section class="guilds">
    <header class="section-header">
      <div>
        <h1>Guilds</h1>
        <p>Browse guilds you belong to or create a new one for your team.</p>
      </div>
      <button class="btn" @click="showCreateModal = true">Create Guild</button>
    </header>

    <p v-if="loading" class="muted">Loading guilds…</p>
    <p v-else-if="guilds.length === 0" class="muted">No guilds found yet.</p>

    <div class="grid">
      <RouterLink
        v-for="guild in guilds"
        :key="guild.id"
        class="guild-card"
        :to="{ name: 'GuildDetail', params: { guildId: guild.id } }"
      >
        <h2>{{ guild.name }}</h2>
        <p class="muted">{{ guild.description || 'No description provided.' }}</p>
        <footer>
          <span>{{ guild.members.length }} members</span>
        </footer>
      </RouterLink>
    </div>

    <div v-if="showCreateModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <header class="modal__header">
          <h2>Create Guild</h2>
          <button class="icon-button" @click="closeModal">✕</button>
        </header>
        <form class="form" @submit.prevent="submitGuild">
          <label class="form__field">
            <span>Guild Name</span>
            <input v-model="form.name" required maxlength="100" />
          </label>
          <label class="form__field">
            <span>Description</span>
            <textarea v-model="form.description" maxlength="500" rows="3"></textarea>
          </label>
          <footer class="form__actions">
            <button class="btn btn--outline" type="button" @click="closeModal">Cancel</button>
            <button class="btn" type="submit" :disabled="submitting">
              {{ submitting ? 'Creating…' : 'Create Guild' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { api, type GuildSummary } from '../services/api';

const guilds = ref<GuildSummary[]>([]);
const loading = ref(false);
const showCreateModal = ref(false);
const submitting = ref(false);

const form = reactive({
  name: '',
  description: ''
});

function closeModal() {
  showCreateModal.value = false;
  form.name = '';
  form.description = '';
}

async function loadGuilds() {
  loading.value = true;
  try {
    guilds.value = await api.fetchGuilds();
  } finally {
    loading.value = false;
  }
}

async function submitGuild() {
  submitting.value = true;
  try {
    const guild = await api.createGuild({
      name: form.name,
      description: form.description
    });
    guilds.value.push(guild);
    closeModal();
  } finally {
    submitting.value = false;
  }
}

onMounted(loadGuilds);
</script>

<style scoped>
.guilds {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}

.guild-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  color: inherit;
  text-decoration: none;
  transition: transform 0.1s ease, border-color 0.2s ease;
}

.guild-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.5);
}

.guild-card footer {
  margin-top: auto;
  color: #94a3b8;
}

.muted {
  color: #94a3b8;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 100;
}

.modal {
  width: min(480px, 100%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form__field input,
.form__field textarea {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: #f8fafc;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}
</style>
