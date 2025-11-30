<template>
  <Teleport to="body">
    <div
      v-if="store.isVisible"
      class="item-tooltip"
      :style="tooltipStyle"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <div v-if="store.loading" class="item-tooltip__loading">
        <span class="item-tooltip__spinner"></span>
        Loading...
      </div>

      <div v-else-if="store.error" class="item-tooltip__error">
        {{ store.error }}
      </div>

      <template v-else-if="store.itemStats">
        <!-- Item Name -->
        <div class="item-tooltip__name">{{ store.itemStats.name }}</div>

        <!-- Item Flags -->
        <div v-if="itemFlags.length > 0" class="item-tooltip__flags">
          <span v-for="(flag, index) in itemFlags" :key="flag" class="item-tooltip__flag">
            {{ flag }}<span v-if="index < itemFlags.length - 1" class="item-tooltip__flag-separator">•</span>
          </span>
        </div>

        <!-- Slot & AC Row -->
        <div class="item-tooltip__row">
          <span v-if="slotText" class="item-tooltip__slot">Slot: {{ slotText }}</span>
          <span v-if="store.itemStats.ac > 0" class="item-tooltip__ac">AC: {{ store.itemStats.ac }}</span>
        </div>

        <!-- Weapon Stats -->
        <div v-if="isWeapon" class="item-tooltip__section">
          <div class="item-tooltip__weapon-row">
            <span>{{ weaponSkillName }}</span>
            <span v-if="store.itemStats.damage > 0">
              Dmg: {{ store.itemStats.damage }} / Dly: {{ store.itemStats.delay }}
            </span>
            <span v-if="store.itemStats.damage > 0 && store.itemStats.delay > 0" class="item-tooltip__ratio">
              ({{ damageRatio }})
            </span>
          </div>
          <div v-if="store.itemStats.backstabdmg > 0 || store.itemStats.range > 0" class="item-tooltip__weapon-extras">
            <span v-if="store.itemStats.backstabdmg > 0">Backstab: {{ store.itemStats.backstabdmg }}</span>
            <span v-if="store.itemStats.range > 0">Range: {{ store.itemStats.range }}</span>
          </div>
        </div>

        <!-- Base Stats Grid -->
        <div v-if="hasBaseStats" class="item-tooltip__section item-tooltip__stats-grid">
          <span v-if="store.itemStats.astr !== 0" class="item-tooltip__stat-cell">
            STR: {{ formatStat(store.itemStats.astr) }}<span v-if="store.itemStats.heroic_str > 0" class="heroic"> +{{ store.itemStats.heroic_str }}</span>
          </span>
          <span v-if="store.itemStats.asta !== 0" class="item-tooltip__stat-cell">
            STA: {{ formatStat(store.itemStats.asta) }}<span v-if="store.itemStats.heroic_sta > 0" class="heroic"> +{{ store.itemStats.heroic_sta }}</span>
          </span>
          <span v-if="store.itemStats.aagi !== 0" class="item-tooltip__stat-cell">
            AGI: {{ formatStat(store.itemStats.aagi) }}<span v-if="store.itemStats.heroic_agi > 0" class="heroic"> +{{ store.itemStats.heroic_agi }}</span>
          </span>
          <span v-if="store.itemStats.adex !== 0" class="item-tooltip__stat-cell">
            DEX: {{ formatStat(store.itemStats.adex) }}<span v-if="store.itemStats.heroic_dex > 0" class="heroic"> +{{ store.itemStats.heroic_dex }}</span>
          </span>
          <span v-if="store.itemStats.awis !== 0" class="item-tooltip__stat-cell">
            WIS: {{ formatStat(store.itemStats.awis) }}<span v-if="store.itemStats.heroic_wis > 0" class="heroic"> +{{ store.itemStats.heroic_wis }}</span>
          </span>
          <span v-if="store.itemStats.aint !== 0" class="item-tooltip__stat-cell">
            INT: {{ formatStat(store.itemStats.aint) }}<span v-if="store.itemStats.heroic_int > 0" class="heroic"> +{{ store.itemStats.heroic_int }}</span>
          </span>
          <span v-if="store.itemStats.acha !== 0" class="item-tooltip__stat-cell">
            CHA: {{ formatStat(store.itemStats.acha) }}<span v-if="store.itemStats.heroic_cha > 0" class="heroic"> +{{ store.itemStats.heroic_cha }}</span>
          </span>
        </div>

        <!-- HP/Mana/End Row -->
        <div v-if="hasResources" class="item-tooltip__section item-tooltip__resources">
          <span v-if="store.itemStats.hp !== 0">HP: {{ formatNumber(store.itemStats.hp) }}</span>
          <span v-if="store.itemStats.mana !== 0">Mana: {{ formatNumber(store.itemStats.mana) }}</span>
          <span v-if="store.itemStats.endur !== 0">End: {{ formatNumber(store.itemStats.endur) }}</span>
        </div>

        <!-- Resistances Grid -->
        <div v-if="hasResists" class="item-tooltip__section item-tooltip__resists-grid">
          <span v-if="store.itemStats.fr !== 0" class="item-tooltip__resist-cell resist-fire">
            SV Fire: {{ formatStat(store.itemStats.fr) }}<span v-if="store.itemStats.heroic_fr > 0" class="heroic"> +{{ store.itemStats.heroic_fr }}</span>
          </span>
          <span v-if="store.itemStats.cr !== 0" class="item-tooltip__resist-cell resist-cold">
            SV Cold: {{ formatStat(store.itemStats.cr) }}<span v-if="store.itemStats.heroic_cr > 0" class="heroic"> +{{ store.itemStats.heroic_cr }}</span>
          </span>
          <span v-if="store.itemStats.mr !== 0" class="item-tooltip__resist-cell resist-magic">
            SV Magic: {{ formatStat(store.itemStats.mr) }}<span v-if="store.itemStats.heroic_mr > 0" class="heroic"> +{{ store.itemStats.heroic_mr }}</span>
          </span>
          <span v-if="store.itemStats.dr !== 0" class="item-tooltip__resist-cell resist-disease">
            SV Disease: {{ formatStat(store.itemStats.dr) }}<span v-if="store.itemStats.heroic_dr > 0" class="heroic"> +{{ store.itemStats.heroic_dr }}</span>
          </span>
          <span v-if="store.itemStats.pr !== 0" class="item-tooltip__resist-cell resist-poison">
            SV Poison: {{ formatStat(store.itemStats.pr) }}<span v-if="store.itemStats.heroic_pr > 0" class="heroic"> +{{ store.itemStats.heroic_pr }}</span>
          </span>
          <span v-if="store.itemStats.svcorruption !== 0" class="item-tooltip__resist-cell resist-corruption">
            SV Corrupt: {{ formatStat(store.itemStats.svcorruption) }}<span v-if="store.itemStats.heroic_svcorrup > 0" class="heroic"> +{{ store.itemStats.heroic_svcorrup }}</span>
          </span>
        </div>

        <!-- Combat Stats Grid -->
        <div v-if="hasCombatStats" class="item-tooltip__section item-tooltip__combat-grid">
          <span v-if="store.itemStats.attack > 0">Attack: {{ store.itemStats.attack }}</span>
          <span v-if="store.itemStats.haste > 0">Haste: {{ store.itemStats.haste }}%</span>
          <span v-if="store.itemStats.accuracy > 0">Accuracy: {{ store.itemStats.accuracy }}</span>
          <span v-if="store.itemStats.avoidance > 0">Avoidance: {{ store.itemStats.avoidance }}</span>
          <span v-if="store.itemStats.strikethrough > 0">Strikethrough: {{ store.itemStats.strikethrough }}%</span>
          <span v-if="store.itemStats.stunresist > 0">Stun Resist: {{ store.itemStats.stunresist }}%</span>
          <span v-if="store.itemStats.shielding > 0">Shielding: {{ store.itemStats.shielding }}%</span>
          <span v-if="store.itemStats.dotshielding > 0">DoT Shield: {{ store.itemStats.dotshielding }}%</span>
          <span v-if="store.itemStats.spelldmg > 0">Spell Dmg: {{ store.itemStats.spelldmg }}</span>
          <span v-if="store.itemStats.healamt > 0">Heal Amt: {{ store.itemStats.healamt }}</span>
          <span v-if="store.itemStats.clairvoyance > 0">Clairvoyance: {{ store.itemStats.clairvoyance }}</span>
          <span v-if="store.itemStats.damageshield > 0">Dmg Shield: {{ store.itemStats.damageshield }}</span>
          <span v-if="store.itemStats.combateffects > 0">Combat FX: {{ store.itemStats.combateffects }}</span>
        </div>

        <!-- Regen Row -->
        <div v-if="hasRegen" class="item-tooltip__section item-tooltip__regen">
          <span v-if="store.itemStats.regen > 0">HP Regen: {{ store.itemStats.regen }}</span>
          <span v-if="store.itemStats.manaregen > 0">Mana Regen: {{ store.itemStats.manaregen }}</span>
          <span v-if="store.itemStats.enduranceregen > 0">End Regen: {{ store.itemStats.enduranceregen }}</span>
        </div>

        <!-- Effects -->
        <div v-if="hasEffects" class="item-tooltip__section item-tooltip__effects">
          <div v-if="store.itemStats.worneffect > 0" class="item-tooltip__effect">
            <span class="effect-label">Worn:</span> {{ getSpellName(store.itemStats.worneffect) }}
          </div>
          <div v-if="store.itemStats.focuseffect > 0" class="item-tooltip__effect">
            <span class="effect-label">Focus:</span> {{ getSpellName(store.itemStats.focuseffect) }}
          </div>
          <div v-if="store.itemStats.clickeffect > 0" class="item-tooltip__effect">
            <span class="effect-label">Click:</span> {{ getSpellName(store.itemStats.clickeffect) }}
            <span class="item-tooltip__effect-meta">({{ clickEffectType }}<span v-if="store.itemStats.casttime > 0">, {{ (store.itemStats.casttime / 1000).toFixed(1) }}s</span>)</span>
          </div>
          <div v-if="store.itemStats.proceffect > 0" class="item-tooltip__effect">
            <span class="effect-label">Proc:</span> {{ getSpellName(store.itemStats.proceffect) }}
            <span v-if="store.itemStats.procrate > 0" class="item-tooltip__effect-meta">({{ store.itemStats.procrate }}%)</span>
          </div>
          <div v-if="store.itemStats.bardeffect > 0" class="item-tooltip__effect">
            <span class="effect-label">Bard:</span> {{ getSpellName(store.itemStats.bardeffect) }}
          </div>
        </div>

        <!-- Container Info -->
        <div v-if="isContainer" class="item-tooltip__section item-tooltip__container">
          <span>{{ store.itemStats.bagslots }} Slot Container</span>
          <span v-if="store.itemStats.bagwr > 0">{{ store.itemStats.bagwr }}% WR</span>
          <span>{{ containerSizeText }} Capacity</span>
        </div>

        <!-- Augmentation & Requirements Row -->
        <div v-if="augSlotCount > 0 || hasRequirements" class="item-tooltip__section item-tooltip__meta-row">
          <span v-if="augSlotCount > 0">Aug Slots: {{ augSlotCount }}</span>
          <span v-if="store.itemStats.reqlevel > 0" class="item-tooltip__req">Req Lvl: {{ store.itemStats.reqlevel }}</span>
          <span v-if="store.itemStats.reclevel > 0" class="item-tooltip__rec">Rec Lvl: {{ store.itemStats.reclevel }}</span>
        </div>

        <!-- Socketed Augments -->
        <div v-if="store.augmentStats.length > 0" class="item-tooltip__section item-tooltip__augments">
          <div class="item-tooltip__augments-header">Augments</div>
          <div
            v-for="aug in store.augmentStats"
            :key="aug.slotIndex"
            class="item-tooltip__augment"
          >
            <img
              v-if="aug.stats.icon"
              :src="getLootIconSrc(aug.stats.icon)"
              class="item-tooltip__augment-icon"
              alt=""
            />
            <div class="item-tooltip__augment-info">
              <div class="item-tooltip__augment-name">{{ aug.stats.name }}</div>
              <div class="item-tooltip__augment-stats">
                {{ formatAugmentStats(aug.stats) }}
              </div>
              <div v-if="getAugmentEffect(aug.stats)" class="item-tooltip__augment-effect">
                {{ getAugmentEffect(aug.stats) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Class/Race & Weight Footer -->
        <div class="item-tooltip__footer">
          <div v-if="classText" class="item-tooltip__classes">Class: {{ classText }}</div>
          <div v-if="raceText" class="item-tooltip__races">Race: {{ raceText }}</div>
          <div v-if="store.itemStats.weight > 0" class="item-tooltip__weight">WT: {{ (store.itemStats.weight / 10).toFixed(1) }}</div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { getLootIconSrc } from '../utils/itemIcons';

const store = useItemTooltipStore();

// Track if mouse is over tooltip (to prevent hiding while reading)
const isMouseOverTooltip = ref(false);

function handleMouseEnter() {
  isMouseOverTooltip.value = true;
}

function handleMouseLeave() {
  isMouseOverTooltip.value = false;
  store.hideTooltip();
}

// Position the tooltip near the cursor, adjusting for screen edges
const tooltipStyle = computed(() => {
  const padding = 15;
  const tooltipWidth = 380;
  const tooltipMaxHeight = 450; // Estimated max height for positioning calculation

  let x = store.position.x + padding;
  let y = store.position.y + padding;

  // Adjust if tooltip would go off right edge
  if (x + tooltipWidth > window.innerWidth - padding) {
    x = store.position.x - tooltipWidth - padding;
  }

  // Ensure tooltip doesn't go off left edge
  if (x < padding) {
    x = padding;
  }

  // Calculate the maximum y that keeps tooltip bottom within viewport
  const maxY = window.innerHeight - tooltipMaxHeight - padding;

  // If tooltip would extend below viewport, shift it up just enough
  if (y > maxY) {
    y = maxY;
  }

  // Ensure tooltip doesn't go above viewport top
  if (y < padding) {
    y = padding;
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
    bottom: 'auto',
    maxHeight: `${window.innerHeight - y - padding}px`
  };
});

// Item type detection
const isWeapon = computed(() => {
  if (!store.itemStats) return false;
  return store.itemStats.damage > 0 || store.itemStats.delay > 0;
});

const isContainer = computed(() => {
  if (!store.itemStats) return false;
  return store.itemStats.bagslots > 0;
});

// Damage ratio
const damageRatio = computed(() => {
  if (!store.itemStats || store.itemStats.delay === 0) return '0.00';
  return (store.itemStats.damage / store.itemStats.delay).toFixed(2);
});

// Weapon skill names
const WEAPON_SKILLS: Record<number, string> = {
  0: '1H Slashing',
  1: '2H Slashing',
  2: 'Piercing',
  3: '1H Blunt',
  4: '2H Blunt',
  5: 'Archery',
  7: 'Throwing',
  35: '2H Piercing',
  36: 'Hand to Hand',
  45: 'Martial Arts'
};

const weaponSkillName = computed(() => {
  if (!store.itemStats) return 'Unknown';
  return WEAPON_SKILLS[store.itemStats.itemtype] || 'Unknown';
});

// Item flags
// Note: In EQEmu database, nodrop/norent/notransfer use inverted logic:
// - 0 means the item HAS the restriction (NO DROP, NO RENT, etc.)
// - 255 (or non-zero) means the item does NOT have the restriction
const itemFlags = computed(() => {
  if (!store.itemStats) return [];
  const flags: string[] = [];
  if (store.itemStats.magic === 1) flags.push('MAGIC ITEM');
  // Lore: empty string = not lore, "*" = unique lore, other string = lore group
  if (store.itemStats.lore && store.itemStats.lore.length > 0) {
    flags.push('LORE ITEM');
  }
  if (store.itemStats.nodrop === 0) flags.push('NO DROP');
  if (store.itemStats.norent === 0) flags.push('NO RENT');
  if (store.itemStats.notransfer === 0) flags.push('NO TRANSFER');
  if (store.itemStats.questitemflag === 1) flags.push('QUEST ITEM');
  return flags;
});

// Equipment slots
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

const slotText = computed(() => {
  if (!store.itemStats || store.itemStats.slots === 0) return '';
  const slots: string[] = [];
  for (const [bit, name] of Object.entries(SLOT_NAMES)) {
    if (store.itemStats.slots & Number(bit)) {
      if (!slots.includes(name)) {
        slots.push(name);
      }
    }
  }
  return slots.join(', ');
});

// Class names
const CLASS_NAMES: Record<number, string> = {
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

const classText = computed(() => {
  if (!store.itemStats) return '';
  // All classes (65535 or similar) means no restriction
  if (store.itemStats.classes >= 65535 || store.itemStats.classes === 0) return 'All Classes';

  const classes: string[] = [];
  for (const [bit, name] of Object.entries(CLASS_NAMES)) {
    if (store.itemStats.classes & Number(bit)) {
      classes.push(name);
    }
  }
  return classes.length > 0 ? classes.join(' ') : 'All Classes';
});

// Race names
const RACE_NAMES: Record<number, string> = {
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

const raceText = computed(() => {
  if (!store.itemStats) return '';
  // All races (65535 or similar) means no restriction
  if (store.itemStats.races >= 65535 || store.itemStats.races === 0) return 'All Races';

  const races: string[] = [];
  for (const [bit, name] of Object.entries(RACE_NAMES)) {
    if (store.itemStats.races & Number(bit)) {
      races.push(name);
    }
  }
  return races.length > 0 ? races.join(' ') : 'All Races';
});

// Container size
const CONTAINER_SIZES: Record<number, string> = {
  0: 'TINY',
  1: 'SMALL',
  2: 'MEDIUM',
  3: 'LARGE',
  4: 'GIANT'
};

const containerSizeText = computed(() => {
  if (!store.itemStats) return '';
  return CONTAINER_SIZES[store.itemStats.bagsize] || 'Unknown';
});

// Click effect type
const clickEffectType = computed(() => {
  if (!store.itemStats) return 'Must Equip';
  switch (store.itemStats.clicktype) {
    case 1: return 'Click Anywhere';
    case 4: return 'Must Equip';
    case 5: return 'Click Anywhere';
    default: return 'Must Equip';
  }
});

// Augmentation slots count
const augSlotCount = computed(() => {
  if (!store.itemStats) return 0;
  let count = 0;
  if (store.itemStats.augslot1type > 0 && store.itemStats.augslot1visible) count++;
  if (store.itemStats.augslot2type > 0 && store.itemStats.augslot2visible) count++;
  if (store.itemStats.augslot3type > 0 && store.itemStats.augslot3visible) count++;
  if (store.itemStats.augslot4type > 0 && store.itemStats.augslot4visible) count++;
  if (store.itemStats.augslot5type > 0 && store.itemStats.augslot5visible) count++;
  if (store.itemStats.augslot6type > 0 && store.itemStats.augslot6visible) count++;
  return count;
});

// Stat checks
const hasBaseStats = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.astr !== 0 ||
    store.itemStats.asta !== 0 ||
    store.itemStats.aagi !== 0 ||
    store.itemStats.adex !== 0 ||
    store.itemStats.awis !== 0 ||
    store.itemStats.aint !== 0 ||
    store.itemStats.acha !== 0
  );
});

const hasResources = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.hp !== 0 ||
    store.itemStats.mana !== 0 ||
    store.itemStats.endur !== 0
  );
});

const hasResists = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.fr !== 0 ||
    store.itemStats.cr !== 0 ||
    store.itemStats.mr !== 0 ||
    store.itemStats.dr !== 0 ||
    store.itemStats.pr !== 0 ||
    store.itemStats.svcorruption !== 0
  );
});

const hasCombatStats = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.attack > 0 ||
    store.itemStats.haste > 0 ||
    store.itemStats.accuracy > 0 ||
    store.itemStats.avoidance > 0 ||
    store.itemStats.strikethrough > 0 ||
    store.itemStats.stunresist > 0 ||
    store.itemStats.shielding > 0 ||
    store.itemStats.dotshielding > 0 ||
    store.itemStats.spelldmg > 0 ||
    store.itemStats.healamt > 0 ||
    store.itemStats.clairvoyance > 0 ||
    store.itemStats.damageshield > 0 ||
    store.itemStats.combateffects > 0
  );
});

const hasRegen = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.regen > 0 ||
    store.itemStats.manaregen > 0 ||
    store.itemStats.enduranceregen > 0
  );
});

const hasEffects = computed(() => {
  if (!store.itemStats) return false;
  return (
    store.itemStats.worneffect > 0 ||
    store.itemStats.focuseffect > 0 ||
    store.itemStats.clickeffect > 0 ||
    store.itemStats.proceffect > 0 ||
    store.itemStats.bardeffect > 0
  );
});

const hasRequirements = computed(() => {
  if (!store.itemStats) return false;
  return store.itemStats.reqlevel > 0 || store.itemStats.reclevel > 0;
});

// Helper functions
function formatStat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function getSpellName(spellId: number): string {
  return store.spellNames[spellId] || `Unknown Spell (${spellId})`;
}

/**
 * Format key stats from an augment for compact display.
 */
function formatAugmentStats(stats: import('../services/api').ItemStats): string {
  const parts: string[] = [];

  // Base stats
  if (stats.astr !== 0) parts.push(`STR ${formatStat(stats.astr)}`);
  if (stats.asta !== 0) parts.push(`STA ${formatStat(stats.asta)}`);
  if (stats.aagi !== 0) parts.push(`AGI ${formatStat(stats.aagi)}`);
  if (stats.adex !== 0) parts.push(`DEX ${formatStat(stats.adex)}`);
  if (stats.awis !== 0) parts.push(`WIS ${formatStat(stats.awis)}`);
  if (stats.aint !== 0) parts.push(`INT ${formatStat(stats.aint)}`);
  if (stats.acha !== 0) parts.push(`CHA ${formatStat(stats.acha)}`);

  // Resources
  if (stats.hp !== 0) parts.push(`HP ${formatStat(stats.hp)}`);
  if (stats.mana !== 0) parts.push(`Mana ${formatStat(stats.mana)}`);
  if (stats.endur !== 0) parts.push(`End ${formatStat(stats.endur)}`);

  // AC
  if (stats.ac > 0) parts.push(`AC +${stats.ac}`);

  // Combat stats
  if (stats.attack > 0) parts.push(`Atk +${stats.attack}`);
  if (stats.haste > 0) parts.push(`Haste ${stats.haste}%`);
  if (stats.damage > 0) parts.push(`Dmg +${stats.damage}`);
  if (stats.spelldmg > 0) parts.push(`Spell Dmg +${stats.spelldmg}`);
  if (stats.healamt > 0) parts.push(`Heal +${stats.healamt}`);

  // Regen stats
  if (stats.regen > 0) parts.push(`HP Regen +${stats.regen}`);
  if (stats.manaregen > 0) parts.push(`Mana Regen +${stats.manaregen}`);
  if (stats.enduranceregen > 0) parts.push(`End Regen +${stats.enduranceregen}`);

  // Resistances (only if significant)
  if (stats.fr > 0) parts.push(`FR +${stats.fr}`);
  if (stats.cr > 0) parts.push(`CR +${stats.cr}`);
  if (stats.mr > 0) parts.push(`MR +${stats.mr}`);
  if (stats.dr > 0) parts.push(`DR +${stats.dr}`);
  if (stats.pr > 0) parts.push(`PR +${stats.pr}`);

  return parts.join(', ');
}

/**
 * Get the primary effect from an augment (worn, focus, etc.).
 */
function getAugmentEffect(stats: import('../services/api').ItemStats): string | null {
  if (stats.worneffect > 0) {
    return `Worn: ${getSpellName(stats.worneffect)}`;
  }
  if (stats.focuseffect > 0) {
    return `Focus: ${getSpellName(stats.focuseffect)}`;
  }
  if (stats.clickeffect > 0) {
    return `Click: ${getSpellName(stats.clickeffect)}`;
  }
  if (stats.proceffect > 0) {
    return `Proc: ${getSpellName(stats.proceffect)}`;
  }
  return null;
}
</script>

<style scoped>
.item-tooltip {
  position: fixed;
  z-index: 10000;
  min-width: 300px;
  max-width: 380px;
  padding: 10px 12px;
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.98) 0%,
    rgba(30, 41, 59, 0.98) 100%
  );
  border: 1px solid rgba(100, 116, 139, 0.4);
  border-radius: 6px;
  overflow-y: auto;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: #e2e8f0;
  pointer-events: auto;
}

.item-tooltip__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-style: italic;
}

.item-tooltip__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.item-tooltip__error {
  color: #f87171;
  font-style: italic;
}

.item-tooltip__name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.item-tooltip__flags {
  font-size: 10px;
  font-weight: 600;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.item-tooltip__flag-separator {
  margin: 0 6px;
  color: #64748b;
  font-weight: 400;
}

/* Row for inline items */
.item-tooltip__row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 4px;
}

.item-tooltip__slot {
  color: #94a3b8;
}

.item-tooltip__ac {
  color: #60a5fa;
  font-weight: 600;
}

.item-tooltip__section {
  margin: 6px 0;
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

/* Weapon stats */
.item-tooltip__weapon-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #cbd5e1;
}

.item-tooltip__ratio {
  color: #94a3b8;
  font-size: 11px;
}

.item-tooltip__weapon-extras {
  display: flex;
  gap: 12px;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

/* Stats grid - 2 columns */
.item-tooltip__stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px 12px;
}

.item-tooltip__stat-cell {
  color: #cbd5e1;
  white-space: nowrap;
}

.heroic {
  color: #fbbf24;
  font-weight: 600;
}

/* Resources row */
.item-tooltip__resources {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #86efac;
  font-weight: 500;
}

/* Resistances grid - 2 columns */
.item-tooltip__resists-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px 8px;
}

.item-tooltip__resist-cell {
  white-space: nowrap;
  font-size: 11px;
}

.resist-fire { color: #f97316; }
.resist-cold { color: #38bdf8; }
.resist-magic { color: #a78bfa; }
.resist-disease { color: #84cc16; }
.resist-poison { color: #22c55e; }
.resist-corruption { color: #ec4899; }

/* Combat stats grid - 2 columns */
.item-tooltip__combat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px 8px;
  color: #cbd5e1;
  font-size: 11px;
}

/* Regen row */
.item-tooltip__regen {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #4ade80;
  font-size: 11px;
}

/* Effects */
.item-tooltip__effects {
  color: #a5b4fc;
}

.item-tooltip__effect {
  margin: 2px 0;
  font-size: 11px;
  line-height: 1.3;
}

.effect-label {
  color: #94a3b8;
  font-weight: 500;
}

.item-tooltip__effect-meta {
  color: #64748b;
  font-size: 10px;
}

/* Container info */
.item-tooltip__container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #94a3b8;
}

/* Meta row (aug slots, requirements) */
.item-tooltip__meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
}

.item-tooltip__req {
  color: #f87171;
}

.item-tooltip__rec {
  color: #fbbf24;
}

/* Footer */
.item-tooltip__footer {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-tooltip__classes,
.item-tooltip__races {
  font-size: 11px;
  color: #94a3b8;
}

.item-tooltip__weight {
  font-size: 11px;
  color: #64748b;
}

/* Augments Section */
.item-tooltip__augments {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 8px;
}

.item-tooltip__augments-header {
  font-size: 11px;
  font-weight: 600;
  color: #a78bfa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.item-tooltip__augment {
  display: flex;
  gap: 8px;
  padding: 6px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 4px;
  margin-bottom: 4px;
}

.item-tooltip__augment:last-child {
  margin-bottom: 0;
}

.item-tooltip__augment-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 3px;
  background: #0f172a;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.item-tooltip__augment-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-tooltip__augment-name {
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tooltip__augment-stats {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.3;
}

.item-tooltip__augment-effect {
  font-size: 10px;
  color: #a5b4fc;
  font-style: italic;
}
</style>
