import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEncounterKillKey,
  findEnragedTwinsCompletions,
  shouldDeferStandaloneTrackerKill
} from './raidEncounterCompletions.js';

test('awards Enraged Twins credit only for the paired kills from the successful attempt', () => {
  const failedAttempt = {
    npcName: 'Enraged Zarchoomi',
    occurredAt: new Date('2026-06-23T00:55:32.000Z'),
    killerName: 'Ozan',
    zoneName: 'Butcherblock Mountains'
  };
  const corflunk = {
    npcName: 'Enraged Corflunk',
    occurredAt: new Date('2026-06-23T01:04:03.000Z'),
    killerName: 'Zurkon',
    zoneName: 'Butcherblock Mountains'
  };
  const zarchoomi = {
    npcName: 'Enraged Zarchoomi',
    occurredAt: new Date('2026-06-23T01:04:04.000Z'),
    killerName: 'Laern',
    zoneName: 'Butcherblock Mountains'
  };

  assert.deepEqual(
    findEnragedTwinsCompletions(
      [failedAttempt, corflunk, zarchoomi],
      new Set([buildEncounterKillKey(zarchoomi)])
    ),
    [
      {
        npcName: 'Enraged Corflunk',
        occurredAt: new Date('2026-06-23T01:04:04.000Z'),
        killerName: 'Laern',
        zoneName: 'Butcherblock Mountains'
      }
    ]
  );
});

test('does not award Enraged Twins credit when only Zarchoomi dies', () => {
  const zarchoomi = {
    npcName: 'Enraged Zarchoomi',
    occurredAt: new Date('2026-07-28T02:22:24.000Z'),
    killerName: 'Plagued',
    zoneName: 'Butcherblock Mountains'
  };

  assert.deepEqual(
    findEnragedTwinsCompletions([zarchoomi], new Set([buildEncounterKillKey(zarchoomi)])),
    []
  );
});

test('awards separate tracker completions for the actual overworld and instance pairs', () => {
  const events = [
    {
      npcName: 'Enraged Corflunk',
      occurredAt: new Date('2026-08-25T02:08:40.000Z'),
      killerName: null,
      zoneName: 'Butcherblock Mountains'
    },
    {
      npcName: 'Enraged Zarchoomi',
      occurredAt: new Date('2026-08-25T02:08:46.000Z'),
      killerName: 'Laern',
      zoneName: 'Butcherblock Mountains'
    },
    {
      npcName: 'Enraged Corflunk',
      occurredAt: new Date('2026-08-25T02:15:42.000Z'),
      killerName: null,
      zoneName: 'Butcherblock Mountains'
    },
    {
      npcName: 'Enraged Zarchoomi',
      occurredAt: new Date('2026-08-25T02:15:47.000Z'),
      killerName: 'Dirt',
      zoneName: 'Butcherblock Mountains'
    }
  ];

  assert.deepEqual(
    findEnragedTwinsCompletions(events),
    [
      {
        npcName: 'Enraged Corflunk',
        occurredAt: new Date('2026-08-25T02:08:46.000Z'),
        killerName: 'Laern',
        zoneName: 'Butcherblock Mountains'
      },
      {
        npcName: 'Enraged Corflunk',
        occurredAt: new Date('2026-08-25T02:15:47.000Z'),
        killerName: 'Dirt',
        zoneName: 'Butcherblock Mountains'
      }
    ]
  );
});

test('defers Braag death credit until the scripted completion signal', () => {
  assert.equal(
    shouldDeferStandaloneTrackerKill({
      npcName: 'Braag the Morphling',
      killerName: 'You',
      zoneName: 'Shadow Spine'
    }),
    true
  );
  assert.equal(
    shouldDeferStandaloneTrackerKill({
      npcName: 'Braag the Morphling',
      killerName: null,
      zoneName: 'Shadowspine'
    }),
    false
  );
  assert.equal(
    shouldDeferStandaloneTrackerKill({
      npcName: 'Braag the Morphling',
      killerName: 'Dagara',
      zoneName: 'Kunark'
    }),
    false
  );
});
