export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeAxios = error as { response?: { data?: unknown } };
    const response = maybeAxios.response;
    const data = response?.data;
    if (typeof data === 'object' && data !== null) {
      const withMessage = data as { message?: unknown; error?: unknown };
      if (typeof withMessage.message === 'string') {
        return withMessage.message;
      }
      if (typeof withMessage.error === 'string') {
        return withMessage.error;
      }
    }
    if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
  }
  return fallback;
}
