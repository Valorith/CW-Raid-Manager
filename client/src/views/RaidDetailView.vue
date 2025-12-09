<template>
  <section v-if="raid" class="raid-detail">
    <header class="section-header raid-detail__header">
      <div class="raid-detail__title-block">
        <div class="raid-detail__title-top">
          <button class="btn btn--outline btn--icon raid-detail__back" type="button" @click="goBackToRaids">
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
        </div>
        <div class="raid-title-row">
          <div class="raid-title-main">
            <h1>
              <span
                v-if="raid.isRecurring"
                class="raid-recurring-icon"
                role="img"
                :title="raidRecurrenceSummary"
                :aria-label="raidRecurrenceSummary"
              >
                ♻️
              </span>
              {{ raid.name }}
            </h1>
            <button
              v-if="canManageRaid"
              class="icon-button icon-button--edit"
              type="button"
              :disabled="renamingRaid"
              @click="promptRenameRaid"
            >
              <span class="sr-only">Edit raid name</span>
              ✎
            </button>
          </div>
        </div>
        <span :class="['raid-status-badge', raidStatusBadge.variant]">{{ raidStatusBadge.label }}</span>
        <p class="muted">
          {{ formatDate(raid.startTime) }} • Targets: {{ formattedTargetZonesHeader || 'Not specified' }}
        </p>
        <span v-if="userGuildRoleLabel" class="badge">{{ userGuildRoleLabel }}</span>
      </div>
      <div class="header-actions">
        <div v-if="raid.discordVoiceUrl || canManageRaidDiscordLink" class="raid-voice-actions">
          <a
            v-if="raid.discordVoiceUrl"
            class="btn btn--discord-voice"
            :href="raid.discordVoiceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              class="raid-voice-actions__icon"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M20.317 4.369a19.91 19.91 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 13.4 13.4 0 0 0-.619-1.249.078.078 0 0 0-.079-.037 19.876 19.876 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C1.675 9.093.934 13.577 1.276 18.011a.082.082 0 0 0 .031.057 19.967 19.967 0 0 0 5.993 3.035.082.082 0 0 0 .089-.027 14.046 14.046 0 0 0 1.238-1.999.078.078 0 0 0-.041-.105 13.186 13.186 0 0 1-1.872-.894.078.078 0 0 1-.008-.128c.125-.095.25-.195.37-.296a.074.074 0 0 1 .078-.009c3.928 1.799 8.18 1.799 12.062 0a.074.074 0 0 1 .079.009c.12.101.245.201.37.296a.078.078 0 0 1-.006.128c-.6.351-1.226.656-1.87.894a.078.078 0 0 0-.041.106c.36.689.78 1.379 1.236 1.998a.08.08 0 0 0 .089.028 19.911 19.911 0 0 0 6.004-3.036.08.08 0 0 0 .032-.056c.5-6.172-.839-10.62-3.548-13.615a.066.066 0 0 0-.031-.027ZM8.02 15.331c-1.18 0-2.157-1.085-2.157-2.419 0-1.333.95-2.419 2.157-2.419 1.222 0 2.184 1.103 2.157 2.419 0 1.334-.95 2.419-2.157 2.419Zm7.987 0c-1.18 0-2.157-1.085-2.157-2.419 0-1.333.95-2.419 2.157-2.419 1.222 0 2.184 1.103 2.157 2.419 0 1.334-.935 2.419-2.157 2.419Z"
              />
            </svg>
            Chat on Discord
          </a>
          <button
            v-if="canManageRaidDiscordLink"
            class="btn btn--outline raid-voice-actions__manage"
            type="button"
            :disabled="updatingDiscordVoice"
            @click="promptDiscordVoiceLink"
          >
            {{ updatingDiscordVoice
              ? 'Saving…'
              : raid.discordVoiceUrl
                ? 'Edit Discord Link'
                : 'Add Discord Link' }}
          </button>
        </div>
        <button class="btn btn--outline share-btn" type="button" @click="copyRaidLink">
          <span aria-hidden="true">🔗</span>
          Share
        </button>
        <button
          class="btn btn--danger"
          :disabled="!canManageRaid"
          @click="confirmDeleteRaid"
        >
          Delete Raid
        </button>
      </div>
      <div v-if="shareStatus" class="share-toast">{{ shareStatus }}</div>
      <input
        ref="fileInput"
        type="file"
        accept=".txt"
        hidden
        @change="handleFileUpload"
      />
    </header>

    <section class="card raid-signups-card">
      <header class="card__header raid-signups-card__header">
        <div>
          <h2>Raid Signups</h2>
          <p class="muted">Reserve up to two characters for this raid.</p>
        </div>
        <div class="raid-signups-card__header-actions">
          <button
            class="raid-signups-card__toggle"
            type="button"
            :aria-expanded="!signupsCollapsed"
            @click="toggleSignupsCollapsed"
          >
            <span
              class="raid-signups-card__toggle-icon"
              :class="{ 'raid-signups-card__toggle-icon--collapsed': signupsCollapsed }"
              aria-hidden="true"
            ></span>
            <span class="raid-signups-card__toggle-label">{{ signupsToggleLabel }}</span>
          </button>
          <button
            class="btn btn--outline raid-signups-card__mains"
            type="button"
            :disabled="mainsButtonDisabled"
            @click="handleSignupMains"
          >
            Sign Up Mains
          </button>
        </div>
      </header>

      <div
        v-if="signupsCollapsed"
        class="raid-signups__collapsed-summary"
        role="button"
        tabindex="0"
        aria-label="Expand raid signups"
        @click="toggleSignupsCollapsed"
        @keydown.space.prevent="toggleSignupsCollapsed"
        @keydown.enter.prevent="toggleSignupsCollapsed"
      >
        <div v-if="collapsedSignupGroups.length > 0" class="raid-signups__collapsed-groups">
          <div
            v-for="group in collapsedSignupGroups"
            :key="`collapsed-${group.category}`"
            class="raid-signups__collapsed-group"
          >
            <header class="raid-signups__collapsed-group-header">
              <span class="raid-signups__collapsed-group-indicator" :data-role="group.category" aria-hidden="true"></span>
              <span class="raid-signups__collapsed-group-label">{{ group.label }}</span>
              <span class="raid-signups__collapsed-group-count">{{ group.total }}</span>
            </header>
            <ul class="raid-signups__collapsed-items">
              <li
                v-for="entry in group.entries"
                :key="entry.id"
                :class="[
                  'raid-signups__collapsed-item',
                  { 'raid-signups__collapsed-item--self': isViewerSignup(entry) },
                  { 'raid-signups__collapsed-item--not-attending': entry.status === 'NOT_ATTENDING' }
                ]"
              >
                <div
                  class="raid-signups__collapsed-avatar"
                  :class="{
                    'raid-signups__collapsed-avatar--self': isViewerSignup(entry),
                    'raid-signups__collapsed-avatar--not-attending': entry.status === 'NOT_ATTENDING'
                  }"
                >
                  <img
                    v-if="characterClassIcons[entry.characterClass]"
                    :src="characterClassIcons[entry.characterClass] ?? undefined"
                    :alt="characterClassLabels[entry.characterClass]"
                  />
                  <span v-else class="raid-signups__collapsed-fallback">
                    {{ characterClassLabels[entry.characterClass] }}
                  </span>
                  <span
                    v-if="entry.status === 'NOT_ATTENDING'"
                    class="raid-signups__collapsed-x"
                    aria-label="Not attending"
                  >
                    ✕
                  </span>
                  <span
                    v-else-if="isViewerSignup(entry)"
                    class="raid-signups__collapsed-check"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </div>
                <span
                  class="raid-signups__collapsed-name clickable"
                  role="button"
                  tabindex="0"
                  @click.stop="openInventory(entry.characterName)"
                  @keydown.enter.stop="openInventory(entry.characterName)"
                >
                  {{ entry.characterName }}
                </span>
                <span class="raid-signups__collapsed-class muted small">
                  {{ characterClassLabels[entry.characterClass] }}
                </span>
              </li>
            </ul>
            <footer v-if="group.total > collapsedGroupPreviewSize" class="raid-signups__collapsed-more muted small">
              +{{ group.total - collapsedGroupPreviewSize }} more…
            </footer>
          </div>
        </div>
        <p v-else class="raid-signups__collapsed-empty muted small">
          No characters have signed up yet.
        </p>
      </div>

      <transition name="raid-signups-collapse">
        <div v-show="!signupsCollapsed" class="raid-signups-card__content">
          <div class="raid-signups__column raid-signups__column--your">
            <div class="raid-signups__column-header">
              <h3>Your Signup</h3>
              <span class="raid-signups__slot-count">{{ signupDraftCount }} / {{ maxSignupSlots }} slots</span>
            </div>
            <div v-if="loadingUserCharacters" class="raid-signups__empty muted">
              Loading your characters…
            </div>
            <div v-else-if="characterLoadError" class="raid-signups__empty raid-signups__feedback raid-signups__feedback--error">
              {{ characterLoadError }}
            </div>
            <div v-else-if="sortedCharacters.length === 0" class="raid-signups__empty muted">
              You have not registered any characters yet.
            </div>
            <div v-else class="raid-signups__characters">
              <div
                v-for="character in sortedCharacters"
                :key="character.id"
                class="raid-signups__character-wrapper"
              >
                <button
                  type="button"
                  class="raid-signups__character"
                  :class="{
                    'raid-signups__character--selected': selectedCharacterIds.has(character.id) && !notAttendingDraft.has(character.id),
                    'raid-signups__character--not-attending': selectedCharacterIds.has(character.id) && notAttendingDraft.has(character.id),
                    'raid-signups__character--locked':
                      (!selectedCharacterIds.has(character.id) && signupLimitReached) || signupsLocked
                  }"
                  :disabled="signupSaving || signupsLocked"
                  @click="handleCharacterSelect(character.id)"
                >
                  <span class="raid-signups__avatar" :class="{ 'raid-signups__avatar--dimmed': selectedCharacterIds.has(character.id) && notAttendingDraft.has(character.id) }">
                    <img
                      v-if="characterClassIcons[character.class]"
                      :src="characterClassIcons[character.class] ?? undefined"
                      :alt="characterClassLabels[character.class]"
                      class="raid-signups__avatar-icon"
                    />
                    <span v-else class="raid-signups__avatar-fallback">
                      {{ characterClassLabels[character.class] }}
                    </span>
                    <span
                      v-if="selectedCharacterIds.has(character.id) && notAttendingDraft.has(character.id)"
                      class="raid-signups__avatar-not-attending"
                      aria-label="Not attending"
                    >
                      ✕
                    </span>
                  </span>
                  <div class="raid-signups__character-meta">
                    <span class="raid-signups__character-name" :class="{ 'raid-signups__character-name--strikethrough': selectedCharacterIds.has(character.id) && notAttendingDraft.has(character.id) }">
                      {{ character.name }}
                      <span v-if="character.isMain" class="raid-signups__tag">Main</span>
                    </span>
                    <span class="raid-signups__character-sub muted">
                      Lv {{ character.level }} • {{ characterClassLabels[character.class] }}
                    </span>
                  </div>
                  <span v-if="selectedCharacterIds.has(character.id) && !notAttendingDraft.has(character.id)" class="raid-signups__character-check" aria-hidden="true">✓</span>
                  <span v-else-if="selectedCharacterIds.has(character.id) && notAttendingDraft.has(character.id)" class="raid-signups__character-status-badge">NOT ATTENDING</span>
                </button>
                <!-- Status toggle buttons - appear when character is selected -->
                <div
                  v-if="selectedCharacterIds.has(character.id) && !signupsLocked"
                  class="raid-signups__status-toggle"
                >
                  <button
                    type="button"
                    class="raid-signups__status-btn"
                    :class="{ 'raid-signups__status-btn--active': !notAttendingDraft.has(character.id) }"
                    :disabled="signupSaving"
                    @click.stop="setCharacterStatus(character.id, 'CONFIRMED')"
                  >
                    <span class="raid-signups__status-icon">✓</span>
                    Attending
                  </button>
                  <button
                    type="button"
                    class="raid-signups__status-btn raid-signups__status-btn--not-attending"
                    :class="{ 'raid-signups__status-btn--active': notAttendingDraft.has(character.id) }"
                    :disabled="signupSaving"
                    @click.stop="setCharacterStatus(character.id, 'NOT_ATTENDING')"
                  >
                    <span class="raid-signups__status-icon">✕</span>
                    Not Attending
                  </button>
                </div>
              </div>
            </div>
            <div class="raid-signups__messages">
              <p
                v-if="signupsLocked"
                class="raid-signups__feedback raid-signups__feedback--muted"
              >
                Raid has started. Signups are locked for this event.
              </p>
              <p
                v-else-if="signupError"
                class="raid-signups__feedback raid-signups__feedback--error"
              >
                {{ signupError }}
              </p>
              <p
                v-else-if="signupSuccess"
                class="raid-signups__feedback raid-signups__feedback--success"
              >
                {{ signupSuccess }}
              </p>
              <template v-else>
                <p class="raid-signups__feedback raid-signups__feedback--muted">
                  Selected {{ signupDraftCount }} of {{ maxSignupSlots }} slots. Press Confirm to submit.
                </p>
                <p v-if="signupDraftCount > 0" class="raid-signups__hint">
                  Use the buttons below each character to mark as "Attending" or "Not Attending".
                </p>
              </template>
            </div>
            <div class="raid-signups__actions">
              <button
                class="btn btn--danger btn--outline"
                type="button"
                :disabled="signupsLocked || signupSaving || (savedSignupIds.length === 0 && signupDraftCount === 0)"
                @click="handleWithdrawAll"
              >
                Withdraw All
              </button>
              <button
                class="btn btn--outline"
                type="button"
                :disabled="signupsLocked || signupSaving || !signupDirty"
                @click="resetSignupSelection"
              >
                Reset
              </button>
              <button
                class="btn"
                type="button"
                :disabled="signupsLocked || signupSaving || !signupDirty"
                @click="saveSignups()"
              >
                {{ signupSaving ? 'Confirming…' : 'Confirm' }}
              </button>
            </div>
          </div>
          <div class="raid-signups__column raid-signups__column--composition">
            <div class="raid-signups__column-header">
              <h3>Raid Composition</h3>
              <span class="raid-signups__slot-count">{{ raidSignups.length }} signed up</span>
            </div>
            <div v-if="canManageRaid && !signupsLocked" class="raid-signups__search">
              <div class="raid-signups__search-wrapper">
                <input
                  v-model="signupSearch.query"
                  type="text"
                  class="raid-signups__search-input"
                  placeholder="Search characters to add..."
                  @input="handleSignupSearchInput"
                  @focus="signupSearch.showDropdown = signupSearch.results.length > 0"
                  @blur="handleSignupSearchBlur"
                />
                <span v-if="signupSearch.loading" class="raid-signups__search-loading">...</span>
                <div v-if="signupSearch.showDropdown && signupSearch.results.length > 0" class="raid-signups__search-dropdown">
                  <button
                    v-for="character in signupSearch.results"
                    :key="character.id"
                    type="button"
                    class="raid-signups__search-result"
                    :class="{ 'raid-signups__search-result--signed-up': character.isSignedUp }"
                    :disabled="character.isSignedUp"
                    @mousedown.prevent="handleAddSignupFromSearch(character)"
                  >
                    <img
                      v-if="characterClassIcons[character.class]"
                      :src="characterClassIcons[character.class] ?? undefined"
                      :alt="characterClassLabels[character.class]"
                      class="raid-signups__search-result-icon"
                    />
                    <div class="raid-signups__search-result-info">
                      <span class="raid-signups__search-result-name">{{ character.name }}</span>
                      <span class="raid-signups__search-result-meta muted small">
                        <template v-if="character.level">Lv {{ character.level }} • </template>
                        {{ characterClassLabels[character.class] }} · {{ character.userDisplayName }}
                      </span>
                    </div>
                    <span v-if="character.isSignedUp" class="raid-signups__search-result-badge">Signed up</span>
                    <span v-else class="raid-signups__search-result-add">+ Add</span>
                  </button>
                </div>
                <div v-if="signupSearch.showDropdown && signupSearch.query.length >= 2 && signupSearch.results.length === 0 && !signupSearch.loading" class="raid-signups__search-dropdown raid-signups__search-dropdown--empty">
                  <span class="muted">No characters found</span>
                </div>
              </div>
            </div>
            <div v-if="raidSignups.length === 0" class="raid-signups__empty muted">
              No one has signed up yet. Be the first to reserve a spot!
            </div>
            <div v-else class="raid-signups__composition">
              <div
                v-for="category in roleCategories"
                :key="category"
                class="raid-signups__role-group"
              >
                <header class="raid-signups__role-header">
                  <span class="raid-signups__role-label">{{ roleCategoryLabels[category] }}</span>
                  <span class="raid-signups__role-count">{{ (groupedSignups[category] ?? []).length }}</span>
                </header>
                <p
                  v-if="(groupedSignups[category] ?? []).length === 0"
                  class="raid-signups__role-empty muted small"
                >
                  No {{ roleCategoryLabels[category].toLowerCase() }} signed up yet.
                </p>
                <ul v-else class="raid-signups__role-list">
                  <li
                    v-for="entry in groupedSignups[category] ?? []"
                    :key="entry.id"
                    :class="[
                      'raid-signups__role-item',
                      { 'raid-signups__role-item--self': viewerUserId && entry.userId === viewerUserId },
                      { 'raid-signups__role-item--not-attending': entry.status === 'NOT_ATTENDING' },
                      { 'raid-signups__role-item--admin': canManageRaid && !signupsLocked }
                    ]"
                    @contextmenu="openSignupContextMenu($event, entry)"
                  >
                    <span class="raid-signups__role-icon" :class="{ 'raid-signups__role-icon--not-attending': entry.status === 'NOT_ATTENDING' }">
                      <img
                        v-if="characterClassIcons[entry.characterClass]"
                        :src="characterClassIcons[entry.characterClass] ?? undefined"
                        :alt="characterClassLabels[entry.characterClass]"
                      />
                      <span v-else class="raid-signups__role-icon-fallback">
                        {{ characterClassLabels[entry.characterClass] }}
                      </span>
                      <span v-if="entry.status === 'NOT_ATTENDING'" class="raid-signups__role-icon-x" aria-label="Not attending">✕</span>
                    </span>
                    <div class="raid-signups__role-meta">
                      <span
                        class="raid-signups__role-name clickable"
                        role="button"
                        tabindex="0"
                        @click.stop="openInventory(entry.characterName)"
                        @keydown.enter.stop="openInventory(entry.characterName)"
                      >
                        {{ entry.characterName }}
                        <span v-if="entry.status === 'NOT_ATTENDING'" class="raid-signups__not-attending-label">(Not Attending)</span>
                      </span>
                      <span class="raid-signups__role-sub muted small">
                        <template v-if="entry.characterLevel">Lv {{ entry.characterLevel }} • </template>
                        {{ characterClassLabels[entry.characterClass] }} · {{ entry.user.displayName }}
                      </span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </section>

    <section
      class="card raid-recurrence-card"
      :class="{ 'raid-recurrence-card--collapsed': recurrenceCardCollapsed }"
    >
      <header class="card__header raid-recurrence-card__header">
        <div class="raid-recurrence-card__title">
          <span class="raid-recurrence-card__icon" aria-hidden="true">♻️</span>
          <div>
            <h2>Recurrence</h2>
            <p v-if="showRecurrenceSummaryText" class="muted">{{ raidRecurrenceSummary }}</p>
          </div>
        </div>
        <div class="raid-recurrence-card__actions">
          <label
            class="recurrence-toggle"
            :class="{
              'recurrence-toggle--active': recurrenceForm.enabled,
              'recurrence-toggle--disabled': !canManageRaid || savingRecurrence
            }"
          >
            <input
              v-model="recurrenceForm.enabled"
              type="checkbox"
              :disabled="!canManageRaid || savingRecurrence"
            />
            <span class="recurrence-toggle__track" aria-hidden="true">
              <span class="recurrence-toggle__thumb"></span>
            </span>
            <span class="recurrence-toggle__label">
              {{ recurrenceForm.enabled ? 'Recurrence enabled' : 'Enable recurrence' }}
            </span>
          </label>
          <template v-if="canManageRaid && recurrenceForm.enabled">
            <button
              class="btn btn--outline"
              type="button"
              :disabled="!recurrenceDirty || savingRecurrence"
              @click="resetRecurrence"
            >
              Reset
            </button>
            <button
              class="btn"
              type="button"
              :disabled="!recurrenceDirty || savingRecurrence"
              @click="saveRecurrence"
            >
              {{ savingRecurrence ? 'Saving…' : 'Save Recurrence' }}
            </button>
          </template>
        </div>
      </header>
      <transition name="recurrence-fade">
        <div v-if="showRecurrenceSummary" class="raid-recurrence-card__summary">
          <span
            :class="[
              'recurrence-chip',
              raid.isRecurring ? 'recurrence-chip--active' : 'recurrence-chip--inactive'
            ]"
          >
            {{ raid.isRecurring ? 'Recurring' : 'One-time raid' }}
          </span>
        </div>
      </transition>

      <div class="recurrence-form" :class="{ 'recurrence-form--collapsed': !recurrenceForm.enabled }">
        <transition name="recurrence-collapse">
          <div v-if="recurrenceForm.enabled" class="recurrence-fields">
            <div class="recurrence-fields__grid">
              <label class="form__field">
                <span>Frequency</span>
                <select v-model="recurrenceForm.frequency" :disabled="!canManageRaid">
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>
              <label class="form__field form__field--inline">
                <span>Repeat Every</span>
                <input
                  v-model.number="recurrenceForm.interval"
                  type="number"
                min="1"
                class="recurrence-interval"
                :disabled="!canManageRaid"
              />
              <span class="recurrence-interval__suffix">{{ recurrenceIntervalSuffix }}</span>
            </label>
            <label class="form__field">
              <span>Series End (optional)</span>
              <input v-model="recurrenceForm.endDate" type="date" :disabled="!canManageRaid" />
              <small class="form__hint">Leave empty to repeat until disabled.</small>
            </label>
            </div>
            <div v-if="recurrenceForm.endDate" class="recurrence-note">
              <span class="recurrence-note__icon" aria-hidden="true">📅</span>
              <span>Next events run until {{ formatDateOnly(recurrenceForm.endDate) }}.</span>
            </div>
          </div>
        </transition>
        <p v-if="recurrenceError" class="error">{{ recurrenceError }}</p>
        <p v-else-if="!canManageRaid" class="muted small">
          You do not have permission to change recurrence settings.
        </p>
      </div>
    </section>

    <section
      class="card raid-notes-card"
      :class="{ 'card--collapsed': !notesPanelExpanded }"
    >
      <header class="card__header raid-notes-card__header" @click="toggleNotesPanel">
        <div class="card-header-main">
          <h2>Raid Notes</h2>
          <p v-if="!notesPanelExpanded" class="card-header-subtle">Tap to edit raid notes</p>
          <p v-if="notesPanelExpanded" class="muted">Share strategy details, reminders, or links with raiders.</p>
        </div>
        <div class="raid-notes-card__actions">
          <button
            v-if="canManageRaid && notesPanelExpanded"
            class="btn btn--outline"
            type="button"
            :disabled="!notesDirty || savingNotes"
            @click.stop="resetNotes"
          >
            Reset
          </button>
          <button
            v-if="canManageRaid && notesPanelExpanded"
            class="btn"
            type="button"
            :disabled="!notesDirty || savingNotes"
            @click.stop="saveNotes"
          >
            {{ savingNotes ? 'Saving…' : 'Save Notes' }}
          </button>
          <button
            class="collapse-indicator"
            type="button"
            @click.stop="toggleNotesPanel"
            :aria-expanded="notesPanelExpanded"
          >
            <span class="collapse-indicator__icon" :data-expanded="notesPanelExpanded">⌄</span>
          </button>
        </div>
      </header>
      <transition name="panel-collapse">
        <div v-show="notesPanelExpanded" class="raid-notes-card__body">
          <template v-if="canManageRaid">
            <textarea
              v-model="notesInput"
              class="raid-notes-card__textarea"
              rows="5"
              placeholder="Add raid notes, reminders, or useful links."
            ></textarea>
            <p class="muted small">Raid notes are visible to all raid members.</p>
            <p v-if="notesError" class="error">{{ notesError }}</p>
          </template>
          <template v-else>
            <p v-if="(raid.notes ?? '').trim().length > 0" class="raid-notes-card__display">
              {{ raid.notes }}
            </p>
            <p v-else class="muted small">No notes have been added for this raid yet.</p>
          </template>
        </div>
      </transition>
    </section>

    <section
      class="card raid-targets-card"
      :class="{ 'card--collapsed': !targetsPanelExpanded }"
    >
      <header class="card__header raid-targets-card__header" @click="toggleTargetsPanel">
        <div class="card-header-main">
          <div class="raid-targets-header">
            <h2>Raid Goals</h2>
            <span v-if="displayTargetBosses.length > 0" class="raid-targets-progress">
              {{ defeatedTargetBosses.size }} / {{ displayTargetBosses.length }}
            </span>
          </div>
          <p v-if="!targetsPanelExpanded" class="card-header-subtle">Tap to view raid goals</p>
          <p v-if="targetsPanelExpanded" class="muted">Keep everyone aligned on zones and targets for this raid.</p>
        </div>
        <div class="raid-targets-card__actions">
          <button
            v-if="canManageRaid && targetsPanelExpanded"
            class="btn btn--outline"
            type="button"
            @click.stop="openTargetsModal"
          >
            Edit Goals
          </button>
          <button
            class="collapse-indicator"
            type="button"
            @click.stop="toggleTargetsPanel"
            :aria-expanded="targetsPanelExpanded"
          >
            <span class="collapse-indicator__icon" :data-expanded="targetsPanelExpanded">⌄</span>
          </button>
        </div>
      </header>
      <transition name="panel-collapse">
        <div v-show="targetsPanelExpanded" class="raid-targets-card__body">
          <div class="raid-targets-grid">
            <div>
              <p class="raid-targets-card__label">Target Zones</p>
              <ul class="raid-targets-card__list" v-if="displayTargetZones.length">
                <li v-for="zone in displayTargetZones" :key="zone">{{ zone }}</li>
              </ul>
              <p v-else class="muted small">No zones specified.</p>
            </div>
            <div>
              <p class="raid-targets-card__label">Target Bosses</p>
              <ul class="raid-targets-card__list" v-if="displayTargetBosses.length">
                <li v-for="boss in displayTargetBosses" :key="boss">
                  <span>{{ boss }}</span>
                  <span
                    v-if="targetBossStatus.get(boss)"
                    class="raid-targets-card__check"
                    title="Defeated"
                    aria-label="Defeated"
                  >
                    ✔️
                  </span>
                  <span
                    v-else-if="targetBossThreats.has(boss)"
                    class="raid-targets-card__threat"
                    title="Players killed"
                    aria-label="Players killed"
                  >
                    ✖
                  </span>
                  <span
                    v-else
                    class="raid-targets-card__unknown"
                    title="Pending"
                    aria-label="Pending"
                  >
                    ?
                  </span>
                </li>
              </ul>
              <p v-else class="muted small">No bosses specified.</p>
            </div>
          </div>
          <p v-if="!canManageRaid" class="muted small">Only raid managers can edit goals.</p>
        </div>
      </transition>
    </section>

    <section class="card raid-kills-card">
      <header class="card__header raid-kills-card__header">
        <div>
          <h2>Kills</h2>
          <p class="muted">Captured automatically from recorded log lines.</p>
          <div v-if="totalNpcKills > 0" class="raid-kills-card__summary">
            <div class="raid-kills-card__totals raid-kills-card__totals--inline">
              <span class="raid-kills-card__totals-label">Total Kills</span>
              <span class="raid-kills-card__badge">{{ totalNpcKills }}</span>
            </div>
          </div>
        </div>
        <div class="raid-kills-card__actions">
          <div class="raid-kills-card__actions-center">
            <button
              v-if="npcKillEvents.length > 0"
              class="icon-button icon-button--graph"
              type="button"
              @click="showNpcKillGraph = true"
            >
              <span class="sr-only">Show kill graph</span>
              <span aria-hidden="true">📊</span>
            </button>
            <button
              class="npc-notes-btn npc-notes-btn--pill npc-notes-btn--compact"
              type="button"
              @click="handleOpenNpcNotes()"
            >
              <span aria-hidden="true">📘</span>
              <span>NPC Notes</span>
            </button>
          </div>
          <div class="raid-kills-card__upload">
            <input
              ref="killLogInput"
              type="file"
              class="sr-only"
              accept=".txt,.log"
              @change="handleKillLogFileChange"
            />
            <button
              v-if="canManageRaid"
              class="upload-btn"
              type="button"
              :disabled="uploadingKillLog"
              @click.stop="triggerKillLogUpload"
            >
              <span class="upload-btn__icon" aria-hidden="true">📁</span>
              <span>{{ uploadingKillLog ? 'Uploading…' : 'Upload Log' }}</span>
            </button>
            <button
              v-if="canManageRaid"
              class="upload-btn raid-kills-card__add"
              type="button"
              @click="openAddKillModal"
            >
              <span class="upload-btn__icon" aria-hidden="true">➕</span>
              <span>Add Kill</span>
            </button>
          </div>
        </div>
      </header>
      <div v-if="npcKillSummary.length > 0" class="raid-kills-grid-wrapper">
        <div class="raid-kills-grid" role="list">
          <article
            v-for="kill in npcKillSummary"
            :key="kill.npcName"
            :class="[
              'raid-kills-grid__item',
              { 'raid-kills-grid__item--target': kill.isTargetBoss }
            ]"
            role="listitem"
            @contextmenu.prevent="openKillContextMenu($event, kill.npcName)"
          >
            <span class="raid-kills-grid__name">
              <span>{{ kill.npcName }}</span>
              <span v-if="kill.isTargetBoss" class="raid-kills-grid__icon" title="Target boss defeated">⭐</span>
              <span
                v-if="npcHasNote(kill.npcName)"
                class="raid-kills-grid__icon raid-kills-grid__icon--note"
                title="NPC notes available"
              >
                📜
              </span>
            </span>
            <span class="raid-kills-grid__badge" :class="{ 'raid-kills-grid__badge--target': kill.isTargetBoss }">
              {{ kill.killCount }}
            </span>
          </article>
        </div>
      </div>
      <p v-else class="muted small">No NPC kills have been recorded for this raid yet.</p>
    </section>
    <div
      v-if="killContextMenu.visible"
      class="loot-context-menu kill-context-menu"
      :style="{ top: `${killContextMenu.y}px`, left: `${killContextMenu.x}px` }
      "
    >
      <button class="loot-context-menu__action" type="button" @click="addTargetBossFromKill">
        Add boss target
      </button>
      <button class="loot-context-menu__action" type="button" @click="openNpcNotesFromKill">
        NPC notes
      </button>
    </div>
    <div
      v-if="npcNotesState.associationMenu.visible"
      class="loot-context-menu association-context-menu"
      :style="{
        top: `${npcNotesState.associationMenu.y}px`,
        left: `${npcNotesState.associationMenu.x}px`
      }"
    >
      <button class="loot-context-menu__action" type="button" @click="handleAssociationContextEdit">
        Edit
      </button>
      <button class="loot-context-menu__action" type="button" @click="handleAssociationContextDelete">
        Delete
      </button>
    </div>
    <div
      v-if="signupContextMenu.visible"
      class="loot-context-menu signup-context-menu"
      :style="{
        top: `${signupContextMenu.y}px`,
        left: `${signupContextMenu.x}px`
      }"
    >
      <header class="loot-context-menu__header">
        {{ signupContextMenu.signup?.characterName }}
      </header>
      <button
        v-if="signupContextMenu.signup?.status !== 'CONFIRMED'"
        class="loot-context-menu__action"
        type="button"
        @click="handleSignupContextMenuAction('attending')"
      >
        Mark as Attending
      </button>
      <button
        v-if="signupContextMenu.signup?.status !== 'NOT_ATTENDING'"
        class="loot-context-menu__action"
        type="button"
        @click="handleSignupContextMenuAction('not_attending')"
      >
        Mark as Not Attending
      </button>
      <button
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="handleSignupContextMenuAction('remove')"
      >
        Remove from Signup
      </button>
    </div>

    <section class="card raid-timing">
      <header class="card__header">
        <div>
          <h2>Raid Timing</h2>
          <p class="muted">Track actual raid start and end times.</p>
        </div>
        <div class="actions timing-actions">
          <button
            class="raid-action-btn raid-action-btn--announce"
            type="button"
            :disabled="announcingRaid || !canManageRaid"
            @click="handleAnnounceRaid"
            aria-label="Send raid announcement"
          >
            <span aria-hidden="true">📣</span>
          </button>
          <button
            class="raid-action-btn raid-action-btn--start"
            :disabled="startingRaid || hasEffectiveStarted || !canManageRaid"
            @click="handleStartRaid"
          >
            <span class="raid-action-btn__icon" aria-hidden="true">⚡</span>
            <span>{{ startingRaid ? 'Starting…' : hasEffectiveStarted ? 'Started' : 'Start Raid' }}</span>
          </button>
          <button
            class="raid-action-btn raid-action-btn--end"
            :disabled="endingRaid || !hasEffectiveStarted || hasEffectiveEnded || !canManageRaid"
            @click="handleEndRaid"
          >
            <span class="raid-action-btn__icon" aria-hidden="true">🛑</span>
            <span>{{ endingRaid ? 'Ending…' : hasEffectiveEnded ? 'Ended' : 'End Raid' }}</span>
          </button>
          <button
            class="raid-action-btn raid-action-btn--restart"
            :disabled="restartingRaid || !canRestartRaid"
            @click="handleRestartRaid"
          >
            <span class="raid-action-btn__icon" aria-hidden="true">🔄</span>
            <span>{{ restartingRaid ? 'Restarting…' : 'Restart Raid' }}</span>
          </button>
          <button
            v-if="!hasEffectiveCanceled"
            class="raid-action-btn raid-action-btn--cancel"
            :disabled="cancelingRaid || !canCancelRaid"
            @click="handleCancelRaid"
          >
            <span class="raid-action-btn__icon" aria-hidden="true">🚫</span>
            <span>{{ cancelingRaid ? 'Canceling…' : 'Cancel Raid' }}</span>
          </button>
          <button
            v-if="hasEffectiveCanceled"
            class="raid-action-btn raid-action-btn--uncancel"
            :disabled="uncancelingRaid || !canUncancelRaid"
            @click="handleUncancelRaid"
          >
            <span class="raid-action-btn__icon" aria-hidden="true">✅</span>
            <span>{{ uncancelingRaid ? 'Restoring…' : 'Restore Raid' }}</span>
          </button>
        </div>
      </header>

      <div class="timing-grid">
        <div class="timing-field">
          <span class="label">Scheduled Start</span>
          <p class="muted">{{ formatDate(raid.startTime) }}</p>
        </div>
        <div class="timing-actual-group">
          <div class="timing-field timing-field--actual">
            <label for="actual-start">Actual Start</label>
            <input
              id="actual-start"
              v-model="startedAtInput"
              type="datetime-local"
              class="timing-input"
              :disabled="!canManageRaid"
            />
          </div>
          <div class="timing-field timing-field--actual">
            <label for="actual-end">Actual End</label>
            <input
              id="actual-end"
              v-model="endedAtInput"
              type="datetime-local"
              class="timing-input"
              :disabled="!canManageRaid"
            />
          </div>
        </div>
      </div>

      <div class="timing-controls">
        <button
          class="btn btn--outline"
          :disabled="!timesDirty || savingTimes || !canManageRaid"
          @click="resetTiming"
        >
          Reset
        </button>
        <button class="btn" :disabled="!timesDirty || savingTimes || !canManageRaid" @click="saveTiming">
          {{ savingTimes ? 'Saving…' : 'Save Times' }}
        </button>
      </div>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <p v-else-if="!canManageRaid" class="muted">
        You do not have permission to manage raid timing or attendance.
      </p>
    </section>

    <section class="card">
      <header class="card__header card__header--attendance">
        <h2>Attendance Events</h2>
        <button
          class="btn upload-btn"
          :disabled="!canManageRaid"
          @click="triggerAttendanceUpload()"
        >
          <span class="upload-btn__icon" aria-hidden="true">⇪</span>
          Upload Attendance
        </button>
      </header>
      <p v-if="attendanceLoading" class="muted">Loading attendance…</p>
      <p v-else-if="attendanceEvents.length === 0" class="muted">
        No attendance events have been recorded for this raid yet.
      </p>
      <ul class="attendance-list">
        <li
          v-for="event in attendanceEvents"
          :key="event.id"
          class="attendance-list__item"
          @click="openAttendanceEvent(event)"
        >
          <div class="event-main">
            <div class="event-header">
              <strong>{{ formatDate(event.createdAt) }}</strong>
              <span
                v-if="resolveEventTypeBadge(event.eventType)"
                :class="['badge', resolveEventTypeBadge(event.eventType)?.variant]"
              >
                {{ resolveEventTypeBadge(event.eventType)?.label }}
              </span>
            </div>
            <span class="muted attendees">{{ resolveEventSubtitle(event) }}</span>
          </div>
          <div v-if="canManageRaid" class="attendance-actions">
            <button
              class="icon-button icon-button--outline"
              type="button"
              @click.stop="triggerAttendanceUpload({ attendanceEventId: event.id })"
            >
              Upload
            </button>
            <button
              class="icon-button icon-button--danger"
              type="button"
              :disabled="deletingAttendanceId === event.id"
              @click.stop="confirmDeleteAttendance(event)"
            >
              {{ deletingAttendanceId === event.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="card recorded-loot-card">
      <header class="card__header recorded-loot__header">
        <div class="recorded-loot__summary">
          <h2>Recorded Loot</h2>
          <p class="muted">All drops captured for this raid.</p>
        </div>
        <div
          v-if="lootMonitorVisible"
          class="recorded-loot__monitor"
          role="status"
          :aria-label="lootMonitorStatusLabel"
        >
          <span class="recorded-loot__monitor-label">
            Monitoring<span v-if="lootMonitorDisplayName">: {{ lootMonitorDisplayName }}</span>
          </span>
          <span aria-hidden="true" class="recorded-loot__monitor-bar"></span>
        </div>
        <span v-if="lootMonitorVisible" class="recorded-loot__spacer" aria-hidden="true"></span>
      </header>
      <RouterLink
        v-if="canAccessLootTracker"
        class="btn btn--manage-loot recorded-loot__manage"
        :to="{ name: 'RaidLoot', params: { raidId: raid.id } }"
      >
        <span aria-hidden="true">🧺</span>
        Open Loot Tracker
      </RouterLink>
      <p v-if="lootEvents.length === 0" class="muted">No loot recorded yet.</p>
      <div v-else class="raid-loot-grid">
        <article
          v-for="entry in groupedLoot"
          :key="entry.id"
          :class="['raid-loot-card', { 'raid-loot-card--needs-assignment': entry.isMasterLooter }]"
          role="button"
          tabindex="0"
        @click="handleLootCardClick($event, entry.itemName, entry.itemId)"
        @contextmenu.prevent="openLootContextMenu($event, entry)"
        @keyup.enter="handleLootCardKeyEnter($event, entry.itemName, entry.itemId)"
        >
          <span
            v-if="entry.isWhitelisted"
            class="raid-loot-card__badge raid-loot-card__badge--whitelist"
            title="Whitelisted"
            aria-label="Whitelisted item"
          >
            ⭐
          </span>
          <div class="raid-loot-card__count">{{ entry.count }}×</div>
          <header class="raid-loot-card__header">
            <div
              class="raid-loot-card__icon"
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
              <span v-else class="raid-loot-card__emoji">{{ entry.emoji ?? '💎' }}</span>
            </div>
            <div>
              <p class="raid-loot-card__item">{{ entry.itemName }}</p>
              <p class="raid-loot-card__looter">
                <template v-if="entry.isGuildBank">
                  <span class="raid-loot-card__looter-name">{{ entry.displayLooterName }}</span>
                </template>
                <template v-else-if="entry.isMasterLooter">
                  <span class="raid-loot-card__looter-name raid-loot-card__looter-name--unassigned">
                    {{ entry.displayLooterName }}
                  </span>
                </template>
                <template v-else>
                  <CharacterLink :name="entry.displayLooterName" />
                </template>
              </p>
            </div>
          </header>
          <p v-if="entry.note" class="raid-loot-card__note">{{ entry.note }}</p>
        </article>
      </div>
    </section>

    <div
      v-if="lootContextMenu.visible"
      class="loot-context-menu"
      :style="{ top: `${lootContextMenu.y}px`, left: `${lootContextMenu.x}px` }"
      @contextmenu.prevent
      @click.stop
    >
      <header class="loot-context-menu__header">{{ lootContextMenu.itemName }}</header>
      <button
        v-if="canManageLootLists"
        class="loot-context-menu__action"
        type="button"
        @click="handleEditLootClick"
      >
        Edit Loot…
      </button>
      <button
        v-if="!lootContextMenu.whitelistEntry"
        class="loot-context-menu__action"
        type="button"
        @click="addItemToLootList('WHITELIST')"
      >
        Add to Whitelist
      </button>
      <button
        v-else
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('WHITELIST')"
      >
        Remove from Whitelist
      </button>
      <button
        v-if="!lootContextMenu.blacklistEntry"
        class="loot-context-menu__action"
        type="button"
        @click="addItemToLootList('BLACKLIST')"
      >
        Add to Blacklist
      </button>
      <button
        v-else
        class="loot-context-menu__action loot-context-menu__action--remove"
        type="button"
        @click="removeItemFromLootList('BLACKLIST')"
      >
        Remove from Blacklist
      </button>
    </div>

      </section>
  <p v-else class="muted">Loading raid…</p>

  <RosterPreviewModal
    v-if="rosterPreview && showRosterModal"
    :entries="rosterPreview"
    :meta="rosterMeta"
    :saving="submittingAttendance"
    @close="handleRosterModalClose"
    @discard="handleRosterModalDiscard"
    @save="handleRosterModalSave"
  />
  <div v-if="editLootModal.visible" class="modal-backdrop">
    <div class="modal">
      <header class="modal__header">
        <div>
          <h3>Edit Loot Entry</h3>
          <p class="muted small">Adjust the assignee or quantity for this loot record.</p>
        </div>
        <button class="icon-button" type="button" :disabled="editLootModal.saving" @click="closeEditLootModal">
          ✕
        </button>
      </header>
      <form class="edit-loot-form" @submit.prevent="saveEditedLoot">
        <label class="form__field">
          <span>Item</span>
          <input type="text" :value="editLootModal.entry?.itemName ?? ''" disabled />
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
          <small class="form__hint">Set to use the matching EverQuest icon.</small>
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
  <div v-if="targetsModal.visible" class="modal-backdrop">
    <div class="modal raid-targets-modal">
      <header class="modal__header raid-targets-modal__header">
        <div>
          <h3>Edit Raid Goals</h3>
          <p class="muted small">Fine-tune the zones and key targets for this raid.</p>
        </div>
        <button class="icon-button" type="button" :disabled="targetsModal.saving" @click="closeTargetsModal">
          ✕
        </button>
      </header>
      <form class="targets-modal-content" @submit.prevent="saveTargetsFromModal">
        <div class="targets-modal-columns">
          <section class="targets-panel targets-panel--primary">
            <header class="targets-panel__header">
              <div>
                <p class="targets-panel__eyebrow">Current Plan</p>
                <h4 class="targets-panel__title">Current Raid Goals</h4>
                <p class="muted small">Share the latest zones and boss objectives with your raid.</p>
              </div>
              <div class="targets-metrics">
                <div class="targets-metric">
                  <span class="targets-metric__label">Zones</span>
                  <span class="targets-metric__value">{{ displayTargetZones.length }}</span>
                </div>
                <div class="targets-metric">
                  <span class="targets-metric__label">Bosses</span>
                  <span class="targets-metric__value">{{ displayTargetBosses.length }}</span>
                </div>
              </div>
            </header>
            <div class="targets-panel__body">
              <div class="targets-input-grid">
                <label class="form__field targets-field">
                  <div class="targets-field__label">
                    <span>Target Zones</span>
                    <small class="muted small">{{ displayTargetZones.length }} saved</small>
                  </div>
                  <div class="targets-field__input">
                    <div class="targets-pill-list" :class="{ 'targets-pill-list--empty': targetsModal.zones.length === 0 }">
                      <span
                        v-for="(zone, index) in targetsModal.zones"
                        :key="zone.id"
                        class="target-pill"
                      >
                        <span class="target-pill__label">{{ zone.value }}</span>
                        <button
                          class="target-pill__remove"
                          type="button"
                          :disabled="targetsModal.saving"
                          @click.stop.prevent="removeTargetEntry('zones', zone.id)"
                        >
                          ✕<span class="sr-only">Remove {{ zone.value }}</span>
                        </button>
                      </span>
                      <span v-if="targetsModal.zones.length === 0" class="targets-pill-empty muted small">
                        No target zones yet.
                      </span>
                    </div>
                    <input
                      v-model="targetsModal.zoneInput"
                      class="targets-pill-input"
                      type="text"
                      :placeholder="'Add a zone and press Enter'"
                      :disabled="targetsModal.saving"
                      @keydown.enter.prevent="commitTargetInput('zones')"
                    />
                    <small class="form__hint">Press Enter to add a zone. This list is visible to all raiders.</small>
                  </div>
                </label>
                <label class="form__field targets-field">
                  <div class="targets-field__label">
                    <span>Target Bosses</span>
                    <small class="muted small">{{ displayTargetBosses.length }} saved</small>
                  </div>
                  <div class="targets-field__input">
                    <div class="targets-pill-list" :class="{ 'targets-pill-list--empty': targetsModal.bosses.length === 0 }">
                      <span
                        v-for="(boss, index) in targetsModal.bosses"
                        :key="boss.id"
                        class="target-pill"
                      >
                        <span class="target-pill__label">{{ boss.value }}</span>
                        <button
                          class="target-pill__remove"
                          type="button"
                          :disabled="targetsModal.saving"
                          @click.stop.prevent="removeTargetEntry('bosses', boss.id)"
                        >
                          ✕<span class="sr-only">Remove {{ boss.value }}</span>
                        </button>
                      </span>
                      <span v-if="targetsModal.bosses.length === 0" class="targets-pill-empty muted small">
                        No bosses added yet.
                      </span>
                    </div>
                    <input
                      v-model="targetsModal.bossInput"
                      class="targets-pill-input"
                      type="text"
                      :placeholder="'Add a boss and press Enter'"
                      :disabled="targetsModal.saving"
                      @keydown.enter.prevent="commitTargetInput('bosses')"
                    />
                    <small class="form__hint"
                      >Press Enter to add each objective. Use this for key bosses or milestones.</small
                    >
                  </div>
                </label>
              </div>
            </div>
          </section>
          <section class="targets-panel targets-panel--secondary targets-copy-panel">
            <header class="targets-panel__header">
              <div>
                <p class="targets-panel__eyebrow">Reuse Plan</p>
                <h4 class="targets-panel__title">Copy From Another Raid</h4>
                <p class="muted small">Search past raids, preview their goals, and copy them instantly.</p>
              </div>
              <button
                class="btn btn--outline btn--modal-outline"
                type="button"
                @click="copyGoalsFromSelectedRaid"
                :disabled="
                  targetsCopyState.loading ||
                  !targetsCopyState.selectedRaidId ||
                  !copyableRaidOptions.length
                "
              >
                Copy Goals
              </button>
            </header>
            <div class="targets-panel__body targets-panel__body--copy">
              <div class="targets-copy__content-grid">
                <div class="targets-copy__controls">
                  <label class="targets-copy__control">
                    <span class="targets-copy__control-label">Search raids</span>
                    <input
                      v-model="targetsCopyState.search"
                      class="targets-copy__search"
                      type="search"
                      placeholder="Search raids"
                      :disabled="targetsCopyState.loading || !copyableRaidOptions.length"
                    />
                  </label>
                  <label class="targets-copy__control targets-copy__control--select">
                    <span class="targets-copy__control-label">Select a raid</span>
                    <select
                      v-model="targetsCopyState.selectedRaidId"
                      class="targets-copy__select"
                      size="8"
                      :disabled="targetsCopyState.loading || !copyableRaidOptions.length"
                    >
                      <option
                        v-for="raidOption in filteredCopyRaidOptions"
                        :key="raidOption.id"
                        :value="raidOption.id"
                      >
                        {{ raidOption.name }} — {{ formatDateOnly(raidOption.startTime) }}
                      </option>
                    </select>
                  </label>
                </div>
                <div class="targets-copy__preview">
                  <template v-if="selectedCopyRaid">
                    <div class="targets-copy__preview-header">
                      <div>
                        <p class="targets-copy__preview-title">{{ selectedCopyRaid.name }}</p>
                        <p class="targets-copy__preview-date">
                          {{ formatDateOnly(selectedCopyRaid.startTime) }}
                        </p>
                      </div>
                      <div class="targets-copy__preview-metrics">
                        <span>{{ selectedCopyRaidZones.length }} zones</span>
                        <span>{{ selectedCopyRaidBosses.length }} bosses</span>
                      </div>
                    </div>
                    <div class="targets-copy__preview-grid">
                      <div>
                        <p class="targets-copy__preview-label">Zones</p>
                        <ul class="targets-copy__list" v-if="selectedCopyRaidZones.length">
                          <li v-for="zone in selectedCopyRaidZones" :key="zone">{{ zone }}</li>
                        </ul>
                        <p class="muted small" v-else>No zones saved for this raid.</p>
                      </div>
                      <div>
                        <p class="targets-copy__preview-label">Bosses</p>
                        <ul class="targets-copy__list" v-if="selectedCopyRaidBosses.length">
                          <li v-for="boss in selectedCopyRaidBosses" :key="boss">{{ boss }}</li>
                        </ul>
                        <p class="muted small" v-else>No bosses saved for this raid.</p>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="targets-copy__empty">
                      <p class="targets-copy__empty-title">Select a raid to preview its goals.</p>
                      <p class="muted small">
                        Use the search on the left to find past events and preview their saved targets.
                      </p>
                    </div>
                  </template>
                </div>
              </div>
              <div class="targets-copy__status">
                <p class="muted small" v-if="targetsCopyState.loading">Loading raids…</p>
                <p class="error" v-else-if="targetsCopyState.loadError">{{ targetsCopyState.loadError }}</p>
                <p class="muted small" v-else-if="!copyableRaidOptions.length">
                  No other raid events are available to copy from yet.
                </p>
                <p class="muted small" v-else-if="filteredCopyRaidOptions.length === 0">
                  No raids match your search.
                </p>
                <p class="muted small" v-else-if="targetsCopyState.lastCopiedRaidName">
                  Copied goals from {{ targetsCopyState.lastCopiedRaidName }}.
                </p>
              </div>
            </div>
          </section>
        </div>
        <p v-if="targetsModal.error" class="error">{{ targetsModal.error }}</p>
        <footer class="targets-modal__actions">
          <button
            class="btn btn--outline btn--modal-outline"
            type="button"
            :disabled="targetsModal.saving"
            @click="resetTargetsModal"
          >
            Reset
          </button>
          <button
            class="btn btn--modal-primary"
            type="submit"
            :disabled="targetsModal.saving || !targetsModalDirty"
          >
            {{ targetsModal.saving ? 'Saving…' : 'Save Goals' }}
          </button>
        </footer>
  </form>
</div>
</div>
<div v-if="addKillModal.visible" class="modal-backdrop" @click.self="closeAddKillModal()">
  <div class="modal manual-kill-modal">
    <header class="modal__header">
      <div>
        <h3>Add Kill</h3>
        <p class="muted small">Record a kill manually when log lines are unavailable.</p>
      </div>
      <button class="icon-button" type="button" @click="closeAddKillModal()">✕</button>
    </header>
    <form class="manual-kill-form" @submit.prevent="submitManualKill">
      <label class="manual-kill-field">
        <span>NPC Name</span>
        <input
          v-model="addKillModal.npcName"
          class="manual-kill-input"
          type="text"
          name="npcName"
          maxlength="191"
          required
        />
      </label>
      <label class="manual-kill-field">
        <span>Killer (optional)</span>
        <input
          v-model="addKillModal.killerName"
          class="manual-kill-input"
          type="text"
          name="killerName"
          maxlength="191"
        />
      </label>
      <label class="manual-kill-field">
        <span>Occurred At</span>
        <input
          v-model="addKillModal.occurredAt"
          class="manual-kill-input"
          type="datetime-local"
          name="occurredAt"
          required
        />
      </label>
      <p v-if="addKillModal.error" class="error manual-kill-error">{{ addKillModal.error }}</p>
      <footer class="modal__actions">
        <button
          class="btn btn--outline btn--modal-outline"
          type="button"
          :disabled="addKillModal.saving"
          @click="closeAddKillModal()"
        >
          Cancel
        </button>
        <button class="btn btn--modal-primary" type="submit" :disabled="addKillModal.saving">
          {{ addKillModal.saving ? 'Saving…' : 'Save Kill' }}
        </button>
      </footer>
    </form>
  </div>
</div>
<div v-if="npcNotesState.visible" class="modal-backdrop" @click.self="closeNpcNotesModal()">
  <div class="modal npc-notes-modal">
    <header class="modal__header">
      <div>
        <h3>NPC Notes</h3>
        <p class="muted small">Guild bestiary and intel on priority targets.</p>
      </div>
      <button class="icon-button" type="button" @click="closeNpcNotesModal()">✕</button>
    </header>
    <div class="npc-notes-body">
      <aside class="npc-notes-sidebar">
        <div class="npc-notes-search">
          <input
            v-model="npcNotesState.search"
            type="search"
            placeholder="Search NPCs"
            aria-label="Search NPC notes"
          />
        </div>
        <ul class="npc-notes-list">
          <li
            v-for="note in filteredNpcNotes"
            :key="note.id || note.npcName"
            class="npc-notes-list__row"
            :class="{
              'npc-notes-list__row--active': note.npcName === npcNotesState.draft.npcName,
              'npc-notes-list__row--pending': note.deletionRequestedAt
            }"
          >
            <button
              class="npc-notes-list__item"
              type="button"
              @click="selectNpcNotesEntry(note.npcName)"
            >
              <span>{{ note.npcName }}</span>
              <span v-if="note.deletionRequestedAt" class="npc-notes-list__pill">Pending</span>
            </button>
            <div
              v-if="npcNotesState.canApproveDeletion && note.deletionRequestedAt"
              class="npc-notes-approval"
            >
              <button
                class="npc-notes-approval__btn npc-notes-approval__btn--approve"
                type="button"
                @click.stop="handleNpcNoteDeletionDecision(note.npcName, 'APPROVE')"
              >
                👍
              </button>
              <button
                class="npc-notes-approval__btn npc-notes-approval__btn--deny"
                type="button"
                @click.stop="handleNpcNoteDeletionDecision(note.npcName, 'DENY')"
              >
                👎
              </button>
            </div>
          </li>
        </ul>
        <p v-if="!npcNotesState.loading && filteredNpcNotes.length === 0" class="muted small">
          No NPC notes yet.
        </p>
        <button
          v-if="npcNotesState.canEdit"
          class="npc-notes-btn npc-notes-btn--ghost npc-notes-new"
          type="button"
          @click="startNewNpcNoteEntry()"
        >
          New NPC
        </button>
      </aside>
      <section class="npc-notes-content">
        <div v-if="npcNotesState.loading" class="npc-notes-placeholder">
          Loading NPC notes…
        </div>
        <template v-else>
          <header class="npc-notes-content-header">
            <div>
              <p class="npc-notes-eyebrow">
                {{ npcNotesReadOnly ? 'Viewing entry' : 'Editing entry' }}
              </p>
              <h3>{{ npcNotesState.draft.npcName || 'New NPC' }}</h3>
              <p v-if="selectedNpcNote?.lastEditedByName" class="npc-notes-meta">
                Last edited by {{ selectedNpcNote.lastEditedByName }}
              </p>
              <p v-else-if="selectedNpcNote?.updatedAt" class="npc-notes-meta">
                Last updated {{ formatDate(selectedNpcNote.updatedAt) }}
              </p>
              <p v-if="selectedNpcNotePendingDeletion" class="npc-notes-pending-hint">
                Deletion requested
                {{ selectedNpcNote?.deletionRequestedAt ? formatDate(selectedNpcNote.deletionRequestedAt) : '' }}
                by {{ selectedNpcNote?.deletionRequestedByName ?? 'a guild member' }}
              </p>
              <p v-if="npcNotesState.deletionStatus" class="npc-notes-status">
                {{ npcNotesState.deletionStatus }}
              </p>
            </div>
            <div class="npc-notes-header-actions">
              <a
                v-if="npcNotesExternalLink"
                class="npc-notes-link"
                :href="npcNotesExternalLink"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Alla Entry ↗
              </a>
              <span v-if="npcNotesReadOnly" class="npc-notes-badge">View only</span>
              <button
                v-if="!npcNotesReadOnly && selectedNpcNote && !selectedNpcNotePendingDeletion && !npcNotesState.canApproveDeletion"
                class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact"
                type="button"
                :disabled="!npcNotesState.selectedName"
                @click="requestNpcNoteDeletion"
              >
                Request Deletion
              </button>
              <button
                v-else-if="npcNotesState.canApproveDeletion && selectedNpcNote && !selectedNpcNotePendingDeletion"
                class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact"
                type="button"
                :disabled="!npcNotesState.selectedName"
                @click="confirmImmediateNpcDeletion"
              >
                Delete
              </button>
              <span
                v-else-if="selectedNpcNotePendingDeletion"
                class="npc-notes-pending-pill"
              >
                Pending approval
              </span>
            </div>
          </header>
          <div class="npc-notes-grid">
            <section class="npc-notes-panel">
              <div class="npc-notes-field">
                <span>NPC Name</span>
                <input
                  v-model="npcNotesState.draft.npcName"
                  class="npc-notes-input"
                  type="text"
                  maxlength="191"
                  :disabled="npcNotesReadOnly"
                />
              </div>
              <div class="npc-notes-field">
                <span>Alla Link</span>
                <input
                  v-model="npcNotesState.draft.allaLink"
                  class="npc-notes-input"
                  type="url"
                  placeholder="https://alla.clumsysworld.com/..."
                  :disabled="npcNotesReadOnly"
                />
              </div>
            </section>
            <section class="npc-notes-panel npc-notes-panel--notes">
              <div class="npc-notes-field">
                <span>Notes</span>
                <textarea
                  v-model="npcNotesState.draft.notes"
                  class="npc-notes-textarea"
                  rows="10"
                  :disabled="npcNotesReadOnly"
                />
              </div>
            </section>
          </div>
          <div class="npc-notes-grid">
            <section class="npc-notes-panel">
            <header>
              <div>
                <h4>Spells</h4>
                <p class="muted small">Document dangerous abilities with Alla references.</p>
              </div>
              <button
                v-if="!npcNotesReadOnly"
                class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact"
                type="button"
                @click="addNpcNoteAssociationRow('spells')"
              >
                Add Spell
              </button>
            </header>
            <div v-if="npcNotesState.draft.spells.length === 0" class="npc-notes-empty muted small">
              No spells tracked yet.
            </div>
            <div class="npc-notes-chip-grid">
              <div
                v-for="spell in npcNotesState.draft.spells"
                :key="spell.localId"
                class="npc-notes-chip-wrapper"
                :class="{ 'npc-notes-chip-wrapper--active': isEditingAssociation('spells', spell.localId) }"
              >
                <template v-if="npcNotesReadOnly">
                  <a
                    v-if="getAssociationDisplayLink('spells', spell)"
                    class="npc-notes-chip"
                    :href="getAssociationDisplayLink('spells', spell) || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    @contextmenu="handleAssociationContextMenu($event, 'spells', spell)"
                  >
                    {{ getAssociationDisplayName('spells', spell) }}
                  </a>
                  <span v-else class="npc-notes-chip npc-notes-chip--disabled">
                    {{ getAssociationDisplayName('spells', spell) }}
                  </span>
                </template>
                <template v-else>
                  <button
                    class="npc-notes-chip npc-notes-chip--button"
                    type="button"
                    @click="handleAssociationChipClick('spells', spell)"
                    @contextmenu="handleAssociationContextMenu($event, 'spells', spell)"
                  >
                    {{ getAssociationDisplayName('spells', spell) }}
                    <span v-if="getAssociationDisplayLink('spells', spell)" aria-hidden="true">↗</span>
                  </button>
                  <button
                    class="icon-button icon-button--chip-delete"
                    type="button"
                    @click.stop="confirmAssociationDelete('spells', spell.localId)"
                  >
                    ✕
                  </button>
                </template>
              </div>
            </div>
            <div
              v-if="!npcNotesReadOnly && npcNotesState.associationEditor.type === 'spells'"
              class="npc-notes-association-form"
            >
              <div class="npc-notes-association-edit">
                <input
                  v-model="npcNotesState.associationEditor.name"
                  class="npc-notes-input"
                  type="text"
                  placeholder="Spell name"
                />
                <input
                  v-model="npcNotesState.associationEditor.allaLink"
                  class="npc-notes-input"
                  type="url"
                  placeholder="https://alla.clumsysworld.com/..."
                />
                <button class="npc-notes-btn npc-notes-btn--primary npc-notes-btn--compact" type="button" @click="confirmAssociationEdit()" :disabled="!associationEditorActive()">
                  Apply
                </button>
              </div>
              <div class="npc-notes-association-actions">
                <button class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact" type="button" @click="resetAssociationEditor()">
                  Cancel
                </button>
              </div>
            </div>
            </section>
            <section class="npc-notes-panel">
            <header>
              <div>
                <h4>Associated NPCs</h4>
                <p class="muted small">Track adds, escorts, or other linked encounters.</p>
              </div>
              <button
                v-if="!npcNotesReadOnly"
                class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact"
                type="button"
                @click="addNpcNoteAssociationRow('relatedNpcs')"
              >
                Add NPC
              </button>
            </header>
            <div v-if="npcNotesState.draft.relatedNpcs.length === 0" class="npc-notes-empty muted small">
              No associated NPCs listed.
            </div>
            <div class="npc-notes-chip-grid">
              <div
                v-for="assoc in npcNotesState.draft.relatedNpcs"
                :key="assoc.localId"
                class="npc-notes-chip-wrapper"
                :class="{ 'npc-notes-chip-wrapper--active': isEditingAssociation('relatedNpcs', assoc.localId) }"
              >
                <template v-if="npcNotesReadOnly">
                  <a
                    v-if="getAssociationDisplayLink('relatedNpcs', assoc)"
                    class="npc-notes-chip"
                    :href="getAssociationDisplayLink('relatedNpcs', assoc) || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    @contextmenu="handleAssociationContextMenu($event, 'relatedNpcs', assoc)"
                  >
                    {{ getAssociationDisplayName('relatedNpcs', assoc) }}
                  </a>
                  <span v-else class="npc-notes-chip npc-notes-chip--disabled">
                    {{ getAssociationDisplayName('relatedNpcs', assoc) }}
                  </span>
                </template>
                <template v-else>
                  <button
                    class="npc-notes-chip npc-notes-chip--button"
                    type="button"
                    @click="handleAssociationChipClick('relatedNpcs', assoc)"
                    @contextmenu="handleAssociationContextMenu($event, 'relatedNpcs', assoc)"
                  >
                    {{ getAssociationDisplayName('relatedNpcs', assoc) }}
                    <span v-if="getAssociationDisplayLink('relatedNpcs', assoc)" aria-hidden="true">↗</span>
                  </button>
                  <button
                    class="icon-button icon-button--chip-delete"
                    type="button"
                    @click.stop="confirmAssociationDelete('relatedNpcs', assoc.localId)"
                  >
                    ✕
                  </button>
                </template>
              </div>
            </div>
            <div
              v-if="!npcNotesReadOnly && npcNotesState.associationEditor.type === 'relatedNpcs'"
              class="npc-notes-association-form"
            >
              <div class="npc-notes-association-edit">
                <input
                  v-model="npcNotesState.associationEditor.name"
                  class="npc-notes-input"
                  type="text"
                  placeholder="NPC name"
                />
                <input
                  v-model="npcNotesState.associationEditor.allaLink"
                  class="npc-notes-input"
                  type="url"
                  placeholder="https://alla.clumsysworld.com/..."
                />
                <button class="npc-notes-btn npc-notes-btn--primary npc-notes-btn--compact" type="button" @click="confirmAssociationEdit()" :disabled="!associationEditorActive()">
                  Apply
                </button>
              </div>
              <div class="npc-notes-association-actions">
                <button class="npc-notes-btn npc-notes-btn--ghost npc-notes-btn--compact" type="button" @click="resetAssociationEditor()">
                  Cancel
                </button>
              </div>
            </div>
            </section>
          </div>
          <p v-if="npcNotesState.error" class="error npc-notes-error">{{ npcNotesState.error }}</p>
          <footer class="modal__actions npc-notes-actions">
            <button
              v-if="!npcNotesReadOnly"
              class="npc-notes-btn npc-notes-btn--primary"
              type="button"
              :disabled="npcNotesState.saving"
              @click="saveNpcNote"
            >
              {{ npcNotesState.saving ? 'Saving…' : 'Save Notes' }}
            </button>
          </footer>
        </template>
      </section>
    </div>
  </div>
</div>
<AttendanceEventModal
  v-if="selectedAttendanceEvent"
  :event="selectedAttendanceEvent"
  :can-edit="canManageRaid"
    :saving="attendanceModalSaving"
    @close="closeAttendanceEvent"
    @upload="handleAttendanceUploadFromModal"
    @save="handleAttendanceModalSave"
  />
  <ConfirmationModal
    v-if="confirmModal.visible"
    :title="confirmModal.title"
    :description="confirmModal.message"
    :confirm-label="confirmModal.confirmLabel"
    :secondary-confirm-label="confirmModal.secondaryConfirmLabel"
    :cancel-label="confirmModal.cancelLabel"
    @confirm="resolveConfirmation('primary')"
    @secondary-confirm="resolveConfirmation('secondary')"
    @cancel="resolveConfirmation('cancel')"
  />
  <div v-if="showNpcKillGraph" class="modal-backdrop" @click.self="showNpcKillGraph = false">
    <div class="modal modal--wide npc-kill-modal">
      <header class="modal__header">
        <div>
          <h3>NPC Kills Over Time</h3>
          <p class="muted small">Scatterplot of every recorded kill within the raid window.</p>
        </div>
        <button class="icon-button" type="button" @click="showNpcKillGraph = false">✕</button>
      </header>
      <div class="npc-kill-chart">
        <Scatter
          ref="npcKillChartRef"
          v-if="npcKillScatterData && npcKillEvents.length > 0"
          :data="npcKillScatterData"
          :options="npcKillScatterOptions"
          :plugins="[npcKillScatterPlugin]"
        />
        <p v-else class="muted small">No kill data available.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Scatter } from 'vue-chartjs';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import AttendanceEventModal from '../components/AttendanceEventModal.vue';
import ConfirmationModal from '../components/ConfirmationModal.vue';
import RosterPreviewModal from '../components/RosterPreviewModal.vue';
import CharacterLink from '../components/CharacterLink.vue';
import { api } from '../services/api';
import {
  characterClassLabels,
  characterClassIcons,
  getRoleCategoryForClass,
  roleCategoryLabels,
  roleCategoryOrder,
  type AttendanceStatus,
  type CharacterClass,
  type RaidRoleCategory,
  type GuildRole
} from '../services/types';
import type {
  AttendanceEventSummary,
  AttendanceRecordInput,
  CharacterSearchResult,
  GuildLootListEntry,
  GuildLootListSummary,
  GuildNpcNote,
  RaidDetail,
  RaidEventSummary,
  RaidLootEvent,
  RaidSignup,
  SignupEntry,
  SignupStatus,
  UserCharacter
} from '../services/api';
import { useAuthStore } from '../stores/auth';
import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { buildLootListLookup, matchesLootListEntry, normalizeLootItemName } from '../utils/lootLists';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import {
  getGuildBankDisplayName,
  normalizeLooterName,
  normalizeLooterForSubmission as normalizeLooterForSubmissionUtil
} from '../utils/lootNames';
import { normalizeOptionalUrl } from '../utils/urls';
import { ensureChartJsRegistered } from '../utils/registerCharts';
import { parseNpcKills } from '../services/npcKillParser';

type AttendanceModalRecordInput = Omit<AttendanceRecordInput, 'characterId' | 'status'> & {
  characterId?: string | null;
  status?: AttendanceStatus | null;
  id?: string;
  isMain?: boolean;
};

type NpcNoteAssociationDraft = {
  localId: string;
  name: string;
  allaLink: string;
};

type NpcAssociationType = 'spells' | 'relatedNpcs';

ensureChartJsRegistered();

const route = useRoute();
const router = useRouter();
const raidId = route.params.raidId as string;
const authStore = useAuthStore();
const guildBankStore = useGuildBankStore();
const tooltipStore = useItemTooltipStore();

const raid = ref<RaidDetail | null>(null);
const attendanceEvents = ref<AttendanceEventSummary[]>([]);
const guildMainCharacterNames = ref<Set<string>>(new Set());
const deletingAttendanceId = ref<string | null>(null);
const attendanceLoading = ref(false);
const showRosterModal = ref(false);
const rosterPreview = ref<AttendanceRecordInput[] | null>(null);
const rosterMeta = ref<{ filename: string; uploadedAt: string } | null>(null);
const submittingAttendance = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedAttendanceEvent = ref<AttendanceEventSummary | null>(null);
const attendanceModalSaving = ref(false);
const rosterEditingEventId = ref<string | null>(null);
const validCharacterClasses = new Set<CharacterClass>(
  Object.keys(characterClassLabels) as CharacterClass[]
);
const attendanceStatusOptions: AttendanceStatus[] = ['PRESENT', 'LATE', 'BENCHED', 'ABSENT'];
const lootEvents = ref<RaidLootEvent[]>([]);
const npcNotes = ref<GuildNpcNote[]>([]);
const npcNotesLoaded = ref(false);
const npcNotesState = reactive({
  visible: false,
  loading: false,
  saving: false,
  error: '',
  canEdit: false,
  canApproveDeletion: false,
  viewerRole: null as GuildRole | null,
  search: '',
  selectedName: '',
  draft: {
    npcName: '',
    notes: '',
    allaLink: '',
    spells: [] as NpcNoteAssociationDraft[],
    relatedNpcs: [] as NpcNoteAssociationDraft[]
  },
  associationEditor: {
    type: null as 'spells' | 'relatedNpcs' | null,
    localId: '',
    name: '',
    allaLink: ''
  },
  associationMenu: {
    visible: false,
    x: 0,
    y: 0,
    type: null as NpcAssociationType | null,
    localId: ''
  },
  deletionStatus: ''
});
const npcNotesReadOnly = computed(() => !npcNotesState.canEdit);
const canAccessLootTracker = computed(() => Boolean(raid.value));
const guildBankDisplayName = computed(() =>
  getGuildBankDisplayName(raid.value?.guild.name ?? null)
);

function normalizeLooterNameValue(value?: string | null): string {
  return normalizeLooterName(value ?? null, raid.value?.guild.name ?? null).name;
}

function isGuildBankName(value?: string | null): boolean {
  return normalizeLooterName(value ?? null, raid.value?.guild.name ?? null).isGuildBank;
}

function isMasterLooterName(value?: string | null): boolean {
  return normalizeLooterName(value ?? null, raid.value?.guild.name ?? null).isMasterLooter;
}

function normalizeLooterForSubmission(value: string): string {
  return normalizeLooterForSubmissionUtil(value, raid.value?.guild.name ?? null);
}

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
}

function generateLocalId() {
  return `temp-${Math.random().toString(36).slice(2, 9)}`;
}

function createAssociationDraft(
  initial?: Partial<NpcNoteAssociationDraft> & { id?: string }
): NpcNoteAssociationDraft {
  return {
    localId: initial?.localId ?? initial?.id ?? generateLocalId(),
    name: initial?.name ?? '',
    allaLink: initial?.allaLink ?? ''
  };
}

async function ensureNpcNotesLoaded() {
  if (npcNotesLoaded.value || npcNotesState.loading) {
    return;
  }
  if (!raid.value?.guild?.id) {
    return;
  }
  npcNotesState.loading = true;
  npcNotesState.error = '';
  try {
    const response = await api.fetchGuildNpcNotes(raid.value.guild.id);
    npcNotes.value = response.notes;
    npcNotesState.canEdit = response.canEdit;
    npcNotesState.canApproveDeletion = response.canApproveDeletion;
    npcNotesState.viewerRole = response.viewerRole;
    npcNotesLoaded.value = true;
  } catch (error) {
    npcNotesState.error = extractErrorMessage(error, 'Unable to load NPC notes.');
  } finally {
    npcNotesState.loading = false;
  }
}

function setNpcNotesDraft(note: GuildNpcNote | null, fallbackName?: string) {
  npcNotesState.draft.npcName = note?.npcName ?? fallbackName ?? '';
  npcNotesState.draft.notes = note?.notes ?? '';
  npcNotesState.draft.allaLink = note?.allaLink ?? '';
  npcNotesState.draft.spells = note?.spells
    ? note.spells.map((spell) => createAssociationDraft({
        localId: spell.id,
        name: spell.name,
        allaLink: spell.allaLink
      }))
    : [];
  npcNotesState.draft.relatedNpcs = note?.relatedNpcs
    ? note.relatedNpcs.map((npc) => createAssociationDraft({
        localId: npc.id,
        name: npc.name,
        allaLink: npc.allaLink
      }))
    : [];
  resetAssociationEditor();
}

function selectNpcNotesEntry(name?: string) {
  const target = (name ?? '').trim();
  npcNotesState.selectedName = target;
  if (!target) {
    setNpcNotesDraft(null, '');
    return;
  }
  const match = npcNotes.value.find(
    (note) => note.npcName.toLowerCase() === target.toLowerCase()
  );
  setNpcNotesDraft(match ?? null, target);
  closeAssociationContext();
  npcNotesState.deletionStatus = '';
}

async function handleOpenNpcNotes(npcName?: string) {
  if (!raid.value?.guild?.id) {
    window.alert('Raid data is still loading.');
    return;
  }
  npcNotesState.visible = true;
  await ensureNpcNotesLoaded();
  if (npcName) {
    selectNpcNotesEntry(npcName);
  } else if (!npcNotesState.selectedName) {
    selectNpcNotesEntry(sortedNpcNotes.value[0]?.npcName ?? '');
  }
}

function closeNpcNotesModal() {
  if (npcNotesState.saving) {
    return;
  }
  npcNotesState.visible = false;
  resetAssociationEditor();
  npcNotesState.deletionStatus = '';
}

function addNpcNoteAssociationRow(type: NpcAssociationType) {
  const draft = createAssociationDraft();
  npcNotesState.draft[type].push(draft);
  beginAssociationEdit(type, draft);
}

function upsertLocalNpcNote(note: GuildNpcNote) {
  const index = npcNotes.value.findIndex(
    (entry) => entry.npcName.toLowerCase() === note.npcName.toLowerCase()
  );
  if (index >= 0) {
    npcNotes.value.splice(index, 1, note);
  } else {
    npcNotes.value.push(note);
  }
}

function removeLocalNpcNote(npcName: string) {
  const index = npcNotes.value.findIndex(
    (entry) => entry.npcName.toLowerCase() === npcName.toLowerCase()
  );
  if (index >= 0) {
    npcNotes.value.splice(index, 1);
  }
}

function normalizeClientAllaLink(value?: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const withoutProtocol = withProtocol.replace(/^https?:\/\//i, '').toLowerCase();
  if (!withoutProtocol.startsWith('alla.clumsysworld.com')) {
    throw new Error('Alla links must start with alla.clumsysworld.com');
  }
  return withProtocol;
}

function formatDisplayAllaLink(value?: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function resetAssociationEditor() {
  npcNotesState.associationEditor.type = null;
  npcNotesState.associationEditor.localId = '';
  npcNotesState.associationEditor.name = '';
  npcNotesState.associationEditor.allaLink = '';
}

function getAssociationCollection(type: NpcAssociationType): NpcNoteAssociationDraft[] {
  return type === 'spells' ? npcNotesState.draft.spells : npcNotesState.draft.relatedNpcs;
}

function getAssociationById(type: NpcAssociationType, localId: string) {
  return getAssociationCollection(type).find((entry) => entry.localId === localId) ?? null;
}

function isEditingAssociation(type: NpcAssociationType, localId: string) {
  return (
    npcNotesState.associationEditor.type === type &&
    npcNotesState.associationEditor.localId === localId
  );
}

function beginAssociationEdit(type: NpcAssociationType, entry: NpcNoteAssociationDraft) {
  if (npcNotesReadOnly.value) {
    return;
  }
  closeAssociationContext();
  npcNotesState.associationEditor.type = type;
  npcNotesState.associationEditor.localId = entry.localId;
  npcNotesState.associationEditor.name = entry.name;
  npcNotesState.associationEditor.allaLink = entry.allaLink;
}

function handleAssociationChipClick(type: NpcAssociationType, entry: NpcNoteAssociationDraft) {
  const url = formatDisplayAllaLink(entry.allaLink);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  beginAssociationEdit(type, entry);
}

async function requestNpcNoteDeletion() {
  if (!raid.value?.guild?.id || !npcNotesState.selectedName) {
    return;
  }
  if (selectedNpcNotePendingDeletion.value) {
    npcNotesState.deletionStatus = 'Deletion already pending approval.';
    return;
  }
  npcNotesState.deletionStatus = 'Requesting deletion…';
  try {
    const note = await api.requestGuildNpcNoteDeletion(
      raid.value.guild.id,
      npcNotesState.selectedName
    );
    upsertLocalNpcNote(note);
    selectNpcNotesEntry(note.npcName);
    npcNotesState.deletionStatus = 'Awaiting officer approval.';
  } catch (error) {
    npcNotesState.deletionStatus = extractErrorMessage(
      error,
      'Unable to request deletion.'
    );
  }
}

function confirmImmediateNpcDeletion() {
  if (!npcNotesState.selectedName) {
    return;
  }
  const confirmed = window.confirm(
    `This will permanently delete ${npcNotesState.selectedName}. Continue?`
  );
  if (!confirmed) {
    return;
  }
  handleNpcNoteDeletionDecision(npcNotesState.selectedName, 'APPROVE');
}

async function handleNpcNoteDeletionDecision(
  npcName: string,
  decision: 'APPROVE' | 'DENY'
) {
  if (!raid.value?.guild?.id || !npcNotesState.canApproveDeletion) {
    return;
  }
  if (decision === 'APPROVE') {
    const confirmed = window.confirm(`Approve deletion of ${npcName}?`);
    if (!confirmed) {
      return;
    }
  }
  try {
    const result = await api.decideGuildNpcNoteDeletion(
      raid.value.guild.id,
      npcName,
      decision
    );
    if (decision === 'APPROVE') {
      removeLocalNpcNote(npcName);
      if (npcNotesState.selectedName.toLowerCase() === npcName.toLowerCase()) {
        selectNpcNotesEntry(sortedNpcNotes.value[0]?.npcName ?? '');
      }
      npcNotesState.deletionStatus = 'Deletion approved.';
    } else if (result) {
      upsertLocalNpcNote(result);
      if (npcNotesState.selectedName.toLowerCase() === npcName.toLowerCase()) {
        selectNpcNotesEntry(result.npcName);
      }
      npcNotesState.deletionStatus = 'Deletion request denied.';
    }
  } catch (error) {
    window.alert(
      extractErrorMessage(error, 'Unable to process deletion decision.')
    );
  }
}

function openAssociationContext(
  event: MouseEvent,
  type: NpcAssociationType,
  entry: NpcNoteAssociationDraft
) {
  if (npcNotesReadOnly.value) {
    return;
  }
  closeAssociationContext();
  npcNotesState.associationMenu.visible = true;
  npcNotesState.associationMenu.type = type;
  npcNotesState.associationMenu.localId = entry.localId;
  npcNotesState.associationMenu.x = event.clientX;
  npcNotesState.associationMenu.y = event.clientY;
}

function closeAssociationContext() {
  npcNotesState.associationMenu.visible = false;
  npcNotesState.associationMenu.type = null;
  npcNotesState.associationMenu.localId = '';
}

function handleAssociationContextMenu(
  event: MouseEvent,
  type: NpcAssociationType,
  entry: NpcNoteAssociationDraft
) {
  if (npcNotesReadOnly.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  openAssociationContext(event, type, entry);
}

function handleAssociationContextEdit() {
  const { type, localId } = npcNotesState.associationMenu;
  if (!type || !localId) {
    closeAssociationContext();
    return;
  }
  const entry = getAssociationById(type, localId);
  if (entry) {
    beginAssociationEdit(type, entry);
  }
  closeAssociationContext();
}

function handleAssociationContextDelete() {
  const { type, localId } = npcNotesState.associationMenu;
  if (!type || !localId) {
    closeAssociationContext();
    return;
  }
  confirmAssociationDelete(type, localId);
  closeAssociationContext();
}

function confirmAssociationEdit() {
  const { type, localId, name, allaLink } = npcNotesState.associationEditor;
  if (!type || !localId) {
    return;
  }
  const collection = getAssociationCollection(type);
  const target = collection.find((entry) => entry.localId === localId);
  if (!target) {
    resetAssociationEditor();
    return;
  }
  target.name = name.trim();
  target.allaLink = allaLink.trim();
  resetAssociationEditor();
}

function confirmAssociationDelete(type: NpcAssociationType, localId: string) {
  if (!window.confirm('Remove this entry?')) {
    return;
  }
  const collection = getAssociationCollection(type);
  const index = collection.findIndex((entry) => entry.localId === localId);
  if (index !== -1) {
    collection.splice(index, 1);
  }
  if (isEditingAssociation(type, localId)) {
    resetAssociationEditor();
  }
}

function associationEditorActive() {
  return Boolean(npcNotesState.associationEditor.type && npcNotesState.associationEditor.localId);
}

function getAssociationDisplayName(type: NpcAssociationType, entry: NpcNoteAssociationDraft) {
  if (isEditingAssociation(type, entry.localId)) {
    return npcNotesState.associationEditor.name || (type === 'spells' ? 'Spell name' : 'NPC name');
  }
  return entry.name || (type === 'spells' ? 'Spell name' : 'NPC name');
}

function getAssociationDisplayLink(type: NpcAssociationType, entry: NpcNoteAssociationDraft) {
  if (isEditingAssociation(type, entry.localId)) {
    return formatDisplayAllaLink(npcNotesState.associationEditor.allaLink);
  }
  return formatDisplayAllaLink(entry.allaLink);
}

async function saveNpcNote() {
  if (!raid.value?.guild?.id || npcNotesReadOnly.value) {
    return;
  }
  const npcName = npcNotesState.draft.npcName.trim();
  if (!npcName) {
    npcNotesState.error = 'NPC name is required.';
    return;
  }

  let npcAllaLink: string | null = null;
  try {
    npcAllaLink = normalizeClientAllaLink(npcNotesState.draft.allaLink);
  } catch (error) {
    npcNotesState.error = error instanceof Error ? error.message : 'Invalid Alla link.';
    return;
  }

  const spellsPayload: Array<{ name: string; allaLink: string }> = [];
  for (const spell of npcNotesState.draft.spells) {
    const name = spell.name.trim();
    const link = spell.allaLink.trim();
    if (!name && !link) {
      continue;
    }
    if (!name || !link) {
      npcNotesState.error = 'Spell name and Alla link are required.';
      return;
    }
    try {
      spellsPayload.push({ name, allaLink: normalizeClientAllaLink(link) ?? link });
    } catch (error) {
      npcNotesState.error = error instanceof Error ? error.message : 'Invalid Alla link.';
      return;
    }
  }

  const relatedPayload: Array<{ name: string; allaLink: string }> = [];
  for (const npc of npcNotesState.draft.relatedNpcs) {
    const name = npc.name.trim();
    const link = npc.allaLink.trim();
    if (!name && !link) {
      continue;
    }
    if (!name || !link) {
      npcNotesState.error = 'Associated NPC name and Alla link are required.';
      return;
    }
    try {
      relatedPayload.push({ name, allaLink: normalizeClientAllaLink(link) ?? link });
    } catch (error) {
      npcNotesState.error = error instanceof Error ? error.message : 'Invalid Alla link.';
      return;
    }
  }

  npcNotesState.saving = true;
  npcNotesState.error = '';
  try {
    const note = await api.upsertGuildNpcNote(raid.value.guild.id, npcName, {
      notes: npcNotesState.draft.notes ? npcNotesState.draft.notes : null,
      allaLink: npcAllaLink,
      spells: spellsPayload,
      relatedNpcs: relatedPayload
    });
    upsertLocalNpcNote(note);
    selectNpcNotesEntry(note.npcName);
  } catch (error) {
    npcNotesState.error = extractErrorMessage(error, 'Unable to save NPC note.');
  } finally {
    npcNotesState.saving = false;
  }
}

function startNewNpcNoteEntry(prefillName?: string) {
  npcNotesState.selectedName = prefillName?.trim() ?? '';
  setNpcNotesDraft(null, npcNotesState.selectedName);
}

async function openNpcNotesFromKill() {
  const npcName = killContextMenu.npcName.trim();
  closeKillContextMenu();
  await handleOpenNpcNotes(npcName || undefined);
}

function openInventory(characterName: string) {
  const gid = raid.value?.guildId || raid.value?.guild?.id;
  if (!gid) return;
  guildBankStore.openCharacterInventory(characterName, gid);
}

// Tooltip handlers for item icons
function showItemTooltip(event: MouseEvent, entry: LootEntryDisplay) {
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

const pendingAttendanceEventId = ref<string | null>(
  typeof route.query.attendanceEventId === 'string'
    ? (route.query.attendanceEventId as string)
    : null
);
const lastAutoOpenedAttendanceId = ref<string | null>(null);
const lootListSummary = ref<GuildLootListSummary | null>(null);
const userCharacters = ref<UserCharacter[]>([]);
const loadingUserCharacters = ref(false);
const characterLoadError = ref<string | null>(null);
const signupDraft = ref<string[]>([]);
const notAttendingDraft = ref<Set<string>>(new Set());
const signupSaving = ref(false);
const signupError = ref<string | null>(null);
const signupSuccess = ref<string | null>(null);
const maxSignupSlots = 2;
const roleCategories = roleCategoryOrder;
const sortedNpcNotes = computed(() =>
  [...npcNotes.value].sort((a, b) => a.npcName.localeCompare(b.npcName))
);
const filteredNpcNotes = computed(() => {
  const query = npcNotesState.search.trim().toLowerCase();
  if (!query) {
    return sortedNpcNotes.value;
  }
  return sortedNpcNotes.value.filter((note) => note.npcName.toLowerCase().includes(query));
});
const selectedNpcNote = computed(() => {
  const target = npcNotesState.selectedName.trim().toLowerCase();
  if (!target) {
    return null;
  }
  return npcNotes.value.find((note) => note.npcName.toLowerCase() === target) ?? null;
});
const npcNotesExternalLink = computed(() => formatDisplayAllaLink(npcNotesState.draft.allaLink));
const selectedNpcNotePendingDeletion = computed(
  () => Boolean(selectedNpcNote.value?.deletionRequestedAt)
);
const npcNotesNameSet = computed(() => {
  const set = new Set<string>();
  for (const note of npcNotes.value) {
    const normalized = note.npcName?.trim().toLowerCase();
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
});

function npcHasNote(name: string) {
  return npcNotesNameSet.value.has(name.trim().toLowerCase());
}
const signupsCollapsed = ref(true);

// Signup context menu state
const signupContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  signup: null as RaidSignup | null
});

// Signup search state
const signupSearch = reactive({
  query: '',
  results: [] as CharacterSearchResult[],
  loading: false,
  error: null as string | null,
  showDropdown: false
});
let signupSearchTimeout: ReturnType<typeof setTimeout> | null = null;
const signupsToggleLabel = computed(() => (signupsCollapsed.value ? 'Expand Signups' : 'Collapse Signups'));
const collapsedGroupPreviewSize = 6;
const whitelistLookup = computed(() =>
  buildLootListLookup(lootListSummary.value?.whitelist ?? [])
);
const blacklistLookup = computed(() =>
  buildLootListLookup(lootListSummary.value?.blacklist ?? [])
);
const lootMonitorActive = computed(() => Boolean(raid.value?.logMonitor?.isActive));
const lootMonitorVisible = computed(() => lootMonitorActive.value);
const lootMonitorDisplayName = computed(() => {
  const name = raid.value?.logMonitor?.userDisplayName?.trim();
  return name && name.length > 0 ? name : null;
});
const lootMonitorStatusLabel = computed(() => {
  if (!lootMonitorVisible.value) {
    return 'Continuous loot monitoring inactive';
  }
  return lootMonitorDisplayName.value
    ? `Continuous loot monitoring active by ${lootMonitorDisplayName.value}`
    : 'Continuous loot monitoring active';
});

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
  emoji?: string | null;
  note?: string | null;
  count: number;
  eventIds: string[];
  isWhitelisted: boolean;
}
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
const groupedLoot = computed<GroupedLootEntry[]>(() => {
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
        emoji: event.emoji,
        note: event.note,
        count: 0,
        eventIds: [],
        isWhitelisted: false
      });
    }
    const entry = grouped.get(key)!;
    entry.count += 1;
    entry.eventIds.push(event.id);
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
    if (entry.itemId == null && event.itemId != null) {
      entry.itemId = event.itemId;
    }
    if (!hasValidIconId(entry.itemIconId) && hasValidIconId(event.itemIconId)) {
      entry.itemIconId = event.itemIconId;
    }
  }
  const whitelistLookupValue = whitelistLookup.value;
  return Array.from(grouped.values())
    .map((entry) => {
      const normalized = normalizeLootItemName(entry.itemName);
      return {
        ...entry,
        isWhitelisted: Boolean(
          matchesLootListEntry(whitelistLookupValue, entry.itemId, normalized)
        )
      };
    })
    .sort((a, b) => b.count - a.count);
});

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

const formatLooterLabel = (name: string, looterClass?: string | null) => {
  const classLabel = formatCharacterClassLabel(looterClass);
  return classLabel ? `${name} (${classLabel})` : name;
};

function handleLootCardClick(event: MouseEvent, itemName: string, itemId?: number | null) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a')) {
    return;
  }
  openAllaSearch(itemName, itemId);
}

function handleLootCardKeyEnter(event: KeyboardEvent, itemName: string, itemId?: number | null) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a')) {
    return;
  }
  openAllaSearch(itemName, itemId);
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

const startedAtInput = ref('');
const endedAtInput = ref('');
const initialStartedAt = ref('');
const initialEndedAt = ref('');
const savingTimes = ref(false);
const startingRaid = ref(false);
const endingRaid = ref(false);
const restartingRaid = ref(false);
const cancelingRaid = ref(false);
const uncancelingRaid = ref(false);
const announcingRaid = ref(false);
const renamingRaid = ref(false);
type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
const recurrenceForm = reactive({
  enabled: false,
  frequency: 'WEEKLY' as RecurrenceFrequency,
  interval: 1,
  endDate: ''
});
const initialRecurrence = reactive({
  enabled: false,
  frequency: 'WEEKLY' as RecurrenceFrequency,
  interval: 1,
  endDate: ''
});
const savingRecurrence = ref(false);
const recurrenceError = ref<string | null>(null);
const recurrenceIntervalSuffix = computed(() => {
  const interval = Math.max(1, Number(recurrenceForm.interval) || 1);
  switch (recurrenceForm.frequency) {
    case 'DAILY':
      return interval === 1 ? 'day' : 'days';
    case 'MONTHLY':
      return interval === 1 ? 'month' : 'months';
    default:
      return interval === 1 ? 'week' : 'weeks';
  }
});
const recurrenceDirty = computed(() =>
  recurrenceForm.enabled !== initialRecurrence.enabled ||
  recurrenceForm.frequency !== initialRecurrence.frequency ||
  recurrenceForm.interval !== initialRecurrence.interval ||
  recurrenceForm.endDate !== initialRecurrence.endDate
);

function goBackToRaids() {
  router.push({ name: 'Raids' });
}


watch(
  () => recurrenceForm.interval,
  (value) => {
    if (!Number.isFinite(value) || Number(value) < 1) {
      recurrenceForm.interval = 1;
    } else {
      recurrenceForm.interval = Math.floor(Number(value));
    }
  }
);

watch(
  () => recurrenceForm.enabled,
  async (enabled, previous) => {
    if (previous && !enabled) {
      await persistRecurrenceDisabled();
    }
  }
);
const notesInput = ref('');
const initialNotes = ref('');
const savingNotes = ref(false);
const notesError = ref<string | null>(null);
const notesDirty = computed(() => notesInput.value !== initialNotes.value);
type TargetEntry = {
  id: string;
  value: string;
};

const targetsModal = reactive({
  visible: false,
  zones: [] as TargetEntry[],
  bosses: [] as TargetEntry[],
  initialZones: [] as string[],
  initialBosses: [] as string[],
  zoneInput: '',
  bossInput: '',
  saving: false,
  error: ''
});
type TargetField = 'zones' | 'bosses';
const targetsCopyState = reactive({
  raids: [] as RaidEventSummary[],
  loading: false,
  loadError: '',
  selectedRaidId: '',
  search: '',
  lastCopiedRaidName: ''
});
const displayTargetZones = computed(() =>
  (raid.value?.targetZones ?? []).map((zone) => zone.trim()).filter((zone) => zone.length > 0)
);
const displayTargetBosses = computed(() =>
  (raid.value?.targetBosses ?? []).map((boss) => boss.trim()).filter((boss) => boss.length > 0)
);
const copyableRaidOptions = computed(() => {
  const excludeId = raidId;
  const withStart = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [...targetsCopyState.raids]
    .filter((summary) => summary.id !== excludeId)
    .sort((a, b) => withStart(b.startTime) - withStart(a.startTime));
});
const filteredCopyRaidOptions = computed(() => {
  const query = targetsCopyState.search.trim().toLowerCase();
  if (!query) {
    return copyableRaidOptions.value;
  }
  return copyableRaidOptions.value.filter((raid) => raid.name.toLowerCase().includes(query));
});
const selectedCopyRaid = computed(
  () =>
    copyableRaidOptions.value.find(
      (raidOption) => raidOption.id === targetsCopyState.selectedRaidId
    ) ?? null
);
const selectedCopyRaidZones = computed(() =>
  (selectedCopyRaid.value?.targetZones ?? [])
    .map((zone) => zone.trim())
    .filter((zone) => zone.length > 0)
);
const selectedCopyRaidBosses = computed(() =>
  (selectedCopyRaid.value?.targetBosses ?? [])
    .map((boss) => boss.trim())
    .filter((boss) => boss.length > 0)
);
watch(
  () => filteredCopyRaidOptions.value,
  (options: RaidEventSummary[]) => {
    if (options.length === 0) {
      targetsCopyState.selectedRaidId = '';
      return;
    }
    if (!options.some((option) => option.id === targetsCopyState.selectedRaidId)) {
      targetsCopyState.selectedRaidId = options[0].id;
    }
  },
  { immediate: true }
);
const normalizedTargetBosses = computed(() =>
  displayTargetBosses.value.map((boss) => ({
    label: boss,
    normalized: boss.trim().toLowerCase()
  }))
);
const normalizedTargetBossMap = computed(() => {
  const map = new Map<string, string>();
  normalizedTargetBosses.value.forEach((boss) => {
    if (boss.normalized) {
      map.set(boss.normalized, boss.label);
    }
  });
  return map;
});
const defeatedTargetBosses = computed(() => {
  const defeated = new Set<string>();
  const targetSet = new Set(normalizedTargetBosses.value.map((boss) => boss.normalized));
  if (targetSet.size === 0) {
    return defeated;
  }
  for (const event of npcKillEvents.value) {
    const normalized = event.npcName?.trim().toLowerCase();
    if (normalized && targetSet.has(normalized)) {
      defeated.add(normalized);
    }
  }
  return defeated;
});
const targetBossStatus = computed(() => {
  const statuses = new Map<string, boolean>();
  const defeated = defeatedTargetBosses.value;
  normalizedTargetBosses.value.forEach((boss) => {
    statuses.set(boss.label, defeated.has(boss.normalized));
  });
  return statuses;
});
const targetBossThreats = computed(() => {
  const threats = new Set<string>();
  const lookup = normalizedTargetBossMap.value;
  const playerNames = registeredCharacterNames.value;
  if (lookup.size === 0) {
    return threats;
  }
  npcKillEvents.value.forEach((event) => {
    const killer = event.killerName?.trim().toLowerCase();
    const victim = event.npcName?.trim().toLowerCase();
    if (!killer || !victim) {
      return;
    }
    if (!playerNames.has(victim)) {
      return;
    }
    const bossLabel = lookup.get(killer);
    if (bossLabel) {
      threats.add(bossLabel);
    }
  });
  return threats;
});
const npcKillEvents = computed(() => raid.value?.npcKillEvents ?? []);
const registeredCharacterNames = computed(() => guildMainCharacterNames.value);
const npcKillSummary = computed(() => {
  const kills = raid.value?.npcKills ?? [];
  const targetBossSet = new Set(normalizedTargetBosses.value.map((boss) => boss.normalized));
  return [...kills].sort((a, b) => {
    if (b.killCount !== a.killCount) {
      return b.killCount - a.killCount;
    }
    return a.npcName.localeCompare(b.npcName);
  }).map((kill) => ({
    ...kill,
    isTargetBoss: targetBossSet.has(kill.npcName.trim().toLowerCase())
  }));
});
const totalNpcKills = computed(() =>
  npcKillSummary.value.reduce((sum, kill) => sum + kill.killCount, 0)
);
const showNpcKillGraph = ref(false);
const uploadingKillLog = ref(false);
const killLogInput = ref<HTMLInputElement | null>(null);
const npcKillZoomRange = ref<{ min: number; max: number } | null>(null);
const npcKillChartRef = ref<any>(null);
let detachNpcKillWheel: (() => void) | null = null;
const killContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  npcName: ''
});
const addKillModal = reactive({
  visible: false,
  npcName: '',
  killerName: '',
  occurredAt: '',
  saving: false,
  error: ''
});

function openKillContextMenu(event: MouseEvent, npcName: string) {
  killContextMenu.visible = true;
  killContextMenu.x = event.clientX;
  killContextMenu.y = event.clientY;
  killContextMenu.npcName = npcName;
}

function closeKillContextMenu() {
  killContextMenu.visible = false;
  killContextMenu.npcName = '';
}

async function addTargetBossFromKill() {
  const npcName = killContextMenu.npcName.trim();
  if (!npcName) {
    closeKillContextMenu();
    return;
  }
  const normalized = npcName.toLowerCase();
  const existing = new Set(displayTargetBosses.value.map((boss) => boss.trim().toLowerCase()));
  if (existing.has(normalized)) {
    closeKillContextMenu();
    return;
  }
  try {
    await updateRaidTargets([...displayTargetBosses.value, npcName], displayTargetZones.value);
    await loadRaid();
  } catch (error) {
    window.alert('Unable to add boss target.');
    console.error(error);
  } finally {
    closeKillContextMenu();
  }
}

async function updateRaidTargets(bosses: string[], zones: string[]) {
  await api.updateRaid(raidId, {
    targetBosses: bosses,
    targetZones: zones
  });
}

function resetAddKillModalFields() {
  addKillModal.npcName = '';
  addKillModal.killerName = '';
  addKillModal.occurredAt = toInputValue(new Date().toISOString());
  addKillModal.error = '';
}

function openAddKillModal() {
  if (!canManageRaid.value) {
    return;
  }
  resetAddKillModalFields();
  addKillModal.visible = true;
}

function closeAddKillModal(force = false) {
  if (addKillModal.saving && !force) {
    return;
  }
  addKillModal.visible = false;
}

async function submitManualKill() {
  if (!raid.value || !canManageRaid.value || addKillModal.saving) {
    return;
  }
  const npcName = addKillModal.npcName.trim();
  if (npcName.length < 2) {
    addKillModal.error = 'Enter the NPC name.';
    return;
  }
  const occurredAtIso = fromInputValue(addKillModal.occurredAt);
  if (!occurredAtIso) {
    addKillModal.error = 'Select when the kill occurred.';
    return;
  }
  const killer = addKillModal.killerName.trim();
  addKillModal.saving = true;
  addKillModal.error = '';
  try {
    await api.recordRaidNpcKills(raid.value.id, [
      {
        npcName,
        occurredAt: occurredAtIso,
        killerName: killer.length > 0 ? killer : null
      }
    ]);
    await loadRaid();
    closeAddKillModal(true);
  } catch (error) {
    addKillModal.error = extractErrorMessage(error, 'Unable to add kill. Please try again.');
  } finally {
    addKillModal.saving = false;
  }
}

const npcKillColorCache = new Map<string, string>();
const npcColorPalette = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#38bdf8', '#f87171'];

function getNpcColor(name: string) {
  const key = name.toLowerCase();
  if (npcKillColorCache.has(key)) {
    return npcKillColorCache.get(key)!;
  }
  const index = npcKillColorCache.size % npcColorPalette.length;
  const color = npcColorPalette[index];
  npcKillColorCache.set(key, color);
  return color;
}

const npcKillTimeBounds = computed(() => {
  const times = npcKillEvents.value
    .map((event) => new Date(event.occurredAt).getTime())
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) {
    return null;
  }
  return {
    min: Math.min(...times),
    max: Math.max(...times)
  };
});

const npcKillScatterData = computed(() => {
  const events = npcKillEvents.value;
  if (events.length === 0) {
    return null;
  }
  const targetBossSet = new Set(normalizedTargetBosses.value.map((boss) => boss.normalized));
  const points = events
    .map((event, index) => {
      const occurredAt = new Date(event.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        return null;
      }
      const normalizedName = event.npcName.trim().toLowerCase();
      const isPlayerDeath = registeredCharacterNames.value.has(normalizedName);
      const isTargetBossKill = targetBossSet.has(normalizedName);
      return {
        x: occurredAt.getTime(),
        y: index + 1,
        npcName: event.npcName,
        killerName: event.killerName ?? null,
        occurredAt,
        color: isTargetBossKill ? '#facc15' : isPlayerDeath ? '#f87171' : getNpcColor(event.npcName),
        isPlayerDeath,
        isTargetBossKill
      };
    })
    .filter((point): point is NonNullable<typeof point> => Boolean(point));

  return {
    datasets: [
      {
        label: 'NPC Kills',
        data: points,
        showLine: true,
        spanGaps: false,
        borderColor: '#94a3b8',
        borderWidth: 1.5,
        pointBorderWidth: 1,
        pointBackgroundColor: points.map((point) => point.color),
        pointBorderColor: points.map((point) => point.color),
        pointRadius: points.map((point) => (point.isPlayerDeath ? 6 : 4)),
        pointHoverRadius: points.map((point) => (point.isPlayerDeath ? 8 : 6)),
        pointStyle: points.map((point) => (point.isTargetBossKill ? 'star' : 'circle'))
      }
    ]
  };
});

const npcKillScatterOptions = computed(() => ({
  maintainAspectRatio: false,
  parsing: false as const,
  scales: {
    x: {
      type: 'linear' as const,
      min: (npcKillZoomRange.value ?? npcKillTimeBounds.value)?.min,
      max: (npcKillZoomRange.value ?? npcKillTimeBounds.value)?.max,
      title: {
        display: true,
        text: 'Time'
      },
      ticks: {
        callback(value: string | number) {
          const date = new Date(Number(value));
          return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
        }
      }
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Kill Sequence'
      },
      ticks: {
        precision: 0
      }
    }
  },
  plugins: {
    tooltip: {
      callbacks: {
        label(context: any) {
          const raw = context.raw as {
            npcName: string;
            killerName?: string | null;
            occurredAt: Date;
          };
          const timeLabel = raw.occurredAt.toLocaleTimeString();
          const killerLabel = raw.killerName ? ` • ${raw.killerName}` : '';
          return `${raw.npcName}${killerLabel} @ ${timeLabel}`;
        }
      }
    }
  }
}));

const npcKillScatterPlugin = {
  id: 'npcKillScatterPlugin',
  afterDatasetsDraw(chart: any) {
    const dataset = chart.data.datasets?.[0];
    if (!dataset) {
      return;
    }
    const meta = chart.getDatasetMeta(0);
    const points = dataset.data as Array<{
      isPlayerDeath?: boolean;
      isTargetBossKill?: boolean;
    }>;
    const { ctx } = chart;
    meta.data.forEach((element: any, index: number) => {
      const raw = points?.[index];
      if (!raw) {
        return;
      }
      const icon = raw.isPlayerDeath ? '☠️' : raw.isTargetBossKill ? '⭐' : null;
      if (!icon) {
        return;
      }
      const x = element.x;
      const y = element.y;
      ctx.save();
      ctx.font = '20px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (raw.isPlayerDeath) {
        ctx.shadowColor = 'rgba(248, 113, 113, 0.7)';
      } else {
        ctx.shadowColor = 'rgba(250, 204, 21, 0.65)';
      }
      ctx.shadowBlur = 12;
      ctx.fillText(icon, x, y);
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }
};

function handleNpcKillChartWheel(event: WheelEvent) {
  event.preventDefault();
  const chart = npcKillChartRef.value?.chart;
  const bounds = npcKillTimeBounds.value;
  if (!chart || !bounds) {
    return;
  }
  const baseRange = npcKillZoomRange.value ?? bounds;
  const chartArea = chart.chartArea;
  if (!chartArea) {
    return;
  }
  const canvasRect = chart.canvas.getBoundingClientRect();
  const mouseX = event.clientX - canvasRect.left;
  if (mouseX < chartArea.left || mouseX > chartArea.right) {
    return;
  }
  const ratio = (mouseX - chartArea.left) / (chartArea.right - chartArea.left);
  const delta = event.deltaY;
  const zoomFactor = delta > 0 ? 1.1 : 0.9;
  const totalRange = baseRange.max - baseRange.min;
  const minRange = Math.max((bounds.max - bounds.min) / 200, 1000);
  const maxRange = bounds.max - bounds.min;
  let newRange = totalRange * zoomFactor;
  newRange = Math.min(Math.max(newRange, minRange), maxRange);
  const centerValue = baseRange.min + totalRange * ratio;
  let newMin = centerValue - newRange * ratio;
  let newMax = newMin + newRange;
  if (newMin < bounds.min) {
    newMin = bounds.min;
    newMax = newMin + newRange;
  }
  if (newMax > bounds.max) {
    newMax = bounds.max;
    newMin = newMax - newRange;
  }
  npcKillZoomRange.value = { min: newMin, max: newMax };
  chart.update('none');
}

watch(npcKillEvents, (events) => {
  if (events.length === 0) {
    showNpcKillGraph.value = false;
  }
});

watch(showNpcKillGraph, (open) => {
  if (typeof document === 'undefined') {
    return;
  }
  if (open) {
    document.body.classList.add('modal-open');
    npcKillZoomRange.value = null;
    nextTick(() => {
      detachNpcKillWheel?.();
      const chart = npcKillChartRef.value?.chart;
      if (!chart) {
        return;
      }
      const handler = (event: WheelEvent) => handleNpcKillChartWheel(event);
      chart.canvas.addEventListener('wheel', handler, { passive: false });
      detachNpcKillWheel = () => chart.canvas.removeEventListener('wheel', handler);
    });
  } else {
    document.body.classList.remove('modal-open');
    detachNpcKillWheel?.();
    detachNpcKillWheel = null;
  }
});

watch(npcKillEvents, () => {
  npcKillZoomRange.value = null;
});
const formattedTargetZonesHeader = computed(() => displayTargetZones.value.join(', '));
const targetsModalDirty = computed(() => {
  const hasPendingInput =
    targetsModal.zoneInput.trim().length > 0 || targetsModal.bossInput.trim().length > 0;
  return (
    hasPendingInput ||
    !areTargetListsEqual(extractTargetValues(targetsModal.zones), targetsModal.initialZones) ||
    !areTargetListsEqual(extractTargetValues(targetsModal.bosses), targetsModal.initialBosses)
  );
});
const confirmModal = reactive({
  visible: false,
  title: '',
  message: undefined as string | undefined,
  confirmLabel: 'Confirm',
  secondaryConfirmLabel: undefined as string | undefined,
  cancelLabel: 'Cancel'
});
const shareStatus = ref<string | null>(null);
let shareStatusTimeout: ReturnType<typeof setTimeout> | null = null;
const updatingDiscordVoice = ref(false);
let signupSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

let confirmResolver: ((value: 'primary' | 'secondary' | 'cancel') => void) | null = null;
const actionError = ref<string | null>(null);
const pendingEventTypes = ref<Array<'START' | 'END' | 'RESTART'>>([]);
const editLootModal = reactive<{
  visible: boolean;
  entry: GroupedLootEntry | null;
  form: { looterName: string; count: number; itemId: number | null };
  saving: boolean;
}>(
  {
    visible: false,
    entry: null,
    form: {
      looterName: '',
      count: 1,
      itemId: null
    },
    saving: false
  }
);
const notesPanelExpanded = ref(false);
const targetsPanelExpanded = ref(false);
const hasEffectiveStarted = computed(() => {
  const startedAt = raid.value?.startedAt;
  if (!startedAt) {
    return false;
  }
  return new Date(startedAt).getTime() <= Date.now();
});
const raidRecurrenceSummary = computed(() => describeRaidRecurrence(raid.value));
const recurrenceCardCollapsed = computed(() => !recurrenceForm.enabled);
const showRecurrenceSummary = computed(() => recurrenceForm.enabled);
const showRecurrenceSummaryText = computed(() => recurrenceForm.enabled);
const signupsLocked = computed(() => hasEffectiveStarted.value);
const canManageRaid = computed(() => {
  const permissions = raid.value?.permissions;
  if (!permissions) {
    return false;
  }

  if (typeof permissions.canManage === 'boolean') {
    return permissions.canManage;
  }

  const role = permissions.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canManageRaidDiscordLink = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const canManageLootLists = computed(() => {
  const role = raid.value?.permissions?.role;
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});
const hasEffectiveEnded = computed(() => {
  const endedAt = raid.value?.endedAt;
  if (!endedAt) {
    return false;
  }
  return new Date(endedAt).getTime() <= Date.now();
});
const hasEffectiveCanceled = computed(() => {
  const canceledAt = raid.value?.canceledAt;
  if (!canceledAt) {
    return false;
  }
  return new Date(canceledAt).getTime() <= Date.now();
});
const viewerUserId = computed(() => authStore.user?.userId ?? null);
const raidSignups = computed<RaidSignup[]>(() => raid.value?.signups ?? []);
const viewerSignups = computed<RaidSignup[]>(() => {
  const userId = viewerUserId.value;
  if (!userId) {
    return [];
  }
  return raidSignups.value.filter((entry) => entry.userId === userId);
});
const savedSignupIds = computed(() => viewerSignups.value.map((entry) => entry.characterId));
const savedNotAttendingIds = computed(() => new Set(
  viewerSignups.value
    .filter((entry) => entry.status === 'NOT_ATTENDING')
    .map((entry) => entry.characterId)
));
const sortedCharacters = computed(() => {
  return [...userCharacters.value].sort((a, b) => {
    if (a.isMain !== b.isMain) {
      return a.isMain ? -1 : 1;
    }
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    return a.name.localeCompare(b.name);
  });
});
const selectedCharacterIds = computed(() => new Set(signupDraft.value));
const signupDraftCount = computed(() => signupDraft.value.length);
const signupLimitReached = computed(() => signupDraftCount.value >= maxSignupSlots);
const signupDirty = computed(() => {
  if (!areIdListsEqual(signupDraft.value, savedSignupIds.value)) {
    return true;
  }
  // Check if status changed for any selected character
  for (const id of signupDraft.value) {
    const draftNotAttending = notAttendingDraft.value.has(id);
    const savedNotAttending = savedNotAttendingIds.value.has(id);
    if (draftNotAttending !== savedNotAttending) {
      return true;
    }
  }
  return false;
});
const viewerMains = computed(() => sortedCharacters.value.filter((character) => character.isMain));
const mainsButtonDisabled = computed(
  () =>
    signupsLocked.value ||
    signupSaving.value ||
    viewerMains.value.length === 0 ||
    sortedCharacters.value.length === 0
);
const groupedSignups = computed<Record<RaidRoleCategory, RaidSignup[]>>(() => {
  const groups: Record<RaidRoleCategory, RaidSignup[]> = {
    TANK: [],
    HEALER: [],
    SUPPORT: [],
    DPS: []
  };
  for (const signup of raidSignups.value) {
    const category = getRoleCategoryForClass(signup.characterClass);
    groups[category].push(signup);
  }
  for (const category of roleCategories) {
    groups[category] = groups[category]
      .slice()
      .sort((a, b) => a.characterName.localeCompare(b.characterName));
  }
  return groups;
});

const collapsedSignupGroups = computed(() =>
  roleCategories
    .map((category) => ({
      category,
      label: roleCategoryLabels[category],
      total: groupedSignups.value[category]?.length ?? 0,
      entries: (() => {
        const bucket = groupedSignups.value[category] ?? [];
        const userId = viewerUserId.value;
        const ordered = userId
          ? bucket
              .slice()
              .sort((a, b) => {
                const aSelf = a.userId === userId ? 1 : 0;
                const bSelf = b.userId === userId ? 1 : 0;
                if (aSelf !== bSelf) {
                  return bSelf - aSelf;
                }
                return a.characterName.localeCompare(b.characterName);
              })
          : bucket;
        return ordered.slice(0, collapsedGroupPreviewSize);
      })()
    }))
    .filter((group) => group.total > 0)
);

function isViewerSignup(entry: RaidSignup) {
  const userId = viewerUserId.value;
  if (!userId) {
    return false;
  }
  return entry.userId === userId;
}

watch(
  () => savedSignupIds.value.slice().sort().join('|') + '|' + Array.from(savedNotAttendingIds.value).sort().join(','),
  () => {
    applySignupDraft(savedSignupIds.value);
    notAttendingDraft.value = new Set(savedNotAttendingIds.value);
  },
  { immediate: true }
);

watch(
  () => sortedCharacters.value.map((character) => character.id).join('|'),
  () => {
    applySignupDraft(signupDraft.value);
  }
);

const canRestartRaid = computed(() => canManageRaid.value && hasEffectiveEnded.value);
const canCancelRaid = computed(() => canManageRaid.value && !hasEffectiveCanceled.value && !hasEffectiveStarted.value);
const canUncancelRaid = computed(() => canManageRaid.value && hasEffectiveCanceled.value);
const roleLabels: Record<string, string> = {
  LEADER: 'Guild Leader',
  OFFICER: 'Officer',
  RAID_LEADER: 'Raid Leader',
  MEMBER: 'Member',
  FRIENDS_FAMILY: 'Friends/Family'
};
const userGuildRoleLabel = computed(() => {
  const role = raid.value?.permissions?.role;
  if (!role) {
    return null;
  }
  return roleLabels[role] ?? role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
});

const raidStatusBadge = computed(() => {
  if (hasEffectiveCanceled.value) {
    return { label: 'Canceled', variant: 'raid-status-badge--canceled' };
  }
  if (hasEffectiveEnded.value) {
    return { label: 'Ended', variant: 'raid-status-badge--ended' };
  }
  if (hasEffectiveStarted.value) {
    return { label: 'Active', variant: 'raid-status-badge--active' };
  }
  return { label: 'Planned', variant: 'raid-status-badge--planned' };
});

async function loadUserCharacters() {
  loadingUserCharacters.value = true;
  characterLoadError.value = null;
  try {
    userCharacters.value = await api.fetchUserCharacters();
  } catch (error) {
    characterLoadError.value = extractErrorMessage(
      error,
      'Unable to load your characters. Please refresh.'
    );
  } finally {
    loadingUserCharacters.value = false;
  }
}

function clearSignupFeedback() {
  signupError.value = null;
  signupSuccess.value = null;
  if (signupSuccessTimeout) {
    clearTimeout(signupSuccessTimeout);
    signupSuccessTimeout = null;
  }
}

function toggleSignupsCollapsed() {
  signupsCollapsed.value = !signupsCollapsed.value;
}

function showSignupSuccess(message: string) {
  signupError.value = null;
  signupSuccess.value = message;
  if (signupSuccessTimeout) {
    clearTimeout(signupSuccessTimeout);
  }
  signupSuccessTimeout = setTimeout(() => {
    signupSuccess.value = null;
    signupSuccessTimeout = null;
  }, 4000);
}

function handleCharacterSelect(characterId: string) {
  if (signupsLocked.value || signupSaving.value) {
    return;
  }
  clearSignupFeedback();
  const selection = new Set(signupDraft.value);
  const notAttending = new Set(notAttendingDraft.value);
  const isSelected = selection.has(characterId);

  if (!isSelected) {
    // Not selected -> CONFIRMED (default)
    if (selection.size >= maxSignupSlots) {
      signupError.value = `You can sign up up to ${maxSignupSlots} characters for this raid.`;
      return;
    }
    selection.add(characterId);
    notAttending.delete(characterId);
  } else {
    // Selected -> deselect
    selection.delete(characterId);
    notAttending.delete(characterId);
  }

  applySignupDraft(Array.from(selection));
  notAttendingDraft.value = notAttending;
}

function setCharacterStatus(characterId: string, status: 'CONFIRMED' | 'NOT_ATTENDING') {
  if (signupsLocked.value || signupSaving.value) {
    return;
  }
  clearSignupFeedback();
  const notAttending = new Set(notAttendingDraft.value);

  if (status === 'NOT_ATTENDING') {
    notAttending.add(characterId);
  } else {
    notAttending.delete(characterId);
  }

  notAttendingDraft.value = notAttending;
}

function resetSignupSelection() {
  if (signupsLocked.value) {
    return;
  }
  clearSignupFeedback();
  applySignupDraft(savedSignupIds.value);
  notAttendingDraft.value = new Set(savedNotAttendingIds.value);
}

async function saveSignups(options?: { signupEntries?: SignupEntry[]; successMessage?: string }) {
  if (signupsLocked.value) {
    return;
  }
  if (!raid.value) {
    return;
  }
  // Build signup entries from current draft state
  const targetEntries: SignupEntry[] = options?.signupEntries ?? signupDraft.value.map((characterId) => ({
    characterId,
    status: notAttendingDraft.value.has(characterId) ? 'NOT_ATTENDING' as SignupStatus : 'CONFIRMED' as SignupStatus
  }));
  const targetIds = orderCharacterIds(targetEntries.map((e) => e.characterId));

  // Check if anything actually changed
  const hasConfirmedSignup = targetEntries.some((e) => e.status !== 'NOT_ATTENDING');
  if (!signupDirty.value && targetEntries.length > 0) {
    applySignupDraft(targetIds);
    const message =
      options?.successMessage ??
      (targetEntries.length > 0
        ? 'Your signups are already up to date.'
        : 'You are not currently signed up for this raid.');
    showSignupSuccess(message);
    return;
  }
  if (hasConfirmedSignup) {
    const confirmation = await showConfirmation({
      title: 'Confirm Raid Signup',
      message:
        'Are you sure you want to confirm this raid signup? Depending on your guild\'s settings, a discord notification may be sent to notify others of your signup.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Keep Editing'
    });
    if (confirmation !== 'primary') {
      return;
    }
  }
  signupSaving.value = true;
  signupError.value = null;
  if (signupSuccessTimeout) {
    clearTimeout(signupSuccessTimeout);
    signupSuccessTimeout = null;
  }
  try {
    const orderedEntries = targetIds.map((id) => {
      const entry = targetEntries.find((e) => e.characterId === id);
      return { characterId: id, status: entry?.status ?? 'CONFIRMED' as SignupStatus };
    });
    const updated = await api.updateRaidSignups(raid.value.id, orderedEntries);
    raid.value.signups = updated;
    applySignupDraft(targetIds);
    notAttendingDraft.value = new Set(orderedEntries.filter((e) => e.status === 'NOT_ATTENDING').map((e) => e.characterId));
    const message =
      options?.successMessage ??
      (targetEntries.length > 0
        ? 'Your signup has been updated.'
        : 'You have withdrawn from this raid.');
    showSignupSuccess(message);
  } catch (error) {
    signupError.value = extractErrorMessage(
      error,
      'Unable to update raid signups. Please try again.'
    );
  } finally {
    signupSaving.value = false;
  }
}

async function handleSignupMains() {
  if (signupsLocked.value || signupSaving.value) {
    return;
  }
  if (viewerMains.value.length === 0) {
    signupError.value = 'Set a main character in your roster to use this shortcut.';
    return;
  }
  const mainIds = viewerMains.value.slice(0, maxSignupSlots).map((character) => character.id);
  const mainEntries: SignupEntry[] = mainIds.map((id) => ({ characterId: id, status: 'CONFIRMED' as SignupStatus }));
  clearSignupFeedback();
  applySignupDraft(mainIds);
  notAttendingDraft.value = new Set();
  if (areIdListsEqual(savedSignupIds.value, mainIds) && savedNotAttendingIds.value.size === 0) {
    showSignupSuccess(
      mainIds.length === 0
        ? 'You are not currently signed up for this raid.'
        : mainIds.length === 1
          ? 'Your main character is already signed up.'
          : 'Your main characters are already signed up.'
    );
    return;
  }
  await saveSignups({
    signupEntries: mainEntries,
    successMessage:
      mainIds.length > 0
        ? mainIds.length === 1
          ? 'Signed up your main character.'
          : 'Signed up your main characters.'
        : 'You have withdrawn from this raid.'
  });
}

async function handleWithdrawAll() {
  if (signupsLocked.value || signupSaving.value) {
    return;
  }
  if (savedSignupIds.value.length === 0 && signupDraft.value.length === 0) {
    return;
  }
  clearSignupFeedback();
  applySignupDraft([]);
  notAttendingDraft.value = new Set();
  await saveSignups({
    signupEntries: [],
    successMessage: 'You have withdrawn all characters from this raid.'
  });
}

// Signup context menu handlers
function openSignupContextMenu(event: MouseEvent, signup: RaidSignup) {
  if (!canManageRaid.value || signupsLocked.value) {
    return;
  }
  event.preventDefault();
  signupContextMenu.signup = signup;
  signupContextMenu.x = event.clientX;
  signupContextMenu.y = event.clientY;
  signupContextMenu.visible = true;
}

function closeSignupContextMenu() {
  signupContextMenu.visible = false;
  signupContextMenu.signup = null;
}

async function handleSignupContextMenuAction(action: 'attending' | 'not_attending' | 'remove') {
  const signup = signupContextMenu.signup;
  if (!signup || !raid.value) {
    closeSignupContextMenu();
    return;
  }

  closeSignupContextMenu();

  try {
    let updatedSignups: RaidSignup[];
    if (action === 'remove') {
      updatedSignups = await api.removeSignup(raid.value.id, signup.id);
    } else {
      const status = action === 'attending' ? 'CONFIRMED' : 'NOT_ATTENDING';
      updatedSignups = await api.updateSignupStatus(raid.value.id, signup.id, status);
    }
    raid.value.signups = updatedSignups;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update signup.';
    window.alert(message);
  }
}

// Signup search handlers
function handleSignupSearchInput() {
  if (signupSearchTimeout) {
    clearTimeout(signupSearchTimeout);
  }

  const query = signupSearch.query.trim();
  if (query.length < 2) {
    signupSearch.results = [];
    signupSearch.showDropdown = false;
    signupSearch.error = null;
    return;
  }

  signupSearch.loading = true;
  signupSearchTimeout = setTimeout(async () => {
    await searchCharactersForSignup(query);
  }, 300);
}

async function searchCharactersForSignup(query: string) {
  if (!raid.value) {
    return;
  }

  signupSearch.loading = true;
  signupSearch.error = null;

  try {
    const results = await api.searchCharactersForSignup(raid.value.id, query);
    signupSearch.results = results;
    signupSearch.showDropdown = true;
  } catch (error) {
    signupSearch.error = error instanceof Error ? error.message : 'Search failed.';
    signupSearch.results = [];
  } finally {
    signupSearch.loading = false;
  }
}

async function handleAddSignupFromSearch(character: CharacterSearchResult) {
  if (!raid.value || character.isSignedUp) {
    return;
  }

  try {
    const updatedSignups = await api.addSignup(raid.value.id, character.id, 'CONFIRMED');
    raid.value.signups = updatedSignups;
    // Update search results to reflect the new signup
    const idx = signupSearch.results.findIndex(c => c.id === character.id);
    if (idx !== -1) {
      signupSearch.results[idx].isSignedUp = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add signup.';
    window.alert(message);
  }
}

function closeSignupSearch() {
  signupSearch.showDropdown = false;
}

function handleSignupSearchBlur() {
  // Delay to allow click on dropdown items
  setTimeout(() => {
    closeSignupSearch();
  }, 200);
}

async function loadRaid() {
  const previousGuildId = raid.value?.guild?.id ?? null;
  const data = await api.fetchRaid(raidId);
  raid.value = data;
  if (data.guild?.id !== previousGuildId) {
    npcNotesLoaded.value = false;
    npcNotes.value = [];
    npcNotesState.selectedName = '';
    npcNotesState.search = '';
    npcNotesState.canEdit = false;
    npcNotesState.canApproveDeletion = false;
    npcNotesState.viewerRole = null;
    npcNotesState.deletionStatus = '';
  }
  if (data.guild?.id) {
    loadGuildMainCharacters(data.guild.id);
  }
  setTimingInputs(data);
  setRecurrenceSettings(data);
  notesInput.value = data.notes ?? '';
  initialNotes.value = notesInput.value;
  notesError.value = null;
  notesPanelExpanded.value = false;
  targetsPanelExpanded.value = false;
  actionError.value = null;
  recurrenceError.value = null;
  await refreshLootListSummary();
  await ensureNpcNotesLoaded();
}

function triggerKillLogUpload() {
  if (uploadingKillLog.value) {
    return;
  }
  killLogInput.value?.click();
}

async function handleKillLogFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  await uploadKillLogFile(file);
  input.value = '';
}

async function uploadKillLogFile(file: File) {
  if (!raid.value) {
    window.alert('Raid data is still loading.');
    return;
  }
  const startIso = raid.value.startedAt ?? raid.value.startTime;
  if (!startIso) {
    window.alert('Raid start time is not set.');
    return;
  }
  const start = new Date(startIso);
  const end = raid.value.endedAt ? new Date(raid.value.endedAt) : null;
  uploadingKillLog.value = true;
  try {
    const content = await file.text();
    const parsed = parseNpcKills(content, start, end);
    await api.deleteRaidNpcKills(raidId);
    if (parsed.length > 0) {
      const payload = parsed.map((entry) => ({
        npcName: entry.npcName,
        occurredAt: entry.timestamp ? entry.timestamp.toISOString() : start.toISOString(),
        killerName: entry.killerName ?? null,
        rawLine: entry.rawLine
      }));
      for (let index = 0; index < payload.length; index += 100) {
        await api.recordRaidNpcKills(raidId, payload.slice(index, index + 100));
      }
      await loadRaid();
    } else {
      window.alert('No kills found within the raid window.');
    }
  } catch (error) {
    console.error('Failed to upload kill log', error);
    window.alert('Unable to upload kill log. Please try again.');
  } finally {
    uploadingKillLog.value = false;
  }
}

async function loadGuildMainCharacters(guildId: string) {
  try {
    const detail = await api.fetchGuildDetail(guildId);
    const names = new Set(
      detail.characters
        .filter((character) => character.isMain)
        .map((character) => character.name.trim().toLowerCase())
        .filter((name) => name.length > 0)
    );
    guildMainCharacterNames.value = names;
  } catch (error) {
    console.warn('Failed to load guild characters', error);
  }
}

async function loadLoot() {
  try {
    await refreshLootEvents();
  } catch (error) {
    console.warn('Failed to load loot events', error);
  }
}

async function refreshLootListSummary() {
  if (!raid.value || !canManageLootLists.value) {
    lootListSummary.value = null;
    return;
  }

  try {
    lootListSummary.value = await api.fetchGuildLootListSummary(raid.value.guild.id);
  } catch (error) {
    console.warn('Failed to load loot list summary', error);
  }
}

function openLootContextMenu(event: MouseEvent, entry: GroupedLootEntry) {
  if (!canManageLootLists.value) {
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
  const menuHeight = 160;
  const x = Math.min(event.clientX, window.innerWidth - menuWidth);
  const y = Math.min(event.clientY, window.innerHeight - menuHeight);
  Object.assign(lootContextMenu, {
    visible: true,
    x,
    y,
    itemName: entry.itemName,
    itemId: entry.itemId ?? whitelistEntry?.itemId ?? blacklistEntry?.itemId ?? null,
    normalizedName,
    whitelistEntry,
    blacklistEntry,
    entry
  });
}

function closeLootContextMenu() {
  lootContextMenu.visible = false;
  lootContextMenu.entry = null;
  lootContextMenu.whitelistEntry = null;
  lootContextMenu.blacklistEntry = null;
  lootContextMenu.itemId = null;
}

function handleEditLootClick() {
  if (!lootContextMenu.entry) {
    return;
  }
  openEditLootModal(lootContextMenu.entry);
  closeLootContextMenu();
}

function handleGlobalPointerDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (lootContextMenu.visible) {
    if (target && target.closest('.loot-context-menu')) {
      return;
    }
    if (event.type === 'contextmenu' && target && target.closest('.raid-loot-card')) {
      return;
    }
    closeLootContextMenu();
  }
  if (killContextMenu.visible) {
    if (target && target.closest('.kill-context-menu')) {
      return;
    }
    if (event.type === 'contextmenu' && target && target.closest('.raid-kills-grid__item')) {
      return;
    }
    closeKillContextMenu();
  }
  if (npcNotesState.associationMenu.visible) {
    if (target && target.closest('.association-context-menu')) {
      return;
    }
    if (event.type === 'contextmenu' && target && target.closest('.npc-notes-chip-wrapper')) {
      return;
    }
    closeAssociationContext();
  }
  if (signupContextMenu.visible) {
    if (target && target.closest('.signup-context-menu')) {
      return;
    }
    if (event.type === 'contextmenu' && target && target.closest('.raid-signups__role-item')) {
      return;
    }
    closeSignupContextMenu();
  }
}

function handleLootContextMenuKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (lootContextMenu.visible) {
      closeLootContextMenu();
    }
    if (killContextMenu.visible) {
      closeKillContextMenu();
    }
    if (npcNotesState.associationMenu.visible) {
      closeAssociationContext();
    }
    if (signupContextMenu.visible) {
      closeSignupContextMenu();
    }
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

async function addItemToLootList(type: 'WHITELIST' | 'BLACKLIST') {
  if (!raid.value || !canManageLootLists.value) {
    closeLootContextMenu();
    return;
  }

  try {
    await api.createGuildLootListEntry(raid.value.guild.id, {
      type,
      itemName: lootContextMenu.itemName,
      itemId: lootContextMenu.itemId
    });
    if (type === 'BLACKLIST' && lootContextMenu.entry) {
      await removeLootGroupEvents(lootContextMenu.entry);
    }
    await refreshLootListSummary();
  } catch (error) {
    window.alert('Unable to update loot list.');
    console.error(error);
  } finally {
    closeLootContextMenu();
  }
}

async function removeLootGroupEvents(entry: GroupedLootEntry) {
  if (!raid.value) {
    return;
  }

  try {
    await Promise.all(
      entry.eventIds.map((lootId) =>
        api.deleteRaidLoot(raidId, lootId).catch((error) => {
          console.warn('Failed to delete loot entry', lootId, error);
        })
      )
    );
  } finally {
    const eventIdSet = new Set(entry.eventIds);
    lootEvents.value = lootEvents.value.filter((event) => !eventIdSet.has(event.id));
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
    await refreshLootListSummary();
  } catch (error) {
    window.alert('Unable to update loot list.');
    console.error(error);
  } finally {
    closeLootContextMenu();
  }
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
  const emoji = entry.emoji ?? '💎';
  const currentItemId = entry.itemId ?? null;
  const itemIdChanged = currentItemId !== (normalizedItemId ?? null);
  const desiredItemId = itemIdChanged ? normalizedItemId ?? null : currentItemId;

  editLootModal.saving = true;
  try {
    if (normalizedLooter !== entry.looterName || itemIdChanged) {
      await Promise.all(
        entry.eventIds.map((lootId) =>
          api
            .updateRaidLoot(raidId, lootId, {
              ...(normalizedLooter !== entry.looterName
                ? {
                    looterName: normalizedLooter,
                    looterClass: isBankLooter || isMasterLooter ? null : entry.looterClass ?? null
                  }
                : {}),
              ...(itemIdChanged ? { itemId: normalizedItemId ?? null } : {})
            })
            .catch((error) => {
            console.warn('Failed to update loot assignment', lootId, error);
            throw error;
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
      await Promise.all(
        removeIds.map((lootId) =>
          api.deleteRaidLoot(raidId, lootId).catch((error) => {
            console.warn('Failed to delete loot entry', lootId, error);
            throw error;
          })
        )
      );
    }

    await refreshLootEvents();
    await refreshLootListSummary();
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
    console.error('Failed to edit loot entry', error);
    window.alert('Unable to update loot entry. Please try again.');
  } finally {
    editLootModal.saving = false;
  }
}

async function refreshRaidSignups() {
  try {
    const latestRaid = await api.fetchRaid(raidId);
    if (raid.value) {
      raid.value.signups = latestRaid.signups;
    } else {
      raid.value = latestRaid;
    }
  } catch (error) {
    console.warn('Failed to refresh raid signups', error);
  }
}

async function loadAttendance(options?: { syncSignups?: boolean }) {
  attendanceLoading.value = true;
  try {
    attendanceEvents.value = await api.fetchAttendance(raidId);
  } finally {
    attendanceLoading.value = false;
  }
  maybeOpenAttendanceFromQuery();
  if (options?.syncSignups) {
    await refreshRaidSignups();
  }
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    rosterEditingEventId.value = null;
    return;
  }

  const file = target.files[0];
  try {
    const response = await api.uploadRoster(raidId, file);
    rosterPreview.value = response.data.preview as AttendanceRecordInput[];
    rosterMeta.value = response.data.meta ?? null;
    showRosterModal.value = true;
  } finally {
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function discardPreview(removePending = true) {
  rosterPreview.value = null;
  rosterMeta.value = null;
  showRosterModal.value = false;
  if (removePending && !rosterEditingEventId.value && pendingEventTypes.value.length > 0) {
    pendingEventTypes.value.pop();
  }
  rosterEditingEventId.value = null;
}

async function saveAttendance(entries?: AttendanceRecordInput[]) {
  if (entries) {
    rosterPreview.value = entries;
  }

  if (!rosterPreview.value) {
    return;
  }

  const normalizedRecords = prepareAttendanceRecords(rosterPreview.value);
  if (normalizedRecords.length === 0) {
    actionError.value = 'No valid attendance records to save.';
    return;
  }

  submittingAttendance.value = true;
  try {
    if (rosterEditingEventId.value) {
      await api.updateAttendanceEvent(rosterEditingEventId.value, {
        note: `Updated from ${rosterMeta.value?.filename ?? 'roster file'}`,
        snapshot: {
          filename: rosterMeta.value?.filename,
          uploadedAt: rosterMeta.value?.uploadedAt
        },
        records: normalizedRecords
      });
    } else {
      const eventType = pendingEventTypes.value.shift();
      await api.createAttendanceEvent(raidId, {
        note: `Imported from ${rosterMeta.value?.filename ?? 'roster file'}`,
        snapshot: {
          filename: rosterMeta.value?.filename,
          uploadedAt: rosterMeta.value?.uploadedAt
        },
        records: normalizedRecords,
        ...(eventType ? { eventType } : {})
      });
    }
    discardPreview(false);
    showRosterModal.value = false;
    await loadAttendance({ syncSignups: true });
  } finally {
    submittingAttendance.value = false;
  }
}

function prepareAttendanceRecords(records: AttendanceRecordInput[]): AttendanceRecordInput[] {
  return records
    .map((record) => {
      const characterName = (record.characterName ?? '').trim();
      return {
        characterId: record.characterId ?? undefined,
        characterName,
        level: normalizeOptionalLevel(record.level),
        class: normalizeRecordClass(record.class),
        groupNumber: normalizeGroupNumber(record.groupNumber),
        status: normalizeRecordStatus(record.status),
        flags: normalizeRecordFlags(record.flags)
      };
    })
    .filter((record) => record.characterName.length >= 2);
}

function normalizeOptionalLevel(value?: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 1 || normalized > 125) {
    return null;
  }
  return normalized;
}

function normalizeGroupNumber(value?: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 1 || normalized > 12) {
    return null;
  }
  return normalized;
}

function normalizeRecordClass(value?: CharacterClass | null): CharacterClass | null {
  if (!value) {
    return null;
  }
  return validCharacterClasses.has(value) ? value : null;
}

function normalizeRecordStatus(value?: AttendanceStatus | null): AttendanceStatus {
  if (value && attendanceStatusOptions.includes(value)) {
    return value;
  }
  return 'PRESENT';
}

function normalizeRecordFlags(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function toInputValue(isoString: string | null | undefined) {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);

  return local.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return date.toISOString();
}

function composeInputFromDefault(baseIso: string | null | undefined, defaultTime?: string | null) {
  if (!defaultTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(defaultTime)) {
    return '';
  }
  const base = baseIso ? new Date(baseIso) : new Date();
  const [hours, minutes] = defaultTime.split(':').map(Number);
  base.setHours(hours, minutes, 0, 0);
  const offset = base.getTimezoneOffset();
  const local = new Date(base.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return 'unknown date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown date';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(parsed);
}

function toDateInputOnly(value?: string | null) {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function describeRecurrence(settings: {
  frequency: RecurrenceFrequency;
  interval: number;
  endDate?: string | null;
  isActive?: boolean;
}) {
  const interval = Math.max(1, settings.interval || 1);
  const unit =
    settings.frequency === 'DAILY'
      ? 'day'
      : settings.frequency === 'MONTHLY'
        ? 'month'
        : 'week';
  const everyLabel = interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;
  let summary = `Repeats ${everyLabel}`;
  if (settings.endDate) {
    summary += ` until ${formatDateOnly(settings.endDate)}`;
  }
  if (settings.isActive === false) {
    summary += ' (paused)';
  }
  return summary;
}

function describeRaidRecurrence(detail: RaidDetail | null | undefined) {
  if (!detail || !detail.isRecurring || !detail.recurrence) {
    return 'Not set to repeat';
  }
  return describeRecurrence(detail.recurrence);
}

function setTimingInputs(current: RaidDetail) {
  let startValue = toInputValue(current.startedAt);
  if (!startValue && current.guild?.defaultRaidStartTime) {
    startValue = composeInputFromDefault(current.startTime, current.guild.defaultRaidStartTime);
  }
  let endValue = toInputValue(current.endedAt);
  if (!endValue && current.guild?.defaultRaidEndTime) {
    endValue = composeInputFromDefault(current.startTime, current.guild.defaultRaidEndTime);
  }
  startedAtInput.value = startValue;
  endedAtInput.value = endValue;
  initialStartedAt.value = startValue;
  initialEndedAt.value = endValue;
}

function setRecurrenceSettings(current: RaidDetail) {
  const recurrence = current.recurrence ?? null;
  const enabled = Boolean(recurrence && recurrence.isActive !== false);
  recurrenceForm.enabled = enabled;
  recurrenceForm.frequency = recurrence?.frequency ?? 'WEEKLY';
  recurrenceForm.interval = recurrence?.interval ?? 1;
  recurrenceForm.endDate = recurrence?.endDate ? toDateInputOnly(recurrence.endDate) : '';
  Object.assign(initialRecurrence, {
    enabled: recurrenceForm.enabled,
    frequency: recurrenceForm.frequency,
    interval: recurrenceForm.interval,
    endDate: recurrenceForm.endDate
  });
}

function resetRecurrence() {
  recurrenceForm.enabled = initialRecurrence.enabled;
  recurrenceForm.frequency = initialRecurrence.frequency;
  recurrenceForm.interval = initialRecurrence.interval;
  recurrenceForm.endDate = initialRecurrence.endDate;
  recurrenceError.value = null;
}

async function saveRecurrence() {
  if (!recurrenceDirty.value || savingRecurrence.value) {
    return;
  }

  savingRecurrence.value = true;
  recurrenceError.value = null;
  try {
    const payload = recurrenceForm.enabled
      ? {
          frequency: recurrenceForm.frequency,
          interval: Math.max(1, recurrenceForm.interval),
          endDate: recurrenceForm.endDate
            ? new Date(`${recurrenceForm.endDate}T00:00:00`).toISOString()
            : null,
          isActive: true
        }
      : null;

    await api.updateRaid(raidId, {
      recurrence: payload
    });
    await loadRaid();
  } catch (error) {
    recurrenceError.value = extractErrorMessage(error, 'Unable to update recurrence settings.');
  } finally {
    savingRecurrence.value = false;
  }
}

async function persistRecurrenceDisabled() {
  if (!canManageRaid.value || savingRecurrence.value) {
    return;
  }

  savingRecurrence.value = true;
  recurrenceError.value = null;
  try {
    await api.updateRaid(raidId, { recurrence: null });
    await loadRaid();
  } catch (error) {
    recurrenceError.value = extractErrorMessage(error, 'Unable to disable recurrence. Please try again.');
    recurrenceForm.enabled = true;
  } finally {
    savingRecurrence.value = false;
  }
}

function resetNotes() {
  notesInput.value = initialNotes.value;
  notesError.value = null;
}

async function saveNotes() {
  if (!canManageRaid.value || savingNotes.value || !notesDirty.value) {
    return;
  }

  savingNotes.value = true;
  notesError.value = null;
  try {
    const payload = notesInput.value;
    const updated = await api.updateRaid(raidId, {
      notes: payload
    });
    const normalized = updated.notes ?? '';
    notesInput.value = normalized;
    initialNotes.value = normalized;
    if (raid.value) {
      raid.value = {
        ...raid.value,
        notes: updated.notes ?? null
      };
    }
  } catch (error) {
    notesError.value = extractErrorMessage(error, 'Unable to update notes. Please try again.');
  } finally {
    savingNotes.value = false;
  }
}

function commitTargetInput(type: TargetField) {
  const pending =
    type === 'zones' ? targetsModal.zoneInput.trim() : targetsModal.bossInput.trim();
  if (!pending) {
    return;
  }

  const list = type === 'zones' ? targetsModal.zones : targetsModal.bosses;
  const normalized = pending.toLowerCase();
  if (list.some((entry) => entry.value.trim().toLowerCase() === normalized)) {
    if (type === 'zones') {
      targetsModal.zoneInput = '';
    } else {
      targetsModal.bossInput = '';
    }
    return;
  }

  const nextEntry = createTargetEntry(pending);
  if (type === 'zones') {
    targetsModal.zones = [...list, nextEntry];
    targetsModal.zoneInput = '';
  } else {
    targetsModal.bosses = [...list, nextEntry];
    targetsModal.bossInput = '';
  }
}

function removeTargetEntry(type: TargetField, entryId: string) {
  if (type === 'zones') {
    targetsModal.zones = targetsModal.zones.filter((entry) => entry.id !== entryId);
  } else {
    targetsModal.bosses = targetsModal.bosses.filter((entry) => entry.id !== entryId);
  }
}

function commitPendingTargetEntries() {
  if (targetsModal.zoneInput.trim().length > 0) {
    commitTargetInput('zones');
  }
  if (targetsModal.bossInput.trim().length > 0) {
    commitTargetInput('bosses');
  }
}

function createTargetEntry(value: string): TargetEntry {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    value
  };
}

function mapTargetsToEntries(entries: Iterable<string> | null | undefined): TargetEntry[] {
  return sanitizeTargets(entries).map((value) => createTargetEntry(value));
}

function extractTargetValues(entries: TargetEntry[]): string[] {
  return entries.map((entry) => entry.value);
}

function sanitizeTargets(entries: Iterable<string> | null | undefined): string[] {
  const sanitized: string[] = [];
  if (!entries) {
    return sanitized;
  }
  for (const entry of entries) {
    const trimmed = (entry ?? '').toString().trim();
    if (!trimmed) {
      continue;
    }
    sanitized.push(trimmed);
  }
  return sanitized;
}

function areTargetListsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

async function loadCopyableRaidOptions() {
  if (targetsCopyState.loading) {
    return;
  }

  const guildId = raid.value?.guild?.id;
  if (!guildId) {
    return;
  }

  targetsCopyState.loading = true;
  targetsCopyState.loadError = '';
  try {
    const response = await api.fetchRaidsForGuild(guildId);
    targetsCopyState.raids = Array.isArray(response.raids) ? response.raids : [];
  } catch (error) {
    targetsCopyState.loadError = extractErrorMessage(
      error,
      'Unable to load other raid events. Please try again.'
    );
  } finally {
    targetsCopyState.loading = false;
  }
}

function copyGoalsFromSelectedRaid() {
  if (!targetsCopyState.selectedRaidId) {
    return;
  }

  const source = selectedCopyRaid.value;
  if (!source) {
    return;
  }

  targetsModal.zones = mapTargetsToEntries(source.targetZones ?? []);
  targetsModal.bosses = mapTargetsToEntries(source.targetBosses ?? []);
  targetsModal.zoneInput = '';
  targetsModal.bossInput = '';
  targetsCopyState.lastCopiedRaidName = source.name;
}

function openTargetsModal() {
  targetsModal.visible = true;
  targetsModal.zones = mapTargetsToEntries(displayTargetZones.value);
  targetsModal.bosses = mapTargetsToEntries(displayTargetBosses.value);
  targetsModal.initialZones = extractTargetValues(targetsModal.zones);
  targetsModal.initialBosses = extractTargetValues(targetsModal.bosses);
  targetsModal.zoneInput = '';
  targetsModal.bossInput = '';
  targetsModal.error = '';
  targetsCopyState.search = '';
  targetsCopyState.lastCopiedRaidName = '';
  targetsCopyState.loadError = '';
  void loadCopyableRaidOptions();
}

function closeTargetsModal() {
  targetsModal.visible = false;
  targetsModal.error = '';
  targetsModal.zoneInput = '';
  targetsModal.bossInput = '';
}

function resetTargetsModal() {
  targetsModal.zones = mapTargetsToEntries(targetsModal.initialZones);
  targetsModal.bosses = mapTargetsToEntries(targetsModal.initialBosses);
  targetsModal.zoneInput = '';
  targetsModal.bossInput = '';
  targetsModal.error = '';
}

async function saveTargetsFromModal() {
  if (!canManageRaid.value || targetsModal.saving) {
    return;
  }

  commitPendingTargetEntries();

  if (!targetsModalDirty.value) {
    return;
  }

  targetsModal.saving = true;
  targetsModal.error = '';
  try {
    const zones = sanitizeTargets(extractTargetValues(targetsModal.zones));
    const bosses = sanitizeTargets(extractTargetValues(targetsModal.bosses));

    const updated = await api.updateRaid(raidId, {
      targetZones: zones,
      targetBosses: bosses
    });

    targetsModal.initialZones = [...zones];
    targetsModal.initialBosses = [...bosses];
    targetsModal.zones = mapTargetsToEntries(zones);
    targetsModal.bosses = mapTargetsToEntries(bosses);
    targetsModal.zoneInput = '';
    targetsModal.bossInput = '';

    if (raid.value) {
      raid.value = {
        ...raid.value,
        targetZones: updated.targetZones ?? [],
        targetBosses: updated.targetBosses ?? []
      };
    }

    closeTargetsModal();
  } catch (error) {
    targetsModal.error = extractErrorMessage(error, 'Unable to update raid goals. Please try again.');
  } finally {
    targetsModal.saving = false;
  }
}

function toggleNotesPanel() {
  notesPanelExpanded.value = !notesPanelExpanded.value;
}

function toggleTargetsPanel() {
  targetsPanelExpanded.value = !targetsPanelExpanded.value;
}

const timesDirty = computed(
  () =>
    startedAtInput.value !== initialStartedAt.value || endedAtInput.value !== initialEndedAt.value
);

function resetTiming() {
  startedAtInput.value = initialStartedAt.value;
  endedAtInput.value = initialEndedAt.value;
}

async function saveTiming() {
  if (!timesDirty.value) {
    return;
  }

  savingTimes.value = true;
  try {
    const startedAtValue = startedAtInput.value ? fromInputValue(startedAtInput.value) : null;
    const endedAtValue = endedAtInput.value ? fromInputValue(endedAtInput.value) : null;

    await api.updateRaid(raidId, {
      startedAt: startedAtValue,
      endedAt: endedAtValue,
      startTime: startedAtValue ?? undefined
    });
    await loadRaid();
  } finally {
    savingTimes.value = false;
  }
}

function showConfirmation(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  secondaryConfirmLabel?: string;
  cancelLabel?: string;
}) {
  return new Promise<'primary' | 'secondary' | 'cancel'>((resolve) => {
    confirmModal.visible = true;
    confirmModal.title = options.title;
    confirmModal.message = options.message;
    confirmModal.confirmLabel = options.confirmLabel ?? 'Confirm';
    confirmModal.secondaryConfirmLabel = options.secondaryConfirmLabel;
    confirmModal.cancelLabel = options.cancelLabel ?? 'Cancel';
    confirmResolver = resolve;
  });
}

function resolveConfirmation(result: 'primary' | 'secondary' | 'cancel') {
  confirmModal.visible = false;
  confirmModal.title = '';
  confirmModal.message = undefined;
  confirmModal.confirmLabel = 'Confirm';
  confirmModal.secondaryConfirmLabel = undefined;
  confirmModal.cancelLabel = 'Cancel';
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(result);
}


function confirmDeleteAttendance(event: any) {
  if (!canManageRaid.value) {
    return;
  }

  showConfirmation({
    title: 'Delete Attendance Event',
    message: 'This will remove the attendance snapshot and all associated records.',
    confirmLabel: 'Delete Event',
    cancelLabel: 'Cancel'
  }).then(async (action) => {
    if (action !== 'primary') {
      return;
    }

    deletingAttendanceId.value = event.id;
    actionError.value = null;

    try {
      await api.deleteAttendanceEvent(event.id);
      attendanceEvents.value = attendanceEvents.value.filter((item) => item.id !== event.id);
      if (selectedAttendanceEvent.value?.id === event.id) {
        selectedAttendanceEvent.value = null;
      }
      await refreshRaidSignups();
    } catch (error) {
      actionError.value = extractErrorMessage(error, 'Unable to delete attendance event. Please try again.');
    } finally {
      deletingAttendanceId.value = null;
    }
  });
}


function handleRosterModalClose() {
  discardPreview(!rosterEditingEventId.value);
}

function handleRosterModalDiscard() {
  discardPreview(!rosterEditingEventId.value);
}

async function handleRosterModalSave(entries: AttendanceRecordInput[]) {
  await saveAttendance(entries);
}

function triggerAttendanceUpload(options?: { attendanceEventId?: string }) {
  rosterEditingEventId.value = options?.attendanceEventId ?? null;
  requestAnimationFrame(() => {
    fileInput.value?.click();
  });
}

async function confirmDeleteRaid() {
  if (!canManageRaid.value) {
    return;
  }

  const isRecurring = Boolean(raid.value?.isRecurring);
  const action = await showConfirmation({
    title: isRecurring ? 'Delete Recurring Raid' : 'Delete Raid',
    message: isRecurring
      ? 'Choose whether to delete only this raid event or the entire recurring series. Deleting the event will schedule the next occurrence automatically.'
      : 'This will remove the raid and all associated attendance events. This action cannot be undone.',
    confirmLabel: isRecurring ? 'Delete Event' : 'Delete Raid',
    secondaryConfirmLabel: isRecurring ? 'Delete Series' : undefined,
    cancelLabel: 'Cancel'
  });

  if (action === 'cancel') {
    return;
  }

  const scope = isRecurring && action === 'secondary' ? 'SERIES' : 'EVENT';

  actionError.value = null;
  try {
    await api.deleteRaid(raidId, scope === 'EVENT' ? undefined : { scope });
    router.push({ name: 'Raids' });
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to delete raid. Please try again.');
  }
}

async function handleStartRaid() {
  if (startingRaid.value || hasEffectiveStarted.value) {
    return;
  }

  startingRaid.value = true;
  actionError.value = null;
  try {
    await api.startRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Started',
      message: 'Raid start time recorded. Upload an attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload === 'primary') {
      pendingEventTypes.value.push('START');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('START');
    }
    await loadRaid();
    await loadAttendance({ syncSignups: true });
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to start raid. Please try again.');
  } finally {
    startingRaid.value = false;
  }
}

async function handleAnnounceRaid() {
  if (announcingRaid.value || !canManageRaid.value) {
    return;
  }

  const action = await showConfirmation({
    title: 'Send Raid Announcement',
    message: 'Re-send the raid creation webhook announcement?',
    confirmLabel: 'Send Announcement',
    cancelLabel: 'Cancel'
  });

  if (action !== 'primary') {
    return;
  }

  if (raid.value?.raidCreatedNotificationsEnabled === false) {
    const actionDisabled = await showConfirmation({
      title: 'Announcement Disabled',
      message:
        'Raid announcements are disabled in Discord Webhooks settings. Send anyway or dismiss this prompt.',
      confirmLabel: 'Send Anyway',
      cancelLabel: 'Dismiss'
    });
    if (actionDisabled !== 'primary') {
      return;
    }
  }

  announcingRaid.value = true;
  actionError.value = null;
  try {
    await api.announceRaid(raidId);
  } catch (error) {
    const message = extractErrorMessage(error, 'Unable to send raid announcement.');
    if (message.toLowerCase().includes('webhook is disabled')) {
      const actionDisabled = await showConfirmation({
        title: 'Announcement Disabled',
        message:
          'Raid announcements are disabled in Discord Webhooks settings. Send anyway or dismiss this prompt.',
        confirmLabel: 'Send Anyway',
        cancelLabel: 'Dismiss'
      });
      if (actionDisabled === 'primary') {
        try {
          await api.announceRaid(raidId);
        } catch (secondError) {
          actionError.value = extractErrorMessage(
            secondError,
            'Unable to send raid announcement.'
          );
        }
      }
      return;
    }
    actionError.value = message;
  } finally {
    announcingRaid.value = false;
  }
}

async function handleEndRaid() {
  if (endingRaid.value || !hasEffectiveStarted.value || hasEffectiveEnded.value) {
    return;
  }

  endingRaid.value = true;
  actionError.value = null;
  try {
    await api.endRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Ended',
      message: 'Raid end time recorded. Upload the final attendance log?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload === 'primary') {
      pendingEventTypes.value.push('END');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('END');
    }
    await loadRaid();
    await loadAttendance({ syncSignups: true });
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to end raid. Please try again.');
  } finally {
    endingRaid.value = false;
  }
}

async function handleRestartRaid() {
  if (restartingRaid.value || !canRestartRaid.value) {
    return;
  }

  restartingRaid.value = true;
  actionError.value = null;
  try {
    await api.restartRaid(raidId);
    const shouldUpload = await showConfirmation({
      title: 'Raid Restarted',
      message: 'Raid restart recorded. Upload a fresh attendance log now?',
      confirmLabel: 'Upload Log',
      cancelLabel: 'Later'
    });
    if (shouldUpload === 'primary') {
      pendingEventTypes.value.push('RESTART');
      triggerAttendanceUpload();
    } else {
      await createPlaceholderAttendanceEvent('RESTART');
    }
    await loadRaid();
    await loadAttendance({ syncSignups: true });
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to restart raid. Please try again.');
  } finally {
    restartingRaid.value = false;
  }
}

async function handleCancelRaid() {
  if (cancelingRaid.value || !canCancelRaid.value) {
    return;
  }

  cancelingRaid.value = true;
  actionError.value = null;
  try {
    await api.cancelRaid(raidId);
    await loadRaid();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to cancel raid. Please try again.');
  } finally {
    cancelingRaid.value = false;
  }
}

async function handleUncancelRaid() {
  if (uncancelingRaid.value || !canUncancelRaid.value) {
    return;
  }

  uncancelingRaid.value = true;
  actionError.value = null;
  try {
    await api.uncancelRaid(raidId);
    await loadRaid();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to restore raid. Please try again.');
  } finally {
    uncancelingRaid.value = false;
  }
}

async function promptRenameRaid() {
  if (!canManageRaid.value || !raid.value || renamingRaid.value) {
    return;
  }

  const currentName = raid.value.name ?? '';
  const nextName = window.prompt('Rename raid', currentName);
  if (nextName === null) {
    return;
  }
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === currentName) {
    return;
  }

  renamingRaid.value = true;
  actionError.value = null;
  try {
    await api.updateRaid(raidId, { name: trimmed });
    await loadRaid();
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to rename raid. Please try again.');
  } finally {
    renamingRaid.value = false;
  }
}

function orderCharacterIds(ids: string[]) {
  const order = new Map(sortedCharacters.value.map((character, index) => [character.id, index]));
  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function applySignupDraft(ids: string[]) {
  const ordered = orderCharacterIds(ids);
  if (!areIdListsEqual(signupDraft.value, ordered)) {
    signupDraft.value = ordered;
  }
}

function areIdListsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let index = 0; index < sortedA.length; index += 1) {
    if (sortedA[index] !== sortedB[index]) {
      return false;
    }
  }
  return true;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (data && typeof data === 'object') {
      const message =
        'message' in data && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'error' in data && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : null;
      if (message) {
        return message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function resolveEventTypeBadge(eventType?: string | null) {
  switch (eventType) {
    case 'START':
      return { label: 'Raid Started', variant: 'badge--positive' };
    case 'END':
      return { label: 'Raid Ended', variant: 'badge--negative' };
    case 'RESTART':
      return { label: 'Raid Restarted', variant: 'badge--positive' };
    default:
      return null;
  }
}

function resolveEventSubtitle(event: any) {
  switch (event.eventType) {
    case 'START':
      return 'Raid start recorded';
    case 'END':
      return 'Raid end recorded';
    case 'RESTART':
      return 'Raid restart recorded';
    default:
      return `${Array.isArray(event.records) ? event.records.length : 0} attendees logged`;
  }
}

function openAttendanceEvent(event: any) {
  selectedAttendanceEvent.value = event;
}

function closeAttendanceEvent() {
  selectedAttendanceEvent.value = null;
}

function maybeOpenAttendanceFromQuery() {
  const targetId = pendingAttendanceEventId.value;
  if (!targetId || lastAutoOpenedAttendanceId.value === targetId) {
    return;
  }

  const targetEvent = attendanceEvents.value.find((event) => event.id === targetId);
  if (!targetEvent) {
    return;
  }

  openAttendanceEvent(targetEvent);
  lastAutoOpenedAttendanceId.value = targetId;
  pendingAttendanceEventId.value = null;
}

watch(
  () => route.query.attendanceEventId,
  (value) => {
    pendingAttendanceEventId.value = typeof value === 'string' ? (value as string) : null;
    maybeOpenAttendanceFromQuery();
  }
);

watch(
  () => attendanceEvents.value,
  () => {
    maybeOpenAttendanceFromQuery();
  }
);

function handleAttendanceUploadFromModal(attendanceEventId: string) {
  selectedAttendanceEvent.value = null;
  triggerAttendanceUpload({ attendanceEventId });
}

async function handleAttendanceModalSave(payload: {
  eventId: string;
  records: AttendanceModalRecordInput[];
}) {
  if (attendanceModalSaving.value) {
    return;
  }
  attendanceModalSaving.value = true;
  try {
    const normalizedRecords: AttendanceRecordInput[] = payload.records.map((record) => ({
      characterId: record.characterId ?? undefined,
      characterName: record.characterName,
      level: record.level ?? null,
      class: record.class ?? null,
      groupNumber: record.groupNumber ?? null,
      status: record.status ?? undefined,
      flags: record.flags ?? null
    }));
    await api.updateAttendanceEvent(payload.eventId, {
      records: normalizedRecords
    });
    await loadAttendance({ syncSignups: true });
    const updatedEvent = attendanceEvents.value.find((event) => event.id === payload.eventId) ?? null;
    selectedAttendanceEvent.value = updatedEvent;
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Unable to save attendance snapshot.');
  } finally {
    attendanceModalSaving.value = false;
  }
}

async function createPlaceholderAttendanceEvent(eventType: 'START' | 'END' | 'RESTART') {
  try {
    await api.createAttendanceEvent(raidId, {
      note:
        eventType === 'START'
          ? 'Raid started – attendance log pending upload.'
          : eventType === 'END'
            ? 'Raid ended – attendance log pending upload.'
            : 'Raid restarted – attendance log pending upload.',
      records: [],
      eventType
    });
  } catch (error) {
    actionError.value = extractErrorMessage(
      error,
      'Unable to create placeholder attendance event.'
    );
  }
}

onMounted(() => {
  loadRaid();
  loadAttendance();
  loadLoot();
  loadUserCharacters();
  window.addEventListener('click', handleGlobalPointerDown);
  window.addEventListener('contextmenu', handleGlobalPointerDown);
  window.addEventListener('keydown', handleLootContextMenuKey);
});

onUnmounted(() => {
  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
    shareStatusTimeout = null;
  }
  if (signupSuccessTimeout) {
    clearTimeout(signupSuccessTimeout);
    signupSuccessTimeout = null;
  }
  window.removeEventListener('click', handleGlobalPointerDown);
  window.removeEventListener('contextmenu', handleGlobalPointerDown);
  window.removeEventListener('keydown', handleLootContextMenuKey);
  if (typeof document !== 'undefined') {
    document.body.classList.remove('modal-open');
  }
  detachNpcKillWheel?.();
  detachNpcKillWheel = null;
});

async function promptDiscordVoiceLink() {
  if (!raid.value || !canManageRaidDiscordLink.value || updatingDiscordVoice.value) {
    return;
  }

  const current = raid.value.discordVoiceUrl ?? '';
  const result = window.prompt(
    'Set the Discord voice channel URL for this raid. Leave blank to remove the link.',
    current
  );

  if (result === null) {
    return;
  }

  const trimmed = result.trim();
  const { normalized, valid } = normalizeOptionalUrl(trimmed);
  if (!valid) {
    window.alert('Enter a valid Discord URL.');
    return;
  }
  updatingDiscordVoice.value = true;
  try {
    await api.updateRaid(raid.value.id, {
      discordVoiceUrl: normalized ?? null
    });
    await loadRaid();
  } catch (error) {
    window.alert('Unable to update the Discord voice link.');
    console.error(error);
  } finally {
    updatingDiscordVoice.value = false;
  }
}

async function copyRaidLink() {
  const resolved = router.resolve({ name: 'RaidDetail', params: { raidId } }).href;
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
    shareStatus.value = 'Raid link copied to clipboard';
  } catch (error) {
    console.warn('Failed to copy raid link', error);
    shareStatus.value = 'Unable to copy link';
  }

  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
  }
  shareStatusTimeout = setTimeout(() => {
    shareStatus.value = null;
    shareStatusTimeout = null;
  }, 3000);
}
</script>

<style scoped>
.raid-detail {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.raid-detail__title-block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
}

.raid-detail__title-top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.raid-detail__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
}

.raid-title-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.raid-title-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.raid-title-main h1 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-recurring-icon {
  font-size: 1.3rem;
}

.raid-status-badge {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.raid-status-badge--active {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.raid-status-badge--ended {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
}

.raid-status-badge--canceled {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
}

.raid-status-badge--planned {
  border-color: rgba(148, 163, 184, 0.5);
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5f5;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.raid-voice-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-right: 0.5rem;
}

.btn--discord-voice {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  background: linear-gradient(120deg, #5865f2, #4752c4);
  border: 1px solid rgba(71, 82, 196, 0.7);
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.82rem;
  text-decoration: none;
  box-shadow: 0 12px 26px rgba(88, 101, 242, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn--discord-voice:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 32px rgba(88, 101, 242, 0.45);
}

.btn--discord-voice:focus-visible {
  outline: 2px solid rgba(148, 163, 184, 0.7);
  outline-offset: 3px;
}

.raid-voice-actions__icon {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentColor;
}

.raid-voice-actions__manage {
  min-width: 150px;
}

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 120px;
}

.raid-recurrence-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.raid-recurrence-card--collapsed {
  padding-top: 0.9rem;
  padding-bottom: 0.75rem;
}

.raid-recurrence-card--collapsed .raid-recurrence-card__header {
  margin-bottom: 0.25rem;
}

.raid-recurrence-card--collapsed .recurrence-form {
  margin-top: 0.4rem;
}

.raid-recurrence-card__title {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.raid-recurrence-card__icon {
  font-size: 1.6rem;
}

.raid-recurrence-card__actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-left: auto;
}

.raid-recurrence-card--collapsed .raid-recurrence-card__actions {
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .raid-recurrence-card__actions {
    flex-wrap: wrap;
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
    gap: 0.5rem;
  }

  .raid-recurrence-card__actions .recurrence-toggle {
    width: 100%;
    align-items: flex-start;
  }

  .raid-recurrence-card__actions .btn {
    flex: 1 1 48%;
    max-width: 48%;
    min-width: 110px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    text-align: center;
  }
}

.raid-recurrence-card__summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.recurrence-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.recurrence-chip--active {
  background: rgba(16, 185, 129, 0.22);
  color: #bbf7d0;
  border: 1px solid rgba(16, 185, 129, 0.5);
}

.recurrence-chip--inactive {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5f5;
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.recurrence-form {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  margin-top: 1.25rem;
}

.recurrence-form--collapsed {
  gap: 0;
  margin-top: 0;
}

.recurrence-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-weight: 600;
  color: #e2e8f0;
  transition: color 0.2s ease;
}

.recurrence-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.recurrence-toggle__track {
  position: relative;
  width: 3.25rem;
  height: 1.6rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  border: 1px solid rgba(148, 163, 184, 0.35);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.recurrence-toggle__thumb {
  position: absolute;
  top: 50%;
  left: 0.25rem;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 6px 18px rgba(148, 163, 184, 0.35);
  transform: translate(0, -50%);
  transition: transform 0.25s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.recurrence-toggle--active .recurrence-toggle__track {
  background: rgba(34, 197, 94, 0.25);
  border-color: rgba(34, 197, 94, 0.6);
}

.recurrence-toggle--active .recurrence-toggle__thumb {
  transform: translate(1.5rem, -50%);
  background: #dcfce7;
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.35);
}

.recurrence-toggle--disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.recurrence-toggle__label {
  font-size: 0.92rem;
}

.raid-recurrence-card--collapsed .recurrence-toggle__label {
  font-size: 0.85rem;
  font-weight: 500;
}

.recurrence-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.2rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.08);
}

.recurrence-fields__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.recurrence-form .form__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.recurrence-form .form__field input,
.recurrence-form .form__field select {
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  padding: 0.7rem 0.75rem;
  color: #f8fafc;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.recurrence-form .form__field input:focus,
.recurrence-form .form__field select:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.65);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
}

.form__field--inline {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.form__field--checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.recurrence-interval {
  width: 6rem;
  text-align: center;
}

.recurrence-interval__suffix {
  color: #cbd5f5;
  font-size: 0.85rem;
  font-weight: 500;
}

.recurrence-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.65rem;
  background: rgba(96, 165, 250, 0.12);
  border: 1px solid rgba(96, 165, 250, 0.35);
  color: #dbeafe;
  font-size: 0.85rem;
}

.recurrence-note__icon {
  font-size: 1rem;
}

.form__hint {
  font-size: 0.75rem;
  color: #94a3b8;
}

.recurrence-collapse-enter-active,
.recurrence-collapse-leave-active {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.25s ease;
}

.recurrence-collapse-enter-from,
.recurrence-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.recurrence-collapse-enter-to,
.recurrence-collapse-leave-from {
  max-height: 420px;
  opacity: 1;
}

.recurrence-fade-enter-active,
.recurrence-fade-leave-active {
  transition: opacity 0.2s ease;
}

.recurrence-fade-enter-from,
.recurrence-fade-leave-to {
  opacity: 0;
}

.share-toast {
  position: fixed;
  top: 5.5rem;
  right: 1rem;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.6);
  border-radius: 0.75rem;
  padding: 0.75rem 1.1rem;
  color: #bbf7d0;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.45);
  z-index: 200;
  font-size: 0.9rem;
  backdrop-filter: blur(8px);
}

.card__header--attendance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.upload-btn {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(99, 102, 241, 0.88));
  border: 1px solid rgba(14, 165, 233, 0.45);
  color: #0b1120;
  box-shadow: 0 12px 24px rgba(14, 165, 233, 0.22);
  transition: transform 0.12s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
}

.upload-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(191, 219, 254, 0.6);
  box-shadow: 0 16px 28px rgba(59, 130, 246, 0.28);
}

.upload-btn:disabled {
  opacity: 0.55;
  transform: none;
  box-shadow: none;
}

.upload-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.35);
  color: #0b1120;
  font-size: 0.95rem;
  line-height: 1;
}


.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 0.35rem;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
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

.raid-signups-card {
  gap: 1.75rem;
}

.raid-signups-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.raid-signups-card__header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.raid-signups-card__mains {
  min-width: 180px;
}

.raid-signups-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: radial-gradient(circle at top, rgba(30, 41, 59, 0.88), rgba(15, 23, 42, 0.7));
  color: #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.25s ease,
    background 0.25s ease,
    color 0.2s ease;
}

.raid-signups-card__toggle:hover {
  border-color: rgba(248, 250, 252, 0.45);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.2);
  color: #f8fafc;
}

.raid-signups-card__toggle:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.8);
  outline-offset: 3px;
}

.raid-signups-card__toggle-icon {
  width: 0.75rem;
  height: 0.75rem;
  border-left: 0.18rem solid rgba(148, 163, 184, 0.85);
  border-bottom: 0.18rem solid rgba(148, 163, 184, 0.85);
  transform: rotate(-45deg);
  transition: transform 0.25s ease, border-color 0.2s ease;
}

.raid-signups-card__toggle-icon--collapsed {
  transform: rotate(135deg);
  border-color: rgba(248, 250, 252, 0.9);
}

.raid-signups-card__toggle-label {
  white-space: nowrap;
}

.raid-signups-card__content {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  overflow: hidden;
}

.raid-signups__column {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.78), rgba(30, 41, 59, 0.6));
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.32);
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.raid-signups__column-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.raid-signups__slot-count {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.raid-signups__search {
  margin-bottom: 1rem;
}

.raid-signups__search-wrapper {
  position: relative;
}

.raid-signups__search-input {
  width: 100%;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.65);
  color: #e2e8f0;
  font-size: 0.9rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.raid-signups__search-input::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.raid-signups__search-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.raid-signups__search-loading {
  position: absolute;
  right: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.85rem;
  color: #94a3b8;
  animation: pulse 1s infinite;
}

.raid-signups__search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.85rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  z-index: 100;
}

.raid-signups__search-dropdown--empty {
  padding: 1rem;
  text-align: center;
}

.raid-signups__search-result {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.raid-signups__search-result:hover {
  background: rgba(59, 130, 246, 0.18);
}

.raid-signups__search-result:not(:last-child) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.raid-signups__search-result--signed-up {
  opacity: 0.55;
  cursor: not-allowed;
}

.raid-signups__search-result--signed-up:hover {
  background: transparent;
}

.raid-signups__search-result-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  object-fit: cover;
}

.raid-signups__search-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.raid-signups__search-result-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.raid-signups__search-result-meta {
  font-size: 0.78rem;
}

.raid-signups__search-result-badge {
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.4rem;
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.raid-signups__search-result-add {
  font-size: 0.8rem;
  font-weight: 500;
  color: #3b82f6;
}

.raid-signups__empty {
  padding: 1.25rem;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 0.9rem;
  text-align: center;
  font-size: 0.9rem;
}

.raid-signups__characters {
  display: grid;
  gap: 1rem;
}

.raid-signups__character-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.raid-signups__character {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.55);
  color: inherit;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
  text-align: left;
  width: 100%;
}

.raid-signups__character:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.45);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.raid-signups__character:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.raid-signups__character--selected {
  border-color: rgba(59, 130, 246, 0.82);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(37, 99, 235, 0.28));
  box-shadow: 0 14px 30px rgba(29, 78, 216, 0.28);
}

.raid-signups__character--locked:not(.raid-signups__character--selected):not(.raid-signups__character--not-attending) {
  border-style: dashed;
  opacity: 0.8;
}

.raid-signups__character--not-attending {
  border-color: rgba(239, 68, 68, 0.85);
  border-width: 2px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.28));
  box-shadow: 0 10px 24px rgba(185, 28, 28, 0.25), inset 0 0 20px rgba(239, 68, 68, 0.08);
}

.raid-signups__character--not-attending:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(185, 28, 28, 0.3), inset 0 0 20px rgba(239, 68, 68, 0.1);
}

/* Status toggle buttons */
.raid-signups__status-toggle {
  display: flex;
  gap: 0.5rem;
  padding-left: 0.25rem;
}

.raid-signups__status-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(30, 41, 59, 0.6);
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.raid-signups__status-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #bfdbfe;
}

.raid-signups__status-btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.6);
  color: #93c5fd;
}

.raid-signups__status-btn--not-attending:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.raid-signups__status-btn--not-attending.raid-signups__status-btn--active {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.6);
  color: #fca5a5;
}

.raid-signups__status-icon {
  font-size: 0.7rem;
}

.raid-signups__status-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.raid-signups__avatar {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.85rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(30, 41, 59, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  transition: opacity 0.15s ease, filter 0.15s ease;
}

.raid-signups__avatar--dimmed {
  opacity: 0.6;
  filter: grayscale(40%);
}

.raid-signups__avatar-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.raid-signups__avatar-fallback {
  font-weight: 600;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.raid-signups__avatar-not-attending {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: 900;
  color: #fff;
  background: #dc2626;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 1;
  line-height: 1;
}

.raid-signups__character-meta {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.raid-signups__character-name {
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: color 0.15s ease;
}

.raid-signups__character-name--strikethrough {
  text-decoration: line-through;
  text-decoration-color: rgba(239, 68, 68, 0.7);
  text-decoration-thickness: 2px;
  color: #94a3b8;
}

.raid-signups__character-sub {
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}

.raid-signups__tag {
  margin-left: 0.5rem;
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Status badge for not attending */
.raid-signups__character-status-badge {
  margin-left: auto;
  background: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 0.4rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.raid-signups__character-check {
  margin-left: auto;
  font-size: 1rem;
  color: #93c5fd;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}

.raid-signups__character--selected .raid-signups__character-check {
  opacity: 1;
}

.raid-signups__messages {
  min-height: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.raid-signups__feedback {
  margin: 0;
  font-size: 0.85rem;
}

.raid-signups__hint {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}

.raid-signups__feedback--error {
  color: #fca5a5;
}

.raid-signups__feedback--success {
  color: #bbf7d0;
}

.raid-signups__feedback--muted {
  color: #94a3b8;
}

.raid-signups__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.raid-signups__column--composition {
  gap: 1.25rem;
}

.raid-signups__composition {
  display: grid;
  gap: 1.1rem;
}

.raid-signups__role-group {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.55);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.raid-signups__role-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.raid-signups__role-label {
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.raid-signups__role-count {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
}

.raid-signups__role-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-signups__role-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.8rem;
  padding: 0.55rem 0.6rem;
  transition: background 0.18s ease, border-color 0.18s ease;
  border: 1px solid transparent;
}

.raid-signups__role-item--self {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.16);
}

.raid-signups__role-item--not-attending {
  opacity: 0.7;
}

.raid-signups__role-item--admin {
  cursor: context-menu;
}

.raid-signups__role-item--admin:hover {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.25);
}

.raid-signups__role-icon {
  position: relative;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 0.65rem;
  background: rgba(30, 41, 59, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.raid-signups__role-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.raid-signups__role-icon--not-attending {
  border-color: rgba(239, 68, 68, 0.5);
}

.raid-signups__role-icon-x {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 1.4rem;
  height: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 900;
  color: #fff;
  background: #dc2626;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 1;
  line-height: 1;
}

.raid-signups__not-attending-label {
  font-size: 0.75rem;
  color: #fca5a5;
  margin-left: 0.35rem;
}

.raid-signups__role-icon-fallback {
  font-weight: 600;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.raid-signups__role-meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.raid-signups__role-name {
  font-weight: 600;
  letter-spacing: 0.03em;
}

.raid-signups__role-sub {
  display: block;
  letter-spacing: 0.04em;
}

.raid-signups__role-empty {
  margin: 0;
}

.raid-signups__collapsed-summary {
  margin-top: 0.75rem;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  justify-content: center;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 41, 59, 0.6));
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.8), 0 16px 30px rgba(15, 23, 42, 0.4);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease;
}

.raid-signups__collapsed-summary:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.65);
  outline-offset: 4px;
}

.raid-signups__collapsed-summary:hover {
  border-color: rgba(148, 163, 184, 0.55);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.2), 0 20px 36px rgba(59, 130, 246, 0.25);
  transform: translateY(-1px);
}

.raid-signups__collapsed-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
}

.raid-signups__collapsed-group {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.8rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.55);
  min-width: 12rem;
  flex: 1 1 13rem;
  max-width: 18rem;
}

.raid-signups__collapsed-group-header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.raid-signups__collapsed-group-indicator {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.35);
  box-shadow: 0 0 12px rgba(148, 163, 184, 0.4);
}

.raid-signups__collapsed-group-indicator[data-role='TANK'] {
  background: rgba(96, 165, 250, 0.55);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.5);
}

.raid-signups__collapsed-group-indicator[data-role='HEALER'] {
  background: rgba(52, 211, 153, 0.6);
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.5);
}

.raid-signups__collapsed-group-indicator[data-role='SUPPORT'] {
  background: rgba(251, 191, 36, 0.65);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}

.raid-signups__collapsed-group-indicator[data-role='DPS'] {
  background: rgba(248, 113, 113, 0.6);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.5);
}

.raid-signups__collapsed-group-label {
  font-weight: 600;
  letter-spacing: 0.08em;
}

.raid-signups__collapsed-group-count {
  margin-left: auto;
  font-size: 0.6rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #94a3b8;
}

.raid-signups__collapsed-items {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-signups__collapsed-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  text-align: center;
  min-width: 4.6rem;
}

.raid-signups__collapsed-item--self {
  filter: drop-shadow(0 10px 22px rgba(250, 204, 21, 0.32));
}

.raid-signups__collapsed-avatar {
  position: relative;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(34, 197, 94, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.18);
}

.raid-signups__collapsed-avatar--self {
  border-color: rgba(250, 204, 21, 0.55);
  box-shadow:
    0 0 0 2px rgba(250, 204, 21, 0.22),
    0 16px 32px rgba(250, 204, 21, 0.3);
  background: radial-gradient(circle at 30% 30%, rgba(253, 224, 71, 0.35), rgba(15, 23, 42, 0.85));
}

.raid-signups__collapsed-avatar--not-attending {
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 10px 24px rgba(239, 68, 68, 0.15);
}

.raid-signups__collapsed-item--not-attending {
  opacity: 0.7;
}

.raid-signups__collapsed-x {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 900;
  color: #fff;
  background: #dc2626;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 2;
  line-height: 1;
}

.raid-signups__collapsed-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.raid-signups__collapsed-fallback {
  font-weight: 600;
  color: #cbd5f5;
  letter-spacing: 0.06em;
}

.raid-signups__collapsed-check {
  position: absolute;
  bottom: -0.3rem;
  right: -0.25rem;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.9));
  border: 2px solid rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0b1120;
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 6px 12px rgba(34, 197, 94, 0.35);
  z-index: 2;
}

.raid-signups__collapsed-name {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: 0.78rem;
  color: #e2e8f0;
}

.raid-signups__collapsed-class {
  letter-spacing: 0.06em;
  font-size: 0.65rem;
}

.raid-signups__collapsed-more {
  text-align: center;
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
}

.raid-signups__collapsed-empty {
  margin: 0;
}

.raid-signups-collapse-enter-active,
.raid-signups-collapse-leave-active {
  transition:
    max-height 0.28s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.raid-signups-collapse-enter-from,
.raid-signups-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
}

.raid-signups-collapse-enter-to,
.raid-signups-collapse-leave-from {
  max-height: 2000px;
  opacity: 1;
  transform: translateY(0);
}

.raid-timing {
  gap: 1.5rem;
}

.timing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.timing-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timing-actual-group {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
  grid-column: 1 / -1;
}

.timing-field .label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.timing-field--actual {
  flex: 1 1 auto;
  max-width: 280px;
}

.timing-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  color: #f8fafc;
  width: 100%;
  max-width: 260px;
}

.timing-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.timing-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.timing-actions {
  display: flex;
  gap: 0.75rem;
}

.error {
  color: #f87171;
  margin: 0;
}

.attendance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.attendance-list__item {
  background: rgba(30, 41, 59, 0.4);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.attendance-list__item:hover {
  background: rgba(59, 130, 246, 0.2);
  transform: translateY(-1px);
}

.event-main {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.attendees {
  margin-left: 0;
}

.arrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.table-wrapper {
  overflow: auto;
  max-height: 320px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

th {
  font-weight: 600;
  color: #cbd5f5;
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
}

.muted {
  color: #94a3b8;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.timing-actions {
  flex-wrap: wrap;
}

.raid-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 1.25rem;
  border-radius: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  color: #0f172a;
  background: linear-gradient(135deg, rgba(238, 242, 255, 0.95), rgba(203, 213, 225, 0.8));
  box-shadow: 0 12px 20px rgba(15, 23, 42, 0.18);
}

.raid-action-btn--announce {
  padding: 0.5rem 0.75rem;
  min-width: 0;
  background: rgba(148, 163, 184, 0.15);
  border-color: rgba(148, 163, 184, 0.25);
  color: #e2e8f0;
  box-shadow: none;
}

.raid-action-btn--announce:hover:not(:disabled),
.raid-action-btn--announce:focus-visible:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(148, 163, 184, 0.25);
  border-color: rgba(148, 163, 184, 0.35);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.18);
}

.raid-action-btn__icon {
  font-size: 1.1rem;
  filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.2));
}

.raid-action-btn:hover:not(:disabled),
.raid-action-btn:focus-visible:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.25);
}

.raid-action-btn--start {
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.92), rgba(59, 130, 246, 0.88));
  color: #ecfdf5;
  border-color: rgba(22, 163, 74, 0.35);
}

.raid-action-btn--start:hover:not(:disabled),
.raid-action-btn--start:focus-visible:not(:disabled) {
  filter: brightness(1.05);
}

.raid-action-btn--end {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(249, 115, 22, 0.88));
  color: #fff1f2;
  border-color: rgba(239, 68, 68, 0.35);
}

.raid-action-btn--restart {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.92), rgba(192, 132, 252, 0.88));
  color: #f8fafc;
  border-color: rgba(14, 165, 233, 0.35);
}

.raid-action-btn--cancel {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(249, 115, 22, 0.88));
  color: #fff1f2;
  border-color: rgba(239, 68, 68, 0.35);
}

.raid-action-btn--uncancel {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.92), rgba(52, 211, 153, 0.88));
  color: #dcfce7;
  border-color: rgba(34, 197, 94, 0.35);
}

.raid-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
  filter: none;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
}

.btn--outline:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn--danger {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.btn--danger:hover {
  background: rgba(248, 113, 113, 0.25);
  color: #fee2e2;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn--outline:disabled {
  border-color: rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.5);
}

.btn--danger:disabled {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(248, 113, 113, 0.2);
  color: rgba(252, 165, 165, 0.5);
}


.event-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attendance-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.4rem;
  transition: color 0.2s ease, background 0.2s ease;
}

.icon-button:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.icon-button--danger {
  color: #fca5a5;
}

.icon-button--danger:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

.icon-button--outline {
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 0.25rem 0.6rem;
  border-radius: 0.5rem;
}

.icon-button--outline:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.icon-button--edit {
  font-size: 0.85rem;
  color: #94a3b8;
  padding: 0.2rem 0.35rem;
}

.icon-button--edit:hover:not(:disabled) {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.1);
}

.icon-button--edit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-button--graph {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
  font-size: 1.1rem;
  color: #cbd5f5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-button--graph:hover {
  background: rgba(59, 130, 246, 0.3);
  color: #f1f5f9;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.loot-summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}


.raid-loot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.raid-loot-card {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 0.85rem 1rem;
  background: rgba(15, 23, 42, 0.75);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.45);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.raid-loot-card--needs-assignment {
  border-color: rgba(239, 68, 68, 0.45);
  background: linear-gradient(145deg, rgba(127, 29, 29, 0.85), rgba(220, 38, 38, 0.45));
  box-shadow: 0 10px 24px rgba(127, 29, 29, 0.5);
}

.raid-loot-card--needs-assignment:hover,
.raid-loot-card--needs-assignment:focus-visible {
  border-color: rgba(248, 113, 113, 0.75);
  box-shadow: 0 16px 32px rgba(127, 29, 29, 0.6);
}


.raid-loot-card__badge {
  position: absolute;
  bottom: 0.55rem;
  right: 0.75rem;
  font-size: 0.95rem;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.5));
  pointer-events: none;
  z-index: 1;
}

.raid-loot-card__badge--whitelist {
  color: #facc15;
}

.raid-loot-card:not(.raid-loot-card--needs-assignment):hover,
.raid-loot-card:not(.raid-loot-card--needs-assignment):focus-visible {
  transform: translateY(-2px);
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.5);
}

.raid-loot-card__count {
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

.raid-loot-card--needs-assignment .raid-loot-card__count {
  background: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.65);
  color: #fecaca;
}

.raid-loot-card__header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding-right: 3rem;
}

.raid-loot-card__icon {
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

.raid-loot-card__icon picture,
.raid-loot-card__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.raid-loot-card__emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.45rem;
}

.raid-loot-card__item {
  margin: 0;
  font-weight: 700;
}

.raid-loot-card__looter {
  margin: 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

.raid-loot-card__looter-name {
  font-weight: 600;
  color: #e2e8f0;
}

.raid-loot-card__looter-name--unassigned {
  color: #fecaca;
}

.raid-loot-card__looter .character-link {
  color: #38bdf8;
}

.raid-loot-card__looter .character-link:hover,
.raid-loot-card__looter .character-link:focus-visible {
  color: #f8fafc;
}

.raid-loot-card__looter-class {
  margin-left: 0.35rem;
}

.raid-loot-card__note {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5f5;
}

.recorded-loot-card {
  position: relative;
  padding-top: 2.5rem;
}

.recorded-loot__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: flex-start;
  gap: 1.5rem;
  padding-right: 8rem;
}

.recorded-loot__summary {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  justify-self: start;
}

.recorded-loot__manage {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  z-index: 1;
}

.recorded-loot__monitor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 3rem;
  width: clamp(280px, 40vw, 540px);
  border-radius: 1.25rem;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(15, 23, 42, 0.65));
  color: #dbeafe;
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.18), inset 0 0 0 1px rgba(15, 23, 42, 0.2);
  justify-self: center;
}

.recorded-loot__monitor-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  line-height: 1.4;
  text-align: center;
  white-space: normal;
}

.recorded-loot__spacer {
  width: 100%;
  height: 0;
}

.recorded-loot__monitor-bar {
  position: relative;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(191, 219, 254, 0.22);
  box-shadow: inset 0 0 0 1px rgba(191, 219, 254, 0.35);
}

.recorded-loot__monitor-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(191, 219, 254, 0),
    rgba(191, 219, 254, 0.85),
    rgba(191, 219, 254, 0)
  );
  transform: translateX(-100%);
  animation: recorded-loot-monitor-slide 1.6s ease-in-out infinite;
}

@keyframes recorded-loot-monitor-slide {
  to {
    transform: translateX(100%);
  }
}

.recorded-loot__monitor-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(59, 130, 246, 0.6), transparent 60%);
  opacity: 0.35;
}

.btn--manage-loot {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  color: #0f172a;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.9), rgba(226, 232, 240, 0.95));
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  box-shadow: 0 10px 25px rgba(148, 163, 184, 0.35);
  text-decoration: none;
  transition: color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.btn--manage-loot:hover,
.btn--manage-loot:focus-visible {
  box-shadow: 0 14px 30px rgba(148, 163, 184, 0.5);
  color: #020617;
  transform: translateY(-1px);
}

@media (max-width: 640px) {
  .recorded-loot__header {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    padding-right: 0;
  }

  .recorded-loot-card {
    padding-top: 3.75rem;
  }

  .recorded-loot__manage {
    position: static;
    align-self: flex-end;
    margin-bottom: 0.5rem;
  }

  .recorded-loot__monitor {
    width: 100%;
    padding: 1rem 1.5rem;
    margin-top: 0.5rem;
  }

  .recorded-loot__spacer {
    display: none;
  }
}

.loot-context-menu {
  position: fixed;
  z-index: 60;
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
  transition: background 0.15s ease, color 0.15s ease;
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

.association-context-menu {
  min-width: 150px;
  z-index: 90;
}

.card--collapsed {
  padding-bottom: 0.75rem;
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.35);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.raid-notes-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
}

.raid-notes-card__actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.raid-notes-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.raid-notes-card__textarea {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.75rem;
  padding: 0.85rem;
  color: #e2e8f0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.raid-notes-card__textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.raid-notes-card__display {
  white-space: pre-wrap;
  line-height: 1.6;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 0.75rem;
  padding: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.raid-notes-card .error {
  margin-top: 0;
}

.raid-targets-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
}

.raid-targets-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-targets-progress {
  font-size: 0.8rem;
  font-weight: 600;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}

.raid-targets-card__actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.raid-targets-card__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.raid-targets-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.raid-targets-card__label {
  font-weight: 600;
  margin-bottom: 0.35rem;
  display: block;
}

.raid-targets-card__list {
  list-style: disc;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: #e2e8f0;
}

.raid-targets-card__list li {
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.raid-targets-card__check {
  font-size: 0.85rem;
  color: #4ade80;
}

.raid-targets-card__threat {
  font-size: 0.9rem;
  color: #f87171;
}

.raid-targets-card__unknown {
  font-size: 0.85rem;
  color: #fbbf24;
}

.raid-kills-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.raid-kills-card__actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.raid-kills-card__actions-center {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.raid-kills-card__summary {
  margin-top: 0.65rem;
}

.raid-kills-card__totals {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.raid-kills-card__totals--inline {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
}

.raid-kills-card__upload {
  margin-left: auto;
}

.raid-kills-card__add {
  margin-left: 0.75rem;
}

.raid-kills-card__totals-label {
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}

.raid-kills-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 1rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 1.1rem;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.85), rgba(34, 197, 94, 0.7));
  border: 1px solid rgba(16, 185, 129, 0.6);
  color: #0f172a;
  box-shadow: 0 8px 18px rgba(16, 185, 129, 0.35);
}

.raid-kills-grid-wrapper {
  max-height: 260px;
  overflow-y: auto;
  margin-top: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(59, 130, 246, 0.25);
  padding: 0.65rem;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.65));
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.4);
}

.raid-kills-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(90px, 1fr));
  gap: 0.5rem;
}


.raid-kills-grid__item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.55rem;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(125, 211, 252, 0.18);
  min-height: 92px;
  position: relative;
  overflow: hidden;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.raid-kills-grid__item::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.25), transparent 55%);
  transition: opacity 0.2s ease;
}

.raid-kills-grid__item:hover,
.raid-kills-grid__item:focus-within {
  transform: translateY(-2px);
  border-color: rgba(125, 211, 252, 0.4);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.35);
}

.raid-kills-grid__item:hover::after,
.raid-kills-grid__item:focus-within::after {
  opacity: 1;
}

.raid-kills-grid__name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 0.82rem;
  max-height: 2.6em;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.raid-kills-grid__badge {
  align-self: flex-start;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-weight: 700;
  color: #0f172a;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(103, 232, 249, 0.85));
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  font-size: 0.85rem;
}

.raid-kills-grid__icon {
  font-size: 0.85rem;
  color: #facc15;
}

.raid-kills-grid__icon--note {
  color: #cbd5f5;
  margin-left: 0.25rem;
}

.raid-kills-grid__item--target {
  border-color: rgba(250, 204, 21, 0.45);
  background: rgba(250, 204, 21, 0.08);
}

.raid-kills-grid__badge--target {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.95), rgba(251, 191, 36, 0.85));
  border-color: rgba(234, 179, 8, 0.8);
  color: #1f1f1f;
}

@media (max-width: 1200px) {
  .raid-kills-grid {
    grid-template-columns: repeat(5, minmax(90px, 1fr));
  }
}

@media (max-width: 900px) {
  .raid-kills-grid {
    grid-template-columns: repeat(4, minmax(90px, 1fr));
  }
}

@media (max-width: 640px) {
  .raid-kills-grid-wrapper {
    max-height: 220px;
  }

  .raid-kills-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}

.collapse-indicator {
  border: none;
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.35), rgba(71, 85, 105, 0.55));
  border-radius: 999px;
  width: 2.15rem;
  height: 2.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.collapse-indicator:hover,
.collapse-indicator:focus-visible {
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.45);
  filter: brightness(1.08);
}

.collapse-indicator__icon {
  display: inline-flex;
  font-size: 0.95rem;
  transform: rotate(0deg);
  transition: transform 0.22s ease;
}

.collapse-indicator__icon[data-expanded='true'] {
  transform: rotate(180deg);
}

.panel-collapse-enter-active,
.panel-collapse-leave-active {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.25s ease;
}

.panel-collapse-enter-from,
.panel-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.panel-collapse-enter-to,
.panel-collapse-leave-from {
  max-height: 480px;
  opacity: 1;
}

.modal.raid-targets-modal {
  width: min(1400px, calc(100vw - 1.5rem));
  max-width: min(1400px, calc(100vw - 1.5rem));
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.92) 100%);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.55);
}

.targets-modal-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.targets-modal-columns {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr);
}

.targets-panel {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(15, 23, 42, 0.65);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.3);
}

.targets-panel--primary {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.75));
}

.targets-panel--secondary {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.92), rgba(17, 24, 39, 0.9));
}

.targets-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-start;
}

.targets-panel__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
  margin-bottom: 0.1rem;
}

.targets-panel__title {
  margin: 0;
  font-size: 1.25rem;
}

.targets-panel__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.targets-panel__body--copy {
  gap: 1.25rem;
}

.targets-metrics {
  display: flex;
  gap: 0.85rem;
}

.targets-metric {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.75rem;
  padding: 0.65rem 0.85rem;
  min-width: 90px;
}

.targets-metric__label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.8);
  margin-bottom: 0.25rem;
}

.targets-metric__value {
  font-size: 1.35rem;
  font-weight: 700;
  color: #e2e8f0;
}

.targets-field__label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}

.targets-field__input {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.targets-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-height: 52px;
  padding: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.8rem;
  background: rgba(15, 23, 42, 0.6);
}

.targets-pill-list--empty {
  align-items: center;
}

.targets-pill-empty {
  font-style: italic;
  color: rgba(148, 163, 184, 0.9);
}

.target-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #cfe1ff;
  font-size: 0.85rem;
  line-height: 1.1;
}

.target-pill__label {
  white-space: nowrap;
}

.target-pill__remove {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.target-pill__remove:hover {
  color: #fca5a5;
}

.targets-pill-input {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.targets-pill-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
}

.targets-field textarea {
  min-height: 180px;
}

.targets-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.targets-input-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.raid-targets-modal__header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  padding-bottom: 0.75rem;
}

.targets-summary {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
}

.targets-summary > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.targets-summary__label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
}

.targets-summary__value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #e0f2fe;
}

.targets-copy {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.85rem;
  padding: 0.9rem 1rem;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.targets-copy__header {
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: flex-start;
}

.targets-copy__title {
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.targets-copy-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.targets-copy {
  flex: 1;
}

.targets-copy__controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  height: 100%;
}

.targets-copy__control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.targets-copy__control--select {
  flex: 1;
}

.targets-copy__control--select .targets-copy__select {
  flex: 1;
  min-height: 0;
}

.targets-copy__control-label {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.targets-copy__content-grid {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .targets-copy__content-grid {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  }
}

.targets-copy__search,
.targets-copy__select {
  width: 100%;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.65rem;
  padding: 0.5rem 0.75rem;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.targets-copy__search:focus,
.targets-copy__select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.targets-copy__select {
  min-height: 7rem;
}

.targets-copy__preview {
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(30, 41, 59, 0.65);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.targets-copy__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.targets-copy__preview-title {
  font-weight: 600;
  font-size: 1rem;
}

.targets-copy__preview-date {
  font-size: 0.9rem;
  color: rgba(248, 250, 252, 0.75);
}

.targets-copy__preview-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.targets-copy__preview-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
  margin-bottom: 0.25rem;
}

.targets-copy__list {
  list-style: disc;
  padding-left: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: #e2e8f0;
  margin: 0;
}

.targets-copy__preview-metrics {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: rgba(248, 250, 252, 0.8);
}

.targets-copy__empty {
  min-height: 160px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  justify-content: center;
}

.targets-copy__empty-title {
  font-weight: 600;
  margin: 0;
}

.targets-copy__status {
  min-height: 1.2rem;
}

@media (min-width: 880px) {
  .targets-modal-columns {
    grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.8fr);
  }

  .targets-copy-panel {
    min-width: 360px;
  }
}

.raid-targets-modal__textarea {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.75rem;
  padding: 0.85rem;
  color: #e2e8f0;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.raid-targets-modal__textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.targets-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
  padding: 1.5rem;
}

.modal {
  width: min(520px, 100%);
  background: rgba(15, 23, 42, 0.95);
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.55);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.npc-kill-modal {
  width: calc(100vw - 3rem);
  max-width: calc(100vw - 3rem);
  height: 85vh;
  display: flex;
  flex-direction: column;
}

.npc-kill-chart {
  flex: 1;
  width: 100%;
  height: 100%;
}

.manual-kill-modal {
  max-width: 28rem;
}

.manual-kill-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.manual-kill-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #cbd5f5;
}

.manual-kill-field span {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #e2e8f0;
}

.manual-kill-input {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: #f8fafc;
}

.manual-kill-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.manual-kill-error {
  margin: 0;
}

.npc-notes-modal {
  width: min(1540px, calc(100vw - 1.5rem));
  max-width: calc(100vw - 1.5rem);
  height: min(900px, calc(100vh - 2rem));
  background: radial-gradient(circle at top, rgba(59, 130, 246, 0.2), rgba(15, 23, 42, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: 0 35px 70px rgba(15, 23, 42, 0.75);
  padding: 1.75rem;
}

.npc-notes-body {
  flex: 1;
  display: flex;
  gap: 1.5rem;
  min-height: 0;
}

.npc-notes-sidebar {
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.35);
}

.npc-notes-search input {
  width: 100%;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.85);
  padding: 0.6rem 0.75rem;
  color: #f8fafc;
}

.npc-notes-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.npc-notes-list__item {
  width: 100%;
  text-align: left;
  border-radius: 0.6rem;
  border: 1px solid transparent;
  background: rgba(15, 23, 42, 0.65);
  color: #e2e8f0;
  padding: 0.55rem 0.75rem;
  transition: border 0.2s ease, background 0.2s ease, transform 0.15s ease;
  overflow: hidden;
}

.npc-notes-list__row {
  position: relative;
}

.npc-notes-list__row--active .npc-notes-list__item {
  border-color: rgba(59, 130, 246, 0.6);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(14, 116, 144, 0.35));
}

.npc-notes-list__pill {
  margin-left: auto;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #bbf7d0;
}

.npc-notes-list__row--pending::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.6rem;
  border: 1px solid rgba(74, 222, 128, 0.4);
  background: rgba(34, 197, 94, 0.08);
  pointer-events: none;
}

.npc-notes-list__row--pending .npc-notes-list__item {
  color: #bbf7d0;
}

.npc-notes-list__item:hover,
.npc-notes-list__row--active .npc-notes-list__item {
  border-color: rgba(59, 130, 246, 0.6);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(14, 116, 144, 0.35));
  transform: translateX(2px);
}

.npc-notes-approval {
  position: absolute;
  top: 50%;
  right: 0.4rem;
  display: flex;
  gap: 0.25rem;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.npc-notes-list__row--pending:hover .npc-notes-approval {
  opacity: 1;
}

.npc-notes-approval__btn {
  border: none;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 999px;
  width: 28px;
  height: 28px;
  font-size: 0.9rem;
  cursor: pointer;
  color: #cbd5f5;
  transition: background 0.15s ease;
}

.npc-notes-approval__btn--approve:hover {
  background: rgba(34, 197, 94, 0.3);
  color: #bbf7d0;
}

.npc-notes-approval__btn--deny:hover {
  background: rgba(248, 113, 113, 0.3);
  color: #fecaca;
}

.npc-notes-new {
  margin-top: auto;
}

.npc-notes-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 0;
}

.npc-notes-meta {
  margin: 0.3rem 0 0;
  color: #94a3b8;
}

.npc-notes-pending-hint {
  margin: 0.25rem 0 0;
  color: #facc15;
  font-size: 0.85rem;
}

.npc-notes-status {
  margin: 0.35rem 0 0;
  color: #bfdbfe;
  font-size: 0.85rem;
}

.npc-notes-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5f5;
}

.npc-notes-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.npc-notes-content-header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.npc-notes-eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.npc-notes-content-header h3 {
  margin: 0.2rem 0 0;
  font-size: 1.75rem;
  color: #f8fafc;
}

.npc-notes-header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.npc-notes-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #bfdbfe;
  text-decoration: none;
  font-size: 0.85rem;
  background: rgba(59, 130, 246, 0.2);
}

.npc-notes-link:hover {
  border-color: rgba(191, 219, 254, 0.8);
  color: #e0f2fe;
}

.npc-notes-badge {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5f5;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.npc-notes-pending-pill {
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
  font-size: 0.8rem;
  font-weight: 600;
}

.npc-notes-actions {
  justify-content: center;
}

.npc-notes-btn--ghost:hover {
  border-color: rgba(248, 113, 113, 0.5);
  color: #fecaca;
}

.npc-notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.npc-notes-panel {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.65);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.npc-notes-panel header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.npc-notes-panel h4 {
  margin: 0;
}

.npc-notes-panel--notes .npc-notes-textarea {
  min-height: 220px;
}

.npc-notes-input,
.npc-notes-textarea {
  width: 100%;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  padding: 0.55rem 0.65rem;
}

.npc-notes-textarea {
  resize: vertical;
  min-height: 140px;
}

.npc-notes-association-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.npc-notes-chip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.45rem;
}

.npc-notes-chip-wrapper {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.4rem;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.npc-notes-chip-wrapper--active {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.15);
}

.npc-notes-chip-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.npc-notes-association-edit {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0.65rem;
  padding: 0.5rem;
}

.npc-notes-association-form {
  margin-top: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.npc-notes-association-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.npc-notes-empty {
  font-style: italic;
}

.npc-notes-error {
  margin: 0;
}

.npc-notes-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #bfdbfe;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.npc-notes-chip:hover {
  background: rgba(59, 130, 246, 0.28);
  border-color: rgba(191, 219, 254, 0.6);
}

.npc-notes-chip--disabled {
  opacity: 0.55;
  cursor: default;
  pointer-events: none;
}

.npc-notes-chip--button {
  width: 100%;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #dbeafe;
  cursor: pointer;
}

.npc-notes-chip--button:hover {
  background: rgba(59, 130, 246, 0.25);
}

.npc-notes-chip__external {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.35rem;
  color: #bfdbfe;
  text-decoration: none;
  font-size: 0.9rem;
}

.npc-notes-chip__external:hover {
  color: #e0f2fe;
}

.icon-button--chip-delete {
  border: 1px solid rgba(248, 113, 113, 0.45);
  color: #fecaca;
}

.icon-button--chip-delete:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #fee2e2;
}

.icon-button--success {
  border: 1px solid rgba(34, 197, 94, 0.6);
  color: #bbf7d0;
  background: rgba(34, 197, 94, 0.15);
}

.icon-button--success:hover {
  background: rgba(34, 197, 94, 0.25);
}

.npc-notes-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  padding: 0.55rem 0.95rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.6);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.npc-notes-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.35);
}

.npc-notes-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.npc-notes-btn--primary {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(14, 165, 233, 0.9));
  border-color: rgba(59, 130, 246, 0.65);
  color: #0f172a;
  box-shadow: 0 14px 28px rgba(59, 130, 246, 0.35);
}

.npc-notes-btn--primary:hover:not(:disabled) {
  box-shadow: 0 18px 32px rgba(59, 130, 246, 0.4);
}

.npc-notes-btn--ghost {
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.4);
}

.npc-notes-btn--ghost:hover:not(:disabled) {
  border-color: rgba(191, 219, 254, 0.6);
  background: rgba(30, 41, 59, 0.8);
}

.npc-notes-btn--pill {
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.85), rgba(99, 102, 241, 0.85));
  border-color: rgba(14, 165, 233, 0.45);
  color: #0f172a;
  box-shadow: 0 12px 24px rgba(14, 165, 233, 0.28);
}

.npc-notes-btn--compact {
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .npc-kill-modal {
    width: calc(100vw - 1rem);
    max-width: calc(100vw - 1rem);
    height: 80vh;
  }

  .npc-notes-modal {
    width: calc(100vw - 1rem);
    max-width: calc(100vw - 1rem);
    height: calc(100vh - 1rem);
    padding: 1rem;
  }

  .npc-notes-body {
    flex-direction: column;
  }

  .npc-notes-sidebar {
    width: 100%;
  }
}

:global(body.modal-open) {
  overflow: hidden;
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modal__header h3 {
  margin: 0;
}

.modal__header p {
  margin: 0.35rem 0 0;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.edit-loot-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.edit-loot-form .form__field span {
  font-weight: 600;
}

.raid-signups__collapsed-name,
.raid-signups__role-name {
  color: #38bdf8;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.15s ease, text-shadow 0.15s ease;
}

.raid-signups__collapsed-name:hover,
.raid-signups__collapsed-name:focus-visible,
.raid-signups__role-name:hover,
.raid-signups__role-name:focus-visible {
  color: #f8fafc;
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
  outline: none;
}
</style>
