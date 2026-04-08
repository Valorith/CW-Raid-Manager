import {
  EQ_GAME_DIRECTORY_HANDLE_STORE,
  deleteStoredHandle,
  getStoredHandle,
  saveStoredHandle
} from './fileSystemHandleStorage';

type EqGameDirectoryHandle = FileSystemDirectoryHandle;

export async function saveEqGameDirectoryHandle(userId: string, handle: EqGameDirectoryHandle) {
  await saveStoredHandle(EQ_GAME_DIRECTORY_HANDLE_STORE, userId, handle);
}

export async function getEqGameDirectoryHandle(
  userId: string
): Promise<EqGameDirectoryHandle | null> {
  return getStoredHandle<EqGameDirectoryHandle>(EQ_GAME_DIRECTORY_HANDLE_STORE, userId);
}

export async function deleteEqGameDirectoryHandle(userId: string) {
  await deleteStoredHandle(EQ_GAME_DIRECTORY_HANDLE_STORE, userId);
}
