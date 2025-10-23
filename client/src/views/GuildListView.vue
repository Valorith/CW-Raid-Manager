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
        <div class="guild-card__header">
          <div class="guild-card__crest" aria-hidden="true">
            {{ guild.name.charAt(0).toUpperCase() }}
          </div>
          <div class="guild-card__heading">
            <h2>{{ guild.name }}</h2>
            <p class="guild-card__subtitle muted">{{ formatGuildLeader(guild) }}</p>
          </div>
        </div>
        <p v-if="guild.description" class="guild-card__description muted">
          {{ guild.description }}
        </p>
        <p v-else class="guild-card__description muted muted--faint">
          No description yet. Click to view details.
        </p>
        <footer class="guild-card__footer">
          <span class="guild-card__stat">
            <span class="guild-card__stat-label muted">Members</span>
            <span class="guild-card__stat-value">{{ guild.members.length }}</span>
          </span>
          <span class="guild-card__stat">
            <span class="guild-card__stat-label muted">Officers</span>
            <span class="guild-card__stat-value">{{ countOfficers(guild) }}</span>
          </span>
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

function resolveGuildLeader(guild: GuildSummary) {
  const leader = guild.members.find((member) => member.role === 'LEADER');
  if (!leader) {
    return null;
  }
  return leader.user.nickname ?? leader.user.displayName ?? null;
}

function countOfficers(guild: GuildSummary) {
  return guild.members.filter((member) => member.role === 'OFFICER').length;
}

function formatGuildLeader(guild: GuildSummary) {
  const leader = resolveGuildLeader(guild);
  return leader ? `Led by ${leader}` : 'Leader pending';
}
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
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.75rem;
}

.guild-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1.25rem;
  padding: 1.75rem;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.45);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.guild-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 15% 20%, rgba(59, 130, 246, 0.25), transparent 55%);
  opacity: 0.65;
  pointer-events: none;
}

.guild-card:hover {
  transform: translateY(-6px);
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 20px 44px rgba(59, 130, 246, 0.25);
}

.guild-card__header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.guild-card__crest {
  flex-shrink: 0;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 0.9rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(14, 165, 233, 0.65));
  border: 1px solid rgba(148, 163, 184, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
  box-shadow: 0 12px 24px rgba(14, 165, 233, 0.35);
}

.guild-card__heading h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.guild-card__subtitle {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.guild-card__description {
  margin: 0;
  line-height: 1.6;
  font-size: 0.95rem;
}

.muted--faint {
  color: rgba(148, 163, 184, 0.65);
}

.guild-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
}

.guild-card__stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.guild-card__stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.guild-card__stat-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
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
