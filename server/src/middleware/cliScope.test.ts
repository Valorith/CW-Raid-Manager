import assert from 'node:assert/strict';
import test from 'node:test';

import { cliTokenCanAccessPath } from './cliScope.js';

test('CLI token scope only allows explicit CLI-safe API paths', () => {
  assert.equal(cliTokenCanAccessPath('/api/auth/me', undefined), true);
  assert.equal(cliTokenCanAccessPath('/api/auth/me?fresh=true', []), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/logout', []), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/sessions', []), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/sessions/session-1', []), true);

  assert.equal(cliTokenCanAccessPath('/api/test-manager/changes', ['test-manager']), true);
  assert.equal(
    cliTokenCanAccessPath('/api/test-manager/changes?status=ACTIVE', ['test-manager']),
    true
  );
  assert.equal(cliTokenCanAccessPath('/api/test-manager/changes', []), false);

  assert.equal(cliTokenCanAccessPath('/api/cli/auth/device/ABCD-1234', ['test-manager']), false);
  assert.equal(
    cliTokenCanAccessPath('/api/cli/auth/device/ABCD-1234/approve', ['test-manager']),
    false
  );
  assert.equal(cliTokenCanAccessPath('/api/raids', ['test-manager']), false);
});
