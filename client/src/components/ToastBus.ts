import { ref } from 'vue';

export interface ToastPayload {
  title: string;
  message: string;
}

const toasts = ref<Array<{ id: number } & ToastPayload>>([]);
let nextId = 0;

export function useToastBus() {
  function addToast(payload: ToastPayload) {
    const id = ++nextId;
    toasts.value.push({ id, ...payload });
    window.setTimeout(() => removeToast(id), 5000);
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  return {
    toasts,
    addToast,
    removeToast
  };
}
