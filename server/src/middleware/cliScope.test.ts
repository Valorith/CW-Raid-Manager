import assert from 'node:assert/strict';
import test from 'node:test';

import { cliTokenCanAccessPath } from './cliScope.js';

test('CLI token scope only allows explicit CLI-safe API paths', () => {
  assert.equal(cliTokenCanAccessPath('/api/auth/me', undefined), true);
  assert.equal(cliTokenCanAccessPath('/api/auth/me?fresh=true', []), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/logout', [], 'POST'), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/sessions', []), true);
  assert.equal(cliTokenCanAccessPath('/api/cli/auth/sessions/session-1', [], 'DELETE'), true);

  assert.equal(cliTokenCanAccessPath('/api/test-manager/changes', ['test-manager']), true);
  assert.equal(
    cliTokenCanAccessPath('/api/test-manager/changes?status=ACTIVE', ['test-manager']),
    true
  );
  assert.equal(cliTokenCanAccessPath('/api/test-manager/changes', []), false);

  assert.equal(cliTokenCanAccessPath('/api/admin/webhook-inbox', ['webhook-inbox']), true);
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhook-inbox/message-1?includeArchived=true', [
      'webhook-inbox'
    ]),
    true
  );
  assert.equal(cliTokenCanAccessPath('/api/admin/webhook-labels', ['webhook-inbox']), true);
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhooks/hook-1/test', ['webhook-inbox'], 'POST'),
    true
  );
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhook-inbox/message-1', [
      'test-manager',
      'webhook-inbox'
    ]),
    true
  );
  assert.equal(cliTokenCanAccessPath('/api/admin/webhooks', ['webhook-inbox'], 'POST'), false);
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhook-inbox/message-1', ['test-manager']),
    false
  );
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhook-labels', ['test-manager']),
    false
  );
  assert.equal(
    cliTokenCanAccessPath('/api/admin/webhooks/hook-1/test', ['test-manager'], 'POST'),
    false
  );
  assert.equal(cliTokenCanAccessPath('/api/admin/webhook-inbox', []), false);

  assert.equal(cliTokenCanAccessPath('/api/cli/auth/device/ABCD-1234', ['test-manager']), false);
  assert.equal(
    cliTokenCanAccessPath('/api/cli/auth/device/ABCD-1234/approve', ['test-manager']),
    false
  );
  assert.equal(cliTokenCanAccessPath('/api/raids', ['test-manager']), false);
});
