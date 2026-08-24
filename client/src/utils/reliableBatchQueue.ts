export interface ReliableBatchQueueOptions<T> {
  buildKey: (item: T) => string;
  persist: (items: T[]) => Promise<void>;
  isProcessed: (key: string) => boolean;
  markProcessed: (key: string) => void;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
  retryBaseMs?: number;
  retryMaxMs?: number;
  onRetry?: (error: unknown, delayMs: number, pendingCount: number) => void;
}

export class ReliableBatchQueue<T> {
  private readonly pending = new Map<string, T>();
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private inFlight = false;
  private retryAttempt = 0;
  private retryHandle: unknown = null;
  private disposed = false;
  private generation = 0;

  constructor(private readonly options: ReliableBatchQueueOptions<T>) {
    this.retryBaseMs = Math.max(1, options.retryBaseMs ?? 2_000);
    this.retryMaxMs = Math.max(this.retryBaseMs, options.retryMaxMs ?? 30_000);
  }

  enqueue(items: T[]) {
    let added = 0;
    for (const item of items) {
      const key = this.options.buildKey(item);
      if (!key || this.options.isProcessed(key) || this.pending.has(key)) {
        continue;
      }
      this.pending.set(key, item);
      added += 1;
    }
    return added;
  }

  get pendingCount() {
    return this.pending.size;
  }

  async flush() {
    if (this.disposed || this.inFlight || this.retryHandle !== null || this.pending.size === 0) {
      return;
    }

    this.inFlight = true;
    const batchGeneration = this.generation;
    const batch = [...this.pending.entries()];
    let failed = false;
    try {
      await this.options.persist(batch.map(([, item]) => item));
      if (this.disposed || batchGeneration !== this.generation) {
        return;
      }
      for (const [key] of batch) {
        this.pending.delete(key);
        this.options.markProcessed(key);
      }
      this.retryAttempt = 0;
    } catch (error) {
      if (this.disposed || batchGeneration !== this.generation) {
        return;
      }
      failed = true;
      this.scheduleRetry(error);
    } finally {
      this.inFlight = false;
    }

    if (!failed && this.pending.size > 0) {
      await this.flush();
    }
  }

  reset() {
    this.generation += 1;
    this.pending.clear();
    this.retryAttempt = 0;
    this.clearRetry();
  }

  dispose() {
    this.disposed = true;
    this.reset();
  }

  private scheduleRetry(error: unknown) {
    if (this.disposed || this.retryHandle !== null) {
      return;
    }
    const delayMs = Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** this.retryAttempt);
    this.retryAttempt += 1;
    this.options.onRetry?.(error, delayMs, this.pending.size);
    const schedule = this.options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.retryHandle = schedule(() => {
      this.retryHandle = null;
      void this.flush();
    }, delayMs);
  }

  private clearRetry() {
    if (this.retryHandle === null) {
      return;
    }
    const cancel = this.options.cancelScheduled ?? ((handle) => clearTimeout(handle as number));
    cancel(this.retryHandle);
    this.retryHandle = null;
  }
}
