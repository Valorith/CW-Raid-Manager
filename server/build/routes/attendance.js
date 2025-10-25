import { AttendanceEventType, AttendanceStatus, CharacterClass } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createAttendanceEvent, deleteAttendanceEvent, getAttendanceEvent, listAttendanceEvents, listRecentAttendanceForUser, overwriteAttendanceEventRecords } from '../services/attendanceService.js';
import { ensureUserCanEditRaid, ensureUserCanViewGuild, getRaidEventById } from '../services/raidService.js';
import { parseRaidRoster } from '../utils/raidRosterParser.js';
const attendanceRecordSchema = z.object({
    characterId: z.string().optional(),
    characterName: z.string().min(2),
    level: z.number().int().min(1).max(125).nullable().optional(),
    class: z.nativeEnum(CharacterClass).nullable().optional(),
    groupNumber: z.number().int().min(1).max(12).nullable().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    flags: z.string().nullable().optional()
});
const attendanceRecordArraySchema = z.array(attendanceRecordSchema);
export async function attendanceRoutes(server) {
    server.get('/user/recent', { preHandler: [authenticate] }, async (request, reply) => {
        const querySchema = z.object({
            limit: z.coerce.number().int().min(1).max(50).optional()
        });
        const parsedQuery = querySchema.safeParse(request.query ?? {});
        if (!parsedQuery.success) {
            return reply.badRequest('Invalid query parameters.');
        }
        const limit = parsedQuery.data.limit ?? 10;
        const attendance = await listRecentAttendanceForUser(request.user.userId, limit);
        return { attendance };
    });
    server.get('/raid/:raidEventId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            raidEventId: z.string()
        });
        const { raidEventId } = paramsSchema.parse(request.params);
        const raid = await getRaidEventById(raidEventId);
        if (!raid) {
            return reply.notFound('Raid event not found.');
        }
        try {
            await ensureUserCanViewGuild(request.user.userId, raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized attendance fetch attempt.');
            return reply.forbidden('You are not a member of this guild.');
        }
        const attendanceEvents = await listAttendanceEvents(raidEventId);
        return { attendanceEvents };
    });
    server.get('/event/:attendanceEventId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            attendanceEventId: z.string()
        });
        const { attendanceEventId } = paramsSchema.parse(request.params);
        const attendanceEvent = await getAttendanceEvent(attendanceEventId);
        if (!attendanceEvent) {
            return reply.notFound('Attendance event not found.');
        }
        try {
            await ensureUserCanViewGuild(request.user.userId, attendanceEvent.raid.guildId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized attendance fetch attempt.');
            return reply.forbidden('You are not a member of this guild.');
        }
        return { attendanceEvent };
    });
    server.post('/raid/:raidEventId/upload', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        const paramsSchema = z.object({
            raidEventId: z.string()
        });
        const { raidEventId } = paramsSchema.parse(request.params);
        try {
            await ensureUserCanEditRaid(raidEventId, request.user.userId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized roster upload.');
            return reply.forbidden('You do not have permission to upload for this raid.');
        }
        const file = await request.file();
        if (!file) {
            return reply.badRequest('Roster file is required.');
        }
        const buffer = await file.toBuffer();
        const contents = buffer.toString('utf-8');
        const parsedEntries = parseRaidRoster(contents);
        return {
            preview: parsedEntries,
            meta: {
                filename: file.filename,
                uploadedAt: new Date().toISOString()
            }
        };
    });
    server.post('/raid/:raidEventId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            raidEventId: z.string()
        });
        const { raidEventId } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            note: z.string().max(2000).optional(),
            snapshot: z.any().optional(),
            eventType: z.nativeEnum(AttendanceEventType).optional(),
            records: attendanceRecordArraySchema.optional().default([])
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid attendance payload.');
        }
        try {
            const attendanceEvent = await createAttendanceEvent({
                raidEventId,
                createdById: request.user.userId,
                note: parsed.data.note,
                snapshot: parsed.data.snapshot,
                eventType: parsed.data.eventType,
                records: parsed.data.records.map((record) => ({
                    ...record,
                    status: record.status ?? AttendanceStatus.PRESENT
                }))
            });
            return reply.code(201).send({ attendanceEvent });
        }
        catch (error) {
            request.log.warn({ error }, 'Failed to create attendance event.');
            return reply.forbidden('You do not have permission to create attendance events for this raid.');
        }
    });
    server.delete('/event/:attendanceEventId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({
            attendanceEventId: z.string()
        });
        const { attendanceEventId } = paramsSchema.parse(request.params);
        const attendanceEvent = await getAttendanceEvent(attendanceEventId);
        if (!attendanceEvent) {
            return reply.notFound('Attendance event not found.');
        }
        try {
            await ensureUserCanEditRaid(attendanceEvent.raid.id, request.user.userId);
        }
        catch (error) {
            request.log.warn({ error }, 'Unauthorized attendance delete attempt.');
            return reply.forbidden('You do not have permission to delete this attendance event.');
        }
        await deleteAttendanceEvent(attendanceEventId);
        return reply.code(204).send();
    });
    server.patch('/event/:attendanceEventId', { preHandler: [authenticate] }, async (request, reply) => {
        const paramsSchema = z.object({ attendanceEventId: z.string() });
        const { attendanceEventId } = paramsSchema.parse(request.params);
        const bodySchema = z.object({
            note: z.string().max(2000).optional(),
            snapshot: z.any().optional(),
            records: attendanceRecordArraySchema
        });
        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.badRequest('Invalid attendance payload.');
        }
        try {
            const attendanceEvent = await overwriteAttendanceEventRecords({
                attendanceEventId,
                actorUserId: request.user.userId,
                records: parsed.data.records,
                note: parsed.data.note,
                snapshot: parsed.data.snapshot
            });
            return { attendanceEvent };
        }
        catch (error) {
            request.log.warn({ error }, 'Failed to overwrite attendance event.');
            if (error instanceof Error && error.message === 'Attendance event not found.') {
                return reply.notFound(error.message);
            }
            return reply.forbidden('You do not have permission to update this attendance event.');
        }
    });
}
