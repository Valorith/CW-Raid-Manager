import assert from 'node:assert/strict';
import test from 'node:test';

import { cliTokenCanAccessPath } from './cliScope.js';

const raidPaths = [
  '/api/raids',
  '/api/raids/guild/guild-1',
  '/api/raids/raid-1',
  '/api/raids/raid-1/signups/me',
  '/api/raids/raid-1/signups/signup-1',
  '/api/raids/raid-1/start',
  '/api/raids/raid-1/end',
  '/api/raids/raid-1/npc-kills',
  '/api/raids/raid-1/loot',
  '/api/raids/raid-1/loot/loot-1',
  '/api/raids/raid-1/loot-council-state',
  '/api/raids/raid-1/log-monitor',
  '/api/raids/raid-1/log-monitor/start',
  '/api/raids/raid-1/log-monitor/heartbeat',
  '/api/raids/raid-1/log-monitor/stop',
  '/api/attendance',
  '/api/attendance/raid/raid-1',
  '/api/attendance/raid/raid-1/upload',
  '/api/attendance/event/event-1',
  '/api/attendance/user/recent?limit=10',
  '/api/guilds/guild-1/loot-lists',
  '/api/guilds/guild-1/loot-lists/summary',
  '/api/guilds/guild-1/loot-lists/entry-1',
  '/api/guilds/guild-1/loot-settings'
];

test('raids scope allows raid, attendance, and guild loot paths independently of other scopes', () => {
  for (const path of raidPaths) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(cliTokenCanAccessPath(path, ['raids'], method), true, `${method} ${path}`);
      for (const scopes of [
        undefined,
        [],
        ['test-manager'],
        ['webhook-inbox'],
        ['test-manager', 'webhook-inbox']
      ]) {
        assert.equal(
          cliTokenCanAccessPath(path, scopes, method),
          false,
          `${method} ${path} without raids`
        );
      }
    }
  }
});

test('raids scope grants only the guild collection read for guild resolution', () => {
  assert.equal(cliTokenCanAccessPath('/api/guilds', ['raids']), true);
  assert.equal(cliTokenCanAccessPath('/api/guilds?search=raid', ['raids'], 'get'), true);
  assert.equal(cliTokenCanAccessPath('/api/guilds', ['test-manager', 'webhook-inbox']), false);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    assert.equal(cliTokenCanAccessPath('/api/guilds', ['raids'], method), false);
  }
});

test('raids scope cannot reach other guild, admin, webhook, or prefix-lookalike paths', () => {
  const denied = [
    '/api/raids-admin',
    '/api/attendance-export',
    '/api/guilds/guild-1',
    '/api/guilds/guild-1/members',
    '/api/guilds/guild-1/webhooks',
    '/api/guilds/guild-1/bank',
    '/api/guilds/guild-1/loot-settings/admin',
    '/api/guilds/guild-1/loot-settings-backup',
    '/api/guilds/guild-1/loot-lists-admin',
    '/api/guilds/guild-1/loot-lists/entry-1/admin',
    '/api/guilds//loot-settings',
    '/api/characters',
    '/api/account',
    '/api/user/recent-loot',
    '/api/test-manager/changes',
    '/api/admin/users',
    '/api/admin/webhooks',
    '/api/admin/webhooks/hook-1/test',
    '/api/admin/webhook-inbox',
    '/api/admin/webhook-labels',
    '/api/webhook-inbox/hook-1',
    '/api/cli/auth/device/ABCD-1234/approve'
  ];
  for (const path of denied) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(cliTokenCanAccessPath(path, ['raids'], method), false, `${method} ${path}`);
    }
  }
  assert.equal(cliTokenCanAccessPath('/api/admin/webhook-inbox', ['raids', 'webhook-inbox']), true);
  assert.equal(cliTokenCanAccessPath('/api/test-manager/changes', ['raids', 'test-manager']), true);
});

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
