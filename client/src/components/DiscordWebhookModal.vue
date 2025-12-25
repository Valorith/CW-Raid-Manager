<template>
  <div class="modal-backdrop" @touchmove.prevent>
    <div class="modal webhook-modal">
      <header class="modal__header">
        <div>
          <h2>Discord Webhooks</h2>
          <p class="muted">Manage multiple Discord notifications for your guild.</p>
        </div>
        <button class="icon-button" type="button" @click="close">✕</button>
      </header>

      <div class="modal__body">
        <div v-if="loading" class="status">Loading settings…</div>
        <div v-else class="modal__content">
          <div class="webhook-layout">
            <aside class="webhook-sidebar">
              <div class="webhook-sidebar__header">
                <h3>Webhooks</h3>
                <button class="btn btn--outline btn--small" type="button" @click="addWebhook">
                  Add Webhook
                </button>
              </div>
              <div class="webhook-bulk-actions">
                <button
                  class="btn btn--outline btn--small"
                  type="button"
                  :disabled="bulkUpdating"
                  @click="bulkSetWebhooksEnabled(true)"
                >
                  Enable All
                </button>
                <button
                  class="btn btn--outline btn--small"
                  type="button"
                  :disabled="bulkUpdating"
                  @click="bulkSetWebhooksEnabled(false)"
                >
                  Disable All
                </button>
              </div>

              <!-- Debug Mode Panel (Admin Only) -->
              <div v-if="authStore.isAdmin" class="webhook-debug-panel">
                <div class="webhook-debug-panel__header">
                  <span class="webhook-debug-panel__title">Debug Mode</span>
                  <span
                    v-if="webhookDebugStore.isConnected"
                    class="webhook-debug-panel__status webhook-debug-panel__status--connected"
                  >
                    Connected
                  </span>
                </div>
                <label class="toggle-field toggle-field--debug">
                  <input
                    type="checkbox"
                    :checked="webhookDebugStore.debugModeEnabled"
                    :disabled="webhookDebugStore.loading"
                    @change="handleDebugModeToggle"
                  />
                  <span>Intercept all webhooks</span>
                </label>
                <p class="webhook-debug-panel__hint">
                  When enabled, webhooks are previewed instead of being sent to Discord.
                </p>
                <button
                  v-if="webhookDebugStore.hasMessages"
                  class="btn btn--outline btn--small btn--debug"
                  type="button"
                  @click="webhookDebugStore.showModal"
                >
                  View {{ webhookDebugStore.messageCount }} Message{{ webhookDebugStore.messageCount !== 1 ? 's' : '' }}
                </button>
              </div>

              <p v-if="webhooks.length === 0" class="muted small">No webhooks yet.</p>
              <ul class="webhook-sidebar__list">
                <li v-for="webhook in webhooks" :key="webhook.id">
                  <button
                    class="webhook-sidebar__item"
                    :class="{ 'webhook-sidebar__item--active': webhook.id === selectedWebhookId }"
                    type="button"
                    @click="selectWebhook(webhook.id)"
                  >
                    <div class="webhook-sidebar__item-header">
                      <span class="webhook-sidebar__label">{{ webhook.label || 'Untitled Webhook' }}</span>
                      <span
                        class="webhook-sidebar__status"
                        :class="{ 'webhook-sidebar__status--enabled': webhook.isEnabled }"
                      >
                        {{ webhook.isEnabled ? 'Enabled' : 'Disabled' }}
                      </span>
                    </div>
                  </button>
                </li>
              </ul>
            </aside>

            <section v-if="activeWebhook" class="webhook-form">
              <form class="form" @submit.prevent="handleSubmit">
                <section class="panel">
                  <header class="panel__header">
                    <h3>General Settings</h3>
                  </header>
                  <label class="form__field">
                    <span>Label</span>
                    <input v-model="form.label" type="text" maxlength="120" required />
                  </label>
                  <label class="toggle-field">
                    <input v-model="form.isEnabled" type="checkbox" />
                    <span>Enable notifications for this webhook</span>
                  </label>
                  <label class="form__field">
                    <span>Webhook URL</span>
                    <input
                      v-model="form.webhookUrl"
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      :required="form.isEnabled"
                    />
                    <small class="muted">Paste the Discord webhook URL for this destination.</small>
                  </label>

                  <div class="field-group">
                    <label class="form__field">
                      <span>Username Override</span>
                      <input v-model="form.usernameOverride" type="text" maxlength="120" />
                    </label>
                    <label class="form__field">
                      <span>Avatar URL</span>
                      <input v-model="form.avatarUrl" type="url" maxlength="512" />
                    </label>
                  </div>

                <label class="form__field">
                  <span>Mention Target (optional)</span>
                  <div class="mention-options">
                <label class="radio-option">
                  <input v-model="form.mentionTarget" type="radio" value="ROLE" />
                  <span>Specific Role</span>
                </label>
                <label class="radio-option">
                  <input v-model="form.mentionTarget" type="radio" value="EVERYONE" />
                  <span>@everyone</span>
                </label>
                <label class="radio-option">
                  <input v-model="form.mentionTarget" type="radio" value="HERE" />
                  <span>@here</span>
                </label>
              </div>
              <input
                v-model="form.mentionRoleId"
                type="text"
                maxlength="120"
                placeholder="123456789012345678"
                :disabled="form.mentionTarget !== 'ROLE'"
              />
              <small class="muted">Raid events can ping this role automatically.</small>
            </label>
                </section>

                <section class="panel">
                  <header class="panel__header">
                    <div>
                      <h3>Event Triggers</h3>
                      <p class="muted small">Choose which updates this webhook receives.</p>
                    </div>
                    <button class="btn btn--outline btn--small" type="button" @click="resetEventSubscriptions">
                      Reset to Defaults
                    </button>
                  </header>

                  <p v-if="!form.isEnabled" class="muted small">
                    Enable this webhook to configure event subscriptions.
                  </p>

                  <div v-for="group in groupedEvents" :key="group.category" class="event-group">
                    <h4>{{ categoryLabels[group.category] ?? group.category }}</h4>
                  <div class="event-grid">
                    <label
                      v-for="definition in group.events"
                      :key="definition.key"
                      class="event-toggle"
                      :class="{ 'event-toggle--disabled': !form.isEnabled }"
                    >
                      <input
                        v-model="form.eventSubscriptions[definition.key]"
                        type="checkbox"
                        :disabled="!form.isEnabled"
                      />
                      <div>
                        <strong>{{ definition.label }}</strong>
                        <p class="muted small">{{ definition.description }}</p>
                        <div class="event-toggle__actions">
                          <div class="mention-toggle">
                            <input
                              v-model="form.mentionSubscriptions[definition.key]"
                              type="checkbox"
                              :disabled="!form.isEnabled || !form.eventSubscriptions[definition.key] || !mentionTargetConfigured"
                            />
                            <span>Ping mention target</span>
                          </div>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
                </section>

                <p v-if="error" class="status status--error">{{ error }}</p>
                <p v-else-if="successMessage" class="status status--success">{{ successMessage }}</p>

                <footer class="form__actions form__actions--split">
                  <button
                    class="btn btn--danger btn--small"
                    type="button"
                    :disabled="deleting"
                    @click="deleteActiveWebhook"
                  >
                    {{ deleting ? 'Deleting…' : 'Delete Webhook' }}
                  </button>
                  <div class="form__actions-group">
                    <button class="btn btn--outline" type="button" @click="close">Close</button>
                    <button class="btn" type="submit" :disabled="submitting">
                      {{ submitting ? 'Saving…' : activeWebhook?.isNew ? 'Create Webhook' : 'Save Changes' }}
                    </button>
                  </div>
                </footer>
              </form>
            </section>

            <section v-else class="webhook-form webhook-form--empty">
              <p class="muted">Add a webhook to get started.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  api,
  type DiscordWebhookEventCategory,
  type DiscordWebhookEventDefinition,
  type GuildDiscordWebhookSettings
} from '../services/api';
import { useAuthStore } from '../stores/auth';
import { useWebhookDebugStore } from '../stores/webhookDebug';

const props = defineProps<{ guildId: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', webhook: GuildDiscordWebhookSettings): void }>();

const authStore = useAuthStore();
const webhookDebugStore = useWebhookDebugStore();

interface EditableWebhook extends GuildDiscordWebhookSettings {
  isNew?: boolean;
}

const loading = ref(true);
const submitting = ref(false);
const deleting = ref(false);
const bulkUpdating = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const eventDefinitions = ref<DiscordWebhookEventDefinition[]>([]);
const defaultEventSubscriptions = ref<Record<string, boolean>>({});
const defaultMentionSubscriptions = ref<Record<string, boolean>>({});
const webhooks = ref<EditableWebhook[]>([]);
const selectedWebhookId = ref<string | null>(null);

const form = reactive({
  label: '',
  isEnabled: false,
  webhookUrl: '',
  usernameOverride: '',
  avatarUrl: '',
  mentionRoleId: '',
  mentionTarget: 'ROLE',
  eventSubscriptions: {} as Record<string, boolean>,
  mentionSubscriptions: {} as Record<string, boolean>
});

const categoryLabels: Record<DiscordWebhookEventCategory, string> = {
  RAID: 'Raid Events',
  ATTENDANCE: 'Attendance',
  APPLICATION: 'Applications',
  BANK: 'Guild Bank'
};

const categoryOrder: DiscordWebhookEventCategory[] = ['RAID', 'ATTENDANCE', 'APPLICATION', 'BANK'];

const mentionTargetConfigured = computed(() => {
  if (form.mentionTarget === 'ROLE') {
    return form.mentionRoleId.trim().length > 0;
  }
  return form.mentionTarget === 'EVERYONE' || form.mentionTarget === 'HERE';
});

const groupedEvents = computed(() => {
  const grouped = eventDefinitions.value.reduce<Record<DiscordWebhookEventCategory, DiscordWebhookEventDefinition[]>>(
    (acc, definition) => {
      const bucket = definition.category ?? 'RAID';
      if (!acc[bucket]) {
        acc[bucket] = [] as DiscordWebhookEventDefinition[];
      }
      acc[bucket]?.push(definition);
      return acc;
    },
    { RAID: [], ATTENDANCE: [], APPLICATION: [], BANK: [] }
  );

  return categoryOrder
    .map((category) => ({ category, events: grouped[category] ?? [] }))
    .filter((group) => group.events.length > 0);
});

const activeWebhook = computed<EditableWebhook | null>(() => {
  if (!selectedWebhookId.value) {
    return webhooks.value[0] ?? null;
  }
  return webhooks.value.find((webhook) => webhook.id === selectedWebhookId.value) ?? null;
});

watch(activeWebhook, (webhook) => {
  if (webhook) {
    applyForm(webhook);
  } else {
    resetForm();
  }
});

async function loadWebhooks(preferredId?: string | null) {
  loading.value = true;
  error.value = null;
  successMessage.value = null;
  try {
    const response = await api.fetchGuildWebhooks(props.guildId);
    eventDefinitions.value = response.eventDefinitions ?? [];
    defaultEventSubscriptions.value = response.defaultEventSubscriptions ?? {};
    defaultMentionSubscriptions.value = response.defaultMentionSubscriptions ?? {};

    if (response.webhooks.length > 0) {
      webhooks.value = response.webhooks.map((webhook) => ({ ...webhook, isNew: false }));
      const candidate = preferredId && response.webhooks.some((webhook) => webhook.id === preferredId)
        ? preferredId
        : response.webhooks[0].id;
      selectedWebhookId.value = candidate;
    } else {
      const placeholder = createLocalWebhook();
      webhooks.value = [placeholder];
      selectedWebhookId.value = placeholder.id;
    }
  } catch (err) {
    error.value = extractErrorMessage(err, 'Unable to load webhook settings.');
    defaultMentionSubscriptions.value = {};
    const placeholder = createLocalWebhook();
    webhooks.value = [placeholder];
    selectedWebhookId.value = placeholder.id;
  } finally {
    loading.value = false;
  }
}

function createLocalWebhook(): EditableWebhook {
  const tempId = generateTempId();
  return {
    id: tempId,
    guildId: props.guildId,
    label: 'New Webhook',
    webhookUrl: null,
    isEnabled: false,
    usernameOverride: null,
    avatarUrl: null,
    mentionRoleId: null,
    eventSubscriptions: buildEventSubscriptionsMap(),
    mentionSubscriptions: buildMentionSubscriptionsMap(),
    createdAt: null,
    updatedAt: null,
    isNew: true
  };
}

function selectWebhook(webhookId: string) {
  if (selectedWebhookId.value === webhookId) {
    return;
  }
  selectedWebhookId.value = webhookId;
  successMessage.value = null;
  error.value = null;
}

function addWebhook() {
  const placeholder = createLocalWebhook();
  webhooks.value = [...webhooks.value, placeholder];
  selectedWebhookId.value = placeholder.id;
  form.mentionTarget = 'ROLE';
}

function applyForm(webhook: EditableWebhook) {
  form.label = webhook.label ?? 'New Webhook';
  form.isEnabled = Boolean(webhook.isEnabled);
  form.webhookUrl = webhook.webhookUrl ?? '';
  form.usernameOverride = webhook.usernameOverride ?? '';
  form.avatarUrl = webhook.avatarUrl ?? '';
  const mention = webhook.mentionRoleId ?? '';
  if (mention === '@everyone' || mention === 'everyone') {
    form.mentionTarget = 'EVERYONE';
    form.mentionRoleId = '';
  } else if (mention === '@here' || mention === 'here') {
    form.mentionTarget = 'HERE';
    form.mentionRoleId = '';
  } else {
    form.mentionTarget = 'ROLE';
    form.mentionRoleId = mention;
  }
  form.eventSubscriptions = buildEventSubscriptionsMap(webhook.eventSubscriptions);
  form.mentionSubscriptions = buildMentionSubscriptionsMap(webhook.mentionSubscriptions);
}

function resetForm() {
  form.label = '';
  form.isEnabled = false;
  form.webhookUrl = '';
  form.usernameOverride = '';
  form.avatarUrl = '';
  form.mentionRoleId = '';
  form.mentionTarget = 'ROLE';
  form.eventSubscriptions = buildEventSubscriptionsMap();
  form.mentionSubscriptions = buildMentionSubscriptionsMap();
}

function buildEventSubscriptionsMap(source?: Record<string, boolean>) {
  const defaults = defaultEventSubscriptions.value ?? {};
  const map: Record<string, boolean> = {};
  for (const definition of eventDefinitions.value) {
    const current = source?.[definition.key];
    const fallback = defaults[definition.key];
    map[definition.key] = typeof current === 'boolean' ? current : Boolean(fallback);
  }
  return map;
}

function buildMentionSubscriptionsMap(source?: Record<string, boolean>) {
  const defaults = defaultMentionSubscriptions.value ?? {};
  const map: Record<string, boolean> = {};
  for (const definition of eventDefinitions.value) {
    const current = source?.[definition.key];
    const fallback = defaults[definition.key];
    map[definition.key] = typeof current === 'boolean' ? current : Boolean(fallback);
  }
  return map;
}

function buildMentionTargetValue() {
  if (form.mentionTarget === 'EVERYONE') {
    return '@everyone';
  }
  if (form.mentionTarget === 'HERE') {
    return '@here';
  }
  return form.mentionRoleId.trim() || null;
}

function resetEventSubscriptions() {
  form.eventSubscriptions = buildEventSubscriptionsMap();
  form.mentionSubscriptions = buildMentionSubscriptionsMap();
}

async function handleSubmit() {
  if (submitting.value) {
    return;
  }

  const target = activeWebhook.value;
  if (!target) {
    return;
  }

  error.value = null;
  successMessage.value = null;
  submitting.value = true;

  const label = form.label.trim();
  if (!label) {
    error.value = 'Webhook label is required.';
    submitting.value = false;
    return;
  }

  const sanitizedUrl = form.webhookUrl.trim();
  if (form.isEnabled && !sanitizedUrl) {
    error.value = 'Webhook URL is required when enabling notifications.';
    submitting.value = false;
    return;
  }

  const payloadBase = {
    isEnabled: form.isEnabled,
    webhookUrl: sanitizedUrl ? sanitizedUrl : null,
    usernameOverride: form.usernameOverride.trim() || null,
    avatarUrl: form.avatarUrl.trim() || null,
    mentionRoleId: buildMentionTargetValue(),
    eventSubscriptions: { ...form.eventSubscriptions },
    mentionSubscriptions: { ...form.mentionSubscriptions }
  };

  try {
    let saved: GuildDiscordWebhookSettings;
    if (target.isNew) {
      saved = await api.createGuildWebhook(props.guildId, {
        label,
        ...payloadBase
      });
    } else {
      saved = await api.updateGuildWebhook(props.guildId, target.id, {
        label,
        ...payloadBase
      });
    }

    successMessage.value = target.isNew ? 'Webhook created.' : 'Webhook updated.';
    emit('saved', saved);
    await loadWebhooks(saved.id);
  } catch (err) {
    error.value = extractErrorMessage(err, 'Unable to save webhook settings.');
  } finally {
    submitting.value = false;
  }
}

async function deleteActiveWebhook() {
  const target = activeWebhook.value;
  if (!target) {
    return;
  }

  if (target.isNew) {
    removeLocalWebhook(target.id);
    successMessage.value = null;
    return;
  }

  if (!confirm('Delete this webhook? This cannot be undone.')) {
    return;
  }

  deleting.value = true;
  error.value = null;
  successMessage.value = null;
  try {
    await api.deleteGuildWebhook(props.guildId, target.id);
    successMessage.value = 'Webhook deleted.';
    await loadWebhooks();
  } catch (err) {
    error.value = extractErrorMessage(err, 'Unable to delete webhook.');
  } finally {
    deleting.value = false;
  }
}

function removeLocalWebhook(id: string) {
  const remaining = webhooks.value.filter((webhook) => webhook.id !== id);
  if (remaining.length === 0) {
    const placeholder = createLocalWebhook();
    webhooks.value = [placeholder];
    selectedWebhookId.value = placeholder.id;
    return;
  }
  webhooks.value = remaining;
  selectedWebhookId.value = remaining[0].id;
}

async function bulkSetWebhooksEnabled(enabled: boolean) {
  if (bulkUpdating.value) {
    return;
  }

  bulkUpdating.value = true;
  error.value = null;
  successMessage.value = null;

  const webhookList = [...webhooks.value];
  const failures: string[] = [];

  await Promise.all(
    webhookList.map(async (webhook) => {
      if (webhook.isNew) {
        webhook.isEnabled = enabled;
        if (activeWebhook.value?.id === webhook.id) {
          form.isEnabled = enabled;
        }
        return;
      }

      if (Boolean(webhook.isEnabled) === enabled) {
        return;
      }

      try {
        await api.updateGuildWebhook(props.guildId, webhook.id, {
          label: webhook.label ?? 'Webhook',
          isEnabled: enabled,
          webhookUrl: webhook.webhookUrl ?? null,
          usernameOverride: webhook.usernameOverride ?? null,
          avatarUrl: webhook.avatarUrl ?? null,
          mentionRoleId: webhook.mentionRoleId ?? null,
          eventSubscriptions: webhook.eventSubscriptions ?? buildEventSubscriptionsMap(),
          mentionSubscriptions: webhook.mentionSubscriptions ?? buildMentionSubscriptionsMap()
        });
      } catch (err) {
        failures.push(webhook.label ?? webhook.id);
      }
    })
  );

  await loadWebhooks(activeWebhook.value?.id);

  if (failures.length > 0) {
    error.value = `Unable to update ${failures.length} webhook${failures.length === 1 ? '' : 's'}.`;
  } else {
    successMessage.value = enabled ? 'All webhooks enabled.' : 'All webhooks disabled.';
  }

  bulkUpdating.value = false;
}

function close() {
  emit('close');
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: any; status?: number } }).response;
    const message = response?.data?.message ?? response?.data?.error;
    if (typeof message === 'string') {
      return message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function generateTempId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `temp-${Math.random().toString(36).slice(2, 11)}`;
}

async function handleDebugModeToggle(event: Event) {
  const target = event.target as HTMLInputElement;
  const enabled = target.checked;
  await webhookDebugStore.setDebugMode(props.guildId, enabled);
}

onMounted(async () => {
  loadWebhooks();
  // Initialize webhook debug store for admins
  if (authStore.isAdmin) {
    await webhookDebugStore.initialize(props.guildId);
  }
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 120;
}

.modal {
  width: min(900px, 100%);
  max-height: calc(100vh - 1.5rem);
  height: min(860px, calc(100vh - 1.5rem));
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: hidden;
  min-height: 0;
}

.modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.modal__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.modal__content {
  height: 100%;
  overflow-y: auto;
  padding-right: 0.5rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.webhook-layout {
  display: flex;
  gap: 1.25rem;
  height: 100%;
}

.webhook-sidebar {
  width: 260px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.webhook-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.webhook-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
}

.webhook-sidebar__item {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.4);
  color: inherit;
  text-align: left;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.webhook-sidebar__item--active {
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(59, 130, 246, 0.15);
}

.webhook-sidebar__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.webhook-sidebar__label {
  font-weight: 600;
}

.webhook-sidebar__status {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #f87171;
}

.webhook-sidebar__status--enabled {
  color: #34d399;
}

.webhook-form {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.25rem;
  background: rgba(15, 23, 42, 0.65);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.webhook-form--empty {
  align-items: center;
  justify-content: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.panel {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  padding: 1.5rem;
  background: rgba(30, 41, 59, 0.55);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form__field input {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  color: #f8fafc;
}

.mention-options {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.radio-option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}

.radio-option input {
  width: 16px;
  height: 16px;
}

.toggle-field {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.toggle-field input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

.field-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.event-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.event-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-toggle__actions {
  margin-top: 0.35rem;
}

.mention-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #cbd5f5;
}

.mention-toggle input {
  width: 16px;
  height: 16px;
}

.event-toggle {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
}

.event-toggle input {
  margin-top: 0.45rem;
}

.event-toggle--disabled {
  opacity: 0.6;
}

.status {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #e2e8f0;
}

.status--error {
  border-color: rgba(248, 113, 113, 0.6);
  color: #fecaca;
}

.status--success {
  border-color: rgba(52, 211, 153, 0.6);
  color: #bbf7d0;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.form__actions--split {
  justify-content: space-between;
  align-items: center;
}

.form__actions-group {
  display: flex;
  gap: 0.75rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1.25rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.55rem 1.1rem;
  border-radius: 0.65rem;
  border: 1px solid transparent;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(14, 165, 233, 0.7));
  color: #f8fafc;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.45);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.75);
  color: #bae6fd;
}

.btn--small {
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
}

.btn--danger {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.6);
  color: #fecaca;
  border-radius: 0.5rem;
  padding: 0.5rem 0.9rem;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.35);
}

.btn--danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 1024px) {
  .webhook-layout {
    flex-direction: column;
  }

  .webhook-sidebar {
    width: 100%;
    max-height: 240px;
  }
}

/* Debug Mode Panel */
.webhook-debug-panel {
  margin-top: 0.75rem;
  padding: 0.85rem;
  background: linear-gradient(135deg, rgba(88, 101, 242, 0.15), rgba(88, 101, 242, 0.08));
  border: 1px solid rgba(88, 101, 242, 0.35);
  border-radius: 0.75rem;
}

.webhook-debug-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.webhook-debug-panel__title {
  font-weight: 600;
  font-size: 0.85rem;
  color: #a5b4fc;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.webhook-debug-panel__status {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.webhook-debug-panel__status--connected {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.4);
}

.toggle-field--debug {
  margin-bottom: 0.35rem;
}

.toggle-field--debug span {
  font-size: 0.85rem;
  color: #e2e8f0;
}

.webhook-debug-panel__hint {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0 0 0.5rem;
  line-height: 1.4;
}

.btn--debug {
  width: 100%;
  margin-top: 0.5rem;
  background: rgba(88, 101, 242, 0.2);
  border-color: rgba(88, 101, 242, 0.5);
  color: #a5b4fc;
}

.btn--debug:hover:not(:disabled) {
  background: rgba(88, 101, 242, 0.35);
  border-color: rgba(88, 101, 242, 0.7);
}
</style>
