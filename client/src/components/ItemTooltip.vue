<template>
  <Teleport to="body">
    <div
      v-if="store.isVisible"
      ref="tooltipRef"
      class="item-tooltip"
      :style="tooltipStyle"
      aria-hidden="true"
    >
      <div v-if="store.loading" class="item-tooltip__card">
        <p class="item-tooltip__eyebrow">Item Preview</p>
        <div v-if="basicDetail" class="item-tooltip__basic">
          <div class="item-tooltip__basic-icon-shell">
            <img
              v-if="basicDetail.iconId != null && basicDetail.iconId > 0"
              :src="getLootIconSrc(basicDetail.iconId)"
              class="item-tooltip__basic-icon"
              alt=""
            />
            <div v-else class="item-tooltip__basic-icon item-tooltip__basic-icon--placeholder"></div>
          </div>
          <div class="item-tooltip__basic-copy">
            <h2 class="item-tooltip__title">{{ basicDetail.itemName }}</h2>
            <p class="item-tooltip__message">Loading item details...</p>
          </div>
        </div>
        <p v-else class="item-tooltip__message">Loading item details...</p>
      </div>

      <div v-else-if="store.error && basicDetail" class="item-tooltip__card">
        <p class="item-tooltip__eyebrow">Item Preview</p>
        <div class="item-tooltip__basic">
          <div class="item-tooltip__basic-icon-shell">
            <img
              v-if="basicDetail.iconId != null && basicDetail.iconId > 0"
              :src="getLootIconSrc(basicDetail.iconId)"
              class="item-tooltip__basic-icon"
              alt=""
            />
            <div v-else class="item-tooltip__basic-icon item-tooltip__basic-icon--placeholder"></div>
          </div>
          <div class="item-tooltip__basic-copy">
            <h2 class="item-tooltip__title">{{ basicDetail.itemName }}</h2>
            <p class="item-tooltip__message">
              Detailed item stats are unavailable for this item.
            </p>
          </div>
        </div>
      </div>

      <section v-else-if="detail" class="item-tooltip__card item-tooltip__card--detail">
        <div class="item-tooltip__content">
          <div class="item-tooltip__hero">
            <div class="item-tooltip__hero-icon-shell">
              <img
                v-if="detail.icon > 0"
                :src="getLootIconSrc(detail.icon)"
                class="item-tooltip__hero-icon"
                alt=""
              />
              <div
                v-else
                class="item-tooltip__hero-icon item-tooltip__hero-icon--placeholder"
              ></div>
            </div>

            <div class="item-tooltip__hero-copy">
              <h2 class="item-tooltip__title">{{ detail.name }}</h2>

              <div class="item-tooltip__summary">
                <div v-for="flag in detail.flags" :key="flag" class="item-tooltip__flag">
                  {{ flag }}
                </div>

                <div class="item-tooltip__pair">
                  <span class="item-tooltip__label">Class:</span>
                  <span class="item-tooltip__value item-tooltip__value--wrap">{{
                    detail.classDisplay
                  }}</span>
                </div>

                <div class="item-tooltip__pair">
                  <span class="item-tooltip__label">Race:</span>
                  <span class="item-tooltip__value item-tooltip__value--wrap">{{
                    detail.raceDisplay
                  }}</span>
                </div>

                <div class="item-tooltip__slot-display">{{ detail.slotDisplay }}</div>
              </div>
            </div>
          </div>

          <div class="item-tooltip__stats-grid" :style="statGridStyle">
            <div
              v-for="(column, index) in detail.topColumns"
              :key="column.key"
              class="item-tooltip__column"
              :style="{ gridColumn: String(index + 1), gridRow: '1' }"
            >
              <div
                v-for="row in column.rows"
                :key="`${column.key}-${row.label}`"
                class="item-tooltip__pair item-tooltip__pair--numeric"
              >
                <span class="item-tooltip__label">{{ row.label }}:</span>
                <span class="item-tooltip__value item-tooltip__value--numeric">{{
                  row.value
                }}</span>
              </div>
            </div>

            <div
              v-for="(column, index) in detail.lowerColumns"
              :key="column.key"
              class="item-tooltip__column"
              :style="{ gridColumn: String(index + 1), gridRow: '2' }"
            >
              <div
                v-for="row in column.rows"
                :key="`${column.key}-${row.label}`"
                class="item-tooltip__pair item-tooltip__pair--numeric"
              >
                <span class="item-tooltip__label">{{ row.label }}:</span>
                <span class="item-tooltip__value item-tooltip__value--numeric">{{
                  row.value
                }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="detail.modifierRows.length > 0"
            class="item-tooltip__section item-tooltip__column"
          >
            <div
              v-for="row in detail.modifierRows"
              :key="`modifier-${row.label}`"
              class="item-tooltip__pair"
            >
              <span class="item-tooltip__label">{{ row.label }}:</span>
              <span class="item-tooltip__value item-tooltip__value--wrap">{{ row.value }}</span>
            </div>
          </div>

          <div
            v-if="detail.augmentSlots.length > 0"
            class="item-tooltip__section item-tooltip__augment-slots"
          >
            <div
              v-for="slot in detail.augmentSlots"
              :key="`augment-slot-${slot.slot}`"
              class="item-tooltip__augment-slot"
            >
              <span aria-hidden="true" class="item-tooltip__augment-marker"></span>
              <span class="item-tooltip__augment-text">
                <span class="item-tooltip__label">Slot {{ slot.slot }}:</span>
                <span class="item-tooltip__value">Type {{ slot.type }}</span>
              </span>
            </div>
          </div>

          <div v-if="detail.effects.length > 0" class="item-tooltip__section item-tooltip__effects">
            <div v-for="effect in detail.effects" :key="effect.title" class="item-tooltip__effect">
              <div>
                <span class="item-tooltip__label">{{ effect.title }}: </span>
                <span class="item-tooltip__effect-name">{{ effect.name }}</span>
              </div>

              <div v-if="effect.level" class="item-tooltip__effect-meta">
                <span class="item-tooltip__label">Level for effect:</span>
                <span class="item-tooltip__value">{{ effect.level }}</span>
              </div>

              <div
                v-if="typeof effect.chanceModifier === 'number'"
                class="item-tooltip__effect-meta"
              >
                <span class="item-tooltip__label">Effect chance modifier:</span>
                <span class="item-tooltip__value">{{ effect.chanceModifier }}%</span>
              </div>

              <div v-if="effect.castType" class="item-tooltip__effect-meta">
                <span class="item-tooltip__label">Cast type:</span>
                <span class="item-tooltip__value">{{ effect.castType }}</span>
              </div>
            </div>
          </div>

          <div v-if="detail.hasCoinValue" class="item-tooltip__section item-tooltip__coin-row">
            <span class="item-tooltip__label">Value:</span>
            <div class="item-tooltip__coins">
              <span
                v-if="detail.coinValue.pp > 0"
                class="item-tooltip__coin item-tooltip__coin--pp"
              >
                {{ detail.coinValue.pp }}pp
              </span>
              <span
                v-if="detail.coinValue.gp > 0"
                class="item-tooltip__coin item-tooltip__coin--gp"
              >
                {{ detail.coinValue.gp }}gp
              </span>
              <span
                v-if="detail.coinValue.sp > 0"
                class="item-tooltip__coin item-tooltip__coin--sp"
              >
                {{ detail.coinValue.sp }}sp
              </span>
              <span
                v-if="detail.coinValue.cp > 0"
                class="item-tooltip__coin item-tooltip__coin--cp"
              >
                {{ detail.coinValue.cp }}cp
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ItemStats } from '../services/api';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { getLootIconSrc } from '../utils/itemIcons';

type StatRow = {
  label: string;
  value: string | number;
};

type StatSection =
  | 'primary'
  | 'attributes'
  | 'heroics'
  | 'resists'
  | 'offense'
  | 'defense'
  | 'utility';

type DetailedStatRow = StatRow & {
  section: StatSection;
};

type TooltipColumn = {
  key: string;
  rows: StatRow[];
};

type TooltipEffect = {
  title: string;
  name: string;
  level?: number;
  chanceModifier?: number;
  castType?: string;
};

type CoinValue = {
  pp: number;
  gp: number;
  sp: number;
  cp: number;
};

type TooltipDetail = {
  name: string;
  icon: number;
  flags: string[];
  classDisplay: string;
  raceDisplay: string;
  slotDisplay: string;
  topColumns: TooltipColumn[];
  lowerColumns: TooltipColumn[];
  modifierRows: StatRow[];
  augmentSlots: Array<{ slot: number; type: number }>;
  effects: TooltipEffect[];
  coinValue: CoinValue;
  hasCoinValue: boolean;
};

type BasicTooltipDetail = {
  itemName: string;
  iconId: number | null;
};

const store = useItemTooltipStore();
const tooltipRef = ref<HTMLElement | null>(null);
const measuredHeight = ref(0);
const measuredWidth = ref(0);

const ITEM_TYPE_LABELS: Record<number, string> = {
  0: '1H Slashing',
  1: '2H Slashing',
  2: 'Piercing',
  3: '1H Blunt',
  4: '2H Blunt',
  5: 'Archery',
  6: 'Crossbow',
  7: 'Throwing v1',
  8: 'Shield',
  9: 'Spell',
  10: 'Armor',
  11: 'Misc',
  12: 'Lockpicks',
  13: 'Fist',
  14: 'Food',
  15: 'Drink',
  16: 'Light',
  17: 'Combinable',
  18: 'Bandages',
  19: 'Throwing v2',
  20: 'Scroll',
  21: 'Potion',
  22: 'Fletched Arrow',
  23: 'Wind Instrument',
  24: 'Stringed Instrument',
  25: 'Brass Instrument',
  26: 'Percussion Instrument',
  27: 'Arrow',
  28: 'Bolt',
  29: 'Jewelry',
  30: 'Skull',
  31: 'Book',
  32: 'Note',
  33: 'Key v1',
  34: 'Coin',
  35: '2H Piercing',
  36: 'Fishing Pole',
  37: 'Fishing Bait',
  38: 'Alcohol',
  39: 'Key v2',
  40: 'Compass',
  41: 'Metal Key',
  42: 'Poison',
  43: 'Magic Arrow',
  44: 'Magic Bolt',
  45: 'Hand to Hand',
  46: 'Item Has Effect',
  47: 'Haste Item',
  48: 'Item Has FT',
  49: 'Item Has Focus',
  50: 'Singing Instrument',
  51: 'All Instruments',
  52: 'Charm',
  53: 'Armor Dye',
  54: 'Augment',
  55: 'Augment Solvent',
  56: 'Augment Distiller',
  57: 'Alternate Ability',
  58: 'Guild Banner Kit',
  59: 'Guild Banner Modify Token',
  60: 'Cultural Armor Recipe Book',
  61: 'Cultural Weapon Recipe Book',
  62: 'Book with Spell Effect',
  63: 'Alternate Currency',
  64: 'Perfected Augment Distiller',
  65: 'Placeable',
  66: 'Collectible',
  67: 'Container',
  68: 'Mount',
  69: 'Illusion',
  70: 'Familiar',
  71: 'Unknown71',
  72: 'Unknown72',
  255: 'None'
};

const WEAPON_SKILLS: Record<number, string> = {
  0: '1HS',
  1: '2HS',
  2: '1HP',
  3: '1HB',
  4: '2HB',
  5: 'Archery',
  7: 'Throwing',
  8: 'Shield',
  35: '2HP',
  42: 'H2H'
};

const EQEMU_SKILL_TYPE_NAMES: Record<number, string> = {
  [-1]: 'Hit',
  0: '1H Blunt',
  1: '1H Slashing',
  2: '2H Blunt',
  3: '2H Slashing',
  4: 'Abjuration',
  5: 'Alteration',
  6: 'Apply Poison',
  7: 'Archery',
  8: 'Backstab',
  9: 'Bind Wound',
  10: 'Bash',
  11: 'Block',
  12: 'Brass Instruments',
  13: 'Channeling',
  14: 'Conjuration',
  15: 'Defense',
  16: 'Disarm',
  17: 'Disarm Traps',
  18: 'Divination',
  19: 'Dodge',
  20: 'Double Attack',
  21: 'Dragon Punch',
  22: 'Dual Wield',
  23: 'Eagle Strike',
  24: 'Evocation',
  25: 'Feign Death',
  26: 'Flying Kick',
  27: 'Forage',
  28: 'Hand to Hand',
  29: 'Hide',
  30: 'Kick',
  31: 'Meditate',
  32: 'Mend',
  33: 'Offense',
  34: 'Parry',
  35: 'Pick Lock',
  36: '1H Piercing',
  37: 'Riposte',
  38: 'Round Kick',
  39: 'Safe Fall',
  40: 'Sense Heading',
  41: 'Singing',
  42: 'Sneak',
  43: 'Specialize Abjuration',
  44: 'Specialize Alteration',
  45: 'Specialize Conjuration',
  46: 'Specialize Divination',
  47: 'Specialize Evocation',
  48: 'Pick Pockets',
  49: 'Stringed Instruments',
  50: 'Swimming',
  51: 'Throwing',
  52: 'Tiger Claw',
  53: 'Tracking',
  54: 'Wind Instruments',
  55: 'Fishing',
  56: 'Make Poison',
  57: 'Tinkering',
  58: 'Research',
  59: 'Alchemy',
  60: 'Baking',
  61: 'Tailoring',
  62: 'Sense Traps',
  63: 'Blacksmithing',
  64: 'Fletching',
  65: 'Brewing',
  66: 'Alcohol Tolerance',
  67: 'Begging',
  68: 'Jewelry Making',
  69: 'Pottery',
  70: 'Percussion Instruments',
  71: 'Intimidation',
  72: 'Berserking',
  73: 'Taunt',
  74: 'Frenzy',
  75: 'Remove Traps',
  76: 'Triple Attack',
  77: '2H Piercing'
};

const BARD_SKILL_TYPE_NAMES: Record<number, string> = {
  23: 'Woodwind',
  24: 'Strings',
  25: 'Brass',
  26: 'Percussion',
  50: 'Singing',
  51: 'All Instruments'
};

const SLOT_NAMES: Record<number, string> = {
  1: 'Charm',
  2: 'Ear',
  4: 'Head',
  8: 'Face',
  16: 'Ear',
  32: 'Neck',
  64: 'Shoulders',
  128: 'Arms',
  256: 'Back',
  512: 'Wrist',
  1024: 'Wrist',
  2048: 'Range',
  4096: 'Hands',
  8192: 'Primary',
  16384: 'Secondary',
  32768: 'Finger',
  65536: 'Finger',
  131072: 'Chest',
  262144: 'Legs',
  524288: 'Feet',
  1048576: 'Waist',
  2097152: 'Power Source',
  4194304: 'Ammo'
};

const CLASS_CODES: Record<number, string> = {
  1: 'WAR',
  2: 'CLR',
  4: 'PAL',
  8: 'RNG',
  16: 'SHD',
  32: 'DRU',
  64: 'MNK',
  128: 'BRD',
  256: 'ROG',
  512: 'SHM',
  1024: 'NEC',
  2048: 'WIZ',
  4096: 'MAG',
  8192: 'ENC',
  16384: 'BST',
  32768: 'BER'
};

const RACE_CODES: Record<number, string> = {
  1: 'HUM',
  2: 'BAR',
  4: 'ERU',
  8: 'ELF',
  16: 'HIE',
  32: 'DEF',
  64: 'HEF',
  128: 'DWF',
  256: 'TRL',
  512: 'OGR',
  1024: 'HFL',
  2048: 'GNM',
  4096: 'IKS',
  8192: 'VAH',
  16384: 'FRG',
  32768: 'DRK'
};

const RACE_NAMES: Record<number, string> = {
  1: 'Human',
  2: 'Barbarian',
  4: 'Erudite',
  8: 'Wood Elf',
  16: 'High Elf',
  32: 'Dark Elf',
  64: 'Half Elf',
  128: 'Dwarf',
  256: 'Troll',
  512: 'Ogre',
  1024: 'Halfling',
  2048: 'Gnome',
  4096: 'Iksar',
  8192: 'Vah Shir',
  16384: 'Froglok',
  32768: 'Drakkin'
};

const BODY_TYPE_NAMES: Record<number, string> = {
  1: 'Normal',
  2: 'Lycanthrope',
  3: 'Undead',
  4: 'Giant',
  5: 'Construct',
  6: 'Extra Planar',
  7: 'Monster',
  8: 'Undead Pet',
  9: 'Raid Giant',
  10: 'Raid Coldain',
  11: 'Untargetable',
  12: 'Vampire',
  13: 'Atenha Ra',
  14: 'Greater Akheva',
  15: 'Khati Sha',
  16: 'Seru',
  17: 'Grieg Veneficus',
  18: 'Draz Nurakk',
  19: 'God',
  20: 'Luggald',
  21: 'Animal',
  22: 'Insect',
  23: 'Fire Creature',
  24: 'Construct, Elemental, or Gargoyle',
  25: 'Plant',
  26: 'Dragon',
  27: 'Summoned Creature',
  28: 'Summoned Creature 2',
  29: 'Dragon 2',
  30: 'Velious Dragon',
  31: 'Familiar',
  32: 'Dragon 3',
  33: 'Boxes',
  34: 'Muramite',
  60: 'Untargetable 2',
  63: 'Swarm Pet',
  64: 'Monster Summoning',
  66: 'Invisible Man',
  67: 'Special'
};

const SIZE_NAMES: Record<number, string> = {
  0: 'TINY',
  1: 'SMALL',
  2: 'MEDIUM',
  3: 'LARGE',
  4: 'GIANT'
};

const CLICK_CAST_TYPES: Record<number, string> = {
  0: 'Combat',
  1: 'Clicky',
  2: 'Clicky',
  3: 'Clicky',
  4: 'Must Equip. Clicky',
  5: 'Inventory Clicky'
};

const LIGHT_NAMES: Record<number, string> = {
  9: 'Light',
  10: 'Greater Light',
  11: 'Brilliant Light',
  12: 'Shiny Light'
};

const ITEM_ELEMENT_DAMAGE_TYPE_NAMES: Record<number, string> = {
  1: 'Magic',
  2: 'Fire',
  3: 'Cold',
  4: 'Poison',
  5: 'Disease',
  6: 'Chromatic',
  7: 'Prismatic',
  9: 'Corruption'
};

const TWO_HAND_DAMAGE_BONUSES = [
  0, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14,
  14, 14, 14, 35, 35, 36, 36, 37, 37, 38, 38, 39, 39, 40, 40, 42, 42, 42, 45, 45, 47, 48, 49, 49,
  51, 51, 52, 53, 54, 54, 56, 56, 57, 58, 59, 59, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 88
];

function hasVisibleRows(rows: StatRow[]) {
  return rows.length > 0;
}

function formatMask(mask: number, values: Record<number, string>, allLabel: string) {
  if (mask <= 0 || mask >= 65535) {
    return allLabel;
  }

  const labels = Object.entries(values)
    .filter(([bit]) => (mask & Number(bit)) !== 0)
    .map(([, label]) => label);

  return labels.length > 0 ? labels.join(' ') : allLabel;
}

function formatSlotDisplay(stats: ItemStats) {
  if (stats.itemclass !== 0) {
    return 'Inventory';
  }

  const slots = Object.entries(SLOT_NAMES)
    .filter(([bit]) => (stats.slots & Number(bit)) !== 0)
    .map(([, label]) => label);

  const uniqueSlots = [...new Set(slots)];
  return uniqueSlots.length > 0 ? uniqueSlots.join(', ') : 'Inventory';
}

function formatSize(size: number) {
  return SIZE_NAMES[size] ?? 'MEDIUM';
}

function formatWeight(weight: number) {
  const normalized = weight / 10;
  return Number.isInteger(normalized) ? String(normalized.toFixed(0)) : String(normalized);
}

function formatItemTypeLabel(stats: ItemStats) {
  if (stats.damage > 0) {
    return formatItemType(stats);
  }

  if (stats.light > 0) {
    return LIGHT_NAMES[stats.light] ?? 'Light';
  }

  return formatItemType(stats);
}

function formatItemType(stats: ItemStats) {
  if (stats.itemclass === 1) return 'Container';
  if (stats.itemclass === 2) return 'Book';
  if (stats.damage > 0 && stats.itemtype < 0) return 'Weapon';
  return ITEM_TYPE_LABELS[stats.itemtype] ?? 'Item';
}

function formatSkill(stats: ItemStats) {
  if (stats.itemclass !== 0) {
    return 'Container';
  }

  if (stats.damage <= 0) {
    return formatItemType(stats);
  }

  return WEAPON_SKILLS[stats.itemtype] ?? formatItemType(stats);
}

function formatPercent(value: number) {
  return `${value}%`;
}

function calculateDamageBonus(stats: ItemStats) {
  if (stats.damage <= 0) {
    return 0;
  }

  if ([0, 2, 3, 42].includes(stats.itemtype)) {
    return 13;
  }

  if ([1, 4, 35].includes(stats.itemtype)) {
    return TWO_HAND_DAMAGE_BONUSES[stats.delay] ?? 0;
  }

  return 0;
}

function formatSkillModifier(value: number, skillType: number) {
  if (value === 0) {
    return null;
  }

  const prefix = value > 0 ? '+' : '';
  const skillName = EQEMU_SKILL_TYPE_NAMES[skillType] ?? `Skill ${skillType}`;
  return `${skillName}: ${prefix}${value}%`;
}

function formatExtraDamageSkillType(skillType: number) {
  if (skillType <= 0) {
    return null;
  }

  return (
    WEAPON_SKILLS[skillType - 1] ??
    WEAPON_SKILLS[skillType] ??
    EQEMU_SKILL_TYPE_NAMES[skillType] ??
    `Skill ${skillType}`
  );
}

function formatBardModifierType(typeId: number) {
  if (typeId <= 0) {
    return null;
  }

  return BARD_SKILL_TYPE_NAMES[typeId] ?? `Type ${typeId}`;
}

function formatItemElementDamageLabel(typeId: number) {
  const typeName = ITEM_ELEMENT_DAMAGE_TYPE_NAMES[typeId];
  return typeName ? `${typeName} Dmg` : 'Elemental Dmg';
}

function formatBaneBodyType(bodyType: number) {
  if (bodyType <= 0) {
    return null;
  }

  return BODY_TYPE_NAMES[bodyType] ?? `Body Type ${bodyType}`;
}

function formatBaneRace(raceId: number) {
  if (raceId <= 0) {
    return null;
  }

  return RACE_NAMES[raceId] ?? `Race ${raceId}`;
}

function formatCoinValue(price: number): CoinValue {
  const totalCopper = Math.max(0, price);
  return {
    pp: Math.floor(totalCopper / 1000),
    gp: Math.floor((totalCopper % 1000) / 100),
    sp: Math.floor((totalCopper % 100) / 10),
    cp: totalCopper % 10
  };
}

function getSpellName(spellId: number) {
  return store.spellNames[spellId] ?? `Spell ${spellId}`;
}

function hasVisibleStatValue(value: string | number) {
  if (typeof value === 'string') {
    return value.trim().length > 0 && value !== '0';
  }

  return Number(value) !== 0;
}

function buildEffect(
  title: string,
  spellId: number,
  level?: number,
  extra?: { chanceModifier?: number; castType?: string }
): TooltipEffect | null {
  if (spellId <= 0 || spellId >= 65535) {
    return null;
  }

  return {
    title,
    name: getSpellName(spellId),
    level: level && level > 0 ? level : undefined,
    chanceModifier: extra?.chanceModifier,
    castType: extra?.castType
  };
}

const detail = computed<TooltipDetail | null>(() => {
  const stats = store.itemStats;
  if (!stats) {
    return null;
  }

  const isWeapon = stats.damage > 0;
  const coinValue = formatCoinValue(stats.price);
  const hasCoinValue = coinValue.pp > 0 || coinValue.gp > 0 || coinValue.sp > 0 || coinValue.cp > 0;

  const flags = [
    stats.magic > 0 ? 'Magic' : null,
    stats.nodrop === 0 ? 'No Drop' : null,
    stats.attuneable > 0 ? 'Attuneable' : null
  ].filter((value): value is string => Boolean(value));
  const statDefinitions = [
    { label: 'AC', section: 'primary', value: stats.ac },
    { label: 'HP', section: 'primary', value: stats.hp },
    { label: 'Mana', section: 'primary', value: stats.mana },
    { label: 'End', section: 'primary', value: stats.endur },
    { label: 'Strength', section: 'attributes', value: stats.astr },
    { label: 'Stamina', section: 'attributes', value: stats.asta },
    { label: 'Agility', section: 'attributes', value: stats.aagi },
    { label: 'Dexterity', section: 'attributes', value: stats.adex },
    { label: 'Intelligence', section: 'attributes', value: stats.aint },
    { label: 'Wisdom', section: 'attributes', value: stats.awis },
    { label: 'Charisma', section: 'attributes', value: stats.acha },
    { label: 'Magic Resist', section: 'resists', value: stats.mr },
    { label: 'Fire Resist', section: 'resists', value: stats.fr },
    { label: 'Cold Resist', section: 'resists', value: stats.cr },
    { label: 'Disease Resist', section: 'resists', value: stats.dr },
    { label: 'Poison Resist', section: 'resists', value: stats.pr },
    { label: 'Corruption Resist', section: 'resists', value: stats.svcorruption },
    { label: 'Heroic Strength', section: 'heroics', value: stats.heroic_str },
    { label: 'Heroic Stamina', section: 'heroics', value: stats.heroic_sta },
    { label: 'Heroic Agility', section: 'heroics', value: stats.heroic_agi },
    { label: 'Heroic Dexterity', section: 'heroics', value: stats.heroic_dex },
    { label: 'Heroic Intelligence', section: 'heroics', value: stats.heroic_int },
    { label: 'Heroic Wisdom', section: 'heroics', value: stats.heroic_wis },
    { label: 'Heroic Charisma', section: 'heroics', value: stats.heroic_cha },
    { label: 'Heroic Magic Resist', section: 'heroics', value: stats.heroic_mr },
    { label: 'Heroic Fire Resist', section: 'heroics', value: stats.heroic_fr },
    { label: 'Heroic Cold Resist', section: 'heroics', value: stats.heroic_cr },
    { label: 'Heroic Disease Resist', section: 'heroics', value: stats.heroic_dr },
    { label: 'Heroic Poison Resist', section: 'heroics', value: stats.heroic_pr },
    { label: 'Heroic Corruption Resist', section: 'heroics', value: stats.heroic_svcorrup },
    { label: 'Attack', section: 'offense', value: stats.attack },
    { label: 'Haste', section: 'offense', value: stats.haste ? formatPercent(stats.haste) : 0 },
    { label: 'Accuracy', section: 'offense', value: stats.accuracy },
    {
      label: 'Strike Through',
      section: 'offense',
      value: stats.strikethrough ? formatPercent(stats.strikethrough) : 0
    },
    { label: 'Backstab Damage', section: 'offense', value: stats.backstabdmg },
    {
      label: formatItemElementDamageLabel(stats.elemdmgtype),
      section: 'offense',
      value: stats.elemdmgamt !== 0 ? `${stats.elemdmgamt}` : 0
    },
    {
      label: 'Bane Damage',
      section: 'offense',
      value:
        stats.banedmgamt !== 0
          ? `${stats.banedmgamt}${formatBaneBodyType(stats.banedmgbody) ? ` (${formatBaneBodyType(stats.banedmgbody)})` : ''}`
          : 0
    },
    {
      label: 'Bane Damage (Race)',
      section: 'offense',
      value:
        stats.banedmgraceamt !== 0
          ? `${stats.banedmgraceamt}${formatBaneRace(stats.banedmgrace) ? ` (${formatBaneRace(stats.banedmgrace)})` : ''}`
          : 0
    },
    {
      label: formatExtraDamageSkillType(stats.extradmgskill)
        ? `${formatExtraDamageSkillType(stats.extradmgskill)} Damage`
        : 'Extra Damage',
      section: 'offense',
      value: stats.extradmgamt !== 0 ? `+${stats.extradmgamt}` : 0
    },
    { label: 'Damage Shield', section: 'defense', value: stats.damageshield },
    { label: 'Damage Shield Mitigation', section: 'defense', value: stats.dsmitigation },
    {
      label: 'Shielding',
      section: 'defense',
      value: stats.shielding ? formatPercent(stats.shielding) : 0
    },
    {
      label: 'Spell Shield',
      section: 'defense',
      value: stats.spellshield ? formatPercent(stats.spellshield) : 0
    },
    {
      label: 'Avoidance',
      section: 'defense',
      value: stats.avoidance ? formatPercent(stats.avoidance) : 0
    },
    {
      label: 'Stun Resist',
      section: 'defense',
      value: stats.stunresist ? formatPercent(stats.stunresist) : 0
    },
    {
      label: 'DoT Shielding',
      section: 'defense',
      value: stats.dotshielding ? formatPercent(stats.dotshielding) : 0
    },
    { label: 'HP Regen', section: 'utility', value: stats.regen },
    { label: 'Mana Regen', section: 'utility', value: stats.manaregen },
    { label: 'End Regen', section: 'utility', value: stats.enduranceregen },
    { label: 'Heal Amount', section: 'utility', value: stats.healamt },
    { label: 'Spell Damage', section: 'utility', value: stats.spelldmg },
    { label: 'Clairvoyance', section: 'utility', value: stats.clairvoyance },
    {
      label: 'Skill Mod',
      section: 'utility',
      value: formatSkillModifier(stats.skillmodvalue, stats.skillmodtype) ?? 0
    },
    {
      label: 'Bard Modifier',
      section: 'utility',
      value:
        stats.bardvalue !== 0
          ? `${formatBardModifierType(stats.bardtype) ?? 'Instrument'}: ${stats.bardvalue}`
          : 0
    }
  ] satisfies DetailedStatRow[];
  const visibleStats = statDefinitions.filter((entry) => hasVisibleStatValue(entry.value));

  const modifierLabels = new Set(['Skill Mod', 'Bard Modifier']);
  const isModifierStat = (entry: DetailedStatRow) =>
    modifierLabels.has(entry.label) ||
    (entry.section === 'offense' &&
      entry.label.endsWith(' Damage') &&
      String(entry.value).startsWith('+'));
  const isTopDamageStat = (entry: DetailedStatRow) =>
    entry.section === 'offense' &&
    !isModifierStat(entry) &&
    (entry.label.endsWith(' Dmg') ||
      entry.label === 'Bane Damage' ||
      entry.label === 'Bane Damage (Race)');
  const statRowsForSections = (...sections: StatSection[]) =>
    visibleStats
      .filter((entry) => sections.includes(entry.section))
      .map((entry) => ({ label: entry.label, value: entry.value }));

  const overviewRows: StatRow[] = [
    { label: 'Size', value: formatSize(stats.size) },
    { label: 'Weight', value: formatWeight(stats.weight) },
    {
      label: isWeapon ? 'Skill' : 'Item Type',
      value: isWeapon ? formatSkill(stats) : formatItemTypeLabel(stats)
    }
  ];

  const primaryRows: StatRow[] = statRowsForSections('primary');

  const weaponRows: StatRow[] = isWeapon
    ? [
        { label: 'Base Damage', value: stats.damage },
        ...(stats.delay > 0 ? [{ label: 'Delay', value: stats.delay }] : []),
        ...(calculateDamageBonus(stats) > 0
          ? [{ label: 'Damage bonus', value: calculateDamageBonus(stats) }]
          : []),
        ...(stats.range > 0 ? [{ label: 'Range', value: stats.range }] : [])
      ]
    : [];
  weaponRows.push(
    ...visibleStats
      .filter(isTopDamageStat)
      .map((entry) => ({ label: entry.label, value: entry.value }))
  );

  const attributeRows: StatRow[] = statRowsForSections('attributes', 'heroics');
  const resistRows: StatRow[] = statRowsForSections('resists');
  const modifierRows: StatRow[] = visibleStats
    .filter(isModifierStat)
    .map((entry) => ({ label: entry.label, value: entry.value }));
  const supportRows: StatRow[] = [
    ...visibleStats
      .filter(
        (entry) =>
          (entry.section === 'offense' ||
            entry.section === 'defense' ||
            entry.section === 'utility') &&
          !isModifierStat(entry) &&
          !isTopDamageStat(entry)
      )
      .map((entry) => ({ label: entry.label, value: entry.value })),
    ...(stats.reqlevel > 0 ? [{ label: 'Req Level', value: stats.reqlevel }] : []),
    ...(stats.reclevel > 0 ? [{ label: 'Rec Level', value: stats.reclevel }] : [])
  ];

  const topColumns: TooltipColumn[] = [
    { key: 'overview', rows: overviewRows },
    { key: 'primary', rows: primaryRows },
    { key: 'weapon', rows: weaponRows }
  ].filter((column) => hasVisibleRows(column.rows));

  const showSupportRowsInTop =
    !isWeapon &&
    topColumns.length < 3 &&
    hasVisibleRows(supportRows) &&
    !hasVisibleRows(attributeRows) &&
    !hasVisibleRows(resistRows);

  if (showSupportRowsInTop) {
    topColumns.push({ key: 'support', rows: supportRows });
  }

  const lowerColumns: TooltipColumn[] = [
    { key: 'attributes', rows: attributeRows },
    { key: 'resists', rows: resistRows },
    ...(showSupportRowsInTop ? [] : [{ key: 'support', rows: supportRows }])
  ].filter((column) => hasVisibleRows(column.rows));

  const augmentSlots = Array.from({ length: 6 }, (_, index) => index + 1)
    .map((slot) => ({
      slot,
      type: stats[`augslot${slot}type` as keyof ItemStats] as number,
      visible: stats[`augslot${slot}visible` as keyof ItemStats] as number
    }))
    .filter((slot) => slot.visible > 0 && slot.type > 0)
    .map(({ slot, type }) => ({ slot, type }));

  const effects = [
    buildEffect(
      'Combat Effect',
      stats.proceffect,
      stats.proclevel2,
      stats.proceffect > 0 ? { chanceModifier: 100 + stats.procrate } : undefined
    ),
    buildEffect('Worn Effect', stats.worneffect, stats.wornlevel),
    buildEffect('Focus Effect', stats.focuseffect, stats.focuslevel),
    buildEffect('Click Effect', stats.clickeffect, stats.clicklevel2, {
      castType: CLICK_CAST_TYPES[stats.clicktype]
    }),
    buildEffect('Spell Scroll Effect', stats.scrolleffect)
  ].filter((effect): effect is TooltipEffect => effect !== null);

  return {
    name: stats.name,
    icon: stats.icon,
    flags,
    classDisplay: formatMask(stats.classes, CLASS_CODES, 'ALL'),
    raceDisplay: formatMask(stats.races, RACE_CODES, 'ALL'),
    slotDisplay: formatSlotDisplay(stats),
    topColumns,
    lowerColumns,
    modifierRows,
    augmentSlots,
    effects,
    coinValue,
    hasCoinValue
  };
});

const basicDetail = computed<BasicTooltipDetail | null>(() => {
  const item = store.currentItem;
  if (!item) {
    return null;
  }

  const itemName = item.itemName.trim();
  if (!itemName) {
    return null;
  }

  const iconId = item.itemIconId;
  return {
    itemName,
    iconId: iconId != null && iconId > 0 ? iconId : null
  };
});

const statGridStyle = computed(() => {
  const tooltipDetail = detail.value;
  const columnCount = tooltipDetail
    ? Math.max(tooltipDetail.topColumns.length, tooltipDetail.lowerColumns.length, 1)
    : 1;

  return {
    gridTemplateColumns: `repeat(${columnCount}, max-content)`
  };
});

watch(
  () => [store.isVisible, store.currentItem, store.itemStats, store.loading, store.error],
  async () => {
    if (!store.isVisible) {
      return;
    }

    await nextTick();
    if (tooltipRef.value) {
      measuredHeight.value = tooltipRef.value.offsetHeight;
      measuredWidth.value = tooltipRef.value.offsetWidth;
    }
  },
  { deep: true }
);

const tooltipStyle = computed(() => {
  const padding = 12;
  const gap = 18;
  const width = measuredWidth.value || 520;
  const height = measuredHeight.value || 420;
  let left = store.position.x + gap;
  let top = store.position.y + gap;

  if (left + width > window.innerWidth - padding) {
    left = store.position.x - width - gap;
  }

  if (left < padding) {
    left = Math.max(padding, window.innerWidth - width - padding);
  }

  if (top + height > window.innerHeight - padding) {
    top = store.position.y - height - gap;
  }

  if (top < padding) {
    top = padding;
  }

  return {
    left: `${left}px`,
    top: `${top}px`
  };
});
</script>

<style scoped>
.item-tooltip {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  max-width: min(650px, calc(100vw - 24px));
}

.item-tooltip__card {
  display: inline-block;
  max-width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(23, 29, 38, 0.96), rgba(14, 19, 27, 0.94));
  padding: 12px 16px;
  color: #e6e0d2;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(6px);
}

.item-tooltip__card--detail {
  padding-top: 10px;
  padding-bottom: 10px;
}

.item-tooltip__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-tooltip__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #b99a67;
}

.item-tooltip__message {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.8;
  color: #d7cfbf;
}

.item-tooltip__hero {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.item-tooltip__basic {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
}

.item-tooltip__basic-icon-shell {
  flex-shrink: 0;
  padding-top: 2px;
}

.item-tooltip__basic-icon {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 4px;
}

.item-tooltip__basic-icon--placeholder {
  border: 1px solid rgba(122, 135, 152, 0.7);
  background: linear-gradient(180deg, rgba(90, 101, 118, 0.95), rgba(53, 62, 75, 0.95));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.28);
}

.item-tooltip__basic-copy {
  min-width: 0;
}

.item-tooltip__hero-icon-shell {
  flex-shrink: 0;
  padding-top: 2px;
}

.item-tooltip__hero-icon {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 4px;
}

.item-tooltip__hero-icon--placeholder {
  border: 1px solid rgba(122, 135, 152, 0.7);
  background: linear-gradient(180deg, rgba(90, 101, 118, 0.95), rgba(53, 62, 75, 0.95));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.28);
}

.item-tooltip__hero-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-tooltip__title {
  margin: 0;
  font-size: 21px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: #f2ead9;
}

.item-tooltip__summary {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-tooltip__flag {
  color: #e9dfc5;
  font-size: 14px;
  line-height: 1.45;
}

.item-tooltip__slot-display {
  color: #e9dfc5;
  font-size: 14px;
  line-height: 1.45;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.item-tooltip__stats-grid {
  display: grid;
  justify-content: start;
  gap: 10px 16px;
}

.item-tooltip__column {
  min-width: max-content;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-tooltip__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-tooltip__pair {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  line-height: 1.45;
}

.item-tooltip__pair--numeric {
  grid-template-columns: minmax(0, 1fr) auto;
}

.item-tooltip__label {
  flex-shrink: 0;
  white-space: nowrap;
  font-weight: 600;
  color: #d8ceb4;
}

.item-tooltip__value {
  min-width: 0;
  color: #e6e0d2;
}

.item-tooltip__value--numeric {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.item-tooltip__value--wrap {
  white-space: normal;
  overflow-wrap: anywhere;
}

.item-tooltip__augment-slots {
  gap: 2px;
}

.item-tooltip__augment-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.45;
}

.item-tooltip__augment-marker {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(122, 135, 152, 0.7);
  background: linear-gradient(180deg, rgba(90, 101, 118, 0.95), rgba(53, 62, 75, 0.95));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.28);
}

.item-tooltip__augment-text {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.item-tooltip__effects {
  gap: 4px;
}

.item-tooltip__effect {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 14px;
  line-height: 1.45;
}

.item-tooltip__effect-name {
  color: #7dd3fc;
  font-weight: 600;
}

.item-tooltip__effect-meta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.item-tooltip__coin-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.item-tooltip__coins {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.item-tooltip__coin {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.item-tooltip__coin--pp {
  background: rgba(229, 231, 235, 0.16);
  color: #f8fafc;
}

.item-tooltip__coin--gp {
  background: rgba(234, 179, 8, 0.16);
  color: #facc15;
}

.item-tooltip__coin--sp {
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

.item-tooltip__coin--cp {
  background: rgba(180, 83, 9, 0.18);
  color: #fdba74;
}

@media (max-width: 640px) {
  .item-tooltip__card {
    padding: 10px 12px;
  }

  .item-tooltip__title {
    font-size: 18px;
  }

  .item-tooltip__stats-grid {
    gap: 8px 12px;
  }

  .item-tooltip__pair,
  .item-tooltip__flag,
  .item-tooltip__slot-display,
  .item-tooltip__effect,
  .item-tooltip__augment-slot {
    font-size: 13px;
  }
}

@media (any-hover: none) {
  .item-tooltip {
    display: none;
  }
}
</style>
