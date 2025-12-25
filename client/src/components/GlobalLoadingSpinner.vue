<template>
  <Teleport to="body">
    <div class="global-loading-overlay">
      <div class="global-loading-spinner">
        <div class="global-loading-spinner__icon-wrapper">
          <div
            class="global-loading-spinner__icon"
            :style="{ backgroundImage: `url(${classIcon})` }"
          ></div>
        </div>
        <p class="global-loading-spinner__text">Loading...</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getRandomAnimatedClassIcon } from '../services/types';

const classIcon = ref(getRandomAnimatedClassIcon());

// Refresh the icon on each mount to get a new random class
onMounted(() => {
  classIcon.value = getRandomAnimatedClassIcon();
});
</script>

<style scoped>
.global-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 17, 32, 0.85);
  backdrop-filter: blur(4px);
}

.global-loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}

.global-loading-spinner__icon-wrapper {
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.global-loading-spinner__icon-wrapper::before {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(56, 189, 248, 0.2) 0%,
    rgba(56, 189, 248, 0.08) 50%,
    transparent 70%
  );
  animation: pulse-glow 2s ease-in-out infinite;
}

.global-loading-spinner__icon {
  width: 100%;
  height: 100%;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  filter: drop-shadow(0 0 16px rgba(188, 230, 255, 0.6));
}

.global-loading-spinner__text {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  animation: fade-pulse 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes fade-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
</style>
