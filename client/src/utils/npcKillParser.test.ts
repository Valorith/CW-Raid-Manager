// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { parseNpcKillEvents, parseNpcKills } from '../services/npcKillParser.js';

test('parses the recent outlier boss names without confusing the boss pet', () => {
  const content = [
    '[Sun Aug 23 20:50:00 2026] You have entered The Field of Bone.',
    '[Sun Aug 23 20:56:54 2026] Vynoissu the Undying has been slain by Valgor!',
    '[Sun Aug 23 22:54:26 2026] Grand Magus D`Nor`s pet has been slain by Valgor!',
    '[Sun Aug 23 23:02:02 2026] You have slain Grand Magus D`Nor!'
  ].join('\n');

  const kills = parseNpcKillEvents(content);

  assert.deepEqual(
    kills.map((kill) => ({
      npcName: kill.npcName,
      killerName: kill.killerName,
      zoneName: kill.zoneName
    })),
    [
      {
        npcName: 'Vynoissu the Undying',
        killerName: 'Valgor',
        zoneName: 'The Field of Bone'
      },
      {
        npcName: 'Grand Magus D`Nor`s pet',
        killerName: 'Valgor',
        zoneName: 'The Field of Bone'
      },
      {
        npcName: 'Grand Magus D`Nor',
        killerName: 'You',
        zoneName: 'The Field of Bone'
      }
    ]
  );
});

test('replays the actual Sunday Warmaster kill that was later recovered manually', () => {
  const content = [
    '[Sun Aug 23 21:33:06 2026] You have entered Firiona Vie.',
    '[Sun Aug 23 21:41:51 2026] Warmaster Gorvol has been slain by Valgor!'
  ].join('\n');

  const [kill] = parseNpcKillEvents(content);

  assert.equal(kill?.npcName, 'Warmaster Gorvol');
  assert.equal(kill?.killerName, 'Valgor');
  assert.equal(kill?.zoneName, 'Firiona Vie');
  assert.equal(kill?.timestamp?.toISOString(), '2026-08-24T01:41:51.000Z');
});

test('carries the live monitor zone into a later chunk with no zone-entry line', () => {
  const content = '[Mon Aug 17 22:07:12 2026] Grand Arcanist Zhevan has been slain by Valgor!';

  const [kill] = parseNpcKillEvents(content, { initialZoneName: 'West Cabilis' });

  assert.equal(kill?.npcName, 'Grand Arcanist Zhevan');
  assert.equal(kill?.zoneName, 'West Cabilis');
});

test('a zone entry in the current chunk overrides the carried live-monitor zone', () => {
  const content = [
    '[Sun Aug 16 21:59:58 2026] You have entered Warsliks Wood.',
    '[Sun Aug 16 22:05:00 2026] Ikojaxl the Enforcer has been slain by Valgor!'
  ].join('\n');

  const [kill] = parseNpcKillEvents(content, { initialZoneName: 'The Field of Bone' });

  assert.equal(kill?.zoneName, 'Warsliks Wood');
});

test('preserves the raid-end grace window while carrying zone context', () => {
  const content = '[Mon Aug 17 23:05:00 2026] The Dracoliche of Hsagra has been slain by Valgor!';
  const kills = parseNpcKills(
    content,
    new Date('2026-08-17T20:00:00-04:00'),
    new Date('2026-08-17T23:00:00-04:00'),
    { endGraceMinutes: 10, initialZoneName: 'Dragon Necropolis' }
  );

  assert.equal(kills.length, 1);
  assert.equal(kills[0]?.zoneName, 'Dragon Necropolis');
});
