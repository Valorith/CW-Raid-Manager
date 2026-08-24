// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { ReliableBatchQueue } from './reliableBatchQueue.js';

test('keeps a failed batch pending and marks it processed only after retry succeeds', async () => {
  const processed = new Set<string>();
  const attempts: string[][] = [];
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  let shouldFail = true;
  const queue = new ReliableBatchQueue<string>({
    buildKey: (item) => item,
    isProcessed: (key) => processed.has(key),
    markProcessed: (key) => processed.add(key),
    persist: async (items) => {
      attempts.push(items);
      if (shouldFail) {
        throw new Error('temporary API failure');
      }
    },
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return scheduled.length;
    }
  });

  assert.equal(queue.enqueue(['Warmaster Gorvol']), 1);
  await queue.flush();

  assert.equal(queue.pendingCount, 1);
  assert.deepEqual([...processed], []);
  assert.equal(scheduled[0]?.delayMs, 2_000);

  shouldFail = false;
  scheduled[0]?.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(queue.pendingCount, 0);
  assert.deepEqual([...processed], ['Warmaster Gorvol']);
  assert.deepEqual(attempts, [['Warmaster Gorvol'], ['Warmaster Gorvol']]);
});

test('deduplicates items that are already pending or processed', async () => {
  const processed = new Set<string>();
  const queue = new ReliableBatchQueue<string>({
    buildKey: (item) => item,
    isProcessed: (key) => processed.has(key),
    markProcessed: (key) => processed.add(key),
    persist: async () => undefined
  });

  assert.equal(queue.enqueue(['Rotrage', 'Rotrage']), 1);
  assert.equal(queue.enqueue(['Rotrage']), 0);
  await queue.flush();
  assert.equal(queue.enqueue(['Rotrage']), 0);
});

test('does not mark an in-flight batch processed after the queue is reset', async () => {
  const processed = new Set<string>();
  let releasePersist: (() => void) | undefined;
  const queue = new ReliableBatchQueue<string>({
    buildKey: (item) => item,
    isProcessed: (key) => processed.has(key),
    markProcessed: (key) => processed.add(key),
    persist: () =>
      new Promise<void>((resolve) => {
        releasePersist = resolve;
      })
  });

  queue.enqueue(['Grand Magus D`Nor']);
  const flush = queue.flush();
  await Promise.resolve();
  queue.reset();
  releasePersist?.();
  await flush;

  assert.equal(queue.pendingCount, 0);
  assert.deepEqual([...processed], []);
});
