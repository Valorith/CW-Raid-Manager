import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { Router } from 'vue-router';

import { api } from '../services/api';
import type { useAuthStore } from '../stores/auth';
import { createNexusWebMcpTools } from '../webmcp/nexusTools';
import { registerWebMcpTools } from '../webmcp/registerTools';
import type { WebMcpRegistration, WebMcpRegistrationStatus } from '../webmcp/types';

type AuthStore = ReturnType<typeof useAuthStore>;

export interface WebMcpState {
  status: Ref<WebMcpRegistrationStatus>;
}

const WEB_MCP_ENABLED = import.meta.env.VITE_ENABLE_WEBMCP === 'true';

export function useWebMcp(authStore: AuthStore, router: Router): WebMcpState {
  const status = ref<WebMcpRegistrationStatus>(WEB_MCP_ENABLED ? 'unsupported' : 'disabled');
  let activeRegistration: WebMcpRegistration | null = null;
  let pendingRegistration: AbortController | null = null;
  let registrationGeneration = 0;

  const stopWatching = watch(
    () => {
      const user = authStore.user;
      if (!user) return '';
      return `${user.userId}:${user.guilds.map((guild) => `${guild.id}:${guild.name}`).join('|')}`;
    },
    async (viewerSignature) => {
      const generation = ++registrationGeneration;
      pendingRegistration?.abort();
      pendingRegistration = null;
      activeRegistration?.dispose();
      activeRegistration = null;

      if (!WEB_MCP_ENABLED || !viewerSignature || !authStore.user) {
        status.value = WEB_MCP_ENABLED ? 'unsupported' : 'disabled';
        return;
      }

      const registrationLifecycle = new AbortController();
      pendingRegistration = registrationLifecycle;
      const registration = await registerWebMcpTools({
        enabled: true,
        signal: registrationLifecycle.signal,
        tools: createNexusWebMcpTools({
          getViewerGuilds: () =>
            (authStore.user?.guilds ?? []).map((guild) => ({
              id: guild.id,
              name: guild.name
            })),
          fetchRaidsForGuild: (guildId) => api.fetchRaidsForGuild(guildId),
          fetchRaid: (raidId) => api.fetchRaid(raidId),
          fetchMarketListingsPage: (options) => api.fetchMarketListingsPage(options),
          fetchGuildBossLibrary: (guildId) => api.fetchGuildBossLibrary(guildId),
          fetchGuildBoss: (guildId, bossId) => api.fetchGuildBoss(guildId, bossId),
          async navigateToBoss(guildId, bossId) {
            await router.push({ name: 'GuildBossDetail', params: { guildId, bossId } });
            await nextTick();
            return router.currentRoute.value.fullPath;
          }
        }),
        onError: (error) => {
          console.warn('Unable to register WebMCP tools.', error);
        }
      });

      if (generation !== registrationGeneration) {
        registration.dispose();
        return;
      }

      pendingRegistration = null;
      activeRegistration = registration;
      status.value = registration.status;
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    registrationGeneration += 1;
    stopWatching();
    pendingRegistration?.abort();
    pendingRegistration = null;
    activeRegistration?.dispose();
    activeRegistration = null;
  });

  return { status };
}
