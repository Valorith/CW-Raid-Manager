const DB_NAME = 'cw-raid-manager';
const DB_VERSION = 1;
const STORE_NAME = 'default-log-handles';

type DefaultLogHandle = FileSystemFileHandle;

function ensureIndexedDbSupport() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('Default log files require IndexedDB support.');
  }
}

function openDatabase(): Promise<IDBDatabase> {
  ensureIndexedDbSupport();
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open persistent storage for log handles.'));
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to access persistent storage.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await executor(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Persistent storage aborted.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Persistent storage error.'));
    });
    return result;
  } finally {
    db.close();
  }
}

export async function saveDefaultLogHandle(userId: string, handle: DefaultLogHandle) {
  await withStore('readwrite', async (store) => {
    await promisifyRequest(store.put(handle, userId));
  });
}

export async function getDefaultLogHandle(userId: string): Promise<DefaultLogHandle | null> {
  return withStore('readonly', async (store) => {
    const result = await promisifyRequest(store.get(userId));
    return (result as DefaultLogHandle | undefined) ?? null;
  });
}

export async function deleteDefaultLogHandle(userId: string) {
  await withStore('readwrite', async (store) => {
    await promisifyRequest(store.delete(userId));
  });
}
