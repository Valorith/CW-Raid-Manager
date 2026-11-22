import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NPC_NAME_APOSTROPHE_VARIANTS,
  findBestTrackedNpcNameMatches,
  getTrackedNpcNameMatchRank,
  npcNamesReferToSameNpc
} from './npcNameMatching.js';

test('matches the apostrophe and backtick forms observed for Grand Magus D Nor', () => {
  assert.equal(getTrackedNpcNameMatchRank('Grand Magus D`Nor', "Grand Magus D'Nor"), 0);
});

test('matches curly-apostrophe definitions from backtick log names', () => {
  assert.equal(getTrackedNpcNameMatchRank('Prince Selrach Di`zok', 'Prince Selrach Di’zok'), 0);
  assert.equal(getTrackedNpcNameMatchRank('Queen Velazul Di`zok', 'Queen Velazul Di’zok'), 0);
});

test('canonicalizes supported Unicode apostrophe variants without changing display names', () => {
  for (const logVariant of NPC_NAME_APOSTROPHE_VARIANTS) {
    const logName = `Grand Magus D${logVariant}Nor`;
    for (const configuredVariant of NPC_NAME_APOSTROPHE_VARIANTS) {
      assert.equal(getTrackedNpcNameMatchRank(logName, `Grand Magus D${configuredVariant}Nor`), 0);
    }
  }
});

test('matches a log-only title suffix to the configured base NPC name', () => {
  assert.equal(getTrackedNpcNameMatchRank('Vynoissu the Undying', 'Vynoissu'), 2);
});

test('matches a loot listing that omits the configured title only when allowed', () => {
  assert.equal(
    getTrackedNpcNameMatchRank('Prince Thirneg', 'Prince Thirneg the Petulant', {
      allowOmittedTitle: true
    }),
    3
  );
  // A death line naming only the base name may be a different NPC (an illusion or event mob).
  assert.equal(getTrackedNpcNameMatchRank('Bristlebane', 'Bristlebane the King of Thieves'), null);
});

test('matches hyphen and spacing variants of the same NPC name', () => {
  assert.equal(getTrackedNpcNameMatchRank('All-Seeing Eye', 'All Seeing Eye'), 4);
  assert.equal(getTrackedNpcNameMatchRank('AllSeeing Eye', 'All Seeing Eye'), 4);
});

test('does not mistake a boss pet death for the configured boss', () => {
  assert.equal(getTrackedNpcNameMatchRank('Grand Magus D`Nor`s pet', "Grand Magus D'Nor"), null);
  assert.equal(npcNamesReferToSameNpc('Grand Magus D`Nor`s pet', 'Grand Magus D`Nor'), false);
});

test('supports an optional leading article without weakening unrelated names', () => {
  assert.equal(getTrackedNpcNameMatchRank('Avatar of War', 'The Avatar of War'), 1);
  assert.equal(getTrackedNpcNameMatchRank('Silvlit Xor', 'Xivlit Xor'), null);
  assert.equal(getTrackedNpcNameMatchRank('Dread', 'Dreadwidow Farlina'), null);
});

test('keeps a complete configured name ahead of its shorter fallback candidate', () => {
  const definitions = [
    { id: 'short', npcName: 'Bristlebane' },
    { id: 'full', npcName: 'Bristlebane the King of Thieves' }
  ];
  assert.deepEqual(
    findBestTrackedNpcNameMatches('Bristlebane the King of Thieves', definitions).map(
      (definition) => definition.id
    ),
    ['full']
  );
  assert.equal(getTrackedNpcNameMatchRank('Bristlebane the King of Thieves', 'Bristlebane'), 2);
});

test('returns every same-name definition so zone matching can choose between them', () => {
  const definitions = [
    { id: 'cabilis', npcName: 'Grand Arcanist Zhevan' },
    { id: 'freeport', npcName: 'Grand Arcanist Zhevan' },
    { id: 'other', npcName: 'Grand Magus D’Nor' }
  ];
  assert.deepEqual(
    findBestTrackedNpcNameMatches('Grand Arcanist Zhevan', definitions).map(
      (definition) => definition.id
    ),
    ['cabilis', 'freeport']
  );
  assert.deepEqual(findBestTrackedNpcNameMatches('a giant chest', definitions), []);
});

test('treats death-line and loot-line names for one NPC as the same NPC', () => {
  assert.equal(npcNamesReferToSameNpc('Prince Thirneg the Petulant', 'Prince Thirneg'), true);
  assert.equal(npcNamesReferToSameNpc('Grand Magus D`Nor', "Grand Magus D'Nor"), true);
  assert.equal(npcNamesReferToSameNpc('Lord Vyemm', 'Lord Koi`Doken'), false);
});
