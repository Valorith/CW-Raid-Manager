import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  api,
  type CharacterAdminDetails,
  type AccountInfo,
  type CharacterCorpse,
  type CharacterAssociate,
  type AccountNote,
  type CharacterSearchResult,
  type PlayerEventLog,
  type PlayerEventType,
  type PlayerEventZone,
  type CharacterEventFilters,
  type CharacterWatch
} from '../services/api';

export type CharacterAdminTab = 'events' | 'associates' | 'account' | 'corpses' | 'notes' | 'inventory';

interface CharacterAdminModalState {
  open: boolean;
  characterName: string | null;
  characterId: number | null;
  activeTab: CharacterAdminTab;
}

interface EventsState {
  events: PlayerEventLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  filters: CharacterEventFilters;
}

export const useCharacterAdminStore = defineStore('characterAdmin', () => {
  // Modal state
  const modalState = ref<CharacterAdminModalState>({
    open: false,
    characterName: null,
    characterId: null,
    activeTab: 'events'
  });

  // Character details
  const character = ref<CharacterAdminDetails | null>(null);
  const characterLoading = ref(false);
  const characterError = ref<string | null>(null);

  // Account info
  const account = ref<AccountInfo | null>(null);
  const accountLoading = ref(false);

  // Corpses
  const corpses = ref<CharacterCorpse[]>([]);
  const corpsesLoading = ref(false);

  // Associates
  const associates = ref<CharacterAssociate[]>([]);
  const associatesLoading = ref(false);

  // Notes
  const notes = ref<AccountNote[]>([]);
  const notesLoading = ref(false);

  // Events
  const eventsState = ref<EventsState>({
    events: [],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 0,
    loading: false,
    filters: {
      sortBy: 'created_at',
      sortOrder: 'desc'
    }
  });

  // Event types and zones for filtering (cached)
  const eventTypes = ref<PlayerEventType[]>([]);
  const eventZones = ref<PlayerEventZone[]>([]);
  const filterDataLoaded = ref(false);

  // Character search
  const searchResults = ref<CharacterSearchResult[]>([]);
  const searchLoading = ref(false);

  // Watch list
  const isWatched = ref(false);
  const watchLoading = ref(false);
  const watchData = ref<CharacterWatch | null>(null);
  const fullWatchList = ref<CharacterWatch[]>([]);
  const directAssociatedCharacterIds = ref<number[]>([]); // Direct associations (orange border)
  const indirectAssociatedCharacterIds = ref<number[]>([]); // Indirect associations (yellow border)
  const watchListLoaded = ref(false);

  // Computed helpers
  const isOpen = computed(() => modalState.value.open);
  const activeTab = computed(() => modalState.value.activeTab);

  // Open the modal by character name
  async function openByName(name: string) {
    modalState.value = {
      open: true,
      characterName: name,
      characterId: null,
      activeTab: 'events'
    };

    // Reset all data
    resetData();

    // Load character details
    await loadCharacterByName(name);
  }

  // Open the modal by character ID
  async function openById(id: number) {
    modalState.value = {
      open: true,
      characterName: null,
      characterId: id,
      activeTab: 'events'
    };

    // Reset all data
    resetData();

    // Load character details
    await loadCharacterById(id);
  }

  // Close the modal
  function close() {
    modalState.value.open = false;
    // Don't clear data immediately to allow for smooth animation
  }

  // Reset all data
  function resetData() {
    character.value = null;
    characterError.value = null;
    account.value = null;
    corpses.value = [];
    associates.value = [];
    notes.value = [];
    eventsState.value = {
      events: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
      loading: false,
      filters: {
        sortBy: 'created_at',
        sortOrder: 'desc'
      }
    };
    searchResults.value = [];
    isWatched.value = false;
    watchData.value = null;
  }

  // Set active tab
  function setActiveTab(tab: CharacterAdminTab) {
    modalState.value.activeTab = tab;

    // Load data for the tab if needed
    if (character.value) {
      loadTabData(tab);
    }
  }

  // Load character by name
  async function loadCharacterByName(name: string) {
    characterLoading.value = true;
    characterError.value = null;

    try {
      character.value = await api.fetchCharacterByName(name);
      modalState.value.characterId = character.value.id;
      modalState.value.characterName = character.value.name;

      // Check watch status
      checkWatchStatus(character.value.id);

      // Load initial tab data
      await loadTabData(modalState.value.activeTab);

      // Preload filter data if not already loaded
      if (!filterDataLoaded.value) {
        loadFilterData();
      }
    } catch (err: any) {
      characterError.value = err?.response?.data?.message || err?.message || 'Failed to load character.';
      console.error('[CharacterAdminStore] Error loading character:', err);
    } finally {
      characterLoading.value = false;
    }
  }

  // Load character by ID
  async function loadCharacterById(id: number) {
    characterLoading.value = true;
    characterError.value = null;

    try {
      character.value = await api.fetchCharacterById(id);
      modalState.value.characterId = character.value.id;
      modalState.value.characterName = character.value.name;

      // Check watch status
      checkWatchStatus(character.value.id);

      // Load initial tab data
      await loadTabData(modalState.value.activeTab);

      // Preload filter data if not already loaded
      if (!filterDataLoaded.value) {
        loadFilterData();
      }
    } catch (err: any) {
      characterError.value = err?.response?.data?.message || err?.message || 'Failed to load character.';
      console.error('[CharacterAdminStore] Error loading character:', err);
    } finally {
      characterLoading.value = false;
    }
  }

  // Load data for a specific tab
  async function loadTabData(tab: CharacterAdminTab) {
    if (!character.value) return;

    switch (tab) {
      case 'events':
        await loadEvents();
        break;
      case 'associates':
        await loadAssociates();
        break;
      case 'account':
        await loadAccount();
        break;
      case 'corpses':
        await loadCorpses();
        break;
      case 'notes':
        await loadNotes();
        break;
      case 'inventory':
        // Inventory is handled by the existing inventory modal embedded in the tab
        break;
    }
  }

  // Load filter data (event types and zones)
  async function loadFilterData() {
    try {
      const [types, zones] = await Promise.all([
        api.fetchPlayerEventTypes(),
        api.fetchPlayerEventZones()
      ]);
      eventTypes.value = types;
      eventZones.value = zones;
      filterDataLoaded.value = true;
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading filter data:', err);
    }
  }

  // Load events
  async function loadEvents() {
    if (!character.value) return;

    eventsState.value.loading = true;
    try {
      const result = await api.fetchCharacterEvents(character.value.id, {
        page: eventsState.value.page,
        pageSize: eventsState.value.pageSize,
        ...eventsState.value.filters
      });
      eventsState.value.events = result.events;
      eventsState.value.total = result.total;
      eventsState.value.totalPages = result.totalPages;
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading events:', err);
    } finally {
      eventsState.value.loading = false;
    }
  }

  // Update events filters and reload
  async function updateEventsFilters(filters: Partial<CharacterEventFilters>) {
    eventsState.value.filters = { ...eventsState.value.filters, ...filters };
    eventsState.value.page = 1; // Reset to first page
    await loadEvents();
  }

  // Change events page
  async function setEventsPage(page: number) {
    eventsState.value.page = page;
    await loadEvents();
  }

  // Load associates
  async function loadAssociates() {
    if (!character.value) return;

    associatesLoading.value = true;
    try {
      associates.value = await api.fetchCharacterAssociates(character.value.id);
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading associates:', err);
    } finally {
      associatesLoading.value = false;
    }
  }

  // Load account info
  async function loadAccount() {
    if (!character.value) return;

    accountLoading.value = true;
    try {
      account.value = await api.fetchAccountInfo(character.value.accountId);
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading account:', err);
    } finally {
      accountLoading.value = false;
    }
  }

  // Load corpses
  async function loadCorpses() {
    if (!character.value) return;

    corpsesLoading.value = true;
    try {
      corpses.value = await api.fetchCharacterCorpses(character.value.id);
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading corpses:', err);
    } finally {
      corpsesLoading.value = false;
    }
  }

  // Load notes
  async function loadNotes() {
    if (!character.value) return;

    notesLoading.value = true;
    try {
      notes.value = await api.fetchAccountNotes(character.value.accountId);
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading notes:', err);
    } finally {
      notesLoading.value = false;
    }
  }

  // Search characters for manual association
  async function searchCharacters(query: string) {
    if (query.length < 2) {
      searchResults.value = [];
      return;
    }

    searchLoading.value = true;
    try {
      searchResults.value = await api.searchCharacters(query);
    } catch (err) {
      console.error('[CharacterAdminStore] Error searching characters:', err);
      searchResults.value = [];
    } finally {
      searchLoading.value = false;
    }
  }

  // Clear search results
  function clearSearchResults() {
    searchResults.value = [];
  }

  // Add manual association
  async function addAssociation(
    targetCharacterId: number,
    associationType: 'direct' | 'indirect' = 'indirect',
    reason?: string
  ) {
    if (!character.value) return;

    try {
      await api.addCharacterAssociation(character.value.id, targetCharacterId, associationType, reason);
      await loadAssociates(); // Reload associates
    } catch (err) {
      console.error('[CharacterAdminStore] Error adding association:', err);
      throw err;
    }
  }

  // Remove manual association
  async function removeAssociation(associationId: string) {
    try {
      await api.removeCharacterAssociation(associationId);
      await loadAssociates(); // Reload associates
    } catch (err) {
      console.error('[CharacterAdminStore] Error removing association:', err);
      throw err;
    }
  }

  // Create note
  async function createNote(content: string) {
    if (!character.value) return;

    try {
      const note = await api.createAccountNote(character.value.accountId, content);
      notes.value = [note, ...notes.value]; // Add to top of list
    } catch (err) {
      console.error('[CharacterAdminStore] Error creating note:', err);
      throw err;
    }
  }

  // Update note
  async function updateNote(noteId: string, content: string) {
    try {
      const updatedNote = await api.updateAccountNote(noteId, content);
      const index = notes.value.findIndex(n => n.id === noteId);
      if (index !== -1) {
        notes.value[index] = updatedNote;
      }
    } catch (err) {
      console.error('[CharacterAdminStore] Error updating note:', err);
      throw err;
    }
  }

  // Delete note
  async function deleteNote(noteId: string) {
    try {
      await api.deleteAccountNote(noteId);
      notes.value = notes.value.filter(n => n.id !== noteId);
    } catch (err) {
      console.error('[CharacterAdminStore] Error deleting note:', err);
      throw err;
    }
  }

  // Check watch status for a character
  async function checkWatchStatus(characterId: number) {
    try {
      const result = await api.checkCharacterWatch(characterId);
      isWatched.value = result.isWatched;
      watchData.value = result.watch;
    } catch (err) {
      console.error('[CharacterAdminStore] Error checking watch status:', err);
      isWatched.value = false;
      watchData.value = null;
    }
  }

  // Load the full watch list (with associated character IDs)
  async function loadWatchList() {
    try {
      const response = await api.fetchCharacterWatchList();
      fullWatchList.value = response.watchList;
      directAssociatedCharacterIds.value = response.directAssociatedCharacterIds;
      indirectAssociatedCharacterIds.value = response.indirectAssociatedCharacterIds;
      watchListLoaded.value = true;
    } catch (err) {
      console.error('[CharacterAdminStore] Error loading watch list:', err);
    }
  }

  // Toggle watch status
  async function toggleWatch() {
    if (!character.value) return;

    watchLoading.value = true;
    try {
      if (isWatched.value) {
        // Remove from watch list
        await api.removeCharacterWatch(character.value.id);
        isWatched.value = false;
        watchData.value = null;
      } else {
        // Add to watch list
        const watch = await api.addCharacterWatch(
          character.value.id,
          character.value.name,
          character.value.accountId
        );
        isWatched.value = true;
        watchData.value = watch;
      }
      // Reload full watch list to get updated associated character IDs
      await loadWatchList();
    } catch (err) {
      console.error('[CharacterAdminStore] Error toggling watch:', err);
    } finally {
      watchLoading.value = false;
    }
  }

  return {
    // State
    modalState,
    character,
    characterLoading,
    characterError,
    account,
    accountLoading,
    corpses,
    corpsesLoading,
    associates,
    associatesLoading,
    notes,
    notesLoading,
    eventsState,
    eventTypes,
    eventZones,
    searchResults,
    searchLoading,
    isWatched,
    watchLoading,
    watchData,
    fullWatchList,
    directAssociatedCharacterIds,
    indirectAssociatedCharacterIds,
    watchListLoaded,

    // Computed
    isOpen,
    activeTab,

    // Actions
    openByName,
    openById,
    close,
    setActiveTab,
    loadEvents,
    updateEventsFilters,
    setEventsPage,
    loadAssociates,
    loadAccount,
    loadCorpses,
    loadNotes,
    searchCharacters,
    clearSearchResults,
    addAssociation,
    removeAssociation,
    createNote,
    updateNote,
    deleteNote,
    loadWatchList,
    toggleWatch
  };
});
