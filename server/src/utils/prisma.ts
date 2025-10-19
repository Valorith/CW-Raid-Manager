import { PrismaClient } from '@prisma/client';

import { appConfig } from '../config/appConfig.js';

const missingDatabaseMessage =
  'Database access attempted but DATABASE_URL is not configured. Please set DATABASE_URL or provide config.database.url.';

function createPrismaClient(): PrismaClient {
  if (appConfig.databaseUrl) {
    return new PrismaClient();
  }

  console.warn(missingDatabaseMessage);

  const handler: ProxyHandler<PrismaClient> = {
    get(_target, prop) {
      if (prop === '$disconnect' || prop === '$connect') {
        return async () => undefined;
      }

      throw new Error(missingDatabaseMessage);
    }
  };

  return new Proxy({} as PrismaClient, handler);
}

export const prisma = createPrismaClient();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
