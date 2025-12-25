import { ref, watch, type Ref } from 'vue';

/**
 * Composable that ensures a loading state stays true for a minimum duration.
 * Useful for preventing jarring UI flashes when data loads very quickly.
 *
 * @param isLoading - The actual loading state ref
 * @param minimumMs - Minimum duration in milliseconds (default: 2000)
 * @returns A ref that stays true until both loading is complete AND minimum time has passed
 */
export function useMinimumLoading(isLoading: Ref<boolean>, minimumMs = 2000): Ref<boolean> {
  const showLoading = ref(false);
  let loadingStartTime: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  watch(
    isLoading,
    (loading) => {
      if (loading) {
        // Loading started
        showLoading.value = true;
        loadingStartTime = Date.now();

        // Clear any pending timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } else {
        // Loading finished - check if minimum time has passed
        if (loadingStartTime === null) {
          showLoading.value = false;
          return;
        }

        const elapsed = Date.now() - loadingStartTime;
        const remaining = minimumMs - elapsed;

        if (remaining <= 0) {
          // Minimum time already passed
          showLoading.value = false;
          loadingStartTime = null;
        } else {
          // Wait for remaining time
          timeoutId = setTimeout(() => {
            showLoading.value = false;
            loadingStartTime = null;
            timeoutId = null;
          }, remaining);
        }
      }
    },
    { immediate: true }
  );

  return showLoading;
}
