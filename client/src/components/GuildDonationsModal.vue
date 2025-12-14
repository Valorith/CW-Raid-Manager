<template>
  <Teleport to="body">
    <div v-if="store.modalVisible" class="modal-backdrop" @click.self="store.hideModal">
      <div class="modal donations-modal">
        <header class="modal__header">
          <h2 class="modal__title">
            <svg class="modal__title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Pending Guild Donations
          </h2>
          <button class="modal__close" type="button" @click="store.hideModal" aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>

        <div class="modal__content">
          <div v-if="store.loading" class="donations-loading">
            <span class="donations-spinner"></span>
            Loading donations...
          </div>

          <div v-else-if="store.error" class="donations-error">
            {{ store.error }}
          </div>

          <div v-else-if="store.donations.length === 0" class="donations-empty">
            <svg class="donations-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p>No pending donations</p>
            <span class="donations-empty__hint">Items donated to the guild during raids will appear here.</span>
          </div>

          <template v-else>
            <div class="donations-info">
              <span class="donations-count">
                {{ store.totalDonations }} item{{ store.totalDonations !== 1 ? 's' : '' }}
                <template v-if="store.totalPages > 1">
                  &middot; Page {{ store.currentPage }} of {{ store.totalPages }}
                </template>
              </span>
            </div>

            <div class="donations-table-wrapper">
              <table class="donations-table">
                <thead>
                  <tr>
                    <th class="donations-table__col-item">Item</th>
                    <th class="donations-table__col-qty">Qty</th>
                    <th class="donations-table__col-donator">Donator</th>
                    <th class="donations-table__col-status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="donation in store.donations" :key="donation.id">
                    <td class="donations-table__cell-item">
                      <div
                        class="donation-item"
                        @mouseenter="handleItemHover($event, donation)"
                        @mousemove="handleItemMove($event)"
                        @mouseleave="handleItemLeave"
                      >
                        <img
                          v-if="hasValidIconId(donation.itemIconId)"
                          :src="getLootIconSrc(donation.itemIconId!)"
                          class="donation-item__icon"
                          alt=""
                        />
                        <div v-else class="donation-item__icon donation-item__icon--placeholder">?</div>
                        <span class="donation-item__name">{{ donation.itemName }}</span>
                      </div>
                    </td>
                    <td class="donations-table__cell-qty">
                      {{ donation.quantity }}
                    </td>
                    <td class="donations-table__cell-donator">
                      {{ donation.donatorName ?? '—' }}
                    </td>
                    <td class="donations-table__cell-status">
                      <span :class="getStatusClass(donation.status)">
                        {{ getStatusLabel(donation.status) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination controls -->
            <div v-if="store.totalPages > 1" class="donations-pagination">
              <button
                class="pagination-btn"
                :disabled="store.currentPage <= 1 || store.loading"
                @click="store.previousPage"
                aria-label="Previous page"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>

              <div class="pagination-pages">
                <button
                  v-for="page in visiblePages"
                  :key="page"
                  class="pagination-page"
                  :class="{ 'pagination-page--active': page === store.currentPage, 'pagination-page--ellipsis': page === '...' }"
                  :disabled="page === '...' || page === store.currentPage || store.loading"
                  @click="page !== '...' && store.goToPage(page as number)"
                >
                  {{ page }}
                </button>
              </div>

              <button
                class="pagination-btn"
                :disabled="store.currentPage >= store.totalPages || store.loading"
                @click="store.nextPage"
                aria-label="Next page"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGuildDonationsStore } from '../stores/guildDonations';
import { useItemTooltipStore, type TooltipItem } from '../stores/itemTooltip';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import type { GuildDonation, GuildDonationStatus } from '../services/api';

const store = useGuildDonationsStore();
const tooltipStore = useItemTooltipStore();

// Compute visible page numbers for pagination
const visiblePages = computed(() => {
  const total = store.totalPages;
  const current = store.currentPage;
  const pages: (number | string)[] = [];

  if (total <= 7) {
    // Show all pages if 7 or less
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    // Show pages around current
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) {
      pages.push('...');
    }

    // Always show last page
    pages.push(total);
  }

  return pages;
});

function getStatusLabel(status: GuildDonationStatus): string {
  return status === 'PENDING' ? 'Pending' : 'Rejected';
}

function getStatusClass(status: GuildDonationStatus): string {
  return status === 'PENDING' ? 'status-badge status-badge--pending' : 'status-badge status-badge--rejected';
}

function handleItemHover(event: MouseEvent, donation: GuildDonation) {
  if (!donation.itemId || donation.itemId <= 0) return;

  const item: TooltipItem = {
    itemId: donation.itemId,
    itemName: donation.itemName,
    itemIconId: donation.itemIconId
  };

  tooltipStore.showTooltip(item, { x: event.clientX, y: event.clientY });
}

function handleItemMove(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function handleItemLeave() {
  tooltipStore.hideTooltip();
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
}

.modal {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.donations-modal {
  width: min(700px, 95vw);
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.modal__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: #f8fafc;
  margin: 0;
}

.modal__title-icon {
  width: 1.35rem;
  height: 1.35rem;
  color: #fbbf24;
}

.modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: background 0.15s ease, color 0.15s ease;
}

.modal__close:hover {
  background: rgba(148, 163, 184, 0.15);
  color: #f8fafc;
}

.modal__close svg {
  width: 1.25rem;
  height: 1.25rem;
}

.modal__content {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.donations-loading,
.donations-error,
.donations-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  color: #94a3b8;
  text-align: center;
}

.donations-spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 0.75rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.donations-error {
  color: #f87171;
}

.donations-empty__icon {
  width: 3rem;
  height: 3rem;
  color: #475569;
  margin-bottom: 0.75rem;
}

.donations-empty p {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  color: #cbd5e1;
}

.donations-empty__hint {
  font-size: 0.85rem;
  color: #64748b;
}

.donations-info {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.donations-count {
  font-size: 0.9rem;
  color: #94a3b8;
}

.donations-table-wrapper {
  overflow-x: auto;
}

.donations-table {
  width: 100%;
  border-collapse: collapse;
}

.donations-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.donations-table td {
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  vertical-align: middle;
}

.donations-table tr:last-child td {
  border-bottom: none;
}

.donations-table tr:hover td {
  background: rgba(148, 163, 184, 0.05);
}

.donations-table__col-item {
  width: 50%;
}

.donations-table__col-qty {
  width: 10%;
  text-align: center;
}

.donations-table__col-donator {
  width: 25%;
}

.donations-table__col-status {
  width: 15%;
  text-align: center;
}

.donation-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: default;
}

.donation-item__icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: #0f172a;
  border: 1px solid rgba(100, 116, 139, 0.3);
  flex-shrink: 0;
}

.donation-item__icon--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: #64748b;
}

.donation-item__name {
  color: #e2e8f0;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.donations-table__cell-qty {
  color: #94a3b8;
  font-size: 0.9rem;
  text-align: center;
}

.donations-table__cell-donator {
  color: #94a3b8;
  font-size: 0.85rem;
}

.donations-table__cell-status {
  text-align: center;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.status-badge--pending {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-badge--rejected {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Pagination styles */
.donations-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.pagination-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(30, 41, 59, 0.5);
  color: #94a3b8;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pagination-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.15);
  color: #f8fafc;
  border-color: rgba(148, 163, 184, 0.3);
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-btn svg {
  width: 1rem;
  height: 1rem;
}

.pagination-pages {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.pagination-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
  font-size: 0.85rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pagination-page:hover:not(:disabled):not(.pagination-page--ellipsis) {
  background: rgba(148, 163, 184, 0.1);
  color: #f8fafc;
}

.pagination-page--active {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
  cursor: default;
}

.pagination-page--ellipsis {
  cursor: default;
  color: #64748b;
}

@media (max-width: 600px) {
  .donations-modal {
    width: 100%;
    height: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .modal__header {
    padding: 1rem;
  }

  .modal__content {
    padding: 1rem;
  }

  .donations-table__col-donator,
  .donations-table__col-status {
    display: none;
  }

  .donations-table__cell-donator,
  .donations-table__cell-status {
    display: none;
  }
}
</style>
