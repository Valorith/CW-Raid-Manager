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
      path: '/q/:assignmentId',
      name: 'QuestShare',
      component: () => import('../views/QuestShareRedirectView.vue'),
      meta: { requiresAuth: true }
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
      path: '/guilds/:guildId/quests',
      name: 'GuildQuestTracker',
      component: () => import('../views/GuildQuestTrackerView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId/bank',
      name: 'GuildBank',
      component: () => import('../views/GuildBankView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId/metrics',
      name: 'GuildMetrics',
      component: () => import('../views/GuildMetricsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId/settings',
      name: 'GuildSettings',
      component: () => import('../views/GuildSettingsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId/npc-respawn',
      name: 'GuildNpcRespawn',
      component: () => import('../views/GuildNpcRespawnView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guilds/:guildId/npc-respawn/manage',
      name: 'GuildNpcManagement',
      component: () => import('../views/GuildNpcManagementView.vue'),
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
    },
    {
      path: '/admin/loot-management',
      name: 'LootManagement',
      component: () => import('../views/LootManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/money-tracker',
      name: 'MoneyTracker',
      component: () => import('../views/MoneyTrackerView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/connections',
      name: 'Connections',
      component: () => import('../views/ConnectionsView.vue'),
      meta: { requiresAuth: true, requiresGuideOrAdmin: true }
    },
    {
      path: '/admin/player-event-logs',
      name: 'PlayerEventLogs',
      component: () => import('../views/PlayerEventLogsView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/metallurgy',
      name: 'Metallurgy',
      component: () => import('../views/MetallurgyAdminView.vue'),
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

  if (to.meta.requiresGuideOrAdmin && !authStore.isAdminOrGuide) {
    return { path: '/dashboard' };
  }

  return true;
});

export default router;
