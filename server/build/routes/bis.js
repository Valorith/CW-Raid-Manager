import { CharacterClass } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createOrReplaceBisBan, ensureBisAdmin, getBisBoard, listActiveBisBans, nominateBisCandidate, revokeBisBan, searchBisCharactersByName, searchBisUsers, searchCompatibleDiscoveredItems, voteForBisCandidate } from '../services/bisService.js';
const bisClassSchema = z
    .nativeEnum(CharacterClass)
    .refine((value) => value !== CharacterClass.UNKNOWN, {
    message: 'Playable class required.'
});
const slotIdSchema = z.number().int().min(0).max(22);
async function requireBisAdmin(request, reply) {
    try {
        await ensureBisAdmin(request.user.userId);
    }
    catch (error) {
        request.log.warn({ error }, 'Non-admin attempted to access BiS moderation route.');
        return reply.forbidden('Administrator privileges required.');
    }
}
export async function bisRoutes(server) {
    server.get('/', { preHandler: [authenticate] }, async (request, reply) => {
        const querySchema = z.object({
            characterClass: bisClassSchema
        });
        const parsed = querySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        const board = await getBisBoard(parsed.data.characterClass, request.user.userId);
        return board;
    });
    server.get('/discovered-items', { preHandler: [authenticate] }, async (request, reply) => {
        const querySchema = z.object({
            characterClass: bisClassSchema,
            slotId: z.coerce.number().int().min(0).max(22),
            q: z.string().trim().min(2).max(100),
            limit: z.coerce.number().int().min(1).max(20).optional()
        });
        const parsed = querySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        const items = await searchCompatibleDiscoveredItems(parsed.data.characterClass, parsed.data.slotId, parsed.data.q, parsed.data.limit ?? 12);
        return { items };
    });
    server.post('/candidates', { preHandler: [authenticate] }, async (request, reply) => {
        const bodySchema = z.object({
            characterClass: bisClassSchema,
            slotId: slotIdSchema,
            itemId: z.number().int().positive()
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            const result = await nominateBisCandidate(request.user.userId, parsed.data);
            return reply.code(201).send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to submit BiS candidate.';
            if (/banned from participating/i.test(message)) {
                return reply.forbidden(message);
            }
            return reply.badRequest(message);
        }
    });
    server.post('/votes', { preHandler: [authenticate] }, async (request, reply) => {
        const bodySchema = z.object({
            candidateId: z.string().min(1)
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            const result = await voteForBisCandidate(request.user.userId, parsed.data.candidateId);
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to cast BiS vote.';
            if (/banned from participating/i.test(message)) {
                return reply.forbidden(message);
            }
            if (/not found/i.test(message)) {
                return reply.notFound(message);
            }
            return reply.badRequest(message);
        }
    });
    server.get('/characters/search', { preHandler: [authenticate] }, async (request, reply) => {
        const querySchema = z.object({
            q: z.string().trim().min(2).max(100),
            limit: z.coerce.number().int().min(1).max(20).optional()
        });
        const parsed = querySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        const characters = await searchBisCharactersByName(parsed.data.q, parsed.data.limit ?? 12);
        return { characters };
    });
    server.get('/admin/bans', { preHandler: [authenticate, requireBisAdmin] }, async () => {
        const bans = await listActiveBisBans();
        return { bans };
    });
    server.get('/admin/users/search', { preHandler: [authenticate, requireBisAdmin] }, async (request, reply) => {
        const querySchema = z.object({
            q: z.string().trim().min(2).max(100)
        });
        const parsed = querySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        const users = await searchBisUsers(parsed.data.q);
        return { users };
    });
    server.post('/admin/bans', { preHandler: [authenticate, requireBisAdmin] }, async (request, reply) => {
        const bodySchema = z.object({
            userId: z.string().min(1),
            reason: z.string().trim().max(500).optional().nullable(),
            expiresAt: z.string().datetime().optional().nullable()
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            const ban = await createOrReplaceBisBan(request.user.userId, {
                userId: parsed.data.userId,
                reason: parsed.data.reason ?? null,
                expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
            });
            return reply.code(201).send({ ban });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to create BiS ban.';
            return reply.badRequest(message);
        }
    });
    server.delete('/admin/bans/:banId', { preHandler: [authenticate, requireBisAdmin] }, async (request, reply) => {
        const paramsSchema = z.object({
            banId: z.string().min(1)
        });
        const parsed = paramsSchema.safeParse(request.params);
        if (!parsed.success) {
            return reply.badRequest(parsed.error.message);
        }
        try {
            await revokeBisBan(request.user.userId, parsed.data.banId);
            return reply.code(204).send();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to revoke BiS ban.';
            if (/not found/i.test(message)) {
                return reply.notFound(message);
            }
            return reply.badRequest(message);
        }
    });
}
