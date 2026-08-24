// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import type { NpcRespawnTrackerEntry } from '../services/api.js';
import { buildBossRespawnLanes, getBossRespawnTone } from './bossRespawnPresentation.js';

function entry(
  status: NpcRespawnTrackerEntry['respawnStatus'],
  isInstanceVariant: boolean,
  times: Partial<Pick<NpcRespawnTrackerEntry, 'respawnMinTime' | 'respawnMaxTime'>> = {}
) {
  return {
    respawnStatus: status,
    isInstanceVariant,
    respawnMinTime: null,
    respawnMaxTime: null,
    ...times
  } as NpcRespawnTrackerEntry;
}

test('uses the most actionable dual-spawn state for the card glow', () => {
  assert.equal(getBossRespawnTone([entry('down', false), entry('up', true)]), 'up');
  assert.equal(getBossRespawnTone([entry('down', false), entry('window', true)]), 'window');
  assert.equal(getBossRespawnTone([entry('down', false), entry('down', true)]), 'down');
  assert.equal(getBossRespawnTone([entry('down', false), entry('unknown', true)]), 'unknown');
});

test('orders overworld before instance and keeps countdowns compact', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');
  const lanes = buildBossRespawnLanes(
    [
      entry('window', true, { respawnMaxTime: '2026-08-24T14:15:00.000Z' }),
      entry('down', false, { respawnMinTime: '2026-08-26T16:00:00.000Z' })
    ],
    now
  );

  assert.deepEqual(
    lanes.map((lane) => ({
      variant: lane.compactVariantLabel,
      status: lane.statusLabel,
      detail: lane.detail
    })),
    [
      { variant: 'OW', status: 'Down', detail: '2d 4h to window' },
      { variant: 'INST', status: 'Spawn window', detail: '2h 15m left' }
    ]
  );
});
