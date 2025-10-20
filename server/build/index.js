import 'dotenv/config';
import { appConfig } from './config/appConfig.js';
import { buildServer } from './app.js';
async function start() {
    const server = buildServer();
    try {
        await server.listen({
            port: appConfig.port,
            host: appConfig.host
        });
        server.log.info({ port: appConfig.port, env: appConfig.nodeEnv }, 'CW Raid Manager API server started');
    }
    catch (error) {
        server.log.error(error, 'Failed to start CW Raid Manager API server');
        process.exit(1);
    }
}
void start();
