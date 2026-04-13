<template>
  <div class="network-graph" ref="containerRef">
    <div class="network-toolbar">
      <div class="toolbar-group">
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--active': highlightMode === 'none' }"
          @click="highlightMode = 'none'"
        >
          All
        </button>
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--active': highlightMode === 'watched' }"
          @click="highlightMode = 'watched'"
        >
          Watched
        </button>
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--active': highlightMode === 'multi' }"
          @click="highlightMode = 'multi'"
        >
          Multi-Box
        </button>
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--active': highlightMode === 'hack' }"
          @click="highlightMode = 'hack'"
        >
          Hack Risk
        </button>
      </div>

      <div class="toolbar-group toolbar-group--events">
        <span class="toolbar-caption">
          Events {{ overlayWindowHours }}h / live {{ EVENT_VISUAL_MAX_AGE_MINUTES }}m
        </span>
        <button
          class="toolbar-btn toolbar-btn--event"
          :class="{ 'toolbar-btn--active': overlayMode === 'none' }"
          @click="overlayMode = 'none'"
        >
          None
        </button>
        <button
          class="toolbar-btn toolbar-btn--event"
          :class="{ 'toolbar-btn--active': overlayMode === 'all' }"
          @click="overlayMode = 'all'"
        >
          All
        </button>
        <button
          v-for="overlayType in overlayFilterOptions"
          :key="overlayType.value"
          class="toolbar-btn toolbar-btn--event"
          :class="{ 'toolbar-btn--active': overlayMode === overlayType.value }"
          @click="overlayMode = overlayType.value"
        >
          {{ overlayType.label }}
        </button>
      </div>

      <div class="toolbar-group toolbar-group--toggles">
        <label class="toolbar-label">
          <input v-model="showActivitySignals" type="checkbox" class="toolbar-checkbox" />
          <span>Node Signals</span>
        </label>
        <label class="toolbar-label">
          <input v-model="showLabels" type="checkbox" class="toolbar-checkbox" />
          <span>Labels</span>
        </label>
      </div>
    </div>

    <div class="network-canvas" ref="canvasRef">
      <svg
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        :width="svgWidth"
        :height="svgHeight"
        class="network-svg"
      >
        <defs>
          <radialGradient id="hub-glow-blue" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(96, 165, 250, 0.35)" />
            <stop offset="100%" stop-color="rgba(96, 165, 250, 0)" />
          </radialGradient>
          <radialGradient id="hub-glow-red" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(239, 68, 68, 0.35)" />
            <stop offset="100%" stop-color="rgba(239, 68, 68, 0)" />
          </radialGradient>
          <radialGradient id="hub-glow-orange" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(249, 115, 22, 0.35)" />
            <stop offset="100%" stop-color="rgba(249, 115, 22, 0)" />
          </radialGradient>
          <filter id="glow-soft">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g class="network-edges">
          <line
            v-for="edge in edges"
            :key="edge.id"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            class="edge-line"
            :class="{
              'edge-line--dimmed': isEdgeDimmed(edge),
              'edge-line--danger': edge.overLimit
            }"
          />
        </g>

        <g v-if="visibleRelationshipOverlays.length > 0" class="relationship-overlays">
          <path
            v-for="overlay in visibleRelationshipOverlays"
            :key="`${overlay.id}-path`"
            :d="overlay.path"
            class="relationship-path"
            :class="[
              `relationship-path--${overlay.type}`,
              { 'relationship-path--dimmed': isRelationshipDimmed(overlay) }
            ]"
            :style="{
              strokeWidth: `${overlay.strokeWidth}px`,
              opacity: String(overlay.fadeOpacity)
            }"
            @mouseenter="hoveredOverlay = overlay"
            @mouseleave="hoveredOverlay = null"
          />

          <g
            v-for="overlay in visibleRelationshipOverlays"
            :key="`${overlay.id}-marker`"
            class="relationship-marker"
            :class="[
              `relationship-marker--${overlay.type}`,
              { 'relationship-marker--dimmed': isRelationshipDimmed(overlay) }
            ]"
            :style="{ opacity: String(overlay.fadeOpacity) }"
            @mouseenter="hoveredOverlay = overlay"
            @mouseleave="hoveredOverlay = null"
          >
            <circle
              :cx="overlay.midX"
              :cy="overlay.midY"
              :r="9"
              class="relationship-marker__disc"
            />
            <g
              v-if="overlay.type === 'trade'"
              class="relationship-marker__icon"
              :transform="`translate(${overlay.midX} ${overlay.midY})`"
            >
              <path d="M0 -4.5V4.5" class="relationship-marker__icon-stroke" />
              <path d="M-4.75 -2.5H4.75" class="relationship-marker__icon-stroke" />
              <path d="M-2.75 -2.5L-4.5 0.75" class="relationship-marker__icon-stroke" />
              <path d="M-2.75 -2.5L-1 0.75" class="relationship-marker__icon-stroke" />
              <path d="M1 -2.5L2.75 0.75" class="relationship-marker__icon-stroke" />
              <path d="M1 -2.5L4.5 0.75" class="relationship-marker__icon-stroke" />
              <path d="M-4.5 0.75C-4 2.35 -1.5 2.35 -1 0.75" class="relationship-marker__icon-stroke" />
              <path d="M1 0.75C1.5 2.35 4 2.35 4.5 0.75" class="relationship-marker__icon-stroke" />
            </g>
            <g
              v-else-if="overlay.type === 'bazaar'"
              class="relationship-marker__icon"
              :transform="`translate(${overlay.midX} ${overlay.midY})`"
            >
              <path
                d="M-3.8 -1.2L-2.7 -4H2.7L3.8 -1.2L2.9 4H-2.9Z"
                class="relationship-marker__icon-stroke"
              />
              <path d="M-1.8 -4C-1.6 -5 1.6 -5 1.8 -4" class="relationship-marker__icon-stroke" />
              <path d="M-1.2 -0.3H1.2" class="relationship-marker__icon-stroke" />
            </g>
            <text
              v-else
              :x="overlay.midX"
              :y="overlay.midY + 3"
              class="relationship-marker__glyph"
              text-anchor="middle"
            >
              {{ relationshipTypeGlyphs[overlay.type] }}
            </text>
          </g>
        </g>

        <g class="network-hubs">
          <g
            v-for="hub in hubs"
            :key="hub.ip"
            class="hub-node"
            :class="{
              'hub-node--dimmed': isHubDimmed(hub),
              'hub-node--warning': hub.hackStatus === 'warning',
              'hub-node--critical': hub.hackStatus === 'critical'
            }"
          >
            <circle
              :cx="hub.x"
              :cy="hub.y"
              :r="hub.radius + 12"
              :fill="
                hub.hackStatus === 'critical'
                  ? 'url(#hub-glow-red)'
                  : hub.hackStatus === 'warning'
                    ? 'url(#hub-glow-orange)'
                    : 'url(#hub-glow-blue)'
              "
              class="hub-glow"
            />
            <circle
              :cx="hub.x"
              :cy="hub.y"
              :r="hub.radius"
              class="hub-circle"
              :class="{
                'hub-circle--warning': hub.hackStatus === 'warning',
                'hub-circle--critical': hub.hackStatus === 'critical'
              }"
            />
            <text :x="hub.x" :y="hub.y - hub.radius - 8" class="hub-label" text-anchor="middle">
              {{ hub.ip }}
            </text>
            <text :x="hub.x" :y="hub.y + 4" class="hub-count" text-anchor="middle">
              {{ hub.charCount }}
            </text>
            <text
              :x="hub.x"
              :y="hub.y + hub.radius + 16"
              class="hub-active"
              :class="{
                'hub-active--warning': hub.outsideCount > 0 && hub.outsideCount <= hub.limit,
                'hub-active--danger': hub.outsideCount > hub.limit
              }"
              text-anchor="middle"
            >
              {{ hub.outsideCount }}/{{ hub.limit }}
            </text>
          </g>
        </g>

        <TransitionGroup
          tag="g"
          class="network-nodes"
          @before-enter="handleNodeBeforeEnter"
          @enter="handleNodeEnter"
          @leave="handleNodeLeave"
        >
          <g
            v-for="node in nodes"
            :key="node.characterId"
            class="char-node"
            :class="{
              'char-node--dimmed': isNodeDimmed(node),
              'char-node--watched': node.isWatched,
              'char-node--associated': node.isAssociated,
              'char-node--danger': node.overLimit,
              'char-node--changed': node.recentlyChanged
            }"
            :style="getNodeStyle(node)"
            :data-hub-x="node.hubX"
            :data-hub-y="node.hubY"
            :data-node-x="node.x"
            :data-node-y="node.y"
            @click="$emit('open-character-admin', node.characterId)"
            @mouseenter="hoveredNode = node"
            @mouseleave="hoveredNode = null"
          >
            <circle
              :cx="0"
              :cy="0"
              :r="node.radius"
              class="char-circle"
              :class="[
                `char-circle--${node.roleCategory}`,
                { 'char-circle--hack-elevated': node.hackRisk === 'elevated' },
                { 'char-circle--hack-high': node.hackRisk === 'high' },
                { 'char-circle--hack-critical': node.hackRisk === 'critical' }
              ]"
              :filter="node.hackRisk !== 'normal' ? 'url(#glow-soft)' : undefined"
            />
            <foreignObject :x="-9" :y="-9" width="18" height="18">
              <img
                v-if="node.classIcon"
                :src="node.classIcon"
                :alt="node.classLabel"
                style="width: 18px; height: 18px; border-radius: 2px; object-fit: contain"
                loading="lazy"
              />
            </foreignObject>
            <text
              v-if="showLabels"
              :x="0"
              :y="node.radius + 13"
              class="char-label"
              text-anchor="middle"
            >
              {{ node.name }}
            </text>
          </g>
        </TransitionGroup>

        <g v-if="showActivitySignals && visibleNodeSignals.length > 0" class="node-signals">
          <g
            v-for="signal in visibleNodeSignals"
            :key="signal.id"
            class="node-signal"
            :class="[
              `node-signal--${signal.type}`,
              `node-signal--${signal.intensity}`,
              { 'node-signal--dimmed': isSignalDimmed(signal) }
            ]"
            :style="{ opacity: String(signal.fadeOpacity) }"
            @mouseenter="hoveredNode = nodeMap.get(signal.characterId) ?? null"
            @mouseleave="hoveredNode = null"
          >
            <circle :cx="signal.x" :cy="signal.y" :r="8" class="node-signal__disc" />
            <text :x="signal.x" :y="signal.y + 3" class="node-signal__glyph" text-anchor="middle">
              {{ activityTypeGlyphs[signal.type] }}
            </text>
          </g>
        </g>
      </svg>

      <div
        v-if="hoveredNode"
        class="node-tooltip"
        :style="{
          left: `${hoveredNode.x + 20}px`,
          top: `${hoveredNode.y - 10}px`
        }"
      >
        <div class="tooltip-header">
          <img
            v-if="hoveredNode.classIcon"
            :src="hoveredNode.classIcon"
            class="tooltip-icon"
            loading="lazy"
          />
          <strong>{{ hoveredNode.name }}</strong>
        </div>
        <div class="tooltip-row">Level {{ hoveredNode.level }} {{ hoveredNode.classLabel }}</div>
        <div class="tooltip-row">Zone: {{ hoveredNode.zone }}</div>
        <div v-if="hoveredNode.guild" class="tooltip-row">Guild: {{ hoveredNode.guild }}</div>
        <div class="tooltip-row tooltip-row--mono">IP: {{ hoveredNode.ip }}</div>
        <div v-if="hoveredNode.hackCount > 0" class="tooltip-row tooltip-row--warn">
          Hack Events: {{ hoveredNode.hackCount }}
        </div>
        <template v-if="hoveredNode.activitySignals.length > 0">
          <div class="tooltip-divider"></div>
          <div class="tooltip-row tooltip-row--section">Recent Signals</div>
          <div
            v-for="signal in hoveredNode.activitySignals.slice(0, 3)"
            :key="`${hoveredNode.characterId}-${signal.type}`"
            class="tooltip-row"
          >
            {{ formatActivitySignalSummary(signal) }}
          </div>
        </template>
      </div>

      <div
        v-if="hoveredOverlay"
        class="overlay-tooltip"
        :style="{
          left: `${hoveredOverlay.midX + 18}px`,
          top: `${hoveredOverlay.midY - 14}px`
        }"
      >
        <div class="tooltip-header">
          <strong>{{ relationshipTypeLabels[hoveredOverlay.type] }}</strong>
        </div>
        <div class="tooltip-row">
          {{ hoveredOverlay.sourceCharacterName }} to {{ hoveredOverlay.targetCharacterName }}
        </div>
        <div class="tooltip-row">{{ hoveredOverlay.label }}</div>
        <div class="tooltip-row">Count: {{ hoveredOverlay.count }}</div>
        <div class="tooltip-row tooltip-row--mono">
          {{ formatRelativeTime(hoveredOverlay.lastSeenAt) }}
        </div>
      </div>

    </div>

    <div
      v-if="overlayMode !== 'none' && visibleRelationshipOverlays.length === 0 && filteredConnections.length > 0"
      class="overlay-empty"
    >
      No visible
      {{ overlayMode === 'all' ? 'relationship' : relationshipTypeLabels[overlayMode] }} events in
      the last {{ EVENT_VISUAL_MAX_AGE_MINUTES }} minutes.
    </div>

    <div v-if="filteredConnections.length === 0" class="network-empty">
      <p>No characters match your current filter.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import type {
  ConnectionActivityIndicator,
  ConnectionActivityIndicatorType,
  ConnectionRelationshipOverlay,
  ConnectionRelationshipOverlayType,
  IpExemption,
  ServerConnection
} from '../../services/api';
import {
  characterClassIcons,
  characterClassLabels,
  characterClassRoleCategory,
  type CharacterClass,
  type RaidRoleCategory
} from '../../services/types';

const props = defineProps<{
  connections: ServerConnection[];
  ipExemptions: IpExemption[];
  relationshipOverlays: ConnectionRelationshipOverlay[];
  activityIndicators: ConnectionActivityIndicator[];
  overlayWindowHours: number;
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

type HighlightMode = 'none' | 'watched' | 'multi' | 'hack';
type OverlayMode = 'none' | 'all' | ConnectionRelationshipOverlayType;

interface HubNode {
  ip: string;
  x: number;
  y: number;
  radius: number;
  charCount: number;
  outsideCount: number;
  limit: number;
  hackStatus: 'critical' | 'warning' | null;
  characters: ServerConnection[];
}

interface CharNode {
  characterId: number;
  name: string;
  level: number;
  classLabel: string;
  classIcon: string | null;
  roleCategory: RaidRoleCategory;
  zone: string;
  guild: string | null;
  ip: string;
  x: number;
  y: number;
  radius: number;
  hackRisk: string;
  hackCount: number;
  isWatched: boolean;
  isAssociated: boolean;
  overLimit: boolean;
  isTrader: boolean;
  recentlyChanged: boolean;
  activitySignals: ConnectionActivityIndicator[];
  hubX: number;
  hubY: number;
}

interface Edge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  overLimit: boolean;
  ip: string;
}

interface RenderedRelationshipOverlay extends ConnectionRelationshipOverlay {
  path: string;
  midX: number;
  midY: number;
  strokeWidth: number;
  fadeOpacity: number;
}

interface RenderedNodeSignal extends ConnectionActivityIndicator {
  id: string;
  x: number;
  y: number;
  fadeOpacity: number;
}

const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLElement | null>(null);
const hoveredNode = ref<CharNode | null>(null);
const hoveredOverlay = ref<RenderedRelationshipOverlay | null>(null);
const highlightMode = ref<HighlightMode>('none');
const overlayMode = ref<OverlayMode>('all');
const showLabels = ref(true);
const showActivitySignals = ref(true);

const DEFAULT_OUTSIDE_LIMIT = 2;
const INACTIVE_ZONES = ["Clumsy's Home", 'The Bazaar', 'Guild Hall'];
const HUB_RADIUS_BASE = 24;
const HUB_RADIUS_SCALE = 4;
const NODE_RADIUS = 14;
const ORBIT_RADIUS_BASE = 80;
const ORBIT_RADIUS_PER_CHAR = 10;
const MIN_CELL_SIZE = 280;
const HACK_RISK_MIN_COUNTS = { elevated: 5, high: 10, critical: 15 } as const;

const overlayFilterOptions: Array<{ value: ConnectionRelationshipOverlayType; label: string }> = [
  { value: 'trade', label: 'Trade' },
  { value: 'bazaar', label: 'Bazaar' },
  { value: 'group', label: 'Group' },
  { value: 'raid', label: 'Raid' },
  { value: 'rez', label: 'Rez' },
  { value: 'give', label: 'Give' },
  { value: 'money', label: 'Money' }
];

const relationshipTypeLabels: Record<ConnectionRelationshipOverlayType, string> = {
  trade: 'Trade',
  bazaar: 'Bazaar',
  group: 'Group',
  raid: 'Raid',
  rez: 'Rez',
  give: 'Give Item',
  money: 'Split Money'
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

const relationshipCurvature: Record<ConnectionRelationshipOverlayType, number> = {
  trade: 20,
  bazaar: -22,
  group: 10,
  raid: 28,
  rez: -10,
  give: 16,
  money: -14
};

const signalAngles = [-42, 36];
const containerWidth = ref(1200);
const currentTimeMs = ref(Date.now());

const EVENT_VISUAL_FULL_OPACITY_MS = 2 * 60 * 1000;
const EVENT_VISUAL_MAX_AGE_MS = 20 * 60 * 1000;
const EVENT_VISUAL_MAX_AGE_MINUTES = Math.round(EVENT_VISUAL_MAX_AGE_MS / 60000);
const NODE_TRANSITION_DURATION_MS = 520;

function measureContainer() {
  if (canvasRef.value) {
    containerWidth.value = canvasRef.value.clientWidth;
  }
}

let resizeObserver: ResizeObserver | null = null;
let nowInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  measureContainer();
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => measureContainer());
    resizeObserver.observe(canvasRef.value);
  }
  nowInterval = setInterval(() => {
    currentTimeMs.value = Date.now();
  }, 15000);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (nowInterval) {
    clearInterval(nowInterval);
    nowInterval = null;
  }
});

function getHackRisk(conn: ServerConnection): string {
  if (conn.hackCount <= 0) return 'normal';
  const average = props.serverHackAverage;
  if (average <= 0) {
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.critical) return 'critical';
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.high) return 'high';
    if (conn.hackCount >= HACK_RISK_MIN_COUNTS.elevated) return 'elevated';
    return 'normal';
  }

  const ratio = conn.hackCount / average;
  if (ratio >= 5 && conn.hackCount >= HACK_RISK_MIN_COUNTS.critical) return 'critical';
  if (ratio >= 3 && conn.hackCount >= HACK_RISK_MIN_COUNTS.high) return 'high';
  if (ratio >= 1.5 && conn.hackCount >= HACK_RISK_MIN_COUNTS.elevated) return 'elevated';
  return 'normal';
}

function isOutsideHome(conn: ServerConnection): boolean {
  return !INACTIVE_ZONES.includes(conn.zoneName);
}

function getIpLimit(ip: string): number {
  const exemption = props.ipExemptions.find((entry) => entry.ip === ip);
  return exemption ? exemption.exemptionAmount : DEFAULT_OUTSIDE_LIMIT;
}

function getIpHackStatus(connections: ServerConnection[]): 'critical' | 'warning' | null {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let hasCritical = false;
  let hasWarning = false;

  for (const connection of connections) {
    if (connection.lastHackAt) {
      const hackTime = new Date(connection.lastHackAt);
      if (hackTime >= oneHourAgo) {
        hasCritical = true;
        break;
      }
      if (hackTime >= twentyFourHoursAgo) {
        hasWarning = true;
      }
    }
  }

  if (hasCritical) return 'critical';
  if (hasWarning) return 'warning';
  return null;
}

function isWatched(conn: ServerConnection): boolean {
  return (
    props.watchedCharacterIds.has(conn.characterId) ||
    props.watchedAccountIds.has(conn.accountId) ||
    props.directAssociatedIds.has(conn.characterId)
  );
}

function isAssociated(conn: ServerConnection): boolean {
  return props.indirectAssociatedIds.has(conn.characterId);
}

function compareDatesDesc(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
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
  return `${signal.label}${countSuffix} ${formatRelativeTime(signal.lastSeenAt)}`;
}

function buildNodeTransform(x: number, y: number, scale: number = 1): string {
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function getEventFadeOpacity(timestamp: string): number {
  const ageMs = Math.max(0, currentTimeMs.value - new Date(timestamp).getTime());
  if (ageMs <= EVENT_VISUAL_FULL_OPACITY_MS) {
    return 1;
  }
  if (ageMs >= EVENT_VISUAL_MAX_AGE_MS) {
    return 0;
  }

  const fadeProgress =
    (ageMs - EVENT_VISUAL_FULL_OPACITY_MS) /
    (EVENT_VISUAL_MAX_AGE_MS - EVENT_VISUAL_FULL_OPACITY_MS);
  return Math.max(0, 1 - fadeProgress);
}

const filteredConnections = computed(() => {
  const query = props.searchQuery.trim().toLowerCase();
  if (!query) return props.connections;

  return props.connections.filter((connection) => {
    return (
      connection.characterName.toLowerCase().includes(query) ||
      connection.zoneName.toLowerCase().includes(query) ||
      (connection.guildName && connection.guildName.toLowerCase().includes(query)) ||
      connection.ip.includes(query)
    );
  });
});

const activitySignalsByCharacterId = computed(() => {
  const filteredIds = new Set(
    filteredConnections.value.map((connection) => connection.characterId)
  );
  const result = new Map<number, ConnectionActivityIndicator[]>();

  for (const indicator of props.activityIndicators) {
    if (!filteredIds.has(indicator.characterId)) {
      continue;
    }

    const existing = result.get(indicator.characterId);
    if (existing) {
      existing.push(indicator);
    } else {
      result.set(indicator.characterId, [indicator]);
    }
  }

  for (const indicators of result.values()) {
    indicators.sort((left, right) => {
      const priorityDelta = activityPriority[left.type] - activityPriority[right.type];
      if (priorityDelta !== 0) return priorityDelta;
      if (right.count !== left.count) return right.count - left.count;
      return compareDatesDesc(left.lastSeenAt, right.lastSeenAt);
    });
  }

  return result;
});

const layout = computed(() => {
  const connections = filteredConnections.value;
  if (connections.length === 0) {
    return { hubs: [], nodes: [], edges: [], width: 0, height: 0 };
  }

  const ipMap = new Map<string, ServerConnection[]>();
  for (const connection of connections) {
    const existing = ipMap.get(connection.ip);
    if (existing) {
      existing.push(connection);
    } else {
      ipMap.set(connection.ip, [connection]);
    }
  }

  const ipGroups = Array.from(ipMap.entries()).sort(
    (left, right) => right[1].length - left[1].length
  );
  const maxCharacters = Math.max(...ipGroups.map(([, characters]) => characters.length), 1);
  const maxOrbit = ORBIT_RADIUS_BASE + Math.min(maxCharacters, 12) * ORBIT_RADIUS_PER_CHAR;
  const dynamicCellSize = Math.max(MIN_CELL_SIZE, (maxOrbit + NODE_RADIUS + 30) * 2);
  const availableWidth = Math.max(containerWidth.value - 4, 600);
  const columns = Math.max(1, Math.floor(availableWidth / dynamicCellSize));
  const cellWidth = availableWidth / columns;
  const cellHeight = dynamicCellSize;
  const padding = 20;

  const hubs: HubNode[] = [];
  const nodes: CharNode[] = [];
  const edges: Edge[] = [];

  ipGroups.forEach(([ip, characters], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const hubX = padding + column * cellWidth + cellWidth / 2;
    const hubY = padding + row * cellHeight + cellHeight / 2;
    const outsideCount = characters.filter(isOutsideHome).length;
    const limit = getIpLimit(ip);
    const hubRadius = HUB_RADIUS_BASE + Math.min(characters.length, 8) * HUB_RADIUS_SCALE;

    hubs.push({
      ip,
      x: hubX,
      y: hubY,
      radius: hubRadius,
      charCount: characters.length,
      outsideCount,
      limit,
      hackStatus: getIpHackStatus(characters),
      characters
    });

    const orbitRadius = ORBIT_RADIUS_BASE + Math.min(characters.length, 12) * ORBIT_RADIUS_PER_CHAR;
    const angleStep = (2 * Math.PI) / characters.length;

    characters.forEach((connection, indexWithinIp) => {
      const angle = angleStep * indexWithinIp - Math.PI / 2;
      const nodeX = hubX + orbitRadius * Math.cos(angle);
      const nodeY = hubY + orbitRadius * Math.sin(angle);
      const overLimit = isOutsideHome(connection) && outsideCount > limit;

      nodes.push({
        characterId: connection.characterId,
        name: connection.characterName,
        level: connection.level,
        classLabel:
          characterClassLabels[connection.className as CharacterClass] ?? connection.className,
        classIcon: characterClassIcons[connection.className as CharacterClass] ?? null,
        roleCategory: characterClassRoleCategory[connection.className as CharacterClass] ?? 'DPS',
        zone: connection.zoneName,
        guild: connection.guildName,
        ip: connection.ip,
        x: nodeX,
        y: nodeY,
        radius: NODE_RADIUS,
        hackRisk: getHackRisk(connection),
        hackCount: connection.hackCount,
        isWatched: isWatched(connection),
        isAssociated: isAssociated(connection),
        overLimit,
        isTrader: connection.zoneName === 'The Bazaar' && !connection.lastKillNpcName,
        recentlyChanged: props.recentChanges.has(connection.characterId),
        activitySignals: activitySignalsByCharacterId.value.get(connection.characterId) ?? [],
        hubX,
        hubY
      });

      edges.push({
        id: `${ip}-${connection.characterId}`,
        x1: hubX,
        y1: hubY,
        x2: nodeX,
        y2: nodeY,
        overLimit,
        ip
      });
    });
  });

  const maxRow = Math.floor(Math.max(ipGroups.length - 1, 0) / columns);
  const width = availableWidth;
  const height = padding * 2 + (maxRow + 1) * cellHeight;

  return { hubs, nodes, edges, width, height };
});

const hubs = computed(() => layout.value.hubs);
const nodes = computed(() => layout.value.nodes);
const edges = computed(() => layout.value.edges);
const svgWidth = computed(() => layout.value.width || 600);
const svgHeight = computed(() => Math.max(layout.value.height, 400));
const nodeMap = computed(() => new Map(nodes.value.map((node) => [node.characterId, node])));

const renderedRelationshipOverlays = computed<RenderedRelationshipOverlay[]>(() => {
  return props.relationshipOverlays
    .map((overlay) => {
      const sourceNode = nodeMap.value.get(overlay.sourceCharacterId);
      const targetNode = nodeMap.value.get(overlay.targetCharacterId);
      if (!sourceNode || !targetNode) {
        return null;
      }

      const curve = buildCurvePath(
        sourceNode.x,
        sourceNode.y,
        targetNode.x,
        targetNode.y,
        relationshipCurvature[overlay.type]
      );

      return {
        ...overlay,
        path: curve.path,
        midX: curve.midX,
        midY: curve.midY,
        strokeWidth: 1.6 + Math.min(overlay.strength, 5) * 0.45,
        fadeOpacity: getEventFadeOpacity(overlay.lastSeenAt)
      };
    })
    .filter(
      (overlay): overlay is RenderedRelationshipOverlay =>
        overlay !== null && overlay.fadeOpacity > 0
    );
});

const visibleRelationshipOverlays = computed(() => {
  if (overlayMode.value === 'none') return [];
  if (overlayMode.value === 'all') return renderedRelationshipOverlays.value;
  return renderedRelationshipOverlays.value.filter((overlay) => overlay.type === overlayMode.value);
});

const selectedOverlayParticipants = computed<Set<number> | null>(() => {
  if (overlayMode.value === 'none' || overlayMode.value === 'all') {
    return null;
  }

  const participantIds = new Set<number>();
  for (const overlay of visibleRelationshipOverlays.value) {
    participantIds.add(overlay.sourceCharacterId);
    participantIds.add(overlay.targetCharacterId);
  }

  return participantIds.size > 0 ? participantIds : null;
});

const visibleNodeSignals = computed<RenderedNodeSignal[]>(() => {
  if (!showActivitySignals.value) return [];

  const results: RenderedNodeSignal[] = [];
  for (const node of nodes.value) {
    node.activitySignals.slice(0, 2).forEach((signal, index) => {
      const angleRadians = (signalAngles[index] * Math.PI) / 180;
      const orbitRadius = node.radius + 12;
      results.push({
        ...signal,
        id: `${node.characterId}-${signal.type}-${index}`,
        x: node.x + orbitRadius * Math.cos(angleRadians),
        y: node.y + orbitRadius * Math.sin(angleRadians),
        fadeOpacity: getEventFadeOpacity(signal.lastSeenAt)
      });
    });
  }

  return results.filter((signal) => signal.fadeOpacity > 0);
});

function isNodeDimmed(node: CharNode): boolean {
  if (highlightMode.value === 'watched' && !node.isWatched && !node.isAssociated) return true;

  if (highlightMode.value === 'multi') {
    const hub = hubs.value.find((entry) => entry.ip === node.ip);
    if (!hub || hub.charCount <= 1) return true;
  }

  if (highlightMode.value === 'hack' && node.hackRisk === 'normal') return true;

  if (
    selectedOverlayParticipants.value &&
    !selectedOverlayParticipants.value.has(node.characterId)
  ) {
    return true;
  }

  return false;
}

function isHubDimmed(hub: HubNode): boolean {
  if (highlightMode.value === 'watched') {
    if (!hub.characters.some((character) => isWatched(character) || isAssociated(character))) {
      return true;
    }
  }

  if (highlightMode.value === 'multi' && hub.charCount <= 1) return true;

  if (highlightMode.value === 'hack') {
    if (!hub.characters.some((character) => getHackRisk(character) !== 'normal')) {
      return true;
    }
  }

  if (selectedOverlayParticipants.value) {
    const hasVisibleParticipant = hub.characters.some((character) =>
      selectedOverlayParticipants.value?.has(character.characterId)
    );
    if (!hasVisibleParticipant) return true;
  }

  return false;
}

function isEdgeDimmed(edge: Edge): boolean {
  const node = nodeMap.value.get(Number(edge.id.split('-')[1]));
  return node ? isNodeDimmed(node) : true;
}

function isRelationshipDimmed(overlay: RenderedRelationshipOverlay): boolean {
  const sourceNode = nodeMap.value.get(overlay.sourceCharacterId);
  const targetNode = nodeMap.value.get(overlay.targetCharacterId);
  if (!sourceNode || !targetNode) return true;
  return isNodeDimmed(sourceNode) || isNodeDimmed(targetNode);
}

function isSignalDimmed(signal: RenderedNodeSignal): boolean {
  const node = nodeMap.value.get(signal.characterId);
  return node ? isNodeDimmed(node) : true;
}

function getNodeStyle(node: CharNode): Record<string, string> {
  return {
    transform: buildNodeTransform(node.x, node.y),
    transformOrigin: 'center',
    transformBox: 'fill-box'
  };
}

function getNumericDatasetValue(
  dataset: DOMStringMap,
  key: 'hubX' | 'hubY' | 'nodeX' | 'nodeY'
): number {
  const rawValue = dataset[key];
  return rawValue ? Number(rawValue) : 0;
}

function handleNodeBeforeEnter(element: Element) {
  const nodeElement = element as SVGGElement;
  const hubX = getNumericDatasetValue(nodeElement.dataset, 'hubX');
  const hubY = getNumericDatasetValue(nodeElement.dataset, 'hubY');
  nodeElement.style.opacity = '0';
  nodeElement.style.transform = buildNodeTransform(hubX, hubY, 0.72);
}

function handleNodeEnter(element: Element, done: () => void) {
  const nodeElement = element as SVGGElement;
  const nodeX = getNumericDatasetValue(nodeElement.dataset, 'nodeX');
  const nodeY = getNumericDatasetValue(nodeElement.dataset, 'nodeY');

  requestAnimationFrame(() => {
    nodeElement.style.opacity = '1';
    nodeElement.style.transform = buildNodeTransform(nodeX, nodeY, 1);
  });

  window.setTimeout(done, NODE_TRANSITION_DURATION_MS);
}

function handleNodeLeave(element: Element, done: () => void) {
  const nodeElement = element as SVGGElement;
  const hubX = getNumericDatasetValue(nodeElement.dataset, 'hubX');
  const hubY = getNumericDatasetValue(nodeElement.dataset, 'hubY');
  nodeElement.style.pointerEvents = 'none';
  nodeElement.style.opacity = '0';
  nodeElement.style.transform = buildNodeTransform(hubX, hubY, 0.72);
  window.setTimeout(done, NODE_TRANSITION_DURATION_MS);
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap');

.network-graph {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.network-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background:
    linear-gradient(135deg, rgba(12, 18, 34, 0.92), rgba(10, 14, 28, 0.78)), rgba(12, 18, 34, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.85rem;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.toolbar-group--events {
  flex: 1 1 420px;
}

.toolbar-group--toggles {
  justify-content: flex-end;
}

.toolbar-caption {
  padding-right: 0.35rem;
  color: #64748b;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.toolbar-btn {
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.5);
  color: #94a3b8;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  border-color: rgba(96, 165, 250, 0.4);
  color: #e2e8f0;
  background: rgba(59, 130, 246, 0.1);
}

.toolbar-btn--active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(96, 165, 250, 0.6);
  color: #93c5fd;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.15);
}

.toolbar-btn--event {
  min-width: 4rem;
}

.toolbar-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  color: #94a3b8;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toolbar-checkbox {
  accent-color: #60a5fa;
}

.network-canvas {
  position: relative;
  overflow: auto;
  background:
    radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 70%, rgba(16, 185, 129, 0.04) 0%, transparent 58%),
    rgba(8, 12, 28, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.85rem;
  min-height: 400px;
  max-height: 75vh;
}

.network-svg {
  display: block;
  width: 100%;
  height: auto;
}

.edge-line {
  stroke: rgba(96, 165, 250, 0.18);
  stroke-width: 1.2;
  transition:
    opacity 0.3s ease,
    stroke 0.3s ease;
}

.edge-line--dimmed {
  opacity: 0.08;
}

.edge-line--danger {
  stroke: rgba(239, 68, 68, 0.3);
  stroke-width: 1.5;
}

.relationship-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.92;
  filter: url(#glow-soft);
  animation: relationshipDash 12s linear infinite;
  transition: opacity 0.25s ease;
  pointer-events: stroke;
}

.relationship-path--dimmed,
.relationship-marker--dimmed {
  opacity: 0.1;
}

.relationship-path--trade {
  stroke: rgba(251, 191, 36, 0.82);
  stroke-dasharray: 7 6;
}

.relationship-path--bazaar {
  stroke: rgba(16, 185, 129, 0.8);
  stroke-dasharray: 3 6;
}

.relationship-path--group {
  stroke: rgba(125, 211, 252, 0.75);
  stroke-dasharray: 10 5;
}

.relationship-path--raid {
  stroke: rgba(192, 132, 252, 0.78);
  stroke-dasharray: 12 6;
}

.relationship-path--rez {
  stroke: rgba(103, 232, 249, 0.82);
  stroke-dasharray: 2 4;
}

.relationship-path--give {
  stroke: rgba(249, 115, 22, 0.78);
  stroke-dasharray: 8 7;
}

.relationship-path--money {
  stroke: rgba(74, 222, 128, 0.78);
  stroke-dasharray: 5 5;
}

@keyframes relationshipDash {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -220;
  }
}

.relationship-marker {
  opacity: 1;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.relationship-marker__disc {
  fill: rgba(8, 12, 28, 0.96);
  stroke-width: 1.5;
  animation: relationshipMarkerPulse 2.2s ease-in-out infinite;
}

.relationship-marker__glyph {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  fill: #f8fafc;
}

.relationship-marker__icon {
  pointer-events: none;
}

.relationship-marker__icon-stroke {
  fill: none;
  stroke: #f8fafc;
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.relationship-marker--trade .relationship-marker__disc {
  stroke: rgba(251, 191, 36, 0.9);
}

.relationship-marker--bazaar .relationship-marker__disc {
  stroke: rgba(16, 185, 129, 0.9);
}

.relationship-marker--group .relationship-marker__disc {
  stroke: rgba(125, 211, 252, 0.9);
}

.relationship-marker--raid .relationship-marker__disc {
  stroke: rgba(192, 132, 252, 0.92);
}

.relationship-marker--rez .relationship-marker__disc {
  stroke: rgba(103, 232, 249, 0.92);
}

.relationship-marker--give .relationship-marker__disc {
  stroke: rgba(249, 115, 22, 0.92);
}

.relationship-marker--money .relationship-marker__disc {
  stroke: rgba(74, 222, 128, 0.92);
}

@keyframes relationshipMarkerPulse {
  0%,
  100% {
    opacity: 0.9;
    stroke-width: 1.5;
  }
  50% {
    opacity: 1;
    stroke-width: 2.4;
  }
}

.hub-glow {
  transition: opacity 0.3s ease;
}

.hub-node--dimmed .hub-glow {
  opacity: 0.15;
}

.hub-circle {
  fill: rgba(15, 23, 42, 0.9);
  stroke: rgba(96, 165, 250, 0.45);
  stroke-width: 2;
  transition:
    opacity 0.3s ease,
    stroke 0.3s ease;
}

.hub-node--dimmed .hub-circle {
  opacity: 0.2;
  stroke: rgba(96, 165, 250, 0.15);
}

.hub-circle--warning {
  stroke: rgba(249, 115, 22, 0.7);
}

.hub-circle--critical {
  stroke: rgba(239, 68, 68, 0.8);
  animation: hubCriticalPulse 1.5s ease-in-out infinite;
}

@keyframes hubCriticalPulse {
  0%,
  100% {
    stroke-width: 2;
  }
  50% {
    stroke-width: 3.5;
  }
}

.hub-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  fill: rgba(186, 199, 219, 0.82);
  paint-order: stroke;
  stroke: rgba(8, 12, 28, 0.85);
  stroke-width: 2px;
  stroke-linejoin: round;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.hub-node--dimmed .hub-label {
  opacity: 0.15;
}

.hub-count {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 700;
  fill: #e2e8f0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.hub-node--dimmed .hub-count {
  opacity: 0.15;
}

.hub-active {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  fill: #64748b;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.hub-active--warning {
  fill: #86efac;
}

.hub-active--danger {
  fill: #fca5a5;
}

.hub-node--dimmed .hub-active {
  opacity: 0.15;
}

.char-node {
  cursor: pointer;
  transition:
    opacity 0.28s ease,
    transform 0.52s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}

.char-node--dimmed {
  opacity: 0.1;
}

.char-node:hover .char-circle {
  stroke-width: 3;
  filter: url(#glow-soft);
}

.char-circle {
  stroke-width: 2;
  transition:
    stroke-width 0.15s ease,
    stroke 0.2s ease;
}

.char-circle--TANK {
  fill: rgba(59, 130, 246, 0.2);
  stroke: rgba(59, 130, 246, 0.6);
}

.char-circle--HEALER {
  fill: rgba(34, 197, 94, 0.2);
  stroke: rgba(34, 197, 94, 0.6);
}

.char-circle--SUPPORT {
  fill: rgba(168, 85, 247, 0.2);
  stroke: rgba(168, 85, 247, 0.6);
}

.char-circle--DPS {
  fill: rgba(239, 68, 68, 0.15);
  stroke: rgba(239, 68, 68, 0.5);
}

.char-circle--hack-elevated {
  stroke: rgba(250, 204, 21, 0.7) !important;
}

.char-circle--hack-high {
  stroke: rgba(249, 115, 22, 0.8) !important;
}

.char-circle--hack-critical {
  stroke: rgba(239, 68, 68, 0.9) !important;
  animation: nodeHackPulse 1.5s ease-in-out infinite;
}

@keyframes nodeHackPulse {
  0%,
  100% {
    stroke-width: 2;
  }
  50% {
    stroke-width: 4;
  }
}

.char-node--watched .char-circle {
  stroke: rgba(249, 115, 22, 0.8) !important;
  animation: nodeWatchPulse 2s ease-in-out infinite;
}

@keyframes nodeWatchPulse {
  0%,
  100% {
    filter: none;
  }
  50% {
    filter: url(#glow-soft);
  }
}

.char-node--associated .char-circle {
  stroke: rgba(234, 179, 8, 0.7) !important;
}

.char-node--danger .char-circle {
  stroke: rgba(239, 68, 68, 0.7) !important;
  fill: rgba(239, 68, 68, 0.1) !important;
}

.char-node--changed .char-circle {
  animation: nodeChangePulse 0.6s ease-out 3;
}

@keyframes nodeChangePulse {
  0% {
    stroke-width: 2;
    filter: none;
  }
  40% {
    stroke-width: 5;
    filter: url(#glow-soft);
  }
  100% {
    stroke-width: 2;
    filter: none;
  }
}

.char-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  font-weight: 700;
  fill: rgba(241, 245, 249, 0.96);
  letter-spacing: 0.01em;
  paint-order: stroke;
  stroke: rgba(8, 12, 28, 0.92);
  stroke-width: 2.5px;
  stroke-linejoin: round;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.char-node--dimmed .char-label {
  opacity: 0.1;
}

.node-signal {
  transition: opacity 0.25s ease;
}

.node-signal--dimmed {
  opacity: 0.12;
}

.node-signal__disc {
  fill: rgba(8, 12, 28, 0.96);
  stroke-width: 1.5;
  animation: nodeSignalPulse 2.8s ease-in-out infinite;
}

.node-signal__glyph {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 7px;
  font-weight: 700;
  fill: #f8fafc;
}

.node-signal--low .node-signal__disc {
  opacity: 0.72;
}

.node-signal--medium .node-signal__disc {
  opacity: 0.88;
}

.node-signal--high .node-signal__disc {
  opacity: 1;
}

.node-signal--kill .node-signal__disc {
  stroke: rgba(248, 113, 113, 0.92);
}

.node-signal--loot .node-signal__disc {
  stroke: rgba(251, 191, 36, 0.92);
}

.node-signal--death .node-signal__disc {
  stroke: rgba(244, 63, 94, 0.94);
}

.node-signal--task .node-signal__disc {
  stroke: rgba(192, 132, 252, 0.94);
}

.node-signal--level .node-signal__disc {
  stroke: rgba(132, 204, 22, 0.92);
}

.node-signal--zone .node-signal__disc {
  stroke: rgba(96, 165, 250, 0.92);
}

.node-signal--craft .node-signal__disc {
  stroke: rgba(244, 114, 182, 0.92);
}

.node-signal--handin .node-signal__disc {
  stroke: rgba(249, 115, 22, 0.92);
}

.node-signal--discovery .node-signal__disc {
  stroke: rgba(250, 204, 21, 0.92);
}

.node-signal--merchant .node-signal__disc {
  stroke: rgba(16, 185, 129, 0.92);
}

@keyframes nodeSignalPulse {
  0%,
  100% {
    opacity: 0.82;
    stroke-width: 1.5;
  }
  50% {
    opacity: 1;
    stroke-width: 2.3;
  }
}

.node-tooltip,
.overlay-tooltip {
  position: absolute;
  z-index: 100;
  padding: 0.65rem 0.85rem;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 0.65rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  min-width: 180px;
}

.overlay-tooltip {
  min-width: 210px;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
  color: #f8fafc;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
}

.tooltip-icon {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: contain;
}

.tooltip-row {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.75rem;
  color: #94a3b8;
  line-height: 1.5;
}

.tooltip-row--mono {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  color: #64748b;
}

.tooltip-row--warn {
  color: #f87171;
  font-weight: 600;
}

.tooltip-row--section {
  color: #cbd5e1;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.tooltip-divider {
  height: 1px;
  margin: 0.45rem 0 0.35rem;
  background: rgba(148, 163, 184, 0.15);
}

.overlay-empty {
  padding: 0.55rem 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  align-self: flex-start;
}

.network-empty {
  padding: 3rem;
  text-align: center;
  color: #64748b;
}

@media (max-width: 900px) {
  .network-toolbar {
    align-items: flex-start;
  }

  .toolbar-group--events {
    flex-basis: 100%;
  }

  .toolbar-group--toggles {
    justify-content: flex-start;
  }

}
</style>
