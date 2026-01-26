import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../utils/prisma.js';
export async function questShareRoutes(server) {
    const assignmentIdParams = z.object({ assignmentId: z.string() });
    /**
     * Get quest assignment share details for short URL resolution.
     * Returns the guildId, blueprintId, and assignmentId needed to navigate
     * to the full quest tracker view.
     */
    server.get('/share/:assignmentId', { preHandler: [authenticate] }, async (request, reply) => {
        const { assignmentId } = assignmentIdParams.parse(request.params);
        const assignment = await prisma.questAssignment.findUnique({
            where: { id: assignmentId },
            select: {
                id: true,
                guildId: true,
                blueprintId: true,
                status: true,
                character: {
                    select: {
                        name: true,
                        class: true
                    }
                },
                blueprint: {
                    select: {
                        title: true
                    }
                }
            }
        });
        if (!assignment) {
            return reply.notFound('Quest assignment not found.');
        }
        // Verify user has access to this guild
        const membership = await prisma.guildMembership.findFirst({
            where: {
                guildId: assignment.guildId,
                userId: request.user.userId
            }
        });
        if (!membership) {
            return reply.forbidden('You must be a guild member to view this quest progress.');
        }
        return {
            assignmentId: assignment.id,
            guildId: assignment.guildId,
            blueprintId: assignment.blueprintId,
            characterName: assignment.character?.name ?? null,
            characterClass: assignment.character?.class ?? null,
            blueprintTitle: assignment.blueprint.title,
            status: assignment.status
        };
    });
}
