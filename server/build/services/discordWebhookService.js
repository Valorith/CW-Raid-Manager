import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';
const clientBaseUrl = (appConfig.clientUrl ?? 'http://localhost:5173').replace(/\/$/, '');
export const DISCORD_WEBHOOK_EVENT_KEYS = [
    'raid.created',
    'raid.started',
    'raid.ended',
    'raid.deleted',
    'attendance.logged',
    'attendance.updated',
    'application.submitted',
    'application.approved',
    'application.denied'
];
export const DISCORD_WEBHOOK_EVENT_DEFINITIONS = [
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
export const DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS = Object.freeze({
    'raid.created': true,
    'raid.started': true,
    'raid.ended': true,
    'raid.deleted': false,
    'attendance.logged': true,
    'attendance.updated': true,
    'application.submitted': false,
    'application.approved': true,
    'application.denied': true
});
export const DEFAULT_MENTION_SUBSCRIPTIONS = Object.freeze({
    'raid.created': true,
    'raid.started': true,
    'raid.ended': true,
    'raid.deleted': false,
    'attendance.logged': false,
    'attendance.updated': false,
    'application.submitted': false,
    'application.approved': false,
    'application.denied': false
});
export async function listGuildDiscordWebhooks(guildId) {
    const records = await prisma.guildDiscordWebhook.findMany({
        where: { guildId },
        orderBy: { createdAt: 'asc' }
    });
    return records.map((record) => normalizeWebhook(record));
}
export async function createGuildDiscordWebhook(guildId, input) {
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
            eventSubscriptions: eventSubscriptions,
            mentionSubscriptions: mentionSubscriptions
        }
    });
    return normalizeWebhook(record);
}
export async function updateGuildDiscordWebhook(webhookId, guildId, input) {
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
    const normalizedWebhookUrl = input.webhookUrl === undefined ? undefined : cleanNullableString(input.webhookUrl);
    const resolvedWebhookUrl = normalizedWebhookUrl === undefined ? existing.webhookUrl : normalizedWebhookUrl;
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
            usernameOverride: input.usernameOverride === undefined ? undefined : cleanNullableString(input.usernameOverride),
            avatarUrl: input.avatarUrl === undefined ? undefined : cleanNullableString(input.avatarUrl),
            mentionRoleId: input.mentionRoleId === undefined ? undefined : sanitizeMentionRole(input.mentionRoleId),
            eventSubscriptions: eventSubscriptions,
            mentionSubscriptions: mentionSubscriptions
        }
    });
    return normalizeWebhook(record);
}
export async function deleteGuildDiscordWebhook(webhookId, guildId) {
    const existing = await prisma.guildDiscordWebhook.findUnique({
        where: { id: webhookId }
    });
    if (!existing || existing.guildId !== guildId) {
        throw new Error('Webhook not found.');
    }
    await prisma.guildDiscordWebhook.delete({ where: { id: webhookId } });
}
export async function emitDiscordWebhookEvent(guildId, event, payload) {
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
            const body = {
                ...message,
                ...(mentionData?.content ? { content: mentionData.content } : {}),
                ...(settings.usernameOverride ? { username: settings.usernameOverride } : {}),
                ...(settings.avatarUrl ? { avatar_url: settings.avatarUrl } : {}),
                allowed_mentions: mentionData?.allowedMentions ?? { parse: [] }
            };
            await sendDiscordWebhook(settings.webhookUrl, body);
        });
        await Promise.allSettled(deliveries);
    }
    catch (error) {
        console.warn('Failed to emit Discord webhook event.', { guildId, event, error });
    }
}
function buildWebhookMessage(event, payload) {
    const nowIso = new Date().toISOString();
    switch (event) {
        case 'raid.created':
            const raidCreatedPayload = payload;
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
            const raidStartedPayload = payload;
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
            const raidEndedPayload = payload;
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
            const raidDeletedPayload = payload;
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
        case 'attendance.logged':
            const attendanceLoggedPayload = payload;
            const attendanceRaidUrl = buildRaidUrl(attendanceLoggedPayload.raidId);
            const attendanceEventUrl = buildAttendanceEventUrl(attendanceLoggedPayload.raidId, attendanceLoggedPayload.attendanceEventId);
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
            const attendanceUpdatedPayload = payload;
            const updatedRaidUrl = buildRaidUrl(attendanceUpdatedPayload.raidId);
            const updatedEventUrl = buildAttendanceEventUrl(attendanceUpdatedPayload.raidId, attendanceUpdatedPayload.attendanceEventId);
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
            const submittedPayload = payload;
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
            const approvedPayload = payload;
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
            const deniedPayload = payload;
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
function buildMentionPayload(settings, event) {
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
function shouldMentionRole(_event) {
    return true;
}
function shouldMentionForEvent(settings, event) {
    const map = settings.mentionSubscriptions ?? cloneDefaultMentionSubscriptions();
    return Boolean(map[event]);
}
function buildAllowedMentions(normalized) {
    if (normalized === 'everyone' || normalized === 'here') {
        return { parse: ['everyone'] };
    }
    if (/^[0-9]+$/.test(normalized)) {
        return { parse: [], roles: [normalized] };
    }
    return { parse: [] };
}
function normalizeMentionTarget(raw) {
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
function formatMentionText(normalized) {
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
function buildAttendanceCharacterFields(characters = []) {
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
function chunkLines(lines, maxLength) {
    const chunks = [];
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
function buildRaidUrl(raidId) {
    if (!clientBaseUrl) {
        return null;
    }
    return `${clientBaseUrl}/raids/${encodeURIComponent(raidId)}`;
}
function buildAttendanceEventUrl(raidId, attendanceEventId) {
    const raidUrl = buildRaidUrl(raidId);
    if (!raidUrl) {
        return null;
    }
    return `${raidUrl}?attendanceEventId=${encodeURIComponent(attendanceEventId)}`;
}
async function sendDiscordWebhook(url, payload) {
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
function normalizeWebhook(record) {
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
function normalizeEventSubscriptions(value) {
    const normalized = cloneDefaultSubscriptions();
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return normalized;
    }
    for (const key of DISCORD_WEBHOOK_EVENT_KEYS) {
        const raw = value[key];
        if (typeof raw === 'boolean') {
            normalized[key] = raw;
        }
    }
    return normalized;
}
function normalizeMentionSubscriptions(value) {
    const normalized = cloneDefaultMentionSubscriptions();
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return normalized;
    }
    for (const key of DISCORD_WEBHOOK_EVENT_KEYS) {
        const raw = value[key];
        if (typeof raw === 'boolean') {
            normalized[key] = raw;
        }
    }
    return normalized;
}
function prepareEventSubscriptions(overrides) {
    const prepared = cloneDefaultSubscriptions();
    for (const key of Object.keys(overrides)) {
        const value = overrides[key];
        if (typeof value === 'boolean') {
            prepared[key] = value;
        }
    }
    return prepared;
}
function prepareMentionSubscriptions(overrides) {
    const prepared = cloneDefaultMentionSubscriptions();
    for (const key of Object.keys(overrides)) {
        const value = overrides[key];
        if (typeof value === 'boolean') {
            prepared[key] = value;
        }
    }
    return prepared;
}
function cleanNullableString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function sanitizeLabel(value) {
    const fallback = 'Discord Webhook';
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 120) : fallback;
}
function sanitizeMentionRole(value) {
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
function formatList(values) {
    if (!values || values.length === 0) {
        return '—';
    }
    return values.join(', ');
}
function formatDiscordTimestamp(value) {
    if (!value) {
        return '—';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
function cloneDefaultSubscriptions() {
    return { ...DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS };
}
function cloneDefaultMentionSubscriptions() {
    return { ...DEFAULT_MENTION_SUBSCRIPTIONS };
}
