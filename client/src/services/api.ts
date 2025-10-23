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
    return {
      raids: response.data.raids ?? [],
      permissions: response.data.permissions ?? { canManage: false, role: 'MEMBER' }
    };
  },

  async fetchRaid(raidId: string): Promise<RaidDetail> {
    const response = await axios.get(`/api/raids/${raidId}`);
    const raid = response.data.raid;
    return {
      ...raid,
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

};
