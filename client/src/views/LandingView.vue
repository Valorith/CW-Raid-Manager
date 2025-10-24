<template>
  <section class="landing">
    <header class="landing-header">
      <div class="landing-brand">CW Raid Manager</div>
    </header>

    <div class="hero">
      <div class="hero__content">
        <p class="hero__eyebrow">EverQuest Raiding, Organized</p>
        <h1>Lead legendary raids with clarity and control.</h1>
        <p class="hero__subtitle">
          Orchestrate guilds, raid schedules, and attendance logs from a single command center. Built
          by raiders, for raid leaders.
        </p>
        <div class="hero__actions">
          <button class="btn btn--primary btn--large" @click="login">Start with Google</button>
        </div>
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
      <button class="btn btn--primary btn--large" @click="login">Get Started</button>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

function login() {
  window.location.href = '/api/auth/google';
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
  gap: 1.5rem;
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

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
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

.btn--large {
  padding: 0.85rem 1.9rem;
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

  .hero__actions {
    justify-content: center;
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
