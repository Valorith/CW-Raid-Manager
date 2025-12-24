<template>
  <section v-if="raid" class="loot-view">
    <header class="section-header">
      <div>
        <h1>Loot Tracker</h1>
        <p class="muted">{{ raid.name }} • {{ formatDate(raid.startTime) }}</p>
      </div>
      <div class="header-actions">
        <RouterLink
          class="btn btn--outline"
          :to="{ name: 'RaidDetail', params: { raidId: raid.id } }"
        >
          Back to Raid
        </RouterLink>
      </div>
    </header>

    <section v-if="!canManageLoot" class="card loot-readonly-card">
      <p class="muted">
        You have read-only access to this raid's loot data. Loot council updates will appear here
        automatically when they are being tracked by raid leadership.
      </p>
    </section>

    <div class="parsing-window" role="status" aria-live="polite">
      <div class="parsing-window__icon">⏱</div>
      <div class="parsing-window__details">
        <p class="parsing-window__label">Parsing Window</p>
        <p class="parsing-window__range">{{ parsingWindowStart }} → {{ parsingWindowEnd }}</p>
        <p class="parsing-window__hint">
          Only log lines inside this window are analyzed when you upload a log.
        </p>
      </div>
      <button
        v-if="canManageLoot"
        class="btn btn--outline btn--small btn--modal-outline parsing-window__button"
        type="button"
        @click="openWindowModal"
      >
        Adjust Time Window
      </button>
      <button
        v-if="canManageLoot"
        class="btn btn--outline btn--small btn--modal-outline parsing-window__button parsing-window__button--debug"
        type="button"
        @click="showDebugConsole = !showDebugConsole"
        :aria-pressed="showDebugConsole"
      >
        <span aria-hidden="true">🔧</span>
        <span class="sr-only">Toggle Debug Console</span>
        <span class="parsing-window__button-text">Debug</span>
      </button>
    </div>

    <div class="parsing-window-spacer" aria-hidden="true"></div>

    <div v-if="monitorSession && lootConsoleVisible" class="loot-console-container">
      <button class="loot-console__suppress" type="button" @click="handleLootConsoleSuppress">
        Suppress
      </button>
      <div class="loot-console-stage">
        <div class="loot-console-background" aria-hidden="true"></div>
        <Transition name="loot-console-transition">
          <div
            v-if="lootConsoleCurrent"
            class="loot-console"
            :class="{
              'loot-console--accepted': lootConsoleCurrent.status === 'ACCEPTED',
              'loot-console--rejected': lootConsoleCurrent.status === 'REJECTED'
            }"
            role="status"
            aria-live="assertive"
          >
            <span class="loot-console__line">{{ lootConsoleCurrent.line }}</span>
          </div>
        </Transition>
      </div>
    </div>

    <div v-if="clearLootPrompt.visible" class="modal-backdrop">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Clear Existing Loot?</h3>
          </div>
          <button class="icon-button" type="button" @click="handleClearLootPromptClose">✕</button>
        </header>
        <div class="modal__body">
          <p class="muted small">
            {{
              clearLootPrompt.mode === 'monitor'
                ? 'Live monitoring will continue from the current loot list. Decide whether to reset it before streaming new loot.'
                : 'This upload can replace existing loot entries. Decide whether to clear the current list before parsing.'
            }}
          </p>
          <p class="muted x-small">
            {{ lootEvents.length }}
            existing loot {{ lootEvents.length === 1 ? 'entry' : 'entries' }} will remain if you keep them.
          </p>
        </div>
        <footer class="clear-loot-actions">
          <button
            class="btn btn--outline btn--modal-outline"
            type="button"
            @click="handleClearLootPromptClose"
          >
            Go Back
          </button>
          <button
            class="btn btn--outline btn--modal-outline clear-loot-actions__button--danger"
            type="button"
            @click="handleClearLootPromptDecision(true)"
          >
            Clear Loot &amp; Continue
          </button>
          <button
            class="btn btn--modal-primary clear-loot-actions__button--success"
            type="button"
            @click="handleClearLootPromptDecision(false)"
          >
            Keep Loot &amp; Continue
          </button>
        </footer>
      </div>
    </div>

    <div v-if="showUploadModeModal && pendingUploadFile" class="modal-backdrop">
      <div class="modal modal--wide upload-mode-modal">
        <header class="modal__header">
          <div>
            <h3>Select Upload Mode</h3>
            <p class="muted small">
              {{ pendingUploadFile.name }} • {{ formatFileSize(pendingUploadFile.size) }}
            </p>
          </div>
          <button class="icon-button" type="button" @click="closeUploadModeModal">✕</button>
        </header>
        <p class="upload-mode-warning">
          <span v-if="lootEvents.length === 0">
            ⚠️ Uploading a log clears existing loot entries for a clean review.
          </span>
          <span v-else>
            ⚠️ Uploading or monitoring a log can clear existing loot. You’ll be asked whether to
            reset the current loot before continuing.
          </span>
        </p>
        <div class="upload-mode-options">
          <article class="upload-mode-card">
            <h4>Upload Once</h4>
            <p class="muted small">
              Parse the selected file a single time. Ideal for historical logs.
            </p>
            <button
              class="upload-mode-button upload-mode-button--primary"
              type="button"
              :disabled="clearingLoot"
              @click="confirmUploadMode('single')"
            >
              <span class="upload-mode-button__icon" aria-hidden="true">📤</span>
              <span class="upload-mode-button__text">
                <strong>{{ clearingLoot ? 'Clearing…' : 'Upload Log Now' }}</strong>
                <small>One-time upload • Manual reviews only</small>
              </span>
            </button>
          </article>
          <article
            class="upload-mode-card"
            :class="{ 'upload-mode-card--disabled': !supportsContinuousMonitoring }"
          >
            <h4>Continuous Monitor</h4>
            <p class="muted small">
              Watch this file for new loot lines and stream them into the review queue in real time.
            </p>
            <p class="muted x-small">
              {{
                canStartContinuousMonitor
                  ? 'This locks uploads for everyone until you stop monitoring.'
                  : 'Select a file via the button above to enable monitoring.'
              }}
            </p>
            <button
              class="upload-mode-button upload-mode-button--outline"
              type="button"
              :disabled="!canStartContinuousMonitor || monitorStarting || clearingLoot"
              @click="confirmUploadMode('monitor')"
            >
              <span class="upload-mode-button__icon" aria-hidden="true">⏱️</span>
              <span class="upload-mode-button__text">
                <strong>
                  {{
                    canStartContinuousMonitor
                      ? clearingLoot
                        ? 'Clearing…'
                        : monitorStarting
                          ? 'Starting…'
                          : 'Start Monitoring'
                      : 'Not Supported'
                  }}
                </strong>
                <small>Streams new loot live • Locks other uploads</small>
              </span>
            </button>
          </article>
        </div>
    </div>
  </div>

  <div v-if="defaultLogPrompt.visible" class="modal-backdrop">
    <div class="modal default-log-modal">
      <header class="modal__header">
        <div>
          <h3>Use Saved Log File?</h3>
          <p class="muted small">You can use your default log file or pick a different one.</p>
        </div>
        <button class="icon-button" type="button" @click="handleDefaultLogPromptAction('skip')">
          ✕
        </button>
      </header>
      <div class="modal__body default-log-modal__body">
        <div class="default-log-modal__icon" aria-hidden="true">📁</div>
        <div>
          <p class="default-log-modal__filename">{{ defaultLogPrompt.fileName }}</p>
          <p class="muted x-small">{{ formatFileSize(defaultLogPrompt.fileSize) }}</p>
        </div>
      </div>
      <footer class="default-log-modal__actions">
        <button
          class="btn btn--outline btn--modal-outline"
          type="button"
          @click="handleDefaultLogPromptAction('skip')"
        >
          Choose Different File
        </button>
        <button class="btn btn--modal-primary" type="button" @click="handleDefaultLogPromptAction('use')">
          Use Saved File
        </button>
      </footer>
    </div>
  </div>

  <div v-if="lootCouncilModalVisible" class="modal-backdrop loot-council-backdrop">
    <div class="modal loot-council-modal" role="dialog" aria-live="polite">
      <header class="modal__header loot-council-modal__header">
        <div>
          <h3>Loot Council In Progress</h3>
          <p class="muted small">
            {{
              lootCouncilActiveItems.length === 1
                ? '1 item awaiting a decision.'
                : `${lootCouncilActiveItems.length} items awaiting decisions.`
            }}
          </p>
        </div>
        <div class="modal__header-actions">
          <button
            v-if="lootCouncilActiveItems.length > 0 && monitorSession?.isOwner"
            class="loot-council-clear-all"
            type="button"
            @click="clearLootCouncilItem('ALL')"
          >
            Clear All
          </button>
          <button
            class="loot-council-minimize"
            type="button"
            aria-label="Minimize loot council tracker"
            @click="minimizeLootCouncilModal"
          >
            <span aria-hidden="true" class="loot-council-minimize__icon">⌄</span>
          </button>
        </div>
      </header>
      <section class="loot-council-modal__body">
        <div class="loot-council-columns">
          <article
            v-for="item in lootCouncilActiveItems"
            :key="item.key"
            :class="['loot-council-column', getLootCouncilViewerClasses(item)]"
          >
            <header class="loot-council-column__header">
              <div
                class="loot-council-column__icon"
                @mouseenter="showLootCouncilItemTooltip($event, item)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideItemTooltip"
              >
                <template v-if="hasValidIconId(item.itemIconId)">
                  <img
                    :src="getLootIconSrc(item.itemIconId)"
                    :alt="`${item.itemName} icon`"
                    loading="lazy"
                  />
                </template>
                <span v-else class="loot-council-column__icon-placeholder">?</span>
              </div>
              <div class="loot-council-column__info">
                <p
                  class="loot-council-column__name"
                  @mouseenter="showLootCouncilItemTooltip($event, item)"
                  @mousemove="updateTooltipPosition($event)"
                  @mouseleave="hideItemTooltip"
                >
                  {{ item.itemName }}
                </p>
                <p class="loot-council-column__meta">
                  Tracking since {{ formatRelativeTime(item.startedAt.toISOString()) }}
                </p>
              </div>
              <span v-if="item.ordinal != null" class="loot-council-column__ordinal">
                #{{ item.ordinal }}
              </span>
            </header>
            <div v-if="monitorSession?.isOwner" class="loot-council-column__actions">
              <button
                class="loot-council-column__chip"
                type="button"
                @click="clearLootCouncilItem(item.key)"
              >
                ✕ Clear
              </button>
            </div>
            <ul v-if="item.interests.length > 0" class="loot-council-interest-list">
              <li
                v-for="interest in item.interests"
                :key="`${item.key}-${interest.playerKey}`"
                class="loot-council-interest"
              >
                <div class="loot-council-interest__details">
                  <div class="loot-council-interest__headline">
                    <span
                      v-if="interest.classHint && getCharacterClassIcon(interest.classHint)"
                      class="loot-council-interest__class"
                      :title="characterClassLabels[interest.classHint]"
                    >
                      <img
                        :src="getCharacterClassIcon(interest.classHint) ?? undefined"
                        :alt="characterClassLabels[interest.classHint]"
                      />
                    </span>
                    <span
                      class="loot-council-interest__name clickable"
                      role="button"
                      tabindex="0"
                      @click.stop="openInventory(interest.playerName)"
                      @keydown.enter.stop="openInventory(interest.playerName)"
                    >
                      {{ interest.playerName }}
                    </span>
                    <div class="loot-council-interest__votes" aria-label="Votes received">
                      <span
                        v-for="(voter, voteIndex) in interest.voters"
                        :key="`${item.key}-${interest.playerKey}-vote-${voteIndex}`"
                        class="loot-council-interest__vote-badge"
                      >
                        ✔
                      </span>
                    </div>
                  </div>
                  <div
                    class="loot-council-interest__replacement"
                    :class="{
                      'loot-council-interest__replacement--none': !interest.replacing
                    }"
                  >
                    <template v-if="interest.replacing">
                      <span class="loot-council-interest__replacement-label">Replacing</span>
                      <div
                        v-if="hasValidIconId(interest.replacingItemIconId)"
                        class="loot-council-interest__replacement-icon"
                        @mouseenter="showLootCouncilReplacingTooltip($event, interest)"
                        @mousemove="updateTooltipPosition($event)"
                        @mouseleave="hideItemTooltip"
                      >
                        <img
                          :src="getLootIconSrc(interest.replacingItemIconId)"
                          :alt="`${interest.replacing} icon`"
                          loading="lazy"
                        />
                      </div>
                      <span
                        class="loot-council-interest__replacement-name"
                        @mouseenter="showLootCouncilReplacingTooltip($event, interest)"
                        @mousemove="updateTooltipPosition($event)"
                        @mouseleave="hideItemTooltip"
                      >
                        {{ interest.replacing }}
                      </span>
                    </template>
                    <span v-else class="loot-council-interest__replacement-none">
                      Not replacing a current item
                    </span>
                  </div>
                </div>
                <div class="loot-council-interest__meta">
                  <span class="loot-council-interest__vote-count">
                    {{ getInterestVoteCount(interest) }}
                    {{ getInterestVoteCount(interest) === 1 ? 'vote' : 'votes' }}
                  </span>
                  <span class="loot-council-interest__timestamp">
                    {{ formatRelativeTime(interest.lastUpdatedAt.toISOString()) }}
                  </span>
                </div>
              </li>
            </ul>
            <p v-else class="muted x-small loot-council-column__empty">
              Waiting for raiders to signal interest…
            </p>
          </article>
        </div>
      </section>
    </div>
  </div>

    <section
      v-if="canManageLoot && monitorSession"
      class="card monitor-card"
      role="status"
      aria-live="polite"
    >
      <div class="monitor-card__status">
        <div
          class="monitor-card__pulse"
          :class="{
            'monitor-card__pulse--degraded': monitorHealthStatus === 'degraded',
            'monitor-card__pulse--recovering': monitorHealthStatus === 'recovering',
            'monitor-card__pulse--error': monitorHealthStatus === 'error'
          }"
          aria-hidden="true"
        ></div>
        <div>
          <h2>Live Log Monitoring</h2>
          <p class="monitor-card__user">
            {{
              monitorSession.isOwner
                ? 'You are monitoring this raid log.'
                : `${monitorSession.user.displayName} is monitoring this raid.`
            }}
          </p>
          <p class="monitor-card__file">{{ monitorSession.fileName }}</p>
          <p class="muted x-small">Started {{ formatDate(monitorSession.startedAt) }}</p>
          <p v-if="monitorHealthMessage" class="monitor-card__health-warning">
            {{ monitorHealthMessage }}
          </p>
        </div>
      </div>
      <div class="monitor-card__actions">
        <p class="muted small">
          Last update {{ formatRelativeTime(monitorSession.lastHeartbeatAt) }}
        </p>
        <p class="muted small">Log uploads are locked until monitoring stops.</p>
        <button
          v-if="monitorSession.isOwner"
          class="btn btn--danger btn--small"
          type="button"
          :disabled="monitorStopping"
          @click="stopActiveMonitor()"
        >
          {{ monitorStopping ? 'Stopping…' : 'Stop Monitoring' }}
        </button>
        <button
          v-else-if="canForceStopMonitor"
          class="btn btn--danger btn--small"
          type="button"
          :disabled="monitorStopping"
          @click="stopActiveMonitor({ force: true })"
        >
          {{ monitorStopping ? 'Stopping…' : 'Force Stop' }}
        </button>
        <p v-else class="muted x-small">
          Only raid leaders or officers can stop an active monitor.
        </p>
      </div>
    </section>

    <section v-if="canManageLoot && !monitorSession && parsedLoot.length === 0" class="card">
      <header class="card__header">
        <div>
          <h2>Upload Log</h2>
          <p class="muted">Upload an EverQuest log to detect loot drops during this raid.</p>
          <p class="muted x-small">
            After selecting a file you can upload once or start continuous monitoring.
          </p>
        </div>
      </header>
      <div
        class="upload-drop"
        :class="{
          'upload-drop--active': dragActive,
          'upload-drop--disabled': monitorStarting || clearingLoot
        }"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="handleDrop"
      >
        <p v-if="continuousMonitorError" class="error-text">{{ continuousMonitorError }}</p>
        <div v-if="!parsing" class="upload-drop__prompt">
          <p v-if="supportsContinuousMonitoring">Select a log to upload or monitor.</p>
          <p v-else>Drag a log file here or</p>
          <button
            v-if="supportsContinuousMonitoring"
            class="btn btn--outline btn--small upload-drop__button"
            type="button"
            :disabled="monitorStarting || clearingLoot"
            @click="promptFileSelection"
          >
            <span class="btn__icon">📁</span>
            {{ monitorStarting ? 'Preparing…' : 'Select Log File' }}
          </button>
          <label v-else class="btn btn--outline btn--small upload-drop__button">
            <span class="btn__icon">📁</span>
            Select Log File
            <input
              ref="fileInput"
              class="sr-only"
              type="file"
              accept=".txt,.log"
              :disabled="monitorStarting || clearingLoot"
              @change="handleLegacyFileSelect"
            />
          </label>
          <input
            v-if="supportsContinuousMonitoring"
            ref="fileInput"
            class="sr-only"
            type="file"
            accept=".txt,.log"
            :disabled="monitorStarting || clearingLoot"
            @change="handleLegacyFileSelect"
          />
        </div>
        <p v-else>Parsing log… {{ parseProgress }}%</p>
        <div v-if="parsing" class="progress">
          <div class="progress__bar" :style="{ width: `${parseProgress}%` }"></div>
        </div>
      </div>
    </section>
    <section v-else-if="!canManageLoot" class="card upload-status-card">
      <header class="card__header">
        <div>
          <h2>Upload Log</h2>
          <p class="muted">
            {{
              monitorSession
                ? `${monitorSession.user.displayName} is currently streaming logs for this raid.`
                : 'Waiting for raid leadership to upload or monitor logs for this raid.'
            }}
          </p>
        </div>
      </header>
      <div class="upload-status-card__body">
        <template v-if="monitorSession">
          <p class="muted small">
            File: <strong>{{ monitorSession.fileName }}</strong>
          </p>
          <p class="muted small">
            Last update {{ formatRelativeTime(monitorSession.lastHeartbeatAt) }} • Started
            {{ formatDate(monitorSession.startedAt) }}
          </p>
        </template>
        <p v-else class="muted small">
          No live monitoring is active. Loot council updates will appear once leadership streams a
          log.
        </p>
      </div>
    </section>

    <section v-if="isRaidActive" class="card loot-disposition-card">
      <header class="card__header">
        <div>
          <h2>Loot Disposition</h2>
          <p class="muted">
            {{ lootDispositionHistory.length }} loot actions during this raid
          </p>
        </div>
      </header>
      <p v-if="lootDispositionHistory.length === 0" class="muted">
        No loot disposition events recorded yet. Events will appear here as loot is awarded, discarded, or otherwise distributed during active monitoring.
      </p>
      <template v-else>
        <div v-if="lootDispositionHistory.length > 0" class="loot-disposition-search">
          <input
            v-model="lootDispositionSearch"
            type="text"
            class="loot-disposition-search__input"
            placeholder="Search items, recipients, or actions..."
          />
        </div>
        <p v-if="filteredLootDispositionHistory.length === 0" class="muted loot-disposition-no-results">
          No results matching "{{ lootDispositionSearch }}".
        </p>
        <div v-else class="loot-disposition-table-wrapper">
          <table class="loot-disposition-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Item</th>
                <th>Recipient</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in paginatedLootDispositionHistory" :key="entry.id">
                <td class="loot-disposition-table__time">
                  {{ formatDispositionTime(entry.timestamp) }}
                </td>
                <td class="loot-disposition-table__action">
                  <span :class="['loot-disposition-badge', getDispositionBadgeClass(entry.actionType)]">
                    {{ entry.actionType }}
                  </span>
                </td>
                <td class="loot-disposition-table__item">
                  <div
                    class="loot-disposition-item"
                    @mouseenter="showDispositionItemTooltip($event, entry)"
                    @mousemove="updateTooltipPosition($event)"
                    @mouseleave="hideItemTooltip"
                  >
                    <span
                      v-if="hasValidIconId(entry.itemIconId)"
                      class="loot-disposition-item__icon"
                    >
                      <img
                        :src="getLootIconSrc(entry.itemIconId)"
                        :alt="`${entry.itemName} icon`"
                        loading="lazy"
                      />
                    </span>
                    <span class="loot-disposition-item__name">{{ entry.itemName }}</span>
                  </div>
                </td>
                <td class="loot-disposition-table__recipient">
                  {{ entry.recipientName ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="lootDispositionTotalPages > 1" class="loot-disposition-pagination">
            <button
              class="loot-disposition-pagination__btn"
              :disabled="lootDispositionPage <= 1"
              @click="lootDispositionPage = lootDispositionPage - 1"
            >
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
              Previous
            </button>
            <span class="loot-disposition-pagination__info">
              Page {{ lootDispositionPage }} of {{ lootDispositionTotalPages }}
            </span>
            <button
              class="loot-disposition-pagination__btn"
              :disabled="lootDispositionPage >= lootDispositionTotalPages"
              @click="lootDispositionPage = lootDispositionPage + 1"
            >
              Next
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
      </template>
    </section>

    <section class="card">
      <header class="card__header">
        <div>
          <h2>Existing Loot</h2>
          <p class="muted">{{ lootEvents.length }} entries recorded.</p>
        </div>
        <button
          v-if="canManageLoot"
          class="btn btn--outline btn--small btn--add-loot"
          type="button"
          @click="openManualModal"
        >
          <span class="btn__icon">+</span>
          Record Loot
        </button>
      </header>
      <p v-if="lootEvents.length === 0" class="muted">No loot recorded yet.</p>
      <div v-else class="loot-grid">
        <article
          v-for="entry in groupedExistingLoot"
          :key="entry.id"
          :class="['loot-card', { 'loot-card--needs-assignment': entry.isMasterLooter }]"
          role="button"
          tabindex="0"
          @click="handleExistingLootCardClick($event, entry.itemName, entry.itemId)"
          @contextmenu.prevent="openLootContextMenu($event, entry)"
          @keyup.enter="handleExistingLootCardKeyEnter($event, entry.itemName, entry.itemId)"
        >
          <div class="loot-card__count">{{ entry.count }}×</div>
          <header class="loot-card__header">
            <div
              class="loot-card__icon"
              @mouseenter="showItemTooltip($event, entry)"
              @mousemove="updateTooltipPosition($event)"
              @mouseleave="hideItemTooltip"
            >
              <template v-if="hasValidIconId(entry.itemIconId)">
                <img
                  :src="getLootIconSrc(entry.itemIconId)"
                  :alt="`${entry.itemName} icon`"
                  loading="lazy"
                />
              </template>
              <span v-else class="loot-card__emoji">{{ entry.emoji }}</span>
            </div>
            <div>
              <p class="loot-card__item">{{ entry.itemName }}</p>
              <p class="loot-card__looter">
                <template v-if="entry.isGuildBank">
                  <span class="loot-card__looter-name">{{ entry.displayLooterName }}</span>
                </template>
                <template v-else-if="entry.isMasterLooter">
                  <span class="loot-card__looter-name loot-card__looter-name--unassigned">
                    {{ entry.displayLooterName }}
                  </span>
                </template>
                <template v-else>
                  <span
                    class="loot-card__looter-name clickable"
                    role="button"
                    tabindex="0"
                    @click.stop="openInventory(entry.displayLooterName)"
                    @keydown.enter.stop="openInventory(entry.displayLooterName)"
                  >
                    {{ entry.displayLooterName }}
                  </span>
                </template>
              </p>
            </div>
          </header>
          <span
            v-if="entry.isWhitelisted"
            class="loot-card__badge loot-card__badge--whitelist"
            title="Whitelisted"
            aria-label="Whitelisted item"
          >
            ⭐
          </span>
          <p v-if="entry.note" class="loot-card__note">{{ entry.note }}</p>
          <footer v-if="canDeleteExistingLoot" class="loot-card__actions">
            <button
              class="icon-button icon-button--delete"
              type="button"
              @click.stop="deleteLootGroup(entry)"
              :aria-label="`Delete ${entry.itemName} for ${entry.displayLooterName}`"
            >
              🗑️
            </button>
          </footer>
        </article>
      </div>
    </section>

    <div v-if="showManualModal" class="modal-backdrop" @click.self="closeManualModal">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Manual Loot Entry</h3>
            <p class="muted small">
              Use this when you want to record a drop without importing a log line.
            </p>
          </div>
          <button class="icon-button" type="button" @click="closeManualModal">✕</button>
        </header>
        <form class="manual-form" @submit.prevent="createManualEntry">
          <div class="manual-form__grid">
            <input v-model="manualForm.itemName" type="text" placeholder="Item name" required />
            <input v-model="manualForm.looterName" type="text" placeholder="Looter" required />
            <input v-model="manualForm.looterClass" type="text" placeholder="Class" />
            <input v-model="manualForm.emoji" type="text" placeholder="Emoji" maxlength="4" />
            <textarea v-model="manualForm.note" rows="3" placeholder="Note (optional)"></textarea>
          </div>
          <footer class="form__actions">
            <button class="btn btn--outline" type="button" @click="closeManualModal">Cancel</button>
            <button class="btn" type="submit" :disabled="manualSaving">
              {{ manualSaving ? 'Adding…' : 'Add Loot' }}
            </button>
          </footer>
        </form>
      </div>
    </div>

    <div v-if="editLootModal.visible" class="modal-backdrop">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Edit Loot Entry</h3>
            <p class="muted small">Update the assignee or quantity for this loot drop.</p>
          </div>
          <button class="icon-button" type="button" :disabled="editLootModal.saving" @click="closeEditLootModal">
            ✕
          </button>
        </header>
        <form class="edit-loot-form" @submit.prevent="saveEditedLoot">
          <label class="form__field">
            <span>Item</span>
            <input
              type="text"
              :value="editLootModal.entry?.itemName ?? ''"
              disabled
            />
          </label>
          <label class="form__field">
            <span>Assigned To</span>
            <input
              v-model="editLootModal.form.looterName"
              type="text"
              required
              :disabled="editLootModal.saving"
            />
          </label>
          <label class="form__field">
            <span>Item ID (optional)</span>
            <input
              v-model.number="editLootModal.form.itemId"
              type="number"
              min="1"
              step="1"
              placeholder="12345"
              :disabled="editLootModal.saving"
            />
            <small class="form__hint">Set this to pull the matching EQ icon.</small>
          </label>
          <label class="form__field">
            <span>Quantity</span>
            <input
              v-model.number="editLootModal.form.count"
              type="number"
              min="1"
              required
              :disabled="editLootModal.saving"
            />
          </label>
          <footer class="form__actions">
            <button
              class="btn btn--outline btn--modal-outline"
              type="button"
              :disabled="editLootModal.saving"
              @click="closeEditLootModal"
            >
              Cancel
            </button>
            <button class="btn btn--modal-primary" type="submit" :disabled="editLootModal.saving">
              {{ editLootModal.saving ? 'Saving…' : 'Save Changes' }}
            </button>
          </footer>
        </form>
      </div>
    </div>

    <div
      v-if="assignLootModal.visible"
      class="modal-backdrop"
      @click.self="closeAssignLootModal()"
    >
      <div class="modal assign-loot-modal">
        <header class="modal__header">
          <div>
            <h3>Assign Loot</h3>
            <p class="muted small">
              Choose a guild character to assign
              <strong>{{ assignLootModal.entry?.itemName }}</strong>.
            </p>
          </div>
          <button
            class="icon-button"
            type="button"
            :disabled="assignLootModal.saving"
          @click="closeAssignLootModal()"
          >
            ✕
          </button>
        </header>
        <div class="assign-loot__body">
          <div v-if="assignLootModal.entry" class="assign-loot__current muted small">
            Currently assigned to
            <strong>{{ assignLootModal.entry.displayLooterName }}</strong>
          </div>
          <label class="assign-loot__search-label">
            <span class="sr-only">Search characters</span>
            <input
              ref="assignSearchInput"
              v-model="assignLootModal.search"
              type="search"
              class="assign-loot__search"
              placeholder="Search characters"
              :disabled="assignLootModal.loading || assignLootModal.saving"
            />
          </label>
          <div class="assign-loot__list">
            <p v-if="assignLootModal.loading || guildCharactersLoading" class="muted small">
              Loading characters…
            </p>
            <p v-else-if="filteredAssignableCharacters.length === 0" class="muted small">
              No characters match your search.
            </p>
            <ul v-else class="assign-loot__options">
              <li
                v-for="character in filteredAssignableCharacters"
                :key="character.id"
              >
                <label class="assign-loot__option">
                  <input
                    class="assign-loot__radio"
                    type="radio"
                    :value="character.id"
                    v-model="assignLootModal.selectedCharacterId"
                    :disabled="assignLootModal.saving"
                  />
                    <span class="assign-loot__option-text">
                      <span class="assign-loot__option-name">{{ character.name }}</span>
                      <span class="assign-loot__option-meta">
                        <span v-if="character.level">Lv {{ character.level }}</span>
                        <span>{{ character.userName }}</span>
                        <span v-if="character.isMain" class="assign-loot__badge">Main</span>
                        <span v-if="character.isGuildBank" class="assign-loot__badge assign-loot__badge--bank">Guild Bank</span>
                      </span>
                    </span>
                </label>
              </li>
            </ul>
          </div>
          <p v-if="assignLootModal.error" class="error-text assign-loot__error">
            {{ assignLootModal.error }}
          </p>
        </div>
        <footer class="assign-loot__actions">
          <button
            class="btn btn--outline btn--modal-outline"
            type="button"
            :disabled="assignLootModal.saving"
            @click="closeAssignLootModal()"
          >
            Cancel
          </button>
          <button
            class="btn btn--modal-primary"
            type="button"
            :disabled="assignLootModal.saving || !assignLootModal.selectedCharacterId"
            @click="confirmAssignLoot"
          >
            {{ assignLootModal.saving ? 'Assigning…' : 'Assign' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="showWindowModal" class="modal-backdrop" @click.self="closeWindowModal">
      <div class="modal">
        <header class="modal__header">
          <div>
            <h3>Adjust Parsing Window</h3>
            <p class="muted small">
              This only affects log parsing and will not change the raid’s actual schedule.
            </p>
          </div>
          <button class="icon-button" type="button" @click="closeWindowModal">✕</button>
        </header>
        <form class="window-form" @submit.prevent="saveParsingWindow">
          <label class="form__field">
            <span>Start Date &amp; Time</span>
            <input v-model="parsingWindowForm.start" type="datetime-local" required />
          </label>
          <label class="form__field">
            <span>End Date &amp; Time</span>
            <input v-model="parsingWindowForm.end" type="datetime-local" />
            <small class="muted"
              >Leave blank to parse until the end of the uploaded log file.</small
            >
          </label>
          <div class="window-form__controls">
            <button
              class="btn btn--outline btn--small btn--modal-outline"
              type="button"
              @click="resetWindowToRaidTimes"
            >
              Reset to Raid Times
            </button>
            <div class="window-form__actions">
              <button
                class="btn btn--outline btn--modal-outline"
                type="button"
                @click="closeWindowModal"
              >
                Cancel
              </button>
              <button class="btn btn--modal-primary" type="submit">Save Window</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <section v-if="canManageLoot && showDebugConsole" class="card debug-console">
      <header class="card__header">
        <h2>Debug Console</h2>
        <div class="debug-console__actions">
          <button
            class="btn btn--outline btn--small"
            type="button"
            :disabled="debugLogs.length === 0"
            @click="copyDebugLogs"
          >
            Copy Logs
          </button>
          <button
            class="btn btn--outline btn--small"
            type="button"
            :disabled="debugLogs.length === 0"
            @click="debugLogs = []"
          >
            Clear
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="handleResetProcessedLogs">
            Reset Processed Logs
          </button>
        </div>
      </header>
      <div class="debug-console__body">
        <p v-if="debugLogs.length === 0" class="muted small">No debug output yet.</p>
        <ul v-else class="debug-console__list">
          <li v-for="entry in debugLogs" :key="entry.id" class="debug-console__entry">
            <div>
              <p class="debug-console__timestamp">
                {{ formatDate(entry.timestamp.toISOString()) }}
              </p>
              <p class="debug-console__message">{{ entry.message }}</p>
            </div>
            <pre v-if="entry.context" class="debug-console__context">{{
              formatContext(entry.context)
            }}</pre>
          </li>
        </ul>
      </div>
    </section>

    <div v-if="detectedLootModalOpen" class="modal-backdrop">
      <div class="modal modal--wide">
        <header class="modal__header">
          <div>
            <h3>Detected Loot</h3>
            <p class="muted small">Review each drop before adding it to the raid log.</p>
          </div>
          <div class="modal__header-actions">
            <button
              class="icon-button icon-button--muted"
              type="button"
              aria-label="Minimize detected loot modal"
              @click="minimizeDetectedLootModal"
            >
              ▁
            </button>
            <button class="icon-button" type="button" aria-label="Close" @click="closeDetectedLootModal">
              ✕
            </button>
          </div>
        </header>
        <div class="detected-controls">
          <button
            class="btn detected-control detected-control--keep"
            type="button"
            @click="setAllKept(true)"
          >
            🟢 Keep All
          </button>
          <button
            class="btn detected-control detected-control--discard"
            type="button"
            @click="setAllKept(false)"
          >
            🔴 Discard All
          </button>
        </div>
        <div class="detected-table-wrapper">
          <table class="loot-table">
            <thead>
              <tr>
                <th>Disposition</th>
                <th>Time</th>
                <th>Looter</th>
                <th>Item</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in paginatedParsedLoot"
                :key="row.id"
                :class="{
                  'loot-table__row--discarded':
                    row.disposition === 'DISCARD' || row.disposition === 'BLACKLIST'
                }"
              >
                <td>
                  <div class="disposition-buttons">
                    <button
                      v-for="option in dispositionOptions"
                      :key="option.value"
                      type="button"
                      class="disposition-button"
                      :class="{
                        'disposition-button--selected': row.disposition === option.value,
                        'disposition-button--keep': option.value === 'KEEP',
                        'disposition-button--discard': option.value === 'DISCARD',
                        'disposition-button--whitelist': option.value === 'WHITELIST',
                        'disposition-button--blacklist': option.value === 'BLACKLIST'
                      }"
                      :disabled="option.requiresManage && !canManageLootLists"
                      @click="handleDispositionChange(row, option.value)"
                    >
                      <span class="disposition-button__icon">{{ option.icon }}</span>
                      <span class="disposition-button__label">{{ option.label }}</span>
                    </button>
                  </div>
                </td>
                <td>{{ row.timestamp ? formatDate(row.timestamp.toISOString()) : '—' }}</td>
                <td>
                  <input v-model="row.looterName" type="text" />
                </td>
                <td>
                  <input v-model="row.itemName" type="text" />
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="parsedLootTotalPages > 1" class="pagination pagination--detected">
            <button
              class="pagination__button"
              type="button"
              :disabled="parsedLootPage === 1"
              @click="parsedLootPage -= 1"
            >
              Previous
            </button>
            <span class="pagination__label"
              >Page {{ parsedLootPage }} of {{ parsedLootTotalPages }}</span
            >
            <button
              class="pagination__button"
              type="button"
              :disabled="parsedLootPage === parsedLootTotalPages"
              @click="parsedLootPage += 1"
            >
              Next
            </button>
          </div>
        </div>
        <footer class="form__actions form__actions--single">
          <button
            class="btn detected-save-button"
            type="button"
            :disabled="savingLoot"
            @click="saveParsedLoot"
          >
            {{ savingLoot ? 'Saving…' : 'Save' }}
          </button>
        </footer>
      </div>
    </div>
    <div
      v-if="lootContextMenu.visible"
      class="loot-context-menu"
      :style="{ top: `${lootContextMenu.y}px`, left: `${lootContextMenu.x}px` }"
      @contextmenu.prevent
      @click.stop
    >
      <header class="loot-context-menu__header">{{ lootContextMenu.itemName }}</header>
      <button
        v-if="canManageLoot"
        class="loot-context-menu__action"
        type="button"
        @click="handleAssignLootClick"
      >
        Assign To…
      </button>
      <button
        v-if="canDeleteExistingLoot"
        class="loot-context-menu__action"
        type="button"
        @click="handleEditLootClick"
      >
        Edit Loot…
      </button>
      <button
        v-if="canDeleteExistingLoot"
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="handleRemoveLootClick"
      >
        Remove
      </button>
      <button
        v-if="canManageLootLists && !lootContextMenu.whitelistEntry"
        class="loot-context-menu__action"
        type="button"
        @click="addItemToLootList('WHITELIST')"
      >
        Add to Whitelist
      </button>
      <button
        v-else-if="canManageLootLists"
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('WHITELIST')"
      >
        Remove from Whitelist
      </button>
      <button
        v-if="canManageLootLists && !lootContextMenu.blacklistEntry"
        class="loot-context-menu__action"
        type="button"
        @click="addItemToLootList('BLACKLIST')"
      >
        Add to Blacklist
      </button>
      <button
        v-else-if="canManageLootLists"
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('BLACKLIST')"
      >
        Remove from Blacklist
      </button>
    </div>
  </section>
  <p v-else class="muted">Loading raid…</p>

  <!-- Instance Clarification Modal -->
  <div v-if="showInstanceClarificationModal" class="modal-backdrop" @click.self="closeInstanceClarificationModal">
    <div class="modal instance-clarification-modal">
      <header class="modal__header">
        <div>
          <h3>Instance Kill Clarification</h3>
          <p class="muted small">These NPCs exist in both instance and overworld versions. Please confirm where each kill occurred.</p>
        </div>
        <button class="icon-button" type="button" @click="closeInstanceClarificationModal">✕</button>
      </header>
      <div class="modal__body">
        <div class="clarification-list">
          <div
            v-for="(kill, index) in instanceClarifications"
            :key="`${kill.npcDefinitionId}-${kill.killedAt}`"
            class="clarification-item"
          >
            <div class="clarification-info">
              <strong>{{ kill.npcName }}</strong>
              <span class="kill-time">{{ formatClarificationTime(kill.killedAt) }}</span>
              <span v-if="kill.killedByName" class="kill-by">by {{ kill.killedByName }}</span>
            </div>
            <div class="clarification-toggle">
              <label class="toggle-option">
                <input
                  v-model="instanceClarifications[index].isInstance"
                  type="radio"
                  :value="false"
                  :name="`instance-toggle-${index}`"
                />
                <span>Overworld</span>
              </label>
              <label class="toggle-option">
                <input
                  v-model="instanceClarifications[index].isInstance"
                  type="radio"
                  :value="true"
                  :name="`instance-toggle-${index}`"
                />
                <span>Instance</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <footer class="modal__footer">
        <button class="btn btn--outline" type="button" @click="closeInstanceClarificationModal">
          Cancel
        </button>
        <button
          class="btn btn--primary"
          type="button"
          :disabled="submittingClarifications"
          @click="submitInstanceClarifications"
        >
          {{ submittingClarifications ? 'Saving...' : 'Save Kills' }}
        </button>
      </footer>
    </div>
  </div>
  <!-- Zone Clarification Modal -->
  <div v-if="showZoneClarificationModal" class="modal-backdrop" @click.self="closeZoneClarificationModal">
    <div class="modal zone-clarification-modal">
      <header class="modal__header">
        <div>
          <h3>Zone Clarification Required</h3>
          <p class="muted small">These NPCs exist in multiple zones. Please select the correct zone for each kill.</p>
        </div>
        <button class="icon-button" type="button" @click="closeZoneClarificationModal">✕</button>
      </header>
      <div class="modal__body">
        <div class="clarification-list">
          <div
            v-for="(kill, index) in zoneClarifications"
            :key="`zone-${kill.npcName}-${kill.killedAt}`"
            class="clarification-item"
          >
            <div class="clarification-info">
              <strong>{{ kill.npcName }}</strong>
              <span class="kill-time">{{ formatClarificationTime(kill.killedAt) }}</span>
              <span v-if="kill.killedByName" class="kill-by">by {{ kill.killedByName }}</span>
            </div>
            <select
              v-model="zoneClarifications[index].selectedNpcDefinitionId"
              class="zone-select"
            >
              <option
                v-for="option in kill.zoneOptions"
                :key="option.npcDefinitionId"
                :value="option.npcDefinitionId"
              >
                {{ option.zoneName ?? 'Unknown Zone' }}
              </option>
            </select>
          </div>
        </div>
      </div>
      <footer class="modal__footer">
        <button class="btn btn--outline" type="button" @click="closeZoneClarificationModal">
          Cancel
        </button>
        <button
          class="btn btn--primary"
          type="button"
          :disabled="submittingZoneClarifications"
          @click="submitZoneClarifications"
        >
          {{ submittingZoneClarifications ? 'Saving...' : 'Save Kills' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import CharacterLink from '../components/CharacterLink.vue';
import { RouterLink, useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { isAxiosError } from 'axios';

import {
  api,
  type GuildLootParserSettings,
  type GuildLootListEntry,
  type GuildLootListSummary,
  type LootCouncilState,
  type LootCouncilStateItem,
  type PendingInstanceClarification,
  type PendingZoneClarification,
  type RaidDetail,
  type RaidLootEvent,
  type RaidLogMonitorSession
} from '../services/api';
import { characterClassLabels, getCharacterClassIcon, type CharacterClass } from '../services/types';
import {
  parseLootLog,
  type GuildLootParserPattern,
  type ParsedLootEvent
} from '../services/lootParser';
import {
  parseLootCouncilEvents,
  type LootCouncilEvent,
  type LootCouncilInterestMode,
  type LootCouncilConsideredOrigin
} from '../services/lootCouncilParser';
import { parseNpcKills, type ParsedNpcKillEvent } from '../services/npcKillParser';
import { useAuthStore } from '../stores/auth';
import { useMonitorStore } from '../stores/monitor';
import { useAttentionStore } from '../stores/attention';
import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { convertPlaceholdersToRegex } from '../utils/patternPlaceholders';
import { buildLootListLookup, matchesLootListEntry, normalizeLootItemName } from '../utils/lootLists';
import { getDefaultLogHandle } from '../utils/defaultLogHandle';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import { extractErrorMessage } from '../utils/errors';
import {
  getGuildBankDisplayName,
  normalizeLooterName,
  normalizeLooterForSubmission as normalizeLooterForSubmissionUtil,
  isGuildBankName as isGuildBankNameUtil,
  isMasterLooterName as isMasterLooterNameUtil
} from '../utils/lootNames';

type DetectedLootDisposition = 'KEEP' | 'DISCARD' | 'WHITELIST' | 'BLACKLIST';

interface ParsedRow {
  id: string;
  timestamp: Date | null;
  rawLine: string;
  itemName: string;
  itemId: number | null;
  looterName: string;
  emoji: string;
  disposition: DetectedLootDisposition;
}

interface DebugLogEntry {
  id: number;
  timestamp: Date;
  message: string;
  context?: Record<string, unknown>;
}

interface GroupedLootEntry {
  id: string;
  itemName: string;
  itemId: number | null;
  itemIconId: number | null;
  looterName: string;
  looterClass?: string | null;
  displayLooterName: string;
  isGuildBank: boolean;
  isMasterLooter: boolean;
  emoji: string;
  note?: string | null;
  count: number;
  eventIds: string[];
  isWhitelisted: boolean;
}

interface AssignableCharacterOption {
  id: string;
  name: string;
  class: CharacterClass | null;
  level: number;
  isMain: boolean;
  userName: string;
  userId: string | null;
  isGuildBank: boolean;
}

type HandlePermissionDescriptor = {
  mode?: 'read' | 'readwrite';
};

type LocalFileHandle = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  requestPermission?: (descriptor?: HandlePermissionDescriptor) => Promise<PermissionState>;
  queryPermission?: (descriptor?: HandlePermissionDescriptor) => Promise<PermissionState>;
};

type LootConsoleStatus = 'ACCEPTED' | 'REJECTED';

interface LootConsoleItem {
  id: string;
  line: string;
  status: LootConsoleStatus;
}

interface LootConsolePayload {
  line: string;
  status: LootConsoleStatus;
}

type LootCouncilItemStatus = 'ACTIVE' | 'AWARDED' | 'REMOVED';

interface LootCouncilInterestState {
  playerKey: string;
  playerName: string;
  replacing?: string | null;
  replacingItemId?: number | null;
  replacingItemIconId?: number | null;
  mode: LootCouncilInterestMode;
  votes?: number | null;
  lastUpdatedAt: Date;
  source: 'LIVE' | 'SYNC';
  voters: string[];
  classHint?: CharacterClass | null;
}

interface LootCouncilItemState {
  key: string;
  nameKey: string;
  instanceId: number;
  itemName: string;
  itemId?: number | null;
  itemIconId?: number | null;
  ordinal?: number | null;
  startedAt: Date;
  lastUpdatedAt: Date;
  status: LootCouncilItemStatus;
  awardedTo?: string | null;
  interests: LootCouncilInterestState[];
}

type LootDispositionActionType =
  | 'Council Award'
  | 'Random'
  | 'Assigned'
  | 'Taken'
  | 'Guild Banked'
  | 'Abandoned'
  | 'Discarded';

interface LootDispositionEntry {
  id: string;
  timestamp: Date;
  actionType: LootDispositionActionType;
  itemName: string;
  itemId: number | null;
  itemIconId: number | null;
  recipientName: string | null;
}

defineOptions({ name: 'LootTrackerView' });

const route = useRoute();
const router = useRouter();
const raidId = route.params.raidId as string;
const monitorStore = useMonitorStore();
const attentionStore = useAttentionStore();
const guildBankStore = useGuildBankStore();
const tooltipStore = useItemTooltipStore();

function openInventory(characterName: string) {
  const gid = raid.value?.guildId || raid.value?.guild?.id;
  if (!gid) return;
  guildBankStore.openCharacterInventory(characterName, gid);
}

// Tooltip handlers for item icons
function showItemTooltip(event: MouseEvent, entry: GroupedLootEntry) {
  if (!entry.itemId) return;
  tooltipStore.showTooltip(
    { itemId: entry.itemId, itemName: entry.itemName, itemIconId: entry.itemIconId },
    { x: event.clientX, y: event.clientY }
  );
}

function updateTooltipPosition(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function hideItemTooltip() {
  tooltipStore.hideTooltip();
}

function showDispositionItemTooltip(event: MouseEvent, entry: LootDispositionEntry) {
  if (!entry.itemId) return;
  tooltipStore.showTooltip(
    { itemId: entry.itemId, itemName: entry.itemName, itemIconId: entry.itemIconId ?? undefined },
    { x: event.clientX, y: event.clientY }
  );
}

function formatDispositionTime(timestamp: Date): string {
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    return '—';
  }
  return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getDispositionBadgeClass(actionType: LootDispositionActionType): string {
  switch (actionType) {
    case 'Council Award':
      return 'loot-disposition-badge--council';
    case 'Random':
      return 'loot-disposition-badge--random';
    case 'Assigned':
      return 'loot-disposition-badge--assigned';
    case 'Taken':
      return 'loot-disposition-badge--taken';
    case 'Guild Banked':
      return 'loot-disposition-badge--banked';
    case 'Abandoned':
      return 'loot-disposition-badge--abandoned';
    case 'Discarded':
      return 'loot-disposition-badge--discarded';
    default:
      return '';
  }
}

function showLootCouncilItemTooltip(event: MouseEvent, item: LootCouncilItemState) {
  if (!item.itemId) return;
  tooltipStore.showTooltip(
    { itemId: item.itemId, itemName: item.itemName, itemIconId: item.itemIconId ?? undefined },
    { x: event.clientX, y: event.clientY }
  );
}

function showLootCouncilReplacingTooltip(event: MouseEvent, interest: LootCouncilInterestState) {
  if (!interest.replacingItemId || !interest.replacing) return;
  tooltipStore.showTooltip(
    { itemId: interest.replacingItemId, itemName: interest.replacing, itemIconId: interest.replacingItemIconId ?? undefined },
    { x: event.clientX, y: event.clientY }
  );
}

const raid = ref<RaidDetail | null>(null);
const GUILD_BANK_ID = '__guild_bank__';

const guildBankDisplayName = computed(() =>
  getGuildBankDisplayName(raid.value?.guild.name ?? null)
);
const canManageLoot = computed(() => raid.value?.permissions?.canManage ?? false);
const canManageLootLists = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});

function normalizeLooterNameValue(value?: string | null): string {
  return normalizeLooterName(value ?? null, raid.value?.guild.name ?? null).name;
}

function isGuildBankName(value?: string | null): boolean {
  return isGuildBankNameUtil(value ?? null, raid.value?.guild.name ?? null);
}

function isMasterLooterName(value?: string | null): boolean {
  return isMasterLooterNameUtil(value ?? null);
}

function normalizeLooterForSubmission(value: string): string {
  return normalizeLooterForSubmissionUtil(value, raid.value?.guild.name ?? null);
}

const lootEvents = ref<RaidLootEvent[]>([]);

function normalizeRaidLootEvents(events: RaidLootEvent[]): RaidLootEvent[] {
  return events.map((event) => {
    const { name, isGuildBank, isMasterLooter } = normalizeLooterName(
      event.looterName ?? null,
      raid.value?.guild.name ?? null
    );
    return {
      ...event,
      looterName: name,
      looterClass: isGuildBank || isMasterLooter ? null : event.looterClass ?? null
    };
  });
}

async function refreshLootEvents() {
  const events = await api.fetchRaidLoot(raidId);
  lootEvents.value = normalizeRaidLootEvents(events);
  reconcileLootCouncilWithAssignments();
}
const parserSettings = ref<GuildLootParserSettings | null>(null);
const parsedLoot = ref<ParsedRow[]>([]);
const parsing = ref(false);
const parseProgress = ref(0);
const dragActive = ref(false);
const savingLoot = ref(false);
const manualSaving = ref(false);
const showManualModal = ref(false);
const showWindowModal = ref(false);
const showDebugConsole = ref(false);
const showDetectedModal = ref(false);
// Instance/Zone clarification modal state
const showInstanceClarificationModal = ref(false);
const instanceClarifications = ref<Array<PendingInstanceClarification & { isInstance: boolean }>>([]);
const submittingClarifications = ref(false);
const showZoneClarificationModal = ref(false);
const zoneClarifications = ref<Array<PendingZoneClarification & { selectedNpcDefinitionId: string }>>([]);
const submittingZoneClarifications = ref(false);
const parsedLootPage = ref(1);
const detectedLootModalOpen = computed(
  () => canManageLoot.value && showDetectedModal.value && parsedLoot.value.length > 0
);
const PAGE_SIZE = 10;
const parsedLootTotalPages = computed(() =>
  Math.max(1, Math.ceil(parsedLoot.value.length / PAGE_SIZE))
);
const paginatedParsedLoot = computed(() => {
  const total = parsedLootTotalPages.value;
  const currentPage = Math.min(parsedLootPage.value, total);
  const start = (currentPage - 1) * PAGE_SIZE;
  return parsedLoot.value.slice(start, start + PAGE_SIZE);
});

const showLeaveMonitorModal = ref(false);
type PendingNavigation = { type: 'route'; to: any } | { type: 'refresh' };

const pendingNavigation = ref<PendingNavigation | null>(null);
const allowImmediateUnload = ref(false);
const manualForm = reactive({
  itemName: '',
  looterName: '',
  looterClass: '',
  emoji: '💎',
  note: ''
});
const parsingWindow = reactive<{ start: string | null; end: string | null }>({
  start: null,
  end: null
});
const parsingWindowForm = reactive({
  start: '',
  end: ''
});
const debugLogs = ref<DebugLogEntry[]>([]);
const authStore = useAuthStore();
const showUploadModeModal = ref(false);
const pendingUploadFile = ref<File | null>(null);
const monitorSession = ref<RaidLogMonitorSession | null>(null);
const monitorHeartbeatInterval = ref(10_000);
const monitorTimeoutMs = ref(30_000);
const monitorStarting = ref(false);
const monitorStopping = ref(false);
const monitorStatusPollId = ref<number | null>(null);
const continuousMonitorError = ref<string | null>(null);
const monitorController = reactive({
  fileHandle: null as LocalFileHandle | null,
  lastSize: 0,
  pendingFragment: '',
  pollTimerId: null as number | null,
  heartbeatTimerId: null as number | null,
  fileSignature: null as string | null,
  pendingSummaryBlock: ''
});
// Monitor health tracking for resilience
const MONITOR_MAX_HEARTBEAT_RETRIES = 3;
const MONITOR_MAX_FILE_READ_FAILURES = 5;
const MONITOR_HEARTBEAT_RETRY_DELAY_MS = 2000;
const monitorHealth = reactive({
  heartbeatRetryCount: 0,
  consecutiveFileReadFailures: 0,
  lastSuccessfulHeartbeat: null as Date | null,
  lastSuccessfulFileRead: null as Date | null,
  isRecovering: false
});
const processedLogKeys = new Set<string>();
const processedNpcKillKeys = new Set<string>();
const processedLootCouncilKeys = new Set<string>();
let lootCouncilItemSequence = 0;
const summarySessionState = {
  sessionId: null as number | null,
  lastResetSessionKeyByName: new Map<string, string>(),
  sessionCounters: new Map<string, Map<string, number>>(),
  activeImplicitKey: null as string | null,
  implicitSessionCounter: 0,
  implicitSessionStartedAt: null as number | null,
  implicitSessionLastOrder: null as number | null
};
const lootCouncilDebugEnabled = true;
const activeLogSignature = ref<string | null>(null);
const PROCESSED_LOG_STORAGE_PREFIX = 'cw-raid-processed-log';
const LOOT_DISPOSITION_STORAGE_PREFIX = 'cw-raid-loot-disposition';
const LOOT_DISPOSITION_PAGE_SIZE = 10;
const lootDispositionHistory = ref<LootDispositionEntry[]>([]);
const lootDispositionSearch = ref('');
const lootDispositionPage = ref(1);

// Computed: Is the raid currently active (not ended)?
const isRaidActive = computed(() => raid.value && !raid.value.endedAt);

// Computed: Filter disposition history by search term
const filteredLootDispositionHistory = computed(() => {
  const search = lootDispositionSearch.value.trim().toLowerCase();
  if (!search) {
    return lootDispositionHistory.value;
  }
  return lootDispositionHistory.value.filter((entry) => {
    const itemMatch = entry.itemName?.toLowerCase().includes(search);
    const recipientMatch = entry.recipientName?.toLowerCase().includes(search);
    const actionMatch = entry.actionType?.toLowerCase().includes(search);
    return itemMatch || recipientMatch || actionMatch;
  });
});

// Computed: Total pages for disposition table
const lootDispositionTotalPages = computed(() =>
  Math.max(1, Math.ceil(filteredLootDispositionHistory.value.length / LOOT_DISPOSITION_PAGE_SIZE))
);

// Computed: Paginated disposition entries
const paginatedLootDispositionHistory = computed(() => {
  const start = (lootDispositionPage.value - 1) * LOOT_DISPOSITION_PAGE_SIZE;
  return filteredLootDispositionHistory.value.slice(start, start + LOOT_DISPOSITION_PAGE_SIZE);
});

let liveChunkInFlight = false;
const lootConsoleQueue = ref<LootConsoleItem[]>([]);
const lootConsoleCurrent = ref<LootConsoleItem | null>(null);
const lootConsoleTimerId = ref<number | null>(null);
const lootConsoleCooldownId = ref<number | null>(null);
const lootConsoleVisible = computed(
  () => lootConsoleCurrent.value !== null || lootConsoleQueue.value.length > 0
);
const lootCouncilState = reactive<{
  items: LootCouncilItemState[];
  suppressed: boolean;
  lastUpdatedAt: Date | null;
}>({
  items: [],
  suppressed: false,
  lastUpdatedAt: null
});
const resolvedLootCouncilItems = new Map<string, Date>();
const itemNameToIdCache = new Map<string, { itemId: number; itemIconId: number } | null>();
let itemResolutionPending = false;
let itemResolutionNeeded = false; // Flag to re-run resolution after current completes
let itemResolutionDebounceId: ReturnType<typeof setTimeout> | null = null;
let dispositionPersistDebounceId: ReturnType<typeof setTimeout> | null = null;
const lootCouncilActiveItems = computed(() =>
  lootCouncilState.items.filter((item) => item.status === 'ACTIVE')
);
const canViewLootCouncilModal = computed(() => Boolean(raid.value));
const lootCouncilModalVisible = computed(
  () =>
    canViewLootCouncilModal.value &&
    lootCouncilActiveItems.value.length > 0 &&
    !lootCouncilState.suppressed
);
const supportsContinuousMonitoring = computed(
  () => typeof window !== 'undefined' && typeof (window as any).showOpenFilePicker === 'function'
);
const pendingFileHandle = ref<LocalFileHandle | null>(null);
const canStartContinuousMonitor = computed(
  () => supportsContinuousMonitoring.value && pendingFileHandle.value !== null
);
const clearingLoot = ref(false);
const clearLootPrompt = reactive<{
  visible: boolean;
  mode: 'single' | 'monitor';
  resolve: ((result: boolean | null) => void) | null;
}>({
  visible: false,
  mode: 'single',
  resolve: null
});
const DETECTED_LOOT_INDICATOR_ID = 'detected-loot';
const LOOT_COUNCIL_INDICATOR_ID = 'loot-council';
const editLootModal = reactive<{
  visible: boolean;
  entry: GroupedLootEntry | null;
  form: {
    looterName: string;
    itemName: string;
    count: number;
    itemId: number | null;
  };
  saving: boolean;
}>({
  visible: false,
  entry: null,
  form: {
    looterName: '',
    itemName: '',
    count: 1,
    itemId: null
  },
  saving: false
});

const defaultLogPrompt = reactive<{
  visible: boolean;
  fileName: string;
  fileSize: number;
  handle: LocalFileHandle | null;
  file: File | null;
  resolve: ((result: 'use' | 'skip') => void) | null;
}>({
  visible: false,
  fileName: '',
  fileSize: 0,
  handle: null,
  file: null,
  resolve: null
});

function normalizeLogFileName(value?: string | null) {
  if (!value) {
    return 'unknown-log';
  }
  const normalized = value.trim().toLowerCase();
  return normalized || 'unknown-log';
}

function buildLogSignature(fileName?: string | null) {
  return `${raidId}::${normalizeLogFileName(fileName)}`;
}

function storageKeyForSignature(signature: string) {
  return `${PROCESSED_LOG_STORAGE_PREFIX}:${signature}`;
}

function loadStoredProcessedKeys(signature: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [] as string[];
  }
  try {
    const raw = window.localStorage.getItem(storageKeyForSignature(signature));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.entries)
        ? parsed.entries
        : [];
    return entries.filter(
      (entry: unknown): entry is string => typeof entry === 'string' && entry.length > 0
    );
  } catch {
    return [];
  }
}

function persistStoredProcessedKeys(signature: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const entries = Array.from(processedLogKeys);
    window.localStorage.setItem(storageKeyForSignature(signature), JSON.stringify(entries));
  } catch {
    // Ignore persistence issues (e.g., storage quota exceeded)
  }
}

function clearStoredProcessedKeys(signature: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(storageKeyForSignature(signature));
  } catch {
    // Ignore storage errors
  }
}

function clearStoredProcessedLogsForRaid() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const prefix = `${PROCESSED_LOG_STORAGE_PREFIX}:${raidId}::`;
  const toRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
}

function activateProcessedLogSignature(signature: string | null, reset: boolean) {
  if (!signature) {
    return;
  }
  const shouldReload = reset || activeLogSignature.value !== signature;
  if (shouldReload) {
    processedLogKeys.clear();
    processedNpcKillKeys.clear();
    const stored = loadStoredProcessedKeys(signature);
    for (const key of stored) {
      processedLogKeys.add(key);
    }
  }
  activeLogSignature.value = signature;
}

function persistActiveProcessedLogState() {
  if (!activeLogSignature.value) {
    return;
  }
  persistStoredProcessedKeys(activeLogSignature.value);
}

function resetProcessedLogState(options?: { clearStorage?: boolean; signature?: string | null }) {
  if (options?.clearStorage) {
    if (options.signature) {
      clearStoredProcessedKeys(options.signature);
    } else {
      clearStoredProcessedLogsForRaid();
    }
  }
  processedLogKeys.clear();
  processedNpcKillKeys.clear();
  resetLootCouncilTracking();
  if (options?.signature !== undefined) {
    activeLogSignature.value = options.signature;
  } else {
    activeLogSignature.value = null;
  }
}

function getDispositionStorageKey() {
  return `${LOOT_DISPOSITION_STORAGE_PREFIX}:${raidId}`;
}

function loadLootDispositionHistory(): LootDispositionEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(getDispositionStorageKey());
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry: unknown): entry is LootDispositionEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const e = entry as Record<string, unknown>;
        return (
          typeof e.id === 'string' &&
          (typeof e.timestamp === 'string' || e.timestamp instanceof Date) &&
          typeof e.actionType === 'string' &&
          typeof e.itemName === 'string'
        );
      })
      .map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      }));
  } catch {
    return [];
  }
}

function persistLootDispositionHistoryImmediate() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(getDispositionStorageKey(), JSON.stringify(lootDispositionHistory.value));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

function persistLootDispositionHistory() {
  // Debounce localStorage writes to avoid performance issues when many loot events happen quickly
  if (dispositionPersistDebounceId !== null) {
    clearTimeout(dispositionPersistDebounceId);
  }
  dispositionPersistDebounceId = setTimeout(() => {
    dispositionPersistDebounceId = null;
    persistLootDispositionHistoryImmediate();
  }, 250);
}

function clearLootDispositionHistory() {
  lootDispositionHistory.value = [];
  lootDispositionSearch.value = '';
  lootDispositionPage.value = 1;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(getDispositionStorageKey());
    } catch {
      // Ignore errors
    }
  }
}

function recordLootDisposition(
  actionType: LootDispositionActionType,
  itemName: string,
  timestamp: Date,
  recipientName: string | null,
  itemId?: number | null,
  itemIconId?: number | null
) {
  try {
    const entry: LootDispositionEntry = {
      id: `${timestamp?.getTime?.() ?? Date.now()}-${itemName ?? 'unknown'}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: timestamp ?? new Date(),
      actionType,
      itemName: itemName ?? '',
      itemId: itemId ?? null,
      itemIconId: itemIconId ?? null,
      recipientName: recipientName ?? null
    };

    // Add to the front of the list (newest first)
    lootDispositionHistory.value = [entry, ...lootDispositionHistory.value];
    persistLootDispositionHistory();

    // If item IDs are missing, trigger resolution to fill them in
    if (entry.itemId == null || entry.itemIconId == null) {
      scheduleLootCouncilItemResolution();
    }
  } catch (error) {
    // Disposition recording should never interrupt monitoring
    appendDebugLog('Error recording loot disposition', {
      error: String(error),
      actionType,
      itemName
    });
  }
}

function normalizeLootCouncilItemKey(itemName: string) {
  const normalized = normalizeLootItemName(itemName ?? '');
  return normalized || itemName.trim().toLowerCase();
}

function nextLootCouncilItemIdentity(nameKey: string, timestamp: Date) {
  lootCouncilItemSequence += 1;
  return {
    key: `${nameKey}::${timestamp.getTime()}::${lootCouncilItemSequence}`,
    instanceId: lootCouncilItemSequence
  };
}

type LootCouncilItemSelectionHint = {
  ordinal?: number | null;
  playerName?: string | null;
  requestPlayers?: string[];
  awardee?: string | null;
  preferOldest?: boolean;
  sessionItemIndex?: number | null;
};

function getLootCouncilCandidates(nameKey: string) {
  return lootCouncilState.items.filter((entry) => entry.nameKey === nameKey);
}

function createLootCouncilItemState(
  nameKey: string,
  itemName: string,
  timestamp: Date,
  ordinal: number | null,
  source: 'ANNOUNCE' | 'PENDING' | 'REFERENCE' | 'SUMMARY',
  itemId?: number | null
) {
  const identity = nextLootCouncilItemIdentity(nameKey, timestamp);
  const item: LootCouncilItemState = {
    key: identity.key,
    nameKey,
    instanceId: identity.instanceId,
    itemName,
    itemId: itemId ?? null,
    itemIconId: null,
    ordinal: ordinal ?? null,
    startedAt: timestamp,
    lastUpdatedAt: timestamp,
    status: 'ACTIVE',
    awardedTo: null,
    interests: []
  };
  lootCouncilState.items.push(item);
  appendDebugLog('Loot council item detected', { itemName, itemId, ordinal, source });
  replicatePeerInterestsToItem(item);
  return item;
}

function selectLootCouncilItem(itemName: string, hint?: LootCouncilItemSelectionHint) {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const candidates = getLootCouncilCandidates(nameKey);
  if (!candidates.length) {
    return null;
  }
  if (hint?.ordinal != null) {
    const ordinalMatch = candidates.find((entry) => entry.ordinal === hint.ordinal);
    if (ordinalMatch) {
      return ordinalMatch;
    }
  }
  if (hint?.sessionItemIndex && hint.sessionItemIndex > 0) {
    const ordered = [...candidates].sort(compareLootCouncilInstanceOrder);
    const target = ordered[hint.sessionItemIndex - 1];
    if (target) {
      return target;
    }
  }
  let best: LootCouncilItemState | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const preferredPlayers = (hint?.requestPlayers ?? []).map((name) => name.trim().toLowerCase());
  const preferredPlayerSet = new Set(preferredPlayers);
  const singlePlayerKey = hint?.playerName?.trim().toLowerCase() ?? null;
  const awardeeKey = hint?.awardee?.trim().toLowerCase() ?? null;
  for (const candidate of candidates) {
    let score = 0;
    if (singlePlayerKey) {
      if (candidate.interests.some((interest) => interest.playerKey === singlePlayerKey)) {
        score += 500;
      }
    }
    if (awardeeKey) {
      if (candidate.interests.some((interest) => interest.playerKey === awardeeKey)) {
        score += 750;
      }
    }
    if (preferredPlayerSet.size > 0) {
      const interestKeys = candidate.interests.map((interest) => interest.playerKey);
      let matches = 0;
      for (const key of interestKeys) {
        if (preferredPlayerSet.has(key)) {
          matches += 1;
        }
      }
      score += matches * 50;
      const diff = Math.abs(interestKeys.length - preferredPlayerSet.size);
      score -= diff * 5;
    }
    if (hint?.preferOldest) {
      score -= candidate.startedAt.getTime() / 1000;
    } else {
      score -= candidate.lastUpdatedAt.getTime() / 1_000_000;
    }
    if (
      !best ||
      score > bestScore ||
      (score === bestScore && candidate.lastUpdatedAt < best.lastUpdatedAt) ||
      (score === bestScore &&
        candidate.lastUpdatedAt.getTime() === best.lastUpdatedAt.getTime() &&
        candidate.startedAt < best.startedAt)
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ?? candidates[0];
}

function compareLootCouncilInstanceOrder(a: LootCouncilItemState, b: LootCouncilItemState) {
  const startDelta = a.startedAt.getTime() - b.startedAt.getTime();
  if (startDelta !== 0) {
    return startDelta;
  }
  return a.instanceId - b.instanceId;
}

function ensureLootCouncilItem(itemName: string, timestamp: Date, ordinal: number | null) {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const resolvedAt = resolvedLootCouncilItems.get(nameKey);
  if (resolvedAt && timestamp.getTime() <= resolvedAt.getTime()) {
    return false;
  }
  let candidates = getLootCouncilCandidates(nameKey);
  if (candidates.length > 0) {
    return false;
  }
  createLootCouncilItemState(nameKey, itemName, timestamp, ordinal ?? null, 'REFERENCE');
  return true;
}

function replicatePeerInterestsToItem(target: LootCouncilItemState) {
  const peers = lootCouncilState.items.filter(
    (entry) => entry.nameKey === target.nameKey && entry.key !== target.key
  );
  if (!peers.length) {
    return;
  }
  const template = peers.reduce((latest, entry) =>
    entry.lastUpdatedAt > latest.lastUpdatedAt ? entry : latest
  );
  for (const peerInterest of template.interests) {
    upsertLootCouncilInterest(target, {
      playerName: peerInterest.playerName,
      replacing: peerInterest.replacing ?? null,
      mode: peerInterest.mode,
      votes: null,
      voters: [],
      timestamp: target.startedAt,
      source: 'LIVE'
    });
  }
}

function removeLootCouncilItemsByName(nameKey: string) {
  let removed = false;
  for (let index = lootCouncilState.items.length - 1; index >= 0; index -= 1) {
    if (lootCouncilState.items[index].nameKey === nameKey) {
      lootCouncilState.items.splice(index, 1);
      removed = true;
    }
  }
  return removed;
}

function ensureLootCouncilSummaryCapacity(
  itemName: string,
  timestamp: Date,
  requiredIndex: number | null | undefined
) {
  const normalizedIndex = Math.max(1, requiredIndex ?? 1);
  const nameKey = normalizeLootCouncilItemKey(itemName);
  let candidates = getLootCouncilCandidates(nameKey);
  let created = false;
  while (candidates.length < normalizedIndex) {
    createLootCouncilItemState(nameKey, itemName, timestamp, null, 'SUMMARY');
    candidates = getLootCouncilCandidates(nameKey);
    created = true;
  }
  return created;
}

function debugLootCouncilSnapshot(context: string) {
  if (!lootCouncilDebugEnabled) {
    return;
  }
  const snapshot = lootCouncilState.items.map((item) => ({
    key: item.key,
    name: item.itemName,
    nameKey: item.nameKey,
    ordinal: item.ordinal,
    instanceId: item.instanceId,
    status: item.status,
    interests: item.interests.map((interest) => ({
      player: interest.playerName,
      votes: interest.votes ?? 0
    }))
  }));
  appendDebugLog(`Loot council snapshot: ${context}`, { snapshot });
  // eslint-disable-next-line no-console
  console.info('[LootCouncil Debug]', context, snapshot);
}

function resetLootCouncilTracking() {
  lootCouncilState.items.splice(0, lootCouncilState.items.length);
  lootCouncilState.suppressed = false;
  lootCouncilState.lastUpdatedAt = null;
  processedLootCouncilKeys.clear();
  resolvedLootCouncilItems.clear();
  lootCouncilItemSequence = 0;
  summarySessionState.sessionId = null;
  summarySessionState.lastResetSessionKeyByName.clear();
  summarySessionState.sessionCounters.clear();
  summarySessionState.activeImplicitKey = null;
  summarySessionState.implicitSessionCounter = 0;
  summarySessionState.implicitSessionStartedAt = null;
  summarySessionState.implicitSessionLastOrder = null;
}

function minimizeLootCouncilModal() {
  lootCouncilState.suppressed = true;
}

function toggleLootCouncilModalFromIndicator() {
  if (lootCouncilActiveItems.value.length === 0) {
    attentionStore.unregisterIndicator(LOOT_COUNCIL_INDICATOR_ID);
    return;
  }
  lootCouncilState.suppressed = !lootCouncilState.suppressed;
}

function minimizeDetectedLootModal() {
  showDetectedModal.value = false;
}

function toggleDetectedLootModalFromIndicator() {
  if (parsedLoot.value.length === 0) {
    attentionStore.unregisterIndicator(DETECTED_LOOT_INDICATOR_ID);
    return;
  }
  showDetectedModal.value = !detectedLootModalOpen.value;
}

function clearLootCouncilItem(itemKey: string) {
  if (!monitorSession.value?.isOwner) {
    return;
  }
  if (itemKey === 'ALL') {
    if (lootCouncilState.items.length === 0) {
      return;
    }
    while (lootCouncilState.items.length > 0) {
      const removed = lootCouncilState.items.pop();
      if (removed) {
        resolvedLootCouncilItems.set(removed.nameKey, new Date());
      }
    }
    lootCouncilState.suppressed = false;
    appendDebugLog('All loot council items cleared manually');
    scheduleLootCouncilStateBroadcast();
    return;
  }
  const index = lootCouncilState.items.findIndex((item) => item.key === itemKey);
  if (index === -1) {
    return;
  }
  const [removed] = lootCouncilState.items.splice(index, 1);
  resolvedLootCouncilItems.set(removed.nameKey, new Date());
  appendDebugLog('Loot council item manually cleared', { itemName: removed.itemName });
  if (lootCouncilState.items.length === 0) {
    lootCouncilState.suppressed = false;
  }
  scheduleLootCouncilStateBroadcast();
}

function handleLootCouncilEvents(events: LootCouncilEvent[]) {
  if (!monitorSession.value?.isOwner || events.length === 0) {
    return;
  }
  let changed = false;
  let newItemActivated = false;
  for (const event of events) {
    if (processedLootCouncilKeys.has(event.key)) {
      continue;
    }
    processedLootCouncilKeys.add(event.key);
    try {
      const applied = applyLootCouncilEvent(event);
      if (applied && event.type === 'ITEM_CONSIDERED') {
        newItemActivated = true;
      }
      changed = changed || applied;
    } catch (error) {
      // Log but continue processing other events - one bad event should not stop monitoring
      appendDebugLog('Error applying loot council event', {
        error: String(error),
        eventType: event.type,
        eventKey: event.key
      });
    }
  }
  if (changed) {
    lootCouncilState.lastUpdatedAt = new Date();
    if (newItemActivated) {
      lootCouncilState.suppressed = false;
    }
    if (lootCouncilActiveItems.value.length === 0) {
      lootCouncilState.suppressed = false;
    }
    scheduleLootCouncilItemResolution();
    // Broadcast the updated state to the server so other users can see it
    scheduleLootCouncilStateBroadcast();
  }
}

function scheduleLootCouncilItemResolution() {
  if (itemResolutionDebounceId !== null) {
    clearTimeout(itemResolutionDebounceId);
  }
  itemResolutionDebounceId = setTimeout(() => {
    itemResolutionDebounceId = null;
    void resolveLootCouncilItemIds();
  }, 200);
}

// Debounce ID for broadcasting loot council state
let lootCouncilBroadcastDebounceId: ReturnType<typeof setTimeout> | null = null;

/**
 * Broadcasts the current loot council state to the server so other users can see it.
 * Only called when the current user is the log monitor owner.
 */
function scheduleLootCouncilStateBroadcast() {
  if (!monitorSession.value?.isOwner) {
    return;
  }

  if (lootCouncilBroadcastDebounceId !== null) {
    clearTimeout(lootCouncilBroadcastDebounceId);
  }

  lootCouncilBroadcastDebounceId = setTimeout(() => {
    lootCouncilBroadcastDebounceId = null;
    void broadcastLootCouncilState();
  }, 500); // Debounce broadcasts by 500ms to avoid too many requests
}

async function broadcastLootCouncilState() {
  if (!monitorSession.value?.isOwner) {
    return;
  }

  try {
    // Convert local state to API format
    const items: LootCouncilStateItem[] = lootCouncilState.items.map((item) => ({
      key: item.key,
      nameKey: item.nameKey,
      instanceId: item.instanceId,
      itemName: item.itemName,
      itemId: item.itemId ?? null,
      itemIconId: item.itemIconId ?? null,
      ordinal: item.ordinal ?? null,
      startedAt: item.startedAt.toISOString(),
      lastUpdatedAt: item.lastUpdatedAt.toISOString(),
      status: item.status,
      awardedTo: item.awardedTo ?? null,
      interests: item.interests.map((interest) => ({
        playerKey: interest.playerKey,
        playerName: interest.playerName,
        replacing: interest.replacing ?? null,
        replacingItemId: interest.replacingItemId ?? null,
        replacingItemIconId: interest.replacingItemIconId ?? null,
        mode: interest.mode,
        votes: interest.votes ?? null,
        lastUpdatedAt: interest.lastUpdatedAt.toISOString(),
        source: interest.source,
        voters: interest.voters,
        classHint: interest.classHint ?? null
      }))
    }));

    await api.updateLootCouncilState(raidId, items);
  } catch (error) {
    // Log but don't interrupt the user - this is a background sync
    appendDebugLog('Failed to broadcast loot council state', { error: String(error) });
  }
}

/**
 * Fetches the shared loot council state from the server and applies it to local state.
 * Called when loading the page if there's an active monitor session.
 * For non-owners, this is always called. For owners, this is only called if they have
 * no local loot council state (e.g., when opening a new tab while another tab owns the monitor).
 * @param force - If true, fetch even if the user is the owner
 */
async function fetchAndApplySharedLootCouncilState(force = false) {
  if (!force && monitorSession.value?.isOwner) {
    // Owner doesn't need to fetch - they are the source
    return;
  }

  try {
    const state = await api.fetchLootCouncilState(raidId);

    if (!state.items || state.items.length === 0) {
      return;
    }

    // Apply the shared state to local state
    for (const item of state.items) {
      // Check if we already have this item
      const existingIndex = lootCouncilState.items.findIndex((i) => i.key === item.key);

      const convertedItem: LootCouncilItemState = {
        key: item.key,
        nameKey: item.nameKey,
        instanceId: item.instanceId,
        itemName: item.itemName,
        itemId: item.itemId ?? undefined,
        itemIconId: item.itemIconId ?? undefined,
        ordinal: item.ordinal ?? undefined,
        startedAt: new Date(item.startedAt),
        lastUpdatedAt: new Date(item.lastUpdatedAt),
        status: item.status,
        awardedTo: item.awardedTo ?? undefined,
        interests: item.interests.map((interest) => ({
          playerKey: interest.playerKey,
          playerName: interest.playerName,
          replacing: interest.replacing ?? undefined,
          replacingItemId: interest.replacingItemId ?? undefined,
          replacingItemIconId: interest.replacingItemIconId ?? undefined,
          mode: interest.mode,
          votes: interest.votes ?? undefined,
          lastUpdatedAt: new Date(interest.lastUpdatedAt),
          source: interest.source,
          voters: interest.voters,
          classHint: (interest.classHint as CharacterClass) ?? undefined
        }))
      };

      if (existingIndex >= 0) {
        // Update existing item if the shared one is newer
        const existing = lootCouncilState.items[existingIndex];
        if (convertedItem.lastUpdatedAt > existing.lastUpdatedAt) {
          lootCouncilState.items[existingIndex] = convertedItem;
        }
      } else {
        // Add new item
        lootCouncilState.items.push(convertedItem);
      }
    }

    if (lootCouncilState.items.length > 0) {
      lootCouncilState.lastUpdatedAt = new Date();
      lootCouncilState.suppressed = false;
      // Resolve any missing item icons - the shared state may have items with null iconIds
      // if they weren't fully resolved before being broadcast
      scheduleLootCouncilItemResolution();
    }
  } catch (error) {
    // Log but don't interrupt the user
    appendDebugLog('Failed to fetch shared loot council state', { error: String(error) });
  }
}

async function resolveLootCouncilItemIds() {
  if (itemResolutionPending) {
    // Mark that resolution is needed so we re-run after current completes
    itemResolutionNeeded = true;
    return;
  }
  itemResolutionPending = true;
  itemResolutionNeeded = false;
  try {
    // Collect all item names that need resolution
    const namesToResolve = new Set<string>();
    for (const item of lootCouncilState.items) {
      if (item.itemId == null) {
        const cacheKey = item.itemName.trim().toLowerCase();
        if (!itemNameToIdCache.has(cacheKey)) {
          namesToResolve.add(item.itemName);
        }
      }
      for (const interest of item.interests) {
        if (interest.replacing && interest.replacingItemId == null) {
          const cacheKey = interest.replacing.trim().toLowerCase();
          if (!itemNameToIdCache.has(cacheKey)) {
            namesToResolve.add(interest.replacing);
          }
        }
      }
    }

    // Also include item names from disposition history that need resolution
    for (const entry of lootDispositionHistory.value) {
      if (entry.itemId == null || entry.itemIconId == null) {
        const cacheKey = entry.itemName.trim().toLowerCase();
        if (!itemNameToIdCache.has(cacheKey)) {
          namesToResolve.add(entry.itemName);
        }
      }
    }

    if (namesToResolve.size === 0) {
      applyItemResolutionFromCache();
      return;
    }

    // Fetch item IDs from server
    const response = await api.searchItemsByName(Array.from(namesToResolve));

    // Update cache with results
    for (const name of namesToResolve) {
      const cacheKey = name.trim().toLowerCase();
      const result = response.items[name];
      if (result) {
        itemNameToIdCache.set(cacheKey, {
          itemId: result.itemId,
          itemIconId: result.itemIconId
        });
      } else {
        itemNameToIdCache.set(cacheKey, null);
      }
    }

    applyItemResolutionFromCache();
  } catch (error) {
    console.error('Failed to resolve loot council item IDs:', error);
  } finally {
    itemResolutionPending = false;
    // If new items were added while we were resolving, schedule another resolution
    if (itemResolutionNeeded) {
      itemResolutionNeeded = false;
      scheduleLootCouncilItemResolution();
    }
  }
}

function applyItemResolutionFromCache() {
  for (const item of lootCouncilState.items) {
    if (item.itemId == null) {
      const cacheKey = item.itemName.trim().toLowerCase();
      const cached = itemNameToIdCache.get(cacheKey);
      if (cached) {
        item.itemId = cached.itemId;
        item.itemIconId = cached.itemIconId;
      }
    }
    for (const interest of item.interests) {
      if (interest.replacing && interest.replacingItemId == null) {
        const cacheKey = interest.replacing.trim().toLowerCase();
        const cached = itemNameToIdCache.get(cacheKey);
        if (cached) {
          interest.replacingItemId = cached.itemId;
          interest.replacingItemIconId = cached.itemIconId;
        }
      }
    }
  }

  // Also update disposition history entries with missing item IDs
  let dispositionUpdated = false;
  for (const entry of lootDispositionHistory.value) {
    if (entry.itemId == null || entry.itemIconId == null) {
      const cacheKey = entry.itemName.trim().toLowerCase();
      const cached = itemNameToIdCache.get(cacheKey);
      if (cached) {
        if (entry.itemId == null) {
          entry.itemId = cached.itemId;
          dispositionUpdated = true;
        }
        if (entry.itemIconId == null) {
          entry.itemIconId = cached.itemIconId;
          dispositionUpdated = true;
        }
      }
    }
  }
  if (dispositionUpdated) {
    persistLootDispositionHistory();
  }
}

function applyLootCouncilEvent(event: LootCouncilEvent) {
  switch (event.type) {
    case 'ITEM_CONSIDERED':
      return activateLootCouncilItem(
        event.itemName,
        event.timestamp,
        event.ordinal ?? null,
        event.origin,
        event.itemId
      );
    case 'REQUEST':
      return registerLootCouncilRequest(event);
    case 'SYNC_SUMMARY':
      return applyLootCouncilSyncSummary(event);
    case 'VOTE':
      return applyLootCouncilVote(event);
    case 'AWARD': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Council Award',
        event.itemName,
        event.timestamp,
        event.awardedTo,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: event.awardedTo,
        status: 'AWARDED'
      });
    }
    case 'DONATION': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Guild Banked',
        event.itemName,
        event.timestamp,
        null,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: null,
        status: 'REMOVED'
      });
    }
    case 'RANDOM_AWARD': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Random',
        event.itemName,
        event.timestamp,
        event.awardedTo,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: event.awardedTo,
        status: 'AWARDED'
      });
    }
    case 'MASTER_LOOTER_AWARD': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Assigned',
        event.itemName,
        event.timestamp,
        event.awardedTo,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: event.awardedTo,
        status: 'AWARDED'
      });
    }
    case 'MASTER_LOOTED': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Taken',
        event.itemName,
        event.timestamp,
        'Master Looter',
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: null,
        status: 'REMOVED'
      });
    }
    case 'LEFT_ON_CORPSE': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Abandoned',
        event.itemName,
        event.timestamp,
        null,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: null,
        status: 'REMOVED'
      });
    }
    case 'DISCARDED': {
      // Use item ID from event if available, otherwise fall back to lookup
      const itemInfo = event.itemId != null ? null : getDispositionItemInfo(event.itemName);
      recordLootDisposition(
        'Discarded',
        event.itemName,
        event.timestamp,
        null,
        event.itemId ?? itemInfo?.itemId,
        itemInfo?.itemIconId
      );
      return finalizeLootCouncilItem(event.itemName, event.timestamp, {
        awardedTo: null,
        status: 'REMOVED'
      });
    }
    case 'WITHDRAWAL':
      return removeLootCouncilInterest(event);
    default:
      return false;
  }
}

function getDispositionItemInfo(itemName: string): { itemId: number | null; itemIconId: number | null } | null {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const item = lootCouncilState.items.find((entry) => entry.nameKey === nameKey);
  if (item) {
    return { itemId: item.itemId ?? null, itemIconId: item.itemIconId ?? null };
  }
  // Also check the cache
  const cacheKey = itemName.trim().toLowerCase();
  const cached = itemNameToIdCache.get(cacheKey);
  if (cached) {
    return { itemId: cached.itemId, itemIconId: cached.itemIconId };
  }
  return null;
}

function activateLootCouncilItem(
  itemName: string,
  timestamp: Date,
  ordinal: number | null,
  origin: LootCouncilConsideredOrigin,
  itemId?: number | null
) {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const resolvedAt = resolvedLootCouncilItems.get(nameKey);
  if (resolvedAt && timestamp.getTime() <= resolvedAt.getTime()) {
    return false;
  }
  const candidates = getLootCouncilCandidates(nameKey);
  const ordinalMatch =
    ordinal != null ? candidates.find((entry) => entry.ordinal === ordinal) : null;
  if (origin === 'ANNOUNCE') {
    if (!candidates.length) {
      createLootCouncilItemState(nameKey, itemName, timestamp, ordinal ?? null, 'ANNOUNCE', itemId);
      return true;
    }
    if (ordinalMatch) {
      if (itemId && !ordinalMatch.itemId) {
        ordinalMatch.itemId = itemId;
      }
      return refreshLootCouncilItemMetadata(ordinalMatch, itemName, timestamp, ordinal);
    }
    if (ordinal != null) {
      createLootCouncilItemState(nameKey, itemName, timestamp, ordinal, 'ANNOUNCE', itemId);
      return true;
    }
    const fallback =
      candidates.find((entry) => entry.ordinal == null) ??
      candidates.reduce((prev, current) => (current.startedAt < prev.startedAt ? current : prev));
    if (itemId && !fallback.itemId) {
      fallback.itemId = itemId;
    }
    return refreshLootCouncilItemMetadata(fallback, itemName, timestamp, ordinal);
  }
  // origin === 'PENDING'
  if (ordinalMatch) {
    if (itemId && !ordinalMatch.itemId) {
      ordinalMatch.itemId = itemId;
    }
    return refreshLootCouncilItemMetadata(ordinalMatch, itemName, timestamp, ordinal);
  }
  if (!candidates.length) {
    createLootCouncilItemState(nameKey, itemName, timestamp, ordinal ?? null, 'PENDING', itemId);
    return true;
  }
  if (ordinal != null) {
    createLootCouncilItemState(nameKey, itemName, timestamp, ordinal, 'PENDING', itemId);
    return true;
  }
  const fallback =
    candidates.find((entry) => entry.ordinal == null) ??
    candidates.reduce((prev, current) => (current.startedAt < prev.startedAt ? current : prev));
  if (itemId && !fallback.itemId) {
    fallback.itemId = itemId;
  }
  return refreshLootCouncilItemMetadata(fallback, itemName, timestamp, ordinal);
}

function refreshLootCouncilItemMetadata(
  item: LootCouncilItemState,
  itemName: string,
  timestamp: Date,
  ordinal: number | null
) {
  let changed = false;
  if (item.status !== 'ACTIVE') {
    item.status = 'ACTIVE';
    item.interests = [];
    item.awardedTo = null;
    item.startedAt = timestamp;
    changed = true;
  }
  if (ordinal != null && ordinal !== item.ordinal) {
    item.ordinal = ordinal;
    changed = true;
  }
  if (item.itemName !== itemName) {
    item.itemName = itemName;
    changed = true;
  }
  item.lastUpdatedAt = timestamp;
  return changed;
}

function registerLootCouncilRequest(event: Extract<LootCouncilEvent, { type: 'REQUEST' }>) {
  const activated = ensureLootCouncilItem(event.itemName, event.timestamp, null);
  const nameKey = normalizeLootCouncilItemKey(event.itemName);
  const items = getLootCouncilCandidates(nameKey);
  if (!items.length) {
    return activated;
  }
  let changed = activated;
  for (const item of items) {
    // Update item's itemId if we have one from the event and item doesn't have one
    if (event.itemId && !item.itemId) {
      item.itemId = event.itemId;
    }
    const itemChanged = upsertLootCouncilInterest(item, {
      playerName: event.playerName,
      replacing: event.replacing ?? null,
      replacingItemId: event.replacingItemId ?? null,
      mode: event.mode,
      votes: null,
      voters: [],
      timestamp: event.timestamp,
      source: 'LIVE'
    });
    changed = changed || itemChanged;
  }
  if (changed) {
    appendDebugLog('Loot council interest recorded', {
      itemName: event.itemName,
      itemId: event.itemId,
      playerName: event.playerName,
      replacing: event.replacing ?? null,
      replacingItemId: event.replacingItemId ?? null,
      mode: event.mode
    });
  }
  return changed;
}

function removeLootCouncilInterest(event: Extract<LootCouncilEvent, { type: 'WITHDRAWAL' }>) {
  const nameKey = normalizeLootCouncilItemKey(event.itemName);
  const items = getLootCouncilCandidates(nameKey);
  if (!items.length) {
    return false;
  }
  let changed = false;
  const playerKey = event.playerName.trim().toLowerCase();
  for (const item of items) {
    const interestIndex = item.interests.findIndex((interest) => interest.playerKey === playerKey);
    if (interestIndex !== -1) {
      item.interests.splice(interestIndex, 1);
      item.lastUpdatedAt = event.timestamp;
      changed = true;
    }
  }
  if (changed) {
    appendDebugLog('Loot council interest withdrawn', {
      itemName: event.itemName,
      playerName: event.playerName
    });
  }
  return changed;
}

function upsertLootCouncilInterest(
  item: LootCouncilItemState,
  options: {
    playerName: string;
    replacing?: string | null;
    replacingItemId?: number | null;
    mode: LootCouncilInterestMode;
    votes?: number | null;
    voters?: string[];
    timestamp: Date;
    source: 'LIVE' | 'SYNC';
  }
) {
  const playerKey = options.playerName.trim().toLowerCase();
  const existing = item.interests.find((interest) => interest.playerKey === playerKey);
  const votesNormalized = options.votes ?? null;
  let changed = false;
  if (existing) {
    if (existing.playerName !== options.playerName) {
      existing.playerName = options.playerName;
      changed = true;
    }
    if ((options.replacing ?? null) !== (existing.replacing ?? null)) {
      existing.replacing = options.replacing ?? null;
      changed = true;
    }
    // Update replacingItemId if provided
    if (options.replacingItemId && !existing.replacingItemId) {
      existing.replacingItemId = options.replacingItemId;
    }
    if (existing.mode !== options.mode) {
      existing.mode = options.mode;
      changed = true;
    }
    if (votesNormalized !== null) {
      if ((existing.votes ?? null) !== votesNormalized) {
        existing.votes = votesNormalized;
        changed = true;
      }
    }
    if (Array.isArray(options.voters)) {
      const normalizedVoters = dedupeVoters(options.voters);
      if (!areVoterListsEqual(existing.voters, normalizedVoters)) {
        existing.voters = normalizedVoters;
        changed = true;
      }
    }
    existing.lastUpdatedAt = options.timestamp;
    existing.source = options.source;
    existing.classHint = getInterestCharacterClass(existing.playerName);
    ensureInterestVoterPlaceholders(existing);
  } else {
    item.interests.push({
      playerKey,
      playerName: options.playerName,
      replacing: options.replacing ?? null,
      replacingItemId: options.replacingItemId ?? null,
      replacingItemIconId: null,
      mode: options.mode,
      votes: votesNormalized,
      lastUpdatedAt: options.timestamp,
      source: options.source,
      voters: dedupeVoters(options.voters ?? []),
      classHint: getInterestCharacterClass(options.playerName)
    });
    ensureInterestVoterPlaceholders(item.interests[item.interests.length - 1]);
    changed = true;
  }
  item.lastUpdatedAt = options.timestamp;
  sortLootCouncilInterests(item.interests);
  return changed;
}

function sortLootCouncilInterests(interests: LootCouncilInterestState[]) {
  interests.sort((a, b) => {
    const voteDelta = (b.votes ?? 0) - (a.votes ?? 0);
    if (voteDelta !== 0) {
      return voteDelta;
    }
    return a.playerName.localeCompare(b.playerName);
  });
}

function buildAnonymousVoteLabel(order: number) {
  return `Vote #${order}`;
}

function dedupeVoters(voters: string[]) {
  const normalized: string[] = [];
  for (let index = 0; index < voters.length; index += 1) {
    normalized.push(buildAnonymousVoteLabel(index + 1));
  }
  return normalized;
}

function areVoterListsEqual(a: string[], b: string[]) {
  return a.length === b.length;
}

function ensureInterestVoterPlaceholders(interest: LootCouncilInterestState) {
  const desiredCount = interest.votes ?? 0;
  if (!Array.isArray(interest.voters)) {
    interest.voters = [];
  }
  while (interest.voters.length < desiredCount) {
    interest.voters.push(buildAnonymousVoteLabel(interest.voters.length + 1));
  }
  if (interest.voters.length > desiredCount) {
    interest.voters.splice(desiredCount);
  }
}

function getLootCouncilSummarySessionKey(
  event: Extract<LootCouncilEvent, { type: 'SYNC_SUMMARY' }>
): string {
  const nowTs = event.timestamp.getTime();
  const order = event.sessionOrder ?? null;
  const startImplicitSession = () => {
    summarySessionState.implicitSessionCounter += 1;
    summarySessionState.activeImplicitKey = `implicit:${summarySessionState.implicitSessionCounter}`;
    summarySessionState.implicitSessionStartedAt = nowTs;
    summarySessionState.implicitSessionLastOrder = order;
  };
  if (!summarySessionState.activeImplicitKey) {
    startImplicitSession();
    return summarySessionState.activeImplicitKey ?? 'implicit:0';
  }
  if (order !== null) {
    const orderReset =
      order === 1 ||
      (summarySessionState.implicitSessionLastOrder !== null &&
        order <= summarySessionState.implicitSessionLastOrder);
    if (orderReset) {
      startImplicitSession();
    } else {
      summarySessionState.implicitSessionLastOrder = order;
    }
    return summarySessionState.activeImplicitKey;
  }
  const implicitExpired =
    summarySessionState.implicitSessionStartedAt === null ||
    nowTs - summarySessionState.implicitSessionStartedAt > 2_000;
  if (implicitExpired) {
    startImplicitSession();
  } else {
    summarySessionState.implicitSessionStartedAt = nowTs;
  }
  return summarySessionState.activeImplicitKey ?? 'implicit:0';
}

function getSummarySessionCounter(sessionKey: string) {
  let bucket = summarySessionState.sessionCounters.get(sessionKey);
  if (!bucket) {
    bucket = new Map<string, number>();
    summarySessionState.sessionCounters.set(sessionKey, bucket);
    if (summarySessionState.sessionCounters.size > 25) {
      const oldestKey = summarySessionState.sessionCounters.keys().next().value;
      if (oldestKey) {
        summarySessionState.sessionCounters.delete(oldestKey);
      }
    }
  }
  return bucket;
}

function resolveSummaryItemIndex(
  event: Extract<LootCouncilEvent, { type: 'SYNC_SUMMARY' }>,
  nameKey: string
) {
  const sessionKey = getLootCouncilSummarySessionKey(event);
  const bucket = getSummarySessionCounter(sessionKey);
  const declaredIndex =
    event.sessionItemIndex && event.sessionItemIndex > 0 ? event.sessionItemIndex : null;
  const current = bucket.get(nameKey) ?? 0;
  if (declaredIndex && declaredIndex > current) {
    bucket.set(nameKey, declaredIndex);
    return { sessionKey, index: declaredIndex };
  }
  const next = current + 1;
  bucket.set(nameKey, next);
  return { sessionKey, index: next };
}

function applyLootCouncilSyncSummary(
  event: Extract<LootCouncilEvent, { type: 'SYNC_SUMMARY' }>
) {
  const nameKey = normalizeLootCouncilItemKey(event.itemName);
  const { sessionKey, index: summaryIndex } = resolveSummaryItemIndex(event, nameKey);
  if (lootCouncilDebugEnabled) {
    appendDebugLog('Loot council summary metadata', {
      itemName: event.itemName,
      sessionKey,
      summaryIndex,
      sourceSessionId: event.sessionId ?? null,
      sourceSessionOrder: event.sessionOrder ?? null,
      sourceSessionItemIndex: event.sessionItemIndex ?? null
    });
  }
  const lastResetKey = summarySessionState.lastResetSessionKeyByName.get(nameKey);
  const shouldReset = summaryIndex === 1 && lastResetKey !== sessionKey;
  if (shouldReset) {
    removeLootCouncilItemsByName(nameKey);
    summarySessionState.lastResetSessionKeyByName.set(nameKey, sessionKey);
    debugLootCouncilSnapshot(`summary-reset:${event.itemName}`);
  } else if (summaryIndex === 1 && lastResetKey === undefined) {
    summarySessionState.lastResetSessionKeyByName.set(nameKey, sessionKey);
  }
  const activated = ensureLootCouncilItem(event.itemName, event.timestamp, null);
  const ensured = ensureLootCouncilSummaryCapacity(
    event.itemName,
    event.timestamp,
    summaryIndex
  );
  debugLootCouncilSnapshot(`summary-apply:${event.itemName}:idx=${summaryIndex ?? 'n/a'}`);
  const requestPlayers = event.requests.map((request) => request.playerName);
  const item =
    selectLootCouncilItem(event.itemName, {
      requestPlayers,
      sessionItemIndex: summaryIndex
    }) ??
    selectLootCouncilItem(event.itemName);
  if (!item) {
    return activated;
  }
  if (event.empty) {
    const hadInterests = item.interests.length > 0;
    if (hadInterests) {
      item.interests = [];
      item.lastUpdatedAt = event.timestamp;
    }
    return activated || hadInterests;
  }
  const previousMap = new Map(
    item.interests.map((interest) => [interest.playerKey, interest] as const)
  );
  const mapped = event.requests.map<LootCouncilInterestState>((request) => {
    const playerKey = request.playerName.trim().toLowerCase();
    const existing = previousMap.get(playerKey);
    return {
      playerKey,
      playerName: request.playerName,
      replacing: request.replacing ?? null,
      mode: request.mode,
      votes: request.votes ?? 0,
      lastUpdatedAt: event.timestamp,
      source: 'SYNC',
      voters: existing?.voters?.slice() ?? [],
      classHint: getInterestCharacterClass(request.playerName)
    };
  });
  for (const entry of mapped) {
    ensureInterestVoterPlaceholders(entry);
  }
  sortLootCouncilInterests(mapped);
  const signature = JSON.stringify(
    mapped.map((entry) => ({
      playerKey: entry.playerKey,
      replacing: entry.replacing ?? null,
      mode: entry.mode,
      votes: entry.votes ?? 0,
      voters: entry.voters.slice().sort((a, b) => a.localeCompare(b))
    }))
  );
  const existingSignature = JSON.stringify(
    item.interests.map((entry) => ({
      playerKey: entry.playerKey,
      replacing: entry.replacing ?? null,
      mode: entry.mode,
      votes: entry.votes ?? 0,
      voters: entry.voters.slice().sort((a, b) => a.localeCompare(b))
    }))
  );
  const changed = signature !== existingSignature;
  if (changed) {
    item.interests = mapped;
    refreshInterestClassHintsForItem(item);
    item.lastUpdatedAt = event.timestamp;
    appendDebugLog('Loot council sync updated', {
      itemName: event.itemName,
      interestCount: mapped.length
    });
  }
  return activated || ensured || changed;
}

function applyLootCouncilVote(event: Extract<LootCouncilEvent, { type: 'VOTE' }>) {
  const item = selectLootCouncilItem(event.itemName, { playerName: event.candidateName });
  if (!item) {
    return false;
  }
  const candidateKey = event.candidateName.trim().toLowerCase();
  const interest = item.interests.find((entry) => entry.playerKey === candidateKey);
  if (!interest) {
    return false;
  }
  interest.votes = (interest.votes ?? 0) + 1;
  interest.lastUpdatedAt = event.timestamp;
  item.lastUpdatedAt = event.timestamp;
  ensureInterestVoterPlaceholders(interest);
  sortLootCouncilInterests(item.interests);
  appendDebugLog('Loot council vote detected', {
    itemName: event.itemName,
    voter: event.voterName,
    candidate: event.candidateName,
    votes: interest.votes
  });
  return true;
}

function finalizeLootCouncilItem(
  itemName: string,
  timestamp: Date,
  options: { awardedTo: string | null; status: LootCouncilItemStatus }
) {
  const hint: LootCouncilItemSelectionHint = {
    awardee: options.awardedTo,
    preferOldest: options.status !== 'AWARDED'
  };
  const itemHint =
    selectLootCouncilItem(itemName, hint) ?? selectLootCouncilItem(itemName);
  if (!itemHint) {
    return false;
  }
  const index = lootCouncilState.items.findIndex((entry) => entry.key === itemHint.key);
  if (index === -1) {
    return false;
  }
  const [item] = lootCouncilState.items.splice(index, 1);
  appendDebugLog('Loot council item finalized', {
    itemName,
    awardedTo: options.awardedTo,
    status: options.status
  });
  resolvedLootCouncilItems.set(item.nameKey, timestamp);
  applyLocalLootResolution(itemName, options);
  if (options.status === 'AWARDED' && options.awardedTo) {
    void autoAssignLootFromCouncil(itemName, options.awardedTo, timestamp);
  }
  if (lootCouncilState.items.length === 0) {
    lootCouncilState.suppressed = false;
  }
  return Boolean(item);
}
watch(
  () => [raid.value?.startedAt ?? raid.value?.startTime, raid.value?.endedAt],
  ([start, end]) => {
    if (start && !parsingWindow.start) {
      parsingWindow.start = start;
    }
    if (end && !parsingWindow.end) {
      parsingWindow.end = end;
    }
  }
);

// Clear loot disposition history when raid ends
watch(
  () => raid.value?.endedAt,
  (endedAt) => {
    if (endedAt) {
      clearLootDispositionHistory();
    }
  },
  { immediate: true }
);

// Reset disposition page when search changes
watch(lootDispositionSearch, () => {
  lootDispositionPage.value = 1;
});

watch(
  () => monitorSession.value,
  (session) => {
    if (!session) {
      monitorStore.clearSession();
      monitorStore.setPendingActions(false);
      clearLootConsole();
      return;
    }
    if (session.isOwner) {
      monitorStore.setSession(raidId, raid.value?.name ?? 'Active Raid', session);
      monitorStore.setPendingActions(detectedLootModalOpen.value);
    } else {
      monitorStore.clearSession();
      monitorStore.setPendingActions(false);
    }
  }
);
watch(
  () => monitorSession.value?.isOwner ?? false,
  (isOwner, wasOwner) => {
    if (!isOwner && wasOwner) {
      cleanupMonitorController();
    }
  }
);
watch(
  () => ({
    id: monitorSession.value?.sessionId ?? null,
    isOwner: monitorSession.value?.isOwner ?? false
  }),
  (next, prev) => {
    const becameOwner = next.isOwner && next.id && next.id !== prev?.id;
    const lostOwnership = !next.isOwner && prev?.isOwner;
    if (becameOwner || lostOwnership) {
      resetLootCouncilTracking();
    }
  }
);
watch(detectedLootModalOpen, (open) => {
  monitorStore.setPendingActions(Boolean(open && monitorSession.value?.isOwner));
  if (open) {
    window.addEventListener('keydown', handleDetectedModalKeydown);
  } else {
    window.removeEventListener('keydown', handleDetectedModalKeydown);
  }
});

const dispositionOptions: Array<{
  value: DetectedLootDisposition;
  label: string;
  icon: string;
  requiresManage?: boolean;
}> = [
  { value: 'KEEP', label: 'Keep', icon: '🟢' },
  { value: 'DISCARD', label: 'Discard', icon: '🔴' },
  { value: 'WHITELIST', label: 'Whitelist', icon: '⭐', requiresManage: true },
  { value: 'BLACKLIST', label: 'Blacklist', icon: '⛔', requiresManage: true }
];

const defaultRegexPatterns: GuildLootParserPattern[] = [
  {
    id: 'default-master-method',
    label: 'Awarded by Master Looter / Loot Council',
    pattern: convertPlaceholdersToRegex(
      '{timestamp} {item} has been awarded to {looter} by the {method}.'
    ),
    ignoredMethods: []
  },
  {
    id: 'default-random-roll',
    label: 'Awarded by random roll',
    pattern: convertPlaceholdersToRegex(
      '{timestamp} {item} has been awarded to {looter} by {method}.'
    ),
    ignoredMethods: []
  },
  {
    id: 'default-donation',
    label: 'Donations to guild',
    pattern: convertPlaceholdersToRegex(
      "{timestamp} {item} has been donated to the Master Looter's guild."
    ),
    ignoredMethods: []
  }
];

const fileInput = ref<HTMLInputElement | null>(null);

const lootListSummary = ref<GuildLootListSummary | null>(null);
const whitelistLookup = computed(() => buildLootListLookup(lootListSummary.value?.whitelist ?? []));
const blacklistLookup = computed(() => buildLootListLookup(lootListSummary.value?.blacklist ?? []));
const autoBlacklistSpells = computed(() => raid.value?.guild?.blacklistSpells ?? false);
watch(
  () => ({
    lootEvents: lootEvents.value.map((event) => ({
      id: event.id,
      itemName: event.itemName,
      looterName: event.looterName,
      note: event.note
    })),
    lootCouncilCount: lootCouncilState.items.length
  }),
  () => {
    reconcileLootCouncilWithAssignments();
  }
);

watch(
  () => ({
    pending: parsedLoot.value.length > 0,
    visible: detectedLootModalOpen.value,
    permitted: canManageLoot.value
  }),
  (state) => {
    if (!state.pending || !state.permitted) {
      attentionStore.unregisterIndicator(DETECTED_LOOT_INDICATOR_ID);
      return;
    }
    attentionStore.registerIndicator(DETECTED_LOOT_INDICATOR_ID, {
      id: DETECTED_LOOT_INDICATOR_ID,
      label: 'Loot',
      description: 'Detected loot review queue',
      icon: 'L',
      active: state.visible,
      requiresAttention: !state.visible,
      onToggle: toggleDetectedLootModalFromIndicator
    });
  },
  { immediate: true }
);

watch(
  () => ({
    hasItems: lootCouncilActiveItems.value.length > 0 && canViewLootCouncilModal.value,
    visible: lootCouncilModalVisible.value
  }),
  (state) => {
    if (!state.hasItems) {
      attentionStore.unregisterIndicator(LOOT_COUNCIL_INDICATOR_ID);
      return;
    }
    attentionStore.registerIndicator(LOOT_COUNCIL_INDICATOR_ID, {
      id: LOOT_COUNCIL_INDICATOR_ID,
      label: 'Loot Council',
      description: 'Loot council session tracker',
      icon: 'scale',
      active: state.visible,
      requiresAttention: !state.visible,
      onToggle: toggleLootCouncilModalFromIndicator
    });
  },
  { immediate: true }
);
const canViewParserSettings = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER';
});
const lootContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  itemName: '',
  itemId: null as number | null,
  normalizedName: '',
  whitelistEntry: null as GuildLootListEntry | null,
  blacklistEntry: null as GuildLootListEntry | null,
  entry: null as GroupedLootEntry | null
});
const assignLootModal = reactive({
  visible: false,
  entry: null as GroupedLootEntry | null,
  search: '',
  selectedCharacterId: null as string | null,
  loading: false,
  saving: false,
  error: null as string | null
});
const guildCharacters = ref<AssignableCharacterOption[]>([]);
const guildCharactersLoaded = ref(false);
const guildCharactersLoading = ref(false);
const assignSearchInput = ref<HTMLInputElement | null>(null);
const characterClassLookup = computed(() => {
  const map = new Map<string, CharacterClass>();
  const addEntry = (name?: string | null, klass?: CharacterClass | null | undefined) => {
    if (!name || !klass) {
      return;
    }
    const key = name.trim().toLowerCase();
    if (!key || map.has(key)) {
      return;
    }
    map.set(key, klass);
  };
  if (guildCharacters.value.length > 0) {
    for (const character of guildCharacters.value) {
      addEntry(character.name, character.class);
    }
  } else {
    if (raid.value?.signups) {
      for (const signup of raid.value.signups) {
        addEntry(signup.characterName, signup.characterClass);
      }
    }
    if (raid.value?.attendance) {
      for (const event of raid.value.attendance) {
        for (const record of event.records ?? []) {
          addEntry(record.characterName, record.class ?? null);
        }
      }
    }
    for (const event of lootEvents.value) {
      addEntry(event.looterName, normalizeCharacterClassValue(event.looterClass));
    }
  }
  return map;
});

const viewerCharacterNames = computed(() => {
  const viewerId = authStore.user?.userId ?? null;
  const set = new Set<string>();
  if (!viewerId) {
    return set;
  }
  for (const character of guildCharacters.value) {
    if (character.userId === viewerId) {
      const key = character.name.trim().toLowerCase();
      if (key) {
        set.add(key);
      }
    }
  }
  return set;
});

watch(
  () => characterClassLookup.value,
  () => {
    refreshAllInterestClassHints();
  },
  { immediate: true }
);

function hasViewerInterest(item: LootCouncilItemState) {
  if (!viewerCharacterNames.value.size) {
    return false;
  }
  return item.interests.some((interest) =>
    viewerCharacterNames.value.has(interest.playerName.trim().toLowerCase())
  );
}

function evaluateViewerVoteState(item: LootCouncilItemState) {
  const viewerNames = viewerCharacterNames.value;
  if (viewerNames.size === 0) {
    return { hasViewerInterest: false, state: 'neutral' as const };
  }
  const interests = item.interests;
  const hasViewer = interests.some((interest) =>
    viewerNames.has(interest.playerName.trim().toLowerCase())
  );
  if (!hasViewer) {
    return { hasViewerInterest: false, state: 'neutral' as const };
  }
  const votes = interests.map((interest) => ({
    interest,
    votes: interest.votes ?? 0,
    isViewer: viewerNames.has(interest.playerName.trim().toLowerCase())
  }));
  const topVotes = votes.reduce((max, entry) => Math.max(max, entry.votes), 0);
  if (topVotes === 0) {
    return { hasViewerInterest: true, state: 'neutral' as const };
  }
  const leaders = votes.filter((entry) => entry.votes === topVotes);
  const viewerLeader = leaders.filter((entry) => entry.isViewer);
  if (viewerLeader.length > 0 && leaders.length === 1) {
    return { hasViewerInterest: true, state: 'lead' as const };
  }
  if (viewerLeader.length === 0) {
    return { hasViewerInterest: true, state: 'behind' as const };
  }
  return { hasViewerInterest: true, state: 'neutral' as const };
}

function getLootCouncilViewerClasses(item: LootCouncilItemState) {
  const evaluation = evaluateViewerVoteState(item);
  return {
    'loot-council-column--viewer-interest': evaluation.hasViewerInterest,
    'loot-council-column--viewer-favored': evaluation.state === 'lead',
    'loot-council-column--viewer-unfavored': evaluation.state === 'behind'
  };
}

function getInterestCharacterClass(playerName: string): CharacterClass | null {
  if (!playerName) {
    return null;
  }
  const key = playerName.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return characterClassLookup.value.get(key) ?? null;
}

function refreshInterestClassHintsForItem(item: LootCouncilItemState) {
  for (const interest of item.interests) {
    interest.classHint = getInterestCharacterClass(interest.playerName);
  }
}

function refreshAllInterestClassHints() {
  for (const item of lootCouncilState.items) {
    refreshInterestClassHintsForItem(item);
  }
}

const filteredAssignableCharacters = computed(() => {
  const query = assignLootModal.search.trim().toLowerCase();
  if (!query) {
    return guildCharacters.value;
  }
  const bankNameLower = guildBankDisplayName.value.toLowerCase();
  return guildCharacters.value.filter((character) => {
    const classLabel = character.class
      ? formatCharacterClassLabel(character.class)?.toLowerCase() ?? ''
      : '';
    const nameMatch = character.name.toLowerCase().includes(query);
    const userMatch = character.userName.toLowerCase().includes(query);
    const classMatch = classLabel.includes(query);
    const bankMatch = character.isGuildBank && bankNameLower.includes(query);
    return nameMatch || userMatch || classMatch || bankMatch;
  });
});

const selectedAssignableCharacter = computed(() => {
  if (!assignLootModal.selectedCharacterId) {
    return null;
  }
  return (
    guildCharacters.value.find(
      (character) => character.id === assignLootModal.selectedCharacterId
    ) ?? null
  );
});
const canDeleteExistingLoot = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canForceStopMonitor = computed(() => canDeleteExistingLoot.value);
const groupedExistingLoot = computed<GroupedLootEntry[]>(() => {
  const whitelistLookupValue = whitelistLookup.value;
  const grouped = new Map<string, GroupedLootEntry>();
  for (const event of lootEvents.value) {
    const normalizedLooterName = normalizeLooterNameValue(event.looterName);
    const key = `${normalizedLooterName}::${event.itemName}`;
    const isBank = isGuildBankName(normalizedLooterName);
    const isMaster = isMasterLooterName(normalizedLooterName);
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: event.id,
        itemName: event.itemName,
        itemId: event.itemId ?? null,
        itemIconId: event.itemIconId ?? null,
        looterName: normalizedLooterName,
        looterClass: isBank || isMaster ? null : event.looterClass,
        displayLooterName: isBank ? guildBankDisplayName.value : normalizedLooterName,
        isGuildBank: isBank,
        isMasterLooter: isMaster,
        emoji: event.emoji ?? parserSettings.value?.emoji ?? '💎',
        note: event.note,
        count: 0,
        eventIds: [],
        isWhitelisted: false
      });
    }
    const entry = grouped.get(key)!;
    if (entry.looterName !== normalizedLooterName) {
      entry.looterName = normalizedLooterName;
      entry.displayLooterName = isBank ? guildBankDisplayName.value : normalizedLooterName;
    }
    if (isBank) {
      entry.isGuildBank = true;
      entry.looterClass = null;
      entry.displayLooterName = guildBankDisplayName.value;
    }
    if (isMaster) {
      entry.isMasterLooter = true;
      entry.looterClass = null;
      entry.displayLooterName = normalizedLooterName;
    }
    entry.count += 1;
    entry.eventIds.push(event.id);
    if (entry.itemId == null && event.itemId != null) {
      entry.itemId = event.itemId;
    }
    if (!hasValidIconId(entry.itemIconId) && hasValidIconId(event.itemIconId)) {
      entry.itemIconId = event.itemIconId;
    }
  }
  return Array.from(grouped.values())
    .map((entry) => {
      const normalized = normalizeLootItemName(entry.itemName);
      entry.isWhitelisted = Boolean(
        matchesLootListEntry(whitelistLookupValue, entry.itemId, normalized)
      );
      return entry;
    })
    .sort((a, b) => b.count - a.count);
});
const parsingWindowStart = computed(() => {
  const { earlier } = resolveWindowBounds();
  return earlier ? formatDate(earlier) : 'Unknown start';
});
const parsingWindowEnd = computed(() => {
  const { later } = resolveWindowBounds();
  if (!later) {
    return 'Current time (log end)';
  }
  return formatDate(later);
});
const monitorLockActive = computed(() => Boolean(monitorSession.value));

type MonitorHealthStatus = 'healthy' | 'degraded' | 'recovering' | 'error';
const monitorHealthStatus = computed<MonitorHealthStatus>(() => {
  if (!monitorSession.value?.isOwner) {
    return 'healthy'; // Non-owners don't have health tracking
  }
  if (monitorHealth.isRecovering) {
    return 'recovering';
  }
  if (monitorHealth.consecutiveFileReadFailures >= MONITOR_MAX_FILE_READ_FAILURES) {
    return 'error';
  }
  if (monitorHealth.heartbeatRetryCount > 0 || monitorHealth.consecutiveFileReadFailures > 0) {
    return 'degraded';
  }
  return 'healthy';
});

const monitorHealthMessage = computed(() => {
  switch (monitorHealthStatus.value) {
    case 'recovering':
      return 'Reconnecting to server...';
    case 'error':
      return 'File read errors detected. Check file access.';
    case 'degraded':
      return 'Experiencing connection issues. Retrying...';
    default:
      return null;
  }
});

async function loadData() {
  try {
    raid.value = await api.fetchRaid(raidId);
  } catch (error) {
    // If raid doesn't exist (404), redirect to raids list
    if (isAxiosError(error) && error.response?.status === 404) {
      router.replace({ name: 'Raids' });
      return;
    }
    throw error;
  }
  // Clear local loot disposition history if the raid has ended
  if (raid.value?.endedAt) {
    clearLootDispositionHistory();
  }
  await refreshLootEvents();
  await refreshLootListSummary();
  const guildSettings = await api.fetchGuildLootSettings(raid.value.guild.id);
  syncParserSettings(guildSettings);
  resetManualForm();
  initializeParsingWindow();
  await ensureGuildCharacters();
  await fetchMonitorStatus();
  startMonitorStatusPolling();
}

async function refreshLootListSummary() {
  if (!raid.value) {
    return;
  }

  if (!canManageLootLists.value) {
    lootListSummary.value = null;
    return;
  }

  try {
    lootListSummary.value = await api.fetchGuildLootListSummary(raid.value.guild.id);
  } catch (error) {
    lootListSummary.value = null;
    appendDebugLog('Failed to load loot list summary', { error: String(error) });
  }
}

function openLootContextMenu(event: MouseEvent, entry: GroupedLootEntry) {
  if (!canManageLoot.value && !canManageLootLists.value) {
    return;
  }
  event.preventDefault();
  const normalizedName = normalizeLootItemName(entry.itemName);
  const whitelistEntry = matchesLootListEntry(
    whitelistLookup.value,
    entry.itemId,
    normalizedName
  );
  const blacklistEntry = matchesLootListEntry(
    blacklistLookup.value,
    entry.itemId,
    normalizedName
  );
  const menuWidth = 220;
  const menuHeight = 200;
  const x = Math.min(event.clientX, window.innerWidth - menuWidth);
  const y = Math.min(event.clientY, window.innerHeight - menuHeight);
  Object.assign(lootContextMenu, {
    visible: true,
    x,
    y,
    itemName: entry.itemName,
    itemId: entry.itemId,
    normalizedName,
    whitelistEntry,
    blacklistEntry,
    entry
  });
}

function closeLootContextMenu() {
  lootContextMenu.visible = false;
}

async function ensureGuildCharacters() {
  if (guildCharactersLoaded.value || guildCharactersLoading.value || !raid.value) {
    return;
  }
  guildCharactersLoading.value = true;
  assignLootModal.error = null;
  try {
    const detail = await api.fetchGuildDetail(raid.value.guild.id);
    const mapped = detail.characters
      .map<AssignableCharacterOption>((character) => ({
        id: character.id,
        name: character.name,
        class: character.class,
        level: character.level,
        isMain: character.isMain,
        userName:
          character.user?.displayName?.trim() ||
          character.user?.nickname?.trim() ||
          character.user?.id,
        userId: character.user?.id ?? null,
        isGuildBank: false
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const bankOption: AssignableCharacterOption = {
      id: GUILD_BANK_ID,
      name: guildBankDisplayName.value,
      class: null,
      level: 0,
      isMain: false,
      userName: raid.value?.guild.name ?? 'Guild',
      userId: null,
      isGuildBank: true
    };
    guildCharacters.value = [
      bankOption,
      ...mapped.filter(
        (character) => character.id !== GUILD_BANK_ID && character.name.trim().toLowerCase() !== bankOption.name.toLowerCase()
      )
    ];
    guildCharactersLoaded.value = true;
    refreshAllInterestClassHints();
  } catch (error) {
    assignLootModal.error = extractErrorMessage(error, 'Unable to load guild characters.');
    appendDebugLog('Failed to load guild characters', { error: String(error) });
  } finally {
    guildCharactersLoading.value = false;
  }
}

async function handleAssignLootClick() {
  if (!lootContextMenu.entry || !raid.value) {
    return;
  }
  const entry = lootContextMenu.entry;
  closeLootContextMenu();
  assignLootModal.entry = entry;
  assignLootModal.visible = true;
  assignLootModal.search = '';
  assignLootModal.selectedCharacterId = null;
  assignLootModal.error = null;
  assignLootModal.loading = true;
  await nextTick();
  assignSearchInput.value?.focus();
  try {
    await ensureGuildCharacters();
    if (guildCharacters.value.length > 0) {
      if (isGuildBankName(entry.looterName)) {
        assignLootModal.selectedCharacterId = GUILD_BANK_ID;
      } else {
        const normalizedLooter = entry.looterName.trim().toLowerCase();
        const existing = guildCharacters.value.find(
          (character) => character.name.trim().toLowerCase() === normalizedLooter
        );
        if (existing) {
          assignLootModal.selectedCharacterId = existing.id;
        }
      }
    }
  } finally {
    assignLootModal.loading = false;
    await nextTick();
    assignSearchInput.value?.focus();
  }
}

function closeAssignLootModal(force = false) {
  if (!force && assignLootModal.saving) {
    return;
  }
  assignLootModal.visible = false;
  assignLootModal.entry = null;
  assignLootModal.search = '';
  assignLootModal.selectedCharacterId = null;
  assignLootModal.error = null;
  assignLootModal.loading = false;
}

async function confirmAssignLoot() {
  if (!assignLootModal.entry || !raid.value) {
    return;
  }
  const character = selectedAssignableCharacter.value;
  if (!character) {
    assignLootModal.error = 'Select a character to assign the loot.';
    return;
  }
  assignLootModal.saving = true;
  assignLootModal.error = null;
  const nextLooterName =
    character.id === GUILD_BANK_ID ? guildBankDisplayName.value : character.name;
  const nextLooterClass = character.id === GUILD_BANK_ID ? null : character.class;
  try {
    await Promise.all(
      assignLootModal.entry.eventIds.map((lootId) =>
        api
          .updateRaidLoot(raidId, lootId, {
            looterName: normalizeLooterForSubmission(nextLooterName),
            looterClass: nextLooterClass ?? null
          })
          .catch((error) => {
            appendDebugLog('Failed to assign loot entry', {
              lootId,
              error: String(error)
            });
            throw error;
          })
      )
    );
    await refreshLootEvents();
    window.dispatchEvent(
      new CustomEvent('loot-updated', {
        detail: {
          title: 'Loot Updated',
          message: `${assignLootModal.entry.itemName} now assigned to ${normalizeLooterForSubmission(nextLooterName)}`
        }
      })
    );
    closeAssignLootModal(true);
  } catch (error) {
    assignLootModal.error = extractErrorMessage(error, 'Unable to assign loot. Please try again.');
  } finally {
    assignLootModal.saving = false;
  }
}

function handleEditLootClick() {
  if (!lootContextMenu.entry) {
    return;
  }
  openEditLootModal(lootContextMenu.entry);
  closeLootContextMenu();
}

function handleRemoveLootClick() {
  if (!lootContextMenu.entry) {
    return;
  }
  const entry = lootContextMenu.entry;
  closeLootContextMenu();
  void deleteLootGroup(entry, { skipConfirm: true });
}

function handleGlobalPointerDown(event: MouseEvent) {
  if (!lootContextMenu.visible) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && target.closest('.loot-context-menu')) {
    return;
  }
  if (event.type === 'contextmenu' && target && target.closest('.loot-card')) {
    return;
  }
  closeLootContextMenu();
}

function handleLootContextMenuKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && lootContextMenu.visible) {
    closeLootContextMenu();
  }
}

function openEditLootModal(entry: GroupedLootEntry) {
  editLootModal.entry = entry;
  editLootModal.form.looterName = entry.looterName;
  editLootModal.form.count = entry.count;
  editLootModal.form.itemId = entry.itemId ?? null;
  editLootModal.visible = true;
  editLootModal.saving = false;
}

function closeEditLootModal(forceOrEvent?: boolean | Event) {
  const force = typeof forceOrEvent === 'boolean' ? forceOrEvent : false;
  if (forceOrEvent instanceof Event) {
    forceOrEvent.preventDefault();
  }
  if (!force && editLootModal.saving) {
    return;
  }
  editLootModal.visible = false;
  editLootModal.entry = null;
  editLootModal.form.looterName = '';
  editLootModal.form.count = 1;
  editLootModal.form.itemId = null;
  editLootModal.saving = false;
}

async function fetchMonitorStatus() {
  try {
    const status = await api.fetchRaidLogMonitorStatus(raidId);
    monitorHeartbeatInterval.value = status.heartbeatIntervalMs ?? monitorHeartbeatInterval.value;
    monitorTimeoutMs.value = status.timeoutMs ?? monitorTimeoutMs.value;
    monitorSession.value = status.session ?? null;
    if (!status.session) {
      cleanupMonitorController();
    } else if (status.session.isOwner && status.session.sessionId) {
      startMonitorHeartbeat();
      // If we're the owner but have no local loot council state, fetch from server.
      // This handles the case where the user opens a new tab while another tab owns the monitor.
      if (lootCouncilActiveItems.value.length === 0) {
        void fetchAndApplySharedLootCouncilState(true);
      }
    } else if (status.session && !status.session.isOwner) {
      // User is not the owner but there's an active session - fetch shared loot council state
      void fetchAndApplySharedLootCouncilState();
    }
  } catch (error) {
    // If raid was deleted (404), stop polling and redirect
    if (isAxiosError(error) && error.response?.status === 404) {
      stopMonitorStatusPolling();
      cleanupMonitorController();
      router.replace({ name: 'Raids' });
      return;
    }
    appendDebugLog('Failed to load log monitor status', { error: String(error) });
  }
}

function startMonitorStatusPolling() {
  stopMonitorStatusPolling();
  monitorStatusPollId.value = window.setInterval(() => {
    // Skip polling only if we're the owner AND we have an active file handle.
    // If we're the owner but don't have a file handle, we're in a secondary tab
    // and should poll for loot council state updates from the primary tab.
    if (monitorSession.value?.isOwner && monitorController.fileHandle) {
      return;
    }
    fetchMonitorStatus();
  }, 8000);
}

function stopMonitorStatusPolling() {
  if (monitorStatusPollId.value) {
    window.clearInterval(monitorStatusPollId.value);
    monitorStatusPollId.value = null;
  }
}

async function promptFileSelection() {
  if (monitorLockActive.value || clearingLoot.value) {
    return;
  }

  const defaultOutcome = await attemptDefaultLogSelection();
  if (defaultOutcome === 'used') {
    return;
  }

  if (!supportsContinuousMonitoring.value) {
    fileInput.value?.click();
    return;
  }

  try {
    const handle = await requestPersistentFileHandle();
    if (!handle) {
      return;
    }
    await ensureHandlePermission(handle);
    const file = await handle.getFile();
    setPendingUploadSelection(file, { handle, reason: 'picker' });
  } catch (error) {
    appendDebugLog('File picker cancelled or failed', { error: String(error) });
  }
}

async function attemptDefaultLogSelection(): Promise<'used' | 'skipped' | 'unavailable'> {
  if (!authStore.user) {
    return 'unavailable';
  }
  if (!supportsContinuousMonitoring.value) {
    return 'unavailable';
  }
  try {
    const handle = await getDefaultLogHandle(authStore.user.userId);
    if (!handle) {
      return 'unavailable';
    }
    if (typeof handle.queryPermission === 'function') {
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'read' });
      }
      if (permission !== 'granted') {
        return 'unavailable';
      }
    }

    const file = await handle.getFile();
    return await new Promise<'used' | 'skipped'>((resolve) => {
      defaultLogPrompt.visible = true;
      defaultLogPrompt.fileName = file.name;
      defaultLogPrompt.fileSize = file.size;
      defaultLogPrompt.handle = handle;
      defaultLogPrompt.file = file;
      defaultLogPrompt.resolve = (result) => {
        cleanupDefaultLogPrompt();
        resolve(result === 'use' ? 'used' : 'skipped');
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendDebugLog('Default log file unavailable', { error: message });
    if (!message.includes('IndexedDB')) {
      window.alert('We could not access your default log file. Please re-select it in Account Settings.');
    }
    return 'unavailable';
  }
}

function cleanupDefaultLogPrompt() {
  defaultLogPrompt.visible = false;
  defaultLogPrompt.fileName = '';
  defaultLogPrompt.fileSize = 0;
  defaultLogPrompt.handle = null;
  defaultLogPrompt.file = null;
  defaultLogPrompt.resolve = null;
}

function handleDefaultLogPromptAction(action: 'use' | 'skip') {
  const resolver = defaultLogPrompt.resolve;
  if (!resolver) {
    cleanupDefaultLogPrompt();
    return;
  }

  if (action === 'use' && defaultLogPrompt.file) {
    const file = defaultLogPrompt.file;
    const handle = defaultLogPrompt.handle;
    setPendingUploadSelection(file, { handle, reason: 'default-log' });
    appendDebugLog('Default log file selected automatically', {
      fileName: file.name,
      size: file.size
    });
    resolver('use');
  } else {
    appendDebugLog('Default log file selection dismissed');
    resolver('skip');
  }
}

function handleLegacyFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0] ?? null;
  target.value = '';
  if (!file) {
    appendDebugLog('File selection cleared or empty');
    return;
  }

  if (monitorLockActive.value) {
    appendDebugLog('File selection ignored because monitoring is active');
    return;
  }

  if (clearingLoot.value) {
    appendDebugLog('File selection ignored while raid loot is clearing');
    return;
  }

  setPendingUploadSelection(file, { handle: null, reason: 'legacy-input' });
}

function handleDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  dragActive.value = false;
  if (!file) {
    return;
  }
  if (monitorLockActive.value) {
    appendDebugLog('File drop ignored because monitoring is active');
    return;
  }
  if (clearingLoot.value) {
    appendDebugLog('File drop ignored while raid loot is clearing');
    return;
  }
  if (supportsContinuousMonitoring.value) {
    appendDebugLog(
      'Drag-and-drop disabled when continuous monitoring is available. Use Select Log File instead.'
    );
    window.alert('Please use Select Log File to enable continuous monitoring.');
    return;
  }
  setPendingUploadSelection(file, { handle: null, reason: 'drag-drop' });
}

function setPendingUploadSelection(
  file: File,
  options: { handle: LocalFileHandle | null; reason: string }
) {
  pendingUploadFile.value = file;
  pendingFileHandle.value = options.handle;
  showUploadModeModal.value = true;
  appendDebugLog('File selected', {
    name: file.name,
    size: file.size,
    source: options.reason,
    hasHandle: Boolean(options.handle)
  });
}

async function clearExistingLootBeforeUpload() {
  if (!raid.value) {
    return;
  }
  try {
    await api.clearRaidLoot(raidId);
    lootEvents.value = [];
    parsedLoot.value = [];
    showDetectedModal.value = false;
    resetProcessedLogState({ clearStorage: true });
    appendDebugLog('Existing loot cleared prior to new upload');
  } catch (error) {
    appendDebugLog('Failed to clear existing loot before upload', { error: String(error) });
    throw error;
  }
}

function closeUploadModeModal() {
  showUploadModeModal.value = false;
  pendingUploadFile.value = null;
  pendingFileHandle.value = null;
}

async function confirmUploadMode(mode: 'single' | 'monitor') {
  const file = pendingUploadFile.value;
  if (!file) {
    showUploadModeModal.value = false;
    return;
  }

  showUploadModeModal.value = false;

  let shouldClear = true;
  if (lootEvents.value.length > 0) {
    const decision = await promptClearExistingLoot(mode);
    if (decision === null) {
      showUploadModeModal.value = true;
      return;
    }
    shouldClear = decision;
    appendDebugLog('Existing loot prompt answered', {
      mode,
      chosenAction: shouldClear ? 'clear-loot' : 'keep-loot',
      existingLootCount: lootEvents.value.length
    });
  }

  await proceedUploadMode(mode, { file, shouldClear });
}

function promptClearExistingLoot(mode: 'single' | 'monitor') {
  return new Promise<boolean | null>((resolve) => {
    clearLootPrompt.visible = true;
    clearLootPrompt.mode = mode;
    clearLootPrompt.resolve = resolve;
  });
}

function handleClearLootPromptDecision(shouldClear: boolean) {
  resolveClearLootPrompt(shouldClear);
}

function handleClearLootPromptClose() {
  resolveClearLootPrompt(null);
  showUploadModeModal.value = true;
}

function resolveClearLootPrompt(result: boolean | null) {
  const resolver = clearLootPrompt.resolve;
  clearLootPrompt.visible = false;
  clearLootPrompt.resolve = null;
  if (resolver) {
    resolver(result);
  }
}

async function proceedUploadMode(
  mode: 'single' | 'monitor',
  options: { file: File; shouldClear: boolean }
) {
  const { file, shouldClear } = options;
  const signature = buildLogSignature(file.name);

  if (shouldClear) {
    try {
      clearingLoot.value = true;
      await clearExistingLootBeforeUpload();
    } catch (error) {
      appendDebugLog('Unable to clear existing loot before upload', { error: String(error) });
      window.alert('Unable to clear existing loot for this raid. Please try again.');
      showUploadModeModal.value = true;
      return;
    } finally {
      clearingLoot.value = false;
    }
  }

  if (mode === 'single') {
    continuousMonitorError.value = null;
    await readLogFile(file, {
      append: !shouldClear,
      resetKeys: shouldClear,
      signature
    });
    pendingUploadFile.value = null;
    pendingFileHandle.value = null;
    return;
  }

  if (!pendingFileHandle.value) {
    window.alert(
      'Continuous monitoring requires selecting the file via the Select Log File button.'
    );
    showUploadModeModal.value = true;
    pendingUploadFile.value = file;
    return;
  }

  await startContinuousMonitor(file, pendingFileHandle.value);
  pendingUploadFile.value = null;
  pendingFileHandle.value = null;
}

async function saveEditedLoot() {
  if (!raid.value || !editLootModal.entry) {
    return;
  }
  const newLooterInput = editLootModal.form.looterName.trim();
  const newCount = Number(editLootModal.form.count);
  if (!newLooterInput) {
    window.alert('Looter name is required.');
    return;
  }
  if (!Number.isFinite(newCount) || newCount < 1) {
    window.alert('Quantity must be at least 1.');
    return;
  }

  const normalizedLooter = normalizeLooterForSubmission(newLooterInput);
  const isBankLooter = isGuildBankName(normalizedLooter);
  const isMasterLooter = isMasterLooterName(normalizedLooter);
  const rawItemId = editLootModal.form.itemId;
  let normalizedItemId: number | null = null;
  if (rawItemId !== null && rawItemId !== undefined) {
    if (!Number.isFinite(rawItemId) || rawItemId < 1) {
      window.alert('Item ID must be a positive number.');
      return;
    }
    if (!Number.isInteger(rawItemId)) {
      window.alert('Item ID must be a whole number.');
      return;
    }
    normalizedItemId = rawItemId;
  }

  const entry = editLootModal.entry;
  const currentCount = entry.count;
  const countDiff = newCount - currentCount;
  const emoji = entry.emoji ?? parserSettings.value?.emoji ?? '💎';
  const currentItemId = entry.itemId ?? null;
  const itemIdChanged = currentItemId !== (normalizedItemId ?? null);
  const desiredItemId = itemIdChanged ? normalizedItemId ?? null : currentItemId;

  editLootModal.saving = true;
  try {
    if (normalizedLooter !== entry.looterName || itemIdChanged) {
      await Promise.all(
        entry.eventIds.map((lootId) =>
          api.updateRaidLoot(raidId, lootId, {
            ...(normalizedLooter !== entry.looterName
              ? {
                  looterName: normalizedLooter,
                  looterClass: isBankLooter || isMasterLooter ? null : entry.looterClass ?? null
                }
              : {}),
            ...(itemIdChanged ? { itemId: normalizedItemId ?? null } : {})
          })
        )
      );
    }

    if (countDiff > 0) {
      const payload = Array.from({ length: countDiff }, () => ({
        itemName: entry.itemName,
        itemId: desiredItemId ?? null,
        looterName: normalizedLooter,
        looterClass: isBankLooter || isMasterLooter ? null : entry.looterClass ?? undefined,
        emoji,
        note: entry.note ?? undefined
      }));
      await api.createRaidLoot(raidId, payload);
    } else if (countDiff < 0) {
      const removeIds = entry.eventIds.slice(entry.eventIds.length + countDiff);
      await Promise.all(removeIds.map((lootId) => api.deleteRaidLoot(raidId, lootId)));
    }

    await refreshLootEvents();
    await refreshLootListSummary();
    appendDebugLog('Loot entry edited', {
      itemName: entry.itemName,
      previousCount: currentCount,
      newCount,
      previousLooter: entry.looterName,
      newLooter: normalizedLooter,
      previousItemId: currentItemId,
      newItemId: desiredItemId
    });
    window.dispatchEvent(
      new CustomEvent('loot-updated', {
        detail: {
          title: 'Loot Updated',
          message: `${entry.itemName} now assigned to ${normalizedLooter} (${newCount}×)`
        }
      })
    );
    closeEditLootModal(true);
  } catch (error) {
    appendDebugLog('Failed to edit loot entry', { error: String(error) });
    window.alert('Unable to update loot entry. Please try again.');
  } finally {
    editLootModal.saving = false;
  }
}

async function startContinuousMonitor(initialFile: File, providedHandle?: LocalFileHandle | null) {
  if (monitorSession.value) {
    appendDebugLog('Continuous monitoring skipped: session already active');
    return;
  }
  if (!supportsContinuousMonitoring.value) {
    continuousMonitorError.value = 'This browser does not support continuous monitoring.';
    appendDebugLog('Continuous monitoring blocked: unsupported browser');
    return;
  }

  monitorStarting.value = true;
  continuousMonitorError.value = null;
  resetMonitorHealth();
  let sessionStarted = false;

  try {
    const handle = providedHandle ?? (await requestPersistentFileHandle());
    if (!handle) {
      appendDebugLog('Continuous monitoring cancelled before selecting a file');
      return;
    }

    await ensureHandlePermission(handle);

    const status = await api.startRaidLogMonitor(raidId, {
      fileName: handle.name ?? initialFile.name
    });
    monitorHeartbeatInterval.value = status.heartbeatIntervalMs ?? monitorHeartbeatInterval.value;
    monitorTimeoutMs.value = status.timeoutMs ?? monitorTimeoutMs.value;
    monitorSession.value = status.session ?? null;
    sessionStarted = Boolean(status.session);

    if (!monitorSession.value) {
      throw new Error('Unable to start monitoring session.');
    }

    monitorController.fileHandle = handle;
    monitorController.lastSize = initialFile.size;
    monitorController.pendingFragment = '';
    monitorController.fileSignature = buildLogSignature(handle.name ?? initialFile.name);

    startMonitorHeartbeat();
    monitorHealth.lastSuccessfulHeartbeat = new Date();
    await readLogFile(initialFile, {
      append: false,
      resetKeys: false,
      signature: monitorController.fileSignature
    });
    monitorHealth.lastSuccessfulFileRead = new Date();
    startLiveLogPolling();
    appendDebugLog('Continuous monitoring enabled', {
      file: handle.name,
      sessionId: monitorSession.value.sessionId
    });
  } catch (error) {
    continuousMonitorError.value =
      error instanceof Error ? error.message : 'Unable to enable continuous monitoring.';
    appendDebugLog('Continuous monitoring failed', { error: String(error) });
    if (sessionStarted && monitorSession.value?.sessionId) {
      await api.stopRaidLogMonitor(raidId, { sessionId: monitorSession.value.sessionId });
    }
    monitorSession.value = null;
    cleanupMonitorController();
  } finally {
    monitorStarting.value = false;
  }
}

async function requestPersistentFileHandle() {
  const picker = typeof window !== 'undefined' ? (window as any).showOpenFilePicker : null;
  if (typeof picker !== 'function') {
    throw new Error('Continuous monitoring requires a Chromium-based browser.');
  }

  try {
    const handles = await picker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'EverQuest Logs',
          accept: {
            'text/plain': ['.txt', '.log']
          }
        }
      ]
    });
    return Array.isArray(handles) && handles.length > 0 ? (handles[0] as LocalFileHandle) : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

async function ensureHandlePermission(handle: LocalFileHandle, options?: { silent?: boolean }): Promise<boolean> {
  const silent = options?.silent ?? false;
  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission({ mode: 'read' });
    if (current === 'granted') {
      return true;
    }
    if (current === 'denied') {
      if (silent) return false;
      throw new Error('Read permission denied for the selected log file.');
    }
  }
  if (typeof handle.requestPermission === 'function') {
    const result = await handle.requestPermission({ mode: 'read' });
    if (result !== 'granted') {
      if (silent) return false;
      throw new Error('Continuous monitoring requires read access to the log file.');
    }
  }
  return true;
}

function startLiveLogPolling() {
  stopLiveLogPolling();
  if (!monitorSession.value?.isOwner || !monitorController.fileHandle) {
    return;
  }
  monitorController.pollTimerId = window.setInterval(() => {
    void readLiveLogChunk();
  }, 2000);
}

function stopLiveLogPolling() {
  if (monitorController.pollTimerId) {
    window.clearInterval(monitorController.pollTimerId);
    monitorController.pollTimerId = null;
  }
}

async function readLiveLogChunk() {
  if (!monitorController.fileHandle || !monitorSession.value?.isOwner || liveChunkInFlight) {
    return;
  }
  liveChunkInFlight = true;

  // Phase 1: Read file content - errors here are file access failures
  let normalizedChunk: string;
  try {
    const file = await monitorController.fileHandle.getFile();
    if (file.size < monitorController.lastSize) {
      monitorController.lastSize = 0;
      monitorController.pendingFragment = '';
    }
    if (file.size === monitorController.lastSize) {
      // No new content, but file access succeeded - reset failure counter
      monitorHealth.consecutiveFileReadFailures = 0;
      liveChunkInFlight = false;
      return;
    }
    const blob = file.slice(monitorController.lastSize);
    const text = await blob.text();
    monitorController.lastSize = file.size;
    const chunk = drainMonitorChunk(text);
    normalizedChunk = normalizeLootCouncilSummaryChunk(chunk);

    // Successfully read file - reset failure tracking
    monitorHealth.consecutiveFileReadFailures = 0;
    monitorHealth.lastSuccessfulFileRead = new Date();
  } catch (error) {
    monitorHealth.consecutiveFileReadFailures += 1;
    appendDebugLog('Failed to read live log chunk', {
      error: String(error),
      consecutiveFailures: monitorHealth.consecutiveFileReadFailures
    });

    // Check if we've exceeded max failures
    if (monitorHealth.consecutiveFileReadFailures >= MONITOR_MAX_FILE_READ_FAILURES) {
      appendDebugLog('Max consecutive file read failures exceeded, attempting permission check');

      // Before giving up, try to verify/restore file handle permission
      try {
        const hasPermission = await ensureHandlePermission(monitorController.fileHandle, { silent: true });
        if (hasPermission) {
          // Permission restored - reset counter and continue
          monitorHealth.consecutiveFileReadFailures = 0;
          appendDebugLog('File handle permission verified, resetting failure counter');
          liveChunkInFlight = false;
          return;
        }
      } catch (permError) {
        appendDebugLog('Permission check failed', { error: String(permError) });
      }

      // Permission check failed - stop polling
      continuousMonitorError.value = 'Unable to read log file. Please check file access and restart monitoring.';
      stopLiveLogPolling();
    }
    liveChunkInFlight = false;
    return;
  }

  // Phase 2: Process content - errors here should NOT stop monitoring
  try {
    if (!normalizedChunk.trim()) {
      liveChunkInFlight = false;
      return;
    }
    const startIso = parsingWindow.start ?? raid.value?.startedAt ?? raid.value?.startTime ?? new Date().toISOString();
    const endIso = parsingWindow.end ?? raid.value?.endedAt ?? null;
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : undefined;
    activateProcessedLogSignature(monitorController.fileSignature, false);
    processLogContent(normalizedChunk, { append: true, resetKeys: false, start, end });
    persistActiveProcessedLogState();
  } catch (error) {
    // Log processing errors but do NOT count them as file read failures
    // and do NOT stop monitoring - this is critical for reliability
    appendDebugLog('Error processing log content (monitoring continues)', {
      error: String(error)
    });
  } finally {
    liveChunkInFlight = false;
  }
}

function drainMonitorChunk(raw: string) {
  const combined = `${monitorController.pendingFragment}${raw}`;
  const parts = combined.split(/\r?\n/);
  if (!combined.endsWith('\n')) {
    monitorController.pendingFragment = parts.pop() ?? '';
  } else {
    monitorController.pendingFragment = '';
  }
  return parts.join('\n');
}

function normalizeLootCouncilSummaryChunk(chunk: string) {
  let combined = chunk;
  if (monitorController.pendingSummaryBlock) {
    const prefix = monitorController.pendingSummaryBlock;
    const needsSeparator =
      prefix.length > 0 &&
      !prefix.endsWith('\n') &&
      chunk.length > 0 &&
      !chunk.startsWith('\n');
    combined = `${prefix}${needsSeparator ? '\n' : ''}${chunk}`;
    monitorController.pendingSummaryBlock = '';
  }
  if (!combined) {
    return '';
  }
  const lines = combined.split(/\r?\n/);
  const summaryStartPattern = /^\/{2,}\s*Showing All Loot Requests\s*\/{2,}$/i;
  let openIndex: number | null = null;

  const stripTimestamp = (value: string) => value.replace(/^\[[^\]]+]\s*/, '');

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = stripTimestamp(lines[index]);
    if (summaryStartPattern.test(trimmed)) {
      openIndex = index;
    }
    if (
      openIndex !== null &&
      /^[/\s]+$/.test(trimmed) &&
      (trimmed.match(/\//g) ?? []).length >= 5
    ) {
      openIndex = null;
    }
  }

  if (openIndex !== null) {
    monitorController.pendingSummaryBlock = lines.slice(openIndex).join('\n');
    lines.splice(openIndex);
  }

  return lines.join('\n');
}

function startMonitorHeartbeat() {
  stopMonitorHeartbeat();
  if (!monitorSession.value?.sessionId) {
    return;
  }
  void sendMonitorHeartbeat();
  const interval = Math.max(5000, monitorHeartbeatInterval.value);
  monitorController.heartbeatTimerId = window.setInterval(() => {
    void sendMonitorHeartbeat();
  }, interval);
}

function stopMonitorHeartbeat() {
  if (monitorController.heartbeatTimerId) {
    window.clearInterval(monitorController.heartbeatTimerId);
    monitorController.heartbeatTimerId = null;
  }
}

async function sendMonitorHeartbeat() {
  if (!monitorSession.value?.sessionId) {
    return;
  }
  try {
    const session = await api.heartbeatRaidLogMonitor(raidId, monitorSession.value.sessionId);
    if (session) {
      monitorSession.value = session;
      // Reset health tracking on success
      monitorHealth.heartbeatRetryCount = 0;
      monitorHealth.lastSuccessfulHeartbeat = new Date();
      monitorHealth.isRecovering = false;
    }
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    appendDebugLog('Log monitor heartbeat failed', {
      error: String(error),
      status,
      retryCount: monitorHealth.heartbeatRetryCount
    });

    // Handle different error types
    if (status === 404) {
      // Session not found on server - attempt recovery if we have a valid file handle
      await attemptSessionRecovery();
    } else {
      // Network error or other transient failure - retry with backoff
      monitorHealth.heartbeatRetryCount += 1;
      if (monitorHealth.heartbeatRetryCount >= MONITOR_MAX_HEARTBEAT_RETRIES) {
        appendDebugLog('Log monitor heartbeat max retries exceeded, attempting recovery');
        await attemptSessionRecovery();
      } else {
        // Schedule a retry with exponential backoff
        const delay = MONITOR_HEARTBEAT_RETRY_DELAY_MS * Math.pow(2, monitorHealth.heartbeatRetryCount - 1);
        appendDebugLog('Scheduling heartbeat retry', { delay, retryCount: monitorHealth.heartbeatRetryCount });
        setTimeout(() => void sendMonitorHeartbeat(), delay);
      }
    }
  }
}

async function attemptSessionRecovery() {
  // Don't attempt recovery if already recovering or no file handle
  if (monitorHealth.isRecovering || !monitorController.fileHandle) {
    cleanupMonitorController();
    resetMonitorHealth();
    monitorSession.value = null;
    await fetchMonitorStatus();
    return;
  }

  monitorHealth.isRecovering = true;
  appendDebugLog('Attempting monitor session recovery');

  try {
    // Verify we still have file handle permission
    const hasPermission = await ensureHandlePermission(monitorController.fileHandle, { silent: true });
    if (!hasPermission) {
      appendDebugLog('Lost file handle permission, cannot recover');
      cleanupMonitorController();
      resetMonitorHealth();
      monitorSession.value = null;
      continuousMonitorError.value = 'Lost access to log file. Please restart monitoring.';
      await fetchMonitorStatus();
      return;
    }

    // Try to start a new session with the existing file handle
    const fileName = monitorController.fileHandle.name ?? 'unknown.txt';
    const result = await api.startRaidLogMonitor(raidId, { fileName });
    monitorSession.value = result.session;
    monitorHeartbeatInterval.value = result.heartbeatIntervalMs ?? 10_000;
    monitorTimeoutMs.value = result.timeoutMs ?? 30_000;

    // Reset health and restart heartbeat + polling
    resetMonitorHealth();
    monitorHealth.lastSuccessfulHeartbeat = new Date();
    monitorHealth.lastSuccessfulFileRead = new Date();
    continuousMonitorError.value = null; // Clear any previous error message
    startMonitorHeartbeat();
    startLiveLogPolling(); // Critical: restart log polling after recovery

    appendDebugLog('Monitor session recovered successfully', { sessionId: result.session?.sessionId });
  } catch (recoveryError) {
    appendDebugLog('Monitor session recovery failed', { error: String(recoveryError) });
    cleanupMonitorController();
    resetMonitorHealth();
    monitorSession.value = null;
    continuousMonitorError.value = 'Monitoring session lost. Please restart monitoring.';
    await fetchMonitorStatus();
  }
}

function resetMonitorHealth() {
  monitorHealth.heartbeatRetryCount = 0;
  monitorHealth.consecutiveFileReadFailures = 0;
  monitorHealth.lastSuccessfulHeartbeat = null;
  monitorHealth.lastSuccessfulFileRead = null;
  monitorHealth.isRecovering = false;
}

function cleanupMonitorController() {
  stopLiveLogPolling();
  stopMonitorHeartbeat();
  monitorController.fileHandle = null;
  monitorController.lastSize = 0;
  monitorController.pendingFragment = '';
  monitorController.fileSignature = null;
  monitorController.pendingSummaryBlock = '';
}

async function stopActiveMonitor(options?: { force?: boolean }) {
  if (!monitorSession.value) {
    return;
  }
  monitorStopping.value = true;
  try {
    await api.stopRaidLogMonitor(raidId, {
      sessionId: options?.force ? undefined : monitorSession.value.sessionId,
      force: options?.force
    });
  } catch (error) {
    appendDebugLog('Failed to stop log monitor', { error: String(error) });
  } finally {
    monitorStopping.value = false;
    monitorSession.value = null;
    clearingLoot.value = false;
    pendingFileHandle.value = null;
    pendingUploadFile.value = null;
    cleanupMonitorController();
    await fetchMonitorStatus();
  }
}

function sendMonitorStopBeacon(sessionId: string) {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      return;
    }
    const payload = new Blob([JSON.stringify({ sessionId })], { type: 'application/json' });
    navigator.sendBeacon(`/api/raids/${raidId}/log-monitor/stop`, payload);
  } catch (error) {
    appendDebugLog('Failed to send monitor stop beacon', { error: String(error) });
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!monitorSession.value?.isOwner) {
    return;
  }

  if (allowImmediateUnload.value) {
    if (monitorSession.value.sessionId) {
      sendMonitorStopBeacon(monitorSession.value.sessionId);
    }
    return;
  }

  if (!pendingNavigation.value) {
    pendingNavigation.value = { type: 'refresh' };
    showLeaveMonitorModal.value = true;
  }

  event.preventDefault();
}

function handleRefreshShortcut(event: KeyboardEvent) {
  if (!monitorSession.value?.isOwner) {
    return;
  }
  const isRefreshKey =
    event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
  if (!isRefreshKey) {
    return;
  }
  event.preventDefault();
  if (pendingNavigation.value) {
    return;
  }
  pendingNavigation.value = { type: 'refresh' };
  showLeaveMonitorModal.value = true;
}

function handleBeforeRouteLeave(_to: any, _from: any, next: (value?: boolean | string) => void) {
  if (!monitorSession.value?.isOwner) {
    next();
    return;
  }

  if (pendingNavigation.value) {
    next(false);
    return;
  }

  next();
}

function handleVisibilityChange() {
  // When tab becomes visible again, ensure monitoring is still running
  if (document.hidden || !monitorSession.value?.isOwner || !monitorController.fileHandle) {
    return;
  }

  // Check if polling was stopped but should be running
  if (!monitorController.pollTimerId) {
    appendDebugLog('Tab became visible, restarting log polling');
    // Reset any file read failures that may have accumulated while hidden
    monitorHealth.consecutiveFileReadFailures = 0;
    continuousMonitorError.value = null;
    startLiveLogPolling();
  }

  // Check if heartbeat was stopped but should be running
  if (!monitorController.heartbeatTimerId && monitorSession.value?.sessionId) {
    appendDebugLog('Tab became visible, restarting heartbeat');
    startMonitorHeartbeat();
  }
}

async function handleActiveRaidUpdated() {
  // Refresh raid data when the raid is updated (e.g., ended from another view)
  try {
    const updatedRaid = await api.fetchRaid(raidId);
    raid.value = updatedRaid;
    // The watch on raid.value?.endedAt will clear loot disposition history if raid ended
  } catch (error) {
    // If raid was deleted (404), stop polling and redirect to raids list
    if (isAxiosError(error) && error.response?.status === 404) {
      stopMonitorStatusPolling();
      cleanupMonitorController();
      router.replace({ name: 'Raids' });
      return;
    }
    // Ignore other fetch errors during refresh
  }
}

function dismissLeaveMonitorModal(shouldNavigate: boolean) {
  showLeaveMonitorModal.value = false;
  const pending = pendingNavigation.value;
  pendingNavigation.value = null;
  if (shouldNavigate) {
    void stopActiveMonitor().finally(() => {
      if (!pending) {
        return;
      }
      if (pending.type === 'route' && pending.to) {
        router.push(pending.to);
      } else if (pending.type === 'refresh') {
        allowImmediateUnload.value = true;
        window.location.reload();
      }
    });
  } else {
    allowImmediateUnload.value = false;
  }
}

function readLogFile(
  file: File,
  options?: { append?: boolean; resetKeys?: boolean; signature?: string | null }
) {
  if (!raid.value) {
    appendDebugLog('Cannot parse log before raid data loads', { file: file.name });
    return Promise.resolve();
  }

  parsing.value = true;
  parseProgress.value = 0;
  const appendMode = options?.append ?? false;
  const resetKeys = options?.resetKeys ?? !appendMode;
  const signature = options?.signature ?? buildLogSignature(file.name);
  const mode = appendMode ? 'append' : 'replace';
  appendDebugLog('Parsing started', {
    file: file.name,
    mode,
    windowStart: parsingWindowStart.value,
    windowEnd: parsingWindowEnd.value
  });

  return new Promise<void>((resolve) => {
    const reader = new FileReader();

    reader.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        parseProgress.value = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      }
    };

    reader.onload = () => {
      parseProgress.value = 100;
      const content = reader.result as string;
      const startIso = parsingWindow.start ?? raid.value?.startedAt ?? raid.value?.startTime ?? new Date().toISOString();
      const endIso = parsingWindow.end ?? raid.value?.endedAt ?? null;
      const start = new Date(startIso);
      const end = endIso ? new Date(endIso) : undefined;

      activateProcessedLogSignature(signature, resetKeys);

      if (!appendMode) {
        const windowStats = computeLogWindowStats(content, start, end);
        appendDebugLog('Log window stats', windowStats);
      }

      processLogContent(content, {
        append: appendMode,
        resetKeys,
        start,
        end
      });
      persistActiveProcessedLogState();
      parsing.value = false;
      resolve();
    };

    reader.onerror = () => {
      parsing.value = false;
      appendDebugLog('Failed to read log file', { error: reader.error?.message });
      resolve();
    };

    reader.readAsText(file);
  });
}

function setAllKept(value: boolean) {
  parsedLoot.value = parsedLoot.value.map((row) => ({
    ...row,
    disposition: value ? 'KEEP' : 'DISCARD'
  }));
  parsedLootPage.value = 1;
}

function getRowsByDisposition(dispositions: DetectedLootDisposition[]) {
  const allowed = new Set(dispositions);
  return parsedLoot.value.filter(
    (row) => allowed.has(row.disposition) && row.itemName && row.looterName
  );
}

function handleDispositionChange(targetRow: ParsedRow, disposition: DetectedLootDisposition) {
  if ((disposition === 'WHITELIST' || disposition === 'BLACKLIST') && !canManageLootLists.value) {
    return;
  }

  if (targetRow.disposition === disposition) {
    return;
  }

  const targetNormalized = normalizeLootItemName(targetRow.itemName);
  const targetItemId = targetRow.itemId ?? null;

  for (const row of parsedLoot.value) {
    if (rowsReferToSameItem(targetItemId, targetNormalized, row)) {
      row.disposition = disposition;
    }
  }
}

function handleDetectedModalKeydown(event: KeyboardEvent) {
  if (!detectedLootModalOpen.value || parsedLootTotalPages.value <= 1) {
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (parsedLootPage.value < parsedLootTotalPages.value) {
      parsedLootPage.value += 1;
    }
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (parsedLootPage.value > 1) {
      parsedLootPage.value -= 1;
    }
  }
}

async function saveParsedLoot() {
  if (!raid.value || parsedLoot.value.length === 0) {
    appendDebugLog('Save skipped: no detected loot present');
    return;
  }
  savingLoot.value = true;
  const rowsToKeep = getRowsByDisposition(['KEEP', 'WHITELIST']);
  const rowsToWhitelist = getRowsByDisposition(['WHITELIST']);
  const rowsToBlacklist = getRowsByDisposition(['BLACKLIST']);
  try {
    if (rowsToKeep.length > 0) {
      const payload = rowsToKeep.map((row) => {
        const looterName = normalizeLooterNameValue(row.looterName);
        const isMaster = isMasterLooterName(looterName);
        const base: {
          itemName: string;
          itemId: number | null;
          looterName: string;
          looterClass?: string | null;
          eventTime?: string;
          emoji: string;
        } = {
          itemName: row.itemName,
          itemId: row.itemId ?? null,
          looterName,
          eventTime: row.timestamp ? row.timestamp.toISOString() : undefined,
          emoji: row.emoji
        };
        if (isGuildBankName(looterName) || isMaster) {
          base.looterClass = null;
        }
        return base;
      });
      await api.createRaidLoot(raidId, payload);
      await refreshLootEvents();
      appendDebugLog('Kept loot saved', { count: rowsToKeep.length });
    } else {
      appendDebugLog('All detected loot discarded for this batch');
    }

    let listsUpdated = false;
    if (rowsToWhitelist.length > 0 && canManageLootLists.value) {
      const created = await persistLootListEntries('WHITELIST', rowsToWhitelist);
      if (created > 0) {
        listsUpdated = true;
        appendDebugLog('Items added to whitelist', { count: created });
      }
    } else if (rowsToWhitelist.length > 0 && !canManageLootLists.value) {
      appendDebugLog('Whitelist updates skipped: insufficient permissions');
    }
    if (rowsToBlacklist.length > 0 && canManageLootLists.value) {
      const created = await persistLootListEntries('BLACKLIST', rowsToBlacklist);
      if (created > 0) {
        listsUpdated = true;
        appendDebugLog('Items added to blacklist', { count: created });
      }
    } else if (rowsToBlacklist.length > 0 && !canManageLootLists.value) {
      appendDebugLog('Blacklist updates skipped: insufficient permissions');
    }

    parsedLoot.value = [];
    parsedLootPage.value = 1;
    showDetectedModal.value = false;

    if (listsUpdated) {
      await refreshLootListSummary();
    }

    for (const row of rowsToKeep) {
      window.dispatchEvent(
        new CustomEvent('loot-assigned', {
          detail: {
            raidId,
            itemName: row.itemName,
            looterName: row.looterName
          }
        })
      );
    }
  } catch (error) {
    appendDebugLog('Failed to process detected loot', { error: String(error) });
    window.alert('Unable to save detected loot. Please try again.');
  } finally {
    savingLoot.value = false;
  }
}

async function persistLootListEntries(
  type: 'WHITELIST' | 'BLACKLIST',
  rows: ParsedRow[]
): Promise<number> {
  if (!raid.value || rows.length === 0) {
    return 0;
  }

  if (!canManageLootLists.value) {
    return 0;
  }

  const guildId = raid.value.guild.id;
  const seen = new Set<string>();
  let created = 0;

  for (const row of rows) {
    const normalizedName = normalizeLootItemName(row.itemName);
    const key = row.itemId != null ? `id:${row.itemId}` : `name:${normalizedName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (hasExistingLootListEntry(type, row.itemId, normalizedName)) {
      continue;
    }

    try {
      await api.createGuildLootListEntry(guildId, {
        type,
        itemName: row.itemName,
        itemId: row.itemId ?? null
      });
      created += 1;
    } catch (error) {
      appendDebugLog('Failed to persist loot list entry', {
        type,
        item: row.itemName,
        error: String(error)
      });
    }
  }

  return created;
}

function hasExistingLootListEntry(
  type: 'WHITELIST' | 'BLACKLIST',
  itemId: number | null,
  normalizedName: string
) {
  const lookup = type === 'WHITELIST' ? whitelistLookup.value : blacklistLookup.value;
  return Boolean(matchesLootListEntry(lookup, itemId, normalizedName));
}

function rowsReferToSameItem(
  targetItemId: number | null,
  targetNormalizedName: string,
  row: ParsedRow
) {
  if (targetItemId != null && row.itemId != null) {
    return row.itemId === targetItemId;
  }
  return normalizeLootItemName(row.itemName) === targetNormalizedName;
}

function normalizeMethodName(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function sanitizeIgnoredMethods(methods: string[]) {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const method of methods) {
    const trimmed = method?.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeMethodName(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    sanitized.push(trimmed);
  }
  return sanitized;
}

async function addItemToLootList(type: 'WHITELIST' | 'BLACKLIST') {
  if (!raid.value || !canManageLootLists.value) {
    closeLootContextMenu();
    return;
  }

  try {
    const entry = await api.createGuildLootListEntry(raid.value.guild.id, {
      type,
      itemName: lootContextMenu.itemName,
      itemId: lootContextMenu.itemId
    });
    appendDebugLog(`Item added to ${type.toLowerCase()}`, { itemName: lootContextMenu.itemName });
    applyLootListEntryUpsert(type, entry);
    if (type === 'WHITELIST') {
      lootContextMenu.whitelistEntry = entry;
    } else {
      lootContextMenu.blacklistEntry = entry;
    }
    await refreshLootListSummary();
  } catch (error) {
    appendDebugLog(`Failed to add item to ${type.toLowerCase()}`, {
      itemName: lootContextMenu.itemName,
      error: String(error)
    });
    window.alert('Unable to update loot list.');
  } finally {
    closeLootContextMenu();
  }
}

async function removeItemFromLootList(type: 'WHITELIST' | 'BLACKLIST') {
  if (!raid.value || !canManageLootLists.value) {
    closeLootContextMenu();
    return;
  }

  const entry =
    type === 'WHITELIST' ? lootContextMenu.whitelistEntry : lootContextMenu.blacklistEntry;

  if (!entry) {
    closeLootContextMenu();
    return;
  }

  try {
    await api.deleteGuildLootListEntry(raid.value.guild.id, entry.id);
    appendDebugLog(`Item removed from ${type.toLowerCase()}`, {
      itemName: lootContextMenu.itemName
    });
    applyLootListEntryRemoval(type, entry.id);
    await refreshLootListSummary();
  } catch (error) {
    appendDebugLog(`Failed to remove item from ${type.toLowerCase()}`, {
      itemName: lootContextMenu.itemName,
      error: String(error)
    });
    window.alert('Unable to update loot list.');
  } finally {
    closeLootContextMenu();
  }
}

function ensureLootListSummary() {
  if (!lootListSummary.value) {
    lootListSummary.value = { whitelist: [], blacklist: [] };
  }
}

function applyLootListEntryUpsert(type: 'WHITELIST' | 'BLACKLIST', entry: GuildLootListEntry) {
  ensureLootListSummary();
  const target =
    type === 'WHITELIST' ? lootListSummary.value!.whitelist : lootListSummary.value!.blacklist;
  const normalized = normalizeLootItemName(entry.itemName);
  const existingIndex = target.findIndex((item) => {
    if (item.id === entry.id) {
      return true;
    }
    if (entry.itemId != null && item.itemId != null) {
      return item.itemId === entry.itemId;
    }
    return item.itemNameNormalized === normalized;
  });
  const prepared: GuildLootListEntry = {
    ...entry,
    itemNameNormalized: entry.itemNameNormalized?.length ? entry.itemNameNormalized : normalized
  };
  if (existingIndex >= 0) {
    target.splice(existingIndex, 1, prepared);
  } else {
    target.push(prepared);
  }
}

function applyLootListEntryRemoval(type: 'WHITELIST' | 'BLACKLIST', entryId: string) {
  ensureLootListSummary();
  const target =
    type === 'WHITELIST' ? lootListSummary.value!.whitelist : lootListSummary.value!.blacklist;
  const index = target.findIndex((item) => item.id === entryId);
  if (index >= 0) {
    target.splice(index, 1);
  }
  if (type === 'WHITELIST') {
    lootContextMenu.whitelistEntry = null;
  } else {
    lootContextMenu.blacklistEntry = null;
  }
}

async function persistAutoKeptLoot(entries: ParsedLootEvent[], emoji: string) {
  if (!raid.value || entries.length === 0 || !canManageLoot.value) {
    return;
  }

  const payload = entries
    .map((entry) => {
      const itemName = entry.itemName ?? entry.looter ?? 'Unknown Item';
      const looterName = normalizeLooterNameValue(entry.looter ?? entry.itemName ?? 'Unknown');
      if (!itemName || !looterName) {
        return null;
      }
      const isBank = isGuildBankName(looterName);
      const isMaster = isMasterLooterName(looterName);
      const base: {
        itemName: string;
        itemId: number | null;
        looterName: string;
        looterClass?: string | null;
        eventTime?: string;
        emoji: string;
      } = {
        itemName,
        itemId: entry.itemId ?? null,
        looterName,
        eventTime: entry.timestamp ? entry.timestamp.toISOString() : undefined,
        emoji
      };
      if (isBank || isMaster) {
        base.looterClass = null;
      }
      return base;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (payload.length === 0) {
    return;
  }

  try {
    await api.createRaidLoot(raidId, payload);
    await refreshLootEvents();
    for (const entry of payload) {
      window.dispatchEvent(
        new CustomEvent('loot-assigned', {
          detail: {
            raidId,
            itemName: entry.itemName,
            looterName: entry.looterName
          }
        })
      );
    }
  } catch (error) {
    appendDebugLog('Failed to auto-add whitelisted loot', { error: String(error) });
  }
}

async function persistRaidNpcKillEvents(kills: ParsedNpcKillEvent[]) {
  if (!raid.value) {
    appendDebugLog('NPC kill persist skipped: no raid loaded');
    return;
  }
  if (kills.length === 0) {
    appendDebugLog('NPC kill persist skipped: no kills provided');
    return;
  }
  if (!canManageLoot.value) {
    appendDebugLog('NPC kill persist skipped: no permission to manage loot', {
      role: raid.value?.permissions?.role,
      canManage: raid.value?.permissions?.canManage
    });
    return;
  }

  const payload = kills
    .filter((kill) => kill.timestamp && kill.npcName.trim().length > 0)
    .map((kill) => ({
      npcName: kill.npcName.trim(),
      occurredAt: kill.timestamp!.toISOString(),
      killerName: kill.killerName ?? null,
      rawLine: kill.rawLine ?? null,
      zoneName: kill.zoneName ?? null
    }));

  if (payload.length === 0) {
    appendDebugLog('NPC kill persist skipped: payload empty after filtering');
    return;
  }

  appendDebugLog('NPC kill persist: sending to API', {
    count: payload.length,
    firstKill: payload[0]
  });

  const chunkSize = 100;
  const allPendingClarifications: PendingInstanceClarification[] = [];
  const allPendingZoneClarifications: PendingZoneClarification[] = [];
  try {
    for (let index = 0; index < payload.length; index += chunkSize) {
      const result = await api.recordRaidNpcKills(raidId, payload.slice(index, index + chunkSize));
      appendDebugLog('NPC kill persist: API response', {
        inserted: result.inserted,
        pendingClarifications: result.pendingClarifications?.length ?? 0,
        pendingZoneClarifications: result.pendingZoneClarifications?.length ?? 0
      });
      if (result.pendingClarifications && result.pendingClarifications.length > 0) {
        allPendingClarifications.push(...result.pendingClarifications);
      }
      if (result.pendingZoneClarifications && result.pendingZoneClarifications.length > 0) {
        allPendingZoneClarifications.push(...result.pendingZoneClarifications);
      }
    }
    // Show zone clarification modal first if needed, then instance clarification
    if (allPendingZoneClarifications.length > 0) {
      zoneClarifications.value = allPendingZoneClarifications.map(c => ({
        ...c,
        selectedNpcDefinitionId: c.zoneOptions[0]?.npcDefinitionId ?? ''
      }));
      showZoneClarificationModal.value = true;
      appendDebugLog('Showing zone clarification modal', { count: allPendingZoneClarifications.length });
    } else if (allPendingClarifications.length > 0) {
      instanceClarifications.value = allPendingClarifications.map(c => ({
        ...c,
        isInstance: false
      }));
      showInstanceClarificationModal.value = true;
      appendDebugLog('Showing instance clarification modal', { count: allPendingClarifications.length });
    }
  } catch (error) {
    appendDebugLog('Failed to record NPC kills', { error: String(error) });
  }
}

// Instance clarification modal functions
function closeInstanceClarificationModal() {
  showInstanceClarificationModal.value = false;
  instanceClarifications.value = [];
}

async function submitInstanceClarifications() {
  if (!raid.value) return;
  submittingClarifications.value = true;
  try {
    for (const clarification of instanceClarifications.value) {
      await api.resolvePendingNpcKillClarification(
        raid.value.guildId,
        clarification.id,
        {
          npcDefinitionId: clarification.npcDefinitionId,
          isInstance: clarification.isInstance
        }
      );
    }
    appendDebugLog('Instance clarifications submitted', { count: instanceClarifications.value.length });
    closeInstanceClarificationModal();
  } catch (error: any) {
    appendDebugLog('Failed to submit clarifications', { error: String(error) });
    window.alert(error?.response?.data?.message ?? error?.message ?? 'Failed to submit clarifications');
  } finally {
    submittingClarifications.value = false;
  }
}

function formatClarificationTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Zone clarification modal functions
function closeZoneClarificationModal() {
  showZoneClarificationModal.value = false;
  zoneClarifications.value = [];
}

async function submitZoneClarifications() {
  if (!raid.value) return;
  submittingZoneClarifications.value = true;
  try {
    for (const clarification of zoneClarifications.value) {
      if (!clarification.selectedNpcDefinitionId) continue;
      await api.resolvePendingNpcKillClarification(
        raid.value.guildId,
        clarification.id,
        {
          npcDefinitionId: clarification.selectedNpcDefinitionId,
          isInstance: false
        }
      );
    }
    appendDebugLog('Zone clarifications submitted', { count: zoneClarifications.value.length });
    closeZoneClarificationModal();
  } catch (error: any) {
    appendDebugLog('Failed to submit zone clarifications', { error: String(error) });
    window.alert(error?.response?.data?.message ?? error?.message ?? 'Failed to submit zone clarifications');
  } finally {
    submittingZoneClarifications.value = false;
  }
}

async function createManualEntry() {
  if (!manualForm.itemName || !manualForm.looterName) {
    appendDebugLog('Manual entry blocked: missing item or looter');
    return;
  }
  manualSaving.value = true;
  const normalizedLooter = normalizeLooterForSubmission(manualForm.looterName);
  const isBankLooter = isGuildBankName(normalizedLooter);
  const isMasterLooter = isMasterLooterName(normalizedLooter);
  const createdItemName = manualForm.itemName;
  try {
    await api.createRaidLoot(raidId, [
      {
        itemName: manualForm.itemName,
        itemId: null,
        looterName: normalizedLooter,
        looterClass: isBankLooter || isMasterLooter ? null : manualForm.looterClass || undefined,
        emoji: manualForm.emoji || undefined,
        note: manualForm.note || undefined
      }
    ]);
    await refreshLootEvents();
    appendDebugLog('Manual loot entry created');
    window.dispatchEvent(
      new CustomEvent('loot-assigned', {
        detail: {
          raidId,
          itemName: createdItemName,
          looterName: normalizedLooter
        }
      })
    );
    resetManualForm();
    showManualModal.value = false;
  } finally {
    manualSaving.value = false;
  }
}

async function confirmDelete(event: RaidLootEvent) {
  if (!confirm('Remove this loot entry?')) {
    return;
  }
  await api.deleteRaidLoot(raidId, event.id);
  lootEvents.value = lootEvents.value.filter((loot) => loot.id !== event.id);
}

function openEdit(event: RaidLootEvent) {
  const itemName = prompt('Item name', event.itemName);
  if (!itemName) {
    return;
  }
  const looterName = prompt('Looter', event.looterName) ?? event.looterName;
  const emoji =
    prompt('Emoji', event.emoji ?? parserSettings.value?.emoji ?? '💎') ?? event.emoji ?? undefined;
  const normalizedLooter = normalizeLooterForSubmission(looterName);
  const isBankLooter = isGuildBankName(normalizedLooter);
  const isMasterLooter = isMasterLooterName(normalizedLooter);
  api
    .updateRaidLoot(raidId, event.id, {
      itemName,
      looterName: normalizedLooter,
      looterClass: isBankLooter || isMasterLooter ? null : event.looterClass ?? null,
      emoji
    })
    .then(async () => {
      await refreshLootEvents();
    });
}


function openManualModal() {
  showManualModal.value = true;
}

function closeManualModal() {
  showManualModal.value = false;
  resetManualForm();
}

function resetManualForm() {
  manualForm.itemName = '';
  manualForm.looterName = '';
  manualForm.looterClass = '';
  manualForm.emoji = parserSettings.value?.emoji ?? '💎';
  manualForm.note = '';
}

function syncParserSettings(settings: GuildLootParserSettings) {
  const preparedPatterns = preparePatternsForParsing(settings.patterns ?? []);
  const emoji = settings.emoji ?? '💎';
  parserSettings.value = {
    emoji,
    patterns: preparedPatterns
  };
  manualForm.emoji = emoji;
}

function initializeParsingWindow() {
  const actualStart = raid.value?.startedAt ?? raid.value?.startTime ?? null;
  parsingWindow.start = actualStart;
  parsingWindow.end = raid.value?.endedAt ?? null;
}

function openWindowModal() {
  parsingWindowForm.start = toInputValue(parsingWindow.start ?? raid.value?.startedAt ?? raid.value?.startTime ?? null);
  parsingWindowForm.end = toInputValue(parsingWindow.end ?? raid.value?.endedAt ?? null);
  showWindowModal.value = true;
}

function closeWindowModal() {
  showWindowModal.value = false;
}

function saveParsingWindow() {
  const startIso = fromInputValue(parsingWindowForm.start) ?? raid.value?.startedAt ?? raid.value?.startTime ?? null;
  const endIso = fromInputValue(parsingWindowForm.end);
  parsingWindow.start = startIso;
  parsingWindow.end = endIso;
  showWindowModal.value = false;
  appendDebugLog('Parsing window updated', {
    startUtc: startIso,
    startLocal: startIso ? formatDate(startIso) : null,
    endUtc: endIso,
    endLocal: endIso ? formatDate(endIso) : 'Current log end'
  });
}

function resetWindowToRaidTimes() {
  initializeParsingWindow();
  parsingWindowForm.start = toInputValue(parsingWindow.start);
  parsingWindowForm.end = toInputValue(parsingWindow.end);
  appendDebugLog('Parsing window reset to raid times', {
    startUtc: parsingWindow.start,
    startLocal: parsingWindow.start ? formatDate(parsingWindow.start) : null,
    endUtc: parsingWindow.end,
    endLocal: parsingWindow.end ? formatDate(parsingWindow.end) : 'Current log end'
  });
}

function resolveWindowBounds() {
  const startIso = parsingWindow.start ?? raid.value?.startedAt ?? raid.value?.startTime ?? null;
  const endIso = parsingWindow.end ?? raid.value?.endedAt ?? null;
  if (startIso && endIso) {
    const startDate = new Date(startIso).getTime();
    const endDate = new Date(endIso).getTime();
    if (startDate <= endDate) {
      return { earlier: startIso, later: endIso };
    }
    return { earlier: endIso, later: startIso };
  }
  return { earlier: startIso, later: endIso };
}

function toInputValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function enqueueLootConsoleEntries(entries: LootConsolePayload[]) {
  if (!monitorSession.value || entries.length === 0) {
    return;
  }

  const normalized = entries
    .map((entry) => ({
      line: entry.line?.trim() ?? '',
      status: entry.status
    }))
    .filter((entry) => entry.line.length > 0);

  if (normalized.length === 0) {
    return;
  }

  const timestamp = Date.now();
  for (const [index, entry] of normalized.entries()) {
    lootConsoleQueue.value.push({
      id: `console-${timestamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      line: entry.line,
      status: entry.status
    });
  }

  if (!lootConsoleCurrent.value) {
    showNextLootConsoleEntry();
  }
}

function showNextLootConsoleEntry() {
  if (lootConsoleCurrent.value || lootConsoleQueue.value.length === 0) {
    return;
  }

  const next = lootConsoleQueue.value.shift() ?? null;
  if (!next) {
    return;
  }

  lootConsoleCurrent.value = next;

  if (lootConsoleTimerId.value) {
    window.clearTimeout(lootConsoleTimerId.value);
    lootConsoleTimerId.value = null;
  }

  lootConsoleTimerId.value = window.setTimeout(() => {
    lootConsoleTimerId.value = null;
    lootConsoleCurrent.value = null;

    if (lootConsoleCooldownId.value) {
      window.clearTimeout(lootConsoleCooldownId.value);
      lootConsoleCooldownId.value = null;
    }

    lootConsoleCooldownId.value = window.setTimeout(() => {
      lootConsoleCooldownId.value = null;
      showNextLootConsoleEntry();
    }, 200);
  }, 1500);
}

function clearLootConsole() {
  lootConsoleQueue.value = [];
  lootConsoleCurrent.value = null;
  if (lootConsoleTimerId.value) {
    window.clearTimeout(lootConsoleTimerId.value);
    lootConsoleTimerId.value = null;
  }
  if (lootConsoleCooldownId.value) {
    window.clearTimeout(lootConsoleCooldownId.value);
    lootConsoleCooldownId.value = null;
  }
}

function handleLootConsoleSuppress() {
  clearLootConsole();
}

function extractLastZoneFromLog(content: string) {
  const lines = content.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || line.trim().length === 0) {
      continue;
    }
    const stripped = line.replace(/^\[[^\]]*]\s*/, '').trim();
    const match = stripped.match(/You have entered\s+(.+?)\.?$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function processLogContent(
  content: string,
  options: { append: boolean; resetKeys?: boolean; start: Date; end?: Date }
) {
  if (!raid.value) {
    return;
  }

  if (monitorSession.value?.isOwner) {
    const detectedZone = extractLastZoneFromLog(content);
    if (detectedZone) {
      monitorStore.setLastZone(detectedZone);
    }
  }

  if (options.resetKeys) {
    processedLogKeys.clear();
    processedNpcKillKeys.clear();
    resetLootCouncilTracking();
    parsedLootPage.value = 1;
  }

  const patterns = getPatternsForParsing();
  const emoji = parserSettings.value?.emoji ?? '💎';
  const parsed = parseLootLog(content, options.start, patterns, options.end ?? null);
  const npcKillEvents = parseNpcKills(content, options.start, options.end ?? null);
  const shouldTrackLootCouncil = Boolean(monitorSession.value?.isOwner);
  if (shouldTrackLootCouncil) {
    try {
      const lootCouncilEvents = parseLootCouncilEvents(
        content,
        options.start,
        options.end ?? null
      );
      if (lootCouncilEvents.length > 0) {
        handleLootCouncilEvents(lootCouncilEvents);
      }
    } catch (error) {
      // Log but do not throw - loot council errors should not interrupt monitoring
      appendDebugLog('Error processing loot council events', { error: String(error) });
    }
  }
  const includeConsole = Boolean(monitorSession.value);
  const consolePayloads: LootConsolePayload[] = [];

  // Debug: Log NPC kill parsing results
  if (npcKillEvents.length > 0) {
    appendDebugLog('NPC kills parsed from log', {
      count: npcKillEvents.length,
      kills: npcKillEvents.map((k) => ({
        npcName: k.npcName,
        timestamp: k.timestamp?.toISOString(),
        zoneName: k.zoneName,
        killerName: k.killerName
      }))
    });
  }

  if (npcKillEvents.length > 0) {
    const newKills: ParsedNpcKillEvent[] = [];
    for (const kill of npcKillEvents) {
      const key = buildNpcKillKey(kill);
      if (processedNpcKillKeys.has(key)) {
        appendDebugLog('NPC kill skipped (duplicate)', { key, npcName: kill.npcName });
        continue;
      }
      processedNpcKillKeys.add(key);
      newKills.push(kill);
    }
    if (newKills.length > 0) {
      appendDebugLog('Sending NPC kills to server', {
        count: newKills.length,
        kills: newKills.map((k) => k.npcName)
      });
      void persistRaidNpcKillEvents(newKills);
    } else {
      appendDebugLog('No new NPC kills to send (all duplicates)');
    }
  }

  if (parsed.length === 0) {
    if (!options.append) {
      parsedLoot.value = [];
      parsedLootPage.value = 1;
    }
    appendDebugLog('Parsing completed', {
      parsedCount: 0,
      appended: options.append
    });
    return;
  }

  const manualEntries: ParsedLootEvent[] = [];
  const autoKept: ParsedLootEvent[] = [];
  const autoDiscarded: ParsedLootEvent[] = [];
  const patternLookup = new Map<string, GuildLootParserPattern>();
  for (const pattern of patterns) {
    patternLookup.set(pattern.id, pattern);
  }

  for (const entry of parsed) {
    const key = buildParsedEventKey(entry);
    if (processedLogKeys.has(key)) {
      if (includeConsole) {
        consolePayloads.push({
          line: formatConsoleLine(entry),
          status: 'REJECTED'
        });
      }
      continue;
    }

    const matchedPattern = entry.patternId ? patternLookup.get(entry.patternId) : undefined;
    if (shouldIgnoreByMethod(matchedPattern, entry.method)) {
      processedLogKeys.add(key);
      appendDebugLog('Ignored loot due to method filter', {
        method: entry.method ?? null,
        patternId: entry.patternId
      });
      if (includeConsole) {
        consolePayloads.push({
          line: formatConsoleLine(entry),
          status: 'REJECTED'
        });
      }
      continue;
    }

    const candidateName = entry.itemName ?? entry.looter ?? null;
    const normalizedName = candidateName ? normalizeLootItemName(candidateName) : null;
    const itemId = entry.itemId ?? null;

    if (autoBlacklistSpells.value && candidateName) {
      const lowerName = candidateName.toLowerCase();
      if (lowerName.includes('spell:') || lowerName.includes('song:')) {
        processedLogKeys.add(key);
        autoDiscarded.push(entry);
        if (includeConsole) {
          consolePayloads.push({
            line: formatConsoleLine(entry),
            status: 'REJECTED'
          });
        }
        continue;
      }
    }

    const whitelistMatch = matchesLootListEntry(whitelistLookup.value, itemId, normalizedName);
    if (whitelistMatch) {
      processedLogKeys.add(key);
    const normalizedLooter = normalizeLooterNameValue(entry.looter ?? entry.itemName ?? 'Unknown');
    autoKept.push({
      ...entry,
      itemName: candidateName ?? 'Unknown Item',
      looter: normalizedLooter
    });
      if (includeConsole) {
        consolePayloads.push({
          line: formatConsoleLine(entry),
          status: 'ACCEPTED'
        });
      }
      continue;
    }

    const blacklistMatch = matchesLootListEntry(blacklistLookup.value, itemId, normalizedName);
    if (blacklistMatch) {
      processedLogKeys.add(key);
      autoDiscarded.push(entry);
      if (includeConsole) {
        consolePayloads.push({
          line: formatConsoleLine(entry),
          status: 'REJECTED'
        });
      }
      continue;
    }

    manualEntries.push(entry);
  }

  if (autoKept.length > 0) {
    void persistAutoKeptLoot(autoKept, emoji);
    appendDebugLog('Automatically kept whitelisted loot', { count: autoKept.length });
  }

  if (autoDiscarded.length > 0) {
    appendDebugLog('Automatically discarded blacklisted loot', { count: autoDiscarded.length });
  }

  const newRows = transformParsedEvents(manualEntries, emoji, (entry, result) => {
    if (includeConsole) {
      consolePayloads.push({
        line: formatConsoleLine(entry),
        status: result
      });
    }
  });
  if (newRows.length === 0) {
    appendDebugLog('Parsing completed with no new loot rows', {
      parsedCount: parsed.length,
      appended: options.append,
      autoKept: autoKept.length,
      autoDiscarded: autoDiscarded.length
    });
    if (includeConsole) {
      enqueueLootConsoleEntries(consolePayloads);
    }
    return;
  }

  parsedLoot.value = options.append ? [...parsedLoot.value, ...newRows] : newRows;
  if (parsedLoot.value.length > 0) {
    if (canManageLoot.value) {
      showDetectedModal.value = true;
    }
    parsedLootPage.value = 1;
    if (monitorSession.value?.isOwner) {
      window.dispatchEvent(
        new CustomEvent('loot-actions-pending', {
          detail: {
            raidId,
            raidName: raid.value?.name ?? null,
            lootCount: parsedLoot.value.length
          }
        })
      );
    }
  }
  appendDebugLog('Parsing completed', {
    parsedCount: parsed.length,
    appended: options.append,
    addedRows: newRows.length,
    autoKept: autoKept.length,
    autoDiscarded: autoDiscarded.length
  });
  if (includeConsole) {
    enqueueLootConsoleEntries(consolePayloads);
  }
}

function formatConsoleLine(entry: ParsedLootEvent) {
  if (entry.rawLine && entry.rawLine.trim().length > 0) {
    return entry.rawLine.trim();
  }
  const parts: string[] = [];
  if (entry.timestamp) {
    parts.push(entry.timestamp.toISOString());
  }
  if (entry.looter) {
    parts.push(normalizeLooterNameValue(entry.looter));
  }
  if (entry.itemName) {
    parts.push(`→ ${entry.itemName}`);
  }
  if (parts.length === 0) {
    return 'Loot event detected';
  }
  return parts.join(' ');
}

function transformParsedEvents(
  parsed: ParsedLootEvent[],
  emoji: string,
  onProcessed?: (entry: ParsedLootEvent, result: LootConsoleStatus) => void
): ParsedRow[] {
  const patternLookup = new Map<string, GuildLootParserPattern>();
  for (const pattern of getPatternsForParsing()) {
    patternLookup.set(pattern.id, pattern);
  }
  const rows: ParsedRow[] = [];
  for (const entry of parsed) {
    const key = buildParsedEventKey(entry);
    if (processedLogKeys.has(key)) {
      onProcessed?.(entry, 'REJECTED');
      continue;
    }
    const matchedPattern = entry.patternId ? patternLookup.get(entry.patternId) : undefined;
    if (shouldIgnoreByMethod(matchedPattern, entry.method)) {
      appendDebugLog('Ignored detected loot row due to method filter', {
        method: entry.method ?? null,
        patternId: entry.patternId
      });
      onProcessed?.(entry, 'REJECTED');
      continue;
    }
    processedLogKeys.add(key);
    const itemName = entry.itemName ?? entry.looter ?? 'Unknown Item';
    const looterName = normalizeLooterNameValue(entry.looter ?? entry.itemName ?? 'Unknown');
    entry.looter = looterName;
    rows.push({
      id: `parsed-${processedLogKeys.size}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: entry.timestamp,
      rawLine: entry.rawLine,
      itemName,
      itemId: entry.itemId ?? null,
      looterName,
      emoji,
      disposition: 'KEEP'
    });
    onProcessed?.(entry, 'ACCEPTED');
  }
  return rows;
}

function shouldIgnoreByMethod(
  pattern: GuildLootParserPattern | undefined,
  method: string | null | undefined
) {
  if (!pattern?.ignoredMethods || pattern.ignoredMethods.length === 0) {
    return false;
  }
  const methodNormalized = normalizeMethodName(method);
  if (!methodNormalized) {
    return false;
  }
  return pattern.ignoredMethods.some(
    (ignored) => normalizeMethodName(ignored) === methodNormalized
  );
}

function buildParsedEventKey(entry: ParsedLootEvent) {
  const timestamp = entry.timestamp ? entry.timestamp.toISOString() : 'unknown';
  return `${timestamp}::${entry.rawLine}`;
}

function buildNpcKillKey(entry: ParsedNpcKillEvent) {
  const timestamp = entry.timestamp ? entry.timestamp.toISOString() : 'unknown';
  const killer = entry.killerName?.toLowerCase() ?? '';
  return `${timestamp}::${entry.npcName.toLowerCase()}::${killer}`;
}

const formatLooterLabel = (name: string, looterClass?: string | null) => {
  const classLabel = formatCharacterClassLabel(looterClass);
  return classLabel ? `${name} (${classLabel})` : name;
};

function getInterestVoteCount(interest: LootCouncilInterestState) {
  const tally = interest.votes ?? 0;
  const voterTally = interest.voters?.length ?? 0;
  return Math.max(tally, voterTally);
}

function applyLocalLootResolution(
  itemName: string,
  options: { awardedTo: string | null; status: LootCouncilItemStatus }
) {
  if (!lootEvents.value.length) {
    return;
  }
  const normalized = normalizeLootItemName(itemName);
  if (!normalized) {
    return;
  }
  let mutated = false;
  const next: RaidLootEvent[] = [];
  let remainingAwards = options.status === 'AWARDED' && options.awardedTo ? 1 : 0;
  for (const event of lootEvents.value) {
    if (!event?.itemName) {
      next.push(event);
      continue;
    }
    const eventNormalized = normalizeLootItemName(event.itemName);
    if (eventNormalized !== normalized) {
      next.push(event);
      continue;
    }
    if (!event.looterName || !isMasterLooterName(event.looterName)) {
      next.push(event);
      continue;
    }
    if (options.status === 'REMOVED') {
      mutated = true;
      continue;
    }
    if (options.status === 'AWARDED' && options.awardedTo && remainingAwards > 0) {
      mutated = true;
      remainingAwards -= 1;
      next.push({
        ...event,
        looterName: normalizeLooterNameValue(options.awardedTo)
      });
      continue;
    }
    next.push(event);
  }
  if (mutated) {
    lootEvents.value = next;
  }
}

function isResolvedLootEvent(event: RaidLootEvent) {
  if (!event.itemName) {
    return false;
  }
  if (!event.looterName) {
    return false;
  }
  if (!isMasterLooterName(event.looterName)) {
    return true;
  }
  const note = event.note?.toLowerCase() ?? '';
  if (note.includes('donated') || note.includes('guild')) {
    return true;
  }
  if (isGuildBankName(event.looterName)) {
    return true;
  }
  return false;
}

function reconcileLootCouncilWithAssignments() {
  if (!lootCouncilState.items.length || !lootEvents.value.length) {
    return;
  }
  const resolvedLookup = new Map<string, Date>();
  for (const event of lootEvents.value) {
    if (!isResolvedLootEvent(event)) {
      continue;
    }
    const normalized = normalizeLootItemName(event.itemName ?? '');
    if (!normalized) {
      continue;
    }
    const eventTime = event.eventTime ? new Date(event.eventTime) : new Date();
    resolvedLookup.set(normalized, eventTime);
  }
  if (resolvedLookup.size === 0) {
    return;
  }
  let changed = false;
  for (let index = lootCouncilState.items.length - 1; index >= 0; index -= 1) {
    const item = lootCouncilState.items[index];
    const resolvedAt = resolvedLookup.get(item.nameKey);
    if (!resolvedAt) {
      continue;
    }
    lootCouncilState.items.splice(index, 1);
    resolvedLootCouncilItems.set(item.nameKey, resolvedAt);
    changed = true;
  }
  if (changed && lootCouncilState.items.length === 0) {
    lootCouncilState.suppressed = false;
  }
  if (changed) {
    // Broadcast the updated state to other viewers
    scheduleLootCouncilStateBroadcast();
  }
}

async function autoAssignLootFromCouncil(itemName: string, awardedTo: string, timestamp: Date) {
  if (!raid.value || !canManageLoot.value) {
    return;
  }
  const normalizedItem = normalizeLootItemName(itemName);
  const normalizedLooter = normalizeLooterNameValue(awardedTo);
  const target = findPendingLootEventForItem(normalizedItem);
  if (!target) {
    appendDebugLog('Loot council assignment skipped: no pending loot matches', {
      itemName,
      awardedTo
    });
    return;
  }
  try {
    await api.updateRaidLoot(raidId, target.id, {
      looterName: normalizedLooter,
      looterClass: target.looterClass ?? null,
      eventTime: timestamp.toISOString()
    });
    appendDebugLog('Loot council assignment applied', {
      lootId: target.id,
      itemName,
      awardedTo: normalizedLooter
    });
    await refreshLootEvents();
    window.dispatchEvent(
      new CustomEvent('loot-assigned', {
        detail: {
          raidId,
          itemName,
          looterName: normalizedLooter
        }
      })
    );
  } catch (error) {
    appendDebugLog('Failed to assign loot from council award', {
      itemName,
      awardedTo,
      error: String(error)
    });
  }
}

function findPendingLootEventForItem(normalizedItemName: string) {
  for (const event of lootEvents.value) {
    if (!event.itemName) {
      continue;
    }
    const eventItem = normalizeLootItemName(event.itemName);
    if (eventItem !== normalizedItemName) {
      continue;
    }
    if (!event.looterName || !isMasterLooterName(event.looterName)) {
      continue;
    }
    return event;
  }
  return null;
}

function handleExistingLootCardClick(event: MouseEvent, itemName: string, itemId?: number | null) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a')) {
    return;
  }
  openAllaSearch(itemName, itemId);
}

function handleExistingLootCardKeyEnter(event: KeyboardEvent, itemName: string, itemId?: number | null) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a')) {
    return;
  }
  openAllaSearch(itemName, itemId);
}

function normalizeCharacterClassValue(value?: string | null): CharacterClass | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(characterClassLabels, normalized)
    ? (normalized as CharacterClass)
    : null;
}

const formatCharacterClassLabel = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const upper = normalized.toUpperCase() as CharacterClass;
  if (upper in characterClassLabels) {
    return characterClassLabels[upper];
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

function computeLogWindowStats(content: string, start: Date, end?: Date) {
  const lines = content.split(/\r?\n/);
  let timestampedLines = 0;
  let withinWindowLines = 0;
  const samples: string[] = [];
  for (const line of lines) {
    const timestamp = extractConsoleTimestamp(line);
    if (!timestamp) {
      continue;
    }
    timestampedLines++;
    if (!isTimestampWithinWindow(timestamp, start, end)) {
      continue;
    }
    withinWindowLines++;
    if (samples.length < 3) {
      samples.push(line.trim());
    }
  }
  return { timestampedLines, withinWindowLines, samples };
}

function extractConsoleTimestamp(line: string) {
  const match = line.match(consoleTimestampRegex);
  if (!match?.groups) {
    return null;
  }
  const { day, month, date, time, year } = match.groups;
  const composed = `${day} ${month} ${date} ${time} ${year}`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTimestampWithinWindow(timestamp: Date, start: Date, end?: Date) {
  if (timestamp < start) {
    return false;
  }
  if (end && timestamp > end) {
    return false;
  }
  return true;
}

function getPatternsForParsing() {
  if (parserSettings.value?.patterns?.length) {
    return parserSettings.value.patterns;
  }
  return defaultRegexPatterns;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function formatRelativeTime(value: string) {
  try {
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const delta = new Date(value).getTime() - Date.now();
    const minutes = Math.round(delta / 60000);
    if (Math.abs(minutes) < 1) {
      return 'just now';
    }
    if (Math.abs(minutes) < 60) {
      return formatter.format(minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    return formatter.format(hours, 'hour');
  } catch {
    return formatDate(value);
  }
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) {
    return '0 B';
  }
  const thresholds = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < thresholds.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 && unitIndex > 0 ? 1 : 0)} ${thresholds[unitIndex]}`;
}

function ensureAwardingPatterns(patterns: GuildLootParserPattern[]) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return defaultRegexPatterns;
  }
  const hasAwarding = patterns.some((pattern) =>
    pattern.pattern?.includes('has\\s+been\\s+awarded')
  );
  if (hasAwarding) {
    return patterns;
  }
  const missingDefaults = defaultRegexPatterns.filter(
    (pattern) => !patterns.some((existing) => existing.pattern === pattern.pattern)
  );
  return [...patterns, ...missingDefaults];
}

function preparePatternsForParsing(patterns: GuildLootParserPattern[]) {
  const merged = ensureAwardingPatterns(patterns);
  return merged.map((pattern) => ({
    ...pattern,
    ignoredMethods: sanitizeIgnoredMethods(pattern.ignoredMethods ?? []),
    pattern: pattern.pattern.includes('{')
      ? convertPlaceholdersToRegex(pattern.pattern)
      : pattern.pattern
  }));
}

const consoleTimestampRegex =
  /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

function appendDebugLog(message: string, context?: Record<string, unknown>) {
  const entry: DebugLogEntry = {
    id: Date.now() + Math.random(),
    timestamp: new Date(),
    message,
    context
  };
  debugLogs.value = [...debugLogs.value.slice(-199), entry];
}

function formatContext(context: Record<string, unknown>) {
  return JSON.stringify(context, null, 2);
}

async function copyDebugLogs() {
  if (debugLogs.value.length === 0) {
    return;
  }
  const serialized = debugLogs.value
    .map((entry) => {
      const base = `[${entry.timestamp.toISOString()}] ${entry.message}`;
      if (entry.context) {
        return `${base}\n${formatContext(entry.context)}`;
      }
      return base;
    })
    .join('\n\n');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(serialized);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = serialized;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    appendDebugLog('Debug console copied to clipboard');
  } catch (error) {
    appendDebugLog('Failed to copy debug logs', { error: String(error) });
  }
}

function handleResetProcessedLogs() {
  resetProcessedLogState({ clearStorage: true, signature: null });
  appendDebugLog('Processed log state reset manually');
}

function resetDetectedLoot() {
  parsedLoot.value = [];
  if (activeLogSignature.value) {
    clearStoredProcessedKeys(activeLogSignature.value);
  }
  processedLogKeys.clear();
  processedNpcKillKeys.clear();
  activeLogSignature.value = null;
  showDetectedModal.value = false;
  appendDebugLog('Detected loot reset');
}

function closeDetectedLootModal() {
  showDetectedModal.value = false;
  parsedLootPage.value = 1;
}

async function deleteLootGroup(entry: GroupedLootEntry, options?: { skipConfirm?: boolean }) {
  if (!canDeleteExistingLoot.value) {
    return;
  }
  if (!options?.skipConfirm) {
    const confirmed = confirm(
      `Remove ${entry.count} entr${entry.count === 1 ? 'y' : 'ies'} of ${entry.itemName} looted by ${entry.displayLooterName}?`
    );
    if (!confirmed) {
      return;
    }
  }
  try {
    await Promise.all(entry.eventIds.map((lootId) => api.deleteRaidLoot(raidId, lootId)));
    lootEvents.value = lootEvents.value.filter((event) => !entry.eventIds.includes(event.id));
    appendDebugLog('Deleted loot entries', {
      itemName: entry.itemName,
      looterName: entry.displayLooterName,
      count: entry.count
    });
  } catch (error) {
    appendDebugLog('Failed to delete loot entries', { error: String(error) });
  }
}

function openAllaSearch(itemName: string, itemId?: number | null) {
  const trimmedName = itemName?.trim();
  if (itemId != null && Number.isFinite(itemId) && itemId > 0) {
    const directUrl = `https://alla.clumsysworld.com/?a=item&id=${Math.trunc(itemId)}`;
    window.open(directUrl, '_blank');
    return;
  }
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const query = trimmedName && trimmedName.length > 0 ? trimmedName : itemName;
  const url = `${base}&iname=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleRefreshShortcut);
  window.addEventListener('click', handleGlobalPointerDown);
  window.addEventListener('contextmenu', handleGlobalPointerDown);
  window.addEventListener('keydown', handleLootContextMenuKey);
  window.addEventListener('active-raid-updated', handleActiveRaidUpdated);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  lootDispositionHistory.value = loadLootDispositionHistory();
  // Trigger item resolution for any disposition entries with missing IDs
  if (lootDispositionHistory.value.some((entry) => entry.itemId == null || entry.itemIconId == null)) {
    scheduleLootCouncilItemResolution();
  }
  loadData();
});

onBeforeRouteLeave(handleBeforeRouteLeave);

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('keydown', handleRefreshShortcut);
  window.removeEventListener('click', handleGlobalPointerDown);
  window.removeEventListener('contextmenu', handleGlobalPointerDown);
  window.removeEventListener('keydown', handleLootContextMenuKey);
  window.removeEventListener('keydown', handleDetectedModalKeydown);
  window.removeEventListener('active-raid-updated', handleActiveRaidUpdated);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopMonitorStatusPolling();
  if (monitorSession.value?.isOwner) {
    void stopActiveMonitor();
  } else {
    cleanupMonitorController();
  }
  clearLootConsole();
  attentionStore.unregisterIndicator(DETECTED_LOOT_INDICATOR_ID);
  attentionStore.unregisterIndicator(LOOT_COUNCIL_INDICATOR_ID);
});
</script>

<style scoped>
.loot-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.loot-readonly-card {
  border-left: 4px solid rgba(59, 130, 246, 0.6);
  background: rgba(59, 130, 246, 0.08);
}

.loot-readonly-card p {
  margin: 0;
}

.upload-status-card {
  border-left: 4px solid rgba(56, 189, 248, 0.5);
}

.upload-status-card__body {
  padding: 0.75rem 0 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.monitor-card {
  display: flex;
  flex-direction: row;
  gap: 1.5rem;
  border-left: 4px solid #38bdf8;
}

.monitor-card__status {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.monitor-card__pulse {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.15);
  position: relative;
}

.monitor-card__pulse::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: #38bdf8;
  animation: monitorPulse 1.4s ease-in-out infinite;
}

@keyframes monitorPulse {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  70% {
    transform: scale(1.1);
    opacity: 0.3;
  }
  100% {
    transform: scale(0.8);
    opacity: 1;
  }
}

/* Health status indicators for monitor pulse */
.monitor-card__pulse--degraded {
  background: rgba(251, 191, 36, 0.15);
}

.monitor-card__pulse--degraded::after {
  background: #fbbf24;
}

.monitor-card__pulse--recovering {
  background: rgba(251, 191, 36, 0.15);
}

.monitor-card__pulse--recovering::after {
  background: #fbbf24;
  animation: monitorPulseRecovering 0.8s ease-in-out infinite;
}

@keyframes monitorPulseRecovering {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.5;
  }
}

.monitor-card__pulse--error {
  background: rgba(239, 68, 68, 0.15);
}

.monitor-card__pulse--error::after {
  background: #ef4444;
  animation: none;
}

.monitor-card__health-warning {
  margin: 0.4rem 0 0;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 4px;
  border-left: 3px solid #fbbf24;
}

.monitor-card__user {
  margin: 0;
  font-weight: 600;
}

.monitor-card__file {
  margin: 0.2rem 0;
  font-family: 'IBM Plex Mono', Consolas, monospace;
  font-size: 0.9rem;
  color: #bae6fd;
}

.monitor-card__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.parsing-window {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 118, 214, 0.15));
  color: #e2e8f0;
  box-shadow: 0 12px 30px rgba(15, 118, 214, 0.15);
}

.loot-console-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.35rem;
  max-width: 100%;
  overflow: visible;
  padding-right: 0.75rem;
}

.loot-console-stage {
  position: relative;
  min-height: 2.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  border-radius: 0.85rem;
  isolation: isolate;
  max-width: calc(100vw - 3rem);
}

.loot-console__suppress {
  padding: 0.45rem 0.9rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.loot-console__suppress:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(59, 130, 246, 0.45);
  transform: translateY(-1px);
}

.loot-console__suppress:active {
  transform: translateY(0);
}

.loot-console {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  margin: auto;
  transform: translateY(var(--loot-console-offset, 0));
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  max-width: min(calc(100vw - 3.5rem), 720px);
  padding: 0.6rem 1rem;
  border-radius: 0.85rem;
  border: none;
  background: rgba(15, 23, 42, 0.82);
  box-shadow: none;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, monospace;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
  position: relative;
  overflow: hidden;
}

.loot-console::before,
.loot-console::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 12px;
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(to bottom, rgba(15, 23, 42, 0.85), transparent);
}

.loot-console::after {
  top: auto;
  bottom: 0;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.85), transparent);
}

.loot-console--accepted {
  border-color: rgba(74, 222, 128, 0.35);
  color: #c4fce0;
  box-shadow: 0 12px 26px rgba(34, 197, 94, 0.22);
}

.loot-console--rejected {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fed7d7;
  box-shadow: 0 12px 26px rgba(248, 113, 113, 0.2);
}

.loot-console__line {
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(calc(100vw - 4.5rem), 680px);
}

.loot-console-transition-enter-active,
.loot-console-transition-leave-active {
  transition: transform 0.35s ease, opacity 0.35s ease;
}

.loot-console-transition-enter-from {
  --loot-console-offset: 100%;
  opacity: 0;
}

.loot-console-transition-enter-to {
  --loot-console-offset: 0;
  opacity: 1;
}

.loot-console-transition-leave-from {
  --loot-console-offset: 0;
  opacity: 1;
}

.loot-console-transition-leave-to {
  --loot-console-offset: -110%;
  opacity: 0;
}

.parsing-window__icon {
  width: 44px;
  height: 44px;
  border-radius: 0.9rem;
  background: rgba(14, 165, 233, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.parsing-window__details {
  flex: 1;
  min-width: 220px;
}

.parsing-window__label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.parsing-window__range {
  margin: 0.15rem 0 0;
  font-weight: 600;
  font-size: 1rem;
}

.parsing-window__hint {
  margin: 0.1rem 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.parsing-window__button {
  margin-left: auto;
}

.parsing-window__button--debug {
  margin-left: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: auto;
}

.parsing-window__button-text {
  font-size: 0.85rem;
}

.parsing-window-spacer {
  margin-top: 1.25rem;
}

.btn--settings {
  border-color: rgba(14, 165, 233, 0.6);
  color: #bae6fd;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.25));
}

.btn--settings:hover {
  border-color: rgba(14, 165, 233, 0.85);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.35), rgba(99, 102, 241, 0.4));
}

.upload-drop {
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.upload-drop--active {
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(59, 130, 246, 0.08);
  color: #bae6fd;
}

.upload-drop--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.error-text {
  color: #f87171;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.upload-drop__prompt {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.upload-drop__prompt p {
  margin: 0;
}

.upload-drop__button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border-color: rgba(59, 130, 246, 0.65);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(14, 165, 233, 0.3));
  box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
}

.upload-drop__button:hover {
  border-color: rgba(59, 130, 246, 0.9);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(14, 165, 233, 0.45));
  color: #fff;
}

.progress {
  margin-top: 0.75rem;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.progress__bar {
  height: 100%;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(99, 102, 241, 0.8));
}

.loot-table {
  width: 100%;
  border-collapse: collapse;
}

.loot-table th,
.loot-table td {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.loot-table__row--discarded {
  opacity: 0.6;
}

.loot-table input {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.4rem;
  color: #e2e8f0;
  padding: 0.4rem;
}

.disposition-buttons {
  display: inline-flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.disposition-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.65);
  border-radius: 0.6rem;
  padding: 0.3rem 0.55rem;
  color: #e2e8f0;
  font-size: 0.85rem;
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.disposition-button:hover:not(:disabled),
.disposition-button:focus-visible:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.3);
}

.disposition-button--selected {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(56, 189, 248, 0.15);
  box-shadow: 0 10px 20px rgba(56, 189, 248, 0.25);
}

.disposition-button--keep.disposition-button--selected {
  border-color: rgba(34, 197, 94, 0.6);
  background: rgba(34, 197, 94, 0.2);
}

.disposition-button--discard.disposition-button--selected {
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.18);
}

.disposition-button--whitelist.disposition-button--selected {
  border-color: rgba(250, 204, 21, 0.6);
  background: rgba(250, 204, 21, 0.22);
}

.disposition-button--blacklist.disposition-button--selected {
  border-color: rgba(148, 163, 184, 0.5);
  background: rgba(148, 163, 184, 0.18);
}

.disposition-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.disposition-button__icon {
  font-size: 0.95rem;
}

.loot-context-menu {
  position: fixed;
  z-index: 50;
  min-width: 220px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.8rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.45);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.loot-context-menu__header {
  font-weight: 600;
  font-size: 0.9rem;
  color: #f8fafc;
  margin-bottom: 0.25rem;
}

.loot-context-menu__action {
  background: transparent;
  border: none;
  color: #cbd5f5;
  padding: 0.4rem 0.5rem;
  text-align: left;
  border-radius: 0.5rem;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.loot-context-menu__action:hover,
.loot-context-menu__action:focus-visible {
  background: rgba(59, 130, 246, 0.2);
  color: #f8fafc;
}

.loot-context-menu__action--remove {
  color: #fca5a5;
}

.loot-context-menu__action--remove:hover,
.loot-context-menu__action--remove:focus-visible {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

.loot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.loot-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.35);
  position: relative;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  cursor: pointer;
}

.loot-card--needs-assignment {
  border-color: rgba(239, 68, 68, 0.45);
  background: linear-gradient(150deg, rgba(127, 29, 29, 0.82), rgba(220, 38, 38, 0.45));
  box-shadow: 0 12px 28px rgba(127, 29, 29, 0.45);
}

.loot-card--needs-assignment:hover,
.loot-card--needs-assignment:focus-visible {
  border-color: rgba(248, 113, 113, 0.75);
  box-shadow: 0 18px 34px rgba(127, 29, 29, 0.6);
}

.loot-card:not(.loot-card--needs-assignment):hover,
.loot-card:not(.loot-card--needs-assignment):focus-visible {
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.45);
}

.loot-card__count {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.5);
  color: #bbf7d0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.65rem;
  font-weight: 700;
  font-size: 0.85rem;
}

.loot-card--needs-assignment .loot-card__count {
  background: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.65);
  color: #fecaca;
}

.loot-card__badge {
  position: absolute;
  bottom: 0.55rem;
  right: 0.75rem;
  font-size: 0.95rem;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.5));
  pointer-events: none;
  z-index: 1;
}

.loot-card__badge--whitelist {
  color: #facc15;
}

.loot-card__header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding-right: 2.5rem;
}

.loot-card__icon {
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.loot-card__icon picture,
.loot-card__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.loot-card__emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.45rem;
}

.loot-card__item {
  margin: 0;
  font-weight: 700;
}

.loot-card__looter {
  margin: 0;
  color: #94a3b8;
}

.loot-council-interest__name {
  font-weight: 600;
  color: #e2e8f0;
}

.loot-council-interest__name.clickable {
  color: #60a5fa;
  cursor: pointer;
  transition: color 0.2s ease;
}

.loot-council-interest__name.clickable:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.loot-card__looter-name.clickable {
  color: #60a5fa;
  cursor: pointer;
  transition: color 0.2s ease;
}

.loot-card__looter-name.clickable:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.loot-card__looter-name--unassigned {
  color: #fecaca;
}

.loot-card__looter .character-link {
  color: #38bdf8;
}

.loot-card__looter .character-link:hover,
.loot-card__looter .character-link:focus-visible {
  color: #f8fafc;
}

.loot-card__looter-class {
  margin-left: 0.35rem;
}

.loot-card__note {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.loot-card__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}

.btn__icon {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1;
}

.btn--add-loot {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  border-color: rgba(59, 130, 246, 0.6);
  color: #bfdbfe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(14, 165, 233, 0.2));
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.25);
}

.btn--add-loot:hover {
  border-color: rgba(59, 130, 246, 0.85);
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(14, 165, 233, 0.35));
}

.btn--add-loot .btn__icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem;
  background: rgba(14, 165, 233, 0.35);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  box-shadow: 0 0 8px rgba(14, 165, 233, 0.25);
}

.btn--modal-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.9));
  border: none;
  color: #ecfccb;
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.35);
}

.btn--modal-primary:hover {
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.9), rgba(16, 185, 129, 1));
  color: #fff;
}

.btn--detected {
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.85), rgba(147, 197, 253, 0.9));
  color: #0f172a;
  border: none;
  box-shadow: 0 12px 30px rgba(129, 140, 248, 0.35);
}

.btn--detected:hover {
  color: #020617;
  box-shadow: 0 14px 34px rgba(129, 140, 248, 0.45);
}

.btn--modal-outline {
  border-color: rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.4);
}

.btn--modal-outline:hover {
  border-color: rgba(148, 163, 184, 0.8);
  color: #fff;
  background: rgba(30, 41, 59, 0.6);
}

.btn--modal-danger {
  border-color: rgba(248, 113, 113, 0.5);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.25);
}

.btn--modal-danger:hover {
  border-color: rgba(248, 113, 113, 0.8);
  background: rgba(127, 29, 29, 0.45);
  color: #fff;
}

.window-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.window-form__controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.window-form__actions {
  display: flex;
  gap: 0.75rem;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.form__actions--single {
  justify-content: center;
}

.btn--detected-save {
  min-width: 220px;
}

.detected-card {
  text-align: center;
}

.detected-card__actions {
  display: none;
}

.detected-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.detected-card__buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.upload-mode-modal .modal__header h3 {
  margin-bottom: 0.25rem;
}

.upload-mode-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.upload-mode-card {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(15, 23, 42, 0.65);
  min-height: 100%;
}

.upload-mode-card--disabled {
  opacity: 0.5;
}

.upload-mode-warning {
  margin: 0.25rem 0 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(248, 113, 113, 0.5);
  border-radius: 0.75rem;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 0.85rem;
}

.upload-mode-button {
  width: 100%;
  border: none;
  border-radius: 0.75rem;
  padding: 0.9rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
  text-align: left;
  color: inherit;
}

.upload-mode-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.upload-mode-button:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 25px rgba(15, 23, 42, 0.45);
}

.upload-mode-button--primary,
.upload-mode-button--outline {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.7), rgba(14, 165, 233, 0.8));
  color: #f8fafc;
  box-shadow: 0 12px 30px rgba(14, 165, 233, 0.4);
  border: 1px solid rgba(56, 189, 248, 0.45);
  margin-top: auto;
}

.upload-mode-card--disabled .upload-mode-button--outline {
  background: rgba(30, 41, 59, 0.7);
  border: 1px dashed rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
  box-shadow: none;
}

.upload-mode-button__icon {
  font-size: 1.5rem;
}

.upload-mode-button__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.upload-mode-button__text strong {
  font-size: 1rem;
}

.upload-mode-button__text small {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.8);
}

.clear-loot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.clear-loot-actions__button--danger {
  border-color: rgba(248, 113, 113, 0.55);
  color: #fecaca;
}

.clear-loot-actions__button--danger:hover,
.clear-loot-actions__button--danger:focus-visible {
  border-color: rgba(239, 68, 68, 0.75);
  color: #fee2e2;
  background: rgba(239, 68, 68, 0.12);
}

.clear-loot-actions__button--success {
  border-color: rgba(34, 197, 94, 0.55);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.35), rgba(16, 185, 129, 0.4));
  color: #f8fafc;
  text-shadow: none;
}

.clear-loot-actions__button--success:hover,
.clear-loot-actions__button--success:focus-visible {
  border-color: rgba(22, 163, 74, 0.75);
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.65), rgba(34, 197, 94, 0.6));
  color: #f8fafc;
}

.default-log-modal {
  max-width: 420px;
  width: 100%;
}

.default-log-modal__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem 0 1rem;
}

.default-log-modal__filename {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #f8fafc;
  word-break: break-word;
}

.default-log-modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.edit-loot-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.edit-loot-form .form__field span {
  font-weight: 600;
}

.leave-monitor-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.25rem;
}

.leave-monitor-button {
  min-width: 150px;
  padding: 0.85rem 1.75rem;
  font-size: 1rem;
}

.leave-monitor-button--stay {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.75), rgba(16, 185, 129, 0.85));
  border: none;
  color: #f0fdf4;
  box-shadow: 0 12px 25px rgba(16, 185, 129, 0.35);
}

.leave-monitor-button--stay:hover {
  filter: brightness(1.05);
}

.leave-monitor-button--leave {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.8), rgba(239, 68, 68, 0.9));
  border: none;
  color: #fff1f2;
  box-shadow: 0 12px 25px rgba(248, 113, 113, 0.35);
}

.leave-monitor-button--leave:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.detected-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.detected-table-wrapper {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.75rem;
}

.detected-table-wrapper .loot-table {
  margin: 0;
}

.detected-table-wrapper .loot-table input {
  background: rgba(15, 23, 42, 0.7);
}

.debug-console {
  background: rgba(15, 23, 42, 0.75);
}

.debug-console__body {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
}

.debug-console__actions {
  display: flex;
  gap: 0.5rem;
}

.debug-console__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.debug-console__entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.debug-console__entry:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.debug-console__timestamp {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.debug-console__message {
  margin: 0;
  font-weight: 600;
}

.debug-console__context {
  margin: 0;
  font-size: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0.5rem;
  padding: 0.5rem;
  color: #e2e8f0;
}

.manual-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.manual-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.manual-form__grid input,
.manual-form__grid textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 0.5rem;
  color: #f8fafc;
}

.assign-loot-modal {
  width: clamp(360px, 80vw, 520px);
}

.assign-loot__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
}

.assign-loot__current {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.assign-loot__search-label {
  display: block;
}

.assign-loot__search {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
}

.assign-loot__search:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

.assign-loot__list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.4);
  padding: 0.5rem;
}

.assign-loot__options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.assign-loot__option {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.65rem;
  transition: background 0.15s ease;
}

.assign-loot__option:hover,
.assign-loot__option:focus-within {
  background: rgba(148, 163, 184, 0.15);
}

.assign-loot__radio {
  margin-top: 0.2rem;
}

.assign-loot__option-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.assign-loot__option-name {
  font-weight: 600;
  color: #e2e8f0;
}

.assign-loot__option-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #94a3b8;
}

.assign-loot__option-meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.assign-loot__badge {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.25);
  color: #fde68a;
  font-size: 0.75rem;
  font-weight: 600;
}

.assign-loot__badge--bank {
  background: rgba(59, 130, 246, 0.25);
  color: #bfdbfe;
}

.assign-loot__error {
  margin: 0;
}

.assign-loot__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 0.75rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 200;
}

.modal {
  width: min(960px, 95vw);
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  overflow: hidden;
}

.settings-form__body {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 1rem;
}

.settings-grid__side,
.settings-grid__main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form__field input,
.form__field textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  color: #f8fafc;
  padding: 0.5rem;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.placeholder-panel {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  padding: 0.85rem;
  gap: 0.5rem;
}

.placeholder-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.section-heading--stacked {
  flex-wrap: wrap;
  align-items: flex-start;
}

.placeholder-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
}

.placeholder-toolbar__label {
  min-width: 180px;
}

.placeholder-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
}

.placeholder-chip {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 0.65rem;
  padding: 0.5rem 0.85rem;
  background: rgba(59, 130, 246, 0.1);
  color: #e0f2fe;
  font-size: 0.85rem;
  cursor: pointer;
  min-width: 150px;
}

.placeholder-chip__token {
  font-weight: 600;
}

.placeholder-chip__text {
  font-size: 0.75rem;
  color: #bae6fd;
}

.sample-tester textarea {
  background: rgba(15, 23, 42, 0.6);
  border: 1px dashed rgba(59, 130, 246, 0.4);
  border-radius: 0.5rem;
  padding: 0.6rem;
  color: #f8fafc;
}

.pattern-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.4);
}

.pattern-card--empty {
  align-items: flex-start;
  text-align: left;
  gap: 0.75rem;
}

.pattern-card--active {
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
}

.pattern-card--collapsed .pattern-card__body {
  display: none;
}

.pattern-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pattern-card__helper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.pattern-card__helper-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5f5;
}

.pattern-card__helper-content {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.pattern-method-ignore {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.method-input {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.method-input__field {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 0.6rem;
  padding: 0.45rem 0.6rem;
  color: #e2e8f0;
}

.method-pill-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.method-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  color: #dbeafe;
  font-size: 0.75rem;
}

.method-pill__remove {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}

.pattern-card__header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.pattern-card__header-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
}

.pattern-card__toggle {
  width: 28px;
  height: 28px;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pattern-card__chevron {
  transition: transform 0.2s ease;
}

.pattern-card__chevron--rotated {
  transform: rotate(180deg);
}

.pattern-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(59, 130, 246, 0.15);
  color: #bfdbfe;
}

.pattern-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.35);
}

.pattern-preview__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.pattern-preview__code {
  display: block;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
  color: #f0abfc;
  word-break: break-all;
}

.pattern-test {
  border-radius: 0.65rem;
  padding: 0.65rem 0.85rem;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.pattern-test--match {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.1);
}

.pattern-test--miss {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
}

.pattern-test__header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.pattern-test__status {
  font-weight: 600;
  font-size: 0.9rem;
}

.pattern-test__list {
  list-style: none;
  padding: 0.25rem 0 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}

.pattern-test__list strong {
  font-weight: 600;
  color: #e2e8f0;
  margin-right: 0.25rem;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .settings-form__body {
    padding-right: 0;
  }
}

.pattern-card__header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 0.4rem;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.modal__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.icon-button--muted {
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.3);
}

.icon-button--muted:hover,
.icon-button--muted:focus-visible {
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.5);
  border-color: rgba(148, 163, 184, 0.45);
}

.loot-council-minimize {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.45), rgba(15, 23, 42, 0.85));
  color: #f8fafc;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.loot-council-minimize__icon {
  font-size: 1.1rem;
  line-height: 1;
  transform: translateY(-1px);
}

.loot-council-minimize:hover,
.loot-council-minimize:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.55);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.45);
}

.loot-council-clear-all {
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.3);
  color: #cbd5f5;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.loot-council-clear-all:hover,
.loot-council-clear-all:focus-visible {
  color: #f8fafc;
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.15);
}

.icon-button--delete {
  color: rgba(248, 113, 113, 0.8);
}

.icon-button--delete:hover,
.icon-button--delete:focus-visible {
  color: rgba(248, 113, 113, 1);
  background: rgba(248, 113, 113, 0.15);
}

.sr-only {
  position: absolute;
  left: -9999px;
}

.detected-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.detected-control {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.detected-control--keep {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.85), rgba(16, 185, 129, 0.9));
  border: none;
  color: #f0fdf4;
  box-shadow: 0 10px 18px rgba(16, 185, 129, 0.35);
}

.detected-control--discard {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.85), rgba(239, 68, 68, 0.9));
  border: none;
  color: #fff1f2;
  box-shadow: 0 10px 18px rgba(248, 113, 113, 0.35);
}

.detected-control:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.detected-save-button {
  min-width: 240px;
  font-size: 1rem;
  padding: 0.85rem 1.75rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(14, 165, 233, 0.95));
  border: none;
  color: #eff6ff;
  box-shadow: 0 12px 28px rgba(14, 165, 233, 0.35);
}

.detected-save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.loot-council-backdrop {
  z-index: 30;
}

.loot-council-modal {
  max-width: 760px;
  width: calc(100% - 2rem);
}

.loot-council-modal__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.loot-council-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  width: 100%;
}

.loot-council-column {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.35);
}

.loot-council-column--viewer-interest {
  border-color: rgba(250, 204, 21, 0.7);
  box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.35), 0 20px 40px rgba(15, 23, 42, 0.35);
}

.loot-council-column--viewer-favored {
  background: rgba(34, 197, 94, 0.28);
  border-color: rgba(34, 197, 94, 0.6);
}

.loot-council-column--viewer-unfavored {
  background: rgba(248, 113, 113, 0.28);
  border-color: rgba(248, 113, 113, 0.6);
}

.loot-council-column__header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.loot-council-column__icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(100, 116, 139, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.loot-council-column__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 5px;
}

.loot-council-column__icon-placeholder {
  color: #64748b;
  font-size: 1.2rem;
}

.loot-council-column__info {
  flex: 1;
  min-width: 0;
}

.loot-council-column__name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  cursor: pointer;
}

.loot-council-column__name:hover {
  color: #60a5fa;
}

.loot-council-column__meta {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.loot-council-column__ordinal {
  font-size: 0.85rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.15);
  color: #bfdbfe;
  height: fit-content;
}

.loot-council-column__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.35rem;
}

.loot-council-column__chip {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: #94a3b8;
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.loot-council-column__chip:hover,
.loot-council-column__chip:focus-visible {
  color: #f8fafc;
  border-color: rgba(148, 163, 184, 0.55);
  background: rgba(148, 163, 184, 0.12);
}

.loot-council-column__empty {
  margin: 0.75rem 0 0;
}

.loot-council-interest-list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loot-council-interest {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.loot-council-interest:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.loot-council-interest__details {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.loot-council-interest__headline {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.loot-council-interest__class {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loot-council-interest__class img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.loot-council-interest__replacement {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #cbd5f5;
  margin: 0;
}

.loot-council-interest__replacement--none {
  color: #94a3b8;
  font-style: italic;
}

.loot-council-interest__replacement-label {
  color: #94a3b8;
}

.loot-council-interest__replacement-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 3px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(100, 116, 139, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.loot-council-interest__replacement-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 2px;
}

.loot-council-interest__replacement-name {
  cursor: pointer;
}

.loot-council-interest__replacement-name:hover {
  color: #60a5fa;
}

.loot-council-interest__replacement-none {
  color: #94a3b8;
  font-style: italic;
}

.loot-council-interest__votes {
  display: inline-flex;
  gap: 0.15rem;
}

.loot-council-interest__vote-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  font-size: 0.7rem;
  cursor: help;
}

.loot-council-interest__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #94a3b8;
  white-space: nowrap;
}

.loot-council-interest__vote-count {
  font-weight: 600;
  color: #facc15;
}

.loot-council-interest__timestamp {
  font-size: 0.75rem;
}

/* Loot Disposition Table Styles */
.loot-disposition-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
}

.loot-disposition-card .card__header {
  display: block;
}

.loot-disposition-card .card__header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #f1f5f9;
}

.loot-disposition-card .card__header .muted {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #94a3b8;
}

.loot-disposition-table-wrapper {
  overflow-x: auto;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
}

.loot-disposition-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  table-layout: fixed;
  min-width: 500px;
}

/* Fixed column widths */
.loot-disposition-table th:nth-child(1),
.loot-disposition-table td:nth-child(1) {
  width: 90px;
}

.loot-disposition-table th:nth-child(2),
.loot-disposition-table td:nth-child(2) {
  width: 125px;
}

.loot-disposition-table th:nth-child(3),
.loot-disposition-table td:nth-child(3) {
  width: auto;
}

.loot-disposition-table th:nth-child(4),
.loot-disposition-table td:nth-child(4) {
  width: 140px;
}

.loot-disposition-table th,
.loot-disposition-table td {
  padding: 0.75rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid rgba(100, 116, 139, 0.15);
  vertical-align: middle;
}

.loot-disposition-table th {
  font-weight: 600;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(30, 41, 59, 0.6);
  position: sticky;
  top: 0;
  z-index: 1;
}

.loot-disposition-table th:first-child {
  border-radius: 6px 0 0 0;
}

.loot-disposition-table th:last-child {
  border-radius: 0 6px 0 0;
}

.loot-disposition-table tbody tr {
  transition: background-color 0.15s ease;
}

.loot-disposition-table tbody tr:hover {
  background: rgba(100, 116, 139, 0.12);
}

.loot-disposition-table tbody tr:last-child td {
  border-bottom: none;
}

.loot-disposition-table__time {
  white-space: nowrap;
  color: #94a3b8;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 0.8rem;
  letter-spacing: -0.01em;
}

.loot-disposition-table__action {
  white-space: nowrap;
}

.loot-disposition-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: rgba(100, 116, 139, 0.3);
  color: #e2e8f0;
  min-width: 95px;
  text-align: center;
}

.loot-disposition-badge--council {
  background: rgba(168, 85, 247, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.loot-disposition-badge--random {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.loot-disposition-badge--assigned {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.loot-disposition-badge--taken {
  background: rgba(20, 184, 166, 0.2);
  color: #5eead4;
  border: 1px solid rgba(20, 184, 166, 0.3);
}

.loot-disposition-badge--banked {
  background: rgba(234, 179, 8, 0.2);
  color: #fde047;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.loot-disposition-badge--abandoned {
  background: rgba(249, 115, 22, 0.2);
  color: #fdba74;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

.loot-disposition-badge--discarded {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.loot-disposition-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  min-width: 0;
}

.loot-disposition-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 4px;
  border: 1px solid rgba(100, 116, 139, 0.25);
}

.loot-disposition-item__icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 2px;
}

.loot-disposition-item__name {
  color: #cbd5e1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loot-disposition-item:hover .loot-disposition-item__name {
  color: #60a5fa;
}

.loot-disposition-table__recipient {
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loot-disposition-search {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.loot-disposition-search__input {
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.8);
  color: #e2e8f0;
  width: 100%;
  max-width: 320px;
  transition: all 0.2s ease;
}

.loot-disposition-no-results {
  text-align: center;
}

.loot-disposition-search__input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
  background: rgba(30, 41, 59, 1);
}

.loot-disposition-search__input::placeholder {
  color: #64748b;
}

.loot-disposition-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 0 0.25rem;
  border-top: 1px solid rgba(51, 65, 85, 0.6);
  margin-top: 0.75rem;
}

.loot-disposition-pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: #e2e8f0;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 90px;
}

.loot-disposition-pagination__btn:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.6);
  border-color: rgba(148, 163, 184, 0.4);
  color: #f1f5f9;
}

.loot-disposition-pagination__btn:active:not(:disabled) {
  background: rgba(71, 85, 105, 0.8);
  transform: translateY(1px);
}

.loot-disposition-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loot-disposition-pagination__btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
}

.loot-disposition-pagination__info {
  font-size: 0.8rem;
  color: #94a3b8;
  min-width: 100px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Responsive styles for small screens */
@media (max-width: 768px) {
  .loot-disposition-card {
    padding: 1rem;
    border-radius: 0.75rem;
  }

  .loot-disposition-search__input {
    max-width: none;
  }

  .loot-disposition-table {
    font-size: 0.8rem;
    min-width: 450px;
  }

  .loot-disposition-table th:nth-child(1),
  .loot-disposition-table td:nth-child(1) {
    width: 75px;
  }

  .loot-disposition-table th:nth-child(2),
  .loot-disposition-table td:nth-child(2) {
    width: 105px;
  }

  .loot-disposition-table th:nth-child(4),
  .loot-disposition-table td:nth-child(4) {
    width: 100px;
  }

  .loot-disposition-table th,
  .loot-disposition-table td {
    padding: 0.625rem 0.5rem;
  }

  .loot-disposition-badge {
    font-size: 0.65rem;
    padding: 0.2rem 0.4rem;
    min-width: 85px;
  }

  .loot-disposition-item__icon {
    width: 24px;
    height: 24px;
  }

  .loot-disposition-item__icon img {
    width: 18px;
    height: 18px;
  }

  .loot-disposition-pagination {
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .loot-disposition-pagination__btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    min-width: 80px;
  }

  .loot-disposition-pagination__info {
    font-size: 0.75rem;
    order: -1;
    width: 100%;
    margin-bottom: 0.25rem;
  }
}

@media (max-width: 480px) {
  .loot-disposition-card {
    padding: 0.75rem;
  }

  .loot-disposition-card .card__header h2 {
    font-size: 1.1rem;
  }

  .loot-disposition-table {
    min-width: 400px;
  }

  .loot-disposition-table th:nth-child(1),
  .loot-disposition-table td:nth-child(1) {
    width: 65px;
  }

  .loot-disposition-table th:nth-child(2),
  .loot-disposition-table td:nth-child(2) {
    width: 95px;
  }

  .loot-disposition-table th:nth-child(4),
  .loot-disposition-table td:nth-child(4) {
    width: 85px;
  }

  .loot-disposition-table__time {
    font-size: 0.7rem;
  }

  .loot-disposition-badge {
    font-size: 0.6rem;
    min-width: 75px;
  }
}

/* Instance/Zone Clarification Modal */
.instance-clarification-modal,
.zone-clarification-modal {
  max-width: 32rem;
  max-height: 80vh;
}

.instance-clarification-modal .modal__body,
.zone-clarification-modal .modal__body {
  overflow-y: auto;
  max-height: 50vh;
}

.clarification-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.clarification-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e293b;
  padding: 0.75rem;
  border-radius: 0.375rem;
  gap: 1rem;
}

.clarification-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.clarification-info strong {
  color: #f1f5f9;
  font-size: 0.9rem;
}

.clarification-info .kill-time {
  color: #94a3b8;
  font-size: 0.75rem;
}

.clarification-info .kill-by {
  color: #64748b;
  font-size: 0.75rem;
}

.clarification-toggle {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.toggle-option {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: #e2e8f0;
}

.toggle-option input {
  cursor: pointer;
}

.zone-select {
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: #0f172a;
  border: 1px solid #334155;
  color: #e2e8f0;
  font-size: 0.85rem;
  min-width: 150px;
}

.zone-select:focus {
  outline: none;
  border-color: #3b82f6;
}

</style>
