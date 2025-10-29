import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';
const clientBaseUrl = (appConfig.clientUrl ?? 'http://localhost:5173').replace(/\/$/, '');
export const DISCORD_WEBHOOK_EVENT_KEYS = [
    'raid.created',
    'raid.started',
    'raid.ended',
    'raid.deleted',
    'raid.signup',
    'raid.withdraw',
    'loot.assigned',
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
        key: 'raid.signup',
        label: 'Raid Signup',
        description: 'Announces when a character signs up for a raid.',
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
    }
];
export const DEFAULT_DISCORD_EVENT_SUBSCRIPTIONS = Object.freeze({
    'raid.created': true,
    'raid.started': true,
    'raid.ended': true,
    'raid.deleted': false,
    'raid.signup': true,
    'raid.withdraw': true,
    'loot.assigned': true,
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
    'raid.signup': false,
    'raid.withdraw': false,
    'loot.assigned': false,
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
        case 'raid.signup':
            const raidSignupPayload = payload;
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
                            description: formatRaidSignupDescription(raidSignupPayload.raidName, raidSignupPayload.userDisplayName, raidSignupUrl, raidSignupPayload.raidStartTime),
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
                        description: formatRaidSignupDescription(raidSignupPayload.raidName, raidSignupPayload.userDisplayName, raidSignupUrl, raidSignupPayload.raidStartTime),
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
        case 'raid.withdraw':
            const raidWithdrawPayload = payload;
            const raidWithdrawUrl = buildRaidUrl(raidWithdrawPayload.raidId);
            return {
                embeds: [
                    {
                        title: `⚠️ ${raidWithdrawPayload.characterName} (${raidWithdrawPayload.characterClassLabel}) withdrew`,
                        description: formatRaidSignupDescription(raidWithdrawPayload.raidName, raidWithdrawPayload.userDisplayName, raidWithdrawUrl),
                        color: DISCORD_COLORS.warning,
                        footer: { text: raidWithdrawPayload.guildName },
                        timestamp: new Date(raidWithdrawPayload.withdrawnAt).toISOString()
                    }
                ]
            };
        case 'loot.assigned':
            const lootAssignedPayload = payload;
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
                return `${emoji} ${itemLabel} → ${assignment.looterName}`;
            })
                .join('\n');
            const lootOverflow = Math.max(lootAssignedPayload.assignments.length - lootAssignments.length, 0);
            const lootRaidUrl = buildRaidUrl(lootAssignedPayload.raidId);
            const metaLine = '';
            const linkLine = lootRaidUrl ? `\n[View Raid](${lootRaidUrl})` : '';
            const overflowLine = lootOverflow > 0
                ? `\n_${lootOverflow} additional assignment${lootOverflow === 1 ? '' : 's'} not shown_`
                : '';
            return {
                embeds: [
                    {
                        title: `📦 Loot Assigned — ${lootAssignedPayload.raidName}`,
                        description: `${lootDescription}${metaLine}${linkLine}${overflowLine}`,
                        color: DISCORD_COLORS.success,
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
            const approvedPayload = payload;
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
            const deniedPayload = payload;
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
const ALLA_ITEM_SEARCH_BASE = 'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
function buildAllaItemUrl(itemName) {
    if (!itemName) {
        return null;
    }
    const trimmed = itemName.trim();
    if (!trimmed) {
        return null;
    }
    return `${ALLA_ITEM_SEARCH_BASE}&iname=${encodeURIComponent(trimmed)}`;
}
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
function buildGuildApplicantsUrl(guildId) {
    if (!clientBaseUrl) {
        return null;
    }
    return `${clientBaseUrl}/guilds/${encodeURIComponent(guildId)}?members=APPLICANT`;
}
function buildAttendanceEventUrl(raidId, attendanceEventId) {
    const raidUrl = buildRaidUrl(raidId);
    if (!raidUrl) {
        return null;
    }
    return `${raidUrl}?attendanceEventId=${encodeURIComponent(attendanceEventId)}`;
}
function formatRaidSignupDescription(raidName, userDisplayName, raidUrl, raidStartTime) {
    const raidLabel = raidUrl ? `[${raidName}](${raidUrl})` : raidName;
    const lines = [`**Raid:** ${raidLabel}`, `**Player:** ${userDisplayName}`];
    if (raidStartTime) {
        lines.push(`**Start:** ${formatDiscordTimestamp(raidStartTime)}`);
    }
    return lines.join('\n');
}
function formatDuration(start, end) {
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
