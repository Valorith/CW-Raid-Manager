<template>
  <GlobalLoadingSpinner v-if="showBoardLoading && !board" />
  <section v-else class="bis-planner">
    <header class="bis-planner__hero">
      <div>
        <p class="bis-planner__eyebrow">Global Best In Slot</p>
        <h1>{{ activeClassLabel }} Planner</h1>
        <p class="bis-planner__summary">
          Community-ranked gear templates driven by one vote per user, per slot. Ties stay with the
          earliest nomination.
        </p>
      </div>
      <div class="bis-planner__hero-actions">
        <div class="bis-planner__stat">
          <span class="bis-planner__stat-label">Established Slots</span>
          <strong>{{ establishedSlotCount }}/23</strong>
        </div>
        <div class="bis-planner__stat">
          <span class="bis-planner__stat-label">Total Votes</span>
          <strong>{{ totalVoteCount }}</strong>
        </div>
        <RouterLink
          v-if="authStore.isAdmin"
          class="bis-planner__admin-link"
          :to="{ name: 'BisModeration' }"
        >
          Moderation
        </RouterLink>
      </div>
    </header>

    <div class="bis-planner__class-strip">
      <button
        v-for="characterClass in playableCharacterClasses"
        :key="characterClass"
        type="button"
        :class="[
          'bis-planner__class-pill',
          { 'bis-planner__class-pill--active': characterClass === activeClass }
        ]"
        @click="selectClass(characterClass)"
      >
        <span
          v-if="getCharacterClassIcon(characterClass)"
          class="bis-planner__class-icon"
          :style="{ backgroundImage: `url(${getCharacterClassIcon(characterClass)})` }"
          aria-hidden="true"
        ></span>
        <span>{{ characterClassLabels[characterClass] }}</span>
      </button>
    </div>

    <div v-if="boardError" class="bis-planner__message bis-planner__message--error">
      <span>{{ boardError }}</span>
      <button type="button" class="btn btn--outline" @click="loadBoard">Retry</button>
    </div>

    <div
      v-else-if="board?.permissions.isBanned"
      class="bis-planner__message bis-planner__message--warning"
    >
      <strong>BiS participation disabled.</strong>
      <span>
        {{ board.permissions.reason || 'An administrator has blocked this account from voting.' }}
        <template v-if="board.permissions.expiresAt">
          Ban lifts {{ formatDateTime(board.permissions.expiresAt) }}.
        </template>
      </span>
    </div>

    <div class="bis-planner__main">
      <div class="bis-planner__canvas">
        <div class="bis-planner__equipment-stage">
          <BisEquipmentGrid
            title="BiS Template"
            :subtitle="`${activeClassLabel} community board`"
            badge="Template"
            :character-class="activeClass"
            :slot-items="bisGridItems"
            :slot-tones="bisGridTones"
            :selected-slot-id="selectedSlotId"
            scale="large"
            @select="handleSelectSlot"
          />

          <div
            class="bis-planner__compare-card"
            :class="{ 'bis-planner__compare-card--loading': compareInventoryLoading }"
          >
            <div class="bis-planner__compare-head">
              <div class="bis-planner__compare-headline">
                <p class="bis-planner__panel-eyebrow">Comparison</p>
                <h2>Character vs Template</h2>
              </div>
              <div class="bis-planner__compare-controls">
                <div class="bis-planner__compare-search-shell">
                  <label class="bis-planner__search-field bis-planner__search-field--header">
                    <span class="bis-planner__sr-only">Search a character</span>
                    <input
                      v-model="compareQuery"
                      type="search"
                      placeholder="Search a character"
                      autocomplete="off"
                    />
                  </label>

                  <div
                    v-if="compareResultsVisible"
                    class="bis-planner__search-results bis-planner__search-results--dropdown"
                  >
                    <button
                      v-for="result in compareResults"
                      :key="result.id"
                      type="button"
                      class="bis-planner__search-result"
                      @click="selectCompareCharacter(result)"
                    >
                      <strong>{{ result.name }}</strong>
                      <span>{{ characterClassLabels[result.className] }}</span>
                    </button>
                    <div v-if="compareSearchLoading" class="bis-planner__search-empty">Searching…</div>
                    <div
                      v-else-if="compareQuery.trim().length >= 2 && compareResults.length === 0"
                      class="bis-planner__search-empty"
                    >
                      No characters found.
                    </div>
                  </div>
                </div>
                <button
                  v-if="compareCharacter"
                  type="button"
                  class="btn btn--outline btn--small bis-planner__compare-clear"
                  @click="clearCompareCharacter"
                >
                  Clear
                </button>
              </div>
            </div>

            <div v-if="compareCharacter" class="bis-planner__compare-summary">
              <div class="bis-planner__compare-summary-row">
                <div class="bis-planner__compare-identity">
                  <strong>{{ compareCharacter.name }}</strong>
                  <span>{{ characterClassLabels[compareCharacter.className] }}</span>
                </div>
                <div class="bis-planner__compare-metrics">
                  <span class="bis-planner__metric bis-planner__metric--match">
                    Matches {{ compareMatchCount }}
                  </span>
                  <span class="bis-planner__metric bis-planner__metric--different">
                    Different {{ compareDifferentCount }}
                  </span>
                  <span class="bis-planner__metric bis-planner__metric--missing">
                    Missing {{ compareMissingCount }}
                  </span>
                </div>
              </div>
              <p
                v-if="compareCharacter.className !== activeClass"
                class="bis-planner__compare-warning"
              >
                This character is not a {{ activeClassLabel }}. Slot matches may still be useful, but
                class-specific BiS logic is based on the selected board.
              </p>
            </div>

            <div v-if="compareInventoryError" class="bis-planner__compare-error">
              {{ compareInventoryError }}
            </div>

            <BisEquipmentGrid
              v-if="compareCharacter"
              :title="compareCharacter.name"
              subtitle="Live equipped gear"
              badge="Compare"
              :character-class="compareCharacter.className"
              :slot-items="compareGridItems"
              :slot-tones="compareGridTones"
              :selected-slot-id="selectedSlotId"
              scale="large"
              @select="handleSelectSlot"
            />

            <div v-else class="bis-planner__compare-empty">
              Search for a character to load their equipped inventory beside the BiS template.
            </div>

            <p v-if="compareCharacter" class="bis-planner__compare-hint">
              Click an equipped item to target that slot, then use the sidebar to nominate it or
              vote for its existing BiS entry.
            </p>
          </div>
        </div>
      </div>

      <aside class="bis-planner__sidebar">
        <div class="bis-planner__panel">
          <div class="bis-planner__panel-header">
            <div>
              <p class="bis-planner__panel-eyebrow">Selected Slot</p>
              <h2>{{ selectedSlot?.slotLabel ?? 'Select a slot' }}</h2>
            </div>
            <span class="bis-planner__panel-badge">
              {{ selectedSlot?.candidates.length ?? 0 }} candidates
            </span>
          </div>

          <div v-if="selectedWinner" class="bis-planner__winner-card">
            <div class="bis-planner__winner-copy">
              <span class="bis-planner__winner-label">Current BiS</span>
              <strong>{{ selectedWinner.itemName }}</strong>
              <span>{{ selectedWinner.voteCount }} votes</span>
            </div>
            <img
              v-if="selectedWinner.itemIconId"
              :src="getLootIconSrc(selectedWinner.itemIconId)"
              alt=""
              class="bis-planner__winner-icon"
            />
          </div>
          <div v-else class="bis-planner__empty-state">
            No compatible item has been nominated for this slot yet.
          </div>

          <div v-if="compareCharacter" class="bis-planner__section">
            <div class="bis-planner__section-head">
              <h3>Compared Character Item</h3>
              <span>{{ compareCharacter.name }}</span>
            </div>

            <div v-if="!selectedCompareItem" class="bis-planner__empty-inline">
              This character has no equipped item in the selected slot.
            </div>

            <div v-else class="bis-planner__compare-item-card">
              <div class="bis-planner__candidate-main">
                <img
                  v-if="selectedCompareItem.itemIconId"
                  :src="getLootIconSrc(selectedCompareItem.itemIconId)"
                  alt=""
                  class="bis-planner__candidate-icon"
                />
                <div>
                  <div class="bis-planner__candidate-title-row">
                    <strong>{{ selectedCompareItem.itemName }}</strong>
                    <span
                      v-if="selectedCompareCandidate?.isWinner"
                      class="bis-planner__candidate-tag"
                    >
                      Current BiS
                    </span>
                    <span
                      v-else-if="selectedCompareCandidate"
                      class="bis-planner__panel-badge"
                    >
                      On Vote Board
                    </span>
                  </div>
                  <span class="bis-planner__candidate-meta">
                    <template v-if="selectedCompareCandidate">
                      {{ selectedCompareCandidate.voteCount }} votes currently recorded for this
                      item.
                    </template>
                    <template v-else>
                      Not yet nominated for {{ selectedSlot?.slotLabel ?? 'this slot' }}.
                    </template>
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="btn"
                :class="selectedCompareCandidate ? 'btn--primary' : 'btn--secondary'"
                :disabled="compareItemActionDisabled"
                @click="applyComparedItemSuggestion"
              >
                {{ compareItemActionLabel }}
              </button>
            </div>
          </div>

          <div class="bis-planner__section">
            <div class="bis-planner__section-head">
              <h3>Vote Board</h3>
              <span v-if="selectedSlot?.viewerVoteCandidateId" class="bis-planner__viewer-vote">
                Your vote is active
              </span>
            </div>
            <div
              v-if="!selectedSlot || selectedSlot.candidates.length === 0"
              class="bis-planner__empty-inline"
            >
              Candidate items will appear here after they are nominated.
            </div>
            <div v-else class="bis-planner__candidate-list">
              <article
                v-for="candidate in selectedSlot.candidates"
                :key="candidate.id"
                class="bis-planner__candidate"
                :class="{
                  'bis-planner__candidate--winner': candidate.isWinner,
                  'bis-planner__candidate--voted':
                    selectedSlot.viewerVoteCandidateId === candidate.id
                }"
              >
                <div class="bis-planner__candidate-main">
                  <img
                    v-if="candidate.itemIconId"
                    :src="getLootIconSrc(candidate.itemIconId)"
                    alt=""
                    class="bis-planner__candidate-icon"
                  />
                  <div>
                    <div class="bis-planner__candidate-title-row">
                      <strong>{{ candidate.itemName }}</strong>
                      <span v-if="candidate.isWinner" class="bis-planner__candidate-tag">BiS</span>
                    </div>
                    <span class="bis-planner__candidate-meta">
                      {{ candidate.voteCount }} votes · submitted by
                      {{ candidate.submittedBy.displayName }}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn"
                  :class="
                    selectedSlot.viewerVoteCandidateId === candidate.id
                      ? 'btn--secondary'
                      : 'btn--primary'
                  "
                  :disabled="candidateVoteLoadingId === candidate.id || !board?.permissions.canVote"
                  @click="voteForCandidate(candidate.id)"
                >
                  {{
                    selectedSlot.viewerVoteCandidateId === candidate.id
                      ? 'Voted'
                      : candidateVoteLoadingId === candidate.id
                        ? 'Voting…'
                        : 'Vote'
                  }}
                </button>
              </article>
            </div>
          </div>

          <div class="bis-planner__section">
            <div class="bis-planner__section-head">
              <h3>Nominate Compatible Item</h3>
              <span>Discovered items only</span>
            </div>
            <label class="bis-planner__search-field">
              <span>Search item name</span>
              <input
                v-model="itemSearchQuery"
                type="search"
                placeholder="Search discovered items"
                autocomplete="off"
              />
            </label>
            <div class="bis-planner__search-results bis-planner__search-results--items">
              <div v-if="itemSearchLoading" class="bis-planner__search-empty">Searching…</div>
              <div
                v-else-if="itemSearchQuery.trim().length >= 2 && itemSearchResults.length === 0"
                class="bis-planner__search-empty"
              >
                No compatible discovered items found.
              </div>
              <button
                v-for="item in itemSearchResults"
                :key="item.itemId"
                type="button"
                class="bis-planner__search-result bis-planner__search-result--item"
                :disabled="nominationLoadingItemId === item.itemId || !board?.permissions.canVote"
                @click="nominateItem(item)"
              >
                <div class="bis-planner__search-result-main">
                  <img
                    v-if="item.itemIconId"
                    :src="getLootIconSrc(item.itemIconId)"
                    alt=""
                    class="bis-planner__candidate-icon"
                  />
                  <strong>{{ item.itemName }}</strong>
                </div>
                <span>
                  {{ nominationLoadingItemId === item.itemId ? 'Submitting…' : 'Nominate + Vote' }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import BisEquipmentGrid, {
  type BisEquipmentGridItem,
  type BisEquipmentGridTone
} from '../components/bis/BisEquipmentGrid.vue';
import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { useAuthStore } from '../stores/auth';
import {
  api,
  type BisBoard,
  type BisDiscoveredItem,
  type BisSearchCharacterResult,
  type GuildBankItem
} from '../services/api';
import {
  characterClassLabels,
  getCharacterClassIcon,
  playableCharacterClasses,
  type CharacterClass
} from '../services/types';
import { getLootIconSrc } from '../utils/itemIcons';

const DEFAULT_CLASS: CharacterClass = 'WARRIOR';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const board = ref<BisBoard | null>(null);
const boardLoading = ref(false);
const showBoardLoading = useMinimumLoading(boardLoading, 500);
const boardError = ref<string | null>(null);
const selectedSlotId = ref<number | null>(13);

const itemSearchQuery = ref('');
const itemSearchResults = ref<BisDiscoveredItem[]>([]);
const itemSearchLoading = ref(false);
let itemSearchDebounce: ReturnType<typeof setTimeout> | null = null;
const nominationLoadingItemId = ref<number | null>(null);
const candidateVoteLoadingId = ref<string | null>(null);

const compareQuery = ref('');
const compareResults = ref<BisSearchCharacterResult[]>([]);
const compareSearchLoading = ref(false);
let compareSearchDebounce: ReturnType<typeof setTimeout> | null = null;
const compareCharacter = ref<BisSearchCharacterResult | null>(null);
const compareInventoryItems = ref<GuildBankItem[]>([]);
const compareInventoryLoading = ref(false);
const compareInventoryError = ref<string | null>(null);

const activeClass = computed<CharacterClass>(() => {
  const rawValue = Array.isArray(route.params.characterClass)
    ? route.params.characterClass[0]
    : route.params.characterClass;
  if (typeof rawValue !== 'string') {
    return DEFAULT_CLASS;
  }

  const normalized = rawValue.toUpperCase();
  return playableCharacterClasses.includes(normalized as CharacterClass)
    ? (normalized as CharacterClass)
    : DEFAULT_CLASS;
});

const activeClassLabel = computed(() => characterClassLabels[activeClass.value]);

const establishedSlotCount = computed(
  () => board.value?.slotSummaries.filter((slot) => Boolean(slot.winner)).length ?? 0
);

const totalVoteCount = computed(
  () => board.value?.slotSummaries.reduce((sum, slot) => sum + slot.totalVotes, 0) ?? 0
);

const selectedSlot = computed(() => {
  if (!board.value) {
    return null;
  }

  return (
    board.value.slotSummaries.find((slot) => slot.slotId === selectedSlotId.value) ??
    board.value.slotSummaries[0] ??
    null
  );
});

const selectedWinner = computed(() => selectedSlot.value?.winner ?? null);

const bisGridItems = computed<Record<number, BisEquipmentGridItem | null>>(() => {
  const result: Record<number, BisEquipmentGridItem | null> = {};
  for (const slot of board.value?.slotSummaries ?? []) {
    if (!slot.winner) {
      result[slot.slotId] = null;
      continue;
    }

    result[slot.slotId] = {
      slotId: slot.slotId,
      itemId: slot.winner.itemId,
      itemName: slot.winner.itemName,
      itemIconId: slot.winner.itemIconId,
      cornerLabel: slot.winner.voteCount > 0 ? String(slot.winner.voteCount) : null
    };
  }
  return result;
});

const bisGridTones = computed<Record<number, BisEquipmentGridTone | undefined>>(() => {
  const tones: Record<number, BisEquipmentGridTone | undefined> = {};
  for (const slot of board.value?.slotSummaries ?? []) {
    if (slot.winner) {
      tones[slot.slotId] = 'winner';
    }
  }
  return tones;
});

const compareItemsBySlot = computed<Map<number, GuildBankItem>>(() => {
  const map = new Map<number, GuildBankItem>();
  for (const item of compareInventoryItems.value) {
    if (typeof item.slotId === 'number' && item.slotId >= 0 && item.slotId <= 22) {
      map.set(item.slotId, item);
    }
  }
  return map;
});

const compareGridItems = computed<Record<number, BisEquipmentGridItem | null>>(() => {
  const result: Record<number, BisEquipmentGridItem | null> = {};
  for (let slotId = 0; slotId <= 22; slotId += 1) {
    const item = compareItemsBySlot.value.get(slotId);
    result[slotId] = item
      ? {
          slotId,
          itemId: item.itemId ?? undefined,
          itemName: item.itemName,
          itemIconId: item.itemIconId ?? null,
          augSlot1: item.augSlot1,
          augSlot2: item.augSlot2,
          augSlot3: item.augSlot3,
          augSlot4: item.augSlot4,
          augSlot5: item.augSlot5,
          augSlot6: item.augSlot6
        }
      : null;
  }
  return result;
});

const compareGridTones = computed<Record<number, BisEquipmentGridTone | undefined>>(() => {
  const tones: Record<number, BisEquipmentGridTone | undefined> = {};
  for (const slot of board.value?.slotSummaries ?? []) {
    const compareItem = compareItemsBySlot.value.get(slot.slotId);
    if (slot.winner && compareItem?.itemId === slot.winner.itemId) {
      tones[slot.slotId] = 'match';
    } else if (slot.winner && compareItem?.itemId) {
      tones[slot.slotId] = 'different';
    } else if (slot.winner && !compareItem?.itemId) {
      tones[slot.slotId] = 'missing';
    } else if (!slot.winner && compareItem?.itemId) {
      tones[slot.slotId] = 'unresolved';
    }
  }
  return tones;
});

const selectedCompareItem = computed(() => {
  if (selectedSlotId.value == null) {
    return null;
  }

  return compareItemsBySlot.value.get(selectedSlotId.value) ?? null;
});

const selectedCompareCandidate = computed(() => {
  if (!selectedCompareItem.value?.itemId || !selectedSlot.value) {
    return null;
  }

  return (
    selectedSlot.value.candidates.find(
      (candidate) => candidate.itemId === selectedCompareItem.value?.itemId
    ) ?? null
  );
});

const compareItemActionDisabled = computed(() => {
  if (!board.value?.permissions.canVote || !selectedCompareItem.value?.itemId) {
    return true;
  }

  if (
    selectedCompareCandidate.value &&
    selectedSlot.value?.viewerVoteCandidateId === selectedCompareCandidate.value.id
  ) {
    return true;
  }

  if (selectedCompareCandidate.value) {
    return candidateVoteLoadingId.value === selectedCompareCandidate.value.id;
  }

  return nominationLoadingItemId.value === selectedCompareItem.value.itemId;
});

const compareItemActionLabel = computed(() => {
  if (!selectedCompareItem.value?.itemId) {
    return 'Unavailable';
  }

  if (
    selectedCompareCandidate.value &&
    selectedSlot.value?.viewerVoteCandidateId === selectedCompareCandidate.value.id
  ) {
    return 'Your Vote Is Here';
  }

  if (selectedCompareCandidate.value) {
    if (candidateVoteLoadingId.value === selectedCompareCandidate.value.id) {
      return 'Voting…';
    }

    return selectedCompareCandidate.value.isWinner ? 'Vote For Current BiS' : 'Vote For Candidate';
  }

  if (nominationLoadingItemId.value === selectedCompareItem.value.itemId) {
    return 'Submitting…';
  }

  return 'Nominate + Vote';
});

const compareMatchCount = computed(
  () => Object.values(compareGridTones.value).filter((tone) => tone === 'match').length
);
const compareDifferentCount = computed(
  () => Object.values(compareGridTones.value).filter((tone) => tone === 'different').length
);
const compareMissingCount = computed(
  () => Object.values(compareGridTones.value).filter((tone) => tone === 'missing').length
);

const compareResultsVisible = computed(() => {
  const trimmedQuery = compareQuery.value.trim();
  if (trimmedQuery.length < 2) {
    return false;
  }

  if (compareCharacter.value && trimmedQuery === compareCharacter.value.name) {
    return false;
  }

  return true;
});

function emitToast(
  title: string,
  message: string,
  variant: 'success' | 'warning' | 'error' = 'success'
) {
  window.dispatchEvent(
    new CustomEvent('show-toast', {
      detail: {
        title,
        message,
        variant
      }
    })
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

async function loadBoard() {
  boardLoading.value = true;
  boardError.value = null;

  try {
    board.value = await api.fetchBisBoard(activeClass.value);
    const currentSelectionStillExists = board.value.slotSummaries.some(
      (slot) => slot.slotId === selectedSlotId.value
    );
    if (!currentSelectionStillExists) {
      selectedSlotId.value = board.value.slotSummaries.find((slot) => slot.winner)?.slotId ?? 13;
    }
  } catch (error: any) {
    boardError.value =
      error?.response?.data?.message ?? error?.message ?? 'Failed to load the BiS planner.';
  } finally {
    boardLoading.value = false;
  }
}

function selectClass(characterClass: CharacterClass) {
  router.push({
    name: 'BisPlanner',
    params: { characterClass }
  });
}

function handleSelectSlot(slotId: number) {
  selectedSlotId.value = slotId;
}

async function voteForCandidate(candidateId: string) {
  candidateVoteLoadingId.value = candidateId;
  try {
    await api.voteBisCandidate(candidateId);
    await loadBoard();
    emitToast(
      'Vote Recorded',
      `Your ${selectedSlot.value?.slotLabel ?? 'slot'} vote has been updated.`
    );
  } catch (error: any) {
    emitToast(
      'Vote Failed',
      error?.response?.data?.message ?? error?.message ?? 'Unable to record your vote.',
      'error'
    );
  } finally {
    candidateVoteLoadingId.value = null;
  }
}

async function nominateItem(item: BisDiscoveredItem) {
  if (selectedSlotId.value == null) {
    return;
  }

  nominationLoadingItemId.value = item.itemId;
  try {
    await api.nominateBisCandidate({
      characterClass: activeClass.value,
      slotId: selectedSlotId.value,
      itemId: item.itemId
    });
    await loadBoard();
    emitToast(
      'Candidate Submitted',
      `${item.itemName} is now on the board for ${selectedSlot.value?.slotLabel}.`
    );
  } catch (error: any) {
    emitToast(
      'Submission Failed',
      error?.response?.data?.message ?? error?.message ?? 'Unable to submit that item.',
      'error'
    );
  } finally {
    nominationLoadingItemId.value = null;
  }
}

async function applyComparedItemSuggestion() {
  if (!selectedCompareItem.value?.itemId) {
    return;
  }

  if (selectedCompareCandidate.value) {
    await voteForCandidate(selectedCompareCandidate.value.id);
    return;
  }

  await nominateItem({
    itemId: selectedCompareItem.value.itemId,
    itemName: selectedCompareItem.value.itemName,
    itemIconId: selectedCompareItem.value.itemIconId ?? null
  });
}

async function loadCompareInventory(character: BisSearchCharacterResult) {
  compareInventoryLoading.value = true;
  compareInventoryError.value = null;

  try {
    compareInventoryItems.value = await api.fetchCharacterInventory(character.name);
  } catch (error: any) {
    compareInventoryItems.value = [];
    compareInventoryError.value =
      error?.response?.data?.message ?? error?.message ?? 'Unable to load character inventory.';
  } finally {
    compareInventoryLoading.value = false;
  }
}

async function selectCompareCharacter(character: BisSearchCharacterResult) {
  compareCharacter.value = character;
  compareQuery.value = character.name;
  compareResults.value = [];
  await loadCompareInventory(character);
}

function clearCompareCharacter() {
  compareCharacter.value = null;
  compareQuery.value = '';
  compareResults.value = [];
  compareInventoryItems.value = [];
  compareInventoryError.value = null;
}

watch(
  () => route.params.characterClass,
  async (value) => {
    const routeValue = Array.isArray(value) ? value[0] : value;
    if (typeof routeValue !== 'string') {
      await router.replace({ name: 'BisPlanner', params: { characterClass: DEFAULT_CLASS } });
      return;
    }

    const normalized = routeValue.toUpperCase();
    if (!playableCharacterClasses.includes(normalized as CharacterClass)) {
      await router.replace({ name: 'BisPlanner', params: { characterClass: DEFAULT_CLASS } });
      return;
    }

    await loadBoard();
  },
  { immediate: true }
);

watch(
  [activeClass, selectedSlotId, itemSearchQuery],
  ([characterClass, slotId, query]) => {
    if (itemSearchDebounce) {
      clearTimeout(itemSearchDebounce);
      itemSearchDebounce = null;
    }

    const trimmedQuery = query.trim();
    if (slotId == null || trimmedQuery.length < 2) {
      itemSearchResults.value = [];
      itemSearchLoading.value = false;
      return;
    }

    itemSearchLoading.value = true;
    itemSearchDebounce = window.setTimeout(async () => {
      try {
        itemSearchResults.value = await api.searchBisDiscoveredItems(
          characterClass,
          slotId,
          trimmedQuery,
          10
        );
      } catch {
        itemSearchResults.value = [];
      } finally {
        itemSearchLoading.value = false;
      }
    }, 250);
  },
  { immediate: true }
);

watch(compareQuery, (query) => {
  if (compareSearchDebounce) {
    clearTimeout(compareSearchDebounce);
    compareSearchDebounce = null;
  }

  const trimmedQuery = query.trim();
  if (compareCharacter.value && trimmedQuery === compareCharacter.value.name) {
    compareResults.value = [];
    compareSearchLoading.value = false;
    return;
  }

  if (trimmedQuery.length < 2) {
    compareResults.value = [];
    compareSearchLoading.value = false;
    return;
  }

  compareSearchLoading.value = true;
  compareSearchDebounce = window.setTimeout(async () => {
    try {
      compareResults.value = await api.searchBisCharacters(trimmedQuery, 10);
    } catch {
      compareResults.value = [];
    } finally {
      compareSearchLoading.value = false;
    }
  }, 250);
});
</script>

<style scoped>
.bis-planner {
  --bis-panel: linear-gradient(180deg, rgba(22, 22, 22, 0.985), rgba(8, 8, 8, 0.995));
  --bis-panel-soft: linear-gradient(180deg, rgba(28, 28, 28, 0.985), rgba(12, 12, 12, 0.995));
  --bis-panel-deep: linear-gradient(180deg, rgba(15, 15, 15, 0.99), rgba(5, 5, 5, 0.995));
  --bis-border: rgba(72, 72, 72, 0.86);
  --bis-border-strong: rgba(124, 124, 124, 0.88);
  --bis-border-soft: rgba(98, 98, 98, 0.42);
  --bis-text: #f5f0e6;
  --bis-muted: #b5aea2;
  --bis-muted-soft: #8f887d;
  --bis-accent: #d0a86a;
  --bis-accent-soft: rgba(208, 168, 106, 0.16);
  --bis-success: #87c18f;
  --bis-warning: #d5a76f;
  --bis-danger: #d08b8b;
  --bis-ring: 0 0 0 3px rgba(208, 168, 106, 0.12);
  min-height: calc(100vh - 6rem);
  padding: 1.75rem;
  color: var(--bis-text);
  background:
    radial-gradient(circle at top, rgba(105, 105, 105, 0.08), transparent 22%),
    linear-gradient(180deg, #0d0d0d 0%, #060606 42%, #020202 100%);
}

.bis-planner__hero,
.bis-planner__panel,
.bis-planner__compare-card {
  background: var(--bis-panel);
  border: 1px solid var(--bis-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(255, 255, 255, 0.015),
    0 24px 60px rgba(0, 0, 0, 0.42);
}

.bis-planner__hero {
  display: flex;
  justify-content: space-between;
  gap: 1.25rem;
  align-items: flex-start;
  padding: 1.35rem 1.5rem;
  border-radius: 24px;
  position: relative;
  overflow: hidden;
}

.bis-planner__hero::after,
.bis-planner__panel::after,
.bis-planner__compare-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 18%);
}

.bis-planner__eyebrow,
.bis-planner__panel-eyebrow {
  margin: 0 0 0.35rem;
  color: var(--bis-accent);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.72rem;
  font-weight: 700;
}

.bis-planner__hero h1,
.bis-planner__panel h2,
.bis-planner__compare-card h2 {
  margin: 0;
}

.bis-planner__summary {
  max-width: 48rem;
  margin: 0.65rem 0 0;
  color: var(--bis-muted);
  line-height: 1.65;
  text-wrap: balance;
}

.bis-planner__hero-actions {
  display: flex;
  gap: 0.85rem;
  align-items: stretch;
}

.bis-planner__stat {
  min-width: 9rem;
  padding: 0.85rem 1rem;
  border-radius: 18px;
  background: var(--bis-panel-soft);
  border: 1px solid var(--bis-border-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.bis-planner__stat-label {
  display: block;
  color: var(--bis-muted-soft);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.35rem;
}

.bis-planner__stat strong {
  color: #fff7eb;
}

.bis-planner__admin-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  color: var(--bis-text);
  text-decoration: none;
  background: var(--bis-panel-soft);
  border: 1px solid var(--bis-border-strong);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.bis-planner__admin-link:hover,
.bis-planner__admin-link:focus-visible {
  color: #fff6e7;
  border-color: rgba(208, 168, 106, 0.72);
  background: linear-gradient(180deg, rgba(34, 34, 34, 0.98), rgba(16, 16, 16, 0.99));
  transform: translateY(-1px);
  outline: none;
  box-shadow: var(--bis-ring);
}

.bis-planner__class-strip {
  display: flex;
  gap: 0.7rem;
  overflow-x: auto;
  padding: 1rem 0 1.2rem;
}

.bis-planner__class-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(56, 56, 56, 0.9);
  background: linear-gradient(180deg, rgba(24, 24, 24, 0.98), rgba(9, 9, 9, 0.995));
  color: #c6beb1;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.bis-planner__class-pill:hover,
.bis-planner__class-pill--active {
  color: #fff8ee;
  border-color: rgba(173, 140, 85, 0.76);
  background: linear-gradient(180deg, rgba(34, 34, 34, 0.985), rgba(15, 15, 15, 0.995));
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.028),
    0 0 0 1px rgba(208, 168, 106, 0.12);
}

.bis-planner__class-pill:focus-visible {
  outline: none;
  box-shadow: var(--bis-ring);
}

.bis-planner__class-icon {
  width: 1.8rem;
  height: 1.8rem;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.bis-planner__message {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.95rem 1.15rem;
  border-radius: 18px;
  margin-bottom: 1rem;
}

.bis-planner__message--error {
  background: linear-gradient(180deg, rgba(33, 16, 16, 0.96), rgba(18, 9, 9, 0.98));
  border: 1px solid rgba(113, 63, 63, 0.58);
}

.bis-planner__message--warning {
  background: linear-gradient(180deg, rgba(31, 24, 14, 0.96), rgba(17, 13, 8, 0.98));
  border: 1px solid rgba(115, 92, 56, 0.58);
}

.bis-planner__main {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(22rem, 0.9fr);
  gap: 1.15rem;
  align-items: stretch;
}

.bis-planner__canvas {
  display: grid;
  gap: 1.15rem;
  height: 100%;
}

.bis-planner__equipment-stage {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.15rem;
  align-items: stretch;
  height: 100%;
}

.bis-planner__compare-card,
.bis-planner__panel {
  border-radius: 24px;
  padding: 1.2rem;
  position: relative;
  height: 100%;
}

.bis-planner__compare-card {
  padding: 0;
  overflow: visible;
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
}

.bis-planner__sidebar {
  display: flex;
  min-height: 100%;
}

.bis-planner__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.bis-planner__compare-head,
.bis-planner__panel-header,
.bis-planner__section-head,
.bis-planner__compare-summary-row,
.bis-planner__candidate,
.bis-planner__search-result {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.bis-planner__compare-head {
  min-height: 56px;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid rgba(73, 73, 73, 0.9);
  background: linear-gradient(180deg, rgba(22, 22, 22, 0.985), rgba(10, 10, 10, 0.99));
  position: relative;
  z-index: 3;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
}

.bis-planner__compare-headline {
  display: inline-flex;
  align-items: baseline;
  gap: 0.65rem;
  min-width: 0;
}

.bis-planner__compare-headline .bis-planner__panel-eyebrow {
  margin: 0;
  white-space: nowrap;
}

.bis-planner__compare-headline h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1;
  white-space: nowrap;
  color: #f5f0e8;
}

.bis-planner__compare-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  flex: 1;
  min-width: 0;
}

.bis-planner__compare-search-shell {
  position: relative;
  width: min(100%, 300px);
  flex: 0 1 300px;
  z-index: 8;
}

.bis-planner__search-field {
  display: grid;
  gap: 0.45rem;
  margin-top: 1rem;
}

.bis-planner__search-field--header {
  margin-top: 0;
  width: 100%;
}

.bis-planner__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.bis-planner__search-field span {
  color: #cec6ba;
  font-size: 0.84rem;
}

.bis-planner__search-field input {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(68, 68, 68, 0.92);
  background: linear-gradient(180deg, rgba(8, 8, 8, 0.985), rgba(2, 2, 2, 0.995));
  color: var(--bis-text);
  padding: 0.8rem 0.9rem;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.bis-planner__search-field--header input {
  min-height: 38px;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
}

.bis-planner__search-field input::placeholder {
  color: #7f786d;
}

.bis-planner__search-field input:focus {
  outline: none;
  border-color: rgba(208, 168, 106, 0.72);
  box-shadow: var(--bis-ring);
  background: linear-gradient(180deg, rgba(11, 11, 11, 0.985), rgba(3, 3, 3, 0.995));
}

.bis-planner__compare-clear {
  flex: 0 0 auto;
}

.bis-planner__search-results {
  display: grid;
  gap: 0.5rem;
  margin: 0.8rem 1rem 0;
}

.bis-planner__search-results--dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.45rem;
  border-radius: 14px;
  border: 1px solid rgba(79, 79, 79, 0.94);
  background: linear-gradient(180deg, rgba(20, 20, 20, 0.992), rgba(8, 8, 8, 0.997));
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.55);
  z-index: 60;
  max-height: 16rem;
  overflow: auto;
}

.bis-planner__search-results--items {
  max-height: 18rem;
  overflow: auto;
  padding-right: 0.2rem;
}

.bis-planner__search-result {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border-radius: 16px;
  border: 1px solid rgba(54, 54, 54, 0.92);
  background: linear-gradient(180deg, rgba(26, 26, 26, 0.985), rgba(10, 10, 10, 0.992));
  color: var(--bis-text);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease;
}

.bis-planner__search-result:hover {
  border-color: rgba(150, 150, 150, 0.72);
  background: linear-gradient(180deg, rgba(33, 33, 33, 0.985), rgba(14, 14, 14, 0.995));
  transform: translateY(-1px);
}

.bis-planner__search-result:focus-visible {
  outline: none;
  box-shadow: var(--bis-ring);
}

.bis-planner__search-result span {
  color: var(--bis-muted);
}

.bis-planner__search-result-main,
.bis-planner__candidate-main {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
}

.bis-planner__search-result-main strong,
.bis-planner__candidate-main strong {
  color: #fff8ee;
}

.bis-planner__search-empty,
.bis-planner__empty-inline,
.bis-planner__empty-state {
  color: var(--bis-muted);
}

.bis-planner__compare-summary,
.bis-planner__winner-card {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: var(--bis-panel-soft);
  border: 1px solid rgba(59, 59, 59, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.bis-planner__compare-summary {
  margin: 0.75rem 1rem 0;
  padding: 0.7rem 0.85rem;
}

.bis-planner__compare-summary-row {
  align-items: center;
}

.bis-planner__compare-identity {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.bis-planner__compare-identity strong {
  font-size: 1rem;
  color: #fff8f0;
}

.bis-planner__compare-identity span {
  color: var(--bis-muted);
}

.bis-planner__compare-warning {
  margin: 0.45rem 0 0;
  color: #e1bf86;
  font-size: 0.82rem;
  line-height: 1.4;
}

.bis-planner__compare-metrics {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.bis-planner__metric,
.bis-planner__panel-badge,
.bis-planner__viewer-vote,
.bis-planner__candidate-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  font-size: 0.74rem;
  border: 1px solid transparent;
}

.bis-planner__metric--match {
  color: #e3f4e4;
  background: rgba(74, 118, 80, 0.28);
  border-color: rgba(116, 172, 126, 0.22);
}

.bis-planner__metric--different,
.bis-planner__panel-badge,
.bis-planner__viewer-vote,
.bis-planner__candidate-tag {
  color: #f0dfbf;
  background: rgba(116, 89, 52, 0.24);
  border-color: rgba(208, 168, 106, 0.2);
}

.bis-planner__metric--missing {
  color: #f0d5d5;
  background: rgba(104, 58, 58, 0.26);
  border-color: rgba(187, 110, 110, 0.2);
}

.bis-planner__compare-card--loading {
  opacity: 0.72;
}

.bis-planner__compare-error {
  margin: 0.55rem 1rem 0;
  color: #e0b3b3;
}

.bis-planner__compare-hint {
  margin: 0.55rem 1rem 1rem;
  color: var(--bis-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.bis-planner__compare-empty {
  margin: 1rem;
  min-height: 34rem;
  border-radius: 18px;
  border: 1px dashed rgba(79, 79, 79, 0.82);
  background:
    radial-gradient(circle at top, rgba(82, 82, 82, 0.08), transparent 42%),
    linear-gradient(180deg, rgba(17, 17, 17, 0.985), rgba(5, 5, 5, 0.995));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: #bfb7aa;
  text-align: center;
  line-height: 1.6;
  flex: 1;
}

.bis-planner__winner-card {
  justify-content: space-between;
}

.bis-planner__winner-copy {
  display: grid;
  gap: 0.15rem;
}

.bis-planner__winner-label {
  color: var(--bis-accent);
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}

.bis-planner__winner-icon,
.bis-planner__candidate-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

.bis-planner__section {
  margin-top: 1.2rem;
  padding-top: 1.2rem;
  border-top: 1px solid rgba(64, 64, 64, 0.4);
}

.bis-planner__candidate-list {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.8rem;
}

.bis-planner__candidate {
  padding: 0.8rem 0.9rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(23, 23, 23, 0.985), rgba(9, 9, 9, 0.995));
  border: 1px solid rgba(52, 52, 52, 0.88);
  transition:
    border-color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
}

.bis-planner__candidate:hover {
  border-color: rgba(92, 92, 92, 0.88);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
}

.bis-planner__compare-item-card {
  margin-top: 0.8rem;
  padding: 0.9rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(23, 23, 23, 0.985), rgba(9, 9, 9, 0.995));
  border: 1px solid rgba(56, 56, 56, 0.88);
  display: grid;
  gap: 0.9rem;
}

.bis-planner__candidate--winner {
  border-color: rgba(162, 125, 67, 0.72);
  background: linear-gradient(180deg, rgba(30, 24, 14, 0.985), rgba(13, 11, 7, 0.995));
}

.bis-planner__candidate--voted {
  box-shadow:
    0 0 0 1px rgba(208, 168, 106, 0.15),
    inset 0 0 0 1px rgba(208, 168, 106, 0.08);
}

.bis-planner__candidate-title-row {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  flex-wrap: wrap;
}

.bis-planner__candidate-meta {
  color: var(--bis-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.bis-planner :deep(.btn--outline),
.bis-planner :deep(.btn--secondary) {
  background: linear-gradient(180deg, rgba(24, 24, 24, 0.985), rgba(11, 11, 11, 0.995));
  border-color: rgba(84, 84, 84, 0.88);
  color: var(--bis-text);
}

.bis-planner :deep(.btn--primary) {
  background: linear-gradient(180deg, rgba(112, 83, 46, 0.96), rgba(72, 53, 28, 0.99));
  border-color: rgba(161, 124, 72, 0.84);
  color: #fff8ec;
}

.bis-planner :deep(.btn) {
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.bis-planner :deep(.btn:hover:not(:disabled)) {
  transform: translateY(-1px);
}

.bis-planner :deep(.btn--outline:hover:not(:disabled)),
.bis-planner :deep(.btn--secondary:hover:not(:disabled)) {
  border-color: rgba(208, 168, 106, 0.64);
  color: #fff7ea;
  background: linear-gradient(180deg, rgba(31, 31, 31, 0.985), rgba(13, 13, 13, 0.995));
}

.bis-planner :deep(.btn--primary:hover:not(:disabled)) {
  box-shadow: 0 10px 22px rgba(81, 56, 23, 0.24);
}

.bis-planner :deep(.btn:focus-visible) {
  outline: none;
  box-shadow: var(--bis-ring);
}

.bis-planner :deep(.btn:disabled) {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (max-width: 1280px) {
  .bis-planner__main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .bis-planner {
    padding: 1rem;
  }

  .bis-planner__hero,
  .bis-planner__hero-actions {
    flex-direction: column;
  }

  .bis-planner__hero-actions,
  .bis-planner__stat,
  .bis-planner__admin-link {
    width: 100%;
  }

  .bis-planner__equipment-stage {
    grid-template-columns: 1fr;
  }

  .bis-planner__compare-head {
    flex-direction: column;
    align-items: stretch;
  }

  .bis-planner__compare-controls {
    width: 100%;
  }

  .bis-planner__compare-search-shell {
    width: 100%;
    flex-basis: auto;
  }

  .bis-planner__search-field--header {
    width: 100%;
  }
}
</style>
