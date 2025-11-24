<template>
  <section class="dashboard">
    <header class="section-header">
      <div>
        <h1>Dashboard</h1>
        <p>Quick overview of your characters and recent raid attendance.</p>
      </div>
    </header>

    <div class="grid">
      <article class="card">
        <header class="card__header">
          <h2>Your Characters</h2>
      <button class="btn btn--secondary" type="button" @click="openCharacterModal()">
        Add Character
      </button>
        </header>

        <p v-if="characterError" class="character-error">{{ characterError }}</p>

        <p v-if="loadingCharacters" class="muted">Loading characters...</p>
        <p v-else-if="characters.length === 0" class="muted">
          You have not registered any characters yet.
        </p>
        <ul v-else class="list">
          <li v-for="character in characters" :key="character.id" class="list__item">
            <div class="character-summary">
              <div class="character-heading">
                <CharacterLink class="character-name-link" :name="character.name" />
                <span class="character-level">({{ character.level }})</span>
                <span v-if="character.isMain" class="badge badge--main">Main</span>
              </div>
              <span class="character-meta muted">
                <img
                  v-if="getCharacterClassIcon(character.class)"
                  :src="getCharacterClassIcon(character.class) || undefined"
                  :alt="formatClass(character.class as CharacterClass) || 'Unknown'"
                  class="class-icon"
                />
                <span>{{ formatClass(character.class as CharacterClass) || 'Unknown' }}</span>
              </span>
            </div>
            <div class="character-actions">
              <span v-if="character.guild" class="tag">{{ character.guild.name }}</span>
              <div class="character-action-row">
                <button
                  class="btn btn--small btn--toggle-main"
                  :class="{
                    'btn--toggle-main--active': character.isMain,
                    'btn--toggle-main--inactive': !character.isMain
                  }"
                  :disabled="
                    updatingCharacterId === character.id || (mainCount >= 2 && !character.isMain)
                  "
                  @click="toggleCharacterMain(character)"
                >
                  <span v-if="updatingCharacterId === character.id">Updating…</span>
                  <span v-else-if="character.isMain">Unset Main</span>
                  <span v-else>Set as Main</span>
                </button>
                <button class="btn btn--small character-edit-button" type="button" @click="openCharacterModal(character)">
                  Edit
                </button>
              </div>
            </div>
          </li>
        </ul>
      </article>

      <article class="card">
        <header class="card__header">
          <h2>Recent Raid Attendance</h2>
        </header>
        <p v-if="loadingAttendance" class="muted">Loading attendance…</p>
        <p v-else-if="attendanceError" class="error">{{ attendanceError }}</p>
        <p v-else-if="recentAttendance.length === 0" class="muted">
          Attendance analytics will appear here as raid events are logged.
        </p>
        <ul v-else class="attendance-list">
          <li
            v-for="event in paginatedAttendance"
            :key="event.id"
            :class="['attendance-list__item', { 'attendance-list__item--expanded': isExpanded(event.id) }]"
          >
            <button
              class="attendance-list__toggle"
              type="button"
              @click="toggleAttendance(event.id)"
              :aria-expanded="isExpanded(event.id)"
            >
              <div class="attendance-list__header">
                <div>
                  <strong>{{ event.raid.name }}</strong>
                  <div class="attendance-list__meta muted small">
                    {{ formatDate(event.createdAt) }} • {{ event.raid.guild.name }}
                  </div>
                  <div class="attendance-list__summary muted small">
                    {{ event.characters.length }} attendee{{ event.characters.length === 1 ? '' : 's' }} recorded
                  </div>
                </div>
                <div class="attendance-list__header-right">
                  <span class="attendance-badge" :class="eventBadgeVariant(event.eventType)">
                    {{ formatEventType(event.eventType) }}
                  </span>
                  <span
                    class="attendance-toggle-icon"
                    :class="{ 'attendance-toggle-icon--expanded': isExpanded(event.id) }"
                    aria-hidden="true"
                  >
                    >
                  </span>
                </div>
              </div>
            </button>
            <div v-if="isExpanded(event.id)" class="attendance-details">
              <ul class="attendance-records">
                <li
                  v-for="record in event.characters"
                  :key="record.id"
                  class="attendance-records__item"
                >
                  <div class="attendance-records__main">
                    <div class="record-heading">
                      <CharacterLink class="record-name" :name="record.characterName" />
                      <span v-if="record.isMain" class="badge badge--main">Main</span>
                    </div>
                    <span v-if="record.class" class="record-class muted small">
                      <img
                        v-if="getCharacterClassIcon(record.class)"
                        :src="getCharacterClassIcon(record.class) || undefined"
                        :alt="formatClass(record.class) || 'Unknown'"
                        class="class-icon"
                      />
                      <span>{{ formatClass(record.class) || 'Unknown' }}</span>
                    </span>
                  </div>
                  <span class="attendance-badge" :class="statusBadgeVariant(record.status)">
                    {{ formatStatus(record.status) }}
                  </span>
                </li>
              </ul>
            </div>
          </li>
        </ul>
        <div v-if="attendanceTotalPages > 1" class="pagination">
          <button
            class="pagination__button"
            :disabled="attendancePage === 1"
            @click="setAttendancePage(attendancePage - 1)"
          >
            Previous
          </button>
          <span class="pagination__label">Page {{ attendancePage }} of {{ attendanceTotalPages }}</span>
          <button
            class="pagination__button"
            :disabled="attendancePage === attendanceTotalPages"
            @click="setAttendancePage(attendancePage + 1)"
          >
            Next
          </button>
        </div>
      </article>
      <article class="card">
        <header class="card__header">
          <div>
            <h2>Recent Loot</h2>
            <p class="muted">Latest drops earned by your registered characters.</p>
          </div>
        </header>
        <p v-if="loadingLoot" class="muted">Loading loot…</p>
        <p v-else-if="lootError" class="error">{{ lootError }}</p>
        <p v-else-if="characters.length === 0" class="muted">Add a character to start tracking loot history.</p>
        <p v-else-if="recentLoot.length === 0" class="muted">Loot earned by your characters will show up here.</p>
        <ul v-else class="recent-loot">
          <li
            v-for="entry in recentLoot"
            :key="entry.id"
            class="recent-loot__item"
            role="button"
            tabindex="0"
            @click="openAllaSearch(entry.itemName, entry.itemId)"
            @keyup.enter="openAllaSearch(entry.itemName, entry.itemId)"
          >
            <div class="recent-loot__icon">
              <template v-if="entry.itemIconId != null">
                <img
                  :src="getLootIconSrc(entry.itemIconId)"
                  :alt="`${entry.itemName} icon`"
                  loading="lazy"
                />
              </template>
              <span v-else class="recent-loot__emoji">{{ entry.emoji ?? '💎' }}</span>
            </div>
            <div class="recent-loot__details">
              <p class="recent-loot__item-name">{{ entry.itemName }}</p>
              <p class="recent-loot__meta">
                <template v-if="entry.isGuildBank">
                  <span class="recent-loot__looter">{{ entry.displayLooterName }}</span>
                </template>
                <template v-else-if="entry.isMasterLooter">
                  <span class="recent-loot__looter recent-loot__looter--unassigned">
                    {{ entry.displayLooterName }}
                  </span>
                </template>
                <template v-else>
                  <CharacterLink class="recent-loot__looter" :name="entry.displayLooterName" />
                </template>
                • {{ entry.raid.guild.name }} •
                {{ formatDate(entry.eventTime ?? entry.raid.startTime) }}
              </p>
            </div>
          </li>
        </ul>
        <div v-if="lootTotalPages > 1" class="pagination">
          <button class="pagination__button" :disabled="lootPage === 1" @click="setLootPage(lootPage - 1)">
            Previous
          </button>
          <span class="pagination__label">Page {{ lootPage }} of {{ lootTotalPages }}</span>
          <button
            class="pagination__button"
            :disabled="lootPage === lootTotalPages"
            @click="setLootPage(lootPage + 1)"
          >
            Next
          </button>
        </div>
      </article>
    </div>

    <CharacterModal
      v-if="showCharacterForm"
      :guilds="guilds"
      :can-set-main="mainCount < 2"
      :editing="Boolean(editingCharacter)"
      :character="editingCharacter || undefined"
      @close="closeCharacterModal"
      @created="handleCharacterCreated"
      @updated="handleCharacterUpdated"
      @deleted="handleCharacterDeleted"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import CharacterModal from '../components/CharacterModal.vue';
import CharacterLink from '../components/CharacterLink.vue';
import { api, type GuildSummary, type RecentAttendanceEntry, type RecentLootEntry, type UserCharacter } from '../services/api';
import { characterClassLabels, getCharacterClassIcon } from '../services/types';
import type { AttendanceStatus, CharacterClass } from '../services/types';
import { getLootIconSrc } from '../utils/itemIcons';
import { getGuildBankDisplayName, normalizeLooterName } from '../utils/lootNames';

type EditableCharacter = {
  id: string;
  name: string;
  level: number;
  class: CharacterClass;
  guildId?: string | null;
  isMain: boolean;
};

type RecentLootDisplay = RecentLootEntry & {
  displayLooterName: string;
  isGuildBank: boolean;
  isMasterLooter: boolean;
};

const characters = ref<UserCharacter[]>([]);
const guilds = ref<GuildSummary[]>([]);
const loadingCharacters = ref(false);
const showCharacterForm = ref(false);
const editingCharacter = ref<EditableCharacter | null>(null);
const recentAttendance = ref<RecentAttendanceEntry[]>([]);
const loadingAttendance = ref(false);
const attendanceError = ref<string | null>(null);
const attendancePage = ref(1);
const attendancePerPage = 5;
const expandedAttendanceIds = ref<string[]>([]);
const updatingCharacterId = ref<string | null>(null);
const characterError = ref<string | null>(null);
const recentLoot = ref<RecentLootDisplay[]>([]);
const loadingLoot = ref(false);
const lootError = ref<string | null>(null);
const lootPage = ref(1);
const lootTotalPages = ref(1);
const lootPageSize = 6;

const attendanceTotalPages = computed(() => {
  if (recentAttendance.value.length === 0) {
    return 1;
  }
  return Math.ceil(recentAttendance.value.length / attendancePerPage);
});

const paginatedAttendance = computed(() => {
  const start = (attendancePage.value - 1) * attendancePerPage;
  return recentAttendance.value.slice(start, start + attendancePerPage);
});

const mainCount = computed(() => characters.value.filter((character) => character.isMain).length);

watch(
  mainCount,
  (value) => {
    if (value < 2 && characterError.value) {
      characterError.value = null;
    }
  },
  { immediate: false }
);

async function loadCharacters() {
  loadingCharacters.value = true;
  try {
    const fetched = await api.fetchUserCharacters();
    characters.value = [...fetched].sort((a, b) => {
      if (a.isMain !== b.isMain) {
        return a.isMain ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    characterError.value = null;
  } finally {
    loadingCharacters.value = false;
  }
}

async function loadGuilds() {
  guilds.value = await api.fetchGuilds();
}

async function loadRecentAttendance() {
  loadingAttendance.value = true;
  attendanceError.value = null;
  try {
    recentAttendance.value = await api.fetchRecentAttendance(25);
    attendancePage.value = 1;
    expandedAttendanceIds.value = [];
  } catch (error) {
    attendanceError.value = extractErrorMessage(error, 'Unable to load raid attendance.');
  } finally {
    loadingAttendance.value = false;
  }
}

function normalizeRecentLootLooter(entry: RecentLootEntry): {
  name: string;
  isGuildBank: boolean;
  isMasterLooter: boolean;
} {
  const guildName = entry.raid?.guild?.name ?? null;
  const { name, isGuildBank, isMasterLooter } = normalizeLooterName(
    entry.looterName ?? null,
    guildName
  );
  const displayName = isGuildBank ? getGuildBankDisplayName(guildName) : name;
  return { name: displayName, isGuildBank, isMasterLooter };
}

async function loadRecentLoot(page = lootPage.value) {
  loadingLoot.value = true;
  lootError.value = null;
  try {
    const response = await api.fetchRecentLoot(page, lootPageSize);
    const lootEntries = Array.isArray(response.loot) ? response.loot : [];
    const normalizedEntries = lootEntries
      .map((entry) => {
        const { name, isGuildBank, isMasterLooter } = normalizeRecentLootLooter(entry);
        return {
          ...entry,
          looterName: name,
          displayLooterName: name,
          isGuildBank,
          isMasterLooter
        };
      })
      .filter((entry) => !entry.isMasterLooter);
    recentLoot.value = normalizedEntries;
    lootPage.value = response.page ?? page;
    lootTotalPages.value = response.totalPages ?? 1;
  } catch (error) {
    lootError.value = extractErrorMessage(error, 'Unable to load recent loot.');
  } finally {
    loadingLoot.value = false;
  }
}

function openCharacterModal(character?: UserCharacter) {
  if (character) {
    editingCharacter.value = {
      id: character.id,
      name: character.name,
      level: character.level,
      class: character.class,
      guildId: character.guild?.id ?? null,
      isMain: character.isMain
    };
  } else {
    editingCharacter.value = null;
  }
  showCharacterForm.value = true;
}

function closeCharacterModal() {
  editingCharacter.value = null;
  showCharacterForm.value = false;
}

function handleCharacterCreated() {
  closeCharacterModal();
  loadCharacters();
  loadRecentAttendance();
  loadRecentLoot();
  characterError.value = null;
}

function handleCharacterUpdated() {
  closeCharacterModal();
  loadCharacters();
}

function handleCharacterDeleted() {
  closeCharacterModal();
  loadCharacters();
  loadRecentAttendance();
  loadRecentLoot();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatStatus(status: AttendanceStatus) {
  if (status === 'BENCHED') {
    return 'Left Early';
  }
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusBadgeVariant(status: AttendanceStatus) {
  switch (status) {
    case 'PRESENT':
      return 'attendance-badge--positive';
    case 'ABSENT':
      return 'attendance-badge--negative';
    case 'LATE':
      return 'attendance-badge--warning';
    case 'BENCHED':
      return 'attendance-badge--neutral';
    default:
      return '';
  }
}

function formatEventType(eventType: RecentAttendanceEntry['eventType']) {
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

function eventBadgeVariant(eventType: RecentAttendanceEntry['eventType']) {
  switch (eventType) {
    case 'END':
      return 'attendance-badge--negative';
    case 'START':
    case 'RESTART':
      return 'attendance-badge--positive';
    default:
      return 'attendance-badge--neutral';
  }
}

function formatClass(characterClass?: CharacterClass | null) {
  if (!characterClass) {
    return null;
  }
  return characterClassLabels[characterClass] ?? characterClass;
}

function toggleAttendance(eventId: string) {
  if (expandedAttendanceIds.value.includes(eventId)) {
    expandedAttendanceIds.value = expandedAttendanceIds.value.filter((id) => id !== eventId);
  } else {
    expandedAttendanceIds.value = [...expandedAttendanceIds.value, eventId];
  }
}

function isExpanded(eventId: string) {
  return expandedAttendanceIds.value.includes(eventId);
}

function setAttendancePage(page: number) {
  const normalized = Math.max(1, Math.min(page, attendanceTotalPages.value));
  attendancePage.value = normalized;
  expandedAttendanceIds.value = [];
}

function setLootPage(page: number) {
  const normalized = Math.max(1, Math.min(page, lootTotalPages.value));
  if (normalized === lootPage.value || loadingLoot.value) {
    lootPage.value = normalized;
    return;
  }
  lootPage.value = normalized;
  loadRecentLoot(normalized);
}

function openAllaSearch(itemName: string, itemId?: number | null) {
  if (itemId != null && Number.isFinite(itemId) && itemId > 0) {
    window.open(`https://alla.clumsysworld.com/?a=item&id=${Math.trunc(itemId)}`, '_blank');
    return;
  }
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const trimmed = itemName?.trim();
  const query = trimmed && trimmed.length > 0 ? trimmed : itemName;
  const url = `${base}&iname=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
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
          return (data as { error: string }).error as string;
        }
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
  }
  return fallback;
}

async function toggleCharacterMain(character: UserCharacter) {
  if (updatingCharacterId.value) {
    return;
  }

  const targetValue = !character.isMain;
  if (targetValue && mainCount.value >= 2) {
    characterError.value = 'You can only designate up to two main characters.';
    return;
  }

  updatingCharacterId.value = character.id;
  characterError.value = null;

  try {
    await api.updateCharacter(character.id, { isMain: targetValue });
    await loadCharacters();
    await loadRecentAttendance();
  } catch (error) {
    characterError.value = extractErrorMessage(
      error,
      'Unable to update the main designation for this character.'
    );
  } finally {
    updatingCharacterId.value = null;
  }
}

watch(
  () => recentAttendance.value.length,
  () => {
    if (attendancePage.value > attendanceTotalPages.value) {
      attendancePage.value = attendanceTotalPages.value;
    }
  }
);

watch(
  () => recentLoot.value.length,
  () => {
    if (lootPage.value > lootTotalPages.value) {
      lootPage.value = lootTotalPages.value;
    }
  }
);

onMounted(() => {
  loadCharacters();
  loadGuilds();
  loadRecentAttendance();
  loadRecentLoot();
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-header h1 {
  margin: 0;
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
  gap: 1rem;
  flex-wrap: wrap;
}

.muted {
  color: #94a3b8;
}

.tag {
  background: rgba(96, 165, 250, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.character-summary {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0; /* Allow flex child to shrink */
}

.character-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.character-name-link {
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-level {
  color: rgba(148, 163, 184, 0.85);
  font-weight: 500;
}

.character-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.character-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.character-action-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .list__item {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .character-actions {
    justify-content: space-between;
    width: 100%;
  }
  
  .character-action-row {
    flex: 1;
    justify-content: flex-end;
  }
}
.character-edit-button {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(96, 165, 250, 0.45);
  color: #cfe3ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: inset 0 0 8px rgba(14, 165, 233, 0.18);
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
}

.character-edit-button:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(14, 165, 233, 0.65);
  color: #f0f9ff;
  box-shadow: 0 8px 18px rgba(14, 165, 233, 0.2), inset 0 0 12px rgba(14, 165, 233, 0.25);
}

.character-edit-button:focus-visible {
  outline: 2px solid rgba(14, 165, 233, 0.55);
  outline-offset: 2px;
}

.btn--small {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.btn--toggle-main {
  border-width: 1px;
  border-style: solid;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.btn--toggle-main--inactive {
  background: rgba(30, 41, 59, 0.45);
  border-color: rgba(148, 163, 184, 0.28);
  color: #cbd5f5;
}

.btn--toggle-main--inactive:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(148, 163, 184, 0.4);
  color: #e0f2fe;
  transform: translateY(-1px);
}

.btn--toggle-main--active {
  background: rgba(250, 204, 21, 0.18);
  border-color: rgba(250, 204, 21, 0.4);
  color: #fde68a;
}

.btn--toggle-main--active:hover:not(:disabled) {
  background: rgba(250, 204, 21, 0.25);
  border-color: rgba(250, 204, 21, 0.5);
  transform: translateY(-1px);
}

.btn--toggle-main:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.character-error {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.75rem;
  background: rgba(248, 113, 113, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
  font-size: 0.9rem;
}

.btn--secondary {
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #cbd5f5;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.35);
  transition: background 0.2s ease, transform 0.12s ease, border-color 0.2s ease;
}

.btn--secondary:hover {
  transform: translateY(-2px);
  background: rgba(51, 65, 85, 0.85);
  border-color: rgba(148, 163, 184, 0.55);
}

.btn--secondary:focus {
  outline: 2px solid rgba(148, 163, 184, 0.45);
  outline-offset: 2px;
}

.attendance-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.attendance-list__item {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.9rem;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.attendance-list__item--expanded {
  border-color: rgba(148, 163, 184, 0.4);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.4);
}

.attendance-list__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.attendance-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.attendance-list__meta {
  margin-top: 0.25rem;
}

.attendance-list__summary {
  margin-top: 0.2rem;
}

.attendance-list__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.attendance-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  font-size: 0.85rem;
  transform: rotate(90deg);
  transition: transform 0.2s ease, background 0.2s ease;
}

.attendance-toggle-icon--expanded {
  transform: rotate(-90deg);
  background: rgba(96, 165, 250, 0.25);
}

.recent-loot {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.recent-loot__item {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.85rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.recent-loot__item:hover,
.recent-loot__item:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.45);
}

.recent-loot__icon {
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(30, 41, 59, 0.6);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25);
  overflow: hidden;
}

.recent-loot__icon picture,
.recent-loot__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.recent-loot__emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.5rem;
}

.recent-loot__details {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.recent-loot__item-name {
  margin: 0;
  font-weight: 600;
}

.recent-loot__meta {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.recent-loot__looter {
  font-weight: 600;
}

.recent-loot__looter--unassigned {
  color: #fca5a5;
}

.attendance-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.attendance-badge--positive {
  background: rgba(45, 212, 191, 0.2);
  color: #99f6e4;
  border-color: rgba(45, 212, 191, 0.45);
}

.attendance-badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.45);
}

.attendance-badge--warning {
  background: rgba(250, 204, 21, 0.2);
  color: #fef3c7;
  border-color: rgba(250, 204, 21, 0.45);
}

.attendance-badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.35);
}

.attendance-details {
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  padding-top: 0.75rem;
}

.attendance-records {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.attendance-records__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.7rem;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.attendance-records__main {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.record-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.record-name {
  font-weight: 600;
  letter-spacing: 0.05em;
}

.record-class {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.error {
  color: #fca5a5;
}

.class-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.35));
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

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.badge--main {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.45), rgba(251, 191, 36, 0.25));
  color: #fef3c7;
  border-color: rgba(252, 211, 77, 0.4);
  box-shadow: 0 2px 6px rgba(250, 204, 21, 0.18);
}
</style>
