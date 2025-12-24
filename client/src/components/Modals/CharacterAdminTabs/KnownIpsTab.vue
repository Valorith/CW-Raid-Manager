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
              <th>Location</th>
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
              <td class="col-location">
                <!-- Loading state -->
                <span v-if="loadingIps.has(ip.ip)" class="location-loading">
                  <span class="mini-spinner"></span>
                  Loading...
                </span>
                <!-- Error state -->
                <span v-else-if="ipErrors.get(ip.ip)" class="location-error" :title="ipErrors.get(ip.ip)">
                  {{ ipErrors.get(ip.ip) }}
                </span>
                <!-- Location data -->
                <div v-else-if="ipLocations.get(ip.ip)" class="location-info">
                  <span class="location-emoji" v-if="ipLocations.get(ip.ip)?.location?.country_emoji">
                    {{ ipLocations.get(ip.ip)?.location?.country_emoji }}
                  </span>
                  <span class="location-text">
                    {{ formatLocation(ipLocations.get(ip.ip)!) }}
                  </span>
                  <span v-if="ipLocations.get(ip.ip)?.isp" class="location-isp" :title="ipLocations.get(ip.ip)?.isp">
                    ({{ truncate(ipLocations.get(ip.ip)?.isp || '', 20) }})
                  </span>
                </div>
                <!-- Get Location button -->
                <button
                  v-else
                  class="btn-get-location"
                  @click="fetchLocation(ip.ip)"
                  title="Fetch geolocation data for this IP"
                >
                  Get Location
                </button>
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
        <span>This data comes from the <code>account_ip</code> table. Location lookups use ipgeolocation.io (limited to 1000 requests/day).</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import { api, type IpGeolocation } from '../../../services/api';

const store = useCharacterAdminStore();
const currentPage = ref(1);
const ITEMS_PER_PAGE = 10;

// Track location data, loading states, and errors per IP
const ipLocations = reactive(new Map<string, IpGeolocation>());
const loadingIps = reactive(new Set<string>());
const ipErrors = reactive(new Map<string, string>());

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
  return new Date(dateStr).toLocaleString();
}

function formatLocation(geo: IpGeolocation): string {
  const loc = geo.location;
  if (!loc) return 'Unknown';

  const parts: string[] = [];
  if (loc.city) parts.push(loc.city);
  if (loc.state_prov && loc.state_prov !== loc.city) parts.push(loc.state_prov);
  if (loc.country_name) parts.push(loc.country_name);
  return parts.join(', ') || 'Unknown';
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

async function fetchLocation(ip: string) {
  if (loadingIps.has(ip) || ipLocations.has(ip)) return;

  loadingIps.add(ip);
  ipErrors.delete(ip);

  try {
    const data = await api.getIpGeolocation(ip);
    ipLocations.set(ip, data);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message :
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      'Failed to fetch location';
    ipErrors.set(ip, errorMessage);
  } finally {
    loadingIps.delete(ip);
  }
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

  .col-location {
    min-width: 180px;
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

.btn-get-location {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.35rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #334155;
    color: #e2e8f0;
    border-color: #475569;
  }
}

.location-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #94a3b8;
  font-size: 0.75rem;
}

.mini-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.location-error {
  color: #f87171;
  font-size: 0.75rem;
}

.location-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.location-emoji {
  font-size: 1rem;
  line-height: 1;
}

.location-text {
  color: #e2e8f0;
}

.location-isp {
  color: #64748b;
  font-size: 0.7rem;
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
