import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';

export interface DebugWebhookMessage {
  id: string;
  guildId: string;
  guildName: string;
  event: string;
  eventLabel: string;
  payload: DiscordWebhookBody;
  timestamp: string;
  webhookLabel: string;
}

interface DiscordWebhookBody {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
    thumbnail?: { url: string };
  }>;
  username?: string;
  avatar_url?: string;
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
  };
}

export const useWebhookDebugStore = defineStore('webhookDebug', () => {
  // State
  const messages = ref<DebugWebhookMessage[]>([]);
  const isConnected = ref(false);
  const debugModeEnabled = ref(false);
  const connectedGuildId = ref<string | null>(null);
  const isModalVisible = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // SSE event source
  let eventSource: EventSource | null = null;

  // Computed
  const messageCount = computed(() => messages.value.length);
  const hasMessages = computed(() => messages.value.length > 0);

  // Actions

  /**
   * Fetch the debug mode status for a guild
   */
  async function fetchDebugMode(guildId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const enabled = await api.fetchWebhookDebugMode(guildId);
      debugModeEnabled.value = enabled;
      return enabled;
    } catch (err) {
      error.value = 'Failed to fetch debug mode status';
      console.error('Failed to fetch webhook debug mode:', err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Toggle debug mode for a guild
   */
  async function setDebugMode(guildId: string, enabled: boolean): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.setWebhookDebugMode(guildId, enabled);
      debugModeEnabled.value = result;

      // If enabling debug mode, start listening for messages
      if (result) {
        await connect(guildId);
      } else {
        disconnect();
      }

      return result;
    } catch (err) {
      error.value = 'Failed to update debug mode';
      console.error('Failed to set webhook debug mode:', err);
      return debugModeEnabled.value;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Connect to the SSE stream for a guild
   */
  async function connect(guildId: string): Promise<void> {
    // Disconnect any existing connection
    disconnect();

    try {
      eventSource = new EventSource(`/api/guilds/${guildId}/webhooks/debug/stream`, {
        withCredentials: true
      });

      eventSource.onopen = () => {
        isConnected.value = true;
        connectedGuildId.value = guildId;
        error.value = null;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection confirmation
          if (data.type === 'connected') {
            return;
          }

          // Handle debug webhook message
          if (data.id && data.payload) {
            const message: DebugWebhookMessage = data;
            messages.value.unshift(message);

            // Show the modal when a new message arrives
            isModalVisible.value = true;

            // Limit stored messages to prevent memory issues
            if (messages.value.length > 100) {
              messages.value = messages.value.slice(0, 100);
            }
          }
        } catch (err) {
          console.error('Failed to parse webhook debug message:', err);
        }
      };

      eventSource.onerror = () => {
        isConnected.value = false;
        error.value = 'Connection lost. Attempting to reconnect...';

        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (debugModeEnabled.value && connectedGuildId.value === guildId) {
            connect(guildId);
          }
        }, 5000);
      };
    } catch (err) {
      error.value = 'Failed to connect to debug stream';
      console.error('Failed to connect to webhook debug stream:', err);
    }
  }

  /**
   * Disconnect from the SSE stream
   */
  function disconnect(): void {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isConnected.value = false;
    connectedGuildId.value = null;
  }

  /**
   * Dismiss a single message
   */
  function dismissMessage(messageId: string): void {
    messages.value = messages.value.filter((m) => m.id !== messageId);

    // Hide modal if no messages left
    if (messages.value.length === 0) {
      isModalVisible.value = false;
    }
  }

  /**
   * Dismiss all messages
   */
  function dismissAll(): void {
    messages.value = [];
    isModalVisible.value = false;
  }

  /**
   * Show the debug modal
   */
  function showModal(): void {
    isModalVisible.value = true;
  }

  /**
   * Hide the debug modal
   */
  function hideModal(): void {
    isModalVisible.value = false;
  }

  /**
   * Initialize the store for a guild (called when admin changes guild context)
   */
  async function initialize(guildId: string): Promise<void> {
    const enabled = await fetchDebugMode(guildId);
    if (enabled) {
      await connect(guildId);
    }
  }

  /**
   * Clean up the store (called on unmount or logout)
   */
  function cleanup(): void {
    disconnect();
    messages.value = [];
    debugModeEnabled.value = false;
    isModalVisible.value = false;
    error.value = null;
  }

  return {
    // State
    messages,
    isConnected,
    debugModeEnabled,
    connectedGuildId,
    isModalVisible,
    loading,
    error,
    // Computed
    messageCount,
    hasMessages,
    // Actions
    fetchDebugMode,
    setDebugMode,
    connect,
    disconnect,
    dismissMessage,
    dismissAll,
    showModal,
    hideModal,
    initialize,
    cleanup
  };
});
