<template>
  <section class="landing">
    <div class="hero">
      <div class="hero__content">
        <h1>Raid ops, guild intel, and coordination — one place.</h1>
        <p class="hero__subtitle">
          {{ APP_NAME }} brings schedules, attendance, loot, quest tracking, live market tracking,
          and guild tools together so leadership can run the night without tab sprawl.
        </p>
        <div class="hero__actions">
          <a href="/api/auth/google" class="hero__cta">Get Started</a>
        </div>
      </div>
      <div class="hero__visual">
        <div class="hero__logo-frame">
          <img :src="APP_LOGO_PATH" :alt="APP_NAME" class="hero__logo" />
        </div>
      </div>
    </div>

    <div id="features" class="features">
      <article class="feature">
        <span class="feature__tag">OPS</span>
        <h2>Precision raid planning</h2>
        <p>
          Schedule targets, track status, and keep your raid team aligned with a collaborative
          dashboard.
        </p>
        <svg class="feature__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
        </svg>
      </article>
      <article class="feature">
        <span class="feature__tag">LOG</span>
        <h2>Instant attendance insights</h2>
        <p>
          Drop in EverQuest roster exports and let the platform reconcile attendance, loot, and
          mains automatically.
        </p>
        <svg class="feature__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
        </svg>
      </article>
      <article class="feature">
        <span class="feature__tag">CTRL</span>
        <h2>Guild-first permissions</h2>
        <p>
          Delegate leadership, empower officers, and keep your guild organized with rank-driven
          access controls.
        </p>
        <svg class="feature__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
        </svg>
      </article>
      <article class="feature">
        <span class="feature__tag">MKT</span>
        <h2>Live market tracking</h2>
        <p>
          Monitor bazaar prices, track sales trends, and spot deals in real time so your guild stays
          ahead of the economy.
        </p>
        <svg class="feature__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
      </article>
      <article class="feature">
        <span class="feature__tag">INTEL</span>
        <h2>Roster intelligence</h2>
        <p>
          Spotlight mains, track classes, and understand coverage at a glance so every raid launches
          with the right mix.
        </p>
        <svg class="feature__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </article>
    </div>

    <section class="cta">
      <h2>Bring every guild system into one place.</h2>
      <p>Log in with Google or Discord to get started.</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

import { APP_LOGO_PATH, APP_NAME } from '../constants/branding';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

let savedBodyBg = '';

onMounted(async () => {
  savedBodyBg = document.body.style.background;
  document.body.style.background = '#0b1120';

  if (!authStore.user) {
    await authStore.fetchCurrentUser();
  }

  if (authStore.isAuthenticated) {
    router.replace('/dashboard');
  }
});

onBeforeUnmount(() => {
  document.body.style.background = savedBodyBg;
});
</script>

<style scoped>
.landing {
  min-height: 100vh;
  margin: -2rem;
  padding: 2.5rem clamp(1.5rem, 5vw, 5rem) 3rem;
  display: flex;
  flex-direction: column;
  gap: clamp(3rem, 5vw, 4.5rem);
  color: #cbd5e1;
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, rgba(59, 130, 246, 0.06) 0%, transparent 70%),
    radial-gradient(circle at 80% 60%, rgba(99, 102, 241, 0.04) 0%, transparent 50%),
    radial-gradient(
        circle,
        rgba(148, 163, 184, 0.04) 1px,
        transparent 1px
      )
      0 0 / 24px 24px,
    #0b1120;
}

/* ---- Hero ---- */
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
  max-width: 64rem;
  margin: 0 auto;
  width: 100%;
}

.hero__content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.hero h1 {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  line-height: 1.15;
  margin: 0;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #f1f5f9 30%, #60a5fa 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero__subtitle {
  font-size: clamp(0.92rem, 1.5vw, 1.05rem);
  line-height: 1.7;
  color: #94a3b8;
  max-width: 34rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(59, 130, 246, 0.12);
}

.hero__actions {
  margin-top: 0.5rem;
}

.hero__cta {
  display: inline-flex;
  padding: 0.65rem 1.75rem;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: 6px;
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.25);
}

.hero__cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35);
}

.hero__visual {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero__logo-frame {
  width: clamp(180px, 20vw, 280px);
  padding: 1rem;
  border: 1px solid #1e293b;
  border-radius: 12px;
  background: #0f172a;
  box-shadow: 0 0 60px rgba(59, 130, 246, 0.08), 0 0 120px rgba(99, 102, 241, 0.04);
}

.hero__logo {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

/* ---- Features ---- */
.features {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(5, 1fr);
  border: 1px solid #1e293b;
  border-radius: 8px;
  overflow: hidden;
  background: #1e293b;
}

.feature {
  background: #0f172a;
  padding: 1.5rem 1.35rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.6rem;
  transition: background 0.2s;
}

.feature:hover {
  background: #111d33;
}

.feature:hover .feature__icon {
  opacity: 1;
}

.feature__icon {
  width: 28px;
  height: 28px;
  color: #3b82f6;
  opacity: 0.5;
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 0.5rem;
  transition: opacity 0.2s;
}

.feature__tag {
  display: inline-block;
  width: fit-content;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.2);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #60a5fa;
}

.feature h2 {
  margin: 0;
  font-size: 0.95rem;
  color: #e2e8f0;
  letter-spacing: -0.01em;
}

.feature p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: #64748b;
}

/* ---- CTA ---- */
.cta {
  max-width: 64rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.75rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.5));
  border: 1px solid #1e293b;
  border-radius: 8px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.cta h2 {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  color: #e2e8f0;
  position: relative;
}

.cta p {
  margin: 0.5rem 0 0;
  color: #94a3b8;
  font-size: 0.88rem;
  position: relative;
}

/* ---- Responsive ---- */
@media (max-width: 960px) {
  .hero {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .hero__content {
    align-items: center;
  }

  .hero__subtitle {
    max-width: 36rem;
  }

  .hero__visual {
    order: -1;
  }

  .hero__logo-frame {
    width: 200px;
  }

  .features {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .features {
    grid-template-columns: 1fr;
  }

  .hero__logo-frame {
    width: 160px;
  }
}
</style>
