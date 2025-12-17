<template>
  <Teleport to="body">
    <div v-if="state.isOpen" class="error-modal-backdrop" @click.self="closeError">
      <div class="error-modal">
        <header class="error-modal__header">
          <h3>{{ state.title }}</h3>
          <button class="error-modal__close" @click="closeError">&times;</button>
        </header>
        <div class="error-modal__body">
          <div class="error-modal__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div class="error-modal__message">{{ state.message }}</div>
        </div>
        <footer class="error-modal__actions">
          <button class="btn btn--outline" @click="handleCopy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {{ copyButtonText }}
          </button>
          <button class="btn btn--primary" @click="closeError">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useErrorModal } from '../composables/useErrorModal';

const { state, closeError, copyErrorToClipboard } = useErrorModal();

const copyButtonText = ref('Copy Error');

async function handleCopy() {
  const success = await copyErrorToClipboard();
  if (success) {
    copyButtonText.value = 'Copied!';
    setTimeout(() => {
      copyButtonText.value = 'Copy Error';
    }, 2000);
  }
}
</script>

<style scoped>
.error-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.error-modal {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 1rem;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(239, 68, 68, 0.1);
}

.error-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}

.error-modal__header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fca5a5;
}

.error-modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.error-modal__close:hover {
  color: #f8fafc;
}

.error-modal__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.error-modal__icon {
  width: 48px;
  height: 48px;
  color: #ef4444;
}

.error-modal__icon svg {
  width: 100%;
  height: 100%;
}

.error-modal__message {
  text-align: center;
  color: #e2e8f0;
  font-size: 0.95rem;
  line-height: 1.5;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
}

.error-modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.btn--primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #fff;
}

.btn--primary:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);
}

.btn--outline {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
}

.btn--outline:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.5);
}
</style>
