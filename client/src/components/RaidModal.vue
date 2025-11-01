<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">
      <header class="modal__header">
        <h2>Schedule Raid</h2>
        <button class="icon-button" @click="close">✕</button>
      </header>

      <form class="form" @submit.prevent="submit">
        <label class="form__field">
          <span>Raid Name</span>
          <input v-model="form.name" type="text" required maxlength="120" />
        </label>

        <label class="form__field">
          <span>Start Time</span>
          <input v-model="form.startTime" type="datetime-local" required />
          <small v-if="defaultWindowLabel" class="form__hint">{{ defaultWindowLabel }}</small>
        </label>

        <label class="form__field">
          <span>Target Zones (comma separated)</span>
          <input v-model="form.targetZones" type="text" placeholder="Temple of Veeshan, Kael Drakkel" />
        </label>

        <label class="form__field">
          <span>Target Bosses (comma separated)</span>
          <input v-model="form.targetBosses" type="text" placeholder="Vulak`Aerr, Statue of Rallos Zek" />
        </label>

        <label class="form__field">
          <span>Discord Voice Channel</span>
          <input
            v-model="form.discordVoiceUrl"
            type="url"
            placeholder="https://discord.gg/your-voice-channel"
            @input="clearDiscordVoiceUrlError"
          />
          <small v-if="errors.discordVoiceUrl" class="form__error">{{ errors.discordVoiceUrl }}</small>
          <small v-else class="form__hint">Shown as a "Chat on Discord" button on the raid page.</small>
        </label>

        <label class="form__field">
          <span>Notes</span>
          <textarea v-model="form.notes" rows="3"></textarea>
        </label>

        <div class="form__field form__field--checkbox">
          <label class="checkbox">
            <input v-model="form.recurrenceEnabled" type="checkbox" />
            <span>Repeat this raid</span>
          </label>
        </div>

        <div v-if="form.recurrenceEnabled" class="recurrence-fields">
          <label class="form__field">
            <span>Frequency</span>
            <select v-model="form.recurrenceFrequency">
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label class="form__field form__field--inline">
            <span>Repeat Every</span>
            <input
              v-model.number="form.recurrenceInterval"
              type="number"
              min="1"
              class="recurrence-interval"
            />
            <span class="recurrence-interval__suffix">{{ intervalSuffix }}</span>
          </label>
          <label class="form__field">
            <span>End Date (optional)</span>
            <input v-model="form.recurrenceEndDate" type="date" />
            <small class="form__hint">Leave empty to repeat until disabled.</small>
          </label>
        </div>

        <footer class="form__actions">
          <button class="btn btn--outline" type="button" @click="close">Cancel</button>
          <button class="btn" type="submit" :disabled="submitting">
            {{ submitting ? 'Scheduling…' : 'Create Raid' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import { api } from '../services/api';
import { normalizeOptionalUrl } from '../utils/urls';

const props = defineProps<{
  guildId: string;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  defaultDiscordVoiceUrl?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created'): void;
}>();

const form = reactive({
  name: '',
  startTime: buildDateInput(props.defaultStartTime),
  targetZones: '',
  targetBosses: '',
  notes: '',
  discordVoiceUrl: props.defaultDiscordVoiceUrl ?? '',
  recurrenceEnabled: false,
  recurrenceFrequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
  recurrenceInterval: 1,
  recurrenceEndDate: ''
});

const submitting = ref(false);
const errors = reactive({
  discordVoiceUrl: ''
});
const intervalSuffix = computed(() => {
  const interval = Number(form.recurrenceInterval) || 1;
  switch (form.recurrenceFrequency) {
    case 'DAILY':
      return interval === 1 ? 'day' : 'days';
    case 'MONTHLY':
      return interval === 1 ? 'month' : 'months';
    default:
      return interval === 1 ? 'week' : 'weeks';
  }
});

watch(
  () => form.recurrenceInterval,
  (value) => {
    if (!Number.isFinite(value) || Number(value) < 1) {
      form.recurrenceInterval = 1;
    } else {
      form.recurrenceInterval = Math.floor(Number(value));
    }
  }
);
const defaultWindowLabel = computed(() => {
  const start = formatDefaultClock(props.defaultStartTime);
  const end = formatDefaultClock(props.defaultEndTime);
  if (start && end) {
    return `Guild default window: ${start} → ${end}`;
  }
  if (start) {
    return `Guild default start: ${start}`;
  }
  if (end) {
    return `Guild default end: ${end}`;
  }
  return null;
});

function close() {
  emit('close');
}

async function submit() {
  submitting.value = true;
  errors.discordVoiceUrl = '';
  try {
    const { normalized, valid } = normalizeOptionalUrl(form.discordVoiceUrl);
    if (!valid) {
      errors.discordVoiceUrl = 'Enter a valid Discord URL.';
      submitting.value = false;
      return;
    }

    form.discordVoiceUrl = normalized ?? '';

    const recurrencePayload =
      form.recurrenceEnabled
        ? {
            frequency: form.recurrenceFrequency,
            interval: Math.max(1, form.recurrenceInterval),
            endDate: form.recurrenceEndDate
              ? new Date(`${form.recurrenceEndDate}T00:00:00`).toISOString()
              : null
          }
        : null;

    await api.createRaidEvent({
      guildId: props.guildId,
      name: form.name,
      startTime: new Date(form.startTime).toISOString(),
      targetZones: splitAndFilter(form.targetZones),
      targetBosses: splitAndFilter(form.targetBosses),
      notes: form.notes || undefined,
      discordVoiceUrl: normalized ?? undefined,
      recurrence: recurrencePayload
    });
    emit('created');
  } finally {
    submitting.value = false;
  }
}

function clearDiscordVoiceUrlError() {
  if (errors.discordVoiceUrl) {
    errors.discordVoiceUrl = '';
  }
}

function splitAndFilter(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDateInput(defaultTime?: string | null) {
  const date = new Date();
  if (defaultTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(defaultTime)) {
    const [hours, minutes] = defaultTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDefaultClock(value?: string | null) {
  if (!value || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}
</script>

<style scoped>
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
  width: min(520px, 100%);
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
.form__field textarea,
.form__field select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: #f8fafc;
}

.form__field--inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form__field--checkbox {
  display: flex;
  align-items: center;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.recurrence-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
}

.recurrence-interval {
  width: 5.5rem;
}

.recurrence-interval__suffix {
  color: #cbd5f5;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.form__hint {
  font-size: 0.8rem;
  color: #94a3b8;
}

.form__error {
  font-size: 0.8rem;
  color: #f87171;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}
</style>
