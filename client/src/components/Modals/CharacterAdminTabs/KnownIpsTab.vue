<template>
  <div class="knownips-tab">
    <!-- Loading -->
    <div v-if="store.knownIpsLoading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading known IPs...</p>
    </div>

    <!-- Known IPs Table -->
    <template v-else>
      <div class="knownips-summary">
        {{ store.knownIps.length }} known IP{{ store.knownIps.length !== 1 ? 's' : '' }} found
      </div>

      <div class="knownips-table-wrapper">
        <table class="knownips-table" v-if="store.knownIps.length > 0">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>Login Count</th>
              <th>Last Used</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ip in paginatedIps" :key="ip.ip">
              <td class="col-ip">
                <code>{{ ip.ip }}</code>
              </td>
              <td class="col-count">
                {{ ip.count }} time{{ ip.count !== 1 ? 's' : '' }}
              </td>
              <td class="col-lastused">
                <span v-if="ip.lastUsed">{{ formatDate(ip.lastUsed) }}</span>
                <span v-else class="no-data-text">-</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            class="pagination-btn"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            &laquo; Prev
          </button>
          <span class="pagination-info">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            class="pagination-btn"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            Next &raquo;
          </button>
        </div>

        <div v-if="store.knownIps.length === 0" class="no-data">
          No known IPs found for this account
        </div>
      </div>

      <div class="info-note">
        <span class="info-icon">&#9432;</span>
        <span>This data comes from the <code>account_ip</code> table and tracks all IP addresses this account has logged in from.</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';

const store = useCharacterAdminStore();
const currentPage = ref(1);
const ITEMS_PER_PAGE = 10;

const totalPages = computed(() => Math.ceil(store.knownIps.length / ITEMS_PER_PAGE));

const paginatedIps = computed(() => {
  const start = (currentPage.value - 1) * ITEMS_PER_PAGE;
  return store.knownIps.slice(start, start + ITEMS_PER_PAGE);
});

// Reset to page 1 when data changes
watch(() => store.knownIps, () => {
  currentPage.value = 1;
});

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

function formatDate(dateStr: string): string {
  // The lastused column is a Unix timestamp in seconds, convert to milliseconds
  const timestamp = parseInt(dateStr, 10);
  if (!isNaN(timestamp)) {
    return new Date(timestamp * 1000).toLocaleString();
  }
  // Fallback for other date formats
  return new Date(dateStr).toLocaleString();
}
</script>

<style scoped lang="scss">
.knownips-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.knownips-summary {
  font-size: 0.875rem;
  color: #94a3b8;
}

.knownips-table-wrapper {
  overflow-x: auto;
}

.knownips-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #334155;
  }

  th {
    background: #0f172a;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  td {
    color: #e2e8f0;
    font-size: 0.875rem;
  }

  tbody tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .col-ip {
    code {
      font-family: monospace;
      background: rgba(59, 130, 246, 0.1);
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      color: #60a5fa;
    }
  }

  .col-count {
    color: #94a3b8;
  }

  .col-lastused {
    white-space: nowrap;
    color: #94a3b8;
    font-size: 0.75rem;
  }
}

.no-data-text {
  color: #475569;
}

.no-data {
  text-align: center;
  padding: 3rem;
  color: #64748b;
  background: #0f172a;
  border-radius: 0.5rem;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  padding: 0.5rem;
}

.pagination-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: #334155;
    color: #e2e8f0;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.pagination-info {
  font-size: 0.75rem;
  color: #94a3b8;
}

.info-note {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;

  .info-icon {
    color: #60a5fa;
    font-size: 1rem;
  }

  code {
    font-family: monospace;
    background: rgba(59, 130, 246, 0.15);
    padding: 0.125rem 0.25rem;
    border-radius: 0.125rem;
    color: #60a5fa;
  }
}
</style>
