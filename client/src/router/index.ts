import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Landing',
      component: () => import('../views/LandingView.vue')
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/auth/callback',
      name: 'AuthCallback',
      component: () => import('../views/AuthCallbackView.vue')
    },
    {
      path: '/guilds',
      name: 'Guilds',
      component: () => import('../views/GuildListView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId',
      name: 'GuildDetail',
      component: () => import('../views/GuildDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/raids',
      name: 'Raids',
      component: () => import('../views/RaidDashboardView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/raids/:raidId',
      name: 'RaidDetail',
      component: () => import('../views/RaidDetailView.vue'),
      meta: { requiresAuth: true }
    }
  ]
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  if (!authStore.user && !authStore.loading) {
    await authStore.fetchCurrentUser();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { path: '/auth/callback', query: { redirect: to.fullPath } };
  }

  return true;
});

export default router;
