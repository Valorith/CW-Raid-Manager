// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { createNexusWebMcpTools, type NexusWebMcpDependencies } from '../webmcp/nexusTools.js';
import type { WebMcpTool } from '../webmcp/types.js';

function createDependencies(
  overrides: Partial<NexusWebMcpDependencies> = {}
): NexusWebMcpDependencies {
  return {
    getViewerGuilds: () => [{ id: 'guild-1', name: "Clumsy's World" }],
    fetchRaidsForGuild: async () => ({ raids: [] }),
    fetchRaid: async (raidId) => ({
      id: raidId,
      guildId: 'guild-1',
      name: 'Friday Raid',
      startTime: '2026-08-28T23:00:00.000Z',
      targetZones: ['Plane of Time'],
      targetBosses: ['Quarm'],
      notes: null,
      signups: []
    }),
    fetchMarketListingsPage: async () => ({
      listings: [],
      total: 0,
      sourceAvailable: true
    }),
    fetchGuildBossLibrary: async () => ({ groups: [] }),
    fetchGuildBoss: async (_guildId, bossId) => ({ boss: { id: bossId, name: 'Quarm' } }),
    navigateToBoss: async (guildId, bossId) => `/guilds/${guildId}/bosses/${bossId}`,
    now: () => new Date('2026-08-26T12:00:00.000Z'),
    ...overrides
  };
}

function getTool(dependencies: NexusWebMcpDependencies, name: string): WebMcpTool {
  const tool = createNexusWebMcpTools(dependencies).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Expected ${name} to be registered.`);
  }
  return tool;
}

test('defines five uniquely named, bounded initial tools', () => {
  const tools = createNexusWebMcpTools(createDependencies());

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'list_upcoming_raids',
      'get_raid_details',
      'search_market_listings',
      'find_bosses',
      'open_boss_notes'
    ]
  );
  assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
  assert.equal(tools.filter((tool) => tool.annotations?.readOnlyHint).length, 4);
  assert.ok(tools.every((tool) => tool.annotations?.untrustedContentHint));
});

test('publishes closed object schemas that match the runtime contract', () => {
  const tools = createNexusWebMcpTools(createDependencies());

  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 20);
  }

  const schemas = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
  assert.deepEqual(schemas.get_raid_details?.required, ['raidId']);
  assert.deepEqual(schemas.search_market_listings?.required, ['query']);
  assert.deepEqual(schemas.find_bosses?.required, ['query']);
  assert.deepEqual(schemas.open_boss_notes?.required, ['bossId']);
});

test('rejects non-object input for every tool before calling application dependencies', async () => {
  let dependencyCalls = 0;
  const dependencies = createDependencies({
    getViewerGuilds: () => {
      dependencyCalls += 1;
      return [{ id: 'guild-1', name: "Clumsy's World" }];
    },
    fetchRaidsForGuild: async () => {
      dependencyCalls += 1;
      return { raids: [] };
    },
    fetchRaid: async () => {
      dependencyCalls += 1;
      return createDependencies().fetchRaid('raid-1');
    },
    fetchMarketListingsPage: async () => {
      dependencyCalls += 1;
      return { listings: [], total: 0, sourceAvailable: true };
    },
    fetchGuildBossLibrary: async () => {
      dependencyCalls += 1;
      return { groups: [] };
    },
    fetchGuildBoss: async (_guildId, bossId) => {
      dependencyCalls += 1;
      return { boss: { id: bossId, name: 'Quarm' } };
    },
    navigateToBoss: async () => {
      dependencyCalls += 1;
      return '/unexpected';
    }
  });

  for (const tool of createNexusWebMcpTools(dependencies)) {
    await assert.rejects(() => tool.execute(null), /must be an object/);
  }

  assert.equal(dependencyCalls, 0);
});

test('enforces required values, primitive types, and published numeric bounds before I/O', async () => {
  let dependencyCalls = 0;
  const dependencies = createDependencies({
    getViewerGuilds: () => {
      dependencyCalls += 1;
      return [{ id: 'guild-1', name: "Clumsy's World" }];
    },
    fetchRaidsForGuild: async () => {
      dependencyCalls += 1;
      return { raids: [] };
    },
    fetchRaid: async () => {
      dependencyCalls += 1;
      return createDependencies().fetchRaid('raid-1');
    },
    fetchMarketListingsPage: async () => {
      dependencyCalls += 1;
      return { listings: [], total: 0, sourceAvailable: true };
    },
    fetchGuildBossLibrary: async () => {
      dependencyCalls += 1;
      return { groups: [] };
    },
    fetchGuildBoss: async (_guildId, bossId) => {
      dependencyCalls += 1;
      return { boss: { id: bossId, name: 'Quarm' } };
    }
  });
  const cases: Array<{ name: string; input: Record<string, unknown>; error: RegExp }> = [
    { name: 'list_upcoming_raids', input: { limit: 0 }, error: /integer from 1 to 2/ },
    { name: 'list_upcoming_raids', input: { guildId: ' ' }, error: /invalid length/ },
    { name: 'get_raid_details', input: {}, error: /raidId must be a string/ },
    { name: 'search_market_listings', input: { query: 'x' }, error: /invalid length/ },
    {
      name: 'search_market_listings',
      input: { query: 'Quarm', minPrice: 1.5 },
      error: /must be an integer/
    },
    {
      name: 'search_market_listings',
      input: { query: 'Quarm', dealsOnly: 'true' },
      error: /must be a boolean/
    },
    { name: 'search_market_listings', input: { query: 'Quarm', limit: 5 }, error: /1 to 4/ },
    { name: 'find_bosses', input: { query: 'x' }, error: /invalid length/ },
    { name: 'find_bosses', input: { query: 'Quarm', limit: 4 }, error: /1 to 3/ },
    { name: 'open_boss_notes', input: {}, error: /bossId must be a string/ }
  ];

  for (const testCase of cases) {
    await assert.rejects(
      () => getTool(dependencies, testCase.name).execute(testCase.input),
      testCase.error
    );
  }

  assert.equal(dependencyCalls, 0);
});

test('lists only active and future raids for the primary guild in time order', async () => {
  let requestedGuildId = '';
  const tool = getTool(
    createDependencies({
      fetchRaidsForGuild: async (guildId) => {
        requestedGuildId = guildId;
        return {
          raids: [
            {
              id: 'later',
              guildId,
              name: 'Later',
              startTime: '2026-08-29T23:00:00.000Z',
              targetZones: [],
              targetBosses: []
            },
            {
              id: 'ended',
              guildId,
              name: 'Ended',
              startTime: '2026-08-25T23:00:00.000Z',
              endedAt: '2026-08-26T01:00:00.000Z',
              targetZones: [],
              targetBosses: []
            },
            {
              id: 'active',
              guildId,
              name: 'Active',
              startTime: '2026-08-25T23:00:00.000Z',
              startedAt: '2026-08-25T23:05:00.000Z',
              targetZones: [],
              targetBosses: []
            },
            {
              id: 'next',
              guildId,
              name: 'Next',
              startTime: '2026-08-27T23:00:00.000Z',
              targetZones: [],
              targetBosses: []
            }
          ]
        };
      }
    }),
    'list_upcoming_raids'
  );

  const result = (await tool.execute({ limit: 2 })) as {
    raids: Array<{ id: string; status: string }>;
  };

  assert.equal(requestedGuildId, 'guild-1');
  assert.deepEqual(result.raids, [
    {
      id: 'active',
      name: 'Active',
      startTime: '2026-08-25T23:00:00.000Z',
      status: 'active',
      targetZones: [],
      targetBosses: [],
      signupCounts: null
    },
    {
      id: 'next',
      name: 'Next',
      startTime: '2026-08-27T23:00:00.000Z',
      status: 'upcoming',
      targetZones: [],
      targetBosses: [],
      signupCounts: null
    }
  ]);
});

test('rejects a guild that is not in the authenticated viewer guild list', async () => {
  let requestCount = 0;
  const tool = getTool(
    createDependencies({
      fetchRaidsForGuild: async () => {
        requestCount += 1;
        return { raids: [] };
      }
    }),
    'list_upcoming_raids'
  );

  await assert.rejects(() => tool.execute({ guildId: 'guild-2' }), /not available/);
  assert.equal(requestCount, 0);
});

test('uses an explicitly selected viewer guild without crossing guild boundaries', async () => {
  const requestedGuildIds: string[] = [];
  const dependencies = createDependencies({
    getViewerGuilds: () => [
      { id: 'guild-1', name: 'Primary' },
      { id: 'guild-2', name: 'Secondary' }
    ],
    fetchRaidsForGuild: async (guildId) => {
      requestedGuildIds.push(guildId);
      return { raids: [] };
    },
    fetchGuildBossLibrary: async (guildId) => {
      requestedGuildIds.push(guildId);
      return { groups: [] };
    }
  });

  await getTool(dependencies, 'list_upcoming_raids').execute({ guildId: 'guild-2' });
  await getTool(dependencies, 'find_bosses').execute({ guildId: 'guild-2', query: 'Quarm' });

  assert.deepEqual(requestedGuildIds, ['guild-2', 'guild-2']);
});

test('does not fetch raid details after the viewer loses all guild access', async () => {
  let requestCount = 0;
  const tool = getTool(
    createDependencies({
      getViewerGuilds: () => [],
      fetchRaid: async () => {
        requestCount += 1;
        return createDependencies().fetchRaid('raid-1');
      }
    }),
    'get_raid_details'
  );

  await assert.rejects(() => tool.execute({ raidId: 'raid-1' }), /does not belong to a guild/);
  assert.equal(requestCount, 0);
});

test('rejects a raid returned for a guild outside the current viewer memberships', async () => {
  const tool = getTool(
    createDependencies({
      fetchRaid: async () => ({
        id: 'raid-2',
        guildId: 'guild-2',
        name: 'Private raid',
        startTime: '2026-08-28T23:00:00.000Z',
        targetZones: [],
        targetBosses: [],
        notes: 'must not be returned',
        signups: []
      })
    }),
    'get_raid_details'
  );

  await assert.rejects(() => tool.execute({ raidId: 'raid-2' }), /not available/);
});

test('returns bounded raid details without exposing signup identities', async () => {
  const tool = getTool(
    createDependencies({
      fetchRaid: async () => ({
        id: 'raid-1',
        guildId: 'guild-1',
        name: 'Friday Raid',
        startTime: '2026-08-28T23:00:00.000Z',
        targetZones: ['Plane of Time'],
        targetBosses: ['Quarm'],
        notes: 'x'.repeat(600),
        signups: [{ status: 'CONFIRMED' }, { status: 'CONFIRMED' }, { status: 'NOT_ATTENDING' }]
      })
    }),
    'get_raid_details'
  );

  const result = (await tool.execute({ raidId: 'raid-1' })) as {
    raid: { notes: string; signupCounts: { confirmed: number; notAttending: number } };
  };

  assert.equal(result.raid.notes.length, 400);
  assert.deepEqual(result.raid.signupCounts, { confirmed: 2, notAttending: 1 });
  assert.equal(JSON.stringify(result).includes('signups'), false);
});

test('searches at most four lowest-price market listings with validated bounds', async () => {
  let receivedOptions: unknown;
  const tool = getTool(
    createDependencies({
      fetchMarketListingsPage: async (options) => {
        receivedOptions = options;
        return {
          listings: Array.from({ length: 5 }, (_, index) => ({
            sellerCharacterName: `Seller ${index}`,
            itemId: index + 1,
            itemName: `Item ${index}`,
            price: 100 + index,
            charges: null,
            listedAt: null
          })),
          total: 20,
          sourceAvailable: true
        };
      }
    }),
    'search_market_listings'
  );

  const result = (await tool.execute({
    query: 'Quarm',
    minPrice: 100,
    maxPrice: 500,
    dealsOnly: true,
    limit: 3
  })) as { listings: unknown[] };

  assert.deepEqual(receivedOptions, {
    q: 'Quarm',
    minPrice: 100,
    maxPrice: 500,
    dealsOnly: true,
    page: 1,
    pageSize: 5,
    sortBy: 'price',
    sortOrder: 'asc'
  });
  assert.equal(result.listings.length, 3);
  await assert.rejects(
    () => tool.execute({ query: 'Quarm', minPrice: 500, maxPrice: 100 }),
    /minPrice/
  );
});

test('normalizes user-entered search text before issuing a market read', async () => {
  let receivedQuery = '';
  const tool = getTool(
    createDependencies({
      fetchMarketListingsPage: async (options) => {
        receivedQuery = options.q;
        return { listings: [], total: 0, sourceAvailable: true };
      }
    }),
    'search_market_listings'
  );

  const result = (await tool.execute({ query: '  Quarm  ' })) as { query: string };

  assert.equal(receivedQuery, 'Quarm');
  assert.equal(result.query, 'Quarm');
});

test('finds bosses by zone or group and returns bounded identifiers', async () => {
  const tool = getTool(
    createDependencies({
      fetchGuildBossLibrary: async () => ({
        groups: [
          {
            name: 'Planes of Power',
            bosses: [
              { id: 'quarm', name: 'Quarm', slug: 'quarm', zoneName: 'Plane of Time' },
              { id: 'rallos', name: 'Rallos Zek', slug: 'rallos-zek', zoneName: 'Plane of Tactics' }
            ]
          }
        ]
      })
    }),
    'find_bosses'
  );

  const result = (await tool.execute({ query: 'time' })) as {
    matches: Array<{ id: string }>;
  };

  assert.deepEqual(
    result.matches.map((boss) => boss.id),
    ['quarm']
  );
});

test('validates boss access before completing visible navigation', async () => {
  const calls: string[] = [];
  const tool = getTool(
    createDependencies({
      fetchGuildBoss: async (guildId, bossId) => {
        calls.push(`fetch:${guildId}:${bossId}`);
        return { boss: { id: bossId, name: 'Quarm' } };
      },
      navigateToBoss: async (guildId, bossId) => {
        calls.push(`navigate:${guildId}:${bossId}`);
        return `/guilds/${guildId}/bosses/${bossId}`;
      }
    }),
    'open_boss_notes'
  );

  const result = (await tool.execute({ bossId: 'quarm' })) as { opened: boolean; path: string };

  assert.deepEqual(calls, ['fetch:guild-1:quarm', 'navigate:guild-1:quarm']);
  assert.equal(result.opened, true);
  assert.equal(result.path, '/guilds/guild-1/bosses/quarm');
});

test('does not navigate or report success when boss validation fails', async () => {
  let navigationCount = 0;
  const tool = getTool(
    createDependencies({
      fetchGuildBoss: async () => {
        throw new Error('Boss not found');
      },
      navigateToBoss: async () => {
        navigationCount += 1;
        return '/unexpected';
      }
    }),
    'open_boss_notes'
  );

  await assert.rejects(() => tool.execute({ bossId: 'missing' }), /Boss not found/);
  assert.equal(navigationCount, 0);
});

test('rejects unknown input keys before calling a dependency', async () => {
  let requestCount = 0;
  const tool = getTool(
    createDependencies({
      fetchMarketListingsPage: async () => {
        requestCount += 1;
        return { listings: [], total: 0, sourceAvailable: true };
      }
    }),
    'search_market_listings'
  );

  await assert.rejects(
    () => tool.execute({ query: 'Quarm', deleteEverything: true }),
    /Unexpected/
  );
  assert.equal(requestCount, 0);
});

test('keeps every read tool result within the 1,500-character response budget', async () => {
  const longText = 'x'.repeat(250);
  const dependencies = createDependencies({
    getViewerGuilds: () => [{ id: 'guild-1', name: longText }],
    fetchRaidsForGuild: async () => ({
      raids: Array.from({ length: 3 }, (_, index) => ({
        id: `raid-${index}`,
        guildId: 'guild-1',
        name: longText,
        startTime: `2026-08-${27 + index}T23:00:00.000Z`,
        targetZones: Array(5).fill(longText),
        targetBosses: Array(5).fill(longText),
        signupCounts: { confirmed: 999, notAttending: 999 }
      }))
    }),
    fetchRaid: async () => ({
      id: 'raid-1',
      guildId: 'guild-1',
      name: longText,
      startTime: '2026-08-28T23:00:00.000Z',
      targetZones: Array(5).fill(longText),
      targetBosses: Array(5).fill(longText),
      notes: longText.repeat(3),
      signups: Array.from({ length: 20 }, () => ({ status: 'CONFIRMED' as const }))
    }),
    fetchMarketListingsPage: async () => ({
      listings: Array.from({ length: 5 }, (_, index) => ({
        sellerCharacterName: longText,
        itemId: index + 1,
        itemName: longText,
        price: 2_147_483_647,
        charges: 2_147_483_647,
        listedAt: '2026-08-26T15:00:00.000Z'
      })),
      total: 999_999,
      sourceAvailable: true
    }),
    fetchGuildBossLibrary: async () => ({
      groups: [
        {
          name: longText,
          bosses: Array.from({ length: 3 }, (_, index) => ({
            id: `boss-${index}`,
            name: longText,
            slug: longText,
            zoneName: longText
          }))
        }
      ]
    })
  });

  const cases: Array<{ name: string; input: Record<string, unknown> }> = [
    { name: 'list_upcoming_raids', input: { limit: 2 } },
    { name: 'get_raid_details', input: { raidId: 'raid-1' } },
    { name: 'search_market_listings', input: { query: longText.slice(0, 100), limit: 4 } },
    { name: 'find_bosses', input: { query: 'xx', limit: 3 } }
  ];

  for (const testCase of cases) {
    const tool = getTool(dependencies, testCase.name);
    const output = await tool.execute(testCase.input);
    assert.ok(
      JSON.stringify(output).length <= 1_500,
      `${testCase.name} exceeded the response budget.`
    );
  }
});
