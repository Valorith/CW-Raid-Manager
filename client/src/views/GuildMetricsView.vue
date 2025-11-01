<template>
  <section class="metrics-view">
    <div v-if="metrics" class="metrics-content">
      <div v-if="error" class="metrics-inline-error">
        <p>{{ error }}</p>
        <button class="btn btn--outline btn--small" type="button" @click="reloadMetrics">
          Retry
        </button>
      </div>

      <header class="metrics-header">
        <div>
          <h1>Guild Metrics</h1>
          <p class="muted small">Attendance and loot trends for {{ activeRangeLabel }}</p>
        </div>
        <RouterLink
          class="btn btn--outline metrics-back"
          :to="{ name: 'GuildDetail', params: { guildId } }"
        >
          ← Back to Guild
        </RouterLink>
      </header>

      <div class="metrics-mode">
        <span class="metrics-mode__label">View Mode</span>
        <div class="metrics-mode__controls" role="group" aria-label="Metrics view mode">
          <button
            type="button"
            class="metrics-mode__button"
            :class="{ 'metrics-mode__button--active': metricsMode === 'character' }"
            :aria-pressed="metricsMode === 'character'"
            @click="setMetricsMode('character')"
          >
            Characters
          </button>
          <button
            type="button"
            class="metrics-mode__button"
            :class="{ 'metrics-mode__button--active': metricsMode === 'member' }"
            :aria-pressed="metricsMode === 'member'"
            @click="setMetricsMode('member')"
          >
            Members
          </button>
        </div>
      </div>

      <TimelineRangeSelector
        v-if="timelineBounds"
        :min-date="timelineBounds.min"
        :max-date="timelineBounds.max"
        :start-date="currentRangeIso.start"
        :end-date="currentRangeIso.end"
        :disabled="loading"
        :event-dates="timelineEventDates"
        @update="handleTimelinePreview"
        @commit="handleTimelineCommit"
      >
        <div class="timeline-summary">
          <span class="timeline-summary__label">Selected Range</span>
          <span class="timeline-summary__value">{{ timelineSelectionLabel }}</span>
        </div>
      </TimelineRangeSelector>

      <div class="metrics-summary">
        <div v-for="card in summaryCards" :key="card.label" class="metrics-summary__item">
          <span class="metrics-summary__label">{{ card.label }}</span>
          <span class="metrics-summary__value">{{ formatNumber(card.value) }}</span>
        </div>
      </div>

      <div class="metrics-filters">
        <div class="metrics-search-container">
          <div class="metrics-search">
            <div class="metrics-search__input-wrapper">
              <input
                id="metrics-search"
                ref="searchInputRef"
                v-model="searchQuery"
                type="search"
                class="metrics-search__input"
                :placeholder="searchPlaceholder"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @keydown="handleSearchKeydown"
            />
            <ul
              v-if="showSearchResults"
              ref="searchResultsRef"
              class="metrics-search__results"
              @mouseenter="handleSearchResultsHover(true)"
              @mouseleave="handleSearchResultsHover(false)"
            >
              <li
                v-for="option in filteredSearchOptions"
                :key="`${option.type}-${option.value}`"
                class="metrics-search__result"
                :class="{ 'metrics-search__result--active': isSearchOptionActive(option) }"
                @mousedown.prevent="handleSearchSelect(option)"
                @mouseenter="setActiveSearchOption(option)"
              >
                  <span class="metrics-search__result-primary">{{ option.label }}</span>
                  <span v-if="option.description" class="metrics-search__result-secondary">
                    {{ option.description }}
                  </span>
                </li>
                <li
                  v-if="filteredSearchOptions.length === 0"
                  class="metrics-search__result metrics-search__result--empty"
                >
                  No matches found
                </li>
              </ul>
            </div>
            <div v-if="selectedCharacterChips.length > 0" class="metrics-search__chips">
              <span v-for="chip in selectedCharacterChips" :key="chip.key" class="metrics-chip">
                <span>{{ chip.label }}</span>
                <button
                  type="button"
                  class="metrics-chip__remove"
                  @click="removeCharacterSelection(chip.key)"
                >
                  ×
                </button>
              </span>
            </div>
            <div
              v-if="selectedLootItemChips.length > 0"
              class="metrics-search__chips metrics-search__chips--items"
            >
              <span
                v-for="chip in selectedLootItemChips"
                :key="chip.key"
                class="metrics-chip metrics-chip--item"
              >
                <span>{{ chip.label }}</span>
                <button
                  type="button"
                  class="metrics-chip__remove"
                  @click="removeItemSelection(chip.label)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="metrics-inspector">
          <CharacterInspector
            :entries="characterInspectorEntries"
            :total-raids="allRaidIds.length"
            :title="inspectorHeading"
            :link-mode="inspectorLinkMode"
            @reset="handleInspectorReset"
            @reorder="handleInspectorReorder"
          />
        </div>
      </div>

      <section class="metrics-section" v-if="isAttendanceSectionVisible">
        <header class="metrics-section__header">
          <div>
            <h2>Attendance Trends</h2>
            <p class="muted small">{{ attendanceSummaryText }}</p>
          </div>
        </header>

        <div class="metrics-card-grid" :class="{ 'metrics-card-grid--maximized': maximizedCard }">
          <article
            v-if="!maximizedCard || maximizedCard === 'attendanceTimeline'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'attendanceTimeline' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Attendance Over Time</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('attendanceTimeline') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('attendanceTimeline')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Line
                v-if="attendanceTimelineHasData"
                :data="attendanceTimelineChartData"
                :options="attendanceTimelineChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No attendance records match the current filters.
              </p>
            </div>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'attendanceByCharacter'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'attendanceByCharacter' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>{{ attendanceRateTitle }}</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('attendanceByCharacter') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('attendanceByCharacter')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="attendanceByCharacterHasData"
                :data="attendanceByCharacterChartData"
                :options="attendanceByCharacterChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                Not enough attendance activity for the selected filters.
              </p>
            </div>
            <p
              v-if="shouldShowUnknownMemberHint"
              class="metrics-card__hint metrics-card__hint--interactive"
            >
              <span class="metrics-card__hint-dot" aria-hidden="true"></span>
              Tip: Click the <strong>Unknown</strong> bar to view grouped characters.
            </p>
          </article>

          <article v-if="!maximizedCard && !isMemberMode" class="metrics-card metrics-class-card">
            <header class="metrics-card__header">
              <h3>Filter by Class</h3>
              <p class="metrics-card__hint muted tiny">
                Click to include or exclude a class. No selection = every class.
              </p>
            </header>
            <div class="metrics-class-toggle metrics-class-toggle--grid">
              <button
                v-for="option in classIconOptions"
                :key="option.value"
                type="button"
                :class="[
                  'metrics-class-toggle__button',
                  {
                    'metrics-class-toggle__button--active': classSetHas(option.value),
                    'metrics-class-toggle__button--inactive':
                      !option.isAvailable && !classSetHas(option.value)
                  }
                ]"
                :aria-pressed="classSetHas(option.value)"
                :aria-label="option.label"
                @click="toggleClass(option.value)"
              >
                <span class="metrics-class-toggle__icon">
                  <img v-if="option.icon" :src="option.icon" :alt="option.label" />
                  <span v-else>{{ option.shortLabel }}</span>
                </span>
                <span class="metrics-class-toggle__label">{{ option.shortLabel }}</span>
              </button>
            </div>
          </article>
        </div>

        <div v-if="attendanceSpotlight.length > 0" class="metrics-spotlight">
          <h3>{{ attendanceSpotlightTitle }}</h3>
          <ul class="metrics-spotlight__list">
            <li
              v-for="entry in attendanceSpotlight"
              :key="entry.key"
              class="metrics-spotlight__item"
            >
              <div>
                <CharacterLink
                  v-if="shouldLinkEntities"
                  class="metrics-spotlight__name"
                  :name="entry.name"
                />
                <span v-else class="metrics-spotlight__name metrics-spotlight__name--plain">
                  {{ entry.name }}
                </span>
                <span v-if="entry.class" class="muted small">
                  • {{ resolveClassLabel(entry.class) }}
                </span>
                <span v-if="entry.userDisplayName" class="muted small">
                  • {{ entry.userDisplayName }}
                </span>
              </div>
              <div class="metrics-spotlight__stats">
                <span>{{ formatPercent(attendanceRate(entry)) }} participation</span>
                <span class="muted tiny">
                  {{ entry.presentEvents }} present events · {{ entry.lateRaids }} late ·
                  {{ entry.leftEarlyRaids }} left early · {{ entry.absentRaids }} absent ·
                  {{ entry.totalRaids }} raids
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section class="metrics-section" v-if="isLootSectionVisible">
        <header class="metrics-section__header">
          <div>
            <h2>Loot Trends</h2>
            <p class="muted small">Monitor loot volume, recipients, and the most awarded items.</p>
          </div>
        </header>

        <div class="metrics-card-grid" :class="{ 'metrics-card-grid--maximized': maximizedCard }">
          <article
            v-if="!maximizedCard || maximizedCard === 'lootTimeline'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootTimeline' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Loot Over Time</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootTimeline') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootTimeline')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Line
                v-if="lootTimelineHasData"
                :data="lootTimelineChartData"
                :options="lootTimelineChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No loot awards found for the current filters.
              </p>
            </div>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'lootByParticipant'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootByParticipant' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Top Loot Recipients</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootByParticipant') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootByParticipant')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="lootByParticipantHasData"
                :data="lootByParticipantChartData"
                :options="lootByParticipantChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                Adjust filters to see loot distribution by character.
              </p>
            </div>
            <p
              v-if="lootByParticipantHasData"
              class="metrics-card__hint metrics-card__hint--interactive"
            >
              <span class="metrics-card__hint-dot" aria-hidden="true"></span>
              Tip: Click any bar to inspect detailed loot history.
            </p>
          </article>

          <article
            v-if="!maximizedCard || maximizedCard === 'lootByItem'"
            :class="['metrics-card', { 'metrics-card--maximized': maximizedCard === 'lootByItem' }]"
          >
            <header class="metrics-card__header metrics-card__header--with-actions">
              <h3>Most Awarded Items</h3>
              <button
                type="button"
                class="metrics-card__action"
                :aria-label="isCardMaximized('lootByItem') ? 'Restore section size' : 'Maximize section'"
                @click="toggleMaximizeCard('lootByItem')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </header>
            <div class="metrics-card__chart">
              <Bar
                v-if="lootByItemHasData"
                :data="lootByItemChartData"
                :options="lootByItemChartOptions"
              />
              <p v-else class="metrics-card__empty muted small">
                No loot items recorded within the selected filters.
              </p>
            </div>
          </article>
        </div>

        <div
          v-if="lootSpotlightCharacters.length > 0 || lootSpotlightItems.length > 0"
          class="metrics-spotlight"
        >
          <h3>Loot Spotlight</h3>
          <template v-if="lootSpotlightCharacters.length > 0">
            <h4 class="metrics-spotlight__subtitle">{{ lootSpotlightSubtitle }}</h4>
            <ul class="metrics-spotlight__list">
              <li
                v-for="entry in lootSpotlightCharacters"
                :key="`character-${entry.key}`"
                class="metrics-spotlight__item"
              >
                <div>
                  <CharacterLink
                    v-if="shouldLinkEntities"
                    class="metrics-spotlight__name"
                    :name="entry.name"
                  />
                  <span v-else class="metrics-spotlight__name metrics-spotlight__name--plain">
                    {{ entry.name }}
                  </span>
                  <span v-if="entry.class" class="muted small">
                    • {{ resolveGenericClassLabel(entry.class) }}
                  </span>
                </div>
                <div class="metrics-spotlight__stats">
                  <span>{{ formatNumber(entry.count) }} items</span>
                  <span v-if="entry.lastAwarded" class="muted tiny">
                    Last award {{ formatDateLong(entry.lastAwarded) }}
                  </span>
                </div>
              </li>
            </ul>
          </template>
          <template v-if="lootSpotlightItems.length > 0">
            <h4 class="metrics-spotlight__subtitle">Selected Items</h4>
            <ul class="metrics-spotlight__list">
              <li
                v-for="entry in lootSpotlightItems"
                :key="`item-${entry.itemName}`"
                class="metrics-spotlight__item"
              >
                <div>
                <strong>{{ entry.itemName }}</strong>
                </div>
                <div class="metrics-spotlight__stats">
                  <span>{{ formatNumber(entry.count) }} awards</span>
                  <span v-if="entry.lastAwarded" class="muted tiny">
                    Last award {{ formatDateLong(entry.lastAwarded) }}
                  </span>
                </div>
              </li>
            </ul>
          </template>
        </div>

        <div v-if="recentLootEvents.length > 0" class="metrics-recent">
          <h3>Recent Loot Events</h3>
          <div class="metrics-recent__grid">
            <article v-for="event in recentLootEvents" :key="event.id" class="metrics-recent__card">
              <header class="metrics-recent__header">
                <div class="metrics-recent__item-icon" aria-hidden="true">
                  <span aria-hidden="true">🪙</span>
                </div>
                <div class="metrics-recent__item-title">
                  <strong>{{ event.itemName }}</strong>
                  <span class="metrics-recent__raid muted tiny">{{ event.raid.name }}</span>
                </div>
                <span class="metrics-recent__time muted tiny">
                  {{ formatDateLong(eventPrimaryTimestamp(event)) }}
                </span>
              </header>
              <section class="metrics-recent__body">
                <div class="metrics-recent__looter">
                  <span class="metrics-recent__looter-label">Awarded to</span>
                  <CharacterLink
                    v-if="shouldLinkEntities"
                    class="metrics-recent__looter-name"
                    :name="event.looterName"
                  />
                  <span
                    v-else
                    class="metrics-recent__looter-name metrics-recent__looter-name--plain"
                  >
                    {{ displayLooterName(event) }}
                  </span>
                </div>
                <span
                  v-if="event.emoji"
                  class="metrics-recent__emoji"
                  :title="`Reaction: ${event.emoji}`"
                >
                  {{ event.emoji }}
                </span>
              </section>
            </article>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="loading" class="metrics-state">
      <p>Loading metrics…</p>
    </div>

    <div v-else-if="error" class="metrics-state metrics-state--error">
      <p>{{ error }}</p>
      <button class="btn btn--outline" type="button" @click="reloadMetrics">Retry</button>
    </div>

    <div v-else class="metrics-state metrics-state--empty">
      <p>No metrics available yet.</p>
      <button class="btn btn--outline" type="button" @click="reloadMetrics">Refresh</button>
    </div>

    <div v-if="showUnknownMemberModal" class="modal-backdrop">
      <div class="modal metrics-modal">
        <header class="modal__header">
          <div>
            <h2>Unknown Member Attendance</h2>
            <p class="muted small">Characters without a linked member in this range.</p>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Close unknown member attendance details"
            @click="closeUnknownMemberModal"
          >
            ✕
          </button>
        </header>
        <div class="modal__body">
          <p v-if="unknownMemberCharacterDetails.length > 0" class="muted small">
            Showing {{ unknownMemberCharacterDetails.length }} character<span
              v-if="unknownMemberCharacterDetails.length !== 1"
            >s</span>.
          </p>
          <div v-if="unknownMemberCharacterDetails.length > 0" class="metrics-modal__table-wrapper">
            <table class="metrics-modal-table">
              <thead>
                <tr>
                  <th scope="col">Character</th>
                  <th scope="col">Class</th>
                  <th scope="col">Participation %</th>
                  <th scope="col">Present</th>
                  <th scope="col">Late</th>
                  <th scope="col">Left Early</th>
                  <th scope="col">Absent</th>
                  <th scope="col">Raids</th>
                  <th
                    v-if="canAssignUnknownCharacters"
                    scope="col"
                    class="metrics-modal-table__actions-header"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in unknownMemberCharacterDetails" :key="entry.key">
                  <td class="metrics-modal-table__character">
                    <CharacterLink :name="entry.name">{{ entry.name }}</CharacterLink>
                  </td>
                  <td>{{ resolveClassLabel(entry.class) ?? 'Unknown' }}</td>
                  <td>{{ entry.participationPercent.toFixed(1) }}%</td>
                  <td>{{ formatNumber(entry.presentEvents) }}</td>
                  <td>{{ formatNumber(entry.lateRaids) }}</td>
                  <td>{{ formatNumber(entry.leftEarlyRaids) }}</td>
                  <td>{{ formatNumber(entry.absentRaids) }}</td>
                  <td>{{ formatNumber(entry.totalRaids) }}</td>
                  <td v-if="canAssignUnknownCharacters" class="metrics-modal-table__actions">
                    <div v-if="assigningUnknownCharacterKey === entry.key" class="unknown-assignment">
                      <div class="unknown-assignment__controls">
                        <select
                          :id="`unknown-member-${entry.key}-member`"
                          v-model="unknownAssignment.memberUserId"
                          aria-label="Select member"
                          :disabled="unknownAssignmentLoading"
                        >
                          <option value="" disabled>Select member…</option>
                          <option
                            v-for="member in assignableGuildMembers"
                            :key="member.userId"
                            :value="member.userId"
                          >
                            {{ member.displayName }}
                          </option>
                        </select>
                        <button
                          type="button"
                          class="unknown-assignment__icon-button unknown-assignment__icon-button--confirm"
                          :disabled="unknownAssignmentLoading || !entry.class"
                          @click="assignUnknownCharacterToMember(entry)"
                          aria-label="Confirm assignment"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          class="unknown-assignment__icon-button unknown-assignment__icon-button--cancel"
                          :disabled="unknownAssignmentLoading"
                          @click="cancelUnknownCharacterAssignment"
                          aria-label="Cancel assignment"
                        >
                          ✕
                        </button>
                      </div>
                      <p v-if="unknownAssignmentError" class="metrics-modal-table__error">
                        {{ unknownAssignmentError }}
                      </p>
                    </div>
                    <div v-else>
                      <button
                        type="button"
                        class="btn btn--small unknown-assign-trigger"
                        @click="beginUnknownCharacterAssignment(entry)"
                      >
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="muted small">
            No attendance data for the Unknown group within the current filters.
          </p>
        </div>
        <footer class="modal__footer">
          <button type="button" class="btn btn--outline btn--small" @click="closeUnknownMemberModal">
            Close
          </button>
        </footer>
      </div>
    </div>

    <div
      v-if="showLootDetailModal"
      class="modal-backdrop"
      @click.self="closeLootDetailModal"
    >
      <div class="modal metrics-modal">
        <header class="modal__header">
          <div>
            <h2>Loot History</h2>
            <p class="muted small">
              {{ lootDetailModalTitle }} —
              {{ lootDetailModalCount }} loot event<span v-if="lootDetailModalCount !== 1">s</span>
            </p>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Close loot history"
            @click="closeLootDetailModal"
          >
            ✕
          </button>
        </header>
        <div class="modal__body">
          <p v-if="lootDetailModalCount === 0" class="muted small">
            No loot records found for this selection within the current filters.
          </p>
          <div v-else class="metrics-modal__table-wrapper">
            <table class="metrics-modal-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Character</th>
                  <th scope="col">Raid</th>
                  <th scope="col">Awarded At</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleLootDetailRows" :key="row.id">
                  <td class="loot-detail__cell-item">
                    <button
                      type="button"
                      class="loot-detail__item-link"
                      @click="openAllaSearch(row.itemName)"
                    >
                      {{ row.itemName }}
                    </button>
                  </td>
                  <td>
                    <CharacterLink :name="row.looterName">{{ row.looterName }}</CharacterLink>
                  </td>
                  <td>
                    <div class="loot-detail__raid">
                      <RouterLink
                        :to="{ name: 'RaidDetail', params: { raidId: row.raidId } }"
                        class="loot-detail__raid-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ row.raidName }}
                      </RouterLink>
                      <span v-if="row.raidStart" class="loot-detail__raid-time muted tiny">
                        {{ formatDateLong(row.raidStart) }}
                      </span>
                    </div>
                  </td>
                  <td>{{ row.awardedAt ? formatDateLong(row.awardedAt) : 'Unknown' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="lootDetailModalCount > LOOT_DETAIL_PAGE_SIZE"
            class="loot-detail__pagination"
          >
            <span class="muted tiny">
              Showing {{ lootDetailStartIndex }}–{{ lootDetailEndIndex }} of {{ lootDetailModalCount }}
            </span>
            <div class="loot-detail__pagination-controls">
              <button
                type="button"
                class="loot-detail__page-button"
                :disabled="lootDetailPage === 0"
                @click="goToPreviousLootDetailPage"
              >
                ← Prev
              </button>
              <span class="loot-detail__page-indicator muted tiny">
                Page {{ lootDetailPage + 1 }} / {{ lootDetailPageCount }}
              </span>
              <button
                type="button"
                class="loot-detail__page-button"
                :disabled="lootDetailPageCount === 0 || lootDetailPage >= lootDetailPageCount - 1"
                @click="goToNextLootDetailPage"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
        <footer class="modal__footer">
          <button type="button" class="btn btn--outline btn--small" @click="closeLootDetailModal">
            Close
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Bar, Line } from 'vue-chartjs';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import CharacterInspector from '../components/CharacterInspector.vue';
import CharacterLink from '../components/CharacterLink.vue';
import TimelineRangeSelector from '../components/TimelineRangeSelector.vue';
import {
  api,
  type AttendanceMetricRecord,
  type GuildMetrics,
  type GuildMetricsQuery,
  type GuildMetricsSummary,
  type LootMetricEvent,
  type MetricsCharacterOption,
  type GuildPermissions
} from '../services/api';
import {
  characterClassLabels,
  getCharacterClassIcon,
  type AttendanceStatus,
  type CharacterClass,
  type GuildRole
} from '../services/types';
import { ensureChartJsRegistered } from '../utils/registerCharts';

const ALL_CLASS_VALUES: CharacterClass[] = [
  'WARRIOR',
  'PALADIN',
  'SHADOWKNIGHT',
  'CLERIC',
  'DRUID',
  'SHAMAN',
  'MONK',
  'RANGER',
  'ROGUE',
  'BARD',
  'BEASTLORD',
  'BERSERKER',
  'MAGICIAN',
  'ENCHANTER',
  'NECROMANCER',
  'WIZARD'
];
const CHARACTER_CLASS_FRIENDLY_NAMES: Record<CharacterClass, string> = {
  WARRIOR: 'Warrior',
  PALADIN: 'Paladin',
  SHADOWKNIGHT: 'Shadow Knight',
  CLERIC: 'Cleric',
  DRUID: 'Druid',
  SHAMAN: 'Shaman',
  MONK: 'Monk',
  RANGER: 'Ranger',
  ROGUE: 'Rogue',
  BARD: 'Bard',
  BEASTLORD: 'Beastlord',
  BERSERKER: 'Berserker',
  MAGICIAN: 'Magician',
  ENCHANTER: 'Enchanter',
  NECROMANCER: 'Necromancer',
  WIZARD: 'Wizard',
  UNKNOWN: 'Unknown'
};

ensureChartJsRegistered();

const route = useRoute();
const guildId = computed(() => route.params.guildId as string);

const loading = ref(false);
const error = ref<string | null>(null);
const metrics = ref<GuildMetrics | null>(null);
const memberDisplayMap = ref<Map<string, string>>(new Map());
const memberDisplayNameLookup = ref<Map<string, string>>(new Map());
const characterOwnerMap = ref<Map<string, { userId: string; displayName: string | null }>>(new Map());
const guildPermissions = ref<GuildPermissions | null>(null);
const guildMemberDirectory = ref<GuildMemberDirectoryEntry[]>([]);

const rangeForm = reactive({
  start: '',
  end: ''
});

type MaximizableCard =
  | 'attendanceTimeline'
  | 'attendanceByCharacter'
  | 'lootTimeline'
  | 'lootByParticipant'
  | 'lootByItem';

const selectedClasses = ref<string[]>([]);
const selectedCharacters = ref<string[]>([]);
const selectedLootItems = ref<string[]>([]);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchResultsRef = ref<HTMLUListElement | null>(null);
const searchQuery = ref('');
const searchFocused = ref(false);
const searchResultsHover = ref(false);
const activeSearchIndex = ref(-1);
const searchDropdownSuppressed = ref(false);
const ignoreNextSearchQueryReset = ref(false);
const globalSummary = ref<GuildMetricsSummary | null>(null);
const globalTimeline = ref<{ minMs: number; markers: Map<string, TimelineMarker> } | null>(null);
const maximizedCard = ref<MaximizableCard | null>(null);
const showUnknownMemberModal = ref(false);
const assigningUnknownCharacterKey = ref<string | null>(null);
const unknownAssignment = reactive<{ memberUserId: string }>({
  memberUserId: ''
});
const unknownAssignmentLoading = ref(false);
const unknownAssignmentError = ref<string | null>(null);
const showLootDetailModal = ref(false);
const lootDetailTarget = ref<{ entry: LootParticipantSummary; identity: EntityIdentity | null } | null>(null);
const lootDetailPage = ref(0);
const LOOT_DETAIL_PAGE_SIZE = 8;

const DEFAULT_BAR_LIMIT = 12;
const MAXIMIZED_BAR_LIMIT = 30;

const attendanceCards: MaximizableCard[] = ['attendanceTimeline', 'attendanceByCharacter'];
const lootCards: MaximizableCard[] = ['lootTimeline', 'lootByParticipant', 'lootByItem'];

type MetricsMode = 'character' | 'member';
const metricsMode = ref<MetricsMode>('character');
const isMemberMode = computed(() => metricsMode.value === 'member');

function setMetricsMode(mode: MetricsMode) {
  if (metricsMode.value === mode) {
    return;
  }
  metricsMode.value = mode;
  handleMetricsModeChange();
}

function handleMetricsModeChange() {
  resetFilters();
  searchDropdownSuppressed.value = false;
  activeSearchIndex.value = -1;
}

async function loadMemberDirectory() {
  const id = guildId.value;
  if (!id) {
    return;
  }
  try {
    const detail = await api.fetchGuildDetail(id);
    guildPermissions.value = detail.permissions ?? null;
    const map = new Map<string, string>();
    const nameLookup = new Map<string, string>();
    const ownerMap = new Map<string, { userId: string; displayName: string | null }>();
    const memberEntries: GuildMemberDirectoryEntry[] = [];
    const recordPreferred = (user: { displayName?: string; nickname?: string | null }) =>
      user.nickname?.trim() || user.displayName?.trim() || '';

    for (const member of detail.members ?? []) {
      const preferred = recordPreferred(member.user) || member.user.displayName || member.user.nickname || '';
      const normalizedDisplay = normalizeNameKey(member.user.displayName);
      const normalizedNickname = normalizeNameKey(member.user.nickname);
      if (member.user.id) {
        setMemberNameHint(member.user.id, preferred);
        map.set(member.user.id, preferred);
        memberEntries.push({
          userId: member.user.id,
          displayName: preferred || member.user.displayName || member.user.nickname || member.user.id,
          role: member.role as GuildRole
        });
      }
      if (normalizedDisplay) {
        nameLookup.set(normalizedDisplay, preferred);
      }
      if (normalizedNickname) {
        nameLookup.set(normalizedNickname, preferred);
      }
    }

    for (const character of detail.characters ?? []) {
      const preferred = recordPreferred(character.user) || character.user.displayName || character.user.nickname || '';
      if (character.user?.id) {
        setMemberNameHint(character.user.id, preferred);
        if (!map.has(character.user.id)) {
          map.set(character.user.id, preferred);
        }
      }
      const normalizedCharName = normalizeNameKey(character.name);
      if (normalizedCharName && character.user?.id) {
        ownerMap.set(normalizedCharName, {
          userId: character.user.id,
          displayName: preferred || null
        });
        if (!nameLookup.has(normalizedCharName)) {
          nameLookup.set(normalizedCharName, preferred);
        }
      }
      const normalizedDisplay = normalizeNameKey(character.user?.displayName);
      if (normalizedDisplay && !nameLookup.has(normalizedDisplay)) {
        nameLookup.set(normalizedDisplay, preferred);
      }
      const normalizedNickname = normalizeNameKey(character.user?.nickname);
      if (normalizedNickname && !nameLookup.has(normalizedNickname)) {
        nameLookup.set(normalizedNickname, preferred);
      }
    }

    memberDisplayMap.value = map;
    memberDisplayNameLookup.value = nameLookup;
    characterOwnerMap.value = ownerMap;
    guildMemberDirectory.value = memberEntries
      .filter((entry, index, array) =>
        array.findIndex((candidate) => candidate.userId === entry.userId) === index
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  } catch (err) {
    console.error('Unable to load member directory', err);
  }
}

const searchPlaceholder = computed(() =>
  isMemberMode.value ? 'Search members or loot items' : 'Search characters or loot items'
);
const inspectorHeading = computed(() =>
  isMemberMode.value ? 'Member Inspector' : 'Character Inspector'
);
const inspectorLinkMode = computed<'character' | 'plain'>(() =>
  isMemberMode.value ? 'plain' : 'character'
);
const attendanceSummaryText = computed(() =>
  isMemberMode.value
    ? 'Track how often members show up and in what status.'
    : 'Track how often characters show up and in what status.'
);
const attendanceRateTitle = computed(() =>
  isMemberMode.value ? 'Attendance Rate by Member' : 'Attendance Rate by Character'
);
const attendanceSpotlightTitle = computed(() =>
  isMemberMode.value ? 'Member Spotlight' : 'Character Spotlight'
);
const lootSpotlightSubtitle = computed(() =>
  isMemberMode.value ? 'Selected Members' : 'Selected Characters'
);
const shouldLinkEntities = computed(() => !isMemberMode.value);

const isAttendanceSectionVisible = computed(
  () => !maximizedCard.value || attendanceCards.includes(maximizedCard.value)
);
const isLootSectionVisible = computed(
  () => !maximizedCard.value || lootCards.includes(maximizedCard.value)
);

watch(
  () => guildId.value,
  (next) => {
    memberDisplayMap.value = new Map();
    guildMemberDirectory.value = [];
    guildPermissions.value = null;
    if (next) {
      void loadMemberDirectory();
    }
  },
  { immediate: true }
);

function toggleMaximizeCard(card: MaximizableCard) {
  maximizedCard.value = maximizedCard.value === card ? null : card;
}

function isCardMaximized(card: MaximizableCard): boolean {
  return maximizedCard.value === card;
}

function startOfDayUtcIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const utcStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(utcStart).toISOString();
}

function startOfDayLocalIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const localStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return localStart.toISOString();
}

function formatTimelineLabel(iso: string): string {
  return formatRangeDate(startOfDayUtcIso(iso));
}

function formatTimelineDisplay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseIsoToMs(iso?: string | null, floor = false): number | null {
  if (!iso) {
    return null;
  }
  const value = floor ? startOfDayLocalIso(iso) : iso;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return ms;
}

function startOfDayLocalMs(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const STATUS_ORDER = ['PRESENT', 'LATE', 'ABSENT', 'LEFT_EARLY'] as const;
type DisplayAttendanceStatus = (typeof STATUS_ORDER)[number];

const statusLabels: Record<DisplayAttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  LEFT_EARLY: 'Left Early'
};
const statusColors: Record<DisplayAttendanceStatus, { border: string; background: string }> = {
  PRESENT: { border: '#22c55e', background: 'rgba(34,197,94,0.25)' },
  LATE: { border: '#f97316', background: 'rgba(249,115,22,0.2)' },
  ABSENT: { border: '#ef4444', background: 'rgba(239,68,68,0.2)' },
  LEFT_EARLY: { border: '#a855f7', background: 'rgba(168,85,247,0.2)' }
};

const UNKNOWN_MEMBER_LABEL = 'Unknown';
const UNKNOWN_MEMBER_AGGREGATE_KEY = 'unknown';
const UNKNOWN_MEMBER_ENTITY_KEY = 'member:unknown';
const UNKNOWN_MEMBER_BAR_COLOR = '#991b1b';
const UNKNOWN_MEMBER_BAR_BORDER = '#7f1d1d';

const lastSubmittedQuery = ref<GuildMetricsQuery | undefined>(undefined);

const metricsClassSet = computed(() => {
  const set = new Set<string>();
  for (const entry of metrics.value?.filterOptions.classes ?? []) {
    const normalized = normalizeClassValue(entry);
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
});

const characterOptions = computed(() => metrics.value?.filterOptions.characters ?? []);

interface MetricsEntityOption {
  key: string;
  type: MetricsMode;
  label: string;
  class: CharacterClass | null;
  classes: CharacterClass[];
  isMain: boolean;
  characterIds: string[];
  characterNames: string[];
  normalizedCharacterNames: string[];
  userId: string | null;
  userDisplayName: string | null;
}

interface GuildMemberDirectoryEntry {
  userId: string;
  displayName: string;
  role: GuildRole;
}

function normalizeNameKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function setMemberNameHint(userId: string | null, name?: string | null) {
  if (!name) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }

  if (userId) {
    const current = memberDisplayMap.value.get(userId);
    if (current !== trimmed) {
      const cloned = new Map(memberDisplayMap.value);
      cloned.set(userId, trimmed);
      memberDisplayMap.value = cloned;
    }
  }

  const normalized = normalizeNameKey(trimmed);
  if (normalized) {
    const current = memberDisplayNameLookup.value.get(normalized);
    if (current !== trimmed) {
      const cloned = new Map(memberDisplayNameLookup.value);
      cloned.set(normalized, trimmed);
      memberDisplayNameLookup.value = cloned;
    }
  }
}

function resolveMemberPreferredName(
  userId: string | null,
  userDisplayName?: string | null,
  fallbackName?: string | null
): string | null {
  if (userId) {
    const mapped = memberDisplayMap.value.get(userId);
    if (mapped && mapped.trim().length > 0) {
      return mapped.trim();
    }
  }
  const candidates = [userDisplayName, fallbackName];
  for (const name of candidates) {
    if (!name) {
      continue;
    }
    const normalized = normalizeNameKey(name);
    if (normalized) {
      const mapped = memberDisplayNameLookup.value.get(normalized);
      if (mapped && mapped.trim().length > 0) {
        return mapped.trim();
      }
    }
  }
  return (userDisplayName ?? fallbackName)?.trim() || null;
}

function resolveCharacterOwner(
  name: string,
  userId?: string | null,
  userDisplayName?: string | null
): { userId: string | null; userDisplayName: string | null } {
  let resolvedUserId = userId ?? null;
  let resolvedDisplay = userDisplayName ?? null;
  const normalizedName = normalizeNameKey(name);
  if (!resolvedUserId && normalizedName && characterOwnerMap.value.has(normalizedName)) {
    const entry = characterOwnerMap.value.get(normalizedName)!;
    resolvedUserId = entry.userId;
    resolvedDisplay = entry.displayName ?? resolvedDisplay ?? null;
  }
  if (resolvedUserId) {
    setMemberNameHint(resolvedUserId, resolvedDisplay ?? name);
    if (normalizedName) {
      const existing = characterOwnerMap.value.get(normalizedName);
      if (!existing || existing.userId !== resolvedUserId || existing.displayName !== resolvedDisplay) {
        const cloned = new Map(characterOwnerMap.value);
        cloned.set(normalizedName, {
          userId: resolvedUserId,
          displayName: resolvedDisplay ?? null
        });
        characterOwnerMap.value = cloned;
      }
    }
  }
  return {
    userId: resolvedUserId,
    userDisplayName: resolvedDisplay ?? null
  };
}

function memberAggregateKeyFromParts(
  userId: string | null | undefined,
  userDisplayName: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  if (userId) {
    return `user:${userId}`;
  }
  return UNKNOWN_MEMBER_AGGREGATE_KEY;
}

function memberAggregateKeyFromOption(option: MetricsCharacterOption): string {
  return memberAggregateKeyFromParts(option.userId ?? null, option.userDisplayName ?? null, option.name);
}

const characterEntityOptions = computed<MetricsEntityOption[]>(() =>
  characterOptions.value.map((option) => ({
    key: characterOptionKey(option),
    type: 'character' as const,
    label: option.name,
    class: option.class ?? null,
    classes: option.class ? [option.class] : [],
    isMain: Boolean(option.isMain),
    characterIds: option.id ? [option.id] : [],
    characterNames: [option.name],
    normalizedCharacterNames: [option.name.toLowerCase()],
    userId: option.userId ?? null,
    userDisplayName: option.userDisplayName ?? null
  }))
);

interface MemberAggregate {
  key: string;
  label: string;
  userId: string | null;
  userDisplayName: string | null;
  characterIds: Set<string>;
  characterNames: Set<string>;
  classes: Set<CharacterClass>;
  isMain: boolean;
  normalizedCharacterNames: Set<string>;
  preferredMemberName: string | null;
}

function addClassToAggregate(aggregate: MemberAggregate, classValue: CharacterClass | null) {
  if (!classValue) {
    return;
  }
  aggregate.classes.add(classValue);
}

function ensureMemberAggregate(
  aggregates: Map<string, MemberAggregate>,
  userId: string | null,
  userDisplayName: string | null,
  fallbackName: string
) {
  const aggregateKey = memberAggregateKeyFromParts(userId, userDisplayName, fallbackName);
  let aggregate = aggregates.get(aggregateKey);
  if (!aggregate) {
    const preferred = resolveMemberPreferredName(userId, userDisplayName, fallbackName);
    setMemberNameHint(userId, preferred ?? userDisplayName ?? fallbackName);
    aggregate = {
      key: aggregateKey,
      label: preferred ?? userDisplayName ?? fallbackName,
      userId: userId ?? null,
      userDisplayName: preferred ?? userDisplayName ?? null,
      characterIds: new Set<string>(),
      characterNames: new Set<string>(),
      normalizedCharacterNames: new Set<string>(),
      classes: new Set<CharacterClass>(),
      isMain: false,
      preferredMemberName: preferred
    };
    aggregates.set(aggregateKey, aggregate);
  } else {
    if (userId && !aggregate.userId) {
      aggregate.userId = userId;
    }
    if (userDisplayName && !aggregate.userDisplayName) {
      aggregate.userDisplayName = userDisplayName;
    }
    if (userDisplayName) {
      setMemberNameHint(aggregate.userId, userDisplayName);
    }
    const resolved = resolveMemberPreferredName(aggregate.userId, userDisplayName ?? aggregate.userDisplayName, fallbackName);
    if (resolved) {
      setMemberNameHint(aggregate.userId, resolved);
      aggregate.preferredMemberName = resolved;
      aggregate.label = resolved;
      aggregate.userDisplayName = resolved;
    }
  }
  return aggregate;
}

const memberEntityOptions = computed<MetricsEntityOption[]>(() => {
  const aggregates = new Map<string, MemberAggregate>();

  for (const option of characterOptions.value) {
    const owner = resolveCharacterOwner(option.name, option.userId, option.userDisplayName);
    const fallbackLabel = owner.userId
      ? owner.userDisplayName ?? option.userDisplayName ?? option.name
      : UNKNOWN_MEMBER_LABEL;
    const aggregate = ensureMemberAggregate(
      aggregates,
      owner.userId,
      owner.userDisplayName,
      fallbackLabel
    );
    if (option.isMain) {
      aggregate.isMain = true;
    }
    if (option.id) {
      aggregate.characterIds.add(option.id);
    }
    aggregate.characterNames.add(option.name);
    aggregate.normalizedCharacterNames.add(option.name.toLowerCase());
    if (option.class) {
      aggregate.classes.add(option.class);
    }
  }

  const metricsSnapshot = metrics.value;
  if (metricsSnapshot) {
    for (const record of metricsSnapshot.attendanceRecords) {
      const fallbackName = record.character.userDisplayName ?? record.character.name;
      const owner = resolveCharacterOwner(
        record.character.name,
        record.character.userId,
        record.character.userDisplayName
      );
      const fallbackLabel = owner.userId ? owner.userDisplayName ?? fallbackName : UNKNOWN_MEMBER_LABEL;
      const aggregate = ensureMemberAggregate(
        aggregates,
        owner.userId,
        owner.userDisplayName,
        fallbackLabel
      );
      if (record.character.id) {
        aggregate.characterIds.add(record.character.id);
      }
      aggregate.characterNames.add(record.character.name);
      aggregate.normalizedCharacterNames.add(record.character.name.toLowerCase());
      addClassToAggregate(aggregate, normalizeCharacterClass(record.character.class));
      if (record.character.isMain) {
        aggregate.isMain = true;
      }
    }
    for (const event of metricsSnapshot.lootEvents) {
      const normalizedName = event.looterName?.trim();
      if (!normalizedName) {
        continue;
      }
      const normalizedLower = normalizedName.toLowerCase();
      let aggregateMatch: MemberAggregate | undefined;
      for (const aggregate of aggregates.values()) {
        if (aggregate.normalizedCharacterNames.has(normalizedLower)) {
          aggregateMatch = aggregate;
          break;
        }
      }
      if (!aggregateMatch) {
        aggregateMatch = ensureMemberAggregate(aggregates, null, null, UNKNOWN_MEMBER_LABEL);
      }
      aggregateMatch.characterNames.add(normalizedName);
      aggregateMatch.normalizedCharacterNames.add(normalizedLower);
      addClassToAggregate(aggregateMatch, normalizeCharacterClass(event.looterClass));
    }
  }

  for (const aggregate of aggregates.values()) {
    const resolved = resolveMemberPreferredName(
      aggregate.userId,
      aggregate.userDisplayName,
      aggregate.label
    );
    if (resolved) {
      aggregate.preferredMemberName = resolved;
    }
  }

  const merged = new Map<string, MemberAggregate>();
  for (const aggregate of aggregates.values()) {
    const resolved =
      aggregate.preferredMemberName ??
      resolveMemberPreferredName(aggregate.userId, aggregate.userDisplayName, aggregate.label) ??
      aggregate.label;
    const normalizedResolved = normalizeNameKey(resolved);
    const mergeKey = aggregate.userId
      ? `user:${aggregate.userId}`
      : normalizedResolved
        ? `display:${normalizedResolved}`
        : `display:${resolved.toLowerCase()}`;
    let existing = merged.get(mergeKey);
    if (!existing) {
      const newAggregate: MemberAggregate = {
        ...aggregate,
        label: resolved,
        userDisplayName: resolved,
        preferredMemberName: resolved,
        characterIds: new Set(aggregate.characterIds),
        characterNames: new Set(aggregate.characterNames),
        normalizedCharacterNames: new Set(aggregate.normalizedCharacterNames),
        classes: new Set(aggregate.classes)
      };
      merged.set(mergeKey, newAggregate);
      existing = newAggregate;
    } else {
      const target = existing;
      target.label = resolved;
      target.userDisplayName = resolved;
      target.preferredMemberName = resolved;
      if (!target.userId && aggregate.userId) {
        target.userId = aggregate.userId;
      }
      target.isMain = target.isMain || aggregate.isMain;
      aggregate.characterIds.forEach((id) => target.characterIds.add(id));
      aggregate.characterNames.forEach((name) => target.characterNames.add(name));
      aggregate.normalizedCharacterNames.forEach((name) =>
        target.normalizedCharacterNames.add(name)
      );
      aggregate.classes.forEach((cls) => target.classes.add(cls));
      existing = target;
    }
  }

  return Array.from(merged.values())
    .filter((aggregate) => aggregate.userId || aggregate.key === UNKNOWN_MEMBER_AGGREGATE_KEY)
    .map((aggregate) => {
      const classes = Array.from(aggregate.classes);
      const characterNames = Array.from(aggregate.characterNames);
      const displayName =
        aggregate.preferredMemberName ??
        resolveMemberPreferredName(aggregate.userId, aggregate.userDisplayName, aggregate.label) ??
        aggregate.label;
      const normalizedDisplay = normalizeNameKey(displayName);
      let outputKey: string;
      if (aggregate.userId) {
        outputKey = `member:user:${aggregate.userId}`;
      } else if (aggregate.key === UNKNOWN_MEMBER_AGGREGATE_KEY) {
        outputKey = UNKNOWN_MEMBER_ENTITY_KEY;
      } else if (normalizedDisplay) {
        outputKey = `member:display:${normalizedDisplay}`;
      } else {
        outputKey = `member:${aggregate.key}`;
      }
      return {
        key: outputKey,
        type: 'member' as const,
        label: displayName,
        class: classes.length === 1 ? classes[0] : null,
        classes,
        isMain: aggregate.isMain,
        characterIds: Array.from(aggregate.characterIds),
        characterNames,
        normalizedCharacterNames: Array.from(aggregate.normalizedCharacterNames),
        userId: aggregate.userId,
        userDisplayName: displayName
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
});

const memberOptionByAggregateKey = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of memberEntityOptions.value) {
    const normalized = option.key.startsWith('member:')
      ? option.key.slice('member:'.length)
      : option.key;
    map.set(normalized, option);
  }
  return map;
});

const memberOptionByUserId = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of memberEntityOptions.value) {
    if (option.userId) {
      map.set(option.userId, option);
    }
  }
  return map;
});

const memberKeyByCharacterId = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of memberEntityOptions.value) {
    for (const id of option.characterIds) {
      map.set(id, option);
    }
  }
  return map;
});

const memberKeyByCharacterName = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of memberEntityOptions.value) {
    for (const name of option.normalizedCharacterNames) {
      map.set(name, option);
    }
  }
  for (const [normalizedName, owner] of characterOwnerMap.value.entries()) {
    if (!map.has(normalizedName) && owner.userId) {
      const option = memberOptionByUserId.value.get(owner.userId);
      if (option) {
        map.set(normalizedName, option);
      }
    }
  }
  return map;
});

const entityOptions = computed(() =>
  isMemberMode.value ? memberEntityOptions.value : characterEntityOptions.value
);

const entityOptionLookup = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of entityOptions.value) {
    map.set(option.key, option);
  }
  return map;
});

const characterEntityOptionLookup = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of characterEntityOptions.value) {
    map.set(option.key, option);
  }
  return map;
});

const memberEntityOptionLookup = computed(() => {
  const map = new Map<string, MetricsEntityOption>();
  for (const option of memberEntityOptions.value) {
    map.set(option.key, option);
  }
  return map;
});

interface EntityIdentity {
  mode: MetricsMode;
  key: string;
  primaryName: string;
  normalizedPrimaryName: string;
  userId: string | null;
  userDisplayName: string | null;
  normalizedUserDisplayName: string | null;
  characterIds: string[];
  characterNames: string[];
  normalizedCharacterNames: string[];
}

function identityFromEntityOption(option: MetricsEntityOption): EntityIdentity {
  const normalizedPrimary = normalizeNameKey(option.label) ?? option.normalizedCharacterNames[0] ?? option.key;
  return {
    mode: option.type,
    key: option.key,
    primaryName: option.label,
    normalizedPrimaryName: normalizedPrimary ?? option.key.toLowerCase(),
    userId: option.userId,
    userDisplayName: option.userDisplayName,
    normalizedUserDisplayName: normalizeNameKey(option.userDisplayName),
    characterIds: [...option.characterIds],
    characterNames: [...option.characterNames],
    normalizedCharacterNames: [...option.normalizedCharacterNames]
  };
}

function resolveCharacterIdentityByNormalizedName(normalizedName: string): EntityIdentity | null {
  const option =
    characterEntityOptionLookup.value.get(`name:${normalizedName}`) ??
    characterEntityOptionLookup.value.get(`name:${normalizedName.toLowerCase()}`);
  if (option) {
    return identityFromEntityOption(option);
  }
  if (!metrics.value) {
    return null;
  }
  const record = metrics.value.attendanceRecords.find(
    (entry) => entry.character.name.toLowerCase() === normalizedName
  );
  if (record) {
    return identityFromRecord(record, 'character');
  }
  return null;
}

function identityFromRecord(record: AttendanceMetricRecord, mode: MetricsMode): EntityIdentity {
  const baseCharacterId = record.character.id ?? null;
  const baseCharacterName = record.character.name;
  const normalizedName = baseCharacterName.toLowerCase();
  if (mode === 'member') {
    const owner = resolveCharacterOwner(
      record.character.name,
      record.character.userId,
      record.character.userDisplayName
    );
    const isUnknownMember = !owner.userId;
    const aggregateKey = memberAggregateKeyFromParts(
      owner.userId,
      owner.userDisplayName,
      owner.userDisplayName ?? record.character.name
    );
    const option = memberOptionByAggregateKey.value.get(aggregateKey);
    if (option) {
      return identityFromEntityOption(option);
    }
    const resolvedMemberName = isUnknownMember
      ? UNKNOWN_MEMBER_LABEL
      : resolveMemberPreferredName(
          owner.userId,
          owner.userDisplayName,
          record.character.name
        ) ?? owner.userDisplayName ?? record.character.userDisplayName ?? record.character.name;
    const normalizedResolved = normalizeNameKey(resolvedMemberName);
    const memberKey = owner.userId
      ? `member:user:${owner.userId}`
      : UNKNOWN_MEMBER_ENTITY_KEY;
    return {
      mode,
      key: memberKey,
      primaryName: resolvedMemberName,
      normalizedPrimaryName: normalizeNameKey(resolvedMemberName) ?? normalizedName,
      userId: owner.userId,
      userDisplayName: isUnknownMember
        ? UNKNOWN_MEMBER_LABEL
        : owner.userDisplayName ?? record.character.userDisplayName ?? null,
      normalizedUserDisplayName: isUnknownMember
        ? normalizeNameKey(UNKNOWN_MEMBER_LABEL)
        : normalizeNameKey(owner.userDisplayName ?? record.character.userDisplayName),
      characterIds: baseCharacterId ? [baseCharacterId] : [],
      characterNames: [baseCharacterName],
      normalizedCharacterNames: [normalizedName]
    };
  }

  return {
    mode,
    key: baseCharacterId ? `id:${baseCharacterId}` : `name:${normalizedName}`,
    primaryName: baseCharacterName,
    normalizedPrimaryName: normalizedName,
    userId: record.character.userId ?? null,
    userDisplayName: record.character.userDisplayName ?? null,
    normalizedUserDisplayName: normalizeNameKey(record.character.userDisplayName),
    characterIds: baseCharacterId ? [baseCharacterId] : [],
    characterNames: [baseCharacterName],
    normalizedCharacterNames: [normalizedName]
  };
}

function formatEntityLabel(
  option: MetricsEntityOption | undefined,
  fallback: {
    primaryName: string;
    characterNames: string[];
    userDisplayName?: string | null;
    userId?: string | null;
  },
  includeMemberSuffix = false,
  preferMemberName?: boolean
): string {
  const shouldPreferMemberName =
    preferMemberName ?? (option?.type === 'member');
  const memberUserId = option?.userId ?? fallback.userId ?? null;
  let base: string | null = null;

  if (shouldPreferMemberName) {
    base =
      resolveMemberPreferredName(
        memberUserId,
        option?.userDisplayName ?? fallback.userDisplayName ?? null,
        option?.label ?? fallback.primaryName
      ) ?? option?.label ?? fallback.primaryName ?? null;
  } else {
    base = option?.label ?? fallback.primaryName ?? null;
  }

  if (!base || base.trim().length === 0) {
    base = fallback.primaryName;
  }

  if (includeMemberSuffix && (option?.type === 'member' || (shouldPreferMemberName && memberUserId))) {
    const count = option?.characterNames?.length ?? 0;
    const suffixParts = ['Member'];
    if (count > 1) {
      suffixParts.push(`${count} chars`);
    }
    return `${base} (${suffixParts.join(' · ')})`;
  }

  return includeMemberSuffix ? `${base}` : base;
}

function normalizeClassValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

function normalizeCharacterClass(value?: string | null): CharacterClass | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return (ALL_CLASS_VALUES as readonly string[]).includes(normalized)
    ? (normalized as CharacterClass)
    : null;
}

interface ClassIconOption {
  value: string;
  label: string;
  shortLabel: string;
  icon: string | null;
  isAvailable: boolean;
}

const classIconOptions = computed<ClassIconOption[]>(() => {
  const available = metricsClassSet.value;
  return ALL_CLASS_VALUES.map((value) => {
    const shortLabel = characterClassLabels[value] ?? value.slice(0, 3);
    const label = CHARACTER_CLASS_FRIENDLY_NAMES[value] ?? resolveGenericClassLabel(value) ?? value;
    const icon = getCharacterClassIcon(value) ?? null;
    return {
      value,
      label,
      shortLabel,
      icon,
      isAvailable: available.size === 0 ? true : available.has(value)
    };
  });
});

interface LootItemOption {
  name: string;
  count: number;
  searchText: string;
}

const lootItemOptions = computed<LootItemOption[]>(() => {
  if (!metrics.value) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const event of metrics.value.lootEvents) {
    const name = event.itemName;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, searchText: name.toLowerCase() }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
});

interface SearchOptionEntry {
  type: 'character' | 'item';
  value: string;
  label: string;
  description?: string;
  searchText: string;
  normalizedValue: string;
  isMain?: boolean;
}

const searchOptions = computed<SearchOptionEntry[]>(() => {
  const options: SearchOptionEntry[] = [];
  for (const option of entityOptions.value) {
    if (option.type === 'member' && option.key === UNKNOWN_MEMBER_ENTITY_KEY) {
      continue;
    }
    const classLabel =
      option.classes.length === 1 ? resolveClassLabel(option.classes[0]) : null;
    let description: string | null = null;
    if (option.type === 'member') {
      const characterCount = option.characterNames.length;
      if (characterCount > 1) {
        description = `${characterCount} characters`;
      } else {
        description = classLabel ?? 'Single character';
      }
    } else {
      description = classLabel;
    }
    const searchBits = [
      option.label,
      option.userDisplayName,
      ...option.characterNames,
      ...option.classes.map((value) => resolveClassLabel(value) ?? value)
    ]
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => entry.toLowerCase());
    options.push({
      type: 'character',
      value: option.key,
      label: option.label,
      description: description ?? undefined,
      searchText: searchBits.join(' '),
      normalizedValue: option.key.toLowerCase(),
      isMain: option.isMain
    });
  }
  for (const item of lootItemOptions.value) {
    options.push({
      type: 'item',
      value: item.name,
      label: item.name,
      description: item.count === 1 ? '1 award' : `${item.count} awards`,
      searchText: item.searchText,
      normalizedValue: item.searchText
    });
  }
  return options;
});

const filteredSearchOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const selectedCharacterKeys = new Set(selectedCharacters.value);
  const selectedItemSet = new Set(selectedLootItems.value.map((name) => name.toLowerCase()));

  const matches = searchOptions.value.filter((option) => {
    if (option.type === 'character' && selectedCharacterKeys.has(option.value)) {
      return false;
    }
    if (option.type === 'item' && selectedItemSet.has(option.normalizedValue)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return option.searchText.includes(query);
  });

  return matches.slice(0, 8);
});

const showSearchResults = computed(() => {
  const hasMatches = filteredSearchOptions.value.length > 0;
  const shouldShowEmpty = searchQuery.value.trim().length > 0;
  if (searchDropdownSuppressed.value) {
    return false;
  }
  return (searchFocused.value || searchResultsHover.value) && (hasMatches || shouldShowEmpty);
});

watch(filteredSearchOptions, (options) => {
  if (activeSearchIndex.value >= options.length) {
    activeSearchIndex.value = options.length > 0 ? options.length - 1 : -1;
  }
});

watch(searchQuery, () => {
  if (ignoreNextSearchQueryReset.value) {
    ignoreNextSearchQueryReset.value = false;
    return;
  }
  searchDropdownSuppressed.value = false;
  activeSearchIndex.value = -1;
});

function resolveClassLabel(value: CharacterClass | null): string | null {
  if (!value) {
    return null;
  }
  return characterClassLabels[value] ?? value;
}

function resolveGenericClassLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  return (characterClassLabels as Record<string, string>)[upper] ?? value;
}

function characterOptionKey(option: MetricsCharacterOption): string {
  return option.id ? `id:${option.id}` : `name:${option.name.toLowerCase()}`;
}

function classSetHas(value: string): boolean {
  const normalized = normalizeClassValue(value);
  if (!normalized) {
    return false;
  }
  return selectedClassSet.value.has(normalized);
}

function identityKeys(identity: EntityIdentity): string[] {
  const keys = new Set<string>();
  keys.add(identity.key);
  if (identity.mode === 'member') {
    if (identity.userId) {
      keys.add(`member:user:${identity.userId}`);
    }
    if (identity.normalizedUserDisplayName) {
      keys.add(`member:display:${identity.normalizedUserDisplayName}`);
    }
    for (const id of identity.characterIds) {
      keys.add(`member:charid:${id}`);
    }
    for (const name of identity.normalizedCharacterNames) {
      keys.add(`member:char:${name}`);
    }
  } else {
    for (const id of identity.characterIds) {
      keys.add(`id:${id}`);
    }
    for (const name of identity.normalizedCharacterNames) {
      keys.add(`name:${name}`);
    }
  }
  return Array.from(keys);
}

function buildCompositeKeysForIdentity(raidId: string, identity: EntityIdentity): string[] {
  return identityKeys(identity).map((key) => `${raidId}::${key}`);
}

function resolveEntityIdentity(key: string): EntityIdentity | null {
  const direct =
    entityOptionLookup.value.get(key) ??
    characterEntityOptionLookup.value.get(key) ??
    memberEntityOptionLookup.value.get(key);
  if (direct) {
    return identityFromEntityOption(direct);
  }
  if (!metrics.value) {
    return null;
  }
  if (key.startsWith('member:')) {
    const aggregateKey = key.slice('member:'.length);
    const option = memberOptionByAggregateKey.value.get(aggregateKey);
    if (option) {
      return identityFromEntityOption(option);
    }
    const record = metrics.value.attendanceRecords.find((entry) => {
      const candidate = memberAggregateKeyFromParts(
        entry.character.userId,
        entry.character.userDisplayName,
        entry.character.name
      );
      return candidate === aggregateKey;
    });
    if (record) {
      return identityFromRecord(record, 'member');
    }
    return null;
  }
  if (key.startsWith('id:')) {
    const id = key.slice(3);
    const option = characterEntityOptionLookup.value.get(`id:${id}`);
    if (option) {
      return identityFromEntityOption(option);
    }
    const record = metrics.value.attendanceRecords.find((entry) => entry.character.id === id);
    if (record) {
      return identityFromRecord(record, 'character');
    }
    return null;
  }
  if (key.startsWith('name:')) {
    const name = key.slice(5);
    const option = characterEntityOptionLookup.value.get(`name:${name.toLowerCase()}`);
    if (option) {
      return identityFromEntityOption(option);
    }
    const record = metrics.value.attendanceRecords.find(
      (entry) => entry.character.name.toLowerCase() === name.toLowerCase()
    );
    if (record) {
      return identityFromRecord(record, 'character');
    }
    return null;
  }
  return null;
}

const selectedClassSet = computed(() => {
  const set = new Set<string>();
  for (const entry of selectedClasses.value) {
    const normalized = normalizeClassValue(entry);
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
});

watch(selectedClasses, () => {
  const classSet = new Set(selectedClassSet.value);
  if (classSet.size > 0) {
    updateSelectedCharactersFromClasses(classSet);
  }
});

watch(selectedCharacters, () => {
  const classSet = new Set(selectedClassSet.value);
  if (classSet.size > 0) {
    updateSelectedCharactersFromClasses(classSet);
  }
});
const selectedCharacterKeySet = computed(() => new Set(selectedCharacters.value));
const selectedCharacterNameSet = computed(() => {
  const names = new Set<string>();
  const lookup = entityOptionLookup.value;
  for (const key of selectedCharacterKeySet.value) {
    const option = lookup.get(key);
    if (option) {
      for (const name of option.normalizedCharacterNames) {
        names.add(name);
      }
    }
  }
  return names;
});
const selectedLootItemsSet = computed(() => {
  const set = new Set<string>();
  for (const name of selectedLootItems.value) {
    set.add(name.toLowerCase());
  }
  return set;
});

const selectedCharacterChips = computed(() =>
  selectedCharacters.value
    .map((key) => {
      const identity = resolveEntityIdentity(key);
      if (!identity) {
        return null;
      }
      const option =
        entityOptionLookup.value.get(key) ??
        (identity.mode === 'member'
          ? memberEntityOptions.value.find((entry) => entry.key === key)
          : characterEntityOptions.value.find((entry) => entry.key === key));
      const label = formatEntityLabel(
        option,
        {
          primaryName: identity.primaryName,
          characterNames: identity.characterNames,
          userDisplayName: identity.userDisplayName,
          userId: identity.userId ?? null
        },
        false,
        identity.mode === 'member'
      );
      return {
        key,
        label
      };
    })
    .filter((entry): entry is { key: string; label: string } => entry !== null)
);

const selectedEntityIdentities = computed(() =>
  selectedCharacters.value
    .map((key) => resolveEntityIdentity(key))
    .filter((identity): identity is EntityIdentity => identity !== null)
);

const selectedLootItemChips = computed(() =>
  selectedLootItems.value.map((name) => ({
    key: name.toLowerCase(),
    label: name
  }))
);

function isPresentStatus(status: AttendanceStatus): boolean {
  return status === 'PRESENT';
}

interface RaidIdentityAttendanceSnapshot {
  raidId: string;
  identity: EntityIdentity;
  totalEvents: number;
  presentEventKeys: Set<string>;
  presentEventIndices: Set<number>;
  hasPresence: boolean;
  wasLate: boolean;
  leftEarly: boolean;
}

function buildDerivedAttendanceMap(mode: MetricsMode): Map<string, RaidIdentityAttendanceSnapshot> {
  const lookup = new Map<string, RaidIdentityAttendanceSnapshot>();

  if (!metrics.value) {
    return lookup;
  }

  const recordsByRaid = new Map<string, AttendanceMetricRecord[]>();
  for (const record of metrics.value.attendanceRecords) {
    const existing = recordsByRaid.get(record.raid.id);
    if (existing) {
      existing.push(record);
    } else {
      recordsByRaid.set(record.raid.id, [record]);
    }
  }

  for (const [raidId, records] of recordsByRaid.entries()) {
    const sorted = [...records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const eventTimes = Array.from(new Set(sorted.map((record) => record.timestamp))).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    if (eventTimes.length === 0) {
      continue;
    }
    const eventIndexByTime = new Map<string, number>();
    eventTimes.forEach((time, index) => {
      eventIndexByTime.set(time, index);
    });
    const lastEventIndex = eventTimes.length - 1;

    const identityStates = new Map<
      string,
      {
        identity: EntityIdentity;
        presentEventIndices: Set<number>;
        presentEventKeys: Set<string>;
      }
    >();

    for (const record of sorted) {
      const identity = identityFromRecord(record, mode);
      const identityKey = identity.key;
      if (mode === 'member' && !memberEntityOptionLookup.value.has(identityKey)) {
        continue;
      }
      let state = identityStates.get(identityKey);
      if (!state) {
        state = {
          identity,
          presentEventIndices: new Set<number>(),
          presentEventKeys: new Set<string>()
        };
        identityStates.set(identityKey, state);
      } else {
        // Merge additional character information when identities reuse the same key (e.g., Unknown).
        identity.characterIds.forEach((id) => {
          if (!state!.identity.characterIds.includes(id)) {
            state!.identity.characterIds.push(id);
          }
        });
        identity.characterNames.forEach((name) => {
          if (!state!.identity.characterNames.includes(name)) {
            state!.identity.characterNames.push(name);
          }
        });
        identity.normalizedCharacterNames.forEach((name) => {
          if (!state!.identity.normalizedCharacterNames.includes(name)) {
            state!.identity.normalizedCharacterNames.push(name);
          }
        });
      }
      const entry = state!;
      if (!isPresentStatus(record.status)) {
        continue;
      }
      const eventIndex = eventIndexByTime.get(record.timestamp) ?? 0;
      entry.presentEventIndices.add(eventIndex);
      entry.presentEventKeys.add(`${raidId}::${record.timestamp}`);
    }

    for (const { identity, presentEventIndices, presentEventKeys } of identityStates.values()) {
      const hasPresence = presentEventIndices.size > 0;
      const presentAtFirst = hasPresence && presentEventIndices.has(0);
      const presentAtLast = hasPresence && presentEventIndices.has(lastEventIndex);
      const snapshot: RaidIdentityAttendanceSnapshot = {
        raidId,
        identity,
        totalEvents: eventTimes.length,
        presentEventKeys,
        presentEventIndices,
        hasPresence,
        wasLate: hasPresence && !presentAtFirst,
        leftEarly: hasPresence && !presentAtLast
      };
      const compositeKeys = buildCompositeKeysForIdentity(raidId, identity);
      for (const key of compositeKeys) {
        lookup.set(key, snapshot);
      }
    }
  }

  return lookup;
}

const derivedMemberAttendance = computed(() => buildDerivedAttendanceMap('member'));
const derivedCharacterAttendance = computed(() => buildDerivedAttendanceMap('character'));

function getRaidAttendanceSnapshot(
  raidId: string,
  identity: EntityIdentity
): RaidIdentityAttendanceSnapshot | null {
  const compositeKeys = buildCompositeKeysForIdentity(raidId, identity);
  for (const key of compositeKeys) {
    const map =
      identity.mode === 'member' ? derivedMemberAttendance.value : derivedCharacterAttendance.value;
    const snapshot = map.get(key);
    if (snapshot) {
      return snapshot;
    }
  }
  return null;
}

function recordMatchesIdentity(record: AttendanceMetricRecord, identity: EntityIdentity) {
  if (identity.mode === 'member') {
    if (identity.userId && record.character.userId === identity.userId) {
      return true;
    }
    const recordDisplay = normalizeNameKey(record.character.userDisplayName);
    if (identity.normalizedUserDisplayName && recordDisplay === identity.normalizedUserDisplayName) {
      return true;
    }
    const normalizedName = record.character.name.toLowerCase();
    return identity.normalizedCharacterNames.includes(normalizedName);
  }
  if (record.character.id && identity.characterIds.includes(record.character.id)) {
    return true;
  }
  const normalizedName = record.character.name.toLowerCase();
  return identity.normalizedCharacterNames.includes(normalizedName);
}

function lootEventMatchesIdentity(event: LootMetricEvent, identity: EntityIdentity): boolean {
  const normalizedLooter = event.looterName.toLowerCase();
  if (identity.normalizedCharacterNames.includes(normalizedLooter)) {
    return true;
  }
  if (identity.mode === 'member') {
    const option = memberKeyByCharacterName.value.get(normalizedLooter);
    if (option && option.key === identity.key) {
      return true;
    }
  }
  return false;
}

function displayLooterName(event: LootMetricEvent): string {
  if (!isMemberMode.value) {
    return event.looterName;
  }
  const option = memberKeyByCharacterName.value.get(event.looterName.toLowerCase());
  return formatEntityLabel(
    option,
    {
      primaryName: event.looterName,
      characterNames: option?.characterNames ?? [event.looterName],
      userDisplayName: option?.userDisplayName ?? null,
      userId: option?.userId ?? null
    },
    false,
    true
  );
}

const allRaidIds = computed(() => {
  if (!metrics.value) {
    return [] as string[];
  }
  const ids = new Set<string>();
  for (const record of metrics.value.attendanceRecords) {
    ids.add(record.raid.id);
  }
  for (const event of metrics.value.lootEvents) {
    ids.add(event.raid.id);
  }
  return Array.from(ids);
});

const mainCharacterNames = computed(() => {
  const set = new Set<string>();
  if (!metrics.value) {
    return set;
  }
  for (const record of metrics.value.attendanceRecords) {
    if (record.character.isMain) {
      set.add(record.character.name.toLowerCase());
    }
  }
  for (const option of characterOptions.value) {
    if (option.isMain) {
      set.add(option.name.toLowerCase());
    }
  }
  return set;
});

const lootTotals = computed(() => {
  if (!metrics.value) {
    return { main: 0, all: 0 };
  }
  const mainNames = mainCharacterNames.value;
  let mainCount = 0;
  for (const event of metrics.value.lootEvents) {
    if (mainNames.has(event.looterName.toLowerCase())) {
      mainCount += 1;
    }
  }
  return { main: mainCount, all: metrics.value.lootEvents.length };
});

const totalUniqueAttendanceEvents = computed(() => {
  if (!metrics.value) {
    return 0;
  }
  const events = new Set<string>();
  for (const record of metrics.value.attendanceRecords) {
    events.add(`${record.raid.id}::${record.timestamp}`);
  }
  return events.size;
});

const raidEventTotals = computed(() => {
  const map = new Map<string, Set<string>>();
  if (!metrics.value) {
    return new Map<string, number>();
  }
  for (const record of metrics.value.attendanceRecords) {
    const raidId = record.raid.id;
    if (!raidId) {
      continue;
    }
    let timestamps = map.get(raidId);
    if (!timestamps) {
      timestamps = new Set<string>();
      map.set(raidId, timestamps);
    }
    if (record.timestamp) {
      timestamps.add(record.timestamp);
    }
  }
  const totals = new Map<string, number>();
  for (const [raidId, timestamps] of map.entries()) {
    totals.set(raidId, timestamps.size);
  }
  return totals;
});

function aggregateCharacterAttendanceForIdentity(
  identity: EntityIdentity,
  raidIds: string[],
  skipAbsent = false
) {
  const normalizedNames = new Set<string>();
  if (identity.normalizedCharacterNames.length > 0) {
    identity.normalizedCharacterNames.forEach((name) => normalizedNames.add(name.toLowerCase()));
  } else if (identity.normalizedPrimaryName) {
    normalizedNames.add(identity.normalizedPrimaryName.toLowerCase());
  }

  let presentEvents = 0;
  let totalAttendanceEvents = 0;
  let lateRaids = 0;
  let leftEarlyRaids = 0;
  let absentRaids = 0;

  for (const raidId of raidIds) {
    const raidEventCount = raidEventTotals.value.get(raidId) ?? 0;
    let raidHasPresence = false;
    let raidLate = false;
    let raidLeftEarly = false;

    for (const normalizedName of normalizedNames) {
      const characterIdentity =
        identity.mode === 'character' && identity.normalizedPrimaryName?.toLowerCase() === normalizedName
          ? identity
          : resolveCharacterIdentityByNormalizedName(normalizedName);
      if (!characterIdentity) {
        continue;
      }
      const snapshot = getRaidAttendanceSnapshot(raidId, characterIdentity);
      if (!snapshot || !snapshot.hasPresence) {
        continue;
      }
      raidHasPresence = true;
      presentEvents += snapshot.presentEventIndices.size;
      totalAttendanceEvents += snapshot.totalEvents;
      if (snapshot.wasLate) {
        raidLate = true;
      }
      if (snapshot.leftEarly) {
        raidLeftEarly = true;
      }
    }

    if (!raidHasPresence) {
      if (!skipAbsent && raidEventCount > 0) {
        absentRaids += 1;
        totalAttendanceEvents += raidEventCount;
      }
      continue;
    }

    if (raidLate) {
      lateRaids += 1;
    }
    if (raidLeftEarly) {
      leftEarlyRaids += 1;
    }
  }

  return {
    presentEvents,
    totalAttendanceEvents,
    lateRaids,
    leftEarlyRaids,
    absentRaids
  };
}

const characterInspectorEntries = computed(() => {
  if (!metrics.value) {
    return [] as Array<{
      key: string;
      label: string;
      class: CharacterClass | null;
      participationPercent: number;
      lootPercent: number;
      lootCount: number;
      lastLootDate: string | null;
      latePercent: number;
      lateRaidCount: number;
      leftEarlyPercent: number;
      leftEarlyRaidCount: number;
      absentPercent: number;
      presentEvents: number;
      totalAttendanceEvents: number;
      isMain: boolean;
    }>;
  }
  if (selectedCharacters.value.length === 0) {
    return [];
  }

  const raids = allRaidIds.value;
  const totalRaids = raids.length;
  const attendanceRecords = metrics.value.attendanceRecords;
  const lootEvents = filteredLootEvents.value;
  const lootTotalsValue = lootTotals.value;
  const lootDenominator =
    lootTotalsValue.main > 0
      ? lootTotalsValue.main
      : lootTotalsValue.all > 0
        ? lootTotalsValue.all
        : 1;

  return selectedCharacters.value
    .map((key) => {
      const identity = resolveEntityIdentity(key);
      if (!identity) {
        return null;
      }
      if (identity.mode === 'member' && identity.key === UNKNOWN_MEMBER_ENTITY_KEY) {
        return null;
      }
      const option =
        entityOptionLookup.value.get(key) ??
        characterEntityOptionLookup.value.get(key) ??
        memberEntityOptionLookup.value.get(key);
      const label = option?.label ?? identity.primaryName;
      const optionIsMain = option?.isMain ?? false;
      let characterClass: CharacterClass | null = option?.class ?? null;

      const aggregatedStats = aggregateCharacterAttendanceForIdentity(
        identity,
        raids,
        identity.mode === 'member' && identity.key === UNKNOWN_MEMBER_ENTITY_KEY
      );
      let lateRaids = aggregatedStats.lateRaids;
      let leftEarlyRaids = aggregatedStats.leftEarlyRaids;
      let absentRaids =
        identity.mode === 'member' && identity.key === UNKNOWN_MEMBER_ENTITY_KEY
          ? 0
          : aggregatedStats.absentRaids;
      const presentEvents = aggregatedStats.presentEvents;
      const totalAttendanceEventsValue =
        aggregatedStats.totalAttendanceEvents > 0
          ? aggregatedStats.totalAttendanceEvents
          : presentEvents;
      const attendanceDenominator = totalAttendanceEventsValue > 0 ? totalAttendanceEventsValue : 1;

      if (!characterClass) {
        for (const record of attendanceRecords) {
          if (!recordMatchesIdentity(record, identity)) {
            continue;
          }
          if (record.character.class) {
            characterClass = record.character.class;
            break;
          }
        }
      }

      let lootCount = 0;
      let lastLootTimestamp: string | null = null;
      for (const event of lootEvents) {
        if (!lootEventMatchesIdentity(event, identity)) {
          continue;
        }
        if (!characterClass) {
          characterClass = normalizeCharacterClass(event.looterClass);
        }
        lootCount += 1;
        const timestamp = eventPrimaryTimestamp(event);
        if (timestamp && (!lastLootTimestamp || timestamp > lastLootTimestamp)) {
          lastLootTimestamp = timestamp;
        }
      }

      const nameIsMain = identity.normalizedCharacterNames.some((name) =>
        mainCharacterNames.value.has(name)
      );
      const attendanceIsMain = attendanceRecords.some(
        (record) => record.character.isMain && recordMatchesIdentity(record, identity)
      );
      const isMain = optionIsMain || nameIsMain || attendanceIsMain;

      const lootShareCount = lootCount;
      return {
        key,
        label,
        class: characterClass,
        participationPercent: (presentEvents / attendanceDenominator) * 100,
        lootPercent: (lootShareCount / lootDenominator) * 100,
        lootCount,
        lastLootDate: lastLootTimestamp,
        latePercent: totalRaids > 0 ? (lateRaids / totalRaids) * 100 : 0,
        lateRaidCount: lateRaids,
        leftEarlyPercent: totalRaids > 0 ? (leftEarlyRaids / totalRaids) * 100 : 0,
        leftEarlyRaidCount: leftEarlyRaids,
        absentPercent: totalRaids > 0 ? (absentRaids / totalRaids) * 100 : 0,
        presentEvents,
        totalAttendanceEvents: totalAttendanceEventsValue,
        isMain
      };
    })
    .filter(
      (
        entry
      ): entry is {
        key: string;
        label: string;
        participationPercent: number;
        lootPercent: number;
        lootCount: number;
        lastLootDate: string | null;
        latePercent: number;
        lateRaidCount: number;
        leftEarlyPercent: number;
        leftEarlyRaidCount: number;
        absentPercent: number;
        presentEvents: number;
        totalAttendanceEvents: number;
        isMain: boolean;
        class: CharacterClass | null;
      } => entry !== null
    );
});

interface AttendanceCharacterSummary {
  key: string;
  name: string;
  class: CharacterClass | null;
  participationPercent: number;
  presentEvents: number;
  lateRaids: number;
  leftEarlyRaids: number;
  absentRaids: number;
  totalAttendanceEvents: number;
  totalRaids: number;
  userDisplayName: string | null;
}

interface LootParticipantSummary {
  key: string;
  name: string;
  class: string | null;
  count: number;
  lastAwarded: string | null;
}

interface LootItemSummary {
  itemName: string;
  count: number;
  lastAwarded: string | null;
}

interface AttendanceTimelineEntry {
  date: string;
  counts: Record<DisplayAttendanceStatus, number>;
}

interface LootTimelineEntry {
  date: string;
  total: number;
  uniqueLooters: number;
}

interface TimelineMarker {
  start: string;
  end: string;
  label: string | undefined;
  startLabel: string;
  endLabel: string;
}

interface TimelineMarkerWithMs extends TimelineMarker {
  startMs: number;
  endMs: number;
}

const filteredAttendanceRecordsBase = computed<AttendanceMetricRecord[]>(() => {
  const currentMetrics = metrics.value;
  if (!currentMetrics) {
    return [];
  }
  const classSet = selectedClassSet.value;
  const characterSet = selectedCharacterKeySet.value;
  const lootItemsSet = selectedLootItemsSet.value;
  return currentMetrics.attendanceRecords.filter((record) => {
    let identity: EntityIdentity | null = null;
    const ensureIdentity = () => {
      if (!identity) {
        identity = identityFromRecord(record, metricsMode.value);
      }
      return identity!;
    };
    if (classSet.size > 0) {
      const recordClass = record.character.class ? record.character.class.toUpperCase() : null;
      if (!recordClass || !classSet.has(recordClass)) {
        return false;
      }
    }
    if (characterSet.size > 0) {
      const identityValue = ensureIdentity();
      const keys = identityKeys(identityValue);
      const matches = keys.some((key) => characterSet.has(key));
      if (!matches) {
        return false;
      }
    }
    if (lootItemsSet.size > 0) {
      const identityValue = ensureIdentity();
      const identityNames = new Set(identityValue.normalizedCharacterNames);
      const participatesInSelectedLoot = currentMetrics.lootEvents.some((event) => {
        if (!event.itemName) {
          return false;
        }
        if (!lootItemsSet.has(event.itemName.toLowerCase())) {
          return false;
        }
        const normalizedLooter = event.looterName.toLowerCase();
        return (
          identityNames.has(normalizedLooter) ||
          (identityValue.mode === 'member' &&
            memberKeyByCharacterName.value.get(normalizedLooter)?.key === identityValue.key) ||
          selectedCharacterNameSet.value.has(normalizedLooter) ||
          (record.character.id && selectedCharacterKeySet.value.has(`id:${record.character.id}`))
        );
      });
      if (!participatesInSelectedLoot) {
        return false;
      }
    }
    return true;
  });
});

const filteredAttendanceRecords = computed<AttendanceMetricRecord[]>(
  () => filteredAttendanceRecordsBase.value
);

const filteredUniqueAttendanceEventsCount = computed(() => {
  const events = new Set<string>();
  for (const record of filteredAttendanceRecords.value) {
    events.add(`${record.raid.id}::${record.timestamp}`);
  }
  return events.size;
});

const filteredRaidIds = computed(() => {
  const ids = new Set<string>();
  for (const record of filteredAttendanceRecords.value) {
    ids.add(record.raid.id);
  }
  return ids;
});

const filteredLootEvents = computed<LootMetricEvent[]>(() => {
  if (!metrics.value) {
    return [];
  }
  const classSet = selectedClassSet.value;
  const lootItemsSet = selectedLootItemsSet.value;
  const characterNameSet = selectedCharacterNameSet.value;
  return metrics.value.lootEvents.filter((event) => {
    if (classSet.size > 0) {
      const eventClass = event.looterClass ? event.looterClass.toUpperCase() : null;
      if (eventClass && !classSet.has(eventClass)) {
        return false;
      }
    }
    const looterName = event.looterName.toLowerCase();
    if (characterNameSet.size > 0 && !characterNameSet.has(looterName)) {
      return false;
    }
    const itemName = event.itemName.toLowerCase();
    if (lootItemsSet.size > 0 && !lootItemsSet.has(itemName)) {
      return false;
    }
    return true;
  });
});

const attendanceStatusTotals = computed<Record<DisplayAttendanceStatus, number>>(() => {
  const totals: Record<DisplayAttendanceStatus, number> = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    LEFT_EARLY: 0
  };
  for (const entry of attendanceTimelineEntries.value) {
    totals.PRESENT += entry.counts.PRESENT;
    totals.LATE += entry.counts.LATE;
    totals.ABSENT += entry.counts.ABSENT;
    totals.LEFT_EARLY += entry.counts.LEFT_EARLY;
  }
  return totals;
});

const attendanceTimelineEntries = computed<AttendanceTimelineEntry[]>(() => {
  const mode = metricsMode.value;

  if (!isMemberMode.value) {
    const map = new Map<string, AttendanceTimelineEntry>();
    const lateTracker = new Set<string>();
    const leftEarlyTracker = new Set<string>();

    for (const record of filteredAttendanceRecords.value) {
      const baseTimestamp = record.timestamp || record.raid.startTime;
      if (!baseTimestamp) {
        continue;
      }
      const dayKey = baseTimestamp.slice(0, 10);
      if (!map.has(dayKey)) {
        map.set(dayKey, {
          date: dayKey,
          counts: {
            PRESENT: 0,
            LATE: 0,
            ABSENT: 0,
            LEFT_EARLY: 0
          }
        });
      }
      const entry = map.get(dayKey)!;
      const identity = identityFromRecord(record, mode);
      const status = record.status as AttendanceStatus;
      const displayStatus: DisplayAttendanceStatus = status === 'BENCHED' ? 'LEFT_EARLY' : status;

      entry.counts[displayStatus] += 1;

      const snapshot = getRaidAttendanceSnapshot(record.raid.id, identity);
      if (!snapshot) {
        continue;
      }
      const trackerKey = `${dayKey}::${record.raid.id}::${identity.key}`;

      if (snapshot.wasLate && !lateTracker.has(trackerKey)) {
        lateTracker.add(trackerKey);
        if (displayStatus !== 'LATE') {
          entry.counts.LATE += 1;
        }
      }

      if (snapshot.leftEarly && !leftEarlyTracker.has(trackerKey)) {
        leftEarlyTracker.add(trackerKey);
        if (displayStatus !== 'LEFT_EARLY') {
          entry.counts.LEFT_EARLY += 1;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  const memberLookup = memberEntityOptionLookup.value;
  const raidIdentityMap = new Map<string, Map<string, EntityIdentity>>();
  const raidDayMap = new Map<string, string>();

  for (const record of filteredAttendanceRecords.value) {
    const identity = identityFromRecord(record, mode);
    if (!memberLookup.has(identity.key)) {
      continue;
    }
    const raidId = record.raid.id;
    let identityMap = raidIdentityMap.get(raidId);
    if (!identityMap) {
      identityMap = new Map<string, EntityIdentity>();
      raidIdentityMap.set(raidId, identityMap);
    }
    if (!identityMap.has(identity.key)) {
      identityMap.set(identity.key, identity);
    }
    if (!raidDayMap.has(raidId)) {
      const candidate = record.raid.startTime ?? record.timestamp;
      if (candidate) {
        raidDayMap.set(raidId, candidate.slice(0, 10));
      }
    }
  }

  const dayTotals = new Map<
    string,
    {
      present: number;
      late: number;
      leftEarly: number;
      absent: number;
    }
  >();

  for (const [raidId, identityMap] of raidIdentityMap.entries()) {
    const dayKey = raidDayMap.get(raidId);
    if (!dayKey) {
      continue;
    }
    let buckets = dayTotals.get(dayKey);
    if (!buckets) {
      buckets = {
        present: 0,
        late: 0,
        leftEarly: 0,
        absent: 0
      };
      dayTotals.set(dayKey, buckets);
    }

    for (const identity of identityMap.values()) {
      if (identity.key === UNKNOWN_MEMBER_ENTITY_KEY) {
        const processed = new Set<string>();
        for (const normalizedName of identity.normalizedCharacterNames) {
          const lower = normalizedName.toLowerCase();
          if (processed.has(lower)) {
            continue;
          }
          processed.add(lower);
          const characterIdentity = resolveCharacterIdentityByNormalizedName(lower);
          if (!characterIdentity) {
            continue;
          }
          const characterSnapshot = getRaidAttendanceSnapshot(raidId, characterIdentity);
          if (!characterSnapshot || !characterSnapshot.hasPresence) {
            continue;
          }
          buckets.present += 1;
          if (characterSnapshot.wasLate) {
            buckets.late += 1;
          }
          if (characterSnapshot.leftEarly) {
            buckets.leftEarly += 1;
          }
        }
        continue;
      }

      const processedMemberChars = new Set<string>();
      const targetNames = identity.normalizedCharacterNames.length
        ? identity.normalizedCharacterNames
        : [identity.normalizedPrimaryName];

      for (const normalizedName of targetNames) {
        const lower = normalizedName.toLowerCase();
        if (processedMemberChars.has(lower)) {
          continue;
        }
        processedMemberChars.add(lower);
        const characterIdentity = resolveCharacterIdentityByNormalizedName(lower);
        if (!characterIdentity) {
          continue;
        }
        const characterSnapshot = getRaidAttendanceSnapshot(raidId, characterIdentity);
        if (!characterSnapshot || !characterSnapshot.hasPresence) {
          const raidEventCount = raidEventTotals.value.get(raidId) ?? 0;
          if (raidEventCount > 0) {
            buckets.absent += 1;
          }
          continue;
        }
        buckets.present += 1;
        if (characterSnapshot.wasLate) {
          buckets.late += 1;
        }
        if (characterSnapshot.leftEarly) {
          buckets.leftEarly += 1;
        }
      }
    }
  }

  return Array.from(dayTotals.entries())
    .map(([date, buckets]) => ({
      date,
      counts: {
        PRESENT: buckets.present,
        LATE: buckets.late,
        ABSENT: buckets.absent,
        LEFT_EARLY: buckets.leftEarly
      }
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
});

const attendanceTimelineChartData = computed(() => {
  const entries = attendanceTimelineEntries.value;
  const labels = entries.map((entry) => formatDateLabel(entry.date));
  const datasets = STATUS_ORDER.map((status) => ({
    label: statusLabels[status],
    data: entries.map((entry) => entry.counts[status]),
    borderColor: statusColors[status].border,
    backgroundColor: statusColors[status].background,
    fill: true,
    tension: 0.35
  }));
  return { labels, datasets };
});

const attendanceTimelineChartOptions = computed(() => ({
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  }
}));

const attendanceTimelineHasData = computed(
  () =>
    attendanceTimelineChartData.value.datasets.length > 0 &&
    attendanceTimelineChartData.value.datasets.some((dataset) =>
      dataset.data.some((value) => value > 0)
    )
);

function attendanceRateValue(entry: AttendanceCharacterSummary): number {
  return entry.participationPercent;
}

const attendanceByCharacterSummaries = computed<AttendanceCharacterSummary[]>(() => {
  const records = filteredAttendanceRecords.value;
  if (records.length === 0) {
    return [];
  }

  const summaries = new Map<
    string,
    AttendanceCharacterSummary & { identity: EntityIdentity; presentEventSet: Set<string> }
  >();
  const mode = metricsMode.value;
  const entityLookup = mode === 'member' ? memberEntityOptions.value : characterEntityOptions.value;
  const entityMap = new Map<string, MetricsEntityOption>();
  for (const option of entityLookup) {
    entityMap.set(option.key, option);
  }

  for (const record of records) {
    const identity = identityFromRecord(record, mode);
    const key = identity.key;
    const option = entityMap.get(key);

    if (mode === 'member' && !option) {
      continue;
    }

    let entry = summaries.get(key);
    if (!entry) {
      let initialClass: CharacterClass | null = null;
      if (mode === 'member') {
        if (option && option.classes.length === 1) {
          initialClass = option.classes[0];
        }
      } else {
        initialClass = option?.class ?? record.character.class ?? null;
      }
      if (!initialClass && record.character.class && mode !== 'member') {
        initialClass = record.character.class;
      }
      const displayName = formatEntityLabel(
        option,
        {
          primaryName: identity.primaryName,
          characterNames: identity.characterNames,
          userDisplayName: identity.userDisplayName,
          userId: identity.userId ?? null
        },
        false,
        mode === 'member'
      );
      entry = {
        key,
        name: displayName,
        class: initialClass,
        participationPercent: 0,
        presentEvents: 0,
        lateRaids: 0,
        leftEarlyRaids: 0,
        absentRaids: 0,
        totalAttendanceEvents: 0,
        totalRaids: 0,
        userDisplayName: option?.userDisplayName ?? identity.userDisplayName,
        identity,
        presentEventSet: new Set<string>()
      };
      summaries.set(key, entry);
    }

    const optionForUpdate = entityMap.get(key);
    if (optionForUpdate) {
      entry.name = formatEntityLabel(
        optionForUpdate,
        {
          primaryName: identity.primaryName,
          characterNames: identity.characterNames,
          userDisplayName: identity.userDisplayName,
          userId: identity.userId ?? null
        },
        false,
        mode === 'member'
      );
    }
    if (mode === 'member' && optionForUpdate && optionForUpdate.classes.length === 1) {
      entry.class = optionForUpdate.classes[0];
    }
    if (!entry.class && record.character.class && mode !== 'member') {
      entry.class = record.character.class;
    }
    if (!entry.userDisplayName && record.character.userDisplayName) {
      entry.userDisplayName = record.character.userDisplayName;
    }
    if (record.status === 'PRESENT') {
      const eventKey = `${record.raid.id}::${record.timestamp}`;
      entry.presentEventSet.add(eventKey);
    }
  }

  const raidIds = Array.from(filteredRaidIds.value);
  const totalAttendanceEvents = filteredUniqueAttendanceEventsCount.value;
  for (const entry of summaries.values()) {
    if (mode === 'member') {
      const aggregated = aggregateCharacterAttendanceForIdentity(
        entry.identity,
        raidIds,
        entry.key === UNKNOWN_MEMBER_ENTITY_KEY
      );
      entry.lateRaids = aggregated.lateRaids;
      entry.leftEarlyRaids = aggregated.leftEarlyRaids;
      entry.absentRaids = entry.key === UNKNOWN_MEMBER_ENTITY_KEY ? 0 : aggregated.absentRaids;
      entry.totalRaids = raidIds.length;
      entry.presentEvents = aggregated.presentEvents;
      entry.totalAttendanceEvents =
        aggregated.totalAttendanceEvents > 0 ? aggregated.totalAttendanceEvents : aggregated.presentEvents;
      const denom = entry.totalAttendanceEvents > 0 ? entry.totalAttendanceEvents : entry.presentEvents;
      entry.participationPercent = denom > 0 ? (entry.presentEvents / denom) * 100 : 0;
      entry.presentEventSet = new Set<string>();
      continue;
    }

    let late = 0;
    let leftEarly = 0;
    let absent = 0;
    for (const raidId of raidIds) {
      const snapshot = getRaidAttendanceSnapshot(raidId, entry.identity);
      if (!snapshot || !snapshot.hasPresence) {
        absent += 1;
        continue;
      }
      if (snapshot.wasLate) {
        late += 1;
      }
      if (snapshot.leftEarly) {
        leftEarly += 1;
      }
    }
    entry.lateRaids = late;
    entry.leftEarlyRaids = leftEarly;
    entry.absentRaids = absent;
    entry.totalRaids = raidIds.length;
    const presentEventCount = entry.presentEventSet ? entry.presentEventSet.size : 0;
    entry.presentEvents = presentEventCount;
    entry.totalAttendanceEvents = totalAttendanceEvents;
    const denom = totalAttendanceEvents > 0 ? totalAttendanceEvents : presentEventCount;
    entry.participationPercent = denom > 0 ? (presentEventCount / denom) * 100 : 0;
    entry.presentEventSet = new Set<string>();
  }

  const summariesList: AttendanceCharacterSummary[] = [];
  for (const entry of summaries.values()) {
    const { identity: _ignored, presentEventSet: _ignoredSet, ...rest } = entry;
    summariesList.push(rest);
  }

  const sorted = summariesList.sort((a, b) => {
    const diff = attendanceRateValue(b) - attendanceRateValue(a);
    if (diff !== 0) {
      return diff;
    }
    if (b.presentEvents !== a.presentEvents) {
      return b.presentEvents - a.presentEvents;
    }
    return b.totalAttendanceEvents - a.totalAttendanceEvents;
  });

  const unknownIndex = sorted.findIndex((entry) => entry.key === UNKNOWN_MEMBER_ENTITY_KEY);
  if (unknownIndex > -1) {
  const [unknownEntry] = sorted.splice(unknownIndex, 1);
  sorted.push(unknownEntry);
  }

  return sorted;
});

const unknownMemberCharacterDetails = computed<AttendanceCharacterSummary[]>(() => {
  if (!isMemberMode.value) {
    return [];
  }
  const option = memberEntityOptionLookup.value.get(UNKNOWN_MEMBER_ENTITY_KEY);
  if (!option) {
    return [];
  }

  const identityMap = new Map<string, EntityIdentity>();

  for (const characterId of option.characterIds) {
    const identity = resolveEntityIdentity(`id:${characterId}`);
    if (identity && identity.mode === 'character') {
      identityMap.set(identity.key, identity);
    }
  }

  for (const normalized of option.normalizedCharacterNames) {
    if (!normalized) {
      continue;
    }
    const identity = resolveCharacterIdentityByNormalizedName(normalized);
    if (identity && identity.mode === 'character') {
      identityMap.set(identity.key, identity);
    }
  }

  for (const record of filteredAttendanceRecords.value) {
    const memberIdentity = identityFromRecord(record, 'member');
    if (memberIdentity.key !== UNKNOWN_MEMBER_ENTITY_KEY) {
      continue;
    }
    const characterIdentity = identityFromRecord(record, 'character');
    identityMap.set(characterIdentity.key, characterIdentity);
  }

  if (identityMap.size === 0) {
    return [];
  }

  const raidIds = Array.from(filteredRaidIds.value);
  const summaries: AttendanceCharacterSummary[] = [];

  for (const identity of identityMap.values()) {
    const aggregated = aggregateCharacterAttendanceForIdentity(identity, raidIds);
    const totalAttendanceEventsValue =
      aggregated.totalAttendanceEvents > 0 ? aggregated.totalAttendanceEvents : aggregated.presentEvents;
    if (aggregated.presentEvents === 0 && totalAttendanceEventsValue === 0) {
      continue;
    }
    const denominator = totalAttendanceEventsValue > 0 ? totalAttendanceEventsValue : aggregated.presentEvents;
    const participationPercent = denominator > 0 ? (aggregated.presentEvents / denominator) * 100 : 0;

    const optionMatch =
      characterEntityOptionLookup.value.get(identity.key) ??
      (identity.normalizedPrimaryName
        ? characterEntityOptionLookup.value.get(`name:${identity.normalizedPrimaryName}`)
        : undefined);

    let classValue = optionMatch?.class ?? null;
    if (!classValue) {
      const recordWithClass = filteredAttendanceRecords.value.find((entry) => {
        if (!entry.character.class) {
          return false;
        }
        const entryIdentity = identityFromRecord(entry, 'character');
        return entryIdentity.key === identity.key;
      });
      if (recordWithClass?.character.class) {
        classValue = normalizeCharacterClass(recordWithClass.character.class);
      }
    }

    const nameLabel = optionMatch?.label ?? identity.primaryName;

    summaries.push({
      key: identity.key,
      name: nameLabel,
      class: classValue,
      participationPercent,
      presentEvents: aggregated.presentEvents,
      lateRaids: aggregated.lateRaids,
      leftEarlyRaids: aggregated.leftEarlyRaids,
      absentRaids: aggregated.absentRaids,
      totalAttendanceEvents: totalAttendanceEventsValue,
      totalRaids: raidIds.length,
      userDisplayName: identity.userDisplayName
    });
  }

  return summaries.sort((a, b) => {
    const diff = attendanceRateValue(b) - attendanceRateValue(a);
    if (diff !== 0) {
      return diff;
    }
    if (b.presentEvents !== a.presentEvents) {
      return b.presentEvents - a.presentEvents;
    }
    return a.name.localeCompare(b.name);
  });
});

const topAttendanceCharacters = computed(() => {
  const limit = maximizedCard.value === 'attendanceByCharacter' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  const summaries = attendanceByCharacterSummaries.value;
  if (summaries.length <= limit) {
    return summaries;
  }
  const slice = summaries.slice(0, limit);
  const hasUnknown = slice.some((entry) => entry.key === UNKNOWN_MEMBER_ENTITY_KEY);
  if (hasUnknown) {
    return slice;
  }
  const unknownEntry = summaries.find((entry) => entry.key === UNKNOWN_MEMBER_ENTITY_KEY);
  if (!unknownEntry) {
    return slice;
  }
  // Replace the last entry with Unknown to keep bar anchored at bottom.
  const adjusted = slice.slice(0, limit - 1);
  adjusted.push(unknownEntry);
  return adjusted;
});

const attendanceByCharacterChartData = computed(() => {
  const entries = topAttendanceCharacters.value;
  const backgroundColors = entries.map((entry) =>
    entry.key === UNKNOWN_MEMBER_ENTITY_KEY ? UNKNOWN_MEMBER_BAR_COLOR : '#38bdf8'
  );
  const borderColors = entries.map((entry) =>
    entry.key === UNKNOWN_MEMBER_ENTITY_KEY ? UNKNOWN_MEMBER_BAR_BORDER : '#0ea5e9'
  );
  const hoverBackgroundColors = entries.map((entry, index) => backgroundColors[index]);
  return {
    labels: entries.map((entry) => entry.name),
    datasets: [
      {
        label: 'Raid Participation (%)',
        data: entries.map((entry) => Number(attendanceRateValue(entry).toFixed(1))),
        backgroundColor: backgroundColors,
        hoverBackgroundColor: hoverBackgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6
      }
    ]
  };
});

const attendanceByCharacterChartOptions = computed(() => {
  return {
    indexAxis: 'y' as const,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      axis: 'y' as const,
      intersect: true
    },
    hover: {
      mode: 'nearest' as const,
      intersect: true
    },
    animation: {
      duration: 0
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: {
          callback(value: number | string) {
            return `${value}%`;
          }
        }
      }
    },
    onClick(_event: unknown, elements: any[]) {
      if (!isMemberMode.value) {
        return;
      }
      if (!elements || elements.length === 0) {
        return;
      }
      const element = elements[0];
      if (typeof element?.index !== 'number') {
        return;
      }
      const entry = topAttendanceCharacters.value[element.index];
      if (!entry || entry.key !== UNKNOWN_MEMBER_ENTITY_KEY) {
        return;
      }
      if (unknownMemberCharacterDetails.value.length === 0) {
        return;
      }
      openUnknownMemberModal();
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context: any) {
            const entries = topAttendanceCharacters.value;
            const index = context.dataIndex as number;
            const entry = entries[index];
            const value =
              typeof context.parsed.x === 'number' ? context.parsed.x : Number(context.parsed);
            if (!entry) {
              return `${value.toFixed(1)}% participation`;
            }
            return [
              `Participation: ${value.toFixed(1)}%`,
              `Present Events: ${entry.presentEvents}`,
              `Late Raids: ${entry.lateRaids}`,
              `Left Early Raids: ${entry.leftEarlyRaids}`,
              `Absent Raids: ${entry.absentRaids}`,
              `Raids Considered: ${entry.totalRaids}`
            ];
          }
        }
      }
    }
  };
});

const attendanceByCharacterHasData = computed(
  () =>
    attendanceByCharacterChartData.value.datasets[0]?.data?.length &&
    attendanceByCharacterChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const canAssignUnknownCharacters = computed(() => {
  const role = guildPermissions.value?.userRole ?? null;
  if (!role) {
    return false;
  }
  return role === 'LEADER' || role === 'OFFICER' || role === 'RAID_LEADER';
});

const assignableGuildMembers = computed(() => guildMemberDirectory.value);

const shouldShowUnknownMemberHint = computed(() => {
  if (!isMemberMode.value) {
    return false;
  }
  if (unknownMemberCharacterDetails.value.length === 0) {
    return false;
  }
  return topAttendanceCharacters.value.some((entry) => entry.key === UNKNOWN_MEMBER_ENTITY_KEY);
});

watch(isMemberMode, (value) => {
  if (!value) {
    showUnknownMemberModal.value = false;
    resetUnknownAssignmentState();
  }
});

watch(
  () => unknownMemberCharacterDetails.value.length,
  (length) => {
    if (length === 0) {
      showUnknownMemberModal.value = false;
      resetUnknownAssignmentState();
    }
  }
);

watch(showUnknownMemberModal, (visible) => {
  if (!visible) {
    resetUnknownAssignmentState();
  }
});

watch(metricsMode, () => {
  showLootDetailModal.value = false;
  lootDetailTarget.value = null;
  lootDetailPage.value = 0;
});

watch(showLootDetailModal, (visible) => {
  if (!visible) {
    lootDetailTarget.value = null;
    lootDetailPage.value = 0;
  }
});

watch(lootDetailTarget, () => {
  lootDetailPage.value = 0;
});


function openUnknownMemberModal() {
  if (unknownMemberCharacterDetails.value.length === 0) {
    return;
  }
  unknownAssignmentError.value = null;
  showUnknownMemberModal.value = true;
}

function closeUnknownMemberModal() {
  resetUnknownAssignmentState();
  showUnknownMemberModal.value = false;
}

function resetUnknownAssignmentState() {
  assigningUnknownCharacterKey.value = null;
  unknownAssignment.memberUserId = '';
  unknownAssignmentError.value = null;
  unknownAssignmentLoading.value = false;
}

function beginUnknownCharacterAssignment(entry: AttendanceCharacterSummary) {
  if (!canAssignUnknownCharacters.value) {
    return;
  }
  assigningUnknownCharacterKey.value = entry.key;
  unknownAssignment.memberUserId = '';
  unknownAssignmentError.value = null;
  unknownAssignmentLoading.value = false;
}

function cancelUnknownCharacterAssignment() {
  assigningUnknownCharacterKey.value = null;
  unknownAssignment.memberUserId = '';
  unknownAssignmentError.value = null;
  unknownAssignmentLoading.value = false;
}

async function assignUnknownCharacterToMember(entry: AttendanceCharacterSummary) {
  if (!guildId.value) {
    unknownAssignmentError.value = 'Missing guild context. Reload and try again.';
    return;
  }
  if (!unknownAssignment.memberUserId) {
    unknownAssignmentError.value = 'Select a member to assign this character to.';
    return;
  }
  if (!entry.class) {
    unknownAssignmentError.value = 'Character class is missing. Please update attendance data.';
    return;
  }

  unknownAssignmentLoading.value = true;
  unknownAssignmentError.value = null;
  try {
    await api.assignGuildMemberCharacter(guildId.value, unknownAssignment.memberUserId, {
      name: entry.name.trim(),
      class: entry.class,
      level: 60
    });
    await loadMemberDirectory();
    await loadMetrics(lastSubmittedQuery.value);
    resetUnknownAssignmentState();
  } catch (error) {
    unknownAssignmentError.value = resolveApiErrorMessage(error, 'Unable to assign character.');
  } finally {
    unknownAssignmentLoading.value = false;
  }
}

function resolveLootDetailIdentity(entry: LootParticipantSummary): EntityIdentity | null {
  let identity = resolveEntityIdentity(entry.key);
  if (identity) {
    return identity;
  }
  const normalized = entry.name.toLowerCase();
  identity = resolveEntityIdentity(`name:${normalized}`);
  if (identity) {
    return identity;
  }
  const memberOption = memberEntityOptionLookup.value.get(entry.key);
  if (memberOption) {
    return identityFromEntityOption(memberOption);
  }
  const characterOption = characterEntityOptionLookup.value.get(`name:${normalized}`);
  if (characterOption) {
    return identityFromEntityOption(characterOption);
  }
  return null;
}

function openLootDetailModal(entry: LootParticipantSummary) {
  const identity = resolveLootDetailIdentity(entry);
  lootDetailTarget.value = {
    entry,
    identity
  };
  lootDetailPage.value = 0;
  showLootDetailModal.value = true;
}

function closeLootDetailModal() {
  showLootDetailModal.value = false;
  lootDetailTarget.value = null;
  lootDetailPage.value = 0;
}

function openAllaSearch(itemName: string) {
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const url = `${base}&iname=${encodeURIComponent(itemName)}`;
  window.open(url, '_blank');
}

function goToPreviousLootDetailPage() {
  if (lootDetailPage.value > 0) {
    lootDetailPage.value -= 1;
  }
}

function goToNextLootDetailPage() {
  if (lootDetailPageCount.value === 0) {
    return;
  }
  if (lootDetailPage.value < lootDetailPageCount.value - 1) {
    lootDetailPage.value += 1;
  }
}

const attendanceSpotlight = computed(() => {
  if (selectedCharacterKeySet.value.size === 0) {
    return [];
  }
  const filterKeys = selectedCharacterKeySet.value;
  return attendanceByCharacterSummaries.value.filter((entry) => filterKeys.has(entry.key));
});

const lootTimelineEntries = computed<LootTimelineEntry[]>(() => {
  const map = new Map<string, { date: string; total: number; looters: Set<string> }>();
  for (const event of filteredLootEvents.value) {
    const timestamp = eventPrimaryTimestamp(event);
    if (!timestamp) {
      continue;
    }
    const dayKey = timestamp.slice(0, 10);
    if (!map.has(dayKey)) {
      map.set(dayKey, { date: dayKey, total: 0, looters: new Set<string>() });
    }
    const entry = map.get(dayKey)!;
    entry.total += 1;
    entry.looters.add(event.looterName.toLowerCase());
  }
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      total: entry.total,
      uniqueLooters: entry.looters.size
    }));
});

const lootTimelineChartData = computed(() => {
  const entries = lootTimelineEntries.value;
  const labels = entries.map((entry) => formatDateLabel(entry.date));
  return {
    labels,
    datasets: [
      {
        label: 'Loot Items',
        data: entries.map((entry) => entry.total),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.25)',
        fill: true,
        tension: 0.35
      },
      {
        label: 'Unique Looters',
        data: entries.map((entry) => entry.uniqueLooters),
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.2)',
        fill: false,
        tension: 0.35,
        yAxisID: 'y1',
        borderDash: [6, 4]
      }
    ]
  };
});

const lootTimelineChartOptions = computed(() => ({
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    },
    y1: {
      beginAtZero: true,
      position: 'right' as const,
      grid: { drawOnChartArea: false },
      ticks: { precision: 0 }
    }
  }
}));

const lootTimelineHasData = computed(() =>
  lootTimelineChartData.value.datasets.some((dataset) =>
    dataset.data.some((value) => Number(value) > 0)
  )
);

const lootByParticipantSummaries = computed<LootParticipantSummary[]>(() => {
  const mode = metricsMode.value;
  const map = new Map<
    string,
    {
      summary: LootParticipantSummary;
      classes: Set<string>;
    }
  >();

  for (const event of filteredLootEvents.value) {
    const normalizedName = event.looterName.toLowerCase();
    const normalizedEventClass = normalizeCharacterClass(event.looterClass);

    let mapKey = normalizedName;
    let associatedOption: MetricsEntityOption | undefined = memberKeyByCharacterName.value.get(normalizedName);
    let owner = resolveCharacterOwner(event.looterName, associatedOption?.userId, associatedOption?.userDisplayName);

    let resolvedCharacterIdentity: EntityIdentity | null = null;
    if (mode === 'character') {
      if (associatedOption?.key === UNKNOWN_MEMBER_ENTITY_KEY) {
        associatedOption = undefined;
      }
      resolvedCharacterIdentity = resolveEntityIdentity(`name:${normalizedName}`);
      if (!resolvedCharacterIdentity || resolvedCharacterIdentity.mode !== 'character') {
        // Fall back to lookup by event character id if available
        const option = characterEntityOptionLookup.value.get(`name:${normalizedName}`);
        if (option) {
          resolvedCharacterIdentity = identityFromEntityOption(option);
        }
      }
      if (!resolvedCharacterIdentity || resolvedCharacterIdentity.mode !== 'character') {
        continue;
      }
      mapKey = resolvedCharacterIdentity.key;
    }

    if (mode === 'member') {
      let targetOption: MetricsEntityOption | undefined = associatedOption;
      if (owner.userId) {
        const optionByUser = memberOptionByUserId.value.get(owner.userId);
        if (optionByUser) {
          targetOption = optionByUser;
        }
      }
      if (!owner.userId && !targetOption) {
        targetOption = memberEntityOptionLookup.value.get(UNKNOWN_MEMBER_ENTITY_KEY);
      }
      if (!targetOption) {
        continue;
      }
      associatedOption = targetOption;
      mapKey = targetOption.key;
      owner = resolveCharacterOwner(
        event.looterName,
        targetOption.userId ?? owner.userId,
        targetOption.userDisplayName ?? owner.userDisplayName
      );
    }

    const fallbackLabelInfo = {
      primaryName: event.looterName,
      characterNames: associatedOption?.characterNames ?? [event.looterName],
      userDisplayName: owner.userDisplayName ?? associatedOption?.userDisplayName ?? null,
      userId: owner.userId ?? associatedOption?.userId ?? null
    };
    const displayLabel = formatEntityLabel(associatedOption, fallbackLabelInfo, false, mode === 'member');
    let initialClass: string | null = normalizedEventClass ?? null;
    if (mode === 'member' && associatedOption && associatedOption.classes.length === 1) {
      initialClass = associatedOption.classes[0];
    }

    let entry = map.get(mapKey);
    if (!entry) {
      entry = {
        summary: {
          key: mapKey,
          name: displayLabel,
          class: initialClass,
          count: 0,
          lastAwarded: null
        },
        classes: new Set<string>()
      };
      if (initialClass) {
        entry.classes.add(initialClass);
      }
      map.set(mapKey, entry);
    }

    entry.summary.count += 1;
    const timestamp = eventPrimaryTimestamp(event);
    if (timestamp && (!entry.summary.lastAwarded || timestamp > entry.summary.lastAwarded)) {
      entry.summary.lastAwarded = timestamp;
    }
    if (normalizedEventClass) {
      entry.classes.add(normalizedEventClass);
    }
    if (associatedOption) {
      entry.summary.name = formatEntityLabel(associatedOption, fallbackLabelInfo, false, mode === 'member');
      if (mode === 'member') {
        entry.summary.key = associatedOption.key;
      }
      for (const cls of associatedOption.classes) {
        entry.classes.add(cls);
      }
    }

    if (mode === 'character' && resolvedCharacterIdentity) {
      entry.summary.key = resolvedCharacterIdentity.key;
      const optionForCharacter = characterEntityOptionLookup.value.get(resolvedCharacterIdentity.key);
      if (optionForCharacter) {
        entry.summary.name = optionForCharacter.label;
        for (const cls of optionForCharacter.classes) {
          entry.classes.add(cls);
        }
      }
    }
  }

  const summaries = Array.from(map.values())
    .filter(({ summary }) => {
      if (mode === 'character') {
        const identity = resolveEntityIdentity(summary.key);
        return identity?.mode === 'character';
      }
      return true;
    })
    .map(({ summary, classes }) => {
      if (classes.size === 1) {
        summary.class = Array.from(classes)[0];
      } else if (classes.size > 1) {
        summary.class = null;
      }
      return summary;
    });

  return summaries.sort((a, b) => b.count - a.count);
});

const topLootParticipants = computed(() => {
  const limit = maximizedCard.value === 'lootByParticipant' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  return lootByParticipantSummaries.value.slice(0, limit);
});

const lootByParticipantChartData = computed(() => {
  const entries = topLootParticipants.value;
  return {
    labels: entries.map((entry) => entry.name),
    datasets: [
      {
        label: 'Items Awarded',
        data: entries.map((entry) => entry.count),
        backgroundColor: entries.map(() => '#c084fc'),
        borderRadius: 6
      }
    ]
  };
});

const lootByParticipantChartOptions = computed(() => ({
  maintainAspectRatio: false,
  onClick(_event: unknown, elements: any[]) {
    if (!elements || elements.length === 0) {
      return;
    }
    const element = elements[0];
    if (typeof element?.index !== 'number') {
      return;
    }
    const entry = topLootParticipants.value[element.index];
    if (!entry) {
      return;
    }
    openLootDetailModal(entry);
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  },
  plugins: {
    legend: { display: false }
  }
}));

const lootByParticipantHasData = computed(
  () =>
    lootByParticipantChartData.value.datasets[0]?.data?.length &&
    lootByParticipantChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const lootDetailRows = computed(() => {
  const target = lootDetailTarget.value;
  if (!target) {
    return [] as Array<{
      id: string;
      itemName: string;
      looterName: string;
      raidId: string;
      raidName: string;
      raidStart: string | null;
      awardedAt: string | null;
    }>;
  }
  const { identity, entry } = target;
  const rows = filteredLootEvents.value
    .filter((event) =>
      identity
        ? lootEventMatchesIdentity(event, identity)
        : event.looterName.toLowerCase() === entry.name.toLowerCase()
    )
    .map((event) => ({
      id: event.id,
      itemName: event.itemName,
      looterName: event.looterName,
      raidId: event.raid.id,
      raidName: event.raid.name,
      raidStart: event.raid.startTime,
      awardedAt: eventPrimaryTimestamp(event)
    }))
    .sort((a, b) => {
      const aStamp = a.awardedAt ?? '';
      const bStamp = b.awardedAt ?? '';
      return bStamp.localeCompare(aStamp);
    });
  return rows;
});

const lootDetailModalTitle = computed(() => lootDetailTarget.value?.entry.name ?? '');
const lootDetailModalCount = computed(() => lootDetailRows.value.length);
const lootDetailPageCount = computed(() =>
  lootDetailModalCount.value === 0
    ? 0
    : Math.ceil(lootDetailModalCount.value / LOOT_DETAIL_PAGE_SIZE)
);

const visibleLootDetailRows = computed(() => {
  const start = lootDetailPage.value * LOOT_DETAIL_PAGE_SIZE;
  return lootDetailRows.value.slice(start, start + LOOT_DETAIL_PAGE_SIZE);
});

const lootDetailStartIndex = computed(() => {
  if (lootDetailModalCount.value === 0) {
    return 0;
  }
  return lootDetailPage.value * LOOT_DETAIL_PAGE_SIZE + 1;
});

const lootDetailEndIndex = computed(() => {
  if (lootDetailModalCount.value === 0) {
    return 0;
  }
  return Math.min(
    lootDetailStartIndex.value + LOOT_DETAIL_PAGE_SIZE - 1,
    lootDetailModalCount.value
  );
});

watch(lootDetailModalCount, (total) => {
  const maxPage = total === 0 ? 0 : Math.max(0, Math.ceil(total / LOOT_DETAIL_PAGE_SIZE) - 1);
  if (lootDetailPage.value > maxPage) {
    lootDetailPage.value = maxPage;
  }
});

const lootByItemSummaries = computed<LootItemSummary[]>(() => {
  const map = new Map<string, LootItemSummary>();
  for (const event of filteredLootEvents.value) {
    const key = event.itemName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { itemName: event.itemName, count: 0, lastAwarded: null });
    }
    const entry = map.get(key)!;
    entry.count += 1;
    const timestamp = eventPrimaryTimestamp(event);
    if (timestamp && (!entry.lastAwarded || timestamp > entry.lastAwarded)) {
      entry.lastAwarded = timestamp;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
});

const topLootItems = computed(() => {
  const limit = maximizedCard.value === 'lootByItem' ? MAXIMIZED_BAR_LIMIT : DEFAULT_BAR_LIMIT;
  return lootByItemSummaries.value.slice(0, limit);
});

const lootByItemChartData = computed(() => {
  const entries = topLootItems.value;
  return {
    labels: entries.map((entry) => entry.itemName),
    datasets: [
      {
        label: 'Awards',
        data: entries.map((entry) => entry.count),
        backgroundColor: entries.map(() => '#f97316'),
        borderRadius: 6
      }
    ]
  };
});

const lootByItemChartOptions = computed(() => ({
  indexAxis: 'y' as const,
  maintainAspectRatio: false,
  interaction: {
    mode: 'nearest' as const,
    axis: 'y' as const,
    intersect: true
  },
  hover: {
    mode: 'nearest' as const,
    intersect: true
  },
  animation: {
    duration: 0
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0 }
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(context: any) {
          const index = context.dataIndex as number;
          const entries = topLootItems.value;
          const entry = entries[index];
          const value =
            typeof context.parsed.x === 'number' ? context.parsed.x : Number(context.parsed);
          if (!entry) {
            return `${value} awards`;
          }
          const details = [`Awards: ${value}`];
          if (entry.lastAwarded) {
            details.push(`Last Award: ${formatDateLong(entry.lastAwarded)}`);
          }
          return details;
        }
      }
    }
  }
}));

const lootByItemHasData = computed(
  () =>
    lootByItemChartData.value.datasets[0]?.data?.length &&
    lootByItemChartData.value.datasets[0].data.some((value) => Number(value) > 0)
);

const lootSpotlightCharacters = computed(() => {
  if (selectedCharacterNameSet.value.size === 0 && selectedCharacterKeySet.value.size === 0) {
    return [] as LootParticipantSummary[];
  }
  return lootByParticipantSummaries.value.filter((entry) => {
    if (metricsMode.value === 'character') {
      const identity = resolveEntityIdentity(entry.key);
      if (identity?.mode !== 'character') {
        return false;
      }
    }
    return (
      selectedCharacterKeySet.value.has(entry.key) ||
      selectedCharacterNameSet.value.has(entry.name.toLowerCase())
    );
  });
});

const lootSpotlightItems = computed(() => {
  if (selectedLootItemsSet.value.size === 0) {
    return [] as LootItemSummary[];
  }
  return lootByItemSummaries.value.filter((entry) =>
    selectedLootItemsSet.value.has(entry.itemName.toLowerCase())
  );
});

const recentLootEvents = computed(() => {
  const sorted = [...filteredLootEvents.value].sort((a, b) => {
    const aStamp = eventPrimaryTimestamp(a);
    const bStamp = eventPrimaryTimestamp(b);
    return (bStamp ?? '').localeCompare(aStamp ?? '');
  });
  return sorted.slice(0, 8);
});

const summaryCards = computed(() => {
  const metricData = metrics.value;
  const summary = globalSummary.value ?? metricData?.summary;
  if (!summary || !metricData) {
    return [] as Array<{ label: string; value: number }>;
  }

  if (isMemberMode.value) {
    const attendanceRecordKeys = new Set<string>();
    const attendanceIdentitySet = new Set<string>();
    const lootIdentitySet = new Set<string>();
    const memberOptions = memberEntityOptions.value;

    for (const record of metricData.attendanceRecords) {
      const identity = identityFromRecord(record, 'member');
      attendanceIdentitySet.add(identity.key);
      const timestamp = record.timestamp ?? record.raid.startTime ?? record.id;
      attendanceRecordKeys.add(`${record.raid.id}::${timestamp}::${identity.key}`);
    }

    for (const event of metricData.lootEvents) {
      const normalized = event.looterName.toLowerCase();
      const memberOption =
        memberKeyByCharacterName.value.get(normalized) ??
        memberOptions.find((option) => option.normalizedCharacterNames.includes(normalized));
      if (memberOption) {
        lootIdentitySet.add(memberOption.key);
      } else {
        lootIdentitySet.add(`character:${normalized}`);
      }
    }

    return [
      { label: 'Attendance Records', value: attendanceRecordKeys.size },
      { label: 'Unique Members', value: memberOptions.length || attendanceIdentitySet.size },
      { label: 'Loot Events', value: summary.lootEvents },
      { label: 'Unique Loot Recipients', value: lootIdentitySet.size },
      { label: 'Raids Covered', value: summary.raidsTracked }
    ];
  }

  return [
    { label: 'Attendance Records', value: summary.attendanceRecords },
    { label: 'Unique Characters', value: summary.uniqueAttendanceCharacters },
    { label: 'Loot Events', value: summary.lootEvents },
    { label: 'Unique Looters', value: summary.uniqueLooters },
    { label: 'Raids Covered', value: summary.raidsTracked }
  ];
});

const activeRangeLabel = computed(() =>
  metrics.value
    ? `${formatRangeDate(metrics.value.range.start)} – ${formatRangeDate(metrics.value.range.end)}`
    : 'selected period'
);

function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeResponse = (error as { response?: { data?: unknown } }).response;
    if (maybeResponse?.data && typeof maybeResponse.data === 'object') {
      const payload = maybeResponse.data as { message?: unknown; error?: unknown };
      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message.trim();
      }
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error.trim();
      }
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      const extracted = ((error as { message: string }).message || '').trim();
      if (extracted.length > 0) {
        return extracted;
      }
    }
  }
  return fallback;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return `${clamped.toFixed(1)}%`;
}

function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRangeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function eventPrimaryTimestamp(event: LootMetricEvent): string {
  return event.timestamp || event.createdAt;
}

function attendanceRate(entry: AttendanceCharacterSummary): number {
  return entry.participationPercent;
}

const timelineBounds = computed(() => {
  const now = new Date();

  if (globalTimeline.value) {
    const minMs = globalTimeline.value.minMs;
    return {
      min: new Date(minMs).toISOString(),
      max: now.toISOString()
    };
  }

  if (!metrics.value) {
    return null;
  }

  let minMs = Number.POSITIVE_INFINITY;
  const updateBounds = (iso?: string | null, floor = false) => {
    if (!iso) {
      return;
    }
    const value = floor ? startOfDayLocalIso(iso) : iso;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      return;
    }
    minMs = Math.min(minMs, ms);
  };

  updateBounds(metrics.value.range.start, true);
  for (const record of metrics.value.attendanceRecords) {
    updateBounds(record.timestamp);
    updateBounds(record.raid.startTime);
  }

  for (const event of metrics.value.lootEvents) {
    updateBounds(eventPrimaryTimestamp(event));
  }

  if (!Number.isFinite(minMs)) {
    minMs = Date.parse(metrics.value.range.start);
  }
  if (!Number.isFinite(minMs)) {
    minMs = Date.now();
  }

  return {
    min: new Date(minMs).toISOString(),
    max: now.toISOString()
  };
});

const currentRangeIso = computed(() => {
  const bounds = timelineBounds.value;
  const now = new Date();
  const fallbackStart = bounds?.min ?? startOfDayUtcIso(now.toISOString());
  const fallbackEnd = bounds?.max ?? now.toISOString();

  const startMs = Date.parse(rangeForm.start);
  const endMs = Date.parse(rangeForm.end);

  const startIso = Number.isNaN(startMs)
    ? fallbackStart
    : new Date(startMs).toISOString();
  const endIso = Number.isNaN(endMs)
    ? fallbackEnd
    : new Date(endMs).toISOString();

  return { start: startIso, end: endIso };
});

const timelineSelectionLabel = computed(() => {
  const startLabel = formatTimelineDisplay(currentRangeIso.value.start);
  const endLabel = formatTimelineDisplay(currentRangeIso.value.end);
  if (startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel} — ${endLabel}`;
});

const timelineEventDates = computed<
  Array<{ start: string; end: string; label?: string; startLabel: string; endLabel: string }>
>(() => {
  const nowMs = Date.now();
  const markerMap = globalTimeline.value?.markers;

  if (markerMap && markerMap.size > 0) {
    const markersWithMs: TimelineMarkerWithMs[] = [];
    for (const marker of markerMap.values()) {
      const startMs = parseIsoToMs(marker.start);
      const endMs = parseIsoToMs(marker.end);
      if (startMs === null || endMs === null || endMs > nowMs || endMs <= startMs) {
        continue;
      }
      markersWithMs.push({
        start: marker.start,
        end: marker.end,
        label: marker.label,
        startLabel: marker.startLabel,
        endLabel: marker.endLabel,
        startMs,
        endMs
      });
    }
    return markersWithMs
      .sort((a, b) => a.startMs - b.startMs)
      .map(({ start, end, label, startLabel, endLabel }) => ({
        start,
        end,
        label,
        startLabel,
        endLabel
      }));
  }

  if (!metrics.value) {
    return [];
  }

  const raidBounds = new Map<
    string,
    { startMs: number; endMs: number | null; start: string; end: string | null; label?: string }
  >();

  const records = metrics.value.attendanceRecords.slice().sort((a, b) => {
    const aMs = parseIsoToMs(a.timestamp) ?? 0;
    const bMs = parseIsoToMs(b.timestamp) ?? 0;
    return aMs - bMs;
  });

  for (const record of records) {
    const raidId = record.raid.id ?? `raid-${record.raid.name ?? 'unknown'}`;
    const timestampMs = parseIsoToMs(record.timestamp);
    if (timestampMs === null) {
      continue;
    }

    let bounds = raidBounds.get(raidId);
    if (!bounds) {
      const startIso = record.raid.startTime ?? record.timestamp;
      const startMs = parseIsoToMs(startIso) ?? timestampMs;
      bounds = {
        startMs,
        endMs: null,
        start: new Date(startMs).toISOString(),
        end: null,
        label: record.raid.name ?? `Raid ${raidId}`
      };
      raidBounds.set(raidId, bounds);
    } else if (timestampMs < bounds.startMs) {
      bounds.startMs = timestampMs;
      bounds.start = new Date(timestampMs).toISOString();
    }

    if (record.eventType === 'END') {
      bounds.endMs = timestampMs;
      bounds.end = record.timestamp;
    }
  }

  return Array.from(raidBounds.values())
    .filter((entry) => entry.endMs !== null && entry.endMs <= nowMs && entry.endMs > entry.startMs)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
    .map((entry) => ({
      start: entry.start,
      end: entry.end!,
      label: entry.label,
      startLabel: formatDateLong(entry.start),
      endLabel: formatDateLong(entry.end!)
    }));
});

function createTimelineMarker(startIso: string, endIso: string, label?: string): TimelineMarker {
  return {
    start: startIso,
    end: endIso,
    label: label ?? undefined,
    startLabel: formatDateLong(startIso),
    endLabel: formatDateLong(endIso)
  };
}

function syncFiltersWithOptions(): void {
  if (!metrics.value) {
    return;
  }
  const classSet = new Set(classIconOptions.value.map((entry) => entry.value));
  selectedClasses.value = selectedClasses.value
    .map((entry) => normalizeClassValue(entry))
    .filter((entry): entry is string => Boolean(entry && classSet.has(entry)));
  const normalizedClassSet = new Set(selectedClasses.value.map((entry) => normalizeClassValue(entry)).filter((entry): entry is string => Boolean(entry)));

  if (normalizedClassSet.size > 0) {
    updateSelectedCharactersFromClasses(normalizedClassSet);
  }

  const entityKeys = new Set(entityOptions.value.map((option) => option.key));
  selectedCharacters.value = selectedCharacters.value.filter((key) => entityKeys.has(key));

  const lootItemSet = new Set(lootItemOptions.value.map((option) => option.name));
  selectedLootItems.value = selectedLootItems.value.filter((name) => lootItemSet.has(name));
}

async function loadMetrics(params?: GuildMetricsQuery) {
  if (!guildId.value) {
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const result = await api.fetchGuildMetrics(guildId.value, params);
    metrics.value = result;
    updateGlobalTimeline(result);
    rangeForm.start = result.range.start;
    rangeForm.end = result.range.end;
    if (!params) {
      const bounds = timelineBounds.value;
      const minIso = bounds?.min ?? result.range.start;
      const maxIso = bounds?.max ?? new Date().toISOString();
      rangeForm.start = minIso;
      rangeForm.end = maxIso;
    }
    if (!globalSummary.value) {
      globalSummary.value = { ...result.summary };
    }
    lastSubmittedQuery.value = params ? { ...params } : undefined;
    syncFiltersWithOptions();
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : 'Unable to load metrics. Please try again.';
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  selectedClasses.value = [];
  selectedCharacters.value = [];
  selectedLootItems.value = [];
  searchQuery.value = '';
}

function reloadMetrics() {
  void loadMetrics(lastSubmittedQuery.value);
}

function toggleClass(value: string) {
  const canonical = normalizeClassValue(value);
  if (!canonical) {
    return;
  }
  const existing = new Set(selectedClassSet.value);
  if (existing.has(canonical)) {
    existing.delete(canonical);
  } else {
    existing.add(canonical);
  }
  selectedClasses.value = Array.from(existing);
  updateSelectedCharactersFromClasses(existing);
}

function updateSelectedCharactersFromClasses(classSet: Set<string>) {
  if (classSet.size === 0) {
    if (selectedClasses.value.length === 0 && selectedCharacters.value.length > 0) {
      selectedCharacters.value = [];
    }
    return;
  }
  const matchingKeys: string[] = [];
  for (const option of entityOptions.value) {
    if (option.classes.length === 0) {
      continue;
    }
    const matches = option.classes.some((value) => {
      const normalized = normalizeClassValue(value);
      return normalized ? classSet.has(normalized) : false;
    });
    if (matches) {
      matchingKeys.push(option.key);
    }
  }
  const retained = selectedCharacters.value.filter((key) => {
    const option = entityOptionLookup.value.get(key);
    if (!option) {
      return false;
    }
    if (option.classes.length === 0) {
      return false;
    }
    return option.classes.some((value) => {
      const normalized = normalizeClassValue(value);
      return normalized ? classSet.has(normalized) : false;
    });
  });
  const additions = matchingKeys.filter((key) => !retained.includes(key));
  const nextSelection = [...retained, ...additions];
  const current = selectedCharacters.value;
  if (
    nextSelection.length === current.length &&
    nextSelection.every((value, index) => value === current[index])
  ) {
    return;
  }
  selectedCharacters.value = nextSelection;
}

function handleTimelinePreview(range: { start: string; end: string }) {
  rangeForm.start = range.start;
  rangeForm.end = range.end;
}

function handleTimelineCommit(range: { start: string; end: string }) {
  const startMs = Date.parse(range.start);
  const endMs = Date.parse(range.end);
  const startIso = Number.isNaN(startMs) ? range.start : new Date(startMs).toISOString();
  const endIso = Number.isNaN(endMs) ? range.end : new Date(endMs).toISOString();
  rangeForm.start = startIso;
  rangeForm.end = endIso;
  const query: GuildMetricsQuery = {
    startDate: startIso,
    endDate: endIso
  };
  if (
    lastSubmittedQuery.value &&
    lastSubmittedQuery.value.startDate === query.startDate &&
    lastSubmittedQuery.value.endDate === query.endDate
  ) {
    handleTimelinePreview(range);
    return;
  }
  lastSubmittedQuery.value = { ...query };
  void loadMetrics(query);
}

function updateGlobalTimeline(result: GuildMetrics) {
  const previous = globalTimeline.value;
  const markers = new Map<string, TimelineMarker>(previous?.markers ?? []);
  const nowMs = Date.now();

  for (const [key, marker] of Array.from(markers.entries())) {
    const startMs = parseIsoToMs(marker.start);
    const endMs = parseIsoToMs(marker.end);
    if (startMs === null || endMs === null || endMs <= startMs) {
      markers.delete(key);
      continue;
    }
    if (!marker.startLabel || !marker.endLabel) {
      markers.set(key, {
        ...marker,
        startLabel: marker.startLabel ?? formatDateLong(marker.start),
        endLabel: marker.endLabel ?? formatDateLong(marker.end)
      });
    }
  }

  const considerMinFallbacks = (iso?: string | null, floor = false) => {
    const ms = parseIsoToMs(iso, floor);
    if (ms !== null) {
      fallbackMinMs = Math.min(fallbackMinMs, ms);
    }
  };

  let fallbackMinMs = previous?.minMs ?? Number.POSITIVE_INFINITY;
  const earliestExistingMarkerStart = Array.from(markers.values()).reduce<number | null>(
    (acc, marker) => {
      const ms = parseIsoToMs(marker.start);
      if (ms === null) {
        return acc;
      }
      if (acc === null || ms < acc) {
        return ms;
      }
      return acc;
    },
    null
  );
  if (earliestExistingMarkerStart !== null) {
    fallbackMinMs = Math.min(fallbackMinMs, earliestExistingMarkerStart);
  }
  const raidStartInfo = new Map<
    string,
    { ms: number; iso: string }
  >();

  for (const record of result.attendanceRecords) {
    const raidId = record.raid.id ?? `raid-${record.raid.name ?? 'unknown'}`;

    considerMinFallbacks(record.timestamp);
    considerMinFallbacks(record.raid.startTime);

    const candidateStarts = [record.raid.startTime, record.timestamp];
    for (const candidate of candidateStarts) {
      const ms = parseIsoToMs(candidate);
      if (ms === null) {
        continue;
      }
      const existing = raidStartInfo.get(raidId);
      if (!existing || ms < existing.ms) {
        raidStartInfo.set(raidId, { ms, iso: new Date(ms).toISOString() });
      }
    }

    if (record.eventType !== 'END' || !record.timestamp) {
      continue;
    }

    const endMs = parseIsoToMs(record.timestamp);
    if (endMs === null || endMs > nowMs) {
      continue;
    }

    const startInfo = raidStartInfo.get(raidId);
    let startMs = startInfo?.ms ?? endMs;
    const fallbackStartIso = startInfo?.iso ?? record.raid.startTime ?? record.timestamp;
    const parsedStartMs = parseIsoToMs(fallbackStartIso);
    if (parsedStartMs !== null) {
      startMs = parsedStartMs;
    }

    if (startMs > endMs) {
      startMs = endMs;
    }

    const label = record.raid.name ?? (record.raid.id ? `Raid ${record.raid.id}` : undefined);
    const existing = markers.get(raidId);

    const existingStartMs = existing ? parseIsoToMs(existing.start) ?? startMs : startMs;
    const existingEndMs = existing ? parseIsoToMs(existing.end) ?? endMs : endMs;
    const mergedStartMs = Math.min(existingStartMs, startMs);
    const mergedEndMs = Math.max(existingEndMs, endMs);
    const finalStartIso = new Date(mergedStartMs).toISOString();
    const finalEndIso = new Date(mergedEndMs).toISOString();
    const finalLabel = label ?? existing?.label;

    markers.set(raidId, createTimelineMarker(finalStartIso, finalEndIso, finalLabel));
  }

  for (const event of result.lootEvents) {
    considerMinFallbacks(eventPrimaryTimestamp(event));
  }

  considerMinFallbacks(result.earliestRaidDate, true);
  considerMinFallbacks(result.range.start);
  considerMinFallbacks(result.range.end);

  let minMs: number;
  const earliestMarker = Array.from(markers.values()).reduce<number | null>((acc, marker) => {
    const ms = parseIsoToMs(marker.start);
    if (ms === null) {
      return acc;
    }
    if (acc === null || ms < acc) {
      return ms;
    }
    return acc;
  }, null);

  if (earliestMarker !== null) {
    minMs = startOfDayLocalMs(earliestMarker);
  } else if (Number.isFinite(fallbackMinMs)) {
    minMs = startOfDayLocalMs(fallbackMinMs);
  } else {
    const fallback = parseIsoToMs(result.range.start) ?? Date.now();
    minMs = startOfDayLocalMs(fallback);
  }

  globalTimeline.value = {
    minMs,
    markers
  };
}

function handleSearchFocus() {
  searchFocused.value = true;
  searchDropdownSuppressed.value = false;
}

function handleSearchBlur() {
  searchFocused.value = false;
  setTimeout(() => {
    if (!searchResultsHover.value) {
      searchResultsHover.value = false;
    }
  }, 120);
}

function handleSearchResultsHover(state: boolean) {
  searchResultsHover.value = state;
  if (state) {
    searchDropdownSuppressed.value = false;
  } else if (!searchFocused.value) {
    activeSearchIndex.value = -1;
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  const options = filteredSearchOptions.value;
  const hasOptions = options.length > 0;
  const dropdownVisible = showSearchResults.value;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!hasOptions) {
      return;
    }
    event.preventDefault();
    searchDropdownSuppressed.value = false;
    const increment = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = normalizeSearchIndex(activeSearchIndex.value + increment, options.length);
    activeSearchIndex.value = nextIndex;
    scrollActiveSearchOptionIntoView();
    return;
  }
  if (event.key === 'Tab' && hasOptions) {
    if (!dropdownVisible) {
      return;
    }
    event.preventDefault();
    searchDropdownSuppressed.value = false;
    const increment = event.shiftKey ? -1 : 1;
    const nextIndex = normalizeSearchIndex(activeSearchIndex.value + increment, options.length);
    activeSearchIndex.value = nextIndex;
    scrollActiveSearchOptionIntoView();
    return;
  }
  if (event.key === 'Enter') {
    if (!hasOptions) {
      return;
    }
    event.preventDefault();
    const index = activeSearchIndex.value >= 0 ? activeSearchIndex.value : 0;
    const option = options[index];
    if (option) {
      handleSearchSelect(option);
    }
    return;
  }
  if (event.key === 'Escape') {
    searchDropdownSuppressed.value = true;
    activeSearchIndex.value = -1;
  }
}

function normalizeSearchIndex(index: number, length: number): number {
  if (length === 0) {
    return -1;
  }
  if (index < 0) {
    return length - 1;
  }
  if (index >= length) {
    return 0;
  }
  return index;
}

function setActiveSearchOption(option: SearchOptionEntry) {
  const options = filteredSearchOptions.value;
  const index = options.findIndex((entry) => entry === option);
  activeSearchIndex.value = index;
  searchDropdownSuppressed.value = false;
  scrollActiveSearchOptionIntoView();
}

function isSearchOptionActive(option: SearchOptionEntry): boolean {
  const options = filteredSearchOptions.value;
  const index = options.findIndex((entry) => entry === option);
  return index === activeSearchIndex.value;
}

function scrollActiveSearchOptionIntoView() {
  nextTick(() => {
    const list = searchResultsRef.value;
    if (!list) {
      return;
    }
    const items = list.querySelectorAll<HTMLLIElement>('.metrics-search__result');
    const index = activeSearchIndex.value;
    if (index < 0 || index >= items.length) {
      return;
    }
    const element = items[index];
    element.scrollIntoView({ block: 'nearest' });
  });
}

function handleSearchSelect(option: SearchOptionEntry) {
  if (option.type === 'character') {
    if (!selectedCharacterKeySet.value.has(option.value)) {
      selectedCharacters.value = [...selectedCharacters.value, option.value];
    }
  } else {
    if (!selectedLootItemsSet.value.has(option.normalizedValue)) {
      selectedLootItems.value = [...selectedLootItems.value, option.value];
    }
  }
  ignoreNextSearchQueryReset.value = true;
  searchQuery.value = '';
  nextTick(() => {
    searchInputRef.value?.focus();
  });
  activeSearchIndex.value = -1;
  searchDropdownSuppressed.value = true;
  searchResultsHover.value = false;
}

function removeCharacterSelection(key: string) {
  selectedCharacters.value = selectedCharacters.value.filter((entry) => entry !== key);

  const option = entityOptionLookup.value.get(key);
  if (!option || option.type === 'member') {
    return;
  }
  const optionClass = option.class ? option.class.toUpperCase() : null;
  if (optionClass && selectedClassSet.value.has(optionClass)) {
    selectedClasses.value = selectedClasses.value.filter((entry) => entry.toUpperCase() !== optionClass);
  }
}

function removeItemSelection(name: string) {
  selectedLootItems.value = selectedLootItems.value.filter((entry) => entry !== name);
}

function handleInspectorReset() {
  if (selectedCharacters.value.length === 0) {
    return;
  }
  selectedCharacters.value = [];
  if (selectedClasses.value.length > 0) {
    selectedClasses.value = [];
  }
  if (selectedLootItems.value.length > 0) {
    selectedLootItems.value = [];
  }
  searchQuery.value = '';
  activeSearchIndex.value = -1;
  searchDropdownSuppressed.value = true;
  searchResultsHover.value = false;
}

function handleInspectorReorder(newOrder: string[]) {
  if (newOrder.length !== selectedCharacters.value.length) {
    return;
  }
  const currentKeys = new Set(selectedCharacters.value);
  for (const key of newOrder) {
    if (!currentKeys.has(key)) {
      return;
    }
  }
  selectedCharacters.value = [...newOrder];
}

watch(
  () => guildId.value,
  (next, prev) => {
    if (next && next !== prev) {
      resetFilters();
      lastSubmittedQuery.value = undefined;
      globalSummary.value = null;
      void loadMetrics();
    }
  }
);

onMounted(() => {
  if (guildId.value) {
    void loadMetrics();
  }
});
</script>

<style scoped>
.metrics-view {
  padding: 2rem 0 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.metrics-content {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.metrics-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-header h1 {
  margin: 0;
  font-size: 2rem;
}

.metrics-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  flex-direction: column;
  justify-content: center;
  margin: 0 auto 1.75rem;
  text-align: center;
}

.metrics-mode__label {
  display: block;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.9);
  margin-bottom: 0.15rem;
}

.metrics-mode__controls {
  display: inline-flex;
  gap: 0.5rem;
  background: rgba(15, 23, 42, 0.65);
  padding: 0.25rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
}

.metrics-mode__button {
  border: none;
  background: transparent;
  color: #cbd5f5;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.35rem 0.95rem;
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
  cursor: pointer;
}

.metrics-mode__button:hover {
  background: rgba(59, 130, 246, 0.2);
  color: #e2e8f0;
}

.metrics-mode__button--active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.75), rgba(99, 102, 241, 0.75));
  color: #f8fafc;
  box-shadow: 0 12px 28px rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
}

.metrics-back {
  align-self: flex-start;
}

.metrics-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.timeline-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.85rem;
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);
  margin-bottom: 1.25rem;
}

.timeline-summary__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.75);
}

.timeline-summary__value {
  font-weight: 600;
}

.metrics-summary__item {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(14, 165, 233, 0.08));
  border-radius: 0.85rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.metrics-summary__label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5f5;
}

.metrics-summary__value {
  font-size: 1.85rem;
  font-weight: 600;
}

.metrics-filters {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: stretch;
}

.metrics-search-container {
  width: 100%;
}

.metrics-search {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-width: 560px;
  margin: 0 auto;
}

.metrics-inspector {
  width: 100%;
  display: flex;
  justify-content: center;
}

.metrics-inspector > * {
  width: 100%;
}

.metrics-search__input-wrapper {
  position: relative;
}

.metrics-search__input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.65rem;
  padding: 0.55rem 0.8rem;
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.metrics-search__input:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.65);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.15);
}

.metrics-search__results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  max-height: 14rem;
  overflow-y: auto;
  list-style: none;
  padding: 0.35rem 0;
  z-index: 5;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.45);
}

.metrics-search__result {
  padding: 0.55rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.metrics-search__result:hover {
  background: rgba(59, 130, 246, 0.2);
}

.metrics-search__result--active,
.metrics-search__result--active:hover {
  background: rgba(59, 130, 246, 0.3);
}

.metrics-search__result-primary {
  font-weight: 600;
}

.metrics-search__result-secondary {
  font-size: 0.8rem;
  color: #94a3b8;
}

.metrics-search__result--empty {
  color: #94a3b8;
  cursor: default;
}

.metrics-search__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.metrics-search__chips--items {
  margin-top: -0.2rem;
}

.metrics-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.35);
  font-size: 0.85rem;
}

.metrics-chip--item {
  background: rgba(249, 115, 22, 0.18);
  border-color: rgba(249, 115, 22, 0.35);
}

.metrics-chip__remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
  line-height: 1;
}

.metrics-chip__remove:hover {
  color: #fca5a5;
}

.metrics-class-toggle {
  display: grid;
  gap: 0.65rem;
}

.metrics-class-toggle--grid {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}

.metrics-class-toggle__button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.65rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.6);
  color: inherit;
  cursor: pointer;
  min-width: 72px;
  transition:
    transform 0.15s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.metrics-class-toggle__button:hover,
.metrics-class-toggle__button:focus-visible {
  border-color: rgba(96, 165, 250, 0.55);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.4);
}

.metrics-class-toggle__button--active {
  border-color: rgba(59, 130, 246, 0.85);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(14, 165, 233, 0.18));
  box-shadow: 0 10px 22px rgba(30, 64, 175, 0.32);
}

.metrics-class-toggle__button--inactive {
  opacity: 0.6;
  border-color: rgba(148, 163, 184, 0.1);
}

.metrics-class-toggle__button--inactive:hover,
.metrics-class-toggle__button--inactive:focus-visible {
  opacity: 0.75;
  border-color: rgba(99, 102, 241, 0.4);
}

.metrics-class-toggle__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  overflow: hidden;
}

.metrics-class-toggle__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.metrics-class-toggle__icon span {
  font-size: 0.85rem;
  font-weight: 600;
}

.metrics-class-toggle__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5f5;
}

@media (max-width: 960px) {
  .metrics-class-toggle--grid {
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  }
}

.metrics-section {
  display: flex;
  flex-direction: column;
  gap: 1.3rem;
}

.metrics-section__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.metrics-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 260px;
}

.metrics-class-card {
  min-height: auto;
  gap: 1.25rem;
}

.metrics-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.metrics-card__header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.metrics-card__header--with-actions {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.metrics-card__hint {
  margin: 0;
  color: #94a3b8;
}

.metrics-card__hint--interactive {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: #facc15;
}

.metrics-card__hint-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.85), rgba(253, 224, 71, 0.6));
  box-shadow: 0 0 12px rgba(250, 204, 21, 0.75);
  flex-shrink: 0;
}

.metrics-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
  color: rgba(226, 232, 240, 0.85);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.metrics-card__action:hover,
.metrics-card__action:focus-visible {
  border-color: rgba(96, 165, 250, 0.85);
  background: rgba(30, 64, 175, 0.65);
  transform: scale(1.05);
}

.metrics-card__action svg {
  width: 1.1rem;
  height: 1.1rem;
}

.metrics-card__chart {
  flex: 1;
  min-height: 220px;
  position: relative;
}

.metrics-card__chart canvas {
  width: 100% !important;
  height: 100% !important;
}

.metrics-card-grid--maximized {
  display: block;
}

.metrics-card--maximized {
  grid-column: 1 / -1;
  width: 100%;
  min-height: min(85vh, 960px);
  display: flex;
  flex-direction: column;
}

.metrics-card--maximized .metrics-card__chart {
  flex: 1;
  min-height: unset;
}

.metrics-card--maximized .metrics-card__chart canvas {
  height: 100% !important;
}

.metrics-card__empty {
  margin: 0;
  text-align: center;
  padding: 2rem 0;
}

.metrics-status-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.metrics-status-summary__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.metrics-status-summary__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.metrics-status-summary__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-flex;
  background: rgba(148, 163, 184, 0.45);
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12);
}

.metrics-status-summary__item[data-status='PRESENT'] .metrics-status-summary__dot {
  background: rgba(34, 197, 94, 0.8);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
}

.metrics-status-summary__item[data-status='LATE'] .metrics-status-summary__dot {
  background: rgba(249, 115, 22, 0.8);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.25);
}

.metrics-status-summary__item[data-status='ABSENT'] .metrics-status-summary__dot {
  background: rgba(239, 68, 68, 0.8);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
}

.metrics-status-summary__item[data-status='LEFT_EARLY'] .metrics-status-summary__dot {
  background: rgba(168, 85, 247, 0.8);
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.25);
}

.metrics-status-summary__value {
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metrics-spotlight {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 1rem;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metrics-spotlight__subtitle {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
}

.metrics-spotlight__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.metrics-spotlight__item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  padding-bottom: 0.75rem;
}

.metrics-spotlight__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.metrics-spotlight__stats {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.9rem;
  color: #cbd5f5;
}

.metrics-spotlight__name {
  font-weight: 600;
  font-size: 1rem;
}

.metrics-spotlight__name--plain {
  color: inherit;
  text-decoration: none;
  cursor: default;
}

.metrics-recent {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.metrics-recent__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.1rem;
}

.metrics-recent__card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(135deg, rgba(13, 23, 42, 0.82), rgba(7, 89, 133, 0.45));
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 1.1rem;
  padding: 1.15rem 1.3rem;
  box-shadow: 0 18px 36px rgba(13, 23, 42, 0.38);
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.metrics-recent__card:hover,
.metrics-recent__card:focus-visible {
  transform: translateY(-3px);
  border-color: rgba(56, 189, 248, 0.45);
  background: linear-gradient(135deg, rgba(7, 89, 133, 0.58), rgba(14, 165, 233, 0.4));
}

.metrics-recent__header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.metrics-recent__item-icon {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.85rem;
  background: rgba(56, 189, 248, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
}

.metrics-recent__item-title {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metrics-recent__item-title strong {
  font-size: 1.05rem;
  color: #f8fafc;
}

.metrics-recent__raid {
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.metrics-recent__time {
  margin-left: auto;
}

.metrics-recent__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.metrics-recent__looter {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metrics-recent__looter-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.62rem;
  color: rgba(148, 163, 184, 0.75);
}

.metrics-recent__looter-name {
  font-weight: 600;
  font-size: 0.98rem;
}

.metrics-recent__looter-name--plain {
  color: inherit;
  text-decoration: none;
  cursor: default;
}

.metrics-recent__emoji {
  font-size: 1.35rem;
  filter: drop-shadow(0 8px 14px rgba(14, 116, 144, 0.4));
}

.metrics-inline-error {
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(248, 113, 113, 0.32);
  border-radius: 0.85rem;
  padding: 0.75rem 1rem;
  color: #fecaca;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.metrics-inline-error p {
  margin: 0;
}

.metrics-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 0;
  color: #cbd5f5;
}

.metrics-state--error {
  color: #fca5a5;
}

.metrics-state button {
  align-self: center;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.86);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 120;
}

.modal {
  width: min(740px, 100%);
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: min(85vh, 720px);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
  overflow: hidden;
}

.metrics-modal {
  width: min(840px, 100%);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modal__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
}

.icon-button {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.25rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s ease;
}

.icon-button:hover,
.icon-button:focus-visible {
  color: #f8fafc;
}

.metrics-modal__table-wrapper {
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.8);
}

.metrics-modal-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.metrics-modal-table th,
.metrics-modal-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  text-align: left;
}

.metrics-modal-table thead th {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.85);
  font-weight: 600;
  background: rgba(30, 41, 59, 0.6);
}

.metrics-modal-table tbody tr:last-child td {
  border-bottom: none;
}

.metrics-modal-table__character {
  white-space: nowrap;
  font-weight: 600;
}

.metrics-modal-table td:nth-child(3),
.metrics-modal-table td:nth-child(4),
.metrics-modal-table td:nth-child(5),
.metrics-modal-table td:nth-child(6),
.metrics-modal-table td:nth-child(7),
.metrics-modal-table td:nth-child(8) {
  text-align: right;
}

.metrics-modal-table th:nth-child(3),
.metrics-modal-table th:nth-child(4),
.metrics-modal-table th:nth-child(5),
.metrics-modal-table th:nth-child(6),
.metrics-modal-table th:nth-child(7),
.metrics-modal-table th:nth-child(8) {
  text-align: right;
}

.metrics-modal-table__actions-header {
  text-align: center;
}

.metrics-modal-table__actions {
  width: 1%;
  white-space: nowrap;
  vertical-align: top;
}

.unknown-assignment {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.unknown-assignment__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.unknown-assignment__controls select {
  min-width: 10rem;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  color: inherit;
  padding: 0.4rem 0.6rem;
}

.unknown-assignment__icon-button {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.65rem;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.unknown-assignment__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  box-shadow: none;
}

.unknown-assignment__icon-button--confirm {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.85), rgba(22, 163, 74, 0.75));
  box-shadow: 0 8px 18px rgba(22, 163, 74, 0.35);
}

.unknown-assignment__icon-button--confirm:hover,
.unknown-assignment__icon-button--confirm:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(22, 163, 74, 0.45);
  filter: brightness(1.08);
}

.unknown-assignment__icon-button--cancel {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.85), rgba(220, 38, 38, 0.75));
  box-shadow: 0 8px 18px rgba(220, 38, 38, 0.35);
  color: #f8fafc;
}

.unknown-assignment__icon-button--cancel:hover,
.unknown-assignment__icon-button--cancel:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(220, 38, 38, 0.45);
  filter: brightness(1.08);
}

.unknown-assign-trigger {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(96, 165, 250, 0.65));
  border: 1px solid rgba(59, 130, 246, 0.55);
  color: #f8fafc;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.35);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.unknown-assign-trigger:hover,
.unknown-assign-trigger:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.45);
  filter: brightness(1.08);
}

.metrics-modal-table__error {
  margin: 0;
  font-size: 0.75rem;
  color: #fca5a5;
}

.loot-detail__cell-item {
  font-weight: 600;
}

.loot-detail__item-link {
  background: none;
  border: none;
  color: #38bdf8;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: color 0.2s ease, text-shadow 0.2s ease;
}

.loot-detail__item-link:hover,
.loot-detail__item-link:focus-visible {
  color: #f8fafc;
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
}

.loot-detail__raid {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.loot-detail__raid-link {
  color: #a5b4fc;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.2s ease, text-shadow 0.2s ease;
}

.loot-detail__raid-link:hover,
.loot-detail__raid-link:focus-visible {
  color: #fff7ed;
  text-shadow: 0 0 8px rgba(129, 140, 248, 0.7);
}

.loot-detail__raid-time {
  font-size: 0.7rem;
}

.loot-detail__pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.loot-detail__pagination-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.loot-detail__page-button {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.loot-detail__page-button:hover,
.loot-detail__page-button:focus-visible {
  border-color: rgba(96, 165, 250, 0.8);
  background: rgba(30, 64, 175, 0.55);
  color: #f8fafc;
}

.loot-detail__page-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  border-color: rgba(148, 163, 184, 0.25);
}

.loot-detail__page-indicator {
  min-width: 6rem;
  text-align: center;
}

@media (max-width: 640px) {
  .metrics-filter__select {
    min-height: 6rem;
  }

  .metrics-card {
    min-height: 240px;
  }

  .metrics-card__chart {
    min-height: 200px;
  }
}
</style>
