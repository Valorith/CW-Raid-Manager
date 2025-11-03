import axios, { AxiosResponse } from 'axios';
import { isMasterLooterName } from '../utils/lootNames';

import type {
  AttendanceEventType,
  AttendanceStatus,
  CharacterClass,
  DiscordWidgetTheme,
  GuildRole,
  LootListType
} from './types';

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

export interface GuildPermissions {
  canViewDetails: boolean;
  canManageMembers: boolean;
  canViewApplicants: boolean;
  canManageLootLists: boolean;
  userRole?: GuildRole | null;
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

export type DiscordWebhookEventCategory = 'RAID' | 'ATTENDANCE' | 'APPLICATION';

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

export interface GuildDiscordWebhookUpdateInput extends Partial<GuildDiscordWebhookInput> {}

export interface RaidEventSummary {
  id: string;
  guildId: string;
  name: string;
  startTime: string;
  startedAt?: string | null;
  endedAt?: string | null;
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

export interface RaidSignup {
  id: string;
  raidId: string;
  userId: string;
  characterId: string;
  characterName: string;
  characterClass: CharacterClass;
  characterLevel: number | null;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
  user: RaidSignupUser;
  character: RaidSignupCharacter;
}

export interface AttendanceEventSummary {
  id: string;
  createdAt: string;
  note?: string | null;
  eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
  records: AttendanceRecordSummary[];
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

  return {
    id: raid?.id ?? '',
    guildId: raid?.guildId ?? '',
    name: raid?.name ?? '',
    startTime: normalizeDateString(raid?.startTime),
    startedAt: normalizeNullableDate(raid?.startedAt),
    endedAt: normalizeNullableDate(raid?.endedAt),
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
    logMonitor,
    permissions: raid?.permissions ?? undefined,
    attendance,
    hasUnassignedLoot: Boolean(raid?.hasUnassignedLoot)
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
    return {
      ...raid,
      ...normalizedSummary,
      attendance: Array.isArray(raid?.attendance)
        ? raid.attendance.map(normalizeAttendanceEvent)
        : [],
      signups: normalizedSignups
    };
  },

  async updateRaidSignups(raidId: string, characterIds: string[]): Promise<RaidSignup[]> {
    const response = await axios.put(`/api/raids/${raidId}/signups/me`, {
      characterIds
    });
    return Array.isArray(response.data.signups)
      ? response.data.signups.map((signup: any) => normalizeRaidSignup(signup))
      : [];
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
  }

};
