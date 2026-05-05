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
        v-for="item in visibleSubnavItems"
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
        <span
          v-if="item.key === 'next-patch' && nextPatchCount > 0"
          class="tm-subnav__counter"
          aria-label="Changes queued for next patch"
        >
          {{ nextPatchCount }}
        </span>
      </RouterLink>
    </nav>

    <section v-if="loading" class="tm-panel tm-loading">Loading Test Manager...</section>

    <template v-else>
      <section v-if="currentSection === 'dashboard'" class="tm-dashboard">
        <div class="tm-grid tm-grid--dashboard">
          <section class="tm-panel tm-panel--large tm-test-graph-panel">
            <div class="tm-panel__header tm-state-graph__header">
              <h2>Test State Trend</h2>
              <span>Rolling 7-day signal</span>
            </div>

            <div class="tm-state-graph" aria-label="Test manager multi-line state graph">
              <div class="tm-state-graph__stats" aria-label="Current test manager metrics">
                <article v-for="stat in testStateGraphStats" :key="stat.label">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                  <small>{{ stat.detail }}</small>
                </article>
              </div>

              <div class="tm-state-graph__canvas">
                <svg
                  :viewBox="`0 0 ${testStateChart.width} ${testStateChart.height}`"
                  preserveAspectRatio="none"
                  role="img"
                  aria-labelledby="test-state-graph-title test-state-graph-desc"
                >
                  <title id="test-state-graph-title">Test Manager state trend</title>
                  <desc id="test-state-graph-desc">
                    Multi-line chart comparing active changes, awaiting pickup, in-progress tests,
                    and at-risk changes across the last seven days.
                  </desc>
                  <defs>
                    <filter
                      id="tm-state-line-glow"
                      filterUnits="userSpaceOnUse"
                      :x="-20"
                      :y="-20"
                      :width="testStateChart.width + 40"
                      :height="testStateChart.height + 40"
                    >
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <g class="tm-state-graph__grid" aria-hidden="true">
                    <line
                      v-for="line in testStateGraphGridLines"
                      :key="line.label"
                      :x1="testStateChart.left"
                      :x2="testStateChart.width - testStateChart.right"
                      :y1="line.y"
                      :y2="line.y"
                    />
                    <text
                      v-for="line in testStateGraphGridLines"
                      :key="`${line.label}-label`"
                      :x="testStateChart.left - 10"
                      :y="line.y + 4"
                    >
                      {{ line.label }}
                    </text>
                  </g>
                  <g class="tm-state-graph__axis" aria-hidden="true">
                    <line
                      :x1="testStateChart.left"
                      :x2="testStateChart.width - testStateChart.right"
                      :y1="testStateChart.height - testStateChart.bottom"
                      :y2="testStateChart.height - testStateChart.bottom"
                    />
                    <text
                      v-for="point in testStateGraphXLabels"
                      :key="point.label"
                      :x="point.x"
                      :y="testStateChart.height - 13"
                    >
                      {{ point.label }}
                    </text>
                  </g>
                  <g>
                    <path
                      v-for="series in testStateGraphSeries"
                      :key="`${series.key}-area`"
                      class="tm-state-graph__area"
                      :d="series.areaPath"
                      :fill="series.color"
                    />
                    <path
                      v-for="series in testStateGraphSeries"
                      :key="`${series.key}-rail`"
                      class="tm-state-graph__line-rail"
                      :d="series.path"
                    />
                    <path
                      v-for="series in testStateGraphSeries"
                      :key="series.key"
                      class="tm-state-graph__line"
                      :d="series.path"
                      :stroke="series.color"
                    />
                    <g v-for="series in testStateGraphSeries" :key="`${series.key}-points`">
                      <circle
                        v-for="point in series.points"
                        :key="point.key"
                        class="tm-state-graph__point"
                        :cx="point.x"
                        :cy="point.y"
                        :r="point.isLatest ? 5.5 : 3.8"
                        :fill="series.color"
                      >
                        <title>{{ `${series.label}: ${point.value} on ${point.label}` }}</title>
                      </circle>
                    </g>
                  </g>
                </svg>
              </div>

              <div class="tm-state-graph__legend">
                <article
                  v-for="series in testStateGraphSeries"
                  :key="series.key"
                  :style="{ '--tm-state-color': series.color }"
                >
                  <span aria-hidden="true"></span>
                  <div>
                    <strong>{{ series.label }}</strong>
                  </div>
                  <em>{{ series.latest }}</em>
                </article>
              </div>

              <div class="tm-state-graph__insights">
                <article v-for="insight in testStateGraphInsights" :key="insight.label">
                  <span>{{ insight.label }}</span>
                  <strong>{{ insight.value }}</strong>
                  <small>{{ insight.detail }}</small>
                </article>
              </div>
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
        <aside class="tm-panel tm-change-list" @scroll="hideChangeTooltip">
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
            role="button"
            tabindex="0"
            :aria-label="`Select change #${change.publicId}: ${change.title}`"
            @click="goToChange(change.id)"
            @keydown.enter.prevent="goToChange(change.id)"
            @keydown.space.prevent="goToChange(change.id)"
            @pointerenter="queueChangeTooltip(change, $event)"
            @pointerleave="hideChangeTooltip"
          >
            <div class="tm-change-card__main">
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
            </div>
            <div class="tm-change-status-counters" aria-hidden="true">
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
            </div>
            <div
              v-if="change.autoClosePassCount > 0"
              class="tm-change-card__auto-close"
              :class="`tm-change-card__auto-close--${autoCloseTone(change)}`"
              :style="{ '--auto-close-progress': `${autoCloseProgressPercent(change)}%` }"
              role="progressbar"
              :aria-label="autoCloseDetail(change)"
              :aria-valuenow="Math.min(change.summary.passCount, change.autoClosePassCount)"
              aria-valuemin="0"
              :aria-valuemax="change.autoClosePassCount"
            >
              <span>{{ autoCloseListLabel(change) }}</span>
              <strong>{{ change.summary.passCount }}/{{ change.autoClosePassCount }}</strong>
            </div>
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
              <div class="tm-detail__kicker">
                <p class="tm-id">Change #{{ activeChange.publicId }}</p>
                <StatusPill :status="activeChange.status" compact />
                <span
                  v-if="!isChangeReadyToTest(activeChange)"
                  class="tm-readiness-badge tm-readiness-badge--not-ready"
                  title="Tester input is paused until an admin marks this change ready."
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 8v5" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 4.4 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.4a2 2 0 0 0-3.4 0Z" />
                  </svg>
                  Not Ready To Test
                </span>
                <span
                  class="tm-auto-close-badge"
                  :class="`tm-auto-close-badge--${autoCloseTone(activeChange)}`"
                  :title="autoCloseDetail(activeChange)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 3v4" />
                    <path d="M12 17v4" />
                    <path d="M5.6 5.6 8.4 8.4" />
                    <path d="m15.6 15.6 2.8 2.8" />
                    <path d="M3 12h4" />
                    <path d="M17 12h4" />
                    <path d="m5.6 18.4 2.8-2.8" />
                    <path d="m15.6 8.4 2.8-2.8" />
                  </svg>
                  {{ autoCloseLabel(activeChange) }}
                </span>
              </div>
              <p>
                {{ activeChange.category }} / {{ activeChange.subsystem }} · Submitted by
                {{ activeChange.createdBy?.displayName ?? 'Unknown' }} · Updated
                {{ relativeTime(activeChange.updatedAt) }}
              </p>
              <div
                v-if="activeChange.githubPullRequest || activeChange.githubIssue"
                class="tm-github-link-group tm-github-link-group--header"
                :class="{
                  'tm-github-link-group--split':
                    activeChange.githubPullRequest && activeChange.githubIssue
                }"
                aria-label="Linked GitHub records"
              >
                <a
                  v-if="activeChange.githubPullRequest"
                  class="tm-github-pr-badge tm-github-link-part"
                  :class="`tm-github-pr-badge--${githubPrTone(activeChange.githubPullRequest)}`"
                  :href="githubPrHref(activeChange.githubPullRequest)"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Open ${githubPrLabel(activeChange.githubPullRequest)} pull request on GitHub`"
                  @click="openGithubLink($event, githubPrHref(activeChange.githubPullRequest))"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
                    />
                  </svg>
                  <span>PR {{ githubPrLabel(activeChange.githubPullRequest) }}</span>
                </a>
                <a
                  v-if="activeChange.githubIssue"
                  class="tm-github-pr-badge tm-github-link-part"
                  :class="`tm-github-pr-badge--${githubIssueTone(activeChange.githubIssue)}`"
                  :href="githubIssueHref(activeChange.githubIssue)"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Open ${githubIssueLabel(activeChange.githubIssue)} issue on GitHub`"
                  @click="openGithubLink($event, githubIssueHref(activeChange.githubIssue))"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
                    />
                  </svg>
                  <span>Issue {{ githubIssueLabel(activeChange.githubIssue) }}</span>
                </a>
              </div>
            </div>
            <div class="tm-detail__actions">
              <div class="tm-detail__status-stack">
                <button
                  v-if="authStore.isAdmin"
                  type="button"
                  class="tm-ready-test-toggle"
                  :class="{
                    'tm-ready-test-toggle--ready': isChangeReadyToTest(activeChange),
                    'tm-ready-test-toggle--not-ready': !isChangeReadyToTest(activeChange)
                  }"
                  :disabled="readyToTestTogglePending"
                  :aria-pressed="isChangeReadyToTest(activeChange)"
                  @click="toggleActiveChangeReadyToTest"
                >
                  <span class="tm-ready-test-toggle__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M9 12.5 11 14.5 15.5 9.5" />
                      <path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z" />
                    </svg>
                  </span>
                  <span class="tm-ready-test-toggle__copy">
                    <strong>Ready To Test</strong>
                    <small>{{ isChangeReadyToTest(activeChange) ? 'Enabled' : 'Paused' }}</small>
                  </span>
                  <span class="tm-ready-test-toggle__action">
                    {{ isChangeReadyToTest(activeChange) ? 'Pause' : 'Enable' }}
                  </span>
                </button>
                <button
                  v-if="authStore.isAdmin"
                  type="button"
                  class="tm-next-patch-toggle"
                  :class="{
                    'tm-next-patch-toggle--included': activeChange.includeInNextPatch,
                    'tm-next-patch-toggle--excluded': !activeChange.includeInNextPatch
                  }"
                  :disabled="nextPatchTogglePending"
                  :aria-pressed="activeChange.includeInNextPatch"
                  @click="toggleActiveChangeNextPatch"
                >
                  <span class="tm-next-patch-toggle__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10 6h10" />
                      <path d="M10 12h10" />
                      <path d="M10 18h10" />
                      <path d="m4 5 1.2 1.2L7.5 4" />
                      <path d="m4 11 1.2 1.2L7.5 10" />
                      <path d="m4 17 1.2 1.2L7.5 16" />
                    </svg>
                  </span>
                  <span class="tm-next-patch-toggle__copy">
                    <strong>Next Patch</strong>
                    <small>{{
                      activeChange.includeInNextPatch ? 'Included' : 'Not included'
                    }}</small>
                  </span>
                  <span class="tm-next-patch-toggle__action">
                    {{ activeChange.includeInNextPatch ? 'Remove' : 'Add' }}
                  </span>
                </button>
              </div>
              <div class="tm-detail__action-buttons">
                <button
                  v-if="authStore.isAdmin"
                  type="button"
                  class="tm-btn tm-detail-edit-btn"
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
            <div class="tm-rich" v-html="displayRichText(activeChange.description)"></div>
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
            <article
              v-if="activeChange.githubPullRequest || activeChange.githubIssue"
              class="tm-github-pr-panel tm-github-links-panel"
            >
              <div class="tm-github-pr-panel__brand">
                <span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
                    />
                  </svg>
                  GitHub Links
                </span>
                <strong>{{ githubIntegrationLabel(activeChange) }}</strong>
              </div>
              <div class="tm-github-links-panel__items">
                <section
                  v-if="activeChange.githubPullRequest"
                  class="tm-github-linked-record"
                  :class="`tm-github-linked-record--${githubPrTone(activeChange.githubPullRequest)}`"
                >
                  <div class="tm-github-linked-record__body">
                    <small>Pull Request</small>
                    <a
                      :href="githubPrHref(activeChange.githubPullRequest)"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click="openGithubLink($event, githubPrHref(activeChange.githubPullRequest))"
                    >
                      {{
                        activeChange.githubPullRequest.metadata.title ||
                        githubPrLabel(activeChange.githubPullRequest)
                      }}
                    </a>
                    <p>
                      {{ githubPrLabel(activeChange.githubPullRequest) }}
                      <template v-if="activeChange.githubPullRequest.metadata.authorLogin">
                        by @{{ activeChange.githubPullRequest.metadata.authorLogin }}
                      </template>
                    </p>
                    <div
                      v-if="githubPrMergedAt(activeChange.githubPullRequest)"
                      class="tm-github-pr-panel__merged"
                    >
                      <span class="tm-github-pr-panel__merged-icon" aria-hidden="true"></span>
                      <div>
                        <strong>Merged</strong>
                        <time
                          :datetime="githubPrMergedAt(activeChange.githubPullRequest) || undefined"
                        >
                          {{ githubPrMergedAtLabel(activeChange.githubPullRequest) }}
                        </time>
                      </div>
                      <small>{{ githubPrMergedAtRelative(activeChange.githubPullRequest) }}</small>
                    </div>
                  </div>
                  <div class="tm-github-linked-record__actions">
                    <strong class="tm-github-linked-record__state">
                      {{ githubPrStateLabel(activeChange.githubPullRequest) }}
                    </strong>
                  </div>
                  <div class="tm-github-pr-panel__metrics">
                    <span>
                      <strong>{{
                        githubPrMetric(activeChange.githubPullRequest.metadata.changedFiles)
                      }}</strong>
                      files
                    </span>
                    <span>
                      <strong>{{
                        githubPrSignedMetric(activeChange.githubPullRequest.metadata.additions, '+')
                      }}</strong>
                      added
                    </span>
                    <span>
                      <strong>{{
                        githubPrSignedMetric(activeChange.githubPullRequest.metadata.deletions, '-')
                      }}</strong>
                      removed
                    </span>
                  </div>
                  <div class="tm-github-linked-record__footer">
                    <p
                      v-if="!activeChange.githubPullRequest.metadata.available"
                      class="tm-github-pr-panel__message"
                    >
                      {{
                        activeChange.githubPullRequest.metadata.statusMessage ||
                        'GitHub metadata is unavailable.'
                      }}
                    </p>
                    <p v-else class="tm-github-pr-panel__message">
                      {{ githubPrBranchSummary(activeChange.githubPullRequest) }}
                      <template v-if="activeChange.githubPullRequest.metadata.updatedAt">
                        · GitHub updated
                        {{ relativeTime(activeChange.githubPullRequest.metadata.updatedAt) }}
                      </template>
                    </p>
                    <a
                      class="tm-github-linked-record__open"
                      :href="githubPrHref(activeChange.githubPullRequest)"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`Open ${githubPrLabel(activeChange.githubPullRequest)} pull request in GitHub`"
                      @click="openGithubLink($event, githubPrHref(activeChange.githubPullRequest))"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
                        />
                      </svg>
                      <span>Open in GitHub</span>
                    </a>
                  </div>
                </section>

                <section
                  v-if="activeChange.githubIssue"
                  class="tm-github-linked-record"
                  :class="`tm-github-linked-record--${githubIssueTone(activeChange.githubIssue)}`"
                >
                  <div class="tm-github-linked-record__body">
                    <small>Issue</small>
                    <a
                      :href="githubIssueHref(activeChange.githubIssue)"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click="openGithubLink($event, githubIssueHref(activeChange.githubIssue))"
                    >
                      {{
                        activeChange.githubIssue.metadata.title ||
                        githubIssueLabel(activeChange.githubIssue)
                      }}
                    </a>
                    <p>
                      {{ githubIssueLabel(activeChange.githubIssue) }}
                      <template v-if="activeChange.githubIssue.metadata.authorLogin">
                        by @{{ activeChange.githubIssue.metadata.authorLogin }}
                      </template>
                    </p>
                  </div>
                  <div class="tm-github-linked-record__actions">
                    <strong class="tm-github-linked-record__state">
                      {{ githubIssueStateLabel(activeChange.githubIssue) }}
                    </strong>
                  </div>
                  <div class="tm-github-pr-panel__metrics tm-github-pr-panel__metrics--issue">
                    <span>
                      <strong>{{
                        githubPrMetric(activeChange.githubIssue.metadata.comments)
                      }}</strong>
                      comments
                    </span>
                    <span>
                      <strong>{{ activeChange.githubIssue.metadata.labels.length }}</strong>
                      labels
                    </span>
                    <span>
                      <strong>{{
                        activeChange.githubIssue.metadata.closedAt ? 'yes' : 'no'
                      }}</strong>
                      closed
                    </span>
                  </div>
                  <div class="tm-github-linked-record__footer">
                    <p
                      v-if="!activeChange.githubIssue.metadata.available"
                      class="tm-github-pr-panel__message"
                    >
                      {{
                        activeChange.githubIssue.metadata.statusMessage ||
                        'GitHub metadata is unavailable.'
                      }}
                    </p>
                    <p v-else class="tm-github-pr-panel__message">
                      {{ githubIssueSummary(activeChange.githubIssue) }}
                      <template v-if="activeChange.githubIssue.metadata.updatedAt">
                        · GitHub updated
                        {{ relativeTime(activeChange.githubIssue.metadata.updatedAt) }}
                      </template>
                    </p>
                    <a
                      class="tm-github-linked-record__open"
                      :href="githubIssueHref(activeChange.githubIssue)"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`Open ${githubIssueLabel(activeChange.githubIssue)} issue in GitHub`"
                      @click="openGithubLink($event, githubIssueHref(activeChange.githubIssue))"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
                        />
                      </svg>
                      <span>Open in GitHub</span>
                    </a>
                  </div>
                </section>
              </div>
              <div
                v-if="githubLabelsForChange(activeChange).length"
                class="tm-github-pr-panel__labels"
              >
                <span
                  v-for="label in githubLabelsForChange(activeChange)"
                  :key="`${label.source}:${label.name}`"
                  :style="{ '--label-color': githubLabelColor(label.color) }"
                >
                  {{ label.name }}
                </span>
              </div>
            </article>
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
                <div
                  class="tm-testing-checklist__head"
                  :class="{ 'tm-testing-checklist__head--admin': authStore.isAdmin }"
                >
                  <span>Done</span>
                  <span>Test</span>
                  <span>Category</span>
                  <span>Notes</span>
                  <span>Status</span>
                  <span v-if="authStore.isAdmin" class="tm-testing-checklist__add">
                    <button
                      type="button"
                      class="tm-checklist-add-btn"
                      aria-label="Add checklist item"
                      title="Add checklist item"
                      @click="openChecklistAdd"
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  </span>
                </div>
                <div
                  v-for="(item, index) in activeChange.checklist"
                  :key="item.id"
                  class="tm-testing-checklist__row"
                  :class="{
                    'tm-testing-checklist__row--complete': isViewerChecklistItemComplete(item.id),
                    'tm-testing-checklist__row--admin': authStore.isAdmin
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
                  <span v-if="authStore.isAdmin" class="tm-testing-checklist__delete">
                    <button
                      type="button"
                      class="tm-checklist-delete-btn"
                      :aria-label="`Delete checklist item ${item.title}`"
                      :title="`Delete ${item.title}`"
                      :disabled="isDeletingChecklistItem(item.id)"
                      @click.stop="deleteChecklistItem(item)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-1 6h8l-.6 11H8.6L8 9Zm2 2v7h1v-7h-1Zm3 0v7h1v-7h-1Z"
                        />
                      </svg>
                    </button>
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

          <section v-else-if="detailTab === 'Reports'" class="tm-detail-section">
            <div class="tm-section-title">
              <div>
                <h3>Linked Crash/Error Reports</h3>
                <p>
                  Crash or script error reports that are automatically imported from the game server
                  can be linked by developers to specific changes so testers have additional context
                  while testing.
                </p>
              </div>
              <span>{{ activeChange.webhookReports?.length ?? 0 }}</span>
            </div>
            <div v-if="activeChange.webhookReports?.length" class="tm-report-list">
              <article
                v-for="report in activeChange.webhookReports"
                :key="report.id"
                class="tm-report-card"
                tabindex="0"
                @click="openWebhookReportSummary(report)"
                @keydown.enter.prevent="openWebhookReportSummary(report)"
                @keydown.space.prevent="openWebhookReportSummary(report)"
              >
                <div class="tm-report-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M8 7h8M8 11h8M8 15h5" />
                    <path
                      d="M6 3.75h12A1.25 1.25 0 0 1 19.25 5v14A1.25 1.25 0 0 1 18 20.25H6A1.25 1.25 0 0 1 4.75 19V5A1.25 1.25 0 0 1 6 3.75Z"
                    />
                  </svg>
                </div>
                <div class="tm-report-card__body">
                  <div class="tm-report-card__title">
                    <strong>{{ report.reportType }}</strong>
                    <StatusPill :status="report.status" compact />
                  </div>
                  <p>
                    {{ report.summary || 'No AI summary is available for this linked report yet.' }}
                  </p>
                  <small>
                    {{ report.webhookLabel }} · Received {{ relativeTime(report.receivedAt) }} ·
                    Linked {{ relativeTime(report.linkedAt) }}
                  </small>
                </div>
                <div class="tm-report-card__actions" @click.stop>
                  <button
                    type="button"
                    class="tm-table-action"
                    @click="openWebhookReportSummary(report)"
                  >
                    Summary
                  </button>
                  <button
                    v-if="canOpenWebhookInbox"
                    type="button"
                    class="tm-table-action"
                    @click="openWebhookInboxReport(report.messageId)"
                  >
                    Inbox
                  </button>
                  <button
                    v-if="authStore.isAdmin"
                    type="button"
                    class="tm-table-action tm-table-action--danger"
                    :disabled="unlinkingWebhookReportId === report.id"
                    @click="unlinkWebhookReport(report)"
                  >
                    {{ unlinkingWebhookReportId === report.id ? 'Unlinking...' : 'Unlink' }}
                  </button>
                </div>
              </article>
            </div>
            <div v-else class="tm-report-empty">
              <span aria-hidden="true">⌁</span>
              <strong>No linked reports yet.</strong>
              <p>Crash reports or script errors associated with this change.</p>
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
              class="tm-btn tm-result-btn tm-result-btn--pass"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('PASS')"
            >
              <span aria-hidden="true">✓</span>
              Pass
            </button>
            <button
              type="button"
              class="tm-btn tm-result-btn tm-result-btn--fail"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('FAIL')"
            >
              <span aria-hidden="true">×</span>
              Fail
            </button>
            <button
              type="button"
              class="tm-btn tm-result-btn tm-result-btn--blocked"
              :disabled="!canUseTesterControls"
              @click="openResultConfirm('BLOCKED')"
            >
              <span aria-hidden="true">!</span>
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
            {{
              activeChangeReadyToTest
                ? 'Result controls unlock when you are actively testing this change. Notes can still be added while the change is open.'
                : 'Tester input is paused until an admin marks this change ready to test.'
            }}
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
              <span class="tm-action__icon" aria-hidden="true">✓</span>
              <span
                ><strong>Closed as Complete</strong
                ><small>Mark completed and close it.</small></span
              >
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

      <section v-else-if="currentSection === 'next-patch'" class="tm-next-patch">
        <main class="tm-panel tm-next-patch-panel">
          <div class="tm-panel__header tm-next-patch__header">
            <div class="tm-next-patch__intro">
              <h2><span aria-hidden="true">✓</span> Next Patch</h2>
              <p>{{ nextPatchSummaryText }}</p>
            </div>
            <div
              class="tm-next-patch-progress"
              :class="{ 'tm-next-patch-progress--empty': nextPatchProgressTotal === 0 }"
              role="progressbar"
              :aria-label="nextPatchProgressAriaLabel"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="nextPatchProgressPercent"
            >
              <div class="tm-next-patch-progress__header">
                <span>Patch Readiness</span>
                <strong>{{ nextPatchProgressPercent }}%</strong>
              </div>
              <div class="tm-next-patch-progress__track" aria-hidden="true">
                <span :style="{ width: `${nextPatchProgressPercent}%` }"></span>
              </div>
              <div class="tm-next-patch-progress__footer">
                <span>{{ nextPatchProgressLabel }}</span>
              </div>
            </div>
            <div class="tm-next-patch__actions">
              <label v-if="!nextPatchViewIsComplete" class="tm-next-patch-needs-action">
                <input v-model="nextPatchNeedsActionOnly" type="checkbox" />
                <span>Needs Action</span>
              </label>
              <div class="tm-next-patch-view-toggle" aria-label="Next patch view">
                <button
                  v-for="option in nextPatchViewOptions"
                  :key="option.key"
                  type="button"
                  :class="{
                    'tm-next-patch-view-toggle__button--active': nextPatchView === option.key
                  }"
                  :aria-pressed="nextPatchView === option.key"
                  @click="setNextPatchView(option.key)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="tm-next-patch-stats" aria-label="Next patch summary">
            <article>
              <span>{{ nextPatchPrimaryStatLabel }}</span>
              <strong>{{ visibleNextPatchChanges.length }}</strong>
              <small>{{ nextPatchPrimaryStatDetail }}</small>
            </article>
            <article>
              <span>Passed</span>
              <strong>{{ nextPatchPassedCount }}</strong>
              <small>validated</small>
            </article>
            <article>
              <span>Testers</span>
              <strong>{{ nextPatchTesterCount }}</strong>
              <small>records</small>
            </article>
            <article>
              <span>Areas</span>
              <strong>{{ nextPatchAreaCount }}</strong>
              <small>subsystems</small>
            </article>
            <div v-if="canUsePatchNotesGenerator" class="tm-next-patch-reset-strip">
              <button
                type="button"
                class="tm-next-patch-notes-button"
                aria-label="Generate patch notes"
                title="Generate patch notes"
                :disabled="
                  nextPatchLoading || patchNotesGenerating || visibleNextPatchChanges.length === 0
                "
                @click="openPatchNotesGenerator"
              >
                <span class="tm-next-patch-notes-button__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 3 13.4 8.1 18.5 9.5 13.4 10.9 12 16 10.6 10.9 5.5 9.5 10.6 8.1 12 3Z" />
                    <path d="M18.5 14.5 19.2 17 21.7 17.7 19.2 18.4 18.5 20.9 17.8 18.4 15.3 17.7 17.8 17 18.5 14.5Z" />
                    <path d="M5.5 15.2 6.1 17.1 8 17.7 6.1 18.3 5.5 20.2 4.9 18.3 3 17.7 4.9 17.1 5.5 15.2Z" />
                  </svg>
                </span>
                {{ patchNotesGenerating ? 'Generating...' : 'Generate Patch Notes' }}
              </button>
              <div class="tm-next-patch-reset-strip__actions">
                <span>Patch deployed?</span>
                <button
                  type="button"
                  class="tm-next-patch-reset-button"
                  :disabled="nextPatchResetPending || visibleNextPatchChanges.length === 0"
                  @click="openNextPatchResetConfirm"
                >
                  <span aria-hidden="true">↻</span>
                  Reset completed queue
                </button>
              </div>
            </div>
          </div>

          <div v-if="nextPatchLoading" class="tm-next-patch-loading">Loading changes...</div>

          <div v-else-if="visibleNextPatchChanges.length" class="tm-next-patch-list">
            <article
              v-for="change in visibleNextPatchChanges"
              :key="change.id"
              class="tm-next-patch-card"
              :class="{
                'tm-next-patch-card--auto-close': change.autoClosePassCount > 0
              }"
            >
              <button
                type="button"
                class="tm-next-patch-card__main"
                :aria-label="`Open change #${change.publicId}: ${change.title}`"
                @click="goToChange(change.id)"
              >
                <span class="tm-priority" :class="`tm-priority--${change.priority.toLowerCase()}`">
                  {{ priorityLabel(change.priority) }}
                </span>
                <span>
                  <strong>#{{ change.publicId }} {{ change.title }}</strong>
                  <small>{{ change.category }} / {{ change.subsystem }}</small>
                </span>
              </button>
              <div class="tm-next-patch-card__meta">
                <StatusPill :status="change.status" compact />
                <span class="tm-next-patch-card__build">{{
                  change.targetBuild || 'No target build'
                }}</span>
                <span class="tm-next-patch-card__time">{{
                  change.closedAt
                    ? `Closed ${relativeTime(change.closedAt)}`
                    : `Updated ${relativeTime(change.updatedAt)}`
                }}</span>
              </div>
              <div
                v-if="change.autoClosePassCount > 0"
                class="tm-next-patch-card__auto-close"
                :class="`tm-next-patch-card__auto-close--${autoCloseTone(change)}`"
                :style="{ '--auto-close-progress': `${autoCloseProgressPercent(change)}%` }"
                role="progressbar"
                :aria-label="autoCloseDetail(change)"
                :aria-valuenow="Math.min(change.summary.passCount, change.autoClosePassCount)"
                aria-valuemin="0"
                :aria-valuemax="change.autoClosePassCount"
                :title="autoCloseDetail(change)"
              >
                <span>{{ autoCloseListLabel(change) }}</span>
                <strong>{{ change.summary.passCount }}/{{ change.autoClosePassCount }}</strong>
              </div>
              <div class="tm-next-patch-card__quality">
                <span>
                  <strong>{{ change.summary.passCount }}</strong>
                  passed
                </span>
                <span>
                  <strong>{{ change.summary.testerCount }}</strong>
                  testers
                </span>
                <span>
                  <strong>{{ checklistProgress(change) }}</strong>
                  checklist
                </span>
              </div>
              <button
                v-if="authStore.isAdmin"
                type="button"
                class="tm-table-action tm-table-action--danger tm-next-patch-card__remove"
                :disabled="nextPatchTogglePending"
                @click="setChangeNextPatch(change, false)"
              >
                Remove
              </button>
            </article>
          </div>
          <div v-else class="tm-next-patch-empty">
            <span aria-hidden="true">✓</span>
            <h3>
              {{
                nextPatchNeedsActionFilterActive
                  ? 'No incomplete changes need your action.'
                  : nextPatchViewIsComplete
                  ? 'No completed changes are queued for the next patch.'
                  : 'No incomplete changes are flagged for the next patch.'
              }}
            </h3>
            <p>
              {{
                nextPatchNeedsActionFilterActive
                  ? 'Assigned changes you have not started or are actively testing appear here.'
                  : nextPatchViewIsComplete
                  ? 'Closed changes appear here when they remain marked for patch inclusion.'
                  : 'Open changes appear here while they remain marked for patch inclusion.'
              }}
            </p>
          </div>
        </main>
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
                  <small :class="userRoleClass(user)">{{ userRoleLabel(user) }} profile</small>
                </span>
              </span>
              <span class="tm-user-role" :class="userRoleClass(user)">{{
                userRoleLabel(user)
              }}</span>
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
                <li>
                  <span class="tm-dot tm-dot--coverage-uncovered"></span>Uncovered
                  <strong>{{ coverageUncoveredPercent }}%</strong>
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
              :disabled="!authStore.canManageTestManagerSettings || settingsSaving || !settingsDirty"
              @click="saveSettings"
            >
              <span aria-hidden="true">▣</span>
              {{ settingsSaving ? 'Saving...' : 'Save Changes' }}
            </button>
            <button
              type="button"
              class="tm-btn"
              :disabled="!authStore.canManageTestManagerSettings || settingsSaving || !settingsDirty"
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
                  'tm-permission-toggle--disabled':
                    !authStore.canManageTestManagerSettings ||
                    settingsSaving ||
                    isRolePermissionLocked(role.key, permission.key),
                  'tm-permission-toggle--locked': isRolePermissionLocked(role.key, permission.key)
                }"
                :aria-label="`${role.label} ${permission.label}`"
              >
                <input
                  type="checkbox"
                  :checked="hasRolePermission(role.key, permission.key)"
                  :disabled="
                    !authStore.canManageTestManagerSettings ||
                    settingsSaving ||
                    isRolePermissionLocked(role.key, permission.key)
                  "
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
                'tm-switch--disabled': !authStore.canManageTestManagerSettings || settingsSaving
              }"
            >
              <input
                v-model="settings.discordNotifications.enabled"
                type="checkbox"
                :disabled="!authStore.canManageTestManagerSettings || settingsSaving"
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
              :disabled="!authStore.canManageTestManagerSettings || settingsSaving"
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
                'tm-discord-event--disabled':
                  !authStore.canManageTestManagerSettings || settingsSaving
              }"
            >
              <input
                type="checkbox"
                :checked="hasDiscordNotificationEvent(event.key)"
                :disabled="!authStore.canManageTestManagerSettings || settingsSaving"
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
      v-if="changeTooltip"
      id="tm-change-tooltip"
      class="tm-change-tooltip"
      role="tooltip"
      :style="{
        top: `${changeTooltip.top}px`,
        left: `${changeTooltip.left}px`
      }"
    >
      <header>
        <span
          class="tm-priority"
          :class="`tm-priority--${changeTooltip.change.priority.toLowerCase()}`"
        >
          {{ priorityLabel(changeTooltip.change.priority) }}
        </span>
        <div>
          <h3>#{{ changeTooltip.change.publicId }} {{ changeTooltip.change.title }}</h3>
          <p>{{ changeTooltip.change.category }} / {{ changeTooltip.change.subsystem }}</p>
        </div>
      </header>
      <p class="tm-change-tooltip__description">
        {{ plainText(changeTooltip.change.description) || 'No description provided.' }}
      </p>
      <dl class="tm-change-tooltip__meta">
        <div>
          <dt>Status</dt>
          <dd>{{ statusLabel(changeTooltip.change.status) }}</dd>
        </div>
        <div>
          <dt>Author</dt>
          <dd>{{ changeTooltip.change.createdBy?.displayName ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{{ relativeTime(changeTooltip.change.updatedAt) }}</dd>
        </div>
        <div>
          <dt>Testers</dt>
          <dd>{{ changeTooltip.change.summary.testerCount }}</dd>
        </div>
      </dl>
    </div>

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
                <div class="tm-github-fields tm-field--full">
                  <label class="tm-field">
                    <span>GitHub pull request <small>optional</small></span>
                    <input
                      v-model="createForm.githubPrUrl"
                      class="tm-input"
                      type="url"
                      inputmode="url"
                      placeholder="https://github.com/owner/repo/pull/123"
                    />
                  </label>
                  <label class="tm-field">
                    <span>GitHub issue <small>optional</small></span>
                    <input
                      v-model="createForm.githubIssueUrl"
                      class="tm-input"
                      type="url"
                      inputmode="url"
                      placeholder="https://github.com/owner/repo/issues/123"
                    />
                  </label>
                </div>
                <label class="tm-patch-toggle tm-field--full">
                  <input v-model="createForm.includeInNextPatch" type="checkbox" />
                  <span aria-hidden="true"></span>
                  <strong>Include in next patch</strong>
                  <small>Completed changes stay queued for the next deployment by default.</small>
                </label>
                <div class="tm-auto-close-control tm-field--full">
                  <div class="tm-auto-close-control__header">
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>Auto-close on passes</strong>
                      <small>{{ createAutoCloseDetail }}</small>
                    </div>
                  </div>
                  <label class="tm-auto-close-control__input">
                    <span>Pass target</span>
                    <input
                      v-model.number="createForm.autoClosePassCount"
                      type="number"
                      min="0"
                      max="99"
                      step="1"
                      inputmode="numeric"
                    />
                  </label>
                  <p>
                    Set to 0 to keep auto-close disabled. Any fail or blocked review prevents
                    automatic closing.
                  </p>
                </div>
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
              <div class="tm-field tm-field--full">
                <span>Description</span>
                <RichTextEditor
                  v-model="createForm.description"
                  class="tm-create-description"
                  placeholder="Summarize what changed, where testers should look, and any known risks."
                />
              </div>
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
              <div class="tm-github-fields tm-field--full">
                <label class="tm-field">
                  <span>GitHub pull request <small>optional</small></span>
                  <input
                    v-model="editForm.githubPrUrl"
                    class="tm-input"
                    type="url"
                    inputmode="url"
                    placeholder="https://github.com/owner/repo/pull/123"
                  />
                </label>
                <label class="tm-field">
                  <span>GitHub issue <small>optional</small></span>
                  <input
                    v-model="editForm.githubIssueUrl"
                    class="tm-input"
                    type="url"
                    inputmode="url"
                    placeholder="https://github.com/owner/repo/issues/123"
                  />
                </label>
              </div>
              <label class="tm-patch-toggle tm-field--full">
                <input v-model="editForm.includeInNextPatch" type="checkbox" />
                <span aria-hidden="true"></span>
                <strong>Include in next patch</strong>
                <small>When completed, this change appears on the Next Patch tab.</small>
              </label>
              <div
                class="tm-auto-close-control tm-field--full"
                :class="{
                  'tm-auto-close-control--blocked':
                    activeChange && autoCloseBlocked(activeChange) && editAutoCloseTarget > 0,
                  'tm-auto-close-control--ready':
                    activeChange &&
                    editAutoCloseTarget > 0 &&
                    !autoCloseBlocked(activeChange) &&
                    activeChange.summary.passCount >= editAutoCloseTarget
                }"
              >
                <div class="tm-auto-close-control__header">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>Auto-close on passes</strong>
                    <small>{{ editAutoCloseDetail }}</small>
                  </div>
                </div>
                <label class="tm-auto-close-control__input">
                  <span>Pass target</span>
                  <input
                    v-model.number="editForm.autoClosePassCount"
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    inputmode="numeric"
                  />
                </label>
                <div
                  v-if="activeChange && editAutoCloseTarget > 0"
                  class="tm-auto-close-control__meter"
                  role="meter"
                  aria-label="Auto-close pass progress"
                  aria-valuemin="0"
                  :aria-valuemax="editAutoCloseTarget"
                  :aria-valuenow="activeChange.summary.passCount"
                >
                  <span :style="{ width: editAutoCloseProgress }"></span>
                </div>
              </div>
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
            <div class="tm-field tm-field--full">
              <span>Description</span>
              <RichTextEditor
                v-model="editForm.description"
                class="tm-create-description"
                placeholder="Summarize what changed, where testers should look, and any known risks."
              />
            </div>
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
      v-if="nextPatchResetConfirm"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="next-patch-reset-confirm-title"
    >
      <section class="tm-modal__panel tm-confirm-modal tm-confirm-modal--danger">
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">↻</span>
          <div>
            <p>Next Patch</p>
            <h2 id="next-patch-reset-confirm-title">Reset the completed patch queue?</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">
          This will remove {{ nextPatchChanges.length }} completed change{{
            nextPatchChanges.length === 1 ? '' : 's'
          }}
          from the Complete view of Next Patch.
        </p>
        <div class="tm-confirm-modal__details">
          <span>What this does</span>
          <p>
            Use this after a patch has been deployed. The selected completed changes will no longer
            appear in the next patch queue.
          </p>
          <p>
            Change records, tester notes, checklist history, and closed status are preserved. This
            only clears their Next Patch flag.
          </p>
        </div>
        <div class="tm-confirm-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="nextPatchResetPending"
            @click="closeNextPatchResetConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="tm-btn tm-btn--danger"
            :disabled="nextPatchResetPending"
            @click="confirmNextPatchReset"
          >
            {{ nextPatchResetPending ? 'Resetting...' : 'Reset Patch Queue' }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="patchNotesGeneratorOpen && canUsePatchNotesGenerator"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-notes-generator-title"
    >
      <section class="tm-modal__panel tm-patch-notes-modal">
        <header class="tm-patch-notes-modal__header">
          <div class="tm-patch-notes-modal__title">
            <span class="tm-patch-notes-modal__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3 13.4 8.1 18.5 9.5 13.4 10.9 12 16 10.6 10.9 5.5 9.5 10.6 8.1 12 3Z" />
                <path d="M18.5 14.5 19.2 17 21.7 17.7 19.2 18.4 18.5 20.9 17.8 18.4 15.3 17.7 17.8 17 18.5 14.5Z" />
              </svg>
            </span>
            <div>
              <p class="tm-modal-eyebrow">Next Patch</p>
              <h2 id="patch-notes-generator-title">Patch Notes Generator</h2>
              <small>
                Review, edit, and copy Gemini-generated notes for completed changes queued for
                deployment.
              </small>
            </div>
          </div>
          <button
            type="button"
            class="tm-icon-button tm-icon-button--plain"
            aria-label="Close patch notes generator"
            @click="closePatchNotesGenerator"
          >
            ×
          </button>
        </header>

        <div class="tm-patch-notes-toolbar">
          <label class="tm-field tm-patch-notes-start">
            <span>Starting Patch Note #</span>
            <input
              v-model.number="patchNotesStartNumber"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              @change="normalizePatchNotesStartNumber"
            />
          </label>
          <div class="tm-patch-notes-toolbar__summary">
            <template v-if="patchNotesGenerating">
              <strong>AI</strong>
              <span>generating notes with {{ patchNotesModel || 'Gemini' }}</span>
            </template>
            <template v-else>
              <strong>{{ patchNoteDrafts.length ? includedPatchNotesCount : visibleNextPatchChanges.length }}</strong>
              <span v-if="patchNoteDrafts.length">
                selected of {{ patchNoteDrafts.length }} generated note{{
                  patchNoteDrafts.length === 1 ? '' : 's'
                }}
              </span>
              <span v-else>completed changes ready to send to Gemini</span>
            </template>
          </div>
          <div class="tm-patch-notes-toolbar__actions">
            <button
              type="button"
              class="tm-btn tm-btn--ghost"
              :disabled="patchNotesGenerating || patchNoteDrafts.length === 0"
              @click="selectAllPatchNotes"
            >
              Select All
            </button>
            <button
              type="button"
              class="tm-btn tm-btn--ghost"
              :disabled="patchNotesGenerating || patchNoteDrafts.length === 0"
              @click="deselectAllPatchNotes"
            >
              Deselect All
            </button>
          </div>
        </div>

        <div v-if="patchNotesGenerating" class="tm-patch-notes-loading">
          <span aria-hidden="true"></span>
          <div>
            <strong>Generating patch notes...</strong>
            <p>Gemini is drafting one editable note for each completed next-patch change.</p>
          </div>
        </div>
        <div v-else-if="patchNotesError" class="tm-patch-notes-empty tm-patch-notes-empty--error">
          <strong>Patch notes could not be generated.</strong>
          <p>{{ patchNotesError }}</p>
          <button type="button" class="tm-btn tm-btn--primary" @click="generatePatchNotes">
            Try Again
          </button>
        </div>
        <div v-else-if="patchNoteDrafts.length" class="tm-patch-notes-list">
          <article
            v-for="draft in patchNoteDrafts"
            :key="draft.changeId"
            class="tm-patch-note-row"
            :class="{ 'tm-patch-note-row--excluded': !draft.included }"
          >
            <label class="tm-patch-note-row__toggle">
              <input v-model="draft.included" type="checkbox" />
              <span aria-hidden="true"></span>
              <strong>{{ draft.included ? 'Included' : 'Excluded' }}</strong>
            </label>
            <div class="tm-patch-note-row__body">
              <div class="tm-patch-note-row__meta">
                <span class="tm-patch-note-row__number">{{ patchNoteDisplayNumber(draft) }}</span>
                <div>
                  <strong>#{{ draft.publicId }} {{ draft.title }}</strong>
                  <small>{{ draft.category }} / {{ draft.subsystem }}</small>
                </div>
              </div>
              <textarea
                v-model="draft.note"
                rows="3"
                :disabled="patchNotesGenerating"
                :aria-label="`Patch note for change #${draft.publicId}`"
              ></textarea>
            </div>
          </article>
        </div>
        <div v-else class="tm-patch-notes-empty">
          <strong>Ready to generate patch notes.</strong>
          <p>
            Nothing has been sent to Gemini yet. Generate drafts when you are ready to review and
            edit notes for the {{ visibleNextPatchChanges.length }} completed next-patch change{{
              visibleNextPatchChanges.length === 1 ? '' : 's'
            }}.
          </p>
          <button type="button" class="tm-btn tm-btn--primary" @click="generatePatchNotes">
            Generate with Gemini
          </button>
        </div>

        <footer class="tm-patch-notes-footer">
          <p v-if="patchNoteDrafts.length">
            Copy will include {{ includedPatchNotesCount }} selected note{{
              includedPatchNotesCount === 1 ? '' : 's'
            }}
            starting at #{{ normalizedPatchNotesStartNumber }}.
          </p>
          <p v-else>Generation starts only after you click the in-modal Gemini button.</p>
          <div class="tm-patch-notes-footer__actions">
            <button
              type="button"
              class="tm-btn tm-btn--ghost"
              :disabled="patchNotesGenerating"
              @click="closePatchNotesGenerator"
            >
              Close
            </button>
            <button
              type="button"
              class="tm-btn tm-btn--primary tm-patch-notes-copy"
              :disabled="patchNotesGenerating || includedPatchNotesCount === 0"
              @click="copyPatchNotesToClipboard"
            >
              Copy to clipboard
            </button>
          </div>
        </footer>
      </section>
    </div>

    <div
      v-if="showClosedNextPatchPrompt"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="closed-next-patch-confirm-title"
    >
      <section class="tm-modal__panel tm-confirm-modal tm-confirm-modal--next-patch">
        <div class="tm-confirm-modal__header">
          <span class="tm-confirm-modal__icon" aria-hidden="true">✓</span>
          <div>
            <p>Next Patch</p>
            <h2 id="closed-next-patch-confirm-title">Include this closed change?</h2>
          </div>
        </div>
        <p class="tm-confirm-modal__body">
          This change is closed, but it is not currently queued for the next patch. Would you like
          to include it now?
        </p>
        <div class="tm-confirm-modal__change">
          <span>Selected change</span>
          <strong>{{ developerActionChangeLabel }}</strong>
        </div>
        <div class="tm-confirm-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="nextPatchTogglePending"
            @click="dismissClosedNextPatchPrompt"
          >
            No
          </button>
          <button
            type="button"
            class="tm-btn tm-btn--success"
            :disabled="nextPatchTogglePending"
            @click="confirmClosedNextPatchPrompt"
          >
            {{ nextPatchTogglePending ? 'Adding...' : 'Yes' }}
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

        <template v-if="canAddTestingNote">
          <RichTextEditor ref="notesEditor" />
        </template>
        <div v-if="canAddTestingNote" class="tm-quick-notes" aria-label="Quick notes">
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
        <p v-if="feedbackError" class="tm-feedback-error">{{ feedbackError }}</p>

        <section
          v-if="activeChange.notes.length"
          class="tm-recorded-notes"
          aria-label="Recorded notes"
        >
          <h3>Recorded Notes</h3>
          <article
            v-for="note in activeChange.notes.slice(0, 5)"
            :key="note.id"
            :class="{ 'tm-recorded-notes__note--own': isOwnNote(note) }"
          >
            <div class="tm-recorded-notes__meta">
              <div class="tm-recorded-notes__byline">
                <strong>{{ note.author?.displayName ?? 'Unknown' }}</strong>
                <span class="tm-recorded-notes__time">· {{ relativeTime(note.createdAt) }}</span>
                <StatusPill v-if="note.result" :status="note.result" compact />
              </div>
              <button
                v-if="isOwnNote(note)"
                type="button"
                class="tm-recorded-notes__delete"
                :disabled="isDeletingNote(note.id)"
                @click="deleteNote(note)"
              >
                {{ isDeletingNote(note.id) ? 'Deleting' : 'Delete' }}
              </button>
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
            v-if="canAddTestingNote"
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
      v-if="checklistAddOpen"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checklist-add-title"
    >
      <form class="tm-modal__panel tm-checklist-add-modal" @submit.prevent="saveChecklistAdd">
        <div class="tm-panel__header">
          <div>
            <p class="tm-modal-eyebrow">Admin Checklist</p>
            <h2 id="checklist-add-title">Add Checklist Item</h2>
            <p v-if="activeChange">#{{ activeChange.publicId }} {{ activeChange.title }}</p>
          </div>
          <button
            type="button"
            class="tm-icon-btn"
            :disabled="checklistAddSaving"
            @click="closeChecklistAdd"
          >
            ×
          </button>
        </div>
        <div class="tm-checklist-add-templates" aria-label="Checklist item templates">
          <button
            v-for="template in checklistAddTemplates"
            :key="template.key"
            type="button"
            @click="applyChecklistAddTemplate(template)"
          >
            <strong>{{ template.title }}</strong>
            <span>{{ template.group }}</span>
          </button>
        </div>
        <label>
          <span>Test</span>
          <input
            v-model="checklistAddForm.title"
            class="tm-input"
            type="text"
            maxlength="191"
            placeholder="Confirm the new behavior in game"
            required
          />
        </label>
        <label>
          <span>Details</span>
          <textarea
            v-model="checklistAddForm.details"
            class="tm-textarea"
            rows="4"
            maxlength="1000"
            placeholder="Optional context for testers"
          ></textarea>
        </label>
        <label>
          <span>Category</span>
          <input
            v-model="checklistAddForm.category"
            class="tm-input"
            type="text"
            maxlength="80"
            placeholder="Uses the change category if left blank"
          />
        </label>
        <div class="tm-checklist-add-modal__actions">
          <button
            type="button"
            class="tm-btn tm-btn--ghost"
            :disabled="checklistAddSaving"
            @click="closeChecklistAdd"
          >
            Cancel
          </button>
          <button type="submit" class="tm-btn tm-btn--primary" :disabled="checklistAddSaving">
            <span aria-hidden="true">+</span>
            {{ checklistAddSaving ? 'Adding' : 'Add Item' }}
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

    <div
      v-if="selectedWebhookReport"
      class="tm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-report-title"
      @click.self="closeWebhookReportSummary"
    >
      <section class="tm-modal__panel tm-webhook-report-modal">
        <div class="tm-panel__header">
          <div>
            <p class="tm-modal-eyebrow">Linked Webhook Report</p>
            <h2 id="webhook-report-title">{{ selectedWebhookReport.reportType }}</h2>
            <p>
              {{ selectedWebhookReport.webhookLabel }} ·
              {{ formatDateTime(selectedWebhookReport.receivedAt) }}
            </p>
          </div>
          <button
            type="button"
            class="tm-icon-btn"
            aria-label="Close"
            @click="closeWebhookReportSummary"
          >
            ×
          </button>
        </div>
        <div class="tm-webhook-report-modal__body">
          <div class="tm-webhook-report-modal__status">
            <StatusPill :status="selectedWebhookReport.status" compact />
            <span v-if="selectedWebhookReport.aiReviewStatus">
              AI review: {{ selectedWebhookReport.aiReviewStatus }}
            </span>
            <span v-else>No AI review recorded</span>
          </div>
          <div
            class="tm-webhook-report-tabs"
            role="tablist"
            aria-label="Linked webhook report views"
          >
            <button
              type="button"
              class="tm-webhook-report-tab"
              :class="{ 'tm-webhook-report-tab--active': webhookReportModalTab === 'raw' }"
              role="tab"
              :aria-selected="webhookReportModalTab === 'raw'"
              @click="webhookReportModalTab = 'raw'"
            >
              Raw Report
            </button>
            <button
              type="button"
              class="tm-webhook-report-tab"
              :class="{ 'tm-webhook-report-tab--active': webhookReportModalTab === 'ai' }"
              role="tab"
              :aria-selected="webhookReportModalTab === 'ai'"
              @click="webhookReportModalTab = 'ai'"
            >
              AI Summary
            </button>
          </div>
          <div v-if="webhookReportModalTab === 'raw'" class="tm-webhook-report-pane">
            <pre v-if="selectedWebhookReport.rawReport" class="tm-webhook-report-raw">{{
              selectedWebhookReport.rawReport
            }}</pre>
            <p v-else class="tm-webhook-report-empty">
              No raw report text is available for this linked webhook report.
            </p>
          </div>
          <div v-else class="tm-webhook-report-pane tm-webhook-report-ai">
            <template v-if="selectedWebhookReport.aiReview">
              <section v-if="selectedWebhookReport.aiReview.summary">
                <span class="tm-webhook-report-pane__label">Summary</span>
                <p>{{ selectedWebhookReport.aiReview.summary }}</p>
              </section>
              <section v-if="selectedWebhookReport.aiReview.signature">
                <span class="tm-webhook-report-pane__label">Signature</span>
                <dl class="tm-webhook-report-signature">
                  <div v-if="selectedWebhookReport.aiReview.signature.exception">
                    <dt>Exception</dt>
                    <dd>{{ selectedWebhookReport.aiReview.signature.exception }}</dd>
                  </div>
                  <div v-if="selectedWebhookReport.aiReview.signature.topFrame">
                    <dt>Top frame</dt>
                    <dd>{{ selectedWebhookReport.aiReview.signature.topFrame }}</dd>
                  </div>
                </dl>
              </section>
              <section v-if="selectedWebhookReport.aiReview.hypotheses.length">
                <span class="tm-webhook-report-pane__label">Likely Causes</span>
                <article
                  v-for="hypothesis in selectedWebhookReport.aiReview.hypotheses"
                  :key="hypothesis.title"
                  class="tm-webhook-report-hypothesis"
                >
                  <header>
                    <strong>{{ hypothesis.title }}</strong>
                    <span v-if="hypothesis.confidence !== null">
                      {{ formatAiConfidence(hypothesis.confidence) }}
                    </span>
                  </header>
                  <ul v-if="hypothesis.evidence.length">
                    <li v-for="item in hypothesis.evidence" :key="item">{{ item }}</li>
                  </ul>
                  <ol v-if="hypothesis.nextSteps.length">
                    <li v-for="item in hypothesis.nextSteps" :key="item">{{ item }}</li>
                  </ol>
                </article>
              </section>
              <section v-if="selectedWebhookReport.aiReview.recommendedNextSteps.length">
                <span class="tm-webhook-report-pane__label">Recommended Next Steps</span>
                <ul>
                  <li
                    v-for="step in selectedWebhookReport.aiReview.recommendedNextSteps"
                    :key="step"
                  >
                    {{ step }}
                  </li>
                </ul>
              </section>
              <section v-if="selectedWebhookReport.aiReview.missingInfo.length">
                <span class="tm-webhook-report-pane__label">Missing Info</span>
                <ul>
                  <li v-for="item in selectedWebhookReport.aiReview.missingInfo" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </section>
              <section v-if="selectedWebhookReport.aiReview.rawModelNotes">
                <span class="tm-webhook-report-pane__label">Model Notes</span>
                <pre class="tm-webhook-report-raw tm-webhook-report-raw--compact">{{
                  selectedWebhookReport.aiReview.rawModelNotes
                }}</pre>
              </section>
            </template>
            <p v-else class="tm-webhook-report-empty">
              No AI summary is available for this report yet. Open the inbox record for the full
              payload and processing history.
            </p>
          </div>
        </div>
        <footer class="tm-modal__footer">
          <button type="button" class="tm-btn" @click="closeWebhookReportSummary">Close</button>
          <button
            v-if="canOpenWebhookInbox"
            type="button"
            class="tm-btn tm-btn--primary"
            @click="openWebhookInboxReport(selectedWebhookReport.messageId)"
          >
            Open Inbox Record
          </button>
        </footer>
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
  type GeneratedPatchNote,
  type NextPatchChangeView,
  type TestAssignmentKind,
  type TestChange,
  type TestChangeIssue,
  type TestChangeListStatusFilter,
  type TestChangeNote,
  type TestChangePriority,
  type TestChangePullRequest,
  type TestChangeStatus,
  type TestChangeWebhookReport,
  type TestManagerDiscordEventKey,
  type TestManagerDashboard,
  type TestManagerNextPatchCounts,
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
const CHANGE_LAYOUT_MIN = { left: 352, detail: 480, right: 280 };
const CHANGE_LAYOUT_MAX = { left: 640, right: 560 };
const CHANGE_LAYOUT_SPLITTER_WIDTH = 16;
const CHANGE_TOOLTIP_DELAY_MS = 500;
const CHANGE_TOOLTIP_WIDTH = 352;
type ChangeLayoutPane = 'left' | 'right';
interface ChangeLayoutWidths {
  left: number;
  right: number;
}
interface ChangeTooltipState {
  change: TestChange;
  top: number;
  left: number;
}
interface PatchNoteDraft {
  changeId: string;
  publicId: number;
  title: string;
  category: string;
  subsystem: string;
  note: string;
  included: boolean;
}

const loading = ref(false);
const loadedSection = ref<string | null>(null);
const dashboard = ref<TestManagerDashboard | null>(null);
const changes = ref<TestChange[]>([]);
const nextPatchChanges = ref<TestChange[]>([]);
const nextPatchView = ref<NextPatchChangeView>('complete');
const nextPatchCount = ref(0);
const nextPatchCounts = ref<TestManagerNextPatchCounts>({
  count: 0,
  completeCount: 0,
  incompleteCount: 0,
  totalCount: 0
});
const nextPatchLoading = ref(false);
const nextPatchNeedsActionOnly = ref(false);
const nextPatchViewCache = ref<Partial<Record<NextPatchChangeView, TestChange[]>>>({});
let nextPatchLoadSequence = 0;
const patchNotesGeneratorOpen = ref(false);
const patchNotesGenerating = ref(false);
const patchNotesModel = ref('');
const patchNotesError = ref('');
const patchNotesStartNumber = ref(1);
const patchNoteDrafts = ref<PatchNoteDraft[]>([]);
const readyToTestTogglePending = ref(false);
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
const changeTooltip = ref<ChangeTooltipState | null>(null);
const unlinkingWebhookReportId = ref<string | null>(null);
const detailTab = ref<'Overview' | 'Testers' | 'Coverage' | 'Reports' | 'History'>('Overview');
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
type WebhookReportModalTab = 'raw' | 'ai';
const userRoleFilter = ref<UserRoleFilter>('all');
const userPage = ref(1);
const usersPerPage = 6;
const createOpen = ref(false);
const editOpen = ref(false);
const editSaving = ref(false);
const requestOpen = ref(false);
const notesOpen = ref(false);
const checklistNoteOpen = ref(false);
const checklistNoteItemId = ref<string | null>(null);
const checklistNotePromptItemId = ref<string | null>(null);
const checklistAddOpen = ref(false);
const checklistAddSaving = ref(false);
const coverageNote = ref<CoverageNoteView | null>(null);
const selectedWebhookReport = ref<TestChangeWebhookReport | null>(null);
const webhookReportModalTab = ref<WebhookReportModalTab>('raw');
const resultActionConfirm = ref<ResultActionConfirm | null>(null);
const resultActionPending = ref(false);
const developerActionConfirm = ref<DeveloperActionConfirm | null>(null);
const developerActionPending = ref(false);
const testerRemoveConfirm = ref<TesterRemoveConfirm | null>(null);
const testerRemovePending = ref(false);
const nextPatchResetConfirm = ref(false);
const nextPatchResetPending = ref(false);
const nextPatchTogglePending = ref(false);
const closedNextPatchPromptDismissedIds = ref<Set<string>>(new Set());
const feedbackError = ref('');
const deletingNoteIds = ref<Set<string>>(new Set());
const deletingChecklistItemIds = ref<Set<string>>(new Set());
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
const detailTabs = ['Overview', 'Testers', 'Coverage', 'Reports', 'History'] as const;
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
    key: 'next-patch',
    label: 'Next Patch',
    to: '/test-manager/next-patch',
    iconPaths: [
      'M10 6h10',
      'M10 12h10',
      'M10 18h10',
      'm4 5 1.2 1.2L7.5 4',
      'm4 11 1.2 1.2L7.5 10',
      'm4 17 1.2 1.2L7.5 16'
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
  { key: 'noteForPass', label: 'Note for Pass', icon: '✦' },
  { key: 'dispose', label: 'Dispose', icon: '✓' },
  { key: 'manageTesters', label: 'Manage Testers', icon: '♟' },
  { key: 'reports', label: 'Reports', icon: '▥' },
  { key: 'settings', label: 'Settings', icon: '⚙' }
] as const;
type TestManagerPermissionKey = (typeof permissionColumns)[number]['key'];
const ADMIN_TEST_MANAGER_PERMISSIONS = permissionColumns
  .filter((permission) => permission.key !== 'noteForPass')
  .map((permission) => permission.key);
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

const nextPatchViewOptions: Array<{ key: NextPatchChangeView; label: string }> = [
  { key: 'complete', label: 'Complete' },
  { key: 'incomplete', label: 'Incomplete' }
];
type CreateChecklistDraft = CreateTestChangePayload['checklist'][number];
type ChecklistAddTemplate = CreateChecklistDraft & {
  group: string;
  key: string;
};

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

const checklistAddTemplates: ChecklistAddTemplate[] = createChecklistTemplates.flatMap((template) =>
  template.items.map((item) => ({
    ...item,
    group: template.label,
    key: `${template.label}:${item.title}`
  }))
);

function createChecklistItem(category = ''): CreateChecklistDraft {
  return { title: '', details: '', category };
}

function cloneSettings(value: TestManagerSettings): TestManagerSettings {
  return {
    roles: value.roles.map((role) => ({
      ...role,
      permissions:
        role.key === 'ADMIN'
          ? orderedPermissions([
              ...ADMIN_TEST_MANAGER_PERMISSIONS,
              ...(role.permissions.includes('noteForPass') ? ['noteForPass'] : [])
            ])
          : [...role.permissions]
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
  githubPrUrl: '',
  githubIssueUrl: '',
  includeInNextPatch: true,
  autoClosePassCount: 0,
  checklist: [createChecklistItem()]
});
const checklistAddForm = ref<CreateChecklistDraft>(createChecklistItem());

const editForm = ref<UpdateTestChangePayload>({
  title: '',
  description: '',
  category: '',
  subsystem: '',
  priority: 'MEDIUM',
  targetBuild: '',
  githubPrUrl: '',
  githubIssueUrl: '',
  includeInNextPatch: true,
  autoClosePassCount: 0,
  dueAt: null,
  assignedToId: null
});

const requestForm = ref<{ userId: string; assignment: Exclude<TestAssignmentKind, 'VOLUNTEER'> }>({
  userId: '',
  assignment: 'ADMIN_REQUESTED'
});
let changeTooltipTimer: ReturnType<typeof window.setTimeout> | null = null;

function requestedSectionParam() {
  const section = Array.isArray(route.params.section)
    ? route.params.section[0]
    : route.params.section;
  return typeof section === 'string' ? section : '';
}

const currentSection = computed(() => {
  const section = requestedSectionParam();
  if (!section || !['dashboard', 'changes', 'next-patch', 'users', 'settings'].includes(section)) {
    return 'dashboard';
  }
  return section === 'settings' && !authStore.canManageTestManagerSettings ? 'dashboard' : section;
});
const visibleSubnavItems = computed(() =>
  subnavItems.filter((item) => item.key !== 'settings' || authStore.canManageTestManagerSettings)
);
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
const activeChangeReadyToTest = computed(() =>
  activeChange.value ? isChangeReadyToTest(activeChange.value) : true
);
const isActivelyTestingViewer = computed(
  () =>
    activeChange.value?.status !== 'CLOSED' &&
    activeChangeReadyToTest.value &&
    activeViewerTester.value?.status === 'TESTING' &&
    !activeViewerTester.value.result
);
const canUseTesterControls = computed(() => isActivelyTestingViewer.value);
const canAddTestingNote = computed(() =>
  Boolean(
    activeChange.value && activeChangeReadyToTest.value && activeChange.value.status !== 'CLOSED'
  )
);
const canOpenWebhookInbox = computed(() => authStore.user?.isAdmin === true);
const showClosedNextPatchPrompt = computed(() => {
  const change = activeChange.value;
  return Boolean(
    authStore.isAdmin &&
    currentSection.value === 'changes' &&
    change &&
    change.status === 'CLOSED' &&
    !change.includeInNextPatch &&
    !closedNextPatchPromptDismissedIds.value.has(change.id)
  );
});
const changeLayoutStyle = computed<Record<string, string>>(() => ({
  '--tm-change-left-min-width': `${CHANGE_LAYOUT_MIN.left}px`,
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
  () => plainText(createForm.value.description).length >= 12 && Boolean(createForm.value.priority)
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
const createAutoCloseDetail = computed(() => {
  const target = normalizeAutoClosePassCount(createForm.value.autoClosePassCount);
  if (target === 0) {
    return 'Disabled. Admins can still close manually.';
  }
  return `Closes after ${target} clean passing review${target === 1 ? '' : 's'}.`;
});
const editAutoCloseTarget = computed(() =>
  normalizeAutoClosePassCount(editForm.value.autoClosePassCount)
);
const editAutoCloseDetail = computed(() => {
  const target = editAutoCloseTarget.value;
  const change = activeChange.value;
  if (target === 0) {
    return 'Disabled. Manual close controls are unchanged.';
  }
  if (!change) {
    return `Closes after ${target} clean passing review${target === 1 ? '' : 's'}.`;
  }
  if (change.status === 'CLOSED') {
    return 'This change is already closed.';
  }
  const blockers = change.summary.failCount + change.summary.blockedCount;
  if (blockers > 0) {
    return `${blockers} failing or blocked review${blockers === 1 ? '' : 's'} currently prevent auto-close.`;
  }
  if (change.summary.passCount >= target) {
    return 'Saving this target will close the change automatically.';
  }
  return `${change.summary.passCount} of ${target} passing reviews registered.`;
});
const editAutoCloseProgress = computed(() => {
  const target = normalizeAutoClosePassCount(editForm.value.autoClosePassCount);
  const passes = activeChange.value?.summary.passCount ?? 0;
  if (target <= 0) {
    return '0%';
  }
  return `${Math.min(100, Math.round((passes / target) * 100))}%`;
});
const settingsDirty = computed(
  () => JSON.stringify(settings.value) !== JSON.stringify(savedSettings.value)
);

const nextPatchViewIsComplete = computed(() => nextPatchView.value === 'complete');
const canUsePatchNotesGenerator = computed(
  () => authStore.isAdmin && nextPatchViewIsComplete.value
);
const nextPatchNeedsActionFilterActive = computed(
  () => !nextPatchViewIsComplete.value && nextPatchNeedsActionOnly.value
);
const visibleNextPatchChanges = computed(() =>
  nextPatchNeedsActionFilterActive.value
    ? nextPatchChanges.value.filter(needsViewerNextPatchAction)
    : nextPatchChanges.value
);
const nextPatchPassedCount = computed(() =>
  visibleNextPatchChanges.value.reduce((total, change) => total + change.summary.passCount, 0)
);
const nextPatchTesterCount = computed(() =>
  visibleNextPatchChanges.value.reduce((total, change) => total + change.summary.testerCount, 0)
);
const nextPatchAreaCount = computed(
  () => new Set(visibleNextPatchChanges.value.map((change) => change.subsystem)).size
);
const nextPatchPrimaryStatLabel = computed(() =>
  nextPatchViewIsComplete.value ? 'Complete' : 'Incomplete'
);
const nextPatchPrimaryStatDetail = computed(() =>
  nextPatchViewIsComplete.value ? 'changes' : 'open changes'
);
const nextPatchProgressComplete = computed(() => nextPatchCounts.value.completeCount);
const nextPatchProgressTotal = computed(() => nextPatchCounts.value.totalCount);
const nextPatchProgressPercent = computed(() =>
  nextPatchProgressTotal.value > 0
    ? Math.round((nextPatchProgressComplete.value / nextPatchProgressTotal.value) * 100)
    : 0
);
const nextPatchProgressLabel = computed(() => {
  if (nextPatchProgressTotal.value === 0) {
    return 'No changes flagged';
  }

  return `${nextPatchProgressComplete.value} of ${nextPatchProgressTotal.value} ready`;
});
const nextPatchProgressAriaLabel = computed(() => {
  if (nextPatchProgressTotal.value === 0) {
    return 'No changes are flagged for the next patch.';
  }

  return `${nextPatchProgressComplete.value} completed changes out of ${nextPatchProgressTotal.value} changes flagged for the next patch.`;
});
const normalizedPatchNotesStartNumber = computed(() => normalizePatchNoteNumber(patchNotesStartNumber.value));
const includedPatchNotesCount = computed(
  () => patchNoteDrafts.value.filter((draft) => draft.included).length
);
const nextPatchSummaryText = computed(() => {
  if (nextPatchLoading.value) {
    return nextPatchViewIsComplete.value
      ? 'Loading completed next patch changes.'
      : 'Loading incomplete next patch changes.';
  }

  if (nextPatchNeedsActionFilterActive.value) {
    if (visibleNextPatchChanges.value.length === 0) {
      return nextPatchChanges.value.length === 0
        ? 'Open changes flagged for the next patch will appear here.'
        : 'No incomplete next patch changes currently need your action.';
    }

    return `${visibleNextPatchChanges.value.length} incomplete change${
      visibleNextPatchChanges.value.length === 1 ? '' : 's'
    } need${visibleNextPatchChanges.value.length === 1 ? 's' : ''} your action.`;
  }

  if (visibleNextPatchChanges.value.length === 0) {
    return nextPatchViewIsComplete.value
      ? 'Completed, patch-ready changes will appear here.'
      : 'Open changes flagged for the next patch will appear here.';
  }

  return nextPatchViewIsComplete.value
    ? `${visibleNextPatchChanges.value.length} completed change${
        visibleNextPatchChanges.value.length === 1 ? '' : 's'
      } queued for deployment.`
    : `${visibleNextPatchChanges.value.length} incomplete change${
        visibleNextPatchChanges.value.length === 1 ? '' : 's'
      } flagged for the next patch.`;
});

const dashboardGraphChanges = computed(() => {
  const list = dashboard.value?.activeChanges ?? [];
  return [...list].sort(compareChanges);
});
const dashboardGraphChangeCount = computed(() => dashboard.value?.metrics.activeChanges ?? 0);

const testStateChart = {
  width: 760,
  height: 320,
  top: 28,
  right: 28,
  bottom: 44,
  left: 48
} as const;

type TestStateGraphPoint = {
  key: string;
  label: string;
  x: number;
  y: number;
  value: number;
  isLatest: boolean;
};

type TestStateGraphSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  points: TestStateGraphPoint[];
  path: string;
  areaPath: string;
  latest: number;
};

const testStateDayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short'
});

const testStateTimelineDays = computed(() => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (6 - index));
    day.setHours(23, 59, 59, 999);

    return {
      key: day.toISOString().slice(0, 10),
      label: testStateDayFormatter.format(day),
      endAt: day
    };
  });
});

function testStateTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function testStateX(index: number, total: number) {
  const span = testStateChart.width - testStateChart.left - testStateChart.right;
  return testStateChart.left + (span * index) / Math.max(1, total - 1);
}

function testStateY(value: number, maxValue: number) {
  const span = testStateChart.height - testStateChart.top - testStateChart.bottom;
  return testStateChart.top + span * (1 - value / Math.max(1, maxValue));
}

function testStateBuildSeries(
  key: string,
  label: string,
  color: string,
  values: number[],
  maxValue: number
): TestStateGraphSeries {
  const baseline = testStateChart.height - testStateChart.bottom;
  const points = values.map((value, index) => ({
    key: `${key}-${testStateTimelineDays.value[index]?.key ?? index}`,
    label: testStateTimelineDays.value[index]?.label ?? '',
    x: testStateX(index, values.length),
    y: testStateY(value, maxValue),
    value,
    isLatest: index === values.length - 1
  }));
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const latest = values[values.length - 1] ?? 0;

  return {
    key,
    label,
    color,
    values,
    points,
    path,
    areaPath:
      first && last
        ? `${path} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(
            2
          )} ${baseline.toFixed(2)} Z`
        : '',
    latest
  };
}

function testStateCreatedByDay(change: TestChange, dayEnd: Date) {
  const createdAt = testStateTimestamp(change.createdAt);
  return createdAt > 0 && createdAt <= dayEnd.getTime();
}

function testStateUpdatedByDay(change: TestChange, dayEnd: Date) {
  const updatedAt = testStateTimestamp(change.updatedAt);
  return updatedAt > 0 && updatedAt <= dayEnd.getTime();
}

const testStateGraphRawSeries = computed(() => {
  const metrics = dashboard.value?.metrics;
  const changes = dashboardGraphChanges.value;
  const days = testStateTimelineDays.value;
  const activeNow = dashboardGraphChangeCount.value;
  const knownActiveGap = Math.max(0, activeNow - changes.length);
  const awaitingNow = metrics?.awaitingTest ?? 0;
  const testingNow = metrics?.inProgress ?? 0;
  const riskChanges = changes.filter(
    (change) =>
      ['CRITICAL', 'HIGH'].includes(change.priority) ||
      ['FAILED', 'BLOCKED'].includes(change.status)
  );
  const riskNow = Math.max(metrics?.priorityOne ?? 0, riskChanges.length);

  const statusValues = (statuses: TestChangeStatus[], target: number) => {
    const matching = changes.filter((change) => statuses.includes(change.status));
    const gap = Math.max(0, target - matching.length);
    return days.map((day) => {
      const current = matching.filter((change) => testStateUpdatedByDay(change, day.endAt)).length;
      const ratio =
        matching.length > 0 ? current / matching.length : day === days[days.length - 1] ? 1 : 0;
      return Math.min(target, current + Math.round(gap * ratio));
    });
  };

  const riskValues = days.map((day) => {
    const current = riskChanges.filter((change) => testStateUpdatedByDay(change, day.endAt)).length;
    const ratio =
      riskChanges.length > 0 ? current / riskChanges.length : day === days[days.length - 1] ? 1 : 0;
    return Math.min(
      riskNow,
      current + Math.round(Math.max(0, riskNow - riskChanges.length) * ratio)
    );
  });

  return [
    {
      key: 'active',
      label: 'Active changes',
      color: '#55b7ff',
      values: days.map((day) =>
        Math.min(
          activeNow,
          knownActiveGap +
            changes.filter((change) => testStateCreatedByDay(change, day.endAt)).length
        )
      )
    },
    {
      key: 'awaiting',
      label: 'Awaiting pickup',
      color: '#d9a45f',
      values: statusValues(['SUBMITTED', 'AWAITING_TEST'], awaitingNow)
    },
    {
      key: 'testing',
      label: 'In testing',
      color: '#72d66f',
      values: statusValues(['TESTING'], testingNow)
    },
    {
      key: 'risk',
      label: 'P1/fail/block',
      color: '#ff6b55',
      values: riskValues
    }
  ];
});

const testStateGraphMax = computed(() =>
  Math.max(
    1,
    ...testStateGraphRawSeries.value.flatMap((series) => series.values),
    dashboardGraphChangeCount.value
  )
);

const testStateGraphSeries = computed<TestStateGraphSeries[]>(() =>
  testStateGraphRawSeries.value.map((series) =>
    testStateBuildSeries(
      series.key,
      series.label,
      series.color,
      series.values,
      testStateGraphMax.value
    )
  )
);

const testStateGraphGridLines = computed(() => {
  const max = testStateGraphMax.value;
  const ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0].filter(
    (value, index, list) => list.indexOf(value) === index
  );

  return ticks.map((value) => ({
    label: String(value),
    y: testStateY(value, max)
  }));
});

const testStateGraphXLabels = computed(() =>
  testStateTimelineDays.value.map((day, index) => ({
    label: day.label,
    x: testStateX(index, testStateTimelineDays.value.length)
  }))
);

const testStateGraphStats = computed(() => {
  const metrics = dashboard.value?.metrics;
  return [
    {
      label: 'Active',
      value: dashboardGraphChangeCount.value,
      detail: 'open changes'
    },
    {
      label: 'Coverage',
      value: `${metrics?.coverage ?? 0}%`,
      detail: 'touched by testers'
    },
    {
      label: 'Testing',
      value: metrics?.inProgress ?? 0,
      detail: 'currently underway'
    },
    {
      label: 'Awaiting',
      value: metrics?.awaitingTest ?? 0,
      detail: 'ready for pickup'
    }
  ];
});

const testStateComponentLeader = computed(() => {
  const counts = new Map<string, number>();
  for (const change of dashboardGraphChanges.value) {
    counts.set(change.subsystem, (counts.get(change.subsystem) ?? 0) + 1);
  }

  return (
    [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (left, right) => right.count - left.count || left.name.localeCompare(right.name)
      )[0] ?? {
      name: 'No component',
      count: 0
    }
  );
});

const testStateGraphInsights = computed(() => {
  const metrics = dashboard.value?.metrics;
  const riskCount = (metrics?.priorityOne ?? 0) + (metrics?.failed ?? 0) + (metrics?.blocked ?? 0);
  const flowGap = (metrics?.awaitingTest ?? 0) - (metrics?.inProgress ?? 0);
  return [
    {
      label: 'Flow balance',
      value:
        flowGap > 0
          ? `${flowGap} waiting`
          : flowGap < 0
            ? `${Math.abs(flowGap)} extra testing`
            : 'Even',
      detail: `${metrics?.inProgress ?? 0} testing / ${metrics?.awaitingTest ?? 0} awaiting`
    },
    {
      label: 'At-risk changes',
      value: riskCount,
      detail:
        riskCount === 0
          ? 'no priority-one, failed, or blocked changes'
          : 'priority-one, failed, or blocked changes'
    },
    {
      label: 'Hot component',
      value: testStateComponentLeader.value.name,
      detail: `${testStateComponentLeader.value.count} active change${
        testStateComponentLeader.value.count === 1 ? '' : 's'
      }`
    }
  ];
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
  return Math.max(1, dashboard.value?.metrics.activeChanges ?? 0);
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
const coverageUncoveredPercent = computed(() => {
  const metrics = dashboard.value?.metrics;
  const covered =
    (metrics?.passed ?? 0) +
    (metrics?.inProgress ?? 0) +
    (metrics?.failed ?? 0) +
    (metrics?.blocked ?? 0);
  return Math.round(
    (Math.max(0, (metrics?.activeChanges ?? 0) - covered) / coverageTotal.value) * 100
  );
});
const coverageDonutStyle = computed(() => {
  const metrics = dashboard.value?.metrics;
  const activeTotal = metrics?.activeChanges ?? 0;
  const covered =
    (metrics?.passed ?? 0) +
    (metrics?.inProgress ?? 0) +
    (metrics?.failed ?? 0) +
    (metrics?.blocked ?? 0);
  const uncovered = Math.max(0, activeTotal - covered);
  const segments = [
    { color: 'var(--tm-green)', count: metrics?.passed ?? 0 },
    { color: 'var(--tm-gold)', count: metrics?.inProgress ?? 0 },
    { color: 'var(--tm-red)', count: metrics?.failed ?? 0 },
    { color: '#b88cff', count: metrics?.blocked ?? 0 },
    { color: 'rgba(255, 255, 255, 0.08)', count: uncovered }
  ].filter((segment) => segment.count > 0);

  if (activeTotal === 0 || segments.length === 0) {
    return {
      background:
        'radial-gradient(circle, #111 57%, transparent 58%), conic-gradient(from -90deg, rgba(255,255,255,0.08) 0deg 360deg)'
    };
  }

  const total = activeTotal;
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

function cacheNextPatchView(view: NextPatchChangeView, changes: TestChange[]) {
  nextPatchViewCache.value = {
    ...nextPatchViewCache.value,
    [view]: changes
  };
}

function clearNextPatchCache() {
  nextPatchViewCache.value = {};
}

function getOppositeNextPatchView(view: NextPatchChangeView): NextPatchChangeView {
  return view === 'complete' ? 'incomplete' : 'complete';
}

async function prefetchNextPatchView(view: NextPatchChangeView) {
  if (nextPatchViewCache.value[view]) {
    return;
  }

  try {
    const changes = (await api.fetchTestManagerNextPatch(view)).sort(compareNextPatchChanges);
    cacheNextPatchView(view, changes);
  } catch {
    // Prefetch is opportunistic; the active view load still handles visible failures.
  }
}

function refreshNextPatchCountInBackground() {
  void loadNextPatchCount().catch(() => undefined);
}

async function loadNextPatch() {
  const view = nextPatchView.value;
  const cachedChanges = nextPatchViewCache.value[view];
  const sequence = ++nextPatchLoadSequence;
  if (cachedChanges) {
    nextPatchChanges.value = [...cachedChanges];
  }
  nextPatchLoading.value = !cachedChanges;
  try {
    const changes = (await api.fetchTestManagerNextPatch(view)).sort(compareNextPatchChanges);
    cacheNextPatchView(view, changes);
    if (sequence !== nextPatchLoadSequence || nextPatchView.value !== view) {
      return;
    }
    nextPatchChanges.value = changes;
    if (view === 'complete') {
      nextPatchCount.value = nextPatchChanges.value.length;
    }
    refreshNextPatchCountInBackground();
    void prefetchNextPatchView(getOppositeNextPatchView(view));
  } finally {
    if (sequence === nextPatchLoadSequence && nextPatchView.value === view) {
      nextPatchLoading.value = false;
    }
  }
}

async function loadNextPatchCount() {
  const counts = await api.fetchTestManagerNextPatchCounts();
  nextPatchCounts.value = counts;
  nextPatchCount.value = counts.count;
}

async function setNextPatchView(view: NextPatchChangeView) {
  if (nextPatchView.value === view) {
    return;
  }
  nextPatchView.value = view;
  const cachedChanges = nextPatchViewCache.value[view];
  nextPatchChanges.value = cachedChanges ? [...cachedChanges] : [];
  await loadNextPatch();
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false;
  }

  return (error as { response?: { status?: number } }).response?.status === 404;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      return response.data.message;
    }
  }

  return error instanceof Error ? error.message : fallback;
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
  if (isRolePermissionLocked(roleKey, permissionKey)) {
    return true;
  }

  const role = settings.value?.roles.find((item) => item.key === roleKey);
  return Boolean(role?.permissions.includes(permissionKey));
}

function isRolePermissionLocked(roleKey: string, permissionKey: TestManagerPermissionKey): boolean {
  return roleKey === 'ADMIN' && permissionKey !== 'noteForPass';
}

function toggleRolePermission(
  roleKey: string,
  permissionKey: TestManagerPermissionKey,
  checked: boolean
) {
  if (
    !authStore.canManageTestManagerSettings ||
    !settings.value ||
    isRolePermissionLocked(roleKey, permissionKey)
  ) {
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
  if (!authStore.canManageTestManagerSettings || !settings.value) {
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
  if (!authStore.canManageTestManagerSettings || !savedSettings.value || settingsSaving.value) {
    return;
  }

  settings.value = cloneSettings(savedSettings.value);
  settingsMessage.value = '';
}

async function saveSettings() {
  if (
    !authStore.canManageTestManagerSettings ||
    !settings.value ||
    settingsSaving.value ||
    !settingsDirty.value
  ) {
    return;
  }

  settingsSaving.value = true;
  settingsMessage.value = '';
  try {
    const result = await api.updateTestManagerSettings({
      roles: settings.value.roles.map((role) => ({
        key: role.key,
        permissions:
          role.key === 'ADMIN'
            ? orderedPermissions([
                ...ADMIN_TEST_MANAGER_PERMISSIONS,
                ...(role.permissions.includes('noteForPass') ? ['noteForPass'] : [])
              ])
            : orderedPermissions(role.permissions)
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
    } else if (!authStore.canManageTestManagerSettings) {
      await router.push('/test-manager/dashboard');
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
    } else if (section === 'next-patch') {
      await loadNextPatch();
    } else if (section === 'users') {
      await loadUsers();
    } else {
      await loadSettings();
    }
    if (section !== 'next-patch') {
      await loadNextPatchCount();
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
  hideChangeTooltip();
}

function clearChangeTooltipTimer() {
  if (!changeTooltipTimer) {
    return;
  }
  window.clearTimeout(changeTooltipTimer);
  changeTooltipTimer = null;
}

function changeTooltipPosition(card: HTMLElement) {
  const bounds = card.getBoundingClientRect();
  const gap = 14;
  const edgePadding = 12;
  const fallbackLeft = bounds.left - CHANGE_TOOLTIP_WIDTH - gap;
  const preferredLeft = bounds.right + gap;
  const maxLeft = window.innerWidth - CHANGE_TOOLTIP_WIDTH - edgePadding;
  const hasRoomOnRight = preferredLeft <= maxLeft;
  const left = hasRoomOnRight
    ? preferredLeft
    : Math.max(edgePadding, Math.min(fallbackLeft, maxLeft));
  const top = Math.min(
    Math.max(bounds.top, edgePadding),
    Math.max(edgePadding, window.innerHeight - 280)
  );

  return { top, left };
}

function queueChangeTooltip(change: TestChange, event: MouseEvent) {
  clearChangeTooltipTimer();
  changeTooltip.value = null;
  const card = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!card) {
    return;
  }

  changeTooltipTimer = window.setTimeout(() => {
    changeTooltipTimer = null;
    if (!document.body.contains(card)) {
      return;
    }

    changeTooltip.value = {
      change,
      ...changeTooltipPosition(card)
    };
  }, CHANGE_TOOLTIP_DELAY_MS);
}

function hideChangeTooltip() {
  clearChangeTooltipTimer();
  changeTooltip.value = null;
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
    description: activeChange.value.description,
    category: activeChange.value.category,
    subsystem: activeChange.value.subsystem,
    priority: activeChange.value.priority,
    targetBuild: activeChange.value.targetBuild ?? '',
    githubPrUrl: activeChange.value.githubPullRequest?.url ?? '',
    githubIssueUrl: activeChange.value.githubIssue?.url ?? '',
    includeInNextPatch: activeChange.value.includeInNextPatch,
    autoClosePassCount: activeChange.value.autoClosePassCount,
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

function applyChecklistAddTemplate(template: ChecklistAddTemplate) {
  checklistAddForm.value = {
    title: template.title,
    details: template.details ?? '',
    category: template.category || activeChange.value?.category || ''
  };
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
    githubPrUrl: '',
    githubIssueUrl: '',
    includeInNextPatch: true,
    autoClosePassCount: 0,
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
    githubPrUrl: '',
    githubIssueUrl: '',
    includeInNextPatch: true,
    autoClosePassCount: 0,
    dueAt: null,
    assignedToId: null
  };
}

function normalizeAutoClosePassCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(99, Math.max(0, Math.floor(parsed)));
}

function autoCloseBlocked(change: TestChange) {
  return change.summary.failCount > 0 || change.summary.blockedCount > 0;
}

function autoCloseTone(change: TestChange) {
  if (change.autoClosePassCount <= 0) {
    return 'disabled';
  }
  if (autoCloseBlocked(change)) {
    return 'blocked';
  }
  if (change.status === 'CLOSED') {
    return 'closed';
  }
  if (change.summary.passCount >= change.autoClosePassCount) {
    return 'ready';
  }
  return 'armed';
}

function autoCloseProgressPercent(change: TestChange) {
  if (change.autoClosePassCount <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (change.summary.passCount / change.autoClosePassCount) * 100));
}

function autoCloseLabel(change: TestChange) {
  if (change.autoClosePassCount <= 0) {
    return 'Auto-close off';
  }
  if (autoCloseBlocked(change)) {
    return 'Auto-close blocked';
  }
  if (change.status === 'CLOSED') {
    return 'Auto-close met';
  }
  return `${change.summary.passCount}/${change.autoClosePassCount} auto-close`;
}

function autoCloseListLabel(change: TestChange) {
  if (autoCloseBlocked(change)) {
    return 'Blocked';
  }
  if (change.status === 'CLOSED') {
    return 'Met';
  }
  return 'Auto-close';
}

function autoCloseDetail(change: TestChange) {
  if (change.autoClosePassCount <= 0) {
    return 'Auto-close is disabled for this change.';
  }
  const blockers = change.summary.failCount + change.summary.blockedCount;
  if (blockers > 0) {
    return `${blockers} failing or blocked review${blockers === 1 ? '' : 's'} prevent automatic closing.`;
  }
  if (change.status === 'CLOSED') {
    return `Pass target was ${change.autoClosePassCount}; ${change.summary.passCount} passing review${change.summary.passCount === 1 ? '' : 's'} are registered.`;
  }
  return `Closes automatically at ${change.autoClosePassCount} passing review${change.autoClosePassCount === 1 ? '' : 's'} when no fail or blocked reviews exist.`;
}

function setUserRoleFilter(filter: UserRoleFilter) {
  userRoleFilter.value = filter;
  userPage.value = 1;
}

async function createChange() {
  const payload: CreateTestChangePayload = {
    ...createForm.value,
    description: normalizeRichTextHtml(createForm.value.description),
    githubPrUrl: createForm.value.githubPrUrl?.trim() || null,
    githubIssueUrl: createForm.value.githubIssueUrl?.trim() || null,
    includeInNextPatch: createForm.value.includeInNextPatch ?? true,
    autoClosePassCount: normalizeAutoClosePassCount(createForm.value.autoClosePassCount),
    checklist: createForm.value.checklist
      .filter((item) => item.title.trim())
      .map((item) => ({
        ...item,
        category: item.category || createForm.value.category || null
      }))
  };
  const change = await api.createTestChange(payload);
  replaceCachedChange(change);
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
    const updated = await api.updateTestChange(activeChange.value.id, {
      ...editForm.value,
      description: normalizeRichTextHtml(editForm.value.description),
      targetBuild: editForm.value.targetBuild?.trim() || null,
      githubPrUrl: editForm.value.githubPrUrl?.trim() || null,
      githubIssueUrl: editForm.value.githubIssueUrl?.trim() || null,
      includeInNextPatch: editForm.value.includeInNextPatch ?? true,
      autoClosePassCount: normalizeAutoClosePassCount(editForm.value.autoClosePassCount),
      dueAt
    });
    replaceCachedChange(updated);
    selectedChange.value = updated;
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
  if (result === 'PASS' && authStore.requiresTestManagerPassNote && !notesText) {
    feedbackError.value = 'Testing notes are required to pass this change.';
    void openNotesModal();
    return;
  }

  feedbackError.value = '';
  const confirmations: Record<TestResult, ResultActionConfirm> = {
    PASS: {
      result,
      title: 'Mark this test as passed?',
      body: authStore.requiresTestManagerPassNote
        ? 'This records your tester input as Passed and attaches your current testing notes for the selected change.'
        : 'This records your tester input as Passed for the selected change and indicates your validation found no blocking issues.',
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
  if (result === 'PASS' && authStore.requiresTestManagerPassNote && !notesText) {
    feedbackError.value = 'Testing notes are required to pass this change.';
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
  if (!canAddTestingNote.value) {
    feedbackError.value = 'Testing notes can only be added while the change is open.';
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

function isDeletingNote(noteId: string) {
  return deletingNoteIds.value.has(noteId);
}

function isOwnNote(note: TestChangeNote) {
  return note.canDelete || note.author?.id === authStore.user?.userId;
}

function setNoteDeleting(noteId: string, deleting: boolean) {
  const next = new Set(deletingNoteIds.value);
  if (deleting) {
    next.add(noteId);
  } else {
    next.delete(noteId);
  }
  deletingNoteIds.value = next;
}

async function deleteNote(note: TestChangeNote) {
  if (!activeChange.value || !note.canDelete || isDeletingNote(note.id)) {
    return;
  }

  feedbackError.value = '';
  setNoteDeleting(note.id, true);
  try {
    selectedChange.value = await api.deleteTestChangeNote(activeChange.value.id, note.id);
    await loadChanges();
  } catch (error) {
    feedbackError.value = getApiErrorMessage(error, 'Unable to delete testing note.');
  } finally {
    setNoteDeleting(note.id, false);
  }
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

function openChecklistAdd() {
  if (!authStore.isAdmin || !activeChange.value) {
    return;
  }
  checklistAddForm.value = createChecklistItem(activeChange.value.category);
  checklistAddOpen.value = true;
}

function closeChecklistAdd() {
  if (checklistAddSaving.value) {
    return;
  }
  checklistAddOpen.value = false;
}

async function saveChecklistAdd() {
  if (!authStore.isAdmin || !activeChange.value || checklistAddSaving.value) {
    return;
  }

  const title = checklistAddForm.value.title.trim();
  if (!title) {
    addToast({
      title: 'Checklist Item Required',
      message: 'Enter a checklist item title before adding it.',
      variant: 'warning'
    });
    return;
  }

  checklistAddSaving.value = true;
  try {
    const updated = await api.addTestChangeChecklistItem(activeChange.value.id, {
      title,
      details: checklistAddForm.value.details?.trim() || null,
      category: checklistAddForm.value.category?.trim() || null
    });
    replaceCachedChange(updated);
    checklistAddOpen.value = false;
    addToast({
      title: 'Checklist Item Added',
      message: `Added "${title}" to #${updated.publicId}.`,
      variant: 'success'
    });
  } catch (error) {
    addToast({
      title: 'Checklist Add Failed',
      message: getApiErrorMessage(error, 'Unable to add checklist item.'),
      variant: 'error'
    });
  } finally {
    checklistAddSaving.value = false;
  }
}

function isDeletingChecklistItem(checklistItemId: string) {
  return deletingChecklistItemIds.value.has(checklistItemId);
}

function setChecklistItemDeleting(checklistItemId: string, deleting: boolean) {
  const next = new Set(deletingChecklistItemIds.value);
  if (deleting) {
    next.add(checklistItemId);
  } else {
    next.delete(checklistItemId);
  }
  deletingChecklistItemIds.value = next;
}

async function deleteChecklistItem(item: TestChange['checklist'][number]) {
  if (!authStore.isAdmin || !activeChange.value || isDeletingChecklistItem(item.id)) {
    return;
  }

  const confirmed = window.confirm(
    `Delete checklist item "${item.title}"? This removes its progress for every tester.`
  );
  if (!confirmed) {
    return;
  }

  setChecklistItemDeleting(item.id, true);
  try {
    const updated = await api.deleteTestChangeChecklistItem(activeChange.value.id, item.id);
    replaceCachedChange(updated);
    selectedChange.value = updated;
    addToast({
      title: 'Checklist Item Deleted',
      message: `Removed "${item.title}" from #${updated.publicId}.`,
      variant: 'success'
    });
    await loadChanges();
  } catch (error) {
    addToast({
      title: 'Checklist Delete Failed',
      message: getApiErrorMessage(error, 'Unable to delete checklist item.'),
      variant: 'error'
    });
  } finally {
    setChecklistItemDeleting(item.id, false);
  }
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
  const updated = await api.updateTestChangeChecklistProgress(
    activeChange.value.id,
    checklistNoteItemId.value,
    { notesHtml: checklistNoteEditor.value?.getHtml() || '' }
  );
  replaceCachedChange(updated);
  selectedChange.value = updated;
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
  const updated = await api.updateTestChangeStatus(activeChange.value.id, status);
  replaceCachedChange(updated);
  selectedChange.value = updated;
  await loadChanges();
}

function replaceCachedChange(change: TestChange) {
  changes.value = changes.value.map((entry) => (entry.id === change.id ? change : entry));
  const nextPatchCache: Partial<Record<NextPatchChangeView, TestChange[]>> = {
    ...nextPatchViewCache.value
  };
  nextPatchViewOptions.forEach(({ key }) => {
    const cachedChanges = nextPatchCache[key];
    if (!cachedChanges) {
      return;
    }
    const belongsInView =
      change.includeInNextPatch &&
      (key === 'complete' ? change.status === 'CLOSED' : change.status !== 'CLOSED');
    const updatedChanges = cachedChanges.filter((entry) => entry.id !== change.id);
    nextPatchCache[key] = (belongsInView ? [...updatedChanges, change] : updatedChanges).sort(
      compareNextPatchChanges
    );
  });
  nextPatchViewCache.value = nextPatchCache;
  nextPatchChanges.value = nextPatchChanges.value
    .map((entry) => (entry.id === change.id ? change : entry))
    .filter(isChangeInCurrentNextPatchView)
    .sort(compareNextPatchChanges);
  if (selectedChange.value?.id === change.id) {
    selectedChange.value = change;
  }
}

async function setChangeNextPatch(change: TestChange, includeInNextPatch: boolean) {
  if (!authStore.isAdmin || nextPatchTogglePending.value) {
    return;
  }

  nextPatchTogglePending.value = true;
  try {
    const updated = await api.updateTestChangeNextPatch(change.id, includeInNextPatch);
    replaceCachedChange(updated);
    if (currentSection.value === 'next-patch') {
      await loadNextPatch();
    } else {
      await loadNextPatchCount();
    }
    addToast({
      title: includeInNextPatch ? 'Added To Next Patch' : 'Removed From Next Patch',
      message: `#${updated.publicId} ${includeInNextPatch ? 'will be included' : 'was cleared'} for the next patch.`,
      variant: 'success'
    });
  } catch (error) {
    addToast({
      title: 'Next Patch Update Failed',
      message: getApiErrorMessage(error, 'Unable to update next patch status.'),
      variant: 'error'
    });
  } finally {
    nextPatchTogglePending.value = false;
  }
}

async function toggleActiveChangeNextPatch() {
  if (!activeChange.value) {
    return;
  }
  await setChangeNextPatch(activeChange.value, !activeChange.value.includeInNextPatch);
}

async function setChangeReadyToTest(change: TestChange, readyToTest: boolean) {
  if (!authStore.isAdmin || readyToTestTogglePending.value) {
    return;
  }

  readyToTestTogglePending.value = true;
  try {
    const updated = await api.updateTestChangeReadyToTest(change.id, readyToTest);
    replaceCachedChange(updated);
    selectedChange.value = updated;
    await loadChanges();
    addToast({
      title: readyToTest ? 'Ready To Test' : 'Tester Input Paused',
      message: `#${updated.publicId} ${readyToTest ? 'can now receive tester input' : 'is no longer accepting tester input'}.`,
      variant: 'success'
    });
  } catch (error) {
    addToast({
      title: 'Ready-To-Test Update Failed',
      message: getApiErrorMessage(error, 'Unable to update ready-to-test status.'),
      variant: 'error'
    });
  } finally {
    readyToTestTogglePending.value = false;
  }
}

async function toggleActiveChangeReadyToTest() {
  if (!activeChange.value) {
    return;
  }
  await setChangeReadyToTest(activeChange.value, !isChangeReadyToTest(activeChange.value));
}

function dismissClosedNextPatchPrompt() {
  const change = activeChange.value;
  if (!change) {
    return;
  }
  closedNextPatchPromptDismissedIds.value = new Set([
    ...closedNextPatchPromptDismissedIds.value,
    change.id
  ]);
}

async function confirmClosedNextPatchPrompt() {
  const change = activeChange.value;
  if (!change) {
    return;
  }
  await setChangeNextPatch(change, true);
}

function openNextPatchResetConfirm() {
  if (!authStore.isAdmin || !nextPatchViewIsComplete.value || nextPatchChanges.value.length === 0) {
    return;
  }
  nextPatchResetConfirm.value = true;
}

function closeNextPatchResetConfirm() {
  if (nextPatchResetPending.value) {
    return;
  }
  nextPatchResetConfirm.value = false;
}

function normalizePatchNoteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.floor(numeric)) : 1;
}

function normalizePatchNotesStartNumber() {
  patchNotesStartNumber.value = normalizedPatchNotesStartNumber.value;
}

function createPatchNoteDraft(note: GeneratedPatchNote): PatchNoteDraft {
  return {
    changeId: note.changeId,
    publicId: note.publicId,
    title: note.title,
    category: note.category,
    subsystem: note.subsystem,
    note: note.note.replace(/^\s*\d+\.\s*/, '').trim(),
    included: true
  };
}

async function generatePatchNotes() {
  if (!canUsePatchNotesGenerator.value) {
    return;
  }

  if (patchNotesGenerating.value) {
    return;
  }

  patchNotesGenerating.value = true;
  patchNotesError.value = '';
  try {
    const result = await api.generateTestManagerPatchNotes();
    patchNotesModel.value = result.model;
    patchNoteDrafts.value = result.notes.map(createPatchNoteDraft);
  } catch (error) {
    patchNoteDrafts.value = [];
    patchNotesError.value = getApiErrorMessage(error, 'Unable to generate patch notes.');
    addToast({
      title: 'Patch Notes Failed',
      message: patchNotesError.value,
      variant: 'error'
    });
  } finally {
    patchNotesGenerating.value = false;
  }
}

function openPatchNotesGenerator() {
  if (!canUsePatchNotesGenerator.value || visibleNextPatchChanges.value.length === 0) {
    return;
  }

  patchNotesStartNumber.value = 1;
  patchNotesError.value = '';
  patchNotesModel.value = '';
  patchNoteDrafts.value = [];
  patchNotesGeneratorOpen.value = true;
}

function closePatchNotesGenerator() {
  if (patchNotesGenerating.value) {
    return;
  }
  patchNotesGeneratorOpen.value = false;
}

function selectAllPatchNotes() {
  patchNoteDrafts.value.forEach((draft) => {
    draft.included = true;
  });
}

function deselectAllPatchNotes() {
  patchNoteDrafts.value.forEach((draft) => {
    draft.included = false;
  });
}

function patchNoteDisplayNumber(draft: PatchNoteDraft) {
  if (!draft.included) {
    return 'Excluded';
  }

  const includedIndex = patchNoteDrafts.value
    .filter((item) => item.included)
    .findIndex((item) => item.changeId === draft.changeId);

  return `${normalizedPatchNotesStartNumber.value + Math.max(includedIndex, 0)}.`;
}

function buildPatchNotesClipboardText() {
  let noteNumber = normalizedPatchNotesStartNumber.value;
  return patchNoteDrafts.value
    .filter((draft) => draft.included)
    .map((draft) => `${noteNumber++}. ${draft.note.trim()}`)
    .join('\n');
}

async function copyPatchNotesToClipboard() {
  const text = buildPatchNotesClipboardText();
  if (!text) {
    return;
  }

  try {
    await copyShareText(text);
    addToast({
      title: 'Patch Notes Copied',
      message: `${includedPatchNotesCount.value} note${
        includedPatchNotesCount.value === 1 ? '' : 's'
      } copied to clipboard.`,
      variant: 'success'
    });
  } catch {
    addToast({
      title: 'Unable To Copy',
      message: 'Your browser blocked clipboard access.',
      variant: 'error'
    });
  }
}

async function confirmNextPatchReset() {
  if (!authStore.isAdmin || nextPatchResetPending.value) {
    return;
  }

  nextPatchResetPending.value = true;
  try {
    const result = await api.resetTestManagerNextPatch();
    nextPatchResetConfirm.value = false;
    clearNextPatchCache();
    await loadNextPatch();
    addToast({
      title: 'Patch List Reset',
      message: `${result.resetCount} change${result.resetCount === 1 ? '' : 's'} cleared from Next Patch.`,
      variant: 'success'
    });
  } catch (error) {
    addToast({
      title: 'Reset Failed',
      message: getApiErrorMessage(error, 'Unable to reset next patch.'),
      variant: 'error'
    });
  } finally {
    nextPatchResetPending.value = false;
  }
}

async function removeActiveChange() {
  if (!activeChange.value) {
    return;
  }
  await api.deleteTestChange(activeChange.value.id);
  clearNextPatchCache();
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
  if (change.status === 'CLOSED' || !isChangeReadyToTest(change)) {
    return false;
  }
  if (!viewerTester) {
    return authStore.canVolunteerTestManager;
  }
  return Boolean(
    viewerTester.result || (viewerTester.status === 'NOT_STARTED' && !viewerTester.result)
  );
}

function needsViewerNextPatchAction(change: TestChange) {
  const viewerTester = change.viewerTester;
  return (
    change.status !== 'CLOSED' &&
    isChangeReadyToTest(change) &&
    Boolean(
      viewerTester &&
        !viewerTester.result &&
        (viewerTester.status === 'NOT_STARTED' || viewerTester.status === 'TESTING')
    )
  );
}

function startTestingLabel(change: TestChange) {
  if (change.viewerTester?.result) {
    return 'Re-test';
  }
  if (isViewerRequestedPending(change)) {
    return 'Accept Request';
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

function openWebhookReportSummary(report: TestChangeWebhookReport) {
  selectedWebhookReport.value = report;
  webhookReportModalTab.value = 'raw';
}

function closeWebhookReportSummary() {
  selectedWebhookReport.value = null;
  webhookReportModalTab.value = 'raw';
}

function formatAiConfidence(confidence: number) {
  const normalized = confidence > 1 ? confidence : confidence * 100;
  return `${Math.round(normalized)}% confidence`;
}

async function openWebhookInboxReport(messageId: string) {
  if (!canOpenWebhookInbox.value) {
    return;
  }

  await router.push({
    path: '/admin/webhooks',
    query: { messageId }
  });
}

async function unlinkWebhookReport(report: TestChangeWebhookReport) {
  if (!authStore.isAdmin || !activeChange.value || unlinkingWebhookReportId.value) {
    return;
  }

  unlinkingWebhookReportId.value = report.id;
  try {
    const updated = await api.unlinkWebhookReportFromTestChange(
      activeChange.value.id,
      report.messageId
    );
    selectedChange.value = updated;
    replaceCachedChange(updated);
    if (selectedWebhookReport.value?.id === report.id) {
      selectedWebhookReport.value = null;
    }
    addToast({
      title: 'Report Unlinked',
      message: `Removed ${report.reportType.toLowerCase()} from #${updated.publicId}.`,
      variant: 'success'
    });
  } catch (error) {
    addToast({
      title: 'Unable To Unlink Report',
      message: getApiErrorMessage(error, 'The report link could not be removed.'),
      variant: 'error'
    });
  } finally {
    unlinkingWebhookReportId.value = null;
  }
}

async function refreshActiveChangeReportDetails() {
  if (detailTab.value !== 'Reports' || !activeChange.value) {
    return;
  }

  const updated = await api.fetchTestChange(activeChange.value.id);
  selectedChange.value = updated;
  replaceCachedChange(updated);
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
    change.status !== 'CLOSED' &&
    isChangeReadyToTest(change) &&
    change.viewerTester?.status === 'TESTING' &&
    !change.viewerTester.result
  );
}

function isChangeReadyToTest(change: TestChange) {
  return change.readyToTest !== false;
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

function compareNextPatchChanges(left: TestChange, right: TestChange) {
  return left.publicId - right.publicId;
}

function isChangeInCurrentNextPatchView(change: TestChange) {
  return (
    change.includeInNextPatch &&
    (nextPatchViewIsComplete.value ? change.status === 'CLOSED' : change.status !== 'CLOSED')
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
  if (status === 'SUBMITTED') {
    return 'Awaiting Test';
  }

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

  if (change.status === 'CLOSED') {
    return { label: 'Closed', tone: 'closed' };
  }

  if (tester?.result === 'PASS') {
    return { label: 'You passed', tone: 'passed' };
  }
  if (tester?.result === 'FAIL') {
    return { label: 'You failed', tone: 'failed' };
  }
  if (tester?.result === 'BLOCKED' || tester?.status === 'BLOCKED') {
    return { label: 'You blocked', tone: 'blocked' };
  }

  if (!tester) {
    return { label: 'Pending Test', tone: 'unassigned' };
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

const githubMetricFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function githubPrHref(pullRequest: TestChangePullRequest) {
  return pullRequest.metadata.htmlUrl || pullRequest.url;
}

function githubPrLabel(pullRequest: TestChangePullRequest) {
  return `${pullRequest.repository}#${pullRequest.number}`;
}

function githubPrTone(pullRequest: TestChangePullRequest) {
  if (!pullRequest.metadata.available) {
    return 'unavailable';
  }
  if (pullRequest.metadata.draft) {
    return 'draft';
  }
  if (pullRequest.metadata.merged) {
    return 'merged';
  }
  if (pullRequest.metadata.state === 'closed') {
    return 'closed';
  }
  return 'open';
}

function githubPrStateLabel(pullRequest: TestChangePullRequest) {
  const tone = githubPrTone(pullRequest);
  const labels: Record<string, string> = {
    unavailable: 'Metadata unavailable',
    draft: 'Draft',
    merged: 'Merged',
    closed: 'Closed',
    open: 'Open'
  };
  return labels[tone] ?? 'Linked';
}

function githubPrMetric(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? githubMetricFormatter.format(value)
    : 'n/a';
}

function githubPrSignedMetric(value: number | null, prefix: '+' | '-') {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${prefix}${githubMetricFormatter.format(value)}`
    : 'n/a';
}

function githubLabelColor(value: string | null) {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : 'rgba(139, 148, 158, 0.88)';
}

function githubPrBranchSummary(pullRequest: TestChangePullRequest) {
  const { headRef, baseRef } = pullRequest.metadata;
  if (headRef && baseRef) {
    return `${headRef} into ${baseRef}`;
  }
  return 'GitHub metadata refreshed for this linked pull request.';
}

function githubPrMergedAt(pullRequest: TestChangePullRequest) {
  return pullRequest.metadata.merged ? pullRequest.metadata.mergedAt : null;
}

function githubPrMergedAtLabel(pullRequest: TestChangePullRequest) {
  const mergedAt = githubPrMergedAt(pullRequest);
  return mergedAt ? formatDateTime(mergedAt) : '';
}

function githubPrMergedAtRelative(pullRequest: TestChangePullRequest) {
  const mergedAt = githubPrMergedAt(pullRequest);
  return mergedAt ? relativeTime(mergedAt) : '';
}

function githubIssueHref(issue: TestChangeIssue) {
  return issue.metadata.htmlUrl || issue.url;
}

function githubIssueLabel(issue: TestChangeIssue) {
  return `${issue.repository}#${issue.number}`;
}

function githubIssueTone(issue: TestChangeIssue) {
  if (!issue.metadata.available) {
    return 'unavailable';
  }
  if (issue.metadata.state === 'closed') {
    return 'completed';
  }
  return 'open';
}

function githubIssueStateLabel(issue: TestChangeIssue) {
  const tone = githubIssueTone(issue);
  const labels: Record<string, string> = {
    unavailable: 'Metadata unavailable',
    completed: 'Closed',
    open: 'Open'
  };
  return labels[tone] ?? 'Linked';
}

function githubIssueSummary(issue: TestChangeIssue) {
  if (issue.metadata.closedAt) {
    return `Closed ${relativeTime(issue.metadata.closedAt)}.`;
  }
  return 'Issue context is linked for tester and developer follow-up.';
}

function githubIntegrationLabel(change: TestChange) {
  const count = Number(Boolean(change.githubPullRequest)) + Number(Boolean(change.githubIssue));
  return count === 2 ? 'PR + Issue' : change.githubPullRequest ? 'Pull Request' : 'Issue';
}

function githubLabelsForChange(change: TestChange) {
  const labels = [
    ...(change.githubPullRequest?.metadata.labels ?? []).map((label) => ({
      ...label,
      source: 'pr'
    })),
    ...(change.githubIssue?.metadata.labels ?? []).map((label) => ({
      ...label,
      source: 'issue'
    }))
  ];
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = label.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function openGithubLink(event: MouseEvent, url: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  event.preventDefault();
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) {
    opened.opener = null;
  }
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

function userRoleClass(user: TestManagerUserSummary) {
  return {
    'tm-user-role--admin': user.isAdmin,
    'tm-user-role--guide': !user.isAdmin && user.isGuide
  };
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
    const displayStatus = computed(() =>
      props.status === 'SUBMITTED' ? 'AWAITING_TEST' : props.status
    );

    return () =>
      h(
        'span',
        {
          class: [
            'tm-status',
            `tm-status--${displayStatus.value.toLowerCase()}`,
            { 'tm-status--compact': props.compact }
          ]
        },
        statusLabel(displayStatus.value)
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
      const viewerHasPassed = props.change.viewerTester?.result === 'PASS';
      const displayedActiveStep =
        viewerHasPassed && activeStep === 'TESTING' ? 'PASSED' : activeStep;
      const activeIndex = steps.indexOf(displayedActiveStep);
      const skipRenewed = props.change.status === 'CLOSED' && !wasRenewed(props.change);
      const isTerminalClosed = props.change.status === 'CLOSED';
      const testingIndex = steps.indexOf('TESTING');
      const skipTesting = activeIndex > testingIndex && !viewerCompletedTesting(props.change);

      return h('div', { class: 'tm-workflow' }, [
        h('h3', 'Workflow Timeline'),
        h(
          'div',
          { class: 'tm-workflow__steps' },
          steps.map((step, index) => {
            const isSkipped =
              (skipTesting && step === 'TESTING') || (skipRenewed && step === 'RENEWED');
            const isComplete =
              (activeIndex > index ||
                (isTerminalClosed && step === 'CLOSED') ||
                (viewerHasPassed && step === 'PASSED')) &&
              !isSkipped;
            const isActive =
              !isTerminalClosed && step === displayedActiveStep && !(viewerHasPassed && isComplete);

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
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: 'Enter detailed testing notes...' }
  },
  emits: ['update:modelValue'],
  setup(props, { emit, expose }) {
    const editor = ref<HTMLElement | null>(null);
    const activeMarks = reactive({ bold: false, italic: false, underline: false });
    let savedRange: Range | null = null;
    const setEditorHtml = (html: string) => {
      if (!editor.value) {
        return;
      }
      const normalized = normalizeRichTextHtml(html);
      if (editor.value.innerHTML !== normalized) {
        editor.value.innerHTML = normalized;
      }
    };
    const emitCurrentHtml = () => {
      emit('update:modelValue', editor.value?.innerHTML ?? '');
    };
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
      emitCurrentHtml();
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
      emitCurrentHtml();
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
      emitCurrentHtml();
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
        setEditorHtml(html);
        emitCurrentHtml();
      },
      clear: () => {
        setEditorHtml('');
        emitCurrentHtml();
      }
    });
    onMounted(() => {
      setEditorHtml(props.modelValue);
    });
    watch(
      () => props.modelValue,
      (html) => {
        if (!editor.value) {
          return;
        }
        const current = normalizeRichTextHtml(editor.value.innerHTML.trim() || '');
        const incoming = normalizeRichTextHtml(html);
        if (current !== incoming) {
          editor.value.innerHTML = incoming;
        }
      },
      { flush: 'post' }
    );
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
          onInput: () => {
            saveSelection();
            emitCurrentHtml();
          },
          onPaste: handlePaste,
          'data-placeholder': props.placeholder
        })
      ]);
  }
});

watch(
  () => route.fullPath,
  () => {
    hideChangeTooltip();
    void loadCurrentSection();
  }
);
watch(
  () => [
    requestedSectionParam(),
    authStore.user?.userId ?? '',
    authStore.user?.testManagerPermissions.join('|') ?? ''
  ],
  ([section]) => {
    if (section !== 'settings' || !authStore.user) {
      return;
    }

    if (!authStore.canManageTestManagerSettings) {
      void router.replace('/test-manager/dashboard');
    } else if (loadedSection.value !== 'settings') {
      void loadCurrentSection();
    }
  },
  { immediate: true }
);
watch(currentSection, (section) => {
  if (section === 'changes') {
    void nextTick(() => updateChangeLayout(changeLayout.value));
  }
});
watch([userSearch, userRoleFilter], () => {
  userPage.value = 1;
});
watch(totalUserPages, (pages) => {
  if (userPage.value > pages) {
    userPage.value = pages;
  }
});
watch(detailTab, (tab) => {
  if (tab === 'Reports') {
    void refreshActiveChangeReportDetails();
  }
});
watch(
  () => activeChange.value?.id,
  () => {
    notesOpen.value = false;
    checklistNotePromptItemId.value = null;
    feedbackError.value = '';
    deletingNoteIds.value = new Set();
    deletingChecklistItemIds.value = new Set();
    testerSearch.value = '';
    testerStatusFilter.value = 'All Statuses';
    testerResultFilter.value = 'All Results';
    testerAssignmentFilter.value = 'All Assignments';
    selectedWebhookReport.value = null;
    notesEditor.value?.clear();
    if (detailTab.value === 'Reports') {
      void refreshActiveChangeReportDetails();
    }
  }
);
onMounted(() => {
  void loadCurrentSection();
  void nextTick(() => updateChangeLayout(changeLayout.value));
  window.addEventListener('resize', handleChangeLayoutResize);
});
onBeforeUnmount(() => {
  hideChangeTooltip();
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
.tm-next-patch,
.tm-settings,
.tm-loading {
  width: calc(100% - clamp(2rem, 4vw, 6rem));
  max-width: none;
  margin-inline: auto;
}

.tm-grid,
.tm-dashboard,
.tm-next-patch,
.tm-settings,
.tm-loading {
  flex: 1 1 auto;
  min-height: 0;
}

.tm-dashboard {
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 0.25rem;
  scrollbar-gutter: stable;
}

.tm-settings {
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 1.25rem;
  scrollbar-gutter: stable;
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
  flex-wrap: nowrap;
  min-height: 2.95rem;
  border: 1px solid rgba(217, 164, 95, 0.34);
  border-radius: var(--tm-panel-radius);
  background:
    linear-gradient(90deg, rgba(217, 164, 95, 0.16), rgba(85, 183, 255, 0.08) 52%, transparent),
    rgba(7, 10, 11, 0.94);
  margin-bottom: 0.75rem;
  padding: 0.28rem;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 231, 190, 0.08),
    0 10px 24px rgba(0, 0, 0, 0.24);
}

.tm-subnav::-webkit-scrollbar {
  display: none;
}

.tm-subnav__item {
  position: relative;
  color: #d9cfbd;
  text-decoration: none;
  height: 2.38rem;
  padding: 0 1rem;
  border: 1px solid transparent;
  border-radius: var(--tm-control-radius);
  display: inline-flex;
  align-items: center;
  gap: 0.58rem;
  flex: 0 0 auto;
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
  overflow: hidden;
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

.tm-subnav__counter {
  position: absolute;
  top: 0.22rem;
  right: 0.28rem;
  min-width: 1.2rem;
  height: 1.2rem;
  display: inline-grid;
  place-items: center;
  padding: 0 0.28rem;
  border: 1px solid rgba(255, 231, 190, 0.36);
  border-radius: 999px;
  color: #fff3dd;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 72%), rgba(104, 38, 25, 0.96);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.38),
    0 4px 10px rgba(0, 0, 0, 0.24);
  font-size: 0.66rem;
  font-weight: 900;
  line-height: 1;
  transform: translate(42%, -42%);
}

.tm-subnav__item--active .tm-subnav__counter {
  color: #2c120a;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 72%), #f0c06b;
}

.tm-grid {
  display: grid;
  gap: 1rem;
}

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

.tm-table small,
.tm-panel p,
.tm-change-card small {
  color: var(--tm-muted);
}

.tm-grid--dashboard {
  grid-template-columns: minmax(0, 2fr) minmax(22rem, 1fr);
  flex: 0 0 auto;
  width: 100%;
  min-height: 0;
  overflow: visible;
  align-items: start;
}

.tm-grid--dashboard > .tm-stack {
  height: auto;
  grid-template-rows: auto auto;
  align-content: start;
  overflow: visible;
}

.tm-grid--dashboard > .tm-stack > .tm-panel:last-child {
  display: flex;
  flex-direction: column;
}

.tm-grid--changes {
  grid-template-columns:
    minmax(var(--tm-change-left-min-width, 22rem), var(--tm-change-left-width, 26.5rem))
    var(--tm-change-splitter-width, 1rem)
    minmax(0, 1fr) var(--tm-change-splitter-width, 1rem)
    minmax(0, var(--tm-change-right-width, 22rem));
  gap: 0;
  align-items: stretch;
  min-width: 0;
  overflow: hidden;
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
  overflow: hidden;
}

.tm-grid--users > .tm-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.tm-grid--users > .tm-stack {
  overflow: auto;
  scrollbar-gutter: stable;
}

.tm-grid--users .tm-table {
  min-height: 0;
  overflow: auto;
  padding-bottom: 0.1rem;
}

.tm-grid--users .tm-table__head,
.tm-grid--users .tm-table__row {
  min-width: 48rem;
}

.tm-next-patch {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tm-next-patch-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 1rem;
  height: 100%;
  overflow: hidden;
}

.tm-panel__header.tm-next-patch__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 28rem) minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  margin-bottom: 0;
}

.tm-next-patch__header p {
  margin: 0.28rem 0 0;
}

.tm-next-patch__intro {
  min-width: 0;
}

.tm-next-patch-progress {
  width: 100%;
  min-width: 0;
  justify-self: center;
  display: grid;
  gap: 0.4rem;
  padding: 0.65rem 0.82rem;
  border: 1px solid rgba(84, 202, 137, 0.26);
  border-radius: 0.85rem;
  background:
    radial-gradient(circle at 16% 0%, rgba(84, 202, 137, 0.16), transparent 8rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 72%),
    rgba(3, 13, 11, 0.64);
  box-shadow:
    inset 0 1px 0 rgba(214, 255, 226, 0.08),
    0 12px 26px rgba(0, 0, 0, 0.18);
}

.tm-next-patch-progress__header,
.tm-next-patch-progress__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.tm-next-patch-progress__header span {
  color: rgba(228, 239, 224, 0.78);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tm-next-patch-progress__header strong {
  color: #eaffd7;
  font-size: 0.98rem;
  line-height: 1;
  text-shadow: 0 0 16px rgba(84, 202, 137, 0.34);
}

.tm-next-patch-progress__track {
  position: relative;
  height: 0.62rem;
  overflow: hidden;
  border: 1px solid rgba(198, 232, 196, 0.16);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent),
    rgba(0, 0, 0, 0.34);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.54);
}

.tm-next-patch-progress__track span {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  background:
    linear-gradient(90deg, rgba(72, 187, 120, 0.92), rgba(194, 244, 113, 0.95)),
    #58d68d;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.32),
    0 0 18px rgba(99, 220, 132, 0.36);
  transition: width 0.25s ease;
}

.tm-next-patch-progress__footer span {
  min-width: 0;
  color: rgba(226, 236, 216, 0.72);
  font-size: 0.72rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-next-patch-progress--empty {
  border-color: rgba(213, 196, 164, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 72%),
    rgba(9, 10, 9, 0.62);
}

.tm-next-patch-progress--empty .tm-next-patch-progress__header strong {
  color: rgba(236, 226, 209, 0.78);
  text-shadow: none;
}

.tm-next-patch__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.tm-next-patch-needs-action {
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;
  min-height: 2.28rem;
  padding: 0.28rem 0.72rem 0.28rem 0.34rem;
  border: 1px solid rgba(213, 196, 164, 0.16);
  border-radius: 999px;
  color: rgba(236, 226, 209, 0.82);
  background: rgba(255, 255, 255, 0.018);
  font-size: 0.76rem;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.tm-next-patch-needs-action input {
  appearance: none;
  position: relative;
  width: 2.28rem;
  height: 1.28rem;
  margin: 0;
  border: 1px solid rgba(213, 196, 164, 0.24);
  border-radius: 999px;
  background: rgba(5, 9, 12, 0.74);
  box-shadow: inset 0 0 0 1px rgba(2, 6, 12, 0.4);
  cursor: inherit;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.tm-next-patch-needs-action input::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0.2rem;
  width: 0.78rem;
  height: 0.78rem;
  border-radius: 50%;
  background: rgba(213, 196, 164, 0.78);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  transform: translateY(-50%);
  transition:
    left 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.tm-next-patch-needs-action input:checked {
  border-color: rgba(217, 164, 95, 0.72);
  background: rgba(217, 164, 95, 0.18);
}

.tm-next-patch-needs-action input:checked::after {
  left: 1.18rem;
  background: #ffd38a;
  box-shadow: 0 0 12px rgba(217, 164, 95, 0.45);
}

.tm-next-patch-needs-action:has(input:focus-visible) {
  outline: 2px solid rgba(119, 201, 255, 0.62);
  outline-offset: 3px;
}

.tm-next-patch-view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.16rem;
  padding: 0.18rem;
  border: 1px solid rgba(217, 164, 95, 0.26);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 84%), rgba(4, 8, 9, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 231, 190, 0.06);
}

.tm-next-patch-view-toggle button {
  min-height: 2rem;
  padding: 0 0.8rem;
  border: 1px solid transparent;
  border-radius: 999px;
  color: rgba(232, 221, 206, 0.76);
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-next-patch-view-toggle button:hover,
.tm-next-patch-view-toggle button:focus-visible {
  color: #fff0cf;
  border-color: rgba(217, 164, 95, 0.24);
  background: rgba(217, 164, 95, 0.08);
}

.tm-next-patch-view-toggle__button--active {
  color: #1d1307 !important;
  border-color: rgba(255, 231, 190, 0.34) !important;
  background: var(--tm-gold) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 6px 14px rgba(0, 0, 0, 0.24);
}

.tm-next-patch-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.72rem;
}

.tm-next-patch-stats article {
  min-width: 0;
  display: grid;
  gap: 0.16rem;
  padding: 0.78rem 0.85rem;
  border: 1px solid rgba(213, 196, 164, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent), rgba(2, 6, 8, 0.44);
  box-shadow: inset 0 1px 0 rgba(255, 231, 190, 0.045);
}

.tm-next-patch-stats span {
  color: var(--tm-gold);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tm-next-patch-stats strong {
  color: #f8ead1;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.85rem;
  line-height: 1;
}

.tm-next-patch-stats small {
  color: var(--tm-muted);
  font-size: 0.78rem;
}

.tm-next-patch-reset-strip {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  margin-top: -0.18rem;
  color: rgba(207, 194, 174, 0.74);
  font-size: 0.74rem;
  font-weight: 800;
}

.tm-next-patch-reset-strip__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  min-width: 0;
}

.tm-next-patch-reset-strip__actions > span {
  color: rgba(207, 194, 174, 0.7);
}

.tm-next-patch-notes-button {
  --patch-notes-accent: #a78bfa;
  min-height: 2.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.44rem;
  padding: 0.36rem 0.72rem 0.36rem 0.44rem;
  border: 1px solid color-mix(in srgb, var(--patch-notes-accent) 42%, rgba(213, 196, 164, 0.12));
  border-radius: 999px;
  color: #efe7ff;
  background:
    radial-gradient(circle at 16% 0%, rgba(167, 139, 250, 0.24), transparent 5.5rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 78%),
    rgba(42, 27, 79, 0.38);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 22px rgba(15, 10, 30, 0.2);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.01em;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-next-patch-notes-button:hover,
.tm-next-patch-notes-button:focus-visible {
  color: #ffffff;
  border-color: color-mix(in srgb, var(--patch-notes-accent) 68%, rgba(255, 255, 255, 0.16));
  background:
    radial-gradient(circle at 16% 0%, rgba(167, 139, 250, 0.32), transparent 5.8rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.095), transparent 78%),
    rgba(55, 36, 99, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 12px 24px rgba(15, 10, 30, 0.24),
    0 0 18px rgba(167, 139, 250, 0.16);
  transform: translateY(-1px);
}

.tm-next-patch-notes-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.tm-next-patch-notes-button__icon {
  width: 1.32rem;
  height: 1.32rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(221, 214, 254, 0.22);
  border-radius: 50%;
  color: #ddd6fe;
  background: rgba(167, 139, 250, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.tm-next-patch-notes-button__icon svg {
  width: 0.88rem;
  height: 0.88rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-next-patch-reset-button {
  min-height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.34rem;
  padding: 0.34rem 0.62rem;
  border: 1px solid rgba(255, 107, 85, 0.36);
  border-radius: 999px;
  color: rgba(255, 216, 210, 0.92);
  background: rgba(106, 35, 27, 0.28);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease;
}

.tm-next-patch-reset-button:hover,
.tm-next-patch-reset-button:focus-visible {
  color: #ffe6e1;
  border-color: rgba(255, 107, 85, 0.58);
  background: rgba(106, 35, 27, 0.44);
  transform: translateY(-1px);
}

.tm-next-patch-reset-button:disabled {
  opacity: 0.48;
  cursor: default;
  transform: none;
}

.tm-next-patch-list {
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 0.48rem;
  min-height: 0;
  overflow: auto;
  padding-right: 0.25rem;
}

.tm-next-patch-loading {
  min-height: 8rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(213, 196, 164, 0.16);
  border-radius: 6px;
  color: var(--tm-muted);
  background: rgba(255, 255, 255, 0.014);
  font-size: 0.86rem;
  font-weight: 800;
}

.tm-next-patch-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(18rem, 1.45fr) minmax(13rem, 0.85fr) auto auto;
  gap: 0.68rem;
  align-items: center;
  min-height: 4.15rem;
  padding: 0.56rem 0.68rem;
  border: 1px solid var(--tm-border-soft);
  border-left: 3px solid rgba(114, 214, 111, 0.72);
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(114, 214, 111, 0.075), rgba(85, 183, 255, 0.025)),
    rgba(255, 255, 255, 0.014);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.tm-next-patch-card--auto-close {
  min-height: 4.7rem;
  padding-bottom: 1.06rem;
}

.tm-next-patch-card__main {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.62rem;
  align-items: center;
  color: inherit;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.tm-next-patch-card__main strong,
.tm-next-patch-card__main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-next-patch-card__main strong {
  color: #fff3dd;
  font-size: 0.93rem;
  line-height: 1.15;
}

.tm-next-patch-card__main small {
  color: var(--tm-muted);
  margin-top: 0.1rem;
  font-size: 0.78rem;
}

.tm-next-patch-card__main:hover strong,
.tm-next-patch-card__main:focus-visible strong {
  color: #ffffff;
}

.tm-next-patch-card__main:focus-visible {
  outline: 2px solid rgba(119, 201, 255, 0.62);
  outline-offset: 3px;
}

.tm-next-patch-card__meta,
.tm-next-patch-card__quality {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  color: var(--tm-muted);
  font-size: 0.74rem;
}

.tm-next-patch-card__meta {
  gap: 0.44rem;
  min-width: 0;
  padding: 0.18rem 0.2rem;
  border-radius: 999px;
}

.tm-next-patch-card__build,
.tm-next-patch-card__time {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: rgba(214, 207, 196, 0.76);
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
}

.tm-next-patch-card__build {
  color: rgba(231, 220, 204, 0.86);
}

.tm-next-patch-card__time::before {
  content: '';
  width: 0.28rem;
  height: 0.28rem;
  margin-right: 0.44rem;
  border-radius: 50%;
  background: rgba(217, 164, 95, 0.48);
  box-shadow: 0 0 8px rgba(217, 164, 95, 0.12);
}

.tm-next-patch-card__auto-close {
  position: absolute;
  left: 6.55rem;
  bottom: 0.54rem;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.42rem;
  width: min(14rem, calc(100% - 34rem));
  min-width: 8rem;
  min-height: 0.46rem;
  padding: 0 0.28rem;
  border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
  border-radius: 999px;
  color: #d9f1ff;
  background:
    linear-gradient(180deg, rgba(6, 12, 18, 0.56), rgba(3, 8, 12, 0.42)),
    rgba(85, 183, 255, 0.04);
  font-size: 0.54rem;
  font-weight: 850;
  line-height: 1;
  text-transform: uppercase;
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(56, 189, 248, 0.42),
    rgba(125, 211, 252, 0.24)
  );
}

.tm-next-patch-card__auto-close::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: var(--auto-close-progress, 0%);
  max-width: 100%;
  background: var(--auto-close-fill);
  border-right: 1px solid rgba(224, 242, 254, 0.22);
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.18);
  transition: width 0.28s ease;
}

.tm-next-patch-card__auto-close > span,
.tm-next-patch-card__auto-close strong {
  position: relative;
  z-index: 1;
  opacity: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.72);
  transition: opacity 0.14s ease;
}

.tm-next-patch-card:hover .tm-next-patch-card__auto-close > span,
.tm-next-patch-card:hover .tm-next-patch-card__auto-close strong,
.tm-next-patch-card__auto-close:focus-visible > span,
.tm-next-patch-card__auto-close:focus-visible strong {
  opacity: 1;
}

.tm-next-patch-card__auto-close strong {
  color: currentColor;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.64rem;
  line-height: 1;
}

.tm-next-patch-card__auto-close--ready,
.tm-next-patch-card__auto-close--closed {
  color: #e7ffe3;
  background:
    linear-gradient(180deg, rgba(5, 14, 9, 0.34), rgba(3, 10, 6, 0.18)),
    rgba(114, 214, 111, 0.07);
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(34, 197, 94, 0.44),
    rgba(134, 239, 172, 0.26)
  );
}

.tm-next-patch-card__auto-close--blocked {
  color: #ffe3de;
  background:
    linear-gradient(180deg, rgba(18, 6, 5, 0.34), rgba(12, 4, 3, 0.18)),
    rgba(255, 107, 85, 0.08);
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(248, 113, 113, 0.38),
    rgba(252, 165, 165, 0.22)
  );
}

.tm-next-patch-card__quality {
  gap: 0.34rem;
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.tm-next-patch-card__quality span {
  min-width: 3.9rem;
  display: grid;
  justify-items: center;
  gap: 0.08rem;
  padding: 0.34rem 0.42rem;
  border: 1px solid rgba(114, 214, 111, 0.28);
  border-radius: 6px;
  color: #bfeec0;
  background: rgba(18, 58, 25, 0.28);
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  line-height: 1.05;
}

.tm-next-patch-card__quality strong {
  color: #e2ffdf;
  font-size: 0.84rem;
  line-height: 1;
}

.tm-next-patch-card__remove {
  justify-self: end;
  min-height: 0;
  padding: 0.34rem 0.5rem;
  border-radius: 999px;
  font-size: 0.68rem;
  line-height: 1;
}

.tm-next-patch-empty {
  min-height: 18rem;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.65rem;
  border: 1px dashed rgba(213, 196, 164, 0.22);
  border-radius: 8px;
  color: var(--tm-muted);
  text-align: center;
  background: rgba(255, 255, 255, 0.018);
}

.tm-next-patch-empty > span {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border: 1px solid rgba(114, 214, 111, 0.42);
  border-radius: 50%;
  color: var(--tm-green);
  background: rgba(114, 214, 111, 0.1);
  font-size: 1.4rem;
}

.tm-next-patch-empty h3,
.tm-next-patch-empty p {
  margin: 0;
}

.tm-next-patch-empty h3 {
  color: #f4ead8;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.28rem;
}

.tm-patch-notes-modal {
  width: min(72rem, calc(100vw - 2rem));
  max-height: min(86vh, 56rem);
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  padding: 0;
  overflow: hidden;
  border-radius: 14px;
  border-color: rgba(167, 139, 250, 0.36);
  background:
    radial-gradient(circle at 16% 0%, rgba(167, 139, 250, 0.16), transparent 18rem),
    radial-gradient(circle at 76% 0%, rgba(68, 178, 255, 0.12), transparent 18rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    linear-gradient(180deg, rgba(19, 27, 43, 0.98), rgba(8, 11, 15, 0.98));
}

.tm-patch-notes-modal__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 1.25rem 1rem;
  border-bottom: 1px solid rgba(167, 139, 250, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent);
}

.tm-patch-notes-modal__title {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
}

.tm-patch-notes-modal__title h2,
.tm-patch-notes-modal__title p,
.tm-patch-notes-modal__title small {
  margin: 0;
}

.tm-patch-notes-modal__title h2 {
  color: #f8ead1;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.35rem, 2.2vw, 1.85rem);
  line-height: 1.05;
}

.tm-patch-notes-modal__title small {
  display: block;
  margin-top: 0.32rem;
  color: rgba(219, 211, 196, 0.74);
  font-size: 0.88rem;
}

.tm-patch-notes-modal__icon {
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(221, 214, 254, 0.28);
  border-radius: 12px;
  color: #ddd6fe;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.18), transparent 1.2rem),
    rgba(88, 58, 153, 0.34);
  box-shadow: 0 0 22px rgba(167, 139, 250, 0.16);
}

.tm-patch-notes-modal__icon svg {
  width: 1.34rem;
  height: 1.34rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-patch-notes-toolbar {
  display: grid;
  grid-template-columns: minmax(11rem, 13rem) minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: end;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 231, 190, 0.08);
}

.tm-patch-notes-start input {
  max-width: 10rem;
  font-size: 1rem;
  font-weight: 900;
}

.tm-patch-notes-toolbar__summary {
  min-height: 3.05rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 10px;
  background: rgba(167, 139, 250, 0.08);
}

.tm-patch-notes-toolbar__summary strong {
  color: #f8ead1;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.55rem;
  line-height: 1;
}

.tm-patch-notes-toolbar__summary span {
  color: rgba(219, 211, 196, 0.72);
  font-size: 0.82rem;
  font-weight: 800;
}

.tm-patch-notes-toolbar__actions,
.tm-patch-notes-footer__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.tm-patch-notes-list {
  min-height: 0;
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  overflow: auto;
}

.tm-patch-note-row {
  display: grid;
  grid-template-columns: 7.25rem minmax(0, 1fr);
  gap: 0.85rem;
  align-items: stretch;
  padding: 0.8rem;
  border: 1px solid rgba(123, 204, 139, 0.22);
  border-radius: 12px;
  background:
    linear-gradient(90deg, rgba(59, 169, 91, 0.13), transparent 35%),
    rgba(6, 14, 16, 0.56);
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    opacity 0.14s ease;
}

.tm-patch-note-row--excluded {
  border-color: rgba(255, 231, 190, 0.12);
  background: rgba(255, 255, 255, 0.035);
  opacity: 0.72;
}

.tm-patch-note-row__toggle {
  position: relative;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.48rem;
  min-height: 7.4rem;
  border: 1px solid rgba(255, 231, 190, 0.1);
  border-radius: 10px;
  color: #dff9df;
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  text-align: center;
}

.tm-patch-note-row__toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tm-patch-note-row__toggle span {
  width: 2.1rem;
  height: 2.1rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(123, 204, 139, 0.42);
  border-radius: 50%;
  background: rgba(42, 142, 65, 0.2);
}

.tm-patch-note-row__toggle span::after {
  content: '✓';
  color: #c8f7bd;
  font-size: 1.05rem;
  font-weight: 900;
}

.tm-patch-note-row__toggle input:not(:checked) + span {
  border-color: rgba(255, 231, 190, 0.18);
  background: rgba(255, 255, 255, 0.04);
}

.tm-patch-note-row__toggle input:not(:checked) + span::after {
  content: '–';
  color: rgba(219, 211, 196, 0.68);
}

.tm-patch-note-row__toggle strong {
  color: currentColor;
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-patch-note-row__body {
  min-width: 0;
  display: grid;
  gap: 0.65rem;
}

.tm-patch-note-row__meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.65rem;
  align-items: center;
}

.tm-patch-note-row__meta strong,
.tm-patch-note-row__meta small {
  display: block;
}

.tm-patch-note-row__meta strong {
  color: #fff7e8;
}

.tm-patch-note-row__meta small {
  color: rgba(219, 211, 196, 0.68);
  font-size: 0.78rem;
}

.tm-patch-note-row__number {
  min-width: 4.8rem;
  display: inline-grid;
  place-items: center;
  padding: 0.38rem 0.55rem;
  border: 1px solid rgba(167, 139, 250, 0.28);
  border-radius: 999px;
  color: #efe7ff;
  background: rgba(167, 139, 250, 0.12);
  font-size: 0.75rem;
  font-weight: 950;
}

.tm-patch-note-row textarea {
  width: 100%;
  min-height: 5.7rem;
  resize: vertical;
  border: 1px solid rgba(255, 231, 190, 0.14);
  border-radius: 10px;
  color: #fff7e8;
  background: rgba(3, 7, 10, 0.56);
  padding: 0.78rem 0.85rem;
  font: inherit;
  line-height: 1.45;
}

.tm-patch-note-row textarea:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.55);
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.14);
}

.tm-patch-notes-loading,
.tm-patch-notes-empty {
  min-height: 16rem;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.7rem;
  padding: 2rem;
  color: rgba(219, 211, 196, 0.76);
  text-align: center;
}

.tm-patch-notes-loading {
  grid-template-columns: auto minmax(0, 24rem);
}

.tm-patch-notes-loading > span {
  width: 2.3rem;
  height: 2.3rem;
  border: 3px solid rgba(167, 139, 250, 0.18);
  border-top-color: #ddd6fe;
  border-radius: 50%;
  animation: tm-spin 0.9s linear infinite;
}

.tm-patch-notes-loading strong,
.tm-patch-notes-empty strong {
  color: #fff7e8;
}

.tm-patch-notes-loading p,
.tm-patch-notes-empty p {
  margin: 0.28rem 0 0;
}

.tm-patch-notes-empty--error {
  color: rgba(255, 190, 177, 0.82);
}

.tm-patch-notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid rgba(255, 231, 190, 0.1);
  background: rgba(5, 8, 12, 0.68);
}

.tm-patch-notes-footer p {
  margin: 0;
  color: rgba(219, 211, 196, 0.72);
  font-size: 0.86rem;
}

.tm-patch-notes-copy {
  min-width: 10.5rem;
}

@keyframes tm-spin {
  to {
    transform: rotate(360deg);
  }
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

.tm-test-graph-panel {
  background:
    radial-gradient(circle at 18% 18%, rgba(85, 183, 255, 0.18), transparent 19rem),
    radial-gradient(circle at 82% 8%, rgba(217, 164, 95, 0.14), transparent 17rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 5px),
    linear-gradient(180deg, rgba(10, 18, 22, 0.98), rgba(5, 9, 10, 0.98));
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

.tm-state-graph__header {
  align-items: baseline;
}

.tm-state-graph__header > span {
  color: var(--tm-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-state-graph {
  display: grid;
  grid-template-rows: auto minmax(19rem, 1fr) auto auto;
  gap: 0.9rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.tm-state-graph__stats,
.tm-state-graph__legend,
.tm-state-graph__insights {
  display: grid;
  gap: 0.72rem;
  min-width: 0;
}

.tm-state-graph__stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tm-state-graph__stats article,
.tm-state-graph__legend article,
.tm-state-graph__insights article {
  min-width: 0;
  border: 1px solid rgba(213, 196, 164, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent), rgba(2, 6, 8, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 231, 190, 0.045);
}

.tm-state-graph__stats article {
  display: grid;
  gap: 0.18rem;
  padding: 0.72rem 0.8rem;
}

.tm-state-graph__stats span,
.tm-state-graph__insights span {
  color: var(--tm-gold);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tm-state-graph__stats strong {
  color: #f8ead1;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.45rem, 2vw, 2.05rem);
  line-height: 1;
}

.tm-state-graph__stats small,
.tm-state-graph__insights small {
  color: var(--tm-muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-state-graph__canvas {
  min-height: 0;
  border: 1px solid rgba(85, 183, 255, 0.17);
  background:
    radial-gradient(circle at 12% 8%, rgba(85, 183, 255, 0.13), transparent 14rem),
    radial-gradient(circle at 86% 18%, rgba(217, 164, 95, 0.1), transparent 15rem),
    linear-gradient(180deg, rgba(7, 16, 20, 0.94), rgba(3, 8, 10, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    inset 0 0 34px rgba(85, 183, 255, 0.07);
}

.tm-state-graph__canvas svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 19rem;
}

.tm-state-graph__grid line,
.tm-state-graph__axis line {
  stroke: rgba(213, 196, 164, 0.13);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.tm-state-graph__grid text,
.tm-state-graph__axis text {
  fill: rgba(188, 178, 164, 0.78);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-anchor: middle;
  text-transform: uppercase;
}

.tm-state-graph__grid text {
  text-anchor: end;
}

.tm-state-graph__area {
  opacity: 0.08;
}

.tm-state-graph__line,
.tm-state-graph__line-rail {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.tm-state-graph__line-rail {
  stroke: rgba(2, 8, 12, 0.72);
  stroke-width: 7.5;
}

.tm-state-graph__line {
  stroke-width: 3.75;
  filter: url('#tm-state-line-glow');
}

.tm-state-graph__point {
  stroke: rgba(4, 8, 10, 0.92);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.tm-state-graph__legend {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tm-state-graph__legend article {
  --tm-state-color: var(--tm-blue);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.66rem 0.75rem;
}

.tm-state-graph__legend article > span {
  width: 0.72rem;
  aspect-ratio: 1;
  border-radius: 999px;
  background: var(--tm-state-color);
  box-shadow: 0 0 16px var(--tm-state-color);
}

.tm-state-graph__legend div {
  min-width: 0;
}

.tm-state-graph__legend strong {
  display: block;
  color: #f5e8c9;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-state-graph__legend em {
  min-width: 2rem;
  padding: 0.15rem 0.38rem;
  border: 1px solid color-mix(in srgb, var(--tm-state-color) 46%, transparent);
  color: #f8ead1;
  font-style: normal;
  font-weight: 800;
  text-align: center;
  background: rgba(0, 0, 0, 0.22);
}

.tm-state-graph__insights {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.tm-state-graph__insights article {
  display: grid;
  gap: 0.18rem;
  padding: 0.72rem 0.8rem;
}

.tm-state-graph__insights strong {
  color: #f8ead1;
  font-size: 1rem;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.tm-table-action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
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

.tm-user-role {
  font-weight: 850;
}

.tm-user-role--admin {
  color: #ff9d5c !important;
  text-shadow: 0 0 12px rgba(255, 157, 92, 0.18);
}

.tm-user-role--guide {
  color: #a7eba0 !important;
  text-shadow: 0 0 12px rgba(167, 235, 160, 0.14);
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
  border-color: rgba(173, 154, 118, 0.38);
  background:
    linear-gradient(135deg, rgba(39, 42, 41, 0.96), rgba(8, 13, 14, 0.98) 54%),
    linear-gradient(180deg, rgba(34, 38, 38, 0.96), rgba(5, 7, 8, 0.98));
  color: #ece5d8;
  font-weight: 800;
  letter-spacing: 0;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.75),
    0 10px 22px rgba(0, 0, 0, 0.32);
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
  border: 1px solid rgba(228, 211, 175, 0.07);
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
  background: linear-gradient(90deg, transparent, rgba(228, 211, 175, 0.1), transparent);
  transform: skewX(-18deg);
  transition: left 0.2s ease;
  pointer-events: none;
}

.tm-create-trigger:hover {
  border-color: rgba(217, 164, 95, 0.62);
  background:
    linear-gradient(135deg, rgba(52, 49, 40, 0.98), rgba(11, 16, 17, 0.98) 54%),
    linear-gradient(180deg, rgba(42, 43, 39, 0.98), rgba(7, 8, 8, 1));
  color: #fff3d8;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.82),
    0 14px 28px rgba(0, 0, 0, 0.4),
    0 0 18px rgba(217, 164, 95, 0.12);
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
  color: #f0c77e;
  background:
    linear-gradient(180deg, rgba(46, 40, 30, 0.96), rgba(11, 13, 13, 0.98)), rgba(0, 0, 0, 0.48);
  border: 1px solid rgba(217, 164, 95, 0.32);
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 186, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.42);
  transition:
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease;
}

.tm-create-trigger:hover .tm-create-trigger__icon {
  color: #fff3d6;
  background:
    linear-gradient(180deg, rgba(66, 52, 32, 0.98), rgba(12, 13, 13, 1)), rgba(0, 0, 0, 0.48);
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
  outline: 2px solid rgba(217, 164, 95, 0.58);
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

.tm-patch-toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.12rem 0.62rem;
  align-items: center;
  padding: 0.72rem 0.8rem;
  border: 1px solid rgba(217, 164, 95, 0.24);
  border-radius: var(--tm-control-radius);
  background:
    linear-gradient(135deg, rgba(217, 164, 95, 0.09), rgba(85, 183, 255, 0.035)),
    rgba(3, 6, 7, 0.42);
  cursor: pointer;
}

.tm-patch-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tm-patch-toggle > span {
  grid-row: 1 / span 2;
  width: 2.55rem;
  height: 1.38rem;
  border: 1px solid rgba(207, 194, 174, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  position: relative;
  transition:
    border-color 0.14s ease,
    background 0.14s ease;
}

.tm-patch-toggle > span::after {
  content: '';
  position: absolute;
  top: 0.18rem;
  left: 0.2rem;
  width: 0.88rem;
  height: 0.88rem;
  border-radius: 50%;
  background: rgba(232, 221, 206, 0.78);
  transition:
    left 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-patch-toggle input:checked + span {
  border-color: rgba(114, 214, 111, 0.6);
  background: rgba(114, 214, 111, 0.18);
}

.tm-patch-toggle input:checked + span::after {
  left: 1.32rem;
  background: var(--tm-green);
  box-shadow: 0 0 12px rgba(114, 214, 111, 0.32);
}

.tm-patch-toggle input:focus-visible + span {
  outline: 2px solid rgba(119, 201, 255, 0.62);
  outline-offset: 3px;
}

.tm-patch-toggle strong {
  color: #f8ead1;
}

.tm-patch-toggle small {
  color: var(--tm-muted);
}

.tm-auto-close-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7rem, 9rem);
  gap: 0.7rem;
  align-items: center;
  padding: 0.82rem;
  border: 1px solid rgba(85, 183, 255, 0.22);
  border-radius: var(--tm-control-radius);
  background:
    linear-gradient(135deg, rgba(85, 183, 255, 0.075), rgba(114, 214, 111, 0.035)),
    rgba(3, 6, 7, 0.42);
}

.tm-auto-close-control--ready {
  border-color: rgba(114, 214, 111, 0.42);
  background:
    linear-gradient(135deg, rgba(114, 214, 111, 0.11), rgba(85, 183, 255, 0.04)),
    rgba(3, 6, 7, 0.42);
}

.tm-auto-close-control--blocked {
  border-color: rgba(255, 107, 85, 0.38);
  background:
    linear-gradient(135deg, rgba(255, 107, 85, 0.12), rgba(217, 164, 95, 0.045)),
    rgba(3, 6, 7, 0.42);
}

.tm-auto-close-control__header {
  display: grid;
  grid-template-columns: 2.2rem minmax(0, 1fr);
  gap: 0.68rem;
  align-items: center;
  min-width: 0;
}

.tm-auto-close-control__header > span {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid rgba(85, 183, 255, 0.3);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #bfe8ff;
  background: rgba(85, 183, 255, 0.08);
  font-weight: 900;
}

.tm-auto-close-control__header strong {
  display: block;
  color: #f8ead1;
}

.tm-auto-close-control__header small,
.tm-auto-close-control p {
  color: var(--tm-muted);
}

.tm-auto-close-control p {
  grid-column: 1 / -1;
  margin: -0.28rem 0 0;
  font-size: 0.76rem;
}

.tm-auto-close-control__input {
  display: grid;
  gap: 0.3rem;
}

.tm-auto-close-control__input span {
  color: var(--tm-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-auto-close-control__input input {
  width: 100%;
  border: 1px solid rgba(85, 183, 255, 0.28);
  border-radius: var(--tm-control-radius);
  background: rgba(3, 6, 7, 0.74);
  color: #eef7ff;
  padding: 0.58rem 0.68rem;
  font: inherit;
  font-size: 1rem;
  font-weight: 850;
}

.tm-auto-close-control__input input:focus-visible {
  outline: 2px solid rgba(119, 201, 255, 0.62);
  outline-offset: 2px;
}

.tm-auto-close-control__meter {
  grid-column: 1 / -1;
  height: 0.42rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.tm-auto-close-control__meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(85, 183, 255, 0.7), rgba(114, 214, 111, 0.82));
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
  min-width: var(--tm-change-left-min-width, 22rem);
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
  cursor: pointer;
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

.tm-change-card:focus-within,
.tm-change-card:focus-visible {
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

.tm-change-tooltip {
  position: fixed;
  z-index: 10050;
  width: min(22rem, calc(100vw - 1.5rem));
  max-height: min(24rem, calc(100vh - 1.5rem));
  overflow: hidden;
  pointer-events: none;
  padding: 0.85rem;
  border: 1px solid rgba(217, 164, 95, 0.44);
  border-radius: var(--tm-button-radius);
  color: var(--tm-text);
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 183, 255, 0.12), transparent 12rem),
    linear-gradient(180deg, rgba(17, 23, 23, 0.98), rgba(6, 9, 10, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(255, 231, 190, 0.05),
    0 18px 42px rgba(0, 0, 0, 0.46),
    0 0 24px rgba(85, 183, 255, 0.12);
}

.tm-change-tooltip::before {
  content: '';
  position: absolute;
  top: 1.2rem;
  left: -0.42rem;
  width: 0.72rem;
  height: 0.72rem;
  border-left: 1px solid rgba(217, 164, 95, 0.44);
  border-bottom: 1px solid rgba(217, 164, 95, 0.44);
  background: rgba(17, 23, 23, 0.98);
  transform: rotate(45deg);
}

.tm-change-tooltip header {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
}

.tm-change-tooltip .tm-priority {
  min-width: 0;
  padding-inline: 0.6rem;
}

.tm-change-tooltip h3 {
  margin: 0;
  color: #fff3dd;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.08rem;
  line-height: 1.15;
}

.tm-change-tooltip header p {
  margin: 0.18rem 0 0;
  color: var(--tm-muted);
  font-size: 0.78rem;
}

.tm-change-tooltip__description {
  margin: 0.85rem 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 7;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #eadfce;
  font-size: 0.88rem;
  line-height: 1.42;
}

.tm-change-tooltip__meta {
  margin: 0.9rem 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.tm-change-tooltip__meta div {
  min-width: 0;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.025);
}

.tm-change-tooltip__meta dt,
.tm-change-tooltip__meta dd {
  margin: 0;
}

.tm-change-tooltip__meta dt {
  color: var(--tm-muted);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-change-tooltip__meta dd {
  margin-top: 0.12rem;
  overflow: hidden;
  color: #f4ead8;
  font-size: 0.83rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.tm-dot--coverage-uncovered {
  background: rgba(255, 255, 255, 0.24);
}

.tm-dot--viewer-testing,
.tm-dot--viewer-passed,
.tm-dot--viewer-done {
  background: var(--tm-green);
}

.tm-dot--viewer-closed {
  background: #b88cff;
  box-shadow: 0 0 10px rgba(184, 140, 255, 0.35);
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
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease,
    color 0.12s ease;
}

.tm-change-card:hover .tm-change-status-counters,
.tm-change-card:focus-visible .tm-change-status-counters {
  border-color: rgba(135, 177, 199, 0.54);
  color: #e5f0f5;
  background: rgba(13, 34, 45, 0.88);
  transform: translateY(-1px);
}

.tm-change-card:focus-visible {
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

.tm-change-card__auto-close {
  grid-column: 1 / -1;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.32rem;
  padding: 0.34rem 0.48rem;
  border: 1px solid color-mix(in srgb, currentColor 36%, transparent);
  border-radius: 0.48rem;
  color: #d9f1ff;
  background:
    linear-gradient(180deg, rgba(6, 12, 18, 0.32), rgba(3, 8, 12, 0.16)),
    rgba(85, 183, 255, 0.055);
  font-size: 0.68rem;
  font-weight: 850;
  box-shadow: inset 0 0 0 1px rgba(2, 6, 12, 0.28);
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(56, 189, 248, 0.42),
    rgba(125, 211, 252, 0.24)
  );
}

.tm-change-card__auto-close::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 0;
  width: var(--auto-close-progress, 0%);
  min-width: 0;
  background: var(--auto-close-fill);
  border-right: 1px solid rgba(224, 242, 254, 0.26);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.2);
  transition: width 0.28s ease;
}

.tm-change-card__auto-close > span,
.tm-change-card__auto-close strong {
  position: relative;
  z-index: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.72);
}

.tm-change-card__auto-close strong {
  display: inline;
  color: currentColor;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.86rem;
}

.tm-change-card__auto-close--ready,
.tm-change-card__auto-close--closed {
  color: #e7ffe3;
  background:
    linear-gradient(180deg, rgba(5, 14, 9, 0.34), rgba(3, 10, 6, 0.18)),
    rgba(114, 214, 111, 0.07);
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(34, 197, 94, 0.44),
    rgba(134, 239, 172, 0.26)
  );
}

.tm-change-card__auto-close--blocked {
  color: #ffe3de;
  background:
    linear-gradient(180deg, rgba(18, 6, 5, 0.34), rgba(12, 4, 3, 0.18)),
    rgba(255, 107, 85, 0.08);
  --auto-close-fill: linear-gradient(
    90deg,
    rgba(248, 113, 113, 0.38),
    rgba(252, 165, 165, 0.22)
  );
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

.tm-viewer-status--closed {
  color: #d8c4ff;
  border-color: rgba(184, 140, 255, 0.42);
  background: rgba(126, 74, 210, 0.18);
  box-shadow: inset 0 0 0 1px rgba(184, 140, 255, 0.08);
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
  margin: 0;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-detail__kicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.18rem 0 0.45rem;
}

.tm-detail__kicker .tm-status {
  min-width: 0;
  padding: 0.18rem 0.48rem;
  border-color: color-mix(in srgb, currentColor 36%, transparent);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 75%), rgba(255, 255, 255, 0.035);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tm-auto-close-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 1.5rem;
  padding: 0.18rem 0.52rem;
  border: 1px solid color-mix(in srgb, currentColor 34%, transparent);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--tm-muted);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tm-auto-close-badge svg {
  width: 0.86rem;
  height: 0.86rem;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
}

.tm-auto-close-badge--armed {
  color: #9ed8ff;
  background: rgba(85, 183, 255, 0.08);
}

.tm-auto-close-badge--ready,
.tm-auto-close-badge--closed {
  color: #a8efa2;
  background: rgba(114, 214, 111, 0.09);
}

.tm-auto-close-badge--blocked {
  color: #ffb1a4;
  background: rgba(255, 107, 85, 0.1);
}

.tm-auto-close-badge--disabled {
  color: rgba(188, 178, 164, 0.7);
}

.tm-readiness-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 1.5rem;
  padding: 0.18rem 0.52rem;
  border: 1px solid color-mix(in srgb, currentColor 32%, transparent);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 76%),
    rgba(255, 255, 255, 0.035);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tm-readiness-badge svg {
  width: 0.86rem;
  height: 0.86rem;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.tm-readiness-badge--not-ready {
  color: #ffd38a;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 76%),
    rgba(217, 164, 95, 0.09);
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

.tm-github-pr-badge {
  --github-tone: #2da44e;
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  padding: 0.34rem 0.58rem;
  border: 1px solid color-mix(in srgb, var(--github-tone) 58%, transparent);
  border-radius: 999px;
  color: #f0f6fc;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 74%), rgba(36, 41, 47, 0.82);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 8px 18px rgba(0, 0, 0, 0.2);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1;
  text-decoration: none;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
}

.tm-github-pr-badge svg,
.tm-github-pr-panel svg {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}

.tm-github-pr-badge span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-github-pr-badge:hover,
.tm-github-pr-badge:focus-visible {
  color: #ffffff;
  border-color: var(--github-tone);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.26),
    0 0 0 1px color-mix(in srgb, var(--github-tone) 36%, transparent);
  transform: translateY(-1px);
}

.tm-github-pr-badge:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--github-tone) 58%, transparent);
  outline-offset: 2px;
}

.tm-github-link-group {
  display: inline-flex;
  align-items: stretch;
  width: fit-content;
  max-width: 100%;
}

.tm-github-link-group--header {
  margin-top: 0.65rem;
}

.tm-github-link-group .tm-github-pr-badge {
  margin-top: 0;
}

.tm-github-link-group--split .tm-github-pr-badge {
  border-radius: 0;
}

.tm-github-link-group--split .tm-github-pr-badge:first-child {
  border-top-left-radius: 999px;
  border-bottom-left-radius: 999px;
}

.tm-github-link-group--split .tm-github-pr-badge:last-child {
  border-top-right-radius: 999px;
  border-bottom-right-radius: 999px;
}

.tm-github-link-group--split .tm-github-pr-badge + .tm-github-pr-badge {
  margin-left: -1px;
}

.tm-github-pr-badge--header {
  margin-top: 0.65rem;
}

.tm-github-pr-panel {
  --github-tone: #2da44e;
  display: grid;
  gap: 0.82rem;
  padding: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--github-tone) 42%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--github-tone) 12%, transparent), transparent),
    rgba(13, 17, 23, 0.74);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 12px 28px rgba(0, 0, 0, 0.22);
}

.tm-github-pr-badge--merged,
.tm-github-pr-panel--merged {
  --github-tone: #8250df;
}

.tm-github-pr-badge--completed,
.tm-github-pr-panel--completed {
  --github-tone: #8250df;
}

.tm-github-pr-badge--closed,
.tm-github-pr-panel--closed {
  --github-tone: #cf222e;
}

.tm-github-pr-badge--draft,
.tm-github-pr-panel--draft {
  --github-tone: #6e7781;
}

.tm-github-pr-badge--unavailable,
.tm-github-pr-panel--unavailable {
  --github-tone: #d29922;
}

.tm-github-pr-panel__brand,
.tm-github-pr-panel__body,
.tm-github-pr-panel__metrics,
.tm-github-pr-panel__labels {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.tm-github-pr-panel__brand {
  justify-content: space-between;
  color: #f0f6fc;
}

.tm-github-pr-panel__brand span {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  font-size: 0.74rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-github-pr-panel__brand strong {
  padding: 0.24rem 0.48rem;
  border-radius: 999px;
  color: #ffffff;
  background: color-mix(in srgb, var(--github-tone) 74%, #000 26%);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.tm-github-pr-panel__body {
  justify-content: space-between;
  align-items: flex-start;
}

.tm-github-pr-panel__body > div:first-child {
  min-width: 0;
}

.tm-github-pr-panel__body a {
  display: block;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 850;
  line-height: 1.24;
  text-decoration: none;
}

.tm-github-pr-panel__body a:hover,
.tm-github-pr-panel__body a:focus-visible {
  color: #79c0ff;
  text-decoration: underline;
}

.tm-github-pr-panel__body p,
.tm-github-pr-panel__message {
  margin: 0.25rem 0 0;
  color: rgba(201, 209, 217, 0.78);
  font-size: 0.82rem;
}

.tm-github-pr-panel__merged {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.72rem;
  padding: 0.48rem 0.62rem;
  border: 1px solid color-mix(in srgb, var(--github-tone) 42%, transparent);
  border-radius: 8px;
  color: #f5f0ff;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 82%),
    color-mix(in srgb, var(--github-tone) 18%, rgba(1, 4, 9, 0.48));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    0 0 18px color-mix(in srgb, var(--github-tone) 16%, transparent);
}

.tm-github-pr-panel__merged-icon {
  width: 1.35rem;
  aspect-ratio: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #ffffff;
  background: color-mix(in srgb, var(--github-tone) 78%, #000 22%);
}

.tm-github-pr-panel__merged-icon::before {
  content: '';
  width: 0.48rem;
  height: 0.26rem;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: translateY(-0.04rem) rotate(-45deg);
}

.tm-github-pr-panel__merged div {
  display: grid;
  gap: 0.1rem;
}

.tm-github-pr-panel__merged strong {
  color: #ffffff;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.tm-github-pr-panel__merged time {
  color: #f5f0ff;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1;
}

.tm-github-pr-panel__merged small {
  color: rgba(240, 246, 252, 0.68);
  font-size: 0.72rem;
  white-space: nowrap;
}

.tm-github-pr-panel__metrics {
  flex: 0 0 auto;
  align-items: stretch;
}

.tm-github-pr-panel__metrics span {
  min-width: 4.4rem;
  display: grid;
  gap: 0.18rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgba(240, 246, 252, 0.1);
  border-radius: 8px;
  color: rgba(201, 209, 217, 0.78);
  background: rgba(1, 4, 9, 0.34);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.tm-github-pr-panel__metrics strong {
  color: #f0f6fc;
  font-size: 0.95rem;
}

.tm-github-pr-panel__labels {
  flex-wrap: wrap;
}

.tm-github-pr-panel__labels span {
  padding: 0.22rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--label-color) 62%, transparent);
  border-radius: 999px;
  color: #f0f6fc;
  background: color-mix(in srgb, var(--label-color) 24%, transparent);
  font-size: 0.7rem;
  font-weight: 800;
}

.tm-github-links-panel__items {
  display: grid;
  gap: 0.7rem;
}

.tm-github-links-panel {
  --github-tone: #6e7781;
}

.tm-github-linked-record {
  --github-tone: #2da44e;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.65rem 0.9rem;
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--github-tone) 42%, rgba(240, 246, 252, 0.1));
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--github-tone) 14%, transparent), transparent),
    rgba(1, 4, 9, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 18px color-mix(in srgb, var(--github-tone) 8%, transparent);
}

.tm-github-linked-record--merged,
.tm-github-linked-record--completed {
  --github-tone: #8250df;
}

.tm-github-linked-record--closed {
  --github-tone: #cf222e;
}

.tm-github-linked-record--draft {
  --github-tone: #6e7781;
}

.tm-github-linked-record--unavailable {
  --github-tone: #d29922;
}

.tm-github-linked-record__body {
  min-width: 0;
}

.tm-github-linked-record__body small {
  display: block;
  margin-bottom: 0.22rem;
  color: #d9a45f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-github-linked-record__body a {
  display: block;
  overflow-wrap: anywhere;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 850;
  line-height: 1.24;
  text-decoration: none;
}

.tm-github-linked-record__body a:hover,
.tm-github-linked-record__body a:focus-visible {
  color: #79c0ff;
  text-decoration: underline;
}

.tm-github-linked-record__body p {
  margin: 0.25rem 0 0;
  color: rgba(201, 209, 217, 0.78);
  font-size: 0.82rem;
}

.tm-github-linked-record__actions {
  align-self: start;
  display: grid;
  justify-items: end;
  gap: 0.42rem;
}

.tm-github-linked-record__state {
  padding: 0.24rem 0.48rem;
  border-radius: 999px;
  color: #ffffff;
  background: color-mix(in srgb, var(--github-tone) 74%, #000 26%);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.tm-github-linked-record__open {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  min-height: 1.95rem;
  padding: 0.38rem 0.58rem;
  border: 1px solid color-mix(in srgb, var(--github-tone) 48%, rgba(240, 246, 252, 0.12));
  border-radius: 999px;
  color: #f0f6fc;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 78%),
    color-mix(in srgb, var(--github-tone) 22%, rgba(1, 4, 9, 0.72));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    0 8px 18px rgba(0, 0, 0, 0.16);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
}

.tm-github-linked-record__open svg {
  width: 0.95rem;
  height: 0.95rem;
  fill: currentColor;
}

.tm-github-linked-record__open:hover,
.tm-github-linked-record__open:focus-visible {
  color: #ffffff;
  border-color: color-mix(in srgb, var(--github-tone) 78%, rgba(240, 246, 252, 0.18));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.095), transparent 78%),
    color-mix(in srgb, var(--github-tone) 30%, rgba(1, 4, 9, 0.7));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.075),
    0 10px 22px rgba(0, 0, 0, 0.2),
    0 0 0 1px color-mix(in srgb, var(--github-tone) 24%, transparent);
  text-decoration: none;
  transform: translateY(-1px);
}

.tm-github-linked-record__open:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--github-tone) 56%, transparent);
  outline-offset: 2px;
}

.tm-github-linked-record .tm-github-pr-panel__metrics {
  grid-column: 1 / -1;
}

.tm-github-linked-record__footer {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  padding-top: 0.08rem;
}

.tm-github-linked-record__footer .tm-github-pr-panel__message {
  min-width: 0;
  margin-top: 0;
}

.tm-github-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.tm-detail__header p:not(.tm-id) {
  color: #cfc2ae;
}

.tm-detail__actions {
  align-self: stretch;
  min-width: 12.8rem;
  display: grid;
  justify-items: end;
  align-content: space-between;
  gap: 0.75rem;
}

.tm-detail__status-stack {
  align-self: start;
  display: grid;
  justify-items: end;
  gap: 0.5rem;
}

.tm-detail__actions .tm-status {
  align-self: start;
}

.tm-next-patch-toggle {
  --next-patch-accent: var(--tm-blue);
  width: min(13.5rem, 100%);
  min-height: 2.85rem;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.48rem;
  padding: 0.38rem 0.44rem;
  border: 1px solid color-mix(in srgb, var(--next-patch-accent) 24%, rgba(213, 196, 164, 0.14));
  border-radius: 8px;
  color: #d9edf5;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 86%),
    color-mix(in srgb, var(--next-patch-accent) 10%, rgba(5, 12, 16, 0.78));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;
}

.tm-next-patch-toggle:hover,
.tm-next-patch-toggle:focus-visible {
  border-color: color-mix(in srgb, var(--next-patch-accent) 44%, rgba(213, 196, 164, 0.18));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 86%),
    color-mix(in srgb, var(--next-patch-accent) 16%, rgba(7, 15, 18, 0.84));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 18px color-mix(in srgb, var(--next-patch-accent) 10%, transparent);
  transform: translateY(-1px);
}

.tm-next-patch-toggle:disabled {
  opacity: 0.58;
  cursor: default;
  transform: none;
}

.tm-next-patch-toggle__icon {
  width: 1.55rem;
  height: 1.55rem;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--next-patch-accent) 26%, transparent);
  border-radius: 0.38rem;
  color: color-mix(in srgb, var(--next-patch-accent) 74%, #ffffff);
  background: color-mix(in srgb, var(--next-patch-accent) 12%, transparent);
}

.tm-next-patch-toggle__icon svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-next-patch-toggle__copy {
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.tm-next-patch-toggle__copy strong,
.tm-next-patch-toggle__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-next-patch-toggle__copy strong {
  color: #edf7fb;
  font-size: 0.78rem;
  font-weight: 900;
}

.tm-next-patch-toggle__copy small {
  color: rgba(195, 218, 226, 0.78);
  font-size: 0.68rem;
  font-weight: 700;
}

.tm-next-patch-toggle__action {
  padding: 0.22rem 0.42rem;
  border: 1px solid color-mix(in srgb, var(--next-patch-accent) 20%, rgba(255, 255, 255, 0.08));
  border-radius: 999px;
  color: rgba(220, 237, 244, 0.86);
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.64rem;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.tm-next-patch-toggle--included {
  --next-patch-accent: #57c7bd;
}

.tm-next-patch-toggle--included .tm-next-patch-toggle__action {
  color: rgba(233, 244, 247, 0.86);
  border-color: rgba(192, 218, 226, 0.16);
  background: rgba(255, 255, 255, 0.045);
}

.tm-next-patch-toggle--excluded {
  border-color: rgba(85, 183, 255, 0.32);
}

.tm-next-patch-toggle--excluded .tm-next-patch-toggle__icon {
  color: #8bd5ff;
  border-color: rgba(85, 183, 255, 0.24);
  background: rgba(85, 183, 255, 0.1);
}

.tm-next-patch-toggle--excluded .tm-next-patch-toggle__action {
  color: #d8efff;
  border-color: rgba(85, 183, 255, 0.28);
  background: rgba(85, 183, 255, 0.1);
}

.tm-ready-test-toggle {
  --ready-test-accent: #72d66f;
  width: min(13.5rem, 100%);
  min-height: 2.85rem;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.48rem;
  padding: 0.38rem 0.44rem;
  border: 1px solid color-mix(in srgb, var(--ready-test-accent) 28%, rgba(213, 196, 164, 0.14));
  border-radius: 8px;
  color: #e6f6e3;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 86%),
    color-mix(in srgb, var(--ready-test-accent) 10%, rgba(5, 12, 16, 0.78));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;
}

.tm-ready-test-toggle:hover,
.tm-ready-test-toggle:focus-visible {
  border-color: color-mix(in srgb, var(--ready-test-accent) 46%, rgba(213, 196, 164, 0.18));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 86%),
    color-mix(in srgb, var(--ready-test-accent) 15%, rgba(7, 15, 18, 0.84));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 18px color-mix(in srgb, var(--ready-test-accent) 10%, transparent);
  transform: translateY(-1px);
}

.tm-ready-test-toggle:disabled {
  opacity: 0.58;
  cursor: default;
  transform: none;
}

.tm-ready-test-toggle__icon {
  width: 1.55rem;
  height: 1.55rem;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--ready-test-accent) 28%, transparent);
  border-radius: 0.38rem;
  color: color-mix(in srgb, var(--ready-test-accent) 74%, #ffffff);
  background: color-mix(in srgb, var(--ready-test-accent) 12%, transparent);
}

.tm-ready-test-toggle__icon svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tm-ready-test-toggle__copy {
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.tm-ready-test-toggle__copy strong,
.tm-ready-test-toggle__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-ready-test-toggle__copy strong {
  color: #f0faed;
  font-size: 0.78rem;
  font-weight: 900;
}

.tm-ready-test-toggle__copy small {
  color: rgba(212, 232, 205, 0.78);
  font-size: 0.68rem;
  font-weight: 700;
}

.tm-ready-test-toggle__action {
  padding: 0.22rem 0.42rem;
  border: 1px solid color-mix(in srgb, var(--ready-test-accent) 22%, rgba(255, 255, 255, 0.08));
  border-radius: 999px;
  color: rgba(230, 245, 224, 0.88);
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.64rem;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.tm-ready-test-toggle--not-ready {
  --ready-test-accent: #d9a45f;
  color: #ffe6ba;
}

.tm-ready-test-toggle--not-ready .tm-ready-test-toggle__copy small,
.tm-ready-test-toggle--not-ready .tm-ready-test-toggle__action {
  color: #ffe1ac;
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

.tm-detail-edit-btn {
  min-height: 2.25rem;
  padding: 0.36rem 0.66rem;
  border-color: rgba(85, 183, 255, 0.24);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 78%), rgba(12, 30, 42, 0.48);
  color: rgba(215, 236, 248, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease,
    box-shadow 0.14s ease;
}

.tm-detail-edit-btn > span {
  width: 1.25rem;
  height: 1.25rem;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: rgba(139, 213, 255, 0.9);
  background: rgba(85, 183, 255, 0.1);
  font-size: 0.76rem;
  line-height: 1;
}

.tm-detail-edit-btn:hover,
.tm-detail-edit-btn:focus-visible {
  border-color: rgba(85, 183, 255, 0.48);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 78%), rgba(16, 44, 62, 0.7);
  color: #f0f9ff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 16px rgba(85, 183, 255, 0.1);
  transform: translateY(-1px);
}

.tm-result-buttons,
.tm-toolbar,
.tm-settings-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.tm-result-buttons {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.85fr) minmax(5.25rem, 1.15fr);
  align-items: stretch;
  gap: 0.38rem;
  width: 100%;
}

.tm-result-btn {
  --result-color: var(--tm-blue);
  --result-bg: rgba(20, 68, 105, 0.38);
  min-width: 0;
  min-height: 2.58rem;
  justify-content: center;
  align-items: center;
  gap: 0.24rem;
  overflow: hidden;
  padding: 0.42rem 0.28rem;
  border-color: color-mix(in srgb, var(--result-color) 52%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 80%),
    color-mix(in srgb, var(--result-color) 20%, rgba(4, 9, 10, 0.78));
  color: color-mix(in srgb, var(--result-color) 72%, #ffffff);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.065),
    0 8px 18px rgba(0, 0, 0, 0.14);
  font-size: 0.8rem;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;
}

.tm-result-btn span {
  flex: 0 0 auto;
  width: 1.24rem;
  height: 1.24rem;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--result-color) 18%, transparent);
  font-size: 0.8rem;
  line-height: 1;
}

.tm-result-btn:hover:not(:disabled),
.tm-result-btn:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--result-color) 76%, transparent);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.11), transparent 80%),
    color-mix(in srgb, var(--result-color) 28%, rgba(4, 9, 10, 0.78));
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 0 18px color-mix(in srgb, var(--result-color) 18%, transparent);
}

.tm-result-btn--pass {
  --result-color: var(--tm-green);
}

.tm-result-btn--fail {
  --result-color: var(--tm-red);
}

.tm-result-btn--blocked {
  --result-color: var(--tm-gold);
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

.tm-status {
  position: relative;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 86%), rgba(85, 183, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055);
  font-weight: 850;
  letter-spacing: 0.06em;
  line-height: 1;
}

.tm-mini {
  min-width: 2.1rem;
  padding: 0.2rem 0.5rem;
}

.tm-status--compact {
  min-width: 0;
  min-height: 1.42rem;
  padding: 0.24rem 0.54rem;
  font-size: 0.68rem;
}

@property --tm-status-glow-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.tm-status--testing {
  border-color: rgba(119, 201, 255, 0.36);
  color: var(--tm-blue);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.09), transparent 86%), rgba(85, 183, 255, 0.15);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 14px rgba(85, 183, 255, 0.16);
}

.tm-status--testing::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  border: 1px solid rgba(119, 201, 255, 0.32);
  box-shadow:
    0 0 12px rgba(85, 183, 255, 0.18),
    inset 0 0 10px rgba(85, 183, 255, 0.12);
  pointer-events: none;
}

.tm-status--testing::after {
  content: '';
  position: absolute;
  inset: -1px;
  padding: 1.5px;
  border-radius: inherit;
  background: conic-gradient(
    from var(--tm-status-glow-angle, 0deg),
    rgba(85, 183, 255, 0) 0deg,
    rgba(85, 183, 255, 0.16) 16deg,
    rgba(159, 228, 255, 0.52) 34deg,
    rgba(255, 255, 255, 0.96) 52deg,
    rgba(159, 228, 255, 0.7) 70deg,
    rgba(85, 183, 255, 0.3) 94deg,
    rgba(85, 183, 255, 0.12) 118deg,
    rgba(85, 183, 255, 0) 146deg,
    rgba(85, 183, 255, 0) 360deg
  );
  filter: drop-shadow(0 0 3px rgba(159, 228, 255, 0.72))
    drop-shadow(0 0 8px rgba(85, 183, 255, 0.42));
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
  animation: tm-status-perimeter-glow 5s linear infinite;
}

@keyframes tm-status-perimeter-glow {
  to {
    --tm-status-glow-angle: 360deg;
  }
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

.tm-status--awaiting_test {
  gap: 0.32rem;
}

.tm-status--awaiting_test::before {
  content: '';
  flex: 0 0 auto;
  align-self: center;
  width: 0.48rem;
  height: 0.54rem;
  background:
    linear-gradient(currentColor 0 0) left center / 0.13rem 0.52rem no-repeat,
    linear-gradient(currentColor 0 0) right center / 0.13rem 0.52rem no-repeat;
  border-radius: 1px;
  opacity: 0.58;
  box-shadow: 0 0 6px rgba(217, 164, 95, 0.2);
}

.tm-status--closed {
  color: #d8c4ff;
  border-color: rgba(184, 140, 255, 0.54);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 86%), rgba(126, 74, 210, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 14px rgba(126, 74, 210, 0.14);
}

@media (prefers-reduced-motion: reduce) {
  .tm-status--testing::after {
    animation: none;
  }
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

.tm-report-list {
  display: grid;
  gap: 0.7rem;
}

.tm-report-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid rgba(85, 183, 255, 0.16);
  background:
    linear-gradient(135deg, rgba(85, 183, 255, 0.08), rgba(255, 255, 255, 0.018)),
    rgba(5, 13, 20, 0.72);
  color: var(--tm-text);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    transform 0.12s ease,
    background 0.16s ease;
}

.tm-report-card:hover,
.tm-report-card:focus-visible {
  border-color: rgba(85, 183, 255, 0.46);
  background:
    linear-gradient(135deg, rgba(85, 183, 255, 0.12), rgba(255, 255, 255, 0.026)),
    rgba(8, 18, 29, 0.86);
  outline: none;
  transform: translateY(-1px);
}

.tm-report-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid rgba(85, 183, 255, 0.26);
  background: rgba(85, 183, 255, 0.1);
  color: var(--tm-blue);
}

.tm-report-card__icon svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.tm-report-card__body {
  min-width: 0;
}

.tm-report-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.tm-report-card__title strong,
.tm-report-card__body p,
.tm-report-card__body small {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-report-card__body p {
  display: -webkit-box;
  margin: 0.28rem 0;
  color: var(--tm-text-muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tm-report-card__body small {
  display: block;
  color: var(--tm-muted);
  white-space: nowrap;
}

.tm-report-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.tm-report-empty {
  display: grid;
  place-items: center;
  gap: 0.35rem;
  min-height: 9rem;
  border: 1px dashed rgba(148, 163, 184, 0.22);
  background: rgba(0, 0, 0, 0.12);
  color: var(--tm-muted);
  text-align: center;
}

.tm-report-empty span {
  color: var(--tm-blue);
  font-size: 1.8rem;
}

.tm-report-empty strong {
  color: var(--tm-text);
}

.tm-report-empty p {
  margin: 0;
}

.tm-modal__panel.tm-webhook-report-modal {
  width: min(72rem, calc(100vw - 2.5rem));
  max-height: calc(100dvh - 3rem);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  overflow: hidden;
}

.tm-webhook-report-modal__body {
  display: grid;
  gap: 0.7rem;
  min-height: 0;
}

.tm-webhook-report-modal__body p {
  margin: 0;
  color: var(--tm-text);
  line-height: 1.6;
}

.tm-webhook-report-modal__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  color: var(--tm-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.tm-webhook-report-tabs {
  display: inline-flex;
  align-self: flex-start;
  gap: 0.25rem;
  padding: 0.22rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
}

.tm-webhook-report-tab {
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--tm-muted);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  padding: 0.45rem 0.9rem;
  text-transform: uppercase;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.tm-webhook-report-tab:hover,
.tm-webhook-report-tab:focus-visible {
  background: rgba(37, 99, 235, 0.14);
  color: var(--tm-text);
}

.tm-webhook-report-tab--active {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(14, 165, 233, 0.22);
  box-shadow: 0 8px 18px rgba(14, 165, 233, 0.14);
  color: var(--tm-text);
}

.tm-webhook-report-pane {
  display: grid;
  gap: 0.95rem;
  max-height: min(26rem, 40dvh);
  overflow: auto;
  padding-right: 0.25rem;
}

.tm-webhook-report-pane section {
  display: grid;
  gap: 0.45rem;
}

.tm-webhook-report-pane ul,
.tm-webhook-report-pane ol {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding-left: 1.2rem;
  color: var(--tm-text);
  line-height: 1.55;
}

.tm-webhook-report-pane__label {
  color: var(--tm-gold);
  font-family: var(--tm-font-display);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tm-webhook-report-raw {
  margin: 0;
  padding: 1rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 0.85rem;
  background: rgba(0, 0, 0, 0.32);
  color: #dbeafe;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.tm-webhook-report-raw--compact {
  max-height: 16rem;
}

.tm-webhook-report-empty {
  margin: 0;
  color: var(--tm-muted);
}

.tm-webhook-report-signature {
  display: grid;
  gap: 0.4rem;
  margin: 0;
}

.tm-webhook-report-signature div {
  display: grid;
  gap: 0.2rem;
}

.tm-webhook-report-signature dt {
  color: var(--tm-muted);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-webhook-report-signature dd {
  margin: 0;
  color: var(--tm-text);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.tm-webhook-report-ai {
  color: var(--tm-text);
}

@media (min-width: 880px) {
  .tm-webhook-report-ai {
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
    align-items: start;
  }

  .tm-webhook-report-ai section:first-child,
  .tm-webhook-report-ai section:nth-child(3) {
    grid-column: 1;
  }
}

.tm-webhook-report-hypothesis {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 0.85rem;
  background: rgba(0, 0, 0, 0.2);
}

.tm-webhook-report-hypothesis header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.tm-webhook-report-hypothesis header span {
  color: var(--tm-blue);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  font-size: 0.96rem;
  letter-spacing: 0.04em;
  margin: 0 0 0.72rem;
}

.tm-inspector h3 {
  margin-top: 1.18rem;
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
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.68rem;
  margin-top: 0.35rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 10px;
  padding: 0.62rem 0.7rem;
  color: var(--tm-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 86%), rgba(255, 255, 255, 0.018);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;
}

.tm-notes-launch span {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(217, 164, 95, 0.28);
  border-radius: 0.5rem;
  color: var(--tm-gold);
  background: rgba(217, 164, 95, 0.08);
}

.tm-notes-launch strong {
  min-width: 0;
  font-size: 0.9rem;
}

.tm-notes-launch small {
  color: var(--tm-muted);
  font-size: 0.74rem;
  text-align: right;
}

.tm-notes-launch--has-notes {
  border-color: rgba(114, 214, 111, 0.46);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 86%),
    linear-gradient(90deg, rgba(29, 94, 42, 0.34), rgba(29, 94, 42, 0.1));
}

.tm-notes-launch--has-notes small,
.tm-notes-launch--has-notes span {
  color: #a7eda2;
}

.tm-notes-launch--has-notes span {
  border-color: rgba(114, 214, 111, 0.36);
  background: rgba(29, 94, 42, 0.26);
}

.tm-notes-launch--empty {
  border-color: rgba(213, 196, 164, 0.18);
}

.tm-notes-launch:hover,
.tm-notes-launch:focus-visible {
  border-color: rgba(217, 164, 95, 0.34);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 86%), rgba(255, 255, 255, 0.03);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 16px rgba(217, 164, 95, 0.06);
  transform: translateY(-1px);
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

.tm-testing-checklist__head--admin,
.tm-testing-checklist__row--admin {
  grid-template-columns: 4.5rem minmax(16rem, 1fr) 8rem 4.25rem 7rem 2rem;
}

.tm-testing-checklist__head {
  color: var(--tm-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.03);
}

.tm-testing-checklist__add {
  justify-self: end;
}

.tm-testing-checklist__delete {
  justify-self: end;
}

.tm-checklist-add-btn {
  width: 1.72rem;
  height: 1.72rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: rgba(213, 196, 164, 0.62);
  display: inline-grid;
  place-items: center;
  padding: 0;
  font: inherit;
  font-size: 1.42rem;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  box-shadow: none;
  transition:
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    opacity 160ms ease,
    box-shadow 160ms ease;
}

.tm-checklist-add-btn span {
  transform: translateY(-0.04rem);
}

.tm-checklist-add-btn:hover,
.tm-checklist-add-btn:focus-visible {
  background: rgba(213, 196, 164, 0.08);
  color: rgba(243, 214, 166, 0.9);
  transform: translateY(-1px);
  box-shadow: 0 0 0 3px rgba(213, 196, 164, 0.06);
}

.tm-checklist-add-btn:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.7);
  outline-offset: 2px;
}

.tm-checklist-delete-btn {
  width: 1.72rem;
  height: 1.72rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: rgba(213, 196, 164, 0.4);
  display: inline-grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    opacity 160ms ease,
    box-shadow 160ms ease;
}

.tm-checklist-delete-btn svg {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}

.tm-checklist-delete-btn:hover,
.tm-checklist-delete-btn:focus-visible {
  background: rgba(255, 107, 85, 0.08);
  color: rgba(255, 145, 126, 0.92);
  transform: translateY(-1px);
  box-shadow: 0 0 0 3px rgba(255, 107, 85, 0.06);
}

.tm-checklist-delete-btn:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.7);
  outline-offset: 2px;
}

.tm-checklist-delete-btn:disabled {
  cursor: default;
  opacity: 0.42;
  transform: none;
  box-shadow: none;
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

.tm-checklist-add-modal {
  max-width: 34rem;
}

.tm-checklist-add-templates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  padding: 0.62rem;
  border: 1px solid var(--tm-border-soft);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.018);
}

.tm-checklist-add-templates button {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
  border: 1px solid rgba(213, 196, 164, 0.14);
  border-radius: var(--tm-control-radius);
  background: rgba(0, 0, 0, 0.18);
  color: var(--tm-text);
  padding: 0.5rem 0.55rem;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.tm-checklist-add-templates button:hover {
  transform: translateY(-1px);
  border-color: rgba(217, 164, 95, 0.36);
  background: rgba(217, 164, 95, 0.08);
}

.tm-checklist-add-templates button:focus-visible {
  outline: 2px solid rgba(85, 183, 255, 0.72);
  outline-offset: 2px;
}

.tm-checklist-add-templates strong,
.tm-checklist-add-templates span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-checklist-add-templates strong {
  font-size: 0.78rem;
}

.tm-checklist-add-templates span {
  color: var(--tm-muted);
  font-size: 0.68rem;
}

.tm-checklist-add-modal label {
  display: grid;
  gap: 0.35rem;
}

.tm-checklist-add-modal label > span {
  color: var(--tm-gold);
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-checklist-add-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding-top: 0.2rem;
}

.tm-action {
  --action-color: var(--tm-blue);
  width: 100%;
  display: grid;
  grid-template-columns: 2.35rem minmax(0, 1fr);
  gap: 0.68rem;
  align-items: center;
  text-align: left;
  min-height: 4.18rem;
  margin-bottom: 0.56rem;
  padding: 0.64rem 0.72rem;
  border-color: color-mix(in srgb, var(--action-color) 42%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 84%),
    color-mix(in srgb, var(--action-color) 18%, rgba(4, 8, 8, 0.78));
  color: color-mix(in srgb, var(--action-color) 64%, #ffffff);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    0 10px 20px rgba(0, 0, 0, 0.13);
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;
}

.tm-action small {
  color: rgba(226, 217, 202, 0.72);
  line-height: 1.25;
}

.tm-action > span:last-child {
  display: grid;
  gap: 0.1rem;
}

.tm-action__icon {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--action-color) 36%, transparent);
  border-radius: 0.62rem;
  color: color-mix(in srgb, var(--action-color) 78%, #ffffff);
  background: color-mix(in srgb, var(--action-color) 14%, transparent);
  font-size: 1.04rem;
  line-height: 1;
}

.tm-action--success {
  --action-color: var(--tm-green);
}
.tm-action--info {
  --action-color: var(--tm-blue);
}
.tm-action--danger {
  --action-color: var(--tm-red);
}

.tm-action:hover,
.tm-action:focus-visible {
  border-color: color-mix(in srgb, var(--action-color) 66%, transparent);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), transparent 84%),
    color-mix(in srgb, var(--action-color) 26%, rgba(4, 8, 8, 0.78));
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.075),
    0 0 18px color-mix(in srgb, var(--action-color) 14%, transparent);
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
  position: relative;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border: 1px solid var(--tm-border);
  background: rgba(0, 0, 0, 0.12);
  box-shadow:
    inset -1.25rem 0 1.5rem -1.45rem rgba(244, 190, 107, 0.9),
    inset 1.25rem 0 1.5rem -1.45rem rgba(244, 190, 107, 0.7);
  scrollbar-color: rgba(244, 190, 107, 0.55) rgba(255, 255, 255, 0.05);
  scrollbar-width: thin;
}

.tm-permissions::-webkit-scrollbar {
  height: 0.7rem;
}

.tm-permissions::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.tm-permissions::-webkit-scrollbar-thumb {
  background: rgba(244, 190, 107, 0.52);
  border-radius: 999px;
}

.tm-permissions__head,
.tm-permissions__row {
  display: grid;
  grid-template-columns: 15rem repeat(9, minmax(9.75rem, 1fr));
  align-items: center;
  border-bottom: 1px solid var(--tm-border-soft);
  min-width: 104rem;
}

.tm-permissions__head > span,
.tm-permissions__row > span,
.tm-permissions__row > strong {
  padding: 0.8rem 0.9rem;
}

.tm-permissions__head > span:first-child,
.tm-permissions__row > strong {
  position: sticky;
  left: 0;
  z-index: 2;
  background:
    linear-gradient(90deg, rgba(18, 15, 11, 0.98), rgba(18, 15, 11, 0.92)),
    var(--tm-panel-bg);
  box-shadow: 0.7rem 0 1rem -1rem rgba(0, 0, 0, 0.95);
}

.tm-permissions__head > span:first-child {
  z-index: 3;
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

.tm-permission-toggle--locked > span {
  border-color: rgba(114, 214, 111, 0.62);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 82%), rgba(29, 94, 42, 0.42);
  color: #eaffea;
  box-shadow:
    inset 0 0 14px rgba(114, 214, 111, 0.2),
    0 0 10px rgba(114, 214, 111, 0.08);
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
  z-index: 10040;
  padding: 1rem;
  backdrop-filter: blur(3px);
}

.tm-modal__panel {
  width: min(52rem, 100%);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}

.tm-modal__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.7rem;
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

.tm-confirm-modal__details {
  display: grid;
  gap: 0.4rem;
  padding: 0.78rem 0.85rem;
  border: 1px solid rgba(217, 164, 95, 0.24);
  border-radius: var(--tm-control-radius);
  background: linear-gradient(180deg, rgba(217, 164, 95, 0.065), transparent), rgba(0, 0, 0, 0.22);
}

.tm-confirm-modal__details span {
  color: var(--tm-gold);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tm-confirm-modal__details p {
  margin: 0;
  color: rgba(232, 221, 206, 0.88);
  font-size: 0.88rem;
  line-height: 1.42;
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

.tm-confirm-modal--next-patch {
  border-color: rgba(87, 199, 189, 0.4);
}

.tm-confirm-modal--next-patch .tm-confirm-modal__icon {
  border-color: rgba(87, 199, 189, 0.5);
  background: rgba(24, 94, 88, 0.2);
  color: #78d9d0;
  box-shadow: 0 0 18px rgba(87, 199, 189, 0.14);
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

.tm-create-description :deep(.tm-editor__surface) {
  min-height: 9rem;
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
  width: min(58rem, 100%);
  gap: 0.95rem;
  padding: 1.15rem;
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
  gap: 0.65rem;
  max-height: 22rem;
  overflow: auto;
  border-top: 1px solid var(--tm-border-soft);
  padding-top: 0.8rem;
}

.tm-recorded-notes h3 {
  margin: 0;
}

.tm-recorded-notes article {
  border: 1px solid var(--tm-border-soft);
  background: rgba(255, 255, 255, 0.018);
  padding: 0.7rem 0.85rem;
  width: min(76%, 42rem);
  max-width: calc(100% - 2rem);
  justify-self: start;
  border-radius: 8px 8px 8px 2px;
}

.tm-recorded-notes article.tm-recorded-notes__note--own {
  justify-self: end;
  border-color: rgba(180, 144, 82, 0.32);
  background: rgba(180, 144, 82, 0.08);
  border-radius: 8px 8px 2px 8px;
}

.tm-recorded-notes__meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  justify-content: space-between;
  color: var(--tm-muted);
  font-size: 0.78rem;
}

.tm-recorded-notes__byline {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  min-width: 0;
}

.tm-recorded-notes strong {
  color: var(--tm-text);
}

.tm-recorded-notes__time {
  color: #a99c8d;
  white-space: nowrap;
}

.tm-recorded-notes__delete {
  border: 1px solid rgba(236, 112, 99, 0.38);
  background: rgba(236, 112, 99, 0.12);
  color: #f4afa6;
  padding: 0.25rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.tm-recorded-notes__delete:hover:not(:disabled) {
  background: rgba(236, 112, 99, 0.2);
  color: #ffd1ca;
}

.tm-recorded-notes__delete:disabled {
  cursor: wait;
  opacity: 0.62;
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

  .tm-grid--changes,
  .tm-grid--dashboard,
  .tm-grid--users {
    grid-template-columns: 1fr;
    gap: 1rem;
    align-items: start;
  }

  .tm-grid--users {
    overflow: visible;
  }

  .tm-grid--users > .tm-panel {
    display: block;
    overflow: visible;
  }

  .tm-grid--users > .tm-stack {
    overflow: visible;
  }

  .tm-state-graph {
    overflow: visible;
  }

  .tm-state-graph__legend {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-next-patch-panel {
    height: auto;
    overflow: visible;
  }

  .tm-panel__header.tm-next-patch__header {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .tm-next-patch-progress {
    width: min(32rem, 100%);
    justify-self: start;
  }

  .tm-next-patch__actions {
    justify-content: flex-start;
  }

  .tm-next-patch-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-next-patch-card {
    grid-template-columns: 1fr;
  }

  .tm-next-patch-card__auto-close {
    position: relative;
    left: auto;
    bottom: auto;
    width: min(16rem, 100%);
    margin-top: -0.2rem;
  }

  .tm-next-patch-card__quality {
    justify-content: flex-start;
  }

  .tm-next-patch-card__remove {
    justify-self: start;
  }

  .tm-recent-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-recent-strip h2 {
    grid-column: 1 / -1;
  }

  .tm-lane-splitter {
    display: none;
  }

  .tm-detail,
  .tm-inspector,
  .tm-change-list {
    height: auto;
    min-width: 0;
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
  .tm-checklist-add-templates,
  .tm-checklist-templates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-auto-close-control {
    grid-template-columns: 1fr;
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

  .tm-panel {
    padding: 0.85rem;
  }

  .tm-hero,
  .tm-subnav,
  .tm-grid,
  .tm-dashboard,
  .tm-next-patch,
  .tm-settings,
  .tm-loading {
    width: 100%;
  }

  .tm-hero {
    gap: 0.75rem;
  }

  .tm-hero h1 {
    font-size: 1.55rem;
  }

  .tm-hero__actions,
  .tm-create-trigger {
    width: 100%;
  }

  .tm-next-patch-reset-strip {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-next-patch-reset-strip__actions {
    justify-content: space-between;
    width: 100%;
  }

  .tm-next-patch-notes-button,
  .tm-next-patch-reset-button {
    width: 100%;
  }

  .tm-patch-notes-modal {
    width: min(100%, calc(100vw - 1rem));
    max-height: calc(100dvh - 1rem);
  }

  .tm-patch-notes-modal__header,
  .tm-patch-notes-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-patch-notes-toolbar {
    grid-template-columns: 1fr;
  }

  .tm-patch-notes-toolbar__actions,
  .tm-patch-notes-footer__actions {
    justify-content: stretch;
  }

  .tm-patch-notes-toolbar__actions .tm-btn,
  .tm-patch-notes-footer__actions .tm-btn {
    flex: 1 1 10rem;
    justify-content: center;
  }

  .tm-patch-note-row {
    grid-template-columns: 1fr;
  }

  .tm-patch-note-row__toggle {
    min-height: auto;
    grid-template-columns: auto auto;
    justify-content: start;
    padding: 0.6rem 0.7rem;
  }

  .tm-patch-notes-loading {
    grid-template-columns: 1fr;
  }

  .tm-create-trigger {
    justify-content: center;
  }

  .tm-subnav {
    min-height: 2.75rem;
    padding: 0.22rem;
  }

  .tm-subnav__item {
    height: 2.22rem;
    padding-inline: 0.72rem;
    gap: 0.45rem;
    font-size: 0.84rem;
  }

  .tm-subnav__icon {
    width: 1.48rem;
    height: 1.48rem;
  }

  .tm-filters,
  .tm-filters--wide,
  .tm-form-grid {
    grid-template-columns: 1fr;
  }

  .tm-change-card {
    grid-template-columns: 1fr;
  }

  .tm-change-list {
    max-height: min(28rem, 44dvh);
    overflow: auto;
  }

  .tm-change-status-counters {
    justify-self: stretch;
    min-width: 0;
    width: 100%;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .tm-change-status-counter {
    min-height: 2rem;
  }

  .tm-change-status-counter span {
    font-size: 0.48rem;
  }

  .tm-state-graph__stats,
  .tm-state-graph__legend,
  .tm-next-patch-stats,
  .tm-state-graph__insights {
    grid-template-columns: 1fr;
  }

  .tm-next-patch-card__main {
    grid-template-columns: 1fr;
  }

  .tm-next-patch-card__quality {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tm-next-patch-card__quality span {
    min-width: 0;
  }

  .tm-state-graph__canvas svg {
    min-height: 16rem;
  }

  :deep(.tm-workflow__steps) {
    justify-content: flex-start;
  }

  .tm-recent-strip {
    display: none;
  }

  .tm-activity-table__head {
    display: none;
  }

  .tm-activity-table__row {
    grid-template-columns: 1fr;
    gap: 0.4rem;
    padding: 0.72rem;
  }

  .tm-activity-table__change strong,
  .tm-activity-table__tester strong,
  .tm-activity-table__notes {
    white-space: normal;
  }

  .tm-activity-table__status,
  .tm-activity-table__time {
    justify-self: start;
  }

  .tm-github-pr-panel__brand,
  .tm-github-pr-panel__body {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-github-pr-panel__metrics {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tm-github-fields,
  .tm-github-linked-record {
    grid-template-columns: 1fr;
  }

  .tm-github-linked-record__actions {
    justify-items: start;
  }

  .tm-github-linked-record__footer {
    grid-template-columns: 1fr;
  }

  .tm-github-linked-record__state {
    justify-self: start;
  }

  .tm-github-pr-panel__metrics span {
    min-width: 0;
  }

  .tm-tabs {
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.1rem;
    scrollbar-width: none;
  }

  .tm-tabs::-webkit-scrollbar {
    display: none;
  }

  .tm-tabs button {
    flex: 0 0 auto;
    min-height: 2.4rem;
    padding: 0.62rem 0.7rem;
  }

  .tm-section-title,
  .tm-settings-section__header {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-section-title--detail {
    grid-template-columns: 1fr;
    gap: 0.45rem;
  }

  .tm-section-title--detail > div,
  .tm-section-title--detail > span {
    grid-column: auto;
    justify-self: stretch;
    text-align: left;
  }

  .tm-section-title--detail > span {
    justify-self: start;
  }

  .tm-testing-checklist__head {
    display: none;
  }

  .tm-testing-checklist__row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.5rem 0.75rem;
    align-items: start;
    padding: 0.78rem;
  }

  .tm-testing-checklist__row > span:first-child {
    grid-row: 1 / span 4;
    padding-top: 0.05rem;
  }

  .tm-testing-checklist__row > span:nth-child(2),
  .tm-testing-checklist__row > span:nth-child(3),
  .tm-testing-checklist__row > span:nth-child(4),
  .tm-testing-checklist__row > span:nth-child(5) {
    grid-column: 2;
  }

  .tm-testing-checklist__row > span:nth-child(6) {
    grid-column: 2;
    justify-self: end;
  }

  .tm-testing-checklist__row > span:nth-child(3),
  .tm-testing-checklist__row > span:nth-child(4),
  .tm-testing-checklist__row > span:nth-child(5) {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
  }

  .tm-testing-checklist__row > span:nth-child(3)::before {
    content: 'Category';
  }

  .tm-testing-checklist__row > span:nth-child(4)::before {
    content: 'Notes';
  }

  .tm-testing-checklist__row > span:nth-child(5)::before {
    content: 'Status';
  }

  .tm-testing-checklist__row > span:nth-child(3)::before,
  .tm-testing-checklist__row > span:nth-child(4)::before,
  .tm-testing-checklist__row > span:nth-child(5)::before {
    color: var(--tm-muted);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .tm-coverage-matrix__header,
  .tm-coverage-matrix > div:not(.tm-coverage-matrix__header) {
    min-width: calc(14rem + var(--tester-count) * 7.5rem);
    grid-template-columns: minmax(14rem, 1.1fr) repeat(var(--tester-count), minmax(7.5rem, 1fr));
  }

  .tm-history article {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.45rem 0.7rem;
  }

  .tm-history article time,
  .tm-history article em {
    grid-column: 2;
  }

  .tm-history article > div {
    grid-column: 2;
  }

  .tm-history__marker {
    grid-row: 1 / span 3;
  }

  .tm-table {
    overflow: visible;
  }

  .tm-table__head {
    display: none;
  }

  .tm-table__row {
    min-width: 0;
  }

  .tm-table__row--users,
  .tm-table__row--testers,
  .tm-table__row--testers-admin {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.55rem;
    margin-bottom: 0.65rem;
    padding: 0.78rem;
    border: 1px solid var(--tm-border-soft);
    background: rgba(255, 255, 255, 0.018);
    text-align: left;
  }

  .tm-table__head.tm-table__row--users,
  .tm-table__head.tm-table__row--testers,
  .tm-table__head.tm-table__row--testers-admin {
    display: none;
  }

  .tm-table__row--users > span:not(.tm-user-cell),
  .tm-table__row--testers > span {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    text-align: right;
  }

  .tm-table__row--testers > span::before,
  .tm-table__row--users > span:not(.tm-user-cell)::before {
    flex: 0 0 auto;
    color: var(--tm-muted);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .tm-table__row--testers > span:nth-child(1)::before {
    content: 'Tester';
  }

  .tm-table__row--testers > span:nth-child(2)::before {
    content: 'Assignment';
  }

  .tm-table__row--testers > span:nth-child(3)::before {
    content: 'Status';
  }

  .tm-table__row--testers > span:nth-child(4)::before {
    content: 'Final Result';
  }

  .tm-table__row--testers > span:nth-child(5)::before {
    content: 'Notes';
  }

  .tm-table__row--testers > span:nth-child(6)::before {
    content: 'Updated';
  }

  .tm-table__row--testers > span:nth-child(7)::before {
    content: 'Actions';
  }

  .tm-table__row--users > span:nth-child(2)::before {
    content: 'Role';
  }

  .tm-table__row--users > span:nth-child(3)::before {
    content: 'Testing Load';
  }

  .tm-table__row--users > span:nth-child(4)::before {
    content: 'Recent Results';
  }

  .tm-table__row--users > span:nth-child(5)::before {
    content: 'Tester Role';
  }

  .tm-table__row--users .tm-user-cell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    padding-bottom: 0.55rem;
    border-bottom: 1px solid var(--tm-border-soft);
  }

  .tm-table__row--users > span.tm-result-minis:not(.tm-user-cell) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    justify-content: initial;
    text-align: left;
  }

  .tm-table__row--users > span.tm-result-minis:not(.tm-user-cell)::before {
    justify-self: start;
  }

  .tm-table__row--testers .tm-tester-status-cell {
    position: static;
    justify-content: flex-end;
    min-height: auto;
  }

  .tm-tester-status-cell .tm-status-loader {
    position: static;
    margin: 0 0 0 0.45rem;
  }

  .tm-table-actions {
    justify-content: flex-end;
  }

  .tm-table-action {
    min-height: 2.2rem;
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
    grid-template-columns: 1fr;
    align-content: center;
    align-items: stretch;
  }

  .tm-detail__actions .tm-status {
    justify-self: start;
  }

  .tm-detail__status-stack {
    width: 100%;
    justify-items: start;
  }

  .tm-next-patch-toggle,
  .tm-ready-test-toggle {
    width: 100%;
  }

  .tm-detail__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .tm-detail__actions .tm-btn {
    width: 100%;
  }

  .tm-detail__actions .tm-btn,
  .tm-result-buttons .tm-btn {
    justify-content: center;
  }

  .tm-result-buttons {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.85fr) minmax(5.25rem, 1.15fr);
  }

  .tm-user-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-user-tabs .tm-input {
    grid-column: 1 / -1;
  }

  .tm-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-pagination > div {
    justify-content: center;
    flex-wrap: wrap;
  }

  .tm-coverage {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .tm-coverage__legend {
    width: 100%;
  }

  .tm-settings-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
  }

  .tm-settings-actions .tm-btn {
    justify-content: center;
  }

  .tm-permissions {
    overflow-x: auto;
  }

  .tm-permissions__head,
  .tm-permissions__row {
    grid-template-columns: 12rem repeat(9, minmax(8rem, 1fr));
    min-width: 84rem;
  }

  .tm-permissions__head > span,
  .tm-permissions__row > span,
  .tm-permissions__row > strong {
    padding: 0.68rem 0.58rem;
  }

  .tm-discord-events {
    grid-template-columns: 1fr;
  }

  .tm-discord-event {
    grid-template-columns: 1.75rem minmax(0, 1fr);
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

  .tm-create-modal__header h2 {
    font-size: 1.65rem;
  }

  .tm-create-modal__header-actions {
    width: 100%;
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .tm-create-modal__summary {
    width: 100%;
    min-width: 0;
    text-align: left;
  }

  .tm-create-modal__footer .tm-btn {
    width: 100%;
    justify-content: center;
  }

  .tm-create-modal__footer p {
    margin-right: 0;
  }

  .tm-create-grid,
  .tm-priority-selector,
  .tm-checklist-add-templates,
  .tm-checklist-templates,
  .tm-checklist-builder__row {
    grid-template-columns: 1fr;
  }

  .tm-create-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .tm-create-rail__step {
    grid-template-columns: 1fr;
    justify-items: center;
    min-height: 0;
    padding: 0.55rem 0.35rem;
    text-align: center;
  }

  .tm-create-rail__step strong {
    width: 2rem;
    height: 2rem;
  }

  .tm-create-rail__step small {
    display: none;
  }

  .tm-checklist-builder__row .tm-field--full {
    grid-column: auto;
  }

  .tm-checklist-builder__row {
    padding: 0.85rem 3.15rem 0.75rem 0.75rem;
  }

  .tm-checklist-builder__index {
    justify-self: start;
  }

  .tm-checklist-builder__remove {
    top: 0.55rem;
    right: 0.55rem;
  }

  .tm-recorded-notes article {
    width: min(88%, 100%);
    max-width: 100%;
  }

  .tm-recorded-notes__meta,
  .tm-confirm-modal__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .tm-confirm-modal__actions .tm-btn {
    justify-content: center;
  }
}

@media (max-width: 520px) {
  .tm-shell {
    padding: 0.7rem;
  }

  .tm-panel {
    padding: 0.75rem;
  }

  .tm-change-status-counters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tm-github-pr-panel__metrics {
    grid-template-columns: 1fr;
  }

  .tm-user-tabs {
    grid-template-columns: 1fr;
  }

  .tm-permissions__row {
    grid-template-columns: 1fr;
  }

  .tm-confirm-modal__header {
    grid-template-columns: 1fr;
  }

  .tm-confirm-modal__icon {
    width: 2.6rem;
    height: 2.6rem;
  }

  .tm-create-modal__header,
  .tm-create-modal__footer {
    padding: 0.85rem;
  }

  .tm-create-workspace,
  .tm-edit-modal__body {
    padding: 0.75rem;
  }

  .tm-create-rail {
    gap: 0.45rem;
    padding: 0.75rem;
  }

  .tm-create-rail__step small,
  .tm-priority-selector__option span,
  .tm-checklist-templates span {
    display: none;
  }

  .tm-checklist-builder__row {
    padding-right: 2.85rem;
  }

  .tm-checklist-builder__remove {
    width: 2rem;
    height: 2rem;
  }
}
</style>
