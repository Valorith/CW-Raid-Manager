// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { bossSharePath, bossShareUrl, copyBossShareLink } from './bossLinks.js';

test('builds the compact canonical boss share path', () => {
  assert.equal(
    bossSharePath('clumsy-s-world', 'blacksmith-yragbor'),
    '/b/clumsy-s-world/blacksmith-yragbor'
  );
});

test('builds the exact absolute URL copied to the clipboard', () => {
  assert.equal(
    bossShareUrl('https://nexus.clumsysworld.com', 'clumsy-s-world', 'grand-magus-d-nor'),
    'https://nexus.clumsysworld.com/b/clumsy-s-world/grand-magus-d-nor'
  );
});

test('passes the canonical compact URL to the clipboard writer', async () => {
  let copied = '';
  const url = await copyBossShareLink(
    'https://nexus.clumsysworld.com',
    'clumsy-world',
    'blacksmith-yragbor',
    async (value) => {
      copied = value;
    }
  );

  assert.equal(url, 'https://nexus.clumsysworld.com/b/clumsy-world/blacksmith-yragbor');
  assert.equal(copied, url);
});
