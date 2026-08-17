import { ref } from 'vue';

export interface ErrorModalState {
  isOpen: boolean;
  title: string;
  message: string;
}

const state = ref<ErrorModalState>({
  isOpen: false,
  title: 'Error',
  message: ''
});

function copyTextWithSelectionFallback(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto 0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function useErrorModal() {
  function showError(message: string, title = 'Error') {
    state.value = {
      isOpen: true,
      title,
      message
    };
  }

  function showErrorFromException(err: unknown, fallbackMessage = 'An error occurred') {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    const message = error?.response?.data?.message ?? error?.message ?? fallbackMessage;
    showError(message);
  }

  function closeError() {
    state.value.isOpen = false;
  }

  async function copyErrorToClipboard() {
    const message = state.value.message;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        return true;
      }
    } catch {
      // Some embedded browsers expose the Clipboard API but reject writes.
    }
    return copyTextWithSelectionFallback(message);
  }

  return {
    state,
    showError,
    showErrorFromException,
    closeError,
    copyErrorToClipboard
  };
}
