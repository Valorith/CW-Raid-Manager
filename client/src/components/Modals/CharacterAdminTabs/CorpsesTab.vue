<template>
  <div class="corpses-tab">
    <!-- Loading -->
    <div v-if="store.corpsesLoading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading corpses...</p>
    </div>

    <!-- Corpses Table -->
    <template v-else>
      <div class="corpses-summary">
        {{ store.corpses.length }} corpse{{ store.corpses.length !== 1 ? 's' : '' }} found
      </div>

      <div class="corpses-table-wrapper">
        <table class="corpses-table" v-if="store.corpses.length > 0">
          <thead>
            <tr>
              <th>Time of Death</th>
              <th>Zone</th>
              <th>Location</th>
              <th>Status</th>
              <th>Items</th>
              <th>Money</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="corpse in store.corpses" :key="corpse.id">
              <td class="col-time">{{ formatDate(corpse.timeofdeath) }}</td>
              <td class="col-zone">
                {{ corpse.zoneName }}
                <span v-if="corpse.instanceId" class="instance-badge">
                  Instance {{ corpse.instanceId }}
                </span>
              </td>
              <td class="col-location">
                <span class="coords">
                  {{ formatCoord(corpse.x) }}, {{ formatCoord(corpse.y) }}, {{ formatCoord(corpse.z) }}
                </span>
              </td>
              <td class="col-status">
                <div class="status-flags">
                  <span v-if="corpse.isRezzed" class="status-flag status-flag--success">Rezzed</span>
                  <span v-if="corpse.isBuried" class="status-flag status-flag--warning">Buried</span>
                  <span v-if="corpse.wasAtGraveyard" class="status-flag status-flag--info">Graveyard</span>
                  <span v-if="!corpse.isRezzed && !corpse.isBuried" class="status-flag status-flag--neutral">
                    Active
                  </span>
                </div>
              </td>
              <td class="col-items">
                <span v-if="corpse.itemCount > 0" class="item-count">
                  {{ corpse.itemCount }} item{{ corpse.itemCount !== 1 ? 's' : '' }}
                </span>
                <span v-else class="no-items">Empty</span>
              </td>
              <td class="col-money">
                <span v-if="hasMoney(corpse)" class="money-display">
                  <span v-if="corpse.platinum" class="plat">{{ corpse.platinum }}p</span>
                  <span v-if="corpse.gold" class="gold">{{ corpse.gold }}g</span>
                  <span v-if="corpse.silver" class="silver">{{ corpse.silver }}s</span>
                  <span v-if="corpse.copper" class="copper">{{ corpse.copper }}c</span>
                </span>
                <span v-else class="no-money">-</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else class="no-data">
          No corpses found for this character
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import type { CharacterCorpse } from '../../../services/api';

const store = useCharacterAdminStore();

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function formatCoord(val: number): string {
  return val.toFixed(1);
}

function hasMoney(corpse: CharacterCorpse): boolean {
  return corpse.platinum > 0 || corpse.gold > 0 || corpse.silver > 0 || corpse.copper > 0;
}
</script>

<style scoped lang="scss">
.corpses-tab {
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

.corpses-summary {
  font-size: 0.875rem;
  color: #94a3b8;
}

.corpses-table-wrapper {
  overflow-x: auto;
}

.corpses-table {
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

  .col-time {
    white-space: nowrap;
    color: #94a3b8;
    font-size: 0.75rem;
  }

  .col-zone {
    white-space: nowrap;
  }

  .col-location {
    white-space: nowrap;
  }
}

.instance-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.125rem 0.375rem;
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  text-transform: uppercase;
}

.coords {
  font-family: monospace;
  font-size: 0.75rem;
  color: #64748b;
}

.status-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.status-flag {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;

  &--success {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  &--warning {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  &--info {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  &--neutral {
    background: rgba(100, 116, 139, 0.2);
    color: #94a3b8;
  }
}

.item-count {
  color: #e2e8f0;
}

.no-items {
  color: #64748b;
}

.money-display {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;

  .plat {
    color: #e2e8f0;
  }

  .gold {
    color: #fbbf24;
  }

  .silver {
    color: #94a3b8;
  }

  .copper {
    color: #cd7f32;
  }
}

.no-money {
  color: #475569;
}

.no-data {
  text-align: center;
  padding: 3rem;
  color: #64748b;
  background: #0f172a;
  border-radius: 0.5rem;
}
</style>
