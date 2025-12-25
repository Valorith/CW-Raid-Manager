<template>
  <section class="quest-tracker" v-if="summary" :class="{ 'quest-tracker--alt-mode': overviewAltClickMode }">
    <aside class="quest-tracker__sidebar">
      <header class="quest-tracker__header">
        <div class="quest-tracker__header-meta">
          <p class="quest-tracker__eyebrow">Quest Planner</p>
          <h1>{{ guildNameDisplay }}</h1>
        </div>
        <button
          class="btn btn--small quest-tracker__new-btn"
          type="button"
          @click="openCreateModal"
        >
          <span aria-hidden="true">＋</span>
          <span>New Blueprint</span>
        </button>
      </header>
      <div class="quest-tracker__search">
        <div class="quest-tracker__search-field">
          <span class="quest-tracker__search-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path
                d="M13.5 12.5l3.25 3.25m-1.75-6a5.75 5.75 0 11-11.5 0 5.75 5.75 0 0111.5 0z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <input
            v-model="sidebarSearch"
            type="search"
            class="quest-tracker__search-input"
            placeholder="Search blueprints"
            aria-label="Search quest blueprints"
          />
        </div>
      </div>
      <div class="quest-folder-toolbar">
        <button
          v-if="canCreateFolders"
          class="btn btn--outline btn--small"
          type="button"
          @click="handleCreateFolder"
        >
          <span aria-hidden="true">＋</span>
          New folder
        </button>
      </div>
      <div
        class="quest-folder-list"
        ref="folderListRef"
        @dragover="handleFolderListDragOver"
        @dragleave="scrollDirection = null"
        @dragenter="handleFolderListDragEnter"
      >
        <section
          v-for="section in blueprintSections"
          :key="section.id ?? 'root'"
          :class="['quest-folder', { 'quest-folder--drag-over': dragOverFolderId === section.id && !dragOverBlueprintId }]"
          @dragover.prevent="handleFolderDragOver(section.id, $event)"
          @drop.prevent="handleFolderDrop(section.id, $event)"
        >
          <div class="quest-folder__header">
            <div class="quest-folder__title">
              <span class="quest-folder__icon">
                <img
                  v-if="section.iconKey"
                  :src="resolveFolderIcon(section.iconKey) || undefined"
                  :alt="section.title"
                />
                <svg v-else viewBox="0 0 20 20" focusable="false">
                  <path
                    d="M3 5.5A1.5 1.5 0 014.5 4h3.672a1.5 1.5 0 011.06.44l1.166 1.166a1.5 1.5 0 001.06.44H15.5A1.5 1.5 0 0117 7.546V14.5A1.5 1.5 0 0115.5 16h-11A1.5 1.5 0 013 14.5z"
                    fill="currentColor"
                    fill-opacity="0.85"
                  />
                </svg>
              </span>
              <strong>{{ section.title }}</strong>
              <span class="quest-folder__count">{{ section.blueprints.length }}</span>
            </div>
            <div class="quest-folder__actions" v-if="canManageBlueprints && section.id">
              <button
                class="btn btn--icon"
                type="button"
                :disabled="!canMoveFolder(section.id, 'up')"
                @click.stop="handleMoveFolder(section.id, 'up')"
                title="Move folder up"
              >
                ↑
              </button>
              <button
                class="btn btn--icon"
                type="button"
                :disabled="!canMoveFolder(section.id, 'down')"
                @click.stop="handleMoveFolder(section.id, 'down')"
                title="Move folder down"
              >
                ↓
              </button>
              <button
                v-if="!section.isSystem"
                class="btn btn--icon"
                type="button"
                @click.stop="handleRenameFolder(section.id)"
              >
                ✎
              </button>
              <button
                v-if="!section.isSystem"
                class="btn btn--icon"
                type="button"
                @click.stop="handleDeleteFolder(section.id)"
              >
                🗑
              </button>
            </div>
          </div>
          <ul
            class="quest-blueprint-list"
            :class="{ 'quest-blueprint-list--drag-target': dragOverFolderId === section.id && !dragOverBlueprintId }"
            @dragover.stop="handleFolderDragOver(section.id, $event)"
            @drop.stop="handleFolderDrop(section.id, $event)"
          >
            <li
              v-for="blueprint in section.blueprints"
              :key="blueprint.id"
              :class="[
                'quest-blueprint-card',
                {
                  'quest-blueprint-card--active': blueprint.id === selectedBlueprintId,
                  'quest-blueprint-card--dragging': draggingBlueprintId === blueprint.id,
                  'quest-blueprint-card--drop-target': dragOverBlueprintId === blueprint.id
                }
              ]"
              :draggable="canDragBlueprints"
              @dragstart="handleBlueprintDragStart(blueprint.id)"
              @dragend="handleBlueprintDragEnd"
              @dragover.stop="handleBlueprintDragOver(section.id, blueprint.id, $event)"
              @drop.stop="handleBlueprintDrop(section.id, blueprint.id, $event)"
            >
              <button
                type="button"
                class="quest-blueprint-card__button"
                @click="selectBlueprint(blueprint.id)"
                @contextmenu.prevent="handleBlueprintContextMenu($event, blueprint.id)"
              >
                <div class="quest-blueprint-card__header">
                  <div class="quest-blueprint-card__title">
                    <strong>{{ blueprint.title }}</strong>
                    <span v-if="blueprint.isArchived" class="badge badge--archived">Archived</span>
                  </div>
                  <span class="quest-blueprint-card__chip">
                    <span class="quest-blueprint-card__chip-count">{{ blueprint.nodeCount }}</span>
                    <span class="quest-blueprint-card__chip-label">steps</span>
                  </span>
                </div>
                <div class="quest-blueprint-card__stats">
                  <div class="quest-blueprint-card__stat">
                    <span class="label">Active</span>
                    <span class="value">{{ blueprint.assignmentCounts.ACTIVE }}</span>
                  </div>
                  <div class="quest-blueprint-card__stat">
                    <span class="label">Completed</span>
                    <span class="value">{{ blueprint.assignmentCounts.COMPLETED }}</span>
                  </div>
                  <div class="quest-blueprint-card__stat">
                    <span class="label">Paused</span>
                    <span class="value">{{ blueprint.assignmentCounts.PAUSED }}</span>
                  </div>
                </div>
                <div class="quest-blueprint-card__progress" v-if="blueprint.viewerAssignment">
                  <div class="quest-blueprint-card__progress-meta">
                    <span class="muted x-small">My progress</span>
                    <span class="quest-blueprint-card__progress-value">
                      {{ formatPercent(viewerProgressRatio(blueprint.viewerAssignment, blueprint.nodeCount)) }}
                    </span>
                  </div>
                  <div class="quest-progress-bar">
                    <div
                      class="quest-progress-bar__value"
                      :style="{ width: formatPercent(viewerProgressRatio(blueprint.viewerAssignment, blueprint.nodeCount)) }"
                    ></div>
                  </div>
                </div>
                <div class="quest-blueprint-card__footer" v-if="blueprint.createdByName">
                  <span class="quest-blueprint-card__author">By {{ blueprint.createdByName }}</span>
                </div>
              </button>
            </li>
          </ul>
          <p
            v-if="!section.blueprints.length && !sidebarSearch.trim()"
            class="quest-blueprint-empty"
          >
            No blueprints in this folder yet.
          </p>
        </section>
        <p v-if="!hasBlueprintMatches" class="quest-blueprint-empty">No blueprints found.</p>
      </div>
    </aside>

    <main class="quest-tracker__main">
      <div v-if="selectedDetail" class="quest-detail">
        <header class="quest-detail__header">
          <div class="quest-detail__title">
            <template v-if="editingBlueprintTitle">
              <form class="quest-title-edit-form" @submit.prevent="submitBlueprintTitleEdit">
                <input
                  ref="blueprintTitleInputRef"
                  v-model="blueprintTitleDraft"
                  class="input quest-title-edit-form__input"
                  type="text"
                  maxlength="120"
                  :disabled="renamingBlueprintTitle"
                  placeholder="Quest blueprint title"
                  @keydown.esc.prevent="cancelBlueprintTitleEdit"
                />
                <button class="btn btn--primary btn--tiny" type="submit" :disabled="renamingBlueprintTitle">
                  {{ renamingBlueprintTitle ? 'Saving…' : 'Save' }}
                </button>
                <button
                  class="btn btn--ghost btn--tiny"
                  type="button"
                  :disabled="renamingBlueprintTitle"
                  @click="cancelBlueprintTitleEdit"
                >
                  Cancel
                </button>
              </form>
            </template>
            <template v-else>
              <div class="quest-detail__title-display">
                <h2>{{ selectedDetail.blueprint.title }}</h2>
                <button
                  v-if="canRenameBlueprint"
                  class="btn btn--ghost btn--tiny quest-title__edit-btn"
                  type="button"
                  @click="startBlueprintTitleEdit"
                  title="Rename blueprint"
                >
                  ✎
                </button>
              </div>
            </template>
          </div>
          <div class="quest-detail__toolbar">
            <div class="quest-detail__tracking">
              <div v-if="displayAssignmentCharacter" class="quest-character-pill">
                <div class="quest-character-pill__icon">
                  <img
                    v-if="getCharacterClassIcon(displayAssignmentCharacter.class)"
                    :src="getCharacterClassIcon(displayAssignmentCharacter.class) || undefined"
                    :alt="characterClassLabels[displayAssignmentCharacter.class] || 'Class icon'"
                  />
                  <span v-else>{{ displayAssignmentCharacter.class?.[0] ?? '?' }}</span>
                </div>
                <div class="quest-character-pill__meta">
                  <span class="quest-character-pill__label">
                    {{ isViewingGuildAssignment ? 'Viewing' : 'Tracking as' }}
                  </span>
                  <template v-if="hasMultipleViewerAssignments && !isViewingGuildAssignment">
                    <select
                      id="viewer-character-select"
                      class="quest-character-select"
                      v-model="selectedAssignmentId"
                      aria-label="Select character to view progress"
                    >
                      <option v-for="option in viewerAssignmentOptions" :key="option.id" :value="option.id">
                        {{ option.label }}
                      </option>
                    </select>
                  </template>
                  <template v-else>
                    <strong>{{ displayAssignmentCharacter.name }}</strong>
                  </template>
                  <span v-if="!hasMultipleViewerAssignments" class="quest-character-pill__class">
                    {{ characterClassLabels[displayAssignmentCharacter.class] ?? displayAssignmentCharacter.class }}
                  </span>
                </div>
              </div>
              <div v-if="focusedGuildAssignmentLabel" class="quest-detail__viewing-note">
                Viewing progress for {{ focusedGuildAssignmentLabel }}.
                <button class="btn btn--ghost btn--tiny" type="button" @click="clearGuildAssignmentFocus">
                  View my quest
                </button>
              </div>
            </div>
            <div class="quest-tabs quest-detail__tabs">
              <button
                v-for="tab in availableTabs"
                :key="tab.key"
                :class="[
                  'quest-tabs__button',
                  { 'quest-tabs__button--active': activeTab === tab.key, 'quest-tabs__button--disabled': tab.disabled }
                ]"
                type="button"
                :disabled="tab.disabled"
                @click="setTab(tab.key)"
              >
                {{ tab.label }}
              </button>
            </div>
            <div class="quest-detail__actions">
              <button
                v-if="viewerAssignment"
                class="btn btn--outline btn--small quest-share-btn"
                type="button"
                @click="copyQuestShareLink"
                title="Copy share link"
              >
                <svg class="quest-share-btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M13 7a3 3 0 11-1.146 5.77L8.91 14.243a3 3 0 11-.764-.764l2.973-1.473A3 3 0 0113 7zm-6 4a1 1 0 100 2 1 1 0 000-2zm6-6a1 1 0 100 2 1 1 0 000-2z"
                    fill="currentColor"
                  />
                  <path
                    d="M11.854 12.146a.5.5 0 010 .708l-3 3a.5.5 0 01-.708-.708l3-3a.5.5 0 01.708 0z"
                    fill="currentColor"
                  />
                </svg>
                Share
              </button>
              <template v-if="!isViewingGuildAssignment">
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
                  v-if="!charactersLoaded || hasEligibleCharacters"
                  class="btn btn--start"
                  type="button"
                  :disabled="assignmentUpdating"
                  @click="startAssignment"
                >
                  {{ assignmentUpdating ? 'Starting…' : 'Start Quest' }}
                </button>
                <p v-else class="quest-detail__hint muted">
                  {{
                    viewerAssignments.length
                      ? 'All of your characters are already tracking this quest.'
                      : 'Add a guild character to start tracking this quest.'
                  }}
                </p>
              </template>
              <div v-else class="quest-detail__hint quest-detail__hint--inline">
                Viewing another guild member's progress. Switch back to your quest to make updates.
              </div>
            </div>
          </div>
        </header>

        <section
          v-if="isCanvasView"
          class="quest-panel quest-panel--canvas"
          :class="{ 'quest-panel--guild': isGuildView }"
        >
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
                  :stroke="link.branchColor"
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
                  @contextmenu="openLinkMenu(link, $event)"
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
                :class="[
                  'quest-node',
                  {
                    'quest-node--completed':
                      (!showOverviewDisabledState || !isNodeDisabled(node.id)) && isNodeCompleted(node.id),
                    'quest-node--disabled': showOverviewDisabledState && isNodeDisabled(node.id),
                    'quest-node--final': isNodeFinal(node.id),
                    'quest-node--group': node.isGroup,
                    'quest-node--guild-active': isGuildView && guildIconNodeIds.has(node.id)
                  }
                ]"
                :style="nodeStyle(node, false, 'viewer')"
                @click.stop="handleViewerCanvasNodeClick(node, $event)"
                @contextmenu.prevent.stop="openNodeMenu(node, $event)"
                :data-node-id="node.id"
              >
                <header class="quest-node__header">
                  <span class="quest-node__type" :style="typeAccent(node)">
                    {{ displayNodeType(node.nodeType, node.isGroup) }}
                  </span>
                  <span v-if="node.isOptional" class="quest-node__badge quest-node__badge--optional">Optional</span>
                  <span
                    v-if="showOverviewDisabledState && isNodeDisabled(node.id)"
                    class="quest-node__badge quest-node__badge--disabled"
                  >
                    Disabled
                  </span>
                  <img
                    v-else-if="isNodeFinal(node.id)"
                    class="quest-node__icon quest-node__icon--final"
                    src="/icons/checkered-flag.svg"
                    alt="Final step"
                    title="End of Quest"
                  />
                  <span
                    v-if="!isGuildView && viewerNodeStatus(node.id) !== 'NOT_STARTED'"
                    class="quest-node__status"
                    :class="statusClass(viewerNodeStatus(node.id))"
                  >
                    {{ nodeProgressStatusLabels[viewerNodeStatus(node.id)] ?? 'Not Started' }}
                  </span>
                </header>
                <h3>{{ node.title }}</h3>
                <p v-if="targetOrItemLabel(node) || hasNodeItemIds(node)" class="quest-node__target">
                  Target / Item:
                  <template v-if="hasNodeItemIds(node)">
                    <template v-for="(itemLink, idx) in getNodeItemLinks(node)" :key="itemLink.itemId">
                      <span v-if="idx > 0">, </span>
                      <a
                        :href="itemLink.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="quest-node__item-link"
                        @click.stop
                        @mouseenter="showItemTooltip($event, itemLink)"
                        @mouseleave="hideItemTooltip"
                        @mousemove="handleItemLinkMouseMove"
                      >{{ itemLink.label }}</a>
                    </template>
                  </template>
                  <template v-else>{{ targetOrItemLabel(node) }}</template>
                </p>
                <p v-if="zoneLabel(node)" class="quest-node__zone">Zone: {{ zoneLabel(node) }}</p>
                <p v-if="nodeLinkEntries(node.id, 'previous').length" class="quest-node__relations">
                  <span class="quest-node__relations-label">Requires</span>
                  <span class="quest-node__relations-list">
                    <button
                      v-for="link in nodeLinkEntries(node.id, 'previous')"
                      :key="`requires-${node.id}-${link.id}`"
                      type="button"
                      class="quest-node__relations-link"
                      @click.stop="navigateToBlueprint(link.id)"
                    >
                      {{ link.title }}
                      <span v-if="link.isArchived" class="quest-node__relations-tag">Archived</span>
                    </button>
                  </span>
                </p>
                <p
                  v-if="nodeLinkEntries(node.id, 'next').length"
                  class="quest-node__relations quest-node__relations--next"
                >
                  <span class="quest-node__relations-label">Unlocks</span>
                  <span class="quest-node__relations-list">
                    <button
                      v-for="link in nodeLinkEntries(node.id, 'next')"
                      :key="`unlocks-${node.id}-${link.id}`"
                      type="button"
                      class="quest-node__relations-link"
                      @click.stop="navigateToBlueprint(link.id)"
                    >
                      {{ link.title }}
                      <span v-if="link.isArchived" class="quest-node__relations-tag">Archived</span>
                    </button>
                  </span>
                </p>
                <div v-if="node.isGroup && canvasAssignment" class="quest-node__group-tally">
                  {{ formatGroupProgress(node.id, canvasAssignment?.progress, 'viewer') }}
                </div>
                <div
                  v-if="isGuildView && guildPinsForNode(node.id).length"
                  class="quest-node__badges"
                  :class="{ 'quest-node__badges--intro': showGuildIntroHighlight }"
                >
                  <button
                    v-for="pin in visibleGuildPins(node.id)"
                    :key="`${pin.assignmentId}-${pin.characterName}`"
                    type="button"
                    class="quest-node-badge"
                    :title="pin.tooltip"
                    :aria-label="`View ${pin.characterName}`"
                    @click.stop="handleGuildAssignmentClick(pin.assignmentId)"
                  >
                    <img v-if="pin.icon" :src="pin.icon || undefined" :alt="pin.classLabel" />
                    <span v-else>{{ pin.fallback }}</span>
                  </button>
                  <span
                    v-if="guildPinOverflowCount(node.id) > 0"
                    class="quest-node-badge quest-node-badge--more"
                    :title="`${guildPinOverflowCount(node.id)} more characters`"
                    role="button"
                    tabindex="0"
                    @click.stop="openGuildPinModal(node.id)"
                    @keydown.enter.stop.prevent="openGuildPinModal(node.id)"
                    @keydown.space.stop.prevent="openGuildPinModal(node.id)"
                  >
                    +
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="!isGuildView && viewerAssignment" class="quest-overview__footer">
            <p class="quest-overview__hint">Right-click any quest step to update its status.</p>
            <div class="quest-overview__legend">
              <img
                class="quest-overview__legend-icon"
                src="/icons/checkered-flag.svg"
                alt=""
                aria-hidden="true"
              />
              <span class="quest-overview__legend-label">Quest Complete</span>
            </div>
          </div>
          <div v-else-if="isGuildView" class="quest-guild-legend">
            <p class="quest-guild-legend__hint">
              Hover a class icon to see who owns it, then click to jump into their progress on the overview canvas.
            </p>
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
                    :stroke="link.branchColor"
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
                    @contextmenu="openLinkMenu(link, $event)"
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
                <div v-if="gridOverlayVisible" class="quest-grid-overlay" aria-hidden="true">
                  <div
                    v-for="x in gridLinePositions.vertical"
                    :key="`grid-x-${x}`"
                    :class="[
                      'quest-grid-line',
                      'quest-grid-line--vertical',
                      { 'quest-grid-line--highlight': isGridLineHighlighted(x, dragGridOverlay.highlightX) }
                    ]"
                    :style="verticalGridLineStyle(x)"
                  ></div>
                  <div
                    v-for="y in gridLinePositions.horizontal"
                    :key="`grid-y-${y}`"
                    :class="[
                      'quest-grid-line',
                      'quest-grid-line--horizontal',
                      { 'quest-grid-line--highlight': isGridLineHighlighted(y, dragGridOverlay.highlightY) }
                    ]"
                    :style="horizontalGridLineStyle(y)"
                  ></div>
                  <div
                    v-for="edgeX in gridEdgeLinePositions"
                    :key="`grid-edge-${edgeX}`"
                    class="quest-grid-line quest-grid-line--vertical quest-grid-line--edge"
                    :style="edgeGridLineStyle(edgeX)"
                  ></div>
                </div>
                <div v-if="alignmentGuidesVisible" class="quest-alignment-guides" aria-hidden="true">
                  <div
                    v-for="guide in alignmentGuides.horizontals"
                    :key="`guide-h-${guide.y}-${guide.intensity}`"
                    class="quest-alignment-line quest-alignment-line--horizontal"
                    :style="alignmentHorizontalStyle(guide)"
                  ></div>
                  <div
                    v-for="guide in alignmentGuides.verticals"
                    :key="`guide-v-${guide.edge}-${guide.x}-${guide.intensity}`"
                    class="quest-alignment-line quest-alignment-line--vertical"
                    :style="alignmentVerticalStyle(guide)"
                  ></div>
                </div>
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
                    @contextmenu.prevent.stop="openLinkMenu(link, $event)"
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
                      'quest-node--selected': isNodeSelected(node.id),
                      'quest-node--completed': isNodeCompleted(node.id),
                      'quest-node--final': isNodeFinal(node.id),
                      'quest-node--group': node.isGroup
                    }
                  ]"
                  :style="nodeStyle(node, true, 'editor')"
                  @pointerdown.stop="handleNodePointerDown(node, $event)"
                  @click.stop="handleNodeClick(node, $event)"
                  @dblclick.stop="handleNodeDoubleClick(node.id)"
                  @contextmenu.prevent.stop="openNodeMenu(node, $event)"
                  :data-node-id="node.id"
                >
                  <header class="quest-node__header">
                    <span class="quest-node__type" :style="typeAccent(node)">
                      {{ displayNodeType(node.nodeType, node.isGroup) }}
                    </span>
                    <span v-if="node.isOptional" class="quest-node__badge quest-node__badge--optional">Optional</span>
                  <span class="quest-node__handle" title="Drag to move">⇲</span>
                </header>
                  <h3>{{ node.title }}</h3>
                <p v-if="targetOrItemLabel(node) || hasNodeItemIds(node)" class="quest-node__target">
                  Target / Item:
                  <template v-if="hasNodeItemIds(node)">
                    <template v-for="(itemLink, idx) in getNodeItemLinks(node)" :key="itemLink.itemId">
                      <span v-if="idx > 0">, </span>
                      <a
                        :href="itemLink.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="quest-node__item-link"
                        @click.stop
                        @mouseenter="showItemTooltip($event, itemLink)"
                        @mouseleave="hideItemTooltip"
                        @mousemove="handleItemLinkMouseMove"
                      >{{ itemLink.label }}</a>
                    </template>
                  </template>
                  <template v-else>{{ targetOrItemLabel(node) }}</template>
                </p>
                <p v-if="zoneLabel(node)" class="quest-node__zone">Zone: {{ zoneLabel(node) }}</p>
                <p v-if="nodeLinkEntries(node.id, 'previous').length" class="quest-node__relations">
                  <span class="quest-node__relations-label">Requires</span>
                  <span class="quest-node__relations-list">
                    <button
                      v-for="link in nodeLinkEntries(node.id, 'previous')"
                      :key="`editor-requires-${node.id}-${link.id}`"
                      type="button"
                      class="quest-node__relations-link"
                      @click.stop="navigateToBlueprint(link.id)"
                    >
                      {{ link.title }}
                      <span v-if="link.isArchived" class="quest-node__relations-tag">Archived</span>
                    </button>
                  </span>
                </p>
                <p
                  v-if="nodeLinkEntries(node.id, 'next').length"
                  class="quest-node__relations quest-node__relations--next"
                >
                  <span class="quest-node__relations-label">Unlocks</span>
                  <span class="quest-node__relations-list">
                    <button
                      v-for="link in nodeLinkEntries(node.id, 'next')"
                      :key="`editor-unlocks-${node.id}-${link.id}`"
                      type="button"
                      class="quest-node__relations-link"
                      @click.stop="navigateToBlueprint(link.id)"
                    >
                      {{ link.title }}
                      <span v-if="link.isArchived" class="quest-node__relations-tag">Archived</span>
                    </button>
                  </span>
                </p>
                <img
                  v-if="isNodeFinal(node.id)"
                  class="quest-node__flag-icon quest-node__flag-icon--inline"
                  src="/icons/checkered-flag.svg"
                  alt="Final step"
                  title="Final objective"
                />
                <div v-if="node.isGroup" class="quest-node__group-tally">
                  {{ formatGroupProgress(node.id, undefined, 'editor') }}
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
                <input type="checkbox" v-model="selectedNode.isGroup" @change="markDirty()" />
                <span>Group node (auto completes when child steps finish)</span>
              </label>
      <label class="switch switch--inline">
        <input
          type="checkbox"
          :checked="readNodeFlag(selectedNode, 'isFinal')"
          @change="toggleFinalFlag"
        />
        <span>Final step (completing this finishes the quest)</span>
      </label>
      <label class="switch switch--inline">
        <input type="checkbox" v-model="selectedNode.isOptional" @change="markDirty()" />
        <span>Optional step (does not impact quest completion)</span>
      </label>
      <div class="quest-link-field">
        <div class="quest-link-field__header">
          <label class="form-label">Previous quests</label>
          <p class="quest-link-field__hint">
            Link quests that must finish before this objective becomes available.
          </p>
        </div>
        <div class="quest-link-selector">
          <select v-model="blueprintLinkSelections.previous" class="input">
            <option value="">Select blueprint…</option>
            <option
              v-for="option in blueprintLinkOptions"
              :key="`previous-option-${option.id}`"
              :value="option.id"
              :disabled="selectedNodeLinkEntries.previous.some((entry) => entry.id === option.id)"
            >
              {{ option.title }}<span v-if="option.isArchived"> (Archived)</span>
            </option>
          </select>
          <button
            class="btn btn--small"
            type="button"
            :disabled="!canAddBlueprintLink('previous')"
            @click="addBlueprintLink('previous')"
          >
            Link
          </button>
        </div>
        <p v-if="!selectedNodeLinkEntries.previous.length" class="muted x-small">
          No previous quests linked.
        </p>
        <ul v-else class="quest-link-chip-list">
          <li v-for="link in selectedNodeLinkEntries.previous" :key="`prev-link-${link.id}`" class="quest-link-chip">
            <span class="quest-link-chip__title">{{ link.title }}</span>
            <span v-if="link.isArchived" class="quest-link-chip__meta">Archived</span>
            <button
              class="quest-link-chip__remove"
              type="button"
              @click="removeBlueprintLink('previous', link.id)"
              aria-label="Remove previous quest link"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
      <div v-if="readNodeFlag(selectedNode, 'isFinal')" class="quest-link-field">
        <div class="quest-link-field__header">
          <label class="form-label">Next quests</label>
          <p class="quest-link-field__hint">
            Add quests that unlock when this objective is completed.
          </p>
        </div>
        <div class="quest-link-selector">
          <select v-model="blueprintLinkSelections.next" class="input">
            <option value="">Select blueprint…</option>
            <option
              v-for="option in blueprintLinkOptions"
              :key="`next-option-${option.id}`"
              :value="option.id"
              :disabled="selectedNodeLinkEntries.next.some((entry) => entry.id === option.id)"
            >
              {{ option.title }}<span v-if="option.isArchived"> (Archived)</span>
            </option>
          </select>
          <button
            class="btn btn--small"
            type="button"
            :disabled="!canAddBlueprintLink('next')"
            @click="addBlueprintLink('next')"
          >
            Link
          </button>
        </div>
        <p v-if="!selectedNodeLinkEntries.next.length" class="muted x-small">
          No follow-up quests linked.
        </p>
        <ul v-else class="quest-link-chip-list">
          <li v-for="link in selectedNodeLinkEntries.next" :key="`next-link-${link.id}`" class="quest-link-chip">
            <span class="quest-link-chip__title">{{ link.title }}</span>
            <span v-if="link.isArchived" class="quest-link-chip__meta">Archived</span>
            <button
              class="quest-link-chip__remove"
              type="button"
              @click="removeBlueprintLink('next', link.id)"
              aria-label="Remove next quest link"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
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
              <input v-model="selectedNodeTargetField" type="text" class="input" />
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

        <div class="quest-export-toolbar">
          <div class="quest-export-toolbar__buttons">
            <button class="btn btn--tiny btn--wiki-export" type="button" @click="openBlueprintWikiModal">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M4 4h12v12H8l-4 4z"
                  stroke="currentColor"
                  stroke-width="1.2"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M7 9l2.5 3L14 8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <span>Wiki</span>
            </button>
            <button
              v-if="isAdmin"
              class="btn btn--tiny btn--json-export"
              type="button"
              @click="openBlueprintJsonModal"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 2v12m0 0l-3.5-3.5M10 14l3.5-3.5M4 18h12"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <span>JSON</span>
            </button>
          </div>
        </div>

      </div>

      <div v-else class="quest-empty">
        <p>Select a quest blueprint to begin or create a new one.</p>
      </div>
    </main>
    <transition name="quest-loading-fade">
      <div v-if="showLoadingOverlay" class="quest-loading-overlay" aria-live="polite">
        <div class="quest-loading__inner">
          <span class="quest-loading__spinner" role="status" aria-label="Refreshing quest data"></span>
          <p>{{ loadingOverlayMessage }}</p>
        </div>
      </div>
    </transition>
  </section>

  <div v-else-if="summaryError" class="quest-loading quest-loading--fullscreen">
    <div class="quest-loading__inner">
      <p class="quest-loading__error">{{ summaryError }}</p>
      <button
        class="btn btn--secondary"
        type="button"
        :disabled="loadingSummary"
        @click="retryLoadSummary"
      >
        {{ loadingSummary ? 'Retrying…' : 'Try again' }}
      </button>
    </div>
  </div>

  <GlobalLoadingSpinner v-else-if="showLoading" />

<div v-if="showCreateModal" class="quest-modal">
  <div class="quest-modal__content">
      <header class="quest-modal__header">
        <div class="quest-modal__title">
          <h3>New Quest Blueprint</h3>
          <button
            v-if="isAdmin"
            class="btn btn--ghost btn--tiny"
            type="button"
            @click="openTaskImportModal"
          >
            Import EQ Task
          </button>
        </div>
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

<div v-if="showTaskImportModal" class="quest-modal">
  <div class="quest-modal__content quest-modal__content--wide">
    <header class="quest-modal__header">
      <h3>Import EQ Task</h3>
      <button class="btn btn--icon" type="button" @click="closeTaskImportModal">×</button>
    </header>
    <p class="quest-modal__hint">
      Search the EQEmu task table and import objectives as a quest blueprint. Requires an EQ content database connection.
    </p>
    <div class="task-import__controls">
      <input
        v-model="eqTaskSearch.query"
        type="search"
        class="input"
        placeholder="Search by task title or ID"
        @keyup.enter="loadEqTasks()"
      />
      <button class="btn btn--secondary" type="button" :disabled="eqTaskLoading" @click="loadEqTasks()">
        {{ eqTaskLoading ? 'Searching…' : 'Search' }}
      </button>
    </div>
    <p v-if="eqTaskError" class="quest-modal__error">{{ eqTaskError }}</p>
    <div v-if="eqTaskLoading" class="task-import__results">
      <p>Searching tasks…</p>
    </div>
    <div v-else class="task-import__results-wrapper">
      <div v-if="eqTaskTotalPages > 1" class="task-import__pagination task-import__pagination--top">
        <button
          class="btn btn--tiny"
          type="button"
          :disabled="eqTaskSearch.page === 1 || eqTaskLoading"
          @click="changeEqTaskPage(eqTaskSearch.page - 1)"
        >
          Previous
        </button>
        <span class="task-import__page-info">
          Page {{ eqTaskSearch.page }} of {{ eqTaskTotalPages }}
        </span>
        <button
          class="btn btn--tiny"
          type="button"
          :disabled="eqTaskSearch.page === eqTaskTotalPages || eqTaskLoading"
          @click="changeEqTaskPage(eqTaskSearch.page + 1)"
        >
          Next
        </button>
      </div>
      <div class="task-import__results">
        <div v-if="!eqTaskResults.length" class="quest-blueprint-empty">No tasks found.</div>
        <table v-else class="task-import__table">
          <thead>
            <tr>
              <th>ID</th>
            <th>Title</th>
            <th>Level</th>
            <th>Repeatable</th>
            <th>Type</th>
            <th>Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in eqTaskResults" :key="task.id">
            <td>{{ task.id }}</td>
              <td>
                <div class="task-import__title">
                  <strong>{{ task.title }}</strong>
                </div>
              </td>
            <td>
              <span v-if="task.minLevel || task.maxLevel">
                {{ task.minLevel ?? '?' }}-{{ task.maxLevel ?? '?' }}
              </span>
              <span v-else class="muted">Any</span>
            </td>
            <td>{{ task.repeatable ? 'Yes' : 'No' }}</td>
            <td>{{ task.type ?? '—' }}</td>
            <td>
              <span v-if="task.duration">{{ task.duration }}s</span>
              <span v-else class="muted">—</span>
            </td>
            <td class="task-import__actions">
              <button
                class="btn btn--primary btn--tiny"
                type="button"
                :disabled="importingTaskId === task.id"
                @click="importEqTask(task.id)"
              >
                {{ importingTaskId === task.id ? 'Importing…' : 'Import' }}
              </button>
            </td>
          </tr>
        </tbody>
          </table>
      </div>
    </div>
  </div>
</div>

<div v-if="showGuildPinModal" class="quest-modal">
  <div class="quest-modal__content quest-character-modal">
    <header>
      <h3>Characters on {{ guildPinModalNode?.title ?? 'Step' }}</h3>
      <button class="btn btn--icon" type="button" @click="closeGuildPinModal">×</button>
    </header>
    <div class="quest-character-list">
      <button
        v-for="pin in guildPinModalVisiblePins"
        :key="pin.assignmentId"
        type="button"
        class="quest-character-button quest-character-button--link"
        @click="handleGuildAssignmentClick(pin.assignmentId)"
      >
        <span class="quest-character-button__icon">
          <img v-if="pin.icon" :src="pin.icon || undefined" :alt="pin.classLabel" />
          <span v-else>{{ pin.fallback }}</span>
        </span>
        <div class="quest-character-button__details">
          <span class="quest-character-button__title">{{ pin.characterName }}</span>
          <span class="quest-character-button__meta">{{ pin.classLabel }}</span>
        </div>
      </button>
      <div v-if="guildPinModalTotalPages > 1" class="quest-character-modal__pagination">
        <button
          class="btn btn--tiny"
          type="button"
          :disabled="guildPinModalPage === 1"
          @click="prevGuildPinPage"
        >
          Previous
        </button>
        <span class="quest-character-modal__pagination-info">
          Page {{ guildPinModalPage }} of {{ guildPinModalTotalPages }}
        </span>
        <button
          class="btn btn--tiny"
          type="button"
          :disabled="guildPinModalPage === guildPinModalTotalPages"
          @click="nextGuildPinPage"
        >
          Next
        </button>
      </div>
    </div>
    <div class="quest-modal__actions">
      <button class="btn btn--secondary" type="button" @click="closeGuildPinModal">Close</button>
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

  <div v-if="showCharacterModal" class="quest-modal">
    <div class="quest-modal__content quest-character-modal">
      <header>
        <h3>Select Character</h3>
        <button class="btn btn--icon" type="button" @click="closeCharacterModal">×</button>
      </header>
      <p class="muted small">Choose which character will run this quest.</p>
      <div v-if="characterModalLoading" class="quest-character-modal__loading">Loading characters…</div>
      <template v-else>
        <p v-if="characterModalError" class="quest-character-modal__error">{{ characterModalError }}</p>
        <ul v-if="hasEligibleCharacters" class="quest-character-list">
          <li v-for="character in visibleEligibleCharacters" :key="character.id">
            <button
              class="quest-character-button"
              type="button"
              :disabled="assignmentUpdating"
              @click="startAssignmentWithCharacter(character.id)"
            >
              <div class="quest-character-button__icon">
                <img
                  v-if="getCharacterClassIcon(character.class)"
                  :src="getCharacterClassIcon(character.class) || undefined"
                  :alt="characterClassLabels[character.class]"
                />
                <span v-else>{{ character.class[0] }}</span>
              </div>
              <div class="quest-character-button__details">
                <div class="quest-character-button__title">
                  <strong>{{ character.name }}</strong>
                  <span v-if="character.isMain" class="badge badge--main">Main</span>
                </div>
                <span class="quest-character-button__meta">
                  {{ characterClassLabels[character.class] }} &middot; Level {{ character.level }}
                </span>
              </div>
            </button>
          </li>
        </ul>
        <div v-if="characterModalTotalPages > 1" class="quest-character-modal__pagination">
          <button
            class="btn btn--tiny"
            type="button"
            :disabled="characterModalPage === 1"
            @click="prevCharacterModalPage"
          >
            Previous
          </button>
          <span class="quest-character-modal__pagination-info">
            Page {{ characterModalPage }} of {{ characterModalTotalPages }}
          </span>
          <button
            class="btn btn--tiny"
            type="button"
            :disabled="characterModalPage === characterModalTotalPages"
            @click="nextCharacterModalPage"
          >
            Next
          </button>
        </div>
        <p v-else-if="!hasEligibleCharacters" class="quest-character-modal__empty">
          No eligible guild characters are available. Finish an existing run or add another character to start this quest.
        </p>
      </template>
      <p v-if="characterStartError" class="quest-character-modal__error">{{ characterStartError }}</p>
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

  <div v-if="showBlueprintJsonModal" class="quest-modal">
    <div class="quest-modal__content quest-modal__content--wide">
      <header>
        <h3>Blueprint JSON Export</h3>
        <button class="btn btn--icon" type="button" @click="closeBlueprintJsonModal">×</button>
      </header>
      <p class="muted small">Copy this JSON to share or archive the current blueprint structure.</p>
      <pre class="quest-json-export" tabindex="0">{{ blueprintJsonText }}</pre>
      <div class="quest-modal__actions">
        <button class="btn btn--secondary" type="button" @click="copyBlueprintJson">
          {{ blueprintJsonCopied ? 'Copied!' : 'Copy JSON' }}
        </button>
        <button class="btn btn--primary" type="button" @click="closeBlueprintJsonModal">Close</button>
      </div>
    </div>
  </div>

  <div v-if="showBlueprintWikiModal" class="quest-modal">
    <div class="quest-modal__content quest-modal__content--wide">
      <header>
        <h3>MediaWiki Export</h3>
        <button class="btn btn--icon" type="button" @click="closeBlueprintWikiModal">×</button>
      </header>
      <p class="muted small">Copy this markup into MediaWiki to share the quest structure.</p>
      <pre class="quest-json-export" tabindex="0">{{ blueprintWikiText }}</pre>
      <div class="quest-modal__actions">
        <button class="btn btn--secondary" type="button" @click="copyBlueprintWiki">
          {{ blueprintWikiCopied ? 'Copied!' : 'Copy markup' }}
        </button>
        <button class="btn btn--primary" type="button" @click="closeBlueprintWikiModal">Close</button>
      </div>
    </div>
  </div>

  <ul
    v-if="contextMenu.visible"
    class="quest-context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <template v-if="contextMenu.type === 'canvas'">
      <li v-if="activeTab === 'editor'" @click="handleCanvasAddNode">Add step</li>
      <li v-if="activeTab === 'editor'" @click="handleOpenBlueprintSettings">Blueprint settings…</li>
      <li @click="handleResetViewFromMenu">Reset view</li>
    </template>
    <template v-else-if="contextMenu.type === 'editor-node'">
      <template v-if="hasMultiSelection">
        <li class="quest-context-menu__submenu">
          <span>Align</span>
          <span class="quest-context-menu__submenu-caret" aria-hidden="true">›</span>
          <ul class="quest-context-menu__submenu-list">
            <li @click.stop="handleAlignSelection('left')">Left</li>
            <li @click.stop="handleAlignSelection('right')">Right</li>
            <li @click.stop="handleAlignSelection('top')">Top</li>
            <li @click.stop="handleAlignSelection('bottom')">Bottom</li>
          </ul>
        </li>
        <li
          :class="['quest-context-menu__submenu', { disabled: !canDistributeSelection }]"
        >
          <span>Distribute</span>
          <span class="quest-context-menu__submenu-caret" aria-hidden="true">›</span>
          <ul class="quest-context-menu__submenu-list">
            <li
              :class="{ disabled: !canDistributeSelection }"
              @click.stop="handleDistributeSelection('horizontal')"
            >
              Horizontally
            </li>
            <li
              :class="{ disabled: !canDistributeSelection }"
              @click.stop="handleDistributeSelection('vertical')"
            >
              Vertically
            </li>
            <li
              :class="{ disabled: !canDistributeSelection }"
              @click.stop="handleDistributeSelection('grid')"
            >
              Grid
            </li>
          </ul>
        </li>
        <li class="danger" @click="handleDeleteNodeFromMenu">
          Delete {{ selectedNodeCount }} selected {{ selectedNodeCount === 1 ? 'step' : 'steps' }}
        </li>
      </template>
      <template v-else>
        <li @click="handleAddChildFromMenu">Add child step</li>
        <li @click="handleEditNodeFromMenu">Edit step settings</li>
        <li @click="handleDuplicateNodeFromMenu">Duplicate step</li>
        <li @click="handleToggleFinalFromMenu">
          {{ contextMenuNodeFinal ? 'Clear final flag' : 'Mark as final step' }}
        </li>
        <li class="danger" @click="handleDeleteNodeFromMenu">Delete step</li>
      </template>
    </template>
    <template v-else-if="contextMenu.type === 'viewer-node'">
      <template v-if="contextMenuNodeDisabled">
        <li v-if="canUpdateNodeProgress" @click="handleEnableNodeFromMenu">Enable step (and descendants)</li>
        <li v-else class="disabled">Step disabled</li>
      </template>
      <template v-else>
        <li
          v-for="status in nodeStatuses"
          :key="status"
          :class="['quest-context-menu__status', viewerStatusMenuClass(status), { disabled: progressUpdating }]"
          @click="handleViewerStatusChange(status)"
        >
          <span class="quest-context-menu__status-dot" aria-hidden="true"></span>
          <span class="quest-context-menu__status-label">
            Mark {{ nodeProgressStatusLabels[status] }}
          </span>
        </li>
        <li v-if="canUpdateNodeProgress" @click="handleDisableNodeFromMenu">Disable step (and descendants)</li>
      </template>
    </template>
    <template v-else-if="contextMenu.type === 'editor-link'">
      <li
        v-if="contextMenuLink && contextMenuLinkIsNextStep"
        @click="handleLinkNextStepToggle(false)"
      >
        Remove next step
      </li>
      <li
        v-else-if="contextMenuLink"
        @click="handleLinkNextStepToggle(true)"
      >
        Set next step
      </li>
      <li v-else class="disabled">Link unavailable</li>
    </template>
  </ul>
  <ul
    v-if="blueprintContextMenu.visible"
    class="quest-context-menu"
    :style="{ top: `${blueprintContextMenu.y}px`, left: `${blueprintContextMenu.x}px` }"
    @click.stop
  >
    <li v-if="blueprintContextMenuBlueprint?.folderId" @click="handleRemoveBlueprintFromFolder">
      Remove from folder
    </li>
    <li
      class="danger"
      :class="{ disabled: deletingBlueprintId === blueprintContextMenu.blueprintId }"
      @click="handleDeleteBlueprint"
    >
      Delete blueprint
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { useAuthStore } from '../stores/auth';
import { useItemTooltipStore } from '../stores/itemTooltip';

import {
  api,
  type QuestAssignment,
  type QuestBlueprintDetailPayload,
  type QuestBlueprintFolderType,
  type QuestBlueprintSummaryLite,
  type QuestLinkInputPayload,
  type QuestNodeInputPayload,
  type QuestNodeViewModel,
  type QuestNodeLinkViewModel,
  type QuestNodeProgress,
  type QuestTrackerSummary,
  type EqTaskSummary,
  type UserCharacter
} from '../services/api';
import {
  QuestAssignmentStatus,
  QuestNodeProgressStatus,
  QuestNodeType,
  characterClassLabels,
  questNodeTypeColors,
  questNodeTypeLabels,
  getCharacterClassIcon
} from '../services/types';
import { extractErrorMessage } from '../utils/errors';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const tooltipStore = useItemTooltipStore();
const guildId = route.params.guildId as string;
const currentUserId = computed(() => authStore.user?.userId ?? null);
const isAdmin = computed(() => authStore.isAdmin);

type EditableNode = QuestNodeViewModel & {
  requirements: Record<string, any>;
  metadata: Record<string, any>;
};

const summary = ref<QuestTrackerSummary | null>(null);
const summaryError = ref<string | null>(null);
const detail = ref<QuestBlueprintDetailPayload | null>(null);
const loadingSummary = ref(true);
const showLoading = useMinimumLoading(loadingSummary);
const loadingDetail = ref(false);
const savingGraph = ref(false);
const creatingBlueprint = ref(false);
const assignmentUpdating = ref(false);
const progressUpdating = ref(false);
const sidebarSearch = ref('');
const selectedBlueprintId = ref<string | null>(null);
const activeTab = ref<'overview' | 'editor' | 'guild'>('overview');
const isCanvasView = computed(() => activeTab.value === 'overview' || activeTab.value === 'guild');
const isGuildView = computed(() => activeTab.value === 'guild');
const showCreateModal = ref(false);
const showTaskImportModal = ref(false);
const eqTaskSearch = reactive({ query: '', page: 1, pageSize: 10 });
const eqTaskResults = ref<EqTaskSummary[]>([]);
const eqTaskTotal = ref(0);
const eqTaskLoading = ref(false);
const eqTaskError = ref<string | null>(null);
const importingTaskId = ref<number | null>(null);
const eqTaskTotalPages = computed(() =>
  Math.max(1, Math.ceil((eqTaskTotal.value || 0) / (eqTaskSearch.pageSize || 1)))
);
const metadataSaving = ref(false);
const lastSavedAt = ref<string | null>(null);
const lastSavedBy = ref<string>('Unknown member');
const saveToast = reactive({ visible: false, message: '' });

// Item name cache for quest node item links
const itemNameCache = reactive(new Map<number, string>());
const itemNameLoading = reactive(new Set<number>());

async function fetchItemName(itemId: number): Promise<string | null> {
  if (itemNameCache.has(itemId)) {
    return itemNameCache.get(itemId) ?? null;
  }
  if (itemNameLoading.has(itemId)) {
    return null;
  }
  itemNameLoading.add(itemId);
  try {
    const response = await api.fetchItemStats(itemId);
    if (response.item?.name) {
      itemNameCache.set(itemId, response.item.name);
      return response.item.name;
    }
  } catch {
    // Item not found or error - cache empty string to avoid re-fetching
    itemNameCache.set(itemId, '');
  } finally {
    itemNameLoading.delete(itemId);
  }
  return null;
}

function getItemNameFromCache(itemId: number): string | null {
  const cached = itemNameCache.get(itemId);
  if (cached !== undefined) {
    return cached || null;
  }
  // Trigger fetch if not in cache
  fetchItemName(itemId);
  return null;
}
const saveErrorModal = reactive({ open: false, message: '' });
const showStepSettings = ref(false);
const showBlueprintSettings = ref(false);
const editingBlueprintTitle = ref(false);
const blueprintTitleDraft = ref('');
const renamingBlueprintTitle = ref(false);
const blueprintTitleInputRef = ref<HTMLInputElement | null>(null);
const showCharacterModal = ref(false);
const characterOptions = ref<UserCharacter[]>([]);
const characterModalLoading = ref(false);
const characterModalError = ref<string | null>(null);
const characterStartError = ref<string | null>(null);
const charactersLoaded = ref(false);
const characterModalPage = ref(1);
const CHARACTER_MODAL_PAGE_SIZE = 10;
const selectedAssignmentId = ref<string | null>(null);
const showGuildPinModal = ref(false);
const guildPinModalNodeId = ref<string | null>(null);
const guildPinModalPage = ref(1);
const GUILD_PIN_MODAL_PAGE_SIZE = 10;
const showBlueprintJsonModal = ref(false);
const showBlueprintWikiModal = ref(false);
const blueprintJsonCopied = ref(false);
const blueprintWikiCopied = ref(false);

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
const BLUEPRINT_LINK_KEYS = {
  previous: 'previousBlueprintIds',
  next: 'nextBlueprintIds'
} as const;
type BlueprintLinkDirection = keyof typeof BLUEPRINT_LINK_KEYS;
const COMPLETED_ACCENT_COLOR = '#16a34a';
const DEFAULT_LINK_SHADOW = 'rgba(56, 189, 248, 0.35)';
const COMPLETED_LINK_SHADOW = 'rgba(34, 197, 94, 0.45)';
const DISABLED_LINK_SHADOW = 'rgba(71, 85, 105, 0.35)';
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
  isCompletedPath: boolean;
  isDisabledPath: boolean;
};
type NodeAdjacencyEntry = {
  nodeId: string;
  isNextStep: boolean;
  isOptional: boolean;
  isGroup: boolean;
};
const NODE_FACES: NodeFace[] = ['top', 'right', 'bottom', 'left'];
const FACE_NORMALS: Record<NodeFace, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};
const NEXT_STEP_CONDITION_KEY = '__isNextStep';

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
function isNextStepLink(link: { conditions?: Record<string, unknown> } | null | undefined): boolean {
  if (!link?.conditions) {
    return false;
  }
  return link.conditions[NEXT_STEP_CONDITION_KEY] === true;
}
const nodeDimensions = ref<Record<string, { width: number; height: number }>>({});
const nodeHeightOverrides = reactive(new Map<string, number>());
const nodeWidthOverrides = reactive(new Map<string, number>());
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
const isAltProgressMode = ref(false);
type ContextMenuType = 'canvas' | 'editor-node' | 'viewer-node' | 'editor-link';
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: 'canvas' as ContextMenuType,
  nodeId: null as string | null,
  linkId: null as string | null
});
const contextMenuNodeDisabled = computed(() =>
  contextMenu.nodeId ? isNodeDisabled(contextMenu.nodeId) : false
);
const contextMenuNodeFinal = computed(() =>
  contextMenu.nodeId ? isNodeFinal(contextMenu.nodeId) : false
);
const contextMenuLink = computed(() => {
  if (contextMenu.type !== 'editor-link' || !contextMenu.linkId) {
    return null;
  }
  return editableLinks.value.find((link) => link.id === contextMenu.linkId) ?? null;
});
const contextMenuLinkIsNextStep = computed(() => (contextMenuLink.value ? isNextStepLink(contextMenuLink.value) : false));

const newBlueprintForm = reactive({
  title: '',
  summary: ''
});

const blueprintMetaForm = reactive({
  title: '',
  summary: '',
  isArchived: false
});
const blueprintLinkSelections = reactive<{ previous: string; next: string }>({
  previous: '',
  next: ''
});

const permissions = computed(() => detail.value?.permissions ?? summary.value?.permissions ?? null);
const canManageBlueprints = computed(() => permissions.value?.canManageBlueprints ?? false);
const canEditBlueprint = computed(() => permissions.value?.canEditBlueprint ?? canManageBlueprints.value);
const guildNameDisplay = computed(() =>
  typeof route.query.guildName === 'string' ? route.query.guildName : 'Quest Tracker'
);
const blueprintContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  blueprintId: null as string | null
});
const deletingBlueprintId = ref<string | null>(null);
const blueprintReorderLoading = ref(false);
const folderReorderLoading = ref(false);
const draggingBlueprintId = ref<string | null>(null);
const dragOverFolderId = ref<string | null>(null);
const dragOverBlueprintId = ref<string | null>(null);
const folderListRef = ref<HTMLElement | null>(null);
const scrollTicker = ref<number | null>(null);
const scrollDirection = ref<'up' | 'down' | null>(null);
const dragScrollState = reactive<{ active: boolean; baseX: number; baseY: number; resetFrame: number | null }>({
  active: false,
  baseX: 0,
  baseY: 0,
  resetFrame: null
});
const globalDragOverHandler = (event: DragEvent) => {
  if (!draggingBlueprintId.value) {
    return;
  }
  event.preventDefault();
  scrollDirection.value = getScrollDirection(event);
};
const canDragBlueprints = computed(() => canManageBlueprints.value && !blueprintReorderLoading.value);
const blueprintContextMenuBlueprint = computed(() => {
  if (!blueprintContextMenu.blueprintId) {
    return null;
  }
  return summary.value?.blueprints?.find((entry) => entry.id === blueprintContextMenu.blueprintId) ?? null;
});

const blueprintFolders = computed(() => summary.value?.folders ?? []);
const orderedFolders = computed(() =>
  [...(blueprintFolders.value ?? [])].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.title.localeCompare(b.title);
  })
);
const canCreateFolders = computed(() => Boolean(permissions.value?.role));
const blueprintSections = computed(() => {
  const blueprints = summary.value?.blueprints ?? [];
  const folders = orderedFolders.value;
  const query = sidebarSearch.value.trim().toLowerCase();
  const includeEmpty = !query;
  const matches = !query
    ? blueprints
    : blueprints.filter((blueprint) => blueprint.title.toLowerCase().includes(query));
  const map = new Map<string | null, QuestBlueprintSummaryLite[]>();
  for (const blueprint of matches) {
    const key = blueprint.folderId ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(blueprint);
    map.set(key, bucket);
  }

  const sortBucket = (entries: QuestBlueprintSummaryLite[]) =>
    entries.sort((a, b) => {
      if (a.folderSortOrder !== b.folderSortOrder) {
        return a.folderSortOrder - b.folderSortOrder;
      }
      return a.title.localeCompare(b.title);
    });
  map.forEach((bucket) => sortBucket(bucket));

  const sections: Array<{
    id: string | null;
    title: string;
    iconKey: string | null;
    type: 'root' | QuestBlueprintFolderType;
    isSystem: boolean;
    blueprints: QuestBlueprintSummaryLite[];
    sortOrder: number;
  }> = [];

  const rootBlueprints = map.get(null) ?? [];
  if (includeEmpty || rootBlueprints.length) {
    sections.push({
      id: null,
      title: 'Unassigned',
      iconKey: null,
      type: 'root',
      isSystem: false,
      blueprints: rootBlueprints,
      sortOrder: 0
    });
  }

  const folderSections: typeof sections = [];
  for (const folder of folders) {
    const bucket = map.get(folder.id) ?? [];
    if (!includeEmpty && !bucket.length) {
      continue;
    }
    folderSections.push({
      id: folder.id,
      title: folder.title,
      iconKey: folder.iconKey,
      type: folder.type,
      isSystem: folder.type === 'CLASS',
      blueprints: bucket,
      sortOrder: folder.sortOrder
    });
  }

  folderSections.sort((a, b) => {
    const aHas = a.blueprints.length > 0;
    const bHas = b.blueprints.length > 0;
    if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.title.localeCompare(b.title);
  });

  return [...sections, ...folderSections];
});
const hasBlueprintMatches = computed(() =>
  blueprintSections.value.some((section) => section.blueprints.length)
);
const folderOrderIndex = (folderId: string) => orderedFolders.value.findIndex((entry) => entry.id === folderId);


const selectedDetail = computed(() => detail.value);
const membershipRole = computed(() => detail.value?.permissions?.role ?? summary.value?.permissions?.role ?? null);
const blueprintCreatorId = computed(() => detail.value?.blueprint.createdById ?? null);
const blueprintJsonText = computed(() => {
  if (!detail.value) {
    return '{}';
  }
  const payload = {
    blueprint: detail.value.blueprint,
    nodes: detail.value.nodes,
    links: detail.value.links
  };
  return JSON.stringify(payload, null, 2);
});
const blueprintWikiText = computed(() => {
  if (!detail.value) {
    return '';
  }
  return buildWikiMarkup(detail.value);
});
const canRenameBlueprint = computed(() => {
  if (!detail.value?.blueprint) {
    return false;
  }
  if (membershipRole.value === 'LEADER' || membershipRole.value === 'OFFICER') {
    return true;
  }
  const creatorId = blueprintCreatorId.value;
  if (!creatorId || !currentUserId.value) {
    return false;
  }
  return creatorId === currentUserId.value;
});
const guildAssignments = computed(() => detail.value?.guildAssignments ?? []);
const viewerAssignments = computed(() => detail.value?.viewerAssignments ?? []);
const viewerAssignmentOptions = computed(() =>
  viewerAssignments.value.map((assignment) => {
    const characterName = assignment.character?.name ?? 'Character';
    const classLabel = assignment.character?.class
      ? characterClassLabels[assignment.character.class] ?? assignment.character.class
      : null;
    return {
      id: assignment.id,
      label: classLabel ? `${characterName} (${classLabel})` : characterName
    };
  })
);
const hasMultipleViewerAssignments = computed(() => viewerAssignments.value.length > 1);
const activeViewerAssignment = computed(() => {
  if (!viewerAssignments.value.length) {
    return null;
  }
  if (selectedAssignmentId.value) {
    const match = viewerAssignments.value.find((assignment) => assignment.id === selectedAssignmentId.value);
    if (match) {
      return match;
    }
  }
  return viewerAssignments.value[0];
});
const pendingViewerCharacterId = ref<string | null>(null);
const pendingViewerBlueprintId = ref<string | null>(null);

watch(
  viewerAssignments,
  (assignments) => {
    if (!assignments.length) {
      selectedAssignmentId.value = null;
      return;
    }
    if (!assignments.some((assignment) => assignment.id === selectedAssignmentId.value)) {
      selectedAssignmentId.value = assignments[0].id;
    }
  },
  { immediate: true, deep: true }
);

const guildFocusAssignmentId = ref<string | null>(null);
const showGuildIntroHighlight = ref(false);

watch(
  guildAssignments,
  (assignments) => {
    if (!guildFocusAssignmentId.value) {
      return;
    }
    if (!assignments.some((assignment) => assignment.id === guildFocusAssignmentId.value)) {
      guildFocusAssignmentId.value = null;
    }
  },
  { immediate: true, deep: true }
);

const viewerAssignment = computed(() => {
  if (activeTab.value !== 'overview') {
    return null;
  }
  const assignment = activeViewerAssignment.value;
  if (!assignment || assignment.status === 'CANCELLED') {
    return null;
  }
  return assignment;
});
const focusedGuildAssignment = computed(
  () => guildAssignments.value.find((assignment) => assignment.id === guildFocusAssignmentId.value) ?? null
);
const canvasAssignment = computed(() => focusedGuildAssignment.value ?? viewerAssignment.value ?? null);
const displayAssignmentCharacter = computed(() => canvasAssignment.value?.character ?? null);
const blockedAssignmentCharacterIds = computed(() => {
  const set = new Set<string>();
  for (const assignment of viewerAssignments.value) {
    if (assignment.status === 'CANCELLED' || assignment.status === 'COMPLETED') {
      continue;
    }
    const characterId = assignment.character?.id;
    if (characterId) {
      set.add(characterId);
    }
  }
  return set;
});
const eligibleCharacters = computed(() =>
  characterOptions.value.filter(
    (character) => character.guild?.id === guildId && !blockedAssignmentCharacterIds.value.has(character.id)
  )
);
const hasEligibleCharacters = computed(() => eligibleCharacters.value.length > 0);
const characterModalTotalPages = computed(() => {
  const total = eligibleCharacters.value.length;
  return total ? Math.ceil(total / CHARACTER_MODAL_PAGE_SIZE) : 1;
});
const visibleEligibleCharacters = computed(() => {
  const start = (characterModalPage.value - 1) * CHARACTER_MODAL_PAGE_SIZE;
  return eligibleCharacters.value.slice(start, start + CHARACTER_MODAL_PAGE_SIZE);
});
const showLoadingOverlay = computed(
  () => Boolean(summary.value) && (loadingSummary.value || loadingDetail.value || savingGraph.value)
);
const loadingOverlayMessage = computed(() => {
  if (savingGraph.value) {
    return 'Saving blueprint changes…';
  }
  if (loadingDetail.value) {
    return 'Loading quest steps…';
  }
  if (loadingSummary.value) {
    return 'Refreshing quest tracker…';
  }
  return 'Updating quest tracker…';
});
const viewerProgressMap = computed(() => {
  const map = new Map<string, QuestNodeProgressStatus>();
  const progress = viewerAssignment.value?.progress ?? [];
  for (const record of progress) {
    map.set(record.nodeId, record.status);
  }
  return map;
});
const canvasProgressMap = computed(() => {
  const map = new Map<string, QuestNodeProgressStatus>();
  const progress = canvasAssignment.value?.progress ?? [];
  for (const record of progress) {
    map.set(record.nodeId, record.status);
  }
  return map;
});
const canvasCompletedNodeIds = computed(() => {
  const set = new Set<string>();
  canvasProgressMap.value.forEach((status, nodeId) => {
    if (status === 'COMPLETED') {
      set.add(nodeId);
    }
  });
  return set;
});
const viewerAssignmentId = computed(() => viewerAssignment.value?.id ?? null);
const isViewingGuildAssignment = computed(
  () => Boolean(focusedGuildAssignment.value && focusedGuildAssignment.value.id !== viewerAssignmentId.value)
);
const canUpdateNodeProgress = computed(() => Boolean(viewerAssignmentId.value) && !isViewingGuildAssignment.value);
const focusedGuildAssignmentLabel = computed(() => {
  const assignment = focusedGuildAssignment.value;
  if (!assignment) {
    return null;
  }
  return assignment.character?.name ?? assignment.user?.displayName ?? 'Guild member';
});
const nodeStatuses: QuestNodeProgressStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
const nodeStatusMenuClassMap: Record<QuestNodeProgressStatus, string> = {
  NOT_STARTED: 'quest-context-menu__status--muted',
  IN_PROGRESS: 'quest-context-menu__status--warning',
  COMPLETED: 'quest-context-menu__status--success',
  BLOCKED: 'quest-context-menu__status--danger'
};
const nodeProgressStatusLabels: Record<QuestNodeProgressStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked'
};
const renderedNodes = computed(() =>
  activeTab.value === 'editor' ? editableNodes.value : detail.value?.nodes ?? []
);

const activeLinks = computed(() =>
  activeTab.value === 'editor' ? editableLinks.value : detail.value?.links ?? []
);

const blueprintOptionIndex = computed(() => {
  const map = new Map<string, QuestBlueprintSummaryLite>();
  summary.value?.blueprints.forEach((blueprint) => {
    map.set(blueprint.id, blueprint);
  });
  return map;
});

const blueprintLinkOptions = computed(() => {
  const currentId = selectedBlueprintId.value;
  return (summary.value?.blueprints ?? [])
    .filter((blueprint) => blueprint.id !== currentId)
    .map((blueprint) => ({
      id: blueprint.id,
      title: blueprint.title,
      isArchived: blueprint.isArchived
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
});

const selectedNode = computed<EditableNode | null>(() =>
  editableNodes.value.find((node) => node.id === selectedNodeId.value) ?? null
);

const selectedNodeTargetField = computed<string>({
  get() {
    const node = selectedNode.value;
    if (!node) {
      return '';
    }
    if (node.nodeType === 'DELIVER') {
      return resolveRequirementItemName(node.requirements) ?? targetOrItemLabel(node) ?? '';
    }
    return targetOrItemLabel(node) ?? '';
  },
  set(value: string) {
    const node = selectedNode.value;
    if (!node) {
      return;
    }
    if (!node.requirements) {
      node.requirements = {};
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (node.nodeType === 'DELIVER') {
      node.requirements.itemName = trimmed;
    } else {
      node.requirements.targetName = trimmed;
    }
    markDirty();
  }
});

const selectedNodeLinkEntries = computed(() => {
  const node = selectedNode.value;
  if (!node) {
    return {
      previous: [] as Array<{ id: string; title: string; isArchived: boolean }>,
      next: [] as Array<{ id: string; title: string; isArchived: boolean }>
    };
  }
  const buildEntries = (direction: BlueprintLinkDirection) => {
    const ids = readNodeLinkIds(node, direction);
    return ids.map((id) => ({
      id,
      title: blueprintOptionIndex.value.get(id)?.title ?? 'Unknown blueprint',
      isArchived: blueprintOptionIndex.value.get(id)?.isArchived ?? false
    }));
  };
  return {
    previous: buildEntries('previous'),
    next: buildEntries('next')
  };
});

type BlueprintRelationEntry = { id: string; title: string; isArchived: boolean };

const nodeBlueprintLinkEntries = computed(() => {
  const display = new Map<string, { previous: BlueprintRelationEntry[]; next: BlueprintRelationEntry[] }>();
  const nodes = renderedNodes.value;
  const labelMap = blueprintOptionIndex.value;
  nodes.forEach((node) => {
    const buildEntries = (direction: BlueprintLinkDirection): BlueprintRelationEntry[] =>
      readNodeLinkIds(node, direction).map((id) => {
        const target = labelMap.get(id);
        return {
          id,
          title: target?.title ?? 'Unknown blueprint',
          isArchived: target?.isArchived ?? false
        };
      });
    display.set(node.id, {
      previous: buildEntries('previous'),
      next: buildEntries('next')
    });
  });
  return display;
});

const editableNodeIndex = computed(() => {
  const map = new Map<string, EditableNode>();
  editableNodes.value.forEach((node) => map.set(node.id, node));
  return map;
});

const selectedNodeCount = computed(() => selectedNodeIds.value.size);
const hasMultiSelection = computed(() => selectedNodeCount.value > 1);
const canDistributeSelection = computed(() => selectedNodeCount.value > 2);
const renderedNodeIndex = computed(() => {
  const map = new Map<string, QuestNodeViewModel>();
  for (const node of renderedNodes.value) {
    map.set(node.id, node);
  }
  return map;
});
const showOverviewDisabledState = computed(() => activeTab.value === 'overview');
const overviewAltClickMode = computed(
  () => activeTab.value === 'overview' && isAltProgressMode.value && canUpdateNodeProgress.value
);

const finalNodeIds = computed(() => {
  const set = new Set<string>();
  renderedNodes.value.forEach((node) => {
    if (readNodeFlag(node, 'isFinal')) {
      set.add(node.id);
    }
  });
  return set;
});

const canvasDisabledNodeIds = computed(() => {
  const set = new Set<string>();
  canvasAssignment.value?.progress.forEach((record) => {
    if (record.isDisabled) {
      set.add(record.nodeId);
    }
  });
  return set;
});

function isNodeDisabled(nodeId: string) {
  return canvasDisabledNodeIds.value.has(nodeId);
}

function isNodeFinal(nodeId: string) {
  return finalNodeIds.value.has(nodeId);
}

function isGroupNode(nodeId: string) {
  return renderedNodeIndex.value.get(nodeId)?.isGroup ?? false;
}

function isNodeCompleted(nodeId: string) {
  return canvasCompletedNodeIds.value.has(nodeId);
}

function readNodeFlag(node: QuestNodeViewModel | EditableNode | undefined, flag: 'isFinal'): boolean {
  if (!node) {
    return false;
  }
  const directValue = (node as any)[flag];
  if (typeof directValue === 'boolean') {
    return directValue;
  }
  const metadataValue = (node.metadata as Record<string, unknown> | undefined)?.[flag];
  return typeof metadataValue === 'boolean' ? metadataValue : Boolean(metadataValue);
}

function setNodeFinalFlag(nodeId: string, value: boolean) {
  const applyFlag = (node: QuestNodeViewModel | EditableNode | undefined) => {
    if (!node) {
      return;
    }
    const metadata = { ...(node.metadata ?? {}) };
    if (value) {
      metadata.isFinal = true;
    } else {
      delete metadata.isFinal;
    }
    node.metadata = metadata;
    (node as any).isFinal = value;
  };

  applyFlag(editableNodeIndex.value.get(nodeId));
  if (detail.value) {
    applyFlag(detail.value.nodes.find((node) => node.id === nodeId));
  }
}

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

function cloneRecord<T extends Record<string, any>>(value: T | undefined | null): T {
  if (!value) {
    return {} as T;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON clone.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return { ...(value as Record<string, any>) } as T;
  }
}

function normalizeBlueprintLinkIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function readNodeLinkIds(
  node: QuestNodeViewModel | EditableNode | null | undefined,
  direction: BlueprintLinkDirection
): string[] {
  if (!node) {
    return [];
  }
  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  const raw = metadata[BLUEPRINT_LINK_KEYS[direction]];
  if (!Array.isArray(raw)) {
    return [];
  }
  return normalizeBlueprintLinkIds(raw);
}

function ensureBlueprintLinkMetadata(node: EditableNode) {
  const metadata = node.metadata ?? {};
  metadata.previousBlueprintIds = normalizeBlueprintLinkIds(metadata.previousBlueprintIds);
  metadata.nextBlueprintIds = normalizeBlueprintLinkIds(metadata.nextBlueprintIds);
  node.metadata = metadata;
}

function getNodeLinkIds(node: EditableNode, direction: BlueprintLinkDirection): string[] {
  return readNodeLinkIds(node, direction);
}

function nodeLinkEntries(nodeId: string, direction: BlueprintLinkDirection): BlueprintRelationEntry[] {
  return nodeBlueprintLinkEntries.value.get(nodeId)?.[direction] ?? [];
}

function canAddBlueprintLink(direction: BlueprintLinkDirection) {
  const selection = blueprintLinkSelections[direction];
  if (!selection) {
    return false;
  }
  const node = selectedNode.value;
  if (!node) {
    return false;
  }
  const ids = getNodeLinkIds(node, direction);
  return !ids.includes(selection);
}

function addBlueprintLink(direction: BlueprintLinkDirection) {
  const selection = blueprintLinkSelections[direction];
  const node = selectedNode.value;
  if (!selection || !node) {
    return;
  }
  const ids = getNodeLinkIds(node, direction);
  if (ids.includes(selection)) {
    blueprintLinkSelections[direction] = '';
    return;
  }
  node.metadata[BLUEPRINT_LINK_KEYS[direction]] = [...ids, selection];
  blueprintLinkSelections[direction] = '';
  markDirty();
}

function removeBlueprintLink(direction: BlueprintLinkDirection, blueprintId: string) {
  const node = selectedNode.value;
  if (!node) {
    return;
  }
  const ids = getNodeLinkIds(node, direction);
  const nextIds = ids.filter((id) => id !== blueprintId);
  if (nextIds.length === ids.length) {
    return;
  }
  node.metadata[BLUEPRINT_LINK_KEYS[direction]] = nextIds;
  markDirty();
}

function buildEditableNode(node: QuestNodeViewModel): EditableNode {
  const metadata = { ...(node.metadata ?? {}) };
  metadata.accentColor = ensureAccentColor((metadata.accentColor as string | undefined) ?? undefined);
  metadata.previousBlueprintIds = normalizeBlueprintLinkIds(metadata.previousBlueprintIds);
  metadata.nextBlueprintIds = normalizeBlueprintLinkIds(metadata.nextBlueprintIds);
  const editable = {
    ...node,
    position: { ...node.position },
    requirements: { ...(node.requirements ?? {}) },
    metadata,
    isFinal: readNodeFlag(node, 'isFinal')
  } as EditableNode;
  return editable;
}

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
  if (!force && !isCanvasView.value) {
    return;
  }
  nextTick(() => {
    requestAnimationFrame(() => {
      if (!isCanvasView.value) {
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
  if (isCanvasView.value) {
    scheduleOverviewFit(true);
  }
}

function handleOverviewPointerDown(event: PointerEvent) {
  if (!isCanvasView.value || event.button !== 0) {
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
  if (!isCanvasView.value) {
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
const NODE_DUPLICATE_OFFSET = 32;
const PAN_SUPPRESS_THRESHOLD = 3;
const LINK_CANVAS_PADDING = 120;
const OVERVIEW_CANVAS_PADDING = 48;
// Allow generous drag space; keep finite to avoid overflow in SVG sizing.
const NODE_POSITION_LIMIT = 250000;
const GRID_SNAP_SPACING = 16;
const GRID_LINE_RADIUS = 6;
const GRID_FADE_EXTENSION = GRID_SNAP_SPACING * 2;
const DEFAULT_GRID_HALF_WIDTH = NODE_WIDTH / 2;
const DEFAULT_GRID_HALF_HEIGHT = NODE_HEIGHT / 2;
const ALIGNMENT_GUIDE_DISTANCE = 360;
const ALIGNMENT_SNAP_THRESHOLD = 8;

const dragGridOverlay = reactive({
  active: false,
  bypass: false,
  centerX: 0,
  centerY: 0,
  highlightX: null as number | null,
  highlightY: null as number | null,
  halfWidth: DEFAULT_GRID_HALF_WIDTH,
  halfHeight: DEFAULT_GRID_HALF_HEIGHT
});
type AlignmentHorizontalGuide = { y: number; intensity: number };
type AlignmentVerticalGuide = { x: number; intensity: number; edge: 'left' | 'right' };

const alignmentGuides = reactive({
  horizontals: [] as AlignmentHorizontalGuide[],
  verticals: [] as AlignmentVerticalGuide[]
});

const gridOverlayVisible = computed(() => dragGridOverlay.active && !dragGridOverlay.bypass && activeTab.value === 'editor');
const alignmentGuidesVisible = computed(() => alignmentGuides.horizontals.length > 0 || alignmentGuides.verticals.length > 0);

const gridLinePositions = computed(() => {
  if (!gridOverlayVisible.value) {
    return { vertical: [] as number[], horizontal: [] as number[] };
  }
  const focusX = dragGridOverlay.highlightX ?? dragGridOverlay.centerX;
  const focusY = dragGridOverlay.highlightY ?? dragGridOverlay.centerY;
  const baseX = snapToGrid(focusX);
  const baseY = snapToGrid(focusY);
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let i = -GRID_LINE_RADIUS; i <= GRID_LINE_RADIUS; i++) {
    vertical.push(baseX + i * GRID_SNAP_SPACING);
    horizontal.push(baseY + i * GRID_SNAP_SPACING);
  }
  return { vertical, horizontal };
});

const gridEdgeLinePositions = computed(() => {
  if (!gridOverlayVisible.value) {
    return [];
  }
  const { centerX, halfWidth } = dragGridOverlay;
  return [centerX - halfWidth, centerX + halfWidth];
});

const gridOverlayExtents = computed(() => {
  if (!gridOverlayVisible.value) {
    return { extentX: 0, extentY: 0 };
  }
  const paddingX = GRID_SNAP_SPACING * GRID_LINE_RADIUS + GRID_FADE_EXTENSION;
  const paddingY = GRID_SNAP_SPACING * GRID_LINE_RADIUS + GRID_FADE_EXTENSION;
  return {
    extentX: dragGridOverlay.halfWidth + paddingX,
    extentY: dragGridOverlay.halfHeight + paddingY
  };
});

function gridLineFadeOpacity(value: number, axis: 'x' | 'y') {
  const center = axis === 'x' ? dragGridOverlay.centerX : dragGridOverlay.centerY;
  const baseExtent = axis === 'x' ? dragGridOverlay.halfWidth : dragGridOverlay.halfHeight;
  const fadeRange = GRID_SNAP_SPACING * GRID_LINE_RADIUS;
  const distance = Math.abs(value - center);
  if (distance <= baseExtent) {
    return 0.9;
  }
  if (!fadeRange) {
    return 0;
  }
  const ratio = clamp((distance - baseExtent) / fadeRange, 0, 1);
  return 0.9 * (1 - ratio);
}

function verticalGridLineStyle(x: number) {
  const { extentY } = gridOverlayExtents.value;
  const top = dragGridOverlay.centerY - extentY;
  const height = extentY * 2;
  return {
    transform: `translate(${x}px, ${top}px)`,
    height: `${height}px`,
    '--grid-line-opacity': gridLineFadeOpacity(x, 'x').toString()
  };
}

function horizontalGridLineStyle(y: number) {
  const { extentX } = gridOverlayExtents.value;
  const left = dragGridOverlay.centerX - extentX;
  const width = extentX * 2;
  return {
    transform: `translate(${left}px, ${y}px)`,
    width: `${width}px`,
    '--grid-line-opacity': gridLineFadeOpacity(y, 'y').toString()
  };
}

function edgeGridLineStyle(x: number) {
  return {
    ...verticalGridLineStyle(x),
    '--grid-line-opacity': '1'
  };
}

function alignmentHorizontalStyle(guide: AlignmentHorizontalGuide) {
  return {
    transform: `translate(0, ${guide.y}px)`,
    '--alignment-opacity': guide.intensity.toFixed(3)
  };
}

function alignmentVerticalStyle(guide: AlignmentVerticalGuide) {
  return {
    transform: `translate(${guide.x}px, 0)`,
    '--alignment-opacity': guide.intensity.toFixed(3)
  };
}

function isGridLineHighlighted(line: number, target: number | null) {
  if (target == null) {
    return false;
  }
  return Math.abs(line - target) < 0.5;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SNAP_SPACING) * GRID_SNAP_SPACING;
}

function clampNodePosition(value: number) {
  return clamp(value, -NODE_POSITION_LIMIT, NODE_POSITION_LIMIT);
}

function updateGridOverlayState(
  centerX: number,
  centerY: number,
  highlightX: number | null,
  highlightY: number | null,
  bypass: boolean,
  halfWidth?: number,
  halfHeight?: number
) {
  dragGridOverlay.active = true;
  dragGridOverlay.centerX = centerX;
  dragGridOverlay.centerY = centerY;
  dragGridOverlay.highlightX = highlightX;
  dragGridOverlay.highlightY = highlightY;
  dragGridOverlay.bypass = bypass;
  if (typeof halfWidth === 'number') {
    dragGridOverlay.halfWidth = halfWidth;
  }
  if (typeof halfHeight === 'number') {
    dragGridOverlay.halfHeight = halfHeight;
  }
}

function resetGridOverlayState() {
  dragGridOverlay.active = false;
  dragGridOverlay.bypass = false;
  dragGridOverlay.highlightX = null;
  dragGridOverlay.highlightY = null;
  dragGridOverlay.halfWidth = DEFAULT_GRID_HALF_WIDTH;
  dragGridOverlay.halfHeight = DEFAULT_GRID_HALF_HEIGHT;
}

function updateAlignmentGuides(centerX: number, centerY: number) {
  const candidates = editableNodes.value.filter((node) => !selectedNodeIds.value.has(node.id));
  if (!candidates.length) {
    resetAlignmentGuides();
    return;
  }
  type HorizontalCluster = { target: number; intensity: number };
  type VerticalCluster = { target: number; intensity: number; edge: 'left' | 'right' };
  const horizontalClusters: HorizontalCluster[] = [];
  const verticalClusters: VerticalCluster[] = [];
  const threshold = Math.max(4, GRID_SNAP_SPACING);

  const mergeHorizontal = (y: number, intensity: number) => {
    for (const cluster of horizontalClusters) {
      if (Math.abs(cluster.target - y) <= threshold) {
        if (intensity > cluster.intensity) {
          cluster.target = y;
        }
        cluster.intensity = Math.min(1, Math.max(cluster.intensity, intensity) + intensity * 0.25);
        return;
      }
    }
    horizontalClusters.push({ target: y, intensity });
  };

  const mergeVertical = (x: number, intensity: number, edge: 'left' | 'right') => {
    for (const cluster of verticalClusters) {
      if (cluster.edge === edge && Math.abs(cluster.target - x) <= threshold) {
        if (intensity > cluster.intensity) {
          cluster.target = x;
        }
        cluster.intensity = Math.min(1, Math.max(cluster.intensity, intensity) + intensity * 0.25);
        return;
      }
    }
    verticalClusters.push({ target: x, intensity, edge });
  };

  for (const node of candidates) {
    const nodeCenterPoint = nodeCenter(node.position, node.id);
    const distance = Math.hypot(nodeCenterPoint.x - centerX, nodeCenterPoint.y - centerY);
    if (distance > ALIGNMENT_GUIDE_DISTANCE) {
      continue;
    }
    const bounds = getNodeBounds(node);
    const intensity = clamp(1 - distance / ALIGNMENT_GUIDE_DISTANCE, 0.25, 1);
    mergeHorizontal(bounds.top, intensity);
    mergeVertical(bounds.left, intensity, 'left');
    mergeVertical(bounds.right, intensity, 'right');
  }
  const horizontalGuides = horizontalClusters.map((cluster) => ({
    y: cluster.target,
    intensity: cluster.intensity
  }));
  const verticalGuides = verticalClusters.map((cluster) => ({
    x: cluster.target,
    intensity: cluster.intensity,
    edge: cluster.edge
  }));
  if (!horizontalGuides.length && !verticalGuides.length) {
    resetAlignmentGuides();
    return;
  }
  alignmentGuides.horizontals = horizontalGuides;
  alignmentGuides.verticals = verticalGuides;
}

function resetAlignmentGuides() {
  alignmentGuides.horizontals = [];
  alignmentGuides.verticals = [];
}

function applyAlignmentSnap(topLeftX: number, topLeftY: number, width: number, height: number) {
  let snappedX = topLeftX;
  let snappedY = topLeftY;
  let snappedVertical = false;
  let snappedHorizontal = false;
  if (alignmentGuides.horizontals.length) {
    for (const guide of alignmentGuides.horizontals) {
      if (Math.abs(snappedY - guide.y) <= ALIGNMENT_SNAP_THRESHOLD) {
        snappedY = guide.y;
        snappedHorizontal = true;
        break;
      }
    }
  }
  if (alignmentGuides.verticals.length) {
    for (const guide of alignmentGuides.verticals) {
      if (guide.edge === 'left') {
        if (Math.abs(snappedX - guide.x) <= ALIGNMENT_SNAP_THRESHOLD) {
          snappedX = guide.x;
          snappedVertical = true;
          break;
        }
      } else {
        const rightEdge = snappedX + width;
        if (Math.abs(rightEdge - guide.x) <= ALIGNMENT_SNAP_THRESHOLD) {
          snappedX = guide.x - width;
          snappedVertical = true;
          break;
        }
      }
    }
  }
  return { x: snappedX, y: snappedY, snappedX: snappedVertical, snappedY: snappedHorizontal };
}

function alignSelectedNodes(edge: 'left' | 'right' | 'top' | 'bottom'): boolean {
  if (selectedNodeIds.value.size < 2) {
    return false;
  }
  const selected = editableNodes.value
    .filter((node) => selectedNodeIds.value.has(node.id))
    .map((node) => ({
      node,
      width: getNodeSize(node.id).width,
      height: getNodeSize(node.id).height
    }));
  if (selected.length < 2) {
    return false;
  }
  switch (edge) {
    case 'left': {
      const target = Math.min(...selected.map((entry) => entry.node.position.x));
      selected.forEach((entry) => {
        entry.node.position.x = clampNodePosition(target);
      });
      break;
    }
    case 'right': {
      const target = Math.max(...selected.map((entry) => entry.node.position.x + entry.width));
      selected.forEach((entry) => {
        entry.node.position.x = clampNodePosition(target - entry.width);
      });
      break;
    }
    case 'top': {
      const target = Math.min(...selected.map((entry) => entry.node.position.y));
      selected.forEach((entry) => {
        entry.node.position.y = clampNodePosition(target);
      });
      break;
    }
    case 'bottom': {
      const target = Math.max(...selected.map((entry) => entry.node.position.y + entry.height));
      selected.forEach((entry) => {
        entry.node.position.y = clampNodePosition(target - entry.height);
      });
      break;
    }
  }
  dirtyGraph.value = true;
  return true;
}

function snapAxisPosition(value: number, size: number, axis: 'x' | 'y') {
  const center = value + size / 2;
  const snappedCenter = snapToGrid(center);
  return clampNodePosition(snappedCenter - size / 2);
}

function distributeSelectedNodes(direction: 'horizontal' | 'vertical' | 'grid'): boolean {
  const selected = editableNodes.value
    .filter((node) => selectedNodeIds.value.has(node.id))
    .map((node) => ({
      node,
      width: getNodeSize(node.id).width,
      height: getNodeSize(node.id).height
    }));
  if (selected.length < 3 && direction !== 'grid') {
    return false;
  }
  const tallestHeight = Math.max(...selected.map((entry) => entry.height));
  if (Number.isFinite(tallestHeight) && tallestHeight > 0) {
    selected.forEach((entry) => {
      if (entry.height < tallestHeight) {
        nodeHeightOverrides.set(entry.node.id, tallestHeight);
        entry.height = tallestHeight;
      }
    });
  }
  if (direction === 'horizontal') {
    const ordered = [...selected].sort(
      (a, b) => a.node.position.x + a.width / 2 - (b.node.position.x + b.width / 2)
    );
    const startCenter = ordered[0].node.position.x + ordered[0].width / 2;
    const endCenter = ordered[ordered.length - 1].node.position.x + ordered[ordered.length - 1].width / 2;
    const gaps = ordered.length - 1;
    const gapSize = gaps > 0 ? (endCenter - startCenter) / gaps : 0;
    ordered.forEach((entry, index) => {
      let targetCenter = startCenter + gapSize * index;
      if (!Number.isFinite(targetCenter)) {
        targetCenter = startCenter;
      }
      let targetLeft = targetCenter - entry.width / 2;
      targetLeft = snapAxisPosition(targetLeft, entry.width, 'x');
      entry.node.position.x = targetLeft;
    });
  } else if (direction === 'vertical') {
    const ordered = [...selected].sort((a, b) => a.node.position.y - b.node.position.y);
    const minTop = Math.min(...ordered.map((entry) => entry.node.position.y));
    const maxBottom = Math.max(...ordered.map((entry) => entry.node.position.y + entry.height));
    const totalHeight = ordered.reduce((sum, entry) => sum + entry.height, 0);
    const gaps = ordered.length - 1;
    const availableSpace = Math.max(0, maxBottom - minTop - totalHeight);
    const spacing = gaps > 0 ? Math.max(GRID_SNAP_SPACING, availableSpace / gaps) : GRID_SNAP_SPACING;
    let cursor = snapAxisPosition(minTop, ordered[0].height, 'y');
    ordered.forEach((entry, index) => {
      if (index === 0) {
        entry.node.position.y = cursor;
      } else {
        let targetTop = cursor;
        targetTop = snapAxisPosition(targetTop, entry.height, 'y');
        entry.node.position.y = targetTop;
      }
      cursor = entry.node.position.y + entry.height + spacing;
    });
  } else if (direction === 'grid') {
    const total = selected.length;
    if (total < 2) {
      return false;
    }
    const widestWidth = Math.max(...selected.map((entry) => entry.width));
    if (Number.isFinite(widestWidth) && widestWidth > 0) {
      selected.forEach((entry) => {
        if (entry.width < widestWidth) {
          nodeWidthOverrides.set(entry.node.id, widestWidth);
          entry.width = widestWidth;
        }
      });
    }
    const rows = Math.ceil(Math.sqrt(total));
    const columns = Math.ceil(total / rows);
    const ordered = [...selected].sort((a, b) => a.node.position.y - b.node.position.y || a.node.position.x - b.node.position.x);
    const startX = Math.min(...ordered.map((entry) => entry.node.position.x));
    const startY = Math.min(...ordered.map((entry) => entry.node.position.y));
    const baseX = snapAxisPosition(startX, widestWidth, 'x');
    const baseY = snapAxisPosition(startY, tallestHeight, 'y');
    const horizontalStep = widestWidth + GRID_SNAP_SPACING;
    const verticalStep = tallestHeight + GRID_SNAP_SPACING;
    ordered.forEach((entry, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const targetLeft = clampNodePosition(baseX + col * horizontalStep);
      const targetTop = clampNodePosition(baseY + row * verticalStep);
      entry.node.position.x = targetLeft;
      entry.node.position.y = targetTop;
    });
  }
  dirtyGraph.value = true;
  return true;
}

function handleDistributeSelection(direction: 'horizontal' | 'vertical' | 'grid') {
  if (!canDistributeSelection.value && direction !== 'grid') {
    return;
  }
  const success = distributeSelectedNodes(direction);
  if (success) {
    hideContextMenu();
  }
}

function handleAlignSelection(edge: 'left' | 'right' | 'top' | 'bottom') {
  if (!hasMultiSelection.value) {
    return;
  }
  const success = alignSelectedNodes(edge);
  if (success) {
    hideContextMenu();
  }
}

function handleWindowScroll() {
  if (!dragScrollState.active || !draggingBlueprintId.value) {
    dragScrollState.baseX = window.scrollX;
    dragScrollState.baseY = window.scrollY;
    return;
  }
  const container = folderListRef.value;
  if (!container || container.scrollHeight <= container.clientHeight) {
    dragScrollState.baseX = window.scrollX;
    dragScrollState.baseY = window.scrollY;
    return;
  }
  const deltaY = window.scrollY - dragScrollState.baseY;
  if (!deltaY) {
    return;
  }
  const maxScroll = container.scrollHeight - container.clientHeight;
  container.scrollTop = clamp(container.scrollTop + deltaY, 0, maxScroll);
  if (dragScrollState.resetFrame) {
    cancelAnimationFrame(dragScrollState.resetFrame);
  }
  dragScrollState.resetFrame = requestAnimationFrame(() => {
    window.scrollTo(dragScrollState.baseX, dragScrollState.baseY);
    dragScrollState.resetFrame = null;
  });
}
const BRANCH_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#a855f7', '#a78bfa', '#f97316', '#a3e635'];
const BRANCH_ANIMATION_STAGGER = 0.25;
const DEFAULT_BRANCH_COLOR = '#38bdf8';
const DISABLED_BRANCH_COLOR = '#475569';
const OPTIONAL_BRANCH_COLOR = '#f97316';

const childNodeMap = computed(() => {
  const map = new Map<string, NodeAdjacencyEntry[]>();
  for (const link of activeLinks.value) {
    const list = map.get(link.parentNodeId) ?? [];
    list.push({
      nodeId: link.childNodeId,
      isNextStep: isNextStepLink(link),
      isOptional: renderedNodeIndex.value.get(link.childNodeId)?.isOptional ?? false,
      isGroup: renderedNodeIndex.value.get(link.childNodeId)?.isGroup ?? false
    });
    map.set(link.parentNodeId, list);
  }
  return map;
});

const parentNodeMap = computed(() => {
  const map = new Map<string, NodeAdjacencyEntry[]>();
  for (const link of activeLinks.value) {
    const list = map.get(link.childNodeId) ?? [];
    list.push({
      nodeId: link.parentNodeId,
      isNextStep: isNextStepLink(link),
      isOptional: renderedNodeIndex.value.get(link.parentNodeId)?.isOptional ?? false,
      isGroup: renderedNodeIndex.value.get(link.parentNodeId)?.isGroup ?? false
    });
    map.set(link.childNodeId, list);
  }
  return map;
});

const groupDescendantsMap = computed(() => {
  const map = new Map<string, string[]>();
  renderedNodes.value.forEach((node) => {
    const includeGroupNodes = Boolean(node.isGroup);
    map.set(
      node.id,
      collectRequiredDescendants(node.id, includeGroupNodes, { blockNextStepOnlyAtRoot: Boolean(node.isGroup) })
    );
  });

  return map;
});

function collectRequiredDescendants(
  nodeId: string,
  includeGroupNodes: boolean,
  options?: { blockNextStepOnlyAtRoot?: boolean }
): string[] {
  const adjacency = childNodeMap.value;
  const visited = new Set<string>();
  const counted = new Set<string>();
  const stack = (adjacency.get(nodeId) ?? []).map((entry) => ({
    entry,
    parentId: nodeId
  }));
  while (stack.length) {
    const { entry, parentId } = stack.pop()!;
    const blockNextStep =
      entry.isNextStep && (!options?.blockNextStepOnlyAtRoot || parentId === nodeId);
    if (blockNextStep || entry.isOptional) {
      continue;
    }
    if (visited.has(entry.nodeId)) {
      continue;
    }
    visited.add(entry.nodeId);
    if (includeGroupNodes || !entry.isGroup) {
      counted.add(entry.nodeId);
    }
    const nextEntries = adjacency.get(entry.nodeId) ?? [];
    nextEntries.forEach((child) =>
      stack.push({
        entry: child,
        parentId: entry.nodeId
      })
    );
  }
  return Array.from(counted);
}

function getUpstreamNodeIds(nodeId: string): string[] {
  const parents = parentNodeMap.value;
  const visited = new Set<string>();
  const queue = [...(parents.get(nodeId)?.map((entry) => entry.nodeId) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const nextParents = parents.get(current) ?? [];
    nextParents.forEach((parentEntry) => {
      const parentId = parentEntry.nodeId;
      if (!visited.has(parentId)) {
        queue.push(parentId);
      }
    });
  }
  return Array.from(visited);
}

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
    const childEntries = children.get(nodeId) ?? [];
    if (!childEntries.length) {
      continue;
    }
    const nextStepChildren = childEntries.filter((entry) => entry.isNextStep);
    nextStepChildren.forEach((entry) => enqueue(entry.nodeId, branchIndex, depth + 1));
    const branchChildren = childEntries.filter((entry) => !entry.isNextStep);
    if (!branchChildren.length) {
      continue;
    }
    const optionalChildren = branchChildren.filter((entry) => entry.isOptional);
    const requiredChildren = branchChildren.filter((entry) => !entry.isOptional);
    if (!requiredChildren.length) {
      optionalChildren.forEach((entry) => enqueue(entry.nodeId, branchIndex, depth + 1));
      continue;
    }
    if (requiredChildren.length === 1) {
      enqueue(requiredChildren[0].nodeId, branchIndex, depth + 1);
    } else {
      requiredChildren.forEach((entry) => {
        const nextBranch = branchCounter % BRANCH_COLORS.length;
        branchCounter += 1;
        enqueue(entry.nodeId, nextBranch, depth + 1);
      });
    }
    optionalChildren.forEach((entry) => enqueue(entry.nodeId, branchIndex, depth + 1));
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

function getGroupDescendants(nodeId: string) {
  return groupDescendantsMap.value.get(nodeId) ?? [];
}

function getDownstreamNodeIds(nodeId: string) {
  return collectRequiredDescendants(nodeId, true);
}

function isGroupChildLink(parentId: string, childId: string) {
  return (childNodeMap.value.get(parentId) ?? []).some(
    (entry) => !entry.isOptional && !entry.isNextStep && entry.nodeId === childId
  );
}

function getNextStepGroupAncestors(nodeId: string): string[] {
  const visited = new Set<string>();
  const upstream = new Set<string>();
  const initialParents = parentNodeMap.value.get(nodeId) ?? [];
  const queue = initialParents.filter((entry) => isGroupNode(entry.nodeId)).map((entry) => entry.nodeId);
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const parents = parentNodeMap.value.get(current) ?? [];
    parents.forEach((entry) => {
      if (!isGroupNode(entry.nodeId)) {
        return;
      }
      queue.push(entry.nodeId);
      if (entry.isNextStep) {
        upstream.add(entry.nodeId);
      }
    });
  }
  return Array.from(upstream);
}

function applyGroupHierarchyStatus(
  groupId: string,
  status: 'COMPLETED' | 'NOT_STARTED',
  updates: Map<string, QuestNodeProgressStatus>,
  newlyCompleted?: Set<string>,
  includeOptional = false
) {
  const targets = [groupId, ...getGroupDescendants(groupId)];
  for (const targetId of targets) {
    if (isNodeDisabled(targetId)) {
      continue;
    }
    if (!includeOptional && renderedNodeIndex.value.get(targetId)?.isOptional && targetId !== groupId) {
      continue;
    }
    updates.set(targetId, status);
    if (status === 'COMPLETED') {
      newlyCompleted?.add(targetId);
    } else {
      newlyCompleted?.delete(targetId);
    }
  }
}

function areAllDescendantsComplete(nodeId: string, newlyCompleted: Set<string>, includeOptional = false) {
  const descendants = getGroupDescendants(nodeId).filter((childId) => {
    if (isNodeDisabled(childId)) {
      return false;
    }
    if (!includeOptional && renderedNodeIndex.value.get(childId)?.isOptional) {
      return false;
    }
    return true;
  });
  if (!descendants.length) {
    return true;
  }
  return descendants.every((childId) => {
    if (newlyCompleted.has(childId)) {
      return true;
    }
    return canvasProgressMap.value.get(childId) === 'COMPLETED';
  });
}

function getGroupProgress(
  nodeId: string,
  progress: QuestNodeProgress[] | undefined,
  mode: 'editor' | 'viewer' = 'viewer'
) {
  const descendantIds = getGroupDescendants(nodeId).filter((childId) =>
    mode === 'viewer' ? !isNodeDisabled(childId) : true
  );
  const childIds = descendantIds.filter((childId) => !isGroupNode(childId));
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

function groupProgressMeta(nodeId: string, mode: 'editor' | 'viewer') {
  const progress = mode === 'viewer' ? canvasAssignment.value?.progress : undefined;
  const { completed, total } = getGroupProgress(nodeId, progress, mode);
  return {
    completed,
    total,
    ratio: total ? completed / total : 0
  };
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
  const horizontalOverlap = box.left <= bounds.right && box.right >= bounds.left;
  const verticalOverlap = box.top <= bounds.bottom && box.bottom >= bounds.top;
  return horizontalOverlap && verticalOverlap;
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
    (upEvent) => {
      const releasePoint = pointerEventToCanvasPoint(upEvent);
      if (hoveredHandle.value && hoveredHandle.value.nodeId && hoveredHandle.value.nodeId !== node.id) {
        createCanvasLink(node.id, hoveredHandle.value.nodeId, {
          parentFace: linkDrag.startFace,
          childFace: hoveredHandle.value.face
        });
      } else if (releasePoint && editorCanvasRef.value?.contains(upEvent.target as Node) && linkDrag.startNodeId) {
        createNodeAtPoint(linkDrag.startNodeId, releasePoint);
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
  const shadowColor = link.isCompletedPath
    ? COMPLETED_LINK_SHADOW
    : link.isDisabledPath
      ? DISABLED_LINK_SHADOW
      : DEFAULT_LINK_SHADOW;
  return {
    '--path-length': `${link.pathLength}px`,
    '--animation-delay': `${link.animationDelay}s`,
    '--link-shadow-color': shadowColor
  } as Record<string, string>;
}

const renderedLinks = computed<RenderedLink[]>(() => {
  if (!renderedNodes.value.length || !detail.value) {
    return [];
  }
  const nodes = nodePositionMap.value;
  const branchAssignmentsMap = nodeBranchAssignments.value;
  return (activeTab.value === 'editor' ? editableLinks.value : detail.value.links).map((link) => {
    const nextStepEdge = isNextStepLink(link);
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
    const childNodeMeta = renderedNodeIndex.value.get(link.childNodeId);
    const childIsOptional = childNodeMeta?.isOptional ?? false;
    const linkDisabled =
      showOverviewDisabledState.value &&
      (isNodeDisabled(link.parentNodeId) || isNodeDisabled(link.childNodeId));
    const isInternalGroupLink =
      !nextStepEdge && isGroupNode(link.parentNodeId) && isGroupChildLink(link.parentNodeId, link.childNodeId);
    const childInternalCompleted =
      isInternalGroupLink && !childIsOptional && viewerNodeStatus(link.childNodeId) === 'COMPLETED';
    const parentGroupChildCompleted =
      !nextStepEdge &&
      showOverviewDisabledState.value &&
      isGroupNode(link.parentNodeId) &&
      isInternalGroupLink &&
      childInternalCompleted;
    const baseCompleted =
      isNodeCompleted(link.parentNodeId) && isNodeCompleted(link.childNodeId);
    const isCompletedPath = !linkDisabled && (baseCompleted || parentGroupChildCompleted);
    const branchColor = linkDisabled
      ? DISABLED_BRANCH_COLOR
      : isCompletedPath
        ? COMPLETED_ACCENT_COLOR
        : childIsOptional
          ? OPTIONAL_BRANCH_COLOR
          : BRANCH_COLORS[(branchInfo?.branchIndex ?? 0) % BRANCH_COLORS.length] ?? DEFAULT_BRANCH_COLOR;
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
      pathLength,
      isCompletedPath,
      isDisabledPath: linkDisabled
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
  window.addEventListener('dragover', globalDragOverHandler);
  window.addEventListener('scroll', handleWindowScroll, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    overviewResizeObserver = new ResizeObserver(() => requestOverviewFit());
    if (overviewCanvasRef.value) {
      overviewResizeObserver.observe(overviewCanvasRef.value);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('dragover', globalDragOverHandler);
  window.removeEventListener('scroll', handleWindowScroll);
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
  { key: 'editor' as const, label: 'Blueprint Editor', disabled: !canEditBlueprint.value },
  { key: 'guild' as const, label: 'Guild Board', disabled: !permissions.value?.canViewGuildBoard }
]);

function formatPercent(value: number) {
  const percent = Math.max(0, Math.min(1, value ?? 0));
  return `${Math.round(percent * 100)}%`;
}

function viewerProgressRatio(assignment?: QuestAssignment | null, totalStepOverride?: number) {
  if (!assignment) {
    return 0;
  }
  const summary = assignment.progressSummary ?? {
    totalNodes: assignment.totalViewerSteps ?? 0,
    completed: 0,
    inProgress: 0,
    blocked: 0,
    notStarted: 0,
    percentComplete: 0
  };
  const totalSteps = totalStepOverride ?? summary.totalNodes ?? assignment.totalViewerSteps ?? 0;
  if (totalSteps > 0) {
    const completed = summary.completed ?? 0;
    return Math.min(1, completed / totalSteps);
  }
  return summary.percentComplete ?? 0;
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

function nodeStyle(node: QuestNodeViewModel, draggable: boolean, mode: 'viewer' | 'editor') {
  const disabled = showOverviewDisabledState.value && isNodeDisabled(node.id);
  const accent = disabled ? DISABLED_BRANCH_COLOR : isNodeCompleted(node.id) ? COMPLETED_ACCENT_COLOR : nodeBranchColor(node.id);
  const cursor =
    mode === 'viewer' && overviewAltClickMode.value && !disabled ? 'copy' : disabled && !draggable ? 'not-allowed' : draggable ? 'move' : 'default';
  const style: Record<string, string | number> = {
    transform: `translate(${node.position.x}px, ${node.position.y}px)`,
    cursor,
    borderColor: accent,
    '--accent': accent,
    opacity: disabled ? 0.7 : 1
  };
  if (mode === 'editor') {
    const overrideHeight = nodeHeightOverrides.get(node.id);
    const overrideWidth = nodeWidthOverrides.get(node.id);
    if (overrideWidth) {
      style.width = `${overrideWidth}px`;
    }
    if (overrideHeight) {
      style.minHeight = `${overrideHeight}px`;
    }
  }
  if (node.isGroup) {
    const { ratio } = groupProgressMeta(node.id, mode);
    style['--group-progress'] = ratio.toString();
  }
  return style;
}

function typeAccent(node: QuestNodeViewModel) {
  if (showOverviewDisabledState.value && isNodeDisabled(node.id)) {
    return { background: DISABLED_BRANCH_COLOR, color: '#e2e8f0' };
  }
  const baseColor = node.isGroup ? '#14b8a6' : questNodeTypeColors[node.nodeType] ?? '#2563eb';
  return { background: baseColor };
}

function viewerNodeStatus(nodeId: string): QuestNodeProgressStatus {
  if (isNodeDisabled(nodeId)) {
    return 'NOT_STARTED';
  }
  return canvasProgressMap.value.get(nodeId) ?? 'NOT_STARTED';
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

function viewerStatusMenuClass(status: QuestNodeProgressStatus) {
  return nodeStatusMenuClassMap[status];
}

function displayNodeType(nodeType: QuestNodeType, isGroup?: boolean) {
  if (isGroup) {
    return 'Group';
  }
  return questNodeTypeLabels[nodeType] ?? nodeType;
}

function resolveRequirementItemName(requirements: Record<string, any> | undefined): string | null {
  if (!requirements) {
    return null;
  }
  const candidates = [
    requirements.itemName,
    requirements.item,
    requirements.itemLabel,
    requirements.itemDisplayName
  ];
  for (const entry of candidates) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  const rawItemList = requirements.itemList;
  if (typeof rawItemList === 'string') {
    const pieces = rawItemList.split(/[,;|^]/).map((part) => part.trim()).filter(Boolean);
    if (pieces.length > 0) {
      return pieces[0];
    }
  } else if (Array.isArray(rawItemList)) {
    const first = rawItemList.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    if (first) {
      return first.trim();
    }
  }

  return null;
}

function targetOrItemLabel(node: QuestNodeViewModel | EditableNode | null | undefined): string | null {
  if (!node || !node.requirements) {
    return null;
  }
  const itemName = resolveRequirementItemName(node.requirements);
  const targetName =
    typeof (node.requirements as any).targetName === 'string'
      ? ((node.requirements as any).targetName as string).trim()
      : '';
  if (node.nodeType === 'DELIVER') {
    const detail =
      typeof (node.requirements as any).details === 'string'
        ? ((node.requirements as any).details as string).split('\n').map((part) => part.trim()).find(Boolean)
        : null;
    const titleFallback = node.title?.trim();
    return itemName || detail || titleFallback || targetName || null;
  }
  return targetName || itemName || null;
}

function getNodeItemIds(node: QuestNodeViewModel | EditableNode | null | undefined): number[] {
  if (!node || !node.requirements) {
    return [];
  }
  const req = node.requirements as Record<string, unknown>;
  const itemIds: number[] = [];

  // Check explicit itemId fields first, then check itemName/targetName
  const candidates = [req.itemId, req.item_id, req.itemID, req.itemName, req.targetName];
  for (const entry of candidates) {
    if (typeof entry === 'number' && entry > 0) {
      itemIds.push(entry);
      break; // Found a numeric field, use it
    }
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      // Check if it's a comma-separated list of IDs
      const parts = trimmed.split(/[,;]/).map(p => p.trim()).filter(p => p.length > 0);
      const allNumeric = parts.length > 0 && parts.every(p => /^\d+$/.test(p));
      if (allNumeric) {
        for (const part of parts) {
          const parsed = Number.parseInt(part, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            itemIds.push(parsed);
          }
        }
        if (itemIds.length > 0) {
          break; // Found valid IDs, stop searching
        }
      }
    }
  }
  return itemIds;
}

function buildAllaItemUrl(itemId: number): string {
  return `https://alla.clumsysworld.com/?a=item&id=${itemId}`;
}

interface NodeItemLink {
  itemId: number;
  label: string;
  url: string;
}

function getNodeItemLinks(node: QuestNodeViewModel | EditableNode | null | undefined): NodeItemLink[] {
  const itemIds = getNodeItemIds(node);
  return itemIds.map(itemId => {
    const cachedName = getItemNameFromCache(itemId);
    return {
      itemId,
      label: cachedName || `Item #${itemId}`,
      url: buildAllaItemUrl(itemId)
    };
  });
}

function hasNodeItemIds(node: QuestNodeViewModel | EditableNode | null | undefined): boolean {
  return getNodeItemIds(node).length > 0;
}

// Item tooltip handlers for quest node item links
function showItemTooltip(event: MouseEvent, itemLink: NodeItemLink) {
  if (!itemLink.itemId) return;
  tooltipStore.showTooltip(
    {
      itemId: itemLink.itemId,
      itemName: itemLink.label
    },
    { x: event.clientX, y: event.clientY }
  );
}

function hideItemTooltip() {
  tooltipStore.hideTooltip();
}

function handleItemLinkMouseMove(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function zoneLabel(node: QuestNodeViewModel | EditableNode | null | undefined): string | null {
  if (!node) {
    return null;
  }
  const req: any = node.requirements ?? {};
  if (Array.isArray(req.zoneNames) && req.zoneNames.length > 0) {
    return req.zoneNames.join(', ');
  }
  if (typeof req.zones === 'string' && req.zones.trim().length > 0) {
    const tokens = req.zones
      .replace(/^zones?:/i, '')
      .split(/[,;|^]/)
      .map((part: string) => part.trim())
      .filter((part: string) => part.length > 0);
    if (tokens.length) {
      return tokens.join(', ');
    }
  }
  if (node.description?.toLowerCase().startsWith('zones:')) {
    const tokens = node.description
      .replace(/^zones?:/i, '')
      .split(/[,;|^]/)
      .map((part: string) => part.trim())
      .filter((part: string) => part.length > 0);
    if (tokens.length) {
      return tokens.join(', ');
    }
  }
  return node.description || null;
}

type GuildNodePin = {
  assignmentId: string;
  characterName: string;
  classLabel: string;
  icon: string | null;
  fallback: string;
  tooltip: string;
};

const MAX_DISPLAYED_GUILD_PINS = 6;
const GROUP_NODE_PIN_LIMIT = 2;

const groupNodeIds = computed(() => new Set((detail.value?.nodes ?? []).filter((node) => node.isGroup).map((node) => node.id)));

const guildNodePinsById = computed(() => {
  const map = new Map<string, GuildNodePin[]>();
  const nodes = detail.value?.nodes ?? [];
  if (!nodes.length) {
    return map;
  }
  const nodeIndex = new Map(nodes.map((node) => [node.id, node]));
  const parents = parentNodeMap.value;
  const children = childNodeMap.value;
  for (const assignment of guildAssignments.value) {
    if (!assignment.character) {
      continue;
    }
    if (assignment.status === 'COMPLETED' || assignment.status === 'CANCELLED') {
      continue;
    }
    const nextNodeIds = findNextNodeIdsForAssignment(assignment, nodes, nodeIndex, parents, children);
    if (!nextNodeIds.length) {
      continue;
    }
    const classLabel = characterClassLabels[assignment.character.class] ?? assignment.character.class;
    const tooltipParts = [assignment.character.name];
    if (assignment.user?.displayName && assignment.user.displayName !== assignment.character.name) {
      tooltipParts.push(`— ${assignment.user.displayName}`);
    }
    const icon = getCharacterClassIcon(assignment.character.class);
    const fallback = assignment.character.class?.[0] ?? assignment.character.name[0] ?? '?';
    for (const nextNodeId of nextNodeIds) {
      const entry = map.get(nextNodeId) ?? [];
      entry.push({
        assignmentId: assignment.id,
        characterName: assignment.character.name,
        classLabel,
        icon,
        fallback,
        tooltip: tooltipParts.join(' ')
      });
      entry.sort((a, b) => a.characterName.localeCompare(b.characterName));
      map.set(nextNodeId, entry);
    }
  }
  return map;
});

const guildIconNodeIds = computed(() => {
  const ids = new Set<string>();
  guildNodePinsById.value.forEach((_, nodeId) => ids.add(nodeId));
  return ids;
});

function guildPinsForNode(nodeId: string): GuildNodePin[] {
  return guildNodePinsById.value.get(nodeId) ?? [];
}

function pinDisplayLimit(nodeId: string) {
  return groupNodeIds.value.has(nodeId) ? GROUP_NODE_PIN_LIMIT : MAX_DISPLAYED_GUILD_PINS;
}

function visibleGuildPins(nodeId: string): GuildNodePin[] {
  const limit = pinDisplayLimit(nodeId);
  return guildPinsForNode(nodeId).slice(0, limit);
}

function guildPinOverflowCount(nodeId: string): number {
  const total = guildPinsForNode(nodeId).length;
  const limit = pinDisplayLimit(nodeId);
  return total > limit ? total - limit : 0;
}

const guildPinModalNode = computed(() =>
  detail.value?.nodes?.find((node) => node.id === guildPinModalNodeId.value) ?? null
);

const guildPinModalPins = computed(() =>
  guildPinModalNodeId.value ? guildPinsForNode(guildPinModalNodeId.value) : []
);

const guildPinModalTotalPages = computed(() => {
  const total = guildPinModalPins.value.length;
  return total ? Math.ceil(total / GUILD_PIN_MODAL_PAGE_SIZE) : 1;
});

const guildPinModalVisiblePins = computed(() => {
  const start = (guildPinModalPage.value - 1) * GUILD_PIN_MODAL_PAGE_SIZE;
  return guildPinModalPins.value.slice(start, start + GUILD_PIN_MODAL_PAGE_SIZE);
});

function nextGuildPinPage() {
  if (guildPinModalPage.value < guildPinModalTotalPages.value) {
    guildPinModalPage.value += 1;
  }
}

function prevGuildPinPage() {
  if (guildPinModalPage.value > 1) {
    guildPinModalPage.value -= 1;
  }
}

function nextCharacterModalPage() {
  if (characterModalPage.value < characterModalTotalPages.value) {
    characterModalPage.value += 1;
  }
}

function prevCharacterModalPage() {
  if (characterModalPage.value > 1) {
    characterModalPage.value -= 1;
  }
}

function findNextNodeIdsForAssignment(
  assignment: QuestAssignment,
  nodes: QuestNodeViewModel[],
  nodeIndex: Map<string, QuestNodeViewModel>,
  parents: Map<string, NodeAdjacencyEntry[]>,
  children: Map<string, NodeAdjacencyEntry[]>
): string[] {
  const progressMap = new Map(assignment.progress.map((record) => [record.nodeId, record]));

  const isNodeActionable = (nodeId: string): boolean => {
    const node = nodeIndex.get(nodeId);
    if (!node || node.isOptional) {
      return false;
    }
    const progressRecord = progressMap.get(nodeId);
    if (progressRecord?.isDisabled) {
      return false;
    }
    if (progressRecord?.status === 'COMPLETED') {
      return false;
    }
    return true;
  };

  const areRequiredParentsComplete = (nodeId: string): boolean => {
    const parentEntries = parents.get(nodeId) ?? [];
    if (parentEntries.length === 0) {
      return true;
    }
    for (const entry of parentEntries) {
      if (entry.isOptional) {
        continue;
      }
      // Both regular links and "next step" links require their parent to be completed
      // The difference is that "next step" links represent sequential progression,
      // while regular links represent fork branches that all need completion
      const parentProgress = progressMap.get(entry.nodeId);
      if (!parentProgress || parentProgress.status !== 'COMPLETED') {
        return false;
      }
    }
    return true;
  };

  // Check if a group node has any non-group (actionable) children
  const hasActionableChildren = (nodeId: string): boolean => {
    const childEntries = children.get(nodeId) ?? [];
    for (const entry of childEntries) {
      if (entry.isOptional || entry.isNextStep) {
        continue;
      }
      const childNode = nodeIndex.get(entry.nodeId);
      if (childNode && !childNode.isGroup) {
        return true;
      }
    }
    return false;
  };

  // Get the non-optional, non-next-step child group nodes
  const getChildGroupNodes = (nodeId: string): string[] => {
    const childEntries = children.get(nodeId) ?? [];
    const result: string[] = [];
    for (const entry of childEntries) {
      if (entry.isOptional || entry.isNextStep) {
        continue;
      }
      const childNode = nodeIndex.get(entry.nodeId);
      if (childNode?.isGroup) {
        result.push(entry.nodeId);
      }
    }
    return result;
  };

  // Resolve a group node to the appropriate display level
  // If all children are groups, drill down to those groups instead
  const resolveGroupDisplayNodes = (nodeId: string): string[] => {
    const node = nodeIndex.get(nodeId);
    if (!node?.isGroup) {
      return [nodeId];
    }

    // If this group has actionable (non-group) children, show pin here
    if (hasActionableChildren(nodeId)) {
      return [nodeId];
    }

    // Otherwise, drill down to child group nodes
    const childGroups = getChildGroupNodes(nodeId);
    if (childGroups.length === 0) {
      // No children at all, show on this node
      return [nodeId];
    }

    // Recursively resolve each child group
    const resolved: string[] = [];
    for (const childGroupId of childGroups) {
      resolved.push(...resolveGroupDisplayNodes(childGroupId));
    }
    return resolved.length > 0 ? resolved : [nodeId];
  };

  const frontierNodeIds: string[] = [];
  for (const node of nodes) {
    if (!isNodeActionable(node.id)) {
      continue;
    }
    if (!areRequiredParentsComplete(node.id)) {
      continue;
    }
    frontierNodeIds.push(node.id);
  }

  if (frontierNodeIds.length === 0) {
    return [];
  }

  // Group frontier nodes by their group parent (if any)
  const groupedByParent = new Map<string | null, string[]>();
  for (const nodeId of frontierNodeIds) {
    const node = nodeIndex.get(nodeId);
    if (node?.isGroup) {
      // Group nodes - resolve to appropriate display level
      const displayNodes = resolveGroupDisplayNodes(nodeId);
      for (const displayId of displayNodes) {
        const list = groupedByParent.get(displayId) ?? [];
        list.push(displayId);
        groupedByParent.set(displayId, list);
      }
      continue;
    }
    const parentEntries = parents.get(nodeId) ?? [];
    const groupParent = parentEntries.find((entry) => Boolean(nodeIndex.get(entry.nodeId)?.isGroup));
    const groupKey = groupParent?.nodeId ?? null;
    const list = groupedByParent.get(groupKey) ?? [];
    list.push(nodeId);
    groupedByParent.set(groupKey, list);
  }

  const resolvedIds = new Set<string>();
  for (const [groupParentId, nodeIds] of groupedByParent) {
    if (groupParentId === null) {
      // Nodes without a group parent - show pins on the nodes themselves
      nodeIds.forEach((id) => resolvedIds.add(id));
    } else if (nodeIds.length === 1 && !nodeIndex.get(nodeIds[0])?.isGroup) {
      // Single child under a group - roll up to the group parent
      resolvedIds.add(groupParentId);
    } else {
      // Multiple children under the same group (fork) OR the node is itself a group
      // Show pins on each individual branch to indicate all branches need completion
      nodeIds.forEach((id) => resolvedIds.add(id));
    }
  }

  return Array.from(resolvedIds);
}

function resolveGroupPinTarget(
  nodeId: string,
  nodeIndex: Map<string, QuestNodeViewModel>,
  parents: Map<string, NodeAdjacencyEntry[]>
): string {
  const node = nodeIndex.get(nodeId);
  if (node?.isGroup) {
    return nodeId;
  }
  const parentEntries = parents.get(nodeId) ?? [];
  const groupParent = parentEntries.find((entry) => Boolean(nodeIndex.get(entry.nodeId)?.isGroup));
  return groupParent ? groupParent.nodeId : nodeId;
}

function buildWikiMarkup(detail: QuestBlueprintDetailPayload): string {
  const lines: string[] = [];
  const title = detail.blueprint.title || 'Quest Blueprint';
  lines.push(`= ${title} =`);
  if (detail.blueprint.summary) {
    lines.push(detail.blueprint.summary);
  }
  lines.push(`;Visibility: ${detail.blueprint.visibility}`);
  const editedBy = detail.blueprint.lastEditedByName ?? detail.blueprint.createdByName ?? 'Unknown member';
  lines.push(`;Last Edited By: ${editedBy}`);
  lines.push(`;Steps: ${detail.nodes.length}`);
  lines.push('');
  lines.push('== Quest Structure ==');
  lines.push(...renderWikiNodes(detail.nodes, detail.links));
  return lines.join('\n');
}

function renderWikiNodes(nodes: QuestNodeViewModel[], links: QuestNodeLinkViewModel[]): string[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const parentMap = new Map<string, string[]>();
  links.forEach((link) => {
    const list = children.get(link.parentNodeId) ?? [];
    list.push(link.childNodeId);
    children.set(link.parentNodeId, list);
    const parents = parentMap.get(link.childNodeId) ?? [];
    parents.push(link.parentNodeId);
    parentMap.set(link.childNodeId, parents);
  });
  const roots = nodes.filter((node) => !(parentMap.get(node.id)?.length));
  const sections: string[] = [];
  const visited = new Set<string>();
  const sortNodes = (a: QuestNodeViewModel, b: QuestNodeViewModel) =>
    a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  const sortedRoots = roots.length ? [...roots].sort(sortNodes) : [...nodes].sort(sortNodes);

  const renderNode = (nodeId: string, depth = 0) => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }
    const bullet = '*'.repeat(Math.max(depth + 1, 1));
    const title = node.title || 'Quest Step';
    const typeLabel = displayNodeType(node.nodeType, node.isGroup);
    const description = node.description ? ` — ${node.description}` : '';
    const flags: string[] = [];
    if (node.isGroup) {
      flags.push('Group');
    }
    if (node.isFinal) {
      flags.push('Final step');
    }
    if (node.isOptional) {
      flags.push('Optional');
    }
    const flagString = flags.length ? ` ''[${flags.join(', ')}]''` : '';
    sections.push(`${bullet} '''${title}''' (${typeLabel})${description}${flagString}`);

    const requirementText = formatRequirementDetails(node.requirements);
    if (requirementText) {
      sections.push(`${bullet}* Requirements: ${requirementText}`);
    }

    const childIds = [...(children.get(nodeId) ?? [])].sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      if (!nodeA || !nodeB) {
        return 0;
      }
      return sortNodes(nodeA, nodeB);
    });
    childIds.forEach((childId) => renderNode(childId, depth + 1));
  };

  sortedRoots.forEach((root) => renderNode(root.id));
  return sections;
}

function formatRequirementDetails(requirements: Record<string, any> | undefined): string {
  if (!requirements) {
    return '';
  }
  const parts: string[] = [];
  Object.entries(requirements).forEach(([key, value]) => {
    if (value == null || value === '') {
      return;
    }
    if (typeof value === 'object') {
      parts.push(`${key}: ${JSON.stringify(value)}`);
      return;
    }
    if (key === 'count') {
      parts.push(`${value}x`);
      return;
    }
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (match) => match.toUpperCase());
    parts.push(`${label}: ${value}`);
  });
  return parts.join('; ');
}

function handleGuildAssignmentClick(assignmentId: string) {
  if (guildFocusAssignmentId.value === assignmentId && activeTab.value === 'overview') {
    return;
  }
  guildFocusAssignmentId.value = assignmentId;
  setTab('overview');
  closeGuildPinModal();
}

function clearGuildAssignmentFocus() {
  guildFocusAssignmentId.value = null;
  showGuildIntroHighlight.value = false;
}

function openGuildPinModal(nodeId: string) {
  guildPinModalNodeId.value = nodeId;
  showGuildPinModal.value = true;
}

function closeGuildPinModal() {
  showGuildPinModal.value = false;
  guildPinModalNodeId.value = null;
}

function selectBlueprint(id: string) {
  if (selectedBlueprintId.value === id) {
    return;
  }
  if (pendingViewerBlueprintId.value !== id) {
    pendingViewerCharacterId.value = null;
    pendingViewerBlueprintId.value = null;
  }
  selectedBlueprintId.value = id;
}

function resolveFolderIcon(iconKey: string | null) {
  if (!iconKey) {
    return null;
  }
  return `/class-icons/${encodeURIComponent(iconKey)}`;
}

function handleBlueprintContextMenu(event: MouseEvent, blueprintId: string) {
  if (!canManageBlueprints.value) {
    return;
  }
  const target = summary.value?.blueprints?.find((entry) => entry.id === blueprintId);
  if (!target) {
    return;
  }
  event.preventDefault();
  blueprintContextMenu.visible = true;
  blueprintContextMenu.x = event.clientX;
  blueprintContextMenu.y = event.clientY;
  blueprintContextMenu.blueprintId = blueprintId;
}

async function handleRemoveBlueprintFromFolder() {
  const targetId = blueprintContextMenu.blueprintId;
  const blueprint = summary.value?.blueprints?.find((entry) => entry.id === targetId);
  blueprintContextMenu.visible = false;
  blueprintContextMenu.blueprintId = null;
  if (!targetId || !blueprint?.folderId) {
    return;
  }
  await moveBlueprintToFolder(targetId, null, null);
}

async function handleDeleteBlueprint() {
  if (deletingBlueprintId.value) {
    return;
  }
  const targetId = blueprintContextMenu.blueprintId;
  const summaryState = summary.value;
  blueprintContextMenu.visible = false;
  blueprintContextMenu.blueprintId = null;
  if (!targetId || !summaryState || !summaryState.blueprints?.length) {
    return;
  }
  const blueprints = summaryState.blueprints;
  const targetIndex = blueprints.findIndex((entry) => entry.id === targetId);
  if (targetIndex === -1) {
    return;
  }
  const fallbackCandidate =
    blueprints[targetIndex + 1]?.id ?? blueprints[targetIndex - 1]?.id ?? null;
  const target = blueprints[targetIndex];
  const confirmed = window.confirm(`Delete blueprint "${target.title}"? This cannot be undone.`);
  if (!confirmed) {
    return;
  }
  deletingBlueprintId.value = targetId;
  try {
    await api.deleteQuestBlueprint(guildId, targetId);
    await loadSummary();
    if (selectedBlueprintId.value === targetId) {
      const summaryBlueprints = summary.value?.blueprints ?? [];
      if (fallbackCandidate && summaryBlueprints.some((entry) => entry.id === fallbackCandidate)) {
        selectBlueprint(fallbackCandidate);
      } else if (summaryBlueprints[0]) {
        selectBlueprint(summaryBlueprints[0].id);
      } else {
        selectedBlueprintId.value = null;
        detail.value = null;
      }
    }
    showSaveToast('Blueprint deleted.');
  } catch (error) {
    window.alert(extractErrorMessage(error, 'Unable to delete quest blueprint.'));
  } finally {
    deletingBlueprintId.value = null;
  }
}

function navigateToBlueprint(blueprintId: string) {
  if (!blueprintId) {
    return;
  }
  const exists = summary.value?.blueprints?.some((entry) => entry.id === blueprintId);
  if (!exists) {
    return;
  }
  pendingViewerCharacterId.value = activeViewerAssignment.value?.character?.id ?? null;
  pendingViewerBlueprintId.value = blueprintId;
  selectBlueprint(blueprintId);
}

function handleBlueprintDragStart(blueprintId: string) {
  if (!canDragBlueprints.value) {
    return;
  }
  draggingBlueprintId.value = blueprintId;
  dragOverFolderId.value = null;
  dragOverBlueprintId.value = null;
  scrollDirection.value = null;
  if (!scrollTicker.value) {
    scrollTicker.value = window.setInterval(applyAutoScroll, 16);
  }
  dragScrollState.active = true;
  dragScrollState.baseX = window.scrollX;
  dragScrollState.baseY = window.scrollY;
}

function handleBlueprintDragEnd() {
  draggingBlueprintId.value = null;
  dragOverFolderId.value = null;
  dragOverBlueprintId.value = null;
  scrollDirection.value = null;
  if (scrollTicker.value) {
    window.clearInterval(scrollTicker.value);
    scrollTicker.value = null;
  }
  dragScrollState.active = false;
  dragScrollState.baseX = window.scrollX;
  dragScrollState.baseY = window.scrollY;
  if (dragScrollState.resetFrame) {
    cancelAnimationFrame(dragScrollState.resetFrame);
    dragScrollState.resetFrame = null;
  }
}

function handleFolderDragOver(folderId: string | null, event: DragEvent) {
  if (!draggingBlueprintId.value || !canDragBlueprints.value) {
    return;
  }
  event.preventDefault();
  dragOverFolderId.value = folderId;
  dragOverBlueprintId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  scrollDirection.value = getScrollDirection(event);
}

function handleBlueprintDragOver(folderId: string | null, blueprintId: string, event: DragEvent) {
  if (!draggingBlueprintId.value || !canDragBlueprints.value || draggingBlueprintId.value === blueprintId) {
    return;
  }
  event.preventDefault();
  dragOverFolderId.value = folderId;
  dragOverBlueprintId.value = blueprintId;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  scrollDirection.value = getScrollDirection(event);
}

async function handleFolderDrop(folderId: string | null, event?: DragEvent) {
  if (event) {
    event.preventDefault();
  }
  if (!draggingBlueprintId.value || !canDragBlueprints.value) {
    return;
  }
  const blueprintId = draggingBlueprintId.value;
  handleBlueprintDragEnd();
  await moveBlueprintToFolder(blueprintId, folderId, null);
}

async function handleBlueprintDrop(folderId: string | null, beforeBlueprintId: string, event?: DragEvent) {
  if (event) {
    event.preventDefault();
  }
  if (
    !draggingBlueprintId.value ||
    !canDragBlueprints.value ||
    draggingBlueprintId.value === beforeBlueprintId
  ) {
    return;
  }
  const blueprintId = draggingBlueprintId.value;
  handleBlueprintDragEnd();
  await moveBlueprintToFolder(blueprintId, folderId, beforeBlueprintId);
}

function handleFolderListDragOver(event: DragEvent) {
  if (!draggingBlueprintId.value) {
    return;
  }
  event.preventDefault();
  scrollDirection.value = getScrollDirection(event);
}

function handleFolderListDragEnter(event: DragEvent) {
  if (!draggingBlueprintId.value) {
    return;
  }
  event.preventDefault();
  scrollDirection.value = getScrollDirection(event);
}

function getScrollDirection(event: DragEvent): 'up' | 'down' | null {
  const container = folderListRef.value;
  if (!container) {
    return null;
  }
  if (container.scrollHeight <= container.clientHeight) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  const viewportTop = Math.max(rect.top, 0);
  const viewportBottom = Math.min(rect.bottom, window.innerHeight);
  const visibleHeight = viewportBottom - viewportTop;
  if (visibleHeight <= 0) {
    return null;
  }
  const threshold = Math.min(80, visibleHeight / 2);
  if (event.clientY < viewportTop + threshold) {
    return 'up';
  }
  if (event.clientY > viewportBottom - threshold) {
    return 'down';
  }
  return null;
}

function applyAutoScroll() {
  if (!scrollDirection.value || !folderListRef.value) {
    return;
  }
  const container = folderListRef.value;
  const speed = 12;
  if (scrollDirection.value === 'up') {
    container.scrollTop = Math.max(container.scrollTop - speed, 0);
  } else if (scrollDirection.value === 'down') {
    container.scrollTop = Math.min(
      container.scrollTop + speed,
      container.scrollHeight - container.clientHeight
    );
  }
}

async function moveBlueprintToFolder(
  blueprintId: string,
  folderId: string | null,
  beforeBlueprintId: string | null
) {
  const updates = buildFolderReorderUpdates(blueprintId, folderId, beforeBlueprintId);
  if (!updates?.length) {
    return;
  }
  blueprintReorderLoading.value = true;
  try {
    await api.reorderQuestBlueprints(guildId, updates);
    showSaveToast('Blueprint order updated.');
  } catch (error) {
    await loadSummary();
    window.alert('Unable to update blueprint order. Please try again.');
  } finally {
    blueprintReorderLoading.value = false;
  }
}

function buildFolderReorderUpdates(
  blueprintId: string,
  targetFolderId: string | null,
  beforeBlueprintId: string | null
) {
  if (!summary.value?.blueprints?.length) {
    return null;
  }
  const blueprint = summary.value.blueprints.find((entry) => entry.id === blueprintId);
  if (!blueprint) {
    return null;
  }
  const targetKey = targetFolderId ?? null;
  const folderMap = new Map<string | null, QuestBlueprintSummaryLite[]>();
  for (const entry of summary.value.blueprints) {
    const key = entry.folderId ?? null;
    const bucket = folderMap.get(key) ?? [];
    bucket.push(entry);
    folderMap.set(key, bucket);
  }
  folderMap.forEach((bucket) =>
    bucket.sort((a, b) => {
      if (a.folderSortOrder !== b.folderSortOrder) {
        return a.folderSortOrder - b.folderSortOrder;
      }
      return a.title.localeCompare(b.title);
    })
  );
  const sourceKey = blueprint.folderId ?? null;
  const sourceBucket = folderMap.get(sourceKey) ?? [];
  const existingIndex = sourceBucket.findIndex((entry) => entry.id === blueprintId);
  if (existingIndex !== -1) {
    sourceBucket.splice(existingIndex, 1);
  }
  const targetBucket = folderMap.get(targetKey) ?? [];
  if (!folderMap.has(targetKey)) {
    folderMap.set(targetKey, targetBucket);
  }
  if (beforeBlueprintId) {
    const insertIndex = targetBucket.findIndex((entry) => entry.id === beforeBlueprintId);
    if (insertIndex >= 0) {
      targetBucket.splice(insertIndex, 0, blueprint);
    } else {
      targetBucket.push(blueprint);
    }
  } else {
    targetBucket.push(blueprint);
  }
  blueprint.folderId = targetKey;
  const affectedFolders = new Set<string | null>([sourceKey, targetKey]);
  const updates: Array<{ blueprintId: string; folderId?: string | null; sortOrder: number }> = [];
  for (const folderKey of affectedFolders) {
    const bucket = folderMap.get(folderKey);
    if (!bucket) {
      continue;
    }
    bucket.forEach((entry, index) => {
      entry.folderId = folderKey;
      entry.folderSortOrder = index + 1;
      updates.push({
        blueprintId: entry.id,
        folderId: folderKey,
        sortOrder: entry.folderSortOrder
      });
    });
  }
  return updates;
}

async function handleCreateFolder() {
  if (!canCreateFolders.value) {
    return;
  }
  const name = window.prompt('Enter a folder name');
  const title = name?.trim();
  if (!title) {
    return;
  }
  try {
    const folder = await api.createQuestFolder(guildId, { title });
    if (summary.value) {
      const nextFolders = [...(summary.value.folders ?? []), folder].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.title.localeCompare(b.title);
      });
      summary.value.folders = nextFolders;
    }
    sidebarSearch.value = '';
    showSaveToast('Folder created.');
  } catch {
    window.alert('Unable to create folder.');
  }
}

async function handleRenameFolder(folderId: string) {
  if (!canManageBlueprints.value) {
    return;
  }
  const folders = summary.value?.folders;
  if (!folders) {
    return;
  }
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return;
  }
  const name = window.prompt('Rename folder', folder.title);
  const title = name?.trim();
  if (!title || title === folder.title) {
    return;
  }
  try {
    const updated = await api.updateQuestFolder(guildId, folderId, { title });
    folder.title = updated.title;
    showSaveToast('Folder renamed.');
  } catch {
    window.alert('Unable to rename folder.');
  }
}

async function handleDeleteFolder(folderId: string) {
  if (!canManageBlueprints.value) {
    return;
  }
  const summaryState = summary.value;
  if (!summaryState?.folders) {
    return;
  }
  const folders = summaryState.folders;
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return;
  }
  const confirmed = window.confirm(`Delete folder "${folder.title}"? This cannot be undone.`);
  if (!confirmed) {
    return;
  }
  try {
    await api.deleteQuestFolder(guildId, folderId);
    summaryState.folders = folders.filter((entry) => entry.id !== folderId);
    showSaveToast('Folder deleted.');
  } catch {
    window.alert('Unable to delete folder. Make sure it is empty.');
  }
}

function canMoveFolder(folderId: string | null, direction: 'up' | 'down') {
  if (!folderId || !canManageBlueprints.value) {
    return false;
  }
  if (folderReorderLoading.value) {
    return false;
  }
  const index = folderOrderIndex(folderId);
  if (index === -1) {
    return false;
  }
  if (direction === 'up') {
    return index > 0;
  }
  return index < orderedFolders.value.length - 1;
}

async function handleMoveFolder(folderId: string, direction: 'up' | 'down') {
  if (!canMoveFolder(folderId, direction)) {
    return;
  }
  const summaryState = summary.value;
  if (!summaryState?.folders) {
    return;
  }
  const sorted = orderedFolders.value.slice();
  const index = sorted.findIndex((entry) => entry.id === folderId);
  if (index === -1) {
    return;
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) {
    return;
  }
  const [removed] = sorted.splice(index, 1);
  sorted.splice(targetIndex, 0, removed);
  sorted.forEach((folder, idx) => {
    folder.sortOrder = idx + 1;
  });
  summaryState.folders = sorted;
  folderReorderLoading.value = true;
  try {
    await api.reorderQuestFolders(
      guildId,
      sorted.map((folder, idx) => ({ folderId: folder.id, sortOrder: idx + 1 }))
    );
    showSaveToast('Folder order updated.');
  } catch {
    window.alert('Unable to reorder folders.');
    await loadSummary();
  } finally {
    folderReorderLoading.value = false;
  }
}

function syncViewerAssignmentState(blueprintId: string | null, assignment: QuestAssignment) {
  const applyUpdate = (current: QuestAssignment[] | undefined) => {
    const list = [...(current ?? [])];
    const index = list.findIndex((entry) => entry.id === assignment.id);
    if (assignment.status === 'CANCELLED') {
      if (index !== -1) {
        list.splice(index, 1);
      }
      return list;
    }
    if (index !== -1) {
      list[index] = assignment;
    } else {
      list.unshift(assignment);
    }
    return list;
  };

  const maybeUpdateSelection = (assignments: QuestAssignment[]) => {
    if (!assignments.length) {
      selectedAssignmentId.value = null;
      return;
    }
    if (assignment.status === 'CANCELLED' && selectedAssignmentId.value === assignment.id) {
      selectedAssignmentId.value = assignments[0]?.id ?? null;
    } else if (assignment.status !== 'CANCELLED') {
      selectedAssignmentId.value = assignment.id;
    }
  };

  if (detail.value && (!blueprintId || detail.value.blueprint.id === blueprintId)) {
    const updated = applyUpdate(detail.value.viewerAssignments);
    detail.value.viewerAssignments = updated;
    detail.value.viewerAssignment = updated[0] ?? null;
    maybeUpdateSelection(updated);
  }

  if (!blueprintId) {
    return;
  }

  const summaryBlueprints = summary.value?.blueprints;
  if (!summaryBlueprints) {
    return;
  }
  const target = summaryBlueprints.find((entry) => entry.id === blueprintId);
  if (target) {
    const updated = applyUpdate(target.viewerAssignments);
    target.viewerAssignments = updated;
    target.viewerAssignment = updated[0] ?? null;
  }
}

async function loadSummary(initial = false) {
  loadingSummary.value = true;
  summaryError.value = null;
  try {
    const data = await api.fetchQuestTracker(guildId);
    summary.value = data;
    if (initial && !selectedBlueprintId.value && data.blueprints.length) {
      // Check for blueprintId query parameter from share link
      const queryBlueprintId = typeof route.query.blueprintId === 'string' ? route.query.blueprintId : null;
      const targetBlueprintId = queryBlueprintId && data.blueprints.some((bp) => bp.id === queryBlueprintId)
        ? queryBlueprintId
        : data.blueprints[0].id;
      selectBlueprint(targetBlueprintId);
    }
  } catch (error) {
    summaryError.value = extractErrorMessage(error, 'Failed to load quest tracker.');
    throw error;
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
    editableNodes.value = response.nodes.map((node) => buildEditableNode(node)) as EditableNode[];
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
    await nextTick();
    alignViewerAssignmentToPendingCharacter(response.viewerAssignments ?? [], blueprintId);
    // Handle assignmentId query parameter from share link
    const queryAssignmentId = typeof route.query.assignmentId === 'string' ? route.query.assignmentId : null;
    if (queryAssignmentId && response.guildAssignments?.some((a) => a.id === queryAssignmentId)) {
      guildFocusAssignmentId.value = queryAssignmentId;
      setTab('overview');
    }
  } finally {
    loadingDetail.value = false;
  }
}

function updateTabAvailability() {
  if (activeTab.value === 'editor' && !canEditBlueprint.value) {
    activeTab.value = 'overview';
  }
  if (activeTab.value === 'guild' && !permissions.value?.canViewGuildBoard) {
    activeTab.value = 'overview';
  }
}

function alignViewerAssignmentToPendingCharacter(assignments: QuestAssignment[], blueprintId: string) {
  const characterId = pendingViewerCharacterId.value;
  const targetBlueprintId = pendingViewerBlueprintId.value;
  pendingViewerCharacterId.value = null;
  pendingViewerBlueprintId.value = null;
  if (!characterId || !assignments?.length || targetBlueprintId !== blueprintId) {
    return;
  }
  const match = assignments.find((assignment) => assignment.character?.id === characterId);
  if (match) {
    selectedAssignmentId.value = match.id;
  }
}

function setTab(tab: 'overview' | 'editor' | 'guild') {
  activeTab.value = tab;
}

function resetCanvasTransform() {
  requestEditorFit();
  requestOverviewFit();
}

function retryLoadSummary() {
  const treatAsInitial = !summary.value;
  loadSummary(treatAsInitial).catch((error) => console.error('Failed to load quest tracker', error));
}

function toggleStepSettings() {
  if (!selectedNodeId.value && editableNodes.value.length) {
    setSelectedNodes([editableNodes.value[0].id]);
  }
  showStepSettings.value = !showStepSettings.value;
}

function openBlueprintJsonModal() {
  if (!detail.value) {
    return;
  }
  blueprintJsonCopied.value = false;
  showBlueprintJsonModal.value = true;
}

function closeBlueprintJsonModal() {
  showBlueprintJsonModal.value = false;
}

function openBlueprintWikiModal() {
  if (!detail.value) {
    return;
  }
  blueprintWikiCopied.value = false;
  showBlueprintWikiModal.value = true;
}

function closeBlueprintWikiModal() {
  showBlueprintWikiModal.value = false;
}

async function copyBlueprintJson() {
  try {
    await navigator.clipboard.writeText(blueprintJsonText.value);
    blueprintJsonCopied.value = true;
  } catch {
    blueprintJsonCopied.value = false;
    window.alert('Unable to copy blueprint JSON.');
  }
}

async function copyBlueprintWiki() {
  try {
    await navigator.clipboard.writeText(blueprintWikiText.value);
    blueprintWikiCopied.value = true;
  } catch {
    blueprintWikiCopied.value = false;
    window.alert('Unable to copy MediaWiki export.');
  }
}

function startBlueprintTitleEdit() {
  if (!detail.value?.blueprint || !canRenameBlueprint.value) {
    return;
  }
  blueprintTitleDraft.value = detail.value.blueprint.title;
  editingBlueprintTitle.value = true;
  nextTick(() => {
    blueprintTitleInputRef.value?.focus();
    blueprintTitleInputRef.value?.select?.();
  });
}

function cancelBlueprintTitleEdit() {
  if (renamingBlueprintTitle.value) {
    return;
  }
  editingBlueprintTitle.value = false;
  blueprintTitleDraft.value = '';
}

async function submitBlueprintTitleEdit() {
  if (!editingBlueprintTitle.value || !detail.value?.blueprint || !selectedBlueprintId.value) {
    return;
  }
  const trimmed = blueprintTitleDraft.value.trim();
  if (!trimmed) {
    window.alert('Blueprint title is required.');
    return;
  }
  if (trimmed === detail.value.blueprint.title) {
    editingBlueprintTitle.value = false;
    return;
  }
  renamingBlueprintTitle.value = true;
  try {
    const updated = await api.updateQuestBlueprint(guildId, selectedBlueprintId.value, {
      title: trimmed
    });
    if (detail.value) {
      detail.value.blueprint = { ...detail.value.blueprint, ...updated };
      lastSavedAt.value = updated.updatedAt ?? lastSavedAt.value;
      lastSavedBy.value = updated.lastEditedByName ?? lastSavedBy.value;
    }
    blueprintMetaForm.title = trimmed;
    await loadSummary();
    showSaveToast('Blueprint renamed');
    editingBlueprintTitle.value = false;
  } catch (error) {
    showSaveError(extractErrorMessage(error, 'Unable to rename blueprint.'));
  } finally {
    renamingBlueprintTitle.value = false;
  }
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
  if (activeTab.value !== 'editor' || !canEditBlueprint.value) {
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

async function copyQuestShareLink() {
  const assignmentId = viewerAssignmentId.value;
  if (!assignmentId) {
    return;
  }
  // Use short URL format: /q/:assignmentId
  const resolved = router.resolve({
    name: 'QuestShare',
    params: { assignmentId }
  }).href;
  const absoluteUrl = typeof window !== 'undefined'
    ? new URL(resolved, window.location.origin).toString()
    : resolved;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(absoluteUrl);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = absoluteUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showSaveToast('Quest progress link copied to clipboard');
  } catch (error) {
    console.warn('Failed to copy quest share link', error);
    showSaveToast('Unable to copy link');
  }
}

function showSaveError(message: string) {
  saveErrorModal.message = message;
  saveErrorModal.open = true;
}

function hideContextMenu() {
  contextMenu.visible = false;
  contextMenu.nodeId = null;
  contextMenu.linkId = null;
  blueprintContextMenu.visible = false;
  blueprintContextMenu.blueprintId = null;
}

function positionContextMenu(event: MouseEvent, width = 200, height = 140) {
  const maxX = window.innerWidth - width;
  const maxY = window.innerHeight - height;
  contextMenu.x = Math.max(0, Math.min(event.clientX, maxX));
  contextMenu.y = Math.max(0, Math.min(event.clientY, maxY));
}

function openCanvasMenu(event: MouseEvent) {
  const isEditorContext = activeTab.value === 'editor' && canEditBlueprint.value;
  const isOverviewContext = activeTab.value === 'overview';
  const isGuildContext = activeTab.value === 'guild' && isGuildView.value;
  if (!isEditorContext && !isOverviewContext && !isGuildContext) {
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

function openNodeMenu(node: QuestNodeViewModel, event: MouseEvent) {
  const isEditorContext = activeTab.value === 'editor' && canEditBlueprint.value;
  const isViewerContext = activeTab.value === 'overview' && canUpdateNodeProgress.value;
  if (!isEditorContext && !isViewerContext) {
    return;
  }
  hideContextMenu();
  if (isEditorContext) {
    if (!isNodeSelected(node.id)) {
      selectNode(node.id);
    }
    positionContextMenu(event);
    contextMenu.type = 'editor-node';
  } else {
    positionContextMenu(event, 220, 220);
    contextMenu.type = 'viewer-node';
  }
  contextMenu.visible = true;
  contextMenu.nodeId = node.id;
}

function openLinkMenu(link: RenderedLink, event: MouseEvent) {
  if (activeTab.value !== 'editor' || !canEditBlueprint.value) {
    return;
  }
  if (!isGroupNode(link.parentNodeId)) {
    return;
  }
  const target = editableLinks.value.find((entry) => entry.id === link.id);
  if (!target) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  hideContextMenu();
  positionContextMenu(event, 200, 140);
  contextMenu.visible = true;
  contextMenu.type = 'editor-link';
  contextMenu.linkId = target.id;
}

function updateLinkNextStepState(linkId: string, nextStep: boolean) {
  const index = editableLinks.value.findIndex((link) => link.id === linkId);
  if (index === -1) {
    return;
  }
  const target = editableLinks.value[index];
  const conditions: Record<string, unknown> = { ...(target.conditions ?? {}) };
  if (nextStep) {
    conditions[NEXT_STEP_CONDITION_KEY] = true;
  } else if (NEXT_STEP_CONDITION_KEY in conditions) {
    delete conditions[NEXT_STEP_CONDITION_KEY];
  }
  editableLinks.value[index] = {
    ...target,
    conditions
  };
  dirtyGraph.value = true;
}

function handleLinkNextStepToggle(nextStep: boolean) {
  if (!contextMenu.linkId) {
    return;
  }
  updateLinkNextStepState(contextMenu.linkId, nextStep);
  hideContextMenu();
}

function handleCanvasAddNode() {
  if (!canEditBlueprint.value) {
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
  if (!selectedBlueprintId.value || !canEditBlueprint.value) {
    return;
  }
  showBlueprintSettings.value = true;
  hideContextMenu();
}

function handleAddChildFromMenu() {
  if (!contextMenu.nodeId) {
    return;
  }
  if (!canEditBlueprint.value) {
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

function handleDuplicateNodeFromMenu() {
  if (!contextMenu.nodeId || !canEditBlueprint.value) {
    hideContextMenu();
    return;
  }
  const newId = duplicateNode(contextMenu.nodeId);
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
  if (!canEditBlueprint.value) {
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

function collectNodeWithDescendants(nodeId: string) {
  return [nodeId, ...getGroupDescendants(nodeId)];
}

async function applyViewerDisableUpdates(nodeIds: string[], disabled: boolean) {
  const assignmentId = viewerAssignmentId.value;
  if (!assignmentId) {
    window.alert('Start the quest before adjusting steps.');
    return;
  }
  const blueprintId = detail.value?.blueprint.id ?? null;
  progressUpdating.value = true;
  try {
    const assignment = await api.updateQuestAssignmentProgress(
      guildId,
      assignmentId,
      nodeIds.map((id) => ({ nodeId: id, isDisabled: disabled }))
    );
    syncViewerAssignmentState(blueprintId, assignment);
    await loadSummary();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to update step visibility.');
  } finally {
    progressUpdating.value = false;
  }
}

async function handleDisableNodeFromMenu() {
  if (!contextMenu.nodeId || !canUpdateNodeProgress.value) {
    hideContextMenu();
    return;
  }
  const targets = collectNodeWithDescendants(contextMenu.nodeId);
  await applyViewerDisableUpdates(targets, true);
  hideContextMenu();
}

async function handleEnableNodeFromMenu() {
  if (!contextMenu.nodeId || !canUpdateNodeProgress.value) {
    hideContextMenu();
    return;
  }
  const targets = collectNodeWithDescendants(contextMenu.nodeId);
  await applyViewerDisableUpdates(targets, false);
  hideContextMenu();
}

function handleToggleFinalFromMenu() {
  if (!contextMenu.nodeId || !canEditBlueprint.value) {
    hideContextMenu();
    return;
  }
  setNodeFinalFlag(contextMenu.nodeId, !contextMenuNodeFinal.value);
  markDirty();
  hideContextMenu();
}

function handleEditNodeFromMenu() {
  if (!contextMenu.nodeId) {
    return;
  }
  if (!canEditBlueprint.value) {
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

async function handleViewerStatusChange(status: QuestNodeProgressStatus) {
  const nodeId = contextMenu.nodeId;
  hideContextMenu();
  if (!nodeId || progressUpdating.value || isNodeDisabled(nodeId)) {
    return;
  }
  await updateNodeStatus(nodeId, status);
}

async function handleOverviewQuickStatusChange(nodeId: string, status: QuestNodeProgressStatus) {
  if (activeTab.value !== 'overview') {
    return;
  }
  if (!canUpdateNodeProgress.value || progressUpdating.value || isNodeDisabled(nodeId)) {
    return;
  }
  await updateNodeStatus(nodeId, status);
}

async function handleViewerCanvasNodeClick(node: QuestNodeViewModel, event: MouseEvent) {
  if (activeTab.value !== 'overview') {
    return;
  }
  if (event.altKey && !(event.ctrlKey || event.metaKey || event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    await handleOverviewQuickStatusChange(node.id, 'COMPLETED');
  }
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

function toggleFinalFlag(event: Event) {
  if (!selectedNode.value) {
    return;
  }
  const input = event.target as HTMLInputElement;
  setNodeFinalFlag(selectedNode.value.id, input.checked);
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
    metadata: {
      accentColor: DEFAULT_ACCENT_COLOR,
      previousBlueprintIds: [],
      nextBlueprintIds: []
    },
    isGroup: false,
    isOptional: false
  };
  editableNodes.value.push(newNode);
  if (parent) {
    createCanvasLink(parent.id, id, { parentFace: 'right', childFace: 'left' });
  }
  setSelectedNodes([id]);
  dirtyGraph.value = true;
  return id;
}

function duplicateNode(nodeId: string) {
  const source = editableNodes.value.find((node) => node.id === nodeId);
  if (!source) {
    return null;
  }
  const id = crypto.randomUUID?.() ?? `node_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = cloneRecord(source.metadata ?? {});
  metadata.accentColor = ensureAccentColor(metadata.accentColor as string | undefined);
  metadata.previousBlueprintIds = normalizeBlueprintLinkIds(metadata.previousBlueprintIds);
  metadata.nextBlueprintIds = normalizeBlueprintLinkIds(metadata.nextBlueprintIds);
  const requirements = cloneRecord(source.requirements ?? {});
  const duplicate: EditableNode = {
    ...source,
    id,
    position: {
      x: clamp(source.position.x + NODE_DUPLICATE_OFFSET, -2000, 2000),
      y: clamp(source.position.y + NODE_DUPLICATE_OFFSET, -2000, 2000)
    },
    requirements,
    metadata,
    sortOrder: editableNodes.value.length
  };
  editableNodes.value.push(duplicate);
  const parentLinks = editableLinks.value.filter((link) => link.childNodeId === nodeId);
  parentLinks.forEach((link) => {
    editableLinks.value.push({
      id: crypto.randomUUID?.() ?? `link_${Date.now()}_${Math.random()}`,
      parentNodeId: link.parentNodeId,
      childNodeId: id,
      conditions: { ...(link.conditions ?? {}) }
    });
  });
  dirtyGraph.value = true;
  nextTick(() => measureNodeDimensions());
  return id;
}

function createNodeAtPoint(parentId: string, point: Point) {
  const id = addNode(null);
  const node = editableNodes.value.find((entry) => entry.id === id);
  if (!node) {
    return;
  }
  let x = point.x - NODE_WIDTH / 2;
  let y = point.y - NODE_HEIGHT / 2;
  node.position = {
    x: Math.round(x),
    y: Math.round(y)
  };
  const parent = editableNodes.value.find((entry) => entry.id === parentId);
  if (parent) {
    const parentFace = determineConnectorFace(parent, point);
    const childFace = determineChildConnectorFace(parentFace);
    createCanvasLink(parent.id, id, { parentFace, childFace });
  }
  markDirty();
}

function determineConnectorFace(parent: EditableNode, dropPoint: Point): NodeFace {
  const parentCenterX = parent.position.x + NODE_WIDTH / 2;
  const parentCenterY = parent.position.y + NODE_HEIGHT / 2;
  const offsetX = dropPoint.x - parentCenterX;
  const offsetY = dropPoint.y - parentCenterY;
  const absX = Math.abs(offsetX);
  const absY = Math.abs(offsetY);
  if (absX >= absY) {
    return offsetX >= 0 ? 'right' : 'left';
  }
  return offsetY >= 0 ? 'bottom' : 'top';
}

function determineChildConnectorFace(parentFace: NodeFace): NodeFace {
  switch (parentFace) {
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'top':
      return 'bottom';
    case 'bottom':
    default:
      return 'top';
  }
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
  if (
    activeTab.value === 'editor' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isEditableElement(event.target)
  ) {
    const directionKey = event.key.toLowerCase();
    let handled = false;
    if (directionKey === 'arrowleft'.toLowerCase()) {
      handled = alignSelectedNodes('left');
    } else if (directionKey === 'arrowright'.toLowerCase()) {
      handled = alignSelectedNodes('right');
    } else if (directionKey === 'arrowup'.toLowerCase()) {
      handled = alignSelectedNodes('top');
    } else if (directionKey === 'arrowdown'.toLowerCase()) {
      handled = alignSelectedNodes('bottom');
    }
    if (handled) {
      event.preventDefault();
      return;
    }
  }
  if (!isEditableElement(event.target)) {
    if (event.key === 'Alt') {
      isAltProgressMode.value = true;
    }
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
  if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
    isAltProgressMode.value = false;
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
  if (event.altKey) {
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
  const anchorEntry = originPositions.find((entry) => entry.node.id === node.id) ?? originPositions[0];
  if (!anchorEntry) {
    return;
  }
  const pointerId = event.pointerId;
  const anchorSize = getNodeSize(node.id);
  const anchorHalfWidth = anchorSize.width / 2;
  const anchorHalfHeight = anchorSize.height / 2;
  const anchorWidth = anchorHalfWidth * 2;
  const anchorHeight = anchorHalfHeight * 2;
  const anchorCenterX = anchorEntry.x + anchorHalfWidth;
  const anchorCenterY = anchorEntry.y + anchorHalfHeight;
  const resolveDragState = (rawDeltaX: number, rawDeltaY: number, bypass: boolean) => {
    let targetCenterX = anchorCenterX + rawDeltaX;
    let targetCenterY = anchorCenterY + rawDeltaY;
    let targetTopLeftX = targetCenterX - anchorHalfWidth;
    let targetTopLeftY = targetCenterY - anchorHalfHeight;
    let snappedAxisX = false;
    let snappedAxisY = false;
    const guideSnap = applyAlignmentSnap(targetTopLeftX, targetTopLeftY, anchorWidth, anchorHeight);
    targetTopLeftX = guideSnap.x;
    targetTopLeftY = guideSnap.y;
    snappedAxisX = guideSnap.snappedX;
    snappedAxisY = guideSnap.snappedY;
    targetCenterX = targetTopLeftX + anchorHalfWidth;
    targetCenterY = targetTopLeftY + anchorHalfHeight;
    if (!bypass) {
      if (!snappedAxisX) {
        targetCenterX = snapToGrid(targetCenterX);
      }
      if (!snappedAxisY) {
        targetCenterY = snapToGrid(targetCenterY);
      }
    }
    targetTopLeftX = clampNodePosition(targetCenterX - anchorHalfWidth);
    targetTopLeftY = clampNodePosition(targetCenterY - anchorHalfHeight);
    const actualCenterX = targetTopLeftX + anchorHalfWidth;
    const actualCenterY = targetTopLeftY + anchorHalfHeight;
    return {
      deltaX: targetTopLeftX - anchorEntry.x,
      deltaY: targetTopLeftY - anchorEntry.y,
      centerX: actualCenterX,
      centerY: actualCenterY,
      highlightX: bypass ? null : actualCenterX,
      highlightY: bypass ? null : actualCenterY
    };
  };
  const initialState = resolveDragState(0, 0, event.shiftKey);
  updateGridOverlayState(
    initialState.centerX,
    initialState.centerY,
    initialState.highlightX,
    initialState.highlightY,
    event.shiftKey,
    anchorHalfWidth,
    anchorHalfHeight
  );
  updateAlignmentGuides(initialState.centerX, initialState.centerY);
  function moveHandler(moveEvent: PointerEvent) {
    const bypassSnap = moveEvent.shiftKey;
    const rawDeltaX = (moveEvent.clientX - startX) / editorScale.value;
    const rawDeltaY = (moveEvent.clientY - startY) / editorScale.value;
    const dragState = resolveDragState(rawDeltaX, rawDeltaY, bypassSnap);
    originPositions.forEach(({ node: current, x, y }) => {
      current.position.x = clampNodePosition(x + dragState.deltaX);
      current.position.y = clampNodePosition(y + dragState.deltaY);
    });
    updateGridOverlayState(
      dragState.centerX,
      dragState.centerY,
      dragState.highlightX,
      dragState.highlightY,
      bypassSnap
    );
    updateAlignmentGuides(dragState.centerX, dragState.centerY);
    dirtyGraph.value = true;
  }
  function upHandler(upEvent: PointerEvent) {
    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    resetGridOverlayState();
    resetAlignmentGuides();
    (upEvent.target as HTMLElement | undefined)?.releasePointerCapture?.(pointerId);
  }
  document.addEventListener('pointermove', moveHandler);
  document.addEventListener('pointerup', upHandler);
  (event.target as HTMLElement | undefined)?.setPointerCapture?.(event.pointerId);
}

function resetEditorState() {
  if (!detail.value) {
    return;
  }
  editableNodes.value = detail.value.nodes.map((node) => buildEditableNode(node)) as EditableNode[];
  editableLinks.value = detail.value.links.map((link) => ({ ...link }));
  dirtyGraph.value = false;
  setSelectedNodes(editableNodes.value[0] ? [editableNodes.value[0].id] : []);
  nodeHeightOverrides.clear();
  nodeWidthOverrides.clear();
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
        isGroup: node.isGroup,
        isOptional: node.isOptional
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
    editableNodes.value = response.nodes.map((node) => buildEditableNode(node)) as EditableNode[];
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

function startAssignment() {
  if (!selectedBlueprintId.value || assignmentUpdating.value) {
    return;
  }
  openCharacterModal();
}

async function updateAssignmentStatus(status: QuestAssignmentStatus) {
  const blueprintId = selectedBlueprintId.value;
  const assignmentId = viewerAssignmentId.value;
  if (!blueprintId || !assignmentId) {
    return;
  }
  assignmentUpdating.value = true;
  try {
    const assignment = await api.updateQuestAssignmentStatus(
      guildId,
      assignmentId,
      status
    );
    syncViewerAssignmentState(blueprintId, assignment);
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

function openCharacterModal() {
  characterStartError.value = null;
  characterModalError.value = null;
  characterModalPage.value = 1;
  showCharacterModal.value = true;
  if (!charactersLoaded.value && !characterModalLoading.value) {
    loadCharacterOptions().catch((error) => {
      characterModalError.value = extractErrorMessage(error, 'Unable to load characters.');
    });
  }
}

function closeCharacterModal() {
  if (assignmentUpdating.value) {
    return;
  }
  showCharacterModal.value = false;
  characterStartError.value = null;
}

async function loadCharacterOptions() {
  characterModalLoading.value = true;
  characterModalError.value = null;
  try {
    const characters = await api.fetchUserCharacters();
    characterOptions.value = characters;
    charactersLoaded.value = true;
  } catch (error) {
    characterModalError.value = extractErrorMessage(error, 'Unable to load your characters.');
  } finally {
    characterModalLoading.value = false;
  }
}

async function startAssignmentWithCharacter(characterId: string) {
  const blueprintId = selectedBlueprintId.value;
  if (!blueprintId || !characterId) {
    return;
  }
  characterStartError.value = null;
  assignmentUpdating.value = true;
  try {
    const assignment = await api.startQuestAssignment(guildId, blueprintId, { characterId });
    syncViewerAssignmentState(blueprintId, assignment);
    await loadSummary();
    showCharacterModal.value = false;
  } catch (error) {
    characterStartError.value = extractErrorMessage(error, 'Unable to start quest for that character.');
  } finally {
    assignmentUpdating.value = false;
  }
}

async function updateNodeStatus(nodeId: string, status: QuestNodeProgressStatus) {
  const assignmentId = viewerAssignmentId.value;
  if (!assignmentId) {
    return;
  }
  if (isNodeDisabled(nodeId)) {
    progressUpdating.value = false;
    return;
  }
  const blueprintId = detail.value?.blueprint.id ?? null;
  progressUpdating.value = true;
  const shouldAutoComplete = status === 'COMPLETED' && isNodeFinal(nodeId);
  try {
    const updates = new Map<string, QuestNodeProgressStatus>();
    updates.set(nodeId, status);
    const newlyCompleted = new Set<string>();
    if (status === 'COMPLETED') {
      newlyCompleted.add(nodeId);
    }

    const nodeMeta = renderedNodeIndex.value.get(nodeId);
    const nodeIsOptional = nodeMeta?.isOptional ?? false;

    if (!nodeIsOptional) {
      const groupDescendants = getGroupDescendants(nodeId);
      const branchDescendants = getDownstreamNodeIds(nodeId);
      const downstreamIds = Array.from(new Set([...groupDescendants, ...branchDescendants]));
      if (['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED'].includes(status)) {
        downstreamIds.forEach((descendantId) => {
          if (!renderedNodeIndex.value.get(descendantId)?.isOptional) {
            updates.set(descendantId, 'NOT_STARTED');
          }
        });
      }

      const nextStepGroups = getNextStepGroupAncestors(nodeId);
      if (nextStepGroups.length) {
        if (status === 'COMPLETED' || status === 'IN_PROGRESS') {
          nextStepGroups.forEach((groupId) =>
            applyGroupHierarchyStatus(groupId, 'COMPLETED', updates, newlyCompleted, true)
          );
        } else if (status === 'NOT_STARTED' || status === 'BLOCKED') {
          nextStepGroups.forEach((groupId) =>
            applyGroupHierarchyStatus(groupId, 'NOT_STARTED', updates, newlyCompleted)
          );
        }
      }

      if (isGroupNode(nodeId) && status === 'COMPLETED') {
        groupDescendants.forEach((descendantId) => {
          if (!renderedNodeIndex.value.get(descendantId)?.isOptional) {
            updates.set(descendantId, 'COMPLETED');
            newlyCompleted.add(descendantId);
          }
        });
        if (!areAllDescendantsComplete(nodeId, newlyCompleted)) {
          window.alert('Complete all child steps before marking this group as complete.');
          progressUpdating.value = false;
          return;
        }
      }

      if (status === 'COMPLETED' || status === 'IN_PROGRESS') {
        const upstreamIds = getUpstreamNodeIds(nodeId);
        for (const ancestorId of upstreamIds) {
          if (renderedNodeIndex.value.get(ancestorId)?.isOptional) {
            continue;
          }
      if (isGroupNode(ancestorId)) {
        if (areAllDescendantsComplete(ancestorId, newlyCompleted)) {
          updates.set(ancestorId, 'COMPLETED');
          newlyCompleted.add(ancestorId);
        }
        continue;
      }
          updates.set(ancestorId, 'COMPLETED');
          newlyCompleted.add(ancestorId);
        }
      }
    }
    const assignment = await api.updateQuestAssignmentProgress(
      guildId,
      assignmentId,
      Array.from(updates.entries()).map(([targetId, targetStatus]) => ({
        nodeId: targetId,
        status: targetStatus
      }))
    );
    syncViewerAssignmentState(blueprintId, assignment);
    await loadSummary();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to update quest step.');
  } finally {
    progressUpdating.value = false;
    if (shouldAutoComplete) {
      completeAssignment();
    }
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

function openTaskImportModal() {
  if (!isAdmin.value) {
    window.alert('Only admins can import EQ tasks.');
    return;
  }
  showTaskImportModal.value = true;
  eqTaskError.value = null;
  if (!eqTaskResults.value.length) {
    loadEqTasks();
  }
}

function closeTaskImportModal() {
  showTaskImportModal.value = false;
  importingTaskId.value = null;
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

async function loadEqTasks(page?: number) {
  if (page) {
    eqTaskSearch.page = page;
  }
  eqTaskLoading.value = true;
  eqTaskError.value = null;
  try {
    const result = await api.searchEqTasks(guildId, {
      query: eqTaskSearch.query.trim() || undefined,
      page: eqTaskSearch.page,
      pageSize: eqTaskSearch.pageSize
    });
    eqTaskResults.value = result.tasks;
    eqTaskTotal.value = result.total;
    eqTaskSearch.page = result.page;
    eqTaskSearch.pageSize = result.pageSize;
  } catch (error) {
    eqTaskError.value = extractErrorMessage(error, 'Unable to search EQ tasks.');
  } finally {
    eqTaskLoading.value = false;
  }
}

function changeEqTaskPage(page: number) {
  if (page < 1 || page === eqTaskSearch.page || page > eqTaskTotalPages.value) {
    return;
  }
  loadEqTasks(page);
}

async function importEqTask(taskId: number) {
  importingTaskId.value = taskId;
  eqTaskError.value = null;
  try {
    const blueprint = await api.importQuestBlueprintFromTask(guildId, { taskId });
    await loadSummary();
    selectBlueprint(blueprint.id);
    closeTaskImportModal();
    closeCreateModal();
  } catch (error) {
    eqTaskError.value = extractErrorMessage(error, 'Unable to import EQ task.');
  } finally {
    importingTaskId.value = null;
  }
}

watch(selectedBlueprintId, (blueprintId) => {
  if (!blueprintId) {
    detail.value = null;
    return;
  }
  loadDetail(blueprintId).catch((error) => console.error('Failed to load quest detail', error));
  showCharacterModal.value = false;
  characterStartError.value = null;
  guildFocusAssignmentId.value = null;
  editingBlueprintTitle.value = false;
  renamingBlueprintTitle.value = false;
  showBlueprintJsonModal.value = false;
  blueprintJsonCopied.value = false;
  showBlueprintWikiModal.value = false;
  blueprintWikiCopied.value = false;
});

watch(
  () => activeTab.value,
  (tab, prevTab) => {
    if (tab === 'overview' || tab === 'guild') {
      scheduleOverviewFit(true);
    }
    if (tab === 'editor') {
      scheduleEditorFit();
    }
    if (tab === 'guild') {
      guildFocusAssignmentId.value = null;
      if (prevTab !== 'guild') {
        showGuildIntroHighlight.value = true;
        window.setTimeout(() => {
          showGuildIntroHighlight.value = false;
        }, 3000);
      }
    } else {
      showGuildIntroHighlight.value = false;
    }
  }
);

watch(selectedNodeId, (nodeId) => {
  blueprintLinkSelections.previous = '';
  blueprintLinkSelections.next = '';
  if (!nodeId) {
    showStepSettings.value = false;
  }
});

watch(
  selectedNode,
  (node) => {
    if (node) {
      ensureBlueprintLinkMetadata(node);
    }
  },
  { immediate: true }
);

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
  position: relative;
}

.quest-tracker__sidebar {
  background: var(--surface-raised, #101828);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.quest-tracker__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.85rem;
}

.quest-tracker__header-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
}

.quest-tracker__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.9);
}

.quest-tracker__header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: rgba(248, 250, 252, 0.95);
}

.quest-tracker__new-btn {
  --pulse-color: rgba(45, 212, 191, 0.35);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.4rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: linear-gradient(135deg, #34d399, #22d3ee 60%, #38bdf8);
  color: #022c22;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow:
    0 10px 30px rgba(2, 6, 23, 0.45),
    0 0 20px rgba(45, 212, 191, 0.45);
  text-transform: none;
  overflow: hidden;
}

.quest-tracker__new-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at top, rgba(255, 255, 255, 0.45), transparent 70%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.quest-tracker__new-btn::after {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  border: 1px solid transparent;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4), transparent 60%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.quest-tracker__new-btn span[aria-hidden='true'] {
  font-size: 1.35rem;
  line-height: 1;
}

.quest-tracker__new-btn:hover,
.quest-tracker__new-btn:focus-visible {
  transform: translateY(-1px);
  box-shadow:
    0 14px 32px rgba(2, 6, 23, 0.55),
    0 0 26px rgba(14, 165, 233, 0.6);
}

.quest-tracker__new-btn:hover::before,
.quest-tracker__new-btn:focus-visible::before,
.quest-tracker__new-btn:hover::after,
.quest-tracker__new-btn:focus-visible::after {
  opacity: 1;
}

.quest-tracker__new-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.65);
  outline-offset: 2px;
}

.quest-tracker__search {
  width: 100%;
}

.quest-tracker__search-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.2);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.quest-tracker__search-field:focus-within {
  border-color: rgba(56, 189, 248, 0.6);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
}

.quest-tracker__search-icon {
  color: rgba(148, 163, 184, 0.8);
  display: inline-flex;
  width: 18px;
  height: 18px;
}

.quest-tracker__search-icon svg {
  width: 100%;
  height: 100%;
}

.quest-tracker__search-input {
  background: transparent;
  border: none;
  color: #e2e8f0;
  width: 100%;
  font-size: 0.9rem;
  padding: 0.35rem 0;
}

.quest-tracker__search-input::placeholder {
  color: rgba(148, 163, 184, 0.8);
}

.quest-tracker__search-input:focus {
  outline: none;
}

.quest-folder-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.quest-folder-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.quest-folder {
  padding: 1rem 1.2rem;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 12px 35px rgba(2, 6, 23, 0.3);
}

.quest-folder + .quest-folder {
  margin-top: 1rem;
}

.quest-folder__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.quest-folder__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(148, 163, 184, 0.85);
}

.quest-folder__icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.quest-folder__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.quest-folder__icon svg {
  width: 16px;
  height: 16px;
  color: rgba(248, 250, 252, 0.8);
}

.quest-folder__count {
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.75);
  background: rgba(15, 23, 42, 0.45);
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
}

.quest-folder__actions {
  display: inline-flex;
  gap: 0.35rem;
}

.quest-folder__actions .btn--icon {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.8rem;
  line-height: 1;
}

.quest-folder__actions .btn--icon:hover {
  border-color: rgba(139, 92, 246, 0.5);
  color: #f8fafc;
}

.quest-folder__actions .btn--icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: rgba(148, 163, 184, 0.2);
  color: rgba(148, 163, 184, 0.5);
}

.quest-folder--drag-over {
  border-color: rgba(56, 189, 248, 0.6);
  box-shadow:
    0 0 0 2px rgba(56, 189, 248, 0.25),
    0 18px 35px rgba(8, 47, 73, 0.5);
}

.quest-blueprint-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quest-blueprint-list--drag-target {
  border: 1px dashed rgba(56, 189, 248, 0.4);
  border-radius: 0.75rem;
  padding: 0.4rem;
}

.quest-blueprint-card {
  margin: 0;
}

.quest-blueprint-card--dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.quest-blueprint-card--drop-target .quest-blueprint-card__button {
  border-color: rgba(56, 189, 248, 0.8);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
}

.quest-blueprint-empty {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.85);
  padding: 0.35rem 0.4rem 0.75rem 0.4rem;
}

.quest-blueprint-card__button {
  width: 100%;
  text-align: left;
  padding: 0.95rem 1.1rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.75));
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.quest-blueprint-card__button:hover {
  transform: translateY(-2px);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 12px 35px rgba(15, 23, 42, 0.35);
}

.quest-blueprint-card--active .quest-blueprint-card__button {
  border-color: var(--accent, #8b5cf6);
  box-shadow:
    0 0 0 2px rgba(139, 92, 246, 0.25),
    0 20px 35px rgba(15, 23, 42, 0.45);
}

.quest-blueprint-card__header {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
}

.quest-blueprint-card__title {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.quest-blueprint-card__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.25rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(30, 64, 175, 0.3);
  color: #bfdbfe;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  min-width: 72px;
  justify-content: center;
}

.quest-blueprint-card__chip-count {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.quest-blueprint-card__chip-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(191, 219, 254, 0.8);
}

.quest-blueprint-card__summary {
  margin: 0;
  color: rgba(226, 232, 240, 0.85);
  font-size: 0.85rem;
}

.quest-blueprint-card__stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
}

.quest-blueprint-card__stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  color: rgba(148, 163, 184, 0.9);
}

.quest-blueprint-card__stat .label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.65rem;
}

.quest-blueprint-card__stat .value {
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(248, 250, 252, 0.95);
}

.quest-blueprint-card__progress {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.quest-blueprint-card__progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.quest-blueprint-card__progress-value {
  font-weight: 600;
  color: rgba(248, 250, 252, 0.9);
}

.quest-blueprint-card__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.9);
}

.quest-blueprint-card__author {
  font-weight: 600;
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
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.quest-detail__header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  align-items: stretch;
}

.quest-detail__title {
  text-align: center;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.quest-detail__title h2 {
  margin: 0;
}

.quest-detail__title-display {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.quest-title__edit-btn {
  padding: 0.15rem 0.4rem;
  line-height: 1;
  border: none;
  background: transparent;
  box-shadow: none;
  color: inherit;
}

.quest-title-edit-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  width: 100%;
}

.quest-title-edit-form__input {
  min-width: min(280px, 100%);
  max-width: 420px;
}

.quest-detail__toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.btn--json-export,
.btn--wiki-export {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.7);
  color: rgba(248, 250, 252, 0.9);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.btn--json-export svg,
.btn--wiki-export svg {
  width: 14px;
  height: 14px;
}

.btn--json-export:hover,
.btn--wiki-export:hover {
  border-color: rgba(56, 189, 248, 0.7);
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.85);
}

.quest-detail__tracking {
  display: flex;
  align-items: center;
  min-height: 48px;
  justify-self: start;
  width: 100%;
}

.quest-character-pill {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.quest-character-pill__icon {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.quest-character-pill__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.quest-character-pill__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  font-size: 0.85rem;
}

.quest-character-pill__label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.65rem;
  color: rgba(148, 163, 184, 0.9);
  text-align: left;
  width: 100%;
}

.quest-character-select {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
  border-radius: 999px;
  padding: 0.2rem 1.35rem 0.2rem 0.75rem;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  text-align: left;
}

.quest-character-select:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.6);
  outline-offset: 2px;
}

.quest-character-pill__class {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.9);
}

.quest-detail__tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-self: center;
  max-width: 100%;
}

.quest-detail__hint {
  margin: 0;
  font-size: 0.85rem;
  text-align: center;
  width: 100%;
}

.quest-detail__hint--inline {
  text-align: left;
  color: rgba(226, 232, 240, 0.85);
}

.quest-detail__viewing-note {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.9);
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.quest-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: nowrap;
  justify-content: center;
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
  z-index: 0;
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
  stroke-width: 24px;
  stroke-linecap: round;
  pointer-events: stroke;
  cursor: pointer;
  transition: stroke-width 0.15s ease;
  z-index: 0;
}

.quest-link-hit:hover {
  stroke-width: 30px;
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
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-dasharray: var(--path-length);
  stroke-dashoffset: var(--path-length);
  animation: quest-link-trace 6s ease-in-out infinite;
  animation-delay: var(--animation-delay, 0s);
  opacity: 0;
  filter: drop-shadow(0 0 8px var(--link-shadow-color, rgba(56, 189, 248, 0.35)));
}

@keyframes quest-link-trace {
  0% {
    stroke-dashoffset: var(--path-length);
    opacity: 0;
  }
  10% {
    opacity: 0.4;
  }
  35% {
    stroke-dashoffset: calc(var(--path-length) * 0.5);
    opacity: 1;
  }
  60% {
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
  z-index: 1;
}

.quest-tracker--alt-mode .quest-node {
  cursor: copy;
}

.quest-node--selected {
  border-color: var(--accent, #8b5cf6);
  border-width: 2px;
  box-shadow:
    0 0 0 3px rgba(139, 92, 246, 0.45),
    0 0 25px rgba(139, 92, 246, 0.5),
    0 18px 45px rgba(15, 23, 42, 0.55);
  transform: translateZ(0) scale(1.01);
}

.quest-node--completed {
  border-color: var(--accent, #16a34a);
  box-shadow:
    0 0 0 2px rgba(34, 197, 94, 0.2),
    0 15px 35px rgba(5, 46, 22, 0.4);
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.9), rgba(6, 95, 70, 0.95));
}

.quest-panel--editor .quest-node--completed {
  border-color: rgba(148, 163, 184, 0.4);
  box-shadow: none;
  background: rgba(15, 23, 42, 0.9);
}

.quest-node--final {
  box-shadow:
    0 0 12px rgba(250, 204, 21, 0.45),
    inset 0 0 0 2px rgba(250, 204, 21, 0.6);
  border-color: rgba(250, 204, 21, 0.85);
}

.quest-node--disabled {
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.7);
  box-shadow: none;
}

.quest-node--guild-active {
  border-color: rgba(56, 189, 248, 0.65);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(30, 64, 175, 0.45));
  box-shadow:
    0 0 0 2px rgba(56, 189, 248, 0.2),
    0 14px 36px rgba(15, 23, 42, 0.45);
}

.quest-node--group {
  width: 260px;
  height: 260px;
  border-radius: 50%;
  padding: 1.25rem 1.35rem;
  border: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 0.35rem;
  background: transparent;
  box-shadow: none;
  isolation: isolate;
}

.quest-node--group::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: conic-gradient(
      var(--accent, rgba(56, 189, 248, 0.95)) calc(var(--group-progress, 0) * 1turn),
      rgba(30, 41, 59, 0.45) 0
    );
  mask: radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 14px));
  z-index: -2;
  transition: background 0.3s ease;
}

.quest-node--group::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.97);
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.6);
  z-index: -1;
}

.quest-node--group.quest-node--completed::before {
  background: conic-gradient(
      var(--accent, rgba(34, 197, 94, 0.95)) calc(var(--group-progress, 0) * 1turn),
      rgba(15, 118, 110, 0.35) 0
    );
}

.quest-node--group .quest-node__header {
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.25rem;
  text-align: center;
  width: 100%;
}

.quest-node--group .quest-node__status {
  font-size: 0.72rem;
  opacity: 0.85;
}

.quest-node--group h3 {
  font-size: 1rem;
  margin: 0;
}

.quest-node--group .quest-node__target,
.quest-node--group .quest-node__zone {
  text-align: center;
  width: 100%;
}

.quest-node--group .quest-node__relations {
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.35rem;
  border-radius: 0.65rem;
  background: rgba(30, 41, 59, 0.45);
  width: 100%;
}

.quest-node--group .quest-node__relations + .quest-node__relations {
  margin-top: 0.25rem;
}

.quest-node--group .quest-node__relations-label {
  letter-spacing: 0.09em;
  color: rgba(148, 163, 184, 0.95);
  font-size: 0.65rem;
}

.quest-node--group .quest-node__relations-list {
  color: #e2e8f0;
  font-weight: 600;
  font-size: 0.8rem;
}

.quest-node--group .quest-node__handles {
  inset: -4px;
}

.quest-node--disabled .quest-node__status {
  color: #94a3b8;
}

.quest-node__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.25rem;
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

.quest-node--group .quest-node__handle {
  position: absolute;
  bottom: 12px;
  right: 16px;
  font-size: 0.85rem;
  opacity: 0.75;
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

.quest-node__item-link {
  color: #60a5fa;
  text-decoration: none;
  cursor: pointer;
}

.quest-node__item-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.quest-node__target--inline {
  margin-top: 0.2rem;
}

.quest-node__zone--inline {
  margin-top: 0.15rem;
}

.quest-node__relations {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.85);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.quest-node__relations-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  font-weight: 600;
}

.quest-node__relations-list {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.quest-node__relations-link {
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.1rem 0.65rem;
  color: inherit;
  font-size: 0.78rem;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.quest-node__relations-link:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.3);
}

.quest-node__relations-tag {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #fbbf24;
}

.quest-node__group-tally {
  margin-top: auto;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.quest-node__group-type {
  padding: 0.45rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(20, 184, 166, 0.15);
  color: #2dd4bf;
  font-weight: 600;
}

.quest-link-field {
  margin: 1rem 0;
  padding: 0.85rem;
  border-radius: 0.85rem;
  border: 1px dashed rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.35);
}

.quest-link-field__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.quest-link-field__hint {
  margin: 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.quest-link-selector {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.quest-link-selector select {
  flex: 1;
  min-width: 0;
}

.quest-link-selector .btn {
  flex: 0 0 auto;
}

.quest-link-chip-list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.quest-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.65);
}

.quest-link-chip__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.quest-link-chip__meta {
  font-size: 0.7rem;
  color: #94a3b8;
}

.quest-link-chip__remove {
  border: none;
  background: transparent;
  color: #f87171;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.quest-link-chip__remove:hover {
  color: #fecaca;
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
  letter-spacing: 0.08em;
}

.quest-node__badge {
  margin-right: auto;
  margin-left: 0.5rem;
  font-size: 0.65rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.25);
  color: rgba(248, 250, 252, 0.9);
}

.quest-node__badge--disabled {
  background: rgba(100, 116, 139, 0.35);
  color: #e2e8f0;
}
.quest-node__badge--optional {
  background: rgba(249, 115, 22, 0.25);
  color: #fed7aa;
}

.quest-node--group .quest-node__badge {
  margin: 0;
}

.quest-node__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.quest-node--group .quest-node__type {
  width: auto;
  max-width: 80%;
  font-size: 0.72rem;
  padding: 0.1rem 0.55rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quest-node--completed .quest-node__status {
  color: #d1fae5;
  background: rgba(15, 118, 110, 0.35);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
}

.quest-node__flag-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  margin: 0.35rem 0;
  display: block;
}

.quest-node__flag-icon--inline {
  margin-left: auto;
  margin-right: auto;
}

.quest-node--group .quest-node__flag-icon {
  width: 28px;
  height: 28px;
  margin-top: 0.25rem;
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

.quest-overview__footer {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.quest-overview__hint {
  margin: 0;
  padding: 0.65rem 0.95rem;
  border-radius: 0.65rem;
  background: rgba(59, 130, 246, 0.12);
  color: rgba(248, 250, 252, 0.9);
  font-size: 0.9rem;
}

.quest-overview__legend {
  margin-top: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.9);
}

.quest-overview__legend-label {
  font-weight: 600;
}

.quest-overview__legend-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6));
}

.quest-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.quest-share-btn__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
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

.quest-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  mix-blend-mode: screen;
}

.quest-grid-line {
  position: absolute;
  opacity: var(--grid-line-opacity, 0.4);
  transition:
    opacity 0.15s ease,
    box-shadow 0.2s ease;
}

.quest-grid-line--vertical {
  width: 1px;
  background-image: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.4)) 15%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.7)) 35%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4))) 50%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.7)) 65%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.4)) 85%,
    rgba(255, 255, 255, 0) 100%
  );
}

.quest-grid-line--horizontal {
  height: 1px;
  background-image: linear-gradient(
    to right,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.4)) 15%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.7)) 35%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4))) 50%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.7)) 65%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.4) * 0.4)) 85%,
    rgba(255, 255, 255, 0) 100%
  );
}

.quest-grid-line--highlight {
  opacity: var(--grid-line-opacity, 0.95);
  box-shadow:
    0 0 14px rgba(255, 255, 255, 0.45),
    0 0 30px rgba(59, 130, 246, 0.35);
  background-image: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.4)) 20%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.8)) 40%,
    rgba(255, 255, 255, var(--grid-line-opacity, 0.95)) 50%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.8)) 60%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.4)) 80%,
    rgba(255, 255, 255, 0) 100%
  );
}

.quest-grid-line--highlight.quest-grid-line--horizontal {
  background-image: linear-gradient(
    to right,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.4)) 20%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.8)) 40%,
    rgba(255, 255, 255, var(--grid-line-opacity, 0.95)) 50%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.8)) 60%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.95) * 0.4)) 80%,
    rgba(255, 255, 255, 0) 100%
  );
}

.quest-grid-line--edge {
  opacity: var(--grid-line-opacity, 0.9);
  box-shadow:
    0 0 18px rgba(255, 255, 255, 0.6),
    0 0 30px rgba(15, 23, 42, 0.3);
  background-image: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.9) * 0.4)) 20%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.9) * 0.8)) 40%,
    rgba(255, 255, 255, var(--grid-line-opacity, 0.9)) 50%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.9) * 0.8)) 60%,
    rgba(255, 255, 255, calc(var(--grid-line-opacity, 0.9) * 0.4)) 80%,
    rgba(255, 255, 255, 0) 100%
  );
}

.quest-alignment-guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.quest-alignment-line {
  position: absolute;
  opacity: calc(0.15 + 0.85 * var(--alignment-opacity, 0));
  transition: opacity 0.12s ease;
}

.quest-alignment-line--horizontal {
  width: 100%;
  height: 2px;
  background-image: linear-gradient(
    to right,
    rgba(249, 115, 22, 0) 0%,
    rgba(249, 115, 22, calc(var(--alignment-opacity, 0) * 0.6)) 20%,
    rgba(249, 115, 22, var(--alignment-opacity, 0)) 50%,
    rgba(249, 115, 22, calc(var(--alignment-opacity, 0) * 0.6)) 80%,
    rgba(249, 115, 22, 0) 100%
  );
  box-shadow:
    0 0 12px rgba(249, 115, 22, 0.4),
    0 0 18px rgba(15, 23, 42, 0.3);
}

.quest-alignment-line--vertical {
  height: 100%;
  width: 2px;
  background-image: linear-gradient(
    to bottom,
    rgba(249, 115, 22, 0) 0%,
    rgba(249, 115, 22, calc(var(--alignment-opacity, 0) * 0.6)) 20%,
    rgba(249, 115, 22, var(--alignment-opacity, 0)) 50%,
    rgba(249, 115, 22, calc(var(--alignment-opacity, 0) * 0.6)) 80%,
    rgba(249, 115, 22, 0) 100%
  );
  box-shadow:
    0 0 12px rgba(249, 115, 22, 0.4),
    0 0 18px rgba(15, 23, 42, 0.3);
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

.quest-node__badges {
  margin-top: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: center;
  position: relative;
}

.quest-node__badges--intro .quest-node-badge::after {
  animation: questBadgeIntroFlash 0.9s ease-in-out infinite;
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow:
    0 0 16px rgba(59, 130, 246, 0.35),
    0 0 6px rgba(59, 130, 246, 0.55) inset;
}


.quest-node-badge {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  background: transparent;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transform-origin: center;
  animation: questBadgePulse 2.8s ease-in-out infinite;
  position: relative;
}

.quest-node-badge::before {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 8px;
  background: radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.35), rgba(15, 23, 42, 0.05));
  filter: blur(1.5px);
  z-index: -1;
  animation: questBadgeGlow 2.8s ease-in-out infinite;
}

.quest-node-badge::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  box-shadow:
    0 0 12px rgba(96, 165, 250, 0.2),
    0 0 4px rgba(59, 130, 246, 0.4) inset;
  opacity: 0.7;
  animation: questBadgeHalo 3s ease-in-out infinite;
}

.quest-node-badge::before,
.quest-node-badge::after {
  pointer-events: none;
}

.quest-node-badge img {
  width: 76%;
  height: 76%;
  object-fit: contain;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.2);
  padding: 2px;
  filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.45));
  transition: transform 0.2s ease;
}

.quest-node-badge:hover {
  animation-play-state: paused;
}

.quest-node-badge:hover img {
  transform: translateY(-1px) scale(1.05);
}

.quest-node-badge span {
  font-size: 0.8rem;
  font-weight: 600;
}

.quest-node-badge--more {
  width: auto;
  min-width: 32px;
  padding: 0 0.6rem;
  background: rgba(30, 41, 59, 0.7);
  border: 1px dashed rgba(148, 163, 184, 0.6);
  color: rgba(248, 250, 252, 0.9);
  font-size: 0.75rem;
  border-radius: 8px;
  animation: none;
}

@keyframes questBadgePulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes questBadgeGlow {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.85;
  }
  100% {
    opacity: 0.4;
  }
}

@keyframes questBadgeHalo {
  0% {
    opacity: 0.25;
    transform: scale(0.94);
  }
  50% {
    opacity: 0.7;
    transform: scale(1);
  }
  100% {
    opacity: 0.25;
    transform: scale(0.94);
  }
}

@keyframes questBadgeIntroFlash {
  0% {
    opacity: 0.2;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.2;
    transform: scale(0.95);
  }
}

.quest-guild-legend {
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.quest-guild-legend__hint {
  margin: 0;
  text-align: center;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.9rem;
}

.quest-loading,
.quest-empty {
  display: grid;
  place-items: center;
  min-height: 60vh;
  color: rgba(255, 255, 255, 0.6);
}

.quest-loading--fullscreen {
  min-height: calc(100vh - 120px);
}

.quest-loading__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.quest-loading__spinner {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 4px solid rgba(148, 163, 184, 0.25);
  border-top-color: #38bdf8;
  animation: questSpinner 0.9s linear infinite;
}

.quest-loading__error {
  text-align: center;
  color: #fca5a5;
  line-height: 1.4;
  max-width: 420px;
}

.quest-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 15;
  pointer-events: all;
}

.quest-loading-fade-enter-active,
.quest-loading-fade-leave-active {
  transition: opacity 0.2s ease;
}

.quest-loading-fade-enter-from,
.quest-loading-fade-leave-to {
  opacity: 0;
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

.quest-modal__content--wide {
  width: min(720px, 95vw);
}

.quest-json-export {
  max-height: 60vh;
  overflow: auto;
  background: rgba(2, 6, 23, 0.85);
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85rem;
}

.quest-character-modal {
  width: min(520px, 95vw);
  max-height: min(90vh, calc(100vh - 2rem));
  overflow: hidden;
}

.quest-character-modal__loading {
  text-align: center;
  color: rgba(148, 163, 184, 0.9);
  padding: 1rem 0;
}

.quest-character-modal__error {
  color: #fca5a5;
  font-size: 0.85rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 0.65rem;
  padding: 0.5rem 0.75rem;
}

.quest-character-modal__empty {
  margin: 1rem 0 0;
  color: rgba(226, 232, 240, 0.85);
  font-size: 0.9rem;
  text-align: left;
}

.quest-character-modal__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.quest-character-modal__pagination-info {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.85);
}

.quest-character-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.quest-character-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.75rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.65);
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.quest-character-button--link {
  border: none;
  background: rgba(15, 23, 42, 0.7);
  color: inherit;
  cursor: pointer;
}

.quest-character-button--link:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.6);
  outline-offset: 2px;
}

.quest-character-button:disabled {
  opacity: 0.7;
}

.quest-character-button:not(:disabled):hover {
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.45);
  transform: translateY(-1px);
}

.quest-character-button__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.85);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.quest-character-button__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.quest-character-button__details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.quest-character-button__title {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.quest-character-button__meta {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.9);
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

@keyframes questSpinner {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
  position: relative;
}

.quest-context-menu li.danger {
  color: #fca5a5;
}

.quest-context-menu li:hover {
  background: rgba(59, 130, 246, 0.15);
}

.quest-context-menu li.disabled {
  opacity: 0.55;
  cursor: default;
  pointer-events: none;
}

.quest-context-menu li.danger:hover {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.quest-context-menu__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  --menu-status-color: rgba(248, 250, 252, 0.9);
  --menu-status-bg: rgba(59, 130, 246, 0.15);
  color: var(--menu-status-color);
}

.quest-context-menu__status:hover {
  background: var(--menu-status-bg);
}

.quest-context-menu__status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--menu-status-color);
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.9);
}

.quest-context-menu__submenu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.quest-context-menu__submenu-caret {
  opacity: 0.6;
  font-size: 0.8rem;
}

.quest-context-menu__submenu-list {
  position: absolute;
  top: 0;
  left: 100%;
  margin-left: 0.35rem;
  padding: 0.35rem 0;
  min-width: 160px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.65rem;
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.45);
  display: none;
  z-index: 1;
}

.quest-context-menu__submenu:not(.disabled):hover .quest-context-menu__submenu-list {
  display: block;
}

.quest-context-menu__submenu-list li {
  white-space: nowrap;
}

.quest-context-menu__status-label {
  flex: 1;
}

.quest-context-menu__status--muted {
  --menu-status-color: #cbd5f5;
  --menu-status-bg: rgba(148, 163, 184, 0.2);
}

.quest-context-menu__status--warning {
  --menu-status-color: #facc15;
  --menu-status-bg: rgba(234, 179, 8, 0.2);
}

.quest-context-menu__status--success {
  --menu-status-color: #34d399;
  --menu-status-bg: rgba(16, 185, 129, 0.2);
}

.quest-context-menu__status--danger {
  --menu-status-color: #f87171;
  --menu-status-bg: rgba(248, 113, 113, 0.2);
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

.quest-tracker .btn--start {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1.65rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  background: linear-gradient(130deg, #34d399, #10b981);
  color: #032c1f;
  border: none;
  box-shadow:
    0 12px 25px rgba(16, 185, 129, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.quest-tracker .btn--start:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.01);
  box-shadow:
    0 16px 35px rgba(16, 185, 129, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  filter: brightness(1.02);
}

.quest-tracker .btn--start:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
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

.quest-detail__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-wrap: wrap;
  align-items: center;
  justify-self: end;
  width: 100%;
}

.quest-export-toolbar {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.quest-export-toolbar__buttons {
  display: inline-flex;
  gap: 0.5rem;
}

.quest-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.quest-modal__title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.quest-modal__content--wide {
  max-width: 980px;
  width: 90vw;
}

.quest-modal__hint {
  margin: 0 0 0.75rem;
  color: #6b7280;
}

.quest-modal__error {
  color: #dc2626;
  margin: 0.25rem 0 0.5rem;
}

.task-import__controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.task-import__results {
  max-height: 60vh;
  overflow: auto;
}

.task-import__results-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-import__table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #1f2937;
  background: #0f172a;
}

.task-import__table th,
.task-import__table td {
  padding: 0.5rem 0.5rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #1f2937;
  color: #e5e7eb;
}

.task-import__table th {
  background: #0b1220;
  color: #cbd5e1;
}

.task-import__table tbody tr {
  background: #111827;
}

.task-import__table tbody tr:nth-child(odd) {
  background: #152033;
}

.task-import__table tbody tr:hover {
  background: #1e293b;
}

.task-import__title strong {
  display: block;
}

.task-import__title .muted {
  display: block;
}

.task-import__actions {
  text-align: right;
}

.task-import__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.task-import__pagination--top {
  margin-top: 0;
  justify-content: space-between;
}

.task-import__page-info {
  color: #6b7280;
}

@media (max-width: 720px) {
  .quest-detail__toolbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .quest-detail__tracking,
  .quest-detail__tabs,
  .quest-detail__actions {
    width: 100%;
    justify-content: center;
  }
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
