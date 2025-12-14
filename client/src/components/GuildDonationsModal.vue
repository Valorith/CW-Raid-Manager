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
            <div class="donations-actions">
              <span class="donations-count">{{ store.donations.length }} pending item{{ store.donations.length !== 1 ? 's' : '' }}</span>
              <button
                v-if="canReject"
                class="btn btn--sm btn--outline"
                type="button"
                :disabled="rejecting"
                @click="handleRejectAll"
              >
                {{ rejecting ? 'Rejecting...' : 'Reject All' }}
              </button>
            </div>

            <div class="donations-table-wrapper">
              <table class="donations-table">
                <thead>
                  <tr>
                    <th class="donations-table__col-item">Item</th>
                    <th class="donations-table__col-raid">Raid</th>
                    <th class="donations-table__col-date">Date</th>
                    <th v-if="canReject" class="donations-table__col-actions">Actions</th>
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
                    <td class="donations-table__cell-raid">
                      {{ donation.raid?.name ?? '—' }}
                    </td>
                    <td class="donations-table__cell-date">
                      {{ formatDate(donation.donatedAt) }}
                    </td>
                    <td v-if="canReject" class="donations-table__cell-actions">
                      <button
                        class="btn btn--xs btn--outline"
                        type="button"
                        title="Reject this donation"
                        @click="handleReject(donation.id)"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                      <button
                        class="btn btn--xs btn--danger-outline"
                        type="button"
                        title="Delete this donation"
                        @click="handleDelete(donation.id)"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGuildDonationsStore } from '../stores/guildDonations';
import { useAuthStore } from '../stores/auth';
import { useItemTooltipStore, type TooltipItem } from '../stores/itemTooltip';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import type { GuildDonation } from '../services/api';

const store = useGuildDonationsStore();
const authStore = useAuthStore();
const tooltipStore = useItemTooltipStore();

const rejecting = ref(false);

// Check if user can reject donations (officer, leader, raid leader)
const canReject = computed(() => {
  const primaryGuild = authStore.primaryGuild;
  if (!primaryGuild) return false;
  return ['LEADER', 'OFFICER', 'RAID_LEADER'].includes(primaryGuild.role);
});

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
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

async function handleReject(donationId: string) {
  try {
    await store.rejectDonation(donationId);
  } catch {
    // Error already logged in store
  }
}

async function handleRejectAll() {
  rejecting.value = true;
  try {
    await store.rejectAllDonations();
  } catch {
    // Error already logged in store
  } finally {
    rejecting.value = false;
  }
}

async function handleDelete(donationId: string) {
  try {
    await store.deleteDonation(donationId);
  } catch {
    // Error already logged in store
  }
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

.donations-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  width: 40%;
}

.donations-table__col-raid {
  width: 25%;
}

.donations-table__col-date {
  width: 20%;
}

.donations-table__col-actions {
  width: 15%;
  text-align: right;
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

.donations-table__cell-raid {
  color: #94a3b8;
  font-size: 0.85rem;
}

.donations-table__cell-date {
  color: #64748b;
  font-size: 0.85rem;
  white-space: nowrap;
}

.donations-table__cell-actions {
  text-align: right;
}

.donations-table__cell-actions .btn {
  margin-left: 0.35rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn--sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.85rem;
}

.btn--xs {
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
}

.btn--xs svg {
  width: 14px;
  height: 14px;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #e2e8f0;
}

.btn--outline:hover:not(:disabled) {
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn--outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger-outline {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.btn--danger-outline:hover:not(:disabled) {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
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

  .donations-table__col-raid {
    display: none;
  }

  .donations-table__cell-raid {
    display: none;
  }
}
</style>
