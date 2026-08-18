import assert from 'node:assert/strict';
import test from 'node:test';

import { GuildRole } from '@prisma/client';

import {
  BOSS_IMAGE_MAX_BYTES,
  BossLibraryError,
  buildBossGroupOrderUpdates,
  buildUniqueBossSlug,
  detectBossImageMime,
  prepareBossImageUpload,
  getBossLibraryPermissions,
  serializeBossLibraryGuild
} from './bossLibraryService.js';

test('guild leaders and officers have full boss library access without a contributor flag', () => {
  for (const role of [GuildRole.LEADER, GuildRole.OFFICER]) {
    assert.deepEqual(getBossLibraryPermissions(role, false), {
      role,
      isContributor: false,
      canEdit: true,
      canDelete: true,
      canManageContributors: true
    });
  }
});

test('a contributor can edit without receiving officer-only destructive access', () => {
  for (const role of [
    GuildRole.RAID_LEADER,
    GuildRole.MEMBER,
    GuildRole.RECRUIT,
    GuildRole.FRIENDS_FAMILY
  ]) {
    assert.deepEqual(getBossLibraryPermissions(role, true), {
      role,
      isContributor: true,
      canEdit: true,
      canDelete: false,
      canManageContributors: false
    });
  }
});

test('an ordinary guild member receives read-only boss library access', () => {
  assert.deepEqual(getBossLibraryPermissions(GuildRole.MEMBER, false), {
    role: GuildRole.MEMBER,
    isContributor: false,
    canEdit: false,
    canDelete: false,
    canManageContributors: false
  });
});

test('boss library guild data includes the canonical guild slug', () => {
  assert.deepEqual(
    serializeBossLibraryGuild({ id: 'guild-1', name: 'Resurgence', slug: 'resurgence' }),
    { id: 'guild-1', name: 'Resurgence', slug: 'resurgence' }
  );
});

test('boss slugs stay readable, deterministic, and unique within a guild', () => {
  assert.equal(buildUniqueBossSlug("Grand Magus D'Nor", []), 'grand-magus-d-nor');
  assert.equal(
    buildUniqueBossSlug('Braag the Morphling', ['braag-the-morphling']),
    'braag-the-morphling-2'
  );
  assert.equal(buildUniqueBossSlug('***', []), 'boss');
});

test('boss slug suffixes remain within the database column limit', () => {
  const name = 'A'.repeat(250);
  const first = buildUniqueBossSlug(name, []);
  const second = buildUniqueBossSlug(name, [first]);

  assert.equal(first.length, 191);
  assert.equal(second.length, 191);
  assert.match(second, /-2$/);
});

test('boss group ordering produces contiguous sort positions', () => {
  assert.deepEqual(buildBossGroupOrderUpdates(['group-a', 'group-b'], ['group-b', 'group-a']), [
    { id: 'group-b', sortOrder: 0 },
    { id: 'group-a', sortOrder: 1 }
  ]);
});

test('boss group ordering rejects missing, duplicate, and foreign group ids', () => {
  for (const groupIds of [
    ['group-a'],
    ['group-a', 'group-a'],
    ['group-a', 'group-c']
  ]) {
    assert.throws(
      () => buildBossGroupOrderUpdates(['group-a', 'group-b'], groupIds),
      (error) =>
        error instanceof BossLibraryError &&
        error.statusCode === 400 &&
        error.message === 'The group order must include every boss group exactly once.'
    );
  }
});

test('boss image detection accepts the supported formats by file signature', () => {
  assert.equal(
    detectBossImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png'
  );
  assert.equal(detectBossImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(detectBossImageMime(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(detectBossImageMime(Buffer.from('RIFF1234WEBP')), 'image/webp');
});

test('boss image preparation rejects empty, oversized, and unsupported uploads', () => {
  for (const [data, message, statusCode] of [
    [Buffer.alloc(0), 'Choose a non-empty image file.', 400],
    [Buffer.alloc(BOSS_IMAGE_MAX_BYTES + 1), 'Boss images must be 2 MB or smaller.', 413],
    [Buffer.from('not an image'), 'Use a PNG, JPEG, GIF, or WebP image.', 400]
  ] as const) {
    assert.throws(
      () => prepareBossImageUpload(data),
      (error) =>
        error instanceof BossLibraryError &&
        error.statusCode === statusCode &&
        error.message === message
    );
  }
});

test('boss image preparation ignores a spoofed content type and sanitizes the filename', () => {
  const upload = prepareBossImageUpload(
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    '../folder/boss\u0000portrait.png'
  );
  assert.equal(upload.mimeType, 'image/jpeg');
  assert.equal(upload.fileName, 'bossportrait.png');
});
