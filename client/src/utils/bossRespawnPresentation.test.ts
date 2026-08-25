// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import type { NpcRespawnTrackerEntry } from '../services/api.js';
import {
  buildBossRespawnCountdown,
  buildBossRespawnLanes,
  getBossRespawnTone
} from './bossRespawnPresentation.js';

function entry(
  status: NpcRespawnTrackerEntry['respawnStatus'],
  isInstanceVariant: boolean,
  values: Partial<NpcRespawnTrackerEntry> = {}
) {
  return {
    respawnStatus: status,
    isInstanceVariant,
    respawnMinTime: null,
    respawnMaxTime: null,
    progressPercent: null,
    ...values
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

test('builds a single countdown for the next current-phase change', () => {
  const now = Date.parse('2026-08-24T16:00:00.000Z');
  const countdown = buildBossRespawnCountdown(
    [
      entry('window', false, {
        respawnMinMinutes: 180,
        respawnMaxMinutes: 360,
        respawnMinTime: '2026-08-24T15:00:00.000Z',
        respawnMaxTime: '2026-08-24T18:00:00.000Z',
        lastKill: {
          id: 'kill-1',
          killedAt: '2026-08-24T12:00:00.000Z'
        } as NpcRespawnTrackerEntry['lastKill']
      }),
      entry('up', true, {
        respawnMinMinutes: 120,
        respawnMaxMinutes: null,
        progressPercent: 44
      })
    ],
    now
  );

  assert.equal(countdown?.variant, 'overworld');
  assert.equal(countdown?.status, 'window');
  assert.equal(Math.round(countdown?.remainingPercent ?? -1), 67);
});

test('drains the bar through the active down phase', () => {
  const countdown = buildBossRespawnCountdown(
    [
      entry('down', false, {
        respawnMinMinutes: 240,
        respawnMaxMinutes: 360,
        respawnMinTime: '2026-08-24T16:00:00.000Z',
        lastKill: {
          id: 'kill-2',
          killedAt: '2026-08-24T12:00:00.000Z'
        } as NpcRespawnTrackerEntry['lastKill']
      })
    ],
    Date.parse('2026-08-24T14:00:00.000Z')
  );

  assert.equal(countdown?.status, 'down');
  assert.equal(Math.round(countdown?.remainingPercent ?? -1), 50);
});

test('keeps an unknown respawn countdown dormant', () => {
  const countdown = buildBossRespawnCountdown([
    entry('unknown', false, { progressPercent: 65 })
  ]);

  assert.equal(countdown?.remainingPercent, null);
});
