import { randomUUID } from 'node:crypto';
import { GuildRole, QuestAssignmentStatus, QuestNodeProgressStatus } from '@prisma/client';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
const ACTIVE_ASSIGNMENT_STATUSES = [
    QuestAssignmentStatus.ACTIVE,
    QuestAssignmentStatus.PAUSED
];
const USER_NAME_FIELDS = {
    displayName: true,
    nickname: true
};
const CHARACTER_SUMMARY_FIELDS = {
    id: true,
    name: true,
    class: true
};
export const QUEST_BLUEPRINT_PERMISSION_ERROR = 'QUEST_BLUEPRINT_PERMISSION_DENIED';
const QUEST_ASSIGNMENT_USER_SELECT = {
    id: true,
    displayName: true,
    nickname: true
};
const NEXT_STEP_CONDITION_KEY = '__isNextStep';
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
async function resolveUserDisplayName(userId, tx = prisma) {
    const user = await tx.user.findUnique({
        where: { id: userId },
        select: { displayName: true, nickname: true }
    });
    if (!user) {
        return null;
    }
    return withPreferredDisplayName(user).displayName;
}
async function loadBlueprintGraph(blueprintId, tx = prisma) {
    const [nodes, links] = await Promise.all([
        tx.questNode.findMany({
            where: { blueprintId },
            select: { id: true, metadata: true }
        }),
        tx.questNodeLink.findMany({
            where: { blueprintId },
            select: { parentNodeId: true, childNodeId: true, conditions: true }
        })
    ]);
    const nodeMeta = new Map(nodes.map((node) => {
        const normalized = normalizeJsonRecord(node.metadata);
        return [
            node.id,
            {
                isGroup: Boolean(normalized.isGroup),
                isFinal: Boolean(normalized.isFinal)
            }
        ];
    }));
    const childMap = new Map();
    for (const link of links) {
        const conditions = normalizeJsonRecord(link.conditions);
        if (conditions[NEXT_STEP_CONDITION_KEY] === true) {
            continue;
        }
        const list = childMap.get(link.parentNodeId) ?? [];
        list.push(link.childNodeId);
        childMap.set(link.parentNodeId, list);
    }
    return { nodeMeta, childMap };
}
function collectDescendantNodeIds(nodeId, childMap, cache) {
    if (cache.has(nodeId)) {
        return cache.get(nodeId);
    }
    const visited = new Set();
    const queue = [...(childMap.get(nodeId) ?? [])];
    while (queue.length) {
        const current = queue.shift();
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
function deriveGroupNodeStatus(children) {
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
    if (children.some((status) => status === QuestNodeProgressStatus.IN_PROGRESS || status === QuestNodeProgressStatus.COMPLETED)) {
        return { status: QuestNodeProgressStatus.IN_PROGRESS, completed };
    }
    return { status: QuestNodeProgressStatus.NOT_STARTED, completed };
}
async function syncGroupProgressForAssignment(assignmentId, blueprintId, tx = prisma) {
    const { nodeMeta, childMap } = await loadBlueprintGraph(blueprintId, tx);
    const groupNodeEntries = [...nodeMeta.entries()].filter(([, meta]) => meta.isGroup);
    if (!groupNodeEntries.length) {
        return;
    }
    const progressRecords = await tx.questNodeProgress.findMany({
        where: { assignmentId }
    });
    const progressMap = new Map(progressRecords.map((record) => [record.nodeId, record]));
    const descendantCache = new Map();
    for (const [groupNodeId] of groupNodeEntries) {
        const groupRecord = progressMap.get(groupNodeId);
        if (groupRecord?.isDisabled) {
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
        const targetIds = descendantIds.filter((childId) => !(progressMap.get(childId)?.isDisabled));
        const childStatuses = targetIds.map((childId) => progressMap.get(childId)?.status ?? QuestNodeProgressStatus.NOT_STARTED);
        const { status, completed } = deriveGroupNodeStatus(childStatuses);
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
                targetCount: targetIds.length,
                completedAt: status === QuestNodeProgressStatus.COMPLETED ? new Date() : null
            }
        });
    }
}
async function syncGroupProgressForBlueprint(blueprintId, tx = prisma) {
    const assignments = await tx.questAssignment.findMany({
        where: { blueprintId },
        select: { id: true }
    });
    for (const assignment of assignments) {
        await syncGroupProgressForAssignment(assignment.id, blueprintId, tx);
    }
}
function normalizeJsonRecord(value) {
    if (!isRecord(value)) {
        return {};
    }
    return value;
}
function coerceQuestProgressSummary(value) {
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
function buildProgressSummary(records) {
    const filtered = records.filter((record) => !record.isDisabled);
    const summary = {
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
function mapAssignment(assignment, options) {
    return {
        id: assignment.id,
        status: assignment.status,
        startedAt: assignment.startedAt,
        completedAt: assignment.completedAt,
        cancelledAt: assignment.cancelledAt,
        lastProgressAt: assignment.lastProgressAt,
        progressSummary: coerceQuestProgressSummary(assignment.progressSummary),
        totalViewerSteps: options?.totalViewerSteps,
        user: options?.includeUser !== false && assignment.user
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
function mapBlueprintSummary(blueprint, nodeCount, assignmentCounts, viewerAssignment) {
    const creatorName = blueprint.createdBy
        ? withPreferredDisplayName(blueprint.createdBy).displayName
        : null;
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
        nodeCount,
        assignmentCounts,
        viewerAssignment
    };
}
function getDefaultAssignmentCounts() {
    return {
        [QuestAssignmentStatus.ACTIVE]: 0,
        [QuestAssignmentStatus.PAUSED]: 0,
        [QuestAssignmentStatus.COMPLETED]: 0,
        [QuestAssignmentStatus.CANCELLED]: 0
    };
}
async function refreshAssignmentSummary(assignmentId, tx = prisma) {
    const progressRecords = await tx.questNodeProgress.findMany({
        where: { assignmentId },
        select: { status: true, isDisabled: true }
    });
    const summary = buildProgressSummary(progressRecords);
    await tx.questAssignment.update({
        where: { id: assignmentId },
        data: {
            progressSummary: summary,
            lastProgressAt: new Date()
        }
    });
}
async function refreshSummariesForBlueprint(blueprintId, tx = prisma) {
    const assignments = await tx.questAssignment.findMany({
        where: { blueprintId },
        select: { id: true }
    });
    for (const assignment of assignments) {
        await refreshAssignmentSummary(assignment.id, tx);
    }
}
function sanitizeNumeric(value, min, max) {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}
function sanitizeJsonInput(value) {
    if (!value) {
        return {};
    }
    const result = {};
    for (const [key, entryValue] of Object.entries(value)) {
        if (entryValue === undefined) {
            continue;
        }
        result[key] = entryValue;
    }
    return result;
}
function extractTargetCount(requirements) {
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
export async function listGuildQuestTrackerSummary(options) {
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
        return { blueprints: [] };
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
                status: { in: [
                        QuestAssignmentStatus.ACTIVE,
                        QuestAssignmentStatus.PAUSED,
                        QuestAssignmentStatus.COMPLETED
                    ] }
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
    const assignmentCountMap = new Map();
    for (const group of assignmentGroups) {
        const entry = assignmentCountMap.get(group.blueprintId) ?? getDefaultAssignmentCounts();
        entry[group.status] = group._count._all ?? 0;
        assignmentCountMap.set(group.blueprintId, entry);
    }
    const viewerAssignmentMap = new Map();
    for (const assignment of viewerAssignments) {
        viewerAssignmentMap.set(assignment.blueprintId, assignment);
    }
    const summaries = blueprints.map((blueprint) => {
        const nodeCount = stepCountMap.get(blueprint.id) ?? 0;
        const assignmentCounts = assignmentCountMap.get(blueprint.id) ?? getDefaultAssignmentCounts();
        const viewerAssignmentRaw = viewerAssignmentMap.get(blueprint.id);
        const viewerAssignment = viewerAssignmentRaw
            ? mapAssignment(viewerAssignmentRaw, {
                totalViewerSteps: nodeCount,
                includeUser: true
            })
            : null;
        return mapBlueprintSummary(blueprint, nodeCount, assignmentCounts, viewerAssignment);
    });
    return { blueprints: summaries };
}
export async function createQuestBlueprint(options) {
    const creatorName = await resolveUserDisplayName(options.creatorUserId);
    const blueprint = await prisma.questBlueprint.create({
        data: {
            guildId: options.guildId,
            createdById: options.creatorUserId,
            title: options.title,
            summary: options.summary ?? null,
            visibility: options.visibility ?? 'GUILD',
            lastEditedById: options.creatorUserId,
            lastEditedByName: creatorName
        },
        include: {
            createdBy: {
                select: USER_NAME_FIELDS
            }
        }
    });
    return mapBlueprintSummary(blueprint, 0, getDefaultAssignmentCounts(), null);
}
export async function updateQuestBlueprintMetadata(options) {
    const existing = await prisma.questBlueprint.findUnique({
        where: { id: options.blueprintId }
    });
    if (!existing || existing.guildId !== options.guildId) {
        throw new Error('Quest blueprint not found.');
    }
    if (!canEditQuestBlueprint(options.actorRole, options.actorUserId, existing.createdById)) {
        throw new Error(QUEST_BLUEPRINT_PERMISSION_ERROR);
    }
    const updatePayload = {};
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
    return mapBlueprintSummary(updated, nodeCount, assignmentCounts, null);
}
export async function getQuestBlueprintDetail(options) {
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
    const [assignmentGroups, viewerAssignment, guildAssignments] = await Promise.all([
        prisma.questAssignment.groupBy({
            by: ['status'],
            where: { blueprintId: options.blueprintId },
            _count: { _all: true }
        }),
        prisma.questAssignment.findFirst({
            where: {
                blueprintId: options.blueprintId,
                userId: options.viewerUserId,
                status: { in: [
                        QuestAssignmentStatus.ACTIVE,
                        QuestAssignmentStatus.PAUSED,
                        QuestAssignmentStatus.COMPLETED
                    ] }
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
        .map((node) => {
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
            isFinal: Boolean(normalizedMetadata.isFinal)
        };
    })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const links = blueprint.links.map((link) => ({
        id: link.id,
        parentNodeId: link.parentNodeId,
        childNodeId: link.childNodeId,
        conditions: normalizeJsonRecord(link.conditions)
    }));
    const totalViewerSteps = computeShortestPathMap([blueprint.id], blueprint.nodes.map((node) => ({
        id: node.id,
        blueprintId: node.blueprintId,
        metadata: node.metadata
    })), blueprint.links.map((link) => ({
        blueprintId: link.blueprintId,
        parentNodeId: link.parentNodeId,
        childNodeId: link.childNodeId
    }))).get(blueprint.id) ?? blueprint.nodes.length;
    const viewerAssignmentPayload = viewerAssignment
        ? mapAssignment(viewerAssignment, { totalViewerSteps })
        : null;
    const guildAssignmentPayloads = options.includeGuildAssignments
        ? guildAssignments.map((assignment) => mapAssignment(assignment, { includeUser: true }))
        : [];
    const blueprintSummary = mapBlueprintSummary(blueprint, nodes.length, assignmentCounts, viewerAssignmentPayload);
    return {
        blueprint: blueprintSummary,
        nodes,
        links,
        assignmentStats: assignmentCounts,
        viewerAssignment: viewerAssignmentPayload,
        guildAssignments: options.includeGuildAssignments ? guildAssignmentPayloads : undefined
    };
}
export async function upsertQuestBlueprintGraph(options) {
    const nodeIds = new Set();
    for (const node of options.nodes) {
        if (nodeIds.has(node.id)) {
            throw new Error(`Duplicate quest node identifier detected (${node.id}).`);
        }
        nodeIds.add(node.id);
    }
    const linkPairs = new Set();
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
    const requirementSnapshot = new Map();
    const nodeGroupMap = new Map();
    for (const node of options.nodes) {
        requirementSnapshot.set(node.id, node.requirements ?? {});
        nodeGroupMap.set(node.id, Boolean(node.isGroup));
    }
    for (const link of options.links) {
        const isNextStepLink = Boolean(link.conditions?.[NEXT_STEP_CONDITION_KEY]);
        if (!isNextStepLink && nodeGroupMap.get(link.parentNodeId) && nodeGroupMap.get(link.childNodeId)) {
            throw new Error('Group nodes cannot have group node children.');
        }
    }
    await prisma.$transaction(async (tx) => {
        const blueprint = await tx.questBlueprint.findUnique({
            where: { id: options.blueprintId },
            select: { id: true, guildId: true, createdById: true }
        });
        if (!blueprint || blueprint.guildId !== options.guildId) {
            throw new Error('Quest blueprint not found.');
        }
        if (!canEditQuestBlueprint(options.actorRole, options.actorUserId, blueprint.createdById)) {
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
        }
        const newNodeIds = [];
        for (const node of options.nodes) {
            const metadataInput = sanitizeJsonInput(node.metadata);
            if (node.isGroup) {
                metadataInput.isGroup = true;
            }
            else if (metadataInput.isGroup) {
                delete metadataInput.isGroup;
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
            };
            if (existingIds.has(node.id)) {
                const updateData = {
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
            }
            else {
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
                const payload = [];
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
        await refreshSummariesForBlueprint(options.blueprintId, tx);
        const editorName = await resolveUserDisplayName(options.actorUserId, tx);
        await tx.questBlueprint.update({
            where: { id: options.blueprintId },
            data: {
                lastEditedById: options.actorUserId,
                lastEditedByName: editorName
            }
        });
    });
}
export async function startQuestAssignment(options) {
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
            const progressRows = blueprint.nodes.map((node) => ({
                id: randomUUID(),
                assignmentId: assignment.id,
                nodeId: node.id,
                targetCount: extractTargetCount(normalizeJsonRecord(node.requirements))
            }));
            await tx.questNodeProgress.createMany({ data: progressRows });
        }
        await syncGroupProgressForAssignment(assignment.id, options.blueprintId, tx);
        await refreshAssignmentSummary(assignment.id, tx);
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
export async function updateAssignmentStatus(options) {
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
    const data = {
        status: options.nextStatus
    };
    if (options.nextStatus === QuestAssignmentStatus.COMPLETED) {
        data.completedAt = now;
        data.cancelledAt = null;
    }
    else if (options.nextStatus === QuestAssignmentStatus.CANCELLED) {
        data.cancelledAt = now;
        data.completedAt = null;
    }
    else {
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
export async function applyAssignmentProgressUpdates(options) {
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
        const { nodeMeta } = await loadBlueprintGraph(assignment.blueprintId, tx);
        const groupNodeIds = new Set();
        const disabledNodeIds = new Set(assignment.progress.filter((record) => record.isDisabled).map((record) => record.nodeId));
        const finalNodeIds = new Set();
        for (const [nodeId, meta] of nodeMeta.entries()) {
            if (meta.isGroup) {
                groupNodeIds.add(nodeId);
            }
            if (meta.isFinal) {
                finalNodeIds.add(nodeId);
            }
        }
        for (const update of options.updates) {
            if (groupNodeIds.has(update.nodeId) || disabledNodeIds.has(update.nodeId)) {
                if (typeof update.isDisabled !== 'boolean') {
                    continue;
                }
            }
            const current = progressMap.get(update.nodeId);
            if (!current) {
                throw new Error('Quest progress update referenced an unknown node.');
            }
            const data = {};
            if (update.status && update.status !== current.status) {
                data.status = update.status;
                if (update.status === QuestNodeProgressStatus.IN_PROGRESS && !current.startedAt) {
                    data.startedAt = new Date();
                }
                if (update.status === QuestNodeProgressStatus.COMPLETED) {
                    data.completedAt = new Date();
                }
                else if (current.completedAt) {
                    data.completedAt = null;
                }
            }
            if (typeof update.progressCount === 'number') {
                data.progressCount = Math.max(0, Math.trunc(update.progressCount));
            }
            if (update.notes !== undefined) {
                const note = update.notes?.toString().slice(0, 500) ?? null;
                data.notes = note;
            }
            if (typeof update.isDisabled === 'boolean') {
                data.isDisabled = update.isDisabled;
                if (update.isDisabled) {
                    disabledNodeIds.add(update.nodeId);
                }
                else {
                    disabledNodeIds.delete(update.nodeId);
                }
            }
            if (Object.keys(data).length === 0) {
                continue;
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
        }
        await syncGroupProgressForAssignment(assignment.id, assignment.blueprintId, tx);
        await refreshAssignmentSummary(assignment.id, tx);
        if (finalNodeIds.size) {
            const finalProgress = await tx.questNodeProgress.findMany({
                where: {
                    assignmentId: assignment.id,
                    nodeId: { in: Array.from(finalNodeIds) }
                },
                select: { nodeId: true, status: true }
            });
            const shouldComplete = finalProgress.some((record) => record.status === QuestNodeProgressStatus.COMPLETED);
            if (shouldComplete &&
                assignment.status !== QuestAssignmentStatus.COMPLETED &&
                assignment.status !== QuestAssignmentStatus.CANCELLED) {
                await tx.questAssignment.update({
                    where: { id: assignment.id },
                    data: {
                        status: QuestAssignmentStatus.COMPLETED,
                        completedAt: new Date(),
                        cancelledAt: null
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
function computeShortestPathMap(blueprintIds, nodes, links) {
    const nodesByBlueprint = new Map();
    for (const blueprintId of blueprintIds) {
        nodesByBlueprint.set(blueprintId, []);
    }
    for (const node of nodes) {
        const metadata = normalizeJsonRecord(node.metadata);
        const bucket = nodesByBlueprint.get(node.blueprintId);
        if (!bucket) {
            continue;
        }
        bucket.push({ id: node.id, isFinal: Boolean(metadata.isFinal) });
    }
    const childMap = new Map();
    const parentCounts = new Map();
    for (const link of links) {
        const adjacency = childMap.get(link.blueprintId) ?? new Map();
        const children = adjacency.get(link.parentNodeId) ?? [];
        children.push(link.childNodeId);
        adjacency.set(link.parentNodeId, children);
        childMap.set(link.blueprintId, adjacency);
        const parentMap = parentCounts.get(link.blueprintId) ?? new Map();
        parentMap.set(link.childNodeId, (parentMap.get(link.childNodeId) ?? 0) + 1);
        parentCounts.set(link.blueprintId, parentMap);
    }
    const result = new Map();
    for (const blueprintId of blueprintIds) {
        const blueprintNodes = nodesByBlueprint.get(blueprintId) ?? [];
        if (!blueprintNodes.length) {
            result.set(blueprintId, 0);
            continue;
        }
        const finals = new Set(blueprintNodes.filter((node) => node.isFinal).map((node) => node.id));
        if (!finals.size) {
            result.set(blueprintId, blueprintNodes.length);
            continue;
        }
        const adjacency = childMap.get(blueprintId) ?? new Map();
        const parentMap = parentCounts.get(blueprintId) ?? new Map();
        const roots = blueprintNodes
            .map((node) => node.id)
            .filter((nodeId) => !parentMap.has(nodeId));
        const queue = [];
        const visited = new Set();
        const enqueue = (nodeId, depth) => {
            if (visited.has(nodeId)) {
                return;
            }
            visited.add(nodeId);
            queue.push({ nodeId, depth });
        };
        if (roots.length) {
            roots.forEach((rootId) => enqueue(rootId, 1));
        }
        else {
            blueprintNodes.forEach((node) => enqueue(node.id, 1));
        }
        let shortest = blueprintNodes.length;
        while (queue.length) {
            const { nodeId, depth } = queue.shift();
            if (finals.has(nodeId)) {
                shortest = depth;
                break;
            }
            const children = adjacency.get(nodeId) ?? [];
            for (const childId of children) {
                enqueue(childId, depth + 1);
            }
        }
        result.set(blueprintId, shortest);
    }
    return result;
}
export function canManageQuestBlueprints(role) {
    return role === GuildRole.LEADER || role === GuildRole.OFFICER;
}
export function canEditQuestBlueprint(role, actorUserId, blueprintOwnerId) {
    if (canManageQuestBlueprints(role)) {
        return true;
    }
    return Boolean(actorUserId && blueprintOwnerId && actorUserId === blueprintOwnerId);
}
export function canViewGuildQuestBoard(role) {
    return canManageQuestBlueprints(role);
}
