// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import {
  createNpcKillParserState,
  extractLastIdentifyingZoneFromLog,
  parseNpcKillEvents,
  parseNpcKills
} from '../services/npcKillParser.js';

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

test('retains the source zone through the generic Arena name used by raid instances', () => {
  const kunarkContent = [
    '[Sun Aug 09 22:06:13 2026] You have entered Cabilis West.',
    '[Sun Aug 09 22:06:51 2026] You have entered an Arena (PvP) area.',
    '[Sun Aug 09 22:12:19 2026] You have entered an Arena (PvP) area.',
    '[Sun Aug 09 22:24:37 2026] Grand Arcanist Zhevan has been slain by Togg!'
  ].join('\n');
  const classicChunk = [
    '[Sun Nov 23 23:25:49 2025] You have entered an Arena (PvP) area.',
    '[Sun Nov 23 23:36:51 2025] Grand Arcanist Zhevan has been slain by Plagued!'
  ].join('\n');

  assert.equal(parseNpcKillEvents(kunarkContent)[0]?.zoneName, 'Cabilis West');
  assert.equal(
    parseNpcKillEvents(classicChunk, { initialZoneName: 'West Freeport' })[0]?.zoneName,
    'West Freeport'
  );
});

test('keeps the live monitor source zone when a chunk contains only generic Arena entries', () => {
  const sourceAndArena = [
    '[Mon Aug 03 21:58:08 2026] You have entered Cabilis West.',
    '[Mon Aug 03 22:01:05 2026] You have entered an Arena (PvP) area.'
  ].join('\n');
  const arenaOnly = '[Mon Aug 03 22:03:37 2026] You have entered an Arena (PvP) area.';

  assert.equal(extractLastIdentifyingZoneFromLog(sourceAndArena), 'Cabilis West');
  assert.equal(extractLastIdentifyingZoneFromLog(arenaOnly), null);
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
    "[Sun Aug 23 22:24:56 2026] Blacksmith Yragbor says 'You have made a mistake. They will come for you!'",
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
  const content = '[Sun Aug 23 22:39:40 2026] An unrelated NPC is pulled away by an unseen force.';

  assert.deepEqual(parseNpcKillEvents(content), []);
});

test('parses standard death credit for every ordinary Classic Ancients encounter', () => {
  const content = [
    '[Mon Aug 24 20:00:00 2026] You have entered West Freeport.',
    '[Mon Aug 24 20:01:00 2026] Grand Arcanist Zhevan has been slain by Zurkon!',
    '[Mon Aug 24 20:02:00 2026] You have entered Toxxulia Forest.',
    '[Mon Aug 24 20:03:00 2026] Eenton the Transcended has been slain by Laern!',
    '[Mon Aug 24 20:04:00 2026] You have entered East Karana.',
    '[Mon Aug 24 20:05:00 2026] Knight Templar Olav has been slain by Dagara!',
    '[Mon Aug 24 20:06:00 2026] You have entered South Ro.',
    '[Mon Aug 24 20:07:00 2026] Hercleen the Ancient has been slain by Plagued!',
    '[Mon Aug 24 20:08:00 2026] You have entered East Commonlands.',
    '[Mon Aug 24 20:09:00 2026] Master Sergeant Slate has been slain by Laern!',
    '[Mon Aug 24 20:10:00 2026] You have entered The Feerrott.',
    '[Mon Aug 24 20:11:00 2026] Revenge of Cyndreela has been slain by Jober!',
    '[Mon Aug 24 20:12:00 2026] You have entered Lake Rathetear.',
    '[Mon Aug 24 20:13:00 2026] Megalodon has been slain by Plagued!',
    "[Mon Aug 24 20:14:00 2026] You have entered Erud's Crossing.",
    '[Mon Aug 24 20:15:00 2026] Ancient Willowisp has been slain by Mana!'
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => ({
      npcName: kill.npcName,
      zoneName: kill.zoneName
    })),
    [
      { npcName: 'Grand Arcanist Zhevan', zoneName: 'West Freeport' },
      { npcName: 'Eenton the Transcended', zoneName: 'Toxxulia Forest' },
      { npcName: 'Knight Templar Olav', zoneName: 'East Karana' },
      { npcName: 'Hercleen the Ancient', zoneName: 'South Ro' },
      { npcName: 'Master Sergeant Slate', zoneName: 'East Commonlands' },
      { npcName: 'Revenge of Cyndreela', zoneName: 'The Feerrott' },
      { npcName: 'Megalodon', zoneName: 'Lake Rathetear' },
      { npcName: 'Ancient Willowisp', zoneName: "Erud's Crossing" }
    ]
  );
});

test('credits Classic Braag from the final shout instead of the intermediate morph death', () => {
  const completionLine =
    "[Sun Nov 30 22:26:13 2025] Braag the Morphling shouts 'Until next time...'";
  const content = [
    '[Sun Nov 30 21:44:41 2025] You have entered Shadow Spine.',
    '[Sun Nov 30 22:20:43 2025] You have slain Braag the Morphling !',
    "[Sun Nov 30 22:20:56 2025] Braag the Morphling shouts 'Well that was fun! Shall we begin?'",
    completionLine,
    '[Sun Nov 30 22:26:45 2025] 1) [shadowspine] Guise of the Inferno | Status: Pending | NPC: an ancient chest'
  ].join('\n');

  const braagKills = parseNpcKillEvents(content).filter(
    (kill) => kill.npcName === 'Braag the Morphling'
  );

  assert.deepEqual(
    braagKills.map((kill) => ({
      timestamp: kill.timestamp?.toISOString(),
      killerName: kill.killerName,
      zoneName: kill.zoneName,
      rawLine: kill.rawLine
    })),
    [
      {
        timestamp: '2025-12-01T03:26:13.000Z',
        killerName: null,
        zoneName: 'Shadow Spine',
        rawLine: completionLine
      }
    ]
  );
});

test('parses the actual Enraged Twins completion when Corflunk departs out of log range', () => {
  const content = [
    '[Mon Aug 24 21:57:24 2026] You have entered Butcherblock Mountains.',
    "[Mon Aug 24 22:08:40 2026] Enraged Corflunk says 'Your destiny lies at the hands of the Greenbloods.'",
    '[Mon Aug 24 22:08:46 2026] Enraged Zarchoomi has been slain by Laern!',
    '[Mon Aug 24 22:08:46 2026] You have gained (40838) raid experience! (0.076%)',
    '[Mon Aug 24 22:08:50 2026] Dagara hit an ancient chest for 170 points of non-melee damage.'
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => ({
      npcName: kill.npcName,
      killerName: kill.killerName,
      zoneName: kill.zoneName,
      timestamp: kill.timestamp?.toISOString()
    })),
    [
      {
        npcName: 'Enraged Corflunk',
        killerName: null,
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:08:40.000Z'
      },
      {
        npcName: 'Enraged Zarchoomi',
        killerName: 'Laern',
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:08:46.000Z'
      }
    ]
  );
});

test('replays both actual Enraged Twins completions from the August 24 raid', () => {
  const content = [
    '[Mon Aug 24 21:57:24 2026] You have entered Butcherblock Mountains.',
    "[Mon Aug 24 22:08:40 2026] Enraged Corflunk says 'Your destiny lies at the hands of the Greenbloods.'",
    '[Mon Aug 24 22:08:46 2026] Enraged Zarchoomi has been slain by Laern!',
    '[Mon Aug 24 22:08:50 2026] Dagara hit an ancient chest for 170 points of non-melee damage.',
    '[Mon Aug 24 22:10:01 2026] You have entered Butcherblock Mountains.',
    "[Mon Aug 24 22:15:42 2026] Enraged Corflunk says 'Your destiny lies at the hands of the Greenbloods.'",
    '[Mon Aug 24 22:15:47 2026] Enraged Zarchoomi has been slain by Dirt!',
    '[Mon Aug 24 22:15:51 2026] You kick an ancient chest for 78 points of damage.'
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => ({
      npcName: kill.npcName,
      killerName: kill.killerName,
      zoneName: kill.zoneName,
      timestamp: kill.timestamp?.toISOString()
    })),
    [
      {
        npcName: 'Enraged Corflunk',
        killerName: null,
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:08:40.000Z'
      },
      {
        npcName: 'Enraged Zarchoomi',
        killerName: 'Laern',
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:08:46.000Z'
      },
      {
        npcName: 'Enraged Corflunk',
        killerName: null,
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:15:42.000Z'
      },
      {
        npcName: 'Enraged Zarchoomi',
        killerName: 'Dirt',
        zoneName: 'Butcherblock Mountains',
        timestamp: '2026-08-25T02:15:47.000Z'
      }
    ]
  );
});

const summarizeKill = (kill: ReturnType<typeof parseNpcKillEvents>[number]) => ({
  npcName: kill.npcName,
  killerName: kill.killerName,
  zoneName: kill.zoneName,
  inferredFromLoot: Boolean(kill.inferredFromLoot),
  timestamp: kill.timestamp?.toISOString()
});

test('infers the August 30 D`Nor kill that died outside death-message range', () => {
  const content = [
    '[Sun Aug 30 22:42:10 2026] You have entered Lake of Ill Omen.',
    '[Sun Aug 30 23:02:39 2026] Grand Magus D`Nor begins to cast a spell.',
    '[Sun Aug 30 23:02:39 2026] Your target is too far away, get closer!',
    '[Sun Aug 30 23:02:44 2026] You have gained (37931) raid experience! (0.071%)',
    '[Sun Aug 30 23:03:36 2026] [-----------Pending Raid Loot-----------]',
    "[Sun Aug 30 23:03:36 2026] 1) [lakeofillomen] Herald's Sleeves\t | Status: Pending\t | NPC: Grand Magus D`Nor ",
    '[Sun Aug 30 23:03:36 2026] 2) [lakeofillomen] Gauntlets of Spite\t | Status: Pending\t | NPC: Grand Magus D`Nor  ',
    '[Sun Aug 30 23:03:36 2026] [-------------------------------------------------]',
    "[Sun Aug 30 23:07:40 2026] 1) [lakeofillomen] Herald's Sleeves\t | Status: Pending\t | NPC: Grand Magus D`Nor ",
    '[Sun Aug 30 23:15:35 2026] You have entered The Dreadlands.'
  ].join('\n');

  const kills = parseNpcKillEvents(content);

  assert.deepEqual(kills.map(summarizeKill), [
    {
      npcName: 'Grand Magus D`Nor',
      killerName: null,
      zoneName: 'Lake of Ill Omen',
      inferredFromLoot: true,
      timestamp: '2026-08-31T03:03:36.000Z'
    }
  ]);
  assert.match(kills[0]?.rawLine ?? '', /NPC: Grand Magus D`Nor/);
});

test('infers the April 12 Silvlit Xor kill that died out of death-message range', () => {
  const content = [
    '[Sun Apr 12 20:59:02 2026] You have entered The Iceclad Ocean.',
    '[Sun Apr 12 21:09:12 2026] Silvlit Xor has taken 55 damage from your Venomous Blast.',
    '[Sun Apr 12 21:09:14 2026] Your Venomous Blast spell has worn off of Silvlit Xor.',
    '[Sun Apr 12 21:09:14 2026] You have gained (40195) raid experience! (0.075%)',
    '[Sun Apr 12 21:09:48 2026] | 1) [iceclad] Gift of the Sphinx\t | Status: Pending | NPC: Silvlit Xor',
    '[Sun Apr 12 21:20:02 2026] Valgor tells the raid, \'next\''
  ].join('\n');

  const [kill, ...rest] = parseNpcKillEvents(content, { state: createNpcKillParserState() });

  assert.equal(rest.length, 0);
  assert.equal(kill?.npcName, 'Silvlit Xor');
  assert.equal(kill?.inferredFromLoot, true);
  assert.equal(kill?.zoneName, 'The Iceclad Ocean');
});

test('attributes a late loot listing to the death line logged before it', () => {
  const content = [
    '[Mon Mar 02 21:47:19 2026] Lord Koi`Doken has been slain by Ribbet!',
    '[Mon Mar 02 22:02:15 2026] 1) [templeveeshan] Siren Song, Dagger of the Sea\t | Status: Pending\t | NPC: Lord Koi`Doken ',
    '[Mon Mar 02 22:20:00 2026] Valgor tells the raid, \'next\''
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => [kill.npcName, kill.killerName]),
    [['Lord Koi`Doken', 'Ribbet']]
  );
});

test('lets a death line logged after an early loot listing replace the inference', () => {
  const content = [
    '[Mon Feb 09 22:36:54 2026] 1) [karnor] Gnarled Staff\t | Status: Pending\t | NPC: Venril Sathir ',
    '[Mon Feb 09 22:39:40 2026] Venril Sathir has been slain by Zephyr!',
    '[Mon Feb 09 22:50:00 2026] Valgor tells the raid, \'next\''
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => [kill.npcName, kill.killerName]),
    [['Venril Sathir', 'Zephyr']]
  );
});

test('matches title-less loot names to the titled death line for the same kill', () => {
  const content = [
    '[Mon Dec 29 21:32:40 2025] Prince Thirneg the Petulant has been slain by Dirt!',
    '[Mon Dec 29 21:33:14 2025] 1) [growthplane] Thirneg\'s Crown\t | Status: Pending\t | NPC: Prince Thirneg '
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => [kill.npcName, Boolean(kill.inferredFromLoot)]),
    [['Prince Thirneg the Petulant', false]]
  );
});

test('does not infer new kills when pending loot is listed again later in the raid', () => {
  const content = [
    '[Sun Aug 23 21:19:20 2026] Rotrage has been slain by Valgor!',
    "[Sun Aug 23 21:19:24 2026] 1) [emeraldjungle] Herald's Boots\t | Status: Pending\t | NPC: Rotrage ",
    "[Sun Aug 23 22:10:00 2026] 1) [emeraldjungle] Herald's Boots\t | Status: Pending\t | NPC: Rotrage ",
    "[Sun Aug 23 23:30:00 2026] 1) [emeraldjungle] Herald's Boots\t | Status: Pending\t | NPC: Rotrage "
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => kill.killerName),
    ['Valgor']
  );
});

test('confirms a live-monitor loot inference in a later chunk once the window passes', () => {
  const state = createNpcKillParserState();
  const firstChunk = [
    '[Sun Aug 30 22:42:10 2026] You have entered Lake of Ill Omen.',
    '[Sun Aug 30 23:02:39 2026] Grand Magus D`Nor begins to cast a spell.'
  ].join('\n');
  // The combat evidence is in the previous chunk, so it must carry across the chunk boundary.
  const secondChunk =
    '[Sun Aug 30 23:03:36 2026] 1) [lakeofillomen] Gauntlets of Spite\t | Status: Pending\t | NPC: Grand Magus D`Nor ';
  const thirdChunk = '[Sun Aug 30 23:10:00 2026] You feel replenished.';
  const fourthChunk = '[Sun Aug 30 23:14:00 2026] You feel replenished.';

  assert.deepEqual(parseNpcKillEvents(firstChunk, { state }), []);
  // The live monitor carries the zone forward through initialZoneName.
  assert.deepEqual(
    parseNpcKillEvents(secondChunk, { state, initialZoneName: 'Lake of Ill Omen' }),
    []
  );
  assert.deepEqual(parseNpcKillEvents(thirdChunk, { state }), []);
  assert.deepEqual(parseNpcKillEvents(fourthChunk, { state }).map(summarizeKill), [
    {
      npcName: 'Grand Magus D`Nor',
      killerName: null,
      zoneName: 'Lake of Ill Omen',
      inferredFromLoot: true,
      timestamp: '2026-08-31T03:03:36.000Z'
    }
  ]);
});

test('drops a pending live inference when the death line arrives in a later chunk', () => {
  const state = createNpcKillParserState();
  const pending = parseNpcKillEvents(
    [
      '[Mon Feb 09 22:36:40 2026] You try to slash Venril Sathir, but miss!',
      '[Mon Feb 09 22:36:54 2026] 1) [karnor] Gnarled Staff\t | Status: Pending\t | NPC: Venril Sathir '
    ].join('\n'),
    { state }
  );
  assert.deepEqual(pending, []);
  assert.equal(state.pendingLootKills.length, 1);

  const kills = parseNpcKillEvents(
    [
      '[Mon Feb 09 22:39:40 2026] Venril Sathir has been slain by Zephyr!',
      '[Mon Feb 09 22:55:00 2026] You feel replenished.'
    ].join('\n'),
    { state }
  );

  assert.deepEqual(
    kills.map((kill) => [kill.npcName, kill.killerName]),
    [['Venril Sathir', 'Zephyr']]
  );
});

test('reports one kill when an out-of-range kill keeps being re-listed across live chunks', () => {
  const state = createNpcKillParserState();
  const listing = (time: string, item: string) =>
    `[Sun Aug 30 ${time} 2026] 1) [lakeofillomen] ${item}\t | Status: Pending\t | NPC: Grand Magus D\`Nor `;
  const chunks = [
    [
      '[Sun Aug 30 22:42:10 2026] You have entered Lake of Ill Omen.',
      '[Sun Aug 30 23:02:39 2026] Grand Magus D`Nor begins to cast a spell.',
      listing('23:03:36', 'Gauntlets of Spite')
    ],
    [listing('23:04:10', 'Gauntlets of Spite'), listing('23:04:10', "Herald's Sleeves")],
    ['[Sun Aug 30 23:14:00 2026] You feel replenished.'],
    // Re-listings and a newly shown item after the kill was confirmed belong to the same kill.
    [listing('23:16:00', 'Gauntlets of Spite'), listing('23:30:00', 'Essence of D`Nor')],
    [listing('23:55:00', 'Gauntlets of Spite'), '[Mon Aug 31 01:00:00 2026] You feel replenished.']
  ];

  const kills = chunks.flatMap((lines) => parseNpcKillEvents(lines.join('\n'), { state }));

  assert.deepEqual(
    kills.map((kill) => [kill.npcName, kill.timestamp?.toISOString()]),
    [['Grand Magus D`Nor', '2026-08-31T03:03:36.000Z']]
  );
});

test('does not infer a kill from loot a character never saw fought, such as after a swap', () => {
  const content = [
    '[Sun Aug 30 23:40:00 2026] You have entered Lake of Ill Omen.',
    '[Sun Aug 30 23:41:00 2026] a goblin has been slain by Dirt!',
    '[Sun Aug 30 23:41:05 2026] 1) [lakeofillomen] Gauntlets of Spite\t | Status: Pending\t | NPC: Grand Magus D`Nor '
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => kill.npcName),
    ['a goblin']
  );
});

test('does not infer a second kill from a first listing printed long after the logged death', () => {
  const content = [
    '[Sun Aug 23 21:19:20 2026] Rotrage has been slain by Valgor!',
    '[Sun Aug 23 21:40:00 2026] You have entered Firiona Vie.',
    "[Sun Aug 23 21:55:00 2026] 1) [emeraldjungle] Herald's Boots\t | Status: Pending\t | NPC: Rotrage "
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => [kill.npcName, kill.killerName]),
    [['Rotrage', 'Valgor']]
  );
});

test('keeps different NPCs that share a base name apart', () => {
  const content = [
    '[Sun Aug 30 21:00:00 2026] an Avatar of the Sky has been slain by Dirt!',
    '[Sun Aug 30 21:08:00 2026] Dirt hits an Avatar of the Storm for 300 points of damage.',
    '[Sun Aug 30 21:10:00 2026] 1) [airplane] Storm Shard\t | Status: Pending\t | NPC: an Avatar of the Storm '
  ].join('\n');

  assert.deepEqual(
    parseNpcKillEvents(content).map((kill) => [kill.npcName, Boolean(kill.inferredFromLoot)]),
    [
      ['an Avatar of the Sky', false],
      ['an Avatar of the Storm', true]
    ]
  );
});
