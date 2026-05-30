export function cliTokenCanAccessPath(
  path: string,
  scopes: string[] | undefined,
  method = 'GET'
): boolean {
  const pathname = path.split('?')[0] ?? path;
  const normalizedMethod = method.toUpperCase();
  if (pathname === '/api/auth/me') {
    return normalizedMethod === 'GET';
  }
  if (
    (pathname === '/api/cli/auth/logout' && normalizedMethod === 'POST') ||
    (pathname === '/api/cli/auth/sessions' && normalizedMethod === 'GET') ||
    (pathname.startsWith('/api/cli/auth/sessions/') && normalizedMethod === 'DELETE')
  ) {
    return true;
  }
  if (pathIsOrChild(pathname, '/api/test-manager')) {
    return Boolean(scopes?.includes('test-manager'));
  }
  const hasWebhookInboxScope = Boolean(
    scopes?.includes('webhook-inbox') || scopes?.includes('test-manager')
  );
  if (
    pathIsOrChild(pathname, '/api/admin/webhook-inbox') ||
    pathIsOrChild(pathname, '/api/admin/webhook-labels')
  ) {
    return hasWebhookInboxScope;
  }
  if (!hasWebhookInboxScope) {
    return false;
  }
  if (
    normalizedMethod === 'GET' &&
    (pathname === '/api/admin/webhooks' ||
      pathname === '/api/admin/webhooks/processing-status' ||
      pathname === '/api/admin/webhooks/pending-merge-groups')
  ) {
    return true;
  }
  if (
    normalizedMethod === 'POST' &&
    /^\/api\/admin\/webhooks\/[^/]+\/(?:test|process-group-now)$/.test(pathname)
  ) {
    return true;
  }

  return false;
}

function pathIsOrChild(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}
