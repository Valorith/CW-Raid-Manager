import {
  WebAuthnAbortService,
  WebAuthnError,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration
} from '@simplewebauthn/browser';

import { api, type UserPasskey } from '../services/api';

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

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function registerCurrentDevicePasskey(): Promise<UserPasskey> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }

  const optionsJSON = await api.fetchPasskeyRegistrationOptions();
  const response = await startRegistration({ optionsJSON });
  return api.verifyPasskeyRegistration(response);
}

export async function authenticateWithPasskey(options?: {
  useBrowserAutofill?: boolean;
  verifyBrowserAutofillInput?: boolean;
}): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser does not support passkeys.');
  }

  const optionsJSON = await api.fetchPasskeyAuthenticationOptions();
  const response = await startAuthentication({
    optionsJSON,
    useBrowserAutofill: options?.useBrowserAutofill ?? false,
    verifyBrowserAutofillInput: options?.verifyBrowserAutofillInput ?? true
  });
  await api.verifyPasskeyAuthentication(response);
}

export function cancelActivePasskeyPrompt(): void {
  WebAuthnAbortService.cancelCeremony();
}
