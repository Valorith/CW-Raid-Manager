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
        <textarea
          v-model="form.description"
          rows="4"
          maxlength="500"
          placeholder="Describe your guild"
          :disabled="!canEditGeneralSettings"
        ></textarea>
      </label>

      <div class="grid">
        <label class="form__field">
          <span>Default Raid Start Time</span>
          <input v-model="form.defaultRaidStartTime" type="time" :disabled="!canEditGeneralSettings" />
          <small class="muted">Applied to the raid creation picker when scheduling future raids.</small>
        </label>
        <label class="form__field">
          <span>Default Raid End Time</span>
          <input v-model="form.defaultRaidEndTime" type="time" :disabled="!canEditGeneralSettings" />
          <small class="muted">Used to prefill raid end times for your team.</small>
        </label>
      </div>

      <footer class="form__actions">
        <button class="btn btn--outline" type="button" :disabled="saving || !canEditGeneralSettings" @click="resetForm">
          Reset
        </button>
        <button class="btn" type="submit" :disabled="saving || !canEditGeneralSettings">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </footer>
      <p v-if="!canEditGeneralSettings" class="muted small">
        Only guild leaders or officers can update general guild settings.
      </p>
    </form>
    <section v-if="canManageLootLists" class="card loot-lists">
      <header class="card__header card__header--loot">
        <div>
          <h2>Loot Lists</h2>
          <p class="muted small">Control automatic handling for detected loot.</p>
        </div>
        <span class="muted small">{{ lootListTotal }} items</span>
      </header>
      <div class="loot-list-controls">
        <div class="loot-list-tabs">
          <button
            v-for="type in lootListTypes"
            :key="type"
            class="loot-list-tab"
            :class="{ 'loot-list-tab--active': lootListActiveType === type }"
            type="button"
            @click="setLootListType(type)"
          >
            {{ lootListTypeLabels[type] }}
          </button>
        </div>
        <div class="loot-list-filters">
          <input v-model="lootListSearch" type="search" class="loot-list-search" placeholder="Search items" />
          <select v-model="lootListSortBy">
            <option value="itemName">Sort: Name</option>
            <option value="itemId">Sort: Item ID</option>
            <option value="createdAt">Sort: Added Date</option>
          </select>
          <select v-model="lootListSortDirection">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>
      <form class="loot-list-add" @submit.prevent="submitLootListEntry">
        <input v-model="addEntryForm.itemName" type="text" placeholder="Item name" required />
        <input
          v-model="addEntryForm.itemId"
          type="number"
          inputmode="numeric"
          placeholder="Item ID (optional)"
        />
        <button class="btn btn--small" type="submit" :disabled="addingEntry">
          {{ addingEntry ? 'Adding…' : 'Add Item' }}
        </button>
      </form>
      <p v-if="lootListLoading" class="muted">Loading {{ lootListTypeLabels[lootListActiveType].toLowerCase() }}…</p>
      <p v-else-if="lootListEntries.length === 0" class="muted small">
        No {{ lootListTypeLabels[lootListActiveType].toLowerCase() }} entries found.
      </p>
      <table v-else class="loot-list-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Item ID</th>
            <th>Added</th>
            <th class="loot-list-table__actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in lootListEntries" :key="entry.id">
            <td>
              <template v-if="editingEntryId === entry.id">
                <input v-model="editingForm.itemName" type="text" required />
              </template>
              <template v-else>
                {{ entry.itemName }}
              </template>
            </td>
            <td>
              <template v-if="editingEntryId === entry.id">
                <input v-model="editingForm.itemId" type="number" inputmode="numeric" />
              </template>
              <template v-else>
                {{ entry.itemId ?? '—' }}
              </template>
            </td>
            <td>{{ formatListTimestamp(entry.createdAt) }}</td>
            <td class="loot-list-table__actions">
              <template v-if="editingEntryId === entry.id">
                <button
                  class="btn btn--small"
                  type="button"
                  :disabled="editingSaving"
                  @click="saveEditingEntry(entry.id)"
                >
                  {{ editingSaving ? 'Saving…' : 'Save' }}
                </button>
                <button class="btn btn--outline btn--small" type="button" @click="cancelEditing">
                  Cancel
                </button>
              </template>
              <template v-else>
                <button class="btn btn--outline btn--small" type="button" @click="startEditingEntry(entry)">
                  Edit
                </button>
                <button
                  class="btn btn--danger btn--small"
                  type="button"
                  :disabled="deletingEntryId === entry.id"
                  @click="deleteLootListEntry(entry)"
                >
                  {{ deletingEntryId === entry.id ? 'Deleting…' : 'Delete' }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="lootListTotalPages > 1" class="pagination">
        <button
          class="pagination__button"
          type="button"
          :disabled="lootListPage === 1"
          @click="setLootListPage(lootListPage - 1)"
        >
          Previous
        </button>
        <span class="pagination__label">Page {{ lootListPage }} of {{ lootListTotalPages }}</span>
        <button
          class="pagination__button"
          type="button"
          :disabled="lootListPage === lootListTotalPages"
          @click="setLootListPage(lootListPage + 1)"
        >
          Next
        </button>
      </div>
    </section>
  </section>
  <p v-else class="muted">Loading guild settings…</p>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { GuildDetail, GuildLootListEntry } from '../services/api';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import type { LootListType } from '../services/types';
import { lootListTypeLabels, lootListTypeOrder } from '../services/types';

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
const lootListTypes = lootListTypeOrder;
const lootListActiveType = ref<LootListType>('WHITELIST');
const lootListSearch = ref('');
const lootListSortBy = ref<'itemName' | 'itemId' | 'createdAt'>('itemName');
const lootListSortDirection = ref<'asc' | 'desc'>('asc');
const lootListPage = ref(1);
const lootListTotalPages = ref(1);
const lootListTotal = ref(0);
const lootListEntries = ref<GuildLootListEntry[]>([]);
const lootListLoading = ref(false);
const lootListPageSize = 10;
const lootListSearchDebounce = ref<number | null>(null);
const addEntryForm = reactive({ itemName: '', itemId: '' });
const addingEntry = ref(false);
const editingEntryId = ref<string | null>(null);
const editingForm = reactive({ itemName: '', itemId: '' });
const editingSaving = ref(false);
const deletingEntryId = ref<string | null>(null);
const canEditGeneralSettings = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER';
});
const canManageLootLists = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});

onMounted(async () => {
  await loadGuild();
});

watch(
  () => authStore.pendingApplication,
  () => {
    if (guild.value) {
      const role = guild.value.permissions?.userRole;
      if (!role || (role !== 'LEADER' && role !== 'OFFICER' && role !== 'RAID_LEADER')) {
        router.replace({ name: 'GuildDetail', params: { guildId } });
      }
    }
  }
);

async function loadGuild() {
  guild.value = await api.fetchGuildDetail(guildId);
  const role = guild.value.permissions?.userRole;
  if (!role || (role !== 'LEADER' && role !== 'OFFICER' && role !== 'RAID_LEADER')) {
    router.replace({ name: 'GuildDetail', params: { guildId } });
    return;
  }
  initializeForm();
  await fetchLootListEntries();
}

function initializeForm() {
  form.description = guild.value?.description ?? '';
  form.defaultRaidStartTime = guild.value?.defaultRaidStartTime ?? '';
  form.defaultRaidEndTime = guild.value?.defaultRaidEndTime ?? '';
}

function resetForm() {
  initializeForm();
}

async function fetchLootListEntries() {
  if (!guild.value || !canManageLootLists.value) {
    lootListEntries.value = [];
    lootListTotal.value = 0;
    lootListTotalPages.value = 1;
    return;
  }

  lootListLoading.value = true;
  try {
    const response = await api.fetchGuildLootListPage(guildId, {
      type: lootListActiveType.value,
      search: lootListSearch.value.trim() || undefined,
      page: lootListPage.value,
      pageSize: lootListPageSize,
      sortBy: lootListSortBy.value,
      sortDirection: lootListSortDirection.value
    });

    const totalPages = Math.max(1, response.totalPages ?? 1);
    lootListTotalPages.value = totalPages;
    lootListTotal.value = response.total ?? 0;

    if (lootListPage.value > totalPages) {
      lootListPage.value = totalPages;
      lootListEntries.value = response.entries ?? [];
      await fetchLootListEntries();
      return;
    }

    lootListEntries.value = response.entries ?? [];
  } catch (error) {
    console.error('Failed to load loot lists', error);
  } finally {
    lootListLoading.value = false;
  }
}

function setLootListType(type: LootListType) {
  if (lootListActiveType.value === type) {
    return;
  }
  lootListActiveType.value = type;
  lootListPage.value = 1;
}

function setLootListPage(page: number) {
  const clamped = Math.min(Math.max(page, 1), lootListTotalPages.value);
  if (clamped === lootListPage.value) {
    return;
  }
  lootListPage.value = clamped;
}

async function submitLootListEntry() {
  if (!guild.value || !canManageLootLists.value) {
    return;
  }

  const name = addEntryForm.itemName.trim();
  if (!name) {
    return;
  }

  const idInput = addEntryForm.itemId.trim();
  const parsedId = idInput ? Number.parseInt(idInput, 10) : null;
  if (idInput && Number.isNaN(parsedId)) {
    window.alert('Item ID must be a valid number.');
    return;
  }

  addingEntry.value = true;
  try {
    await api.createGuildLootListEntry(guildId, {
      type: lootListActiveType.value,
      itemName: name,
      itemId: parsedId
    });
    addEntryForm.itemName = '';
    addEntryForm.itemId = '';
    await fetchLootListEntries();
  } catch (error) {
    window.alert('Unable to add loot list entry.');
    console.error(error);
  } finally {
    addingEntry.value = false;
  }
}

function startEditingEntry(entry: GuildLootListEntry) {
  editingEntryId.value = entry.id;
  editingForm.itemName = entry.itemName;
  editingForm.itemId = entry.itemId != null ? String(entry.itemId) : '';
}

function cancelEditing() {
  editingEntryId.value = null;
  editingForm.itemName = '';
  editingForm.itemId = '';
}

async function saveEditingEntry(entryId: string) {
  if (!guild.value || !canManageLootLists.value || editingEntryId.value !== entryId) {
    return;
  }

  const name = editingForm.itemName.trim();
  if (!name) {
    window.alert('Item name is required.');
    return;
  }

  const idInput = editingForm.itemId.trim();
  const parsedId = idInput ? Number.parseInt(idInput, 10) : null;
  if (idInput && Number.isNaN(parsedId)) {
    window.alert('Item ID must be a valid number.');
    return;
  }

  editingSaving.value = true;
  try {
    await api.updateGuildLootListEntry(guildId, entryId, {
      itemName: name,
      itemId: parsedId
    });
    cancelEditing();
    await fetchLootListEntries();
  } catch (error) {
    window.alert('Unable to update loot list entry.');
    console.error(error);
  } finally {
    editingSaving.value = false;
  }
}

async function deleteLootListEntry(entry: GuildLootListEntry) {
  if (!guild.value || !canManageLootLists.value) {
    return;
  }

  const confirmed = window.confirm(
    `Remove ${entry.itemName} from the ${lootListTypeLabels[lootListActiveType.value].toLowerCase()}?`
  );
  if (!confirmed) {
    return;
  }

  deletingEntryId.value = entry.id;
  try {
    await api.deleteGuildLootListEntry(guildId, entry.id);
    if (editingEntryId.value === entry.id) {
      cancelEditing();
    }
    await fetchLootListEntries();
  } catch (error) {
    window.alert('Unable to delete loot list entry.');
    console.error(error);
  } finally {
    deletingEntryId.value = null;
  }
}

function formatListTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

async function saveSettings() {
  if (!guild.value) {
    return;
  }
  if (!canEditGeneralSettings.value) {
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

watch(lootListSortBy, () => {
  lootListPage.value = 1;
  void fetchLootListEntries();
});

watch(lootListSortDirection, () => {
  lootListPage.value = 1;
  void fetchLootListEntries();
});

watch(lootListActiveType, () => {
  lootListPage.value = 1;
  void fetchLootListEntries();
});

watch(
  lootListPage,
  (current, previous) => {
    if (current !== previous) {
      void fetchLootListEntries();
    }
  }
);

watch(lootListSearch, () => {
  if (lootListSearchDebounce.value) {
    window.clearTimeout(lootListSearchDebounce.value);
  }
  lootListSearchDebounce.value = window.setTimeout(() => {
    lootListPage.value = 1;
    void fetchLootListEntries();
  }, 250);
});

onBeforeUnmount(() => {
  if (lootListSearchDebounce.value) {
    window.clearTimeout(lootListSearchDebounce.value);
  }
});
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

.card {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card__header--loot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.loot-list-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
}

.loot-list-tabs {
  display: inline-flex;
  gap: 0.5rem;
}

.loot-list-tab {
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.loot-list-tab--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(96, 165, 250, 0.4);
}

.loot-list-filters {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.loot-list-filters input,
.loot-list-filters select {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.6rem;
  color: #f8fafc;
  padding: 0.45rem 0.6rem;
}

.loot-list-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.loot-list-add input {
  flex: 1 1 200px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.6rem;
  color: #f8fafc;
  padding: 0.45rem 0.6rem;
}

.loot-list-table {
  width: 100%;
  border-collapse: collapse;
}

.loot-list-table th,
.loot-list-table td {
  padding: 0.6rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
}

.loot-list-table__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.loot-list-table input {
  width: 100%;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  color: #f8fafc;
  padding: 0.35rem 0.5rem;
}
</style>
