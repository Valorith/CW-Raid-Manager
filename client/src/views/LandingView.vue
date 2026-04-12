<template>
  <section class="landing" ref="landingRef">
    <!-- Ambient particles -->
    <div class="ambient">
      <div class="ambient__ember" v-for="n in 12" :key="n" :style="emberStyle(n)" />
    </div>

    <!-- Nav bar -->
    <nav class="topbar" :class="{ 'topbar--visible': navVisible }">
      <div class="topbar__inner">
        <div class="topbar__brand">
          <img :src="APP_LOGO_PATH" :alt="APP_NAME" class="topbar__logo" />
          <span class="topbar__name">{{ APP_NAME }}</span>
        </div>
        <a href="/api/auth/google" class="topbar__login">Sign In</a>
      </div>
    </nav>

    <!-- Hero -->
    <header class="hero">
      <div class="hero__badge">GUILD COMMAND CENTER</div>
      <h1 class="hero__title">
        <span class="hero__line hero__line--1">Every Raid.</span>
        <span class="hero__line hero__line--2">Every Role.</span>
        <span class="hero__line hero__line--3">One Nexus.</span>
      </h1>
      <p class="hero__sub">
        {{ APP_NAME }} unifies raid planning, attendance, loot, market intel, and guild
        management into a single command post — so leadership runs the night, not a dozen tabs.
      </p>
      <div class="hero__actions">
        <a href="/api/auth/google" class="btn btn--primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Enter the Nexus
        </a>
        <a href="#features" class="btn btn--ghost">See Features</a>
      </div>
      <div class="hero__visual">
        <div class="hero__logo-frame">
          <img :src="APP_LOGO_PATH" :alt="APP_NAME" class="hero__logo" />
        </div>
        <div class="hero__glow" />
      </div>
    </header>

    <!-- Divider rune -->
    <div class="rune-divider">
      <svg width="200" height="20" viewBox="0 0 200 20">
        <line x1="0" y1="10" x2="80" y2="10" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        <polygon points="100,2 108,10 100,18 92,10" fill="currentColor" opacity="0.5"/>
        <line x1="120" y1="10" x2="200" y2="10" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      </svg>
    </div>

    <!-- Features -->
    <section id="features" class="features">
      <h2 class="features__heading">Forged for Guild Leaders</h2>
      <div class="features__grid">
        <article
          v-for="(feat, i) in features"
          :key="feat.tag"
          class="card"
          :style="{ '--delay': i * 0.08 + 's' }"
        >
          <div class="card__icon" v-html="feat.icon" />
          <span class="card__tag">{{ feat.tag }}</span>
          <h3 class="card__title">{{ feat.title }}</h3>
          <p class="card__desc">{{ feat.desc }}</p>
          <div class="card__shine" />
        </article>
      </div>
    </section>

    <!-- Divider -->
    <div class="rune-divider">
      <svg width="200" height="20" viewBox="0 0 200 20">
        <line x1="0" y1="10" x2="80" y2="10" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        <polygon points="100,2 108,10 100,18 92,10" fill="currentColor" opacity="0.5"/>
        <line x1="120" y1="10" x2="200" y2="10" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      </svg>
    </div>

    <!-- CTA -->
    <section class="cta">
      <h2 class="cta__title">Your guild deserves better than spreadsheets.</h2>
      <p class="cta__sub">Sign in with Google or Discord. Free to use. Built by raiders, for raiders.</p>
      <a href="/api/auth/google" class="btn btn--primary btn--lg">
        Get Started
      </a>
    </section>

    <!-- Footer -->
    <footer class="foot">
      <span>{{ APP_NAME }} &copy; {{ new Date().getFullYear() }}</span>
      <span class="foot__dot">&middot;</span>
      <span class="foot__tagline">{{ APP_TAGLINE }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from '../constants/branding';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const landingRef = ref<HTMLElement | null>(null);
const navVisible = ref(false);

let savedBodyBg = '';

const features = [
  {
    tag: 'OPS',
    title: 'Raid Planning',
    desc: 'Schedule targets, coordinate strategy, and keep every raider aligned through a shared tactical board.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  },
  {
    tag: 'LOG',
    title: 'Attendance Tracking',
    desc: 'Import EverQuest roster dumps and let the system reconcile attendance, alts, and mains automatically.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
  },
  {
    tag: 'CTRL',
    title: 'Role Permissions',
    desc: 'Delegate power to officers and raid leaders with rank-driven access that mirrors your guild hierarchy.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  },
  {
    tag: 'MKT',
    title: 'Market Intel',
    desc: 'Track bazaar prices, spot trends, and monitor sales so your guild stays ahead of the server economy.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  },
  {
    tag: 'INTEL',
    title: 'Roster Analysis',
    desc: 'Understand class coverage, spotlight mains, and ensure every raid launches with the right composition.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  },
];

function emberStyle(n: number) {
  const left = ((n * 17 + 7) % 100);
  const delay = ((n * 1.3) % 5).toFixed(1);
  const dur = (4 + (n % 4) * 1.5).toFixed(1);
  const size = 2 + (n % 3);
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

function handleScroll() {
  navVisible.value = window.scrollY > 80;
}

onMounted(async () => {
  savedBodyBg = document.body.style.background;
  document.body.style.background = '#08080d';
  window.addEventListener('scroll', handleScroll, { passive: true });

  if (!authStore.user) {
    await authStore.fetchCurrentUser();
  }
  if (authStore.isAuthenticated) {
    router.replace('/dashboard');
  }
});

onBeforeUnmount(() => {
  document.body.style.background = savedBodyBg;
  window.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Outfit:wght@300;400;500;600&display=swap');

/* ═══════ Tokens ═══════ */
:root {
  --gold: #d4a044;
  --gold-light: #f0c864;
  --gold-dim: #9a7430;
  --bg-deep: #08080d;
  --bg-card: #0e0e16;
  --bg-card-hover: #141420;
  --border: #1a1a28;
  --text: #c8c4b8;
  --text-dim: #7a7768;
  --text-bright: #eae6da;
}

/* ═══════ Base ═══════ */
.landing {
  --gold: #d4a044;
  --gold-light: #f0c864;
  --gold-dim: #9a7430;
  --bg-deep: #08080d;
  --bg-card: #0e0e16;
  --bg-card-hover: #141420;
  --border: #1a1a28;
  --text: #c8c4b8;
  --text-dim: #7a7768;
  --text-bright: #eae6da;

  position: relative;
  min-height: 100vh;
  margin: -2rem;
  padding: 0 clamp(1.5rem, 5vw, 6rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  color: var(--text);
  font-family: 'Outfit', sans-serif;
  background:
    radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212, 160, 68, 0.04) 0%, transparent 60%),
    radial-gradient(circle at 20% 80%, rgba(212, 160, 68, 0.02) 0%, transparent 40%),
    var(--bg-deep);
  overflow-x: hidden;
}

/* ═══════ Ambient embers ═══════ */
.ambient {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.ambient__ember {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: var(--gold);
  opacity: 0;
  animation: ember-rise linear infinite;
}

@keyframes ember-rise {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: 0.4;
  }
  80% {
    opacity: 0.15;
  }
  100% {
    transform: translateY(-100vh) scale(0.3);
    opacity: 0;
  }
}

/* ═══════ Top bar ═══════ */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0 clamp(1.5rem, 5vw, 6rem);
  background: rgba(8, 8, 13, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  transform: translateY(-100%);
  transition: transform 0.3s ease, border-color 0.3s ease;
}

.topbar--visible {
  transform: translateY(0);
  border-bottom-color: var(--border);
}

.topbar__inner {
  max-width: 72rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.topbar__logo {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.topbar__name {
  font-family: 'Cinzel', serif;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--gold);
  letter-spacing: 0.05em;
}

.topbar__login {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--gold);
  text-decoration: none;
  padding: 0.4rem 1rem;
  border: 1px solid var(--gold-dim);
  border-radius: 4px;
  transition: background 0.2s, color 0.2s;
}

.topbar__login:hover {
  background: var(--gold);
  color: #08080d;
}

/* ═══════ Hero ═══════ */
.hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 54rem;
  padding: clamp(5rem, 12vh, 9rem) 0 clamp(3rem, 6vh, 5rem);
  gap: 1.5rem;
}

.hero__badge {
  font-family: 'Outfit', sans-serif;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--gold);
  padding: 0.35rem 1rem;
  border: 1px solid rgba(212, 160, 68, 0.25);
  border-radius: 20px;
  background: rgba(212, 160, 68, 0.06);
  animation: fade-in 0.6s ease both;
}

.hero__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: clamp(2.4rem, 6vw, 4.2rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  display: flex;
  flex-direction: column;
}

.hero__line {
  display: block;
  background: linear-gradient(170deg, var(--text-bright) 20%, var(--gold) 80%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero__line--1 { animation: slide-up 0.7s ease both 0.15s; }
.hero__line--2 { animation: slide-up 0.7s ease both 0.3s; }
.hero__line--3 { animation: slide-up 0.7s ease both 0.45s; }

.hero__sub {
  max-width: 38rem;
  font-size: clamp(0.92rem, 1.4vw, 1.05rem);
  line-height: 1.75;
  color: var(--text-dim);
  animation: fade-in 0.8s ease both 0.6s;
}

.hero__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  animation: fade-in 0.8s ease both 0.8s;
}

.hero__visual {
  position: relative;
  margin-top: 1rem;
  animation: fade-in 1s ease both 0.5s;
}

.hero__logo-frame {
  width: clamp(140px, 18vw, 220px);
  padding: 0.75rem;
  border: 1px solid rgba(212, 160, 68, 0.2);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(14, 14, 22, 0.9), rgba(20, 20, 32, 0.6));
  position: relative;
  z-index: 1;
}

.hero__logo {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.hero__glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 300px;
  height: 300px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 160, 68, 0.1) 0%, transparent 60%);
  pointer-events: none;
  animation: pulse-glow 4s ease-in-out infinite;
}

/* ═══════ Buttons ═══════ */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.6rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  border-radius: 6px;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
  cursor: pointer;
}

.btn--primary {
  background: linear-gradient(135deg, var(--gold), #b8862e);
  color: #0a0a0f;
  box-shadow: 0 2px 16px rgba(212, 160, 68, 0.2);
}

.btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(212, 160, 68, 0.3);
}

.btn--ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}

.btn--ghost:hover {
  border-color: var(--gold-dim);
  color: var(--gold-light);
}

.btn--lg {
  padding: 0.85rem 2.2rem;
  font-size: 0.95rem;
}

/* ═══════ Rune divider ═══════ */
.rune-divider {
  color: var(--gold);
  padding: clamp(1.5rem, 3vh, 2.5rem) 0;
  z-index: 1;
}

/* ═══════ Features ═══════ */
.features {
  z-index: 1;
  max-width: 72rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 1rem 0 2rem;
}

.features__heading {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: clamp(1.2rem, 2.5vw, 1.7rem);
  font-weight: 600;
  color: var(--text-bright);
  letter-spacing: 0.02em;
  text-align: center;
}

.features__grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  width: 100%;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.card {
  position: relative;
  background: var(--bg-card);
  padding: 1.75rem 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.65rem;
  overflow: hidden;
  transition: background 0.3s;
  animation: fade-in 0.6s ease both;
  animation-delay: var(--delay);
}

.card:hover {
  background: var(--bg-card-hover);
}

.card:hover .card__icon {
  color: var(--gold-light);
  transform: scale(1.1);
}

.card:hover .card__shine {
  opacity: 1;
}

.card__shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s;
}

.card__icon {
  width: 32px;
  height: 32px;
  color: var(--gold-dim);
  transition: color 0.3s, transform 0.3s;
  flex-shrink: 0;
}

.card__icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.card__tag {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 3px;
  background: rgba(212, 160, 68, 0.08);
  border: 1px solid rgba(212, 160, 68, 0.15);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--gold);
}

.card__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-bright);
}

.card__desc {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--text-dim);
}

/* ═══════ CTA ═══════ */
.cta {
  z-index: 1;
  max-width: 48rem;
  width: 100%;
  text-align: center;
  padding: clamp(2.5rem, 5vh, 4rem) 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  position: relative;
}

.cta::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

.cta__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: clamp(1.1rem, 2.5vw, 1.5rem);
  font-weight: 600;
  color: var(--text-bright);
}

.cta__sub {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-dim);
  max-width: 32rem;
  line-height: 1.6;
}

/* ═══════ Footer ═══════ */
.foot {
  z-index: 1;
  padding: 2rem 0 3rem;
  font-size: 0.75rem;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.foot__dot {
  opacity: 0.4;
}

.foot__tagline {
  font-style: italic;
  opacity: 0.6;
}

/* ═══════ Animations ═══════ */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
}

/* ═══════ Responsive ═══════ */
@media (max-width: 960px) {
  .features__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .features__grid {
    grid-template-columns: 1fr 1fr;
  }

  .hero__title {
    font-size: clamp(2rem, 8vw, 2.8rem);
  }
}

@media (max-width: 420px) {
  .features__grid {
    grid-template-columns: 1fr;
  }
}
</style>
