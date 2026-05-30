import {
  WebAuthnAbortService,
  WebAuthnError,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration
} from '@simplewebauthn/browser';

import { api, type UserPasskey } from '../services/api';

const PASSKEY_RESET_DELAY_MS = 150;
const PENDING_REQUEST_MARKERS = ['already pending', 'request is already pending'];

export function supportsPasskeys(): boolean {
  return browserSupportsWebAuthn();
}

export async function supportsPasskeyAutofill(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) {
    return false;
  }

  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

export function isPasskeyCancel(error: unknown): boolean {
  if (error instanceof WebAuthnError) {
    return error.code === 'ERROR_CEREMONY_ABORTED';
  }

  return error instanceof DOMException && error.name === 'NotAllowedError';
}

function getSearchableErrorText(error: unknown): string {
  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.name, error.message);

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      parts.push(cause.name, cause.message);
    } else if (typeof cause === 'string') {
      parts.push(cause);
    }
  } else if (typeof error === 'string') {
    parts.push(error);
  }

  return parts.join(' ').toLowerCase();
}

function isPendingPasskeyRequest(error: unknown): boolean {
  const searchableText = getSearchableErrorText(error);
  return PENDING_REQUEST_MARKERS.some((marker) => searchableText.includes(marker));
}

function waitForPasskeyAbort(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, PASSKEY_RESET_DELAY_MS);
  });
}

async function resetPasskeyCeremony(): Promise<void> {
  WebAuthnAbortService.cancelCeremony();
  await waitForPasskeyAbort();
}

async function withFreshPasskeyCeremony<T>(operation: () => Promise<T>): Promise<T> {
  await resetPasskeyCeremony();

  try {
    return await operation();
  } catch (error) {
    if (!isPendingPasskeyRequest(error)) {
      throw error;
    }

    await resetPasskeyCeremony();
    return operation();
  }
}

export function getPasskeyErrorMessage(error: unknown, fallback: string): string {
  if (isPasskeyCancel(error)) {
    return 'Passkey prompt canceled.';
  }

  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      return 'This passkey is already connected to your account.';
    }
    if (error.code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT') {
      return 'This authenticator does not support passkeys.';
    }
  }

  if (isPendingPasskeyRequest(error)) {
    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function registerCurrentDevicePasskey(): Promise<UserPasskey> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }

  return withFreshPasskeyCeremony(async () => {
    const optionsJSON = await api.fetchPasskeyRegistrationOptions();
    const response = await startRegistration({ optionsJSON });
    return api.verifyPasskeyRegistration(response);
  });
}

export async function authenticateWithPasskey(options?: {
  useBrowserAutofill?: boolean;
  verifyBrowserAutofillInput?: boolean;
}): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }

  const useBrowserAutofill = options?.useBrowserAutofill ?? false;
  const verifyBrowserAutofillInput = options?.verifyBrowserAutofillInput ?? true;
  const authenticate = async () => {
    const optionsJSON = await api.fetchPasskeyAuthenticationOptions();
    const response = await startAuthentication({
      optionsJSON,
      useBrowserAutofill,
      verifyBrowserAutofillInput
    });
    await api.verifyPasskeyAuthentication(response);
  };

  if (useBrowserAutofill) {
    await authenticate();
    return;
  }

  await withFreshPasskeyCeremony(authenticate);
}

export function cancelActivePasskeyPrompt(): void {
  WebAuthnAbortService.cancelCeremony();
}
