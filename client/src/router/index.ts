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
      path: '/guilds/:guildId/settings',
      name: 'GuildSettings',
      component: () => import('../views/GuildSettingsView.vue'),
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
    },
    {
      path: '/raids/:raidId/loot',
      name: 'RaidLoot',
      component: () => import('../views/LootTrackerView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings/account',
      name: 'AccountSettings',
      component: () => import('../views/AccountSettingsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'Admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
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

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { path: '/dashboard' };
  }

  return true;
});

export default router;
