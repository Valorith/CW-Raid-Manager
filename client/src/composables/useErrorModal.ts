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
    try {
      await navigator.clipboard.writeText(state.value.message);
      return true;
    } catch {
      return false;
    }
  }

  return {
    state,
    showError,
    showErrorFromException,
    closeError,
    copyErrorToClipboard
  };
}
