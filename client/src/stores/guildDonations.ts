import { computed, ref, watch, onUnmounted } from 'vue';
import { defineStore } from 'pinia';
import { api, type GuildDonation } from '../services/api';
import { useAuthStore } from './auth';

const POLL_INTERVAL_MS = 60000; // Poll every 60 seconds
const DONATIONS_STALE_MS = 10000; // Consider donations stale after 10 seconds

export const useGuildDonationsStore = defineStore('guildDonations', () => {
  const authStore = useAuthStore();

  // State
  const donations = ref<GuildDonation[]>([]);
  const pendingCount = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const modalVisible = ref(false);

  // Timestamps to avoid redundant fetches
  let lastDonationsFetchTime = 0;
  let lastCountFetchTime = 0;

  // Poll timer
  let pollTimerId: ReturnType<typeof setInterval> | null = null;

  // Computed
  const hasPendingDonations = computed(() => pendingCount.value > 0);

  const currentGuildId = computed(() => authStore.primaryGuild?.id ?? null);

  // Actions
  async function fetchDonationCount() {
    const guildId = currentGuildId.value;
    if (!guildId) {
      pendingCount.value = 0;
      return;
    }

    // Skip if tab is hidden to avoid unnecessary background requests
    if (document.hidden) {
      return;
    }

    try {
      pendingCount.value = await api.fetchGuildDonationCount(guildId);
      lastCountFetchTime = Date.now();
    } catch (err) {
      console.warn('Failed to fetch donation count:', err);
    }
  }

  async function fetchDonations(force = false) {
    const guildId = currentGuildId.value;
    if (!guildId) {
      donations.value = [];
      return;
    }

    // Skip if data is fresh (unless forced)
    const now = Date.now();
    if (!force && lastDonationsFetchTime > 0 && (now - lastDonationsFetchTime) < DONATIONS_STALE_MS) {
      return;
    }

    // Skip if already loading
    if (loading.value) {
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      donations.value = await api.fetchGuildDonations(guildId);
      pendingCount.value = donations.value.length;
      lastDonationsFetchTime = Date.now();
      lastCountFetchTime = Date.now();
    } catch (err) {
      console.error('Failed to fetch donations:', err);
      error.value = 'Failed to load donations';
      donations.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function rejectDonation(donationId: string) {
    const guildId = currentGuildId.value;
    if (!guildId) return;

    try {
      await api.rejectGuildDonation(guildId, donationId);
      // Remove from local state
      donations.value = donations.value.filter(d => d.id !== donationId);
      pendingCount.value = Math.max(0, pendingCount.value - 1);
    } catch (err) {
      console.error('Failed to reject donation:', err);
      throw err;
    }
  }

  async function rejectAllDonations() {
    const guildId = currentGuildId.value;
    if (!guildId) return;

    try {
      const count = await api.rejectAllGuildDonations(guildId);
      donations.value = [];
      pendingCount.value = 0;
      return count;
    } catch (err) {
      console.error('Failed to reject all donations:', err);
      throw err;
    }
  }

  async function deleteDonation(donationId: string) {
    const guildId = currentGuildId.value;
    if (!guildId) return;

    try {
      await api.deleteGuildDonation(guildId, donationId);
      // Remove from local state
      donations.value = donations.value.filter(d => d.id !== donationId);
      pendingCount.value = Math.max(0, pendingCount.value - 1);
    } catch (err) {
      console.error('Failed to delete donation:', err);
      throw err;
    }
  }

  function showModal() {
    modalVisible.value = true;
    fetchDonations();
  }

  function hideModal() {
    modalVisible.value = false;
  }

  function startPolling() {
    stopPolling();
    fetchDonationCount();
    pollTimerId = setInterval(fetchDonationCount, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimerId !== null) {
      clearInterval(pollTimerId);
      pollTimerId = null;
    }
  }

  // Watch for guild changes
  watch(currentGuildId, (newGuildId) => {
    // Reset timestamps when guild changes
    lastDonationsFetchTime = 0;
    lastCountFetchTime = 0;

    if (newGuildId) {
      startPolling();
    } else {
      stopPolling();
      donations.value = [];
      pendingCount.value = 0;
    }
  }, { immediate: true });

  // Handle visibility changes - resume polling when tab becomes visible
  function handleVisibilityChange() {
    if (!document.hidden && currentGuildId.value) {
      // Tab became visible, fetch fresh count
      fetchDonationCount();
    }
  }

  // Set up visibility listener
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    // State
    donations,
    pendingCount,
    loading,
    error,
    modalVisible,

    // Computed
    hasPendingDonations,
    currentGuildId,

    // Actions
    fetchDonationCount,
    fetchDonations,
    rejectDonation,
    rejectAllDonations,
    deleteDonation,
    showModal,
    hideModal,
    startPolling,
    stopPolling
  };
});
