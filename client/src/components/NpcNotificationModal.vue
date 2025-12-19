<template>
  <Teleport to="body">
    <div v-if="notifications.length > 0" class="npc-notification-overlay">
      <div class="npc-notification-modal">
        <header class="notification-header">
          <div class="notification-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <h2>NPC Respawn Alert</h2>
          <span class="notification-count" v-if="notifications.length > 1">
            {{ notifications.length }} alerts
          </span>
        </header>

        <div class="notification-list">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            :class="['notification-item', `notification-item--${notification.status}`]"
          >
            <div class="notification-status">
              <span :class="['status-indicator', `status-indicator--${notification.status}`]"></span>
              <span class="status-text">{{ getStatusText(notification.status) }}</span>
            </div>

            <div class="notification-content">
              <h3 class="npc-name">
                {{ notification.npcName }}
                <span
                  v-if="notification.hasInstanceVersion"
                  :class="['variant-tag', notification.isInstanceVariant ? 'variant-tag--instance' : 'variant-tag--overworld']"
                >
                  {{ notification.isInstanceVariant ? 'Instance' : 'Overworld' }}
                </span>
              </h3>
              <p class="zone-name" v-if="notification.zoneName">{{ notification.zoneName }}</p>
            </div>

            <div class="notification-timer" v-if="notification.status === 'window'">
              <span class="timer-label">Window closes in:</span>
              <span class="timer-value">{{ formatTimeRemaining(notification.respawnMaxTime) }}</span>
            </div>
            <div class="notification-timer notification-timer--up" v-else-if="notification.status === 'up'">
              <span class="timer-label">Should be spawned!</span>
            </div>
          </div>
        </div>

        <footer class="notification-footer">
          <button class="btn btn--dismiss" @click="dismissAll">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 9l6 6m0-6l-6 6" />
            </svg>
            Dismiss All
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue';
import { startNpcAlarm, stopNpcAlarm } from '../utils/npcAlarm';

export interface NpcNotification {
  id: string;
  npcName: string;
  zoneName: string | null;
  status: 'window' | 'up';
  respawnMaxTime: string | null;
  hasInstanceVersion: boolean;
  isInstanceVariant: boolean;
}

const props = defineProps<{
  notifications: NpcNotification[];
}>();

const emit = defineEmits<{
  (e: 'dismiss', ids: string[]): void;
}>();

// Start/stop alarm based on notifications
watch(
  () => props.notifications.length,
  (newLength, oldLength) => {
    if (newLength > 0 && (oldLength === 0 || oldLength === undefined)) {
      startNpcAlarm();
    } else if (newLength === 0 && oldLength > 0) {
      stopNpcAlarm();
    }
  },
  { immediate: true }
);

// Clean up alarm when component unmounts
onUnmounted(() => {
  stopNpcAlarm();
});

function getStatusText(status: 'window' | 'up'): string {
  return status === 'window' ? 'Spawn Window Open' : 'Spawned';
}

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return '--';
  const target = Date.parse(isoString);
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return 'Now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function dismissAll() {
  stopNpcAlarm();
  emit('dismiss', props.notifications.map(n => n.id));
}
</script>

<style scoped>
.npc-notification-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.npc-notification-modal {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border: 2px solid rgba(250, 204, 21, 0.5);
  border-radius: 1rem;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 40px rgba(250, 204, 21, 0.3),
    0 25px 50px rgba(0, 0, 0, 0.5);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(250, 204, 21, 0.2);
  background: rgba(250, 204, 21, 0.1);
}

.notification-header-icon {
  width: 32px;
  height: 32px;
  color: #fbbf24;
  animation: ring 1s ease-in-out infinite;
}

@keyframes ring {
  0%, 100% {
    transform: rotate(0deg);
  }
  10%, 30% {
    transform: rotate(-10deg);
  }
  20%, 40% {
    transform: rotate(10deg);
  }
  50% {
    transform: rotate(0deg);
  }
}

.notification-header-icon svg {
  width: 100%;
  height: 100%;
}

.notification-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fbbf24;
  flex: 1;
}

.notification-count {
  background: rgba(250, 204, 21, 0.2);
  color: #fbbf24;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
}

.notification-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notification-item {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notification-item--window {
  border-color: rgba(250, 204, 21, 0.4);
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.08), rgba(30, 41, 59, 0.8));
}

.notification-item--up {
  border-color: rgba(34, 197, 94, 0.4);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(30, 41, 59, 0.8));
}

.notification-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator--window {
  background: #fbbf24;
  box-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
}

.status-indicator--up {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.status-text {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.notification-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.npc-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.variant-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.variant-tag--overworld {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.variant-tag--instance {
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  color: #c4b5fd;
}

.zone-name {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.notification-timer {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.75rem;
  background: rgba(250, 204, 21, 0.1);
  border-radius: 0.5rem;
  margin-top: 0.25rem;
}

.notification-timer--up {
  background: rgba(34, 197, 94, 0.1);
}

.timer-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.timer-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fbbf24;
  font-variant-numeric: tabular-nums;
}

.notification-timer--up .timer-label {
  font-size: 0.85rem;
  color: #86efac;
  font-weight: 600;
}

.notification-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  justify-content: center;
}

.btn--dismiss {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 0.5rem;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn--dismiss:hover {
  background: linear-gradient(135deg, #f87171, #ef4444);
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);
  transform: translateY(-1px);
}

.btn--dismiss:active {
  transform: translateY(0);
}

.btn--dismiss svg {
  width: 18px;
  height: 18px;
}
</style>
