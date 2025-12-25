<template>
  <section class="guilds">
    <header class="section-header">
      <div>
        <h1>Guilds</h1>
        <p>Browse guilds you belong to or create a new one for your team.</p>
      </div>
      <button class="btn btn--create" @click="showCreateModal = true">Create Guild</button>
    </header>

    <GlobalLoadingSpinner v-if="showLoading" />
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
        <div class="guild-card__actions">
          <span v-if="isMemberOfGuild(guild.id)" class="tag tag--accent">Your Guild</span>
          <template v-else>
            <button
              v-if="isPendingForGuild(guild.id)"
              class="btn btn--outline btn--small guild-card__button guild-card__button--withdraw"
              :disabled="withdrawingGuildId === guild.id"
              @click.stop="withdrawApplication(guild.id)"
            >
              {{ withdrawingGuildId === guild.id ? 'Withdrawing…' : 'Withdraw Application' }}
            </button>
            <p v-else-if="isPendingElsewhere(guild.id)" class="muted small">
              Pending application elsewhere
            </p>
            <button
              v-else
              class="btn btn--accent btn--small guild-card__button guild-card__button--apply"
              :disabled="!!primaryGuild || applyingGuildId === guild.id"
              @click.stop="applyToGuild(guild.id)"
            >
              {{ applyingGuildId === guild.id ? 'Applying…' : 'Apply to Join' }}
            </button>
          </template>
        </div>
      </RouterLink>
    </div>

    <p v-if="applicationError" class="error">{{ applicationError }}</p>

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
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';

import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { api, type GuildSummary } from '../services/api';
import { useAuthStore } from '../stores/auth';

const guilds = ref<GuildSummary[]>([]);
const loading = ref(false);
const showLoading = useMinimumLoading(loading);
const showCreateModal = ref(false);
const submitting = ref(false);
const applyingGuildId = ref<string | null>(null);
const withdrawingGuildId = ref<string | null>(null);
const applicationError = ref<string | null>(null);

const authStore = useAuthStore();

const primaryGuild = computed(() => authStore.primaryGuild);
const pendingApplication = computed(() => authStore.pendingApplication);

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

function isMemberOfGuild(guildId: string) {
  return primaryGuild.value?.id === guildId;
}

function isPendingForGuild(guildId: string) {
  return pendingApplication.value?.guildId === guildId && pendingApplication.value.status === 'PENDING';
}

function isPendingElsewhere(guildId: string) {
  return (
    pendingApplication.value &&
    pendingApplication.value.guildId !== guildId &&
    pendingApplication.value.status === 'PENDING'
  );
}

async function applyToGuild(guildId: string) {
  if (applyingGuildId.value || withdrawingGuildId.value) {
    return;
  }
  applicationError.value = null;
  applyingGuildId.value = guildId;
  try {
    await api.applyToGuild(guildId);
    await authStore.fetchCurrentUser();
  } catch (error) {
    applicationError.value = extractErrorMessage(error, 'Unable to submit application.');
  } finally {
    applyingGuildId.value = null;
  }
}

async function withdrawApplication(guildId: string) {
  if (withdrawingGuildId.value) {
    return;
  }
  applicationError.value = null;
  withdrawingGuildId.value = guildId;
  try {
    await api.withdrawGuildApplication(guildId);
    await authStore.fetchCurrentUser();
  } catch (error) {
    applicationError.value = extractErrorMessage(error, 'Unable to withdraw application.');
  } finally {
    withdrawingGuildId.value = null;
  }
}

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
          return (data as { error: string }).error;
        }
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
  }
  return fallback;
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

.btn--create {
  padding: 0.6rem 1.4rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(190, 242, 100, 0.45);
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.85), rgba(190, 242, 100, 0.65));
  color: #0f172a;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 0.12s ease, box-shadow 0.25s ease, border-color 0.2s ease;
}

.btn--create:hover {
  transform: translateY(-2px);
  border-color: rgba(254, 240, 138, 0.8);
  box-shadow: 0 16px 30px rgba(74, 222, 128, 0.25);
}

.btn--create:active {
  transform: translateY(0);
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

.guild-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
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

.guild-card__button {
  min-width: 160px;
  padding: 0.55rem 1.2rem;
  border-radius: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 0.15s ease, box-shadow 0.25s ease, border-color 0.2s ease, background 0.2s ease;
}

.guild-card__button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(56, 189, 248, 0.25);
}

.guild-card__button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.guild-card__button--apply {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.95), rgba(99, 102, 241, 0.85));
  border: 1px solid rgba(56, 189, 248, 0.6);
  color: #0b1120;
}

.guild-card__button--apply:hover:not(:disabled) {
  border-color: rgba(191, 219, 254, 0.9);
  box-shadow: 0 16px 32px rgba(56, 189, 248, 0.28);
}

.guild-card__button--withdraw {
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.1), rgba(71, 85, 105, 0.15));
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #d1d9e5;
}

.guild-card__button--withdraw:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.55);
  color: #fee2e2;
  box-shadow: 0 12px 26px rgba(248, 113, 113, 0.18);
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
