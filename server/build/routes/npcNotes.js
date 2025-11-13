import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { ensureUserCanViewGuild, roleCanEditRaid } from '../services/raidService.js';
import { approveGuildNpcNoteDeletion, deleteGuildNpcNote, denyGuildNpcNoteDeletion, getGuildNpcNote, listGuildNpcNotes, requestGuildNpcNoteDeletion, upsertGuildNpcNote } from '../services/guildNpcNoteService.js';
import { prisma } from '../utils/prisma.js';
import { withPreferredDisplayName } from '../utils/displayName.js';
function isValidAllaLink(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '').toLowerCase();
    return withoutProtocol.startsWith('alla.clumsysworld.com');
}
const allaLinkSchema = z
    .string()
    .trim()
    .min(1, 'Alla link is required.')
    .max(512)
    .refine((value) => isValidAllaLink(value), {
    message: 'Alla links must start with alla.clumsysworld.com'
});
const associationSchema = z.object({
    name: z.string().trim().min(2).max(191),
    allaLink: allaLinkSchema
});
const npcNoteBodySchema = z.object({
    notes: z.string().max(8000).nullable().optional(),
    allaLink: allaLinkSchema.nullable().optional(),
    spells: z.array(associationSchema).optional().default([]),
    relatedNpcs: z.array(associationSchema).optional().default([])
});
async function resolveGuildMemberDisplayName(guildId, user) {
    const membership = await prisma.guildMembership.findUnique({
        where: {
            guildId_userId: {
                guildId,
                userId: user.userId
            }
        },
        include: {
            user: {
                select: {
                    displayName: true,
                    nickname: true
                }
            }
        }
    });
    if (membership?.user) {
        return withPreferredDisplayName(membership.user).displayName;
    }
    return (user.displayName ??
        user.nickname ??
        user.email ??
        'Unknown');
}
export async function npcNotesRoutes(server) {
    server.get('/:guildId/npc-notes', { preHandler: [authenticate] }, async (request) => {
        const paramsSchema = z.object({ guildId: z.string() });
        const { guildId } = paramsSchema.parse(request.params);
        const role = await ensureUserCanViewGuild(request.user.userId, guildId);
        const notes = await listGuildNpcNotes(guildId);
        return {
            notes,
            canEdit: true,
            canApproveDeletion: roleCanEditRaid(role),
            viewerRole: role
        };
    });
    server.get('/:guildId/npc-notes/:npcName', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string(), npcName: z.string() });
        const { guildId, npcName } = paramsSchema.parse(request.params);
        await ensureUserCanViewGuild(request.user.userId, guildId);
        const note = await getGuildNpcNote(guildId, npcName);
        if (!note) {
            return reply.notFound('NPC note not found.');
        }
        return { note };
    });
    server.put('/:guildId/npc-notes/:npcName', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string(), npcName: z.string() });
        const { guildId, npcName } = paramsSchema.parse(request.params);
        const role = await ensureUserCanViewGuild(request.user.userId, guildId);
        const parsedBody = npcNoteBodySchema.safeParse(request.body ?? {});
        if (!parsedBody.success) {
            return reply.badRequest('Invalid NPC note payload.');
        }
        const payload = parsedBody.data;
        const editorName = await resolveGuildMemberDisplayName(guildId, request.user);
        const note = await upsertGuildNpcNote(guildId, {
            userId: request.user.userId,
            displayName: editorName
        }, {
            npcName,
            notes: payload.notes ?? null,
            allaLink: payload.allaLink ?? null,
            spells: payload.spells,
            relatedNpcs: payload.relatedNpcs
        });
        return { note };
    });
    server.delete('/:guildId/npc-notes/:npcName', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string(), npcName: z.string() });
        const { guildId, npcName } = paramsSchema.parse(request.params);
        const role = await ensureUserCanViewGuild(request.user.userId, guildId);
        if (!roleCanEditRaid(role)) {
            return reply.forbidden('You do not have permission to delete NPC notes.');
        }
        await deleteGuildNpcNote(guildId, npcName);
        return reply.code(204).send();
    });
    server.post('/:guildId/npc-notes/:npcName/delete-request', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string(), npcName: z.string() });
        const { guildId, npcName } = paramsSchema.parse(request.params);
        await ensureUserCanViewGuild(request.user.userId, guildId);
        try {
            const displayName = await resolveGuildMemberDisplayName(guildId, request.user);
            const note = await requestGuildNpcNoteDeletion(guildId, npcName, {
                userId: request.user.userId,
                displayName
            });
            return { note };
        }
        catch (error) {
            return reply.notFound(error instanceof Error ? error.message : 'NPC note not found.');
        }
    });
    server.post('/:guildId/npc-notes/:npcName/delete-decision', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ guildId: z.string(), npcName: z.string() });
        const { guildId, npcName } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            decision: z.enum(['APPROVE', 'DENY'])
        });
        const { decision } = bodySchema.parse(request.body ?? {});
        const role = await ensureUserCanViewGuild(request.user.userId, guildId);
        if (!roleCanEditRaid(role)) {
            return reply.forbidden('Only guild leaders or officers may approve deletions.');
        }
        if (decision === 'APPROVE') {
            await approveGuildNpcNoteDeletion(guildId, npcName);
            return reply.code(204).send();
        }
        try {
            const note = await denyGuildNpcNoteDeletion(guildId, npcName);
            return { note };
        }
        catch (error) {
            return reply.notFound(error instanceof Error ? error.message : 'NPC note not found.');
        }
    });
}
