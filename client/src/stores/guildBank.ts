import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type GuildBankSnapshot, type UserCharacter } from '../services/api';

interface InventoryModalState {
    open: boolean;
    guildId: string | null;
    characterName: string | null;
    highlightSlotId: number | null;
}

export const useGuildBankStore = defineStore('guildBank', () => {
    const snapshot = ref<GuildBankSnapshot | null>(null);
    const loadedGuildId = ref<string | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const lastFetchedAt = ref<number | null>(null);

    const modalState = ref<InventoryModalState>({
        open: false,
        guildId: null,
        characterName: null,
        highlightSlotId: null
    });

    const canRefreshNow = computed(() => {
        if (!lastFetchedAt.value) return true;
        return Date.now() - lastFetchedAt.value >= 5 * 60 * 1000; // 5 minutes
    });

    async function fetchSnapshot(guildId: string, force = false) {
        if (loading.value) {
            console.log('[GuildBankStore] Already loading snapshot for', guildId);
            return;
        }
        if (!force && !canRefreshNow.value && snapshot.value && loadedGuildId.value === guildId) {
            console.log('[GuildBankStore] Using cached snapshot for', guildId);
            return;
        }

        loading.value = true;
        error.value = null;
        try {
            console.log(`[GuildBankStore] Fetching snapshot for guild ${guildId}`);

            // Fetch both the bank snapshot (items) and the full guild roster (all characters)
            const [bankResult, guildDetail] = await Promise.all([
                api.fetchGuildBank(guildId),
                api.fetchGuildDetail(guildId)
            ]);

            // Create a map of existing bank characters for easy lookup
            const characterMap = new Map(bankResult.characters.map(c => [c.name.toLowerCase(), c]));

            // Merge in any guild members that aren't in the bank snapshot
            if (guildDetail && Array.isArray(guildDetail.characters)) {
                for (const member of guildDetail.characters) {
                    const lowerName = member.name.toLowerCase();
                    if (!characterMap.has(lowerName)) {
                        characterMap.set(lowerName, {
                            id: member.id,
                            name: member.name,
                            userId: member.user?.id ?? null,
                            isPersonal: false,
                            createdAt: '',
                            foundInEq: false,
                            class: member.class
                        });
                    }
                }
            }

            // Update the snapshot with the merged character list
            snapshot.value = {
                ...bankResult,
                characters: Array.from(characterMap.values())
            };

            loadedGuildId.value = guildId;
            lastFetchedAt.value = Date.now();
            if (snapshot.value) {
                console.log(`[GuildBankStore] Loaded ${snapshot.value.characters.length} characters (merged) for guild ${guildId}`);
                console.log(`[GuildBankStore] Loaded ${snapshot.value.items.length} items total.`);

                // Debug: Check for specific character items
                const toggItems = snapshot.value.items.filter(i => i.characterName.toLowerCase().includes('togg'));
                if (toggItems.length > 0) {
                    console.log(`[GuildBankStore] Found ${toggItems.length} items for Togg in snapshot.`);
                } else {
                    console.log('[GuildBankStore] No items found for Togg in snapshot.');
                }

                // Debug: log first few characters
                console.log('[GuildBankStore] Sample characters:', snapshot.value.characters.slice(0, 5).map(c => c.name));
            }
        } catch (err: any) {
            error.value = err?.message ?? 'Failed to load guild bank.';
            console.error('[GuildBankStore] Error loading snapshot:', err);
        } finally {
            loading.value = false;
        }
    }

    function openModal(guildId: string, characterName: string, slotId?: number) {
        console.log(`[GuildBankStore] openModal called for ${characterName} in guild ${guildId}`);
        modalState.value = {
            open: true,
            guildId,
            characterName,
            highlightSlotId: slotId ?? null
        };

        // Ensure we have data for this guild
        if (!snapshot.value || loadedGuildId.value !== guildId) {
            console.log('[GuildBankStore] Snapshot missing or mismatch, fetching...');
            fetchSnapshot(guildId);
        } else {
            // Check if character exists
            const found = snapshot.value.characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
            if (!found) {
                console.warn(`[GuildBankStore] Character ${characterName} not found in loaded snapshot. Force refreshing...`);
                fetchSnapshot(guildId, true);
            } else {
                console.log(`[GuildBankStore] Character ${characterName} found.`);
            }

            // Debug: Fuzzy search for items
            if (snapshot.value && snapshot.value.items) {
                const searchName = characterName.toLowerCase();
                const matches = snapshot.value.items
                    .filter(i => i.characterName.toLowerCase().includes(searchName))
                    .map(i => i.characterName);
                const uniqueMatches = [...new Set(matches)];

                if (uniqueMatches.length > 0) {
                    console.log(`[GuildBankStore] Fuzzy search found items for: ${uniqueMatches.join(', ')}`);
                } else {
                    console.log(`[GuildBankStore] Fuzzy search found NO items containing '${searchName}'`);
                    // Log a few random item owners to verify data structure
                    const sampleOwners = [...new Set(snapshot.value.items.slice(0, 10).map(i => i.characterName))];
                    console.log(`[GuildBankStore] Sample item owners: ${sampleOwners.join(', ')}`);
                }
            }
        }
    }

    function closeModal() {
        modalState.value.open = false;
        modalState.value.highlightSlotId = null;
    }

    const userCharacters = ref<UserCharacter[]>([]);

    async function fetchUserCharacters() {
        if (userCharacters.value.length > 0) return;
        try {
            const chars = await api.fetchUserCharacters();
            userCharacters.value = chars;
        } catch (e) {
            console.error('[GuildBankStore] Failed to fetch user characters', e);
        }
    }

    async function openCharacterInventory(characterName: string, contextGuildId: string) {
        // Action to open inventory with smart lookup
        // 1. Sanitize name
        const firstName = characterName.split(' ')[0];
        const lowerName = firstName.toLowerCase();

        if (['unknown', 'guild', 'master', 'master looter'].includes(lowerName)) {
            console.log('[GuildBankStore] Ignoring invalid name:', firstName);
            return;
        }

        // 2. Ensure snapshot is loaded for this context to prevent race conditions
        if (!snapshot.value || loadedGuildId.value !== contextGuildId) {
            console.log(`[GuildBankStore] Context mismatch (loaded: ${loadedGuildId.value}, needed: ${contextGuildId}), loading snapshot first...`);
            await fetchSnapshot(contextGuildId);
        }

        // 3. Try to find character in current snapshot first (fastest)
        if (snapshot.value && loadedGuildId.value === contextGuildId) {
            const found = snapshot.value.characters.find(c => c.name.toLowerCase() === lowerName);
            // Only use snapshot if we actually have items for this character.
            // If they are in the character list (e.g. from roster merge) but have no items,
            // we should try a direct lookup to be sure.
            const hasItems = snapshot.value.items.some(i => i.characterName.toLowerCase() === lowerName);

            if (found && hasItems) {
                console.log(`[GuildBankStore] Character ${firstName} found in current snapshot with items.`);
                openModal(contextGuildId, firstName);
                return;
            } else if (found) {
                console.log(`[GuildBankStore] Character ${firstName} found in snapshot but has 0 items. Attempting direct lookup...`);
            }
        }

        // 4. Try direct lookup via new API
        console.log(`[GuildBankStore] Character ${firstName} not in snapshot, attempting direct lookup...`);
        try {
            const items = await api.fetchCharacterInventory(firstName);
            console.log(`[GuildBankStore] Direct lookup found ${items.length} items for ${firstName}`);

            if (!snapshot.value) {
                snapshot.value = { characters: [], items: [], missingCharacters: [] };
            }

            // Remove any existing items for this character to avoid duplicates
            const otherItems = snapshot.value.items.filter(i => i.characterName.toLowerCase() !== lowerName);

            // Add new items
            snapshot.value.items = [...otherItems, ...items];

            // Ensure character is in the list so the modal doesn't complain
            if (!snapshot.value.characters.find(c => c.name.toLowerCase() === lowerName)) {
                snapshot.value.characters.push({
                    id: 'direct-lookup',
                    name: firstName,
                    userId: null,
                    isPersonal: false,
                    createdAt: new Date().toISOString(),
                    foundInEq: true,
                    class: 'UNKNOWN'
                });
            }

            openModal(contextGuildId, firstName);

        } catch (e) {
            console.error(`[GuildBankStore] Direct lookup failed for ${firstName}`, e);
            // Fallback to opening modal anyway, it will show empty state
            openModal(contextGuildId, firstName);
        }
    }

    return {
        snapshot,
        loading,
        error,
        lastFetchedAt,
        modalState,
        userCharacters,
        fetchSnapshot,
        fetchUserCharacters,
        openModal,
        closeModal,
        openCharacterInventory
    };
});
