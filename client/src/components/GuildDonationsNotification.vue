<template>
  <button
    v-if="store.currentGuildId && authStore.isAuthenticated && store.hasDonations"
    type="button"
    class="donation-notification"
    :class="{
      'donation-notification--active': true,
      'donation-notification--glow': store.hasPendingDonations
    }"
    :aria-label="ariaLabel"
    :title="tooltipText"
    @click="store.showModal"
  >
    <span class="donation-notification__badge" aria-hidden="true">
      <svg class="donation-notification__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <!-- Loot bag icon -->
        <path d="M9 3h6l2 4H7l2-4z" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 7h10v2c0 1-0.5 2-2 2.5V20a1 1 0 01-1 1h-4a1 1 0 01-1-1v-8.5C7.5 11 7 10 7 9V7z" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="14" r="1.5" fill="currentColor"/>
      </svg>
    </span>
    <span v-if="store.totalCount > 0" class="donation-notification__count">
      {{ displayCount }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGuildDonationsStore } from '../stores/guildDonations';
import { useAuthStore } from '../stores/auth';

const store = useGuildDonationsStore();
const authStore = useAuthStore();

const displayCount = computed(() => {
  if (store.totalCount > 99) return '99+';
  return store.totalCount.toString();
});

const tooltipText = computed(() => {
  const total = store.totalCount;
  const pending = store.pendingCount;
  if (pending > 0) {
    return `${pending} pending guild donation${pending !== 1 ? 's' : ''} (${total} total)`;
  }
  return `${total} guild donation${total !== 1 ? 's' : ''} (all processed)`;
});

const ariaLabel = computed(() => {
  const total = store.totalCount;
  return `${total} guild donation${total !== 1 ? 's' : ''}. Click to view.`;
});
</script>

<style scoped>
.donation-notification {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: radial-gradient(circle at 30% 30%, rgba(251, 191, 36, 0.15), rgba(15, 23, 42, 0.85));
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.35);
}

.donation-notification:hover,
.donation-notification:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.45);
  border-color: rgba(251, 191, 36, 0.6);
  outline: none;
}

.donation-notification--active {
  border-color: rgba(251, 191, 36, 0.5);
  background: radial-gradient(circle at 30% 30%, rgba(251, 191, 36, 0.25), rgba(15, 23, 42, 0.85));
}

/* Subtle glow effect when there are pending donations */
.donation-notification--glow {
  box-shadow:
    0 6px 14px rgba(15, 23, 42, 0.35),
    0 0 20px rgba(251, 191, 36, 0.25),
    0 0 40px rgba(251, 191, 36, 0.1);
  animation: donationGlow 3s ease-in-out infinite;
}

.donation-notification--glow::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.3), transparent 70%);
  opacity: 0;
  animation: donationPulse 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes donationGlow {
  0%, 100% {
    box-shadow:
      0 6px 14px rgba(15, 23, 42, 0.35),
      0 0 15px rgba(251, 191, 36, 0.2),
      0 0 30px rgba(251, 191, 36, 0.08);
  }
  50% {
    box-shadow:
      0 6px 14px rgba(15, 23, 42, 0.35),
      0 0 25px rgba(251, 191, 36, 0.35),
      0 0 50px rgba(251, 191, 36, 0.15);
  }
}

@keyframes donationPulse {
  0%, 100% {
    opacity: 0;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.15);
  }
}

.donation-notification__badge {
  display: flex;
  align-items: center;
  justify-content: center;
}

.donation-notification__icon {
  width: 20px;
  height: 20px;
  transition: color 0.2s ease;
}

.donation-notification--active .donation-notification__icon {
  color: #fbbf24;
}

.donation-notification__count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #0f172a;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(251, 191, 36, 0.4);
  border: 2px solid rgba(15, 23, 42, 0.9);
}
</style>
