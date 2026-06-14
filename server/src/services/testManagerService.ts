import { randomUUID } from 'node:crypto';

import {
  InboundWebhookActionType,
  Prisma,
  TestAssignmentKind,
  TestChangePriority,
  TestChangeStatus,
  TestHistoryEventType,
  TestResult,
  TestRunStatus
} from '@prisma/client';

import { ensureAdmin } from './adminService.js';
import { generatePatchNotesForChanges } from './geminiPatchNotesService.js';
import { buildCrashReviewInput } from './inboundWebhookService.js';
import { prisma } from '../utils/prisma.js';
import { resolvePublicClientBaseUrl } from '../utils/publicClientUrl.js';

const TESTING_READY_STATUSES: TestChangeStatus[] = [
  TestChangeStatus.SUBMITTED,
  TestChangeStatus.AWAITING_TEST,
  TestChangeStatus.RENEWED
];

const OPEN_TEST_RUN_STATUSES: TestRunStatus[] = [
  TestRunStatus.NOT_STARTED,
  TestRunStatus.TESTING,
  TestRunStatus.BLOCKED
];

export type NextPatchChangeView = 'complete' | 'incomplete';

const NEXT_PATCH_COMPLETE_STATUS = TestChangeStatus.CLOSED;
const TERMINAL_CHANGE_STATUSES: TestChangeStatus[] = [
  TestChangeStatus.CLOSED,
  TestChangeStatus.ARCHIVED
];

function isTerminalChangeStatus(status: TestChangeStatus) {
  return TERMINAL_CHANGE_STATUSES.includes(status);
}

export const TEST_MANAGER_PERMISSION_KEYS = [
  'view',
  'submit',
  'volunteer',
  'submitResult',
  'noteForPass',
  'dispose',
  'manageTesters',
  'reports',
  'settings'
] as const;

export const TEST_MANAGER_ROLE_KEYS = ['ADMIN', 'GUIDE', 'TESTER', 'USER'] as const;
export const TEST_MANAGER_DISCORD_EVENT_KEYS = [
  'change.created',
  'change.statusChanged',
  'change.renewed',
  'change.closed',
  'change.deleted',
  'tester.requested',
  'tester.started',
  'tester.retested',
  'tester.resultSubmitted',
  'checklist.completed',
  'checklist.reopened',
  'checklist.noteUpdated',
  'note.added'
] as const;

const TEST_CHANGE_CONTEXT_LINK_KINDS = ['DISCORD', 'GITHUB', 'DOCUMENT', 'OTHER'] as const;

type TestManagerPermissionKey = (typeof TEST_MANAGER_PERMISSION_KEYS)[number];
type TestManagerRoleKey = (typeof TEST_MANAGER_ROLE_KEYS)[number];
type TestManagerDiscordEventKey = (typeof TEST_MANAGER_DISCORD_EVENT_KEYS)[number];
type TestChangeContextLinkKind = (typeof TEST_CHANGE_CONTEXT_LINK_KINDS)[number];

type TestChangeContextLinkInput = {
  id?: string | null;
  kind?: string | null;
  label?: string | null;
  url?: string | null;
  description?: string | null;
};

type TestChangeChecklistInput = {
  id?: string | null;
  title: string;
  details?: string | null;
  category?: string | null;
};

type NormalizedTestChangeChecklistInput = {
  id?: string;
  title: string;
  details: string | null;
  category: string | null;
  sortOrder: number;
};

const ADMIN_TEST_MANAGER_PERMISSIONS: TestManagerPermissionKey[] = [
  ...TEST_MANAGER_PERMISSION_KEYS
].filter((permission) => permission !== 'noteForPass');

type TestManagerRolePermission = {
  key: TestManagerRoleKey;
  label: string;
  permissions: TestManagerPermissionKey[];
};

type TestManagerSettings = {
  schemaVersion: number;
  roles: TestManagerRolePermission[];
  discordNotifications: {
    enabled: boolean;
    webhookUrl: string;
    events: TestManagerDiscordEventKey[];
  };
};

const TEST_MANAGER_SETTINGS_KEY = 'testManager.rolePermissions';
const TEST_MANAGER_CURRENT_VERSION_KEY = 'testManager.currentTestServerVersion';
const TEST_MANAGER_CURRENT_LIVE_VERSION_KEY = 'testManager.currentLiveServerVersion';
const TEST_MANAGER_SETTINGS_SCHEMA_VERSION = 2;
const DISCORD_COLORS = {
  primary: 0x55b7ff,
  success: 0x72d66f,
  warning: 0xd9a45f,
  danger: 0xff6b55,
  info: 0x9b7dff
} as const;
const GITHUB_METADATA_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const githubMetadataRefreshes = new Map<string, Promise<void>>();

const DEFAULT_TEST_MANAGER_SETTINGS: TestManagerSettings = {
  schemaVersion: TEST_MANAGER_SETTINGS_SCHEMA_VERSION,
  roles: [
    {
      key: 'ADMIN',
      label: 'Admin',
      permissions: [...ADMIN_TEST_MANAGER_PERMISSIONS]
    },
    {
      key: 'GUIDE',
      label: 'Guide',
      permissions: ['view', 'reports']
    },
    {
      key: 'TESTER',
      label: 'Tester',
      permissions: ['view', 'volunteer', 'submitResult', 'reports']
    },
    {
      key: 'USER',
      label: 'Authenticated User',
      permissions: ['view']
    }
  ],
  discordNotifications: {
    enabled: false,
    webhookUrl: '',
    events: [...TEST_MANAGER_DISCORD_EVENT_KEYS]
  }
};

type UserName = {
  id: string;
  displayName: string;
  nickname: string | null;
  email?: string;
  admin?: boolean | null;
  guide?: boolean | null;
  tester?: boolean | null;
};

type GitHubPullRequestReference = {
  owner: string;
  repo: string;
  number: number;
  repository: string;
  url: string;
};

type GitHubPullRequestMetadata = {
  available: boolean;
  fetchedAt: string;
  checkedAt?: string;
  statusMessage?: string;
  statusCode?: number;
  htmlUrl?: string;
  title?: string;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  mergedAt?: string | null;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  baseRef?: string | null;
  headRef?: string | null;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  comments?: number | null;
  reviewComments?: number | null;
  labels?: Array<{ name: string; color: string | null }>;
  etag?: string | null;
  lastModified?: string | null;
  issueEtag?: string | null;
  issueLastModified?: string | null;
};

type GitHubIssueReference = GitHubPullRequestReference;

type GitHubIssueMetadata = {
  available: boolean;
  fetchedAt: string;
  checkedAt?: string;
  statusMessage?: string;
  statusCode?: number;
  htmlUrl?: string;
  title?: string;
  state?: string;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  closedAt?: string | null;
  comments?: number | null;
  labels?: Array<{ name: string; color: string | null }>;
  etag?: string | null;
  lastModified?: string | null;
};

function displayName(user: { displayName: string; nickname: string | null }): string {
  return user.nickname?.trim() || user.displayName;
}

function serializeUser(user: UserName | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    displayName: displayName(user),
    email: user.email ?? null,
    isAdmin: Boolean(user.admin),
    isGuide: Boolean(user.guide),
    isTester: Boolean(user.tester)
  };
}

function roleKeyForUser(
  user: Pick<UserName, 'admin' | 'guide' | 'tester'> | null
): TestManagerRoleKey {
  if (user?.admin) {
    return 'ADMIN';
  }
  if (user?.guide) {
    return 'GUIDE';
  }
  if (user?.tester) {
    return 'TESTER';
  }
  return 'USER';
}

function parseGithubPullRequestUrl(value: string): GitHubPullRequestReference {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a full GitHub pull request URL.');
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (hostname !== 'github.com' && hostname !== 'www.github.com')) {
    throw new Error('GitHub pull request URLs must use https://github.com/.');
  }

  const [owner, repo, pullSegment, numberSegment, ...extraSegments] = url.pathname
    .split('/')
    .filter(Boolean);
  const number = Number(numberSegment);
  if (
    !owner ||
    !repo ||
    pullSegment !== 'pull' ||
    extraSegments.length > 0 ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error('Enter a GitHub pull request URL like https://github.com/owner/repo/pull/123.');
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}/pull/${number}`;
  return {
    owner,
    repo,
    number,
    repository: `${owner}/${repo}`,
    url: canonicalUrl
  };
}

function normalizeGithubPullRequestUrl(value?: string | null): GitHubPullRequestReference | null {
  const trimmed = value?.trim();
  return trimmed ? parseGithubPullRequestUrl(trimmed) : null;
}

function parseGithubIssueUrl(value: string): GitHubIssueReference {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a full GitHub issue URL.');
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (hostname !== 'github.com' && hostname !== 'www.github.com')) {
    throw new Error('GitHub issue URLs must use https://github.com/.');
  }

  const [owner, repo, issueSegment, numberSegment, ...extraSegments] = url.pathname
    .split('/')
    .filter(Boolean);
  const number = Number(numberSegment);
  if (
    !owner ||
    !repo ||
    issueSegment !== 'issues' ||
    extraSegments.length > 0 ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error('Enter a GitHub issue URL like https://github.com/owner/repo/issues/123.');
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}/issues/${number}`;
  return {
    owner,
    repo,
    number,
    repository: `${owner}/${repo}`,
    url: canonicalUrl
  };
}

function normalizeGithubIssueUrl(value?: string | null): GitHubIssueReference | null {
  const trimmed = value?.trim();
  return trimmed ? parseGithubIssueUrl(trimmed) : null;
}

type GithubJsonResponse = {
  ok: boolean;
  status: number;
  data: unknown;
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
};

type GithubRequestValidators = {
  etag?: string | null;
  lastModified?: string | null;
};

async function fetchGithubJson(
  pathname: string,
  signal: AbortSignal,
  validators: GithubRequestValidators = {}
): Promise<GithubJsonResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CWRaidManager-TestManager'
  };
  if (validators.etag) {
    headers['If-None-Match'] = validators.etag;
  } else if (validators.lastModified) {
    headers['If-Modified-Since'] = validators.lastModified;
  }

  const response = await fetch(`https://api.github.com${pathname}`, {
    signal,
    headers
  });
  const data =
    response.status === 304 ? null : ((await response.json().catch(() => null)) as unknown);
  return {
    ok: response.ok,
    status: response.status,
    data,
    notModified: response.status === 304,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  };
}

function githubString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function githubNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function githubBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function githubObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function githubLabels(value: unknown): Array<{ name: string; color: string | null }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((label) => githubObject(label))
    .map((label) => ({
      name: githubString(label.name) ?? '',
      color: githubString(label.color)
    }))
    .filter((label) => label.name)
    .slice(0, 6);
}

function githubStoredValidators(
  metadata: Record<string, unknown>,
  prefix = ''
): GithubRequestValidators {
  const keyPrefix = prefix ? `${prefix[0].toLowerCase()}${prefix.slice(1)}` : '';
  const etag =
    githubString(metadata[`${keyPrefix}etag`]) ?? githubString(metadata[`${keyPrefix}Etag`]);
  const lastModified =
    githubString(metadata[`${keyPrefix}lastModified`]) ??
    githubString(metadata[`${keyPrefix}LastModified`]);
  return { etag, lastModified };
}

function githubMetadataCheckedAt(metadata: Prisma.JsonValue | null): string | null {
  const value = githubObject(metadata);
  return githubString(value.checkedAt) ?? githubString(value.fetchedAt);
}

function shouldRefreshGithubMetadata(metadata: Prisma.JsonValue | null): boolean {
  const checkedAt = githubMetadataCheckedAt(metadata);
  if (!checkedAt) {
    return true;
  }

  const checkedAtMs = Date.parse(checkedAt);
  return (
    !Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs >= GITHUB_METADATA_REFRESH_INTERVAL_MS
  );
}

function githubFailureIsTransient(status: number | null | undefined): boolean {
  return !status || status === 403 || status === 408 || status === 429 || status >= 500;
}

function markGithubMetadataChecked<T extends GitHubPullRequestMetadata | GitHubIssueMetadata>(
  metadata: T,
  checkedAt: string,
  headers: GithubRequestValidators = {}
): T {
  return {
    ...metadata,
    checkedAt,
    fetchedAt: metadata.fetchedAt || checkedAt,
    ...(headers.etag ? { etag: headers.etag } : {}),
    ...(headers.lastModified ? { lastModified: headers.lastModified } : {})
  };
}

function pullRequestMetadataFromStored(
  reference: GitHubPullRequestReference,
  metadata: Prisma.JsonValue | null,
  fetchedAt: string
): GitHubPullRequestMetadata {
  const value = githubObject(metadata);
  return {
    available: typeof value.available === 'boolean' ? value.available : false,
    fetchedAt: githubString(value.fetchedAt) ?? fetchedAt,
    checkedAt: githubString(value.checkedAt) ?? undefined,
    statusMessage: githubString(value.statusMessage) ?? undefined,
    statusCode: githubNumber(value.statusCode) ?? undefined,
    htmlUrl: githubString(value.htmlUrl) ?? reference.url,
    title: githubString(value.title) ?? undefined,
    state: githubString(value.state) ?? undefined,
    draft: githubBoolean(value.draft) ?? false,
    merged: githubBoolean(value.merged) ?? false,
    mergedAt: githubString(value.mergedAt),
    authorLogin: githubString(value.authorLogin),
    authorAvatarUrl: githubString(value.authorAvatarUrl),
    createdAt: githubString(value.createdAt),
    updatedAt: githubString(value.updatedAt),
    baseRef: githubString(value.baseRef),
    headRef: githubString(value.headRef),
    additions: githubNumber(value.additions),
    deletions: githubNumber(value.deletions),
    changedFiles: githubNumber(value.changedFiles),
    comments: githubNumber(value.comments),
    reviewComments: githubNumber(value.reviewComments),
    labels: githubLabels(value.labels),
    etag: githubString(value.etag),
    lastModified: githubString(value.lastModified),
    issueEtag: githubString(value.issueEtag),
    issueLastModified: githubString(value.issueLastModified)
  };
}

function issueMetadataFromStored(
  reference: GitHubIssueReference,
  metadata: Prisma.JsonValue | null,
  fetchedAt: string
): GitHubIssueMetadata {
  const value = githubObject(metadata);
  return {
    available: typeof value.available === 'boolean' ? value.available : false,
    fetchedAt: githubString(value.fetchedAt) ?? fetchedAt,
    checkedAt: githubString(value.checkedAt) ?? undefined,
    statusMessage: githubString(value.statusMessage) ?? undefined,
    statusCode: githubNumber(value.statusCode) ?? undefined,
    htmlUrl: githubString(value.htmlUrl) ?? reference.url,
    title: githubString(value.title) ?? undefined,
    state: githubString(value.state) ?? undefined,
    authorLogin: githubString(value.authorLogin),
    authorAvatarUrl: githubString(value.authorAvatarUrl),
    createdAt: githubString(value.createdAt),
    updatedAt: githubString(value.updatedAt),
    closedAt: githubString(value.closedAt),
    comments: githubNumber(value.comments),
    labels: githubLabels(value.labels),
    etag: githubString(value.etag),
    lastModified: githubString(value.lastModified)
  };
}

function githubApiErrorMessage(
  status: number,
  data: unknown,
  recordType: 'pull request' | 'issue'
): string {
  const message = githubString(githubObject(data).message);
  if (status === 404) {
    return `GitHub could not find this ${recordType} or the repository is private.`;
  }
  if (status === 403) {
    return message ?? 'GitHub rate limited the metadata refresh.';
  }
  return message ?? `GitHub metadata refresh failed with HTTP ${status}.`;
}

async function fetchGithubPullRequestMetadata(
  reference: GitHubPullRequestReference,
  previousMetadata: Prisma.JsonValue | null = null
): Promise<GitHubPullRequestMetadata> {
  const fetchedAt = new Date().toISOString();
  const previousValue = githubObject(previousMetadata);
  const previous = pullRequestMetadataFromStored(reference, previousMetadata, fetchedAt);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const pull = await fetchGithubJson(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(
        reference.repo
      )}/pulls/${reference.number}`,
      controller.signal,
      githubStoredValidators(previousValue)
    );

    let metadata: GitHubPullRequestMetadata;
    if (pull.notModified) {
      metadata = markGithubMetadataChecked(previous, fetchedAt, {
        etag: pull.etag ?? previous.etag,
        lastModified: pull.lastModified ?? previous.lastModified
      });
    } else if (!pull.ok) {
      const failure: GitHubPullRequestMetadata = {
        available: false,
        fetchedAt,
        checkedAt: fetchedAt,
        statusCode: pull.status,
        statusMessage: githubApiErrorMessage(pull.status, pull.data, 'pull request')
      };
      return previous.available && githubFailureIsTransient(pull.status)
        ? markGithubMetadataChecked(previous, fetchedAt, {
            etag: pull.etag ?? previous.etag,
            lastModified: pull.lastModified ?? previous.lastModified
          })
        : failure;
    } else {
      const pullData = githubObject(pull.data);
      const user = githubObject(pullData.user);
      const base = githubObject(pullData.base);
      const head = githubObject(pullData.head);

      metadata = {
        available: true,
        fetchedAt,
        checkedAt: fetchedAt,
        htmlUrl: githubString(pullData.html_url) ?? reference.url,
        title: githubString(pullData.title) ?? `Pull request #${reference.number}`,
        state: githubString(pullData.state) ?? undefined,
        draft: githubBoolean(pullData.draft) ?? false,
        merged: Boolean(githubString(pullData.merged_at)),
        mergedAt: githubString(pullData.merged_at),
        authorLogin: githubString(user.login),
        authorAvatarUrl: githubString(user.avatar_url),
        createdAt: githubString(pullData.created_at),
        updatedAt: githubString(pullData.updated_at),
        baseRef: githubString(base.ref),
        headRef: githubString(head.ref),
        additions: githubNumber(pullData.additions),
        deletions: githubNumber(pullData.deletions),
        changedFiles: githubNumber(pullData.changed_files),
        comments: githubNumber(pullData.comments),
        reviewComments: githubNumber(pullData.review_comments),
        labels: previous.labels ?? [],
        etag: pull.etag,
        lastModified: pull.lastModified,
        issueEtag: previous.issueEtag,
        issueLastModified: previous.issueLastModified
      };
    }

    const issue = await fetchGithubJson(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(
        reference.repo
      )}/issues/${reference.number}`,
      controller.signal,
      githubStoredValidators(previousValue, 'issue')
    ).catch(
      (): GithubJsonResponse => ({
        ok: false,
        status: 0,
        data: null,
        notModified: false,
        etag: null,
        lastModified: null
      })
    );

    if (issue.notModified) {
      return {
        ...metadata,
        labels: previous.labels,
        issueEtag: issue.etag ?? previous.issueEtag,
        issueLastModified: issue.lastModified ?? previous.issueLastModified
      };
    }
    if (!issue.ok) {
      return {
        ...metadata,
        labels: previous.labels,
        issueEtag: previous.issueEtag,
        issueLastModified: previous.issueLastModified
      };
    }

    const issueData = githubObject(issue.data);
    return {
      ...metadata,
      labels: githubLabels(issueData.labels),
      issueEtag: issue.etag,
      issueLastModified: issue.lastModified
    };
  } catch (error) {
    if (previous.available) {
      return markGithubMetadataChecked(previous, fetchedAt);
    }

    return {
      available: false,
      fetchedAt,
      checkedAt: fetchedAt,
      statusCode: 0,
      statusMessage:
        error instanceof Error && error.name === 'AbortError'
          ? 'GitHub metadata refresh timed out.'
          : 'GitHub metadata could not be refreshed.'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGithubIssueMetadata(
  reference: GitHubIssueReference,
  previousMetadata: Prisma.JsonValue | null = null
): Promise<GitHubIssueMetadata> {
  const fetchedAt = new Date().toISOString();
  const previousValue = githubObject(previousMetadata);
  const previous = issueMetadataFromStored(reference, previousMetadata, fetchedAt);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const issue = await fetchGithubJson(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(
        reference.repo
      )}/issues/${reference.number}`,
      controller.signal,
      githubStoredValidators(previousValue)
    );

    if (issue.notModified) {
      return markGithubMetadataChecked(previous, fetchedAt, {
        etag: issue.etag ?? previous.etag,
        lastModified: issue.lastModified ?? previous.lastModified
      });
    }
    if (!issue.ok) {
      const failure: GitHubIssueMetadata = {
        available: false,
        fetchedAt,
        checkedAt: fetchedAt,
        statusCode: issue.status,
        statusMessage: githubApiErrorMessage(issue.status, issue.data, 'issue')
      };
      return previous.available && githubFailureIsTransient(issue.status)
        ? markGithubMetadataChecked(previous, fetchedAt, {
            etag: issue.etag ?? previous.etag,
            lastModified: issue.lastModified ?? previous.lastModified
          })
        : failure;
    }

    const issueData = githubObject(issue.data);
    const user = githubObject(issueData.user);

    return {
      available: true,
      fetchedAt,
      checkedAt: fetchedAt,
      htmlUrl: githubString(issueData.html_url) ?? reference.url,
      title: githubString(issueData.title) ?? `Issue #${reference.number}`,
      state: githubString(issueData.state) ?? undefined,
      authorLogin: githubString(user.login),
      authorAvatarUrl: githubString(user.avatar_url),
      createdAt: githubString(issueData.created_at),
      updatedAt: githubString(issueData.updated_at),
      closedAt: githubString(issueData.closed_at),
      comments: githubNumber(issueData.comments),
      labels: githubLabels(issueData.labels),
      etag: issue.etag,
      lastModified: issue.lastModified
    };
  } catch (error) {
    if (previous.available) {
      return markGithubMetadataChecked(previous, fetchedAt);
    }

    return {
      available: false,
      fetchedAt,
      checkedAt: fetchedAt,
      statusCode: 0,
      statusMessage:
        error instanceof Error && error.name === 'AbortError'
          ? 'GitHub metadata refresh timed out.'
          : 'GitHub metadata could not be refreshed.'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildGithubPullRequestFields(value?: string | null): Promise<{
  githubPrUrl: string | null;
  githubPrMetadata: Prisma.InputJsonValue | typeof Prisma.DbNull;
}> {
  const reference = normalizeGithubPullRequestUrl(value);
  if (!reference) {
    return { githubPrUrl: null, githubPrMetadata: Prisma.DbNull };
  }

  const metadata = await fetchGithubPullRequestMetadata(reference);
  return {
    githubPrUrl: reference.url,
    githubPrMetadata: metadata as Prisma.InputJsonValue
  };
}

async function buildGithubIssueFields(value?: string | null): Promise<{
  githubIssueUrl: string | null;
  githubIssueMetadata: Prisma.InputJsonValue | typeof Prisma.DbNull;
}> {
  const reference = normalizeGithubIssueUrl(value);
  if (!reference) {
    return { githubIssueUrl: null, githubIssueMetadata: Prisma.DbNull };
  }

  const metadata = await fetchGithubIssueMetadata(reference);
  return {
    githubIssueUrl: reference.url,
    githubIssueMetadata: metadata as Prisma.InputJsonValue
  };
}

function isTestChangeContextLinkKind(value: unknown): value is TestChangeContextLinkKind {
  return (
    typeof value === 'string' &&
    TEST_CHANGE_CONTEXT_LINK_KINDS.includes(value as TestChangeContextLinkKind)
  );
}

function trimmedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength).trim() : '';
}

function normalizeContextLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function inferContextLinkKind(url: string): TestChangeContextLinkKind {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === 'discord.com' || hostname.endsWith('.discord.com')) {
      return 'DISCORD';
    }
    if (hostname === 'discordapp.com' || hostname.endsWith('.discordapp.com')) {
      return 'DISCORD';
    }
    if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
      return 'GITHUB';
    }
    if (/docs?|wiki|notion|confluence|readme/.test(hostname)) {
      return 'DOCUMENT';
    }
  } catch {
    // Fall through to OTHER below.
  }

  return 'OTHER';
}

function contextLinkFallbackLabel(kind: TestChangeContextLinkKind, url: string): string {
  const labels: Record<TestChangeContextLinkKind, string> = {
    DISCORD: 'Discord context',
    GITHUB: 'GitHub reference',
    DOCUMENT: 'Documentation',
    OTHER: 'Context link'
  };

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return `${labels[kind]} · ${hostname}`;
  } catch {
    return labels[kind];
  }
}

function normalizeContextLinks(value: unknown): Array<{
  id: string;
  kind: TestChangeContextLinkKind;
  label: string;
  url: string;
  description: string;
}> {
  const rawLinks = Array.isArray(value) ? value.slice(0, 20) : [];

  return rawLinks
    .map((item) => {
      const raw = jsonObject(item);
      if (!raw) {
        return null;
      }

      const url = normalizeContextLinkUrl(raw.url);
      if (!url) {
        return null;
      }

      const kind = isTestChangeContextLinkKind(raw.kind) ? raw.kind : inferContextLinkKind(url);
      const rawId = trimmedString(raw.id, 64);
      const id = /^[A-Za-z0-9_-]{1,64}$/.test(rawId) ? rawId : `ctx_${randomUUID()}`;
      const label = trimmedString(raw.label, 140) || contextLinkFallbackLabel(kind, url);
      const description = trimmedString(raw.description, 500);

      return { id, kind, label, url, description };
    })
    .filter(
      (
        link
      ): link is {
        id: string;
        kind: TestChangeContextLinkKind;
        label: string;
        url: string;
        description: string;
      } => Boolean(link)
    );
}

function contextLinksJson(value: unknown): Prisma.InputJsonValue {
  return normalizeContextLinks(value) as Prisma.InputJsonValue;
}

function normalizeChecklistInput(
  checklist: TestChangeChecklistInput[]
): NormalizedTestChangeChecklistInput[] {
  const seenIds = new Set<string>();

  return checklist.map((item, index) => {
    const id = item.id?.trim() || undefined;
    if (id) {
      if (seenIds.has(id)) {
        throw new Error('Duplicate checklist item in update payload.');
      }
      seenIds.add(id);
    }

    const title = item.title.trim();
    if (!title) {
      throw new Error('Checklist item title is required.');
    }

    return {
      id,
      title,
      details: item.details?.trim() || null,
      category: item.category?.trim() || null,
      sortOrder: index
    };
  });
}

function serializeGithubPullRequest(url: string | null, metadata: Prisma.JsonValue | null) {
  let reference: GitHubPullRequestReference | null = null;
  try {
    reference = url ? normalizeGithubPullRequestUrl(url) : null;
  } catch {
    reference = null;
  }

  if (!reference) {
    return null;
  }

  const value = githubObject(metadata);
  const available = typeof value.available === 'boolean' ? value.available : false;

  return {
    ...reference,
    metadata: {
      available,
      fetchedAt: githubString(value.fetchedAt),
      statusMessage: githubString(value.statusMessage),
      htmlUrl: githubString(value.htmlUrl) ?? reference.url,
      title: githubString(value.title),
      state: githubString(value.state),
      draft: githubBoolean(value.draft) ?? false,
      merged: githubBoolean(value.merged) ?? false,
      mergedAt: githubString(value.mergedAt),
      authorLogin: githubString(value.authorLogin),
      authorAvatarUrl: githubString(value.authorAvatarUrl),
      createdAt: githubString(value.createdAt),
      updatedAt: githubString(value.updatedAt),
      baseRef: githubString(value.baseRef),
      headRef: githubString(value.headRef),
      additions: githubNumber(value.additions),
      deletions: githubNumber(value.deletions),
      changedFiles: githubNumber(value.changedFiles),
      comments: githubNumber(value.comments),
      reviewComments: githubNumber(value.reviewComments),
      labels: githubLabels(value.labels)
    }
  };
}

function serializeGithubIssue(url: string | null, metadata: Prisma.JsonValue | null) {
  let reference: GitHubIssueReference | null = null;
  try {
    reference = url ? normalizeGithubIssueUrl(url) : null;
  } catch {
    reference = null;
  }

  if (!reference) {
    return null;
  }

  const value = githubObject(metadata);
  const available = typeof value.available === 'boolean' ? value.available : false;

  return {
    ...reference,
    metadata: {
      available,
      fetchedAt: githubString(value.fetchedAt),
      statusMessage: githubString(value.statusMessage),
      htmlUrl: githubString(value.htmlUrl) ?? reference.url,
      title: githubString(value.title),
      state: githubString(value.state),
      authorLogin: githubString(value.authorLogin),
      authorAvatarUrl: githubString(value.authorAvatarUrl),
      createdAt: githubString(value.createdAt),
      updatedAt: githubString(value.updatedAt),
      closedAt: githubString(value.closedAt),
      comments: githubNumber(value.comments),
      labels: githubLabels(value.labels)
    }
  };
}

export async function getTestManagerUserPermissions(
  user: Pick<UserName, 'admin' | 'guide' | 'tester'>
): Promise<TestManagerPermissionKey[]> {
  const settings = await getTestManagerSettings();
  const roleKey = roleKeyForUser(user);
  return settings.roles.find((role) => role.key === roleKey)?.permissions ?? [];
}

export async function userCanViewTestManager(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true, guide: true, tester: true }
  });
  if (!user) {
    return false;
  }

  return (await getTestManagerUserPermissions(user)).includes('view');
}

export async function ensureCanViewTestManager(userId: string): Promise<void> {
  if (!(await userCanViewTestManager(userId))) {
    throw new Error('Test Manager view permission required.');
  }
}

export async function userCanManageTestManagerSettings(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true, guide: true, tester: true }
  });
  if (!user) {
    return false;
  }

  return (await getTestManagerUserPermissions(user)).includes('settings');
}

export async function ensureCanManageTestManagerSettings(userId: string): Promise<void> {
  if (!(await userCanManageTestManagerSettings(userId))) {
    throw new Error('Test Manager settings permission required.');
  }
}

export async function userCanManageTestManagerTesters(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { admin: true, guide: true, tester: true }
  });
  if (!user) {
    return false;
  }

  return (await getTestManagerUserPermissions(user)).includes('manageTesters');
}

export async function ensureCanManageTestManagerTesters(userId: string): Promise<void> {
  if (!(await userCanManageTestManagerTesters(userId))) {
    throw new Error('Test Manager tester management permission required.');
  }
}

const RICH_TEXT_TAG_ALIASES: Record<string, string> = {
  b: 'strong',
  i: 'em',
  div: 'p'
};
const RICH_TEXT_ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'a'
]);
const RICH_TEXT_STRIPPED_TAGS = new Set(['span', 'font']);

function decodeHtmlEntities(value: string): string {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    const next = decoded.replace(
      /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, body) => {
        const normalized = String(body).toLowerCase();
        if (normalized === 'amp') return '&';
        if (normalized === 'lt') return '<';
        if (normalized === 'gt') return '>';
        if (normalized === 'quot') return '"';
        if (normalized === 'apos') return "'";
        if (normalized === 'nbsp') return ' ';
        if (normalized.startsWith('#x')) {
          const codePoint = Number.parseInt(normalized.slice(2), 16);
          return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity;
        }
        if (normalized.startsWith('#')) {
          const codePoint = Number.parseInt(normalized.slice(1), 10);
          return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity;
        }
        return entity;
      }
    );
    if (next === decoded) {
      return next;
    }
    decoded = next;
  }
  return decoded;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] ?? char
  );
}

type GithubReference = {
  href: string;
  label: string;
};

const GITHUB_REFERENCE_TEXT_PATTERN =
  /\[[^\]\n]{1,200}\]\((https:\/\/github\.com\/[^\s<>()]+)\)|(https:\/\/github\.com\/[^\s<>()]+)/gi;
const GITHUB_REFERENCE_TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function parseGithubReferenceUrl(value: string): GithubReference | null {
  try {
    const url = new URL(decodeHtmlEntities(value).trim());
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
      return null;
    }

    const [owner, repo, kind, number] = url.pathname.split('/').filter(Boolean);
    if (
      !owner ||
      !repo ||
      !['pull', 'issues'].includes(kind) ||
      !/^[1-9][0-9]*$/.test(number) ||
      !/^[A-Za-z0-9_.-]+$/.test(owner) ||
      !/^[A-Za-z0-9_.-]+$/.test(repo)
    ) {
      return null;
    }

    return {
      href: `https://github.com/${owner}/${repo}/${kind}/${number}`,
      label: `${owner}/${repo}#${number}`
    };
  } catch {
    return null;
  }
}

function githubReferenceAnchor(reference: GithubReference): string {
  return `<a href="${escapeHtml(reference.href)}" class="tm-github-ref" target="_blank" rel="noopener noreferrer" data-github-ref="true">${escapeHtml(reference.label)}</a>`;
}

function linkifyGithubReferences(value: string): string {
  let cursor = 0;
  let output = '';

  for (const match of value.matchAll(GITHUB_REFERENCE_TEXT_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const rawUrl = match[1] ?? match[2] ?? '';
    const isMarkdownLink = Boolean(match[1]);
    const url = isMarkdownLink ? rawUrl : rawUrl.replace(GITHUB_REFERENCE_TRAILING_PUNCTUATION, '');
    const trailing = isMarkdownLink ? '' : rawUrl.slice(url.length);
    const reference = parseGithubReferenceUrl(url);
    if (!reference) {
      continue;
    }

    output += escapeHtml(value.slice(cursor, matchIndex));
    output += githubReferenceAnchor(reference);
    output += escapeHtml(trailing);
    cursor = matchIndex + match[0].length;
  }

  output += escapeHtml(value.slice(cursor));
  return output;
}

function normalizeRichTextTag(tag: string): string | null {
  const match = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)(?:\s[^>]*)?\s*(\/?)>$/i);
  if (!match) {
    return null;
  }

  const tagName = match[2].toLowerCase();
  if (RICH_TEXT_STRIPPED_TAGS.has(tagName)) {
    return '';
  }

  const normalizedName = RICH_TEXT_TAG_ALIASES[tagName] ?? tagName;
  if (!RICH_TEXT_ALLOWED_TAGS.has(normalizedName)) {
    return null;
  }

  if (normalizedName === 'br') {
    return '<br>';
  }

  if (normalizedName === 'a') {
    if (match[1]) {
      return '</a>';
    }
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const reference = href ? parseGithubReferenceUrl(href[1] ?? href[2] ?? href[3] ?? '') : null;
    return reference
      ? `<a href="${escapeHtml(reference.href)}" class="tm-github-ref" target="_blank" rel="noopener noreferrer" data-github-ref="true">`
      : null;
  }

  return match[1] ? `</${normalizedName}>` : `<${normalizedName}>`;
}

function sanitizeRichText(value: string): string {
  const withoutUnsafeBlocks = value
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)[^>]*>/gi, '');
  const tagPattern = /<[^>]*>/g;
  let cursor = 0;
  let sanitized = '';
  let anchorDepth = 0;

  for (const match of withoutUnsafeBlocks.matchAll(tagPattern)) {
    const textSegment = decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor, match.index));
    sanitized += anchorDepth > 0 ? escapeHtml(textSegment) : linkifyGithubReferences(textSegment);

    let sanitizedTag = normalizeRichTextTag(match[0]);
    if (sanitizedTag?.startsWith('<a ')) {
      anchorDepth += 1;
    } else if (sanitizedTag === '</a>') {
      if (anchorDepth <= 0) {
        sanitizedTag = null;
      } else {
        anchorDepth -= 1;
      }
    }
    sanitized += sanitizedTag ?? escapeHtml(decodeHtmlEntities(match[0]));
    cursor = (match.index ?? 0) + match[0].length;
  }

  const trailingText = decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor));
  sanitized += anchorDepth > 0 ? escapeHtml(trailingText) : linkifyGithubReferences(trailingText);
  return sanitized
    .replace(/(?:\u00a0|&nbsp;)/gi, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function getRichTextPlainText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findLatestSavedTesterNoteForResult(
  changeId: string,
  authorId: string,
  testerId: string,
  startedAt: Date | null
) {
  const where: Prisma.TestChangeNoteWhereInput = {
    changeId,
    authorId,
    result: null,
    OR: [{ testerId }, { testerId: null }]
  };
  if (startedAt) {
    where.createdAt = { gte: startedAt };
  }

  const notes = await prisma.testChangeNote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      contentHtml: true
    }
  });

  return notes.find((note) => getRichTextPlainText(note.contentHtml)) ?? null;
}

function cloneDefaultTestManagerSettings(): TestManagerSettings {
  return {
    schemaVersion: DEFAULT_TEST_MANAGER_SETTINGS.schemaVersion,
    roles: DEFAULT_TEST_MANAGER_SETTINGS.roles.map((role) => ({
      ...role,
      permissions: [...role.permissions]
    })),
    discordNotifications: {
      ...DEFAULT_TEST_MANAGER_SETTINGS.discordNotifications,
      events: [...DEFAULT_TEST_MANAGER_SETTINGS.discordNotifications.events]
    }
  };
}

function normalizeTestServerVersion(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function testServerVersionParts(value: string | null | undefined): number[] | null {
  const parts = normalizeTestServerVersion(value)?.match(/\d+/g);
  if (!parts?.length) {
    return null;
  }

  return parts.map((part) => Number(part));
}

function compareTestServerVersions(
  left: string | null | undefined,
  right: string | null | undefined
): number | null {
  const leftParts = testServerVersionParts(left);
  const rightParts = testServerVersionParts(right);
  if (!leftParts || !rightParts) {
    return null;
  }

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

function isTestServerVersionNewerThanCurrent(
  changeVersion: string | null | undefined,
  currentVersion: string | null | undefined
): boolean {
  const comparison = compareTestServerVersions(changeVersion, currentVersion);
  return comparison !== null && comparison > 0;
}

function isTestServerVersionCoveredByCurrent(
  changeVersion: string | null | undefined,
  currentVersion: string | null | undefined
): boolean {
  const comparison = compareTestServerVersions(changeVersion, currentVersion);
  return comparison !== null && comparison <= 0;
}

function isRoleKey(value: unknown): value is TestManagerRoleKey {
  return typeof value === 'string' && TEST_MANAGER_ROLE_KEYS.includes(value as TestManagerRoleKey);
}

function isPermissionKey(value: unknown): value is TestManagerPermissionKey {
  return (
    typeof value === 'string' &&
    TEST_MANAGER_PERMISSION_KEYS.includes(value as TestManagerPermissionKey)
  );
}

function isDiscordEventKey(value: unknown): value is TestManagerDiscordEventKey {
  return (
    typeof value === 'string' &&
    TEST_MANAGER_DISCORD_EVENT_KEYS.includes(value as TestManagerDiscordEventKey)
  );
}

function normalizePermissions(value: unknown): TestManagerPermissionKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const selected = new Set(value.filter(isPermissionKey));
  return TEST_MANAGER_PERMISSION_KEYS.filter((permission) => selected.has(permission));
}

function normalizeDiscordNotificationSettings(
  value: unknown
): TestManagerSettings['discordNotifications'] {
  const defaults = cloneDefaultTestManagerSettings().discordNotifications;
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const eventSource = Array.isArray(record.events) ? record.events : defaults.events;
  const selectedEvents = new Set(eventSource.filter(isDiscordEventKey));

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled,
    webhookUrl: typeof record.webhookUrl === 'string' ? record.webhookUrl.trim() : '',
    events: TEST_MANAGER_DISCORD_EVENT_KEYS.filter((event) => selectedEvents.has(event))
  };
}

function normalizeTestManagerSettings(
  value: unknown,
  options: { preserveNoteForPass?: boolean } = {}
): TestManagerSettings {
  const defaults = cloneDefaultTestManagerSettings();
  const canPreserveNoteForPass =
    options.preserveNoteForPass ||
    (value !== null &&
      typeof value === 'object' &&
      (value as Record<string, unknown>).schemaVersion === TEST_MANAGER_SETTINGS_SCHEMA_VERSION);
  if (!value || typeof value !== 'object' || !('roles' in value) || !Array.isArray(value.roles)) {
    return {
      ...defaults,
      discordNotifications: normalizeDiscordNotificationSettings(
        value && typeof value === 'object' && 'discordNotifications' in value
          ? (value as Record<string, unknown>).discordNotifications
          : undefined
      )
    };
  }

  const incoming = new Map<TestManagerRoleKey, TestManagerPermissionKey[]>();
  for (const role of value.roles) {
    if (!role || typeof role !== 'object' || !('key' in role) || !isRoleKey(role.key)) {
      continue;
    }

    incoming.set(role.key, normalizePermissions('permissions' in role ? role.permissions : []));
  }

  return {
    schemaVersion: TEST_MANAGER_SETTINGS_SCHEMA_VERSION,
    roles: defaults.roles.map((role) => ({
      ...role,
      permissions:
        role.key === 'ADMIN'
          ? normalizePermissions([
              ...ADMIN_TEST_MANAGER_PERMISSIONS,
              ...(canPreserveNoteForPass && incoming.get(role.key)?.includes('noteForPass')
                ? ['noteForPass']
                : [])
            ])
          : (incoming.get(role.key) ?? role.permissions).filter(
              (permission) => canPreserveNoteForPass || permission !== 'noteForPass'
            )
    })),
    discordNotifications: normalizeDiscordNotificationSettings(
      'discordNotifications' in value ? value.discordNotifications : undefined
    )
  };
}

async function appendHistory(
  tx: Prisma.TransactionClient,
  input: {
    changeId: string;
    actorUserId: string | null;
    eventType: TestHistoryEventType;
    label: string;
    detail?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }
) {
  await tx.testChangeHistory.create({
    data: {
      changeId: input.changeId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      label: input.label,
      detail: input.detail ?? null,
      metadata: input.metadata ?? undefined
    }
  });
}

async function readCurrentTestServerVersion(
  client: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma
): Promise<string | null> {
  const setting = await client.systemSetting.findUnique({
    where: { key: TEST_MANAGER_CURRENT_VERSION_KEY }
  });

  return normalizeTestServerVersion(setting?.value);
}

async function readCurrentLiveServerVersion(
  client: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma
): Promise<string | null> {
  const setting = await client.systemSetting.findUnique({
    where: { key: TEST_MANAGER_CURRENT_LIVE_VERSION_KEY }
  });

  return normalizeTestServerVersion(setting?.value);
}

function futureVersionDetail(changeVersion: string, currentVersion: string): string {
  return `This change targets ${changeVersion}, which is newer than the current test server version ${currentVersion}.`;
}

async function pauseFutureReadyChanges(
  tx: Prisma.TransactionClient,
  actorUserId: string | null,
  currentTestServerVersion: string
): Promise<number> {
  const readyChanges = await tx.testChange.findMany({
    where: {
      readyToTest: true,
      testServerVersion: { not: null }
    },
    select: {
      id: true,
      testServerVersion: true
    }
  });
  const futureChanges = readyChanges.filter(
    (change) =>
      change.testServerVersion &&
      isTestServerVersionNewerThanCurrent(change.testServerVersion, currentTestServerVersion)
  );
  if (!futureChanges.length) {
    return 0;
  }

  await tx.testChange.updateMany({
    where: { id: { in: futureChanges.map((change) => change.id) } },
    data: { readyToTest: false }
  });

  for (const change of futureChanges) {
    await appendHistory(tx, {
      changeId: change.id,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: 'Ready to test disabled',
      detail: futureVersionDetail(change.testServerVersion ?? '', currentTestServerVersion),
      metadata: {
        from: { readyToTest: true, testServerVersion: change.testServerVersion },
        to: { readyToTest: false, testServerVersion: change.testServerVersion },
        currentTestServerVersion,
        reason: 'versionNewerThanCurrent'
      }
    });
  }

  return futureChanges.length;
}

function historyMetadataReason(metadata: Prisma.JsonValue | null): string | null {
  const record = jsonObject(metadata);
  return typeof record?.reason === 'string' ? record.reason : null;
}

function historyMetadataChangesReadyToTest(metadata: Prisma.JsonValue | null): boolean {
  const record = jsonObject(metadata);
  const from = jsonObject(record?.from);
  const to = jsonObject(record?.to);
  return (
    typeof from?.readyToTest === 'boolean' &&
    typeof to?.readyToTest === 'boolean' &&
    from.readyToTest !== to.readyToTest
  );
}

function wasLatestReadinessChangeVersionPause(
  history: Array<{ metadata: Prisma.JsonValue | null }>
): boolean {
  for (const entry of history) {
    const reason = historyMetadataReason(entry.metadata);
    if (reason === 'versionNewerThanCurrent') {
      return true;
    }
    if (historyMetadataChangesReadyToTest(entry.metadata)) {
      return false;
    }
  }

  return false;
}

async function resumeVersionPausedChanges(
  tx: Prisma.TransactionClient,
  actorUserId: string | null,
  currentTestServerVersion: string
): Promise<number> {
  const pausedChanges = await tx.testChange.findMany({
    where: {
      readyToTest: false,
      testServerVersion: { not: null }
    },
    select: {
      id: true,
      testServerVersion: true,
      history: {
        where: { eventType: TestHistoryEventType.STATUS_CHANGED },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { metadata: true }
      }
    }
  });
  const readyChanges = pausedChanges.filter(
    (change) =>
      change.testServerVersion &&
      isTestServerVersionCoveredByCurrent(change.testServerVersion, currentTestServerVersion) &&
      wasLatestReadinessChangeVersionPause(change.history)
  );
  if (!readyChanges.length) {
    return 0;
  }

  await tx.testChange.updateMany({
    where: { id: { in: readyChanges.map((change) => change.id) } },
    data: { readyToTest: true }
  });

  for (const change of readyChanges) {
    await appendHistory(tx, {
      changeId: change.id,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: 'Ready to test enabled',
      detail: `The current test server version ${currentTestServerVersion} now covers this change's active version ${change.testServerVersion}. Tester input was re-enabled automatically.`,
      metadata: {
        from: { readyToTest: false, testServerVersion: change.testServerVersion },
        to: { readyToTest: true, testServerVersion: change.testServerVersion },
        currentTestServerVersion,
        reason: 'versionCaughtUpToCurrent'
      }
    });
  }

  return readyChanges.length;
}

const baseChangeInclude = {
  createdBy: {
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true
    }
  },
  assignedTo: {
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true
    }
  },
  closedBy: {
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true
    }
  },
  checklist: {
    orderBy: { sortOrder: 'asc' as const }
  },
  testers: {
    orderBy: { updatedAt: 'desc' as const },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true,
          admin: true,
          guide: true,
          tester: true
        }
      },
      requestedBy: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true,
          admin: true,
          guide: true,
          tester: true
        }
      },
      _count: {
        select: { notes: true }
      },
      checklistProgress: {
        include: {
          checklistItem: {
            select: {
              id: true,
              sortOrder: true
            }
          }
        }
      }
    }
  },
  notes: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true,
          admin: true,
          guide: true,
          tester: true
        }
      }
    }
  },
  history: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: {
      actor: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true,
          admin: true,
          guide: true,
          tester: true
        }
      }
    }
  }
};

const webhookReportInclude = {
  orderBy: { createdAt: 'desc' as const },
  include: {
    linkedBy: {
      select: {
        id: true,
        displayName: true,
        nickname: true,
        email: true,
        admin: true,
        guide: true,
        tester: true
      }
    },
    message: {
      select: {
        id: true,
        webhookId: true,
        receivedAt: true,
        status: true,
        payload: true,
        rawBody: true,
        webhook: {
          select: {
            id: true,
            label: true
          }
        },
        labelAssignments: {
          include: { label: true }
        },
        actionRuns: {
          where: {
            action: { type: InboundWebhookActionType.CRASH_REVIEW }
          },
          select: {
            id: true,
            status: true,
            result: true,
            createdAt: true,
            action: {
              select: { type: true }
            }
          },
          orderBy: { createdAt: 'desc' as const },
          take: 3
        }
      }
    }
  }
};

const changeInclude = {
  ...baseChangeInclude,
  webhookReports: webhookReportInclude
};

const changeListInclude = {
  ...baseChangeInclude,
  webhookReports: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      messageId: true,
      changeId: true,
      linkedById: true,
      createdAt: true,
      linkedBy: {
        select: {
          id: true,
          displayName: true,
          nickname: true,
          email: true,
          admin: true,
          guide: true,
          tester: true
        }
      },
      message: {
        select: {
          id: true,
          webhookId: true,
          receivedAt: true,
          status: true,
          webhook: {
            select: { id: true, label: true }
          }
        }
      }
    }
  }
};

type ChangeRecord = Prisma.TestChangeGetPayload<{ include: typeof changeInclude }>;
type ChangeListRecord = Prisma.TestChangeGetPayload<{ include: typeof changeListInclude }>;
type ChangeSerializeRecord = ChangeRecord | ChangeListRecord;

type WebhookReportLinkRecord = ChangeRecord['webhookReports'][number];
type WebhookReportListLinkRecord = ChangeListRecord['webhookReports'][number];

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function latestCrashReviewRun(link: WebhookReportLinkRecord) {
  return link.message.actionRuns[0] ?? null;
}

function webhookReportSummary(link: WebhookReportLinkRecord): string | null {
  const result = jsonObject(latestCrashReviewRun(link)?.result);
  const summary = result && typeof result.summary === 'string' ? result.summary.trim() : '';
  return summary.length > 0 ? summary : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function webhookReportRawReport(link: WebhookReportLinkRecord): string | null {
  const rawReport = buildCrashReviewInput(
    link.message.payload,
    link.message.rawBody,
    link.message.payload
  );
  const trimmed = rawReport.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function webhookReportAiReview(link: WebhookReportLinkRecord) {
  const result = jsonObject(latestCrashReviewRun(link)?.result);
  if (!result) {
    return null;
  }

  const signature = jsonObject(result.signature);
  const hypotheses = Array.isArray(result.hypotheses)
    ? result.hypotheses
        .map((item) => {
          const hypothesis = jsonObject(item);
          if (!hypothesis) {
            return null;
          }
          return {
            title: typeof hypothesis.title === 'string' ? hypothesis.title : 'Untitled hypothesis',
            confidence:
              typeof hypothesis.confidence === 'number' && Number.isFinite(hypothesis.confidence)
                ? hypothesis.confidence
                : null,
            evidence: stringArray(hypothesis.evidence),
            nextSteps: stringArray(hypothesis.nextSteps)
          };
        })
        .filter(
          (
            item
          ): item is {
            title: string;
            confidence: number | null;
            evidence: string[];
            nextSteps: string[];
          } => Boolean(item)
        )
    : [];

  return {
    summary:
      typeof result.summary === 'string' && result.summary.trim() ? result.summary.trim() : null,
    signature: signature
      ? {
          exception: typeof signature.exception === 'string' ? signature.exception : null,
          topFrame: typeof signature.topFrame === 'string' ? signature.topFrame : null
        }
      : null,
    hypotheses,
    missingInfo: stringArray(result.missingInfo),
    recommendedNextSteps: stringArray(result.recommendedNextSteps),
    rawModelNotes:
      typeof result.rawModelNotes === 'string' && result.rawModelNotes.trim()
        ? result.rawModelNotes.trim()
        : null
  };
}

function webhookReportType(link: WebhookReportLinkRecord): string {
  const label = link.message.labelAssignments
    .map((assignment) => assignment.label.name)
    .find((name) => /crash|script|error/i.test(name));
  if (label) {
    return label;
  }

  return latestCrashReviewRun(link) ? 'AI-reviewed report' : 'Webhook report';
}

function serializeWebhookReportLink(link: WebhookReportLinkRecord) {
  const run = latestCrashReviewRun(link);
  const summary = webhookReportSummary(link);
  return {
    id: link.id,
    messageId: link.messageId,
    webhookId: link.message.webhookId,
    webhookLabel: link.message.webhook?.label ?? 'Webhook',
    receivedAt: link.message.receivedAt.toISOString(),
    status: link.message.status,
    reportType: webhookReportType(link),
    summary,
    rawReport: webhookReportRawReport(link),
    aiReview: webhookReportAiReview(link),
    aiReviewStatus: run?.status ?? null,
    hasAiReview: Boolean(run),
    linkedAt: link.createdAt.toISOString(),
    linkedBy: serializeUser(link.linkedBy)
  };
}

function serializeWebhookReportListLink(link: WebhookReportListLinkRecord) {
  return {
    id: link.id,
    messageId: link.messageId,
    webhookId: link.message.webhookId,
    webhookLabel: link.message.webhook?.label ?? 'Webhook',
    receivedAt: link.message.receivedAt.toISOString(),
    status: link.message.status,
    reportType: 'Webhook report',
    summary: null,
    rawReport: null,
    aiReview: null,
    aiReviewStatus: null,
    hasAiReview: false,
    linkedAt: link.createdAt.toISOString(),
    linkedBy: serializeUser(link.linkedBy)
  };
}

function hasDetailedWebhookReport(
  link: WebhookReportLinkRecord | WebhookReportListLinkRecord
): link is WebhookReportLinkRecord {
  return 'labelAssignments' in link.message && 'actionRuns' in link.message;
}

function serializeChange(change: ChangeSerializeRecord, viewerUserId?: string) {
  const testerRows = change.testers.map((tester) => ({
    id: tester.id,
    assignment: tester.assignment,
    status: tester.status,
    result: tester.result,
    notesHtml: tester.notesHtml ?? '',
    notesCount: tester._count.notes,
    startedAt: tester.startedAt?.toISOString() ?? null,
    completedAt: tester.completedAt?.toISOString() ?? null,
    createdAt: tester.createdAt.toISOString(),
    updatedAt: tester.updatedAt.toISOString(),
    user: serializeUser(tester.user),
    requestedBy: serializeUser(tester.requestedBy),
    checklistProgress: change.checklist.map((item) => {
      const progress = tester.checklistProgress.find((entry) => entry.checklistItemId === item.id);
      return {
        checklistItemId: item.id,
        completed: Boolean(progress?.completed),
        completedAt: progress?.completedAt?.toISOString() ?? null,
        notesHtml: progress?.notesHtml ?? '',
        updatedAt: progress?.updatedAt.toISOString() ?? null
      };
    })
  }));

  // A checklist item with children is a "sub-checklist" group container; its completion is
  // derived from its children and it never stores its own progress. Coverage/progress stats
  // therefore count only leaf items (standalone items and sub-items).
  const childCountByParent = new Map<string, number>();
  for (const item of change.checklist) {
    if (item.parentId) {
      childCountByParent.set(item.parentId, (childCountByParent.get(item.parentId) ?? 0) + 1);
    }
  }
  const leafItems = change.checklist.filter((item) => (childCountByParent.get(item.id) ?? 0) === 0);
  const checklistCompleted = leafItems.filter((item) =>
    testerRows.some((tester) =>
      tester.checklistProgress.some(
        (progress) => progress.checklistItemId === item.id && progress.completed
      )
    )
  ).length;
  const viewerTester = viewerUserId
    ? (testerRows.find((tester) => tester.user?.id === viewerUserId) ?? null)
    : null;

  return {
    id: change.id,
    publicId: change.publicId,
    title: change.title,
    description: change.description,
    category: change.category,
    subsystem: change.subsystem,
    priority: change.priority,
    status: change.status,
    targetBuild: change.targetBuild ?? null,
    testServerVersion: change.testServerVersion ?? null,
    githubPullRequest: serializeGithubPullRequest(change.githubPrUrl, change.githubPrMetadata),
    githubIssue: serializeGithubIssue(change.githubIssueUrl, change.githubIssueMetadata),
    contextLinks: normalizeContextLinks(change.contextLinks),
    includeInNextPatch: change.includeInNextPatch,
    readyToTest: change.readyToTest,
    autoClosePassCount: change.autoClosePassCount,
    dueAt: change.dueAt?.toISOString() ?? null,
    closedAt: change.closedAt?.toISOString() ?? null,
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
    createdBy: serializeUser(change.createdBy),
    assignedTo: serializeUser(change.assignedTo),
    closedBy: serializeUser(change.closedBy),
    checklist: change.checklist.map((item) => ({
      id: item.id,
      title: item.title,
      details: item.details ?? '',
      category: item.category ?? '',
      sortOrder: item.sortOrder,
      parentId: item.parentId ?? null,
      childCount: childCountByParent.get(item.id) ?? 0
    })),
    testers: testerRows,
    notes: change.notes.map((note) => ({
      id: note.id,
      contentHtml: note.contentHtml,
      result: note.result,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      author: serializeUser(note.author),
      canDelete: viewerUserId ? note.authorId === viewerUserId : false
    })),
    history: change.history.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      label: event.label,
      detail: event.detail ?? '',
      metadata: event.metadata ?? null,
      createdAt: event.createdAt.toISOString(),
      actor: serializeUser(event.actor)
    })),
    webhookReports: change.webhookReports.map((link) =>
      hasDetailedWebhookReport(link)
        ? serializeWebhookReportLink(link)
        : serializeWebhookReportListLink(link)
    ),
    summary: {
      testerCount: testerRows.length,
      requiredTesterCount: testerRows.filter(
        (tester) => tester.assignment === TestAssignmentKind.REQUIRED
      ).length,
      passCount: testerRows.filter((tester) => tester.result === TestResult.PASS).length,
      failCount: testerRows.filter((tester) => tester.result === TestResult.FAIL).length,
      blockedCount: testerRows.filter((tester) => tester.result === TestResult.BLOCKED).length,
      inProgressCount: testerRows.filter((tester) => tester.status === TestRunStatus.TESTING)
        .length,
      checklistCount: leafItems.length,
      checklistCompleted,
      checklistProgressTotal: testerRows.reduce(
        (total, tester) =>
          total + tester.checklistProgress.filter((progress) => progress.completed).length,
        0
      ),
      checklistProgressPossible: testerRows.length * leafItems.length
    },
    viewerTester
  };
}

type SerializedChange = ReturnType<typeof serializeChange>;

interface DiscordWebhookBody {
  username?: string;
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
  embeds: Array<{
    title: string;
    description?: string;
    color: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
    url?: string;
  }>;
}

type TestManagerDiscordNotificationInput = {
  event: TestManagerDiscordEventKey;
  actorUserId: string | null;
  change: SerializedChange;
  detail?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

type DiscordDeepLinkTab = 'Overview' | 'Testers' | 'Coverage' | 'History';

const TEST_MANAGER_DISCORD_EVENT_META: Record<
  TestManagerDiscordEventKey,
  { label: string; color: number }
> = {
  'change.created': { label: 'Change Submitted', color: DISCORD_COLORS.primary },
  'change.statusChanged': { label: 'Change Status Updated', color: DISCORD_COLORS.info },
  'change.renewed': { label: 'Change Renewed', color: DISCORD_COLORS.primary },
  'change.closed': { label: 'Change Closed', color: DISCORD_COLORS.success },
  'change.deleted': { label: 'Change Deleted', color: DISCORD_COLORS.danger },
  'tester.requested': { label: 'Tester Requested', color: DISCORD_COLORS.warning },
  'tester.started': { label: 'Testing Started', color: DISCORD_COLORS.primary },
  'tester.retested': { label: 'Re-test Started', color: DISCORD_COLORS.primary },
  'tester.resultSubmitted': { label: 'Tester Result Submitted', color: DISCORD_COLORS.success },
  'checklist.completed': { label: 'Checklist Item Completed', color: DISCORD_COLORS.success },
  'checklist.reopened': { label: 'Checklist Item Reopened', color: DISCORD_COLORS.warning },
  'checklist.noteUpdated': { label: 'Checklist Note Updated', color: DISCORD_COLORS.info },
  'note.added': { label: 'Testing Note Added', color: DISCORD_COLORS.info }
};

const TEST_MANAGER_DISCORD_AVATAR_PATH = '/cw-nexus-logo.png';
const testManagerDiscordClientBaseUrl = resolvePublicClientBaseUrl('Test Manager Discord links');

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateDiscord(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function buildClientAssetUrl(pathname: string): string | null {
  if (!testManagerDiscordClientBaseUrl) {
    return null;
  }

  return new URL(pathname, `${testManagerDiscordClientBaseUrl}/`).toString();
}

function buildChangeUrl(
  change: SerializedChange,
  tab?: DiscordDeepLinkTab,
  focus?: 'notes'
): string | null {
  if (!testManagerDiscordClientBaseUrl) {
    return null;
  }

  const url = new URL(`${testManagerDiscordClientBaseUrl}/test-manager/changes/${change.id}`);

  if (tab && tab !== 'Overview') {
    url.searchParams.set('tab', tab);
  }

  if (focus === 'notes') {
    url.searchParams.set('notes', '1');
  }

  return url.toString();
}

function discordDeepLinkTabForEvent(
  event: TestManagerDiscordEventKey
): DiscordDeepLinkTab | undefined {
  if (event.startsWith('tester.')) {
    return 'Testers';
  }

  if (event.startsWith('checklist.')) {
    return 'Coverage';
  }

  if (event === 'change.statusChanged' || event === 'change.renewed' || event === 'change.closed') {
    return 'History';
  }

  return undefined;
}

function discordDeepLinkLabelForEvent(event: TestManagerDiscordEventKey): string {
  if (event.startsWith('tester.')) {
    return 'Open tester matrix';
  }

  if (event.startsWith('checklist.')) {
    return 'Open checklist coverage';
  }

  if (event === 'change.statusChanged' || event === 'change.renewed' || event === 'change.closed') {
    return 'Open change history';
  }

  if (event === 'note.added') {
    return 'Open testing notes';
  }

  return 'Open change';
}

function buildDiscordTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not set';
  }

  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? `<t:${timestamp}:R>` : 'Not set';
}

function isConfiguredDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(
        url.hostname
      ) &&
      /^\/api\/webhooks\/[^/]+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function buildTestManagerDiscordPayload(
  input: TestManagerDiscordNotificationInput,
  actor: UserName | null
): DiscordWebhookBody {
  const meta = TEST_MANAGER_DISCORD_EVENT_META[input.event];
  const isDeletedChange = input.event === 'change.deleted';
  const changeUrl = buildChangeUrl(
    input.change,
    discordDeepLinkTabForEvent(input.event),
    input.event === 'note.added' ? 'notes' : undefined
  );
  const coverageUrl = buildChangeUrl(input.change, 'Coverage');
  const changeLabel = `#${input.change.publicId} ${truncateDiscord(input.change.title, 80)}`;
  const summary = input.change.summary;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Change',
      value: !isDeletedChange && changeUrl ? `[${changeLabel}](${changeUrl})` : changeLabel
    },
    { name: 'Status', value: formatLabel(input.change.status), inline: true },
    { name: 'Priority', value: formatLabel(input.change.priority), inline: true },
    {
      name: 'Area',
      value: truncateDiscord(`${input.change.category} / ${input.change.subsystem}`, 120),
      inline: true
    },
    { name: 'Actor', value: actor ? displayName(actor) : 'System', inline: true },
    {
      name: 'Tester Counts',
      value: `${summary.testerCount} testers • ${summary.passCount} passed • ${summary.failCount} failed • ${summary.blockedCount} blocked`,
      inline: false
    },
  ];

  if (isDeletedChange) {
    fields.push({
      name: 'Open In Test Manager',
      value: 'Deleted change record no longer has an active page.',
      inline: false
    });
  } else if (changeUrl) {
    fields.push({
      name: 'Open In Test Manager',
      value: `[${discordDeepLinkLabelForEvent(input.event)}](${changeUrl})`,
      inline: false
    });
  }

  if (input.metadata?.testerName) {
    fields.push({ name: 'Tester', value: String(input.metadata.testerName), inline: true });
  }
  if (input.metadata?.result) {
    fields.push({
      name: 'Result',
      value: formatLabel(String(input.metadata.result)),
      inline: true
    });
  }
  if (input.metadata?.fromStatus || input.metadata?.toStatus) {
    fields.push({
      name: 'Transition',
      value: `${input.metadata.fromStatus ? formatLabel(String(input.metadata.fromStatus)) : 'Unknown'} → ${
        input.metadata.toStatus ? formatLabel(String(input.metadata.toStatus)) : 'Unknown'
      }`,
      inline: true
    });
  }
  if (input.metadata?.checklistItemTitle) {
    const checklistItemTitle = truncateDiscord(String(input.metadata.checklistItemTitle), 140);
    fields.push({
      name: 'Checklist Item',
      value: input.event.startsWith('checklist.') && coverageUrl
        ? `[${checklistItemTitle}](${coverageUrl})`
        : checklistItemTitle
    });
  }
  if (input.change.dueAt) {
    fields.push({ name: 'Due', value: buildDiscordTimestamp(input.change.dueAt), inline: true });
  }

  const detail = truncateDiscord(input.detail?.trim() || `${meta.label} in Test Manager.`, 600);
  const avatarUrl = buildClientAssetUrl(TEST_MANAGER_DISCORD_AVATAR_PATH);

  return {
    username: 'Test Manager',
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: meta.label,
        ...(changeUrl ? { url: changeUrl } : {}),
        description: detail,
        color:
          input.metadata?.result === TestResult.FAIL
            ? DISCORD_COLORS.danger
            : input.metadata?.result === TestResult.BLOCKED
              ? DISCORD_COLORS.warning
              : meta.color,
        fields,
        footer: { text: `Test Manager • Change #${input.change.publicId}` },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

async function sendConfiguredDiscordWebhook(url: string, payload: DiscordWebhookBody) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord responded with ${response.status}: ${errorText}`);
  }
}

async function notifyTestManagerDiscord(input: TestManagerDiscordNotificationInput) {
  try {
    const settings = await getTestManagerSettings();
    const discordSettings = settings.discordNotifications;
    if (
      !discordSettings.enabled ||
      !discordSettings.webhookUrl ||
      !discordSettings.events.includes(input.event) ||
      !isConfiguredDiscordWebhookUrl(discordSettings.webhookUrl)
    ) {
      return;
    }

    const actor = input.actorUserId ? await getCurrentUser(input.actorUserId) : null;
    await sendConfiguredDiscordWebhook(
      discordSettings.webhookUrl,
      buildTestManagerDiscordPayload(input, actor)
    );
  } catch (error) {
    console.error('[TestManager] Failed to send Discord notification:', error);
  }
}

async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true
    }
  });
}

function ensureActiveTestingAssignment<
  T extends { status: TestRunStatus; result: TestResult | null }
>(tester: T | null): asserts tester is T {
  if (!tester || tester.status !== TestRunStatus.TESTING || tester.result) {
    throw new Error('You must be actively testing this change to submit tester input.');
  }
}

function ensureChangeAcceptsTesterInput<
  T extends { status: TestChangeStatus; readyToTest: boolean }
>(change: T | null): asserts change is T {
  if (!change || isTerminalChangeStatus(change.status)) {
    throw new Error('You must be actively testing this change to submit tester input.');
  }
  if (!change.readyToTest) {
    throw new Error('This change is not ready for tester input yet.');
  }
}

function ensureChangeAcceptsTestingNote<T extends { status: TestChangeStatus }>(
  change: T | null
): asserts change is T {
  if (!change || isTerminalChangeStatus(change.status)) {
    throw new Error('Testing notes can only be added while the change is open.');
  }
}

type AutoCloseResult = {
  threshold: number;
  passCount: number;
};

async function maybeAutoCloseChange(
  tx: Prisma.TransactionClient,
  changeId: string
): Promise<AutoCloseResult | null> {
  const change = await tx.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      status: true,
      autoClosePassCount: true,
      testers: {
        select: { result: true }
      }
    }
  });
  if (!change || isTerminalChangeStatus(change.status) || change.autoClosePassCount <= 0) {
    return null;
  }

  const passCount = change.testers.filter((tester) => tester.result === TestResult.PASS).length;
  const hasBlockingReview = change.testers.some(
    (tester) => tester.result === TestResult.FAIL || tester.result === TestResult.BLOCKED
  );
  if (hasBlockingReview || passCount < change.autoClosePassCount) {
    return null;
  }

  const closedAt = new Date();
  await tx.testChange.update({
    where: { id: changeId },
    data: {
      status: TestChangeStatus.CLOSED,
      closedAt,
      closedById: null
    }
  });

  await appendHistory(tx, {
    changeId,
    actorUserId: null,
    eventType: TestHistoryEventType.CHANGE_CLOSED,
    label: 'Change auto-closed',
    detail: `Auto-closed after ${passCount} passing tester review${passCount === 1 ? '' : 's'} met the ${change.autoClosePassCount}-pass threshold.`,
    metadata: {
      autoClose: true,
      passCount,
      threshold: change.autoClosePassCount,
      closedAt: closedAt.toISOString()
    }
  });

  return { threshold: change.autoClosePassCount, passCount };
}

async function ensureSeedData(actorUserId: string): Promise<void> {
  const existingCount = await prisma.testChange.count();
  if (existingCount > 0) {
    await ensureSampleAssignments(actorUserId);
    await ensureSampleChecklistProgress();
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true }
  });
  if (!actor) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const samples = [
      {
        title: 'Epic 2.0 - Velious: New Spells',
        description:
          'Adds Velious-era spells to Epic 2.0 rewards including pets, effects, and focus items. Trainers should be placed in the appropriate locations.',
        category: 'Spells',
        subsystem: 'Combat',
        priority: TestChangePriority.HIGH,
        status: TestChangeStatus.TESTING,
        targetBuild: 'clumsy-2025-05-20',
        checklist: [
          [
            'Spell Trainers - Availability & Access',
            'Confirm trainers expose the new spell lines.'
          ],
          [
            'Spell Research - Components & Combos',
            'Confirm research recipes and components match expectations.'
          ],
          [
            'Spell Effects - Base Functionality',
            'Verify damage, duration, stacking, and focus behavior.'
          ]
        ]
      },
      {
        title: 'GoD - Dynamic Zone: Fearplane',
        description:
          'Adds test coverage for Fearplane dynamic zone creation, lockouts, and loot table behavior.',
        category: 'Instances',
        subsystem: 'Dynamic Zones',
        priority: TestChangePriority.MEDIUM,
        status: TestChangeStatus.AWAITING_TEST,
        targetBuild: 'clumsy-2025-05-20',
        checklist: [
          ['Instance Creation', 'Confirm a raid can create the dynamic zone.'],
          ['Lockout Assignment', 'Confirm lockouts are assigned after completion.']
        ]
      },
      {
        title: 'Fix: Pet Discipline Damage Proc',
        description:
          'Adjusts pet discipline proc scaling and resist checks for test server validation.',
        category: 'Pets',
        subsystem: 'Combat',
        priority: TestChangePriority.LOW,
        status: TestChangeStatus.PASSED,
        targetBuild: 'clumsy-2025-05-19',
        checklist: [
          ['Proc Rate', 'Confirm proc rate does not exceed expected range.'],
          ['Damage Scaling', 'Confirm rank scaling is applied correctly.']
        ]
      }
    ];

    for (const sample of samples) {
      const change = await tx.testChange.create({
        data: {
          title: sample.title,
          description: sample.description,
          category: sample.category,
          subsystem: sample.subsystem,
          priority: sample.priority,
          status: sample.status,
          targetBuild: sample.targetBuild,
          createdById: actorUserId,
          checklist: {
            create: sample.checklist.map(([title, details], index) => ({
              title,
              details,
              category: sample.category,
              sortOrder: index
            }))
          }
        }
      });

      await appendHistory(tx, {
        changeId: change.id,
        actorUserId,
        eventType: TestHistoryEventType.CHANGE_CREATED,
        label: 'Change submitted',
        detail: 'Initial mock entry for Test Manager.'
      });
    }
  });

  await ensureSampleAssignments(actorUserId);
  await ensureSampleChecklistProgress();
}

async function ensureSampleAssignments(actorUserId: string): Promise<void> {
  const existingAssignments = await prisma.testChangeTester.count();
  if (existingAssignments > 0) {
    return;
  }

  const [changes, users] = await Promise.all([
    prisma.testChange.findMany({
      orderBy: { publicId: 'asc' },
      take: 3,
      select: { id: true, status: true }
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true }
    })
  ]);

  if (!changes.length || !users.length) {
    return;
  }

  const testerIds = users.map((user) => user.id);
  await prisma.user.updateMany({
    where: { id: { in: testerIds.slice(0, 4) } },
    data: { tester: true }
  });

  await prisma.$transaction(async (tx) => {
    const primary = changes[0];
    const secondary = changes[1];
    const tertiary = changes[2];

    if (primary) {
      const scenarios = [
        {
          userId: testerIds[0] ?? actorUserId,
          assignment: TestAssignmentKind.REQUIRED,
          status: TestRunStatus.DONE,
          result: TestResult.PASS,
          notesHtml: '<p>Spell trainers and vendor access work as expected.</p>'
        },
        {
          userId: testerIds[1] ?? actorUserId,
          assignment: TestAssignmentKind.REQUIRED,
          status: TestRunStatus.TESTING,
          result: null,
          notesHtml: '<p>Pet spells are still being validated against stacking rules.</p>'
        },
        {
          userId: testerIds[2] ?? actorUserId,
          assignment: TestAssignmentKind.OPTIONAL,
          status: TestRunStatus.BLOCKED,
          result: TestResult.BLOCKED,
          notesHtml: '<p>Blocked on focus item availability in the current build.</p>'
        }
      ];

      const seededPrimaryUsers = new Set<string>();
      for (const scenario of scenarios) {
        if (seededPrimaryUsers.has(scenario.userId)) {
          continue;
        }
        seededPrimaryUsers.add(scenario.userId);

        const tester = await tx.testChangeTester.create({
          data: {
            changeId: primary.id,
            userId: scenario.userId,
            requestedById: actorUserId,
            assignment: scenario.assignment,
            status: scenario.status,
            result: scenario.result,
            notesHtml: scenario.notesHtml,
            startedAt: new Date(),
            completedAt: scenario.status === TestRunStatus.TESTING ? null : new Date()
          }
        });

        await tx.testChangeNote.create({
          data: {
            changeId: primary.id,
            testerId: tester.id,
            authorId: scenario.userId,
            contentHtml: scenario.notesHtml,
            result: scenario.result
          }
        });

        await appendHistory(tx, {
          changeId: primary.id,
          actorUserId: scenario.userId,
          eventType: scenario.result
            ? TestHistoryEventType.TEST_RESULT_ADDED
            : TestHistoryEventType.TESTING_REQUESTED,
          label: scenario.result ? `Test result added: ${scenario.result}` : 'Testing in progress',
          detail: getRichTextPlainText(scenario.notesHtml)
        });
      }
    }

    if (secondary) {
      await tx.testChangeTester.create({
        data: {
          changeId: secondary.id,
          userId: testerIds[3] ?? testerIds[0] ?? actorUserId,
          requestedById: actorUserId,
          assignment: TestAssignmentKind.ADMIN_REQUESTED,
          status: TestRunStatus.NOT_STARTED
        }
      });

      await appendHistory(tx, {
        changeId: secondary.id,
        actorUserId,
        eventType: TestHistoryEventType.TESTING_REQUESTED,
        label: 'Testing requested',
        detail: 'Mock tester requested for dynamic zone validation.'
      });
    }

    if (tertiary) {
      const tester = await tx.testChangeTester.create({
        data: {
          changeId: tertiary.id,
          userId: testerIds[0] ?? actorUserId,
          requestedById: actorUserId,
          assignment: TestAssignmentKind.REQUIRED,
          status: TestRunStatus.DONE,
          result: TestResult.PASS,
          notesHtml: '<p>Confirmed proc rate and rank scaling in repeated test pulls.</p>',
          startedAt: new Date(),
          completedAt: new Date()
        }
      });

      await tx.testChangeNote.create({
        data: {
          changeId: tertiary.id,
          testerId: tester.id,
          authorId: testerIds[0] ?? actorUserId,
          contentHtml: '<p>Confirmed proc rate and rank scaling in repeated test pulls.</p>',
          result: TestResult.PASS
        }
      });
    }
  });
}

async function ensureSampleChecklistProgress(): Promise<void> {
  const existingProgress = await prisma.testChangeChecklistProgress.count();
  if (existingProgress > 0) {
    return;
  }

  const changes = await prisma.testChange.findMany({
    orderBy: { publicId: 'asc' },
    take: 3,
    include: {
      checklist: {
        orderBy: { sortOrder: 'asc' }
      },
      testers: {
        orderBy: { updatedAt: 'desc' }
      }
    }
  });

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      for (const [testerIndex, tester] of change.testers.entries()) {
        const completedCount =
          tester.result === TestResult.PASS
            ? change.checklist.length
            : tester.status === TestRunStatus.TESTING
              ? Math.min(1, change.checklist.length)
              : tester.result === TestResult.BLOCKED
                ? Math.min(1, change.checklist.length)
                : 0;

        for (const item of change.checklist.slice(0, completedCount)) {
          await tx.testChangeChecklistProgress.upsert({
            where: {
              testerId_checklistItemId: {
                testerId: tester.id,
                checklistItemId: item.id
              }
            },
            update: {
              completed: true,
              completedAt: tester.completedAt ?? tester.updatedAt
            },
            create: {
              testerId: tester.id,
              checklistItemId: item.id,
              completed: true,
              completedAt: tester.completedAt ?? tester.updatedAt
            }
          });
        }

        if (testerIndex === 0 && completedCount === 0 && change.checklist[0]) {
          await tx.testChangeChecklistProgress.create({
            data: {
              testerId: tester.id,
              checklistItemId: change.checklist[0].id,
              completed: false
            }
          });
        }
      }
    }
  });
}

export async function getTestManagerDashboard(userId: string) {
  await ensureSeedData(userId);

  const [viewer, changes] = await Promise.all([
    getCurrentUser(userId),
    prisma.testChange.findMany({
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      include: changeListInclude
    })
  ]);

  const serialized = changes.map((change) => serializeChange(change, userId));
  const open = serialized.filter((change) => !isTerminalChangeStatus(change.status));
  const awaiting = open.filter(
    (change) => TESTING_READY_STATUSES.includes(change.status) && change.readyToTest
  );
  const inProgress = open.filter((change) => change.status === TestChangeStatus.TESTING);
  const passed = open.filter((change) => change.status === TestChangeStatus.PASSED);
  const failed = open.filter((change) => change.status === TestChangeStatus.FAILED);
  const blocked = open.filter((change) => change.status === TestChangeStatus.BLOCKED);
  const covered = inProgress.length + passed.length + failed.length + blocked.length;

  return {
    viewer: serializeUser(viewer),
    metrics: {
      activeChanges: open.length,
      priorityOne: open.filter(
        (change) =>
          change.priority === TestChangePriority.CRITICAL ||
          change.priority === TestChangePriority.HIGH
      ).length,
      awaitingTest: awaiting.length,
      inProgress: inProgress.length,
      passed: passed.length,
      failed: failed.length,
      blocked: blocked.length,
      coverage: open.length > 0 ? Math.round((covered / open.length) * 100) : 0
    },
    activeChanges: open.slice(0, 12),
    testerActivity: serialized
      .flatMap((change) =>
        change.testers
          .filter((tester) => tester.result || tester.status === TestRunStatus.TESTING)
          .map((tester) => ({ change, tester }))
      )
      .sort((left, right) => Date.parse(right.tester.updatedAt) - Date.parse(left.tester.updatedAt))
      .slice(0, 8),
    attentionItems: {
      awaitingAssignment: awaiting.length,
      viewerAssignments: open.filter(
        (change) => change.viewerTester && change.viewerTester.status !== TestRunStatus.DONE
      ).length,
      failingTests: open.filter((change) => change.summary.failCount > 0).length,
      blockedTests: open.filter(
        (change) => change.summary.blockedCount > 0 || change.status === TestChangeStatus.BLOCKED
      ).length
    }
  };
}

export async function listTestChanges(
  userId: string,
  filters: { status?: TestChangeStatus | 'ACTIVE'; search?: string }
) {
  await ensureSeedData(userId);

  const where: Prisma.TestChangeWhereInput = {};
  if (filters.status === 'ACTIVE') {
    where.status = { notIn: TERMINAL_CHANGE_STATUSES };
    where.readyToTest = true;
  } else if (filters.status) {
    where.status = filters.status;
  }
  if (filters.search?.trim()) {
    const search = filters.search.trim();
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { category: { contains: search } },
      { subsystem: { contains: search } },
      { testServerVersion: { contains: search } }
    ];
  }

  const changes = await prisma.testChange.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: changeListInclude
  });

  return { changes: changes.map((change) => serializeChange(change, userId)) };
}

export async function listNextPatchChanges(userId: string, view: NextPatchChangeView = 'complete') {
  await ensureSeedData(userId);

  const changes = await prisma.testChange.findMany({
    where: {
      includeInNextPatch: true,
      status:
        view === 'complete'
          ? NEXT_PATCH_COMPLETE_STATUS
          : {
              notIn: TERMINAL_CHANGE_STATUSES
            }
    },
    orderBy: [{ publicId: 'asc' }],
    include: changeListInclude
  });

  return { changes: changes.map((change) => serializeChange(change, userId)) };
}

export async function countNextPatchChanges(userId: string) {
  await ensureSeedData(userId);

  const [completeCount, totalCount] = await Promise.all([
    prisma.testChange.count({
      where: {
        includeInNextPatch: true,
        status: NEXT_PATCH_COMPLETE_STATUS
      }
    }),
    prisma.testChange.count({
      where: {
        includeInNextPatch: true,
        status: { not: TestChangeStatus.ARCHIVED }
      }
    })
  ]);

  return {
    count: completeCount,
    completeCount,
    incompleteCount: Math.max(totalCount - completeCount, 0),
    totalCount
  };
}

export async function generateNextPatchNotes(userId: string) {
  await ensureSeedData(userId);
  await ensureAdmin(userId);

  const changes = await prisma.testChange.findMany({
    where: {
      includeInNextPatch: true,
      status: NEXT_PATCH_COMPLETE_STATUS
    },
    orderBy: [{ publicId: 'asc' }],
    select: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      category: true,
      subsystem: true,
      priority: true,
      targetBuild: true,
      testServerVersion: true
    }
  });

  const result = await generatePatchNotesForChanges(changes);

  return {
    model: result.model,
    notes: result.notes.map((note) => {
      const change = changes.find((item) => item.id === note.changeId);
      return {
        ...note,
        title: change?.title ?? '',
        category: change?.category ?? '',
        subsystem: change?.subsystem ?? ''
      };
    })
  };
}

export async function getTestChange(changeId: string, userId: string) {
  await ensureSeedData(userId);

  const change = await prisma.testChange.findFirst({
    where: {
      OR: [{ id: changeId }, { publicId: Number.isNaN(Number(changeId)) ? -1 : Number(changeId) }]
    },
    include: changeInclude
  });

  return change ? serializeChange(change, userId) : null;
}

async function refreshGithubMetadataForChange(changeId: string): Promise<void> {
  const change = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      githubPrUrl: true,
      githubPrMetadata: true,
      githubIssueUrl: true,
      githubIssueMetadata: true
    }
  });
  if (!change) {
    return;
  }

  const data: Prisma.TestChangeUpdateInput = {};
  if (change.githubPrUrl && shouldRefreshGithubMetadata(change.githubPrMetadata)) {
    try {
      const reference = normalizeGithubPullRequestUrl(change.githubPrUrl);
      if (reference) {
        data.githubPrMetadata = (await fetchGithubPullRequestMetadata(
          reference,
          change.githubPrMetadata
        )) as Prisma.InputJsonValue;
      }
    } catch {
      // Ignore malformed legacy URLs; create/update validation prevents new invalid values.
    }
  }

  if (change.githubIssueUrl && shouldRefreshGithubMetadata(change.githubIssueMetadata)) {
    try {
      const reference = normalizeGithubIssueUrl(change.githubIssueUrl);
      if (reference) {
        data.githubIssueMetadata = (await fetchGithubIssueMetadata(
          reference,
          change.githubIssueMetadata
        )) as Prisma.InputJsonValue;
      }
    } catch {
      // Ignore malformed legacy URLs; create/update validation prevents new invalid values.
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.testChange.update({
      where: { id: change.id },
      data
    });
  }
}

async function refreshGithubMetadataWithDedupe(changeId: string): Promise<void> {
  const existingRefresh = githubMetadataRefreshes.get(changeId);
  if (existingRefresh) {
    await existingRefresh;
    return;
  }

  const refresh = refreshGithubMetadataForChange(changeId).finally(() => {
    githubMetadataRefreshes.delete(changeId);
  });
  githubMetadataRefreshes.set(changeId, refresh);
  await refresh;
}

export async function refreshTestChangeGithubMetadata(changeId: string, userId: string) {
  await ensureSeedData(userId);

  const resolvedChangeId = await resolveTestChangeId(changeId);
  if (!resolvedChangeId) {
    return null;
  }

  await refreshGithubMetadataWithDedupe(resolvedChangeId);
  return getTestChange(resolvedChangeId, userId);
}

async function resolveTestChangeId(changeId: string): Promise<string | null> {
  const change = await prisma.testChange.findFirst({
    where: {
      OR: [{ id: changeId }, { publicId: Number.isNaN(Number(changeId)) ? -1 : Number(changeId) }]
    },
    select: { id: true }
  });

  return change?.id ?? null;
}

export async function linkWebhookReportToTestChange(
  actorUserId: string,
  changeId: string,
  messageId: string
) {
  await ensureAdmin(actorUserId);

  const resolvedChangeId = await resolveTestChangeId(changeId);
  if (!resolvedChangeId) {
    throw new Error('Change not found.');
  }

  const message = await prisma.inboundWebhookMessage.findUnique({
    where: { id: messageId },
    select: { id: true }
  });
  if (!message) {
    throw new Error('Webhook report not found.');
  }

  await prisma.testChangeWebhookReport.upsert({
    where: {
      changeId_messageId: {
        changeId: resolvedChangeId,
        messageId
      }
    },
    update: {},
    create: {
      changeId: resolvedChangeId,
      messageId,
      linkedById: actorUserId
    }
  });

  return getTestChange(resolvedChangeId, actorUserId);
}

export async function unlinkWebhookReportFromTestChange(
  actorUserId: string,
  changeId: string,
  messageId: string
) {
  await ensureAdmin(actorUserId);

  const resolvedChangeId = await resolveTestChangeId(changeId);
  if (!resolvedChangeId) {
    throw new Error('Change not found.');
  }

  await prisma.testChangeWebhookReport.deleteMany({
    where: {
      changeId: resolvedChangeId,
      messageId
    }
  });

  return getTestChange(resolvedChangeId, actorUserId);
}

export async function createTestChange(
  actorUserId: string,
  input: {
    title: string;
    description: string;
    category: string;
    subsystem: string;
    priority: TestChangePriority;
    targetBuild?: string | null;
    testServerVersion?: string | null;
    githubPrUrl?: string | null;
    githubIssueUrl?: string | null;
    contextLinks?: TestChangeContextLinkInput[];
    includeInNextPatch?: boolean;
    autoClosePassCount?: number;
    dueAt?: Date | null;
    assignedToId?: string | null;
    checklist: Array<{ title: string; details?: string | null; category?: string | null }>;
  }
) {
  await ensureAdmin(actorUserId);
  const githubPullRequest = await buildGithubPullRequestFields(input.githubPrUrl);
  const githubIssue = await buildGithubIssueFields(input.githubIssueUrl);
  const currentTestServerVersion = await readCurrentTestServerVersion();
  const testServerVersion = normalizeTestServerVersion(input.testServerVersion);
  const readyToTest = !isTestServerVersionNewerThanCurrent(
    testServerVersion,
    currentTestServerVersion
  );

  const change = await prisma.$transaction(async (tx) => {
    const created = await tx.testChange.create({
      data: {
        title: input.title.trim(),
        description: sanitizeRichText(input.description),
        category: input.category.trim(),
        subsystem: input.subsystem.trim(),
        priority: input.priority,
        targetBuild: input.targetBuild?.trim() || null,
        testServerVersion,
        githubPrUrl: githubPullRequest.githubPrUrl,
        githubPrMetadata: githubPullRequest.githubPrMetadata,
        githubIssueUrl: githubIssue.githubIssueUrl,
        githubIssueMetadata: githubIssue.githubIssueMetadata,
        contextLinks: contextLinksJson(input.contextLinks ?? []),
        includeInNextPatch: input.includeInNextPatch ?? true,
        readyToTest,
        autoClosePassCount: input.autoClosePassCount ?? 0,
        dueAt: input.dueAt ?? null,
        assignedToId: input.assignedToId ?? null,
        createdById: actorUserId,
        checklist: {
          create: input.checklist.map((item, index) => ({
            title: item.title.trim(),
            details: item.details?.trim() || null,
            category: item.category?.trim() || null,
            sortOrder: index
          }))
        }
      }
    });

    await appendHistory(tx, {
      changeId: created.id,
      actorUserId,
      eventType: TestHistoryEventType.CHANGE_CREATED,
      label: 'Change submitted',
      detail: 'Change created by administrator.'
    });

    if (!readyToTest && testServerVersion && currentTestServerVersion) {
      await appendHistory(tx, {
        changeId: created.id,
        actorUserId,
        eventType: TestHistoryEventType.STATUS_CHANGED,
        label: 'Ready to test disabled',
        detail: futureVersionDetail(testServerVersion, currentTestServerVersion),
        metadata: {
          from: { readyToTest: true, testServerVersion },
          to: { readyToTest: false, testServerVersion },
          currentTestServerVersion,
          reason: 'versionNewerThanCurrent'
        }
      });
    }

    return created;
  });

  const serialized = await getTestChange(change.id, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'change.created',
      actorUserId,
      change: serialized,
      detail: `#${serialized.publicId} was submitted for testing.`
    });
  }
  return serialized;
}

export async function updateTestChange(
  actorUserId: string,
  changeId: string,
  input: {
    title: string;
    description: string;
    category: string;
    subsystem: string;
    priority: TestChangePriority;
    targetBuild?: string | null;
    testServerVersion?: string | null;
    githubPrUrl?: string | null;
    githubIssueUrl?: string | null;
    contextLinks?: TestChangeContextLinkInput[];
    includeInNextPatch?: boolean;
    autoClosePassCount?: number;
    dueAt?: Date | null;
    assignedToId?: string | null;
    checklist?: TestChangeChecklistInput[];
  }
) {
  await ensureAdmin(actorUserId);

  const existing = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      title: true,
      category: true,
      subsystem: true,
      priority: true,
      targetBuild: true,
      testServerVersion: true,
      readyToTest: true,
      githubPrUrl: true,
      githubIssueUrl: true,
      contextLinks: true,
      includeInNextPatch: true,
      autoClosePassCount: true,
      dueAt: true,
      assignedToId: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const githubPullRequest = await buildGithubPullRequestFields(input.githubPrUrl);
  const githubIssue = await buildGithubIssueFields(input.githubIssueUrl);
  const currentTestServerVersion = await readCurrentTestServerVersion();
  const testServerVersion = normalizeTestServerVersion(input.testServerVersion);
  const shouldPauseForVersion =
    existing.readyToTest &&
    isTestServerVersionNewerThanCurrent(testServerVersion, currentTestServerVersion);
  const nextContextLinks =
    typeof input.contextLinks === 'undefined'
      ? normalizeContextLinks(existing.contextLinks)
      : normalizeContextLinks(input.contextLinks);
  const checklistInput =
    typeof input.checklist === 'undefined' ? null : normalizeChecklistInput(input.checklist);
  const shouldEvaluateAutoClose =
    typeof input.autoClosePassCount === 'number' &&
    input.autoClosePassCount !== existing.autoClosePassCount;
  const data = {
    title: input.title.trim(),
    description: sanitizeRichText(input.description),
    category: input.category.trim(),
    subsystem: input.subsystem.trim(),
    priority: input.priority,
    targetBuild: input.targetBuild?.trim() || null,
    testServerVersion,
    githubPrUrl: githubPullRequest.githubPrUrl,
    githubPrMetadata: githubPullRequest.githubPrMetadata,
    githubIssueUrl: githubIssue.githubIssueUrl,
    githubIssueMetadata: githubIssue.githubIssueMetadata,
    ...(typeof input.contextLinks === 'undefined'
      ? {}
      : { contextLinks: contextLinksJson(input.contextLinks) }),
    ...(typeof input.includeInNextPatch === 'boolean'
      ? { includeInNextPatch: input.includeInNextPatch }
      : {}),
    ...(typeof input.autoClosePassCount === 'number'
      ? { autoClosePassCount: input.autoClosePassCount }
      : {}),
    dueAt: input.dueAt ?? null,
    assignedToId: input.assignedToId ?? null,
    ...(shouldPauseForVersion ? { readyToTest: false } : {})
  };

  const autoCloseResult = await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data
    });

    let checklistChanges: {
      created: Array<{ id: string; title: string; sortOrder: number }>;
      updated: Array<{
        id: string;
        from: { title: string; details: string | null; category: string | null; sortOrder: number };
        to: { title: string; details: string | null; category: string | null; sortOrder: number };
      }>;
      deleted: Array<{ id: string; title: string; sortOrder: number }>;
    } | null = null;

    if (checklistInput) {
      const existingChecklist = await tx.testChangeChecklistItem.findMany({
        where: { changeId },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          details: true,
          category: true,
          sortOrder: true
        }
      });
      const existingById = new Map(existingChecklist.map((item) => [item.id, item]));
      const unknownItem = checklistInput.find((item) => item.id && !existingById.has(item.id));
      if (unknownItem?.id) {
        throw new Error('Checklist item not found for this change.');
      }

      const nextIds = new Set(
        checklistInput.map((item) => item.id).filter((id): id is string => Boolean(id))
      );
      const deletedItems = existingChecklist.filter((item) => !nextIds.has(item.id));
      const createdItems: Array<{ id: string; title: string; sortOrder: number }> = [];
      const updatedItems: Array<{
        id: string;
        from: { title: string; details: string | null; category: string | null; sortOrder: number };
        to: { title: string; details: string | null; category: string | null; sortOrder: number };
      }> = [];

      if (deletedItems.length) {
        await tx.testChangeChecklistItem.deleteMany({
          where: {
            changeId,
            id: { in: deletedItems.map((item) => item.id) }
          }
        });
      }

      for (const item of checklistInput) {
        if (!item.id) {
          const created = await tx.testChangeChecklistItem.create({
            data: {
              changeId,
              title: item.title,
              details: item.details,
              category: item.category,
              sortOrder: item.sortOrder
            },
            select: { id: true, title: true, sortOrder: true }
          });
          createdItems.push(created);
          continue;
        }

        const current = existingById.get(item.id);
        if (!current) {
          continue;
        }

        const hasChanged =
          current.title !== item.title ||
          (current.details ?? null) !== item.details ||
          (current.category ?? null) !== item.category ||
          current.sortOrder !== item.sortOrder;
        if (!hasChanged) {
          continue;
        }

        await tx.testChangeChecklistItem.update({
          where: { id: item.id },
          data: {
            title: item.title,
            details: item.details,
            category: item.category,
            sortOrder: item.sortOrder
          }
        });
        updatedItems.push({
          id: item.id,
          from: {
            title: current.title,
            details: current.details ?? null,
            category: current.category ?? null,
            sortOrder: current.sortOrder
          },
          to: {
            title: item.title,
            details: item.details,
            category: item.category,
            sortOrder: item.sortOrder
          }
        });
      }

      if (createdItems.length || updatedItems.length || deletedItems.length) {
        checklistChanges = {
          created: createdItems,
          updated: updatedItems,
          deleted: deletedItems.map((item) => ({
            id: item.id,
            title: item.title,
            sortOrder: item.sortOrder
          }))
        };
      }
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: 'Change details updated',
      detail: 'Basic change metadata was updated by an administrator.',
      metadata: {
        from: {
          title: existing.title,
          category: existing.category,
          subsystem: existing.subsystem,
          priority: existing.priority,
          targetBuild: existing.targetBuild,
          testServerVersion: existing.testServerVersion,
          readyToTest: existing.readyToTest,
          githubPrUrl: existing.githubPrUrl,
          githubIssueUrl: existing.githubIssueUrl,
          contextLinks: normalizeContextLinks(existing.contextLinks),
          includeInNextPatch: existing.includeInNextPatch,
          autoClosePassCount: existing.autoClosePassCount,
          dueAt: existing.dueAt?.toISOString() ?? null,
          assignedToId: existing.assignedToId
        },
        to: {
          title: data.title,
          category: data.category,
          subsystem: data.subsystem,
          priority: data.priority,
          targetBuild: data.targetBuild,
          testServerVersion: data.testServerVersion,
          readyToTest: shouldPauseForVersion ? false : existing.readyToTest,
          githubPrUrl: data.githubPrUrl,
          githubIssueUrl: data.githubIssueUrl,
          contextLinks: nextContextLinks,
          includeInNextPatch:
            typeof data.includeInNextPatch === 'boolean'
              ? data.includeInNextPatch
              : existing.includeInNextPatch,
          autoClosePassCount:
            typeof data.autoClosePassCount === 'number'
              ? data.autoClosePassCount
              : existing.autoClosePassCount,
          dueAt: data.dueAt?.toISOString() ?? null,
          assignedToId: data.assignedToId
        }
      }
    });

    if (checklistChanges) {
      const detailParts = [
        checklistChanges.created.length ? `${checklistChanges.created.length} added` : '',
        checklistChanges.updated.length ? `${checklistChanges.updated.length} updated` : '',
        checklistChanges.deleted.length ? `${checklistChanges.deleted.length} removed` : ''
      ].filter(Boolean);
      await appendHistory(tx, {
        changeId,
        actorUserId,
        eventType: TestHistoryEventType.CHECKLIST_UPDATED,
        label: 'Checklist items updated',
        detail: `Checklist items were updated by an administrator (${detailParts.join(', ')}).`,
        metadata: checklistChanges
      });
    }

    if (shouldPauseForVersion && testServerVersion && currentTestServerVersion) {
      await appendHistory(tx, {
        changeId,
        actorUserId,
        eventType: TestHistoryEventType.STATUS_CHANGED,
        label: 'Ready to test disabled',
        detail: futureVersionDetail(testServerVersion, currentTestServerVersion),
        metadata: {
          from: { readyToTest: existing.readyToTest, testServerVersion: existing.testServerVersion },
          to: { readyToTest: false, testServerVersion },
          currentTestServerVersion,
          reason: 'versionNewerThanCurrent'
        }
      });
    }

    if (shouldEvaluateAutoClose) {
      return maybeAutoCloseChange(tx, changeId);
    }
    return null;
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized && autoCloseResult) {
    await notifyTestManagerDiscord({
      event: 'change.closed',
      actorUserId: null,
      change: serialized,
      detail: `Auto-closed after ${autoCloseResult.passCount} passing tester review${autoCloseResult.passCount === 1 ? '' : 's'} met the ${autoCloseResult.threshold}-pass threshold.`,
      metadata: {
        autoClose: true,
        passCount: autoCloseResult.passCount,
        threshold: autoCloseResult.threshold
      }
    });
  }
  return serialized;
}

export async function updateTestChangeContextLinks(
  actorUserId: string,
  changeId: string,
  contextLinks: TestChangeContextLinkInput[]
) {
  await ensureAdmin(actorUserId);

  const existing = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      contextLinks: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const previousLinks = normalizeContextLinks(existing.contextLinks);
  const nextLinks = normalizeContextLinks(contextLinks);
  if (JSON.stringify(previousLinks) === JSON.stringify(nextLinks)) {
    return getTestChange(changeId, actorUserId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: { contextLinks: contextLinksJson(nextLinks) }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: 'Context links updated',
      detail: 'Linked context references were updated by an administrator.',
      metadata: {
        from: { contextLinks: previousLinks },
        to: { contextLinks: nextLinks }
      }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function setTestChangeTestServerVersion(
  actorUserId: string,
  changeId: string,
  value: string | null | undefined
) {
  await ensureAdmin(actorUserId);

  const existing = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      testServerVersion: true,
      readyToTest: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const currentTestServerVersion = await readCurrentTestServerVersion();
  const testServerVersion = normalizeTestServerVersion(value);
  const shouldPauseForVersion =
    existing.readyToTest &&
    isTestServerVersionNewerThanCurrent(testServerVersion, currentTestServerVersion);
  const nextReadyToTest = shouldPauseForVersion ? false : existing.readyToTest;

  if (
    existing.testServerVersion === testServerVersion &&
    existing.readyToTest === nextReadyToTest
  ) {
    return getTestChange(changeId, actorUserId);
  }

  const versionDetail = testServerVersion
    ? `Active version was updated to ${testServerVersion}.`
    : 'Active version was cleared.';

  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: {
        testServerVersion,
        ...(shouldPauseForVersion ? { readyToTest: false } : {})
      }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: 'Change version updated',
      detail:
        shouldPauseForVersion && testServerVersion && currentTestServerVersion
          ? `${versionDetail} ${futureVersionDetail(testServerVersion, currentTestServerVersion)}`
          : versionDetail,
      metadata: {
        from: {
          testServerVersion: existing.testServerVersion,
          readyToTest: existing.readyToTest
        },
        to: {
          testServerVersion,
          readyToTest: nextReadyToTest
        },
        currentTestServerVersion,
        ...(shouldPauseForVersion ? { reason: 'versionNewerThanCurrent' } : {})
      }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function setTestChangeNextPatch(
  actorUserId: string,
  changeId: string,
  includeInNextPatch: boolean
) {
  await ensureAdmin(actorUserId);

  const existing = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      includeInNextPatch: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  if (existing.includeInNextPatch === includeInNextPatch) {
    return getTestChange(changeId, actorUserId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: { includeInNextPatch }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: includeInNextPatch ? 'Added to next patch' : 'Removed from next patch',
      detail: includeInNextPatch
        ? 'This change was marked for inclusion in the next patch.'
        : 'This change was removed from the next patch list.',
      metadata: { from: existing.includeInNextPatch, to: includeInNextPatch }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function setTestChangeReadyToTest(
  actorUserId: string,
  changeId: string,
  readyToTest: boolean
) {
  await ensureAdmin(actorUserId);

  const existing = await prisma.testChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      readyToTest: true,
      testServerVersion: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const currentTestServerVersion = await readCurrentTestServerVersion();
  const nextTestServerVersion =
    readyToTest && currentTestServerVersion
      ? currentTestServerVersion
      : existing.testServerVersion;
  const versionChanged = readyToTest && existing.testServerVersion !== nextTestServerVersion;
  if (existing.readyToTest === readyToTest && !versionChanged) {
    return getTestChange(changeId, actorUserId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: {
        readyToTest,
        ...(readyToTest ? { testServerVersion: nextTestServerVersion } : {})
      }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.STATUS_CHANGED,
      label: readyToTest ? 'Ready to test enabled' : 'Ready to test disabled',
      detail: readyToTest
        ? currentTestServerVersion
          ? `Tester input was enabled and the active version was set to ${currentTestServerVersion}.`
          : 'Tester input was enabled. Current test server version is not set.'
        : 'Tester input was paused until this change is ready.',
      metadata: {
        from: {
          readyToTest: existing.readyToTest,
          testServerVersion: existing.testServerVersion
        },
        to: {
          readyToTest,
          testServerVersion: nextTestServerVersion
        },
        readyToTest,
        currentTestServerVersion
      }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function resetNextPatch(actorUserId: string) {
  await ensureAdmin(actorUserId);

  const changes = await prisma.testChange.findMany({
    where: {
      includeInNextPatch: true,
      status: NEXT_PATCH_COMPLETE_STATUS
    },
    select: { id: true }
  });

  if (!changes.length) {
    return { resetCount: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.testChange.updateMany({
      where: { id: { in: changes.map((change) => change.id) } },
      data: {
        includeInNextPatch: false,
        status: TestChangeStatus.ARCHIVED
      }
    });

    for (const change of changes) {
      await appendHistory(tx, {
        changeId: change.id,
        actorUserId,
        eventType: TestHistoryEventType.STATUS_CHANGED,
        label: 'Change archived',
        detail: 'This change was archived after deployment and cleared from the next patch list.',
        metadata: {
          from: TestChangeStatus.CLOSED,
          to: TestChangeStatus.ARCHIVED,
          includeInNextPatch: false,
          reset: true
        }
      });
    }
  });

  return { resetCount: changes.length };
}

export async function setTestChangeStatus(
  actorUserId: string,
  changeId: string,
  status: TestChangeStatus,
  detail?: string | null
) {
  await ensureAdmin(actorUserId);
  const existing = await prisma.testChange.findUnique({ where: { id: changeId } });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const terminal = isTerminalChangeStatus(status);
  const terminalAt = terminal ? existing.closedAt ?? new Date() : null;
  const terminalById = terminal ? existing.closedById ?? actorUserId : null;
  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: {
        status,
        closedAt: terminalAt,
        closedById: terminalById,
        ...(status === TestChangeStatus.ARCHIVED ? { includeInNextPatch: false } : {})
      }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType:
        status === TestChangeStatus.CLOSED
          ? TestHistoryEventType.CHANGE_CLOSED
          : status === TestChangeStatus.RENEWED
            ? TestHistoryEventType.CHANGE_RENEWED
            : TestHistoryEventType.STATUS_CHANGED,
      label:
        status === TestChangeStatus.CLOSED
          ? 'Change closed'
          : status === TestChangeStatus.ARCHIVED
            ? 'Change archived'
            : `Status changed to ${status}`,
      detail: detail?.trim() || null,
      metadata: { from: existing.status, to: status }
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event:
        status === TestChangeStatus.CLOSED
          ? 'change.closed'
          : status === TestChangeStatus.RENEWED
            ? 'change.renewed'
            : 'change.statusChanged',
      actorUserId,
      change: serialized,
      detail:
        detail?.trim() ||
        `Status changed from ${formatLabel(existing.status)} to ${formatLabel(status)}.`,
      metadata: { fromStatus: existing.status, toStatus: status }
    });
  }
  return serialized;
}

export async function removeTesterFromChange(
  actorUserId: string,
  changeId: string,
  testerId: string
) {
  await ensureAdmin(actorUserId);

  let removedTesterName = 'Tester';
  await prisma.$transaction(async (tx) => {
    const [change, tester] = await Promise.all([
      tx.testChange.findUnique({ where: { id: changeId }, select: { id: true } }),
      tx.testChangeTester.findFirst({
        where: { id: testerId, changeId },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              nickname: true
            }
          }
        }
      })
    ]);

    if (!change) {
      throw new Error('Change not found.');
    }
    if (!tester) {
      throw new Error('Tester assignment not found.');
    }

    removedTesterName = displayName(tester.user);

    await tx.testChangeTester.delete({ where: { id: tester.id } });
    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.ASSIGNMENT_UPDATED,
      label: 'Tester removed',
      detail: `${removedTesterName} was removed from this change.`,
      metadata: { testerId: tester.id, userId: tester.userId }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function deleteTestChange(actorUserId: string, changeId: string): Promise<void> {
  await ensureAdmin(actorUserId);
  const serialized = await getTestChange(changeId, actorUserId);
  await prisma.testChange.delete({ where: { id: changeId } });
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'change.deleted',
      actorUserId,
      change: serialized,
      detail: `#${serialized.publicId} was deleted from Test Manager.`
    });
  }
}

export async function volunteerForChange(actorUserId: string, changeId: string) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }
  const actorCanVolunteer = (await getTestManagerUserPermissions(actor)).includes('volunteer');

  await prisma.$transaction(async (tx) => {
    const [change, existingTester] = await Promise.all([
      tx.testChange.findUnique({ where: { id: changeId } }),
      tx.testChangeTester.findUnique({
        where: { changeId_userId: { changeId, userId: actorUserId } },
        select: { id: true, status: true, result: true }
      })
    ]);
    if (!change) {
      throw new Error('Change not found.');
    }
    if (isTerminalChangeStatus(change.status)) {
      throw new Error('Closed or archived changes cannot be tested.');
    }
    if (!change.readyToTest) {
      throw new Error('This change is not ready for tester input yet.');
    }
    if (
      !actorCanVolunteer &&
      (!existingTester ||
        existingTester.status !== TestRunStatus.NOT_STARTED ||
        existingTester.result)
    ) {
      throw new Error('You must be requested to test this change before starting.');
    }

    await tx.testChangeTester.upsert({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      update: {
        status: TestRunStatus.TESTING,
        startedAt: new Date()
      },
      create: {
        changeId,
        userId: actorUserId,
        assignment: TestAssignmentKind.VOLUNTEER,
        status: TestRunStatus.TESTING,
        startedAt: new Date()
      }
    });

    if (TESTING_READY_STATUSES.includes(change.status)) {
      await tx.testChange.update({
        where: { id: changeId },
        data: { status: TestChangeStatus.TESTING }
      });
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.TESTER_VOLUNTEERED,
      label: 'Tester volunteered',
      detail: 'Tester started work on this change.'
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'tester.started',
      actorUserId,
      change: serialized,
      detail: `${displayName(actor)} started testing this change.`
    });
  }
  return serialized;
}

export async function retestChange(actorUserId: string, changeId: string) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }

  await prisma.$transaction(async (tx) => {
    const [change, tester] = await Promise.all([
      tx.testChange.findUnique({
        where: { id: changeId },
        select: { id: true, status: true, readyToTest: true }
      }),
      tx.testChangeTester.findUnique({
        where: { changeId_userId: { changeId, userId: actorUserId } },
        select: { id: true, result: true }
      })
    ]);

    if (!change) {
      throw new Error('Change not found.');
    }
    if (isTerminalChangeStatus(change.status)) {
      throw new Error('Closed or archived changes cannot be re-tested.');
    }
    if (!change.readyToTest) {
      throw new Error('This change is not ready for tester input yet.');
    }
    if (!tester?.result) {
      throw new Error('You can only re-test a change after submitting tester input.');
    }

    await tx.testChangeTester.update({
      where: { id: tester.id },
      data: {
        status: TestRunStatus.TESTING,
        result: null,
        completedAt: null,
        startedAt: new Date()
      }
    });

    await tx.testChangeChecklistProgress.updateMany({
      where: {
        testerId: tester.id,
        OR: [{ completed: true }, { completedAt: { not: null } }]
      },
      data: {
        completed: false,
        completedAt: null
      }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.TESTER_VOLUNTEERED,
      label: 'Tester started re-test',
      detail: 'Tester reopened their testing run for this change.',
      metadata: { retest: true }
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'tester.retested',
      actorUserId,
      change: serialized,
      detail: 'A tester reopened their testing run for this change.'
    });
  }
  return serialized;
}

export async function requestTester(
  actorUserId: string,
  changeId: string,
  userId: string,
  assignment: TestAssignmentKind
) {
  await ensureAdmin(actorUserId);

  let requestedTesterName = 'Tester';
  await prisma.$transaction(async (tx) => {
    const [change, user] = await Promise.all([
      tx.testChange.findUnique({ where: { id: changeId }, select: { id: true, status: true } }),
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, nickname: true }
      })
    ]);
    if (!change) {
      throw new Error('Change not found.');
    }
    if (!user) {
      throw new Error('User not found.');
    }
    if (isTerminalChangeStatus(change.status)) {
      throw new Error('Closed or archived changes cannot receive tester requests.');
    }
    requestedTesterName = displayName(user);

    await tx.testChangeTester.upsert({
      where: { changeId_userId: { changeId, userId } },
      update: {
        assignment,
        requestedById: actorUserId
      },
      create: {
        changeId,
        userId,
        assignment,
        requestedById: actorUserId
      }
    });

    if (change.status === TestChangeStatus.SUBMITTED) {
      await tx.testChange.update({
        where: { id: changeId },
        data: { status: TestChangeStatus.AWAITING_TEST }
      });
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.TESTING_REQUESTED,
      label: 'Testing requested',
      detail: `Requested testing from ${displayName(user)}.`,
      metadata: { userId, assignment }
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'tester.requested',
      actorUserId,
      change: serialized,
      detail: `Testing was requested from ${requestedTesterName}.`,
      metadata: { testerName: requestedTesterName, assignment }
    });
  }
  return serialized;
}

export async function submitTesterResult(
  actorUserId: string,
  changeId: string,
  input: { result: TestResult; notesHtml: string }
) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }

  const [change, existing] = await Promise.all([
    prisma.testChange.findUnique({
      where: { id: changeId },
      select: { status: true, readyToTest: true }
    }),
    prisma.testChangeTester.findUnique({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      select: { id: true, status: true, result: true, startedAt: true }
    })
  ]);
  ensureChangeAcceptsTesterInput(change);
  ensureActiveTestingAssignment(existing);

  const actorPermissions = await getTestManagerUserPermissions(actor);
  const requiresResultNotes =
    input.result === TestResult.FAIL ||
    input.result === TestResult.BLOCKED ||
    (input.result === TestResult.PASS && actorPermissions.includes('noteForPass'));
  let sanitizedNotes = sanitizeRichText(input.notesHtml);
  let notesText = getRichTextPlainText(sanitizedNotes);
  let savedResultNote: { id: string; contentHtml: string } | null = null;

  if (requiresResultNotes && !notesText) {
    savedResultNote = await findLatestSavedTesterNoteForResult(
      changeId,
      actorUserId,
      existing.id,
      existing.startedAt
    );
    if (savedResultNote) {
      sanitizedNotes = sanitizeRichText(savedResultNote.contentHtml);
      notesText = getRichTextPlainText(sanitizedNotes);
    }
  }

  if ((input.result === TestResult.FAIL || input.result === TestResult.BLOCKED) && !notesText) {
    throw new Error('Tester comments are required when reporting a failed or blocked result.');
  }
  if (input.result === TestResult.PASS && actorPermissions.includes('noteForPass') && !notesText) {
    throw new Error('Testing notes are required when reporting a passing result.');
  }

  const status = input.result === TestResult.BLOCKED ? TestRunStatus.BLOCKED : TestRunStatus.DONE;

  const autoCloseResult = await prisma.$transaction(async (tx) => {
    const tester = await tx.testChangeTester.update({
      where: { id: existing.id },
      data: {
        result: input.result,
        notesHtml: sanitizedNotes,
        status,
        completedAt: new Date()
      },
      select: { id: true }
    });

    if (notesText) {
      if (savedResultNote) {
        await tx.testChangeNote.update({
          where: { id: savedResultNote.id },
          data: {
            testerId: tester.id,
            contentHtml: sanitizedNotes,
            result: input.result
          }
        });
      } else {
        await tx.testChangeNote.create({
          data: {
            changeId,
            testerId: tester.id,
            authorId: actorUserId,
            contentHtml: sanitizedNotes,
            result: input.result
          }
        });
      }
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.TEST_RESULT_ADDED,
      label: `Test result added: ${input.result}`,
      detail: (
        notesText || `${displayName(actor)} submitted ${input.result.toLowerCase()} feedback.`
      ).slice(0, 300),
      metadata: { result: input.result }
    });

    if (input.result === TestResult.PASS) {
      return maybeAutoCloseChange(tx, changeId);
    }
    return null;
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'tester.resultSubmitted',
      actorUserId,
      change: serialized,
      detail: (
        notesText || `${displayName(actor)} submitted ${input.result.toLowerCase()} feedback.`
      ).slice(0, 300),
      metadata: { testerName: displayName(actor), result: input.result }
    });
    if (autoCloseResult) {
      await notifyTestManagerDiscord({
        event: 'change.closed',
        actorUserId: null,
        change: serialized,
        detail: `Auto-closed after ${autoCloseResult.passCount} passing tester review${autoCloseResult.passCount === 1 ? '' : 's'} met the ${autoCloseResult.threshold}-pass threshold.`,
        metadata: {
          autoClose: true,
          passCount: autoCloseResult.passCount,
          threshold: autoCloseResult.threshold
        }
      });
    }
  }
  return serialized;
}

export async function updateTesterChecklistProgress(
  actorUserId: string,
  changeId: string,
  checklistItemId: string,
  input: { completed?: boolean; notesHtml?: string | null }
) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }

  const hasCompleted = typeof input.completed === 'boolean';
  const completed = input.completed ?? false;
  const hasNotes = typeof input.notesHtml === 'string';
  const notesHtml = hasNotes ? sanitizeRichText(input.notesHtml ?? '') : undefined;

  let checklistItemTitle = 'Checklist item';
  await prisma.$transaction(async (tx) => {
    const [change, checklistItem] = await Promise.all([
      tx.testChange.findUnique({
        where: { id: changeId },
        select: { id: true, status: true, readyToTest: true }
      }),
      tx.testChangeChecklistItem.findFirst({
        where: { id: checklistItemId, changeId },
        select: { id: true, title: true, children: { select: { id: true } } }
      })
    ]);
    if (!change) {
      throw new Error('Change not found.');
    }
    if (!checklistItem) {
      throw new Error('Checklist item not found for this change.');
    }
    checklistItemTitle = checklistItem.title;

    ensureChangeAcceptsTesterInput(change);

    const tester = await tx.testChangeTester.findUnique({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      select: { id: true, status: true, result: true }
    });
    ensureActiveTestingAssignment(tester);

    // A group (sub-checklist) has no progress row of its own — toggling it fans the
    // completed state out to every child item. Leaf items keep their existing behavior.
    const childIds = checklistItem.children.map((child) => child.id);
    const isGroup = childIds.length > 0;
    const targetIds = isGroup ? childIds : [checklistItem.id];

    for (const targetId of targetIds) {
      await tx.testChangeChecklistProgress.upsert({
        where: {
          testerId_checklistItemId: {
            testerId: tester.id,
            checklistItemId: targetId
          }
        },
        update: {
          completed: hasCompleted ? completed : undefined,
          completedAt: hasCompleted ? (completed ? new Date() : null) : undefined,
          notesHtml: isGroup ? undefined : notesHtml
        },
        create: {
          testerId: tester.id,
          checklistItemId: targetId,
          completed: hasCompleted ? completed : false,
          completedAt: hasCompleted && completed ? new Date() : null,
          notesHtml: isGroup ? null : (notesHtml ?? null)
        }
      });
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.CHECKLIST_UPDATED,
      label: hasCompleted
        ? completed
          ? 'Checklist item completed'
          : 'Checklist item reopened'
        : 'Checklist item note updated',
      detail: hasCompleted
        ? `${displayName(actor)} ${completed ? 'completed' : 'reopened'} "${checklistItem.title}"${
            isGroup ? ` (${targetIds.length} sub-item${targetIds.length === 1 ? '' : 's'})` : ''
          }.`
        : `${displayName(actor)} updated notes for "${checklistItem.title}".`,
      metadata: {
        checklistItemId,
        completed: hasCompleted ? completed : undefined,
        notesUpdated: hasNotes,
        isGroup
      }
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: hasCompleted
        ? completed
          ? 'checklist.completed'
          : 'checklist.reopened'
        : 'checklist.noteUpdated',
      actorUserId,
      change: serialized,
      detail: hasCompleted
        ? `${displayName(actor)} ${completed ? 'completed' : 'reopened'} "${checklistItemTitle}".`
        : `${displayName(actor)} updated checklist notes for "${checklistItemTitle}".`,
      metadata: { checklistItemTitle, completed: hasCompleted ? completed : undefined }
    });
  }
  return serialized;
}

export async function addTestChangeChecklistItem(
  actorUserId: string,
  changeId: string,
  input: { title: string; details?: string | null; category?: string | null }
) {
  await ensureAdmin(actorUserId);

  const title = input.title.trim();
  const details = input.details?.trim() || null;
  const category = input.category?.trim() || null;
  if (!title) {
    throw new Error('Checklist item title is required.');
  }

  await prisma.$transaction(async (tx) => {
    const change = await tx.testChange.findUnique({
      where: { id: changeId },
      select: {
        id: true,
        checklist: {
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
          take: 1
        }
      }
    });
    if (!change) {
      throw new Error('Change not found.');
    }

    const sortOrder = (change.checklist[0]?.sortOrder ?? -1) + 1;
    const checklistItem = await tx.testChangeChecklistItem.create({
      data: {
        changeId,
        title,
        details,
        category,
        sortOrder
      }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.CHECKLIST_UPDATED,
      label: 'Checklist item added',
      detail: `Checklist item "${checklistItem.title}" was added.`,
      metadata: {
        checklistItemId: checklistItem.id,
        checklistItemTitle: checklistItem.title
      }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function deleteTestChangeChecklistItem(
  actorUserId: string,
  changeId: string,
  checklistItemId: string
) {
  await ensureAdmin(actorUserId);

  await prisma.$transaction(async (tx) => {
    const checklistItem = await tx.testChangeChecklistItem.findFirst({
      where: { id: checklistItemId, changeId },
      select: { id: true, title: true, children: { select: { id: true } } }
    });
    if (!checklistItem) {
      throw new Error('Checklist item not found for this change.');
    }

    // When deleting a sub-checklist group, remove its child items first (the FK uses
    // ON DELETE SET NULL, so they would otherwise be orphaned as standalone items).
    const childCount = checklistItem.children.length;
    if (childCount > 0) {
      await tx.testChangeChecklistItem.deleteMany({
        where: { parentId: checklistItem.id }
      });
    }

    await tx.testChangeChecklistItem.delete({
      where: { id: checklistItem.id }
    });

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.CHECKLIST_UPDATED,
      label: childCount > 0 ? 'Sub-checklist deleted' : 'Checklist item deleted',
      detail:
        childCount > 0
          ? `Sub-checklist "${checklistItem.title}" and its ${childCount} item${
              childCount === 1 ? '' : 's'
            } were deleted.`
          : `Checklist item "${checklistItem.title}" was deleted.`,
      metadata: {
        checklistItemId: checklistItem.id,
        checklistItemTitle: checklistItem.title,
        childCount
      }
    });
  });

  return getTestChange(changeId, actorUserId);
}

// Normalize raw sub-checklist lines from the editor textarea: trim, cap title length,
// drop blank lines, and bound the total count.
function normalizeChecklistItemTitles(rawItems: string[]): string[] {
  return rawItems
    .map((item) => item.trim().slice(0, 191))
    .filter((item) => item.length > 0)
    .slice(0, 500);
}

export async function createTestChangeChecklistGroup(
  actorUserId: string,
  changeId: string,
  input: { title: string; category?: string | null; items: string[] }
) {
  await ensureAdmin(actorUserId);

  const title = input.title.trim();
  if (!title) {
    throw new Error('Sub-checklist name is required.');
  }
  const category = input.category?.trim() || null;
  const items = normalizeChecklistItemTitles(input.items);
  if (items.length === 0) {
    throw new Error('Add at least one sub-checklist item.');
  }

  await prisma.$transaction(async (tx) => {
    const change = await tx.testChange.findUnique({
      where: { id: changeId },
      select: {
        id: true,
        checklist: {
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
          take: 1
        }
      }
    });
    if (!change) {
      throw new Error('Change not found.');
    }

    let sortOrder = (change.checklist[0]?.sortOrder ?? -1) + 1;
    const group = await tx.testChangeChecklistItem.create({
      data: { changeId, title, details: null, category, sortOrder }
    });
    sortOrder += 1;
    for (const itemTitle of items) {
      await tx.testChangeChecklistItem.create({
        data: { changeId, parentId: group.id, title: itemTitle, details: null, category, sortOrder }
      });
      sortOrder += 1;
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.CHECKLIST_UPDATED,
      label: 'Sub-checklist added',
      detail: `Sub-checklist "${title}" with ${items.length} item${
        items.length === 1 ? '' : 's'
      } was added.`,
      metadata: { checklistItemId: group.id, checklistItemTitle: title, childCount: items.length }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function updateTestChangeChecklistGroup(
  actorUserId: string,
  changeId: string,
  groupId: string,
  input: { title: string; category?: string | null; items: string[] }
) {
  await ensureAdmin(actorUserId);

  const title = input.title.trim();
  if (!title) {
    throw new Error('Sub-checklist name is required.');
  }
  const category = input.category?.trim() || null;
  const items = normalizeChecklistItemTitles(input.items);
  if (items.length === 0) {
    throw new Error('Add at least one sub-checklist item.');
  }

  await prisma.$transaction(async (tx) => {
    const group = await tx.testChangeChecklistItem.findFirst({
      where: { id: groupId, changeId },
      select: { id: true, sortOrder: true, children: { select: { id: true, title: true } } }
    });
    if (!group) {
      throw new Error('Sub-checklist not found for this change.');
    }

    await tx.testChangeChecklistItem.update({
      where: { id: group.id },
      data: { title, category }
    });

    // Reconcile children by trimmed title: matched titles keep their tester progress,
    // new lines are created, removed lines are deleted. sortOrder follows textarea order.
    const existing = [...group.children];
    const usedExistingIds = new Set<string>();
    let sortOrder = group.sortOrder + 1;
    for (const itemTitle of items) {
      const match = existing.find(
        (child) => !usedExistingIds.has(child.id) && child.title === itemTitle
      );
      if (match) {
        usedExistingIds.add(match.id);
        await tx.testChangeChecklistItem.update({
          where: { id: match.id },
          data: { sortOrder, category }
        });
      } else {
        await tx.testChangeChecklistItem.create({
          data: { changeId, parentId: group.id, title: itemTitle, details: null, category, sortOrder }
        });
      }
      sortOrder += 1;
    }

    const removedIds = existing
      .filter((child) => !usedExistingIds.has(child.id))
      .map((child) => child.id);
    if (removedIds.length > 0) {
      await tx.testChangeChecklistItem.deleteMany({ where: { id: { in: removedIds } } });
    }

    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.CHECKLIST_UPDATED,
      label: 'Sub-checklist updated',
      detail: `Sub-checklist "${title}" now has ${items.length} item${
        items.length === 1 ? '' : 's'
      }.`,
      metadata: { checklistItemId: group.id, checklistItemTitle: title, childCount: items.length }
    });
  });

  return getTestChange(changeId, actorUserId);
}

export async function saveChangeNote(actorUserId: string, changeId: string, contentHtml: string) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }

  const [change, tester] = await Promise.all([
    prisma.testChange.findUnique({
      where: { id: changeId },
      select: { status: true }
    }),
    prisma.testChangeTester.findUnique({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      select: { id: true, status: true, result: true }
    })
  ]);
  ensureChangeAcceptsTestingNote(change);

  const sanitized = sanitizeRichText(contentHtml);
  const plainText = getRichTextPlainText(sanitized).slice(0, 300);
  await prisma.$transaction(async (tx) => {
    await tx.testChangeNote.create({
      data: {
        changeId,
        testerId: tester?.id ?? null,
        authorId: actorUserId,
        contentHtml: sanitized
      }
    });
    await appendHistory(tx, {
      changeId,
      actorUserId,
      eventType: TestHistoryEventType.NOTE_UPDATED,
      label: 'Notes updated',
      detail: plainText
    });
  });

  const serialized = await getTestChange(changeId, actorUserId);
  if (serialized) {
    await notifyTestManagerDiscord({
      event: 'note.added',
      actorUserId,
      change: serialized,
      detail: plainText || `${displayName(actor)} added a testing note.`,
      metadata: { testerName: displayName(actor) }
    });
  }
  return serialized;
}

export async function deleteChangeNote(actorUserId: string, changeId: string, noteId: string) {
  const note = await prisma.testChangeNote.findFirst({
    where: { id: noteId, changeId },
    select: { id: true, authorId: true }
  });
  if (!note) {
    throw new Error('Note not found.');
  }
  if (note.authorId !== actorUserId) {
    throw new Error('You can only delete your own notes.');
  }

  await prisma.testChangeNote.delete({ where: { id: note.id } });
  return getTestChange(changeId, actorUserId);
}

export async function listTestManagerUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ admin: 'desc' }, { guide: 'desc' }, { tester: 'desc' }, { displayName: 'asc' }],
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true,
      updatedAt: true,
      testAssignments: {
        select: {
          status: true,
          result: true
        }
      }
    }
  });

  return {
    users: users.map((user) => ({
      ...serializeUser(user),
      updatedAt: user.updatedAt.toISOString(),
      testingLoad: user.testAssignments.filter((assignment) =>
        OPEN_TEST_RUN_STATUSES.includes(assignment.status)
      ).length,
      recentResults: {
        passed: user.testAssignments.filter((assignment) => assignment.result === TestResult.PASS)
          .length,
        failed: user.testAssignments.filter((assignment) => assignment.result === TestResult.FAIL)
          .length,
        blocked: user.testAssignments.filter(
          (assignment) => assignment.result === TestResult.BLOCKED
        ).length
      }
    }))
  };
}

export async function updateTestManagerUserRole(
  actorUserId: string,
  userId: string,
  tester: boolean
) {
  await ensureCanManageTestManagerTesters(actorUserId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tester },
    select: {
      id: true,
      displayName: true,
      nickname: true,
      email: true,
      admin: true,
      guide: true,
      tester: true
    }
  });

  return { user: serializeUser(user) };
}

export async function getTestManagerSettings(): Promise<TestManagerSettings> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: TEST_MANAGER_SETTINGS_KEY }
  });

  if (!setting) {
    return cloneDefaultTestManagerSettings();
  }

  try {
    return normalizeTestManagerSettings(JSON.parse(setting.value));
  } catch {
    return cloneDefaultTestManagerSettings();
  }
}

export async function getCurrentTestServerVersion(): Promise<{
  currentTestServerVersion: string | null;
  currentLiveServerVersion: string | null;
}> {
  const [currentTestServerVersion, currentLiveServerVersion] = await Promise.all([
    readCurrentTestServerVersion(),
    readCurrentLiveServerVersion()
  ]);
  return {
    currentTestServerVersion,
    currentLiveServerVersion
  };
}

export async function updateCurrentTestServerVersion(
  actorUserId: string,
  value: string | null | undefined
): Promise<{
  currentTestServerVersion: string | null;
  currentLiveServerVersion: string | null;
  futureChangesPaused: number;
  versionChangesResumed: number;
}> {
  await ensureCanManageTestManagerSettings(actorUserId);
  const currentLiveServerVersion = await readCurrentLiveServerVersion();

  const currentTestServerVersion = normalizeTestServerVersion(value);
  if (!currentTestServerVersion) {
    await prisma.systemSetting.deleteMany({
      where: { key: TEST_MANAGER_CURRENT_VERSION_KEY }
    });
    return {
      currentTestServerVersion: null,
      currentLiveServerVersion,
      futureChangesPaused: 0,
      versionChangesResumed: 0
    };
  }

  const { futureChangesPaused, versionChangesResumed } = await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: TEST_MANAGER_CURRENT_VERSION_KEY },
      create: {
        key: TEST_MANAGER_CURRENT_VERSION_KEY,
        value: currentTestServerVersion
      },
      update: {
        value: currentTestServerVersion
      }
    });

    const pausedCount = await pauseFutureReadyChanges(tx, actorUserId, currentTestServerVersion);
    const resumedCount = await resumeVersionPausedChanges(
      tx,
      actorUserId,
      currentTestServerVersion
    );
    return {
      futureChangesPaused: pausedCount,
      versionChangesResumed: resumedCount
    };
  });

  return {
    currentTestServerVersion,
    currentLiveServerVersion,
    futureChangesPaused,
    versionChangesResumed
  };
}

export async function updateCurrentLiveServerVersion(
  actorUserId: string,
  value: string | null | undefined
): Promise<{ currentLiveServerVersion: string | null }> {
  await ensureCanManageTestManagerSettings(actorUserId);

  const currentLiveServerVersion = normalizeTestServerVersion(value);
  if (!currentLiveServerVersion) {
    await prisma.systemSetting.deleteMany({
      where: { key: TEST_MANAGER_CURRENT_LIVE_VERSION_KEY }
    });
    return { currentLiveServerVersion: null };
  }

  await prisma.systemSetting.upsert({
    where: { key: TEST_MANAGER_CURRENT_LIVE_VERSION_KEY },
    create: {
      key: TEST_MANAGER_CURRENT_LIVE_VERSION_KEY,
      value: currentLiveServerVersion
    },
    update: {
      value: currentLiveServerVersion
    }
  });

  return { currentLiveServerVersion };
}

export async function updateTestManagerSettings(
  actorUserId: string,
  input: {
    roles: Array<{ key: TestManagerRoleKey; permissions: TestManagerPermissionKey[] }>;
    discordNotifications?: {
      enabled: boolean;
      webhookUrl: string;
      events: TestManagerDiscordEventKey[];
    };
  }
): Promise<TestManagerSettings> {
  await ensureCanManageTestManagerSettings(actorUserId);

  const normalized = normalizeTestManagerSettings(input, { preserveNoteForPass: true });
  await prisma.systemSetting.upsert({
    where: { key: TEST_MANAGER_SETTINGS_KEY },
    create: {
      key: TEST_MANAGER_SETTINGS_KEY,
      value: JSON.stringify(normalized)
    },
    update: {
      value: JSON.stringify(normalized)
    }
  });

  return normalized;
}
