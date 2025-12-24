<template>
  <Teleport to="body">
    <div v-if="isOpen" class="progress-modal-backdrop">
      <div class="progress-modal">
        <header class="progress-modal__header">
          <h3>Auto-Link Shared IPs</h3>
          <button
            v-if="isComplete"
            class="progress-modal__close"
            @click="$emit('close')"
          >&times;</button>
        </header>

        <div class="progress-modal__body">
          <!-- Status Icon -->
          <div class="progress-modal__status-icon" :class="statusClass">
            <svg v-if="isComplete && !hasError" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <svg v-else-if="hasError" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div v-else class="spinner"></div>
          </div>

          <!-- Current Phase -->
          <div class="progress-modal__phase">{{ currentPhase }}</div>

          <!-- Progress Bar -->
          <div class="progress-modal__bar-container">
            <div class="progress-modal__bar">
              <div
                class="progress-modal__bar-fill"
                :style="{ width: `${progressPercent}%` }"
                :class="{ 'progress-modal__bar-fill--complete': isComplete && !hasError }"
              ></div>
            </div>
            <div class="progress-modal__bar-label">
              {{ progressPercent }}%
            </div>
          </div>

          <!-- Stats -->
          <div class="progress-modal__stats">
            <div class="progress-modal__stat">
              <span class="progress-modal__stat-value">{{ stats.sharedIpsFound }}</span>
              <span class="progress-modal__stat-label">Shared IPs</span>
            </div>
            <div class="progress-modal__stat">
              <span class="progress-modal__stat-value">{{ stats.ipsProcessed }}</span>
              <span class="progress-modal__stat-label">Processed</span>
            </div>
            <div class="progress-modal__stat progress-modal__stat--success">
              <span class="progress-modal__stat-value">{{ stats.created }}</span>
              <span class="progress-modal__stat-label">Created</span>
            </div>
            <div class="progress-modal__stat">
              <span class="progress-modal__stat-value">{{ stats.skipped }}</span>
              <span class="progress-modal__stat-label">Skipped</span>
            </div>
          </div>

          <!-- Log Messages -->
          <div class="progress-modal__log" ref="logContainer">
            <div
              v-for="(msg, idx) in messages"
              :key="idx"
              class="progress-modal__log-entry"
              :class="`progress-modal__log-entry--${msg.type}`"
            >
              <span class="progress-modal__log-time">{{ msg.time }}</span>
              <span class="progress-modal__log-text">{{ msg.text }}</span>
            </div>
          </div>
        </div>

        <footer class="progress-modal__actions">
          <button
            class="btn btn--primary"
            :disabled="!isComplete"
            @click="$emit('close')"
          >
            {{ isComplete ? 'Close' : 'Processing...' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

interface ProgressMessage {
  type: 'info' | 'success' | 'error' | 'progress';
  text: string;
  time: string;
}

interface ProgressStats {
  sharedIpsFound: number;
  ipsProcessed: number;
  created: number;
  skipped: number;
}

const props = defineProps<{
  isOpen: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const currentPhase = ref('Initializing...');
const progressPercent = ref(0);
const isComplete = ref(false);
const hasError = ref(false);
const messages = ref<ProgressMessage[]>([]);
const logContainer = ref<HTMLElement | null>(null);
const eventSource = ref<EventSource | null>(null);

const stats = ref<ProgressStats>({
  sharedIpsFound: 0,
  ipsProcessed: 0,
  created: 0,
  skipped: 0
});

const statusClass = computed(() => ({
  'progress-modal__status-icon--success': isComplete.value && !hasError.value,
  'progress-modal__status-icon--error': hasError.value,
  'progress-modal__status-icon--loading': !isComplete.value
}));

function addMessage(type: ProgressMessage['type'], text: string) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  messages.value.push({ type, text, time });

  // Auto-scroll to bottom
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

function startAutoLink() {
  // Reset state
  currentPhase.value = 'Connecting...';
  progressPercent.value = 0;
  isComplete.value = false;
  hasError.value = false;
  messages.value = [];
  stats.value = { sharedIpsFound: 0, ipsProcessed: 0, created: 0, skipped: 0 };

  addMessage('info', 'Starting auto-link process...');

  // Create SSE connection
  eventSource.value = new EventSource('/api/admin/auto-link-shared-ips-stream');

  eventSource.value.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleProgressUpdate(data);
    } catch (err) {
      console.error('Failed to parse SSE message:', err);
    }
  };

  eventSource.value.onerror = () => {
    if (!isComplete.value) {
      hasError.value = true;
      currentPhase.value = 'Connection lost';
      addMessage('error', 'Connection to server lost.');
      isComplete.value = true;
    }
    eventSource.value?.close();
  };
}

function handleProgressUpdate(data: {
  type: string;
  phase?: string;
  progress?: number;
  message?: string;
  stats?: ProgressStats;
  error?: string;
}) {
  switch (data.type) {
    case 'phase':
      currentPhase.value = data.phase || '';
      addMessage('info', data.phase || '');
      break;

    case 'progress':
      if (data.progress !== undefined) {
        progressPercent.value = Math.round(data.progress);
      }
      if (data.stats) {
        stats.value = data.stats;
      }
      if (data.message) {
        addMessage('progress', data.message);
      }
      break;

    case 'complete':
      isComplete.value = true;
      progressPercent.value = 100;
      currentPhase.value = 'Complete';
      if (data.stats) {
        stats.value = data.stats;
      }
      addMessage('success', `Completed! Created ${stats.value.created} associations, skipped ${stats.value.skipped}.`);
      eventSource.value?.close();
      break;

    case 'error':
      hasError.value = true;
      isComplete.value = true;
      currentPhase.value = 'Error';
      addMessage('error', data.error || 'Unknown error occurred.');
      eventSource.value?.close();
      break;
  }
}

// Start when modal opens
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    startAutoLink();
  } else {
    eventSource.value?.close();
  }
});

// Cleanup on unmount
import { onUnmounted } from 'vue';
onUnmounted(() => {
  eventSource.value?.close();
});
</script>

<style scoped>
.progress-modal-backdrop {
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

.progress-modal {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 1rem;
  width: 100%;
  max-width: 550px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.1);
}

.progress-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.progress-modal__header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #93c5fd;
}

.progress-modal__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.progress-modal__close:hover {
  color: #f8fafc;
}

.progress-modal__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.progress-modal__status-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-modal__status-icon svg {
  width: 100%;
  height: 100%;
}

.progress-modal__status-icon--success {
  color: #22c55e;
}

.progress-modal__status-icon--error {
  color: #ef4444;
}

.progress-modal__status-icon--loading {
  color: #3b82f6;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-modal__phase {
  font-size: 1rem;
  color: #e2e8f0;
  font-weight: 500;
}

.progress-modal__bar-container {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.progress-modal__bar {
  flex: 1;
  height: 8px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 4px;
  overflow: hidden;
}

.progress-modal__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-modal__bar-fill--complete {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.progress-modal__bar-label {
  font-size: 0.85rem;
  color: #94a3b8;
  min-width: 3rem;
  text-align: right;
}

.progress-modal__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.progress-modal__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.progress-modal__stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #e2e8f0;
}

.progress-modal__stat--success .progress-modal__stat-value {
  color: #4ade80;
}

.progress-modal__stat-label {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.progress-modal__log {
  width: 100%;
  max-height: 150px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-family: monospace;
  font-size: 0.75rem;
}

.progress-modal__log-entry {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
}

.progress-modal__log-entry:last-child {
  border-bottom: none;
}

.progress-modal__log-time {
  color: #64748b;
  flex-shrink: 0;
}

.progress-modal__log-text {
  color: #94a3b8;
}

.progress-modal__log-entry--info .progress-modal__log-text {
  color: #93c5fd;
}

.progress-modal__log-entry--success .progress-modal__log-text {
  color: #4ade80;
}

.progress-modal__log-entry--error .progress-modal__log-text {
  color: #f87171;
}

.progress-modal__log-entry--progress .progress-modal__log-text {
  color: #94a3b8;
}

.progress-modal__actions {
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
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);
}
</style>
