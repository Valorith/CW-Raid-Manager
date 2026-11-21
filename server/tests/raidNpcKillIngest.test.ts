import assert from 'node:assert/strict';
import test from 'node:test';

import type { Prisma, PrismaClient } from '@prisma/client';

import { parseNpcKills } from '../../client/src/services/npcKillParser.js';
import {
  raidNpcKillAppendSchema,
  raidNpcKillImportSchema
} from '../src/utils/raidNpcKillPayload.js';
import { persistRaidNpcKillBatch } from '../src/utils/raidNpcKillPersistence.js';

const scope = { raidId: 'raid-a', guildId: 'guild-a' };
const occurredAt = new Date('2026-11-16T03:25:00Z');

const row = (signature: string, scopeOverride = scope): Prisma.RaidNpcKillEventCreateManyInput => ({
  ...scopeOverride,
  npcName: 'Blacksmith Yragbor',
  npcNameNormalized: 'blacksmith yragbor',
  logSignature: signature,
  killerName: null,
  occurredAt
});

test('accepts scripted completions with no named killer alongside an ordinary kill', () => {
  const logs = [
    '[Sun Nov 15 22:25:00 2026] You have entered Shadowspine.',
    '[Sun Nov 15 22:25:01 2026] Blacksmith Yragbor is pulled away by an unseen force.',
    "[Sun Nov 15 22:25:02 2026] Braag the Morphling shouts 'Until next time...'",
    "[Sun Nov 15 22:25:03 2026] Enraged Corflunk says 'Your destiny lies at the hands of the Greenbloods.'",
    '[Sun Nov 15 22:25:04 2026] Ancient Drake has been slain by Elara!'
  ].join('\n');
  const eventList = parseNpcKills(logs, new Date(2026, 10, 15, 22, 24));
  const payload = {
    kills: eventList.map((entry) => ({
      npcName: entry.npcName,
      killerName: entry.killerName ?? null,
      occurredAt: entry.timestamp?.toISOString(),
      rawLine: entry.rawLine,
      zoneName: entry.zoneName ?? null
    }))
  };
  assert.deepEqual(
    raidNpcKillAppendSchema
      .parse(payload)
      .kills.map(({ npcName, killerName }) => [npcName, killerName]),
    [
      ['Blacksmith Yragbor', null],
      ['Braag the Morphling', null],
      ['Enraged Corflunk', null],
      ['Ancient Drake', 'Elara']
    ]
  );
  assert.equal(raidNpcKillImportSchema.safeParse(payload).success, true);
  assert.equal(
    raidNpcKillAppendSchema.safeParse({
      kills: [{ npcName: 'Ancient Drake', occurredAt: occurredAt.toISOString() }]
    }).success,
    true
  );
  assert.equal(raidNpcKillImportSchema.safeParse({ kills: [] }).success, false);
  assert.equal(
    raidNpcKillImportSchema.safeParse({ kills: [{ ...payload.kills[0], npcName: '  ' }] }).success,
    false
  );
});

function fakeDatabase(input: ReturnType<typeof row>[], blockedChunk = Infinity) {
  let committed = input;
  const db = {
    async $transaction(run: (tx: Prisma.TransactionClient) => Promise<number>) {
      let pending = [...committed];
      let chunkNumber = 0;
      const tx = {
        raidNpcKillEvent: {
          async deleteMany({ where }: { where: typeof scope }) {
            pending = pending.filter(
              (row) => row.raidId !== where.raidId || row.guildId !== where.guildId
            );
          },
          async createMany({
            data,
            skipDuplicates
          }: {
            data: typeof input;
            skipDuplicates: boolean;
          }) {
            if (++chunkNumber === blockedChunk) throw new Error('database write failed');
            let count = 0;
            for (const row of data) {
              if (
                pending.some(
                  (existing) =>
                    existing.raidId === row.raidId && existing.logSignature === row.logSignature
                )
              ) {
                if (!skipDuplicates) throw new Error('unexpected duplicate');
                continue;
              }
              pending.push(row);
              count++;
            }
            return { count };
          }
        }
      } as unknown as Prisma.TransactionClient;
      const result = await run(tx);
      committed = pending;
      return result;
    }
  } as unknown as Pick<PrismaClient, '$transaction'>;
  return { db, rows: () => committed };
}

test('a late write error rolls back an entire replacement and keeps originals', async () => {
  const original = row('original');
  const anotherRaid = row('outside-raid', { raidId: 'raid-b', guildId: 'guild-a' });
  const app = fakeDatabase([original, anotherRaid], 2);
  const replacement = Array.from({ length: 101 }, (_, i) => row(`new-${i}`));
  await assert.rejects(persistRaidNpcKillBatch(app.db, scope, replacement, true), /write failed/);
  assert.deepEqual(app.rows(), [original, anotherRaid]);
});

test('replacement is scoped and deduplicated; subsequent append keeps both histories', async () => {
  const anotherRaid = row('outside-raid', { raidId: 'raid-b', guildId: 'guild-a' });
  const app = fakeDatabase([row('old'), anotherRaid]);
  const replacement = row('new');
  assert.equal(await persistRaidNpcKillBatch(app.db, scope, [replacement, replacement], true), 1);
  assert.deepEqual(app.rows(), [anotherRaid, replacement]);
  const appended = row('appended');
  assert.equal(await persistRaidNpcKillBatch(app.db, scope, [replacement, appended], false), 1);
  assert.deepEqual(app.rows(), [anotherRaid, replacement, appended]);
});
