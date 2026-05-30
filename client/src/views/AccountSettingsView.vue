<template>
  <section class="settings">
    <header class="settings__header">
      <h1>Account Settings</h1>
      <p class="muted">Customize how other players see your name across the app.</p>
    </header>

    <GlobalLoadingSpinner v-if="showLoading" />

    <div v-else-if="!profile" class="card card--center">
      <p class="muted">We couldn’t load your account details. Please reload and try again.</p>
    </div>

    <div v-else class="card settings__content">
      <form class="form" @submit.prevent="saveNickname">
        <div class="form__field">
          <label for="nickname">Nickname</label>
          <input
            id="nickname"
            v-model="nickname"
            type="text"
            maxlength="40"
            placeholder="Optional nickname"
          />
          <p class="hint muted">2–40 characters. Leave blank to fall back to your account name.</p>
          <p v-if="nicknameValidationMessage" class="form__error">
            {{ nicknameValidationMessage }}
          </p>
        </div>

        <div class="preview">
          <h2>Preview</h2>
          <p class="preview__name">{{ previewName }}</p>
          <p class="muted small">
            This is how your name will appear to guild members, raid leaders, and across attendance
            logs.
          </p>
        </div>

        <div class="reference">
          <h3 class="reference__title">Account Name</h3>
          <p class="reference__value">{{ profile.displayName }}</p>
          <p class="muted small">Provided by your sign-in provider. This value is read-only.</p>
        </div>

        <div v-if="errorMessage" class="alert alert--error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="alert alert--success">{{ successMessage }}</div>

        <div class="actions">
          <button
            class="btn btn--outline"
            type="button"
            :disabled="saving || !isDirty"
            @click="resetNickname"
          >
            Reset
          </button>
          <button class="btn" type="submit" :disabled="saving || !isDirty || !isNicknameValid">
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </form>

      <section class="connected-accounts">
        <div class="connected-accounts__header">
          <h2>Connected Accounts</h2>
          <p class="muted small">
            Link additional sign-in providers to your account. You can then sign in with any linked
            provider.
          </p>
        </div>

        <div v-if="linkedProvidersLoading" class="connected-accounts__loading">
          <span class="muted">Loading...</span>
        </div>

        <div v-else class="connected-accounts__providers">
          <div class="provider-card">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--google">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">Google</span>
                <span
                  class="provider-card__status"
                  :class="linkedProviders.google ? 'provider-card__status--linked' : ''"
                >
                  {{ linkedProviders.google ? 'Connected' : 'Not connected' }}
                </span>
              </div>
            </div>
            <button
              v-if="linkedProviders.google"
              class="btn btn--danger btn--small"
              :disabled="unlinkingGoogle || !canUnlinkGoogle"
              :title="canUnlinkGoogle ? '' : 'You must have at least one login method'"
              @click="handleUnlinkGoogle"
            >
              {{ unlinkingGoogle ? 'Unlinking...' : 'Unlink' }}
            </button>
            <a v-else href="/api/auth/google/link" class="btn btn--success btn--small"
              >Link Google</a
            >
          </div>

          <div class="provider-card">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--discord">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">Discord</span>
                <span
                  class="provider-card__status"
                  :class="linkedProviders.discord ? 'provider-card__status--linked' : ''"
                >
                  {{ linkedProviders.discord ? 'Connected' : 'Not connected' }}
                </span>
              </div>
            </div>
            <button
              v-if="linkedProviders.discord"
              class="btn btn--danger btn--small"
              :disabled="unlinkingDiscord || !canUnlinkDiscord"
              :title="canUnlinkDiscord ? '' : 'You must have at least one login method'"
              @click="handleUnlinkDiscord"
            >
              {{ unlinkingDiscord ? 'Unlinking...' : 'Unlink' }}
            </button>
            <a v-else href="/api/auth/discord/link" class="btn btn--success btn--small"
              >Link Discord</a
            >
          </div>
        </div>

        <div class="passkeys-panel">
          <div class="passkeys-panel__header">
            <div>
              <h3>Passkeys</h3>
              <p class="muted small">
                Sign in with your device unlock. Keep Google or Discord linked as a fallback.
              </p>
            </div>
            <button
              type="button"
              class="btn btn--success btn--small"
              :disabled="registeringPasskey || !passkeysSupported"
              :title="passkeysSupported ? '' : 'This browser does not support passkeys'"
              @click="handleAddPasskey"
            >
              {{ registeringPasskey ? 'Creating...' : 'Add Passkey' }}
            </button>
          </div>

          <div v-if="passkeysLoading" class="connected-accounts__loading">
            <span class="muted">Loading passkeys...</span>
          </div>
          <div v-else-if="passkeys.length === 0" class="passkeys-empty">
            <span>No passkeys yet.</span>
          </div>
          <div v-else class="passkey-list">
            <article v-for="passkey in passkeys" :key="passkey.id" class="passkey-card">
              <div class="provider-card__info">
                <div class="provider-card__icon provider-card__icon--passkey" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
                    <circle cx="8" cy="15" r="4" stroke-width="2" />
                    <path d="M11 12 21 2" stroke-width="2" stroke-linecap="round" />
                    <path d="m16 7 2 2 3-3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
                <div class="provider-card__details passkey-card__details">
                  <template v-if="editingPasskeyId === passkey.id">
                    <input
                      v-model="passkeyDraftName"
                      class="passkey-card__name-input"
                      maxlength="64"
                      @keyup.enter="handleSavePasskeyName(passkey.id)"
                      @keyup.esc="cancelRenamePasskey"
                    />
                  </template>
                  <template v-else>
                    <span class="provider-card__name">{{ passkey.name }}</span>
                    <span class="provider-card__status">
                      {{ describePasskey(passkey) }}
                    </span>
                  </template>
                </div>
              </div>
              <div class="provider-card__actions">
                <template v-if="editingPasskeyId === passkey.id">
                  <button
                    type="button"
                    class="btn btn--success btn--small"
                    :disabled="renamingPasskey"
                    @click="handleSavePasskeyName(passkey.id)"
                  >
                    {{ renamingPasskey ? 'Saving...' : 'Save' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    :disabled="renamingPasskey"
                    @click="cancelRenamePasskey"
                  >
                    Cancel
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="btn btn--outline btn--small"
                    @click="startRenamePasskey(passkey)"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    class="btn btn--danger btn--small"
                    :disabled="deletingPasskeyId === passkey.id || !canDeletePasskey"
                    :title="canDeletePasskey ? '' : 'You must have at least one login method'"
                    @click="handleDeletePasskey(passkey.id)"
                  >
                    {{ deletingPasskeyId === passkey.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </template>
              </div>
            </article>
          </div>
        </div>

        <div v-if="linkedProvidersError" class="alert alert--error">{{ linkedProvidersError }}</div>
        <div v-if="linkedProvidersSuccess" class="alert alert--success">
          {{ linkedProvidersSuccess }}
        </div>
      </section>

      <section class="messenger-notifications">
        <div class="messenger-notifications__header">
          <div>
            <h2>Messenger Notifications</h2>
            <p class="muted small">
              Connect Telegram or WhatsApp once, then choose which guild and market alerts should
              reach you there.
            </p>
          </div>
          <button
            type="button"
            class="btn btn--outline btn--small"
            :disabled="notificationsLoading"
            @click="refreshNotificationChannels"
          >
            {{ notificationsLoading ? 'Refreshing...' : 'Refresh Status' }}
          </button>
        </div>

        <div class="messenger-grid">
          <article class="provider-card provider-card--messenger">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--telegram" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M21.12 4.52 3.84 11.18c-1.18.47-1.17 1.13-.21 1.42l4.43 1.38 1.71 5.45c.21.59.11.83.73.83.48 0 .69-.22.96-.49l2.42-2.35 5.04 3.72c.93.51 1.6.25 1.83-.86l2.95-13.9c.34-1.36-.52-1.98-1.58-1.5ZM9.02 13.66l10.1-6.37c.5-.3.95-.14.57.2l-8.65 7.8-.34 3.73-1.68-5.36Z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">Telegram</span>
                <span class="provider-card__status" :class="getMessengerStatus('TELEGRAM').tone">
                  {{ getMessengerStatus('TELEGRAM').label }}
                </span>
                <span class="muted small">{{ getMessengerStatus('TELEGRAM').detail }}</span>
              </div>
            </div>

            <div class="provider-card__actions">
              <button
                v-if="telegramChannel?.status === 'ACTIVE'"
                type="button"
                class="btn btn--outline btn--small"
                :disabled="notificationBusyProvider === 'TELEGRAM'"
                @click="sendTestMessage('TELEGRAM')"
              >
                {{ notificationBusyProvider === 'TELEGRAM' ? 'Sending...' : 'Send Test Message' }}
              </button>
              <button
                v-if="telegramChannel?.status === 'ACTIVE'"
                type="button"
                class="btn btn--danger btn--small"
                :disabled="notificationBusyProvider === 'TELEGRAM'"
                @click="disconnectMessenger('TELEGRAM')"
              >
                Disconnect
              </button>
              <button
                v-else
                type="button"
                class="btn btn--success btn--small"
                :disabled="
                  connectingProvider === 'TELEGRAM' || !canStartMessengerConnect('TELEGRAM')
                "
                @click="beginMessengerConnect('TELEGRAM')"
              >
                {{
                  !canStartMessengerConnect('TELEGRAM')
                    ? 'Unavailable'
                    : connectingProvider === 'TELEGRAM'
                      ? 'Opening...'
                      : 'Connect Telegram'
                }}
              </button>
            </div>

            <div v-if="linkSessions.TELEGRAM" class="provider-card__setup">
              <p class="provider-card__setup-title">What happens next</p>
              <p class="muted small">
                Telegram opened the bot link. If it did not, use one of the fallback actions below,
                then send the command shown here.
              </p>
              <code class="provider-card__code">{{ linkSessions.TELEGRAM.fallbackText }}</code>
              <div class="provider-card__setup-actions">
                <a
                  class="btn btn--outline btn--small"
                  :href="linkSessions.TELEGRAM.deepLinkUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Telegram Again
                </a>
                <button
                  type="button"
                  class="btn btn--outline btn--small"
                  @click="copyText(linkSessions.TELEGRAM.fallbackText, 'Telegram Code Copied')"
                >
                  Copy Code
                </button>
                <button
                  type="button"
                  class="btn btn--outline btn--small"
                  @click="refreshNotificationChannels"
                >
                  I Already Sent It
                </button>
              </div>
            </div>
          </article>

          <article class="provider-card provider-card--messenger">
            <div class="provider-card__info">
              <div class="provider-card__icon provider-card__icon--whatsapp" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path
                    d="M19.11 4.89A9.9 9.9 0 0 0 12.06 2C6.56 2 2.08 6.48 2.08 11.98c0 1.76.46 3.48 1.33 5L2 22l5.18-1.36a9.87 9.87 0 0 0 4.87 1.24h.01c5.5 0 9.98-4.48 9.98-9.98a9.9 9.9 0 0 0-2.93-7.01ZM12.06 20.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.08.81.82-3-.2-.31a8.18 8.18 0 0 1-1.27-4.39c0-4.52 3.69-8.2 8.22-8.2 2.2 0 4.26.85 5.82 2.4a8.15 8.15 0 0 1 2.4 5.8c0 4.53-3.69 8.22-8.22 8.22Zm4.5-6.13c-.25-.13-1.46-.72-1.69-.8-.23-.08-.4-.13-.57.12-.17.25-.66.8-.8.96-.15.17-.3.19-.55.07-.25-.13-1.07-.39-2.04-1.24-.75-.67-1.26-1.49-1.41-1.74-.15-.25-.02-.39.11-.52.12-.12.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.57-1.36-.78-1.86-.2-.49-.4-.42-.56-.43l-.48-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.43 1.02 2.6.13.17 1.77 2.71 4.29 3.8.6.26 1.08.41 1.45.53.61.19 1.16.16 1.6.1.49-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.12-.23-.18-.48-.3Z"
                  />
                </svg>
              </div>
              <div class="provider-card__details">
                <span class="provider-card__name">WhatsApp</span>
                <span class="provider-card__status" :class="getMessengerStatus('WHATSAPP').tone">
                  {{ getMessengerStatus('WHATSAPP').label }}
                </span>
                <span class="muted small">{{ getMessengerStatus('WHATSAPP').detail }}</span>
              </div>
            </div>

            <div class="provider-card__actions">
              <button
                v-if="whatsappChannel?.status === 'ACTIVE'"
                type="button"
                class="btn btn--outline btn--small"
                :disabled="notificationBusyProvider === 'WHATSAPP'"
                @click="sendTestMessage('WHATSAPP')"
              >
                {{ notificationBusyProvider === 'WHATSAPP' ? 'Sending...' : 'Send Test Message' }}
              </button>
              <button
                v-if="whatsappChannel?.status === 'ACTIVE'"
                type="button"
                class="btn btn--danger btn--small"
                :disabled="notificationBusyProvider === 'WHATSAPP'"
                @click="disconnectMessenger('WHATSAPP')"
              >
                Disconnect
              </button>
              <button
                v-else
                type="button"
                class="btn btn--success btn--small"
                :disabled="
                  connectingProvider === 'WHATSAPP' || !canStartMessengerConnect('WHATSAPP')
                "
                @click="beginMessengerConnect('WHATSAPP')"
              >
                {{
                  !canStartMessengerConnect('WHATSAPP')
                    ? 'Unavailable'
                    : connectingProvider === 'WHATSAPP'
                      ? 'Opening...'
                      : 'Connect WhatsApp'
                }}
              </button>
            </div>

            <div v-if="linkSessions.WHATSAPP" class="provider-card__setup">
              <p class="provider-card__setup-title">What happens next</p>
              <p class="muted small">
                WhatsApp should open with a prefilled connect message. If it did not, copy the
                message below or open the link again.
              </p>
              <code class="provider-card__code">{{ linkSessions.WHATSAPP.fallbackText }}</code>
              <div class="provider-card__setup-actions">
                <a
                  class="btn btn--outline btn--small"
                  :href="linkSessions.WHATSAPP.deepLinkUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open WhatsApp Again
                </a>
                <button
                  type="button"
                  class="btn btn--outline btn--small"
                  @click="copyText(linkSessions.WHATSAPP.fallbackText, 'WhatsApp Message Copied')"
                >
                  Copy Message
                </button>
                <button
                  type="button"
                  class="btn btn--outline btn--small"
                  @click="refreshNotificationChannels"
                >
                  I Already Sent It
                </button>
              </div>
            </div>
          </article>
        </div>

        <div class="preferences-grid">
          <article class="preferences-panel">
            <header class="preferences-panel__header">
              <h3>Market Alerts</h3>
              <p class="muted small">
                These account-level alerts cover all market sales, watched items, watched
                characters, and `My Traders` events.
              </p>
            </header>

            <div v-if="notificationsLoading" class="muted small">
              Loading notification preferences...
            </div>
            <div v-else class="preference-list">
              <div
                v-for="preference in marketAlertPreferences"
                :key="`${preference.scopeType}:${preference.scopeId}:${preference.eventKey}`"
                class="preference-row"
              >
                <label class="preference-row__main">
                  <input
                    type="checkbox"
                    :checked="preference.isEnabled"
                    @change="
                      updateNotificationPreference(preference, {
                        isEnabled: ($event.target as HTMLInputElement).checked
                      })
                    "
                  />
                  <span>
                    <strong>{{ preference.eventLabel }}</strong>
                    <small class="muted">{{ preference.eventDescription }}</small>
                  </span>
                </label>
                <div class="preference-row__providers">
                  <label class="provider-toggle">
                    <input
                      type="checkbox"
                      :checked="preference.providerTargets.TELEGRAM !== false"
                      @change="
                        updateNotificationPreference(preference, {
                          providerTargets: {
                            ...preference.providerTargets,
                            TELEGRAM: ($event.target as HTMLInputElement).checked
                          }
                        })
                      "
                    />
                    <span>Telegram</span>
                  </label>
                  <label class="provider-toggle">
                    <input
                      type="checkbox"
                      :checked="preference.providerTargets.WHATSAPP !== false"
                      @change="
                        updateNotificationPreference(preference, {
                          providerTargets: {
                            ...preference.providerTargets,
                            WHATSAPP: ($event.target as HTMLInputElement).checked
                          }
                        })
                      "
                    />
                    <span>WhatsApp</span>
                  </label>
                </div>
              </div>
            </div>
          </article>

          <article v-if="authStore.isAdmin" class="preferences-panel">
            <header class="preferences-panel__header">
              <h3>Admin Alerts</h3>
              <p class="muted small">
                Administrator-only alerts for server health and operational follow-up.
              </p>
            </header>

            <div v-if="notificationsLoading" class="muted small">
              Loading admin preferences...
            </div>
            <div v-else class="preference-list">
              <div
                v-for="preference in adminAlertPreferences"
                :key="`${preference.scopeType}:${preference.scopeId}:${preference.eventKey}`"
                class="preference-row"
              >
                <label class="preference-row__main">
                  <input
                    type="checkbox"
                    :checked="preference.isEnabled"
                    @change="
                      updateNotificationPreference(preference, {
                        isEnabled: ($event.target as HTMLInputElement).checked
                      })
                    "
                  />
                  <span>
                    <strong>{{ preference.eventLabel }}</strong>
                    <small class="muted">{{ preference.eventDescription }}</small>
                  </span>
                </label>
                <div class="preference-row__providers">
                  <label class="provider-toggle">
                    <input
                      type="checkbox"
                      :checked="preference.providerTargets.TELEGRAM !== false"
                      @change="
                        updateNotificationPreference(preference, {
                          providerTargets: {
                            ...preference.providerTargets,
                            TELEGRAM: ($event.target as HTMLInputElement).checked
                          }
                        })
                      "
                    />
                    <span>Telegram</span>
                  </label>
                  <label class="provider-toggle">
                    <input
                      type="checkbox"
                      :checked="preference.providerTargets.WHATSAPP !== false"
                      @change="
                        updateNotificationPreference(preference, {
                          providerTargets: {
                            ...preference.providerTargets,
                            WHATSAPP: ($event.target as HTMLInputElement).checked
                          }
                        })
                      "
                    />
                    <span>WhatsApp</span>
                  </label>
                </div>
              </div>
              <p v-if="!adminAlertPreferences.length" class="muted small">
                No administrator alert options are available.
              </p>
            </div>
          </article>

          <article v-if="hasGuildMemberships" class="preferences-panel">
            <header class="preferences-panel__header">
              <h3>Guild Alerts</h3>
              <p class="muted small">
                Per-guild alerts for NPC respawn subscriptions, raid reminders, raid changes, and
                application outcomes.
              </p>
            </header>

            <div v-if="notificationsLoading" class="muted small">Loading guild preferences...</div>
            <div v-else class="guild-preferences">
              <section
                v-for="group in visibleGuildAlertGroups"
                :key="group.scopeId"
                class="guild-preferences__group"
              >
                <h4>{{ group.scopeLabel }}</h4>
                <div class="preference-list">
                  <div
                    v-for="preference in group.preferences"
                    :key="`${preference.scopeType}:${preference.scopeId}:${preference.eventKey}`"
                    class="preference-row"
                  >
                    <label class="preference-row__main">
                      <input
                        type="checkbox"
                        :checked="preference.isEnabled"
                        @change="
                          updateNotificationPreference(preference, {
                            isEnabled: ($event.target as HTMLInputElement).checked
                          })
                        "
                      />
                      <span>
                        <strong>{{ preference.eventLabel }}</strong>
                        <small class="muted">{{ preference.eventDescription }}</small>
                      </span>
                    </label>
                    <div class="preference-row__providers">
                      <label class="provider-toggle">
                        <input
                          type="checkbox"
                          :checked="preference.providerTargets.TELEGRAM !== false"
                          @change="
                            updateNotificationPreference(preference, {
                              providerTargets: {
                                ...preference.providerTargets,
                                TELEGRAM: ($event.target as HTMLInputElement).checked
                              }
                            })
                          "
                        />
                        <span>Telegram</span>
                      </label>
                      <label class="provider-toggle">
                        <input
                          type="checkbox"
                          :checked="preference.providerTargets.WHATSAPP !== false"
                          @change="
                            updateNotificationPreference(preference, {
                              providerTargets: {
                                ...preference.providerTargets,
                                WHATSAPP: ($event.target as HTMLInputElement).checked
                              }
                            })
                          "
                        />
                        <span>WhatsApp</span>
                      </label>
                    </div>
                  </div>
                </div>
              </section>
              <p v-if="!visibleGuildAlertGroups.length" class="muted small">
                No guild-specific alert options are available for your current guild roles.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section class="default-log">
        <div class="default-log__header">
          <h2>Default Log File</h2>
          <p class="muted small">
            When you select a log on the Loot page we can offer to reuse this file automatically.
          </p>
        </div>

        <p v-if="defaultLogFileName" class="default-log__current">
          Current default: <strong>{{ defaultLogFileName }}</strong>
        </p>
        <p v-else class="muted small">No default log file selected.</p>

        <p v-if="!supportsDefaultLog" class="alert alert--notice">
          Your browser doesn’t support storing a default log file. Use a Chromium-based browser to
          enable this feature.
        </p>
        <p v-else-if="defaultLogNeedsPermission" class="alert alert--warning">
          We need access to the saved file. Re-select it below to restore the permission.
        </p>

        <div class="default-log__actions">
          <button
            class="btn"
            type="button"
            :disabled="defaultLogSaving || !supportsDefaultLog"
            @click="chooseDefaultLogFile"
          >
            {{
              defaultLogSaving
                ? 'Saving…'
                : defaultLogFileName
                  ? 'Replace Log File'
                  : 'Select Log File'
            }}
          </button>
          <button
            class="btn btn--outline"
            type="button"
            :disabled="defaultLogSaving || !defaultLogFileName"
            @click="clearDefaultLogFile"
          >
            Clear
          </button>
        </div>

        <p v-if="defaultLogMessage" class="muted small default-log__feedback">
          {{ defaultLogMessage }}
        </p>
        <p v-if="defaultLogError" class="form__error">{{ defaultLogError }}</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import GlobalLoadingSpinner from '../components/GlobalLoadingSpinner.vue';
import { useMinimumLoading } from '../composables/useMinimumLoading';
import { useErrorModal } from '../composables/useErrorModal';
import {
  api,
  type AccountProfile,
  type LinkedProviders,
  type NotificationChannelConnection,
  type NotificationLinkSession,
  type NotificationPreferenceSummary,
  type NotificationProviderAvailability,
  type NotificationProvider,
  type UserPasskey
} from '../services/api';
import { useAuthStore } from '../stores/auth';
import { useToastBus } from '../components/ToastBus';
import {
  getPasskeyErrorMessage,
  registerCurrentDevicePasskey,
  supportsPasskeys
} from '../composables/usePasskeyAuth';
import {
  deleteDefaultLogHandle,
  getDefaultLogHandle,
  saveDefaultLogHandle
} from '../utils/defaultLogHandle';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { addToast } = useToastBus();
const { showErrorFromException } = useErrorModal();

const loading = ref(true);
const showLoading = useMinimumLoading(loading);
const saving = ref(false);
const profile = ref<AccountProfile | null>(null);
const nickname = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const defaultLogSaving = ref(false);
const defaultLogMessage = ref('');
const defaultLogError = ref('');
const defaultLogHandleAvailable = ref(false);

// Connected accounts state
const linkedProviders = ref<LinkedProviders>({
  google: false,
  discord: false,
  passkeys: false,
  passkeyCount: 0
});
const linkedProvidersLoading = ref(true);
const linkedProvidersError = ref('');
const linkedProvidersSuccess = ref('');
const unlinkingGoogle = ref(false);
const unlinkingDiscord = ref(false);
const passkeys = ref<UserPasskey[]>([]);
const passkeysLoading = ref(true);
const registeringPasskey = ref(false);
const deletingPasskeyId = ref<string | null>(null);
const editingPasskeyId = ref<string | null>(null);
const passkeyDraftName = ref('');
const renamingPasskey = ref(false);
const passkeysSupported = supportsPasskeys();
const notificationsLoading = ref(true);
const notificationChannels = ref<NotificationChannelConnection[]>([]);
const notificationAvailability = ref<
  Record<NotificationProvider, NotificationProviderAvailability>
>({
  TELEGRAM: {
    provider: 'TELEGRAM',
    isAvailable: true,
    unavailableReason: null
  },
  WHATSAPP: {
    provider: 'WHATSAPP',
    isAvailable: true,
    unavailableReason: null
  }
});
const notificationPreferences = ref<NotificationPreferenceSummary[]>([]);
const notificationBusyProvider = ref<NotificationProvider | null>(null);
const connectingProvider = ref<NotificationProvider | null>(null);
const linkSessions = ref<Partial<Record<NotificationProvider, NotificationLinkSession>>>({});
let notificationPollTimer: ReturnType<typeof window.setInterval> | null = null;

const hasPasskeyLogin = computed(() => passkeys.value.length > 0 || linkedProviders.value.passkeys);
const canUnlinkGoogle = computed(() => linkedProviders.value.discord || hasPasskeyLogin.value);
const canUnlinkDiscord = computed(() => linkedProviders.value.google || hasPasskeyLogin.value);
const canDeletePasskey = computed(
  () => linkedProviders.value.google || linkedProviders.value.discord || passkeys.value.length > 1
);
const telegramChannel = computed(
  () => notificationChannels.value.find((channel) => channel.provider === 'TELEGRAM') ?? null
);
const whatsappChannel = computed(
  () => notificationChannels.value.find((channel) => channel.provider === 'WHATSAPP') ?? null
);
const telegramAvailability = computed(() => notificationAvailability.value.TELEGRAM);
const whatsappAvailability = computed(() => notificationAvailability.value.WHATSAPP);
const marketAlertPreferences = computed(() =>
  notificationPreferences.value.filter(
    (preference) => preference.scopeType === 'GLOBAL' && preference.eventKey.startsWith('market.')
  )
);
const adminAlertPreferences = computed(() =>
  notificationPreferences.value.filter(
    (preference) => preference.scopeType === 'GLOBAL' && preference.eventKey.startsWith('webhook.')
  )
);
const hasGuildMemberships = computed(() => (authStore.user?.guilds?.length ?? 0) > 0);
const guildAlertGroups = computed(() => {
  const groups = new Map<string, NotificationPreferenceSummary[]>();

  for (const preference of notificationPreferences.value.filter(
    (entry) => entry.scopeType === 'GUILD'
  )) {
    const existing = groups.get(preference.scopeLabel) ?? [];
    existing.push(preference);
    groups.set(preference.scopeLabel, existing);
  }

  return [...groups.entries()].map(([scopeLabel, preferences]) => ({
    scopeLabel,
    scopeId: preferences[0]?.scopeId ?? '',
    preferences
  }));
});
const visibleGuildAlertGroups = computed(() =>
  guildAlertGroups.value
    .map((group) => ({
      ...group,
      preferences: group.preferences.filter((preference) =>
        shouldShowGuildAlertPreference(preference)
      )
    }))
    .filter((group) => group.preferences.length > 0)
);

const previewName = computed(() => {
  const trimmed = nickname.value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  if (profile.value?.nickname) {
    return profile.value.nickname;
  }
  return authStore.preferredName ?? profile.value?.displayName ?? '';
});

const nicknameValidationMessage = computed(() => {
  const trimmed = nickname.value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length < 2) {
    return 'Nickname must be at least 2 characters.';
  }
  return '';
});

const isNicknameValid = computed(() => nicknameValidationMessage.value.length === 0);

const isDirty = computed(() => nickname.value !== (profile.value?.nickname ?? ''));

const supportsDefaultLog = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof (window as any).showOpenFilePicker === 'function' &&
    typeof window.indexedDB !== 'undefined'
);

const defaultLogFileName = computed(() => profile.value?.defaultLogFileName ?? null);

const defaultLogNeedsPermission = computed(
  () =>
    Boolean(defaultLogFileName.value) &&
    !defaultLogHandleAvailable.value &&
    supportsDefaultLog.value
);

async function loadProfile() {
  loading.value = true;
  errorMessage.value = '';
  defaultLogMessage.value = '';
  defaultLogError.value = '';
  try {
    const result = await api.fetchAccountProfile();
    profile.value = result;
    nickname.value = result?.nickname ?? '';
    await refreshDefaultLogHandleState();
  } catch (error) {
    console.error('Failed to load account profile', error);
    errorMessage.value = 'Unable to load your account details. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function loadLinkedProviders() {
  linkedProvidersLoading.value = true;
  linkedProvidersError.value = '';
  try {
    linkedProviders.value = await api.fetchLinkedProviders();
  } catch (error) {
    console.error('Failed to load linked providers', error);
    linkedProvidersError.value = 'Unable to load connected accounts.';
  } finally {
    linkedProvidersLoading.value = false;
  }
}

async function loadPasskeys() {
  passkeysLoading.value = true;
  try {
    passkeys.value = await api.fetchPasskeys();
    linkedProviders.value = {
      ...linkedProviders.value,
      passkeys: passkeys.value.length > 0,
      passkeyCount: passkeys.value.length
    };
  } catch (error) {
    console.error('Failed to load passkeys', error);
    linkedProvidersError.value = 'Unable to load passkeys.';
  } finally {
    passkeysLoading.value = false;
  }
}

async function loadNotifications() {
  notificationsLoading.value = true;
  try {
    const [channelSnapshot, preferences] = await Promise.all([
      api.fetchNotificationChannels(),
      api.fetchNotificationPreferences()
    ]);
    notificationChannels.value = channelSnapshot.channels;
    applyNotificationAvailability(channelSnapshot.availability);
    notificationPreferences.value = preferences;
  } catch (error) {
    console.error('Failed to load notification settings', error);
  } finally {
    notificationsLoading.value = false;
    syncNotificationPolling();
  }
}

async function refreshLoginMethods() {
  await Promise.all([loadLinkedProviders(), loadPasskeys()]);
}

async function handleUnlinkGoogle() {
  if (unlinkingGoogle.value || !canUnlinkGoogle.value) return;

  unlinkingGoogle.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    linkedProviders.value = await api.unlinkGoogle();
    linkedProvidersSuccess.value = 'Google account unlinked successfully.';
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to unlink Google account.');
  } finally {
    unlinkingGoogle.value = false;
  }
}

async function handleUnlinkDiscord() {
  if (unlinkingDiscord.value || !canUnlinkDiscord.value) return;

  unlinkingDiscord.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    linkedProviders.value = await api.unlinkDiscord();
    linkedProvidersSuccess.value = 'Discord account unlinked successfully.';
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to unlink Discord account.');
  } finally {
    unlinkingDiscord.value = false;
  }
}

async function handleAddPasskey() {
  if (registeringPasskey.value || !passkeysSupported) return;

  registeringPasskey.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    const passkey = await registerCurrentDevicePasskey();
    passkeys.value = [passkey, ...passkeys.value.filter((entry) => entry.id !== passkey.id)];
    linkedProviders.value = {
      ...linkedProviders.value,
      passkeys: true,
      passkeyCount: passkeys.value.length
    };
    linkedProvidersSuccess.value = 'Passkey added successfully.';
    addToast({
      title: 'Passkey Added',
      message: 'You can use this device for faster sign-in next time.'
    });
  } catch (error) {
    const message = getPasskeyErrorMessage(error, 'Failed to add passkey.');
    if (message !== 'Passkey prompt canceled.') {
      linkedProvidersError.value = message;
    }
  } finally {
    registeringPasskey.value = false;
  }
}

function startRenamePasskey(passkey: UserPasskey) {
  editingPasskeyId.value = passkey.id;
  passkeyDraftName.value = passkey.name;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';
}

function cancelRenamePasskey() {
  editingPasskeyId.value = null;
  passkeyDraftName.value = '';
}

async function handleSavePasskeyName(passkeyId: string) {
  const name = passkeyDraftName.value.trim();
  if (!name || renamingPasskey.value) return;

  renamingPasskey.value = true;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    const updated = await api.renamePasskey(passkeyId, name);
    passkeys.value = passkeys.value.map((passkey) =>
      passkey.id === passkeyId ? updated : passkey
    );
    linkedProvidersSuccess.value = 'Passkey renamed successfully.';
    cancelRenamePasskey();
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to rename passkey.');
  } finally {
    renamingPasskey.value = false;
  }
}

async function handleDeletePasskey(passkeyId: string) {
  if (deletingPasskeyId.value || !canDeletePasskey.value) return;
  if (!window.confirm('Delete this passkey from your account?')) return;

  deletingPasskeyId.value = passkeyId;
  linkedProvidersError.value = '';
  linkedProvidersSuccess.value = '';

  try {
    linkedProviders.value = await api.deletePasskey(passkeyId);
    passkeys.value = passkeys.value.filter((passkey) => passkey.id !== passkeyId);
    linkedProvidersSuccess.value = 'Passkey deleted successfully.';
  } catch (error) {
    linkedProvidersError.value = extractErrorMessage(error, 'Failed to delete passkey.');
  } finally {
    deletingPasskeyId.value = null;
  }
}

function describePasskey(passkey: UserPasskey) {
  const parts: string[] = [];
  if (passkey.deviceType === 'multiDevice') {
    parts.push(passkey.backedUp ? 'Synced' : 'Sync-capable');
  } else if (passkey.deviceType === 'singleDevice') {
    parts.push('Single device');
  } else {
    parts.push('Passkey');
  }

  if (passkey.lastUsedAt) {
    parts.push(`last used ${formatCompactDate(passkey.lastUsedAt)}`);
  } else {
    parts.push(`created ${formatCompactDate(passkey.createdAt)}`);
  }

  return parts.join(' · ');
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function handleUrlParams() {
  const linked = route.query.linked as string | undefined;
  const error = route.query.error as string | undefined;

  if (linked) {
    const providerName = linked === 'google' ? 'Google' : linked === 'discord' ? 'Discord' : linked;
    linkedProvidersSuccess.value = `${providerName} account linked successfully.`;
    // Clear the query params
    router.replace({ path: route.path, query: {} });
  } else if (error) {
    linkedProvidersError.value = error;
    router.replace({ path: route.path, query: {} });
  }
}

function applyNotificationAvailability(entries: NotificationProviderAvailability[]) {
  const nextState: Record<NotificationProvider, NotificationProviderAvailability> = {
    TELEGRAM: {
      provider: 'TELEGRAM',
      isAvailable: true,
      unavailableReason: null
    },
    WHATSAPP: {
      provider: 'WHATSAPP',
      isAvailable: true,
      unavailableReason: null
    }
  };

  for (const entry of entries) {
    nextState[entry.provider] = entry;
  }

  notificationAvailability.value = nextState;
}

function getProviderAvailability(provider: NotificationProvider) {
  return provider === 'TELEGRAM' ? telegramAvailability.value : whatsappAvailability.value;
}

function canStartMessengerConnect(provider: NotificationProvider) {
  return getProviderAvailability(provider).isAvailable;
}

function canManageGuildApplicationAlerts(guildId: string) {
  const role = authStore.user?.guilds.find((guild) => guild.id === guildId)?.role;
  return role === 'LEADER' || role === 'OFFICER';
}

function shouldShowGuildAlertPreference(preference: NotificationPreferenceSummary) {
  if (
    preference.eventKey !== 'application.approved' &&
    preference.eventKey !== 'application.denied'
  ) {
    return true;
  }

  return canManageGuildApplicationAlerts(preference.scopeId);
}

function getMessengerStatus(provider: NotificationProvider) {
  const channel = provider === 'TELEGRAM' ? telegramChannel.value : whatsappChannel.value;
  const availability = getProviderAvailability(provider);

  if (!availability.isAvailable) {
    return {
      label: 'Unavailable',
      tone: 'provider-card__status--warning',
      detail:
        availability.unavailableReason ??
        'This messenger integration is not enabled on this server yet.'
    };
  }

  if (channel?.status === 'ACTIVE') {
    return {
      label: 'Connected',
      tone: 'provider-card__status--linked',
      detail: channel.displayLabel ?? channel.externalPhone ?? 'Ready for notifications'
    };
  }

  if (linkSessions.value[provider] || channel?.status === 'PENDING') {
    return {
      label: 'Waiting for verification',
      tone: 'provider-card__status--pending',
      detail:
        provider === 'TELEGRAM'
          ? 'Open the bot and send the start command.'
          : 'Send the prefilled WhatsApp message to finish linking.'
    };
  }

  if (channel?.status === 'FAILED') {
    return {
      label: 'Needs attention',
      tone: 'provider-card__status--warning',
      detail: 'Try the connect flow again.'
    };
  }

  return {
    label: 'Not connected',
    tone: '',
    detail:
      provider === 'TELEGRAM'
        ? 'Connect once to receive personal alerts in Telegram.'
        : 'Connect once to receive personal alerts in WhatsApp.'
  };
}

function clearNotificationPolling() {
  if (notificationPollTimer != null) {
    window.clearInterval(notificationPollTimer);
    notificationPollTimer = null;
  }
}

function syncNotificationPolling() {
  const shouldPoll = ['TELEGRAM', 'WHATSAPP'].some((provider) => {
    const typedProvider = provider as NotificationProvider;
    const channel = typedProvider === 'TELEGRAM' ? telegramChannel.value : whatsappChannel.value;
    return Boolean(linkSessions.value[typedProvider]) || channel?.status === 'PENDING';
  });

  if (!shouldPoll) {
    clearNotificationPolling();
    return;
  }

  if (notificationPollTimer != null) {
    return;
  }

  notificationPollTimer = window.setInterval(async () => {
    const snapshot = await api.fetchNotificationChannels().catch(() => null);
    if (!snapshot) {
      return;
    }

    notificationChannels.value = snapshot.channels;
    applyNotificationAvailability(snapshot.availability);
    for (const provider of ['TELEGRAM', 'WHATSAPP'] as NotificationProvider[]) {
      const channel = snapshot.channels.find((entry) => entry.provider === provider);
      if (channel?.status === 'ACTIVE' && linkSessions.value[provider]) {
        delete linkSessions.value[provider];
        connectingProvider.value = null;
        addToast({
          title: provider === 'TELEGRAM' ? 'Telegram Connected' : 'WhatsApp Connected',
          message: 'Messenger notifications are ready.',
          variant: 'success'
        });
      }
    }

    if (!Object.keys(linkSessions.value).length) {
      clearNotificationPolling();
    }
  }, 3000);
}

async function copyText(value: string, successTitle: string) {
  await navigator.clipboard.writeText(value);
  addToast({
    title: successTitle,
    message: 'Copied to clipboard.',
    variant: 'success'
  });
}

async function beginMessengerConnect(provider: NotificationProvider) {
  if (connectingProvider.value || !canStartMessengerConnect(provider)) {
    if (!canStartMessengerConnect(provider)) {
      addToast({
        title: provider === 'TELEGRAM' ? 'Telegram Unavailable' : 'WhatsApp Unavailable',
        message:
          getProviderAvailability(provider).unavailableReason ??
          'This messenger integration is not enabled on this server yet.',
        variant: 'warning'
      });
    }
    return;
  }

  connectingProvider.value = provider;

  try {
    const link =
      provider === 'TELEGRAM'
        ? await api.createTelegramNotificationLink()
        : await api.createWhatsappNotificationLink();

    linkSessions.value = {
      ...linkSessions.value,
      [provider]: link
    };
    window.open(link.deepLinkUrl, '_blank', 'noopener,noreferrer');
    addToast({
      title: provider === 'TELEGRAM' ? 'Telegram Setup Started' : 'WhatsApp Setup Started',
      message:
        provider === 'TELEGRAM'
          ? 'Send the start message in Telegram to finish linking.'
          : 'Send the WhatsApp message to finish linking.',
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, `Unable to start ${provider.toLowerCase()} setup.`);
  } finally {
    connectingProvider.value = null;
    syncNotificationPolling();
  }
}

async function refreshNotificationChannels() {
  try {
    const snapshot = await api.fetchNotificationChannels();
    notificationChannels.value = snapshot.channels;
    applyNotificationAvailability(snapshot.availability);
  } catch (error) {
    showErrorFromException(error, 'Unable to refresh notification status.');
  } finally {
    syncNotificationPolling();
  }
}

async function disconnectMessenger(provider: NotificationProvider) {
  if (notificationBusyProvider.value) {
    return;
  }

  notificationBusyProvider.value = provider;
  try {
    notificationChannels.value = await api.disconnectNotificationChannel(provider);
    delete linkSessions.value[provider];
    addToast({
      title: provider === 'TELEGRAM' ? 'Telegram Disconnected' : 'WhatsApp Disconnected',
      message: 'Messenger notifications have been disconnected.',
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, `Unable to disconnect ${provider.toLowerCase()}.`);
  } finally {
    notificationBusyProvider.value = null;
    syncNotificationPolling();
  }
}

async function sendTestMessage(provider: NotificationProvider) {
  if (notificationBusyProvider.value) {
    return;
  }

  notificationBusyProvider.value = provider;
  try {
    notificationChannels.value = await api.sendNotificationTest(provider);
    addToast({
      title: 'Test Message Sent',
      message: `A ${provider.toLowerCase()} test message was sent.`,
      variant: 'success'
    });
  } catch (error) {
    showErrorFromException(error, 'Unable to send a test message.');
  } finally {
    notificationBusyProvider.value = null;
  }
}

async function updateNotificationPreference(
  preference: NotificationPreferenceSummary,
  updates: Partial<Pick<NotificationPreferenceSummary, 'isEnabled' | 'providerTargets'>>
) {
  try {
    notificationPreferences.value = await api.updateNotificationPreferences([
      {
        scopeType: preference.scopeType,
        scopeId: preference.scopeId,
        eventKey: preference.eventKey,
        isEnabled: updates.isEnabled ?? preference.isEnabled,
        providerTargets: updates.providerTargets ?? preference.providerTargets
      }
    ]);
  } catch (error) {
    showErrorFromException(error, 'Unable to update notification preferences.');
  }
}

async function refreshDefaultLogHandleState() {
  if (!authStore.user || !supportsDefaultLog.value) {
    defaultLogHandleAvailable.value = false;
    return;
  }
  try {
    const handle = await getDefaultLogHandle(authStore.user.userId);
    if (!handle) {
      defaultLogHandleAvailable.value = false;
      return;
    }
    if (typeof handle.queryPermission === 'function') {
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission === 'denied') {
        defaultLogHandleAvailable.value = false;
        return;
      }
    }
    defaultLogHandleAvailable.value = true;
  } catch (error) {
    console.warn('Unable to inspect stored default log file handle.', error);
    defaultLogHandleAvailable.value = false;
  }
}

function resetNickname() {
  if (!profile.value) {
    return;
  }
  nickname.value = profile.value.nickname ?? '';
  successMessage.value = '';
  errorMessage.value = '';
}

watch(nickname, () => {
  successMessage.value = '';
  errorMessage.value = '';
});

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    if ('response' in error && typeof (error as any).response === 'object') {
      const response = (error as { response?: { data?: unknown } }).response;
      const data = response?.data;
      if (typeof data === 'object' && data !== null) {
        if ('message' in data && typeof (data as { message?: unknown }).message === 'string') {
          return (data as { message: string }).message;
        }
        if ('error' in data && typeof (data as { error?: unknown }).error === 'string') {
          return (data as { error: string }).error as string;
        }
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
  }
  return fallback;
}

async function chooseDefaultLogFile() {
  if (defaultLogSaving.value) {
    return;
  }
  if (!authStore.user) {
    defaultLogError.value = 'You must be signed in to configure a default log file.';
    return;
  }
  if (!supportsDefaultLog.value) {
    defaultLogError.value = 'Your browser does not support selecting a default log file.';
    return;
  }

  defaultLogSaving.value = true;
  defaultLogError.value = '';
  defaultLogMessage.value = '';

  try {
    const picker = (window as any).showOpenFilePicker as
      | ((options?: any) => Promise<FileSystemFileHandle[]>)
      | undefined;
    if (typeof picker !== 'function') {
      throw new Error('Default log selection is unavailable in this browser.');
    }

    const handles = await picker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'EverQuest Logs',
          accept: {
            'text/plain': ['.txt', '.log']
          }
        }
      ]
    });

    if (!Array.isArray(handles) || handles.length === 0) {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }

    const handle = handles[0];
    if (!handle) {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }

    if (typeof handle.queryPermission === 'function') {
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'read' });
      }
      if (permission !== 'granted') {
        defaultLogError.value = 'Read access to the selected log file was not granted.';
        return;
      }
    }

    await saveDefaultLogHandle(authStore.user.userId, handle);
    const updated = await api.updateAccountProfile({ defaultLogFileName: handle.name ?? null });
    if (profile.value) {
      profile.value = { ...profile.value, defaultLogFileName: updated.defaultLogFileName };
    } else {
      profile.value = updated;
    }
    defaultLogMessage.value = `Default log file set to ${handle.name}.`;
    defaultLogHandleAvailable.value = true;
    await refreshDefaultLogHandleState();
    await authStore.fetchCurrentUser();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      defaultLogMessage.value = 'Log file selection cancelled.';
      return;
    }
    console.error('Failed to save default log file', error);
    defaultLogError.value = extractErrorMessage(
      error,
      'Unable to save your default log file. Please try again.'
    );
  } finally {
    defaultLogSaving.value = false;
  }
}

async function clearDefaultLogFile() {
  if (defaultLogSaving.value) {
    return;
  }
  if (!authStore.user) {
    defaultLogError.value = 'You must be signed in to update your default log file.';
    return;
  }

  defaultLogSaving.value = true;
  defaultLogError.value = '';
  defaultLogMessage.value = '';

  try {
    if (supportsDefaultLog.value) {
      try {
        await deleteDefaultLogHandle(authStore.user.userId);
      } catch (handleError) {
        console.warn('Failed to remove stored default log handle.', handleError);
      }
    }
    const updated = await api.updateAccountProfile({ defaultLogFileName: null });
    if (profile.value) {
      profile.value = { ...profile.value, defaultLogFileName: updated.defaultLogFileName };
    } else {
      profile.value = updated;
    }
    defaultLogHandleAvailable.value = false;
    defaultLogMessage.value = 'Default log file cleared.';
    await refreshDefaultLogHandleState();
    await authStore.fetchCurrentUser();
  } catch (error) {
    console.error('Failed to clear default log file', error);
    defaultLogError.value = extractErrorMessage(
      error,
      'Unable to clear your default log file. Please try again.'
    );
  } finally {
    defaultLogSaving.value = false;
  }
}

async function saveNickname() {
  if (!profile.value || saving.value || !isDirty.value) {
    return;
  }

  saving.value = true;
  successMessage.value = '';
  errorMessage.value = '';

  try {
    const payloadNickname = nickname.value.trim();
    const updated = await api.updateAccountProfile({
      nickname: payloadNickname.length > 0 ? payloadNickname : null
    });
    profile.value = updated;
    nickname.value = updated.nickname ?? '';
    successMessage.value = 'Account settings saved.';
    await authStore.fetchCurrentUser();
  } catch (error) {
    errorMessage.value = extractErrorMessage(
      error,
      'Unable to save your account settings right now. Please try again.'
    );
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  handleUrlParams();
  loadProfile();
  refreshLoginMethods();
  loadNotifications();
});

onBeforeUnmount(() => {
  clearNotificationPolling();
});
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.settings__header h1 {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  padding: 2rem;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.45);
}

.card--center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
}

.settings__content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.form__field label {
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.form__field input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.6rem;
  padding: 0.65rem 0.85rem;
  color: #f8fafc;
}

.hint {
  font-size: 0.85rem;
}

.form__error {
  margin: 0;
  font-size: 0.85rem;
  color: #fecaca;
}

.preview,
.reference {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview h2,
.reference__title {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.preview__name,
.reference__value {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f8fafc;
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.95rem;
}

.alert--error {
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.alert--notice {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #bae6fd;
}

.alert--warning {
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fef08a;
}

.connected-accounts {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.connected-accounts__header h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.connected-accounts__loading {
  padding: 1rem 0;
}

.connected-accounts__providers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
}

.provider-card__info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.provider-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  flex-shrink: 0;
}

.provider-card__icon svg {
  display: block;
}

.provider-card__icon--google {
  background: rgba(66, 133, 244, 0.15);
  color: #4285f4;
}

.provider-card__icon--discord {
  background: rgba(88, 101, 242, 0.15);
  color: #5865f2;
}

.provider-card__icon--passkey {
  background: rgba(45, 212, 191, 0.15);
  color: #5eead4;
}

.provider-card__icon--telegram {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.provider-card__icon--whatsapp {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.provider-card__details {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.provider-card__name {
  font-weight: 600;
  color: #f8fafc;
}

.provider-card__status {
  font-size: 0.85rem;
  color: #94a3b8;
}

.provider-card__status--linked {
  color: #4ade80;
}

.provider-card__status--pending {
  color: #fbbf24;
}

.provider-card__status--warning {
  color: #fda4af;
}

.provider-card__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

.provider-card--messenger {
  flex-direction: column;
  align-items: stretch;
  gap: 1rem;
}

.passkeys-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(45, 212, 191, 0.2);
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.38);
}

.passkeys-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.passkeys-panel__header h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 1rem;
}

.passkeys-empty {
  color: #94a3b8;
  font-size: 0.95rem;
}

.passkey-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.passkey-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.75rem;
  background: rgba(30, 41, 59, 0.5);
}

.passkey-card__details {
  min-width: 0;
}

.passkey-card__name-input {
  width: min(280px, 100%);
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(94, 234, 212, 0.45);
  border-radius: 0.5rem;
  color: #f8fafc;
  padding: 0.45rem 0.6rem;
}

.messenger-notifications {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.messenger-notifications__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.messenger-notifications__header h2,
.preferences-panel__header h3 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.messenger-grid,
.preferences-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.provider-card__setup {
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-card__setup-title {
  margin: 0;
  font-weight: 700;
  color: #f8fafc;
}

.provider-card__code {
  display: block;
  padding: 0.75rem 0.85rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  word-break: break-word;
}

.provider-card__setup-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.preferences-panel {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preference-list,
.guild-preferences {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guild-preferences__group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.guild-preferences__group h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #f8fafc;
}

.preference-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.85rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.preference-row__main {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  color: #f8fafc;
}

.preference-row__main span {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preference-row__providers {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

.provider-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #cbd5e1;
}

.btn--small {
  padding: 0.4rem 0.85rem;
  font-size: 0.85rem;
}

.btn--success {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  border: 1px solid rgba(16, 185, 129, 0.5);
  color: #ffffff;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  transition: all 0.2s ease;
}

.btn--success:hover {
  background: linear-gradient(135deg, #047857 0%, #059669 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
  transform: translateY(-1px);
}

.btn--danger {
  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
  transition: all 0.2s ease;
}

.btn--danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
  transform: translateY(-1px);
}

.btn--danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.default-log {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.default-log__header h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5f5;
}

.default-log__current {
  margin: 0;
  font-size: 0.95rem;
  color: #f8fafc;
}

.default-log__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.default-log__feedback {
  color: #bbf7d0;
}

.alert--success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #bbf7d0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.muted {
  color: #94a3b8;
}

.small {
  font-size: 0.85rem;
}

@media (max-width: 480px) {
  .settings__header h1 {
    font-size: 1.5rem;
  }

  .card {
    padding: 1.25rem;
  }

  .actions {
    flex-direction: column;
    align-items: stretch;
  }

  .provider-card {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .passkeys-panel__header,
  .passkey-card {
    flex-direction: column;
    align-items: stretch;
  }

  .provider-card__info {
    min-width: 0;
  }

  .provider-card .btn,
  .provider-card a.btn {
    align-self: stretch;
    justify-content: center;
    text-align: center;
  }

  .messenger-notifications__header,
  .preference-row {
    flex-direction: column;
  }

  .provider-card__actions,
  .provider-card__setup-actions,
  .preference-row__providers {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
