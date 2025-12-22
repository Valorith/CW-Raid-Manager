export interface ToastPayload {
  title: string;
  message: string;
}

export function useToastBus() {
  function addToast(payload: ToastPayload) {
    // Dispatch to the global toast handler in App.vue
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: { title: payload.title, message: payload.message }
      })
    );
  }

  return {
    addToast
  };
}
