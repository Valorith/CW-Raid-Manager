<template>
  <div class="modal-backdrop" @touchmove.prevent>
    <div class="modal slack-webhook-modal">
      <header class="modal__header">
        <div>
          <h2>Slack Webhooks</h2>
          <p class="muted">Connect Slack channels for guild notifications.</p>
        </div>
        <button class="icon-button" type="button" @click="$emit('close')">✕</button>
      </header>

      <div class="modal__body">
        <div v-if="loading" class="status">Loading Slack settings...</div>
        <div v-else class="slack-layout">
          <aside class="slack-sidebar">
            <div class="slack-sidebar__header">
              <h3>Destinations</h3>
            </div>
            <label class="form__field">
              <span>New Destination</span>
              <input v-model="newLabel" type="text" maxlength="120" placeholder="Raid Alerts" />
            </label>
            <button
              class="btn btn--primary btn--small"
              type="button"
              :disabled="busy || !newLabel.trim()"
              @click="createAndConnect"
            >
              Connect New Slack
            </button>

            <p v-if="webhooks.length === 0" class="muted small">No Slack destinations yet.</p>
            <button
              v-for="webhook in webhooks"
              :key="webhook.id"
              class="slack-destination"
              :class="{ 'slack-destination--active': webhook.id === selectedId }"
              type="button"
              @click="select(webhook.id)"
            >
              <strong>{{ webhook.label }}</strong>
              <span>{{ webhook.isEnabled ? 'Enabled' : 'Disabled' }}</span>
            </button>
          </aside>

          <section v-if="activeWebhook" class="slack-form">
            <label class="form__field">
              <span>Label</span>
              <input v-model="form.label" type="text" maxlength="120" />
            </label>
            <label class="toggle-field">
              <input v-model="form.isEnabled" type="checkbox" />
              <span>Enable this Slack destination</span>
            </label>

            <div class="slack-connection">
              <strong>{{ connectionLabel(activeWebhook) }}</strong>
              <div class="slack-actions">
                <button class="btn btn--outline btn--small" type="button" :disabled="busy" @click="reconnect">
                  {{ activeWebhook.hasSlackWebhook ? 'Reconnect' : 'Connect Slack' }}
                </button>
                <button
                  class="btn btn--outline btn--small"
                  type="button"
                  :disabled="busy || !activeWebhook.hasSlackWebhook"
                  @click="test"
                >
                  Send Test
                </button>
                <button
                  class="btn btn--danger btn--small"
                  type="button"
                  :disabled="busy || !activeWebhook.hasSlackWebhook"
                  @click="disconnect"
                >
                  Disconnect
                </button>
              </div>
            </div>

            <section>
              <header class="slack-section-header">
                <div>
                  <h3>Event Triggers</h3>
                  <p class="muted small">Choose which guild events post to Slack.</p>
                </div>
                <button class="btn btn--outline btn--small" type="button" @click="resetEvents">
                  Reset
                </button>
              </header>
              <div class="slack-event-grid">
                <label
                  v-for="event in eventDefinitions"
                  :key="event.key"
                  class="slack-event"
                  :class="{ 'slack-event--checked': form.eventSubscriptions[event.key] }"
                >
                  <input v-model="form.eventSubscriptions[event.key]" type="checkbox" />
                  <span>
                    <strong>{{ event.label }}</strong>
                    <small>{{ event.description }}</small>
                  </span>
                </label>
              </div>
            </section>

            <footer class="modal__footer">
              <button class="btn btn--danger" type="button" :disabled="busy" @click="remove">
                Delete
              </button>
              <button class="btn btn--primary" type="button" :disabled="busy || !form.label.trim()" @click="save">
                Save
              </button>
            </footer>
          </section>
          <section v-else class="slack-form slack-form--empty">
            <p class="muted">Select or connect a Slack destination.</p>
          </section>
        </div>
        <p v-if="error" class="form__error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import {
  api,
  type DiscordWebhookEventDefinition,
  type GuildSlackWebhookSettings
} from '../services/api';

const props = defineProps<{ guildId: string }>();
defineEmits<{ (event: 'close'): void }>();

const loading = ref(true);
const busy = ref(false);
const error = ref('');
const webhooks = ref<GuildSlackWebhookSettings[]>([]);
const eventDefinitions = ref<DiscordWebhookEventDefinition[]>([]);
const defaultEventSubscriptions = ref<Record<string, boolean>>({});
const selectedId = ref<string | null>(null);
const newLabel = ref('Slack Notifications');
const form = reactive({
  label: '',
  isEnabled: true,
  eventSubscriptions: {} as Record<string, boolean>
});

const activeWebhook = computed(
  () => webhooks.value.find((webhook) => webhook.id === selectedId.value) ?? null
);

function currentReturnPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function applyForm(webhook: GuildSlackWebhookSettings | null) {
  form.label = webhook?.label ?? '';
  form.isEnabled = webhook?.isEnabled ?? true;
  form.eventSubscriptions = {
    ...defaultEventSubscriptions.value,
    ...(webhook?.eventSubscriptions ?? {})
  };
}

function select(id: string) {
  selectedId.value = id;
  applyForm(activeWebhook.value);
}

function connectionLabel(webhook: GuildSlackWebhookSettings) {
  if (!webhook.hasSlackWebhook) {
    return 'No Slack channel connected.';
  }
  const workspace = webhook.slackTeamName || 'Slack workspace';
  const channel = webhook.slackChannelName || webhook.slackChannelId || 'selected channel';
  return `${workspace} / ${channel}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.fetchGuildSlackWebhooks(props.guildId);
    webhooks.value = data.webhooks;
    eventDefinitions.value = data.eventDefinitions;
    defaultEventSubscriptions.value = data.defaultEventSubscriptions;
    if (!selectedId.value || !webhooks.value.some((webhook) => webhook.id === selectedId.value)) {
      selectedId.value = webhooks.value[0]?.id ?? null;
    }
    applyForm(activeWebhook.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load Slack webhooks.';
  } finally {
    loading.value = false;
  }
}

async function createAndConnect() {
  busy.value = true;
  error.value = '';
  try {
    const result = await api.startGuildSlackWebhookInstall(props.guildId, {
      label: newLabel.value.trim(),
      isEnabled: true,
      eventSubscriptions: { ...defaultEventSubscriptions.value },
      returnPath: currentReturnPath()
    });
    window.location.href = result.authorizeUrl;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to start Slack install.';
  } finally {
    busy.value = false;
  }
}

async function reconnect() {
  if (!activeWebhook.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.reconnectGuildSlackWebhook(
      props.guildId,
      activeWebhook.value.id,
      currentReturnPath()
    );
    window.location.href = result.authorizeUrl;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to start Slack install.';
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!activeWebhook.value) return;
  busy.value = true;
  error.value = '';
  try {
    const saved = await api.updateGuildSlackWebhook(props.guildId, activeWebhook.value.id, {
      label: form.label.trim(),
      isEnabled: form.isEnabled,
      eventSubscriptions: { ...form.eventSubscriptions }
    });
    webhooks.value = webhooks.value.map((webhook) => (webhook.id === saved.id ? saved : webhook));
    select(saved.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to save Slack webhook.';
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  if (!activeWebhook.value || !confirm(`Disconnect ${activeWebhook.value.label} from Slack?`)) return;
  busy.value = true;
  error.value = '';
  try {
    const saved = await api.disconnectGuildSlackWebhook(props.guildId, activeWebhook.value.id);
    webhooks.value = webhooks.value.map((webhook) => (webhook.id === saved.id ? saved : webhook));
    select(saved.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to disconnect Slack.';
  } finally {
    busy.value = false;
  }
}

async function test() {
  if (!activeWebhook.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.testGuildSlackWebhook(props.guildId, activeWebhook.value.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to send Slack test.';
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!activeWebhook.value || !confirm(`Delete ${activeWebhook.value.label}?`)) return;
  busy.value = true;
  error.value = '';
  try {
    await api.deleteGuildSlackWebhook(props.guildId, activeWebhook.value.id);
    selectedId.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to delete Slack webhook.';
  } finally {
    busy.value = false;
  }
}

function resetEvents() {
  form.eventSubscriptions = { ...defaultEventSubscriptions.value };
}

onMounted(load);
</script>

<style scoped>
.slack-webhook-modal {
  max-width: 1080px;
}

.slack-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1rem;
}

.slack-sidebar,
.slack-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.slack-sidebar {
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  padding-right: 1rem;
}

.slack-sidebar__header,
.slack-section-header,
.slack-actions {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.slack-destination {
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  text-align: left;
}

.slack-destination--active {
  border-color: rgba(34, 197, 94, 0.62);
}

.slack-connection {
  background: rgba(15, 23, 42, 0.34);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.85rem;
}

.slack-event-grid {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.slack-event {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: auto 1fr;
  padding: 0.75rem;
}

.slack-event--checked {
  border-color: rgba(34, 197, 94, 0.58);
}

.slack-event small {
  display: block;
  margin-top: 0.2rem;
}

@media (max-width: 780px) {
  .slack-layout {
    grid-template-columns: 1fr;
  }

  .slack-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22);
    padding-bottom: 1rem;
    padding-right: 0;
  }
}
</style>
