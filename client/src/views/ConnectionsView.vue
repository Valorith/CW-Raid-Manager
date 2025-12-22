<template>
  <section class="connections">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Server Connections</h1>
        <p class="muted">Currently connected characters on the EQEmu server.</p>
      </div>
      <div class="section-header__actions">
        <router-link to="/admin" class="btn btn--outline">
          Back to Admin
        </router-link>
        <button
          type="button"
          class="btn btn--outline"
          :disabled="loading"
          @click="refreshConnections"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="connections-stats">
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">Players Online</span>
        <strong class="stat-card__value">{{ connections.length }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Unique Zones</span>
        <strong class="stat-card__value">{{ uniqueZones }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Guilded Players</span>
        <strong class="stat-card__value">{{ guildedCount }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Auto-Refresh</span>
        <strong class="stat-card__value">{{ autoRefreshEnabled ? 'ON' : 'OFF' }}</strong>
        <button
          type="button"
          class="stat-card__toggle"
          @click="toggleAutoRefresh"
        >
          {{ autoRefreshEnabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>

    <article class="card">
      <header class="card__header">
        <div>
          <h2>Connected Characters</h2>
          <span class="muted small">{{ filteredConnections.length }} characters</span>
        </div>
        <input
          v-model="searchQuery"
          type="search"
          class="input input--search"
          placeholder="Search by name, zone, or guild..."
        />
      </header>

      <p v-if="loading && connections.length === 0" class="muted loading-message">
        Loading connections...
      </p>
      <p v-else-if="error" class="error-message">
        {{ error }}
      </p>
      <p v-else-if="filteredConnections.length === 0" class="muted empty-message">
        {{ searchQuery ? 'No characters match your search.' : 'No characters currently connected.' }}
      </p>

      <div v-else class="table-wrapper">
        <table class="connections-table">
          <thead>
            <tr>
              <th class="col-class">Class</th>
              <th class="col-name">Character</th>
              <th class="col-level">Level</th>
              <th class="col-zone">Zone</th>
              <th class="col-guild">Guild</th>
              <th class="col-ip">IP Address</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(conn, index) in paginatedConnections" :key="`${conn.connectId}-${index}`">
              <td class="col-class">
                <div class="class-cell">
                  <img
                    v-if="getClassIcon(conn.className)"
                    :src="getClassIcon(conn.className) ?? undefined"
                    :alt="formatClass(conn.className)"
                    class="class-icon"
                  />
                  <span class="class-label">{{ formatClass(conn.className) }}</span>
                </div>
              </td>
              <td class="col-name">
                <CharacterLink :name="conn.characterName" />
              </td>
              <td class="col-level">{{ conn.level }}</td>
              <td class="col-zone">{{ conn.zoneName }}</td>
              <td class="col-guild">
                <span v-if="conn.guildName" class="guild-tag">{{ conn.guildName }}</span>
                <span v-else class="muted">-</span>
              </td>
              <td class="col-ip">
                <code class="ip-address">{{ conn.ip }}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          class="pagination__button"
          :disabled="currentPage === 1"
          @click="setPage(currentPage - 1)"
        >
          Previous
        </button>
        <span class="pagination__label">Page {{ currentPage }} of {{ totalPages }}</span>
        <button
          class="pagination__button"
          :disabled="currentPage === totalPages"
          @click="setPage(currentPage + 1)"
        >
          Next
        </button>
      </div>
    </article>

    <p v-if="lastUpdated" class="last-updated muted small">
      Last updated: {{ formatLastUpdated }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CharacterLink from '../components/CharacterLink.vue';
import { api, type ServerConnection } from '../services/api';
import { characterClassLabels, characterClassIcons, type CharacterClass } from '../services/types';

const connections = ref<ServerConnection[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const currentPage = ref(1);
const itemsPerPage = 25;
const autoRefreshEnabled = ref(true);
const lastUpdated = ref<Date | null>(null);

let refreshInterval: ReturnType<typeof setInterval> | null = null;
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

const filteredConnections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return connections.value;
  }

  return connections.value.filter((conn) => {
    return (
      conn.characterName.toLowerCase().includes(query) ||
      conn.zoneName.toLowerCase().includes(query) ||
      (conn.guildName && conn.guildName.toLowerCase().includes(query)) ||
      conn.ip.includes(query)
    );
  });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredConnections.value.length / itemsPerPage))
);

const paginatedConnections = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredConnections.value.slice(start, start + itemsPerPage);
});

const uniqueZones = computed(() => {
  const zones = new Set(connections.value.map((c) => c.zoneName));
  return zones.size;
});

const guildedCount = computed(() => {
  return connections.value.filter((c) => c.guildName).length;
});

const formatLastUpdated = computed(() => {
  if (!lastUpdated.value) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(lastUpdated.value);
});

function getClassIcon(className: string): string | null {
  return characterClassIcons[className as CharacterClass] ?? null;
}

function formatClass(className: string): string {
  return characterClassLabels[className as CharacterClass] ?? className;
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

async function loadConnections() {
  loading.value = true;
  error.value = null;
  try {
    connections.value = await api.fetchAdminConnections();
    lastUpdated.value = new Date();
  } catch (err) {
    console.error('Failed to load connections:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load server connections.';
  } finally {
    loading.value = false;
  }
}

async function refreshConnections() {
  await loadConnections();
}

function toggleAutoRefresh() {
  autoRefreshEnabled.value = !autoRefreshEnabled.value;
  if (autoRefreshEnabled.value) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    if (!loading.value) {
      loadConnections();
    }
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

onMounted(async () => {
  await loadConnections();
  if (autoRefreshEnabled.value) {
    startAutoRefresh();
  }
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<style scoped>
.connections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-bottom: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.section-header__titles h1 {
  margin: 0;
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.section-header__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.connections-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.45);
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 18px 40px rgba(59, 130, 246, 0.2);
}

.stat-card--accent {
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18));
}

.stat-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(226, 232, 240, 0.8);
}

.stat-card__value {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.stat-card__toggle {
  margin-top: 0.5rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 0.5rem;
  color: #bae6fd;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.stat-card__toggle:hover {
  background: rgba(59, 130, 246, 0.35);
  border-color: rgba(59, 130, 246, 0.6);
}

.card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.card__header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #e2e8f0;
}

.input--search {
  width: 280px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input--search:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.table-wrapper {
  overflow-x: auto;
}

.connections-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.connections-table th,
.connections-table td {
  padding: 0.85rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.connections-table th {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
  background: rgba(15, 23, 42, 0.5);
  position: sticky;
  top: 0;
}

.connections-table tbody tr {
  transition: background 0.15s ease;
}

.connections-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.col-class {
  width: 100px;
}

.col-name {
  min-width: 140px;
}

.col-level {
  width: 70px;
  text-align: center;
}

.col-zone {
  min-width: 180px;
}

.col-guild {
  min-width: 140px;
}

.col-ip {
  width: 130px;
}

.class-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.class-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: contain;
}

.class-label {
  font-weight: 600;
  color: #bfdbfe;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.guild-tag {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.ip-address {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.9);
  background: rgba(15, 23, 42, 0.5);
  padding: 0.2rem 0.4rem;
  border-radius: 0.35rem;
}

.loading-message,
.empty-message {
  padding: 2rem;
  text-align: center;
}

.error-message {
  padding: 1rem;
  text-align: center;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.75rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
  transform: translateY(-1px);
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.last-updated {
  text-align: center;
}

.btn {
  padding: 0.55rem 1rem;
  border-radius: 0.65rem;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .input--search {
    width: 100%;
  }

  .col-ip {
    display: none;
  }
}
</style>
