<template>
  <section
    class="bosses-page"
    :class="{
      'bosses-page--detail': isDetail,
      'bosses-page--editing': isDetail && mode !== 'view'
    }"
  >
    <div class="bosses-page__atmosphere" aria-hidden="true"></div>

    <div v-if="loading" class="bosses-loading">
      <GlobalLoadingSpinner />
      <p>Opening the encounter library…</p>
    </div>

    <div v-else-if="loadError" class="bosses-error">
      <div class="bosses-error__icon" aria-hidden="true">!</div>
      <h1>Bosses could not be loaded</h1>
      <p>{{ loadError }}</p>
      <button type="button" class="boss-button boss-button--primary" @click="loadPage">
        Try again
      </button>
    </div>

    <template v-else-if="library">
      <template v-if="!isDetail">
        <header class="bosses-header">
          <div class="bosses-header__copy">
            <p class="bosses-eyebrow">{{ library.guild.name }} · Encounter library</p>
            <h1>Bosses</h1>
            <p class="bosses-header__intro">
              Strategies, mechanics, and raid notes organized for your guild.
            </p>
          </div>
          <div class="bosses-header__actions">
            <button
              v-if="permissions?.canManageContributors"
              type="button"
              class="boss-button boss-button--quiet"
              @click="openContributors"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M16 11h6" />
              </svg>
              Contributors
            </button>
            <button
              v-if="permissions?.canEdit"
              type="button"
              class="boss-button boss-button--quiet"
              @click="openGroups()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              Groups
            </button>
            <button
              v-if="permissions?.canEdit"
              type="button"
              class="boss-button boss-button--primary"
              :disabled="library.groups.length === 0"
              :title="
                library.groups.length === 0 ? 'Create a group before adding a boss.' : 'Add boss'
              "
              @click="openCreateBoss()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add boss
            </button>
          </div>
        </header>

        <div class="bosses-toolbar">
          <label class="boss-search">
            <span class="sr-only">Search bosses and groups</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input v-model="searchQuery" type="search" placeholder="Find a boss or group" />
            <button
              v-if="searchQuery"
              type="button"
              aria-label="Clear search"
              @click="searchQuery = ''"
            >
              ×
            </button>
          </label>
          <p class="bosses-count" aria-live="polite">
            <strong>{{ totalBosses }}</strong> {{ totalBosses === 1 ? 'boss' : 'bosses' }} in
            {{ library.groups.length }} {{ library.groups.length === 1 ? 'group' : 'groups' }}
          </p>
        </div>

        <div v-if="library.groups.length === 0" class="bosses-empty">
          <div class="bosses-empty__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path d="M18 48c4-10 8-15 14-18 6 3 10 8 14 18" />
              <path d="M22 31 16 18l12 7M42 31l6-13-12 7" />
              <circle cx="25" cy="38" r="2" />
              <circle cx="39" cy="38" r="2" />
            </svg>
          </div>
          <h2>Build your encounter library</h2>
          <p>Create a custom group, then add the bosses your guild is preparing to face.</p>
          <button
            v-if="permissions?.canEdit"
            type="button"
            class="boss-button boss-button--primary"
            @click="openGroups()"
          >
            Create first group
          </button>
        </div>

        <div v-else-if="visibleGroups.length === 0" class="bosses-empty bosses-empty--search">
          <h2>No encounters match “{{ searchQuery }}”</h2>
          <p>Try another boss or group name.</p>
          <button type="button" class="boss-button boss-button--quiet" @click="searchQuery = ''">
            Clear search
          </button>
        </div>

        <div v-else class="boss-groups">
          <section
            v-for="(group, groupIndex) in visibleGroups"
            :key="group.id"
            class="boss-group"
            :style="{ '--group-delay': `${groupIndex * 55}ms` }"
          >
            <header class="boss-group__heading">
              <div>
                <span class="boss-group__index" aria-hidden="true">
                  {{ String(groupIndex + 1).padStart(2, '0') }}
                </span>
                <span class="boss-group__rule" aria-hidden="true"></span>
                <div class="boss-group__title">
                  <h2>{{ group.name }}</h2>
                  <span class="boss-group__count">
                    {{ group.bosses.length }}
                    {{ group.bosses.length === 1 ? 'encounter' : 'encounters' }}
                  </span>
                </div>
              </div>
              <button
                v-if="permissions?.canEdit"
                type="button"
                class="boss-icon-button"
                :aria-label="`Manage ${group.name}`"
                @click="openGroups(group.id)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5v.2h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.4 1Z"
                  />
                </svg>
              </button>
            </header>

            <div v-if="group.bosses.length > 0" class="boss-grid">
              <div
                v-for="(bossItem, bossIndex) in group.bosses"
                :key="bossItem.id"
                class="boss-card-shell"
                :style="{ '--card-delay': `${groupIndex * 55 + bossIndex * 35}ms` }"
              >
                <RouterLink
                  :to="bossRoute(bossItem)"
                  class="boss-card"
                  :class="bossRespawnCardClass(bossItem)"
                >
                  <div class="boss-card__media">
                    <img
                      v-if="bossItem.imageUrl && !failedImages.has(bossItem.id)"
                      :src="bossItem.imageUrl"
                      :alt="bossItem.name"
                      loading="lazy"
                      @error="markImageFailed(bossItem.id)"
                    />
                    <div v-else class="boss-image-fallback" aria-hidden="true">
                      <svg viewBox="0 0 64 64">
                        <path d="M18 48c4-10 8-15 14-18 6 3 10 8 14 18" />
                        <path d="M22 31 16 18l12 7M42 31l6-13-12 7" />
                        <circle cx="25" cy="38" r="2" />
                        <circle cx="39" cy="38" r="2" />
                      </svg>
                    </div>
                    <div class="boss-card__shade"></div>
                    <BossRespawnSignal
                      v-if="bossRespawnEntries(bossItem).length > 0"
                      :entries="bossRespawnEntries(bossItem)"
                      :now="respawnNow"
                    />
                    <span class="boss-card__open" aria-hidden="true">
                      Open dossier <span>↗</span>
                    </span>
                  </div>
                  <div class="boss-card__body">
                    <div class="boss-card__meta">
                      <span
                        class="boss-card__zone"
                        :class="{ 'boss-card__zone--unmapped': !bossItem.zoneName }"
                        :title="bossItem.zoneName || 'No zone is mapped to this boss'"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                          <circle cx="12" cy="10" r="2.1" />
                        </svg>
                        <span>{{ bossItem.zoneName || 'Zone not mapped' }}</span>
                      </span>
                      <time :datetime="bossItem.updatedAt">{{
                        formatCompactDate(bossItem.updatedAt)
                      }}</time>
                    </div>
                    <div class="boss-card__title-row">
                      <h3 :title="bossItem.name">{{ bossItem.name }}</h3>
                      <span class="boss-card__arrow" aria-hidden="true">↗</span>
                    </div>
                  </div>
                  <BossRespawnTimeline
                    v-if="bossRespawnEntries(bossItem).length > 0"
                    :entries="bossRespawnEntries(bossItem)"
                    :now="respawnNow"
                  />
                </RouterLink>
                <button
                  v-if="permissions?.canEdit"
                  type="button"
                  class="boss-card__edit"
                  :aria-label="`Edit ${bossItem.name}`"
                  @click="openEditBoss(bossItem, group.id)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" />
                    <path d="m13.5 7 3.5 3.5" />
                  </svg>
                </button>
              </div>
            </div>
            <button
              v-else-if="permissions?.canEdit && !searchQuery"
              type="button"
              class="boss-group__empty"
              @click="openCreateBoss(group.id)"
            >
              <span>+</span>
              Add the first boss to {{ group.name }}
            </button>
          </section>
        </div>
      </template>

      <template v-else-if="boss">
        <header class="boss-detail-hero">
          <div class="boss-detail-hero__media">
            <img
              v-if="boss.imageUrl && !failedImages.has(boss.id)"
              :src="boss.imageUrl"
              :alt="boss.name"
              @error="markImageFailed(boss.id)"
            />
            <div v-else class="boss-image-fallback boss-image-fallback--hero" aria-hidden="true">
              <svg viewBox="0 0 64 64">
                <path d="M18 48c4-10 8-15 14-18 6 3 10 8 14 18" />
                <path d="M22 31 16 18l12 7M42 31l6-13-12 7" />
                <circle cx="25" cy="38" r="2" />
                <circle cx="39" cy="38" r="2" />
              </svg>
            </div>
            <div class="boss-detail-hero__veil"></div>
          </div>
          <div class="boss-detail-hero__content">
            <RouterLink
              :to="{ name: 'GuildBosses', params: { guildId: library.guild.id } }"
              class="boss-detail-back"
            >
              <span aria-hidden="true">←</span> All bosses
            </RouterLink>
            <div class="boss-detail-hero__title">
              <p>{{ boss.group.name }}</p>
              <div class="boss-detail-title-line">
                <h1>{{ boss.name }}</h1>
                <div class="boss-detail-share">
                  <button
                    type="button"
                    class="boss-detail-copy-link"
                    :class="{ 'is-copied': shareStatus === 'copied' }"
                    :aria-label="`Copy direct link to ${boss.name}`"
                    :title="shareStatus === 'copied' ? 'Link copied' : 'Copy direct link'"
                    @click="copyBossLink"
                  >
                    <svg v-if="shareStatus === 'copied'" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
                      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
                    </svg>
                  </button>
                  <Transition name="boss-share-feedback">
                    <span v-if="shareStatus === 'copied'" class="boss-detail-copy-feedback">
                      Copied
                    </span>
                  </Transition>
                  <span class="sr-only" aria-live="polite">{{ shareAnnouncement }}</span>
                </div>
              </div>
              <div class="boss-detail-meta">
                <span v-if="boss.lastEditedByName">Updated by {{ boss.lastEditedByName }}</span>
                <span>{{ formatDate(boss.updatedAt) }}</span>
              </div>
            </div>
            <div v-if="mode === 'view'" class="boss-detail-actions">
              <button
                type="button"
                class="boss-detail-action"
                aria-label="View boss edit history"
                @click="openHistory"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 8v5l3 2" />
                  <path d="M4.5 9A8 8 0 1 1 4 14M4 5v4h4" />
                </svg>
                History
              </button>
              <button
                v-if="permissions?.canEdit"
                type="button"
                class="boss-detail-action"
                aria-label="Review suggested boss edits"
                @click="openSuggestions"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 4h12v16H6zM9 9h6M9 13h4" />
                  <path d="m14 17 1.5 1.5L19 15" />
                </svg>
                Suggestions
              </button>
              <button
                v-if="permissions?.canEdit"
                type="button"
                class="boss-detail-action"
                aria-label="Edit boss details"
                @click="openEditBoss(boss, boss.groupId)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" />
                  <path d="m13.5 7 3.5 3.5" />
                </svg>
                Details
              </button>
            </div>
          </div>
        </header>

        <div class="boss-notes-shell">
          <div class="boss-notes-toolbar">
            <div class="boss-notes-toolbar__heading">
              <p>Raid strategy</p>
              <h2>Encounter notes</h2>
            </div>
            <div class="boss-notes-toolbar__actions">
              <p v-if="permissions?.isContributor && !permissions.canManageContributors">
                Contributor access
              </p>
              <div class="boss-mode-switch" aria-label="Notes mode">
                <button
                  type="button"
                  :class="{ 'is-active': mode === 'view' }"
                  :aria-pressed="mode === 'view'"
                  title="Preview the saved page"
                  @click="cancelEditing"
                >
                  Preview
                </button>
                <button
                  v-if="permissions?.canEdit"
                  type="button"
                  :class="{ 'is-active': mode === 'plain' }"
                  :aria-pressed="mode === 'plain'"
                  title="Edit the page visually"
                  @click="requestNotesMode('plain')"
                >
                  Edit
                </button>
                <button
                  v-if="permissions?.canEdit"
                  type="button"
                  :class="{ 'is-active': mode === 'edit' }"
                  :aria-pressed="mode === 'edit'"
                  title="Edit advanced MediaWiki source"
                  @click="requestNotesMode('edit')"
                >
                  Source
                </button>
                <button
                  v-if="!permissions?.canEdit && permissions?.canSuggest"
                  type="button"
                  :class="{ 'is-active': mode === 'suggest' }"
                  :aria-pressed="mode === 'suggest'"
                  title="Suggest an edit for contributor review"
                  @click="startSuggestion"
                >
                  Suggest edit
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="activeEditLease && mode !== 'view'"
            class="boss-edit-lock boss-edit-lock--mine"
            role="status"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
            </svg>
            <div>
              <strong>Page locked to you</strong>
              <span
                >Others can view these notes, but only you can edit until you return to
                Preview.</span
              >
            </div>
          </div>
          <div
            v-else-if="editLockMessage"
            class="boss-edit-lock boss-edit-lock--blocked"
            role="alert"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
            </svg>
            <div>
              <strong>{{ editLockMessage }}</strong>
              <span v-if="editLockConflict">
                The lock renews while they edit and expires
                {{ formatEditLeaseExpiry(editLockConflict.expiresAt) }} if abandoned.
              </span>
              <span v-else
                >Your draft is still here, but saving is disabled until you reopen the editor.</span
              >
            </div>
            <button
              v-if="mode === 'view'"
              type="button"
              aria-label="Dismiss edit lock notice"
              @click="clearEditLockNotice"
            >
              ×
            </button>
          </div>

          <Transition name="notes-mode" mode="out-in">
            <article v-if="mode === 'view'" key="view" class="boss-notes-document">
              <div class="boss-notes-document__content">
                <MediaWikiContent :source="boss.notes ?? ''" :links="wikiLinks">
                  <template #empty>
                    <div class="boss-notes-empty">
                      <svg viewBox="0 0 48 48" aria-hidden="true">
                        <path d="M12 7h18l7 7v27H12V7Z" />
                        <path d="M30 7v8h7M18 23h13M18 29h13M18 35h8" />
                      </svg>
                      <h2>No strategy notes yet</h2>
                      <p v-if="permissions?.canEdit">
                        Start this page with the encounter plan your raid needs.
                      </p>
                      <p v-else>A contributor has not documented this encounter yet.</p>
                      <button
                        v-if="permissions?.canEdit"
                        type="button"
                        class="boss-button boss-button--primary"
                        @click="requestNotesMode('plain')"
                      >
                        Write notes
                      </button>
                      <button
                        v-else-if="permissions?.canSuggest"
                        type="button"
                        class="boss-button boss-button--primary"
                        @click="startSuggestion"
                      >
                        Suggest notes
                      </button>
                    </div>
                  </template>
                </MediaWikiContent>
              </div>

              <div class="boss-raid-utilities">
                <BossHealsCard :heals="currentBossHeals" />
                <BossCuresCard :cures="currentBossCures" />
              </div>
            </article>

            <div v-else-if="mode === 'edit'" key="edit" class="boss-notes-edit-layout">
              <div class="boss-notes-edit">
                <MediaWikiEditor v-model="notesDraft" :links="wikiLinks" />
                <div class="boss-notes-edit__footer">
                  <p>
                    <span v-if="notesDirty" class="boss-notes-edit__unsaved">Unsaved changes</span>
                    <span v-else>MediaWiki wikitext · Live preview</span>
                  </p>
                  <div>
                    <button
                      type="button"
                      class="boss-button boss-button--quiet"
                      :disabled="savingNotes"
                      @click="cancelEditing"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="boss-button boss-button--primary"
                      :disabled="savingNotes || !notesDirty || !activeEditLease"
                      @click="saveNotes"
                    >
                      {{ savingNotes ? 'Saving…' : 'Save notes' }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="boss-raid-utilities">
                <BossHealsCard
                  :heals="currentBossHeals"
                  editable
                  :saving="savingHeals"
                  @toggle-raid-heals="toggleRaidHeals"
                  @select-c-heal-chain="selectCHealChainSize"
                />
                <BossCuresCard
                  :cures="currentBossCures"
                  editable
                  :saving="savingCures"
                  @toggle="toggleBossCure"
                />
              </div>
            </div>

            <div
              v-else
              :key="mode"
              class="boss-notes-edit-mode"
              :class="{ 'boss-notes-edit-layout': mode === 'plain' }"
            >
              <div
                class="boss-notes-edit boss-notes-edit--plain"
                :class="{ 'boss-notes-edit--suggestion': mode === 'suggest' }"
              >
                <div v-if="mode === 'suggest'" class="boss-suggestion-intro">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4h12v16H6zM9 9h6M9 13h4" />
                    <path d="m14 17 1.5 1.5L19 15" />
                  </svg>
                  <div>
                    <strong>Suggest changes for review</strong>
                    <span>
                      Your edits will not change the live page until a contributor approves them.
                    </span>
                  </div>
                </div>
                <div v-if="loadingPlainNotes" class="boss-plain-loading">
                  <GlobalLoadingSpinner />
                  <p>Preparing the visual editor…</p>
                </div>
                <div v-else-if="plainLoadError" class="boss-plain-error">
                  <strong>The visual editor is unavailable</strong>
                  <p>{{ plainLoadError }}</p>
                  <button
                    type="button"
                    class="boss-button boss-button--quiet"
                    @click="loadPlainNotes"
                  >
                    Try again
                  </button>
                </div>
                <PlainBossNotesEditor
                  v-else-if="plainDocument"
                  v-model="plainFields"
                  :document="plainDocument"
                  :allow-source="mode !== 'suggest'"
                  @request-source="requestNotesMode('edit')"
                />
                <div v-if="mode === 'suggest' && plainDocument" class="boss-suggestion-cures">
                  <div>
                    <strong>Suggested cures</strong>
                    <span>Include any changes this encounter needs.</span>
                  </div>
                  <button
                    v-for="cure in cureOptions"
                    :key="cure.key"
                    type="button"
                    :class="{ 'is-selected': suggestionCures[cure.key] }"
                    :aria-pressed="suggestionCures[cure.key]"
                    @click="suggestionCures[cure.key] = !suggestionCures[cure.key]"
                  >
                    <span aria-hidden="true">{{ suggestionCures[cure.key] ? '✓' : '—' }}</span>
                    {{ cure.label }}
                  </button>
                </div>
                <div class="boss-notes-edit__footer boss-notes-edit__footer--sticky">
                  <p>
                    <span v-if="activeNotesDirty" class="boss-notes-edit__unsaved">
                      {{ mode === 'suggest' ? 'Unsubmitted changes' : 'Unsaved changes' }}
                    </span>
                    <span v-else>{{
                      mode === 'suggest' ? 'Ready to suggest' : 'Ready to edit'
                    }}</span>
                    <span class="boss-notes-edit__shortcuts">
                      <kbd>⌘S</kbd> {{ mode === 'suggest' ? 'submit' : 'save' }}
                      <span aria-hidden="true">·</span> <kbd>Esc</kbd> close
                    </span>
                  </p>
                  <div>
                    <button
                      type="button"
                      class="boss-button boss-button--quiet"
                      :disabled="savingPlainNotes"
                      @click="cancelEditing"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="boss-button boss-button--primary"
                      :disabled="
                        savingPlainNotes ||
                        loadingPlainNotes ||
                        !activeNotesDirty ||
                        (mode === 'plain' && !activeEditLease)
                      "
                      :title="
                        mode === 'suggest'
                          ? 'Submit suggestion (Command or Control + S)'
                          : 'Save notes (Command or Control + S)'
                      "
                      @click="mode === 'suggest' ? submitSuggestion() : savePlainNotes()"
                    >
                      {{
                        savingPlainNotes
                          ? mode === 'suggest'
                            ? 'Submitting…'
                            : 'Saving…'
                          : mode === 'suggest'
                            ? 'Submit suggestion'
                            : 'Save notes'
                      }}
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="mode === 'plain'" class="boss-raid-utilities">
                <BossHealsCard
                  :heals="currentBossHeals"
                  editable
                  :saving="savingHeals"
                  @toggle-raid-heals="toggleRaidHeals"
                  @select-c-heal-chain="selectCHealChainSize"
                />
                <BossCuresCard
                  :cures="currentBossCures"
                  editable
                  :saving="savingCures"
                  @toggle="toggleBossCure"
                />
              </div>
            </div>
          </Transition>

          <nav
            v-if="mode === 'view' && (previousBoss || nextBoss)"
            class="boss-adjacent"
            aria-label="Other boss notes"
          >
            <RouterLink
              v-if="previousBoss"
              :to="bossRoute(previousBoss)"
              class="boss-adjacent__link boss-adjacent__link--previous"
            >
              <span>← Previous encounter</span>
              <strong>{{ previousBoss.name }}</strong>
            </RouterLink>
            <span v-else></span>
            <RouterLink
              v-if="nextBoss"
              :to="bossRoute(nextBoss)"
              class="boss-adjacent__link boss-adjacent__link--next"
            >
              <span>Next encounter →</span>
              <strong>{{ nextBoss.name }}</strong>
            </RouterLink>
          </nav>
        </div>
      </template>
    </template>

    <Teleport to="body">
      <Transition name="boss-modal">
        <div v-if="showBossModal" class="boss-modal-backdrop" @click.self="closeBossModal">
          <form
            ref="bossDialogRef"
            class="boss-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-details-title"
            tabindex="-1"
            @submit.prevent="saveBossDetails"
            @paste="handleBossImagePaste"
          >
            <div class="boss-modal__header">
              <div class="boss-modal__identity">
                <span class="boss-modal__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3 5 6v5c0 4.8 2.8 8.3 7 10 4.2-1.7 7-5.2 7-10V6l-7-3Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div>
                  <p>{{ editingBossId ? 'Encounter details' : 'New encounter' }}</p>
                  <h2 id="boss-details-title">
                    {{ editingBossId ? 'Edit boss' : 'Add a boss' }}
                  </h2>
                </div>
              </div>
              <button type="button" aria-label="Close" @click="closeBossModal">×</button>
            </div>
            <div class="boss-modal__body">
              <div
                class="boss-form-preview"
                :class="{
                  'boss-form-preview--with-respawn': selectedBossFormRespawnEntries.length > 0
                }"
              >
                <img
                  v-if="bossImagePreviewUrl && !previewImageFailed"
                  :src="bossImagePreviewUrl"
                  alt="Boss image preview"
                  @error="previewImageFailed = true"
                />
                <div v-else class="boss-image-fallback" aria-hidden="true">
                  <svg viewBox="0 0 64 64">
                    <path d="M18 48c4-10 8-15 14-18 6 3 10 8 14 18" />
                    <path d="M22 31 16 18l12 7M42 31l6-13-12 7" />
                    <circle cx="25" cy="38" r="2" />
                    <circle cx="39" cy="38" r="2" />
                  </svg>
                </div>
                <span class="boss-form-preview__badge">
                  {{ bossImagePreviewUrl ? bossImageSourceLabel : 'Cover preview' }}
                </span>
                <span class="boss-form-preview__name">
                  {{ bossForm.name.trim() || 'Boss name' }}
                </span>
                <BossRespawnSignal
                  v-if="selectedBossFormRespawnEntries.length > 0"
                  :entries="selectedBossFormRespawnEntries"
                  :now="respawnNow"
                />
              </div>

              <div class="boss-form-fields">
                <div class="boss-form-fields__intro">
                  <h3>Identity & placement</h3>
                  <p>Choose how this encounter appears throughout the guild library.</p>
                </div>
                <label>
                  <span>Name</span>
                  <input
                    v-model="bossForm.name"
                    data-modal-initial-focus
                    type="text"
                    maxlength="191"
                    required
                    placeholder="Example: Vulak`Aerr"
                  />
                </label>
                <label>
                  <span>Group</span>
                  <select v-model="bossForm.groupId" required>
                    <option
                      v-for="group in library?.groups ?? []"
                      :key="group.id"
                      :value="group.id"
                    >
                      {{ group.name }}
                    </option>
                  </select>
                </label>
                <div v-if="permissions?.canManageTrackerLink" class="boss-tracker-map">
                  <div class="boss-tracker-map__heading">
                    <span class="boss-tracker-map__mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="7" />
                        <circle cx="12" cy="12" r="2" />
                        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                      </svg>
                    </span>
                    <span>
                      <strong>Respawn signal</strong>
                      <small>Connect this card to one tracked boss.</small>
                    </span>
                  </div>
                  <label>
                    <span class="sr-only">Tracked boss</span>
                    <select v-model="bossForm.npcDefinitionId">
                      <option value="">Not connected to the respawn tracker</option>
                      <option
                        v-for="definition in trackerDefinitions"
                        :key="definition.id"
                        :value="definition.id"
                      >
                        {{ formatTrackerDefinitionOption(definition) }}
                      </option>
                    </select>
                  </label>
                  <p v-if="selectedTrackerDefinition" class="boss-tracker-map__summary">
                    <span class="boss-tracker-map__signal" aria-hidden="true"></span>
                    <span>
                      <strong>{{ selectedTrackerDefinition.npcName }}</strong>
                      <small>
                        {{ selectedTrackerDefinition.zoneName || 'Zone not set' }} ·
                        {{
                          selectedTrackerDefinition.hasInstanceVersion
                            ? 'Overworld and instance signals'
                            : 'Overworld signal'
                        }}
                      </small>
                    </span>
                  </p>
                  <p v-else class="boss-tracker-map__empty">
                    This card will stay visually quiet until a tracker entry is selected.
                  </p>
                </div>
                <div class="boss-image-field">
                  <div class="boss-image-field__heading">
                    <span>Cover image <small>Optional</small></span>
                    <span>{{
                      bossImageMode === 'upload' ? 'Stored securely' : 'Linked externally'
                    }}</span>
                  </div>
                  <div class="boss-image-source-switch" aria-label="Cover image source">
                    <button
                      type="button"
                      :class="{ 'is-active': bossImageMode === 'upload' }"
                      :aria-pressed="bossImageMode === 'upload'"
                      @click="setBossImageMode('upload')"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                        />
                      </svg>
                      Upload image
                    </button>
                    <button
                      type="button"
                      :class="{ 'is-active': bossImageMode === 'url' }"
                      :aria-pressed="bossImageMode === 'url'"
                      @click="setBossImageMode('url')"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="m10 13.5 4-4m-6.2 7.7-1 .9a3.5 3.5 0 0 1-4.9-4.9l3-3a3.5 3.5 0 0 1 4.9 0m6.4-3.4 1-.9a3.5 3.5 0 0 1 4.9 4.9l-3 3a3.5 3.5 0 0 1-4.9 0"
                        />
                      </svg>
                      Image URL
                    </button>
                  </div>

                  <div v-if="bossImageMode === 'upload'" class="boss-image-upload">
                    <input
                      ref="bossImageInputRef"
                      class="boss-image-upload__input"
                      type="file"
                      accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
                      @change="handleBossImageSelected"
                    />
                    <div
                      class="boss-image-dropzone"
                      :class="{
                        'is-dragging': bossImageDragging,
                        'has-image': Boolean(bossImageFile || existingBossUploadUrl)
                      }"
                      role="button"
                      tabindex="0"
                      @click="openBossImagePicker"
                      @keydown.enter.prevent="openBossImagePicker"
                      @keydown.space.prevent="openBossImagePicker"
                      @dragenter.prevent="bossImageDragging = true"
                      @dragover.prevent="bossImageDragging = true"
                      @dragleave.prevent="handleBossImageDragLeave"
                      @drop.prevent="handleBossImageDrop"
                    >
                      <span class="boss-image-dropzone__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path
                            d="M12 16V5m0 0L8 9m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                          />
                        </svg>
                      </span>
                      <span class="boss-image-dropzone__copy">
                        <strong>{{
                          bossImageFile
                            ? bossImageFile.name
                            : existingBossUploadUrl
                              ? 'Current uploaded image'
                              : 'Choose a cover image'
                        }}</strong>
                        <small v-if="bossImageFile">
                          {{ formatBossImageSize(bossImageFile.size) }} · Ready to upload
                        </small>
                        <small v-else-if="existingBossUploadUrl"
                          >Click or drop a file to replace it</small
                        >
                        <small v-else>Drop, browse, or paste · PNG, JPEG, GIF or WebP</small>
                      </span>
                      <span class="boss-image-dropzone__action">
                        {{ bossImageFile || existingBossUploadUrl ? 'Replace' : 'Browse' }}
                      </span>
                    </div>
                    <div class="boss-image-upload__meta">
                      <span class="boss-image-paste-hint">
                        <kbd>⌘V</kbd>
                        Paste from clipboard · 2 MB maximum
                      </span>
                      <button
                        v-if="bossImageFile || existingBossUploadUrl"
                        type="button"
                        @click="removeBossImage"
                      >
                        Remove image
                      </button>
                    </div>
                  </div>

                  <label v-else class="boss-image-url-field">
                    <span class="sr-only">Image URL</span>
                    <span class="boss-image-url-field__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          d="m10 13.5 4-4m-6.2 7.7-1 .9a3.5 3.5 0 0 1-4.9-4.9l3-3a3.5 3.5 0 0 1 4.9 0m6.4-3.4 1-.9a3.5 3.5 0 0 1 4.9 4.9l-3 3a3.5 3.5 0 0 1-4.9 0"
                        />
                      </svg>
                    </span>
                    <input
                      v-model="bossForm.imageUrl"
                      type="url"
                      maxlength="2048"
                      placeholder="https://example.com/boss.jpg"
                      @input="previewImageFailed = false"
                    />
                    <small>Paste a direct HTTP or HTTPS image address.</small>
                  </label>
                </div>
              </div>
            </div>
            <div class="boss-modal__footer">
              <button
                v-if="editingBossId && permissions?.canDelete"
                type="button"
                class="boss-button boss-button--danger-quiet"
                @click="requestBossDelete"
              >
                Delete boss
              </button>
              <span v-else class="boss-modal__status">Guild encounter library</span>
              <div>
                <button
                  type="button"
                  class="boss-button boss-button--quiet"
                  @click="closeBossModal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="boss-button boss-button--primary"
                  :disabled="savingBoss || !bossForm.name.trim() || !bossForm.groupId"
                >
                  {{ savingBoss ? 'Saving…' : editingBossId ? 'Save changes' : 'Add boss' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div v-if="showGroupsModal" class="boss-modal-backdrop" @click.self="closeGroups">
          <div
            ref="groupsDialogRef"
            class="boss-modal boss-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-groups-title"
            tabindex="-1"
          >
            <div class="boss-modal__header">
              <div class="boss-modal__identity">
                <span class="boss-modal__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 6h14M5 12h14M5 18h14" />
                    <circle cx="3" cy="6" r=".7" />
                    <circle cx="3" cy="12" r=".7" />
                    <circle cx="3" cy="18" r=".7" />
                  </svg>
                </span>
                <div>
                  <p>Library structure</p>
                  <h2 id="boss-groups-title">Boss groups</h2>
                </div>
              </div>
              <button type="button" aria-label="Close" @click="closeGroups">×</button>
            </div>
            <div class="boss-modal__body boss-groups-manager">
              <p class="boss-modal__intro">
                Group encounters by zone, wing, or progression tier so the library stays easy to
                scan.
              </p>
              <div class="boss-group-order-hint">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="8" cy="7" r="1" />
                  <circle cx="16" cy="7" r="1" />
                  <circle cx="8" cy="12" r="1" />
                  <circle cx="16" cy="12" r="1" />
                  <circle cx="8" cy="17" r="1" />
                  <circle cx="16" cy="17" r="1" />
                </svg>
                <span>Drag the handles to set the library order. Changes save automatically.</span>
                <strong aria-live="polite">{{ reorderingGroups ? 'Saving order…' : '' }}</strong>
              </div>
              <form class="boss-group-create" @submit.prevent="createGroup">
                <label>
                  <span>New group name</span>
                  <input
                    v-model="newGroupName"
                    data-modal-initial-focus
                    type="text"
                    maxlength="120"
                    placeholder="Example: Temple of Veeshan"
                  />
                </label>
                <button
                  type="submit"
                  class="boss-button boss-button--primary"
                  :disabled="creatingGroup || !newGroupName.trim()"
                >
                  {{ creatingGroup ? 'Adding…' : 'Add group' }}
                </button>
              </form>

              <div v-if="(library?.groups.length ?? 0) === 0" class="boss-groups-manager__empty">
                No groups yet. Add one above to begin.
              </div>
              <div v-else class="boss-group-rows">
                <div
                  v-for="(group, groupIndex) in library?.groups ?? []"
                  :key="group.id"
                  class="boss-group-row"
                  :class="{
                    'is-highlighted': focusedGroupId === group.id,
                    'is-dragging': draggedGroupId === group.id,
                    'is-drop-target-before':
                      dragOverGroupId === group.id && dragOverPosition === 'before',
                    'is-drop-target-after':
                      dragOverGroupId === group.id && dragOverPosition === 'after'
                  }"
                  :data-group-id="group.id"
                  @dragover="handleGroupDragOver($event, group.id)"
                  @dragleave="handleGroupDragLeave($event, group.id)"
                  @drop="dropGroup($event, group.id)"
                >
                  <span
                    class="boss-group-row__drag-handle"
                    :class="{ 'is-disabled': reorderingGroups }"
                    :draggable="!reorderingGroups"
                    aria-hidden="true"
                    title="Drag to reorder"
                    @dragstart.stop="startGroupDrag($event, group.id)"
                    @dragend="finishGroupDrag"
                    @pointerdown="startGroupPointerDrag($event, group.id)"
                    @pointermove="handleGroupPointerMove"
                    @pointerup="finishGroupPointerDrag"
                    @pointercancel="cancelGroupPointerDrag"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="8" cy="6" r="1.35" />
                      <circle cx="16" cy="6" r="1.35" />
                      <circle cx="8" cy="12" r="1.35" />
                      <circle cx="16" cy="12" r="1.35" />
                      <circle cx="8" cy="18" r="1.35" />
                      <circle cx="16" cy="18" r="1.35" />
                    </svg>
                  </span>
                  <span class="boss-group-row__index" aria-hidden="true">
                    {{ String(groupIndex + 1).padStart(2, '0') }}
                  </span>
                  <label>
                    <span class="sr-only">Group name</span>
                    <input v-model="groupDrafts[group.id]" type="text" maxlength="120" />
                  </label>
                  <span class="boss-group-row__count" aria-label="Boss count">
                    {{ group.bosses.length }} {{ group.bosses.length === 1 ? 'boss' : 'bosses' }}
                  </span>
                  <div class="boss-group-row__move-buttons" aria-label="Move group">
                    <button
                      type="button"
                      :disabled="reorderingGroups || groupIndex === 0"
                      :aria-label="`Move ${group.name} up`"
                      title="Move up"
                      @click="moveGroup(group.id, -1)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m7 14 5-5 5 5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      :disabled="
                        reorderingGroups || groupIndex === (library?.groups.length ?? 0) - 1
                      "
                      :aria-label="`Move ${group.name} down`"
                      title="Move down"
                      @click="moveGroup(group.id, 1)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </button>
                  </div>
                  <div class="boss-group-row__actions">
                    <button
                      v-if="
                        groupSaving.has(group.id) ||
                        (Boolean(groupDrafts[group.id]?.trim()) &&
                          groupDrafts[group.id]?.trim() !== group.name)
                      "
                      type="button"
                      class="boss-button boss-button--small"
                      :disabled="
                        reorderingGroups ||
                        groupSaving.has(group.id) ||
                        !groupDrafts[group.id]?.trim() ||
                        groupDrafts[group.id]?.trim() === group.name
                      "
                      @click="renameGroup(group)"
                    >
                      {{ groupSaving.has(group.id) ? 'Saving…' : 'Save' }}
                    </button>
                    <button
                      v-if="permissions?.canDelete"
                      type="button"
                      class="boss-icon-button boss-icon-button--danger"
                      :disabled="reorderingGroups || group.bosses.length > 0"
                      :title="
                        group.bosses.length > 0
                          ? 'Move or delete this group’s bosses first.'
                          : 'Delete group'
                      "
                      :aria-label="`Delete ${group.name}`"
                      @click="requestGroupDelete(group)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="boss-modal__footer boss-modal__footer--end">
              <button type="button" class="boss-button boss-button--primary" @click="closeGroups">
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div
          v-if="showContributorsModal"
          class="boss-modal-backdrop"
          @click.self="closeContributors"
        >
          <div
            ref="contributorsDialogRef"
            class="boss-modal boss-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-contributors-title"
            tabindex="-1"
          >
            <div class="boss-modal__header">
              <div class="boss-modal__identity">
                <span class="boss-modal__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19" />
                    <path d="M17 8v6M14 11h6" />
                  </svg>
                </span>
                <div>
                  <p>Editing access</p>
                  <h2 id="boss-contributors-title">Boss contributors</h2>
                </div>
              </div>
              <button type="button" aria-label="Close" @click="closeContributors">×</button>
            </div>
            <div class="boss-modal__body contributor-manager">
              <p class="contributor-manager__intro">
                Contributors can create and update boss pages. Leaders and officers always have
                access.
              </p>
              <div v-if="!contributorsLoading" class="contributor-tools">
                <label class="contributor-search">
                  <span class="sr-only">Search guild members</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    v-model="contributorSearch"
                    data-modal-initial-focus
                    type="search"
                    placeholder="Find a guild member"
                  />
                </label>
                <p>
                  <strong>{{ customContributorCount }}</strong>
                  {{ customContributorCount === 1 ? 'contributor' : 'contributors' }}
                </p>
              </div>
              <div v-if="contributorsLoading" class="contributor-manager__loading">
                Loading guild members…
              </div>
              <div v-else-if="filteredContributors.length > 0" class="contributor-list">
                <label
                  v-for="member in filteredContributors"
                  :key="member.userId"
                  class="contributor-row"
                >
                  <span class="contributor-row__avatar">{{ member.displayName.charAt(0) }}</span>
                  <span class="contributor-row__identity">
                    <strong>{{ member.displayName }}</strong>
                    <small>{{ formatRole(member.role) }}</small>
                  </span>
                  <span v-if="member.hasImplicitAccess" class="contributor-row__built-in">
                    Officer access
                  </span>
                  <span v-else class="contributor-toggle">
                    <input
                      type="checkbox"
                      :checked="member.isContributor"
                      :disabled="contributorSaving.has(member.userId)"
                      @change="toggleContributor(member, $event)"
                    />
                    <span aria-hidden="true"></span>
                  </span>
                </label>
              </div>
              <div v-else class="contributor-manager__empty">
                No guild members match “{{ contributorSearch }}”.
              </div>
            </div>
            <div class="boss-modal__footer boss-modal__footer--end">
              <button
                type="button"
                class="boss-button boss-button--primary"
                @click="closeContributors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div v-if="showHistoryModal" class="boss-modal-backdrop" @click.self="closeHistory">
          <div
            ref="historyDialogRef"
            class="boss-modal boss-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-history-title"
            tabindex="-1"
          >
            <div class="boss-modal__header">
              <div class="boss-modal__identity">
                <span class="boss-modal__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 8v5l3 2" />
                    <path d="M4.5 9A8 8 0 1 1 4 14M4 5v4h4" />
                  </svg>
                </span>
                <div>
                  <p>Audit trail</p>
                  <h2 id="boss-history-title">Edit history</h2>
                </div>
              </div>
              <button type="button" aria-label="Close" @click="closeHistory">×</button>
            </div>
            <div class="boss-modal__body boss-history">
              <div v-if="historyLoading" class="boss-modal-loading">Loading edit history…</div>
              <ol v-else-if="editHistory.length > 0" class="boss-history__list">
                <li v-for="entry in editHistory" :key="entry.id">
                  <span class="boss-history__dot" aria-hidden="true"></span>
                  <div>
                    <strong>{{ entry.summary }}</strong>
                    <p>{{ entry.editorName }}</p>
                    <time :datetime="entry.createdAt">{{ formatDateTime(entry.createdAt) }}</time>
                  </div>
                </li>
              </ol>
              <div v-else class="boss-modal-empty">
                <strong>No recorded edits yet</strong>
                <p>New edits and approved suggestions will appear here.</p>
              </div>
            </div>
            <div class="boss-modal__footer boss-modal__footer--end">
              <button type="button" class="boss-button boss-button--primary" @click="closeHistory">
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div v-if="showSuggestionsModal" class="boss-modal-backdrop" @click.self="closeSuggestions">
          <div
            ref="suggestionsDialogRef"
            class="boss-modal boss-modal--review"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-suggestions-title"
            tabindex="-1"
          >
            <div class="boss-modal__header">
              <div class="boss-modal__identity">
                <span class="boss-modal__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 4h12v16H6zM9 9h6M9 13h4" />
                    <path d="m14 17 1.5 1.5L19 15" />
                  </svg>
                </span>
                <div>
                  <p>Contributor review</p>
                  <h2 id="boss-suggestions-title">Suggested edits</h2>
                </div>
              </div>
              <button type="button" aria-label="Close" @click="closeSuggestions">×</button>
            </div>
            <div class="boss-modal__body boss-suggestions">
              <div v-if="suggestionsLoading" class="boss-modal-loading">Loading suggestions…</div>
              <div v-else-if="editSuggestions.length > 0" class="boss-suggestions__list">
                <article v-for="suggestion in editSuggestions" :key="suggestion.id">
                  <header>
                    <div>
                      <span>Suggested by</span>
                      <strong>{{ suggestion.submittedByName }}</strong>
                    </div>
                    <time :datetime="suggestion.createdAt">
                      {{ formatDateTime(suggestion.createdAt) }}
                    </time>
                  </header>
                  <div class="boss-suggestions__cures">
                    <span>Cures</span>
                    <strong>{{ formatCures(suggestion.proposedCures) }}</strong>
                  </div>
                  <div class="boss-suggestions__preview">
                    <MediaWikiContent :source="suggestion.proposedNotes ?? ''" :links="wikiLinks">
                      <template #empty>
                        <p class="boss-suggestions__empty-notes">No encounter notes.</p>
                      </template>
                    </MediaWikiContent>
                  </div>
                  <footer>
                    <button
                      type="button"
                      class="boss-button boss-button--quiet"
                      :disabled="Boolean(reviewingSuggestionId)"
                      @click="reviewSuggestion(suggestion, 'reject')"
                    >
                      {{
                        reviewingSuggestionId === suggestion.id && reviewAction === 'reject'
                          ? 'Rejecting…'
                          : 'Reject'
                      }}
                    </button>
                    <button
                      type="button"
                      class="boss-button boss-button--primary"
                      :disabled="Boolean(reviewingSuggestionId)"
                      @click="reviewSuggestion(suggestion, 'approve')"
                    >
                      {{
                        reviewingSuggestionId === suggestion.id && reviewAction === 'approve'
                          ? 'Approving…'
                          : 'Approve & publish'
                      }}
                    </button>
                  </footer>
                </article>
              </div>
              <div v-else class="boss-modal-empty">
                <strong>No suggestions waiting</strong>
                <p>Member suggestions for this boss will appear here.</p>
              </div>
            </div>
            <div class="boss-modal__footer boss-modal__footer--end">
              <button
                type="button"
                class="boss-button boss-button--primary"
                :disabled="Boolean(reviewingSuggestionId)"
                @click="closeSuggestions"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div v-if="deletePrompt" class="boss-modal-backdrop boss-modal-backdrop--confirm">
          <div
            ref="deleteDialogRef"
            class="boss-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="boss-delete-title"
            aria-describedby="boss-delete-description"
            tabindex="-1"
          >
            <div class="boss-confirm__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 2.8 19h18.4L12 3Z" />
                <path d="M12 9v4M12 16.5v.2" />
              </svg>
            </div>
            <span class="boss-confirm__eyebrow">Permanent action</span>
            <h2 id="boss-delete-title">
              Delete {{ deletePrompt.kind === 'boss' ? 'boss' : 'group' }}?
            </h2>
            <p id="boss-delete-description">
              This permanently removes
              <strong class="boss-confirm__subject">{{ deletePrompt.name }}</strong>
              {{
                deletePrompt.kind === 'boss' ? 'and all of its strategy notes' : 'from the library'
              }}.
            </p>
            <small>This action cannot be undone.</small>
            <div>
              <button
                type="button"
                class="boss-button boss-button--quiet"
                :disabled="deleting"
                @click="deletePrompt = null"
              >
                Cancel
              </button>
              <button
                type="button"
                class="boss-button boss-button--danger"
                :disabled="deleting"
                @click="executeDelete"
              >
                {{ deleting ? 'Deleting…' : 'Delete permanently' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div
          v-if="editLockPromptMode"
          class="boss-modal-backdrop boss-modal-backdrop--confirm"
          @click.self="cancelEditLockPrompt"
        >
          <div
            ref="editLockDialogRef"
            class="boss-confirm boss-confirm--lock"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-edit-lock-title"
            aria-describedby="boss-edit-lock-description"
            tabindex="-1"
          >
            <div class="boss-confirm__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
              </svg>
            </div>
            <span class="boss-confirm__eyebrow">Exclusive editing</span>
            <h2 id="boss-edit-lock-title">Lock this page and open {{ editLockPromptLabel }}?</h2>
            <p id="boss-edit-lock-description">
              <strong class="boss-confirm__subject">{{ boss?.name }}</strong>
              will be reserved for you. Other contributors can still view the page, but they cannot
              open Edit or Source while your lock is active.
            </p>
            <small>
              The lock renews while you work, releases when you return to Preview, and expires after
              about two minutes if your tab closes unexpectedly.
            </small>
            <div>
              <button
                type="button"
                class="boss-button boss-button--quiet"
                :disabled="acquiringEditLease"
                @click="cancelEditLockPrompt"
              >
                Not now
              </button>
              <button
                type="button"
                class="boss-button boss-button--primary"
                :disabled="acquiringEditLease"
                data-modal-initial-focus
                @click="confirmEditLockPrompt"
              >
                {{
                  acquiringEditLease ? 'Locking page…' : `Lock page & open ${editLockPromptLabel}`
                }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="boss-modal">
        <div
          v-if="discardPrompt"
          class="boss-modal-backdrop boss-modal-backdrop--confirm"
          @click.self="resolveDiscardNotes(false)"
        >
          <div
            ref="discardDialogRef"
            class="boss-confirm boss-confirm--discard"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="boss-discard-title"
            aria-describedby="boss-discard-description"
            tabindex="-1"
          >
            <div class="boss-confirm__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 5h14v14H5z" />
                <path d="m8 8 8 8M16 8l-8 8" />
              </svg>
            </div>
            <span class="boss-confirm__eyebrow">Unsaved notes</span>
            <h2 id="boss-discard-title">Discard your changes?</h2>
            <p id="boss-discard-description">
              Your latest strategy edits have not been saved to this boss page.
            </p>
            <small>You can keep editing or leave without saving.</small>
            <div>
              <button
                type="button"
                class="boss-button boss-button--quiet"
                @click="resolveDiscardNotes(false)"
              >
                Keep editing
              </button>
              <button
                type="button"
                class="boss-button boss-button--primary"
                @click="resolveDiscardNotes(true)"
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ErrorModal />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';

import BossCuresCard from '../components/BossCuresCard.vue';
import BossHealsCard from '../components/BossHealsCard.vue';
import BossRespawnSignal from '../components/BossRespawnSignal.vue';
import BossRespawnTimeline from '../components/BossRespawnTimeline.vue';
import ErrorModal from '../components/ErrorModal.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import MediaWikiContent from '../components/MediaWikiContent.vue';
import MediaWikiEditor from '../components/MediaWikiEditor.vue';
import PlainBossNotesEditor from '../components/PlainBossNotesEditor.vue';
import { useToastBus } from '../components/ToastBus';
import { useErrorModal } from '../composables/useErrorModal';
import {
  api,
  type BossContributor,
  type BossCures,
  type BossHeals,
  type BossEditHistoryEntry,
  type BossEditLease,
  type BossEditMode,
  type BossEditSuggestion,
  type BossLibraryPermissions,
  type CHealChainSize,
  type GuildBoss,
  type GuildBossGroup,
  type GuildBossLibrary,
  type GuildBossSummary,
  type GuildRole,
  type NpcDefinition,
  type NpcRespawnTrackerEntry,
  type PlainBossNotesDocument
} from '../services/api';
import { copyBossShareLink } from '../utils/bossLinks';
import { getBossRespawnTone } from '../utils/bossRespawnPresentation';
import { plainBossNotesChanged, plainBossNotesValues } from '../utils/plainBossNotes';

const route = useRoute();
const router = useRouter();
const { addToast } = useToastBus();
const { showErrorFromException } = useErrorModal();

const library = ref<GuildBossLibrary | null>(null);
const boss = ref<GuildBoss | null>(null);
const guildId = computed(() => String(route.params.guildId ?? library.value?.guild.id ?? ''));
const guildSlug = computed(() => String(route.params.guildSlug ?? library.value?.guild.slug ?? ''));
const bossId = computed(() => String(route.params.bossId ?? boss.value?.id ?? '') || null);
const routeGuildKey = computed(() => String(route.params.guildId ?? route.params.guildSlug ?? ''));
const routeBossKey = computed(() => String(route.params.bossId ?? route.params.bossSlug ?? ''));
const isDetail = computed(() => Boolean(routeBossKey.value));
const detailPermissions = ref<BossLibraryPermissions | null>(null);
const loading = ref(true);
const loadError = ref('');
const searchQuery = ref('');
const failedImages = ref(new Set<string>());
const respawnEntries = ref<NpcRespawnTrackerEntry[]>([]);
const trackerDefinitions = ref<NpcDefinition[]>([]);
const respawnNow = ref(Date.now());
let respawnRefreshTimer: number | null = null;

const respawnEntriesByDefinition = computed(() => {
  const entriesByDefinition = new Map<string, NpcRespawnTrackerEntry[]>();
  for (const entry of respawnEntries.value) {
    const entries = entriesByDefinition.get(entry.id) ?? [];
    entries.push(entry);
    entriesByDefinition.set(entry.id, entries);
  }
  return entriesByDefinition;
});

function bossRespawnEntries(item: Pick<GuildBossSummary, 'npcDefinitionId'>) {
  if (!item.npcDefinitionId) return [];
  return respawnEntriesByDefinition.value.get(item.npcDefinitionId) ?? [];
}

function bossRespawnCardClass(item: Pick<GuildBossSummary, 'npcDefinitionId'>) {
  const entries = bossRespawnEntries(item);
  if (entries.length === 0) return null;
  return `boss-card--spawn-${getBossRespawnTone(entries)}`;
}

const permissions = computed(() => library.value?.permissions ?? detailPermissions.value);
const totalBosses = computed(
  () => library.value?.groups.reduce((total, group) => total + group.bosses.length, 0) ?? 0
);
const visibleGroups = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!library.value || !query) return library.value?.groups ?? [];
  return library.value.groups
    .map((group) => ({
      ...group,
      bosses: group.name.toLocaleLowerCase().includes(query)
        ? group.bosses
        : group.bosses.filter((item) => item.name.toLocaleLowerCase().includes(query))
    }))
    .filter((group) => group.bosses.length > 0);
});

const orderedBosses = computed(() =>
  (library.value?.groups ?? []).flatMap((group) =>
    group.bosses.map((item) => ({ ...item, groupName: group.name }))
  )
);
const currentBossIndex = computed(() =>
  orderedBosses.value.findIndex((item) => item.id === boss.value?.id)
);
const previousBoss = computed(() =>
  currentBossIndex.value > 0 ? (orderedBosses.value[currentBossIndex.value - 1] ?? null) : null
);
const nextBoss = computed(() =>
  currentBossIndex.value >= 0 && currentBossIndex.value < orderedBosses.value.length - 1
    ? (orderedBosses.value[currentBossIndex.value + 1] ?? null)
    : null
);

const cureOptions: Array<{ key: keyof BossCures; label: string }> = [
  { key: 'curse', label: 'Curse' },
  { key: 'poison', label: 'Poison' },
  { key: 'disease', label: 'Disease' }
];
const currentBossCures = computed<BossCures>(() => ({
  curse: boss.value?.cures?.curse ?? false,
  poison: boss.value?.cures?.poison ?? false,
  disease: boss.value?.cures?.disease ?? false
}));
const currentBossHeals = computed<BossHeals>(() => ({
  raidHeals: boss.value?.heals?.raidHeals ?? false,
  cHealChainSize: boss.value?.heals?.cHealChainSize ?? 2
}));
const savingCures = ref(false);
const savingHeals = ref(false);

function formatCures(cures: BossCures) {
  const names = cureOptions.filter((option) => cures[option.key]).map((option) => option.label);
  return names.length > 0 ? names.join(', ') : 'None needed';
}

async function toggleBossCure(key: keyof BossCures) {
  if (
    !boss.value ||
    !permissions.value?.canEdit ||
    !activeEditLease.value ||
    !['plain', 'edit'].includes(mode.value) ||
    savingCures.value
  ) {
    return;
  }
  const cures = { ...currentBossCures.value, [key]: !currentBossCures.value[key] };
  savingCures.value = true;
  try {
    boss.value = await api.updateGuildBoss(guildId.value, boss.value.id, {
      cures,
      editLeaseToken: activeEditLease.value.token
    });
    await refreshLibrary();
    addToast({
      title: 'Cures updated',
      message: `Required cures: ${formatCures(cures)}.`,
      variant: 'success'
    });
  } catch (error) {
    if (!captureEditLockError(error)) {
      showErrorFromException(error, 'Unable to update required cures.');
    }
  } finally {
    savingCures.value = false;
  }
}

async function saveBossHeals(heals: BossHeals) {
  if (
    !boss.value ||
    !permissions.value?.canEdit ||
    !activeEditLease.value ||
    !['plain', 'edit'].includes(mode.value) ||
    savingHeals.value
  ) {
    return;
  }
  savingHeals.value = true;
  try {
    boss.value = await api.updateGuildBoss(guildId.value, boss.value.id, {
      heals,
      editLeaseToken: activeEditLease.value.token
    });
    await refreshLibrary();
    addToast({
      title: 'Heals updated',
      message: `${heals.raidHeals ? 'Raid Heals selected · ' : ''}${heals.cHealChainSize} Person CHeal Chain.`,
      variant: 'success'
    });
  } catch (error) {
    if (!captureEditLockError(error)) {
      showErrorFromException(error, 'Unable to update the healing plan.');
    }
  } finally {
    savingHeals.value = false;
  }
}

function toggleRaidHeals() {
  void saveBossHeals({
    ...currentBossHeals.value,
    raidHeals: !currentBossHeals.value.raidHeals
  });
}

function selectCHealChainSize(cHealChainSize: CHealChainSize) {
  if (cHealChainSize === currentBossHeals.value.cHealChainSize) return;
  void saveBossHeals({ ...currentBossHeals.value, cHealChainSize });
}

function bossRoute(item: Pick<GuildBossSummary, 'slug'>) {
  return {
    name: 'GuildBossShare',
    params: { guildSlug: guildSlug.value, bossSlug: item.slug }
  };
}

const wikiLinks = computed(() => {
  const links: Record<string, string> = {};
  for (const group of library.value?.groups ?? []) {
    for (const item of group.bosses) {
      links[item.name.trim().toLocaleLowerCase()] = router.resolve(bossRoute(item)).href;
    }
  }
  return links;
});

async function refreshBossRespawnData() {
  const activeGuildId = library.value?.guild.id ?? guildId.value;
  if (!activeGuildId) return;
  respawnNow.value = Date.now();

  try {
    const tracker = await api.fetchNpcRespawnTracker(activeGuildId);
    respawnEntries.value = tracker.npcs;
  } catch (error) {
    console.warn('Unable to refresh Boss Library respawn signals', error);
  }

  if (!permissions.value?.canManageTrackerLink) {
    trackerDefinitions.value = [];
    return;
  }
  try {
    const definitions = await api.fetchNpcDefinitions(activeGuildId);
    trackerDefinitions.value = [...definitions.definitions].sort((left, right) => {
      const nameOrder = left.npcName.localeCompare(right.npcName);
      return nameOrder || (left.zoneName ?? '').localeCompare(right.zoneName ?? '');
    });
  } catch (error) {
    console.warn('Unable to load Boss Library tracker mapping options', error);
  }
}

async function loadPage() {
  loading.value = true;
  loadError.value = '';
  respawnEntries.value = [];
  trackerDefinitions.value = [];
  try {
    const routeGuildSlug = String(route.params.guildSlug ?? '');
    const routeBossSlug = String(route.params.bossSlug ?? '');
    if (routeGuildSlug && routeBossSlug) {
      const detailResult = await api.fetchGuildBossBySlug(routeGuildSlug, routeBossSlug);
      const libraryResult = await api.fetchGuildBossLibrary(detailResult.guild.id);
      library.value = libraryResult;
      boss.value = detailResult.boss;
      detailPermissions.value = detailResult.permissions;
    } else if (bossId.value) {
      const [libraryResult, detailResult] = await Promise.all([
        api.fetchGuildBossLibrary(guildId.value),
        api.fetchGuildBoss(guildId.value, bossId.value)
      ]);
      library.value = libraryResult;
      boss.value = detailResult.boss;
      detailPermissions.value = detailResult.permissions;
    } else {
      library.value = await api.fetchGuildBossLibrary(guildId.value);
      boss.value = null;
      detailPermissions.value = null;
    }
    await refreshBossRespawnData();
  } catch (error) {
    const typedError = error as { response?: { data?: { message?: string } }; message?: string };
    loadError.value =
      typedError.response?.data?.message ??
      typedError.message ??
      'The boss library is unavailable.';
  } finally {
    loading.value = false;
  }

  if (boss.value && permissions.value?.canEdit && route.query.edit === '1') {
    void requestNotesMode('plain');
  }
}

const shareStatus = ref<'idle' | 'copied' | 'error'>('idle');
const shareAnnouncement = computed(() => {
  if (shareStatus.value === 'copied') return 'Boss link copied to clipboard.';
  if (shareStatus.value === 'error') return 'Unable to copy the boss link.';
  return '';
});
let shareStatusTimeout: ReturnType<typeof window.setTimeout> | null = null;

async function copyBossLink() {
  if (!boss.value || !guildSlug.value) return;

  try {
    await copyBossShareLink(
      window.location.origin,
      guildSlug.value,
      boss.value.slug,
      async (url) => {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('Clipboard copy was blocked.');
      }
    );
    shareStatus.value = 'copied';
    addToast({
      title: 'Link copied',
      message: `${boss.value.name} is ready to share.`,
      variant: 'success'
    });
  } catch (error) {
    console.warn('Failed to copy boss link', error);
    shareStatus.value = 'error';
    addToast({
      title: 'Unable to copy link',
      message: 'Copy the address from your browser and try again.',
      variant: 'error'
    });
  }

  if (shareStatusTimeout) window.clearTimeout(shareStatusTimeout);
  shareStatusTimeout = window.setTimeout(() => {
    shareStatus.value = 'idle';
    shareStatusTimeout = null;
  }, 3000);
}

function markImageFailed(id: string) {
  failedImages.value = new Set([...failedImages.value, id]);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

type NotesMode = 'view' | 'edit' | 'plain' | 'suggest';
type EditableNotesMode = 'edit' | 'plain';

const mode = ref<NotesMode>('view');
const notesDraft = ref('');
const notesOriginal = ref('');
const savingNotes = ref(false);
const notesDirty = computed(() => notesDraft.value !== notesOriginal.value);
const plainDocument = ref<PlainBossNotesDocument | null>(null);
const plainFields = ref<Record<string, string>>({});
const plainOriginalFields = ref<Record<string, string>>({});
const loadingPlainNotes = ref(false);
const savingPlainNotes = ref(false);
const plainLoadError = ref('');
const plainNotesDirty = computed(() =>
  plainBossNotesChanged(plainFields.value, plainOriginalFields.value)
);
const suggestionCures = ref<BossCures>({ curse: false, poison: false, disease: false });
const suggestionOriginalCures = ref<BossCures>({ curse: false, poison: false, disease: false });
const suggestionCuresDirty = computed(() =>
  cureOptions.some(
    (option) => suggestionCures.value[option.key] !== suggestionOriginalCures.value[option.key]
  )
);
const activeNotesDirty = computed(() =>
  mode.value === 'edit'
    ? notesDirty.value
    : mode.value === 'plain'
      ? plainNotesDirty.value
      : mode.value === 'suggest' && (plainNotesDirty.value || suggestionCuresDirty.value)
);
const activeEditLease = ref<(BossEditLease & { token: string }) | null>(null);
const editLeaseRevision = ref('');
const editLeaseSourceNotes = ref('');
const editLockPromptMode = ref<EditableNotesMode | null>(null);
const acquiringEditLease = ref(false);
const editLockConflict = ref<BossEditLease | null>(null);
const editLockMessage = ref('');
const editLockPromptLabel = computed(() =>
  editLockPromptMode.value === 'edit' ? 'Source' : 'Edit'
);
let editLeaseHeartbeatTimer: ReturnType<typeof window.setInterval> | null = null;
let editLeaseHeartbeatInFlight = false;

function toBossEditMode(nextMode: EditableNotesMode): BossEditMode {
  return nextMode === 'edit' ? 'source' : 'plain';
}

function formatEditLeaseExpiry(expiresAt: string) {
  return `at ${new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(expiresAt))}`;
}

function stopEditLeaseHeartbeat() {
  if (editLeaseHeartbeatTimer) window.clearInterval(editLeaseHeartbeatTimer);
  editLeaseHeartbeatTimer = null;
  editLeaseHeartbeatInFlight = false;
}

function clearEditLockNotice() {
  if (mode.value !== 'view') return;
  editLockConflict.value = null;
  editLockMessage.value = '';
}

function captureEditLockError(error: unknown): boolean {
  const response = (
    error as {
      response?: {
        data?: { code?: string; message?: string; lock?: BossEditLease | null };
      };
    }
  ).response;
  const code = response?.data?.code;
  if (!code?.startsWith('boss_edit_lock')) return false;

  stopEditLeaseHeartbeat();
  activeEditLease.value = null;
  editLeaseRevision.value = '';
  editLeaseSourceNotes.value = '';
  editLockConflict.value = response?.data?.lock ?? null;
  editLockMessage.value =
    response?.data?.message ??
    'Your edit lock is no longer active. Return to Preview, then reopen the editor.';
  return true;
}

async function renewEditLease(nextMode?: EditableNotesMode) {
  if (!boss.value || !activeEditLease.value || editLeaseHeartbeatInFlight) return;
  const currentLease = activeEditLease.value;
  const heartbeatMode =
    nextMode ??
    (mode.value === 'edit'
      ? 'edit'
      : mode.value === 'plain'
        ? 'plain'
        : currentLease.mode === 'source'
          ? 'edit'
          : 'plain');
  editLeaseHeartbeatInFlight = true;
  try {
    const renewed = await api.heartbeatGuildBossEditLease(
      guildId.value,
      boss.value.id,
      currentLease.token,
      toBossEditMode(heartbeatMode)
    );
    if (activeEditLease.value?.token !== currentLease.token) return;
    activeEditLease.value = { ...renewed, token: currentLease.token };
  } catch (error) {
    if (activeEditLease.value?.token !== currentLease.token) return;
    if (!captureEditLockError(error)) {
      console.warn('Unable to renew the boss edit lock. The client will retry.', error);
    }
  } finally {
    editLeaseHeartbeatInFlight = false;
  }
}

function startEditLeaseHeartbeat() {
  stopEditLeaseHeartbeat();
  editLeaseHeartbeatTimer = window.setInterval(() => {
    void renewEditLease();
  }, 30_000);
}

async function releaseEditLease() {
  const currentBoss = boss.value;
  const currentLease = activeEditLease.value;
  stopEditLeaseHeartbeat();
  activeEditLease.value = null;
  editLeaseRevision.value = '';
  editLeaseSourceNotes.value = '';
  if (!currentBoss || !currentLease) return;
  try {
    await api.releaseGuildBossEditLease(guildId.value, currentBoss.id, currentLease.token);
  } catch (error) {
    console.warn('Unable to release the boss edit lock. It will expire automatically.', error);
  }
}

function releaseEditLeaseBestEffort() {
  const currentBoss = boss.value;
  const currentLease = activeEditLease.value;
  stopEditLeaseHeartbeat();
  activeEditLease.value = null;
  editLeaseRevision.value = '';
  editLeaseSourceNotes.value = '';
  if (!currentBoss || !currentLease) return;

  const url = `/api/guilds/${encodeURIComponent(guildId.value)}/bosses/${encodeURIComponent(
    currentBoss.id
  )}/edit-lease/release`;
  const body = JSON.stringify({ token: currentLease.token });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    return;
  }
  void fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  });
}

async function loadPlainNotes() {
  if (!boss.value || !permissions.value?.canSuggest || loadingPlainNotes.value) return;
  loadingPlainNotes.value = true;
  plainLoadError.value = '';
  try {
    const document = await api.fetchGuildBossPlainNotes(guildId.value, boss.value.id);
    const values = plainBossNotesValues(document);
    plainDocument.value = document;
    plainFields.value = { ...values };
    plainOriginalFields.value = { ...values };
    if (activeEditLease.value) editLeaseRevision.value = document.revision;
  } catch (error) {
    const typedError = error as { response?: { data?: { message?: string } }; message?: string };
    plainLoadError.value =
      typedError.response?.data?.message ??
      typedError.message ??
      'The safe editor could not prepare these notes.';
  } finally {
    loadingPlainNotes.value = false;
  }
}

async function startSuggestion() {
  if (!boss.value || !permissions.value?.canSuggest || permissions.value.canEdit) return;
  if (mode.value === 'suggest') return;
  mode.value = 'suggest';
  plainDocument.value = null;
  plainFields.value = {};
  plainOriginalFields.value = {};
  suggestionCures.value = { ...currentBossCures.value };
  suggestionOriginalCures.value = { ...currentBossCures.value };
  await loadPlainNotes();
}

async function activateNotesMode(nextMode: EditableNotesMode) {
  if (!boss.value || !permissions.value?.canEdit) return;
  if (nextMode === 'edit') {
    const sourceNotes = activeEditLease.value
      ? editLeaseSourceNotes.value
      : (boss.value.notes ?? '');
    notesDraft.value = sourceNotes;
    notesOriginal.value = sourceNotes;
    mode.value = 'edit';
  } else {
    mode.value = 'plain';
    plainDocument.value = null;
    plainFields.value = {};
    plainOriginalFields.value = {};
    await loadPlainNotes();
  }
  void renewEditLease(nextMode);
}

async function requestNotesMode(nextMode: EditableNotesMode) {
  if (!boss.value || !permissions.value?.canEdit || mode.value === nextMode) return;
  if (mode.value === 'view') {
    clearEditLockNotice();
    editLockPromptMode.value = nextMode;
    return;
  }
  if (!(await confirmDiscardNotes())) return;
  await activateNotesMode(nextMode);
}

function cancelEditLockPrompt() {
  if (acquiringEditLease.value) return;
  editLockPromptMode.value = null;
}

async function confirmEditLockPrompt() {
  const nextMode = editLockPromptMode.value;
  if (!boss.value || !nextMode || acquiringEditLease.value) return;
  acquiringEditLease.value = true;
  try {
    const acquisition = await api.acquireGuildBossEditLease(
      guildId.value,
      boss.value.id,
      toBossEditMode(nextMode)
    );
    activeEditLease.value = acquisition.lease;
    editLeaseRevision.value = acquisition.revision;
    editLeaseSourceNotes.value = acquisition.notes;
    editLockConflict.value = null;
    editLockMessage.value = '';
    editLockPromptMode.value = null;
    startEditLeaseHeartbeat();
    await activateNotesMode(nextMode);
  } catch (error) {
    editLockPromptMode.value = null;
    if (!captureEditLockError(error)) {
      showErrorFromException(error, 'Unable to lock this boss page for editing.');
    }
  } finally {
    acquiringEditLease.value = false;
  }
}

const discardPrompt = ref(false);
let discardResolver: ((shouldDiscard: boolean) => void) | null = null;

function confirmDiscardNotes(): boolean | Promise<boolean> {
  if (!activeNotesDirty.value) return true;
  discardPrompt.value = true;
  return new Promise<boolean>((resolve) => {
    discardResolver = resolve;
  });
}

function resolveDiscardNotes(shouldDiscard: boolean) {
  discardPrompt.value = false;
  const resolve = discardResolver;
  discardResolver = null;
  resolve?.(shouldDiscard);
}

async function cancelEditing() {
  if (mode.value === 'view') {
    mode.value = 'view';
    return;
  }
  if (!(await confirmDiscardNotes())) return;
  if (mode.value === 'edit') notesDraft.value = notesOriginal.value;
  if (mode.value === 'plain') plainFields.value = { ...plainOriginalFields.value };
  if (mode.value === 'suggest') {
    plainFields.value = { ...plainOriginalFields.value };
    suggestionCures.value = { ...suggestionOriginalCures.value };
  }
  mode.value = 'view';
  editLockConflict.value = null;
  editLockMessage.value = '';
  await releaseEditLease();
}

async function saveNotes() {
  if (!boss.value || !activeEditLease.value || !notesDirty.value || savingNotes.value) return;
  savingNotes.value = true;
  try {
    const updated = await api.updateGuildBoss(guildId.value, boss.value.id, {
      notes: notesDraft.value,
      editLeaseToken: activeEditLease.value.token,
      notesRevision: editLeaseRevision.value
    });
    boss.value = updated;
    notesOriginal.value = updated.notes ?? '';
    notesDraft.value = updated.notes ?? '';
    plainDocument.value = null;
    mode.value = 'view';
    await releaseEditLease();
    await refreshLibrary();
    if (route.query.edit === '1') {
      await router.replace(bossRoute(updated));
    }
    addToast({
      title: 'Boss notes saved',
      message: `${updated.name} is updated for your guild.`,
      variant: 'success'
    });
  } catch (error) {
    if (!captureEditLockError(error)) {
      showErrorFromException(error, 'Unable to save boss notes.');
    }
  } finally {
    savingNotes.value = false;
  }
}

async function savePlainNotes() {
  if (
    !boss.value ||
    !activeEditLease.value ||
    !plainDocument.value ||
    !plainNotesDirty.value ||
    savingPlainNotes.value
  ) {
    return;
  }
  savingPlainNotes.value = true;
  try {
    const result = await api.updateGuildBossPlainNotes(guildId.value, boss.value.id, {
      revision: plainDocument.value.revision,
      fields: plainFields.value,
      editLeaseToken: activeEditLease.value.token
    });
    const values = plainBossNotesValues(result.document);
    boss.value = result.boss;
    plainDocument.value = result.document;
    plainFields.value = { ...values };
    plainOriginalFields.value = { ...values };
    notesDraft.value = result.boss.notes ?? '';
    notesOriginal.value = result.boss.notes ?? '';
    mode.value = 'view';
    await releaseEditLease();
    await refreshLibrary();
    addToast({
      title: 'Boss notes saved',
      message: `${result.boss.name} was converted safely and updated for your guild.`,
      variant: 'success'
    });
  } catch (error) {
    if (!captureEditLockError(error)) {
      showErrorFromException(
        error,
        'Unable to save plain-text boss notes. Your edits are still here.'
      );
    }
  } finally {
    savingPlainNotes.value = false;
  }
}

async function submitSuggestion() {
  if (
    !boss.value ||
    !plainDocument.value ||
    mode.value !== 'suggest' ||
    !activeNotesDirty.value ||
    savingPlainNotes.value
  ) {
    return;
  }
  savingPlainNotes.value = true;
  try {
    await api.createGuildBossEditSuggestion(guildId.value, boss.value.id, {
      revision: plainDocument.value.revision,
      fields: plainFields.value,
      cures: suggestionCures.value
    });
    plainOriginalFields.value = { ...plainFields.value };
    suggestionOriginalCures.value = { ...suggestionCures.value };
    mode.value = 'view';
    addToast({
      title: 'Suggestion submitted',
      message: 'A boss contributor can now review and publish your changes.',
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, 'Unable to submit this suggestion. Your edits are still here.');
  } finally {
    savingPlainNotes.value = false;
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!activeNotesDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

function handlePageHide() {
  releaseEditLeaseBestEffort();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshBossRespawnData();
    if (mode.value !== 'view') void renewEditLease();
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' && trapActiveModalFocus(event)) return;

  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 's') {
    if (mode.value === 'edit' && notesDirty.value && !savingNotes.value) {
      event.preventDefault();
      void saveNotes();
    } else if (mode.value === 'plain' && plainNotesDirty.value && !savingPlainNotes.value) {
      event.preventDefault();
      void savePlainNotes();
    } else if (mode.value === 'suggest' && activeNotesDirty.value && !savingPlainNotes.value) {
      event.preventDefault();
      void submitSuggestion();
    }
    return;
  }

  if (event.key !== 'Escape') return;
  if (discardPrompt.value) {
    resolveDiscardNotes(false);
  } else if (editLockPromptMode.value) {
    cancelEditLockPrompt();
  } else if (deletePrompt.value) {
    if (!deleting.value) deletePrompt.value = null;
  } else if (showBossModal.value) {
    closeBossModal();
  } else if (showGroupsModal.value) {
    closeGroups();
  } else if (showContributorsModal.value) {
    closeContributors();
  } else if (showHistoryModal.value) {
    closeHistory();
  } else if (showSuggestionsModal.value) {
    closeSuggestions();
  } else if (mode.value !== 'view') {
    cancelEditing();
  }
}

onBeforeRouteLeave(() => confirmDiscardNotes());
onBeforeRouteUpdate(() => confirmDiscardNotes());

const showBossModal = ref(false);
const editingBossId = ref<string | null>(null);
const savingBoss = ref(false);
const previewImageFailed = ref(false);
const bossImageMode = ref<'upload' | 'url'>('upload');
const bossImageFile = ref<File | null>(null);
const bossImageObjectUrl = ref<string | null>(null);
const existingBossUploadUrl = ref<string | null>(null);
const bossImageInputRef = ref<HTMLInputElement | null>(null);
const bossImageDragging = ref(false);
const bossForm = reactive({
  name: '',
  groupId: '',
  imageUrl: '',
  npcDefinitionId: ''
});

const selectedTrackerDefinition = computed(
  () =>
    trackerDefinitions.value.find((definition) => definition.id === bossForm.npcDefinitionId) ??
    null
);
const selectedBossFormRespawnEntries = computed(() => {
  if (!bossForm.npcDefinitionId) return [];
  return respawnEntriesByDefinition.value.get(bossForm.npcDefinitionId) ?? [];
});

function formatTrackerDefinitionOption(definition: NpcDefinition) {
  const variant = definition.hasInstanceVersion ? 'Overworld + instance' : 'Overworld';
  return `${definition.npcName} · ${definition.zoneName || 'Zone not set'} · ${variant}`;
}

const bossImagePreviewUrl = computed(() => {
  if (bossImageMode.value === 'upload') {
    return bossImageObjectUrl.value ?? existingBossUploadUrl.value;
  }
  return bossForm.imageUrl.trim() || null;
});
const bossImageSourceLabel = computed(() =>
  bossImageMode.value === 'upload' ? 'Uploaded cover' : 'Linked cover'
);

function releaseBossImageObjectUrl() {
  if (!bossImageObjectUrl.value) return;
  URL.revokeObjectURL(bossImageObjectUrl.value);
  bossImageObjectUrl.value = null;
}

function clearBossImageSelection() {
  releaseBossImageObjectUrl();
  bossImageFile.value = null;
  if (bossImageInputRef.value) bossImageInputRef.value.value = '';
}

function setBossImageMode(nextMode: 'upload' | 'url') {
  bossImageMode.value = nextMode;
  previewImageFailed.value = false;
}

function formatBossImageSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function selectBossImage(file: File | null) {
  bossImageDragging.value = false;
  if (!file) return;
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    showErrorFromException(new Error('Use a PNG, JPEG, GIF, or WebP image.'));
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showErrorFromException(new Error('Boss images must be 2 MB or smaller.'));
    return;
  }
  releaseBossImageObjectUrl();
  bossImageFile.value = file;
  bossImageObjectUrl.value = URL.createObjectURL(file);
  previewImageFailed.value = false;
}

function openBossImagePicker() {
  bossImageInputRef.value?.click();
}

function handleBossImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  selectBossImage(input.files?.[0] ?? null);
}

function handleBossImageDrop(event: DragEvent) {
  selectBossImage(event.dataTransfer?.files?.[0] ?? null);
}

function handleBossImagePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    ?.getAsFile();
  if (!image) return;
  event.preventDefault();
  bossImageMode.value = 'upload';
  selectBossImage(image);
}

function handleBossImageDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement;
  if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return;
  bossImageDragging.value = false;
}

function removeBossImage() {
  clearBossImageSelection();
  existingBossUploadUrl.value = null;
  previewImageFailed.value = false;
}

function resetBossForm(groupId?: string) {
  clearBossImageSelection();
  bossForm.name = '';
  bossForm.groupId = groupId ?? library.value?.groups[0]?.id ?? '';
  bossForm.imageUrl = '';
  bossForm.npcDefinitionId = '';
  editingBossId.value = null;
  bossImageMode.value = 'upload';
  existingBossUploadUrl.value = null;
  bossImageDragging.value = false;
  previewImageFailed.value = false;
}

function openCreateBoss(groupId?: string) {
  resetBossForm(groupId);
  showBossModal.value = true;
}

function openEditBoss(item: GuildBoss | GuildBossSummary, groupId: string) {
  editingBossId.value = item.id;
  bossForm.name = item.name;
  bossForm.groupId = groupId;
  bossForm.npcDefinitionId = item.npcDefinitionId ?? '';
  clearBossImageSelection();
  bossImageMode.value = item.imageSource === 'url' ? 'url' : 'upload';
  bossForm.imageUrl = item.imageSource === 'url' ? (item.imageUrl ?? '') : '';
  existingBossUploadUrl.value = item.imageSource === 'upload' ? item.imageUrl : null;
  bossImageDragging.value = false;
  previewImageFailed.value = false;
  showBossModal.value = true;
}

function closeBossModal() {
  if (savingBoss.value) return;
  showBossModal.value = false;
  clearBossImageSelection();
}

async function saveBossDetails() {
  if (!bossForm.name.trim() || !bossForm.groupId || savingBoss.value) return;
  savingBoss.value = true;
  try {
    const imageUrl = bossImageMode.value === 'url' ? bossForm.imageUrl.trim() || null : null;
    const trackerLinkPayload = permissions.value?.canManageTrackerLink
      ? { npcDefinitionId: bossForm.npcDefinitionId || null }
      : {};
    if (editingBossId.value) {
      const updated =
        bossImageMode.value === 'upload' && bossImageFile.value
          ? await api.updateGuildBossWithImage(
              guildId.value,
              editingBossId.value,
              {
                name: bossForm.name.trim(),
                groupId: bossForm.groupId,
                ...trackerLinkPayload
              },
              bossImageFile.value
            )
          : await api.updateGuildBoss(guildId.value, editingBossId.value, {
              name: bossForm.name.trim(),
              groupId: bossForm.groupId,
              ...trackerLinkPayload,
              ...(bossImageMode.value === 'url' || !existingBossUploadUrl.value ? { imageUrl } : {})
            });
      if (boss.value?.id === updated.id) boss.value = updated;
      await refreshLibrary();
      addToast({
        title: 'Boss updated',
        message: `${updated.name} was saved.`,
        variant: 'success'
      });
      showBossModal.value = false;
      clearBossImageSelection();
    } else {
      const created =
        bossImageMode.value === 'upload' && bossImageFile.value
          ? await api.createGuildBossWithImage(
              guildId.value,
              {
                name: bossForm.name.trim(),
                groupId: bossForm.groupId,
                ...trackerLinkPayload
              },
              bossImageFile.value
            )
          : await api.createGuildBoss(guildId.value, {
              name: bossForm.name.trim(),
              groupId: bossForm.groupId,
              ...trackerLinkPayload,
              imageUrl
            });
      showBossModal.value = false;
      clearBossImageSelection();
      addToast({
        title: 'Boss added',
        message: `Add strategy notes for ${created.name}.`,
        variant: 'success'
      });
      await router.push({ ...bossRoute(created), query: { edit: '1' } });
    }
  } catch (error) {
    showErrorFromException(error, 'Unable to save boss details.');
  } finally {
    savingBoss.value = false;
  }
}

async function refreshLibrary() {
  library.value = await api.fetchGuildBossLibrary(guildId.value);
}

const showGroupsModal = ref(false);
const focusedGroupId = ref<string | null>(null);
const newGroupName = ref('');
const creatingGroup = ref(false);
const groupDrafts = reactive<Record<string, string>>({});
const groupSaving = ref(new Set<string>());
const reorderingGroups = ref(false);
const draggedGroupId = ref<string | null>(null);
const dragOverGroupId = ref<string | null>(null);
const dragOverPosition = ref<'before' | 'after'>('before');
const groupPointerId = ref<number | null>(null);
const groupPointerStartY = ref(0);
const groupPointerMoved = ref(false);

function syncGroupDrafts() {
  for (const group of library.value?.groups ?? []) {
    groupDrafts[group.id] = group.name;
  }
}

function openGroups(groupId?: string) {
  focusedGroupId.value = groupId ?? null;
  syncGroupDrafts();
  showGroupsModal.value = true;
}

function closeGroups() {
  showGroupsModal.value = false;
  focusedGroupId.value = null;
  newGroupName.value = '';
}

async function createGroup() {
  if (!newGroupName.value.trim() || creatingGroup.value) return;
  creatingGroup.value = true;
  try {
    const name = newGroupName.value.trim();
    await api.createGuildBossGroup(guildId.value, name);
    await refreshLibrary();
    syncGroupDrafts();
    newGroupName.value = '';
    addToast({
      title: 'Group created',
      message: `${name} is ready for bosses.`,
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, 'Unable to create the boss group.');
  } finally {
    creatingGroup.value = false;
  }
}

async function renameGroup(group: GuildBossGroup) {
  const name = groupDrafts[group.id]?.trim();
  if (!name || name === group.name || groupSaving.value.has(group.id)) return;
  groupSaving.value = new Set([...groupSaving.value, group.id]);
  try {
    await api.updateGuildBossGroup(guildId.value, group.id, { name });
    await refreshLibrary();
    syncGroupDrafts();
    addToast({ title: 'Group renamed', message: `Saved as ${name}.`, variant: 'success' });
  } catch (error) {
    showErrorFromException(error, 'Unable to rename the boss group.');
  } finally {
    const next = new Set(groupSaving.value);
    next.delete(group.id);
    groupSaving.value = next;
  }
}

function finishGroupDrag() {
  draggedGroupId.value = null;
  dragOverGroupId.value = null;
  dragOverPosition.value = 'before';
  groupPointerId.value = null;
  groupPointerStartY.value = 0;
  groupPointerMoved.value = false;
}

function startGroupPointerDrag(event: PointerEvent, groupId: string) {
  if (reorderingGroups.value || (event.pointerType === 'mouse' && event.button !== 0)) return;
  draggedGroupId.value = groupId;
  groupPointerId.value = event.pointerId;
  groupPointerStartY.value = event.clientY;
  groupPointerMoved.value = false;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
}

function startGroupDrag(event: DragEvent, groupId: string) {
  if (reorderingGroups.value) {
    event.preventDefault();
    return;
  }
  groupPointerId.value = null;
  draggedGroupId.value = groupId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', groupId);
  }
}

function handleGroupDragOver(event: DragEvent, groupId: string) {
  if (!draggedGroupId.value || draggedGroupId.value === groupId || reorderingGroups.value) {
    dragOverGroupId.value = null;
    return;
  }
  event.preventDefault();
  const row = event.currentTarget as HTMLElement | null;
  const bounds = row?.getBoundingClientRect();
  dragOverGroupId.value = groupId;
  dragOverPosition.value =
    bounds && event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleGroupDragLeave(event: DragEvent, groupId: string) {
  const row = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (dragOverGroupId.value === groupId && (!nextTarget || !row?.contains(nextTarget))) {
    dragOverGroupId.value = null;
  }
}

function handleGroupPointerMove(event: PointerEvent) {
  if (groupPointerId.value !== event.pointerId || !draggedGroupId.value) return;
  if (!groupPointerMoved.value && Math.abs(event.clientY - groupPointerStartY.value) < 8) return;
  groupPointerMoved.value = true;
  event.preventDefault();
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.boss-group-row'));
  let nearestRow: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.dataset.groupId === draggedGroupId.value) continue;
    const bounds = row.getBoundingClientRect();
    const distance = Math.abs(event.clientY - (bounds.top + bounds.height / 2));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestRow = row;
    }
  }
  if (!nearestRow?.dataset.groupId) return;
  const bounds = nearestRow.getBoundingClientRect();
  dragOverGroupId.value = nearestRow.dataset.groupId;
  dragOverPosition.value = event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
}

async function persistGroupOrder(nextGroups: GuildBossGroup[], previousGroups: GuildBossGroup[]) {
  if (!library.value || reorderingGroups.value) return;
  reorderingGroups.value = true;
  library.value.groups = nextGroups.map((group, sortOrder) => ({ ...group, sortOrder }));
  try {
    await api.reorderGuildBossGroups(
      guildId.value,
      nextGroups.map((group) => group.id)
    );
    addToast({
      title: 'Group order saved',
      message: 'The Bosses library now follows this order.',
      variant: 'success'
    });
  } catch (error) {
    if (library.value) library.value.groups = previousGroups;
    showErrorFromException(error, 'Unable to save the boss group order.');
  } finally {
    reorderingGroups.value = false;
  }
}

async function moveGroup(groupId: string, direction: -1 | 1) {
  if (!library.value || reorderingGroups.value) return;
  const previousGroups = [...library.value.groups];
  const currentIndex = previousGroups.findIndex((group) => group.id === groupId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previousGroups.length) return;
  const nextGroups = [...previousGroups];
  const [movedGroup] = nextGroups.splice(currentIndex, 1);
  if (!movedGroup) return;
  nextGroups.splice(nextIndex, 0, movedGroup);
  await persistGroupOrder(nextGroups, previousGroups);
}

async function reorderDroppedGroup(
  sourceGroupId: string,
  targetGroupId: string,
  position: 'before' | 'after'
) {
  const previousGroups = [...(library.value?.groups ?? [])];
  const sourceIndex = previousGroups.findIndex((group) => group.id === sourceGroupId);
  if (sourceIndex < 0 || sourceGroupId === targetGroupId || reorderingGroups.value) {
    return;
  }

  const nextGroups = [...previousGroups];
  const [movedGroup] = nextGroups.splice(sourceIndex, 1);
  const targetIndex = nextGroups.findIndex((group) => group.id === targetGroupId);
  if (!movedGroup || targetIndex < 0) {
    return;
  }
  const insertionIndex = targetIndex + (position === 'after' ? 1 : 0);
  nextGroups.splice(insertionIndex, 0, movedGroup);
  if (nextGroups.every((group, index) => group.id === previousGroups[index]?.id)) return;
  await persistGroupOrder(nextGroups, previousGroups);
}

function finishGroupPointerDrag(event: PointerEvent) {
  if (groupPointerId.value !== event.pointerId) return;
  const sourceGroupId = draggedGroupId.value;
  const targetGroupId = dragOverGroupId.value;
  const position = dragOverPosition.value;
  const didMove = groupPointerMoved.value;
  const handle = event.currentTarget as HTMLElement | null;
  if (handle?.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  finishGroupDrag();
  if (didMove && sourceGroupId && targetGroupId) {
    void reorderDroppedGroup(sourceGroupId, targetGroupId, position);
  }
}

function cancelGroupPointerDrag(event: PointerEvent) {
  if (groupPointerId.value !== event.pointerId) return;
  finishGroupDrag();
}

function dropGroup(event: DragEvent, targetGroupId: string) {
  event.preventDefault();
  const sourceGroupId = draggedGroupId.value ?? event.dataTransfer?.getData('text/plain');
  const position = dragOverPosition.value;
  finishGroupDrag();
  if (sourceGroupId) void reorderDroppedGroup(sourceGroupId, targetGroupId, position);
}

const showHistoryModal = ref(false);
const historyLoading = ref(false);
const editHistory = ref<BossEditHistoryEntry[]>([]);

async function openHistory() {
  if (!boss.value) return;
  showHistoryModal.value = true;
  historyLoading.value = true;
  try {
    editHistory.value = await api.fetchGuildBossEditHistory(guildId.value, boss.value.id);
  } catch (error) {
    showHistoryModal.value = false;
    showErrorFromException(error, 'Unable to load this boss’s edit history.');
  } finally {
    historyLoading.value = false;
  }
}

function closeHistory() {
  showHistoryModal.value = false;
}

const showSuggestionsModal = ref(false);
const suggestionsLoading = ref(false);
const editSuggestions = ref<BossEditSuggestion[]>([]);
const reviewingSuggestionId = ref<string | null>(null);
const reviewAction = ref<'approve' | 'reject' | null>(null);

async function openSuggestions() {
  if (!boss.value || !permissions.value?.canEdit) return;
  showSuggestionsModal.value = true;
  suggestionsLoading.value = true;
  try {
    editSuggestions.value = await api.fetchGuildBossEditSuggestions(guildId.value, boss.value.id);
  } catch (error) {
    showSuggestionsModal.value = false;
    showErrorFromException(error, 'Unable to load suggested edits.');
  } finally {
    suggestionsLoading.value = false;
  }
}

function closeSuggestions() {
  if (reviewingSuggestionId.value) return;
  showSuggestionsModal.value = false;
}

async function reviewSuggestion(suggestion: BossEditSuggestion, action: 'approve' | 'reject') {
  if (!boss.value || reviewingSuggestionId.value) return;
  reviewingSuggestionId.value = suggestion.id;
  reviewAction.value = action;
  try {
    const result = await api.reviewGuildBossEditSuggestion(
      guildId.value,
      boss.value.id,
      suggestion.id,
      action
    );
    editSuggestions.value = editSuggestions.value.filter((item) => item.id !== suggestion.id);
    if (result.boss) {
      boss.value = result.boss;
      notesDraft.value = result.boss.notes ?? '';
      notesOriginal.value = result.boss.notes ?? '';
      plainDocument.value = null;
      await refreshLibrary();
    }
    editHistory.value = [];
    addToast({
      title: action === 'approve' ? 'Suggestion published' : 'Suggestion rejected',
      message:
        action === 'approve'
          ? `${suggestion.submittedByName}’s changes are now live.`
          : `${suggestion.submittedByName}’s suggestion was closed without changing the page.`,
      variant: action === 'approve' ? 'success' : 'info'
    });
  } catch (error) {
    showErrorFromException(
      error,
      action === 'approve'
        ? 'Unable to approve this suggestion.'
        : 'Unable to reject this suggestion.'
    );
  } finally {
    reviewingSuggestionId.value = null;
    reviewAction.value = null;
  }
}

const showContributorsModal = ref(false);
const contributors = ref<BossContributor[]>([]);
const contributorsLoading = ref(false);
const contributorSaving = ref(new Set<string>());
const contributorSearch = ref('');
const customContributorCount = computed(
  () =>
    contributors.value.filter((member) => !member.hasImplicitAccess && member.isContributor).length
);
const filteredContributors = computed(() => {
  const query = contributorSearch.value.trim().toLocaleLowerCase();
  if (!query) return contributors.value;
  return contributors.value.filter(
    (member) =>
      member.displayName.toLocaleLowerCase().includes(query) ||
      formatRole(member.role).toLocaleLowerCase().includes(query)
  );
});

async function openContributors() {
  contributorSearch.value = '';
  showContributorsModal.value = true;
  contributorsLoading.value = true;
  try {
    contributors.value = await api.fetchBossContributors(guildId.value);
  } catch (error) {
    showContributorsModal.value = false;
    showErrorFromException(error, 'Unable to load guild contributors.');
  } finally {
    contributorsLoading.value = false;
    await nextTick();
    if (showContributorsModal.value) focusActiveModal();
  }
}

function closeContributors() {
  if (contributorSaving.value.size > 0) return;
  showContributorsModal.value = false;
  contributorSearch.value = '';
}

async function toggleContributor(member: BossContributor, event: Event) {
  const input = event.target as HTMLInputElement;
  const nextValue = input.checked;
  contributorSaving.value = new Set([...contributorSaving.value, member.userId]);
  try {
    await api.setBossContributor(guildId.value, member.userId, nextValue);
    member.isContributor = nextValue;
    addToast({
      title: nextValue ? 'Contributor added' : 'Contributor removed',
      message: nextValue
        ? `${member.displayName} can now edit boss pages.`
        : `${member.displayName} no longer has contributor access.`,
      variant: 'success'
    });
  } catch (error) {
    input.checked = !nextValue;
    showErrorFromException(error, 'Unable to update contributor access.');
  } finally {
    const next = new Set(contributorSaving.value);
    next.delete(member.userId);
    contributorSaving.value = next;
  }
}

const roleLabels: Record<GuildRole, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member',
  RECRUIT: 'Recruit',
  FRIENDS_FAMILY: 'Friends & Family'
};

function formatRole(role: GuildRole) {
  return roleLabels[role] ?? role;
}

type DeletePrompt = { kind: 'boss' | 'group'; id: string; name: string };
const deletePrompt = ref<DeletePrompt | null>(null);
const deleting = ref(false);

const hasOpenModal = computed(
  () =>
    showBossModal.value ||
    showGroupsModal.value ||
    showContributorsModal.value ||
    showHistoryModal.value ||
    showSuggestionsModal.value ||
    Boolean(deletePrompt.value) ||
    Boolean(editLockPromptMode.value) ||
    discardPrompt.value
);
let bodyOverflowBeforeModal = '';
let focusBeforeModal: HTMLElement | null = null;

const bossDialogRef = ref<HTMLElement | null>(null);
const groupsDialogRef = ref<HTMLElement | null>(null);
const contributorsDialogRef = ref<HTMLElement | null>(null);
const historyDialogRef = ref<HTMLElement | null>(null);
const suggestionsDialogRef = ref<HTMLElement | null>(null);
const deleteDialogRef = ref<HTMLElement | null>(null);
const discardDialogRef = ref<HTMLElement | null>(null);
const editLockDialogRef = ref<HTMLElement | null>(null);

const activeModalKey = computed(() => {
  if (discardPrompt.value) return 'discard';
  if (editLockPromptMode.value) return 'edit-lock';
  if (deletePrompt.value) return 'delete';
  if (showBossModal.value) return 'boss';
  if (showGroupsModal.value) return 'groups';
  if (showContributorsModal.value) return 'contributors';
  if (showHistoryModal.value) return 'history';
  if (showSuggestionsModal.value) return 'suggestions';
  return null;
});

function activeModalElement(): HTMLElement | null {
  switch (activeModalKey.value) {
    case 'discard':
      return discardDialogRef.value;
    case 'edit-lock':
      return editLockDialogRef.value;
    case 'delete':
      return deleteDialogRef.value;
    case 'boss':
      return bossDialogRef.value;
    case 'groups':
      return groupsDialogRef.value;
    case 'contributors':
      return contributorsDialogRef.value;
    case 'history':
      return historyDialogRef.value;
    case 'suggestions':
      return suggestionsDialogRef.value;
    default:
      return null;
  }
}

function modalFocusableElements(modal: HTMLElement): HTMLElement[] {
  return Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0);
}

function trapActiveModalFocus(event: KeyboardEvent): boolean {
  const modal = activeModalElement();
  if (!modal) return false;
  const focusable = modalFocusableElements(modal);
  if (focusable.length === 0) {
    event.preventDefault();
    modal.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !modal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

function focusActiveModal() {
  const modal = activeModalElement();
  if (!modal) return;
  const preferred = modal.querySelector<HTMLElement>('[data-modal-initial-focus]:not([disabled])');
  const focusable = modalFocusableElements(modal);
  (preferred ?? focusable[0] ?? modal).focus();
}

watch(hasOpenModal, (isOpen) => {
  if (isOpen) {
    focusBeforeModal =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = bodyOverflowBeforeModal;
    void nextTick(() => focusBeforeModal?.focus());
  }
});

watch(activeModalKey, async (key) => {
  if (!key) return;
  await nextTick();
  focusActiveModal();
});

watch(
  [routeGuildKey, routeBossKey],
  ([nextGuildKey, nextBossKey], [previousGuildKey, previousBossKey]) => {
    if (nextGuildKey === previousGuildKey && nextBossKey === previousBossKey) return;
    void releaseEditLease();
    mode.value = 'view';
    editLockPromptMode.value = null;
    clearEditLockNotice();
    showHistoryModal.value = false;
    showSuggestionsModal.value = false;
    editHistory.value = [];
    editSuggestions.value = [];
    shareStatus.value = 'idle';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    void loadPage();
  }
);

function requestBossDelete() {
  if (!editingBossId.value) return;
  deletePrompt.value = { kind: 'boss', id: editingBossId.value, name: bossForm.name };
}

function requestGroupDelete(group: GuildBossGroup) {
  deletePrompt.value = { kind: 'group', id: group.id, name: group.name };
}

async function executeDelete() {
  if (!deletePrompt.value || deleting.value) return;
  deleting.value = true;
  const prompt = deletePrompt.value;
  try {
    if (prompt.kind === 'boss') {
      await api.deleteGuildBoss(guildId.value, prompt.id);
      showBossModal.value = false;
      deletePrompt.value = null;
      addToast({
        title: 'Boss deleted',
        message: `${prompt.name} was removed.`,
        variant: 'success'
      });
      if (bossId.value === prompt.id) {
        await router.push({ name: 'GuildBosses', params: { guildId: guildId.value } });
      } else {
        await refreshLibrary();
      }
    } else {
      await api.deleteGuildBossGroup(guildId.value, prompt.id);
      deletePrompt.value = null;
      await refreshLibrary();
      syncGroupDrafts();
      addToast({
        title: 'Group deleted',
        message: `${prompt.name} was removed.`,
        variant: 'success'
      });
    }
  } catch (error) {
    showErrorFromException(error, 'Unable to delete this item.');
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  respawnRefreshTimer = window.setInterval(() => {
    void refreshBossRespawnData();
  }, 60_000);
  void loadPage();
});

onBeforeUnmount(() => {
  resolveDiscardNotes(false);
  releaseEditLeaseBestEffort();
  releaseBossImageObjectUrl();
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('pagehide', handlePageHide);
  window.removeEventListener('keydown', handleGlobalKeydown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (respawnRefreshTimer !== null) window.clearInterval(respawnRefreshTimer);
  if (shareStatusTimeout) window.clearTimeout(shareStatusTimeout);
  document.body.style.overflow = bodyOverflowBeforeModal;
});
</script>

<style scoped>
.bosses-page {
  --boss-accent: #45d7df;
  --boss-accent-soft: rgba(69, 215, 223, 0.12);
  --boss-border: rgba(118, 159, 205, 0.2);
  --boss-surface: rgba(10, 17, 31, 0.82);
  margin: 0 auto;
  max-width: 1480px;
  min-height: calc(100vh - 8rem);
  padding: clamp(1.5rem, 3vw, 3.5rem) clamp(1rem, 3vw, 3rem) 5rem;
  position: relative;
}

.bosses-page__atmosphere {
  background:
    radial-gradient(circle at 12% 10%, rgba(69, 215, 223, 0.09), transparent 30%),
    radial-gradient(circle at 95% 0%, rgba(129, 140, 248, 0.1), transparent 28%);
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: -1;
}

.bosses-header {
  align-items: flex-end;
  border-bottom: 1px solid var(--boss-border);
  display: flex;
  gap: 2rem;
  justify-content: space-between;
  padding: 1.35rem 0 2.2rem;
}

.bosses-eyebrow,
.boss-detail-hero__title > p,
.boss-modal__header p {
  color: var(--boss-accent);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  margin: 0 0 0.75rem;
  text-transform: uppercase;
}

.bosses-header h1 {
  color: #f5f8fc;
  font-family: var(--nx-font-display);
  font-size: clamp(3rem, 5.4vw, 5.7rem);
  letter-spacing: -0.055em;
  line-height: 0.92;
  margin: 0;
}

.bosses-header__intro {
  color: #8fa4be;
  font-size: 0.95rem;
  margin: 1rem 0 0;
}

.bosses-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: flex-end;
}

.boss-button {
  align-items: center;
  border: 1px solid rgba(110, 150, 210, 0.28);
  border-radius: 9px;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 750;
  gap: 0.45rem;
  justify-content: center;
  min-height: 2.55rem;
  padding: 0.65rem 0.95rem;
  transition: 160ms ease;
}

.boss-button svg {
  fill: none;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 1rem;
}

.boss-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.boss-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.boss-button:focus-visible,
.boss-icon-button:focus-visible,
.boss-card__edit:focus-visible,
.boss-detail-copy-link:focus-visible,
.boss-detail-action:focus-visible,
.boss-mode-switch button:focus-visible,
.boss-search button:focus-visible,
.boss-modal__header > button:focus-visible,
.boss-group__empty:focus-visible,
.boss-adjacent__link:focus-visible,
.boss-card:focus-visible {
  outline: 2px solid rgba(103, 232, 249, 0.9);
  outline-offset: 3px;
}

.boss-button--primary {
  background: linear-gradient(135deg, #22c7d1, #159da9);
  border-color: rgba(103, 232, 249, 0.55);
  box-shadow: 0 8px 24px rgba(13, 167, 177, 0.14);
  color: #031316;
}

.boss-button--primary:not(:disabled):hover {
  box-shadow: 0 10px 30px rgba(34, 211, 238, 0.23);
  filter: brightness(1.08);
}

.boss-button--quiet,
.boss-button--small {
  background: rgba(17, 27, 48, 0.7);
  color: #b8c9db;
}

.boss-button--quiet:not(:disabled):hover,
.boss-button--small:not(:disabled):hover {
  background: rgba(34, 211, 238, 0.08);
  border-color: rgba(69, 215, 223, 0.42);
  color: #ecfeff;
}

.boss-button--small {
  min-height: 2.2rem;
  padding: 0.4rem 0.7rem;
}

.boss-button--danger,
.boss-button--danger-quiet {
  border-color: rgba(251, 113, 133, 0.35);
}

.boss-button--danger {
  background: #be334d;
  color: white;
}

.boss-button--danger-quiet {
  background: rgba(190, 51, 77, 0.09);
  color: #fda4af;
}

.bosses-toolbar {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 1.5rem 0 0.5rem;
}

.boss-search {
  align-items: center;
  background: rgba(11, 18, 34, 0.7);
  border: 1px solid var(--boss-border);
  border-radius: 10px;
  display: flex;
  max-width: 34rem;
  padding: 0 0.7rem;
  transition: 160ms ease;
  width: 100%;
}

.boss-search:focus-within {
  border-color: rgba(69, 215, 223, 0.55);
  box-shadow: 0 0 0 3px rgba(69, 215, 223, 0.07);
}

.boss-search svg {
  fill: none;
  height: 1rem;
  stroke: #71839d;
  stroke-linecap: round;
  stroke-width: 1.8;
  width: 1rem;
}

.boss-search input {
  background: transparent;
  border: 0;
  color: #e6eef7;
  min-width: 0;
  outline: none;
  padding: 0.75rem;
  width: 100%;
}

.boss-search input::placeholder {
  color: #65758c;
}

.boss-search button {
  background: transparent;
  border: 0;
  color: #7f91aa;
  cursor: pointer;
  font-size: 1.2rem;
}

.bosses-count {
  color: #71839c;
  font-size: 0.76rem;
  margin: 0;
}

.bosses-count strong {
  color: #c9d7e6;
}

.boss-groups {
  display: grid;
  gap: clamp(2.8rem, 5vw, 4.5rem);
  padding-top: 2rem;
}

.boss-group {
  animation: group-in 420ms both;
  animation-delay: var(--group-delay);
}

@keyframes group-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.boss-group__heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.15rem;
}

.boss-group__heading > div {
  align-items: center;
  display: flex;
  gap: 0.8rem;
  min-width: 0;
}

.boss-group__index {
  color: rgba(141, 163, 190, 0.48);
  font-family: var(--nx-font-mono);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.boss-group__rule {
  background: var(--boss-accent);
  border-radius: 999px;
  box-shadow: 0 0 12px rgba(69, 215, 223, 0.55);
  height: 2rem;
  width: 3px;
}

.boss-group__title {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 0;
}

.boss-group h2 {
  color: #eaf1f8;
  font-family: var(--nx-font-display);
  font-size: 1.12rem;
  letter-spacing: 0.01em;
  margin: 0;
}

.boss-group__count {
  color: #63758e;
  font-size: 0.64rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.boss-icon-button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #71839c;
  cursor: pointer;
  display: inline-flex;
  height: 2.2rem;
  justify-content: center;
  transition: 150ms ease;
  width: 2.2rem;
}

.boss-icon-button:hover:not(:disabled) {
  background: rgba(69, 215, 223, 0.08);
  border-color: rgba(69, 215, 223, 0.25);
  color: #86edf2;
}

.boss-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.28;
}

.boss-icon-button svg {
  fill: none;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 1rem;
}

.boss-icon-button--danger:hover:not(:disabled) {
  background: rgba(251, 113, 133, 0.08);
  border-color: rgba(251, 113, 133, 0.25);
  color: #fb7185;
}

.boss-grid {
  align-items: stretch;
  display: grid;
  gap: clamp(0.85rem, 1.5vw, 1.2rem);
  grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
}

.boss-card-shell {
  animation: card-in 480ms both;
  animation-delay: var(--card-delay);
  display: flex;
  height: 100%;
  min-width: 0;
  position: relative;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
}

.boss-card {
  background: linear-gradient(160deg, rgba(15, 25, 44, 0.98), rgba(8, 14, 27, 0.98));
  border: 1px solid rgba(109, 147, 193, 0.21);
  border-radius: 17px;
  box-shadow: 0 14px 35px rgba(0, 0, 0, 0.17);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  text-decoration: none;
  transform: translateZ(0);
  transition:
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 180ms ease,
    box-shadow 220ms ease;
  width: 100%;
}

.boss-card-shell:hover .boss-card,
.boss-card:focus-visible {
  border-color: rgba(69, 215, 223, 0.5);
  box-shadow:
    0 20px 46px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(69, 215, 223, 0.08);
  transform: translateY(-5px);
}

.boss-card--spawn-up {
  border-color: rgba(74, 222, 128, 0.62);
  box-shadow:
    0 14px 35px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(74, 222, 128, 0.12),
    0 0 24px rgba(34, 197, 94, 0.22);
}

.boss-card--spawn-window {
  border-color: rgba(251, 146, 60, 0.65);
  box-shadow:
    0 14px 35px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(251, 146, 60, 0.11),
    0 0 24px rgba(249, 115, 22, 0.2);
}

.boss-card--spawn-down {
  border-color: rgba(248, 113, 113, 0.56);
  box-shadow:
    0 14px 35px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(248, 113, 113, 0.1),
    0 0 22px rgba(239, 68, 68, 0.18);
}

.boss-card-shell:hover .boss-card--spawn-up {
  border-color: rgba(74, 222, 128, 0.82);
  box-shadow:
    0 20px 46px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(74, 222, 128, 0.16),
    0 0 34px rgba(34, 197, 94, 0.3);
}

.boss-card-shell:hover .boss-card--spawn-window {
  border-color: rgba(251, 146, 60, 0.84);
  box-shadow:
    0 20px 46px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(251, 146, 60, 0.15),
    0 0 34px rgba(249, 115, 22, 0.28);
}

.boss-card-shell:hover .boss-card--spawn-down {
  border-color: rgba(248, 113, 113, 0.76);
  box-shadow:
    0 20px 46px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(248, 113, 113, 0.13),
    0 0 32px rgba(239, 68, 68, 0.24);
}

@media (prefers-reduced-motion: no-preference) {
  .boss-card--spawn-up {
    animation: boss-card-up-glow 4.5s ease-in-out 700ms infinite;
  }

  .boss-card-shell:hover .boss-card--spawn-up,
  .boss-card--spawn-up:focus-visible {
    animation-play-state: paused;
  }
}

@keyframes boss-card-up-glow {
  50% {
    border-color: rgba(74, 222, 128, 0.74);
    box-shadow:
      0 14px 35px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(74, 222, 128, 0.15),
      0 0 30px rgba(34, 197, 94, 0.28);
  }
}

.boss-card:focus-visible {
  border-color: rgba(69, 215, 223, 0.64);
  box-shadow: 0 0 0 4px rgba(69, 215, 223, 0.09);
}

.boss-card__media {
  aspect-ratio: 16 / 10;
  background: #101a2b;
  flex: 0 0 auto;
  overflow: hidden;
  position: relative;
}

.boss-card__media img,
.boss-detail-hero__media img,
.boss-form-preview img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.boss-card__media img {
  filter: saturate(0.88) contrast(1.03);
  transition:
    transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 300ms ease;
}

.boss-card-shell:hover .boss-card__media img,
.boss-card:focus-visible .boss-card__media img {
  filter: saturate(1.06) contrast(1.04);
  transform: scale(1.055);
}

.boss-card__shade {
  background:
    linear-gradient(180deg, rgba(4, 8, 15, 0.02) 30%, rgba(4, 8, 15, 0.7) 100%),
    linear-gradient(90deg, rgba(4, 8, 15, 0.13), transparent 58%);
  inset: 0;
  position: absolute;
}

.boss-card__open {
  align-items: center;
  backdrop-filter: blur(12px);
  background: rgba(5, 11, 21, 0.68);
  border: 1px solid rgba(202, 227, 243, 0.22);
  border-radius: 999px;
  top: 0.75rem;
  color: #e9f6f8;
  display: inline-flex;
  font-size: 0.63rem;
  font-weight: 750;
  gap: 0.35rem;
  left: 0.75rem;
  letter-spacing: 0.04em;
  opacity: 0;
  padding: 0.38rem 0.58rem;
  position: absolute;
  right: auto;
  transform: translateY(5px);
  transition: 180ms ease;
  z-index: 3;
}

.boss-card-shell:hover .boss-card__open,
.boss-card:focus-visible .boss-card__open {
  opacity: 1;
  transform: translateY(0);
}

.boss-card__open span {
  color: #67e8f9;
}

.boss-image-fallback {
  align-items: center;
  background:
    radial-gradient(circle at 50% 45%, rgba(69, 215, 223, 0.12), transparent 34%),
    linear-gradient(145deg, #15213a, #0a1120);
  display: flex;
  height: 100%;
  justify-content: center;
  width: 100%;
}

.boss-image-fallback svg,
.bosses-empty__mark svg {
  fill: none;
  height: 42%;
  max-height: 5rem;
  opacity: 0.58;
  stroke: #5bbdc5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  width: 42%;
}

.boss-card__body {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 5.8rem;
  flex-direction: column;
  height: 5.8rem;
  padding: 0.9rem 1.05rem 1.1rem;
}

.boss-card__meta {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.boss-card__meta time {
  color: #5f7189;
  font-family: var(--nx-font-mono);
  font-size: 0.59rem;
  letter-spacing: 0.03em;
}

.boss-card__zone {
  align-items: center;
  background: rgba(100, 136, 170, 0.09);
  border: 1px solid rgba(132, 167, 198, 0.15);
  border-radius: 999px;
  color: #8ca1b7;
  display: inline-flex;
  font-size: 0.59rem;
  font-weight: 700;
  gap: 0.3rem;
  letter-spacing: 0.015em;
  line-height: 1;
  max-width: calc(100% - 5rem);
  min-width: 0;
  padding: 0.25rem 0.42rem 0.24rem 0.36rem;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.boss-card__zone svg {
  fill: none;
  flex: 0 0 auto;
  height: 0.7rem;
  stroke: #6e91ac;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 0.7rem;
}

.boss-card__zone span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-card-shell:hover .boss-card__zone,
.boss-card:focus-visible .boss-card__zone {
  background: rgba(74, 167, 184, 0.1);
  border-color: rgba(101, 192, 205, 0.22);
  color: #a9c4d4;
}

.boss-card__zone--unmapped {
  background: rgba(95, 113, 137, 0.05);
  border-color: rgba(95, 113, 137, 0.11);
  color: #62758c;
}

.boss-card__zone--unmapped svg {
  stroke: #5f7189;
}

.boss-card-shell:hover .boss-card__zone--unmapped,
.boss-card:focus-visible .boss-card__zone--unmapped {
  background: rgba(95, 113, 137, 0.08);
  border-color: rgba(95, 113, 137, 0.16);
  color: #758aa2;
}

.boss-card__title-row {
  align-items: end;
  display: flex;
  flex: 1;
  gap: 1rem;
  justify-content: space-between;
  margin-top: 0.35rem;
  min-height: 2.4em;
}

.boss-card h3 {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #eff5fb;
  display: -webkit-box;
  font-family: var(--nx-font-display);
  font-size: 1.08rem;
  letter-spacing: -0.015em;
  line-height: 1.2;
  margin: 0;
  overflow: hidden;
}

.boss-card__arrow {
  flex: 0 0 auto;
  color: #68809b;
  transition: 170ms ease;
}

.boss-card-shell:hover .boss-card__arrow,
.boss-card:focus-visible .boss-card__arrow {
  color: #67e8f9;
  transform: translate(2px, -2px);
}

.boss-card__edit {
  align-items: center;
  backdrop-filter: blur(10px);
  background: rgba(5, 11, 22, 0.72);
  border: 1px solid rgba(148, 184, 222, 0.25);
  border-radius: 8px;
  color: #c4d3e3;
  cursor: pointer;
  display: flex;
  height: 2rem;
  justify-content: center;
  opacity: 0;
  position: absolute;
  right: 0.7rem;
  top: 0.7rem;
  transform: translateY(-4px);
  transition: 170ms ease;
  width: 2rem;
  z-index: 2;
}

.boss-card-shell:hover .boss-card__edit,
.boss-card__edit:focus-visible {
  opacity: 1;
  transform: translateY(0);
}

.boss-card__edit:hover {
  background: rgba(17, 181, 192, 0.88);
  color: #031316;
}

.boss-card__edit svg {
  fill: none;
  height: 0.95rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 0.95rem;
}

.boss-group__empty {
  background: rgba(16, 26, 45, 0.34);
  border: 1px dashed rgba(111, 151, 196, 0.25);
  border-radius: 12px;
  color: #71849e;
  cursor: pointer;
  padding: 1.3rem;
  transition: 150ms ease;
  width: 100%;
}

.boss-group__empty span {
  color: var(--boss-accent);
  font-size: 1.1rem;
  margin-right: 0.4rem;
}

.boss-group__empty:hover {
  background: rgba(69, 215, 223, 0.05);
  border-color: rgba(69, 215, 223, 0.4);
  color: #b8cadd;
}

.bosses-empty,
.bosses-error,
.bosses-loading {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 28rem;
  text-align: center;
}

.bosses-empty__mark {
  align-items: center;
  background: rgba(69, 215, 223, 0.06);
  border: 1px solid rgba(69, 215, 223, 0.16);
  border-radius: 50%;
  display: flex;
  height: 6rem;
  justify-content: center;
  margin-bottom: 1rem;
  width: 6rem;
}

.bosses-empty h2,
.bosses-error h1 {
  color: #edf4fb;
  font-family: var(--nx-font-display);
  margin: 0;
}

.bosses-empty p,
.bosses-error p,
.bosses-loading p {
  color: #8498b1;
  max-width: 32rem;
}

.bosses-empty--search {
  min-height: 20rem;
}

.bosses-error__icon,
.boss-confirm__mark {
  align-items: center;
  background: rgba(251, 113, 133, 0.09);
  border: 1px solid rgba(251, 113, 133, 0.25);
  border-radius: 50%;
  color: #fb7185;
  display: flex;
  font-size: 1.4rem;
  font-weight: 800;
  height: 3.2rem;
  justify-content: center;
  margin-bottom: 1rem;
  width: 3.2rem;
}

/* Detail */
.bosses-page--detail {
  max-width: 1420px;
  padding-top: clamp(1rem, 2vw, 2rem);
}

.boss-detail-hero {
  background: #0b1323;
  border: 1px solid rgba(103, 146, 194, 0.22);
  border-radius: 22px;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.24);
  min-height: clamp(22rem, 38vw, 27rem);
  overflow: hidden;
  position: relative;
}

.boss-detail-hero__media,
.boss-detail-hero__veil {
  inset: 0;
  position: absolute;
}

.boss-detail-hero__media img {
  filter: saturate(0.9) contrast(1.03);
}

.boss-image-fallback--hero {
  position: absolute;
}

.boss-detail-hero__veil {
  background:
    linear-gradient(
      90deg,
      rgba(4, 9, 18, 0.97) 0%,
      rgba(4, 9, 18, 0.77) 43%,
      rgba(4, 9, 18, 0.12) 81%
    ),
    linear-gradient(0deg, rgba(5, 10, 20, 0.66), transparent 48%);
}

.boss-detail-hero__content {
  display: flex;
  flex-direction: column;
  inset: 0;
  justify-content: space-between;
  padding: clamp(1.25rem, 3.5vw, 3.2rem);
  position: absolute;
}

.boss-detail-hero__content::after {
  background: linear-gradient(90deg, var(--boss-accent), transparent);
  bottom: 0;
  content: '';
  height: 2px;
  left: 0;
  opacity: 0.75;
  position: absolute;
  width: min(36%, 24rem);
}

.boss-detail-back {
  align-items: center;
  color: #b9c8d8;
  display: inline-flex;
  font-size: 0.78rem;
  gap: 0.45rem;
  text-decoration: none;
  width: fit-content;
}

.boss-detail-back:hover {
  color: #67e8f9;
}

.boss-detail-hero__title {
  max-width: 48rem;
}

.boss-detail-title-line {
  align-items: flex-end;
  display: flex;
  gap: 0.8rem;
}

.boss-detail-hero__title h1 {
  color: #f7fafc;
  flex: 0 1 auto;
  font-family: var(--nx-font-display);
  font-size: clamp(2.6rem, 6vw, 5.5rem);
  letter-spacing: -0.055em;
  line-height: 0.95;
  margin: 0;
  text-wrap: balance;
}

.boss-detail-share {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  margin-bottom: 0.28rem;
  position: relative;
}

.boss-detail-copy-link {
  align-items: center;
  backdrop-filter: blur(12px);
  background: rgba(7, 13, 25, 0.54);
  border: 1px solid rgba(175, 203, 231, 0.24);
  border-radius: 999px;
  color: #b9c9da;
  cursor: pointer;
  display: inline-flex;
  height: 2.15rem;
  justify-content: center;
  padding: 0;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
  width: 2.15rem;
}

.boss-detail-copy-link:hover {
  background: rgba(69, 215, 223, 0.13);
  border-color: rgba(69, 215, 223, 0.42);
  color: #67e8f9;
  transform: translateY(-1px);
}

.boss-detail-copy-link.is-copied {
  background: rgba(69, 215, 150, 0.14);
  border-color: rgba(94, 234, 169, 0.4);
  color: #7df0b4;
}

.boss-detail-copy-link svg {
  fill: none;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 1rem;
}

.boss-detail-copy-feedback {
  background: rgba(6, 13, 24, 0.9);
  border: 1px solid rgba(94, 234, 169, 0.28);
  border-radius: 999px;
  color: #9ff4c7;
  font-size: 0.65rem;
  font-weight: 750;
  left: calc(100% + 0.45rem);
  letter-spacing: 0.04em;
  padding: 0.28rem 0.5rem;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
}

.boss-share-feedback-enter-active,
.boss-share-feedback-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.boss-share-feedback-enter-from,
.boss-share-feedback-leave-to {
  opacity: 0;
  transform: translate(-0.2rem, -50%);
}

.boss-detail-meta {
  color: #91a4ba;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.72rem;
  gap: 1.25rem;
  margin-top: 1rem;
}

.boss-detail-meta span + span {
  position: relative;
}

.boss-detail-meta span + span::before {
  color: #4c617b;
  content: '•';
  left: -0.8rem;
  position: absolute;
}

.boss-detail-actions {
  align-items: center;
  bottom: 2.6rem;
  display: flex;
  gap: 0.55rem;
  position: absolute;
  right: 2.6rem;
}

.boss-detail-action {
  align-items: center;
  backdrop-filter: blur(12px);
  background: rgba(7, 13, 25, 0.6);
  border: 1px solid rgba(175, 203, 231, 0.25);
  border-radius: 9px;
  color: #d4e0ec;
  cursor: pointer;
  display: flex;
  font-size: 0.76rem;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem;
}

.boss-detail-action:hover {
  background: rgba(69, 215, 223, 0.13);
  border-color: rgba(69, 215, 223, 0.42);
}

.boss-detail-action svg {
  fill: none;
  height: 0.95rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 0.95rem;
}

.boss-notes-shell {
  margin: 1.4rem auto 0;
  max-width: 1180px;
}

.boss-notes-toolbar {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 0.45rem 0 1rem;
}

.boss-notes-toolbar__heading p {
  color: #57c8d0;
  font-size: 0.61rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  margin: 0 0 0.25rem;
  text-transform: uppercase;
}

.boss-notes-toolbar__heading h2 {
  color: #eaf1f8;
  font-family: var(--nx-font-display);
  font-size: 1.18rem;
  letter-spacing: -0.015em;
  margin: 0;
}

.boss-notes-toolbar__actions {
  align-items: center;
  display: flex;
  gap: 0.75rem;
}

.boss-notes-toolbar__actions > p {
  color: #57c8d0;
  font-size: 0.7rem;
  margin: 0;
}

.boss-mode-switch {
  background: rgba(10, 17, 31, 0.7);
  border: 1px solid rgba(101, 141, 186, 0.22);
  border-radius: 10px;
  display: inline-flex;
  padding: 0.22rem;
}

.boss-mode-switch button {
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: #7c90aa;
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 750;
  min-width: 4.5rem;
  padding: 0.48rem 0.75rem;
}

.boss-mode-switch button.is-active {
  background: rgba(69, 215, 223, 0.12);
  box-shadow: inset 0 0 0 1px rgba(69, 215, 223, 0.22);
  color: #a5f3f6;
}

.boss-mode-switch button:not(.is-active):hover {
  color: #c8d7e6;
}

.boss-edit-lock {
  align-items: center;
  border: 1px solid;
  border-radius: 12px;
  display: flex;
  gap: 0.75rem;
  margin: 0 0 0.85rem;
  padding: 0.78rem 0.9rem;
}

.boss-edit-lock > svg {
  fill: none;
  flex: 0 0 auto;
  height: 1.25rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 1.25rem;
}

.boss-edit-lock > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.13rem;
}

.boss-edit-lock strong {
  color: #e9f6f7;
  font-size: 0.78rem;
}

.boss-edit-lock span {
  color: #9db0c4;
  font-size: 0.72rem;
  line-height: 1.45;
}

.boss-edit-lock--mine {
  background: rgba(69, 215, 223, 0.07);
  border-color: rgba(69, 215, 223, 0.24);
  color: #67e8f9;
}

.boss-edit-lock--blocked {
  background: rgba(251, 191, 36, 0.07);
  border-color: rgba(251, 191, 36, 0.28);
  color: #fbbf24;
}

.boss-edit-lock > button {
  background: transparent;
  border: 0;
  color: #9db0c4;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  padding: 0.3rem;
}

.boss-edit-lock > button:hover {
  color: #eef6fb;
}

.boss-notes-document {
  --boss-notes-document-padding: clamp(1.5rem, 4.5vw, 4.25rem);
  background:
    linear-gradient(180deg, rgba(16, 26, 45, 0.78), rgba(9, 16, 29, 0.88)), var(--boss-surface);
  border: 1px solid rgba(103, 146, 194, 0.2);
  border-radius: 18px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
  min-height: 24rem;
  padding: var(--boss-notes-document-padding);
  position: relative;
}

.boss-notes-edit-mode,
.boss-notes-edit {
  min-width: 0;
}

.boss-notes-edit-layout {
  align-items: start;
  display: grid;
  gap: clamp(1.4rem, 3vw, 2.6rem);
  grid-template-columns: minmax(0, 1fr) minmax(0, 36rem);
}

.boss-raid-utilities {
  align-items: start;
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(2, minmax(0, 17.5rem));
  justify-content: end;
  width: 100%;
}

.boss-notes-document__content {
  min-width: 0;
}

.boss-notes-document__content :deep(.wiki-content)::before {
  content: '';
  float: right;
  height: 16rem;
  margin: 0 0 1.25rem 2rem;
  width: 36rem;
}

.boss-notes-document__content :deep(.wiki-content:has(> .wiki-file--right:first-of-type))::before {
  content: none;
}

.boss-notes-document__content :deep(.wiki-content--empty) {
  display: block;
  padding-right: 19.5rem;
}

.boss-notes-document__content :deep(.wiki-content--empty)::before {
  content: none;
}

.boss-notes-document__content :deep(.wiki-content > .wiki-file--right:first-of-type) {
  anchor-name: --boss-primary-media;
  margin-bottom: calc(14.75rem + 2.5rem);
}

.boss-notes-document > .boss-raid-utilities {
  position: absolute;
  right: var(--boss-notes-document-padding);
  top: var(--boss-notes-document-padding);
  position-anchor: --boss-primary-media;
  right: anchor(right, var(--boss-notes-document-padding));
  top: anchor(bottom, var(--boss-notes-document-padding));
  margin-top: 1.25rem;
  z-index: 1;
}

.boss-notes-empty {
  align-items: center;
  display: flex;
  flex-direction: column;
  padding: 2rem;
}

.boss-notes-empty svg {
  fill: none;
  height: 3.5rem;
  margin-bottom: 1rem;
  stroke: #52718e;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.4;
  width: 3.5rem;
}

.boss-notes-empty h2 {
  color: #dce7f2;
  font-family: var(--nx-font-display);
  margin: 0;
}

.boss-notes-empty p {
  margin: 0.5rem 0 1.3rem;
}

.boss-notes-edit__footer {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 1rem 0;
}

.boss-notes-edit__footer--sticky {
  backdrop-filter: blur(16px);
  background: rgba(7, 14, 26, 0.92);
  border: 1px solid rgba(103, 146, 194, 0.2);
  border-radius: 12px;
  bottom: 0.75rem;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.3);
  margin-top: 0.65rem;
  padding: 0.72rem 0.8rem;
  position: sticky;
  z-index: 8;
}

.boss-notes-edit--plain {
  min-height: 24rem;
}

.boss-suggestion-intro {
  align-items: center;
  background: linear-gradient(100deg, rgba(129, 140, 248, 0.12), rgba(69, 215, 223, 0.06));
  border: 1px solid rgba(129, 140, 248, 0.25);
  border-radius: 12px;
  color: #aeb8ff;
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.78rem 0.9rem;
}

.boss-suggestion-intro svg {
  fill: none;
  flex: 0 0 auto;
  height: 1.25rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 1.25rem;
}

.boss-suggestion-intro > div {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.boss-suggestion-intro strong {
  color: #e7e9ff;
  font-size: 0.76rem;
}

.boss-suggestion-intro span {
  color: #939fc0;
  font-size: 0.67rem;
}

.boss-suggestion-cures {
  align-items: center;
  background: rgba(9, 16, 29, 0.78);
  border: 1px solid rgba(103, 146, 194, 0.18);
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
}

.boss-suggestion-cures > div {
  display: flex;
  flex: 1 1 13rem;
  flex-direction: column;
  gap: 0.1rem;
}

.boss-suggestion-cures > div strong {
  color: #dce7f2;
  font-size: 0.72rem;
}

.boss-suggestion-cures > div span {
  color: #6f839a;
  font-size: 0.62rem;
}

.boss-suggestion-cures > button {
  background: rgba(113, 144, 181, 0.07);
  border: 1px solid rgba(113, 144, 181, 0.18);
  border-radius: 8px;
  color: #7e92a9;
  cursor: pointer;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 0.48rem 0.62rem;
}

.boss-suggestion-cures > button.is-selected {
  background: rgba(69, 215, 223, 0.1);
  border-color: rgba(69, 215, 223, 0.32);
  color: #a9f1f4;
}

.boss-suggestion-cures > button span {
  margin-right: 0.25rem;
}

.boss-plain-loading,
.boss-plain-error {
  align-items: center;
  background: rgba(9, 16, 29, 0.72);
  border: 1px solid rgba(103, 146, 194, 0.18);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 18rem;
  padding: 2rem;
  text-align: center;
}

.boss-plain-loading p,
.boss-plain-error p {
  color: #8296ad;
  font-size: 0.8rem;
  line-height: 1.55;
  margin: 0.75rem 0 0;
}

.boss-plain-error strong {
  color: #dce7f2;
}

.boss-plain-error .boss-button {
  margin-top: 1rem;
}

.boss-notes-edit__footer p {
  color: #72859f;
  font-size: 0.72rem;
  margin: 0;
}

.boss-notes-edit__shortcuts {
  margin-left: 0.75rem;
}

.boss-notes-edit__shortcuts kbd {
  background: rgba(119, 157, 195, 0.08);
  border: 1px solid rgba(119, 157, 195, 0.16);
  border-radius: 4px;
  color: #9bb0c8;
  font: inherit;
  padding: 0.12rem 0.28rem;
}

.boss-notes-edit__unsaved {
  align-items: center;
  color: #f4cf70;
  display: inline-flex;
  gap: 0.4rem;
}

.boss-notes-edit__unsaved::before {
  background: #f4cf70;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(244, 207, 112, 0.55);
  content: '';
  height: 0.4rem;
  width: 0.4rem;
}

.notes-mode-enter-active,
.notes-mode-leave-active {
  transition:
    opacity 170ms ease,
    transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.notes-mode-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.notes-mode-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

.boss-adjacent {
  border-top: 1px solid var(--boss-border);
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  margin-top: 2rem;
  padding-top: 1.25rem;
}

.boss-adjacent__link {
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  padding: 0.85rem 0.9rem;
  text-decoration: none;
  transition: 160ms ease;
}

.boss-adjacent__link:hover {
  background: rgba(69, 215, 223, 0.055);
}

.boss-adjacent__link > span {
  color: #687c95;
  font-size: 0.61rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.boss-adjacent__link strong {
  color: #dce8f3;
  font-family: var(--nx-font-display);
  font-size: 1rem;
}

.boss-adjacent__link:hover strong {
  color: #8ceff3;
}

.boss-adjacent__link--next {
  text-align: right;
}

.boss-notes-edit__footer > div {
  display: flex;
  gap: 0.55rem;
}

/* Modals */
.boss-modal-backdrop {
  align-items: center;
  backdrop-filter: blur(12px) saturate(0.75);
  background:
    radial-gradient(circle at 50% 35%, rgba(20, 107, 119, 0.11), transparent 34%),
    rgba(2, 6, 14, 0.8);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: fixed;
  z-index: 1300;
}

.boss-modal-backdrop--confirm {
  z-index: 1350;
}

.boss-modal,
.boss-confirm {
  background:
    radial-gradient(circle at 8% 0%, rgba(69, 215, 223, 0.065), transparent 28%),
    linear-gradient(160deg, #101a2d 0%, #0a1221 52%, #080f1d 100%);
  border: 1px solid rgba(121, 169, 216, 0.3);
  border-radius: 20px;
  box-shadow:
    0 36px 110px rgba(0, 0, 0, 0.58),
    0 0 0 1px rgba(69, 215, 223, 0.025) inset;
  isolation: isolate;
  max-height: min(88vh, 850px);
  max-width: 760px;
  overflow: auto;
  position: relative;
  scrollbar-color: rgba(91, 146, 177, 0.45) transparent;
  width: 100%;
}

.boss-modal::before,
.boss-confirm::before {
  background: linear-gradient(
    90deg,
    var(--boss-accent),
    rgba(129, 140, 248, 0.22),
    transparent 82%
  );
  content: '';
  height: 2px;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 3;
}

.boss-confirm::before {
  background: linear-gradient(90deg, #fb7185, rgba(251, 113, 133, 0.2), transparent 82%);
}

.boss-confirm--discard::before {
  background: linear-gradient(90deg, #45d7df, rgba(129, 140, 248, 0.25), transparent 82%);
}

.boss-modal--compact {
  max-width: 650px;
}

.boss-modal--review {
  max-width: 880px;
}

.boss-modal-loading,
.boss-modal-empty {
  align-items: center;
  color: #7f93aa;
  display: flex;
  flex-direction: column;
  font-size: 0.76rem;
  justify-content: center;
  min-height: 12rem;
  padding: 2rem;
  text-align: center;
}

.boss-modal-empty strong {
  color: #dce7f2;
  font-size: 0.86rem;
}

.boss-modal-empty p {
  margin: 0.35rem 0 0;
}

.boss-history {
  padding: 1rem 1.3rem 1.2rem;
}

.boss-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.boss-history__list li {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 0.75rem 0;
  position: relative;
}

.boss-history__list li:not(:last-child)::after {
  background: rgba(98, 145, 186, 0.18);
  bottom: -0.25rem;
  content: '';
  left: 0.28rem;
  position: absolute;
  top: 1.65rem;
  width: 1px;
}

.boss-history__dot {
  background: #45d7df;
  border: 3px solid rgba(69, 215, 223, 0.13);
  border-radius: 50%;
  box-sizing: content-box;
  height: 0.38rem;
  margin-top: 0.22rem;
  width: 0.38rem;
}

.boss-history__list li > div {
  display: grid;
  gap: 0.16rem;
}

.boss-history__list strong {
  color: #dfeaf4;
  font-size: 0.74rem;
}

.boss-history__list p,
.boss-history__list time {
  color: #7489a1;
  font-size: 0.63rem;
  margin: 0;
}

.boss-history__list time {
  color: #566b83;
}

.boss-suggestions {
  padding: 1rem 1.2rem 1.3rem;
}

.boss-suggestions__list {
  display: grid;
  gap: 1rem;
}

.boss-suggestions__list > article {
  background: rgba(6, 12, 23, 0.58);
  border: 1px solid rgba(103, 146, 194, 0.2);
  border-radius: 13px;
  overflow: hidden;
}

.boss-suggestions__list > article > header {
  align-items: center;
  border-bottom: 1px solid rgba(103, 146, 194, 0.15);
  display: flex;
  justify-content: space-between;
  padding: 0.72rem 0.85rem;
}

.boss-suggestions__list header > div {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.boss-suggestions__list header span,
.boss-suggestions__list header time,
.boss-suggestions__cures span {
  color: #647991;
  font-size: 0.58rem;
}

.boss-suggestions__list header strong {
  color: #dce7f2;
  font-size: 0.72rem;
}

.boss-suggestions__cures {
  align-items: center;
  background: rgba(69, 215, 223, 0.045);
  display: flex;
  gap: 0.55rem;
  padding: 0.55rem 0.85rem;
}

.boss-suggestions__cures strong {
  color: #8bdfe3;
  font-size: 0.64rem;
}

.boss-suggestions__preview {
  max-height: 24rem;
  overflow: auto;
  padding: 0.8rem 0.9rem;
}

.boss-suggestions__preview :deep(.mediawiki-content) {
  font-size: 0.78rem;
}

.boss-suggestions__empty-notes {
  color: #6d829a;
  font-size: 0.72rem;
  margin: 1rem;
  text-align: center;
}

.boss-suggestions__list > article > footer {
  border-top: 1px solid rgba(103, 146, 194, 0.15);
  display: flex;
  gap: 0.55rem;
  justify-content: flex-end;
  padding: 0.7rem 0.85rem;
}

.boss-modal__header {
  align-items: center;
  backdrop-filter: blur(16px);
  background: rgba(11, 19, 34, 0.88);
  border-bottom: 1px solid rgba(103, 146, 194, 0.17);
  display: flex;
  justify-content: space-between;
  padding: 1.15rem 1.35rem;
  position: sticky;
  top: 0;
  z-index: 2;
}

.boss-modal__identity {
  align-items: center;
  display: flex;
  gap: 0.85rem;
  min-width: 0;
}

.boss-modal__mark {
  align-items: center;
  background: linear-gradient(145deg, rgba(69, 215, 223, 0.13), rgba(69, 215, 223, 0.035));
  border: 1px solid rgba(69, 215, 223, 0.22);
  border-radius: 11px;
  box-shadow: 0 8px 22px rgba(2, 12, 20, 0.2);
  color: #7ee7eb;
  display: inline-flex;
  flex: 0 0 auto;
  height: 2.65rem;
  justify-content: center;
  width: 2.65rem;
}

.boss-modal__mark svg {
  fill: none;
  height: 1.2rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 1.2rem;
}

.boss-modal__header p {
  font-size: 0.61rem;
  margin-bottom: 0.35rem;
}

.boss-modal__header h2 {
  color: #eff5fb;
  font-family: var(--nx-font-display);
  font-size: 1.28rem;
  margin: 0;
}

.boss-modal__header > button {
  background: transparent;
  border: 0;
  color: #8092a9;
  cursor: pointer;
  font-size: 1.6rem;
  align-items: center;
  border-radius: 8px;
  display: inline-flex;
  height: 2.25rem;
  justify-content: center;
  transition: 150ms ease;
  width: 2.25rem;
}

.boss-modal__header > button:hover {
  background: rgba(69, 215, 223, 0.07);
  color: white;
}

.boss-modal__body {
  padding: 1.4rem;
}

.boss-modal:not(.boss-modal--compact) .boss-modal__body {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 0.85fr 1.15fr;
}

.boss-modal.boss-modal--review .boss-modal__body {
  display: block;
}

.boss-form-preview {
  aspect-ratio: 4 / 3.35;
  background: #080f1c;
  border: 1px solid rgba(116, 162, 207, 0.26);
  border-radius: 15px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.26);
  overflow: hidden;
  position: relative;
}

.boss-form-preview::after {
  background:
    linear-gradient(0deg, rgba(3, 7, 14, 0.92), transparent 52%),
    linear-gradient(90deg, rgba(3, 7, 14, 0.18), transparent 65%);
  content: '';
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.boss-form-preview__badge {
  backdrop-filter: blur(10px);
  background: rgba(5, 11, 21, 0.62);
  border: 1px solid rgba(190, 221, 239, 0.2);
  border-radius: 999px;
  color: #9fb1c6;
  font-size: 0.57rem;
  font-weight: 750;
  left: 0.75rem;
  letter-spacing: 0.08em;
  padding: 0.3rem 0.48rem;
  position: absolute;
  text-transform: uppercase;
  top: 0.75rem;
  z-index: 1;
}

.boss-form-preview__name {
  background: linear-gradient(transparent, rgba(3, 7, 14, 0.88));
  bottom: 0;
  color: #f4f8fc;
  font-family: var(--nx-font-display);
  font-size: 1.12rem;
  font-weight: 700;
  left: 0;
  overflow: hidden;
  padding: 2rem 0.85rem 0.7rem;
  position: absolute;
  right: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1;
}

.boss-form-preview--with-respawn .boss-form-preview__name {
  bottom: 3.05rem;
  padding-bottom: 0.55rem;
}

.boss-form-fields,
.boss-groups-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.boss-form-fields__intro {
  border-bottom: 1px solid rgba(103, 146, 194, 0.14);
  padding-bottom: 0.85rem;
}

.boss-form-fields__intro h3 {
  color: #e6eff7;
  font-family: var(--nx-font-display);
  font-size: 0.93rem;
  margin: 0;
}

.boss-form-fields__intro p,
.boss-modal__intro {
  color: #71859e;
  font-size: 0.7rem;
  line-height: 1.55;
  margin: 0.3rem 0 0;
}

.boss-tracker-map {
  background:
    radial-gradient(circle at 0 0, rgba(69, 215, 223, 0.085), transparent 42%),
    rgba(4, 10, 19, 0.48);
  border: 1px solid rgba(103, 146, 194, 0.19);
  border-radius: 13px;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.8rem;
}

.boss-tracker-map__heading {
  align-items: center;
  display: flex;
  gap: 0.65rem;
}

.boss-tracker-map__heading > span:last-child,
.boss-tracker-map__summary > span:last-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.boss-tracker-map__heading strong {
  color: #dce8f2;
  font-size: 0.72rem;
}

.boss-tracker-map__heading small,
.boss-tracker-map__summary small {
  color: #70849a;
  font-size: 0.59rem;
  line-height: 1.4;
  margin-top: 0.12rem;
}

.boss-tracker-map__mark {
  align-items: center;
  background: rgba(69, 215, 223, 0.08);
  border: 1px solid rgba(69, 215, 223, 0.2);
  border-radius: 9px;
  color: #73dce2;
  display: inline-flex;
  flex: 0 0 auto;
  height: 2rem;
  justify-content: center;
  width: 2rem;
}

.boss-tracker-map__mark svg {
  fill: none;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
  width: 1rem;
}

.boss-tracker-map__summary {
  align-items: center;
  border-top: 1px solid rgba(103, 146, 194, 0.13);
  display: grid;
  gap: 0.55rem;
  grid-template-columns: auto minmax(0, 1fr);
  margin: 0;
  padding-top: 0.65rem;
}

.boss-tracker-map__summary strong {
  color: #cfe0ed;
  font-size: 0.66rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-tracker-map__signal {
  background: #45d7df;
  border-radius: 50%;
  box-shadow:
    0 0 0 4px rgba(69, 215, 223, 0.08),
    0 0 13px rgba(69, 215, 223, 0.42);
  height: 0.46rem;
  width: 0.46rem;
}

.boss-tracker-map__empty {
  border-top: 1px solid rgba(103, 146, 194, 0.12);
  color: #65798f;
  font-size: 0.59rem;
  line-height: 1.45;
  margin: 0;
  padding-top: 0.6rem;
}

.boss-modal__intro {
  margin: 0;
  max-width: 48rem;
}

.boss-image-field {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.boss-image-field__heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.boss-image-field__heading > span:first-child {
  color: #9eb1c7;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.boss-image-field__heading > span:first-child small {
  color: #657992;
  font-weight: 500;
  margin-left: 0.35rem;
}

.boss-image-field__heading > span:last-child {
  color: #647a94;
  font-size: 0.61rem;
}

.boss-image-source-switch {
  background: rgba(3, 8, 16, 0.55);
  border: 1px solid rgba(103, 146, 194, 0.19);
  border-radius: 11px;
  display: grid;
  gap: 0.25rem;
  grid-template-columns: 1fr 1fr;
  padding: 0.25rem;
}

.boss-image-source-switch button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #72879f;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.67rem;
  font-weight: 750;
  gap: 0.42rem;
  justify-content: center;
  min-height: 2.1rem;
  padding: 0.4rem 0.65rem;
  transition: 160ms ease;
}

.boss-image-source-switch button:hover {
  background: rgba(69, 215, 223, 0.045);
  color: #b6c7d8;
}

.boss-image-source-switch button.is-active {
  background: linear-gradient(145deg, rgba(69, 215, 223, 0.15), rgba(69, 215, 223, 0.07));
  border-color: rgba(69, 215, 223, 0.24);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.15);
  color: #a7f0f3;
}

.boss-image-source-switch button:focus-visible,
.boss-image-dropzone:focus-visible,
.boss-image-upload__meta button:focus-visible {
  outline: 2px solid rgba(69, 215, 223, 0.72);
  outline-offset: 2px;
}

.boss-image-source-switch svg,
.boss-image-dropzone svg,
.boss-image-url-field__icon svg {
  fill: none;
  height: 0.9rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 0.9rem;
}

.boss-image-upload {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.boss-image-upload__input {
  display: none;
}

.boss-image-dropzone {
  align-items: center;
  background:
    radial-gradient(circle at 0% 50%, rgba(69, 215, 223, 0.07), transparent 38%),
    rgba(4, 10, 20, 0.57);
  border: 1px dashed rgba(104, 165, 195, 0.34);
  border-radius: 11px;
  cursor: pointer;
  display: grid;
  gap: 0.65rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 4rem;
  padding: 0.65rem;
  transition: 170ms ease;
}

.boss-image-dropzone:hover,
.boss-image-dropzone.is-dragging {
  background:
    radial-gradient(circle at 0% 50%, rgba(69, 215, 223, 0.13), transparent 44%),
    rgba(7, 18, 31, 0.78);
  border-color: rgba(69, 215, 223, 0.58);
  transform: translateY(-1px);
}

.boss-image-dropzone.has-image {
  border-style: solid;
}

.boss-image-dropzone__icon {
  align-items: center;
  background: rgba(69, 215, 223, 0.09);
  border: 1px solid rgba(69, 215, 223, 0.17);
  border-radius: 9px;
  color: #65d8de;
  display: inline-flex;
  height: 2.25rem;
  justify-content: center;
  width: 2.25rem;
}

.boss-image-dropzone__icon svg {
  height: 1rem;
  width: 1rem;
}

.boss-image-dropzone__copy {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 0;
}

.boss-image-dropzone__copy strong {
  color: #dbe7f2;
  font-size: 0.69rem;
  font-weight: 720;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-image-dropzone__copy small {
  color: #647a93;
  font-size: 0.59rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boss-image-dropzone__action {
  background: rgba(109, 157, 196, 0.09);
  border: 1px solid rgba(109, 157, 196, 0.18);
  border-radius: 8px;
  color: #9db1c5;
  font-size: 0.61rem;
  font-weight: 750;
  padding: 0.38rem 0.5rem;
}

.boss-image-upload__meta {
  align-items: center;
  color: #5e7289;
  display: flex;
  font-size: 0.59rem;
  justify-content: space-between;
  padding-inline: 0.08rem;
}

.boss-image-paste-hint {
  align-items: center;
  display: inline-flex;
  gap: 0.32rem;
}

.boss-image-paste-hint kbd {
  background: rgba(99, 139, 176, 0.09);
  border: 1px solid rgba(110, 155, 198, 0.18);
  border-bottom-color: rgba(110, 155, 198, 0.3);
  border-radius: 4px;
  color: #8ca2b9;
  font-family: var(--nx-font-mono);
  font-size: 0.53rem;
  line-height: 1;
  padding: 0.18rem 0.24rem;
}

.boss-image-upload__meta button {
  background: transparent;
  border: 0;
  color: #d38b99;
  cursor: pointer;
  font-size: 0.59rem;
  font-weight: 700;
  padding: 0.18rem;
}

.boss-image-upload__meta button:hover {
  color: #f4a7b5;
}

.boss-image-url-field {
  position: relative;
}

.boss-form-fields .boss-image-url-field input {
  padding-left: 2.35rem;
}

.boss-form-fields .boss-image-url-field > .boss-image-url-field__icon {
  color: #5f91a3;
  left: 0.78rem;
  line-height: 0;
  position: absolute;
  top: 0.92rem;
  z-index: 1;
}

.boss-form-fields .boss-image-url-field > small {
  color: #657891;
  font-size: 0.62rem;
}

.boss-group-order-hint {
  align-items: center;
  background: rgba(69, 215, 223, 0.035);
  border: 1px solid rgba(69, 215, 223, 0.12);
  border-radius: 10px;
  color: #8498b0;
  display: flex;
  font-size: 0.67rem;
  gap: 0.55rem;
  line-height: 1.45;
  padding: 0.58rem 0.7rem;
}

.boss-group-order-hint svg {
  fill: #49ccd3;
  flex: 0 0 auto;
  height: 1rem;
  width: 1rem;
}

.boss-group-order-hint strong {
  color: #8ee7eb;
  font-size: 0.62rem;
  font-weight: 750;
  margin-left: auto;
  min-width: 5.5rem;
  text-align: right;
}

.boss-form-fields label,
.boss-group-create label,
.boss-group-row label {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.boss-form-fields label > span,
.boss-group-create label > span {
  color: #9eb1c7;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.boss-form-fields label > span small {
  color: #657992;
  font-weight: 500;
  margin-left: 0.35rem;
}

.boss-form-fields input,
.boss-form-fields select,
.boss-group-create input,
.boss-group-row input {
  background: rgba(4, 9, 18, 0.72);
  border: 1px solid rgba(106, 149, 196, 0.28);
  border-radius: 10px;
  color: #e5edf6;
  min-height: 2.8rem;
  outline: none;
  padding: 0.65rem 0.75rem;
  width: 100%;
  transition: 150ms ease;
}

.boss-form-fields input:hover,
.boss-form-fields select:hover,
.boss-group-create input:hover,
.boss-group-row input:hover {
  border-color: rgba(124, 170, 216, 0.42);
}

.boss-form-fields select option {
  background: #0c1425;
}

.boss-form-fields input:focus,
.boss-form-fields select:focus,
.boss-group-create input:focus,
.boss-group-row input:focus {
  border-color: rgba(69, 215, 223, 0.55);
  box-shadow: 0 0 0 3px rgba(69, 215, 223, 0.06);
}

.boss-form-fields label > small {
  color: #657891;
  font-size: 0.66rem;
}

.boss-modal__footer {
  align-items: center;
  backdrop-filter: blur(16px);
  background: rgba(8, 15, 27, 0.82);
  border-top: 1px solid rgba(103, 146, 194, 0.17);
  display: flex;
  justify-content: space-between;
  bottom: 0;
  padding: 0.95rem 1.35rem;
  position: sticky;
  z-index: 2;
}

.boss-modal__footer > div {
  display: flex;
  gap: 0.55rem;
}

.boss-modal__footer--end {
  justify-content: flex-end;
}

.boss-modal__status {
  color: #60758e;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.boss-group-create {
  align-items: flex-end;
  background: linear-gradient(140deg, rgba(69, 215, 223, 0.065), rgba(69, 215, 223, 0.018));
  border: 1px solid rgba(69, 215, 223, 0.17);
  border-radius: 13px;
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1fr auto;
  padding: 0.95rem;
}

.boss-group-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.boss-group-row {
  align-items: center;
  background: rgba(5, 11, 22, 0.27);
  border: 1px solid rgba(103, 146, 194, 0.14);
  border-radius: 11px;
  display: grid;
  gap: 0.55rem;
  grid-template-columns: 1.9rem auto minmax(0, 1fr) auto auto auto;
  padding: 0.55rem;
  position: relative;
  transition: 180ms ease;
}

.boss-group-row:hover {
  background: rgba(69, 215, 223, 0.025);
  border-color: rgba(103, 183, 199, 0.23);
}

.boss-group-row__index {
  color: #50657f;
  font-family: var(--nx-font-mono);
  font-size: 0.57rem;
}

.boss-group-row.is-highlighted {
  background: rgba(69, 215, 223, 0.06);
  border-color: rgba(69, 215, 223, 0.38);
}

.boss-group-row.is-dragging {
  border-color: rgba(69, 215, 223, 0.42);
  opacity: 0.52;
  transform: scale(0.99);
}

.boss-group-row.is-drop-target-before {
  box-shadow: 0 -3px 0 -1px #45d7df;
}

.boss-group-row.is-drop-target-after {
  box-shadow: 0 3px 0 -1px #45d7df;
}

.boss-group-row__drag-handle {
  align-items: center;
  align-self: stretch;
  background: rgba(71, 112, 154, 0.08);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #59718d;
  cursor: grab;
  display: inline-flex;
  justify-content: center;
  min-height: 2.45rem;
  padding: 0;
  touch-action: none;
  transition: 150ms ease;
  user-select: none;
}

.boss-group-row__drag-handle:hover,
.boss-group-row__drag-handle:focus-visible {
  background: rgba(69, 215, 223, 0.09);
  border-color: rgba(69, 215, 223, 0.24);
  color: #80dce1;
  outline: none;
}

.boss-group-row__drag-handle:active {
  cursor: grabbing;
}

.boss-group-row__drag-handle.is-disabled {
  cursor: wait;
  opacity: 0.45;
}

.boss-group-row__drag-handle svg {
  fill: currentColor;
  height: 1.05rem;
  width: 1.05rem;
}

.boss-group-row__count {
  color: #687b94;
  font-size: 0.67rem;
  white-space: nowrap;
}

.boss-group-row__move-buttons {
  background: rgba(4, 9, 18, 0.5);
  border: 1px solid rgba(103, 146, 194, 0.15);
  border-radius: 8px;
  display: flex;
  overflow: hidden;
}

.boss-group-row__move-buttons button {
  align-items: center;
  background: transparent;
  border: 0;
  color: #6f849e;
  display: inline-flex;
  height: 2rem;
  justify-content: center;
  padding: 0;
  transition: 150ms ease;
  width: 1.7rem;
}

.boss-group-row__move-buttons button + button {
  border-left: 1px solid rgba(103, 146, 194, 0.13);
}

.boss-group-row__move-buttons button:hover:not(:disabled),
.boss-group-row__move-buttons button:focus-visible {
  background: rgba(69, 215, 223, 0.08);
  color: #87e2e6;
  outline: none;
}

.boss-group-row__move-buttons button:disabled {
  color: #34465c;
  cursor: not-allowed;
}

.boss-group-row__move-buttons svg {
  fill: none;
  height: 0.9rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  width: 0.9rem;
}

.boss-group-row__actions {
  align-items: center;
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
  min-width: 2.15rem;
}

.boss-groups-manager__empty,
.contributor-manager__loading,
.contributor-manager__empty {
  color: #71849c;
  padding: 2rem;
  text-align: center;
}

.contributor-manager__intro {
  color: #8497ae;
  font-size: 0.8rem;
  line-height: 1.6;
  margin: 0;
}

.contributor-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.contributor-tools {
  align-items: center;
  display: flex;
  gap: 0.8rem;
  justify-content: space-between;
}

.contributor-tools > p {
  color: #667b94;
  flex: 0 0 auto;
  font-size: 0.64rem;
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}

.contributor-tools > p strong {
  color: #9feef1;
}

.contributor-search {
  align-items: center;
  background: rgba(4, 9, 18, 0.62);
  border: 1px solid rgba(106, 149, 196, 0.24);
  border-radius: 10px;
  display: flex;
  min-width: 0;
  padding: 0 0.7rem;
  transition: 150ms ease;
  width: min(20rem, 100%);
}

.contributor-search:focus-within {
  border-color: rgba(69, 215, 223, 0.52);
  box-shadow: 0 0 0 3px rgba(69, 215, 223, 0.06);
}

.contributor-search svg {
  fill: none;
  height: 0.9rem;
  stroke: #687d96;
  stroke-linecap: round;
  stroke-width: 1.8;
  width: 0.9rem;
}

.contributor-search input {
  background: transparent;
  border: 0;
  color: #e1ebf4;
  min-height: 2.55rem;
  min-width: 0;
  outline: none;
  padding: 0.55rem 0.65rem;
  width: 100%;
}

.contributor-search input::placeholder {
  color: #5f7187;
}

.contributor-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.contributor-row {
  align-items: center;
  background: rgba(5, 11, 22, 0.25);
  border: 1px solid rgba(103, 146, 194, 0.14);
  border-radius: 11px;
  display: flex;
  gap: 0.75rem;
  padding: 0.7rem 0.75rem;
  transition: 150ms ease;
}

.contributor-row:hover {
  background: rgba(69, 215, 223, 0.035);
  border-color: rgba(69, 215, 223, 0.22);
}

.contributor-row__avatar {
  align-items: center;
  background: linear-gradient(135deg, rgba(69, 215, 223, 0.18), rgba(129, 140, 248, 0.2));
  border: 1px solid rgba(112, 184, 205, 0.2);
  border-radius: 50%;
  color: #b8f7f8;
  display: flex;
  font-size: 0.8rem;
  font-weight: 800;
  height: 2.2rem;
  justify-content: center;
  text-transform: uppercase;
  width: 2.2rem;
}

.contributor-row__identity {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.contributor-row__identity strong {
  color: #dce7f2;
  font-size: 0.8rem;
}

.contributor-row__identity small {
  color: #6c8099;
  font-size: 0.66rem;
}

.contributor-row__built-in {
  background: rgba(69, 215, 223, 0.08);
  border: 1px solid rgba(69, 215, 223, 0.18);
  border-radius: 999px;
  color: #70dce2;
  font-size: 0.58rem;
  font-weight: 750;
  padding: 0.3rem 0.55rem;
}

.contributor-toggle {
  display: inline-flex;
  position: relative;
}

.contributor-toggle input {
  height: 1px;
  opacity: 0;
  position: absolute;
  width: 1px;
}

.contributor-toggle span {
  background: #1d2a3e;
  border: 1px solid rgba(111, 151, 196, 0.28);
  border-radius: 999px;
  cursor: pointer;
  height: 1.45rem;
  position: relative;
  transition: 170ms ease;
  width: 2.6rem;
}

.contributor-toggle span::after {
  background: #8ca0b8;
  border-radius: 50%;
  content: '';
  height: 0.92rem;
  left: 0.22rem;
  position: absolute;
  top: 0.2rem;
  transition: 170ms ease;
  width: 0.92rem;
}

.contributor-toggle input:checked + span {
  background: rgba(31, 192, 202, 0.3);
  border-color: rgba(69, 215, 223, 0.6);
}

.contributor-toggle input:checked + span::after {
  background: #70edf2;
  transform: translateX(1.12rem);
}

.contributor-toggle input:focus-visible + span {
  box-shadow: 0 0 0 3px rgba(69, 215, 223, 0.18);
}

.boss-confirm {
  align-items: center;
  display: flex;
  flex-direction: column;
  max-width: 440px;
  padding: 2.15rem;
  text-align: center;
}

.boss-confirm h2 {
  color: #f1f5f9;
  font-family: var(--nx-font-display);
  font-size: 1.45rem;
  margin: 0;
}

.boss-confirm p {
  color: #8497ae;
  font-size: 0.82rem;
  line-height: 1.6;
  margin-bottom: 0.45rem;
}

.boss-confirm__mark {
  height: 3.65rem;
  margin-bottom: 0.8rem;
  width: 3.65rem;
}

.boss-confirm__mark svg {
  fill: none;
  height: 1.6rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
  width: 1.6rem;
}

.boss-confirm__eyebrow {
  color: #fb879a;
  font-size: 0.59rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.boss-confirm--discard .boss-confirm__eyebrow {
  color: #7ee7eb;
}

.boss-confirm--lock .boss-confirm__mark {
  background: rgba(69, 215, 223, 0.08);
  border-color: rgba(69, 215, 223, 0.28);
  color: #67e8f9;
}

.boss-confirm--lock .boss-confirm__eyebrow {
  color: #7ee7eb;
}

.boss-confirm__subject {
  color: #f4f7fb;
}

.boss-confirm > small {
  color: #657991;
  font-size: 0.65rem;
}

.boss-confirm > div:last-child {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.boss-modal-enter-active,
.boss-modal-leave-active {
  transition: opacity 170ms ease;
}

.boss-modal-enter-active .boss-modal,
.boss-modal-enter-active .boss-confirm,
.boss-modal-leave-active .boss-modal,
.boss-modal-leave-active .boss-confirm {
  transition:
    transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 170ms ease;
}

.boss-modal-enter-from,
.boss-modal-leave-to {
  opacity: 0;
}

.boss-modal-enter-from .boss-modal,
.boss-modal-enter-from .boss-confirm,
.boss-modal-leave-to .boss-modal,
.boss-modal-leave-to .boss-confirm {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 1120px) {
  .boss-notes-edit-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .boss-notes-edit-layout > .boss-raid-utilities {
    grid-row: 1;
  }
}

@media (max-width: 800px) {
  .bosses-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 1.35rem;
  }

  .bosses-header__actions {
    justify-content: flex-start;
    width: 100%;
  }

  .bosses-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.7rem;
  }

  .boss-search {
    max-width: none;
  }

  .boss-detail-hero {
    min-height: 22rem;
  }

  .boss-detail-hero__veil {
    background: linear-gradient(0deg, rgba(5, 10, 20, 0.96), rgba(5, 10, 20, 0.35));
  }

  .boss-detail-actions {
    bottom: auto;
    right: 1.2rem;
    top: 1.2rem;
  }

  .boss-notes-document {
    display: flex;
    flex-direction: column;
  }

  .boss-notes-document__content :deep(.wiki-content)::before {
    display: none;
  }

  .boss-notes-document__content
    :deep(.wiki-content:has(> .wiki-file--right:first-of-type))::before {
    content: none;
  }

  .boss-notes-document__content :deep(.wiki-content--empty) {
    padding-right: 0;
  }

  .boss-notes-document__content :deep(.wiki-content > .wiki-file--right:first-of-type) {
    margin-bottom: 1rem;
  }

  .boss-notes-document > .boss-raid-utilities {
    margin: 0 0 1.25rem;
    order: -1;
    position: static;
  }

  .boss-raid-utilities {
    justify-content: start;
  }

  .boss-notes-edit__footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.8rem;
  }

  .boss-notes-edit__footer--sticky,
  .boss-notes-edit__footer--sticky > div {
    width: 100%;
  }

  .boss-notes-edit__footer--sticky .boss-button {
    flex: 1;
  }

  .boss-modal:not(.boss-modal--compact) .boss-modal__body {
    grid-template-columns: 1fr;
  }

  .boss-form-preview {
    max-height: 15rem;
  }

  .boss-group-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  .boss-group-row__index,
  .boss-group-row__count {
    display: none;
  }
}

@media (max-width: 540px) {
  .boss-raid-utilities {
    grid-template-columns: minmax(0, 17.25rem);
    justify-content: center;
  }

  .boss-notes-edit__shortcuts {
    display: none;
  }

  .boss-notes-edit__footer--sticky {
    gap: 0.5rem;
    padding: 0.55rem;
  }

  .boss-notes-edit__footer--sticky > p {
    display: none;
  }

  .bosses-page {
    padding-inline: 0;
    padding-top: 1rem;
  }

  .bosses-header {
    padding-block: 0.75rem 1.35rem;
  }

  .bosses-header h1 {
    font-size: clamp(3rem, 16vw, 4rem);
  }

  .bosses-header__intro {
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .bosses-header__actions .boss-button {
    flex: 1 1 0;
    font-size: 0.68rem;
    gap: 0.28rem;
    min-width: 0;
    padding-inline: 0.45rem;
    white-space: nowrap;
  }

  .bosses-header__actions {
    flex-wrap: nowrap;
    gap: 0.4rem;
  }

  .bosses-header__actions .boss-button svg {
    height: 0.82rem;
    width: 0.82rem;
  }

  .bosses-toolbar {
    padding-top: 1.15rem;
  }

  .boss-grid {
    grid-template-columns: 1fr;
  }

  .boss-card__edit {
    opacity: 1;
    transform: none;
  }

  .boss-card__open {
    display: none;
  }

  .boss-detail-hero {
    border-radius: 18px;
    min-height: 21.5rem;
  }

  .boss-detail-hero__content {
    padding: 1.2rem;
  }

  .boss-detail-back,
  .boss-detail-action {
    background: rgba(5, 11, 22, 0.68);
    border: 1px solid rgba(175, 203, 231, 0.2);
    border-radius: 8px;
    backdrop-filter: blur(10px);
  }

  .boss-detail-back {
    padding: 0.52rem 0.62rem;
  }

  .boss-detail-actions {
    right: 1rem;
    top: 1rem;
  }

  .boss-detail-action {
    font-size: 0;
    padding: 0.55rem;
  }

  .boss-detail-action svg {
    height: 1rem;
    width: 1rem;
  }

  .boss-suggestions__list > article > footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .boss-suggestions__list > article > footer .boss-button {
    width: 100%;
  }

  .boss-detail-hero__title h1 {
    font-size: clamp(2.4rem, 13vw, 4rem);
  }

  .boss-detail-title-line {
    align-items: center;
    gap: 0.55rem;
  }

  .boss-detail-copy-feedback {
    left: auto;
    right: 0;
    top: calc(100% + 0.35rem);
    transform: none;
  }

  .boss-share-feedback-enter-from,
  .boss-share-feedback-leave-to {
    transform: translateY(-0.2rem);
  }

  .boss-detail-meta {
    flex-direction: column;
    gap: 0.25rem;
  }

  .boss-detail-meta span + span::before {
    display: none;
  }

  .boss-notes-document {
    border-radius: 14px;
    padding: 1.2rem;
  }

  .boss-notes-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .boss-notes-toolbar__actions {
    justify-content: space-between;
    width: 100%;
  }

  .boss-mode-switch {
    flex: 1;
  }

  .boss-mode-switch button {
    flex: 1;
  }

  .boss-adjacent {
    grid-template-columns: 1fr;
  }

  .boss-adjacent > span {
    display: none;
  }

  .boss-modal__footer {
    align-items: stretch;
    flex-direction: column-reverse;
    gap: 0.65rem;
  }

  .boss-modal__header,
  .boss-modal__body,
  .boss-modal__footer {
    padding-inline: 1rem;
  }

  .boss-modal__mark {
    border-radius: 10px;
    height: 2.4rem;
    width: 2.4rem;
  }

  .boss-modal__identity {
    gap: 0.7rem;
  }

  .boss-modal__header h2 {
    font-size: 1.15rem;
  }

  .boss-modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .boss-modal,
  .boss-confirm {
    border-bottom: 0;
    border-radius: 19px 19px 0 0;
    max-height: 92svh;
  }

  .boss-confirm {
    max-width: none;
  }

  .boss-modal__footer > div,
  .boss-modal__footer .boss-button {
    width: 100%;
  }

  .boss-image-field__heading > span:last-child {
    display: none;
  }

  .boss-image-dropzone {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .boss-image-dropzone__action {
    display: none;
  }

  .boss-image-upload__meta {
    align-items: flex-start;
    gap: 0.35rem;
  }

  .boss-group-create {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .boss-group-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  .boss-group-order-hint {
    align-items: flex-start;
  }

  .boss-group-order-hint strong {
    display: none;
  }

  .contributor-tools {
    align-items: stretch;
    flex-direction: column;
    gap: 0.55rem;
  }

  .contributor-search {
    width: 100%;
  }

  .contributor-tools > p {
    padding-left: 0.15rem;
  }
}

.boss-detail-hero,
.boss-detail-hero__title h1,
.boss-detail-hero__content,
.boss-detail-actions {
  transition:
    min-height 220ms ease,
    font-size 220ms ease,
    padding 220ms ease,
    inset 220ms ease;
}

.bosses-page--editing .boss-detail-hero {
  min-height: 12rem;
}

.bosses-page--editing .boss-detail-hero__veil {
  background:
    linear-gradient(90deg, rgba(4, 9, 18, 0.98), rgba(4, 9, 18, 0.76) 62%, rgba(4, 9, 18, 0.45)),
    linear-gradient(0deg, rgba(5, 10, 20, 0.78), transparent 60%);
}

.bosses-page--editing .boss-detail-hero__content {
  padding: 1.1rem 1.5rem;
}

.bosses-page--editing .boss-detail-hero__title h1 {
  font-size: clamp(2rem, 4vw, 3.1rem);
  letter-spacing: -0.04em;
}

.bosses-page--editing .boss-detail-hero__title > p,
.bosses-page--editing .boss-detail-meta {
  margin-block: 0.35rem 0;
}

.bosses-page--editing .boss-detail-actions {
  bottom: 1rem;
  right: 1.2rem;
}

@media (max-width: 540px) {
  .bosses-page--editing .boss-detail-hero {
    min-height: 12.5rem;
  }

  .bosses-page--editing .boss-detail-hero__content {
    padding: 0.9rem 1rem;
  }

  .bosses-page--editing .boss-detail-hero__title h1 {
    font-size: clamp(1.7rem, 9vw, 2.4rem);
  }

  .bosses-page--editing .boss-detail-actions {
    right: 0.8rem;
    top: 0.8rem;
  }

  .bosses-page--editing .boss-detail-action {
    font-size: 0;
    padding: 0.55rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .boss-group,
  .boss-card-shell {
    animation: none;
  }

  .boss-card,
  .boss-card__media img,
  .boss-button,
  .boss-adjacent__link,
  .notes-mode-enter-active,
  .notes-mode-leave-active,
  .boss-modal-enter-active,
  .boss-modal-leave-active,
  .boss-modal-enter-active .boss-modal,
  .boss-modal-enter-active .boss-confirm,
  .boss-modal-leave-active .boss-modal,
  .boss-modal-leave-active .boss-confirm {
    transition: none;
  }
}
</style>
