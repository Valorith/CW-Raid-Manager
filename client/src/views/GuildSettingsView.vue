<template>
  <section v-if="guild" class="guild-settings">
    <header class="section-header">
      <RouterLink
        class="back-link"
        :to="{ name: 'GuildDetail', params: { guildId } }"
      >
        ← Back to Guild
      </RouterLink>
      <div class="section-header__main">
        <div class="section-header__title">
          <h1>Guild Settings</h1>
          <p class="muted">Manage description and default raid times for {{ guild.name }}.</p>
        </div>
        <div class="header-actions">
          <button
            v-if="canManageParserSettings"
            class="parser-button"
            type="button"
            @click="showParserSettings = true"
          >
            Parser Settings
          </button>
          <button
            v-if="canManageDiscordWebhook"
            class="discord-button"
            type="button"
            @click="showDiscordModal = true"
          >
            <svg viewBox="0 0 245 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M104.4 104.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1m36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1" />
              <path
                d="M189.5 20h-134C24.8 20 10 34.8 10 53.5v134C10 206.2 24.8 221 43.5 221h113.4l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V53.5C198 34.8 183.2 20 164.5 20zm-26.4 135s-2.5-3-4.6-5.6c9.1-2.6 12.5-8.4 12.5-8.4-2.8 1.8-5.4 3.1-7.8 4-3.4 1.4-6.7 2.3-9.9 2.9-6.5 1.2-12.5.9-17.6-.1-3.9-.8-7.3-1.8-10.1-2.9-1.6-.6-3.3-1.4-5-2.4-.2-.1-.4-.2-.6-.3-.1 0-.1-.1-.2-.1-1-.6-1.5-.9-1.5-.9s3.3 5.5 12.1 8.2c-2.1 2.6-4.7 5.7-4.7 5.7-15.4-.5-21.3-10.6-21.3-10.6 0-22.4 10-40.5 10-40.5 10-7.5 19.5-7.3 19.5-7.3l.7.9c-12.5 3.6-18.3 9.1-18.3 9.1s1.5-.8 4-2c7.3-3.2 13-4.1 15.4-4.3.4-.1.8-.1 1.3-.1 4.7-.6 10-1 15.6-1 .30 0 8.6.1 17.6 3.3 2.9 1.1 6.2 2.7 9.7 5.1 0 0-5.5-5.2-17.4-8.8l1-1.1s9.5-.2 19.5 7.3c0 0 10 18.2 10 40.5 0 .1-5.9 10.2-21.3 10.7z" />
            </svg>
            <span>Discord Webhook</span>
          </button>
        </div>
      </div>
    </header>

    <div class="settings-content">
      <form class="settings-card settings-card--form" @submit.prevent="saveSettings">
        <header class="settings-card__header">
          <div>
            <h2>General Settings</h2>
            <p class="muted small">Configure default raid details and optional Discord integrations.</p>
          </div>
          <span v-if="!canEditGeneralSettings" class="settings-badge">View Only</span>
        </header>
        <div class="settings-card__body">
          <section class="settings-section">
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
          </section>

          <section class="settings-section">
            <div class="settings-field-grid">
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
          </section>

          <section class="settings-section">
            <label class="form__field">
              <span>Default Discord Voice Channel</span>
              <input
                v-model="form.defaultDiscordVoiceUrl"
                type="url"
                placeholder="https://discord.gg/your-voice-channel"
                :disabled="!canEditGeneralSettings"
                @input="clearDefaultDiscordVoiceError"
              />
              <small v-if="fieldErrors.defaultDiscordVoiceUrl" class="form__error">
                {{ fieldErrors.defaultDiscordVoiceUrl }}
              </small>
              <small v-else class="muted">Prefills the raid voice channel link when planning a new raid.</small>
            </label>
          </section>

          <section class="settings-section settings-section--widget">
            <div class="section-heading section-heading--sub">
              <div>
                <h3>Discord Widget</h3>
                <p class="muted small">Provide a Discord server ID to embed your live widget on the guild page.</p>
              </div>
            </div>
            <label class="toggle-field">
              <input
                v-model="form.discordWidgetEnabled"
                type="checkbox"
                :disabled="!canEditGeneralSettings || !form.discordWidgetServerId.trim()"
              />
              <span>Enable Discord Widget</span>
            </label>
            <div class="settings-field-grid settings-field-grid--widget">
              <label class="form__field">
                <span>Discord Server ID</span>
                <input
                  v-model="form.discordWidgetServerId"
                  type="text"
                  maxlength="64"
                  placeholder="Example: 123456789012345678"
                  :disabled="!canEditGeneralSettings"
                />
                <small class="muted">Enable the Discord widget in your server settings, then paste the server ID.</small>
              </label>
              <label class="form__field">
                <span>Widget Theme</span>
                <select
                  v-model="form.discordWidgetTheme"
                  :disabled="!canEditGeneralSettings || !form.discordWidgetEnabled"
                >
                  <option value="DARK">Dark</option>
                  <option value="LIGHT">Light</option>
                </select>
                <small class="muted">Used when rendering the Discord widget on the guild page.</small>
              </label>
            </div>
          </section>
        </div>
        <footer class="settings-card__footer">
          <div class="settings-actions">
            <button class="btn btn--outline" type="button" :disabled="saving || !canEditGeneralSettings" @click="resetForm">
              Reset
            </button>
            <button class="btn" type="submit" :disabled="saving || !canEditGeneralSettings">
              {{ saving ? 'Saving…' : 'Save Settings' }}
            </button>
          </div>
          <p v-if="!canEditGeneralSettings" class="muted small">
            Only guild leaders or officers can update general guild settings.
          </p>
        </footer>
      </form>

      <section v-if="canManageLootLists" class="settings-card settings-card--loot">
        <header class="settings-card__header">
          <div>
            <h2>Loot Lists</h2>
            <p class="muted small">Control automatic handling for detected loot across raids.</p>
          </div>
          <span class="settings-badge settings-badge--neutral">{{ lootListTotal }} items</span>
        </header>
        <div class="settings-card__body">
          <div class="loot-list-preferences">
            <label class="toggle-field">
              <input
                v-model="blacklistSpells"
                type="checkbox"
                :disabled="!canManageLootLists || blacklistSpellsSaving"
                @change="handleBlacklistSpellsChange"
              />
              <span>Blacklist Spells</span>
            </label>
            <p class="muted x-small">
              Automatically ignore detected loot whose name includes "Spell:" or "Song:".
            </p>
          </div>
          <div class="loot-list-toolbar">
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
              <input v-model="lootListSearch" type="search" class="input loot-list-search" placeholder="Search items" />
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

          <div v-else class="loot-table-wrapper">
            <table class="loot-list-table">
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
                      <button class="btn btn--small" type="button" :disabled="editingSaving" @click="saveEditingEntry(entry.id)">
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
                        @click="deleteLootListEntry(entry)
                      ">
                        {{ deletingEntryId === entry.id ? 'Deleting…' : 'Delete' }}
                      </button>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="lootListTotalPages > 1" class="pagination">
            <button class="pagination__button" type="button" :disabled="lootListPage === 1" @click="setLootListPage(lootListPage - 1)">
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
        </div>
      </section>
    </div>

    <ParserSettingsModal
      :guild-id="guildId"
      :visible="showParserSettings"
      @close="showParserSettings = false"
      @saved="handleParserSettingsSaved"
    />
    <DiscordWebhookModal
      v-if="showDiscordModal && guild"
      :guild-id="guildId"
      @close="handleDiscordModalClose"
    />
  </section>
  <p v-else class="muted">Loading guild settings…</p>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { GuildDetail, GuildLootListEntry, GuildLootParserSettings } from '../services/api';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import type { DiscordWidgetTheme, LootListType } from '../services/types';
import { lootListTypeLabels, lootListTypeOrder } from '../services/types';
import { normalizeOptionalUrl } from '../utils/urls';
import ParserSettingsModal from '../components/ParserSettingsModal.vue';
import DiscordWebhookModal from '../components/DiscordWebhookModal.vue';

const route = useRoute();
const router = useRouter();
const guildId = route.params.guildId as string;
const guild = ref<GuildDetail | null>(null);
const saving = ref(false);

const form = reactive({
  description: '',
  defaultRaidStartTime: '',
  defaultRaidEndTime: '',
  defaultDiscordVoiceUrl: '',
  discordWidgetServerId: '',
  discordWidgetTheme: 'DARK' as DiscordWidgetTheme,
  discordWidgetEnabled: false
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
const fieldErrors = reactive({
  defaultDiscordVoiceUrl: ''
});
const canEditGeneralSettings = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER';
});
const canManageLootLists = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canManageParserSettings = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER';
});
const canManageDiscordWebhook = computed(() => {
  const role = guild.value?.permissions?.userRole;
  return role === 'LEADER' || role === 'OFFICER';
});
const showParserSettings = ref(false);
const showDiscordModal = ref(false);
const blacklistSpells = ref(false);
const blacklistSpellsSaving = ref(false);

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

watch(
  () => showParserSettings.value || showDiscordModal.value,
  (isOpen) => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('modal-open', isOpen);
  }
);

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('modal-open');
  }
});

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
  form.defaultDiscordVoiceUrl = guild.value?.defaultDiscordVoiceUrl ?? '';
  form.discordWidgetServerId = guild.value?.discordWidgetServerId ?? '';
  form.discordWidgetTheme = (guild.value?.discordWidgetTheme ?? 'DARK') as DiscordWidgetTheme;
  form.discordWidgetEnabled = guild.value?.discordWidgetEnabled ?? false;
  fieldErrors.defaultDiscordVoiceUrl = '';
  blacklistSpells.value = guild.value?.blacklistSpells ?? false;
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

async function handleBlacklistSpellsChange() {
  const currentGuild = guild.value;
  if (!currentGuild || !canManageLootLists.value) {
    blacklistSpells.value = currentGuild?.blacklistSpells ?? false;
    return;
  }

  const nextValue = blacklistSpells.value;
  const previousValue = currentGuild.blacklistSpells ?? false;
  if (nextValue === previousValue) {
    return;
  }

  blacklistSpellsSaving.value = true;
  try {
    await api.updateGuildSettings(guildId, { blacklistSpells: nextValue });
    guild.value = {
      ...currentGuild,
      blacklistSpells: nextValue
    };
  } catch (error) {
    blacklistSpells.value = previousValue;
    window.alert('Unable to update spell blacklist setting.');
    console.error(error);
  } finally {
    blacklistSpellsSaving.value = false;
  }
}

function handleParserSettingsSaved(_settings: GuildLootParserSettings) {
  showParserSettings.value = false;
}

function handleDiscordModalClose() {
  showDiscordModal.value = false;
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
    const { normalized, valid } = normalizeOptionalUrl(form.defaultDiscordVoiceUrl);
    if (!valid) {
      fieldErrors.defaultDiscordVoiceUrl = 'Enter a valid Discord URL.';
      saving.value = false;
      return;
    }
    form.defaultDiscordVoiceUrl = normalized ?? '';

    const widgetServerId = form.discordWidgetServerId.trim();
    form.discordWidgetServerId = widgetServerId;

    await api.updateGuildSettings(guildId, {
      description: form.description,
      defaultRaidStartTime: form.defaultRaidStartTime || null,
      defaultRaidEndTime: form.defaultRaidEndTime || null,
      defaultDiscordVoiceUrl: normalized ?? null,
      discordWidgetServerId: widgetServerId ? widgetServerId : null,
      discordWidgetTheme:
        widgetServerId && form.discordWidgetTheme ? form.discordWidgetTheme : null,
      discordWidgetEnabled: form.discordWidgetEnabled && Boolean(widgetServerId)
    });
    await loadGuild();
  } catch (error) {
    window.alert('Unable to save guild settings.');
    console.error(error);
  } finally {
    saving.value = false;
  }
}

function clearDefaultDiscordVoiceError() {
  if (fieldErrors.defaultDiscordVoiceUrl) {
    fieldErrors.defaultDiscordVoiceUrl = '';
  }
}

watch(
  () => form.discordWidgetServerId,
  (value) => {
    if (!value.trim()) {
      form.discordWidgetTheme = 'DARK';
      form.discordWidgetEnabled = false;
    }
  }
);

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
  gap: 2rem;
}

.section-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  padding-bottom: 0.5rem;
  position: relative;
}


.header-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
}

.settings-content {
  display: grid;
  gap: 1.75rem;
  margin-top: 0.5rem;
}

@media (min-width: 1024px) {
  .settings-content {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: start;
  }
}

.settings-card {
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.85), rgba(30, 41, 59, 0.8));
  border: 1px solid rgba(96, 165, 250, 0.18);
  border-radius: 1.1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.45);
}

.settings-card--loot {
  background: linear-gradient(135deg, rgba(30, 58, 138, 0.75), rgba(15, 23, 42, 0.82));
}

.settings-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.settings-card__header h2,
.settings-card__header h3 {
  margin: 0;
}

.settings-card__body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.settings-card__footer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
}

.settings-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(96, 165, 250, 0.18);
  color: #bfdbfe;
  border: 1px solid rgba(96, 165, 250, 0.4);
}

.settings-badge--neutral {
  background: rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.35);
}

.settings-section {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-heading--sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.settings-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.settings-field-grid--widget {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.toggle-field {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form__field input,
.form__field select,
.form__field textarea,
.loot-list-filters input,
.loot-list-filters select,
.loot-list-add input,
.loot-list-table input {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  color: #f8fafc;
  padding: 0.55rem 0.65rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form__field input:focus,
.form__field select:focus,
.form__field textarea:focus,
.loot-list-filters input:focus,
.loot-list-filters select:focus,
.loot-list-add input:focus,
.loot-list-table input:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

.form__field textarea {
  resize: vertical;
  min-height: 120px;
}

.form__error {
  color: #f87171;
  font-size: 0.82rem;
}

.loot-list-preferences {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loot-list-preferences .toggle-field {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.loot-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: center;
}

.loot-list-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.loot-list-tab {
  padding: 0.4rem 0.95rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(30, 41, 59, 0.6);
  color: #e2e8f0;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.loot-list-tab--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(96, 165, 250, 0.6);
  color: #e0f2fe;
}

.loot-list-filters {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.loot-list-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.loot-table-wrapper {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.85rem;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.55);
}

.loot-list-table {
  width: 100%;
  border-collapse: collapse;
}

.loot-list-table th,
.loot-list-table td {
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
  font-size: 0.9rem;
}

.loot-list-table tr:last-child td {
  border-bottom: none;
}

.loot-list-table__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
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
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

.parser-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.85), rgba(99, 102, 241, 0.8));
  color: #0f172a;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 12px 26px rgba(14, 165, 233, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.parser-button:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.8);
  box-shadow: 0 16px 32px rgba(14, 165, 233, 0.32);
}

.section-header__main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.section-header__title h1 {
  margin: 0;
}

.section-header__title p {
  margin: 0;
}

.back-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.55);
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.05em;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.back-link:hover {
  transform: translateY(-1px);
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(59, 130, 246, 0.18);
}

@media (max-width: 640px) {
  .back-link {
    width: 100%;
    justify-content: center;
  }
}

.parser-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.85), rgba(99, 102, 241, 0.8));
  color: #0f172a;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 12px 26px rgba(14, 165, 233, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.parser-button:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.8);
  box-shadow: 0 16px 32px rgba(14, 165, 233, 0.32);
}

</style>
