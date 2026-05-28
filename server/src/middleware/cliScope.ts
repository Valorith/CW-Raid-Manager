export function cliTokenCanAccessPath(path: string, scopes: string[] | undefined): boolean {
  const pathname = path.split('?')[0] ?? path;
  if (pathname === '/api/auth/me') {
    return true;
  }
  if (
    pathname === '/api/cli/auth/logout' ||
    pathname === '/api/cli/auth/sessions' ||
    pathname.startsWith('/api/cli/auth/sessions/')
  ) {
    return true;
  }
  if (pathname.startsWith('/api/test-manager/')) {
    return Boolean(scopes?.includes('test-manager'));
  }

  return false;
}
