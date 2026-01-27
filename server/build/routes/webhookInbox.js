import { z } from 'zod';
import { receiveInboundWebhookMessage } from '../services/inboundWebhookService.js';
export async function webhookInboxRoutes(server) {
    server.post('/:webhookId/:token', async (request, reply) => {
        console.log('[WEBHOOK ROUTE] >>>>>> INCOMING WEBHOOK REQUEST <<<<<<');
        const paramsSchema = z.object({ webhookId: z.string(), token: z.string() });
        const { webhookId, token } = paramsSchema.parse(request.params);
        console.log(`[WEBHOOK ROUTE] webhookId: ${webhookId}, token: ${token.slice(0, 8)}...`);
        const payload = request.body ?? {};
        let rawBody = null;
        if (typeof payload === 'string') {
            rawBody = payload;
        }
        else if (Buffer.isBuffer(payload)) {
            rawBody = payload.toString('utf-8');
        }
        const headers = request.headers;
        const sourceIp = request.ip ?? null;
        try {
            await receiveInboundWebhookMessage({
                webhookId,
                token,
                payload,
                rawBody,
                headers,
                sourceIp
            });
            return reply.code(204).send();
        }
        catch (error) {
            if (error instanceof Error) {
                if (error.message === 'Webhook not found.') {
                    return reply.notFound('Webhook not found.');
                }
                if (error.message === 'Webhook is disabled.') {
                    return reply.forbidden('Webhook is disabled.');
                }
            }
            request.log.error({ error }, 'Failed to receive inbound webhook.');
            return reply.badRequest('Unable to process webhook.');
        }
    });
}
