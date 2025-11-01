<template>
  <div class="modal-backdrop" @click.self="emitCancel">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h2 class="modal__title">{{ title }}</h2>
          <p v-if="description" class="muted">{{ description }}</p>
        </div>
        <button class="icon-button" @click="emitCancel">✕</button>
      </header>

      <footer class="modal__actions">
        <button class="btn btn--outline" @click="emitCancel">
          {{ cancelLabel }}
        </button>
        <button
          v-if="secondaryConfirmLabel"
          class="btn btn--outline"
          @click="emitSecondaryConfirm"
        >
          {{ secondaryConfirmLabel }}
        </button>
        <button class="btn" @click="emitConfirm">
          {{ confirmLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel?: string;
    secondaryConfirmLabel?: string;
    cancelLabel?: string;
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    description: undefined,
    secondaryConfirmLabel: undefined
  }
);

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'secondary-confirm'): void;
  (e: 'cancel'): void;
}>();

function emitConfirm() {
  emit('confirm');
}

function emitSecondaryConfirm() {
  emit('secondary-confirm');
}

function emitCancel() {
  emit('cancel');
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
  z-index: 120;
}

.modal {
  width: min(420px, 100%);
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
  align-items: flex-start;
  gap: 1rem;
}

.modal__title {
  margin: 0;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.muted {
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
