import { randomUUID } from 'node:crypto';
import { GuildRole, QuestAssignmentStatus, QuestNodeProgressStatus } from '@prisma/client';
import { withPreferredDisplayName } from '../utils/displayName.js';
import { prisma } from '../utils/prisma.js';
const ACTIVE_ASSIGNMENT_STATUSES = [
    QuestAssignmentStatus.ACTIVE,
    QuestAssignmentStatus.PAUSED
];
const QUEST_ASSIGNMENT_USER_SELECT = {
    id: true,
    displayName: true,
    nickname: true
};
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
            select: { parentNodeId: true, childNodeId: true }
        })
    ]);
    const nodeMap = new Map(nodes.map((node) => [node.id, Boolean(normalizeJsonRecord(node.metadata).isGroup)]));
    const childMap = new Map();
    for (const link of links) {
        const list = childMap.get(link.parentNodeId) ?? [];
        list.push(link.childNodeId);
        childMap.set(link.parentNodeId, list);
    }
    return { nodeMap, childMap };
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
    const { nodeMap, childMap } = await loadBlueprintGraph(blueprintId, tx);
    const groupNodeEntries = [...nodeMap.entries()].filter(([, isGroup]) => isGroup);
    if (!groupNodeEntries.length) {
        return;
    }
    const progressRecords = await tx.questNodeProgress.findMany({
        where: { assignmentId }
    });
    const progressMap = new Map(progressRecords.map((record) => [record.nodeId, record]));
    for (const [groupNodeId] of groupNodeEntries) {
        const childIds = childMap.get(groupNodeId) ?? [];
        const childStatuses = childIds.map((childId) => progressMap.get(childId)?.status ?? QuestNodeProgressStatus.NOT_STARTED);
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
                targetCount: childIds.length,
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
    const summary = {
        totalNodes: records.length,
        completed: 0,
        inProgress: 0,
        blocked: 0,
        notStarted: 0,
        percentComplete: 0
    };
    for (const record of records) {
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
        user: options?.includeUser !== false && assignment.user
            ? withPreferredDisplayName(assignment.user)
            : undefined,
        progress: assignment.progress.map((record) => ({
            nodeId: record.nodeId,
            status: record.status,
            progressCount: record.progressCount,
            targetCount: record.targetCount,
            notes: record.notes ?? null
        }))
    };
}
function mapBlueprintSummary(blueprint, nodeCount, assignmentCounts, viewerAssignment) {
    return {
        id: blueprint.id,
        title: blueprint.title,
        summary: blueprint.summary ?? null,
        visibility: blueprint.visibility,
        isArchived: blueprint.isArchived,
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
        select: { status: true }
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
        orderBy: [
            { isArchived: 'asc' },
            { title: 'asc' }
        ]
    });
    if (blueprints.length === 0) {
        return { blueprints: [] };
    }
    const blueprintIds = blueprints.map((bp) => bp.id);
    const [nodeGroups, assignmentGroups, viewerAssignments] = await Promise.all([
        prisma.questNode.groupBy({
            by: ['blueprintId'],
            where: { blueprintId: { in: blueprintIds } },
            _count: { _all: true }
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
                }
            }
        })
    ]);
    const nodeCountMap = new Map();
    for (const group of nodeGroups) {
        nodeCountMap.set(group.blueprintId, group._count._all ?? 0);
    }
    const assignmentCountMap = new Map();
    for (const group of assignmentGroups) {
        const entry = assignmentCountMap.get(group.blueprintId) ?? getDefaultAssignmentCounts();
        entry[group.status] = group._count._all ?? 0;
        assignmentCountMap.set(group.blueprintId, entry);
    }
    const viewerAssignmentMap = new Map();
    for (const assignment of viewerAssignments) {
        viewerAssignmentMap.set(assignment.blueprintId, mapAssignment(assignment));
    }
    const summaries = blueprints.map((blueprint) => {
        const nodeCount = nodeCountMap.get(blueprint.id) ?? 0;
        const assignmentCounts = assignmentCountMap.get(blueprint.id) ?? getDefaultAssignmentCounts();
        const viewerAssignment = viewerAssignmentMap.get(blueprint.id) ?? null;
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
        data: updatePayload
    });
    const nodeCount = await prisma.questNode.count({ where: { blueprintId: updated.id } });
    const assignmentCounts = getDefaultAssignmentCounts();
    const latestCounts = await prisma.questAssignment.groupBy({
        by: ['status'],
        where: { blueprintId: updated.id },
        _count: { _all: true }
    });
    for (const entry of latestCounts) {
        assignmentCounts[entry.status] = entry._count._all ?? 0;
    }
    return mapBlueprintSummary(updated, nodeCount, assignmentCounts, null);
}
export async function getQuestBlueprintDetail(options) {
    const blueprint = await prisma.questBlueprint.findUnique({
        where: { id: options.blueprintId },
        include: {
            nodes: true,
            links: true
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
                    progress: true
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
            isGroup: Boolean(normalizedMetadata.isGroup)
        };
    })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const links = blueprint.links.map((link) => ({
        id: link.id,
        parentNodeId: link.parentNodeId,
        childNodeId: link.childNodeId,
        conditions: normalizeJsonRecord(link.conditions)
    }));
    const viewerAssignmentPayload = viewerAssignment ? mapAssignment(viewerAssignment) : null;
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
        if (nodeGroupMap.get(link.parentNodeId) && nodeGroupMap.get(link.childNodeId)) {
            throw new Error('Group nodes cannot have group node children.');
        }
    }
    await prisma.$transaction(async (tx) => {
        const blueprint = await tx.questBlueprint.findUnique({
            where: { id: options.blueprintId },
            select: { id: true, guildId: true }
        });
        if (!blueprint || blueprint.guildId !== options.guildId) {
            throw new Error('Quest blueprint not found.');
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
    const existingAssignment = await prisma.questAssignment.findFirst({
        where: {
            blueprintId: options.blueprintId,
            userId: options.userId,
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
                status: QuestAssignmentStatus.ACTIVE
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
        const groupNodeIds = new Set((await tx.questNode.findMany({
            where: { blueprintId: assignment.blueprintId },
            select: { id: true, metadata: true }
        }))
            .filter((node) => Boolean(normalizeJsonRecord(node.metadata).isGroup))
            .map((node) => node.id));
        for (const update of options.updates) {
            if (groupNodeIds.has(update.nodeId)) {
                continue;
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
                }
            }
        });
        if (!refreshed) {
            throw new Error('Quest assignment could not be refreshed.');
        }
        return mapAssignment(refreshed, { includeUser: true });
    });
}
export function canManageQuestBlueprints(role) {
    return role === GuildRole.LEADER || role === GuildRole.OFFICER;
}
export function canViewGuildQuestBoard(role) {
    return canManageQuestBlueprints(role);
}
