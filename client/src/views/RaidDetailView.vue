<template>
  <section v-if="raid" class="raid-detail">
    <header class="section-header">
      <div>
        <div class="raid-title-row">
          <div class="raid-title-main">
            <h1>{{ raid.name }}</h1>
            <button
              v-if="canManageRaid"
              class="icon-button icon-button--edit"
              type="button"
              :disabled="renamingRaid"
              @click="promptRenameRaid"
            >
              <span class="sr-only">Edit raid name</span>
              ✎
            </button>
          </div>
          <span :class="['raid-status-badge', raidStatusBadge.variant]">{{ raidStatusBadge.label }}</span>
        </div>
        <p class="muted">
          {{ formatDate(raid.startTime) }} • Targets: {{ raid.targetZones.join(', ') }}
        </p>
        <span v-if="userGuildRoleLabel" class="badge">{{ userGuildRoleLabel }}</span>
      </div>
      <div class="header-actions">
        <button class="btn btn--outline share-btn" type="button" @click="copyRaidLink">
          <span aria-hidden="true">🔗</span>
          Share
        </button>
        <button
          class="btn btn--danger"
          :disabled="!canManageRaid"
          @click="confirmDeleteRaid"
        >
          Delete Raid
        </button>
      </div>
      <div v-if="shareStatus" class="share-toast">{{ shareStatus }}</div>
      <input
        ref="fileInput"
        type="file"
        accept=".txt"
        hidden
        @change="handleFileUpload"
      />
    </header>

    <section class="card raid-timing">
      <header class="card__header">
        <div>
          <h2>Raid Timing</h2>
          <p class="muted">Track actual raid start and end times.</p>
        </div>
        <div class="actions timing-actions">
          <button
            class="btn"
            :disabled="startingRaid || hasEffectiveStarted || !canManageRaid"
            @click="handleStartRaid"
          >
            {{ startingRaid ? 'Starting…' : hasEffectiveStarted ? 'Started' : 'Start Raid' }}
          </button>
          <button
            class="btn btn--outline"
            :disabled="endingRaid || !hasEffectiveStarted || hasEffectiveEnded || !canManageRaid"
            @click="handleEndRaid"
          >
            {{ endingRaid ? 'Ending…' : hasEffectiveEnded ? 'Ended' : 'End Raid' }}
          </button>
          <button
            class="btn btn--outline"
            :disabled="restartingRaid || !canRestartRaid"
            @click="handleRestartRaid"
          >
            {{ restartingRaid ? 'Restarting…' : 'Restart Raid' }}
          </button>
        </div>
      </header>

      <div class="timing-grid">
        <div class="timing-field">
          <span class="label">Scheduled Start</span>
          <p class="muted">{{ formatDate(raid.startTime) }}</p>
        </div>
        <div class="timing-field">
          <label for="actual-start">Actual Start</label>
          <input
            id="actual-start"
            v-model="startedAtInput"
            type="datetime-local"
            class="timing-input"
            :disabled="!canManageRaid"
          />
        </div>
        <div class="timing-field">
          <label for="actual-end">Actual End</label>
          <input
            id="actual-end"
            v-model="endedAtInput"
            type="datetime-local"
            class="timing-input"
            :disabled="!canManageRaid"
          />
        </div>
      </div>

      <div class="timing-controls">
        <button
          class="btn btn--outline"
          :disabled="!timesDirty || savingTimes || !canManageRaid"
          @click="resetTiming"
        >
          Reset
        </button>
        <button class="btn" :disabled="!timesDirty || savingTimes || !canManageRaid" @click="saveTiming">
          {{ savingTimes ? 'Saving…' : 'Save Times' }}
        </button>
      </div>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <p v-else-if="!canManageRaid" class="muted">
        You do not have permission to manage raid timing or attendance.
      </p>
    </section>

    <section class="card">
      <header class="card__header card__header--attendance">
        <h2>Attendance Events</h2>
        <button
          class="btn upload-btn"
          :disabled="!canManageRaid"
          @click="triggerAttendanceUpload()"
        >
          <span class="upload-btn__icon" aria-hidden="true">⇪</span>
          Upload Attendance
        </button>
      </header>
      <p v-if="attendanceLoading" class="muted">Loading attendance…</p>
      <p v-else-if="attendanceEvents.length === 0" class="muted">
        No attendance events have been recorded for this raid yet.
      </p>
      <ul class="attendance-list">
        <li
          v-for="event in attendanceEvents"
          :key="event.id"
          class="attendance-list__item"
          @click="openAttendanceEvent(event)"
        >
          <div class="event-main">
            <div class="event-header">
              <strong>{{ formatDate(event.createdAt) }}</strong>
              <span
                v-if="resolveEventTypeBadge(event.eventType)"
                :class="['badge', resolveEventTypeBadge(event.eventType)?.variant]"
              >
                {{ resolveEventTypeBadge(event.eventType)?.label }}
              </span>
            </div>
            <span class="muted attendees">{{ resolveEventSubtitle(event) }}</span>
          </div>
          <div v-if="canManageRaid" class="attendance-actions">
            <button
              class="icon-button icon-button--outline"
              type="button"
              @click.stop="triggerAttendanceUpload({ attendanceEventId: event.id })"
            >
              Upload
            </button>
            <button
              class="icon-button icon-button--danger"
              type="button"
              :disabled="deletingAttendanceId === event.id"
              @click.stop="confirmDeleteAttendance(event)"
            >
              {{ deletingAttendanceId === event.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="card">
      <header class="card__header">
        <div>
          <h2>Recorded Loot</h2>
          <p class="muted">All drops captured for this raid.</p>
        </div>
        <RouterLink class="btn btn--manage-loot" :to="{ name: 'RaidLoot', params: { raidId: raid.id } }">
          <span aria-hidden="true">🧺</span>
          Manage Loot
        </RouterLink>
      </header>
      <p v-if="lootEvents.length === 0" class="muted">No loot recorded yet.</p>
      <div v-else class="raid-loot-grid">
        <article
          v-for="entry in groupedLoot"
          :key="entry.id"
          class="raid-loot-card"
          role="button"
          tabindex="0"
          @click="openAllaSearch(entry.itemName)"
          @contextmenu.prevent="openLootContextMenu($event, entry)"
          @keyup.enter="openAllaSearch(entry.itemName)"
        >
          <span
            v-if="entry.isWhitelisted"
            class="raid-loot-card__badge raid-loot-card__badge--whitelist"
            title="Whitelisted"
            aria-label="Whitelisted item"
          >
            ⭐
          </span>
          <div class="raid-loot-card__count">{{ entry.count }}×</div>
          <header class="raid-loot-card__header">
            <span class="raid-loot-card__emoji">{{ entry.emoji ?? '💎' }}</span>
            <div>
              <p class="raid-loot-card__item">{{ entry.itemName }}</p>
              <p class="raid-loot-card__looter">{{ formatLooterLabel(entry.looterName, entry.looterClass) }}</p>
            </div>
          </header>
          <p v-if="entry.note" class="raid-loot-card__note">{{ entry.note }}</p>
        </article>
      </div>
    </section>

    <div
      v-if="lootContextMenu.visible"
    class="loot-context-menu"
    :style="{ top: `${lootContextMenu.y}px`, left: `${lootContextMenu.x}px` }"
    @contextmenu.prevent
    @click.stop
  >
    <header class="loot-context-menu__header">{{ lootContextMenu.itemName }}</header>
    <button
      v-if="canManageLootLists"
      class="loot-context-menu__action"
      type="button"
      @click="handleEditLootClick"
    >
      Edit Loot…
    </button>
    <button
      v-if="!lootContextMenu.whitelistEntry"
      class="loot-context-menu__action"
      type="button"
      @click="addItemToLootList('WHITELIST')"
      >
        Add to Whitelist
      </button>
      <button
        v-else
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('WHITELIST')"
      >
        Remove from Whitelist
      </button>
      <button
        v-if="!lootContextMenu.blacklistEntry"
        class="loot-context-menu__action"
        type="button"
        @click="addItemToLootList('BLACKLIST')"
      >
        Add to Blacklist
      </button>
      <button
        v-else
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('BLACKLIST')"
      >
        Remove from Blacklist
      </button>
    </div>

      </section>
  <p v-else class="muted">Loading raid…</p>

  <RosterPreviewModal
    v-if="rosterPreview && showRosterModal"
    :entries="rosterPreview"
    :meta="rosterMeta"
    :saving="submittingAttendance"
    @close="handleRosterModalClose"
    @discard="handleRosterModalDiscard"
    @save="handleRosterModalSave"
  />
  <div v-if="editLootModal.visible" class="modal-backdrop">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h3>Edit Loot Entry</h3>
          <p class="muted small">Adjust the assignee or quantity for this loot record.</p>
        </div>
        <button class="icon-button" type="button" :disabled="editLootModal.saving" @click="closeEditLootModal">
          ✕
        </button>
      </header>
      <form class="edit-loot-form" @submit.prevent="saveEditedLoot">
        <label class="form__field">
          <span>Item</span>
          <input type="text" :value="editLootModal.entry?.itemName ?? ''" disabled />
        </label>
        <label class="form__field">
          <span>Assigned To</span>
          <input
            v-model="editLootModal.form.looterName"
            type="text"
            required
            :disabled="editLootModal.saving"
          />
        </label>
        <label class="form__field">
          <span>Quantity</span>
          <input
            v-model.number="editLootModal.form.count"
            type="number"
            min="1"
            required
            :disabled="editLootModal.saving"
          />
        </label>
        <footer class="form__actions">
          <button
            class="btn btn--outline btn--modal-outline"
            type="button"
            :disabled="editLootModal.saving"
            @click="closeEditLootModal"
          >
            Cancel
          </button>
          <button class="btn btn--modal-primary" type="submit" :disabled="editLootModal.saving">
            {{ editLootModal.saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
  <AttendanceEventModal
    v-if="selectedAttendanceEvent"
    :event="selectedAttendanceEvent"
    :can-edit="canManageRaid"
    @close="closeAttendanceEvent"
    @upload="handleAttendanceUploadFromModal"
  />
  <ConfirmationModal
    v-if="confirmModal.visible"
    :title="confirmModal.title"
    :description="confirmModal.message"
    :confirm-label="confirmModal.confirmLabel"
    :cancel-label="confirmModal.cancelLabel"
    @confirm="resolveConfirmation(true)"
    @cancel="resolveConfirmation(false)"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import AttendanceEventModal from '../components/AttendanceEventModal.vue';
import ConfirmationModal from '../components/ConfirmationModal.vue';
import RosterPreviewModal from '../components/RosterPreviewModal.vue';
import { api } from '../services/api';
import { characterClassLabels, type CharacterClass } from '../services/types';
import type {
  AttendanceEventSummary,
  AttendanceRecordInput,
  GuildLootListEntry,
  GuildLootListSummary,
  RaidDetail,
  RaidLootEvent
} from '../services/api';
import {
  buildLootListLookup,
  matchesLootListEntry,
  normalizeLootItemName
} from '../utils/lootLists';

const route = useRoute();
const router = useRouter();
const raidId = route.params.raidId as string;

const raid = ref<RaidDetail | null>(null);
const attendanceEvents = ref<AttendanceEventSummary[]>([]);
const deletingAttendanceId = ref<string | null>(null);
const attendanceLoading = ref(false);
const showRosterModal = ref(false);
const rosterPreview = ref<AttendanceRecordInput[] | null>(null);
const rosterMeta = ref<{ filename: string; uploadedAt: string } | null>(null);
const submittingAttendance = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedAttendanceEvent = ref<AttendanceEventSummary | null>(null);
const rosterEditingEventId = ref<string | null>(null);
const lootEvents = ref<RaidLootEvent[]>([]);
const pendingAttendanceEventId = ref<string | null>(
  typeof route.query.attendanceEventId === 'string'
    ? (route.query.attendanceEventId as string)
    : null
);
const lastAutoOpenedAttendanceId = ref<string | null>(null);
const lootListSummary = ref<GuildLootListSummary | null>(null);
const whitelistLookup = computed(() =>
  buildLootListLookup(lootListSummary.value?.whitelist ?? [])
);
const blacklistLookup = computed(() =>
  buildLootListLookup(lootListSummary.value?.blacklist ?? [])
);
interface GroupedLootEntry {
  id: string;
  itemName: string;
  looterName: string;
  looterClass?: string | null;
  emoji?: string | null;
  note?: string | null;
  count: number;
  eventIds: string[];
  isWhitelisted: boolean;
}
const lootContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  itemName: '',
  itemId: null as number | null,
  normalizedName: '',
  whitelistEntry: null as GuildLootListEntry | null,
  blacklistEntry: null as GuildLootListEntry | null,
  entry: null as GroupedLootEntry | null
});
const groupedLoot = computed<GroupedLootEntry[]>(() => {
  const grouped = new Map<string, GroupedLootEntry>();
  for (const event of lootEvents.value) {
    const key = `${event.looterName}::${event.itemName}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: event.id,
        itemName: event.itemName,
        looterName: event.looterName,
        looterClass: event.looterClass,
        emoji: event.emoji,
        note: event.note,
        count: 0,
        eventIds: [],
        isWhitelisted: false
      });
    }
    const entry = grouped.get(key)!;
    entry.count += 1;
    entry.eventIds.push(event.id);
  }
  const whitelistLookupValue = whitelistLookup.value;
  return Array.from(grouped.values())
    .map((entry) => {
      const normalized = normalizeLootItemName(entry.itemName);
      return {
        ...entry,
        isWhitelisted: Boolean(
          matchesLootListEntry(whitelistLookupValue, null, normalized)
        )
      };
    })
    .sort((a, b) => b.count - a.count);
});

function openAllaSearch(itemName: string) {
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const url = `${base}&iname=${encodeURIComponent(itemName)}`;
  window.open(url, '_blank');
}

const formatLooterLabel = (name: string, looterClass?: string | null) => {
  const classLabel = formatCharacterClassLabel(looterClass);
  return classLabel ? `${name} (${classLabel})` : name;
};

const formatCharacterClassLabel = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const upper = normalized.toUpperCase() as CharacterClass;
  if (upper in characterClassLabels) {
    return characterClassLabels[upper];
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const startedAtInput = ref('');
const endedAtInput = ref('');
const initialStartedAt = ref('');
const initialEndedAt = ref('');
const savingTimes = ref(false);
const startingRaid = ref(false);
const endingRaid = ref(false);
const restartingRaid = ref(false);
const renamingRaid = ref(false);
const confirmModal = reactive({
  visible: false,
  title: '',
  message: undefined as string | undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel'
});
const shareStatus = ref<string | null>(null);
let shareStatusTimeout: ReturnType<typeof setTimeout> | null = null;

let confirmResolver: ((value: boolean) => void) | null = null;
const actionError = ref<string | null>(null);
const pendingEventTypes = ref<Array<'START' | 'END' | 'RESTART'>>([]);
const editLootModal = reactive<{
  visible: boolean;
  entry: GroupedLootEntry | null;
  form: { looterName: string; count: number };
  saving: boolean;
}>(
  {
    visible: false,
    entry: null,
    form: {
      looterName: '',
      count: 1
    },
    saving: false
  }
);
const hasEffectiveStarted = computed(() => {
  const startedAt = raid.value?.startedAt;
  if (!startedAt) {
    return false;
  }
  return new Date(startedAt).getTime() <= Date.now();
});
const canManageRaid = computed(() => {
  const permissions = raid.value?.permissions;
  if (!permissions) {
    return false;
  }

  if (typeof permissions.canManage === 'boolean') {
    return permissions.canManage;
  }

  const role = permissions.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canManageLootLists = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const hasEffectiveEnded = computed(() => {
  const endedAt = raid.value?.endedAt;
  if (!endedAt) {
    return false;
  }
  return new Date(endedAt).getTime() <= Date.now();
});

const canRestartRaid = computed(() => canManageRaid.value && hasEffectiveEnded.value);
const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member'
};
const userGuildRoleLabel = computed(() => {
  const role = raid.value?.permissions?.role;
  if (!role) {
    return null;
  }
  return roleLabels[role] ?? role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
});

const raidStatusBadge = computed(() => {
  if (hasEffectiveEnded.value) {
    return { label: 'Ended', variant: 'raid-status-badge--ended' };
  }
  if (hasEffectiveStarted.value) {
    return { label: 'Active', variant: 'raid-status-badge--active' };
  }
  return { label: 'Planned', variant: 'raid-status-badge--planned' };
});

async function loadRaid() {
  const data = await api.fetchRaid(raidId);
  raid.value = data;
  setTimingInputs(data);
  actionError.value = null;
  await refreshLootListSummary();
}

async function loadLoot() {
  try {
    lootEvents.value = await api.fetchRaidLoot(raidId);
  } catch (error) {
    console.warn('Failed to load loot events', error);
  }
}

async function refreshLootListSummary() {
  if (!raid.value || !canManageLootLists.value) {
    lootListSummary.value = null;
    return;
  }

  try {
    lootListSummary.value = await api.fetchGuildLootListSummary(raid.value.guild.id);
  } catch (error) {
    console.warn('Failed to load loot list summary', error);
  }
}

function openLootContextMenu(event: MouseEvent, entry: GroupedLootEntry) {
  if (!canManageLootLists.value) {
    return;
  }
  event.preventDefault();
  const normalizedName = normalizeLootItemName(entry.itemName);
  const whitelistEntry = matchesLootListEntry(whitelistLookup.value, null, normalizedName);
  const blacklistEntry = matchesLootListEntry(blacklistLookup.value, null, normalizedName);
  const menuWidth = 220;
  const menuHeight = 160;
  const x = Math.min(event.clientX, window.innerWidth - menuWidth);
  const y = Math.min(event.clientY, window.innerHeight - menuHeight);
  Object.assign(lootContextMenu, {
    visible: true,
    x,
    y,
    itemName: entry.itemName,
    itemId: whitelistEntry?.itemId ?? blacklistEntry?.itemId ?? null,
    normalizedName,
    whitelistEntry,
    blacklistEntry,
    entry
  });
}

function closeLootContextMenu() {
  lootContextMenu.visible = false;
  lootContextMenu.entry = null;
  lootContextMenu.whitelistEntry = null;
  lootContextMenu.blacklistEntry = null;
  lootContextMenu.itemId = null;
}

function handleEditLootClick() {
  if (!lootContextMenu.entry) {
    return;
  }
  openEditLootModal(lootContextMenu.entry);
  closeLootContextMenu();
}

function handleGlobalPointerDown(event: MouseEvent) {
  if (!lootContextMenu.visible) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && target.closest('.loot-context-menu')) {
    return;
  }
  if (event.type === 'contextmenu' && target && target.closest('.raid-loot-card')) {
    return;
  }
  closeLootContextMenu();
}

function handleLootContextMenuKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && lootContextMenu.visible) {
    closeLootContextMenu();
  }
}

function openEditLootModal(entry: GroupedLootEntry) {
  editLootModal.entry = entry;
  editLootModal.form.looterName = entry.looterName;
  editLootModal.form.count = entry.count;
  editLootModal.visible = true;
  editLootModal.saving = false;
}

function closeEditLootModal(force = false) {
  if (!force && editLootModal.saving) {
    return;
  }
  editLootModal.visible = false;
  editLootModal.entry = null;
  editLootModal.form.looterName = '';
  editLootModal.form.count = 1;
  editLootModal.saving = false;
}

async function addItemToLootList(type: 'WHITELIST' | 'BLACKLIST') {
  if (!raid.value || !canManageLootLists.value) {
    closeLootContextMenu();
    return;
  }

  try {
    await api.createGuildLootListEntry(raid.value.guild.id, {
      type,
      itemName: lootContextMenu.itemName,
      itemId: lootContextMenu.itemId
    });
    if (type === 'BLACKLIST' && lootContextMenu.entry) {
      await removeLootGroupEvents(lootContextMenu.entry);
    }
    await refreshLootListSummary();
  } catch (error) {
    window.alert('Unable to update loot list.');
    console.error(error);
  } finally {
    closeLootContextMenu();
  }
}

async function removeLootGroupEvents(entry: GroupedLootEntry) {
  if (!raid.value) {
    return;
  }

  try {
    await Promise.all(
      entry.eventIds.map((lootId) =>
        api.deleteRaidLoot(raidId, lootId).catch((error) => {
          console.warn('Failed to delete loot entry', lootId, error);
        })
      )
    );
  } finally {
    const eventIdSet = new Set(entry.eventIds);
    lootEvents.value = lootEvents.value.filter((event) => !eventIdSet.has(event.id));
  }
}

async function removeItemFromLootList(type: 'WHITELIST' | 'BLACKLIST') {
  if (!raid.value || !canManageLootLists.value) {
    closeLootContextMenu();
    return;
  }

  const entry =
    type === 'WHITELIST' ? lootContextMenu.whitelistEntry : lootContextMenu.blacklistEntry;

  if (!entry) {
    closeLootContextMenu();
    return;
  }

  try {
    await api.deleteGuildLootListEntry(raid.value.guild.id, entry.id);
    await refreshLootListSummary();
  } catch (error) {
    window.alert('Unable to update loot list.');
    console.error(error);
  } finally {
    closeLootContextMenu();
  }
}

async function saveEditedLoot() {
  if (!raid.value || !editLootModal.entry) {
    return;
  }
  const newLooter = editLootModal.form.looterName.trim();
  const newCount = Number(editLootModal.form.count);
  if (!newLooter) {
    window.alert('Looter name is required.');
    return;
  }
  if (!Number.isFinite(newCount) || newCount < 1) {
    window.alert('Quantity must be at least 1.');
    return;
  }

  const entry = editLootModal.entry;
  const currentCount = entry.count;
  const countDiff = newCount - currentCount;
  const emoji = entry.emoji ?? '💎';

  editLootModal.saving = true;
  try {
    if (newLooter !== entry.looterName) {
      await Promise.all(
        entry.eventIds.map((lootId) =>
          api.updateRaidLoot(raidId, lootId, { looterName: newLooter }).catch((error) => {
            console.warn('Failed to update loot assignment', lootId, error);
            throw error;
          })
        )
      );
    }

    if (countDiff > 0) {
      const payload = Array.from({ length: countDiff }, () => ({
        itemName: entry.itemName,
        looterName: newLooter,
        emoji,
        note: entry.note ?? undefined
      }));
      await api.createRaidLoot(raidId, payload);
    } else if (countDiff < 0) {
      const removeIds = entry.eventIds.slice(entry.eventIds.length + countDiff);
      await Promise.all(
        removeIds.map((lootId) =>
          api.deleteRaidLoot(raidId, lootId).catch((error) => {
            console.warn('Failed to delete loot entry', lootId, error);
            throw error;
          })
        )
      );
    }

    lootEvents.value = await api.fetchRaidLoot(raidId);
    await refreshLootListSummary();
    window.dispatchEvent(
      new CustomEvent('loot-updated', {
        detail: {
          title: 'Loot Updated',
          message: `${entry.itemName} now assigned to ${newLooter} (${newCount}×)`
        }
      })
    );
    closeEditLootModal(true);
  } catch (error) {
    console.error('Failed to edit loot entry', error);
    window.alert('Unable to update loot entry. Please try again.');
  } finally {
    editLootModal.saving = false;
  }
}

async function loadAttendance() {
  attendanceLoading.value = true;
  try {
    attendanceEvents.value = await api.fetchAttendance(raidId);
  } finally {
    attendanceLoading.value = false;
  }
  maybeOpenAttendanceFromQuery();
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    rosterEditingEventId.value = null;
    return;
  }

  const file = target.files[0];
  try {
    const response = await api.uploadRoster(raidId, file);
    rosterPreview.value = response.data.preview as AttendanceRecordInput[];
    rosterMeta.value = response.data.meta;
    showRosterModal.value = true;
  } finally {
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function discardPreview(removePending = true) {
  rosterPreview.value = null;
  rosterMeta.value = null;
  showRosterModal.value = false;
  if (removePending && !rosterEditingEventId.value && pendingEventTypes.value.length > 0) {
    pendingEventTypes.value.pop();
  }
  rosterEditingEventId.value = null;
}

async function saveAttendance(entries?: AttendanceRecordInput[]) {
  if (entries) {
    rosterPreview.value = entries;
  }

  if (!rosterPreview.value) {
    return;
  }

  submittingAttendance.value = true;
  try {
    if (rosterEditingEventId.value) {
      await api.updateAttendanceEvent(rosterEditingEventId.value, {
        note: `Updated from ${rosterMeta.value?.filename ?? 'roster file'}`,
        snapshot: {
          filename: rosterMeta.value?.filename,
          uploadedAt: rosterMeta.value?.uploadedAt
        },
        records: rosterPreview.value
      });
    } else {
      const eventType = pendingEventTypes.value.shift();
      await api.createAttendanceEvent(raidId, {
        note: `Imported from ${rosterMeta.value?.filename ?? 'roster file'}`,
        snapshot: {
          filename: rosterMeta.value?.filename,
          uploadedAt: rosterMeta.value?.uploadedAt
        },
        records: rosterPreview.value,
        ...(eventType ? { eventType } : {})
      });
    }
    discardPreview(false);
    showRosterModal.value = false;
    await loadAttendance();
  } finally {
    submittingAttendance.value = false;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function toInputValue(isoString: string | null | undefined) {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);

  return local.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return date.toISOString();
}

function composeInputFromDefault(baseIso: string | null | undefined, defaultTime?: string | null) {
  if (!defaultTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(defaultTime)) {
    return '';
  }
  const base = baseIso ? new Date(baseIso) : new Date();
  const [hours, minutes] = defaultTime.split(':').map(Number);
  base.setHours(hours, minutes, 0, 0);
  const offset = base.getTimezoneOffset();
  const local = new Date(base.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function setTimingInputs(current: RaidDetail) {
  let startValue = toInputValue(current.startedAt);
  if (!startValue && current.guild?.defaultRaidStartTime) {
    startValue = composeInputFromDefault(current.startTime, current.guild.defaultRaidStartTime);
  }
  let endValue = toInputValue(current.endedAt);
  if (!endValue && current.guild?.defaultRaidEndTime) {
    endValue = composeInputFromDefault(current.startTime, current.guild.defaultRaidEndTime);
  }
  startedAtInput.value = startValue;
  endedAtInput.value = endValue;
  initialStartedAt.value = startValue;
  initialEndedAt.value = endValue;
}

const timesDirty = computed(
  () =>
    startedAtInput.value !== initialStartedAt.value || endedAtInput.value !== initialEndedAt.value
);

function resetTiming() {
  startedAtInput.value = initialStartedAt.value;
  endedAtInput.value = initialEndedAt.value;
}

async function saveTiming() {
  if (!timesDirty.value) {
    return;
  }

  savingTimes.value = true;
  try {
    const startedAtValue = startedAtInput.value ? fromInputValue(startedAtInput.value) : null;
    const endedAtValue = endedAtInput.value ? fromInputValue(endedAtInput.value) : null;

    await api.updateRaid(raidId, {
      startedAt: startedAtValue,
      endedAt: endedAtValue,
      startTime: startedAtValue ?? undefined
    });
    await loadRaid();
  } finally {
    savingTimes.value = false;
  }
}

function showConfirmation(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return new Promise<boolean>((resolve) => {
    confirmModal.visible = true;
    confirmModal.title = options.title;
    confirmModal.message = options.message;
    confirmModal.confirmLabel = options.confirmLabel ?? 'Confirm';
    confirmModal.cancelLabel = options.cancelLabel ?? 'Cancel';
    confirmResolver = resolve;
  });
}

function resolveConfirmation(result: boolean) {
  confirmModal.visible = false;
  confirmModal.title = '';
  confirmModal.message = undefined;
  confirmModal.confirmLabel = 'Confirm';
  confirmModal.cancelLabel = 'Cancel';
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(result);
}


function confirmDeleteAttendance(event: any) {
  if (!canManageRaid.value) {
    return;
  }

  showConfirmation({
    title: 'Delete Attendance Event',
    message: 'This will remove the attendance snapshot and all associated records.',
    confirmLabel: 'Delete Event',
    cancelLabel: 'Cancel'
  }).then(async (confirmed) => {
    if (!confirmed) {
      return;
    }

    deletingAttendanceId.value = event.id;
    actionError.value = null;

    try {
      await api.deleteAttendanceEvent(event.id);
      attendanceEvents.value = attendanceEvents.value.filter((item) => item.id !== event.id);
      if (selectedAttendanceEvent.value?.id === event.id) {
        selectedAttendanceEvent.value = null;
      }
    } catch (error) {
      actionError.value = extractErrorMessage(error, 'Unable to delete attendance event. Please try again.');
    } finally {
      deletingAttendanceId.value = null;
    }
  });
}


function handleRosterModalClose() {
  discardPreview(!rosterEditingEventId.value);
}

function handleRosterModalDiscard() {
  discardPreview(!rosterEditingEventId.value);
}

async function handleRosterModalSave(entries: AttendanceRecordInput[]) {
  await saveAttendance(entries);
}

function triggerAttendanceUpload(options?: { attendanceEventId?: string }) {
  rosterEditingEventId.value = options?.attendanceEventId ?? null;
  requestAnimationFrame(() => {
    fileInput.value?.click();
  });
}

function confirmDeleteRaid() {
  if (!canManageRaid.value) {
    return;
  }

  showConfirmation({
    title: 'Delete Raid',
    message: 'This will remove the raid and all associated attendance events. This action cannot be undone.',
    confirmLabel: 'Delete Raid',
    cancelLabel: 'Cancel'
  }).then(async (confirmed) => {
    if (!confirmed) {
      return;
    }

    actionError.value = null;
    try {
      await api.deleteRaid(raidId);
      router.push({ name: 'Raids' });
    } catch (error) {
      actionError.value = extractErrorMessage(error, 'Unable to delete raid. Please try again.');
    }
  });
}

async function handleStartRaid() {
  if (startingRaid.value || hasEffectiveStarted.value) {
    return;
  }

  startingRaid.value = true;
  actionError.value = null;
  try {
    await api.startRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Started',
      message: 'Raid start time recorded. Upload an attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      pendingEventTypes.value.push('START');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('START');
    }
    await loadRaid();
    await loadAttendance();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to start raid. Please try again.');
  } finally {
    startingRaid.value = false;
  }
}

async function handleEndRaid() {
  if (endingRaid.value || !hasEffectiveStarted.value || hasEffectiveEnded.value) {
    return;
  }

  endingRaid.value = true;
  actionError.value = null;
  try {
    await api.endRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Ended',
      message: 'Raid end time recorded. Upload the final attendance log?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      pendingEventTypes.value.push('END');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('END');
    }
    await loadRaid();
    await loadAttendance();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to end raid. Please try again.');
  } finally {
    endingRaid.value = false;
  }
}

async function handleRestartRaid() {
  if (restartingRaid.value || !canRestartRaid.value) {
    return;
  }

  restartingRaid.value = true;
  actionError.value = null;
  try {
    await api.restartRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Restarted',
      message: 'Raid restart recorded. Upload a fresh attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload) {
      pendingEventTypes.value.push('RESTART');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('RESTART');
    }
    await loadRaid();
    await loadAttendance();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to restart raid. Please try again.');
  } finally {
    restartingRaid.value = false;
  }
}

async function promptRenameRaid() {
  if (!canManageRaid.value || !raid.value || renamingRaid.value) {
    return;
  }

  const currentName = raid.value.name ?? '';
  const nextName = window.prompt('Rename raid', currentName);
  if (nextName === null) {
    return;
  }
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === currentName) {
    return;
  }

  renamingRaid.value = true;
  actionError.value = null;
  try {
    await api.updateRaid(raidId, { name: trimmed });
    await loadRaid();
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to rename raid. Please try again.');
  } finally {
    renamingRaid.value = false;
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

function resolveEventTypeBadge(eventType?: string | null) {
  switch (eventType) {
    case 'START':
      return { label: 'Raid Started', variant: 'badge--positive' };
    case 'END':
      return { label: 'Raid Ended', variant: 'badge--negative' };
    case 'RESTART':
      return { label: 'Raid Restarted', variant: 'badge--positive' };
    default:
      return null;
  }
}

function resolveEventSubtitle(event: any) {
  switch (event.eventType) {
    case 'START':
      return 'Raid start recorded';
    case 'END':
      return 'Raid end recorded';
    case 'RESTART':
      return 'Raid restart recorded';
    default:
      return `${Array.isArray(event.records) ? event.records.length : 0} attendees logged`;
  }
}

function openAttendanceEvent(event: any) {
  selectedAttendanceEvent.value = event;
}

function closeAttendanceEvent() {
  selectedAttendanceEvent.value = null;
}

function maybeOpenAttendanceFromQuery() {
  const targetId = pendingAttendanceEventId.value;
  if (!targetId || lastAutoOpenedAttendanceId.value === targetId) {
    return;
  }

  const targetEvent = attendanceEvents.value.find((event) => event.id === targetId);
  if (!targetEvent) {
    return;
  }

  openAttendanceEvent(targetEvent);
  lastAutoOpenedAttendanceId.value = targetId;
  pendingAttendanceEventId.value = null;
}

watch(
  () => route.query.attendanceEventId,
  (value) => {
    pendingAttendanceEventId.value = typeof value === 'string' ? (value as string) : null;
    maybeOpenAttendanceFromQuery();
  }
);

watch(
  () => attendanceEvents.value,
  () => {
    maybeOpenAttendanceFromQuery();
  }
);

function handleAttendanceUploadFromModal(attendanceEventId: string) {
  selectedAttendanceEvent.value = null;
  triggerAttendanceUpload({ attendanceEventId });
}

async function createPlaceholderAttendanceEvent(eventType: 'START' | 'END' | 'RESTART') {
  try {
    await api.createAttendanceEvent(raidId, {
      note:
        eventType === 'START'
          ? 'Raid started – attendance log pending upload.'
          : eventType === 'END'
            ? 'Raid ended – attendance log pending upload.'
            : 'Raid restarted – attendance log pending upload.',
      records: [],
      eventType
    });
  } catch (error) {
    actionError.value = extractErrorMessage(
      error,
      'Unable to create placeholder attendance event.'
    );
  }
}

onMounted(() => {
  loadRaid();
  loadAttendance();
  loadLoot();
  window.addEventListener('click', handleGlobalPointerDown);
  window.addEventListener('contextmenu', handleGlobalPointerDown);
  window.addEventListener('keydown', handleLootContextMenuKey);
});

onUnmounted(() => {
  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
    shareStatusTimeout = null;
  }
  window.removeEventListener('click', handleGlobalPointerDown);
  window.removeEventListener('contextmenu', handleGlobalPointerDown);
  window.removeEventListener('keydown', handleLootContextMenuKey);
});

async function copyRaidLink() {
  const resolved = router.resolve({ name: 'RaidDetail', params: { raidId } }).href;
  const absoluteUrl = typeof window !== 'undefined'
    ? new URL(resolved, window.location.origin).toString()
    : resolved;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(absoluteUrl);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = absoluteUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    shareStatus.value = 'Raid link copied to clipboard';
  } catch (error) {
    console.warn('Failed to copy raid link', error);
    shareStatus.value = 'Unable to copy link';
  }

  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
  }
  shareStatusTimeout = setTimeout(() => {
    shareStatus.value = null;
    shareStatusTimeout = null;
  }, 3000);
}
</script>

<style scoped>
.raid-detail {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.raid-title-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.raid-title-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.raid-status-badge {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.raid-status-badge--active {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.raid-status-badge--ended {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
}

.raid-status-badge--planned {
  border-color: rgba(148, 163, 184, 0.5);
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5f5;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.share-btn {
  min-width: 120px;
}

.share-toast {
  position: fixed;
  top: 5.5rem;
  right: 1rem;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.6);
  border-radius: 0.75rem;
  padding: 0.75rem 1.1rem;
  color: #bbf7d0;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.45);
  z-index: 200;
  font-size: 0.9rem;
  backdrop-filter: blur(8px);
}

.card__header--attendance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.upload-btn {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(99, 102, 241, 0.88));
  border: 1px solid rgba(14, 165, 233, 0.45);
  color: #0b1120;
  box-shadow: 0 12px 24px rgba(14, 165, 233, 0.22);
  transition: transform 0.12s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
}

.upload-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(191, 219, 254, 0.6);
  box-shadow: 0 16px 28px rgba(59, 130, 246, 0.28);
}

.upload-btn:disabled {
  opacity: 0.55;
  transform: none;
  box-shadow: none;
}

.upload-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.35);
  color: #0b1120;
  font-size: 0.95rem;
  line-height: 1;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 0.35rem;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
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

.raid-timing {
  gap: 1.5rem;
}

.timing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.timing-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timing-field .label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.timing-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  color: #f8fafc;
}

.timing-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.timing-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.timing-actions {
  display: flex;
  gap: 0.75rem;
}

.error {
  color: #f87171;
  margin: 0;
}

.attendance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.attendance-list__item {
  background: rgba(30, 41, 59, 0.4);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.attendance-list__item:hover {
  background: rgba(59, 130, 246, 0.2);
  transform: translateY(-1px);
}

.event-main {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.attendees {
  margin-left: 0;
}

.arrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.table-wrapper {
  overflow: auto;
  max-height: 320px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

th {
  font-weight: 600;
  color: #cbd5f5;
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
}

.muted {
  color: #94a3b8;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn--danger {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.btn--danger:hover {
  background: rgba(248, 113, 113, 0.25);
  color: #fee2e2;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--outline:disabled {
  border-color: rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.5);
}

.btn--danger:disabled {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(248, 113, 113, 0.2);
  color: rgba(252, 165, 165, 0.5);
}


.event-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attendance-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.4rem;
  transition: color 0.2s ease, background 0.2s ease;
}

.icon-button:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.icon-button--danger {
  color: #fca5a5;
}

.icon-button--danger:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

.icon-button--outline {
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 0.25rem 0.6rem;
  border-radius: 0.5rem;
}

.icon-button--outline:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.icon-button--edit {
  font-size: 0.85rem;
  color: #94a3b8;
  padding: 0.2rem 0.35rem;
}

.icon-button--edit:hover:not(:disabled) {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.1);
}

.icon-button--edit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.loot-summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}


.raid-loot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.raid-loot-card {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 0.85rem 1rem;
  background: rgba(15, 23, 42, 0.75);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.45);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}


.raid-loot-card__badge {
  position: absolute;
  bottom: 0.55rem;
  right: 0.75rem;
  font-size: 0.95rem;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.5));
  pointer-events: none;
  z-index: 1;
}

.raid-loot-card__badge--whitelist {
  color: #facc15;
}

.raid-loot-card:hover,
.raid-loot-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.5);
}

.raid-loot-card__count {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.5);
  color: #bbf7d0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.65rem;
  font-weight: 700;
  font-size: 0.85rem;
}

.raid-loot-card__header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding-right: 3rem;
}

.raid-loot-card__emoji {
  font-size: 1.4rem;
}

.raid-loot-card__item {
  margin: 0;
  font-weight: 700;
}

.raid-loot-card__looter {
  margin: 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

.raid-loot-card__note {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.btn--manage-loot {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  color: #0f172a;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.9), rgba(226, 232, 240, 0.95));
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  box-shadow: 0 10px 25px rgba(148, 163, 184, 0.35);
  text-decoration: none;
  transition: color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.btn--manage-loot:hover,
.btn--manage-loot:focus-visible {
  box-shadow: 0 14px 30px rgba(148, 163, 184, 0.5);
  color: #020617;
  transform: translateY(-1px);
}

.loot-context-menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.8rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.45);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.loot-context-menu__header {
  font-weight: 600;
  font-size: 0.9rem;
  color: #f8fafc;
  margin-bottom: 0.25rem;
}

.loot-context-menu__action {
  background: transparent;
  border: none;
  color: #cbd5f5;
  padding: 0.4rem 0.5rem;
  text-align: left;
  border-radius: 0.5rem;
  transition: background 0.15s ease, color 0.15s ease;
}

.loot-context-menu__action:hover,
.loot-context-menu__action:focus-visible {
  background: rgba(59, 130, 246, 0.2);
  color: #f8fafc;
}

.loot-context-menu__action--remove {
  color: #fca5a5;
}

.loot-context-menu__action--remove:hover,
.loot-context-menu__action--remove:focus-visible {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
  padding: 1.5rem;
}

.modal {
  width: min(520px, 100%);
  background: rgba(15, 23, 42, 0.95);
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.55);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modal__header h3 {
  margin: 0;
}

.modal__header p {
  margin: 0.35rem 0 0;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.edit-loot-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.edit-loot-form .form__field span {
  font-weight: 600;
}

</style>
