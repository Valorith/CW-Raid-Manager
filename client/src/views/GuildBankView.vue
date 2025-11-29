<template>
  <section class="guild-bank">
    <header class="guild-bank__hero">
      <div class="guild-bank__breadcrumb">
        <RouterLink :to="{ name: 'GuildDetail', params: { guildId } }">← Back to Guild</RouterLink>
        <span class="guild-bank__badge">Guild Bank</span>
      </div>
      <div class="guild-bank__headline">
        <div>
          <p class="eyebrow">Collective holdings</p>
          <h1>{{ guildName || 'Guild Bank' }}</h1>
          <p class="muted">
            Track every item stored on your designated bank characters. Searches span worn gear,
            personal bags, cursor stacks, and full bank inventories.
          </p>
        </div>
        <div class="guild-bank__hero-actions">
          <div class="refresh-indicator">
            <span class="refresh-indicator__label">Last sync</span>
            <strong>{{ lastRefreshLabel }}</strong>
            <span class="refresh-indicator__sub">
              Next refresh {{ refreshCountdownLabel }}
            </span>
          </div>
          <button
            class="icon-button icon-button--refresh"
            :disabled="loadingSnapshot || !canRefreshNow"
            @click="refreshSnapshot()"
            :aria-label="loadingSnapshot ? 'Refreshing guild bank' : 'Refresh guild bank'"
            title="Refresh from database"
          >
            <span v-if="loadingSnapshot" class="spinner" aria-hidden="true"></span>
            <span v-else class="refresh-icon" aria-hidden="true">⟳</span>
          </button>
          <button
            class="icon-button icon-button--cart-main"
            type="button"
            :aria-label="'Open cart (' + cartCount + ' items)'"
            @click="toggleCart"
            title="View shopping cart"
          >
            🛒
            <span v-if="cartCount" class="cart-badge">{{ cartCount }}</span>
          </button>
        </div>
      </div>
      <div class="guild-bank__stat-row">
        <div class="stat-chip">
          <span class="stat-chip__label">Tracked characters</span>
          <div class="stat-chip__value">{{ snapshot?.characters.length ?? 0 }}</div>
        </div>
        <div class="stat-chip">
          <span class="stat-chip__label">Unique items</span>
          <div class="stat-chip__value">{{ groupedItems.length }}</div>
          <span class="stat-chip__hint">{{ totalItemCount }} total pieces</span>
        </div>
        <div class="stat-chip stat-chip--muted">
          <span class="stat-chip__label">Missing in EQ DB</span>
          <div class="stat-chip__value">{{ missingCount }}</div>
          <span class="stat-chip__hint">Update names if spelling changed</span>
        </div>
      </div>
    </header>

    <div class="guild-bank__body">
      <aside class="guild-bank__panel">
        <div
          v-if="missingCachedNames.length && canManageBank"
          class="alert alert--warning"
        >
          <p class="alert__title">We detected missing tracked characters</p>
          <p class="alert__body">
            {{ missingCachedNames.length }} name{{ missingCachedNames.length === 1 ? '' : 's' }} were in your local backup but are not on the server.
          </p>
          <button
            class="btn btn--secondary"
            type="button"
            :disabled="restoringNames"
            @click="restoreMissingCachedCharacters"
          >
            {{ restoringNames ? 'Restoring…' : 'Restore from backup' }}
          </button>
        </div>

        <div class="roster-stack">
          <section
            :class="['roster-card', activeRoster === 'guild' ? 'roster-card--open' : 'roster-card--collapsed']"
          >
            <button
              type="button"
              class="roster-card__header"
              :aria-expanded="activeRoster === 'guild'"
              @click="setActiveRoster('guild')"
            >
              <div>
                <p class="eyebrow">Guild bank characters</p>
                <h2>Roster</h2>
                <p class="muted small roster-card__hint">
                  Leaders and officers can add the characters that hold guild items.
                </p>
              </div>
              <div class="roster-card__status">
                <span v-if="!canManageBank" class="muted small">View only</span>
                <span class="roster-card__chevron" aria-hidden="true">
                  {{ activeRoster === 'guild' ? '▾' : '▸' }}
                </span>
              </div>
            </button>
            <div v-show="activeRoster === 'guild'" class="roster-card__body">
              <div class="roster-card__controls" v-if="guildRoster.length">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="setRosterSelection('guild', !allGuildSelected)"
                >
                  {{ allGuildSelected ? 'Disable all' : 'Enable all' }}
                </button>
              </div>
              <form
                v-if="canManageBank"
                class="add-bank-character"
                @submit.prevent="addCharacter(false)"
              >
                <input
                  v-model="newGuildCharacterName"
                  type="text"
                  class="input"
                  name="guild-character"
                  placeholder="e.g. Copperkeep"
                  :disabled="addingCharacter"
                />
                <button
                  class="btn btn--secondary"
                  type="submit"
                  :disabled="addingCharacter || !newGuildCharacterName.trim().length"
                >
                  {{ addingCharacter ? 'Adding…' : 'Add character' }}
                </button>
              </form>

              <ul class="bank-character-list">
                <li
                  v-for="character in guildRoster"
                  :key="character.id"
                  class="bank-character"
                >
                  <label class="bank-character__meta">
                    <input
                      type="checkbox"
                      :checked="isCharacterSelected(character.name, false)"
                      @change="toggleCharacterSelection(character.name, false)"
                      class="bank-character__checkbox"
                    />
                    <strong>{{ character.name }}</strong>
                    <span
                      :class="[
                        'bank-character__status',
                        character.foundInEq ? 'bank-character__status--ok' : 'bank-character__status--warn'
                      ]"
                    >
                      {{ character.foundInEq ? 'Found in EQ' : 'Not found' }}
                    </span>
                  </label>
                  <button
                    v-if="canManageBank"
                    class="icon-button"
                    :disabled="removingId === character.id"
                    @click="removeCharacter(character.id)"
                    :aria-label="`Remove ${character.name}`"
                  >
                    <span class="icon-button__glyph" aria-hidden="true">🗑️</span>
                  </button>
                </li>
              </ul>
            </div>
          </section>

          <section
            :class="['roster-card', activeRoster === 'personal' ? 'roster-card--open' : 'roster-card--collapsed']"
          >
            <button
              type="button"
              class="roster-card__header"
              :aria-expanded="activeRoster === 'personal'"
              @click="setActiveRoster('personal')"
            >
              <div>
                <p class="eyebrow">Personal characters</p>
                <h2>Roster</h2>
                <p class="muted small roster-card__hint">
                  Keep your personal characters separate. They stay disabled until you check them.
                </p>
              </div>
              <div class="roster-card__status">
                <span class="roster-card__chevron" aria-hidden="true">
                  {{ activeRoster === 'personal' ? '▾' : '▸' }}
                </span>
              </div>
            </button>
            <div v-show="activeRoster === 'personal'" class="roster-card__body">
              <div class="roster-card__controls" v-if="personalRoster.length">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="setRosterSelection('personal', !allPersonalSelected)"
                >
                  {{ allPersonalSelected ? 'Disable all' : 'Enable all' }}
                </button>
              </div>
              <form
                v-if="canManagePersonal"
                class="add-bank-character"
                @submit.prevent="addCharacter(true)"
              >
                <input
                  v-model="newPersonalCharacterName"
                  type="text"
                  class="input"
                  name="personal-character"
                  placeholder="e.g. Altcollector"
                  :disabled="addingCharacter"
                />
                <button
                  class="btn btn--secondary"
                  type="submit"
                  :disabled="addingCharacter || !newPersonalCharacterName.trim().length"
                >
                  {{ addingCharacter ? 'Adding…' : 'Add character' }}
                </button>
              </form>

              <ul class="bank-character-list">
                <li
                  v-for="character in personalRoster"
                  :key="character.id"
                  class="bank-character"
                >
                  <label class="bank-character__meta">
                    <input
                      type="checkbox"
                      :checked="isCharacterSelected(character.name, true)"
                      @change="toggleCharacterSelection(character.name, true)"
                      class="bank-character__checkbox"
                    />
                    <strong>{{ character.name }}</strong>
                    <span
                      :class="[
                        'bank-character__status',
                        character.foundInEq ? 'bank-character__status--ok' : 'bank-character__status--warn'
                      ]"
                    >
                      {{ character.foundInEq ? 'Found in EQ' : 'Not found' }}
                    </span>
                  </label>
                  <button
                    v-if="canManagePersonal"
                    class="icon-button"
                    :disabled="removingId === character.id"
                    @click="removeCharacter(character.id)"
                    :aria-label="`Remove ${character.name}`"
                  >
                    <span class="icon-button__glyph" aria-hidden="true">🗑️</span>
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <div v-if="missingCount > 0" class="alert alert--warning">
          <p class="alert__title">Missing characters</p>
          <p class="alert__body">
            {{ missingCount }} tracked character{{ missingCount === 1 ? '' : 's' }} were not found
            in the EQ database. Double-check spelling or recent renames.
          </p>
        </div>
      </aside>

      <main class="guild-bank__main">
        <div class="guild-bank__filters">
          <div class="search-field search-field--hero">
            <span class="search-field__icon" aria-hidden="true">🔎</span>
            <input
              v-model="searchQuery"
              type="search"
              class="input input--search input--hero"
              placeholder="Search every bank item by name or holder"
            />
          </div>
        </div>

        <div v-if="snapshotError" class="alert alert--danger">
          <p class="alert__title">Unable to load guild bank</p>
          <p class="alert__body">{{ snapshotError }}</p>
        </div>

        <div v-else-if="loadingSnapshot && groupedItems.length === 0" class="guild-bank__empty">
          <div class="skeleton skeleton--headline"></div>
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </div>

        <div v-else-if="groupedItems.length === 0" class="guild-bank__empty">
          <p class="muted">No items discovered yet.</p>
          <p class="muted small">Add bank characters and refresh to pull inventories from EQ.</p>
        </div>

        <div v-if="totalPages > 1" class="guild-bank__pagination guild-bank__pagination--top">
          <button class="pagination__button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">
            Previous
          </button>
          <span class="pagination__label">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button class="pagination__button" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)">
            Next
          </button>
        </div>

        <ul class="guild-bank__list guild-bank__list--grid">
          <li
            v-for="item in pagedItems"
            :key="item.key"
            class="guild-bank-item"

          >
            <div class="guild-bank-item__header">
              <div class="guild-bank-item__icon" :class="{ 'guild-bank-item__icon--placeholder': !item.itemIconId }">
                <img
                  v-if="item.itemIconId"
                  :src="getLootIconSrc(item.itemIconId)"
                  :alt="`${item.itemName} icon`"
                  loading="lazy"
                />
                <span v-else>?</span>
              </div>
              <strong class="guild-bank-item__name">{{ item.itemName }}</strong>
            </div>
            <div class="guild-bank-item__details">
              <div class="guild-bank-item__meta">
                <span class="pill pill--quantity">×{{ item.totalQuantity }}</span>
                <span
                  v-for="loc in item.locations"
                  :key="`${item.key}-${loc}`"
                  class="pill pill--location"
                >
                  {{ loc }}
                </span>
                <a
                  v-if="item.itemId"
                  class="pill pill--link pill--link-button"
                  :href="`https://alla.clumsysworld.com/?a=item&id=${item.itemId}`"
                  target="_blank"
                  rel="noreferrer"
                  title="View on Alla"
                  @click.stop
                >
                  <span aria-hidden="true">🔗</span>
                  <span>Alla</span>
                </a>
                <button
                  v-if="item.guildQuantity > 0"
                  class="icon-button icon-button--cart-floating"
                  type="button"
                  :aria-label="`Add ${item.itemName} to cart`"
                  title="Add to cart"
                  @click.stop="cartHasItem(item.key) ? removeCartItem(item.key) : openRequestModal(item)"
                  :class="{ 'icon-button--cart-floating--active': cartHasItem(item.key) }"
                >
                  <span class="cart-floating__icon">🛒</span>
                  <span v-if="cartHasItem(item.key)" class="cart-floating__icon cart-floating__icon--hover">🗑️</span>
                </button>
              </div>
              <div class="guild-bank-item__owners">
                <span
                  v-for="owner in visibleOwners(item)"
                  :key="`${owner.characterName}-${owner.locationLabel}`"
                  class="owner-chip owner-chip--inline owner-chip--truncate"
                  @click.stop="openInventoryModal(item, owner.characterName)"
                  role="button"
                  tabindex="0"
                  style="cursor: pointer"
                >
                  {{ owner.characterName }} ({{ owner.locationLabel }}) · ×{{ owner.totalQuantity }}
                </span>
                <button
                  v-if="ownerOverflow(item)"
                  type="button"
                  class="owner-more-button"
                  @click.stop="openOwnerModal(item)"
                  :title="`${ownerOverflowCount(item)} more source${ownerOverflowCount(item) === 1 ? '' : 's'}`"
                >
                  +
                </button>
              </div>
            </div>
          </li>
        </ul>
        <div v-if="totalPages > 1" class="guild-bank__pagination">
          <button class="pagination__button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">
            Previous
          </button>
          <span class="pagination__label">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button class="pagination__button" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)">
            Next
          </button>
        </div>
      </main>
    </div>

    <div v-if="ownerModal.open && ownerModal.item" class="modal-backdrop" @click.self="closeOwnerModal">
      <div class="modal owner-modal">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Item holders</p>
            <h3>{{ ownerModal.item.itemName }}</h3>
          </div>
          <button type="button" class="icon-button" @click="closeOwnerModal" aria-label="Close">
            <span class="icon-button__glyph">×</span>
          </button>
        </header>
        <div class="owner-modal__body">
          <ul class="owner-modal__list">
            <li v-for="owner in ownerModal.item.ownerSummaries" :key="`${owner.characterName}-${owner.locationLabel}`">
              <span class="owner-chip owner-chip--inline">
                {{ owner.characterName }} ({{ owner.locationLabel }}) · ×{{ owner.totalQuantity }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      v-if="inventoryModal.open && inventoryModal.item"
      class="modal-backdrop modal-backdrop--top"
      @click.self="closeInventoryModal"
    >
      <div class="modal inventory-modal">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Item location</p>
            <h3>{{ inventoryPlacementGroups[0]?.characterName || inventoryModal.item.itemName }}</h3>
          </div>
          <button class="icon-button" type="button" @click="closeInventoryModal" aria-label="Close">
            ×
          </button>
        </header>
        <div class="inventory-modal__body">
          <p class="muted small">
            EQ-style layout highlights the slots where this item sits. Bag contents show the parent bag and exact pocket.
          </p>
          <div v-for="placement in inventoryPlacementGroups" :key="placement.characterName" class="inventory-visual">
            <div class="eq-window">
              <div class="eq-window__header">
                <div class="eq-window__title">
                  <span class="eq-window__dot"></span>
                  <strong>{{ placement.characterName }}</strong>
                  <span class="eq-window__subtitle">
                    {{ placement.isPersonal ? 'Personal character' : 'Guild bank character' }}
                  </span>
                </div>
                <span class="eq-window__badge">Inventory</span>
              </div>
              <div class="eq-window__content">
                <div class="eq-main-container">
                  <div class="eq-paperdoll-layout">
                    <div class="eq-paperdoll-grid">
                      <div
                        class="eq-class-icon"
                        :style="{ backgroundImage: `url(${classIconForCharacter(placement.characterName)})` }"
                      ></div>
                      <div
                        v-for="slot in wornSlotsUi"
                        :key="slot.slotId"
                        class="eq-slot eq-slot--worn"
                        :class="[
                          `eq-slot--${slot.key}`,
                          { 'eq-slot--active': placement.highlights.worn.includes(slot.slotId) }
                        ]"
                        :title="characterItemsMap.get(slot.slotId)?.itemName || slot.label"
                      >
                        <span v-if="!characterItemsMap.get(slot.slotId)" class="eq-slot__label">{{ slot.shortLabel }}</span>
                        <img
                          v-if="characterItemsMap.get(slot.slotId)?.itemIconId"
                          :src="getLootIconSrc(characterItemsMap.get(slot.slotId)!.itemIconId!)"
                          class="eq-slot__icon"
                          alt=""
                        />
                        <div v-else-if="characterItemsMap.get(slot.slotId)" class="eq-slot__icon eq-slot__icon--placeholder">?</div>
                        <span class="eq-slot__id">#{{ slot.slotId }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="eq-inventory-section">
                    <section class="inventory-visual__panel inventory-visual__panel--vertical">
                      <div class="eq-general-grid eq-general-grid--vertical">
                        <div
                        v-for="slot in generalSlotsUi"
                        :key="slot.slotId"
                        class="eq-slot eq-slot--bag"
                        :class="{
                          'eq-slot--active': activeGeneralBagSlotId === slot.slotId,
                          'eq-slot--clickable': (characterItemsMap.get(slot.slotId)?.bagSlots || 0) > 0,
                          'eq-slot--has-item': !!characterItemsMap.get(slot.slotId)
                        }"
                        :title="characterItemsMap.get(slot.slotId)?.itemName || slot.label"
                        @click="setActiveBag(placement, slot.slotId)"
                      >
                        <div v-if="!characterItemsMap.get(slot.slotId)" class="eq-slot__label">{{ slot.label }}</div>
                        <img
                          v-if="characterItemsMap.get(slot.slotId)?.itemIconId"
                          :src="getLootIconSrc(characterItemsMap.get(slot.slotId)!.itemIconId!)"
                          class="eq-slot__icon"
                          alt=""
                        />
                        <div v-else-if="characterItemsMap.get(slot.slotId)" class="eq-slot__icon eq-slot__icon--placeholder">?</div>
                        <div class="eq-slot__bag"></div>
                      </div>
                    </div>
                  </section>
                  
                  <section v-if="activeGeneralBagSlotId && isGeneralBagSlot(activeGeneralBagSlotId)" class="inventory-visual__panel inventory-visual__panel--bag-contents">
                    <div class="eq-panel__header">{{ characterItemsMap.get(activeGeneralBagSlotId)?.itemName || 'Bag' }}</div>
                    <div class="eq-bag-contents-grid">
                      <div
                        v-for="slot in activeGeneralBagItems"
                        :key="slot.slotId"
                        class="eq-slot eq-slot--bag-item"
                        :title="slot.item?.itemName"
                      >
                        <img
                          v-if="slot.item?.itemIconId"
                          :src="getLootIconSrc(slot.item.itemIconId)"
                          class="eq-slot__icon"
                          alt=""
                        />
                        <div v-else-if="slot.item" class="eq-slot__icon eq-slot__icon--placeholder">?</div>
                        <span class="eq-slot__count" v-if="(slot.item?.charges || 1) > 1">{{ slot.item?.charges }}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            </div>

            <div class="eq-window eq-window--bank">
              <div class="eq-window__header">
                <div class="eq-window__title">
                  <span class="eq-window__dot"></span>
                  <strong>{{ placement.characterName }}</strong>
                  <span class="eq-window__subtitle">Bank</span>
                </div>
                <span class="eq-window__badge">Bank</span>
              </div>
              <div class="eq-window__content eq-window__content--bank">
                <section class="inventory-visual__panel inventory-visual__panel--bank">
                  <div class="eq-panel__header">Bank Slots</div>
                  <div class="eq-bank-grid">
                    <div
                      v-for="slot in bankSlotsUi"
                      :key="slot.slotId"
                      class="eq-slot eq-slot--bag eq-slot--bank"
                      :class="{
                        'eq-slot--active': activeBankBagSlotId === slot.slotId,
                        'eq-slot--clickable': (characterItemsMap.get(slot.slotId)?.bagSlots || 0) > 0,
                        'eq-slot--has-item': !!characterItemsMap.get(slot.slotId)
                      }"
                      :title="characterItemsMap.get(slot.slotId)?.itemName || slot.label"
                      @click="setActiveBag(placement, slot.slotId)"
                    >
                      <div v-if="!characterItemsMap.get(slot.slotId)" class="eq-slot__label">{{ slot.label }}</div>
                      <img
                        v-if="characterItemsMap.get(slot.slotId)?.itemIconId"
                        :src="getLootIconSrc(characterItemsMap.get(slot.slotId)!.itemIconId!)"
                        class="eq-slot__icon"
                        alt=""
                      />
                      <div v-else-if="characterItemsMap.get(slot.slotId)" class="eq-slot__icon eq-slot__icon--placeholder">?</div>
                    </div>
                  </div>
                </section>

                <section v-if="activeBankBagSlotId && isBankBagSlot(activeBankBagSlotId)" class="inventory-visual__panel inventory-visual__panel--bag-contents">
                  <div class="eq-panel__header">{{ characterItemsMap.get(activeBankBagSlotId)?.itemName || 'Bag' }}</div>
                  <div class="eq-bag-contents-grid">
                    <div
                      v-for="slot in activeBankBagItems"
                      :key="slot.slotId"
                      class="eq-slot eq-slot--bag-item"
                      :title="slot.item?.itemName"
                    >
                      <img
                        v-if="slot.item?.itemIconId"
                        :src="getLootIconSrc(slot.item.itemIconId)"
                        class="eq-slot__icon"
                        alt=""
                      />
                      <div v-else-if="slot.item" class="eq-slot__icon eq-slot__icon--placeholder">?</div>
                      <span class="eq-slot__count" v-if="(slot.item?.charges || 1) > 1">{{ slot.item?.charges }}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <ul class="inventory-visual__placements">
              <li
                v-for="placementDetail in placement.placements"
                :key="placementDetail.label + placementDetail.locationLabel + placementDetail.quantity"
              >
                <strong>{{ placementDetail.label }}</strong>
                <span class="muted small"> · {{ placementDetail.locationLabel }} · ×{{ placementDetail.quantity }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showRequestModal && requestModalItem"
      class="modal-backdrop"
      @click.self="closeRequestModal"
    >
      <div class="modal request-modal" :key="requestModalItem?.itemKey">
        <header class="modal__header">
          <div class="request-modal__title">
            <div class="request-modal__icon" :class="{ 'request-modal__icon--placeholder': !requestModalItem.itemIconId }">
              <img
                v-if="requestModalItem.itemIconId"
                :src="getLootIconSrc(requestModalItem.itemIconId)"
                :alt="`${requestModalItem.itemName} icon`"
                loading="lazy"
              />
              <span v-else>?</span>
            </div>
            <div class="request-modal__text">
              <p class="eyebrow">Add to Cart</p>
              <h3>{{ requestModalItem.itemName }}</h3>
            </div>
          </div>
          <button class="icon-button" type="button" @click="closeRequestModal" aria-label="Close">
            ×
          </button>
        </header>
        <div class="request-modal__body">
          <div class="request-modal__quantity">
            <label>
              Quantity
              <span class="request-modal__badge">Max {{ requestModalItem.maxQuantity }}</span>
            </label>
            <input
              v-model.number="requestQuantity"
              type="number"
              min="1"
              :max="requestModalItem.maxQuantity"
              class="input"
            />
            <input
              type="range"
              :min="requestModalItem.maxQuantity === 1 ? 0 : 1"
              :max="requestModalItem.maxQuantity === 1 ? 1 : requestModalItem.maxQuantity"
              step="1"
              :value="Math.min(requestQuantity, requestModalItem.maxQuantity)"
              @input="onRangeChange"
            />
          </div>
          <div class="request-modal__sources">
            <p class="muted small">Available from:</p>
            <ul>
              <li v-for="src in requestModalItem.sources" :key="`${src.characterName}-${src.location}`">
                {{ src.characterName }} ({{ src.location }}) · ×{{ src.quantity }}
              </li>
            </ul>
          </div>
          <p v-if="requestQuantity > requestModalItem.maxQuantity" class="status status--error">
            Quantity cannot exceed available.
          </p>
        </div>
        <footer class="modal__footer">
          <button class="btn btn--secondary" type="button" @click="closeRequestModal">Cancel</button>
          <button
            class="btn"
            type="button"
            :disabled="requestQuantity < 1 || requestQuantity > requestModalItem.maxQuantity"
            @click="handleRequestModalConfirm"
          >
            Add to Cart
          </button>
        </footer>
      </div>
    </div>

    <div v-if="cartConfirmOpen" class="modal-backdrop modal-backdrop--top" @click.self="cartConfirmOpen = false">
      <div class="modal confirm-modal">
        <header class="modal__header">
          <div>
            <p class="eyebrow">Confirm request</p>
            <h3>Submit Request?</h3>
          </div>
          <button class="icon-button" type="button" @click="cartConfirmOpen = false" aria-label="Close">
            ×
          </button>
        </header>
        <div class="confirm-modal__body">
          Confirm that you want to send this request for items from the guild bank to guild Officers
          for consideration. This request will send a notification to guild leadership with your list
          of requested items.
        </div>
        <footer class="modal__footer confirm-modal__footer">
          <button class="btn btn--secondary" type="button" @click="cartConfirmOpen = false">
            Cancel
          </button>
          <button class="btn" type="button" :disabled="submittingCart" @click="submitCart(true)">
            {{ submittingCart ? 'Requesting…' : 'Send Request' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="showCart" class="cart-overlay" @click.self="toggleCart">
      <div class="cart-panel">
        <header class="cart-panel__header">
          <h3>Shopping Cart</h3>
          <button class="icon-button" type="button" @click="toggleCart" aria-label="Close cart">×</button>
        </header>
        <p v-if="cartDistinct === 0" class="muted small">Your cart is empty.</p>
        <ul v-else class="cart-list">
          <li v-for="entry in aggregatedCartSources" :key="entry.itemKey" class="cart-item">
            <div class="cart-item__info">
              <div class="guild-bank-item__icon" :class="{ 'guild-bank-item__icon--placeholder': !entry.itemIconId }">
                <img
                  v-if="entry.itemIconId"
                  :src="getLootIconSrc(entry.itemIconId)"
                  :alt="`${entry.itemName} icon`"
                  loading="lazy"
                />
                <span v-else>?</span>
              </div>
              <div>
                <strong>{{ entry.itemName }}</strong>
                <p class="muted small">Requested: ×{{ entry.quantity }} (max {{ entry.maxQuantity }})</p>
                <ul class="cart-item__sources">
                  <li
                    v-for="src in displaySources(entry)"
                    :key="`${entry.itemKey}-${src.characterName}-${src.location}`"
                  >
                    {{ src.characterName }} ({{ src.location }}) · ×{{ src.quantity }}
                  </li>
                </ul>
              </div>
            </div>
            <div class="cart-item__actions">
              <input
                :value="entry.quantity"
                type="number"
                min="1"
                :max="entry.maxQuantity"
                @input="(e) => updateCartEntry({ ...entry, quantity: clampQuantity(Number((e.target as HTMLInputElement).value), entry.maxQuantity) })"
              />
              <button class="icon-button icon-button--danger" type="button" @click="removeCartItem(entry.itemKey)" aria-label="Remove item">
                🗑️
              </button>
            </div>
          </li>
        </ul>
        <footer class="cart-panel__footer">
          <div class="cart-summary">
            <span>{{ cartDistinct }} item{{ cartDistinct === 1 ? '' : 's' }} ({{ cartCount }} total)</span>
          </div>
          <div class="cart-actions">
            <button class="btn btn--secondary" type="button" @click="resetCart" :disabled="cartDistinct === 0">
              Clear Cart
            </button>
            <button class="btn" type="button" :disabled="cartDistinct === 0 || submittingCart" @click="cartConfirmOpen = true">
              {{ submittingCart ? 'Requesting…' : 'Request All Items' }}
            </button>
          </div>
          <p v-if="cartError" class="status status--error">{{ cartError }}</p>
          <p v-if="cartSuccess" class="status status--success">{{ cartSuccess }}</p>
        </footer>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, shallowRef } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { api, type GuildBankSnapshot, type GuildBankItem } from '../services/api';
import { getCharacterClassIcon, type CharacterClass, type GuildRole } from '../services/types';
import { getLootIconSrc } from '../utils/itemIcons';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_REASONABLE_QUANTITY = 1000;

const route = useRoute();
const router = useRouter();

const guildId = computed(() => route.params.guildId as string);

const guildName = ref<string>('');
const guildRole = ref<GuildRole | null>(null);

const snapshot = ref<GuildBankSnapshot | null>(null);


const loadingSnapshot = ref(false);
const snapshotError = ref<string | null>(null);
const lastFetchedAt = ref<number | null>(null);

type RosterType = 'guild' | 'personal';

function toBooleanFlag(value: any): boolean {
  return value === true || value === 1 || value === '1';
}

const activeRoster = ref<RosterType>('guild');
const newGuildCharacterName = ref('');
const newPersonalCharacterName = ref('');
const addingCharacter = ref(false);
const removingId = ref<string | null>(null);
const restoringNames = ref(false);
const cachedNames = ref<Array<{ name: string; isPersonal: boolean }>>([]);

const searchQuery = ref('');
const selectedGuild = ref<Set<string>>(new Set());
const selectedPersonal = ref<Set<string>>(new Set());
const hasUserSelection = ref(false);

const now = ref(Date.now());
let timer: number | null = null;

const canManageBank = computed(() =>
  guildRole.value ? ['LEADER', 'OFFICER'].includes(guildRole.value) : false
);
const canManagePersonal = computed(() => !!guildRole.value);

const cacheKey = computed(() => `guild-bank:${guildId.value}`);
const cacheNamesKey = computed(() => `guild-bank:names:${guildId.value}:v1`);
const autoRestoreAttempted = ref(false);
const initialFetchDone = ref(false);

const WORN_SLOT_LABELS = [
  'Charm', // 0
  'Ear 1',
  'Head',
  'Face',
  'Ear 2',
  'Neck',
  'Shoulders',
  'Arms',
  'Back',
  'Wrist 1',
  'Wrist 2',
  'Range',
  'Hands',
  'Primary',
  'Secondary',
  'Finger 1',
  'Finger 2',
  'Chest',
  'Legs',
  'Feet',
  'Waist',
  'Power Source',
  'Ammo'
];

const WORN_SLOT_KEYS = [
  'charm',
  'ear1',
  'head',
  'face',
  'ear2',
  'neck',
  'shoulders',
  'arms',
  'back',
  'wrist1',
  'wrist2',
  'range',
  'hands',
  'primary',
  'secondary',
  'finger1',
  'finger2',
  'chest',
  'legs',
  'feet',
  'waist',
  'powersource',
  'ammo'
];

const WORN_SLOT_SHORT_LABELS = [
  'Charm', 'Ear1', 'Head', 'Face', 'Ear2', 'Neck', 'Shldr', 'Arms', 'Back', 'Wrst1', 'Wrst2',
  'Range', 'Hands', 'Prim', 'Sec', 'Fing1', 'Fing2', 'Chest', 'Legs', 'Feet', 'Waist', 'Power', 'Ammo'
];

const GENERAL_SLOT_IDS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]; // Updated to include 31, 32
const BAG_POCKET_INDICES = Array.from({ length: 10 }, (_, index) => index);
const BANK_SLOT_IDS = Array.from({ length: 24 }, (_, index) => 2000 + index);

const wornSlotsUi = [
  // Slots 1-22
  ...WORN_SLOT_LABELS.slice(1).map((label, index) => ({
    slotId: index + 1,
    label,
    shortLabel: WORN_SLOT_SHORT_LABELS[index + 1],
    key: WORN_SLOT_KEYS[index + 1]
  })),
  // Slot 0 (Charm)
  { slotId: 0, label: WORN_SLOT_LABELS[0], shortLabel: WORN_SLOT_SHORT_LABELS[0], key: WORN_SLOT_KEYS[0] }
];

const generalSlotsUi = GENERAL_SLOT_IDS.map((slotId, index) => ({
  slotId,
  label: `General ${index + 1}`
}));
const bankSlotsUi = BANK_SLOT_IDS.map((slotId, index) => ({
  slotId,
  label: `${index + 1}`
}));

type ResolvedSlotPlacement = {
  area: 'worn' | 'inventory' | 'inventoryBag' | 'bank' | 'bankBag' | 'unknown';
  slotId: number | null;
  slotLabel: string;
  parentSlotId?: number | null;
  parentLabel?: string;
  bagSlotIndex?: number | null;
};

function generalSlotLabel(slotId: number) {
  const idx = slotId - 22;
  return idx >= 1 ? `General ${idx}` : `General ${slotId}`;
}

function bankSlotLabel(slotId: number) {
  return `Bank ${slotId - 1999}`;
}

function resolveSlotPlacement(slotId: number | null): ResolvedSlotPlacement {
  if (typeof slotId !== 'number' || Number.isNaN(slotId)) {
    return { area: 'unknown', slotId: null, slotLabel: 'Unknown slot' };
  }

  if (slotId >= 0 && slotId < WORN_SLOT_LABELS.length) {
    return {
      area: 'worn',
      slotId,
      slotLabel: WORN_SLOT_LABELS[slotId]
    };
  }

  // General slots themselves (23-32)
  if (slotId >= GENERAL_SLOT_IDS[0] && slotId <= GENERAL_SLOT_IDS[GENERAL_SLOT_IDS.length - 1]) {
    return {
      area: 'inventory',
      slotId,
      slotLabel: generalSlotLabel(slotId)
    };
  }

  // Inventory bag slots (legacy Titanium ranges)
  if (slotId >= 251 && slotId <= 330) {
    const offset = slotId - 251;
    const bagIndex = Math.floor(offset / 10);
    const bagSlotIndex = offset % 10;
    const parentSlotId = 23 + bagIndex; // General slots start at 23
    if (GENERAL_SLOT_IDS.includes(parentSlotId)) {
      return {
        area: 'inventoryBag',
        slotId,
        slotLabel: `Bag slot ${bagSlotIndex + 1}`,
        parentSlotId,
        parentLabel: generalSlotLabel(parentSlotId),
        bagSlotIndex
      };
    }
  }
  if (slotId >= 262 && slotId <= 341) { // Another legacy range
    const offset = slotId - 262;
    const bagIndex = Math.floor(offset / 10);
    const bagSlotIndex = offset % 10;
    const parentSlotId = 23 + bagIndex;
    if (GENERAL_SLOT_IDS.includes(parentSlotId)) {
      return {
        area: 'inventoryBag',
        slotId,
        slotLabel: `Bag slot ${bagSlotIndex + 1}`,
        parentSlotId,
        parentLabel: generalSlotLabel(parentSlotId),
        bagSlotIndex
      };
    }
  }
  // Inventory bag slots (new ranges, 200 slots per bag)
  if (slotId >= 4010 && slotId <= 6009) {
    const offset = slotId - 4010;
    const bagIndex = Math.floor(offset / 200);
    const bagSlotIndex = offset % 200;
    const parentSlotId = 23 + bagIndex; // General slots start at 23
    if (GENERAL_SLOT_IDS.includes(parentSlotId)) {
      return {
        area: 'inventoryBag',
        slotId,
        slotLabel: `Bag slot ${bagSlotIndex + 1}`,
        parentSlotId,
        parentLabel: generalSlotLabel(parentSlotId),
        bagSlotIndex
      };
    }
  }

  if (slotId >= 2000 && slotId <= 2023) {
    return {
      area: 'bank',
      slotId,
      slotLabel: bankSlotLabel(slotId)
    };
  }

  if (slotId >= 2032 && slotId <= 2271) {
    const offset = slotId - 2032;
    const bagIndex = Math.floor(offset / 10);
    const bagSlotIndex = offset % 10;
    const parentSlotId = 2000 + bagIndex;
    if (parentSlotId >= 2000 && parentSlotId <= 2023) {
      return {
        area: 'bankBag',
        slotId,
        slotLabel: `Bag slot ${bagSlotIndex + 1}`,
        parentSlotId,
        parentLabel: bankSlotLabel(parentSlotId),
        bagSlotIndex
      };
    }
  }

  // Modern bank bag slots (200 slots per bag)
  if (slotId >= 6210 && slotId <= 11009) {
    const offset = slotId - 6210;
    const bagIndex = Math.floor(offset / 200);
    const bagSlotIndex = offset % 200;
    const parentSlotId = 2000 + bagIndex;
    if (parentSlotId >= 2000 && parentSlotId <= 2023) {
      return {
        area: 'bankBag',
        slotId,
        slotLabel: `Bag slot ${bagSlotIndex + 1}`,
        parentSlotId,
        parentLabel: bankSlotLabel(parentSlotId),
        bagSlotIndex
      };
    }
  }

  return { area: 'unknown', slotId, slotLabel: `Slot ${slotId}` };
}

function slotDisplayLabel(resolved: ResolvedSlotPlacement) {
  if (resolved.area === 'worn') {
    return `${resolved.slotLabel} (slot ${resolved.slotId})`;
  }
  if (resolved.area === 'inventory') {
    return `${resolved.slotLabel} (slot ${resolved.slotId})`;
  }
  if (resolved.area === 'inventoryBag' && resolved.parentLabel != null && resolved.bagSlotIndex != null) {
    return `${resolved.parentLabel} → Bag slot ${resolved.bagSlotIndex + 1} (slot ${resolved.slotId})`;
  }
  if (resolved.area === 'bank') {
    return `${resolved.slotLabel} (slot ${resolved.slotId})`;
  }
  if (resolved.area === 'bankBag' && resolved.parentLabel != null && resolved.bagSlotIndex != null) {
    return `${resolved.parentLabel} → Bag slot ${resolved.bagSlotIndex + 1} (slot ${resolved.slotId})`;
  }
  return resolved.slotLabel;
}

function aggregateItems(items: GuildBankItem[]) {
    const map = new Map<
        string,
        {
            key: string;
            itemId: number | null;
            itemName: string;
            itemIconId: number | null;
            totalQuantity: number;
            guildQuantity: number;
            owners: Array<{
                characterName: string;
                quantity: number;
                location: GuildBankItem['location'];
                locationLabel: string;
                isPersonal: boolean;
                slotId: number | null;
            }>;
            ownerSummaries: Map<
                string,
                { characterName: string; locationLabel: string; totalQuantity: number; isPersonal: boolean }
            >;
            locationSet: Set<string>;
            slotPlacements: Array<{
                characterName: string;
                location: GuildBankItem['location'];
                locationLabel: string;
                isPersonal: boolean;
                slotId: number | null;
                quantity: number;
            }>;
        }
    >();

    for (const entry of items) {
        const quantity = normalizeQuantity(entry.charges);
        const key = buildItemKey(entry.itemId ?? null, entry.itemName);
        const existing = map.get(key);
        const locationLabel =
            entry.location === 'WORN'
                ? 'Worn'
                : entry.location === 'BANK'
                    ? 'Bank'
                    : entry.location === 'CURSOR'
                        ? 'Cursor'
                        : 'Inventory';
        const isPersonal = (entry as any)?.isPersonal === true || (entry as any)?.isPersonal === 1;
        const slotId = typeof entry.slotId === 'number' ? entry.slotId : null;

        if (!existing) {
            map.set(key, {
                key,
                itemId: entry.itemId ?? null,
                itemName: entry.itemName,
                itemIconId: entry.itemIconId ?? null,
                totalQuantity: quantity,
                guildQuantity: isPersonal ? 0 : quantity,
                owners: [
                    {
                        characterName: entry.characterName,
                        quantity,
                        location: entry.location,
                        locationLabel,
                        isPersonal,
                        slotId
                    }
                ],
                ownerSummaries: new Map([
                    [
                        `${entry.characterName}-${locationLabel}`,
                        {
                            characterName: entry.characterName,
                            locationLabel,
                            totalQuantity: quantity,
                            isPersonal
                        }
                    ]
                ]),
                locationSet: new Set([locationLabel]),
                slotPlacements: [
                    {
                        characterName: entry.characterName,
                        location: entry.location,
                        locationLabel,
                        isPersonal,
                        slotId,
                        quantity
                    }
                ]
            });
        } else {
            existing.totalQuantity += quantity;
            if (!isPersonal) {
                existing.guildQuantity += quantity;
            }
            existing.locationSet.add(locationLabel);
            existing.owners.push({
                characterName: entry.characterName,
                quantity,
                location: entry.location,
                locationLabel,
                isPersonal,
                slotId
            });
            const keyOwner = `${entry.characterName}-${locationLabel}`;
            const summary = existing.ownerSummaries.get(keyOwner);
            if (summary) {
                summary.totalQuantity += quantity;
            } else {
                existing.ownerSummaries.set(keyOwner, {
                    characterName: entry.characterName,
                    locationLabel,
                    totalQuantity: quantity,
                    isPersonal
                });
            }
            existing.slotPlacements.push({
                characterName: entry.characterName,
                location: entry.location,
                locationLabel,
                isPersonal,
                slotId,
                quantity
            });
        }
    }

    return Array.from(map.values())
        .map(({ locationSet, ownerSummaries, ...rest }) => ({
            ...rest,
            locations: Array.from(locationSet),
            ownerSummaries: Array.from(ownerSummaries.values()),
            sources: Array.from(ownerSummaries.values()).map((owner) => ({
                characterName: owner.characterName,
                location: owner.locationLabel,
                quantity: owner.totalQuantity,
                isPersonal: owner.isPersonal
            }))
        }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

const groupedItems = computed(() => {
  if (!snapshot.value) {
    return [];
  }

  const characterPersonalMap = new Map<string, boolean>();
  snapshot.value.characters.forEach((entry) => {
    characterPersonalMap.set(entry.name.toLowerCase(), toBooleanFlag(entry.isPersonal));
  });

  const allowed = new Set([...selectedGuild.value, ...selectedPersonal.value]);

  const filteredItems =
    allowed.size === 0
      ? []
      : snapshot.value.items
          .filter((item) => allowed.has(item.characterName.toLowerCase()))
          .map((item) => ({
            ...item,
            isPersonal: characterPersonalMap.get(item.characterName.toLowerCase()) ?? false
          }));

  const aggregated = aggregateItems(filteredItems);
  const normalizedQuery = searchQuery.value.trim().toLowerCase();
  if (!normalizedQuery) {
    return aggregated;
  }
  return aggregated.filter(
    (item) =>
      item.itemName.toLowerCase().includes(normalizedQuery) ||
      item.ownerSummaries.some((owner) =>
        owner.characterName.toLowerCase().includes(normalizedQuery)
      )
  );
});

const totalItemCount = computed(() =>
  groupedItems.value.reduce((sum, item) => sum + item.totalQuantity, 0)
);

const currentPage = ref(1);
const pageSize = 18;

const totalPages = computed(() =>
  Math.max(1, Math.ceil(groupedItems.value.length / pageSize))
);

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return groupedItems.value.slice(start, start + pageSize);
});

watch(
  () => groupedItems.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
  }
);

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

const missingCachedNames = computed(() => {
  if (!snapshot.value || cachedNames.value.length === 0) {
    return [];
  }
  const current = new Set(
    snapshot.value.characters.map((entry) =>
      characterKey({ name: entry.name, isPersonal: toBooleanFlag(entry.isPersonal) })
    )
  );
  return cachedNames.value.filter((entry) => !current.has(characterKey(entry)));
});

async function restoreMissingCachedCharacters() {
  if (!missingCachedNames.value.length || restoringNames.value) {
    return;
  }
  restoringNames.value = true;
  snapshotError.value = null;
  try {
    for (const entry of missingCachedNames.value) {
      await api.addGuildBankCharacter(guildId.value, entry.name, {
        isPersonal: entry.isPersonal
      });
    }
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value =
      error?.response?.data?.message ?? 'Unable to restore missing bank characters.';
  } finally {
    restoringNames.value = false;
  }
}

const OWNER_LIMIT = 2;

function visibleOwners(item: typeof groupedItems.value[number]) {
  return item.ownerSummaries.slice(0, OWNER_LIMIT);
}

function ownerOverflow(item: typeof groupedItems.value[number]) {
  return item.ownerSummaries.length > OWNER_LIMIT;
}

function ownerOverflowCount(item: typeof groupedItems.value[number]) {
  return Math.max(0, item.ownerSummaries.length - OWNER_LIMIT);
}

const fallbackClassIcon = '/class-icons/Warrioricon.PNG.webp';

const inventoryModal = ref<{
  item: typeof groupedItems.value[number] | null;
  open: boolean;
  selectedCharacter: string | null;
}>({
  item: null,
  open: false,
  selectedCharacter: null
});

function openInventoryModal(
  item: typeof groupedItems.value[number],
  characterName?: string
) {
  inventoryModal.value = {
    item,
    open: true,
    selectedCharacter: characterName ?? null
  };
}

function closeInventoryModal() {
  inventoryModal.value = { open: false, item: null, selectedCharacter: null };
}

const ownerModal = ref<{
  item: typeof groupedItems.value[number] | null;
  open: boolean;
}>({
  item: null,
  open: false
});

function openOwnerModal(item: typeof groupedItems.value[number]) {
  ownerModal.value = { item, open: true };
}

function closeOwnerModal() {
  ownerModal.value = { item: null, open: false };
}

const characterItemsMap = computed(() => {
  const map = new Map<number, GuildBankItem>();
  const targetCharacter = inventoryModal.value?.selectedCharacter?.toLowerCase();

  if (!targetCharacter || !snapshot.value?.items) {
    return map;
  }

  for (const item of snapshot.value.items) {
    if (item.characterName.toLowerCase() === targetCharacter && item.slotId != null) {
      map.set(item.slotId, item);
    }
  }
  return map;
});

const bagContentsMap = computed(() => {
  const map = new Map<number, Array<{ item: GuildBankItem; bagSlotIndex: number }>>();
  for (const item of characterItemsMap.value.values()) {
    if (item.slotId == null) continue;
    const resolved = resolveSlotPlacement(item.slotId);
    if (resolved.parentSlotId != null && resolved.bagSlotIndex != null) {
      const existing = map.get(resolved.parentSlotId) || [];
      existing.push({ item, bagSlotIndex: resolved.bagSlotIndex });
      map.set(resolved.parentSlotId, existing);
    }
  }
  return map;
});

const activeGeneralBagSlotId = ref<number | null>(null);
const activeBankBagSlotId = ref<number | null>(null);

const setActiveBag = (placement: any, slotId: number) => {
  if (isGeneralBagSlot(slotId)) {
    if (activeGeneralBagSlotId.value === slotId) {
      activeGeneralBagSlotId.value = null;
    } else {
      activeGeneralBagSlotId.value = slotId;
    }
  } else if (isBankBagSlot(slotId)) {
    if (activeBankBagSlotId.value === slotId) {
      activeBankBagSlotId.value = null;
    } else {
      activeBankBagSlotId.value = slotId;
    }
  }
};

const activeGeneralBagItems = shallowRef<Array<{ slotId: number; item: GuildBankItem | null }>>([]);
const activeBankBagItems = shallowRef<Array<{ slotId: number; item: GuildBankItem | null }>>([]);

let rafIdGeneral: number | null = null;
let rafIdBank: number | null = null;

watch(
  [activeGeneralBagSlotId, () => inventoryModal.value?.selectedCharacter],
  ([newSlotId, newChar]) => {
    if (rafIdGeneral) cancelAnimationFrame(rafIdGeneral);
    
    if (!newSlotId || !newChar) {
      activeGeneralBagItems.value = [];
      return;
    }

    rafIdGeneral = requestAnimationFrame(() => {
      const bagContainerItem = characterItemsMap.value.get(newSlotId);
      const bagSize = bagContainerItem?.bagSlots || 10;

      const bagItems = bagContentsMap.value.get(newSlotId) || [];
      
      const bagItemsMap = new Map<number, GuildBankItem>();
      for (const entry of bagItems) {
        bagItemsMap.set(entry.bagSlotIndex, entry.item);
      }

      const slots = [];
      for (let i = 0; i < bagSize; i++) {
        slots.push({
          slotId: i,
          item: bagItemsMap.get(i) || null
        });
      }
      activeGeneralBagItems.value = slots;
      rafIdGeneral = null;
    });
  },
  { immediate: true }
);

watch(
  [activeBankBagSlotId, () => inventoryModal.value?.selectedCharacter],
  ([newSlotId, newChar]) => {
    if (rafIdBank) cancelAnimationFrame(rafIdBank);
    
    if (!newSlotId || !newChar) {
      activeBankBagItems.value = [];
      return;
    }

    rafIdBank = requestAnimationFrame(() => {
      const bagContainerItem = characterItemsMap.value.get(newSlotId);
      const bagSize = bagContainerItem?.bagSlots || 10;

      const bagItems = bagContentsMap.value.get(newSlotId) || [];
      
      const bagItemsMap = new Map<number, GuildBankItem>();
      for (const entry of bagItems) {
        bagItemsMap.set(entry.bagSlotIndex, entry.item);
      }

      const slots = [];
      for (let i = 0; i < bagSize; i++) {
        slots.push({
          slotId: i,
          item: bagItemsMap.get(i) || null
        });
      }
      activeBankBagItems.value = slots;
      rafIdBank = null;
    });
  },
  { immediate: true }
);


function isGeneralBagSlot(slotId: number) {
  return GENERAL_SLOT_IDS.includes(slotId);
}

function isBankBagSlot(slotId: number) {
  return BANK_SLOT_IDS.includes(slotId);
}

function isCharacterSelected(name: string, isPersonal: boolean): boolean {
  const key = name.toLowerCase();
  return isPersonal
    ? selectedPersonal.value.has(key)
    : selectedGuild.value.has(key);
}

function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey.value);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { snapshot: GuildBankSnapshot; fetchedAt: number };
    if (!parsed || !parsed.snapshot || !parsed.fetchedAt) {
      return null;
    }
    const normalizedCharacters = Array.isArray(parsed.snapshot?.characters)
      ? parsed.snapshot.characters.map((entry: any) => ({
          ...entry,
          isPersonal: toBooleanFlag(entry?.isPersonal)
        }))
      : [];
    return {
      snapshot: {
        ...parsed.snapshot,
        characters: normalizedCharacters
      },
      fetchedAt: parsed.fetchedAt
    };
  } catch {
    return null;
  }
}

function saveCache(currentSnapshot: GuildBankSnapshot) {
  try {
    localStorage.setItem(
      cacheKey.value,
      JSON.stringify({ snapshot: currentSnapshot, fetchedAt: Date.now() })
    );
  } catch {
    // ignore cache errors
  }
}

function loadCachedNames() {
  try {
    const raw = localStorage.getItem(cacheNamesKey.value);
    if (!raw) {
      cachedNames.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedNames.value = [];
      return;
    }
    cachedNames.value = parsed
      .map((entry: any) => {
        if (typeof entry === 'string') {
          return { name: entry, isPersonal: false };
        }
        if (entry && typeof entry.name === 'string') {
          return { name: entry.name, isPersonal: toBooleanFlag(entry.isPersonal) };
        }
        return null;
      })
      .filter((entry): entry is { name: string; isPersonal: boolean } => Boolean(entry));
  } catch {
    cachedNames.value = [];
  }
}

function saveCachedNames(
  names: Array<{ name: string; isPersonal: boolean }>
) {
  const merged = mergeNamesCaseInsensitive(names);
  cachedNames.value = [...merged];
  try {
    localStorage.setItem(cacheNamesKey.value, JSON.stringify(merged));
  } catch {
    // ignore cache errors
  }
}

function characterKey(entry: { name: string; isPersonal: boolean }): string {
  return entry.name.toLowerCase();
}

function mergeNamesCaseInsensitive(
  names: Array<{ name: string; isPersonal: boolean }>
): Array<{ name: string; isPersonal: boolean }> {
  const seen = new Set<string>();
  const merged: Array<{ name: string; isPersonal: boolean }> = [];
  for (const name of names) {
    const key = characterKey(name);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  return merged;
}

function diffNamesCaseInsensitive(
  full: Array<{ name: string; isPersonal: boolean }>,
  subset: Array<{ name: string; isPersonal: boolean }>
): Array<{ name: string; isPersonal: boolean }> {
  const subsetKeys = new Set(subset.map((entry) => characterKey(entry)));
  return full.filter((entry) => !subsetKeys.has(characterKey(entry)));
}

const canRefreshNow = computed(() => {
  if (!lastFetchedAt.value) {
    return true;
  }
  return now.value - lastFetchedAt.value >= FIVE_MINUTES_MS;
});

const refreshCountdownMs = computed(() => {
  if (!lastFetchedAt.value) {
    return 0;
  }
  return Math.max(0, FIVE_MINUTES_MS - (now.value - lastFetchedAt.value));
});

const refreshCountdownLabel = computed(() => {
  if (canRefreshNow.value) {
    return 'available now';
  }
  const minutes = Math.floor(refreshCountdownMs.value / 60000);
  const seconds = Math.floor((refreshCountdownMs.value % 60000) / 1000);
  if (minutes > 0) {
    return `in ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `in ${seconds}s`;
});

const lastRefreshLabel = computed(() => {
  if (!lastFetchedAt.value) {
    return 'Never';
  }
  const diff = now.value - lastFetchedAt.value;
  if (diff < 60_000) {
    return 'Just now';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
});

const missingCount = computed(() => snapshot.value?.missingCharacters.length ?? 0);
const guildRoster = computed(
  () =>
    snapshot.value?.characters.filter((entry) => !toBooleanFlag(entry.isPersonal)) ?? []
);
const personalRoster = computed(
  () =>
    snapshot.value?.characters.filter((entry) => toBooleanFlag(entry.isPersonal)) ?? []
);
const allGuildSelected = computed(
  () =>
    guildRoster.value.length > 0 &&
    guildRoster.value.every((entry) => selectedGuild.value.has(entry.name.toLowerCase()))
);
const allPersonalSelected = computed(
  () =>
    personalRoster.value.length > 0 &&
    personalRoster.value.every((entry) => selectedPersonal.value.has(entry.name.toLowerCase()))
);

function buildItemKey(itemId: number | null | undefined, itemName: string): string {
  return itemId != null ? `id:${itemId}` : `name:${itemName.toLowerCase()}`;
}

function normalizeQuantity(raw: any): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 1;
  if (num > MAX_REASONABLE_QUANTITY) return 1;
  return num;
}


const inventoryPlacementGroups = computed(() => {
  const current = inventoryModal.value.item;
  if (!current || !Array.isArray(current.slotPlacements)) {
    return [];
  }

  const targetCharacter = inventoryModal.value.selectedCharacter?.toLowerCase();

  const map = new Map<
    string,
    {
      characterName: string;
      isPersonal: boolean;
      placements: Array<{
        quantity: number;
        locationLabel: string;
        resolved: ResolvedSlotPlacement;
        label: string;
      }>;
      highlights: {
        worn: Set<number>;
        general: Set<number>;
        bank: Set<number>;
        generalBags: Map<number, Set<number>>;
        bankBags: Map<number, Set<number>>;
      };
    }
  >();

  for (const placement of current.slotPlacements) {
    // Filter by selectedCharacter if one is provided
    if (targetCharacter && placement.characterName.toLowerCase() !== targetCharacter) {
      continue;
    }

    const resolved = resolveSlotPlacement(placement.slotId ?? null);
    const existing = map.get(placement.characterName);
    const container = existing ?? {
      characterName: placement.characterName,
      isPersonal: placement.isPersonal,
      placements: [],
      highlights: {
        worn: new Set<number>(),
        general: new Set<number>(),
        bank: new Set<number>(),
        generalBags: new Map<number, Set<number>>(),
        bankBags: new Map<number, Set<number>>()
      }
    };

    container.placements.push({
      quantity: placement.quantity,
      locationLabel: placement.locationLabel,
      resolved,
      label: slotDisplayLabel(resolved)
    });

    switch (resolved.area) {
      case 'worn':
        if (resolved.slotId != null) {
          container.highlights.worn.add(resolved.slotId);
        }
        break;
      case 'inventory': // This covers GENERAL_SLOT_IDS (23-32)
        if (resolved.slotId != null) {
          container.highlights.general.add(resolved.slotId);
        }
        break;
      case 'inventoryBag': // This covers items inside bags in general slots
        if (resolved.parentSlotId != null && resolved.bagSlotIndex != null) {
          container.highlights.general.add(resolved.parentSlotId); // Highlight the parent bag slot
          const generalBag = container.highlights.generalBags.get(resolved.parentSlotId) ?? new Set<number>();
          generalBag.add(resolved.bagSlotIndex);
          container.highlights.generalBags.set(resolved.parentSlotId, generalBag);
        }
        break;
      case 'bank':
        if (resolved.slotId != null) {
          container.highlights.bank.add(resolved.slotId);
        }
        break;
      case 'bankBag':
        if (resolved.parentSlotId != null && resolved.bagSlotIndex != null) {
          container.highlights.bank.add(resolved.parentSlotId);
          const bankBag = container.highlights.bankBags.get(resolved.parentSlotId) ?? new Set<number>();
          bankBag.add(resolved.bagSlotIndex);
          container.highlights.bankBags.set(resolved.parentSlotId, bankBag);
        }
        break;
      default:
        break;
    }

    if (!existing) {
      map.set(placement.characterName, container);
    }
  }

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    placements: entry.placements,
    highlights: {
      worn: Array.from(entry.highlights.worn),
      general: Array.from(entry.highlights.general),
      bank: Array.from(entry.highlights.bank)
    },
    generalBags: Array.from(entry.highlights.generalBags.entries()).map(([parentSlotId, slots]) => ({
      parentSlotId,
      slots: Array.from(slots).sort((a, b) => a - b)
    })),
    bankBags: Array.from(entry.highlights.bankBags.entries()).map(([parentSlotId, slots]) => ({
      parentSlotId,
      slots: Array.from(slots).sort((a, b) => a - b)
    }))
  }));
});

const characterClassMap = computed(() => {
  const map = new Map<string, CharacterClass>();
  for (const entry of snapshot.value?.characters ?? []) {
    if (entry.class) {
      map.set(entry.name.toLowerCase(), entry.class);
    }
  }
  return map;
});

function classIconForCharacter(name: string) {
  const cls = characterClassMap.value.get(name.toLowerCase()) ?? null;
  if (!cls || cls === 'UNKNOWN') {
    return '/assets/icons/warrior.gif'; // Default fallback
  }
  return `/assets/icons/${cls.toLowerCase()}.gif`;
}

// Cart state
type CartEntry = {
  itemKey: string;
  itemId: number | null;
  itemName: string;
  itemIconId: number | null;
  maxQuantity: number;
  sources: Array<{ characterName: string; location: string; quantity: number }>;
  quantity: number;
};

const cart = ref<CartEntry[]>([]);
const showCart = ref(false);
const showRequestModal = ref(false);
const requestModalItem = ref<CartEntry | null>(null);
const requestQuantity = ref(1);

const cartStorageKey = computed(() => `guild-bank-cart:${guildId.value}`);

function loadCart() {
  try {
    const raw = localStorage.getItem(cartStorageKey.value);
    if (!raw) {
      cart.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    cart.value = Array.isArray(parsed)
      ? parsed
          .map((entry: any) => ({
            itemKey: typeof entry?.itemKey === 'string' ? entry.itemKey : '',
            itemId:
              typeof entry?.itemId === 'number'
                ? entry.itemId
                : entry?.itemId == null
                  ? null
                  : null,
            itemName: typeof entry?.itemName === 'string' ? entry.itemName : 'Unknown',
            itemIconId:
              typeof entry?.itemIconId === 'number'
                ? entry.itemIconId
                : entry?.itemIconId == null
                  ? null
                  : null,
            maxQuantity: typeof entry?.maxQuantity === 'number' ? entry.maxQuantity : 1,
            sources: Array.isArray(entry?.sources)
              ? entry.sources
                  .filter(
                    (src: any) =>
                      typeof src?.characterName === 'string' &&
                      typeof src?.location === 'string' &&
                      typeof src?.quantity === 'number'
                  )
                  .map((src: any) => ({
                    characterName: src.characterName,
                    location: src.location,
                    quantity: src.quantity
                  }))
              : [],
            quantity: typeof entry?.quantity === 'number' ? entry.quantity : 1
          }))
          .filter((entry: CartEntry) => entry.itemKey)
      : [];
  } catch {
    cart.value = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey.value, JSON.stringify(cart.value));
  } catch {
    // ignore
  }
}

function resetCart() {
  cart.value = [];
  saveCart();
}

const cartCount = computed(() => cart.value.reduce((sum, entry) => sum + entry.quantity, 0));
const cartDistinct = computed(() => cart.value.length);
const submittingCart = ref(false);
const cartError = ref<string | null>(null);
const cartSuccess = ref<string | null>(null);
const cartConfirmOpen = ref(false);

function openRequestModal(item: typeof groupedItems.value[number]) {
  const existing = cart.value.find((entry) => entry.itemKey === item.key);
  const guildMaxQuantity = Math.max(item.guildQuantity ?? 0, 0);
  const maxQuantity = Math.max(guildMaxQuantity, existing?.quantity ?? 0);
  requestQuantity.value = Math.min(existing?.quantity ?? 1, maxQuantity || 1);
  const sources =
    (item as any).sources && (item as any).sources.length
      ? (item as any).sources.filter((src: any) => src.isPersonal !== true)
      : item.ownerSummaries
          .filter((owner) => owner.isPersonal !== true)
          .map((owner) => ({
            characterName: owner.characterName,
            location: owner.locationLabel,
            quantity: owner.totalQuantity
          })) || [];
  requestModalItem.value = {
    itemKey: item.key,
    itemId: item.itemId ?? null,
    itemName: item.itemName,
    itemIconId: item.itemIconId ?? null,
    maxQuantity,
    sources,
    quantity: requestQuantity.value
  };
  showRequestModal.value = true;
}

function closeRequestModal() {
  showRequestModal.value = false;
  requestModalItem.value = null;
  requestQuantity.value = 1;
}

function updateCartEntry(entry: CartEntry) {
  const existingIndex = cart.value.findIndex((e) => e.itemKey === entry.itemKey);
  if (existingIndex >= 0) {
    cart.value.splice(existingIndex, 1, entry);
  } else {
    cart.value.push(entry);
  }
  saveCart();
}

function onRangeChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = Number(target.value);
  if (!requestModalItem.value) {
    return;
  }
  if (requestModalItem.value.maxQuantity === 1) {
    requestQuantity.value = 1;
    return;
  }
  const clamped = Math.max(1, Math.min(requestModalItem.value.maxQuantity, value));
  requestQuantity.value = clamped;
}

function handleRequestModalConfirm() {
  if (!requestModalItem.value) return;
  const clampedQty = Math.max(
    1,
    Math.min(requestModalItem.value.maxQuantity, requestQuantity.value)
  );
  updateCartEntry({
    ...requestModalItem.value,
    quantity: clampedQty
  });
  closeRequestModal();
}

function removeCartItem(itemKey: string) {
  cart.value = cart.value.filter((entry) => entry.itemKey !== itemKey);
  saveCart();
}

function toggleCart() {
  showCart.value = !showCart.value;
}

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function cartHasItem(itemKey: string) {
  return cart.value.some((entry) => entry.itemKey === itemKey);
}

const aggregatedCartSources = computed(() =>
  cart.value.map((entry) => {
    const sources =
      entry.sources && entry.sources.length
        ? entry.sources.filter((src) => (src as any).isPersonal !== true)
        : [{ characterName: 'Guild Bank', location: 'Bank', quantity: entry.maxQuantity }];
    return {
      ...entry,
      sources
    };
  })
);

function reconcileCartWithSnapshot() {
  if (!snapshot.value) {
    return;
  }
  const aggregated = aggregateItems(snapshot.value.items);
  const lookup = new Map<string, (typeof aggregated)[number]>();
  aggregated.forEach((item) => lookup.set(item.key, item));

  cart.value = cart.value.map((entry) => {
    const latest = lookup.get(entry.itemKey);
    if (!latest) {
      return entry;
    }
    const maxQuantity = latest.totalQuantity;
    const clampedQty = Math.min(entry.quantity, maxQuantity);
    return {
      ...entry,
      maxQuantity,
      quantity: clampedQty,
      sources: latest.sources
    };
  });
  saveCart();
}

function displaySources(entry: CartEntry) {
  const allocated: Array<{ characterName: string; location: string; quantity: number }> = [];
  let remaining = entry.quantity;
  for (const src of entry.sources ?? []) {
    if (remaining <= 0) break;
    const take = Math.min(src.quantity, remaining);
    if (take > 0) {
      allocated.push({ characterName: src.characterName, location: src.location, quantity: take });
      remaining -= take;
    }
  }
  if (remaining > 0 && allocated.length === 0) {
    allocated.push({ characterName: 'Guild Bank', location: 'Bank', quantity: remaining });
  }
  return allocated;
}

watch(requestQuantity, (value) => {
  if (!requestModalItem.value) return;
  if (value > requestModalItem.value.maxQuantity) {
    requestQuantity.value = requestModalItem.value.maxQuantity;
  } else if (value < 1) {
    requestQuantity.value = 1;
  }
});

watch(
  () => requestModalItem.value?.itemKey,
  (key) => {
    if (!key || !requestModalItem.value) return;
    const existing = cart.value.find((entry) => entry.itemKey === key);
    const next = Math.min(existing?.quantity ?? 1, requestModalItem.value.maxQuantity);
    requestQuantity.value = next;
  }
);

watch(
  () =>
    snapshot.value?.characters
      ?.map((c) => `${c.name}:${c.isPersonal ? 1 : 0}`)
      .join('|'),
  (names) => {
    if (!names) return;
    syncSelectionWithSnapshot();
  },
  { immediate: true }
);

async function submitCart(skipConfirm = false) {
  if (cartDistinct.value === 0 || submittingCart.value) {
    return;
  }
  if (!skipConfirm) {
    cartConfirmOpen.value = true;
    return;
  }
  submittingCart.value = true;
  cartConfirmOpen.value = false;
  cartError.value = null;
  cartSuccess.value = null;
  try {
    const itemsPayload = cart.value.map((entry) => ({
      itemId: entry.itemId,
      itemName: entry.itemName,
      quantity: entry.quantity
    }));
    await api.requestGuildBankItems(guildId.value, itemsPayload);
    cartSuccess.value = 'Request sent!';
    resetCart();
  } catch (error: any) {
    const message =
      error?.response?.data?.message ??
      error?.message ??
      'Unable to submit guild bank request. Ensure the webhook is enabled.';
    cartError.value = message;
  } finally {
    submittingCart.value = false;
  }
}

function syncSelectionWithSnapshot() {
  if (!snapshot.value) {
    selectedGuild.value = new Set();
    selectedPersonal.value = new Set();
    return;
  }
  const prevGuild = new Set(selectedGuild.value);
  const prevPersonal = new Set(selectedPersonal.value);
  // Default (first load or no manual changes): enable guild characters only.
  if (!hasUserSelection.value && prevGuild.size === 0 && prevPersonal.size === 0) {
    const defaults = snapshot.value.characters
      .filter((entry) => !toBooleanFlag(entry.isPersonal))
      .map((entry) => entry.name.toLowerCase());
    selectedGuild.value = new Set(defaults);
    selectedPersonal.value = new Set();
    return;
  }

  const currentCharacters = new Set(
    snapshot.value.characters.map((entry) => entry.name.toLowerCase())
  );

  const nextGuild = new Set<string>();
  for (const key of prevGuild) {
    if (currentCharacters.has(key)) {
      nextGuild.add(key);
    }
  }

  const nextPersonal = new Set<string>();
  for (const key of prevPersonal) {
    if (currentCharacters.has(key)) {
      nextPersonal.add(key);
    }
  }

  selectedGuild.value = nextGuild;
  selectedPersonal.value = nextPersonal;
}

function setActiveRoster(roster: RosterType) {
  activeRoster.value = roster;
}

function setRosterSelection(roster: RosterType, enable: boolean) {
  hasUserSelection.value = true;
  if (roster === 'guild') {
    if (enable) {
      selectedGuild.value = new Set(guildRoster.value.map((entry) => entry.name.toLowerCase()));
    } else {
      selectedGuild.value = new Set();
    }
  } else {
    if (enable) {
      selectedPersonal.value = new Set(
        personalRoster.value.map((entry) => entry.name.toLowerCase())
      );
    } else {
      selectedPersonal.value = new Set();
    }
  }
}

function toggleCharacterSelection(name: string, isPersonal: boolean) {
  hasUserSelection.value = true;
  const key = name.toLowerCase();
  if (isPersonal) {
    const next = new Set(selectedPersonal.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selectedPersonal.value = next;
  } else {
    const next = new Set(selectedGuild.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selectedGuild.value = next;
  }
}

async function loadGuildMeta() {
  try {
    const detail = await api.fetchGuildDetail(guildId.value);
    guildName.value = detail.name;
    guildRole.value = detail.permissions?.userRole ?? null;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ?? 'Unable to load guild details. Returning to guild list.';
    setTimeout(() => {
      router.push({ name: 'Guilds' });
    }, 1200);
    throw new Error(message);
  }
}

async function refreshSnapshot(force = false) {
  if (loadingSnapshot.value) {
    return;
  }
  if (!force && !canRefreshNow.value) {
    return;
  }

  loadingSnapshot.value = true;
  snapshotError.value = null;
  try {
    const result = await api.fetchGuildBank(guildId.value);
  const serverNames = result.characters.map((entry) => ({
    name: entry.name,
    isPersonal: toBooleanFlag(entry.isPersonal)
  }));
    const mergedNames = mergeNamesCaseInsensitive([...serverNames, ...cachedNames.value]);
    const missingOnServer = diffNamesCaseInsensitive(mergedNames, serverNames);

    if (
      canManageBank.value &&
      missingOnServer.length > 0 &&
      !autoRestoreAttempted.value &&
      !restoringNames.value
    ) {
      autoRestoreAttempted.value = true;
      restoringNames.value = true;
      try {
        for (const entry of missingOnServer) {
          await api.addGuildBankCharacter(guildId.value, entry.name, {
            isPersonal: entry.isPersonal
          });
        }
        restoringNames.value = false;
        await refreshSnapshot(true);
        return;
      } catch (error: any) {
        restoringNames.value = false;
        snapshotError.value =
          error?.response?.data?.message ??
          'Some bank characters were missing and could not be restored automatically.';
      }
    }

    snapshot.value = result;
    lastFetchedAt.value = Date.now();
    saveCache(result);
    saveCachedNames(mergedNames);
    reconcileCartWithSnapshot();
  } catch (error: any) {
    const message =
      error?.response?.data?.message ??
      error?.message ??
      'Something went wrong while loading the guild bank.';
    snapshotError.value = message;
  } finally {
    loadingSnapshot.value = false;
  }
}

async function addCharacter(isPersonal: boolean) {
  const targetRef = isPersonal ? newPersonalCharacterName : newGuildCharacterName;
  if (!targetRef.value.trim()) {
    return;
  }
  addingCharacter.value = true;
  snapshotError.value = null;
  try {
    const created = await api.addGuildBankCharacter(guildId.value, targetRef.value.trim(), {
      isPersonal
    });
    snapshot.value = {
      characters: [...(snapshot.value?.characters ?? []), created],
      items: snapshot.value?.items ?? [],
      missingCharacters: snapshot.value?.missingCharacters ?? []
    };
    const key = created.name.toLowerCase();
    if (isPersonal) {
      selectedPersonal.value = new Set([...selectedPersonal.value, key]);
    } else {
      selectedGuild.value = new Set([...selectedGuild.value, key]);
    }
    hasUserSelection.value = true;
    saveCachedNames(
      snapshot.value.characters.map((entry) => ({
        name: entry.name,
        isPersonal: toBooleanFlag(entry.isPersonal)
      }))
    );
    targetRef.value = '';
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value =
      error?.response?.data?.message ?? 'Unable to add guild bank character.';
  } finally {
    addingCharacter.value = false;
  }
}

async function removeCharacter(id: string) {
  removingId.value = id;
  snapshotError.value = null;
  try {
    const removedName = snapshot.value?.characters.find((entry) => entry.id === id)?.name ?? null;
    await api.deleteGuildBankCharacter(guildId.value, id);
    snapshot.value = snapshot.value
      ? {
          characters: snapshot.value.characters.filter((entry) => entry.id !== id),
          items: removedName
            ? snapshot.value.items.filter((entry) => entry.characterName !== removedName)
            : snapshot.value.items,
          missingCharacters: snapshot.value.missingCharacters
        }
      : null;
    saveCachedNames(
      snapshot.value?.characters?.map((entry) => ({
        name: entry.name,
        isPersonal: toBooleanFlag(entry.isPersonal)
      })) ?? []
    );
    await refreshSnapshot(true);
  } catch (error: any) {
    snapshotError.value = error?.response?.data?.message ?? 'Unable to remove character.';
  } finally {
    removingId.value = null;
  }
}

function applyCachedSnapshot() {
  const cached = loadCache();
  if (cached) {
    snapshot.value = cached.snapshot;
    lastFetchedAt.value = cached.fetchedAt;
  } else {
    snapshot.value = null;
    lastFetchedAt.value = null;
  }
  loadCachedNames();
}

watch(
  () => guildId.value,
  async () => {
    applyCachedSnapshot();
    autoRestoreAttempted.value = false;
    loadCart();
    try {
      await loadGuildMeta();
    } catch {
      return;
    }
    currentPage.value = 1;
    const cacheAge = lastFetchedAt.value ? now.value - lastFetchedAt.value : Infinity;
    const cacheIsFresh = cacheAge < ONE_HOUR_MS;
    const needsInitialRefresh = !initialFetchDone.value;

    if (!snapshot.value) {
      await refreshSnapshot(true);
    } else if (needsInitialRefresh || (canRefreshNow.value && !cacheIsFresh)) {
      await refreshSnapshot(true);
    }
    initialFetchDone.value = true;
  },
  { immediate: true }
);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  loadCart();
  syncSelectionWithSnapshot();
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
});
</script>
