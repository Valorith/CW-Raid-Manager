<template>
  <div class="account-tab">
    <!-- Loading -->
    <div v-if="store.accountLoading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading account info...</p>
    </div>

    <!-- Account Info -->
    <template v-else-if="store.account">
      <div class="account-grid">
        <!-- Basic Info -->
        <div class="info-section">
          <h4>Basic Information</h4>
          <div class="info-row">
            <span class="label">Account ID</span>
            <span class="value">{{ store.account.id }}</span>
          </div>
          <div class="info-row">
            <span class="label">Account Name</span>
            <span class="value">{{ store.account.name }}</span>
          </div>
          <div class="info-row" v-if="store.account.charname">
            <span class="label">Default Character</span>
            <span class="value">{{ store.account.charname }}</span>
          </div>
          <div class="info-row">
            <span class="label">Character Count</span>
            <span class="value">{{ store.account.characterCount }}</span>
          </div>
        </div>

        <!-- Status & Permissions -->
        <div class="info-section">
          <h4>Status & Permissions</h4>
          <div class="info-row">
            <span class="label">Status</span>
            <span class="value">
              <span class="status-badge" :class="getStatusClass(store.account.status)">
                {{ getStatusLabel(store.account.status) }}
              </span>
            </span>
          </div>
          <div class="info-row">
            <span class="label">GM Speed</span>
            <span class="value">{{ store.account.gmSpeed ? 'Enabled' : 'Disabled' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Hide Me</span>
            <span class="value">{{ store.account.hideme ? 'Yes' : 'No' }}</span>
          </div>
          <div class="info-row">
            <span class="label">IP Exemptions</span>
            <span class="value">{{ store.account.ipExemptions }}</span>
          </div>
        </div>

        <!-- Login Server -->
        <div class="info-section" v-if="store.account.lsAccountId">
          <h4>Login Server</h4>
          <div class="info-row">
            <span class="label">LS Account ID</span>
            <span class="value">{{ store.account.lsAccountId }}</span>
          </div>
        </div>

        <!-- Suspension Info -->
        <div class="info-section" v-if="store.account.suspendedUntil || store.account.suspendedReason">
          <h4>Suspension</h4>
          <div class="info-row" v-if="store.account.suspendedUntil">
            <span class="label">Suspended Until</span>
            <span class="value value--warning">{{ formatDate(store.account.suspendedUntil) }}</span>
          </div>
          <div class="info-row" v-if="store.account.suspendedReason">
            <span class="label">Reason</span>
            <span class="value value--warning">{{ store.account.suspendedReason }}</span>
          </div>
        </div>

        <!-- Timestamps -->
        <div class="info-section">
          <h4>Timestamps</h4>
          <div class="info-row" v-if="store.account.timeCreation">
            <span class="label">Time Creation</span>
            <span class="value">{{ formatUnixTime(store.account.timeCreation) }}</span>
          </div>
          <div class="info-row" v-if="store.account.createdAt">
            <span class="label">Created At</span>
            <span class="value">{{ formatDate(store.account.createdAt) }}</span>
          </div>
          <div class="info-row" v-if="store.account.updatedAt">
            <span class="label">Updated At</span>
            <span class="value">{{ formatDate(store.account.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- No Data -->
    <div v-else class="no-data">
      Unable to load account information
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCharacterAdminStore } from '../../../stores/characterAdmin';

const store = useCharacterAdminStore();

function getStatusLabel(status: number): string {
  // EQEmu status levels
  if (status >= 250) return 'Server Admin';
  if (status >= 200) return 'Lead GM';
  if (status >= 150) return 'GM';
  if (status >= 100) return 'Guide';
  if (status >= 80) return 'QA';
  if (status >= 50) return 'Steward';
  if (status >= 20) return 'Apprentice';
  if (status >= 10) return 'Sentinel';
  if (status > 0) return `Level ${status}`;
  return 'Player';
}

function getStatusClass(status: number): string {
  if (status >= 200) return 'status--admin';
  if (status >= 100) return 'status--gm';
  if (status > 0) return 'status--elevated';
  return 'status--player';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function formatUnixTime(timestamp: number): string {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString();
}
</script>

<style scoped lang="scss">
.account-tab {
  padding: 0;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: #94a3b8;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.info-section {
  background: #0f172a;
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #334155;

  h4 {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: #e2e8f0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #334155;
  }
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);

  &:last-child {
    border-bottom: none;
  }
}

.label {
  color: #64748b;
  font-size: 0.875rem;
}

.value {
  color: #f8fafc;
  font-size: 0.875rem;
  text-align: right;

  &--warning {
    color: #f59e0b;
  }
}

.status-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;

  &.status--admin {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  &.status--gm {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  &.status--elevated {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  &.status--player {
    background: rgba(100, 116, 139, 0.2);
    color: #94a3b8;
  }
}

.no-data {
  text-align: center;
  padding: 3rem;
  color: #64748b;
}
</style>
