const DB_NAME = 'cw-raid-manager';
const DB_VERSION = 2;
const DEFAULT_LOG_HANDLE_STORE = 'default-log-handles';
const EQ_GAME_DIRECTORY_HANDLE_STORE = 'eq-game-directory-handles';

const REQUIRED_STORES = [DEFAULT_LOG_HANDLE_STORE, EQ_GAME_DIRECTORY_HANDLE_STORE] as const;

function ensureIndexedDbSupport() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('Persistent file handles require IndexedDB support.');
  }
}

function openDatabase(): Promise<IDBDatabase> {
  ensureIndexedDbSupport();
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of REQUIRED_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open persistent handle storage.'));
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to access persistent storage.'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await executor(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Persistent storage transaction aborted.'));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Persistent storage transaction failed.'));
    });
    return result;
  } finally {
    db.close();
  }
}

export async function saveStoredHandle<T extends FileSystemHandle>(
  storeName: string,
  key: string,
  handle: T
) {
  await withStore(storeName, 'readwrite', async (store) => {
    await promisifyRequest(store.put(handle, key));
  });
}

export async function getStoredHandle<T extends FileSystemHandle>(
  storeName: string,
  key: string
): Promise<T | null> {
  return withStore(storeName, 'readonly', async (store) => {
    const result = await promisifyRequest(store.get(key));
    return (result as T | undefined) ?? null;
  });
}

export async function deleteStoredHandle(storeName: string, key: string) {
  await withStore(storeName, 'readwrite', async (store) => {
    await promisifyRequest(store.delete(key));
  });
}

export { DEFAULT_LOG_HANDLE_STORE, EQ_GAME_DIRECTORY_HANDLE_STORE };
