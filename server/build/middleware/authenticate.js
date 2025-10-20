export async function authenticate(request, reply) {
    try {
        if (request.cookies?.cwraid_token) {
            await request.jwtVerify();
            return;
        }
    }
    catch (error) {
        request.log.warn({ error }, 'Failed to verify JWT');
    }
    reply.unauthorized('Authentication required.');
}
