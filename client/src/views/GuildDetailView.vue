<template>
  <section v-if="guild">
    <div v-if="canViewDetails" class="guild-detail">
    <header class="section-header section-header--guild">
      <div class="guild-header guild-header--stack">
        <h1 class="guild-title">{{ guild.name }}</h1>
        <p v-if="guild.description" class="guild-subtitle muted">{{ guild.description }}</p>
      </div>
      <div class="guild-actions">
        <RouterLink
          v-if="canManageGuildSettings"
          class="guild-settings-button"
          :to="{ name: 'GuildSettings', params: { guildId } }"
        >
          <span aria-hidden="true">⚙️</span>
          <span>Settings</span>
        </RouterLink>
        <button
          v-if="canManageDiscordWebhook"
          class="discord-button"
          type="button"
          @click="showDiscordModal = true"
        >
          <svg viewBox="0 0 245 240" aria-hidden="true">
            <path
              d="M104.4 104.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1m36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1" />
            <path
              d="M189.5 20h-134C24.8 20 10 34.8 10 53.5v134C10 206.2 24.8 221 43.5 221h113.4l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V53.5C198 34.8 183.2 20 164.5 20zm-26.4 135s-2.5-3-4.6-5.6c9.1-2.6 12.5-8.4 12.5-8.4-2.8 1.8-5.4 3.1-7.8 4-3.4 1.4-6.7 2.3-9.9 2.9-6.5 1.2-12.5.9-17.6-.1-3.9-.8-7.3-1.8-10.1-2.9-1.6-.6-3.3-1.4-5-2.4-.2-.1-.4-.2-.6-.3-.1 0-.1-.1-.2-.1-1-.6-1.5-.9-1.5-.9s3.3 5.5 12.1 8.2c-2.1 2.6-4.7 5.7-4.7 5.7-15.4-.5-21.3-10.6-21.3-10.6 0-22.4 10-40.5 10-40.5 10-7.5 19.5-7.3 19.5-7.3l.7.9c-12.5 3.6-18.3 9.1-18.3 9.1s1.5-.8 4-2c7.3-3.2 13-4.1 15.4-4.3.4-.1.8-.1 1.3-.1 4.7-.6 10-1 15.6-1 .30 0 8.6.1 17.6 3.3 2.9 1.1 6.2 2.7 9.7 5.1 0 0-5.5-5.2-17.4-8.8l1-1.1s9.5-.2 19.5 7.3c0 0 10 18.2 10 40.5 0 .1-5.9 10.2-21.3 10.7z" />
          </svg>
          <span>Discord Webhook</span>
        </button>
        <button v-if="canPlanRaid" class="plan-raid-button" @click="showRaidModal = true">
          Plan Raid
        </button>
      </div>
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
              v-for="role in memberRoleFilterOptions"
              :key="role"
              :class="[
                'member-filter-button',
                {
                  'member-filter-button--active': memberRoleFilter === role,
                  'member-filter-button--applicants': role === 'APPLICANT' && hasPendingApplicants
                }
              ]"
              @click="memberRoleFilter = role"
            >
              {{ formatMemberFilterLabel(role) }}
              <span v-if="role === 'APPLICANT' && hasPendingApplicants" class="sr-only">
                Pending guild applications awaiting approval
              </span>
            </button>
          </div>
        </div>
        <p v-if="filteredMembers.length === 0" class="muted">No members match your search.</p>
        <ul v-else class="list">
          <li v-for="member in paginatedMembers" :key="member.id" class="list__item">
            <div>
              <strong>{{ preferredUserName(member.user) }}</strong>
              <span class="muted role"> ({{ formatMemberRole(member) }})</span>
              <span v-if="isApplicantEntry(member)" class="muted applicant-meta">
                Applied {{ formatDate(member.createdAt) }}
              </span>
            </div>
            <div v-if="canAdjustMember(member)" class="member-actions">
              <template v-if="isApplicantEntry(member)">
                <button
                  class="btn btn--accent btn--small"
                  :disabled="approvingApplicantId === member.id"
                  @click="approveApplicant(member)"
                >
                  {{ approvingApplicantId === member.id ? 'Approving…' : 'Approve' }}
                </button>
                <button
                  class="btn btn--danger btn--small"
                  :disabled="denyingApplicantId === member.id"
                  @click="denyApplicant(member)"
                >
                  {{ denyingApplicantId === member.id ? 'Denying…' : 'Deny' }}
                </button>
              </template>
              <template v-else>
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
                <button
                  v-if="canRemoveMember(member)"
                  class="btn btn--danger btn--small"
                  :disabled="removingMemberId === member.id"
                  @click="removeMember(member)"
                >
                  {{ removingMemberId === member.id ? 'Removing…' : 'Remove' }}
                </button>
              </template>
            </div>
          </li>
        </ul>
        <div v-if="memberTotalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="memberPage === 1"
            @click="setMemberPage(memberPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ memberPage }} of {{ memberTotalPages }}</span>
          <button
            class="pagination__button"
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
              v-for="option in characterClassOptionsWithCounts"
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
              <span class="roster-filter-count">{{ option.count }}</span>
            </button>
          </div>
        </div>
        <p v-if="filteredCharacters.length === 0" class="muted">No characters match your search.</p>
        <ul v-else class="list">
          <li
            v-for="character in paginatedCharacters"
            :key="character.id"
            class="list__item character-roster-entry"
          >
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
              <span class="muted small character-owner">{{ preferredUserName(character.user) }}</span>
            </div>
            <button
              v-if="canManageMembers"
              class="btn btn--small character-edit-button character-edit-button--standalone"
              type="button"
              @click="openCharacterModal(character)"
            >
              Edit
            </button>
          </li>
        </ul>
        <div v-if="characterTotalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="characterPage === 1"
            @click="setCharacterPage(characterPage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ characterPage }} of {{ characterTotalPages }}</span>
          <button
            class="pagination__button"
            :disabled="characterPage === characterTotalPages"
            @click="setCharacterPage(characterPage + 1)"
          >
            Next
          </button>
        </div>
      </article>

      <aside v-if="discordWidgetSrc" class="card discord-widget-card">
        <header class="discord-widget-card__header">
          <span class="discord-widget-card__title">
            <svg viewBox="0 0 245 240" aria-hidden="true">
              <path
                d="M104.4 104.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1m36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1"
              />
              <path
                d="M189.5 20h-134C24.8 20 10 34.8 10 53.5v134C10 206.2 24.8 221 43.5 221h113.4l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V53.5C198 34.8 183.2 20 164.5 20zm-26.4 135s-2.5-3-4.6-5.6c9.1-2.6 12.5-8.4 12.5-8.4-2.8 1.8-5.4 3.1-7.8 4-3.4 1.4-6.7 2.3-9.9 2.9-6.5 1.2-12.5.9-17.6-.1-3.9-.8-7.3-1.8-10.1-2.9-1.6-.6-3.3-1.4-5-2.4-.2-.1-.4-.2-.6-.3-.1 0-.1-.1-.2-.1-1-.6-1.5-.9-1.5-.9s3.3 5.5 12.1 8.2c-2.1 2.6-4.7 5.7-4.7 5.7-15.4-.5-21.3-10.6-21.3-10.6 0-22.4 10-40.5 10-40.5 10-7.5 19.5-7.3 19.5-7.3l.7.9c-12.5 3.6-18.3 9.1-18.3 9.1s1.5-.8 4-2c7.3-3.2 13-4.1 15.4-4.3.4-.1.8-.1 1.3-.1 4.7-.6 10-1 15.6-1 .3 0 8.6.1 17.6 3.3 2.9 1.1 6.2 2.7 9.7 5.1 0 0-5.5-5.2-17.4-8.8l1-1.1s9.5-.2 19.5 7.3c0 0 10 18.2 10 40.5 0 .1-5.9 10.2-21.3 10.7z"
              />
            </svg>
            <span>Discord Widget</span>
          </span>
          <p class="muted small">Peek into the voice lobby.</p>
        </header>
        <iframe
          class="discord-widget-card__iframe"
          :src="discordWidgetSrc"
          width="100%"
          height="260"
          allowtransparency="true"
          frameborder="0"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          title="Discord Widget"
        ></iframe>
      </aside>
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
          v-for="raidItem in renderableRaids"
          :key="raidItem.id"
          class="raid-list__item"
          role="button"
          tabindex="0"
          @click="openRaid(raidItem.id)"
          @keydown.enter.prevent="openRaid(raidItem.id)"
          @keydown.space.prevent="openRaid(raidItem.id)"
        >
          <div class="raid-list__content">
            <strong>{{ raidItem.name }}</strong>
            <span class="muted raid-meta">
              {{ formatDate(raidItem.startTime) }} • {{ formatTargetZones(raidItem.targetZones) }}
            </span>
          </div>
          <div class="raid-list__status">
            <span
              v-if="raidItem.logMonitor?.isActive"
              class="raid-monitor-indicator"
              role="img"
              :aria-label="`Continuous monitoring active${raidItem.logMonitor?.userDisplayName ? ' by ' + raidItem.logMonitor.userDisplayName : ''}`"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span class="muted arrow">Open</span>
          </div>
        </li>
      </ul>
    </section>

    <RaidModal
      v-if="showRaidModal && guild"
      :guild-id="guild.id"
      :default-start-time="guild.defaultRaidStartTime ?? null"
      :default-end-time="guild.defaultRaidEndTime ?? null"
      :default-discord-voice-url="guild.defaultDiscordVoiceUrl ?? null"
      @close="showRaidModal = false"
      @created="handleRaidCreated"
    />
    <DiscordWebhookModal
      v-if="showDiscordModal && guild"
      :guild-id="guild.id"
      @close="showDiscordModal = false"
    />
    <CharacterModal
      v-if="showCharacterForm && guild"
      :guilds="modalGuildOptions"
      :can-set-main="true"
      :editing="Boolean(editingCharacter)"
      :character="editingCharacter || undefined"
      :context-guild-id="modalContextGuildId"
      @close="closeCharacterModal"
      @updated="handleGuildCharacterUpdated"
    />
  </div>
    <div v-else class="guild-summary">
      <div class="guild-summary__body">
        <h1>{{ guild.name }}</h1>
        <p v-if="guild.description" class="muted">
          {{ guild.description }}
        </p>
        <div v-if="discordWidgetSrc" class="guild-summary__widget">
          <iframe
            :src="discordWidgetSrc"
            width="100%"
            height="280"
            allowtransparency="true"
            frameborder="0"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            title="Discord Widget"
          ></iframe>
        </div>
        <div class="guild-summary__actions">
          <button
            v-if="canApplyToGuild"
            class="cta-button cta-button--apply"
            :disabled="applying"
            @click="applyToCurrentGuild"
          >
            {{ applying ? 'Applying…' : 'Apply to Join' }}
          </button>
          <button
            v-if="showWithdrawButton"
            class="cta-button cta-button--withdraw"
            :disabled="withdrawingApplication"
            @click="withdrawCurrentApplication"
          >
            {{ withdrawingApplication ? 'Withdrawing…' : 'Withdraw Application' }}
          </button>
        </div>
        <p v-if="pendingForThisGuild" class="muted small">Application pending review.</p>
        <p v-else-if="pendingElsewhere" class="muted small">
          You already have an active application with {{ pendingApplication?.guild?.name ?? 'another guild' }}.
          Withdraw it before applying here.
        </p>
        <p v-if="applicationError" class="error">{{ applicationError }}</p>
      </div>
    </div>
  </section>
  <p v-else class="muted">Loading guild…</p>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';
import DiscordWebhookModal from '../components/DiscordWebhookModal.vue';
import CharacterModal from '../components/CharacterModal.vue';
import {
  api,
  type GuildDetail,
  type RaidEventSummary,
  type GuildApplicant,
  type GuildApplicationSummary
} from '../services/api';
import type { GuildRole, CharacterClass } from '../services/types';
import { guildRoleOrder, characterClassLabels, getCharacterClassIcon } from '../services/types';
import { useAuthStore } from '../stores/auth';
import { buildCharacterFilterOptions } from '../hooks/useCharacterFilters';

const route = useRoute();
const guildId = route.params.guildId as string;

type GuildMember = GuildDetail['members'][number];
interface ApplicantMember {
  id: string;
  role: 'APPLICANT';
  user: GuildMember['user'];
  createdAt: string;
  isApplicant: true;
}
type GuildMemberEntry = GuildMember | ApplicantMember;
type EditableCharacter = {
  id: string;
  name: string;
  level: number;
  class: CharacterClass;
  guildId?: string | null;
  isMain: boolean;
};

const guild = ref<GuildDetail | null>(null);
const discordWidgetSrc = computed(() => {
  if (!guild.value?.discordWidgetEnabled) {
    return null;
  }
  const serverId = guild.value?.discordWidgetServerId?.trim();
  if (!serverId) {
    return null;
  }
  const theme = (guild.value?.discordWidgetTheme ?? 'DARK').toLowerCase() === 'light' ? 'light' : 'dark';
  return `https://discord.com/widget?id=${encodeURIComponent(serverId)}&theme=${theme}`;
});
const showCharacterForm = ref(false);
const editingCharacter = ref<EditableCharacter | null>(null);
const modalContextGuildId = ref<string | null>(null);
const modalGuildOptions = computed(() =>
  guild.value ? [{ id: guild.value.id, name: guild.value.name }] : []
);

const raids = ref<RaidEventSummary[]>([]);
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const showDiscordModal = ref(false);
let raidRefreshTimer: number | null = null;
const router = useRouter();
const updatingMemberId = ref<string | null>(null);
const removingMemberId = ref<string | null>(null);
const renderableRaids = computed(() =>
  raids.value
    .filter(isRaidRenderable)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
);

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.userId ?? null);

const characterClassOptions = computed(() => buildCharacterFilterOptions(characterClassLabels));
const characterClassOptionsWithCounts = computed(() => {
  const roster = guild.value?.characters ?? [];
  const counts = roster.reduce<Record<string, number>>((acc, character) => {
    const key = character.class ?? 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    acc.ALL = (acc.ALL ?? 0) + 1;
    if (character.isMain) {
      acc.MAIN = (acc.MAIN ?? 0) + 1;
    }
    return acc;
  }, { ALL: 0, MAIN: 0 });

  return characterClassOptions.value.map((option) => {
    const count =
      option.value === 'MAIN'
        ? counts.MAIN ?? 0
        : option.value === 'ALL'
          ? counts.ALL ?? roster.length
          : counts[option.value] ?? 0;

    return {
      ...option,
      count
    };
  });
});

const canPlanRaid = computed(() => {
  const role = actorRole.value;
  if (!role) {
    return false;
  }

  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});

const canManageDiscordWebhook = computed(() => {
  const role = actorRole.value;
  if (!role) {
    return false;
  }
  return role === 'LEADER' || role === 'OFFICER';
});

const canManageGuildSettings = computed(() => {
  const role = actorRole.value;
  return role === 'LEADER' || role === 'OFFICER';
});


const pendingApplication = computed(() => authStore.pendingApplication);
const viewerApplication = computed(() => guild.value?.viewerApplication ?? null);
const hasPrimaryGuild = computed(() => Boolean(authStore.primaryGuild));
const pendingForThisGuild = computed(() => {
  if (viewerApplication.value?.status === 'PENDING') {
    return true;
  }
  return pendingApplication.value?.guildId === guildId && pendingApplication.value.status === 'PENDING';
});
const pendingElsewhere = computed(() => {
  if (!pendingApplication.value) {
    return false;
  }
  return pendingApplication.value.guildId !== guildId && pendingApplication.value.status === 'PENDING';
});

const canApplyToGuild = computed(() => !canViewDetails.value && !hasPrimaryGuild.value && !pendingForThisGuild.value && !pendingElsewhere.value);
const showWithdrawButton = computed(() => pendingForThisGuild.value);

const applying = ref(false);
const withdrawingApplication = ref(false);
const applicationError = ref<string | null>(null);

const memberSearch = ref('');
const memberRoleFilter = ref<'ALL' | GuildRole | 'APPLICANT'>('ALL');
const memberPage = ref(1);
const membersPerPage = 10;

const characterSearch = ref('');
const characterClassFilter = ref<'ALL' | 'MAIN' | CharacterClass>('ALL');
const characterPage = ref(1);
const charactersPerPage = 5;

const guildPermissions = computed(() => guild.value?.permissions ?? null);
const canViewDetails = computed(() => guildPermissions.value?.canViewDetails ?? false);
const canManageMembers = computed(() => guildPermissions.value?.canManageMembers ?? false);
const canViewApplicants = computed(() => guildPermissions.value?.canViewApplicants ?? false);

watch(
  () => route.query.members,
  (value) => {
    const normalized = normalizeMemberFilterQuery(value);
    if (normalized && memberRoleFilter.value !== normalized) {
      memberRoleFilter.value = normalized;
    }
  },
  { immediate: true }
);

watch(memberRoleFilter, (value) => {
  const normalized = value === 'APPLICANT' ? 'APPLICANT' : value;
  const currentQueryValue = normalizeMemberFilterQuery(route.query.members);
  if (value === 'ALL' && (!currentQueryValue || currentQueryValue === 'ALL')) {
    return;
  }

  const nextQuery = { ...route.query } as Record<string, unknown>;
  if (value === 'ALL') {
    if (nextQuery.members) {
      delete nextQuery.members;
      router.replace({ query: nextQuery });
    }
    return;
  }

  if (currentQueryValue === normalized) {
    return;
  }

  nextQuery.members = normalized;
  router.replace({ query: nextQuery });
});

const applicantEntries = computed<ApplicantMember[]>(() => {
  if (!canViewApplicants.value || !guild.value?.applicants) {
    return [];
  }

  return guild.value.applicants.map((application) => ({
    id: application.id,
    role: 'APPLICANT' as const,
    createdAt: application.createdAt,
    user: application.user,
    isApplicant: true
  }));
});

const hasPendingApplicants = computed(() => {
  if (!canViewApplicants.value) {
    return false;
  }
  return (guild.value?.applicants?.length ?? 0) > 0;
});

const combinedMembers = computed<GuildMemberEntry[]>(() => {
  const baseMembers = guild.value?.members ?? [];
  if (!canViewApplicants.value) {
    return baseMembers;
  }

  return [...baseMembers, ...applicantEntries.value];
});

const memberRoleFilterOptions = computed(() => {
  const base: Array<'ALL' | GuildRole | 'APPLICANT'> = ['ALL', ...guildRoleOrder];
  if (canViewApplicants.value) {
    return [...base, 'APPLICANT'];
  }
  return base;
});

const memberRolePriority = new Map<GuildRole, number>(
  guildRoleOrder.map((role, index) => [role, index] as [GuildRole, number])
);

const filteredMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase();
  const roleFilter = memberRoleFilter.value;

  const matches = combinedMembers.value.filter((member) => {
    const name = preferredUserName(member.user)?.toLowerCase() ?? '';
    const roleLabel = 'role' in member ? roleLabels[(member as GuildMember).role]?.toLowerCase() ?? (member as GuildMember).role.toLowerCase() : 'applicant';
    const matchesQuery = !query || name.includes(query) || roleLabel.includes(query);

    if (roleFilter === 'ALL') {
      return matchesQuery;
    }

    if (roleFilter === 'APPLICANT') {
      return matchesQuery && isApplicantEntry(member);
    }

    if (isApplicantEntry(member)) {
      return false;
    }

    return matchesQuery && member.role === roleFilter;
  });

  if (roleFilter !== 'ALL') {
    return matches;
  }

  const getPriority = (member: GuildMemberEntry) => {
    if (isApplicantEntry(member)) {
      return guildRoleOrder.length;
    }

    return memberRolePriority.get(member.role) ?? guildRoleOrder.length;
  };

  return matches.sort((a, b) => {
    const priorityDelta = getPriority(a) - getPriority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const nameA = preferredUserName(a.user)?.toLowerCase() ?? '';
    const nameB = preferredUserName(b.user)?.toLowerCase() ?? '';
    return nameA.localeCompare(nameB);
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
    const className = (character.class ?? '').toString().toLowerCase();
    const owner = preferredUserName(character.user)?.toLowerCase() ?? '';
    const matchesQuery =
      !query || name.includes(query) || className.includes(query) || owner.includes(query);

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

watch(
  [memberSearch, memberRoleFilter, () => guild.value?.members, () => guild.value?.applicants],
  () => {
    memberPage.value = 1;
  },
  { deep: true }
);

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

watch(canViewDetails, (value) => {
  if (value) {
    loadRaids();
    startRaidRefreshPolling();
  } else {
    stopRaidRefreshPolling();
    raids.value = [];
  }
});

function setMemberPage(page: number) {
  memberPage.value = Math.min(Math.max(1, page), memberTotalPages.value);
}

function setCharacterPage(page: number) {
  characterPage.value = Math.min(Math.max(1, page), characterTotalPages.value);
}

function openCharacterModal(character: GuildDetail['characters'][number]) {
  editingCharacter.value = {
    id: character.id,
    name: character.name,
    level: character.level,
    class: character.class,
    guildId: character.guildId ?? null,
    isMain: character.isMain
  };
  modalContextGuildId.value = guild.value?.id ?? null;
  showCharacterForm.value = true;
}

function closeCharacterModal() {
  showCharacterForm.value = false;
  editingCharacter.value = null;
  modalContextGuildId.value = null;
}

async function handleGuildCharacterUpdated() {
  closeCharacterModal();
  await loadGuild();
}

const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member',
  APPLICANT: 'Applicant'
};

async function loadGuild() {
  guild.value = await api.fetchGuildDetail(guildId);
}

async function loadRaids() {
  loadingRaids.value = true;
  try {
    const response = await api.fetchRaidsForGuild(guildId);
    raids.value = response.raids ?? [];
  } finally {
    loadingRaids.value = false;
  }
}

function startRaidRefreshPolling() {
  stopRaidRefreshPolling();
  raidRefreshTimer = window.setInterval(() => {
    loadRaids().catch((error) => console.warn('Failed to refresh raids', error));
  }, 30_000);
}

function stopRaidRefreshPolling() {
  if (raidRefreshTimer) {
    clearInterval(raidRefreshTimer);
    raidRefreshTimer = null;
  }
}

const actorRole = computed<GuildRole | null>(() => {
  if (!guild.value || !currentUserId.value) {
    return null;
  }

  const membership = guild.value.members.find((member) => member.user.id === currentUserId.value);
  return membership?.role ?? null;
});

function canAdjustMember(member: GuildMemberEntry) {
  if (isApplicantEntry(member)) {
    return canViewApplicants.value;
  }

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

function availableRoles(member: GuildMemberEntry): GuildRole[] {
  if (isApplicantEntry(member)) {
    return [];
  }

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

function canRemoveMember(member: GuildMemberEntry) {
  if (isApplicantEntry(member)) {
    return false;
  }

  const actor = actorRole.value;
  if (!actor) {
    return false;
  }

  if (member.user.id === currentUserId.value) {
    return false;
  }

  if (member.role === 'LEADER') {
    return actor === 'LEADER';
  }

  if (member.role === 'OFFICER') {
    return actor === 'LEADER';
  }

  return actor === 'LEADER' || actor === 'OFFICER';
}

async function removeMember(member: GuildMemberEntry) {
  if (!guild.value || removingMemberId.value || isApplicantEntry(member)) {
    return;
  }

  const confirmed = window.confirm(
    `Remove ${preferredUserName(member.user)} from ${guild.value.name}?`
  );
  if (!confirmed) {
    return;
  }

  removingMemberId.value = member.id;
  try {
    await api.deleteGuildMember(guildId, member.user.id);
    await loadGuild();
  } catch (error) {
    window.alert(extractErrorMessage(error, 'Unable to remove guild member.'));
  } finally {
    removingMemberId.value = null;
  }
}

const approvingApplicantId = ref<string | null>(null);
const denyingApplicantId = ref<string | null>(null);

async function approveApplicant(applicant: ApplicantMember) {
  if (approvingApplicantId.value || denyingApplicantId.value) {
    return;
  }

  approvingApplicantId.value = applicant.id;
  try {
    await api.approveGuildApplication(guildId, applicant.id);
    await loadGuild();
  } catch (error) {
    window.alert(extractErrorMessage(error, 'Unable to approve application.'));
  } finally {
    approvingApplicantId.value = null;
  }
}

async function denyApplicant(applicant: ApplicantMember) {
  if (approvingApplicantId.value || denyingApplicantId.value) {
    return;
  }

  const confirmed = window.confirm('Deny this guild application?');
  if (!confirmed) {
    return;
  }

  denyingApplicantId.value = applicant.id;
  try {
    await api.denyGuildApplication(guildId, applicant.id);
    await loadGuild();
  } catch (error) {
    window.alert(extractErrorMessage(error, 'Unable to deny application.'));
  } finally {
    denyingApplicantId.value = null;
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

function formatDate(date?: string | null) {
  if (!date) {
    return '—';
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function preferredUserName(user: { displayName?: string; nickname?: string | null }) {
  return user.nickname ?? user.displayName ?? '';
}

function handleRaidCreated() {
  showRaidModal.value = false;
  loadRaids();
}

async function applyToCurrentGuild() {
  if (applying.value || !guild.value) {
    return;
  }

  applicationError.value = null;
  applying.value = true;
  try {
    await api.applyToGuild(guildId);
    await Promise.all([loadGuild(), authStore.fetchCurrentUser()]);
  } catch (error) {
    applicationError.value = extractErrorMessage(error, 'Unable to submit guild application.');
  } finally {
    applying.value = false;
  }
}

async function withdrawCurrentApplication() {
  if (withdrawingApplication.value) {
    return;
  }

  withdrawingApplication.value = true;
  applicationError.value = null;
  try {
    await api.withdrawGuildApplication(guildId);
    await Promise.all([loadGuild(), authStore.fetchCurrentUser()]);
  } catch (error) {
    applicationError.value = extractErrorMessage(error, 'Unable to withdraw guild application.');
  } finally {
    withdrawingApplication.value = false;
  }
}

function openRaid(raidId?: string | null) {
  if (!raidId) {
    return;
  }

  router.push({ name: 'RaidDetail', params: { raidId } });
}

function formatTargetZones(zones: RaidEventSummary['targetZones']) {
  if (Array.isArray(zones) && zones.length > 0) {
    return zones.join(', ');
  }

  if (typeof zones === 'string' && zones.trim().length > 0) {
    return zones;
  }

  return 'Unknown Target';
}

function isRaidRenderable(raid: RaidEventSummary) {
  if (!raid || !raid.id || !raid.name) {
    return false;
  }

  const ended = raidHasEnded(raid);
  const started = raidHasStarted(raid);

  if (started && !ended) {
    return true;
  }

  if (ended) {
    return false;
  }

  const now = new Date();
  const start = raid.startTime ? new Date(raid.startTime) : null;

  if (start && !Number.isNaN(start.getTime())) {
    return start >= now;
  }

  return false;
}

function raidHasEnded(raid: RaidEventSummary) {
  if (!raid.endedAt) {
    return false;
  }
  return new Date(raid.endedAt).getTime() <= Date.now();
}

function raidHasStarted(raid: RaidEventSummary) {
  if (!raid.startedAt) {
    return false;
  }
  return new Date(raid.startedAt).getTime() <= Date.now();
}

function isApplicantEntry(member: GuildMemberEntry): member is ApplicantMember {
  return (member as ApplicantMember).isApplicant === true;
}

function formatMemberFilterLabel(role: string) {
  if (role === 'ALL') {
    return 'All';
  }

  if (role === 'APPLICANT') {
    return 'Applicants';
  }

  return roleLabels[role as GuildRole] ?? role;
}

function formatMemberRole(member: GuildMemberEntry) {
  if (isApplicantEntry(member)) {
    return 'Applicant';
  }

  return roleLabels[member.role] ?? member.role;
}

function normalizeMemberFilterQuery(value: unknown): 'ALL' | GuildRole | 'APPLICANT' | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const upper = raw.toUpperCase();
  if (upper === 'APPLICANT' || upper === 'APPLICANTS') {
    return 'APPLICANT';
  }
  if (upper === 'ALL') {
    return 'ALL';
  }
  if ((guildRoleOrder as readonly string[]).includes(upper)) {
    return upper as GuildRole;
  }
  return null;
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
  if (canViewDetails.value) {
    await loadRaids();
  }
});

watch(showDiscordModal, (isOpen) => {
  document.body.classList.toggle('modal-open', isOpen);
});

onUnmounted(() => {
  document.body.classList.remove('modal-open');
  stopRaidRefreshPolling();
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

.guild-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.guild-settings-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  color: #e2e8f0;
  text-decoration: none;
  background: rgba(15, 23, 42, 0.6);
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.guild-settings-button:hover,
.guild-settings-button:focus-visible {
  border-color: rgba(99, 102, 241, 0.8);
  color: #c7d2fe;
  transform: translateY(-1px);
}

@media (min-width: 640px) {
  .guild-actions {
    flex-direction: row;
  }
}

.discord-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(99, 102, 241, 0.6);
  background: linear-gradient(135deg, rgba(88, 101, 242, 0.9), rgba(59, 130, 246, 0.7));
  color: #f8fafc;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.discord-button svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.discord-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.55);
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

.discord-widget-card {
  gap: 0.75rem;
  padding: 1.25rem;
  background: rgba(15, 23, 42, 0.6);
}

.discord-widget-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.discord-widget-card__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.discord-widget-card__title svg {
  width: 20px;
  height: 20px;
  fill: rgba(148, 163, 184, 0.9);
}

.discord-widget-card__iframe {
  border: none;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.85);
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

.character-roster-entry {
  align-items: stretch;
  gap: 1rem;
}

.character-roster-entry .character-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.character-owner {
  display: block;
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

.btn--accent {
  padding: 0.35rem 0.75rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.7), rgba(59, 130, 246, 0.5));
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 6px 14px rgba(59, 130, 246, 0.2);
}

.btn--accent:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.5);
}

.btn--accent:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger {
  padding: 0.35rem 0.75rem;
  background: rgba(248, 113, 113, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.45);
  color: #fee2e2;
  transform: translateY(-1px);
}

.btn--danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.applicant-meta {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
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

.raid-list__content {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.raid-list__status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-list__item:hover,
.raid-list__item:focus {
  background: rgba(59, 130, 246, 0.15);
  transform: translateY(-1px);
  outline: none;
}

.raid-monitor-indicator {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.05));
  border: 1px solid rgba(14, 165, 233, 0.6);
  color: #bae6fd;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px rgba(14, 165, 233, 0.35);
}

.raid-monitor-indicator::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  border: 2px solid rgba(14, 165, 233, 0.35);
  animation: raid-monitor-pulse 2s infinite;
  pointer-events: none;
}

.raid-monitor-indicator svg {
  width: 18px;
  height: 18px;
}

@keyframes raid-monitor-pulse {
  0% {
    opacity: 0.85;
    transform: scale(0.9);
  }
  70% {
    opacity: 0;
    transform: scale(1.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.45);
  }
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

.character-edit-button {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(96, 165, 250, 0.45);
  color: #dbeafe;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: inset 0 0 8px rgba(14, 165, 233, 0.15);
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.character-edit-button:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(14, 165, 233, 0.65);
  color: #f8fafc;
  box-shadow: 0 8px 18px rgba(14, 165, 233, 0.2), inset 0 0 12px rgba(14, 165, 233, 0.3);
}

.character-edit-button:focus-visible {
  outline: 2px solid rgba(14, 165, 233, 0.55);
  outline-offset: 2px;
}

.character-edit-button--standalone {
  align-self: center;
  min-width: 92px;
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

.guild-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.5rem;
  padding: 2rem;
}

.guild-summary__body {
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.guild-summary__widget {
  width: min(360px, 100%);
  margin: 0 auto;
  border-radius: 0.9rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.55);
}

.guild-summary__widget iframe {
  display: block;
  width: 100%;
  border: none;
}

.guild-summary__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.cta-button {
  padding: 0.6rem 1.2rem;
  border-radius: 0.85rem;
  border: 1px solid transparent;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 0.12s ease, box-shadow 0.25s ease, border-color 0.2s ease, background 0.2s ease;
}

.cta-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.cta-button--apply {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(99, 102, 241, 0.85));
  border-color: rgba(14, 165, 233, 0.35);
  color: #0b1120;
}

.cta-button--apply:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px rgba(56, 189, 248, 0.28);
  border-color: rgba(191, 219, 254, 0.75);
}

.cta-button--withdraw {
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.12), rgba(71, 85, 105, 0.18));
  border-color: rgba(148, 163, 184, 0.4);
  color: #d1d9e5;
}

.cta-button--withdraw:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(248, 113, 113, 0.2);
  border-color: rgba(248, 113, 113, 0.55);
  color: #fee2e2;
}

.error {
  color: #fca5a5;
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
  position: relative;
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

.member-filter-button--applicants {
  padding-right: 1.75rem;
}

.member-filter-button--applicants::after {
  content: '!';
  position: absolute;
  top: 50%;
  right: 0.2rem;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  color: #facc15;
  font-size: 1.45rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: none;
  text-shadow: 0 0 8px rgba(250, 204, 21, 0.9), 0 0 18px rgba(250, 204, 21, 0.65);
  pointer-events: none;
}

.member-filter-button--active.member-filter-button--applicants::after {
  text-shadow: 0 0 12px rgba(250, 204, 21, 0.95), 0 0 24px rgba(250, 204, 21, 0.7);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
  overflow: visible;
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

.roster-filter-count {
  position: absolute;
  bottom: -0.25rem;
  right: -0.2rem;
  min-width: 1.6rem;
  min-height: 1.6rem;
  border-radius: 999px;
  padding: 0 0.4rem;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
  font-size: 0.72rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.6);
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
