/// <reference types="vite/client" />

type FileSystemHandlePermissionDescriptor = {
  mode?: 'read' | 'readwrite';
};

interface FileSystemHandle {
  queryPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
}
