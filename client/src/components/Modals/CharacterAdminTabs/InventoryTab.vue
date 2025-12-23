<template>
  <div class="inventory-tab">
    <div class="inventory-info">
      <p>View the full inventory for <strong>{{ store.character?.name }}</strong></p>
      <p class="info-hint">
        The inventory viewer shows all equipped items, bags, bank slots, and their contents.
      </p>
    </div>

    <div class="inventory-actions">
      <button class="btn btn--primary" @click="openInventoryModal">
        Open Inventory Viewer
      </button>
    </div>

    <div class="inventory-note">
      <strong>Note:</strong> The inventory viewer will open in a separate modal window.
      This uses the same inventory viewer available throughout the application.
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import { useGuildBankStore } from '../../../stores/guildBank';

const store = useCharacterAdminStore();
const guildBankStore = useGuildBankStore();

function openInventoryModal() {
  if (!store.character) return;

  // Use the guild bank store's direct character inventory lookup
  // This works for any character, not just guild bank characters
  guildBankStore.openCharacterInventory(
    store.character.name,
    '' // Empty guildId triggers direct lookup
  );
}
</script>

<style scoped lang="scss">
.inventory-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
}

.inventory-info {
  text-align: center;

  p {
    margin: 0 0 0.5rem;
    color: #e2e8f0;

    strong {
      color: #f8fafc;
    }
  }

  .info-hint {
    font-size: 0.875rem;
    color: #94a3b8;
  }
}

.inventory-actions {
  display: flex;
  justify-content: center;
}

.btn {
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.15s ease;

  &--primary {
    background: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
  }
}

.inventory-note {
  text-align: center;
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #64748b;

  strong {
    color: #94a3b8;
  }
}
</style>
