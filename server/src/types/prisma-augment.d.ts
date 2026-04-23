import '@prisma/client';

type RaidEventSeriesDelegateLike = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

declare module '@prisma/client' {
  interface RaidEvent {
    recurrenceSeriesId: string | null;
  }

  // Provide minimal typing for the generated delegate to satisfy the compiler
  interface PrismaClient {
    raidEventSeries: RaidEventSeriesDelegateLike;
  }
}

export {};
