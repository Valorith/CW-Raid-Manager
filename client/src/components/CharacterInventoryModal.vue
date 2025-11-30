<template>
  <div v-if="store.modalState.open" class="modal-backdrop" @click.self="close">
    <div class="modal inventory-modal">
      <div class="modal__header">
        <div>
          <p class="eyebrow">Character Inventory</p>
          <h3>{{ store.modalState.characterName }}</h3>
        </div>
        <button class="icon-button" @click="close" aria-label="Close modal">
          <span class="icon-button__glyph">×</span>
        </button>
      </div>

      <div class="modal__body" v-if="characterItem">
        <div class="inventory-visual">
          <div class="eq-window">
            <div class="eq-window__header">
              <div class="eq-window__title">
                <span class="eq-window__dot"></span>
                <strong>{{ characterItem.name }}</strong>
                <span class="eq-window__subtitle">
                  {{ characterItem.isPersonal ? 'Personal character' : 'Guild bank character' }}
                </span>
              </div>
              <span class="eq-window__badge">Inventory</span>
            </div>
            <div class="eq-window__content">
              <div class="eq-main-container">
                <!-- Unified Inventory Grid (Worn + General) -->
                <div class="eq-split-layout">
                  <div class="eq-left-pane">
                    <div class="eq-inventory-inner-layout">
                      <!-- Worn Items Grid (4x8) -->
                      <div class="eq-worn-container">
                        <div
                          class="eq-class-icon"
                          :style="{ backgroundImage: `url(${getClassIconUrl(characterItem.class)})` }"
                        ></div>
                        <div class="eq-worn-grid">
                          <div 
                            v-for="(slot, index) in customWornSlotsUi" 
                            :key="index"
                            class="eq-slot-wrapper"
                            :style="{ gridRow: slot.row, gridColumn: slot.col }"
                          >
                            <div
                              class="eq-slot eq-slot--worn"
                              :class="[
                                `eq-slot--${slot.key}`,
                                { 'eq-slot--active': isSlotHighlighted(slot.slotId) }
                              ]"
                              @mouseenter="showItemTooltip($event, getWornItem(slot.slotId))"
                              @mousemove="updateTooltipPosition($event)"
                              @mouseleave="hideItemTooltip"
                              @contextmenu.stop.prevent="openContextMenu($event, getWornItem(slot.slotId))"
                            >
                              <img
                                v-if="getWornItem(slot.slotId)?.itemIconId"
                                :src="getLootIconSrc(getWornItem(slot.slotId)!.itemIconId!)"
                                class="eq-slot__icon"
                                alt=""
                              />
                              <div v-else-if="getWornItem(slot.slotId!)" class="eq-slot__placeholder">?</div>
                              <div v-else class="eq-slot__label">{{ slot.shortLabel || slot.label }}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- General Inventory Grid (2x5) -->
                      <div class="eq-general-container">
                        <div class="eq-general-grid">
                          <div
                            v-for="slot in generalSlotsUi"
                            :key="slot.slotId"
                            class="eq-inv-slot"
                            :class="{
                              'eq-inv-slot--active': isSlotHighlighted(slot.slotId),
                              'eq-inv-slot--selected': activeGeneralBagSlotId === slot.slotId
                            }"
                            @click="toggleBag(slot.slotId, 'general')"
                            @mouseenter="showItemTooltip($event, getGeneralItem(slot.slotId))"
                            @mousemove="updateTooltipPosition($event)"
                            @mouseleave="hideItemTooltip"
                            @contextmenu.stop.prevent="openContextMenu($event, getGeneralItem(slot.slotId))"
                          >
                            <div class="eq-inv-slot__inner">
                              <img
                                v-if="getGeneralItem(slot.slotId)?.itemIconId"
                                :src="getLootIconSrc(getGeneralItem(slot.slotId)!.itemIconId!)"
                                class="eq-inv-slot__icon"
                                alt=""
                              />
                              <span v-else-if="getGeneralItem(slot.slotId)" class="eq-inv-slot__icon eq-inv-slot__icon--placeholder">?</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Right Pane: Active Bag Contents -->
                  <div class="eq-right-pane">
                    <div v-if="activeGeneralBagSlotId" class="eq-bag-container">
                      <div class="eq-bag-header">
                        {{ getGeneralItem(activeGeneralBagSlotId)?.itemName || 'Bag' }}
                      </div>
                      <div class="eq-bag-grid">
                        <div
                          v-for="bagSlot in getBagContents(activeGeneralBagSlotId)"
                          :key="bagSlot.bagSlotIndex"
                          class="eq-bag-slot"
                          :class="{ 'eq-bag-slot--active': isBagSlotHighlighted(activeGeneralBagSlotId, bagSlot.bagSlotIndex) }"
                          @mouseenter="showItemTooltip($event, bagSlot.item)"
                          @mousemove="updateTooltipPosition($event)"
                          @mouseleave="hideItemTooltip"
                          @contextmenu.stop.prevent="openContextMenu($event, bagSlot.item)"
                        >
                           <div class="eq-bag-slot__inner">
                              <img
                                v-if="bagSlot.item?.itemIconId"
                                :src="getLootIconSrc(bagSlot.item.itemIconId)"
                                class="eq-bag-slot__icon"
                                alt=""
                              />
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            <!-- Bank Slots -->
            <div class="eq-window eq-window--bank">
              <div class="eq-window__header">
                <div class="eq-window__title">
                  <span class="eq-window__dot"></span>
                  <strong>{{ characterItem.name }}</strong>
                  <span class="eq-window__subtitle">Bank</span>
                </div>
                <span class="eq-window__badge">Bank</span>
              </div>
              <div class="eq-window__content eq-window__content--bank">
                <div class="eq-split-layout">
                  <div class="eq-left-pane">
                    <section class="inventory-visual__panel inventory-visual__panel--bank">
                      <div class="eq-panel__header">Bank Slots</div>
                      <div class="eq-bank-grid">
                        <div
                          v-for="slot in bankSlotsUi"
                          :key="slot.slotId"
                          class="eq-inv-slot eq-inv-slot--bank"
                          :class="{
                            'eq-inv-slot--active': isSlotHighlighted(slot.slotId),
                            'eq-inv-slot--selected': activeBankBagSlotId === slot.slotId
                          }"
                          @click="toggleBag(slot.slotId, 'bank')"
                          @mouseenter="showItemTooltip($event, getBankItem(slot.slotId))"
                          @mousemove="updateTooltipPosition($event)"
                          @mouseleave="hideItemTooltip"
                          @contextmenu.stop.prevent="openContextMenu($event, getBankItem(slot.slotId))"
                        >
                          <div class="eq-inv-slot__inner">
                            <img
                              v-if="getBankItem(slot.slotId)?.itemIconId"
                              :src="getLootIconSrc(getBankItem(slot.slotId)!.itemIconId!)"
                              class="eq-inv-slot__icon"
                              alt=""
                            />
                            <span v-else-if="getBankItem(slot.slotId)" class="eq-inv-slot__icon eq-inv-slot__icon--placeholder">?</span>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                  
                  <!-- Right Pane: Active Bank Bag -->
                  <div class="eq-right-pane">
                    <div v-if="activeBankBagSlotId" class="eq-bag-container">
                      <div class="eq-bag-header">
                        {{ getBankItem(activeBankBagSlotId)?.itemName || 'Bank Bag' }}
                      </div>
                      <div class="eq-bag-grid">
                        <div
                          v-for="bagSlot in getBagContents(activeBankBagSlotId)"
                          :key="bagSlot.bagSlotIndex"
                          class="eq-bag-slot"
                          :class="{ 'eq-bag-slot--active': isBagSlotHighlighted(activeBankBagSlotId, bagSlot.bagSlotIndex) }"
                          @mouseenter="showItemTooltip($event, bagSlot.item)"
                          @mousemove="updateTooltipPosition($event)"
                          @mouseleave="hideItemTooltip"
                          @contextmenu.stop.prevent="openContextMenu($event, bagSlot.item)"
                        >
                           <div class="eq-bag-slot__inner">
                              <img
                                v-if="bagSlot.item?.itemIconId"
                                :src="getLootIconSrc(bagSlot.item.itemIconId)"
                                class="eq-bag-slot__icon"
                                alt=""
                              />
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      <div class="modal__body" v-else>
        <p class="empty-state">Character data not found.</p>
      </div>

    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="loot-context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      >
        <button class="loot-context-menu__action" type="button" @click="openAlla">
          Lookup on Alla
        </button>
      </div>
    </Teleport>
  </div>
</template>



<style scoped>
/* ... (existing styles) */

/* Context Menu */
.loot-context-menu {
  position: fixed;
  z-index: 9999;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  min-width: 120px;
  overflow: hidden;
}

.loot-context-menu__action {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  text-align: left;
  background: none;
  border: none;
  color: #e2e8f0;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.1s;
}

.loot-context-menu__action:hover {
  background-color: #334155;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';
import type { GuildBankItem, CharacterClass } from '../services/api';
import { getLootIconSrc } from '../utils/itemIcons';
import {
  WORN_SLOT_LABELS,
  WORN_SLOT_KEYS,
  WORN_SLOT_SHORT_LABELS,
  GENERAL_SLOT_IDS,
  BANK_SLOT_IDS,
  resolveSlotPlacement
} from '../utils/inventory';

const store = useGuildBankStore();
const tooltipStore = useItemTooltipStore();

const close = () => {
  store.closeModal();
};

const generalSlotsUi = GENERAL_SLOT_IDS.map((slotId, index) => ({
  slotId,
  label: `General ${index + 1}`
}));

const customWornSlotsUi = computed(() => {
  const slots: Array<{
    type: 'worn';
    slotId: number;
    label: string;
    shortLabel: string;
    key: string;
    row: number;
    col: number;
  }> = [];

  // Helper to find slot by key
  const findSlot = (key: string, row: number, col: number) => {
    const index = WORN_SLOT_KEYS.indexOf(key);
    if (index === -1) return;
    slots.push({
      type: 'worn',
      slotId: index,
      label: WORN_SLOT_LABELS[index],
      shortLabel: WORN_SLOT_SHORT_LABELS[index],
      key: WORN_SLOT_KEYS[index],
      row,
      col
    });
  };

  // Row 1
  findSlot('ear1', 1, 1);
  findSlot('head', 1, 2);
  findSlot('face', 1, 3);
  findSlot('ear2', 1, 4);

  // Row 2
  findSlot('chest', 2, 1);
  findSlot('neck', 2, 4);

  // Row 3
  findSlot('arms', 3, 1);
  findSlot('back', 3, 4);

  // Row 4
  findSlot('waist', 4, 1);
  findSlot('shoulders', 4, 4);

  // Row 5
  findSlot('wrist1', 5, 1);
  findSlot('wrist2', 5, 4);

  // Row 6
  findSlot('legs', 6, 1);
  findSlot('hands', 6, 2);
  findSlot('charm', 6, 3);
  findSlot('feet', 6, 4);

  // Row 7
  findSlot('finger1', 7, 2);
  findSlot('finger2', 7, 3);
  findSlot('powersource', 7, 4);

  // Row 8
  findSlot('primary', 8, 1);
  findSlot('secondary', 8, 2);
  findSlot('range', 8, 3);
  findSlot('ammo', 8, 4);

  return slots;
});

const bankSlotsUi = BANK_SLOT_IDS.map((slotId, index) => ({
  slotId,
  label: `Bank ${index + 1}`
}));

const characterItem = computed(() => {
  if (!store.snapshot || !store.modalState.characterName) return null;
  return store.snapshot.characters.find(c => c.name.toLowerCase() === store.modalState.characterName?.toLowerCase());
});

const characterItemsMap = computed(() => {
  const map = new Map<number, GuildBankItem>();
  if (!store.snapshot || !store.modalState.characterName) return map;
  
  const targetName = store.modalState.characterName.toLowerCase();
  console.log('[CharacterInventoryModal] Looking up items for:', targetName);
  
  let matchCount = 0;
  for (const item of store.snapshot.items) {
    // Check for exact match or first name match
    const itemCharName = item.characterName.toLowerCase();
    const itemFirstName = itemCharName.split(' ')[0];
    
    if ((itemCharName === targetName || itemFirstName === targetName) && item.slotId != null) {
      map.set(item.slotId, item);
      matchCount++;
    }
  }
  console.log(`[CharacterInventoryModal] Found ${matchCount} items for ${targetName}`);
  return map;
});

const bagContentsMap = computed(() => {
  const map = new Map<number, Array<{ item: GuildBankItem; bagSlotIndex: number }>>();
  for (const item of characterItemsMap.value.values()) {
    if (item.slotId == null) continue;
    const resolved = resolveSlotPlacement(item.slotId);
    if (resolved.parentSlotId != null && resolved.bagSlotIndex != null) {
      const existing = map.get(resolved.parentSlotId) || [];
      existing.push({ item, bagSlotIndex: resolved.bagSlotIndex });
      map.set(resolved.parentSlotId, existing);
    }
  }
  console.log('bagContentsMap:', map);
  return map;
});

function getWornItem(slotId: number) {
  return characterItemsMap.value.get(slotId);
}

function getGeneralItem(slotId: number) {
  return characterItemsMap.value.get(slotId);
}

function getBankItem(slotId: number) {
  return characterItemsMap.value.get(slotId);
}

const activeGeneralBagSlotId = ref<number | null>(null);
const activeBankBagSlotId = ref<number | null>(null);

function toggleBag(slotId: number, type: 'general' | 'bank') {
  const item = type === 'general' ? getGeneralItem(slotId) : getBankItem(slotId);

  // Only allow opening if it's a bag with slots
  if (!item || !item.bagSlots || item.bagSlots <= 0) {
    return;
  }

  if (type === 'general') {
    if (activeGeneralBagSlotId.value === slotId) {
      activeGeneralBagSlotId.value = null;
    } else {
      activeGeneralBagSlotId.value = slotId;
    }
  } else {
    if (activeBankBagSlotId.value === slotId) {
      activeBankBagSlotId.value = null;
    } else {
      activeBankBagSlotId.value = slotId;
    }
  }
}

function getBagContents(parentSlotId: number) {
  const existingItems = bagContentsMap.value.get(parentSlotId) || [];
  const bagItem = characterItemsMap.value.get(parentSlotId);
  const capacity = bagItem?.bagSlots || 10;

  return Array.from({ length: capacity }, (_, index) => {
    const found = existingItems.find(x => x.bagSlotIndex === index);
    return {
      bagSlotIndex: index,
      item: found ? found.item : null
    };
  });
}

// Highlight logic
const highlightedSlots = computed(() => {
  const targetId = store.modalState.highlightSlotId;
  if (targetId == null) return new Set<number>();

  const set = new Set<number>();
  const resolved = resolveSlotPlacement(targetId);

  if (resolved.slotId != null) {
    set.add(resolved.slotId);
  }
  if (resolved.parentSlotId != null) {
    set.add(resolved.parentSlotId);
  }
  return set;
});

function isSlotHighlighted(slotId: number) {
  return highlightedSlots.value.has(slotId);
}

function isBagSlotHighlighted(parentSlotId: number, bagSlotId: number) {
  const targetId = store.modalState.highlightSlotId;
  if (targetId == null) return false;
  
  const resolved = resolveSlotPlacement(targetId);
  return resolved.parentSlotId === parentSlotId && resolved.bagSlotIndex === bagSlotId;
}

function getClassIconUrl(cls: CharacterClass | undefined) {
  if (!cls || cls === 'UNKNOWN') {
    return '/assets/icons/warrior.gif';
  }
  return `/assets/icons/${cls.toLowerCase()}.gif`;
}

// Auto-open bag if highlighted item is inside
watch(() => store.modalState.highlightSlotId, (newId) => {
  if (newId != null) {
    const resolved = resolveSlotPlacement(newId);
    if (resolved.parentSlotId != null) {
      if (GENERAL_SLOT_IDS.includes(resolved.parentSlotId)) {
        activeGeneralBagSlotId.value = resolved.parentSlotId;
      } else if (BANK_SLOT_IDS.includes(resolved.parentSlotId)) {
        activeBankBagSlotId.value = resolved.parentSlotId;
      }
    }
  }
}, { immediate: true });

// Context Menu Logic
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null as GuildBankItem | null
});

function openContextMenu(event: MouseEvent, item: GuildBankItem | null | undefined) {
  if (!item || !item.itemId) return;
  
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item
  };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function openAlla() {
  const item = contextMenu.value.item;
  if (item && item.itemId) {
    window.open(`https://alla.clumsysworld.com/?a=item&id=${item.itemId}`, '_blank');
  }
  closeContextMenu();
}

// Close context menu on click outside
watch(() => contextMenu.value.visible, (visible) => {
  if (visible) {
    window.addEventListener('click', closeContextMenu);
  } else {
    window.removeEventListener('click', closeContextMenu);
  }
});

// Item tooltip handlers
function showItemTooltip(event: MouseEvent, item: GuildBankItem | null | undefined) {
  if (!item || !item.itemId) return;

  tooltipStore.showTooltip(
    {
      itemId: item.itemId,
      itemName: item.itemName,
      itemIconId: item.itemIconId,
      augSlot1: item.augSlot1,
      augSlot2: item.augSlot2,
      augSlot3: item.augSlot3,
      augSlot4: item.augSlot4,
      augSlot5: item.augSlot5,
      augSlot6: item.augSlot6
    },
    { x: event.clientX, y: event.clientY }
  );
}

function updateTooltipPosition(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function hideItemTooltip() {
  tooltipStore.hideTooltip();
}

</script>

<style scoped>
/* Ensure modal backdrop covers everything */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  backdrop-filter: blur(2px);
}

/* Most styles are in main.scss under .inventory-modal and .eq-* classes */

/* EQ Window Styles */
.eq-window {
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.eq-window__header {
  background-color: #1e293b;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.eq-window__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.eq-window__dot {
  width: 8px;
  height: 8px;
  background-color: #10b981;
  border-radius: 50%;
}

.eq-window__subtitle {
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: normal;
}

.eq-window__badge {
  font-size: 0.7rem;
  background: #334155;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  color: #cbd5e1;
}

.eq-window__content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eq-main-container {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

/* Unified Grid */
.eq-inventory-inner-layout {
  display: flex;
  gap: 1rem;
}

.eq-worn-container {
  position: relative;
}

.eq-worn-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(8, 42px);
  align-content: start;
  column-gap: 2px;
  row-gap: 2px;
  position: relative;
  z-index: 1;
}

.eq-general-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(5, 1fr);
  gap: 0.5rem;
}

.eq-class-icon {
  position: absolute;
  top: 145px; /* Moved down closer to Row 6 */
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160px; /* Reduced by 20% from 200px */
  height: 160px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  opacity: 1;
  pointer-events: none;
  z-index: 5;
}

.eq-slot-wrapper {
  width: 42px;
  height: 42px;
}

.eq-slot {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
  overflow: hidden;
}

.eq-slot--active {
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.eq-slot__icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.eq-slot__placeholder {
  color: #64748b;
  font-size: 0.9rem;
}

.eq-slot__label {
  color: #94a3b8;
  font-size: 0.65rem;
  font-weight: 500;
  text-align: center;
  line-height: 1;
  padding: 0 1px;
  pointer-events: none;
  user-select: none;
  letter-spacing: -0.02em;
}

.eq-slot--empty {
  display: none;
}

/* Bank Section */
.eq-window--bank {
  margin-top: 1rem;
}

.eq-bank-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr); /* 4 columns for bank as requested */
  gap: 0.5rem;
}

/* Slots */
.eq-inv-slot {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0; /* Prevent squishing */
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
  cursor: pointer;
}

.eq-inv-slot:hover {
  border-color: #64748b;
}

.eq-inv-slot--active {
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.eq-inv-slot--selected {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
}

.eq-inv-slot__inner {
  width: 100%;
  height: 100%;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eq-inv-slot__icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.eq-inv-slot__icon--placeholder {
  color: #475569;
  font-size: 0.9rem;
}

/* Split Layout */
.eq-split-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.eq-left-pane {
  flex: 0 0 auto;
}

.eq-right-pane {
  flex: 1;
  min-width: 300px;
}

/* Bag Container (Right Pane) */
.eq-bag-container {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.75rem;
}

.eq-bag-header {
  font-size: 0.85rem;
  color: #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
  font-weight: 600;
  border-bottom: 1px solid #334155;
  padding-bottom: 0.5rem;
}

/* Remove old popover styles */
.eq-bag-popover {
  display: none;
}

.eq-bag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 42px);
  max-width: calc(8 * 42px + 7 * 0.5rem);
  gap: 0.5rem;
  justify-content: start;
}

.eq-bag-slot {
  position: relative;
  width: 42px;
  height: 42px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eq-bag-slot:hover {
  border-color: #64748b;
}

.eq-bag-slot--active {
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.eq-bag-slot__inner {
  width: 100%;
  height: 100%;
  padding: 4px;
}

.eq-bag-slot__icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Responsive */
@media (max-width: 768px) {
  .eq-split-layout {
    flex-direction: column;
  }
  
  .eq-right-pane {
    width: 100%;
    min-width: 0;
  }
  
  .eq-bank-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
