#!/usr/bin/env node
import { execFile } from 'child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { createServer } from 'http';
import { hostname } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(scriptDir, 'codex-runner-dashboard.env'));

const workRoot = resolve(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work'));
const registryDir = resolve(process.env.CODEX_RUNNER_REGISTRY_DIR || join(workRoot, 'runners'));
const controlDir = resolve(process.env.CODEX_RUNNER_CONTROL_DIR || join(workRoot, 'runner-controls'));

const config = {
  host: process.env.DASHBOARD_HOST || '127.0.0.1',
  port: parsePositiveInt(process.env.DASHBOARD_PORT, 8788),
  baseUrl: requireEnv('DASHBOARD_BASE_URL').replace(/\/+$/, ''),
  basePath: normalizeBasePath(process.env.DASHBOARD_BASE_PATH || ''),
  basePathAliases: parsePathList(process.env.DASHBOARD_BASE_PATH_ALIASES),
  oauthBasePath: normalizeBasePath(
    process.env.DASHBOARD_OAUTH_BASE_PATH || process.env.DASHBOARD_BASE_PATH || ''
  ),
  cookiePath: normalizeCookiePath(process.env.DASHBOARD_COOKIE_PATH || '/'),
  googleClientId: requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
  sessionSecret: requireEnv('DASHBOARD_SESSION_SECRET'),
  allowedEmails: parseList(process.env.DASHBOARD_ALLOWED_EMAILS),
  allowedDomains: parseList(process.env.DASHBOARD_ALLOWED_DOMAINS).map((domain) =>
    domain.toLowerCase()
  ),
  nexusBaseUrl: requireEnv('NEXUS_BASE_URL').replace(/\/+$/, ''),
  runnerToken: requireEnv('CODEX_RUNNER_TOKEN'),
  defaultRepository: process.env.CODEX_RUNNER_REPOSITORY || 'Valorith/Server',
  defaultBaseBranch: process.env.CODEX_RUNNER_BASE_BRANCH || 'master',
  runnerServiceName: process.env.CODEX_RUNNER_SERVICE_NAME || 'nexus-codex-runner.service',
  workRoot,
  registryDir,
  controlDir,
  staleAfterMs: parsePositiveInt(process.env.DASHBOARD_STALE_AFTER_MS, 45_000),
  sessionTtlSeconds: parsePositiveInt(process.env.DASHBOARD_SESSION_TTL_SECONDS, 86_400),
  logLines: parsePositiveInt(process.env.DASHBOARD_LOG_LINES, 240)
};

if (config.allowedEmails.length === 0 && config.allowedDomains.length === 0) {
  throw new Error('DASHBOARD_ALLOWED_EMAILS or DASHBOARD_ALLOWED_DOMAINS is required.');
}

const redirectUri = `${config.baseUrl}${config.oauthBasePath}/auth/google/callback`;

await mkdir(config.registryDir, { recursive: true });
await mkdir(config.controlDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message =
      error instanceof Error ? error.message : 'The dashboard could not complete that request.';
    console.error(error instanceof Error ? error.stack || error.message : error);

    if (isApiRequest(request)) {
      sendJson(response, statusCode, { error: message });
      return;
    }

    sendHtml(response, statusCode, renderErrorPage('Something went sideways.', message));
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `Nexus Codex runner dashboard listening on http://${config.host}:${config.port} for ${config.baseUrl}${config.basePath}`
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

  if (path === '/api/overview') {
    requireMethod(request, 'GET');
    await sendOverview(response, url);
    return;
  }

  if (path === '/api/runners') {
    requireMethod(request, 'GET');
    const runners = await listRunners();
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      staleAfterMs: config.staleAfterMs,
      service: await getRunnerServiceStatus(),
      user: serializeSessionUser(session),
      runners
    });
    return;
  }

  const runnerControlMatch = path.match(/^\/api\/runners\/([^/]+)\/control$/);
  if (runnerControlMatch) {
    requireMethod(request, 'POST');
    await handleRunnerControl(response, runnerControlMatch[1], session, await readJsonBody(request));
    return;
  }

  const runnerLogsMatch = path.match(/^\/api\/runners\/([^/]+)\/logs$/);
  if (runnerLogsMatch) {
    requireMethod(request, 'GET');
    const lines = parsePositiveInt(url.searchParams.get('lines') || '', config.logLines);
    const logs = await readRunnerLogs(Math.min(lines, 1_000));
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      runnerId: decodeURIComponent(runnerLogsMatch[1]),
      serviceName: config.runnerServiceName,
      logs
    });
    return;
  }

  if (path === '/api/tasks') {
    if (request.method === 'GET') {
      await sendTaskList(response, url);
      return;
    }
    if (request.method === 'POST') {
      await sendTaskCreate(response, await readJsonBody(request));
      return;
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const taskDetailMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskDetailMatch) {
    requireMethod(request, 'GET');
    const jobId = decodeURIComponent(taskDetailMatch[1]);
    sendJson(response, 200, await nexusGet(`/jobs/${encodeURIComponent(jobId)}?detail=1`));
    return;
  }

  const taskCancelMatch = path.match(/^\/api\/tasks\/([^/]+)\/cancel$/);
  if (taskCancelMatch) {
    requireMethod(request, 'POST');
    const jobId = decodeURIComponent(taskCancelMatch[1]);
    const body = await readJsonBody(request);
    sendJson(
      response,
      200,
      await nexusPost(`/jobs/${encodeURIComponent(jobId)}/cancel`, {
        reason: typeof body.reason === 'string' ? body.reason : 'Canceled from dashboard.'
      })
    );
    return;
  }

  const taskRetryMatch = path.match(/^\/api\/tasks\/([^/]+)\/retry$/);
  if (taskRetryMatch) {
    requireMethod(request, 'POST');
    const jobId = decodeURIComponent(taskRetryMatch[1]);
    sendJson(response, 200, await nexusPost(`/jobs/${encodeURIComponent(jobId)}/retry`, {}));
    return;
  }

  if (path === '/') {
    requireMethod(request, 'GET');
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

async function sendOverview(response, url) {
  const [runners, tasks, service] = await Promise.all([
    listRunners(),
    listTasks(url.searchParams),
    getRunnerServiceStatus()
  ]);

  sendJson(response, 200, {
    generatedAt: new Date().toISOString(),
    staleAfterMs: config.staleAfterMs,
    service,
    defaults: {
      repository: config.defaultRepository,
      baseBranch: config.defaultBaseBranch
    },
    runners,
    tasks
  });
}

async function sendTaskList(response, url) {
  sendJson(response, 200, {
    generatedAt: new Date().toISOString(),
    tasks: await listTasks(url.searchParams)
  });
}

async function sendTaskCreate(response, body) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 10) {
    throw new HttpError(400, 'Task prompt must be at least 10 characters.');
  }

  sendJson(
    response,
    200,
    await nexusPost('/jobs', {
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      targetRepository:
        typeof body.targetRepository === 'string' ? body.targetRepository.trim() : undefined,
      baseBranch: typeof body.baseBranch === 'string' ? body.baseBranch.trim() : undefined,
      prompt
    })
  );
}

async function handleRunnerControl(response, encodedRunnerId, session, body) {
  const runnerId = decodeURIComponent(encodedRunnerId);
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (action === 'pause' || action === 'resume') {
    const paused = action === 'pause';
    await writeRunnerControl(runnerId, {
      paused,
      reason: paused ? reason || 'Paused from the runner dashboard.' : reason || null,
      updatedAt: new Date().toISOString(),
      updatedBy: session.email
    });
    sendJson(response, 200, { ok: true, runnerId, action, control: await readRunnerControl(runnerId) });
    return;
  }

  if (['start', 'stop', 'restart'].includes(action)) {
    const result = await runServiceAction(action);
    sendJson(response, 200, {
      ok: true,
      runnerId,
      action,
      service: await getRunnerServiceStatus(),
      output: result.stdout || result.stderr || ''
    });
    return;
  }

  throw new HttpError(400, 'Unsupported runner control action.');
}

async function listTasks(searchParams = new URLSearchParams()) {
  const params = new URLSearchParams();
  params.set('limit', searchParams.get('limit') || '50');
  if (searchParams.get('status')) {
    params.set('status', searchParams.get('status'));
  }
  if (searchParams.get('runnerId')) {
    params.set('runnerId', searchParams.get('runnerId'));
  }

  const response = await nexusGet(`/jobs?${params.toString()}`);
  return Array.isArray(response.jobs) ? response.jobs : [];
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
      const runnerId = String(data.runnerId || entry.name.replace(/\.json$/, ''));
      const lastSeenAt = parseDateMs(data.lastSeenAt) || stats.mtimeMs;
      const ageMs = Math.max(0, now - lastSeenAt);
      const status = String(data.status || 'unknown');
      const control = normalizeControl(data.control || (await readRunnerControl(runnerId)));
      const active = ageMs <= config.staleAfterMs && !['stopped', 'stopping'].includes(status);
      runners.push({
        runnerId,
        hostname: stringOrNull(data.hostname),
        pid: numberOrNull(data.pid),
        status,
        paused: status === 'paused' || control.paused === true,
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
        cancelCheckIntervalMs: numberOrNull(data.cancelCheckIntervalMs),
        workRoot: stringOrNull(data.workRoot),
        controlFile: stringOrNull(data.controlFile) || getRunnerControlFile(runnerId),
        control
      });
    } catch (error) {
      runners.push({
        runnerId: entry.name.replace(/\.json$/, ''),
        active: false,
        paused: false,
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

async function writeRunnerControl(runnerId, control) {
  await mkdir(config.controlDir, { recursive: true });
  await writeFile(getRunnerControlFile(runnerId), `${JSON.stringify(control, null, 2)}\n`, 'utf8');
}

async function readRunnerControl(runnerId) {
  const filePath = getRunnerControlFile(runnerId);
  if (!existsSync(filePath)) {
    return normalizeControl(null);
  }
  try {
    return normalizeControl(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    return normalizeControl({
      paused: false,
      reason: error instanceof Error ? `Invalid control file: ${error.message}` : 'Invalid control file'
    });
  }
}

function getRunnerControlFile(runnerId) {
  return join(config.controlDir, `${sanitizeFileName(runnerId)}.json`);
}

function normalizeControl(value) {
  if (!value || typeof value !== 'object') {
    return {
      paused: false,
      reason: null,
      updatedAt: null,
      updatedBy: null
    };
  }
  return {
    paused: value.paused === true,
    reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === 'string' && value.updatedBy.trim() ? value.updatedBy : null
  };
}

async function runServiceAction(action) {
  return runExecFile('sudo', ['-n', 'systemctl', action, config.runnerServiceName], {
    timeoutMs: 45_000
  });
}

async function getRunnerServiceStatus() {
  try {
    const [active, enabled] = await Promise.all([
      runExecFile('systemctl', ['is-active', config.runnerServiceName], {
        allowNonZero: true,
        timeoutMs: 10_000
      }),
      runExecFile('systemctl', ['is-enabled', config.runnerServiceName], {
        allowNonZero: true,
        timeoutMs: 10_000
      })
    ]);
    return {
      name: config.runnerServiceName,
      active: active.stdout.trim() || active.stderr.trim() || 'unknown',
      enabled: enabled.stdout.trim() || enabled.stderr.trim() || 'unknown'
    };
  } catch (error) {
    return {
      name: config.runnerServiceName,
      active: 'unknown',
      enabled: 'unknown',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readRunnerLogs(lines) {
  const args = [
    '-u',
    config.runnerServiceName,
    '-n',
    String(lines),
    '--no-pager',
    '--output',
    'short-iso'
  ];

  try {
    const result = await runExecFile('sudo', ['-n', 'journalctl', ...args], {
      allowNonZero: true,
      maxBuffer: 2_000_000,
      timeoutMs: 20_000
    });
    return result.stdout || result.stderr || '';
  } catch {
    const result = await runExecFile('journalctl', args, {
      allowNonZero: true,
      maxBuffer: 2_000_000,
      timeoutMs: 20_000
    });
    return result.stdout || result.stderr || '';
  }
}

async function nexusGet(path) {
  return parseNexusResponse(
    await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
      headers: {
        authorization: `Bearer ${config.runnerToken}`
      }
    })
  );
}

async function nexusPost(path, body) {
  return parseNexusResponse(
    await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.runnerToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body || {})
    })
  );
}

async function parseNexusResponse(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new HttpError(
      response.status,
      body?.error || body?.message || text || `Nexus responded with ${response.status}.`
    );
  }

  return body || {};
}

function renderDashboardPage(session) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexus Codex</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0d12;
      --bg-2: #0d121a;
      --panel: #121821;
      --panel-2: #171f2a;
      --panel-3: #1d2632;
      --line: rgba(172, 187, 205, 0.18);
      --line-strong: rgba(172, 187, 205, 0.34);
      --text: #edf3fb;
      --muted: #9ca9b8;
      --soft: #c9d4e2;
      --green: #35dd8b;
      --red: #ff7185;
      --amber: #f4c95d;
      --teal: #2dd4bf;
      --violet: #a78bfa;
      --blue: #74a8ff;
      --shadow: rgba(0, 0, 0, 0.38);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 18% 0%, rgba(45, 212, 191, 0.11), transparent 34%),
        radial-gradient(circle at 86% 12%, rgba(167, 139, 250, 0.1), transparent 30%),
        linear-gradient(180deg, var(--bg), var(--bg-2) 42%, #090b0f);
      color: var(--text);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: rgba(10, 13, 18, 0.88);
      backdrop-filter: blur(18px);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    button, input, textarea, select {
      font: inherit;
    }
    button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #17202b;
      color: var(--text);
      padding: 0 12px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
    }
    button:hover { border-color: rgba(45, 212, 191, 0.58); transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.primary { background: #136f63; border-color: rgba(45, 212, 191, 0.72); }
    button.ghost { background: rgba(18, 24, 33, 0.58); color: var(--soft); }
    button.good { background: #147a46; border-color: #22c55e; }
    button.warn { background: #735117; border-color: #f4c95d; }
    button.danger { background: #742033; border-color: #ff7185; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0c1118;
      color: var(--text);
      padding: 10px 11px;
      outline: none;
    }
    input:focus, textarea:focus, select:focus { border-color: rgba(45, 212, 191, 0.7); }
    textarea { min-height: 132px; resize: vertical; }
    label { display: grid; gap: 6px; color: var(--soft); font-weight: 800; }
    a { color: var(--blue); text-decoration: none; }
    pre {
      margin: 0;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    code {
      color: #bfdbfe;
      background: rgba(106, 168, 255, 0.1);
      border: 1px solid rgba(106, 168, 255, 0.16);
      border-radius: 5px;
      padding: 2px 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .shell { width: min(1280px, calc(100vw - 32px)); margin: 0 auto; }
    .topbar {
      min-height: 74px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    h1 { margin: 0; font-size: 23px; letter-spacing: 0; }
    h2 { margin: 0; font-size: 17px; letter-spacing: 0; }
    h3 { margin: 0; font-size: 15px; letter-spacing: 0; }
    .subtitle { color: var(--muted); margin-top: 3px; }
    .user { display: flex; align-items: center; gap: 12px; color: var(--muted); }
    .user img { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); }
    main { padding: 24px 0 48px; }
    .command-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .summary-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .summary-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0 11px;
      background: rgba(18, 24, 33, 0.68);
      color: var(--soft);
      font-weight: 800;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    }
    .summary-pill span { color: var(--muted); font-weight: 700; }
    .panel, .runner-card, .history-row {
      background: rgba(18, 24, 33, 0.92);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 12px 28px var(--shadow);
    }
    .panel { overflow: hidden; }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 52px;
      padding: 14px 16px;
      background: rgba(23, 31, 42, 0.88);
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 16px; display: grid; gap: 13px; }
    .row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .muted { color: var(--muted); }
    .mini { font-size: 12px; color: var(--muted); }
    .view-stack { display: grid; gap: 16px; }
    .form-grid { display: grid; grid-template-columns: 1fr 160px; gap: 10px; }
    .runner-list {
      display: grid;
      gap: 12px;
    }
    .runner-card {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) 170px 150px 130px;
      gap: 14px;
      align-items: center;
      width: 100%;
      text-align: left;
      padding: 16px;
      border-color: rgba(172, 187, 205, 0.2);
      position: relative;
      overflow: hidden;
    }
    .runner-card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--muted);
      opacity: 0.65;
    }
    .runner-card.running::before, .runner-card.active::before { background: var(--green); }
    .runner-card.paused::before { background: var(--amber); }
    .runner-card.inactive::before { background: var(--red); }
    .runner-card:hover {
      border-color: rgba(45, 212, 191, 0.48);
      background: rgba(23, 31, 42, 0.96);
    }
    .runner-primary { min-width: 0; display: grid; gap: 7px; }
    .runner-name { font-weight: 950; font-size: 17px; overflow-wrap: anywhere; }
    .runner-subline { color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; }
    .runner-kpi { display: grid; gap: 3px; min-width: 0; }
    .runner-kpi span { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 900; }
    .runner-kpi strong { font-size: 15px; overflow-wrap: anywhere; }
    .detail-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 14px;
      align-items: start;
    }
    .detail-head {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .detail-title { display: grid; gap: 5px; }
    .detail-title > button { justify-self: start; }
    .detail-title h2 { font-size: 22px; }
    .detail-controls { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .control-stack { display: grid; gap: 14px; }
    .control-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.2);
      padding: 12px;
    }
    .control-summary-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .control-summary-main strong { display: block; font-size: 16px; }
    .control-summary-main span:last-child {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 1px;
    }
    .control-section {
      display: grid;
      gap: 9px;
      border-top: 1px solid rgba(172, 187, 205, 0.14);
      padding-top: 12px;
    }
    .control-section:first-child { border-top: 0; padding-top: 0; }
    .control-section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .control-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .control-actions button { width: 100%; }
    .metric-list { display: grid; gap: 7px; }
    .metric-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 30px;
    }
    .metric-row span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
    }
    .metric-row strong {
      color: var(--text);
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }
    .path-stack { display: grid; gap: 8px; }
    .path-item { display: grid; gap: 5px; min-width: 0; }
    .path-item span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
    }
    .path-value {
      display: block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #bfdbfe;
      background: rgba(106, 168, 255, 0.1);
      border: 1px solid rgba(106, 168, 255, 0.16);
      border-radius: 7px;
      padding: 7px 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .field { min-width: 0; }
    .field span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 900; margin-bottom: 3px; }
    .field code, .field div { overflow-wrap: anywhere; }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 26px;
      padding: 0 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      font-weight: 900;
      text-transform: uppercase;
      font-size: 12px;
      white-space: nowrap;
    }
    .badge.active, .badge.succeeded { color: #052e16; background: var(--green); border-color: transparent; }
    .badge.inactive, .badge.failed, .badge.canceled { color: #fff1f2; background: rgba(251, 113, 133, 0.18); border-color: rgba(251, 113, 133, 0.48); }
    .badge.paused, .badge.queued, .badge.claimed { color: #422006; background: var(--amber); border-color: transparent; }
    .badge.running { color: #042f2e; background: var(--teal); border-color: transparent; }
    .badge.idle { color: #dbeafe; background: rgba(116, 168, 255, 0.16); border-color: rgba(116, 168, 255, 0.34); }
    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--muted);
      box-shadow: 0 0 0 0 rgba(156, 169, 184, 0.35);
    }
    .status-dot.active, .status-dot.running {
      background: var(--green);
      animation: pulse-green 1.7s infinite;
    }
    .status-dot.paused {
      background: var(--amber);
      animation: pulse-amber 1.9s infinite;
    }
    .status-dot.inactive, .status-dot.failed, .status-dot.canceled { background: var(--red); }
    .activity-bar {
      height: 4px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(172, 187, 205, 0.12);
    }
    .activity-bar span {
      display: block;
      width: 38%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--teal), var(--green), var(--violet));
      animation: scan 1.4s infinite ease-in-out;
    }
    .job, .error, .logbox, .empty {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(2, 6, 23, 0.28);
    }
    .error { border-color: rgba(251, 113, 133, 0.38); color: #fecdd3; white-space: pre-wrap; }
    .logbox { min-height: 260px; max-height: 470px; overflow: auto; }
    .history { display: grid; gap: 8px; }
    .history-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 130px 120px 130px;
      gap: 12px;
      align-items: center;
      padding: 12px;
      box-shadow: none;
      border-color: rgba(172, 187, 205, 0.16);
    }
    .history-main { min-width: 0; display: grid; gap: 4px; }
    .history-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .empty { border-style: dashed; padding: 28px; text-align: center; color: var(--muted); }
    .hidden { display: none !important; }
    .modal {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.62);
    }
    .modal[hidden] { display: none; }
    .modal-card {
      width: min(980px, 100%);
      max-height: min(760px, calc(100vh - 40px));
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
    }
    .modal-body { overflow: auto; padding: 16px; display: grid; gap: 14px; }
    @keyframes pulse-green {
      0% { box-shadow: 0 0 0 0 rgba(53, 221, 139, 0.42); }
      72% { box-shadow: 0 0 0 9px rgba(53, 221, 139, 0); }
      100% { box-shadow: 0 0 0 0 rgba(53, 221, 139, 0); }
    }
    @keyframes pulse-amber {
      0% { box-shadow: 0 0 0 0 rgba(244, 201, 93, 0.38); }
      72% { box-shadow: 0 0 0 9px rgba(244, 201, 93, 0); }
      100% { box-shadow: 0 0 0 0 rgba(244, 201, 93, 0); }
    }
    @keyframes scan {
      0% { transform: translateX(-110%); }
      55% { transform: translateX(95%); }
      100% { transform: translateX(260%); }
    }
    @media (max-width: 980px) {
      .runner-card { grid-template-columns: 1fr 1fr; }
      .detail-shell { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .history-row { grid-template-columns: 1fr; }
      .history-actions { justify-content: flex-start; }
    }
    @media (max-width: 620px) {
      .shell { width: min(100vw - 20px, 1280px); }
      .topbar { align-items: flex-start; flex-direction: column; padding: 16px 0; }
      .command-bar, .toolbar, .detail-head { align-items: flex-start; flex-direction: column; }
      .runner-card, .grid, .form-grid { grid-template-columns: 1fr; }
      .control-actions { grid-template-columns: 1fr; }
      .detail-controls { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell topbar">
      <div>
        <h1>Nexus Codex</h1>
        <div class="subtitle">Runner operations</div>
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
    <section class="command-bar">
      <div class="summary-strip" id="summary-strip"></div>
      <div class="row">
        <button class="ghost" data-refresh>Refresh</button>
        <button class="ghost" data-open-create>New run</button>
      </div>
    </section>
    <section class="view-stack" id="landing-view">
      <div class="toolbar">
        <div>
          <h2>Runners</h2>
          <div class="mini" id="generated">Loading...</div>
        </div>
      </div>
      <div class="runner-list" id="runners"></div>
    </section>
    <section class="view-stack hidden" id="detail-view">
      <div class="detail-head">
        <div class="detail-title">
          <button class="ghost" data-back-to-runners>Back to runners</button>
          <h2 id="detail-runner-title">Runner</h2>
          <div class="runner-subline" id="detail-runner-meta"></div>
        </div>
        <div class="detail-controls" id="detail-controls"></div>
      </div>
      <div class="detail-shell">
        <div class="view-stack">
          <article class="panel">
            <div class="panel-head">
              <h2>Activity</h2>
              <span class="mini" id="detail-updated">Loading...</span>
            </div>
            <div class="panel-body" id="detail-activity"></div>
          </article>
          <article class="panel">
            <div class="panel-head">
              <h2>History</h2>
              <div class="row">
                <select id="detail-status-filter" aria-label="Runner history status">
                  <option value="">All</option>
                  <option value="QUEUED,CLAIMED,RUNNING">Active</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELED">Canceled</option>
                  <option value="SUCCEEDED">Succeeded</option>
                </select>
                <button class="ghost" data-refresh-history>Refresh</button>
              </div>
            </div>
            <div class="panel-body">
              <div class="history" id="history"></div>
            </div>
          </article>
        </div>
        <aside class="view-stack">
          <article class="panel">
            <div class="panel-head">
              <h2>Controls</h2>
              <span class="mini" id="service-state">Service</span>
            </div>
            <div class="panel-body">
              <div class="control-stack" id="runner-metrics"></div>
            </div>
          </article>
          <article class="panel">
            <div class="panel-head">
              <h2>Logs</h2>
              <button class="ghost" data-log-refresh>Refresh</button>
            </div>
            <div class="panel-body">
              <span class="mini" id="log-status">Logs load on demand.</span>
              <div class="logbox"><pre id="logs">Select Refresh to load runner service logs.</pre></div>
            </div>
          </article>
        </aside>
      </div>
    </section>
  </main>
  <div class="modal" id="create-modal" hidden>
    <article class="modal-card">
      <div class="panel-head">
        <h2>New run</h2>
        <button data-create-close>Close</button>
      </div>
      <form class="modal-body" id="task-form">
        <label>Title
          <input name="title" maxlength="160" placeholder="Short description">
        </label>
        <div class="form-grid">
          <label>Repository
            <input name="targetRepository" value="${escapeHtml(config.defaultRepository)}">
          </label>
          <label>Base branch
            <input name="baseBranch" value="${escapeHtml(config.defaultBaseBranch)}">
          </label>
        </div>
        <label>Prompt
          <textarea name="prompt" required placeholder="Tell Codex what to investigate, change, test, and open a PR for."></textarea>
        </label>
        <div class="row">
          <button class="primary" type="submit">Queue run</button>
          <span class="mini" id="create-status"></span>
        </div>
      </form>
    </article>
  </div>
  <div class="modal" id="detail-modal" hidden>
    <article class="modal-card">
      <div class="panel-head">
        <h2 id="detail-title">Task Details</h2>
        <button data-modal-close>Close</button>
      </div>
      <div class="modal-body" id="detail-body"></div>
    </article>
  </div>
  <script>
    const API = {
      overview: '${escapeJsString(withBasePath('/api/overview'))}',
      tasks: '${escapeJsString(withBasePath('/api/tasks'))}',
      runners: '${escapeJsString(withBasePath('/api/runners'))}'
    };
    const landingViewEl = document.getElementById('landing-view');
    const detailViewEl = document.getElementById('detail-view');
    const runnersEl = document.getElementById('runners');
    const summaryStripEl = document.getElementById('summary-strip');
    const generatedEl = document.getElementById('generated');
    const detailRunnerTitleEl = document.getElementById('detail-runner-title');
    const detailRunnerMetaEl = document.getElementById('detail-runner-meta');
    const detailControlsEl = document.getElementById('detail-controls');
    const detailActivityEl = document.getElementById('detail-activity');
    const detailUpdatedEl = document.getElementById('detail-updated');
    const detailStatusFilterEl = document.getElementById('detail-status-filter');
    const runnerMetricsEl = document.getElementById('runner-metrics');
    const serviceStateEl = document.getElementById('service-state');
    const historyEl = document.getElementById('history');
    const logsEl = document.getElementById('logs');
    const logStatusEl = document.getElementById('log-status');
    const createModalEl = document.getElementById('create-modal');
    const createStatusEl = document.getElementById('create-status');
    const detailModalEl = document.getElementById('detail-modal');
    const detailBodyEl = document.getElementById('detail-body');
    const detailTitleEl = document.getElementById('detail-title');
    let latestRunners = [];
    let latestTasks = [];
    let latestService = {};
    let selectedRunnerId = null;
    let runnerHistory = [];

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
      const body = code
        ? '<code>' + escapeHtml(value || 'none') + '</code>'
        : '<div>' + escapeHtml(value || 'none') + '</div>';
      return '<div class="field"><span>' + escapeHtml(label) + '</span>' + body + '</div>';
    }

    function renderMetricRow(label, value) {
      return '<div class="metric-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || 'none') + '</strong></div>';
    }

    function renderPathItem(label, value) {
      const safeValue = value || 'none';
      return '<div class="path-item"><span>' + escapeHtml(label) + '</span><code class="path-value" title="' + escapeHtml(safeValue) + '">' + escapeHtml(safeValue) + '</code></div>';
    }

    function statusClass(value) {
      return String(value || '').toLowerCase();
    }

    function runnerStateClass(runner) {
      if (!runner.active) return 'inactive';
      if (runner.paused) return 'paused';
      if (runner.status === 'processing' || runner.currentJob) return 'running';
      return 'active';
    }

    function renderBadge(label, className) {
      return '<span class="badge ' + escapeHtml(className || statusClass(label)) + '">' + escapeHtml(label || 'unknown') + '</span>';
    }

    function taskCanCancel(task) {
      return ['QUEUED', 'CLAIMED', 'RUNNING'].includes(task.status);
    }

    function taskCanRetry(task) {
      return ['FAILED', 'CANCELED'].includes(task.status);
    }

    function renderRunner(runner) {
      const activeLabel = runner.paused ? 'Paused' : runner.active ? 'Active' : 'Inactive';
      const stateClass = runnerStateClass(runner);
      const current = runner.currentJob
        ? '<div class="mini">Running ' + escapeHtml(runner.currentJob.branchName || runner.currentJob.id) + '</div>' +
          (runner.currentJob.statusMessage ? '<div class="mini">' + escapeHtml(runner.currentJob.statusMessage) + '</div>' : '')
        : '<div class="mini">No current run</div>';
      return '<button class="runner-card ' + stateClass + '" data-runner-open="' + escapeHtml(runner.runnerId) + '">' +
        '<div class="runner-primary">' +
          '<div class="row"><span class="status-dot ' + stateClass + '"></span><span class="runner-name">' + escapeHtml(runner.runnerId) + '</span>' + renderBadge(activeLabel, stateClass) + '</div>' +
          '<div class="runner-subline"><span>' + escapeHtml(runner.hostname || 'unknown host') + '</span><span>PID ' + escapeHtml(runner.pid || 'n/a') + '</span></div>' +
          (stateClass === 'running' ? '<div class="activity-bar"><span></span></div>' : '') +
          current +
        '</div>' +
        '<div class="runner-kpi"><span>Status</span><strong>' + escapeHtml(runner.status || 'unknown') + '</strong></div>' +
        '<div class="runner-kpi"><span>Last seen</span><strong>' + escapeHtml(relativeTime(runner.lastSeenAt)) + '</strong></div>' +
        '<div class="runner-kpi"><span>Runs</span><strong>' + escapeHtml(runner.jobsProcessed || '0') + '</strong></div>' +
      '</button>';
    }

    function renderActivity(runner) {
      const stateClass = runnerStateClass(runner);
      const cloud = runner.currentJob?.codexCloud;
      const cloudTask = cloud
        ? '<div class="job">' +
          '<div class="row">' + renderBadge('Codex Cloud', 'running') + '<span class="muted">' + escapeHtml(cloud.status || 'submitted') + '</span></div>' +
          '<div class="grid" style="margin-top:12px">' +
            renderField('Task', cloud.taskUrl || cloud.taskId, Boolean(cloud.taskUrl)) +
            renderField('Environment', cloud.envId, true) +
            renderField('Attempts', cloud.attempts || '1') +
            renderField('Checked', relativeTime(cloud.lastCheckedAt || cloud.submittedAt)) +
          '</div></div>'
        : '';
      const job = runner.currentJob
        ? '<div class="job">' +
          '<div class="row">' + renderBadge('Running', 'running') + '<code>' + escapeHtml(runner.currentJob.id) + '</code></div>' +
          (runner.currentJob.statusMessage ? '<div class="mini" style="margin-top:8px">' + escapeHtml(runner.currentJob.statusMessage) + '</div>' : '') +
          '<div class="grid" style="margin-top:12px">' +
            renderField('Repository', runner.currentJob.targetRepository, true) +
            renderField('Base', runner.currentJob.baseBranch, true) +
            renderField('Branch', runner.currentJob.branchName, true) +
            renderField('Mode', runner.currentJob.executionMode || runner.executionMode || 'local') +
            renderField('Created', relativeTime(runner.currentJob.createdAt)) +
          '</div><div class="activity-bar" style="margin-top:12px"><span></span></div></div>' +
          cloudTask
        : '<div class="empty">Idle</div>';
      const error = runner.lastError ? '<div class="error">' + escapeHtml(runner.lastError) + '</div>' : '';
      return '<div class="row">' +
          '<span class="status-dot ' + stateClass + '"></span>' +
          renderBadge(runner.paused ? 'Paused' : runner.active ? 'Active' : 'Inactive', stateClass) +
          '<span class="muted">' + escapeHtml(runner.status || 'unknown') + '</span>' +
        '</div>' +
        '<div class="grid">' +
          renderField('Last seen', relativeTime(runner.lastSeenAt)) +
          renderField('Last poll', relativeTime(runner.lastPollAt)) +
          renderField('Last claim', relativeTime(runner.lastClaimAt)) +
          renderField('Completed', relativeTime(runner.lastJobCompletedAt)) +
        '</div>' + job + error;
    }

    function renderHistoryTask(task) {
      const id = escapeHtml(task.id);
      const pr = task.prUrl ? '<a href="' + escapeHtml(task.prUrl) + '" target="_blank" rel="noreferrer">PR #' + escapeHtml(task.prNumber || '') + '</a>' : '<span class="muted">No PR</span>';
      const actions =
        '<button data-task-detail="' + id + '">Details</button>' +
        (taskCanCancel(task) ? '<button class="danger" data-task-cancel="' + id + '">Cancel</button>' : '') +
        (taskCanRetry(task) ? '<button class="warn" data-task-retry="' + id + '">Retry</button>' : '');
      return '<div class="history-row">' +
        '<div class="history-main">' +
          '<div class="row">' + renderBadge(task.status, statusClass(task.status)) + '<code>' + id + '</code></div>' +
          '<div><strong>' + escapeHtml(task.targetRepository) + '</strong> <span class="muted">on</span> <code>' + escapeHtml(task.baseBranch) + '</code></div>' +
          '<div class="mini">' + escapeHtml(task.statusMessage || 'No status message') + '</div>' +
        '</div>' +
        '<div>' + escapeHtml(relativeTime(task.createdAt)) + '</div>' +
        '<div>' + pr + '</div>' +
        '<div class="history-actions">' + actions + '</div>' +
      '</div>';
    }

    function renderSummary(runners, tasks, service) {
      const activeRunners = runners.filter((runner) => runner.active && !runner.paused).length;
      const pausedRunners = runners.filter((runner) => runner.paused).length;
      const activeTasks = tasks.filter((task) => ['QUEUED', 'CLAIMED', 'RUNNING'].includes(task.status)).length;
      const failedTasks = tasks.filter((task) => task.status === 'FAILED').length;
      summaryStripEl.innerHTML =
        '<div class="summary-pill"><strong>' + activeRunners + '</strong><span>active</span></div>' +
        '<div class="summary-pill"><strong>' + pausedRunners + '</strong><span>paused</span></div>' +
        '<div class="summary-pill"><strong>' + activeTasks + '</strong><span>open runs</span></div>' +
        '<div class="summary-pill"><strong>' + failedTasks + '</strong><span>failed</span></div>' +
        '<div class="summary-pill"><span class="status-dot ' + escapeHtml(service?.active === 'active' ? 'active' : 'inactive') + '"></span><span>' + escapeHtml(service?.active || 'unknown') + '</span></div>';
    }

    function renderSelectedRunner() {
      const runner = latestRunners.find((item) => item.runnerId === selectedRunnerId);
      if (!runner) return;
      const stateClass = runnerStateClass(runner);
      detailRunnerTitleEl.textContent = runner.runnerId;
      detailRunnerMetaEl.innerHTML = '<span>' + escapeHtml(runner.hostname || 'unknown host') + '</span><span>PID ' + escapeHtml(runner.pid || 'n/a') + '</span><span>' + escapeHtml(runner.nexusBaseUrl || '') + '</span>';
      detailControlsEl.innerHTML = '';
      detailActivityEl.innerHTML = renderActivity(runner);
      detailUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
      serviceStateEl.innerHTML = renderBadge(latestService?.active || 'unknown', latestService?.active === 'active' ? 'active' : 'inactive');
      runnerMetricsEl.innerHTML =
        '<section class="control-summary">' +
          '<div class="control-summary-main">' +
            '<span class="status-dot ' + stateClass + '"></span>' +
            '<div><strong>' + escapeHtml(runner.status || 'unknown') + '</strong><span>Seen ' + escapeHtml(relativeTime(runner.lastSeenAt)) + '</span></div>' +
          '</div>' +
          renderBadge(runner.paused ? 'Paused' : runner.active ? 'Active' : 'Inactive', stateClass) +
        '</section>' +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Service Actions</span></div>' +
          '<div class="control-actions">' +
            '<button data-service-action="start">Start</button>' +
            '<button class="warn" data-service-action="restart">Restart</button>' +
            '<button class="danger" data-service-action="stop">Stop</button>' +
          '</div>' +
        '</section>' +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Runner Actions</span></div>' +
          '<div class="control-actions">' +
            '<button data-runner-action="' + (runner.paused ? 'resume' : 'pause') + '" data-runner-id="' + escapeHtml(runner.runnerId) + '">' + (runner.paused ? 'Resume' : 'Pause') + '</button>' +
            '<button class="warn" data-runner-action="restart" data-runner-id="' + escapeHtml(runner.runnerId) + '">Restart</button>' +
            '<button class="ghost" data-open-create>New run</button>' +
          '</div>' +
        '</section>' +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Timing</span></div>' +
          '<div class="metric-list">' +
            renderMetricRow('Mode', runner.executionMode || 'local') +
            renderMetricRow('Cloud ready', runner.codexCloudConfigured ? 'yes' : 'no') +
            renderMetricRow('Poll interval', runner.pollIntervalMs ? runner.pollIntervalMs + ' ms' : null) +
            renderMetricRow('Cancel check', runner.cancelCheckIntervalMs ? runner.cancelCheckIntervalMs + ' ms' : null) +
            renderMetricRow('Heartbeat', runner.heartbeatIntervalMs ? runner.heartbeatIntervalMs + ' ms' : null) +
            renderMetricRow('Runs processed', runner.jobsProcessed || '0') +
          '</div>' +
        '</section>' +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Paths</span></div>' +
          '<div class="path-stack">' +
            renderPathItem('Work root', runner.workRoot) +
            renderPathItem('Control file', runner.controlFile) +
          '</div>' +
        '</section>';
      historyEl.innerHTML = runnerHistory.length ? runnerHistory.map(renderHistoryTask).join('') : '<div class="empty">No run history for this runner yet.</div>';
      detailViewEl.classList.remove('hidden');
      landingViewEl.classList.add('hidden');
    }

    async function requestJson(url, options = {}) {
      const { headers, ...restOptions } = options;
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...restOptions,
        headers: {
          'content-type': 'application/json',
          ...(headers || {})
        }
      });
      if (response.status === 401) {
        window.location.href = '${escapeJsString(withBasePath('/login'))}';
        return null;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Request failed with ' + response.status);
      }
      return data;
    }

    async function refresh() {
      const params = new URLSearchParams();
      params.set('limit', '50');
      try {
        const data = await requestJson(API.overview + '?' + params.toString());
        if (!data) return;
        latestRunners = data.runners || [];
        latestTasks = data.tasks || [];
        latestService = data.service || {};
        renderSummary(latestRunners, latestTasks, latestService);
        generatedEl.textContent = 'Updated ' + new Date(data.generatedAt).toLocaleString();
        runnersEl.innerHTML = latestRunners.length ? latestRunners.map(renderRunner).join('') : '<div class="empty">No runner heartbeat files found yet.</div>';
        if (selectedRunnerId) {
          await loadRunnerHistory(selectedRunnerId, false);
          renderSelectedRunner();
        }
      } catch (error) {
        generatedEl.textContent = 'Unable to refresh';
        runnersEl.innerHTML = '<div class="error">' + escapeHtml(error.message || error) + '</div>';
      }
    }

    async function loadRunnerHistory(runnerId, render = true) {
      const params = new URLSearchParams();
      params.set('runnerId', runnerId);
      params.set('limit', '200');
      if (detailStatusFilterEl.value) params.set('status', detailStatusFilterEl.value);
      const data = await requestJson(API.tasks + '?' + params.toString());
      if (!data) return;
      runnerHistory = data.tasks || [];
      if (render) renderSelectedRunner();
    }

    async function openRunner(runnerId) {
      selectedRunnerId = runnerId;
      window.location.hash = 'runner=' + encodeURIComponent(runnerId);
      logsEl.textContent = 'Select Refresh to load runner service logs.';
      logStatusEl.textContent = 'Logs load on demand.';
      await loadRunnerHistory(runnerId, false);
      renderSelectedRunner();
    }

    function closeRunner() {
      selectedRunnerId = null;
      runnerHistory = [];
      window.location.hash = '';
      detailViewEl.classList.add('hidden');
      landingViewEl.classList.remove('hidden');
    }

    async function refreshLogs(runnerId = null) {
      const runner = runnerId || selectedRunnerId || latestRunners[0]?.runnerId || 'runner';
      logStatusEl.textContent = 'Loading logs...';
      const data = await requestJson('${escapeJsString(withBasePath('/api/runners'))}/' + encodeURIComponent(runner) + '/logs?lines=240');
      if (!data) return;
      logsEl.textContent = data.logs || 'No log lines returned.';
      logStatusEl.textContent = 'Loaded ' + new Date(data.generatedAt).toLocaleString();
    }

    async function showTaskDetail(jobId) {
      detailTitleEl.textContent = 'Task ' + jobId;
      detailBodyEl.innerHTML = '<div class="empty">Loading task...</div>';
      detailModalEl.hidden = false;
      const data = await requestJson(API.tasks + '/' + encodeURIComponent(jobId));
      if (!data) return;
      const task = data.job;
      detailBodyEl.innerHTML =
        '<div class="grid">' +
          renderField('Status', task.status) +
          renderField('Repository', task.targetRepository, true) +
          renderField('Branch', task.branchName, true) +
          renderField('Runner', task.runnerId, true) +
        '</div>' +
        (task.prUrl ? '<div><a href="' + escapeHtml(task.prUrl) + '" target="_blank" rel="noreferrer">Open pull request</a></div>' : '') +
        '<section class="job"><h3>Status</h3><pre>' + escapeHtml(task.statusMessage || 'No status message') + '</pre></section>' +
        (task.error ? '<section class="error"><h3>Error</h3><pre>' + escapeHtml(task.error) + '</pre></section>' : '') +
        '<section class="job"><h3>Prompt</h3><pre>' + escapeHtml(task.prompt || '') + '</pre></section>' +
        '<section class="job"><h3>Output</h3><pre>' + escapeHtml(task.output || 'No runner output captured yet.') + '</pre></section>';
    }

    document.getElementById('task-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form).entries());
      if (!body.prompt || String(body.prompt).trim().length < 10) {
        createStatusEl.textContent = 'Add a more specific prompt.';
        return;
      }
      if (!window.confirm('Create this Codex runner task?')) return;
      createStatusEl.textContent = 'Creating task...';
      try {
        await requestJson(API.tasks, { method: 'POST', body: JSON.stringify(body) });
        form.elements.prompt.value = '';
        createStatusEl.textContent = 'Task queued.';
        createModalEl.hidden = true;
        await refresh();
      } catch (error) {
        createStatusEl.textContent = error.message || String(error);
      }
    });

    document.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      try {
        if (button.hasAttribute('data-refresh')) {
          await refresh();
        } else if (button.hasAttribute('data-open-create')) {
          createStatusEl.textContent = '';
          createModalEl.hidden = false;
        } else if (button.hasAttribute('data-create-close')) {
          createModalEl.hidden = true;
        } else if (button.hasAttribute('data-back-to-runners')) {
          closeRunner();
        } else if (button.hasAttribute('data-refresh-history')) {
          if (selectedRunnerId) await loadRunnerHistory(selectedRunnerId);
        } else if (button.hasAttribute('data-log-refresh')) {
          await refreshLogs();
        } else if (button.hasAttribute('data-modal-close')) {
          detailModalEl.hidden = true;
        } else if (button.dataset.runnerOpen) {
          await openRunner(button.dataset.runnerOpen);
        } else if (button.dataset.serviceAction) {
          const action = button.dataset.serviceAction;
          if (!window.confirm(action + ' the runner service?')) return;
          const runnerId = selectedRunnerId || latestRunners[0]?.runnerId || 'vps-codex-runner';
          await requestJson('${escapeJsString(withBasePath('/api/runners'))}/' + encodeURIComponent(runnerId) + '/control', {
            method: 'POST',
            body: JSON.stringify({ action })
          });
          await refresh();
        } else if (button.dataset.runnerAction) {
          const action = button.dataset.runnerAction;
          const runnerId = button.dataset.runnerId;
          if (['restart', 'stop'].includes(action) && !window.confirm(action + ' ' + runnerId + '?')) return;
          await requestJson('${escapeJsString(withBasePath('/api/runners'))}/' + encodeURIComponent(runnerId) + '/control', {
            method: 'POST',
            body: JSON.stringify({ action })
          });
          await refresh();
        } else if (button.dataset.taskDetail) {
          await showTaskDetail(button.dataset.taskDetail);
        } else if (button.dataset.taskCancel) {
          if (!window.confirm('Cancel this Codex task?')) return;
          await requestJson(API.tasks + '/' + encodeURIComponent(button.dataset.taskCancel) + '/cancel', {
            method: 'POST',
            body: JSON.stringify({ reason: 'Canceled from dashboard.' })
          });
          await refresh();
        } else if (button.dataset.taskRetry) {
          if (!window.confirm('Retry this Codex task as a fresh queued job?')) return;
          await requestJson(API.tasks + '/' + encodeURIComponent(button.dataset.taskRetry) + '/retry', {
            method: 'POST',
            body: JSON.stringify({})
          });
          await refresh();
        }
      } catch (error) {
        window.alert(error.message || String(error));
      }
    });

    createModalEl.addEventListener('click', (event) => {
      if (event.target === createModalEl) createModalEl.hidden = true;
    });
    detailModalEl.addEventListener('click', (event) => {
      if (event.target === detailModalEl) detailModalEl.hidden = true;
    });
    detailStatusFilterEl.addEventListener('change', () => {
      if (selectedRunnerId) loadRunnerHistory(selectedRunnerId);
    });

    refresh().then(() => {
      const hashMatch = window.location.hash.match(/^#runner=(.+)$/);
      if (hashMatch) openRunner(decodeURIComponent(hashMatch[1]));
    });
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
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07111d; color: #e5edf8; font: 15px/1.45 system-ui, sans-serif; }
    main { width: min(520px, calc(100vw - 32px)); border: 1px solid rgba(148, 163, 184, .25); border-radius: 8px; background: #101927; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { color: #94a3b8; }
    a { color: #6aa8ff; }
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

function serializeSessionUser(session) {
  return {
    email: session.email,
    name: session.name,
    picture: session.picture
  };
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
    `Path=${config.cookiePath}`,
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
    `${name}=; Path=${config.cookiePath}; SameSite=Lax; HttpOnly; Max-Age=0${
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

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 300_000) {
      throw new HttpError(413, 'Request body is too large.');
    }
  }
  if (!body.trim()) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
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

function requireMethod(request, method) {
  if (request.method !== method) {
    throw new HttpError(405, 'Method not allowed.');
  }
}

function isApiRequest(request) {
  try {
    const url = new URL(request.url || '/', config.baseUrl);
    return stripBasePath(url.pathname).startsWith('/api/');
  } catch {
    return false;
  }
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
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
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
  const matchedBasePath = getMatchedBasePath(pathname);
  if (!matchedBasePath) {
    return pathname || '/';
  }
  if (pathname === matchedBasePath) {
    return '/';
  }
  return pathname.slice(matchedBasePath.length) || '/';
}

function getMatchedBasePath(pathname) {
  const paths = [config.basePath, ...config.basePathAliases].filter(Boolean);
  const sortedPaths = paths.sort((left, right) => right.length - left.length);
  for (const path of sortedPaths) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return path;
    }
  }
  return config.basePath ? null : '';
}

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function normalizeCookiePath(value) {
  const normalized = normalizeBasePath(value);
  return normalized || '/';
}

function parsePathList(value) {
  return (value || '')
    .split(',')
    .map((entry) => normalizeBasePath(entry))
    .filter(Boolean);
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

function sanitizeFileName(value) {
  return String(value)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'runner';
}

function runExecFile(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        maxBuffer: options.maxBuffer || 1_000_000,
        timeout: options.timeoutMs || 30_000
      },
      (error, stdout, stderr) => {
        if (error && !options.allowNonZero) {
          reject(error);
          return;
        }
        resolvePromise({ stdout, stderr, code: error?.code ?? 0 });
      }
    );
    child.stdin?.end();
  });
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}
