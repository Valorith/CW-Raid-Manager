import type { WebMcpTool } from './types';

interface ViewerGuild {
  id: string;
  name: string;
}

interface RaidSummaryLike {
  id: string;
  guildId: string;
  name: string;
  startTime: string;
  startedAt?: string | null;
  endedAt?: string | null;
  canceledAt?: string | null;
  targetZones: string[];
  targetBosses: string[];
  signupCounts?: {
    confirmed: number;
    notAttending: number;
  };
}

interface RaidDetailLike extends RaidSummaryLike {
  notes?: string | null;
  signups: Array<{
    status: 'CONFIRMED' | 'NOT_ATTENDING';
  }>;
}

interface MarketListingLike {
  sellerCharacterName: string;
  itemId: number;
  itemName: string;
  price: number;
  charges: number | null;
  listedAt: string | null;
}

interface BossLibraryLike {
  groups: Array<{
    name: string;
    bosses: Array<{
      id: string;
      name: string;
      slug: string;
      zoneName?: string | null;
    }>;
  }>;
}

interface BossDetailLike {
  boss: {
    id: string;
    name: string;
  };
}

interface MarketListingSearchOptions {
  q: string;
  minPrice?: number;
  maxPrice?: number;
  dealsOnly?: boolean;
  page: number;
  pageSize: number;
  sortBy: 'price';
  sortOrder: 'asc';
}

export interface NexusWebMcpDependencies {
  getViewerGuilds: () => ViewerGuild[];
  fetchRaidsForGuild: (guildId: string) => Promise<{ raids: RaidSummaryLike[] }>;
  fetchRaid: (raidId: string) => Promise<RaidDetailLike>;
  fetchMarketListingsPage: (
    options: MarketListingSearchOptions
  ) => Promise<{ listings: MarketListingLike[]; total: number; sourceAvailable: boolean }>;
  fetchGuildBossLibrary: (guildId: string) => Promise<BossLibraryLike>;
  fetchGuildBoss: (guildId: string, bossId: string) => Promise<BossDetailLike>;
  navigateToBoss: (guildId: string, bossId: string) => Promise<string>;
  now?: () => Date;
}

type InputRecord = Record<string, unknown>;

function parseInput(input: unknown, allowedKeys: string[]): InputRecord {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Tool input must be an object.');
  }

  const value = input as InputRecord;
  const extraKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (extraKey) {
    throw new Error(`Unexpected tool input: ${extraKey}`);
  }
  return value;
}

function parseString(
  input: InputRecord,
  key: string,
  options: { required?: boolean; minLength?: number; maxLength: number }
): string | undefined {
  const value = input[key];
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < (options.minLength ?? 1) || trimmed.length > options.maxLength) {
    throw new Error(`${key} has an invalid length.`);
  }
  return trimmed;
}

function parseInteger(
  input: InputRecord,
  key: string,
  options: { minimum: number; maximum: number }
): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < options.minimum ||
    (value as number) > options.maximum
  ) {
    throw new Error(`${key} must be an integer from ${options.minimum} to ${options.maximum}.`);
  }
  return value as number;
}

function parseBoolean(input: InputRecord, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean.`);
  }
  return value;
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function resolveViewerGuild(guildId: string | undefined, guilds: ViewerGuild[]): ViewerGuild {
  if (guilds.length === 0) {
    throw new Error('The current user does not belong to a guild.');
  }
  if (!guildId) return guilds[0]!;

  const guild = guilds.find((candidate) => candidate.id === guildId);
  if (!guild) {
    throw new Error('The requested guild is not available to the current user.');
  }
  return guild;
}

function raidStatus(raid: RaidSummaryLike): 'active' | 'upcoming' | 'completed' | 'canceled' {
  if (raid.canceledAt) return 'canceled';
  if (raid.endedAt) return 'completed';
  if (raid.startedAt) return 'active';
  return 'upcoming';
}

function compactRaid(raid: RaidSummaryLike) {
  return {
    id: raid.id,
    name: truncate(raid.name, 100),
    startTime: raid.startTime,
    status: raidStatus(raid),
    targetZones: raid.targetZones.slice(0, 2).map((value) => truncate(value, 50)),
    targetBosses: raid.targetBosses.slice(0, 2).map((value) => truncate(value, 50)),
    signupCounts: raid.signupCounts ?? null
  };
}

export function createNexusWebMcpTools(dependencies: NexusWebMcpDependencies): WebMcpTool[] {
  const guildInputProperties = {
    guildId: {
      type: 'string',
      minLength: 1,
      maxLength: 191,
      description:
        "Guild ID from a prior tool result. Defaults to the current user's primary guild."
    }
  };

  return [
    {
      name: 'list_upcoming_raids',
      title: 'List upcoming raids',
      description:
        "List active and upcoming raids for one of the current user's guilds, ordered by start time.",
      inputSchema: {
        type: 'object',
        properties: {
          ...guildInputProperties,
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 2,
            description: 'Maximum number of raids to return. Defaults to 2.'
          }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const parsed = parseInput(input, ['guildId', 'limit']);
        const guildId = parseString(parsed, 'guildId', { maxLength: 191 });
        const limit = parseInteger(parsed, 'limit', { minimum: 1, maximum: 2 }) ?? 2;
        const guild = resolveViewerGuild(guildId, dependencies.getViewerGuilds());
        const { raids } = await dependencies.fetchRaidsForGuild(guild.id);
        const now = (dependencies.now ?? (() => new Date()))().getTime();
        const upcoming = raids
          .filter((raid) => {
            const status = raidStatus(raid);
            return (
              status === 'active' || (status === 'upcoming' && Date.parse(raid.startTime) >= now)
            );
          })
          .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
          .slice(0, limit)
          .map(compactRaid);

        return {
          guild: { id: guild.id, name: truncate(guild.name, 100) },
          raids: upcoming
        };
      }
    },
    {
      name: 'get_raid_details',
      title: 'Get raid details',
      description:
        'Get a concise raid summary, including targets, status, notes, and signup totals. Does not modify the raid.',
      inputSchema: {
        type: 'object',
        properties: {
          raidId: {
            type: 'string',
            minLength: 1,
            maxLength: 191,
            description: 'Raid ID returned by list_upcoming_raids.'
          }
        },
        required: ['raidId'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const parsed = parseInput(input, ['raidId']);
        const raidId = parseString(parsed, 'raidId', { required: true, maxLength: 191 })!;
        const viewerGuilds = dependencies.getViewerGuilds();
        if (viewerGuilds.length === 0) {
          throw new Error('The current user does not belong to a guild.');
        }
        const raid = await dependencies.fetchRaid(raidId);
        const viewerGuild = viewerGuilds.find((guild) => guild.id === raid.guildId);
        if (!viewerGuild) {
          throw new Error('The requested raid is not available to the current user.');
        }

        const signupCounts = raid.signups.reduce(
          (counts, signup) => {
            if (signup.status === 'CONFIRMED') counts.confirmed += 1;
            if (signup.status === 'NOT_ATTENDING') counts.notAttending += 1;
            return counts;
          },
          { confirmed: 0, notAttending: 0 }
        );

        return {
          guild: { id: viewerGuild.id, name: truncate(viewerGuild.name, 100) },
          raid: {
            ...compactRaid(raid),
            notes: truncate(raid.notes, 400),
            signupCounts
          }
        };
      }
    },
    {
      name: 'search_market_listings',
      title: 'Search market listings',
      description:
        'Search current market listings by item text and optional price bounds. Returns at most four lowest-price matches.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Item name or search text.'
          },
          minPrice: {
            type: 'integer',
            minimum: 0,
            maximum: 2147483647,
            description: "Optional minimum listing price in the application's stored price units."
          },
          maxPrice: {
            type: 'integer',
            minimum: 0,
            maximum: 2147483647,
            description: "Optional maximum listing price in the application's stored price units."
          },
          dealsOnly: {
            type: 'boolean',
            description: 'When true, return only listings classified as deals.'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 4,
            description: 'Maximum number of listings to return. Defaults to 4.'
          }
        },
        required: ['query'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const parsed = parseInput(input, ['query', 'minPrice', 'maxPrice', 'dealsOnly', 'limit']);
        const query = parseString(parsed, 'query', {
          required: true,
          minLength: 2,
          maxLength: 100
        })!;
        const minPrice = parseInteger(parsed, 'minPrice', {
          minimum: 0,
          maximum: 2_147_483_647
        });
        const maxPrice = parseInteger(parsed, 'maxPrice', {
          minimum: 0,
          maximum: 2_147_483_647
        });
        if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
          throw new Error('minPrice must be less than or equal to maxPrice.');
        }
        const dealsOnly = parseBoolean(parsed, 'dealsOnly');
        const limit = parseInteger(parsed, 'limit', { minimum: 1, maximum: 4 }) ?? 4;
        const page = await dependencies.fetchMarketListingsPage({
          q: query,
          minPrice,
          maxPrice,
          dealsOnly,
          page: 1,
          pageSize: 5,
          sortBy: 'price',
          sortOrder: 'asc'
        });

        return {
          query,
          totalMatches: page.total,
          sourceAvailable: page.sourceAvailable,
          listings: page.listings.slice(0, limit).map((listing) => ({
            itemId: listing.itemId,
            itemName: truncate(listing.itemName, 100),
            sellerName: truncate(listing.sellerCharacterName, 64),
            price: listing.price,
            charges: listing.charges,
            listedAt: listing.listedAt
          }))
        };
      }
    },
    {
      name: 'find_bosses',
      title: 'Find boss notes',
      description:
        "Find boss-note entries by boss, zone, or group name within one of the current user's guilds.",
      inputSchema: {
        type: 'object',
        properties: {
          ...guildInputProperties,
          query: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Boss, zone, or boss-group search text.'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 3,
            description: 'Maximum number of matches to return. Defaults to 3.'
          }
        },
        required: ['query'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const parsed = parseInput(input, ['guildId', 'query', 'limit']);
        const guildId = parseString(parsed, 'guildId', { maxLength: 191 });
        const query = parseString(parsed, 'query', {
          required: true,
          minLength: 2,
          maxLength: 100
        })!;
        const limit = parseInteger(parsed, 'limit', { minimum: 1, maximum: 3 }) ?? 3;
        const guild = resolveViewerGuild(guildId, dependencies.getViewerGuilds());
        const library = await dependencies.fetchGuildBossLibrary(guild.id);
        const normalizedQuery = query.toLocaleLowerCase();
        const matches = library.groups
          .flatMap((group) =>
            group.bosses.map((boss) => ({
              boss,
              groupName: group.name
            }))
          )
          .filter(({ boss, groupName }) =>
            [boss.name, boss.zoneName ?? '', groupName].some((value) =>
              value.toLocaleLowerCase().includes(normalizedQuery)
            )
          )
          .slice(0, limit)
          .map(({ boss, groupName }) => ({
            id: boss.id,
            name: truncate(boss.name, 80),
            slug: truncate(boss.slug, 100),
            zoneName: truncate(boss.zoneName, 80),
            groupName: truncate(groupName, 80)
          }));

        return {
          guild: { id: guild.id, name: truncate(guild.name, 100) },
          matches
        };
      }
    },
    {
      name: 'open_boss_notes',
      title: 'Open boss notes',
      description:
        'Open a known boss-note entry in the visible application. This changes only the current page and does not edit boss data.',
      inputSchema: {
        type: 'object',
        properties: {
          ...guildInputProperties,
          bossId: {
            type: 'string',
            minLength: 1,
            maxLength: 191,
            description: 'Boss ID returned by find_bosses.'
          }
        },
        required: ['bossId'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        const parsed = parseInput(input, ['guildId', 'bossId']);
        const guildId = parseString(parsed, 'guildId', { maxLength: 191 });
        const bossId = parseString(parsed, 'bossId', { required: true, maxLength: 191 })!;
        const guild = resolveViewerGuild(guildId, dependencies.getViewerGuilds());
        const { boss } = await dependencies.fetchGuildBoss(guild.id, bossId);
        const path = await dependencies.navigateToBoss(guild.id, boss.id);

        return {
          opened: true,
          guildId: guild.id,
          bossId: boss.id,
          bossName: truncate(boss.name, 100),
          path
        };
      }
    }
  ];
}
