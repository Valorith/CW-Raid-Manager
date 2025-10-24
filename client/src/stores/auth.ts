import axios from 'axios';
import { defineStore } from 'pinia';

import type { GuildRole } from '../services/types';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName?: string;
  nickname?: string | null;
  isAdmin: boolean;
  guilds: UserGuildSummary[];
  pendingApplication: PendingGuildApplication | null;
}

export interface UserGuildSummary {
  id: string;
  name: string;
  role: GuildRole;
}

export interface PendingGuildApplication {
  id: string;
  guildId: string;
  status: string;
  guild: {
    id: string;
    name: string;
    description?: string | null;
  };
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthenticatedUser | null,
    loading: false
  }),
  getters: {
    isAuthenticated: (state) => !!state.user,
    preferredName: (state) => state.user?.nickname ?? state.user?.displayName ?? null,
    isAdmin: (state) => state.user?.isAdmin ?? false,
    primaryGuild: (state) => state.user?.guilds?.[0] ?? null,
    pendingApplication: (state) => state.user?.pendingApplication ?? null
  },
  actions: {
    async fetchCurrentUser() {
      this.loading = true;
      try {
        const response = await axios.get('/api/auth/me', {
          validateStatus: (status) => status === 200 || status === 401
        });

        if (response.status === 401 || !response.data?.user) {
          this.user = null;
        } else {
          this.user = {
            userId: response.data.user.userId,
            email: response.data.user.email,
            displayName: response.data.user.displayName,
            nickname: response.data.user.nickname ?? null,
            isAdmin: Boolean(response.data.user.isAdmin),
            guilds: Array.isArray(response.data.user.guilds) ? response.data.user.guilds : [],
            pendingApplication: response.data.user.pendingApplication ?? null
          };
        }
      } catch (error) {
        this.user = null;
        console.error('Failed to fetch current user', error);
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      try {
        await axios.post('/api/auth/logout');
      } finally {
        this.user = null;
        window.location.href = '/';
      }
    }
  }
});
