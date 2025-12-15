import { computed, ref, watch, onUnmounted } from 'vue';
import { defineStore } from 'pinia';
import { api, type GuildDonation } from '../services/api';
import { useAuthStore } from './auth';

const POLL_INTERVAL_MS = 60000; // Poll every 60 seconds
const DONATIONS_STALE_MS = 10000; // Consider donations stale after 10 seconds
const DEFAULT_PAGE_SIZE = 25;

export const useGuildDonationsStore = defineStore('guildDonations', () => {
  const authStore = useAuthStore();

  // State
  const donations = ref<GuildDonation[]>([]);
  const pendingCount = ref(0);
  const totalCount = ref(0); // Total donations count (for badge visibility)
  const loading = ref(false);
  const error = ref<string | null>(null);
  const modalVisible = ref(false);

  // Pagination state
  const currentPage = ref(1);
  const totalPages = ref(0);
  const totalDonations = ref(0);
  const pageSize = ref(DEFAULT_PAGE_SIZE);

  // Timestamps to avoid redundant fetches
  let lastDonationsFetchTime = 0;
  let lastCountFetchTime = 0;

  // Poll timer
  let pollTimerId: ReturnType<typeof setInterval> | null = null;

  // Computed
  const hasPendingDonations = computed(() => pendingCount.value > 0);
  const hasDonations = computed(() => totalCount.value > 0);

  const currentGuildId = computed(() => authStore.primaryGuild?.id ?? null);

  // Actions
  async function fetchDonationCount() {
    const guildId = currentGuildId.value;
    if (!guildId) {
      pendingCount.value = 0;
      totalCount.value = 0;
      return;
    }

    // Skip if tab is hidden to avoid unnecessary background requests
    if (document.hidden) {
      return;
    }

    try {
      const counts = await api.fetchGuildDonationCounts(guildId);
      pendingCount.value = counts.pending;
      totalCount.value = counts.total;
      lastCountFetchTime = Date.now();
    } catch (err) {
      console.warn('Failed to fetch donation count:', err);
    }
  }

  async function fetchDonations(force = false, page?: number) {
    const guildId = currentGuildId.value;
    if (!guildId) {
      donations.value = [];
      return;
    }

    // Determine target page
    const targetPage = page ?? currentPage.value;

    // Skip if data is fresh and same page (unless forced)
    const now = Date.now();
    if (!force && !page && lastDonationsFetchTime > 0 && (now - lastDonationsFetchTime) < DONATIONS_STALE_MS) {
      return;
    }

    // Skip if already loading
    if (loading.value) {
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const result = await api.fetchGuildDonations(guildId, targetPage, pageSize.value);
      donations.value = result.donations;
      currentPage.value = result.page;
      totalPages.value = result.totalPages;
      totalDonations.value = result.total;
      // Update counts for badge visibility and glow effect
      totalCount.value = result.total;
      pendingCount.value = result.pending;
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

  async function goToPage(page: number) {
    if (page < 1 || page > totalPages.value || page === currentPage.value) {
      return;
    }
    await fetchDonations(true, page);
  }

  async function nextPage() {
    if (currentPage.value < totalPages.value) {
      await goToPage(currentPage.value + 1);
    }
  }

  async function previousPage() {
    if (currentPage.value > 1) {
      await goToPage(currentPage.value - 1);
    }
  }

  async function rejectDonation(donationId: string) {
    const guildId = currentGuildId.value;
    if (!guildId) return;

    try {
      await api.rejectGuildDonation(guildId, donationId);
      // Update the donation status in local state
      const donation = donations.value.find(d => d.id === donationId);
      if (donation && donation.status === 'PENDING') {
        donation.status = 'REJECTED';
        pendingCount.value = Math.max(0, pendingCount.value - 1);
      }
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
      // Update all pending donations to rejected status
      donations.value.forEach(d => {
        if (d.status === 'PENDING') {
          d.status = 'REJECTED';
        }
      });
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
      // Find donation before deleting to check its status
      const donation = donations.value.find(d => d.id === donationId);
      const wasPending = donation?.status === 'PENDING';

      await api.deleteGuildDonation(guildId, donationId);
      // Remove from local state
      donations.value = donations.value.filter(d => d.id !== donationId);
      totalCount.value = Math.max(0, totalCount.value - 1);
      if (wasPending) {
        pendingCount.value = Math.max(0, pendingCount.value - 1);
      }
    } catch (err) {
      console.error('Failed to delete donation:', err);
      throw err;
    }
  }

  function showModal() {
    modalVisible.value = true;
    // Reset to first page when opening modal
    currentPage.value = 1;
    fetchDonations(true, 1);
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
      totalCount.value = 0;
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
    totalCount,
    loading,
    error,
    modalVisible,

    // Pagination state
    currentPage,
    totalPages,
    totalDonations,
    pageSize,

    // Computed
    hasPendingDonations,
    hasDonations,
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
    stopPolling,

    // Pagination actions
    goToPage,
    nextPage,
    previousPage
  };
});
