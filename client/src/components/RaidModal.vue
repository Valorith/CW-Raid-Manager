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
          <span>Notes</span>
          <textarea v-model="form.notes" rows="3"></textarea>
        </label>

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
import { computed, reactive, ref } from 'vue';

import { api } from '../services/api';

const props = defineProps<{
  guildId: string;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
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
  notes: ''
});

const submitting = ref(false);
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
  try {
    await api.createRaidEvent({
      guildId: props.guildId,
      name: form.name,
      startTime: new Date(form.startTime).toISOString(),
      targetZones: splitAndFilter(form.targetZones),
      targetBosses: splitAndFilter(form.targetBosses),
      notes: form.notes || undefined
    });
    emit('created');
  } finally {
    submitting.value = false;
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
.form__field textarea {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: #f8fafc;
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

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}
</style>
