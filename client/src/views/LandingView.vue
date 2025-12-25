<template>
  <section class="landing">
    <header class="landing-header">
      <div class="landing-brand">CW Raid Manager</div>
      <div class="header-actions">
        <button class="btn btn--google btn--small" @click="loginGoogle">
          <svg class="btn__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>
        <button class="btn btn--discord btn--small" @click="loginDiscord">
          <svg class="btn__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
          </svg>
          Discord
        </button>
      </div>
    </header>

    <div class="hero">
      <div class="hero__content">
        <p class="hero__eyebrow">EverQuest Raiding, Organized</p>
        <h1>Lead legendary raids with clarity and control.</h1>
        <p class="hero__subtitle">
          Orchestrate guilds, raid schedules, and attendance logs from a single command center. Built
          by raiders, for raid leaders.
        </p>
      </div>
      <div class="hero__visual">
        <div class="orb orb--one"></div>
        <div class="orb orb--two"></div>
        <div class="stat-card">
          <span class="stat-card__label">Attendance handled</span>
          <strong class="stat-card__value">Import, review, approve.</strong>
          <span class="stat-card__meta">Upload your roster export and the rest is automated.</span>
        </div>
        <div class="stat-card stat-card--secondary">
          <span class="stat-card__label">Guild ready</span>
          <strong class="stat-card__value">Leaders stay in control.</strong>
          <span class="stat-card__meta">Role-based permissions keep officers focused and organized.</span>
        </div>
      </div>
    </div>

    <div id="features" class="features">
      <article class="feature">
        <div class="feature__icon">🎯</div>
        <h2>Precision raid planning</h2>
        <p>
          Schedule targets, track status, and keep your raid team aligned with a collaborative raid
          dashboard.
        </p>
      </article>
      <article class="feature">
        <div class="feature__icon">📥</div>
        <h2>Instant attendance insights</h2>
        <p>
          Drop in EverQuest roster exports and let the manager reconcile attendance, loot, and mains
          automatically.
        </p>
      </article>
      <article class="feature">
        <div class="feature__icon">🛡️</div>
        <h2>Guild-first permissions</h2>
        <p>
          Delegate leadership, empower officers, and keep your guild organized with rank-driven
          access controls.
        </p>
      </article>
      <article class="feature">
        <div class="feature__icon">📊</div>
        <h2>Roster intelligence</h2>
        <p>
          Spotlight mains, track classes, and understand coverage at a glance so every raid launches
          with the right mix.
        </p>
      </article>
    </div>

    <section class="cta">
      <div class="cta__content">
        <h2>Be ready for the next pull.</h2>
        <p>Spin up your guild workspace in minutes and bring calm to every raid night.</p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

function loginGoogle() {
  window.location.href = '/api/auth/google';
}

function loginDiscord() {
  window.location.href = '/api/auth/discord';
}

onMounted(async () => {
  if (!authStore.user) {
    await authStore.fetchCurrentUser();
  }

  if (authStore.isAuthenticated) {
    router.replace('/dashboard');
  }
});
</script>

<style scoped>
.landing {
  min-height: 100vh;
  padding: 3rem clamp(2rem, 6vw, 6rem) 4rem;
  display: flex;
  flex-direction: column;
  gap: clamp(3rem, 5vw, 5rem);
  color: #e2e8f0;
  background: radial-gradient(circle at top left, rgba(99, 102, 241, 0.18), transparent 55%),
    radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.15), transparent 45%),
    #0b1220;
}

.landing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.landing-brand {
  font-size: clamp(1.25rem, 2vw, 1.5rem);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 700;
  color: rgba(224, 231, 255, 0.9);
}

.hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(2.5rem, 6vw, 5rem);
  align-items: center;
}

.hero__content {
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 3vw, 1.75rem);
  text-align: left;
}

.hero__eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: rgba(190, 242, 100, 0.85);
}

.hero h1 {
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  line-height: 1.1;
  margin: 0;
  color: #f8fafc;
}

.hero__subtitle {
  font-size: clamp(1rem, 2vw, 1.15rem);
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.8);
  max-width: 32rem;
}

.btn {
  border: none;
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 1rem;
  transition: transform 0.15s ease, box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.btn--small {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
}

.btn--primary {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(99, 102, 241, 0.88));
  color: #0b1120;
  box-shadow: 0 16px 32px rgba(14, 165, 233, 0.25);
}

.btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 38px rgba(14, 165, 233, 0.35);
}

.btn--google {
  background: #ffffff;
  color: #1f2937;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn--google:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  background: #f8fafc;
}

.btn--discord {
  background: #5865F2;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(88, 101, 242, 0.35);
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn--discord:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(88, 101, 242, 0.45);
  background: #4752c4;
}

.btn__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.btn--ghost {
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: rgba(226, 232, 240, 0.85);
  background: rgba(15, 23, 42, 0.4);
}

.btn--ghost:hover {
  border-color: rgba(191, 219, 254, 0.6);
  color: #f8fafc;
  transform: translateY(-2px);
  box-shadow: 0 16px 28px rgba(59, 130, 246, 0.2);
}

.hero__visual {
  position: relative;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(0px);
  opacity: 0.75;
}

.orb--one {
  width: clamp(220px, 18vw, 280px);
  height: clamp(220px, 18vw, 280px);
  background: radial-gradient(circle, rgba(14, 165, 233, 0.35), transparent 65%);
  top: 8%;
  left: 10%;
}

.orb--two {
  width: clamp(260px, 22vw, 320px);
  height: clamp(260px, 22vw, 320px);
  background: radial-gradient(circle, rgba(99, 102, 241, 0.32), transparent 60%);
  bottom: 6%;
  right: 8%;
}

.stat-card {
  position: relative;
  z-index: 1;
  padding: 1.25rem 1.5rem;
  border-radius: 1.1rem;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 14px 38px rgba(8, 12, 20, 0.55);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 15rem;
}

.stat-card--secondary {
  margin-top: 2rem;
}

.stat-card__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(224, 231, 255, 0.75);
}

.stat-card__value {
  font-size: 1.9rem;
  font-weight: 700;
  color: #f8fafc;
}

.stat-card__meta {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
}

.features {
  width: 100%;
  display: grid;
  gap: clamp(1.5rem, 4vw, 2.5rem);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.feature {
  background: linear-gradient(160deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.75));
  border-radius: 1.25rem;
  padding: 2rem 1.75rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: left;
  box-shadow: 0 18px 36px rgba(8, 12, 20, 0.45);
}

.feature__icon {
  font-size: 2rem;
}

.feature h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #f8fafc;
}

.feature p {
  margin: 0;
  line-height: 1.7;
  color: rgba(209, 213, 219, 0.85);
}

.cta {
  margin-top: clamp(2.5rem, 6vw, 4rem);
  padding: clamp(1.75rem, 4vw, 2.5rem) clamp(2rem, 5vw, 3rem);
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.18), rgba(14, 116, 144, 0.12));
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  flex-wrap: wrap;
}

.cta__content {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cta__content h2 {
  margin: 0;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: #f8fafc;
}

.cta__content p {
  margin: 0;
  color: rgba(226, 232, 240, 0.8);
  font-size: 1rem;
}

@media (max-width: 960px) {
  .landing {
    padding: 2.5rem clamp(1.5rem, 6vw, 2.5rem) 3.5rem;
  }

  .hero {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .hero__content,
  .cta__content {
    text-align: center;
    align-items: center;
  }

  .hero__visual {
    min-height: 260px;
  }
}

@media (max-width: 640px) {
  .landing-header {
    flex-direction: column;
    align-items: center;
  }

  .landing {
    gap: 3rem;
  }

  .feature {
    text-align: center;
    align-items: center;
  }
}
</style>
