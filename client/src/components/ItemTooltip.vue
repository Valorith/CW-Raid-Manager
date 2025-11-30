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
          {{ itemFlags.join(' ') }}
        </div>

        <!-- Equipment Slot -->
        <div v-if="slotText" class="item-tooltip__slot">
          Slot: {{ slotText }}
        </div>

        <!-- Weapon Stats -->
        <div v-if="isWeapon" class="item-tooltip__section">
          <div v-if="store.itemStats.damage > 0">
            Skill: {{ weaponSkillName }}
          </div>
          <div v-if="store.itemStats.damage > 0">
            Damage: {{ store.itemStats.damage }} &nbsp; Delay: {{ store.itemStats.delay }}
          </div>
          <div v-if="store.itemStats.damage > 0 && store.itemStats.delay > 0">
            Ratio: {{ damageRatio }}
          </div>
          <div v-if="store.itemStats.backstabdmg > 0">
            Backstab Dmg: {{ store.itemStats.backstabdmg }}
          </div>
          <div v-if="store.itemStats.range > 0">
            Range: {{ store.itemStats.range }}
          </div>
        </div>

        <!-- AC -->
        <div v-if="store.itemStats.ac > 0" class="item-tooltip__stat">
          AC: {{ store.itemStats.ac }}
        </div>

        <!-- Base Stats -->
        <div v-if="hasBaseStats" class="item-tooltip__section">
          <div v-if="store.itemStats.astr !== 0" class="item-tooltip__stat-line">
            STR: {{ formatStat(store.itemStats.astr) }}
            <span v-if="store.itemStats.heroic_str > 0" class="heroic">+{{ store.itemStats.heroic_str }}</span>
          </div>
          <div v-if="store.itemStats.asta !== 0" class="item-tooltip__stat-line">
            STA: {{ formatStat(store.itemStats.asta) }}
            <span v-if="store.itemStats.heroic_sta > 0" class="heroic">+{{ store.itemStats.heroic_sta }}</span>
          </div>
          <div v-if="store.itemStats.aagi !== 0" class="item-tooltip__stat-line">
            AGI: {{ formatStat(store.itemStats.aagi) }}
            <span v-if="store.itemStats.heroic_agi > 0" class="heroic">+{{ store.itemStats.heroic_agi }}</span>
          </div>
          <div v-if="store.itemStats.adex !== 0" class="item-tooltip__stat-line">
            DEX: {{ formatStat(store.itemStats.adex) }}
            <span v-if="store.itemStats.heroic_dex > 0" class="heroic">+{{ store.itemStats.heroic_dex }}</span>
          </div>
          <div v-if="store.itemStats.awis !== 0" class="item-tooltip__stat-line">
            WIS: {{ formatStat(store.itemStats.awis) }}
            <span v-if="store.itemStats.heroic_wis > 0" class="heroic">+{{ store.itemStats.heroic_wis }}</span>
          </div>
          <div v-if="store.itemStats.aint !== 0" class="item-tooltip__stat-line">
            INT: {{ formatStat(store.itemStats.aint) }}
            <span v-if="store.itemStats.heroic_int > 0" class="heroic">+{{ store.itemStats.heroic_int }}</span>
          </div>
          <div v-if="store.itemStats.acha !== 0" class="item-tooltip__stat-line">
            CHA: {{ formatStat(store.itemStats.acha) }}
            <span v-if="store.itemStats.heroic_cha > 0" class="heroic">+{{ store.itemStats.heroic_cha }}</span>
          </div>
        </div>

        <!-- HP/Mana/End -->
        <div v-if="hasResources" class="item-tooltip__section">
          <div v-if="store.itemStats.hp !== 0" class="item-tooltip__stat-line">
            HP: {{ formatNumber(store.itemStats.hp) }}
          </div>
          <div v-if="store.itemStats.mana !== 0" class="item-tooltip__stat-line">
            Mana: {{ formatNumber(store.itemStats.mana) }}
          </div>
          <div v-if="store.itemStats.endur !== 0" class="item-tooltip__stat-line">
            Endurance: {{ formatNumber(store.itemStats.endur) }}
          </div>
        </div>

        <!-- Resistances -->
        <div v-if="hasResists" class="item-tooltip__section">
          <div v-if="store.itemStats.fr !== 0" class="item-tooltip__stat-line">
            Fire: {{ formatStat(store.itemStats.fr) }}
            <span v-if="store.itemStats.heroic_fr > 0" class="heroic">+{{ store.itemStats.heroic_fr }}</span>
          </div>
          <div v-if="store.itemStats.cr !== 0" class="item-tooltip__stat-line">
            Cold: {{ formatStat(store.itemStats.cr) }}
            <span v-if="store.itemStats.heroic_cr > 0" class="heroic">+{{ store.itemStats.heroic_cr }}</span>
          </div>
          <div v-if="store.itemStats.mr !== 0" class="item-tooltip__stat-line">
            Magic: {{ formatStat(store.itemStats.mr) }}
            <span v-if="store.itemStats.heroic_mr > 0" class="heroic">+{{ store.itemStats.heroic_mr }}</span>
          </div>
          <div v-if="store.itemStats.dr !== 0" class="item-tooltip__stat-line">
            Disease: {{ formatStat(store.itemStats.dr) }}
            <span v-if="store.itemStats.heroic_dr > 0" class="heroic">+{{ store.itemStats.heroic_dr }}</span>
          </div>
          <div v-if="store.itemStats.pr !== 0" class="item-tooltip__stat-line">
            Poison: {{ formatStat(store.itemStats.pr) }}
            <span v-if="store.itemStats.heroic_pr > 0" class="heroic">+{{ store.itemStats.heroic_pr }}</span>
          </div>
          <div v-if="store.itemStats.svcorruption !== 0" class="item-tooltip__stat-line">
            Corruption: {{ formatStat(store.itemStats.svcorruption) }}
            <span v-if="store.itemStats.heroic_svcorrup > 0" class="heroic">+{{ store.itemStats.heroic_svcorrup }}</span>
          </div>
        </div>

        <!-- Combat Stats -->
        <div v-if="hasCombatStats" class="item-tooltip__section">
          <div v-if="store.itemStats.attack > 0">Attack: {{ store.itemStats.attack }}</div>
          <div v-if="store.itemStats.haste > 0">Haste: {{ store.itemStats.haste }}%</div>
          <div v-if="store.itemStats.accuracy > 0">Accuracy: {{ store.itemStats.accuracy }}</div>
          <div v-if="store.itemStats.avoidance > 0">Avoidance: {{ store.itemStats.avoidance }}</div>
          <div v-if="store.itemStats.strikethrough > 0">Strikethrough: {{ store.itemStats.strikethrough }}%</div>
          <div v-if="store.itemStats.stunresist > 0">Stun Resist: {{ store.itemStats.stunresist }}%</div>
          <div v-if="store.itemStats.shielding > 0">Shielding: {{ store.itemStats.shielding }}%</div>
          <div v-if="store.itemStats.dotshielding > 0">DoT Shielding: {{ store.itemStats.dotshielding }}%</div>
          <div v-if="store.itemStats.spelldmg > 0">Spell Damage: {{ store.itemStats.spelldmg }}</div>
          <div v-if="store.itemStats.healamt > 0">Heal Amount: {{ store.itemStats.healamt }}</div>
          <div v-if="store.itemStats.clairvoyance > 0">Clairvoyance: {{ store.itemStats.clairvoyance }}</div>
          <div v-if="store.itemStats.damageshield > 0">Damage Shield: {{ store.itemStats.damageshield }}</div>
          <div v-if="store.itemStats.combateffects > 0">Combat Effects: {{ store.itemStats.combateffects }}</div>
        </div>

        <!-- Regen -->
        <div v-if="hasRegen" class="item-tooltip__section">
          <div v-if="store.itemStats.regen > 0">HP Regen: {{ store.itemStats.regen }}</div>
          <div v-if="store.itemStats.manaregen > 0">Mana Regen: {{ store.itemStats.manaregen }}</div>
          <div v-if="store.itemStats.enduranceregen > 0">End Regen: {{ store.itemStats.enduranceregen }}</div>
        </div>

        <!-- Effects -->
        <div v-if="hasEffects" class="item-tooltip__section item-tooltip__effects">
          <div v-if="store.itemStats.worneffect > 0" class="item-tooltip__effect">
            Effect: {{ getSpellName(store.itemStats.worneffect) }} (Worn)
          </div>
          <div v-if="store.itemStats.focuseffect > 0" class="item-tooltip__effect">
            Focus: {{ getSpellName(store.itemStats.focuseffect) }}
          </div>
          <div v-if="store.itemStats.clickeffect > 0" class="item-tooltip__effect">
            Effect: {{ getSpellName(store.itemStats.clickeffect) }} ({{ clickEffectType }})
            <span v-if="store.itemStats.casttime > 0" class="item-tooltip__casttime">
              ({{ (store.itemStats.casttime / 1000).toFixed(1) }}s cast)
            </span>
          </div>
          <div v-if="store.itemStats.proceffect > 0" class="item-tooltip__effect">
            Proc: {{ getSpellName(store.itemStats.proceffect) }}
            <span v-if="store.itemStats.procrate > 0">({{ store.itemStats.procrate }}%)</span>
          </div>
          <div v-if="store.itemStats.bardeffect > 0" class="item-tooltip__effect">
            Bard Effect: {{ getSpellName(store.itemStats.bardeffect) }}
          </div>
        </div>

        <!-- Container Info -->
        <div v-if="isContainer" class="item-tooltip__section">
          <div>Container: {{ store.itemStats.bagslots }} Slot</div>
          <div v-if="store.itemStats.bagwr > 0">Weight Reduction: {{ store.itemStats.bagwr }}%</div>
          <div>Size Capacity: {{ containerSizeText }}</div>
        </div>

        <!-- Augmentation Slots -->
        <div v-if="augSlotCount > 0" class="item-tooltip__section">
          <div>Augmentation Slots: {{ augSlotCount }}</div>
        </div>

        <!-- Requirements -->
        <div v-if="hasRequirements" class="item-tooltip__section item-tooltip__requirements">
          <div v-if="store.itemStats.reqlevel > 0">Required Level: {{ store.itemStats.reqlevel }}</div>
          <div v-if="store.itemStats.reclevel > 0">Recommended Level: {{ store.itemStats.reclevel }}</div>
        </div>

        <!-- Class/Race -->
        <div v-if="classText" class="item-tooltip__classes">
          Class: {{ classText }}
        </div>
        <div v-if="raceText" class="item-tooltip__races">
          Race: {{ raceText }}
        </div>

        <!-- Weight -->
        <div v-if="store.itemStats.weight > 0" class="item-tooltip__weight">
          WT: {{ (store.itemStats.weight / 10).toFixed(1) }}
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useItemTooltipStore } from '../stores/itemTooltip';

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
  const tooltipWidth = 320;
  const tooltipMaxHeight = 500; // Estimated max height for positioning calculation

  let x = store.position.x + padding;
  let y = store.position.y + padding;
  let anchorBottom = false;

  // Adjust if tooltip would go off right edge
  if (x + tooltipWidth > window.innerWidth - padding) {
    x = store.position.x - tooltipWidth - padding;
  }

  // Ensure tooltip doesn't go off left edge
  if (x < padding) {
    x = padding;
  }

  // Check if tooltip would extend below viewport
  if (y + tooltipMaxHeight > window.innerHeight) {
    // Anchor to bottom of viewport instead
    anchorBottom = true;
  }

  // If anchoring to bottom, return bottom position instead of top
  if (anchorBottom) {
    return {
      left: `${x}px`,
      bottom: `${padding}px`,
      top: 'auto',
      maxHeight: `${window.innerHeight - padding * 2}px`
    };
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
const itemFlags = computed(() => {
  if (!store.itemStats) return [];
  const flags: string[] = [];
  if (store.itemStats.magic) flags.push('MAGIC ITEM');
  if (store.itemStats.lore && store.itemStats.lore.length > 0 && store.itemStats.lore !== '*') {
    flags.push('LORE ITEM');
  }
  if (store.itemStats.nodrop) flags.push('NO DROP');
  if (store.itemStats.norent) flags.push('NO RENT');
  if (store.itemStats.notransfer) flags.push('NO TRANSFER');
  if (store.itemStats.questitemflag) flags.push('QUEST ITEM');
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
</script>

<style scoped>
.item-tooltip {
  position: fixed;
  z-index: 10000;
  min-width: 280px;
  max-width: 360px;
  padding: 12px 14px;
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
  font-size: 13px;
  line-height: 1.5;
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
  font-size: 15px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.item-tooltip__flags {
  font-size: 11px;
  font-weight: 500;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.item-tooltip__slot {
  color: #94a3b8;
  margin-bottom: 6px;
}

.item-tooltip__section {
  margin: 8px 0;
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.item-tooltip__stat {
  color: #f1f5f9;
  font-weight: 500;
}

.item-tooltip__stat-line {
  color: #cbd5e1;
}

.item-tooltip__stat-line .heroic {
  color: #fbbf24;
  font-weight: 600;
}

.item-tooltip__effects {
  color: #a5b4fc;
}

.item-tooltip__effect {
  margin: 3px 0;
}

.item-tooltip__casttime {
  color: #94a3b8;
  font-size: 12px;
}

.item-tooltip__requirements {
  color: #f87171;
}

.item-tooltip__classes,
.item-tooltip__races {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}

.item-tooltip__weight {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}
</style>
