import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NPC_NAME_APOSTROPHE_VARIANTS,
  buildTrackedNpcLookupCandidates,
  buildTrackedNpcLookupPrefix,
  getTrackedNpcNameMatchRank
} from './npcNameMatching.js';

test('matches the apostrophe and backtick forms observed for Grand Magus D Nor', () => {
  assert.ok(buildTrackedNpcLookupCandidates('Grand Magus D`Nor').includes("grand magus d'nor"));
  assert.equal(getTrackedNpcNameMatchRank('Grand Magus D`Nor', "Grand Magus D'Nor"), 0);
});

test('queries and matches curly-apostrophe definitions from backtick log names', () => {
  assert.ok(
    buildTrackedNpcLookupCandidates('Prince Selrach Di`zok').includes('prince selrach di’zok')
  );
  assert.equal(getTrackedNpcNameMatchRank('Prince Selrach Di`zok', 'Prince Selrach Di’zok'), 0);
  assert.ok(
    buildTrackedNpcLookupCandidates('Queen Velazul Di`zok').includes('queen velazul di’zok')
  );
  assert.equal(getTrackedNpcNameMatchRank('Queen Velazul Di`zok', 'Queen Velazul Di’zok'), 0);
});

test('canonicalizes supported Unicode apostrophe variants without changing display names', () => {
  for (const logVariant of NPC_NAME_APOSTROPHE_VARIANTS) {
    const logName = `Grand Magus D${logVariant}Nor`;
    const candidates = buildTrackedNpcLookupCandidates(logName);
    for (const configuredVariant of NPC_NAME_APOSTROPHE_VARIANTS) {
      const configuredName = `Grand Magus D${configuredVariant}Nor`;
      assert.ok(candidates.includes(configuredName.toLowerCase()));
      assert.equal(getTrackedNpcNameMatchRank(logName, configuredName), 0);
    }
  }
});

test('provides a narrow lookup prefix for mixed apostrophe styles', () => {
  assert.equal(buildTrackedNpcLookupPrefix('Grand Magus D`Norʼs Echo'), 'grand magus d');
  assert.equal(
    getTrackedNpcNameMatchRank('Grand Magus D`Norʼs Echo', "Grand Magus D’Nor's Echo"),
    0
  );
  assert.equal(buildTrackedNpcLookupPrefix("D'Nor"), null);
  assert.equal(buildTrackedNpcLookupPrefix('Grand Magus D Nor'), null);
});

test('matches a log-only title suffix to the configured base NPC name', () => {
  assert.ok(buildTrackedNpcLookupCandidates('Vynoissu the Undying').includes('vynoissu'));
  assert.equal(getTrackedNpcNameMatchRank('Vynoissu the Undying', 'Vynoissu'), 2);
});

test('does not mistake a boss pet death for the configured boss', () => {
  assert.ok(
    !buildTrackedNpcLookupCandidates('Grand Magus D`Nor`s pet').includes("grand magus d'nor")
  );
  assert.equal(getTrackedNpcNameMatchRank('Grand Magus D`Nor`s pet', "Grand Magus D'Nor"), null);
});

test('supports an optional leading article without weakening unrelated names', () => {
  assert.equal(getTrackedNpcNameMatchRank('Avatar of War', 'The Avatar of War'), 1);
  assert.equal(getTrackedNpcNameMatchRank('Silvlit Xor', 'Xivlit Xor'), null);
});

test('keeps a complete configured name ahead of its shorter fallback candidate', () => {
  assert.equal(
    getTrackedNpcNameMatchRank(
      'Bristlebane the King of Thieves',
      'Bristlebane the King of Thieves'
    ),
    0
  );
  assert.equal(getTrackedNpcNameMatchRank('Bristlebane the King of Thieves', 'Bristlebane'), 2);
});
