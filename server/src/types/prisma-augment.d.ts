import '@prisma/client';

declare module '@prisma/client' {
  interface RaidEvent {
    recurrenceSeriesId: string | null;
  }

  // Provide minimal typing for the generated delegate to satisfy the compiler
  interface PrismaClient {
    raidEventSeries: any;
  }
}

export {};
