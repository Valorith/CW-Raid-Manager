import type { CharacterClass, GuildDiscordWebhook, Prisma } from '@prisma/client';

import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

const clientBaseUrl = resolveClientBaseUrl();

export const DISCORD_WEBHOOK_EVENT_KEYS = [
  'raid.created',
  'raid.started',
  'raid.ended',
  'raid.targetKilled',
  'raid.deleted',
  'raid.signup',
  'raid.signup.not_attending',
  'raid.withdraw',
  'loot.assigned',
  'attendance.logged',
  'attendance.updated',
  'application.submitted',
  'application.approved',
  'application.denied',
  'bank.requested'
] as const;

export type DiscordWebhookEvent = (typeof DISCORD_WEBHOOK_EVENT_KEYS)[number];

export type DiscordWebhookEventCategory = 'RAID' | 'ATTENDANCE' | 'APPLICATION' | 'BANK';

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
    key: 'raid.targetKilled',
    label: 'Raid Target Killed',
    description: 'Triggered when a tracked raid target boss is killed.',
    category: 'RAID'
  },
  {
    key: 'raid.deleted',
    label: 'Raid Deleted',
    description: 'Broadcast when a scheduled raid is removed.',
    category: 'RAID'
  },
  {
    key: 'raid.signup',
    label: 'Raid Signup',
    description: 'Announces when a character signs up for a raid.',
    category: 'RAID'
  },
  {
    key: 'raid.signup.not_attending',
    label: 'Raid Not Attending',
    description: 'Announces when a character marks themselves as not attending a raid.',
    category: 'RAID'
  },
  {
    key: 'raid.withdraw',
    label: 'Raid Withdrawal',
    description: 'Notifies the guild when a character withdraws from a raid signup.',
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
  },
  {
    key: 'bank.requested',
    label: 'Guild Bank Request',
    description: 'Triggered when a guild member requests items from the guild bank.',
    category: 'BANK'
  }
];

export const DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS: Record<DiscordWebhookEvent, boolean> = Object.freeze({
  'raid.created': true,
  'raid.started': true,
  'raid.ended': true,
  'raid.targetKilled': true,
  'raid.deleted': false,
  'raid.signup': true,
  'raid.signup.not_attending': true,
  'raid.withdraw': true,
  'loot.assigned': true,
  'attendance.logged': true,
  'attendance.updated': true,
  'application.submitted': false,
  'application.approved': true,
  'application.denied': true,
  'bank.requested': false
});

export const DEFAULT_MENTION_SUBSCRIPTIONS: Record<DiscordWebhookEvent, boolean> = Object.freeze({
  'raid.created': true,
  'raid.started': true,
  'raid.ended': true,
  'raid.targetKilled': true,
  'raid.deleted': false,
  'raid.signup': false,
  'raid.signup.not_attending': false,
  'raid.withdraw': false,
  'loot.assigned': false,
  'attendance.logged': false,
  'attendance.updated': false,
  'application.submitted': false,
  'application.approved': false,
  'application.denied': false,
  'bank.requested': false
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

export async function isDiscordWebhookEventEnabled(
  guildId: string,
  event: DiscordWebhookEvent
): Promise<boolean> {
  if (!guildId) {
    return false;
  }

  const records = await prisma.guildDiscordWebhook.findMany({
    where: {
      guildId,
      isEnabled: true,
      webhookUrl: {
        not: null
      }
    },
    select: {
      eventSubscriptions: true
    }
  });

  if (records.length === 0) {
    return false;
  }

  return records.some((record) => {
    const subscriptions = normalizeEventSubscriptions(record.eventSubscriptions);
    return subscriptions[event] === true;
  });
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
    startedAt?: Date | string | null;
    attendeeCount?: number | null;
    lootCount?: number | null;
  };
  'raid.deleted': {
    guildName: string;
    raidId: string;
    raidName: string;
  };
  'raid.targetKilled': {
    guildName: string;
    raidId: string;
    raidName: string;
    kills: Array<{
      npcName: string;
      killerName?: string | null;
      occurredAt: Date | string;
    }>;
  };
  'raid.signup': {
    guildId: string;
    guildName: string;
    raidId: string;
    raidName: string;
    entries: Array<{
      characterName: string;
      characterClass: CharacterClass;
      characterClassLabel: string;
    }>;
    userDisplayName: string;
    signedAt: Date | string;
    raidStartTime: Date | string | null;
  };
  'raid.signup.not_attending': {
    guildId: string;
    guildName: string;
    raidId: string;
    raidName: string;
    entries: Array<{
      characterName: string;
      characterClass: CharacterClass;
      characterClassLabel: string;
    }>;
    userDisplayName: string;
    signedAt: Date | string;
    raidStartTime: Date | string | null;
  };
  'raid.withdraw': {
    guildId: string;
    guildName: string;
    raidId: string;
    raidName: string;
    characterName: string;
    characterClass: CharacterClass;
    characterClassLabel: string;
    userDisplayName: string;
    withdrawnAt: Date | string;
  };
  'loot.assigned': {
    guildName: string;
    raidId: string;
    raidName: string;
    assignments: Array<{
      itemName: string;
      looterName: string;
      emoji?: string | null;
      itemIconId?: number | null;
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
    guildId: string;
    guildName: string;
    applicantName: string;
    submittedAt: Date | string;
  };
  'application.approved': {
    guildId: string;
    guildName: string;
    applicantName: string;
    actorName: string;
    resolvedAt: Date | string;
  };
  'application.denied': {
    guildId: string;
    guildName: string;
    applicantName: string;
    actorName: string;
    resolvedAt: Date | string;
  };
  'bank.requested': {
    guildId: string;
    guildName: string;
    requestedByName: string;
    items: Array<{
      itemId: number | null;
      itemName: string;
      itemIconId: number | null;
      quantity: number;
      sources: Array<{ characterName: string; location: string; quantity: number }>;
    }>;
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
      const raidStartedLootUrl = buildRaidLootUrl(raidStartedPayload.raidId);
      const raidStartedLinks = [
        raidStartedUrl ? `[View Raid](${raidStartedUrl})` : null,
        raidStartedLootUrl ? `[View Loot](${raidStartedLootUrl})` : null
      ]
        .filter(Boolean)
        .join(' • ');
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
              ...(raidStartedLinks
                ? [
                    {
                      name: 'Links',
                      value: raidStartedLinks,
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
      const raidDuration = raidEndedPayload.startedAt
        ? formatDuration(raidEndedPayload.startedAt, raidEndedPayload.endedAt)
        : null;
      const summaryParts = [
        raidDuration ? `Duration: ${raidDuration}` : null,
        typeof raidEndedPayload.attendeeCount === 'number'
          ? `Attendees: ${raidEndedPayload.attendeeCount}`
          : null,
        typeof raidEndedPayload.lootCount === 'number'
          ? `Loot Items: ${raidEndedPayload.lootCount}`
          : null
      ].filter(Boolean);
      const raidSummary = summaryParts.length ? summaryParts.join(' • ') : 'Raid was marked as complete.';
      return {
        embeds: [
          {
            title: `🔴 Raid Completed: ${raidEndedPayload.raidName}`,
            description: raidSummary,
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
    case 'raid.targetKilled':
      const raidTargetPayload = payload as DiscordWebhookPayloadMap['raid.targetKilled'];
      if (!Array.isArray(raidTargetPayload.kills) || raidTargetPayload.kills.length === 0) {
        return null;
      }
      const raidTargetUrl = buildRaidUrl(raidTargetPayload.raidId);
      const killLines = raidTargetPayload.kills.slice(0, 10).map((kill) => {
        return `• **${kill.npcName}** — ${formatDiscordTimestamp(kill.occurredAt)}`;
      });
      if (raidTargetPayload.kills.length > 10) {
        const remaining = raidTargetPayload.kills.length - 10;
        killLines.push(`…and ${remaining} more target${remaining === 1 ? '' : 's'}.`);
      }
      if (raidTargetUrl) {
        killLines.push(`[View Raid](${raidTargetUrl})`);
      }
      return {
        embeds: [
          {
            title: `🎯 Raid Target Killed: ${raidTargetPayload.raidName}`,
            color: DISCORD_COLORS.success,
            fields: [
              {
                name: 'Targets',
                value: killLines.join('\n')
              }
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
    case 'raid.signup':
      const raidSignupPayload = payload as DiscordWebhookPayloadMap['raid.signup'];
      const raidSignupUrl = buildRaidUrl(raidSignupPayload.raidId);
      const signupEntries = raidSignupPayload.entries ?? [];
      if (signupEntries.length === 0) {
        return null;
      }
      if (signupEntries.length === 1) {
        const entry = signupEntries[0];
        return {
          embeds: [
            {
              title: `✅ ${entry.characterName} (${entry.characterClassLabel}) signed up`,
              description: formatRaidSignupDescription(
                raidSignupPayload.raidName,
                raidSignupPayload.userDisplayName,
                raidSignupUrl,
                raidSignupPayload.raidStartTime
              ),
              color: DISCORD_COLORS.success,
              footer: { text: raidSignupPayload.guildName },
              timestamp: new Date(raidSignupPayload.signedAt).toISOString()
            }
          ]
        };
      }

      return {
        embeds: [
          {
            title: `✅ ${raidSignupPayload.userDisplayName} signed up ${signupEntries.length} characters`,
            description: formatRaidSignupDescription(
              raidSignupPayload.raidName,
              raidSignupPayload.userDisplayName,
              raidSignupUrl,
              raidSignupPayload.raidStartTime
            ),
            color: DISCORD_COLORS.success,
            fields: [
              {
                name: 'Characters',
                value: signupEntries
                  .map((entry) => `• **${entry.characterName}** (${entry.characterClassLabel})`)
                  .join('\n')
              }
            ],
            footer: { text: raidSignupPayload.guildName },
            timestamp: new Date(raidSignupPayload.signedAt).toISOString()
          }
        ]
      };
    case 'raid.signup.not_attending':
      const notAttendingPayload = payload as DiscordWebhookPayloadMap['raid.signup.not_attending'];
      const notAttendingUrl = buildRaidUrl(notAttendingPayload.raidId);
      const notAttendingEntries = notAttendingPayload.entries ?? [];
      if (notAttendingEntries.length === 0) {
        return null;
      }
      if (notAttendingEntries.length === 1) {
        const entry = notAttendingEntries[0];
        return {
          embeds: [
            {
              title: `❌ ${entry.characterName} (${entry.characterClassLabel}) marked as not attending`,
              description: formatRaidSignupDescription(
                notAttendingPayload.raidName,
                notAttendingPayload.userDisplayName,
                notAttendingUrl,
                notAttendingPayload.raidStartTime
              ),
              color: DISCORD_COLORS.danger,
              footer: { text: notAttendingPayload.guildName },
              timestamp: new Date(notAttendingPayload.signedAt).toISOString()
            }
          ]
        };
      }

      return {
        embeds: [
          {
            title: `❌ ${notAttendingPayload.userDisplayName} marked ${notAttendingEntries.length} characters as not attending`,
            description: formatRaidSignupDescription(
              notAttendingPayload.raidName,
              notAttendingPayload.userDisplayName,
              notAttendingUrl,
              notAttendingPayload.raidStartTime
            ),
            color: DISCORD_COLORS.danger,
            fields: [
              {
                name: 'Characters',
                value: notAttendingEntries
                  .map((entry) => `• **${entry.characterName}** (${entry.characterClassLabel})`)
                  .join('\n')
              }
            ],
            footer: { text: notAttendingPayload.guildName },
            timestamp: new Date(notAttendingPayload.signedAt).toISOString()
          }
        ]
      };
    case 'raid.withdraw':
      const raidWithdrawPayload = payload as DiscordWebhookPayloadMap['raid.withdraw'];
      const raidWithdrawUrl = buildRaidUrl(raidWithdrawPayload.raidId);
      return {
        embeds: [
          {
            title: `⚠️ ${raidWithdrawPayload.characterName} (${raidWithdrawPayload.characterClassLabel}) withdrew`,
            description: formatRaidSignupDescription(
              raidWithdrawPayload.raidName,
              raidWithdrawPayload.userDisplayName,
              raidWithdrawUrl
            ),
            color: DISCORD_COLORS.warning,
            footer: { text: raidWithdrawPayload.guildName },
            timestamp: new Date(raidWithdrawPayload.withdrawnAt).toISOString()
          }
        ]
      };
    case 'loot.assigned':
      const lootAssignedPayload = payload as DiscordWebhookPayloadMap['loot.assigned'];
      if (!lootAssignedPayload.assignments || lootAssignedPayload.assignments.length === 0) {
        return null;
      }
      const lootAssignments = lootAssignedPayload.assignments.slice(0, 15);
      // Find the first assignment with an icon to use as embed thumbnail
      const firstIconId = lootAssignments.find((a) => a.itemIconId != null)?.itemIconId;
      const lootThumbnailUrl =
        firstIconId != null
          ? `${clientBaseUrl}/api/loot-icons/${firstIconId}?format=png`
          : null;
      const lootDescription = lootAssignments
        .map((assignment) => {
          const countLabel = assignment.count > 1 ? ` ×${assignment.count}` : '';
          const emoji = assignment.emoji ?? '🎁';
          const itemUrl = buildAllaItemUrl(assignment.itemName);
          const itemLabel = itemUrl
            ? `[**${assignment.itemName}**${countLabel}](${itemUrl})`
            : `**${assignment.itemName}**${countLabel}`;
          return `${emoji} ${itemLabel} → ${assignment.looterName}`;
        })
        .join('\n');
      const lootOverflow = Math.max(
        lootAssignedPayload.assignments.length - lootAssignments.length,
        0
      );
      const lootRaidUrl = buildRaidUrl(lootAssignedPayload.raidId);
      const metaLine = '';
      const linkLine = lootRaidUrl ? `\n[View Raid](${lootRaidUrl})` : '';
      const overflowLine =
        lootOverflow > 0
          ? `\n_${lootOverflow} additional assignment${lootOverflow === 1 ? '' : 's'} not shown_`
          : '';
      return {
        embeds: [
          {
            title: `📦 Loot Assigned — ${lootAssignedPayload.raidName}`,
            description: `${lootDescription}${metaLine}${linkLine}${overflowLine}`,
            color: DISCORD_COLORS.success,
            timestamp: nowIso,
            ...(lootThumbnailUrl && { thumbnail: { url: lootThumbnailUrl } })
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
      const applicantsUrl = buildGuildApplicantsUrl(submittedPayload.guildId);
      return {
        content: `📨 **${submittedPayload.applicantName}** has applied for membership to **${submittedPayload.guildName}**.`,
        embeds: [
          {
            title: 'Guild Application Submitted',
            description: `A new applicant is waiting for review.`,
            color: DISCORD_COLORS.primary,
            fields: [
              {
                name: 'Submitted',
                value: formatDiscordTimestamp(submittedPayload.submittedAt),
                inline: true
              },
              {
                name: 'Next Step',
                value: applicantsUrl
                  ? `[Review applicants](${applicantsUrl})`
                  : 'Open the guild page to review pending applicants.',
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
        content: `✅ **${approvedPayload.applicantName}** has been approved for membership to **${approvedPayload.guildName}** by ${approvedPayload.actorName}.`,
        embeds: [
          {
            title: 'Application Approved',
            description: `${approvedPayload.applicantName} is now a member of ${approvedPayload.guildName}.`,
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
        content: `⚠️ **${deniedPayload.applicantName}** was denied membership to **${deniedPayload.guildName}** by ${deniedPayload.actorName}.`,
        embeds: [
          {
            title: 'Application Denied',
            description: `${deniedPayload.applicantName}'s application to ${deniedPayload.guildName} was declined.`,
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
    case 'bank.requested':
      const bankRequestPayload = payload as DiscordWebhookPayloadMap['bank.requested'];
      if (!bankRequestPayload.items || bankRequestPayload.items.length === 0) {
        return null;
      }
      const entries = bankRequestPayload.items.slice(0, 15);
      const overflow = Math.max(bankRequestPayload.items.length - entries.length, 0);
      const fields = entries.map((item) => {
        const sourceLines =
          item.sources && item.sources.length
            ? item.sources
                .map(
                  (src) =>
                    `• ${src.characterName} ×${src.quantity}`
                )
                .join('\n')
            : '• Source unknown';
        const itemUrl = buildAllaItemUrl(item.itemName, item.itemId);
        const linkLine = itemUrl ? `[View on Allakhazam](${itemUrl})` : '';
        return {
          name: `${item.itemName} ×${item.quantity}`,
          value: linkLine ? `${linkLine}\n${sourceLines}` : sourceLines,
          inline: false
        };
      });
      if (overflow > 0) {
        fields.push({
          name: 'Additional items',
          value: `${overflow} more item${overflow === 1 ? '' : 's'} requested.`,
          inline: false
        });
      }
      return {
        embeds: [
          {
            title: `📦 Guild Bank Request — ${bankRequestPayload.requestedByName}`,
            description: `Items requested for **${bankRequestPayload.guildName}**:`,
            fields,
            color: DISCORD_COLORS.info,
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
  danger: 0xdc2626,
  info: 0x00b0f4
};

const ALLA_ITEM_SEARCH_BASE =
  'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';

function buildAllaItemUrl(itemName: string | null | undefined, itemId?: number | null) {
  // Prefer direct item ID lookup if available
  if (itemId != null) {
    return `https://alla.clumsysworld.com/?a=item&id=${Math.trunc(itemId)}`;
  }
  // Fall back to name search
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

function buildRaidLootUrl(raidId: string) {
  if (!clientBaseUrl) {
    return null;
  }
  return `${clientBaseUrl}/raids/${encodeURIComponent(raidId)}/loot`;
}

function buildGuildApplicantsUrl(guildId: string) {
  if (!clientBaseUrl) {
    return null;
  }
  return `${clientBaseUrl}/guilds/${encodeURIComponent(guildId)}?members=APPLICANT`;
}

function buildAttendanceEventUrl(raidId: string, attendanceEventId: string) {
  const raidUrl = buildRaidUrl(raidId);
  if (!raidUrl) {
    return null;
  }
  return `${raidUrl}?attendanceEventId=${encodeURIComponent(attendanceEventId)}`;
}

function formatRaidSignupDescription(
  raidName: string,
  userDisplayName: string,
  raidUrl: string | null,
  raidStartTime?: Date | string | null
) {
  const raidLabel = raidUrl ? `[${raidName}](${raidUrl})` : raidName;
  const lines = [`**Raid:** ${raidLabel}`, `**Player:** ${userDisplayName}`];
  if (raidStartTime) {
    lines.push(`**Start:** ${formatDiscordTimestamp(raidStartTime)}`);
  }
  return lines.join('\n');
}

function formatDuration(start?: Date | string | null, end?: Date | string | null) {
  if (!start || !end) {
    return null;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  const diffMs = Math.max(endDate.getTime() - startDate.getTime(), 0);
  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
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

function resolveClientBaseUrl(): string | null {
  const candidates = [
    appConfig.clientUrl,
    process.env.CLIENT_URL,
    process.env.PUBLIC_CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.WEB_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
    process.env.RENDER_EXTERNAL_URL,
    process.env.DEPLOYMENT_URL
  ];

  const normalizedCandidates = candidates
    .map((value) => normalizeBaseUrl(value))
    .filter((value): value is string => Boolean(value));

  const nonLocal = normalizedCandidates.find((value) => !isLocalHost(value));
  const resolved = (nonLocal ?? normalizedCandidates[0] ?? null);

  if (!resolved) {
    console.warn(
      'CLIENT_URL (or equivalent) is not configured; Discord webhooks will omit direct links. Set CLIENT_URL or PUBLIC_CLIENT_URL to your production site.'
    );
    return null;
  }

  if (isLocalHost(resolved)) {
    console.warn(
      `Resolved client URL "${resolved}" appears to be a localhost address. Configure CLIENT_URL to ensure webhook links point to your production site.`
    );
  }

  return resolved;
}

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isLocalHost(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('127.') ||
      hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}
