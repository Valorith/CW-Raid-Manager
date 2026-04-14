<template>
  <div class="zone-atlas">
    <div class="atlas-legend">
      <div class="legend-item">
        <span class="legend-dot legend-dot--city"></span>
        <span class="legend-label">Cities</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot--dungeon"></span>
        <span class="legend-label">Dungeons</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot--outdoor"></span>
        <span class="legend-label">Outdoor</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot--bazaar"></span>
        <span class="legend-label">Bazaar</span>
      </div>
      <div class="legend-divider"></div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch--watched"></span>
        <span class="legend-label">Watched</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch--associated"></span>
        <span class="legend-label">Associated</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch--danger"></span>
        <span class="legend-label">Over Limit</span>
      </div>
    </div>

    <div class="atlas-grid-wrap" ref="atlasGridRef">
      <TransitionGroup tag="div" class="atlas-grid" name="zone-tile">
        <div
          v-for="zone in sortedZones"
          :key="zone.name"
          class="zone-tile"
          :ref="(el) => setZoneTileRef(zone.name, el)"
          :class="[
            `zone-tile--${zone.category}`,
            { 'zone-tile--large': zone.characters.length >= 6 },
            { 'zone-tile--medium': zone.characters.length >= 3 && zone.characters.length < 6 }
          ]"
        >
          <div class="zone-tile__header">
            <div class="zone-tile__name-row">
              <svg
                class="zone-tile__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <template v-if="zone.category === 'city'">
                  <path
                    d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"
                  />
                </template>
                <template v-else-if="zone.category === 'bazaar'">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </template>
                <template v-else-if="zone.category === 'dungeon'">
                  <path
                    d="M12 22c-4.97 0-9-2.24-9-5v-6c0-2.76 4.03-5 9-5s9 2.24 9 5v6c0 2.76-4.03 5-9 5z"
                  />
                  <path d="M12 16c-4.97 0-9-2.24-9-5" />
                  <path d="M21 11c0 2.76-4.03 5-9 5s-9-2.24-9-5" />
                </template>
                <template v-else>
                  <path d="M17 20h4v-8l-6-4-2 1.5M7 20H3V8l8-5.5L13 4" />
                  <path d="M14 20v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5" />
                  <circle cx="17" cy="10" r="2" />
                </template>
              </svg>
              <h3 class="zone-tile__name">{{ zone.name }}</h3>
            </div>
            <div class="zone-tile__meta">
              <span class="zone-tile__count">{{ zone.characters.length }}</span>
              <span
                v-if="zone.ipCount > 1"
                class="zone-tile__ips"
                :title="`${zone.ipCount} unique IPs in this zone`"
              >
                {{ zone.ipCount }} IPs
              </span>
            </div>
          </div>

          <div class="zone-tile__body">
            <div class="zone-tile__characters">
              <button
                v-for="char in zone.characters"
                :key="char.characterId"
                :ref="(el) => setBadgeRef(char.characterId, el)"
                class="char-badge"
                :class="[
                  getCharBadgeClass(char),
                  { 'char-badge--hack': getHackRisk(char) !== 'normal' },
                  { 'char-badge--changed': recentChanges.has(char.characterId) }
                ]"
                :title="getCharTooltip(char)"
                @click="$emit('open-character-admin', char.characterId)"
              >
                <img
                  v-if="getClassIcon(char.className)"
                  :src="getClassIcon(char.className)!"
                  :alt="formatClass(char.className)"
                  class="char-badge__icon"
                  loading="lazy"
                />
                <span class="char-badge__name">{{ char.characterName }}</span>
                <span class="char-badge__level">{{ char.level }}</span>
                <span
                  v-if="char.hackCount > 0"
                  class="char-badge__hack"
                  :class="`char-badge__hack--${getHackRisk(char)}`"
                  @click.stop="$emit('open-hack-events', char.characterId)"
                >
                  {{ char.hackCount }}
                </span>
                <span
                  v-if="isTrader(char) && char.totalSalesCount && char.totalSalesCount > 0"
                  class="char-badge__sales"
                  :title="`${char.totalSalesCount} sales`"
                  @click.stop="$emit('open-trader-sales', char.characterId)"
                >
                  $
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="zone.category === 'bazaar' && zone.characters.some((c) => c.totalSalesAmount)"
            class="zone-tile__footer"
          >
            <span class="zone-tile__footer-label">Zone Revenue</span>
            <CoinDisplay
              class="zone-tile__footer-value"
              :amount-in-copper="getZoneTotalSales(zone)"
            />
          </div>
        </div>
      </TransitionGroup>

      <div class="atlas-overlay">
        <div
          v-for="badge in movingBadges"
          :key="badge.id"
          class="char-badge char-badge--overlay"
          :style="getMovingBadgeStyle(badge)"
        >
          <img
            v-if="badge.classIcon"
            :src="badge.classIcon"
            :alt="badge.classLabel"
            class="char-badge__icon"
            loading="lazy"
          />
          <span class="char-badge__name">{{ badge.characterName }}</span>
          <span class="char-badge__level">{{ badge.level }}</span>
        </div>
      </div>
    </div>

    <div v-if="sortedZones.length === 0" class="atlas-empty">
      <p>No characters match your current filter.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import CoinDisplay from '../CoinDisplay.vue';
import type { ServerConnection, IpExemption } from '../../services/api';
import {
  characterClassLabels,
  characterClassIcons,
  type CharacterClass
} from '../../services/types';

const props = defineProps<{
  connections: ServerConnection[];
  ipExemptions: IpExemption[];
  searchQuery: string;
  watchedCharacterIds: Set<number>;
  watchedAccountIds: Set<number>;
  directAssociatedIds: Set<number>;
  indirectAssociatedIds: Set<number>;
  serverHackAverage: number;
  recentChanges: Set<number>;
}>();

defineEmits<{
  'open-character-admin': [characterId: number];
  'open-hack-events': [characterId: number];
  'open-trader-sales': [characterId: number];
}>();

const DEFAULT_OUTSIDE_LIMIT = 2;

const CITY_ZONES = [
  'South Qeynos',
  'North Qeynos',
  'Surefall Glade',
  'Qeynos Hills',
  'East Freeport',
  'West Freeport',
  'North Freeport',
  'Freeport',
  'Erudin',
  'Erudin Palace',
  'Rivervale',
  'Kelethin',
  'Felwithe',
  "Ak'Anon",
  'Neriak',
  'Grobb',
  'Oggok',
  'Halas',
  'Cabilis',
  'Paineel',
  'The Bazaar',
  'Nexus',
  'Plane of Knowledge',
  'Plane of Tranquility',
  'Guild Lobby',
  'Guild Hall',
  'Shadowhaven',
  'Shar Vahl',
  "Clumsy's Home"
];

const BAZAAR_ZONES = ['The Bazaar'];

interface ZoneGroup {
  name: string;
  category: 'city' | 'dungeon' | 'outdoor' | 'bazaar';
  characters: ServerConnection[];
  ipCount: number;
}

interface MovingBadge {
  id: string;
  characterId: number;
  characterName: string;
  level: number;
  classIcon: string | null;
  classLabel: string;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  delayMs: number;
}

const ZONE_MOVE_ANIMATION_MS = 560;
const ZONE_MOVE_NEW_TILE_DELAY_MS = 140;
const renderedConnections = ref<ServerConnection[]>(props.connections);
const atlasGridRef = ref<HTMLElement | null>(null);
const movingBadges = ref<MovingBadge[]>([]);
const badgeElements = new Map<number, HTMLElement>();
const zoneTileElements = new Map<string, HTMLElement>();
let movingBadgeCounter = 0;
const movingBadgeTimeouts = new Set<ReturnType<typeof setTimeout>>();

function resolveRefElement(value: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (value instanceof HTMLElement) {
    return value;
  }

  if (value && '$el' in value && value.$el instanceof HTMLElement) {
    return value.$el;
  }

  return null;
}

function categorizeZone(zoneName: string): 'city' | 'dungeon' | 'outdoor' | 'bazaar' {
  if (BAZAAR_ZONES.includes(zoneName)) return 'bazaar';
  if (CITY_ZONES.includes(zoneName)) return 'city';
  // Heuristic: zones with certain keywords tend to be dungeons
  const lower = zoneName.toLowerCase();
  if (
    lower.includes('temple') ||
    lower.includes('crypt') ||
    lower.includes('lair') ||
    lower.includes('dungeon') ||
    lower.includes('cave') ||
    lower.includes('depths') ||
    lower.includes('plane of') ||
    lower.includes('tower') ||
    lower.includes('citadel') ||
    lower.includes('castle') ||
    lower.includes('ssra') ||
    lower.includes('vex thal') ||
    lower.includes('sanctum') ||
    lower.includes('akheva') ||
    lower.includes('acrylia')
  ) {
    return 'dungeon';
  }
  return 'outdoor';
}

const filteredConnections = computed(() => {
  const query = props.searchQuery.trim().toLowerCase();
  if (!query) return renderedConnections.value;
  return renderedConnections.value.filter(
    (conn) =>
      conn.characterName.toLowerCase().includes(query) ||
      conn.zoneName.toLowerCase().includes(query) ||
      (conn.guildName && conn.guildName.toLowerCase().includes(query)) ||
      conn.ip.includes(query)
  );
});

const sortedZones = computed((): ZoneGroup[] => {
  const zoneMap = new Map<string, ServerConnection[]>();
  for (const conn of filteredConnections.value) {
    const existing = zoneMap.get(conn.zoneName);
    if (existing) {
      existing.push(conn);
    } else {
      zoneMap.set(conn.zoneName, [conn]);
    }
  }

  return Array.from(zoneMap.entries())
    .map(([name, characters]) => ({
      name,
      category: categorizeZone(name),
      characters: characters.sort((a, b) => b.level - a.level),
      ipCount: new Set(characters.map((c) => c.ip)).size
    }))
    .sort((a, b) => b.characters.length - a.characters.length);
});

function isTrader(conn: ServerConnection): boolean {
  return conn.zoneName === 'The Bazaar' && !conn.lastKillNpcName;
}

function getClassIcon(className: string): string | null {
  return characterClassIcons[className as CharacterClass] ?? null;
}

function formatClass(className: string): string {
  return characterClassLabels[className as CharacterClass] ?? className;
}

function getIpLimit(ip: string): number {
  const exemption = props.ipExemptions.find((e) => e.ip === ip);
  return exemption ? exemption.exemptionAmount : DEFAULT_OUTSIDE_LIMIT;
}

const INACTIVE_ZONES = ["Clumsy's Home", 'The Bazaar', 'Guild Hall'];

function isOutsideHome(conn: ServerConnection): boolean {
  return !INACTIVE_ZONES.includes(conn.zoneName);
}

function getIpOutsideCount(ip: string): number {
  return props.connections.filter((c) => c.ip === ip && isOutsideHome(c)).length;
}

const HACK_RISK_MIN_COUNTS = { elevated: 5, high: 10, critical: 15 } as const;

function getHackRisk(conn: ServerConnection): string {
  if (conn.hackCount <= 0) return 'normal';
  const avg = props.serverHackAverage;
  if (avg <= 0) {
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.critical) return 'critical';
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.high) return 'high';
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.elevated) return 'elevated';
    return 'normal';
  }
  const ratio = conn.hackCount / avg;
  if (ratio >= 5 && conn.hackCount >= HACK_RISK_MIN_COUNTS.critical) return 'critical';
  if (ratio >= 3 && conn.hackCount >= HACK_RISK_MIN_COUNTS.high) return 'high';
  if (ratio >= 1.5 && conn.hackCount >= HACK_RISK_MIN_COUNTS.elevated) return 'elevated';
  return 'normal';
}

function getCharBadgeClass(conn: ServerConnection): string {
  const classes: string[] = [];
  if (
    props.watchedCharacterIds.has(conn.characterId) ||
    props.watchedAccountIds.has(conn.accountId) ||
    props.directAssociatedIds.has(conn.characterId)
  ) {
    classes.push('char-badge--watched');
  } else if (props.indirectAssociatedIds.has(conn.characterId)) {
    classes.push('char-badge--associated');
  }

  if (isOutsideHome(conn)) {
    const outsideCount = getIpOutsideCount(conn.ip);
    const limit = getIpLimit(conn.ip);
    if (outsideCount > limit) {
      classes.push('char-badge--danger');
    }
  }

  return classes.join(' ');
}

function getCharTooltip(conn: ServerConnection): string {
  const parts = [
    `${conn.characterName} - Level ${conn.level} ${formatClass(conn.className)}`,
    conn.guildName ? `Guild: ${conn.guildName}` : null,
    `IP: ${conn.ip}`,
    conn.lastKillNpcName ? `Last Kill: ${conn.lastKillNpcName}` : null,
    conn.lastSaleItemName ? `Last Sale: ${conn.lastSaleItemName}` : null
  ];
  return parts.filter(Boolean).join('\n');
}

function getZoneTotalSales(zone: ZoneGroup): number {
  return zone.characters.reduce((sum, c) => sum + (c.totalSalesAmount ?? 0), 0);
}

function setBadgeRef(characterId: number, element: Element | ComponentPublicInstance | null) {
  const resolved = resolveRefElement(element);
  if (resolved) {
    badgeElements.set(characterId, resolved);
    return;
  }
  badgeElements.delete(characterId);
}

function setZoneTileRef(zoneName: string, element: Element | ComponentPublicInstance | null) {
  const resolved = resolveRefElement(element);
  if (resolved) {
    zoneTileElements.set(zoneName, resolved);
    return;
  }
  zoneTileElements.delete(zoneName);
}

function getMovingBadgeStyle(badge: MovingBadge): Record<string, string> {
  return {
    left: `${badge.startX}px`,
    top: `${badge.startY}px`,
    '--move-x': `${badge.deltaX}px`,
    '--move-y': `${badge.deltaY}px`,
    '--move-delay': `${badge.delayMs}ms`,
    '--move-duration': `${ZONE_MOVE_ANIMATION_MS}ms`
  };
}

function queueMovingBadge(
  connection: ServerConnection,
  startRect: DOMRect,
  endRect: DOMRect,
  delayMs: number
) {
  const badge: MovingBadge = {
    id: `moving-badge-${connection.characterId}-${movingBadgeCounter++}`,
    characterId: connection.characterId,
    characterName: connection.characterName,
    level: connection.level,
    classIcon: getClassIcon(connection.className),
    classLabel: formatClass(connection.className),
    startX: startRect.left,
    startY: startRect.top,
    deltaX: endRect.left - startRect.left,
    deltaY: endRect.top - startRect.top,
    delayMs
  };

  movingBadges.value = [...movingBadges.value, badge];
  const timeout = setTimeout(
    () => {
      movingBadges.value = movingBadges.value.filter((entry) => entry.id !== badge.id);
      movingBadgeTimeouts.delete(timeout);
    },
    delayMs + ZONE_MOVE_ANIMATION_MS + 120
  );
  movingBadgeTimeouts.add(timeout);
}

watch(
  () => props.connections,
  async (nextConnections) => {
    const previousConnections = renderedConnections.value;
    const previousByCharacterId = new Map(
      previousConnections.map((connection) => [connection.characterId, connection] as const)
    );
    const previousZones = new Set(previousConnections.map((connection) => connection.zoneName));
    const previousRects = new Map<number, DOMRect>();

    for (const connection of previousConnections) {
      const badgeElement = badgeElements.get(connection.characterId);
      if (badgeElement) {
        previousRects.set(connection.characterId, badgeElement.getBoundingClientRect());
      }
    }

    renderedConnections.value = nextConnections;
    await nextTick();

    for (const connection of nextConnections) {
      const previous = previousByCharacterId.get(connection.characterId);
      if (!previous || previous.zoneName === connection.zoneName) {
        continue;
      }

      const startRect = previousRects.get(connection.characterId);
      const endElement = badgeElements.get(connection.characterId);
      if (!startRect || !endElement) {
        continue;
      }

      const destinationWasNew = !previousZones.has(connection.zoneName);
      queueMovingBadge(
        connection,
        startRect,
        endElement.getBoundingClientRect(),
        destinationWasNew ? ZONE_MOVE_NEW_TILE_DELAY_MS : 0
      );
    }
  },
  { deep: false }
);

onUnmounted(() => {
  for (const timeout of movingBadgeTimeouts) {
    clearTimeout(timeout);
  }
  movingBadgeTimeouts.clear();
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap');

.zone-atlas {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Legend Bar */
.atlas-legend {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.82rem 1.4rem;
  background: rgba(12, 18, 34, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.85rem;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot--city {
  background: #60a5fa;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.4);
}
.legend-dot--dungeon {
  background: #f87171;
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
}
.legend-dot--outdoor {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}
.legend-dot--bazaar {
  background: #c084fc;
  box-shadow: 0 0 6px rgba(192, 132, 252, 0.4);
}

.legend-divider {
  width: 1px;
  height: 20px;
  background: rgba(148, 163, 184, 0.2);
}

.legend-swatch {
  width: 18px;
  height: 10px;
  border-radius: 3px;
}

.legend-swatch--watched {
  background: rgba(249, 115, 22, 0.6);
  border: 1px solid rgba(249, 115, 22, 0.8);
}

.legend-swatch--associated {
  background: rgba(234, 179, 8, 0.5);
  border: 1px solid rgba(234, 179, 8, 0.7);
}

.legend-swatch--danger {
  background: rgba(239, 68, 68, 0.5);
  border: 1px solid rgba(239, 68, 68, 0.7);
}

/* Grid */
.atlas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.2rem;
}

.atlas-grid-wrap {
  position: relative;
}

.atlas-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}

.zone-tile-move,
.zone-tile-enter-active,
.zone-tile-leave-active {
  transition:
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease;
}

.zone-tile-enter-from,
.zone-tile-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}

.zone-tile-leave-active {
  position: absolute;
}

/* Zone Tile */
.zone-tile {
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.55);
  transition:
    border-color 0.2s ease,
    box-shadow 0.25s ease,
    transform 0.2s ease;
}

.zone-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
}

.zone-tile--large {
  grid-column: span 2;
}

@media (max-width: 768px) {
  .zone-tile--large {
    grid-column: span 1;
  }
}

/* Zone category border accents */
.zone-tile--city {
  border-top: 3px solid rgba(96, 165, 250, 0.5);
}
.zone-tile--city:hover {
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 12px 36px rgba(96, 165, 250, 0.1);
}

.zone-tile--dungeon {
  border-top: 3px solid rgba(248, 113, 113, 0.5);
}
.zone-tile--dungeon:hover {
  border-color: rgba(248, 113, 113, 0.4);
  box-shadow: 0 12px 36px rgba(248, 113, 113, 0.1);
}

.zone-tile--outdoor {
  border-top: 3px solid rgba(74, 222, 128, 0.5);
}
.zone-tile--outdoor:hover {
  border-color: rgba(74, 222, 128, 0.4);
  box-shadow: 0 12px 36px rgba(74, 222, 128, 0.1);
}

.zone-tile--bazaar {
  border-top: 3px solid rgba(192, 132, 252, 0.5);
}
.zone-tile--bazaar:hover {
  border-color: rgba(192, 132, 252, 0.4);
  box-shadow: 0 12px 36px rgba(192, 132, 252, 0.1);
}

/* Tile Header */
.zone-tile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.95rem 1.15rem;
  background: rgba(8, 12, 28, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.zone-tile__name-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.zone-tile__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  opacity: 0.5;
}

.zone-tile--city .zone-tile__icon {
  color: #60a5fa;
}
.zone-tile--dungeon .zone-tile__icon {
  color: #f87171;
}
.zone-tile--outdoor .zone-tile__icon {
  color: #4ade80;
}
.zone-tile--bazaar .zone-tile__icon {
  color: #c084fc;
}

.zone-tile__name {
  margin: 0;
  font-family: 'Crimson Pro', Georgia, serif;
  font-size: 1.18rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zone-tile__meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.zone-tile__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  color: #f8fafc;
  background: rgba(148, 163, 184, 0.18);
}

.zone-tile--city .zone-tile__count {
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
}
.zone-tile--dungeon .zone-tile__count {
  background: rgba(248, 113, 113, 0.2);
  color: #fca5a5;
}
.zone-tile--outdoor .zone-tile__count {
  background: rgba(74, 222, 128, 0.2);
  color: #86efac;
}
.zone-tile--bazaar .zone-tile__count {
  background: rgba(192, 132, 252, 0.2);
  color: #d8b4fe;
}

.zone-tile__ips {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.6);
  padding: 0.18rem 0.5rem;
  border-radius: 5px;
  background: rgba(148, 163, 184, 0.08);
}

/* Tile Body */
.zone-tile__body {
  padding: 0.95rem 1.05rem;
  flex: 1;
}

.zone-tile__characters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

/* Character Badge */
.char-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.42rem 0.72rem;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.12);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease,
    box-shadow 0.2s ease;
  font-family: 'DM Sans', sans-serif;
}

.char-badge:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.char-badge--overlay {
  position: fixed;
  z-index: 40;
  pointer-events: none;
  margin: 0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  animation:
    zoneBadgeTravel var(--move-duration) cubic-bezier(0.22, 1, 0.36, 1) var(--move-delay) both,
    zoneBadgePulse var(--move-duration) ease-out var(--move-delay) both;
}

.char-badge--watched {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.45);
  animation: badgeWatchPulse 2.5s ease-in-out infinite;
}

@keyframes badgeWatchPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(249, 115, 22, 0.25);
  }
}

.char-badge--associated {
  background: rgba(234, 179, 8, 0.1);
  border-color: rgba(234, 179, 8, 0.4);
  animation: badgeAssocPulse 2.5s ease-in-out infinite;
}

@keyframes badgeAssocPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(234, 179, 8, 0);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(234, 179, 8, 0.2);
  }
}

.char-badge--danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.4);
}

.char-badge--hack {
  position: relative;
}

.char-badge--changed {
  animation: badgeChangePulse 0.8s cubic-bezier(0.22, 1, 0.36, 1) 1;
}

@keyframes badgeChangePulse {
  0% {
    background: rgba(30, 41, 59, 0.6);
    box-shadow: none;
    transform: translateY(0) scale(1);
  }
  32% {
    background: rgba(96, 165, 250, 0.4);
    box-shadow:
      0 0 0 2px rgba(96, 165, 250, 0.18),
      0 0 18px rgba(96, 165, 250, 0.38);
    transform: translateY(-2px) scale(1.08);
  }
  62% {
    background: rgba(96, 165, 250, 0.3);
    box-shadow:
      0 0 0 1px rgba(96, 165, 250, 0.12),
      0 0 12px rgba(96, 165, 250, 0.28);
    transform: translateY(-1px) scale(1.04);
  }
  100% {
    background: rgba(30, 41, 59, 0.6);
    box-shadow: none;
    transform: translateY(0) scale(1);
  }
}

.char-badge__icon {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  object-fit: contain;
  flex-shrink: 0;
}

.char-badge__name {
  font-size: 0.92rem;
  font-weight: 650;
  color: #e2e8f0;
  white-space: nowrap;
  line-height: 1;
}

.char-badge__level {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.7);
  padding: 0.08rem 0.36rem;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.08);
}

.char-badge__hack {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.34rem;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.char-badge__hack:hover {
  transform: scale(1.15);
}

.char-badge__hack--elevated {
  background: rgba(250, 204, 21, 0.2);
  color: #facc15;
}
.char-badge__hack--high {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}
.char-badge__hack--critical {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.char-badge__sales {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2dd4bf;
  padding: 0.08rem 0.26rem;
  border-radius: 4px;
  background: rgba(45, 212, 191, 0.12);
  cursor: pointer;
  transition: background 0.15s ease;
}

.char-badge__sales:hover {
  background: rgba(45, 212, 191, 0.25);
}

@keyframes zoneBadgeTravel {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.94);
  }

  12% {
    opacity: 1;
  }

  70% {
    opacity: 1;
    transform: translate(calc(var(--move-x) * 0.82), calc(var(--move-y) * 0.82)) scale(1.03);
  }

  100% {
    opacity: 0;
    transform: translate(var(--move-x), var(--move-y)) scale(0.98);
  }
}

@keyframes zoneBadgePulse {
  0% {
    box-shadow: 0 0 0 rgba(59, 130, 246, 0);
  }

  45% {
    box-shadow: 0 0 18px rgba(96, 165, 250, 0.28);
  }

  100% {
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
  }
}

/* Tile Footer */
.zone-tile__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1.15rem;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(8, 12, 28, 0.35);
}

.zone-tile__footer-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.72rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.6);
}

.zone-tile__footer-value {
  font-size: 0.9rem;
  color: #2dd4bf;
  font-weight: 600;
}

/* Empty */
.atlas-empty {
  padding: 3rem;
  text-align: center;
  color: #64748b;
}

/* Responsive */
@media (max-width: 640px) {
  .atlas-grid {
    grid-template-columns: 1fr;
  }

  .zone-tile__name {
    font-size: 1.05rem;
  }

  .char-badge__name {
    font-size: 0.84rem;
  }
}
</style>
