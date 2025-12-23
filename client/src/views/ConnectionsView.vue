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
        <span class="stat-card__label">Unique IPs</span>
        <strong class="stat-card__value">{{ uniqueIps }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Unique Zones</span>
        <strong class="stat-card__value">{{ uniqueZones }}</strong>
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
          <span class="muted small">{{ filteredConnections.length }} characters from {{ filteredIpGroups.length }} IPs</span>
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

      <div v-else class="ip-groups">
        <div
          v-for="group in paginatedIpGroups"
          :key="group.ip"
          class="ip-group"
        >
          <div class="ip-group__header">
            <div class="ip-group__left">
              <code class="ip-address">{{ group.ip }}</code>
              <span class="ip-group__count">{{ group.connections.length }} character{{ group.connections.length !== 1 ? 's' : '' }}</span>
            </div>
            <span
              class="ip-group__outside-count"
              :class="{
                'ip-group__outside-count--warning': getOutsideHomeCount(group) > 0 && getOutsideHomeCount(group) <= getIpLimit(group.ip),
                'ip-group__outside-count--danger': getOutsideHomeCount(group) > getIpLimit(group.ip)
              }"
            >
              Active: {{ getOutsideHomeCount(group) }}/{{ getIpLimit(group.ip) }}
            </span>
          </div>
          <div class="table-wrapper">
            <table class="connections-table">
              <thead>
                <tr>
                  <th class="col-class">Class</th>
                  <th class="col-name">Character</th>
                  <th class="col-level">Level</th>
                  <th class="col-zone">Zone</th>
                  <th class="col-guild">Guild</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(conn, index) in group.connections"
                  :key="`${conn.connectId}-${index}`"
                  :class="getRowClass(conn, group)"
                >
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
                    <CharacterLink :name="conn.characterName" :admin-mode="true" />
                  </td>
                  <td class="col-level">{{ conn.level }}</td>
                  <td class="col-zone">{{ conn.zoneName }}</td>
                  <td class="col-guild">
                    <span v-if="conn.guildName" class="guild-tag">{{ conn.guildName }}</span>
                    <span v-else class="muted">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
import { api, type ServerConnection, type IpExemption } from '../services/api';
import { characterClassLabels, characterClassIcons, type CharacterClass } from '../services/types';
import { useCharacterAdminStore } from '../stores/characterAdmin';

const DEFAULT_OUTSIDE_LIMIT = 2;

// Use shared watch list from characterAdmin store
const characterAdminStore = useCharacterAdminStore();
// Orange border: directly watched characters
const watchedCharacterIds = computed(() => new Set(characterAdminStore.fullWatchList.map(w => w.eqCharacterId)));
// Orange border: characters on the same account as watched characters
const watchedAccountIds = computed(() => new Set(characterAdminStore.fullWatchList.map(w => w.eqAccountId)));
// Yellow border: characters associated via IP with watched characters
const associatedCharacterIds = computed(() => new Set(characterAdminStore.associatedCharacterIds));

interface IpGroup {
  ip: string;
  connections: ServerConnection[];
}

const connections = ref<ServerConnection[]>([]);
const ipExemptions = ref<IpExemption[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const currentPage = ref(1);
const itemsPerPage = 10; // Groups per page
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

const filteredIpGroups = computed((): IpGroup[] => {
  const groupMap = new Map<string, ServerConnection[]>();

  for (const conn of filteredConnections.value) {
    const existing = groupMap.get(conn.ip);
    if (existing) {
      existing.push(conn);
    } else {
      groupMap.set(conn.ip, [conn]);
    }
  }

  // Sort groups by number of connections (descending), then by IP
  return Array.from(groupMap.entries())
    .map(([ip, conns]) => ({ ip, connections: conns }))
    .sort((a, b) => {
      if (b.connections.length !== a.connections.length) {
        return b.connections.length - a.connections.length;
      }
      return a.ip.localeCompare(b.ip);
    });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredIpGroups.value.length / itemsPerPage))
);

const paginatedIpGroups = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredIpGroups.value.slice(start, start + itemsPerPage);
});

const uniqueIps = computed(() => {
  const ips = new Set(connections.value.map((c) => c.ip));
  return ips.size;
});

const uniqueZones = computed(() => {
  const zones = new Set(connections.value.map((c) => c.zoneName));
  return zones.size;
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

const INACTIVE_ZONES = ["Clumsy's Home", "The Bazaar"];

function isOutsideHome(conn: ServerConnection): boolean {
  return !INACTIVE_ZONES.includes(conn.zoneName);
}

function getOutsideHomeCount(group: IpGroup): number {
  return group.connections.filter(isOutsideHome).length;
}

function getIpLimit(ip: string): number {
  const exemption = ipExemptions.value.find((e) => e.ip === ip);
  return exemption ? exemption.exemptionAmount : DEFAULT_OUTSIDE_LIMIT;
}

function getRowClass(conn: ServerConnection, group: IpGroup): string {
  const classes: string[] = [];

  // Check watch status:
  // Orange: directly watched OR same account as watched
  // Yellow: associated via IP (from CharacterAssociation table)
  if (watchedCharacterIds.value.has(conn.characterId) || watchedAccountIds.value.has(conn.accountId)) {
    classes.push('row--watched');
  } else if (associatedCharacterIds.value.has(conn.characterId)) {
    classes.push('row--watched-associated');
  }

  if (!isOutsideHome(conn)) {
    return classes.join(' '); // In home zone, only watched styling if applicable
  }

  const outsideCount = getOutsideHomeCount(group);
  const limit = getIpLimit(group.ip);
  if (outsideCount > limit) {
    classes.push('row--danger'); // Red theme: exceeds limit for this IP
  } else {
    classes.push('row--warning'); // Green theme: within limit for this IP
  }

  return classes.join(' ');
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

async function loadConnections() {
  loading.value = true;
  error.value = null;
  try {
    const response = await api.fetchAdminConnections();
    connections.value = response.connections;
    ipExemptions.value = response.ipExemptions;
    lastUpdated.value = new Date();

    // Sync IP group associations in the background
    syncIpAssociations(response.connections);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load server connections.';
  } finally {
    loading.value = false;
  }
}

async function syncIpAssociations(conns: typeof connections.value) {
  // Only sync if there are multi-account IP groups
  const ipGroups = new Map<string, typeof conns>();
  for (const conn of conns) {
    const existing = ipGroups.get(conn.ip);
    if (existing) {
      existing.push(conn);
    } else {
      ipGroups.set(conn.ip, [conn]);
    }
  }

  // Check if any IP group has multiple accounts
  let hasMultiAccountGroup = false;
  for (const group of ipGroups.values()) {
    const uniqueAccounts = new Set(group.map(c => c.accountId));
    if (uniqueAccounts.size > 1) {
      hasMultiAccountGroup = true;
      break;
    }
  }

  if (!hasMultiAccountGroup) {
    return;
  }

  // Sync associations
  try {
    await api.syncIpGroupAssociations(
      conns.map(c => ({
        characterId: c.characterId,
        characterName: c.characterName,
        accountId: c.accountId,
        ip: c.ip
      }))
    );
  } catch (err) {
    console.error('Failed to sync IP group associations:', err);
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
  // Load connections and watch list (from shared store)
  await Promise.all([
    loadConnections(),
    characterAdminStore.watchListLoaded ? Promise.resolve() : characterAdminStore.loadWatchList()
  ]);
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

.ip-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ip-group {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
  overflow: hidden;
}

.ip-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.ip-group__left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ip-group__count {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ip-group__outside-count {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.ip-group__outside-count--warning {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.ip-group__outside-count--danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
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
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.connections-table th {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.3);
}

.connections-table tbody tr {
  transition: background 0.15s ease;
}

.connections-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.connections-table tbody tr.row--warning {
  background: rgba(34, 197, 94, 0.12);
  border-left: 3px solid rgba(34, 197, 94, 0.6);
}

.connections-table tbody tr.row--warning:hover {
  background: rgba(34, 197, 94, 0.2);
}

.connections-table tbody tr.row--warning td {
  color: #86efac;
}

.connections-table tbody tr.row--danger {
  background: rgba(239, 68, 68, 0.12);
  border-left: 3px solid rgba(239, 68, 68, 0.6);
}

.connections-table tbody tr.row--danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.connections-table tbody tr.row--danger td {
  color: #fca5a5;
}

/* Watched character styling - pulsing orange (using box-shadow for table compatibility) */
.connections-table tbody tr.row--watched {
  animation: watchPulse 2s ease-in-out infinite;
}

.connections-table tbody tr.row--watched td {
  box-shadow: inset 0 2px 0 rgba(249, 115, 22, 0.6), inset 0 -2px 0 rgba(249, 115, 22, 0.6);
}

.connections-table tbody tr.row--watched td:first-child {
  box-shadow: inset 3px 2px 0 rgba(249, 115, 22, 0.6), inset 0 -2px 0 rgba(249, 115, 22, 0.6);
}

.connections-table tbody tr.row--watched td:last-child {
  box-shadow: inset 0 2px 0 rgba(249, 115, 22, 0.6), inset -3px -2px 0 rgba(249, 115, 22, 0.6);
}

@keyframes watchPulse {
  0%, 100% {
    background-color: rgba(249, 115, 22, 0.08);
  }
  50% {
    background-color: rgba(249, 115, 22, 0.18);
  }
}

/* Associated character styling - pulsing yellow */
.connections-table tbody tr.row--watched-associated {
  animation: watchAssociatedPulse 2s ease-in-out infinite;
}

.connections-table tbody tr.row--watched-associated td {
  box-shadow: inset 0 2px 0 rgba(234, 179, 8, 0.6), inset 0 -2px 0 rgba(234, 179, 8, 0.6);
}

.connections-table tbody tr.row--watched-associated td:first-child {
  box-shadow: inset 3px 2px 0 rgba(234, 179, 8, 0.6), inset 0 -2px 0 rgba(234, 179, 8, 0.6);
}

.connections-table tbody tr.row--watched-associated td:last-child {
  box-shadow: inset 0 2px 0 rgba(234, 179, 8, 0.6), inset -3px -2px 0 rgba(234, 179, 8, 0.6);
}

@keyframes watchAssociatedPulse {
  0%, 100% {
    background-color: rgba(234, 179, 8, 0.08);
  }
  50% {
    background-color: rgba(234, 179, 8, 0.18);
  }
}

.connections-table tbody tr:last-child td {
  border-bottom: none;
}

.col-class {
  width: 90px;
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

.class-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.class-icon {
  width: 22px;
  height: 22px;
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
  font-size: 0.85rem;
  color: #e2e8f0;
  background: rgba(59, 130, 246, 0.15);
  padding: 0.3rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(59, 130, 246, 0.25);
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

  .section-header__titles h1 {
    font-size: 1.4rem;
  }

  .section-header__actions {
    width: 100%;
  }

  .section-header__actions .btn {
    flex: 1;
  }

  .card {
    padding: 1rem;
  }

  .card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .input--search {
    width: 100%;
  }

  .ip-group__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .ip-group__left {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
  }

  .ip-address {
    font-size: 0.75rem;
  }

  .connections-table {
    font-size: 0.8rem;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.5rem 0.5rem;
  }

  .col-class {
    width: 70px;
  }

  .class-label {
    display: none;
  }

  .class-icon {
    width: 20px;
    height: 20px;
  }

  .col-level {
    width: 50px;
  }

  .col-zone {
    min-width: 120px;
  }

  .col-guild {
    min-width: 100px;
  }

  .guild-tag {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
  }

  .pagination {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination__button {
    padding: 0.4rem 0.7rem;
    font-size: 0.65rem;
  }

  .pagination__label {
    width: 100%;
    text-align: center;
    order: -1;
    font-size: 0.75rem;
  }

  .stat-card__value {
    font-size: 1.4rem;
  }
}

@media (max-width: 480px) {
  .connections {
    gap: 1rem;
  }

  .section-header__titles h1 {
    font-size: 1.2rem;
  }

  .connections-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-card {
    padding: 0.75rem;
  }

  .stat-card__label {
    font-size: 0.65rem;
  }

  .stat-card__value {
    font-size: 1.2rem;
  }

  .card {
    padding: 0.75rem;
    border-radius: 0.75rem;
  }

  .card__header h2 {
    font-size: 1rem;
  }

  .ip-group {
    border-radius: 0.5rem;
  }

  .ip-group__header {
    padding: 0.5rem 0.75rem;
  }

  .connections-table {
    font-size: 0.75rem;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.4rem 0.35rem;
  }

  .connections-table th {
    font-size: 0.6rem;
  }

  .col-guild {
    display: none;
  }

  .class-icon {
    width: 18px;
    height: 18px;
  }

  .ip-address {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
  }

  .ip-group__count {
    font-size: 0.65rem;
  }

  .ip-group__outside-count {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
  }
}

@media (max-width: 360px) {
  .section-header__actions {
    flex-direction: column;
  }

  .connections-stats {
    grid-template-columns: 1fr;
  }

  .col-zone {
    min-width: 80px;
  }

  .connections-table th,
  .connections-table td {
    padding: 0.35rem 0.25rem;
  }
}
</style>
