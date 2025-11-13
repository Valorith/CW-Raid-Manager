<template>
  <section class="quest-tracker" v-if="!loadingSummary">
    <aside class="quest-tracker__sidebar">
      <header class="quest-tracker__header">
        <div>
          <p class="muted small">Guild</p>
          <h1>{{ guildNameDisplay }}</h1>
        </div>
        <button
          v-if="permissions?.canManageBlueprints"
          class="btn btn--small"
          type="button"
          @click="openCreateModal"
        >
          New Blueprint
        </button>
      </header>
      <div class="quest-tracker__search">
        <input
          v-model="sidebarSearch"
          type="search"
          class="input input--search"
          placeholder="Search blueprints"
        />
      </div>
      <ul class="quest-blueprint-list">
        <li
          v-for="blueprint in filteredBlueprints"
          :key="blueprint.id"
          :class="['quest-blueprint-list__item', { 'quest-blueprint-list__item--active': blueprint.id === selectedBlueprintId }]"
        >
          <button type="button" @click="selectBlueprint(blueprint.id)">
            <div>
              <strong>{{ blueprint.title }}</strong>
              <span v-if="blueprint.isArchived" class="badge badge--archived">Archived</span>
            </div>
            <p class="muted small quest-blueprint-list__summary">
              {{ blueprint.nodeCount }} steps · {{ blueprint.assignmentCounts.ACTIVE }} active
            </p>
            <div class="quest-blueprint-list__progress" v-if="blueprint.viewerAssignment">
              <span class="muted x-small">My progress</span>
              <div class="quest-progress-bar">
                <div
                  class="quest-progress-bar__value"
                  :style="{ width: formatPercent(blueprint.viewerAssignment.progressSummary.percentComplete) }"
                ></div>
              </div>
            </div>
          </button>
        </li>
      </ul>
    </aside>

    <main class="quest-tracker__main">
      <div v-if="selectedDetail" class="quest-detail">
        <header class="quest-detail__header">
          <div>
            <p class="muted small">Quest Blueprint</p>
            <h2>{{ selectedDetail.blueprint.title }}</h2>
            <p v-if="selectedDetail.blueprint.summary" class="muted">{{ selectedDetail.blueprint.summary }}</p>
          </div>
          <div class="quest-detail__actions">
            <button
              v-if="permissions?.canManageBlueprints"
              class="btn btn--secondary btn--small"
              type="button"
              @click="toggleEditorTab"
            >
              {{ activeTab === 'editor' ? 'View Quest' : 'Edit Blueprint' }}
            </button>
            <button
              v-if="permissions?.canViewGuildBoard"
              class="btn btn--secondary btn--small"
              type="button"
              @click="setTab('guild')"
            >
              Guild Board
            </button>
            <button
              v-if="viewerAssignment && viewerAssignment.status !== 'COMPLETED'"
              class="btn btn--outline btn--small"
              type="button"
              :disabled="assignmentUpdating"
              @click="completeAssignment"
            >
              {{ assignmentUpdating ? 'Saving…' : 'Mark Complete' }}
            </button>
            <button
              v-if="viewerAssignment && viewerAssignment.status !== 'CANCELLED'"
              class="btn btn--danger btn--small"
              type="button"
              :disabled="assignmentUpdating"
              @click="cancelAssignment"
            >
              {{ assignmentUpdating ? 'Updating…' : 'Abandon Quest' }}
            </button>
            <button
              v-if="!viewerAssignment"
              class="btn btn--primary btn--small"
              type="button"
              :disabled="assignmentUpdating"
              @click="startAssignment"
            >
              {{ assignmentUpdating ? 'Starting…' : 'Start Quest' }}
            </button>
          </div>
        </header>

        <div class="quest-stat-row">
          <div class="quest-stat-chip">
            <span class="label">Steps</span>
            <strong>{{ selectedDetail.blueprint.nodeCount }}</strong>
          </div>
          <div class="quest-stat-chip">
            <span class="label">Active Players</span>
            <strong>{{ selectedDetail.blueprint.assignmentCounts.ACTIVE }}</strong>
          </div>
          <div class="quest-stat-chip">
            <span class="label">My Completion</span>
            <strong>{{ formatPercent(viewerAssignment?.progressSummary.percentComplete ?? 0) }}</strong>
          </div>
          <div class="quest-stat-chip">
            <span class="label">Updated</span>
            <strong>{{ formatDate(selectedDetail.blueprint.updatedAt) }}</strong>
          </div>
        </div>

        <div class="quest-tabs">
          <button
            v-for="tab in availableTabs"
            :key="tab.key"
            :class="['quest-tabs__button', { 'quest-tabs__button--active': activeTab === tab.key, 'quest-tabs__button--disabled': tab.disabled }]"
            type="button"
            :disabled="tab.disabled"
            @click="setTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <section v-if="activeTab === 'overview'" class="quest-panel quest-panel--canvas">
          <div
            :class="['quest-canvas', { 'quest-canvas--panning': isOverviewPanning }]"
            ref="overviewCanvasRef"
            :style="overviewCanvasStyle"
            @contextmenu.prevent="openCanvasMenu($event)"
            @pointerdown.capture="handleOverviewPointerDown"
            @wheel.prevent="handleOverviewWheel"
          >
            <div class="quest-canvas__stage" :style="overviewStageStyle">
              <svg class="quest-canvas__links" aria-hidden="true" :style="linkSvgStyle">
                <path
                  v-for="link in renderedLinks"
                  :key="link.id"
                  :d="link.path"
                  pointer-events="none"
                />
                <path
                  v-for="link in renderedLinks"
                  :key="`hit-overview-${link.id}`"
                  class="quest-link-hit"
                  :d="link.path"
                  @pointerenter="handleLinkHover(link.id)"
                  @pointerleave="handleLinkHover(null)"
                />
              </svg>
              <svg class="quest-canvas__links quest-canvas__links--animated" aria-hidden="true" :style="linkSvgStyle">
                <path
                  v-for="link in renderedLinks"
                  :key="`animated-overview-${link.id}`"
                  class="quest-link-animated"
                  :d="link.path"
                  :stroke="link.branchColor"
                  :style="linkAnimationStyle(link)"
                />
              </svg>
              <div
                v-for="node in renderedNodes"
                :key="node.id"
                class="quest-node"
                :style="nodeStyle(node, false)"
                @contextmenu.prevent="openNodeMenu(node, $event)"
                :data-node-id="node.id"
              >
                <header class="quest-node__header">
                  <span class="quest-node__type" :style="typeAccent(node.nodeType, node.isGroup)">
                    {{ displayNodeType(node.nodeType, node.isGroup) }}
                  </span>
                  <span class="quest-node__status" :class="statusClass(viewerNodeStatus(node.id))">
                    {{ viewerNodeStatus(node.id) ?? 'NOT_STARTED' }}
                  </span>
                </header>
                <h3>{{ node.title }}</h3>
                <p v-if="node.requirements?.targetName" class="quest-node__target">
                  Target / Item: {{ node.requirements.targetName }}
                </p>
                <p v-if="node.description" class="quest-node__zone">Zone: {{ node.description }}</p>
                <div v-if="node.isGroup" class="quest-node__group-indicator">
                  Group node · {{ formatGroupProgress(node.id, viewerAssignment?.progress, 'viewer') }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="viewerAssignment" class="quest-my-progress">
            <h3>My Steps</h3>
            <ul>
              <li v-for="node in selectedDetail.nodes" :key="node.id">
                <div class="quest-my-progress__row">
                  <div>
                    <strong>{{ node.title }}</strong>
                    <span class="muted small">{{ displayNodeType(node.nodeType, node.isGroup) }}</span>
                    <p v-if="node.requirements?.targetName" class="quest-node__target quest-node__target--inline">
                      Target / Item: {{ node.requirements.targetName }}
                    </p>
                    <p v-if="node.description" class="quest-node__zone quest-node__zone--inline">
                      Zone: {{ node.description }}
                    </p>
                    <div v-if="node.isGroup" class="quest-node__group-indicator">
                      Group node · {{ formatGroupProgress(node.id, viewerAssignment?.progress, 'viewer') }}
                    </div>
                  </div>
                  <div class="quest-my-progress__actions">
                    <button
                      v-for="status in nodeStatuses"
                      :key="status"
                      :class="['btn btn--pill', { 'btn--primary': viewerNodeStatus(node.id) === status }]"
                      type="button"
                      :disabled="progressUpdating"
                      @click="updateNodeStatus(node.id, status)"
                    >
                      {{ status }}
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section v-if="activeTab === 'editor'" class="quest-panel quest-panel--editor">
          <div class="quest-editor__status">
            <div class="quest-editor__status-meta">
              <span class="quest-editor__status-text">
                Last saved {{ lastSavedAt ? formatDateTime(lastSavedAt) : '—' }} by {{ lastSavedBy }}
              </span>
              <button class="btn btn--save" type="button" :disabled="!dirtyGraph || savingGraph" @click="saveGraph">
                {{ savingGraph ? 'Saving…' : 'Save' }}
              </button>
            </div>
            <span class="quest-editor__status-note">{{ dirtyGraph ? 'Unsaved changes' : 'Ctrl+S to quick-save' }}</span>
          </div>
          <div class="quest-editor">
            <div
              class="quest-editor__canvas"
              :class="{ 'quest-editor__canvas--panning': isPanning }"
              @wheel.prevent="handleCanvasWheel"
              @pointerdown="handleCanvasPointerDown"
              @contextmenu.prevent="openCanvasMenu($event)"
              ref="editorCanvasRef"
            >
              <div class="quest-editor__canvas-inner" :style="canvasTransformStyle">
                <svg class="quest-canvas__links" aria-hidden="true" :style="linkSvgStyle">
                  <path
                    v-for="link in renderedLinks"
                    :key="link.id"
                    :d="link.path"
                    pointer-events="none"
                  />
                  <path
                    v-for="link in renderedLinks"
                    :key="`hit-${link.id}`"
                    class="quest-link-hit"
                    :d="link.path"
                    @pointerenter="handleLinkHover(link.id)"
                    @pointerleave="handleLinkHover(null)"
                  />
                </svg>
                <svg class="quest-canvas__links quest-canvas__links--animated" aria-hidden="true" :style="linkSvgStyle">
                  <path
                    v-for="link in renderedLinks"
                    :key="`animated-${link.id}`"
                    class="quest-link-animated"
                    :d="link.path"
                    :stroke="link.branchColor"
                    :style="linkAnimationStyle(link)"
                  />
                </svg>
                <svg v-if="linkDrag.active" class="quest-link-preview" aria-hidden="true" :style="linkSvgStyle">
                  <path v-if="linkPreviewPath" :d="linkPreviewPath" />
                </svg>
                <div
                  v-if="marqueeVisible"
                  class="quest-selection-box"
                  :style="marqueeStyle"
                ></div>
                <template v-if="activeTab === 'editor'">
                  <button
                    v-for="link in renderedLinks"
                    :key="`remove-${link.id}`"
                    :class="['quest-link-remove', { 'quest-link-remove--visible': hoveredLinkId === link.id }]"
                    type="button"
                    :style="linkRemoveStyle(link)"
                    @pointerenter="handleLinkHover(link.id)"
                    @pointerleave="handleLinkHover(null)"
                    @click.stop="removeLink(link.id)"
                    aria-label="Remove connection"
                  >
                    ×
                  </button>
                </template>
                <div
                  v-for="node in editableNodes"
                  :key="node.id"
                  :class="[
                    'quest-node',
                    {
                      'quest-node--selected': isNodeSelected(node.id)
                    }
                  ]"
                  :style="nodeStyle(node, true)"
                  @pointerdown.stop="handleNodePointerDown(node, $event)"
                  @click.stop="handleNodeClick(node, $event)"
                  @dblclick.stop="handleNodeDoubleClick(node.id)"
                  @contextmenu.prevent.stop="openNodeMenu(node, $event)"
                  :data-node-id="node.id"
                >
                  <header class="quest-node__header">
                    <span class="quest-node__type" :style="typeAccent(node.nodeType, node.isGroup)">
                      {{ displayNodeType(node.nodeType, node.isGroup) }}
                    </span>
                    <span class="quest-node__handle" title="Drag to move">⇲</span>
                  </header>
                  <h3>{{ node.title }}</h3>
                <p v-if="node.requirements?.targetName" class="quest-node__target">
                  Target / Item: {{ node.requirements.targetName }}
                </p>
                <p v-if="node.description" class="quest-node__zone">Zone: {{ node.description }}</p>
                <div v-if="node.isGroup" class="quest-node__group-indicator">
                  Group node · {{ formatGroupProgress(node.id, undefined, 'editor') }}
                </div>
                <div v-if="activeTab === 'editor'" class="quest-node__handles">
                  <button
                    v-for="face in NODE_FACES"
                    :key="`handle-${node.id}-${face}`"
                    class="quest-node__handle-dot"
                    :class="[`quest-node__handle-dot--${face}`]"
                    type="button"
                    @pointerdown.stop="beginLinkDrag(node, face, $event)"
                    @pointerenter="handleHandleEnter(node.id, face)"
                    @pointerleave="handleHandleLeave"
                  ></button>
                </div>
              </div>
              </div>
            </div>
            <div class="quest-editor__panel" v-if="showStepSettings && selectedNode">
              <div class="quest-step-header">
                <h3>Step Settings</h3>
                <button class="btn btn--ghost btn--tiny" type="button" @click="showStepSettings = false">Collapse</button>
              </div>
              <label class="form-label">Title</label>
              <input
                v-model="selectedNode.title"
                type="text"
                class="input"
                @input="markDirty()"
              />
              <label class="form-label">Zone</label>
              <input
                v-model="selectedNode.description"
                type="text"
                class="input"
                @input="markDirty()"
              />
              <label class="switch switch--inline">
                <input
                  type="checkbox"
                  v-model="selectedNode.isGroup"
                  :disabled="nodeHasGroupParent(selectedNode.id)"
                  @change="markDirty()"
                />
                <span>
                  Group node (auto completes when child steps finish)
                  <template v-if="nodeHasGroupParent(selectedNode.id)">
                    — cannot enable while parent is a group
                  </template>
                </span>
              </label>
              <label class="form-label">Type</label>
              <template v-if="selectedNode.isGroup">
                <div class="quest-node__group-type">Group</div>
              </template>
              <template v-else>
                <select v-model="selectedNode.nodeType" @change="markDirty()">
                  <option v-for="(label, value) in questNodeTypeLabels" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </template>
              <label class="form-label">Target / Item</label>
              <input
                v-model="selectedNode.requirements.targetName"
                type="text"
                class="input"
                @input="markDirty()"
              />
              <label class="form-label">Target Count</label>
              <input
                v-model.number="selectedNode.requirements.count"
                type="number"
                min="0"
                class="input"
                @input="markDirty()"
              />
              <label class="form-label">Accent Color</label>
              <input
                :value="selectedNode.metadata.accentColor || DEFAULT_ACCENT_COLOR"
                type="color"
                class="input"
                @input="updateAccentColor"
              />
              <label class="form-label">Notes</label>
              <textarea
                v-model="selectedNode.requirements.details"
                class="input"
                rows="3"
                @input="markDirty()"
              ></textarea>
              <div class="quest-editor__links" v-if="nodeLinks(selectedNode.id).length">
                <p class="muted small">Child Links</p>
                <ul>
                  <li v-for="link in nodeLinks(selectedNode.id)" :key="link.id">
                    <span>{{ targetNodeTitle(link.childNodeId) }}</span>
                    <button type="button" class="btn btn--small btn--danger" @click="removeLink(link.id)">Remove</button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'guild'" class="quest-panel">
          <h3>Active Players</h3>
          <p v-if="!selectedDetail.guildAssignments?.length" class="muted">No active assignments for this blueprint.</p>
          <ul v-else class="quest-guild-list">
            <li v-for="assignment in selectedDetail.guildAssignments" :key="assignment.id" class="quest-guild-list__item">
              <div>
                <strong>{{ assignment.user?.displayName ?? 'Member' }}</strong>
                <span class="muted small">{{ questAssignmentStatusLabels[assignment.status] }}</span>
              </div>
              <div class="quest-progress-bar quest-progress-bar--compact">
                <div
                  class="quest-progress-bar__value"
                  :style="{ width: formatPercent(assignment.progressSummary.percentComplete) }"
                ></div>
              </div>
              <div class="quest-guild-list__nodes">
                <span
                  v-for="node in selectedDetail.nodes"
                  :key="`${assignment.id}-${node.id}`"
                  :class="['quest-guild-list__node', assignmentNodeClass(assignmentNodeStatus(assignment, node.id))]"
                  :title="`${node.title}: ${assignmentNodeStatus(assignment, node.id)}`"
                ></span>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div v-else class="quest-empty">
        <p>Select a quest blueprint to begin or create a new one.</p>
      </div>
    </main>
  </section>

  <div v-else class="quest-loading">
    <span>Loading quest tracker…</span>
  </div>

  <div v-if="showCreateModal" class="quest-modal">
    <div class="quest-modal__content">
      <header>
        <h3>New Quest Blueprint</h3>
        <button class="btn btn--icon" type="button" @click="closeCreateModal">×</button>
      </header>
      <label class="form-label">Title</label>
      <input v-model="newBlueprintForm.title" type="text" class="input" />
      <label class="form-label">Summary</label>
      <textarea v-model="newBlueprintForm.summary" class="input" rows="3"></textarea>
      <div class="quest-modal__actions">
        <button class="btn btn--secondary" type="button" @click="closeCreateModal">Cancel</button>
        <button class="btn btn--primary" type="button" :disabled="creatingBlueprint" @click="createBlueprint">
          {{ creatingBlueprint ? 'Creating…' : 'Create Blueprint' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="showBlueprintSettings" class="quest-modal">
    <div class="quest-modal__content">
      <header>
        <h3>Blueprint Settings</h3>
        <button class="btn btn--icon" type="button" @click="showBlueprintSettings = false">×</button>
      </header>
      <label class="form-label">Title or NPC Name</label>
      <input v-model="blueprintMetaForm.title" type="text" class="input" />
      <label class="form-label">Summary</label>
      <textarea v-model="blueprintMetaForm.summary" class="input" rows="2"></textarea>
      <label class="switch">
        <input v-model="blueprintMetaForm.isArchived" type="checkbox" />
        <span>Mark as archived</span>
      </label>
      <div class="quest-modal__actions">
        <button class="btn btn--secondary" type="button" @click="showBlueprintSettings = false">Cancel</button>
        <button class="btn btn--primary" type="button" :disabled="metadataSaving" @click="saveBlueprintSettings">{{ metadataSaving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
  </div>

  <div v-if="saveErrorModal.open" class="quest-modal quest-modal--error">
    <div class="quest-modal__content">
      <header>
        <h3>Save Failed</h3>
        <button class="btn btn--icon" type="button" @click="closeSaveError">×</button>
      </header>
      <p class="muted small">Copy the error below and share it with the team if you need help.</p>
      <pre class="quest-error-message">{{ saveErrorModal.message }}</pre>
      <div class="quest-modal__actions">
        <button class="btn btn--secondary" type="button" @click="copySaveError">Copy error</button>
        <button class="btn btn--primary" type="button" @click="closeSaveError">Close</button>
      </div>
    </div>
  </div>

  <div v-if="saveToast.visible" class="quest-toast">{{ saveToast.message }}</div>

  <ul
    v-if="contextMenu.visible"
    class="quest-context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <template v-if="contextMenu.type === 'canvas'">
      <li @click="handleCanvasAddNode">Add step</li>
      <li @click="handleOpenBlueprintSettings">Blueprint settings…</li>
      <li @click="handleResetViewFromMenu">Reset view</li>
    </template>
    <template v-else>
      <template v-if="hasMultiSelection">
        <li class="danger" @click="handleDeleteNodeFromMenu">
          Delete {{ selectedNodeCount }} selected {{ selectedNodeCount === 1 ? 'step' : 'steps' }}
        </li>
      </template>
      <template v-else>
        <li @click="handleAddChildFromMenu">Add child step</li>
        <li @click="handleEditNodeFromMenu">Edit step settings</li>
        <li class="danger" @click="handleDeleteNodeFromMenu">Delete step</li>
      </template>
    </template>
  </ul>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import {
  api,
  type QuestAssignment,
  type QuestBlueprintDetailPayload,
  type QuestBlueprintSummaryLite,
  type QuestLinkInputPayload,
  type QuestNodeInputPayload,
  type QuestNodeViewModel,
  type QuestNodeProgress,
  type QuestTrackerSummary
} from '../services/api';
import {
  QuestAssignmentStatus,
  QuestNodeProgressStatus,
  QuestNodeType,
  questAssignmentStatusLabels,
  questNodeTypeColors,
  questNodeTypeLabels
} from '../services/types';
import { extractErrorMessage } from '../utils/errors';

const route = useRoute();
const guildId = route.params.guildId as string;

type EditableNode = QuestNodeViewModel & {
  requirements: Record<string, any>;
  metadata: Record<string, any>;
};

const summary = ref<QuestTrackerSummary | null>(null);
const detail = ref<QuestBlueprintDetailPayload | null>(null);
const loadingSummary = ref(true);
const loadingDetail = ref(false);
const savingGraph = ref(false);
const creatingBlueprint = ref(false);
const assignmentUpdating = ref(false);
const progressUpdating = ref(false);
const sidebarSearch = ref('');
const selectedBlueprintId = ref<string | null>(null);
const activeTab = ref<'overview' | 'editor' | 'guild'>('overview');
const showCreateModal = ref(false);
const metadataSaving = ref(false);
const lastSavedAt = ref<string | null>(null);
const lastSavedBy = ref<string>('Unknown member');
const saveToast = reactive({ visible: false, message: '' });
const saveErrorModal = reactive({ open: false, message: '' });
const showStepSettings = ref(false);
const showBlueprintSettings = ref(false);

const editableNodes = ref<EditableNode[]>([]);
const editableLinks = ref<QuestBlueprintDetailPayload['links']>([]);
const dirtyGraph = ref(false);
const selectedNodeId = ref<string | null>(null);
const selectedNodeIds = ref<Set<string>>(new Set());
const editorScale = ref(1);
const editorOffset = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0, originX: 0, originY: 0 });
const DEFAULT_ACCENT_COLOR = '#8b5cf6';
const editorCanvasRef = ref<HTMLElement | null>(null);
const overviewCanvasRef = ref<HTMLElement | null>(null);
const overviewTransform = reactive({ scale: 1, offsetX: 0, offsetY: 0 });
const isOverviewPanning = ref(false);
const overviewPanStart = reactive({ x: 0, y: 0, originX: 0, originY: 0, moved: false });
type NodeFace = 'top' | 'right' | 'bottom' | 'left';
type Point = { x: number; y: number };
type SelectionBounds = { left: number; right: number; top: number; bottom: number };
type RenderedLink = {
  id: string;
  parentNodeId: string;
  childNodeId: string;
  path: string;
  start: Point;
  end: Point;
  midPoint: Point;
  branchColor: string;
  animationDelay: number;
  pathLength: number;
};
const NODE_FACES: NodeFace[] = ['top', 'right', 'bottom', 'left'];
const FACE_NORMALS: Record<NodeFace, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

function extractFace(value: unknown): NodeFace | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return NODE_FACES.includes(value as NodeFace) ? (value as NodeFace) : undefined;
}

function readFaceCondition(
  conditions: Record<string, unknown> | undefined,
  key: '__parentFace' | '__childFace'
): NodeFace | undefined {
  if (!conditions) {
    return undefined;
  }
  return extractFace(conditions[key]);
}
const nodeDimensions = ref<Record<string, { width: number; height: number }>>({});
const linkDrag = reactive({
  active: false,
  startNodeId: null as string | null,
  startPoint: { x: 0, y: 0 },
  currentPoint: { x: 0, y: 0 },
  startFace: null as NodeFace | null
});
const hoveredHandle = ref<{ nodeId: string; face: NodeFace } | null>(null);
const hoveredLinkId = ref<string | null>(null);
let linkDragMoveListener: ((event: PointerEvent) => void) | null = null;
let toastTimer: number | null = null;
const marqueeSelection = reactive({
  active: false,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 }
});
const isSpacePanning = ref(false);
const panState = reactive({ button: null as number | null, moved: false });
const suppressCanvasContextMenu = ref(false);
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: 'canvas' as 'canvas' | 'node',
  nodeId: null as string | null
});

const newBlueprintForm = reactive({
  title: '',
  summary: ''
});

const blueprintMetaForm = reactive({
  title: '',
  summary: '',
  isArchived: false
});

const permissions = computed(() => detail.value?.permissions ?? summary.value?.permissions ?? null);
const canManageBlueprint = computed(() => permissions.value?.canManageBlueprints ?? false);
const guildNameDisplay = computed(() =>
  typeof route.query.guildName === 'string' ? route.query.guildName : 'Quest Tracker'
);

const filteredBlueprints = computed(() => {
  const list = summary.value?.blueprints ?? [];
  const query = sidebarSearch.value.trim().toLowerCase();
  const sorted = [...list].sort((a, b) => {
    if (a.isArchived !== b.isArchived) {
      return a.isArchived ? 1 : -1;
    }
    return a.title.localeCompare(b.title);
  });
  if (!query) {
    return sorted;
  }
  return sorted.filter((blueprint) => blueprint.title.toLowerCase().includes(query));
});

const selectedDetail = computed(() => detail.value);
const viewerAssignment = computed(() => detail.value?.viewerAssignment ?? null);
const viewerAssignmentId = computed(() => viewerAssignment.value?.id ?? null);
const nodeStatuses: QuestNodeProgressStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
const selectedNodeCount = computed(() => selectedNodeIds.value.size);
const hasMultiSelection = computed(() => selectedNodeCount.value > 1);
function setSelectedNodes(nodeIds: string[]) {
  selectedNodeIds.value = new Set(nodeIds);
  selectedNodeId.value = nodeIds[0] ?? null;
}

function clearSelectedNodes() {
  setSelectedNodes([]);
}

function isNodeSelected(nodeId: string) {
  return selectedNodeIds.value.has(nodeId);
}

function getSelectedNodeIds() {
  return Array.from(selectedNodeIds.value);
}

function ensureAccentColor(value?: string | null): string {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }
  return DEFAULT_ACCENT_COLOR;
}

const renderedNodes = computed(() =>
  activeTab.value === 'editor' ? editableNodes.value : detail.value?.nodes ?? []
);

const activeLinks = computed(() =>
  activeTab.value === 'editor' ? editableLinks.value : detail.value?.links ?? []
);

const selectedNode = computed<EditableNode | null>(() =>
  editableNodes.value.find((node) => node.id === selectedNodeId.value) ?? null
);

const nodePositionMap = computed(() => {
  const map = new Map<string, { x: number; y: number }>();
  for (const node of renderedNodes.value) {
    map.set(node.id, { ...node.position });
  }
  return map;
});

const canvasTransformStyle = computed(() => ({
  transform: `translate(${editorOffset.x}px, ${editorOffset.y}px) scale(${editorScale.value.toFixed(2)})`
}));

const overviewCanvasStyle = computed(() => ({
  minHeight: '420px',
  height: '100%'
}));

const overviewStageStyle = computed(() => ({
  transform: `translate(${overviewTransform.offsetX}px, ${overviewTransform.offsetY}px) scale(${overviewTransform.scale.toFixed(3)})`,
  transformOrigin: '0 0'
}));

type ContentBounds = { minX: number; minY: number; width: number; height: number };

function getNodesBounds(nodes: QuestNodeViewModel[]): ContentBounds {
  if (!nodes.length) {
    return { minX: 0, minY: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const bounds = getNodeBounds(node);
    minX = Math.min(minX, bounds.left);
    minY = Math.min(minY, bounds.top);
    maxX = Math.max(maxX, bounds.right);
    maxY = Math.max(maxY, bounds.bottom);
  }
  return {
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    width: Math.max(1, Number.isFinite(maxX - minX) ? maxX - minX : NODE_WIDTH),
    height: Math.max(1, Number.isFinite(maxY - minY) ? maxY - minY : NODE_HEIGHT)
  };
}

type FitOptions = {
  padding?: number;
  minScale?: number;
  maxScale?: number;
};

function calculateFitTransform(
  bounds: ContentBounds,
  containerWidth: number,
  containerHeight: number,
  options: FitOptions = {}
) {
  const padding = options.padding ?? 160;
  const minScale = options.minScale ?? 0.25;
  const maxScale = options.maxScale ?? 1.25;
  if (!containerWidth || !containerHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const paddedWidth = bounds.width + padding * 2;
  const paddedHeight = bounds.height + padding * 2;
  const rawScale = Math.min(containerWidth / paddedWidth, containerHeight / paddedHeight);
  const scale = Math.min(maxScale, Math.max(minScale, Number.isFinite(rawScale) ? rawScale : 1));
  const viewportWidth = paddedWidth * scale;
  const viewportHeight = paddedHeight * scale;
  const offsetX = (containerWidth - viewportWidth) / 2 - (bounds.minX - padding) * scale;
  const offsetY = (containerHeight - viewportHeight) / 2 - (bounds.minY - padding) * scale;
  return {
    scale,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0
  };
}

let overviewFitPending = true;
let editorFitPending = true;
let overviewResizeObserver: ResizeObserver | null = null;

const linkCanvasBounds = computed(() => {
  const nodes = renderedNodes.value;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const extend = (point: Point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  if (nodes.length) {
    for (const node of nodes) {
      const bounds = getNodeBounds(node);
      extend({ x: bounds.left, y: bounds.top });
      extend({ x: bounds.right, y: bounds.bottom });
    }
  }
  if (linkDrag.active) {
    extend(linkDrag.startPoint);
    extend(linkDrag.currentPoint);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    minX = -LINK_CANVAS_PADDING;
    minY = -LINK_CANVAS_PADDING;
    maxX = LINK_CANVAS_PADDING;
    maxY = LINK_CANVAS_PADDING;
  }
  minX -= LINK_CANVAS_PADDING;
  minY -= LINK_CANVAS_PADDING;
  maxX += LINK_CANVAS_PADDING;
  maxY += LINK_CANVAS_PADDING;
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
});

const linkSvgStyle = computed(() => {
  const bounds = linkCanvasBounds.value;
  return {
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    transform: `translate(${bounds.minX}px, ${bounds.minY}px)`
  };
});

function applyOverviewFit() {
  const canvas = overviewCanvasRef.value;
  if (!canvas) {
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }
  const bounds = getNodesBounds(detail.value?.nodes ?? []);
  const { scale, offsetX, offsetY } = calculateFitTransform(bounds, rect.width, rect.height, {
    padding: OVERVIEW_CANVAS_PADDING,
    minScale: 0.3,
    maxScale: 1
  });
  overviewTransform.scale = scale;
  overviewTransform.offsetX = offsetX;
  overviewTransform.offsetY = offsetY;
  return true;
}

function scheduleOverviewFit(force = false) {
  if (!force && activeTab.value !== 'overview') {
    return;
  }
  nextTick(() => {
    requestAnimationFrame(() => {
      if (activeTab.value !== 'overview') {
        return;
      }
      const applied = applyOverviewFit();
      if (!applied) {
        overviewFitPending = true;
      } else {
        overviewFitPending = false;
      }
    });
  });
}

function requestOverviewFit() {
  overviewFitPending = true;
  if (activeTab.value === 'overview') {
    scheduleOverviewFit(true);
  }
}

function handleOverviewPointerDown(event: PointerEvent) {
  if (activeTab.value !== 'overview' || event.button !== 0) {
    return;
  }
  beginOverviewPan(event);
}

function beginOverviewPan(event: PointerEvent) {
  const canvas = overviewCanvasRef.value;
  if (!canvas) {
    return;
  }
  event.preventDefault();
  isOverviewPanning.value = true;
  overviewPanStart.x = event.clientX;
  overviewPanStart.y = event.clientY;
  overviewPanStart.originX = overviewTransform.offsetX;
  overviewPanStart.originY = overviewTransform.offsetY;
  overviewPanStart.moved = false;

  const moveHandler = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - overviewPanStart.x;
    const dy = moveEvent.clientY - overviewPanStart.y;
    if (
      !overviewPanStart.moved &&
      (Math.abs(dx) > PAN_SUPPRESS_THRESHOLD || Math.abs(dy) > PAN_SUPPRESS_THRESHOLD)
    ) {
      overviewPanStart.moved = true;
    }
    overviewTransform.offsetX = overviewPanStart.originX + dx;
    overviewTransform.offsetY = overviewPanStart.originY + dy;
  };

  const upHandler = () => {
    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    isOverviewPanning.value = false;
  };

  document.addEventListener('pointermove', moveHandler);
  document.addEventListener('pointerup', upHandler);
}

function handleOverviewWheel(event: WheelEvent) {
  if (activeTab.value !== 'overview') {
    return;
  }
  const canvas = overviewCanvasRef.value;
  if (!canvas) {
    return;
  }
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const worldX = (pointerX - overviewTransform.offsetX) / overviewTransform.scale;
  const worldY = (pointerY - overviewTransform.offsetY) / overviewTransform.scale;
  const zoomFactor = Math.exp(-event.deltaY * 0.0015);
  const nextScale = clamp(overviewTransform.scale * zoomFactor, 0.25, 2);
  overviewTransform.scale = Number(nextScale.toFixed(3));
  overviewTransform.offsetX = pointerX - worldX * overviewTransform.scale;
  overviewTransform.offsetY = pointerY - worldY * overviewTransform.scale;
}

function applyEditorFit() {
  const canvas = editorCanvasRef.value;
  if (!canvas) {
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }
  const bounds = getNodesBounds(editableNodes.value);
  const { scale, offsetX, offsetY } = calculateFitTransform(bounds, rect.width, rect.height, {
    padding: LINK_CANVAS_PADDING,
    minScale: 0.35,
    maxScale: 1.5
  });
  editorScale.value = scale;
  editorOffset.x = offsetX;
  editorOffset.y = offsetY;
  return true;
}

function scheduleEditorFit(force = false) {
  if (!force && !editorFitPending) {
    return;
  }
  if (activeTab.value !== 'editor' && !force) {
    return;
  }
  nextTick(() => {
    requestAnimationFrame(() => {
      if (activeTab.value !== 'editor') {
        return;
      }
      const applied = applyEditorFit();
      if (applied) {
        editorFitPending = false;
      }
    });
  });
}

function requestEditorFit() {
  editorFitPending = true;
  if (activeTab.value === 'editor') {
    scheduleEditorFit(true);
  }
}

const marqueeVisible = computed(() => {
  if (!marqueeSelection.active) {
    return false;
  }
  const width = Math.abs(marqueeSelection.end.x - marqueeSelection.start.x);
  const height = Math.abs(marqueeSelection.end.y - marqueeSelection.start.y);
  return width > 2 || height > 2;
});

const marqueeStyle = computed(() => {
  if (!marqueeSelection.active) {
    return {};
  }
  const left = Math.min(marqueeSelection.start.x, marqueeSelection.end.x);
  const top = Math.min(marqueeSelection.start.y, marqueeSelection.end.y);
  const width = Math.abs(marqueeSelection.end.x - marqueeSelection.start.x);
  const height = Math.abs(marqueeSelection.end.y - marqueeSelection.start.y);
  return {
    transform: `translate(${left}px, ${top}px)`,
    width: `${width}px`,
    height: `${height}px`
  };
});

const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;
const DEFAULT_NODE_SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT };
const PAN_SUPPRESS_THRESHOLD = 3;
const LINK_CANVAS_PADDING = 120;
const OVERVIEW_CANVAS_PADDING = 48;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
const BRANCH_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#34d399', '#a78bfa', '#f97316', '#a3e635'];
const BRANCH_ANIMATION_STAGGER = 0.25;
const DEFAULT_BRANCH_COLOR = '#38bdf8';

const childNodeMap = computed(() => {
  const map = new Map<string, string[]>();
  for (const link of activeLinks.value) {
    const list = map.get(link.parentNodeId) ?? [];
    list.push(link.childNodeId);
    map.set(link.parentNodeId, list);
  }
  return map;
});

const groupDescendantsMap = computed(() => {
  const cache = new Map<string, Set<string>>();
  const children = childNodeMap.value;
  const allNodeIds = new Set(renderedNodes.value.map((node) => node.id));

  function visit(nodeId: string, path: Set<string>): Set<string> {
    if (cache.has(nodeId)) {
      return cache.get(nodeId)!;
    }
    if (path.has(nodeId)) {
      cache.set(nodeId, new Set());
      return cache.get(nodeId)!;
    }
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const collected = new Set<string>();
    const directChildren = children.get(nodeId) ?? [];
    for (const childId of directChildren) {
      collected.add(childId);
      const descendants = visit(childId, nextPath);
      descendants.forEach((descendantId) => collected.add(descendantId));
    }
    cache.set(nodeId, collected);
    return collected;
  }

  const map = new Map<string, string[]>();
  for (const nodeId of allNodeIds) {
    const descendants = visit(nodeId, new Set());
    map.set(nodeId, Array.from(descendants));
  }
  return map;
});

const nodeBranchAssignments = computed(() => {
  const assignments = new Map<string, { branchIndex: number; depth: number }>();
  const children = childNodeMap.value;
  const parents = parentNodeMap.value;
  const roots = renderedNodes.value
    .filter((node) => !(parents.get(node.id)?.length))
    .map((node) => node.id);
  const queue: Array<{ nodeId: string; branchIndex: number; depth: number }> = [];
  let branchCounter = 0;
  const enqueue = (nodeId: string, branchIndex: number, depth: number) => {
    queue.push({ nodeId, branchIndex, depth });
  };
  if (!roots.length) {
    for (const node of renderedNodes.value) {
      const branchIndex = branchCounter % BRANCH_COLORS.length;
      branchCounter += 1;
      enqueue(node.id, branchIndex, 0);
    }
  } else {
    roots.forEach((rootId) => {
      const branchIndex = branchCounter % BRANCH_COLORS.length;
      branchCounter += 1;
      enqueue(rootId, branchIndex, 0);
    });
  }
  while (queue.length) {
    const { nodeId, branchIndex, depth } = queue.shift()!;
    const existing = assignments.get(nodeId);
    if (existing && existing.depth <= depth) {
      continue;
    }
    assignments.set(nodeId, { branchIndex, depth });
    const childIds = children.get(nodeId) ?? [];
    if (!childIds.length) {
      continue;
    }
    if (childIds.length === 1) {
      enqueue(childIds[0], branchIndex, depth + 1);
    } else {
      childIds.forEach((childId) => {
        const nextBranch = branchCounter % BRANCH_COLORS.length;
        branchCounter += 1;
        enqueue(childId, nextBranch, depth + 1);
      });
    }
  }
  return assignments;
});

function nodeBranchColor(nodeId: string) {
  const branchInfo = nodeBranchAssignments.value.get(nodeId);
  const branchIndex = branchInfo?.branchIndex ?? 0;
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length] ?? DEFAULT_BRANCH_COLOR;
}

const contextMenuStyle = computed(() => ({
  top: `${contextMenu.y}px`,
  left: `${contextMenu.x}px`
}));

const parentNodeMap = computed(() => {
  const map = new Map<string, string[]>();
  for (const link of activeLinks.value) {
    const list = map.get(link.childNodeId) ?? [];
    list.push(link.parentNodeId);
    map.set(link.childNodeId, list);
  }
  return map;
});

function getGroupDescendants(nodeId: string) {
  return groupDescendantsMap.value.get(nodeId) ?? [];
}

function getGroupProgress(nodeId: string, progress: QuestNodeProgress[] | undefined, mode: 'editor' | 'viewer' = 'viewer') {
  const childIds = getGroupDescendants(nodeId);
  if (!childIds.length) {
    return { completed: 0, total: 0 };
  }
  if (mode === 'editor') {
    return { completed: childIds.length, total: childIds.length };
  }
  const progressMap = new Map(progress?.map((record) => [record.nodeId, record.status]));
  const completed = childIds.filter((childId) => progressMap.get(childId) === 'COMPLETED').length;
  return { completed, total: childIds.length };
}

function formatGroupProgress(nodeId: string, progress: QuestNodeProgress[] | undefined, mode: 'editor' | 'viewer' = 'viewer') {
  const { completed, total } = getGroupProgress(nodeId, progress, mode);
  if (!total) {
    return '0/0';
  }
  return `${completed}/${total}`;
}

function nodeHasGroupParent(nodeId: string): boolean {
  const parents = parentNodeMap.value.get(nodeId) ?? [];
  return parents.some((parentId) => {
    const parent = editableNodes.value.find((node) => node.id === parentId);
    return parent?.isGroup ?? false;
  });
}

function getNodeSize(nodeId?: string) {
  if (nodeId && nodeDimensions.value[nodeId]) {
    return nodeDimensions.value[nodeId];
  }
  return DEFAULT_NODE_SIZE;
}

function getNodeBounds(node: { position: { x: number; y: number }; id?: string }): SelectionBounds {
  const { width, height } = getNodeSize(node.id);
  const left = node.position.x;
  const top = node.position.y;
  return { left, right: left + width, top, bottom: top + height };
}

function nodeWithinBounds(node: EditableNode, bounds: SelectionBounds) {
  const box = getNodeBounds(node);
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
}

function nodeCenter(position: { x: number; y: number }, nodeId?: string) {
  const { width, height } = getNodeSize(nodeId);
  return { x: position.x + width / 2, y: position.y + height / 2 };
}

function normalizeCanvasPoint(point: Point): Point {
  const bounds = linkCanvasBounds.value;
  return {
    x: point.x - bounds.minX,
    y: point.y - bounds.minY
  };
}

function pointerEventToCanvasPoint(event: PointerEvent | MouseEvent) {
  const canvas = editorCanvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - editorOffset.x) / editorScale.value;
  const y = (event.clientY - rect.top - editorOffset.y) / editorScale.value;
  return { x, y };
}

function facePointFromPosition(position: { x: number; y: number }, face: NodeFace, nodeId?: string) {
  const baseX = position.x;
  const baseY = position.y;
  const { width, height } = getNodeSize(nodeId);
  switch (face) {
    case 'top':
      return { x: baseX + width / 2, y: baseY };
    case 'right':
      return { x: baseX + width, y: baseY + height / 2 };
    case 'bottom':
      return { x: baseX + width / 2, y: baseY + height };
    case 'left':
    default:
      return { x: baseX, y: baseY + height / 2 };
  }
}

function getFacePoint(node: EditableNode, face: NodeFace) {
  return facePointFromPosition(node.position, face, node.id);
}

function determineFace(dx: number, dy: number): NodeFace {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function getNearestFace(position: { x: number; y: number }, targetCenter: Point, nodeId?: string): NodeFace {
  let bestFace: NodeFace = NODE_FACES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const face of NODE_FACES) {
    const point = facePointFromPosition(position, face, nodeId);
    const distance = (point.x - targetCenter.x) ** 2 + (point.y - targetCenter.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFace = face;
    }
  }
  return bestFace;
}

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

function buildCurvedPath(start: Point, end: Point, sourceFace: NodeFace, targetFace: NodeFace) {
  const startNormal = FACE_NORMALS[sourceFace];
  const endNormal = FACE_NORMALS[targetFace];
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const baseOffset = Math.min(220, Math.max(70, distance * 0.35));
  const startOffset = baseOffset;
  const endOffset = baseOffset;
  const cx1 = start.x + startNormal.x * startOffset;
  const cy1 = start.y + startNormal.y * startOffset;
  const cx2 = end.x + endNormal.x * endOffset;
  const cy2 = end.y + endNormal.y * endOffset;
  const midPoint = cubicBezierPoint(start, { x: cx1, y: cy1 }, { x: cx2, y: cy2 }, end, 0.5);
  return {
    curve: [start, { x: cx1, y: cy1 }, { x: cx2, y: cy2 }, end] as [Point, Point, Point, Point],
    midPoint
  };
}

function buildPathFromPoints(points: [Point, Point, Point, Point]) {
  return `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y}, ${points[2].x} ${points[2].y}, ${points[3].x} ${points[3].y}`;
}

function approximateBezierLength(points: [Point, Point, Point, Point], segments = 20) {
  let length = 0;
  let prev = points[0];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const current = cubicBezierPoint(points[0], points[1], points[2], points[3], t);
    length += Math.hypot(current.x - prev.x, current.y - prev.y);
    prev = current;
  }
  return length;
}

function createCanvasLink(
  parentNodeId: string,
  childNodeId: string,
  faces?: { parentFace?: NodeFace | null; childFace?: NodeFace | null }
) {
  if (parentNodeId === childNodeId) {
    return;
  }
  if (editableLinks.value.some((link) => link.parentNodeId === parentNodeId && link.childNodeId === childNodeId)) {
    return;
  }
  const parentFace = faces?.parentFace ?? null;
  const childFace = faces?.childFace ?? null;
  const conditions: Record<string, unknown> = {};
  if (parentFace) {
    conditions.__parentFace = parentFace;
  }
  if (childFace) {
    conditions.__childFace = childFace;
  }
  editableLinks.value.push({
    id: crypto.randomUUID?.() ?? `link_${Date.now()}_${Math.random()}`,
    parentNodeId,
    childNodeId,
    conditions
  });
  dirtyGraph.value = true;
}

function beginLinkDrag(node: EditableNode, face: NodeFace, event: PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  const startPoint = getFacePoint(node, face);
  linkDrag.active = true;
  linkDrag.startNodeId = node.id;
  linkDrag.startPoint = startPoint;
  linkDrag.currentPoint = startPoint;
  linkDrag.startFace = face;
  const moveHandler = (moveEvent: PointerEvent) => {
    linkDrag.currentPoint = pointerEventToCanvasPoint(moveEvent);
  };
  document.addEventListener('pointermove', moveHandler);
  linkDragMoveListener = moveHandler;
  document.addEventListener(
    'pointerup',
    () => {
      if (hoveredHandle.value && hoveredHandle.value.nodeId && hoveredHandle.value.nodeId !== node.id) {
        createCanvasLink(node.id, hoveredHandle.value.nodeId, {
          parentFace: linkDrag.startFace,
          childFace: hoveredHandle.value.face
        });
      }
      endLinkDrag();
    },
    { once: true }
  );
}

function endLinkDrag() {
  linkDrag.active = false;
  linkDrag.startNodeId = null;
  linkDrag.startFace = null;
  hoveredHandle.value = null;
  if (linkDragMoveListener) {
    document.removeEventListener('pointermove', linkDragMoveListener);
    linkDragMoveListener = null;
  }
}

function handleHandleEnter(nodeId: string, face: NodeFace) {
  if (!linkDrag.active) {
    return;
  }
  hoveredHandle.value = { nodeId, face };
}

function handleHandleLeave() {
  hoveredHandle.value = null;
}

function linkRemoveStyle(link: RenderedLink) {
  return {
    left: `${link.midPoint.x}px`,
    top: `${link.midPoint.y}px`
  };
}

function handleLinkHover(linkId: string | null) {
  hoveredLinkId.value = linkId;
}

function linkAnimationStyle(link: RenderedLink) {
  return {
    '--path-length': `${link.pathLength}px`,
    '--animation-delay': `${link.animationDelay}s`
  } as Record<string, string>;
}

const renderedLinks = computed<RenderedLink[]>(() => {
  if (!renderedNodes.value.length || !detail.value) {
    return [];
  }
  const nodes = nodePositionMap.value;
  const branchAssignmentsMap = nodeBranchAssignments.value;
  return (activeTab.value === 'editor' ? editableLinks.value : detail.value.links).map((link) => {
    const start = nodes.get(link.parentNodeId) ?? { x: 0, y: 0 };
    const end = nodes.get(link.childNodeId) ?? { x: 0, y: 0 };

    const sourceCenter = nodeCenter(start, link.parentNodeId);
    const targetCenter = nodeCenter(end, link.childNodeId);

    const storedParentFace = readFaceCondition(link.conditions, '__parentFace');
    const storedChildFace = readFaceCondition(link.conditions, '__childFace');

    const sourceFace =
      storedParentFace ?? getNearestFace(start, targetCenter, link.parentNodeId);
    const targetFace =
      storedChildFace ?? getNearestFace(end, sourceCenter, link.childNodeId);
    const sourcePoint = facePointFromPosition(start, sourceFace, link.parentNodeId);
    const targetPoint = facePointFromPosition(end, targetFace, link.childNodeId);
    const { curve, midPoint } = buildCurvedPath(sourcePoint, targetPoint, sourceFace, targetFace);
    const normalizedCurve = curve.map((point) => normalizeCanvasPoint(point)) as [Point, Point, Point, Point];
    const path = buildPathFromPoints(normalizedCurve);
    const pathLength = approximateBezierLength(normalizedCurve);
    const branchInfo = branchAssignmentsMap.get(link.childNodeId);
    const branchColor =
      BRANCH_COLORS[(branchInfo?.branchIndex ?? 0) % BRANCH_COLORS.length] ?? DEFAULT_BRANCH_COLOR;
    const animationDelay = (branchInfo?.depth ?? 0) * BRANCH_ANIMATION_STAGGER;

    return {
      id: link.id,
      parentNodeId: link.parentNodeId,
      childNodeId: link.childNodeId,
      path,
      start: sourcePoint,
      end: targetPoint,
      midPoint,
      branchColor,
      animationDelay,
      pathLength
    };
  });
});

const linkPreviewPath = computed(() => {
  if (!linkDrag.active || !linkDrag.startFace) {
    return '';
  }
  const dx = linkDrag.currentPoint.x - linkDrag.startPoint.x;
  const dy = linkDrag.currentPoint.y - linkDrag.startPoint.y;
  const fallbackFace = determineFace(dx, dy);
  const targetFace = hoveredHandle.value?.face ?? fallbackFace;
  const { curve } = buildCurvedPath(linkDrag.startPoint, linkDrag.currentPoint, linkDrag.startFace, targetFace);
  const normalizedCurve = curve.map((point) => normalizeCanvasPoint(point)) as [Point, Point, Point, Point];
  return buildPathFromPoints(normalizedCurve);
});

function measureNodeDimensions() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const elements = document.querySelectorAll<HTMLElement>('.quest-node[data-node-id]');
      if (!elements.length) {
        return;
      }
      const updated = { ...nodeDimensions.value };
      elements.forEach((element) => {
        const nodeId = element.dataset.nodeId;
        if (!nodeId) {
          return;
        }
        updated[nodeId] = { width: element.offsetWidth, height: element.offsetHeight };
      });
      nodeDimensions.value = updated;
    });
  });
}

const handleWindowResize = () => {
  measureNodeDimensions();
  requestOverviewFit();
};

onMounted(() => {
  measureNodeDimensions();
  window.addEventListener('resize', handleWindowResize);
  if (typeof ResizeObserver !== 'undefined') {
    overviewResizeObserver = new ResizeObserver(() => requestOverviewFit());
    if (overviewCanvasRef.value) {
      overviewResizeObserver.observe(overviewCanvasRef.value);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  overviewResizeObserver?.disconnect();
  overviewResizeObserver = null;
});

watch(
  () => overviewCanvasRef.value,
  (element, previous) => {
    if (overviewResizeObserver) {
      if (previous) {
        overviewResizeObserver.unobserve(previous);
      }
      if (element) {
        overviewResizeObserver.observe(element);
      }
    }
    if (element) {
      requestOverviewFit();
    }
  }
);

watch(
  () => [renderedNodes.value, activeTab.value],
  () => measureNodeDimensions(),
  { flush: 'post', deep: true }
);


const availableTabs = computed(() => [
  { key: 'overview' as const, label: 'Overview', disabled: false },
  { key: 'editor' as const, label: 'Blueprint Editor', disabled: !permissions.value?.canManageBlueprints },
  { key: 'guild' as const, label: 'Guild Board', disabled: !permissions.value?.canViewGuildBoard }
]);

function formatPercent(value: number) {
  const percent = Math.max(0, Math.min(1, value ?? 0));
  return `${Math.round(percent * 100)}%`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function nodeStyle(node: QuestNodeViewModel, draggable: boolean) {
  const accent = nodeBranchColor(node.id);
  return {
    transform: `translate(${node.position.x}px, ${node.position.y}px)`,
    cursor: draggable ? 'move' : 'default',
    borderColor: accent,
    '--accent': accent
  };
}

function typeAccent(nodeType: QuestNodeType, isGroup?: boolean) {
  if (isGroup) {
    return { background: '#14b8a6' };
  }
  const color = questNodeTypeColors[nodeType] ?? '#2563eb';
  return { background: color };
}

function viewerNodeStatus(nodeId: string): QuestNodeProgressStatus {
  return viewerAssignment.value?.progress.find((record) => record.nodeId === nodeId)?.status ?? 'NOT_STARTED';
}

function statusClass(status?: QuestNodeProgressStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'status-pill status-pill--success';
    case 'IN_PROGRESS':
      return 'status-pill status-pill--warning';
    case 'BLOCKED':
      return 'status-pill status-pill--danger';
    default:
      return 'status-pill';
  }
}

function displayNodeType(nodeType: QuestNodeType, isGroup?: boolean) {
  if (isGroup) {
    return 'Group';
  }
  return questNodeTypeLabels[nodeType] ?? nodeType;
}

function assignmentNodeClass(status?: QuestNodeProgressStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'quest-node-dot--success';
    case 'IN_PROGRESS':
      return 'quest-node-dot--warning';
    case 'BLOCKED':
      return 'quest-node-dot--danger';
    default:
      return 'quest-node-dot--muted';
  }
}

function assignmentNodeStatus(assignment: QuestAssignment, nodeId: string): QuestNodeProgressStatus {
  return assignment.progress.find((progress) => progress.nodeId === nodeId)?.status ?? 'NOT_STARTED';
}

function selectBlueprint(id: string) {
  if (selectedBlueprintId.value === id) {
    return;
  }
  selectedBlueprintId.value = id;
}

async function loadSummary(initial = false) {
  loadingSummary.value = true;
  try {
    const data = await api.fetchQuestTracker(guildId);
    summary.value = data;
    if (initial && !selectedBlueprintId.value && data.blueprints.length) {
      selectBlueprint(data.blueprints[0].id);
    }
  } finally {
    loadingSummary.value = false;
  }
}

async function loadDetail(blueprintId: string) {
  loadingDetail.value = true;
  try {
    const response = await api.fetchQuestBlueprintDetail(guildId, blueprintId);
    detail.value = response;
    nodeDimensions.value = {};
    lastSavedAt.value = response.blueprint.updatedAt ?? response.blueprint.createdAt ?? null;
    lastSavedBy.value = response.blueprint.lastEditedByName ?? 'Unknown member';
    editableNodes.value = response.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      requirements: { ...node.requirements },
      metadata: { ...node.metadata, accentColor: ensureAccentColor((node.metadata as any)?.accentColor) }
    })) as EditableNode[];
    editableLinks.value = response.links.map((link) => ({ ...link }));
    dirtyGraph.value = false;
    editorScale.value = 1;
    editorOffset.x = 0;
    editorOffset.y = 0;
    setSelectedNodes(editableNodes.value[0] ? [editableNodes.value[0].id] : []);
    showStepSettings.value = false;
    blueprintMetaForm.title = response.blueprint.title;
    blueprintMetaForm.summary = response.blueprint.summary ?? '';
    blueprintMetaForm.isArchived = response.blueprint.isArchived;
    updateTabAvailability();
    measureNodeDimensions();
    requestOverviewFit();
    requestEditorFit();
  } finally {
    loadingDetail.value = false;
  }
}

function updateTabAvailability() {
  if (activeTab.value === 'editor' && !permissions.value?.canManageBlueprints) {
    activeTab.value = 'overview';
  }
  if (activeTab.value === 'guild' && !permissions.value?.canViewGuildBoard) {
    activeTab.value = 'overview';
  }
}

function setTab(tab: 'overview' | 'editor' | 'guild') {
  activeTab.value = tab;
}

function toggleEditorTab() {
  activeTab.value = activeTab.value === 'editor' ? 'overview' : 'editor';
}

function resetCanvasTransform() {
  requestEditorFit();
  requestOverviewFit();
}

function toggleStepSettings() {
  if (!selectedNodeId.value && editableNodes.value.length) {
    setSelectedNodes([editableNodes.value[0].id]);
  }
  showStepSettings.value = !showStepSettings.value;
}

type SelectionMode = 'exclusive' | 'append' | 'toggle';

function selectNode(nodeId: string, mode: SelectionMode = 'exclusive') {
  if (mode === 'exclusive') {
    setSelectedNodes([nodeId]);
    return;
  }
  const next = new Set(selectedNodeIds.value);
  if (mode === 'append') {
    next.add(nodeId);
    selectedNodeIds.value = next;
    if (!selectedNodeId.value) {
      selectedNodeId.value = nodeId;
    }
    return;
  }
  if (next.has(nodeId)) {
    next.delete(nodeId);
    selectedNodeIds.value = next;
    if (selectedNodeId.value === nodeId) {
      const iterator = next.values().next();
      selectedNodeId.value = iterator.done ? null : iterator.value;
    }
  } else {
    next.add(nodeId);
    selectedNodeIds.value = next;
    if (!selectedNodeId.value) {
      selectedNodeId.value = nodeId;
    }
  }
}

function handleNodeDoubleClick(nodeId: string) {
  if (activeTab.value !== 'editor' || !canManageBlueprint.value) {
    return;
  }
  if (selectedNodeId.value === nodeId && showStepSettings.value) {
    showStepSettings.value = false;
    return;
  }
  selectNode(nodeId);
  showStepSettings.value = true;
}

function markDirty() {
  dirtyGraph.value = true;
}

function showSaveToast(message: string) {
  saveToast.visible = true;
  saveToast.message = message;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    saveToast.visible = false;
    toastTimer = null;
  }, 3000);
}

function showSaveError(message: string) {
  saveErrorModal.message = message;
  saveErrorModal.open = true;
}

function hideContextMenu() {
  contextMenu.visible = false;
  contextMenu.nodeId = null;
}

function positionContextMenu(event: MouseEvent, width = 200, height = 140) {
  const maxX = window.innerWidth - width;
  const maxY = window.innerHeight - height;
  contextMenu.x = Math.max(0, Math.min(event.clientX, maxX));
  contextMenu.y = Math.max(0, Math.min(event.clientY, maxY));
}

function openCanvasMenu(event: MouseEvent) {
  if (activeTab.value !== 'editor' || !canManageBlueprint.value) {
    return;
  }
  if (suppressCanvasContextMenu.value) {
    suppressCanvasContextMenu.value = false;
    return;
  }
  hideContextMenu();
  positionContextMenu(event);
  contextMenu.visible = true;
  contextMenu.type = 'canvas';
}

function openNodeMenu(node: EditableNode, event: MouseEvent) {
  if (activeTab.value !== 'editor' || !canManageBlueprint.value) {
    return;
  }
  if (!isNodeSelected(node.id)) {
    selectNode(node.id);
  }
  hideContextMenu();
  positionContextMenu(event);
  contextMenu.visible = true;
  contextMenu.type = 'node';
  contextMenu.nodeId = node.id;
}

function handleCanvasAddNode() {
  if (!canManageBlueprint.value) {
    hideContextMenu();
    return;
  }
  const newId = addNode();
  if (newId) {
    selectNode(newId);
    showStepSettings.value = true;
  }
  hideContextMenu();
}

function handleOpenBlueprintSettings() {
  if (!selectedBlueprintId.value) {
    return;
  }
  showBlueprintSettings.value = true;
  hideContextMenu();
}

function handleAddChildFromMenu() {
  if (!contextMenu.nodeId) {
    return;
  }
  if (!canManageBlueprint.value) {
    hideContextMenu();
    return;
  }
  const newId = addNode(contextMenu.nodeId);
  if (newId) {
    selectNode(newId);
    showStepSettings.value = true;
  }
  hideContextMenu();
}

function handleDeleteNodeFromMenu() {
  if (!contextMenu.nodeId) {
    return;
  }
  if (!canManageBlueprint.value) {
    hideContextMenu();
    return;
  }
  if (isNodeSelected(contextMenu.nodeId) && selectedNodeIds.value.size > 1) {
    removeNodes(getSelectedNodeIds());
  } else {
    removeNodes([contextMenu.nodeId]);
  }
  hideContextMenu();
}

function handleEditNodeFromMenu() {
  if (!contextMenu.nodeId) {
    return;
  }
  if (!canManageBlueprint.value) {
    hideContextMenu();
    return;
  }
  selectNode(contextMenu.nodeId);
  showStepSettings.value = true;
  hideContextMenu();
}

function handleResetViewFromMenu() {
  resetCanvasTransform();
  hideContextMenu();
}

function closeSaveError() {
  saveErrorModal.open = false;
}

async function copySaveError() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(saveErrorModal.message);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = saveErrorModal.message;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showSaveToast('Error copied to clipboard');
  } catch (error) {
    console.error('Failed to copy error message', error);
  }
}

function updateAccentColor(event: Event) {
  if (!selectedNode.value) {
    return;
  }
  const input = event.target as HTMLInputElement;
  selectedNode.value.metadata.accentColor = ensureAccentColor(input.value);
  markDirty();
}

function addNode(parentId?: string | null) {
  const id = crypto.randomUUID?.() ?? `node_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parent = parentId ? editableNodes.value.find((node) => node.id === parentId) : null;
  const newNode: EditableNode = {
    id,
    title: 'New Quest Step',
    description: '',
    nodeType: 'EXPLORE' as QuestNodeType,
    position: {
      x: parent ? parent.position.x + 180 : 40 + editableNodes.value.length * 6,
      y: parent ? parent.position.y + 120 : 80 + editableNodes.value.length * 10
    },
    sortOrder: editableNodes.value.length,
    requirements: {},
    metadata: { accentColor: DEFAULT_ACCENT_COLOR },
    isGroup: false
  };
  editableNodes.value.push(newNode);
  if (parent) {
    createCanvasLink(parent.id, id, { parentFace: 'right', childFace: 'left' });
  }
  setSelectedNodes([id]);
  dirtyGraph.value = true;
  return id;
}

function removeNodes(nodeIds: string[]) {
  if (!nodeIds.length) {
    return;
  }
  const removalSet = new Set(nodeIds);
  editableNodes.value = editableNodes.value.filter((node) => !removalSet.has(node.id));
  editableLinks.value = editableLinks.value.filter(
    (link) => !removalSet.has(link.parentNodeId) && !removalSet.has(link.childNodeId)
  );
  clearSelectedNodes();
  dirtyGraph.value = true;
}

function handleCanvasWheel(event: WheelEvent) {
  if (activeTab.value !== 'editor') {
    return;
  }
  event.preventDefault();
  const canvas = editorCanvasRef.value;
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const worldX = (pointerX - editorOffset.x) / editorScale.value;
  const worldY = (pointerY - editorOffset.y) / editorScale.value;
  const zoomFactor = Math.exp(-event.deltaY * 0.0015);
  const nextScale = clamp(editorScale.value * zoomFactor, 0.35, 2);
  editorScale.value = Number(nextScale.toFixed(3));
  editorOffset.x = pointerX - worldX * editorScale.value;
  editorOffset.y = pointerY - worldY * editorScale.value;
}

function beginSelectionMarquee(event: PointerEvent) {
  marqueeSelection.active = true;
  const startPoint = pointerEventToCanvasPoint(event);
  marqueeSelection.start = { ...startPoint };
  marqueeSelection.end = { ...startPoint };

  const moveHandler = (moveEvent: PointerEvent) => {
    marqueeSelection.end = pointerEventToCanvasPoint(moveEvent);
  };

  const upHandler = () => {
    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    finalizeMarqueeSelection();
  };

  document.addEventListener('pointermove', moveHandler);
  document.addEventListener('pointerup', upHandler);
}

function finalizeMarqueeSelection() {
  const bounds = getMarqueeBounds();
  marqueeSelection.active = false;
  if (!bounds) {
    clearSelectedNodes();
    return;
  }
  const hits = editableNodes.value.filter((node) => nodeWithinBounds(node, bounds)).map((node) => node.id);
  if (hits.length) {
    setSelectedNodes(hits);
  } else {
    clearSelectedNodes();
  }
}

function getMarqueeBounds(): SelectionBounds | null {
  const left = Math.min(marqueeSelection.start.x, marqueeSelection.end.x);
  const right = Math.max(marqueeSelection.start.x, marqueeSelection.end.x);
  const top = Math.min(marqueeSelection.start.y, marqueeSelection.end.y);
  const bottom = Math.max(marqueeSelection.start.y, marqueeSelection.end.y);
  const width = right - left;
  const height = bottom - top;
  if (width < 3 && height < 3) {
    return null;
  }
  return { left, right, top, bottom };
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (linkDrag.active || activeTab.value !== 'editor') {
    return;
  }
  if (showStepSettings.value) {
    showStepSettings.value = false;
  }
  if ((event.target as HTMLElement).closest('.quest-node')) {
    return;
  }
  const shouldPan = event.button === 2 || (event.button === 0 && isSpacePanning.value);
  if (shouldPan) {
    beginCanvasPan(event);
    return;
  }
  if (event.button !== 0) {
    return;
  }
  beginSelectionMarquee(event);
}

function beginCanvasPan(event: PointerEvent) {
  if (linkDrag.active) {
    return;
  }
  if (activeTab.value !== 'editor') {
    return;
  }
  suppressCanvasContextMenu.value = false;
  isPanning.value = true;
  panState.button = event.button;
  panState.moved = false;
  panStart.x = event.clientX;
  panStart.y = event.clientY;
  panStart.originX = editorOffset.x;
  panStart.originY = editorOffset.y;

  const moveHandler = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - panStart.x;
    const dy = moveEvent.clientY - panStart.y;
    editorOffset.x = panStart.originX + dx;
    editorOffset.y = panStart.originY + dy;
    if (
      !panState.moved &&
      (Math.abs(dx) > PAN_SUPPRESS_THRESHOLD || Math.abs(dy) > PAN_SUPPRESS_THRESHOLD)
    ) {
      panState.moved = true;
    }
  };

  const upHandler = () => {
    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    isPanning.value = false;
    if (panState.button === 2 && panState.moved) {
      suppressCanvasContextMenu.value = true;
    }
    panState.button = null;
    panState.moved = false;
  };

  document.addEventListener('pointermove', moveHandler);
  document.addEventListener('pointerup', upHandler);
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (activeTab.value === 'editor') {
      saveGraph().catch((error) => console.error('Failed to save blueprint', error));
    }
    return;
  }
  if (event.code === 'Space' && !isEditableElement(event.target)) {
    event.preventDefault();
    isSpacePanning.value = true;
    return;
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    activeTab.value === 'editor' &&
    !isEditableElement(event.target) &&
    selectedNodeIds.value.size
  ) {
    event.preventDefault();
    removeNodes(getSelectedNodeIds());
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isSpacePanning.value = false;
  }
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT'
  );
}

function nodeLinks(nodeId: string) {
  return editableLinks.value.filter((link) => link.parentNodeId === nodeId);
}

function removeLink(linkId: string) {
  editableLinks.value = editableLinks.value.filter((link) => link.id !== linkId);
  dirtyGraph.value = true;
}

function targetNodeTitle(nodeId: string) {
  return editableNodes.value.find((node) => node.id === nodeId)?.title ?? 'Unknown';
}

function handleNodePointerDown(node: EditableNode, event: PointerEvent) {
  if (activeTab.value !== 'editor' || event.button !== 0) {
    return;
  }
  if (linkDrag.active) {
    return;
  }
  const toggle = event.ctrlKey || event.metaKey;
  if (toggle) {
    return;
  }
  if (!isNodeSelected(node.id)) {
    selectNode(node.id);
  }
  beginDrag(node, event);
}

function handleNodeClick(node: EditableNode, event: MouseEvent) {
  if (activeTab.value !== 'editor') {
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    selectNode(node.id, 'toggle');
    return;
  }
  if (!isNodeSelected(node.id)) {
    selectNode(node.id);
  }
}

function beginDrag(node: EditableNode, event: PointerEvent) {
  if (activeTab.value !== 'editor' || event.button !== 0) {
    return;
  }
  if (!selectedNodeIds.value.size) {
    setSelectedNodes([node.id]);
  }
  const dragNodes = editableNodes.value.filter((entry) => selectedNodeIds.value.has(entry.id));
  const originPositions = dragNodes.map((entry) => ({
    node: entry,
    x: entry.position.x,
    y: entry.position.y
  }));
  const startX = event.clientX;
  const startY = event.clientY;
  function moveHandler(moveEvent: PointerEvent) {
    const deltaX = (moveEvent.clientX - startX) / editorScale.value;
    const deltaY = (moveEvent.clientY - startY) / editorScale.value;
    originPositions.forEach(({ node: current, x, y }) => {
      current.position.x = Math.max(-2000, Math.min(2000, x + deltaX));
      current.position.y = Math.max(-2000, Math.min(2000, y + deltaY));
    });
    dirtyGraph.value = true;
  }
  function upHandler(upEvent: PointerEvent) {
    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    (upEvent.target as HTMLElement | undefined)?.releasePointerCapture?.(event.pointerId);
  }
  document.addEventListener('pointermove', moveHandler);
  document.addEventListener('pointerup', upHandler);
  (event.target as HTMLElement | undefined)?.setPointerCapture?.(event.pointerId);
}

function resetEditorState() {
  if (!detail.value) {
    return;
  }
  editableNodes.value = detail.value.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    requirements: { ...node.requirements },
    metadata: { ...node.metadata }
  })) as EditableNode[];
  editableLinks.value = detail.value.links.map((link) => ({ ...link }));
  dirtyGraph.value = false;
  setSelectedNodes(editableNodes.value[0] ? [editableNodes.value[0].id] : []);
}

async function saveGraph() {
  if (!selectedBlueprintId.value) {
    return;
  }
  savingGraph.value = true;
  try {
    const payload = {
      nodes: editableNodes.value.map((node, index) => ({
        id: node.id,
        title: node.title,
        description: node.description,
        nodeType: node.nodeType,
        position: node.position,
        sortOrder: index,
        requirements: node.requirements,
        metadata: node.metadata,
        isGroup: node.isGroup
      })) as QuestNodeInputPayload[],
      links: editableLinks.value.map((link) => {
        const start = nodePositionMap.value.get(link.parentNodeId) ?? { x: 0, y: 0 };
        const end = nodePositionMap.value.get(link.childNodeId) ?? { x: 0, y: 0 };
        const sourceCenter = nodeCenter(start, link.parentNodeId);
        const targetCenter = nodeCenter(end, link.childNodeId);
        const parentFace =
          readFaceCondition(link.conditions, '__parentFace') ??
          getNearestFace(start, targetCenter, link.parentNodeId);
        const childFace =
          readFaceCondition(link.conditions, '__childFace') ??
          getNearestFace(end, sourceCenter, link.childNodeId);
        const conditions = { ...(link.conditions ?? {}) };
        conditions.__parentFace = parentFace;
        conditions.__childFace = childFace;
        return {
          id: link.id,
          parentNodeId: link.parentNodeId,
          childNodeId: link.childNodeId,
          conditions
        };
      }) as QuestLinkInputPayload[]
    };
    const response = await api.saveQuestBlueprintGraph(guildId, selectedBlueprintId.value, payload);
    detail.value = response;
    blueprintMetaForm.title = response.blueprint.title;
    blueprintMetaForm.summary = response.blueprint.summary ?? '';
    blueprintMetaForm.isArchived = response.blueprint.isArchived;
    editableNodes.value = response.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      requirements: { ...node.requirements },
      metadata: { ...node.metadata, accentColor: ensureAccentColor((node.metadata as any)?.accentColor) }
    })) as EditableNode[];
    editableLinks.value = response.links.map((link) => ({ ...link }));
    dirtyGraph.value = false;
    lastSavedAt.value = response.blueprint.updatedAt ?? new Date().toISOString();
    lastSavedBy.value = response.blueprint.lastEditedByName ?? lastSavedBy.value;
    await loadSummary();
  } catch (error) {
    console.error('Failed to save quest blueprint', error);
    showSaveError(extractErrorMessage(error, 'Unable to save blueprint.'));
  } finally {
    savingGraph.value = false;
  }
}

async function saveBlueprintMetadata() {
  if (!selectedBlueprintId.value || !blueprintMetaForm.title.trim()) {
    window.alert('Blueprint title is required.');
    return false;
  }
  metadataSaving.value = true;
  try {
    const updated = await api.updateQuestBlueprint(guildId, selectedBlueprintId.value, {
      title: blueprintMetaForm.title.trim(),
      summary: blueprintMetaForm.summary.trim() || null,
      isArchived: blueprintMetaForm.isArchived
    });
    if (detail.value) {
      detail.value.blueprint = { ...detail.value.blueprint, ...updated };
      lastSavedAt.value = updated.updatedAt ?? lastSavedAt.value;
      lastSavedBy.value = updated.lastEditedByName ?? lastSavedBy.value;
    }
    await loadSummary();
    return true;
  } catch (error) {
    showSaveError(extractErrorMessage(error, 'Unable to update blueprint settings.'));
    return false;
  } finally {
    metadataSaving.value = false;
  }
}

async function saveBlueprintSettings() {
  const saved = await saveBlueprintMetadata();
  if (saved) {
    showBlueprintSettings.value = false;
  }
}

async function startAssignment() {
  if (!selectedBlueprintId.value) {
    return;
  }
  assignmentUpdating.value = true;
  try {
    const assignment = await api.startQuestAssignment(guildId, selectedBlueprintId.value);
    if (detail.value) {
      detail.value.viewerAssignment = assignment;
    }
    await loadSummary();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to start quest.');
  } finally {
    assignmentUpdating.value = false;
  }
}

async function updateAssignmentStatus(status: QuestAssignmentStatus) {
  if (!selectedBlueprintId.value || !viewerAssignmentId.value) {
    return;
  }
  assignmentUpdating.value = true;
  try {
    const assignment = await api.updateQuestAssignmentStatus(
      guildId,
      viewerAssignmentId.value,
      status
    );
    if (detail.value) {
      detail.value.viewerAssignment = assignment;
    }
    await loadSummary();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to update quest assignment.');
  } finally {
    assignmentUpdating.value = false;
  }
}

function completeAssignment() {
  updateAssignmentStatus('COMPLETED');
}

function cancelAssignment() {
  if (!window.confirm('Abandon this quest?')) {
    return;
  }
  updateAssignmentStatus('CANCELLED');
}

async function updateNodeStatus(nodeId: string, status: QuestNodeProgressStatus) {
  if (!viewerAssignmentId.value) {
    return;
  }
  progressUpdating.value = true;
  try {
    const assignment = await api.updateQuestAssignmentProgress(guildId, viewerAssignmentId.value, [
      { nodeId, status }
    ]);
    if (detail.value) {
      detail.value.viewerAssignment = assignment;
    }
    await loadSummary();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to update quest step.');
  } finally {
    progressUpdating.value = false;
  }
}

function openCreateModal() {
  showCreateModal.value = true;
  newBlueprintForm.title = '';
  newBlueprintForm.summary = '';
}

function closeCreateModal() {
  showCreateModal.value = false;
}

async function createBlueprint() {
  if (!newBlueprintForm.title.trim()) {
    window.alert('Blueprint title is required.');
    return;
  }
  creatingBlueprint.value = true;
  try {
    const blueprint = await api.createQuestBlueprint(guildId, {
      title: newBlueprintForm.title.trim(),
      summary: newBlueprintForm.summary.trim() || null
    });
    await loadSummary();
    selectBlueprint(blueprint.id);
    closeCreateModal();
  } finally {
    creatingBlueprint.value = false;
  }
}

watch(selectedBlueprintId, (blueprintId) => {
  if (!blueprintId) {
    detail.value = null;
    return;
  }
  loadDetail(blueprintId).catch((error) => console.error('Failed to load quest detail', error));
});

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'overview') {
      scheduleOverviewFit(true);
    }
    if (tab === 'editor') {
      scheduleEditorFit();
    }
  }
);

watch(selectedNodeId, (nodeId) => {
  if (!nodeId) {
    showStepSettings.value = false;
  }
});

onMounted(() => {
  loadSummary(true).catch((error) => console.error('Failed to load quest tracker', error));
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('click', hideContextMenu);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  endLinkDrag();
  window.removeEventListener('click', hideContextMenu);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
});
 </script>

<style scoped>
.quest-tracker {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  min-height: calc(100vh - 120px);
}

.quest-tracker__sidebar {
  background: var(--surface-raised, #101828);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.quest-tracker__header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.quest-tracker__search .input {
  width: 100%;
}

.quest-blueprint-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.quest-blueprint-list__item > button {
  width: 100%;
  text-align: left;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: var(--surface-card, #111);
  border: 1px solid transparent;
}

.quest-blueprint-list__item--active > button {
  border-color: var(--accent, #8b5cf6);
  background: rgba(139, 92, 246, 0.1);
}

.quest-blueprint-list__summary {
  margin: 0.25rem 0 0;
}

.quest-progress-bar {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  height: 6px;
  margin-top: 0.35rem;
}

.quest-progress-bar__value {
  background: var(--accent, #8b5cf6);
  height: 100%;
  border-radius: inherit;
}

.quest-tracker__main {
  background: var(--surface-raised, #0f172a);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: calc(100vh - 160px);
}

.quest-detail {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.quest-detail__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.quest-detail__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 1rem;
  padding: 1rem;
}

.quest-stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.quest-stat-chip {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.85rem;
  padding: 0.6rem 0.9rem;
  min-width: 140px;
}

.quest-stat-chip .label {
  display: block;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.quest-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.quest-tabs__button {
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: transparent;
  color: inherit;
}

.quest-tabs__button--active {
  border-color: var(--accent, #8b5cf6);
  background: rgba(139, 92, 246, 0.2);
}

.quest-tabs__button--disabled {
  opacity: 0.4;
}

.quest-panel {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 1rem;
  padding: 1rem;
}

.quest-panel--editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.quest-panel--canvas {
  padding: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 1.5rem;
}

.quest-panel__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

.quest-panel--meta {
  background: rgba(255, 255, 255, 0.04);
}

.quest-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.quest-canvas {
  position: relative;
  min-height: 420px;
  flex: 1;
  height: 100%;
  overflow: hidden;
  cursor: grab;
}

.quest-canvas--panning {
  cursor: grabbing;
}

.quest-canvas__stage {
  position: relative;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  will-change: transform;
}

.quest-canvas__links {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 2;
  fill: none;
  transform-origin: 0 0;
}

.quest-canvas__links path {
  pointer-events: stroke;
}

.quest-canvas__links--animated {
  stroke: none;
}

.quest-canvas__links--animated path {
  pointer-events: none;
}

.quest-link-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14px;
  pointer-events: stroke;
  cursor: pointer;
}

.quest-link-preview {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  stroke: rgba(56, 189, 248, 0.7);
  stroke-width: 2;
  stroke-dasharray: 6;
  fill: none;
  transform-origin: 0 0;
}

.quest-link-animated {
  fill: none;
  stroke-width: 2.75;
  stroke-linecap: round;
  stroke-dasharray: var(--path-length);
  stroke-dashoffset: var(--path-length);
  animation: quest-link-trace 9s linear infinite;
  animation-delay: var(--animation-delay, 0s);
  opacity: 0;
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.35));
}

@keyframes quest-link-trace {
  0% {
    stroke-dashoffset: var(--path-length);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  45% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

.quest-selection-box {
  position: absolute;
  border: 1px dashed rgba(56, 189, 248, 0.8);
  background: rgba(56, 189, 248, 0.2);
  pointer-events: none;
  border-radius: 0.25rem;
}

.quest-link-remove {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(15, 23, 42, 0.85);
  color: rgba(248, 250, 252, 0.85);
  font-size: 0.75rem;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.quest-link-remove--visible {
  opacity: 0.95;
  transform: translate(-50%, -50%) scale(1.05);
  pointer-events: auto;
}

.quest-node {
  position: absolute;
  width: 220px;
  background: rgba(15, 23, 42, 0.96);
  border-radius: 1rem;
  padding: 0.75rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  border: 1px solid transparent;
  user-select: none;
}

.quest-node--selected {
  border-color: var(--accent, #8b5cf6);
  box-shadow:
    0 0 0 3px rgba(139, 92, 246, 0.35),
    0 12px 35px rgba(15, 23, 42, 0.45);
}

.quest-node__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.quest-node__handles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.quest-node__handle-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(226, 232, 240, 0.85);
  border: 2px solid rgba(15, 23, 42, 0.7);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: auto;
}

.quest-node:hover .quest-node__handle-dot {
  opacity: 0.85;
}

.btn--save {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.85);
  color: rgba(248, 250, 252, 0.92);
  padding: 0.3rem 1rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  transition: background 0.2s ease, transform 0.2s ease;
  margin-left: 1rem;
}

.btn--save:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.85);
  transform: translateY(-1px);
}

.btn--save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.quest-node__handle-dot--top {
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
}

.quest-node__handle-dot--right {
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
}

.quest-node__handle-dot--bottom {
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
}

.quest-node__handle-dot--left {
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
}

.quest-node__handle {
  font-size: 0.85rem;
  opacity: 0.6;
}

.quest-node__zone {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.8);
  margin: 0.35rem 0 0;
}

.quest-node__target {
  font-size: 0.8rem;
  color: rgba(248, 250, 252, 0.9);
  margin: 0.25rem 0 0;
}

.quest-node__target--inline {
  margin-top: 0.2rem;
}

.quest-node__zone--inline {
  margin-top: 0.15rem;
}

.quest-node__group-indicator {
  font-size: 0.75rem;
  color: rgba(248, 250, 252, 0.85);
  margin-top: 0.3rem;
}

.quest-node__group-type {
  padding: 0.45rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(20, 184, 166, 0.15);
  color: #2dd4bf;
  font-weight: 600;
}

.quest-step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.quest-node__type {
  color: #0f172a;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.quest-node__status {
  font-size: 0.7rem;
  text-transform: uppercase;
}

.status-pill {
  border-radius: 0.5rem;
  padding: 0.15rem 0.45rem;
  background: rgba(148, 163, 184, 0.2);
  font-size: 0.7rem;
}

.status-pill--success {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.status-pill--warning {
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
}

.status-pill--danger {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.quest-my-progress ul {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quest-my-progress__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.quest-my-progress__actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.quest-editor__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.quest-editor__status {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
}

.quest-editor__status-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.quest-editor__status-text {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.9);
}

.quest-editor__status-note {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.9);
}

.quest-editor__toolbar-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.quest-editor__toolbar-group--end {
  margin-left: auto;
}

.quest-editor {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.quest-editor__canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.6);
  overflow: hidden;
  cursor: grab;
}

.quest-editor__canvas--panning {
  cursor: grabbing;
}

.quest-editor__canvas-inner {
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  transition: transform 0.1s ease-out;
  position: absolute;
  top: 0;
  left: 0;
}

.quest-editor__panel {
  background: rgba(15, 23, 42, 0.8);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 320px;
  max-height: 100%;
  overflow: auto;
}

.form-label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.5rem;
}

.quest-guild-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.quest-guild-list__item {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 1rem;
  padding: 0.85rem;
}

.quest-guild-list__nodes {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.quest-guild-list__node {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.4);
}

.quest-node-dot--success {
  background: #22c55e;
}

.quest-node-dot--warning {
  background: #facc15;
}

.quest-node-dot--danger {
  background: #f87171;
}

.quest-node-dot--muted {
  background: rgba(148, 163, 184, 0.4);
}

.quest-loading,
.quest-empty {
  display: grid;
  place-items: center;
  min-height: 60vh;
  color: rgba(255, 255, 255, 0.6);
}

.quest-modal {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top, rgba(30, 41, 59, 0.85), rgba(2, 6, 23, 0.95));
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  z-index: 20;
  animation: questModalFade 0.25s ease forwards;
}

.quest-modal__content {
  background: #0f172a;
  border-radius: 1rem;
  padding: 1.5rem;
  width: min(460px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 30px 60px rgba(2, 6, 23, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  animation: questModalPop 0.3s ease forwards;
}

.quest-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.quest-modal--error .quest-modal__content {
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.quest-error-message {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.75rem;
  font-size: 0.85rem;
  color: rgba(248, 250, 252, 0.9);
  max-height: 200px;
  overflow: auto;
  margin: 0.5rem 0 1rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.quest-toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  color: #f8fafc;
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.45);
  animation: questToastFade 0.25s ease forwards;
}

@keyframes questToastFade {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quest-context-menu {
  position: fixed;
  z-index: 30;
  list-style: none;
  padding: 0.35rem 0;
  margin: 0;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  min-width: 180px;
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.55);
}

.quest-context-menu li {
  padding: 0.45rem 0.9rem;
  font-size: 0.9rem;
  color: rgba(248, 250, 252, 0.9);
  cursor: pointer;
}

.quest-context-menu li:hover {
  background: rgba(59, 130, 246, 0.15);
}

.quest-context-menu li.danger:hover {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.badge--archived {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.65rem;
}

.quest-tracker .btn {
  border-radius: 999px;
  font-weight: 600;
  padding: 0.45rem 1.2rem;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  border: none;
}

.quest-tracker .btn--small {
  padding: 0.35rem 1rem;
}

.quest-tracker .btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.35);
}

.quest-tracker .btn:focus-visible {
  outline: 3px solid rgba(139, 92, 246, 0.45);
  outline-offset: 3px;
}

.quest-tracker .btn--primary {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #fff;
}

.quest-tracker .btn--secondary {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: #f8fafc;
}

.quest-tracker .btn--outline {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: #e2e8f0;
}

.quest-tracker .btn--outline:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.1);
}

.quest-tracker .btn--ghost {
  background: rgba(15, 23, 42, 0.35);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.quest-tracker .btn--ghost:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.45);
}

.quest-tracker .btn--tiny {
  padding: 0.25rem 0.8rem;
  font-size: 0.75rem;
}

.quest-tracker .btn--danger {
  background: linear-gradient(135deg, #f43f5e, #fb7185);
  color: #fff;
}

.quest-tracker .btn--pill {
  padding: 0.3rem 0.9rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  border: 1px solid transparent;
}

.quest-tracker .btn--pill.btn--primary {
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  border-color: rgba(59, 130, 246, 0.4);
}

.quest-my-progress__actions .btn {
  font-size: 0.75rem;
  letter-spacing: 0.01em;
}

.quest-node__actions .btn {
  width: 100%;
  justify-content: center;
}

.quest-modal__content header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quest-modal__content header h3 {
  margin: 0;
}

.quest-modal__content header .btn--icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.4);
  color: #f8fafc;
}

.quest-modal__content header .btn--icon:hover {
  background: rgba(148, 163, 184, 0.25);
}

.quest-detail__actions,
.quest-editor__toolbar,
.quest-modal__actions {
  flex-wrap: wrap;
}

@keyframes questModalFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes questModalPop {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 1100px) {
  .quest-tracker {
    grid-template-columns: 1fr;
  }
  .quest-tracker__main {
    min-height: 0;
  }
  .quest-detail {
    min-height: 0;
  }
  .quest-editor {
    flex-direction: column;
  }
  .quest-editor__panel {
    flex: 1 1 auto;
  }
}
</style>
