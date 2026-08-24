import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findUniqueBestTrackedNpcZoneMatch,
  getTrackedNpcZoneMatchRank
} from './npcZoneMatching.js';

test('normalizes articles, spacing, punctuation, and abbreviated directions', () => {
  assert.equal(getTrackedNpcZoneMatchRank('  THE Field of Bone ', 'Field of Bone'), 1);
  assert.equal(getTrackedNpcZoneMatchRank('Shadow Spine', 'Shadowspine'), 2);
  assert.equal(getTrackedNpcZoneMatchRank('S. Ro', 'South Ro'), 1);
});

test('matches the reversed Cabilis direction emitted by the EQ client', () => {
  assert.equal(getTrackedNpcZoneMatchRank('Cabilis West', 'West Cabilis'), 3);
});

test('permits a unique one-character zone typo without accepting loose prefixes', () => {
  assert.equal(getTrackedNpcZoneMatchRank('Kael Drakkal', 'Kael Drakkel'), 4);
  assert.equal(getTrackedNpcZoneMatchRank('West', 'West Freeport'), null);
  assert.equal(getTrackedNpcZoneMatchRank('Freeport', 'West Freeport'), null);
});

test('selects the correct duplicate Zhevan definition from its source zone', () => {
  const definitions = [
    { id: 'kunark', zoneName: 'West Cabilis' },
    { id: 'classic', zoneName: 'West Freeport' }
  ];

  assert.equal(findUniqueBestTrackedNpcZoneMatch('Cabilis West', definitions)?.id, 'kunark');
  assert.equal(findUniqueBestTrackedNpcZoneMatch('West Freeport', definitions)?.id, 'classic');
  assert.equal(findUniqueBestTrackedNpcZoneMatch('an Arena (PvP) area', definitions), null);
});

test('refuses to guess when the best normalized zone match is still ambiguous', () => {
  const definitions = [
    { id: 'first', zoneName: 'West Cabilis' },
    { id: 'second', zoneName: '  WEST   CABILIS  ' }
  ];

  assert.equal(findUniqueBestTrackedNpcZoneMatch('West Cabilis', definitions), null);
});
