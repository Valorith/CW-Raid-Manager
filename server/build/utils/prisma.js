import { appConfig } from '../config/appConfig.js';
const missingDatabaseMessage = 'Database access attempted but no connection string is configured. Set DATABASE_URL (or MYSQL_URL / MYSQL* variables) or provide config.database.url.';
function createPrismaClient() {
    if (appConfig.databaseUrl) {
        return new PrismaClient();
    }
    console.warn(missingDatabaseMessage);
    const handler = {
        get(_target, prop) {
            if (prop === '$disconnect' || prop === '$connect') {
                return async () => undefined;
            }
            throw new Error(missingDatabaseMessage);
        }
    };
    return new Proxy({}, handler);
}
export const prisma = createPrismaClient();
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
