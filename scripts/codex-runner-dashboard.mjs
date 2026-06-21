#!/usr/bin/env node
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { mkdir, readdir, readFile, stat } from 'fs/promises';
import { createServer } from 'http';
import { hostname } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(scriptDir, 'codex-runner-dashboard.env'));

const config = {
  host: process.env.DASHBOARD_HOST || '127.0.0.1',
  port: parsePositiveInt(process.env.DASHBOARD_PORT, 8788),
  baseUrl: requireEnv('DASHBOARD_BASE_URL').replace(/\/+$/, ''),
  basePath: normalizeBasePath(process.env.DASHBOARD_BASE_PATH || ''),
  googleClientId: requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
  sessionSecret: requireEnv('DASHBOARD_SESSION_SECRET'),
  allowedEmails: parseList(process.env.DASHBOARD_ALLOWED_EMAILS),
  allowedDomains: parseList(process.env.DASHBOARD_ALLOWED_DOMAINS).map((domain) =>
    domain.toLowerCase()
  ),
  registryDir: resolve(
    process.env.CODEX_RUNNER_REGISTRY_DIR ||
      join(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work'), 'runners')
  ),
  staleAfterMs: parsePositiveInt(process.env.DASHBOARD_STALE_AFTER_MS, 45_000),
  sessionTtlSeconds: parsePositiveInt(process.env.DASHBOARD_SESSION_TTL_SECONDS, 86_400)
};

if (config.allowedEmails.length === 0 && config.allowedDomains.length === 0) {
  throw new Error('DASHBOARD_ALLOWED_EMAILS or DASHBOARD_ALLOWED_DOMAINS is required.');
}

const redirectUri = `${config.baseUrl}${config.basePath}/auth/google/callback`;

await mkdir(config.registryDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : error);
    sendHtml(response, 500, renderErrorPage('Something went sideways.', 'Check the dashboard service logs.'));
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `Nexus Codex runner dashboard listening on http://${config.host}:${config.port} for ${config.baseUrl}`
  );
});

async function routeRequest(request, response) {
  const url = new URL(request.url || '/', config.baseUrl);
  const path = stripBasePath(url.pathname);

  if (url.pathname === '/health' || path === '/health') {
    sendJson(response, 200, { ok: true, hostname: hostname() });
    return;
  }

  if (path === '/login') {
    handleLogin(response);
    return;
  }

  if (path === '/auth/google/callback') {
    await handleGoogleCallback(request, response, url);
    return;
  }

  if (path === '/logout') {
    clearCookie(response, 'nexus_codex_dashboard');
    redirect(response, withBasePath('/login'));
    return;
  }

  const session = readSession(request);
  if (!session) {
    if (path.startsWith('/api/')) {
      sendJson(response, 401, { error: 'Unauthorized' });
    } else {
      redirect(response, withBasePath('/login'));
    }
    return;
  }

  if (path === '/api/runners') {
    const runners = await listRunners();
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      staleAfterMs: config.staleAfterMs,
      user: {
        email: session.email,
        name: session.name,
        picture: session.picture
      },
      runners
    });
    return;
  }

  if (path === '/') {
    sendHtml(response, 200, renderDashboardPage(session));
    return;
  }

  sendHtml(response, 404, renderErrorPage('Not found.', 'That dashboard route does not exist.'));
}

function handleLogin(response) {
  const state = randomBytes(24).toString('base64url');
  setCookie(response, 'nexus_codex_dashboard_state', signValue(state), {
    maxAge: 600,
    httpOnly: true
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.googleClientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');
  redirect(response, authUrl.toString());
}

async function handleGoogleCallback(request, response, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request.headers.cookie || '');
  const expectedState = verifySignedValue(cookies.nexus_codex_dashboard_state || '');
  clearCookie(response, 'nexus_codex_dashboard_state');

  if (!code || !state || !expectedState || state !== expectedState) {
    sendHtml(
      response,
      400,
      renderErrorPage('Google sign-in could not be verified.', 'Please try signing in again.')
    );
    return;
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Google token exchange failed with ${tokenResponse.status}: ${body}`);
  }

  const token = await tokenResponse.json();
  if (!token.access_token) {
    throw new Error('Google token response did not include an access token.');
  }

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` }
  });

  if (!userInfoResponse.ok) {
    const body = await userInfoResponse.text();
    throw new Error(`Google userinfo failed with ${userInfoResponse.status}: ${body}`);
  }

  const userInfo = await userInfoResponse.json();
  const email = typeof userInfo.email === 'string' ? userInfo.email.toLowerCase() : '';
  const emailVerified =
    userInfo.email_verified === true || String(userInfo.email_verified).toLowerCase() === 'true';

  if (!email || !emailVerified || !isAllowedEmail(email)) {
    sendHtml(
      response,
      403,
      renderErrorPage(
        'This Google account is not allowed.',
        'Ask a Nexus admin to add your email to the runner dashboard allowlist.'
      )
    );
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const session = {
    email,
    name: typeof userInfo.name === 'string' ? userInfo.name : email,
    picture: typeof userInfo.picture === 'string' ? userInfo.picture : null,
    iat: now,
    exp: now + config.sessionTtlSeconds
  };
  setCookie(response, 'nexus_codex_dashboard', signJson(session), {
    maxAge: config.sessionTtlSeconds,
    httpOnly: true
  });
  redirect(response, withBasePath('/'));
}

async function listRunners() {
  const entries = await readdir(config.registryDir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  const runners = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const filePath = join(config.registryDir, entry.name);
    try {
      const [contents, stats] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
      const data = JSON.parse(contents);
      const lastSeenAt = parseDateMs(data.lastSeenAt) || stats.mtimeMs;
      const ageMs = Math.max(0, now - lastSeenAt);
      const active = ageMs <= config.staleAfterMs && !['stopped', 'stopping'].includes(data.status);
      runners.push({
        runnerId: String(data.runnerId || entry.name.replace(/\.json$/, '')),
        hostname: stringOrNull(data.hostname),
        pid: numberOrNull(data.pid),
        status: String(data.status || 'unknown'),
        active,
        ageMs,
        lastSeenAt: toIso(lastSeenAt),
        startedAt: stringOrNull(data.startedAt),
        lastPollAt: stringOrNull(data.lastPollAt),
        lastClaimAt: stringOrNull(data.lastClaimAt),
        lastJobCompletedAt: stringOrNull(data.lastJobCompletedAt),
        currentJob: normalizeCurrentJob(data.currentJob),
        lastError: stringOrNull(data.lastError),
        jobsProcessed: numberOrZero(data.jobsProcessed),
        nexusBaseUrl: stringOrNull(data.nexusBaseUrl),
        pollIntervalMs: numberOrNull(data.pollIntervalMs),
        heartbeatIntervalMs: numberOrNull(data.heartbeatIntervalMs),
        workRoot: stringOrNull(data.workRoot)
      });
    } catch (error) {
      runners.push({
        runnerId: entry.name.replace(/\.json$/, ''),
        active: false,
        status: 'unreadable',
        ageMs: null,
        lastSeenAt: null,
        lastError: error instanceof Error ? error.message : 'Unable to read runner heartbeat'
      });
    }
  }

  return runners.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return String(a.runnerId).localeCompare(String(b.runnerId));
  });
}

function renderDashboardPage(session) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexus Codex Runners</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09111f;
      --panel: #111c2e;
      --panel-strong: #17243a;
      --line: rgba(148, 163, 184, 0.22);
      --text: #e5edf8;
      --muted: #94a3b8;
      --green: #3ddc84;
      --red: #fb7185;
      --amber: #fbbf24;
      --blue: #60a5fa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: rgba(9, 17, 31, 0.92);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .shell { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; }
    .topbar {
      min-height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    .subtitle { color: var(--muted); margin-top: 3px; }
    .user { display: flex; align-items: center; gap: 12px; color: var(--muted); }
    .user img { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); }
    a { color: var(--blue); text-decoration: none; }
    main { padding: 28px 0 48px; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .stat, .runner {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .stat { padding: 16px; }
    .stat strong { display: block; font-size: 24px; margin-bottom: 2px; }
    .stat span { color: var(--muted); }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--muted);
      margin: 18px 0 12px;
    }
    .runner-list { display: grid; gap: 12px; }
    .runner { overflow: hidden; }
    .runner-head {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 16px;
      background: var(--panel-strong);
      border-bottom: 1px solid var(--line);
    }
    .runner-title { font-weight: 800; font-size: 16px; }
    .runner-meta { color: var(--muted); margin-top: 3px; }
    .badge {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      font-weight: 800;
      text-transform: uppercase;
      font-size: 12px;
    }
    .badge--active { color: #052e16; background: var(--green); border-color: transparent; }
    .badge--inactive { color: #fff1f2; background: rgba(251, 113, 133, 0.18); border-color: rgba(251, 113, 133, 0.45); }
    .runner-body { padding: 16px; display: grid; gap: 14px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .field { min-width: 0; }
    .field span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 800; margin-bottom: 3px; }
    .field code, .field div { overflow-wrap: anywhere; }
    code {
      color: #bfdbfe;
      background: rgba(96, 165, 250, 0.1);
      border: 1px solid rgba(96, 165, 250, 0.16);
      border-radius: 5px;
      padding: 2px 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .job, .error {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(2, 6, 23, 0.25);
    }
    .error { border-color: rgba(251, 113, 133, 0.35); color: #fecdd3; white-space: pre-wrap; }
    .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 28px; text-align: center; color: var(--muted); }
    @media (max-width: 800px) {
      .topbar { align-items: flex-start; flex-direction: column; padding: 16px 0; }
      .stats, .grid { grid-template-columns: 1fr; }
      .runner-head { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell topbar">
      <div>
        <h1>Nexus Codex Runners</h1>
        <div class="subtitle">VPS-managed autonomous Codex workers</div>
      </div>
      <div class="user">
        ${session.picture ? `<img src="${escapeHtml(session.picture)}" alt="">` : ''}
        <div>
          <div>${escapeHtml(session.name || session.email)}</div>
          <a href="${escapeHtml(withBasePath('/logout'))}">Sign out</a>
        </div>
      </div>
    </div>
  </header>
  <main class="shell">
    <section class="stats" id="stats">
      <div class="stat"><strong>0</strong><span>Active</span></div>
      <div class="stat"><strong>0</strong><span>Inactive</span></div>
      <div class="stat"><strong>0</strong><span>Total</span></div>
    </section>
    <div class="toolbar">
      <div id="generated">Loading runners...</div>
      <div>Auto refresh: 15s</div>
    </div>
    <section class="runner-list" id="runners"></section>
  </main>
  <script>
    const runnersEl = document.getElementById('runners');
    const statsEl = document.getElementById('stats');
    const generatedEl = document.getElementById('generated');

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[char]);
    }

    function relativeTime(value) {
      if (!value) return 'never';
      const ms = Date.now() - new Date(value).getTime();
      if (!Number.isFinite(ms)) return value;
      const seconds = Math.max(0, Math.round(ms / 1000));
      if (seconds < 60) return seconds + 's ago';
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (hours < 48) return hours + 'h ago';
      return Math.round(hours / 24) + 'd ago';
    }

    function renderField(label, value, code = false) {
      const body = code ? '<code>' + escapeHtml(value || 'none') + '</code>' : '<div>' + escapeHtml(value || 'none') + '</div>';
      return '<div class="field"><span>' + escapeHtml(label) + '</span>' + body + '</div>';
    }

    function renderRunner(runner) {
      const activeLabel = runner.active ? 'Active' : 'Inactive';
      const badgeClass = runner.active ? 'badge--active' : 'badge--inactive';
      const job = runner.currentJob
        ? '<div class="job">' +
          '<strong>Current job</strong><br>' +
          renderField('Job ID', runner.currentJob.id, true) +
          renderField('Repository', runner.currentJob.targetRepository, true) +
          renderField('Branch', runner.currentJob.branchName, true) +
          '</div>'
        : '';
      const error = runner.lastError ? '<div class="error">' + escapeHtml(runner.lastError) + '</div>' : '';
      return '<article class="runner">' +
        '<div class="runner-head">' +
          '<div><div class="runner-title">' + escapeHtml(runner.runnerId) + '</div>' +
          '<div class="runner-meta">' + escapeHtml(runner.hostname || 'unknown host') + ' · PID ' + escapeHtml(runner.pid || 'n/a') + '</div></div>' +
          '<div><span class="badge ' + badgeClass + '">' + activeLabel + '</span></div>' +
        '</div>' +
        '<div class="runner-body">' +
          '<div class="grid">' +
            renderField('Status', runner.status) +
            renderField('Last seen', relativeTime(runner.lastSeenAt)) +
            renderField('Last poll', relativeTime(runner.lastPollAt)) +
            renderField('Jobs processed', runner.jobsProcessed) +
            renderField('Nexus', runner.nexusBaseUrl, true) +
            renderField('Work root', runner.workRoot, true) +
            renderField('Poll interval', runner.pollIntervalMs ? runner.pollIntervalMs + ' ms' : null) +
            renderField('Heartbeat', runner.heartbeatIntervalMs ? runner.heartbeatIntervalMs + ' ms' : null) +
          '</div>' + job + error +
        '</div>' +
      '</article>';
    }

    async function refresh() {
      try {
        const response = await fetch('${escapeJsString(withBasePath('/api/runners'))}', { credentials: 'same-origin' });
        if (response.status === 401) {
          window.location.href = '${escapeJsString(withBasePath('/login'))}';
          return;
        }
        const data = await response.json();
        const active = data.runners.filter((runner) => runner.active).length;
        const total = data.runners.length;
        statsEl.innerHTML =
          '<div class="stat"><strong>' + active + '</strong><span>Active</span></div>' +
          '<div class="stat"><strong>' + (total - active) + '</strong><span>Inactive</span></div>' +
          '<div class="stat"><strong>' + total + '</strong><span>Total</span></div>';
        generatedEl.textContent = 'Updated ' + new Date(data.generatedAt).toLocaleString();
        runnersEl.innerHTML = total
          ? data.runners.map(renderRunner).join('')
          : '<div class="empty">No runner heartbeat files found yet.</div>';
      } catch (error) {
        generatedEl.textContent = 'Unable to refresh runner status';
        runnersEl.innerHTML = '<div class="error">' + escapeHtml(error.message || error) + '</div>';
      }
    }

    refresh();
    setInterval(refresh, 15000);
  </script>
</body>
</html>`;
}

function renderErrorPage(title, detail) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexus Codex Runners</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09111f; color: #e5edf8; font: 15px/1.45 system-ui, sans-serif; }
    main { width: min(520px, calc(100vw - 32px)); border: 1px solid rgba(148, 163, 184, .25); border-radius: 8px; background: #111c2e; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { color: #94a3b8; }
    a { color: #60a5fa; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a href="${escapeHtml(withBasePath('/login'))}">Sign in again</a></main></body>
</html>`;
}

function readSession(request) {
  const cookies = parseCookies(request.headers.cookie || '');
  const session = verifySignedJson(cookies.nexus_codex_dashboard || '');
  if (!session || typeof session.email !== 'string' || typeof session.exp !== 'number') {
    return null;
  }
  if (session.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (!isAllowedEmail(session.email)) {
    return null;
  }
  return session;
}

function isAllowedEmail(email) {
  const normalized = email.toLowerCase();
  if (config.allowedEmails.includes(normalized)) {
    return true;
  }
  const domain = normalized.split('@')[1] || '';
  return config.allowedDomains.includes(domain);
}

function signJson(value) {
  return signValue(Buffer.from(JSON.stringify(value)).toString('base64url'));
}

function verifySignedJson(value) {
  const raw = verifySignedValue(value);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function signValue(value) {
  const signature = createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function verifySignedValue(value) {
  const [body, signature] = value.split('.');
  if (!body || !signature) {
    return null;
  }
  const expected = createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) {
    return null;
  }
  return body;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function setCookie(response, name, value, options = {}) {
  const parts = [
    `${name}=${value}`,
    `Path=${config.basePath || '/'}`,
    'SameSite=Lax',
    options.httpOnly === false ? null : 'HttpOnly',
    config.baseUrl.startsWith('https://') ? 'Secure' : null,
    options.maxAge ? `Max-Age=${options.maxAge}` : null
  ].filter(Boolean);
  appendHeader(response, 'Set-Cookie', parts.join('; '));
}

function clearCookie(response, name) {
  appendHeader(
    response,
    'Set-Cookie',
    `${name}=; Path=${config.basePath || '/'}; SameSite=Lax; HttpOnly; Max-Age=0${
      config.baseUrl.startsWith('https://') ? '; Secure' : ''
    }`
  );
}

function appendHeader(response, name, value) {
  const current = response.getHeader(name);
  if (!current) {
    response.setHeader(name, value);
  } else if (Array.isArray(current)) {
    response.setHeader(name, [...current, value]);
  } else {
    response.setHeader(name, [current, value]);
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(302, {
    location,
    'cache-control': 'no-store'
  });
  response.end();
}

function normalizeCurrentJob(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    id: stringOrNull(value.id),
    messageId: stringOrNull(value.messageId),
    targetRepository: stringOrNull(value.targetRepository),
    baseBranch: stringOrNull(value.baseBranch),
    branchName: stringOrNull(value.branchName),
    status: stringOrNull(value.status),
    createdAt: stringOrNull(value.createdAt)
  };
}

function parseDateMs(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return char;
    }
  });
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function withBasePath(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!config.basePath) {
    return normalizedPath;
  }
  if (normalizedPath === '/') {
    return `${config.basePath}/`;
  }
  return `${config.basePath}${normalizedPath}`;
}

function stripBasePath(pathname) {
  if (!config.basePath) {
    return pathname || '/';
  }
  if (pathname === config.basePath) {
    return '/';
  }
  if (pathname.startsWith(`${config.basePath}/`)) {
    return pathname.slice(config.basePath.length) || '/';
  }
  return pathname;
}

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function loadEnv(path) {
  if (!existsSync(path)) {
    return;
  }
  const contents = readFileSync(path, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = stripEnvQuotes(rawValue);
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseList(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
