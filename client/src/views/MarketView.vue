<template>
  <section class="market-view">
    <header class="hero">
      <div class="hero__left">
        <h1>Market</h1>
        <div class="hero-meta">
          <template v-if="activeTab === 'market'">
            <span class="pill">{{ selectedRangeLabel }}</span>
            <span class="pill pill--muted"
              >Synced
              {{ formatSyncTime(summary?.syncStatus.lastSyncedAt ?? null) }}</span
            >
          </template>
          <template v-else-if="activeTab === 'listings'">
            <span class="pill">Listings cache</span>
            <span class="pill pill--muted"
              >Retrieved {{ formatSyncTime(listingsLastRetrievedAt) }}</span
            >
          </template>
          <template v-else-if="activeTab === 'traders'">
            <span class="pill">Saved traders</span>
            <span
              class="pill"
              :class="traderAttentionCount > 0 ? 'pill--danger-soft' : 'pill--success-soft'"
            >
              {{ traderAttentionMeta }}
            </span>
          </template>
          <template v-else>
            <span class="pill pill--muted">Personal watchlist</span>
          </template>
        </div>
      </div>
      <div class="hero-actions">
        <template v-if="activeTab === 'market'">
          <select v-model="selectedRangeDays" class="input">
            <option :value="null">All time</option>
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
            <option :value="180">180 days</option>
            <option :value="365">365 days</option>
          </select>
          <button
            type="button"
            class="btn btn--accent"
            :disabled="isRefreshButtonDisabled"
            @click="refreshAll"
          >
            {{ refreshButtonLabel }}
          </button>
        </template>
      </div>
    </header>

    <nav class="market-page-tabs" role="tablist" aria-label="Market page tabs">
      <button
        id="market-tab-market"
        type="button"
        role="tab"
        class="market-page-tab"
        :class="{ 'market-page-tab--active': activeTab === 'market' }"
        :aria-selected="activeTab === 'market'"
        aria-controls="market-panel-market"
        @click="activeTab = 'market'"
      >
        Market Trends
      </button>
      <button
        id="market-tab-listings"
        type="button"
        role="tab"
        class="market-page-tab"
        :class="{ 'market-page-tab--active': activeTab === 'listings' }"
        :aria-selected="activeTab === 'listings'"
        aria-controls="market-panel-listings"
        @click="activeTab = 'listings'"
      >
        Listings
      </button>
      <button
        id="market-tab-traders"
        type="button"
        role="tab"
        class="market-page-tab"
        :class="{ 'market-page-tab--active': activeTab === 'traders' }"
        :aria-selected="activeTab === 'traders'"
        aria-controls="market-panel-traders"
        @click="activeTab = 'traders'"
      >
        <span>My Traders</span>
        <span v-if="traderAttentionCount > 0" class="market-page-tab__badge">
          {{ traderAttentionCount }}
        </span>
      </button>
      <button
        id="market-tab-favorites"
        type="button"
        role="tab"
        class="market-page-tab"
        :class="{ 'market-page-tab--active': activeTab === 'favorites' }"
        :aria-selected="activeTab === 'favorites'"
        aria-controls="market-panel-favorites"
        @click="activeTab = 'favorites'"
      >
        Watchlist
      </button>
    </nav>

    <section
      v-show="activeTab === 'market'"
      id="market-panel-market"
      role="tabpanel"
      aria-labelledby="market-tab-market"
      class="market-tab-panel"
    >
      <article class="panel panel--search" ref="searchPanelRef">
        <div class="panel-head">
          <div>
            <h2>Item Search</h2>
            <p class="muted">Select an item to see its seller-side history.</p>
          </div>
        </div>
        <div class="search-wrap">
          <input
            v-model="searchQuery"
            type="search"
            class="input search-input"
            placeholder="Search items..."
            @focus="handleSearchFocus"
          />
          <small v-if="searchLoading" class="muted search-hint">Searching...</small>
          <div v-if="showSearchResults" class="search-results">
            <div
              v-for="result in searchResults"
              :key="`${result.itemId ?? 'name'}-${result.itemName}`"
              class="search-row"
            >
              <button
                type="button"
                class="search-row__select"
                @mouseenter="
                  showMarketItemTooltip($event, result.itemId, result.itemName, result.itemIconId)
                "
                @mousemove="updateMarketItemTooltipPosition($event)"
                @mouseleave="hideMarketItemTooltip"
                @click="selectSearchResult(result)"
              >
                <span v-if="hasValidIconId(result.itemIconId)" class="item-icon">
                  <img
                    :src="getLootIconSrc(result.itemIconId!)"
                    :alt="result.itemName"
                    loading="lazy"
                  />
                </span>
                <span class="search-row__text">
                  <strong>{{ result.itemName }}</strong>
                  <small v-if="result.hasMarketData" class="muted">
                    {{ result.saleCount }} sales · {{ formatCompactDate(result.lastSoldAt) }}
                  </small>
                  <small v-else class="muted search-row__meta search-row__meta--empty">
                    No market data yet. Open the item or add it to your watchlist.
                  </small>
                </span>
              </button>
              <button
                v-if="!result.hasMarketData"
                type="button"
                class="btn btn--outline btn--small search-row__watch"
                :class="{ 'favorite-action--active': isItemFavorited(result) }"
                :disabled="isItemFavorited(result) || isItemFavoritePending(result)"
                @click="watchSearchResult(result)"
              >
                {{ getItemWatcherActionLabel(result) }}
              </button>
            </div>
            <p
              v-if="!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0"
              class="search-empty muted"
            >
              No matching items found.
            </p>
          </div>
        </div>
      </article>

      <GlobalLoadingSpinner v-if="showLoading" />

      <template v-else>
        <div v-if="displaySales.length" class="sales-ticker">
          <div class="sales-ticker__track">
            <div class="sales-ticker__content">
              <span
                v-for="sale in tickerSales"
                :key="sale.id"
                class="sales-ticker__item"
                @click="selectSaleItem(sale)"
              >
                <img
                  v-if="hasValidIconId(sale.itemIconId)"
                  :src="getLootIconSrc(sale.itemIconId!)"
                  class="sales-ticker__icon"
                  alt=""
                />
                <span class="sales-ticker__name">{{ sale.itemName }}</span>
                <span class="sales-ticker__price">
                  <CoinDisplay variant="platinum" :amount-in-copper="sale.price" />
                </span>
                <span
                  class="sales-ticker__trend"
                  :class="'sales-ticker__trend--' + getPriceTrendDirection(sale.price, sale.itemAveragePrice)"
                  :title="getPriceTrendLabel(sale.price, sale.itemAveragePrice)"
                >{{ getPriceTrendIcon(sale.price, sale.itemAveragePrice) }}</span>
                <span v-if="sale.quantity > 1" class="sales-ticker__qty">x{{ sale.quantity }}</span>
                <span class="sales-ticker__time">{{ formatTickerTime(sale.occurredAt) }}</span>
                <span class="sales-ticker__sep">&middot;</span>
              </span>
            </div>
            <div class="sales-ticker__content" aria-hidden="true">
              <span
                v-for="sale in tickerSales"
                :key="'dup-' + sale.id"
                class="sales-ticker__item"
                @click="selectSaleItem(sale)"
              >
                <img
                  v-if="hasValidIconId(sale.itemIconId)"
                  :src="getLootIconSrc(sale.itemIconId!)"
                  class="sales-ticker__icon"
                  alt=""
                />
                <span class="sales-ticker__name">{{ sale.itemName }}</span>
                <span class="sales-ticker__price">
                  <CoinDisplay variant="platinum" :amount-in-copper="sale.price" />
                </span>
                <span
                  class="sales-ticker__trend"
                  :class="'sales-ticker__trend--' + getPriceTrendDirection(sale.price, sale.itemAveragePrice)"
                  :title="getPriceTrendLabel(sale.price, sale.itemAveragePrice)"
                >{{ getPriceTrendIcon(sale.price, sale.itemAveragePrice) }}</span>
                <span v-if="sale.quantity > 1" class="sales-ticker__qty">x{{ sale.quantity }}</span>
                <span class="sales-ticker__time">{{ formatTickerTime(sale.occurredAt) }}</span>
                <span class="sales-ticker__sep">&middot;</span>
              </span>
            </div>
          </div>
        </div>

        <article class="panel panel--chart-fill">
          <div class="panel-head">
            <div>
              <h2>Market Flow</h2>
              <p class="muted">Revenue and units sold across the selected timeline.</p>
            </div>
          </div>
          <div class="chart-box">
            <Line v-if="overallChartData" :data="overallChartData" :options="overallChartOptions" />
            <p v-else class="empty muted">No synced sales are available for this timeline.</p>
          </div>
        </article>

        <section class="market-summary-layout">
          <article class="panel">
            <div class="panel-head">
              <div>
                <h2>Recent Bazaar Sales</h2>
                <p class="muted">Latest synced seller-side transactions.</p>
              </div>
            </div>
            <div v-if="displaySales.length" class="table-wrap">
              <table class="market-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Trend</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Seller</th>
                    <th>Buyer</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="sale in displaySales" :key="sale.id">
                    <td>
                      <button
                        type="button"
                        class="table-item table-item-button"
                        @mouseenter="showMarketSaleTooltip($event, sale)"
                        @mousemove="updateMarketItemTooltipPosition($event)"
                        @mouseleave="hideMarketItemTooltip"
                        @click="selectSaleItem(sale)"
                      >
                        <span v-if="hasValidIconId(sale.itemIconId)" class="item-icon">
                          <img
                            :src="getLootIconSrc(sale.itemIconId!)"
                            :alt="sale.itemName"
                            loading="lazy"
                          />
                        </span>
                        <span>{{ sale.itemName }}</span>
                      </button>
                    </td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="sale.price" /></td>
                    <td>
                      <span
                        class="trend-indicator"
                        :class="getPriceTrendClass(sale.price, sale.itemAveragePrice)"
                        :title="getPriceTrendLabel(sale.price, sale.itemAveragePrice)"
                      >
                        {{ getPriceTrendIcon(sale.price, sale.itemAveragePrice) }}
                      </span>
                    </td>
                    <td>{{ formatNumber(sale.quantity) }}</td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="sale.totalCost" /></td>
                    <td>
                      <button
                        type="button"
                        class="character-history-link"
                        @click="openCharacterHistoryModal(sale.sellerCharacterName, 'sell')"
                      >
                        {{ sale.sellerCharacterName }}
                      </button>
                    </td>
                    <td>
                      <button
                        v-if="canOpenCharacterHistory(sale.buyerCharacterName)"
                        type="button"
                        class="character-history-link"
                        @click="openCharacterHistoryModal(sale.buyerCharacterName, 'buy')"
                      >
                        {{ sale.buyerCharacterName }}
                      </button>
                      <span v-else class="muted">—</span>
                    </td>
                    <td>{{ formatDateTime(sale.occurredAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="salesPage && salesPage.totalPages > 1" class="pagination">
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="salesLoading || salesPage.page <= 1"
                @click="changeSalesPage(salesPage.page - 1)"
              >
                Previous
              </button>
              <span class="pagination__meta muted">
                Page {{ salesPage.page }} of {{ salesPage.totalPages }} ·
                {{ formatNumber(salesPage.total) }} sales
              </span>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="salesLoading || salesPage.page >= salesPage.totalPages"
                @click="changeSalesPage(salesPage.page + 1)"
              >
                Next
              </button>
            </div>
            <p v-else class="empty muted">No recent market sales have been synced yet.</p>
          </article>

          <article class="panel market-summary-layout__sidebar">
            <div class="panel-head">
              <div>
                <h2>Top Movers</h2>
                <p class="muted">Click an item to inspect its history.</p>
              </div>
              <div class="segmented-control" role="group" aria-label="Sort top movers">
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': topItemsSort === 'quantity' }"
                  :disabled="refreshing"
                  @click="setTopItemsSort('quantity')"
                >
                  Quantity
                </button>
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': topItemsSort === 'value' }"
                  :disabled="refreshing"
                  @click="setTopItemsSort('value')"
                >
                  Value
                </button>
              </div>
            </div>
            <div v-if="summary?.topItems.length" class="movers">
              <article
                v-for="item in summary.topItems"
                :key="`${item.itemId ?? 'name'}-${item.itemName}`"
                class="mover"
                :class="{ 'mover--favorited': isItemFavorited(item) }"
              >
                <button
                  type="button"
                  class="mover__body"
                  @mouseenter="
                    showMarketItemTooltip($event, item.itemId, item.itemName, item.itemIconId)
                  "
                  @mousemove="updateMarketItemTooltipPosition($event)"
                  @mouseleave="hideMarketItemTooltip"
                  @click="selectTopItem(item)"
                >
                  <div class="mover__main">
                    <span v-if="hasValidIconId(item.itemIconId)" class="item-icon">
                      <img
                        :src="getLootIconSrc(item.itemIconId!)"
                        :alt="item.itemName"
                        loading="lazy"
                      />
                    </span>
                    <div>
                      <strong>{{ item.itemName }}</strong>
                      <small class="muted"
                        >{{ item.salesCount }} sales · {{ item.unitsSold }} units</small
                      >
                    </div>
                  </div>
                  <div class="mover__meta">
                    <strong class="mover__meta-primary">
                      <CoinDisplay variant="platinum" :amount-in-copper="item.totalRevenue" />
                    </strong>
                    <span class="mover__meta-secondary muted">
                      <span class="mover__meta-label">Avg Price</span>
                      <span class="mover__meta-value">
                        <CoinDisplay variant="platinum" :amount-in-copper="item.averagePrice" />
                      </span>
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  class="favorite-toggle favorite-toggle--mover"
                  :class="{ 'favorite-toggle--active': isItemFavorited(item) }"
                  :disabled="isItemFavoritePending(item)"
                  :aria-pressed="isItemFavorited(item)"
                  :aria-label="getItemFavoriteLabel(item)"
                  :title="getItemFavoriteLabel(item)"
                  @click.stop="toggleMarketItemFavorite(item)"
                >
                  <span class="favorite-toggle__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path
                        d="M1.5 12s4.5-7.5 10.5-7.5S22.5 12 22.5 12s-4.5 7.5-10.5 7.5S1.5 12 1.5 12Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3.25"
                        :fill="isItemFavorited(item) ? 'currentColor' : 'none'"
                        stroke="currentColor"
                        stroke-width="1.8"
                      />
                    </svg>
                  </span>
                </button>
              </article>
            </div>
            <p v-else class="empty muted">Top movers will appear once sales have been synced.</p>
          </article>
        </section>
      </template>
    </section>

    <section
      v-show="activeTab === 'listings'"
      id="market-panel-listings"
      role="tabpanel"
      aria-labelledby="market-tab-listings"
      class="market-tab-panel"
    >
      <MarketListingsTab
        :active="activeTab === 'listings'"
        @open-item="openItemModal"
        @open-character="openFavoriteCharacter"
        @sync-status-change="handleListingsSyncStatusChange"
      />
    </section>

    <section
      v-show="activeTab === 'traders'"
      id="market-panel-traders"
      role="tabpanel"
      aria-labelledby="market-tab-traders"
      class="market-tab-panel"
    >
      <MarketTradersTab
        :saved-traders="favoriteTraders"
        :trader-summary="traderSummary"
        :favorites-loading="favoritesLoading"
        :trader-pending-keys="favoriteTraderPendingKeys"
        @reload-favorites="reloadFavorites"
        @add-trader="addMarketTrader"
        @remove-trader="removeMarketTrader"
        @open-item="openItemModal"
        @open-character="openFavoriteCharacter"
      />
    </section>

    <section
      v-show="activeTab === 'favorites'"
      id="market-panel-favorites"
      role="tabpanel"
      aria-labelledby="market-tab-favorites"
      class="market-tab-panel"
    >
      <MarketFavoritesTab
        :favorite-items="favoriteItems"
        :favorite-characters="favoriteCharacters"
        :favorites-loading="favoritesLoading"
        :item-pending-keys="favoriteItemPendingKeys"
        :character-pending-keys="favoriteCharacterPendingKeys"
        @reload-favorites="reloadFavorites"
        @add-item-favorite="addMarketItemFavorite"
        @remove-item-favorite="removeMarketItemFavorite"
        @add-character-favorite="addMarketCharacterFavorite"
        @remove-character-favorite="removeMarketCharacterFavorite"
        @open-item="openItemModal"
        @open-character="openFavoriteCharacter"
      />
    </section>

    <Teleport to="body">
      <div
        v-if="isItemModalOpen && activeModalItem"
        class="market-modal-backdrop"
        @click.self="closeItemModal"
      >
        <div
          class="market-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="marketModalTitleId"
        >
          <header class="market-modal__header">
            <div class="market-modal__header-copy">
              <p class="eyebrow">Sale Trend</p>
              <h2 :id="marketModalTitleId">{{ history?.itemName ?? activeModalItem.itemName }}</h2>
              <p class="muted">{{ itemModalTabSummary }}</p>
            </div>
            <div class="market-modal__actions">
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="activeItemModalLoading"
                @click="reloadSelectedItem"
              >
                {{ activeItemModalLoading ? 'Loading...' : 'Reload Tab' }}
              </button>
              <button
                type="button"
                class="market-modal__close"
                aria-label="Close item trends"
                @click="closeItemModal"
              >
                ×
              </button>
            </div>
          </header>

          <div class="market-modal__toolbar">
            <div class="segmented-control" role="tablist" aria-label="Item detail tabs">
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeItemModalTab === 'trends' }"
                :disabled="historyLoading"
                @click="setItemModalTab('trends')"
              >
                Trends
              </button>
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeItemModalTab === 'activity' }"
                :disabled="itemActivityLoading && !itemActivity"
                @click="setItemModalTab('activity')"
              >
                Activity
              </button>
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeItemModalTab === 'listings' }"
                :disabled="itemListingsLoading && !itemListingsPage"
                @click="setItemModalTab('listings')"
              >
                Listings
              </button>
            </div>
            <span
              v-if="activeItemModalTab === 'activity' && itemActivity"
              class="muted market-modal__toolbar-meta"
            >
              Buyers {{ formatNumber(itemActivity.buyers.total) }} · Sellers
              {{ formatNumber(itemActivity.sellers.total) }}
            </span>
            <span
              v-else-if="activeItemModalTab === 'listings' && activeItemListingsPage"
              class="muted market-modal__toolbar-meta"
            >
              Page {{ activeItemListingsPage.page }} of {{ activeItemListingsPage.totalPages }} ·
              {{ formatNumber(activeItemListingsPage.total) }} listings
            </span>
          </div>

          <div
            v-if="activeItemModalTab === 'trends' && historyLoading"
            class="empty muted market-modal__loading"
          >
            Loading item history...
          </div>
          <template v-else-if="activeItemModalTab === 'trends' && history">
            <section class="stats stats--focus">
              <article class="card card--spotlight">
                <span class="label">Avg Price</span>
                <strong>
                  <CoinDisplay
                    variant="platinum"
                    :amount-in-copper="history.stats.averagePrice"
                  />
                </strong>
                <small>per unit</small>
              </article>
              <article class="card">
                <span class="label">Price Range</span>
                <strong>
                  <CoinDisplay variant="platinum" :amount-in-copper="history.stats.minPrice" />
                </strong>
                <small
                  >to
                  <CoinDisplay variant="platinum" :amount-in-copper="history.stats.maxPrice"
                /></small>
              </article>
              <article class="card">
                <span class="label">Units Sold</span>
                <strong>{{ formatNumber(history.stats.totalUnitsSold) }}</strong>
                <small>{{ history.stats.totalSales }} sales</small>
              </article>
              <article class="card">
                <span class="label">Revenue</span>
                <strong>
                  <CoinDisplay
                    variant="platinum"
                    :amount-in-copper="history.stats.totalRevenue"
                  />
                </strong>
                <small>{{ formatCompactDate(history.stats.lastSoldAt) }}</small>
              </article>
            </section>

            <div class="layout">
              <article class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Price History</h2>
                    <p class="muted">Each point represents a sale price per unit.</p>
                  </div>
                </div>
                <div class="chart-box">
                  <Line
                    v-if="itemPriceChartData"
                    :data="itemPriceChartData"
                    :options="itemPriceChartOptions"
                  />
                  <p v-else class="empty muted">No price points available.</p>
                </div>
              </article>

              <article class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Daily Trend</h2>
                    <p class="muted">Average price and units sold by day.</p>
                  </div>
                </div>
                <div class="chart-box">
                  <Line
                    v-if="itemDailyChartData"
                    :data="itemDailyChartData"
                    :options="itemDailyChartOptions"
                  />
                  <p v-else class="empty muted">No daily trend available.</p>
                </div>
              </article>
            </div>
          </template>
          <div v-else-if="activeItemModalTab === 'trends'" class="empty empty--stacked muted market-modal__loading">
            <p>No synced bazaar sale history was found for this item yet.</p>
            <button
              type="button"
              class="btn btn--outline btn--small favorite-action"
              :class="{ 'favorite-action--active': isActiveItemFavorited }"
              :disabled="isActiveItemFavorited || isActiveItemFavoritePending || !activeModalItem"
              @click="watchActiveItem"
            >
              {{ activeItemFavoriteButtonLabel }}
            </button>
          </div>
          <div
            v-else-if="activeItemModalTab === 'listings' && itemListingsLoading && !itemListingsPage"
            class="empty muted market-modal__loading"
          >
            Loading item listings...
          </div>
          <template v-else-if="activeItemModalTab === 'listings' && activeItemListingsPage?.listings.length">
            <div class="table-wrap table-wrap--modal">
              <table class="listings-table">
                <thead>
                  <tr>
                    <th :aria-sort="getItemListingsColumnAriaSort('itemName')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'itemName' }"
                        @click="toggleItemListingsSort('itemName')"
                      >
                        <span>Item</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('itemName')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('price')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'price' }"
                        @click="toggleItemListingsSort('price')"
                      >
                        <span>Price</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('price')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('priceRank')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'priceRank' }"
                        @click="toggleItemListingsSort('priceRank')"
                      >
                        <span>Price Rank</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('priceRank')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('analysis')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'analysis' }"
                        @click="toggleItemListingsSort('analysis')"
                      >
                        <span>Analysis</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('analysis')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('charges')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'charges' }"
                        @click="toggleItemListingsSort('charges')"
                      >
                        <span>Qty/Charges</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('charges')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('sellerName')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'sellerName' }"
                        @click="toggleItemListingsSort('sellerName')"
                      >
                        <span>Seller</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('sellerName')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('listedAt')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'listedAt' }"
                        @click="toggleItemListingsSort('listedAt')"
                      >
                        <span>Listed</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('listedAt')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getItemListingsColumnAriaSort('slotId')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': itemListingsSortBy === 'slotId' }"
                        @click="toggleItemListingsSort('slotId')"
                      >
                        <span>Slot</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getItemListingsSortIndicator('slotId')
                        }}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="listing in activeItemListingsPage.listings"
                    :key="buildCharacterListingKey(listing)"
                  >
                    <td>
                      <button
                        type="button"
                        class="table-item table-item--static"
                        @mouseenter="showMarketItemTooltip($event, listing.itemId, listing.itemName, listing.itemIconId)"
                        @mousemove="updateMarketItemTooltipPosition($event)"
                        @mouseleave="hideMarketItemTooltip"
                        @click="openCharacterListingItem(listing)"
                      >
                        <span v-if="hasValidIconId(listing.itemIconId)" class="item-icon">
                          <img
                            :src="getLootIconSrc(listing.itemIconId!)"
                            :alt="listing.itemName"
                            loading="lazy"
                          />
                        </span>
                        <span class="table-item__text">
                          <strong>{{ listing.itemName }}</strong>
                        </span>
                      </button>
                    </td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="listing.price" /></td>
                    <td class="price-rank-cell">
                      <span
                        class="price-rank-badge"
                        :class="{ 'price-rank-badge--leader': listing.priceRank === 1 }"
                        :title="getPriceRankTitle(listing)"
                        :aria-label="getPriceRankTitle(listing)"
                      >
                        <span
                          v-if="listing.priceRank === 1"
                          class="price-rank-badge__leader"
                        >
                          <span class="price-rank-badge__leader-medallion" aria-hidden="true">
                            <span class="price-rank-badge__leader-number">1</span>
                          </span>
                        </span>
                        <span v-else class="price-rank-badge__value">{{ listing.priceRank }}</span>
                      </span>
                    </td>
                    <td>
                      <div
                        class="listing-analysis"
                        :class="
                          getListingAnalysisClass(listing.price, listing.itemAveragePrice)
                        "
                        :title="
                          getListingAnalysisTitle(listing.price, listing.itemAveragePrice)
                        "
                      >
                        <span class="listing-analysis__arrow" aria-hidden="true">
                          {{ getListingAnalysisArrow(listing.price, listing.itemAveragePrice) }}
                        </span>
                        <span
                          v-if="
                            getListingAnalysisPercent(listing.price, listing.itemAveragePrice)
                          "
                          class="listing-analysis__percent"
                        >
                          {{ getListingAnalysisPercent(listing.price, listing.itemAveragePrice) }}
                        </span>
                      </div>
                    </td>
                    <td>{{ formatOptionalNumber(listing.charges) }}</td>
                    <td>
                      <button
                        type="button"
                        class="character-history-link"
                        @click="openCharacterHistoryModal(listing.sellerCharacterName, 'listings')"
                      >
                        {{ listing.sellerCharacterName }}
                      </button>
                    </td>
                    <td>{{ formatDateTime(listing.listedAt) }}</td>
                    <td>{{ formatSlot(listing) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="activeItemListingsPage.totalPages > 1" class="pagination">
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="itemListingsLoading || activeItemListingsPage.page <= 1"
                @click="changeItemListingsPage(activeItemListingsPage.page - 1)"
              >
                Previous
              </button>
              <span class="pagination__meta muted">
                Page {{ activeItemListingsPage.page }} of {{ activeItemListingsPage.totalPages }}
              </span>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="
                  itemListingsLoading ||
                  activeItemListingsPage.page >= activeItemListingsPage.totalPages
                "
                @click="changeItemListingsPage(activeItemListingsPage.page + 1)"
              >
                Next
              </button>
            </div>
          </template>
          <p v-else-if="activeItemModalTab === 'listings'" class="empty muted market-modal__loading">
            No active bazaar listings are currently cached for this item.
          </p>
          <div
            v-else-if="activeItemModalTab === 'activity' && itemActivityLoading && !itemActivity"
            class="empty muted market-modal__loading"
          >
            Loading item activity...
          </div>
          <template v-else-if="activeItemModalTab === 'activity' && itemActivity">
            <section class="activity-grid">
              <article class="panel activity-panel">
                <div class="panel-head">
                  <div>
                    <h2>Buyers</h2>
                    <p class="muted">Buyer-side bazaar events for this item.</p>
                  </div>
                  <span class="pill pill--muted">
                    {{ formatNumber(itemActivity.buyers.total) }}
                  </span>
                </div>
                <div v-if="itemActivity.buyers.entries.length" class="table-wrap table-wrap--modal">
                  <table class="market-table">
                    <thead>
                      <tr>
                        <th>Buyer</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Total</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="entry in itemActivity.buyers.entries" :key="entry.id">
                        <td>
                          <button
                            type="button"
                            class="character-history-link"
                            @click="openCharacterHistoryModal(entry.buyerCharacterName, 'buy')"
                          >
                            {{ entry.buyerCharacterName }}
                          </button>
                        </td>
                        <td><CoinDisplay variant="platinum" :amount-in-copper="entry.price" /></td>
                        <td>{{ formatNumber(entry.quantity) }}</td>
                        <td>
                          <CoinDisplay variant="platinum" :amount-in-copper="entry.totalCost" />
                        </td>
                        <td>{{ formatDateTime(entry.occurredAt) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="empty muted activity-panel__empty">No buyer events found.</p>
                <div v-if="itemActivity.buyers.totalPages > 1" class="pagination">
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    :disabled="itemActivityLoading || itemActivity.buyers.page <= 1"
                    @click="changeItemActivityPage('buyers', itemActivity.buyers.page - 1)"
                  >
                    Previous
                  </button>
                  <span class="pagination__meta muted">
                    Page {{ itemActivity.buyers.page }} of {{ itemActivity.buyers.totalPages }}
                  </span>
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    :disabled="
                      itemActivityLoading ||
                      itemActivity.buyers.page >= itemActivity.buyers.totalPages
                    "
                    @click="changeItemActivityPage('buyers', itemActivity.buyers.page + 1)"
                  >
                    Next
                  </button>
                </div>
              </article>

              <article class="panel activity-panel">
                <div class="panel-head">
                  <div>
                    <h2>Sellers</h2>
                    <p class="muted">Seller-side bazaar events for this item.</p>
                  </div>
                  <span class="pill pill--muted">
                    {{ formatNumber(itemActivity.sellers.total) }}
                  </span>
                </div>
                <div
                  v-if="itemActivity.sellers.entries.length"
                  class="table-wrap table-wrap--modal"
                >
                  <table class="market-table">
                    <thead>
                      <tr>
                        <th>Seller</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Total</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="entry in itemActivity.sellers.entries" :key="entry.id">
                        <td>
                          <button
                            type="button"
                            class="character-history-link"
                            @click="openCharacterHistoryModal(entry.sellerCharacterName, 'sell')"
                          >
                            {{ entry.sellerCharacterName }}
                          </button>
                        </td>
                        <td><CoinDisplay variant="platinum" :amount-in-copper="entry.price" /></td>
                        <td>{{ formatNumber(entry.quantity) }}</td>
                        <td>
                          <CoinDisplay variant="platinum" :amount-in-copper="entry.totalCost" />
                        </td>
                        <td>{{ formatDateTime(entry.occurredAt) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="empty muted activity-panel__empty">No seller events found.</p>
                <div v-if="itemActivity.sellers.totalPages > 1" class="pagination">
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    :disabled="itemActivityLoading || itemActivity.sellers.page <= 1"
                    @click="changeItemActivityPage('sellers', itemActivity.sellers.page - 1)"
                  >
                    Previous
                  </button>
                  <span class="pagination__meta muted">
                    Page {{ itemActivity.sellers.page }} of {{ itemActivity.sellers.totalPages }}
                  </span>
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    :disabled="
                      itemActivityLoading ||
                      itemActivity.sellers.page >= itemActivity.sellers.totalPages
                    "
                    @click="changeItemActivityPage('sellers', itemActivity.sellers.page + 1)"
                  >
                    Next
                  </button>
                </div>
              </article>
            </section>
          </template>
          <p v-else-if="activeItemModalTab === 'activity'" class="empty muted market-modal__loading">
            No synced buyer or seller activity was found for this item yet.
          </p>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="isCharacterModalOpen && activeCharacterName"
        class="market-modal-backdrop"
        @click.self="closeCharacterModal"
      >
        <div
          class="market-modal market-modal--character"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="characterHistoryModalTitleId"
        >
          <header class="market-modal__header">
            <div class="market-modal__header-copy">
              <p class="eyebrow">Bazaar Activity</p>
              <h2 :id="characterHistoryModalTitleId">{{ activeCharacterName }}</h2>
              <p class="muted">
                Paginated buyer and seller transaction history for this character.
              </p>
            </div>
            <div class="market-modal__actions">
              <button
                type="button"
                class="btn btn--outline btn--small favorite-action"
                :class="{ 'favorite-action--active': isActiveCharacterFavorited }"
                :disabled="isActiveCharacterFavoritePending"
                :aria-pressed="isActiveCharacterFavorited"
                @click="toggleActiveCharacterFavorite"
              >
                <span class="favorite-toggle__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path
                      d="M1.5 12s4.5-7.5 10.5-7.5S22.5 12 22.5 12s-4.5 7.5-10.5 7.5S1.5 12 1.5 12Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3.25"
                      :fill="isActiveCharacterFavorited ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                  </svg>
                </span>
                {{ activeCharacterFavoriteButtonLabel }}
              </button>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="activeCharacterModalLoading"
                @click="reloadActiveCharacterHistory"
              >
                {{ activeCharacterModalLoading ? 'Loading...' : 'Reload Tab' }}
              </button>
              <button
                type="button"
                class="market-modal__close"
                aria-label="Close character history"
                @click="closeCharacterModal"
              >
                ×
              </button>
            </div>
          </header>

          <div class="market-modal__toolbar">
            <div
              class="segmented-control"
              role="tablist"
              aria-label="Character bazaar activity tab"
            >
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeCharacterTab === 'listings' }"
                :disabled="characterListingsLoading"
                @click="setCharacterHistoryTab('listings')"
              >
                Listings
              </button>
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeCharacterTab === 'sell' }"
                :disabled="characterHistoryLoading.sell"
                @click="setCharacterHistoryTab('sell')"
              >
                Sell
              </button>
              <button
                type="button"
                class="segmented-control__button"
                :class="{ 'segmented-control__button--active': activeCharacterTab === 'buy' }"
                :disabled="characterHistoryLoading.buy"
                @click="setCharacterHistoryTab('buy')"
              >
                Buy
              </button>
            </div>
            <span
              v-if="activeCharacterModalPageMeta"
              class="muted market-modal__toolbar-meta"
            >
              Page {{ activeCharacterModalPageMeta.page }} of
              {{ activeCharacterModalPageMeta.totalPages }} ·
              {{ formatNumber(activeCharacterModalPageMeta.total) }}
              {{ activeCharacterTab === 'listings' ? 'listings' : 'transactions' }}
            </span>
          </div>

          <p class="muted market-modal__summary">
            {{
              activeCharacterTab === 'listings'
                ? 'Active bazaar listings currently cached for this trader.'
                : activeCharacterTab === 'sell'
                  ? 'Seller-side bazaar transactions recorded for this character.'
                  : 'Buyer-side bazaar transactions recorded for this character.'
            }}
          </p>

          <div v-if="activeCharacterModalLoading" class="empty muted market-modal__loading">
            {{ activeCharacterTab === 'listings' ? 'Loading character listings...' : 'Loading character history...' }}
          </div>
          <template v-else-if="activeCharacterTab === 'listings' && activeCharacterListingsPage?.listings.length">
            <div class="table-wrap table-wrap--modal">
              <table class="listings-table">
                <thead>
                  <tr>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('itemName')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'itemName' }"
                        @click="toggleCharacterListingsSort('itemName')"
                      >
                        <span>Item</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('itemName')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('price')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'price' }"
                        @click="toggleCharacterListingsSort('price')"
                      >
                        <span>Price</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('price')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('priceRank')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'priceRank' }"
                        @click="toggleCharacterListingsSort('priceRank')"
                      >
                        <span>Price Rank</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('priceRank')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('analysis')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'analysis' }"
                        @click="toggleCharacterListingsSort('analysis')"
                      >
                        <span>Analysis</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('analysis')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('charges')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'charges' }"
                        @click="toggleCharacterListingsSort('charges')"
                      >
                        <span>Qty/Charges</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('charges')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('sellerName')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'sellerName' }"
                        @click="toggleCharacterListingsSort('sellerName')"
                      >
                        <span>Seller</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('sellerName')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('listedAt')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'listedAt' }"
                        @click="toggleCharacterListingsSort('listedAt')"
                      >
                        <span>Listed</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('listedAt')
                        }}</span>
                      </button>
                    </th>
                    <th :aria-sort="getCharacterListingsColumnAriaSort('slotId')">
                      <button
                        type="button"
                        class="table-sort"
                        :class="{ 'table-sort--active': characterListingsSortBy === 'slotId' }"
                        @click="toggleCharacterListingsSort('slotId')"
                      >
                        <span>Slot</span>
                        <span class="table-sort__icon" aria-hidden="true">{{
                          getCharacterListingsSortIndicator('slotId')
                        }}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="listing in activeCharacterListingsPage.listings"
                    :key="buildCharacterListingKey(listing)"
                  >
                    <td>
                      <button
                        type="button"
                        class="table-item table-item-button table-item--static"
                        @mouseenter="showMarketItemTooltip($event, listing.itemId, listing.itemName, listing.itemIconId)"
                        @mousemove="updateMarketItemTooltipPosition($event)"
                        @mouseleave="hideMarketItemTooltip"
                        @click="openCharacterListingItem(listing)"
                      >
                        <span v-if="hasValidIconId(listing.itemIconId)" class="item-icon">
                          <img
                            :src="getLootIconSrc(listing.itemIconId!)"
                            :alt="listing.itemName"
                            loading="lazy"
                          />
                        </span>
                        <span class="table-item__text">
                          <strong>{{ listing.itemName }}</strong>
                        </span>
                      </button>
                    </td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="listing.price" /></td>
                    <td class="price-rank-cell">
                      <span
                        class="price-rank-badge"
                        :class="{ 'price-rank-badge--leader': listing.priceRank === 1 }"
                        :title="getPriceRankTitle(listing)"
                        :aria-label="getPriceRankTitle(listing)"
                      >
                        <span
                          v-if="listing.priceRank === 1"
                          class="price-rank-badge__leader"
                        >
                          <span class="price-rank-badge__leader-medallion" aria-hidden="true">
                            <span class="price-rank-badge__leader-number">1</span>
                          </span>
                        </span>
                        <span v-else class="price-rank-badge__value">{{ listing.priceRank }}</span>
                      </span>
                    </td>
                    <td>
                      <div
                        class="listing-analysis"
                        :class="
                          getListingAnalysisClass(listing.price, listing.itemAveragePrice)
                        "
                        :title="
                          getListingAnalysisTitle(listing.price, listing.itemAveragePrice)
                        "
                      >
                        <span class="listing-analysis__arrow" aria-hidden="true">
                          {{ getListingAnalysisArrow(listing.price, listing.itemAveragePrice) }}
                        </span>
                        <span
                          v-if="
                            getListingAnalysisPercent(listing.price, listing.itemAveragePrice)
                          "
                          class="listing-analysis__percent"
                        >
                          {{ getListingAnalysisPercent(listing.price, listing.itemAveragePrice) }}
                        </span>
                      </div>
                    </td>
                    <td>{{ formatOptionalNumber(listing.charges) }}</td>
                    <td>
                      <button
                        type="button"
                        class="character-history-link"
                        @click="openCharacterHistoryModal(listing.sellerCharacterName, 'listings')"
                      >
                        {{ listing.sellerCharacterName }}
                      </button>
                    </td>
                    <td>{{ formatDateTime(listing.listedAt) }}</td>
                    <td>{{ formatSlot(listing) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="activeCharacterListingsPage.totalPages > 1"
              class="pagination"
            >
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="characterListingsLoading || activeCharacterListingsPage.page <= 1"
                @click="changeCharacterHistoryPage(activeCharacterListingsPage.page - 1)"
              >
                Previous
              </button>
              <span class="pagination__meta muted">
                Page {{ activeCharacterListingsPage.page }} of
                {{ activeCharacterListingsPage.totalPages }}
              </span>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="
                  characterListingsLoading ||
                  activeCharacterListingsPage.page >= activeCharacterListingsPage.totalPages
                "
                @click="changeCharacterHistoryPage(activeCharacterListingsPage.page + 1)"
              >
                Next
              </button>
            </div>
          </template>
          <template v-else-if="activeCharacterHistoryEntries.length">
            <div class="table-wrap table-wrap--modal">
              <table class="market-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>{{ activeCharacterHistoryCounterpartyLabel }}</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in activeCharacterHistoryEntries" :key="entry.id">
                    <td>
                      <button
                        type="button"
                        class="table-item table-item-button table-item--static"
                        @mouseenter="showMarketSaleTooltip($event, entry)"
                        @mousemove="updateMarketItemTooltipPosition($event)"
                        @mouseleave="hideMarketItemTooltip"
                        @click="openCharacterHistoryItem(entry)"
                      >
                        <span v-if="hasValidIconId(entry.itemIconId)" class="item-icon">
                          <img
                            :src="getLootIconSrc(entry.itemIconId!)"
                            :alt="entry.itemName"
                            loading="lazy"
                          />
                        </span>
                        <span>{{ entry.itemName }}</span>
                      </button>
                    </td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="entry.price" /></td>
                    <td>{{ formatNumber(entry.quantity) }}</td>
                    <td><CoinDisplay variant="platinum" :amount-in-copper="entry.totalCost" /></td>
                    <td>
                      <button
                        v-if="canOpenCharacterHistory(getCharacterHistoryCounterpartyName(entry))"
                        type="button"
                        class="character-history-link character-history-link--inline"
                        @click="openCharacterHistoryCounterparty(entry)"
                      >
                        {{ getCharacterHistoryCounterpartyName(entry) }}
                      </button>
                      <span v-else class="muted">
                        {{ getCharacterHistoryCounterpartyName(entry) ?? '—' }}
                      </span>
                    </td>
                    <td>{{ formatDateTime(entry.occurredAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="activeCharacterHistoryPage && activeCharacterHistoryPage.totalPages > 1"
              class="pagination"
            >
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="activeCharacterHistoryLoading || activeCharacterHistoryPage.page <= 1"
                @click="changeCharacterHistoryPage(activeCharacterHistoryPage.page - 1)"
              >
                Previous
              </button>
              <span class="pagination__meta muted">
                Page {{ activeCharacterHistoryPage.page }} of
                {{ activeCharacterHistoryPage.totalPages }}
              </span>
              <button
                type="button"
                class="btn btn--outline btn--small"
                :disabled="
                  activeCharacterHistoryLoading ||
                  activeCharacterHistoryPage.page >= activeCharacterHistoryPage.totalPages
                "
                @click="changeCharacterHistoryPage(activeCharacterHistoryPage.page + 1)"
              >
                Next
              </button>
            </div>
          </template>
          <p v-else class="empty muted market-modal__loading">
            {{
              activeCharacterTab === 'listings'
                ? 'No active bazaar listings are currently cached for this character.'
                : activeCharacterTab === 'sell'
                ? 'No bazaar sell history was found for this character in the selected range.'
                : 'No bazaar buy history was found for this character in the selected range.'
            }}
          </p>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { isAxiosError } from 'axios';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';

import CoinDisplay from '../components/CoinDisplay.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import MarketFavoritesTab from '../components/market/MarketFavoritesTab.vue';
import MarketListingsTab from '../components/market/MarketListingsTab.vue';
import MarketTradersTab from '../components/market/MarketTradersTab.vue';
import { useToastBus } from '../components/ToastBus';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import {
  api,
  type MarketCharacterHistoryPage,
  type MarketCharacterHistoryType,
  type MarketFavoriteCharacter,
  type MarketFavoriteItem,
  type MarketFavoriteTrader,
  type MarketItemActivity,
  type MarketItemHistory,
  type MarketListing,
  type MarketListingsPage,
  type MarketListingsSortField,
  type MarketItemSearchResult,
  type MarketRecentSale,
  type MarketRecentSalesPage,
  type MarketSummary,
  type MarketTraderSummary,
  type MarketTopItemsSort,
  type MarketTopItem
} from '../services/api';
import { useItemTooltipStore } from '../stores/itemTooltip';
import { itemSlotSummaryLabel } from '../utils/inventory';
import { getLootIconSrc, hasValidIconId } from '../utils/itemIcons';
import { ensureChartJsRegistered } from '../utils/registerCharts';

ensureChartJsRegistered();

type MarketSelectableItem = Pick<MarketItemSearchResult, 'itemId' | 'itemName' | 'itemIconId'>;
type MarketItemModalTab = 'trends' | 'activity' | 'listings';
type MarketCharacterModalTab = 'listings' | MarketCharacterHistoryType;

function isNotFoundError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

const { addToast } = useToastBus();
const tooltipStore = useItemTooltipStore();
const loading = ref(true);
const showLoading = useMinimumLoading(loading, 900);
const refreshing = ref(false);
const searchLoading = ref(false);
const historyLoading = ref(false);
const itemActivityLoading = ref(false);
const itemListingsLoading = ref(false);
const salesLoading = ref(false);
const refreshCooldownRemaining = ref(0);
const favoritesLoading = ref(false);

const summary = ref<MarketSummary | null>(null);
const history = ref<MarketItemHistory | null>(null);
const itemActivity = ref<MarketItemActivity | null>(null);
const itemListingsPage = ref<MarketListingsPage | null>(null);
const salesPage = ref<MarketRecentSalesPage | null>(null);
const favoriteItems = ref<MarketFavoriteItem[]>([]);
const favoriteCharacters = ref<MarketFavoriteCharacter[]>([]);
const favoriteTraders = ref<MarketFavoriteTrader[]>([]);
const traderSummary = ref<MarketTraderSummary>({
  totalTraders: 0,
  activeTraders: 0,
  tradersNeedingAttention: 0,
  totalListings: 0,
  leadingListings: 0,
  matchingListings: 0,
  undercutListings: 0,
  sourceAvailable: true,
  message: null
});
const listingsLastRetrievedAt = ref<string | null>(null);
const favoriteItemPendingKeys = ref<string[]>([]);
const favoriteCharacterPendingKeys = ref<string[]>([]);
const favoriteTraderPendingKeys = ref<string[]>([]);
const activeModalItem = ref<MarketSelectableItem | null>(null);
const activeItemModalTab = ref<MarketItemModalTab>('trends');
const isItemModalOpen = ref(false);
const activeCharacterName = ref<string | null>(null);
const activeCharacterTab = ref<MarketCharacterModalTab>('listings');
const isCharacterModalOpen = ref(false);
const activeTab = ref<'market' | 'listings' | 'traders' | 'favorites'>('market');
const selectedRangeDays = ref<number | null>(null);
const topItemsSort = ref<MarketTopItemsSort>('quantity');
const salesPageNumber = ref(1);
const salesPageSize = 10;
const itemActivityPageSize = 8;
const itemListingsPageSize = 10;
const itemActivityBuyersPageNumber = ref(1);
const itemActivitySellersPageNumber = ref(1);
const itemListingsSortBy = ref<MarketListingsSortField>('listedAt');
const itemListingsSortOrder = ref<'asc' | 'desc'>('desc');
const characterHistoryPageSize = 10;
const searchQuery = ref('');
const searchResults = ref<MarketItemSearchResult[]>([]);
const showSearchResults = ref(false);
const searchPanelRef = ref<HTMLElement | null>(null);
const characterHistoryPages = reactive<
  Record<MarketCharacterHistoryType, MarketCharacterHistoryPage | null>
>({
  sell: null,
  buy: null
});
const characterHistoryLoading = reactive<Record<MarketCharacterHistoryType, boolean>>({
  sell: false,
  buy: false
});
const characterHistoryRequestTokens = reactive<Record<MarketCharacterHistoryType, number>>({
  sell: 0,
  buy: 0
});
const characterListingsPage = ref<MarketListingsPage | null>(null);
const characterListingsLoading = ref(false);
const characterListingsRequestToken = ref(0);
const characterListingsPageSize = 10;
const characterListingsSortBy = ref<MarketListingsSortField>('listedAt');
const characterListingsSortOrder = ref<'asc' | 'desc'>('desc');

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let refreshCooldownInterval: ReturnType<typeof setInterval> | null = null;
let activeSearchToken = 0;
let activeItemActivityRequestToken = 0;
let activeItemListingsRequestToken = 0;
const marketModalTitleId = 'market-item-trend-title';
const characterHistoryModalTitleId = 'market-character-history-title';
const UNKNOWN_MARKET_CHARACTER_LABEL = 'Unknown Trader';
const REFRESH_COOLDOWN_SECONDS = 60;

const displaySales = computed<MarketRecentSale[]>(() => salesPage.value?.sales ?? []);
const tickerSales = computed(() => displaySales.value.slice(0, 10));

function formatTickerTime(value: string | null): string {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
const activeCharacterHistoryPage = computed(() =>
  activeCharacterTab.value === 'listings' ? null : characterHistoryPages[activeCharacterTab.value]
);
const activeCharacterHistoryEntries = computed<MarketRecentSale[]>(
  () => activeCharacterHistoryPage.value?.entries ?? []
);
const activeCharacterHistoryLoading = computed(() =>
  activeCharacterTab.value === 'listings' ? false : characterHistoryLoading[activeCharacterTab.value]
);
const activeCharacterModalLoading = computed(() =>
  activeCharacterTab.value === 'listings'
    ? characterListingsLoading.value
    : characterHistoryLoading[activeCharacterTab.value]
);
const activeCharacterHistoryCounterpartyLabel = computed(() =>
  activeCharacterTab.value === 'sell' ? 'Buyer' : 'Seller'
);
const activeCharacterListingsPage = computed(() => characterListingsPage.value);
const activeCharacterModalPageMeta = computed(() => {
  if (activeCharacterTab.value === 'listings') {
    return activeCharacterListingsPage.value
      ? {
          page: activeCharacterListingsPage.value.page,
          totalPages: activeCharacterListingsPage.value.totalPages,
          total: activeCharacterListingsPage.value.total
        }
      : null;
  }

  return activeCharacterHistoryPage.value
    ? {
        page: activeCharacterHistoryPage.value.page,
        totalPages: activeCharacterHistoryPage.value.totalPages,
        total: activeCharacterHistoryPage.value.total
      }
    : null;
});
const activeItemActivityBuyersPage = computed(() => itemActivity.value?.buyers ?? null);
const activeItemActivitySellersPage = computed(() => itemActivity.value?.sellers ?? null);
const activeItemListingsPage = computed(() => itemListingsPage.value);
const activeItemModalLoading = computed(() => {
  if (activeItemModalTab.value === 'trends') {
    return historyLoading.value;
  }

  if (activeItemModalTab.value === 'activity') {
    return itemActivityLoading.value;
  }

  return itemListingsLoading.value;
});
const favoriteItemKeys = computed(
  () => new Set(favoriteItems.value.map((item) => getFavoriteItemKey(item)))
);
const favoriteCharacterKeys = computed(
  () =>
    new Set(
      favoriteCharacters.value.map((character) => getFavoriteCharacterKey(character.characterName))
    )
);
const favoriteTraderKeys = computed(
  () => new Set(favoriteTraders.value.map((trader) => getFavoriteTraderKey(trader.characterName)))
);
const favoriteItemPendingKeySet = computed(() => new Set(favoriteItemPendingKeys.value));
const favoriteCharacterPendingKeySet = computed(() => new Set(favoriteCharacterPendingKeys.value));
const favoriteTraderPendingKeySet = computed(() => new Set(favoriteTraderPendingKeys.value));
const isRefreshButtonDisabled = computed(
  () => refreshing.value || refreshCooldownRemaining.value > 0
);
const refreshCooldownLabel = computed(() => formatCountdown(refreshCooldownRemaining.value));
const refreshButtonLabel = computed(() => {
  if (refreshing.value) return 'Refreshing...';
  if (refreshCooldownRemaining.value > 0) return `Refresh in ${refreshCooldownLabel.value}`;
  return 'Refresh Market';
});
const isActiveCharacterFavorited = computed(() => isCharacterFavorited(activeCharacterName.value));
const isActiveCharacterFavoritePending = computed(() => {
  const characterName = activeCharacterName.value;
  return characterName
    ? favoriteCharacterPendingKeySet.value.has(getFavoriteCharacterKey(characterName))
    : false;
});
const activeCharacterFavoriteButtonLabel = computed(() => {
  if (isActiveCharacterFavoritePending.value) {
    return 'Working...';
  }

  return isActiveCharacterFavorited.value ? 'Watching' : 'Watch';
});
const isActiveItemFavorited = computed(() =>
  activeModalItem.value ? isItemFavorited(activeModalItem.value) : false
);
const isActiveItemFavoritePending = computed(() =>
  activeModalItem.value ? isItemFavoritePending(activeModalItem.value) : false
);
const activeItemFavoriteButtonLabel = computed(() => {
  if (!activeModalItem.value) {
    return 'Watch Item';
  }

  if (isActiveItemFavoritePending.value) {
    return 'Working...';
  }

  return isActiveItemFavorited.value ? 'Watching' : 'Watch Item';
});
const traderAttentionCount = computed(() => traderSummary.value.tradersNeedingAttention);
const traderAttentionMeta = computed(() => {
  if (traderAttentionCount.value > 0) {
    return `${formatNumber(traderAttentionCount.value)} need attention`;
  }

  if (traderSummary.value.activeTraders > 0) {
    return 'All active traders are competitive';
  }

  return 'No active trader listings';
});
const itemModalTabSummary = computed(() => {
  if (activeItemModalTab.value === 'listings') {
    const totalListings = activeItemListingsPage.value?.total ?? 0;
    const sellerCount = activeItemListingsPage.value?.summary.distinctSellers ?? 0;
    return `${formatNumber(totalListings)} active listings · ${formatNumber(sellerCount)} traders`;
  }

  if (activeItemModalTab.value === 'activity') {
    const buyersTotal = activeItemActivityBuyersPage.value?.total ?? 0;
    const sellersTotal = activeItemActivitySellersPage.value?.total ?? 0;
    return `${formatNumber(buyersTotal)} buyer events · ${formatNumber(sellersTotal)} seller events`;
  }

  return 'Price trend and volume history for the selected item.';
});

const selectedRangeLabel = computed(() =>
  selectedRangeDays.value == null ? 'All available data' : `Window ${selectedRangeDays.value} days`
);

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatOptionalNumber(value: number | null) {
  return value == null ? '—' : formatNumber(value);
}

function formatPlatinum(valueInCopper: number) {
  const platinum = valueInCopper / 1000;
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: platinum < 100 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(platinum)} pp`;
}

function formatCompactDate(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

function formatDateTime(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function formatSyncTime(value: string | null) {
  if (!value) return 'pending first retrieval';
  return formatDateTime(value);
}

function handleListingsSyncStatusChange(lastRetrievedAt: string | null) {
  listingsLastRetrievedAt.value = lastRetrievedAt;
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeItemKey(itemId: number | null | undefined, itemName: string) {
  const normalizedName = normalizeText(itemName).toLowerCase();
  return itemId != null ? `item:${itemId}` : `item-name:${normalizedName}`;
}

function getFavoriteItemKey(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  return normalizeItemKey(item.itemId, item.itemName);
}

function getFavoriteCharacterKey(characterName: string) {
  return `character:${normalizeText(characterName).toLowerCase()}`;
}

function getFavoriteTraderKey(characterName: string) {
  return `trader:${normalizeText(characterName).toLowerCase()}`;
}

function addPendingKey(
  target:
    | typeof favoriteItemPendingKeys
    | typeof favoriteCharacterPendingKeys
    | typeof favoriteTraderPendingKeys,
  key: string
) {
  if (target.value.includes(key)) {
    return;
  }

  target.value = [...target.value, key];
}

function removePendingKey(
  target:
    | typeof favoriteItemPendingKeys
    | typeof favoriteCharacterPendingKeys
    | typeof favoriteTraderPendingKeys,
  key: string
) {
  target.value = target.value.filter((entry) => entry !== key);
}

function isItemFavorited(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  return favoriteItemKeys.value.has(getFavoriteItemKey(item));
}

function isItemFavoritePending(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  return favoriteItemPendingKeySet.value.has(getFavoriteItemKey(item));
}

function isCharacterFavorited(characterName: string | null | undefined) {
  const normalized = normalizeText(characterName);
  return normalized ? favoriteCharacterKeys.value.has(getFavoriteCharacterKey(normalized)) : false;
}

function getItemFavoriteLabel(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  if (isItemFavoritePending(item)) {
    return `Updating watchlist for ${item.itemName}`;
  }

  return isItemFavorited(item)
    ? `Remove ${item.itemName} from watchlist`
    : `Add ${item.itemName} to watchlist`;
}

function getItemWatcherActionLabel(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  if (isItemFavoritePending(item)) {
    return 'Working...';
  }

  return isItemFavorited(item) ? 'Watching' : 'Watch';
}

function getPriceTrendDirection(
  lastPrice: number | null | undefined,
  averagePrice: number | null | undefined
) {
  if (lastPrice == null || averagePrice == null || averagePrice <= 0) {
    return 'unknown';
  }

  if (lastPrice > averagePrice) {
    return 'up';
  }

  if (lastPrice < averagePrice) {
    return 'down';
  }

  return 'flat';
}

function getPriceTrendIcon(
  lastPrice: number | null | undefined,
  averagePrice: number | null | undefined
) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return '↗';
  if (direction === 'down') return '↘';
  if (direction === 'flat') return '→';
  return '•';
}

function getPriceTrendLabel(
  lastPrice: number | null | undefined,
  averagePrice: number | null | undefined
) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return 'Last sale price is above average';
  if (direction === 'down') return 'Last sale price is below average';
  if (direction === 'flat') return 'Last sale price matches average';
  return 'Last sale price is unavailable';
}

function getListingAnalysisDirection(
  price: number,
  averagePrice: number | null | undefined
): 'up' | 'down' | 'flat' {
  if (averagePrice == null || averagePrice <= 0) {
    return 'flat';
  }

  if (price > averagePrice) {
    return 'up';
  }

  if (price < averagePrice) {
    return 'down';
  }

  return 'flat';
}

function getListingAnalysisArrow(price: number, averagePrice: number | null | undefined) {
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

function getListingAnalysisPercent(price: number, averagePrice: number | null | undefined) {
  if (averagePrice == null || averagePrice <= 0) {
    return null;
  }

  const deltaPercent = ((price - averagePrice) / averagePrice) * 100;
  if (Math.abs(deltaPercent) < 0.05) {
    return '0%';
  }

  return `${deltaPercent > 0 ? '+' : '-'}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(Math.abs(deltaPercent))}%`;
}

function getListingAnalysisClass(price: number, averagePrice: number | null | undefined) {
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') return 'listing-analysis--up';
  if (direction === 'down') return 'listing-analysis--down';
  return 'listing-analysis--flat';
}

function getListingAnalysisTitle(price: number, averagePrice: number | null | undefined) {
  if (averagePrice == null || averagePrice <= 0) {
    return 'No average sale price is established yet for this item.';
  }

  const percent = getListingAnalysisPercent(price, averagePrice) ?? '0%';
  const direction = getListingAnalysisDirection(price, averagePrice);
  if (direction === 'up') {
    return `Listed ${percent} above the average sale price.`;
  }

  if (direction === 'down') {
    return `Listed ${percent} below the average sale price.`;
  }

  return 'Listed at the average sale price.';
}

function formatSlot(listing: MarketListing) {
  return itemSlotSummaryLabel(listing.itemSlots) ?? '—';
}

function getDefaultMarketListingsSortOrder(field: MarketListingsSortField): 'asc' | 'desc' {
  switch (field) {
    case 'priceRank':
    case 'itemName':
    case 'sellerName':
    case 'slotId':
    case 'analysis':
      return 'asc';
    case 'listedAt':
    case 'price':
    case 'charges':
    default:
      return 'desc';
  }
}

function getCharacterListingsSortIndicator(field: MarketListingsSortField) {
  if (characterListingsSortBy.value !== field) {
    return '↕';
  }

  return characterListingsSortOrder.value === 'asc' ? '↑' : '↓';
}

function getItemListingsSortIndicator(field: MarketListingsSortField) {
  if (itemListingsSortBy.value !== field) {
    return '↕';
  }

  return itemListingsSortOrder.value === 'asc' ? '↑' : '↓';
}

function getCharacterListingsColumnAriaSort(field: MarketListingsSortField) {
  if (characterListingsSortBy.value !== field) {
    return 'none';
  }

  return characterListingsSortOrder.value === 'asc' ? 'ascending' : 'descending';
}

function getItemListingsColumnAriaSort(field: MarketListingsSortField) {
  if (itemListingsSortBy.value !== field) {
    return 'none';
  }

  return itemListingsSortOrder.value === 'asc' ? 'ascending' : 'descending';
}

function toggleCharacterListingsSort(field: MarketListingsSortField) {
  if (characterListingsSortBy.value === field) {
    characterListingsSortOrder.value = characterListingsSortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    characterListingsSortBy.value = field;
    characterListingsSortOrder.value = getDefaultMarketListingsSortOrder(field);
  }

  if (isCharacterModalOpen.value && activeCharacterName.value) {
    void loadCharacterListingsPage(1);
  }
}

function toggleItemListingsSort(field: MarketListingsSortField) {
  if (itemListingsSortBy.value === field) {
    itemListingsSortOrder.value = itemListingsSortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    itemListingsSortBy.value = field;
    itemListingsSortOrder.value = getDefaultMarketListingsSortOrder(field);
  }

  if (isItemModalOpen.value && activeModalItem.value) {
    void loadSelectedItemListingsPage(1);
  }
}

function buildCharacterListingKey(listing: MarketListing) {
  return `${listing.sellerCharacterId}-${listing.itemId}-${listing.slotId}-${listing.listedAt ?? 'na'}`;
}

function getPriceRankTitle(listing: MarketListing) {
  const itemLabel = listing.itemName || `Item ${listing.itemId}`;
  if (listing.priceRank === 1) {
    return `Best price for ${itemLabel}. Older listings win ties.`;
  }

  return `Price rank #${formatNumber(listing.priceRank)} for ${itemLabel}. Older listings win ties.`;
}

function getPriceTrendClass(
  lastPrice: number | null | undefined,
  averagePrice: number | null | undefined
) {
  const direction = getPriceTrendDirection(lastPrice, averagePrice);
  if (direction === 'up') return 'trend-indicator--up';
  if (direction === 'down') return 'trend-indicator--down';
  return 'trend-indicator--flat';
}

function clearRefreshCooldownInterval() {
  if (!refreshCooldownInterval) {
    return;
  }

  clearInterval(refreshCooldownInterval);
  refreshCooldownInterval = null;
}

function startRefreshCooldown(durationSeconds = REFRESH_COOLDOWN_SECONDS) {
  refreshCooldownRemaining.value = durationSeconds;
  clearRefreshCooldownInterval();

  refreshCooldownInterval = setInterval(() => {
    if (refreshCooldownRemaining.value <= 1) {
      refreshCooldownRemaining.value = 0;
      clearRefreshCooldownInterval();
      return;
    }

    refreshCooldownRemaining.value -= 1;
  }, 1000);
}

function showMarketItemTooltip(
  event: MouseEvent,
  itemId: number | null,
  itemName: string,
  itemIconId: number | null
) {
  if (!itemId || itemId <= 0) {
    return;
  }

  void tooltipStore.showTooltip(
    {
      itemId,
      itemName,
      itemIconId
    },
    { x: event.clientX, y: event.clientY }
  );
}

function showMarketSaleTooltip(
  event: MouseEvent,
  sale: Pick<MarketRecentSale, 'itemId' | 'itemName' | 'itemIconId'>
) {
  showMarketItemTooltip(event, sale.itemId, sale.itemName, sale.itemIconId);
}

function updateMarketItemTooltipPosition(event: MouseEvent) {
  tooltipStore.updatePosition({ x: event.clientX, y: event.clientY });
}

function hideMarketItemTooltip() {
  tooltipStore.hideTooltip();
}

function parseCalendarDate(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

function buildDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    parseCalendarDate(value)
  );
}

function buildDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatPriceChartTick(value: string | number) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} pp`;
  }

  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: numericValue < 10 ? 0 : 0,
    maximumFractionDigits: numericValue < 10 ? 2 : 1
  }).format(numericValue)} pp`;
}

const overallChartData = computed(() => {
  if (!summary.value?.dailyActivity.length) return null;
  return {
    labels: summary.value.dailyActivity.map((point) => buildDateLabel(point.saleDate)),
    datasets: [
      {
        label: 'Revenue (pp)',
        data: summary.value.dailyActivity.map((point) =>
          Number((point.totalRevenue / 1000).toFixed(1))
        ),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.18)',
        fill: true,
        yAxisID: 'revenue'
      },
      {
        label: 'Units Sold',
        data: summary.value.dailyActivity.map((point) => point.unitsSold),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        fill: false,
        yAxisID: 'units'
      }
    ]
  };
});

const overallChartOptions = {
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    revenue: {
      type: 'linear' as const,
      position: 'left' as const,
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { callback: (value: string | number) => `${value} pp` }
    },
    units: {
      type: 'linear' as const,
      position: 'right' as const,
      grid: { display: false }
    }
  }
};

const itemPriceChartData = computed(() => {
  if (!history.value?.pricePoints.length) return null;

  const pointValues = history.value.pricePoints.map((point) => Number((point.price / 1000).toFixed(2)));
  const lastIndex = pointValues.length - 1;

  return {
    labels: history.value.pricePoints.map((point) => buildDateTimeLabel(point.occurredAt)),
    datasets: [
      {
        label: 'Price Per Unit (pp)',
        data: pointValues,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(147, 197, 253, 0.22)',
        fill: 'origin' as const,
        stepped: true,
        borderWidth: 4,
        tension: 0,
        pointRadius: pointValues.map((_, index) => (index === lastIndex ? 8 : 0)),
        pointHoverRadius: pointValues.map((_, index) => (index === lastIndex ? 9 : 4)),
        pointHitRadius: pointValues.map((_, index) => (index === lastIndex ? 12 : 10)),
        pointBackgroundColor: pointValues.map((_, index) =>
          index === lastIndex ? '#f8fafc' : 'rgba(0, 0, 0, 0)'
        ),
        pointBorderColor: pointValues.map((_, index) =>
          index === lastIndex ? '#60a5fa' : 'rgba(0, 0, 0, 0)'
        ),
        pointBorderWidth: pointValues.map((_, index) => (index === lastIndex ? 5 : 0))
      }
    ]
  };
});

const itemPriceChartOptions = computed(() => {
  const pointValues = history.value?.pricePoints.map((point) => Number((point.price / 1000).toFixed(2))) ?? [];
  const maxValue = pointValues.length ? Math.max(...pointValues) : 0;
  const minValue = pointValues.length ? Math.min(...pointValues) : 0;
  const range = Math.max(maxValue - minValue, 0);
  const topPadding = maxValue > 0 ? Math.max(range * 0.12, maxValue * 0.08, 0.25) : 1;

  return {
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        ticks: {
          maxTicksLimit: 3,
          color: 'rgba(226, 232, 240, 0.82)'
        },
        border: {
          color: 'rgba(148, 163, 184, 0.35)'
        }
      },
      y: {
        suggestedMax: maxValue + topPadding,
        grid: {
          color: 'rgba(148, 163, 184, 0.16)',
          drawBorder: false
        },
        ticks: {
          callback: (value: string | number) => formatPriceChartTick(value),
          color: 'rgba(226, 232, 240, 0.82)',
          maxTicksLimit: 5
        },
        border: {
          display: false
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items: Array<{ label?: string }>) => items[0]?.label ?? '',
          label: (context: { parsed: { y: number | null } }) =>
            `Price: ${context.parsed.y ?? 0} pp`
        }
      }
    },
    elements: {
      line: {
        capBezierPoints: false
      }
    }
  };
});

const itemDailyChartData = computed(() => {
  if (!history.value?.dailyTrend.length) return null;
  return {
    labels: history.value.dailyTrend.map((point) => buildDateLabel(point.saleDate)),
    datasets: [
      {
        label: 'Average Price (pp)',
        data: history.value.dailyTrend.map((point) =>
          Number((point.averagePrice / 1000).toFixed(2))
        ),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.16)',
        fill: true,
        yAxisID: 'price'
      },
      {
        label: 'Units Sold',
        data: history.value.dailyTrend.map((point) => point.unitsSold),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.12)',
        fill: false,
        yAxisID: 'units'
      }
    ]
  };
});

const itemDailyChartOptions = {
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    price: {
      type: 'linear' as const,
      position: 'left' as const,
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { callback: (value: string | number) => `${value} pp` }
    },
    units: {
      type: 'linear' as const,
      position: 'right' as const,
      grid: { display: false }
    }
  }
};

async function loadSummary(initial = false) {
  if (initial) loading.value = true;
  else refreshing.value = true;
  try {
    summary.value = await api.fetchMarketSummary(selectedRangeDays.value, topItemsSort.value);
  } catch (error) {
    console.error('Failed to load market summary.', error);
    addToast({
      title: 'Market Load Failed',
      message: 'Unable to load market summary.',
      variant: 'error'
    });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function setTopItemsSort(sort: MarketTopItemsSort) {
  if (topItemsSort.value === sort || refreshing.value) {
    return;
  }

  topItemsSort.value = sort;
  await loadSummary(false);
}

async function loadSelectedItemHistory() {
  if (!activeModalItem.value) {
    history.value = null;
    return;
  }
  historyLoading.value = true;
  try {
    history.value = await api.fetchMarketItemHistory({
      itemId: activeModalItem.value.itemId ?? undefined,
      itemName: activeModalItem.value.itemName,
      days: selectedRangeDays.value,
      pointLimit: 220
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      history.value = null;
      return;
    }

    console.error('Failed to load market item history.', error);
    history.value = null;
    addToast({
      title: 'Item History Failed',
      message: `Unable to load history for ${activeModalItem.value.itemName}.`,
      variant: 'error'
    });
  } finally {
    historyLoading.value = false;
  }
}

function resetItemActivityPages() {
  itemActivityBuyersPageNumber.value = 1;
  itemActivitySellersPageNumber.value = 1;
}

function resetItemListingsPage() {
  itemListingsPage.value = null;
}

async function loadSelectedItemActivity() {
  if (!activeModalItem.value) {
    itemActivity.value = null;
    return;
  }

  const token = ++activeItemActivityRequestToken;
  itemActivityLoading.value = true;

  try {
    const activity = await api.fetchMarketItemActivity({
      itemId: activeModalItem.value.itemId ?? undefined,
      itemName: activeModalItem.value.itemName,
      days: selectedRangeDays.value,
      buyersPage: itemActivityBuyersPageNumber.value,
      sellersPage: itemActivitySellersPageNumber.value,
      pageSize: itemActivityPageSize
    });

    if (token !== activeItemActivityRequestToken) {
      return;
    }

    itemActivity.value = activity;
  } catch (error) {
    if (token !== activeItemActivityRequestToken) {
      return;
    }

    if (isNotFoundError(error)) {
      itemActivity.value = null;
      return;
    }

    console.error('Failed to load market item activity.', error);
    itemActivity.value = null;
    addToast({
      title: 'Item Activity Failed',
      message: `Unable to load buyer and seller activity for ${activeModalItem.value.itemName}.`,
      variant: 'error'
    });
  } finally {
    if (token === activeItemActivityRequestToken) {
      itemActivityLoading.value = false;
    }
  }
}

async function loadSelectedItemListingsPage(
  page = itemListingsPage.value?.page ?? 1,
  refreshIfStale = false
) {
  if (!activeModalItem.value) {
    itemListingsPage.value = null;
    return;
  }

  const token = ++activeItemListingsRequestToken;
  itemListingsLoading.value = true;

  try {
    const listingsPage = await api.fetchMarketListingsPage({
      itemId: activeModalItem.value.itemId ?? undefined,
      itemName: activeModalItem.value.itemName,
      page,
      pageSize: itemListingsPageSize,
      sortBy: itemListingsSortBy.value,
      sortOrder: itemListingsSortOrder.value,
      refreshIfStale
    });

    if (token !== activeItemListingsRequestToken) {
      return;
    }

    itemListingsPage.value = listingsPage;
  } catch (error) {
    if (token !== activeItemListingsRequestToken) {
      return;
    }

    console.error('Failed to load market item listings.', error);
    itemListingsPage.value = null;
    addToast({
      title: 'Item Listings Failed',
      message: `Unable to load active listings for ${activeModalItem.value.itemName}.`,
      variant: 'error'
    });
  } finally {
    if (token === activeItemListingsRequestToken) {
      itemListingsLoading.value = false;
    }
  }
}

async function loadSalesPage(page = salesPageNumber.value) {
  salesLoading.value = true;
  salesPageNumber.value = page;
  try {
    salesPage.value = await api.fetchMarketSalesPage({
      days: selectedRangeDays.value,
      page,
      pageSize: salesPageSize
    });
  } catch (error) {
    console.error('Failed to load market sales page.', error);
    salesPage.value = null;
    addToast({
      title: 'Sales Feed Failed',
      message: 'Unable to load recent market sales.',
      variant: 'error'
    });
  } finally {
    salesLoading.value = false;
  }
}

async function loadFavorites(showErrorToast = true) {
  favoritesLoading.value = true;
  try {
    const favorites = await api.fetchMarketFavorites();
    favoriteItems.value = favorites.items ?? [];
    favoriteCharacters.value = favorites.characters ?? [];
    favoriteTraders.value = favorites.traders ?? [];
    traderSummary.value =
      favorites.traderSummary ?? {
        totalTraders: 0,
        activeTraders: 0,
        tradersNeedingAttention: 0,
        totalListings: 0,
        leadingListings: 0,
        matchingListings: 0,
        undercutListings: 0,
        sourceAvailable: true,
        message: null
      };
  } catch (error) {
    console.error('Failed to load market watchlist.', error);
    if (showErrorToast) {
      addToast({
        title: 'Watchlist Load Failed',
        message: 'Unable to load market watchlist.',
        variant: 'error'
      });
    }
  } finally {
    favoritesLoading.value = false;
  }
}

function reloadFavorites() {
  void loadFavorites(true);
}

async function addMarketItemFavorite(
  item: Pick<MarketSelectableItem, 'itemId' | 'itemName' | 'itemIconId'>
) {
  const key = getFavoriteItemKey(item);
  if (favoriteItemKeys.value.has(key) || favoriteItemPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteItemPendingKeys, key);
  try {
    const favorite = await api.addMarketFavoriteItem({
      itemId: item.itemId,
      itemName: item.itemName,
      itemIconId: item.itemIconId
    });

    favoriteItems.value = [
      favorite,
      ...favoriteItems.value.filter((entry) => getFavoriteItemKey(entry) !== key)
    ];
  } catch (error) {
    console.error('Failed to add watchlist item.', error);
    addToast({
      title: 'Watchlist Item Failed',
      message: `Unable to watch ${item.itemName}.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteItemPendingKeys, key);
  }
}

async function removeMarketItemFavorite(item: Pick<MarketSelectableItem, 'itemId' | 'itemName'>) {
  const key = getFavoriteItemKey(item);
  if (favoriteItemPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteItemPendingKeys, key);
  try {
    await api.removeMarketFavoriteItem({
      itemId: item.itemId,
      itemName: item.itemName
    });

    favoriteItems.value = favoriteItems.value.filter((entry) => getFavoriteItemKey(entry) !== key);
  } catch (error) {
    console.error('Failed to remove watchlist item.', error);
    addToast({
      title: 'Remove Watchlist Item Failed',
      message: `Unable to remove ${item.itemName} from your watchlist.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteItemPendingKeys, key);
  }
}

async function toggleMarketItemFavorite(
  item: Pick<MarketSelectableItem, 'itemId' | 'itemName' | 'itemIconId'>
) {
  if (isItemFavorited(item)) {
    await removeMarketItemFavorite(item);
    return;
  }

  await addMarketItemFavorite(item);
}

async function addMarketCharacterFavorite(characterName: string) {
  const normalizedName = normalizeText(characterName);
  if (!normalizedName) {
    return;
  }

  const key = getFavoriteCharacterKey(normalizedName);
  if (favoriteCharacterKeys.value.has(key) || favoriteCharacterPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteCharacterPendingKeys, key);
  try {
    const favorite = await api.addMarketFavoriteCharacter(normalizedName);
    favoriteCharacters.value = [
      favorite,
      ...favoriteCharacters.value.filter(
        (entry) => getFavoriteCharacterKey(entry.characterName) !== key
      )
    ];
  } catch (error) {
    console.error('Failed to add watchlist character.', error);
    addToast({
      title: 'Watchlist Character Failed',
      message: `Unable to watch ${normalizedName}.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteCharacterPendingKeys, key);
  }
}

function syncTraderSummaryFromFavorites() {
  traderSummary.value = {
    totalTraders: favoriteTraders.value.length,
    activeTraders: favoriteTraders.value.filter((entry) => entry.hasActiveListings).length,
    tradersNeedingAttention: favoriteTraders.value.filter((entry) => entry.needsAttention).length,
    totalListings: favoriteTraders.value.reduce((sum, entry) => sum + entry.totalListings, 0),
    leadingListings: favoriteTraders.value.reduce((sum, entry) => sum + entry.leadingListings, 0),
    matchingListings: favoriteTraders.value.reduce(
      (sum, entry) => sum + entry.matchingListings,
      0
    ),
    undercutListings: favoriteTraders.value.reduce((sum, entry) => sum + entry.undercutListings, 0),
    sourceAvailable: traderSummary.value.sourceAvailable,
    message: traderSummary.value.message
  };
}

async function addMarketTrader(characterName: string) {
  const normalizedName = normalizeText(characterName);
  if (!normalizedName) {
    return;
  }

  const key = getFavoriteTraderKey(normalizedName);
  if (favoriteTraderKeys.value.has(key) || favoriteTraderPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteTraderPendingKeys, key);
  try {
    const trader = await api.addMarketTrader(normalizedName);
    favoriteTraders.value = [
      trader,
      ...favoriteTraders.value.filter((entry) => getFavoriteTraderKey(entry.characterName) !== key)
    ];
    syncTraderSummaryFromFavorites();
  } catch (error) {
    console.error('Failed to add market trader.', error);
    addToast({
      title: 'Save Trader Failed',
      message: `Unable to save ${normalizedName} to My Traders.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteTraderPendingKeys, key);
  }
}

async function removeMarketCharacterFavorite(characterName: string) {
  const normalizedName = normalizeText(characterName);
  if (!normalizedName) {
    return;
  }

  const key = getFavoriteCharacterKey(normalizedName);
  if (favoriteCharacterPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteCharacterPendingKeys, key);
  try {
    await api.removeMarketFavoriteCharacter(normalizedName);
    favoriteCharacters.value = favoriteCharacters.value.filter(
      (entry) => getFavoriteCharacterKey(entry.characterName) !== key
    );
  } catch (error) {
    console.error('Failed to remove watchlist character.', error);
    addToast({
      title: 'Remove Watchlist Character Failed',
      message: `Unable to remove ${normalizedName} from your watchlist.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteCharacterPendingKeys, key);
  }
}

async function removeMarketTrader(characterName: string) {
  const normalizedName = normalizeText(characterName);
  if (!normalizedName) {
    return;
  }

  const key = getFavoriteTraderKey(normalizedName);
  if (favoriteTraderPendingKeySet.value.has(key)) {
    return;
  }

  addPendingKey(favoriteTraderPendingKeys, key);
  try {
    await api.removeMarketTrader(normalizedName);
    favoriteTraders.value = favoriteTraders.value.filter(
      (entry) => getFavoriteTraderKey(entry.characterName) !== key
    );
    syncTraderSummaryFromFavorites();
  } catch (error) {
    console.error('Failed to remove market trader.', error);
    addToast({
      title: 'Remove Trader Failed',
      message: `Unable to remove ${normalizedName} from My Traders.`,
      variant: 'error'
    });
  } finally {
    removePendingKey(favoriteTraderPendingKeys, key);
  }
}

async function toggleActiveCharacterFavorite() {
  const characterName = normalizeText(activeCharacterName.value);
  if (!characterName) {
    return;
  }

  if (isCharacterFavorited(characterName)) {
    await removeMarketCharacterFavorite(characterName);
    return;
  }

  await addMarketCharacterFavorite(characterName);
}

function resetCharacterHistoryPages() {
  characterHistoryPages.sell = null;
  characterHistoryPages.buy = null;
}

function resetCharacterListingsPage() {
  characterListingsPage.value = null;
}

function canOpenCharacterHistory(name: string | null) {
  return Boolean(name?.trim()) && name !== UNKNOWN_MARKET_CHARACTER_LABEL;
}

function getCharacterHistoryCounterpartyName(entry: MarketRecentSale) {
  return activeCharacterTab.value === 'sell' ? entry.buyerCharacterName : entry.sellerCharacterName;
}

async function loadCharacterHistoryPage(
  type: MarketCharacterHistoryType = activeCharacterTab.value === 'buy' ? 'buy' : 'sell',
  page = characterHistoryPages[type]?.page ?? 1
) {
  const characterName = activeCharacterName.value?.trim();
  if (!characterName) {
    characterHistoryPages[type] = null;
    return;
  }

  const token = ++characterHistoryRequestTokens[type];
  characterHistoryLoading[type] = true;

  try {
    const historyPage = await api.fetchMarketCharacterHistoryPage({
      characterName,
      type,
      days: selectedRangeDays.value,
      page,
      pageSize: characterHistoryPageSize
    });

    if (token !== characterHistoryRequestTokens[type]) {
      return;
    }

    characterHistoryPages[type] = historyPage;
  } catch (error) {
    if (token !== characterHistoryRequestTokens[type]) {
      return;
    }

    console.error('Failed to load character market history.', error);
    characterHistoryPages[type] = null;
    addToast({
      title: 'Character History Failed',
      message: `Unable to load ${type} history for ${characterName}.`,
      variant: 'error'
    });
  } finally {
    if (token === characterHistoryRequestTokens[type]) {
      characterHistoryLoading[type] = false;
    }
  }
}

async function loadCharacterListingsPage(
  page = characterListingsPage.value?.page ?? 1,
  refreshIfStale = false
) {
  const characterName = activeCharacterName.value?.trim();
  if (!characterName) {
    characterListingsPage.value = null;
    return;
  }

  const token = ++characterListingsRequestToken.value;
  characterListingsLoading.value = true;

  try {
    const listingsPage = await api.fetchMarketListingsPage({
      sellerName: characterName,
      page,
      pageSize: characterListingsPageSize,
      sortBy: characterListingsSortBy.value,
      sortOrder: characterListingsSortOrder.value,
      refreshIfStale
    });

    if (token !== characterListingsRequestToken.value) {
      return;
    }

    characterListingsPage.value = listingsPage;
  } catch (error) {
    if (token !== characterListingsRequestToken.value) {
      return;
    }

    console.error('Failed to load character listings.', error);
    characterListingsPage.value = null;
    addToast({
      title: 'Character Listings Failed',
      message: `Unable to load active listings for ${characterName}.`,
      variant: 'error'
    });
  } finally {
    if (token === characterListingsRequestToken.value) {
      characterListingsLoading.value = false;
    }
  }
}

async function refreshAll() {
  if (isRefreshButtonDisabled.value) {
    return;
  }

  startRefreshCooldown();
  await loadSummary(false);
  if (isItemModalOpen.value && activeModalItem.value) {
    if (activeItemModalTab.value === 'listings') {
      await loadSelectedItemListingsPage(activeItemListingsPage.value?.page ?? 1, true);
    } else {
      await loadSelectedItemHistory();
    }
    if (activeItemModalTab.value === 'activity' || itemActivity.value) {
      await loadSelectedItemActivity();
    }
  }
  if (isCharacterModalOpen.value && activeCharacterName.value) {
    if (activeCharacterTab.value === 'listings') {
      await loadCharacterListingsPage(activeCharacterListingsPage.value?.page ?? 1, true);
    } else {
      await loadCharacterHistoryPage(
        activeCharacterTab.value,
        activeCharacterHistoryPage.value?.page ?? 1
      );
    }
  }
  await loadSalesPage(1);
}

function openItemModal(item: MarketSelectableItem) {
  activeModalItem.value = item;
  activeItemModalTab.value = 'trends';
  resetItemActivityPages();
  itemActivity.value = null;
  resetItemListingsPage();
  isItemModalOpen.value = true;
  showSearchResults.value = false;
  void loadSelectedItemHistory();
}

function selectSearchResult(item: MarketItemSearchResult) {
  openItemModal(item);
}

function watchSearchResult(item: MarketItemSearchResult) {
  void addMarketItemFavorite(item);
}

function selectTopItem(item: MarketTopItem) {
  openItemModal({
    itemId: item.itemId,
    itemName: item.itemName,
    itemIconId: item.itemIconId
  });
}

function openFavoriteCharacter(characterName: string) {
  openCharacterHistoryModal(characterName, 'listings');
}

function reloadSelectedItem() {
  if (activeItemModalTab.value === 'listings') {
    void loadSelectedItemListingsPage(activeItemListingsPage.value?.page ?? 1, true);
    return;
  }

  if (activeItemModalTab.value === 'activity') {
    void loadSelectedItemActivity();
    return;
  }

  void loadSelectedItemHistory();
}

function closeItemModal() {
  isItemModalOpen.value = false;
}

function setItemModalTab(tab: MarketItemModalTab) {
  if (activeItemModalTab.value === tab) {
    return;
  }

  activeItemModalTab.value = tab;
  if (tab === 'listings' && !itemListingsPage.value) {
    void loadSelectedItemListingsPage(1, true);
    return;
  }

  if (tab === 'activity' && !itemActivity.value) {
    void loadSelectedItemActivity();
  }
}

function changeItemActivityPage(type: 'buyers' | 'sellers', page: number) {
  if (itemActivityLoading.value) {
    return;
  }

  if (type === 'buyers') {
    itemActivityBuyersPageNumber.value = page;
  } else {
    itemActivitySellersPageNumber.value = page;
  }

  void loadSelectedItemActivity();
}

function changeItemListingsPage(page: number) {
  if (itemListingsLoading.value) {
    return;
  }

  void loadSelectedItemListingsPage(page);
}

function getDefaultCharacterModalTab(_type: MarketCharacterModalTab): MarketCharacterModalTab {
  return 'listings';
}

function openCharacterHistoryModal(name: string | null, type: MarketCharacterModalTab) {
  const trimmedName = name?.trim() ?? '';
  if (!trimmedName || trimmedName === UNKNOWN_MARKET_CHARACTER_LABEL) {
    return;
  }

  const hasCharacterChanged = activeCharacterName.value !== trimmedName;
  const nextTab = getDefaultCharacterModalTab(type);

  activeCharacterName.value = trimmedName;
  activeCharacterTab.value = nextTab;
  isCharacterModalOpen.value = true;

  if (hasCharacterChanged) {
    resetCharacterHistoryPages();
    resetCharacterListingsPage();
    if (nextTab === 'listings') {
      void loadCharacterListingsPage(1, true);
    } else {
      void loadCharacterHistoryPage(nextTab, 1);
    }
    return;
  }

  if (nextTab === 'listings') {
    if (!characterListingsPage.value) {
      void loadCharacterListingsPage(1, true);
    }
    return;
  }

  if (!characterHistoryPages[nextTab]) {
    void loadCharacterHistoryPage(nextTab, 1);
  }
}

function openCharacterHistoryCounterparty(entry: MarketRecentSale) {
  if (activeCharacterTab.value === 'sell') {
    openCharacterHistoryModal(entry.buyerCharacterName, 'buy');
    return;
  }

  openCharacterHistoryModal(entry.sellerCharacterName, 'sell');
}

function setCharacterHistoryTab(type: MarketCharacterModalTab) {
  if (activeCharacterTab.value === type) {
    return;
  }

  activeCharacterTab.value = type;

  if (type === 'listings') {
    if (!characterListingsPage.value) {
      void loadCharacterListingsPage(1, true);
    }
    return;
  }

  if (!characterHistoryPages[type]) {
    void loadCharacterHistoryPage(type, 1);
  }
}

function reloadActiveCharacterHistory() {
  if (activeCharacterTab.value === 'listings') {
    void loadCharacterListingsPage(activeCharacterListingsPage.value?.page ?? 1, true);
    return;
  }

  void loadCharacterHistoryPage(activeCharacterTab.value, activeCharacterHistoryPage.value?.page ?? 1);
}

function closeCharacterModal() {
  isCharacterModalOpen.value = false;
}

function openCharacterListingItem(listing: MarketListing) {
  closeCharacterModal();
  selectSearchResult({
    itemId: listing.itemId,
    itemName: listing.itemName,
    itemIconId: listing.itemIconId,
    saleCount: 0,
    lastSoldAt: listing.listedAt,
    hasMarketData: true
  });
}

function selectSaleItem(sale: MarketRecentSale) {
  selectSearchResult({
    itemId: sale.itemId,
    itemName: sale.itemName,
    itemIconId: sale.itemIconId,
    saleCount: 0,
    lastSoldAt: sale.occurredAt,
    hasMarketData: true
  });
}

function watchActiveItem() {
  if (!activeModalItem.value || isActiveItemFavorited.value || isActiveItemFavoritePending.value) {
    return;
  }

  void addMarketItemFavorite(activeModalItem.value);
}

function openCharacterHistoryItem(entry: MarketRecentSale) {
  closeCharacterModal();
  selectSaleItem(entry);
}

function changeSalesPage(page: number) {
  if (salesLoading.value) {
    return;
  }

  void loadSalesPage(page);
}

function changeCharacterHistoryPage(page: number) {
  if (activeCharacterTab.value === 'listings') {
    if (characterListingsLoading.value) {
      return;
    }

    void loadCharacterListingsPage(page);
    return;
  }

  if (activeCharacterHistoryLoading.value) {
    return;
  }

  void loadCharacterHistoryPage(activeCharacterTab.value, page);
}

function handleSearchFocus() {
  if (searchResults.value.length > 0) showSearchResults.value = true;
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null;
  if (target && !searchPanelRef.value?.contains(target)) showSearchResults.value = false;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (isCharacterModalOpen.value) {
      closeCharacterModal();
      return;
    }

    if (isItemModalOpen.value) {
      closeItemModal();
    }
  }
}

watch(selectedRangeDays, async () => {
  await loadSummary(false);
  if (isItemModalOpen.value && activeModalItem.value) {
    resetItemActivityPages();
    itemActivity.value = null;
    if (activeItemModalTab.value !== 'listings') {
      await loadSelectedItemHistory();
    }
    if (activeItemModalTab.value === 'activity') {
      await loadSelectedItemActivity();
    }
  }
  if (isCharacterModalOpen.value && activeCharacterName.value) {
    resetCharacterHistoryPages();
    resetCharacterListingsPage();
    if (activeCharacterTab.value === 'listings') {
      await loadCharacterListingsPage(1);
    } else {
      await loadCharacterHistoryPage(activeCharacterTab.value, 1);
    }
  }
  await loadSalesPage(1);
});

watch(searchQuery, (value) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  const query = value.trim();
  if (query.length < 2) {
    searchLoading.value = false;
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }
  searchTimeout = setTimeout(async () => {
    const token = ++activeSearchToken;
    searchLoading.value = true;
    try {
      const results = await api.searchMarketItems(query, 10);
      if (token !== activeSearchToken) return;
      searchResults.value = results;
      showSearchResults.value = true;
    } catch (error) {
      if (token !== activeSearchToken) return;
      console.error('Failed to search market items.', error);
      searchResults.value = [];
      showSearchResults.value = true;
    } finally {
      if (token === activeSearchToken) searchLoading.value = false;
    }
  }, 220);
});

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleWindowKeydown);
  await Promise.all([loadSummary(true), loadSalesPage(1), loadFavorites(false)]);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleWindowKeydown);
  if (searchTimeout) clearTimeout(searchTimeout);
  clearRefreshCooldownInterval();
  tooltipStore.hideTooltipImmediate();
});
</script>

<style scoped>
.market-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  color: #e5edf5;
}
.btn,
.input {
  border-radius: 0.9rem;
  font: inherit;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, opacity 0.15s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn--accent {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
.btn--accent:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}
.btn--outline {
  background: rgba(15, 23, 42, 0.68);
  border-color: rgba(148, 163, 184, 0.28);
  color: #e2e8f0;
}
.btn--small {
  padding: 0.5rem 0.8rem;
  font-size: 0.88rem;
}
.input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.62);
  color: #f8fafc;
  padding: 0.8rem 0.95rem;
}
.input:focus {
  outline: 2px solid rgba(56, 189, 248, 0.35);
  outline-offset: 1px;
  border-color: rgba(56, 189, 248, 0.45);
}
.panel,
.card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.26);
}
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
}
.hero__left {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}
.eyebrow,
.label {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
  color: #94a3b8;
}
.eyebrow {
  margin: 0 0 0.6rem;
  color: #fbbf24;
}
.hero h1,
.panel h2 {
  margin: 0;
}
.hero h1 {
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: -0.03em;
  white-space: nowrap;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.pill {
  display: inline-flex;
  padding: 0.25rem 0.55rem;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  font-size: 0.72rem;
  font-weight: 600;
}
.pill--muted {
  background: rgba(51, 65, 85, 0.45);
  border-color: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
.pill--success-soft {
  background: rgba(22, 101, 52, 0.22);
  border-color: rgba(34, 197, 94, 0.24);
  color: #bbf7d0;
}
.pill--danger-soft {
  background: rgba(127, 29, 29, 0.22);
  border-color: rgba(248, 113, 113, 0.26);
  color: #fecaca;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.market-page-tabs {
  display: flex;
  align-items: flex-end;
  gap: 0;
  border-bottom: 1px solid #334155;
  padding: 0;
}
.market-page-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.65rem 1.35rem;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: #94a3b8;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
.market-page-tab:hover {
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.5);
}
.market-page-tab--active {
  color: #f8fafc;
  background: #0f172a;
  border-color: #334155;
}
.market-page-tab:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.5);
  outline-offset: -2px;
}
.market-page-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(185, 28, 28, 0.88);
  color: #fff;
  font-size: 0.76rem;
  font-weight: 700;
}
.market-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.panel {
  padding: 1.25rem;
  border-radius: 1.2rem;
  overflow: hidden;
}
.panel--search {
  position: relative;
  overflow: visible;
  z-index: 12;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.panel-head p {
  margin: 0.3rem 0 0;
}
.table-item-button {
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.table-item-button:hover {
  color: #f8fafc;
}
.search-wrap {
  position: relative;
  margin-top: 1rem;
}
.search-input {
  width: 100%;
  min-height: 3.1rem;
  padding-inline: 1rem;
  border-radius: 1rem;
}
.search-hint {
  display: inline-flex;
  margin-top: 0.45rem;
}
.search-results {
  position: absolute;
  top: calc(100% + 0.7rem);
  left: 0;
  right: 0;
  border-radius: 1rem;
  overflow: hidden;
  max-height: min(26rem, 60vh);
  overflow-y: auto;
  background: rgba(2, 6, 23, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 22px 42px rgba(2, 6, 23, 0.42);
  z-index: 30;
}
.search-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.7rem 0.85rem;
}
.search-row + .search-row {
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}
.search-row:hover {
  background: rgba(30, 41, 59, 0.72);
}
.search-row__select {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.search-row__select:hover {
  color: #f8fafc;
}
.search-row__text,
.mover__main {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}
.mover__main > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}
.search-row__text {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}
.search-row__meta {
  line-height: 1.4;
}
.search-row__meta--empty {
  color: #cbd5e1;
}
.search-row__watch {
  flex-shrink: 0;
}
.search-empty,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 7rem;
}
.empty--stacked {
  flex-direction: column;
  gap: 0.8rem;
  text-align: center;
}
.empty--stacked p {
  margin: 0;
}
.selection {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(56, 189, 248, 0.12));
  border: 1px solid rgba(52, 211, 153, 0.18);
}
.selection p {
  margin: 0.2rem 0 0;
}
/* Sales ticker */
.sales-ticker {
  overflow: hidden;
  border-radius: 6px;
  background: #0f172a;
  border: 1px solid #1e293b;
  padding: 0.45rem 0;
  mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
}

.sales-ticker__track {
  display: flex;
  width: max-content;
  animation: ticker-scroll 60s linear infinite;
}

.sales-ticker:hover .sales-ticker__track {
  animation-play-state: paused;
}

@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.sales-ticker__content {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.sales-ticker__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s;
}

.sales-ticker__item:hover {
  background: #1e293b;
}

.sales-ticker__icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
}

.sales-ticker__name {
  font-size: 0.8rem;
  font-weight: 600;
  color: #e2e8f0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sales-ticker__price {
  font-size: 0.78rem;
  color: #fbbf24;
  font-weight: 600;
}

.sales-ticker__qty {
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 500;
}

.sales-ticker__time {
  font-size: 0.68rem;
  color: #64748b;
}

.sales-ticker__trend {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 3px;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.sales-ticker__trend--up {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(239, 68, 68, 0.12);
}

.sales-ticker__trend--down {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.3);
  background: rgba(16, 185, 129, 0.12);
}

.sales-ticker__trend--flat {
  color: #94a3b8;
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.08);
}

.sales-ticker__trend--unknown {
  color: #475569;
}

.sales-ticker__sep {
  color: #334155;
  margin: 0 0.35rem;
  font-size: 0.9rem;
  user-select: none;
}

/* Item history modal stats cards */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.stats--focus {
  margin-top: 1rem;
  margin-bottom: 1rem;
}
.card {
  padding: 1.05rem 1.1rem;
  border-radius: 1.05rem;
}
.card strong {
  display: block;
  margin-top: 0.65rem;
  font-size: clamp(1.35rem, 2vw, 1.95rem);
  letter-spacing: -0.04em;
}
.card small {
  display: block;
  margin-top: 0.35rem;
  color: #94a3b8;
}
.card--accent {
  background: linear-gradient(145deg, rgba(245, 158, 11, 0.16), rgba(15, 23, 42, 0.95));
  border-color: rgba(245, 158, 11, 0.22);
}
.card--spotlight {
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.16), rgba(15, 23, 42, 0.95));
  border-color: rgba(16, 185, 129, 0.22);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.95fr);
  gap: 1rem;
}
.market-summary-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.95fr);
  gap: 1rem;
  align-items: stretch;
}
.market-summary-layout__sidebar {
  height: 100%;
}
.chart-box {
  height: 20rem;
  margin-top: 1rem;
}
.panel--chart-fill {
  display: flex;
  flex-direction: column;
}
.panel--chart-fill .chart-box {
  flex: 1;
  height: auto;
  min-height: 20rem;
}
.panel--chart-fill :deep(canvas) {
  height: 100% !important;
}
.movers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
.mover {
  display: flex;
  align-items: stretch;
  gap: 0.55rem;
  padding: 0.3rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.56);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}
.mover:hover,
.mover:focus-within {
  border-color: rgba(56, 189, 248, 0.26);
  box-shadow: 0 12px 26px rgba(2, 6, 23, 0.22);
}
.mover--favorited {
  border-color: rgba(245, 158, 11, 0.26);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(15, 23, 42, 0.7));
}
.mover__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.6rem 0.75rem;
  border: none;
  border-radius: 0.85rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}
.mover__body:hover {
  background: rgba(30, 41, 59, 0.72);
  transform: translateY(-1px);
}
.mover__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.28rem;
  min-width: 9.5rem;
  text-align: right;
}
.mover__meta-primary {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 1.05rem;
  line-height: 1;
}
.mover__meta-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  font-size: 0.84rem;
  line-height: 1;
  white-space: nowrap;
}
.mover__meta-label {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.mover__meta-value {
  color: #cbd5e1;
}
.favorite-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-width: 2.7rem;
  min-height: 2.7rem;
  padding: 0.55rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.68);
  color: #94a3b8;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}
.favorite-toggle:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(56, 189, 248, 0.35);
  color: #e2e8f0;
}
.favorite-toggle:disabled {
  cursor: default;
  opacity: 0.72;
}
.favorite-toggle--active {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.12);
}
.favorite-toggle--mover {
  flex-shrink: 0;
  align-self: center;
}
.favorite-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.favorite-toggle__icon svg {
  width: 1.15rem;
  height: 1.15rem;
}
.favorite-action {
  min-width: 8rem;
}
.favorite-action--active {
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(245, 158, 11, 0.12);
  color: #fde68a;
}
.segmented-control {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.segmented-control__button {
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.segmented-control__button--active {
  background: rgba(56, 189, 248, 0.16);
  color: #e2e8f0;
}
.segmented-control__button:disabled {
  cursor: default;
  opacity: 0.7;
}
.table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
}
.pagination__meta {
  text-align: center;
  flex: 1;
}
.market-table {
  width: 100%;
  border-collapse: collapse;
}
.market-table th,
.market-table td {
  padding: 0.82rem 0.88rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
}
.market-table th {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
}
.listings-table {
  width: 100%;
  min-width: 58rem;
  border-collapse: collapse;
}
.listings-table th,
.listings-table td {
  padding: 0.8rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  text-align: left;
  white-space: nowrap;
}
.listings-table th {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.listings-table tbody tr:hover {
  background: rgba(30, 41, 59, 0.34);
}
.table-sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.table-sort:hover {
  color: #e2e8f0;
}
.table-sort--active {
  color: #f8fafc;
}
.table-sort__icon {
  min-width: 0.8rem;
  color: #7dd3fc;
  font-size: 0.88rem;
  line-height: 1;
}
.listing-analysis {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  white-space: nowrap;
}
.listing-analysis__arrow {
  font-size: 1rem;
  line-height: 1;
}
.listing-analysis__percent {
  font-size: 0.88rem;
}
.listing-analysis--up {
  color: #f87171;
}
.listing-analysis--down {
  color: #34d399;
}
.listing-analysis--flat {
  color: #94a3b8;
}
.price-rank-cell {
  width: 7.5rem;
}
.price-rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  min-height: 1.5rem;
  padding: 0;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-weight: 700;
  line-height: 1;
}
.price-rank-badge__value {
  font-variant-numeric: tabular-nums;
}
.price-rank-badge--leader {
  min-width: auto;
  min-height: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: #dcfce7;
  box-shadow: none;
}
.price-rank-badge__leader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.price-rank-badge__leader-medallion {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background:
    radial-gradient(circle at 30% 30%, rgba(236, 253, 245, 0.96), rgba(74, 222, 128, 0.95) 42%, rgba(5, 150, 105, 0.96) 100%);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.4);
}
.price-rank-badge__leader-number {
  position: relative;
  z-index: 1;
  font-size: 1rem;
  font-weight: 900;
  color: #064e3b;
  text-shadow: 0 1px 0 rgba(236, 253, 245, 0.4);
}
.trend-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.72);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}
.trend-indicator--up {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.26);
  background: rgba(239, 68, 68, 0.12);
}
.trend-indicator--down {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.26);
  background: rgba(16, 185, 129, 0.12);
}
.trend-indicator--flat {
  color: #94a3b8;
}
.table-item,
.character-history-link {
  color: inherit;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 16rem;
  cursor: pointer;
  text-align: left;
}
.table-item--static {
  min-width: 14rem;
}
.table-item__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
  min-width: 0;
}
.table-item__text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.character-history-link {
  cursor: pointer;
  color: #7dd3fc;
  text-decoration: underline;
  text-decoration-color: rgba(125, 211, 252, 0.45);
  text-underline-offset: 0.14em;
}
.character-history-link:hover,
.character-history-link:focus-visible {
  color: #bae6fd;
}
.market-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(6px);
}
.market-modal {
  width: min(1260px, calc(100vw - 2rem));
  max-height: calc(100vh - 3rem);
  overflow: auto;
  padding: 1.35rem;
  border-radius: 1.35rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94));
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.48);
}
.market-modal--character {
  width: min(1080px, calc(100vw - 2rem));
}
.market-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.market-modal__header-copy p {
  margin: 0.3rem 0 0;
}
.market-modal__actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.market-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
}
.market-modal__toolbar-meta {
  text-align: right;
}
.market-modal__summary {
  margin: 0.85rem 0 0;
}
.market-modal__close {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}
.market-modal__close:hover {
  background: rgba(30, 41, 59, 0.9);
}
.market-modal__loading {
  min-height: 18rem;
}
.table-wrap--modal {
  margin-top: 1.15rem;
}
.activity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}
.activity-panel {
  display: flex;
  flex-direction: column;
}
.activity-panel__empty {
  flex: 1;
  min-height: 14rem;
}
.item-icon {
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.14);
  overflow: hidden;
}
.item-icon--lg {
  width: 2.7rem;
  height: 2.7rem;
}
.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.muted {
  color: #94a3b8;
}
@media (max-width: 1100px) {
  .layout,
  .market-summary-layout {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 768px) {
  .hero {
    flex-wrap: wrap;
  }
  .panel {
    padding: 1rem;
  }
  .stats {
    grid-template-columns: 1fr;
  }
  .panel-head {
    flex-direction: column;
  }
  .segmented-control {
    width: 100%;
    justify-content: stretch;
  }
  .segmented-control__button {
    flex: 1;
  }
  .market-page-tabs {
    overflow-x: auto;
  }
  .market-page-tab {
    padding: 0.45rem 0.7rem;
    font-size: 0.78rem;
  }
  .mover {
    align-items: stretch;
  }
  .mover__body {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  }
  .mover__meta {
    text-align: left;
  }
  .favorite-toggle--mover {
    align-self: flex-end;
    margin-right: 0.1rem;
  }
  .chart-box {
    height: 17rem;
  }
  .activity-grid {
    grid-template-columns: 1fr;
  }
  .market-modal-backdrop {
    padding: 0.75rem;
  }
  .market-modal {
    width: 100%;
    max-height: calc(100vh - 1.5rem);
    padding: 1rem;
  }
  .market-modal__header,
  .market-modal__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .market-modal__toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .market-modal__toolbar-meta {
    text-align: left;
  }
  .market-modal__close {
    align-self: flex-end;
  }
  .pagination {
    flex-direction: column;
    align-items: stretch;
  }
  .pagination__meta {
    text-align: left;
  }
}
</style>
