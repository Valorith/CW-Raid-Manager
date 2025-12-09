<template>
  <section class="raids">
    <header class="section-header">
      <div>
        <h1>Raid Planner</h1>
      </div>
      <button
        v-if="canCreateRaid && selectedGuildId"
        class="btn"
        @click="() => openRaidModal()"
      >
        New Raid
      </button>
    </header>

    <div v-if="selectedGuildId">
      <p v-if="loadingRaids" class="muted">Loading raids…</p>

      <div v-else>
        <div class="tabs">
          <button
            :class="['tab', { 'tab--active': activeTab === 'active' }]"
            type="button"
            @click="activeTab = 'active'"
          >
            Calendar
          </button>
          <button
            :class="['tab', { 'tab--active': activeTab === 'history' }]"
            type="button"
            @click="activeTab = 'history'"
          >
            History
          </button>
        </div>
        <div v-if="activeTab === 'active'" class="calendar-view" ref="calendarViewRef">
          <div class="calendar-toolbar">
            <div class="calendar-toolbar__main">
              <div>
                <p class="calendar-toolbar__eyebrow">{{ availabilityMode ? 'Set Your Availability' : 'Raid Schedule' }}</p>
                <h2>{{ calendarMonthLabel }}</h2>
              </div>
            </div>
            <div class="calendar-toolbar__actions">
              <button
                :class="['availability-toggle-btn', { 'availability-toggle-btn--active': availabilityMode }]"
                type="button"
                @click="toggleAvailabilityMode"
                :title="availabilityMode ? 'Exit availability mode' : 'Set your availability'"
              >
                <span class="availability-toggle-btn__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                    <path v-if="!availabilityMode" d="M9 16l2 2 4-4"></path>
                    <template v-else>
                      <line x1="9" y1="14" x2="15" y2="20"></line>
                      <line x1="15" y1="14" x2="9" y2="20"></line>
                    </template>
                  </svg>
                </span>
                <span class="availability-toggle-btn__label">{{ availabilityMode ? 'Done' : 'Availability' }}</span>
              </button>
              <div class="calendar-nav-divider"></div>
              <button class="calendar-nav-btn" type="button" @click="goToPreviousMonth">
                ‹
              </button>
              <button class="calendar-nav-btn calendar-nav-btn--today" type="button" @click="goToCurrentMonth">
                Today
              </button>
              <button class="calendar-nav-btn" type="button" @click="goToNextMonth">
                ›
              </button>
            </div>
          </div>
          <p class="calendar-subtitle">
            <template v-if="availabilityMode">
              Click or drag to select days, then mark your availability. Raids created on days you mark unavailable will auto-sign you as "Not Attending".
            </template>
            <template v-else>
              Showing every raid scheduled for {{ calendarMonthDescription }}
            </template>
          </p>
          <p v-if="!monthHasRaids && !loadingRaids && !availabilityMode" class="muted calendar-empty-hint">
            No raids scheduled this month yet. Right-click a day to add one.
          </p>

          <!-- Availability action panel -->
          <div v-if="availabilityMode" class="availability-panel">
            <div class="availability-panel__legend">
              <div class="availability-legend-item">
                <span class="availability-indicator availability-indicator--unavailable"></span>
                <span>Unavailable</span>
              </div>
              <div class="availability-legend-item">
                <span class="availability-indicator availability-indicator--available"></span>
                <span>Available</span>
              </div>
            </div>
            <div v-if="selectedDates.size > 0" class="availability-panel__actions">
              <span class="availability-panel__count">{{ selectedDates.size }} day{{ selectedDates.size === 1 ? '' : 's' }} selected</span>
              <div class="availability-panel__buttons">
                <select v-model="pendingAvailabilityStatus" class="availability-status-select">
                  <option value="UNAVAILABLE">Mark Unavailable</option>
                  <option value="AVAILABLE">Mark Available</option>
                </select>
                <button
                  class="btn btn--small"
                  :disabled="savingAvailability"
                  @click="saveAvailability"
                >
                  {{ savingAvailability ? 'Saving...' : 'Apply' }}
                </button>
                <button
                  class="btn btn--small btn--outline"
                  :disabled="savingAvailability"
                  @click="clearSelectedAvailability"
                >
                  Clear
                </button>
                <button
                  class="btn btn--small btn--ghost"
                  @click="cancelAvailabilitySelection"
                >
                  Cancel
                </button>
              </div>
            </div>
            <p v-else class="availability-panel__hint">
              Click on a day or drag across multiple days to select them
            </p>
          </div>
          <div class="raid-calendar">
            <div class="raid-calendar__weekday-row raid-calendar--desktop">
              <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
            </div>
            <div
              class="raid-calendar__grid raid-calendar--desktop"
              @mouseup="handleAvailabilityDayMouseUp"
              @mouseleave="handleAvailabilityDayMouseUp"
            >
              <article
                v-for="day in calendarDays"
                :key="day.key"
                :class="[
                  'raid-calendar__day',
                  {
                    'raid-calendar__day--muted': !day.isCurrentMonth,
                    'raid-calendar__day--today': day.isToday,
                    'raid-calendar__day--past': day.isPast && !day.isToday,
                    'raid-calendar__day--availability-mode': availabilityMode,
                    'raid-calendar__day--selected': availabilityMode && selectedDates.has(day.key),
                    'raid-calendar__day--unavailable': getDayAvailabilityStatus(day.key) === 'UNAVAILABLE',
                    'raid-calendar__day--available': getDayAvailabilityStatus(day.key) === 'AVAILABLE'
                  }
                ]"
                @contextmenu.prevent.stop="!availabilityMode && handleCalendarDayContextMenu(day, $event)"
                @mousedown.prevent="handleAvailabilityDayMouseDown(day)"
                @mouseenter="handleAvailabilityDayMouseEnter(day)"
              >
                <header class="raid-calendar__day-header">
                  <span>{{ day.date.getDate() }}</span>
                  <span v-if="day.isToday" class="raid-calendar__today-pill">Today</span>
                  <span
                    v-if="!availabilityMode && getDayAvailabilityStatus(day.key)"
                    :class="[
                      'availability-badge',
                      getDayAvailabilityStatus(day.key) === 'UNAVAILABLE'
                        ? 'availability-badge--unavailable'
                        : 'availability-badge--available'
                    ]"
                    :title="getDayAvailabilityStatus(day.key) === 'UNAVAILABLE' ? 'You marked this day as unavailable' : 'You marked this day as available'"
                  >
                    {{ getDayAvailabilityStatus(day.key) === 'UNAVAILABLE' ? 'Away' : 'Free' }}
                  </span>
                </header>
                <div class="raid-calendar__events">
                  <div
                    v-for="raid in day.raids"
                    :key="raid.id"
                    class="raid-calendar-event"
                    :class="{ 'raid-calendar-event--active': raid.startedAt && !raid.endedAt }"
                    role="button"
                    tabindex="0"
                    @click="openRaid(raid.id)"
                    @keydown.enter.prevent="openRaid(raid.id)"
                    @keydown.space.prevent="openRaid(raid.id)"
                  >
                    <div class="raid-calendar-event__header">
                      <div class="raid-calendar-event__title">
                        <span
                          v-if="raid.hasUnassignedLoot"
                          class="raid-alert"
                          role="img"
                          aria-label="Loot pending assignment"
                          title="Loot pending assignment"
                        >
                          ❗
                        </span>
                        <span
                          v-if="raid.isRecurring"
                          class="raid-recurring-icon"
                          role="img"
                          :title="recurrenceTooltip(raid)"
                          :aria-label="recurrenceTooltip(raid)"
                        >
                          ♻️
                        </span>
                        <span>{{ raid.name }}</span>
                      </div>
                      <span :class="['badge', getRaidStatus(raid.id).variant]">
                        {{ getRaidStatus(raid.id).label }}
                      </span>
                    </div>
                    <p class="raid-calendar-event__meta">
                      <span>{{ formatTime(raid.startTime) }}</span>
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • <span>{{ formatTargetZones(raid.targetZones) }}</span>
                      </template>
                    </p>
                    <div class="raid-calendar-event__actions">
                      <span
                        v-if="raid.logMonitor?.isActive"
                        class="raid-monitor-indicator raid-monitor-indicator--small"
                        role="img"
                        :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <div class="raid-calendar-event__right">
                        <div
                          v-if="raid.signupCounts && (raid.signupCounts.confirmed > 0 || raid.signupCounts.notAttending > 0)"
                          class="raid-calendar-event__signups"
                        >
                          <span
                            v-if="raid.signupCounts.confirmed > 0"
                            class="signup-count signup-count--attending"
                            title="Attending"
                          >
                            {{ raid.signupCounts.confirmed }}
                          </span>
                          <span
                            v-if="raid.signupCounts.notAttending > 0"
                            class="signup-count signup-count--not-attending"
                            title="Not Attending"
                          >
                            {{ raid.signupCounts.notAttending }}
                          </span>
                        </div>
                        <div class="raid-calendar-event__buttons">
                          <button
                            class="copy-button"
                            type="button"
                            :disabled="sharingRaidId === raid.id"
                            @click.stop="shareRaid(raid)"
                            title="Copy share link"
                          >
                            <span aria-hidden="true">🔗</span>
                            <span class="sr-only">Copy share link</span>
                          </button>
                          <button
                            v-if="canCopyRaid(raid)"
                            class="copy-button"
                            type="button"
                            :disabled="copyingRaidId === raid.id"
                            @click.stop="copyRaid(raid)"
                            title="Copy raid"
                          >
                            <span aria-hidden="true">📄</span>
                            <span class="sr-only">Copy raid</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- Availability counters -->
                <div
                  v-if="!availabilityMode && getDayAvailabilitySummary(day.key)"
                  class="raid-calendar__availability-counters"
                >
                  <button
                    v-if="getDayAvailabilitySummary(day.key)?.availableCount"
                    class="availability-counter availability-counter--available"
                    type="button"
                    :title="`${getDayAvailabilitySummary(day.key)?.availableCount} member${getDayAvailabilitySummary(day.key)?.availableCount === 1 ? '' : 's'} available`"
                    @click.stop="openAvailabilityModal(day.key, 'AVAILABLE')"
                  >
                    {{ getDayAvailabilitySummary(day.key)?.availableCount }}
                  </button>
                  <button
                    v-if="getDayAvailabilitySummary(day.key)?.unavailableCount"
                    class="availability-counter availability-counter--unavailable"
                    type="button"
                    :title="`${getDayAvailabilitySummary(day.key)?.unavailableCount} member${getDayAvailabilitySummary(day.key)?.unavailableCount === 1 ? '' : 's'} unavailable`"
                    @click.stop="openAvailabilityModal(day.key, 'UNAVAILABLE')"
                  >
                    {{ getDayAvailabilitySummary(day.key)?.unavailableCount }}
                  </button>
                </div>
              </article>
            </div>
            <!-- Mobile agenda view (non-availability mode) -->
            <div class="raid-calendar--mobile" v-if="!availabilityMode">
              <div
                v-for="day in calendarAgendaDays"
                :key="day.key"
                class="raid-agenda-day"
              >
                <header class="raid-agenda-day__header">
                  <div class="raid-agenda-day__header-left">
                    <p class="raid-agenda-day__date">{{ day.dateLabel }}</p>
                    <p class="raid-agenda-day__weekday">{{ day.weekday }}</p>
                  </div>
                  <div class="raid-agenda-day__header-right">
                    <span
                      v-if="getDayAvailabilityStatus(day.key)"
                      :class="[
                        'availability-badge',
                        getDayAvailabilityStatus(day.key) === 'UNAVAILABLE'
                          ? 'availability-badge--unavailable'
                          : 'availability-badge--available'
                      ]"
                      :title="getDayAvailabilityStatus(day.key) === 'UNAVAILABLE' ? 'You marked this day as unavailable' : 'You marked this day as available'"
                    >
                      {{ getDayAvailabilityStatus(day.key) === 'UNAVAILABLE' ? 'Away' : 'Free' }}
                    </span>
                    <span class="raid-agenda-day__count">{{ day.raids.length }} raid{{ day.raids.length === 1 ? '' : 's' }}</span>
                  </div>
                </header>
                <div class="raid-agenda-day__events">
                  <div
                    v-for="raid in day.raids"
                    :key="raid.id"
                    class="raid-calendar-event raid-calendar-event--mobile"
                    :class="{ 'raid-calendar-event--active': raid.startedAt && !raid.endedAt }"
                    role="button"
                    tabindex="0"
                    @click="openRaid(raid.id)"
                    @keydown.enter.prevent="openRaid(raid.id)"
                    @keydown.space.prevent="openRaid(raid.id)"
                  >
                    <div class="raid-calendar-event__header">
                      <div class="raid-calendar-event__title">
                        <span
                          v-if="raid.hasUnassignedLoot"
                          class="raid-alert"
                          role="img"
                          aria-label="Loot pending assignment"
                          title="Loot pending assignment"
                        >
                          ❗
                        </span>
                        <span
                          v-if="raid.isRecurring"
                          class="raid-recurring-icon"
                          role="img"
                          :title="recurrenceTooltip(raid)"
                          :aria-label="recurrenceTooltip(raid)"
                        >
                          ♻️
                        </span>
                        <span>{{ raid.name }}</span>
                      </div>
                      <span :class="['badge', getRaidStatus(raid.id).variant]">
                        {{ getRaidStatus(raid.id).label }}
                      </span>
                    </div>
                    <p class="raid-calendar-event__meta">
                      <span>{{ formatTime(raid.startTime) }}</span>
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • <span>{{ formatTargetZones(raid.targetZones) }}</span>
                      </template>
                    </p>
                    <div class="raid-calendar-event__actions">
                      <span
                        v-if="raid.logMonitor?.isActive"
                        class="raid-monitor-indicator raid-monitor-indicator--small"
                        role="img"
                        :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <div class="raid-calendar-event__right">
                        <div
                          v-if="raid.signupCounts && (raid.signupCounts.confirmed > 0 || raid.signupCounts.notAttending > 0)"
                          class="raid-calendar-event__signups"
                        >
                          <span
                            v-if="raid.signupCounts.confirmed > 0"
                            class="signup-count signup-count--attending"
                            title="Attending"
                          >
                            {{ raid.signupCounts.confirmed }}
                          </span>
                          <span
                            v-if="raid.signupCounts.notAttending > 0"
                            class="signup-count signup-count--not-attending"
                            title="Not Attending"
                          >
                            {{ raid.signupCounts.notAttending }}
                          </span>
                        </div>
                        <div class="raid-calendar-event__buttons">
                          <button
                            class="copy-button"
                            type="button"
                            :disabled="sharingRaidId === raid.id"
                            @click.stop="shareRaid(raid)"
                            title="Copy share link"
                          >
                            <span aria-hidden="true">🔗</span>
                            <span class="sr-only">Copy share link</span>
                          </button>
                          <button
                            v-if="canCopyRaid(raid)"
                            class="copy-button"
                            type="button"
                            :disabled="copyingRaidId === raid.id"
                            @click.stop="copyRaid(raid)"
                            title="Copy raid"
                          >
                            <span aria-hidden="true">📄</span>
                            <span class="sr-only">Copy raid</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- Availability counters for mobile agenda -->
                <div
                  v-if="getDayAvailabilitySummary(day.key)"
                  class="raid-agenda-day__availability"
                >
                  <button
                    v-if="getDayAvailabilitySummary(day.key)?.availableCount"
                    class="availability-counter availability-counter--available"
                    type="button"
                    :title="`${getDayAvailabilitySummary(day.key)?.availableCount} member${getDayAvailabilitySummary(day.key)?.availableCount === 1 ? '' : 's'} available`"
                    @click.stop="openAvailabilityModal(day.key, 'AVAILABLE')"
                  >
                    {{ getDayAvailabilitySummary(day.key)?.availableCount }}
                  </button>
                  <button
                    v-if="getDayAvailabilitySummary(day.key)?.unavailableCount"
                    class="availability-counter availability-counter--unavailable"
                    type="button"
                    :title="`${getDayAvailabilitySummary(day.key)?.unavailableCount} member${getDayAvailabilitySummary(day.key)?.unavailableCount === 1 ? '' : 's'} unavailable`"
                    @click.stop="openAvailabilityModal(day.key, 'UNAVAILABLE')"
                  >
                    {{ getDayAvailabilitySummary(day.key)?.unavailableCount }}
                  </button>
                </div>
                <div
                  v-if="dayContextMenu.visible"
                  class="raid-calendar-context"
                  :style="{ top: `${dayContextMenu.y}px`, left: `${dayContextMenu.x}px` }"
                >
                  <p class="raid-calendar-context__label">
                    Plan new raid on {{ contextMenuDateLabel }}
                  </p>
                  <button type="button" class="raid-calendar-context__action" @click="scheduleContextRaid">
                    Create raid
                  </button>
                  <button type="button" class="raid-calendar-context__close" @click="hideDayContextMenu">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            <!-- Mobile calendar grid for availability mode -->
            <div class="raid-calendar--mobile raid-calendar--mobile-availability" v-if="availabilityMode">
              <div class="raid-calendar-mobile__weekdays">
                <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
              </div>
              <div
                class="raid-calendar-mobile__grid"
                @touchend="handleMobileAvailabilityTouchEnd"
              >
                <button
                  v-for="day in calendarDays"
                  :key="day.key"
                  type="button"
                  :class="[
                    'raid-calendar-mobile__day',
                    {
                      'raid-calendar-mobile__day--muted': !day.isCurrentMonth,
                      'raid-calendar-mobile__day--today': day.isToday,
                      'raid-calendar-mobile__day--past': day.isPast && !day.isToday,
                      'raid-calendar-mobile__day--selected': selectedDates.has(day.key),
                      'raid-calendar-mobile__day--unavailable': getDayAvailabilityStatus(day.key) === 'UNAVAILABLE',
                      'raid-calendar-mobile__day--available': getDayAvailabilityStatus(day.key) === 'AVAILABLE',
                      'raid-calendar-mobile__day--has-raids': day.raids.length > 0
                    }
                  ]"
                  @click="handleMobileAvailabilityDayClick(day)"
                >
                  <span class="raid-calendar-mobile__day-number">{{ day.date.getDate() }}</span>
                  <span v-if="day.raids.length > 0" class="raid-calendar-mobile__day-dot"></span>
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="dayContextMenu.visible"
            class="raid-calendar-context"
            :style="{ top: `${dayContextMenu.y}px`, left: `${dayContextMenu.x}px` }"
          >
            <p class="raid-calendar-context__label">
              Plan new raid on {{ contextMenuDateLabel }}
            </p>
            <button type="button" class="raid-calendar-context__action" @click="scheduleContextRaid">
              Create raid
            </button>
            <button type="button" class="raid-calendar-context__close" @click="hideDayContextMenu">
              Cancel
            </button>
          </div>
        </div>

        <div v-else>
          <p v-if="historyRaids.length === 0" class="muted empty-state">No completed raids found.</p>
          <ul v-else class="raid-list">
            <li
              v-for="raid in historyRaids"
              :key="raid.id"
              :class="[
                'raid-list__item',
                { 'raid-list__item--active': raid.startedAt && !raid.endedAt }
              ]"
              role="button"
              tabindex="0"
              @click="openRaid(raid.id)"
              @keydown.enter.prevent="openRaid(raid.id)"
              @keydown.space.prevent="openRaid(raid.id)"
            >
              <div class="raid-info">
                <div class="raid-info__primary">
                  <span
                    v-if="raid.hasUnassignedLoot"
                    class="raid-alert"
                    role="img"
                    aria-label="Loot pending assignment"
                    title="Loot pending assignment"
                  >
                    ❗
                  </span>
                  <div class="raid-info__content">
                    <strong>
                      <span
                        v-if="raid.isRecurring"
                        class="raid-recurring-icon"
                        role="img"
                        :title="recurrenceTooltip(raid)"
                        :aria-label="recurrenceTooltip(raid)"
                      >
                        ♻️
                      </span>
                      {{ raid.name }}
                    </strong>
                    <span class="muted">
                      ({{ formatDate(raid.startTime) }})
                      <template v-if="formatTargetZones(raid.targetZones)">
                        • {{ formatTargetZones(raid.targetZones) }}
                      </template>
                    </span>
                  </div>
                </div>
              </div>
              <div class="raid-meta">
                <span
                  v-if="raid.logMonitor?.isActive"
                  class="raid-monitor-indicator"
                  role="img"
                  :aria-label="`Continuous monitoring active${raid.logMonitor?.userDisplayName ? ' by ' + raid.logMonitor.userDisplayName : ''}`"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 12h3l2 6 4-12 2 6h4l2 6 1-3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span :class="['badge', getRaidStatus(raid.id).variant]">
                  {{ getRaidStatus(raid.id).label }}
                </span>
                <button
                  class="copy-button"
                  type="button"
                  :disabled="sharingRaidId === raid.id"
                  @click.stop="shareRaid(raid)"
                  title="Copy share link"
                >
                  <span aria-hidden="true">🔗</span>
                  <span class="sr-only">Copy share link</span>
                </button>
                <button
                  v-if="canCopyRaid(raid)"
                  class="copy-button"
                  type="button"
                  :disabled="copyingRaidId === raid.id"
                  @click.stop="copyRaid(raid)"
                  title="Copy raid"
                >
                  <span aria-hidden="true">📄</span>
                  <span class="sr-only">Copy raid</span>
                </button>
                <button class="btn btn--outline" @click.stop="openRaid(raid.id)">
                  Open
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div v-else-if="hasGuildMembership" class="empty-state empty-state--member">
      You do not currently have access to any guild raids.
    </div>
    <div v-else class="empty-state">Join a guild to plan and review raids.</div>
    <RaidModal
      v-if="showRaidModal"
      :guild-id="selectedGuildId"
      :default-start-time="selectedGuildDefaults?.start ?? null"
      :default-end-time="selectedGuildDefaults?.end ?? null"
      :default-discord-voice-url="selectedGuildDefaults?.voice ?? null"
      :initial-start-date-time="scheduledStartDate"
      @close="handleRaidClose"
      @created="handleRaidCreated"
    />

    <!-- Availability Details Modal -->
    <div
      v-if="availabilityModal.visible"
      class="modal-backdrop"
      @click.self="closeAvailabilityModal"
    >
      <div class="availability-modal">
        <header class="availability-modal__header">
          <div>
            <h2 class="availability-modal__title">
              {{ availabilityModal.status === 'AVAILABLE' ? 'Available' : 'Unavailable' }} Members
            </h2>
            <p class="availability-modal__date">{{ formatModalDate(availabilityModal.date) }}</p>
          </div>
          <button class="icon-button" @click="closeAvailabilityModal">✕</button>
        </header>
        <div class="availability-modal__content">
          <p v-if="availabilityModal.loading" class="muted">Loading...</p>
          <p v-else-if="availabilityModal.members.length === 0" class="muted">No members found.</p>
          <ul v-else class="availability-modal__list">
            <li
              v-for="member in availabilityModal.members"
              :key="member.userId"
              class="availability-modal__member"
            >
              <div class="availability-modal__member-info">
                <span class="availability-modal__member-name">{{ member.displayName }}</span>
                <span v-if="member.mainCharacters.length > 0" class="availability-modal__member-character">
                  {{ member.mainCharacters.map(c => `${c.name} (${c.class})`).join(', ') }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import RaidModal from '../components/RaidModal.vue';

import { api, type RaidEventSummary, type CalendarAvailabilityEntry, type AvailabilityStatus, type AvailabilitySummary, type AvailabilityUserDetail } from '../services/api';
import type { GuildRole } from '../services/types';
import { useAuthStore } from '../stores/auth';

type RaidStatusVariant = 'badge--neutral' | 'badge--positive' | 'badge--negative';
type RaidStatusBadge = { label: string; variant: RaidStatusVariant };

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const todayKey = formatDateKey(new Date());

const raids = ref<RaidEventSummary[]>([]);
const selectedGuildPermissions = ref<{ canManage: boolean; role: GuildRole } | null>(null);
let raidsRefreshTimer: number | null = null;
const calendarViewDate = ref(startOfMonth(new Date()));
const raidStatus = computed(() => {
  const map = new Map<string, RaidStatusBadge>();

  for (const raid of raids.value) {
    const events = raid.attendance ?? [];
    const latest = events.reduce<(typeof events)[number] | null>((current, event) => {
      if (!current) {
        return event;
      }

      return new Date(event.createdAt) > new Date(current.createdAt) ? event : current;
    }, null);

    let label: string;
    let variant: RaidStatusVariant;

    const ended = raidHasEnded(raid);
    const started = raidHasStarted(raid);

    if (latest?.eventType === 'RESTART') {
      label = 'Restarted';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'START' && started) {
      label = 'Started';
      variant = 'badge--positive';
    } else if (latest?.eventType === 'END' || ended) {
      label = 'Ended';
      variant = 'badge--negative';
    } else if (started) {
      label = 'Started';
      variant = 'badge--positive';
    } else {
      label = 'Planned';
      variant = 'badge--neutral';
    }

    map.set(raid.id, { label, variant });
  }

  return map;
});

const authStore = useAuthStore();
const selectedGuildId = ref('');
const loadingRaids = ref(false);
const showRaidModal = ref(false);
const scheduledStartDate = ref<string | null>(null);
const router = useRouter();
const activeTab = ref<'active' | 'history'>('active');
const copyingRaidId = ref<string | null>(null);
const sharingRaidId = ref<string | null>(null);
const calendarViewRef = ref<HTMLElement | null>(null);
const dayContextMenu = reactive<{ visible: boolean; x: number; y: number; date: Date | null }>({
  visible: false,
  x: 0,
  y: 0,
  date: null
});
const guildTimingDefaults = ref<Record<
  string,
  { start: string | null; end: string | null; voice: string | null }
>>({});
const selectedGuildDefaults = computed(() => {
  if (!selectedGuildId.value) {
    return null;
  }
  return guildTimingDefaults.value[selectedGuildId.value] ?? null;
});

// Availability mode state
const availabilityMode = ref(false);
const userAvailability = ref<CalendarAvailabilityEntry[]>([]);
const availabilitySummary = ref<AvailabilitySummary[]>([]);
const selectedDates = ref<Set<string>>(new Set());
const isSelectingDates = ref(false);
const selectionStartDate = ref<string | null>(null);
const pendingAvailabilityStatus = ref<AvailabilityStatus>('UNAVAILABLE');
const savingAvailability = ref(false);
const loadingAvailability = ref(false);

// Availability details modal state
const availabilityModal = reactive<{
  visible: boolean;
  date: string | null;
  status: AvailabilityStatus | null;
  loading: boolean;
  members: AvailabilityUserDetail[];
}>({
  visible: false,
  date: null,
  status: null,
  loading: false,
  members: []
});

// Computed map for quick lookup of user availability by date
const userAvailabilityMap = computed(() => {
  const map = new Map<string, AvailabilityStatus>();
  for (const entry of userAvailability.value) {
    map.set(entry.date, entry.status);
  }
  return map;
});

// Computed map for quick lookup of availability summary by date
const availabilitySummaryMap = computed(() => {
  const map = new Map<string, AvailabilitySummary>();
  for (const entry of availabilitySummary.value) {
    map.set(entry.date, entry);
  }
  return map;
});

async function loadRaids() {
  if (!selectedGuildId.value) {
    raids.value = [];
    selectedGuildPermissions.value = null;
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
    stopRaidsRefreshPolling();
    return;
  }

  loadingRaids.value = true;
  activeTab.value = 'active';
  try {
    const response = await api.fetchRaidsForGuild(selectedGuildId.value);
    raids.value = response.raids;
    selectedGuildPermissions.value = response.permissions ?? null;
    await ensureGuildDefaults(selectedGuildId.value);
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } finally {
    loadingRaids.value = false;
  }
}

function startRaidsRefreshPolling() {
  if (raidsRefreshTimer || !selectedGuildId.value) {
    return;
  }
  raidsRefreshTimer = window.setInterval(() => {
    if (selectedGuildId.value) {
      loadRaids();
    }
  }, 30_000);
}

function stopRaidsRefreshPolling() {
  if (raidsRefreshTimer) {
    clearInterval(raidsRefreshTimer);
    raidsRefreshTimer = null;
  }
}

// Availability functions
async function loadAvailability() {
  if (!selectedGuildId.value) {
    userAvailability.value = [];
    availabilitySummary.value = [];
    return;
  }

  loadingAvailability.value = true;
  try {
    // Get date range for current view (2 months to cover calendar overflow)
    const viewStart = new Date(calendarViewDate.value);
    viewStart.setDate(1);
    const viewEnd = new Date(viewStart);
    viewEnd.setMonth(viewEnd.getMonth() + 2);

    const startDate = viewStart.toISOString().split('T')[0];
    const endDate = viewEnd.toISOString().split('T')[0];

    const [userResponse, summaryResponse] = await Promise.all([
      api.fetchUserAvailability(selectedGuildId.value, startDate, endDate),
      api.fetchAvailabilitySummary(selectedGuildId.value, startDate, endDate)
    ]);

    userAvailability.value = userResponse.availability;
    availabilitySummary.value = summaryResponse.summary;
  } catch (error) {
    console.error('Failed to load availability:', error);
  } finally {
    loadingAvailability.value = false;
  }
}

function toggleAvailabilityMode() {
  availabilityMode.value = !availabilityMode.value;
  if (availabilityMode.value) {
    loadAvailability();
  } else {
    // Clear selection when exiting availability mode
    selectedDates.value = new Set();
    isSelectingDates.value = false;
    selectionStartDate.value = null;
  }
}

function handleAvailabilityDayMouseDown(day: { key: string; date: Date }) {
  if (!availabilityMode.value) return;

  isSelectingDates.value = true;
  selectionStartDate.value = day.key;

  // If clicking on an already selected date, we'll toggle it
  if (selectedDates.value.has(day.key)) {
    selectedDates.value = new Set();
  } else {
    selectedDates.value = new Set([day.key]);
  }
}

function handleAvailabilityDayMouseEnter(day: { key: string; date: Date }) {
  if (!availabilityMode.value || !isSelectingDates.value || !selectionStartDate.value) return;

  // Get range of dates between start and current
  // Use parseDateKey to avoid timezone issues with YYYY-MM-DD strings
  const startDate = parseDateKey(selectionStartDate.value);
  const endDate = day.date;

  const newSelection = new Set<string>();
  const minDate = startDate < endDate ? startDate : endDate;
  const maxDate = startDate < endDate ? endDate : startDate;

  let current = new Date(minDate);
  while (current <= maxDate) {
    newSelection.add(formatDateKey(current));
    current = addDays(current, 1);
  }

  selectedDates.value = newSelection;
}

function handleAvailabilityDayMouseUp() {
  isSelectingDates.value = false;
}

function handleAvailabilityDayClick(day: { key: string; date: Date }) {
  if (!availabilityMode.value) return;

  // Toggle single date selection
  const newSelection = new Set(selectedDates.value);
  if (newSelection.has(day.key)) {
    newSelection.delete(day.key);
  } else {
    newSelection.add(day.key);
  }
  selectedDates.value = newSelection;
}

// Mobile-specific availability handlers
function handleMobileAvailabilityDayClick(day: { key: string; date: Date }) {
  if (!availabilityMode.value) return;

  // Toggle single date selection for mobile
  const newSelection = new Set(selectedDates.value);
  if (newSelection.has(day.key)) {
    newSelection.delete(day.key);
  } else {
    newSelection.add(day.key);
  }
  selectedDates.value = newSelection;
}

function handleMobileAvailabilityTouchEnd() {
  // Reset any ongoing selection state on touch end
  isSelectingDates.value = false;
}

async function saveAvailability() {
  if (!selectedGuildId.value || selectedDates.value.size === 0) return;

  savingAvailability.value = true;
  try {
    const updates = Array.from(selectedDates.value).map((date) => ({
      date,
      status: pendingAvailabilityStatus.value
    }));

    await api.updateUserAvailability(selectedGuildId.value, updates);

    // Reload availability data
    await loadAvailability();

    // Clear selection
    selectedDates.value = new Set();
  } catch (error) {
    console.error('Failed to save availability:', error);
    window.alert('Failed to save availability. Please try again.');
  } finally {
    savingAvailability.value = false;
  }
}

async function clearSelectedAvailability() {
  if (!selectedGuildId.value || selectedDates.value.size === 0) return;

  savingAvailability.value = true;
  try {
    await api.deleteUserAvailability(
      selectedGuildId.value,
      Array.from(selectedDates.value)
    );

    // Reload availability data
    await loadAvailability();

    // Clear selection
    selectedDates.value = new Set();
  } catch (error) {
    console.error('Failed to clear availability:', error);
    window.alert('Failed to clear availability. Please try again.');
  } finally {
    savingAvailability.value = false;
  }
}

function cancelAvailabilitySelection() {
  selectedDates.value = new Set();
}

function getDayAvailabilityStatus(dateKey: string): AvailabilityStatus | null {
  return userAvailabilityMap.value.get(dateKey) ?? null;
}

function getDayAvailabilitySummary(dateKey: string): AvailabilitySummary | null {
  return availabilitySummaryMap.value.get(dateKey) ?? null;
}

async function openAvailabilityModal(dateKey: string, status: AvailabilityStatus) {
  if (!selectedGuildId.value) return;

  availabilityModal.visible = true;
  availabilityModal.date = dateKey;
  availabilityModal.status = status;
  availabilityModal.loading = true;
  availabilityModal.members = [];

  try {
    const response = await api.fetchAvailabilityDetails(selectedGuildId.value, dateKey);
    // Filter to only show members with the selected status
    availabilityModal.members = response.details.filter((m) => m.status === status);
  } catch (error) {
    console.error('Failed to load availability details:', error);
    availabilityModal.members = [];
  } finally {
    availabilityModal.loading = false;
  }
}

function closeAvailabilityModal() {
  availabilityModal.visible = false;
  availabilityModal.date = null;
  availabilityModal.status = null;
  availabilityModal.members = [];
}

function formatModalDate(dateKey: string | null): string {
  if (!dateKey) return '';
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

const canCreateRaid = computed(() => Boolean(selectedGuildPermissions.value?.canManage));
const hasGuildMembership = computed(() => (authStore.user?.guilds?.length ?? 0) > 0);

const historyRaids = computed(() =>
  raids.value
    .filter((raid) => isHistoryRaid(raid))
    .sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
);

const raidsByDate = computed(() => {
  const map = new Map<string, RaidEventSummary[]>();
  for (const raid of raids.value) {
    const key = formatDateKey(new Date(raid.startTime));
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(raid);
  }
  for (const [, value] of map) {
    value.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }
  return map;
});

const calendarDays = computed(() => {
  const days: Array<{
    key: string;
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    isPast: boolean;
    raids: RaidEventSummary[];
  }> = [];
  const start = startOfWeek(calendarViewDate.value);
  const todayStart = startOfDay(new Date());
  for (let i = 0; i < 42; i += 1) {
    const current = addDays(start, i);
    const key = formatDateKey(current);
    days.push({
      key,
      date: current,
      isCurrentMonth: current.getMonth() === calendarViewDate.value.getMonth(),
      isToday: key === todayKey,
      isPast: current < todayStart,
      raids: raidsByDate.value.get(key) ?? []
    });
  }
  return days;
});

const calendarMonthLabel = computed(() => {
  return calendarViewDate.value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
});

const calendarMonthDescription = computed(() => {
  return calendarViewDate.value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
});

const monthHasRaids = computed(() =>
  calendarDays.value.some((day) => day.isCurrentMonth && day.raids.length)
);

const calendarAgendaDays = computed(() =>
  calendarDays.value
    .filter((day) => day.raids.length && day.isCurrentMonth)
    .map((day) => ({
      key: day.key,
      dateLabel: day.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
      weekday: WEEKDAY_LABELS[day.date.getDay()],
      raids: day.raids
    }))
);

const contextMenuDateLabel = computed(() => {
  if (!dayContextMenu.date) {
    return '';
  }
  return dayContextMenu.date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
});

function openRaidModal(prefillDate?: Date | null) {
  if (!selectedGuildId.value || !canCreateRaid.value) {
    return;
  }
  if (prefillDate) {
    scheduledStartDate.value = buildRaidStartDateTime(prefillDate);
  } else {
    scheduledStartDate.value = null;
  }
  hideDayContextMenu();
  showRaidModal.value = true;
}

function handleRaidCreated() {
  showRaidModal.value = false;
  scheduledStartDate.value = null;
  loadRaids();
}

function handleRaidClose() {
  showRaidModal.value = false;
  scheduledStartDate.value = null;
}

function getRaidStatus(raidId: string) {
  const status = raidStatus.value.get(raidId);
  return status ?? { label: 'Planned', variant: 'badge--neutral' };
}

function openRaid(raidId: string) {
  router.push({ name: 'RaidDetail', params: { raidId } });
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown start';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatDateOnly(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown date';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(parsed);
}

function formatTargetZones(zones: unknown): string {
  if (!Array.isArray(zones)) {
    return '';
  }

  const labels = zones
    .map((zone) => (typeof zone === 'string' ? zone.trim() : zone))
    .filter((zone): zone is string => typeof zone === 'string' && zone.length > 0);

  return labels.length > 0 ? labels.join(', ') : '';
}

function recurrenceTooltip(raid: RaidEventSummary) {
  if (!raid.isRecurring || !raid.recurrence) {
    return 'Recurring raid';
  }

  const unit = raid.recurrence.frequency === 'DAILY'
    ? 'day'
    : raid.recurrence.frequency === 'MONTHLY'
      ? 'month'
      : 'week';
  const interval = Math.max(1, raid.recurrence.interval);
  const everyLabel = interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;

  let summary = `Repeats ${everyLabel}`;
  if (raid.recurrence.endDate) {
    summary += ` until ${formatDateOnly(raid.recurrence.endDate)}`;
  }
  if (raid.recurrence.isActive === false) {
    summary += ' (paused)';
  }
  return summary;
}

async function ensureGuildDefaults(guildId: string) {
  if (!guildId || guildTimingDefaults.value[guildId]) {
    return;
  }
  try {
    const detail = await api.fetchGuildDetail(guildId);
    guildTimingDefaults.value[guildId] = {
      start: detail.defaultRaidStartTime ?? null,
      end: detail.defaultRaidEndTime ?? null,
      voice: detail.defaultDiscordVoiceUrl ?? null
    };
  } catch (error) {
    console.warn('Failed to load guild defaults for raid planning', error);
  }
}

function canCopyRaid(raid: RaidEventSummary) {
  if (typeof raid.permissions?.canManage === 'boolean') {
    return raid.permissions.canManage;
  }
  return Boolean(selectedGuildPermissions.value?.canManage);
}

async function shareRaid(raid: RaidEventSummary) {
  if (sharingRaidId.value === raid.id) {
    return;
  }
  sharingRaidId.value = raid.id;
  try {
    const resolved = router.resolve({ name: 'RaidDetail', params: { raidId: raid.id } }).href;
    const absoluteUrl = typeof window !== 'undefined'
      ? new URL(resolved, window.location.origin).toString()
      : resolved;

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

    window.dispatchEvent(
      new CustomEvent('raid-share-copied', {
        detail: {
          raidId: raid.id,
          raidName: raid.name
        }
      })
    );
  } catch (error) {
    console.warn('Failed to copy raid share link', error);
    window.alert('Unable to copy raid link. Please try again.');
  } finally {
    sharingRaidId.value = null;
  }
}

async function copyRaid(raid: RaidEventSummary) {
  if (!canCopyRaid(raid) || copyingRaidId.value || !selectedGuildId.value) {
    return;
  }
  copyingRaidId.value = raid.id;
  try {
    await api.createRaidEvent({
      guildId: selectedGuildId.value,
      name: raid.name,
      startTime: raid.startTime,
      targetZones: ensureTargets(raid.targetZones),
      targetBosses: ensureTargets(raid.targetBosses),
      notes: raid.notes ?? undefined,
      discordVoiceUrl: raid.discordVoiceUrl ?? undefined,
      recurrence:
        raid.isRecurring && raid.recurrence?.isActive !== false && raid.recurrence
          ? {
              frequency: raid.recurrence.frequency,
              interval: raid.recurrence.interval,
              endDate: raid.recurrence.endDate ?? null
            }
          : null
    });
    await loadRaids();
    window.dispatchEvent(new CustomEvent('active-raid-updated'));
  } catch (error) {
    window.alert('Unable to copy raid. Please try again.');
    console.warn('Failed to copy raid', error);
  } finally {
    copyingRaidId.value = null;
  }
}

function ensureTargets(targets: RaidEventSummary['targetZones']) {
  if (Array.isArray(targets) && targets.length > 0) {
    return targets;
  }
  return ['Unspecified Target'];
}

function raidHasEnded(raid: RaidEventSummary) {
  if (!raid.endedAt) {
    return false;
  }
  return new Date(raid.endedAt).getTime() <= Date.now();
}

function raidHasStarted(raid: RaidEventSummary) {
  if (!raid.startedAt) {
    return false;
  }
  return new Date(raid.startedAt).getTime() <= Date.now();
}

function isHistoryRaid(raid: RaidEventSummary) {
  if (raidHasEnded(raid)) {
    return true;
  }

  const start = new Date(raid.startTime);
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return start <= twoDaysAgo;
}

function formatTime(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function goToPreviousMonth() {
  const next = new Date(calendarViewDate.value);
  next.setMonth(next.getMonth() - 1);
  calendarViewDate.value = startOfMonth(next);
}

function goToNextMonth() {
  const next = new Date(calendarViewDate.value);
  next.setMonth(next.getMonth() + 1);
  calendarViewDate.value = startOfMonth(next);
}

function goToCurrentMonth() {
  calendarViewDate.value = startOfMonth(new Date());
}

function buildRaidStartDateTime(date: Date) {
  const draft = new Date(date);
  const defaultStart = selectedGuildDefaults.value?.start;
  if (defaultStart && /^([01]\d|2[0-3]):([0-5]\d)$/.test(defaultStart)) {
    const [hours, minutes] = defaultStart.split(':').map(Number);
    draft.setHours(hours, minutes, 0, 0);
  } else {
    draft.setHours(20, 0, 0, 0);
  }
  const offset = draft.getTimezoneOffset();
  const local = new Date(draft.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function handleCalendarDayContextMenu(day: { date: Date }, event: MouseEvent) {
  if (!canCreateRaid.value) {
    return;
  }
  const bounds = calendarViewRef.value?.getBoundingClientRect();
  const offsetX = bounds ? event.clientX - bounds.left : event.clientX;
  const offsetY = bounds ? event.clientY - bounds.top : event.clientY;
  dayContextMenu.visible = true;
  dayContextMenu.x = offsetX;
  dayContextMenu.y = offsetY;
  dayContextMenu.date = day.date;
}

function hideDayContextMenu() {
  dayContextMenu.visible = false;
  dayContextMenu.date = null;
}

function scheduleContextRaid() {
  if (!dayContextMenu.date) {
    return;
  }
  scheduleRaidOnDate(dayContextMenu.date);
}

function scheduleRaidOnDate(date: Date) {
  openRaidModal(date);
}

watch(
  () => authStore.primaryGuild,
  (guild) => {
    const newId = guild?.id ?? '';
    if (newId !== selectedGuildId.value) {
      selectedGuildId.value = newId;
      if (selectedGuildId.value) {
        loadRaids();
        loadAvailability();
        startRaidsRefreshPolling();
      } else {
        stopRaidsRefreshPolling();
        raids.value = [];
        selectedGuildPermissions.value = null;
      }
    } else if (newId) {
      loadRaids();
      loadAvailability();
      startRaidsRefreshPolling();
    }
  },
  { immediate: true }
);

watch(selectedGuildId, (guildId) => {
  activeTab.value = 'active';
  goToCurrentMonth();
  if (guildId) {
    ensureGuildDefaults(guildId);
    startRaidsRefreshPolling();
    // Always load availability data when guild changes
    loadAvailability();
  } else {
    stopRaidsRefreshPolling();
    userAvailability.value = [];
    availabilitySummary.value = [];
  }
});

watch(calendarViewDate, () => {
  // Always reload availability when month changes
  if (selectedGuildId.value) {
    loadAvailability();
  }
});

watch(activeTab, () => {
  hideDayContextMenu();
});

onUnmounted(() => {
  window.removeEventListener('click', hideDayContextMenu);
  window.removeEventListener('scroll', hideDayContextMenu, true);
  window.removeEventListener('contextmenu', hideDayContextMenu);
  stopRaidsRefreshPolling();
});

onMounted(() => {
  window.addEventListener('click', hideDayContextMenu);
  window.addEventListener('scroll', hideDayContextMenu, true);
  window.addEventListener('contextmenu', hideDayContextMenu);
});

function startOfMonth(date: Date) {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  // Parse YYYY-MM-DD as local time, not UTC
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}
</script>

<style scoped>
.raids {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  margin: 1.5rem auto;
}

.tab {
  padding: 0.55rem 1.4rem;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  color: #cbd5f5;
  font-size: 0.9rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tab:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(148, 163, 184, 0.45);
  color: #e0f2fe;
}

.tab--active {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 0.75rem;
}

.pagination__label {
  color: #94a3b8;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.pagination__button {
  padding: 0.45rem 0.9rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.55rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.45);
  color: #bae6fd;
  transform: translateY(-1px);
}

.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  margin: 2rem 0;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
}

.raid-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.raid-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, border-color 0.2s ease;
}

.raid-list__item--active {
  border-color: rgba(34, 197, 94, 0.55);
  box-shadow: 0 0 14px rgba(34, 197, 94, 0.25);
}

.raid-list__item:hover,
.raid-list__item:focus {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
  outline: none;
}

.raid-list__item--active:hover,
.raid-list__item--active:focus {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.6);
}

.calendar-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;
}

.calendar-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.calendar-toolbar__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0;
}

.calendar-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.calendar-nav-btn {
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.calendar-nav-btn:hover {
  border-color: rgba(59, 130, 246, 0.6);
  color: #bae6fd;
}

.calendar-nav-btn--today {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
}

.calendar-subtitle {
  margin: 0;
  color: #94a3b8;
}

.calendar-empty-hint {
  margin: 0;
  color: #94a3b8;
  font-size: 0.9rem;
}

.raid-calendar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.raid-calendar__weekday-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  color: #94a3b8;
}

.raid-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-auto-rows: 180px;
  border-radius: 1.2rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.raid-calendar__day {
  position: relative;
  padding: 0.5rem;
  padding-bottom: 2rem; /* Extra space for availability counters */
  background: rgba(15, 23, 42, 0.75);
  border-right: 1px solid rgba(148, 163, 184, 0.15);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-calendar__day:nth-child(7n) {
  border-right: none;
}

.raid-calendar__day:nth-last-child(-n + 7) {
  border-bottom: none;
}

.raid-calendar__day--muted {
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.5);
}

.raid-calendar__day--past {
  opacity: 0.65;
  filter: saturate(0.65);
  background: rgba(15, 23, 42, 0.4);
  color: rgba(148, 163, 184, 0.6);
}

.raid-calendar__day--today {
  box-shadow: inset 0 0 0 3px rgba(59, 130, 246, 0.85);
  background: rgba(59, 130, 246, 0.08);
}

.raid-calendar__day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 0.9rem;
}

.raid-calendar__today-pill {
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.2);
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: #bae6fd;
}

.raid-calendar__events {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 0.2rem;
}

.raid-calendar-event {
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.85);
  padding: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.1s ease;
}

.raid-calendar-event:hover,
.raid-calendar-event:focus-visible {
  border-color: rgba(59, 130, 246, 0.5);
  transform: translateY(-1px);
}

.raid-calendar-event--active {
  border-color: rgba(34, 197, 94, 0.5);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.18);
}

.raid-calendar-event__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  min-width: 0; /* Allow flex children to shrink below content size */
}

.raid-calendar-event__title {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
  min-width: 0; /* Allow truncation */
  overflow: hidden;
}

.raid-calendar-event__title > span:last-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.raid-calendar-event__meta {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.85);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.raid-calendar-event__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.raid-calendar-event__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.raid-calendar-event__signups {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.signup-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.35rem;
  border-radius: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.signup-count--attending {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.signup-count--not-attending {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.raid-calendar-event__buttons {
  display: flex;
  gap: 0.35rem;
}

.raid-calendar-context {
  position: absolute;
  z-index: 10;
  min-width: 220px;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.95);
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.6);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.raid-calendar-context__label {
  margin: 0;
  font-size: 0.85rem;
  color: #e2e8f0;
}

.raid-calendar-context__action,
.raid-calendar-context__close {
  border: none;
  border-radius: 0.6rem;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
  font-weight: 600;
}

.raid-calendar-context__action {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #0f172a;
}

.raid-calendar-context__close {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #cbd5f5;
}

.raid-calendar-event--mobile {
  border: 1px solid rgba(59, 130, 246, 0.35);
}

.raid-calendar--mobile {
  display: none;
}

.raid-agenda-day {
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.75);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.raid-agenda-day__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.raid-agenda-day__date {
  margin: 0;
  font-weight: 600;
}

.raid-agenda-day__weekday {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.raid-agenda-day__count {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
  text-transform: uppercase;
}

.raid-agenda-day__events {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.raid-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-info__primary {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.raid-alert {
  color: #f87171;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
}

.raid-info__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.raid-info strong {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.raid-recurring-icon {
  font-size: 1.05rem;
}

.raid-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.raid-monitor-indicator {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.22), rgba(14, 165, 233, 0.05));
  border: 1px solid rgba(14, 165, 233, 0.6);
  color: #bae6fd;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.35);
}

.raid-monitor-indicator::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  border: 2px solid rgba(14, 165, 233, 0.35);
  animation: raid-monitor-pulse 2s infinite;
  pointer-events: none;
}

.raid-monitor-indicator svg {
  width: 18px;
  height: 18px;
}

.raid-monitor-indicator--small {
  width: 28px;
  height: 28px;
}

@keyframes raid-monitor-pulse {
  0% {
    opacity: 0.85;
    transform: scale(0.9);
  }
  70% {
    opacity: 0;
    transform: scale(1.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.45);
  }
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
  flex-shrink: 0;
}

.badge--neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.badge--positive {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.badge--negative {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.copy-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: #cbd5f5;
  border-radius: 0.5rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.copy-button:hover:not(:disabled),
.copy-button:focus-visible {
  color: #e0f2fe;
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.15);
}

.copy-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.muted {
  color: #94a3b8;
}

.btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  border: none;
  border-radius: 0.5rem;
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

@media (max-width: 900px) {
  .raid-calendar__day {
    min-height: 200px;
  }

  /* Ensure counters remain visible on smaller desktop */
  .raid-calendar__availability-counters {
    bottom: 0.3rem;
    right: 0.3rem;
    gap: 0.25rem;
  }

  .availability-counter {
    min-width: 1.35rem;
    height: 1.35rem;
    padding: 0 0.3rem;
    font-size: 0.7rem;
  }
}

@media (max-width: 768px) {
  .raid-calendar--desktop {
    display: none;
  }

  .raid-calendar--mobile {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
}

/* Availability Mode Styles */
.calendar-nav-divider {
  width: 1px;
  height: 24px;
  background: rgba(148, 163, 184, 0.25);
  margin: 0 0.5rem;
}

.availability-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.availability-toggle-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #bae6fd;
}

.availability-toggle-btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.55);
  color: #bae6fd;
}

.availability-toggle-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.availability-toggle-btn__icon svg {
  width: 100%;
  height: 100%;
}

.availability-toggle-btn__label {
  white-space: nowrap;
}

/* Availability Panel */
.availability-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0.75rem 0 1rem;
  padding: 0.85rem 1.1rem;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.9) 100%);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 0.75rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.availability-panel__legend {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.availability-legend-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  color: #94a3b8;
}

.availability-indicator {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}

.availability-indicator--unavailable {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.availability-indicator--available {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
}

.availability-panel__actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.availability-panel__count {
  font-size: 0.85rem;
  color: #bae6fd;
  font-weight: 500;
}

.availability-panel__buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.availability-status-select {
  padding: 0.4rem 0.65rem;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.4rem;
  color: #e2e8f0;
  font-size: 0.8rem;
  cursor: pointer;
}

.availability-status-select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
}

.availability-panel__hint {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
}

/* Availability Badges on Calendar Days */
.availability-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  margin-left: auto;
}

.availability-badge--unavailable {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.availability-badge--available {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.35);
}

/* Calendar Day Availability Mode States */
.raid-calendar__day--availability-mode {
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.raid-calendar__day--availability-mode:hover {
  background: rgba(59, 130, 246, 0.12) !important;
  border-color: rgba(59, 130, 246, 0.45) !important;
}

.raid-calendar__day--selected {
  background: rgba(59, 130, 246, 0.22) !important;
  border-color: rgba(59, 130, 246, 0.65) !important;
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
}

.raid-calendar__day--unavailable:not(.raid-calendar__day--selected) {
  background: rgba(239, 68, 68, 0.08);
}

.raid-calendar__day--unavailable:not(.raid-calendar__day--selected)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.6) 0%, rgba(239, 68, 68, 0.3) 100%);
  border-radius: 0.55rem 0.55rem 0 0;
}

.raid-calendar__day--available:not(.raid-calendar__day--selected) {
  background: rgba(34, 197, 94, 0.08);
}

.raid-calendar__day--available:not(.raid-calendar__day--selected)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.6) 0%, rgba(34, 197, 94, 0.3) 100%);
  border-radius: 0.55rem 0.55rem 0 0;
}

/* Button variants for availability panel */
.btn--small {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
}

.btn--outline {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #94a3b8;
}

.btn--outline:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.65);
  color: #e2e8f0;
}

.btn--ghost {
  background: transparent;
  border: 1px solid transparent;
  color: #64748b;
}

.btn--ghost:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.08);
  color: #94a3b8;
}

/* Responsive adjustments for availability panel */
@media (max-width: 640px) {
  .availability-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .availability-panel__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .availability-panel__buttons {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .availability-toggle-btn__label {
    display: none;
  }

  .availability-toggle-btn {
    padding: 0.5rem;
  }
}

/* Availability Counters on Calendar Days */
.raid-calendar__availability-counters {
  position: absolute;
  bottom: 0.4rem;
  right: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  z-index: 1;
}

.availability-counter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.4rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.availability-counter:hover {
  transform: scale(1.1);
}

.availability-counter--available {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.5);
}

.availability-counter--available:hover {
  background: rgba(34, 197, 94, 0.35);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
}

.availability-counter--unavailable {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.5);
}

.availability-counter--unavailable:hover {
  background: rgba(239, 68, 68, 0.35);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

/* Availability Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 120;
}

.availability-modal {
  width: min(480px, 100%);
  max-height: 80vh;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.availability-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.availability-modal__title {
  margin: 0;
  font-size: 1.15rem;
}

.availability-modal__date {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.availability-modal__content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.5rem 1.5rem;
}

.availability-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.availability-modal__member {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.65rem;
  transition: background 0.15s ease;
}

.availability-modal__member:hover {
  background: rgba(30, 41, 59, 0.75);
}

.availability-modal__member-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.availability-modal__member-name {
  font-weight: 600;
  color: #e2e8f0;
}

.availability-modal__member-character {
  font-size: 0.85rem;
  color: #94a3b8;
}

.icon-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0.25rem;
  transition: color 0.15s ease;
}

.icon-button:hover {
  color: #e2e8f0;
}

/* Mobile Agenda Day Header Improvements */
.raid-agenda-day__header-left {
  display: flex;
  flex-direction: column;
}

.raid-agenda-day__header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Mobile Agenda Day Availability Section */
.raid-agenda-day__availability {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
  margin-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

/* Mobile Calendar Grid for Availability Mode */
.raid-calendar--mobile-availability {
  display: none;
}

.raid-calendar-mobile__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: #94a3b8;
  text-align: center;
  margin-bottom: 0.5rem;
}

.raid-calendar-mobile__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.raid-calendar-mobile__day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
  color: #e2e8f0;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  padding: 0.25rem;
}

.raid-calendar-mobile__day:active {
  transform: scale(0.95);
}

.raid-calendar-mobile__day--muted {
  color: rgba(148, 163, 184, 0.5);
  background: rgba(15, 23, 42, 0.4);
}

.raid-calendar-mobile__day--past {
  opacity: 0.55;
}

.raid-calendar-mobile__day--today {
  box-shadow: inset 0 0 0 3px rgba(59, 130, 246, 0.85);
  background: rgba(59, 130, 246, 0.12);
}

.raid-calendar-mobile__day--selected {
  background: rgba(59, 130, 246, 0.35) !important;
  border-color: rgba(59, 130, 246, 0.7) !important;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
}

.raid-calendar-mobile__day--unavailable:not(.raid-calendar-mobile__day--selected) {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
}

.raid-calendar-mobile__day--available:not(.raid-calendar-mobile__day--selected) {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.35);
}

.raid-calendar-mobile__day--has-raids::after {
  content: '';
  position: absolute;
  bottom: 0.3rem;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  background: #38bdf8;
  border-radius: 50%;
}

.raid-calendar-mobile__day-number {
  line-height: 1;
}

.raid-calendar-mobile__day-dot {
  display: none; /* Using ::after instead for cleaner implementation */
}

/* Mobile responsive adjustments */
@media (max-width: 768px) {
  .raid-calendar--desktop {
    display: none;
  }

  .raid-calendar--mobile {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .raid-calendar--mobile-availability {
    display: flex !important;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Hide non-availability mobile view when in availability mode */
  .raid-calendar--mobile:not(.raid-calendar--mobile-availability) {
    display: flex;
  }

  /* Availability panel mobile adjustments */
  .availability-panel {
    padding: 0.75rem;
  }

  .availability-panel__legend {
    gap: 0.75rem;
  }

  .availability-legend-item {
    font-size: 0.75rem;
  }

  .availability-panel__count {
    font-size: 0.8rem;
  }

  .availability-panel__buttons {
    width: 100%;
    justify-content: stretch;
  }

  .availability-panel__buttons .btn {
    flex: 1;
  }

  .availability-status-select {
    flex: 1;
    min-width: 120px;
  }

  /* Availability modal mobile adjustments */
  .modal-backdrop {
    padding: 1rem;
    align-items: flex-end;
  }

  .availability-modal {
    width: 100%;
    max-height: 70vh;
    border-radius: 1rem 1rem 0 0;
  }

  .availability-modal__header {
    padding: 1rem;
  }

  .availability-modal__content {
    padding: 0.75rem 1rem 1.25rem;
  }

  .availability-modal__member {
    padding: 0.65rem 0.85rem;
  }

  /* Mobile agenda availability counters */
  .raid-agenda-day__availability {
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }

  .raid-agenda-day__availability .availability-counter {
    min-width: 2rem;
    height: 2rem;
    font-size: 0.85rem;
    padding: 0 0.5rem;
  }

  /* Availability badges in mobile agenda */
  .raid-agenda-day__header-right .availability-badge {
    font-size: 0.6rem;
    padding: 0.2rem 0.45rem;
  }
}

/* Tablet adjustments (640px) */
@media (max-width: 640px) {
  .raid-agenda-day__availability .availability-counter {
    min-width: 1.8rem;
    height: 1.8rem;
    font-size: 0.8rem;
    padding: 0 0.45rem;
  }

  .raid-calendar-mobile__day {
    font-size: 0.8rem;
  }
}

/* Small mobile adjustments */
@media (max-width: 480px) {
  .raid-calendar-mobile__day {
    font-size: 0.75rem;
    border-radius: 0.35rem;
  }

  .raid-calendar-mobile__weekdays {
    font-size: 0.6rem;
  }

  .availability-panel__buttons {
    flex-direction: column;
    gap: 0.5rem;
  }

  .availability-panel__buttons .btn,
  .availability-status-select {
    width: 100%;
  }

  /* Small mobile availability counters */
  .raid-agenda-day__availability .availability-counter {
    min-width: 1.6rem;
    height: 1.6rem;
    font-size: 0.75rem;
    padding: 0 0.35rem;
  }

  .raid-agenda-day__header-right .availability-badge {
    font-size: 0.55rem;
    padding: 0.15rem 0.35rem;
  }

  /* Stack header elements vertically on very small screens */
  .raid-agenda-day__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  .raid-agenda-day__header-right {
    width: 100%;
    justify-content: space-between;
  }
}

/* Extra small mobile adjustments */
@media (max-width: 360px) {
  .raid-agenda-day__availability .availability-counter {
    min-width: 1.4rem;
    height: 1.4rem;
    font-size: 0.7rem;
    padding: 0 0.25rem;
  }

  .raid-calendar-mobile__day {
    font-size: 0.7rem;
    padding: 0.15rem;
  }

  .raid-calendar-mobile__day--has-raids::after {
    width: 3px;
    height: 3px;
    bottom: 0.2rem;
  }
}

</style>
