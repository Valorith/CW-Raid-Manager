import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type GuildBankSnapshot } from '../services/api';

interface InventoryModalState {
    open: boolean;
    guildId: string | null;
    characterName: string | null;
    highlightSlotId: number | null;
}

export const useGuildBankStore = defineStore('guildBank', () => {
    const snapshot = ref<GuildBankSnapshot | null>(null);
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
        if (loading.value) return;
        if (!force && !canRefreshNow.value && snapshot.value) return;

        loading.value = true;
        error.value = null;
        try {
            const result = await api.fetchGuildBank(guildId);
            snapshot.value = result;
            lastFetchedAt.value = Date.now();
        } catch (err: any) {
            error.value = err?.message ?? 'Failed to load guild bank.';
            console.error(err);
        } finally {
            loading.value = false;
        }
    }

    function openModal(guildId: string, characterName: string, slotId?: number) {
        modalState.value = {
            open: true,
            guildId,
            characterName,
            highlightSlotId: slotId ?? null
        };

        // Ensure we have data for this guild
        if (!snapshot.value || snapshot.value.guildId !== guildId) {
            fetchSnapshot(guildId);
        }
    }

    function closeModal() {
        modalState.value.open = false;
        modalState.value.highlightSlotId = null;
    }

    return {
        snapshot,
        loading,
        error,
        lastFetchedAt,
        modalState,
        fetchSnapshot,
        openModal,
        closeModal
    };
});
