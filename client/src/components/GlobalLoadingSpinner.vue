<template>
  <div class="global-loading-spinner">
    <div class="global-loading-spinner__icon-wrapper">
      <div
        class="global-loading-spinner__icon"
        :style="{ backgroundImage: `url(${classIcon})` }"
      ></div>
    </div>
    <p class="global-loading-spinner__text">Loading...</p>
  </div>
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
.global-loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 3rem 2rem;
  min-height: 200px;
}

.global-loading-spinner__icon-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.global-loading-spinner__icon-wrapper::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(56, 189, 248, 0.15) 0%,
    rgba(56, 189, 248, 0.05) 50%,
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
  filter: drop-shadow(0 0 12px rgba(188, 230, 255, 0.5));
}

.global-loading-spinner__text {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #94a3b8;
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
    transform: scale(1.05);
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
