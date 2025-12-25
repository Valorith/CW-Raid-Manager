<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="store.isModalVisible && store.hasMessages" class="debug-modal-backdrop" @click.self="store.hideModal">
        <div class="debug-modal">
          <header class="debug-modal__header">
            <div class="debug-modal__title">
              <span class="debug-modal__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <div>
                <h2>Webhook Debug Preview</h2>
                <p class="debug-modal__subtitle">{{ store.messageCount }} intercepted message{{ store.messageCount !== 1 ? 's' : '' }}</p>
              </div>
            </div>
            <div class="debug-modal__actions">
              <button class="debug-btn debug-btn--danger" @click="store.dismissAll">
                Dismiss All
              </button>
              <button class="debug-btn debug-btn--ghost" @click="store.hideModal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div class="debug-modal__body">
            <TransitionGroup name="message" tag="div" class="message-list">
              <div
                v-for="message in store.messages"
                :key="message.id"
                class="discord-message"
              >
                <div class="discord-message__header">
                  <div class="discord-message__meta">
                    <span class="discord-message__webhook-label">{{ message.webhookLabel }}</span>
                    <span class="discord-message__event">{{ message.eventLabel }}</span>
                    <span class="discord-message__time">{{ formatTime(message.timestamp) }}</span>
                  </div>
                  <button class="debug-btn debug-btn--small debug-btn--ghost" @click="store.dismissMessage(message.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div class="discord-preview">
                  <!-- Bot Avatar and Username -->
                  <div class="discord-preview__author">
                    <div class="discord-preview__avatar">
                      <img
                        v-if="message.payload.avatar_url"
                        :src="message.payload.avatar_url"
                        alt="Bot avatar"
                      />
                      <div v-else class="discord-preview__avatar-fallback">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                        </svg>
                      </div>
                    </div>
                    <div class="discord-preview__author-info">
                      <span class="discord-preview__username">{{ message.payload.username || 'Webhook' }}</span>
                      <span class="discord-preview__bot-tag">BOT</span>
                    </div>
                  </div>

                  <!-- Message Content -->
                  <div v-if="message.payload.content" class="discord-preview__content">
                    {{ message.payload.content }}
                  </div>

                  <!-- Embeds -->
                  <div v-if="message.payload.embeds?.length" class="discord-preview__embeds">
                    <div
                      v-for="(embed, index) in message.payload.embeds"
                      :key="index"
                      class="discord-embed"
                      :style="{ borderLeftColor: embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#5865f2' }"
                    >
                      <!-- Embed Title -->
                      <div v-if="embed.title" class="discord-embed__title">
                        {{ embed.title }}
                      </div>

                      <!-- Embed Description -->
                      <div v-if="embed.description" class="discord-embed__description" v-html="formatDescription(embed.description)">
                      </div>

                      <!-- Embed Fields -->
                      <div v-if="embed.fields?.length" class="discord-embed__fields">
                        <div
                          v-for="(field, fieldIndex) in embed.fields"
                          :key="fieldIndex"
                          class="discord-embed__field"
                          :class="{ 'discord-embed__field--inline': field.inline }"
                        >
                          <div class="discord-embed__field-name">{{ field.name }}</div>
                          <div class="discord-embed__field-value" v-html="formatDescription(field.value)"></div>
                        </div>
                      </div>

                      <!-- Embed Thumbnail -->
                      <div v-if="embed.thumbnail?.url" class="discord-embed__thumbnail">
                        <img :src="embed.thumbnail.url" alt="Thumbnail" />
                      </div>

                      <!-- Embed Footer -->
                      <div v-if="embed.footer || embed.timestamp" class="discord-embed__footer">
                        <span v-if="embed.footer?.text">{{ embed.footer.text }}</span>
                        <span v-if="embed.footer?.text && embed.timestamp" class="discord-embed__footer-sep"></span>
                        <span v-if="embed.timestamp">{{ formatEmbedTime(embed.timestamp) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useWebhookDebugStore } from '../stores/webhookDebug';

const store = useWebhookDebugStore();

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatEmbedTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDescription(text: string): string {
  if (!text) return '';

  // Convert markdown-style links to HTML links
  let formatted = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Convert **bold** to <strong>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em>
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Convert newlines to <br>
  formatted = formatted.replace(/\n/g, '<br>');

  // Handle Discord timestamp format <t:TIMESTAMP:FORMAT>
  formatted = formatted.replace(/<t:(\d+):([A-Za-z])>/g, (_, timestamp, format) => {
    const date = new Date(parseInt(timestamp) * 1000);
    switch (format) {
      case 'F':
        return date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      case 'f':
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      case 'D':
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'd':
        return date.toLocaleDateString('en-US');
      case 'T':
        return date.toLocaleTimeString('en-US');
      case 't':
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
      case 'R':
        return getRelativeTime(date);
      default:
        return date.toLocaleString();
    }
  });

  return formatted;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  return 'just now';
}
</script>

<style scoped>
.debug-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem;
  z-index: 10001;
  overflow-y: auto;
}

.debug-modal {
  width: min(700px, 100%);
  max-height: calc(100vh - 4rem);
  background: #2b2d31;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.debug-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #1e1f22;
  background: #1e1f22;
  border-radius: 8px 8px 0 0;
}

.debug-modal__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.debug-modal__icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #5865f2;
  border-radius: 50%;
  color: white;
}

.debug-modal__icon svg {
  width: 18px;
  height: 18px;
}

.debug-modal__title h2 {
  font-size: 16px;
  font-weight: 600;
  color: #f2f3f5;
  margin: 0;
}

.debug-modal__subtitle {
  font-size: 12px;
  color: #b5bac1;
  margin: 2px 0 0;
}

.debug-modal__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.message-list {
  display: flex;
  flex-direction: column;
}

.discord-message {
  padding: 16px 20px;
  border-bottom: 1px solid #3f4147;
}

.discord-message:last-child {
  border-bottom: none;
}

.discord-message__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.discord-message__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.discord-message__webhook-label {
  background: #5865f2;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.discord-message__event {
  color: #b5bac1;
}

.discord-message__time {
  color: #72767d;
}

.discord-preview {
  background: #313338;
  border-radius: 8px;
  padding: 12px 16px;
}

.discord-preview__author {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.discord-preview__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: #5865f2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.discord-preview__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.discord-preview__avatar-fallback {
  width: 24px;
  height: 24px;
  color: white;
}

.discord-preview__author-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.discord-preview__username {
  font-size: 16px;
  font-weight: 500;
  color: #f2f3f5;
}

.discord-preview__bot-tag {
  background: #5865f2;
  color: white;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.discord-preview__content {
  color: #dbdee1;
  font-size: 15px;
  line-height: 1.4;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.discord-preview__embeds {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.discord-embed {
  background: #2b2d31;
  border-left: 4px solid #5865f2;
  border-radius: 4px;
  padding: 12px 16px;
  max-width: 520px;
  position: relative;
}

.discord-embed__title {
  font-size: 16px;
  font-weight: 600;
  color: #00aff4;
  margin-bottom: 8px;
}

.discord-embed__description {
  font-size: 14px;
  color: #dbdee1;
  line-height: 1.4;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.discord-embed__description :deep(a) {
  color: #00aff4;
  text-decoration: none;
}

.discord-embed__description :deep(a:hover) {
  text-decoration: underline;
}

.discord-embed__description :deep(strong) {
  font-weight: 600;
  color: #f2f3f5;
}

.discord-embed__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.discord-embed__field {
  flex: 0 0 100%;
}

.discord-embed__field--inline {
  flex: 0 0 calc(33.333% - 6px);
  min-width: 120px;
}

.discord-embed__field-name {
  font-size: 14px;
  font-weight: 600;
  color: #f2f3f5;
  margin-bottom: 4px;
}

.discord-embed__field-value {
  font-size: 14px;
  color: #dbdee1;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.discord-embed__field-value :deep(a) {
  color: #00aff4;
  text-decoration: none;
}

.discord-embed__field-value :deep(a:hover) {
  text-decoration: underline;
}

.discord-embed__thumbnail {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 80px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
}

.discord-embed__thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.discord-embed__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #a3a6aa;
  margin-top: 8px;
}

.discord-embed__footer-sep::before {
  content: '\2022';
}

/* Buttons */
.debug-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.debug-btn--danger {
  background: #ed4245;
  color: white;
}

.debug-btn--danger:hover {
  background: #c53235;
}

.debug-btn--ghost {
  background: transparent;
  color: #b5bac1;
  padding: 6px;
}

.debug-btn--ghost:hover {
  background: rgba(79, 84, 92, 0.4);
  color: #f2f3f5;
}

.debug-btn--ghost svg {
  width: 20px;
  height: 20px;
}

.debug-btn--small {
  padding: 4px;
}

.debug-btn--small svg {
  width: 16px;
  height: 16px;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .debug-modal,
.modal-leave-active .debug-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from .debug-modal,
.modal-leave-to .debug-modal {
  transform: translateY(-20px);
}

.message-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.message-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.message-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.message-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* Scrollbar styling */
.debug-modal__body::-webkit-scrollbar {
  width: 8px;
}

.debug-modal__body::-webkit-scrollbar-track {
  background: #2b2d31;
}

.debug-modal__body::-webkit-scrollbar-thumb {
  background: #1a1b1e;
  border-radius: 4px;
}

.debug-modal__body::-webkit-scrollbar-thumb:hover {
  background: #232428;
}
</style>
