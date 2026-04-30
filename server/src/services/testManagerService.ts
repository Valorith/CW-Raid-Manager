import {
  Prisma,
  TestAssignmentKind,
  TestChangePriority,
  TestChangeStatus,
  TestHistoryEventType,
  TestResult,
  TestRunStatus
} from '@prisma/client';

import { ensureAdmin, ensureTesterOrAdmin } from './adminService.js';
import { appConfig } from '../config/appConfig.js';
import { prisma } from '../utils/prisma.js';

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

export const TEST_MANAGER_PERMISSION_KEYS = [
  'view',
  'submit',
  'volunteer',
  'submitResult',
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

type TestManagerPermissionKey = (typeof TEST_MANAGER_PERMISSION_KEYS)[number];
type TestManagerRoleKey = (typeof TEST_MANAGER_ROLE_KEYS)[number];
type TestManagerDiscordEventKey = (typeof TEST_MANAGER_DISCORD_EVENT_KEYS)[number];

type TestManagerRolePermission = {
  key: TestManagerRoleKey;
  label: string;
  permissions: TestManagerPermissionKey[];
};

type TestManagerSettings = {
  roles: TestManagerRolePermission[];
  discordNotifications: {
    enabled: boolean;
    webhookUrl: string;
    events: TestManagerDiscordEventKey[];
  };
};

const TEST_MANAGER_SETTINGS_KEY = 'testManager.rolePermissions';
const DISCORD_COLORS = {
  primary: 0x55b7ff,
  success: 0x72d66f,
  warning: 0xd9a45f,
  danger: 0xff6b55,
  info: 0x9b7dff
} as const;

const DEFAULT_TEST_MANAGER_SETTINGS: TestManagerSettings = {
  roles: [
    {
      key: 'ADMIN',
      label: 'Admin',
      permissions: [
        'view',
        'submit',
        'volunteer',
        'submitResult',
        'dispose',
        'manageTesters',
        'reports',
        'settings'
      ]
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
  statusMessage?: string;
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

async function fetchGithubJson(
  pathname: string,
  signal: AbortSignal
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    signal,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CWRaidManager-TestManager'
    }
  });
  const data = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, data };
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

function githubApiErrorMessage(status: number, data: unknown): string {
  const message = githubString(githubObject(data).message);
  if (status === 404) {
    return 'GitHub could not find this pull request or the repository is private.';
  }
  if (status === 403) {
    return message ?? 'GitHub rate limited the metadata refresh.';
  }
  return message ?? `GitHub metadata refresh failed with HTTP ${status}.`;
}

async function fetchGithubPullRequestMetadata(
  reference: GitHubPullRequestReference
): Promise<GitHubPullRequestMetadata> {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const pull = await fetchGithubJson(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(
        reference.repo
      )}/pulls/${reference.number}`,
      controller.signal
    );

    if (!pull.ok) {
      return {
        available: false,
        fetchedAt,
        statusMessage: githubApiErrorMessage(pull.status, pull.data)
      };
    }

    const issue = await fetchGithubJson(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(
        reference.repo
      )}/issues/${reference.number}`,
      controller.signal
    ).catch(() => ({ ok: false, status: 0, data: null }));

    const pullData = githubObject(pull.data);
    const issueData = issue.ok ? githubObject(issue.data) : {};
    const user = githubObject(pullData.user);
    const base = githubObject(pullData.base);
    const head = githubObject(pullData.head);

    return {
      available: true,
      fetchedAt,
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
      labels: githubLabels(issueData.labels)
    };
  } catch (error) {
    return {
      available: false,
      fetchedAt,
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
  'code'
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

  return match[1] ? `</${normalizedName}>` : `<${normalizedName}>`;
}

function sanitizeRichText(value: string): string {
  const withoutUnsafeBlocks = value
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)[^>]*>/gi, '');
  const tagPattern = /<[^>]*>/g;
  let cursor = 0;
  let sanitized = '';

  for (const match of withoutUnsafeBlocks.matchAll(tagPattern)) {
    sanitized += escapeHtml(decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor, match.index)));
    sanitized += normalizeRichTextTag(match[0]) ?? escapeHtml(decodeHtmlEntities(match[0]));
    cursor = (match.index ?? 0) + match[0].length;
  }

  sanitized += escapeHtml(decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor)));
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

function cloneDefaultTestManagerSettings(): TestManagerSettings {
  return {
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

function normalizeTestManagerSettings(value: unknown): TestManagerSettings {
  const defaults = cloneDefaultTestManagerSettings();
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
    roles: defaults.roles.map((role) => ({
      ...role,
      permissions: incoming.get(role.key) ?? role.permissions
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

const changeInclude = {
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

type ChangeRecord = Prisma.TestChangeGetPayload<{ include: typeof changeInclude }>;

function serializeChange(change: ChangeRecord, viewerUserId?: string) {
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

  const checklistCompleted = change.checklist.filter((item) =>
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
    githubPullRequest: serializeGithubPullRequest(change.githubPrUrl, change.githubPrMetadata),
    includeInNextPatch: change.includeInNextPatch,
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
      sortOrder: item.sortOrder
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
      checklistCount: change.checklist.length,
      checklistCompleted,
      checklistProgressTotal: testerRows.reduce(
        (total, tester) =>
          total + tester.checklistProgress.filter((progress) => progress.completed).length,
        0
      ),
      checklistProgressPossible: testerRows.length * change.checklist.length
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

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateDiscord(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function buildClientAssetUrl(pathname: string): string {
  return new URL(pathname, `${appConfig.clientUrl.replace(/\/$/, '')}/`).toString();
}

function buildChangeUrl(
  change: SerializedChange,
  tab?: DiscordDeepLinkTab,
  focus?: 'notes'
): string {
  const url = new URL(
    `${appConfig.clientUrl.replace(/\/$/, '')}/test-manager/changes/${change.id}`
  );

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
  const summary = input.change.summary;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Change',
      value: isDeletedChange
        ? `#${input.change.publicId} ${truncateDiscord(input.change.title, 80)}`
        : `[#${input.change.publicId} ${truncateDiscord(input.change.title, 80)}](${changeUrl})`
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
    {
      name: 'Open In Test Manager',
      value: isDeletedChange
        ? 'Deleted change record no longer has an active page.'
        : `[${discordDeepLinkLabelForEvent(input.event)}](${changeUrl})`,
      inline: false
    }
  ];

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
      value: input.event.startsWith('checklist.')
        ? `[${checklistItemTitle}](${coverageUrl})`
        : checklistItemTitle
    });
  }
  if (input.change.dueAt) {
    fields.push({ name: 'Due', value: buildDiscordTimestamp(input.change.dueAt), inline: true });
  }

  const detail = truncateDiscord(input.detail?.trim() || `${meta.label} in Test Manager.`, 600);

  return {
    username: 'Test Manager',
    avatar_url: buildClientAssetUrl(TEST_MANAGER_DISCORD_AVATAR_PATH),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: meta.label,
        ...(isDeletedChange ? {} : { url: changeUrl }),
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

function ensureChangeAcceptsTesterInput<T extends { status: TestChangeStatus }>(
  change: T | null
): asserts change is T {
  if (!change || change.status === TestChangeStatus.CLOSED) {
    throw new Error('You must be actively testing this change to submit tester input.');
  }
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
      include: changeInclude
    })
  ]);

  const serialized = changes.map((change) => serializeChange(change, userId));
  const active = serialized.filter((change) => change.status !== TestChangeStatus.CLOSED);
  const awaiting = serialized.filter((change) => TESTING_READY_STATUSES.includes(change.status));
  const awaitingTest = serialized.filter(
    (change) => change.status === TestChangeStatus.AWAITING_TEST
  );
  const inProgress = serialized.filter((change) => change.status === TestChangeStatus.TESTING);
  const passed = serialized.filter((change) => change.status === TestChangeStatus.PASSED);
  const failed = serialized.filter((change) => change.status === TestChangeStatus.FAILED);
  const blocked = serialized.filter((change) => change.status === TestChangeStatus.BLOCKED);
  const covered = inProgress.length + passed.length + failed.length + blocked.length;

  return {
    viewer: serializeUser(viewer),
    metrics: {
      activeChanges: active.length,
      priorityOne: active.filter(
        (change) =>
          change.priority === TestChangePriority.CRITICAL ||
          change.priority === TestChangePriority.HIGH
      ).length,
      awaitingTest: awaitingTest.length,
      inProgress: inProgress.length,
      passed: passed.length,
      failed: failed.length,
      blocked: blocked.length,
      coverage: active.length > 0 ? Math.round((covered / active.length) * 100) : 0
    },
    activeChanges: active.slice(0, 12),
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
      viewerAssignments: serialized.filter(
        (change) => change.viewerTester && change.viewerTester.status !== TestRunStatus.DONE
      ).length,
      failingTests: serialized.filter((change) => change.summary.failCount > 0).length,
      blockedTests: serialized.filter(
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
    where.status = { not: TestChangeStatus.CLOSED };
  } else if (filters.status) {
    where.status = filters.status;
  }
  if (filters.search?.trim()) {
    const search = filters.search.trim();
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { category: { contains: search } },
      { subsystem: { contains: search } }
    ];
  }

  const changes = await prisma.testChange.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: changeInclude
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
              not: NEXT_PATCH_COMPLETE_STATUS
            }
    },
    orderBy: [{ closedAt: 'desc' }, { updatedAt: 'desc' }, { publicId: 'asc' }],
    include: changeInclude
  });

  return { changes: changes.map((change) => serializeChange(change, userId)) };
}

export async function countNextPatchChanges(userId: string) {
  await ensureSeedData(userId);

  const count = await prisma.testChange.count({
    where: {
      includeInNextPatch: true,
      status: NEXT_PATCH_COMPLETE_STATUS
    }
  });

  return { count };
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

export async function createTestChange(
  actorUserId: string,
  input: {
    title: string;
    description: string;
    category: string;
    subsystem: string;
    priority: TestChangePriority;
    targetBuild?: string | null;
    githubPrUrl?: string | null;
    includeInNextPatch?: boolean;
    dueAt?: Date | null;
    assignedToId?: string | null;
    checklist: Array<{ title: string; details?: string | null; category?: string | null }>;
  }
) {
  await ensureAdmin(actorUserId);
  const githubPullRequest = await buildGithubPullRequestFields(input.githubPrUrl);

  const change = await prisma.$transaction(async (tx) => {
    const created = await tx.testChange.create({
      data: {
        title: input.title.trim(),
        description: sanitizeRichText(input.description),
        category: input.category.trim(),
        subsystem: input.subsystem.trim(),
        priority: input.priority,
        targetBuild: input.targetBuild?.trim() || null,
        githubPrUrl: githubPullRequest.githubPrUrl,
        githubPrMetadata: githubPullRequest.githubPrMetadata,
        includeInNextPatch: input.includeInNextPatch ?? true,
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
    githubPrUrl?: string | null;
    includeInNextPatch?: boolean;
    dueAt?: Date | null;
    assignedToId?: string | null;
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
      githubPrUrl: true,
      includeInNextPatch: true,
      dueAt: true,
      assignedToId: true
    }
  });
  if (!existing) {
    throw new Error('Change not found.');
  }

  const githubPullRequest = await buildGithubPullRequestFields(input.githubPrUrl);
  const data = {
    title: input.title.trim(),
    description: sanitizeRichText(input.description),
    category: input.category.trim(),
    subsystem: input.subsystem.trim(),
    priority: input.priority,
    targetBuild: input.targetBuild?.trim() || null,
    githubPrUrl: githubPullRequest.githubPrUrl,
    githubPrMetadata: githubPullRequest.githubPrMetadata,
    ...(typeof input.includeInNextPatch === 'boolean'
      ? { includeInNextPatch: input.includeInNextPatch }
      : {}),
    dueAt: input.dueAt ?? null,
    assignedToId: input.assignedToId ?? null
  };

  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data
    });

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
          githubPrUrl: existing.githubPrUrl,
          includeInNextPatch: existing.includeInNextPatch,
          dueAt: existing.dueAt?.toISOString() ?? null,
          assignedToId: existing.assignedToId
        },
        to: {
          title: data.title,
          category: data.category,
          subsystem: data.subsystem,
          priority: data.priority,
          targetBuild: data.targetBuild,
          githubPrUrl: data.githubPrUrl,
          includeInNextPatch:
            typeof data.includeInNextPatch === 'boolean'
              ? data.includeInNextPatch
              : existing.includeInNextPatch,
          dueAt: data.dueAt?.toISOString() ?? null,
          assignedToId: data.assignedToId
        }
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
      data: { includeInNextPatch: false }
    });

    for (const change of changes) {
      await appendHistory(tx, {
        changeId: change.id,
        actorUserId,
        eventType: TestHistoryEventType.STATUS_CHANGED,
        label: 'Next patch reset',
        detail: 'This change was cleared from the next patch list after deployment.',
        metadata: { includeInNextPatch: false, reset: true }
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

  const closed = status === TestChangeStatus.CLOSED;
  await prisma.$transaction(async (tx) => {
    await tx.testChange.update({
      where: { id: changeId },
      data: {
        status,
        closedAt: closed ? new Date() : null,
        closedById: closed ? actorUserId : null
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
      label: status === TestChangeStatus.CLOSED ? 'Change closed' : `Status changed to ${status}`,
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
  await ensureTesterOrAdmin(actorUserId);

  await prisma.$transaction(async (tx) => {
    const change = await tx.testChange.findUnique({ where: { id: changeId } });
    if (!change) {
      throw new Error('Change not found.');
    }

    await tx.testChangeTester.upsert({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      update: {
        assignment: TestAssignmentKind.VOLUNTEER,
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
      detail: `${displayName((await getCurrentUser(actorUserId)) ?? { displayName: 'Tester', nickname: null })} started testing this change.`
    });
  }
  return serialized;
}

export async function retestChange(actorUserId: string, changeId: string) {
  await ensureTesterOrAdmin(actorUserId);

  await prisma.$transaction(async (tx) => {
    const [change, tester] = await Promise.all([
      tx.testChange.findUnique({ where: { id: changeId }, select: { id: true, status: true } }),
      tx.testChangeTester.findUnique({
        where: { changeId_userId: { changeId, userId: actorUserId } },
        select: { id: true, result: true }
      })
    ]);

    if (!change) {
      throw new Error('Change not found.');
    }
    if (change.status === TestChangeStatus.CLOSED) {
      throw new Error('Closed changes cannot be re-tested.');
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
    prisma.testChange.findUnique({ where: { id: changeId }, select: { status: true } }),
    prisma.testChangeTester.findUnique({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      select: { id: true, status: true, result: true }
    })
  ]);
  ensureChangeAcceptsTesterInput(change);
  ensureActiveTestingAssignment(existing);

  const sanitizedNotes = sanitizeRichText(input.notesHtml);
  const notesText = getRichTextPlainText(sanitizedNotes);
  if ((input.result === TestResult.FAIL || input.result === TestResult.BLOCKED) && !notesText) {
    throw new Error('Tester comments are required when reporting a failed or blocked result.');
  }

  const status = input.result === TestResult.BLOCKED ? TestRunStatus.BLOCKED : TestRunStatus.DONE;

  await prisma.$transaction(async (tx) => {
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
  if (!actor?.admin && !actor?.tester) {
    throw new Error('Tester or Administrator privileges required.');
  }

  const hasCompleted = typeof input.completed === 'boolean';
  const completed = input.completed ?? false;
  const hasNotes = typeof input.notesHtml === 'string';
  const notesHtml = hasNotes ? sanitizeRichText(input.notesHtml ?? '') : undefined;

  let checklistItemTitle = 'Checklist item';
  await prisma.$transaction(async (tx) => {
    const [change, checklistItem] = await Promise.all([
      tx.testChange.findUnique({ where: { id: changeId }, select: { id: true, status: true } }),
      tx.testChangeChecklistItem.findFirst({
        where: { id: checklistItemId, changeId },
        select: { id: true, title: true }
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

    await tx.testChangeChecklistProgress.upsert({
      where: {
        testerId_checklistItemId: {
          testerId: tester.id,
          checklistItemId
        }
      },
      update: {
        completed: hasCompleted ? completed : undefined,
        completedAt: hasCompleted ? (completed ? new Date() : null) : undefined,
        notesHtml
      },
      create: {
        testerId: tester.id,
        checklistItemId,
        completed: hasCompleted ? completed : false,
        completedAt: hasCompleted && completed ? new Date() : null,
        notesHtml: notesHtml ?? null
      }
    });

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
        ? `${displayName(actor)} ${completed ? 'completed' : 'reopened'} "${checklistItem.title}".`
        : `${displayName(actor)} updated notes for "${checklistItem.title}".`,
      metadata: {
        checklistItemId,
        completed: hasCompleted ? completed : undefined,
        notesUpdated: hasNotes
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

export async function saveChangeNote(actorUserId: string, changeId: string, contentHtml: string) {
  const actor = await getCurrentUser(actorUserId);
  if (!actor) {
    throw new Error('User not found.');
  }

  const [change, tester] = await Promise.all([
    prisma.testChange.findUnique({ where: { id: changeId }, select: { status: true } }),
    prisma.testChangeTester.findUnique({
      where: { changeId_userId: { changeId, userId: actorUserId } },
      select: { id: true, status: true, result: true }
    })
  ]);
  ensureChangeAcceptsTesterInput(change);
  ensureActiveTestingAssignment(tester);

  const sanitized = sanitizeRichText(contentHtml);
  const plainText = getRichTextPlainText(sanitized).slice(0, 300);
  await prisma.$transaction(async (tx) => {
    await tx.testChangeNote.create({
      data: {
        changeId,
        testerId: tester.id,
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
  await ensureAdmin(actorUserId);
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
  await ensureAdmin(actorUserId);

  const normalized = normalizeTestManagerSettings(input);
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
