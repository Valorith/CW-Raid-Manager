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

type TestManagerPermissionKey = (typeof TEST_MANAGER_PERMISSION_KEYS)[number];
type TestManagerRoleKey = (typeof TEST_MANAGER_ROLE_KEYS)[number];

type TestManagerRolePermission = {
  key: TestManagerRoleKey;
  label: string;
  permissions: TestManagerPermissionKey[];
};

type TestManagerSettings = {
  roles: TestManagerRolePermission[];
};

const TEST_MANAGER_SETTINGS_KEY = 'testManager.rolePermissions';

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
  ]
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
    }))
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

function normalizePermissions(value: unknown): TestManagerPermissionKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const selected = new Set(value.filter(isPermissionKey));
  return TEST_MANAGER_PERMISSION_KEYS.filter((permission) => selected.has(permission));
}

function normalizeTestManagerSettings(value: unknown): TestManagerSettings {
  const defaults = cloneDefaultTestManagerSettings();
  if (!value || typeof value !== 'object' || !('roles' in value) || !Array.isArray(value.roles)) {
    return defaults;
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
    }))
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
      author: serializeUser(note.author)
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
  const inProgress = serialized.filter((change) => change.status === TestChangeStatus.TESTING);
  const passed = serialized.filter((change) => change.status === TestChangeStatus.PASSED);
  const failed = serialized.filter((change) => change.status === TestChangeStatus.FAILED);
  const resultCount =
    passed.length +
    failed.length +
    serialized.filter((change) => change.status === TestChangeStatus.BLOCKED).length;

  return {
    viewer: serializeUser(viewer),
    metrics: {
      activeChanges: active.length,
      priorityOne: active.filter(
        (change) =>
          change.priority === TestChangePriority.CRITICAL ||
          change.priority === TestChangePriority.HIGH
      ).length,
      awaitingTest: awaiting.length,
      inProgress: inProgress.length,
      passed: passed.length,
      failed: failed.length,
      coverage: resultCount > 0 ? Math.round((passed.length / resultCount) * 100) : 0
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
    dueAt?: Date | null;
    assignedToId?: string | null;
    checklist: Array<{ title: string; details?: string | null; category?: string | null }>;
  }
) {
  await ensureAdmin(actorUserId);

  const change = await prisma.$transaction(async (tx) => {
    const created = await tx.testChange.create({
      data: {
        title: input.title.trim(),
        description: sanitizeRichText(input.description),
        category: input.category.trim(),
        subsystem: input.subsystem.trim(),
        priority: input.priority,
        targetBuild: input.targetBuild?.trim() || null,
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

  return getTestChange(change.id, actorUserId);
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

  return getTestChange(changeId, actorUserId);
}

export async function deleteTestChange(actorUserId: string, changeId: string): Promise<void> {
  await ensureAdmin(actorUserId);
  await prisma.testChange.delete({ where: { id: changeId } });
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

  return getTestChange(changeId, actorUserId);
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

  return getTestChange(changeId, actorUserId);
}

export async function requestTester(
  actorUserId: string,
  changeId: string,
  userId: string,
  assignment: TestAssignmentKind
) {
  await ensureAdmin(actorUserId);

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

  return getTestChange(changeId, actorUserId);
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

  return getTestChange(changeId, actorUserId);
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
      detail: getRichTextPlainText(sanitized).slice(0, 300)
    });
  });

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
  input: { roles: Array<{ key: TestManagerRoleKey; permissions: TestManagerPermissionKey[] }> }
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
