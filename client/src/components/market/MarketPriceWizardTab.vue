<template>
  <section
    ref="wizardRootRef"
    class="wizard-tab"
    :class="{ 'wizard-tab--drag-active': isDragActive }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div v-if="isDragActive" class="wizard-drop-overlay" aria-hidden="true">
      <div class="wizard-drop-overlay__panel">
        <strong>Drop trader INI to link and load</strong>
        <span class="muted">Accepts `BZR_*_CWR.ini` files</span>
      </div>
    </div>
    <header class="wizard-tab__header">
      <div class="wizard-tab__hero-copy">
        <div class="wizard-tab__title-row">
          <div class="wizard-tab__title-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <p class="eyebrow">Bazaar INI Editor</p>
            <h2>Price Wizard</h2>
          </div>
        </div>
        <p class="muted wizard-tab__copy">
          Load a trader INI file, review market signals, and update prices in one workspace.
        </p>
        <div class="wizard-chip-row">
          <span class="wizard-chip wizard-chip--sky">Drag &amp; drop</span>
          <span class="wizard-chip wizard-chip--emerald">Auto-undercut</span>
          <span class="wizard-chip wizard-chip--amber">Instant export</span>
        </div>
      </div>
      <div v-if="traderIniOptions.length > 0" class="wizard-trader-picker-shell">
        <div class="wizard-trader-picker">
          <select
            v-model="selectedTraderIniFileName"
            class="wizard-trader-picker__select"
            :disabled="traderPickerDisabled"
            @change="handleTraderPickerChange"
          >
            <option value="" disabled>
              {{ traderPickerPlaceholderLabel }}
            </option>
            <option
              v-for="option in traderIniOptions"
              :key="option.relativePath"
              :value="option.relativePath"
            >
              {{ option.characterName }}
            </option>
            <option disabled class="wizard-trader-picker__divider">───────────</option>
            <option value="__link_trader_ini__">Link Trader INI</option>
          </select>
          <button
            type="button"
            class="wizard-trader-picker__icon-btn"
            title="Refresh linked traders"
            :disabled="eqGameDirectoryScanning || eqGameDirectoryLoading"
            @click="refreshTraderIniOptions()"
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      <div v-else class="wizard-directory-setup">
        <button
          type="button"
          class="wizard-directory-setup__btn"
          :disabled="traderLinkActionDisabled"
          @click="handleLinkTraderIni"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9.414 4.586A2 2 0 008 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z"
              clip-rule="evenodd"
            />
          </svg>
          {{ traderLinkActionDisabled ? 'Linking...' : 'Link Trader INI' }}
        </button>
        <span class="wizard-directory-setup__hint">
          Drop a `BZR_*.ini` file here to link a trader for future sessions.
        </span>
      </div>
      <div class="wizard-tab__actions">
        <div class="wizard-tab__action-row">
          <div class="wizard-btn-group">
            <button
              type="button"
              class="btn btn--outline"
              :disabled="!hasEntries || recommendationsLoading"
              @click="refreshRecommendations"
            >
              {{ recommendationsLoading ? 'Refreshing...' : 'Refresh' }}
            </button>
            <button
              type="button"
              class="btn btn--outline"
              :disabled="!hasApplicableRecommendations"
              @click="applyAllRecommendations"
            >
              Apply All
            </button>
            <button
              type="button"
              class="btn btn--outline wizard-btn-download"
              :disabled="!hasEntries || hasInvalidPriceInputs || saveInFlight"
              @click="saveIniFile"
            >
              <svg class="wizard-btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              {{ saveButtonLabel }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="fileName" class="wizard-summary">
      <article class="wizard-stat wizard-stat--file">
        <div class="wizard-stat__head">
          <svg class="wizard-stat__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm8 1.414L15.586 7H13a1 1 0 01-1-1V3.414zM4 4h6v2a3 3 0 003 3h2v7H4V4z"
            />
          </svg>
          <span class="wizard-stat__label">File</span>
        </div>
        <strong class="wizard-stat__value wizard-stat__value--sm">{{ fileName }}</strong>
        <small class="wizard-stat__sub">{{
          characterName ? `Trader ${characterName}` : 'Unrecognized character name'
        }}</small>
      </article>
      <article class="wizard-stat wizard-stat--entries">
        <div class="wizard-stat__head">
          <svg class="wizard-stat__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1z"
            />
          </svg>
          <span class="wizard-stat__label">Entries</span>
        </div>
        <strong class="wizard-stat__value">{{ formatNumber(entries.length) }}</strong>
        <small class="wizard-stat__sub">{{ ignoredLineSummary }}</small>
      </article>
      <article class="wizard-stat wizard-stat--recommendations">
        <div class="wizard-stat__head">
          <svg class="wizard-stat__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.615 1.738 4.346a1 1 0 01-.025.846A3.955 3.955 0 0114.6 14H14a3.98 3.98 0 01-3-1.357A3.98 3.98 0 018 14h-.6a3.955 3.955 0 01-3.327-1.298 1 1 0 01-.025-.846l1.738-4.346-1.233-.617a1 1 0 11.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"
            />
          </svg>
          <span class="wizard-stat__label">Recommendations</span>
        </div>
        <strong class="wizard-stat__value">{{ formatNumber(recommendationCount) }}</strong>
        <small class="wizard-stat__sub">{{ recommendationSummary }}</small>
      </article>
      <article class="wizard-stat wizard-stat--edited">
        <div class="wizard-stat__head">
          <svg class="wizard-stat__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M13.586 3.586a2 2 0 112.828 2.828l-8.793 8.793-3.536.707.707-3.536 8.793-8.793z"
            />
          </svg>
          <span class="wizard-stat__label">Edited</span>
        </div>
        <strong class="wizard-stat__value">{{ formatNumber(editedEntryCount) }}</strong>
        <small class="wizard-stat__sub">{{
          editedEntryCount > 0 ? 'Unsaved UI edits' : 'Matches imported file'
        }}</small>
      </article>
      <article class="wizard-stat wizard-stat--status">
        <div class="wizard-stat__head">
          <svg class="wizard-stat__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="wizard-stat__label">Export</span>
        </div>
        <strong class="wizard-stat__value">{{ formatNumber(invalidPriceEntryCount) }}</strong>
        <small class="wizard-stat__sub">{{
          invalidPriceEntryCount > 0 ? 'Fix invalid prices' : 'Ready to export'
        }}</small>
      </article>
    </div>

    <div v-if="hasEntries" class="wizard-controls-shell">
      <div class="wizard-controls">
        <label class="wizard-control wizard-control--search">
          <span class="wizard-control__label">
            <svg class="wizard-control__icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clip-rule="evenodd"
              />
            </svg>
            Search
          </span>
          <input
            v-model="searchQuery"
            type="search"
            class="input"
            placeholder="Filter by item name, id, or seller..."
          />
        </label>
        <label class="wizard-control">
          <span class="wizard-control__label">Sort by</span>
          <select v-model="sortBy" class="input">
            <option value="itemName">Item name</option>
            <option value="itemId">Item ID</option>
            <option value="currentPrice">Current price</option>
            <option value="recommendedPrice">Recommended price</option>
            <option value="delta">Gap to recommendation</option>
            <option value="variantCharges">Suffix / charges</option>
          </select>
        </label>
        <label class="wizard-control wizard-control--compact">
          <span class="wizard-control__label">Order</span>
          <select v-model="sortOrder" class="input">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <label class="wizard-toggle">
          <input v-model="showOnlyActionable" type="checkbox" class="wizard-toggle__check" />
          <span class="wizard-toggle__label">Actionable only</span>
        </label>
      </div>
    </div>

    <p v-if="hasInvalidPriceInputs" class="wizard-warning">
      One or more price inputs are invalid. Prices are edited in platinum and support 0.001 pp
      increments for 1-copper changes.
    </p>

    <div v-if="hasEntries" class="wizard-grid-shell">
      <div class="wizard-grid-shell__header">
        <div>
          <p class="wizard-controls-shell__eyebrow">Loaded Inventory</p>
          <h3>Editable bazaar price rows</h3>
          <p class="muted">
            Price inputs are in platinum. Recommendations preserve the original INI suffix when one
            is present.
          </p>
        </div>
        <div class="wizard-grid-shell__meta">
          <span class="wizard-meta-pill">{{ formatNumber(enrichedRows.length) }} visible</span>
          <span class="wizard-meta-pill wizard-meta-pill--edited">
            {{ formatNumber(editedEntryCount) }} edited
          </span>
        </div>
      </div>

      <div
        ref="scrollContainerRef"
        class="wizard-grid-scroll"
        @scroll="handleGridScroll"
        @wheel="handleGridWheel"
      >
        <div class="wizard-grid" :style="{ minHeight: totalGridHeight + 'px' }">
          <div class="wizard-grid__hdr">
            <span class="wizard-grid__hdr-label">Item</span>
            <span class="wizard-grid__hdr-label">Your Price</span>
            <span class="wizard-grid__hdr-label wizard-grid__hdr-label--center"></span>
            <span class="wizard-grid__hdr-label">Recommendation</span>
            <span class="wizard-grid__hdr-label">Market Intel</span>
            <span class="wizard-grid__hdr-label wizard-grid__hdr-label--center">Actions</span>
          </div>

          <div
            v-if="topSpacerHeight > 0"
            :style="{ height: topSpacerHeight + 'px' }"
            aria-hidden="true"
          ></div>

          <div
            v-for="row in visibleRows"
            :key="row.entry.id"
            class="wizard-grid__row"
            :class="{
              'wizard-grid__row--invalid': row.isInvalid,
              'wizard-grid__row--recommended': row.hasRec,
              'wizard-grid__row--applied': row.isAppliedRecommendation,
              'wizard-grid__row--edited': row.isEdited
            }"
          >
            <!-- Item -->
            <div class="wizard-grid__cell wizard-cell-item">
              <span v-if="row.validIcon" class="item-icon wizard-item__icon">
                <img :src="row.iconSrc" :alt="row.name" loading="lazy" />
              </span>
              <div class="wizard-item__text">
                <strong>{{ row.name }}</strong>
                <div class="wizard-item__meta">
                  <small class="muted">ID {{ formatNumber(row.entry.itemId) }}</small>
                  <span v-if="row.entry.variantCharges != null" class="wizard-suffix-tag"
                    >:{{ formatNumber(row.entry.variantCharges) }}</span
                  >
                  <span v-else class="wizard-suffix-tag wizard-suffix-tag--base">Base</span>
                  <span
                    v-if="row.isAppliedRecommendation"
                    class="wizard-inline-pill wizard-inline-pill--applied"
                  >
                    Applied · Unsaved
                  </span>
                  <span
                    v-else-if="row.isEdited"
                    class="wizard-inline-pill wizard-inline-pill--edited"
                  >
                    Edited
                  </span>
                  <span v-if="row.hasRec" class="wizard-inline-pill wizard-inline-pill--signal">
                    {{ row.recSourceLabel }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Your Price -->
            <div class="wizard-grid__cell wizard-cell-price">
              <div class="wizard-price-editor">
                <div class="wizard-price-wrap">
                  <input
                    :value="row.entry.priceInput"
                    type="text"
                    class="input wizard-price-field"
                    inputmode="decimal"
                    placeholder="0"
                    @input="handleEntryPriceInput(row.entry, $event)"
                    @blur="normalizeEntryPriceInput(row.entry)"
                  />
                  <span class="wizard-price-unit">pp</span>
                </div>
                <small v-if="row.isInvalid" class="wizard-price-error">Invalid price</small>
                <small v-else class="muted wizard-price-breakdown">
                  <CoinDisplay variant="platinum" :amount-in-copper="row.entry.priceCopper" />
                </small>
              </div>
            </div>

            <!-- Direction Arrow -->
            <div class="wizard-grid__cell wizard-cell-arrow">
              <div
                v-if="row.hasRec"
                class="wizard-arrow"
                :class="'wizard-arrow--' + row.direction"
                :title="row.directionLabel"
              >
                <svg
                  v-if="row.direction === 'lower'"
                  class="wizard-arrow__svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M10 14l-5-6h10z" />
                </svg>
                <svg
                  v-else-if="row.direction === 'raise'"
                  class="wizard-arrow__svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M10 6l5 6H5z" />
                </svg>
                <svg
                  v-else-if="row.direction === 'keep'"
                  class="wizard-arrow__svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14 10l-5 5V5z" />
                </svg>
                <svg
                  v-else
                  class="wizard-arrow__svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="2.5" />
                </svg>
              </div>
              <span v-else class="wizard-no-arrow">--</span>
            </div>

            <!-- Recommendation -->
            <div class="wizard-grid__cell wizard-cell-rec">
              <template v-if="row.rec && row.rec.recommendedPrice != null">
                <strong class="wizard-rec-price">
                  <CoinDisplay variant="platinum" :amount-in-copper="row.rec!.recommendedPrice" />
                </strong>
                <small :class="row.deltaClass">{{ row.deltaLabel }}</small>
                <small
                  v-if="row.isAppliedRecommendation"
                  class="wizard-rec-source wizard-rec-source--applied"
                >
                  Applied to this row. Save to persist it.
                </small>
                <small v-else-if="row.recHeadline" class="muted wizard-rec-source">{{
                  row.recHeadline
                }}</small>
              </template>
              <span v-else class="muted">No signal</span>
            </div>

            <!-- Market Intel -->
            <div class="wizard-grid__cell wizard-cell-intel">
              <template v-if="row.rec && row.rec.lowestListingPrice != null">
                <div class="wizard-intel-row">
                  <span class="wizard-intel-label">Lowest</span>
                  <strong
                    ><CoinDisplay variant="platinum" :amount-in-copper="row.rec.lowestListingPrice"
                  /></strong>
                </div>
                <div class="wizard-intel-row">
                  <span class="wizard-intel-label">Listings</span>
                  <span>{{ row.rec.matchedListings }}</span>
                </div>
                <div v-if="row.rec.lowestListingSellerName" class="wizard-intel-row">
                  <span class="wizard-intel-label">Seller</span>
                  <span class="wizard-intel-seller">{{ row.rec.lowestListingSellerName }}</span>
                </div>
              </template>
              <template v-else-if="row.rec && row.rec.historicalAveragePrice != null">
                <div class="wizard-intel-row">
                  <span class="wizard-intel-label">Avg</span>
                  <strong
                    ><CoinDisplay
                      variant="platinum"
                      :amount-in-copper="row.rec.historicalAveragePrice"
                  /></strong>
                </div>
                <small class="muted">Historical average</small>
              </template>
              <span v-else class="muted">--</span>
            </div>

            <!-- Actions -->
            <div class="wizard-grid__cell wizard-cell-actions">
              <button
                type="button"
                class="btn btn--outline btn--small wizard-apply-btn"
                :disabled="!row.canApply"
                @click="applyRecommendation(row.entry)"
              >
                Apply
              </button>
            </div>
          </div>

          <div
            v-if="bottomSpacerHeight > 0"
            :style="{ height: bottomSpacerHeight + 'px' }"
            aria-hidden="true"
          ></div>

          <p v-if="enrichedRows.length === 0" class="empty muted wizard-grid__empty">
            No entries match the current filter.
          </p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-state__orb" aria-hidden="true"></div>
      <p class="wizard-controls-shell__eyebrow">Ready to Import</p>
      <h3>Load a bazaar price file</h3>
      <p class="muted">
        Drop a file like `BZR_YourTrader_CWR.ini`. The wizard links that trader INI in this browser,
        reads the `[ItemToSell]` section, and surfaces market recommendations for quick edits.
      </p>
      <div class="wizard-chip-row wizard-chip-row--empty">
        <span class="wizard-chip wizard-chip--sky">Drop trader INI anywhere in this tab</span>
        <span class="wizard-chip wizard-chip--amber">Links this trader for future sessions</span>
      </div>
    </div>

    <div
      v-if="saveConfirmVisible"
      class="wizard-save-modal-backdrop"
      @click.self="resolveSaveConfirmation(false)"
    >
      <div
        class="wizard-save-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-save-modal-title"
      >
        <div class="wizard-save-modal__hero">
          <div class="wizard-save-modal__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 3h9l3 3v15H6z" />
              <path d="M9 3v6h6" />
              <path d="M9 14h6" />
              <path d="M9 18h4" />
            </svg>
          </div>
          <div class="wizard-save-modal__hero-copy">
            <p class="wizard-save-modal__eyebrow">{{ saveConfirmEyebrow }}</p>
            <h3 id="wizard-save-modal-title">{{ saveConfirmTitle }}</h3>
            <p class="wizard-save-modal__description">
              {{ saveConfirmDescription }}
            </p>
          </div>
        </div>

        <div class="wizard-save-modal__stats">
          <div class="wizard-save-stat">
            <span class="wizard-save-stat__label">File</span>
            <strong class="wizard-save-stat__value wizard-save-stat__value--file">
              {{ saveConfirmTargetFileName }}
            </strong>
          </div>
          <div class="wizard-save-stat wizard-save-stat--accent">
            <span class="wizard-save-stat__label">{{ saveConfirmCountLabel }}</span>
            <strong class="wizard-save-stat__value">
              {{ formatNumber(saveConfirmEditedCount) }}
            </strong>
          </div>
        </div>

        <div class="wizard-save-modal__note">
          {{ saveConfirmNote }}
        </div>

        <div class="wizard-save-modal__actions">
          <button type="button" class="btn btn--outline" @click="resolveSaveConfirmation(false)">
            Cancel
          </button>
          <button
            type="button"
            class="btn wizard-save-modal__confirm"
            @click="resolveSaveConfirmation(true)"
          >
            {{ saveConfirmButtonLabel }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import CoinDisplay from '../../components/CoinDisplay.vue';
import { useToastBus } from '../../components/ToastBus';
import { useErrorModal } from '../../composables/useErrorModal';
import { api, type MarketPriceWizardRecommendation } from '../../services/api';
import { useAuthStore } from '../../stores/auth';
import {
  deleteMarketPriceWizardTraderFileHandle,
  listMarketPriceWizardTraderFileHandles,
  saveMarketPriceWizardTraderFileHandle
} from '../../utils/marketPriceWizardTraderFileHandles';
import { getLootIconSrc, hasValidIconId } from '../../utils/itemIcons';

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    excludeAcceptAllOption?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle>;
};

type DragAndDropItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<unknown>;
};

type PriceWizardEntry = {
  id: string;
  itemId: number;
  variantCharges: number | null;
  sourceLineIndex: number;
  originalOrder: number;
  originalPriceCopper: number;
  priceCopper: number;
  priceInput: string;
};

type ParseResult = {
  entries: PriceWizardEntry[];
  ignoredLines: number;
  hasItemSection: boolean;
  originalLines: string[];
  lineEnding: '\r\n' | '\n';
  hasTrailingNewline: boolean;
};

type SortField =
  | 'itemName'
  | 'itemId'
  | 'currentPrice'
  | 'recommendedPrice'
  | 'delta'
  | 'variantCharges';

type TraderIniOption = {
  characterName: string;
  fileName: string;
  relativePath: string;
};

type EnrichedRow = {
  entry: PriceWizardEntry;
  rec: MarketPriceWizardRecommendation | null;
  name: string;
  iconId: number | null;
  validIcon: boolean;
  iconSrc: string | undefined;
  isEdited: boolean;
  isAppliedRecommendation: boolean;
  isInvalid: boolean;
  hasRec: boolean;
  canApply: boolean;
  direction: 'lower' | 'raise' | 'keep' | 'none';
  directionLabel: string;
  deltaClass: string;
  deltaLabel: string;
  recHeadline: string;
  recSourceLabel: string;
};

const ROW_HEIGHT = 58;
const SCROLL_BUFFER = 10;

const wizardRootRef = ref<HTMLElement | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);
const fileName = ref<string | null>(null);
const characterName = ref<string | null>(null);
const eqGameDirectoryLoading = ref(false);
const eqGameDirectorySaving = ref(false);
const eqGameDirectoryScanning = ref(false);
const eqGameDirectoryScanIssue = ref<string | null>(null);
const traderIniOptions = ref<TraderIniOption[]>([]);
const selectedTraderIniFileName = ref('');
const traderFileHandleMap = ref<Record<string, FileSystemFileHandle>>({});
const activeFileHandle = ref<FileSystemFileHandle | null>(null);
const canOverwriteLoadedFile = ref(false);
const entries = ref<PriceWizardEntry[]>([]);
const ignoredLines = ref(0);
const originalIniLines = ref<string[]>([]);
const originalLineEnding = ref<'\r\n' | '\n'>('\n');
const originalHasTrailingNewline = ref(false);
const recommendationsLoading = ref(false);
const saveInFlight = ref(false);
const searchQuery = ref('');
const debouncedSearch = ref('');
const sortBy = ref<SortField>('itemName');
const sortOrder = ref<'asc' | 'desc'>('asc');
const showOnlyActionable = ref(false);
const recommendationMap = ref<Record<string, MarketPriceWizardRecommendation>>({});
const isDragActive = ref(false);
const dragDepth = ref(0);
const scrollTop = ref(0);
const viewportHeight = ref(700);
const saveConfirmVisible = ref(false);
const saveConfirmTitle = ref('Save Price File');
const saveConfirmEyebrow = ref('Confirm Save');
const saveConfirmDescription = ref('');
const saveConfirmTargetFileName = ref('');
const saveConfirmEditedCount = ref(0);
const saveConfirmCountLabel = ref('Edits To Save');
const saveConfirmNote = ref(
  'Only modified rows will be written back into the loaded INI. Unchanged entries stay as-is.'
);
const saveConfirmButtonLabel = ref('Save Changes');

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let resizeObserver: ResizeObserver | undefined;
let saveConfirmResolver: ((value: boolean) => void) | null = null;

const authStore = useAuthStore();
const { addToast } = useToastBus();
const { showError, showErrorFromException } = useErrorModal();

watch(searchQuery, (value) => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = value;
  }, 180);
});

function handleGridScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
}

function normalizeWheelDelta(delta: number, deltaMode: number) {
  if (deltaMode === 1) {
    return delta * 16;
  }

  if (deltaMode === 2) {
    return delta * window.innerHeight;
  }

  return delta;
}

function handleGridWheel(event: WheelEvent) {
  const el = scrollContainerRef.value;
  if (!el || event.ctrlKey) {
    return;
  }

  const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
  const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  const isAtTop = el.scrollTop <= 1;
  const isAtBottom = el.scrollTop >= maxScrollTop - 1;
  const canScrollVertically =
    Math.abs(deltaY) > 0.01 && ((deltaY < 0 && !isAtTop) || (deltaY > 0 && !isAtBottom));
  const canScrollHorizontally =
    Math.abs(deltaX) > 0.01 &&
    ((deltaX < 0 && el.scrollLeft > 1) ||
      (deltaX > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth - 1));

  if (canScrollVertically || canScrollHorizontally) {
    return;
  }

  if (Math.abs(deltaY) <= 0.01) {
    return;
  }

  event.preventDefault();
  window.scrollBy({
    top: deltaY,
    behavior: 'auto'
  });
}

onMounted(() => {
  const el = scrollContainerRef.value;
  if (el) {
    viewportHeight.value = el.clientHeight;
    resizeObserver = new ResizeObserver((entries) => {
      viewportHeight.value = entries[0]?.contentRect.height ?? 700;
    });
    resizeObserver.observe(el);
  }

  window.addEventListener('keydown', handleGlobalSaveShortcut);
  void initializeEqGameDirectory();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  clearTimeout(searchDebounceTimer);
  window.removeEventListener('keydown', handleGlobalSaveShortcut);
  saveConfirmResolver?.(false);
  saveConfirmResolver = null;
});

function buildRecommendationKey(itemId: number, variantCharges: number | null): string {
  return `${itemId}:${variantCharges ?? 'na'}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPriceInputFromCopper(valueInCopper: number) {
  const platinum = valueInCopper / 1000;
  if (Number.isInteger(platinum)) {
    return String(platinum);
  }

  return platinum.toFixed(3).replace(/\.?0+$/, '');
}

function parsePriceInputToCopper(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 1000);
}

function parseIniCharacterName(value: string) {
  const match = /^BZR_(.+)_CWR(?:\.ini)?$/i.exec(value.trim());
  return match?.[1] ?? null;
}

function getFileNameFromRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? value;
}

function getPickerWindow(): PickerWindow | null {
  return typeof window === 'undefined' ? null : (window as PickerWindow);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isWizardVisible() {
  const el = wizardRootRef.value;
  return Boolean(el && el.offsetParent !== null);
}

function getCurrentUserId() {
  return authStore.user?.userId ?? null;
}

function getSuggestedIniFileName() {
  if (fileName.value) {
    return fileName.value;
  }

  if (characterName.value) {
    return `BZR_${characterName.value}_CWR.ini`;
  }

  return 'BZR_Trader_CWR.ini';
}

type PermissionCapableHandle = FileSystemHandle & {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

async function requestHandlePermission(
  handle: PermissionCapableHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> {
  if (typeof handle.queryPermission === 'function') {
    let permission = await handle.queryPermission({ mode });
    if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
      permission = await handle.requestPermission({ mode });
    }

    return permission === 'granted';
  }

  return true;
}

function buildTraderIniOption(fileName: string): TraderIniOption | null {
  const characterNameForFile = parseIniCharacterName(fileName);
  if (!characterNameForFile) {
    return null;
  }

  return {
    characterName: characterNameForFile,
    fileName,
    relativePath: fileName
  };
}

async function refreshTraderIniOptions(autoLoadIfNeeded = true) {
  eqGameDirectoryScanning.value = true;
  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      traderFileHandleMap.value = {};
      traderIniOptions.value = [];
      if (!fileName.value) {
        selectedTraderIniFileName.value = '';
      }
      return;
    }

    const storedHandles = await listMarketPriceWizardTraderFileHandles(currentUserId);
    const nextHandleMap: Record<string, FileSystemFileHandle> = {};
    const nextOptions = storedHandles
      .map((entry) => {
        nextHandleMap[entry.fileName] = entry.handle;
        return buildTraderIniOption(entry.fileName);
      })
      .filter((entry): entry is TraderIniOption => Boolean(entry));

    nextOptions.sort(
      (left, right) =>
        left.characterName.localeCompare(right.characterName) ||
        left.relativePath.localeCompare(right.relativePath)
    );

    traderFileHandleMap.value = nextHandleMap;
    traderIniOptions.value = nextOptions;
    eqGameDirectoryScanIssue.value =
      nextOptions.length > 0
        ? null
        : 'No linked trader INIs yet. Drop a BZR_*.ini file to add one.';

    const currentFileName = fileName.value;
    const selectedOption = nextOptions.find(
      (option) => option.relativePath === selectedTraderIniFileName.value
    );
    if (selectedOption && (!currentFileName || selectedOption.fileName === currentFileName)) {
      selectedTraderIniFileName.value = selectedOption.relativePath;
      if (!currentFileName && autoLoadIfNeeded) {
        await loadLinkedTraderIni(selectedOption.relativePath);
      }
      return;
    }

    const matchingLoadedOption = currentFileName
      ? nextOptions.find((option) => option.fileName === currentFileName)
      : null;
    if (matchingLoadedOption) {
      selectedTraderIniFileName.value = matchingLoadedOption.relativePath;
      return;
    }

    if (!currentFileName && nextOptions.length > 0 && autoLoadIfNeeded) {
      selectedTraderIniFileName.value = nextOptions[0].relativePath;
      await loadLinkedTraderIni(nextOptions[0].relativePath);
      return;
    }

    if (!nextOptions.some((option) => option.relativePath === selectedTraderIniFileName.value)) {
      selectedTraderIniFileName.value = '';
    }
  } catch (error) {
    console.warn('Unable to refresh linked trader INIs.', error);
    eqGameDirectoryScanIssue.value =
      error instanceof Error ? error.message : 'Unable to refresh linked trader INIs.';
    traderFileHandleMap.value = {};
    traderIniOptions.value = [];
    selectedTraderIniFileName.value = '';
  } finally {
    eqGameDirectoryScanning.value = false;
  }
}

async function initializeEqGameDirectory() {
  if (!authStore.user) {
    await authStore.fetchCurrentUser();
  }

  if (!authStore.user) {
    return;
  }

  eqGameDirectoryLoading.value = true;
  try {
    await refreshTraderIniOptions();
  } catch (error) {
    console.warn('Unable to load linked trader INIs.', error);
  } finally {
    eqGameDirectoryLoading.value = false;
  }
}

async function linkTraderIniFromHandle(handle: FileSystemFileHandle) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId) {
    return false;
  }

  if (!parseIniCharacterName(handle.name)) {
    showError('Expected a file named like BZR_CharacterName_CWR.ini.');
    return false;
  }

  await saveMarketPriceWizardTraderFileHandle(currentUserId, handle);
  await refreshTraderIniOptions(false);
  return true;
}

async function pruneLinkedTraderIniHandle(fileName: string) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId) {
    return;
  }

  await deleteMarketPriceWizardTraderFileHandle(currentUserId, fileName).catch(() => undefined);
  await refreshTraderIniOptions().catch(() => undefined);
}

async function openTraderIniPicker() {
  if (eqGameDirectorySaving.value) {
    return false;
  }

  if (!authStore.user) {
    showError('You must be signed in to link a trader INI.');
    return false;
  }

  const pickerWindow = getPickerWindow();
  if (typeof pickerWindow?.showOpenFilePicker !== 'function') {
    showError('This browser does not support linking local trader INIs directly.');
    return false;
  }

  eqGameDirectorySaving.value = true;
  try {
    const handles = await pickerWindow.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'Bazaar Trader INI Files',
          accept: {
            'text/plain': ['.ini']
          }
        }
      ]
    });
    const nextFileHandle = handles[0];
    if (!nextFileHandle) {
      return false;
    }

    const hasReadPermission = await requestHandlePermission(
      nextFileHandle as PermissionCapableHandle,
      'read'
    );
    if (!hasReadPermission) {
      showError('Read access to the selected trader INI was not granted.');
      return false;
    }

    const file = await nextFileHandle.getFile();
    const canOverwrite = await requestHandlePermission(
      nextFileHandle as PermissionCapableHandle,
      'readwrite'
    ).catch(() => false);
    const loaded = await loadIniFile(file, {
      fileHandle: nextFileHandle,
      canOverwriteLoadedFile: canOverwrite
    });
    if (!loaded) {
      return false;
    }

    const linked = await linkTraderIniFromHandle(nextFileHandle);
    if (!linked) {
      return false;
    }

    addToast({
      title: 'Trader Linked',
      message: `${file.name} is now available in the Price Wizard dropdown on this browser.`,
      variant: 'success'
    });
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      return false;
    }

    showErrorFromException(error, 'Unable to link the selected trader INI.');
    return false;
  } finally {
    eqGameDirectorySaving.value = false;
  }
}

function handleLinkTraderIni() {
  void openTraderIniPicker();
}

async function loadLinkedTraderIni(relativePathToLoad = selectedTraderIniFileName.value) {
  if (!relativePathToLoad) {
    return;
  }

  const targetFileName = getFileNameFromRelativePath(relativePathToLoad);

  try {
    const fileHandle = traderFileHandleMap.value[targetFileName];
    if (!fileHandle) {
      showError(`Reconnect ${targetFileName} by dropping or linking it again in this browser.`);
      return;
    }

    const hasReadPermission = await requestHandlePermission(
      fileHandle as PermissionCapableHandle,
      'read'
    );
    if (!hasReadPermission) {
      await pruneLinkedTraderIniHandle(targetFileName);
      showError(`Read access to ${targetFileName} was not granted.`);
      return;
    }

    const canOverwrite = await requestHandlePermission(
      fileHandle as PermissionCapableHandle,
      'readwrite'
    ).catch(() => false);
    const file = await fileHandle.getFile();
    const loaded = await loadIniFile(file, {
      fileHandle,
      canOverwriteLoadedFile: canOverwrite
    });
    if (!loaded) {
      return;
    }

    if (!canOverwrite) {
      addToast({
        title: 'Loaded Read-Only',
        message:
          'Write access was not granted for this trader INI. You can still edit prices, but saving will use Save As.',
        variant: 'info'
      });
    }
  } catch (error) {
    await pruneLinkedTraderIniHandle(targetFileName);
    showErrorFromException(error, `Unable to open linked trader INI ${targetFileName}.`);
  }
}

async function handleTraderSelection() {
  await loadLinkedTraderIni(selectedTraderIniFileName.value);
}

async function handleTraderPickerChange() {
  if (selectedTraderIniFileName.value === '__link_trader_ini__') {
    selectedTraderIniFileName.value = '';
    await openTraderIniPicker();
    return;
  }

  await handleTraderSelection();
}

async function getFileHandleFromDrop(event: DragEvent): Promise<FileSystemFileHandle | null> {
  const item = event.dataTransfer?.items?.[0] as DragAndDropItemWithHandle | undefined;
  if (!item || typeof item.getAsFileSystemHandle !== 'function') {
    return null;
  }

  const handle = await item.getAsFileSystemHandle();
  if (
    handle &&
    typeof handle === 'object' &&
    'kind' in (handle as Record<string, unknown>) &&
    (handle as { kind?: string }).kind === 'file'
  ) {
    return handle as FileSystemFileHandle;
  }

  return null;
}

function buildIniEntryLine(
  entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges' | 'priceCopper'>
) {
  const key =
    entry.variantCharges != null ? `${entry.itemId}:${entry.variantCharges}` : String(entry.itemId);
  return `${key}=${entry.priceCopper}`;
}

function buildSavedIniContent() {
  const editedEntries = entries.value.filter((entry) => isEntryEdited(entry));
  if (editedEntries.length === 0) {
    return null;
  }

  if (originalIniLines.value.length === 0) {
    const orderedEntries = [...editedEntries].sort(
      (left, right) => left.originalOrder - right.originalOrder
    );
    const fallbackLines = [
      '[ItemToSell]',
      ...orderedEntries.map((entry) => buildIniEntryLine(entry))
    ];
    return `${fallbackLines.join('\r\n')}\r\n`;
  }

  const nextLines = [...originalIniLines.value];
  for (const entry of editedEntries) {
    if (entry.sourceLineIndex < 0 || entry.sourceLineIndex >= nextLines.length) {
      continue;
    }

    nextLines[entry.sourceLineIndex] = buildIniEntryLine(entry);
  }

  const content = nextLines.join(originalLineEnding.value);
  return originalHasTrailingNewline.value ? `${content}${originalLineEnding.value}` : content;
}

function triggerIniDownload(targetFileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = targetFileName;
  link.click();
  URL.revokeObjectURL(url);
}

function markEntriesAsSaved() {
  if (originalIniLines.value.length > 0) {
    const nextLines = [...originalIniLines.value];
    for (const entry of entries.value) {
      if (entry.sourceLineIndex < 0 || entry.sourceLineIndex >= nextLines.length) {
        continue;
      }

      nextLines[entry.sourceLineIndex] = buildIniEntryLine(entry);
    }
    originalIniLines.value = nextLines;
  }

  entries.value = entries.value.map((entry) => ({
    ...entry,
    originalPriceCopper: entry.priceCopper
  }));
}

async function writeContentToHandle(handle: FileSystemFileHandle, content: string) {
  const hasPermission = await requestHandlePermission(
    handle as PermissionCapableHandle,
    'readwrite'
  );
  if (!hasPermission) {
    throw new Error('Write access to the selected INI file was not granted.');
  }

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

function showSaveConfirmation(options: { targetFileName: string; editedCount: number }) {
  saveConfirmEyebrow.value = 'Confirm Save';
  saveConfirmTitle.value = `Overwrite ${options.targetFileName}?`;
  saveConfirmTargetFileName.value = options.targetFileName;
  saveConfirmEditedCount.value = options.editedCount;
  saveConfirmCountLabel.value = 'Edits To Save';
  saveConfirmDescription.value =
    options.editedCount === 1
      ? 'One edited price will be written back to the loaded INI file.'
      : `${formatNumber(options.editedCount)} edited prices will be written back to the loaded INI file.`;
  saveConfirmNote.value =
    'Only modified rows will be written back into the loaded INI. Unchanged entries stay as-is.';
  saveConfirmButtonLabel.value = 'Save Changes';
  saveConfirmVisible.value = true;

  return new Promise<boolean>((resolve) => {
    saveConfirmResolver = resolve;
  });
}

function showReloadConfirmation(options: { targetFileName: string; editedCount: number }) {
  saveConfirmEyebrow.value = 'Confirm Reload';
  saveConfirmTitle.value = `Reload ${options.targetFileName}?`;
  saveConfirmTargetFileName.value = options.targetFileName;
  saveConfirmEditedCount.value = options.editedCount;
  saveConfirmCountLabel.value = 'Unsaved Edits';
  saveConfirmDescription.value =
    options.editedCount === 1
      ? 'One unsaved price change will be discarded and replaced with the latest INI contents.'
      : `${formatNumber(options.editedCount)} unsaved price changes will be discarded and replaced with the latest INI contents.`;
  saveConfirmNote.value =
    'Reload reads the current INI file from disk and rebuilds the wizard rows and recommendations.';
  saveConfirmButtonLabel.value = 'Reload From INI';
  saveConfirmVisible.value = true;

  return new Promise<boolean>((resolve) => {
    saveConfirmResolver = resolve;
  });
}

function resolveSaveConfirmation(confirmed: boolean) {
  saveConfirmVisible.value = false;
  saveConfirmTitle.value = 'Save Price File';
  saveConfirmEyebrow.value = 'Confirm Save';
  saveConfirmDescription.value = '';
  saveConfirmTargetFileName.value = '';
  saveConfirmEditedCount.value = 0;
  saveConfirmCountLabel.value = 'Edits To Save';
  saveConfirmNote.value =
    'Only modified rows will be written back into the loaded INI. Unchanged entries stay as-is.';
  saveConfirmButtonLabel.value = 'Save Changes';
  const resolver = saveConfirmResolver;
  saveConfirmResolver = null;
  resolver?.(confirmed);
}

function parseIniText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const lineEnding: '\r\n' | '\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = /\r?\n$/.test(text);
  const parsedEntries: PriceWizardEntry[] = [];
  let insideItemSection = false;
  let hasItemSection = false;
  let ignored = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (/^\[.*\]$/.test(trimmed)) {
      insideItemSection = trimmed.toLowerCase() === '[itemtosell]';
      if (insideItemSection) {
        hasItemSection = true;
      }
      return;
    }

    if (!insideItemSection || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      return;
    }

    const match = /^(\d+)(?::(\d+))?\s*=\s*(\d+)\s*$/.exec(trimmed);
    if (!match) {
      ignored += 1;
      return;
    }

    const [, itemIdValue, variantValue, priceValue] = match;
    const itemId = Number(itemIdValue);
    const variantCharges = variantValue != null ? Number(variantValue) : null;
    const priceCopper = Number(priceValue);

    if (
      !Number.isInteger(itemId) ||
      itemId <= 0 ||
      (variantCharges != null && (!Number.isInteger(variantCharges) || variantCharges < 0)) ||
      !Number.isInteger(priceCopper) ||
      priceCopper < 0
    ) {
      ignored += 1;
      return;
    }

    parsedEntries.push({
      id: `${index}-${itemId}-${variantCharges ?? 'na'}`,
      itemId,
      variantCharges,
      sourceLineIndex: index,
      originalOrder: parsedEntries.length,
      originalPriceCopper: priceCopper,
      priceCopper,
      priceInput: formatPriceInputFromCopper(priceCopper)
    });
  });

  return {
    entries: parsedEntries,
    ignoredLines: ignored,
    hasItemSection,
    originalLines: lines,
    lineEnding,
    hasTrailingNewline
  };
}

function getRecommendation(entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges'>) {
  return (
    recommendationMap.value[buildRecommendationKey(entry.itemId, entry.variantCharges)] ?? null
  );
}

function getEntryName(entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges'>) {
  return getRecommendation(entry)?.itemName ?? `Item ${entry.itemId}`;
}

function isEntryPriceInvalid(entry: PriceWizardEntry) {
  return parsePriceInputToCopper(entry.priceInput) == null;
}

function isRecommendationActionable(
  entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges' | 'priceCopper'>
) {
  const recommendedPrice = getRecommendation(entry)?.recommendedPrice;
  return recommendedPrice != null && entry.priceCopper !== recommendedPrice;
}

function hasRecommendation(
  entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges' | 'priceCopper'>
) {
  return isRecommendationActionable(entry);
}

function canApplyRecommendation(
  entry: Pick<PriceWizardEntry, 'itemId' | 'variantCharges' | 'priceCopper'>
) {
  return isRecommendationActionable(entry);
}

function isEntryEdited(entry: PriceWizardEntry) {
  return entry.priceCopper !== entry.originalPriceCopper;
}

function isAppliedRecommendation(entry: PriceWizardEntry) {
  const recommendation = getRecommendation(entry);
  return (
    isEntryEdited(entry) &&
    recommendation?.recommendedPrice != null &&
    !isRecommendationActionable(entry)
  );
}

function getRecommendationHeadline(recommendation: MarketPriceWizardRecommendation) {
  switch (recommendation.recommendationSource) {
    case 'listing-undercut':
      return 'Lowest matching listing minus 1 copper';
    case 'historical-average':
      return 'Fallback to historical average';
    default:
      return 'No recommendation';
  }
}

function getRecommendationSourceLabel(recommendation: MarketPriceWizardRecommendation) {
  if (recommendation.recommendationSource === 'listing-undercut') {
    return 'Competitive';
  }

  if (recommendation.recommendationSource === 'historical-average') {
    return 'Average';
  }

  return 'Manual';
}

function getRecommendationDeltaClass(entry: PriceWizardEntry) {
  const recommendation = getRecommendation(entry);
  if (!recommendation || recommendation.recommendedPrice == null) {
    return 'muted';
  }

  if (!isRecommendationActionable(entry)) {
    return 'muted';
  }

  if (entry.priceCopper > recommendation.recommendedPrice) {
    return 'wizard-delta wizard-delta--high';
  }

  if (entry.priceCopper < recommendation.recommendedPrice) {
    return 'wizard-delta wizard-delta--low';
  }

  return 'wizard-delta wizard-delta--match';
}

function getRecommendationDirection(entry: PriceWizardEntry): 'lower' | 'raise' | 'keep' | 'none' {
  const recommendation = getRecommendation(entry);
  if (!recommendation || recommendation.recommendedPrice == null) {
    return 'none';
  }

  if (!isRecommendationActionable(entry)) {
    return 'none';
  }

  if (entry.priceCopper > recommendation.recommendedPrice) {
    return 'lower';
  }

  if (entry.priceCopper < recommendation.recommendedPrice) {
    return 'raise';
  }

  return 'keep';
}

function getRecommendationDirectionLabel(entry: PriceWizardEntry) {
  if (getRecommendation(entry)?.recommendedPrice != null && !isRecommendationActionable(entry)) {
    return 'On target';
  }

  const direction = getRecommendationDirection(entry);
  if (direction === 'lower') return 'Lower price';
  if (direction === 'raise') return 'Raise price';
  if (direction === 'keep') return 'Keep price';
  return 'No recommendation';
}

function formatCopperAsCurrency(valueInCopper: number): string {
  const abs = Math.abs(valueInCopper);
  const pp = Math.floor(abs / 1000);
  const gp = Math.floor((abs % 1000) / 100);
  const sp = Math.floor((abs % 100) / 10);
  const cp = abs % 10;

  const parts: string[] = [];
  if (pp > 0) parts.push(`${formatNumber(pp)}pp`);
  if (gp > 0) parts.push(`${gp}gp`);
  if (sp > 0) parts.push(`${sp}sp`);
  if (cp > 0 || parts.length === 0) parts.push(`${cp}cp`);

  return parts.join(' ');
}

function getRecommendationDeltaLabel(entry: PriceWizardEntry) {
  const recommendation = getRecommendation(entry);
  if (!recommendation || recommendation.recommendedPrice == null) {
    return 'No recommendation';
  }

  if (!isRecommendationActionable(entry)) {
    return 'On target';
  }

  const delta = entry.priceCopper - recommendation.recommendedPrice;
  const formatted = formatCopperAsCurrency(Math.abs(delta));

  if (delta > 0) {
    return `Reduce by ${formatted}`;
  }

  return `Increase by ${formatted}`;
}

function handleEntryPriceInput(entry: PriceWizardEntry, event: Event) {
  const target = event.target as HTMLInputElement | null;
  entry.priceInput = target?.value ?? '';

  const parsed = parsePriceInputToCopper(entry.priceInput);
  if (parsed != null) {
    entry.priceCopper = parsed;
  }
}

function normalizeEntryPriceInput(entry: PriceWizardEntry) {
  const parsed = parsePriceInputToCopper(entry.priceInput);
  entry.priceInput = formatPriceInputFromCopper(parsed ?? entry.priceCopper);
}

function applyRecommendation(entry: PriceWizardEntry) {
  if (!canApplyRecommendation(entry)) {
    return;
  }

  const recommendation = getRecommendation(entry);
  if (recommendation?.recommendedPrice == null) {
    return;
  }

  entry.priceCopper = recommendation.recommendedPrice;
  entry.priceInput = formatPriceInputFromCopper(recommendation.recommendedPrice);
}

function applyAllRecommendations() {
  let applied = 0;

  for (const entry of entries.value) {
    if (!canApplyRecommendation(entry)) {
      continue;
    }

    const recommendation = getRecommendation(entry);
    if (recommendation?.recommendedPrice == null) {
      continue;
    }

    entry.priceCopper = recommendation.recommendedPrice;
    entry.priceInput = formatPriceInputFromCopper(recommendation.recommendedPrice);
    applied += 1;
  }

  if (applied > 0) {
    addToast({
      title: 'Recommendations Applied',
      message: `Updated ${applied} price ${applied === 1 ? 'entry' : 'entries'}.`,
      variant: 'success'
    });
  }
}

async function fetchRecommendationsForEntries(targetEntries: PriceWizardEntry[]) {
  if (targetEntries.length === 0) {
    recommendationMap.value = {};
    return;
  }

  recommendationsLoading.value = true;
  try {
    const uniqueEntries = Array.from(
      new Map(
        targetEntries.map((entry) => [
          buildRecommendationKey(entry.itemId, entry.variantCharges),
          {
            itemId: entry.itemId,
            variantCharges: entry.variantCharges
          }
        ])
      ).values()
    );

    const recommendations = await api.fetchMarketPriceWizardRecommendations(uniqueEntries, {
      currentSellerName: characterName.value
    });
    recommendationMap.value = Object.fromEntries(
      recommendations.map((recommendation) => [
        buildRecommendationKey(recommendation.itemId, recommendation.variantCharges),
        recommendation
      ])
    );
  } catch (error) {
    recommendationMap.value = {};
    showErrorFromException(error, 'Unable to load market price recommendations.');
  } finally {
    recommendationsLoading.value = false;
  }
}

async function refreshRecommendations() {
  if (saveConfirmVisible.value) {
    return;
  }

  const activeHandle = activeFileHandle.value;
  const linkedTraderPath = selectedTraderIniFileName.value;
  const editedCount = editedEntryCount.value;

  if (activeHandle || linkedTraderPath) {
    if (editedCount > 0) {
      const targetFileName = activeHandle?.name ?? getFileNameFromRelativePath(linkedTraderPath);
      const confirmed = await showReloadConfirmation({
        targetFileName,
        editedCount
      });
      if (!confirmed) {
        return;
      }
    }

    if (activeHandle) {
      recommendationsLoading.value = true;
      try {
        const hasReadPermission = await requestHandlePermission(
          activeHandle as PermissionCapableHandle,
          'read'
        );
        if (!hasReadPermission) {
          throw new Error(`Read access to ${activeHandle.name} was not granted.`);
        }

        const canOverwrite = await requestHandlePermission(
          activeHandle as PermissionCapableHandle,
          'readwrite'
        ).catch(() => false);
        const file = await activeHandle.getFile();
        await loadIniFile(file, {
          fileHandle: activeHandle,
          canOverwriteLoadedFile: canOverwrite
        });
        return;
      } catch (error) {
        showErrorFromException(error, `Unable to reload ${activeHandle.name} from disk.`);
        return;
      } finally {
        recommendationsLoading.value = false;
      }
    }

    await loadLinkedTraderIni(linkedTraderPath);
    return;
  }

  await fetchRecommendationsForEntries(entries.value);
}

async function loadDroppedFile(
  file: File | null | undefined,
  fileHandle: FileSystemFileHandle | null = null
) {
  if (!file) {
    return;
  }

  try {
    await loadIniFile(file, { fileHandle });
  } catch (error) {
    showErrorFromException(error, 'Unable to read the dropped INI file.');
  }
}

async function loadIniFile(
  file: File,
  options: {
    fileHandle?: FileSystemFileHandle | null;
    canOverwriteLoadedFile?: boolean;
  } = {}
) {
  const parsedCharacterName = parseIniCharacterName(file.name);
  if (!parsedCharacterName) {
    showError(
      'Expected a file name like BZR_CharacterName_CWR.ini so the wizard can identify the trader.'
    );
    return false;
  }

  const text = await file.text();
  const parsed = parseIniText(text);
  if (!parsed.hasItemSection) {
    showError('The selected INI does not contain an [ItemToSell] section.');
    return false;
  }

  if (parsed.entries.length === 0) {
    showError('No valid item price rows were found in the [ItemToSell] section.');
    return false;
  }

  fileName.value = file.name;
  characterName.value = parsedCharacterName;
  const selectedOption = traderIniOptions.value.find(
    (option) => option.relativePath === selectedTraderIniFileName.value
  );
  const matchingOption = traderIniOptions.value.find((option) => option.fileName === file.name);
  selectedTraderIniFileName.value =
    selectedOption?.fileName === file.name
      ? selectedOption.relativePath
      : (matchingOption?.relativePath ?? '');
  activeFileHandle.value = options.fileHandle ?? null;
  canOverwriteLoadedFile.value = options.canOverwriteLoadedFile ?? false;
  entries.value = parsed.entries;
  ignoredLines.value = parsed.ignoredLines;
  originalIniLines.value = parsed.originalLines;
  originalLineEnding.value = parsed.lineEnding;
  originalHasTrailingNewline.value = parsed.hasTrailingNewline;
  searchQuery.value = '';
  showOnlyActionable.value = false;

  await fetchRecommendationsForEntries(parsed.entries);

  addToast({
    title: 'INI Loaded',
    message: `Loaded ${parsed.entries.length} bazaar price ${parsed.entries.length === 1 ? 'entry' : 'entries'}.`,
    variant: 'success'
  });
  return true;
}

function handleDragEnter() {
  dragDepth.value += 1;
  isDragActive.value = true;
}

function handleDragOver() {
  isDragActive.value = true;
}

function handleDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) {
    isDragActive.value = false;
  }
}

async function handleDrop(event: DragEvent) {
  dragDepth.value = 0;
  isDragActive.value = false;
  const fileHandle = await getFileHandleFromDrop(event).catch(() => null);
  const droppedFile =
    (fileHandle ? await fileHandle.getFile().catch(() => null) : null) ??
    event.dataTransfer?.files?.[0] ??
    null;
  if (!droppedFile) {
    return;
  }

  if (fileHandle) {
    const hasPermission = await requestHandlePermission(
      fileHandle as PermissionCapableHandle,
      'read'
    ).catch(() => false);
    if (hasPermission) {
      const canOverwrite = await requestHandlePermission(
        fileHandle as PermissionCapableHandle,
        'readwrite'
      ).catch(() => false);
      const file = await fileHandle.getFile().catch(() => null);
      if (file) {
        const loaded = await loadIniFile(file, {
          fileHandle,
          canOverwriteLoadedFile: canOverwrite
        });
        if (loaded && parseIniCharacterName(file.name) && getCurrentUserId()) {
          await linkTraderIniFromHandle(fileHandle).catch(() => false);
        }

        if (loaded && !canOverwrite) {
          addToast({
            title: 'Loaded Read-Only',
            message:
              'Write access was not granted for this file. You can still edit prices, but saving will use Save As.',
            variant: 'info'
          });
        }
        return;
      }
    }
  }

  await loadDroppedFile(droppedFile, null);
}

async function saveIniFile() {
  if (entries.value.length === 0 || saveInFlight.value || saveConfirmVisible.value) {
    return;
  }

  if (hasInvalidPriceInputs.value) {
    showError('Fix invalid price inputs before saving the updated INI.');
    return;
  }

  const editedCount = editedEntryCount.value;
  if (editedCount === 0) {
    addToast({
      title: 'No Changes To Save',
      message: 'Only edited rows are saved, and there are no pending edits right now.',
      variant: 'info'
    });
    return;
  }

  const content = buildSavedIniContent();
  if (!content) {
    showError('Unable to build the updated INI content from the edited rows.');
    return;
  }

  const targetFileName = activeFileHandle.value?.name ?? getSuggestedIniFileName();

  try {
    if (activeFileHandle.value && canOverwriteLoadedFile.value) {
      const confirmed = await showSaveConfirmation({
        targetFileName,
        editedCount
      });
      if (!confirmed) {
        return;
      }

      saveInFlight.value = true;
      await writeContentToHandle(activeFileHandle.value, content);
      fileName.value = activeFileHandle.value.name;
      markEntriesAsSaved();
      addToast({
        title: 'INI Saved',
        message: `Saved ${formatNumber(editedCount)} edited ${editedCount === 1 ? 'row' : 'rows'} directly to ${activeFileHandle.value.name}.`,
        variant: 'success'
      });
      return;
    }

    const pickerWindow = getPickerWindow();
    if (typeof pickerWindow?.showSaveFilePicker === 'function') {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: targetFileName,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'Bazaar INI Files',
            accept: {
              'text/plain': ['.ini']
            }
          }
        ]
      });

      saveInFlight.value = true;
      await writeContentToHandle(handle, content);
      activeFileHandle.value = handle;
      canOverwriteLoadedFile.value = true;
      fileName.value = handle.name;
      markEntriesAsSaved();
      addToast({
        title: 'INI Saved',
        message: `Saved ${formatNumber(editedCount)} edited ${editedCount === 1 ? 'row' : 'rows'} to ${handle.name}. Future saves will update this file directly.`,
        variant: 'success'
      });
      return;
    }

    saveInFlight.value = true;
    triggerIniDownload(targetFileName, content);
    markEntriesAsSaved();
    addToast({
      title: 'INI Downloaded',
      message: `Downloaded ${targetFileName} with ${formatNumber(editedCount)} edited ${editedCount === 1 ? 'row' : 'rows'}. Direct save is unavailable in this browser, so future saves will download a copy.`,
      variant: 'success'
    });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    showErrorFromException(error, `Unable to save ${targetFileName}.`);
  } finally {
    saveInFlight.value = false;
  }
}

async function handleGlobalSaveShortcut(event: KeyboardEvent) {
  if (saveConfirmVisible.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      resolveSaveConfirmation(false);
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      resolveSaveConfirmation(true);
      return;
    }
  }

  if (
    event.defaultPrevented ||
    !isWizardVisible() ||
    entries.value.length === 0 ||
    saveInFlight.value ||
    saveConfirmVisible.value ||
    event.altKey ||
    (!event.ctrlKey && !event.metaKey) ||
    event.key.toLowerCase() !== 's'
  ) {
    return;
  }

  event.preventDefault();
  await saveIniFile();
}

const hasEntries = computed(() => entries.value.length > 0);
const traderPickerPlaceholderLabel = computed(() => {
  if (traderIniOptions.value.length > 0) {
    return 'Select linked trader';
  }

  if (eqGameDirectoryScanning.value || eqGameDirectoryLoading.value) {
    return 'Refreshing...';
  }

  if (eqGameDirectoryScanIssue.value) {
    return 'Link trader INI';
  }

  return 'No linked traders';
});
const traderPickerDisabled = computed(
  () => eqGameDirectoryScanning.value || eqGameDirectoryLoading.value
);
const traderLinkActionDisabled = computed(
  () => eqGameDirectorySaving.value || eqGameDirectoryLoading.value
);
const recommendationCount = computed(
  () => entries.value.filter((entry) => isRecommendationActionable(entry)).length
);
const editedEntryCount = computed(
  () => entries.value.filter((entry) => isEntryEdited(entry)).length
);
const invalidPriceEntryCount = computed(
  () => entries.value.filter((entry) => isEntryPriceInvalid(entry)).length
);
const hasInvalidPriceInputs = computed(() => invalidPriceEntryCount.value > 0);
const hasApplicableRecommendations = computed(() => recommendationCount.value > 0);
const saveButtonLabel = computed(() => {
  if (saveInFlight.value) {
    return 'Saving...';
  }

  return activeFileHandle.value && canOverwriteLoadedFile.value ? 'Save' : 'Save As';
});
const ignoredLineSummary = computed(() =>
  ignoredLines.value > 0 ? `${ignoredLines.value} lines ignored` : 'All item rows parsed cleanly'
);
const recommendationSummary = computed(() => {
  if (recommendationsLoading.value) {
    return 'Refreshing market signals';
  }

  const listingBased = entries.value.filter(
    (entry) =>
      isRecommendationActionable(entry) &&
      getRecommendation(entry)?.recommendationSource === 'listing-undercut'
  ).length;
  const averageBased = entries.value.filter(
    (entry) =>
      isRecommendationActionable(entry) &&
      getRecommendation(entry)?.recommendationSource === 'historical-average'
  ).length;

  if (listingBased > 0 && averageBased > 0) {
    return `${listingBased} undercut, ${averageBased} average`;
  }

  if (listingBased > 0) {
    return `${listingBased} undercut from active listings`;
  }

  if (averageBased > 0) {
    return `${averageBased} from historical averages`;
  }

  return 'No actionable price changes right now';
});

const displayEntries = computed(() => {
  const query = debouncedSearch.value.trim().toLowerCase();
  const filteredEntries = entries.value.filter((entry) => {
    if (showOnlyActionable.value && !hasRecommendation(entry)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const recommendation = getRecommendation(entry);
    const haystack = [
      getEntryName(entry),
      String(entry.itemId),
      entry.variantCharges != null ? String(entry.variantCharges) : '',
      recommendation?.lowestListingSellerName ?? ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });

  return filteredEntries.sort((left, right) => {
    const leftRecommendation = getRecommendation(left);
    const rightRecommendation = getRecommendation(right);

    const compareNumber = (leftValue: number | null, rightValue: number | null) => {
      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return leftValue - rightValue;
    };

    let result = 0;

    switch (sortBy.value) {
      case 'itemId':
        result = left.itemId - right.itemId;
        break;
      case 'currentPrice':
        result = left.priceCopper - right.priceCopper;
        break;
      case 'recommendedPrice':
        result = compareNumber(
          leftRecommendation?.recommendedPrice ?? null,
          rightRecommendation?.recommendedPrice ?? null
        );
        break;
      case 'delta':
        result = compareNumber(
          leftRecommendation?.recommendedPrice != null
            ? left.priceCopper - leftRecommendation.recommendedPrice
            : null,
          rightRecommendation?.recommendedPrice != null
            ? right.priceCopper - rightRecommendation.recommendedPrice
            : null
        );
        break;
      case 'variantCharges':
        result = compareNumber(left.variantCharges, right.variantCharges);
        if (result === 0) {
          result = left.itemId - right.itemId;
        }
        break;
      case 'itemName':
      default:
        result = getEntryName(left).localeCompare(getEntryName(right));
        break;
    }

    if (result === 0) {
      result = left.originalOrder - right.originalOrder;
    }

    return sortOrder.value === 'asc' ? result : -result;
  });
});

// Pre-compute all derived data per row so the template does zero repeated lookups
const enrichedRows = computed<EnrichedRow[]>(() => {
  return displayEntries.value.map((entry) => {
    const rec = getRecommendation(entry);
    const actionableRecommendation = isRecommendationActionable(entry);
    const appliedRecommendation = isAppliedRecommendation(entry);
    const direction = getRecommendationDirection(entry);
    const iconId = rec?.itemIconId ?? null;
    const valid = hasValidIconId(iconId);

    return {
      entry,
      rec,
      name: rec?.itemName ?? `Item ${entry.itemId}`,
      iconId,
      validIcon: valid,
      iconSrc: valid ? getLootIconSrc(iconId!) : undefined,
      isEdited: entry.priceCopper !== entry.originalPriceCopper,
      isAppliedRecommendation: appliedRecommendation,
      isInvalid: parsePriceInputToCopper(entry.priceInput) == null,
      hasRec: actionableRecommendation,
      canApply: actionableRecommendation,
      direction,
      directionLabel: getRecommendationDirectionLabel(entry),
      deltaClass: getRecommendationDeltaClass(entry),
      deltaLabel: getRecommendationDeltaLabel(entry),
      recHeadline: actionableRecommendation && rec ? getRecommendationHeadline(rec) : '',
      recSourceLabel: actionableRecommendation && rec ? getRecommendationSourceLabel(rec) : ''
    };
  });
});

// Virtual scrolling: only render rows visible in the scroll viewport
const totalGridHeight = computed(() => enrichedRows.value.length * ROW_HEIGHT);

const visibleRange = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - SCROLL_BUFFER);
  const count = Math.ceil(viewportHeight.value / ROW_HEIGHT) + 2 * SCROLL_BUFFER;
  const end = Math.min(enrichedRows.value.length, start + count);
  return { start, end };
});

const visibleRows = computed(() =>
  enrichedRows.value.slice(visibleRange.value.start, visibleRange.value.end)
);

const topSpacerHeight = computed(() => visibleRange.value.start * ROW_HEIGHT);
const bottomSpacerHeight = computed(() =>
  Math.max(0, (enrichedRows.value.length - visibleRange.value.end) * ROW_HEIGHT)
);

// Reset scroll position when filters change
watch([debouncedSearch, sortBy, sortOrder, showOnlyActionable], () => {
  const el = scrollContainerRef.value;
  if (el) {
    el.scrollTop = 0;
    scrollTop.value = 0;
  }
});
</script>

<style scoped>
.wizard-tab {
  --wizard-border: rgba(148, 163, 184, 0.16);
  --wizard-surface: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  --wizard-panel-shadow: 0 18px 44px rgba(2, 6, 23, 0.24);
  display: grid;
  gap: 1.25rem;
  position: relative;
  border-radius: 1rem;
}

.wizard-tab--drag-active {
  outline: 2px dashed rgba(96, 165, 250, 0.92);
  outline-offset: 0.35rem;
}

.wizard-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.wizard-drop-overlay__panel {
  display: grid;
  gap: 0.35rem;
  padding: 1.15rem 1.4rem;
  border-radius: 1.15rem;
  border: 1px solid rgba(96, 165, 250, 0.42);
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.16), transparent 55%),
    rgba(15, 23, 42, 0.92);
  box-shadow: 0 20px 46px rgba(2, 6, 23, 0.35);
  text-align: center;
}

.wizard-tab__header {
  display: flex;
  justify-content: space-between;
  gap: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 1.15rem 1.25rem;
  border-radius: 1.15rem;
  border: 1px solid var(--wizard-border);
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 30%),
    radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.08), transparent 26%),
    var(--wizard-surface);
  box-shadow: var(--wizard-panel-shadow);
}

.wizard-tab__hero-copy {
  display: grid;
  gap: 0.45rem;
  min-width: min(100%, 30rem);
}

.wizard-tab__title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.wizard-tab__title-row h2 {
  margin: 0;
}

.wizard-tab__title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(245, 158, 11, 0.15));
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  flex-shrink: 0;
}

.wizard-tab__title-icon svg {
  width: 1.35rem;
  height: 1.35rem;
}

.wizard-tab__copy {
  margin: 0;
  max-width: 40rem;
  line-height: 1.45;
  font-size: 0.88rem;
}

.wizard-tab__actions {
  display: grid;
  gap: 0.85rem;
  justify-items: stretch;
  width: min(100%, 35rem);
}

.wizard-tab__action-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}

.wizard-trader-picker-shell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  flex-shrink: 0;
}

.wizard-trader-picker {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.wizard-trader-picker__select {
  min-width: 11rem;
  max-width: 15rem;
  min-height: 2.15rem;
  padding: 0.35rem 2rem 0.35rem 0.65rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(56, 189, 248, 0.22);
  background-color: rgba(2, 6, 23, 0.65);
  color: #e2e8f0;
  font-size: 0.84rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2338bdf8'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.45rem center;
  background-size: 1rem;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.wizard-trader-picker__select:hover:not(:disabled) {
  border-color: rgba(56, 189, 248, 0.4);
  background-color: rgba(2, 6, 23, 0.8);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.08);
}

.wizard-trader-picker__select:focus {
  outline: none;
  border-color: #22d3ee;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.18),
    0 2px 8px rgba(34, 211, 238, 0.08);
  background-color: rgba(2, 6, 23, 0.85);
}

.wizard-trader-picker__select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wizard-trader-picker__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  padding: 0;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(2, 6, 23, 0.5);
  color: rgba(148, 163, 184, 0.7);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}

.wizard-trader-picker__icon-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
  color: #7dd3fc;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.1);
}

.wizard-trader-picker__icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.wizard-trader-picker__icon-btn svg {
  width: 0.9rem;
  height: 0.9rem;
}

.wizard-directory-setup {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.wizard-directory-setup__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(56, 189, 248, 0.3);
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(14, 165, 233, 0.08));
  color: #7dd3fc;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    box-shadow 0.15s;
  white-space: nowrap;
}

.wizard-directory-setup__btn svg {
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
}

.wizard-directory-setup__btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.14));
  border-color: rgba(56, 189, 248, 0.45);
  color: #bae6fd;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
}

.wizard-directory-setup__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wizard-directory-setup__hint {
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.7);
  white-space: nowrap;
}

.wizard-tab__file-input {
  display: none;
}

.wizard-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
}

.wizard-btn-primary:hover {
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
}

.wizard-btn-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.wizard-btn-group {
  display: flex;
  gap: 0;
  border-radius: 0.65rem;
  overflow: hidden;
}

.wizard-btn-group .btn {
  border: none;
  border-radius: 0;
  font-weight: 600;
  font-size: 0.82rem;
  padding: 0.5rem 0.85rem;
}

.wizard-btn-group .btn:nth-child(1) {
  background: rgba(129, 140, 248, 0.18);
  border-right: 1px solid rgba(129, 140, 248, 0.15);
  color: #a5b4fc;
}

.wizard-btn-group .btn:nth-child(1):hover:not(:disabled) {
  background: rgba(129, 140, 248, 0.3);
}

.wizard-btn-group .btn:nth-child(2) {
  background: rgba(52, 211, 153, 0.16);
  border-right: 1px solid rgba(52, 211, 153, 0.12);
  color: #6ee7b7;
}

.wizard-btn-group .btn:nth-child(2):hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.28);
}

.wizard-btn-group .btn:nth-child(3) {
  background: rgba(251, 191, 36, 0.14);
  color: #fcd34d;
}

.wizard-btn-group .btn:nth-child(3):hover:not(:disabled) {
  background: rgba(251, 191, 36, 0.25);
}

.wizard-btn-group .btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.wizard-btn-download {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.wizard-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.wizard-chip-row--empty {
  justify-content: center;
}

.wizard-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.6rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.wizard-chip--sky {
  border-color: rgba(56, 189, 248, 0.2);
  background: rgba(14, 116, 144, 0.15);
  color: #7dd3fc;
}

.wizard-chip--emerald {
  border-color: rgba(52, 211, 153, 0.2);
  background: rgba(6, 95, 70, 0.18);
  color: #6ee7b7;
}

.wizard-chip--amber {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(120, 53, 15, 0.18);
  color: #fcd34d;
}

.wizard-summary {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.65rem;
}

.wizard-stat {
  position: relative;
  overflow: hidden;
  padding: 0.85rem 0.95rem;
  border-radius: 0.85rem;
  border: 1px solid var(--wizard-border);
  background: var(--wizard-surface);
  box-shadow: 0 4px 16px rgba(2, 6, 23, 0.2);
  display: grid;
  gap: 0.2rem;
}

.wizard-stat::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: rgba(148, 163, 184, 0.35);
}

.wizard-stat__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.15rem;
}

.wizard-stat__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.8;
}

.wizard-stat--file {
  background:
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.08), transparent 60%),
    var(--wizard-surface);
}
.wizard-stat--entries {
  background:
    radial-gradient(circle at bottom right, rgba(129, 140, 248, 0.08), transparent 60%),
    var(--wizard-surface);
}
.wizard-stat--recommendations {
  background:
    radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.08), transparent 60%),
    var(--wizard-surface);
}
.wizard-stat--edited {
  background:
    radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.08), transparent 60%),
    var(--wizard-surface);
}
.wizard-stat--status {
  background:
    radial-gradient(circle at bottom right, rgba(248, 113, 113, 0.08), transparent 60%),
    var(--wizard-surface);
}

.wizard-stat--file::before {
  background: linear-gradient(180deg, #38bdf8, #0ea5e9);
}
.wizard-stat--file .wizard-stat__icon {
  color: #38bdf8;
}

.wizard-stat--entries::before {
  background: linear-gradient(180deg, #818cf8, #38bdf8);
}
.wizard-stat--entries .wizard-stat__icon {
  color: #818cf8;
}

.wizard-stat--recommendations::before {
  background: linear-gradient(180deg, #34d399, #22c55e);
}
.wizard-stat--recommendations .wizard-stat__icon {
  color: #34d399;
}

.wizard-stat--edited::before {
  background: linear-gradient(180deg, #f59e0b, #f97316);
}
.wizard-stat--edited .wizard-stat__icon {
  color: #f59e0b;
}

.wizard-stat--status::before {
  background: linear-gradient(180deg, #f87171, #fb7185);
}
.wizard-stat--status .wizard-stat__icon {
  color: #f87171;
}

.wizard-stat__value {
  font-size: 1.5rem;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.wizard-stat__value--sm {
  font-size: 0.88rem;
  letter-spacing: 0;
  word-break: break-all;
}

.wizard-stat__sub {
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.8);
  line-height: 1.3;
}

.wizard-stat__label {
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
  font-weight: 700;
}

.wizard-controls-shell,
.wizard-grid-shell {
  border: 1px solid var(--wizard-border);
  background: var(--wizard-surface);
  box-shadow: var(--wizard-panel-shadow);
}

.wizard-controls-shell {
  display: grid;
  gap: 0;
  padding: 0.85rem 1rem;
  border-radius: 0.85rem;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.06), transparent 30%),
    rgba(15, 23, 42, 0.75);
}

.wizard-controls-shell__eyebrow {
  margin: 0;
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #fbbf24;
}

.wizard-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) repeat(2, minmax(9rem, 0.65fr)) auto;
  gap: 0.65rem;
  align-items: flex-end;
}

.wizard-control {
  display: grid;
  gap: 0.35rem;
}

.wizard-control--compact {
  min-width: 0;
}

.wizard-control .input,
.wizard-control select.input {
  min-height: 2.6rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background-color: rgba(2, 6, 23, 0.6);
  color: #e2e8f0;
  font-size: 0.88rem;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.wizard-control .input:hover {
  border-color: rgba(148, 163, 184, 0.3);
  background-color: rgba(2, 6, 23, 0.75);
}

.wizard-control .input:focus {
  outline: none;
  border-color: #22d3ee;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.2),
    0 2px 8px rgba(34, 211, 238, 0.1);
  background-color: rgba(2, 6, 23, 0.85);
}

.wizard-control select.input {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.6rem center;
  background-size: 1.1rem;
  padding-right: 2.2rem;
}

.wizard-control select.input:hover {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2322d3ee'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E");
}

.wizard-control--search .input {
  padding-left: 0.85rem;
}

.wizard-control--search .input::placeholder {
  color: rgba(148, 163, 184, 0.45);
}

.wizard-control__label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

.wizard-control__icon {
  width: 0.8rem;
  height: 0.8rem;
  color: rgba(56, 189, 248, 0.5);
}

.wizard-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.6rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(2, 6, 23, 0.6);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.wizard-toggle:hover {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(2, 6, 23, 0.75);
}

.wizard-toggle__check {
  accent-color: #22d3ee;
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.wizard-toggle__label {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.82);
  white-space: nowrap;
}

.wizard-warning {
  margin: 0;
  padding: 0.95rem 1.05rem;
  border-radius: 1rem;
  border: 1px solid rgba(251, 191, 36, 0.28);
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.16), transparent 32%),
    rgba(120, 53, 15, 0.3);
  color: #fde68a;
}

.wizard-grid-shell {
  border-radius: 1.2rem;
  overflow: hidden;
}

.wizard-grid-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.15rem 1.15rem 0;
}

.wizard-grid-shell__header h3,
.wizard-grid-shell__header p:last-child {
  margin: 0;
}

.wizard-grid-shell__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: flex-end;
}

.wizard-meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #bae6fd;
  font-size: 0.82rem;
  font-weight: 700;
}

.wizard-meta-pill--edited {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.2);
  color: #fde68a;
}

/* ── Data Grid ── */

.wizard-grid-scroll {
  margin-top: 0.85rem;
  padding: 0 0.2rem 0.2rem;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 68vh;
}

.wizard-grid {
  min-width: 68rem;
}

.wizard-grid__hdr {
  display: grid;
  grid-template-columns:
    minmax(18rem, 2fr) minmax(10rem, 1fr) 3.5rem minmax(11rem, 1.2fr) minmax(11rem, 1.2fr)
    6rem;
  gap: 0;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.65rem 0.9rem;
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.wizard-grid__hdr-label {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
  font-weight: 700;
  padding: 0 0.5rem;
}

.wizard-grid__hdr-label--center {
  text-align: center;
}

.wizard-grid__row {
  display: grid;
  grid-template-columns:
    minmax(18rem, 2fr) minmax(10rem, 1fr) 3.5rem minmax(11rem, 1.2fr) minmax(11rem, 1.2fr)
    6rem;
  gap: 0;
  align-items: center;
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  transition: background 0.15s ease;
}

.wizard-grid__row:hover {
  background: rgba(30, 41, 59, 0.32);
}

.wizard-grid__row--invalid {
  background: rgba(127, 29, 29, 0.14);
}

.wizard-grid__row--recommended {
  background: rgba(15, 118, 110, 0.06);
}

.wizard-grid__row--applied {
  background:
    linear-gradient(90deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02) 42%, transparent 75%),
    rgba(30, 41, 59, 0.1);
}

.wizard-grid__row--edited {
  box-shadow: inset 3px 0 0 rgba(245, 158, 11, 0.8);
}

.wizard-grid__cell {
  padding: 0.35rem 0.5rem;
}

.wizard-grid__empty {
  padding: 2rem 1rem;
  text-align: center;
}

/* ── Item cell ── */

.wizard-cell-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.wizard-item__icon {
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.wizard-item__text {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.wizard-item__text strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wizard-item__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.wizard-suffix-tag {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0.1rem 0.45rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.14);
  color: #bfdbfe;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.wizard-suffix-tag--base {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.4);
  color: #94a3b8;
}

.wizard-inline-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.wizard-inline-pill--edited {
  background: rgba(245, 158, 11, 0.18);
  color: #fde68a;
}

.wizard-inline-pill--applied {
  border: 1px solid rgba(251, 191, 36, 0.26);
  background: linear-gradient(135deg, rgba(217, 119, 6, 0.32), rgba(245, 158, 11, 0.18));
  color: #fef3c7;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.wizard-inline-pill--signal {
  background: rgba(52, 211, 153, 0.14);
  color: #bbf7d0;
}

/* ── Price editor cell ── */

.wizard-price-editor {
  display: grid;
  gap: 0.3rem;
}

.wizard-price-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  border-radius: 0.65rem;
  border: 1px solid rgba(226, 232, 240, 0.16);
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.wizard-price-wrap:focus-within {
  border-color: #22d3ee;
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.2);
}

.wizard-price-field {
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0.5rem 0.6rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
  font-weight: 600;
  min-width: 0;
  flex: 1;
  color: #f1f5f9;
}

.wizard-price-field:focus {
  outline: none;
}

.wizard-price-unit {
  padding: 0.5rem 0.65rem 0.5rem 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(148, 163, 184, 0.7);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.wizard-price-error {
  font-size: 0.72rem;
  color: #fca5a5;
  font-weight: 600;
}

.wizard-price-breakdown {
  font-size: 0.72rem;
}

.wizard-price-breakdown :deep(.coin-display) {
  justify-content: flex-start;
}

/* ── Arrow indicator cell ── */

.wizard-cell-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
}

.wizard-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  border: 1.5px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.6);
  transition: transform 0.15s ease;
}

.wizard-grid__row:hover .wizard-arrow {
  transform: scale(1.1);
}

.wizard-arrow__svg {
  width: 1.1rem;
  height: 1.1rem;
}

.wizard-arrow--lower {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(127, 29, 29, 0.35);
  color: #f87171;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.15);
}

.wizard-arrow--raise {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(20, 83, 45, 0.35);
  color: #4ade80;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.15);
}

.wizard-arrow--keep {
  border-color: rgba(56, 189, 248, 0.35);
  background: rgba(14, 116, 144, 0.25);
  color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.1);
}

.wizard-arrow--none {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.4);
  color: #64748b;
}

.wizard-no-arrow {
  color: rgba(148, 163, 184, 0.4);
  font-size: 0.8rem;
  text-align: center;
  display: block;
  width: 100%;
}

/* ── Recommendation cell ── */

.wizard-cell-rec {
  display: grid;
  gap: 0.2rem;
  align-content: center;
}

.wizard-rec-price {
  font-size: 0.95rem;
  color: #f1f5f9;
}

.wizard-rec-source {
  font-size: 0.68rem;
}

.wizard-rec-source--applied {
  color: #fdba74;
}

.wizard-delta {
  font-size: 0.72rem;
  font-weight: 600;
}

.wizard-delta--high {
  color: #fca5a5;
}

.wizard-delta--low {
  color: #93c5fd;
}

.wizard-delta--match {
  color: #86efac;
}

/* ── Market intel cell ── */

.wizard-cell-intel {
  display: grid;
  gap: 0.2rem;
  align-content: center;
}

.wizard-intel-row {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  font-size: 0.82rem;
}

.wizard-intel-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.65);
  min-width: 3.8rem;
  flex-shrink: 0;
}

.wizard-intel-seller {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 10rem;
}

/* ── Actions cell ── */

.wizard-cell-actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.wizard-apply-btn:not(:disabled) {
  border-color: rgba(52, 211, 153, 0.3);
  background: rgba(6, 95, 70, 0.28);
  color: #d1fae5;
}

.wizard-apply-btn:not(:disabled):hover {
  background: rgba(6, 95, 70, 0.45);
  border-color: rgba(52, 211, 153, 0.5);
}

.wizard-save-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.14), transparent 28%), rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(10px);
}

.wizard-save-modal {
  width: min(34rem, 100%);
  border-radius: 1.4rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.18), transparent 34%),
    radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.14), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94));
  box-shadow:
    0 28px 70px rgba(2, 6, 23, 0.52),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  padding: 1.35rem;
  display: grid;
  gap: 1rem;
}

.wizard-save-modal__hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.95rem;
  align-items: start;
}

.wizard-save-modal__icon {
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 1rem;
  display: grid;
  place-items: center;
  color: #67e8f9;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(14, 165, 233, 0.14));
  border: 1px solid rgba(103, 232, 249, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.wizard-save-modal__icon svg {
  width: 1.55rem;
  height: 1.55rem;
}

.wizard-save-modal__hero-copy {
  display: grid;
  gap: 0.35rem;
}

.wizard-save-modal__eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #fbbf24;
}

.wizard-save-modal__hero-copy h3 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
}

.wizard-save-modal__description {
  margin: 0;
  color: rgba(226, 232, 240, 0.8);
  line-height: 1.5;
}

.wizard-save-modal__stats {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(10rem, 0.7fr);
  gap: 0.8rem;
}

.wizard-save-stat {
  min-width: 0;
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem 0.95rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.62);
}

.wizard-save-stat--accent {
  background:
    linear-gradient(135deg, rgba(6, 182, 212, 0.16), rgba(14, 165, 233, 0.08)),
    rgba(15, 23, 42, 0.72);
  border-color: rgba(103, 232, 249, 0.18);
}

.wizard-save-stat__label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.72);
}

.wizard-save-stat__value {
  font-size: 1.35rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1.1;
}

.wizard-save-stat__value--file {
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #bae6fd;
}

.wizard-save-modal__note {
  padding: 0.8rem 0.95rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(52, 211, 153, 0.14);
  background: rgba(6, 78, 59, 0.2);
  color: #d1fae5;
  font-size: 0.84rem;
  line-height: 1.45;
}

.wizard-save-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.wizard-save-modal__confirm {
  border: 1px solid rgba(34, 211, 238, 0.32);
  background: linear-gradient(135deg, #0891b2, #0ea5e9);
  color: #f8fafc;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.28);
}

.wizard-save-modal__confirm:hover {
  background: linear-gradient(135deg, #06b6d4, #38bdf8);
}

.empty-state {
  position: relative;
  padding: 2rem;
  overflow: hidden;
  border-radius: 1.25rem;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.1), transparent 34%),
    radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.12), transparent 32%),
    rgba(15, 23, 42, 0.42);
  display: grid;
  gap: 0.9rem;
  justify-items: center;
  text-align: center;
}

.empty-state h3 {
  margin: 0;
}

.empty-state__orb {
  width: 5rem;
  height: 5rem;
  border-radius: 999px;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(191, 219, 254, 0.95),
    rgba(56, 189, 248, 0.85) 42%,
    rgba(14, 116, 144, 0.92) 100%
  );
  box-shadow:
    0 0 0 0.55rem rgba(56, 189, 248, 0.08),
    0 18px 46px rgba(14, 116, 144, 0.24);
}

@media (max-width: 900px) {
  .wizard-tab__header,
  .wizard-controls,
  .wizard-grid-shell__header {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .wizard-tab__actions,
  .wizard-tab__action-row {
    width: 100%;
  }

  .wizard-trader-picker-shell,
  .wizard-trader-picker,
  .wizard-directory-setup {
    justify-content: center;
  }

  .wizard-trader-picker-shell {
    align-items: center;
  }

  .wizard-tab__action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .wizard-summary {
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  }

  .wizard-controls {
    grid-template-columns: 1fr;
  }

  .wizard-control,
  .wizard-control--compact {
    min-width: 0;
    flex: 1 1 12rem;
  }

  .wizard-btn-group {
    width: 100%;
  }

  .wizard-trader-picker,
  .wizard-directory-setup {
    justify-content: center;
  }

  .wizard-tab__action-row > .btn {
    flex: 1;
  }

  .wizard-btn-group .btn {
    flex: 1;
  }

  .wizard-grid {
    min-width: 60rem;
  }

  .wizard-grid__row {
    padding: 0.5rem 0.65rem;
  }

  .wizard-save-modal__hero,
  .wizard-save-modal__stats {
    grid-template-columns: 1fr;
  }

  .wizard-save-modal__actions {
    flex-direction: column;
  }

  .wizard-save-modal__actions .btn {
    width: 100%;
  }
}
</style>
