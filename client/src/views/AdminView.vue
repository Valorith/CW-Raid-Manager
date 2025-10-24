<template>
  <section class="admin">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Admin Console</h1>
        <p class="muted">Centralize user and guild management for the platform.</p>
      </div>
    </header>

    <div class="admin-stats">
      <div class="stat-card">
        <span class="stat-card__label">Total Users</span>
        <strong class="stat-card__value">{{ adminSummary.totalUsers }}</strong>
      </div>
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">Administrators</span>
        <strong class="stat-card__value">{{ adminSummary.totalAdmins }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Guilds</span>
        <strong class="stat-card__value">{{ adminSummary.totalGuilds }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Members Across Guilds</span>
        <strong class="stat-card__value">{{ adminSummary.totalGuildMembers }}</strong>
        <span class="stat-card__meta">Across {{ adminSummary.totalGuilds }} guilds</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Raid Events</span>
        <strong class="stat-card__value">{{ adminSummary.totalRaids }}</strong>
        <span class="stat-card__meta">{{ adminSummary.activeRaids }} active right now</span>
      </div>
    </div>

    <div class="admin-grid">
      <article class="card">
        <header class="card__header">
          <div>
            <h2>Users</h2>
            <span class="muted small">{{ filteredUsers.length }} users</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingUsers"
            aria-label="Refresh users"
            @click.prevent="refreshUsers"
          >
            ↻
          </button>
        </header>
        <input
          v-model="userSearch"
          type="search"
          class="input input--search"
          placeholder="Search by name or email"
        />
        <p v-if="loadingUsers" class="muted">Loading users…</p>
        <p v-else-if="filteredUsers.length === 0" class="muted">No users found.</p>
        <ul v-else class="list user-list">
          <li v-for="user in paginatedUsers" :key="user.id" class="user-list__item">
            <div class="user-list__meta">
              <strong>{{ user.displayName }}</strong>
              <span class="muted small">{{ user.email }}</span>
              <div class="user-list__guilds">
                <span
                  v-for="membership in user.guildMemberships"
                  :key="membership.guild.id"
                  class="tag"
                >
                  {{ membership.guild.name }} · {{ formatRole(membership.role) }}
                </span>
                <span v-if="user.guildMemberships.length === 0" class="muted small">
                  No guild memberships
                </span>
              </div>
            </div>
            <div class="user-list__actions">
              <button
                class="btn btn--outline btn--small"
                :disabled="updatingUserId === user.id || deletingUserId === user.id"
                @click="openUserModal(user)"
              >
                Edit
              </button>
              <button
                class="btn btn--danger btn--small"
                :disabled="deletingUserId === user.id"
                @click="deleteUser(user)"
              >
                {{ deletingUserId === user.id ? 'Deleting…' : 'Delete' }}
              </button>
              <button
                class="btn btn--outline btn--small"
                :class="{ 'btn--accent': !user.isAdmin }"
                :disabled="updatingUserId === user.id || deletingUserId === user.id"
                @click="toggleAdmin(user)"
              >
                {{
                  updatingUserId === user.id
                    ? 'Saving…'
                    : user.isAdmin
                      ? 'Revoke Admin'
                      : 'Make Admin'
                }}
              </button>
            </div>
          </li>
        </ul>
        <div v-if="totalUserPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="userPage === 1"
            @click="setUserPage(userPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ userPage }} of {{ totalUserPages }}</span>
          <button
            class="pagination__button"
            :disabled="userPage === totalUserPages"
            @click="setUserPage(userPage + 1)"
          >
            Next
          </button>
        </div>
      </article>

      <article class="card">
        <header class="card__header">
          <div>
            <h2>Guilds</h2>
            <span class="muted small">{{ guilds.length }} guilds</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--refresh"
            :disabled="loadingGuilds"
            aria-label="Refresh guilds"
            @click.prevent="refreshGuilds"
          >
            ↻
          </button>
        </header>
        <p v-if="loadingGuilds" class="muted">Loading guilds…</p>
        <p v-else-if="guilds.length === 0" class="muted">No guilds registered yet.</p>
        <ul v-else class="list guild-list">
          <li
            v-for="guild in guilds"
            :key="guild.id"
            :class="[
              'guild-list__item',
              { 'guild-list__item--active': guild.id === selectedGuildId }
            ]"
            role="button"
            tabindex="0"
            @click="selectGuild(guild.id)"
            @keydown.enter.prevent="selectGuild(guild.id)"
            @keydown.space.prevent="selectGuild(guild.id)"
          >
            <div>
              <strong>{{ guild.name }}</strong>
              <p class="muted small">
                {{ guild.memberCount }} members · {{ guild.raidCount }} raids · {{ guild.characterCount }}
                characters
              </p>
            </div>
            <span class="muted">Manage</span>
          </li>
        </ul>
      </article>

      <article class="card">
        <header class="card__header">
          <div>
            <h2>Raid Events</h2>
            <span class="muted small">{{ raids.length }} raids</span>
          </div>
          <div class="card__header-actions">
            <button
              type="button"
              class="icon-button icon-button--refresh"
              :disabled="loadingRaids"
              aria-label="Refresh raid events"
              @click.prevent="refreshRaids"
            >
              ↻
            </button>
          </div>
        </header>
        <div class="raid-filters">
          <button
            type="button"
            :class="['raid-filter', { 'raid-filter--active': raidFilter === 'ACTIVE' }]"
            @click="raidFilter = 'ACTIVE'"
          >
            Active
          </button>
          <button
            type="button"
            :class="['raid-filter', { 'raid-filter--active': raidFilter === 'ENDED' }]"
            @click="raidFilter = 'ENDED'"
          >
            Ended
          </button>
        </div>
        <p v-if="loadingRaids" class="muted">Loading raids…</p>
        <p v-else-if="filteredRaids.length === 0" class="muted">No raid events found.</p>
        <ul v-else class="raid-admin-list">
          <li
            v-for="raid in filteredRaids"
            :key="raid.id"
            :class="['raid-admin-list__item', { 'raid-admin-list__item--active': raid.id === selectedRaidId }]"
          >
            <div class="raid-admin-list__info">
              <strong>{{ raid.name }}</strong>
              <span class="muted small">
                {{ formatRaidDate(raid.startTime) }}
                <template v-if="raid.guild"> • {{ raid.guild.name }}</template>
              </span>
              <span class="muted tiny">{{ raid.attendanceCount }} attendance events</span>
            </div>
            <div class="raid-admin-list__actions">
              <span class="badge" :class="raidStatusBadge(raid).variant">
                {{ raidStatusBadge(raid).label }}
              </span>
              <button class="btn btn--outline btn--small" @click="openRaidDetail(raid.id)">
                Manage
              </button>
            </div>
          </li>
        </ul>
      </article>
    </div>

    <div v-if="showGuildModal" class="modal-backdrop" @click.self="closeGuildModal">
      <div class="modal" role="dialog" aria-modal="true">
        <template v-if="selectedGuild">
        <header class="modal__header">
          <div class="modal__titles">
            <h2>{{ selectedGuild.name }}</h2>
            <p class="muted small">{{ selectedGuild.memberCount }} members total</p>
          </div>
          <button class="icon-button" @click="closeGuildModal" aria-label="Close guild editor">
            ✕
          </button>
        </header>

        <form class="form guild-form" @submit.prevent="saveGuildDetails">
          <label class="form__field">
            <span>Name</span>
            <input v-model="guildForm.name" required maxlength="100" class="input" />
          </label>
          <label class="form__field">
            <span>Description</span>
            <textarea
              v-model="guildForm.description"
              maxlength="500"
              rows="3"
              class="textarea"
            ></textarea>
          </label>
        </form>

        <div class="modal__actions">
          <button
            class="btn btn--outline btn--small"
            :disabled="updatingGuild"
            @click="saveGuildDetails"
          >
            {{ updatingGuild ? 'Saving…' : 'Save Changes' }}
          </button>
          <button class="btn btn--danger btn--small" type="button" @click="deleteGuild">
            Delete Guild
          </button>
        </div>

        <section class="guild-members">
          <header class="guild-members__header">
            <h3>Members</h3>
            <span class="muted small">{{ selectedGuild.members.length }} listed</span>
          </header>
          <p v-if="loadingGuildDetail" class="muted">Loading members…</p>
          <p v-else-if="selectedGuild.members.length === 0" class="muted">
            No members have been added yet.
          </p>
          <ul v-else class="list member-list">
            <li
              v-for="member in selectedGuild.members"
              :key="member.user.id"
              class="member-list__item"
            >
              <div class="member-list__user">
                <strong>{{ member.user.displayName }}</strong>
                <span class="muted small">{{ member.user.email }}</span>
              </div>
              <div class="member-list__actions">
                <label class="muted tiny" :for="`role-${member.user.id}`">Role</label>
                <select
                  :id="`role-${member.user.id}`"
                  :value="member.role"
                  class="select"
                  :disabled="updatingMemberId === member.user.id"
                  @change="
                    updateMemberRole(
                      member.user.id,
                      ($event.target as HTMLSelectElement).value as GuildRole
                    )
                  "
                >
                  <option v-for="role in guildRoleOrder" :key="role" :value="role">
                    {{ formatRole(role) }}
                  </option>
                </select>
                <button
                  class="btn btn--danger btn--small"
                  :disabled="removingMemberId === member.user.id"
                  @click="removeMember(member.user.id)"
                >
                  {{ removingMemberId === member.user.id ? 'Removing…' : 'Remove' }}
                </button>
              </div>
            </li>
          </ul>

          <section class="member-add">
            <h4>Add Member</h4>
            <div class="member-add__form">
              <select v-model="membershipForm.userId" class="select">
                <option value="">Select a user</option>
                <option v-for="user in availableUsersForGuild" :key="user.id" :value="user.id">
                  {{ user.displayName }} · {{ user.email }}
                </option>
              </select>
              <select v-model="membershipForm.role" class="select">
                <option v-for="role in guildRoleOrder" :key="role" :value="role">
                  {{ formatRole(role) }}
                </option>
              </select>
              <button
                class="btn btn--accent btn--small"
                :disabled="addingMember || !membershipForm.userId"
                @click="addMember"
              >
                {{ addingMember ? 'Adding…' : 'Add Member' }}
              </button>
            </div>
            <p v-if="availableUsersForGuild.length === 0" class="muted tiny">
              All users are already members of this guild.
            </p>
          </section>
        </section>

        <section class="guild-characters">
          <header class="guild-members__header">
            <h3>Characters</h3>
            <span class="muted small">{{ selectedGuild.characters.length }} linked</span>
          </header>
          <p v-if="loadingGuildDetail" class="muted">Loading characters…</p>
          <p v-else-if="selectedGuild.characters.length === 0" class="muted">
            No characters are associated with this guild yet.
          </p>
          <ul v-else class="list member-list">
            <li
              v-for="character in selectedGuild.characters"
              :key="character.id"
              class="member-list__item"
            >
              <div class="member-list__user">
                <strong>{{ character.name }} ({{ character.level }})</strong>
                <span class="muted small">{{ formatCharacterClass(character.class) }}</span>
                <span class="muted tiny">Owner: {{ character.ownerName }}</span>
              </div>
              <div class="member-list__actions">
                <button
                  class="btn btn--danger btn--small"
                  :disabled="detachingCharacterId === character.id"
                  @click="detachCharacter(character)"
                >
                  {{ detachingCharacterId === character.id ? 'Detaching…' : 'Remove' }}
                </button>
              </div>
            </li>
          </ul>
        </section>
        </template>
        <template v-else>
          <div class="modal__loading">
            <span class="spinner" aria-hidden="true"></span>
            <p class="muted">Loading guild details…</p>
          </div>
        </template>
      </div>
    </div>
    <div v-if="showUserModal" class="modal-backdrop modal-backdrop--user" @click.self="closeUserModal">
      <div class="modal modal--narrow" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div class="modal__titles">
            <h2>Edit User</h2>
            <p class="muted small">Update profile information for the selected account.</p>
          </div>
          <button class="icon-button" @click="closeUserModal" aria-label="Close user editor">
            ✕
          </button>
        </header>

        <form class="form user-form" @submit.prevent="saveUserDetails">
          <label class="form__field">
            <span>Display Name</span>
            <input v-model="userForm.displayName" required maxlength="120" class="input" />
          </label>
          <label class="form__field">
            <span>Nickname</span>
            <input v-model="userForm.nickname" maxlength="120" class="input" />
          </label>
          <label class="form__field">
            <span>Email</span>
            <input v-model="userForm.email" type="email" required class="input" />
          </label>
        </form>

        <div class="modal__actions">
          <button class="btn btn--outline btn--small" type="button" @click="closeUserModal">
            Cancel
          </button>
          <button
            class="btn btn--accent btn--small"
            :disabled="savingUser"
            @click="saveUserDetails"
          >
            {{ savingUser ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showRaidDetailModal" class="modal-backdrop" @click.self="closeRaidModal">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div class="modal__titles">
            <h2>{{ selectedRaid?.name ?? 'Raid Event' }}</h2>
            <p class="muted small">
              {{ selectedRaid?.guild?.name ?? 'No Guild' }} •
              {{ selectedRaid ? formatRaidDate(selectedRaid.startTime) : '' }}
            </p>
          </div>
          <button class="icon-button" @click="closeRaidModal" aria-label="Close raid editor">
            ✕
          </button>
        </header>

        <form class="form raid-form" @submit.prevent="saveRaidDetails">
          <label class="form__field">
            <span>Raid Name</span>
            <input v-model="raidForm.name" required maxlength="120" class="input" />
          </label>
          <label class="form__field">
            <span>Scheduled Start</span>
            <input v-model="raidForm.startTime" type="datetime-local" class="input" />
          </label>
          <label class="form__field">
            <span>Actual Start</span>
            <input v-model="raidForm.startedAt" type="datetime-local" class="input" />
          </label>
          <label class="form__field">
            <span>Actual End</span>
            <input v-model="raidForm.endedAt" type="datetime-local" class="input" />
          </label>
          <label class="form__field">
            <span>Target Zones</span>
            <textarea v-model="raidForm.targetZones" rows="3" class="textarea"></textarea>
          </label>
          <label class="form__field">
            <span>Target Bosses</span>
            <textarea v-model="raidForm.targetBosses" rows="3" class="textarea"></textarea>
          </label>
          <label class="form__field">
            <span>Notes</span>
            <textarea v-model="raidForm.notes" rows="3" class="textarea"></textarea>
          </label>
          <label class="form__field form__field--inline">
            <span>Active Event</span>
            <input v-model="raidForm.isActive" type="checkbox" />
          </label>
        </form>

        <section v-if="selectedRaid?.attendance?.length" class="raid-attendance-overview">
          <h3>Attendance Snapshot</h3>
          <ul class="raid-attendance-overview__list">
            <li v-for="event in selectedRaid.attendance" :key="event.id">
              <span>{{ formatRaidDate(event.createdAt) }}</span>
              <span class="badge" :class="eventBadgeVariant(event.eventType)">
                {{ formatEventType(event.eventType) }}
              </span>
            </li>
          </ul>
        </section>

        <div class="modal__actions">
          <button class="btn btn--outline btn--small" type="button" @click="closeRaidModal">
            Close
          </button>
          <button
            class="btn btn--danger btn--small"
            type="button"
            :disabled="!selectedRaidId.value || deletingRaidId === selectedRaidId.value"
            @click="deleteRaid"
          >
            {{ deletingRaidId === selectedRaidId.value ? 'Deleting…' : 'Delete Raid' }}
          </button>
          <button
            class="btn btn--accent btn--small"
            :disabled="savingRaid"
            @click="saveRaidDetails"
          >
            {{ savingRaid ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
        <p v-if="raidError" class="error">{{ raidError }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  api,
  type AdminGuildDetail,
  type AdminGuildSummary,
  type AdminRaidDetail,
  type AdminRaidSummary,
  type AdminUserSummary
} from '../services/api';
import type { GuildRole } from '../services/types';
import { characterClassLabels, guildRoleOrder } from '../services/types';

const loadingUsers = ref(false);
const loadingGuilds = ref(false);
const loadingGuildDetail = ref(false);
const loadingRaids = ref(false);

const users = ref<AdminUserSummary[]>([]);
const guilds = ref<AdminGuildSummary[]>([]);
const raids = ref<AdminRaidSummary[]>([]);
const selectedGuildId = ref<string | null>(null);
const selectedGuild = ref<AdminGuildDetail | null>(null);
const detachingCharacterId = ref<string | null>(null);
const showGuildModal = ref(false);
const showUserModal = ref(false);
const selectedRaidId = ref<string | null>(null);
const selectedRaid = ref<AdminRaidDetail | null>(null);
const showRaidDetailModal = ref(false);

const userSearch = ref('');
const userPage = ref(1);
const usersPerPage = 10;
const updatingUserId = ref<string | null>(null);
const deletingUserId = ref<string | null>(null);

const updatingGuild = ref(false);
const addingMember = ref(false);
const updatingMemberId = ref<string | null>(null);
const removingMemberId = ref<string | null>(null);

const guildForm = reactive({
  name: '',
  description: '' as string | null
});

const membershipForm = reactive<{
  userId: string;
  role: GuildRole;
}>({
  userId: '',
  role: 'MEMBER'
});

const raidForm = reactive({
  name: '',
  startTime: '',
  startedAt: '',
  endedAt: '',
  targetZones: '',
  targetBosses: '',
  notes: '',
  isActive: false
});

const editingUser = ref<AdminUserSummary | null>(null);
const savingUser = ref(false);
const userForm = reactive({
  displayName: '',
  nickname: '',
  email: ''
});

const savingRaid = ref(false);
const deletingRaidId = ref<string | null>(null);
const raidError = ref<string | null>(null);
const raidFilter = ref<'ACTIVE' | 'ENDED'>('ACTIVE');

const roleLabels: Record<GuildRole, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member'
};

const filteredUsers = computed(() => {
  const query = userSearch.value.trim().toLowerCase();
  if (!query) {
    return users.value;
  }

  return users.value.filter((user) => {
    return (
      user.displayName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });
});

const totalUserPages = computed(() =>
  Math.max(1, Math.ceil(filteredUsers.value.length / usersPerPage))
);

const paginatedUsers = computed(() => {
  const start = (userPage.value - 1) * usersPerPage;
  return filteredUsers.value.slice(start, start + usersPerPage);
});

const availableUsersForGuild = computed(() => {
  if (!selectedGuild.value) {
    return [];
  }
  const memberIds = new Set(selectedGuild.value.members.map((member) => member.user.id));
  return users.value.filter((user) => !memberIds.has(user.id));
});

const adminSummary = computed(() => {
  const totalUsers = users.value.length;
  const totalAdmins = users.value.filter((user) => user.isAdmin).length;
  const totalGuilds = guilds.value.length;
  const totalGuildMembers = guilds.value.reduce((sum, guild) => sum + guild.memberCount, 0);
  const totalRaids = raids.value.length;
  const activeRaids = raids.value.filter((raid) => raid.isActive && !raid.endedAt).length;

  return {
    totalUsers,
    totalAdmins,
    totalGuilds,
    totalGuildMembers,
    totalRaids,
    activeRaids
  };
});

function formatRole(role: GuildRole) {
  return roleLabels[role] ?? role;
}

function formatCharacterClass(className?: string | null) {
  if (!className) {
    return 'Unknown Class';
  }
  return characterClassLabels[className as keyof typeof characterClassLabels] ?? className;
}

const filteredRaids = computed(() => {
  return raids.value.filter((raid) => {
    if (raidFilter.value === 'ACTIVE') {
      return !raid.endedAt;
    }
    return Boolean(raid.endedAt);
  });
});

function formatRaidDate(value?: string | null) {
  if (!value) {
    return 'Date pending';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function raidStatusBadge(raid: { startedAt?: string | null; endedAt?: string | null; isActive: boolean }) {
  if (raid.endedAt) {
    return { label: 'Ended', variant: 'badge--negative' } as const;
  }

  if (raid.startedAt || raid.isActive) {
    return { label: 'In Progress', variant: 'badge--positive' } as const;
  }

  return { label: 'Scheduled', variant: 'badge--neutral' } as const;
}

function toLocalInput(value?: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const offset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value?: string | null): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseMultiValueInput(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resetRaidForm() {
  raidForm.name = '';
  raidForm.startTime = '';
  raidForm.startedAt = '';
  raidForm.endedAt = '';
  raidForm.targetZones = '';
  raidForm.targetBosses = '';
  raidForm.notes = '';
  raidForm.isActive = false;
}

function formatEventType(eventType?: string | null) {
  switch (eventType) {
    case 'START':
      return 'Raid Started';
    case 'END':
      return 'Raid Ended';
    case 'RESTART':
      return 'Raid Restarted';
    default:
      return 'Attendance Log';
  }
}

function eventBadgeVariant(eventType?: string | null) {
  switch (eventType) {
    case 'START':
    case 'RESTART':
      return 'badge--positive';
    case 'END':
      return 'badge--negative';
    default:
      return 'badge--neutral';
  }
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    users.value = await api.fetchAdminUsers();
  } catch (error) {
    console.error('Failed to load users for admin console.', error);
    window.alert('Unable to load users. Please try again.');
  } finally {
    loadingUsers.value = false;
  }
}

async function refreshUsers() {
  await loadUsers();
}

async function loadGuilds() {
  loadingGuilds.value = true;
  try {
    guilds.value = await api.fetchAdminGuilds();
    if (!selectedGuildId.value && guilds.value.length > 0) {
      selectedGuildId.value = guilds.value[0].id;
    }
  } catch (error) {
    console.error('Failed to load guilds for admin console.', error);
    window.alert('Unable to load guilds. Please try again.');
  } finally {
    loadingGuilds.value = false;
  }
}

async function refreshGuilds() {
  await loadGuilds();
  if (selectedGuildId.value) {
    await loadGuildDetail(selectedGuildId.value);
  }
}

async function loadAdminRaids() {
  loadingRaids.value = true;
  try {
    raids.value = await api.fetchAdminRaids();
  } catch (error) {
    console.error('Failed to load raid events for admin console.', error);
    window.alert('Unable to load raid events. Please try again.');
  } finally {
    loadingRaids.value = false;
  }
}

async function refreshRaids() {
  await loadAdminRaids();
}

async function loadGuildDetail(guildId: string) {
  loadingGuildDetail.value = true;
  selectedGuild.value = null;
  try {
    selectedGuild.value = await api.fetchAdminGuildDetail(guildId);
  } catch (error) {
    console.error('Failed to load guild detail.', error);
    window.alert('Unable to load guild detail. Please try again.');
    selectedGuild.value = null;
  } finally {
    loadingGuildDetail.value = false;
  }
}

function selectGuild(guildId: string) {
  selectedGuildId.value = guildId;
  showGuildModal.value = true;
}

function closeGuildModal() {
  showGuildModal.value = false;
}

function openUserModal(user: AdminUserSummary) {
  editingUser.value = user;
  userForm.displayName = user.displayName;
  userForm.nickname = user.nickname ?? '';
  userForm.email = user.email;
  showUserModal.value = true;
}

function closeUserModal() {
  showUserModal.value = false;
  editingUser.value = null;
  savingUser.value = false;
}

async function toggleAdmin(user: AdminUserSummary) {
  if (updatingUserId.value) {
    return;
  }

  updatingUserId.value = user.id;
  try {
    const updated = await api.updateAdminUser(user.id, { admin: !user.isAdmin });
    users.value = users.value.map((existing) =>
      existing.id === updated.id ? updated : existing
    );
  } catch (error) {
    console.error('Failed to update admin flag.', error);
    window.alert('Unable to update admin status. Please try again.');
  } finally {
    updatingUserId.value = null;
  }
}

async function saveGuildDetails() {
  if (!selectedGuildId.value) {
    return;
  }

  updatingGuild.value = true;
  try {
    const updated = await api.updateAdminGuild(selectedGuildId.value, {
      name: guildForm.name.trim(),
      description: guildForm.description?.trim() || null
    });

    guilds.value = guilds.value.map((guild) =>
      guild.id === updated.id ? updated : guild
    );
    if (selectedGuild.value) {
      selectedGuild.value = {
        ...selectedGuild.value,
        name: updated.name,
        description: updated.description,
        memberCount: updated.memberCount,
        characterCount: updated.characterCount,
        raidCount: updated.raidCount
      };
    }
  } catch (error) {
    console.error('Failed to update guild details.', error);
    window.alert('Unable to update guild details. Please try again.');
  } finally {
    updatingGuild.value = false;
  }
}

async function deleteGuild() {
  if (!selectedGuildId.value) {
    return;
  }

  const confirmed = window.confirm('Delete this guild and all associated data?');
  if (!confirmed) {
    return;
  }

  try {
    await api.deleteAdminGuild(selectedGuildId.value);
    guilds.value = guilds.value.filter((guild) => guild.id !== selectedGuildId.value);
    selectedGuildId.value = guilds.value[0]?.id ?? null;
    if (selectedGuildId.value) {
      await loadGuildDetail(selectedGuildId.value);
    } else {
      selectedGuild.value = null;
      showGuildModal.value = false;
    }
    await loadUsers();
    await loadAdminRaids();
  } catch (error) {
    console.error('Failed to delete guild.', error);
    window.alert('Unable to delete guild. Please try again.');
  }
}

function openRaidDetail(raidId: string) {
  selectedRaidId.value = raidId;
  showRaidDetailModal.value = true;
  raidError.value = null;
  resetRaidForm();
  selectedRaid.value = null;
  loadRaidDetail(raidId);
}

function closeRaidModal() {
  showRaidDetailModal.value = false;
  selectedRaidId.value = null;
  selectedRaid.value = null;
  raidError.value = null;
  savingRaid.value = false;
  deletingRaidId.value = null;
  resetRaidForm();
}

function applyRaidDetailToForm(detail: AdminRaidDetail) {
  raidForm.name = detail.name;
  raidForm.startTime = toLocalInput(detail.startTime);
  raidForm.startedAt = toLocalInput(detail.startedAt ?? null);
  raidForm.endedAt = toLocalInput(detail.endedAt ?? null);
  raidForm.targetZones = (detail.targetZones ?? []).join('\n');
  raidForm.targetBosses = (detail.targetBosses ?? []).join('\n');
  raidForm.notes = detail.notes ?? '';
  raidForm.isActive = detail.isActive;
}

async function loadRaidDetail(raidId: string) {
  raidError.value = null;
  resetRaidForm();
  try {
    const detail = await api.fetchAdminRaid(raidId);
    if (detail) {
      selectedRaid.value = detail;
      applyRaidDetailToForm(detail);
    }
  } catch (error) {
    console.error('Failed to load raid event.', error);
    raidError.value = 'Unable to load raid event. Please try again.';
    selectedRaid.value = null;
  }
}

async function saveRaidDetails() {
  if (!selectedRaidId.value || !selectedRaid.value || savingRaid.value) {
    return;
  }

  const payload = {
    name: raidForm.name.trim() || undefined,
    startTime: raidForm.startTime ? new Date(raidForm.startTime).toISOString() : undefined,
    startedAt: fromLocalInput(raidForm.startedAt),
    endedAt: fromLocalInput(raidForm.endedAt),
    targetZones: parseMultiValueInput(raidForm.targetZones),
    targetBosses: parseMultiValueInput(raidForm.targetBosses),
    notes: raidForm.notes.trim() === '' ? null : raidForm.notes.trim(),
    isActive: raidForm.isActive
  };

  savingRaid.value = true;
  try {
    const updated = await api.updateAdminRaid(selectedRaidId.value, payload);
    if (updated) {
      selectedRaid.value = updated;
      applyRaidDetailToForm(updated);
      await loadAdminRaids();
    }
  } catch (error) {
    console.error('Failed to update raid event.', error);
    window.alert('Unable to update raid event. Please try again.');
  } finally {
    savingRaid.value = false;
  }
}

async function deleteRaid() {
  if (!selectedRaidId.value || deletingRaidId.value) {
    return;
  }

  const confirmed = window.confirm('Delete this raid event? This action cannot be undone.');
  if (!confirmed) {
    return;
  }

  deletingRaidId.value = selectedRaidId.value;
  try {
    await api.deleteAdminRaid(selectedRaidId.value);
    raids.value = raids.value.filter((raid) => raid.id !== selectedRaidId.value);
    closeRaidModal();
    await loadAdminRaids();
  } catch (error) {
    console.error('Failed to delete raid event.', error);
    window.alert('Unable to delete raid event. Please try again.');
  } finally {
    deletingRaidId.value = null;
  }
}

async function addMember() {
  if (!selectedGuildId.value || !membershipForm.userId) {
    return;
  }

  addingMember.value = true;
  try {
    await api.addAdminGuildMember(selectedGuildId.value, {
      userId: membershipForm.userId,
      role: membershipForm.role
    });
    membershipForm.userId = '';
    membershipForm.role = 'MEMBER';
    await Promise.all([loadGuildDetail(selectedGuildId.value), loadUsers()]);
  } catch (error) {
    console.error('Failed to add guild member.', error);
    window.alert('Unable to add guild member. Please try again.');
  } finally {
    addingMember.value = false;
  }
}

async function detachCharacter(character: { id: string; ownerName: string }) {
  if (!selectedGuildId.value || detachingCharacterId.value) {
    return;
  }

  const confirmed = window.confirm(`Remove ${character.ownerName}'s character from this guild?`);
  if (!confirmed) {
    return;
  }

  detachingCharacterId.value = character.id;
  try {
    await api.adminDetachCharacter(selectedGuildId.value, character.id);
    const updated = await api.fetchAdminGuildDetail(selectedGuildId.value);
    selectedGuild.value = updated;
  } catch (error) {
    console.error('Failed to detach guild character.', error);
    window.alert('Unable to remove character from the guild. Please try again.');
  } finally {
    detachingCharacterId.value = null;
  }
}

async function updateMemberRole(userId: string, role: GuildRole) {
  if (!selectedGuildId.value) {
    return;
  }

  updatingMemberId.value = userId;
  try {
    await api.updateAdminGuildMemberRole(selectedGuildId.value, userId, { role });
    await Promise.all([loadGuildDetail(selectedGuildId.value), loadUsers()]);
  } catch (error) {
    console.error('Failed to update member role.', error);
    window.alert('Unable to update member role. Please try again.');
  } finally {
    updatingMemberId.value = null;
  }
}

async function removeMember(userId: string) {
  if (!selectedGuildId.value) {
    return;
  }

  const confirmed = window.confirm('Remove this member from the guild?');
  if (!confirmed) {
    return;
  }

  removingMemberId.value = userId;
  try {
    await api.removeAdminGuildMember(selectedGuildId.value, userId);
    await Promise.all([loadGuildDetail(selectedGuildId.value), loadUsers()]);
  } catch (error) {
    console.error('Failed to remove guild member.', error);
    window.alert('Unable to remove guild member. Please try again.');
  } finally {
    removingMemberId.value = null;
  }
}

function setUserPage(page: number) {
  userPage.value = Math.min(Math.max(1, page), totalUserPages.value);
}

async function saveUserDetails() {
  if (!editingUser.value || savingUser.value) {
    return;
  }

  const payload: { displayName?: string; nickname?: string | null; email?: string } = {};

  const trimmedDisplayName = userForm.displayName.trim();
  if (trimmedDisplayName && trimmedDisplayName !== editingUser.value.displayName) {
    payload.displayName = trimmedDisplayName;
  }

  const trimmedNickname = userForm.nickname.trim();
  const normalizedNickname = trimmedNickname.length > 0 ? trimmedNickname : null;
  if (normalizedNickname !== (editingUser.value.nickname ?? null)) {
    payload.nickname = normalizedNickname;
  }

  const trimmedEmail = userForm.email.trim();
  if (trimmedEmail && trimmedEmail !== editingUser.value.email) {
    payload.email = trimmedEmail;
  }

  if (Object.keys(payload).length === 0) {
    closeUserModal();
    return;
  }

  savingUser.value = true;
  try {
    const updated = await api.updateAdminUser(editingUser.value.id, payload);
    users.value = users.value.map((existing) =>
      existing.id === updated.id ? updated : existing
    );
    if (selectedGuild.value) {
      selectedGuild.value = {
        ...selectedGuild.value,
        members: selectedGuild.value.members.map((member) =>
          member.user.id === updated.id
            ? {
                ...member,
                user: {
                  ...member.user,
                  displayName: updated.displayName,
                  nickname: updated.nickname ?? null,
                  email: updated.email
                }
              }
            : member
        )
      };
    }
    closeUserModal();
  } catch (error) {
    console.error('Failed to update user.', error);
    window.alert('Unable to update user. Please try again.');
  } finally {
    savingUser.value = false;
  }
}

async function deleteUser(user: AdminUserSummary) {
  if (deletingUserId.value) {
    return;
  }

  const confirmed = window.confirm(
    `Delete ${user.displayName}? This will remove the account and any guild memberships.`
  );
  if (!confirmed) {
    return;
  }

  deletingUserId.value = user.id;
  try {
    await api.deleteAdminUser(user.id);
    users.value = users.value.filter((existing) => existing.id !== user.id);
    if (selectedGuild.value) {
      selectedGuild.value = {
        ...selectedGuild.value,
        members: selectedGuild.value.members.filter(
          (member) => member.user.id !== user.id
        )
      };
    }
    if (showUserModal.value && editingUser.value?.id === user.id) {
      closeUserModal();
    }
    await loadGuilds();
    if (selectedGuildId.value) {
      await loadGuildDetail(selectedGuildId.value);
    }
  } catch (error) {
    console.error('Failed to delete user.', error);
    window.alert('Unable to delete user. Please try again.');
  } finally {
    deletingUserId.value = null;
  }
}

watch(userSearch, () => {
  userPage.value = 1;
});

watch(
  () => filteredUsers.value.length,
  () => {
    if (filteredUsers.value.length === 0) {
      userPage.value = 1;
      return;
    }
    if (userPage.value > totalUserPages.value) {
      userPage.value = totalUserPages.value;
    }
  }
);

watch(selectedGuildId, async (guildId) => {
  if (guildId) {
    await loadGuildDetail(guildId);
  } else {
    selectedGuild.value = null;
  }
});

watch(selectedGuild, (guild) => {
  guildForm.name = guild?.name ?? '';
  guildForm.description = guild?.description ?? '';
  membershipForm.userId = '';
  membershipForm.role = 'MEMBER';
});

watch(raids, (list) => {
  if (selectedRaidId.value && !list.some((raid) => raid.id === selectedRaidId.value)) {
    closeRaidModal();
  }
  if (showRaidDetailModal.value && selectedRaidId.value) {
    loadRaidDetail(selectedRaidId.value);
  }
});

onMounted(async () => {
  await Promise.all([loadUsers(), loadGuilds(), loadAdminRaids()]);
  if (selectedGuildId.value) {
    await loadGuildDetail(selectedGuildId.value);
  }
});
</script>

<style scoped>
.admin {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-bottom: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.section-header__titles h1 {
  margin: 0;
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.45);
  transition: transform 0.12s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 18px 40px rgba(59, 130, 246, 0.2);
}

.stat-card--accent {
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18));
}

.stat-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(226, 232, 240, 0.8);
}

.stat-card__value {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.stat-card__meta {
  font-size: 0.8rem;
  color: rgba(209, 213, 219, 0.75);
}

.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
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

.card--wide {
  width: 100%;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card__header--stack {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.card__actions {
  display: flex;
  gap: 0.75rem;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.user-list__item,
.guild-list__item,
.member-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.45);
  border-radius: 0.85rem;
  padding: 0.85rem 1rem;
  gap: 1rem;
}

.user-list__meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-list__guilds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.user-list__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-width: 240px;
}

.guild-list__item {
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, border-color 0.2s ease;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.guild-list__item:hover,
.guild-list__item:focus {
  background: rgba(59, 130, 246, 0.18);
  transform: translateY(-1px);
  outline: none;
}

.guild-list__item--active {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(59, 130, 246, 0.22);
}

.guild-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form__field span {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

.guild-members {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.guild-members__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.member-list__user {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.member-list__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.member-add {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.member-add__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 13, 23, 0.76);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 1200;
}

.modal-backdrop--user {
  z-index: 1300;
}

.modal {
  width: min(820px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.88));
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 0 24px 60px rgba(11, 19, 33, 0.65);
}

.modal--narrow {
  width: min(520px, 100%);
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.modal__titles h2 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.modal__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.icon-button {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: rgba(226, 232, 240, 0.85);
  border-radius: 999px;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.12s ease;
}

.icon-button:hover {
  color: #f8fafc;
  border-color: rgba(59, 130, 246, 0.65);
  transform: translateY(-1px);
}

.icon-button--refresh {
  width: 2rem;
  height: 2rem;
  font-size: 1rem;
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(148, 163, 184, 0.35);
}

.icon-button--refresh:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
  transform: translateY(-1px) rotate(-12deg);
}

.icon-button--refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.modal__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 0;
}

.user-form {
  display: grid;
  gap: 1rem;
}

.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid rgba(148, 163, 184, 0.25);
  border-top-color: rgba(59, 130, 246, 0.75);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(30, 41, 59, 0.75);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.textarea {
  min-height: 120px;
  resize: vertical;
}

.select {
  appearance: none;
  background: rgba(15, 23, 42, 0.6)
    url('data:image/svg+xml,%3Csvg width="10" height="6" viewBox="0 0 10 6" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath fill="%23cbd5f5" d="M5 6 0 0h10L5 6Z"/%3E%3C/svg%3E')
    no-repeat right 0.75rem center/10px 6px;
  padding-right: 2.5rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.raid-admin-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-admin-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.85rem;
  padding: 0.85rem 1rem;
}

.raid-admin-list__item--active {
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(30, 41, 59, 0.6);
}

.raid-admin-list__info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.raid-admin-list__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.form__field--inline {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.form__field--inline span {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

.form__field--inline input[type='checkbox'] {
  width: 1.1rem;
  height: 1.1rem;
}

.raid-filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.raid-filter {
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.raid-filter--active {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
}

.raid-attendance-overview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}

.raid-attendance-overview__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.raid-attendance-overview__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.75rem;
  padding: 0.6rem 0.85rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
  transform: translateY(-1px);
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn {
  padding: 0.55rem 1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.btn--small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.btn--accent {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #0f172a;
}

.btn--danger {
  background: rgba(248, 113, 113, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.9rem;
}

.tiny {
  font-size: 0.75rem;
}

@media (max-width: 960px) {
  .card__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .member-list__actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
