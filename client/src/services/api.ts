import axios, { AxiosResponse } from 'axios';
import { isMasterLooterName } from '../utils/lootNames';

import type {
  AttendanceEventType,
  AttendanceStatus,
  CharacterClass,
  DiscordWidgetTheme,
  GuildRole,
  LootListType,
  QuestAssignmentStatus,
  QuestBlueprintVisibility,
  QuestNodeProgressStatus,
  QuestNodeType
} from './types';

export type { CharacterClass };

export interface GuildSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  defaultRaidStartTime?: string | null;
  defaultRaidEndTime?: string | null;
  defaultDiscordVoiceUrl?: string | null;
  discordWidgetServerId?: string | null;
  discordWidgetTheme?: DiscordWidgetTheme | null;
  discordWidgetEnabled?: boolean;
  blacklistSpells?: boolean;
  createdAt: string;
  members: Array<{
    id: string;
    role: GuildRole;
    user: {
      id: string;
      displayName: string;
      nickname?: string | null;
    };
  }>;
}

export interface GuildDetail extends GuildSummary {
  characters: Array<{
    id: string;
    name: string;
    class: CharacterClass;
    level: number;
    guildId?: string | null;
    isMain: boolean;
    user: {
      id: string;
      displayName: string;
      nickname?: string | null;
    };
  }>;
  applicants?: GuildApplicant[];
  permissions?: GuildPermissions;
  viewerApplication?: GuildApplicationSummary | null;
}

export interface CharacterPayload {
  name: string;
  level: number;
  class: CharacterClass;
  guildId?: string;
  archetype?: string | null;
  isMain?: boolean;
}

export type CharacterUpdatePayload = Partial<
  Pick<CharacterPayload, 'name' | 'level' | 'class' | 'archetype' | 'guildId' | 'isMain'>
> & {
  contextGuildId?: string;
};

export interface UserCharacter {
  id: string;
  name: string;
  level: number;
  class: CharacterClass;
  guild?: {
    id: string;
    name: string;
  } | null;
  isMain: boolean;
}

export interface GuildApplicationSummary {
  id: string;
  guildId: string;
  status: string;
  guild?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
}

export interface GuildApplicant {
  id: string;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    nickname?: string | null;
  };
}

export interface GuildNpcAssociation {
  id: string;
  name: string;
  allaLink: string;
}

export interface GuildNpcNote {
  id: string;
  npcName: string;
  notes: string | null;
  allaLink: string | null;
  lastEditedById: string | null;
  lastEditedByName: string | null;
  deletionRequestedById: string | null;
  deletionRequestedByName: string | null;
  deletionRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  spells: GuildNpcAssociation[];
  relatedNpcs: GuildNpcAssociation[];
}

export interface GuildPermissions {
  canViewDetails: boolean;
  canManageMembers: boolean;
  canViewApplicants: boolean;
  canManageLootLists: boolean;
  userRole?: GuildRole | null;
}

export type GuildBankLocation = 'WORN' | 'PERSONAL' | 'CURSOR' | 'BANK';

export interface GuildBankCharacter {
  id: string;
  name: string;
  userId?: string | null;
  isPersonal: boolean;
  createdAt: string;
  foundInEq?: boolean;
  class?: CharacterClass;
  isTracked?: boolean;
}

export interface GuildBankItem {
  characterName: string;
  slotId: number;
  location: GuildBankLocation;
  itemId?: number | null;
  itemName: string;
  itemIconId?: number | null;
  charges?: number | null;
  bagSlots?: number | null;
  // Augment item IDs socketed in this item
  augSlot1?: number | null;
  augSlot2?: number | null;
  augSlot3?: number | null;
  augSlot4?: number | null;
  augSlot5?: number | null;
  augSlot6?: number | null;
}

export interface GuildBankSnapshot {
  characters: GuildBankCharacter[];
  items: GuildBankItem[];
  missingCharacters: string[];
}

/**
 * Detailed item stats for tooltip display.
 * Matches the EverQuest items database schema.
 */
export interface ItemStats {
  id: number;
  name: string;
  icon: number;

  // Item type info
  itemtype: number;
  itemclass: number;

  // Equipment slots (bitmask)
  slots: number;

  // Basic stats
  ac: number;
  damage: number;
  delay: number;
  range: number;

  // Attributes
  astr: number;
  asta: number;
  aagi: number;
  adex: number;
  awis: number;
  aint: number;
  acha: number;

  // Heroic attributes
  heroic_str: number;
  heroic_sta: number;
  heroic_agi: number;
  heroic_dex: number;
  heroic_wis: number;
  heroic_int: number;
  heroic_cha: number;

  // Resources
  hp: number;
  mana: number;
  endur: number;

  // Resistances
  fr: number;
  cr: number;
  dr: number;
  mr: number;
  pr: number;
  svcorruption: number;

  // Heroic resistances
  heroic_fr: number;
  heroic_cr: number;
  heroic_dr: number;
  heroic_mr: number;
  heroic_pr: number;
  heroic_svcorrup: number;

  // Requirements
  reqlevel: number;
  reclevel: number;
  classes: number;
  races: number;
  deity: number;

  // Container properties
  bagslots: number;
  bagsize: number;
  bagtype: number;
  bagwr: number;

  // Item flags
  magic: number;
  nodrop: number;
  norent: number;
  notransfer: number;
  questitemflag: number;
  lore: string;
  lorefile: string;

  // Effects
  proceffect: number;
  proctype: number;
  proclevel2: number;
  proclevel: number;
  procrate: number;

  worneffect: number;
  worntype: number;
  wornlevel2: number;
  wornlevel: number;

  clickeffect: number;
  clicktype: number;
  clicklevel2: number;
  clicklevel: number;
  casttime: number;

  focuseffect: number;
  focustype: number;
  focuslevel2: number;
  focuslevel: number;

  scrolleffect: number;
  scrolltype: number;
  scrolllevel2: number;
  scrolllevel: number;

  bardeffect: number;
  bardeffecttype: number;
  bardlevel2: number;
  bardlevel: number;

  // Combat stats
  backstabdmg: number;
  skillmodvalue: number;
  skillmodtype: number;
  strikethrough: number;
  stunresist: number;
  spelldmg: number;
  healamt: number;
  clairvoyance: number;

  // Weapon details
  banedmgamt: number;
  banedmgraceamt: number;
  banedmgbody: number;
  banedmgrace: number;

  // Augmentation
  augtype: number;
  augslot1type: number;
  augslot2type: number;
  augslot3type: number;
  augslot4type: number;
  augslot5type: number;
  augslot6type: number;
  augslot1visible: number;
  augslot2visible: number;
  augslot3visible: number;
  augslot4visible: number;
  augslot5visible: number;
  augslot6visible: number;

  // Weight and size
  weight: number;
  size: number;

  // Stacking
  stackable: number;
  stacksize: number;

  // Misc
  idfile: string;
  ldonsold: number;
  ldonsellbackrate: number;
  ldonprice: number;
  price: number;
  sellrate: number;

  // Attack/haste
  attack: number;
  haste: number;
  accuracy: number;
  avoidance: number;
  combateffects: number;
  shielding: number;
  dotshielding: number;
  damageshield: number;
  dsmitigation: number;

  // Regen
  regen: number;
  manaregen: number;
  enduranceregen: number;

  // Extradamage
  extradmgamt: number;
  extradmgskill: number;
}

export interface ItemStatsResponse {
  item: ItemStats;
  spellNames: Record<number, string>;
}

export interface ItemStatsBatchResponse {
  items: Record<number, ItemStats>;
  spellNames: Record<number, string>;
}

export interface ItemNameSearchResult {
  itemId: number;
  itemIconId: number;
  itemName: string;
}

export interface ItemNameSearchResponse {
  items: Record<string, ItemNameSearchResult>;
}

export interface QuestProgressSummary {
  totalNodes: number;
  completed: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
  percentComplete: number;
}

export interface QuestNodeProgress {
  nodeId: string;
  status: QuestNodeProgressStatus;
  progressCount: number;
  targetCount: number;
  notes: string | null;
  isDisabled?: boolean;
}

export interface QuestAssignment {
  id: string;
  status: QuestAssignmentStatus;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  lastProgressAt: string | null;
  progressSummary: QuestProgressSummary;
  totalViewerSteps?: number;
  user?: {
    id: string;
    displayName: string;
    nickname?: string | null;
  };
  character?: {
    id: string;
    name: string;
    class: CharacterClass;
  } | null;
  progress: QuestNodeProgress[];
}

export interface QuestAssignmentCounts extends Record<QuestAssignmentStatus, number> { }

export interface QuestBlueprintSummaryLite {
  id: string;
  title: string;
  summary: string | null;
  visibility: QuestBlueprintVisibility;
  isArchived: boolean;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lastEditedByName?: string | null;
  folderId: string | null;
  folderSortOrder: number;
  nodeCount: number;
  assignmentCounts: QuestAssignmentCounts;
  viewerAssignment?: QuestAssignment | null;
  viewerAssignments?: QuestAssignment[];
}

export interface QuestNodeViewModel {
  id: string;
  title: string;
  description: string | null;
  nodeType: QuestNodeType;
  position: { x: number; y: number };
  sortOrder: number;
  requirements: Record<string, unknown>;
  metadata: Record<string, unknown>;
  isGroup: boolean;
  isFinal?: boolean;
  isOptional?: boolean;
}

export interface QuestNodeLinkViewModel {
  id: string;
  parentNodeId: string;
  childNodeId: string;
  conditions: Record<string, unknown>;
}

export interface QuestTrackerPermissions {
  role: GuildRole | null;
  canManageBlueprints: boolean;
  canViewGuildBoard: boolean;
  canEditBlueprint?: boolean;
}

export type QuestBlueprintFolderType = 'CLASS' | 'CUSTOM';

export interface QuestBlueprintFolderView {
  id: string;
  title: string;
  iconKey: string | null;
  type: QuestBlueprintFolderType;
  systemKey: string | null;
  sortOrder: number;
}

export interface QuestTrackerSummary {
  blueprints: QuestBlueprintSummaryLite[];
  folders: QuestBlueprintFolderView[];
  permissions: QuestTrackerPermissions;
}

export interface QuestBlueprintDetailPayload {
  blueprint: QuestBlueprintSummaryLite;
  nodes: QuestNodeViewModel[];
  links: QuestNodeLinkViewModel[];
  assignmentStats: QuestAssignmentCounts;
  viewerAssignment?: QuestAssignment | null;
  viewerAssignments?: QuestAssignment[];
  guildAssignments?: QuestAssignment[];
  permissions: QuestTrackerPermissions;
  availableNodeTypes: QuestNodeType[];
}

export interface EqTaskSummary {
  id: number;
  title: string;
  description: string | null;
  type: number | null;
  duration: number | null;
  durationCode?: number | null;
  minLevel: number | null;
  maxLevel: number | null;
  repeatable: boolean;
  reward: string | null;
  completionEmote: string | null;
}

export interface EqTaskSearchResult {
  tasks: EqTaskSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QuestShareDetails {
  assignmentId: string;
  guildId: string;
  blueprintId: string;
  characterName: string | null;
  characterClass: string | null;
  blueprintTitle: string;
  status: string;
}

export interface QuestNodeInputPayload {
  id: string;
  title: string;
  description?: string | null;
  nodeType: QuestNodeType;
  position: { x: number; y: number };
  sortOrder: number;
  requirements?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isGroup?: boolean;
  isOptional?: boolean;
}

export interface QuestLinkInputPayload {
  id: string;
  parentNodeId: string;
  childNodeId: string;
  conditions?: Record<string, unknown>;
}

export interface MetricsDateRange {
  start: string;
  end: string;
}

export interface MetricsCharacterOption {
  id: string | null;
  name: string;
  class: CharacterClass | null;
  userId: string | null;
  userDisplayName: string | null;
  isMain: boolean;
}

export interface MetricsRaidOption {
  id: string;
  name: string;
}

export interface MetricsLootParticipantOption {
  name: string;
  looterClass: string | null;
}

export interface AttendanceMetricRecord {
  id: string;
  status: AttendanceStatus;
  timestamp: string;
  eventType: AttendanceEventType;
  raid: {
    id: string;
    name: string;
    startTime: string | null;
  };
  character: {
    id: string | null;
    name: string;
    class: CharacterClass | null;
    isMain: boolean | null;
    userId: string | null;
    userDisplayName: string | null;
  };
}

export interface LootMetricEvent {
  id: string;
  timestamp: string;
  createdAt: string;
  itemName: string;
  itemId?: number | null;
  itemIconId?: number | null;
  looterName: string;
  looterClass: string | null;
  emoji: string | null;
  raid: {
    id: string;
    name: string;
    startTime: string | null;
  };
}

export interface GuildMetricsSummary {
  attendanceRecords: number;
  uniqueAttendanceCharacters: number;
  lootEvents: number;
  uniqueLooters: number;
  raidsTracked: number;
}

export interface GuildMetricsFilterOptions {
  classes: string[];
  characters: MetricsCharacterOption[];
  raids: MetricsRaidOption[];
  lootParticipants: MetricsLootParticipantOption[];
}

export interface GuildMetrics {
  range: MetricsDateRange;
  attendanceRecords: AttendanceMetricRecord[];
  lootEvents: LootMetricEvent[];
  summary: GuildMetricsSummary;
  filterOptions: GuildMetricsFilterOptions;
  earliestRaidDate: string | null;
}

export interface GuildMetricsQuery {
  startDate?: string;
  endDate?: string;
}

export type DiscordWebhookEventCategory = 'RAID' | 'ATTENDANCE' | 'APPLICATION' | 'BANK';

export interface DiscordWebhookEventDefinition {
  key: string;
  label: string;
  description: string;
  category: DiscordWebhookEventCategory;
}

export interface GuildDiscordWebhookSettings {
  id: string;
  guildId: string;
  label: string;
  webhookUrl: string | null;
  isEnabled: boolean;
  usernameOverride: string | null;
  avatarUrl: string | null;
  mentionRoleId: string | null;
  eventSubscriptions: Record<string, boolean>;
  mentionSubscriptions: Record<string, boolean>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GuildDiscordWebhookListResponse {
  webhooks: GuildDiscordWebhookSettings[];
  eventDefinitions: DiscordWebhookEventDefinition[];
  defaultEventSubscriptions: Record<string, boolean>;
  defaultMentionSubscriptions: Record<string, boolean>;
}

export interface GuildDiscordWebhookInput {
  label: string;
  webhookUrl?: string | null;
  isEnabled?: boolean;
  usernameOverride?: string | null;
  avatarUrl?: string | null;
  mentionRoleId?: string | null;
  eventSubscriptions?: Record<string, boolean>;
  mentionSubscriptions?: Record<string, boolean>;
}

export interface GuildDiscordWebhookUpdateInput extends Partial<GuildDiscordWebhookInput> { }

export interface RaidSignupCounts {
  confirmed: number;
  notAttending: number;
}

export interface RaidEventSummary {
  id: string;
  guildId: string;
  name: string;
  startTime: string;
  startedAt?: string | null;
  endedAt?: string | null;
  canceledAt?: string | null;
  targetZones: string[];
  targetBosses: string[];
  notes?: string | null;
  discordVoiceUrl?: string | null;
  isActive: boolean;
  isRecurring: boolean;
  recurrence: {
    id: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    endDate?: string | null;
    isActive: boolean;
  } | null;
  raidSignupNotificationsEnabled?: boolean;
  raidCreatedNotificationsEnabled?: boolean;
  logMonitor?: {
    isActive: boolean;
    userId?: string | null;
    userDisplayName?: string | null;
    startedAt?: string | null;
  } | null;
  permissions?: {
    canManage: boolean;
    role: GuildRole;
  };
  hasUnassignedLoot: boolean;
  signupCounts?: RaidSignupCounts;
  attendance?: Array<{
    id: string;
    createdAt: string;
    eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
  }>;
}

export interface RaidSignupUser {
  id: string;
  displayName: string;
  nickname?: string | null;
}

export interface RaidSignupCharacter {
  id: string;
  name: string;
  class: CharacterClass;
  level: number | null;
  isMain: boolean;
}

export type SignupStatus = 'CONFIRMED' | 'NOT_ATTENDING';

export interface RaidSignup {
  id: string;
  raidId: string;
  userId: string;
  characterId: string;
  characterName: string;
  characterClass: CharacterClass;
  characterLevel: number | null;
  isMain: boolean;
  status: SignupStatus;
  createdAt: string;
  updatedAt: string;
  user: RaidSignupUser;
  character: RaidSignupCharacter;
}

export interface SignupEntry {
  characterId: string;
  status?: SignupStatus;
}

export interface CharacterSearchResult {
  id: string;
  name: string;
  class: CharacterClass;
  level: number | null;
  isMain: boolean;
  userId: string;
  userDisplayName: string;
  isSignedUp: boolean;
}

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface CalendarAvailabilityEntry {
  id: string;
  userId: string;
  guildId: string;
  date: string;
  status: AvailabilityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityUpdate {
  date: string;
  status: AvailabilityStatus;
}

export interface AvailabilitySummary {
  date: string;
  unavailableCount: number;
  availableCount: number;
}

export interface AvailabilityUserDetail {
  userId: string;
  displayName: string;
  status: AvailabilityStatus;
  mainCharacters: Array<{
    id: string;
    name: string;
    class: string;
    level: number | null;
  }>;
}

export type GuildDonationStatus = 'PENDING' | 'REJECTED';

export interface GuildDonation {
  id: string;
  guildId: string;
  itemName: string;
  itemId: number | null;
  itemIconId: number | null;
  itemType: number;
  quantity: number;
  donatorId: number;
  donatorName: string | null;
  status: GuildDonationStatus;
}

export interface PaginatedDonationsResponse {
  donations: GuildDonation[];
  total: number;
  pending: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DonationCounts {
  pending: number;
  total: number;
}

// NPC Respawn Tracker Types
export type NpcRespawnStatus = 'unknown' | 'up' | 'window' | 'down';

export interface NpcLootItem {
  id: string;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  allaLink: string | null;
}

export interface NpcLastKill {
  id: string;
  killedAt: string;
  killedByName: string | null;
  killedById: string | null;
  notes: string | null;
}

export const NPC_CONTENT_FLAGS = ['Christmas', 'Halloween'] as const;
export type NpcContentFlag = (typeof NPC_CONTENT_FLAGS)[number];

export interface NpcDefinition {
  id: string;
  guildId: string;
  npcName: string;
  zoneName: string | null;
  respawnMinMinutes: number | null;
  respawnMaxMinutes: number | null;
  isRaidTarget: boolean;
  contentFlag: NpcContentFlag | null;
  notes: string | null;
  allaLink: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lastKill: NpcLastKill | null;
}

export interface NpcRespawnTrackerEntry extends NpcDefinition {
  respawnStatus: NpcRespawnStatus;
  respawnMinTime: string | null;
  respawnMaxTime: string | null;
  progressPercent: number | null;
}

export interface NpcKillRecord {
  id: string;
  guildId: string;
  npcDefinitionId: string;
  npcName: string;
  zoneName: string | null;
  respawnMinMinutes: number | null;
  respawnMaxMinutes: number | null;
  killedAt: string;
  killedByName: string | null;
  killedById: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NpcRespawnSubscription {
  id: string;
  npcDefinitionId: string;
  notifyMinutes: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  npcDefinition: NpcDefinition;
}

export interface NpcDefinitionInput {
  npcName: string;
  zoneName?: string | null;
  respawnMinMinutes?: number | null;
  respawnMaxMinutes?: number | null;
  isRaidTarget?: boolean;
  contentFlag?: NpcContentFlag | null;
  notes?: string | null;
  allaLink?: string | null;
}

export interface NpcKillRecordInput {
  npcDefinitionId: string;
  killedAt: string;
  killedByName?: string | null;
  notes?: string | null;
}

export interface NpcSubscriptionInput {
  npcDefinitionId: string;
  notifyMinutes?: number;
  isEnabled?: boolean;
}

export interface DiscoveredItem {
  itemId: number;
  itemName: string;
  itemIconId: number | null;
}


export interface AttendanceEventSummary {
  id: string;
  createdAt: string;
  note?: string | null;
  eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
  records: AttendanceRecordSummary[];
}

export interface RaidNpcKillSummary {
  npcName: string;
  killCount: number;
}

export interface RaidNpcKillEvent {
  npcName: string;
  killerName?: string | null;
  occurredAt: string;
}

export interface RaidDetail extends RaidEventSummary {
  guild: {
    id: string;
    name: string;
    defaultRaidStartTime?: string | null;
    defaultRaidEndTime?: string | null;
    blacklistSpells?: boolean;
  };
  createdBy: {
    id: string;
    displayName: string;
    nickname?: string | null;
  };
  attendance: AttendanceEventSummary[];
  signups: RaidSignup[];
  npcKills: RaidNpcKillSummary[];
  npcKillEvents: RaidNpcKillEvent[];
}

export type LootListMatchType = 'ITEM_ID' | 'ITEM_NAME';

export interface GuildLootListEntry {
  id: string;
  guildId: string;
  type: LootListType;
  matchType: LootListMatchType;
  itemId?: number | null;
  itemName: string;
  itemNameNormalized: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    displayName: string;
    nickname?: string | null;
  } | null;
}

export interface GuildLootListSummary {
  whitelist: GuildLootListEntry[];
  blacklist: GuildLootListEntry[];
}

export interface GuildLootListQueryOptions {
  type: LootListType;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'itemName' | 'itemId' | 'createdAt';
  sortDirection?: 'asc' | 'desc';
}

export interface GuildLootListPage {
  entries: GuildLootListEntry[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}
export interface AttendanceRecordInput {
  characterId?: string;
  characterName: string;
  level?: number | null;
  class?: CharacterClass | null;
  groupNumber?: number | null;
  status?: AttendanceStatus;
  flags?: string | null;
}

export interface AttendanceRecordSummary {
  id: string;
  characterId: string | null;
  characterName: string;
  level?: number | null;
  class?: CharacterClass | null;
  groupNumber?: number | null;
  status?: AttendanceStatus | null;
  flags?: string | null;
  isMain: boolean;
}

export interface RecentAttendanceRecord {
  id: string;
  characterId: string | null;
  characterName: string;
  status: AttendanceStatus;
  flags?: string | null;
  level?: number | null;
  class?: CharacterClass | null;
  isMain: boolean;
}

export interface RecentAttendanceEntry {
  id: string;
  createdAt: string;
  eventType: 'LOG' | 'START' | 'END' | 'RESTART';
  note?: string | null;
  raid: {
    id: string;
    name: string;
    startTime: string;
    guild: {
      id: string;
      name: string;
    };
  };
  characters: RecentAttendanceRecord[];
}

export interface GuildLootParserPatternSettings {
  id: string;
  label: string;
  pattern: string;
  ignoredMethods: string[];
}

export interface GuildLootParserSettings {
  patterns: GuildLootParserPatternSettings[];
  emoji: string;
}

function sanitizeMethodList(methods: unknown): string[] {
  if (!Array.isArray(methods)) {
    return [];
  }
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const value of methods) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    sanitized.push(trimmed);
  }
  return sanitized;
}

function normalizeLootPattern(pattern: unknown, index: number): GuildLootParserPatternSettings {
  const fallbackId = `pattern-${index}`;
  const fallbackLabel = `Pattern ${index + 1}`;
  const raw = (pattern ?? {}) as {
    id?: unknown;
    label?: unknown;
    pattern?: unknown;
    ignoredMethods?: unknown;
  };
  const idValue = typeof raw.id === 'string' ? raw.id.trim() : '';
  const labelValue = typeof raw.label === 'string' ? raw.label.trim() : '';
  const patternValue = typeof raw.pattern === 'string' ? raw.pattern : '';

  return {
    id: idValue || fallbackId,
    label: labelValue || fallbackLabel,
    pattern: patternValue,
    ignoredMethods: sanitizeMethodList(raw.ignoredMethods)
  };
}

function normalizeLootParserSettings(raw: unknown): GuildLootParserSettings {
  const settings = (raw ?? {}) as { patterns?: unknown; emoji?: unknown };
  const patterns = Array.isArray(settings.patterns)
    ? settings.patterns.map((pattern, index) => normalizeLootPattern(pattern, index))
    : [];
  const emoji =
    typeof settings.emoji === 'string' && settings.emoji.trim() ? settings.emoji : '💎';

  return { patterns, emoji };
}

export interface RaidLootEvent {
  id: string;
  raidId: string;
  guildId: string;
  itemName: string;
  itemId?: number | null;
  itemIconId?: number | null;
  looterName: string;
  looterClass?: string | null;
  eventTime?: string | null;
  emoji?: string | null;
  note?: string | null;
  createdById?: string | null;
}

export interface RaidLogMonitorSession {
  sessionId?: string;
  raidId: string;
  guildId: string;
  fileName: string;
  startedAt: string;
  lastHeartbeatAt: string;
  isOwner: boolean;
  user: {
    id: string;
    displayName: string;
  };
}

export interface RaidLogMonitorStatus {
  session: RaidLogMonitorSession | null;
  heartbeatIntervalMs: number;
  timeoutMs: number;
}

export interface RecentLootEntry {
  id: string;
  itemName: string;
  itemId?: number | null;
  itemIconId?: number | null;
  looterName: string;
  looterClass?: string | null;
  eventTime?: string | null;
  emoji?: string | null;
  raid: {
    id: string;
    name: string;
    startTime: string;
    guild: {
      id: string;
      name: string;
    };
  };
}

export interface AccountProfile {
  userId: string;
  email: string;
  displayName: string;
  nickname: string | null;
  defaultLogFileName: string | null;
}

export interface AdminUserGuildMembership {
  guild: {
    id: string;
    name: string;
  };
  role: GuildRole;
  createdAt: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  nickname?: string | null;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  guildMemberships: AdminUserGuildMembership[];
}

export interface AdminGuildSummary {
  id: string;
  name: string;
  description?: string | null;
  slug: string;
  memberCount: number;
  characterCount: number;
  raidCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGuildMemberSummary {
  user: {
    id: string;
    email: string;
    displayName: string;
    nickname?: string | null;
  };
  role: GuildRole;
  joinedAt: string;
}

export interface AdminGuildCharacterSummary {
  id: string;
  name: string;
  level: number;
  class?: CharacterClass | null;
  ownerId: string;
  ownerName: string;
}

export interface AdminGuildDetail extends AdminGuildSummary {
  members: AdminGuildMemberSummary[];
  characters: AdminGuildCharacterSummary[];
}

export interface AdminRaidSummary {
  id: string;
  name: string;
  guild: {
    id: string;
    name: string;
  } | null;
  startTime: string;
  startedAt?: string | null;
  endedAt?: string | null;
  canceledAt?: string | null;
  isActive: boolean;
  attendanceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRaidDetail extends AdminRaidSummary {
  targetZones: string[];
  targetBosses: string[];
  notes?: string | null;
  attendance: Array<{
    id: string;
    createdAt: string;
    eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
    note?: string | null;
  }>;
}

// Loot Management Types
export interface LootManagementSummary {
  lootMasterCount: number;
  lcItemsCount: number;
  lcRequestsCount: number;
  lcVotesCount: number;
}

export interface LootMasterEntry {
  id: number;
  itemId: number;
  itemName: string | null;
  npcName: string | null;
  zoneName: string | null;
  dropChance: number | null;
  createdAt: string | null;
}

export interface LcItemEntry {
  id: number;
  itemId: number;
  itemName: string | null;
  raidId: number;
  npcId: number;
  npcName: string | null;
  status: number | null;
  type: number | null;
  awardee: number | null;
  awardeeName: string | null;
}

export interface LcRequestEntry {
  id: number;
  eventId: number;
  charId: number;
  charName: string | null;
  itemId: number;
  itemName: string | null;
  replacedItemId: number | null;
  replacedItemName: string | null;
}

export interface LcVoteEntry {
  id: number;
  requestId: number;
  voterId: number;
  voterName: string | null;
  itemName: string | null;
  characterName: string | null;
  vote: string | null;
  voteDate: string | null;
  reason: string | null;
}

export interface PaginatedLootResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function normalizeAttendanceRecord(record: any): AttendanceRecordSummary {
  return {
    id: record.id,
    characterId: record.characterId ?? null,
    characterName: record.characterName,
    level: record.level ?? null,
    class: record.class ?? null,
    groupNumber: record.groupNumber ?? null,
    status: record.status ?? null,
    flags: record.flags ?? null,
    isMain: Boolean(record.isMain)
  };
}

function normalizeAttendanceEvent(event: any): AttendanceEventSummary {
  return {
    id: event.id,
    createdAt: event.createdAt,
    note: event.note ?? null,
    eventType: event.eventType ?? undefined,
    records: Array.isArray(event.records)
      ? event.records.map(normalizeAttendanceRecord)
      : []
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry === null || entry === undefined) {
          return '';
        }
        return String(entry).trim();
      })
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function normalizeNullableDate(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDateString(value: unknown): string {
  const normalized = normalizeNullableDate(value);
  return normalized ?? '';
}

function normalizeGuildWebhookSettings(raw: any): GuildDiscordWebhookSettings {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    guildId: typeof raw?.guildId === 'string' ? raw.guildId : '',
    label: typeof raw?.label === 'string' ? raw.label : 'Discord Webhook',
    webhookUrl: typeof raw?.webhookUrl === 'string' ? raw.webhookUrl : null,
    isEnabled: Boolean(raw?.isEnabled),
    usernameOverride: typeof raw?.usernameOverride === 'string' ? raw.usernameOverride : null,
    avatarUrl: typeof raw?.avatarUrl === 'string' ? raw.avatarUrl : null,
    mentionRoleId: typeof raw?.mentionRoleId === 'string' ? raw.mentionRoleId : null,
    eventSubscriptions: normalizeBooleanRecord(raw?.eventSubscriptions),
    mentionSubscriptions: normalizeBooleanRecord(raw?.mentionSubscriptions),
    createdAt: normalizeNullableDate(raw?.createdAt),
    updatedAt: normalizeNullableDate(raw?.updatedAt)
  };
}

function normalizeBooleanRecord(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return {} as Record<string, boolean>;
  }
  return Object.entries(raw).reduce<Record<string, boolean>>((acc, [key, val]) => {
    acc[key] = Boolean(val);
    return acc;
  }, {});
}

const QUEST_ASSIGNMENT_STATUS_VALUES: QuestAssignmentStatus[] = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const QUEST_NODE_PROGRESS_VALUES: QuestNodeProgressStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
const QUEST_NODE_TYPE_VALUES: QuestNodeType[] = [
  'DELIVER',
  'KILL',
  'LOOT',
  'SPEAK_WITH',
  'EXPLORE',
  'TRADESKILL',
  'FISH',
  'FORAGE',
  'USE',
  'TOUCH',
  'GIVE_CASH'
];
const QUEST_BLUEPRINT_VISIBILITY_VALUES: QuestBlueprintVisibility[] = ['GUILD', 'LINK_ONLY', 'PRIVATE'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isQuestAssignmentStatus(value: unknown): value is QuestAssignmentStatus {
  return typeof value === 'string' && (QUEST_ASSIGNMENT_STATUS_VALUES as string[]).includes(value);
}

function isQuestNodeProgressStatus(value: unknown): value is QuestNodeProgressStatus {
  return typeof value === 'string' && (QUEST_NODE_PROGRESS_VALUES as string[]).includes(value);
}

function isQuestNodeType(value: unknown): value is QuestNodeType {
  return typeof value === 'string' && (QUEST_NODE_TYPE_VALUES as string[]).includes(value);
}

function isQuestBlueprintVisibility(value: unknown): value is QuestBlueprintVisibility {
  return typeof value === 'string' && (QUEST_BLUEPRINT_VISIBILITY_VALUES as string[]).includes(value);
}

function normalizeQuestPermissions(raw: any): QuestTrackerPermissions {
  return {
    role: typeof raw?.role === 'string' ? (raw.role as GuildRole) : null,
    canManageBlueprints: Boolean(raw?.canManageBlueprints),
    canViewGuildBoard: Boolean(raw?.canViewGuildBoard),
    canEditBlueprint: raw?.canEditBlueprint != null ? Boolean(raw.canEditBlueprint) : undefined
  };
}

function normalizeQuestProgressSummary(raw: any): QuestProgressSummary {
  return {
    totalNodes: typeof raw?.totalNodes === 'number' ? raw.totalNodes : 0,
    completed: typeof raw?.completed === 'number' ? raw.completed : 0,
    inProgress: typeof raw?.inProgress === 'number' ? raw.inProgress : 0,
    blocked: typeof raw?.blocked === 'number' ? raw.blocked : 0,
    notStarted: typeof raw?.notStarted === 'number' ? raw.notStarted : 0,
    percentComplete: typeof raw?.percentComplete === 'number' ? raw.percentComplete : 0
  };
}

function normalizeAssignmentCounts(raw: any): QuestAssignmentCounts {
  const counts: QuestAssignmentCounts = {
    ACTIVE: 0,
    PAUSED: 0,
    COMPLETED: 0,
    CANCELLED: 0
  };
  if (raw && typeof raw === 'object') {
    for (const status of QUEST_ASSIGNMENT_STATUS_VALUES) {
      const value = raw?.[status];
      counts[status] = typeof value === 'number' ? value : 0;
    }
  }
  return counts;
}

function normalizeQuestAssignment(raw: any): QuestAssignment {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    status: isQuestAssignmentStatus(raw?.status) ? raw.status : 'ACTIVE',
    startedAt: normalizeDateString(raw?.startedAt),
    completedAt: normalizeNullableDate(raw?.completedAt),
    cancelledAt: normalizeNullableDate(raw?.cancelledAt),
    lastProgressAt: normalizeNullableDate(raw?.lastProgressAt),
    progressSummary: normalizeQuestProgressSummary(raw?.progressSummary),
    totalViewerSteps:
      typeof raw?.totalViewerSteps === 'number' ? Math.max(0, raw.totalViewerSteps) : undefined,
    user: raw?.user && typeof raw.user === 'object'
      ? {
        id: typeof raw.user.id === 'string' ? raw.user.id : '',
        displayName: typeof raw.user.displayName === 'string' ? raw.user.displayName : '',
        nickname: typeof raw.user.nickname === 'string' ? raw.user.nickname : null
      }
      : undefined,
    character:
      raw?.character && typeof raw.character === 'object'
        ? {
          id: typeof raw.character.id === 'string' ? raw.character.id : '',
          name: typeof raw.character.name === 'string' ? raw.character.name : 'Character',
          class:
            typeof raw.character.class === 'string'
              ? (raw.character.class as CharacterClass)
              : 'WARRIOR'
        }
        : null,
    progress: Array.isArray(raw?.progress)
      ? raw.progress.map((entry: any): QuestNodeProgress => ({
        nodeId: typeof entry?.nodeId === 'string' ? entry.nodeId : '',
        status: isQuestNodeProgressStatus(entry?.status) ? entry.status : 'NOT_STARTED',
        progressCount: typeof entry?.progressCount === 'number' ? entry.progressCount : 0,
        targetCount: typeof entry?.targetCount === 'number' ? entry.targetCount : 0,
        notes: typeof entry?.notes === 'string' ? entry.notes : null,
        isDisabled: Boolean(entry?.isDisabled)
      }))
      : []
  };
}

function normalizeQuestNode(raw: any): QuestNodeViewModel {
  const position = isPlainObject(raw?.position)
    ? raw.position
    : {
      x: typeof raw?.positionX === 'number' ? raw.positionX : 0,
      y: typeof raw?.positionY === 'number' ? raw.positionY : 0
    };

  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    title: typeof raw?.title === 'string' ? raw.title : 'Quest Step',
    description: typeof raw?.description === 'string' ? raw.description : null,
    nodeType: isQuestNodeType(raw?.nodeType) ? raw.nodeType : 'EXPLORE',
    position: {
      x: typeof position?.x === 'number' ? position.x : 0,
      y: typeof position?.y === 'number' ? position.y : 0
    },
    sortOrder: typeof raw?.sortOrder === 'number' ? raw.sortOrder : 0,
    requirements: isPlainObject(raw?.requirements) ? (raw.requirements as Record<string, unknown>) : {},
    metadata: isPlainObject(raw?.metadata) ? (raw.metadata as Record<string, unknown>) : {},
    isGroup: Boolean(raw?.isGroup),
    isFinal: Boolean(raw?.isFinal),
    isOptional: Boolean(raw?.isOptional)
  };
}

function normalizeQuestBlueprintFolder(raw: any): QuestBlueprintFolderView {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    title: typeof raw?.title === 'string' ? raw.title : 'Folder',
    iconKey:
      typeof raw?.iconKey === 'string'
        ? raw.iconKey
        : raw?.iconKey == null
          ? null
          : String(raw.iconKey),
    type: raw?.type === 'CLASS' ? 'CLASS' : 'CUSTOM',
    systemKey:
      typeof raw?.systemKey === 'string'
        ? raw.systemKey
        : raw?.systemKey == null
          ? null
          : String(raw.systemKey),
    sortOrder: typeof raw?.sortOrder === 'number' ? raw.sortOrder : 0
  };
}

function normalizeQuestLink(raw: any): QuestNodeLinkViewModel {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    parentNodeId: typeof raw?.parentNodeId === 'string' ? raw.parentNodeId : '',
    childNodeId: typeof raw?.childNodeId === 'string' ? raw.childNodeId : '',
    conditions: isPlainObject(raw?.conditions) ? (raw.conditions as Record<string, unknown>) : {}
  };
}

function normalizeQuestBlueprintSummary(raw: any): QuestBlueprintSummaryLite {
  const viewerAssignments = Array.isArray(raw?.viewerAssignments)
    ? raw.viewerAssignments.map((assignment: any) => normalizeQuestAssignment(assignment))
    : [];
  const viewerAssignmentFallback =
    viewerAssignments[0] ??
    (raw?.viewerAssignment ? normalizeQuestAssignment(raw.viewerAssignment) : null);
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    title: typeof raw?.title === 'string' ? raw.title : 'Quest Blueprint',
    summary:
      typeof raw?.summary === 'string'
        ? raw.summary
        : raw?.summary != null
          ? String(raw.summary)
          : null,
    visibility: isQuestBlueprintVisibility(raw?.visibility) ? raw.visibility : 'GUILD',
    isArchived: Boolean(raw?.isArchived),
    createdById: typeof raw?.createdById === 'string' ? raw.createdById : '',
    createdByName:
      typeof raw?.createdByName === 'string'
        ? raw.createdByName
        : raw?.createdByName == null
          ? null
          : String(raw.createdByName),
    createdAt: normalizeDateString(raw?.createdAt),
    updatedAt: normalizeDateString(raw?.updatedAt),
    lastEditedByName:
      typeof raw?.lastEditedByName === 'string'
        ? raw.lastEditedByName
        : raw?.lastEditedByName == null
          ? null
          : String(raw.lastEditedByName),
    folderId: typeof raw?.folderId === 'string' ? raw.folderId : null,
    folderSortOrder: typeof raw?.folderSortOrder === 'number' ? raw.folderSortOrder : 0,
    nodeCount: typeof raw?.nodeCount === 'number' ? raw.nodeCount : 0,
    assignmentCounts: normalizeAssignmentCounts(raw?.assignmentCounts),
    viewerAssignment: viewerAssignmentFallback,
    viewerAssignments: viewerAssignments.length ? viewerAssignments : undefined
  };
}

function normalizeQuestBlueprintDetail(raw: any): QuestBlueprintDetailPayload {
  const viewerAssignments = Array.isArray(raw?.viewerAssignments)
    ? raw.viewerAssignments.map((assignment: any) => normalizeQuestAssignment(assignment))
    : [];
  const viewerAssignmentFallback =
    viewerAssignments[0] ??
    (raw?.viewerAssignment ? normalizeQuestAssignment(raw.viewerAssignment) : null);
  return {
    blueprint: normalizeQuestBlueprintSummary(raw?.blueprint ?? raw),
    nodes: Array.isArray(raw?.nodes) ? raw.nodes.map((node: any) => normalizeQuestNode(node)) : [],
    links: Array.isArray(raw?.links) ? raw.links.map((link: any) => normalizeQuestLink(link)) : [],
    assignmentStats: normalizeAssignmentCounts(raw?.assignmentStats),
    viewerAssignment: viewerAssignmentFallback,
    viewerAssignments: viewerAssignments.length ? viewerAssignments : undefined,
    guildAssignments: Array.isArray(raw?.guildAssignments)
      ? raw.guildAssignments.map((assignment: any) => normalizeQuestAssignment(assignment))
      : undefined,
    permissions: normalizeQuestPermissions(raw?.permissions),
    availableNodeTypes: Array.isArray(raw?.availableNodeTypes)
      ? raw.availableNodeTypes.filter((type: any) => isQuestNodeType(type))
      : QUEST_NODE_TYPE_VALUES
  };
}

function normalizeEqTaskSummary(raw: any): EqTaskSummary {
  return {
    id: Number(raw?.id) || 0,
    title: typeof raw?.title === 'string' ? raw.title : 'Task',
    description: typeof raw?.description === 'string' ? raw.description : null,
    type: Number.isFinite(Number(raw?.type)) ? Number(raw.type) : null,
    duration: Number.isFinite(Number(raw?.duration)) ? Number(raw.duration) : null,
    durationCode: Number.isFinite(Number(raw?.durationCode ?? raw?.duration_code))
      ? Number(raw.durationCode ?? raw.duration_code)
      : null,
    minLevel: Number.isFinite(Number(raw?.minLevel ?? raw?.min_level))
      ? Number(raw.minLevel ?? raw.min_level)
      : null,
    maxLevel: Number.isFinite(Number(raw?.maxLevel ?? raw?.max_level))
      ? Number(raw.maxLevel ?? raw.max_level)
      : null,
    repeatable: Boolean(raw?.repeatable),
    reward: typeof raw?.reward === 'string' ? raw.reward : null,
    completionEmote:
      typeof raw?.completionEmote === 'string'
        ? raw.completionEmote
        : typeof raw?.completion_emote === 'string'
          ? raw.completion_emote
          : null
  };
}

function normalizeRaidSignup(raw: any): RaidSignup {
  const fallbackCharacterName =
    typeof raw?.character?.name === 'string'
      ? raw.character.name
      : typeof raw?.characterName === 'string'
        ? raw.characterName
        : '';

  const characterClass =
    typeof raw?.characterClass === 'string'
      ? (raw.characterClass as CharacterClass)
      : typeof raw?.character?.class === 'string'
        ? (raw.character.class as CharacterClass)
        : 'UNKNOWN';

  const levelValue =
    typeof raw?.characterLevel === 'number'
      ? raw.characterLevel
      : typeof raw?.character?.level === 'number'
        ? raw.character.level
        : null;

  const isMainValue =
    typeof raw?.isMain === 'boolean'
      ? raw.isMain
      : typeof raw?.character?.isMain === 'boolean'
        ? raw.character.isMain
        : false;

  const statusValue: SignupStatus =
    raw?.status === 'NOT_ATTENDING' ? 'NOT_ATTENDING' : 'CONFIRMED';

  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    raidId: typeof raw?.raidId === 'string' ? raw.raidId : '',
    userId:
      typeof raw?.userId === 'string'
        ? raw.userId
        : typeof raw?.user?.id === 'string'
          ? raw.user.id
          : '',
    characterId:
      typeof raw?.characterId === 'string'
        ? raw.characterId
        : typeof raw?.character?.id === 'string'
          ? raw.character.id
          : '',
    characterName: fallbackCharacterName,
    characterClass,
    characterLevel: levelValue,
    isMain: isMainValue,
    status: statusValue,
    createdAt: normalizeDateString(raw?.createdAt),
    updatedAt: normalizeDateString(raw?.updatedAt),
    user: {
      id:
        typeof raw?.user?.id === 'string'
          ? raw.user.id
          : typeof raw?.userId === 'string'
            ? raw.userId
            : '',
      displayName: typeof raw?.user?.displayName === 'string' ? raw.user.displayName : '',
      nickname: typeof raw?.user?.nickname === 'string' ? raw.user.nickname : null
    },
    character: {
      id:
        typeof raw?.character?.id === 'string'
          ? raw.character.id
          : typeof raw?.characterId === 'string'
            ? raw.characterId
            : '',
      name: fallbackCharacterName,
      class: characterClass,
      level: levelValue,
      isMain: isMainValue
    }
  };
}

function normalizeRaidSummary(
  raid: any,
  options?: { includeAttendance?: boolean }
): RaidEventSummary {
  const includeAttendance = options?.includeAttendance ?? false;

  const attendance = includeAttendance && Array.isArray(raid?.attendance)
    ? raid.attendance.map((event: any) => ({
      id: event.id,
      createdAt: event.createdAt,
      eventType: event.eventType ?? undefined
    }))
    : [];

  const rawMonitor = raid?.logMonitor;
  const logMonitor = rawMonitor
    ? {
      isActive:
        typeof rawMonitor.isActive === 'boolean'
          ? rawMonitor.isActive
          : true,
      userId: typeof rawMonitor.userId === 'string' ? rawMonitor.userId : null,
      userDisplayName:
        typeof rawMonitor.userDisplayName === 'string'
          ? rawMonitor.userDisplayName
          : null,
      startedAt: normalizeNullableDate(rawMonitor.startedAt)
    }
    : null;

  const recurrence = raid?.recurrence
    ? {
      id: typeof raid.recurrence?.id === 'string' ? raid.recurrence.id : '',
      frequency:
        raid.recurrence?.frequency === 'DAILY' ||
          raid.recurrence?.frequency === 'WEEKLY' ||
          raid.recurrence?.frequency === 'MONTHLY'
          ? raid.recurrence.frequency
          : 'WEEKLY',
      interval:
        typeof raid.recurrence?.interval === 'number' && raid.recurrence.interval > 0
          ? raid.recurrence.interval
          : 1,
      endDate: normalizeNullableDate(raid.recurrence?.endDate),
      isActive: raid.recurrence?.isActive !== false
    }
    : null;

  const signupCounts = raid?.signupCounts
    ? {
      confirmed: typeof raid.signupCounts.confirmed === 'number' ? raid.signupCounts.confirmed : 0,
      notAttending: typeof raid.signupCounts.notAttending === 'number' ? raid.signupCounts.notAttending : 0
    }
    : undefined;

  return {
    id: raid?.id ?? '',
    guildId: raid?.guildId ?? '',
    name: raid?.name ?? '',
    startTime: normalizeDateString(raid?.startTime),
    startedAt: normalizeNullableDate(raid?.startedAt),
    endedAt: normalizeNullableDate(raid?.endedAt),
    canceledAt: normalizeNullableDate(raid?.canceledAt),
    targetZones: normalizeStringArray(raid?.targetZones),
    targetBosses: normalizeStringArray(raid?.targetBosses),
    notes: typeof raid?.notes === 'string' ? raid.notes : raid?.notes ?? null,
    discordVoiceUrl:
      typeof raid?.discordVoiceUrl === 'string'
        ? raid.discordVoiceUrl
        : raid?.discordVoiceUrl ?? null,
    isActive: Boolean(raid?.isActive),
    isRecurring: Boolean(raid?.isRecurring || recurrence),
    recurrence,
    raidSignupNotificationsEnabled:
      typeof raid?.raidSignupNotificationsEnabled === 'boolean'
        ? raid.raidSignupNotificationsEnabled
        : undefined,
    raidCreatedNotificationsEnabled:
      typeof raid?.raidCreatedNotificationsEnabled === 'boolean'
        ? raid.raidCreatedNotificationsEnabled
        : undefined,
    logMonitor,
    permissions: raid?.permissions ?? undefined,
    attendance,
    hasUnassignedLoot: Boolean(raid?.hasUnassignedLoot),
    signupCounts
  };
}

function normalizeAttendanceMetricRecord(raw: any): AttendanceMetricRecord {
  const character = raw?.character ?? {};
  const raid = raw?.raid ?? {};
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    status: (raw?.status as AttendanceStatus) ?? 'PRESENT',
    timestamp: typeof raw?.timestamp === 'string' ? raw.timestamp : '',
    eventType: (raw?.eventType as AttendanceEventType) ?? 'LOG',
    raid: {
      id: typeof raid?.id === 'string' ? raid.id : '',
      name: typeof raid?.name === 'string' ? raid.name : 'Unknown Raid',
      startTime: typeof raid?.startTime === 'string' ? raid.startTime : null
    },
    character: {
      id: typeof character?.id === 'string' ? character.id : null,
      name: typeof character?.name === 'string' ? character.name : 'Unknown',
      class:
        typeof character?.class === 'string'
          ? (character.class as CharacterClass)
          : null,
      isMain:
        typeof character?.isMain === 'boolean'
          ? character.isMain
          : null,
      userId:
        typeof character?.userId === 'string'
          ? character.userId
          : null,
      userDisplayName:
        typeof character?.userDisplayName === 'string'
          ? character.userDisplayName
          : null
    }
  };
}

function normalizeGuildNpcAssociation(entry: any): GuildNpcAssociation {
  return {
    id: typeof entry?.id === 'string' ? entry.id : '',
    name:
      typeof entry?.name === 'string'
        ? entry.name
        : typeof entry?.associatedNpcName === 'string'
          ? entry.associatedNpcName
          : 'Unknown NPC',
    allaLink: typeof entry?.allaLink === 'string' ? entry.allaLink : ''
  };
}

function normalizeGuildNpcNote(note: any): GuildNpcNote {
  const spells = Array.isArray(note?.spells)
    ? note.spells.map((entry: any) => normalizeGuildNpcAssociation(entry))
    : [];
  const relatedNpcs = Array.isArray(note?.relatedNpcs)
    ? note.relatedNpcs.map((entry: any) =>
      normalizeGuildNpcAssociation({
        ...entry,
        name: entry?.associatedNpcName ?? entry?.name
      })
    )
    : [];

  return {
    id: typeof note?.id === 'string' ? note.id : '',
    npcName: typeof note?.npcName === 'string' ? note.npcName : 'Unknown NPC',
    notes: typeof note?.notes === 'string' ? note.notes : note?.notes ?? null,
    allaLink:
      typeof note?.allaLink === 'string'
        ? note.allaLink
        : note?.allaLink ?? null,
    lastEditedById:
      typeof note?.lastEditedById === 'string' ? note.lastEditedById : null,
    lastEditedByName:
      typeof note?.lastEditedByName === 'string'
        ? note.lastEditedByName
        : null,
    deletionRequestedById:
      typeof note?.deletionRequestedById === 'string'
        ? note.deletionRequestedById
        : null,
    deletionRequestedByName:
      typeof note?.deletionRequestedByName === 'string'
        ? note.deletionRequestedByName
        : null,
    deletionRequestedAt: normalizeDateString(note?.deletionRequestedAt),
    createdAt: normalizeDateString(note?.createdAt),
    updatedAt: normalizeDateString(note?.updatedAt),
    spells,
    relatedNpcs
  };
}

function normalizeGuildBankCharacter(raw: any): GuildBankCharacter {
  const isPersonal =
    raw?.isPersonal === true || raw?.isPersonal === 1 || raw?.isPersonal === '1';
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    name: typeof raw?.name === 'string' ? raw.name : 'Unknown',
    userId: typeof raw?.userId === 'string' ? raw.userId : null,
    isPersonal,
    createdAt: normalizeDateString(raw?.createdAt) ?? '',
    foundInEq: raw?.foundInEq === true,
    class: typeof raw?.class === 'string' ? (raw.class as CharacterClass) : undefined
  };
}

function normalizeGuildBankItem(raw: any): GuildBankItem {
  const location =
    raw?.location === 'WORN' ||
      raw?.location === 'PERSONAL' ||
      raw?.location === 'CURSOR' ||
      raw?.location === 'BANK'
      ? raw.location
      : 'PERSONAL';

  const itemId =
    typeof raw?.itemId === 'number'
      ? raw.itemId
      : typeof raw?.itemId === 'string'
        ? Number.parseInt(raw.itemId, 10) || null
        : null;

  const itemIconId =
    typeof raw?.itemIconId === 'number'
      ? raw.itemIconId
      : typeof raw?.itemIconId === 'string'
        ? Number.parseInt(raw.itemIconId, 10) || null
        : null;

  const charges =
    typeof raw?.charges === 'number'
      ? raw.charges
      : typeof raw?.charges === 'string'
        ? Number.parseInt(raw.charges, 10) || null
        : null;

  return {
    characterName: typeof raw?.characterName === 'string' ? raw.characterName : 'Unknown',
    slotId:
      typeof raw?.slotId === 'number'
        ? raw.slotId
        : typeof raw?.slotId === 'string'
          ? Number.parseInt(raw.slotId, 10) || 0
          : 0,
    location,
    itemId,
    itemName: typeof raw?.itemName === 'string' ? raw.itemName : 'Unknown Item',
    itemIconId,
    charges: charges ?? null,
    bagSlots: typeof raw?.bagSlots === 'number' ? raw.bagSlots : null
  };
}

function normalizeGuildBankSnapshot(raw: any): GuildBankSnapshot {
  const characters = Array.isArray(raw?.characters)
    ? raw.characters.map((entry: any) => normalizeGuildBankCharacter(entry))
    : [];
  const items = Array.isArray(raw?.items)
    ? raw.items.map((entry: any) => normalizeGuildBankItem(entry))
    : [];

  return {
    characters,
    items,
    missingCharacters: Array.isArray(raw?.missingCharacters)
      ? raw.missingCharacters.filter((entry: any) => typeof entry === 'string')
      : []
  };
}

function normalizeLootMetricEvent(raw: any): LootMetricEvent {
  const raid = raw?.raid ?? {};
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    timestamp: typeof raw?.timestamp === 'string' ? raw.timestamp : '',
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : '',
    itemName: typeof raw?.itemName === 'string' ? raw.itemName : 'Unknown Item',
    itemId:
      typeof raw?.itemId === 'number'
        ? raw.itemId
        : typeof raw?.itemId === 'string'
          ? Number.parseInt(raw.itemId, 10) || null
          : null,
    itemIconId:
      typeof raw?.itemIconId === 'number'
        ? raw.itemIconId
        : typeof raw?.itemIconId === 'string'
          ? Number.parseInt(raw.itemIconId, 10) || null
          : null,
    looterName: typeof raw?.looterName === 'string' ? raw.looterName : 'Unknown',
    looterClass: typeof raw?.looterClass === 'string' ? raw.looterClass : null,
    emoji: typeof raw?.emoji === 'string' ? raw.emoji : null,
    raid: {
      id: typeof raid?.id === 'string' ? raid.id : '',
      name: typeof raid?.name === 'string' ? raid.name : 'Unknown Raid',
      startTime: typeof raid?.startTime === 'string' ? raid.startTime : null
    }
  };
}

function normalizeGuildMetrics(raw: any): GuildMetrics {
  const attendanceRecords: AttendanceMetricRecord[] = Array.isArray(raw?.attendanceRecords)
    ? raw.attendanceRecords.map((record: any) => normalizeAttendanceMetricRecord(record))
    : [];
  let lootEvents: LootMetricEvent[] = Array.isArray(raw?.lootEvents)
    ? raw.lootEvents.map((event: any) => normalizeLootMetricEvent(event))
    : [];
  lootEvents = lootEvents.filter((event) => !isMasterLooterName(event.looterName));

  const filterOptionsRaw = raw?.filterOptions ?? {};

  const filterOptions: GuildMetricsFilterOptions = {
    classes: Array.isArray(filterOptionsRaw?.classes)
      ? filterOptionsRaw.classes.filter((entry: any) => typeof entry === 'string')
      : [],
    characters: Array.isArray(filterOptionsRaw?.characters)
      ? filterOptionsRaw.characters
        .map((entry: any) => ({
          id: typeof entry?.id === 'string' ? entry.id : null,
          name: typeof entry?.name === 'string' ? entry.name : 'Unknown',
          class:
            typeof entry?.class === 'string'
              ? (entry.class as CharacterClass)
              : null,
          userId: typeof entry?.userId === 'string' ? entry.userId : null,
          userDisplayName:
            typeof entry?.userDisplayName === 'string'
              ? entry.userDisplayName
              : null,
          isMain: Boolean(entry?.isMain)
        }))
      : [],
    raids: Array.isArray(filterOptionsRaw?.raids)
      ? filterOptionsRaw.raids
        .map((entry: any) => ({
          id: typeof entry?.id === 'string' ? entry.id : '',
          name: typeof entry?.name === 'string' ? entry.name : 'Unknown Raid'
        }))
      : [],
    lootParticipants: Array.isArray(filterOptionsRaw?.lootParticipants)
      ? filterOptionsRaw.lootParticipants
        .map((entry: any) => ({
          name: typeof entry?.name === 'string' ? entry.name : 'Unknown',
          looterClass:
            typeof entry?.looterClass === 'string'
              ? entry.looterClass
              : null
        }))
      : []
  };
  filterOptions.lootParticipants = filterOptions.lootParticipants.filter(
    (entry) => !isMasterLooterName(entry.name)
  );

  const summaryRaw = raw?.summary ?? {};
  const uniqueAttendanceCharacters = new Set(
    attendanceRecords.map((record) =>
      record.character.id ? `id:${record.character.id}` : `name:${record.character.name}`
    )
  ).size;
  const uniqueLooters = new Set(lootEvents.map((event) => event.looterName.toLowerCase())).size;
  const raidsTracked = new Set([
    ...attendanceRecords.map((record) => record.raid.id),
    ...lootEvents.map((event) => event.raid.id)
  ]).size;

  const summary: GuildMetricsSummary = {
    attendanceRecords:
      typeof summaryRaw?.attendanceRecords === 'number'
        ? summaryRaw.attendanceRecords
        : attendanceRecords.length,
    uniqueAttendanceCharacters:
      typeof summaryRaw?.uniqueAttendanceCharacters === 'number'
        ? summaryRaw.uniqueAttendanceCharacters
        : uniqueAttendanceCharacters,
    lootEvents: lootEvents.length,
    uniqueLooters: uniqueLooters,
    raidsTracked:
      typeof summaryRaw?.raidsTracked === 'number'
        ? summaryRaw.raidsTracked
        : raidsTracked
  };

  const rangeRaw = raw?.range ?? {};
  const start =
    typeof rangeRaw?.start === 'string'
      ? rangeRaw.start
      : (attendanceRecords[0]?.timestamp ?? new Date(0).toISOString());
  const end =
    typeof rangeRaw?.end === 'string'
      ? rangeRaw.end
      : new Date().toISOString();

  return {
    range: {
      start,
      end
    },
    attendanceRecords,
    lootEvents,
    summary,
    filterOptions,
    earliestRaidDate: typeof raw?.earliestRaidDate === 'string' ? raw.earliestRaidDate : null
  };
}

export const api = {
  async fetchCurrentUser() {
    const response = await axios.get('/api/auth/me');
    return response.data.user ?? null;
  },
  async fetchGuilds(): Promise<GuildSummary[]> {
    const response = await axios.get('/api/guilds');
    return response.data.guilds;
  },

  async createGuild(payload: { name: string; description?: string }): Promise<GuildDetail> {
    const response = await axios.post('/api/guilds', payload);
    return response.data.guild;
  },

  async fetchGuildDetail(guildId: string): Promise<GuildDetail> {
    const response = await axios.get(`/api/guilds/${guildId}`);
    return response.data.guild;
  },

  async fetchGuildBank(guildId: string): Promise<GuildBankSnapshot> {
    const { data } = await axios.get(`/api/guilds/${guildId}/guild-bank`);
    return data;
  },

  async fetchCharacterInventory(characterName: string): Promise<GuildBankItem[]> {
    const { data } = await axios.get(`/api/characters/${encodeURIComponent(characterName)}/inventory`);
    return data.items;
  },

  async fetchGuildBankCharacters(guildId: string): Promise<GuildBankCharacter[]> {
    const response = await axios.get(`/api/guilds/${guildId}/guild-bank/characters`);
    return Array.isArray(response.data.characters) ? response.data.characters.map(normalizeGuildBankCharacter) : [];
  },

  async requestGuildBankItems(
    guildId: string,
    items: Array<{ itemId?: number | null; itemName: string; quantity: number }>
  ): Promise<void> {
    await axios.post(`/api/guilds/${guildId}/guild-bank/request-items`, { items });
  },

  async addGuildBankCharacter(
    guildId: string,
    name: string,
    options?: { isPersonal?: boolean }
  ): Promise<GuildBankCharacter> {
    const response = await axios.post(`/api/guilds/${guildId}/guild-bank/characters`, {
      name,
      isPersonal: options?.isPersonal ?? false
    });
    return normalizeGuildBankCharacter(response.data.character);
  },

  async deleteGuildBankCharacter(guildId: string, characterId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/guild-bank/characters/${characterId}`);
  },

  async fetchQuestTracker(guildId: string): Promise<QuestTrackerSummary> {
    const response = await axios.get(`/api/guilds/${guildId}/quest-tracker`);
    return {
      blueprints: Array.isArray(response.data.blueprints)
        ? response.data.blueprints.map((bp: any) => normalizeQuestBlueprintSummary(bp))
        : [],
      folders: Array.isArray(response.data.folders)
        ? response.data.folders.map((folder: any) => normalizeQuestBlueprintFolder(folder))
        : [],
      permissions: normalizeQuestPermissions(response.data.permissions)
    };
  },

  async fetchQuestBlueprintDetail(
    guildId: string,
    blueprintId: string
  ): Promise<QuestBlueprintDetailPayload> {
    const response = await axios.get(`/api/guilds/${guildId}/quest-tracker/blueprints/${blueprintId}`);
    return normalizeQuestBlueprintDetail(response.data);
  },

  async createQuestBlueprint(
    guildId: string,
    payload: { title: string; summary?: string | null; visibility?: QuestBlueprintVisibility }
  ): Promise<QuestBlueprintSummaryLite> {
    const response = await axios.post(`/api/guilds/${guildId}/quest-tracker/blueprints`, payload);
    return normalizeQuestBlueprintSummary(response.data.blueprint);
  },

  async importQuestBlueprintFromTask(
    guildId: string,
    payload: { taskId: number }
  ): Promise<QuestBlueprintSummaryLite> {
    const response = await axios.post(
      `/api/guilds/${guildId}/quest-tracker/blueprints/import-task`,
      payload
    );
    return normalizeQuestBlueprintSummary(response.data.blueprint);
  },

  async searchEqTasks(
    guildId: string,
    params: { query?: string; page?: number; pageSize?: number }
  ): Promise<EqTaskSearchResult> {
    const response = await axios.get(`/api/guilds/${guildId}/quest-tracker/eq-tasks`, {
      params: {
        q: params.query,
        page: params.page,
        pageSize: params.pageSize
      }
    });
    const tasks = Array.isArray(response.data.tasks)
      ? response.data.tasks.map((task: any) => normalizeEqTaskSummary(task))
      : [];
    return {
      tasks,
      total: Number(response.data.total) || 0,
      page: Number(response.data.page) || 1,
      pageSize: Number(response.data.pageSize) || params.pageSize || 10
    };
  },

  async createQuestFolder(
    guildId: string,
    payload: { title: string }
  ): Promise<QuestBlueprintFolderView> {
    const response = await axios.post(`/api/guilds/${guildId}/quest-tracker/folders`, payload);
    return normalizeQuestBlueprintFolder(response.data.folder);
  },

  async updateQuestFolder(
    guildId: string,
    folderId: string,
    payload: { title: string }
  ): Promise<QuestBlueprintFolderView> {
    const response = await axios.patch(
      `/api/guilds/${guildId}/quest-tracker/folders/${folderId}`,
      payload
    );
    return normalizeQuestBlueprintFolder(response.data.folder);
  },

  async deleteQuestFolder(guildId: string, folderId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/quest-tracker/folders/${folderId}`);
  },

  async deleteQuestBlueprint(guildId: string, blueprintId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/quest-tracker/blueprints/${blueprintId}`);
  },

  async reorderQuestBlueprints(
    guildId: string,
    updates: Array<{ blueprintId: string; folderId?: string | null; sortOrder: number }>
  ): Promise<void> {
    await axios.post(`/api/guilds/${guildId}/quest-tracker/blueprints/reorder`, { updates });
  },

  async reorderQuestFolders(
    guildId: string,
    updates: Array<{ folderId: string; sortOrder: number }>
  ): Promise<void> {
    await axios.post(`/api/guilds/${guildId}/quest-tracker/folders/reorder`, { updates });
  },

  async updateQuestBlueprint(
    guildId: string,
    blueprintId: string,
    payload: Partial<{ title: string; summary: string | null; visibility: QuestBlueprintVisibility; isArchived: boolean }>
  ): Promise<QuestBlueprintSummaryLite> {
    const response = await axios.patch(
      `/api/guilds/${guildId}/quest-tracker/blueprints/${blueprintId}`,
      payload
    );
    return normalizeQuestBlueprintSummary(response.data.blueprint);
  },

  async saveQuestBlueprintGraph(
    guildId: string,
    blueprintId: string,
    payload: { nodes: QuestNodeInputPayload[]; links: QuestLinkInputPayload[] }
  ): Promise<QuestBlueprintDetailPayload> {
    const response = await axios.put(
      `/api/guilds/${guildId}/quest-tracker/blueprints/${blueprintId}/graph`,
      payload
    );
    return normalizeQuestBlueprintDetail(response.data);
  },

  async startQuestAssignment(
    guildId: string,
    blueprintId: string,
    payload: { characterId: string }
  ): Promise<QuestAssignment> {
    const response = await axios.post(
      `/api/guilds/${guildId}/quest-tracker/blueprints/${blueprintId}/start`,
      payload
    );
    return normalizeQuestAssignment(response.data.assignment);
  },

  async updateQuestAssignmentStatus(
    guildId: string,
    assignmentId: string,
    status: QuestAssignmentStatus
  ): Promise<QuestAssignment> {
    const response = await axios.patch(
      `/api/guilds/${guildId}/quest-tracker/assignments/${assignmentId}/status`,
      { status }
    );
    return normalizeQuestAssignment(response.data.assignment);
  },

  async updateQuestAssignmentProgress(
    guildId: string,
    assignmentId: string,
    updates: Array<{
      nodeId: string;
      status?: QuestNodeProgressStatus;
      progressCount?: number;
      notes?: string | null;
      isDisabled?: boolean;
    }>
  ): Promise<QuestAssignment> {
    const response = await axios.patch(
      `/api/guilds/${guildId}/quest-tracker/assignments/${assignmentId}/progress`,
      { updates }
    );
    return normalizeQuestAssignment(response.data.assignment);
  },

  async fetchGuildNpcNotes(
    guildId: string
  ): Promise<{ notes: GuildNpcNote[]; canEdit: boolean; canApproveDeletion: boolean; viewerRole: GuildRole | null }> {
    const response = await axios.get(`/api/guilds/${guildId}/npc-notes`);
    const notes = Array.isArray(response.data.notes)
      ? response.data.notes.map((note: any) => normalizeGuildNpcNote(note))
      : [];
    return {
      notes,
      canEdit: Boolean(response.data.canEdit ?? true),
      canApproveDeletion: Boolean(response.data.canApproveDeletion),
      viewerRole:
        typeof response.data.viewerRole === 'string'
          ? response.data.viewerRole
          : null
    };
  },

  async upsertGuildNpcNote(
    guildId: string,
    npcName: string,
    payload: {
      notes?: string | null;
      allaLink?: string | null;
      spells: Array<{ name: string; allaLink: string }>;
      relatedNpcs: Array<{ name: string; allaLink: string }>;
    }
  ): Promise<GuildNpcNote> {
    const response = await axios.put(
      `/api/guilds/${guildId}/npc-notes/${encodeURIComponent(npcName)}`,
      payload
    );
    return normalizeGuildNpcNote(response.data.note);
  },

  async deleteGuildNpcNote(guildId: string, npcName: string) {
    await axios.delete(`/api/guilds/${guildId}/npc-notes/${encodeURIComponent(npcName)}`);
  },

  async requestGuildNpcNoteDeletion(guildId: string, npcName: string): Promise<GuildNpcNote> {
    const response = await axios.post(
      `/api/guilds/${guildId}/npc-notes/${encodeURIComponent(npcName)}/delete-request`
    );
    return normalizeGuildNpcNote(response.data.note);
  },

  async decideGuildNpcNoteDeletion(
    guildId: string,
    npcName: string,
    decision: 'APPROVE' | 'DENY'
  ): Promise<GuildNpcNote | null> {
    const response = await axios.post(
      `/api/guilds/${guildId}/npc-notes/${encodeURIComponent(npcName)}/delete-decision`,
      { decision }
    );
    if (decision === 'APPROVE') {
      return null;
    }
    return normalizeGuildNpcNote(response.data.note);
  },

  async fetchGuildMetrics(guildId: string, params?: GuildMetricsQuery): Promise<GuildMetrics> {
    const response = await axios.get(`/api/guilds/${guildId}/metrics`, {
      params: {
        startDate: params?.startDate,
        endDate: params?.endDate
      }
    });
    return normalizeGuildMetrics(response.data.metrics ?? {});
  },

  async updateGuildSettings(guildId: string, payload: {
    description?: string | null;
    defaultRaidStartTime?: string | null;
    defaultRaidEndTime?: string | null;
    defaultDiscordVoiceUrl?: string | null;
    discordWidgetServerId?: string | null;
    discordWidgetTheme?: DiscordWidgetTheme | null;
    discordWidgetEnabled?: boolean;
    blacklistSpells?: boolean;
  }): Promise<GuildDetail> {
    const response = await axios.patch(`/api/guilds/${guildId}`, payload);
    return response.data.guild;
  },

  async fetchUserCharacters(): Promise<UserCharacter[]> {
    const response = await axios.get('/api/characters');
    return response.data.characters;
  },

  async createCharacter(payload: CharacterPayload) {
    const response = await axios.post('/api/characters', payload);
    return response.data.character;
  },

  async updateCharacter(characterId: string, payload: CharacterUpdatePayload) {
    const response = await axios.patch(`/api/characters/${characterId}`, payload);
    return response.data.character;
  },

  async deleteCharacter(characterId: string) {
    await axios.delete(`/api/characters/${characterId}`);
  },

  async fetchRaidsForGuild(
    guildId: string
  ): Promise<{ raids: RaidEventSummary[]; permissions: { canManage: boolean; role: GuildRole } }> {
    const response = await axios.get(`/api/raids/guild/${guildId}`);
    const normalizedRaids = Array.isArray(response.data.raids)
      ? response.data.raids.map((raid: any) =>
        normalizeRaidSummary(raid, { includeAttendance: true })
      )
      : [];
    return {
      raids: normalizedRaids,
      permissions: response.data.permissions ?? { canManage: false, role: 'MEMBER' }
    };
  },

  async fetchRaid(raidId: string): Promise<RaidDetail> {
    const response = await axios.get(`/api/raids/${raidId}`);
    const raid = response.data.raid;
    const normalizedSummary = normalizeRaidSummary(raid);
    const normalizedSignups = Array.isArray(raid?.signups)
      ? raid.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
    const npcKills =
      Array.isArray(raid?.npcKills) && raid.npcKills.length > 0
        ? raid.npcKills
          .map(
            (kill: any): { npcName: string; killCount: number } => ({
              npcName: typeof kill?.npcName === 'string' ? kill.npcName : 'Unknown NPC',
              killCount:
                typeof kill?.killCount === 'number' && kill.killCount > 0 ? kill.killCount : 0
            })
          )
          .filter(
            (kill: { npcName: string; killCount: number }) =>
              kill.killCount > 0 && kill.npcName.trim().length > 0
          )
        : [];
    const npcKillEvents =
      Array.isArray(raid?.npcKillEvents) && raid.npcKillEvents.length > 0
        ? raid.npcKillEvents
          .map(
            (event: any): { npcName: string; killerName: string | null; occurredAt: string | null } => ({
              npcName: typeof event?.npcName === 'string' ? event.npcName : 'Unknown NPC',
              killerName:
                typeof event?.killerName === 'string' && event.killerName.trim().length > 0
                  ? event.killerName
                  : null,
              occurredAt: normalizeDateString(event?.occurredAt)
            })
          )
          .filter(
            (event: { npcName: string; killerName: string | null; occurredAt: string | null }) =>
              Boolean(event.occurredAt)
          )
        : [];
    return {
      ...raid,
      ...normalizedSummary,
      attendance: Array.isArray(raid?.attendance)
        ? raid.attendance.map(normalizeAttendanceEvent)
        : [],
      signups: normalizedSignups,
      npcKills,
      npcKillEvents
    };
  },

  async updateRaidSignups(raidId: string, signups: SignupEntry[]): Promise<RaidSignup[]> {
    const response = await axios.put(`/api/raids/${raidId}/signups/me`, {
      signups
    });
    return Array.isArray(response.data.signups)
      ? response.data.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
  },

  async updateSignupStatus(raidId: string, signupId: string, status: SignupStatus): Promise<RaidSignup[]> {
    const response = await axios.patch(`/api/raids/${raidId}/signups/${signupId}`, {
      status
    });
    return Array.isArray(response.data.signups)
      ? response.data.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
  },

  async removeSignup(raidId: string, signupId: string): Promise<RaidSignup[]> {
    const response = await axios.delete(`/api/raids/${raidId}/signups/${signupId}`);
    return Array.isArray(response.data.signups)
      ? response.data.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
  },

  async addSignup(raidId: string, characterId: string, status: SignupStatus = 'CONFIRMED'): Promise<RaidSignup[]> {
    const response = await axios.post(`/api/raids/${raidId}/signups`, {
      characterId,
      status
    });
    return Array.isArray(response.data.signups)
      ? response.data.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
  },

  async searchCharactersForSignup(raidId: string, query: string): Promise<CharacterSearchResult[]> {
    const response = await axios.get(`/api/raids/${raidId}/signups/search`, {
      params: { q: query }
    });
    return Array.isArray(response.data.characters) ? response.data.characters : [];
  },

  async fetchRaidLogMonitorStatus(raidId: string): Promise<RaidLogMonitorStatus> {
    const response = await axios.get(`/api/raids/${raidId}/log-monitor`);
    return {
      session: response.data.session ?? null,
      heartbeatIntervalMs: response.data.heartbeatIntervalMs ?? 10_000,
      timeoutMs: response.data.timeoutMs ?? 30_000
    };
  },

  async startRaidLogMonitor(raidId: string, payload: { fileName: string }): Promise<RaidLogMonitorStatus> {
    const response = await axios.post(`/api/raids/${raidId}/log-monitor/start`, payload);
    return {
      session: response.data.session ?? null,
      heartbeatIntervalMs: response.data.heartbeatIntervalMs ?? 10_000,
      timeoutMs: response.data.timeoutMs ?? 30_000
    };
  },

  async heartbeatRaidLogMonitor(raidId: string, sessionId: string): Promise<RaidLogMonitorSession | null> {
    const response = await axios.post(`/api/raids/${raidId}/log-monitor/heartbeat`, { sessionId });
    return response.data.session ?? null;
  },

  async stopRaidLogMonitor(raidId: string, payload: { sessionId?: string; force?: boolean }) {
    await axios.post(`/api/raids/${raidId}/log-monitor/stop`, payload);
  },

  async fetchRaidLoot(raidId: string): Promise<RaidLootEvent[]> {
    const response = await axios.get(`/api/raids/${raidId}/loot`);
    return Array.isArray(response.data.loot) ? response.data.loot : [];
  },

  async recordRaidNpcKills(
    raidId: string,
    kills: Array<{ npcName: string; occurredAt: string; killerName?: string | null; rawLine?: string | null }>
  ) {
    if (!Array.isArray(kills) || kills.length === 0) {
      return;
    }
    await axios.post(`/api/raids/${raidId}/npc-kills`, { kills });
  },

  async deleteRaidNpcKills(raidId: string) {
    await axios.delete(`/api/raids/${raidId}/npc-kills`);
  },

  async createRaidLoot(
    raidId: string,
    events: Array<{
      itemName: string;
      itemId?: number | null;
      looterName: string;
      looterClass?: string | null;
      emoji?: string | null;
      note?: string | null;
      eventTime?: string | null;
    }>
  ): Promise<RaidLootEvent[]> {
    const response = await axios.post(`/api/raids/${raidId}/loot`, { events });
    return Array.isArray(response.data.loot) ? response.data.loot : [];
  },

  async updateRaidLoot(
    raidId: string,
    lootId: string,
    payload: Partial<Omit<RaidLootEvent, 'id' | 'raidId' | 'guildId'>>
  ): Promise<RaidLootEvent> {
    const response = await axios.patch(`/api/raids/${raidId}/loot/${lootId}`, payload);
    return response.data.loot;
  },

  async deleteRaidLoot(raidId: string, lootId: string) {
    await axios.delete(`/api/raids/${raidId}/loot/${lootId}`);
  },

  async clearRaidLoot(raidId: string) {
    await axios.delete(`/api/raids/${raidId}/loot`);
  },

  async fetchGuildLootListSummary(guildId: string): Promise<GuildLootListSummary> {
    const response = await axios.get(`/api/guilds/${guildId}/loot-lists/summary`);
    return {
      whitelist: Array.isArray(response.data.whitelist) ? response.data.whitelist : [],
      blacklist: Array.isArray(response.data.blacklist) ? response.data.blacklist : []
    };
  },

  async fetchGuildLootListPage(
    guildId: string,
    options: GuildLootListQueryOptions
  ): Promise<GuildLootListPage> {
    const response = await axios.get(`/api/guilds/${guildId}/loot-lists`, {
      params: {
        type: options.type,
        search: options.search || undefined,
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 25,
        sortBy: options.sortBy ?? 'itemName',
        sortDirection: options.sortDirection ?? 'asc'
      }
    });
    return {
      entries: Array.isArray(response.data.entries) ? response.data.entries : [],
      total: response.data.total ?? 0,
      page: response.data.page ?? 1,
      totalPages: response.data.totalPages ?? 1,
      pageSize: response.data.pageSize ?? (options.pageSize ?? 25)
    };
  },

  async createGuildLootListEntry(
    guildId: string,
    payload: { type: LootListType; itemName: string; itemId?: number | null }
  ): Promise<GuildLootListEntry> {
    const response = await axios.post(`/api/guilds/${guildId}/loot-lists`, {
      type: payload.type,
      itemName: payload.itemName,
      itemId: payload.itemId ?? null
    });
    return response.data.entry;
  },

  async updateGuildLootListEntry(
    guildId: string,
    entryId: string,
    payload: { type?: LootListType; itemName?: string; itemId?: number | null }
  ): Promise<GuildLootListEntry> {
    const response = await axios.patch(`/api/guilds/${guildId}/loot-lists/${entryId}`, {
      ...payload,
      itemId: payload.itemId ?? (payload.itemId === null ? null : undefined)
    });
    return response.data.entry;
  },

  async deleteGuildLootListEntry(guildId: string, entryId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/loot-lists/${entryId}`);
  },

  async fetchRecentLoot(page = 1, limit = 6): Promise<{
    loot: RecentLootEntry[];
    page: number;
    totalPages: number;
    total: number;
  }> {
    const response = await axios.get('/api/user/recent-loot', {
      params: { page, limit }
    });
    return {
      loot: Array.isArray(response.data.loot) ? response.data.loot : [],
      page: response.data.page ?? page,
      totalPages: response.data.totalPages ?? 1,
      total: response.data.total ?? 0
    };
  },

  async fetchGuildLootSettings(guildId: string): Promise<GuildLootParserSettings> {
    const response = await axios.get(`/api/guilds/${guildId}/loot-settings`);
    return normalizeLootParserSettings(response.data.settings);
  },

  async updateGuildLootSettings(guildId: string, payload: GuildLootParserSettings) {
    const requestPayload: GuildLootParserSettings = {
      emoji: payload.emoji,
      patterns: payload.patterns.map((pattern, index) => ({
        id: pattern.id || `pattern-${index}`,
        label: pattern.label || `Pattern ${index + 1}`,
        pattern: pattern.pattern,
        ignoredMethods: sanitizeMethodList(pattern.ignoredMethods)
      }))
    };

    const response = await axios.put(`/api/guilds/${guildId}/loot-settings`, requestPayload);
    return normalizeLootParserSettings(response.data.settings);
  },

  async updateRaid(
    raidId: string,
    payload: {
      name?: string;
      startTime?: string;
      startedAt?: string | null;
      endedAt?: string | null;
      targetZones?: string[];
      targetBosses?: string[];
      notes?: string;
      isActive?: boolean;
      discordVoiceUrl?: string | null;
      recurrence?:
      | {
        frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
        interval: number;
        endDate?: string | null;
        isActive?: boolean;
      }
      | null;
    }
  ) {
    const response = await axios.patch(`/api/raids/${raidId}`, payload);
    return response.data.raid;
  },

  async createRaidEvent(payload: {
    guildId: string;
    name: string;
    startTime: string;
    startedAt?: string;
    endedAt?: string;
    targetZones: string[];
    targetBosses: string[];
    notes?: string;
    discordVoiceUrl?: string;
    recurrence?: {
      frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      interval: number;
      endDate?: string | null;
    } | null;
  }) {
    const response = await axios.post('/api/raids', payload);
    return response.data.raid;
  },

  async uploadRoster(
    raidEventId: string,
    file: File
  ): Promise<
    AxiosResponse<{
      preview: AttendanceRecordInput[];
      meta?: { filename: string; uploadedAt: string } | null;
    }>
  > {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`/api/attendance/raid/${raidEventId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  async createAttendanceEvent(
    raidEventId: string,
    payload: {
      note?: string;
      snapshot?: unknown;
      records: AttendanceRecordInput[];
      eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
    }
  ): Promise<AttendanceEventSummary> {
    const response = await axios.post(`/api/attendance/raid/${raidEventId}`, payload);
    return normalizeAttendanceEvent(response.data.attendanceEvent);
  },

  async updateAttendanceEvent(
    attendanceEventId: string,
    payload: {
      records: AttendanceRecordInput[];
      note?: string;
      snapshot?: unknown;
    }
  ): Promise<AttendanceEventSummary> {
    const response = await axios.patch(`/api/attendance/event/${attendanceEventId}`, payload);
    return normalizeAttendanceEvent(response.data.attendanceEvent);
  },

  async fetchAttendance(raidEventId: string): Promise<AttendanceEventSummary[]> {
    const response = await axios.get(`/api/attendance/raid/${raidEventId}`);
    const events = response.data.attendanceEvents ?? [];
    return Array.isArray(events) ? events.map(normalizeAttendanceEvent) : [];
  },

  async fetchAccountProfile(): Promise<AccountProfile | null> {
    const response = await axios.get('/api/account/profile');
    if (!response.data?.profile) {
      return null;
    }
    return {
      userId: response.data.profile.userId,
      email: response.data.profile.email,
      displayName: response.data.profile.displayName,
      nickname: response.data.profile.nickname ?? null,
      defaultLogFileName: response.data.profile.defaultLogFileName ?? null
    };
  },

  async updateAccountProfile(payload: {
    nickname?: string | null;
    defaultLogFileName?: string | null;
  }): Promise<AccountProfile> {
    const response = await axios.patch('/api/account/profile', payload);
    const profile = response.data.profile;
    return {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      nickname: profile.nickname ?? null,
      defaultLogFileName: profile.defaultLogFileName ?? null
    };
  },

  async fetchRecentAttendance(limit?: number): Promise<RecentAttendanceEntry[]> {
    const response = await axios.get('/api/attendance/user/recent', {
      params: limit ? { limit } : undefined
    });
    const attendance = response.data.attendance ?? [];
    if (!Array.isArray(attendance)) {
      return [];
    }

    return attendance.map((event: any) => ({
      ...event,
      characters: Array.isArray(event.characters)
        ? event.characters.map((record: any) => {
          const normalized = normalizeAttendanceRecord(record);
          return {
            ...normalized,
            status: (record.status ?? normalized.status ?? 'PRESENT') as AttendanceStatus
          };
        })
        : []
    }));
  },

  async startRaid(raidId: string) {
    const response = await axios.post(`/api/raids/${raidId}/start`);
    return response.data.raid;
  },

  async endRaid(raidId: string) {
    const response = await axios.post(`/api/raids/${raidId}/end`);
    return response.data.raid;
  },

  async restartRaid(raidId: string) {
    const response = await axios.post(`/api/raids/${raidId}/restart`);
    return response.data.raid;
  },

  async cancelRaid(raidId: string) {
    const response = await axios.post(`/api/raids/${raidId}/cancel`);
    return response.data.raid;
  },

  async uncancelRaid(raidId: string) {
    const response = await axios.post(`/api/raids/${raidId}/uncancel`);
    return response.data.raid;
  },

  async announceRaid(raidId: string) {
    await axios.post(`/api/raids/${raidId}/announce`);
  },

  async deleteRaid(raidId: string, options?: { scope?: 'EVENT' | 'SERIES' }) {
    const config = options?.scope
      ? {
        data: { scope: options.scope }
      }
      : undefined;
    await axios.delete(`/api/raids/${raidId}`, config);
  },

  async deleteAttendanceEvent(attendanceEventId: string) {
    await axios.delete(`/api/attendance/event/${attendanceEventId}`);
  },

  async updateGuildMemberRole(guildId: string, memberId: string, role: GuildRole) {
    const response = await axios.patch(`/api/guilds/${guildId}/members/${memberId}/role`, {
      role
    });
    return response.data.membership;
  },

  async assignGuildMemberCharacter(
    guildId: string,
    memberId: string,
    payload: { name: string; class: CharacterClass; level?: number }
  ) {
    const response = await axios.post(`/api/guilds/${guildId}/members/${memberId}/characters`, {
      name: payload.name,
      class: payload.class,
      level: payload.level ?? 60
    });
    return response.data.character;
  },

  async deleteGuildMember(guildId: string, memberId: string) {
    await axios.delete(`/api/guilds/${guildId}/members/${memberId}`);
  },

  async applyToGuild(guildId: string) {
    const response = await axios.post(`/api/guilds/${guildId}/applications`);
    return response.data.application;
  },

  async withdrawGuildApplication(guildId: string) {
    await axios.delete(`/api/guilds/${guildId}/applications`);
  },

  async fetchGuildWebhooks(guildId: string): Promise<GuildDiscordWebhookListResponse> {
    const response = await axios.get(`/api/guilds/${guildId}/webhooks`);
    const payload = response.data ?? {};
    return {
      webhooks: Array.isArray(payload.webhooks)
        ? payload.webhooks.map(normalizeGuildWebhookSettings)
        : [],
      eventDefinitions: Array.isArray(payload.eventDefinitions) ? payload.eventDefinitions : [],
      defaultEventSubscriptions:
        payload.defaultEventSubscriptions && typeof payload.defaultEventSubscriptions === 'object'
          ? payload.defaultEventSubscriptions
          : {},
      defaultMentionSubscriptions:
        payload.defaultMentionSubscriptions && typeof payload.defaultMentionSubscriptions === 'object'
          ? payload.defaultMentionSubscriptions
          : {}
    };
  },

  async createGuildWebhook(guildId: string, payload: GuildDiscordWebhookInput) {
    const response = await axios.post(`/api/guilds/${guildId}/webhooks`, payload);
    return normalizeGuildWebhookSettings(response.data.webhook);
  },

  async updateGuildWebhook(
    guildId: string,
    webhookId: string,
    payload: GuildDiscordWebhookUpdateInput
  ) {
    const response = await axios.put(`/api/guilds/${guildId}/webhooks/${webhookId}`, payload);
    return normalizeGuildWebhookSettings(response.data.webhook);
  },

  async deleteGuildWebhook(guildId: string, webhookId: string) {
    await axios.delete(`/api/guilds/${guildId}/webhooks/${webhookId}`);
  },

  async fetchMyGuildApplication(): Promise<GuildApplicationSummary | null> {
    const response = await axios.get('/api/guilds/applications/me');
    return response.data.application ?? null;
  },

  async approveGuildApplication(guildId: string, applicationId: string) {
    await axios.post(`/api/guilds/${guildId}/applications/${applicationId}/approve`);
  },

  async denyGuildApplication(guildId: string, applicationId: string) {
    await axios.post(`/api/guilds/${guildId}/applications/${applicationId}/deny`);
  },

  async fetchAdminUsers(): Promise<AdminUserSummary[]> {
    const response = await axios.get('/api/admin/users');
    return Array.isArray(response.data.users) ? response.data.users : [];
  },

  async updateAdminUser(
    userId: string,
    payload: { admin?: boolean; displayName?: string; nickname?: string | null; email?: string }
  ): Promise<AdminUserSummary> {
    const response = await axios.patch(`/api/admin/users/${userId}`, payload);
    return response.data.user;
  },

  async deleteAdminUser(userId: string) {
    await axios.delete(`/api/admin/users/${userId}`);
  },

  async fetchAdminGuilds(): Promise<AdminGuildSummary[]> {
    const response = await axios.get('/api/admin/guilds');
    return Array.isArray(response.data.guilds) ? response.data.guilds : [];
  },

  async fetchAdminGuildDetail(guildId: string): Promise<AdminGuildDetail> {
    const response = await axios.get(`/api/admin/guilds/${guildId}`);
    return response.data.guild;
  },

  async updateAdminGuild(
    guildId: string,
    payload: { name?: string; description?: string | null }
  ): Promise<AdminGuildSummary> {
    const response = await axios.patch(`/api/admin/guilds/${guildId}`, payload);
    return response.data.guild;
  },

  async deleteAdminGuild(guildId: string) {
    await axios.delete(`/api/admin/guilds/${guildId}`);
  },

  async adminDetachCharacter(guildId: string, characterId: string) {
    await axios.delete(`/api/admin/guilds/${guildId}/characters/${characterId}`);
  },

  async addAdminGuildMember(
    guildId: string,
    payload: { userId: string; role: GuildRole }
  ): Promise<AdminGuildMemberSummary> {
    const response = await axios.post(`/api/admin/guilds/${guildId}/members`, payload);
    return response.data.membership;
  },

  async updateAdminGuildMemberRole(
    guildId: string,
    userId: string,
    payload: { role: GuildRole }
  ): Promise<AdminGuildMemberSummary> {
    const response = await axios.patch(
      `/api/admin/guilds/${guildId}/members/${userId}`,
      payload
    );
    return response.data.membership;
  },

  async fetchAdminRaids(): Promise<AdminRaidSummary[]> {
    const response = await axios.get('/api/admin/raids');
    return Array.isArray(response.data.raids) ? response.data.raids : [];
  },

  async fetchAdminRaid(raidId: string): Promise<AdminRaidDetail> {
    const response = await axios.get(`/api/admin/raids/${raidId}`);
    return response.data.raid;
  },

  async updateAdminRaid(
    raidId: string,
    payload: {
      name?: string;
      startTime?: string;
      startedAt?: string | null;
      endedAt?: string | null;
      targetZones?: string[];
      targetBosses?: string[];
      notes?: string | null;
      isActive?: boolean;
    }
  ): Promise<AdminRaidDetail> {
    const response = await axios.patch(`/api/admin/raids/${raidId}`, payload);
    return response.data.raid;
  },

  async deleteAdminRaid(raidId: string) {
    await axios.delete(`/api/admin/raids/${raidId}`);
  },

  async removeAdminGuildMember(guildId: string, userId: string) {
    await axios.delete(`/api/admin/guilds/${guildId}/members/${userId}`);
  },

  /**
   * Fetches detailed item stats for tooltip display.
   */
  async fetchItemStats(itemId: number): Promise<ItemStatsResponse> {
    const response = await axios.get(`/api/items/${itemId}/stats`);
    return response.data;
  },

  /**
   * Fetches stats for multiple items at once (batch request).
   */
  async fetchItemStatsBatch(itemIds: number[]): Promise<ItemStatsBatchResponse> {
    const response = await axios.post('/api/items/stats/batch', { itemIds });
    return response.data;
  },

  /**
   * Searches items by name and returns their IDs and icons.
   */
  async searchItemsByName(names: string[]): Promise<ItemNameSearchResponse> {
    const response = await axios.post('/api/items/search-by-name', { names });
    return response.data;
  },

  /**
   * Fetches quest assignment share details for short URL resolution.
   */
  async fetchQuestShareDetails(assignmentId: string): Promise<QuestShareDetails> {
    const response = await axios.get(`/api/quests/share/${assignmentId}`);
    return {
      assignmentId: response.data.assignmentId,
      guildId: response.data.guildId,
      blueprintId: response.data.blueprintId,
      characterName: response.data.characterName ?? null,
      characterClass: response.data.characterClass ?? null,
      blueprintTitle: response.data.blueprintTitle ?? 'Quest',
      status: response.data.status ?? 'IN_PROGRESS'
    };
  },

  /**
   * Fetches the current user's availability entries for a guild within a date range.
   */
  async fetchUserAvailability(
    guildId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ availability: CalendarAvailabilityEntry[] }> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    const url = `/api/availability/guild/${guildId}/me${query ? `?${query}` : ''}`;
    const response = await axios.get(url);
    return response.data;
  },

  /**
   * Fetches availability summary (counts) for a guild within a date range.
   */
  async fetchAvailabilitySummary(
    guildId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ summary: AvailabilitySummary[] }> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    const url = `/api/availability/guild/${guildId}/summary${query ? `?${query}` : ''}`;
    const response = await axios.get(url);
    return response.data;
  },

  /**
   * Updates the current user's availability entries for a guild.
   */
  async updateUserAvailability(
    guildId: string,
    updates: AvailabilityUpdate[]
  ): Promise<{ availability: CalendarAvailabilityEntry[] }> {
    const response = await axios.put(`/api/availability/guild/${guildId}/me`, { updates });
    return response.data;
  },

  /**
   * Deletes the current user's availability entries for specific dates.
   */
  async deleteUserAvailability(
    guildId: string,
    dates: string[]
  ): Promise<{ deleted: number }> {
    const response = await axios.delete(`/api/availability/guild/${guildId}/me`, {
      data: { dates }
    });
    return response.data;
  },

  /**
   * Fetches detailed availability (with user info) for a specific date.
   */
  async fetchAvailabilityDetails(
    guildId: string,
    date: string
  ): Promise<{ details: AvailabilityUserDetail[] }> {
    const response = await axios.get(`/api/availability/guild/${guildId}/details?date=${encodeURIComponent(date)}`);
    return response.data;
  },

  // Loot Management APIs

  /**
   * Fetches summary counts for all loot management tables.
   */
  async fetchLootManagementSummary(): Promise<LootManagementSummary> {
    const response = await axios.get('/api/admin/loot-management/summary');
    return response.data.summary;
  },

  /**
   * Fetches paginated loot master data.
   */
  async fetchLootMaster(
    page: number = 1,
    pageSize: number = 25,
    search?: string
  ): Promise<PaginatedLootResult<LootMasterEntry>> {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (search) params.append('search', search);
    const response = await axios.get(`/api/admin/loot-management/loot-master?${params.toString()}`);
    return response.data;
  },

  /**
   * Fetches paginated LC items data.
   */
  async fetchLcItems(
    page: number = 1,
    pageSize: number = 25,
    search?: string
  ): Promise<PaginatedLootResult<LcItemEntry>> {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (search) params.append('search', search);
    const response = await axios.get(`/api/admin/loot-management/lc-items?${params.toString()}`);
    return response.data;
  },

  /**
   * Fetches paginated LC requests data.
   */
  async fetchLcRequests(
    page: number = 1,
    pageSize: number = 25,
    search?: string
  ): Promise<PaginatedLootResult<LcRequestEntry>> {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (search) params.append('search', search);
    const response = await axios.get(`/api/admin/loot-management/lc-requests?${params.toString()}`);
    return response.data;
  },

  /**
   * Fetches paginated LC votes data.
   */
  async fetchLcVotes(
    page: number = 1,
    pageSize: number = 25,
    search?: string
  ): Promise<PaginatedLootResult<LcVoteEntry>> {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (search) params.append('search', search);
    const response = await axios.get(`/api/admin/loot-management/lc-votes?${params.toString()}`);
    return response.data;
  },

  // Guild Donations

  async fetchGuildDonations(guildId: string, page = 1, limit = 25): Promise<PaginatedDonationsResponse> {
    const response = await axios.get(`/api/guilds/${guildId}/donations`, {
      params: { page, limit }
    });
    return {
      donations: response.data.donations ?? [],
      total: response.data.total ?? 0,
      page: response.data.page ?? page,
      limit: response.data.limit ?? limit,
      totalPages: response.data.totalPages ?? 0
    };
  },

  async fetchGuildDonationCounts(guildId: string): Promise<DonationCounts> {
    const response = await axios.get(`/api/guilds/${guildId}/donations/count`);
    return {
      pending: response.data.pending ?? 0,
      total: response.data.total ?? 0
    };
  },

  async rejectGuildDonation(guildId: string, donationId: string): Promise<GuildDonation> {
    const response = await axios.patch(`/api/guilds/${guildId}/donations/${donationId}/reject`);
    return response.data.donation;
  },

  async rejectAllGuildDonations(guildId: string): Promise<number> {
    const response = await axios.patch(`/api/guilds/${guildId}/donations/reject-all`);
    return response.data.rejected ?? 0;
  },

  async deleteGuildDonation(guildId: string, donationId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/donations/${donationId}`);
  },

  // NPC Respawn Tracker

  async fetchNpcRespawnTracker(guildId: string): Promise<{
    npcs: NpcRespawnTrackerEntry[];
    canManage: boolean;
    viewerRole: GuildRole | null;
  }> {
    const response = await axios.get(`/api/guilds/${guildId}/npc-respawn`);
    return {
      npcs: response.data.npcs ?? [],
      canManage: response.data.canManage ?? false,
      viewerRole: response.data.viewerRole ?? null
    };
  },

  async fetchNpcDefinitions(guildId: string): Promise<{
    definitions: NpcDefinition[];
    enabledContentFlags: NpcContentFlag[];
    canManage: boolean;
    viewerRole: GuildRole | null;
  }> {
    const response = await axios.get(`/api/guilds/${guildId}/npc-definitions`);
    return {
      definitions: response.data.definitions ?? [],
      enabledContentFlags: response.data.enabledContentFlags ?? [],
      canManage: response.data.canManage ?? false,
      viewerRole: response.data.viewerRole ?? null
    };
  },

  async fetchNpcDefinition(guildId: string, npcDefinitionId: string): Promise<NpcDefinition> {
    const response = await axios.get(`/api/guilds/${guildId}/npc-definitions/${npcDefinitionId}`);
    return response.data.definition;
  },

  async createNpcDefinition(guildId: string, input: NpcDefinitionInput): Promise<NpcDefinition> {
    const response = await axios.post(`/api/guilds/${guildId}/npc-definitions`, input);
    return response.data.definition;
  },

  async updateNpcDefinition(
    guildId: string,
    npcDefinitionId: string,
    input: NpcDefinitionInput
  ): Promise<NpcDefinition> {
    const response = await axios.put(
      `/api/guilds/${guildId}/npc-definitions/${npcDefinitionId}`,
      input
    );
    return response.data.definition;
  },

  async deleteNpcDefinition(guildId: string, npcDefinitionId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/npc-definitions/${npcDefinitionId}`);
  },

  async fetchNpcKillRecords(
    guildId: string,
    options?: { npcDefinitionId?: string; limit?: number }
  ): Promise<NpcKillRecord[]> {
    const params = new URLSearchParams();
    if (options?.npcDefinitionId) {
      params.append('npcDefinitionId', options.npcDefinitionId);
    }
    if (options?.limit) {
      params.append('limit', String(options.limit));
    }
    const response = await axios.get(
      `/api/guilds/${guildId}/npc-kills${params.toString() ? '?' + params.toString() : ''}`
    );
    return response.data.records ?? [];
  },

  async createNpcKillRecord(guildId: string, input: NpcKillRecordInput): Promise<NpcKillRecord> {
    const response = await axios.post(`/api/guilds/${guildId}/npc-kills`, input);
    return response.data.record;
  },

  async deleteNpcKillRecord(guildId: string, killRecordId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/npc-kills/${killRecordId}`);
  },

  async fetchNpcSubscriptions(guildId: string): Promise<NpcRespawnSubscription[]> {
    const response = await axios.get(`/api/guilds/${guildId}/npc-subscriptions`);
    return response.data.subscriptions ?? [];
  },

  async upsertNpcSubscription(
    guildId: string,
    input: NpcSubscriptionInput
  ): Promise<NpcRespawnSubscription> {
    const response = await axios.post(`/api/guilds/${guildId}/npc-subscriptions`, input);
    return response.data.subscription;
  },

  async deleteNpcSubscription(guildId: string, npcDefinitionId: string): Promise<void> {
    await axios.delete(`/api/guilds/${guildId}/npc-subscriptions/${npcDefinitionId}`);
  },

  async searchDiscoveredItems(
    guildId: string,
    query?: string,
    limit?: number
  ): Promise<DiscoveredItem[]> {
    const params = new URLSearchParams();
    if (query) {
      params.append('q', query);
    }
    if (limit) {
      params.append('limit', String(limit));
    }
    const response = await axios.get(
      `/api/guilds/${guildId}/discovered-items${params.toString() ? '?' + params.toString() : ''}`
    );
    return response.data.items ?? [];
  }

};
