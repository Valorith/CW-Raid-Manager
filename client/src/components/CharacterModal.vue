<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">
      <header class="modal__header">
        <h2>Add Character</h2>
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
          <input v-model="form.isMain" type="checkbox" />
          <span>Main character</span>
        </label>

        <footer class="form__actions">
          <button class="btn btn--outline" type="button" @click="close">Cancel</button>
          <button class="btn" type="submit" :disabled="submitting">
            {{ submitting ? 'Saving…' : 'Save Character' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';

import type { GuildSummary } from '../services/api';
import type { CharacterClass } from '../services/types';
import { api } from '../services/api';

const props = defineProps<{
  guilds: GuildSummary[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created'): void;
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
  name: '',
  level: 60,
  class: '' as CharacterClass | '',
  guildId: '',
  isMain: true
});

const submitting = ref(false);

function close() {
  emit('close');
}

async function submit() {
  submitting.value = true;
  try {
    await api.createCharacter({
      name: form.name,
      level: form.level,
      class: form.class as CharacterClass,
      guildId: form.guildId || undefined,
      isMain: form.isMain
    });
    emit('created');
  } finally {
    submitting.value = false;
  }
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

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
}
</style>
