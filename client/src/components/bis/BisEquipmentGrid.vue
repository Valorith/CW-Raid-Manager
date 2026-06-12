<template>
  <section
    :class="['eq-window', 'bis-equipment-grid', { 'bis-equipment-grid--large': scale === 'large' }]"
  >
    <div class="eq-window__header bis-equipment-grid__header">
      <div class="eq-window__title">
        <span class="eq-window__dot"></span>
        <strong>{{ title }}</strong>
        <span v-if="subtitle" class="eq-window__subtitle">{{ subtitle }}</span>
      </div>
      <span v-if="badge" class="eq-window__badge">{{ badge }}</span>
    </div>

    <div class="eq-window__content bis-equipment-grid__content">
      <div class="eq-paperdoll-layout bis-equipment-grid__paperdoll">
        <div class="eq-paperdoll-grid">
          <div
            class="eq-class-icon bis-equipment-grid__class-icon"
            :style="classIconStyle"
            aria-hidden="true"
          ></div>

          <button
            v-for="(slot, index) in WORN_SLOT_UI_LAYOUT"
            :key="slot.slotId"
            type="button"
            :class="slotClassList(slot.slotId, slot.key)"
            :style="{ '--bis-slot-i': index }"
            :aria-pressed="selectedSlotId === slot.slotId"
            :aria-label="slotAriaLabel(slot.slotId, slot.label)"
            @click="handleSelect(slot.slotId)"
            @mouseenter="showItemTooltip($event, slotItem(slot.slotId))"
            @mousemove="updateTooltipPosition($event)"
            @mouseleave="hideItemTooltip"
          >
            <img
              v-if="slotItem(slot.slotId)?.itemIconId"
              :src="getLootIconSrc(slotItem(slot.slotId)!.itemIconId!)"
              class="eq-slot__icon"
              alt=""
            />
            <span
              v-else-if="slotItem(slot.slotId)?.itemId"
              class="eq-slot__placeholder bis-equipment-grid__placeholder"
            >
              ?
            </span>
            <span v-else class="eq-slot__label">{{ slot.shortLabel }}</span>
            <span
              v-if="slotItem(slot.slotId)?.cornerLabel"
              class="bis-equipment-grid__corner-label"
            >
              {{ slotItem(slot.slotId)?.cornerLabel }}
            </span>
          </button>
        </div>
      </div>

      <div v-if="legend && legend.length" class="bis-equipment-grid__legend" aria-hidden="true">
        <span
          v-for="entry in legend"
          :key="entry.tone"
          class="bis-equipment-grid__legend-chip"
          :data-tone="entry.tone"
        >
          <i class="bis-equipment-grid__legend-swatch"></i>
          {{ entry.label }}
        </span>
      </div>

      <footer v-if="selectedSlotDef" class="bis-equipment-grid__footer">
        <span class="bis-equipment-grid__footer-slot">{{ selectedSlotDef.label }}</span>
        <span
          class="bis-equipment-grid__footer-item"
          :class="{ 'bis-equipment-grid__footer-item--empty': !selectedItemName }"
        >
          {{ selectedItemName ?? footerEmptyLabel }}
        </span>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useItemTooltipStore } from '../../stores/itemTooltip';
import { getLootIconSrc } from '../../utils/itemIcons';
import { WORN_SLOT_UI_LAYOUT } from '../../utils/inventory';
import { type CharacterClass } from '../../services/types';

export type BisEquipmentGridTone = 'winner' | 'match' | 'different' | 'missing' | 'unresolved';

export interface BisEquipmentGridLegendEntry {
  tone: BisEquipmentGridTone;
  label: string;
}

export interface BisEquipmentGridItem {
  slotId: number;
  itemId?: number;
  itemName: string;
  itemIconId?: number | null;
  augSlot1?: number | null;
  augSlot2?: number | null;
  augSlot3?: number | null;
  augSlot4?: number | null;
  augSlot5?: number | null;
  augSlot6?: number | null;
  cornerLabel?: string | null;
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string | null;
    badge?: string | null;
    characterClass?: CharacterClass | null;
    slotItems?: Record<number, BisEquipmentGridItem | null | undefined>;
    slotTones?: Record<number, BisEquipmentGridTone | undefined>;
    selectedSlotId?: number | null;
    interactive?: boolean;
    scale?: 'normal' | 'large';
    legend?: BisEquipmentGridLegendEntry[] | null;
    footerEmptyLabel?: string;
  }>(),
  {
    subtitle: null,
    badge: null,
    characterClass: null,
    slotItems: () => ({}),
    slotTones: () => ({}),
    selectedSlotId: null,
    interactive: true,
    scale: 'normal',
    legend: null,
    footerEmptyLabel: 'Empty slot'
  }
);

const emit = defineEmits<{
  select: [slotId: number];
}>();

const tooltipStore = useItemTooltipStore();

function getAnimatedClassIconUrl(characterClass?: CharacterClass | null) {
  if (!characterClass || characterClass === 'UNKNOWN') {
    return '/assets/icons/warrior.gif';
  }

  return `/assets/icons/${characterClass.toLowerCase()}.gif`;
}

const classIconStyle = computed(() => ({
  backgroundImage: `url(${getAnimatedClassIconUrl(props.characterClass)})`
}));

const selectedSlotDef = computed(
  () => WORN_SLOT_UI_LAYOUT.find((slot) => slot.slotId === props.selectedSlotId) ?? null
);

const selectedItemName = computed(() => {
  if (props.selectedSlotId == null) {
    return null;
  }

  return props.slotItems[props.selectedSlotId]?.itemName ?? null;
});

function slotItem(slotId: number): BisEquipmentGridItem | null {
  return props.slotItems[slotId] ?? null;
}

function slotClassList(slotId: number, slotKey: string) {
  const tone = props.slotTones[slotId];
  return [
    'eq-slot',
    'eq-slot--worn',
    'bis-equipment-grid__slot',
    `eq-slot--${slotKey}`,
    {
      'eq-slot--active': props.selectedSlotId === slotId,
      'bis-equipment-grid__slot--clickable': props.interactive,
      'bis-equipment-grid__slot--winner': tone === 'winner',
      'bis-equipment-grid__slot--match': tone === 'match',
      'bis-equipment-grid__slot--different': tone === 'different',
      'bis-equipment-grid__slot--missing': tone === 'missing',
      'bis-equipment-grid__slot--unresolved': tone === 'unresolved'
    }
  ];
}

function slotAriaLabel(slotId: number, label: string) {
  const item = slotItem(slotId);
  if (!item?.itemName) {
    return `${label} slot`;
  }

  return `${label}: ${item.itemName}`;
}

function handleSelect(slotId: number) {
  if (!props.interactive) {
    return;
  }

  emit('select', slotId);
}

function showItemTooltip(event: MouseEvent, item: BisEquipmentGridItem | null) {
  if (!item?.itemId) {
    return;
  }

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
.bis-equipment-grid {
  --bis-slot-size: 52px;
  --bis-slot-gap: 6px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(22, 22, 22, 0.985), rgba(6, 6, 6, 0.995)),
    radial-gradient(circle at top, rgba(97, 97, 97, 0.08), transparent 42%);
  border: 1px solid rgba(84, 84, 84, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 0 1px rgba(255, 255, 255, 0.015),
    0 22px 44px rgba(0, 0, 0, 0.34);
  overflow: hidden;
}

.bis-equipment-grid--large {
  --bis-slot-size: 62px;
}

.bis-equipment-grid__header {
  background: linear-gradient(180deg, rgba(22, 22, 22, 0.985), rgba(10, 10, 10, 0.99));
  border-bottom: 1px solid rgba(74, 74, 74, 0.88);
}

.bis-equipment-grid :deep(.eq-window__title) {
  color: #f7f0e5;
}

.bis-equipment-grid :deep(.eq-window__subtitle) {
  color: #b0a89b;
}

.bis-equipment-grid :deep(.eq-window__dot) {
  background: radial-gradient(circle, #f3d18d 0%, #a57a3f 100%);
  box-shadow: 0 0 10px rgba(194, 151, 85, 0.3);
}

.bis-equipment-grid :deep(.eq-window__badge) {
  background: rgba(24, 24, 24, 0.96);
  color: #f2e8d7;
  border: 1px solid rgba(101, 101, 101, 0.7);
}

.bis-equipment-grid__content {
  padding: 1.1rem;
  flex: 1;
}

.bis-equipment-grid__paperdoll {
  background: transparent;
  border: 0;
  flex: 1;
  align-items: center;
}

/* Size the paperdoll for real instead of transform-scaling it, so icons stay
   crisp and hitboxes match what the user sees. */
.bis-equipment-grid :deep(.eq-paperdoll-grid) {
  grid-template-columns: repeat(4, var(--bis-slot-size));
  grid-template-rows: repeat(8, var(--bis-slot-size));
  gap: var(--bis-slot-gap);
}

.bis-equipment-grid :deep(.eq-slot--worn) {
  width: var(--bis-slot-size);
  height: var(--bis-slot-size);
}

.bis-equipment-grid__class-icon {
  filter: drop-shadow(0 0 16px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 10px rgba(191, 145, 77, 0.12));
  opacity: 0.88;
  animation: bis-grid-fade-in 520ms ease 140ms both;
}

.bis-equipment-grid__legend,
.bis-equipment-grid__footer {
  animation: bis-grid-fade-in 420ms ease 300ms both;
}

@keyframes bis-grid-fade-in {
  from {
    opacity: 0;
  }
}

.bis-equipment-grid__slot {
  position: relative;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(33, 33, 33, 0.985), rgba(10, 10, 10, 0.992));
  border-color: rgba(83, 83, 83, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 0 0 1px rgba(0, 0, 0, 0.45);
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    border-color 120ms ease,
    background 120ms ease;
  animation: bis-slot-in 340ms cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-delay: calc(var(--bis-slot-i, 0) * 18ms);
}

@keyframes bis-slot-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.bis-equipment-grid__slot .eq-slot__icon {
  transition: filter 150ms ease;
}

.bis-equipment-grid__slot--clickable:hover .eq-slot__icon {
  filter: brightness(1.18) saturate(1.06);
}

.bis-equipment-grid__slot.eq-slot--active .eq-slot__icon {
  filter: brightness(1.12);
}

.bis-equipment-grid__slot--clickable {
  cursor: pointer;
}

.bis-equipment-grid__slot--clickable:not(.eq-slot--active):hover {
  transform: translateY(-1px);
  border-color: rgba(150, 150, 150, 0.84);
  background: linear-gradient(180deg, rgba(38, 38, 38, 0.985), rgba(12, 12, 12, 0.992));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 0 0 1px rgba(196, 159, 94, 0.14);
}

.bis-equipment-grid__slot:focus-visible {
  outline: none;
  border-color: rgba(208, 168, 106, 0.74);
  box-shadow:
    0 0 0 3px rgba(208, 168, 106, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* Selected slot must stand out against the gold "established" tone borders,
   so it gets a brighter double ring, a lift, and a soft pulse. */
.bis-equipment-grid__slot.eq-slot--active {
  z-index: 4;
  transform: scale(1.12);
  border-color: #f6dca2;
  background: linear-gradient(180deg, rgba(56, 43, 22, 0.985), rgba(22, 16, 8, 0.992));
  box-shadow:
    0 0 0 2px rgba(246, 220, 162, 0.92),
    0 0 0 5px rgba(208, 168, 106, 0.28),
    0 0 22px rgba(208, 168, 106, 0.55),
    inset 0 0 14px rgba(208, 168, 106, 0.22);
  animation: bis-slot-selected-pulse 2.4s ease-in-out infinite;
}

.bis-equipment-grid__slot--clickable.eq-slot--active:hover {
  transform: scale(1.12) translateY(-1px);
}

@keyframes bis-slot-selected-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(246, 220, 162, 0.92),
      0 0 0 5px rgba(208, 168, 106, 0.28),
      0 0 22px rgba(208, 168, 106, 0.55),
      inset 0 0 14px rgba(208, 168, 106, 0.22);
  }

  50% {
    box-shadow:
      0 0 0 2px rgba(246, 220, 162, 0.8),
      0 0 0 5px rgba(208, 168, 106, 0.16),
      0 0 10px rgba(208, 168, 106, 0.3),
      inset 0 0 14px rgba(208, 168, 106, 0.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bis-equipment-grid__slot.eq-slot--active {
    animation: none;
  }
}

.bis-equipment-grid__slot--winner {
  border-color: rgba(203, 158, 88, 0.82);
  box-shadow:
    0 0 0 1px rgba(203, 158, 88, 0.3),
    inset 0 0 16px rgba(203, 158, 88, 0.12);
}

.bis-equipment-grid__slot--match {
  border-color: rgba(98, 162, 112, 0.84);
  box-shadow:
    0 0 0 1px rgba(98, 162, 112, 0.24),
    inset 0 0 16px rgba(98, 162, 112, 0.12);
}

.bis-equipment-grid__slot--different {
  border-color: rgba(171, 132, 80, 0.84);
  box-shadow:
    0 0 0 1px rgba(171, 132, 80, 0.24),
    inset 0 0 16px rgba(171, 132, 80, 0.11);
}

.bis-equipment-grid__slot--missing {
  border-color: rgba(154, 88, 88, 0.84);
  box-shadow:
    0 0 0 1px rgba(154, 88, 88, 0.24),
    inset 0 0 16px rgba(154, 88, 88, 0.1);
}

.bis-equipment-grid__slot--unresolved {
  border-color: rgba(96, 96, 96, 0.9);
}

.bis-equipment-grid__corner-label {
  position: absolute;
  right: 3px;
  bottom: 3px;
  z-index: 3;
  padding: 0.1rem 0.34rem;
  border-radius: 999px;
  background: rgba(5, 5, 5, 0.9);
  border: 1px solid rgba(208, 168, 106, 0.32);
  color: #ecd9b4;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.bis-equipment-grid__placeholder {
  position: relative;
  z-index: 2;
  color: #9c9588;
}

.bis-equipment-grid :deep(.eq-slot__label) {
  color: #aca496;
}

.bis-equipment-grid__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem 0.9rem;
}

.bis-equipment-grid__legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #a89f91;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.bis-equipment-grid__legend-swatch {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 3px;
  border: 1px solid transparent;
}

.bis-equipment-grid__legend-chip[data-tone='winner'] .bis-equipment-grid__legend-swatch {
  background: rgba(203, 158, 88, 0.32);
  border-color: rgba(203, 158, 88, 0.85);
}

.bis-equipment-grid__legend-chip[data-tone='match'] .bis-equipment-grid__legend-swatch {
  background: rgba(98, 162, 112, 0.3);
  border-color: rgba(98, 162, 112, 0.85);
}

.bis-equipment-grid__legend-chip[data-tone='different'] .bis-equipment-grid__legend-swatch {
  background: rgba(171, 132, 80, 0.3);
  border-color: rgba(171, 132, 80, 0.85);
}

.bis-equipment-grid__legend-chip[data-tone='missing'] .bis-equipment-grid__legend-swatch {
  background: rgba(154, 88, 88, 0.3);
  border-color: rgba(154, 88, 88, 0.85);
}

.bis-equipment-grid__legend-chip[data-tone='unresolved'] .bis-equipment-grid__legend-swatch {
  background: rgba(96, 96, 96, 0.3);
  border-color: rgba(120, 120, 120, 0.85);
}

.bis-equipment-grid__footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.85rem;
  margin-top: auto;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(64, 64, 64, 0.45);
}

.bis-equipment-grid__footer-slot {
  flex: 0 0 auto;
  color: #d0a86a;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.bis-equipment-grid__footer-item {
  min-width: 0;
  color: #f3ecdf;
  font-size: 0.86rem;
  font-weight: 600;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bis-equipment-grid__footer-item--empty {
  color: #877f72;
  font-weight: 500;
  font-style: italic;
}

@media (prefers-reduced-motion: reduce) {
  .bis-equipment-grid,
  .bis-equipment-grid :deep(*) {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media (max-width: 960px) {
  .bis-equipment-grid--large {
    --bis-slot-size: 54px;
  }
}
</style>
