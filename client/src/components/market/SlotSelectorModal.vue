<template>
  <div v-if="visible" class="modal-backdrop" @click.self="confirm">
    <div class="modal slot-selector-modal">
      <div class="modal__header">
        <div>
          <p class="eyebrow">Filter by Equipment Slot</p>
          <h3>Select Slots</h3>
        </div>
        <button class="icon-button" @click="confirm" aria-label="Close modal">
          <span class="icon-button__glyph">&times;</span>
        </button>
      </div>

      <div class="modal__body">
        <div class="slot-selector-visual">
          <div class="eq-window">
            <div class="eq-window__header">
              <div class="eq-window__title">
                <span class="eq-window__dot"></span>
                <strong>Equipment Slots</strong>
                <span class="eq-window__subtitle">
                  {{ selectedSlots.size }} slot{{ selectedSlots.size !== 1 ? 's' : '' }} selected
                </span>
              </div>
              <button
                class="slot-selector__clear-btn"
                :disabled="selectedSlots.size === 0"
                @click="clearAll"
              >
                Clear All
              </button>
            </div>
            <div class="eq-window__content">
              <div class="slot-selector__worn-container">
                <div
                  class="slot-selector__class-icon"
                  :style="{ backgroundImage: `url(${currentClassIcon})` }"
                ></div>
                <div class="slot-selector__worn-grid">
                  <div
                    v-for="slot in wornSlotsUi"
                    :key="slot.slotId"
                    class="slot-selector__slot-wrapper"
                    :style="{ gridRow: slot.row, gridColumn: slot.col }"
                  >
                    <div
                      class="slot-selector__slot"
                      :class="{
                        'slot-selector__slot--selected': selectedSlots.has(slot.slotId),
                        [`eq-slot--${slot.key}`]: true
                      }"
                      @click="toggleSlot(slot.slotId)"
                    >
                      <div v-if="selectedSlots.has(slot.slotId)" class="slot-selector__check">&#10003;</div>
                      <div class="slot-selector__slot-label">{{ slot.shortLabel || slot.label }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal__footer">
        <button class="btn btn--primary" @click="confirm">
          Apply{{ selectedSlots.size > 0 ? ` (${selectedSlots.size})` : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { WORN_SLOT_UI_LAYOUT } from '../../utils/inventory';

const CLASS_ICONS = [
  'bard', 'beastlord', 'berserker', 'cleric', 'druid', 'enchanter',
  'magician', 'monk', 'necromancer', 'paladin', 'ranger', 'rogue',
  'shadowknight', 'shaman', 'warrior', 'wizard'
];

const ICON_ROTATE_MS = 3000;

const props = defineProps<{
  visible: boolean;
  modelValue: Set<number>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Set<number>];
  close: [];
}>();

const wornSlotsUi = WORN_SLOT_UI_LAYOUT;

// Local working copy of selected slots
const selectedSlots = ref<Set<number>>(new Set());

// Random animated class icon
const currentClassIconIndex = ref(Math.floor(Math.random() * CLASS_ICONS.length));
const currentClassIcon = ref(`/assets/icons/${CLASS_ICONS[currentClassIconIndex.value]}.gif`);
let iconInterval: ReturnType<typeof setInterval> | null = null;

function startIconRotation() {
  stopIconRotation();
  iconInterval = setInterval(() => {
    currentClassIconIndex.value = (currentClassIconIndex.value + 1) % CLASS_ICONS.length;
    currentClassIcon.value = `/assets/icons/${CLASS_ICONS[currentClassIconIndex.value]}.gif`;
  }, ICON_ROTATE_MS);
}

function stopIconRotation() {
  if (iconInterval) {
    clearInterval(iconInterval);
    iconInterval = null;
  }
}

// Sync local state when modal opens
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    selectedSlots.value = new Set(props.modelValue);
    startIconRotation();
  } else {
    stopIconRotation();
  }
});

onMounted(() => {
  if (props.visible) {
    startIconRotation();
  }
});

onUnmounted(() => {
  stopIconRotation();
});

function toggleSlot(slotId: number) {
  const next = new Set(selectedSlots.value);
  if (next.has(slotId)) {
    next.delete(slotId);
  } else {
    next.add(slotId);
  }
  selectedSlots.value = next;
}

function clearAll() {
  selectedSlots.value = new Set();
}

function confirm() {
  emit('update:modelValue', new Set(selectedSlots.value));
  emit('close');
}
</script>

<style scoped>
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

.slot-selector-modal {
  max-width: 360px;
}

.modal__footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid #334155;
  display: flex;
  justify-content: flex-end;
}

/* EQ Window Styles (matching CharacterInventoryModal) */
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

.eq-window__content {
  padding: 1rem;
}

/* Clear All button */
.slot-selector__clear-btn {
  font-size: 0.7rem;
  background: #334155;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  color: #cbd5e1;
  border: 1px solid #475569;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}

.slot-selector__clear-btn:hover:not(:disabled) {
  background: #475569;
}

.slot-selector__clear-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Worn container and grid — 1.5x scale */
.slot-selector__worn-container {
  position: relative;
}

.slot-selector__worn-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(8, 63px);
  align-content: start;
  column-gap: 3px;
  row-gap: 3px;
  position: relative;
  z-index: 1;
}

.slot-selector__class-icon {
  position: absolute;
  top: 218px;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  height: 240px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  opacity: 1;
  pointer-events: none;
  z-index: 5;
  transition: background-image 0.5s ease-in-out;
}

.slot-selector__slot-wrapper {
  width: 63px;
  height: 63px;
}

.slot-selector__slot {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  border: 2px solid #334155;
  border-radius: 5px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
  position: relative;
  user-select: none;
}

.slot-selector__slot:hover {
  border-color: #64748b;
  background: #253349;
}

.slot-selector__slot--selected {
  border-color: rgba(56, 189, 248, 0.7);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.35), inset 0 0 8px rgba(56, 189, 248, 0.1);
  background: #1a2f47;
}

.slot-selector__slot--selected:hover {
  border-color: rgba(56, 189, 248, 0.9);
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.45), inset 0 0 10px rgba(56, 189, 248, 0.15);
}

.slot-selector__check {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 0.7rem;
  color: #38bdf8;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}

.slot-selector__slot-label {
  color: #94a3b8;
  font-size: 0.7rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.1;
  padding: 0 2px;
  pointer-events: none;
  letter-spacing: -0.02em;
}

.slot-selector__slot--selected .slot-selector__slot-label {
  color: #e2e8f0;
}

/* Button */
.btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn--primary {
  background: #3b82f6;
  color: #fff;
}

.btn--primary:hover {
  background: #2563eb;
}

@media (max-width: 480px) {
  .slot-selector-modal {
    max-width: 95vw;
  }
}
</style>
