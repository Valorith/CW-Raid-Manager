import type { Prisma, PrismaClient } from '@prisma/client';

type KillRows = Pick<Prisma.TransactionClient, 'raidNpcKillEvent'>;

export function persistRaidNpcKillBatch(
  db: Pick<PrismaClient, '$transaction'>,
  scope: { raidId: string; guildId: string },
  entries: Prisma.RaidNpcKillEventCreateManyInput[],
  replace: boolean
) {
  return db.$transaction((tx) => persistRaidNpcKillRows(tx, scope, entries, replace), {
    timeout: 15_000
  });
}

async function persistRaidNpcKillRows(
  store: KillRows,
  scope: { raidId: string; guildId: string },
  entries: Prisma.RaidNpcKillEventCreateManyInput[],
  replace: boolean
) {
  if (!entries.length) return 0;
  if (replace) {
    await store.raidNpcKillEvent.deleteMany({ where: scope });
  }
  // In replacement mode explicitly deduplicate instead of INSERT IGNORE:
  // non-duplicate insert errors must still abort and restore the old rows.
  const seen = new Set<string>();
  const rows = replace
    ? entries.filter((entry) => {
        if (seen.has(entry.logSignature)) return false;
        seen.add(entry.logSignature);
        return true;
      })
    : entries;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const result = await store.raidNpcKillEvent.createMany({
      data: rows.slice(i, i + 100),
      skipDuplicates: !replace
    });
    inserted += result.count;
  }
  return inserted;
}
