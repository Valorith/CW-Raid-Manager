// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { parseNpcKillEvents, parseNpcKills } from '../services/npcKillParser.js';

test('parses the recent outlier boss names without confusing the boss pet', () => {
  const content = [
    '[Sun Aug 23 20:50:00 2026] You have entered The Field of Bone.',
    '[Sun Aug 23 20:56:54 2026] Vynoissu the Undying has been slain by Valgor!',
    '[Sun Aug 23 22:46:11 2026] You have entered Lake of Ill Omen.',
    '[Sun Aug 23 22:54:26 2026] Grand Magus D`Nor`s pet has been slain by Dagara!',
    '[Sun Aug 23 23:02:02 2026] Grand Magus D`Nor has been slain by Dirt!'
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
        killerName: 'Dagara',
        zoneName: 'Lake of Ill Omen'
      },
      {
        npcName: 'Grand Magus D`Nor',
        killerName: 'Dirt',
        zoneName: 'Lake of Ill Omen'
      }
    ]
  );
});

test('replays the actual Epic 2.0 boss sequence from the August 17 raid', () => {
  const content = [
    '[Mon Aug 17 22:28:13 2026] You have entered The Iceclad Ocean.',
    '[Mon Aug 17 22:32:41 2026] Silvlit Xor has been slain by Laern!',
    '[Mon Aug 17 22:41:22 2026] You have entered Dragon Necropolis.',
    '[Mon Aug 17 22:58:23 2026] The Dracoliche of Hsagra has been slain by Dagara!',
    '[Mon Aug 17 23:02:27 2026] You have entered The Dreadlands.',
    '[Mon Aug 17 23:19:34 2026] Durunal the Cursebearer has been slain by Kasare!'
  ].join('\n');

  const kills = parseNpcKillEvents(content);

  assert.deepEqual(
    kills.map((kill) => ({
      npcName: kill.npcName,
      killerName: kill.killerName,
      zoneName: kill.zoneName,
      timestamp: kill.timestamp?.toISOString()
    })),
    [
      {
        npcName: 'Silvlit Xor',
        killerName: 'Laern',
        zoneName: 'The Iceclad Ocean',
        timestamp: '2026-08-18T02:32:41.000Z'
      },
      {
        npcName: 'The Dracoliche of Hsagra',
        killerName: 'Dagara',
        zoneName: 'Dragon Necropolis',
        timestamp: '2026-08-18T02:58:23.000Z'
      },
      {
        npcName: 'Durunal the Cursebearer',
        killerName: 'Kasare',
        zoneName: 'The Dreadlands',
        timestamp: '2026-08-18T03:19:34.000Z'
      }
    ]
  );
});

test('accepts the alternate player-kill phrasing observed for Epic 2.0 bosses', () => {
  const content = [
    '[Mon Dec 01 21:47:24 2025] You have slain Silvlit Xor!',
    '[Sun Apr 19 21:49:47 2026] You have slain The Dracoliche of Hsagra!'
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => ({
      npcName: kill.npcName,
      killerName: kill.killerName
    })),
    [
      { npcName: 'Silvlit Xor', killerName: 'You' },
      { npcName: 'The Dracoliche of Hsagra', killerName: 'You' }
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

test('awards Blacksmith Yragbor credit from the actual successful encounter completion signal', () => {
  const completionLine =
    '[Sun Aug 23 22:39:40 2026] Blacksmith Yragbor is pulled away by an unseen force.';
  const content = [
    '[Sun Aug 23 22:18:07 2026] You have entered Frontier Mountains.',
    '[Sun Aug 23 22:24:56 2026] Blacksmith Yragbor says \'You have made a mistake. They will come for you!\'',
    '[Sun Aug 23 22:37:21 2026] Xador has been slain by Zurkon!',
    '[Sun Aug 23 22:39:40 2026] Toltor has been slain by Plagued!',
    completionLine,
    '[Sun Aug 23 22:40:05 2026] Zephyr strikes a giant chest for 92 points of damage.'
  ].join('\n');

  const kills = parseNpcKillEvents(content);
  const yragborCredit = kills.find((kill) => kill.npcName === 'Blacksmith Yragbor');

  assert.equal(yragborCredit?.timestamp?.toISOString(), '2026-08-24T02:39:40.000Z');
  assert.equal(yragborCredit?.killerName, null);
  assert.equal(yragborCredit?.zoneName, 'Frontier Mountains');
  assert.equal(yragborCredit?.rawLine, completionLine);
});

test('does not treat generic forced despawns as encounter kill credit', () => {
  const content =
    '[Sun Aug 23 22:39:40 2026] An unrelated NPC is pulled away by an unseen force.';

  assert.deepEqual(parseNpcKillEvents(content), []);
});
