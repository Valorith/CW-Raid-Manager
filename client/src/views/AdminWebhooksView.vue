<template>
  <section class="webhook-admin">
    <header class="section-header">
      <div class="section-header__titles">
        <h1>Webhook Inbox</h1>
        <p class="muted">Register inbound webhooks, map actions, and review payload history.</p>
      </div>
      <div class="section-header__actions">
        <button class="btn btn--outline" type="button" :disabled="loading" @click="refreshAll">
          Refresh
        </button>
      </div>
    </header>

    <div class="webhook-stats">
      <div class="stat-card">
        <span class="stat-card__label">Total Webhooks</span>
        <strong class="stat-card__value">{{ webhooks.length }}</strong>
      </div>
      <div class="stat-card stat-card--accent">
        <span class="stat-card__label">Inbox Messages</span>
        <strong class="stat-card__value">{{ inboxTotal }}</strong>
      </div>
      <div class="stat-card stat-card--danger">
        <span class="stat-card__label">Failures</span>
        <strong class="stat-card__value">{{ failedCount }}</strong>
      </div>
    </div>

    <div class="tabs">
      <button
        type="button"
        :class="['tab', { 'tab--active': activeTab === 'inbox' }]"
        @click="activeTab = 'inbox'"
      >
        Inbox
        <span v-if="unreadCount > 0" class="tab__badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      </button>
      <button
        type="button"
        :class="['tab', { 'tab--active': activeTab === 'endpoints' }]"
        @click="activeTab = 'endpoints'"
      >
        Endpoints
      </button>
    </div>

    <section v-if="activeTab === 'endpoints'" class="endpoints">
      <article class="card">
        <header class="card__header">
          <div>
            <h2>Endpoints</h2>
            <p class="muted small">Select a webhook to manage details and actions.</p>
          </div>
          <div class="card__header-actions">
            <button
              class="btn btn--accent btn--small"
              type="button"
              @click="showCreateWebhook = !showCreateWebhook"
            >
              {{ showCreateWebhook ? 'Hide Create' : 'Create Webhook' }}
            </button>
          </div>
        </header>
        <div class="endpoint-list">
          <button
            v-for="hook in webhooks"
            :key="hook.id"
            type="button"
            :class="['endpoint-item', { 'endpoint-item--active': hook.id === expandedWebhookId }]"
            @click="toggleWebhook(hook.id)"
          >
            <div class="endpoint-item__title">
              <strong>{{ hook.label }}</strong>
              <span class="badge" :class="hook.isEnabled ? 'badge--positive' : 'badge--neutral'">
                {{ hook.isEnabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
            <span class="muted small">{{ hook.description || 'No description' }}</span>
            <span class="endpoint-item__chevron" aria-hidden="true">
              {{ hook.id === expandedWebhookId ? 'Collapse' : 'Expand' }}
            </span>
          </button>
        </div>
        <div v-if="webhooks.length === 0" class="muted">No webhooks registered yet.</div>
        <div v-else-if="!expandedWebhookId" class="muted small">
          Select an endpoint to view details and actions.
        </div>
      </article>

      <article v-if="showCreateWebhook" class="card card--panel">
        <header class="card__header">
          <div>
            <h2>Create Webhook</h2>
            <p class="muted small">Generate a new inbound webhook URL and configure retention.</p>
          </div>
        </header>
        <div class="form-grid">
          <label class="form-field">
            <span>Label</span>
            <input v-model="createForm.label" class="input" maxlength="120" placeholder="Crash Reports" />
          </label>
          <label class="form-field">
            <span>Description</span>
            <input v-model="createForm.description" class="input" maxlength="500" placeholder="Optional notes" />
          </label>
          <label class="form-field form-field--inline">
            <span>Enabled</span>
            <input v-model="createForm.isEnabled" type="checkbox" />
          </label>
          <label class="form-field">
            <span>Retention Mode</span>
            <select v-model="createForm.retentionMode" class="select">
              <option value="indefinite">Indefinite</option>
              <option value="days">Days</option>
              <option value="maxCount">Max Count</option>
            </select>
          </label>
          <label v-if="createForm.retentionMode === 'days'" class="form-field">
            <span>Days to Keep</span>
            <input v-model.number="createForm.retentionDays" type="number" min="1" class="input" />
          </label>
          <label v-if="createForm.retentionMode === 'maxCount'" class="form-field">
            <span>Max Messages</span>
            <input v-model.number="createForm.retentionMaxCount" type="number" min="1" class="input" />
          </label>
        </div>
        <div class="card__actions">
          <button
            class="btn btn--accent"
            type="button"
            :disabled="creatingWebhook || !createForm.label.trim()"
            @click="createWebhook"
          >
            {{ creatingWebhook ? 'Creating...' : 'Create Webhook' }}
          </button>
        </div>
      </article>

      <article v-if="selectedWebhook" class="card webhook-card">
        <header class="card__header card__header--stack">
          <div>
            <h3>{{ selectedWebhook.label }}</h3>
            <p class="muted small">{{ selectedWebhook.description || 'No description' }}</p>
          </div>
          <div class="card__header-actions">
            <button
              class="btn btn--outline btn--small"
              type="button"
              @click="copyUrl(selectedWebhook)"
            >
              Copy URL
            </button>
            <button
              class="btn btn--danger btn--small"
              type="button"
              @click="deleteWebhook(selectedWebhook)"
            >
              Delete
            </button>
          </div>
        </header>

        <div class="endpoint-details">
          <div class="endpoint-details__column">
            <section class="detail-panel">
              <header class="panel-header">
                <h4>Overview</h4>
                <button
                  class="btn btn--outline btn--small"
                  type="button"
                  :disabled="savingWebhookId === selectedWebhook.id"
                  @click="saveWebhook(selectedWebhook)"
                >
                  {{ savingWebhookId === selectedWebhook.id ? 'Saving...' : 'Save Changes' }}
                </button>
              </header>
              <div class="webhook-meta">
                <div>
                  <span class="label">Webhook ID</span>
                  <strong>{{ selectedWebhook.id }}</strong>
                </div>
                <div>
                  <span class="label">Last Received</span>
                  <strong>{{ formatDate(selectedWebhook.lastReceivedAt) }}</strong>
                </div>
                <div class="toggle">
                  <span class="label">Enabled</span>
                  <input v-model="webhookDrafts[selectedWebhook.id].isEnabled" type="checkbox" />
                </div>
              </div>

              <div class="form-grid">
                <label class="form-field">
                  <span>Label</span>
                  <input
                    v-model="webhookDrafts[selectedWebhook.id].label"
                    class="input"
                    maxlength="120"
                  />
                </label>
                <label class="form-field">
                  <span>Description</span>
                  <input
                    v-model="webhookDrafts[selectedWebhook.id].description"
                    class="input"
                    maxlength="500"
                  />
                </label>
                <label class="form-field">
                  <span>Retention Mode</span>
                  <select v-model="webhookDrafts[selectedWebhook.id].retentionMode" class="select">
                    <option value="indefinite">Indefinite</option>
                    <option value="days">Days</option>
                    <option value="maxCount">Max Count</option>
                  </select>
                </label>
                <label
                  v-if="webhookDrafts[selectedWebhook.id].retentionMode === 'days'"
                  class="form-field"
                >
                  <span>Days to Keep</span>
                  <input
                    v-model.number="webhookDrafts[selectedWebhook.id].retentionDays"
                    type="number"
                    min="1"
                    class="input"
                  />
                </label>
                <label
                  v-if="webhookDrafts[selectedWebhook.id].retentionMode === 'maxCount'"
                  class="form-field"
                >
                  <span>Max Messages</span>
                  <input
                    v-model.number="webhookDrafts[selectedWebhook.id].retentionMaxCount"
                    type="number"
                    min="1"
                    class="input"
                  />
                </label>
              </div>
            </section>

            <section class="detail-panel">
              <header class="panel-header">
                <h4>Webhook URL</h4>
                <button class="btn btn--outline btn--small" type="button" @click="copyUrl(selectedWebhook)">
                  Copy URL
                </button>
              </header>
              <div class="url-row">
                <input class="input url-input" :value="getWebhookUrl(selectedWebhook)" readonly />
              </div>
            </section>

            <section class="detail-panel">
              <header class="panel-header">
                <div class="panel-title">
                  <h4>Test Payload</h4>
                </div>
                <div class="panel-badges">
                  <button
                    class="btn btn--outline btn--small"
                    type="button"
                    @click="showTestPanel = !showTestPanel"
                  >
                    {{ showTestPanel ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </header>
              <div v-if="showTestPanel" class="detail-panel__content">
                <div class="test-options">
                  <label class="form-field form-field--inline form-field--tight">
                    <span>Run Actions</span>
                    <input v-model="testDrafts[selectedWebhook.id].runActions" type="checkbox" />
                  </label>
                  <label class="form-field form-field--inline form-field--tight">
                    <span>Repeat</span>
                    <input
                      v-model.number="testDrafts[selectedWebhook.id].repeatCount"
                      type="number"
                      min="1"
                      max="10"
                      class="input input--tiny"
                    />
                    <span class="input-suffix">times</span>
                  </label>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span>Payload (JSON or plain text)</span>
                    <textarea
                      v-model="testDrafts[selectedWebhook.id].payload"
                      class="textarea"
                      rows="5"
                    ></textarea>
                  </label>
                </div>
                <button
                  class="btn btn--outline btn--small"
                  type="button"
                  :disabled="sendingTestId === selectedWebhook.id"
                  @click="sendTest(selectedWebhook)"
                >
                  {{ sendingTestId === selectedWebhook.id ? 'Sending...' : 'Send Test' }}
                </button>
              </div>
            </section>
          </div>

          <div class="endpoint-details__column">
            <section class="detail-panel">
              <header class="panel-header">
                <h4>Actions</h4>
                <span class="muted small">{{ selectedWebhook.actions?.length || 0 }} configured</span>
              </header>

              <div v-if="(selectedWebhook.actions?.length || 0) === 0" class="muted small">
                No actions configured yet.
              </div>

              <div v-for="action in selectedWebhook.actions" :key="action.id" class="action-row">
                <div class="action-row__header">
                  <strong>{{ action.type.replace('_', ' ') }}</strong>
                  <label class="toggle">
                    <span class="label">Enabled</span>
                    <input v-model="action.isEnabled" type="checkbox" />
                  </label>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span>Name</span>
                    <input v-model="action.name" class="input" maxlength="120" />
                  </label>
                  <label v-if="action.type === 'DISCORD_RELAY'" class="form-field">
                    <span>Discord Webhook URL</span>
                    <input
                      v-model="action.config.discordWebhookUrl"
                      class="input"
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                  </label>
                  <label v-if="action.type === 'DISCORD_RELAY'" class="form-field">
                    <span>Relay Mode</span>
                    <select v-model="action.config.discordMode" class="select">
                      <option value="WRAP">Wrap payload</option>
                      <option value="RAW">Send raw</option>
                    </select>
                  </label>
                <label
                  v-if="action.type === 'DISCORD_RELAY' && action.config.discordMode !== 'RAW'"
                  class="form-field"
                >
                  <span>Wrap Template</span>
                  <textarea
                    v-model="action.config.discordTemplate"
                    class="textarea"
                    rows="4"
                    placeholder="Use {{json}} for pretty JSON or {{raw}} for full JSON"
                  ></textarea>
                </label>
                <label v-if="action.type === 'CRASH_REVIEW'" class="form-field">
                  <span>Model</span>
                  <select v-model="action.config.crashModel" class="select">
                    <option v-for="model in crashModelOptions" :key="model" :value="model">
                      {{ model }}
                    </option>
                  </select>
                </label>
                <label v-if="action.type === 'CRASH_REVIEW'" class="form-field">
                  <span>Max Input Chars</span>
                  <input v-model.number="action.config.crashMaxInputChars" type="number" min="1000" class="input" />
                </label>
                <label v-if="action.type === 'CRASH_REVIEW'" class="form-field">
                  <span>Max Output Tokens</span>
                  <input v-model.number="action.config.crashMaxOutputTokens" type="number" min="256" class="input" />
                </label>
                <label v-if="action.type === 'CRASH_REVIEW'" class="form-field">
                  <span>Temperature</span>
                  <input v-model.number="action.config.crashTemperature" type="number" min="0" max="1" step="0.05" class="input" />
                </label>
                <label v-if="action.type === 'CRASH_REVIEW'" class="form-field">
                  <span>Prompt Template</span>
                  <textarea
                    v-model="action.config.crashPromptTemplate"
                    class="textarea"
                    rows="4"
                    placeholder="Use {{crashReport}} to insert the crash text"
                  ></textarea>
                </label>
              </div>
                <div class="action-row__actions">
                  <button
                    class="btn btn--outline btn--small"
                    type="button"
                    :disabled="savingActionId === action.id"
                    @click="saveAction(selectedWebhook, action)"
                  >
                    {{ savingActionId === action.id ? 'Saving...' : 'Save Action' }}
                  </button>
                  <button
                    class="btn btn--danger btn--small"
                    type="button"
                    :disabled="savingActionId === action.id"
                    @click="deleteAction(selectedWebhook, action)"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </section>

            <section class="detail-panel">
              <header class="panel-header">
                <h4>Add Action</h4>
              </header>
              <div class="form-grid">
                <label class="form-field">
                  <span>Action Type</span>
                  <select v-model="actionDrafts[selectedWebhook.id].type" class="select">
                    <option value="DISCORD_RELAY">Discord Relay</option>
                    <option value="CRASH_REVIEW">Crash Review</option>
                  </select>
                </label>
                <label class="form-field">
                  <span>Name</span>
                  <input
                    v-model="actionDrafts[selectedWebhook.id].name"
                    class="input"
                    maxlength="120"
                  />
                </label>
                <label class="form-field form-field--inline">
                  <span>Enabled</span>
                  <input v-model="actionDrafts[selectedWebhook.id].isEnabled" type="checkbox" />
                </label>
                <label
                  v-if="actionDrafts[selectedWebhook.id].type === 'DISCORD_RELAY'"
                  class="form-field"
                >
                  <span>Discord Webhook URL</span>
                  <input
                    v-model="actionDrafts[selectedWebhook.id].discordWebhookUrl"
                    class="input"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </label>
                <label
                  v-if="actionDrafts[selectedWebhook.id].type === 'DISCORD_RELAY'"
                  class="form-field"
                >
                  <span>Relay Mode</span>
                  <select v-model="actionDrafts[selectedWebhook.id].discordMode" class="select">
                    <option value="WRAP">Wrap payload</option>
                    <option value="RAW">Send raw</option>
                  </select>
                </label>
                <label
                  v-if="
                    actionDrafts[selectedWebhook.id].type === 'DISCORD_RELAY' &&
                    actionDrafts[selectedWebhook.id].discordMode !== 'RAW'
                  "
                  class="form-field"
                >
                  <span>Wrap Template</span>
                  <textarea
                    v-model="actionDrafts[selectedWebhook.id].discordTemplate"
                    class="textarea"
                    rows="4"
                    placeholder="Use {{json}} for pretty JSON or {{raw}} for full JSON"
                  ></textarea>
                </label>
                <label v-if="actionDrafts[selectedWebhook.id].type === 'CRASH_REVIEW'" class="form-field">
                  <span>Model</span>
                  <select v-model="actionDrafts[selectedWebhook.id].crashModel" class="select">
                    <option v-for="model in crashModelOptions" :key="model" :value="model">
                      {{ model }}
                    </option>
                  </select>
                </label>
                <label v-if="actionDrafts[selectedWebhook.id].type === 'CRASH_REVIEW'" class="form-field">
                  <span>Max Input Chars</span>
                  <input v-model.number="actionDrafts[selectedWebhook.id].crashMaxInputChars" type="number" min="1000" class="input" />
                </label>
                <label v-if="actionDrafts[selectedWebhook.id].type === 'CRASH_REVIEW'" class="form-field">
                  <span>Max Output Tokens</span>
                  <input v-model.number="actionDrafts[selectedWebhook.id].crashMaxOutputTokens" type="number" min="256" class="input" />
                </label>
                <label v-if="actionDrafts[selectedWebhook.id].type === 'CRASH_REVIEW'" class="form-field">
                  <span>Temperature</span>
                  <input v-model.number="actionDrafts[selectedWebhook.id].crashTemperature" type="number" min="0" max="1" step="0.05" class="input" />
                </label>
                <label v-if="actionDrafts[selectedWebhook.id].type === 'CRASH_REVIEW'" class="form-field">
                  <span>Prompt Template</span>
                  <textarea
                    v-model="actionDrafts[selectedWebhook.id].crashPromptTemplate"
                    class="textarea"
                    rows="4"
                    placeholder="Use {{crashReport}} to insert the crash text"
                  ></textarea>
                </label>
              </div>
              <button
                class="btn btn--accent btn--small"
                type="button"
                :disabled="
                  creatingActionId === selectedWebhook.id ||
                  !actionDrafts[selectedWebhook.id].name.trim()
                "
                @click="createAction(selectedWebhook)"
              >
                {{ creatingActionId === selectedWebhook.id ? 'Adding...' : 'Add Action' }}
              </button>
            </section>
          </div>
        </div>
      </article>
    </section>

    <section v-if="activeTab === 'inbox'" class="inbox">
      <article class="card">
        <header class="card__header">
          <div>
            <div class="inbox-title-row">
              <h2>Webhook Inbox</h2>
              <span v-if="isAutoMergeActive" class="auto-merge-badge">
                Auto-Merge Active
              </span>
              <span v-if="processingStatus.hasPendingProcessing" class="processing-badge">
                Processing...
              </span>
            </div>
            <p class="muted small">Review inbound webhook payloads and action results.</p>
          </div>
        </header>
        <div class="inbox-filters">
          <div class="inbox-filters__row">
            <label class="form-field form-field--compact">
              <span>Webhook</span>
              <select v-model="inboxFilters.webhookId" class="select">
                <option value="">All Webhooks</option>
                <option v-for="hook in webhooks" :key="hook.id" :value="hook.id">
                  {{ hook.label }}
                </option>
              </select>
            </label>
            <label class="form-field form-field--compact">
              <span>Status</span>
              <select v-model="inboxFilters.status" class="select">
                <option value="">All Statuses</option>
                <option value="RECEIVED">Received</option>
                <option value="PENDING_MERGE">Pending Merge</option>
                <option value="PROCESSED">Processed</option>
                <option value="FAILED">Failed</option>
              </select>
            </label>
            <label class="form-field form-field--compact">
              <span>Read Status</span>
              <select v-model="inboxFilters.readStatus" class="select">
                <option value="">All</option>
                <option value="unread">Unread Only</option>
                <option value="read">Read Only</option>
              </select>
            </label>
            <label class="form-field form-field--compact">
              <span>Label</span>
              <select v-model="inboxFilters.labelId" class="select">
                <option value="">All Labels</option>
                <option v-for="label in webhookLabels" :key="label.id" :value="label.id">
                  {{ label.name }}
                </option>
              </select>
            </label>
          </div>
          <div class="inbox-filters__row inbox-filters__row--secondary">
            <label class="form-field form-field--compact">
              <span>Page Size</span>
              <select v-model.number="inboxFilters.pageSize" class="select select--small">
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
              </select>
            </label>
            <div class="inbox-filters__toggles">
              <label class="filter-toggle">
                <input v-model="inboxFilters.starred" type="checkbox" />
                <span>Starred Only</span>
              </label>
              <label class="filter-toggle">
                <input v-model="inboxFilters.includeArchived" type="checkbox" />
                <span>See Archived</span>
              </label>
            </div>
          </div>
        </div>
        <div class="card__actions">
          <button class="btn btn--outline btn--small" type="button" @click="openWebhookSettings">
            Webhook Settings
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="showLabelManager = true">
            Manage Labels
          </button>
        </div>
      </article>

      <article class="card" v-if="inboxLoading">
        <p class="muted">Loading inbox...</p>
      </article>
      <article class="card" v-else-if="inboxMessages.length === 0">
        <p class="muted">No inbound webhook messages yet.</p>
      </article>
      <template v-else>
        <!-- Bulk Actions Toolbar -->
        <div v-if="selectedMessageIds.size > 0" class="bulk-actions-bar">
        <span class="bulk-actions-bar__count">{{ selectedMessageIds.size }} selected</span>
        <div class="bulk-actions-bar__actions">
          <button class="btn btn--outline btn--small" type="button" @click="clearSelection" :disabled="bulkActionInProgress">
            Clear
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkMarkRead" :disabled="bulkActionInProgress">
            Mark Read
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkMarkUnread" :disabled="bulkActionInProgress">
            Mark Unread
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkStar(true)" :disabled="bulkActionInProgress">
            Star
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkStar(false)" :disabled="bulkActionInProgress">
            Unstar
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkArchive" :disabled="bulkActionInProgress">
            Archive
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="openMergeModal" :disabled="bulkActionInProgress || selectedMessageIds.size < 2">
            Combine
          </button>
          <button class="btn btn--outline btn--small" type="button" @click="bulkRerunCrashReview" :disabled="bulkActionInProgress">
            Re-run AI
          </button>
          <button class="btn btn--danger btn--small" type="button" @click="bulkDelete" :disabled="bulkActionInProgress">
            Delete
          </button>
        </div>
      </div>

      <article class="card card--table">
        <table class="table">
          <thead>
            <tr>
              <th class="table__checkbox-col">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  @change="selectAllMessages"
                  title="Select all"
                />
              </th>
              <th class="table__star-col"></th>
              <th>Received</th>
              <th>Webhook</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Labels</th>
              <th>Assigned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <!-- Pending Merge Group Placeholders -->
            <tr
              v-for="group in pendingMergeGroups"
              :key="group.compositeKey"
              class="pending-group-row"
            >
              <td class="table__checkbox-col"></td>
              <td class="table__star-col"></td>
              <td colspan="6">
                <div class="pending-group-placeholder">
                  <div class="pending-group-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12,6 12,12 16,14" />
                    </svg>
                  </div>
                  <div class="pending-group-info">
                    <div class="pending-group-title">
                      <span class="pending-group-count">{{ group.messageCount }} messages</span>
                      <span class="pending-group-key">{{ group.groupKey !== 'default' ? group.groupKey : 'pending auto-merge' }}</span>
                    </div>
                    <div class="pending-group-timer">
                      Processing in <strong>{{ group.remainingSeconds }}s</strong>
                    </div>
                  </div>
                  <div class="pending-group-actions">
                    <button
                      class="btn btn--small btn--accent"
                      type="button"
                      :disabled="processingGroupKey === group.compositeKey"
                      @click="processGroupNow(group.webhookId, group.groupKey)"
                    >
                      {{ processingGroupKey === group.compositeKey ? 'Processing...' : 'Process Now' }}
                    </button>
                  </div>
                </div>
              </td>
              <td></td>
            </tr>

            <template v-for="message in filteredInboxMessages" :key="message.id">
              <!-- Regular message row (excludes messages in pending groups) -->
              <tr
                :class="{
                  'inbox-row--unread': !message.isRead,
                  'inbox-row--archived': message.archivedAt,
                  'merge-group-row': getMessageMergeGroup(message.id),
                  'merge-group-row--first': isFirstInMergeGroupDisplay(message.id),
                  'merge-group-row--last': isLastInMergeGroupDisplay(message.id)
                }"
              >
              <td class="table__checkbox-col" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedMessageIds.has(message.id)"
                  @change="toggleMessageSelection(message.id)"
                />
              </td>
              <td class="table__star-col" @click.stop>
                <button
                  class="star-button"
                  :class="{ 'star-button--active': message.isStarred }"
                  type="button"
                  @click="toggleStar(message)"
                  :title="message.isStarred ? 'Unstar' : 'Star'"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      :fill="message.isStarred ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                  </svg>
                </button>
              </td>
              <td>
                <span :class="{ 'text-bold': !message.isRead }">{{ formatDate(message.receivedAt) }}</span>
                <span v-if="message.mergedFromIds" class="badge badge--info" title="Combined message">
                  {{ message.mergedFromIds.length }} merged
                </span>
              </td>
              <td>{{ message.webhook?.label || message.webhookId }}</td>
              <td>
                <div class="status-cell">
                  <span :class="['badge', statusBadge(message.status)]">{{ message.status }}</span>
                  <span v-if="getPendingRun(message)" class="pending-indicator">
                    <span class="spinner"></span>
                    Under AI Review {{ formatDuration(getPendingDuration(message)) }}
                  </span>
                </div>
              </td>
              <td class="actions-cell">
                <div v-if="message.actionRuns?.length || message.webhook?.actions?.length" class="action-pills">
                  <!-- Show only the latest run of each action type -->
                  <template v-for="run in getLatestRunsByType(message)" :key="run.id">
                    <span
                      v-if="run.status === 'PENDING_REVIEW'"
                      class="action-pill-wrapper"
                      :title="`${run.action?.type || 'Action'}: In Progress`"
                    >
                      <svg class="action-pill-border" viewBox="0 0 100 28" preserveAspectRatio="none">
                        <rect x="1" y="1" width="98" height="26" rx="13" ry="13" />
                      </svg>
                      <span class="action-pill action-pill--pending">
                        {{ getActionLabel(run.action?.type) }}
                      </span>
                    </span>
                    <span
                      v-else
                      class="action-pill"
                      :class="getActionPillClass(run.status)"
                      :title="`${run.action?.type || 'Action'}: ${run.status}`"
                    >
                      {{ getActionLabel(run.action?.type) }}
                    </span>
                  </template>
                  <!-- Show actions that haven't started yet (not in actionRuns) -->
                  <span
                    v-for="action in getNotStartedActions(message)"
                    :key="'notstarted-' + action.id"
                    class="action-pill action-pill--not-run"
                    :title="`${action.type}: Not run`"
                  >
                    {{ getActionLabel(action.type) }}
                  </span>
                </div>
                <span v-else class="muted">-</span>
                <p v-if="getCrashSummary(message)" class="crash-summary-text">
                  {{ getCrashSummary(message) }}
                </p>
              </td>
              <td class="labels-cell" @click.stop>
                <div class="label-chips">
                  <span
                    v-for="label in sortedLabels(message.labels)"
                    :key="label.id"
                    class="label-chip"
                    :style="getLabelStyle(label.color)"
                    :title="label.name"
                  >
                    {{ label.name }}
                    <button
                      class="label-chip__remove"
                      type="button"
                      @click.stop="removeLabel(message, label.id)"
                      aria-label="Remove label"
                    >×</button>
                  </span>
                  <div class="label-add-wrapper">
                    <button
                      v-if="labelInputMessageId !== message.id"
                      class="label-add-btn"
                      type="button"
                      @click.stop="showLabelInput(message.id)"
                      title="Add label"
                    >+</button>
                    <input
                      v-else
                      :ref="(el) => el && (el as HTMLInputElement).focus()"
                      v-model="labelInputValue"
                      class="label-input"
                      type="text"
                      placeholder="Label name..."
                      @keydown.enter.stop="submitLabelInput(message)"
                      @keydown.escape.stop="closeLabelInput"
                      @blur="closeLabelInput"
                      @click.stop
                    />
                  </div>
                </div>
              </td>
              <td>
                <select
                  v-model="message.assignedAdminId"
                  class="select select--compact"
                  @change.stop="updateAssignment(message)"
                  @click.stop
                >
                  <option value="">Unassigned</option>
                  <option v-for="user in adminAssignableUsers" :key="user.id" :value="user.id">
                    {{ formatAdminName(user) }}
                  </option>
                </select>
              </td>
              <td class="table__actions">
                <div class="table-action-group">
                  <button class="btn btn--outline btn--small" type="button" @click="openMessage(message)">
                    View
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    :title="message.archivedAt ? 'Restore' : 'Archive'"
                    @click="toggleArchive(message)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 4h18v4H3V4zm2 6h14v10H5V10zm4 2v2h6v-2H9z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-button icon-button--danger"
                    type="button"
                    title="Delete"
                    @click="deleteMessage(message)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>

              <!-- Merge group footer (after last message in group) -->
              <tr v-if="isLastInMergeGroupDisplay(message.id)" class="merge-group-footer">
                <td colspan="9">
                  <div class="merge-group-banner">
                    <span class="merge-group-icon">🔗</span>
                    <span class="merge-group-text">
                      {{ getMessageMergeGroup(message.id)?.messages.length }} related messages detected
                      <span class="muted">(within {{ getMessageMergeGroup(message.id)?.timeWindow }}s)</span>
                    </span>
                    <button
                      class="btn btn--small btn--accent"
                      type="button"
                      @click="startMergeFromGroup(getMessageMergeGroup(message.id)!)"
                    >
                      Merge these
                    </button>
                    <button
                      class="btn btn--small btn--ghost"
                      type="button"
                      @click="dismissMergeGroup(getMessageMergeGroup(message.id)!.id)"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div class="pagination" v-if="inboxTotalPages > 1">
          <div class="pagination__meta">
            Showing {{ inboxRangeStart }}–{{ inboxRangeEnd }} of {{ inboxTotal }}
          </div>
          <div class="pagination__controls">
            <button
              class="pagination__button"
              :disabled="inboxFilters.page === 1"
              @click="setInboxPage(1)"
            >
              First
            </button>
            <button
              class="pagination__button"
              :disabled="inboxFilters.page === 1"
              @click="setInboxPage(inboxFilters.page - 1)"
            >
              Previous
            </button>
            <template v-for="(item, index) in inboxPageButtons" :key="`page-${item}-${index}`">
              <button
                v-if="typeof item === 'number'"
                class="pagination__button"
                :class="{ 'pagination__button--active': item === inboxFilters.page }"
                :disabled="item === inboxFilters.page"
                @click="setInboxPage(item)"
              >
                {{ item }}
              </button>
              <span v-else class="pagination__ellipsis">{{ item }}</span>
            </template>
            <button
              class="pagination__button"
              :disabled="inboxFilters.page === inboxTotalPages"
              @click="setInboxPage(inboxFilters.page + 1)"
            >
              Next
            </button>
            <button
              class="pagination__button"
              :disabled="inboxFilters.page === inboxTotalPages"
              @click="setInboxPage(inboxTotalPages)"
            >
              Last
            </button>
          </div>
        </div>
      </article>
      </template>
    </section>

    <!-- Message View Modal (outside tab sections) -->
    <div v-if="selectedMessage" class="modal-backdrop" @click.self="closeMessage">
      <div class="modal modal--wide" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div class="modal__titles">
            <h3>Webhook Payload</h3>
            <p class="muted small">{{ selectedMessage.webhook?.label || selectedMessage.webhookId }}</p>
          </div>
          <button class="icon-button" @click="closeMessage" aria-label="Close message">
            ✕
          </button>
        </header>

        <div class="modal__content modal__content--split">
            <section class="payload-block crash-pane">
              <header class="panel-header">
                <h4>Crash Report</h4>
              </header>
              <pre class="crash-report">{{ getCrashReportText(selectedMessage) }}</pre>
              <div class="result-actions">
                <button class="btn btn--outline btn--small" type="button" @click="copyReport">
                  Copy Report
                </button>
                <button
                  class="btn btn--accent btn--small"
                  type="button"
                  @click="openCrashInspector"
                  :disabled="!getCrashReportText(selectedMessage)"
                >
                  <span class="ai-icon" aria-hidden="true">✦</span> Inspect Report
                </button>
              </div>
            </section>

            <section class="payload-block llm-pane">
              <header class="panel-header">
                <div class="panel-title">
                  <span class="ai-icon" aria-hidden="true">✦</span>
                  <h4>AI Review</h4>
                </div>
                <div class="panel-badges">
                  <span class="badge" :class="statusBadge(getCrashRunStatus(selectedMessage))">
                    {{ getCrashRunStatus(selectedMessage) }}
                  </span>
                  <span v-if="getCrashRunModel(selectedMessage)" class="badge badge--neutral">
                    {{ getCrashRunModel(selectedMessage) }}
                  </span>
                </div>
              </header>

              <div v-if="isCrashReviewPending(selectedMessage)" class="llm-loading">
                <span class="spinner spinner--large"></span>
                <p class="muted">
                  Analyzing crash report...
                  <span v-if="getPendingDuration(selectedMessage) > 0">
                    Waiting {{ formatDuration(getPendingDuration(selectedMessage)) }}
                  </span>
                </p>
              </div>

              <div
                v-else-if="getCrashRunStatus(selectedMessage) === 'SUCCESS' && getCrashRunResult(selectedMessage)"
                class="llm-content"
              >
                <p class="llm-summary">{{ getCrashRunResult(selectedMessage)?.summary }}</p>

                <!-- Token usage bar -->
                <div v-if="getCrashRunTokenUsage(selectedMessage)" class="token-usage">
                  <div class="token-usage__header">
                    <span class="token-usage__title">Token Usage</span>
                    <span
                      v-if="getCrashRunTokenUsage(selectedMessage)?.finishReason === 'MAX_TOKENS'"
                      class="token-usage__warning"
                    >
                      Truncated
                    </span>
                  </div>
                  <div class="token-usage__bar-container">
                    <div class="token-usage__bar">
                      <div
                        class="token-usage__segment token-usage__segment--thinking"
                        :style="{
                          width: `${(getCrashRunTokenUsage(selectedMessage)!.thinkingTokens / getCrashRunTokenUsage(selectedMessage)!.maxOutputTokens) * 100}%`
                        }"
                        :title="`Thinking: ${getCrashRunTokenUsage(selectedMessage)!.thinkingTokens.toLocaleString()} tokens`"
                      ></div>
                      <div
                        class="token-usage__segment token-usage__segment--output"
                        :style="{
                          width: `${(getCrashRunTokenUsage(selectedMessage)!.outputTokens / getCrashRunTokenUsage(selectedMessage)!.maxOutputTokens) * 100}%`
                        }"
                        :title="`Output: ${getCrashRunTokenUsage(selectedMessage)!.outputTokens.toLocaleString()} tokens`"
                      ></div>
                    </div>
                  </div>
                  <div class="token-usage__details">
                    <div class="token-usage__stat">
                      <span class="token-usage__dot token-usage__dot--thinking"></span>
                      <span>Thinking: {{ getCrashRunTokenUsage(selectedMessage)!.thinkingTokens.toLocaleString() }}</span>
                    </div>
                    <div class="token-usage__stat">
                      <span class="token-usage__dot token-usage__dot--output"></span>
                      <span>Output: {{ getCrashRunTokenUsage(selectedMessage)!.outputTokens.toLocaleString() }}</span>
                    </div>
                    <div class="token-usage__stat token-usage__stat--budget">
                      <span>Budget: {{ getCrashRunTokenUsage(selectedMessage)!.maxOutputTokens.toLocaleString() }}</span>
                    </div>
                  </div>
                  <div class="token-usage__input-row">
                    <span class="token-usage__input-label">Input (est):</span>
                    <span>~{{ getCrashRunTokenUsage(selectedMessage)!.inputTokens.toLocaleString() }} tokens</span>
                  </div>
                </div>

                <div v-if="getCrashRunResult(selectedMessage)?.hypotheses?.length" class="llm-section">
                  <h5>Possible Causes</h5>
                  <ol class="llm-list">
                    <li v-for="item in getCrashRunResult(selectedMessage)?.hypotheses" :key="item.title">
                      <strong>{{ item.title }}</strong>
                      <span class="muted small">({{ Math.round(item.confidence * 100) }}% confidence)</span>
                      <p>{{ item.evidence }}</p>
                    </li>
                  </ol>
                </div>

                <div v-if="getCrashRunResult(selectedMessage)?.missingInfo?.length" class="llm-section">
                  <h5>Missing Information</h5>
                  <ul class="llm-list">
                    <li v-for="info in getCrashRunResult(selectedMessage)?.missingInfo" :key="info">
                      {{ info }}
                    </li>
                  </ul>
                </div>

                <div v-if="getCrashRunResult(selectedMessage)?.recommendedNextSteps?.length" class="llm-section">
                  <h5>Recommended Next Steps</h5>
                  <ol class="llm-list llm-list--numbered">
                    <li
                      v-for="step in getCrashRunResult(selectedMessage)?.recommendedNextSteps"
                      :key="step"
                    >
                      {{ step }}
                    </li>
                  </ol>
                </div>

                <div class="result-actions">
                  <button
                    class="btn btn--outline btn--small"
                    type="button"
                    @click="copyFindings(getCrashRun(selectedMessage))"
                  >
                    Copy AI Review
                  </button>
                  <button
                    class="btn btn--outline btn--small"
                    type="button"
                    @click="copyFindingsJson(getCrashRun(selectedMessage))"
                  >
                    Copy JSON
                  </button>
                  <button
                    v-if="getCrashRunPrompt(selectedMessage)"
                    class="btn btn--outline btn--small"
                    type="button"
                    @click="showPromptModal = true"
                  >
                    View Prompt
                  </button>
                  <button
                    class="btn btn--outline btn--small"
                    type="button"
                    @click="retryCrashReview(selectedMessage)"
                    :disabled="isCrashReviewPending(selectedMessage)"
                  >
                    <span class="ai-icon" aria-hidden="true">✦</span> Re-run AI Review
                  </button>
                </div>
              </div>

              <div v-else class="llm-empty">
                <p class="muted">No AI review has been run yet.</p>
                <button
                  class="btn btn--accent"
                  type="button"
                  @click="retryCrashReview(selectedMessage)"
                  :disabled="isCrashReviewPending(selectedMessage)"
                >
                  <span class="ai-icon" aria-hidden="true">✦</span> Run AI Review
                </button>
              </div>
            </section>
          </div>

          <!-- Prompt Modal inside Message modal -->
          <div v-if="showPromptModal" class="modal-backdrop" @click.self="showPromptModal = false">
            <div class="modal modal--wide" role="dialog" aria-modal="true">
              <header class="modal__header">
                <div class="modal__titles">
                  <h3>LLM Prompt Payload</h3>
                  <p class="muted small">Sent to Gemini for analysis</p>
                </div>
                <button class="icon-button" @click="showPromptModal = false" aria-label="Close prompt">
                  ✕
                </button>
              </header>
              <div class="modal__content">
                <section class="payload-block">
                  <pre>{{ formatJson(getCrashRunPrompt(selectedMessage)) }}</pre>
                  <div class="result-actions">
                    <button
                      class="btn btn--outline btn--small"
                      type="button"
                      @click="copyPromptJson"
                    >
                      Copy Prompt JSON
                    </button>
                  </div>
                </section>
              </div>
            </div>
        </div>
      </div>
    </div>

    <!-- Merge Modal (outside tab sections) -->
    <div v-if="showMergeModal" class="modal-backdrop" @click.self="closeMergeModal">
      <div class="modal modal--wide" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h3>Combine Messages</h3>
          <div class="modal__header-actions">
            <button
              class="btn btn--outline btn--small btn--ai"
              type="button"
              :disabled="sortingWithAi || mergeOrdering.length < 2"
              @click="sortWithAi"
            >
              <span v-if="sortingWithAi" class="ai-loading-spinner"></span>
              <span v-else class="ai-icon">✦</span>
              {{ sortingWithAi ? 'Sorting...' : 'Sort with AI' }}
            </button>
            <button class="icon-button" @click="closeMergeModal" aria-label="Close">
              ✕
            </button>
          </div>
        </header>
        <div class="modal__body">
          <div v-if="aiSortApplied && aiSortResult" class="ai-sort-banner">
            <span class="ai-icon">✦</span>
            <span>Sorted with AI</span>
            <span class="ai-confidence">({{ Math.round(aiSortResult.confidence * 100) }}% confidence)</span>
            <span v-if="aiSortResult.removeIds?.length" class="ai-removed">
              | Deleted {{ aiSortResult.removeIds.length }} redundant segment{{ aiSortResult.removeIds.length > 1 ? 's' : '' }}
            </span>
            <span v-if="aiSortResult.reasoning" class="ai-reasoning muted small">{{ aiSortResult.reasoning }}</span>
          </div>
          <p class="muted small">Drag to reorder. Messages will be combined in the order shown below.</p>
          <div class="merge-list">
            <div
              v-for="(id, index) in mergeOrdering"
              :key="id"
              class="merge-item"
              :class="{
                'merge-item--dragging': draggedMergeIndex === index,
                'merge-item--drag-over': dragOverMergeIndex === index && draggedMergeIndex !== index
              }"
              draggable="true"
              @dragstart="onMergeDragStart($event, index)"
              @dragover="onMergeDragOver($event, index)"
              @dragleave="onMergeDragLeave"
              @drop="onMergeDrop($event, index)"
              @dragend="onMergeDragEnd"
            >
              <div class="merge-item__handle" title="Drag to reorder">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <circle cx="9" cy="6" r="1.5"/>
                  <circle cx="15" cy="6" r="1.5"/>
                  <circle cx="9" cy="12" r="1.5"/>
                  <circle cx="15" cy="12" r="1.5"/>
                  <circle cx="9" cy="18" r="1.5"/>
                  <circle cx="15" cy="18" r="1.5"/>
                </svg>
              </div>
              <div class="merge-item__content">
                <div class="merge-item__header">
                  <div class="merge-item__info">
                    <strong>Part {{ index + 1 }}</strong>
                    <span class="muted small">{{ formatDate(getMergeMessage(id)?.receivedAt) }}</span>
                    <span class="muted small">{{ getMergeMessage(id)?.webhook?.label || 'Unknown' }}</span>
                  </div>
                  <div class="merge-item__actions">
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="index === 0"
                      @click="moveMergeItem(index, 'up')"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="index === mergeOrdering.length - 1"
                      @click="moveMergeItem(index, 'down')"
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <pre class="merge-item__preview">{{ getMergePreviewText(id) }}</pre>
              </div>
            </div>
          </div>
          <p class="muted small merge-warning">
            This will create a new combined message and delete the {{ mergeOrdering.length }} original messages.
          </p>
        </div>
        <footer class="modal__footer">
          <button class="btn btn--outline" type="button" @click="closeMergeModal">
            Cancel
          </button>
          <button class="btn btn--accent" type="button" @click="openMergePreview">
            Preview Combined Report
          </button>
        </footer>
      </div>
    </div>

    <!-- Merge Preview Modal -->
    <div v-if="showMergePreview" class="modal-backdrop" @click.self="closeMergePreview">
      <div class="modal modal--wide" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h3>Preview Combined Report</h3>
          <div class="modal__header-actions">
            <button class="btn btn--outline btn--small" type="button" @click="copyMergedPreview">
              Copy to Clipboard
            </button>
            <button class="icon-button" @click="closeMergePreview" aria-label="Close">
              ✕
            </button>
          </div>
        </header>
        <div class="modal__body merge-preview-body">
          <p class="muted small">Review the combined crash report below. The {{ mergeOrdering.length }} messages will be merged in this order.</p>
          <pre class="merge-preview-content">{{ getMergedPreviewText() }}</pre>
        </div>
        <footer class="modal__footer merge-preview-footer">
          <button class="btn btn--outline" type="button" @click="backToMergeOrder">
            Back
          </button>
          <button class="btn btn--danger" type="button" @click="cancelMergeAll" :disabled="mergingMessages">
            Cancel
          </button>
          <button class="btn btn--success" type="button" @click="confirmMerge" :disabled="mergingMessages">
            {{ mergingMessages ? 'Combining...' : 'Accept & Combine' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Label Manager Modal (outside tab sections) -->
    <div v-if="showLabelManager" class="modal-backdrop" @click.self="showLabelManager = false">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h3>Manage Labels</h3>
          <button class="icon-button" @click="showLabelManager = false" aria-label="Close">
            ✕
          </button>
        </header>
        <div class="modal__body">
          <div class="label-manager">
            <div class="label-manager__list">
              <div v-if="webhookLabels.length === 0" class="muted">No labels yet.</div>
              <div
                v-for="label in webhookLabels"
                :key="label.id"
                class="label-manager__item"
              >
                <template v-if="labelToEdit?.id === label.id">
                  <input
                    v-model="labelToEdit.name"
                    class="input input--small"
                    maxlength="50"
                    @keyup.enter="updateLabel"
                  />
                  <input
                    v-model="labelToEdit.color"
                    type="color"
                    class="color-picker"
                  />
                  <button class="btn btn--small btn--accent" type="button" @click="updateLabel">
                    Save
                  </button>
                  <button class="btn btn--small btn--outline" type="button" @click="labelToEdit = null">
                    Cancel
                  </button>
                </template>
                <template v-else>
                  <span
                    class="label-chip"
                    :style="{ backgroundColor: label.color }"
                  >
                    {{ label.name }}
                  </span>
                  <button class="btn btn--small btn--outline" type="button" @click="labelToEdit = { ...label }">
                    Edit
                  </button>
                  <button class="btn btn--small btn--danger" type="button" @click="deleteLabel(label)">
                    Delete
                  </button>
                </template>
              </div>
            </div>
            <div class="label-manager__create">
              <h4>Create New Label</h4>
              <div class="form-row">
                <input
                  v-model="newLabelForm.name"
                  class="input"
                  placeholder="Label name"
                  maxlength="50"
                  @keyup.enter="createLabel"
                />
                <input
                  v-model="newLabelForm.color"
                  type="color"
                  class="color-picker"
                />
                <button
                  class="btn btn--accent"
                  type="button"
                  :disabled="!newLabelForm.name.trim()"
                  @click="createLabel"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Webhook Settings Modal -->
    <div v-if="showWebhookSettings" class="modal-backdrop" @click.self="showWebhookSettings = false">
      <div class="modal modal--settings" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h3>Webhook Settings</h3>
          <button class="icon-button" @click="showWebhookSettings = false" aria-label="Close">
            ✕
          </button>
        </header>
        <div class="modal__body settings-modal-body">
          <!-- Global Server Processing Toggle -->
          <div class="settings-section settings-section--global">
            <div class="settings-section-header">
              <h4 class="settings-section-title">Server Processing</h4>
              <p class="settings-section-description">
                Control webhook processing for this server instance. Each server (identified by SERVER_ID env var) has its own setting.
              </p>
            </div>
            <div class="settings-fields">
              <!-- Server ID indicator -->
              <div class="settings-server-id">
                <span class="settings-server-id-label">Connected to:</span>
                <span class="settings-server-id-value">{{ webhookProcessingStatus.serverId }}</span>
              </div>

              <div class="settings-field settings-field--toggle settings-field--prominent">
                <div class="settings-field-main">
                  <label class="settings-field-label" for="global-processing-toggle">
                    Process Incoming Webhooks
                  </label>
                  <p class="settings-field-hint">
                    When disabled, incoming webhooks will be stored but not processed by the "{{ webhookProcessingStatus.serverId }}" server.
                  </p>
                </div>
                <div class="settings-field-control">
                  <div class="toggle-with-status">
                    <label class="toggle-switch">
                      <input
                        id="global-processing-toggle"
                        :checked="webhookProcessingStatus.effectivelyEnabled"
                        type="checkbox"
                        :disabled="togglingWebhookProcessing"
                        @change="toggleWebhookProcessing"
                      />
                      <span class="toggle-slider"></span>
                    </label>
                    <span :class="['toggle-status', webhookProcessingStatus.effectivelyEnabled ? 'toggle-status--enabled' : 'toggle-status--disabled']">
                      {{ webhookProcessingStatus.effectivelyEnabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Webhook Selector -->
          <div class="settings-section settings-section--selector">
            <label class="form-field">
              <span class="form-label">Select Webhook</span>
              <select v-model="webhookSettingsForm.webhookId" class="select" @change="onWebhookSettingsSelect">
                <option value="" disabled>Choose a webhook to configure...</option>
                <option v-for="hook in webhooks" :key="hook.id" :value="hook.id">
                  {{ hook.label }}
                </option>
              </select>
            </label>
          </div>

          <!-- Settings Content (shown when webhook selected) -->
          <template v-if="webhookSettingsForm.webhookId">
            <!-- Webhook Info Summary -->
            <div class="settings-info-banner">
              <div class="settings-info-item">
                <span class="settings-info-label">Status</span>
                <span :class="['settings-info-value', selectedWebhookForSettings?.isEnabled ? 'text-success' : 'text-muted']">
                  {{ selectedWebhookForSettings?.isEnabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              <div class="settings-info-item">
                <span class="settings-info-label">Last Received</span>
                <span class="settings-info-value">
                  {{ selectedWebhookForSettings?.lastReceivedAt ? formatRelativeTime(selectedWebhookForSettings.lastReceivedAt) : 'Never' }}
                </span>
              </div>
              <div class="settings-info-item">
                <span class="settings-info-label">Actions</span>
                <span class="settings-info-value">
                  {{ selectedWebhookForSettings?.actions?.filter(a => a.isEnabled).length ?? 0 }} active
                </span>
              </div>
            </div>

            <!-- Message Processing Section -->
            <div class="settings-section">
              <div class="settings-section-header">
                <h4 class="settings-section-title">Message Processing</h4>
                <p class="settings-section-description">Configure how incoming messages are handled and processed.</p>
              </div>

              <div class="settings-fields">
                <!-- Merge Window -->
                <div class="settings-field">
                  <div class="settings-field-main">
                    <label class="settings-field-label" :for="`merge-window-${webhookSettingsForm.webhookId}`">
                      Merge Detection Window
                    </label>
                    <p class="settings-field-hint">
                      Messages received within this time window will be grouped together for potential merging.
                    </p>
                  </div>
                  <div class="settings-field-control">
                    <div class="input-with-suffix">
                      <input
                        :id="`merge-window-${webhookSettingsForm.webhookId}`"
                        v-model.number="webhookSettingsForm.mergeWindowSeconds"
                        type="number"
                        min="1"
                        max="300"
                        class="input input--compact"
                      />
                      <span class="input-suffix">sec</span>
                    </div>
                  </div>
                </div>

                <!-- Auto-Merge Toggle -->
                <div class="settings-field settings-field--toggle">
                  <div class="settings-field-main">
                    <label class="settings-field-label" :for="`auto-merge-${webhookSettingsForm.webhookId}`">
                      Automatic Merge Processing
                    </label>
                    <p class="settings-field-hint">
                      Automatically sort, combine, and process grouped messages with AI review when the merge window closes.
                    </p>
                  </div>
                  <div class="settings-field-control">
                    <div class="toggle-with-status">
                      <label class="toggle-switch">
                        <input
                          :id="`auto-merge-${webhookSettingsForm.webhookId}`"
                          v-model="webhookSettingsForm.autoMerge"
                          type="checkbox"
                        />
                        <span class="toggle-slider"></span>
                      </label>
                      <span :class="['toggle-status', webhookSettingsForm.autoMerge ? 'toggle-status--enabled' : 'toggle-status--disabled']">
                        {{ webhookSettingsForm.autoMerge ? 'Enabled' : 'Disabled' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Empty State -->
          <div v-else class="settings-empty-state">
            <div class="settings-empty-icon">⚙️</div>
            <p>Select a webhook above to configure its settings.</p>
          </div>
        </div>
        <footer class="modal__footer modal__footer--settings">
          <button class="btn btn--outline" type="button" @click="showWebhookSettings = false">Cancel</button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="!webhookSettingsForm.webhookId || savingWebhookSettings"
            @click="saveWebhookSettings"
          >
            {{ savingWebhookSettings ? 'Saving...' : 'Save Settings' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Crash Report Inspector Modal -->
    <div v-if="showCrashInspector" class="modal-backdrop" @click.self="closeCrashInspector">
      <div class="modal modal--wide modal--inspector" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div class="modal__titles">
            <h3><span class="ai-icon" aria-hidden="true">✦</span> Crash Report Inspector</h3>
            <p v-if="inspectorResult" class="muted small">{{ inspectorResult.summary }}</p>
            <p v-else-if="inspectorLoading" class="muted small">Analyzing crash report...</p>
            <p v-else class="muted small">Click "Inspect with AI" to analyze the crash report</p>
          </div>
          <button class="icon-button" @click="closeCrashInspector" aria-label="Close">
            ✕
          </button>
        </header>

        <div class="modal__body inspector-body">
          <!-- Loading state -->
          <div v-if="inspectorLoading" class="inspector-loading">
            <div class="ai-loading-animation">
              <div class="ai-loading-rings">
                <div class="ai-ring ai-ring--outer"></div>
                <div class="ai-ring ai-ring--middle"></div>
                <div class="ai-ring ai-ring--inner"></div>
              </div>
              <span class="ai-loading-icon">✦</span>
            </div>
            <div class="ai-loading-text">
              <p class="ai-loading-title">Analyzing Crash Report</p>
              <p class="ai-loading-subtitle">AI is identifying notable sections and potential issues...</p>
            </div>
            <div class="ai-loading-dots">
              <span class="ai-dot"></span>
              <span class="ai-dot"></span>
              <span class="ai-dot"></span>
            </div>
          </div>

          <!-- Error state -->
          <div v-else-if="inspectorError" class="inspector-error">
            <p class="error-text">{{ inspectorError }}</p>
            <button class="btn btn--outline" type="button" @click="runCrashInspection">
              Retry
            </button>
          </div>

          <!-- Results state -->
          <div v-else-if="inspectorResult" class="inspector-content">
            <div class="inspector-legend">
              <span class="legend-item">
                <span class="highlight-sample highlight--critical"></span> Critical
              </span>
              <span class="legend-item">
                <span class="highlight-sample highlight--important"></span> Important
              </span>
              <span class="legend-item">
                <span class="highlight-sample highlight--info"></span> Info
              </span>
              <span class="legend-count">{{ inspectorResult.highlights.length }} highlights found</span>
            </div>

            <!-- Debug: Show highlight positions if none are rendering -->
            <details v-if="inspectorResult.highlights.length > 0" class="inspector-debug">
              <summary class="muted small">Debug: Highlight positions ({{ inspectorResult.highlights.length }} items)</summary>
              <ul class="debug-list">
                <li v-for="(h, idx) in inspectorResult.highlights" :key="idx" class="debug-item">
                  <strong>{{ h.severity }}:</strong> "{{ h.text.slice(0, 50) }}{{ h.text.length > 50 ? '...' : '' }}"
                  <span class="muted">[{{ h.startIndex }}-{{ h.endIndex }}]</span>
                </li>
              </ul>
              <p class="muted small" style="margin-top: 0.5rem;">
                HTML contains spans: {{ highlightedReportHtml.includes('inspector-highlight') ? 'YES' : 'NO' }}
                | Crash text length: {{ inspectorCrashText.length }}
              </p>
              <details style="margin-top: 0.5rem;">
                <summary class="muted small">Raw HTML preview (first 500 chars)</summary>
                <pre style="font-size: 0.65rem; max-height: 100px; overflow: auto; background: #000; padding: 0.5rem;">{{ highlightedReportHtml.slice(0, 500) }}</pre>
              </details>
            </details>

            <pre
              ref="inspectorReportRef"
              class="inspector-report"
              v-html="highlightedReportHtml"
              @mouseover="handleHighlightHover"
              @mouseout="handleHighlightLeave"
            ></pre>
          </div>

          <!-- Initial state - show raw crash report -->
          <div v-else class="inspector-content">
            <pre class="inspector-report">{{ inspectorCrashText }}</pre>
          </div>
        </div>

        <!-- Tooltip element (outside scroll container to avoid clipping) -->
        <div
          v-if="inspectorTooltip.visible"
          class="inspector-tooltip"
          :class="`tooltip--${inspectorTooltip.severity}`"
          :style="{ left: inspectorTooltip.x + 'px', top: inspectorTooltip.y + 'px' }"
        >
          <span class="tooltip-category">[{{ inspectorTooltip.category }}]</span>
          {{ inspectorTooltip.text }}
        </div>

        <footer class="modal__footer modal__footer--centered">
          <button
            v-if="!inspectorResult && !inspectorLoading"
            class="btn btn--accent"
            type="button"
            @click="runCrashInspection"
            :disabled="inspectorLoading"
          >
            <span class="ai-icon" aria-hidden="true">✦</span> Inspect with AI
          </button>
          <button
            v-if="inspectorResult"
            class="btn btn--accent"
            type="button"
            @click="runCrashInspection"
            :disabled="inspectorLoading"
          >
            <span class="ai-icon" aria-hidden="true">✦</span> Re-analyze
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  api,
  type InboundWebhook,
  type InboundWebhookAction,
  type InboundWebhookMessage,
  type InboundWebhookMessageStatus,
  type InboundWebhookRetentionPolicy,
  type AdminUserSummary,
  type WebhookMessageLabel,
  type CrashInspectionResult,
  type CrashHighlight,
  type CrashSegmentSortResult
} from '../services/api';
import { useToastBus } from '../components/ToastBus';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const componentReady = ref(false);
const activeTab = ref<'endpoints' | 'inbox'>('inbox');
const pendingMessageId = ref<string | null>(null);
const { addToast } = useToastBus();

const webhooks = ref<InboundWebhook[]>([]);
const inboxMessages = ref<InboundWebhookMessage[]>([]);
const inboxTotal = ref(0);
const inboxLoading = ref(false);
const expandedWebhookId = ref<string | null>(null);
const nowTs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
const adminUsers = ref<AdminUserSummary[]>([]);
const adminAssignableUsers = computed(() => adminUsers.value.filter((user) => user.isAdmin));
const crashModelOptions = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b'
];

const creatingWebhook = ref(false);
const savingWebhookId = ref<string | null>(null);
const creatingActionId = ref<string | null>(null);
const savingActionId = ref<string | null>(null);
const sendingTestId = ref<string | null>(null);
const showCreateWebhook = ref(false);
const showTestPanel = ref(false);
const retryingCrashId = ref<string | null>(null);
const showPromptModal = ref(false);
let inboxPollTimer: ReturnType<typeof setInterval> | null = null;
let messagePollTimer: ReturnType<typeof setInterval> | null = null;
let inboxPollInFlight = false;

const selectedMessage = ref<InboundWebhookMessage | null>(null);

// Email inbox-like features
const selectedMessageIds = ref<Set<string>>(new Set());
const webhookLabels = ref<WebhookMessageLabel[]>([]);
const showLabelManager = ref(false);
const labelInputMessageId = ref<string | null>(null);
const labelInputValue = ref('');
const showMergeModal = ref(false);
const mergeOrdering = ref<string[]>([]);
const mergingMessages = ref(false);
const showMergePreview = ref(false);
const draggedMergeIndex = ref<number | null>(null);
const dragOverMergeIndex = ref<number | null>(null);
const sortingWithAi = ref(false);
const aiSortApplied = ref(false);
const aiSortResult = ref<CrashSegmentSortResult | null>(null);
const unreadCount = ref(0);
const bulkActionInProgress = ref(false);
const labelToEdit = ref<WebhookMessageLabel | null>(null);
const newLabelForm = reactive({ name: '', color: '#4a90d9' });

// Webhook Settings Modal
const showWebhookSettings = ref(false);
const webhookSettingsForm = reactive({
  webhookId: '',
  mergeWindowSeconds: 10,
  autoMerge: false
});
const savingWebhookSettings = ref(false);

// Global Webhook Processing Toggle (per-server, uses SERVER_ID env var)
const webhookProcessingStatus = reactive({
  effectivelyEnabled: true,
  serverId: 'unknown'
});
const togglingWebhookProcessing = ref(false);
const selectedWebhookForSettings = computed(() =>
  webhooks.value.find((w) => w.id === webhookSettingsForm.webhookId)
);

// Merge group detection
const dismissedMergeGroups = ref<Set<string>>(new Set());

// Crash Report Inspector
const showCrashInspector = ref(false);
const inspectorLoading = ref(false);
const inspectorError = ref<string | null>(null);
const inspectorResult = ref<CrashInspectionResult | null>(null);
const inspectorCrashText = ref('');

// Inspector tooltip (positioned via JS to escape overflow clipping)
const inspectorTooltip = reactive({
  visible: false,
  text: '',
  category: '',
  severity: '',
  x: 0,
  y: 0
});
const inspectorReportRef = ref<HTMLElement | null>(null);

const createForm = reactive({
  label: '',
  description: '',
  isEnabled: true,
  retentionMode: 'indefinite',
  retentionDays: 30,
  retentionMaxCount: 5000
});

const webhookDrafts = reactive<Record<string, any>>({});
const actionDrafts = reactive<Record<string, any>>({});
const testDrafts = reactive<Record<string, any>>({});

const inboxFilters = reactive({
  page: 1,
  pageSize: 25,
  webhookId: '',
  status: '' as '' | InboundWebhookMessageStatus,
  includeArchived: false,
  readStatus: '' as '' | 'read' | 'unread',
  starred: false,
  labelId: ''
});

const inboxTotalPages = computed(() =>
  Math.max(1, Math.ceil(inboxTotal.value / inboxFilters.pageSize))
);
const inboxRangeStart = computed(() =>
  inboxTotal.value === 0 ? 0 : (inboxFilters.page - 1) * inboxFilters.pageSize + 1
);
const inboxRangeEnd = computed(() =>
  Math.min(inboxTotal.value, inboxFilters.page * inboxFilters.pageSize)
);
const inboxPageButtons = computed(() => {
  const total = inboxTotalPages.value;
  const current = inboxFilters.page;
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, total, current - 1, current, current + 1, current - 2, current + 2]);
  const validPages = Array.from(pages).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output: Array<number | string> = [];
  for (let i = 0; i < validPages.length; i += 1) {
    const page = validPages[i];
    const previous = validPages[i - 1];
    if (previous && page - previous > 1) {
      output.push('...');
    }
    output.push(page);
  }
  return output;
});
const failedCount = computed(() =>
  inboxMessages.value.filter((message) => message.status === 'FAILED').length
);
const selectedWebhook = computed(() =>
  webhooks.value.find((hook) => hook.id === expandedWebhookId.value) ?? null
);
const isAutoMergeActive = computed(() => {
  // Auto-Merge is a global setting - check if any webhook has it enabled
  return webhooks.value.some((w) => w.autoMerge);
});

// Processing status tracking
const processingStatus = reactive({
  hasPendingProcessing: false,
  pendingWebhookIds: [] as string[]
});
let processingStatusInterval: ReturnType<typeof setInterval> | null = null;

// Pending merge groups tracking
interface PendingMergeGroup {
  compositeKey: string;
  groupKey: string;
  webhookId: string;
  messageCount: number;
  messageIds: string[];
  firstMessageAt: string;
  expiresAt: string;
  remainingSeconds: number;
}
const pendingMergeGroups = ref<PendingMergeGroup[]>([]);
const processingGroupKey = ref<string | null>(null);

// Computed: messages that are NOT in a pending merge group (to avoid showing duplicates)
const pendingGroupMessageIds = computed(() => {
  const ids = new Set<string>();
  for (const group of pendingMergeGroups.value) {
    for (const id of group.messageIds) {
      ids.add(id);
    }
  }
  return ids;
});

const filteredInboxMessages = computed(() => {
  return inboxMessages.value.filter(m => !pendingGroupMessageIds.value.has(m.id));
});

async function pollPendingMergeGroups() {
  try {
    const groups = await api.getPendingMergeGroups();
    const hadGroups = pendingMergeGroups.value.length > 0;
    pendingMergeGroups.value = groups;

    // If groups just finished (went from having groups to zero), refresh inbox
    if (hadGroups && groups.length === 0) {
      await loadInbox();
    }
  } catch (error) {
    // Silently ignore polling errors
  }
}

async function processGroupNow(webhookId: string, groupKey: string) {
  processingGroupKey.value = `${webhookId}:${groupKey}`;
  try {
    await api.processGroupNow(webhookId, groupKey);
    // Remove from local state immediately
    pendingMergeGroups.value = pendingMergeGroups.value.filter(
      g => g.compositeKey !== `${webhookId}:${groupKey}`
    );
    addToast({
      title: 'Processing Started',
      message: 'Group is being processed now',
      variant: 'success'
    });
    // Refresh inbox after a short delay to show results
    setTimeout(() => loadInbox(), 2000);
  } catch (error) {
    console.error('Failed to process group:', error);
    addToast({
      title: 'Error',
      message: 'Failed to trigger processing',
      variant: 'error'
    });
  } finally {
    processingGroupKey.value = null;
  }
}

async function pollProcessingStatus() {
  try {
    const status = await api.getWebhookProcessingStatus();
    processingStatus.hasPendingProcessing = status.hasPendingProcessing;
    processingStatus.pendingWebhookIds = status.pendingWebhookIds;

    // Also poll pending merge groups
    await pollPendingMergeGroups();

    // If processing just finished, refresh the inbox
    if (!status.hasPendingProcessing && processingStatus.pendingWebhookIds.length > 0) {
      await loadInbox();
    }
  } catch (error) {
    // Silently ignore polling errors
  }
}

function startProcessingStatusPolling() {
  if (processingStatusInterval) return;
  // Poll every 2 seconds when auto-merge is active
  processingStatusInterval = setInterval(pollProcessingStatus, 2000);
  // Initial poll
  pollProcessingStatus();
}

function stopProcessingStatusPolling() {
  if (processingStatusInterval) {
    clearInterval(processingStatusInterval);
    processingStatusInterval = null;
  }
}

// Watch for auto-merge status changes to start/stop polling
watch(isAutoMergeActive, (newVal) => {
  if (newVal) {
    startProcessingStatusPolling();
  } else {
    stopProcessingStatusPolling();
    processingStatus.hasPendingProcessing = false;
    processingStatus.pendingWebhookIds = [];
  }
});

// Merge group detection
interface MergeGroup {
  id: string;
  webhookId: string;
  crashType: 'crash' | 'script_error';
  messages: InboundWebhookMessage[];
  timeWindow: number;
}

function getCrashType(message: InboundWebhookMessage): 'crash' | 'script_error' | null {
  const labels = message.labels ?? [];
  if (labels.some((l) => l.name === 'Crash')) return 'crash';
  if (labels.some((l) => l.name === 'Script Error')) return 'script_error';
  return null;
}

function getMessageLabelSignature(message: InboundWebhookMessage): string {
  // Create a signature from sorted label names to compare messages
  const labels = message.labels ?? [];
  return labels.map((l) => l.name).sort().join('|');
}

const detectedMergeGroups = computed<MergeGroup[]>(() => {
  const groups: MergeGroup[] = [];
  const processed = new Set<string>();

  // Get webhooks with their merge window settings
  const webhookSettings = new Map(webhooks.value.map((w) => [w.id, w.mergeWindowSeconds ?? 10]));

  for (const message of inboxMessages.value) {
    if (processed.has(message.id)) continue;
    if (message.archivedAt) continue;

    const windowSeconds = webhookSettings.get(message.webhookId) ?? 10;
    const crashType = getCrashType(message);
    const labelSignature = getMessageLabelSignature(message);

    if (!crashType) continue;

    // Find related messages within time window with matching labels
    const related = inboxMessages.value.filter((other) => {
      if (other.id === message.id) return false;
      if (processed.has(other.id)) return false;
      if (other.webhookId !== message.webhookId) return false;
      if (other.archivedAt) return false;
      // All labels must match (Crash/Script Error, Test/Live, etc.)
      if (getMessageLabelSignature(other) !== labelSignature) return false;

      const timeDiff = Math.abs(
        new Date(message.receivedAt).getTime() - new Date(other.receivedAt).getTime()
      );
      return timeDiff <= windowSeconds * 1000;
    });

    if (related.length > 0) {
      const groupMessages = [message, ...related].sort(
        (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );

      const groupId = `group-${groupMessages[0].id}`;

      // Skip if this group was dismissed
      if (!dismissedMergeGroups.value.has(groupId)) {
        groups.push({
          id: groupId,
          webhookId: message.webhookId,
          crashType,
          messages: groupMessages,
          timeWindow: windowSeconds
        });
      }

      groupMessages.forEach((m) => processed.add(m.id));
    }
  }

  return groups;
});

function getMessageMergeGroup(messageId: string): MergeGroup | null {
  return detectedMergeGroups.value.find((g) => g.messages.some((m) => m.id === messageId)) ?? null;
}

function isFirstInMergeGroupDisplay(messageId: string): boolean {
  const group = getMessageMergeGroup(messageId);
  if (!group) return false;

  // Find the first message of this group as it appears in inboxMessages (display order)
  const groupMessageIds = new Set(group.messages.map((m) => m.id));
  for (const msg of inboxMessages.value) {
    if (groupMessageIds.has(msg.id)) {
      return msg.id === messageId;
    }
  }
  return false;
}

function isLastInMergeGroupDisplay(messageId: string): boolean {
  const group = getMessageMergeGroup(messageId);
  if (!group) return false;

  // Find the last message of this group as it appears in inboxMessages (display order)
  const groupMessageIds = new Set(group.messages.map((m) => m.id));
  let lastInDisplay: string | null = null;
  for (const msg of inboxMessages.value) {
    if (groupMessageIds.has(msg.id)) {
      lastInDisplay = msg.id;
    }
  }
  return lastInDisplay === messageId;
}

function dismissMergeGroup(groupId: string) {
  dismissedMergeGroups.value.add(groupId);
}

function startMergeFromGroup(group: MergeGroup) {
  selectedMessageIds.value = new Set(group.messages.map((m) => m.id));
  openMergeModal();
}

function buildRetentionPayload(draft: any): InboundWebhookRetentionPolicy {
  if (draft.retentionMode === 'days') {
    return { mode: 'days' as const, days: draft.retentionDays || 30 };
  }
  if (draft.retentionMode === 'maxCount') {
    return { mode: 'maxCount' as const, maxCount: draft.retentionMaxCount || 5000 };
  }
  return { mode: 'indefinite' as const };
}

function buildDraft(webhook: InboundWebhook) {
  return {
    label: webhook.label,
    description: webhook.description || '',
    isEnabled: webhook.isEnabled,
    retentionMode: webhook.retentionPolicy?.mode || 'indefinite',
    retentionDays: webhook.retentionPolicy?.days ?? 30,
    retentionMaxCount: webhook.retentionPolicy?.maxCount ?? 5000
  };
}

function buildActionDraft() {
  return {
    type: 'DISCORD_RELAY',
    name: '',
    isEnabled: true,
    discordWebhookUrl: '',
    discordMode: 'WRAP',
    discordTemplate: 'Webhook payload:\n\n```json\n{{json}}\n```',
    crashModel: 'gemini-2.5-pro',
    crashMaxInputChars: 250000,
    crashMaxOutputTokens: 16384,
    crashTemperature: 0.2,
    crashPromptTemplate: ''
  };
}

function buildTestDraft() {
  return {
    payload: '{\n  "event": "test",\n  "message": "hello"\n}',
    runActions: true,
    repeatCount: 1
  };
}

async function loadWebhooks() {
  const data = await api.fetchInboundWebhooks();
  webhooks.value = data.map((webhook) => ({
    ...webhook,
    actions: (webhook.actions ?? []).map((action) => ({
      ...action,
      config: {
        discordWebhookUrl: action.config?.discordWebhookUrl,
        discordMode: action.config?.discordMode ?? 'WRAP',
        discordTemplate: action.config?.discordTemplate ?? 'Webhook payload:\n\n```json\n{{json}}\n```',
        crashModel: action.config?.crashModel ?? 'gemini-2.5-pro',
        crashMaxInputChars: action.config?.crashMaxInputChars ?? 250000,
        crashMaxOutputTokens: action.config?.crashMaxOutputTokens ?? 16384,
        crashTemperature: action.config?.crashTemperature ?? 0.2,
        crashPromptTemplate: action.config?.crashPromptTemplate ?? ''
      }
    }))
  }));
  for (const webhook of webhooks.value) {
    webhookDrafts[webhook.id] = buildDraft(webhook);
    actionDrafts[webhook.id] = buildActionDraft();
    testDrafts[webhook.id] = buildTestDraft();
  }

}

function toggleWebhook(webhookId: string) {
  expandedWebhookId.value = expandedWebhookId.value === webhookId ? null : webhookId;
  showTestPanel.value = false;
}

async function loadInbox() {
  inboxLoading.value = true;
  try {
    const result = await api.fetchInboundWebhookInbox({
      page: inboxFilters.page,
      pageSize: inboxFilters.pageSize,
      webhookId: inboxFilters.webhookId || undefined,
      status: inboxFilters.status || undefined,
      includeArchived: inboxFilters.includeArchived,
      readStatus: inboxFilters.readStatus || undefined,
      starred: inboxFilters.starred || undefined,
      labelIds: inboxFilters.labelId ? [inboxFilters.labelId] : undefined
    });
    inboxMessages.value = result.messages;
    inboxTotal.value = result.total;
    const totalPages = Math.max(1, Math.ceil(inboxTotal.value / inboxFilters.pageSize));
    if (inboxFilters.page > totalPages) {
      inboxFilters.page = totalPages;
      await loadInbox();
    }
    // Clear selection when inbox changes
    selectedMessageIds.value.clear();
  } finally {
    inboxLoading.value = false;
  }
}

async function loadLabels() {
  try {
    webhookLabels.value = await api.fetchWebhookLabels();
  } catch (err) {
    console.error('Failed to load labels:', err);
  }
}

async function loadUnreadCount() {
  try {
    unreadCount.value = await api.fetchWebhookInboxUnreadCount(
      inboxFilters.webhookId || undefined
    );
  } catch (err) {
    console.error('Failed to load unread count:', err);
  }
}

async function loadSelectedMessage(messageId: string) {
  const updated = await api.fetchInboundWebhookMessage(messageId);
  selectedMessage.value = updated;
  const inboxIndex = inboxMessages.value.findIndex((item) => item.id === messageId);
  if (inboxIndex >= 0) {
    inboxMessages.value[inboxIndex] = updated;
  }
}

function hasRecentMessages(): boolean {
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  return inboxMessages.value.some((message) => {
    if (!message.receivedAt) return false;
    return new Date(message.receivedAt).getTime() > twoMinutesAgo;
  });
}

async function refreshPendingInboxMessages() {
  // Poll messages that are either pending or recently received
  const messagesToPoll = inboxMessages.value.filter((message) => {
    // Always poll pending runs
    if (getPendingRun(message)) return true;
    // Also poll messages received in the last 2 minutes (may have status updates)
    if (message.receivedAt) {
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      return new Date(message.receivedAt).getTime() > twoMinutesAgo;
    }
    return false;
  });

  if (messagesToPoll.length === 0) return;

  const updates = await Promise.all(
    messagesToPoll.map(async (message) => {
      try {
        return await api.fetchInboundWebhookMessage(message.id);
      } catch {
        return null;
      }
    })
  );

  // Check for any changes and update only changed properties (prevents flickering)
  let anyLabelsChanged = false;
  const changedIds: string[] = [];

  for (const updated of updates) {
    if (!updated) continue;
    const inboxIndex = inboxMessages.value.findIndex((item) => item.id === updated.id);
    if (inboxIndex >= 0) {
      const existing = inboxMessages.value[inboxIndex];

      // Detect and apply changes in-place (only update changed properties)
      if (existing.status !== updated.status) {
        existing.status = updated.status;
        changedIds.push(updated.id);
      }

      // Update action runs if changed
      const existingActionsJson = JSON.stringify(existing.actionRuns);
      const updatedActionsJson = JSON.stringify(updated.actionRuns);
      if (existingActionsJson !== updatedActionsJson) {
        existing.actionRuns = updated.actionRuns;
        if (!changedIds.includes(updated.id)) changedIds.push(updated.id);
      }

      // Update labels if changed
      const existingLabelsJson = JSON.stringify(existing.labels);
      const updatedLabelsJson = JSON.stringify(updated.labels);
      if (existingLabelsJson !== updatedLabelsJson) {
        existing.labels = updated.labels;
        anyLabelsChanged = true;
        if (!changedIds.includes(updated.id)) changedIds.push(updated.id);
      }
    }
  }

  // Only refresh global labels list if any message labels changed
  if (anyLabelsChanged) {
    await loadLabels();
  }

  // Update selected message modal if it was one of the changed messages
  if (selectedMessage.value && changedIds.includes(selectedMessage.value.id)) {
    const refreshed = await api.fetchInboundWebhookMessage(selectedMessage.value.id);
    selectedMessage.value = refreshed;
  }

  if (inboxFilters.status) {
    const statusFilter = inboxFilters.status;
    const beforeCount = inboxMessages.value.length;
    inboxMessages.value = inboxMessages.value.filter((message) => message.status === statusFilter);
    if (inboxMessages.value.length !== beforeCount) {
      inboxTotal.value = Math.max(0, inboxTotal.value - (beforeCount - inboxMessages.value.length));
    }
  }
}

function hasPendingInboxRuns() {
  return inboxMessages.value.some((message) => Boolean(getPendingRun(message)));
}

function hasPendingSelectedRun() {
  return selectedMessage.value ? Boolean(getPendingRun(selectedMessage.value)) : false;
}

function shouldPollInbox(): boolean {
  return hasPendingInboxRuns() || hasRecentMessages();
}

function startInboxPolling() {
  if (inboxPollTimer) return;
  inboxPollTimer = setInterval(() => {
    if (shouldPollInbox()) {
      if (inboxPollInFlight) return;
      inboxPollInFlight = true;
      refreshPendingInboxMessages().finally(() => {
        inboxPollInFlight = false;
      });
    } else if (inboxPollTimer) {
      clearInterval(inboxPollTimer);
      inboxPollTimer = null;
    }
  }, 1500);
}

function startMessagePolling(messageId: string) {
  if (messagePollTimer) return;
  messagePollTimer = setInterval(() => {
    if (selectedMessage.value?.id !== messageId) {
      clearInterval(messagePollTimer as ReturnType<typeof setInterval>);
      messagePollTimer = null;
      return;
    }
    if (hasPendingSelectedRun()) {
      loadSelectedMessage(messageId);
    } else {
      clearInterval(messagePollTimer as ReturnType<typeof setInterval>);
      messagePollTimer = null;
    }
  }, 1500);
}

function applyInboxFilters() {
  inboxFilters.page = 1;
  loadInbox();
}

async function loadAdminUsers() {
  adminUsers.value = await api.fetchAdminUsers();
}

async function refreshAll() {
  loading.value = true;
  try {
    await Promise.all([loadWebhooks(), loadInbox(), loadAdminUsers(), loadLabels(), loadUnreadCount(), loadWebhookProcessingStatus()]);
    if (shouldPollInbox()) {
      startInboxPolling();
    }
  } finally {
    loading.value = false;
  }
}

async function loadWebhookProcessingStatus() {
  try {
    const status = await api.getServerProcessingConfig();
    webhookProcessingStatus.effectivelyEnabled = status.effectivelyEnabled;
    webhookProcessingStatus.serverId = status.serverId;
  } catch (error) {
    console.error('Failed to load webhook processing status:', error);
    // Default to enabled if we can't fetch
    webhookProcessingStatus.effectivelyEnabled = true;
    webhookProcessingStatus.serverId = 'unknown';
  }
}

async function toggleWebhookProcessing() {
  togglingWebhookProcessing.value = true;
  try {
    const newValue = !webhookProcessingStatus.effectivelyEnabled;
    await api.setWebhookProcessingEnabled(newValue);
    webhookProcessingStatus.effectivelyEnabled = newValue;
    addToast({
      title: 'Server Settings',
      message: `Webhook processing ${newValue ? 'enabled' : 'disabled'} for "${webhookProcessingStatus.serverId}"`,
      variant: newValue ? 'success' : 'warning'
    });
  } catch (error) {
    console.error('Failed to toggle webhook processing:', error);
    addToast({
      title: 'Error',
      message: 'Failed to update webhook processing setting',
      variant: 'error'
    });
  } finally {
    togglingWebhookProcessing.value = false;
  }
}

async function createWebhook() {
  creatingWebhook.value = true;
  try {
    const webhook = await api.createInboundWebhook({
      label: createForm.label.trim(),
      description: createForm.description.trim() || null,
      isEnabled: createForm.isEnabled,
      retentionPolicy: buildRetentionPayload(createForm)
    });
    webhooks.value = [webhook, ...webhooks.value];
    webhookDrafts[webhook.id] = buildDraft(webhook);
    actionDrafts[webhook.id] = buildActionDraft();
    testDrafts[webhook.id] = buildTestDraft();
    createForm.label = '';
    createForm.description = '';
    showCreateWebhook.value = false;
  } finally {
    creatingWebhook.value = false;
  }
}

async function saveWebhook(webhook: InboundWebhook) {
  savingWebhookId.value = webhook.id;
  try {
    const draft = webhookDrafts[webhook.id];
    const updated = await api.updateInboundWebhook(webhook.id, {
      label: draft.label,
      description: draft.description || null,
      isEnabled: draft.isEnabled,
      retentionPolicy: buildRetentionPayload(draft)
    });
    const index = webhooks.value.findIndex((item) => item.id === webhook.id);
    if (index >= 0) {
      webhooks.value[index] = updated;
      webhookDrafts[updated.id] = buildDraft(updated);
    }
  } finally {
    savingWebhookId.value = null;
  }
}

async function deleteWebhook(webhook: InboundWebhook) {
  const confirmed = window.confirm(`Delete webhook "${webhook.label}"?`);
  if (!confirmed) return;
  await api.deleteInboundWebhook(webhook.id);
  webhooks.value = webhooks.value.filter((item) => item.id !== webhook.id);
  delete webhookDrafts[webhook.id];
  delete actionDrafts[webhook.id];
}

async function createAction(webhook: InboundWebhook) {
  creatingActionId.value = webhook.id;
  try {
    const draft = actionDrafts[webhook.id];
    const action = await api.createInboundWebhookAction(webhook.id, {
      type: draft.type,
      name: draft.name.trim(),
      isEnabled: draft.isEnabled,
      config:
        draft.type === 'DISCORD_RELAY'
          ? {
              discordWebhookUrl: draft.discordWebhookUrl.trim() || undefined,
              discordMode: draft.discordMode,
              discordTemplate:
                draft.discordMode === 'RAW' ? undefined : draft.discordTemplate?.trim() || undefined
            }
          : draft.type === 'CRASH_REVIEW'
            ? {
                crashModel: draft.crashModel?.trim() || undefined,
                crashMaxInputChars: draft.crashMaxInputChars,
                crashMaxOutputTokens: draft.crashMaxOutputTokens,
                crashTemperature: draft.crashTemperature,
                crashPromptTemplate: draft.crashPromptTemplate?.trim() || undefined
              }
          : {}
    });
    webhook.actions = [
      ...(webhook.actions ?? []),
      {
        ...action,
        config: {
          discordWebhookUrl: action.config?.discordWebhookUrl,
          discordMode: action.config?.discordMode ?? 'WRAP',
          discordTemplate: action.config?.discordTemplate ?? 'Webhook payload:\n\n```json\n{{json}}\n```',
          crashModel: action.config?.crashModel ?? 'gemini-2.5-pro',
          crashMaxInputChars: action.config?.crashMaxInputChars ?? 250000,
          crashMaxOutputTokens: action.config?.crashMaxOutputTokens ?? 16384,
          crashTemperature: action.config?.crashTemperature ?? 0.2,
          crashPromptTemplate: action.config?.crashPromptTemplate ?? ''
        }
      }
    ];
    actionDrafts[webhook.id] = buildActionDraft();
  } finally {
    creatingActionId.value = null;
  }
}

async function saveAction(webhook: InboundWebhook, action: InboundWebhookAction) {
  savingActionId.value = action.id;
  try {
    const updated = await api.updateInboundWebhookAction(webhook.id, action.id, {
      name: action.name,
      isEnabled: action.isEnabled,
      config:
        action.type === 'DISCORD_RELAY'
          ? {
              discordWebhookUrl: action.config.discordWebhookUrl,
              discordMode: action.config.discordMode ?? 'WRAP',
              discordTemplate:
                action.config.discordMode === 'RAW'
                  ? undefined
                  : action.config.discordTemplate?.trim() || undefined
            }
          : action.type === 'CRASH_REVIEW'
            ? {
                crashModel: action.config.crashModel?.trim() || undefined,
                crashMaxInputChars: action.config.crashMaxInputChars,
                crashMaxOutputTokens: action.config.crashMaxOutputTokens,
                crashTemperature: action.config.crashTemperature,
                crashPromptTemplate: action.config.crashPromptTemplate?.trim() || undefined
              }
          : {}
    });
    webhook.actions = (webhook.actions ?? []).map((item) =>
      item.id === action.id
        ? {
            ...updated,
            config: {
              discordWebhookUrl: updated.config?.discordWebhookUrl,
              discordMode: updated.config?.discordMode ?? 'WRAP',
              discordTemplate:
                updated.config?.discordTemplate ?? 'Webhook payload:\n\n```json\n{{json}}\n```',
              crashModel: updated.config?.crashModel ?? 'gemini-2.5-pro',
              crashMaxInputChars: updated.config?.crashMaxInputChars ?? 250000,
              crashMaxOutputTokens: updated.config?.crashMaxOutputTokens ?? 16384,
              crashTemperature: updated.config?.crashTemperature ?? 0.2,
              crashPromptTemplate: updated.config?.crashPromptTemplate ?? ''
            }
          }
        : item
    );
  } finally {
    savingActionId.value = null;
  }
}

async function deleteAction(webhook: InboundWebhook, action: InboundWebhookAction) {
  const confirmed = window.confirm(`Remove action "${action.name}"?`);
  if (!confirmed) return;
  await api.deleteInboundWebhookAction(webhook.id, action.id);
  webhook.actions = (webhook.actions ?? []).filter((item) => item.id !== action.id);
}

async function copyUrl(webhook: InboundWebhook) {
  const url = `${window.location.origin}/api/webhook-inbox/${webhook.id}/${webhook.token}`;
  await navigator.clipboard.writeText(url);
}

function getWebhookUrl(webhook: InboundWebhook) {
  return `${window.location.origin}/api/webhook-inbox/${webhook.id}/${webhook.token}`;
}

async function sendTest(webhook: InboundWebhook) {
  const draft = testDrafts[webhook.id];
  if (!draft) return;

  if (draft.runActions) {
    const hasDiscordRelay = (webhook.actions ?? []).some(
      (action) => action.type === 'DISCORD_RELAY' && action.isEnabled
    );
    if (hasDiscordRelay) {
      const confirmed = window.confirm(
        'This test will send a Discord relay message. Continue?'
      );
      if (!confirmed) {
        return;
      }
    }
  }

  let payload: unknown = draft.payload;
  if (typeof draft.payload === 'string') {
    try {
      payload = JSON.parse(draft.payload);
    } catch {
      payload = { crashReportText: draft.payload };
    }
  }

  sendingTestId.value = webhook.id;
  const repeatCount = Math.min(Math.max(draft.repeatCount || 1, 1), 10);

  try {
    // Send payloads in quick succession
    const promises = [];
    for (let i = 0; i < repeatCount; i++) {
      promises.push(api.testInboundWebhook(webhook.id, payload, draft.runActions));
    }
    await Promise.all(promises);
    await loadInbox();
    addToast({
      title: 'Test Payload Sent',
      message: repeatCount > 1
        ? `Sent ${repeatCount} test payloads for ${webhook.label}.`
        : `Queued test payload for ${webhook.label}.`
    });
  } catch (error) {
    const detail =
      typeof (error as { response?: { data?: { error?: string } } })?.response?.data?.error ===
      'string'
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    addToast({
      title: 'Test Payload Failed',
      message: `Could not send test payload for ${webhook.label}: ${detail}`
    });
  } finally {
    sendingTestId.value = null;
  }
}

function setInboxPage(page: number) {
  inboxFilters.page = Math.max(1, Math.min(page, inboxTotalPages.value));
  loadInbox();
}

watch(
  () => inboxMessages.value,
  () => {
    if (shouldPollInbox()) {
      startInboxPolling();
    }
  },
  { deep: true }
);

watch(
  () => selectedMessage.value?.id,
  (messageId) => {
    if (!messageId) {
      if (messagePollTimer) {
        clearInterval(messagePollTimer);
        messagePollTimer = null;
      }
      return;
    }
    if (hasPendingSelectedRun()) {
      startMessagePolling(messageId);
    }
  }
);

function statusBadge(status: string) {
  switch (status) {
    case 'FAILED':
      return 'badge--negative';
    case 'PROCESSED':
    case 'SUCCESS':
      return 'badge--positive';
    case 'PENDING_REVIEW':
      return 'badge--neutral';
    default:
      return 'badge--neutral';
  }
}

function getActionPillClass(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'action-pill--success';
    case 'FAILED':
      return 'action-pill--failed';
    case 'PENDING_REVIEW':
      return 'action-pill--pending';
    case 'SKIPPED':
      return 'action-pill--skipped';
    case 'NOT_RUN':
      return 'action-pill--not-run';
    default:
      return '';
  }
}

function getActionLabel(type?: string | null): string {
  switch (type) {
    case 'CRASH_REVIEW':
      return 'AI Review';
    case 'DISCORD_RELAY':
      return 'Discord';
    default:
      return 'Action';
  }
}

// Get only the latest run of each action type (for cleaner display in Actions column)
function getLatestRunsByType(message: InboundWebhookMessage) {
  const runs = message.actionRuns || [];
  const latestByType = new Map<string, (typeof runs)[0]>();

  // Runs are ordered by createdAt asc, so later entries override earlier ones
  for (const run of runs) {
    const type = run.action?.type;
    if (type) {
      latestByType.set(type, run);
    }
  }

  return Array.from(latestByType.values());
}

function getNotStartedActions(message: InboundWebhookMessage) {
  const webhookActions = message.webhook?.actions?.filter((a) => a.isEnabled) || [];
  const startedActionTypes = new Set(
    (message.actionRuns || []).map((run) => run.action?.type).filter(Boolean)
  );
  // Filter to actions not started, then deduplicate by type (keep first of each type)
  const notStarted = webhookActions.filter((action) => !startedActionTypes.has(action.type));
  const seenTypes = new Set<string>();
  return notStarted.filter((action) => {
    if (seenTypes.has(action.type)) return false;
    seenTypes.add(action.type);
    return true;
  });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Never';
  const now = Date.now();
  const diff = now - parsed.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function formatAdminName(user?: { displayName?: string; nickname?: string | null; email?: string }) {
  if (!user) return 'Unassigned';
  return user.nickname || user.displayName || user.email || 'Admin';
}

function getPendingRun(message: InboundWebhookMessage) {
  return (message.actionRuns ?? []).find(
    (run) =>
      run.action?.type === 'CRASH_REVIEW' &&
      run.status === 'PENDING_REVIEW' &&
      isPendingRunFresh(run)
  );
}

function getPendingDuration(message: InboundWebhookMessage) {
  const run = getPendingRun(message);
  if (run?.createdAt) {
    return Math.max(0, nowTs.value - new Date(run.createdAt).getTime());
  }
  if (message.receivedAt) {
    return Math.max(0, nowTs.value - new Date(message.receivedAt).getTime());
  }
  return 0;
}

function getRunDuration(run: { createdAt?: string | null }) {
  if (!run.createdAt) return 0;
  return Math.max(0, nowTs.value - new Date(run.createdAt).getTime());
}

function isPendingRunFresh(run: { createdAt?: string | null }) {
  if (!run.createdAt) return false;
  const ageMs = nowTs.value - new Date(run.createdAt).getTime();
  return ageMs >= 0 && ageMs <= 15 * 60 * 1000;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCrashSummary(message: InboundWebhookMessage) {
  const run = (message.actionRuns ?? []).find(
    (item) => item.action?.type === 'CRASH_REVIEW' && item.result && item.status === 'SUCCESS'
  );
  if (!run || !run.result) return '';
  const summary = (run.result as Record<string, unknown>).summary;
  if (typeof summary !== 'string' || summary.trim().length === 0) return '';
  return summary.length > 120 ? `${summary.slice(0, 117)}...` : summary;
}

function getCrashRun(message: InboundWebhookMessage) {
  const runs = (message.actionRuns ?? []).filter((run) => run.action?.type === 'CRASH_REVIEW');
  return runs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
}

function getCrashRunStatus(message: InboundWebhookMessage) {
  return getCrashRun(message)?.status ?? 'N/A';
}

function getCrashRunModel(message: InboundWebhookMessage) {
  const run = getCrashRun(message);
  const telemetry = run?.result && typeof run.result === 'object'
    ? (run.result as Record<string, unknown>).telemetry
    : null;
  if (telemetry && typeof telemetry === 'object') {
    const model = (telemetry as Record<string, unknown>).model;
    return typeof model === 'string' ? model : '';
  }
  return '';
}

function isCrashReviewPending(message: InboundWebhookMessage) {
  // Check if we're currently triggering a retry for this message
  if (retryingCrashId.value === message.id) {
    return true;
  }
  const run = getCrashRun(message);
  return run?.status === 'PENDING_REVIEW' && isPendingRunFresh(run);
}

function getCrashRunResult(message: InboundWebhookMessage) {
  const run = getCrashRun(message);
  if (!run?.result || typeof run.result !== 'object') return null;
  return run.result as {
    summary: string;
    hypotheses?: Array<{ title: string; confidence: number; evidence: string[] }>;
    missingInfo?: string[];
    recommendedNextSteps?: string[];
  };
}

interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  finishReason: string;
  maxOutputTokens: number;
}

function getCrashRunTokenUsage(message: InboundWebhookMessage): TokenUsageData | null {
  const run = getCrashRun(message);
  if (!run?.result || typeof run.result !== 'object') return null;
  const telemetry = (run.result as Record<string, unknown>).telemetry as Record<string, unknown> | undefined;
  if (!telemetry || typeof telemetry !== 'object') return null;

  // Extract token counts from telemetry
  const outputTokens = typeof telemetry.outputTokens === 'number' ? telemetry.outputTokens : 0;
  const thinkingTokens = typeof telemetry.thinkingTokens === 'number' ? telemetry.thinkingTokens : 0;
  const totalTokens = typeof telemetry.totalTokens === 'number' ? telemetry.totalTokens : 0;
  const finishReason = typeof telemetry.finishReason === 'string' ? telemetry.finishReason : '';

  // Estimate input tokens from the request payload if available
  const requestPayload = telemetry.requestPayload as Record<string, unknown> | undefined;
  const analysisPayload = requestPayload?.analysis as Record<string, unknown> | undefined;
  const contents = analysisPayload?.contents as Array<{ parts?: Array<{ text?: string }> }> | undefined;
  const promptText = contents?.[0]?.parts?.[0]?.text;
  // Rough estimate: ~4 chars per token for input
  const inputTokens = promptText ? Math.ceil(promptText.length / 4) : 0;

  // Get max output tokens from the config
  const config = analysisPayload?.config as Record<string, unknown> | undefined;
  const maxOutputTokens = typeof config?.maxOutputTokens === 'number' ? config.maxOutputTokens : 16384;

  // Only return if we have meaningful data
  if (totalTokens === 0 && outputTokens === 0) return null;

  return {
    inputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens,
    finishReason,
    maxOutputTokens
  };
}

function getCrashRunPrompt(message: InboundWebhookMessage | null) {
  if (!message) return null;
  const run = getCrashRun(message);
  if (!run?.result || typeof run.result !== 'object') return null;
  const telemetry = (run.result as Record<string, unknown>).telemetry as Record<string, unknown> | undefined;
  if (!telemetry || typeof telemetry !== 'object') return null;
  const requestPayload = telemetry.requestPayload;
  if (!requestPayload || typeof requestPayload !== 'object') return null;
  return sanitizePromptPayload(requestPayload as Record<string, unknown>);
}

function getCrashRunError(message: InboundWebhookMessage) {
  const run = getCrashRun(message);
  if (!run || run.status !== 'FAILED') return '';
  return run.error || 'Crash review failed. No error details were returned.';
}

async function copyCrashError(message: InboundWebhookMessage) {
  const errorText = getCrashRunError(message);
  if (!errorText) return;
  await navigator.clipboard.writeText(errorText);
}

function getCrashReportText(message: InboundWebhookMessage) {
  const payload = message.payload as Record<string, unknown> | null;
  if (payload && typeof payload.crashReportText === 'string') {
    return payload.crashReportText;
  }
  if (payload && typeof payload.message === 'string') {
    return payload.message;
  }
  const rawHead = payload?.crashReport && typeof payload.crashReport === 'object'
    ? (payload.crashReport as Record<string, unknown>).rawHead
    : null;
  if (typeof rawHead === 'string' && rawHead.trim().length > 0) {
    return rawHead;
  }
  if (typeof message.rawBody === 'string' && message.rawBody.trim().length > 0) {
    return message.rawBody;
  }
  return '';
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function formatFindingsText(result: unknown) {
  if (!result || typeof result !== 'object') return '';
  const data = result as Record<string, unknown>;
  const summary = typeof data.summary === 'string' ? data.summary : 'No summary provided.';
  const signature = data.signature as Record<string, unknown> | null | undefined;
  const signatureLines = signature
    ? [
        typeof signature.exception === 'string' ? `Exception: ${signature.exception}` : null,
        typeof signature.topFrame === 'string' ? `Top frame: ${signature.topFrame}` : null
      ].filter(Boolean)
    : [];
  const hypotheses = Array.isArray(data.hypotheses) ? data.hypotheses : [];
  const hypothesisLines = hypotheses.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : `Hypothesis ${index + 1}`;
    const confidence =
      typeof record.confidence === 'number' ? ` (${Math.round(record.confidence * 100)}% confidence)` : '';
    const evidence = Array.isArray(record.evidence)
      ? record.evidence.map((entry) => `  - ${entry}`)
      : [];
    const nextSteps = Array.isArray(record.nextSteps)
      ? record.nextSteps.map((entry) => `  - ${entry}`)
      : [];
    return [
      `${index + 1}. ${title}${confidence}`,
      evidence.length ? ' Evidence:' : null,
      ...evidence,
      nextSteps.length ? ' Next steps:' : null,
      ...nextSteps
    ].filter(Boolean) as string[];
  });
  const missingInfo = Array.isArray(data.missingInfo)
    ? data.missingInfo.map((entry) => `- ${entry}`)
    : [];
  const recommendedNextSteps = Array.isArray(data.recommendedNextSteps)
    ? data.recommendedNextSteps.map((entry) => `- ${entry}`)
    : [];

  return [
    'Crash Review Findings',
    '',
    'Summary:',
    summary,
    signatureLines.length ? '' : null,
    signatureLines.length ? 'Signature:' : null,
    ...signatureLines,
    hypothesisLines.length ? '' : null,
    hypothesisLines.length ? 'Hypotheses:' : null,
    ...hypothesisLines,
    missingInfo.length ? '' : null,
    missingInfo.length ? 'Missing Info:' : null,
    ...missingInfo,
    recommendedNextSteps.length ? '' : null,
    recommendedNextSteps.length ? 'Recommended Next Steps:' : null,
    ...recommendedNextSteps
  ]
    .filter(Boolean)
    .join('\n')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
    .trim();
}

async function copyReport() {
  if (!selectedMessage.value) return;
  const reportText = getCrashReportText(selectedMessage.value);
  await navigator.clipboard.writeText(reportText);
}

async function copyFindings(run: { result?: unknown }) {
  if (!run.result) return;
  await navigator.clipboard.writeText(formatFindingsText(run.result));
}

async function copyFindingsJson(run: { result?: unknown }) {
  if (!run.result) return;
  await navigator.clipboard.writeText(formatJson(run.result));
}

async function copyPromptJson() {
  const prompt = getCrashRunPrompt(selectedMessage.value);
  if (!prompt) return;
  await navigator.clipboard.writeText(formatJson(prompt));
}

function sanitizePromptPayload(payload: Record<string, unknown>) {
  const sanitized = { ...payload } as Record<string, unknown>;
  if (typeof sanitized.contents === 'string') {
    sanitized.contents = sanitized.contents.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim();
  }
  return sanitized;
}

async function openMessage(message: InboundWebhookMessage) {
  const full = await api.fetchInboundWebhookMessage(message.id);
  selectedMessage.value = full;
  showPromptModal.value = false;
  if (getPendingRun(full)) {
    startMessagePolling(full.id);
  }
  // Auto-mark as read when viewing
  if (!full.isRead) {
    try {
      await api.markWebhookMessageRead(message.id, true);
      full.isRead = true;
      // Update inbox list
      const index = inboxMessages.value.findIndex((m) => m.id === message.id);
      if (index >= 0) {
        inboxMessages.value[index].isRead = true;
      }
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  }
}

async function updateAssignment(message: InboundWebhookMessage) {
  const adminId = message.assignedAdminId || null;
  const updated = await api.assignInboundWebhookMessage(message.id, adminId);
  const isModalMessage = selectedMessage.value?.id === updated.id;
  if (isModalMessage) {
    selectedMessage.value = updated;
  }
  const index = inboxMessages.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) {
    inboxMessages.value[index] = { ...inboxMessages.value[index], ...updated };
  }
}

// ==================== Multi-select & Bulk Actions ====================

function toggleMessageSelection(messageId: string) {
  if (selectedMessageIds.value.has(messageId)) {
    selectedMessageIds.value.delete(messageId);
  } else {
    selectedMessageIds.value.add(messageId);
  }
  // Force reactivity
  selectedMessageIds.value = new Set(selectedMessageIds.value);
}

function selectAllMessages() {
  if (selectedMessageIds.value.size === inboxMessages.value.length) {
    selectedMessageIds.value.clear();
  } else {
    selectedMessageIds.value = new Set(inboxMessages.value.map((m) => m.id));
  }
}

function clearSelection() {
  selectedMessageIds.value.clear();
  selectedMessageIds.value = new Set();
}

const allSelected = computed(() =>
  inboxMessages.value.length > 0 && selectedMessageIds.value.size === inboxMessages.value.length
);
const someSelected = computed(() =>
  selectedMessageIds.value.size > 0 && selectedMessageIds.value.size < inboxMessages.value.length
);

async function bulkMarkRead() {
  if (selectedMessageIds.value.size === 0) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: 'markRead'
    });
    addToast({ title: 'Success', message: `Marked ${result.success} messages as read` });
    inboxMessages.value.forEach((m) => {
      if (selectedMessageIds.value.has(m.id)) m.isRead = true;
    });
    clearSelection();
    await loadUnreadCount();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to mark messages as read' });
  } finally {
    bulkActionInProgress.value = false;
  }
}

async function bulkMarkUnread() {
  if (selectedMessageIds.value.size === 0) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: 'markUnread'
    });
    addToast({ title: 'Success', message: `Marked ${result.success} messages as unread` });
    inboxMessages.value.forEach((m) => {
      if (selectedMessageIds.value.has(m.id)) m.isRead = false;
    });
    clearSelection();
    await loadUnreadCount();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to mark messages as unread' });
  } finally {
    bulkActionInProgress.value = false;
  }
}

async function bulkArchive() {
  if (selectedMessageIds.value.size === 0) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: 'archive'
    });
    addToast({ title: 'Success', message: `Archived ${result.success} messages` });
    clearSelection();
    await loadInbox();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to archive messages' });
  } finally {
    bulkActionInProgress.value = false;
  }
}

async function bulkDelete() {
  if (selectedMessageIds.value.size === 0) return;
  if (!confirm(`Delete ${selectedMessageIds.value.size} messages? This cannot be undone.`)) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: 'delete'
    });
    addToast({ title: 'Success', message: `Deleted ${result.success} messages` });
    clearSelection();
    await loadInbox();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to delete messages' });
  } finally {
    bulkActionInProgress.value = false;
  }
}

async function bulkRerunCrashReview() {
  if (selectedMessageIds.value.size === 0) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: 'rerunCrashReview'
    });
    addToast({ title: 'Success', message: `Queued AI review for ${result.success} messages` });
    clearSelection();
    await loadInbox();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to queue AI review' });
  } finally {
    bulkActionInProgress.value = false;
  }
}

// ==================== Starring ====================

async function toggleStar(message: InboundWebhookMessage) {
  const newStarred = !message.isStarred;
  try {
    await api.toggleWebhookMessageStar(message.id, newStarred);
    message.isStarred = newStarred;
    // Update in inbox list
    const index = inboxMessages.value.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      inboxMessages.value[index].isStarred = newStarred;
    }
    // Update in modal if open
    if (selectedMessage.value?.id === message.id) {
      selectedMessage.value.isStarred = newStarred;
    }
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to update star' });
  }
}

async function bulkStar(starred: boolean) {
  if (selectedMessageIds.value.size === 0) return;
  bulkActionInProgress.value = true;
  try {
    const result = await api.bulkWebhookInboxAction({
      messageIds: Array.from(selectedMessageIds.value),
      action: starred ? 'star' : 'unstar'
    });
    addToast({ title: 'Success', message: `${starred ? 'Starred' : 'Unstarred'} ${result.success} messages` });
    inboxMessages.value.forEach((m) => {
      if (selectedMessageIds.value.has(m.id)) m.isStarred = starred;
    });
    clearSelection();
  } catch (err) {
    addToast({ title: 'Error', message: `Failed to ${starred ? 'star' : 'unstar'} messages` });
  } finally {
    bulkActionInProgress.value = false;
  }
}

// ==================== Labels ====================

async function createLabel() {
  if (!newLabelForm.name.trim()) return;
  try {
    const label = await api.createWebhookLabel({
      name: newLabelForm.name.trim(),
      color: newLabelForm.color
    });
    webhookLabels.value.push(label);
    newLabelForm.name = '';
    newLabelForm.color = '#4a90d9';
    addToast({ title: 'Success', message: 'Label created' });
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to create label' });
  }
}

async function updateLabel() {
  if (!labelToEdit.value) return;
  try {
    const updated = await api.updateWebhookLabel(labelToEdit.value.id, {
      name: labelToEdit.value.name,
      color: labelToEdit.value.color
    });
    const index = webhookLabels.value.findIndex((l) => l.id === updated.id);
    if (index >= 0) {
      webhookLabels.value[index] = updated;
    }
    labelToEdit.value = null;
    addToast({ title: 'Success', message: 'Label updated' });
    // Refresh inbox to update label displays
    await loadInbox();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to update label' });
  }
}

async function deleteLabel(label: WebhookMessageLabel) {
  if (!confirm(`Delete label "${label.name}"? This will remove it from all messages.`)) return;
  try {
    await api.deleteWebhookLabel(label.id);
    webhookLabels.value = webhookLabels.value.filter((l) => l.id !== label.id);
    addToast({ title: 'Success', message: 'Label deleted' });
    await loadInbox();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to delete label' });
  }
}

// Webhook Settings
function openWebhookSettings() {
  webhookSettingsForm.webhookId = webhooks.value[0]?.id ?? '';
  if (webhookSettingsForm.webhookId) {
    const hook = webhooks.value.find((w) => w.id === webhookSettingsForm.webhookId);
    webhookSettingsForm.mergeWindowSeconds = hook?.mergeWindowSeconds ?? 10;
    webhookSettingsForm.autoMerge = hook?.autoMerge ?? false;
  }
  showWebhookSettings.value = true;
}

function onWebhookSettingsSelect() {
  const hook = webhooks.value.find((w) => w.id === webhookSettingsForm.webhookId);
  webhookSettingsForm.mergeWindowSeconds = hook?.mergeWindowSeconds ?? 10;
  webhookSettingsForm.autoMerge = hook?.autoMerge ?? false;
}

async function saveWebhookSettings() {
  if (!webhookSettingsForm.webhookId) return;
  savingWebhookSettings.value = true;
  try {
    const updated = await api.updateInboundWebhook(webhookSettingsForm.webhookId, {
      mergeWindowSeconds: webhookSettingsForm.mergeWindowSeconds,
      autoMerge: webhookSettingsForm.autoMerge
    });
    // Update local webhook data
    const idx = webhooks.value.findIndex((w) => w.id === updated.id);
    if (idx >= 0) {
      webhooks.value[idx] = updated;
    }
    showWebhookSettings.value = false;
    addToast({ title: 'Success', message: 'Webhook settings saved' });
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to save webhook settings' });
  } finally {
    savingWebhookSettings.value = false;
  }
}

async function setMessageLabels(messageId: string, labelIds: string[]) {
  try {
    await api.setWebhookMessageLabels(messageId, labelIds);
    // Refresh inbox to show updated labels
    await loadInbox();
    if (selectedMessage.value?.id === messageId) {
      const full = await api.fetchInboundWebhookMessage(messageId);
      selectedMessage.value = full;
    }
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to update labels' });
  }
}

function getMessageLabelIds(message: InboundWebhookMessage): string[] {
  return message.labels?.map((l) => l.id) ?? [];
}

// ==================== Inline Label Management ====================

function showLabelInput(messageId: string) {
  labelInputMessageId.value = messageId;
  labelInputValue.value = '';
}

function closeLabelInput() {
  labelInputMessageId.value = null;
  labelInputValue.value = '';
}

async function submitLabelInput(message: InboundWebhookMessage) {
  const name = labelInputValue.value.trim();
  if (!name) {
    closeLabelInput();
    return;
  }

  try {
    // Find or create the label by name
    const label = await api.findOrCreateWebhookLabel(name);

    // Add label to message if not already present
    const currentIds = getMessageLabelIds(message);
    if (!currentIds.includes(label.id)) {
      await setMessageLabels(message.id, [...currentIds, label.id]);
    }

    // Refresh labels list to include any newly created label
    await loadLabels();
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to add label' });
  }

  closeLabelInput();
}

async function removeLabel(message: InboundWebhookMessage, labelId: string) {
  const currentIds = getMessageLabelIds(message);
  await setMessageLabels(message.id, currentIds.filter((id) => id !== labelId));
}

function sortedLabels(labels: WebhookMessageLabel[] | undefined): WebhookMessageLabel[] {
  if (!labels) return [];
  return [...labels].sort((a, b) => a.name.localeCompare(b.name));
}

function getLabelStyle(color: string): Record<string, string> {
  // Calculate perceived brightness to determine text color
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = brightness > 128 ? '#1e293b' : '#ffffff';

  return {
    backgroundColor: color,
    color: textColor
  };
}

// Close label input when clicking outside
function handleGlobalClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.label-add-wrapper')) {
    closeLabelInput();
  }
}

// ==================== Message Merging ====================

function openMergeModal() {
  if (selectedMessageIds.value.size < 2) {
    addToast({ title: 'Warning', message: 'Select at least 2 messages to combine' });
    return;
  }
  // Order by receivedAt (chronological)
  const selectedMsgs = inboxMessages.value
    .filter((m) => selectedMessageIds.value.has(m.id))
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  mergeOrdering.value = selectedMsgs.map((m) => m.id);
  showMergeModal.value = true;
}

function closeMergeModal() {
  showMergeModal.value = false;
  mergeOrdering.value = [];
  aiSortApplied.value = false;
  aiSortResult.value = null;
}

async function sortWithAi() {
  if (sortingWithAi.value || mergeOrdering.value.length < 2) return;

  sortingWithAi.value = true;
  aiSortApplied.value = false;
  aiSortResult.value = null;

  try {
    // Build segments array from current merge ordering
    // Only send essential content to minimize token usage
    const segments = mergeOrdering.value.map((id) => {
      const msg = getMergeMessage(id);
      // Extract only the content field, not the entire payload with redundant crashReport data
      const text = msg ? getCrashReportText(msg) : '';
      return { id, text: text || '' };
    });

    const result = await api.sortCrashSegments(segments);
    aiSortResult.value = result;

    // Apply the AI-suggested ordering (this excludes removed segments)
    mergeOrdering.value = result.orderedIds;
    aiSortApplied.value = true;

    // Delete redundant messages identified by AI
    const removeIds = result.removeIds ?? [];
    if (removeIds.length > 0) {
      for (const id of removeIds) {
        try {
          await api.deleteInboundWebhookMessage(id);
          // Remove from local state
          inboxMessages.value = inboxMessages.value.filter((m) => m.id !== id);
          inboxTotal.value = Math.max(0, inboxTotal.value - 1);
        } catch (err) {
          console.error(`Failed to delete redundant message ${id}:`, err);
        }
      }
    }

    // Build toast message
    const removedCount = removeIds.length;
    const toastMessage = removedCount > 0
      ? `Confidence: ${Math.round(result.confidence * 100)}% | Deleted ${removedCount} redundant segment${removedCount > 1 ? 's' : ''}`
      : `Confidence: ${Math.round(result.confidence * 100)}%`;

    addToast({
      title: 'Sorted with AI',
      message: toastMessage
    });
  } catch (error) {
    console.error('Failed to sort with AI:', error);
    addToast({
      title: 'AI Sorting Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      variant: 'error'
    });
  } finally {
    sortingWithAi.value = false;
  }
}

function moveMergeItem(index: number, direction: 'up' | 'down') {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= mergeOrdering.value.length) return;
  const items = [...mergeOrdering.value];
  [items[index], items[newIndex]] = [items[newIndex], items[index]];
  mergeOrdering.value = items;
}

function onMergeDragStart(event: DragEvent, index: number) {
  draggedMergeIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
  }
}

function onMergeDragOver(event: DragEvent, index: number) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverMergeIndex.value = index;
}

function onMergeDragLeave() {
  dragOverMergeIndex.value = null;
}

function onMergeDrop(event: DragEvent, targetIndex: number) {
  event.preventDefault();
  const sourceIndex = draggedMergeIndex.value;
  if (sourceIndex === null || sourceIndex === targetIndex) {
    dragOverMergeIndex.value = null;
    return;
  }
  const items = [...mergeOrdering.value];
  const [removed] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, removed);
  mergeOrdering.value = items;
  dragOverMergeIndex.value = null;
}

function onMergeDragEnd() {
  draggedMergeIndex.value = null;
  dragOverMergeIndex.value = null;
}

function getMergeMessage(id: string) {
  return inboxMessages.value.find((m) => m.id === id);
}

function getMergePreviewText(id: string): string {
  const message = getMergeMessage(id);
  if (!message) return '';
  const text = getCrashReportText(message);
  if (!text) return '(No crash report text)';
  // Return first ~500 chars, preserving line breaks
  const maxLen = 500;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function getMergedPreviewText(): string {
  const parts: string[] = [];
  mergeOrdering.value.forEach((id) => {
    const message = getMergeMessage(id);
    if (!message) return;
    const text = getCrashReportText(message);
    if (text) {
      parts.push(text);
    }
  });
  return parts.join('\n');
}

function openMergePreview() {
  showMergeModal.value = false;
  showMergePreview.value = true;
}

function closeMergePreview() {
  showMergePreview.value = false;
}

function backToMergeOrder() {
  showMergePreview.value = false;
  showMergeModal.value = true;
}

function cancelMergeAll() {
  showMergePreview.value = false;
  showMergeModal.value = false;
  mergeOrdering.value = [];
}

async function copyMergedPreview() {
  const text = getMergedPreviewText();
  await navigator.clipboard.writeText(text);
  addToast({ title: 'Copied', message: 'Combined report copied to clipboard' });
}

async function confirmMerge() {
  if (mergeOrdering.value.length < 2) return;
  mergingMessages.value = true;
  try {
    const combinedText = getMergedPreviewText();
    const merged = await api.mergeWebhookMessages(mergeOrdering.value, combinedText);
    addToast({ title: 'Success', message: `Combined ${mergeOrdering.value.length} messages` });
    showMergePreview.value = false;
    showMergeModal.value = false;
    mergeOrdering.value = [];
    clearSelection();
    await loadInbox();
    // Open the newly merged message
    await openMessage(merged);
  } catch (err) {
    addToast({ title: 'Error', message: 'Failed to combine messages' });
  } finally {
    mergingMessages.value = false;
  }
}

async function retryCrashReview(message: InboundWebhookMessage) {
  retryingCrashId.value = message.id;

  // Find the crash review action from the webhook to use for the optimistic run
  const crashAction = message.webhook?.actions?.find((a) => a.type === 'CRASH_REVIEW');

  // Optimistically add a pending run with current timestamp so the timer resets immediately
  const optimisticRun = {
    id: `optimistic-${Date.now()}`,
    messageId: message.id,
    actionId: crashAction?.id || '',
    status: 'PENDING_REVIEW' as const,
    createdAt: new Date().toISOString(),
    action: crashAction
  };

  // Update selectedMessage immediately
  if (selectedMessage.value?.id === message.id) {
    const currentRuns = selectedMessage.value.actionRuns || [];
    selectedMessage.value = {
      ...selectedMessage.value,
      actionRuns: [...currentRuns, optimisticRun] as typeof currentRuns
    };
  }

  // Update inbox list immediately
  const inboxIndex = inboxMessages.value.findIndex((item) => item.id === message.id);
  if (inboxIndex >= 0) {
    const currentRuns = inboxMessages.value[inboxIndex].actionRuns || [];
    inboxMessages.value[inboxIndex] = {
      ...inboxMessages.value[inboxIndex],
      actionRuns: [...currentRuns, optimisticRun] as typeof currentRuns
    };
  }

  try {
    const updated = await api.retryCrashReview(message.id);
    selectedMessage.value = updated;
    const index = inboxMessages.value.findIndex((item) => item.id === updated.id);
    if (index >= 0) {
      inboxMessages.value[index] = { ...inboxMessages.value[index], ...updated };
    }
  } finally {
    retryingCrashId.value = null;
  }
}

async function toggleArchive(message: InboundWebhookMessage) {
  const archived = !message.archivedAt;
  const updated = await api.archiveInboundWebhookMessage(message.id, archived);
  if (!inboxFilters.includeArchived && archived) {
    inboxMessages.value = inboxMessages.value.filter((item) => item.id !== message.id);
    inboxTotal.value = Math.max(0, inboxTotal.value - 1);
    return;
  }
  const index = inboxMessages.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) {
    inboxMessages.value[index] = { ...inboxMessages.value[index], ...updated };
  }
}

async function deleteMessage(message: InboundWebhookMessage) {
  const confirmed = window.confirm('Delete this webhook message permanently?');
  if (!confirmed) return;
  await api.deleteInboundWebhookMessage(message.id);
  inboxMessages.value = inboxMessages.value.filter((item) => item.id !== message.id);
  inboxTotal.value = Math.max(0, inboxTotal.value - 1);
}

function closeMessage() {
  selectedMessage.value = null;
  showPromptModal.value = false;
  if (messagePollTimer) {
    clearInterval(messagePollTimer);
    messagePollTimer = null;
  }
}

watch(
  () => [
    inboxFilters.webhookId,
    inboxFilters.status,
    inboxFilters.pageSize,
    inboxFilters.includeArchived,
    inboxFilters.readStatus,
    inboxFilters.starred,
    inboxFilters.labelId
  ],
  () => {
    inboxFilters.page = 1;
    loadInbox();
    loadUnreadCount();
  }
);

// Helper function to open a message by ID from URL
let openingMessageId: string | null = null;

async function openMessageFromUrl(messageId: string) {
  // Prevent duplicate processing
  if (openingMessageId === messageId) {
    console.log('[Webhook Inbox] Already opening message:', messageId);
    return;
  }
  // Don't reopen if already viewing this message
  if (selectedMessage.value?.id === messageId) {
    console.log('[Webhook Inbox] Already viewing message:', messageId);
    return;
  }

  console.log('[Webhook Inbox] Opening message from URL:', messageId);
  openingMessageId = messageId;
  activeTab.value = 'inbox';
  showPromptModal.value = false;

  try {
    // Fetch the message
    const message = await api.fetchInboundWebhookMessage(messageId);
    console.log('[Webhook Inbox] Fetched message:', message ? 'success' : 'null/undefined');

    // Check if we're still trying to open this message (not cancelled)
    if (openingMessageId !== messageId) {
      console.log('[Webhook Inbox] Opening was cancelled for:', messageId);
      return;
    }

    if (message) {
      // Set the selected message
      selectedMessage.value = message;
      console.log('[Webhook Inbox] Set selectedMessage.value to:', selectedMessage.value?.id);

      // Start polling if pending
      if (getPendingRun(message)) {
        startMessagePolling(message.id);
      }

      // Auto-mark as read (don't await to avoid blocking)
      if (!message.isRead) {
        api.markWebhookMessageRead(message.id, true).then(() => {
          if (selectedMessage.value?.id === message.id) {
            selectedMessage.value.isRead = true;
          }
          const index = inboxMessages.value.findIndex((m) => m.id === message.id);
          if (index >= 0) {
            inboxMessages.value[index].isRead = true;
          }
          unreadCount.value = Math.max(0, unreadCount.value - 1);
        }).catch((err) => {
          console.error('Failed to mark message as read:', err);
        });
      }

      // Don't clear URL - let the messageId persist
      await nextTick();
      console.log('[Webhook Inbox] Modal should now be visible, selectedMessage:', selectedMessage.value?.id);
    }
  } catch (err) {
    console.warn('[Webhook Inbox] Failed to load message from URL:', err);
  } finally {
    if (openingMessageId === messageId) {
      openingMessageId = null;
    }
  }
}

// Watch for messageId query param changes
let processingUrlMessage = false;
watch(
  () => route.query.messageId,
  async (messageId, oldMessageId) => {
    if (processingUrlMessage) {
      console.log('[Webhook Inbox] Watcher: skipping, already processing');
      return;
    }

    const id = Array.isArray(messageId) ? messageId[0] : messageId;
    console.log('[Webhook Inbox] Watcher: messageId changed from', oldMessageId, 'to', messageId);

    // Only open modal if there's a new messageId (not when clearing)
    if (id && typeof id === 'string') {
      console.log('[Webhook Inbox] Watcher detected messageId:', id, 'componentReady:', componentReady.value);
      processingUrlMessage = true;
      try {
        if (componentReady.value) {
          await openMessageFromUrl(id);
        } else {
          // Queue it for when component is ready
          pendingMessageId.value = id;
        }
      } finally {
        processingUrlMessage = false;
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  await refreshAll();
  nowTimer = setInterval(() => {
    nowTs.value = Date.now();
  }, 1000);

  // Add global click handler to close label dropdown
  document.addEventListener('click', handleGlobalClick);

  // Start processing status polling if auto-merge is active
  if (isAutoMergeActive.value) {
    startProcessingStatusPolling();
  }

  // Mark component as ready and process any pending messageId
  componentReady.value = true;
  if (pendingMessageId.value) {
    const id = pendingMessageId.value;
    pendingMessageId.value = null;
    console.log('[Webhook Inbox] Processing pending messageId:', id);
    await openMessageFromUrl(id);
  }
});

onBeforeUnmount(() => {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  if (inboxPollTimer) {
    clearInterval(inboxPollTimer);
    inboxPollTimer = null;
  }
  if (messagePollTimer) {
    clearInterval(messagePollTimer);
    messagePollTimer = null;
  }
  stopProcessingStatusPolling();
  document.removeEventListener('click', handleGlobalClick);
});

// ============================================================================
// Crash Report Inspector
// ============================================================================

function openCrashInspector() {
  if (!selectedMessage.value) return;
  const crashText = getCrashReportText(selectedMessage.value);
  if (!crashText) return;

  inspectorCrashText.value = crashText;
  inspectorResult.value = null;
  inspectorError.value = null;
  showCrashInspector.value = true;
}

function closeCrashInspector() {
  showCrashInspector.value = false;
  inspectorResult.value = null;
  inspectorError.value = null;
  inspectorCrashText.value = '';
  inspectorTooltip.visible = false;
}

function handleHighlightHover(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.classList.contains('inspector-highlight')) {
    return;
  }

  const tooltip = target.getAttribute('data-tooltip');
  const category = target.getAttribute('data-category') || '';
  const severity = target.classList.contains('highlight--critical')
    ? 'critical'
    : target.classList.contains('highlight--important')
    ? 'important'
    : 'info';

  if (!tooltip) return;

  // Get position of the highlight element
  const rect = target.getBoundingClientRect();

  // Position tooltip above the highlight, centered horizontally
  inspectorTooltip.text = tooltip;
  inspectorTooltip.category = category;
  inspectorTooltip.severity = severity;
  inspectorTooltip.x = rect.left + rect.width / 2;
  inspectorTooltip.y = rect.top - 8;
  inspectorTooltip.visible = true;
}

function handleHighlightLeave(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.classList.contains('inspector-highlight')) {
    inspectorTooltip.visible = false;
  }
}

async function runCrashInspection() {
  if (!inspectorCrashText.value) return;

  inspectorLoading.value = true;
  inspectorError.value = null;

  try {
    const result = await api.inspectCrashReport(inspectorCrashText.value);
    inspectorResult.value = result;
  } catch (err) {
    inspectorError.value = err instanceof Error ? err.message : 'Failed to inspect crash report';
  } finally {
    inspectorLoading.value = false;
  }
}

const highlightedReportHtml = computed(() => {
  if (!inspectorResult.value || !inspectorCrashText.value) {
    return escapeHtml(inspectorCrashText.value || '');
  }

  const text = inspectorCrashText.value;
  const highlights = inspectorResult.value.highlights;

  if (highlights.length === 0) {
    return escapeHtml(text);
  }

  // Sort highlights by startIndex to ensure proper ordering
  const sortedHighlights = [...highlights].sort((a, b) => a.startIndex - b.startIndex);

  // Build the highlighted HTML
  const parts: string[] = [];
  let lastIndex = 0;

  for (const h of sortedHighlights) {
    // Skip highlights with invalid positions
    if (h.startIndex < 0 || h.startIndex >= text.length) {
      console.warn('Invalid highlight position:', h);
      continue;
    }

    // Skip if this highlight starts before where we've already processed
    if (h.startIndex < lastIndex) {
      console.warn('Overlapping highlight skipped:', h);
      continue;
    }

    // Add text before this highlight
    if (h.startIndex > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, h.startIndex)));
    }

    // Add the highlighted span with tooltip
    const highlightText = text.slice(h.startIndex, h.endIndex);
    const escapedText = escapeHtml(highlightText);
    const escapedComment = escapeHtml(h.comment).replace(/"/g, '&quot;');
    const severityClass = `highlight--${h.severity}`;
    parts.push(
      `<span class="inspector-highlight ${severityClass}" data-tooltip="${escapedComment}" data-category="${h.category}">${escapedText}</span>`
    );

    lastIndex = h.endIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.join('');
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

</script>

<style scoped>
.webhook-admin {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.section-header__titles h1 {
  margin: 0;
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.section-header__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.webhook-stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.stat-card {
  flex: 1 1 180px;
  max-width: 220px;
  padding: 1.25rem 1.5rem;
  border-radius: 1rem;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.75));
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.45);
}

.stat-card--accent {
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18));
}

.stat-card--danger {
  background: linear-gradient(160deg, rgba(248, 113, 113, 0.2), rgba(244, 63, 94, 0.16));
}

.stat-card__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(226, 232, 240, 0.7);
  order: 2;
}

.stat-card__value {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #f8fafc;
  line-height: 1;
  order: 1;
}

.tabs {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tab {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid transparent;
  color: #e2e8f0;
  padding: 0.5rem 1.2rem;
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tab--active {
  border-color: rgba(59, 130, 246, 0.6);
  background: rgba(59, 130, 246, 0.18);
}

.btn {
  border-radius: 999px;
  padding: 0.55rem 1.2rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.75);
  color: #e2e8f0;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.35);
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.4);
}

.btn:active:not(:disabled) {
  transform: translateY(0);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.btn--accent {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.9));
  border-color: rgba(59, 130, 246, 0.7);
  color: #f8fafc;
}

.btn--outline {
  background: rgba(15, 23, 42, 0.65);
  border-color: rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--danger {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.9), rgba(244, 63, 94, 0.85));
  border-color: rgba(248, 113, 113, 0.7);
  color: #fff1f2;
}

.btn--success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.85));
  border-color: rgba(34, 197, 94, 0.7);
  color: #f0fdf4;
}

.btn--small {
  padding: 0.4rem 0.9rem;
  font-size: 0.75rem;
}

.card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card--panel {
  border-style: dashed;
}

.card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.card__header--stack {
  flex-direction: column;
  align-items: flex-start;
}

.card__header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.webhook-card {
  border-color: rgba(59, 130, 246, 0.2);
}

.webhook-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  align-items: center;
}

.endpoint-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 1.5rem;
}

.endpoint-details__column {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.detail-panel {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.95rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-panel__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 1rem;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-badges {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-icon {
  width: 1.4rem;
  height: 1.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  background: rgba(59, 130, 246, 0.15);
  color: rgba(147, 197, 253, 0.9);
  font-size: 0.9rem;
  font-weight: 700;
}

.panel-header h4 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.url-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.url-input {
  flex: 1;
  font-size: 0.85rem;
}

.endpoint-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.endpoint-item {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  padding: 0.9rem 1rem;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.12s ease;
}

.endpoint-item:hover {
  border-color: rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.3);
}

.endpoint-item--active {
  border-color: rgba(59, 130, 246, 0.7);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.endpoint-item__title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.endpoint-item__chevron {
  margin-top: 0.35rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.8);
}

.label {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

/* Inbox title row */
.inbox-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.inbox-title-row h2 {
  margin: 0;
}

.auto-merge-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 9999px;
}

.auto-merge-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.processing-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 9999px;
}

.processing-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  background: #f59e0b;
  border-radius: 50%;
  animation: pulse-dot 1s ease-in-out infinite;
}

/* Inbox filter layout */
.inbox-filters {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inbox-filters__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.inbox-filters__row--secondary {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  align-items: center;
}

.inbox-filters__toggles {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  margin-left: auto;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.85);
  white-space: nowrap;
}

.filter-toggle input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.filter-toggle span {
  font-size: 0.8rem;
  text-transform: none;
  letter-spacing: normal;
}

.form-field--compact {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 130px;
}

.form-field--compact span {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(148, 163, 184, 0.8);
}

.select--small {
  padding: 0.4rem 0.6rem;
  min-width: 70px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input,
.select,
.textarea {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.4), 0 6px 20px rgba(15, 23, 42, 0.25);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.12s ease;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.7);
  box-shadow:
    0 0 0 3px rgba(59, 130, 246, 0.25),
    inset 0 0 0 1px rgba(15, 23, 42, 0.4);
}

.input::placeholder {
  color: rgba(148, 163, 184, 0.7);
}

.select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, rgba(148, 163, 184, 0.8) 50%),
    linear-gradient(135deg, rgba(148, 163, 184, 0.8) 50%, transparent 50%),
    linear-gradient(to right, rgba(148, 163, 184, 0.15), rgba(148, 163, 184, 0.15));
  background-position:
    calc(100% - 20px) calc(50% - 3px),
    calc(100% - 14px) calc(50% - 3px),
    calc(100% - 2.4rem) 50%;
  background-size: 6px 6px, 6px 6px, 1px 60%;
  background-repeat: no-repeat;
  padding-right: 2.8rem;
}

.select--compact {
  padding: 0.4rem 0.6rem;
  font-size: 0.75rem;
  min-width: 160px;
}

input[type='checkbox'] {
  appearance: none;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.85);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.12s ease;
}

input[type='checkbox']::after {
  content: '';
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 0.2rem;
  background: rgba(59, 130, 246, 0.9);
  transform: scale(0);
  transition: transform 0.15s ease;
}

input[type='checkbox']:checked {
  border-color: rgba(59, 130, 246, 0.7);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

input[type='checkbox']:checked::after {
  transform: scale(1);
}

.form-field--inline {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.form-field--tight {
  margin: 0;
}

.form-field span {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

.input-with-suffix {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-with-suffix .input {
  flex: 1;
  max-width: 100px;
}

.input-suffix {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
}

.form-hint {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
  line-height: 1.4;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.actions__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-row {
  background: rgba(30, 41, 59, 0.4);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.action-row__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-row__actions {
  display: flex;
  gap: 0.5rem;
}

.action-create {
  border-top: 1px dashed rgba(148, 163, 184, 0.2);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card--table {
  padding: 0;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 0.85rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.table__actions {
  text-align: right;
}

.table-action-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.icon-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.7);
  color: rgba(226, 232, 240, 0.9);
  border-radius: 0.6rem;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.12s ease;
}

.icon-button:hover {
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.3);
  transform: translateY(-1px);
}

.icon-button svg {
  width: 1rem;
  height: 1rem;
}

.icon-button--danger {
  border-color: rgba(248, 113, 113, 0.5);
  color: rgba(248, 113, 113, 0.9);
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pending-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(147, 197, 253, 0.9);
}

.summary-line {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.9);
}

/* Actions Column */
.actions-cell {
  min-width: 200px;
  max-width: 350px;
}

.action-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.action-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
}

.action-pill--success {
  background-color: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.action-pill--failed {
  background-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.action-pill--pending {
  background-color: rgba(234, 179, 8, 0.2);
  color: #facc15;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

/* Animated racing light border for pending actions */
.action-pill-wrapper {
  position: relative;
  display: inline-flex;
}

.action-pill-wrapper .action-pill {
  position: relative;
  z-index: 2;
  border: 1px solid rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.15);
}

.action-pill-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
  overflow: visible;
}

.action-pill-border rect {
  fill: none;
  stroke: #fef08a;
  stroke-width: 2.5;
  stroke-dasharray: 25 225;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px #facc15) drop-shadow(0 0 8px rgba(250, 204, 21, 0.6));
  animation: dash-travel 2s linear infinite;
}

@keyframes dash-travel {
  from {
    stroke-dashoffset: 250;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.action-pill--skipped {
  background-color: rgba(249, 115, 22, 0.2);
  color: #fb923c;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

.action-pill--not-run {
  background-color: rgba(148, 163, 184, 0.15);
  color: rgba(148, 163, 184, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.crash-summary-text {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  line-height: 1.35;
  color: #e2e8f0;
  width: 100%;
}

.result-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

/* Token Usage Visualization */
.token-usage {
  margin: 0.75rem 0;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.token-usage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.token-usage__title {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(226, 232, 240, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.token-usage__warning {
  font-size: 0.7rem;
  font-weight: 600;
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.token-usage__bar-container {
  margin-bottom: 0.5rem;
}

.token-usage__bar {
  display: flex;
  height: 8px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 4px;
  overflow: hidden;
}

.token-usage__segment {
  height: 100%;
  transition: width 0.3s ease;
}

.token-usage__segment--thinking {
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}

.token-usage__segment--output {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.token-usage__details {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.8);
}

.token-usage__stat {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.token-usage__stat--budget {
  margin-left: auto;
  color: rgba(148, 163, 184, 0.7);
}

.token-usage__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.token-usage__dot--thinking {
  background: #a78bfa;
}

.token-usage__dot--output {
  background: #4ade80;
}

.token-usage__input-row {
  display: flex;
  gap: 0.35rem;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.6);
  margin-top: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.token-usage__input-label {
  color: rgba(148, 163, 184, 0.5);
}

.assign-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.spinner {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  border: 2px solid rgba(148, 163, 184, 0.35);
  border-top-color: rgba(59, 130, 246, 0.9);
  animation: spin 0.9s linear infinite;
}

.result-json {
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0.6rem;
  font-size: 0.75rem;
  white-space: pre-wrap;
  color: rgba(226, 232, 240, 0.9);
}

.badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem;
}

.pagination__meta {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.7);
}

.pagination__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.pagination__button {
  padding: 0.35rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.5);
  color: rgba(226, 232, 240, 0.85);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.pagination__button:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.7);
  background: rgba(30, 41, 59, 0.6);
}

.pagination__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination__button--active {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.6);
  color: #e2e8f0;
  cursor: default;
}

.pagination__ellipsis {
  padding: 0 0.5rem;
  color: rgba(148, 163, 184, 0.8);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 13, 23, 0.76);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 1200;
}

.modal {
  background: rgba(15, 23, 42, 0.95);
  border-radius: 1rem;
  padding: 1.5rem;
  width: min(960px, 96vw);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal--wide {
  width: min(1100px, 96vw);
}

.modal--settings {
  width: min(520px, 96vw);
}

/* Settings Modal Styles */
.settings-modal-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: 70vh;
  overflow-y: auto;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-section--selector {
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.settings-section--global {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(30, 41, 59, 0.6) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.settings-section--global .settings-section-header {
  margin-bottom: 0.75rem;
}

.settings-section--global .settings-section-title {
  color: #60a5fa;
}

.settings-field--prominent {
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.settings-field--prominent .settings-field-hint {
  color: #94a3b8;
}

.settings-server-id {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 0.375rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.settings-server-id-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.settings-server-id-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: #60a5fa;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

.settings-info-banner {
  display: flex;
  gap: 1.5rem;
  padding: 0.875rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.settings-info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.settings-info-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #94a3b8);
}

.settings-info-value {
  font-size: 0.875rem;
  font-weight: 500;
}

.settings-section-header {
  margin-bottom: 0.25rem;
}

.settings-section-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  color: var(--color-text, #f1f5f9);
}

.settings-section-description {
  font-size: 0.8rem;
  color: var(--color-text-muted, #94a3b8);
  margin: 0;
  line-height: 1.4;
}

.settings-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: rgba(30, 41, 59, 0.3);
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.settings-field {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.settings-field--toggle {
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  /* Debug: make toggle section more visible */
  margin-top: 1rem;
}

.settings-field--toggle:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.settings-field--toggle:first-child {
  padding-top: 0;
}

.settings-field-main {
  flex: 1;
  min-width: 0;
}

.settings-field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #f1f5f9);
  display: block;
  margin-bottom: 0.25rem;
}

.settings-field-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
  margin: 0;
  line-height: 1.4;
}

.settings-field-control {
  flex-shrink: 0;
}

.settings-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
}

.settings-empty-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  opacity: 0.5;
}

.settings-empty-state p {
  margin: 0;
  font-size: 0.875rem;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(148, 163, 184, 0.3);
  border-radius: 24px;
  transition: background-color 0.2s ease;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-primary, #4a90d9);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input:focus + .toggle-slider {
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.3);
}

.toggle-with-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
}

.toggle-status {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.toggle-status--enabled {
  color: var(--color-success, #22c55e);
}

.toggle-status--disabled {
  color: var(--color-danger, #ef4444);
}

/* Compact input */
.input--compact {
  width: 70px;
  text-align: center;
}

/* Text utilities */
.text-success {
  color: var(--color-success, #22c55e);
}

.text-muted {
  color: var(--color-text-muted, #94a3b8);
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.modal__header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal__content {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.modal__content--split {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  height: calc(90vh - 6rem);
  overflow: hidden;
}

.payload-block {
  background: rgba(30, 41, 59, 0.4);
  border-radius: 0.75rem;
  padding: 1rem;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.crash-pane,
.llm-pane {
  min-height: 0;
}

.crash-pane .crash-report {
  white-space: pre-wrap;
  font-size: 0.85rem;
  flex: 1;
  overflow: auto;
  min-height: 0;
  max-height: none !important;
}

.llm-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.crash-pane .result-actions,
.llm-pane .result-actions {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  flex-shrink: 0;
}

.llm-loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
}

.llm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1rem;
  flex: 1;
}

.spinner--large {
  width: 1.5rem;
  height: 1.5rem;
  border-width: 3px;
}

.llm-summary {
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.llm-section {
  margin-top: 0.75rem;
}

.llm-section h5 {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.9);
}

.llm-error {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.llm-section ul {
  margin: 0;
  padding-left: 1rem;
}

.llm-sublist {
  margin-top: 0.35rem;
  color: rgba(226, 232, 240, 0.85);
}

.raw-block pre {
  max-height: 220px;
  overflow: auto;
}

.raw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.modal-backdrop .payload-block pre {
  max-height: 60vh;
  overflow: auto;
}

.payload-block pre {
  white-space: pre-wrap;
  font-size: 0.85rem;
  color: #e2e8f0;
}

.action-run-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-run__label {
  margin-left: 0.5rem;
}

.error {
  color: #f87171;
  margin: 0.4rem 0 0;
}

@media (max-width: 720px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .endpoint-details {
    grid-template-columns: 1fr;
  }

  .modal__content--split {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Tab badge for unread count */
.tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  margin-left: 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
}

/* Bulk actions toolbar */
.bulk-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: linear-gradient(140deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.1));
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.5rem;
}

.bulk-actions-bar__count {
  font-weight: 600;
  color: #93c5fd;
}

.bulk-actions-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Table checkbox and star columns */
.table__checkbox-col {
  width: 40px;
  text-align: center;
}

.table__star-col {
  width: 40px;
  text-align: center;
}

.star-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: #94a3b8;
  transition: color 0.15s;
}

.star-button:hover {
  color: #fbbf24;
}

.star-button--active {
  color: #fbbf24;
}

.star-button svg {
  width: 18px;
  height: 18px;
}

/* Unread row styling */
.inbox-row--unread {
  background: rgba(59, 130, 246, 0.08);
}

.inbox-row--unread td {
  font-weight: 500;
}

.inbox-row--archived {
  opacity: 0.6;
}

/* Pending Merge Group Placeholder */
.pending-group-row {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(30, 41, 59, 0.4) 100%);
  border: 2px dashed rgba(245, 158, 11, 0.4);
  animation: pendingGroupPulse 2s ease-in-out infinite;
}

@keyframes pendingGroupPulse {
  0%, 100% { background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(30, 41, 59, 0.4) 100%); }
  50% { background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(30, 41, 59, 0.5) 100%); }
}

.pending-group-placeholder {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
}

.pending-group-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(245, 158, 11, 0.2);
  border-radius: 50%;
  color: #fbbf24;
  flex-shrink: 0;
}

.pending-group-icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.pending-group-info {
  flex: 1;
  min-width: 0;
}

.pending-group-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.pending-group-count {
  font-weight: 600;
  color: #fbbf24;
}

.pending-group-key {
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.8rem;
}

.pending-group-timer {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.pending-group-timer strong {
  color: #fbbf24;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

.pending-group-actions {
  flex-shrink: 0;
}

/* Merge group visual styling */
.merge-group-row {
  background: rgba(99, 102, 241, 0.05);
}

.merge-group-row td:first-child {
  border-left: 3px solid rgba(99, 102, 241, 0.8) !important;
}

.merge-group-row td:last-child {
  border-right: 3px solid rgba(99, 102, 241, 0.8) !important;
}

.merge-group-row--first td {
  border-top: 3px solid rgba(99, 102, 241, 0.8) !important;
}

.merge-group-row--last td {
  /* No bottom border - the footer will provide it */
}

.merge-group-footer {
  background: rgba(99, 102, 241, 0.15);
}

.merge-group-footer td {
  padding: 0 !important;
  border: none !important;
  border-left: 3px solid rgba(99, 102, 241, 0.8) !important;
  border-right: 3px solid rgba(99, 102, 241, 0.8) !important;
  border-bottom: 3px solid rgba(99, 102, 241, 0.8) !important;
}

.merge-group-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
}

.merge-group-icon {
  font-size: 1.1rem;
}

.merge-group-text {
  flex: 1;
  font-size: 0.85rem;
  color: #a5b4fc;
  font-weight: 500;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: rgba(226, 232, 240, 0.7);
}

.btn--ghost:hover {
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.5);
  color: rgba(226, 232, 240, 0.9);
}

.text-bold {
  font-weight: 600;
}

/* Label chips */
.label-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}

.label-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.4rem;
  font-size: 0.7rem;
  font-weight: 500;
  border-radius: 999px;
  max-width: 120px;
  white-space: nowrap;
}

.label-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  margin-left: 0.1rem;
  font-size: 0.8rem;
  font-weight: bold;
  line-height: 1;
  color: inherit;
  background: rgba(0, 0, 0, 0.15);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.label-chip__remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.3);
}

.label-add-wrapper {
  position: relative;
}

.label-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 0.9rem;
  font-weight: bold;
  color: #64748b;
  background: rgba(100, 116, 139, 0.1);
  border: 1px dashed #475569;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.label-add-btn:hover {
  color: #94a3b8;
  background: rgba(100, 116, 139, 0.2);
  border-color: #64748b;
}

.label-input {
  width: 100px;
  padding: 0.2rem 0.4rem;
  font-size: 0.7rem;
  color: #e2e8f0;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 999px;
  outline: none;
  transition: border-color 0.15s;
}

.label-input:focus {
  border-color: #60a5fa;
}

.label-input::placeholder {
  color: #64748b;
}

.labels-cell {
  min-width: 100px;
}

/* Badge for merged messages */
.badge--info {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  margin-left: 0.5rem;
}

/* Merge modal */
.merge-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
  max-height: 50vh;
  overflow-y: auto;
}

.merge-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  cursor: grab;
  transition: border-color 0.15s, background 0.15s, opacity 0.15s;
}

.merge-item:active {
  cursor: grabbing;
}

.merge-item--dragging {
  opacity: 0.5;
  border-color: rgba(59, 130, 246, 0.5);
}

.merge-item--drag-over {
  border-color: rgba(59, 130, 246, 0.8);
  background: rgba(59, 130, 246, 0.15);
}

.merge-item__handle {
  color: rgba(148, 163, 184, 0.6);
  cursor: grab;
  flex-shrink: 0;
  padding-top: 0.2rem;
}

.merge-item__handle:active {
  cursor: grabbing;
}

.merge-item:hover .merge-item__handle {
  color: rgba(148, 163, 184, 0.9);
}

.merge-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.merge-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.merge-item__info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.merge-item__preview {
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(226, 232, 240, 0.7);
  background: rgba(15, 23, 42, 0.5);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.merge-item__info strong {
  color: #e2e8f0;
}

.merge-item__actions {
  display: flex;
  gap: 0.25rem;
}

.merge-warning {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 0.5rem;
  color: #fbbf24;
}

/* AI Sort button and banner */
.btn--ai {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn--ai .ai-icon {
  font-size: 1rem;
  color: #a78bfa;
}

.ai-loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(167, 139, 250, 0.3);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ai-sort-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.3);
  border-radius: 0.5rem;
  color: #c4b5fd;
  font-size: 0.9rem;
}

.ai-sort-banner .ai-icon {
  color: #a78bfa;
  font-size: 1.1rem;
}

.ai-sort-banner .ai-confidence {
  color: rgba(196, 181, 253, 0.7);
}

.ai-sort-banner .ai-removed {
  color: rgba(251, 191, 36, 0.9);
  font-weight: 500;
}

.ai-sort-banner .ai-reasoning {
  flex: 1;
  margin-left: 0.5rem;
  padding-left: 0.75rem;
  border-left: 1px solid rgba(167, 139, 250, 0.3);
}

/* Merge preview modal */
.merge-preview-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 0.75rem;
}

.merge-preview-content {
  flex: 1;
  overflow: auto;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 1rem;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(226, 232, 240, 0.85);
  min-height: 300px;
  max-height: calc(70vh - 10rem);
}

.merge-preview-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.merge-preview-footer .btn--outline {
  margin-right: auto;
}

/* Label manager modal */
.label-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.label-manager__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label-manager__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(30, 41, 59, 0.4);
  border-radius: 0.5rem;
}

.label-manager__item .label-chip {
  min-width: 100px;
}

.label-manager__create h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: #94a3b8;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.color-picker {
  width: 40px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}

.input--small {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}

.input--tiny {
  width: 60px;
  padding: 0.25rem 0.4rem;
  font-size: 0.85rem;
  text-align: center;
}

.test-options {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

/* ============================================================================
   Crash Report Inspector Modal
   ============================================================================ */

.modal--inspector {
  max-width: 1000px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal--inspector .modal__footer {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.modal__footer--centered {
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal__footer--settings {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.inspector-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.inspector-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 3rem;
  flex: 1;
  background: radial-gradient(ellipse at center, rgba(99, 102, 241, 0.05) 0%, transparent 70%);
}

.inspector-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  flex: 1;
}

.inspector-error .error-text {
  color: #f87171;
  text-align: center;
}

/* Elaborate AI Loading Animation */
.ai-loading-animation {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-loading-rings {
  position: absolute;
  inset: 0;
}

.ai-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid transparent;
}

.ai-ring--outer {
  inset: 0;
  border-top-color: rgba(99, 102, 241, 0.8);
  border-right-color: rgba(99, 102, 241, 0.3);
  animation: ring-spin 2s linear infinite;
}

.ai-ring--middle {
  inset: 15px;
  border-top-color: rgba(168, 85, 247, 0.8);
  border-left-color: rgba(168, 85, 247, 0.3);
  animation: ring-spin 1.5s linear infinite reverse;
}

.ai-ring--inner {
  inset: 30px;
  border-bottom-color: rgba(236, 72, 153, 0.8);
  border-right-color: rgba(236, 72, 153, 0.3);
  animation: ring-spin 1s linear infinite;
}

.ai-loading-icon {
  font-size: 2rem;
  color: #a78bfa;
  animation: icon-pulse 2s ease-in-out infinite;
  filter: drop-shadow(0 0 10px rgba(167, 139, 250, 0.5));
}

@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes icon-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

.ai-loading-text {
  text-align: center;
}

.ai-loading-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0 0 0.25rem;
}

.ai-loading-subtitle {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0;
}

.ai-loading-dots {
  display: flex;
  gap: 0.5rem;
}

.ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6366f1;
  animation: dot-bounce 1.4s ease-in-out infinite;
}

.ai-dot:nth-child(1) { animation-delay: 0s; }
.ai-dot:nth-child(2) { animation-delay: 0.2s; }
.ai-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.inspector-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.inspector-legend {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.highlight-sample {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.highlight-sample.highlight--critical {
  background-color: rgba(239, 68, 68, 0.4);
  border: 1px solid rgba(239, 68, 68, 0.6);
}

.highlight-sample.highlight--important {
  background-color: rgba(234, 179, 8, 0.4);
  border: 1px solid rgba(234, 179, 8, 0.6);
}

.highlight-sample.highlight--info {
  background-color: rgba(59, 130, 246, 0.4);
  border: 1px solid rgba(59, 130, 246, 0.6);
}

.legend-count {
  margin-left: auto;
  font-size: 0.8rem;
  color: #64748b;
}

.inspector-debug {
  padding: 0.5rem 1rem;
  background: rgba(30, 41, 59, 0.3);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  font-size: 0.75rem;
}

.inspector-debug summary {
  cursor: pointer;
  user-select: none;
}

.debug-list {
  margin: 0.5rem 0 0;
  padding-left: 1.5rem;
  list-style: disc;
}

.debug-item {
  margin: 0.25rem 0;
  font-family: monospace;
}

.inspector-report {
  flex: 1;
  overflow-x: hidden;
  overflow-y: scroll;
  margin: 0;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e2e8f0;
  position: relative;
}

.inspector-content {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Highlight styles - use :deep() for v-html content in scoped styles */
.inspector-report :deep(.inspector-highlight) {
  position: relative;
  cursor: help;
  border-radius: 3px;
  padding: 1px 3px;
  margin: 0 -1px;
  transition: filter 0.15s ease;
  display: inline;
}

.inspector-report :deep(.inspector-highlight:hover) {
  filter: brightness(1.3);
}

.inspector-report :deep(.inspector-highlight.highlight--critical) {
  background-color: rgba(239, 68, 68, 0.4);
  border-bottom: 2px solid rgba(239, 68, 68, 0.9);
  color: #fca5a5;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.3);
}

.inspector-report :deep(.inspector-highlight.highlight--important) {
  background-color: rgba(234, 179, 8, 0.4);
  border-bottom: 2px solid rgba(234, 179, 8, 0.9);
  color: #fde047;
  box-shadow: 0 0 4px rgba(234, 179, 8, 0.3);
}

.inspector-report :deep(.inspector-highlight.highlight--info) {
  background-color: rgba(59, 130, 246, 0.4);
  border-bottom: 2px solid rgba(59, 130, 246, 0.9);
  color: #93c5fd;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.3);
}

/* JS-positioned tooltip (renders outside scroll container) */
.inspector-tooltip {
  position: fixed;
  transform: translateX(-50%) translateY(-100%);
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #e2e8f0;
  white-space: normal;
  max-width: 300px;
  min-width: 150px;
  text-align: left;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 100000;
  pointer-events: none;
}

.inspector-tooltip .tooltip-category {
  color: #94a3b8;
  font-weight: 500;
  margin-right: 0.35rem;
}

.inspector-tooltip.tooltip--critical {
  border-color: rgba(239, 68, 68, 0.6);
}

.inspector-tooltip.tooltip--critical .tooltip-category {
  color: #fca5a5;
}

.inspector-tooltip.tooltip--important {
  border-color: rgba(234, 179, 8, 0.6);
}

.inspector-tooltip.tooltip--important .tooltip-category {
  color: #fde047;
}

.inspector-tooltip.tooltip--info {
  border-color: rgba(59, 130, 246, 0.6);
}

.inspector-tooltip.tooltip--info .tooltip-category {
  color: #93c5fd;
}

</style>
