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

      <div class="modal__body inventory-modal__body" v-if="characterItem">
        <div class="inventory-search">
          <div class="inventory-search__header">
            <label class="inventory-search__label" for="character-inventory-search"
              >Find an item</label
            >
            <button
              v-if="hasActiveSearch"
              class="inventory-search__reset"
              type="button"
              @click="resetSearch"
            >
              Reset
            </button>
          </div>
          <div class="inventory-search__bar">
            <div class="inventory-search__input-wrap">
              <input
                id="character-inventory-search"
                v-model="searchQuery"
                class="inventory-search__input"
                type="text"
                placeholder="Search this character's items"
                autocomplete="off"
                @focus="searchFocused = true"
                @blur="handleSearchBlur"
                @keydown.escape="clearSearchInput"
              />
              <button
                v-if="searchQuery"
                class="inventory-search__clear"
                type="button"
                aria-label="Clear search"
                @mousedown.prevent
                @click="clearSearchInput"
              >
                ×
              </button>
              <div v-if="searchDropdownVisible" class="inventory-search__dropdown">
                <button
                  v-for="result in filteredSearchResults"
                  :key="result.key"
                  class="inventory-search__result"
                  type="button"
                  @mousedown.prevent="selectSearchResult(result)"
                >
                  <span class="inventory-search__result-main">
                    <img
                      v-if="result.item.itemIconId"
                      :src="getLootIconSrc(result.item.itemIconId)"
                      class="inventory-search__result-icon"
                      alt=""
                    />
                    <span class="inventory-search__result-text">
                      <strong>{{ result.item.itemName }}</strong>
                      <span>{{ result.locationLabel }}</span>
                    </span>
                  </span>
                </button>
                <div v-if="!filteredSearchResults.length" class="inventory-search__empty">
                  No matching items in this character inventory.
                </div>
              </div>
            </div>
          </div>
          <div v-if="selectedSearchResult" class="inventory-search__selection">
            <span class="inventory-search__selection-label">Selected Item</span>
            <strong>{{ selectedSearchResult.item.itemName }}</strong>
            <span>{{ selectedSearchResult.locationLabel }}</span>
          </div>
        </div>

        <div class="inventory-visual">
          <div ref="inventoryWindowRef" class="eq-window">
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
                          :style="{
                            backgroundImage: `url(${getClassIconUrl(characterItem.class)})`
                          }"
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
                                {
                                  'eq-slot--active': isSlotHighlighted(slot.slotId),
                                  'eq-slot--pulse': isSlotPulsing(slot.slotId)
                                }
                              ]"
                              @mouseenter="showItemTooltip($event, getWornItem(slot.slotId))"
                              @mousemove="updateTooltipPosition($event)"
                              @mouseleave="hideItemTooltip"
                              @contextmenu.stop.prevent="
                                openContextMenu($event, getWornItem(slot.slotId))
                              "
                            >
                              <img
                                v-if="getWornItem(slot.slotId)?.itemIconId"
                                :src="getLootIconSrc(getWornItem(slot.slotId)!.itemIconId!)"
                                class="eq-slot__icon"
                                alt=""
                              />
                              <div
                                v-else-if="getWornItem(slot.slotId!)"
                                class="eq-slot__placeholder"
                              >
                                ?
                              </div>
                              <div v-else class="eq-slot__label">
                                {{ slot.shortLabel || slot.label }}
                              </div>
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
                              'eq-inv-slot--selected': activeGeneralBagSlotId === slot.slotId,
                              'eq-inv-slot--pulse': isSlotPulsing(slot.slotId)
                            }"
                            @click="toggleBag(slot.slotId, 'general')"
                            @mouseenter="showItemTooltip($event, getGeneralItem(slot.slotId))"
                            @mousemove="updateTooltipPosition($event)"
                            @mouseleave="hideItemTooltip"
                            @contextmenu.stop.prevent="
                              openContextMenu($event, getGeneralItem(slot.slotId))
                            "
                          >
                            <div class="eq-inv-slot__inner">
                              <img
                                v-if="getGeneralItem(slot.slotId)?.itemIconId"
                                :src="getLootIconSrc(getGeneralItem(slot.slotId)!.itemIconId!)"
                                class="eq-inv-slot__icon"
                                alt=""
                              />
                              <span
                                v-else-if="getGeneralItem(slot.slotId)"
                                class="eq-inv-slot__icon eq-inv-slot__icon--placeholder"
                                >?</span
                              >
                            </div>
                            <span
                              v-if="getItemStackCount(getGeneralItem(slot.slotId))"
                              class="eq-slot__stack-count"
                            >
                              {{ getItemStackCount(getGeneralItem(slot.slotId)) }}
                            </span>
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
                          :class="{
                            'eq-bag-slot--active': isBagSlotHighlighted(
                              activeGeneralBagSlotId,
                              bagSlot.bagSlotIndex
                            ),
                            'eq-bag-slot--pulse': isBagSlotPulsing(
                              activeGeneralBagSlotId,
                              bagSlot.bagSlotIndex
                            )
                          }"
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
                          <span v-if="getItemStackCount(bagSlot.item)" class="eq-slot__stack-count">
                            {{ getItemStackCount(bagSlot.item) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bank Slots -->
          <div ref="bankWindowRef" class="eq-window eq-window--bank">
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
                          'eq-inv-slot--selected': activeBankBagSlotId === slot.slotId,
                          'eq-inv-slot--pulse': isSlotPulsing(slot.slotId)
                        }"
                        @click="toggleBag(slot.slotId, 'bank')"
                        @mouseenter="showItemTooltip($event, getBankItem(slot.slotId))"
                        @mousemove="updateTooltipPosition($event)"
                        @mouseleave="hideItemTooltip"
                        @contextmenu.stop.prevent="
                          openContextMenu($event, getBankItem(slot.slotId))
                        "
                      >
                        <div class="eq-inv-slot__inner">
                          <img
                            v-if="getBankItem(slot.slotId)?.itemIconId"
                            :src="getLootIconSrc(getBankItem(slot.slotId)!.itemIconId!)"
                            class="eq-inv-slot__icon"
                            alt=""
                          />
                          <span
                            v-else-if="getBankItem(slot.slotId)"
                            class="eq-inv-slot__icon eq-inv-slot__icon--placeholder"
                            >?</span
                          >
                        </div>
                        <span
                          v-if="getItemStackCount(getBankItem(slot.slotId))"
                          class="eq-slot__stack-count"
                        >
                          {{ getItemStackCount(getBankItem(slot.slotId)) }}
                        </span>
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
                        :class="{
                          'eq-bag-slot--active': isBagSlotHighlighted(
                            activeBankBagSlotId,
                            bagSlot.bagSlotIndex
                          ),
                          'eq-bag-slot--pulse': isBagSlotPulsing(
                            activeBankBagSlotId,
                            bagSlot.bagSlotIndex
                          )
                        }"
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
                        <span v-if="getItemStackCount(bagSlot.item)" class="eq-slot__stack-count">
                          {{ getItemStackCount(bagSlot.item) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal__body inventory-modal__body" v-else>
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
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
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
import { computed, nextTick, ref, watch } from 'vue';
import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';
import type { GuildBankItem, CharacterClass } from '../services/api';
import { getLootIconSrc } from '../utils/itemIcons';
import {
  GENERAL_SLOT_IDS,
  BANK_SLOT_IDS,
  WORN_SLOT_UI_LAYOUT,
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

const customWornSlotsUi = computed(() => WORN_SLOT_UI_LAYOUT);

const bankSlotsUi = BANK_SLOT_IDS.map((slotId, index) => ({
  slotId,
  label: `Bank ${index + 1}`
}));

const characterItem = computed(() => {
  if (!store.snapshot || !store.modalState.characterName) return null;
  return store.snapshot.characters.find(
    (c) => c.name.toLowerCase() === store.modalState.characterName?.toLowerCase()
  );
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

type InventorySearchResult = {
  key: string;
  item: GuildBankItem;
  slotId: number;
  normalizedName: string;
  locationLabel: string;
  resolved: ReturnType<typeof resolveSlotPlacement>;
};

const inventoryWindowRef = ref<HTMLElement | null>(null);
const bankWindowRef = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const searchFocused = ref(false);
const selectedSearchResult = ref<InventorySearchResult | null>(null);
const hasActiveSearch = computed(
  () => searchQuery.value.trim().length > 0 || selectedSearchResult.value != null
);

function getLocationLabel(resolved: ReturnType<typeof resolveSlotPlacement>) {
  if (resolved.parentLabel && resolved.bagSlotIndex != null) {
    return `${resolved.parentLabel} -> Slot ${resolved.bagSlotIndex + 1}`;
  }
  return resolved.slotLabel;
}

const searchableItems = computed<InventorySearchResult[]>(() =>
  Array.from(characterItemsMap.value.values())
    .filter((item): item is GuildBankItem & { slotId: number } => typeof item.slotId === 'number')
    .map((item) => {
      const resolved = resolveSlotPlacement(item.slotId);
      return {
        key: `${item.slotId}:${item.itemId ?? item.itemName}`,
        item,
        slotId: item.slotId,
        normalizedName: item.itemName.trim().toLowerCase(),
        locationLabel: getLocationLabel(resolved),
        resolved
      };
    })
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName) || a.slotId - b.slotId)
);

const filteredSearchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return searchableItems.value
    .filter((result) => result.normalizedName.includes(query))
    .sort((a, b) => {
      const aStartsWith = a.normalizedName.startsWith(query) ? 0 : 1;
      const bStartsWith = b.normalizedName.startsWith(query) ? 0 : 1;
      if (aStartsWith !== bStartsWith) {
        return aStartsWith - bStartsWith;
      }
      return a.normalizedName.localeCompare(b.normalizedName) || a.slotId - b.slotId;
    })
    .slice(0, 12);
});

const searchDropdownVisible = computed(
  () => searchFocused.value && searchQuery.value.trim().length > 0
);

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
    const found = existingItems.find((x) => x.bagSlotIndex === index);
    return {
      bagSlotIndex: index,
      item: found ? found.item : null
    };
  });
}

// Highlight logic
const highlightedPlacement = computed(() => resolveSlotPlacement(store.modalState.highlightSlotId));

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

function isSlotPulsing(slotId: number) {
  const resolved = highlightedPlacement.value;
  return resolved.slotId === slotId && resolved.parentSlotId == null;
}

function isBagSlotHighlighted(parentSlotId: number, bagSlotId: number) {
  const targetId = store.modalState.highlightSlotId;
  if (targetId == null) return false;

  const resolved = resolveSlotPlacement(targetId);
  return resolved.parentSlotId === parentSlotId && resolved.bagSlotIndex === bagSlotId;
}

function isBagSlotPulsing(parentSlotId: number, bagSlotId: number) {
  const resolved = highlightedPlacement.value;
  return resolved.parentSlotId === parentSlotId && resolved.bagSlotIndex === bagSlotId;
}

function getClassIconUrl(cls: CharacterClass | undefined) {
  if (!cls || cls === 'UNKNOWN') {
    return '/assets/icons/warrior.gif';
  }
  return `/assets/icons/${cls.toLowerCase()}.gif`;
}

// Auto-open bag if highlighted item is inside
watch(
  () => store.modalState.highlightSlotId,
  (newId) => {
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
  },
  { immediate: true }
);

watch(
  () => [store.modalState.open, store.modalState.characterName],
  ([isOpen]) => {
    if (!isOpen) {
      searchFocused.value = false;
    }
    searchQuery.value = '';
    selectedSearchResult.value = null;
  }
);

function handleSearchBlur() {
  window.setTimeout(() => {
    searchFocused.value = false;
  }, 120);
}

function clearSearchInput() {
  searchQuery.value = '';
  searchFocused.value = false;
}

function resetSearch() {
  clearSearchInput();
  selectedSearchResult.value = null;
  store.modalState.highlightSlotId = null;
  activeGeneralBagSlotId.value = null;
  activeBankBagSlotId.value = null;
}

async function revealSearchResult(result: InventorySearchResult) {
  store.modalState.highlightSlotId = result.slotId;

  if (result.resolved.parentSlotId != null) {
    if (GENERAL_SLOT_IDS.includes(result.resolved.parentSlotId)) {
      activeGeneralBagSlotId.value = result.resolved.parentSlotId;
    } else if (BANK_SLOT_IDS.includes(result.resolved.parentSlotId)) {
      activeBankBagSlotId.value = result.resolved.parentSlotId;
    }
  }

  await nextTick();

  const targetWindow =
    result.resolved.area === 'bank' || result.resolved.area === 'bankBag'
      ? bankWindowRef.value
      : inventoryWindowRef.value;

  targetWindow?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

function selectSearchResult(result: InventorySearchResult) {
  selectedSearchResult.value = result;
  searchQuery.value = result.item.itemName;
  searchFocused.value = false;
  void revealSearchResult(result);
}

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
watch(
  () => contextMenu.value.visible,
  (visible) => {
    if (visible) {
      window.addEventListener('click', closeContextMenu);
    } else {
      window.removeEventListener('click', closeContextMenu);
    }
  }
);

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

// Stack count normalization
const MAX_REASONABLE_QUANTITY = 1000000;

function normalizeQuantity(raw: number | null | undefined): number {
  if (raw == null) return 1;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 1;
  if (num > MAX_REASONABLE_QUANTITY) return 1; // Treat sentinel values as 1
  return num;
}

function getItemStackCount(item: GuildBankItem | null | undefined): number | null {
  if (!item) return null;
  const qty = normalizeQuantity(item.charges);
  return qty > 1 ? qty : null;
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
  z-index: 130;
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

.eq-slot--pulse,
.eq-inv-slot--pulse,
.eq-bag-slot--pulse {
  animation: inventory-slot-pulse 1.3s ease-in-out infinite;
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
  grid-template-columns: repeat(8, 1fr); /* 8 columns for wider, less tall layout */
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

.inventory-search {
  position: relative;
  z-index: 2;
}

.inventory-search__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.inventory-search__label {
  display: block;
  margin-bottom: 0.4rem;
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.inventory-search__bar {
  display: flex;
  align-items: stretch;
}

.inventory-search__input-wrap {
  position: relative;
  flex: 1;
}

.inventory-search__input {
  width: 100%;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.7rem 2.5rem 0.7rem 0.85rem;
  font-size: 0.95rem;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.inventory-search__input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
}

.inventory-search__clear {
  position: absolute;
  top: 50%;
  right: 0.55rem;
  transform: translateY(-50%);
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 999px;
  background: rgba(51, 65, 85, 0.7);
  color: #cbd5e1;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.inventory-search__clear:hover {
  background: rgba(71, 85, 105, 0.95);
  color: #f8fafc;
}

.inventory-search__reset {
  border: 1px solid rgba(71, 85, 105, 0.9);
  border-radius: 999px;
  background: transparent;
  color: #94a3b8;
  padding: 0.28rem 0.7rem;
  font-size: 0.78rem;
  line-height: 1.2;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease,
    background-color 120ms ease;
}

.inventory-search__reset:hover {
  border-color: rgba(100, 116, 139, 0.95);
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.55);
}

.inventory-search__dropdown {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  border: 1px solid #334155;
  border-radius: 10px;
  background: #0f172a;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.55);
  overflow: hidden;
  max-height: 320px;
  overflow-y: auto;
}

.inventory-search__result {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 0.65rem 0.8rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(51, 65, 85, 0.75);
}

.inventory-search__result:last-child {
  border-bottom: 0;
}

.inventory-search__result:hover {
  background: rgba(30, 41, 59, 0.9);
}

.inventory-search__result-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.inventory-search__result-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  object-fit: contain;
}

.inventory-search__result-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}

.inventory-search__result-text strong {
  color: #f8fafc;
  font-size: 0.92rem;
}

.inventory-search__result-text span {
  color: #94a3b8;
  font-size: 0.8rem;
}

.inventory-search__empty {
  padding: 0.85rem;
  color: #94a3b8;
  font-size: 0.85rem;
}

.inventory-search__selection {
  margin-top: 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.inventory-search__selection-label {
  color: #94a3b8;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@keyframes inventory-slot-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.2);
  }
  50% {
    transform: scale(1.05);
    box-shadow:
      0 0 0 4px rgba(250, 204, 21, 0.18),
      0 0 18px rgba(250, 204, 21, 0.45);
  }
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

/* Stack Count Badge */
.eq-slot__stack-count {
  position: absolute;
  bottom: 1px;
  right: 2px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fef3c7;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0 0 3px rgba(0, 0, 0, 0.8);
  line-height: 1;
  pointer-events: none;
  z-index: 10;
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
