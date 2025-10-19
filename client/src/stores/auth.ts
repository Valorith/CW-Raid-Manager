import axios from 'axios';
import { defineStore } from 'pinia';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName?: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthenticatedUser | null,
    loading: false
  }),
  getters: {
    isAuthenticated: (state) => !!state.user
  },
  actions: {
    async fetchCurrentUser() {
      this.loading = true;
      try {
        const response = await axios.get('/api/auth/me');
        if (response.data?.user) {
          this.user = {
            userId: response.data.user.userId,
            email: response.data.user.email,
            displayName: response.data.user.displayName
          };
        } else {
          this.user = null;
        }
      } catch (error) {
        this.user = null;
        if (axios.isAxiosError(error) && error.response?.status !== 401) {
          console.error('Failed to fetch current user', error);
        }
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
