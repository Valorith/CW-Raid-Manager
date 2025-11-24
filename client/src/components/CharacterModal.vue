<template>
  <div class="modal-backdrop">
    <div class="modal">
      <header class="modal__header">
        <h2>{{ editing ? "Edit Character" : "Add Character" }}</h2>
        <button class="icon-button" @click="close">✕</button>
      </header>

      <form class="form" @submit.prevent="submit">
        <label class="form__field">
          <span>Name</span>
          <input v-model="form.name" type="text" required />
        </label>

        <label class="form__field">
          <span>Level</span>
          <input v-model.number="form.level" type="number" min="1" max="125" required />
        </label>

        <label class="form__field">
          <span>Class</span>
          <select v-model="form.class" required>
            <option value="" disabled>Select class</option>
            <option v-for="c in classes" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </label>

        <label class="form__field">
          <span>Guild</span>
          <select v-model="form.guildId">
            <option value="">No guild</option>
            <option v-for="guild in guilds" :key="guild.id" :value="guild.id">
              {{ guild.name }}
            </option>
          </select>
        </label>

        <label class="form__checkbox">
          <input v-model="form.isMain" type="checkbox" :disabled="!props.canSetMain" />
          <span>Main character</span>
        </label>
        <p v-if="!props.canSetMain" class="hint muted">
          You already have two main characters. Unset one before promoting another.
        </p>
        <p v-if="errorMessage" class="form__error">{{ errorMessage }}</p>
        <p v-if="deleteError" class="form__error form__error--danger">{{ deleteError }}</p>

        <footer class="form__actions">
          <button class="btn btn--outline" type="button" @click="close">Cancel</button>
          <button class="btn" type="submit" :disabled="submitting || deleting">
            {{ submitting ? 'Saving…' : 'Save Character' }}
          </button>
        </footer>

        <div v-if="editing && props.character" class="danger-zone">
          <div class="danger-zone__content">
            <p class="danger-zone__title">Delete character</p>
            <p class="danger-zone__hint muted">This will remove the character from your roster.</p>
          </div>
          <button
            class="btn btn--danger"
            type="button"
            :disabled="deleting || submitting"
            @click="removeCharacter"
          >
            {{ deleting ? 'Deleting…' : 'Delete Character' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';

import type { GuildSummary } from '../services/api';
import type { CharacterClass } from '../services/types';
import { api } from '../services/api';

type EditableCharacter = {
  id: string;
  name: string;
  level: number;
  class: CharacterClass;
  guildId?: string | null;
  isMain: boolean;
};

const props = defineProps<{
  guilds: GuildSummary[];
  canSetMain: boolean;
  editing?: boolean;
  character?: EditableCharacter;
  contextGuildId?: string | null;
}>();


const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created'): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const classes = [
  { label: 'Bard', value: 'BARD' },
  { label: 'Beastlord', value: 'BEASTLORD' },
  { label: 'Berserker', value: 'BERSERKER' },
  { label: 'Cleric', value: 'CLERIC' },
  { label: 'Druid', value: 'DRUID' },
  { label: 'Enchanter', value: 'ENCHANTER' },
  { label: 'Magician', value: 'MAGICIAN' },
  { label: 'Monk', value: 'MONK' },
  { label: 'Necromancer', value: 'NECROMANCER' },
  { label: 'Paladin', value: 'PALADIN' },
  { label: 'Ranger', value: 'RANGER' },
  { label: 'Rogue', value: 'ROGUE' },
  { label: 'Shadow Knight', value: 'SHADOWKNIGHT' },
  { label: 'Shaman', value: 'SHAMAN' },
  { label: 'Warrior', value: 'WARRIOR' },
  { label: 'Wizard', value: 'WIZARD' }
];

const form = reactive({
  name: props.character?.name ?? '',
  level: props.character?.level ?? 60,
  class: (props.character?.class as CharacterClass | undefined) ?? ('' as CharacterClass | ''),
  guildId: props.character?.guildId ?? '',
  isMain: props.character?.isMain ?? false
});

const submitting = ref(false);
const errorMessage = ref('');
const deleting = ref(false);
const deleteError = ref('');

watch(
  () => props.canSetMain,
  (value) => {
    if (props.editing) {
      return;
    }
    if (!value) {
      form.isMain = false;
    } else if (!submitting.value) {
      form.isMain = true;
    }
  },
  { immediate: true }
);

watch(
  () => props.character,
  (character) => {
    form.name = character?.name ?? '';
    form.level = character?.level ?? 60;
    form.class = (character?.class as CharacterClass | undefined) ?? ('' as CharacterClass | '');
    form.guildId = character?.guildId ?? '';
    form.isMain = character?.isMain ?? false;
  },
  { immediate: true }
);

function close() {
  form.name = props.character?.name ?? '';
  form.level = props.character?.level ?? 60;
  form.class = (props.character?.class as CharacterClass | undefined) ?? ('' as CharacterClass | '');
  form.guildId = props.character?.guildId ?? '';
  form.isMain = props.character?.isMain ?? props.canSetMain;
  errorMessage.value = '';
  deleteError.value = '';
  emit('close');
}

async function submit() {
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (props.editing && props.character) {
      await api.updateCharacter(props.character.id, {
        name: form.name,
        level: form.level,
        class: form.class as CharacterClass,
        guildId: form.guildId || undefined,
        isMain: form.isMain,
        contextGuildId: props.contextGuildId ?? undefined
      });
      emit('updated');
    } else {
      await api.createCharacter({
        name: form.name,
        level: form.level,
        class: form.class as CharacterClass,
        guildId: form.guildId || undefined,
        isMain: form.isMain
      });
      form.name = '';
      form.level = 60;
      form.class = '' as CharacterClass | '';
      form.guildId = '';
      form.isMain = props.canSetMain;
      errorMessage.value = '';
      emit('created');
    }
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, props.editing ? 'Unable to update character.' : 'Unable to create character.');
    submitting.value = false;
    return;
  } finally {
    submitting.value = false;
  }
}

async function removeCharacter() {
  if (!props.character || deleting.value) {
    return;
  }

  const confirmed = window.confirm(
    `Delete ${props.character.name}? This cannot be undone and will remove the character from your roster.`
  );

  if (!confirmed) {
    return;
  }

  deleting.value = true;
  deleteError.value = '';

  try {
    await api.deleteCharacter(props.character.id);
    emit('deleted');
  } catch (error) {
    deleteError.value = extractErrorMessage(error, 'Unable to delete character.');
  } finally {
    deleting.value = false;
  }
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
  width: min(480px, 100%);
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
.form__field select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: #f8fafc;
}

.form__checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
}

.form__error {
  margin: 0;
  color: #fecaca;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.danger-zone {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 0.75rem;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.danger-zone__content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.danger-zone__title {
  margin: 0;
  color: #fecaca;
  font-weight: 600;
}

.danger-zone__hint {
  margin: 0;
  font-size: 0.9rem;
}

.form__error--danger {
  color: #fca5a5;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}

.btn--danger {
  background: rgba(248, 113, 113, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.45);
  color: #fecdd3;
  box-shadow: 0 10px 18px rgba(248, 113, 113, 0.08);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.3);
  border-color: rgba(248, 113, 113, 0.55);
  transform: translateY(-1px);
  box-shadow: 0 16px 28px rgba(248, 113, 113, 0.18);
}

.btn--danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
