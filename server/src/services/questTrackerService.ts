import { randomUUID } from 'node:crypto';

import {
  CharacterClass,
  GuildRole,
  Prisma,
  QuestAssignmentStatus,
  QuestNodeProgressStatus,
  QuestNodeType,
  QuestBlueprintVisibility as PrismaQuestBlueprintVisibility,
  QuestBlueprint,
  QuestBlueprintFolder,
  QuestBlueprintFolderType
} from '@prisma/client';

import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';

const ACTIVE_ASSIGNMENT_STATUSES: QuestAssignmentStatus[] = [
  QuestAssignmentStatus.ACTIVE,
  QuestAssignmentStatus.PAUSED
];

const USER_NAME_FIELDS = {
  displayName: true,
  nickname: true
} as const;
const CHARACTER_SUMMARY_FIELDS = {
  id: true,
  name: true,
  class: true
} as const;

export const QUEST_BLUEPRINT_PERMISSION_ERROR = 'QUEST_BLUEPRINT_PERMISSION_DENIED';
export const QUEST_BLUEPRINT_FOLDER_NOT_EMPTY_ERROR = 'QUEST_BLUEPRINT_FOLDER_NOT_EMPTY';
export const QUEST_BLUEPRINT_FOLDER_LOCKED_ERROR = 'QUEST_BLUEPRINT_FOLDER_LOCKED';
export const QUEST_BLUEPRINT_FOLDER_REORDER_ERROR = 'QUEST_BLUEPRINT_FOLDER_REORDER_ERROR';


export interface QuestProgressSummary {
  totalNodes: number;
  completed: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
  percentComplete: number;
}

export interface QuestBlueprintFolderSummary {
  id: string;
  title: string;
  iconKey: string | null;
  type: QuestBlueprintFolderType;
  systemKey: string | null;
  sortOrder: number;
}

type ClassFolderDefinition = {
  className: CharacterClass;
  abbreviation: string;
  iconKey: string;
};

const CLASS_FOLDER_DEFINITIONS: ClassFolderDefinition[] = [
  { className: CharacterClass.WARRIOR, abbreviation: 'WAR', iconKey: 'Warrioricon.PNG.webp' },
  { className: CharacterClass.SHADOWKNIGHT, abbreviation: 'SHD', iconKey: 'Skicon.PNG.webp' },
  { className: CharacterClass.PALADIN, abbreviation: 'PAL', iconKey: 'Paladinicon.PNG.webp' },
  { className: CharacterClass.RANGER, abbreviation: 'RNG', iconKey: 'Rangericon.PNG.webp' },
  { className: CharacterClass.MONK, abbreviation: 'MNK', iconKey: 'Monkicon.PNG.webp' },
  { className: CharacterClass.ROGUE, abbreviation: 'ROG', iconKey: 'Rogueicon.PNG.webp' },
  { className: CharacterClass.BERSERKER, abbreviation: 'BER', iconKey: 'Berserkericon.PNG.webp' },
  { className: CharacterClass.BARD, abbreviation: 'BRD', iconKey: 'Bardicon.PNG.webp' },
  { className: CharacterClass.BEASTLORD, abbreviation: 'BST', iconKey: 'Beastlordicon.PNG.webp' },
  { className: CharacterClass.CLERIC, abbreviation: 'CLR', iconKey: 'Clericicon.PNG.webp' },
  { className: CharacterClass.DRUID, abbreviation: 'DRU', iconKey: 'Druidicon.PNG.webp' },
  { className: CharacterClass.SHAMAN, abbreviation: 'SHM', iconKey: 'Shamanicon.PNG.webp' },
  { className: CharacterClass.NECROMANCER, abbreviation: 'NEC', iconKey: 'Necromancericon.PNG.webp' },
  { className: CharacterClass.WIZARD, abbreviation: 'WIZ', iconKey: 'Wizardicon.PNG.webp' },
  { className: CharacterClass.MAGICIAN, abbreviation: 'MAG', iconKey: 'Magicianicon.PNG.webp' },
  { className: CharacterClass.ENCHANTER, abbreviation: 'ENC', iconKey: 'Enchantericon.PNG.webp' }
];

async function ensureSystemBlueprintFolders(
  guildId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const systemKeys = CLASS_FOLDER_DEFINITIONS.map((entry) => entry.abbreviation);
  const existing = await tx.questBlueprintFolder.findMany({
    where: {
      guildId,
      systemKey: { in: systemKeys }
    },
    select: { systemKey: true }
  });
  const existingKeys = new Set((existing ?? []).map((folder) => folder.systemKey).filter(Boolean) as string[]);
  const createData = CLASS_FOLDER_DEFINITIONS.filter((entry) => !existingKeys.has(entry.abbreviation)).map(
    (entry) => ({
      guildId,
      title: entry.abbreviation,
      iconKey: entry.iconKey,
      type: QuestBlueprintFolderType.CLASS,
      systemKey: entry.abbreviation,
      sortOrder: CLASS_FOLDER_DEFINITIONS.findIndex((def) => def.abbreviation === entry.abbreviation) + 1
    })
  );
  if (!createData.length) {
    return;
  }
  await tx.questBlueprintFolder.createMany({
    data: createData,
    skipDuplicates: true
  });
}

function mapBlueprintFolder(folder: QuestBlueprintFolder): QuestBlueprintFolderSummary {
  return {
    id: folder.id,
    title: folder.title,
    iconKey: folder.iconKey ?? null,
    type: folder.type,
    systemKey: folder.systemKey ?? null,
    sortOrder: folder.sortOrder
  };
}

async function getNextBlueprintSortOrder(
  guildId: string,
  folderId: string | null,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const aggregate = await tx.questBlueprint.aggregate({
    _max: {
      folderSortOrder: true
    },
    where: {
      guildId,
      folderId: folderId ?? null
    }
  });
  return (aggregate._max.folderSortOrder ?? 0) + 1;
}

async function getNextFolderSortOrder(
  guildId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const aggregate = await tx.questBlueprintFolder.aggregate({
    _max: {
      sortOrder: true
    },
    where: {
      guildId
    }
  });
  return (aggregate._max.sortOrder ?? 0) + 1;
}

type QuestBlueprintWithCreator = QuestBlueprint & {
  createdBy?: {
    displayName: string;
    nickname: string | null;
  } | null;
};

export interface QuestBlueprintSummary {
  id: string;
  title: string;
  summary: string | null;
  visibility: QuestBlueprintVisibility;
  isArchived: boolean;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastEditedByName?: string | null;
  folderId: string | null;
  folderSortOrder: number;
  nodeCount: number;
  assignmentCounts: Record<QuestAssignmentStatus, number>;
  viewerAssignment?: QuestAssignmentWithProgress | null;
  viewerAssignments?: QuestAssignmentWithProgress[];
}

export interface QuestAssignmentWithProgress {
  id: string;
  status: QuestAssignmentStatus;
  startedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  lastProgressAt: Date | null;
  progressSummary: QuestProgressSummary;
  totalViewerSteps?: number;
  user?: {
    id: string;
    displayName: string;
    nickname?: string | null;
  };
  character?: {
    id: string;
    name: string;
    class: CharacterClass;
  } | null;
  progress: Array<{
    nodeId: string;
    status: QuestNodeProgressStatus;
    progressCount: number;
    targetCount: number;
    notes: string | null;
  }>;
}

export interface QuestNodeViewModel {
  id: string;
  title: string;
  description: string | null;
  nodeType: QuestNodeType;
  position: { x: number; y: number };
  sortOrder: number;
  requirements: Record<string, unknown>;
  metadata: Record<string, unknown>;
  isGroup: boolean;
  isFinal: boolean;
  isOptional: boolean;
}

export interface QuestNodeLinkViewModel {
  id: string;
  parentNodeId: string;
  childNodeId: string;
  conditions: Record<string, unknown>;
}

export interface QuestBlueprintDetailResponse {
  blueprint: QuestBlueprintSummary;
  nodes: QuestNodeViewModel[];
  links: QuestNodeLinkViewModel[];
  assignmentStats: Record<QuestAssignmentStatus, number>;
  viewerAssignment?: QuestAssignmentWithProgress | null;
  viewerAssignments?: QuestAssignmentWithProgress[];
  guildAssignments?: QuestAssignmentWithProgress[];
}

export interface QuestTrackerSummaryResponse {
  blueprints: QuestBlueprintSummary[];
  folders?: QuestBlueprintFolderSummary[];
}

export type QuestBlueprintVisibility = PrismaQuestBlueprintVisibility;

interface JsonRecord extends Record<string, Prisma.JsonValue> { }

const QUEST_ASSIGNMENT_USER_SELECT = {
  id: true,
  displayName: true,
  nickname: true
} as const;
const NEXT_STEP_CONDITION_KEY = '__isNextStep';

type AssignmentWithProgress = Prisma.QuestAssignmentGetPayload<{
  include: {
    progress: true;
    user: {
      select: typeof QUEST_ASSIGNMENT_USER_SELECT;
    };
    character: {
      select: typeof CHARACTER_SUMMARY_FIELDS;
    };
  };
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function resolveUserDisplayName(
  userId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { displayName: true, nickname: true }
  });
  if (!user) {
    return null;
  }
  return withPreferredDisplayName(user).displayName;
}

function isNextStepCondition(value: unknown): boolean {
  return value === true;
}

async function loadBlueprintGraph(
  blueprintId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const nodes = await tx.questNode.findMany({
    where: { blueprintId },
    select: { id: true, metadata: true }
  });

  const links = await tx.questNodeLink.findMany({
    where: { blueprintId },
    select: { parentNodeId: true, childNodeId: true, conditions: true }
  });

  const nodeMeta = new Map(
    nodes.map((node) => {
      const normalized = normalizeJsonRecord(node.metadata);
      return [
        node.id,
        {
          isGroup: Boolean(normalized.isGroup),
          isFinal: Boolean(normalized.isFinal),
          isOptional: Boolean(normalized.isOptional)
        }
      ];
    })
  );
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string[]>();
  const nextStepParentMap = new Map<string, string[]>();
  const nextStepChildMap = new Map<string, string[]>();
  for (const link of links) {
    const conditions = normalizeJsonRecord(link.conditions);
    if (isNextStepCondition(conditions[NEXT_STEP_CONDITION_KEY])) {
      const parents = nextStepParentMap.get(link.childNodeId) ?? [];
      parents.push(link.parentNodeId);
      nextStepParentMap.set(link.childNodeId, parents);
      const children = nextStepChildMap.get(link.parentNodeId) ?? [];
      children.push(link.childNodeId);
      nextStepChildMap.set(link.parentNodeId, children);
      continue;
    }
    const list = childMap.get(link.parentNodeId) ?? [];
    list.push(link.childNodeId);
    childMap.set(link.parentNodeId, list);

    const parents = parentMap.get(link.childNodeId) ?? [];
    parents.push(link.parentNodeId);
    parentMap.set(link.childNodeId, parents);
  }

  return { nodeMeta, childMap, parentMap, nextStepParentMap, nextStepChildMap };
}

function collectDescendantNodeIds(
  nodeId: string,
  childMap: Map<string, string[]>,
  cache: Map<string, string[]>
) {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }
  const visited = new Set<string>();
  const queue = [...(childMap.get(nodeId) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const children = childMap.get(current) ?? [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }
  const result = Array.from(visited);
  cache.set(nodeId, result);
  return result;
}

function collectDownstreamNodeIds(
  nodeId: string,
  childMap: Map<string, string[]>,
  nextStepChildMap: Map<string, string[]>,
  cache: Map<string, string[]>
) {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }
  const visited = new Set<string>();
  const queue = [
    ...(childMap.get(nodeId) ?? []),
    ...(nextStepChildMap.get(nodeId) ?? [])
  ];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const children = childMap.get(current) ?? [];
    const nextStepChildren = nextStepChildMap.get(current) ?? [];
    for (const childId of [...children, ...nextStepChildren]) {
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }
  const result = Array.from(visited);
  cache.set(nodeId, result);
  return result;
}

function deriveGroupNodeStatus(children: QuestNodeProgressStatus[]) {
  if (!children.length) {
    return {
      status: QuestNodeProgressStatus.COMPLETED,
      completed: 0
    };
  }

  const completed = children.filter((status) => status === QuestNodeProgressStatus.COMPLETED).length;
  if (completed === children.length) {
    return { status: QuestNodeProgressStatus.COMPLETED, completed };
  }

  if (children.some((status) => status === QuestNodeProgressStatus.BLOCKED)) {
    return { status: QuestNodeProgressStatus.BLOCKED, completed };
  }

  if (
    children.some((status) => status === QuestNodeProgressStatus.IN_PROGRESS || status === QuestNodeProgressStatus.COMPLETED)
  ) {
    return { status: QuestNodeProgressStatus.IN_PROGRESS, completed };
  }

  return { status: QuestNodeProgressStatus.NOT_STARTED, completed };
}

async function syncGroupProgressForAssignment(
  assignmentId: string,
  blueprintId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { nodeMeta, childMap } = await loadBlueprintGraph(blueprintId, tx);
  const groupNodeEntries = [...nodeMeta.entries()].filter(([, meta]) => meta.isGroup);
  if (!groupNodeEntries.length) {
    return;
  }

  const progressRecords = await tx.questNodeProgress.findMany({
    where: { assignmentId }
  });
  const progressMap = new Map(progressRecords.map((record) => [record.nodeId, record]));
  const descendantCache = new Map<string, string[]>();

  for (const [groupNodeId] of groupNodeEntries) {
    const groupRecord = progressMap.get(groupNodeId);
    if (!groupRecord) {
      continue;
    }
    if (groupRecord.isDisabled) {
      await tx.questNodeProgress.update({
        where: {
          assignmentId_nodeId: {
            assignmentId,
            nodeId: groupNodeId
          }
        },
        data: {
          status: QuestNodeProgressStatus.NOT_STARTED,
          progressCount: 0,
          targetCount: 0,
          completedAt: null
        }
      });
      continue;
    }

    const descendantIds = collectDescendantNodeIds(groupNodeId, childMap, descendantCache);
    const targetIds = descendantIds.filter((childId) => {
      const childMeta = nodeMeta.get(childId);
      if (childMeta?.isOptional) {
        return false;
      }
      return !(progressMap.get(childId)?.isDisabled);
    });
    const childStatuses = targetIds.map(
      (childId) => progressMap.get(childId)?.status ?? QuestNodeProgressStatus.NOT_STARTED
    );
    const { status, completed } = deriveGroupNodeStatus(childStatuses);
    const targetCount = targetIds.length;
    if (groupRecord) {
      const existingComplete = groupRecord.completedAt != null;
      const needsUpdate =
        groupRecord.status !== status ||
        groupRecord.progressCount !== completed ||
        groupRecord.targetCount !== targetCount ||
        (status === QuestNodeProgressStatus.COMPLETED && !existingComplete) ||
        (status !== QuestNodeProgressStatus.COMPLETED && existingComplete);
      if (!needsUpdate) {
        continue;
      }
    }
    await tx.questNodeProgress.update({
      where: {
        assignmentId_nodeId: {
          assignmentId,
          nodeId: groupNodeId
        }
      },
      data: {
        status,
        progressCount: completed,
        targetCount,
        completedAt: status === QuestNodeProgressStatus.COMPLETED ? groupRecord?.completedAt ?? new Date() : null
      }
    });
  }
}

async function syncGroupProgressForBlueprint(
  blueprintId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const assignments = await tx.questAssignment.findMany({
    where: { blueprintId },
    select: { id: true }
  });

  for (const assignment of assignments) {
    await syncGroupProgressForAssignment(assignment.id, blueprintId, tx);
  }
}

function normalizeJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function coerceQuestProgressSummary(value: Prisma.JsonValue | null): QuestProgressSummary {
  if (isRecord(value)) {
    const totalNodes = typeof value.totalNodes === 'number' ? value.totalNodes : 0;
    const completed = typeof value.completed === 'number' ? value.completed : 0;
    const inProgress = typeof value.inProgress === 'number' ? value.inProgress : 0;
    const blocked = typeof value.blocked === 'number' ? value.blocked : 0;
    const notStarted = typeof value.notStarted === 'number' ? value.notStarted : 0;
    const percentComplete = typeof value.percentComplete === 'number' ? value.percentComplete : 0;
    return { totalNodes, completed, inProgress, blocked, notStarted, percentComplete };
  }

  return {
    totalNodes: 0,
    completed: 0,
    inProgress: 0,
    blocked: 0,
    notStarted: 0,
    percentComplete: 0
  };
}

function buildProgressSummary(
  records: Array<{ nodeId: string; status: QuestNodeProgressStatus; isDisabled?: boolean }>,
  options?: { nodeMeta?: Map<string, { isOptional?: boolean }> }
): QuestProgressSummary {
  const filtered = records.filter((record) => {
    if (record.isDisabled) {
      return false;
    }
    if (options?.nodeMeta) {
      const meta = options.nodeMeta.get(record.nodeId);
      if (!meta) {
        return false;
      }
      if (meta.isOptional) {
        return false;
      }
    }
    return true;
  });
  const summary: QuestProgressSummary = {
    totalNodes: filtered.length,
    completed: 0,
    inProgress: 0,
    blocked: 0,
    notStarted: 0,
    percentComplete: 0
  };

  for (const record of filtered) {
    switch (record.status) {
      case QuestNodeProgressStatus.COMPLETED:
        summary.completed += 1;
        break;
      case QuestNodeProgressStatus.IN_PROGRESS:
        summary.inProgress += 1;
        break;
      case QuestNodeProgressStatus.BLOCKED:
        summary.blocked += 1;
        break;
      default:
        summary.notStarted += 1;
        break;
    }
  }

  if (summary.totalNodes > 0) {
    summary.percentComplete = Number((summary.completed / summary.totalNodes).toFixed(4));
  }

  return summary;
}

function mapAssignment(
  assignment: AssignmentWithProgress,
  options?: { includeUser?: boolean; totalViewerSteps?: number }
): QuestAssignmentWithProgress {
  return {
    id: assignment.id,
    status: assignment.status,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    cancelledAt: assignment.cancelledAt,
    lastProgressAt: assignment.lastProgressAt,
    progressSummary: coerceQuestProgressSummary(assignment.progressSummary),
    totalViewerSteps: options?.totalViewerSteps,
    user:
      options?.includeUser !== false && assignment.user
        ? withPreferredDisplayName(assignment.user)
        : undefined,
    character: assignment.character
      ? {
        id: assignment.character.id,
        name: assignment.character.name,
        class: assignment.character.class
      }
      : null,
    progress: assignment.progress.map((record) => ({
      nodeId: record.nodeId,
      status: record.status,
      progressCount: record.progressCount,
      targetCount: record.targetCount,
      notes: record.notes ?? null,
      isDisabled: record.isDisabled ?? false
    }))
  };
}

function mapBlueprintSummary(
  blueprint: QuestBlueprintWithCreator,
  nodeCount: number,
  assignmentCounts: Record<QuestAssignmentStatus, number>,
  viewerAssignments?: QuestAssignmentWithProgress[]
): QuestBlueprintSummary {
  const creatorName = blueprint.createdBy
    ? withPreferredDisplayName(blueprint.createdBy).displayName
    : null;
  const primaryViewerAssignment = viewerAssignments?.[0] ?? null;
  return {
    id: blueprint.id,
    title: blueprint.title,
    summary: blueprint.summary ?? null,
    visibility: blueprint.visibility,
    isArchived: blueprint.isArchived,
    createdById: blueprint.createdById,
    createdByName: creatorName,
    createdAt: blueprint.createdAt,
    updatedAt: blueprint.updatedAt,
    lastEditedByName: blueprint.lastEditedByName ?? null,
    folderId: blueprint.folderId ?? null,
    folderSortOrder: blueprint.folderSortOrder ?? 0,
    nodeCount,
    assignmentCounts,
    viewerAssignment: primaryViewerAssignment,
    viewerAssignments
  };
}

function getDefaultAssignmentCounts(): Record<QuestAssignmentStatus, number> {
  return {
    [QuestAssignmentStatus.ACTIVE]: 0,
    [QuestAssignmentStatus.PAUSED]: 0,
    [QuestAssignmentStatus.COMPLETED]: 0,
    [QuestAssignmentStatus.CANCELLED]: 0
  };
}

async function refreshAssignmentSummary(
  assignmentId: string,
  blueprintId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const progressRecords = await tx.questNodeProgress.findMany({
    where: { assignmentId },
    select: { nodeId: true, status: true, isDisabled: true }
  });
  const { nodeMeta } = await loadBlueprintGraph(blueprintId, tx);
  const summary = buildProgressSummary(progressRecords, { nodeMeta });
  await tx.questAssignment.update({
    where: { id: assignmentId },
    data: {
      progressSummary: summary as unknown as Prisma.InputJsonValue,
      lastProgressAt: new Date()
    }
  });
}

async function refreshSummariesForBlueprint(
  blueprintId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const assignments = await tx.questAssignment.findMany({
    where: { blueprintId },
    select: { id: true }
  });

  for (const assignment of assignments) {
    await refreshAssignmentSummary(assignment.id, blueprintId, tx);
  }
}

function sanitizeNumeric(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function sanitizeJsonInput(value: Record<string, unknown> | undefined): JsonRecord {
  if (!value) {
    return {};
  }
  const result: JsonRecord = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === undefined) {
      continue;
    }
    result[key] = entryValue as Prisma.JsonValue;
  }
  return result;
}

function extractTargetCount(requirements: Record<string, unknown>): number {
  const maybeCount = requirements?.count;
  if (typeof maybeCount === 'number' && Number.isFinite(maybeCount)) {
    return Math.max(0, Math.trunc(maybeCount));
  }
  if (typeof maybeCount === 'string') {
    const parsed = Number.parseInt(maybeCount, 10);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

export async function listGuildQuestTrackerSummary(options: {
  guildId: string;
  viewerUserId: string;
}): Promise<QuestTrackerSummaryResponse> {
  await ensureSystemBlueprintFolders(options.guildId);

  const folders = await prisma.questBlueprintFolder.findMany({
    where: { guildId: options.guildId },
    orderBy: [
      { type: 'asc' },
      { sortOrder: 'asc' },
      { title: 'asc' }
    ]
  });

  const blueprints = await prisma.questBlueprint.findMany({
    where: { guildId: options.guildId },
    include: {
      createdBy: {
        select: USER_NAME_FIELDS
      }
    },
    orderBy: [
      { isArchived: 'asc' },
      { title: 'asc' }
    ]
  });

  if (blueprints.length === 0) {
    return { blueprints: [], folders: folders.map(mapBlueprintFolder) };
  }

  const blueprintIds = blueprints.map((bp) => bp.id);

  const [blueprintNodes, blueprintLinks, assignmentGroups, viewerAssignments] = await Promise.all([
    prisma.questNode.findMany({
      where: { blueprintId: { in: blueprintIds } },
      select: { id: true, blueprintId: true, metadata: true }
    }),
    prisma.questNodeLink.findMany({
      where: { blueprintId: { in: blueprintIds } },
      select: { blueprintId: true, parentNodeId: true, childNodeId: true }
    }),
    prisma.questAssignment.groupBy({
      by: ['blueprintId', 'status'],
      where: { blueprintId: { in: blueprintIds } },
      _count: { _all: true }
    }),
    prisma.questAssignment.findMany({
      where: {
        blueprintId: { in: blueprintIds },
        userId: options.viewerUserId,
        status: {
          in: [
            QuestAssignmentStatus.ACTIVE,
            QuestAssignmentStatus.PAUSED,
            QuestAssignmentStatus.COMPLETED
          ]
        }
      },
      orderBy: [{ startedAt: 'desc' }],
      include: {
        progress: true,
        user: {
          select: QUEST_ASSIGNMENT_USER_SELECT
        },
        character: {
          select: CHARACTER_SUMMARY_FIELDS
        }
      }
    })
  ]);

  const stepCountMap = computeShortestPathMap(blueprintIds, blueprintNodes, blueprintLinks);

  const assignmentCountMap = new Map<string, Record<QuestAssignmentStatus, number>>();
  for (const group of assignmentGroups) {
    const entry = assignmentCountMap.get(group.blueprintId) ?? getDefaultAssignmentCounts();
    entry[group.status] = group._count._all ?? 0;
    assignmentCountMap.set(group.blueprintId, entry);
  }

  const viewerAssignmentMap = new Map<string, AssignmentWithProgress[]>();
  for (const assignment of viewerAssignments) {
    const list = viewerAssignmentMap.get(assignment.blueprintId) ?? [];
    list.push(assignment);
    viewerAssignmentMap.set(assignment.blueprintId, list);
  }

  const summaries = blueprints.map((blueprint) => {
    const nodeCount = stepCountMap.get(blueprint.id) ?? 0;
    const assignmentCounts = assignmentCountMap.get(blueprint.id) ?? getDefaultAssignmentCounts();
    const viewerAssignmentRaw = viewerAssignmentMap.get(blueprint.id) ?? [];
    const viewerAssignmentsPayload = viewerAssignmentRaw.map((assignment) =>
      mapAssignment(assignment, {
        totalViewerSteps: nodeCount,
        includeUser: true
      })
    );
    return mapBlueprintSummary(blueprint, nodeCount, assignmentCounts, viewerAssignmentsPayload.length ? viewerAssignmentsPayload : undefined);
  });

  return { blueprints: summaries, folders: folders.map(mapBlueprintFolder) };
}

export async function createQuestBlueprint(options: {
  guildId: string;
  creatorUserId: string;
  title: string;
  summary?: string | null;
  visibility?: QuestBlueprintVisibility;
}): Promise<QuestBlueprintSummary> {
  const creatorName = await resolveUserDisplayName(options.creatorUserId);
  const folderSortOrder = await getNextBlueprintSortOrder(options.guildId, null);
  const blueprint = await prisma.questBlueprint.create({
    data: {
      guildId: options.guildId,
      createdById: options.creatorUserId,
      title: options.title,
      summary: options.summary ?? null,
      visibility: options.visibility ?? 'GUILD',
      lastEditedById: options.creatorUserId,
      lastEditedByName: creatorName,
      folderSortOrder
    },
    include: {
      createdBy: {
        select: USER_NAME_FIELDS
      }
    }
  });

  return mapBlueprintSummary(blueprint, 0, getDefaultAssignmentCounts(), undefined);
}

export async function createQuestBlueprintFolder(options: {
  guildId: string;
  actorUserId: string;
  title: string;
}): Promise<QuestBlueprintFolderSummary> {
  const title = options.title.trim();
  if (!title) {
    throw new Error('Folder title is required.');
  }
  const sortOrder = await getNextFolderSortOrder(options.guildId);
  const folder = await prisma.questBlueprintFolder.create({
    data: {
      guildId: options.guildId,
      title,
      type: QuestBlueprintFolderType.CUSTOM,
      createdById: options.actorUserId,
      sortOrder
    }
  });
  return mapBlueprintFolder(folder);
}

export async function updateQuestBlueprintFolder(options: {
  guildId: string;
  folderId: string;
  actorRole: GuildRole | null | undefined;
  actorUserId: string;
  title: string;
}): Promise<QuestBlueprintFolderSummary> {
  if (!canManageQuestBlueprints(options.actorRole)) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }
  const folder = await prisma.questBlueprintFolder.findUnique({ where: { id: options.folderId } });
  if (!folder || folder.guildId !== options.guildId) {
    throw new Error('Quest folder not found.');
  }
  if (folder.type === QuestBlueprintFolderType.CLASS) {
    throw new Error(QUEST_BLUEPRINT_FOLDER_LOCKED_ERROR);
  }
  const title = options.title.trim();
  if (!title) {
    throw new Error('Folder title is required.');
  }
  const updated = await prisma.questBlueprintFolder.update({
    where: { id: options.folderId },
    data: { title }
  });
  return mapBlueprintFolder(updated);
}

export async function deleteQuestBlueprintFolder(options: {
  guildId: string;
  folderId: string;
  actorRole: GuildRole | null | undefined;
  actorUserId: string;
}): Promise<void> {
  if (!canManageQuestBlueprints(options.actorRole)) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }
  const folder = await prisma.questBlueprintFolder.findUnique({ where: { id: options.folderId } });
  if (!folder || folder.guildId !== options.guildId) {
    throw new Error('Quest folder not found.');
  }
  if (folder.type === QuestBlueprintFolderType.CLASS) {
    throw new Error(QUEST_BLUEPRINT_FOLDER_LOCKED_ERROR);
  }
  const blueprintCount = await prisma.questBlueprint.count({
    where: {
      folderId: folder.id
    }
  });
  if (blueprintCount > 0) {
    throw new Error(QUEST_BLUEPRINT_FOLDER_NOT_EMPTY_ERROR);
  }
  await prisma.questBlueprintFolder.delete({
    where: { id: folder.id }
  });
}

export async function updateBlueprintFolderAssignments(options: {
  guildId: string;
  actorRole: GuildRole | null | undefined;
  actorUserId: string;
  updates: Array<{ blueprintId: string; folderId?: string | null; sortOrder: number }>;
}): Promise<void> {
  if (!canManageQuestBlueprints(options.actorRole)) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }
  if (!options.updates.length) {
    return;
  }
  const blueprintIds = options.updates.map((entry) => entry.blueprintId);
  const blueprints = await prisma.questBlueprint.findMany({
    where: { id: { in: blueprintIds } },
    select: { id: true, guildId: true }
  });
  if (blueprints.length !== blueprintIds.length || blueprints.some((entry) => entry.guildId !== options.guildId)) {
    throw new Error('Quest blueprint not found.');
  }
  const folderIds = options.updates.map((entry) => entry.folderId).filter((value): value is string => Boolean(value));
  if (folderIds.length) {
    const uniqueFolderIds = Array.from(new Set(folderIds));
    const folders = await prisma.questBlueprintFolder.findMany({
      where: { id: { in: uniqueFolderIds } },
      select: { id: true, guildId: true }
    });
    if (folders.length !== uniqueFolderIds.length || folders.some((folder) => folder.guildId !== options.guildId)) {
      throw new Error('Quest folder not found.');
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const update of options.updates) {
      await tx.questBlueprint.update({
        where: { id: update.blueprintId },
        data: {
          folderId: update.folderId ?? null,
          folderSortOrder: update.sortOrder
        }
      });
    }
  });
}

export async function updateQuestFolderOrder(options: {
  guildId: string;
  actorRole: GuildRole | null | undefined;
  updates: Array<{ folderId: string; sortOrder: number }>;
}) {
  if (!canManageQuestBlueprints(options.actorRole)) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }
  if (!options.updates.length) {
    return;
  }
  const folderIds = Array.from(new Set(options.updates.map((entry) => entry.folderId)));
  const folders = await prisma.questBlueprintFolder.findMany({
    where: { id: { in: folderIds } },
    select: { id: true, guildId: true, type: true }
  });
  if (folders.length !== folderIds.length || folders.some((folder) => folder.guildId !== options.guildId)) {
    throw new Error('Quest folder not found.');
  }

  await prisma.$transaction(async (tx) => {
    for (const update of options.updates) {
      await tx.questBlueprintFolder.update({
        where: { id: update.folderId },
        data: { sortOrder: update.sortOrder }
      });
    }
  });
}

export async function updateQuestBlueprintMetadata(options: {
  guildId: string;
  blueprintId: string;
  actorUserId: string;
  actorRole: GuildRole | null | undefined;
  data: {
    title?: string;
    summary?: string | null;
    visibility?: QuestBlueprintVisibility;
    isArchived?: boolean;
  };
}): Promise<QuestBlueprintSummary> {
  const existing = await prisma.questBlueprint.findUnique({
    where: { id: options.blueprintId }
  });

  if (!existing || existing.guildId !== options.guildId) {
    throw new Error('Quest blueprint not found.');
  }

  if (
    !canEditQuestBlueprint(
      options.actorRole,
      options.actorUserId,
      existing.createdById
    )
  ) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }

  const updatePayload: Prisma.QuestBlueprintUpdateInput = {};
  if (options.data.title !== undefined) {
    updatePayload.title = options.data.title;
  }
  if (options.data.summary !== undefined) {
    updatePayload.summary = options.data.summary;
  }
  if (options.data.visibility !== undefined) {
    updatePayload.visibility = options.data.visibility;
  }
  if (options.data.isArchived !== undefined) {
    updatePayload.isArchived = options.data.isArchived;
  }

  const actorName = await resolveUserDisplayName(options.actorUserId);
  updatePayload.lastEditedById = options.actorUserId;
  updatePayload.lastEditedByName = actorName;

  const updated = await prisma.questBlueprint.update({
    where: { id: options.blueprintId },
    data: updatePayload,
    include: {
      createdBy: {
        select: USER_NAME_FIELDS
      }
    }
  });

  const [blueprintNodes, blueprintLinks, latestCounts] = await Promise.all([
    prisma.questNode.findMany({
      where: { blueprintId: updated.id },
      select: { id: true, metadata: true, blueprintId: true }
    }),
    prisma.questNodeLink.findMany({
      where: { blueprintId: updated.id },
      select: { blueprintId: true, parentNodeId: true, childNodeId: true }
    }),
    prisma.questAssignment.groupBy({
      by: ['status'],
      where: { blueprintId: updated.id },
      _count: { _all: true }
    })
  ]);
  const assignmentCounts = getDefaultAssignmentCounts();
  for (const entry of latestCounts) {
    assignmentCounts[entry.status] = entry._count._all ?? 0;
  }

  const stepCountMap = computeShortestPathMap([updated.id], blueprintNodes, blueprintLinks);
  const nodeCount = stepCountMap.get(updated.id) ?? blueprintNodes.length;

  return mapBlueprintSummary(updated, nodeCount, assignmentCounts, undefined);
}

export async function deleteQuestBlueprint(options: {
  guildId: string;
  blueprintId: string;
  actorUserId: string;
  actorRole: GuildRole | null | undefined;
}): Promise<void> {
  const blueprint = await prisma.questBlueprint.findUnique({
    where: { id: options.blueprintId },
    select: { id: true, guildId: true, createdById: true }
  });

  if (!blueprint || blueprint.guildId !== options.guildId) {
    throw new Error('Quest blueprint not found.');
  }

  const canDelete = canManageQuestBlueprints(options.actorRole);
  if (!canDelete) {
    throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
  }

  await prisma.questBlueprint.delete({ where: { id: options.blueprintId } });
}

export async function getQuestBlueprintDetail(options: {
  guildId: string;
  blueprintId: string;
  viewerUserId: string;
  includeGuildAssignments: boolean;
}): Promise<QuestBlueprintDetailResponse> {
  const blueprint = await prisma.questBlueprint.findUnique({
    where: { id: options.blueprintId },
    include: {
      nodes: true,
      links: true,
      createdBy: {
        select: USER_NAME_FIELDS
      }
    }
  });

  if (!blueprint || blueprint.guildId !== options.guildId) {
    throw new Error('Quest blueprint not found.');
  }

  const [assignmentGroups, viewerAssignments, guildAssignments] = await Promise.all([
    prisma.questAssignment.groupBy({
      by: ['status'],
      where: { blueprintId: options.blueprintId },
      _count: { _all: true }
    }),
    prisma.questAssignment.findMany({
      where: {
        blueprintId: options.blueprintId,
        userId: options.viewerUserId,
        status: {
          in: [
            QuestAssignmentStatus.ACTIVE,
            QuestAssignmentStatus.PAUSED,
            QuestAssignmentStatus.COMPLETED
          ]
        }
      },
      orderBy: [{ startedAt: 'desc' }],
      include: {
        progress: true,
        user: {
          select: QUEST_ASSIGNMENT_USER_SELECT
        },
        character: {
          select: CHARACTER_SUMMARY_FIELDS
        }
      }
    }),
    options.includeGuildAssignments
      ? prisma.questAssignment.findMany({
        where: {
          blueprintId: options.blueprintId,
          status: { in: ACTIVE_ASSIGNMENT_STATUSES }
        },
        include: {
          user: {
            select: QUEST_ASSIGNMENT_USER_SELECT
          },
          progress: true,
          character: {
            select: CHARACTER_SUMMARY_FIELDS
          }
        },
        orderBy: [{ startedAt: 'asc' }]
      })
      : Promise.resolve([])
  ]);

  const assignmentCounts = getDefaultAssignmentCounts();
  for (const group of assignmentGroups) {
    assignmentCounts[group.status] = group._count._all ?? 0;
  }

  const nodes = blueprint.nodes
    .map<QuestNodeViewModel>((node) => {
      const normalizedRequirements = normalizeJsonRecord(node.requirements);
      const normalizedMetadata = normalizeJsonRecord(node.metadata);
      return {
        id: node.id,
        title: node.title,
        description: node.description ?? null,
        nodeType: node.nodeType,
        position: { x: node.positionX, y: node.positionY },
        sortOrder: node.sortOrder,
        requirements: normalizedRequirements,
        metadata: normalizedMetadata,
        isGroup: Boolean(normalizedMetadata.isGroup),
        isFinal: Boolean(normalizedMetadata.isFinal),
        isOptional: Boolean(normalizedMetadata.isOptional)
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  const links = blueprint.links.map<QuestNodeLinkViewModel>((link) => ({
    id: link.id,
    parentNodeId: link.parentNodeId,
    childNodeId: link.childNodeId,
    conditions: normalizeJsonRecord(link.conditions)
  }));

  const totalViewerSteps =
    computeShortestPathMap(
      [blueprint.id],
      blueprint.nodes.map((node) => ({
        id: node.id,
        blueprintId: node.blueprintId,
        metadata: node.metadata
      })),
      blueprint.links.map((link) => ({
        blueprintId: link.blueprintId,
        parentNodeId: link.parentNodeId,
        childNodeId: link.childNodeId
      }))
    ).get(blueprint.id) ?? blueprint.nodes.length;

  const viewerAssignmentsPayload = viewerAssignments.map((assignment) =>
    mapAssignment(assignment, { totalViewerSteps })
  );
  const guildAssignmentPayloads = options.includeGuildAssignments
    ? (guildAssignments as AssignmentWithProgress[]).map((assignment) =>
      mapAssignment(assignment, { includeUser: true })
    )
    : [];

  const blueprintSummary = mapBlueprintSummary(
    blueprint,
    nodes.length,
    assignmentCounts,
    viewerAssignmentsPayload
  );

  return {
    blueprint: blueprintSummary,
    nodes,
    links,
    assignmentStats: assignmentCounts,
    viewerAssignment: viewerAssignmentsPayload[0] ?? null,
    viewerAssignments: viewerAssignmentsPayload,
    guildAssignments: options.includeGuildAssignments ? guildAssignmentPayloads : undefined
  };
}

export async function upsertQuestBlueprintGraph(options: {
  guildId: string;
  blueprintId: string;
  actorUserId: string;
  actorRole: GuildRole | null | undefined;
  nodes: Array<{
    id: string;
    title: string;
    description?: string | null;
    nodeType: QuestNodeType;
    position: { x: number; y: number };
    sortOrder: number;
    requirements?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    isGroup?: boolean;
    isOptional?: boolean;
  }>;
  links: Array<{
    id: string;
    parentNodeId: string;
    childNodeId: string;
    conditions?: Record<string, unknown>;
  }>;
}): Promise<void> {
  const nodeIds = new Set<string>();
  for (const node of options.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate quest node identifier detected (${node.id}).`);
    }
    nodeIds.add(node.id);
  }

  const linkPairs = new Set<string>();
  for (const link of options.links) {
    if (!nodeIds.has(link.parentNodeId) || !nodeIds.has(link.childNodeId)) {
      throw new Error('Quest connector references an unknown node.');
    }
    if (link.parentNodeId === link.childNodeId) {
      throw new Error('Quest connector cannot point to the same node.');
    }
    const key = `${link.parentNodeId}:${link.childNodeId}`;
    if (linkPairs.has(key)) {
      throw new Error('Duplicate quest connector detected.');
    }
    linkPairs.add(key);
  }

  const requirementSnapshot = new Map<string, Record<string, unknown>>();
  const nodeGroupMap = new Map<string, boolean>();
  for (const node of options.nodes) {
    requirementSnapshot.set(node.id, node.requirements ?? {});
    nodeGroupMap.set(node.id, Boolean(node.isGroup));
  }

  await prisma.$transaction(async (tx) => {
    const blueprint = await tx.questBlueprint.findUnique({
      where: { id: options.blueprintId },
      select: { id: true, guildId: true, createdById: true }
    });

    if (!blueprint || blueprint.guildId !== options.guildId) {
      throw new Error('Quest blueprint not found.');
    }

    if (
      !canEditQuestBlueprint(
        options.actorRole,
        options.actorUserId,
        blueprint.createdById
      )
    ) {
      throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
    }

    const existingNodes = await tx.questNode.findMany({
      where: { blueprintId: options.blueprintId },
      select: { id: true }
    });

    const existingIds = new Set(existingNodes.map((entry) => entry.id));
    const incomingIds = new Set(options.nodes.map((node) => node.id));
    const nodesToDelete = [...existingIds].filter((id) => !incomingIds.has(id));

    if (nodesToDelete.length) {
      await tx.questNode.deleteMany({ where: { id: { in: nodesToDelete } } });
      await tx.questNodeProgress.deleteMany({ where: { nodeId: { in: nodesToDelete } } });
    }

    const newNodeIds: string[] = [];

    for (const node of options.nodes) {
      const metadataInput = sanitizeJsonInput(node.metadata);
      if (node.isGroup) {
        metadataInput.isGroup = true;
      } else if (metadataInput.isGroup) {
        delete metadataInput.isGroup;
      }
      if (node.isOptional) {
        metadataInput.isOptional = true;
      } else if (metadataInput.isOptional) {
        delete metadataInput.isOptional;
      }

      const baseData = {
        title: node.title,
        description: node.description ?? null,
        nodeType: node.nodeType,
        positionX: Math.round(sanitizeNumeric(node.position.x, -10_000, 10_000)),
        positionY: Math.round(sanitizeNumeric(node.position.y, -10_000, 10_000)),
        sortOrder: node.sortOrder,
        requirements: sanitizeJsonInput(node.requirements),
        metadata: metadataInput
      } satisfies Omit<Prisma.QuestNodeUncheckedCreateInput, 'blueprintId'>;

      if (existingIds.has(node.id)) {
        const updateData: Prisma.QuestNodeUpdateInput = {
          title: baseData.title,
          description: baseData.description,
          nodeType: baseData.nodeType,
          positionX: baseData.positionX,
          positionY: baseData.positionY,
          sortOrder: baseData.sortOrder,
          requirements: baseData.requirements,
          metadata: baseData.metadata
        };

        await tx.questNode.update({
          where: { id: node.id },
          data: updateData
        });
      } else {
        await tx.questNode.create({
          data: {
            id: node.id,
            blueprintId: options.blueprintId,
            ...baseData
          }
        });
        newNodeIds.push(node.id);
      }
    }

    await tx.questNodeLink.deleteMany({ where: { blueprintId: options.blueprintId } });
    if (options.links.length) {
      await tx.questNodeLink.createMany({
        data: options.links.map((link) => ({
          id: link.id || randomUUID(),
          blueprintId: options.blueprintId,
          parentNodeId: link.parentNodeId,
          childNodeId: link.childNodeId,
          conditions: sanitizeJsonInput(link.conditions)
        }))
      });
    }

    if (newNodeIds.length) {
      const assignmentIds = await tx.questAssignment.findMany({
        where: { blueprintId: options.blueprintId },
        select: { id: true }
      });

      if (assignmentIds.length) {
        const payload: Prisma.QuestNodeProgressCreateManyInput[] = [];
        for (const assignment of assignmentIds) {
          for (const nodeId of newNodeIds) {
            payload.push({
              id: randomUUID(),
              assignmentId: assignment.id,
              nodeId,
              targetCount: extractTargetCount(requirementSnapshot.get(nodeId) ?? {})
            });
          }
        }
        if (payload.length) {
          await tx.questNodeProgress.createMany({ data: payload });
        }
      }
    }

    await syncGroupProgressForBlueprint(options.blueprintId, tx);
  });

  await refreshSummariesForBlueprint(options.blueprintId);

  const editorName = await resolveUserDisplayName(options.actorUserId);
  await prisma.questBlueprint.update({
    where: { id: options.blueprintId },
    data: {
      lastEditedById: options.actorUserId,
      lastEditedByName: editorName
    }
  });
}

export async function startQuestAssignment(options: {
  guildId: string;
  blueprintId: string;
  userId: string;
  characterId: string;
}): Promise<QuestAssignmentWithProgress> {
  const blueprint = await prisma.questBlueprint.findUnique({
    where: { id: options.blueprintId },
    include: { nodes: true }
  });

  if (!blueprint || blueprint.guildId !== options.guildId) {
    throw new Error('Quest blueprint not found.');
  }
  if (blueprint.isArchived) {
    throw new Error('This quest blueprint is archived and cannot be started.');
  }

  const character = await prisma.character.findUnique({
    where: { id: options.characterId },
    select: {
      id: true,
      userId: true,
      guildId: true,
      class: true,
      name: true
    }
  });

  if (!character || character.userId !== options.userId) {
    throw new Error('Character not found.');
  }
  if (character.guildId !== options.guildId) {
    throw new Error('This character is not part of the selected guild.');
  }

  const existingAssignment = await prisma.questAssignment.findFirst({
    where: {
      blueprintId: options.blueprintId,
      userId: options.userId,
      characterId: character.id,
      status: { in: ACTIVE_ASSIGNMENT_STATUSES }
    }
  });

  if (existingAssignment) {
    throw new Error('You already have an active assignment for this quest.');
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.questAssignment.create({
      data: {
        blueprintId: options.blueprintId,
        guildId: options.guildId,
        userId: options.userId,
        status: QuestAssignmentStatus.ACTIVE,
        characterId: character.id
      }
    });

    if (blueprint.nodes.length) {
      const progressRows: Prisma.QuestNodeProgressCreateManyInput[] = blueprint.nodes.map((node) => ({
        id: randomUUID(),
        assignmentId: assignment.id,
        nodeId: node.id,
        targetCount: extractTargetCount(normalizeJsonRecord(node.requirements))
      }));
      await tx.questNodeProgress.createMany({ data: progressRows });
    }

    await syncGroupProgressForAssignment(assignment.id, options.blueprintId, tx);
    await refreshAssignmentSummary(assignment.id, options.blueprintId, tx);

    const hydrated = await tx.questAssignment.findUnique({
      where: { id: assignment.id },
      include: {
        progress: true,
        user: {
          select: QUEST_ASSIGNMENT_USER_SELECT
        },
        character: {
          select: CHARACTER_SUMMARY_FIELDS
        }
      }
    });

    if (!hydrated) {
      throw new Error('Quest assignment could not be loaded.');
    }

    return mapAssignment(hydrated);
  });
}

export async function updateAssignmentStatus(options: {
  guildId: string;
  assignmentId: string;
  actorUserId: string;
  nextStatus: QuestAssignmentStatus;
  allowManagerOverride: boolean;
}): Promise<QuestAssignmentWithProgress> {
  const assignment = await prisma.questAssignment.findUnique({
    where: { id: options.assignmentId },
    include: {
      progress: true,
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      },
      character: {
        select: CHARACTER_SUMMARY_FIELDS
      }
    }
  });

  if (!assignment || assignment.guildId !== options.guildId) {
    throw new Error('Quest assignment not found.');
  }

  const isOwner = assignment.userId === options.actorUserId;
  if (!isOwner && !options.allowManagerOverride) {
    throw new Error('You do not have permission to update this assignment.');
  }

  if (assignment.status === options.nextStatus) {
    return mapAssignment(assignment, { includeUser: true });
  }

  const now = new Date();
  const data: Prisma.QuestAssignmentUpdateInput = {
    status: options.nextStatus
  };

  if (options.nextStatus === QuestAssignmentStatus.COMPLETED) {
    data.completedAt = now;
    data.cancelledAt = null;
  } else if (options.nextStatus === QuestAssignmentStatus.CANCELLED) {
    data.cancelledAt = now;
    data.completedAt = null;
  } else {
    data.completedAt = null;
    data.cancelledAt = null;
  }

  const updated = await prisma.questAssignment.update({
    where: { id: assignment.id },
    data,
    include: {
      progress: true,
      user: {
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      },
      character: {
        select: CHARACTER_SUMMARY_FIELDS
      }
    }
  });

  return mapAssignment(updated, { includeUser: true });
}

export async function applyAssignmentProgressUpdates(options: {
  guildId: string;
  assignmentId: string;
  actorUserId: string;
  allowManagerOverride: boolean;
  updates: Array<{
    nodeId: string;
    status?: QuestNodeProgressStatus;
    progressCount?: number;
    notes?: string | null;
    isDisabled?: boolean;
  }>;
}): Promise<QuestAssignmentWithProgress> {
  if (!options.updates.length) {
    throw new Error('No quest progress updates supplied.');
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.questAssignment.findUnique({
      where: { id: options.assignmentId },
      include: {
        progress: true,
        user: {
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        },
        character: {
          select: CHARACTER_SUMMARY_FIELDS
        }
      }
    });

    if (!assignment || assignment.guildId !== options.guildId) {
      throw new Error('Quest assignment not found.');
    }

    const isOwner = assignment.userId === options.actorUserId;
    if (!isOwner && !options.allowManagerOverride) {
      throw new Error('You do not have permission to update this assignment.');
    }

    const progressMap = new Map(assignment.progress.map((record) => [record.nodeId, record]));
    const { nodeMeta, childMap, parentMap, nextStepParentMap, nextStepChildMap } = await loadBlueprintGraph(
      assignment.blueprintId,
      tx
    );
    const groupNodeIds = new Set<string>();
    const disabledNodeIds = new Set<string>(
      assignment.progress.filter((record) => record.isDisabled).map((record) => record.nodeId)
    );
    const finalNodeIds = new Set<string>();
    for (const [nodeId, meta] of nodeMeta.entries()) {
      if (meta.isGroup) {
        groupNodeIds.add(nodeId);
      }
      if (meta.isFinal) {
        finalNodeIds.add(nodeId);
      }
    }

    const descendantCache = new Map<string, string[]>();
    const downstreamCache = new Map<string, string[]>();
    const pendingStatusOverrides = new Map<string, { status: QuestNodeProgressStatus; allowGroup: boolean }>();

    const queueStatusOverride = (nodeId: string, status: QuestNodeProgressStatus, allowGroup = false) => {
      const meta = nodeMeta.get(nodeId);
      if (meta?.isOptional) {
        return;
      }
      pendingStatusOverrides.set(nodeId, { status, allowGroup });
    };

    const queueHierarchyUpdate = (groupId: string, status: QuestNodeProgressStatus) => {
      const nodes = [groupId, ...collectDescendantNodeIds(groupId, childMap, descendantCache)];
      for (const nodeId of nodes) {
        const currentProgress = progressMap.get(nodeId);
        if (currentProgress?.isDisabled) {
          continue;
        }
        queueStatusOverride(nodeId, status, groupNodeIds.has(nodeId));
      }
    };

    const resolveHierarchyStatus = (status?: QuestNodeProgressStatus | null) => {
      if (!status) {
        return null;
      }
      if (status === QuestNodeProgressStatus.COMPLETED || status === QuestNodeProgressStatus.IN_PROGRESS) {
        return QuestNodeProgressStatus.COMPLETED;
      }
      if (status === QuestNodeProgressStatus.NOT_STARTED || status === QuestNodeProgressStatus.BLOCKED) {
        return QuestNodeProgressStatus.NOT_STARTED;
      }
      return null;
    };

    const processUpdate = async (
      update: {
        nodeId: string;
        status?: QuestNodeProgressStatus;
        progressCount?: number;
        notes?: string | null;
        isDisabled?: boolean;
      },
      optionsInternal: { suppressHierarchyPropagation?: boolean; allowGroupStatus?: boolean } = {}
    ) => {
      const current = progressMap.get(update.nodeId);
      if (!current) {
        throw new Error('Quest progress update referenced an unknown node.');
      }
      const nodeMetaEntry = nodeMeta.get(update.nodeId);
      const nodeIsOptional = nodeMetaEntry?.isOptional ?? false;

      if ((groupNodeIds.has(update.nodeId) || disabledNodeIds.has(update.nodeId)) && !optionsInternal.allowGroupStatus) {
        if (typeof update.isDisabled !== 'boolean') {
          return;
        }
      }

      const previousStatus = current.status;
      const data: Prisma.QuestNodeProgressUpdateInput = {};

      if (update.status && update.status !== current.status) {
        data.status = update.status;
        if (update.status === QuestNodeProgressStatus.IN_PROGRESS && !current.startedAt) {
          data.startedAt = new Date();
        }
        if (update.status === QuestNodeProgressStatus.COMPLETED) {
          data.completedAt = new Date();
        } else if (current.completedAt) {
          data.completedAt = null;
        }
        current.status = update.status;
      }

      if (typeof update.progressCount === 'number') {
        data.progressCount = Math.max(0, Math.trunc(update.progressCount));
        current.progressCount = data.progressCount;
      }

      if (update.notes !== undefined) {
        const note = update.notes?.toString().slice(0, 500) ?? null;
        data.notes = note;
        current.notes = note;
      }

      if (typeof update.isDisabled === 'boolean') {
        data.isDisabled = update.isDisabled;
        current.isDisabled = update.isDisabled;
        if (update.isDisabled) {
          disabledNodeIds.add(update.nodeId);
        } else {
          disabledNodeIds.delete(update.nodeId);
        }
      }

      if (Object.keys(data).length === 0) {
        if (!optionsInternal.suppressHierarchyPropagation) {
          const hierarchyStatus = resolveHierarchyStatus(update.status);
          if (hierarchyStatus) {
            const parents = nextStepParentMap.get(update.nodeId) ?? [];
            parents.forEach((parentId) => queueHierarchyUpdate(parentId, hierarchyStatus));
          }
        }
        return;
      }

      await tx.questNodeProgress.update({
        where: {
          assignmentId_nodeId: {
            assignmentId: assignment.id,
            nodeId: update.nodeId
          }
        },
        data
      });

      if (!nodeIsOptional && !optionsInternal.suppressHierarchyPropagation) {
        const hierarchyStatus = resolveHierarchyStatus(update.status);
        // Only propagate COMPLETED status to parent group nodes, not NOT_STARTED
        if (hierarchyStatus === QuestNodeProgressStatus.COMPLETED) {
          const parents = nextStepParentMap.get(update.nodeId) ?? [];
          parents.forEach((parentId) => queueHierarchyUpdate(parentId, hierarchyStatus));
        }
      }

      const shouldResetDownstream =
        !nodeIsOptional &&
        previousStatus === QuestNodeProgressStatus.COMPLETED &&
        (update.status === QuestNodeProgressStatus.NOT_STARTED || update.status === QuestNodeProgressStatus.IN_PROGRESS);
      if (shouldResetDownstream) {
        const downstreamNodes = collectDownstreamNodeIds(
          update.nodeId,
          childMap,
          nextStepChildMap,
          downstreamCache
        );
        for (const nodeId of downstreamNodes) {
          const record = progressMap.get(nodeId);
          if (!record || record.isDisabled) {
            continue;
          }
          queueStatusOverride(nodeId, QuestNodeProgressStatus.NOT_STARTED, groupNodeIds.has(nodeId));
        }
      }

      const shouldCompleteUpstream =
        !nodeIsOptional &&
        update.status === QuestNodeProgressStatus.COMPLETED &&
        previousStatus !== QuestNodeProgressStatus.COMPLETED;

      if (shouldCompleteUpstream) {
        const parents = parentMap.get(update.nodeId) ?? [];
        for (const parentId of parents) {
          const record = progressMap.get(parentId);
          if (!record || record.isDisabled || record.status === QuestNodeProgressStatus.COMPLETED) {
            continue;
          }
          queueStatusOverride(parentId, QuestNodeProgressStatus.COMPLETED, groupNodeIds.has(parentId));
        }
      }
    };

    for (const update of options.updates) {
      await processUpdate(update);
    }

    for (const [nodeId, entry] of pendingStatusOverrides) {
      await processUpdate(
        { nodeId, status: entry.status },
        { suppressHierarchyPropagation: true, allowGroupStatus: entry.allowGroup }
      );
    }

    // Track group node statuses before sync
    const groupStatusBefore = new Map<string, QuestNodeProgressStatus>();
    for (const groupNodeId of groupNodeIds) {
      const record = progressMap.get(groupNodeId);
      if (record) {
        groupStatusBefore.set(groupNodeId, record.status);
      }
    }

    await syncGroupProgressForAssignment(assignment.id, assignment.blueprintId, tx);

    // After sync, check if any group nodes changed from COMPLETED to not COMPLETED
    // If so, reset their downstream nodes (excluding the group's own children)
    const updatedProgress = await tx.questNodeProgress.findMany({
      where: { assignmentId: assignment.id }
    });
    const updatedProgressMap = new Map(updatedProgress.map((record) => [record.nodeId, record]));

    for (const groupNodeId of groupNodeIds) {
      const beforeRecord = progressMap.get(groupNodeId);
      const afterRecord = updatedProgressMap.get(groupNodeId);

      // Only reset downstream if the group actually went from COMPLETED to not COMPLETED
      if (beforeRecord &&
        beforeRecord.status === QuestNodeProgressStatus.COMPLETED &&
        afterRecord &&
        afterRecord.status !== QuestNodeProgressStatus.COMPLETED) {

        // Get all downstream nodes
        const downstreamNodes = collectDownstreamNodeIds(
          groupNodeId,
          childMap,
          nextStepChildMap,
          downstreamCache
        );

        // Get children of this group (nodes within the group, not after it)
        const childrenOfGroup = collectDescendantNodeIds(groupNodeId, childMap, descendantCache);

        // Only reset nodes that are truly downstream (after the group), not children within the group
        const trulyDownstream = downstreamNodes.filter(nodeId => !childrenOfGroup.includes(nodeId));

        for (const nodeId of trulyDownstream) {
          const record = updatedProgressMap.get(nodeId);
          if (!record || record.isDisabled) {
            continue;
          }
          await tx.questNodeProgress.update({
            where: {
              assignmentId_nodeId: {
                assignmentId: assignment.id,
                nodeId
              }
            },
            data: {
              status: QuestNodeProgressStatus.NOT_STARTED,
              completedAt: null
            }
          });
        }
      }
    }

    await refreshAssignmentSummary(assignment.id, assignment.blueprintId, tx);

    if (finalNodeIds.size) {
      const finalProgress = await tx.questNodeProgress.findMany({
        where: {
          assignmentId: assignment.id,
          nodeId: { in: Array.from(finalNodeIds) }
        },
        select: { nodeId: true, status: true }
      });
      const shouldComplete = finalProgress.some(
        (record) => record.status === QuestNodeProgressStatus.COMPLETED
      );
      if (shouldComplete) {
        if (
          assignment.status !== QuestAssignmentStatus.COMPLETED &&
          assignment.status !== QuestAssignmentStatus.CANCELLED
        ) {
          await tx.questAssignment.update({
            where: { id: assignment.id },
            data: {
              status: QuestAssignmentStatus.COMPLETED,
              completedAt: new Date(),
              cancelledAt: null
            }
          });
        }
      } else if (assignment.status === QuestAssignmentStatus.COMPLETED) {
        await tx.questAssignment.update({
          where: { id: assignment.id },
          data: {
            status: QuestAssignmentStatus.ACTIVE,
            completedAt: null
          }
        });
      }
    }

    const refreshed = await tx.questAssignment.findUnique({
      where: { id: assignment.id },
      include: {
        progress: true,
        user: {
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        },
        character: {
          select: CHARACTER_SUMMARY_FIELDS
        }
      }
    });

    if (!refreshed) {
      throw new Error('Quest assignment could not be refreshed.');
    }

    return mapAssignment(refreshed, { includeUser: true });
  });
}

function computeShortestPathMap(
  blueprintIds: string[],
  nodes: Array<{ blueprintId: string; id: string; metadata: Prisma.JsonValue | null }>,
  _links: Array<{ blueprintId: string; parentNodeId: string; childNodeId: string }>
) {
  const result = new Map<string, number>();
  for (const blueprintId of blueprintIds) {
    result.set(blueprintId, 0);
  }
  for (const node of nodes) {
    const metadata = normalizeJsonRecord(node.metadata);
    if (metadata.isOptional) {
      continue;
    }
    const current = result.get(node.blueprintId) ?? 0;
    result.set(node.blueprintId, current + 1);
  }
  return result;
}

export function canManageQuestBlueprints(role: GuildRole | null | undefined): boolean {
  return role === GuildRole.LEADER || role === GuildRole.OFFICER;
}

export function canEditQuestBlueprint(
  role: GuildRole | null | undefined,
  actorUserId: string | null | undefined,
  blueprintOwnerId: string | null | undefined
): boolean {
  if (canManageQuestBlueprints(role)) {
    return true;
  }
  return Boolean(actorUserId && blueprintOwnerId && actorUserId === blueprintOwnerId);
}

export function canViewGuildQuestBoard(role: GuildRole | null | undefined): boolean {
  return Boolean(role);
}
