import type { GuildDiscordWebhook, Prisma } from '@prisma/client';

import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const clientBaseUrl = (appConfig.clientUrl ?? 'http://localhost:5173').replace(/\/$/, '');

export const DISCORD_WEBHOOK_EVENT_KEYS = [
  'raid.created',
  'raid.started',
  'raid.ended',
  'raid.deleted',
  'loot.assigned',
  'attendance.logged',
  'attendance.updated',
  'application.submitted',
  'application.approved',
  'application.denied'
] as const;

export type DiscordWebhookEvent = (typeof DISCORD_WEBHOOK_EVENT_KEYS)[number];

export type DiscordWebhookEventCategory = 'RAID' | 'ATTENDANCE' | 'APPLICATION';

export interface DiscordWebhookEventDefinition {
  key: DiscordWebhookEvent;
  label: string;
  description: string;
  category: DiscordWebhookEventCategory;
}

export const DISCORD_WEBHOOK_EVENT_DEFINITIONS: DiscordWebhookEventDefinition[] = [
  {
    key: 'raid.created',
    label: 'Raid Scheduled',
    description: 'Fires when a new raid is created for the guild.',
    category: 'RAID'
  },
  {
    key: 'raid.started',
    label: 'Raid Started or Restarted',
    description: 'Triggered when a raid is started or restarted.',
    category: 'RAID'
  },
  {
    key: 'raid.ended',
    label: 'Raid Ended',
    description: 'Sent when a raid is marked as completed.',
    category: 'RAID'
  },
  {
    key: 'raid.deleted',
    label: 'Raid Deleted',
    description: 'Broadcast when a scheduled raid is removed.',
    category: 'RAID'
  },
  {
    key: 'loot.assigned',
    label: 'Loot Assigned',
    description: 'Triggered whenever loot items are recorded for a raid.',
    category: 'RAID'
  },
  {
    key: 'attendance.logged',
    label: 'Attendance Event Logged',
    description: 'Captured whenever a new attendance snapshot or note is recorded.',
    category: 'ATTENDANCE'
  },
  {
    key: 'attendance.updated',
    label: 'Attendance Event Updated',
    description: 'Fires when an existing attendance snapshot is overwritten.',
    category: 'ATTENDANCE'
  },
  {
    key: 'application.submitted',
    label: 'Application Submitted',
    description: 'Notifies the guild when a new application is submitted.',
    category: 'APPLICATION'
  },
  {
    key: 'application.approved',
    label: 'Application Approved',
    description: 'Announces when an applicant is approved and promoted to member.',
    category: 'APPLICATION'
  },
  {
    key: 'application.denied',
    label: 'Application Denied',
    description: 'Sent when an application is denied or withdrawn by staff.',
    category: 'APPLICATION'
  }
];

export const DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS: Record<DiscordWebhookEvent, boolean> = Object.freeze({
  'raid.created': true,
  'raid.started': true,
  'raid.ended': true,
  'raid.deleted': false,
  'loot.assigned': true,
  'attendance.logged': true,
  'attendance.updated': true,
  'application.submitted': false,
  'application.approved': true,
  'application.denied': true
});

export const DEFAULT_MENTION_SUBSCRIPTIONS: Record<DiscordWebhookEvent, boolean> = Object.freeze({
  'raid.created': true,
  'raid.started': true,
  'raid.ended': true,
  'raid.deleted': false,
  'loot.assigned': false,
  'attendance.logged': false,
  'attendance.updated': false,
  'application.submitted': false,
  'application.approved': false,
  'application.denied': false
});

export interface GuildDiscordWebhookSettings {
  id: string;
  guildId: string;
  label: string;
  webhookUrl: string | null;
  isEnabled: boolean;
  usernameOverride: string | null;
  avatarUrl: string | null;
  mentionRoleId: string | null;
  eventSubscriptions: Record<DiscordWebhookEvent, boolean>;
  mentionSubscriptions: Record<DiscordWebhookEvent, boolean>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface UpdateDiscordWebhookSettingsInput {
  label?: string;
  webhookUrl?: string | null;
  isEnabled?: boolean;
  usernameOverride?: string | null;
  avatarUrl?: string | null;
  mentionRoleId?: string | null;
  eventSubscriptions?: Partial<Record<DiscordWebhookEvent, boolean>>;
  mentionSubscriptions?: Partial<Record<DiscordWebhookEvent, boolean>>;
}

export interface CreateDiscordWebhookInput extends UpdateDiscordWebhookSettingsInput {
  label: string;
}

export async function listGuildDiscordWebhooks(
  guildId: string
): Promise<GuildDiscordWebhookSettings[]> {
  const records = await prisma.guildDiscordWebhook.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' }
  });

  return records.map((record) => normalizeWebhook(record));
}

export async function createGuildDiscordWebhook(
  guildId: string,
  input: CreateDiscordWebhookInput
): Promise<GuildDiscordWebhookSettings> {
  const eventSubscriptions = input.eventSubscriptions
    ? prepareEventSubscriptions(input.eventSubscriptions)
    : cloneDefaultSubscriptions();
  const mentionSubscriptions = input.mentionSubscriptions
    ? prepareMentionSubscriptions(input.mentionSubscriptions)
    : cloneDefaultMentionSubscriptions();

  const normalizedWebhookUrl = cleanNullableString(input.webhookUrl);
  const isEnabled = input.isEnabled ?? false;
  if (isEnabled && !normalizedWebhookUrl) {
    throw new Error('Webhook URL is required when enabling Discord notifications.');
  }

  const record = await prisma.guildDiscordWebhook.create({
    data: {
      guildId,
      label: sanitizeLabel(input.label),
      webhookUrl: normalizedWebhookUrl,
      isEnabled,
      usernameOverride: cleanNullableString(input.usernameOverride),
      avatarUrl: cleanNullableString(input.avatarUrl),
      mentionRoleId: sanitizeMentionRole(input.mentionRoleId),
      eventSubscriptions: eventSubscriptions as Prisma.JsonObject,
      mentionSubscriptions: mentionSubscriptions as Prisma.JsonObject
    }
  });

  return normalizeWebhook(record);
}

export async function updateGuildDiscordWebhook(
  webhookId: string,
  guildId: string,
  input: UpdateDiscordWebhookSettingsInput
): Promise<GuildDiscordWebhookSettings> {
  const existing = await prisma.guildDiscordWebhook.findUnique({
    where: { id: webhookId }
  });

  if (!existing || existing.guildId !== guildId) {
    throw new Error('Webhook not found.');
  }

  const eventSubscriptions = input.eventSubscriptions
    ? prepareEventSubscriptions(input.eventSubscriptions)
    : undefined;
  const mentionSubscriptions = input.mentionSubscriptions
    ? prepareMentionSubscriptions(input.mentionSubscriptions)
    : undefined;

  const normalizedWebhookUrl =
    input.webhookUrl === undefined ? undefined : cleanNullableString(input.webhookUrl);
  const resolvedWebhookUrl =
    normalizedWebhookUrl === undefined ? existing.webhookUrl : normalizedWebhookUrl;
  const resolvedIsEnabled = input.isEnabled ?? existing.isEnabled;

  if (resolvedIsEnabled && !resolvedWebhookUrl) {
    throw new Error('Webhook URL is required when enabling Discord notifications.');
  }

  const record = await prisma.guildDiscordWebhook.update({
    where: { id: webhookId },
    data: {
      label: input.label !== undefined ? sanitizeLabel(input.label) : undefined,
      webhookUrl: normalizedWebhookUrl,
      isEnabled: input.isEnabled ?? undefined,
      usernameOverride:
        input.usernameOverride === undefined ? undefined : cleanNullableString(input.usernameOverride),
      avatarUrl:
        input.avatarUrl === undefined ? undefined : cleanNullableString(input.avatarUrl),
      mentionRoleId:
        input.mentionRoleId === undefined ? undefined : sanitizeMentionRole(input.mentionRoleId),
      eventSubscriptions: eventSubscriptions as Prisma.JsonObject | undefined,
      mentionSubscriptions: mentionSubscriptions as Prisma.JsonObject | undefined
    }
  });

  return normalizeWebhook(record);
}

export async function deleteGuildDiscordWebhook(webhookId: string, guildId: string): Promise<void> {
  const existing = await prisma.guildDiscordWebhook.findUnique({
    where: { id: webhookId }
  });

  if (!existing || existing.guildId !== guildId) {
    throw new Error('Webhook not found.');
  }

  await prisma.guildDiscordWebhook.delete({ where: { id: webhookId } });
}

type DiscordWebhookPayloadMap = {
  'raid.created': {
    guildName: string;
    raidId: string;
    raidName: string;
    startTime: Date | string;
    targetZones: string[];
    targetBosses: string[];
    createdByName?: string | null;
  };
  'raid.started': {
    guildName: string;
    raidId: string;
    raidName: string;
    startedAt: Date | string;
  };
  'raid.ended': {
    guildName: string;
    raidId: string;
    raidName: string;
    endedAt: Date | string;
  };
  'raid.deleted': {
    guildName: string;
    raidId: string;
    raidName: string;
  };
  'loot.assigned': {
    guildName: string;
    raidId: string;
    raidName: string;
    assignments: Array<{
      itemName: string;
      looterName: string;
      emoji?: string | null;
      count: number;
    }>;
    recordedAt: Date | string;
    recordedByName?: string | null;
  };
  'attendance.logged': {
    guildName: string;
    raidId: string;
    raidName: string;
    attendanceEventId: string;
    eventType?: string | null;
    note?: string | null;
    createdAt: Date | string;
    characters: string[];
  };
  'attendance.updated': {
    guildName: string;
    raidId: string;
    raidName: string;
    attendanceEventId: string;
    updatedAt: Date | string;
    characters: string[];
  };
  'application.submitted': {
    guildName: string;
    applicantName: string;
    submittedAt: Date | string;
  };
  'application.approved': {
    guildName: string;
    applicantName: string;
    actorName: string;
    resolvedAt: Date | string;
  };
  'application.denied': {
    guildName: string;
    applicantName: string;
    actorName: string;
    resolvedAt: Date | string;
  };
};

export async function emitDiscordWebhookEvent<K extends DiscordWebhookEvent>(
  guildId: string,
  event: K,
  payload: DiscordWebhookPayloadMap[K]
): Promise<void> {
  try {
    const records = await prisma.guildDiscordWebhook.findMany({
      where: {
        guildId,
        isEnabled: true,
        webhookUrl: {
          not: null
        }
      }
    });

    if (records.length === 0) {
      return;
    }

    const message = buildWebhookMessage(event, payload);
    if (!message) {
      return;
    }

    const deliveries = records.map(async (record) => {
      const settings = normalizeWebhook(record);
      if (!settings.webhookUrl || !settings.eventSubscriptions[event]) {
        return;
      }

      const mentionData = buildMentionPayload(settings, event);
      const body: DiscordWebhookBody = {
        ...message,
        ...(mentionData?.content ? { content: mentionData.content } : {}),
        ...(settings.usernameOverride ? { username: settings.usernameOverride } : {}),
        ...(settings.avatarUrl ? { avatar_url: settings.avatarUrl } : {}),
        allowed_mentions: mentionData?.allowedMentions ?? { parse: [] }
      };

      await sendDiscordWebhook(settings.webhookUrl, body);
    });

    await Promise.allSettled(deliveries);
  } catch (error) {
    console.warn('Failed to emit Discord webhook event.', { guildId, event, error });
  }
}

interface DiscordWebhookBody {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
  username?: string;
  avatar_url?: string;
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
  };
}

function buildWebhookMessage<K extends DiscordWebhookEvent>(
  event: K,
  payload: DiscordWebhookPayloadMap[K]
): DiscordWebhookBody | null {
  const nowIso = new Date().toISOString();
  switch (event) {
    case 'raid.created':
      const raidCreatedPayload = payload as DiscordWebhookPayloadMap['raid.created'];
      const raidCreatedUrl = buildRaidUrl(raidCreatedPayload.raidId);
      return {
        embeds: [
          {
            title: `⚔️ Raid Scheduled: ${raidCreatedPayload.raidName}`,
            description: `A new raid has been scheduled for **${raidCreatedPayload.guildName}**.`,
            color: DISCORD_COLORS.primary,
            fields: [
              {
                name: 'Start Time',
                value: formatDiscordTimestamp(raidCreatedPayload.startTime),
                inline: true
              },
              {
                name: 'Target Zones',
                value: formatList(raidCreatedPayload.targetZones),
                inline: true
              },
              {
                name: 'Target Bosses',
                value: formatList(raidCreatedPayload.targetBosses),
                inline: true
              },
              ...(raidCreatedUrl
                ? [
                    {
                      name: 'Links',
                      value: `[View Raid](${raidCreatedUrl})`,
                      inline: false
                    }
                  ]
                : [])
            ],
            footer: raidCreatedPayload.createdByName
              ? { text: `Planned by ${raidCreatedPayload.createdByName}` }
              : undefined,
            timestamp: nowIso
          }
        ]
      };
    case 'raid.started':
      const raidStartedPayload = payload as DiscordWebhookPayloadMap['raid.started'];
      const raidStartedUrl = buildRaidUrl(raidStartedPayload.raidId);
      return {
        embeds: [
          {
            title: `🟢 Raid Started: ${raidStartedPayload.raidName}`,
            description: 'Raid has been marked as in-progress.',
            color: DISCORD_COLORS.success,
            fields: [
              {
                name: 'Start Time',
                value: formatDiscordTimestamp(raidStartedPayload.startedAt),
                inline: true
              },
              ...(raidStartedUrl
                ? [
                    {
                      name: 'Links',
                      value: `[View Raid](${raidStartedUrl})`,
                      inline: false
                    }
                  ]
                : [])
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'raid.ended':
      const raidEndedPayload = payload as DiscordWebhookPayloadMap['raid.ended'];
      const raidEndedUrl = buildRaidUrl(raidEndedPayload.raidId);
      return {
        embeds: [
          {
            title: `🔴 Raid Completed: ${raidEndedPayload.raidName}`,
            description: 'Raid was marked as complete.',
            color: DISCORD_COLORS.info,
            fields: [
              {
                name: 'Completed',
                value: formatDiscordTimestamp(raidEndedPayload.endedAt),
                inline: true
              },
              ...(raidEndedUrl
                ? [
                    {
                      name: 'Links',
                      value: `[View Raid](${raidEndedUrl})`,
                      inline: false
                    }
                  ]
                : [])
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'raid.deleted':
      const raidDeletedPayload = payload as DiscordWebhookPayloadMap['raid.deleted'];
      return {
        embeds: [
          {
            title: `⚠️ Raid Removed: ${raidDeletedPayload.raidName}`,
            description: 'A scheduled raid was deleted by guild leadership.',
            color: DISCORD_COLORS.warning,
            timestamp: nowIso
          }
        ]
      };
    case 'loot.assigned':
      const lootAssignedPayload = payload as DiscordWebhookPayloadMap['loot.assigned'];
      if (!lootAssignedPayload.assignments || lootAssignedPayload.assignments.length === 0) {
        return null;
      }
      const lootAssignments = lootAssignedPayload.assignments.slice(0, 15);
      const lootDescription = lootAssignments
        .map((assignment) => {
          const countLabel = assignment.count > 1 ? ` ×${assignment.count}` : '';
          const emoji = assignment.emoji ?? '🎁';
          const itemUrl = buildAllaItemUrl(assignment.itemName);
          const itemLabel = itemUrl
            ? `[**${assignment.itemName}**${countLabel}](${itemUrl})`
            : `**${assignment.itemName}**${countLabel}`;
          return `${emoji} ${itemLabel}\n↳ ${assignment.looterName}`;
        })
        .join('\n');
      const lootOverflow = Math.max(
        lootAssignedPayload.assignments.length - lootAssignments.length,
        0
      );
      const lootRaidUrl = buildRaidUrl(lootAssignedPayload.raidId);
      return {
        embeds: [
          {
            title: `📦 Loot Assigned: ${lootAssignedPayload.raidName}`,
            description: lootDescription,
            color: DISCORD_COLORS.success,
            fields: [
              ...(lootAssignedPayload.recordedByName
                ? [
                    {
                      name: 'Recorded By',
                      value: lootAssignedPayload.recordedByName,
                      inline: true
                    }
                  ]
                : []),
              {
                name: 'Recorded At',
                value: formatDiscordTimestamp(lootAssignedPayload.recordedAt),
                inline: true
              },
              ...(lootRaidUrl
                ? [
                    {
                      name: 'Links',
                      value: `[View Raid](${lootRaidUrl})`,
                      inline: false
                    }
                  ]
                : [])
            ],
            footer:
              lootOverflow > 0
                ? {
                    text: `${lootOverflow} additional assignment${lootOverflow === 1 ? '' : 's'} not shown`
                  }
                : undefined,
            timestamp: nowIso
          }
        ]
      };
    case 'attendance.logged':
      const attendanceLoggedPayload = payload as DiscordWebhookPayloadMap['attendance.logged'];
      const attendanceRaidUrl = buildRaidUrl(attendanceLoggedPayload.raidId);
      const attendanceEventUrl = buildAttendanceEventUrl(
        attendanceLoggedPayload.raidId,
        attendanceLoggedPayload.attendanceEventId
      );
      const attendanceLinks = [
        attendanceRaidUrl ? `[View Raid](${attendanceRaidUrl})` : null,
        attendanceEventUrl ? `[View Attendance](${attendanceEventUrl})` : null
      ]
        .filter(Boolean)
        .join(' • ');
      return {
        embeds: [
          {
            title: `🧾 Attendance Logged: ${attendanceLoggedPayload.raidName}`,
            description: attendanceLoggedPayload.note
              ? attendanceLoggedPayload.note
              : 'A new attendance snapshot has been captured.',
            color: DISCORD_COLORS.primary,
            fields: [
              {
                name: 'Event Type',
                value: attendanceLoggedPayload.eventType ? attendanceLoggedPayload.eventType : 'LOG',
                inline: true
              },
              {
                name: 'Recorded At',
                value: formatDiscordTimestamp(attendanceLoggedPayload.createdAt),
                inline: true
              },
              ...buildAttendanceCharacterFields(attendanceLoggedPayload.characters),
              ...(attendanceLinks
                ? [
                    {
                      name: 'Links',
                      value: attendanceLinks,
                      inline: false
                    }
                  ]
                : [])
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'attendance.updated':
      const attendanceUpdatedPayload = payload as DiscordWebhookPayloadMap['attendance.updated'];
      const updatedRaidUrl = buildRaidUrl(attendanceUpdatedPayload.raidId);
      const updatedEventUrl = buildAttendanceEventUrl(
        attendanceUpdatedPayload.raidId,
        attendanceUpdatedPayload.attendanceEventId
      );
      const updatedLinks = [
        updatedRaidUrl ? `[View Raid](${updatedRaidUrl})` : null,
        updatedEventUrl ? `[View Attendance](${updatedEventUrl})` : null
      ]
        .filter(Boolean)
        .join(' • ');
      return {
        embeds: [
          {
            title: `♻️ Attendance Updated: ${attendanceUpdatedPayload.raidName}`,
            description: 'An attendance snapshot has been overwritten with new data.',
            color: DISCORD_COLORS.info,
            fields: [
              {
                name: 'Updated At',
                value: formatDiscordTimestamp(attendanceUpdatedPayload.updatedAt),
                inline: true
              },
              ...buildAttendanceCharacterFields(attendanceUpdatedPayload.characters),
              ...(updatedLinks
                ? [
                    {
                      name: 'Links',
                      value: updatedLinks,
                      inline: false
                    }
                  ]
                : [])
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'application.submitted':
      const submittedPayload = payload as DiscordWebhookPayloadMap['application.submitted'];
      return {
        content: `📨 New guild application received from **${submittedPayload.applicantName}**.`,
        embeds: [
          {
            description: `Review the application in the Raid Manager to respond.`,
            color: DISCORD_COLORS.primary,
            fields: [
              {
                name: 'Submitted',
                value: formatDiscordTimestamp(submittedPayload.submittedAt),
                inline: true
              }
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'application.approved':
      const approvedPayload = payload as DiscordWebhookPayloadMap['application.approved'];
      return {
        content: `✅ **${approvedPayload.applicantName}** has been approved by ${approvedPayload.actorName}.`,
        embeds: [
          {
            color: DISCORD_COLORS.success,
            fields: [
              {
                name: 'Approved',
                value: formatDiscordTimestamp(approvedPayload.resolvedAt),
                inline: true
              }
            ],
            timestamp: nowIso
          }
        ]
      };
    case 'application.denied':
      const deniedPayload = payload as DiscordWebhookPayloadMap['application.denied'];
      return {
        content: `❌ Application for **${deniedPayload.applicantName}** was denied by ${deniedPayload.actorName}.`,
        embeds: [
          {
            color: DISCORD_COLORS.warning,
            fields: [
              {
                name: 'Updated',
                value: formatDiscordTimestamp(deniedPayload.resolvedAt),
                inline: true
              }
            ],
            timestamp: nowIso
          }
        ]
      };
    default:
      return null;
  }
}

const DISCORD_COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xed4245,
  info: 0x00b0f4
};

const ALLA_ITEM_SEARCH_BASE =
  'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';

function buildAllaItemUrl(itemName: string | null | undefined) {
  if (!itemName) {
    return null;
  }
  const trimmed = itemName.trim();
  if (!trimmed) {
    return null;
  }
  return `${ALLA_ITEM_SEARCH_BASE}&iname=${encodeURIComponent(trimmed)}`;
}

function buildMentionPayload(settings: GuildDiscordWebhookSettings, event: DiscordWebhookEvent) {
  if (!settings.mentionRoleId || !shouldMentionRole(event) || !shouldMentionForEvent(settings, event)) {
    return undefined;
  }

  const normalized = normalizeMentionTarget(settings.mentionRoleId);
  if (!normalized) {
    return undefined;
  }

  const mentionText = formatMentionText(normalized);
  if (!mentionText) {
    return undefined;
  }

  return {
    content: mentionText,
    allowedMentions: buildAllowedMentions(normalized)
  };
}

function shouldMentionRole(_event: DiscordWebhookEvent) {
  return true;
}

function shouldMentionForEvent(settings: GuildDiscordWebhookSettings, event: DiscordWebhookEvent) {
  const map = settings.mentionSubscriptions ?? cloneDefaultMentionSubscriptions();
  return Boolean(map[event]);
}

function buildAllowedMentions(normalized: string) {
  if (normalized === 'everyone' || normalized === 'here') {
    return { parse: ['everyone'] as ('roles' | 'users' | 'everyone')[] };
  }

  if (/^[0-9]+$/.test(normalized)) {
    return { parse: [] as ('roles' | 'users' | 'everyone')[], roles: [normalized] };
  }

  return { parse: [] as ('roles' | 'users' | 'everyone')[] };
}

function normalizeMentionTarget(raw: string | null) {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(/^<@&([0-9]+)>$/);
  if (directMatch) {
    return directMatch[1];
  }

  const stripped = trimmed.replace(/^@+/, '');
  if (!stripped) {
    return null;
  }

  return stripped;
}

function formatMentionText(normalized: string | null) {
  if (!normalized) {
    return undefined;
  }

  if (/^everyone$/i.test(normalized) || /^here$/i.test(normalized)) {
    return `<@${normalized.toLowerCase()}>`;
  }

  if (/^[0-9]+$/.test(normalized)) {
    return `<@&${normalized}>`;
  }

  return `@${normalized}`;
}

function buildAttendanceCharacterFields(characters: string[] = []) {
  if (!characters || characters.length === 0) {
    return [
      {
        name: 'Characters',
        value: '—',
        inline: false
      }
    ];
  }

  const chunks = chunkLines(characters, 900);
  return chunks.map((chunk, index) => ({
    name: index === 0 ? 'Characters' : `Characters (cont. ${index + 1})`,
    value: chunk,
    inline: false
  }));
}

function chunkLines(lines: string[], maxLength: number) {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
      continue;
    }

    if (candidate.length > maxLength) {
      chunks.push(candidate.slice(0, maxLength));
      current = '';
      continue;
    }

    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildRaidUrl(raidId: string) {
  if (!clientBaseUrl) {
    return null;
  }
  return `${clientBaseUrl}/raids/${encodeURIComponent(raidId)}`;
}

function buildAttendanceEventUrl(raidId: string, attendanceEventId: string) {
  const raidUrl = buildRaidUrl(raidId);
  if (!raidUrl) {
    return null;
  }
  return `${raidUrl}?attendanceEventId=${encodeURIComponent(attendanceEventId)}`;
}

async function sendDiscordWebhook(url: string, payload: DiscordWebhookBody) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord responded with ${response.status}: ${errorText}`);
  }
}

function normalizeWebhook(record: GuildDiscordWebhook): GuildDiscordWebhookSettings {
  return {
    id: record.id,
    guildId: record.guildId,
    label: record.label,
    webhookUrl: record.webhookUrl ?? null,
    isEnabled: record.isEnabled,
    usernameOverride: record.usernameOverride ?? null,
    avatarUrl: record.avatarUrl ?? null,
    mentionRoleId: sanitizeMentionRole(record.mentionRoleId) ?? null,
    eventSubscriptions: normalizeEventSubscriptions(record.eventSubscriptions),
    mentionSubscriptions: normalizeMentionSubscriptions(record.mentionSubscriptions),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function normalizeEventSubscriptions(value: Prisma.JsonValue | null | undefined) {
  const normalized = cloneDefaultSubscriptions();
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return normalized;
  }

  for (const key of DISCORD_WEBHOOK_EVENT_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === 'boolean') {
      normalized[key] = raw;
    }
  }

  return normalized;
}

function normalizeMentionSubscriptions(value: Prisma.JsonValue | null | undefined) {
  const normalized = cloneDefaultMentionSubscriptions();
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return normalized;
  }

  for (const key of DISCORD_WEBHOOK_EVENT_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === 'boolean') {
      normalized[key] = raw;
    }
  }

  return normalized;
}

function prepareEventSubscriptions(
  overrides: Partial<Record<DiscordWebhookEvent, boolean>>
) {
  const prepared: Record<DiscordWebhookEvent, boolean> = cloneDefaultSubscriptions();
  for (const key of Object.keys(overrides) as DiscordWebhookEvent[]) {
    const value = overrides[key];
    if (typeof value === 'boolean') {
      prepared[key] = value;
    }
  }

  return prepared;
}

function prepareMentionSubscriptions(
  overrides: Partial<Record<DiscordWebhookEvent, boolean>>
) {
  const prepared: Record<DiscordWebhookEvent, boolean> = cloneDefaultMentionSubscriptions();
  for (const key of Object.keys(overrides) as DiscordWebhookEvent[]) {
    const value = overrides[key];
    if (typeof value === 'boolean') {
      prepared[key] = value;
    }
  }

  return prepared;
}

function cleanNullableString(value?: string | null) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeLabel(value?: string | null) {
  const fallback = 'Discord Webhook';
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : fallback;
}

function sanitizeMentionRole(value?: string | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const matchRole = trimmed.match(/^<@&([0-9]+)>$/);
  if (matchRole) {
    return matchRole[1];
  }

  const stripped = trimmed.replace(/^@+/, '');
  if (!stripped) {
    return null;
  }

  if (/^(everyone|here)$/i.test(stripped)) {
    return stripped.toLowerCase();
  }

  if (/^[0-9]+$/.test(stripped)) {
    return stripped;
  }

  return stripped;
}

function formatList(values: string[]) {
  if (!values || values.length === 0) {
    return '—';
  }
  return values.join(', ');
}

function formatDiscordTimestamp(value: Date | string | undefined | null) {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function cloneDefaultSubscriptions(): Record<DiscordWebhookEvent, boolean> {
  return { ...DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS };
}

function cloneDefaultMentionSubscriptions(): Record<DiscordWebhookEvent, boolean> {
  return { ...DEFAULT_MENTION_SUBSCRIPTIONS };
}
