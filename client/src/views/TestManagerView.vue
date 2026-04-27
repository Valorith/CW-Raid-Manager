<template>
  <div class="tm-shell">
    <section class="tm-hero">
      <div>
        <p class="tm-eyebrow">Global Test Server Workspace</p>
        <h1>Test Manager</h1>
      </div>
      <div class="tm-hero__actions">
        <button
          v-if="authStore.isAdmin"
          type="button"
          class="tm-btn tm-btn--primary tm-create-trigger"
          @click="openCreate"
        >
          <span class="tm-create-trigger__icon" aria-hidden="true">＋</span>
          New Change
        </button>
      </div>
    </section>

    <nav class="tm-subnav" aria-label="Test Manager navigation">
      <RouterLink
        v-for="item in subnavItems"
        :key="item.key"
        :to="item.to"
        class="tm-subnav__item"
        :class="{ 'tm-subnav__item--active': currentSection === item.key }"
      >
        <span class="tm-subnav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path v-for="path in item.iconPaths" :key="path" :d="path" />
          </svg>
        </span>
        {{ item.label }}
      </RouterLink>
    </nav>

    <section v-if="loading" class="tm-panel tm-loading">Loading Test Manager...</section>

    <template v-else>
      <section v-if="currentSection === 'dashboard'" class="tm-dashboard">
        <div class="tm-kpis">
          <article v-for="metric in dashboardMetrics" :key="metric.label" class="tm-kpi">
            <span class="tm-kpi__icon" :class="`tm-kpi__icon--${metric.tone}`" aria-hidden="true">
              {{ metric.icon }}
            </span>
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.label }}</span>
            <small>{{ metric.detail }}</small>
          </article>
        </div>

        <div class="tm-grid tm-grid--dashboard">
          <section class="tm-panel tm-panel--large">
            <div class="tm-panel__header">
              <h2>Active Changes</h2>
              <div class="tm-toolbar">
                <select v-model="priorityFilter" class="tm-select">
                  <option value="">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
            <div class="tm-table">
              <div class="tm-table__head tm-table__row--changes">
                <span>Priority</span>
                <span>Change</span>
                <span>Author</span>
                <span>Component</span>
                <span>Status</span>
              </div>
              <button
                v-for="change in filteredDashboardChanges"
                :key="change.id"
                type="button"
                class="tm-table__row tm-table__row--changes"
                @click="goToChange(change.id)"
              >
                <span class="tm-priority" :class="`tm-priority--${change.priority.toLowerCase()}`">
                  {{ priorityLabel(change.priority) }}
                </span>
                <span>
                  <strong>#{{ change.publicId }} {{ change.title }}</strong>
                  <small>{{ plainText(change.description) }}</small>
                </span>
                <span>{{ change.createdBy?.displayName ?? 'Unknown' }}</span>
                <span>{{ change.subsystem }}</span>
                <span><StatusPill :status="change.status" /></span>
              </button>
            </div>
          </section>

          <aside class="tm-stack">
            <section class="tm-panel">
              <div class="tm-panel__header">
                <h2>Tester Activity</h2>
                <RouterLink class="tm-link" to="/test-manager/changes">View All</RouterLink>
              </div>
              <div class="tm-activity-table" aria-label="Tester activity">
                <div class="tm-activity-table__head" aria-hidden="true">
                  <span>Tester</span>
                  <span>Change</span>
                  <span>Result</span>
                  <span>Updated</span>
                </div>
                <button
                  v-for="activity in dashboard?.testerActivity ?? []"
                  :key="`${activity.change.id}-${activity.tester.id}`"
                  type="button"
                  class="tm-activity-table__row"
                  :aria-label="`Open change #${activity.change.publicId} ${activity.change.title}`"
                  @click="goToChange(activity.change.id)"
                >
                  <span class="tm-activity-table__tester">
                    <strong>{{ activity.tester.user?.displayName ?? 'Tester' }}</strong>
                    <small>{{ assignmentLabel(activity.tester.assignment) }}</small>
                  </span>
                  <span class="tm-activity-table__change">
                    <strong>#{{ activity.change.publicId }} {{ activity.change.title }}</strong>
                  </span>
                  <span class="tm-activity-table__status">
                    <StatusPill
                      :status="activity.tester.result ?? activity.tester.status"
                      compact
                    />
                  </span>
                  <span class="tm-activity-table__time">
                    {{ relativeTime(activity.tester.updatedAt) }}
                  </span>
                  <span v-if="activity.tester.notesHtml" class="tm-activity-table__notes">
                    {{ plainText(activity.tester.notesHtml) }}
                  </span>
                </button>
              </div>
            </section>

            <section class="tm-panel">
              <div class="tm-panel__header">
                <h2>Attention Items</h2>
              </div>
              <ul class="tm-attention">
                <li>
                  <span>Changes awaiting assignment</span
                  ><strong>{{ dashboard?.attentionItems.awaitingAssignment ?? 0 }}</strong>
                </li>
                <li>
                  <span>Your open test requests</span
                  ><strong>{{ dashboard?.attentionItems.viewerAssignments ?? 0 }}</strong>
                </li>
                <li>
                  <span>Changes with failing tests</span
                  ><strong>{{ dashboard?.attentionItems.failingTests ?? 0 }}</strong>
                </li>
                <li>
                  <span>Blocked tests</span
                  ><strong>{{ dashboard?.attentionItems.blockedTests ?? 0 }}</strong>
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <section class="tm-panel tm-recent-strip" aria-label="Recent activity">
          <h2>Recent Activity</h2>
          <button
            v-for="item in recentDashboardItems"
            :key="item.key"
            type="button"
            class="tm-recent-strip__item"
            :aria-label="`Open change ${item.detail}`"
            @click="goToChange(item.changeId)"
          >
            <StatusPill :status="item.status" compact />
            <span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.detail }}</small>
            </span>
          </button>
        </section>
      </section>

      <section
        v-else-if="currentSection === 'changes'"
        ref="changesGrid"
        class="tm-grid tm-grid--changes"
        :class="{ 'tm-grid--resizing': activeChangeLayoutDrag }"
        :style="changeLayoutStyle"
      >
        <aside class="tm-panel tm-change-list">
          <div class="tm-panel__header">
            <h2>Changes</h2>
            <button
              v-if="authStore.isAdmin"
              type="button"
              class="tm-icon-btn tm-change-list__add"
              aria-label="Create new change"
              @click="openCreate"
            >
              <span aria-hidden="true">＋</span>
            </button>
          </div>
          <div class="tm-filters">
            <input
              v-model="changeSearch"
              class="tm-input"
              type="search"
              placeholder="Search changes..."
              @input="loadChanges"
            />
            <select v-model="changeStatusFilter" class="tm-select" @change="loadChanges">
              <option value="ACTIVE">Active</option>
              <option value="">All Changes</option>
              <option v-for="status in changeStatuses" :key="status" :value="status">
                {{ statusLabel(status) }}
              </option>
            </select>
          </div>
          <article
            v-for="change in changes"
            :key="change.id"
            class="tm-change-card"
            :class="{
              'tm-change-card--active': activeChange?.id === change.id,
              'tm-change-card--viewer-testing': isViewerActivelyTestingChange(change)
            }"
          >
            <button type="button" class="tm-change-card__main" @click="goToChange(change.id)">
              <span class="tm-dot" :class="viewerChangeListDotClass(change)"></span>
              <span>
                <strong>#{{ change.publicId }} {{ change.title }}</strong>
                <small
                  >{{ change.createdBy?.displayName ?? 'Unknown' }} ·
                  {{ relativeTime(change.updatedAt) }}</small
                >
                <span
                  class="tm-viewer-status"
                  :class="`tm-viewer-status--${viewerChangeListStatus(change).tone}`"
                >
                  {{ viewerChangeListStatus(change).label }}
                </span>
              </span>
            </button>
            <button
              type="button"
              class="tm-change-status-counters"
              :aria-label="`Open testers tab for #${change.publicId}: ${change.summary.testerCount} testers, ${change.summary.failCount} failed, ${change.summary.blockedCount} blocked, ${change.summary.passCount} passed`"
              @click="goToChangeTesters(change.id)"
            >
              <span class="tm-change-status-counter tm-change-status-counter--testers">
                <strong>{{ change.summary.testerCount }}</strong>
                <span>Testers</span>
              </span>
              <span class="tm-change-status-counter tm-change-status-counter--failed">
                <strong>{{ change.summary.failCount }}</strong>
                <span>Failed</span>
              </span>
              <span class="tm-change-status-counter tm-change-status-counter--blocked">
                <strong>{{ change.summary.blockedCount }}</strong>
                <span>Blocked</span>
              </span>
              <span class="tm-change-status-counter tm-change-status-counter--passed">
                <strong>{{ change.summary.passCount }}</strong>
                <span>Passed</span>
              </span>
            </button>
            <p v-if="isViewerRequestedPending(change)" class="tm-change-card__request-strip">
              Your help testing this was requested.
            </p>
          </article>
          <p v-if="!loading && changes.length === 0" class="tm-change-list__empty">
            {{ changeListEmptyMessage }}
          </p>
        </aside>

        <button
          v-if="activeChange"
          type="button"
          class="tm-lane-splitter tm-lane-splitter--left"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize changes list and change details"
          :aria-valuenow="Math.round(changeLayout.left)"
          @pointerdown="startChangeLayoutDrag('left', $event)"
          @dblclick="resetChangeLayout"
          @keydown="adjustChangeLayoutWithKeyboard('left', $event)"
        >
          <span aria-hidden="true"></span>
        </button>

        <main v-if="activeChange" class="tm-panel tm-detail">
          <div class="tm-detail__header">
            <div>
              <button
                type="button"
                class="tm-share-button"
                :aria-label="`Copy share link for #${activeChange.publicId}`"
                @click="copyChangeShareLink(activeChange)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 10.6 6.8-4.2M8.6 13.4l6.8 4.2" />
                </svg>
                <span>Share</span>
              </button>
              <h2>{{ activeChange.title }}</h2>
              <p class="tm-id">Change #{{ activeChange.publicId }}</p>
              <p>
                {{ activeChange.category }} / {{ activeChange.subsystem }} · Submitted by
                {{ activeChange.createdBy?.displayName ?? 'Unknown' }} · Updated
                {{ relativeTime(activeChange.updatedAt) }}
              </p>
            </div>
            <div class="tm-detail__actions">
              <StatusPill :status="activeChange.status" />
              <div class="tm-detail__action-buttons">
                <button
                  v-if="authStore.isAdmin"
                  type="button"
                  class="tm-btn"
                  @click="openEditChange"
                >
                  <span aria-hidden="true">✎</span>
                  Edit Change
                </button>
                <button
                  v-if="canStartTesting(activeChange)"
                  type="button"
                  class="tm-btn tm-btn--success"
                  @click="volunteer(activeChange)"
                >
                  <span aria-hidden="true">▷</span>
                  {{ startTestingLabel(activeChange) }}
                </button>
              </div>
            </div>
          </div>

          <article class="tm-change-description">
            <h3>Change Description</h3>
            <div class="tm-rich" v-html="activeChange.description"></div>
          </article>

          <div class="tm-tabs">
            <button
              v-for="tab in detailTabs"
              :key="tab"
              type="button"
              :class="{ 'tm-tabs__button--active': detailTab === tab }"
              @click="detailTab = tab"
            >
              {{ tab }}
            </button>
          </div>

          <section v-if="detailTab === 'Overview'" class="tm-detail-section">
            <WorkflowTimeline :change="activeChange" />
            <article v-if="canEditViewerChecklist(activeChange)" class="tm-testing-checklist">
              <div class="tm-section-title tm-section-title--detail">
                <div>
                  <h3>Testing Checklist</h3>
                  <p>Track your own test progress for this change.</p>
                </div>
                <span
                  >{{ viewerChecklistCompleted(activeChange) }} /
                  {{ activeChange.checklist.length }}</span
                >
              </div>
              <div class="tm-testing-checklist__table">
                <div class="tm-testing-checklist__head">
                  <span>Done</span>
                  <span>Test</span>
                  <span>Category</span>
                  <span>Notes</span>
                  <span>Status</span>
                </div>
                <div
                  v-for="(item, index) in activeChange.checklist"
                  :key="item.id"
                  class="tm-testing-checklist__row"
                  :class="{
                    'tm-testing-checklist__row--complete': isViewerChecklistItemComplete(item.id)
                  }"
                >
                  <span>
                    <input
                      type="checkbox"
                      :checked="isViewerChecklistItemComplete(item.id)"
                      @change="
                        updateChecklistProgress(
                          item.id,
                          ($event.target as HTMLInputElement).checked
                        )
                      "
                    />
                  </span>
                  <span>
                    <strong>{{ index + 1 }}. {{ item.title }}</strong>
                    <small>{{ item.details }}</small>
                  </span>
                  <span>{{ item.category || activeChange.category }}</span>
                  <span>
                    <button
                      type="button"
                      class="tm-checklist-note-btn"
                      :class="{
                        'tm-checklist-note-btn--has-note': hasViewerChecklistItemNote(item.id)
                      }"
                      :aria-label="
                        hasViewerChecklistItemNote(item.id)
                          ? 'Edit checklist item note'
                          : 'Add checklist item note'
                      "
                      :title="viewerChecklistItemNoteText(item.id) || 'Add note'"
                      @click="openChecklistNote(item.id)"
                    >
                      <span aria-hidden="true">{{
                        hasViewerChecklistItemNote(item.id) ? '▤' : '✎'
                      }}</span>
                    </button>
                  </span>
                  <span
                    class="tm-testing-checklist__status"
                    :class="{
                      'tm-testing-checklist__status--done': isViewerChecklistItemComplete(item.id)
                    }"
                  >
                    {{ isViewerChecklistItemComplete(item.id) ? 'Complete' : 'Pending' }}
                  </span>
                </div>
              </div>
            </article>
          </section>

          <section v-else-if="detailTab === 'Testers'" class="tm-detail-section">
            <div class="tm-panel__header">
              <h3>Tester Matrix</h3>
              <button
                v-if="authStore.isAdmin"
                type="button"
                class="tm-btn"
                @click="requestTesterForActive"
              >
                <span aria-hidden="true">⊕</span>
                Request Testing
              </button>
            </div>
            <div class="tm-filters tm-filters--wide">
              <input
                v-model="testerSearch"
                class="tm-input"
                type="search"
                placeholder="Search testers..."
              />
              <select v-model="testerStatusFilter" class="tm-select">
                <option>All Statuses</option>
                <option value="NOT_STARTED">Not Started</option>
                <option value="TESTING">Testing</option>
                <option value="DONE">Done</option>
                <option value="BLOCKED">Blocked</option>
              </select>
              <select v-model="testerResultFilter" class="tm-select">
                <option>All Results</option>
                <option value="PASS">Pass</option>
                <option value="FAIL">Fail</option>
                <option value="BLOCKED">Blocked</option>
                <option value="NONE">No Result</option>
              </select>
              <select v-model="testerAssignmentFilter" class="tm-select">
                <option>All Assignments</option>
                <option value="REQUIRED">Required</option>
                <option value="OPTIONAL">Optional</option>
                <option value="VOLUNTEER">Volunteer</option>
                <option value="ADMIN_REQUESTED">Requested</option>
              </select>
            </div>
            <div class="tm-table">
              <div
                class="tm-table__head tm-table__row--testers"
                :class="{ 'tm-table__row--testers-admin': authStore.isAdmin }"
              >
                <span>Tester</span>
                <span>Assignment</span>
                <span>Status</span>
                <span>Final Result</span>
                <span>Notes</span>
                <span>Updated</span>
                <span v-if="authStore.isAdmin">Actions</span>
              </div>
              <div
                v-for="tester in filteredActiveTesters"
                :key="tester.id"
                class="tm-table__row tm-table__row--testers"
                :class="{ 'tm-table__row--testers-admin': authStore.isAdmin }"
              >
                <span>{{ tester.user?.displayName ?? 'Unknown' }}</span>
                <span>{{ assignmentLabel(tester.assignment) }}</span>
                <span class="tm-tester-status-cell">
                  <StatusPill :status="tester.status" compact />
                  <span
                    v-if="isTesterNotStarted(tester)"
                    class="tm-status-loader"
                    aria-label="Awaiting tester start"
                  ></span>
                </span>
                <span
                  ><StatusPill v-if="tester.result" :status="tester.result" compact /><span v-else
                    >—</span
                  ></span
                >
                <span>{{ tester.notesCount }}</span>
                <span>{{ relativeTime(tester.updatedAt) }}</span>
                <span v-if="authStore.isAdmin" class="tm-table-actions">
                  <button
                    type="button"
                    class="tm-table-action tm-table-action--danger"
                    :aria-label="`Remove ${tester.user?.displayName ?? 'tester'} from this change`"
                    @click="openRemoveTesterConfirm(tester)"
                  >
                    Remove
                  </button>
                </span>
              </div>
              <p v-if="filteredActiveTesters.length === 0" class="tm-empty-table">
                No testers match the current filters.
              </p>
            </div>
          </section>

          <section v-else-if="detailTab === 'Coverage'" class="tm-detail-section">
            <div class="tm-section-title">
              <div>
                <h3>Checklist Coverage</h3>
                <p>
                  {{ activeChange.summary.checklistProgressTotal }} of
                  {{ activeChange.summary.checklistProgressPossible }} tester checklist items
                  completed.
                </p>
              </div>
              <span>{{ checklistProgress(activeChange) }}</span>
            </div>
            <div
              class="tm-progress tm-progress--coverage"
              :style="{ '--progress': checklistProgress(activeChange) }"
              role="meter"
              aria-label="Checklist coverage"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Number.parseInt(checklistProgress(activeChange), 10)"
            >
              <span :style="{ width: checklistProgress(activeChange) }"></span>
            </div>
            <div
              class="tm-coverage-matrix"
              :style="{ '--tester-count': String(Math.max(activeChange.testers.length, 1)) }"
            >
              <div class="tm-coverage-matrix__header">
                <span>Checklist Item</span>
                <span v-for="tester in activeChange.testers" :key="tester.id">
                  <strong>{{ tester.user?.displayName ?? 'Tester' }}</strong>
                  <small
                    >{{ testerChecklistCompleted(tester) }} /
                    {{ activeChange.checklist.length }}</small
                  >
                </span>
              </div>
              <div v-for="(item, index) in activeChange.checklist" :key="item.id">
                <span class="tm-coverage-matrix__item">
                  <strong>{{ index + 1 }}. {{ item.title }}</strong>
                  <small>{{ item.details }}</small>
                </span>
                <span
                  v-for="tester in activeChange.testers"
                  :key="`${item.id}-${tester.id}`"
                  class="tm-coverage-matrix-cell"
                  :class="[
                    coverageCellClass(tester, item.id),
                    { 'tm-coverage-matrix-cell--has-note': hasCoverageCellNote(tester, item.id) }
                  ]"
                >
                  <button
                    v-if="hasCoverageCellNote(tester, item.id)"
                    type="button"
                    class="tm-coverage-note-btn"
                    :aria-label="`View note from ${tester.user?.displayName ?? 'Tester'} for ${item.title}`"
                    @click="openCoverageNote(tester, item)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M6 4h12v16H6z" />
                      <path d="M9 8h6M9 12h6M9 16h3" />
                    </svg>
                  </button>
                  <strong>{{ coverageCellLabel(tester, item.id) }}</strong>
                  <small>{{ coverageCellMeta(tester, item.id) }}</small>
                </span>
              </div>
            </div>
          </section>

          <section v-else class="tm-detail-section">
            <div class="tm-history">
              <article v-for="event in activeChange.history" :key="event.id">
                <time>{{ formatDateTime(event.createdAt) }}</time>
                <span
                  class="tm-history__marker"
                  :class="`tm-history__marker--${historyTone(event)}`"
                  >{{ historyIcon(event) }}</span
                >
                <div>
                  <strong>
                    <span
                      class="tm-history__badge"
                      :class="`tm-history__badge--${historyTone(event)}`"
                    >
                      {{ historyBadge(event) }}
                    </span>
                    {{ event.label }}
                  </strong>
                  <p>{{ event.detail }}</p>
                </div>
                <em>{{ event.actor?.displayName ?? 'System' }}</em>
              </article>
            </div>
          </section>
        </main>

        <main
          v-else-if="changeUnavailable"
          class="tm-panel tm-detail tm-detail-unavailable"
          aria-labelledby="change-unavailable-title"
        >
          <div class="tm-unavailable-state">
            <span aria-hidden="true">⌫</span>
            <h2 id="change-unavailable-title">Change Not Available</h2>
            <p>This change record is no longer available.</p>
            <button type="button" class="tm-btn tm-btn--primary" @click="goToChangesList">
              View Changes
            </button>
          </div>
        </main>

        <button
          v-if="activeChange"
          type="button"
          class="tm-lane-splitter tm-lane-splitter--right"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize change details and tester input"
          :aria-valuenow="Math.round(changeLayout.right)"
          @pointerdown="startChangeLayoutDrag('right', $event)"
          @dblclick="resetChangeLayout"
          @keydown="adjustChangeLayoutWithKeyboard('right', $event)"
        >
          <span aria-hidden="true"></span>
        </button>

        <aside v-if="activeChange" class="tm-panel tm-inspector">
          <h2>Tester Input</h2>
          <div class="tm-result-buttons">
            <button
              type="button"
              class="tm-btn tm-btn--success"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('PASS')"
            >
              <span aria-hidden="true">👍</span>
              Pass
            </button>
            <button
              type="button"
              class="tm-btn tm-btn--danger"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('FAIL')"
            >
              <span aria-hidden="true">☟</span>
              Fail
            </button>
            <button
              type="button"
              class="tm-btn tm-btn--warning"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('BLOCKED')"
            >
              <span aria-hidden="true">⚠</span>
              Blocked
            </button>
          </div>
          <h3>Testing Notes</h3>
          <button
            type="button"
            :class="[
              'tm-notes-launch',
              hasActiveChangeNotes ? 'tm-notes-launch--has-notes' : 'tm-notes-launch--empty'
            ]"
            @click="openNotesModal"
          >
            <span aria-hidden="true">▣</span>
            <strong>Notes</strong>
            <small>
              {{ hasActiveChangeNotes ? `${activeChangeNoteCount} recorded` : 'None recorded' }}
            </small>
          </button>
          <p v-if="!canUseTesterControls" class="tm-inspector-hint">
            Tester input unlocks when you are actively testing this change.
          </p>
          <p v-if="feedbackError" class="tm-feedback-error">{{ feedbackError }}</p>

          <template v-if="authStore.isAdmin">
            <h3>Developer Actions</h3>
            <button
              v-if="activeChange.status !== 'CLOSED'"
              type="button"
              class="tm-action tm-action--success"
              @click="openDeveloperActionConfirm('close')"
            >
              <span class="tm-action__icon" aria-hidden="true">🔒</span>
              <span><strong>Close Change</strong><small>Mark completed and close it.</small></span>
            </button>
            <button
              type="button"
              class="tm-action tm-action--info"
              @click="openDeveloperActionConfirm('renew')"
            >
              <span class="tm-action__icon" aria-hidden="true">↻</span>
              <span><strong>Renew Change</strong><small>Reopen another testing cycle.</small></span>
            </button>
            <button
              type="button"
              class="tm-action tm-action--danger"
              @click="openDeveloperActionConfirm('delete')"
            >
              <span class="tm-action__icon" aria-hidden="true">⌫</span>
              <span
                ><strong>Delete Change</strong><small>Permanently remove this change.</small></span
              >
            </button>
          </template>
        </aside>
      </section>

      <section v-else-if="currentSection === 'users'" class="tm-grid tm-grid--users">
        <main class="tm-panel">
          <div class="tm-panel__header">
            <div>
              <h2><span aria-hidden="true">♟</span> Users</h2>
              <p>Manage admins, guides, testers, and server staff.</p>
            </div>
          </div>
          <div class="tm-user-tabs" aria-label="User role filters">
            <button
              v-for="tab in userRoleTabs"
              :key="tab.key"
              type="button"
              class="tm-user-tabs__item"
              :class="{ 'tm-user-tabs__item--active': userRoleFilter === tab.key }"
              @click="setUserRoleFilter(tab.key)"
            >
              {{ tab.label }} <span>{{ tab.count }}</span>
            </button>
            <input
              v-model="userSearch"
              class="tm-input"
              type="search"
              placeholder="Search users..."
            />
          </div>
          <div class="tm-table">
            <div class="tm-table__head tm-table__row--users">
              <span>Name</span>
              <span>Role</span>
              <span>Testing Load</span>
              <span>Recent Results</span>
              <span>Tester Role</span>
            </div>
            <div
              v-for="user in pagedUsers"
              :key="user.id"
              class="tm-table__row tm-table__row--users"
            >
              <span class="tm-user-cell">
                <span class="tm-avatar" aria-hidden="true">{{ user.displayName.slice(0, 1) }}</span>
                <span>
                  <strong>{{ user.displayName }}</strong>
                  <small>{{ userRoleLabel(user) }} profile</small>
                </span>
              </span>
              <span>{{ userRoleLabel(user) }}</span>
              <span>{{ user.testingLoad ?? 0 }} open</span>
              <span class="tm-result-minis">
                <span class="tm-mini tm-mini--pass">{{ user.recentResults?.passed ?? 0 }}</span>
                <span class="tm-mini tm-mini--fail">{{ user.recentResults?.failed ?? 0 }}</span>
                <span class="tm-mini tm-mini--blocked">{{ user.recentResults?.blocked ?? 0 }}</span>
              </span>
              <span>
                <label class="tm-switch">
                  <input
                    type="checkbox"
                    :checked="user.isTester"
                    :disabled="!authStore.isAdmin"
                    @change="toggleTester(user, ($event.target as HTMLInputElement).checked)"
                  />
                  <span></span>
                </label>
              </span>
            </div>
          </div>
          <div class="tm-pagination" aria-label="User pagination">
            <span
              >Showing {{ userPageStart }} to {{ userPageEnd }} of
              {{ filteredUsers.length }} users</span
            >
            <div>
              <button
                type="button"
                class="tm-icon-btn"
                :disabled="userPage <= 1"
                @click="userPage -= 1"
              >
                ‹
              </button>
              <button
                v-for="page in userPageNumbers"
                :key="page"
                type="button"
                class="tm-page-btn"
                :class="{ 'tm-page-btn--active': page === userPage }"
                @click="userPage = page"
              >
                {{ page }}
              </button>
              <button
                type="button"
                class="tm-icon-btn"
                :disabled="userPage >= totalUserPages"
                @click="userPage += 1"
              >
                ›
              </button>
            </div>
          </div>
        </main>
        <aside class="tm-stack">
          <section class="tm-panel">
            <h2>Tester Coverage</h2>
            <div class="tm-coverage">
              <div class="tm-donut" :style="coverageDonutStyle">
                {{ dashboard?.metrics.coverage ?? 0 }}%
              </div>
              <ul class="tm-coverage__legend">
                <li>
                  <span class="tm-dot tm-dot--passed"></span>Passed
                  <strong>{{ coveragePassedPercent }}%</strong>
                </li>
                <li>
                  <span class="tm-dot tm-dot--submitted"></span>In Progress
                  <strong>{{ coverageProgressPercent }}%</strong>
                </li>
                <li>
                  <span class="tm-dot tm-dot--failed"></span>Failed
                  <strong>{{ coverageFailedPercent }}%</strong>
                </li>
                <li>
                  <span class="tm-dot tm-dot--coverage-blocked"></span>Blocked
                  <strong>{{ coverageBlockedPercent }}%</strong>
                </li>
              </ul>
            </div>
          </section>
          <section class="tm-panel">
            <h2>Needs Assignments</h2>
            <ul class="tm-attention">
              <li>
                <span>Awaiting test</span
                ><strong>{{ dashboard?.attentionItems.awaitingAssignment ?? 0 }}</strong>
              </li>
              <li>
                <span>Failing tests</span
                ><strong>{{ dashboard?.attentionItems.failingTests ?? 0 }}</strong>
              </li>
              <li>
                <span>Blocked tests</span
                ><strong>{{ dashboard?.attentionItems.blockedTests ?? 0 }}</strong>
              </li>
            </ul>
          </section>
          <section class="tm-panel">
            <h2>Invited Testers</h2>
            <div class="tm-invites">
              <article
                v-for="user in users.filter((entry) => entry.isTester).slice(0, 3)"
                :key="user.id"
              >
                <span class="tm-avatar tm-avatar--small" aria-hidden="true">{{
                  user.displayName.slice(0, 1)
                }}</span>
                <span>
                  <strong>{{ user.displayName }}</strong>
                  <small>{{ user.isTester ? 'Tester active' : 'Invited recently' }}</small>
                </span>
                <span class="tm-status tm-status--compact tm-status--submitted">Pending</span>
              </article>
            </div>
            <RouterLink
              class="tm-side-link"
              :to="{ path: '/test-manager/changes', query: { tab: 'Testers' } }"
              >View all invitations →</RouterLink
            >
          </section>
        </aside>
      </section>

      <section v-else class="tm-panel tm-settings">
        <div class="tm-panel__header">
          <div>
            <h2>Roles & Permissions</h2>
            <p>Access is driven by existing app roles plus the global Tester flag.</p>
            <p v-if="settingsMessage" class="tm-settings-message">{{ settingsMessage }}</p>
          </div>
          <div class="tm-settings-actions">
            <button
              type="button"
              class="tm-btn tm-btn--primary"
              :disabled="!authStore.isAdmin || settingsSaving || !settingsDirty"
              @click="saveSettings"
            >
              <span aria-hidden="true">▣</span>
              {{ settingsSaving ? 'Saving...' : 'Save Changes' }}
            </button>
            <button
              type="button"
              class="tm-btn"
              :disabled="settingsSaving || !settingsDirty"
              @click="resetSettings"
            >
              <span aria-hidden="true">↻</span>
              Reset
            </button>
          </div>
        </div>
        <div class="tm-permissions">
          <div class="tm-permissions__head">
            <span><span aria-hidden="true">♟</span> Role</span>
            <span v-for="permission in permissionColumns" :key="permission.key">
              <span aria-hidden="true">{{ permission.icon }}</span>
              {{ permission.label }}
            </span>
          </div>
          <div v-for="role in settings?.roles ?? []" :key="role.key" class="tm-permissions__row">
            <strong
              ><span aria-hidden="true">{{ roleIcon(role.key) }}</span
              >{{ role.label }}</strong
            >
            <span v-for="permission in permissionColumns" :key="permission.key">
              <label
                class="tm-permission-toggle"
                :class="{
                  'tm-permission-toggle--checked': hasRolePermission(role.key, permission.key),
                  'tm-permission-toggle--disabled': !authStore.isAdmin || settingsSaving
                }"
                :aria-label="`${role.label} ${permission.label}`"
              >
                <input
                  type="checkbox"
                  :checked="hasRolePermission(role.key, permission.key)"
                  :disabled="!authStore.isAdmin || settingsSaving"
                  @change="
                    toggleRolePermission(
                      role.key,
                      permission.key,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
                <span aria-hidden="true"></span>
              </label>
            </span>
          </div>
        </div>

        <section v-if="settings" class="tm-settings-section tm-discord-settings">
          <div class="tm-settings-section__header">
            <div>
              <h3>Discord Notifications</h3>
              <p>Send structured Test Manager change activity to a Discord webhook.</p>
            </div>
            <label
              class="tm-switch"
              :class="{
                'tm-switch--checked': settings.discordNotifications.enabled,
                'tm-switch--disabled': !authStore.isAdmin || settingsSaving
              }"
            >
              <input
                v-model="settings.discordNotifications.enabled"
                type="checkbox"
                :disabled="!authStore.isAdmin || settingsSaving"
                @change="settingsMessage = ''"
              />
              <span aria-hidden="true"></span>
              <strong>{{ settings.discordNotifications.enabled ? 'Enabled' : 'Disabled' }}</strong>
            </label>
          </div>

          <label class="tm-field tm-discord-settings__webhook">
            <span>Discord Webhook URL</span>
            <input
              v-model.trim="settings.discordNotifications.webhookUrl"
              class="tm-input"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              autocomplete="off"
              spellcheck="false"
              :disabled="!authStore.isAdmin || settingsSaving"
              @input="settingsMessage = ''"
            />
          </label>

          <div class="tm-discord-events">
            <label
              v-for="event in discordNotificationEvents"
              :key="event.key"
              class="tm-discord-event"
              :class="{
                'tm-discord-event--checked': hasDiscordNotificationEvent(event.key),
                'tm-discord-event--disabled': !authStore.isAdmin || settingsSaving
              }"
            >
              <input
                type="checkbox"
                :checked="hasDiscordNotificationEvent(event.key)"
                :disabled="!authStore.isAdmin || settingsSaving"
                @change="
                  setDiscordNotificationEvent(
                    event.key,
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
              <span aria-hidden="true"></span>
              <strong>{{ event.label }}</strong>
              <small>{{ event.description }}</small>
            </label>
          </div>
        </section>
      </section>
    </template>

    <div
      v-if="createOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create test change"
    >
      <form class="tm-modal__panel tm-create-modal" @submit.prevent="createChange">
        <header class="tm-create-modal__header">
          <div>
            <p class="tm-create-modal__eyebrow">Test Manager intake</p>
            <h2>New Change</h2>
            <p>Define the scope, priority, and QA checklist before it reaches testers.</p>
          </div>
          <div class="tm-create-modal__header-actions">
            <div class="tm-create-modal__summary" aria-label="New change draft summary">
              <span>{{ createReadyCount }} / 3 ready</span>
              <strong
                >{{ createChecklistCount }} checklist item{{
                  createChecklistCount === 1 ? '' : 's'
                }}</strong
              >
            </div>
            <button type="button" class="tm-icon-btn" aria-label="Close" @click="closeCreate">
              ×
            </button>
          </div>
        </header>

        <datalist id="tm-create-category-options">
          <option v-for="option in createCategoryOptions" :key="option" :value="option"></option>
        </datalist>
        <datalist id="tm-create-subsystem-options">
          <option v-for="option in createSubsystemOptions" :key="option" :value="option"></option>
        </datalist>
        <datalist id="tm-create-build-options">
          <option v-for="option in createTargetBuildOptions" :key="option" :value="option"></option>
        </datalist>

        <div class="tm-create-modal__body">
          <aside class="tm-create-rail" aria-label="Change creation progress">
            <span
              v-for="step in createIntakeSteps"
              :key="step.number"
              class="tm-create-rail__step"
              :class="{
                'tm-create-rail__step--active': step.active,
                'tm-create-rail__step--complete': step.complete
              }"
            >
              <strong>{{ step.complete ? '✓' : step.number }}</strong>
              <span>
                {{ step.label }}
                <small>{{ step.detail }}</small>
              </span>
            </span>
          </aside>

          <div class="tm-create-workspace">
            <section class="tm-create-section">
              <div class="tm-create-section__title">
                <span aria-hidden="true">#</span>
                <div>
                  <h3>Change scope</h3>
                  <p>Use searchable language testers will recognize in the change list.</p>
                </div>
              </div>
              <label class="tm-field tm-field--full">
                <span>Change title</span>
                <input
                  v-model="createForm.title"
                  class="tm-input"
                  required
                  placeholder="Epic 2.0 - Velious: New Spells"
                />
              </label>
              <div class="tm-create-grid">
                <label class="tm-field tm-combo-field">
                  <span>Category <small>select or type</small></span>
                  <div class="tm-combo-field__control">
                    <input
                      v-model="createForm.category"
                      class="tm-input"
                      list="tm-create-category-options"
                      required
                      placeholder="Spells, items, custom area..."
                      @blur="syncChecklistCategories"
                      @change="syncChecklistCategories"
                    />
                    <span aria-hidden="true">⌄</span>
                  </div>
                </label>
                <label class="tm-field tm-combo-field">
                  <span>Subsystem <small>select or type</small></span>
                  <div class="tm-combo-field__control">
                    <input
                      v-model="createForm.subsystem"
                      class="tm-input"
                      list="tm-create-subsystem-options"
                      required
                      placeholder="Combat, rewards, custom subsystem..."
                    />
                    <span aria-hidden="true">⌄</span>
                  </div>
                </label>
                <label class="tm-field tm-combo-field">
                  <span>Target build <small>optional</small></span>
                  <div class="tm-combo-field__control">
                    <input
                      v-model="createForm.targetBuild"
                      class="tm-input"
                      list="tm-create-build-options"
                      placeholder="No target, hotfix, custom build..."
                    />
                    <span aria-hidden="true">⌄</span>
                  </div>
                </label>
              </div>
            </section>

            <section class="tm-create-section">
              <div class="tm-create-section__title">
                <span aria-hidden="true">!</span>
                <div>
                  <h3>Priority and tester brief</h3>
                  <p>Set urgency first, then write the short context testers need.</p>
                </div>
              </div>
              <fieldset class="tm-priority-selector">
                <legend>Priority</legend>
                <label
                  v-for="option in createPriorityOptions"
                  :key="option.value"
                  :class="{
                    'tm-priority-selector__option--selected': createForm.priority === option.value
                  }"
                  class="tm-priority-selector__option"
                >
                  <input v-model="createForm.priority" type="radio" :value="option.value" />
                  <strong>{{ option.label }}</strong>
                  <span>{{ option.detail }}</span>
                </label>
              </fieldset>
              <label class="tm-field tm-field--full">
                <span>Description</span>
                <textarea
                  v-model="createForm.description"
                  class="tm-textarea tm-create-description"
                  required
                  placeholder="Summarize what changed, where testers should look, and any known risks."
                ></textarea>
              </label>
            </section>

            <section class="tm-create-section tm-create-section--checklist">
              <div class="tm-create-section__title">
                <span aria-hidden="true">✓</span>
                <div>
                  <h3>Testing checklist</h3>
                  <p>{{ createChecklistCount }} checks will be attached to this change.</p>
                </div>
              </div>
              <div class="tm-checklist-templates" aria-label="Checklist templates">
                <button
                  v-for="template in createChecklistTemplates"
                  :key="template.label"
                  type="button"
                  @click="applyChecklistTemplate(template.items)"
                >
                  <strong>{{ template.label }}</strong>
                  <span>{{ template.items.length }} checks</span>
                </button>
              </div>
              <div class="tm-checklist-builder">
                <div
                  v-for="(item, index) in createForm.checklist"
                  :key="index"
                  class="tm-checklist-builder__row"
                >
                  <span class="tm-checklist-builder__index">{{ index + 1 }}</span>
                  <label class="tm-field">
                    <span>Checklist item</span>
                    <input
                      v-model="item.title"
                      class="tm-input"
                      placeholder="Verify trainer availability"
                    />
                  </label>
                  <label class="tm-field tm-combo-field">
                    <span>Category <small>optional</small></span>
                    <div class="tm-combo-field__control">
                      <input
                        v-model="item.category"
                        class="tm-input"
                        list="tm-create-category-options"
                        :placeholder="createForm.category || 'Use change category'"
                      />
                      <span aria-hidden="true">⌄</span>
                    </div>
                  </label>
                  <label class="tm-field tm-field--full">
                    <span>Tester notes</span>
                    <input
                      v-model="item.details"
                      class="tm-input"
                      placeholder="What should testers confirm?"
                    />
                  </label>
                  <button
                    type="button"
                    class="tm-checklist-builder__remove"
                    :disabled="createForm.checklist.length <= 1"
                    aria-label="Remove checklist item"
                    @click="removeCreateChecklistItem(index)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                      <path d="M6.5 9h11l-.7 11H7.2L6.5 9Z" />
                      <path d="M10 11.5v6M14 11.5v6" />
                    </svg>
                  </button>
                </div>
                <button type="button" class="tm-btn tm-btn--ghost" @click="addCreateChecklistItem">
                  <span aria-hidden="true">＋</span>
                  Add Checklist Item
                </button>
              </div>
            </section>
          </div>
        </div>

        <footer class="tm-create-modal__footer">
          <p>
            {{ createSummary }}
          </p>
          <button type="button" class="tm-btn tm-btn--ghost" @click="closeCreate">Cancel</button>
          <button type="submit" class="tm-btn tm-btn--primary">
            <span aria-hidden="true">＋</span>
            Create Change
          </button>
        </footer>
      </form>
    </div>

    <div
      v-if="editOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Edit test change"
    >
      <form class="tm-modal__panel tm-create-modal tm-edit-modal" @submit.prevent="saveEditChange">
        <header class="tm-create-modal__header">
          <div>
            <p class="tm-create-modal__eyebrow">Test Manager change</p>
            <h2>Edit Change</h2>
            <p v-if="activeChange">#{{ activeChange.publicId }} {{ activeChange.title }}</p>
          </div>
          <button type="button" class="tm-icon-btn" aria-label="Close" @click="closeEditChange">
            ×
          </button>
        </header>

        <datalist id="tm-edit-category-options">
          <option v-for="option in createCategoryOptions" :key="option" :value="option"></option>
        </datalist>
        <datalist id="tm-edit-subsystem-options">
          <option v-for="option in createSubsystemOptions" :key="option" :value="option"></option>
        </datalist>
        <datalist id="tm-edit-build-options">
          <option v-for="option in createTargetBuildOptions" :key="option" :value="option"></option>
        </datalist>

        <div class="tm-edit-modal__body">
          <section class="tm-create-section">
            <div class="tm-create-section__title">
              <span aria-hidden="true">#</span>
              <div>
                <h3>Change scope</h3>
                <p>Update the visible title, routing, and build target.</p>
              </div>
            </div>
            <label class="tm-field tm-field--full">
              <span>Change title</span>
              <input v-model="editForm.title" class="tm-input" required />
            </label>
            <div class="tm-create-grid">
              <label class="tm-field tm-combo-field">
                <span>Category <small>select or type</small></span>
                <div class="tm-combo-field__control">
                  <input
                    v-model="editForm.category"
                    class="tm-input"
                    list="tm-edit-category-options"
                    required
                  />
                  <span aria-hidden="true">⌄</span>
                </div>
              </label>
              <label class="tm-field tm-combo-field">
                <span>Subsystem <small>select or type</small></span>
                <div class="tm-combo-field__control">
                  <input
                    v-model="editForm.subsystem"
                    class="tm-input"
                    list="tm-edit-subsystem-options"
                    required
                  />
                  <span aria-hidden="true">⌄</span>
                </div>
              </label>
              <label class="tm-field tm-combo-field">
                <span>Target build <small>optional</small></span>
                <div class="tm-combo-field__control">
                  <input
                    v-model="editForm.targetBuild"
                    class="tm-input"
                    list="tm-edit-build-options"
                  />
                  <span aria-hidden="true">⌄</span>
                </div>
              </label>
              <label class="tm-field">
                <span>Due date <small>optional</small></span>
                <input v-model="editForm.dueAt" class="tm-input" type="datetime-local" />
              </label>
            </div>
          </section>

          <section class="tm-create-section">
            <div class="tm-create-section__title">
              <span aria-hidden="true">!</span>
              <div>
                <h3>Priority and description</h3>
                <p>Adjust the tester-facing brief for this change.</p>
              </div>
            </div>
            <fieldset class="tm-priority-selector">
              <legend>Priority</legend>
              <label
                v-for="option in createPriorityOptions"
                :key="option.value"
                :class="{
                  'tm-priority-selector__option--selected': editForm.priority === option.value
                }"
                class="tm-priority-selector__option"
              >
                <input v-model="editForm.priority" type="radio" :value="option.value" />
                <strong>{{ option.label }}</strong>
                <span>{{ option.detail }}</span>
              </label>
            </fieldset>
            <label class="tm-field tm-field--full">
              <span>Description</span>
              <textarea
                v-model="editForm.description"
                class="tm-textarea tm-create-description"
                required
              ></textarea>
            </label>
          </section>
        </div>

        <footer class="tm-create-modal__footer">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="editSaving"
            @click="closeEditChange"
          >
            Cancel
          </button>
          <button type="submit" class="tm-btn tm-btn--primary" :disabled="editSaving">
            {{ editSaving ? 'Saving...' : 'Save Change' }}
          </button>
        </footer>
      </form>
    </div>

    <div
      v-if="resultActionConfirm"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-action-confirm-title"
    >
      <section
        class="tm-modal__panel tm-confirm-modal"
        :class="`tm-confirm-modal--${resultActionConfirm.tone}`"
      >
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">
            {{ resultActionConfirm.icon }}
          </span>
          <div>
            <p>Tester Input</p>
            <h2 id="result-action-confirm-title">{{ resultActionConfirm.title }}</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">{{ resultActionConfirm.body }}</p>
        <div class="tm-confirm-modal__change">
          <span>Selected change</span>
          <strong>{{ developerActionChangeLabel }}</strong>
        </div>
        <div class="tm-confirm-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="resultActionPending"
            @click="closeResultConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="tm-btn"
            :class="resultActionConfirm.confirmClass"
            :disabled="resultActionPending"
            @click="confirmResultAction"
          >
            {{ resultActionPending ? 'Working...' : resultActionConfirm.confirmLabel }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="developerActionConfirm"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="developer-action-confirm-title"
    >
      <section
        class="tm-modal__panel tm-confirm-modal"
        :class="`tm-confirm-modal--${developerActionConfirm.tone}`"
      >
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">
            {{ developerActionConfirm.icon }}
          </span>
          <div>
            <p>Developer Action</p>
            <h2 id="developer-action-confirm-title">{{ developerActionConfirm.title }}</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">{{ developerActionConfirm.body }}</p>
        <div class="tm-confirm-modal__change">
          <span>Selected change</span>
          <strong>{{ developerActionChangeLabel }}</strong>
        </div>
        <div class="tm-confirm-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="developerActionPending"
            @click="closeDeveloperActionConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="tm-btn"
            :class="developerActionConfirm.confirmClass"
            :disabled="developerActionPending"
            @click="confirmDeveloperAction"
          >
            {{ developerActionPending ? 'Working...' : developerActionConfirm.confirmLabel }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="testerRemoveConfirm"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tester-remove-confirm-title"
    >
      <section class="tm-modal__panel tm-confirm-modal tm-confirm-modal--danger">
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">⌫</span>
          <div>
            <p>Tester Matrix</p>
            <h2 id="tester-remove-confirm-title">Remove tester?</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">
          This removes {{ testerRemoveConfirm.testerName }} from the selected change.
        </p>
        <div class="tm-confirm-modal__change">
          <span>Selected change</span>
          <strong>{{ developerActionChangeLabel }}</strong>
        </div>
        <div class="tm-confirm-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="testerRemovePending"
            @click="closeRemoveTesterConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="tm-btn tm-btn--danger"
            :disabled="testerRemovePending"
            @click="confirmRemoveTester"
          >
            {{ testerRemovePending ? 'Removing...' : 'Remove Tester' }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="checklistNotePromptItem"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checklist-note-prompt-title"
    >
      <section class="tm-modal__panel tm-confirm-modal tm-confirm-modal--info">
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">✎</span>
          <div>
            <p>Checklist Complete</p>
            <h2 id="checklist-note-prompt-title">Leave a testing note?</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">
          Add context for "{{ checklistNotePromptItem.title }}" while the details are fresh.
        </p>
        <div class="tm-confirm-modal__change">
          <span>Selected change</span>
          <strong>{{ developerActionChangeLabel }}</strong>
        </div>
        <div class="tm-confirm-modal__actions">
          <button type="button" class="tm-btn tm-btn--ghost" @click="closeChecklistNotePrompt">
            No
          </button>
          <button type="button" class="tm-btn tm-btn--primary" @click="confirmChecklistNotePrompt">
            Yes, Add Note
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="requestOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Request testing"
    >
      <form class="tm-modal__panel tm-request-modal" @submit.prevent="submitRequestTester">
        <div class="tm-panel__header">
          <div>
            <h2>Request Testing</h2>
            <p v-if="activeChange">#{{ activeChange.publicId }} {{ activeChange.title }}</p>
          </div>
          <button type="button" class="tm-icon-btn" @click="requestOpen = false">×</button>
        </div>
        <label>
          <span>Tester</span>
          <select v-model="requestForm.userId" class="tm-select" required>
            <option value="" disabled>Select a user</option>
            <option v-for="user in assignableUsers" :key="user.id" :value="user.id">
              {{ user.displayName }} · {{ userRoleLabel(user) }}
            </option>
          </select>
        </label>
        <label>
          <span>Assignment</span>
          <select v-model="requestForm.assignment" class="tm-select">
            <option value="ADMIN_REQUESTED">Requested</option>
            <option value="REQUIRED">Required</option>
            <option value="OPTIONAL">Optional</option>
          </select>
        </label>
        <button type="submit" class="tm-btn tm-btn--primary tm-full">Send Request</button>
      </form>
    </div>

    <div
      v-if="activeChange"
      v-show="notesOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Testing notes"
    >
      <form class="tm-modal__panel tm-notes-modal" @submit.prevent="saveNote">
        <div class="tm-panel__header">
          <div>
            <h2>Testing Notes</h2>
            <p>#{{ activeChange.publicId }} {{ activeChange.title }}</p>
          </div>
          <button type="button" class="tm-icon-btn" @click="closeNotesModal">×</button>
        </div>

        <template v-if="canUseTesterControls">
          <RichTextEditor ref="notesEditor" />
          <p v-if="feedbackError" class="tm-feedback-error">{{ feedbackError }}</p>
        </template>
        <div v-if="canUseTesterControls" class="tm-quick-notes" aria-label="Quick notes">
          <button type="button" @click="applyQuickNote('Works as expected')">
            Works as expected
          </button>
          <button type="button" @click="applyQuickNote('Minor issues found')">Minor issues</button>
          <button type="button" @click="applyQuickNote('Needs more testing')">
            Needs more testing
          </button>
          <button type="button" @click="applyQuickNote('Not reproducible')">
            Not reproducible
          </button>
        </div>

        <section
          v-if="activeChange.notes.length"
          class="tm-recorded-notes"
          aria-label="Recorded notes"
        >
          <h3>Recorded Notes</h3>
          <article v-for="note in activeChange.notes.slice(0, 5)" :key="note.id">
            <div class="tm-recorded-notes__meta">
              <strong>{{ note.author?.displayName ?? 'Unknown' }}</strong>
              <span class="tm-recorded-notes__time">· {{ relativeTime(note.createdAt) }}</span>
              <StatusPill v-if="note.result" :status="note.result" compact />
            </div>
            <div
              class="tm-recorded-notes__content tm-rich"
              v-html="displayRichText(note.contentHtml)"
            ></div>
          </article>
        </section>
        <p v-else class="tm-empty-table">No testing notes recorded.</p>

        <div class="tm-note-actions">
          <button type="button" class="tm-btn tm-btn--ghost" @click="closeNotesModal">Close</button>
          <button
            v-if="canUseTesterControls"
            type="submit"
            class="tm-btn tm-btn--primary tm-note-save"
          >
            <span aria-hidden="true">▣</span>
            Save Note
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="checklistNoteOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Checklist item note"
    >
      <form class="tm-modal__panel tm-checklist-note-modal" @submit.prevent="saveChecklistNote">
        <div class="tm-panel__header">
          <div>
            <h2>Checklist Note</h2>
            <p v-if="activeChecklistNoteItem">{{ activeChecklistNoteItem.title }}</p>
          </div>
          <button type="button" class="tm-icon-btn" @click="closeChecklistNote">×</button>
        </div>
        <RichTextEditor ref="checklistNoteEditor" />
        <button type="submit" class="tm-btn tm-btn--primary tm-full">Save Note</button>
      </form>
    </div>

    <div
      v-if="coverageNote"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coverage-note-title"
    >
      <section class="tm-modal__panel tm-coverage-note-modal">
        <div class="tm-panel__header">
          <div>
            <p class="tm-modal-eyebrow">Checklist Note</p>
            <h2 id="coverage-note-title">{{ coverageNote.testerName }}</h2>
            <p>{{ coverageNote.itemTitle }}</p>
          </div>
          <button type="button" class="tm-icon-btn" aria-label="Close" @click="closeCoverageNote">
            ×
          </button>
        </div>
        <div class="tm-coverage-note-modal__body">
          <span v-if="coverageNote.updatedAt"
            >Updated {{ relativeTime(coverageNote.updatedAt) }}</span
          >
          <div class="tm-rich" v-html="displayRichText(coverageNote.notesHtml)"></div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch
} from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import {
  api,
  type CreateTestChangePayload,
  type TestAssignmentKind,
  type TestChange,
  type TestChangeListStatusFilter,
  type TestChangePriority,
  type TestChangeStatus,
  type TestManagerDiscordEventKey,
  type TestManagerDashboard,
  type TestManagerSettings,
  type TestManagerUserSummary,
  type UpdateTestChangePayload,
  type TestResult,
  type TestRunStatus
} from '../services/api';
import { useToastBus } from '../components/ToastBus';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const { addToast } = useToastBus();
const route = useRoute();
const router = useRouter();

const CHANGE_LAYOUT_STORAGE_KEY = 'test-manager.changeLaneWidths';
const CHANGE_LAYOUT_OLD_DEFAULTS = { left: 368, right: 352 };
const CHANGE_LAYOUT_DEFAULTS = { left: 424, right: 352 };
const CHANGE_LAYOUT_MIN = { left: 280, detail: 480, right: 280 };
const CHANGE_LAYOUT_MAX = { left: 640, right: 560 };
const CHANGE_LAYOUT_SPLITTER_WIDTH = 16;
type ChangeLayoutPane = 'left' | 'right';
interface ChangeLayoutWidths {
  left: number;
  right: number;
}

const loading = ref(false);
const loadedSection = ref<string | null>(null);
const dashboard = ref<TestManagerDashboard | null>(null);
const changes = ref<TestChange[]>([]);
const selectedChange = ref<TestChange | null>(null);
const changeUnavailable = ref(false);
const users = ref<TestManagerUserSummary[]>([]);
const settings = ref<TestManagerSettings | null>(null);
const savedSettings = ref<TestManagerSettings | null>(null);
const settingsSaving = ref(false);
const settingsMessage = ref('');
const changesGrid = ref<HTMLElement | null>(null);
const changeLayout = ref<ChangeLayoutWidths>(loadChangeLayoutPreference());
const activeChangeLayoutDrag = ref<ChangeLayoutPane | null>(null);
const detailTab = ref<'Overview' | 'Testers' | 'Coverage' | 'History'>('Overview');
const priorityFilter = ref<TestChangePriority | ''>('');
const changeStatusFilter = ref<TestChangeListStatusFilter>('ACTIVE');
const changeSearch = ref('');
const userSearch = ref('');
const testerSearch = ref('');
const testerStatusFilter = ref<TestRunStatus | 'All Statuses'>('All Statuses');
const testerResultFilter = ref<TestResult | 'NONE' | 'All Results'>('All Results');
const testerAssignmentFilter = ref<TestAssignmentKind | 'All Assignments'>('All Assignments');
type UserRoleFilter = 'all' | 'admins' | 'guides' | 'testers';
type ConfirmTone = 'success' | 'info' | 'warning' | 'danger';
interface ResultActionConfirm {
  result: TestResult;
  title: string;
  body: string;
  confirmLabel: string;
  confirmClass: string;
  tone: ConfirmTone;
  icon: string;
}
type DeveloperActionKind = 'close' | 'renew' | 'delete';
interface DeveloperActionConfirm {
  kind: DeveloperActionKind;
  title: string;
  body: string;
  confirmLabel: string;
  confirmClass: string;
  tone: ConfirmTone;
  icon: string;
}
interface TesterRemoveConfirm {
  testerId: string;
  testerName: string;
}
interface CoverageNoteView {
  testerName: string;
  itemTitle: string;
  notesHtml: string;
  updatedAt: string | null;
}
const userRoleFilter = ref<UserRoleFilter>('all');
const userPage = ref(1);
const usersPerPage = 8;
const createOpen = ref(false);
const editOpen = ref(false);
const editSaving = ref(false);
const requestOpen = ref(false);
const notesOpen = ref(false);
const checklistNoteOpen = ref(false);
const checklistNoteItemId = ref<string | null>(null);
const checklistNotePromptItemId = ref<string | null>(null);
const coverageNote = ref<CoverageNoteView | null>(null);
const resultActionConfirm = ref<ResultActionConfirm | null>(null);
const resultActionPending = ref(false);
const developerActionConfirm = ref<DeveloperActionConfirm | null>(null);
const developerActionPending = ref(false);
const testerRemoveConfirm = ref<TesterRemoveConfirm | null>(null);
const testerRemovePending = ref(false);
const feedbackError = ref('');
const notesEditor = ref<{
  getHtml: () => string;
  setHtml: (html: string) => void;
  clear: () => void;
} | null>(null);
const checklistNoteEditor = ref<{
  getHtml: () => string;
  setHtml: (html: string) => void;
  clear: () => void;
} | null>(null);

const changeStatuses: TestChangeStatus[] = [
  'SUBMITTED',
  'AWAITING_TEST',
  'TESTING',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'RENEWED',
  'CLOSED'
];
const detailTabs = ['Overview', 'Testers', 'Coverage', 'History'] as const;
type DetailTab = (typeof detailTabs)[number];
const subnavItems = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    to: '/test-manager/dashboard',
    iconPaths: ['M3 11.5 12 4l9 7.5', 'M5.5 10.5V20h13v-9.5', 'M9.5 20v-5h5v5']
  },
  {
    key: 'changes',
    label: 'Changes',
    to: '/test-manager/changes',
    iconPaths: [
      'M14.5 5.5a4 4 0 0 0 4 4L10 18a2.1 2.1 0 0 1-3-3l8.5-8.5Z',
      'M17.5 2.5 21.5 6.5',
      'M4 4l16 16',
      'M4 8l4-4'
    ]
  },
  {
    key: 'users',
    label: 'Users',
    to: '/test-manager/users',
    iconPaths: [
      'M15.5 20v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20',
      'M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
      'M21.5 20v-1.5a3.5 3.5 0 0 0-2.8-3.4',
      'M16.4 3.7a3.5 3.5 0 0 1 0 6.8'
    ]
  },
  {
    key: 'settings',
    label: 'Settings',
    to: '/test-manager/settings',
    iconPaths: [
      'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
      'M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21.3a2.1 2.1 0 1 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H2.9a2.1 2.1 0 1 1 0-4.2h.06A1.8 1.8 0 0 0 4.6 8a1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 1 1 7.16 3l.05.05A1.8 1.8 0 0 0 9.2 3.4a1.8 1.8 0 0 0 1.1-1.65V1.7a2.1 2.1 0 1 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05A1.8 1.8 0 0 0 19.4 8a1.8 1.8 0 0 0 1.65 1.1h.06a2.1 2.1 0 1 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z'
    ]
  }
] as const;

const permissionColumns = [
  { key: 'view', label: 'View Changes', icon: '◉' },
  { key: 'submit', label: 'Submit Changes', icon: '➤' },
  { key: 'volunteer', label: 'Volunteer', icon: '⚔' },
  { key: 'submitResult', label: 'Submit Results', icon: '✎' },
  { key: 'dispose', label: 'Dispose', icon: '✓' },
  { key: 'manageTesters', label: 'Manage Testers', icon: '♟' },
  { key: 'reports', label: 'Reports', icon: '▥' },
  { key: 'settings', label: 'Settings', icon: '⚙' }
] as const;
type TestManagerPermissionKey = (typeof permissionColumns)[number]['key'];
const discordNotificationEvents: Array<{
  key: TestManagerDiscordEventKey;
  label: string;
  description: string;
}> = [
  {
    key: 'change.created',
    label: 'Change submitted',
    description: 'A new change is created and submitted for testing.'
  },
  {
    key: 'change.statusChanged',
    label: 'Status changed',
    description: 'A change moves between normal workflow states.'
  },
  {
    key: 'change.renewed',
    label: 'Change renewed',
    description: 'A completed testing cycle is reopened for another pass.'
  },
  {
    key: 'change.closed',
    label: 'Change closed',
    description: 'A change is marked complete and closed.'
  },
  {
    key: 'change.deleted',
    label: 'Change deleted',
    description: 'An administrator removes a change.'
  },
  {
    key: 'tester.requested',
    label: 'Tester requested',
    description: 'An administrator requests testing from a specific user.'
  },
  {
    key: 'tester.started',
    label: 'Testing started',
    description: 'A tester starts testing a change.'
  },
  {
    key: 'tester.retested',
    label: 'Re-test started',
    description: 'A tester reopens a previously submitted result.'
  },
  {
    key: 'tester.resultSubmitted',
    label: 'Tester result submitted',
    description: 'A tester submits Pass, Fail, or Blocked input.'
  },
  {
    key: 'checklist.completed',
    label: 'Checklist item completed',
    description: 'A tester marks a checklist item complete.'
  },
  {
    key: 'checklist.reopened',
    label: 'Checklist item reopened',
    description: 'A tester reopens a previously completed checklist item.'
  },
  {
    key: 'checklist.noteUpdated',
    label: 'Checklist note updated',
    description: 'A tester adds or changes a checklist item note.'
  },
  {
    key: 'note.added',
    label: 'Change testing note added',
    description: 'A tester adds a cumulative note on the change.'
  }
];
type CreateChecklistDraft = CreateTestChangePayload['checklist'][number];

const createCategoryOptions = [
  'Spells',
  'Items',
  'NPCs',
  'Zones',
  'Quests',
  'Combat',
  'Loot',
  'Access',
  'Systems'
] as const;

const createSubsystemOptions = [
  'Combat',
  'Dynamic Zones',
  'Progression',
  'Raid Tools',
  'Rewards',
  'Spells',
  'Vendors',
  'World Content'
] as const;

const createTargetBuildOptions = [
  'Test Server',
  'Next Patch',
  'Hotfix',
  'Expansion Content',
  'Backlog'
] as const;

const createPriorityOptions: Array<{
  value: TestChangePriority;
  label: string;
  detail: string;
}> = [
  { value: 'LOW', label: 'Low', detail: 'Track when convenient' },
  { value: 'MEDIUM', label: 'Medium', detail: 'Normal test pass' },
  { value: 'HIGH', label: 'High', detail: 'Needs focused review' },
  { value: 'CRITICAL', label: 'Critical', detail: 'Blocks release confidence' }
];

const createChecklistTemplates: Array<{
  label: string;
  items: CreateChecklistDraft[];
}> = [
  {
    label: 'Spell or Combat',
    items: [
      {
        title: 'Availability and access',
        details: 'Confirm trainers, vendors, or unlock requirements expose the expected content.',
        category: 'Access'
      },
      {
        title: 'Core functionality',
        details: 'Verify cast, effect, duration, stacking, reuse, and combat messaging.',
        category: 'Combat'
      },
      {
        title: 'Reward and progression impact',
        details: 'Check that the change does not break related quests, rewards, or class flow.',
        category: 'Progression'
      }
    ]
  },
  {
    label: 'Zone or Encounter',
    items: [
      {
        title: 'Zone entry and lockout',
        details: 'Confirm entry requirements, lockouts, and reset behavior.',
        category: 'Zones'
      },
      {
        title: 'Encounter flow',
        details: 'Verify spawn timing, pathing, phase transitions, and fail states.',
        category: 'Combat'
      },
      {
        title: 'Rewards and cleanup',
        details: 'Confirm loot, flags, task updates, and cleanup after completion.',
        category: 'Loot'
      }
    ]
  },
  {
    label: 'General QA',
    items: [
      {
        title: 'Happy path',
        details: 'Confirm the expected flow works from start to finish.',
        category: 'Systems'
      },
      {
        title: 'Regression check',
        details: 'Validate adjacent behavior that could be affected by this change.',
        category: 'Systems'
      },
      {
        title: 'Edge case',
        details: 'Try an invalid, repeated, or partially completed flow.',
        category: 'Systems'
      }
    ]
  }
];

function createChecklistItem(category = ''): CreateChecklistDraft {
  return { title: '', details: '', category };
}

function cloneSettings(value: TestManagerSettings): TestManagerSettings {
  return {
    roles: value.roles.map((role) => ({
      ...role,
      permissions: [...role.permissions]
    })),
    discordNotifications: {
      enabled: value.discordNotifications?.enabled ?? false,
      webhookUrl: value.discordNotifications?.webhookUrl ?? '',
      events: [...(value.discordNotifications?.events ?? [])]
    }
  };
}

function orderedPermissions(permissions: string[]): string[] {
  const selected = new Set(permissions);
  return permissionColumns
    .filter((permission) => selected.has(permission.key))
    .map((permission) => permission.key);
}

const createForm = ref<CreateTestChangePayload>({
  title: '',
  description: '',
  category: '',
  subsystem: '',
  priority: 'MEDIUM',
  targetBuild: '',
  checklist: [createChecklistItem()]
});

const editForm = ref<UpdateTestChangePayload>({
  title: '',
  description: '',
  category: '',
  subsystem: '',
  priority: 'MEDIUM',
  targetBuild: '',
  dueAt: null,
  assignedToId: null
});

const requestForm = ref<{ userId: string; assignment: Exclude<TestAssignmentKind, 'VOLUNTEER'> }>({
  userId: '',
  assignment: 'ADMIN_REQUESTED'
});

const currentSection = computed(() => {
  const section = Array.isArray(route.params.section)
    ? route.params.section[0]
    : route.params.section;
  return section && ['dashboard', 'changes', 'users', 'settings'].includes(section)
    ? section
    : 'dashboard';
});
const requestedChangeId = computed(() => {
  if (currentSection.value !== 'changes') {
    return '';
  }

  const changeId = Array.isArray(route.params.changeId)
    ? route.params.changeId[0]
    : route.params.changeId;
  return typeof changeId === 'string' ? changeId.trim() : '';
});

function requestedDetailTab(): DetailTab | null {
  const requested = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (!requested || typeof requested !== 'string') {
    return null;
  }

  const normalized = requested.toLowerCase();
  return detailTabs.find((tab) => tab.toLowerCase() === normalized) ?? null;
}

function syncRequestedDetailTab() {
  if (currentSection.value !== 'changes') {
    return;
  }

  const requested = requestedDetailTab();
  if (requested) {
    detailTab.value = requested;
  }
}

function requestedNotesModal(): boolean {
  const requested = Array.isArray(route.query.notes) ? route.query.notes[0] : route.query.notes;
  return requested === '1' || requested === 'true';
}

const activeChange = computed(() =>
  requestedChangeId.value
    ? selectedChange.value
    : (selectedChange.value ?? changes.value[0] ?? null)
);
const activeChecklistNoteItem = computed(() =>
  activeChange.value?.checklist.find((item) => item.id === checklistNoteItemId.value)
);
const checklistNotePromptItem = computed(() =>
  activeChange.value?.checklist.find((item) => item.id === checklistNotePromptItemId.value)
);
const activeChangeNoteCount = computed(() => activeChange.value?.notes.length ?? 0);
const hasActiveChangeNotes = computed(() => activeChangeNoteCount.value > 0);
const activeViewerTester = computed(() => activeChange.value?.viewerTester ?? null);
const isActivelyTestingViewer = computed(
  () =>
    activeChange.value?.status !== 'CLOSED' &&
    activeViewerTester.value?.status === 'TESTING' &&
    !activeViewerTester.value.result
);
const canUseTesterControls = computed(() => isActivelyTestingViewer.value);
const changeLayoutStyle = computed<Record<string, string>>(() => ({
  '--tm-change-left-width': `${Math.round(changeLayout.value.left)}px`,
  '--tm-change-right-width': `${Math.round(changeLayout.value.right)}px`
}));
const developerActionChangeLabel = computed(() =>
  activeChange.value
    ? `#${activeChange.value.publicId} ${activeChange.value.title}`
    : 'No change selected'
);
const createChecklistCount = computed(
  () => createForm.value.checklist.filter((item) => item.title.trim()).length
);
const createScopeReady = computed(
  () =>
    Boolean(createForm.value.title.trim()) &&
    Boolean(createForm.value.category.trim()) &&
    Boolean(createForm.value.subsystem.trim())
);
const createImpactReady = computed(
  () => createForm.value.description.trim().length >= 12 && Boolean(createForm.value.priority)
);
const createChecklistReady = computed(() => createChecklistCount.value > 0);
const createReadyCount = computed(
  () =>
    [createScopeReady.value, createImpactReady.value, createChecklistReady.value].filter(Boolean)
      .length
);
const createIntakeSteps = computed(() => [
  {
    number: 1,
    label: 'Scope',
    detail: createScopeReady.value ? 'Ready' : 'Title and routing',
    active: !createScopeReady.value,
    complete: createScopeReady.value
  },
  {
    number: 2,
    label: 'Impact',
    detail: createImpactReady.value ? 'Ready' : 'Priority and brief',
    active: createScopeReady.value && !createImpactReady.value,
    complete: createImpactReady.value
  },
  {
    number: 3,
    label: 'Checklist',
    detail: createChecklistReady.value ? `${createChecklistCount.value} item ready` : 'Add checks',
    active: createScopeReady.value && createImpactReady.value && !createChecklistReady.value,
    complete: createChecklistReady.value
  }
]);
const createSummary = computed(() => {
  const category = createForm.value.category.trim() || 'Unrouted';
  const subsystem = createForm.value.subsystem.trim() || 'No subsystem';
  const build = createForm.value.targetBuild?.trim() || 'No target build';
  return `${category} / ${subsystem} · ${build}`;
});
const settingsDirty = computed(
  () => JSON.stringify(settings.value) !== JSON.stringify(savedSettings.value)
);

const dashboardMetrics = computed(() => {
  const metrics = dashboard.value?.metrics;
  return [
    {
      label: 'Active Changes',
      value: metrics?.activeChanges ?? 0,
      detail: 'Open test-server changes',
      icon: '☷',
      tone: 'blue'
    },
    {
      label: 'Priority 1',
      value: metrics?.priorityOne ?? 0,
      detail: 'Needs immediate attention',
      icon: '◇',
      tone: 'red'
    },
    {
      label: 'Awaiting Test',
      value: metrics?.awaitingTest ?? 0,
      detail: 'Waiting for tester pickup',
      icon: '⌛',
      tone: 'gold'
    },
    {
      label: 'In Progress',
      value: metrics?.inProgress ?? 0,
      detail: 'Currently being tested',
      icon: '⚔',
      tone: 'blue'
    },
    {
      label: 'Passed',
      value: metrics?.passed ?? 0,
      detail: 'Admin disposition',
      icon: '✓',
      tone: 'green'
    },
    {
      label: 'Failed',
      value: metrics?.failed ?? 0,
      detail: 'Admin disposition',
      icon: '✕',
      tone: 'red'
    },
    {
      label: 'Test Coverage',
      value: `${metrics?.coverage ?? 0}%`,
      detail: 'Active changes touched',
      icon: '◉',
      tone: 'purple'
    }
  ];
});

const filteredDashboardChanges = computed(() => {
  const list = dashboard.value?.activeChanges ?? [];
  const filtered = priorityFilter.value
    ? list.filter((change) => change.priority === priorityFilter.value)
    : list;
  return [...filtered].sort(compareChanges);
});

const filteredActiveTesters = computed(() => {
  const query = testerSearch.value.trim().toLowerCase();
  return (activeChange.value?.testers ?? []).filter((tester) => {
    const testerName = tester.user?.displayName ?? '';
    const testerEmail = tester.user?.email ?? '';
    const matchesSearch = !query || `${testerName} ${testerEmail}`.toLowerCase().includes(query);
    const matchesStatus =
      testerStatusFilter.value === 'All Statuses' || tester.status === testerStatusFilter.value;
    const matchesResult =
      testerResultFilter.value === 'All Results' ||
      (testerResultFilter.value === 'NONE'
        ? !tester.result
        : tester.result === testerResultFilter.value);
    const matchesAssignment =
      testerAssignmentFilter.value === 'All Assignments' ||
      tester.assignment === testerAssignmentFilter.value;

    return matchesSearch && matchesStatus && matchesResult && matchesAssignment;
  });
});

const userRoleTabs = computed(() => [
  { key: 'all' as const, label: 'All Users', count: users.value.length },
  {
    key: 'admins' as const,
    label: 'Admins',
    count: users.value.filter((user) => user.isAdmin).length
  },
  {
    key: 'guides' as const,
    label: 'Guides',
    count: users.value.filter((user) => user.isGuide).length
  },
  {
    key: 'testers' as const,
    label: 'Testers',
    count: users.value.filter((user) => user.isTester).length
  }
]);

const filteredUsers = computed(() => {
  const query = userSearch.value.trim().toLowerCase();
  let list = users.value;
  if (userRoleFilter.value === 'admins') {
    list = list.filter((user) => user.isAdmin);
  } else if (userRoleFilter.value === 'guides') {
    list = list.filter((user) => user.isGuide);
  } else if (userRoleFilter.value === 'testers') {
    list = list.filter((user) => user.isTester);
  }
  if (!query) {
    return list;
  }
  return list.filter((user) =>
    `${user.displayName} ${user.email ?? ''}`.toLowerCase().includes(query)
  );
});

const totalUserPages = computed(() =>
  Math.max(1, Math.ceil(filteredUsers.value.length / usersPerPage))
);
const pagedUsers = computed(() =>
  filteredUsers.value.slice((userPage.value - 1) * usersPerPage, userPage.value * usersPerPage)
);
const userPageStart = computed(() =>
  filteredUsers.value.length === 0 ? 0 : (userPage.value - 1) * usersPerPage + 1
);
const userPageEnd = computed(() =>
  Math.min(userPage.value * usersPerPage, filteredUsers.value.length)
);
const userPageNumbers = computed(() =>
  Array.from({ length: totalUserPages.value }, (_, index) => index + 1)
);

const coverageTotal = computed(() => {
  const metrics = dashboard.value?.metrics;
  return Math.max(
    1,
    (metrics?.passed ?? 0) +
      (metrics?.failed ?? 0) +
      (metrics?.blocked ?? 0) +
      (metrics?.inProgress ?? 0)
  );
});
const coveragePassedPercent = computed(() =>
  Math.round(((dashboard.value?.metrics.passed ?? 0) / coverageTotal.value) * 100)
);
const coverageProgressPercent = computed(() =>
  Math.round(((dashboard.value?.metrics.inProgress ?? 0) / coverageTotal.value) * 100)
);
const coverageFailedPercent = computed(() =>
  Math.round(((dashboard.value?.metrics.failed ?? 0) / coverageTotal.value) * 100)
);
const coverageBlockedPercent = computed(() =>
  Math.round(((dashboard.value?.metrics.blocked ?? 0) / coverageTotal.value) * 100)
);
const coverageDonutStyle = computed(() => {
  const metrics = dashboard.value?.metrics;
  const segments = [
    { color: 'var(--tm-green)', count: metrics?.passed ?? 0 },
    { color: 'var(--tm-gold)', count: metrics?.inProgress ?? 0 },
    { color: '#b88cff', count: metrics?.blocked ?? 0 },
    { color: 'var(--tm-red)', count: metrics?.failed ?? 0 }
  ].filter((segment) => segment.count > 0);

  if (segments.length === 0) {
    return {
      background:
        'radial-gradient(circle, #111 57%, transparent 58%), conic-gradient(from -90deg, rgba(255,255,255,0.08) 0deg 360deg)'
    };
  }

  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const gap = segments.length > 1 ? 4 : 0;
  const available = 360 - gap * segments.length;
  let cursor = 0;
  const stops: string[] = [];

  for (const segment of segments) {
    const span = (segment.count / total) * available;
    stops.push(`${segment.color} ${cursor.toFixed(2)}deg ${(cursor + span).toFixed(2)}deg`);
    cursor += span;
    if (gap > 0) {
      stops.push(`rgba(5, 7, 7, 0.92) ${cursor.toFixed(2)}deg ${(cursor + gap).toFixed(2)}deg`);
      cursor += gap;
    }
  }

  return {
    background: `radial-gradient(circle, #111 57%, transparent 58%), conic-gradient(from -90deg, ${stops.join(', ')})`
  };
});

const assignableUsers = computed(() =>
  users.value
    .filter((user) => !activeChange.value?.testers.some((tester) => tester.user?.id === user.id))
    .sort(
      (a, b) =>
        Number(b.isTester) - Number(a.isTester) || a.displayName.localeCompare(b.displayName)
    )
);

const recentDashboardItems = computed(() =>
  (dashboard.value?.testerActivity ?? []).slice(0, 4).map((activity, index) => ({
    key: `${activity.change.id}-${activity.tester.id}-${index}`,
    changeId: activity.change.id,
    title: `${activity.tester.user?.displayName ?? 'Tester'} ${
      activity.tester.result ? statusLabel(activity.tester.result).toLowerCase() : 'updated'
    }`,
    detail: `#${activity.change.publicId} ${activity.change.title} · ${relativeTime(
      activity.tester.updatedAt
    )}`,
    status: activity.tester.result ?? activity.tester.status
  }))
);

const changeListEmptyMessage = computed(() => {
  if (changeStatusFilter.value === 'CLOSED') {
    return 'No closed changes found.';
  }

  if (changeSearch.value.trim()) {
    return 'No changes match the current filters.';
  }

  return 'No changes found.';
});

async function loadDashboard() {
  dashboard.value = await api.fetchTestManagerDashboard();
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false;
  }

  return (error as { response?: { status?: number } }).response?.status === 404;
}

async function loadChanges() {
  changeUnavailable.value = false;
  const fetchedChanges = await api.fetchTestChanges({
    status: changeStatusFilter.value,
    search: changeSearch.value
  });
  changes.value = fetchedChanges
    .filter(
      (change) => changeStatusFilter.value !== 'ACTIVE' || change.viewerTester?.result !== 'PASS'
    )
    .sort(compareChanges);
  const routeChangeId = requestedChangeId.value;
  if (routeChangeId) {
    try {
      selectedChange.value = await api.fetchTestChange(routeChangeId);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      selectedChange.value = null;
      changeUnavailable.value = true;
    }
  } else {
    selectedChange.value = changes.value[0] ?? null;
  }
}

async function loadUsers() {
  const [dashboardData, userData] = await Promise.all([
    api.fetchTestManagerDashboard(),
    api.fetchTestManagerUsers()
  ]);
  dashboard.value = dashboardData;
  users.value = userData;
}

async function loadSettings() {
  const result = await api.fetchTestManagerSettings();
  settings.value = cloneSettings(result);
  savedSettings.value = cloneSettings(result);
  settingsMessage.value = '';
}

function hasRolePermission(roleKey: string, permissionKey: TestManagerPermissionKey): boolean {
  const role = settings.value?.roles.find((item) => item.key === roleKey);
  return Boolean(role?.permissions.includes(permissionKey));
}

function toggleRolePermission(
  roleKey: string,
  permissionKey: TestManagerPermissionKey,
  checked: boolean
) {
  if (!authStore.isAdmin || !settings.value) {
    return;
  }

  settingsMessage.value = '';
  const role = settings.value.roles.find((item) => item.key === roleKey);
  if (!role) {
    return;
  }

  const permissions = new Set(role.permissions);
  if (checked) {
    permissions.add(permissionKey);
  } else {
    permissions.delete(permissionKey);
  }
  role.permissions = orderedPermissions([...permissions]);
}

function hasDiscordNotificationEvent(eventKey: TestManagerDiscordEventKey): boolean {
  return Boolean(settings.value?.discordNotifications.events.includes(eventKey));
}

function setDiscordNotificationEvent(eventKey: TestManagerDiscordEventKey, checked: boolean) {
  if (!authStore.isAdmin || !settings.value) {
    return;
  }

  settingsMessage.value = '';
  const events = new Set(settings.value.discordNotifications.events);
  if (checked) {
    events.add(eventKey);
  } else {
    events.delete(eventKey);
  }
  settings.value.discordNotifications.events = discordNotificationEvents
    .filter((event) => events.has(event.key))
    .map((event) => event.key);
}

function resetSettings() {
  if (!savedSettings.value || settingsSaving.value) {
    return;
  }

  settings.value = cloneSettings(savedSettings.value);
  settingsMessage.value = '';
}

async function saveSettings() {
  if (!authStore.isAdmin || !settings.value || settingsSaving.value || !settingsDirty.value) {
    return;
  }

  settingsSaving.value = true;
  settingsMessage.value = '';
  try {
    const result = await api.updateTestManagerSettings({
      roles: settings.value.roles.map((role) => ({
        key: role.key,
        permissions: orderedPermissions(role.permissions)
      })),
      discordNotifications: {
        enabled: settings.value.discordNotifications.enabled,
        webhookUrl: settings.value.discordNotifications.webhookUrl.trim(),
        events: settings.value.discordNotifications.events
      }
    });
    settings.value = cloneSettings(result);
    savedSettings.value = cloneSettings(result);
    settingsMessage.value = 'Settings saved.';
    await authStore.fetchCurrentUser();
    if (!authStore.canViewTestManager) {
      await router.push('/dashboard');
    }
  } catch (error) {
    settingsMessage.value =
      error instanceof Error ? error.message : 'Unable to save role permissions.';
  } finally {
    settingsSaving.value = false;
  }
}

async function loadCurrentSection() {
  const section = currentSection.value;
  const shouldShowGlobalLoading = loadedSection.value === null;
  if (shouldShowGlobalLoading) {
    loading.value = true;
  }
  try {
    syncRequestedDetailTab();
    if (section === 'dashboard') {
      await loadDashboard();
    } else if (section === 'changes') {
      await loadChanges();
      if (requestedNotesModal() && activeChange.value) {
        await openNotesModal();
      }
    } else if (section === 'users') {
      await loadUsers();
    } else {
      await loadSettings();
    }
  } finally {
    loadedSection.value = section;
    if (shouldShowGlobalLoading) {
      loading.value = false;
    }
  }
}

function selectCachedChange(changeId: string) {
  if (selectedChange.value?.id !== changeId) {
    const cachedChange = changes.value.find((change) => change.id === changeId);
    if (cachedChange) {
      selectedChange.value = cachedChange;
      changeUnavailable.value = false;
    }
  }
}

function goToChange(changeId: string) {
  selectCachedChange(changeId);
  router.push(`/test-manager/changes/${changeId}`);
}

function goToChangesList() {
  router.push('/test-manager/changes');
}

function goToChangeTesters(changeId: string) {
  selectCachedChange(changeId);
  detailTab.value = 'Testers';
  router.push({
    path: `/test-manager/changes/${changeId}`,
    query: { tab: 'Testers' }
  });
}

function buildChangeShareUrl(change: TestChange) {
  const href = router.resolve({
    path: `/test-manager/changes/${change.id}`,
    query: detailTab.value === 'Overview' ? undefined : { tab: detailTab.value }
  }).href;

  if (typeof window === 'undefined') {
    return href;
  }

  return new URL(href, window.location.origin).toString();
}

function copyTextFallback(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy was blocked.');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyShareText(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path for browsers that expose but block clipboard writes.
    }
  }

  copyTextFallback(text);
}

async function copyChangeShareLink(change: TestChange) {
  const url = buildChangeShareUrl(change);

  try {
    await copyShareText(url);
    addToast({
      title: 'Share Link Copied',
      message: `Copied link to #${change.publicId}. Access still depends on Test Manager permissions.`,
      variant: 'success'
    });
  } catch {
    addToast({
      title: 'Unable To Copy Link',
      message: 'Your browser blocked clipboard access. Use the address bar link instead.',
      variant: 'error'
    });
  }
}

function loadChangeLayoutPreference(): ChangeLayoutWidths {
  if (typeof window === 'undefined') {
    return { ...CHANGE_LAYOUT_DEFAULTS };
  }

  try {
    const saved = window.localStorage.getItem(CHANGE_LAYOUT_STORAGE_KEY);
    if (!saved) {
      return { ...CHANGE_LAYOUT_DEFAULTS };
    }
    const parsed = JSON.parse(saved) as Partial<ChangeLayoutWidths>;
    const isStoredOldDefault =
      parsed.left === CHANGE_LAYOUT_OLD_DEFAULTS.left &&
      parsed.right === CHANGE_LAYOUT_OLD_DEFAULTS.right;
    if (isStoredOldDefault) {
      return { ...CHANGE_LAYOUT_DEFAULTS };
    }
    return {
      left:
        typeof parsed.left === 'number' && Number.isFinite(parsed.left)
          ? parsed.left
          : CHANGE_LAYOUT_DEFAULTS.left,
      right:
        typeof parsed.right === 'number' && Number.isFinite(parsed.right)
          ? parsed.right
          : CHANGE_LAYOUT_DEFAULTS.right
    };
  } catch {
    return { ...CHANGE_LAYOUT_DEFAULTS };
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampChangeLayout(widths: ChangeLayoutWidths): ChangeLayoutWidths {
  const containerWidth = changesGrid.value?.getBoundingClientRect().width ?? 0;
  const splitterWidth = CHANGE_LAYOUT_SPLITTER_WIDTH * 2;

  if (!containerWidth) {
    return {
      left: clampValue(widths.left, CHANGE_LAYOUT_MIN.left, CHANGE_LAYOUT_MAX.left),
      right: clampValue(widths.right, CHANGE_LAYOUT_MIN.right, CHANGE_LAYOUT_MAX.right)
    };
  }

  const leftMax = Math.min(
    CHANGE_LAYOUT_MAX.left,
    containerWidth - CHANGE_LAYOUT_MIN.right - CHANGE_LAYOUT_MIN.detail - splitterWidth
  );
  let left = clampValue(widths.left, CHANGE_LAYOUT_MIN.left, leftMax);
  const rightMax = Math.min(
    CHANGE_LAYOUT_MAX.right,
    containerWidth - left - CHANGE_LAYOUT_MIN.detail - splitterWidth
  );
  let right = clampValue(widths.right, CHANGE_LAYOUT_MIN.right, rightMax);
  left = clampValue(
    left,
    CHANGE_LAYOUT_MIN.left,
    Math.min(
      CHANGE_LAYOUT_MAX.left,
      containerWidth - right - CHANGE_LAYOUT_MIN.detail - splitterWidth
    )
  );
  right = clampValue(
    right,
    CHANGE_LAYOUT_MIN.right,
    Math.min(
      CHANGE_LAYOUT_MAX.right,
      containerWidth - left - CHANGE_LAYOUT_MIN.detail - splitterWidth
    )
  );

  return { left, right };
}

function saveChangeLayoutPreference(widths: ChangeLayoutWidths) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(CHANGE_LAYOUT_STORAGE_KEY, JSON.stringify(widths));
}

function updateChangeLayout(widths: ChangeLayoutWidths, persist = false) {
  const clamped = clampChangeLayout(widths);
  changeLayout.value = clamped;
  if (persist) {
    saveChangeLayoutPreference(clamped);
  }
}

function startChangeLayoutDrag(pane: ChangeLayoutPane, event: PointerEvent) {
  if (event.button !== 0 || !changesGrid.value) {
    return;
  }
  event.preventDefault();
  activeChangeLayoutDrag.value = pane;
  window.addEventListener('pointermove', dragChangeLayout);
  window.addEventListener('pointerup', stopChangeLayoutDrag, { once: true });
  window.addEventListener('pointercancel', stopChangeLayoutDrag, { once: true });
}

function dragChangeLayout(event: PointerEvent) {
  const pane = activeChangeLayoutDrag.value;
  const grid = changesGrid.value;
  if (!pane || !grid) {
    return;
  }
  const bounds = grid.getBoundingClientRect();
  if (pane === 'left') {
    updateChangeLayout({ ...changeLayout.value, left: event.clientX - bounds.left });
    return;
  }
  updateChangeLayout({ ...changeLayout.value, right: bounds.right - event.clientX });
}

function stopChangeLayoutDrag() {
  if (activeChangeLayoutDrag.value) {
    saveChangeLayoutPreference(changeLayout.value);
  }
  activeChangeLayoutDrag.value = null;
  window.removeEventListener('pointermove', dragChangeLayout);
  window.removeEventListener('pointerup', stopChangeLayoutDrag);
  window.removeEventListener('pointercancel', stopChangeLayoutDrag);
}

function adjustChangeLayoutWithKeyboard(pane: ChangeLayoutPane, event: KeyboardEvent) {
  const step = event.shiftKey ? 64 : 24;
  if (event.key === 'Home') {
    event.preventDefault();
    resetChangeLayout();
    return;
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }

  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const delta = pane === 'left' ? direction * step : -direction * step;
  updateChangeLayout(
    pane === 'left'
      ? { ...changeLayout.value, left: changeLayout.value.left + delta }
      : { ...changeLayout.value, right: changeLayout.value.right + delta },
    true
  );
}

function resetChangeLayout() {
  updateChangeLayout({ ...CHANGE_LAYOUT_DEFAULTS }, true);
}

function handleChangeLayoutResize() {
  updateChangeLayout(changeLayout.value);
}

function openCreate() {
  resetCreateForm();
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
  resetCreateForm();
}

function openEditChange() {
  if (!activeChange.value) {
    return;
  }

  editForm.value = {
    title: activeChange.value.title,
    description: plainText(activeChange.value.description),
    category: activeChange.value.category,
    subsystem: activeChange.value.subsystem,
    priority: activeChange.value.priority,
    targetBuild: activeChange.value.targetBuild ?? '',
    dueAt: toLocalDateTimeInput(activeChange.value.dueAt),
    assignedToId: activeChange.value.assignedTo?.id ?? null
  };
  editOpen.value = true;
}

function closeEditChange() {
  if (editSaving.value) {
    return;
  }
  editOpen.value = false;
  resetEditForm();
}

function addCreateChecklistItem() {
  createForm.value.checklist.push(createChecklistItem(createForm.value.category));
}

function removeCreateChecklistItem(index: number) {
  if (createForm.value.checklist.length <= 1) {
    return;
  }
  createForm.value.checklist.splice(index, 1);
}

function applyChecklistTemplate(items: CreateChecklistDraft[]) {
  createForm.value.checklist = items.map((item) => ({
    ...item,
    category: item.category || createForm.value.category
  }));
}

function syncChecklistCategories() {
  createForm.value.checklist.forEach((item) => {
    if (!item.category) {
      item.category = createForm.value.category;
    }
  });
}

function resetCreateForm() {
  createForm.value = {
    title: '',
    description: '',
    category: '',
    subsystem: '',
    priority: 'MEDIUM',
    targetBuild: '',
    checklist: [createChecklistItem()]
  };
}

function resetEditForm() {
  editForm.value = {
    title: '',
    description: '',
    category: '',
    subsystem: '',
    priority: 'MEDIUM',
    targetBuild: '',
    dueAt: null,
    assignedToId: null
  };
}

function setUserRoleFilter(filter: UserRoleFilter) {
  userRoleFilter.value = filter;
  userPage.value = 1;
}

async function createChange() {
  const payload: CreateTestChangePayload = {
    ...createForm.value,
    description: descriptionInputToHtml(createForm.value.description),
    checklist: createForm.value.checklist
      .filter((item) => item.title.trim())
      .map((item) => ({
        ...item,
        category: item.category || createForm.value.category || null
      }))
  };
  const change = await api.createTestChange(payload);
  createOpen.value = false;
  resetCreateForm();
  await router.push(`/test-manager/changes/${change.id}`);
  await loadChanges();
}

async function saveEditChange() {
  if (!activeChange.value || editSaving.value) {
    return;
  }

  editSaving.value = true;
  try {
    const dueAt = editForm.value.dueAt?.trim()
      ? new Date(editForm.value.dueAt).toISOString()
      : null;
    selectedChange.value = await api.updateTestChange(activeChange.value.id, {
      ...editForm.value,
      description: descriptionInputToHtml(editForm.value.description),
      targetBuild: editForm.value.targetBuild?.trim() || null,
      dueAt
    });
    editOpen.value = false;
    resetEditForm();
    await loadChanges();
  } finally {
    editSaving.value = false;
  }
}

async function volunteer(change: TestChange) {
  selectedChange.value = change.viewerTester?.result
    ? await api.retestTestChange(change.id)
    : await api.volunteerForTestChange(change.id);
  await loadChanges();
}

async function requestTesterForActive() {
  if (!activeChange.value) {
    return;
  }
  if (!users.value.length) {
    users.value = await api.fetchTestManagerUsers();
  }
  requestForm.value = {
    userId: assignableUsers.value[0]?.id ?? '',
    assignment: 'ADMIN_REQUESTED'
  };
  requestOpen.value = true;
}

async function submitRequestTester() {
  if (!activeChange.value || !requestForm.value.userId) {
    return;
  }
  selectedChange.value = await api.requestTestChangeTester(activeChange.value.id, {
    userId: requestForm.value.userId,
    assignment: requestForm.value.assignment
  });
  requestOpen.value = false;
  await loadChanges();
}

async function openNotesModal() {
  notesOpen.value = true;
  await nextTick();
}

function closeNotesModal() {
  notesOpen.value = false;
}

function openResultConfirm(result: TestResult) {
  if (!activeChange.value) {
    return;
  }
  if (!canUseTesterControls.value) {
    feedbackError.value =
      'Tester input is only available while you are actively testing this change.';
    return;
  }

  const notesHtml = notesEditor.value?.getHtml() || '';
  const notesText = getRichTextPlainText(notesHtml);
  if ((result === 'FAIL' || result === 'BLOCKED') && !notesText) {
    feedbackError.value = 'Tester comments are required for Failed or Blocked feedback.';
    void openNotesModal();
    return;
  }

  feedbackError.value = '';
  const confirmations: Record<TestResult, ResultActionConfirm> = {
    PASS: {
      result,
      title: 'Mark this test as passed?',
      body: 'This records your tester input as Passed for the selected change and indicates your validation found no blocking issues.',
      confirmLabel: 'Confirm Pass',
      confirmClass: 'tm-btn--success',
      tone: 'success',
      icon: '👍'
    },
    FAIL: {
      result,
      title: 'Mark this test as failed?',
      body: 'This records your tester input as Failed and attaches your current testing notes so developers can review what needs to be fixed.',
      confirmLabel: 'Confirm Fail',
      confirmClass: 'tm-btn--danger',
      tone: 'danger',
      icon: '☟'
    },
    BLOCKED: {
      result,
      title: 'Mark this test as blocked?',
      body: 'This records your tester input as Blocked and attaches your current testing notes explaining what is preventing validation.',
      confirmLabel: 'Confirm Blocked',
      confirmClass: 'tm-btn--warning',
      tone: 'warning',
      icon: '⚠'
    }
  };

  resultActionConfirm.value = confirmations[result];
}

function closeResultConfirm() {
  if (resultActionPending.value) {
    return;
  }
  resultActionConfirm.value = null;
}

async function confirmResultAction() {
  if (!resultActionConfirm.value || resultActionPending.value) {
    return;
  }

  const { result } = resultActionConfirm.value;
  resultActionPending.value = true;
  try {
    await submitResult(result);
    resultActionConfirm.value = null;
  } finally {
    resultActionPending.value = false;
  }
}

async function submitResult(result: TestResult) {
  if (!activeChange.value) {
    return;
  }
  if (!canUseTesterControls.value) {
    feedbackError.value =
      'Tester input is only available while you are actively testing this change.';
    return;
  }
  const notesHtml = notesEditor.value?.getHtml() || '';
  const notesText = getRichTextPlainText(notesHtml);
  if ((result === 'FAIL' || result === 'BLOCKED') && !notesText) {
    feedbackError.value = 'Tester comments are required for Failed or Blocked feedback.';
    void openNotesModal();
    return;
  }

  feedbackError.value = '';
  selectedChange.value = await api.submitTestChangeResult(activeChange.value.id, {
    result,
    notesHtml
  });
  notesEditor.value?.clear();
  await loadChanges();
}

async function saveNote() {
  if (!activeChange.value) {
    return;
  }
  if (!canUseTesterControls.value) {
    feedbackError.value =
      'Tester input is only available while you are actively testing this change.';
    notesOpen.value = false;
    return;
  }
  selectedChange.value = await api.saveTestChangeNote(
    activeChange.value.id,
    notesEditor.value?.getHtml() || ''
  );
  notesEditor.value?.clear();
  notesOpen.value = false;
  await loadChanges();
}

async function updateChecklistProgress(checklistItemId: string, completed: boolean) {
  if (!activeChange.value) {
    return;
  }
  checklistNotePromptItemId.value = null;
  selectedChange.value = await api.updateTestChangeChecklistProgress(
    activeChange.value.id,
    checklistItemId,
    { completed }
  );
  await loadChanges();
  if (completed) {
    checklistNotePromptItemId.value = checklistItemId;
  }
}

async function openChecklistNote(checklistItemId: string) {
  checklistNoteItemId.value = checklistItemId;
  checklistNoteOpen.value = true;
  await nextTick();
  checklistNoteEditor.value?.setHtml(viewerChecklistItemNoteHtml(checklistItemId));
}

function closeChecklistNote() {
  checklistNoteOpen.value = false;
  checklistNoteItemId.value = null;
  checklistNoteEditor.value?.clear();
}

async function confirmChecklistNotePrompt() {
  const checklistItemId = checklistNotePromptItemId.value;
  checklistNotePromptItemId.value = null;
  if (checklistItemId) {
    await openChecklistNote(checklistItemId);
  }
}

function closeChecklistNotePrompt() {
  checklistNotePromptItemId.value = null;
}

async function saveChecklistNote() {
  if (!activeChange.value || !checklistNoteItemId.value) {
    return;
  }
  selectedChange.value = await api.updateTestChangeChecklistProgress(
    activeChange.value.id,
    checklistNoteItemId.value,
    { notesHtml: checklistNoteEditor.value?.getHtml() || '' }
  );
  closeChecklistNote();
  await loadChanges();
}

function applyQuickNote(note: string) {
  feedbackError.value = '';
  notesEditor.value?.setHtml(`<p>${escapeHtml(note)}</p>`);
}

function openDeveloperActionConfirm(kind: DeveloperActionKind) {
  if (!activeChange.value) {
    return;
  }

  const confirmations: Record<DeveloperActionKind, DeveloperActionConfirm> = {
    close: {
      kind,
      title: 'Close this change?',
      body: 'This marks the change complete and removes it from the active testing workflow.',
      confirmLabel: 'Close Change',
      confirmClass: 'tm-btn--success',
      tone: 'success',
      icon: '🔒'
    },
    renew: {
      kind,
      title: 'Renew this change?',
      body: 'This reopens another testing cycle so testers can validate the change again.',
      confirmLabel: 'Renew Change',
      confirmClass: 'tm-btn--primary',
      tone: 'info',
      icon: '↻'
    },
    delete: {
      kind,
      title: 'Delete this change?',
      body: 'This permanently removes the change, its checklist, tester records, notes, and history.',
      confirmLabel: 'Delete Change',
      confirmClass: 'tm-btn--danger',
      tone: 'danger',
      icon: '⌫'
    }
  };

  developerActionConfirm.value = confirmations[kind];
}

function closeDeveloperActionConfirm() {
  if (developerActionPending.value) {
    return;
  }
  developerActionConfirm.value = null;
}

async function confirmDeveloperAction() {
  if (!developerActionConfirm.value || !activeChange.value || developerActionPending.value) {
    return;
  }

  const { kind } = developerActionConfirm.value;
  developerActionPending.value = true;
  try {
    if (kind === 'close') {
      await setStatus('CLOSED');
    } else if (kind === 'renew') {
      await setStatus('RENEWED');
    } else {
      await removeActiveChange();
    }
    developerActionConfirm.value = null;
  } finally {
    developerActionPending.value = false;
  }
}

async function setStatus(status: TestChangeStatus) {
  if (!activeChange.value) {
    return;
  }
  selectedChange.value = await api.updateTestChangeStatus(activeChange.value.id, status);
  await loadChanges();
}

async function removeActiveChange() {
  if (!activeChange.value) {
    return;
  }
  await api.deleteTestChange(activeChange.value.id);
  selectedChange.value = null;
  await router.push('/test-manager/changes');
  await loadChanges();
}

function openRemoveTesterConfirm(tester: TestChange['testers'][number]) {
  testerRemoveConfirm.value = {
    testerId: tester.id,
    testerName: tester.user?.displayName ?? 'Tester'
  };
}

function closeRemoveTesterConfirm() {
  if (testerRemovePending.value) {
    return;
  }
  testerRemoveConfirm.value = null;
}

async function confirmRemoveTester() {
  if (!activeChange.value || !testerRemoveConfirm.value || testerRemovePending.value) {
    return;
  }

  testerRemovePending.value = true;
  try {
    selectedChange.value = await api.removeTestChangeTester(
      activeChange.value.id,
      testerRemoveConfirm.value.testerId
    );
    testerRemoveConfirm.value = null;
    await loadChanges();
  } finally {
    testerRemovePending.value = false;
  }
}

async function toggleTester(user: TestManagerUserSummary, tester: boolean) {
  const updated = await api.updateTestManagerUserRole(user.id, tester);
  users.value = users.value.map((entry) =>
    entry.id === user.id ? { ...entry, ...updated } : entry
  );
}

function canStartTesting(change: TestChange) {
  const viewerTester = change.viewerTester;
  return (
    (authStore.isTester || authStore.isAdmin) &&
    change.status !== 'CLOSED' &&
    (!viewerTester ||
      Boolean(viewerTester.result) ||
      (viewerTester.status === 'NOT_STARTED' && !viewerTester.result))
  );
}

function startTestingLabel(change: TestChange) {
  if (change.viewerTester?.result) {
    return 'Re-test';
  }
  return change.viewerTester ? 'Start Testing' : 'Test This';
}

function checklistProgress(change: TestChange) {
  if (!change.summary.checklistProgressPossible) {
    return '0%';
  }
  return `${Math.round(
    (change.summary.checklistProgressTotal / change.summary.checklistProgressPossible) * 100
  )}%`;
}

function testerChecklistCompleted(tester: TestChange['testers'][number]) {
  return tester.checklistProgress.filter((progress) => progress.completed).length;
}

function viewerChecklistCompleted(change: TestChange) {
  return change.viewerTester ? testerChecklistCompleted(change.viewerTester) : 0;
}

function isViewerChecklistItemComplete(checklistItemId: string) {
  return Boolean(
    activeChange.value?.viewerTester?.checklistProgress.some(
      (progress) => progress.checklistItemId === checklistItemId && progress.completed
    )
  );
}

function viewerChecklistItemEntry(checklistItemId: string) {
  return activeChange.value?.viewerTester?.checklistProgress.find(
    (progress) => progress.checklistItemId === checklistItemId
  );
}

function viewerChecklistItemNoteHtml(checklistItemId: string) {
  return viewerChecklistItemEntry(checklistItemId)?.notesHtml ?? '';
}

function viewerChecklistItemNoteText(checklistItemId: string) {
  const text = plainText(viewerChecklistItemNoteHtml(checklistItemId));
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}

function hasViewerChecklistItemNote(checklistItemId: string) {
  return plainText(viewerChecklistItemNoteHtml(checklistItemId)).length > 0;
}

function testerChecklistEntry(tester: TestChange['testers'][number], checklistItemId: string) {
  return tester.checklistProgress.find((progress) => progress.checklistItemId === checklistItemId);
}

function coverageCellNoteHtml(tester: TestChange['testers'][number], checklistItemId: string) {
  return testerChecklistEntry(tester, checklistItemId)?.notesHtml ?? '';
}

function hasCoverageCellNote(tester: TestChange['testers'][number], checklistItemId: string) {
  return plainText(coverageCellNoteHtml(tester, checklistItemId)).length > 0;
}

function openCoverageNote(
  tester: TestChange['testers'][number],
  item: TestChange['checklist'][number]
) {
  const entry = testerChecklistEntry(tester, item.id);
  if (!entry || !plainText(entry.notesHtml).length) {
    return;
  }

  coverageNote.value = {
    testerName: tester.user?.displayName ?? 'Tester',
    itemTitle: item.title,
    notesHtml: entry.notesHtml,
    updatedAt: entry.updatedAt
  };
}

function closeCoverageNote() {
  coverageNote.value = null;
}

function coverageCellClass(tester: TestChange['testers'][number], checklistItemId: string) {
  const entry = testerChecklistEntry(tester, checklistItemId);
  if (entry?.completed) {
    return 'tm-coverage-matrix-cell--done';
  }
  if (tester.result === 'BLOCKED' || tester.status === 'BLOCKED') {
    return 'tm-coverage-matrix-cell--blocked';
  }
  if (tester.result === 'FAIL') {
    return 'tm-coverage-matrix-cell--failed';
  }
  if (tester.status === 'TESTING') {
    return 'tm-coverage-matrix-cell--testing';
  }
  return 'tm-coverage-matrix-cell--pending';
}

function coverageCellLabel(tester: TestChange['testers'][number], checklistItemId: string) {
  const entry = testerChecklistEntry(tester, checklistItemId);
  if (entry?.completed) {
    return 'Complete';
  }
  if (tester.result === 'BLOCKED' || tester.status === 'BLOCKED') {
    return 'Blocked';
  }
  if (tester.result === 'FAIL') {
    return 'Failed';
  }
  if (tester.status === 'TESTING') {
    return 'Testing';
  }
  return 'Not tested';
}

function coverageCellMeta(tester: TestChange['testers'][number], checklistItemId: string) {
  const entry = testerChecklistEntry(tester, checklistItemId);
  if (entry?.completedAt) {
    return relativeTime(entry.completedAt);
  }
  if (tester.result) {
    return statusLabel(tester.result);
  }
  return statusLabel(tester.status);
}

function canEditViewerChecklist(change: TestChange) {
  return (
    (authStore.isTester || authStore.isAdmin) &&
    change.status !== 'CLOSED' &&
    change.viewerTester?.status === 'TESTING' &&
    !change.viewerTester.result
  );
}

function priorityLabel(priority: TestChangePriority) {
  const labels: Record<TestChangePriority, string> = {
    CRITICAL: 'P1',
    HIGH: 'P1',
    MEDIUM: 'P2',
    LOW: 'P3'
  };
  return labels[priority];
}

function compareChanges(left: TestChange, right: TestChange) {
  return (
    Number(isViewerActivelyTestingChange(right)) - Number(isViewerActivelyTestingChange(left)) ||
    left.publicId - right.publicId
  );
}

function isViewerActivelyTestingChange(change: TestChange) {
  return change.viewerTester?.status === 'TESTING' && !change.viewerTester.result;
}

function isViewerRequestedPending(change: TestChange) {
  const tester = change.viewerTester;
  return Boolean(
    tester?.requestedBy && tester.status === 'NOT_STARTED' && !tester.startedAt && !tester.result
  );
}

function statusLabel(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assignmentLabel(assignment: string) {
  if (assignment === 'ADMIN_REQUESTED') {
    return 'Requested';
  }
  return statusLabel(assignment);
}

function isTesterNotStarted(tester: TestChange['testers'][number]) {
  return tester.status === 'NOT_STARTED';
}

function viewerChangeListStatus(change: TestChange): { label: string; tone: string } {
  const tester = change.viewerTester;
  if (!tester) {
    return { label: 'Pending Test', tone: 'unassigned' };
  }

  if (tester.result === 'PASS') {
    return { label: 'You passed', tone: 'passed' };
  }
  if (tester.result === 'FAIL') {
    return { label: 'You failed', tone: 'failed' };
  }
  if (tester.result === 'BLOCKED' || tester.status === 'BLOCKED') {
    return { label: 'You blocked', tone: 'blocked' };
  }
  if (tester.status === 'TESTING') {
    return { label: 'Testing now', tone: 'testing' };
  }
  if (tester.status === 'DONE') {
    return { label: 'You tested', tone: 'done' };
  }
  if (tester.requestedBy && tester.status === 'NOT_STARTED' && !tester.startedAt) {
    return { label: 'Requested', tone: 'requested' };
  }

  return {
    label: tester.assignment === 'VOLUNTEER' ? 'Not started' : 'Assigned',
    tone: 'assigned'
  };
}

function viewerChangeListDotClass(change: TestChange) {
  return `tm-dot--viewer-${viewerChangeListStatus(change).tone}`;
}

function plainText(html: string) {
  return getRichTextPlainText(html);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] ?? char
  );
}

function descriptionInputToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function decodeHtmlEntities(value: string) {
  const textarea = document.createElement('textarea');
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    textarea.innerHTML = decoded;
    const next = textarea.value;
    if (next === decoded) {
      return next;
    }
    decoded = next;
  }
  return decoded;
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

function normalizeRichTextTag(tag: string) {
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

function normalizeRichTextHtml(value: string) {
  const withoutUnsafeBlocks = value
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)[^>]*>/gi, '');
  const tagPattern = /<[^>]*>/g;
  let cursor = 0;
  let normalized = '';

  for (const match of withoutUnsafeBlocks.matchAll(tagPattern)) {
    normalized += escapeHtml(decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor, match.index)));
    normalized += normalizeRichTextTag(match[0]) ?? escapeHtml(decodeHtmlEntities(match[0]));
    cursor = (match.index ?? 0) + match[0].length;
  }

  normalized += escapeHtml(decodeHtmlEntities(withoutUnsafeBlocks.slice(cursor)));
  return normalized
    .replace(/(?:\u00a0|&nbsp;)/gi, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function displayRichText(html: string) {
  return normalizeRichTextHtml(html);
}

function getRichTextPlainText(value: string): string {
  const container = document.createElement('div');
  container.innerHTML = normalizeRichTextHtml(value);
  return (container.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function relativeTime(value: string | null) {
  if (!value) {
    return '—';
  }
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function historyTone(event: TestChange['history'][number]) {
  const text = `${event.label} ${event.detail}`.toLowerCase();
  if (text.includes('fail')) return 'red';
  if (text.includes('block')) return 'gold';
  if (text.includes('pass') || text.includes('done')) return 'green';
  if (text.includes('renew')) return 'blue';
  if (text.includes('request') || text.includes('test')) return 'blue';
  return 'gold';
}

function historyIcon(event: TestChange['history'][number]) {
  const text = `${event.label} ${event.detail}`.toLowerCase();
  if (text.includes('fail')) return '✕';
  if (text.includes('block')) return '−';
  if (text.includes('pass') || text.includes('done')) return '✓';
  if (text.includes('renew')) return '↻';
  if (text.includes('request')) return '➤';
  if (text.includes('note')) return '▤';
  return '▦';
}

function historyBadge(event: TestChange['history'][number]) {
  const text = `${event.label} ${event.detail}`.toLowerCase();
  if (text.includes('fail')) return 'Test Result';
  if (text.includes('block')) return 'Test Result';
  if (text.includes('pass')) return 'Test Result';
  if (text.includes('renew')) return 'Renewed';
  if (text.includes('request')) return 'Testing Requested';
  if (text.includes('note')) return 'Note Edited';
  return 'Submitted';
}

function userRoleLabel(user: TestManagerUserSummary) {
  if (user.isAdmin) return 'Admin';
  if (user.isGuide) return 'Guide';
  if (user.isTester) return 'Tester';
  return 'User';
}

function roleIcon(roleKey: string) {
  const key = roleKey.toLowerCase();
  if (key.includes('admin')) return '🛡';
  if (key.includes('guide')) return '✦';
  if (key.includes('tester')) return '⚗';
  return '◉';
}

const StatusPill = defineComponent({
  props: {
    status: { type: String, required: true },
    compact: { type: Boolean, default: false }
  },
  setup(props) {
    return () =>
      h(
        'span',
        {
          class: [
            'tm-status',
            `tm-status--${props.status.toLowerCase()}`,
            { 'tm-status--compact': props.compact }
          ]
        },
        statusLabel(props.status)
      );
  }
});

const WorkflowTimeline = defineComponent({
  props: {
    change: { type: Object as () => TestChange, required: true }
  },
  setup(props) {
    const steps: TestChangeStatus[] = ['SUBMITTED', 'TESTING', 'PASSED', 'RENEWED', 'CLOSED'];
    const statusStepMap: Partial<Record<TestChangeStatus, TestChangeStatus>> = {
      AWAITING_TEST: 'SUBMITTED',
      BLOCKED: 'TESTING',
      FAILED: 'TESTING'
    };
    const stepIcon = (step: TestChangeStatus, complete: boolean) => {
      if (complete) return '✓';
      if (step === 'SUBMITTED') return '▤';
      if (step === 'TESTING') return '⚔';
      if (step === 'PASSED') return '★';
      if (step === 'RENEWED') return '↻';
      return '🔒';
    };
    const metadataStatus = (metadata: unknown, key: 'from' | 'to') => {
      if (!metadata || typeof metadata !== 'object' || !(key in metadata)) {
        return '';
      }
      const value = (metadata as Record<string, unknown>)[key];
      return typeof value === 'string' ? value.toUpperCase() : '';
    };
    const wasRenewed = (change: TestChange) =>
      change.status === 'RENEWED' ||
      change.history.some((event) => {
        const text = `${event.eventType} ${event.label} ${event.detail}`.toLowerCase();
        return (
          event.eventType === 'CHANGE_RENEWED' ||
          text.includes('renew') ||
          metadataStatus(event.metadata, 'to') === 'RENEWED' ||
          metadataStatus(event.metadata, 'from') === 'RENEWED'
        );
      });
    const viewerCompletedTesting = (change: TestChange) => {
      const tester = change.viewerTester;
      if (!tester) {
        return false;
      }

      return Boolean(
        tester.startedAt ||
          tester.completedAt ||
          tester.result ||
          tester.status === 'TESTING' ||
          tester.status === 'DONE' ||
          tester.checklistProgress.some(
            (progress) =>
              progress.completed ||
              (typeof progress.notesHtml === 'string' && progress.notesHtml.trim())
          )
      );
    };

    return () => {
      const activeStep = statusStepMap[props.change.status] ?? props.change.status;
      const activeIndex = steps.indexOf(activeStep);
      const skipRenewed = props.change.status === 'CLOSED' && !wasRenewed(props.change);
      const isTerminalClosed = props.change.status === 'CLOSED';
      const testingIndex = steps.indexOf('TESTING');
      const skipTesting = activeIndex > testingIndex && !viewerCompletedTesting(props.change);
      const viewerHasPassed = props.change.viewerTester?.result === 'PASS';

      return h('div', { class: 'tm-workflow' }, [
        h('h3', 'Workflow Timeline'),
        h(
          'div',
          { class: 'tm-workflow__steps' },
          steps.map((step, index) => {
            const isActive = !isTerminalClosed && step === activeStep;
            const isSkipped =
              (skipTesting && step === 'TESTING') || (skipRenewed && step === 'RENEWED');
            const isComplete =
              (activeIndex > index ||
                (isTerminalClosed && step === 'CLOSED') ||
                (viewerHasPassed && step === 'PASSED')) &&
              !isSkipped;

            return h(
              'div',
              {
                class: [
                  'tm-workflow__step',
                  {
                    'tm-workflow__step--active': isActive,
                    'tm-workflow__step--complete': isComplete,
                    'tm-workflow__step--skipped': isSkipped
                  }
                ]
              },
              [
                h('span', stepIcon(step, isComplete)),
                h('strong', statusLabel(step)),
                h(
                  'small',
                  isActive ? 'Current' : isSkipped ? 'Skipped' : isComplete ? 'Complete' : 'Pending'
                )
              ]
            );
          })
        )
      ]);
    };
  }
});

const RichTextEditor = defineComponent({
  setup(_, { expose }) {
    const editor = ref<HTMLElement | null>(null);
    const activeMarks = reactive({ bold: false, italic: false, underline: false });
    let savedRange: Range | null = null;
    const hasActiveMarks = () => activeMarks.bold || activeMarks.italic || activeMarks.underline;
    const wrapActiveMarks = (html: string) => {
      let wrapped = html;
      if (activeMarks.underline) wrapped = `<u>${wrapped}</u>`;
      if (activeMarks.italic) wrapped = `<em>${wrapped}</em>`;
      if (activeMarks.bold) wrapped = `<strong>${wrapped}</strong>`;
      return wrapped;
    };
    const saveSelection = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !editor.value) {
        return;
      }
      const range = selection.getRangeAt(0);
      if (editor.value.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
      }
    };
    const restoreSelection = () => {
      editor.value?.focus();
      if (!savedRange) {
        return;
      }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
    };
    const isCurrentSelectionInEditor = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !editor.value) {
        return false;
      }
      return editor.value.contains(selection.getRangeAt(0).commonAncestorContainer);
    };
    const prepareSelection = () => {
      if (isCurrentSelectionInEditor()) {
        saveSelection();
      } else {
        restoreSelection();
      }
    };
    const hasEditorSelection = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed || !editor.value) {
        return false;
      }
      return editor.value.contains(selection.getRangeAt(0).commonAncestorContainer);
    };
    const inlineCommands = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline'
    } as const;
    const command = (name: string) => {
      prepareSelection();
      document.execCommand('styleWithCSS', false, 'false');
      if (name in inlineCommands && !hasEditorSelection()) {
        const mark = inlineCommands[name as keyof typeof inlineCommands];
        activeMarks[mark] = !activeMarks[mark];
      } else {
        document.execCommand(name, false);
      }
      saveSelection();
    };
    const handleToolbarPointer = (event: MouseEvent) => {
      event.preventDefault();
      saveSelection();
    };
    const textToEditorHtml = (text: string) =>
      text
        .replace(/\r\n?/g, '\n')
        .split(/\n{2,}/)
        .map((block) => {
          const escapedBlock = escapeHtml(block).replace(/\n/g, '<br>');
          return `<p>${hasActiveMarks() ? wrapActiveMarks(escapedBlock) : escapedBlock}</p>`;
        })
        .join('');
    const handleBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertText' || !event.data || !hasActiveMarks()) {
        return;
      }
      event.preventDefault();
      prepareSelection();
      document.execCommand('insertHTML', false, wrapActiveMarks(escapeHtml(event.data)));
      saveSelection();
    };
    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) {
        return;
      }
      event.preventDefault();
      prepareSelection();
      document.execCommand('insertHTML', false, textToEditorHtml(text));
      saveSelection();
    };
    const currentHtml = () => {
      const normalized = normalizeRichTextHtml(editor.value?.innerHTML.trim() || '');
      if (editor.value && editor.value.innerHTML !== normalized) {
        editor.value.innerHTML = normalized;
      }
      return normalized;
    };
    expose({
      getHtml: currentHtml,
      setHtml: (html: string) => {
        if (editor.value) {
          editor.value.innerHTML = normalizeRichTextHtml(html);
        }
      },
      clear: () => {
        if (editor.value) {
          editor.value.innerHTML = '';
        }
      }
    });
    return () =>
      h('div', { class: 'tm-editor' }, [
        h('div', { class: 'tm-editor__bar', role: 'toolbar', 'aria-label': 'Formatting tools' }, [
          h(
            'button',
            {
              type: 'button',
              title: 'Bold',
              'aria-label': 'Bold',
              class: { 'is-active': activeMarks.bold },
              onMousedown: handleToolbarPointer,
              onClick: () => command('bold')
            },
            'B'
          ),
          h(
            'button',
            {
              type: 'button',
              title: 'Italic',
              'aria-label': 'Italic',
              class: { 'is-active': activeMarks.italic },
              onMousedown: handleToolbarPointer,
              onClick: () => command('italic')
            },
            'I'
          ),
          h(
            'button',
            {
              type: 'button',
              title: 'Underline',
              'aria-label': 'Underline',
              class: { 'is-active': activeMarks.underline },
              onMousedown: handleToolbarPointer,
              onClick: () => command('underline')
            },
            'U'
          ),
          h(
            'button',
            {
              type: 'button',
              title: 'Bulleted list',
              'aria-label': 'Bulleted list',
              onMousedown: handleToolbarPointer,
              onClick: () => command('insertUnorderedList')
            },
            '•'
          ),
          h(
            'button',
            {
              type: 'button',
              title: 'Numbered list',
              'aria-label': 'Numbered list',
              onMousedown: handleToolbarPointer,
              onClick: () => command('insertOrderedList')
            },
            '1.'
          )
        ]),
        h('div', {
          ref: editor,
          class: 'tm-editor__surface',
          contenteditable: 'true',
          spellcheck: 'true',
          onFocus: saveSelection,
          onKeyup: saveSelection,
          onMouseup: saveSelection,
          onBeforeinput: handleBeforeInput,
          onInput: saveSelection,
          onPaste: handlePaste,
          'data-placeholder': 'Enter detailed testing notes...'
        })
      ]);
  }
});

watch(() => route.fullPath, loadCurrentSection);
watch([userSearch, userRoleFilter], () => {
  userPage.value = 1;
});
watch(totalUserPages, (pages) => {
  if (userPage.value > pages) {
    userPage.value = pages;
  }
});
watch(
  () => activeChange.value?.id,
  () => {
    notesOpen.value = false;
    checklistNotePromptItemId.value = null;
    feedbackError.value = '';
    testerSearch.value = '';
    testerStatusFilter.value = 'All Statuses';
    testerResultFilter.value = 'All Results';
    testerAssignmentFilter.value = 'All Assignments';
    notesEditor.value?.clear();
  }
);
onMounted(() => {
  void loadCurrentSection();
  updateChangeLayout(changeLayout.value);
  window.addEventListener('resize', handleChangeLayoutResize);
});
onBeforeUnmount(() => {
  stopChangeLayoutDrag();
  window.removeEventListener('resize', handleChangeLayoutResize);
});
</script>

<style scoped>
.tm-shell {
  --tm-bg: #090d0f;
  --tm-panel: rgba(14, 19, 20, 0.92);
  --tm-panel-2: rgba(20, 27, 28, 0.88);
  --tm-border: rgba(198, 139, 68, 0.28);
  --tm-border-soft: rgba(213, 196, 164, 0.13);
  --tm-gold: #d9a45f;
  --tm-blue: #55b7ff;
  --tm-green: #72d66f;
  --tm-red: #ff6b55;
  --tm-text: #f4ead8;
  --tm-muted: #b9ad9d;
  --tm-button-radius: 14px;
  --tm-control-radius: 11px;
  --tm-app-header-height: 5.5rem;
  height: calc(100dvh - var(--tm-app-header-height));
  min-height: 0;
  margin: -2rem;
  padding: 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--tm-text);
  background:
    radial-gradient(circle at 78% 0%, rgba(85, 183, 255, 0.08), transparent 22rem),
    radial-gradient(circle at top left, rgba(217, 164, 95, 0.12), transparent 30rem),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, rgba(217, 164, 95, 0.025) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, rgba(13, 17, 16, 0.98), rgba(4, 7, 8, 1));
  position: relative;
}

.tm-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.34;
  background-image:
    radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px),
    radial-gradient(circle at 82% 44%, rgba(217, 164, 95, 0.05) 0 1px, transparent 1px);
  background-size:
    17px 19px,
    23px 29px;
}

.tm-hero,
.tm-subnav,
.tm-grid,
.tm-dashboard,
.tm-settings,
.tm-loading {
  width: calc(100% - clamp(2rem, 4vw, 6rem));
  max-width: none;
  margin-inline: auto;
}

.tm-grid,
.tm-dashboard,
.tm-settings,
.tm-loading {
  flex: 1 1 auto;
  min-height: 0;
}

.tm-dashboard {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tm-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.35rem 0 0.45rem;
}

.tm-eyebrow {
  margin: 0 0 0.1rem;
  color: var(--tm-gold);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.64rem;
}

.tm-hero h1,
.tm-panel h2,
.tm-detail h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0;
}

.tm-hero h1 {
  font-size: clamp(1.45rem, 1.8vw, 2rem);
  line-height: 1;
  color: #f3d69f;
  font-weight: 700;
  text-shadow:
    0 1px 0 #3c2412,
    0 0 14px rgba(217, 164, 95, 0.22);
}

.tm-subnav {
  display: flex;
  gap: 0.28rem;
  align-items: center;
  border: 1px solid rgba(217, 164, 95, 0.34);
  border-radius: var(--tm-panel-radius);
  background:
    linear-gradient(90deg, rgba(217, 164, 95, 0.16), rgba(85, 183, 255, 0.08) 52%, transparent),
    rgba(7, 10, 11, 0.94);
  margin-bottom: 0.75rem;
  padding: 0.28rem;
  overflow-x: auto;
  box-shadow:
    inset 0 1px 0 rgba(255, 231, 190, 0.08),
    0 10px 24px rgba(0, 0, 0, 0.24);
}

.tm-subnav__item {
  color: #d9cfbd;
  text-decoration: none;
  padding: 0.58rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--tm-control-radius);
  display: inline-flex;
  align-items: center;
  gap: 0.58rem;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0;
  transition:
    color 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-subnav__item:hover,
.tm-subnav__item:focus-visible {
  color: #f7e5bf;
  border-color: rgba(217, 164, 95, 0.34);
  background: rgba(217, 164, 95, 0.08);
}

.tm-subnav__icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid rgba(85, 183, 255, 0.22);
  border-radius: 0.38rem;
  color: var(--tm-blue);
  background: rgba(85, 183, 255, 0.08);
}

.tm-subnav__icon svg {
  width: 1.05rem;
  height: 1.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  overflow: visible;
}

.tm-subnav__item--active {
  color: #ffe1a1;
  border-color: rgba(217, 164, 95, 0.52);
  background:
    linear-gradient(180deg, rgba(217, 164, 95, 0.2), rgba(217, 164, 95, 0.1)),
    rgba(15, 22, 22, 0.86);
  box-shadow:
    inset 0 -2px 0 var(--tm-gold),
    0 0 18px rgba(217, 164, 95, 0.12);
}

.tm-subnav__item--active .tm-subnav__icon {
  color: #071012;
  border-color: rgba(255, 231, 190, 0.36);
  background: var(--tm-gold);
}

.tm-kpis,
.tm-grid {
  display: grid;
  gap: 1rem;
}

.tm-kpis {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  flex: 0 0 auto;
  margin-bottom: 1rem;
}

.tm-kpi,
.tm-panel,
.tm-modal__panel {
  border: 1px solid var(--tm-border);
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.035), transparent 20rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    linear-gradient(180deg, var(--tm-panel), rgba(7, 10, 11, 0.95));
  box-shadow:
    inset 0 0 0 1px rgba(255, 231, 190, 0.04),
    0 16px 40px rgba(0, 0, 0, 0.25);
}

.tm-kpi {
  padding: 0.9rem;
  min-height: 6.4rem;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.85rem;
  align-items: center;
}

.tm-kpi strong {
  font-size: 2rem;
  font-family: Georgia, 'Times New Roman', serif;
}

.tm-kpi span:not(.tm-kpi__icon),
.tm-kpi small {
  grid-column: 2;
}

.tm-kpi small,
.tm-table small,
.tm-panel p,
.tm-change-card small {
  color: var(--tm-muted);
}

.tm-kpi__icon {
  grid-row: span 3;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.45rem;
  border: 1px solid currentColor;
}

.tm-kpi__icon--blue {
  color: var(--tm-blue);
}
.tm-kpi__icon--red {
  color: var(--tm-red);
}
.tm-kpi__icon--gold {
  color: var(--tm-gold);
}
.tm-kpi__icon--green {
  color: var(--tm-green);
}
.tm-kpi__icon--purple {
  color: #c084fc;
}

.tm-grid--dashboard {
  grid-template-columns: minmax(0, 2fr) minmax(22rem, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.tm-grid--changes {
  grid-template-columns:
    var(--tm-change-left-width, 26.5rem) var(--tm-change-splitter-width, 1rem)
    minmax(30rem, 1fr) var(--tm-change-splitter-width, 1rem)
    var(--tm-change-right-width, 22rem);
  gap: 0;
  align-items: stretch;
}

.tm-lane-splitter {
  position: relative;
  width: var(--tm-change-splitter-width, 1rem);
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.tm-lane-splitter::before {
  content: '';
  position: absolute;
  inset: 0 0.25rem;
  border-left: 1px solid rgba(198, 139, 68, 0.18);
  border-right: 1px solid rgba(85, 183, 255, 0.1);
  background:
    linear-gradient(180deg, transparent, rgba(217, 164, 95, 0.14), transparent),
    rgba(255, 255, 255, 0.015);
  opacity: 0.72;
  transition:
    opacity 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease;
}

.tm-lane-splitter span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.24rem;
  height: 3.4rem;
  border-radius: 999px;
  background: repeating-linear-gradient(
    180deg,
    rgba(244, 234, 216, 0.44) 0 0.22rem,
    transparent 0.22rem 0.48rem
  );
  transform: translate(-50%, -50%);
  opacity: 0.55;
  transition:
    opacity 0.14s ease,
    background 0.14s ease;
}

.tm-lane-splitter:hover::before,
.tm-lane-splitter:focus-visible::before,
.tm-grid--resizing .tm-lane-splitter::before {
  border-left-color: rgba(217, 164, 95, 0.5);
  border-right-color: rgba(85, 183, 255, 0.34);
  background:
    linear-gradient(180deg, transparent, rgba(85, 183, 255, 0.18), transparent),
    rgba(217, 164, 95, 0.05);
  opacity: 1;
}

.tm-lane-splitter:hover span,
.tm-lane-splitter:focus-visible span,
.tm-grid--resizing .tm-lane-splitter span {
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 232, 188, 0.8) 0 0.22rem,
    transparent 0.22rem 0.48rem
  );
  opacity: 1;
}

.tm-lane-splitter:focus-visible {
  outline: 2px solid rgba(119, 201, 255, 0.65);
  outline-offset: -2px;
}

.tm-grid--resizing,
.tm-grid--resizing * {
  user-select: none;
}

.tm-grid--users {
  grid-template-columns: minmax(0, 1fr) 24rem;
  align-items: stretch;
}

.tm-panel {
  padding: 1rem;
  min-width: 0;
  min-height: 0;
}

.tm-panel--large {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tm-panel__header,
.tm-detail__header,
.tm-section-title {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.tm-panel__header h2,
.tm-panel__header h3 {
  margin: 0;
  color: var(--tm-gold);
  text-transform: uppercase;
  font-size: 1.05rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 500;
}

.tm-panel__header h2 span {
  margin-right: 0.45rem;
  color: #ead1a0;
}

.tm-stack {
  display: grid;
  gap: 1rem;
  align-content: start;
  min-height: 0;
  overflow: auto;
}

.tm-table {
  display: grid;
}

.tm-panel--large > .tm-table {
  min-height: 0;
  overflow: auto;
  padding-right: 0.25rem;
}

.tm-table__head {
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.75rem;
}

.tm-table__row,
.tm-table__head {
  display: grid;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--tm-border-soft);
  color: inherit;
  text-align: center;
  background: transparent;
  border-left: 0;
  border-right: 0;
  border-top: 0;
}

.tm-table__row {
  cursor: pointer;
}

.tm-empty-table {
  margin: 0;
  padding: 1.5rem 0.25rem;
  color: var(--tm-muted);
  border-bottom: 1px solid var(--tm-border-soft);
}

.tm-table__row--changes {
  grid-template-columns: 4.5rem minmax(0, 1.8fr) 9rem 10rem 8rem;
}

.tm-table__row--changes > span:nth-child(2) {
  display: grid;
  gap: 0.18rem;
}

.tm-table__row--changes > span:nth-child(2) strong,
.tm-table__row--changes > span:nth-child(2) small {
  display: block;
}

.tm-table__row--testers {
  grid-template-columns:
    minmax(7rem, 1.2fr) minmax(6rem, 0.9fr) minmax(5.5rem, 0.8fr) minmax(5.5rem, 0.8fr)
    3rem 5rem;
}

.tm-table__row--testers-admin {
  grid-template-columns:
    minmax(7rem, 1.2fr) minmax(6rem, 0.9fr) minmax(5.5rem, 0.8fr) minmax(5.5rem, 0.8fr)
    3rem 5rem 5rem;
}

.tm-table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tm-table-action {
  border: 1px solid rgba(85, 183, 255, 0.4);
  border-radius: var(--tm-control-radius);
  background: rgba(20, 68, 105, 0.35);
  color: #d8efff;
  padding: 0.42rem 0.55rem;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
}

.tm-table-action--danger {
  border-color: rgba(255, 107, 85, 0.55);
  background: rgba(106, 35, 27, 0.44);
  color: #ffd8d2;
}

.tm-table__row--users {
  grid-template-columns: minmax(13rem, 1.4fr) 8rem 8rem 10rem 8rem;
}

.tm-user-cell {
  display: inline-grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.2rem;
}

.tm-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 1px solid var(--tm-border);
  display: grid;
  place-items: center;
  margin-right: 0.55rem;
  color: var(--tm-gold);
  background: radial-gradient(circle at 35% 25%, rgba(217, 164, 95, 0.24), rgba(9, 12, 13, 0.9));
  font-family: Georgia, 'Times New Roman', serif;
  text-transform: uppercase;
}

.tm-avatar--small {
  width: 2rem;
  height: 2rem;
  margin-right: 0;
  font-size: 0.85rem;
}

.tm-user-cell > span:last-child {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}

.tm-result-minis {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}

.tm-btn,
.tm-icon-btn,
.tm-action,
.tm-page-btn {
  border: 1px solid rgba(85, 183, 255, 0.45);
  border-radius: var(--tm-button-radius);
  background: rgba(20, 68, 105, 0.45);
  color: #d8efff;
  padding: 0.65rem 0.9rem;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.tm-btn:hover,
.tm-icon-btn:hover,
.tm-action:hover,
.tm-page-btn:hover {
  transform: translateY(-1px);
}

.tm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.tm-btn--primary {
  background: rgba(14, 72, 120, 0.72);
}

.tm-btn--primary:focus-visible,
.tm-change-list__add:focus-visible {
  outline: 2px solid rgba(119, 201, 255, 0.55);
  outline-offset: 3px;
}

.tm-create-trigger {
  position: relative;
  isolation: isolate;
  min-height: 2.9rem;
  padding: 0.58rem 1.05rem 0.58rem 0.66rem;
  overflow: hidden;
  border-radius: 0.55rem;
  border-color: rgba(245, 190, 102, 0.42);
  background:
    linear-gradient(135deg, rgba(72, 35, 20, 0.92), rgba(13, 16, 17, 0.98) 48%),
    linear-gradient(180deg, rgba(32, 35, 37, 0.96), rgba(5, 7, 8, 0.98));
  color: #ffe8bc;
  font-weight: 800;
  letter-spacing: 0;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.75),
    0 12px 26px rgba(0, 0, 0, 0.34);
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease,
    color 0.14s ease;
}

.tm-create-trigger::before {
  content: '';
  position: absolute;
  inset: 0.22rem;
  border: 1px solid rgba(255, 221, 151, 0.08);
  border-radius: 0.34rem;
  pointer-events: none;
}

.tm-create-trigger::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -35%;
  width: 45%;
  background: linear-gradient(90deg, transparent, rgba(245, 190, 102, 0.14), transparent);
  transform: skewX(-18deg);
  transition: left 0.2s ease;
  pointer-events: none;
}

.tm-create-trigger:hover {
  border-color: rgba(255, 212, 128, 0.78);
  background:
    linear-gradient(135deg, rgba(100, 45, 22, 0.98), rgba(18, 21, 21, 0.98) 48%),
    linear-gradient(180deg, rgba(42, 40, 36, 0.98), rgba(7, 8, 8, 1));
  color: #fff0cf;
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.24),
    inset 0 -1px 0 rgba(0, 0, 0, 0.82),
    0 16px 32px rgba(0, 0, 0, 0.42),
    0 0 22px rgba(217, 164, 95, 0.16);
}

.tm-create-trigger:hover::after {
  left: 90%;
}

.tm-create-trigger__icon {
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 0.38rem;
  display: inline-grid;
  place-items: center;
  color: #ffd67e;
  background:
    linear-gradient(180deg, rgba(55, 40, 24, 0.96), rgba(10, 11, 11, 0.98)), rgba(0, 0, 0, 0.48);
  border: 1px solid rgba(255, 211, 130, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.18),
    0 0 0 1px rgba(0, 0, 0, 0.42);
  transition:
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease;
}

.tm-create-trigger:hover .tm-create-trigger__icon {
  color: #fff3d6;
  background:
    linear-gradient(180deg, rgba(87, 57, 27, 0.98), rgba(12, 13, 13, 1)), rgba(0, 0, 0, 0.48);
  transform: rotate(90deg);
}

.tm-btn--ghost {
  background: rgba(255, 255, 255, 0.03);
  color: var(--tm-muted);
}

.tm-btn--success {
  border-color: rgba(114, 214, 111, 0.55);
  background: rgba(29, 94, 42, 0.72);
  color: #d9ffd6;
}
.tm-btn--danger {
  border-color: rgba(255, 107, 85, 0.65);
  background: rgba(106, 35, 27, 0.72);
  color: #ffd8d2;
}
.tm-btn--warning {
  border-color: rgba(217, 164, 95, 0.7);
  background: rgba(105, 70, 17, 0.72);
  color: #ffe6b8;
}

.tm-btn:disabled {
  opacity: 0.48;
  cursor: default;
  transform: none;
}

.tm-btn:disabled:hover {
  transform: none;
}
.tm-full {
  width: 100%;
  justify-content: center;
  margin-top: 0.75rem;
}

.tm-icon-btn {
  width: 2.3rem;
  height: 2.3rem;
  border-radius: var(--tm-control-radius);
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 1.2rem;
}

.tm-change-list__add {
  width: 2.45rem;
  height: 2.45rem;
  border-radius: 0.52rem;
  border-color: rgba(245, 190, 102, 0.48);
  color: #ffd67e;
  background:
    linear-gradient(135deg, rgba(75, 35, 19, 0.94), rgba(9, 11, 12, 0.98) 52%),
    linear-gradient(180deg, rgba(33, 34, 34, 0.98), rgba(5, 6, 7, 1));
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.78),
    0 10px 20px rgba(0, 0, 0, 0.32);
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease,
    color 0.14s ease;
}

.tm-change-list__add span {
  display: block;
  font-size: 1.15rem;
  line-height: 1;
  transform: translateY(-0.02rem);
  text-shadow: 0 0 12px rgba(217, 164, 95, 0.42);
  transition: transform 0.14s ease;
}

.tm-change-list__add:hover {
  border-color: rgba(255, 212, 128, 0.84);
  color: #fff3d6;
  background:
    linear-gradient(135deg, rgba(106, 47, 22, 0.98), rgba(14, 16, 16, 1) 52%),
    linear-gradient(180deg, rgba(45, 42, 35, 0.98), rgba(6, 7, 7, 1));
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.82),
    0 14px 26px rgba(0, 0, 0, 0.42),
    0 0 18px rgba(217, 164, 95, 0.16);
}

.tm-change-list__add:hover span {
  transform: translateY(-0.02rem) rotate(90deg);
}

.tm-create-trigger:focus-visible,
.tm-change-list__add:focus-visible {
  outline: 2px solid rgba(255, 212, 128, 0.68);
  outline-offset: 3px;
}

.tm-input,
.tm-select,
.tm-textarea {
  width: 100%;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(3, 6, 7, 0.7);
  color: var(--tm-text);
  padding: 0.7rem 0.8rem;
}

.tm-textarea {
  min-height: 8rem;
  resize: vertical;
}

.tm-filters,
.tm-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.tm-filters--wide {
  grid-template-columns: minmax(12rem, 1fr) repeat(3, minmax(8rem, auto));
}

.tm-change-list {
  height: 100%;
  max-height: none;
  overflow: auto;
}

.tm-change-list__empty {
  margin: 0.5rem 0 0;
  padding: 1rem 0.75rem;
  color: var(--tm-muted);
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.018);
  text-align: center;
}

.tm-change-card {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(8rem, auto);
  gap: 0.7rem;
  align-items: start;
  padding: 0.7rem 0.75rem;
  color: inherit;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-button-radius);
  margin-bottom: 0.5rem;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease,
    box-shadow 0.12s ease;
}

.tm-change-card__main {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
}

.tm-change-card__request-strip {
  grid-column: 1 / -1;
  position: relative;
  overflow: visible;
  margin: -0.05rem 0 0;
  padding: 0.46rem 0.6rem;
  color: #d9f5ff;
  border: 1px solid rgba(85, 183, 255, 0.34);
  border-left: 3px solid #55b7ff;
  border-radius: 0.35rem;
  background: rgba(6, 27, 39, 0.84);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0;
  text-align: center;
  box-shadow:
    inset 0 1px 0 rgba(216, 239, 255, 0.05),
    0 0 0 1px rgba(0, 0, 0, 0.18);
  text-shadow: none;
}

.tm-change-card__request-strip::after {
  content: '';
  position: absolute;
  top: 0;
  left: 1.15rem;
  width: 2.2rem;
  height: 0.16rem;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(85, 183, 255, 0),
    rgba(217, 245, 255, 0.72),
    rgba(85, 183, 255, 0)
  );
  filter: blur(1.4px);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: tm-request-strip-glow 30s linear infinite;
}

@keyframes tm-request-strip-glow {
  0% {
    top: 0;
    left: 1.65rem;
    width: 2.2rem;
    height: 0.16rem;
    background: linear-gradient(
      90deg,
      rgba(85, 183, 255, 0),
      rgba(217, 245, 255, 0.72),
      rgba(85, 183, 255, 0)
    );
    opacity: 0;
  }

  2% {
    top: 0;
    left: 1.65rem;
    width: 2.2rem;
    height: 0.16rem;
    background: linear-gradient(
      90deg,
      rgba(85, 183, 255, 0),
      rgba(217, 245, 255, 0.72),
      rgba(85, 183, 255, 0)
    );
    opacity: 0.58;
  }

  45% {
    top: 0;
    left: calc(100% - 1.65rem);
    width: 2.2rem;
    height: 0.16rem;
    opacity: 0.58;
  }

  48% {
    top: 0;
    left: calc(100% - 1.15rem);
    opacity: 0;
  }

  49% {
    top: 100%;
    left: calc(100% - 1.15rem);
    width: 2.2rem;
    height: 0.16rem;
    background: linear-gradient(
      90deg,
      rgba(85, 183, 255, 0),
      rgba(217, 245, 255, 0.72),
      rgba(85, 183, 255, 0)
    );
    opacity: 0;
  }

  51% {
    top: 100%;
    left: calc(100% - 1.65rem);
    width: 2.2rem;
    height: 0.16rem;
    opacity: 0.58;
  }

  94% {
    top: 100%;
    left: 1.65rem;
    width: 2.2rem;
    height: 0.16rem;
    opacity: 0.58;
  }

  97% {
    top: 100%;
    left: 1.15rem;
    opacity: 0;
  }

  100% {
    top: 0;
    left: 1.65rem;
    width: 2.2rem;
    height: 0.16rem;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tm-change-card__request-strip::after {
    animation: none;
    top: 0;
    left: 28%;
    opacity: 0.48;
  }
}

.tm-change-card:hover,
.tm-change-card:focus-within {
  border-color: rgba(85, 183, 255, 0.82);
  background:
    linear-gradient(135deg, rgba(85, 183, 255, 0.22), rgba(217, 164, 95, 0.08)),
    rgba(19, 75, 125, 0.18);
  box-shadow:
    0 12px 26px rgba(0, 0, 0, 0.26),
    0 0 18px rgba(85, 183, 255, 0.14),
    inset 0 0 0 1px rgba(255, 231, 190, 0.06);
  transform: translateX(2px) translateY(-1px);
}

.tm-change-card:focus-within {
  outline: 2px solid rgba(217, 164, 95, 0.65);
  outline-offset: 2px;
}

.tm-change-card__main > span:nth-child(2) {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  align-content: start;
}

.tm-change-card strong,
.tm-change-card small {
  display: block;
}

.tm-change-card:hover strong,
.tm-change-card:focus-within strong {
  color: #fff3dd;
}

.tm-change-card--active {
  border-color: rgba(85, 183, 255, 0.8);
  background: rgba(19, 75, 125, 0.25);
}

.tm-change-card--active:hover,
.tm-change-card--active:focus-within {
  border-color: rgba(85, 183, 255, 0.95);
  background:
    linear-gradient(135deg, rgba(85, 183, 255, 0.24), rgba(217, 164, 95, 0.08)),
    rgba(19, 75, 125, 0.28);
}

.tm-change-card--viewer-testing {
  border-color: rgba(114, 214, 111, 0.78);
  box-shadow:
    inset 0 0 0 1px rgba(114, 214, 111, 0.24),
    0 0 0 1px rgba(114, 214, 111, 0.06);
}

.tm-change-card--viewer-testing:hover,
.tm-change-card--viewer-testing:focus-within,
.tm-change-card--viewer-testing.tm-change-card--active,
.tm-change-card--viewer-testing.tm-change-card--active:hover,
.tm-change-card--viewer-testing.tm-change-card--active:focus-within {
  border-color: rgba(114, 214, 111, 0.95);
}

.tm-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--tm-muted);
}

.tm-change-card:hover .tm-dot,
.tm-change-card:focus-within .tm-dot {
  box-shadow: 0 0 0 4px rgba(85, 183, 255, 0.12);
}

.tm-dot--testing,
.tm-dot--passed {
  background: var(--tm-green);
}
.tm-dot--failed,
.tm-dot--blocked {
  background: var(--tm-red);
}
.tm-dot--submitted,
.tm-dot--awaiting_test {
  background: var(--tm-gold);
}

.tm-dot--coverage-blocked {
  background: #b88cff;
}

.tm-dot--viewer-testing,
.tm-dot--viewer-passed,
.tm-dot--viewer-done {
  background: var(--tm-green);
}

.tm-dot--viewer-failed {
  background: var(--tm-red);
}

.tm-dot--viewer-blocked,
.tm-dot--viewer-assigned,
.tm-dot--viewer-requested {
  background: var(--tm-gold);
}

.tm-dot--viewer-unassigned {
  background: rgba(188, 178, 164, 0.66);
}

.tm-change-status-counters {
  align-self: start;
  justify-self: end;
  min-width: 8rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.28rem;
  padding: 0.3rem;
  border: 1px solid rgba(117, 154, 175, 0.34);
  border-radius: 0.65rem;
  color: #c8dbe4;
  font: inherit;
  background: rgba(11, 26, 34, 0.78);
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease,
    color 0.12s ease;
}

.tm-change-status-counters:hover,
.tm-change-status-counters:focus-visible {
  border-color: rgba(135, 177, 199, 0.54);
  color: #e5f0f5;
  background: rgba(13, 34, 45, 0.88);
  transform: translateY(-1px);
}

.tm-change-status-counters:focus-visible,
.tm-change-card__main:focus-visible {
  outline: 2px solid rgba(119, 201, 255, 0.75);
  outline-offset: 3px;
}

.tm-change-status-counter {
  min-width: 0;
  min-height: 2.2rem;
  display: grid;
  place-items: center;
  gap: 0.08rem;
  padding: 0.32rem 0.24rem;
  border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
  border-radius: 0.45rem;
  background: rgba(255, 255, 255, 0.035);
}

.tm-change-status-counter strong {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.08rem;
  line-height: 1;
}

.tm-change-status-counter span {
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.tm-change-status-counter--testers {
  color: #7cbde8;
  background: rgba(85, 183, 255, 0.055);
}

.tm-change-status-counter--failed {
  color: #e48274;
  background: rgba(255, 107, 85, 0.055);
}

.tm-change-status-counter--blocked {
  color: #c7a16e;
  background: rgba(217, 164, 95, 0.06);
}

.tm-change-status-counter--passed {
  color: #86c784;
  background: rgba(114, 214, 111, 0.055);
}

.tm-viewer-status {
  justify-self: end;
  min-width: 6.6rem;
  padding: 0.24rem 0.52rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
}

.tm-change-card .tm-viewer-status {
  justify-self: start;
  margin-top: 0.25rem;
}

.tm-viewer-status--testing,
.tm-viewer-status--passed,
.tm-viewer-status--done {
  color: var(--tm-green);
  background: rgba(114, 214, 111, 0.12);
}

.tm-viewer-status--failed {
  color: var(--tm-red);
  background: rgba(255, 107, 85, 0.12);
}

.tm-viewer-status--blocked,
.tm-viewer-status--assigned,
.tm-viewer-status--requested {
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.12);
}

.tm-viewer-status--requested {
  color: #ffe7a8;
  border-color: rgba(217, 164, 95, 0.42);
  background: rgba(217, 164, 95, 0.16);
}

.tm-viewer-status--unassigned {
  color: var(--tm-muted);
  background: rgba(255, 255, 255, 0.055);
}

.tm-detail,
.tm-inspector {
  height: 100%;
  max-height: none;
  overflow: auto;
}

.tm-detail-unavailable {
  grid-column: 3 / -1;
  display: grid;
  place-items: center;
  min-height: 24rem;
}

.tm-unavailable-state {
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  max-width: 28rem;
  text-align: center;
}

.tm-unavailable-state > span {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  color: var(--tm-gold);
  border: 1px solid rgba(217, 164, 95, 0.42);
  border-radius: 50%;
  background: rgba(217, 164, 95, 0.1);
  font-size: 1.6rem;
}

.tm-unavailable-state h2 {
  margin: 0;
}

.tm-unavailable-state p {
  margin: 0;
  color: var(--tm-muted);
}

.tm-id {
  color: rgba(207, 194, 174, 0.72);
  margin: 0.18rem 0 0.4rem;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-detail__header h2 {
  font-size: 1.9rem;
  color: #fff3dd;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
}

.tm-detail__header > div:first-child {
  min-width: 0;
}

.tm-share-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.05rem;
  margin: 0 0 0.55rem;
  padding: 0.35rem 0.72rem 0.35rem 0.46rem;
  border: 1px solid rgba(85, 183, 255, 0.3);
  border-radius: 999px;
  color: #cfe9f8;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 78%), rgba(13, 36, 52, 0.68);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.035),
    0 8px 18px rgba(0, 0, 0, 0.2);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.tm-share-button svg {
  width: 1.18rem;
  height: 1.18rem;
  padding: 0.25rem;
  border-radius: 50%;
  color: #8dd6ff;
  background: rgba(85, 183, 255, 0.12);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-share-button:hover,
.tm-share-button:focus-visible {
  color: #ffffff;
  border-color: rgba(85, 183, 255, 0.55);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 78%), rgba(18, 50, 72, 0.82);
  transform: translateY(-1px);
}

.tm-share-button:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.52);
  outline-offset: 2px;
}

.tm-detail__header p:not(.tm-id) {
  color: #cfc2ae;
}

.tm-detail__actions {
  align-self: stretch;
  min-width: 8.8rem;
  display: grid;
  justify-items: end;
  align-content: space-between;
  gap: 0.75rem;
}

.tm-detail__actions .tm-status {
  align-self: start;
}

.tm-detail__action-buttons {
  align-self: end;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.tm-detail__actions .tm-btn {
  align-self: end;
  white-space: nowrap;
}

.tm-result-buttons,
.tm-toolbar,
.tm-settings-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.tm-change-description {
  margin: -0.25rem 0 0.9rem;
  padding: 0 0 0.85rem;
  border-bottom: 1px solid var(--tm-border-soft);
}

.tm-change-description h3,
:deep(.tm-workflow h3),
.tm-section-title--detail h3 {
  margin: 0 0 0.35rem;
  color: var(--tm-gold);
  font-size: 0.96rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
}

.tm-section-title--detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
}

.tm-section-title--detail > div {
  grid-column: 2;
  text-align: center;
}

.tm-section-title--detail > span {
  grid-column: 3;
  justify-self: end;
}

.tm-settings-message {
  margin-top: 0.45rem;
  color: var(--tm-blue);
  font-size: 0.88rem;
}

.tm-tabs {
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid var(--tm-border-soft);
  margin-bottom: 1rem;
}

.tm-tabs button {
  background: transparent;
  border: 0;
  border-radius: var(--tm-control-radius) var(--tm-control-radius) 0 0;
  color: var(--tm-muted);
  padding: 0.75rem 0;
  cursor: pointer;
}

.tm-tabs button:focus {
  outline: none;
}

.tm-tabs__button--active {
  color: var(--tm-gold) !important;
  box-shadow: inset 0 -2px 0 var(--tm-gold);
}

.tm-detail-section {
  display: grid;
  gap: 1.1rem;
}

.tm-workflow {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--tm-border-soft);
  overflow: visible;
}

:deep(.tm-workflow h3) {
  text-align: center;
}

:deep(.tm-workflow__steps) {
  --tm-workflow-node-size: 3.6rem;
  --tm-workflow-step-gap: 0.6rem;
  display: flex;
  gap: var(--tm-workflow-step-gap);
  justify-content: center;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.75rem 0.45rem 0.45rem;
  margin-top: -0.25rem;
}

:deep(.tm-workflow__step) {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  color: var(--tm-muted);
  min-width: 6.5rem;
  position: relative;
  z-index: 0;
}

:deep(.tm-workflow__step:not(:last-child)::after) {
  content: '';
  position: absolute;
  top: calc(var(--tm-workflow-node-size) / 2);
  left: calc(50% + var(--tm-workflow-node-size) / 2 - 1px);
  width: calc(100% + var(--tm-workflow-step-gap) - var(--tm-workflow-node-size) + 2px);
  border-top: 1px solid var(--tm-border);
  z-index: -1;
}

:deep(.tm-workflow__step span) {
  width: var(--tm-workflow-node-size);
  height: var(--tm-workflow-node-size);
  border-radius: 50%;
  border: 1px solid rgba(217, 164, 95, 0.55);
  display: grid;
  place-items: center;
  font-size: 1.35rem;
  position: relative;
  z-index: 1;
  background:
    radial-gradient(circle at 45% 35%, rgba(217, 164, 95, 0.16), transparent 60%),
    rgba(8, 10, 10, 0.92);
}

:deep(.tm-workflow__step--active) {
  color: var(--tm-blue);
}

:deep(.tm-workflow__step--active span) {
  box-shadow:
    0 0 0 3px rgba(85, 183, 255, 0.18),
    0 0 20px rgba(85, 183, 255, 0.3);
}

:deep(.tm-workflow__step--complete) {
  color: #9ee898;
}

:deep(.tm-workflow__step--complete::after) {
  border-top-color: rgba(111, 213, 121, 0.72);
  box-shadow: 0 0 10px rgba(111, 213, 121, 0.18);
}

:deep(.tm-workflow__step--complete span) {
  border-color: rgba(111, 213, 121, 0.8);
  color: var(--tm-green);
  background:
    radial-gradient(circle at 45% 35%, rgba(111, 213, 121, 0.24), transparent 62%),
    rgba(14, 42, 19, 0.92);
  box-shadow:
    0 0 0 3px rgba(111, 213, 121, 0.12),
    0 0 18px rgba(111, 213, 121, 0.2);
}

:deep(.tm-workflow__step--complete strong) {
  color: #dff8da;
}

:deep(.tm-workflow__step--complete small) {
  color: #9ee898;
}

:deep(.tm-workflow__step--skipped) {
  color: rgba(207, 194, 174, 0.72);
}

:deep(.tm-workflow__step--skipped span) {
  border-color: rgba(207, 194, 174, 0.36);
  color: rgba(207, 194, 174, 0.74);
  background:
    radial-gradient(circle at 45% 35%, rgba(207, 194, 174, 0.12), transparent 62%),
    rgba(8, 10, 10, 0.88);
}

:deep(.tm-workflow__step--skipped strong) {
  color: rgba(238, 225, 207, 0.78);
}

:deep(.tm-workflow__step--skipped small) {
  color: rgba(207, 194, 174, 0.72);
}

.tm-rich {
  color: #eee1cf;
  line-height: 1.55;
}

.tm-rich p,
.tm-rich ul,
.tm-rich ol,
.tm-rich blockquote {
  margin: 0.35rem 0 0;
}

.tm-rich > :first-child {
  margin-top: 0;
}

.tm-rich ul,
.tm-rich ol {
  padding-left: 1.35rem;
}

.tm-rich li + li {
  margin-top: 0.2rem;
}

.tm-rich blockquote {
  border-left: 2px solid rgba(217, 164, 95, 0.48);
  padding-left: 0.75rem;
  color: #d9cec0;
}

.tm-rich code {
  padding: 0.05rem 0.22rem;
  border: 1px solid rgba(85, 183, 255, 0.22);
  background: rgba(85, 183, 255, 0.08);
  color: #bfe4ff;
}

.tm-progress {
  height: 0.45rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--tm-border-soft);
}

.tm-progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--tm-blue), var(--tm-green));
}

.tm-progress--coverage {
  height: 0.8rem;
  border: 1px solid rgba(85, 183, 255, 0.18);
  border-radius: 999px;
  padding: 2px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent), rgba(5, 9, 10, 0.72);
  box-shadow:
    inset 0 0 0 1px rgba(255, 231, 190, 0.04),
    0 0 22px rgba(85, 183, 255, 0.08);
  overflow: hidden;
  position: relative;
}

.tm-progress--coverage::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  background-image: linear-gradient(
    90deg,
    transparent,
    transparent calc(var(--progress) - 1px),
    rgba(255, 255, 255, 0.32) var(--progress),
    transparent calc(var(--progress) + 1px)
  );
  pointer-events: none;
}

.tm-progress--coverage span {
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 48%),
    linear-gradient(90deg, var(--tm-blue), #7fd7c8 55%, var(--tm-green));
  box-shadow:
    0 0 16px rgba(85, 183, 255, 0.22),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.tm-tester-progress {
  display: grid;
  gap: 0.25rem;
}

.tm-mini-progress {
  height: 0.3rem;
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.05);
}

.tm-mini-progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--tm-blue), var(--tm-green));
}

.tm-tester-status-cell {
  display: inline-flex;
  position: relative;
  align-items: center;
  justify-self: center;
  justify-content: center;
  min-height: 1.55rem;
  width: 100%;
}

.tm-tester-status-cell .tm-status-loader {
  position: absolute;
  top: 50%;
  left: calc(50% + 3.45rem);
  margin-top: -0.475rem;
}

.tm-status-loader {
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  border: 2px solid rgba(119, 201, 255, 0.16);
  border-top-color: #77c9ff;
  border-right-color: rgba(119, 201, 255, 0.58);
  border-bottom-color: rgba(217, 164, 95, 0.5);
  box-shadow: 0 0 10px rgba(85, 183, 255, 0.16);
  animation: tm-status-loader-spin 2.8s linear infinite;
}

@keyframes tm-status-loader-spin {
  to {
    transform: rotate(360deg);
  }
}

.tm-coverage-matrix {
  margin-top: 0.9rem;
  overflow-x: auto;
  border: 1px solid var(--tm-border-soft);
  background: rgba(0, 0, 0, 0.16);
}

.tm-coverage-matrix__header,
.tm-coverage-matrix > div:not(.tm-coverage-matrix__header) {
  min-width: calc(17rem + var(--tester-count) * 9rem);
  display: grid;
  grid-template-columns: minmax(17rem, 1.2fr) repeat(var(--tester-count), minmax(9rem, 1fr));
}

.tm-coverage-matrix__header {
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.035);
}

.tm-coverage-matrix__header > span,
.tm-coverage-matrix > div:not(.tm-coverage-matrix__header) > span {
  min-width: 0;
  padding: 0.72rem 0.8rem;
  border-right: 1px solid var(--tm-border-soft);
  border-bottom: 1px solid var(--tm-border-soft);
}

.tm-coverage-matrix__header > span:last-child,
.tm-coverage-matrix > div:not(.tm-coverage-matrix__header) > span:last-child {
  border-right: 0;
}

.tm-coverage-matrix__header strong,
.tm-coverage-matrix-cell strong,
.tm-coverage-matrix__item strong {
  display: block;
}

.tm-coverage-matrix__header small,
.tm-coverage-matrix-cell small,
.tm-coverage-matrix__item small {
  display: block;
  margin-top: 0.18rem;
  color: var(--tm-muted);
  text-transform: none;
  font-size: 0.78rem;
}

.tm-coverage-matrix__header > span:not(:first-child) {
  display: grid;
  align-content: center;
  justify-items: center;
  text-align: center;
}

.tm-coverage-matrix-cell {
  position: relative;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.16rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.025);
}

.tm-coverage-matrix-cell--has-note {
  padding-top: 2.25rem;
}

.tm-coverage-note-btn {
  position: absolute;
  top: 0.42rem;
  right: 0.42rem;
  z-index: 2;
  width: 1.65rem;
  height: 1.65rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(217, 164, 95, 0.68);
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(73, 49, 19, 0.96), rgba(22, 20, 16, 0.98)), rgba(217, 164, 95, 0.2);
  color: #ffe0a3;
  cursor: pointer;
  opacity: 1;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.36),
    0 0 14px rgba(217, 164, 95, 0.14);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.tm-coverage-note-btn svg {
  width: 0.86rem;
  height: 0.86rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-coverage-note-btn:hover,
.tm-coverage-note-btn:focus-visible {
  opacity: 1;
  transform: translateY(-1px);
  border-color: rgba(217, 164, 95, 0.62);
  background: rgba(217, 164, 95, 0.14);
  color: var(--tm-gold);
  outline: none;
}

.tm-coverage-matrix-cell::before {
  content: '';
  width: 0.46rem;
  height: 0.46rem;
  border-radius: 50%;
  background: currentColor;
}

.tm-coverage-matrix-cell strong,
.tm-coverage-matrix-cell small {
  padding-left: 0;
}

.tm-coverage-matrix-cell--done {
  color: var(--tm-green);
  background: rgba(46, 96, 44, 0.16);
}

.tm-coverage-matrix-cell--testing {
  color: var(--tm-blue);
  background: rgba(31, 88, 128, 0.14);
}

.tm-coverage-matrix-cell--blocked {
  color: var(--tm-gold);
  background: rgba(143, 92, 20, 0.13);
}

.tm-coverage-matrix-cell--failed {
  color: var(--tm-red);
  background: rgba(116, 35, 26, 0.14);
}

.tm-coverage-matrix-cell--pending {
  color: var(--tm-muted);
}

.tm-checklist-pips {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.tm-checklist-pips span {
  width: 1.35rem;
  height: 1.35rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--tm-border-soft);
  color: var(--tm-muted);
  background: rgba(10, 12, 12, 0.58);
  font-size: 0.72rem;
}

.tm-checklist-pips .tm-checklist-pip--done {
  border-color: rgba(111, 213, 121, 0.75);
  color: var(--tm-green);
  background: rgba(46, 96, 44, 0.26);
}

.tm-checklist {
  display: grid;
  margin-top: 0.75rem;
  border: 1px solid var(--tm-border-soft);
  background: rgba(0, 0, 0, 0.12);
}

.tm-checklist div {
  display: grid;
  grid-template-columns: minmax(17rem, 1.5fr) 8rem minmax(11rem, 0.9fr) 6rem;
  gap: 1rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-bottom: 1px solid var(--tm-border-soft);
}

.tm-checklist .tm-checklist__head {
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.025);
}

.tm-checklist div > span:first-child {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.45rem;
  align-items: center;
}

.tm-checklist div > span:first-child small {
  grid-column: 2;
}

.tm-checklist__testers {
  color: var(--tm-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-check {
  width: 1rem;
  height: 1rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(114, 214, 111, 0.7);
  background: rgba(114, 214, 111, 0.12);
  color: var(--tm-green);
  font-size: 0.7rem;
}

.tm-check--empty {
  border-color: var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.02);
  color: transparent;
}

.tm-pagination {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding-top: 0.85rem;
  color: var(--tm-muted);
}

.tm-pagination > div {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}

.tm-pagination .tm-icon-btn:disabled,
.tm-page-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tm-page-btn {
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0;
}

.tm-page-btn--active {
  color: var(--tm-gold);
  border-color: var(--tm-border);
  background: rgba(217, 164, 95, 0.12);
}

.tm-status,
.tm-priority,
.tm-mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
  padding: 0.3rem 0.55rem;
  min-width: 4.8rem;
  color: var(--tm-blue);
  background: rgba(85, 183, 255, 0.1);
  font-size: 0.78rem;
  text-transform: uppercase;
}

.tm-mini {
  min-width: 2.1rem;
  padding: 0.2rem 0.5rem;
}

.tm-status--compact {
  min-width: 0;
  padding: 0.22rem 0.45rem;
}

.tm-status--passed,
.tm-status--pass,
.tm-status--done,
.tm-mini--pass {
  color: var(--tm-green);
  background: rgba(114, 214, 111, 0.12);
}
.tm-status--failed,
.tm-status--fail,
.tm-mini--fail {
  color: var(--tm-red);
  background: rgba(255, 107, 85, 0.12);
}
.tm-status--blocked,
.tm-mini--blocked {
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.12);
}
.tm-status--submitted,
.tm-status--awaiting_test,
.tm-status--renewed {
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.12);
}

.tm-priority {
  --tm-priority-color: var(--tm-gold);
  --tm-priority-bg: rgba(217, 164, 95, 0.14);
  --tm-priority-glow: rgba(217, 164, 95, 0.2);
  position: relative;
  gap: 0.38rem;
  min-width: 4.05rem;
  padding: 0.34rem 0.7rem;
  border-radius: 999px;
  color: var(--tm-priority-color);
  border-color: var(--tm-priority-color);
  background:
    linear-gradient(135deg, var(--tm-priority-bg), rgba(255, 255, 255, 0.035)),
    rgba(6, 10, 11, 0.72);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.055),
    0 0 14px var(--tm-priority-glow);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.tm-priority::before {
  content: '';
  width: 0.46rem;
  height: 0.46rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 10px currentColor;
}

.tm-priority--critical {
  --tm-priority-color: var(--tm-red);
  --tm-priority-bg: rgba(255, 107, 85, 0.17);
  --tm-priority-glow: rgba(255, 107, 85, 0.24);
}

.tm-priority--high {
  --tm-priority-color: #ff9d5c;
  --tm-priority-bg: rgba(255, 157, 92, 0.16);
  --tm-priority-glow: rgba(255, 157, 92, 0.22);
}

.tm-priority--medium {
  --tm-priority-color: var(--tm-gold);
  --tm-priority-bg: rgba(217, 164, 95, 0.14);
  --tm-priority-glow: rgba(217, 164, 95, 0.18);
}

.tm-priority--low {
  --tm-priority-color: var(--tm-blue);
  --tm-priority-bg: rgba(85, 183, 255, 0.13);
  --tm-priority-glow: rgba(85, 183, 255, 0.17);
}

.tm-history {
  display: grid;
  gap: 0.75rem;
}

.tm-history article {
  border-bottom: 1px solid var(--tm-border-soft);
  padding-bottom: 0.75rem;
}

.tm-activity-table {
  display: grid;
  border: 1px solid var(--tm-border-soft);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.tm-activity-table__head,
.tm-activity-table__row {
  display: grid;
  grid-template-columns: minmax(5.5rem, 0.8fr) minmax(8.5rem, 1.25fr) 4.8rem 4.25rem;
  gap: 0.6rem;
  align-items: center;
}

.tm-activity-table__head {
  padding: 0.48rem 0.6rem;
  color: var(--tm-muted);
  border-bottom: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.025);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.tm-activity-table__row {
  width: 100%;
  padding: 0.62rem 0.6rem;
  color: inherit;
  font: inherit;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--tm-border-soft);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-activity-table__row:last-child {
  border-bottom: 0;
}

.tm-activity-table__row:hover,
.tm-activity-table__row:focus-visible {
  background: rgba(85, 183, 255, 0.075);
  box-shadow: inset 2px 0 0 rgba(85, 183, 255, 0.7);
  outline: none;
}

.tm-activity-table__tester,
.tm-activity-table__change {
  display: grid;
  min-width: 0;
  gap: 0.08rem;
}

.tm-activity-table__tester strong,
.tm-activity-table__change strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-activity-table__tester small,
.tm-activity-table__time,
.tm-activity-table__notes {
  color: var(--tm-muted);
  font-size: 0.75rem;
}

.tm-activity-table__time {
  justify-self: end;
  white-space: nowrap;
}

.tm-activity-table__status {
  justify-self: start;
}

.tm-activity-table__notes {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 0.05rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-recent-strip {
  flex: 0 0 auto;
  margin-top: 1rem;
  display: grid;
  grid-template-columns: auto repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: center;
}

.tm-recent-strip h2 {
  color: var(--tm-gold);
  font-size: 1rem;
}

.tm-recent-strip__item {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  min-width: 0;
  padding: 0.5rem 0.6rem;
  color: inherit;
  font: inherit;
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    transform 0.14s ease;
}

.tm-recent-strip__item:hover,
.tm-recent-strip__item:focus-visible {
  border-color: rgba(85, 183, 255, 0.36);
  background: rgba(85, 183, 255, 0.08);
  transform: translateY(-1px);
  outline: none;
}

.tm-recent-strip__item span:last-child {
  display: grid;
  min-width: 0;
}

.tm-recent-strip small {
  color: var(--tm-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-history article {
  display: grid;
  grid-template-columns: 7rem auto minmax(0, 1fr) 8rem;
  gap: 0.75rem;
  align-items: start;
}

.tm-history__marker {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 1px solid currentColor;
  background: rgba(217, 164, 95, 0.12);
  color: var(--tm-gold);
  display: grid;
  place-items: center;
  font-size: 1rem;
  box-shadow: 0 0 0 3px rgba(217, 164, 95, 0.08);
}

.tm-history__marker--blue,
.tm-history__badge--blue {
  color: var(--tm-blue);
  background: rgba(85, 183, 255, 0.12);
}

.tm-history__marker--green,
.tm-history__badge--green {
  color: var(--tm-green);
  background: rgba(114, 214, 111, 0.12);
}

.tm-history__marker--red,
.tm-history__badge--red {
  color: var(--tm-red);
  background: rgba(255, 107, 85, 0.12);
}

.tm-history__marker--gold,
.tm-history__badge--gold {
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.12);
}

.tm-history__badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid currentColor;
  padding: 0.18rem 0.45rem;
  margin-right: 0.45rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  font-weight: 500;
}

.tm-attention {
  display: grid;
  gap: 0.55rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.tm-attention li {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--tm-border-soft);
  padding-bottom: 0.45rem;
}

.tm-invites {
  display: grid;
  gap: 0.3rem;
}

.tm-invites article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  border-bottom: 1px solid var(--tm-border-soft);
  padding: 0.45rem 0;
}

.tm-invites article > span:nth-child(2) {
  display: grid;
  min-width: 0;
}

.tm-invites small {
  color: var(--tm-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-inspector h2,
.tm-inspector h3 {
  color: var(--tm-gold);
  text-transform: uppercase;
  font-size: 1rem;
  margin: 0 0 0.75rem;
}

.tm-inspector h3 {
  margin-top: 1.25rem;
}

.tm-editor {
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(3, 6, 7, 0.68);
  overflow: hidden;
}

:deep(.tm-editor__bar) {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--tm-border-soft);
  padding: 0.35rem;
  background: rgba(255, 255, 255, 0.025);
}

:deep(.tm-editor__bar button) {
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.035);
  color: var(--tm-text);
  border: 1px solid transparent;
  border-radius: 6px;
  min-width: 2rem;
  height: 2rem;
  cursor: pointer;
  font-weight: 800;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

:deep(.tm-editor__bar button:hover),
:deep(.tm-editor__bar button:focus-visible),
:deep(.tm-editor__bar button.is-active) {
  background: rgba(85, 183, 255, 0.12);
  border-color: rgba(85, 183, 255, 0.32);
  color: #dff3ff;
}

:deep(.tm-editor__surface) {
  min-height: 8rem;
  padding: 0.75rem;
  outline: none;
  color: #eee1cf;
  line-height: 1.55;
}

:deep(.tm-editor__surface:focus) {
  box-shadow: inset 0 0 0 1px rgba(85, 183, 255, 0.28);
}

:deep(.tm-editor__surface p),
:deep(.tm-editor__surface ul),
:deep(.tm-editor__surface ol),
:deep(.tm-editor__surface blockquote) {
  margin: 0.35rem 0 0;
}

:deep(.tm-editor__surface > :first-child) {
  margin-top: 0;
}

:deep(.tm-editor__surface ul),
:deep(.tm-editor__surface ol) {
  padding-left: 1.35rem;
}

:deep(.tm-editor__surface:empty::before) {
  content: attr(data-placeholder);
  color: var(--tm-muted);
}

.tm-feedback-error {
  margin: 0.45rem 0 0;
  color: #ff9d8c;
  font-size: 0.78rem;
  line-height: 1.35;
}

.tm-inspector-hint {
  margin: 0.35rem 0 0;
  color: var(--tm-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.tm-notes-launch {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.35rem;
  border: 1px solid var(--tm-border-soft);
  padding: 0.7rem 0.8rem;
  color: var(--tm-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.025);
}

.tm-notes-launch span {
  color: var(--tm-gold);
}

.tm-notes-launch strong {
  font-size: 0.95rem;
}

.tm-notes-launch small {
  color: var(--tm-muted);
  font-size: 0.74rem;
  text-align: right;
}

.tm-notes-launch--has-notes {
  border-color: rgba(114, 214, 111, 0.46);
  background: linear-gradient(90deg, rgba(29, 94, 42, 0.46), rgba(29, 94, 42, 0.16));
}

.tm-notes-launch--has-notes small,
.tm-notes-launch--has-notes span {
  color: #a7eda2;
}

.tm-notes-launch--empty {
  border-color: rgba(213, 196, 164, 0.18);
  background: rgba(255, 255, 255, 0.018);
}

.tm-notes-launch:disabled {
  cursor: not-allowed;
  opacity: 0.52;
  filter: grayscale(0.35);
}

.tm-notes-launch:disabled span,
.tm-notes-launch:disabled small {
  color: var(--tm-muted);
}

.tm-testing-checklist {
  margin-top: auto;
}

.tm-testing-checklist__table {
  margin-top: 0.8rem;
  border: 1px solid var(--tm-border-soft);
  background: rgba(0, 0, 0, 0.14);
}

.tm-testing-checklist__head,
.tm-testing-checklist__row {
  display: grid;
  grid-template-columns: 4.5rem minmax(16rem, 1fr) 8rem 4.25rem 7rem;
  gap: 1rem;
  align-items: center;
  padding: 0.62rem 0.75rem;
  border-bottom: 1px solid var(--tm-border-soft);
}

.tm-testing-checklist__head {
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.03);
}

.tm-testing-checklist__row {
  cursor: pointer;
  position: relative;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.tm-testing-checklist__row:hover {
  background: rgba(217, 164, 95, 0.05);
}

.tm-testing-checklist__row > span:first-child {
  display: flex;
  justify-content: center;
}

.tm-testing-checklist__row input[type='checkbox'] {
  appearance: none;
  width: 1.55rem;
  height: 1.55rem;
  display: grid;
  place-items: center;
  margin: 0;
  border: 1px solid rgba(213, 196, 164, 0.32);
  border-radius: 0.45rem;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.01)),
    rgba(3, 6, 7, 0.8);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 0 0 rgba(111, 213, 121, 0);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.tm-testing-checklist__row input[type='checkbox']::after {
  content: '✓';
  color: #08150c;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1;
  opacity: 0;
  transform: scale(0.65);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.tm-testing-checklist__row input[type='checkbox']:hover {
  border-color: rgba(111, 213, 121, 0.58);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 0 3px rgba(111, 213, 121, 0.1);
  transform: translateY(-1px);
}

.tm-testing-checklist__row input[type='checkbox']:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.8);
  outline-offset: 3px;
}

.tm-testing-checklist__row input[type='checkbox']:checked {
  border-color: rgba(111, 213, 121, 0.9);
  background:
    radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.34), transparent 38%),
    linear-gradient(145deg, #7de475, #3fae4a 58%, #287f34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 0 0 3px rgba(111, 213, 121, 0.12),
    0 0 18px rgba(111, 213, 121, 0.2);
}

.tm-testing-checklist__row input[type='checkbox']:checked::after {
  opacity: 1;
  transform: scale(1);
}

.tm-testing-checklist__row--complete {
  border-color: rgba(111, 213, 121, 0.28);
  background:
    linear-gradient(90deg, rgba(64, 153, 73, 0.16), rgba(64, 153, 73, 0.04) 44%, transparent),
    rgba(24, 58, 31, 0.12);
  box-shadow: inset 3px 0 0 rgba(111, 213, 121, 0.65);
}

.tm-testing-checklist__row--complete:hover {
  background:
    linear-gradient(90deg, rgba(64, 153, 73, 0.2), rgba(64, 153, 73, 0.06) 48%, transparent),
    rgba(24, 58, 31, 0.16);
}

.tm-testing-checklist__row--complete strong {
  color: #dcf6d7;
}

.tm-testing-checklist__row--complete small {
  color: rgba(202, 232, 199, 0.76);
}

.tm-testing-checklist__row > span:nth-child(2) {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}

.tm-testing-checklist__row small {
  color: var(--tm-muted);
}

.tm-testing-checklist__head > span:nth-child(4),
.tm-testing-checklist__row > span:nth-child(4) {
  justify-self: center;
}

.tm-testing-checklist__status {
  display: inline-flex;
  justify-content: center;
  border: 1px solid var(--tm-border-soft);
  padding: 0.18rem 0.45rem;
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
}

.tm-testing-checklist__status--done {
  border-color: rgba(111, 213, 121, 0.75);
  color: var(--tm-green);
  background: rgba(46, 96, 44, 0.18);
}

.tm-checklist-note-btn {
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.018);
  color: var(--tm-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font: inherit;
  font-size: 0.95rem;
}

.tm-checklist-note-btn:hover,
.tm-checklist-note-btn--has-note {
  border-color: rgba(85, 183, 255, 0.45);
  color: var(--tm-blue);
  background: rgba(14, 72, 120, 0.16);
}

.tm-checklist-note-modal {
  max-width: 42rem;
}

.tm-action {
  width: 100%;
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: 0.65rem;
  align-items: center;
  text-align: left;
  margin-bottom: 0.6rem;
}

.tm-action small {
  color: var(--tm-muted);
}

.tm-action > span:last-child {
  display: grid;
  gap: 0.1rem;
}

.tm-action__icon {
  color: inherit;
  font-size: 1.45rem;
  display: grid;
  place-items: center;
}

.tm-action--success {
  border-color: rgba(114, 214, 111, 0.6);
  background: rgba(28, 88, 36, 0.52);
}
.tm-action--info {
  border-color: rgba(85, 183, 255, 0.6);
  background: rgba(23, 67, 103, 0.52);
}
.tm-action--danger {
  border-color: rgba(255, 107, 85, 0.6);
  background: rgba(90, 28, 23, 0.52);
}

.tm-link {
  color: var(--tm-blue);
  text-decoration: none;
}

.tm-donut {
  width: 8.5rem;
  height: 8.5rem;
  border-radius: 50%;
  margin: 1rem auto;
  display: grid;
  place-items: center;
  position: relative;
  isolation: isolate;
  font-size: 2rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700;
  color: var(--tm-text);
  text-shadow: 0 1px 2px #000;
  background:
    radial-gradient(circle, #111 58%, transparent 59%),
    conic-gradient(var(--tm-green), var(--tm-green), var(--tm-gold), var(--tm-red));
  box-shadow:
    inset 0 0 0 1px rgba(217, 164, 95, 0.25),
    0 0 20px rgba(0, 0, 0, 0.28);
}

.tm-donut::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  border: 1px solid rgba(85, 183, 255, 0.45);
  box-shadow: inset 0 0 0 1px rgba(217, 164, 95, 0.16);
  -webkit-mask: radial-gradient(circle, transparent 0 56%, #000 57% 100%);
  mask: radial-gradient(circle, transparent 0 56%, #000 57% 100%);
}

.tm-coverage {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
}

.tm-coverage__legend {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tm-coverage__legend li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
  color: var(--tm-text);
}

.tm-side-link {
  display: block;
  margin-top: 0.65rem;
  color: var(--tm-blue);
  text-decoration: none;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  padding: 0.55rem 0.65rem;
  text-align: center;
}

.tm-switch input {
  display: none;
}

.tm-switch span {
  width: 2.8rem;
  height: 1.5rem;
  border-radius: 99px;
  border: 1px solid var(--tm-border-soft);
  display: block;
  background: rgba(255, 255, 255, 0.08);
  position: relative;
}

.tm-switch span::after {
  content: '';
  position: absolute;
  width: 1rem;
  height: 1rem;
  top: 0.2rem;
  left: 0.2rem;
  border-radius: 50%;
  background: var(--tm-muted);
  transition:
    left 0.15s ease,
    background 0.15s ease;
}

.tm-switch input:checked + span::after {
  left: 1.45rem;
  background: var(--tm-green);
}

.tm-user-tabs {
  display: grid;
  grid-template-columns: repeat(4, auto) minmax(12rem, 1fr);
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.85rem;
}

.tm-user-tabs__item {
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.03);
  color: var(--tm-muted);
  padding: 0.58rem 0.75rem;
  text-align: left;
  cursor: pointer;
}

.tm-user-tabs__item--active {
  color: var(--tm-gold);
  border-color: var(--tm-border);
  background: rgba(217, 164, 95, 0.08);
  box-shadow: inset 0 -2px 0 var(--tm-gold);
}

.tm-user-tabs__item span {
  margin-left: 0.35rem;
  color: var(--tm-muted);
}

.tm-permissions {
  overflow-x: auto;
  border: 1px solid var(--tm-border);
  background: rgba(0, 0, 0, 0.12);
}

.tm-permissions__head,
.tm-permissions__row {
  display: grid;
  grid-template-columns: 14rem repeat(8, minmax(8rem, 1fr));
  align-items: center;
  border-bottom: 1px solid var(--tm-border-soft);
  min-width: 1120px;
}

.tm-permissions__head > span,
.tm-permissions__row > span,
.tm-permissions__row > strong {
  padding: 0.8rem 0.9rem;
}

.tm-permissions__row > span,
.tm-permissions__row > strong {
  border-right: 1px solid var(--tm-border-soft);
}

.tm-permissions__head > span {
  display: grid;
  place-items: center;
  gap: 0.25rem;
  color: var(--tm-text);
  text-align: center;
}

.tm-permissions__head > span > span {
  padding: 0;
  border: 0;
}

.tm-permissions__row > span {
  display: grid;
  place-items: center;
}

.tm-permissions__row > strong {
  display: inline-flex;
  gap: 0.55rem;
  align-items: center;
  color: var(--tm-text);
}

.tm-permission-toggle {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-content: center;
  cursor: pointer;
}

.tm-permission-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tm-permission-toggle > span {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-content: center;
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.03);
  color: var(--tm-muted);
  box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.04);
}

.tm-permission-toggle > span::after {
  content: '—';
  line-height: 1;
}

.tm-permission-toggle--checked > span {
  border-color: rgba(85, 183, 255, 0.65);
  background: rgba(20, 68, 105, 0.55);
  color: #eef8ff;
  box-shadow: inset 0 0 14px rgba(85, 183, 255, 0.28);
}

.tm-permission-toggle--checked > span::after {
  content: '✓';
  font-size: 1.2rem;
}

.tm-permission-toggle--disabled {
  cursor: default;
}

.tm-permission-toggle:not(.tm-permission-toggle--disabled):hover > span {
  border-color: rgba(217, 164, 95, 0.75);
}

.tm-settings-section {
  display: grid;
  gap: 1rem;
  margin-top: 1.1rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--tm-border-soft);
}

.tm-settings-section__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.tm-settings-section__header h3 {
  margin: 0;
  color: var(--tm-gold);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.15rem;
}

.tm-settings-section__header p {
  margin: 0.25rem 0 0;
  color: var(--tm-muted);
}

.tm-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--tm-muted);
  cursor: pointer;
  flex: 0 0 auto;
  user-select: none;
}

.tm-switch input,
.tm-discord-event input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tm-switch > span {
  width: 3rem;
  min-width: 3rem;
  flex: 0 0 3rem;
  height: 1.55rem;
  position: relative;
  border: 1px solid var(--tm-border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  box-sizing: border-box;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.tm-switch > span::after {
  content: '';
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  background: var(--tm-muted);
  transition:
    transform 0.16s ease,
    background 0.16s ease;
}

.tm-switch--checked > span {
  border-color: rgba(114, 214, 111, 0.62);
  background: rgba(29, 94, 42, 0.36);
}

.tm-switch--checked > span::after {
  left: 0.25rem;
  transform: translateX(1.45rem);
  background: var(--tm-green);
}

.tm-switch.tm-switch--checked input:checked + span::after {
  left: 0.25rem;
}

.tm-switch > strong {
  flex: 0 0 auto;
  white-space: nowrap;
}

.tm-switch--disabled,
.tm-discord-event--disabled {
  cursor: default;
  opacity: 0.68;
}

.tm-discord-settings__webhook {
  max-width: 54rem;
}

.tm-discord-events {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 0.7rem;
}

.tm-discord-event {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 0.65rem;
  row-gap: 0.12rem;
  align-items: start;
  padding: 0.72rem 0.78rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.025);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.tm-discord-event > span {
  grid-row: 1 / span 2;
  width: 1.55rem;
  height: 1.55rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--tm-border-soft);
  background: rgba(0, 0, 0, 0.2);
  color: var(--tm-muted);
}

.tm-discord-event > span::after {
  content: '—';
}

.tm-discord-event strong {
  color: var(--tm-text);
}

.tm-discord-event small {
  color: var(--tm-muted);
  line-height: 1.35;
}

.tm-discord-event--checked {
  border-color: rgba(85, 183, 255, 0.36);
  background: rgba(20, 68, 105, 0.16);
}

.tm-discord-event--checked > span {
  border-color: rgba(85, 183, 255, 0.66);
  background: rgba(20, 68, 105, 0.55);
  color: #eef8ff;
}

.tm-discord-event--checked > span::after {
  content: '✓';
  font-size: 1rem;
}

.tm-discord-event:not(.tm-discord-event--disabled):hover {
  border-color: rgba(217, 164, 95, 0.58);
}

.tm-checkmark {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-content: center;
  border: 1px solid rgba(85, 183, 255, 0.55);
  background: rgba(20, 68, 105, 0.45);
  color: transparent;
  font-size: 0;
  line-height: 1;
  position: relative;
  box-shadow: inset 0 0 12px rgba(85, 183, 255, 0.22);
}

.tm-checkmark::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #eef8ff;
  font-size: 1.2rem;
  line-height: 1;
}

.tm-dash {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-content: center;
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.03);
  color: transparent;
  position: relative;
}

.tm-dash::after {
  content: '—';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--tm-muted);
  line-height: 1;
}

.tm-modal {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 50% 0%, rgba(23, 80, 118, 0.2), transparent 34rem),
    rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 1rem;
  backdrop-filter: blur(3px);
}

.tm-modal__panel {
  width: min(52rem, 100%);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}

.tm-confirm-modal {
  width: min(34rem, 100%);
  gap: 1rem;
  padding: 1.1rem;
  border-radius: 12px;
  border-color: rgba(85, 183, 255, 0.36);
}

.tm-confirm-modal__header {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
}

.tm-confirm-modal__icon {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(85, 183, 255, 0.48);
  border-radius: 50%;
  background: rgba(14, 72, 120, 0.18);
  color: var(--tm-blue);
  font-size: 1.45rem;
  box-shadow: 0 0 18px rgba(85, 183, 255, 0.16);
}

.tm-confirm-modal__header p {
  margin: 0 0 0.18rem;
  color: var(--tm-gold);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tm-confirm-modal__header h2 {
  margin: 0;
  color: var(--tm-text);
  font-size: 1.55rem;
  line-height: 1.05;
}

.tm-confirm-modal__body {
  margin: 0;
  color: #e7dac8;
  line-height: 1.45;
}

.tm-confirm-modal__change {
  display: grid;
  gap: 0.18rem;
  padding: 0.72rem 0.8rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(0, 0, 0, 0.2);
}

.tm-confirm-modal__change span {
  color: var(--tm-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-confirm-modal__change strong {
  color: var(--tm-text);
}

.tm-confirm-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

.tm-confirm-modal--success .tm-confirm-modal__icon {
  border-color: rgba(114, 214, 111, 0.52);
  background: rgba(29, 94, 42, 0.2);
  color: var(--tm-green);
  box-shadow: 0 0 18px rgba(114, 214, 111, 0.16);
}

.tm-confirm-modal--warning {
  border-color: rgba(217, 164, 95, 0.44);
}

.tm-confirm-modal--warning .tm-confirm-modal__icon {
  border-color: rgba(217, 164, 95, 0.58);
  background: rgba(121, 76, 21, 0.22);
  color: var(--tm-gold);
  box-shadow: 0 0 18px rgba(217, 164, 95, 0.17);
}

.tm-confirm-modal--danger {
  border-color: rgba(255, 107, 85, 0.48);
}

.tm-confirm-modal--danger .tm-confirm-modal__icon {
  border-color: rgba(255, 107, 85, 0.58);
  background: rgba(106, 35, 27, 0.24);
  color: var(--tm-red);
  box-shadow: 0 0 18px rgba(255, 107, 85, 0.18);
}

.tm-create-modal {
  width: min(76rem, 100%);
  max-height: min(92dvh, 60rem);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  padding: 0;
  overflow: hidden;
  border-color: rgba(217, 164, 95, 0.42);
  background:
    radial-gradient(circle at 18% 0%, rgba(85, 183, 255, 0.16), transparent 22rem),
    radial-gradient(circle at 84% 8%, rgba(217, 164, 95, 0.12), transparent 19rem),
    rgba(5, 8, 9, 0.97);
  box-shadow:
    inset 0 0 0 1px rgba(255, 231, 190, 0.055),
    0 24px 70px rgba(0, 0, 0, 0.55);
}

.tm-edit-modal {
  width: min(58rem, 100%);
}

.tm-create-modal__header,
.tm-create-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.05rem 1.25rem;
  background:
    linear-gradient(90deg, rgba(217, 164, 95, 0.13), transparent 46%), rgba(6, 10, 11, 0.82);
}

.tm-create-modal__header {
  border-bottom: 1px solid var(--tm-border);
}

.tm-create-modal__header h2 {
  margin: 0.12rem 0 0.2rem;
  font-size: 2.15rem;
  line-height: 1;
}

.tm-create-modal__header p {
  margin: 0;
  color: var(--tm-muted);
}

.tm-create-modal__eyebrow {
  color: var(--tm-gold) !important;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.tm-create-modal__header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.tm-create-modal__summary {
  display: grid;
  gap: 0.12rem;
  min-width: 10.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(85, 183, 255, 0.3);
  border-radius: var(--tm-control-radius);
  background: rgba(14, 72, 120, 0.13);
  text-align: right;
}

.tm-create-modal__summary span {
  color: var(--tm-blue);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-create-modal__summary strong {
  color: var(--tm-text);
  font-size: 0.92rem;
}

.tm-create-modal__body {
  min-height: 0;
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  overflow: hidden;
}

.tm-edit-modal__body {
  min-height: 0;
  display: grid;
  gap: 1rem;
  overflow-y: auto;
  padding: 1.1rem;
}

.tm-create-modal__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--tm-border-soft);
}

.tm-create-modal__footer p {
  margin: 0 auto 0 0;
  color: var(--tm-muted);
  font-size: 0.86rem;
}

.tm-create-rail {
  display: grid;
  align-content: start;
  gap: 0.72rem;
  padding: 1.1rem 1rem;
  border-right: 1px solid var(--tm-border-soft);
  background:
    linear-gradient(180deg, rgba(85, 183, 255, 0.08), transparent 22rem), rgba(4, 7, 8, 0.46);
}

.tm-create-rail__step {
  display: flex;
  align-items: center;
  gap: 0.62rem;
  min-height: 3.2rem;
  padding: 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--tm-control-radius);
  color: var(--tm-muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.tm-create-rail__step strong {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--tm-border-soft);
  border-radius: 50%;
  color: var(--tm-muted);
  background: rgba(255, 255, 255, 0.035);
}

.tm-create-rail__step span {
  display: grid;
  gap: 0.08rem;
}

.tm-create-rail__step small {
  color: var(--tm-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}

.tm-create-rail__step--active,
.tm-create-rail__step--active strong {
  color: var(--tm-gold);
}

.tm-create-rail__step--active {
  border-color: rgba(217, 164, 95, 0.3);
  background: rgba(217, 164, 95, 0.07);
}

.tm-create-rail__step--active strong {
  border-color: rgba(217, 164, 95, 0.7);
  background: rgba(217, 164, 95, 0.12);
  box-shadow: 0 0 16px rgba(217, 164, 95, 0.16);
}

.tm-create-rail__step--complete,
.tm-create-rail__step--complete strong {
  color: var(--tm-green);
}

.tm-create-rail__step--complete strong {
  border-color: rgba(111, 219, 118, 0.58);
  background: rgba(36, 139, 62, 0.14);
}

.tm-create-workspace {
  display: grid;
  gap: 0.9rem;
  padding: 1.05rem;
  min-height: 0;
  overflow: auto;
}

.tm-create-section {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 8px;
  background:
    radial-gradient(circle at 0% 0%, rgba(85, 183, 255, 0.08), transparent 18rem),
    rgba(3, 7, 8, 0.34);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.tm-create-section__title {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}

.tm-create-section__title > span {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid rgba(217, 164, 95, 0.44);
  border-radius: 50%;
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.09);
}

.tm-create-section h3 {
  margin: 0;
  color: var(--tm-gold);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-create-section p {
  margin: 0.16rem 0 0;
  color: var(--tm-muted);
}

.tm-create-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.tm-field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.tm-field > span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--tm-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-field > span small {
  color: rgba(188, 178, 164, 0.74);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tm-field--full {
  grid-column: 1 / -1;
}

.tm-create-description {
  min-height: 7rem;
}

.tm-combo-field__control {
  position: relative;
  display: grid;
}

.tm-combo-field__control .tm-input {
  padding-right: 2.35rem;
}

.tm-combo-field__control > span {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--tm-blue);
  font-size: 0.92rem;
  pointer-events: none;
}

.tm-combo-field__control:focus-within > span {
  color: var(--tm-gold);
}

.tm-priority-selector {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.tm-priority-selector legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.tm-priority-selector__option {
  display: grid;
  gap: 0.22rem;
  min-height: 4.65rem;
  padding: 0.78rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  color: var(--tm-muted);
  background: rgba(255, 255, 255, 0.028);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.tm-priority-selector__option:hover,
.tm-priority-selector__option--selected {
  transform: translateY(-1px);
  border-color: rgba(85, 183, 255, 0.52);
  color: var(--tm-text);
  background: rgba(14, 72, 120, 0.16);
}

.tm-priority-selector__option--selected {
  box-shadow: inset 0 -2px 0 var(--tm-blue);
}

.tm-priority-selector__option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tm-priority-selector__option strong {
  color: var(--tm-text);
}

.tm-priority-selector__option span {
  color: var(--tm-muted);
  font-size: 0.8rem;
}

.tm-checklist-templates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.tm-checklist-templates button {
  display: grid;
  gap: 0.18rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.026);
  color: var(--tm-text);
  padding: 0.68rem 0.75rem;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.tm-checklist-templates button:hover {
  transform: translateY(-1px);
  border-color: rgba(217, 164, 95, 0.52);
  background: rgba(217, 164, 95, 0.09);
}

.tm-checklist-templates button:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.72);
  outline-offset: 2px;
}

.tm-checklist-templates span {
  color: var(--tm-muted);
  font-size: 0.8rem;
}

.tm-checklist-builder {
  display: grid;
  gap: 0.65rem;
}

.tm-checklist-builder__row {
  position: relative;
  display: grid;
  grid-template-columns: 2rem minmax(16rem, 1fr) minmax(13rem, 0.48fr);
  gap: 0.6rem;
  align-items: end;
  padding: 0.85rem 3.15rem 0.75rem 0.65rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(0, 0, 0, 0.16);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.tm-checklist-builder__row .tm-field--full {
  grid-column: 2 / 4;
}

.tm-checklist-builder__row:hover {
  border-color: rgba(85, 183, 255, 0.24);
  background: rgba(8, 18, 22, 0.24);
}

.tm-checklist-builder__index {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  align-self: center;
  border: 1px solid rgba(217, 164, 95, 0.42);
  border-radius: 50%;
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.08);
}

.tm-checklist-builder__remove {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  width: 2.15rem;
  height: 2.15rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 107, 85, 0.46);
  border-radius: 8px;
  background: rgba(90, 19, 15, 0.24);
  color: var(--tm-red);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.tm-checklist-builder__remove svg {
  width: 1.05rem;
  height: 1.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-checklist-builder__remove:hover:not(:disabled),
.tm-checklist-builder__remove:focus-visible:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255, 107, 85, 0.76);
  background: rgba(128, 31, 23, 0.38);
  color: #ff8a76;
  box-shadow: 0 0 14px rgba(255, 107, 85, 0.16);
  outline: none;
}

.tm-checklist-builder__remove:disabled {
  border-color: rgba(188, 178, 164, 0.18);
  background: rgba(255, 255, 255, 0.025);
  color: rgba(188, 178, 164, 0.34);
  cursor: not-allowed;
}

.tm-quick-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.45rem 0 0.35rem;
}

.tm-quick-notes button {
  border: 1px solid var(--tm-border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.015);
  color: var(--tm-muted);
  padding: 0.25rem 0.45rem;
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  opacity: 0.82;
}

.tm-note-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.35rem;
}

.tm-note-save {
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  background: rgba(14, 72, 120, 0.45);
}

.tm-notes-modal {
  width: min(46rem, 100%);
}

.tm-coverage-note-modal {
  width: min(32rem, 100%);
  gap: 0.85rem;
  border-color: rgba(217, 164, 95, 0.38);
}

.tm-modal-eyebrow {
  margin: 0 0 0.2rem;
  color: var(--tm-gold);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tm-coverage-note-modal__body {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: var(--tm-control-radius);
  background: rgba(255, 255, 255, 0.025);
}

.tm-coverage-note-modal__body > span {
  color: var(--tm-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.tm-coverage-note-modal__body .tm-rich {
  color: #eadfcc;
}

.tm-recorded-notes {
  display: grid;
  gap: 0.45rem;
  max-height: 14rem;
  overflow: auto;
  border-top: 1px solid var(--tm-border-soft);
  padding-top: 0.65rem;
}

.tm-recorded-notes h3 {
  margin: 0;
}

.tm-recorded-notes article {
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.018);
  padding: 0.55rem 0.65rem;
}

.tm-recorded-notes__meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  color: var(--tm-muted);
  font-size: 0.78rem;
}

.tm-recorded-notes strong {
  color: var(--tm-text);
}

.tm-recorded-notes__time {
  color: #a99c8d;
  white-space: nowrap;
}

.tm-recorded-notes__content {
  margin: 0.3rem 0 0;
  color: #d9cec0;
  line-height: 1.45;
}

.tm-request-modal label {
  display: grid;
  gap: 0.35rem;
  color: var(--tm-muted);
}

@media (max-width: 1300px) {
  .tm-shell {
    height: auto;
    min-height: calc(100dvh - var(--tm-app-header-height));
    overflow: visible;
  }

  .tm-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tm-grid--changes,
  .tm-grid--dashboard,
  .tm-grid--users {
    grid-template-columns: 1fr;
    gap: 1rem;
    align-items: start;
  }

  .tm-lane-splitter {
    display: none;
  }

  .tm-detail,
  .tm-inspector,
  .tm-change-list {
    height: auto;
    max-height: none;
  }

  .tm-detail-unavailable {
    grid-column: auto;
  }

  .tm-create-modal__body {
    grid-template-columns: 1fr;
  }

  .tm-create-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--tm-border-soft);
  }

  .tm-create-rail__step {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .tm-create-grid,
  .tm-priority-selector,
  .tm-checklist-templates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-checklist-builder__row {
    grid-template-columns: 2rem minmax(12rem, 1fr) minmax(10rem, 1fr);
  }

  .tm-checklist-builder__row .tm-field--full {
    grid-column: 2 / 4;
  }
}

@media (max-width: 760px) {
  .tm-shell {
    margin: -1.25rem;
    padding: 0.9rem;
  }

  .tm-hero,
  .tm-subnav,
  .tm-grid,
  .tm-dashboard,
  .tm-settings,
  .tm-loading {
    width: 100%;
  }

  .tm-kpis {
    grid-template-columns: 1fr;
  }

  :deep(.tm-workflow__steps) {
    justify-content: flex-start;
  }

  .tm-table {
    overflow-x: auto;
  }

  .tm-table__row,
  .tm-table__head {
    min-width: 760px;
  }

  .tm-hero,
  .tm-panel__header,
  .tm-detail__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .tm-detail__actions {
    width: 100%;
    min-width: 0;
    align-self: stretch;
    grid-template-columns: 1fr auto;
    align-content: center;
    align-items: center;
  }

  .tm-detail__actions .tm-status {
    justify-self: start;
  }

  .tm-detail__actions .tm-btn {
    justify-self: end;
  }

  .tm-modal {
    padding: 0.55rem;
  }

  .tm-create-modal {
    max-height: calc(100dvh - 1.1rem);
  }

  .tm-create-modal__header,
  .tm-create-modal__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-create-modal__footer .tm-btn {
    width: 100%;
    justify-content: center;
  }

  .tm-create-grid,
  .tm-priority-selector,
  .tm-checklist-templates,
  .tm-create-rail,
  .tm-checklist-builder__row {
    grid-template-columns: 1fr;
  }

  .tm-checklist-builder__row .tm-field--full {
    grid-column: auto;
  }

  .tm-checklist-builder__index {
    justify-self: start;
  }

  .tm-checklist-builder__remove {
    top: 0.55rem;
    right: 0.55rem;
  }
}
</style>
