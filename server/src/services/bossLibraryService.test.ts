import assert from 'node:assert/strict';
import test from 'node:test';

import { GuildRole } from '@prisma/client';

import {
  BOSS_IMAGE_MAX_BYTES,
  BOSS_EDIT_LEASE_TTL_MS,
  BossLibraryError,
  buildBossEditLeaseExpiry,
  buildBossGroupOrderUpdates,
  buildUniqueBossSlug,
  describeBossUpdate,
  detectBossImageMime,
  formatBossCures,
  formatBossHeals,
  prepareBossImageUpload,
  getBossLibraryPermissions,
  serializeBossEditLease,
  serializeBossLibraryGuild
} from './bossLibraryService.js';

test('boss tracker backfill only selects canonicalized exact names with one definition', async () => {
  // @ts-expect-error Knex migrations are JavaScript modules outside the server TypeScript project.
  const migration = await import('../../knex/migrations/20260824120000_add_boss_respawn_tracker_links.js');
  const { buildObviousBossTrackerLinks, canonicalizeTrackerLinkName } = migration;
  assert.equal(canonicalizeTrackerLinkName(' Grand Magus D`Nor '), "grand magus d'nor");
  assert.equal(canonicalizeTrackerLinkName('Grand Magus D’Nor'), "grand magus d'nor");

  assert.deepEqual(
    buildObviousBossTrackerLinks(
      [
        { id: 'boss-unique', guildId: 'guild-1', name: 'Grand Magus D’Nor' },
        { id: 'boss-ambiguous', guildId: 'guild-1', name: 'Grand Arcanist Zhevan' },
        { id: 'boss-foreign', guildId: 'guild-2', name: 'Grand Magus D’Nor' }
      ],
      [
        { id: 'npc-unique', guildId: 'guild-1', npcName: 'Grand Magus D`Nor' },
        { id: 'npc-zhevan-a', guildId: 'guild-1', npcName: 'Grand Arcanist Zhevan' },
        { id: 'npc-zhevan-b', guildId: 'guild-1', npcName: 'Grand Arcanist Zhevan' }
      ]
    ),
    [{ bossId: 'boss-unique', npcDefinitionId: 'npc-unique' }]
  );
});

test('boss edit leases expire on a fixed two-minute window', () => {
  const now = new Date('2026-08-24T04:00:00.000Z');
  assert.equal(BOSS_EDIT_LEASE_TTL_MS, 120_000);
  assert.equal(buildBossEditLeaseExpiry(now).toISOString(), '2026-08-24T04:02:00.000Z');
});

test('boss edit lease serialization only reveals the token to its holder', () => {
  const lease = {
    bossId: 'boss-1',
    guildId: 'guild-1',
    userId: 'user-1',
    holderName: 'Editor One',
    token: '65fe659a-1f3b-457e-9cb2-fd4da334593b',
    mode: 'source',
    expiresAt: new Date('2026-08-24T04:02:00.000Z')
  };

  assert.deepEqual(serializeBossEditLease(lease, 'user-1'), {
    bossId: 'boss-1',
    holderName: 'Editor One',
    mode: 'source',
    expiresAt: '2026-08-24T04:02:00.000Z',
    isMine: true,
    token: lease.token
  });
  assert.deepEqual(serializeBossEditLease(lease, 'user-2'), {
    bossId: 'boss-1',
    holderName: 'Editor One',
    mode: 'source',
    expiresAt: '2026-08-24T04:02:00.000Z',
    isMine: false
  });
});

test('guild leaders and officers have full boss library access without a contributor flag', () => {
  for (const role of [GuildRole.LEADER, GuildRole.OFFICER]) {
    assert.deepEqual(getBossLibraryPermissions(role, false), {
      role,
      isContributor: false,
      canEdit: true,
      canSuggest: true,
      canDelete: true,
      canManageContributors: true,
      canManageTrackerLink: true
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
      canSuggest: true,
      canDelete: false,
      canManageContributors: false,
      canManageTrackerLink: false
    });
  }
});

test('an ordinary guild member receives read-only boss library access', () => {
  assert.deepEqual(getBossLibraryPermissions(GuildRole.MEMBER, false), {
    role: GuildRole.MEMBER,
    isContributor: false,
    canEdit: false,
    canSuggest: true,
    canDelete: false,
    canManageContributors: false,
    canManageTrackerLink: false
  });
});

test('boss cure summaries are concise and stable for audit history', () => {
  assert.equal(formatBossCures({ curse: true, poison: false, disease: true }), 'Curse, Disease');
  assert.equal(formatBossCures({ curse: false, poison: false, disease: false }), 'None');
  assert.equal(
    describeBossUpdate({ cures: { curse: false, poison: true, disease: false } }),
    'Updated cures (Poison)'
  );
  assert.equal(describeBossUpdate({ notes: 'new notes' }), 'Updated source notes');
  assert.equal(describeBossUpdate({ npcDefinitionId: 'npc-1' }), 'Updated respawn signal link');
});

test('boss heal summaries preserve the selected raid plan in audit history', () => {
  assert.equal(
    formatBossHeals({ raidHeals: true, cHealChainSize: 4 }),
    'Raid Heals, 4 Person CHeal Chain'
  );
  assert.equal(formatBossHeals({ raidHeals: false, cHealChainSize: 2 }), '2 Person CHeal Chain');
  assert.equal(formatBossHeals({ raidHeals: false, cHealChainSize: 0 }), 'None');
  assert.equal(formatBossHeals({ raidHeals: true, cHealChainSize: 0 }), 'Raid Heals');
  assert.equal(formatBossHeals({ raidHeals: false, cHealChainSize: 5 }), '5 Person CHeal Chain');
  assert.equal(
    describeBossUpdate({ heals: { raidHeals: true, cHealChainSize: 3 } }),
    'Updated heals (Raid Heals, 3 Person CHeal Chain)'
  );
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
  for (const groupIds of [['group-a'], ['group-a', 'group-a'], ['group-a', 'group-c']]) {
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
