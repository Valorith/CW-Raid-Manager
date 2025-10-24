import axios, { AxiosResponse } from 'axios';

import type { AttendanceStatus, CharacterClass, GuildRole } from './types';

export interface GuildSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
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
  userRole?: GuildRole | null;
}

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
  isActive: boolean;
  permissions?: {
    canManage: boolean;
    role: GuildRole;
  };
  attendance?: Array<{
    id: string;
    createdAt: string;
    eventType?: 'LOG' | 'START' | 'END' | 'RESTART';
  }>;
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
  };
  createdBy: {
    id: string;
    displayName: string;
    nickname?: string | null;
  };
  attendance: AttendanceEventSummary[];
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

export interface AccountProfile {
  userId: string;
  email: string;
  displayName: string;
  nickname: string | null;
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

export interface AdminGuildDetail extends AdminGuildSummary {
  members: AdminGuildMemberSummary[];
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
    isActive: Boolean(raid?.isActive),
    permissions: raid?.permissions ?? undefined,
    attendance
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

  async fetchUserCharacters(): Promise<UserCharacter[]> {
    const response = await axios.get('/api/characters');
    return response.data.characters;
  },

  async createCharacter(payload: CharacterPayload) {
    const response = await axios.post('/api/characters', payload);
    return response.data.character;
  },

  async updateCharacter(
    characterId: string,
    payload: Partial<Pick<CharacterPayload, 'name' | 'level' | 'class' | 'archetype' | 'guildId' | 'isMain'>>
  ) {
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
    return {
      ...raid,
      ...normalizedSummary,
      attendance: Array.isArray(raid?.attendance)
        ? raid.attendance.map(normalizeAttendanceEvent)
        : []
    };
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
  }) {
    const response = await axios.post('/api/raids', payload);
    return response.data.raid;
  },

  async uploadRoster(
    raidEventId: string,
    file: File
  ): Promise<AxiosResponse<{ preview: unknown }>> {
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

  async fetchAttendance(raidEventId: string): Promise<AttendanceEventSummary[]> {
    const response = await axios.get(`/api/attendance/raid/${raidEventId}`);
    const events = response.data.attendanceEvents ?? [];
    return Array.isArray(events) ? events.map(normalizeAttendanceEvent) : [];
  },

  async fetchAccountProfile(): Promise<AccountProfile | null> {
    const response = await axios.get('/api/account/profile');
    return response.data.profile ?? null;
  },

  async updateAccountProfile(payload: { nickname?: string | null }): Promise<AccountProfile> {
    const response = await axios.patch('/api/account/profile', payload);
    return response.data.profile;
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

  async deleteRaid(raidId: string) {
    await axios.delete(`/api/raids/${raidId}`);
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

  async removeAdminGuildMember(guildId: string, userId: string) {
    await axios.delete(`/api/admin/guilds/${guildId}/members/${userId}`);
  }

};
