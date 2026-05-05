<template>
  <section class="dashboard" :class="{ 'dashboard--compact': dashboardCompact }">
    <header class="page-head">
      <div>
        <div class="page-head__line">Command Center · {{ pageGuildName }}</div>
        <h1>Dashboard</h1>
        <p class="page-head__sub">Your characters, signups, loot and guild activity at a glance.</p>
      </div>
      <div class="page-head__actions">
        <button class="nx-action nx-action--muted" type="button" @click="toggleDashboardDensity">
          {{ dashboardCompact ? 'Expanded View' : 'Customize' }}
        </button>
        <button class="nx-action" type="button" @click="goToRaids">New Signup</button>
      </div>
    </header>

    <div class="grid">
      <article class="nx-card nx-card--characters">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--characters" aria-hidden="true"></span>
            <h2>Your Characters</h2>
            <span v-if="characters.length" class="nx-card__count">{{ characters.length }}</span>
          </div>
          <button class="nx-action" type="button" @click="openCharacterModal()">Add</button>
        </header>

        <p v-if="characterError" class="character-error">{{ characterError }}</p>
        <GlobalLoadingSpinner v-if="showLoadingCharacters" />
        <p v-else-if="characters.length === 0" class="muted">
          You have not registered any characters yet.
        </p>
        <ul
          v-else
          class="char-list dashboard-list-intro"
          :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
        >
          <li
            v-for="(entry, index) in dashboardCharacters"
            :key="entry.character.id"
            :class="[
              'char',
              'dashboard-list-intro__item',
              { 'char--main': entry.character.isMain }
            ]"
            :style="{
              '--class-color': classDotColor(entry.character.class),
              '--dashboard-list-delay': dashboardListDelay(index, 9, 90)
            }"
          >
            <div class="char__identity">
              <div class="char__icon">
                <img
                  v-if="getCharacterClassIcon(entry.character.class)"
                  :src="getCharacterClassIcon(entry.character.class) || undefined"
                  :alt="formatClass(entry.character.class as CharacterClass) || 'Unknown'"
                />
              </div>
              <div class="char__body">
                <div class="char__head">
                  <span
                    class="char__name"
                    role="button"
                    tabindex="0"
                    @click="openInventory(entry.character.name, entry.character.guild?.id)"
                    @keydown.enter="openInventory(entry.character.name, entry.character.guild?.id)"
                  >
                    {{ entry.character.name }}
                  </span>
                </div>
                <div class="char__meta">
                  <span class="char__class-dot" />
                  <span
                    >{{ entry.character.level }}
                    {{ formatClassAbbreviation(entry.character.class as CharacterClass) }}</span
                  >
                  <span v-if="entry.character.guild">· {{ entry.character.guild.name }}</span>
                </div>
                <div class="char__support">
                  {{ formatCompactNumber(entry.attendanceCount) }} logs ·
                  {{ formatCompactNumber(entry.lootCount) }} loot
                </div>
              </div>
            </div>
            <div class="char__rail">
              <div class="char__rail-top">
                <span v-if="entry.character.isMain" class="nx-badge char__main-badge">Main</span>
                <div class="char__progress-copy">
                  <span class="char__progress-text">Attendance</span>
                </div>
              </div>
              <div
                class="char__attendance-meter"
                :class="`char__attendance-meter--${characterAttendanceTone(entry.coveragePercent)}`"
              >
                <span
                  class="char__attendance-meter-fill"
                  :style="{ width: `${attendanceAnimationsReady ? entry.coveragePercent : 0}%` }"
                />
                <span class="char__attendance-meter-value">{{ entry.coveragePercent }}%</span>
              </div>
              <div class="char__actions">
                <button
                  class="char__action-link"
                  :class="{ 'char__action-link--active': entry.character.isMain }"
                  :disabled="
                    updatingCharacterId === entry.character.id ||
                    (mainCount >= 2 && !entry.character.isMain)
                  "
                  type="button"
                  @click="toggleCharacterMain(entry.character)"
                >
                  <span v-if="updatingCharacterId === entry.character.id">Updating…</span>
                  <span v-else-if="entry.character.isMain">Remove Main</span>
                  <span v-else>Set Main</span>
                </button>
                <button
                  class="char__action-link"
                  type="button"
                  @click="openCharacterModal(entry.character)"
                >
                  Edit
                </button>
              </div>
            </div>
          </li>
        </ul>
      </article>

      <article class="nx-card nx-card--attendance">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--attendance" aria-hidden="true"></span>
            <h2>Attendance</h2>
            <span class="nx-card__count">90 events</span>
          </div>
          <button class="nx-action nx-action--muted" type="button" @click="goToRaids">
            Analytics
          </button>
        </header>

        <GlobalLoadingSpinner v-if="showLoadingAttendance" />
        <p v-else-if="attendanceError" class="error">{{ attendanceError }}</p>
        <template v-else>
          <div
            class="attendance-overview"
            :class="{ 'attendance-overview--ready': attendanceAnimationsReady }"
          >
            <div
              class="attendance-ring"
              :style="{
                '--attendance-progress': `${attendanceAnimationsReady ? attendanceRatePercent : 0}`
              }"
            >
              <div class="attendance-ring__inner">
                <strong>{{ attendanceAnimatedRatePercent }}%</strong>
              </div>
            </div>
            <div class="attendance-summary">
              <div class="attendance-summary__label">Last 90 Guild Raid Events</div>
              <div
                class="attendance-matrix"
                :class="{ 'attendance-matrix--ready': attendanceAnimationsReady }"
              >
                <button
                  v-for="(cell, index) in attendanceMatrix"
                  :key="cell.key"
                  class="attendance-matrix__cell"
                  :class="{
                    'attendance-matrix__cell--attended': cell.variant === 'attended',
                    'attendance-matrix__cell--late': cell.variant === 'late',
                    'attendance-matrix__cell--left-early': cell.variant === 'leftEarly',
                    'attendance-matrix__cell--late-left-early': cell.variant === 'lateLeftEarly',
                    'attendance-matrix__cell--missed': cell.hasEvent && cell.variant === 'missed',
                    'attendance-matrix__cell--empty': !cell.hasEvent,
                    'attendance-matrix__cell--interactive': !!cell.raidId
                  }"
                  :style="{ '--attendance-cell-delay': `${Math.min(index, 59) * 12}ms` }"
                  :title="cell.label"
                  :aria-label="cell.label"
                  :disabled="!cell.raidId"
                  type="button"
                  @click="cell.raidId && openRaidInNewTab(cell.raidId)"
                />
              </div>
            </div>
          </div>

          <p v-if="recentAttendance.length === 0" class="muted">
            Attendance analytics will appear here as raid events are logged.
          </p>
          <ul
            v-else
            class="feed-list feed-list--attendance dashboard-list-intro"
            :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
          >
            <li
              v-for="(event, index) in paginatedAttendance"
              :key="event.id"
              class="feed-list__item dashboard-list-intro__item"
              :style="{ '--dashboard-list-delay': dashboardListDelay(index, 5, 85) }"
            >
              <span class="feed-list__status-dot" :class="eventBadgeVariant(event.eventType)" />
              <div class="feed-list__body">
                <div class="feed-list__row">
                  <strong>{{ event.raid.name }}</strong>
                  <span class="pill" :class="eventBadgeVariant(event.eventType)">{{
                    formatEventType(event.eventType)
                  }}</span>
                </div>
                <div class="feed-list__meta">
                  {{ formatDate(event.createdAt) }} • {{ attendanceEventMeta(event) }}
                </div>
              </div>
            </li>
          </ul>

          <div v-if="attendanceTotalPages > 1" class="pagination">
            <button
              class="pagination__button"
              :disabled="attendancePage === 1"
              @click="setAttendancePage(attendancePage - 1)"
            >
              Previous
            </button>
            <span class="pagination__label"
              >Page {{ attendancePage }} of {{ attendanceTotalPages }}</span
            >
            <button
              class="pagination__button"
              :disabled="attendancePage === attendanceTotalPages"
              @click="setAttendancePage(attendancePage + 1)"
            >
              Next
            </button>
          </div>
        </template>
      </article>

      <article ref="lootCardRef" class="nx-card nx-card--loot">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--loot" aria-hidden="true"></span>
            <h2>Recent Loot</h2>
            <span v-if="recentLoot.length" class="nx-card__count">{{ recentLoot.length }}</span>
          </div>
          <button class="nx-action nx-action--muted" type="button" @click="goToRaids">
            History
          </button>
        </header>

        <GlobalLoadingSpinner v-if="showLoadingLoot" />
        <p v-else-if="lootError" class="error">{{ lootError }}</p>
        <p v-else-if="characters.length === 0" class="muted">
          Add a character to start tracking loot history.
        </p>
        <p v-else-if="recentLoot.length === 0" class="muted">
          Loot earned by your characters will show up here.
        </p>
        <template v-else>
          <ul
            ref="lootListRef"
            class="loot-list dashboard-list-intro"
            :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
          >
            <li
              v-for="(entry, index) in recentLoot"
              :key="entry.id"
              class="loot-list__item dashboard-list-intro__item"
              :style="{ '--dashboard-list-delay': dashboardListDelay(index, 9, 95) }"
              role="button"
              tabindex="0"
              @click="openAllaSearch(entry.itemName, entry.itemId)"
              @keyup.enter="openAllaSearch(entry.itemName, entry.itemId)"
            >
              <div
                class="loot-list__icon"
                @mouseenter="showItemTooltip($event, entry)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideItemTooltip"
              >
                <img
                  v-if="hasValidIconId(entry.itemIconId)"
                  :src="getLootIconSrc(entry.itemIconId)"
                  :alt="entry.itemName"
                  loading="lazy"
                />
                <span v-else>{{ entry.emoji ?? '💎' }}</span>
              </div>
              <div class="loot-list__body">
                <p class="loot-list__name">{{ entry.itemName }}</p>
                <p class="loot-list__meta">
                  <template v-if="entry.isGuildBank">
                    <span class="loot-list__looter">{{ entry.displayLooterName }}</span>
                  </template>
                  <template v-else>
                    <CharacterLink class="loot-list__looter" :name="entry.displayLooterName" />
                  </template>
                  • {{ entry.raid.guild.name }} •
                  {{ formatDate(entry.eventTime ?? entry.raid.startTime) }}
                </p>
              </div>
            </li>
          </ul>

          <div v-if="lootTotalPages > 1" ref="lootPaginationRef" class="pagination">
            <button
              class="pagination__button"
              :disabled="lootPage === 1"
              @click="setLootPage(lootPage - 1)"
            >
              Previous
            </button>
            <span class="pagination__label">Page {{ lootPage }} of {{ lootTotalPages }}</span>
            <button
              class="pagination__button"
              :disabled="lootPage === lootTotalPages"
              @click="setLootPage(lootPage + 1)"
            >
              Next
            </button>
          </div>
        </template>
      </article>

      <article class="nx-card nx-card--upcoming">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--upcoming" aria-hidden="true"></span>
            <h2>Upcoming Raids</h2>
            <span class="nx-card__count">{{ upcomingRaidWindowLabel }}</span>
          </div>
          <button class="nx-action nx-action--muted" type="button" @click="goToRaids">
            View All
          </button>
        </header>

        <GlobalLoadingSpinner v-if="showLoadingUpcomingRaids" />
        <p v-else-if="upcomingRaidsError" class="error">{{ upcomingRaidsError }}</p>
        <p v-else-if="upcomingRaidPreview.length === 0" class="muted">
          No raids are scheduled yet for {{ pageGuildName }}.
        </p>
        <ul
          v-else
          class="raid-list dashboard-list-intro"
          :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
        >
          <li
            v-for="(raid, index) in upcomingRaidPreview"
            :key="raid.id"
            class="raid-list__item dashboard-list-intro__item"
            :style="{ '--dashboard-list-delay': dashboardListDelay(index, 5, 90) }"
            role="button"
            tabindex="0"
            @click="openRaid(raid.id)"
            @keyup.enter="openRaid(raid.id)"
          >
            <div class="raid-list__date">
              <strong>{{ formatDayOfMonth(raid.startTime) }}</strong>
              <span>{{ formatWeekdayShort(raid.startTime) }}</span>
            </div>
            <div class="raid-list__body">
              <div class="raid-list__row">
                <p class="raid-list__name">{{ raid.name }}</p>
              </div>
              <p class="raid-list__meta">{{ raidLocationLabel(raid) }}</p>
              <p class="raid-list__sub">
                Led by {{ raidLeaderLabel(raid) }}
                <span v-if="raid.isRecurring"> · recurring</span>
              </p>
            </div>
            <div class="raid-list__status">
              <span class="raid-list__countdown">{{ formatCountdown(raid.startTime) }}</span>
              <span
                class="raid-list__stamp"
                :class="`raid-list__stamp--${raidSignupStateTone(raid)}`"
              >
                {{ raidSignupStateLabel(raid) }}
              </span>
            </div>
          </li>
        </ul>
      </article>

      <article class="nx-card nx-card--bis">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--bis" aria-hidden="true"></span>
            <h2>BiS Progress</h2>
            <span class="nx-card__count">Mains</span>
          </div>
          <button class="nx-action nx-action--muted" type="button" @click="goToBisPlanner()">
            Planner
          </button>
        </header>

        <GlobalLoadingSpinner v-if="showLoadingBisEntries" />
        <p v-else-if="bisError" class="error">{{ bisError }}</p>
        <p v-else-if="dashboardBisEntries.length === 0" class="muted">
          Mark a main character to surface class board progress here.
        </p>
        <ul
          v-else
          class="bis-list dashboard-list-intro"
          :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
        >
          <li
            v-for="(entry, index) in dashboardBisEntries"
            :key="`${entry.characterName}-${entry.characterClass}`"
            class="bis-list__item dashboard-list-intro__item"
            :style="{ '--dashboard-list-delay': dashboardListDelay(index, 4, 105) }"
            role="button"
            tabindex="0"
            @click="goToBisPlanner(entry.characterClass)"
            @keyup.enter="goToBisPlanner(entry.characterClass)"
          >
            <div class="bis-list__hero">
              <div class="bis-list__identity">
                <div class="bis-list__icon-shell">
                  <img
                    v-if="getCharacterClassIcon(entry.characterClass)"
                    :src="getCharacterClassIcon(entry.characterClass) || undefined"
                    :alt="formatClass(entry.characterClass) || 'Unknown'"
                    class="bis-list__icon"
                  />
                </div>
                <div class="bis-list__copy">
                  <p class="bis-list__eyebrow">
                    BiS Track ·
                    {{ formatClassAbbreviation(entry.characterClass) }}
                  </p>
                  <p class="bis-list__name">{{ entry.characterName }}</p>
                  <div class="bis-list__chips">
                    <span class="bis-list__class-chip">
                      {{ formatClass(entry.characterClass) }}
                    </span>
                    <span
                      class="bis-list__state-chip"
                      :class="`bis-list__state-chip--${bisCompletionTone(entry.completionPercent)}`"
                    >
                      {{ bisCompletionLabel(entry) }}
                    </span>
                  </div>
                </div>
              </div>
              <div
                class="bis-list__score"
                :class="`bis-list__score--${bisCompletionTone(entry.completionPercent)}`"
              >
                <span class="bis-list__score-label">Equipped BiS</span>
                <div class="bis-list__score-value">
                  <strong>{{ entry.equippedBisCount }}</strong>
                  <span>/{{ entry.totalSlots }}</span>
                </div>
                <span class="bis-list__score-percent">{{ entry.completionPercent }}%</span>
              </div>
            </div>
            <div class="bis-list__gear-strip" :aria-label="`${entry.characterName} gear status`">
              <div
                v-for="slot in entry.gearSlots"
                :key="`${entry.characterName}-${slot.slotId}`"
                class="bis-list__gear-slot"
                :class="{
                  'bis-list__gear-slot--bis': slot.isBis,
                  'bis-list__gear-slot--missing': !slot.isBis
                }"
                :title="bisGearSlotTitle(slot)"
                @mouseenter="showBisGearSlotTooltip($event, slot)"
                @mousemove="slot.equippedItemName && updateTooltipPosition($event)"
                @mouseleave="slot.equippedItemName && hideItemTooltip()"
              >
                <img
                  v-if="hasValidIconId(slot.equippedItemIconId)"
                  :src="getLootIconSrc(slot.equippedItemIconId)"
                  :alt="slot.equippedItemName ?? slot.slotLabel"
                  class="bis-list__gear-icon"
                  loading="lazy"
                />
                <span v-else class="bis-list__gear-fallback">
                  {{ slot.slotKey.slice(0, 2) }}
                </span>
              </div>
            </div>
            <div class="bis-list__footer">
              <div v-if="entry.nextItemName" class="bis-list__next">
                <span class="bis-list__next-label">Next Upgrade</span>
                <strong class="bis-list__next-item">{{ entry.nextItemName }}</strong>
                <span class="bis-list__next-slot">{{ entry.nextSlotLabel }}</span>
              </div>
              <div v-else class="bis-list__next bis-list__next--complete">
                <span class="bis-list__next-label">Status</span>
                <strong class="bis-list__next-item">Board complete</strong>
                <span class="bis-list__next-slot">Awaiting nomination updates</span>
              </div>
              <span class="bis-list__cta">Open Planner</span>
            </div>
          </li>
        </ul>
      </article>

      <article ref="activityCardRef" class="nx-card nx-card--activity">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--activity" aria-hidden="true"></span>
            <h2>Guild Activity</h2>
            <span class="nx-card__count">{{ pageGuildName }}</span>
          </div>
        </header>

        <p v-if="guildActivityFeed.length === 0" class="muted">
          Recent raid, loot and scheduling activity will appear here.
        </p>
        <ul
          v-else
          ref="activityListRef"
          class="feed-list feed-list--activity dashboard-list-intro"
          :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
        >
          <li
            v-for="(item, index) in guildActivityFeed"
            :key="item.id"
            class="feed-list__item dashboard-list-intro__item"
            :style="{ '--dashboard-list-delay': dashboardListDelay(index, 6, 90) }"
          >
            <span
              class="feed-list__activity-icon"
              :class="`feed-list__activity-icon--${item.type}`"
              aria-hidden="true"
            ></span>
            <div class="feed-list__body">
              <div class="feed-list__row feed-list__row--activity">
                <strong class="feed-list__headline">{{ item.headline }}</strong>
                <span class="feed-list__time">{{ formatRelativeTime(item.occurredAt) }}</span>
              </div>
              <div class="feed-list__summary">{{ item.detail }}</div>
            </div>
          </li>
        </ul>
      </article>

      <article ref="marketCardRef" class="nx-card nx-card--market">
        <header class="nx-card__head">
          <div class="nx-card__title">
            <span class="nx-card__glyph nx-card__glyph--market" aria-hidden="true"></span>
            <h2>Market</h2>
          </div>
          <button class="nx-action nx-action--muted" type="button" @click="goToMarket">
            Browse
          </button>
        </header>

        <GlobalLoadingSpinner v-if="showLoadingMarketCard" />
        <p v-else-if="marketError" class="error">{{ marketError }}</p>
        <div v-else ref="marketGridRef" class="market-grid">
          <section ref="marketRecentSectionRef" class="market-col">
            <div class="market-col__head">
              <span>Recent Sales</span>
            </div>
            <p v-if="trackedRecentSalesAll.length === 0" class="market-list__empty">
              No recent sales found for your
              {{ usingSavedTraderListings ? 'saved traders' : 'tracked mains' }}.
            </p>
            <ul
              v-else
              ref="marketRecentListRef"
              class="market-list dashboard-list-intro"
              :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
            >
              <li
                v-for="(sale, index) in trackedRecentSales"
                :key="marketRecentSaleKey(sale)"
                class="market-list__item dashboard-list-intro__item"
                :style="{ '--dashboard-list-delay': dashboardListDelay(index, 4, 90) }"
              >
                <div
                  class="market-list__icon"
                  @mouseenter="showItemTooltip($event, sale)"
                  @mousemove="updateTooltipPosition($event)"
                  @mouseleave="hideItemTooltip"
                >
                  <img
                    v-if="hasValidIconId(sale.itemIconId)"
                    :src="getLootIconSrc(sale.itemIconId)"
                    :alt="sale.itemName"
                    loading="lazy"
                  />
                  <span v-else>$</span>
                </div>
                <div class="market-list__body">
                  <p class="market-list__name">{{ sale.itemName }}</p>
                </div>
                <span class="market-list__qty">x{{ formatCompactNumber(sale.quantity) }}</span>
                <strong class="market-list__value">{{ formatPlat(sale.price) }}</strong>
              </li>
            </ul>
          </section>

          <section ref="marketTrendingSectionRef" class="market-col">
            <div class="market-col__head">
              <span>Trending · 24h</span>
            </div>
            <p v-if="marketTrendingItemsAll.length === 0" class="muted">
              Trending items will appear as bazaar data accumulates.
            </p>
            <ul
              v-else
              ref="marketTrendingListRef"
              class="market-list dashboard-list-intro"
              :class="{ 'dashboard-list-intro--ready': lootIntroReady }"
            >
              <li
                v-for="(item, index) in marketTrendingItems"
                :key="item.key"
                class="market-list__item dashboard-list-intro__item"
                :style="{ '--dashboard-list-delay': dashboardListDelay(index, 4, 90) }"
              >
                <div
                  class="market-list__icon"
                  @mouseenter="showItemTooltip($event, item)"
                  @mousemove="updateTooltipPosition($event)"
                  @mouseleave="hideItemTooltip"
                >
                  <img
                    v-if="hasValidIconId(item.itemIconId)"
                    :src="getLootIconSrc(item.itemIconId)"
                    :alt="item.itemName"
                    loading="lazy"
                  />
                  <span v-else>#</span>
                </div>
                <div class="market-list__body">
                  <p class="market-list__name">{{ item.itemName }}</p>
                </div>
                <span
                  v-if="item.trendPercent !== null"
                  class="market-list__trend"
                  :class="
                    item.trendPercent >= 0
                      ? 'market-list__trend--positive'
                      : 'market-list__trend--negative'
                  "
                  >{{ formatSignedPercent(item.trendPercent) }}</span
                >
                <span v-else class="market-list__trend market-list__trend--empty">--</span>
                <strong class="market-list__value">{{ formatPlat(item.averagePrice) }}</strong>
              </li>
            </ul>
          </section>
        </div>
      </article>
    </div>

    <CharacterModal
      v-if="showCharacterForm"
      :guilds="guilds"
      :can-set-main="mainCount < 2"
      :editing="Boolean(editingCharacter)"
      :character="editingCharacter || undefined"
      @close="closeCharacterModal"
      @created="handleCharacterCreated"
      @updated="handleCharacterUpdated"
      @deleted="handleCharacterDeleted"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import CharacterModal from '../components/CharacterModal.vue';
import CharacterLink from '../components/CharacterLink.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import {
  api,
  type AttendanceMetricRecord,
  type BisBoard,
  type GuildBankItem,
  type GuildMetrics,
  type GuildSummary,
  type LootMetricEvent,
  type MarketFavoriteTrader,
  type MarketRecentSale,
  type MarketSummary,
  type RaidEventSummary,
  type RecentAttendanceEntry,
  type RecentLootEntry,
  type UserCharacter
} from '../services/api';
import { characterClassLabels, getCharacterClassIcon } from '../services/types';
import type { CharacterClass } from '../services/types';
import { useAuthStore } from '../stores/auth';
import { useGuildBankStore } from '../stores/guildBank';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { EASTERN_TIME_ZONE, formatEasternDateTime } from '../utils/easternTime';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import { getGuildBankDisplayName, normalizeLooterName } from '../utils/lootNames';

type EditableCharacter = {
  id: string;
  name: string;
  level: number;
  class: CharacterClass;
  guildId?: string | null;
  isMain: boolean;
};

type RecentLootDisplay = RecentLootEntry & {
  displayLooterName: string;
  isGuildBank: boolean;
  isMasterLooter: boolean;
};

type DashboardCharacterEntry = {
  character: UserCharacter;
  attendanceCount: number;
  lootCount: number;
  coveragePercent: number;
};

type AttendanceMatrixCell = {
  key: string;
  variant: 'attended' | 'late' | 'leftEarly' | 'lateLeftEarly' | 'missed' | 'empty';
  hasEvent: boolean;
  label: string;
  raidId: string | null;
};

type DashboardAttendanceRaidSummary = {
  raidId: string;
  raidName: string;
  raidStartTime: string;
  attended: boolean;
  wasLate: boolean;
  leftEarly: boolean;
};

type DashboardBisEntry = {
  characterName: string;
  characterClass: CharacterClass;
  equippedBisCount: number;
  totalSlots: number;
  completionPercent: number;
  nextSlotLabel: string | null;
  nextItemName: string | null;
  gearSlots: Array<{
    slotId: number;
    slotKey: string;
    slotLabel: string;
    equippedItemId: number | null;
    equippedItemName: string | null;
    equippedItemIconId: number | null;
    winnerItemId: number | null;
    winnerItemName: string | null;
    isBis: boolean;
  }>;
};

type DashboardActivityItem = {
  id: string;
  type: 'loot' | 'bank' | 'start' | 'end' | 'scheduled';
  headline: string;
  detail: string;
  occurredAt: string;
};

type DashboardMarketTrendItem = {
  key: string;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  averagePrice: number;
  trendPercent: number | null;
};

type TooltipItem = {
  itemId?: number | null;
  itemName: string;
  itemIconId?: number | null;
};

const MIN_LOOT_PAGE_SIZE = 2;
const DEFAULT_LOOT_PAGE_SIZE = 4;
const LOOT_ROW_FALLBACK_HEIGHT = 74;
const LOOT_PAGINATION_GAP = 12;
const DEFAULT_ACTIVITY_ROW_LIMIT = 5;
const MIN_ACTIVITY_ROW_LIMIT = 1;
const ACTIVITY_ROW_FALLBACK_HEIGHT = 92;
const DEFAULT_MARKET_RECENT_ROW_LIMIT = 4;
const DEFAULT_MARKET_TREND_ROW_LIMIT = 3;
const MARKET_ROW_FALLBACK_HEIGHT = 54;
const DASHBOARD_ATTENDANCE_EVENT_LIMIT = 90;
const DASHBOARD_ATTENDANCE_FETCH_LIMIT = 500;
const DASHBOARD_GUILD_ACTIVITY_LOOKBACK_DAYS = 120;
const DASHBOARD_BIS_EXCLUDED_SLOT_KEYS = new Set(['ammo']);

const router = useRouter();
const authStore = useAuthStore();
const guildBankStore = useGuildBankStore();
const tooltipStore = useItemTooltipStore();

const characters = ref<UserCharacter[]>([]);
const guilds = ref<GuildSummary[]>([]);
const loadingCharacters = ref(false);
const showLoadingCharacters = useMinimumLoading(loadingCharacters);
const showCharacterForm = ref(false);
const editingCharacter = ref<EditableCharacter | null>(null);
const updatingCharacterId = ref<string | null>(null);
const characterError = ref<string | null>(null);

const recentAttendance = ref<RecentAttendanceEntry[]>([]);
const loadingAttendance = ref(false);
const showLoadingAttendance = useMinimumLoading(loadingAttendance);
const attendanceError = ref<string | null>(null);
const attendancePage = ref(1);
const attendancePerPage = 4;

const recentLoot = ref<RecentLootDisplay[]>([]);
const loadingLoot = ref(false);
const showLoadingLoot = useMinimumLoading(loadingLoot);
const lootError = ref<string | null>(null);
const lootIntroReady = ref(false);
const lootPage = ref(1);
const lootTotalPages = ref(1);
const lootTotalItems = ref(0);
const lootPageSize = ref(DEFAULT_LOOT_PAGE_SIZE);
const lootCardRef = ref<HTMLElement | null>(null);
const lootListRef = ref<HTMLElement | null>(null);
const lootPaginationRef = ref<HTMLElement | null>(null);
const activityRowLimit = ref(DEFAULT_ACTIVITY_ROW_LIMIT);
const activityCardRef = ref<HTMLElement | null>(null);
const activityListRef = ref<HTMLElement | null>(null);

const upcomingRaids = ref<RaidEventSummary[]>([]);
const loadingUpcomingRaids = ref(false);
const showLoadingUpcomingRaids = useMinimumLoading(loadingUpcomingRaids);
const upcomingRaidsError = ref<string | null>(null);

const dashboardBisEntries = ref<DashboardBisEntry[]>([]);
const loadingBisEntries = ref(false);
const showLoadingBisEntries = useMinimumLoading(loadingBisEntries);
const bisError = ref<string | null>(null);

const guildActivityMetrics = ref<GuildMetrics | null>(null);
const marketSummary = ref<MarketSummary | null>(null);
const marketFavoriteTraders = ref<MarketFavoriteTrader[]>([]);
const loadingMarketCard = ref(false);
const showLoadingMarketCard = useMinimumLoading(loadingMarketCard);
const marketError = ref<string | null>(null);
const marketRecentRowLimit = ref(DEFAULT_MARKET_RECENT_ROW_LIMIT);
const marketTrendRowLimit = ref(DEFAULT_MARKET_TREND_ROW_LIMIT);
const marketCardRef = ref<HTMLElement | null>(null);
const marketGridRef = ref<HTMLElement | null>(null);
const marketRecentSectionRef = ref<HTMLElement | null>(null);
const marketRecentListRef = ref<HTMLElement | null>(null);
const marketTrendingSectionRef = ref<HTMLElement | null>(null);
const marketTrendingListRef = ref<HTMLElement | null>(null);
const attendanceAnimationsReady = ref(false);
const attendanceAnimatedRatePercent = ref(0);

let lootResizeObserver: ResizeObserver | null = null;
let lootMeasureFrame: number | null = null;
let activityResizeObserver: ResizeObserver | null = null;
let activityMeasureFrame: number | null = null;
let marketResizeObserver: ResizeObserver | null = null;
let marketMeasureFrame: number | null = null;
let attendanceIntroFrame: number | null = null;
let attendanceRateAnimationFrame: number | null = null;
let attendanceOverlayWaitFrame: number | null = null;
let attendanceIntroPlayed = false;
let lootIntroFrame: number | null = null;
let lootIntroPlayed = false;

const dashboardCompact = ref(
  typeof window !== 'undefined' && window.localStorage.getItem('cw-dashboard-compact') === '1'
);

const pageGuildName = computed(
  () => authStore.primaryGuild?.name ?? characters.value[0]?.guild?.name ?? 'Nexus'
);
const dashboardGuildId = computed(
  () =>
    authStore.primaryGuild?.id ??
    characters.value.find((character) => character.guild?.id)?.guild?.id ??
    null
);
const mainCount = computed(() => characters.value.filter((character) => character.isMain).length);
const attendanceTotalPages = computed(() =>
  Math.max(1, Math.ceil(recentAttendance.value.length / attendancePerPage))
);
const paginatedAttendance = computed(() =>
  recentAttendance.value.slice(
    (attendancePage.value - 1) * attendancePerPage,
    attendancePage.value * attendancePerPage
  )
);
const upcomingRaidPreview = computed(() => upcomingRaids.value.slice(0, 4));
const upcomingRaidWindow = computed(() =>
  upcomingRaids.value.filter((raid) => isWithinNextDays(raid.startTime, 7))
);
const upcomingRaidWindowLabel = computed(() =>
  upcomingRaidWindow.value.length > 0 ? 'Next 7d' : 'Upcoming'
);
const trackedMarketSellerNames = computed(() =>
  pickDashboardCharacters(characters.value)
    .map((character) => character.name.trim())
    .filter((name, index, values) => name && values.indexOf(name) === index)
);
const dashboardMarketSellerNames = computed(() => {
  const traderNames = marketFavoriteTraders.value
    .map((trader) => trader.characterName.trim())
    .filter((name, index, values) => name && values.indexOf(name) === index);
  return traderNames.length > 0 ? traderNames : trackedMarketSellerNames.value;
});
const usingSavedTraderListings = computed(() => marketFavoriteTraders.value.length > 0);

const dashboardCharacters = computed<DashboardCharacterEntry[]>(() =>
  characters.value.map((character) => {
    const attendanceCount = recentAttendance.value.filter((event) =>
      event.characters.some((record) => sameCharacterName(record.characterName, character.name))
    ).length;
    const lootCount = recentLoot.value.filter((entry) =>
      sameCharacterName(entry.displayLooterName, character.name)
    ).length;
    const coveragePercent =
      recentAttendance.value.length > 0
        ? Math.round((attendanceCount / recentAttendance.value.length) * 100)
        : 0;
    return { character, attendanceCount, lootCount, coveragePercent };
  })
);

const attendanceRaidSummaries = computed<DashboardAttendanceRaidSummary[]>(() => {
  const raids = new Map<string, RecentAttendanceEntry[]>();
  recentAttendance.value.forEach((event) => {
    const bucket = raids.get(event.raid.id);
    if (bucket) {
      bucket.push(event);
      return;
    }
    raids.set(event.raid.id, [event]);
  });

  return Array.from(raids.entries())
    .map(([raidId, events]) => {
      const orderedEvents = [...events].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      const presentIndices = new Set<number>();
      const lateIndices = new Set<number>();
      const leftEarlyIndices = new Set<number>();
      let attended = false;

      orderedEvents.forEach((event, index) => {
        const statuses = event.characters.map((record) => record.status);
        if (statuses.some((status) => status !== 'ABSENT')) {
          attended = true;
        }
        if (statuses.some((status) => status === 'PRESENT')) {
          presentIndices.add(index);
        }
        if (statuses.some((status) => status === 'LATE')) {
          lateIndices.add(index);
        }
        if (statuses.some((status) => status === 'BENCHED')) {
          leftEarlyIndices.add(index);
        }
      });

      const lastEventIndex = Math.max(0, orderedEvents.length - 1);
      const hasPresence = presentIndices.size > 0;
      const presentAtFirst = hasPresence && presentIndices.has(0);
      const presentAtLast = hasPresence && presentIndices.has(lastEventIndex);

      return {
        raidId,
        raidName: orderedEvents[0]?.raid.name ?? 'Raid',
        raidStartTime: orderedEvents[0]?.raid.startTime ?? orderedEvents[0]?.createdAt ?? '',
        attended,
        wasLate: attended && (lateIndices.size > 0 || !presentAtFirst),
        leftEarly: attended && (leftEarlyIndices.size > 0 || !presentAtLast)
      };
    })
    .sort(
      (left, right) =>
        new Date(right.raidStartTime).getTime() - new Date(left.raidStartTime).getTime()
    )
    .slice(0, DASHBOARD_ATTENDANCE_EVENT_LIMIT);
});

const attendanceMatrix = computed<AttendanceMatrixCell[]>(() => {
  const cells: AttendanceMatrixCell[] = attendanceRaidSummaries.value.map((raid) => {
    const variant: AttendanceMatrixCell['variant'] = !raid.attended
      ? 'missed'
      : raid.wasLate && raid.leftEarly
        ? 'lateLeftEarly'
        : raid.wasLate
          ? 'late'
          : raid.leftEarly
            ? 'leftEarly'
            : 'attended';
    const statusLabel =
      variant === 'lateLeftEarly'
        ? 'Late and Left Early'
        : variant === 'late'
          ? 'Late'
          : variant === 'leftEarly'
            ? 'Left Early'
            : variant === 'attended'
              ? 'Attended'
              : 'Missed';
    return {
      key: raid.raidId,
      variant,
      hasEvent: true,
      label: `${formatDate(raid.raidStartTime)} · ${raid.raidName} · ${statusLabel}`,
      raidId: raid.raidId
    };
  });

  for (let index = cells.length; index < DASHBOARD_ATTENDANCE_EVENT_LIMIT; index += 1) {
    cells.push({
      key: `attendance-empty-${index}`,
      variant: 'empty',
      hasEvent: false,
      label: 'No older raid event loaded',
      raidId: null
    });
  }

  return cells;
});

const attendanceAttendedCount = computed(
  () =>
    attendanceMatrix.value.filter(
      (cell) =>
        cell.hasEvent &&
        (cell.variant === 'attended' ||
          cell.variant === 'late' ||
          cell.variant === 'leftEarly' ||
          cell.variant === 'lateLeftEarly')
    ).length
);
const attendanceRatePercent = computed(() => {
  const eventCount = attendanceMatrix.value.filter((cell) => cell.hasEvent).length;
  return eventCount > 0 ? Math.round((attendanceAttendedCount.value / eventCount) * 100) : 0;
});

const guildActivityFeedAll = computed<DashboardActivityItem[]>(() => {
  const feed: DashboardActivityItem[] = [];

  (guildActivityMetrics.value?.lootEvents ?? [])
    .slice(-8)
    .reverse()
    .forEach((entry: LootMetricEvent) => {
      const { name, isGuildBank, isMasterLooter } = normalizeLooterName(
        entry.looterName ?? null,
        pageGuildName.value
      );
      if (isMasterLooter) {
        return;
      }
      feed.push({
        id: `loot-${entry.id}`,
        type: isGuildBank ? 'bank' : 'loot',
        headline: isGuildBank
          ? `${getGuildBankDisplayName(pageGuildName.value)} banked ${entry.itemName}`
          : `${name} was awarded ${entry.itemName}`,
        detail: entry.raid.name,
        occurredAt: entry.timestamp
      });
    });

  const attendanceEventMap = new Map<
    string,
    {
      raidName: string;
      eventType: RecentAttendanceEntry['eventType'];
      occurredAt: string;
      activeCharacters: Set<string>;
    }
  >();
  (guildActivityMetrics.value?.attendanceRecords ?? []).forEach(
    (record: AttendanceMetricRecord) => {
      const key = `${record.raid.id}:${record.timestamp}:${record.eventType}`;
      const bucket = attendanceEventMap.get(key) ?? {
        raidName: record.raid.name,
        eventType: record.eventType,
        occurredAt: record.timestamp,
        activeCharacters: new Set<string>()
      };
      if (record.status !== 'ABSENT') {
        bucket.activeCharacters.add(record.character.name.trim().toLowerCase());
      }
      attendanceEventMap.set(key, bucket);
    }
  );

  Array.from(attendanceEventMap.entries())
    .sort(
      (left, right) =>
        new Date(right[1].occurredAt).getTime() - new Date(left[1].occurredAt).getTime()
    )
    .slice(0, 6)
    .forEach(([key, event]) => {
      feed.push({
        id: `attendance-${key}`,
        type: event.eventType === 'END' ? 'end' : 'start',
        headline: `${event.raidName} ${formatEventType(event.eventType).toLowerCase()}`,
        detail: `${event.activeCharacters.size} tracked raider${event.activeCharacters.size === 1 ? '' : 's'}`,
        occurredAt: event.occurredAt
      });
    });

  upcomingRaids.value.slice(0, 4).forEach((raid) => {
    feed.push({
      id: `raid-${raid.id}`,
      type: 'scheduled',
      headline: `${raid.name} scheduled`,
      detail: `Scheduled raid night in ${formatCountdown(raid.startTime).replace(/^IN\s*/, '')}`,
      occurredAt: raid.startTime
    });
  });

  return feed.sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
});

const guildActivityFeed = computed<DashboardActivityItem[]>(() =>
  guildActivityFeedAll.value.slice(0, activityRowLimit.value)
);
const trackedRecentSalesAll = computed<MarketRecentSale[]>(() => {
  if (!marketSummary.value) return [];
  const trackedNames = new Set(
    dashboardMarketSellerNames.value.map((name) => name.trim().toLowerCase()).filter(Boolean)
  );
  if (trackedNames.size === 0) return [];
  return marketSummary.value.recentSales.filter((sale) =>
    trackedNames.has(sale.sellerCharacterName.trim().toLowerCase())
  );
});

const trackedRecentSales = computed<MarketRecentSale[]>(() =>
  trackedRecentSalesAll.value.slice(0, marketRecentRowLimit.value)
);

const marketTrendingItemsAll = computed<DashboardMarketTrendItem[]>(() => {
  if (!marketSummary.value) return [];

  return marketSummary.value.topItems.map((item) => {
    const matchingSales = marketSummary.value!.recentSales.filter(
      (sale) =>
        (item.itemId != null && sale.itemId === item.itemId) ||
        sale.itemName.trim().toLowerCase() === item.itemName.trim().toLowerCase()
    );
    const baselineCandidates = matchingSales
      .map((sale) => sale.itemAveragePrice ?? sale.price ?? null)
      .filter((price): price is number => price != null && Number.isFinite(price) && price > 0);
    const baseline =
      baselineCandidates.length > 0
        ? baselineCandidates.reduce((sum, price) => sum + price, 0) / baselineCandidates.length
        : null;
    const trendPercent =
      baseline && baseline > 0
        ? Math.max(-99, Math.min(99, Math.round(((item.averagePrice - baseline) / baseline) * 100)))
        : null;

    return {
      key: `top-${item.itemId ?? item.itemName}`,
      itemId: item.itemId,
      itemName: item.itemName,
      itemIconId: item.itemIconId,
      averagePrice: item.averagePrice,
      trendPercent
    };
  });
});

const marketTrendingItems = computed<DashboardMarketTrendItem[]>(() =>
  marketTrendingItemsAll.value.slice(0, marketTrendRowLimit.value)
);

watch(mainCount, (value) => {
  if (value < 2 && characterError.value) {
    characterError.value = null;
  }
});

watch(dashboardCompact, (value) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('cw-dashboard-compact', value ? '1' : '0');
  }
});

watch(
  () =>
    characters.value
      .map(
        (character) => `${character.id}:${character.name}:${character.class}:${character.isMain}`
      )
      .join('|'),
  () => {
    void loadBisEntries();
    void loadMarketFavoriteTraders();
  }
);

watch(
  () => dashboardGuildId.value,
  () => {
    void loadUpcomingRaids();
    void loadGuildActivityMetrics();
  }
);

watch(
  () => recentAttendance.value.length,
  () => {
    if (attendancePage.value > attendanceTotalPages.value) {
      attendancePage.value = attendanceTotalPages.value;
    }
  }
);

watch(
  () => recentLoot.value.length,
  () => {
    if (lootPage.value > lootTotalPages.value) {
      lootPage.value = lootTotalPages.value;
    }
    scheduleLootLayoutSync();
  }
);

watch(
  () =>
    guildActivityFeedAll.value
      .map((item) => `${item.id}:${item.headline}:${item.detail}:${item.occurredAt}`)
      .join('|'),
  () => {
    scheduleActivityLayoutSync();
  }
);

watch(
  () =>
    trackedRecentSalesAll.value.map((sale) => marketRecentSaleKey(sale)).join('|') +
    '::' +
    marketTrendingItemsAll.value.map((item) => item.key).join('|'),
  () => {
    scheduleMarketLayoutSync();
  }
);

watch(lootCardRef, (element) => {
  if (lootResizeObserver) {
    lootResizeObserver.disconnect();
  }
  if (element && typeof ResizeObserver !== 'undefined') {
    lootResizeObserver = new ResizeObserver(() => {
      scheduleLootLayoutSync();
    });
    lootResizeObserver.observe(element);
  }
});

watch(marketCardRef, (element) => {
  if (marketResizeObserver) {
    marketResizeObserver.disconnect();
  }
  if (element && typeof ResizeObserver !== 'undefined') {
    marketResizeObserver = new ResizeObserver(() => {
      scheduleMarketLayoutSync();
    });
    marketResizeObserver.observe(element);
  }
});

watch(activityCardRef, (element) => {
  if (activityResizeObserver) {
    activityResizeObserver.disconnect();
  }
  if (element && typeof ResizeObserver !== 'undefined') {
    activityResizeObserver = new ResizeObserver(() => {
      scheduleActivityLayoutSync();
    });
    activityResizeObserver.observe(element);
  }
});

watch(
  () => lootTotalPages.value,
  () => {
    scheduleLootLayoutSync();
  }
);

watch(
  [
    showLoadingCharacters,
    showLoadingAttendance,
    showLoadingLoot,
    showLoadingUpcomingRaids,
    showLoadingBisEntries,
    showLoadingMarketCard
  ],
  async ([
    charactersStillLoading,
    attendanceStillLoading,
    lootStillLoading,
    upcomingStillLoading,
    bisStillLoading,
    marketStillLoading
  ]) => {
    if (
      charactersStillLoading ||
      attendanceStillLoading ||
      lootStillLoading ||
      upcomingStillLoading ||
      bisStillLoading ||
      marketStillLoading ||
      (attendanceIntroPlayed && lootIntroPlayed)
    ) {
      return;
    }
    await nextTick();
    waitForGlobalLoadingOverlayToClear(() => {
      runAttendanceIntroAnimation();
      runLootIntroAnimation();
    });
  },
  { flush: 'post' }
);

function clearActivityLayoutSync() {
  if (typeof window !== 'undefined' && activityMeasureFrame !== null) {
    window.cancelAnimationFrame(activityMeasureFrame);
  }
  activityMeasureFrame = null;
}

function clearMarketLayoutSync() {
  if (typeof window !== 'undefined' && marketMeasureFrame !== null) {
    window.cancelAnimationFrame(marketMeasureFrame);
  }
  marketMeasureFrame = null;
}

function clearLootLayoutSync() {
  if (typeof window !== 'undefined' && lootMeasureFrame !== null) {
    window.cancelAnimationFrame(lootMeasureFrame);
  }
  lootMeasureFrame = null;
}

function clearAttendanceIntroAnimation() {
  if (typeof window === 'undefined') return;
  if (attendanceIntroFrame !== null) {
    window.cancelAnimationFrame(attendanceIntroFrame);
  }
  if (attendanceRateAnimationFrame !== null) {
    window.cancelAnimationFrame(attendanceRateAnimationFrame);
  }
  if (attendanceOverlayWaitFrame !== null) {
    window.cancelAnimationFrame(attendanceOverlayWaitFrame);
  }
  attendanceIntroFrame = null;
  attendanceRateAnimationFrame = null;
  attendanceOverlayWaitFrame = null;
}

function clearLootIntroAnimation() {
  if (typeof window === 'undefined') return;
  if (lootIntroFrame !== null) {
    window.cancelAnimationFrame(lootIntroFrame);
  }
  lootIntroFrame = null;
}

function waitForGlobalLoadingOverlayToClear(callback: () => void) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    callback();
    return;
  }

  let clearFrames = 0;
  const poll = () => {
    const overlayVisible = document.querySelector('.global-loading-overlay') !== null;
    if (overlayVisible) {
      clearFrames = 0;
      attendanceOverlayWaitFrame = window.requestAnimationFrame(poll);
      return;
    }

    clearFrames += 1;
    if (clearFrames < 2) {
      attendanceOverlayWaitFrame = window.requestAnimationFrame(poll);
      return;
    }

    attendanceOverlayWaitFrame = null;
    callback();
  };

  if (attendanceOverlayWaitFrame !== null) {
    window.cancelAnimationFrame(attendanceOverlayWaitFrame);
  }
  attendanceOverlayWaitFrame = window.requestAnimationFrame(poll);
}

function animateAttendanceRateValue(target: number) {
  if (typeof window === 'undefined') {
    attendanceAnimatedRatePercent.value = target;
    return;
  }
  if (attendanceRateAnimationFrame !== null) {
    window.cancelAnimationFrame(attendanceRateAnimationFrame);
  }
  const startedAt = window.performance.now();
  const durationMs = 920;
  const step = (timestamp: number) => {
    const progress = Math.min((timestamp - startedAt) / durationMs, 1);
    const eased = 1 - (1 - progress) ** 3;
    attendanceAnimatedRatePercent.value = Math.round(target * eased);
    if (progress < 1) {
      attendanceRateAnimationFrame = window.requestAnimationFrame(step);
      return;
    }
    attendanceRateAnimationFrame = null;
    attendanceAnimatedRatePercent.value = target;
  };
  attendanceRateAnimationFrame = window.requestAnimationFrame(step);
}

function runAttendanceIntroAnimation() {
  if (attendanceIntroPlayed) {
    attendanceAnimationsReady.value = true;
    attendanceAnimatedRatePercent.value = attendanceRatePercent.value;
    return;
  }
  attendanceIntroPlayed = true;
  attendanceAnimationsReady.value = false;
  attendanceAnimatedRatePercent.value = 0;

  if (typeof window === 'undefined') {
    attendanceAnimationsReady.value = true;
    attendanceAnimatedRatePercent.value = attendanceRatePercent.value;
    return;
  }

  clearAttendanceIntroAnimation();
  attendanceIntroFrame = window.requestAnimationFrame(() => {
    attendanceIntroFrame = window.requestAnimationFrame(() => {
      attendanceIntroFrame = null;
      attendanceAnimationsReady.value = true;
      animateAttendanceRateValue(attendanceRatePercent.value);
    });
  });
}

function runLootIntroAnimation() {
  if (lootIntroPlayed) {
    lootIntroReady.value = true;
    return;
  }
  lootIntroPlayed = true;
  lootIntroReady.value = false;

  if (typeof window === 'undefined') {
    lootIntroReady.value = true;
    return;
  }

  clearLootIntroAnimation();
  lootIntroFrame = window.requestAnimationFrame(() => {
    lootIntroFrame = window.requestAnimationFrame(() => {
      lootIntroFrame = null;
      lootIntroReady.value = true;
    });
  });
}

function dashboardListDelay(index: number, maxIndex = 9, stepMs = 90) {
  return `${Math.min(index, maxIndex) * stepMs}ms`;
}

function measureLootPageSize() {
  if (typeof window === 'undefined') return null;
  const card = lootCardRef.value;
  const list = lootListRef.value;
  if (!card || !list) return null;

  const firstItem = list.querySelector<HTMLElement>('.loot-list__item');
  const listStyles = window.getComputedStyle(list);
  const cardStyles = window.getComputedStyle(card);
  const listGap = parseFloat(listStyles.rowGap || listStyles.gap || '0') || 0;
  const paddingBottom = parseFloat(cardStyles.paddingBottom || '0') || 0;
  const paginationTop =
    lootPaginationRef.value?.getBoundingClientRect().top ??
    card.getBoundingClientRect().bottom - paddingBottom;
  const availableHeight = Math.max(
    0,
    paginationTop -
      list.getBoundingClientRect().top -
      (lootPaginationRef.value ? LOOT_PAGINATION_GAP : 0)
  );
  const rowHeight = firstItem?.offsetHeight ?? LOOT_ROW_FALLBACK_HEIGHT;

  return Math.max(
    MIN_LOOT_PAGE_SIZE,
    Math.floor((availableHeight + listGap) / Math.max(rowHeight + listGap, 1))
  );
}

function measureActivityRowLimit() {
  if (typeof window === 'undefined') return null;
  const card = activityCardRef.value;
  const list = activityListRef.value;
  if (!card || !list) return null;

  const firstItem = list.querySelector<HTMLElement>('.feed-list__item');
  if (!firstItem) return null;

  const header = card.querySelector<HTMLElement>('.nx-card__head');
  const headerStyles = header ? window.getComputedStyle(header) : null;
  const listStyles = window.getComputedStyle(list);
  const cardStyles = window.getComputedStyle(card);
  const listGap = parseFloat(listStyles.rowGap || listStyles.gap || '0') || 0;
  const paddingBottom = parseFloat(cardStyles.paddingBottom || '0') || 0;
  const headerMarginBottom = parseFloat(headerStyles?.marginBottom || '0') || 0;
  const contentTop =
    (header?.getBoundingClientRect().bottom ?? list.getBoundingClientRect().top) +
    headerMarginBottom;
  const availableHeight = Math.max(
    0,
    card.getBoundingClientRect().bottom - paddingBottom - contentTop
  );
  const rowHeight = firstItem.offsetHeight || ACTIVITY_ROW_FALLBACK_HEIGHT;

  return Math.max(
    MIN_ACTIVITY_ROW_LIMIT,
    Math.floor((availableHeight + listGap) / Math.max(rowHeight + listGap, 1))
  );
}

function marketListHeight(rowCount: number, rowHeight: number, rowGap: number) {
  if (rowCount <= 0) return 0;
  return rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;
}

function measureMarketRowLimits() {
  if (typeof window === 'undefined') return null;
  const card = marketCardRef.value;
  const grid = marketGridRef.value;
  const recentSection = marketRecentSectionRef.value;
  const trendingSection = marketTrendingSectionRef.value;
  if (!card || !grid || !recentSection || !trendingSection) {
    return null;
  }

  const recentAvailable = trackedRecentSalesAll.value.length;
  const trendingAvailable = marketTrendingItemsAll.value.length;
  if (recentAvailable === 0 && trendingAvailable === 0) {
    return null;
  }

  const cardStyles = window.getComputedStyle(card);
  const paddingBottom = parseFloat(cardStyles.paddingBottom || '0') || 0;
  const availableHeight = Math.max(
    0,
    card.getBoundingClientRect().bottom - paddingBottom - grid.getBoundingClientRect().top
  );

  const recentList = marketRecentListRef.value;
  const trendingList = marketTrendingListRef.value;
  const recentListStyles = recentList ? window.getComputedStyle(recentList) : null;
  const trendingListStyles = trendingList ? window.getComputedStyle(trendingList) : null;
  const recentGap = parseFloat(recentListStyles?.rowGap || recentListStyles?.gap || '0') || 0;
  const trendingGap = parseFloat(trendingListStyles?.rowGap || trendingListStyles?.gap || '0') || 0;
  const recentRowHeight =
    recentList?.querySelector<HTMLElement>('.market-list__item')?.offsetHeight ??
    MARKET_ROW_FALLBACK_HEIGHT;
  const trendingRowHeight =
    trendingList?.querySelector<HTMLElement>('.market-list__item')?.offsetHeight ??
    MARKET_ROW_FALLBACK_HEIGHT;
  const recentFixedHeight = recentSection.offsetHeight - (recentList?.offsetHeight ?? 0);
  const trendingFixedHeight = trendingSection.offsetHeight - (trendingList?.offsetHeight ?? 0);
  const sectionGap = Math.max(
    0,
    trendingSection.getBoundingClientRect().top - recentSection.getBoundingClientRect().bottom
  );

  let bestRecent = recentAvailable > 0 ? 1 : 0;
  let bestTrending = trendingAvailable > 0 ? 1 : 0;
  let bestTotalRows = -1;
  let bestBalanceDelta = Number.POSITIVE_INFINITY;

  for (
    let recentRows = recentAvailable > 0 ? 1 : 0;
    recentRows <= recentAvailable;
    recentRows += 1
  ) {
    for (
      let trendingRows = trendingAvailable > 0 ? 1 : 0;
      trendingRows <= trendingAvailable;
      trendingRows += 1
    ) {
      const usedHeight =
        recentFixedHeight +
        marketListHeight(recentRows, recentRowHeight, recentGap) +
        sectionGap +
        trendingFixedHeight +
        marketListHeight(trendingRows, trendingRowHeight, trendingGap);
      if (usedHeight > availableHeight) {
        continue;
      }

      const totalRows = recentRows + trendingRows;
      const preferredRecentRows = totalRows * (4 / 7);
      const balanceDelta = Math.abs(recentRows - preferredRecentRows);
      if (
        totalRows > bestTotalRows ||
        (totalRows === bestTotalRows && balanceDelta < bestBalanceDelta)
      ) {
        bestRecent = recentRows;
        bestTrending = trendingRows;
        bestTotalRows = totalRows;
        bestBalanceDelta = balanceDelta;
      }
    }
  }

  if (bestTotalRows >= 0) {
    return { recentRows: bestRecent, trendingRows: bestTrending };
  }

  return {
    recentRows: recentAvailable > 0 ? 1 : 0,
    trendingRows: trendingAvailable > 0 ? 1 : 0
  };
}

function scheduleLootLayoutSync() {
  if (typeof window === 'undefined') return;
  clearLootLayoutSync();
  lootMeasureFrame = window.requestAnimationFrame(async () => {
    lootMeasureFrame = null;
    await nextTick();
    const measuredPageSize = measureLootPageSize();
    if (!measuredPageSize || measuredPageSize === lootPageSize.value) {
      return;
    }

    lootPageSize.value = measuredPageSize;
    const nextPage = Math.max(
      1,
      Math.min(lootPage.value, Math.max(1, Math.ceil(lootTotalItems.value / measuredPageSize)))
    );
    if (!loadingLoot.value) {
      lootPage.value = nextPage;
      void loadRecentLoot(nextPage);
    }
  });
}

function scheduleMarketLayoutSync() {
  if (typeof window === 'undefined') return;
  clearMarketLayoutSync();
  marketMeasureFrame = window.requestAnimationFrame(async () => {
    marketMeasureFrame = null;
    await nextTick();
    const measuredLimits = measureMarketRowLimits();
    if (!measuredLimits) {
      return;
    }
    if (
      measuredLimits.recentRows === marketRecentRowLimit.value &&
      measuredLimits.trendingRows === marketTrendRowLimit.value
    ) {
      return;
    }
    marketRecentRowLimit.value = measuredLimits.recentRows;
    marketTrendRowLimit.value = measuredLimits.trendingRows;
  });
}

function scheduleActivityLayoutSync() {
  if (typeof window === 'undefined') return;
  clearActivityLayoutSync();
  activityMeasureFrame = window.requestAnimationFrame(async () => {
    activityMeasureFrame = null;
    await nextTick();
    const measuredRowLimit = measureActivityRowLimit();
    if (!measuredRowLimit || measuredRowLimit === activityRowLimit.value) {
      return;
    }
    activityRowLimit.value = measuredRowLimit;
  });
}

async function loadCharacters() {
  loadingCharacters.value = true;
  try {
    const fetched = await api.fetchUserCharacters();
    characters.value = [...fetched].sort((left, right) => {
      if (left.isMain !== right.isMain) {
        return left.isMain ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    characterError.value = null;
  } finally {
    loadingCharacters.value = false;
  }
}

async function loadGuilds() {
  guilds.value = await api.fetchGuilds();
}

async function loadRecentAttendance() {
  loadingAttendance.value = true;
  attendanceError.value = null;
  try {
    recentAttendance.value = await api.fetchRecentAttendance({
      limit: DASHBOARD_ATTENDANCE_FETCH_LIMIT,
      includeMissed: true
    });
    attendancePage.value = 1;
  } catch (error) {
    attendanceError.value = extractErrorMessage(error, 'Unable to load raid attendance.');
  } finally {
    loadingAttendance.value = false;
  }
}

function normalizeRecentLootLooter(entry: RecentLootEntry) {
  const guildName = entry.raid?.guild?.name ?? null;
  const { name, isGuildBank, isMasterLooter } = normalizeLooterName(
    entry.looterName ?? null,
    guildName
  );
  return {
    name: isGuildBank ? getGuildBankDisplayName(guildName) : name,
    isGuildBank,
    isMasterLooter
  };
}

async function loadRecentLoot(page = lootPage.value) {
  loadingLoot.value = true;
  lootError.value = null;
  try {
    const response = await api.fetchRecentLoot(page, lootPageSize.value);
    recentLoot.value = (Array.isArray(response.loot) ? response.loot : [])
      .map((entry) => {
        const { name, isGuildBank, isMasterLooter } = normalizeRecentLootLooter(entry);
        return { ...entry, displayLooterName: name, isGuildBank, isMasterLooter };
      })
      .filter((entry) => !entry.isMasterLooter);
    lootTotalItems.value = response.total ?? recentLoot.value.length;
    lootPage.value = response.page ?? page;
    lootTotalPages.value = response.totalPages ?? 1;
    await nextTick();
    scheduleLootLayoutSync();
  } catch (error) {
    lootError.value = extractErrorMessage(error, 'Unable to load recent loot.');
  } finally {
    loadingLoot.value = false;
  }
}

async function loadUpcomingRaids() {
  const guildId = dashboardGuildId.value;
  if (!guildId) {
    upcomingRaids.value = [];
    upcomingRaidsError.value = null;
    return;
  }
  loadingUpcomingRaids.value = true;
  upcomingRaidsError.value = null;
  try {
    const response = await api.fetchRaidsForGuild(guildId);
    upcomingRaids.value = response.raids
      .filter((raid) => isUpcomingRaid(raid))
      .sort(
        (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
      );
  } catch (error) {
    upcomingRaidsError.value = extractErrorMessage(error, 'Unable to load upcoming raids.');
  } finally {
    loadingUpcomingRaids.value = false;
  }
}

async function loadGuildActivityMetrics() {
  const guildId = dashboardGuildId.value;
  if (!guildId) {
    guildActivityMetrics.value = null;
    return;
  }

  const startDate = new Date(
    Date.now() - DASHBOARD_GUILD_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    guildActivityMetrics.value = await api.fetchGuildMetrics(guildId, { startDate });
  } catch {
    guildActivityMetrics.value = null;
  }
}

async function loadBisEntries() {
  const selectedCharacters = pickDashboardCharacters(characters.value);
  if (selectedCharacters.length === 0) {
    dashboardBisEntries.value = [];
    bisError.value = null;
    return;
  }

  loadingBisEntries.value = true;
  bisError.value = null;
  const boardRequests = new Map<CharacterClass, Promise<BisBoard>>();

  try {
    const results = await Promise.allSettled(
      selectedCharacters.map(async (character) => {
        const request = boardRequests.get(character.class) ?? api.fetchBisBoard(character.class);
        boardRequests.set(character.class, request);
        const [board, inventory] = await Promise.all([
          request,
          api.fetchCharacterInventory(character.name)
        ]);
        const visibleSlotSummaries = board.slotSummaries.filter(
          (slot) => !DASHBOARD_BIS_EXCLUDED_SLOT_KEYS.has(slot.slotKey)
        );
        const wornItemsBySlot = new Map<number, GuildBankItem>();
        inventory
          .filter((item) => item.location === 'WORN')
          .forEach((item) => {
            if (!wornItemsBySlot.has(item.slotId)) {
              wornItemsBySlot.set(item.slotId, item);
            }
          });

        const gearSlots = visibleSlotSummaries.map((slot) => {
          const equipped = wornItemsBySlot.get(slot.slotId) ?? null;
          const winner = slot.winner ?? null;
          return {
            slotId: slot.slotId,
            slotKey: slot.slotKey,
            slotLabel: slot.slotLabel,
            equippedItemId: equipped?.itemId ?? null,
            equippedItemName: equipped?.itemName ?? null,
            equippedItemIconId: equipped?.itemIconId ?? null,
            winnerItemId: winner?.itemId ?? null,
            winnerItemName: winner?.itemName ?? null,
            isBis:
              winner?.itemId != null &&
              equipped?.itemId != null &&
              Number(equipped.itemId) === Number(winner.itemId)
          };
        });

        const equippedBisCount = gearSlots.filter((slot) => slot.isBis).length;
        const nextUpgradeSlot = gearSlots.find((slot) => !slot.isBis && slot.winnerItemName);
        const undecidedSlot = visibleSlotSummaries.find((slot) => !slot.winner);
        return {
          characterName: character.name,
          characterClass: character.class,
          equippedBisCount,
          totalSlots: gearSlots.length,
          completionPercent:
            gearSlots.length > 0 ? Math.round((equippedBisCount / gearSlots.length) * 100) : 0,
          nextSlotLabel: nextUpgradeSlot?.slotLabel ?? undecidedSlot?.slotLabel ?? null,
          nextItemName:
            nextUpgradeSlot?.winnerItemName ?? undecidedSlot?.candidates[0]?.itemName ?? null,
          gearSlots
        } satisfies DashboardBisEntry;
      })
    );

    dashboardBisEntries.value = results
      .filter(
        (result): result is PromiseFulfilledResult<DashboardBisEntry> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value);
    if (dashboardBisEntries.value.length === 0) {
      bisError.value = 'Unable to load BiS board data for your tracked mains.';
    }
  } catch (error) {
    bisError.value = extractErrorMessage(error, 'Unable to load BiS progress.');
  } finally {
    loadingBisEntries.value = false;
  }
}

async function loadMarketSummary() {
  loadingMarketCard.value = true;
  marketError.value = null;
  try {
    const summary24h = await api.fetchMarketSummary(1, 'quantity');
    marketSummary.value =
      summary24h.topItems.length > 0 || summary24h.recentSales.length > 0
        ? summary24h
        : await api.fetchMarketSummary(7, 'quantity');
  } catch (error) {
    marketSummary.value = null;
    marketError.value = extractErrorMessage(error, 'Unable to load market summary.');
  } finally {
    loadingMarketCard.value = false;
  }
}

async function loadMarketFavoriteTraders() {
  try {
    const favorites = await api.fetchMarketFavorites();
    marketFavoriteTraders.value = favorites.traders ?? [];
  } catch {
    marketFavoriteTraders.value = [];
  }
}

function openCharacterModal(character?: UserCharacter) {
  editingCharacter.value = character
    ? {
        id: character.id,
        name: character.name,
        level: character.level,
        class: character.class,
        guildId: character.guild?.id ?? null,
        isMain: character.isMain
      }
    : null;
  showCharacterForm.value = true;
}

function closeCharacterModal() {
  editingCharacter.value = null;
  showCharacterForm.value = false;
}

async function handleCharacterCreated() {
  closeCharacterModal();
  await Promise.all([loadCharacters(), loadRecentAttendance(), loadRecentLoot()]);
}

async function handleCharacterUpdated() {
  closeCharacterModal();
  await loadCharacters();
}

async function handleCharacterDeleted() {
  closeCharacterModal();
  await Promise.all([loadCharacters(), loadRecentAttendance(), loadRecentLoot()]);
}

function setAttendancePage(page: number) {
  attendancePage.value = Math.max(1, Math.min(page, attendanceTotalPages.value));
}

function setLootPage(page: number) {
  const normalized = Math.max(1, Math.min(page, lootTotalPages.value));
  if (normalized !== lootPage.value && !loadingLoot.value) {
    lootPage.value = normalized;
    void loadRecentLoot(normalized);
  }
}

function goToRaids() {
  void router.push({ name: 'Raids' });
}

function goToMarket() {
  void router.push({ name: 'Market' });
}

function goToBisPlanner(characterClass?: CharacterClass) {
  void router.push({
    name: 'BisPlanner',
    params: {
      characterClass: characterClass ?? dashboardBisEntries.value[0]?.characterClass ?? 'WARRIOR'
    }
  });
}

function openRaid(raidId: string) {
  void router.push({ name: 'RaidDetail', params: { raidId } });
}

function openRaidInNewTab(raidId: string) {
  const route = router.resolve({ name: 'RaidDetail', params: { raidId } });
  window.open(route.href, '_blank', 'noopener');
}

function toggleDashboardDensity() {
  dashboardCompact.value = !dashboardCompact.value;
}

function formatDate(value: string) {
  return formatEasternDateTime(value);
}

function formatClass(characterClass?: CharacterClass | null) {
  return characterClass ? (characterClassLabels[characterClass] ?? characterClass) : null;
}

function formatClassAbbreviation(characterClass?: CharacterClass | null) {
  return characterClass?.trim() || 'UNK';
}

function characterAttendanceTone(value: number) {
  if (value >= 60) return 'good';
  if (value >= 45) return 'neutral';
  return 'warning';
}

function bisCompletionTone(value: number) {
  if (value >= 90) return 'complete';
  if (value >= 65) return 'strong';
  if (value >= 40) return 'building';
  return 'early';
}

function bisCompletionLabel(entry: DashboardBisEntry) {
  const remaining = Math.max(entry.totalSlots - entry.equippedBisCount, 0);
  if (remaining === 0) return 'Fully Equipped';
  if (remaining === 1) return '1 Upgrade Left';
  return `${remaining} Upgrades Left`;
}

function bisGearSlotTitle(slot: DashboardBisEntry['gearSlots'][number]) {
  return `${slot.slotLabel}: ${slot.equippedItemName ?? 'Empty'}${
    slot.winnerItemName ? ` · BiS: ${slot.winnerItemName}` : ''
  }`;
}

function showBisGearSlotTooltip(event: MouseEvent, slot: DashboardBisEntry['gearSlots'][number]) {
  if (!slot.equippedItemName) {
    return;
  }
  showItemTooltip(event, {
    itemId: slot.equippedItemId,
    itemName: slot.equippedItemName,
    itemIconId: slot.equippedItemIconId
  });
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

function formatPlat(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value / 1000)} pp`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value}%`;
}

function formatEventType(eventType: RecentAttendanceEntry['eventType']) {
  switch (eventType) {
    case 'START':
      return 'Started';
    case 'END':
      return 'Ended';
    case 'RESTART':
      return 'Restarted';
    default:
      return 'Log';
  }
}

function attendanceEventMeta(event: RecentAttendanceEntry) {
  return event.characters.length > 0
    ? `${event.characters.length} recorded`
    : 'Missed by your tracked characters';
}

function eventBadgeVariant(eventType: RecentAttendanceEntry['eventType']) {
  return eventType === 'END'
    ? 'pill--negative'
    : eventType === 'START' || eventType === 'RESTART'
      ? 'pill--accent'
      : '';
}

function classDotColor(characterClass?: string | null) {
  if (!characterClass) return '#22d3ee';
  return CLASS_DOT_COLORS[characterClass.toUpperCase()] ?? '#22d3ee';
}

function sameCharacterName(left?: string | null, right?: string | null) {
  return left?.trim().toLowerCase() === right?.trim().toLowerCase();
}

function pickDashboardCharacters(list: UserCharacter[]) {
  const mains = list.filter((character) => character.isMain);
  return (mains.length > 0 ? mains : list).slice(0, 2);
}

function isUpcomingRaid(raid: RaidEventSummary) {
  const start = new Date(raid.startTime).getTime();
  return !raid.canceledAt && !raid.endedAt && Number.isFinite(start) && start > Date.now();
}

function isWithinNextDays(value: string, days: number) {
  const start = new Date(value).getTime();
  return start >= Date.now() && start <= Date.now() + days * 24 * 60 * 60 * 1000;
}

function formatDayOfMonth(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    day: '2-digit'
  }).format(new Date(value));
}

function formatWeekdayShort(value: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TIME_ZONE, weekday: 'short' })
    .format(new Date(value))
    .toUpperCase();
}

function formatCountdown(value: string) {
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs <= 0) return 'LIVE';
  const totalHours = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `IN ${days}D ${hours}H` : `IN ${Math.max(hours, 1)}H`;
}

function raidLocationLabel(raid: RaidEventSummary) {
  return raid.targetBosses[0] ?? raid.targetZones[0] ?? 'Target pending';
}

function raidLeaderLabel(raid: RaidEventSummary) {
  return raid.logMonitor?.userDisplayName ?? pageGuildName.value;
}

function raidSignupStateTone(raid: RaidEventSummary) {
  return (raid.signupCounts?.confirmed ?? 0) > 0 ? 'signed-up' : 'pending';
}

function raidSignupStateLabel(raid: RaidEventSummary) {
  return (raid.signupCounts?.confirmed ?? 0) > 0 ? 'Signed Up' : 'Pending';
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 0) {
    const futureMinutes = Math.ceil(Math.abs(diffMs) / 60000);
    if (futureMinutes < 60) return `in ${futureMinutes}m`;
    const futureHours = Math.ceil(futureMinutes / 60);
    if (futureHours < 24) return `in ${futureHours}h`;
    const futureDays = Math.ceil(futureHours / 24);
    if (futureDays < 7) return `in ${futureDays}d`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(value)
    );
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

function marketRecentSaleKey(sale: MarketRecentSale) {
  return `sale:${sale.id}`;
}

function openAllaSearch(itemName: string, itemId?: number | null) {
  if (itemId != null && Number.isFinite(itemId) && itemId > 0) {
    window.open(`https://alla.clumsysworld.com/items/${Math.trunc(itemId)}`, '_blank');
    return;
  }
  const base =
    'https://alla.clumsysworld.com/?a=items_search&&a=items&iclass=0&irace=0&islot=0&istat1=&istat1comp=%3E%3D&istat1value=&istat2=&istat2comp=%3E%3D&istat2value=&iresists=&iresistscomp=%3E%3D&iresistsvalue=&iheroics=&iheroicscomp=%3E%3D&iheroicsvalue=&imod=&imodcomp=%3E%3D&imodvalue=&itype=-1&iaugslot=0&ieffect=&iminlevel=0&ireqlevel=0&inodrop=0&iavailability=0&iavaillevel=0&ideity=0&isearch=1';
  const query = itemName?.trim().length ? itemName.trim() : itemName;
  window.open(`${base}&iname=${encodeURIComponent(query)}`, '_blank');
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    if ('response' in error && typeof (error as { response?: unknown }).response === 'object') {
      const response = error as { response?: { data?: unknown } };
      const data = response.response?.data;
      if (typeof data === 'object' && data !== null) {
        if ('message' in data && typeof (data as { message?: unknown }).message === 'string')
          return (data as { message: string }).message;
        if ('error' in data && typeof (data as { error?: unknown }).error === 'string')
          return (data as { error: string }).error;
      }
    }
    if (error instanceof Error && error.message) return error.message;
  }
  return fallback;
}

async function toggleCharacterMain(character: UserCharacter) {
  if (updatingCharacterId.value) return;
  const targetValue = !character.isMain;
  if (targetValue && mainCount.value >= 2) {
    characterError.value = 'You can only designate up to two main characters.';
    return;
  }
  updatingCharacterId.value = character.id;
  characterError.value = null;
  try {
    await api.updateCharacter(character.id, { isMain: targetValue });
    await Promise.all([loadCharacters(), loadRecentAttendance()]);
  } catch (error) {
    characterError.value = extractErrorMessage(
      error,
      'Unable to update the main designation for this character.'
    );
  } finally {
    updatingCharacterId.value = null;
  }
}

function showItemTooltip(event: MouseEvent, entry: TooltipItem) {
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

function openInventory(characterName: string, guildId?: string | null) {
  if (!guildId) {
    alert('This character is not in a guild.');
    return;
  }
  guildBankStore.openCharacterInventory(characterName, guildId);
}

const CLASS_DOT_COLORS: Record<string, string> = {
  WARRIOR: '#b91c1c',
  PALADIN: '#fde68a',
  SHADOWKNIGHT: '#a78bfa',
  RANGER: '#16a34a',
  CLERIC: '#e0f2fe',
  DRUID: '#22c55e',
  SHAMAN: '#84cc16',
  MONK: '#f59e0b',
  BARD: '#ec4899',
  ROGUE: '#9ca3af',
  NECROMANCER: '#7c3aed',
  WIZARD: '#38bdf8',
  MAGICIAN: '#f97316',
  ENCHANTER: '#f472b6',
  BEASTLORD: '#4ade80',
  BERSERKER: '#ef4444',
  UNKNOWN: '#22d3ee'
};

onMounted(async () => {
  if (!authStore.user && !authStore.loading) {
    await authStore.fetchCurrentUser();
  }
  await Promise.all([
    loadCharacters(),
    loadGuilds(),
    loadRecentAttendance(),
    loadRecentLoot(),
    loadUpcomingRaids(),
    loadGuildActivityMetrics(),
    loadMarketFavoriteTraders(),
    loadMarketSummary()
  ]);
  await nextTick();
  scheduleLootLayoutSync();
  scheduleActivityLayoutSync();
  scheduleMarketLayoutSync();
});

onBeforeUnmount(() => {
  clearMarketLayoutSync();
  clearActivityLayoutSync();
  clearLootLayoutSync();
  clearAttendanceIntroAnimation();
  clearLootIntroAnimation();
  marketResizeObserver?.disconnect();
  marketResizeObserver = null;
  activityResizeObserver?.disconnect();
  activityResizeObserver = null;
  lootResizeObserver?.disconnect();
  lootResizeObserver = null;
});
</script>
<style scoped>
@property --attendance-progress {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

.dashboard {
  --text: #edf3fb;
  --muted: #8f9cb3;
  --accent: #25c7ff;
  --accent-strong: #6b7cff;
  --card: rgba(13, 22, 43, 0.94);
  --card-alt: rgba(10, 18, 37, 0.96);
  --card-border: rgba(56, 87, 138, 0.72);
  --line: rgba(70, 96, 146, 0.42);
  min-height: calc(100vh - 4rem);
  margin: -2rem;
  padding: 1.7rem 10.4rem 2.2rem;
  color: var(--text);
  background:
    radial-gradient(circle at top right, rgba(37, 199, 255, 0.08), transparent 22%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.98) 0%, rgba(8, 15, 30, 0.99) 100%),
    linear-gradient(rgba(77, 97, 131, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(77, 97, 131, 0.12) 1px, transparent 1px);
  background-size:
    auto,
    auto,
    32px 32px,
    32px 32px;
  background-position:
    0 0,
    0 0,
    -1px -1px,
    -1px -1px;
}

.dashboard--compact {
  padding-top: 1.35rem;
}

.dashboard :deep(button) {
  font: inherit;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.15rem;
}

.page-head__line {
  margin-bottom: 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #7186a6;
}

.page-head h1 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 0.96;
  letter-spacing: -0.045em;
}

.page-head__sub {
  margin: 0.7rem 0 0;
  max-width: 34rem;
  color: #b2bfd3;
  font-size: 1rem;
}

.page-head__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.16fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'characters attendance loot'
    'characters upcoming loot'
    'bis activity market';
  gap: 1rem;
  align-items: stretch;
}

.nx-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 1.55rem;
  border: 1px solid var(--card-border);
  background:
    linear-gradient(180deg, rgba(22, 34, 63, 0.2), transparent 18%),
    linear-gradient(180deg, var(--card) 0%, var(--card-alt) 100%);
  box-shadow:
    inset 0 1px 0 rgba(148, 175, 221, 0.06),
    0 18px 44px rgba(2, 6, 18, 0.3);
  padding: 1.1rem 1.1rem 1rem;
}

.nx-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(109, 145, 209, 0.08), transparent 18%);
}

.nx-card--characters {
  grid-area: characters;
}

.nx-card--attendance {
  grid-area: attendance;
}

.nx-card--loot {
  grid-area: loot;
}

.nx-card--upcoming {
  grid-area: upcoming;
}

.nx-card--bis {
  grid-area: bis;
}

.nx-card--activity {
  grid-area: activity;
}

.nx-card--activity > .feed-list--activity,
.nx-card--activity > .muted {
  margin-top: auto;
  margin-bottom: auto;
  width: 100%;
}

.nx-card--market {
  grid-area: market;
}

.nx-card__head,
.market-col__head,
.feed-list__row,
.char__head,
.raid-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.nx-card__head {
  margin-bottom: 0.9rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--line);
}

.nx-card__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.nx-card__title h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.2;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}

.nx-card__glyph {
  width: 1.85rem;
  height: 1.85rem;
  flex-shrink: 0;
  border-radius: 0.6rem;
  border: 1px solid rgba(37, 199, 255, 0.48);
  background: linear-gradient(180deg, rgba(37, 199, 255, 0.18), rgba(37, 199, 255, 0.06));
  box-shadow: inset 0 1px 0 rgba(154, 230, 255, 0.15);
  position: relative;
}

.nx-card__glyph::before,
.nx-card__glyph::after {
  content: '';
  position: absolute;
  background: rgba(168, 238, 255, 0.86);
}

.nx-card__glyph--characters::before {
  width: 0.72rem;
  height: 0.72rem;
  border-radius: 50%;
  top: 0.36rem;
  left: 0.56rem;
}

.nx-card__glyph--characters::after {
  width: 0.96rem;
  height: 0.42rem;
  left: 0.45rem;
  bottom: 0.42rem;
  border-radius: 999px 999px 0.32rem 0.32rem;
}

.nx-card__glyph--attendance::before,
.nx-card__glyph--upcoming::before,
.nx-card__glyph--bis::before,
.nx-card__glyph--market::before {
  left: 0.42rem;
  right: 0.42rem;
  bottom: 0.52rem;
  height: 1px;
}

.nx-card__glyph--attendance::after {
  width: 0.24rem;
  height: 0.24rem;
  top: 0.58rem;
  left: 0.56rem;
  border-radius: 50%;
  box-shadow:
    0.36rem 0.18rem 0 rgba(168, 238, 255, 0.78),
    0.72rem -0.08rem 0 rgba(168, 238, 255, 0.64);
}

.nx-card__glyph--loot::before {
  width: 0.78rem;
  height: 0.56rem;
  top: 0.52rem;
  left: 0.52rem;
  border: 1px solid rgba(168, 238, 255, 0.86);
  border-radius: 0.14rem;
  background: transparent;
}

.nx-card__glyph--loot::after {
  width: 0.42rem;
  height: 0.3rem;
  top: 0.38rem;
  left: 0.7rem;
  border: 1px solid rgba(168, 238, 255, 0.86);
  border-bottom: none;
  border-radius: 0.28rem 0.28rem 0 0;
  background: transparent;
}

.nx-card__glyph--upcoming::after {
  top: 0.48rem;
  left: 0.54rem;
  width: 0.76rem;
  height: 0.62rem;
  border: 1px solid rgba(168, 238, 255, 0.86);
  border-top: 0.2rem solid rgba(168, 238, 255, 0.86);
  border-radius: 0.2rem;
  background: transparent;
}

.nx-card__glyph--bis::after {
  top: 0.48rem;
  left: 0.62rem;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 50%;
  border: 2px solid rgba(168, 238, 255, 0.86);
  background: transparent;
}

.nx-card__glyph--activity::before {
  width: 0.9rem;
  height: 1px;
  left: 0.48rem;
  top: 0.9rem;
}

.nx-card__glyph--activity::after {
  width: 0.22rem;
  height: 0.22rem;
  top: 0.52rem;
  left: 0.48rem;
  border-radius: 50%;
  box-shadow:
    0.32rem 0.36rem 0 rgba(168, 238, 255, 0.82),
    0.66rem 0.12rem 0 rgba(168, 238, 255, 0.66);
}

.nx-card__glyph--market::after {
  top: 0.48rem;
  left: 0.56rem;
  width: 0.72rem;
  height: 0.54rem;
  border: 1px solid rgba(168, 238, 255, 0.86);
  border-radius: 0.12rem;
  background: transparent;
}

.nx-card__count,
.nx-badge,
.pill,
.pagination__label,
.feed-list__time {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  white-space: nowrap;
}

.nx-card__count,
.nx-badge,
.pill {
  padding: 0.18rem 0.55rem;
  border: 1px solid rgba(82, 106, 156, 0.74);
  background: rgba(26, 38, 68, 0.82);
  color: #9caecc;
  font-size: 0.71rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: none;
}

.nx-badge {
  color: #f1d26d;
  border-color: rgba(213, 170, 71, 0.5);
}

.nx-action,
.pagination__button {
  border-radius: 0.7rem;
  border: 1px solid rgba(71, 98, 148, 0.8);
  background: rgba(18, 28, 53, 0.86);
  color: #9fb2d2;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.nx-action {
  padding: 0.48rem 0.82rem;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.nx-action:hover,
.pagination__button:hover:not(:disabled) {
  color: #e8f5ff;
  border-color: rgba(37, 199, 255, 0.72);
  background: rgba(24, 42, 74, 0.92);
  transform: translateY(-1px);
}

.nx-action--muted {
  background: rgba(16, 24, 46, 0.88);
}

.nx-action:disabled,
.pagination__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.char-list,
.feed-list,
.loot-list,
.raid-list,
.bis-list,
.market-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.char-list,
.feed-list,
.loot-list,
.raid-list,
.bis-list,
.market-list {
  display: grid;
  gap: 0.72rem;
}

.char,
.feed-list__item,
.loot-list__item,
.raid-list__item,
.bis-list__item,
.market-list__item {
  border-radius: 1rem;
  border: 1px solid rgba(56, 79, 122, 0.68);
  background: rgba(12, 20, 40, 0.84);
}

.char {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.9rem;
  align-items: center;
  padding: 0.72rem 0.84rem;
}

.char--main {
  border-color: rgba(214, 170, 66, 0.58);
  box-shadow: inset 3px 0 0 rgba(245, 184, 52, 0.9);
  background: linear-gradient(90deg, rgba(245, 184, 52, 0.08), rgba(12, 20, 40, 0.86) 12%);
}

.char__identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.72rem;
  align-items: center;
  min-width: 0;
}

.char__icon {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  border-radius: 0.58rem;
  border: 1px solid rgba(91, 121, 178, 0.68);
  background: rgba(24, 34, 63, 0.86);
}

.char__icon img,
.bis-list__icon,
.market-list__icon img,
.loot-list__icon img {
  width: 1.75rem;
  height: 1.75rem;
  object-fit: contain;
}

.char__body,
.loot-list__body,
.raid-list__body,
.market-list__body {
  min-width: 0;
}

.char__name,
.loot-list__name,
.raid-list__name,
.bis-list__name,
.market-list__name {
  margin: 0;
  font-weight: 700;
}

.char__name {
  cursor: pointer;
}

.char__level,
.char__meta,
.char__support,
.loot-list__meta,
.raid-list__meta,
.raid-list__sub,
.market-list__meta,
.feed-list__meta,
.feed-list__summary,
.muted {
  color: var(--muted);
}

.char__meta {
  display: flex;
  align-items: center;
  gap: 0.34rem;
  margin-top: 0.28rem;
  font-size: 0.92rem;
}

.char__class-dot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 999px;
  background: var(--class-color, #25c7ff);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.03);
}

.char__support,
.page-head__line,
.attendance-summary__label,
.market-col__head,
.raid-list__sub,
.char__action-link,
.raid-list__countdown,
.market-list__value,
.pagination__label,
.feed-list__time {
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
}

.char__support {
  margin-top: 0.42rem;
  font-size: 0.74rem;
  letter-spacing: 0.06em;
}

.char__rail {
  min-width: 9.8rem;
  display: grid;
  justify-items: end;
  gap: 0.52rem;
}

.char__rail-top {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.char__main-badge {
  flex-shrink: 0;
  margin-right: auto;
}

.char__progress-copy {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  min-width: 0;
  margin-left: auto;
}

.char__progress-text {
  color: #7d8ca8;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.char__progress,
.progress-bar {
  width: 100%;
  height: 0.36rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(34, 48, 81, 0.9);
}

.char__progress span,
.progress-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.char__progress span {
  background: linear-gradient(90deg, #25c7ff 0%, #53dbff 100%);
}

.char__attendance-meter {
  position: relative;
  width: 100%;
  max-width: 8.2rem;
  height: 1.95rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  border-radius: 0.2rem;
  border: 1px solid rgba(69, 83, 117, 0.62);
  background: rgba(39, 44, 56, 0.92);
}

.char__attendance-meter-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 0;
  border-radius: inherit;
  opacity: 0.9;
  transition:
    width 0.88s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.28s ease;
}

.char__attendance-meter-value {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 0 0.72rem;
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.96rem;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.01em;
}

.char__attendance-meter--good {
  background: rgba(22, 58, 48, 0.9);
  border-color: rgba(42, 109, 88, 0.78);
}

.char__attendance-meter--good .char__attendance-meter-fill {
  background: linear-gradient(90deg, rgba(33, 97, 79, 0.98) 0%, rgba(39, 130, 102, 0.98) 100%);
}

.char__attendance-meter--good .char__attendance-meter-value {
  color: #2be6b2;
}

.char__attendance-meter--neutral {
  background: rgba(62, 62, 70, 0.92);
  border-color: rgba(94, 95, 109, 0.82);
}

.char__attendance-meter--neutral .char__attendance-meter-fill {
  background: linear-gradient(90deg, rgba(94, 95, 109, 0.96) 0%, rgba(115, 117, 129, 0.96) 100%);
}

.char__attendance-meter--neutral .char__attendance-meter-value {
  color: #d0d3de;
}

.char__attendance-meter--warning {
  background: rgba(63, 35, 40, 0.92);
  border-color: rgba(120, 63, 75, 0.84);
}

.char__attendance-meter--warning .char__attendance-meter-fill {
  background: linear-gradient(90deg, rgba(131, 56, 72, 0.96) 0%, rgba(158, 66, 86, 0.96) 100%);
}

.char__attendance-meter--warning .char__attendance-meter-value {
  color: #ff667e;
}

.char__actions {
  display: flex;
  gap: 0.48rem;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  pointer-events: none;
}

.char:hover .char__actions,
.char:focus-within .char__actions {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.char__action-link {
  padding: 0;
  border: none;
  background: transparent;
  color: #9aaccc;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}

.char__action-link--active {
  color: #f1d26d;
}

.char__action-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.attendance-overview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.78rem;
  align-items: center;
  margin-bottom: 0.78rem;
  padding: 0.62rem 0.82rem;
  border-radius: 1rem;
  border: 1px solid rgba(54, 77, 120, 0.64);
  background: rgba(10, 18, 36, 0.82);
}

.attendance-ring {
  width: 4rem;
  height: 4rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  opacity: 0;
  transform: scale(0.84);
  background: conic-gradient(
    #33d0ff 0 calc(var(--attendance-progress) * 1%),
    rgba(34, 48, 81, 0.92) calc(var(--attendance-progress) * 1%) 100%
  );
  transition:
    --attendance-progress 1s cubic-bezier(0.16, 0.84, 0.22, 1),
    opacity 0.42s ease,
    transform 0.68s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.attendance-ring__inner {
  width: 2.95rem;
  height: 2.95rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(8, 14, 28, 0.98);
  border: 1px solid rgba(74, 100, 152, 0.42);
}

.attendance-ring__inner strong {
  font-size: 1.08rem;
  line-height: 1;
  opacity: 0;
  transform: translateY(0.22rem);
  transition:
    opacity 0.26s ease 0.12s,
    transform 0.42s ease 0.12s;
}

.attendance-summary__label {
  margin-bottom: 0.42rem;
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #7186a6;
}

.attendance-summary {
  opacity: 0;
  transform: translateY(0.42rem);
  transition:
    opacity 0.44s ease 0.08s,
    transform 0.52s cubic-bezier(0.2, 0.8, 0.2, 1) 0.08s;
}

.attendance-overview--ready .attendance-ring,
.attendance-overview--ready .attendance-summary,
.attendance-overview--ready .attendance-ring__inner strong {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.attendance-matrix {
  display: grid;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  gap: 0.2rem;
}

.attendance-matrix__cell {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 0.2rem;
  border: 1px solid rgba(57, 77, 117, 0.56);
  background: rgba(15, 24, 45, 0.92);
  padding: 0;
  appearance: none;
  cursor: default;
  opacity: 0;
  transform: translateY(0.3rem) scale(0.82);
  transition:
    opacity 0.36s ease,
    transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;
  transition-delay: var(--attendance-cell-delay, 0ms);
}

.attendance-matrix--ready .attendance-matrix__cell {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.attendance-matrix__cell--attended {
  border-color: rgba(67, 201, 255, 0.76);
  background: linear-gradient(180deg, rgba(49, 213, 255, 0.98) 0%, rgba(31, 163, 230, 0.96) 100%);
  box-shadow: inset 0 0 0 1px rgba(170, 235, 255, 0.12);
}

.attendance-matrix__cell--late {
  border-color: rgba(67, 201, 255, 0.76);
  background: linear-gradient(
    180deg,
    rgba(15, 24, 45, 0.92) 0%,
    rgba(15, 24, 45, 0.92) 50%,
    rgba(49, 213, 255, 0.98) 50%,
    rgba(31, 163, 230, 0.96) 100%
  );
  box-shadow: inset 0 0 0 1px rgba(170, 235, 255, 0.12);
}

.attendance-matrix__cell--left-early {
  border-color: rgba(67, 201, 255, 0.76);
  background: linear-gradient(
    180deg,
    rgba(49, 213, 255, 0.98) 0%,
    rgba(31, 163, 230, 0.96) 50%,
    rgba(15, 24, 45, 0.92) 50%,
    rgba(15, 24, 45, 0.92) 100%
  );
  box-shadow: inset 0 0 0 1px rgba(170, 235, 255, 0.12);
}

.attendance-matrix__cell--late-left-early {
  border-color: rgba(67, 201, 255, 0.76);
  background: linear-gradient(
    180deg,
    rgba(15, 24, 45, 0.92) 0%,
    rgba(15, 24, 45, 0.92) 32%,
    rgba(49, 213, 255, 0.98) 32%,
    rgba(31, 163, 230, 0.96) 68%,
    rgba(15, 24, 45, 0.92) 68%,
    rgba(15, 24, 45, 0.92) 100%
  );
  box-shadow: inset 0 0 0 1px rgba(170, 235, 255, 0.12);
}

.attendance-matrix__cell--missed {
  border-color: rgba(214, 76, 119, 0.62);
  background:
    linear-gradient(
      135deg,
      rgba(198, 57, 101, 0.18) 25%,
      transparent 25%,
      transparent 50%,
      rgba(198, 57, 101, 0.18) 50%,
      rgba(198, 57, 101, 0.18) 75%,
      transparent 75%,
      transparent 100%
    ),
    rgba(32, 17, 35, 0.92);
  background-size: 0.42rem 0.42rem;
  box-shadow: inset 0 0 0 1px rgba(255, 154, 188, 0.08);
}

.attendance-matrix__cell--empty {
  border-color: rgba(54, 69, 104, 0.28);
  background: linear-gradient(180deg, rgba(13, 20, 38, 0.72) 0%, rgba(10, 16, 31, 0.72) 100%);
  box-shadow: inset 0 0 0 1px rgba(71, 88, 124, 0.06);
  opacity: 0.22;
}

.attendance-matrix--ready .attendance-matrix__cell--empty {
  opacity: 0.22;
}

.attendance-matrix__cell--interactive {
  cursor: pointer;
}

.attendance-matrix__cell--interactive:hover,
.attendance-matrix__cell--interactive:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(111, 191, 255, 0.92);
  box-shadow:
    0 0 0 1px rgba(95, 168, 255, 0.22),
    0 6px 14px rgba(5, 11, 26, 0.34);
}

.feed-list__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.7rem;
  align-items: start;
  padding: 0.82rem 0.88rem;
}

.feed-list--activity {
  --activity-icon-size: 2.55rem;
  --activity-item-pad-y: 0.35rem;
  position: relative;
  gap: 0.95rem;
}

.feed-list--activity::before {
  content: '';
  position: absolute;
  left: calc(var(--activity-icon-size) / 2);
  top: calc(var(--activity-item-pad-y) + (var(--activity-icon-size) / 2));
  bottom: calc(var(--activity-item-pad-y) + (var(--activity-icon-size) / 2));
  width: 1px;
  background: linear-gradient(
    180deg,
    rgba(63, 91, 141, 0) 0%,
    rgba(63, 91, 141, 0.52) 10%,
    rgba(63, 91, 141, 0.52) 90%,
    rgba(63, 91, 141, 0) 100%
  );
}

.feed-list--activity .feed-list__item {
  gap: 1rem;
  align-items: center;
  position: relative;
  padding: var(--activity-item-pad-y) 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.loot-list__item,
.raid-list__item,
.bis-list__item,
.market-list__item {
  padding: 0.82rem 0.88rem;
}

.feed-list__body {
  min-width: 0;
}

.feed-list__row {
  margin-bottom: 0.26rem;
}

.feed-list__row--activity {
  align-items: baseline;
  margin-bottom: 0.28rem;
}

.feed-list__meta,
.feed-list__summary,
.market-list__meta,
.raid-list__meta,
.loot-list__meta {
  font-size: 0.83rem;
}

.feed-list__summary {
  line-height: 1.45;
}

.feed-list__headline {
  display: block;
  font-size: 1.08rem;
  line-height: 1.34;
  color: #ebf4ff;
}

.feed-list__status-dot,
.feed-list__activity-dot {
  display: block;
  width: 0.62rem;
  height: 0.62rem;
  margin-top: 0.34rem;
  border-radius: 50%;
  background: #53627f;
  box-shadow: 0 0 0 4px rgba(83, 98, 127, 0.12);
}

.feed-list__activity-dot {
  background: linear-gradient(180deg, #2fd0ff 0%, #167eb3 100%);
  box-shadow: 0 0 0 4px rgba(47, 208, 255, 0.12);
}

.feed-list__activity-icon {
  position: relative;
  z-index: 1;
  width: var(--activity-icon-size);
  height: var(--activity-icon-size);
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 1px solid rgba(69, 109, 178, 0.56);
  background: rgba(15, 24, 46, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.feed-list__activity-icon::before,
.feed-list__activity-icon::after {
  content: '';
  position: absolute;
}

.feed-list__activity-icon--scheduled {
  border-color: rgba(18, 194, 255, 0.52);
  color: #3dd7ff;
}

.feed-list__activity-icon--scheduled::before {
  width: 0.82rem;
  height: 0.82rem;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}

.feed-list__activity-icon--scheduled::after {
  width: 0.32rem;
  height: 0.58rem;
  border-right: 1.5px solid currentColor;
  border-top: 1.5px solid currentColor;
  transform: translate(0.1rem, -0.02rem) rotate(45deg);
}

.feed-list__activity-icon--start {
  border-color: rgba(22, 216, 167, 0.5);
  color: #37e6bb;
}

.feed-list__activity-icon--start::before {
  width: 0.9rem;
  height: 0.76rem;
  border: 1.5px solid currentColor;
  border-radius: 0.3rem;
}

.feed-list__activity-icon--start::after {
  width: 0.24rem;
  height: 0.24rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    -0.42rem 0 0 currentColor,
    0.42rem 0 0 currentColor;
}

.feed-list__activity-icon--end {
  border-color: rgba(237, 192, 63, 0.5);
  color: #f2c94c;
}

.feed-list__activity-icon--end::before {
  width: 0.92rem;
  height: 0.92rem;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}

.feed-list__activity-icon--end::after {
  width: 0.28rem;
  height: 0.28rem;
  border-radius: 50%;
  background: currentColor;
}

.feed-list__activity-icon--loot {
  border-color: rgba(151, 118, 255, 0.5);
  color: #a78bfa;
}

.feed-list__activity-icon--loot::before {
  width: 0.88rem;
  height: 0.66rem;
  border: 1.5px solid currentColor;
  border-radius: 0.18rem;
}

.feed-list__activity-icon--loot::after {
  width: 0.42rem;
  height: 0.3rem;
  border: 1.5px solid currentColor;
  border-bottom: none;
  border-radius: 0.28rem 0.28rem 0 0;
  transform: translateY(-0.35rem);
}

.feed-list__activity-icon--bank {
  border-color: rgba(37, 199, 255, 0.48);
  color: #45ddff;
}

.feed-list__activity-icon--bank::before {
  width: 0.84rem;
  height: 0.12rem;
  background: currentColor;
  box-shadow: 0 0.28rem 0 currentColor;
}

.feed-list__activity-icon--bank::after {
  width: 0.2rem;
  height: 0.2rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    -0.36rem -0.18rem 0 currentColor,
    0.36rem 0.18rem 0 currentColor;
}

.feed-list__time,
.pagination__label {
  color: #7b8dab;
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.pill {
  padding: 0.18rem 0.52rem;
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.pill--accent,
.feed-list__status-dot.pill--accent {
  background: rgba(32, 171, 224, 0.18);
  border-color: rgba(32, 171, 224, 0.44);
  color: #69e0ff;
}

.pill--negative,
.feed-list__status-dot.pill--negative {
  background: rgba(171, 56, 85, 0.18);
  border-color: rgba(171, 56, 85, 0.44);
  color: #ff9eb0;
}

.feed-list__status-dot.pill--accent,
.feed-list__status-dot.pill--negative {
  padding: 0;
}

.dashboard-list-intro__item {
  opacity: 0;
  transform: translateY(-1rem) scale(0.985);
  transition:
    opacity 0.42s ease,
    transform 0.56s cubic-bezier(0.18, 0.84, 0.22, 1);
  transition-delay: var(--dashboard-list-delay, 0ms);
}

.dashboard-list-intro--ready .dashboard-list-intro__item {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.loot-list__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.78rem;
  align-items: center;
  cursor: pointer;
}

.loot-list__icon,
.market-list__icon {
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border-radius: 0.72rem;
  border: 1px solid rgba(76, 101, 151, 0.62);
  background: rgba(22, 34, 63, 0.78);
  color: #9ab1d6;
  font-weight: 700;
}

.loot-list__body {
  min-width: 0;
}

.loot-list__name,
.raid-list__name,
.bis-list__name,
.market-list__name {
  margin: 0;
  font-weight: 700;
}

.loot-list__meta,
.raid-list__meta,
.market-list__meta {
  margin: 0.28rem 0 0;
}

.loot-list__looter :deep(a),
.loot-list__looter,
.market-list__value {
  color: #f1d26d;
  font-size: 0.9rem;
  font-weight: 700;
}

.raid-list__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(8rem, 9rem);
  gap: 0.85rem;
  align-items: center;
  cursor: pointer;
}

.raid-list__date {
  width: 4.3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.72rem 0.55rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(64, 85, 128, 0.7);
  background: rgba(18, 28, 53, 0.86);
}

.raid-list__date strong {
  font-size: 1.45rem;
  line-height: 1;
}

.raid-list__date span {
  margin-top: 0.2rem;
  font-size: 0.66rem;
  color: #7788a5;
  text-transform: uppercase;
  letter-spacing: 0.22em;
}

.raid-list__body {
  min-width: 0;
}

.raid-list__name {
  cursor: inherit;
}

.raid-list__countdown {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4ce0ff;
}

.raid-list__sub {
  margin: 0.22rem 0 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
}

.raid-list__status {
  display: grid;
  justify-items: end;
  align-content: center;
  gap: 0.55rem;
}

.raid-list__stamp {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 7.5rem;
  min-height: 2.15rem;
  padding: 0.3rem 0.88rem;
  border-radius: 0.22rem;
  border: 2px solid rgba(90, 110, 151, 0.54);
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: center;
  background: transparent;
  transform: rotate(-7deg);
  opacity: 0.92;
  text-shadow: 0 0 0.02rem currentColor;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 0 0 1px rgba(7, 10, 20, 0.28);
}

.raid-list__stamp::before,
.raid-list__stamp::after {
  content: '';
  position: absolute;
  inset: 0.18rem;
  border: 1px solid currentColor;
  border-radius: 0.08rem;
  opacity: 0.18;
  pointer-events: none;
}

.raid-list__stamp::after {
  inset: auto 0.42rem 0.3rem 0.42rem;
  height: 0.08rem;
  border: 0;
  background: repeating-linear-gradient(90deg, currentColor 0 0.4rem, transparent 0.4rem 0.72rem);
  opacity: 0.22;
}

.raid-list__stamp--signed-up {
  color: rgba(92, 235, 182, 0.96);
  border-color: rgba(61, 188, 140, 0.82);
  box-shadow:
    inset 0 0 0 1px rgba(92, 235, 182, 0.14),
    0 0 12px rgba(35, 131, 99, 0.14);
}

.raid-list__stamp--pending {
  color: rgba(255, 109, 129, 0.96);
  border-color: rgba(207, 77, 101, 0.82);
  box-shadow:
    inset 0 0 0 1px rgba(255, 109, 129, 0.12),
    0 0 12px rgba(142, 43, 67, 0.14);
}

.bis-list__identity {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  min-width: 0;
}

.bis-list__item {
  min-width: 0;
  cursor: pointer;
  padding: 1.05rem 1.1rem 1rem;
  border-color: rgba(73, 98, 145, 0.66);
  background:
    radial-gradient(circle at top right, rgba(89, 110, 255, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(14, 22, 43, 0.98) 0%, rgba(10, 17, 33, 0.96) 100%);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.bis-list__item:hover,
.bis-list__item:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(112, 140, 201, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 18px 26px rgba(4, 8, 20, 0.34);
}

.bis-list__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
  min-width: 0;
}

.bis-list__icon-shell {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  border-radius: 0.9rem;
  border: 1px solid rgba(86, 112, 176, 0.64);
  background:
    radial-gradient(circle at 30% 20%, rgba(96, 219, 255, 0.18), transparent 45%),
    rgba(20, 30, 56, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 18px rgba(3, 8, 20, 0.24);
}

.bis-list__icon {
  width: 2.35rem;
  height: 2.35rem;
  padding: 0.08rem;
  border-radius: 0.72rem;
}

.bis-list__score {
  min-width: 7rem;
  max-width: 100%;
  display: grid;
  justify-items: end;
  gap: 0.14rem;
  padding: 0.78rem 0.85rem 0.72rem;
  border-radius: 1rem;
  border: 1px solid rgba(88, 107, 150, 0.48);
  background: linear-gradient(180deg, rgba(21, 30, 56, 0.96) 0%, rgba(12, 18, 35, 0.94) 100%);
}

.bis-list__copy {
  min-width: 0;
}

.bis-list__eyebrow {
  margin: 0 0 0.2rem;
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7390bf;
}

.bis-list__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
  margin-top: 0.48rem;
}

.bis-list__class-chip,
.bis-list__state-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0.14rem 0.52rem;
  border-radius: 999px;
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.bis-list__class-chip {
  border: 1px solid rgba(88, 108, 146, 0.58);
  background: rgba(22, 31, 56, 0.8);
  color: #c2d1ea;
}

.bis-list__score-label {
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #7086ad;
}

.bis-list__score-value {
  display: flex;
  align-items: baseline;
  gap: 0.08rem;
  color: #dce8fb;
}

.bis-list__score-value strong {
  font-size: 2rem;
  line-height: 0.92;
  font-weight: 800;
  letter-spacing: -0.05em;
}

.bis-list__score-value span {
  color: #93a4c4;
  font-size: 1rem;
  font-weight: 700;
}

.bis-list__score-percent {
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.8rem;
  font-weight: 700;
}

.bis-list__score--complete .bis-list__score-percent,
.bis-list__state-chip--complete {
  color: #33ebb9;
}

.bis-list__score--strong .bis-list__score-percent,
.bis-list__state-chip--strong {
  color: #6addff;
}

.bis-list__score--building .bis-list__score-percent,
.bis-list__state-chip--building {
  color: #efd37d;
}

.bis-list__score--early .bis-list__score-percent,
.bis-list__state-chip--early {
  color: #ff8f9d;
}

.bis-list__state-chip {
  border: 1px solid rgba(86, 109, 149, 0.46);
  background: rgba(20, 30, 54, 0.78);
}

.bis-list__state-chip--complete {
  background: rgba(20, 70, 59, 0.58);
  border-color: rgba(54, 154, 124, 0.58);
}

.bis-list__state-chip--strong {
  background: rgba(16, 61, 79, 0.54);
  border-color: rgba(63, 150, 184, 0.58);
}

.bis-list__state-chip--building {
  background: rgba(85, 70, 27, 0.5);
  border-color: rgba(181, 150, 67, 0.54);
}

.bis-list__state-chip--early {
  background: rgba(88, 34, 45, 0.52);
  border-color: rgba(165, 80, 100, 0.56);
}

.bis-list__gear-strip {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.28rem;
  margin-top: 0.96rem;
  padding: 0.34rem;
  border-radius: 0.9rem;
  background: rgba(11, 18, 35, 0.84);
  box-shadow: inset 0 0 0 1px rgba(63, 86, 132, 0.42);
  box-sizing: border-box;
}

.bis-list__gear-slot {
  position: relative;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 0.5rem;
  border: 2px solid rgba(134, 72, 88, 0.82);
  background:
    radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.08), transparent 48%),
    rgba(16, 24, 44, 0.96);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 4px 10px rgba(4, 8, 20, 0.22);
}

.bis-list__gear-slot--bis {
  border-color: rgba(53, 182, 124, 0.9);
  box-shadow:
    inset 0 0 0 1px rgba(101, 238, 178, 0.12),
    0 0 14px rgba(28, 140, 96, 0.16);
}

.bis-list__gear-slot--missing {
  border-color: rgba(188, 71, 95, 0.82);
  box-shadow:
    inset 0 0 0 1px rgba(255, 147, 167, 0.08),
    0 0 12px rgba(118, 37, 56, 0.14);
}

.bis-list__gear-icon {
  width: 1.65rem;
  height: 1.65rem;
  object-fit: contain;
}

.bis-list__gear-fallback {
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7d90b2;
}

.bis-list__class {
  margin: 0.16rem 0 0;
  font-size: 0.72rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #93a4c4;
}

.bis-list__footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.9rem;
  align-items: end;
  margin-top: 0.88rem;
  min-width: 0;
}

.bis-list__next {
  display: grid;
  gap: 0.14rem;
  min-width: 0;
}

.bis-list__next-label,
.bis-list__cta {
  font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.bis-list__next-label {
  color: #7087aa;
}

.bis-list__next-item {
  color: #e8f2ff;
  font-size: 0.98rem;
  line-height: 1.28;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bis-list__next-slot {
  color: #98a7bf;
  font-size: 0.82rem;
}

.bis-list__next--complete .bis-list__next-item {
  color: #d8efff;
}

.bis-list__cta {
  color: #9ab4e6;
  align-self: center;
  justify-self: end;
  min-width: 0;
  white-space: nowrap;
}

.market-grid {
  display: flex;
  flex-direction: column;
  gap: 0.62rem;
}

.market-col + .market-col {
  margin-top: 0.08rem;
}

.market-col__head {
  margin-bottom: 0.42rem;
  color: #6f80a0;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.market-list__empty {
  margin: 0.08rem 0 0.24rem;
  color: #97a5ba;
  font-size: 0.9rem;
  line-height: 1.45;
}

.market-list__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.62rem;
  min-height: 0;
  padding: 0.5rem 0.62rem;
  border-radius: 0.5rem;
  border-color: rgba(52, 72, 112, 0.52);
  background: rgba(9, 16, 31, 0.88);
}

.market-list {
  gap: 0.38rem;
}

.market-list__icon {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.4rem;
  border-color: rgba(50, 74, 116, 0.5);
  background: #0a1428;
}

.market-list__icon img {
  width: 1.5rem;
  height: 1.5rem;
}

.market-list__name {
  overflow: hidden;
  color: #dbe6f4;
  font-size: 0.81rem;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.market-list__qty {
  justify-self: end;
  color: #7485a1;
  font-size: 0.69rem;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.market-list__trend {
  justify-self: end;
  padding: 0.12rem 0.38rem;
  border-radius: 0.28rem;
  font-size: 0.69rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.market-list__trend--positive {
  background: rgba(23, 110, 87, 0.34);
  color: #53e3b5;
}

.market-list__trend--negative {
  background: rgba(124, 44, 71, 0.28);
  color: #ef89a4;
}

.market-list__trend--empty {
  background: rgba(35, 47, 78, 0.34);
  color: #73839f;
}

.market-list__value {
  justify-self: end;
  color: #f1d26d;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  margin-top: auto;
  padding-top: 0.9rem;
}

.pagination__button {
  padding: 0.5rem 0.82rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.character-error,
.error {
  margin: 0 0 1rem;
  padding: 0.72rem 0.88rem;
  border-radius: 0.88rem;
  border: 1px solid rgba(191, 76, 109, 0.36);
  background: rgba(77, 18, 35, 0.42);
  color: #ffbcc8;
}

.muted {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 1280px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      'characters attendance'
      'characters upcoming'
      'loot loot'
      'bis activity'
      'market market';
  }

  .market-grid {
    grid-template-columns: 1fr;
  }

  .nx-card--bis .nx-card__head {
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: nowrap;
  }

  .nx-card--bis .nx-card__title {
    width: 100%;
    flex: 0 1 auto;
    flex-wrap: wrap;
    row-gap: 0.42rem;
  }

  .nx-card--bis .nx-card__title h2 {
    min-width: 0;
  }

  .nx-card--bis .nx-action {
    width: 100%;
    flex: 0 0 auto;
    margin-left: 0;
  }

  .char {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 0.78rem;
  }

  .char__rail {
    width: 100%;
    min-width: 0;
    justify-items: stretch;
  }

  .char__rail-top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .char__progress-copy {
    justify-content: flex-end;
  }

  .char__attendance-meter {
    max-width: none;
  }

  .char__actions {
    flex-wrap: wrap;
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}

@media (max-width: 900px) {
  .dashboard,
  .dashboard--compact {
    margin: -1.25rem;
    padding: 1rem;
  }

  .page-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      'characters'
      'attendance'
      'loot'
      'upcoming'
      'bis'
      'activity'
      'market';
  }

  .attendance-overview,
  .market-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .page-head h1 {
    font-size: 2rem;
  }

  .page-head__actions,
  .page-head__actions .nx-action {
    width: 100%;
  }

  .nx-card--bis .nx-card__head {
    flex-direction: column;
    align-items: stretch;
    gap: 0.7rem;
  }

  .nx-card--bis .nx-card__title {
    flex-basis: 100%;
  }

  .nx-card--bis .nx-action {
    width: 100%;
    margin-left: 0;
  }

  .nx-card {
    padding: 0.95rem;
    border-radius: 1.25rem;
  }

  .attendance-matrix {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 0.2rem;
  }

  .feed-list__row,
  .market-col__head,
  .nx-card__head,
  .raid-list__row,
  .pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .raid-list__item,
  .loot-list__item {
    grid-template-columns: 1fr;
  }

  .char {
    padding: 0.7rem;
  }

  .char__identity {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .char__meta {
    flex-wrap: wrap;
    row-gap: 0.18rem;
    line-height: 1.25;
  }

  .char__rail-top {
    grid-template-columns: 1fr;
    justify-items: start;
    gap: 0.42rem;
  }

  .char__main-badge,
  .char__progress-copy {
    margin: 0;
  }

  .char__actions {
    width: 100%;
    gap: 0.6rem;
  }

  .raid-list__status {
    justify-items: start;
  }

  .raid-list__countdown,
  .raid-list__stamp {
    justify-content: flex-start;
  }

  .bis-list__hero,
  .bis-list__footer {
    grid-template-columns: 1fr;
  }

  .bis-list__score {
    width: 100%;
    justify-items: start;
  }

  .bis-list__gear-strip {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  .bis-list__cta {
    align-self: flex-start;
  }
}
</style>
