<template>
  <div v-if="store.isOpen" class="modal-backdrop" @click.self="close">
    <div class="modal character-admin-modal">
      <!-- Header -->
      <div class="modal__header">
        <div class="modal__header-content">
          <p class="eyebrow">Character Admin</p>
          <h3 v-if="store.character">
            {{ store.character.name }}
            <span class="character-meta">
              Level {{ store.character.level }} {{ store.character.className }}
            </span>
          </h3>
          <h3 v-else-if="store.characterLoading">Loading...</h3>
          <h3 v-else-if="store.characterError">Error</h3>
        </div>
        <button class="icon-button" @click="close" aria-label="Close modal">
          <span class="icon-button__glyph">&times;</span>
        </button>
      </div>

      <!-- Character Info Bar -->
      <div v-if="store.character" class="character-info-bar">
        <div class="info-item">
          <span class="info-label">Zone:</span>
          <span class="info-value">{{ store.character.zoneName }}</span>
        </div>
        <div class="info-item" v-if="store.character.guildName">
          <span class="info-label">Guild:</span>
          <span class="info-value">{{ store.character.guildName }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Race:</span>
          <span class="info-value">{{ store.character.race }} {{ store.character.gender }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Account ID:</span>
          <span class="info-value">{{ store.character.accountId }}</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="modal__tabs">
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'events' }"
          @click="store.setActiveTab('events')"
        >
          Events
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'associates' }"
          @click="store.setActiveTab('associates')"
        >
          Associates
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'account' }"
          @click="store.setActiveTab('account')"
        >
          Account
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'corpses' }"
          @click="store.setActiveTab('corpses')"
        >
          Corpses
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'notes' }"
          @click="store.setActiveTab('notes')"
        >
          Notes
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': store.activeTab === 'inventory' }"
          @click="store.setActiveTab('inventory')"
        >
          Inventory
        </button>
      </div>

      <!-- Tab Content -->
      <div class="modal__body">
        <!-- Loading State -->
        <div v-if="store.characterLoading" class="loading-state">
          <span class="loading-spinner"></span>
          <p>Loading character...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="store.characterError" class="error-state">
          <p class="error-message">{{ store.characterError }}</p>
        </div>

        <!-- Tab Panels -->
        <template v-else-if="store.character">
          <!-- Events Tab -->
          <div v-if="store.activeTab === 'events'" class="tab-panel">
            <EventsTab />
          </div>

          <!-- Associates Tab -->
          <div v-else-if="store.activeTab === 'associates'" class="tab-panel">
            <AssociatesTab />
          </div>

          <!-- Account Tab -->
          <div v-else-if="store.activeTab === 'account'" class="tab-panel">
            <AccountTab />
          </div>

          <!-- Corpses Tab -->
          <div v-else-if="store.activeTab === 'corpses'" class="tab-panel">
            <CorpsesTab />
          </div>

          <!-- Notes Tab -->
          <div v-else-if="store.activeTab === 'notes'" class="tab-panel">
            <NotesTab />
          </div>

          <!-- Inventory Tab -->
          <div v-else-if="store.activeTab === 'inventory'" class="tab-panel">
            <InventoryTab />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCharacterAdminStore } from '../../stores/characterAdmin';
import EventsTab from './CharacterAdminTabs/EventsTab.vue';
import AssociatesTab from './CharacterAdminTabs/AssociatesTab.vue';
import AccountTab from './CharacterAdminTabs/AccountTab.vue';
import CorpsesTab from './CharacterAdminTabs/CorpsesTab.vue';
import NotesTab from './CharacterAdminTabs/NotesTab.vue';
import InventoryTab from './CharacterAdminTabs/InventoryTab.vue';

const store = useCharacterAdminStore();

function close() {
  store.close();
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;
}

.character-admin-modal {
  background: #1e293b;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #334155;
  background: #0f172a;
}

.modal__header-content .eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin: 0 0 0.25rem;
}

.modal__header-content h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #f8fafc;
}

.character-meta {
  font-size: 0.875rem;
  color: #94a3b8;
  font-weight: normal;
  margin-left: 0.5rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1.5rem;
  line-height: 1;
}

.icon-button:hover {
  color: #f8fafc;
}

.icon-button__glyph {
  display: block;
}

.character-info-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  padding: 0.75rem 1.5rem;
  background: #0f172a;
  border-bottom: none;
  flex-shrink: 0;
}

.info-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.info-label {
  color: #64748b;
}

.info-value {
  color: #e2e8f0;
}

.modal__tabs {
  display: flex;
  gap: 0;
  padding: 0 1.5rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  border-top: 1px solid #334155;
  overflow-x: auto;
  flex-shrink: 0;
}

.tab-button {
  background: transparent;
  border: none;
  padding: 0.75rem 1rem;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.tab-button:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.05);
}

.tab-button--active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  min-height: 400px;
}

.tab-panel {
  height: 100%;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.error-message {
  color: #ef4444;
  margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .character-admin-modal {
    max-height: 100vh;
    border-radius: 0;
  }

  .modal__header {
    padding: 1rem;
  }

  .character-info-bar {
    padding: 0.5rem 1rem;
    gap: 0.5rem 1rem;
    font-size: 0.75rem;
  }

  .modal__tabs {
    padding: 0 1rem;
  }

  .tab-button {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
  }

  .modal__body {
    padding: 1rem;
  }
}
</style>
