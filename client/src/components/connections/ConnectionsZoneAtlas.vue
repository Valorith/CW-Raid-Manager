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

          <div
            class="zone-tile__body"
            :ref="(el) => setTileBodyRef(zone.name, el)"
          >
            <svg
              v-if="getTileOverlays(zone.name).length > 0"
              class="zone-tile__overlay"
              :viewBox="`0 0 ${getTileLayout(zone.name).width} ${getTileLayout(zone.name).height}`"
              :width="getTileLayout(zone.name).width"
              :height="getTileLayout(zone.name).height"
              preserveAspectRatio="none"
            >
              <g class="zone-tile__overlay-paths">
                <path
                  v-for="overlay in getTileOverlays(zone.name)"
                  :key="`${overlay.id}-path`"
                  :d="overlay.path"
                  class="zone-overlay-path"
                  :class="`zone-overlay-path--${overlay.type}`"
                  :style="{
                    strokeWidth: `${overlay.strokeWidth}px`,
                    opacity: String(overlay.fadeOpacity)
                  }"
                />
              </g>
              <g class="zone-tile__overlay-markers">
                <g
                  v-for="overlay in getTileOverlays(zone.name)"
                  :key="`${overlay.id}-marker`"
                  class="zone-overlay-marker"
                  :class="`zone-overlay-marker--${overlay.type}`"
                  :style="{ opacity: String(overlay.fadeOpacity) }"
                  @mouseenter="showOverlayTooltip($event, overlay)"
                  @mousemove="moveOverlayTooltip($event)"
                  @mouseleave="hideOverlayTooltip()"
                >
                  <circle
                    :cx="overlay.midX"
                    :cy="overlay.midY"
                    r="9"
                    class="zone-overlay-marker__disc"
                  />
                  <text
                    :x="overlay.midX"
                    :y="overlay.midY + 3"
                    text-anchor="middle"
                    class="zone-overlay-marker__glyph"
                  >
                    {{ relationshipTypeGlyphs[overlay.type] }}
                  </text>
                </g>
              </g>
            </svg>

            <div class="zone-tile__characters">
              <button
                v-for="char in zone.characters"
                :key="char.characterId"
                :ref="(el) => setBadgeRef(char.characterId, el)"
                class="char-badge"
                :class="[
                  getCharBadgeClass(char),
                  { 'char-badge--hack': getHackRisk(char) !== 'normal' },
                  { 'char-badge--changed': recentChanges.has(char.characterId) },
                  { 'char-badge--interacting': characterInteractionMap.get(char.characterId) }
                ]"
                :title="getCharTooltip(char)"
                @click="$emit('open-character-admin', char.characterId)"
                @mouseenter="showCharSignalTooltip($event, char)"
                @mousemove="moveOverlayTooltip($event)"
                @mouseleave="hideOverlayTooltip()"
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
                <span
                  v-for="signal in getCharSignals(char.characterId)"
                  :key="`${char.characterId}-${signal.type}`"
                  class="char-badge__signal"
                  :class="[
                    `char-badge__signal--${signal.type}`,
                    `char-badge__signal--${signal.intensity}`
                  ]"
                  :title="formatActivitySignalSummary(signal)"
                >
                  {{ activityTypeGlyphs[signal.type] }}
                </span>
                <span
                  v-if="characterInteractionMap.get(char.characterId)"
                  class="char-badge__interactions"
                  :title="getInteractionTooltip(char.characterId)"
                >
                  <span class="char-badge__interactions-glyph">&#8644;</span>
                  {{ characterInteractionMap.get(char.characterId) }}
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

    <div
      v-if="hoverTooltip"
      class="zone-overlay-tooltip"
      :style="{ left: `${hoverTooltip.x + 14}px`, top: `${hoverTooltip.y + 14}px` }"
    >
      <div class="zone-overlay-tooltip__title">
        {{ hoverTooltip.title }}
      </div>
      <div
        v-for="(line, index) in hoverTooltip.lines"
        :key="index"
        class="zone-overlay-tooltip__line"
      >
        {{ line }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue';
import CoinDisplay from '../CoinDisplay.vue';
import type {
  ConnectionActivityIndicator,
  ConnectionActivityIndicatorType,
  ConnectionRelationshipOverlay,
  ConnectionRelationshipOverlayType,
  ServerConnection,
  IpExemption
} from '../../services/api';
import {
  characterClassLabels,
  characterClassIcons,
  type CharacterClass
} from '../../services/types';

const props = defineProps<{
  connections: ServerConnection[];
  ipExemptions: IpExemption[];
  relationshipOverlays?: ConnectionRelationshipOverlay[];
  activityIndicators?: ConnectionActivityIndicator[];
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
  if (tileResizeObserver) {
    tileResizeObserver.disconnect();
    tileResizeObserver = null;
  }
  if (nowInterval) {
    clearInterval(nowInterval);
    nowInterval = null;
  }
});

// ---------------------------------------------------------------------------
// Player-to-player interaction overlays (relationships + activity signals)
// ---------------------------------------------------------------------------

const EVENT_VISUAL_FULL_OPACITY_MS = 2 * 60 * 1000;
const EVENT_VISUAL_MAX_AGE_MS = 20 * 60 * 1000;
const RELATIONSHIP_CURVATURE: Record<ConnectionRelationshipOverlayType, number> = {
  trade: 18,
  bazaar: -20,
  group: 10,
  raid: 24,
  rez: -10,
  give: 14,
  money: -14
};

const relationshipTypeGlyphs: Record<ConnectionRelationshipOverlayType, string> = {
  trade: 'T',
  bazaar: '$',
  group: 'G',
  raid: 'R',
  rez: '+',
  give: 'I',
  money: 'M'
};

const relationshipTypeLabels: Record<ConnectionRelationshipOverlayType, string> = {
  trade: 'Trade',
  bazaar: 'Bazaar Sale',
  group: 'Group',
  raid: 'Raid',
  rez: 'Rez',
  give: 'Give Item',
  money: 'Split Money'
};

const activityTypeGlyphs: Record<ConnectionActivityIndicatorType, string> = {
  kill: 'K',
  loot: 'L',
  death: 'D',
  task: 'Q',
  level: 'Lv',
  zone: 'Z',
  craft: 'C',
  handin: 'H',
  discovery: '*',
  merchant: '$'
};

const activityPriority: Record<ConnectionActivityIndicatorType, number> = {
  death: 0,
  kill: 1,
  loot: 2,
  task: 3,
  merchant: 4,
  level: 5,
  craft: 6,
  handin: 7,
  discovery: 8,
  zone: 9
};

interface TileBadgePosition {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

interface TileLayout {
  width: number;
  height: number;
  badges: Map<number, TileBadgePosition>;
}

interface RenderedTileOverlay {
  id: string;
  type: ConnectionRelationshipOverlayType;
  sourceCharacterId: number;
  sourceCharacterName: string;
  targetCharacterId: number;
  targetCharacterName: string;
  count: number;
  strength: number;
  label: string;
  lastSeenAt: string;
  path: string;
  midX: number;
  midY: number;
  strokeWidth: number;
  fadeOpacity: number;
}

interface HoverTooltip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

const tileBodyElements = new Map<string, HTMLElement>();
const tileLayouts = ref<Map<string, TileLayout>>(new Map());
const layoutVersion = ref(0);
const currentTimeMs = ref(Date.now());
const hoverTooltip = ref<HoverTooltip | null>(null);
let tileResizeObserver: ResizeObserver | null = null;
let nowInterval: ReturnType<typeof setInterval> | null = null;
let layoutFrame: number | null = null;

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    tileResizeObserver = new ResizeObserver(() => scheduleLayoutRecompute());
  }
  nowInterval = setInterval(() => {
    currentTimeMs.value = Date.now();
  }, 15000);
  scheduleLayoutRecompute();
});

function setTileBodyRef(zoneName: string, element: Element | ComponentPublicInstance | null) {
  const resolved = resolveRefElement(element);
  if (resolved) {
    const previous = tileBodyElements.get(zoneName);
    if (previous && previous !== resolved && tileResizeObserver) {
      tileResizeObserver.unobserve(previous);
    }
    tileBodyElements.set(zoneName, resolved);
    if (tileResizeObserver) {
      tileResizeObserver.observe(resolved);
    }
    scheduleLayoutRecompute();
    return;
  }
  const previous = tileBodyElements.get(zoneName);
  if (previous && tileResizeObserver) {
    tileResizeObserver.unobserve(previous);
  }
  tileBodyElements.delete(zoneName);
}

function scheduleLayoutRecompute() {
  if (layoutFrame !== null) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = null;
    recomputeAllTileLayouts();
  });
}

function recomputeAllTileLayouts() {
  const next = new Map<string, TileLayout>();
  for (const [zoneName, body] of tileBodyElements.entries()) {
    const bodyRect = body.getBoundingClientRect();
    if (bodyRect.width === 0 || bodyRect.height === 0) continue;
    const badges = new Map<number, TileBadgePosition>();
    const zone = sortedZones.value.find((z) => z.name === zoneName);
    if (!zone) continue;
    for (const character of zone.characters) {
      const badge = badgeElements.get(character.characterId);
      if (!badge) continue;
      const r = badge.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      badges.set(character.characterId, {
        cx: r.left - bodyRect.left + r.width / 2,
        cy: r.top - bodyRect.top + r.height / 2,
        width: r.width,
        height: r.height
      });
    }
    next.set(zoneName, {
      width: bodyRect.width,
      height: bodyRect.height,
      badges
    });
  }
  tileLayouts.value = next;
  layoutVersion.value += 1;
}

const characterZoneMap = computed(() => {
  const result = new Map<number, string>();
  for (const conn of renderedConnections.value) {
    result.set(conn.characterId, conn.zoneName);
  }
  return result;
});

const characterNameMap = computed(() => {
  const result = new Map<number, string>();
  for (const conn of renderedConnections.value) {
    result.set(conn.characterId, conn.characterName);
  }
  return result;
});

const visibleCharacterIds = computed(() => {
  const ids = new Set<number>();
  for (const conn of filteredConnections.value) {
    ids.add(conn.characterId);
  }
  return ids;
});

function getEventFadeOpacity(timestamp: string): number {
  const ageMs = Math.max(0, currentTimeMs.value - new Date(timestamp).getTime());
  if (ageMs <= EVENT_VISUAL_FULL_OPACITY_MS) return 1;
  if (ageMs >= EVENT_VISUAL_MAX_AGE_MS) return 0;
  const fadeProgress =
    (ageMs - EVENT_VISUAL_FULL_OPACITY_MS) /
    (EVENT_VISUAL_MAX_AGE_MS - EVENT_VISUAL_FULL_OPACITY_MS);
  return Math.max(0, 1 - fadeProgress);
}

function buildCurvePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  curvature: number
): { path: string; midX: number; midY: number } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const controlX = (sourceX + targetX) / 2 + normalX * curvature;
  const controlY = (sourceY + targetY) / 2 + normalY * curvature;
  const midX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
  const midY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;
  return {
    path: `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`,
    midX,
    midY
  };
}

const tileOverlaysByZone = computed<Map<string, RenderedTileOverlay[]>>(() => {
  // Touch the layoutVersion to ensure recomputation when layout changes.
  layoutVersion.value;
  const result = new Map<string, RenderedTileOverlay[]>();
  const overlays = props.relationshipOverlays ?? [];
  if (overlays.length === 0) return result;

  const visibleIds = visibleCharacterIds.value;
  const charZone = characterZoneMap.value;

  for (const overlay of overlays) {
    if (overlay.sourceCharacterId === overlay.targetCharacterId) continue;
    if (!visibleIds.has(overlay.sourceCharacterId)) continue;
    if (!visibleIds.has(overlay.targetCharacterId)) continue;
    const sourceZone = charZone.get(overlay.sourceCharacterId);
    const targetZone = charZone.get(overlay.targetCharacterId);
    if (!sourceZone || sourceZone !== targetZone) continue;
    const layout = tileLayouts.value.get(sourceZone);
    if (!layout) continue;
    const sourcePos = layout.badges.get(overlay.sourceCharacterId);
    const targetPos = layout.badges.get(overlay.targetCharacterId);
    if (!sourcePos || !targetPos) continue;
    const fadeOpacity = getEventFadeOpacity(overlay.lastSeenAt);
    if (fadeOpacity <= 0) continue;

    const curvature = RELATIONSHIP_CURVATURE[overlay.type] ?? 14;
    const curve = buildCurvePath(
      sourcePos.cx,
      sourcePos.cy,
      targetPos.cx,
      targetPos.cy,
      curvature
    );
    const rendered: RenderedTileOverlay = {
      id: overlay.id,
      type: overlay.type,
      sourceCharacterId: overlay.sourceCharacterId,
      sourceCharacterName: overlay.sourceCharacterName,
      targetCharacterId: overlay.targetCharacterId,
      targetCharacterName: overlay.targetCharacterName,
      count: overlay.count,
      strength: overlay.strength,
      label: overlay.label,
      lastSeenAt: overlay.lastSeenAt,
      path: curve.path,
      midX: curve.midX,
      midY: curve.midY,
      strokeWidth: 1.6 + Math.min(overlay.strength, 5) * 0.45,
      fadeOpacity
    };

    const list = result.get(sourceZone);
    if (list) {
      list.push(rendered);
    } else {
      result.set(sourceZone, [rendered]);
    }
  }

  return result;
});

const characterInteractionMap = computed<Map<number, number>>(() => {
  const counts = new Map<number, number>();
  const overlays = props.relationshipOverlays ?? [];
  if (overlays.length === 0) return counts;
  const visibleIds = visibleCharacterIds.value;
  for (const overlay of overlays) {
    if (overlay.sourceCharacterId === overlay.targetCharacterId) continue;
    if (
      !visibleIds.has(overlay.sourceCharacterId) ||
      !visibleIds.has(overlay.targetCharacterId)
    ) {
      continue;
    }
    if (getEventFadeOpacity(overlay.lastSeenAt) <= 0) continue;
    counts.set(
      overlay.sourceCharacterId,
      (counts.get(overlay.sourceCharacterId) ?? 0) + overlay.count
    );
    counts.set(
      overlay.targetCharacterId,
      (counts.get(overlay.targetCharacterId) ?? 0) + overlay.count
    );
  }
  return counts;
});

const characterInteractionDetails = computed<Map<number, ConnectionRelationshipOverlay[]>>(() => {
  const result = new Map<number, ConnectionRelationshipOverlay[]>();
  const overlays = props.relationshipOverlays ?? [];
  if (overlays.length === 0) return result;
  const visibleIds = visibleCharacterIds.value;
  for (const overlay of overlays) {
    if (overlay.sourceCharacterId === overlay.targetCharacterId) continue;
    if (
      !visibleIds.has(overlay.sourceCharacterId) ||
      !visibleIds.has(overlay.targetCharacterId)
    ) {
      continue;
    }
    if (getEventFadeOpacity(overlay.lastSeenAt) <= 0) continue;
    for (const id of [overlay.sourceCharacterId, overlay.targetCharacterId]) {
      const existing = result.get(id);
      if (existing) {
        existing.push(overlay);
      } else {
        result.set(id, [overlay]);
      }
    }
  }
  return result;
});

const characterSignalsMap = computed<Map<number, ConnectionActivityIndicator[]>>(() => {
  const result = new Map<number, ConnectionActivityIndicator[]>();
  const indicators = props.activityIndicators ?? [];
  if (indicators.length === 0) return result;
  const visibleIds = visibleCharacterIds.value;
  for (const indicator of indicators) {
    if (!visibleIds.has(indicator.characterId)) continue;
    if (getEventFadeOpacity(indicator.lastSeenAt) <= 0) continue;
    const existing = result.get(indicator.characterId);
    if (existing) {
      existing.push(indicator);
    } else {
      result.set(indicator.characterId, [indicator]);
    }
  }
  for (const list of result.values()) {
    list.sort((a, b) => {
      const priorityDelta = activityPriority[a.type] - activityPriority[b.type];
      if (priorityDelta !== 0) return priorityDelta;
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
  }
  return result;
});

function getTileOverlays(zoneName: string): RenderedTileOverlay[] {
  return tileOverlaysByZone.value.get(zoneName) ?? [];
}

function getTileLayout(zoneName: string): { width: number; height: number } {
  const layout = tileLayouts.value.get(zoneName);
  return layout ? { width: layout.width, height: layout.height } : { width: 0, height: 0 };
}

function getCharSignals(characterId: number): ConnectionActivityIndicator[] {
  const list = characterSignalsMap.value.get(characterId);
  if (!list) return [];
  return list.slice(0, 2);
}

function formatRelativeTime(timestamp: string): string {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) return 'moments ago';
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function formatActivitySignalSummary(signal: ConnectionActivityIndicator): string {
  const countSuffix = signal.count > 1 ? ` x${signal.count}` : '';
  return `${signal.label}${countSuffix} - ${formatRelativeTime(signal.lastSeenAt)}`;
}

function getInteractionTooltip(characterId: number): string {
  const list = characterInteractionDetails.value.get(characterId);
  if (!list || list.length === 0) return '';
  const grouped = new Map<ConnectionRelationshipOverlayType, number>();
  for (const overlay of list) {
    grouped.set(overlay.type, (grouped.get(overlay.type) ?? 0) + overlay.count);
  }
  const parts: string[] = [];
  for (const [type, count] of grouped.entries()) {
    parts.push(`${relationshipTypeLabels[type]} x${count}`);
  }
  return parts.join('\n');
}

function showOverlayTooltip(event: MouseEvent, overlay: RenderedTileOverlay) {
  hoverTooltip.value = {
    x: event.clientX,
    y: event.clientY,
    title: relationshipTypeLabels[overlay.type],
    lines: [
      `${overlay.sourceCharacterName} <-> ${overlay.targetCharacterName}`,
      overlay.label,
      `Count: ${overlay.count}`,
      formatRelativeTime(overlay.lastSeenAt)
    ]
  };
}

function showCharSignalTooltip(event: MouseEvent, conn: ServerConnection) {
  const signals = characterSignalsMap.value.get(conn.characterId);
  const interactions = characterInteractionDetails.value.get(conn.characterId);
  if ((!signals || signals.length === 0) && (!interactions || interactions.length === 0)) {
    return;
  }
  const lines: string[] = [];
  if (interactions && interactions.length > 0) {
    lines.push('Interactions:');
    for (const overlay of interactions.slice(0, 4)) {
      const otherId =
        overlay.sourceCharacterId === conn.characterId
          ? overlay.targetCharacterId
          : overlay.sourceCharacterId;
      const otherName = characterNameMap.value.get(otherId) ?? `#${otherId}`;
      const countSuffix = overlay.count > 1 ? ` x${overlay.count}` : '';
      lines.push(
        `${relationshipTypeLabels[overlay.type]}: ${otherName}${countSuffix} - ${formatRelativeTime(overlay.lastSeenAt)}`
      );
    }
  }
  if (signals && signals.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Recent Activity:');
    for (const signal of signals.slice(0, 4)) {
      lines.push(formatActivitySignalSummary(signal));
    }
  }
  hoverTooltip.value = {
    x: event.clientX,
    y: event.clientY,
    title: conn.characterName,
    lines
  };
}

function moveOverlayTooltip(event: MouseEvent) {
  if (!hoverTooltip.value) return;
  hoverTooltip.value = {
    ...hoverTooltip.value,
    x: event.clientX,
    y: event.clientY
  };
}

function hideOverlayTooltip() {
  hoverTooltip.value = null;
}

watch(
  () => [
    renderedConnections.value,
    props.searchQuery,
    props.relationshipOverlays,
    props.activityIndicators
  ],
  () => {
    nextTick(() => scheduleLayoutRecompute());
  },
  { deep: false }
);
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

/* Activity / relationship overlays */
.zone-tile__body {
  position: relative;
}

.zone-tile__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.zone-tile__overlay-markers {
  pointer-events: auto;
}

.zone-tile__characters {
  position: relative;
  z-index: 2;
}

.zone-overlay-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
  animation: zoneOverlayDash 12s linear infinite;
  transition: opacity 0.25s ease;
  filter: drop-shadow(0 0 6px rgba(15, 23, 42, 0.45));
}

.zone-overlay-path--trade {
  stroke: rgba(251, 191, 36, 0.85);
  stroke-dasharray: 7 6;
}
.zone-overlay-path--bazaar {
  stroke: rgba(16, 185, 129, 0.85);
  stroke-dasharray: 3 6;
}
.zone-overlay-path--group {
  stroke: rgba(125, 211, 252, 0.8);
  stroke-dasharray: 10 5;
}
.zone-overlay-path--raid {
  stroke: rgba(192, 132, 252, 0.82);
  stroke-dasharray: 12 6;
}
.zone-overlay-path--rez {
  stroke: rgba(103, 232, 249, 0.86);
  stroke-dasharray: 2 4;
}
.zone-overlay-path--give {
  stroke: rgba(249, 115, 22, 0.82);
  stroke-dasharray: 8 7;
}
.zone-overlay-path--money {
  stroke: rgba(74, 222, 128, 0.82);
  stroke-dasharray: 5 5;
}

@keyframes zoneOverlayDash {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -220;
  }
}

.zone-overlay-marker {
  cursor: help;
}

.zone-overlay-marker__disc {
  fill: rgba(8, 12, 28, 0.94);
  stroke-width: 1.6;
  animation: zoneMarkerPulse 2.2s ease-in-out infinite;
}

.zone-overlay-marker__glyph {
  font-family: 'DM Sans', sans-serif;
  font-size: 9px;
  font-weight: 700;
  fill: #f8fafc;
  pointer-events: none;
}

.zone-overlay-marker--trade .zone-overlay-marker__disc {
  stroke: rgba(251, 191, 36, 0.95);
}
.zone-overlay-marker--bazaar .zone-overlay-marker__disc {
  stroke: rgba(16, 185, 129, 0.95);
}
.zone-overlay-marker--group .zone-overlay-marker__disc {
  stroke: rgba(125, 211, 252, 0.95);
}
.zone-overlay-marker--raid .zone-overlay-marker__disc {
  stroke: rgba(192, 132, 252, 0.95);
}
.zone-overlay-marker--rez .zone-overlay-marker__disc {
  stroke: rgba(103, 232, 249, 0.95);
}
.zone-overlay-marker--give .zone-overlay-marker__disc {
  stroke: rgba(249, 115, 22, 0.95);
}
.zone-overlay-marker--money .zone-overlay-marker__disc {
  stroke: rgba(74, 222, 128, 0.95);
}

@keyframes zoneMarkerPulse {
  0%,
  100% {
    opacity: 0.9;
    stroke-width: 1.6;
  }
  50% {
    opacity: 1;
    stroke-width: 2.6;
  }
}

/* Activity signal chips on character badges */
.char-badge__signal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 0.28rem;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5f5;
  border: 1px solid rgba(148, 163, 184, 0.18);
  line-height: 1;
}

.char-badge__signal--high {
  background: rgba(96, 165, 250, 0.25);
  color: #bfdbfe;
  border-color: rgba(96, 165, 250, 0.5);
  animation: signalPulse 2.4s ease-in-out infinite;
}

.char-badge__signal--medium {
  background: rgba(96, 165, 250, 0.15);
  color: #c7d2fe;
  border-color: rgba(96, 165, 250, 0.3);
}

.char-badge__signal--kill {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
}
.char-badge__signal--death {
  color: #fda4af;
  background: rgba(244, 63, 94, 0.18);
  border-color: rgba(244, 63, 94, 0.45);
}
.char-badge__signal--loot {
  color: #fcd34d;
  background: rgba(234, 179, 8, 0.18);
  border-color: rgba(234, 179, 8, 0.4);
}
.char-badge__signal--task,
.char-badge__signal--handin {
  color: #c4b5fd;
  background: rgba(168, 85, 247, 0.18);
  border-color: rgba(168, 85, 247, 0.4);
}
.char-badge__signal--level {
  color: #86efac;
  background: rgba(74, 222, 128, 0.18);
  border-color: rgba(74, 222, 128, 0.4);
}
.char-badge__signal--craft,
.char-badge__signal--discovery {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.4);
}
.char-badge__signal--merchant {
  color: #5eead4;
  background: rgba(45, 212, 191, 0.18);
  border-color: rgba(45, 212, 191, 0.4);
}
.char-badge__signal--zone {
  color: #93c5fd;
  background: rgba(96, 165, 250, 0.18);
  border-color: rgba(96, 165, 250, 0.35);
}

@keyframes signalPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(96, 165, 250, 0);
  }
  50% {
    box-shadow: 0 0 8px 1px rgba(96, 165, 250, 0.45);
  }
}

/* Interaction count chip */
.char-badge__interactions {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 0.1rem 0.34rem;
  border-radius: 4px;
  background: rgba(125, 211, 252, 0.18);
  color: #bae6fd;
  border: 1px solid rgba(125, 211, 252, 0.4);
  letter-spacing: 0.02em;
  line-height: 1;
  cursor: help;
}

.char-badge__interactions-glyph {
  font-size: 0.85rem;
  line-height: 1;
}

.char-badge--interacting {
  border-color: rgba(125, 211, 252, 0.45);
  box-shadow: 0 0 0 1px rgba(125, 211, 252, 0.18);
  animation: badgeInteractionGlow 3s ease-in-out infinite;
}

@keyframes badgeInteractionGlow {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(125, 211, 252, 0.18);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(125, 211, 252, 0.32),
      0 0 12px rgba(125, 211, 252, 0.28);
  }
}

/* Floating tooltip */
.zone-overlay-tooltip {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  padding: 0.55rem 0.75rem;
  background: rgba(8, 12, 28, 0.96);
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 0.55rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  font-family: 'DM Sans', sans-serif;
  color: #e2e8f0;
  font-size: 0.8rem;
  max-width: 320px;
  white-space: pre-line;
}

.zone-overlay-tooltip__title {
  font-weight: 700;
  font-size: 0.85rem;
  color: #bfdbfe;
  margin-bottom: 0.25rem;
}

.zone-overlay-tooltip__line {
  font-size: 0.76rem;
  color: rgba(226, 232, 240, 0.86);
  line-height: 1.35;
}
</style>
