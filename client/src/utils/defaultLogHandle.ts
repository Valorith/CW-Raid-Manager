import {
  DEFAULT_LOG_HANDLE_STORE,
  deleteStoredHandle,
  getStoredHandle,
  saveStoredHandle
} from './fileSystemHandleStorage';

type DefaultLogHandle = FileSystemFileHandle;

export async function saveDefaultLogHandle(userId: string, handle: DefaultLogHandle) {
  await saveStoredHandle(DEFAULT_LOG_HANDLE_STORE, userId, handle);
}

export async function getDefaultLogHandle(userId: string): Promise<DefaultLogHandle | null> {
  return getStoredHandle<DefaultLogHandle>(DEFAULT_LOG_HANDLE_STORE, userId);
}

export async function deleteDefaultLogHandle(userId: string) {
  await deleteStoredHandle(DEFAULT_LOG_HANDLE_STORE, userId);
}
