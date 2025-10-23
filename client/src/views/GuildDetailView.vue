<template>
  <section v-if="guild" class="guild-detail">
    <header class="section-header section-header--guild">
      <div class="guild-header guild-header--stack">
        <h1 class="guild-title">{{ guild.name }}</h1>
        <p v-if="guild.description" class="guild-subtitle muted">{{ guild.description }}</p>
      </div>
      <button class="plan-raid-button" @click="showRaidModal = true">Plan Raid</button>
    </header>

    <div class="grid">
      <article class="card">
        <header class="card__header">
          <h2>Members</h2>
        </header>
        <div class="list-filters list-filters--members">
          <input
            v-model="memberSearch"
            type="search"
            class="input input--search"
            placeholder="Search members"
          />
          <div class="member-filter-buttons">
            <button
              v-for="role in ['ALL', ...guildRoleOrder]"
              :key="role"
              :class="['member-filter-button', { 'member-filter-button--active': memberRoleFilter === role }]"
              @click="memberRoleFilter = role as GuildRole | 'ALL'"
            >
              {{ role === 'ALL' ? 'All' : roleLabels[role as GuildRole] ?? role }}
            </button>
          </div>
        </div>
        <p v-if="filteredMembers.length === 0" class="muted">No members match your search.</p>
        <ul v-else class="list">
          <li v-for="member in paginatedMembers" :key="member.id" class="list__item">
            <div>
              <strong>{{ preferredUserName(member.user) }}</strong>
              <span class="muted role"> ({{ roleLabels[member.role] }})</span>
            </div>
            <div v-if="canAdjustMember(member)" class="member-actions">
              <label class="muted small" :for="`role-${member.id}`">Role</label>
              <select
                :id="`role-${member.id}`"
                :value="member.role"
                :disabled="updatingMemberId === member.id"
                @change="updateMemberRole(member, ($event.target as HTMLSelectElement).value as GuildRole)"
              >
                <option
                  v-for="role in availableRoles(member)"
                  :key="role"
                  :value="role"
                  :disabled="role === member.role"
                >
                  {{ roleLabels[role] ?? role }}
                </option>
              </select>
            </div>
          </li>
        </ul>
        <div v-if="memberTotalPages > 1" class="pagination">
          <button class="btn btn--outline" :disabled="memberPage === 1" @click="setMemberPage(memberPage - 1)">
            Previous
          </button>
          <span>Page {{ memberPage }} of {{ memberTotalPages }}</span>
          <button
            class="btn btn--outline"
            :disabled="memberPage === memberTotalPages"
            @click="setMemberPage(memberPage + 1)"
          >
            Next
          </button>
        </div>
      </article>

      <article class="card">
        <header class="card__header">
          <h2>Characters</h2>
        </header>
        <div class="list-filters list-filters--characters">
          <input
            v-model="characterSearch"
            type="search"
            class="input input--search input--search--wide"
            placeholder="Search characters"
          />
          <div class="roster-filter-buttons">
            <button
              v-for="option in characterClassOptions"
              :key="option.value"
              :style="{ background: option.gradient, borderColor: option.border }"
              :class="['roster-filter-button', { 'roster-filter-button--active': characterClassFilter === option.value }]"
              @click="characterClassFilter = option.value"
            >
              <span class="roster-filter-icon">
                <template v-if="option.icon">
                  <img :src="option.icon" :alt="option.label" />
                </template>
                <template v-else>
                  <span class="roster-filter-icon-text">{{ option.label }}</span>
                </template>
              </span>
              <span v-if="option.icon" class="roster-filter-label">{{ option.label }}</span>
            </button>
          </div>
        </div>
        <p v-if="filteredCharacters.length === 0" class="muted">No characters match your search.</p>
        <ul v-else class="list">
          <li v-for="character in paginatedCharacters" :key="character.id" class="list__item">
            <div class="character-info">
              <div class="character-primary">
                <strong>{{ character.name }} ({{ character.level }})</strong>
                <span v-if="character.isMain" class="badge badge--main">Main</span>
              </div>
              <span class="roster-meta muted">
                <img
                  v-if="getCharacterClassIcon(character.class)"
                  :src="getCharacterClassIcon(character.class)"
                  :alt="formatCharacterClass(character.class)"
                  class="class-icon"
                />
                <span>{{ formatCharacterClass(character.class) }}</span>
              </span>
            </div>
            <span class="muted small">{{ preferredUserName(character.user) }}</span>
          </li>
        </ul>
        <div v-if="characterTotalPages > 1" class="pagination">
          <button
            class="btn btn--outline"
            :disabled="characterPage === 1"
            @click="setCharacterPage(characterPage - 1)"
          >
            Previous
          </button>
          <span>Page {{ characterPage }} of {{ characterTotalPages }}</span>
          <button
            class="btn btn--outline"
            :disabled="characterPage === characterTotalPages"
            @click="setCharacterPage(characterPage + 1)"
          >
            Next
          </button>
        </div>
      </article>
    </div>

    <section class="raids">
      <header class="section-header">
        <h2>Raid Schedule</h2>
        <RouterLink class="btn btn--outline" :to="{ name: 'Raids' }">View All Raids</RouterLink>
      </header>
      <p v-if="loadingRaids" class="muted">Loading raids…</p>
      <p v-else-if="raids.length === 0" class="muted">No raid events scheduled yet.</p>
      <ul class="raid-list">
        <li
          v-for="raid in raids"
          :key="raid.id"
          class="raid-list__item"
          role="button"
          tabindex="0"
          @click="openRaid(raid.id)"
          @keydown.enter.prevent="openRaid(raid.id)"
          @keydown.space.prevent="openRaid(raid.id)"
        >
          <div>
            <strong>{{ raid.name }}</strong>
            <span class="muted raid-meta">
              {{ formatDate(raid.startTime) }} • {{ raid.targetZones.join(', ') }}
            </span>
          </div>
          <span class="muted arrow">Open</span>
        </li>
      </ul>
    </section>

    <RaidModal
      v-if="showRaidModal"
      :guild-id="guild.id"
      @close="showRaidModal = false"
      @created="handleRaidCreated"
    />
  </section>
  <p v-else class="muted">Loading guild…</p>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';
import { api, type GuildDetail, type RaidEventSummary } from '../services/api';
import type { GuildRole, CharacterClass } from '../services/types';
import { guildRoleOrder, characterClassLabels, getCharacterClassIcon } from '../services/types';
import { useAuthStore } from '../stores/auth';
import { buildCharacterFilterOptions } from '../hooks/useCharacterFilters';

const route = useRoute();
const guildId = route.params.guildId as string;

type GuildMember = GuildDetail['members'][number];

const guild = ref<GuildDetail | null>(null);
const raids = ref<RaidEventSummary[]>([]);
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const router = useRouter();
const updatingMemberId = ref<string | null>(null);

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.userId ?? null);

const characterClassOptions = computed(() => buildCharacterFilterOptions(characterClassLabels));


const memberSearch = ref('');
const memberRoleFilter = ref<GuildRole | 'ALL'>('ALL');
const memberPage = ref(1);
const membersPerPage = 10;

const characterSearch = ref('');
const characterClassFilter = ref<'ALL' | 'MAIN' | CharacterClass>('ALL');
const characterPage = ref(1);
const charactersPerPage = 10;

const filteredMembers = computed(() => {
  if (!guild.value) {
    return [] as GuildMember[];
  }

  const query = memberSearch.value.trim().toLowerCase();
  const roleFilter = memberRoleFilter.value;

  return guild.value.members.filter((member) => {
    const name = preferredUserName(member.user)?.toLowerCase() ?? '';
    const roleLabel = roleLabels[member.role]?.toLowerCase() ?? member.role.toLowerCase();
    const matchesQuery = !query || name.includes(query) || roleLabel.includes(query);
    const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;

    return matchesQuery && matchesRole;
  });
});

const memberTotalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredMembers.value.length / membersPerPage));
});

const paginatedMembers = computed(() => {
  const start = (memberPage.value - 1) * membersPerPage;
  return filteredMembers.value.slice(start, start + membersPerPage);
});

const filteredCharacters = computed(() => {
  if (!guild.value) {
    return [] as GuildDetail['characters'];
  }

  const query = characterSearch.value.trim().toLowerCase();
  const filter = characterClassFilter.value;

  return guild.value.characters.filter((character) => {
    const name = character.name.toLowerCase();
    const className = character.class.toLowerCase();
    const owner = preferredUserName(character.user)?.toLowerCase() ?? '';
    const matchesQuery = !query || name.includes(query) || className.includes(query) || owner.includes(query);

    let matchesFilter = true;
    if (filter === 'MAIN') {
      matchesFilter = !!character.isMain;
    } else if (filter !== 'ALL') {
      matchesFilter = character.class === filter;
    }

    return matchesQuery && matchesFilter;
  });
});

const characterTotalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredCharacters.value.length / charactersPerPage));
});

const paginatedCharacters = computed(() => {
  const start = (characterPage.value - 1) * charactersPerPage;
  return filteredCharacters.value.slice(start, start + charactersPerPage);
});

watch([memberSearch, memberRoleFilter, () => guild.value?.members], () => {
  memberPage.value = 1;
}, { deep: true });

watch(memberTotalPages, (total) => {
  if (memberPage.value > total) {
    memberPage.value = total;
  }
});

watch([characterSearch, characterClassFilter, () => guild.value?.characters], () => {
  characterPage.value = 1;
}, { deep: true });

watch(characterTotalPages, (total) => {
  if (characterPage.value > total) {
    characterPage.value = total;
  }
});

function setMemberPage(page: number) {
  memberPage.value = Math.min(Math.max(1, page), memberTotalPages.value);
}

function setCharacterPage(page: number) {
  characterPage.value = Math.min(Math.max(1, page), characterTotalPages.value);
}

const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member'
};

async function loadGuild() {
  guild.value = await api.fetchGuildDetail(guildId);
}

async function loadRaids() {
  loadingRaids.value = true;
  try {
    raids.value = await api.fetchRaidsForGuild(guildId);
  } finally {
    loadingRaids.value = false;
  }
}

const actorRole = computed<GuildRole | null>(() => {
  if (!guild.value || !currentUserId.value) {
    return null;
  }

  const membership = guild.value.members.find((member) => member.user.id === currentUserId.value);
  return membership?.role ?? null;
});

function canAdjustMember(member: GuildMember) {
  const actor = actorRole.value;
  if (!actor) {
    return false;
  }

  if (member.user.id === currentUserId.value && actor !== 'LEADER') {
    return false;
  }

  if (member.role === 'LEADER') {
    return actor === 'LEADER' && member.user.id === currentUserId.value;
  }

  if (member.role === 'OFFICER') {
    return actor === 'LEADER';
  }

  return actor === 'LEADER' || actor === 'OFFICER';
}

function availableRoles(member: GuildMember): GuildRole[] {
  const actor = actorRole.value;
  const allowed = new Set<GuildRole>();
  allowed.add(member.role);

  if (!actor) {
    return guildRoleOrder.filter((role) => allowed.has(role));
  }

  if (actor === 'LEADER') {
    ['LEADER', 'OFFICER', 'RAID_LEADER', 'MEMBER'].forEach((role) => allowed.add(role as GuildRole));
  } else if (actor === 'OFFICER') {
    if (member.role !== 'LEADER' && member.role !== 'OFFICER') {
      ['RAID_LEADER', 'MEMBER'].forEach((role) => allowed.add(role as GuildRole));
    }
  }

  return guildRoleOrder.filter((role) => allowed.has(role));
}

async function updateMemberRole(member: GuildMember, role: GuildRole) {
  if (role === member.role || updatingMemberId.value === member.id) {
    return;
  }

  updatingMemberId.value = member.id;
  try {
    await api.updateGuildMemberRole(guildId, member.user.id, role);
    await loadGuild();
  } catch (error) {
    window.alert(extractErrorMessage(error, 'Unable to update guild member role.'));
  } finally {
    updatingMemberId.value = null;
  }
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (data && typeof data === 'object') {
      const message =
        'message' in data && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'error' in data && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : null;
      if (message) {
        return message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatCharacterClass(characterClass?: CharacterClass | null) {
  if (!characterClass) {
    return '—';
  }

  return characterClassLabels[characterClass] ?? characterClass;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function preferredUserName(user: { displayName?: string; nickname?: string | null }) {
  return user.nickname ?? user.displayName ?? '';
}

function handleRaidCreated() {
  showRaidModal.value = false;
  loadRaids();
}

function openRaid(raidId: string) {
  router.push({ name: 'RaidDetail', params: { raidId } });
}

onMounted(async () => {
  if (!authStore.user) {
    try {
      await authStore.fetchCurrentUser();
    } catch (error) {
      console.warn('Failed to fetch current user for guild context.', error);
    }
  }

  await loadGuild();
  loadRaids();
});
</script>

<style scoped>
.guild-detail {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header--guild {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;
}

.section-header--guild .plan-raid-button {
  align-self: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.member-actions label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.member-actions select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.35rem 0.5rem;
  color: #f8fafc;
}

.member-actions select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.guild-header {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 1.75rem 2rem;
  border-radius: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(14, 165, 233, 0.08));
  box-shadow: 0 20px 36px rgba(15, 23, 42, 0.55);
  position: relative;
  overflow: hidden;
}

.guild-header.guild-header--stack {
  align-items: center;
  text-align: center;
}

.guild-header::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.15), transparent 55%);
  pointer-events: none;
  opacity: 0.85;
}

.guild-title {
  margin: 0;
  font-size: clamp(2.5rem, 5vw, 3.25rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
  color: #e2e8f0;
  background: linear-gradient(135deg, #f8fafc, #a5b4fc 45%, #38bdf8 75%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 12px 30px rgba(15, 23, 42, 0.65);
}

.guild-subtitle {
  font-size: 0.95rem;
  margin-top: 0.5rem;
  max-width: 520px;
  line-height: 1.6;
}

.list-filters {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-filters--characters {
  gap: 1.25rem;
}

.input--search--wide {
  width: 100%;
}

.input--search {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.35rem 0.6rem;
  color: #f8fafc;
}

.input--search::placeholder {
  color: rgba(148, 163, 184, 0.7);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination span {
  color: #94a3b8;
  font-size: 0.9rem;
}

.character-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.character-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.badge--main {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.45), rgba(251, 191, 36, 0.25));
  color: #fef3c7;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px solid rgba(252, 211, 77, 0.4);
  box-shadow: 0 2px 6px rgba(250, 204, 21, 0.18);
}


.raid-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 1rem;
  border-radius: 1rem;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}

.raid-list__item:hover,
.raid-list__item:focus {
  background: rgba(59, 130, 246, 0.15);
  transform: translateY(-1px);
  outline: none;
}

.muted {
  color: #94a3b8;
}

.arrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.role,
.roster-meta,
.raid-meta {
  margin-left: 0.25rem;
}

.roster-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.class-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.35));
}

.raids {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.small {
  font-size: 0.85rem;
}

.plan-raid-button {
  padding: 0.55rem 1.25rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.85), rgba(14, 165, 233, 0.85));
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  color: #f8fafc;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.25);
}

.plan-raid-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.5);
}

.plan-raid-button:focus {
  outline: 2px solid rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

.member-filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.member-filter-button {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  padding: 0.25rem 0.75rem;
  color: #cbd5f5;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.member-filter-button:hover {
  border-color: rgba(59, 130, 246, 0.45);
  color: #f8fafc;
}

.member-filter-button:focus {
  outline: 2px solid rgba(59, 130, 246, 0.45);
  outline-offset: 2px;
}

.member-filter-button--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.55);
  color: #f8fafc;
}

.roster-filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.35rem;
}

.roster-filter-button {
  position: relative;
  border-radius: 1rem;
  width: 78px;
  height: 90px;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  color: #f8fafc;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.45);
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  overflow: hidden;
}

.roster-filter-button::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.4), transparent 60%);
  opacity: 0.75;
  pointer-events: none;
}

.roster-filter-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.55);
  border-color: rgba(255, 255, 255, 0.6);
}

.roster-filter-button:focus {
  outline: 2px solid rgba(255, 255, 255, 0.8);
  outline-offset: 2px;
}

.roster-filter-button--active {
  transform: translateY(-2px);
  box-shadow: 0 22px 32px rgba(255, 255, 255, 0.28);
  border-color: rgba(255, 255, 255, 0.9) !important;
}

.roster-filter-icon {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.roster-filter-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgba(15, 23, 42, 0.6));
}

.roster-filter-icon-text {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.roster-filter-label {
  display: block;
  position: relative;
  z-index: 1;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: center;
}

</style>
