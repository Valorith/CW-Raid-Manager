#!/usr/bin/env node
import { execFile } from 'child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { createServer } from 'http';
import {
  cpus,
  freemem,
  hostname,
  loadavg,
  networkInterfaces,
  platform,
  release,
  totalmem,
  uptime
} from 'os';
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
  runnerTemplateServiceName:
    process.env.CODEX_RUNNER_TEMPLATE_SERVICE_NAME ||
    process.env.CODEX_RUNNER_POOL_TEMPLATE_SERVICE ||
    'nexus-codex-runner@.service',
  runnerPoolServiceName:
    process.env.CODEX_RUNNER_POOL_MANAGER_SERVICE_NAME ||
    process.env.CODEX_RUNNER_POOL_SERVICE_NAME ||
    'nexus-codex-runner-pool-manager.service',
  runnerPoolPrefix: process.env.CODEX_RUNNER_POOL_PREFIX || 'vps-codex-runner-pool',
  runnerPoolStateFile: resolve(
    process.env.CODEX_RUNNER_POOL_STATE_FILE || join(workRoot, 'runner-pool.json')
  ),
  dashboardServiceName:
    process.env.CODEX_RUNNER_DASHBOARD_SERVICE_NAME || 'nexus-codex-runner-dashboard.service',
  codexBin: process.env.CODEX_BIN || process.env.CODEX_CLI_BIN || join(process.cwd(), 'node_modules/.bin/codex'),
  codexHome: resolve(process.env.CODEX_HOME || join(process.env.HOME || '/home/ubuntu', '.codex')),
  githubCliBin: process.env.GITHUB_CLI_BIN || process.env.GH_BIN || 'gh',
  githubHost: process.env.GITHUB_HOST || 'github.com',
  workRoot,
  registryDir,
  controlDir,
  metricsHistoryFile: resolve(
    process.env.CODEX_RUNNER_METRICS_HISTORY_FILE || join(workRoot, 'dashboard-metrics.jsonl')
  ),
  metricsSnapshotIntervalMs: parsePositiveInt(
    process.env.CODEX_RUNNER_METRICS_SNAPSHOT_INTERVAL_MS,
    300_000
  ),
  metricsSnapshotMinIntervalMs: parsePositiveInt(
    process.env.CODEX_RUNNER_METRICS_SNAPSHOT_MIN_INTERVAL_MS,
    60_000
  ),
  staleAfterMs: parsePositiveInt(process.env.DASHBOARD_STALE_AFTER_MS, 45_000),
  sessionTtlSeconds: parsePositiveInt(process.env.DASHBOARD_SESSION_TTL_SECONDS, 86_400),
  logLines: parsePositiveInt(process.env.DASHBOARD_LOG_LINES, 240)
};

if (config.allowedEmails.length === 0 && config.allowedDomains.length === 0) {
  throw new Error('DASHBOARD_ALLOWED_EMAILS or DASHBOARD_ALLOWED_DOMAINS is required.');
}

const redirectUri = `${config.baseUrl}${config.oauthBasePath}/auth/google/callback`;

await mkdir(config.workRoot, { recursive: true });
await mkdir(config.registryDir, { recursive: true });
await mkdir(config.controlDir, { recursive: true });

recordMetricsSnapshot().catch((error) => {
  console.error('Initial metrics snapshot failed:', error instanceof Error ? error.message : error);
});
setInterval(() => {
  recordMetricsSnapshot().catch((error) => {
    console.error('Scheduled metrics snapshot failed:', error instanceof Error ? error.message : error);
  });
}, config.metricsSnapshotIntervalMs).unref();

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

  if (path === '/api/preflight') {
    requireMethod(request, 'GET');
    await sendPreflight(response);
    return;
  }

  if (path === '/api/vps-health') {
    requireMethod(request, 'GET');
    await sendVpsHealth(response);
    return;
  }

  if (path === '/api/metrics') {
    requireMethod(request, 'GET');
    await sendMetrics(response, url);
    return;
  }

  if (path === '/api/runners') {
    requireMethod(request, 'GET');
    const runners = await listRunners();
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      staleAfterMs: config.staleAfterMs,
      service: await getRunnerServiceStatus(),
      poolService: await getRunnerPoolServiceStatus(),
      pool: await readRunnerPoolState(),
      user: serializeSessionUser(session),
      runners
    });
    return;
  }

  if (path === '/api/pool/control') {
    requireMethod(request, 'POST');
    await handleRunnerPoolControl(response, await readJsonBody(request));
    return;
  }

  if (path === '/api/pool/self-test') {
    requireMethod(request, 'POST');
    await sendRunnerPoolSelfTest(response);
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
    const runnerId = decodeURIComponent(runnerLogsMatch[1]);
    const lines = parsePositiveInt(url.searchParams.get('lines') || '', config.logLines);
    const serviceName = await getServiceNameForRunner(runnerId);
    const logs = await readRunnerLogs(Math.min(lines, 1_000), serviceName);
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      runnerId,
      serviceName,
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

  if (path === '/api/tasks/smoke-test') {
    requireMethod(request, 'POST');
    await sendSmokeTestCreate(response, await readJsonBody(request));
    return;
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
  const [runners, tasks, service, poolService, pool, github] = await Promise.all([
    listRunners(),
    listTasks(url.searchParams),
    getRunnerServiceStatus(),
    getRunnerPoolServiceStatus(),
    readRunnerPoolState(),
    getGitHubCliStatus()
  ]);

  sendJson(response, 200, {
    generatedAt: new Date().toISOString(),
    staleAfterMs: config.staleAfterMs,
    service,
    poolService,
    pool,
    defaults: {
      repository: config.defaultRepository,
      baseBranch: config.defaultBaseBranch
    },
    runners,
    tasks,
    integrations: {
      github
    }
  });
}

async function sendVpsHealth(response) {
  sendJson(response, 200, await collectVpsHealth());
}

async function sendMetrics(response, url) {
  const days = clampDashboardNumber(Number(url.searchParams.get('days') || 30), 1, 180, 30);
  const bucketHours = clampDashboardNumber(
    Number(url.searchParams.get('bucketHours') || chooseDashboardBucketHours(days)),
    1,
    168,
    chooseDashboardBucketHours(days)
  );
  const params = new URLSearchParams({
    days: String(days),
    bucketHours: String(bucketHours)
  });
  if (url.searchParams.get('runnerId')) {
    params.set('runnerId', url.searchParams.get('runnerId'));
  }
  if (url.searchParams.get('repository')) {
    params.set('repository', url.searchParams.get('repository'));
  }

  await recordMetricsSnapshotIfDue();
  const [jobs, history] = await Promise.all([
    nexusGet(`/metrics?${params.toString()}`),
    readMetricsHistory(days)
  ]);

  sendJson(response, 200, {
    generatedAt: new Date().toISOString(),
    jobs,
    dashboard: {
      historyFile: config.metricsHistoryFile,
      snapshotIntervalMs: config.metricsSnapshotIntervalMs,
      history,
      latest: history[history.length - 1] || null
    }
  });
}

async function sendPreflight(response) {
  sendJson(response, 200, await collectPreflight());
}

async function recordMetricsSnapshotIfDue() {
  const stats = await stat(config.metricsHistoryFile).catch(() => null);
  if (stats && Date.now() - stats.mtimeMs < config.metricsSnapshotMinIntervalMs) {
    return null;
  }
  return recordMetricsSnapshot();
}

async function recordMetricsSnapshot() {
  const snapshot = await collectMetricsSnapshot();
  await appendFile(config.metricsHistoryFile, `${JSON.stringify(snapshot)}\n`, 'utf8');
  return snapshot;
}

async function collectMetricsSnapshot() {
  const capturedAt = new Date().toISOString();
  const [runners, pool, service, poolService, health] = await Promise.all([
    listRunners(),
    readRunnerPoolState(),
    getRunnerServiceStatus(),
    getRunnerPoolServiceStatus(),
    collectVpsHealth()
  ]);
  const activeRunners = runners.filter((runner) => runner.active && !runner.paused).length;
  const pausedRunners = runners.filter((runner) => runner.paused).length;
  const busyRunners = runners.filter((runner) => runner.currentJob).length;
  const staleRunners = runners.filter((runner) => !runner.active).length;
  const primaryDisk =
    Array.isArray(health.disks) && health.disks.length
      ? health.disks.find((disk) => disk.path === '/') || health.disks[0]
      : null;
  const networkTotals = summarizeNetworkTotals(health.network?.interfaces || []);
  const probes = Array.isArray(health.probes) ? health.probes : [];
  const successfulProbes = probes.filter((probe) => probe.ok).length;

  return {
    capturedAt,
    runners: {
      total: runners.length,
      active: activeRunners,
      paused: pausedRunners,
      busy: busyRunners,
      stale: staleRunners,
      jobsProcessed: runners.reduce((sum, runner) => sum + (Number(runner.jobsProcessed) || 0), 0)
    },
    pool: {
      target: numberOrNull(pool?.pool?.target),
      active: numberOrNull(pool?.pool?.active),
      busy: numberOrNull(pool?.pool?.busy),
      queued: numberOrNull(pool?.queue?.queued),
      max: numberOrNull(pool?.config?.maxRunners)
    },
    services: {
      runner: service?.active || 'unknown',
      poolManager: poolService?.active || 'unknown',
      dashboard: health.services?.dashboard?.active || 'unknown'
    },
    vps: {
      cpuLoadPercent1m: numberOrNull(health.cpu?.loadPercent1m),
      memoryUsedPercent: numberOrNull(health.memory?.usedPercent),
      swapUsedPercent: numberOrNull(health.swap?.usedPercent),
      rootDiskUsedPercent: numberOrNull(primaryDisk?.usedPercent),
      diskAvailableBytes: numberOrNull(primaryDisk?.available),
      rxBytes: networkTotals.rxBytes,
      txBytes: networkTotals.txBytes,
      networkErrors: networkTotals.errors,
      probeOk: probes.length > 0 ? successfulProbes / probes.length : null,
      uptimeSeconds: numberOrNull(health.host?.uptimeSeconds)
    }
  };
}

async function readMetricsHistory(days) {
  const raw = await readTextIfExists(config.metricsHistoryFile);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const row = JSON.parse(trimmed);
      const capturedAt = Date.parse(row.capturedAt || '');
      if (!Number.isFinite(capturedAt) || capturedAt < cutoff) {
        continue;
      }
      rows.push(row);
    } catch {
      // Ignore partial or corrupt JSONL rows; the next snapshot will be valid.
    }
  }
  return rows.slice(-2_000);
}

function summarizeNetworkTotals(interfaces) {
  return interfaces
    .filter((item) => item?.name !== 'lo')
    .reduce(
      (summary, item) => {
        summary.rxBytes += Number(item?.stats?.rxBytes) || 0;
        summary.txBytes += Number(item?.stats?.txBytes) || 0;
        summary.errors +=
          (Number(item?.stats?.rxErrors) || 0) +
          (Number(item?.stats?.txErrors) || 0) +
          (Number(item?.stats?.rxDropped) || 0) +
          (Number(item?.stats?.txDropped) || 0);
        return summary;
      },
      { rxBytes: 0, txBytes: 0, errors: 0 }
    );
}

function clampDashboardNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function chooseDashboardBucketHours(days) {
  if (days <= 2) {
    return 1;
  }
  if (days <= 14) {
    return 6;
  }
  return 24;
}

async function collectPreflight() {
  const checkedAt = new Date().toISOString();
  const [
    runnersResult,
    serviceResult,
    poolServiceResult,
    poolResult,
    githubResult,
    codexResult,
    nexusResult,
    disksResult
  ] = await Promise.allSettled([
    listRunners(),
    getRunnerServiceStatus(),
    getRunnerPoolServiceStatus(),
    readRunnerPoolState(),
    getGitHubCliStatus(),
    getCodexCliStatus(),
    checkNexusQueueApi(),
    readDiskSummary(false)
  ]);

  const runners = settledValue(runnersResult, []);
  const service = settledValue(serviceResult, null);
  const poolService = settledValue(poolServiceResult, null);
  const pool = settledValue(poolResult, null);
  const github = settledValue(githubResult, null);
  const codex = settledValue(codexResult, null);
  const nexus = settledValue(nexusResult, null);
  const disks = settledValue(disksResult, []);
  const memoryTotal = totalmem();
  const memoryUsed = Math.max(0, memoryTotal - freemem());
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : null;
  const primaryDisk = Array.isArray(disks)
    ? disks.find((disk) => disk.path === '/') || disks[0] || null
    : null;
  const activeRunners = Array.isArray(runners) ? runners.filter((runner) => runner.active).length : 0;
  const cloudReady = Array.isArray(runners)
    ? runners.some((runner) => runner.codexCloudConfigured)
    : false;
  const poolOk = pool ? pool.ok !== false : false;
  const diskPercent = Number(primaryDisk?.usedPercent);

  const checks = [
    preflightCheck(
      'nexus-api',
      'Nexus queue API',
      nexus?.ok ? 'ok' : 'fail',
      nexus?.detail || 'Could not list runner jobs with the configured runner token.'
    ),
    preflightCheck(
      'codex-cli',
      'Codex CLI',
      codex?.available ? 'ok' : 'fail',
      codex?.statusText || 'Codex CLI could not be executed.',
      {
        version: codex?.version || null,
        cli: codex?.cli || config.codexBin
      }
    ),
    preflightCheck(
      'codex-home',
      'Codex auth home',
      codex?.homeExists ? 'ok' : 'fail',
      codex?.homeExists
        ? `${config.codexHome} exists.`
        : `${config.codexHome} was not found; Codex may need authentication.`
    ),
    preflightCheck(
      'github-cli',
      'GitHub CLI',
      github?.authenticated ? 'ok' : 'fail',
      github?.statusText || 'GitHub CLI auth status is unavailable.',
      {
        login: github?.login || null,
        cli: github?.cli || config.githubCliBin
      }
    ),
    preflightCheck(
      'runner-service',
      'Runner service',
      service?.active === 'active' ? 'ok' : 'fail',
      `${service?.name || config.runnerServiceName}: ${service?.active || 'unknown'}`
    ),
    preflightCheck(
      'pool-service',
      'Pool manager',
      poolService?.active === 'active' ? 'ok' : 'warn',
      `${poolService?.name || config.runnerPoolServiceName}: ${poolService?.active || 'unknown'}`
    ),
    preflightCheck(
      'pool-state',
      'Pool state',
      poolOk ? 'ok' : 'warn',
      pool
        ? `${pool?.pool?.target ?? 0}/${pool?.config?.maxRunners ?? 0} target workers, ${pool?.queue?.queued ?? 0} queued.`
        : 'Pool state file has not been written yet.'
    ),
    preflightCheck(
      'runner-heartbeat',
      'Runner heartbeat',
      activeRunners > 0 ? 'ok' : 'warn',
      `${activeRunners} active runner${activeRunners === 1 ? '' : 's'} reporting.`
    ),
    preflightCheck(
      'codex-cloud',
      'Codex Cloud mode',
      cloudReady ? 'ok' : 'warn',
      cloudReady
        ? 'At least one runner reports Codex Cloud configuration.'
        : 'No runner heartbeat currently reports Codex Cloud configuration.'
    ),
    preflightCheck(
      'disk',
      'Disk capacity',
      Number.isFinite(diskPercent) ? percentToPreflightStatus(diskPercent, 90, 75) : 'warn',
      primaryDisk
        ? `${formatServerPercent(primaryDisk.usedPercent)} used on ${primaryDisk.path}; ${formatServerBytes(primaryDisk.available)} available.`
        : 'Disk usage could not be read.'
    ),
    preflightCheck(
      'memory',
      'Memory headroom',
      Number.isFinite(memoryPercent) ? percentToPreflightStatus(memoryPercent, 92, 80) : 'warn',
      `${formatServerPercent(memoryPercent)} used; ${formatServerBytes(memoryTotal - memoryUsed)} available.`
    )
  ];

  return {
    generatedAt: checkedAt,
    ok: checks.every((check) => check.status === 'ok'),
    checks,
    defaults: {
      repository: config.defaultRepository,
      baseBranch: config.defaultBaseBranch
    },
    smokeTest: {
      title: 'Nexus runner smoke test',
      repository: config.defaultRepository,
      baseBranch: config.defaultBaseBranch,
      createsPullRequest: true
    },
    runnerSummary: {
      total: Array.isArray(runners) ? runners.length : 0,
      active: activeRunners,
      cloudReady
    },
    poolSummary: {
      target: pool?.pool?.target ?? 0,
      active: pool?.pool?.active ?? 0,
      max: pool?.config?.maxRunners ?? 0,
      queued: pool?.queue?.queued ?? 0
    }
  };
}

async function getCodexCliStatus() {
  const checkedAt = new Date().toISOString();
  const pathLooksExplicit = config.codexBin.includes('/') || config.codexBin.startsWith('.');
  try {
    const version = await runExecFile(config.codexBin, ['--version'], {
      allowNonZero: true,
      maxBuffer: 100_000,
      timeoutMs: 8_000
    });
    const text = `${version.stdout}\n${version.stderr}`.trim();
    const available = version.code === 0 && Boolean(text);
    return {
      cli: config.codexBin,
      available,
      version: available ? text.split(/\r?\n/)[0] : null,
      home: config.codexHome,
      homeExists: existsSync(config.codexHome),
      checkedAt,
      statusText: available
        ? text.split(/\r?\n/)[0]
        : text || `Codex CLI exited with ${version.code || 'an error'}.`,
      pathExists: pathLooksExplicit ? existsSync(config.codexBin) : null
    };
  } catch (error) {
    return {
      cli: config.codexBin,
      available: false,
      version: null,
      home: config.codexHome,
      homeExists: existsSync(config.codexHome),
      checkedAt,
      statusText: error instanceof Error ? error.message : String(error),
      pathExists: pathLooksExplicit ? existsSync(config.codexBin) : null
    };
  }
}

async function checkNexusQueueApi() {
  const startedAt = Date.now();
  try {
    const response = await nexusGet('/jobs?limit=1');
    const ok = Array.isArray(response.jobs);
    return {
      ok,
      durationMs: Date.now() - startedAt,
      detail: ok
        ? `Authenticated job list succeeded in ${Date.now() - startedAt} ms.`
        : 'Nexus response did not include a jobs array.'
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function sendSmokeTestCreate(response, body) {
  const timestamp = new Date().toISOString();
  const targetRepository =
    typeof body.targetRepository === 'string' && body.targetRepository.trim()
      ? body.targetRepository.trim()
      : config.defaultRepository;
  const baseBranch =
    typeof body.baseBranch === 'string' && body.baseBranch.trim()
      ? body.baseBranch.trim()
      : config.defaultBaseBranch;
  const title = `Nexus runner smoke test ${timestamp}`;
  const prompt = [
    'This is a safe Nexus runner smoke test for the VPS Codex and GitHub handoff.',
    '',
    'Make exactly one harmless repository change:',
    '- Create or update `.nexus/runner-smoke-test.md`.',
    `- Include this timestamp: ${timestamp}.`,
    '- State that the file was generated by the Nexus runner smoke test.',
    '',
    'Do not change application logic, configuration, secrets, database migrations, generated files, or dependencies.',
    'Run only lightweight validation that is safe for this repository, such as checking git status and any clearly cheap formatting/type checks you can justify.',
    'Leave the final file change in the working tree. The VPS runner will commit, push the runner branch, and open the pull request.'
  ].join('\n');

  sendJson(
    response,
    200,
    await nexusPost('/jobs', {
      title,
      targetRepository,
      baseBranch,
      prompt
    })
  );
}

async function sendRunnerPoolSelfTest(response) {
  const runnerId = `${config.runnerPoolPrefix}-self-test`;
  const unit = instantiateTemplateService(config.runnerTemplateServiceName, runnerId);
  const [templateResult, instanceResult, sudoResult, poolState, poolService] =
    await Promise.all([
      runExecFile('systemctl', ['cat', config.runnerTemplateServiceName], {
        allowNonZero: true,
        maxBuffer: 500_000,
        timeoutMs: 10_000
      }),
      runExecFile('systemctl', ['show', unit, '--property=LoadState,UnitFileState,FragmentPath,SubState'], {
        allowNonZero: true,
        maxBuffer: 200_000,
        timeoutMs: 10_000
      }),
      runExecFile('sudo', ['-n', 'true'], {
        allowNonZero: true,
        maxBuffer: 20_000,
        timeoutMs: 8_000
      }),
      readRunnerPoolState(),
      getRunnerPoolServiceStatus()
    ]);

  const instanceOutput = instanceResult.stdout || instanceResult.stderr || '';
  const templateLoaded = templateResult.code === 0;
  const instanceLoadState = instanceOutput.match(/^LoadState=(.+)$/m)?.[1] || 'unknown';
  const sudoReady = sudoResult.code === 0;
  const checks = [
    preflightCheck(
      'template',
      'Template unit',
      templateLoaded ? 'ok' : 'fail',
      templateLoaded
        ? `${config.runnerTemplateServiceName} is readable by systemd.`
        : (templateResult.stderr || templateResult.stdout || 'Template unit could not be read.').trim()
    ),
    preflightCheck(
      'instance',
      'Instance render',
      instanceLoadState === 'loaded' ? 'ok' : 'fail',
      `${unit}: LoadState=${instanceLoadState}`
    ),
    preflightCheck(
      'sudo',
      'Control permission',
      sudoReady ? 'ok' : 'fail',
      sudoReady ? 'Passwordless sudo is available for dashboard controls.' : 'sudo -n true failed.'
    ),
    preflightCheck(
      'pool-manager',
      'Pool manager',
      poolService?.active === 'active' ? 'ok' : 'warn',
      `${poolService?.name || config.runnerPoolServiceName}: ${poolService?.active || 'unknown'}`
    ),
    preflightCheck(
      'pool-state',
      'Pool state file',
      poolState ? (poolState.ok === false ? 'warn' : 'ok') : 'warn',
      poolState
        ? `${poolState?.pool?.target ?? 0}/${poolState?.config?.maxRunners ?? 0} desired workers.`
        : 'No pool state file exists yet.'
    )
  ];
  const launch = await runPausedRunnerLaunchSelfTest(runnerId, unit);
  checks.push(
    preflightCheck(
      'launch-start',
      'Paused launch',
      launch.startOk ? 'ok' : 'fail',
      launch.startOk
        ? `${unit} accepted a start request.`
        : launch.startOutput || 'The runner instance could not be started.'
    ),
    preflightCheck(
      'launch-heartbeat',
      'Launch heartbeat',
      launch.heartbeatOk ? 'ok' : 'fail',
      launch.heartbeatOk
        ? `${runnerId} reported ${launch.heartbeat?.status || 'unknown'} without claiming a job.`
        : launch.heartbeatError || 'The launched runner did not write a paused heartbeat.'
    ),
    preflightCheck(
      'launch-stop',
      'Launch cleanup',
      launch.stopOk ? 'ok' : 'warn',
      launch.stopOk
        ? `${unit} was stopped after the self-test.`
        : launch.stopOutput || 'The runner instance did not stop cleanly after the self-test.'
    )
  );

  sendJson(response, 200, {
    generatedAt: new Date().toISOString(),
    ok: checks.every((check) => check.status === 'ok'),
    dryRun: false,
    safeLaunch: true,
    runnerId,
    unit,
    checks,
    launch,
    systemd: {
      templateOutput: truncateOutput(templateResult.stdout || templateResult.stderr || ''),
      instanceOutput: truncateOutput(instanceOutput)
    }
  });
}

async function runPausedRunnerLaunchSelfTest(runnerId, unit) {
  const controlFile = join(config.controlDir, `${sanitizeFileName(runnerId)}.json`);
  const heartbeatFile = join(config.registryDir, `${sanitizeFileName(runnerId)}.json`);
  const control = {
    paused: true,
    reason: 'Safe Nexus runner pool launch self-test; do not claim jobs.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'dashboard-self-test'
  };
  const result = {
    runnerId,
    unit,
    controlFile,
    heartbeatFile,
    startedAt: new Date().toISOString(),
    startOk: false,
    startOutput: null,
    heartbeatOk: false,
    heartbeatError: null,
    heartbeat: null,
    activeAfterStart: null,
    stopOk: false,
    stopOutput: null,
    activeAfterStop: null,
    finishedAt: null
  };

  await mkdir(config.controlDir, { recursive: true });
  await mkdir(config.registryDir, { recursive: true });
  await runExecFile('sudo', ['-n', 'systemctl', 'stop', unit], {
    allowNonZero: true,
    timeoutMs: 45_000
  });
  await rm(heartbeatFile, { force: true });
  await writeFile(controlFile, `${JSON.stringify(control, null, 2)}\n`, 'utf8');

  try {
    try {
      const start = await runExecFile('sudo', ['-n', 'systemctl', 'start', unit], {
        allowNonZero: true,
        timeoutMs: 45_000
      });
      result.startOk = start.code === 0;
      result.startOutput = truncateOutput(start.stdout || start.stderr || '');
    } catch (error) {
      result.startOutput = error instanceof Error ? error.message : String(error);
    }

    if (result.startOk) {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const heartbeat = parseJsonObject(await readTextIfExists(heartbeatFile));
        if (heartbeat) {
          result.heartbeat = {
            runnerId: stringOrNull(heartbeat.runnerId),
            status: stringOrNull(heartbeat.status),
            pid: numberOrNull(heartbeat.pid),
            currentJob: heartbeat.currentJob || null,
            paused: heartbeat.control?.paused === true,
            executionMode: stringOrNull(heartbeat.executionMode),
            codexCloudConfigured: heartbeat.codexCloudConfigured === true,
            lastSeenAt: stringOrNull(heartbeat.lastSeenAt)
          };
          result.heartbeatOk =
            result.heartbeat.runnerId === runnerId &&
            result.heartbeat.status === 'paused' &&
            result.heartbeat.paused &&
            !result.heartbeat.currentJob;
          if (result.heartbeatOk) {
            break;
          }
        }
        await sleep(500);
      }
    }

    if (!result.heartbeatOk && !result.heartbeatError) {
      result.heartbeatError = result.heartbeat
        ? `${result.heartbeat.runnerId || 'unknown runner'} reported ${result.heartbeat.status || 'unknown'} instead of ${runnerId} paused.`
        : 'No heartbeat file was written within 15 seconds.';
    }
    result.activeAfterStart = await getServiceStatus(unit);
  } finally {
    try {
      const stop = await runExecFile('sudo', ['-n', 'systemctl', 'stop', unit], {
        allowNonZero: true,
        timeoutMs: 45_000
      });
      result.stopOk = stop.code === 0;
      result.stopOutput = truncateOutput(stop.stdout || stop.stderr || '');
    } catch (error) {
      result.stopOutput = error instanceof Error ? error.message : String(error);
    }
    await rm(controlFile, { force: true });
    await sleep(1_000);
    result.activeAfterStop = await getServiceStatus(unit);
    await rm(heartbeatFile, { force: true });
    result.finishedAt = new Date().toISOString();
  }

  return result;
}

function preflightCheck(id, label, status, detail, meta = {}) {
  return {
    id,
    label,
    status,
    detail,
    ...meta
  };
}

function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function percentToPreflightStatus(percent, failAt, warnAt) {
  if (percent >= failAt) {
    return 'fail';
  }
  if (percent >= warnAt) {
    return 'warn';
  }
  return 'ok';
}

function formatServerBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  const precision = current >= 10 || index === 0 ? 0 : 1;
  return `${current.toFixed(precision)} ${units[index]}`;
}

function formatServerPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : 'unknown';
}

function truncateOutput(value, maxLength = 12_000) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n... truncated by dashboard ...`;
}

async function collectVpsHealth() {
  const cpuList = cpus();
  const memTotal = totalmem();
  const memFree = freemem();
  const memUsed = Math.max(0, memTotal - memFree);
  const [osRelease, swap, disks, inodes, network, defaultRoute, services, probes] =
    await Promise.all([
      readOsRelease(),
      readSwapSummary(),
      readDiskSummary(false),
      readDiskSummary(true),
      readNetworkSummary(),
      readDefaultRoute(),
      readHealthServices(),
      readConnectivityProbes()
    ]);

  return {
    generatedAt: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      kernel: release(),
      os: osRelease.prettyName,
      uptimeSeconds: uptime(),
      nodeVersion: process.version,
      pid: process.pid
    },
    cpu: {
      model: cpuList[0]?.model || 'unknown',
      cores: cpuList.length,
      loadAverage: loadavg(),
      loadPercent1m:
        cpuList.length > 0 ? Math.min(100, Math.max(0, (loadavg()[0] / cpuList.length) * 100)) : null
    },
    memory: {
      totalBytes: memTotal,
      freeBytes: memFree,
      usedBytes: memUsed,
      usedPercent: memTotal > 0 ? (memUsed / memTotal) * 100 : null
    },
    swap,
    disks,
    inodes,
    network: {
      defaultRoute,
      interfaces: network
    },
    services,
    probes,
    process: {
      uptimeSeconds: process.uptime(),
      memory: process.memoryUsage()
    },
    paths: {
      workRoot: config.workRoot,
      registryDir: config.registryDir,
      controlDir: config.controlDir
    }
  };
}

async function readOsRelease() {
  const raw = await readTextIfExists('/etc/os-release');
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/^"|"$/g, '');
    values[key] = value;
  }
  return {
    prettyName: values.PRETTY_NAME || `${platform()} ${release()}`
  };
}

async function readSwapSummary() {
  const meminfo = parseKeyValueBytes(await readTextIfExists('/proc/meminfo'));
  const total = meminfo.SwapTotal || 0;
  const free = meminfo.SwapFree || 0;
  const used = Math.max(0, total - free);
  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usedPercent: total > 0 ? (used / total) * 100 : 0
  };
}

async function readDiskSummary(inodeMode) {
  const paths = uniqueExistingPaths([
    '/',
    '/home',
    config.workRoot,
    config.registryDir
  ]);
  const rows = [];

  for (const targetPath of paths) {
    const result = await runExecFile('df', [inodeMode ? '-iP' : '-kP', targetPath], {
      allowNonZero: true,
      timeoutMs: 10_000
    });
    if (result.code !== 0 || !result.stdout.trim()) {
      rows.push({
        path: targetPath,
        ok: false,
        error: (result.stderr || result.stdout || 'df returned no output').trim()
      });
      continue;
    }
    const parsed = parseDfOutput(result.stdout, targetPath, inodeMode);
    if (parsed) {
      rows.push(parsed);
    }
  }

  return rows;
}

function uniqueExistingPaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths) {
    const value = resolve(item);
    if (seen.has(value) || !existsSync(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseDfOutput(output, targetPath, inodeMode) {
  const lines = output.trim().split(/\r?\n/);
  const line = lines[lines.length - 1];
  const parts = line.split(/\s+/);
  if (parts.length < 6) {
    return null;
  }
  const total = Number(parts[1]);
  const used = Number(parts[2]);
  const available = Number(parts[3]);
  const usedPercent = Number(String(parts[4]).replace('%', ''));
  return {
    path: targetPath,
    ok: true,
    filesystem: parts[0],
    mount: parts.slice(5).join(' '),
    total: inodeMode ? total : total * 1024,
    used: inodeMode ? used : used * 1024,
    available: inodeMode ? available : available * 1024,
    usedPercent: Number.isFinite(usedPercent) ? usedPercent : null,
    unit: inodeMode ? 'inodes' : 'bytes'
  };
}

async function readNetworkSummary() {
  const interfaces = networkInterfaces();
  const rows = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    const stats = await readNetworkInterfaceStats(name);
    rows.push({
      name,
      state: await readTrimmedSysFile(`/sys/class/net/${name}/operstate`),
      speedMbps: parseSysNumber(await readTrimmedSysFile(`/sys/class/net/${name}/speed`)),
      addresses: (addresses || []).map((address) => ({
        family: address.family,
        address: address.address,
        internal: address.internal
      })),
      stats
    });
  }
  return rows.sort((left, right) => {
    if (left.name === 'lo') return 1;
    if (right.name === 'lo') return -1;
    return left.name.localeCompare(right.name);
  });
}

async function readNetworkInterfaceStats(name) {
  const base = `/sys/class/net/${name}/statistics`;
  const [
    rxBytes,
    txBytes,
    rxPackets,
    txPackets,
    rxErrors,
    txErrors,
    rxDropped,
    txDropped
  ] = await Promise.all([
    readSysNumber(`${base}/rx_bytes`),
    readSysNumber(`${base}/tx_bytes`),
    readSysNumber(`${base}/rx_packets`),
    readSysNumber(`${base}/tx_packets`),
    readSysNumber(`${base}/rx_errors`),
    readSysNumber(`${base}/tx_errors`),
    readSysNumber(`${base}/rx_dropped`),
    readSysNumber(`${base}/tx_dropped`)
  ]);

  return {
    rxBytes,
    txBytes,
    rxPackets,
    txPackets,
    rxErrors,
    txErrors,
    rxDropped,
    txDropped
  };
}

async function readDefaultRoute() {
  const result = await runExecFile('ip', ['route', 'show', 'default'], {
    allowNonZero: true,
    timeoutMs: 10_000
  });
  const line = result.stdout.trim().split(/\r?\n/)[0] || '';
  return {
    interface: stringOrNull(line.match(/\bdev\s+(\S+)/)?.[1]),
    source: stringOrNull(line.match(/\bsrc\s+(\S+)/)?.[1]),
    metric: stringOrNull(line.match(/\bmetric\s+(\S+)/)?.[1])
  };
}

async function readHealthServices() {
  const [runner, poolManager, dashboard] = await Promise.all([
    getRunnerServiceStatus(),
    getRunnerPoolServiceStatus(),
    getServiceStatus(config.dashboardServiceName)
  ]);
  return {
    runner,
    poolManager,
    dashboard
  };
}

async function readConnectivityProbes() {
  const targets = [
    {
      name: 'Nexus API',
      url: `${config.nexusBaseUrl}/api/codex-runner/health`
    },
    {
      name: 'GitHub API',
      url: 'https://api.github.com/rate_limit'
    }
  ];
  return Promise.all(targets.map((target) => probeUrl(target)));
}

async function probeUrl(target) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(target.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'user-agent': 'nexus-runner-dashboard-health'
      }
    });
    await response.arrayBuffer().catch(() => null);
    return {
      name: target.name,
      url: target.url,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      name: target.name,
      url: target.url,
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
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
    const serviceName = await getServiceNameForRunner(runnerId);
    const result = await runServiceAction(action, serviceName);
    sendJson(response, 200, {
      ok: true,
      runnerId,
      action,
      service: await getServiceStatus(serviceName),
      output: result.stdout || result.stderr || ''
    });
    return;
  }

  throw new HttpError(400, 'Unsupported runner control action.');
}

async function handleRunnerPoolControl(response, body) {
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (!['start', 'stop', 'restart'].includes(action)) {
    throw new HttpError(400, 'Unsupported runner pool control action.');
  }

  const result = await runServiceAction(action, config.runnerPoolServiceName);
  sendJson(response, 200, {
    ok: true,
    action,
    poolService: await getRunnerPoolServiceStatus(),
    pool: await readRunnerPoolState(),
    output: result.stdout || result.stderr || ''
  });
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
        executionMode: stringOrNull(data.executionMode),
        codexCloudConfigured: data.codexCloudConfigured === true,
        githubCliBin: stringOrNull(data.githubCliBin),
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

async function runServiceAction(action, serviceName = config.runnerServiceName) {
  return runExecFile('sudo', ['-n', 'systemctl', action, serviceName], {
    timeoutMs: 45_000
  });
}

async function getRunnerServiceStatus() {
  return getServiceStatus(config.runnerServiceName);
}

async function getRunnerPoolServiceStatus() {
  return getServiceStatus(config.runnerPoolServiceName);
}

async function getServiceStatus(serviceName) {
  try {
    const [active, enabled] = await Promise.all([
      runExecFile('systemctl', ['is-active', serviceName], {
        allowNonZero: true,
        timeoutMs: 10_000
      }),
      runExecFile('systemctl', ['is-enabled', serviceName], {
        allowNonZero: true,
        timeoutMs: 10_000
      })
    ]);
    return {
      name: serviceName,
      active: active.stdout.trim() || active.stderr.trim() || 'unknown',
      enabled: enabled.stdout.trim() || enabled.stderr.trim() || 'unknown'
    };
  } catch (error) {
    return {
      name: serviceName,
      active: 'unknown',
      enabled: 'unknown',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getServiceNameForRunner(runnerId) {
  const pool = await readRunnerPoolState();
  const poolInstance = Array.isArray(pool?.instances)
    ? pool.instances.find((instance) => instance?.runnerId === runnerId && instance?.unit)
    : null;
  if (poolInstance?.unit) {
    return poolInstance.unit;
  }
  if (runnerId.startsWith(config.runnerPoolPrefix)) {
    return instantiateTemplateService(config.runnerTemplateServiceName, runnerId);
  }
  return config.runnerServiceName;
}

async function readRunnerPoolState() {
  if (!existsSync(config.runnerPoolStateFile)) {
    return null;
  }
  try {
    const data = JSON.parse(await readFile(config.runnerPoolStateFile, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch (error) {
    return {
      ok: false,
      generatedAt: null,
      error: error instanceof Error ? error.message : String(error),
      config: {
        poolPrefix: config.runnerPoolPrefix,
        stateFile: config.runnerPoolStateFile
      },
      queue: null,
      pool: null,
      instances: [],
      actions: []
    };
  }
}

function instantiateTemplateService(templateServiceName, instanceName) {
  const safeInstance = sanitizeFileName(instanceName);
  if (templateServiceName.includes('@.')) {
    return templateServiceName.replace('@.', `@${safeInstance}.`);
  }
  if (templateServiceName.endsWith('@')) {
    return `${templateServiceName}${safeInstance}.service`;
  }
  return `nexus-codex-runner@${safeInstance}.service`;
}

async function getGitHubCliStatus() {
  const checkedAt = new Date().toISOString();
  try {
    const auth = await runExecFile(
      config.githubCliBin,
      ['auth', 'status', '--hostname', config.githubHost],
      {
        allowNonZero: true,
        maxBuffer: 500_000,
        timeoutMs: 10_000
      }
    );
    const authOutput = sanitizeGitHubCliOutput(`${auth.stdout}\n${auth.stderr}`.trim());
    const authenticated = auth.code === 0 && /Logged in to/i.test(authOutput);
    const parsedLogin = parseGitHubLogin(authOutput);
    let viewer = null;

    if (authenticated) {
      const user = await runExecFile(config.githubCliBin, ['api', 'user'], {
        allowNonZero: true,
        maxBuffer: 500_000,
        timeoutMs: 10_000
      });
      if (user.code === 0 && user.stdout.trim()) {
        viewer = parseJsonObject(user.stdout);
      }
    }

    const login = stringOrNull(viewer?.login) || parsedLogin;
    return {
      cli: config.githubCliBin,
      host: config.githubHost,
      authenticated,
      login,
      name: stringOrNull(viewer?.name),
      profileUrl: stringOrNull(viewer?.html_url),
      protocol: parseGitHubProtocol(authOutput),
      scopes: parseGitHubScopes(authOutput),
      statusText: authenticated
        ? `Authenticated as ${login || 'GitHub account'}`
        : authOutput || 'GitHub CLI is not authenticated.',
      checkedAt
    };
  } catch (error) {
    return {
      cli: config.githubCliBin,
      host: config.githubHost,
      authenticated: false,
      login: null,
      name: null,
      profileUrl: null,
      protocol: null,
      scopes: [],
      statusText: error instanceof Error ? error.message : String(error),
      checkedAt
    };
  }
}

async function readRunnerLogs(lines, serviceName = config.runnerServiceName) {
  const args = [
    '-u',
    serviceName,
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
  <title>Nexus Runners</title>
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
      --good: #35dd8b;
      --red: #ff7185;
      --amber: #f4c95d;
      --teal: #2dd4bf;
      --accent: #2dd4bf;
      --violet: #a78bfa;
      --blue: #74a8ff;
      --surface: #121821;
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
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary-strip {
      display: block;
      min-width: 0;
    }
    .ops-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .readiness-button {
      gap: 7px;
      color: var(--muted);
      background: rgba(18, 24, 33, 0.34);
      border-color: rgba(172, 187, 205, 0.14);
    }
    .readiness-button .status-dot {
      width: 7px;
      height: 7px;
      animation: none;
      box-shadow: none;
      opacity: 0.78;
    }
    .readiness-button .status-dot.active,
    .readiness-button .status-dot.running,
    .readiness-button .status-dot.paused,
    .readiness-button .status-dot.inactive {
      animation: none;
      box-shadow: none;
    }
    .preflight-panel {
      display: grid;
      gap: 0;
      margin: 0;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(23, 31, 42, 0.94), rgba(12, 18, 28, 0.9)),
        rgba(18, 24, 33, 0.92);
      overflow: hidden;
      box-shadow: none;
    }
    .preflight-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(172, 187, 205, 0.14);
    }
    .preflight-title {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }
    .preflight-ring {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid rgba(53, 221, 139, 0.28);
      background: rgba(53, 221, 139, 0.08);
      color: var(--green);
    }
    .preflight-ring.warn {
      border-color: rgba(244, 201, 93, 0.38);
      background: rgba(244, 201, 93, 0.09);
      color: var(--amber);
    }
    .preflight-ring.fail {
      border-color: rgba(255, 113, 133, 0.42);
      background: rgba(255, 113, 133, 0.1);
      color: var(--red);
    }
    .preflight-title h2 { font-size: 16px; }
    .preflight-title span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }
    .preflight-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .preflight-actions button {
      min-height: 32px;
      padding: 0 10px;
      background: rgba(18, 24, 33, 0.5);
    }
    .preflight-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 0.36fr);
      gap: 0;
    }
    .preflight-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      background: rgba(172, 187, 205, 0.1);
    }
    .preflight-check {
      min-width: 0;
      display: grid;
      gap: 6px;
      padding: 12px;
      background: rgba(12, 18, 28, 0.82);
    }
    .preflight-check strong {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .preflight-check small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .preflight-dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--muted);
    }
    .preflight-check.ok .preflight-dot { background: var(--green); box-shadow: 0 0 0 4px rgba(53, 221, 139, 0.08); }
    .preflight-check.warn .preflight-dot { background: var(--amber); box-shadow: 0 0 0 4px rgba(244, 201, 93, 0.08); }
    .preflight-check.fail .preflight-dot { background: var(--red); box-shadow: 0 0 0 4px rgba(255, 113, 133, 0.08); }
    .preflight-aside {
      display: grid;
      align-content: start;
      gap: 10px;
      padding: 12px;
      border-left: 1px solid rgba(172, 187, 205, 0.14);
      background: rgba(2, 6, 23, 0.18);
    }
    .preflight-note {
      display: grid;
      gap: 5px;
      padding: 10px;
      border: 1px solid rgba(172, 187, 205, 0.14);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.26);
    }
    .preflight-note span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .preflight-note strong {
      color: var(--text);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .preflight-note small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .ops-overview {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(290px, 0.92fr) minmax(420px, 1.32fr) minmax(280px, 0.92fr);
      align-items: stretch;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background:
        radial-gradient(circle at 8% 0%, rgba(53, 221, 139, 0.13), transparent 28%),
        radial-gradient(circle at 70% 100%, rgba(106, 168, 255, 0.1), transparent 32%),
        linear-gradient(90deg, rgba(18, 24, 33, 0.96), rgba(16, 22, 31, 0.88)),
        rgba(18, 24, 33, 0.88);
      color: var(--soft);
      font-weight: 800;
      overflow: hidden;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
    }
    .ops-pane {
      min-width: 0;
      padding: 15px 16px;
    }
    .ops-pane + .ops-pane {
      border-left: 1px solid rgba(172, 187, 205, 0.14);
    }
    .ops-state {
      display: flex;
      align-items: center;
      gap: 13px;
      min-width: 0;
    }
    .ops-orb {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 1px solid rgba(53, 221, 139, 0.26);
      background: rgba(53, 221, 139, 0.1);
      box-shadow: inset 0 0 22px rgba(53, 221, 139, 0.08);
      animation: pulse-green 2.5s infinite;
    }
    .ops-orb.warning {
      border-color: rgba(244, 201, 93, 0.38);
      background: rgba(244, 201, 93, 0.11);
      animation-name: pulse-amber;
    }
    .ops-orb.alert {
      border-color: rgba(255, 113, 133, 0.42);
      background: rgba(255, 113, 133, 0.12);
      animation: none;
    }
    .ops-orb .status-dot { width: 12px; height: 12px; }
    .ops-state-main { min-width: 0; display: grid; gap: 3px; }
    .ops-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ops-title {
      color: var(--text);
      font-size: 22px;
      font-weight: 950;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }
    .ops-copy {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .ops-track {
      position: relative;
      width: min(250px, 100%);
      height: 6px;
      margin-top: 9px;
      border-radius: 999px;
      background: rgba(172, 187, 205, 0.13);
      overflow: hidden;
    }
    .ops-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--good), var(--accent));
      box-shadow: 0 0 18px rgba(53, 221, 139, 0.22);
    }
    .ops-stat-rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      height: 100%;
    }
    .ops-stat {
      min-width: 0;
      display: grid;
      align-content: center;
      gap: 5px;
      padding: 0 13px;
    }
    .ops-stat + .ops-stat {
      border-left: 1px solid rgba(172, 187, 205, 0.11);
    }
    .ops-stat span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .ops-stat strong {
      color: var(--text);
      font-size: 28px;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    .ops-stat small {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .ops-system-list {
      display: grid;
      gap: 8px;
      height: 100%;
      align-content: center;
    }
    .ops-system-group {
      display: grid;
      gap: 7px;
    }
    .ops-system-heading {
      color: var(--muted);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .ops-system {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .ops-system-left {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .ops-system-left strong {
      color: var(--text);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .ops-system > span:last-child {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
      white-space: nowrap;
    }
    .ops-divider {
      height: 1px;
      background: rgba(172, 187, 205, 0.12);
    }
    .brand-mark {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: rgba(237, 243, 251, 0.08);
      color: var(--text);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0;
    }
    .brand-mark.github {
      color: #ffffff;
      background: #111827;
      border-color: rgba(237, 243, 251, 0.22);
    }
    .brand-mark.codex {
      color: #ffffff;
      background: #111827;
      border-color: rgba(237, 243, 251, 0.22);
    }
    .brand-mark svg {
      display: block;
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .brand-mark.codex svg {
      width: 15px;
      height: 15px;
    }
    .integration-grid {
      display: grid;
      gap: 8px;
    }
    .integration-card {
      display: grid;
      gap: 8px;
      min-width: 0;
      border: 1px solid rgba(172, 187, 205, 0.16);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.2);
      padding: 10px;
    }
    .integration-card strong { overflow-wrap: anywhere; }
    .integration-card .mini { overflow-wrap: anywhere; }
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
    .health-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .health-card {
      min-width: 0;
      display: grid;
      gap: 9px;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background: rgba(18, 24, 33, 0.86);
      padding: 14px;
      box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24);
    }
    .health-card span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .health-card strong {
      color: var(--text);
      font-size: 24px;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }
    .health-card small {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .health-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 0.48fr);
      gap: 14px;
      align-items: start;
    }
    .health-section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .meter-stack { display: grid; gap: 11px; }
    .meter-row { display: grid; gap: 6px; }
    .meter-row > div:first-child {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--soft);
      font-weight: 850;
    }
    .meter-track {
      height: 9px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(172, 187, 205, 0.13);
      border: 1px solid rgba(172, 187, 205, 0.12);
    }
    .meter-fill {
      height: 100%;
      width: var(--meter-value, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, var(--blue), var(--teal));
    }
    .meter-fill.warn { background: linear-gradient(90deg, var(--amber), #fb923c); }
    .meter-fill.danger { background: linear-gradient(90deg, var(--red), #f43f5e); }
    .health-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .health-table th,
    .health-table td {
      border-bottom: 1px solid rgba(172, 187, 205, 0.13);
      padding: 9px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .health-table th {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
    }
    .health-table td { color: var(--soft); }
    .health-list { display: grid; gap: 10px; }
    .health-item {
      display: grid;
      gap: 7px;
      border: 1px solid rgba(172, 187, 205, 0.16);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.22);
      padding: 11px;
    }
    .health-item strong { overflow-wrap: anywhere; }
    .health-item .metric-row { min-height: 24px; }
    .metrics-control {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .metrics-control select {
      min-width: 132px;
      height: 34px;
      padding: 0 10px;
    }
    .metrics-kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
    }
    .metrics-kpi {
      position: relative;
      min-width: 0;
      display: grid;
      gap: 8px;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background:
        linear-gradient(145deg, rgba(23, 31, 42, 0.94), rgba(12, 18, 28, 0.86)),
        rgba(18, 24, 33, 0.86);
      padding: 14px;
      overflow: hidden;
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
    }
    .metrics-kpi::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 2px;
      background: linear-gradient(90deg, var(--blue), var(--teal));
      opacity: 0.76;
    }
    .metrics-kpi span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .metrics-kpi strong {
      color: var(--text);
      font-size: 26px;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    .metrics-kpi small {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .metrics-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr);
      gap: 14px;
      align-items: start;
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .chart-card {
      min-width: 0;
      display: grid;
      gap: 12px;
      border: 1px solid rgba(172, 187, 205, 0.18);
      border-radius: 8px;
      background: rgba(18, 24, 33, 0.9);
      padding: 14px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
    }
    .chart-card.wide { grid-column: 1 / -1; }
    .chart-title {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .chart-title span {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }
    .bar-chart {
      display: flex;
      align-items: end;
      gap: 5px;
      min-height: 190px;
      padding: 12px 4px 0;
      border-bottom: 1px solid rgba(172, 187, 205, 0.14);
    }
    .bar-column {
      flex: 1 1 0;
      min-width: 5px;
      display: flex;
      align-items: end;
      height: 170px;
    }
    .bar-stack {
      width: 100%;
      min-height: 2px;
      display: flex;
      flex-direction: column-reverse;
      overflow: hidden;
      border-radius: 5px 5px 0 0;
      background: rgba(172, 187, 205, 0.1);
    }
    .bar-segment { width: 100%; min-height: 1px; }
    .bar-segment.succeeded { background: var(--green); }
    .bar-segment.failed { background: var(--red); }
    .bar-segment.canceled { background: rgba(255, 113, 133, 0.42); }
    .bar-segment.active { background: var(--amber); }
    .bar-segment.pr { background: var(--blue); }
    .chart-legend {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .legend-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 5px;
      border-radius: 999px;
      background: var(--muted);
    }
    .legend-dot.succeeded { background: var(--green); }
    .legend-dot.failed { background: var(--red); }
    .legend-dot.active { background: var(--amber); }
    .legend-dot.pr { background: var(--blue); }
    .line-chart {
      width: 100%;
      height: 180px;
      border: 1px solid rgba(172, 187, 205, 0.12);
      border-radius: 8px;
      background:
        linear-gradient(rgba(172, 187, 205, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(172, 187, 205, 0.05) 1px, transparent 1px),
        rgba(2, 6, 23, 0.24);
      background-size: 100% 25%, 12.5% 100%, auto;
    }
    .distribution-list {
      display: grid;
      gap: 10px;
    }
    .distribution-row {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .distribution-row span:first-child {
      color: var(--soft);
      font-weight: 850;
      overflow-wrap: anywhere;
    }
    .distribution-track {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(172, 187, 205, 0.13);
    }
    .distribution-fill {
      height: 100%;
      width: var(--fill, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, var(--blue), var(--teal));
    }
    .distribution-row strong {
      color: var(--text);
      text-align: right;
      font-size: 13px;
    }
    .metrics-aside {
      display: grid;
      gap: 14px;
    }
    .dedupe-list {
      display: grid;
      gap: 8px;
    }
    .dedupe-row {
      display: grid;
      gap: 5px;
      border: 1px solid rgba(172, 187, 205, 0.14);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.2);
      padding: 10px;
    }
    .dedupe-row code {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .runner-list {
      display: grid;
      gap: 12px;
    }
    .runner-card {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) 130px 130px 105px minmax(260px, 0.82fr);
      gap: 14px;
      align-items: center;
      width: 100%;
      text-align: left;
      padding: 16px;
      border-color: rgba(172, 187, 205, 0.2);
      position: relative;
      overflow: hidden;
      cursor: pointer;
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
    .runner-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
      justify-self: end;
      width: min(224px, 100%);
    }
    .runner-actions button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      width: 100%;
      min-height: 26px;
      padding: 0 7px;
      color: var(--soft);
      background: rgba(18, 24, 33, 0.22);
      border-color: transparent;
      box-shadow: none;
      font-size: 12px;
    }
    .runner-actions button svg {
      width: 13px;
      height: 13px;
      flex: 0 0 auto;
    }
    .runner-actions button.primary {
      background: rgba(53, 221, 139, 0.08);
      color: #bbf7d0;
    }
    .runner-actions button.danger {
      background: rgba(255, 113, 133, 0.08);
      color: #fecdd3;
    }
    .runner-actions button.warn {
      background: rgba(244, 201, 93, 0.08);
      color: #fde68a;
    }
    .runner-actions button.ghost {
      background: rgba(18, 24, 33, 0.18);
      color: var(--muted);
    }
    .runner-actions button:hover {
      transform: none;
      background: rgba(23, 31, 42, 0.7);
    }
    .runner-actions button.primary:hover { border-color: rgba(53, 221, 139, 0.34); }
    .runner-actions button.danger:hover { border-color: rgba(255, 113, 133, 0.38); }
    .runner-actions button.warn:hover { border-color: rgba(244, 201, 93, 0.38); }
    .runner-actions button.ghost:hover { border-color: rgba(172, 187, 205, 0.28); }
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
      overflow-wrap: anywhere;
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
    .badge.warn { color: #422006; background: var(--amber); border-color: transparent; }
    .badge.danger { color: #fff1f2; background: rgba(251, 113, 133, 0.2); border-color: rgba(251, 113, 133, 0.5); }
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
    .task-link-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .task-link-card {
      display: grid;
      gap: 5px;
      min-width: 0;
      border: 1px solid rgba(172, 187, 205, 0.16);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.24);
      padding: 11px;
    }
    .task-link-card span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .task-link-card strong, .task-link-card a {
      color: var(--text);
      font-size: 13px;
      font-weight: 850;
      overflow-wrap: anywhere;
    }
    .task-timeline {
      display: grid;
      gap: 0;
      border: 1px solid rgba(172, 187, 205, 0.16);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.22);
      overflow: hidden;
    }
    .timeline-step {
      position: relative;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
      padding: 11px 12px;
    }
    .timeline-step + .timeline-step { border-top: 1px solid rgba(172, 187, 205, 0.11); }
    .timeline-dot {
      width: 10px;
      height: 10px;
      margin-top: 4px;
      border-radius: 50%;
      background: rgba(172, 187, 205, 0.42);
    }
    .timeline-step.done .timeline-dot { background: var(--green); box-shadow: 0 0 0 4px rgba(53, 221, 139, 0.08); }
    .timeline-step.current .timeline-dot { background: var(--amber); box-shadow: 0 0 0 4px rgba(244, 201, 93, 0.1); animation: pulse-amber 1.9s infinite; }
    .timeline-step.failed .timeline-dot { background: var(--red); box-shadow: 0 0 0 4px rgba(255, 113, 133, 0.08); }
    .timeline-main {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .timeline-main strong { color: var(--text); overflow-wrap: anywhere; }
    .timeline-main small { color: var(--muted); overflow-wrap: anywhere; }
    .timeline-time {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .artifact-list {
      display: grid;
      gap: 10px;
    }
    .artifact-row {
      display: grid;
      gap: 7px;
      min-width: 0;
      border: 1px solid rgba(172, 187, 205, 0.16);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.22);
      padding: 11px;
    }
    .artifact-row pre {
      max-height: 220px;
      padding: 10px;
      border: 1px solid rgba(172, 187, 205, 0.12);
      border-radius: 7px;
      background: rgba(2, 6, 23, 0.34);
    }
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
    .modal-card.preflight-modal-card { width: min(1120px, calc(100vw - 40px)); }
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
    @media (max-width: 1180px) {
      .command-bar { grid-template-columns: 1fr; }
      .ops-toolbar { justify-content: flex-start; min-width: 0; flex-wrap: wrap; }
      .ops-overview { grid-template-columns: 1fr; }
      .ops-pane + .ops-pane { border-left: 0; border-top: 1px solid rgba(172, 187, 205, 0.14); }
      .preflight-body { grid-template-columns: 1fr; }
      .preflight-aside { border-left: 0; border-top: 1px solid rgba(172, 187, 205, 0.14); }
    }
    @media (max-width: 980px) {
      .runner-card { grid-template-columns: 1fr 1fr; }
      .runner-actions {
        grid-column: 1 / -1;
        justify-self: stretch;
        width: 100%;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .detail-shell { grid-template-columns: 1fr; }
      .preflight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .task-link-grid { grid-template-columns: 1fr; }
      .health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .health-layout, .health-section-grid { grid-template-columns: 1fr; }
      .metrics-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metrics-layout, .chart-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .history-row { grid-template-columns: 1fr; }
      .history-actions { justify-content: flex-start; }
    }
    @media (max-width: 620px) {
      .shell { width: min(100vw - 20px, 1280px); }
      .topbar { align-items: flex-start; flex-direction: column; padding: 16px 0; }
      .toolbar, .detail-head { align-items: flex-start; flex-direction: column; }
      .ops-stat-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ops-stat { padding: 10px 8px; }
      .ops-stat + .ops-stat { border-left: 0; }
      .ops-stat:nth-child(even) { border-left: 1px solid rgba(172, 187, 205, 0.11); }
      .ops-stat:nth-child(n + 3) { border-top: 1px solid rgba(172, 187, 205, 0.11); }
      .preflight-head { align-items: flex-start; flex-direction: column; }
      .preflight-actions { justify-content: flex-start; }
      .preflight-grid { grid-template-columns: 1fr; }
      .runner-card, .grid, .form-grid { grid-template-columns: 1fr; }
      .runner-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .health-grid, .metrics-kpi-grid { grid-template-columns: 1fr; }
      .integration-grid { grid-template-columns: 1fr; }
      .control-actions { grid-template-columns: 1fr; }
      .detail-controls { justify-content: flex-start; }
      .metrics-control { justify-content: flex-start; }
      .distribution-row { grid-template-columns: 1fr; gap: 5px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell topbar">
      <div>
        <h1>Nexus Runners</h1>
        <div class="subtitle">Codex Cloud and GitHub runner operations</div>
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
      <div class="ops-toolbar">
        <button class="ghost" data-refresh>Refresh</button>
        <button class="ghost readiness-button" data-open-preflight title="Open runner readiness checks">
          <span class="status-dot idle" id="preflight-toolbar-dot"></span>
          <span id="preflight-toolbar-label">Readiness</span>
        </button>
        <button class="ghost" data-open-health>VPS Health</button>
        <button class="ghost" data-open-metrics>Metrics</button>
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
    <section class="view-stack hidden" id="health-view">
      <div class="detail-head">
        <div class="detail-title">
          <button class="ghost" data-back-to-runners>Back to runners</button>
          <h2>VPS Health</h2>
          <div class="runner-subline" id="health-meta"></div>
        </div>
        <div class="detail-controls">
          <button class="ghost" data-health-refresh>Refresh</button>
        </div>
      </div>
      <div class="view-stack" id="health-content">
        <div class="empty">Loading VPS health...</div>
      </div>
    </section>
    <section class="view-stack hidden" id="metrics-view">
      <div class="detail-head">
        <div class="detail-title">
          <button class="ghost" data-back-to-runners>Back to runners</button>
          <h2>Runner Metrics</h2>
          <div class="runner-subline" id="metrics-meta"></div>
        </div>
        <div class="metrics-control">
          <select id="metrics-range" aria-label="Metrics history range">
            <option value="7">Last 7 days</option>
            <option value="30" selected>Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button class="ghost" data-metrics-refresh>Refresh</button>
        </div>
      </div>
      <div class="view-stack" id="metrics-content">
        <div class="empty">Loading runner metrics...</div>
      </div>
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
          <textarea name="prompt" required placeholder="Tell Codex what to investigate, change, test, and open a GitHub PR for."></textarea>
        </label>
        <div class="row">
          <button class="primary" type="submit">Queue run</button>
          <span class="mini" id="create-status"></span>
        </div>
      </form>
    </article>
  </div>
  <div class="modal" id="preflight-modal" hidden>
    <article class="modal-card preflight-modal-card">
      <div class="panel-head">
        <div>
          <h2>Runner Readiness</h2>
          <div class="mini" id="preflight-modal-subtitle">Readiness checks load on demand.</div>
        </div>
        <button data-preflight-close>Close</button>
      </div>
      <div class="modal-body">
        <section class="preflight-panel" id="preflight-panel">
          <div class="empty">Running preflight checks...</div>
        </section>
      </div>
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
      preflight: '${escapeJsString(withBasePath('/api/preflight'))}',
      vpsHealth: '${escapeJsString(withBasePath('/api/vps-health'))}',
      metrics: '${escapeJsString(withBasePath('/api/metrics'))}',
      tasks: '${escapeJsString(withBasePath('/api/tasks'))}',
      smokeTest: '${escapeJsString(withBasePath('/api/tasks/smoke-test'))}',
      runners: '${escapeJsString(withBasePath('/api/runners'))}',
      poolControl: '${escapeJsString(withBasePath('/api/pool/control'))}',
      poolSelfTest: '${escapeJsString(withBasePath('/api/pool/self-test'))}'
    };
    const NEXUS_BASE_URL = '${escapeJsString(config.nexusBaseUrl)}';
    const landingViewEl = document.getElementById('landing-view');
    const healthViewEl = document.getElementById('health-view');
    const metricsViewEl = document.getElementById('metrics-view');
    const detailViewEl = document.getElementById('detail-view');
    const runnersEl = document.getElementById('runners');
    const summaryStripEl = document.getElementById('summary-strip');
    const preflightEl = document.getElementById('preflight-panel');
    const preflightButtonEl = document.querySelector('[data-open-preflight]');
    const preflightToolbarDotEl = document.getElementById('preflight-toolbar-dot');
    const preflightToolbarLabelEl = document.getElementById('preflight-toolbar-label');
    const preflightModalEl = document.getElementById('preflight-modal');
    const preflightModalSubtitleEl = document.getElementById('preflight-modal-subtitle');
    const generatedEl = document.getElementById('generated');
    const healthMetaEl = document.getElementById('health-meta');
    const healthContentEl = document.getElementById('health-content');
    const metricsMetaEl = document.getElementById('metrics-meta');
    const metricsContentEl = document.getElementById('metrics-content');
    const metricsRangeEl = document.getElementById('metrics-range');
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
    let latestPoolService = {};
    let latestPool = null;
    let latestIntegrations = {};
    let latestHealth = null;
    let latestPreflight = null;
    let latestPoolSelfTest = null;
    let latestMetrics = null;
    let currentView = 'landing';
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

    function formatDurationMs(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) {
        return null;
      }
      if (ms < 1000) {
        return ms + ' ms';
      }

      const totalSeconds = Math.round(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const parts = [];

      if (days) parts.push(days + ' day' + (days === 1 ? '' : 's'));
      if (hours) parts.push(hours + ' hr');
      if (minutes) parts.push(minutes + ' min');
      if (seconds || parts.length === 0) parts.push(seconds + ' sec');

      return parts.slice(0, 2).join(' ');
    }

    function formatBytes(value) {
      const bytes = Number(value);
      if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let current = bytes;
      let index = 0;
      while (current >= 1024 && index < units.length - 1) {
        current /= 1024;
        index += 1;
      }
      const precision = current >= 10 || index === 0 ? 0 : 1;
      return current.toFixed(precision) + ' ' + units[index];
    }

    function formatCount(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return 'unknown';
      return new Intl.NumberFormat().format(number);
    }

    function formatPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return 'unknown';
      return Math.round(number) + '%';
    }

    function formatUptime(seconds) {
      const totalSeconds = Number(seconds);
      if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'unknown';
      return formatDurationMs(totalSeconds * 1000);
    }

    function usageClass(percent) {
      const value = Number(percent);
      if (!Number.isFinite(value)) return '';
      if (value >= 90) return 'danger';
      if (value >= 75) return 'warn';
      return '';
    }

    function healthStateClass(ok) {
      return ok ? 'active' : 'inactive';
    }

    function renderField(label, value, code = false) {
      const body = code
        ? '<code>' + escapeHtml(value || 'none') + '</code>'
        : '<div>' + escapeHtml(value || 'none') + '</div>';
      return '<div class="field"><span>' + escapeHtml(label) + '</span>' + body + '</div>';
    }

    function renderMetricRow(label, value) {
      const normalized = value === 0 ? '0' : value;
      return '<div class="metric-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(normalized || 'none') + '</strong></div>';
    }

    function renderMetricsKpi(label, value, detail) {
      const normalized = value === 0 ? '0' : value;
      return '<div class="metrics-kpi">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<strong>' + escapeHtml(normalized || '0') + '</strong>' +
        '<small>' + escapeHtml(detail || '') + '</small>' +
      '</div>';
    }

    function formatRatioPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return 'n/a';
      return Math.round(number * 100) + '%';
    }

    function formatMetricDate(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return 'unknown';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function renderChartShell(title, detail, body, legend, wide = false) {
      return '<article class="chart-card' + (wide ? ' wide' : '') + '">' +
        '<div class="chart-title"><div><h3>' + escapeHtml(title) + '</h3><span>' + escapeHtml(detail || '') + '</span></div></div>' +
        body +
        (legend ? '<div class="chart-legend">' + legend + '</div>' : '') +
      '</article>';
    }

    function renderLegend(items) {
      return items.map((item) => '<span><i class="legend-dot ' + escapeHtml(item.className || '') + '"></i>' + escapeHtml(item.label) + '</span>').join('');
    }

    function renderJobThroughputChart(buckets) {
      const rows = Array.isArray(buckets) ? buckets : [];
      const visible = rows.slice(-60);
      const maxTotal = Math.max(1, ...visible.map((bucket) => Number(bucket.total) || 0));
      if (!visible.length) return '<div class="empty">No job history in this range.</div>';
      return '<div class="bar-chart">' + visible.map((bucket) => {
        const total = Number(bucket.total) || 0;
        const active = (Number(bucket.queued) || 0) + (Number(bucket.claimed) || 0) + (Number(bucket.running) || 0);
        const succeeded = Number(bucket.succeeded) || 0;
        const failed = Number(bucket.failed) || 0;
        const canceled = Number(bucket.canceled) || 0;
        const height = Math.max(total > 0 ? 8 : 2, Math.round((total / maxTotal) * 170));
        const title = formatMetricDate(bucket.start) + ': ' + total + ' job' + (total === 1 ? '' : 's');
        const segment = (className, count) => {
          if (!count || total <= 0) return '';
          return '<span class="bar-segment ' + className + '" style="height:' + Math.max(2, Math.round((count / total) * 100)) + '%"></span>';
        };
        return '<div class="bar-column" title="' + escapeHtml(title) + '">' +
          '<div class="bar-stack" style="height:' + height + 'px">' +
            segment('succeeded', succeeded) +
            segment('failed', failed) +
            segment('canceled', canceled) +
            segment('active', active) +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    function renderLineChart(seriesList, options = {}) {
      const width = 640;
      const height = 180;
      const pad = 18;
      const series = seriesList
        .map((item) => ({
          ...item,
          values: (item.values || []).map((value) => Number(value)).map((value) => Number.isFinite(value) ? value : null)
        }))
        .filter((item) => item.values.some((value) => value !== null));
      if (!series.length) return '<div class="empty">Not enough history for this chart yet.</div>';
      const maxLength = Math.max(...series.map((item) => item.values.length));
      const values = series.flatMap((item) => item.values).filter((value) => value !== null);
      const maxValue = Math.max(Number(options.maxValue || 0), ...values, 1);
      const minValue = Number(options.minValue || 0);
      const span = Math.max(1, maxValue - minValue);
      const pointFor = (value, index) => {
        const x = maxLength <= 1 ? width / 2 : pad + (index / (maxLength - 1)) * (width - pad * 2);
        const y = height - pad - ((value - minValue) / span) * (height - pad * 2);
        return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      };
      const paths = series.map((item) => {
        const points = item.values
          .map((value, index) => value === null ? null : pointFor(value, index).join(','))
          .filter(Boolean)
          .join(' ');
        return '<polyline points="' + escapeHtml(points) + '" fill="none" stroke="' + escapeHtml(item.color || '#74a8ff') + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></polyline>';
      }).join('');
      return '<svg class="line-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(options.label || 'Metric trend') + '">' +
        '<line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="rgba(172,187,205,.22)"></line>' +
        '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (height - pad) + '" stroke="rgba(172,187,205,.18)"></line>' +
        paths +
      '</svg>';
    }

    function renderDistribution(rows, labelKey) {
      const items = Array.isArray(rows) ? rows.filter((row) => Number(row.count) > 0) : [];
      const maxCount = Math.max(1, ...items.map((row) => Number(row.count) || 0));
      if (!items.length) return '<div class="empty">No data in this range.</div>';
      return '<div class="distribution-list">' + items.slice(0, 8).map((row) => {
        const count = Number(row.count) || 0;
        const width = Math.round((count / maxCount) * 100);
        return '<div class="distribution-row">' +
          '<span>' + escapeHtml(row[labelKey] || 'unknown') + '</span>' +
          '<div class="distribution-track"><div class="distribution-fill" style="--fill:' + width + '%"></div></div>' +
          '<strong>' + escapeHtml(count) + '</strong>' +
        '</div>';
      }).join('') + '</div>';
    }

    function getSnapshotSeries(history, path) {
      return (Array.isArray(history) ? history : []).map((row) => {
        const value = path.split('.').reduce((current, key) => current && current[key] !== undefined ? current[key] : null, row);
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      });
    }

    function renderDedupeRows(dedupe) {
      const rows = Array.isArray(dedupe?.topKeys) ? dedupe.topKeys : [];
      if (!rows.length) return '<div class="empty">No dedupe activity in this range.</div>';
      return '<div class="dedupe-list">' + rows.slice(0, 5).map((row) => {
        return '<div class="dedupe-row">' +
          '<code title="' + escapeHtml(row.dedupeKey) + '">' + escapeHtml(row.dedupeKey) + '</code>' +
          '<div class="mini">' + escapeHtml((row.jobs || 0) + ' job records · ' + (row.duplicateMessages || 0) + ' duplicate messages') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    function renderRecentFailures(failures) {
      const rows = Array.isArray(failures) ? failures : [];
      if (!rows.length) return '<div class="empty">No recent failures in this range.</div>';
      return '<div class="health-list">' + rows.slice(0, 5).map((row) => {
        return '<div class="health-item">' +
          '<div class="row">' + renderBadge(row.status || 'FAILED', 'failed') + '<code>' + escapeHtml(row.id) + '</code></div>' +
          '<div class="mini">' + escapeHtml(row.targetRepository + ':' + row.baseBranch + ' · ' + relativeTime(row.updatedAt)) + '</div>' +
          '<div class="mini">' + escapeHtml(row.statusMessage || 'No failure summary captured.') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    function renderOpsStat(label, value, detail) {
      const normalized = value === 0 ? '0' : value;
      return '<div class="ops-stat"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(normalized || '0') + '</strong><small>' + escapeHtml(detail || '') + '</small></div>';
    }

    function renderOpsSystem(iconHtml, label, detail, active) {
      return '<div class="ops-system">' +
        '<div class="ops-system-left">' +
          (iconHtml || '<span class="status-dot ' + escapeHtml(active ? 'active' : 'inactive') + '"></span>') +
          '<strong>' + escapeHtml(label) + '</strong>' +
        '</div>' +
        '<span>' + escapeHtml(detail || (active ? 'ready' : 'offline')) + '</span>' +
      '</div>';
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

    function renderBrandMark(kind) {
      const icons = {
        codex: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>',
        github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>'
      };
      return '<span class="brand-mark ' + escapeHtml(kind) + '">' + (icons[kind] || '') + '</span>';
    }

    function renderIntegrationPill(kind, label, detail, active) {
      return '<div class="summary-pill brand">' +
        renderBrandMark(kind) +
        '<strong>' + escapeHtml(label) + '</strong>' +
        '<span>' + escapeHtml(detail || (active ? 'ready' : 'offline')) + '</span>' +
      '</div>';
    }

    function renderIntegrationCard(kind, title, status, detail, active, href) {
      const titleHtml = href
        ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer">' + escapeHtml(title) + '</a>'
        : escapeHtml(title);
      return '<div class="integration-card">' +
        '<div class="row">' +
          renderBrandMark(kind) +
          '<strong>' + titleHtml + '</strong>' +
          renderBadge(status, active ? 'active' : 'inactive') +
        '</div>' +
        '<div class="mini">' + escapeHtml(detail || 'No details reported') + '</div>' +
      '</div>';
    }

    function getWorstPreflightStatus(checks) {
      if (!Array.isArray(checks) || checks.length === 0) return 'warn';
      if (checks.some((check) => check.status === 'fail')) return 'fail';
      if (checks.some((check) => check.status === 'warn')) return 'warn';
      return 'ok';
    }

    function preflightStatusLabel(status) {
      if (status === 'ok') return 'Ready for end-to-end';
      if (status === 'fail') return 'Blocked';
      return 'Ready with cautions';
    }

    function updatePreflightChrome(status, detail) {
      const dotClass = status === 'ok' ? 'active' : status === 'fail' ? 'inactive' : status === 'warn' ? 'paused' : 'idle';
      preflightToolbarDotEl.className = 'status-dot ' + dotClass;
      preflightToolbarLabelEl.textContent = 'Readiness';
      preflightButtonEl.title = detail || 'Open runner readiness checks';
      preflightModalSubtitleEl.textContent = detail || 'Readiness checks load on demand.';
    }

    function renderPreflightCheck(check) {
      const status = check?.status || 'warn';
      return '<div class="preflight-check ' + escapeHtml(status) + '">' +
        '<strong><span class="preflight-dot"></span>' + escapeHtml(check?.label || 'Check') + '</strong>' +
        '<small>' + escapeHtml(check?.detail || 'No detail reported.') + '</small>' +
      '</div>';
    }

    function renderPreflightNote(label, value, detail) {
      return '<div class="preflight-note">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<strong>' + escapeHtml(value || 'unknown') + '</strong>' +
        '<small>' + escapeHtml(detail || '') + '</small>' +
      '</div>';
    }

    function renderPreflight() {
      const preflight = latestPreflight;
      if (!preflight) {
        updatePreflightChrome('idle', 'Readiness checks are loading.');
        preflightEl.innerHTML = '<div class="empty">Running preflight checks...</div>';
        return;
      }
      if (preflight.error) {
        updatePreflightChrome('fail', 'Unable to load readiness checks.');
        preflightEl.innerHTML =
          '<div class="preflight-head">' +
            '<div class="preflight-title"><div class="preflight-ring fail"><span class="status-dot inactive"></span></div><div><h2>Runner Preflight</h2><span>Unable to load readiness checks.</span></div></div>' +
            '<div class="preflight-actions"><button class="ghost" data-preflight-refresh>Try again</button></div>' +
          '</div>' +
          '<div class="error">' + escapeHtml(preflight.error) + '</div>';
        return;
      }

      const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
      const worstStatus = getWorstPreflightStatus(checks);
      const failCount = checks.filter((check) => check.status === 'fail').length;
      const warnCount = checks.filter((check) => check.status === 'warn').length;
      const pool = preflight.poolSummary || {};
      const smoke = preflight.smokeTest || {};
      const selfTest = latestPoolSelfTest;
      const selfTestStatus = selfTest ? getWorstPreflightStatus(selfTest.checks || []) : null;
      const summary =
        failCount > 0
          ? failCount + ' failing check' + (failCount === 1 ? '' : 's')
          : warnCount > 0
            ? warnCount + ' caution' + (warnCount === 1 ? '' : 's')
            : 'All required checks are green';
      const title = preflightStatusLabel(worstStatus) + ' · ' + summary + ' · updated ' + new Date(preflight.generatedAt).toLocaleTimeString();
      updatePreflightChrome(worstStatus, title);

      preflightEl.innerHTML =
        '<div class="preflight-head">' +
          '<div class="preflight-title">' +
            '<div class="preflight-ring ' + escapeHtml(worstStatus) + '"><span class="status-dot ' + escapeHtml(worstStatus === 'ok' ? 'active' : worstStatus === 'fail' ? 'inactive' : 'paused') + '"></span></div>' +
            '<div><h2>Runner Preflight</h2><span>' + escapeHtml(title) + '</span></div>' +
          '</div>' +
          '<div class="preflight-actions">' +
            '<button class="ghost" data-preflight-refresh>Refresh checks</button>' +
            '<button class="ghost" data-pool-self-test>Pool self-test</button>' +
            '<button class="primary" data-smoke-test>Smoke test</button>' +
          '</div>' +
        '</div>' +
        '<div class="preflight-body">' +
          '<div class="preflight-grid">' + (checks.length ? checks.map(renderPreflightCheck).join('') : '<div class="empty">No checks returned.</div>') + '</div>' +
          '<aside class="preflight-aside">' +
            renderPreflightNote(
              'Smoke target',
              (smoke.repository || '${escapeJsString(config.defaultRepository)}') + ':' + (smoke.baseBranch || '${escapeJsString(config.defaultBaseBranch)}'),
              smoke.createsPullRequest ? 'Queues a harmless file-only run and opens a GitHub PR.' : 'No PR will be created.'
            ) +
            renderPreflightNote(
              'Runner pool',
              (pool.active ?? 0) + ' active / ' + (pool.max ?? 0) + ' max',
              (pool.queued ?? 0) + ' queued · target ' + (pool.target ?? 0)
            ) +
            (selfTest
              ? renderPreflightNote(
                  'Last self-test',
                  preflightStatusLabel(selfTestStatus),
                  (selfTest.safeLaunch ? 'Safe launch · ' : selfTest.dryRun ? 'Dry run · ' : '') + (selfTest.unit || 'no unit reported')
                )
              : renderPreflightNote('Pool self-test', 'Not run yet', 'Starts one paused template runner, verifies heartbeat, then stops it.')) +
          '</aside>' +
        '</div>';
    }

    function getRunnerPoolInstance(runnerId) {
      if (!latestPool || !Array.isArray(latestPool.instances)) return null;
      return latestPool.instances.find((instance) => instance && instance.runnerId === runnerId) || null;
    }

    function getRunnerServiceView(runner) {
      const instance = getRunnerPoolInstance(runner.runnerId);
      return instance?.service || latestService || {};
    }

    function renderPoolControlSection(runner) {
      const pool = latestPool;
      const instance = getRunnerPoolInstance(runner.runnerId);
      const latestAction = Array.isArray(pool?.actions) ? pool.actions[0] : null;
      const queue = pool?.queue || {};
      const poolStats = pool?.pool || {};
      const poolConfig = pool?.config || {};
      const managerState = latestPoolService?.active || 'unknown';
      const instanceRows = instance
        ? renderMetricRow('This unit', instance.unit) +
          renderMetricRow('Desired', instance.desired ? 'yes' : 'no') +
          renderMetricRow('Unit status', instance.service?.active || 'unknown')
        : renderMetricRow('This unit', runner.runnerId.startsWith('${escapeJsString(config.runnerPoolPrefix)}') ? 'template-managed' : 'baseline');
      const actionRows = latestAction
        ? renderMetricRow('Last action', latestAction.action + ' ' + latestAction.runnerId) +
          renderMetricRow('Action age', relativeTime(latestAction.at))
        : renderMetricRow('Last action', 'none');

      return '<section class="control-section">' +
        '<div class="control-section-title"><span>Runner Pool</span>' + renderBadge(managerState, managerState === 'active' ? 'active' : 'inactive') + '</div>' +
        '<div class="metric-list">' +
          renderMetricRow('Queued work', queue.queued ?? 'unknown') +
          renderMetricRow('Target workers', poolStats.target !== undefined ? poolStats.target + ' / ' + (poolConfig.maxRunners ?? 'unknown') : 'unknown') +
          renderMetricRow('Active workers', poolStats.active ?? 'unknown') +
          renderMetricRow('Busy workers', poolStats.busy ?? 'unknown') +
          renderMetricRow('Idle cool-down', formatDurationMs(poolConfig.idleTtlMs)) +
          instanceRows +
          actionRows +
        '</div>' +
        '<div class="control-actions">' +
          '<button data-pool-action="start">Start pool</button>' +
          '<button class="warn" data-pool-action="restart">Restart pool</button>' +
          '<button class="danger" data-pool-action="stop">Stop pool</button>' +
        '</div>' +
        (pool?.error ? '<div class="error">' + escapeHtml(pool.error) + '</div>' : '') +
      '</section>';
    }

    function renderHealthCard(label, value, detail) {
      return '<div class="health-card">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<strong>' + escapeHtml(value || 'unknown') + '</strong>' +
        '<small>' + escapeHtml(detail || '') + '</small>' +
      '</div>';
    }

    function renderMeter(label, percent, detail) {
      const value = Number(percent);
      const safePercent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
      return '<div class="meter-row">' +
        '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(formatPercent(value)) + '</strong></div>' +
        '<div class="meter-track"><div class="meter-fill ' + escapeHtml(usageClass(value)) + '" style="--meter-value:' + safePercent.toFixed(0) + '%"></div></div>' +
        '<div class="mini">' + escapeHtml(detail || '') + '</div>' +
      '</div>';
    }

    function renderHealthService(name, service) {
      const active = service?.active === 'active';
      return '<div class="health-item">' +
        '<div class="row"><strong>' + escapeHtml(name) + '</strong>' + renderBadge(service?.active || 'unknown', active ? 'active' : 'inactive') + '</div>' +
        '<div class="metric-list">' +
          renderMetricRow('Unit', service?.name || 'unknown') +
          renderMetricRow('Enabled', service?.enabled || 'unknown') +
        '</div>' +
        (service?.error ? '<div class="error">' + escapeHtml(service.error) + '</div>' : '') +
      '</div>';
    }

    function renderDiskTable(rows, unit) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return '<div class="empty">No filesystem data available.</div>';
      }
      return '<table class="health-table"><thead><tr>' +
        '<th>Path</th><th>Mount</th><th>Used</th><th>Available</th><th>Use</th>' +
        '</tr></thead><tbody>' +
        rows.map((row) => {
          if (!row.ok) {
            return '<tr><td>' + escapeHtml(row.path) + '</td><td colspan="4">' + escapeHtml(row.error || 'Unavailable') + '</td></tr>';
          }
          const used = unit === 'bytes' ? formatBytes(row.used) : formatCount(row.used);
          const available = unit === 'bytes' ? formatBytes(row.available) : formatCount(row.available);
          return '<tr>' +
            '<td><code>' + escapeHtml(row.path) + '</code></td>' +
            '<td>' + escapeHtml(row.mount || row.filesystem || 'unknown') + '</td>' +
            '<td>' + escapeHtml(used) + '</td>' +
            '<td>' + escapeHtml(available) + '</td>' +
            '<td>' + renderBadge(formatPercent(row.usedPercent), usageClass(row.usedPercent) || 'idle') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    function renderProbe(probe) {
      return '<div class="health-item">' +
        '<div class="row"><strong>' + escapeHtml(probe.name || 'Probe') + '</strong>' + renderBadge(probe.ok ? 'OK' : 'Issue', healthStateClass(probe.ok)) + '</div>' +
        '<div class="metric-list">' +
          renderMetricRow('Status', probe.status || 'none') +
          renderMetricRow('Latency', probe.durationMs !== undefined ? formatDurationMs(probe.durationMs) : 'unknown') +
          renderMetricRow('URL', probe.url || 'unknown') +
        '</div>' +
        (probe.error ? '<div class="error">' + escapeHtml(probe.error) + '</div>' : '') +
      '</div>';
    }

    function renderNetworkInterface(item) {
      const addresses = (item.addresses || [])
        .filter((address) => !address.internal)
        .map((address) => address.family + ' ' + address.address)
        .join(', ') || 'no external address';
      return '<div class="health-item">' +
        '<div class="row"><strong>' + escapeHtml(item.name) + '</strong>' + renderBadge(item.state || 'unknown', item.state === 'up' ? 'active' : 'idle') + '</div>' +
        '<div class="metric-list">' +
          renderMetricRow('Addresses', addresses) +
          renderMetricRow('Speed', item.speedMbps ? item.speedMbps + ' Mbps' : 'unknown') +
          renderMetricRow('Received', formatBytes(item.stats?.rxBytes)) +
          renderMetricRow('Sent', formatBytes(item.stats?.txBytes)) +
          renderMetricRow('Packets', formatCount((item.stats?.rxPackets || 0) + (item.stats?.txPackets || 0))) +
          renderMetricRow('Errors', formatCount((item.stats?.rxErrors || 0) + (item.stats?.txErrors || 0))) +
          renderMetricRow('Dropped', formatCount((item.stats?.rxDropped || 0) + (item.stats?.txDropped || 0))) +
        '</div>' +
      '</div>';
    }

    function renderVpsHealth() {
      const health = latestHealth;
      if (!health) {
        healthContentEl.innerHTML = '<div class="empty">Loading VPS health...</div>';
        return;
      }

      const memory = health.memory || {};
      const swap = health.swap || {};
      const cpu = health.cpu || {};
      const host = health.host || {};
      const processInfo = health.process || {};
      const services = health.services || {};
      const network = health.network || {};
      const probes = Array.isArray(health.probes) ? health.probes : [];
      const loadText = Array.isArray(cpu.loadAverage)
        ? cpu.loadAverage.map((value) => Number(value).toFixed(2)).join(' / ')
        : 'unknown';
      const primaryDisk = Array.isArray(health.disks) ? health.disks.find((disk) => disk.path === '/') || health.disks[0] : null;

      healthMetaEl.innerHTML =
        '<span>' + escapeHtml(host.hostname || 'unknown host') + '</span>' +
        '<span>' + escapeHtml(host.os || host.platform || 'unknown OS') + '</span>' +
        '<span>Updated ' + escapeHtml(new Date(health.generatedAt).toLocaleTimeString()) + '</span>';

      healthContentEl.innerHTML =
        '<section class="health-grid">' +
          renderHealthCard('Memory', formatPercent(memory.usedPercent), formatBytes(memory.usedBytes) + ' used of ' + formatBytes(memory.totalBytes)) +
          renderHealthCard('Root Disk', primaryDisk ? formatPercent(primaryDisk.usedPercent) : 'unknown', primaryDisk ? formatBytes(primaryDisk.available) + ' available' : 'No disk data') +
          renderHealthCard('CPU Load', formatPercent(cpu.loadPercent1m), (cpu.cores || 'unknown') + ' cores · ' + loadText) +
          renderHealthCard('Uptime', formatUptime(host.uptimeSeconds), host.kernel || '') +
        '</section>' +
        '<section class="health-layout">' +
          '<div class="view-stack">' +
            '<article class="panel"><div class="panel-head"><h2>Resource Usage</h2><span class="mini">Live host counters</span></div><div class="panel-body">' +
              '<div class="meter-stack">' +
                renderMeter('Memory', memory.usedPercent, formatBytes(memory.usedBytes) + ' used · ' + formatBytes(memory.freeBytes) + ' free') +
                renderMeter('Swap', swap.usedPercent, formatBytes(swap.usedBytes) + ' used · ' + formatBytes(swap.totalBytes) + ' total') +
                renderMeter('CPU load', cpu.loadPercent1m, 'Load average ' + loadText) +
              '</div>' +
            '</div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Disk Usage</h2><span class="mini">Capacity by mounted path</span></div><div class="panel-body">' +
              renderDiskTable(health.disks, 'bytes') +
            '</div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Inodes</h2><span class="mini">Filesystem object pressure</span></div><div class="panel-body">' +
              renderDiskTable(health.inodes, 'inodes') +
            '</div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Network Interfaces</h2><span class="mini">Traffic totals since boot</span></div><div class="panel-body"><div class="health-section-grid">' +
              (Array.isArray(network.interfaces) && network.interfaces.length ? network.interfaces.map(renderNetworkInterface).join('') : '<div class="empty">No network interfaces found.</div>') +
            '</div></div></article>' +
          '</div>' +
          '<aside class="view-stack">' +
            '<article class="panel"><div class="panel-head"><h2>Services</h2><span class="mini">systemd</span></div><div class="panel-body"><div class="health-list">' +
              renderHealthService('Runner', services.runner) +
              renderHealthService('Pool Manager', services.poolManager) +
              renderHealthService('Dashboard', services.dashboard) +
            '</div></div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Process</h2><span class="mini">Dashboard runtime</span></div><div class="panel-body"><div class="metric-list">' +
              renderMetricRow('PID', host.pid || 'unknown') +
              renderMetricRow('Node', host.nodeVersion || 'unknown') +
              renderMetricRow('Runtime uptime', formatUptime(processInfo.uptimeSeconds)) +
              renderMetricRow('RSS', formatBytes(processInfo.memory?.rss)) +
              renderMetricRow('Heap used', formatBytes(processInfo.memory?.heapUsed)) +
            '</div></div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Network Route</h2><span class="mini">Default egress</span></div><div class="panel-body"><div class="metric-list">' +
              renderMetricRow('Interface', network.defaultRoute?.interface || 'unknown') +
              renderMetricRow('Source', network.defaultRoute?.source || 'unknown') +
              renderMetricRow('Metric', network.defaultRoute?.metric || 'default') +
            '</div></div></article>' +
            '<article class="panel"><div class="panel-head"><h2>Connectivity</h2><span class="mini">Outbound probes</span></div><div class="panel-body"><div class="health-list">' +
              (probes.length ? probes.map(renderProbe).join('') : '<div class="empty">No probes configured.</div>') +
            '</div></div></article>' +
          '</aside>' +
        '</section>';
    }

    function renderMetrics() {
      const metrics = latestMetrics;
      if (!metrics) {
        metricsContentEl.innerHTML = '<div class="empty">Loading runner metrics...</div>';
        return;
      }
      if (metrics.error) {
        metricsContentEl.innerHTML = '<div class="error">' + escapeHtml(metrics.error) + '</div>';
        return;
      }

      const jobs = metrics.jobs || {};
      const totals = jobs.totals || {};
      const history = metrics.dashboard?.history || [];
      const latestSnapshot = metrics.dashboard?.latest || history[history.length - 1] || {};
      const windowInfo = jobs.window || {};
      const buckets = jobs.buckets || [];
      const completionSeries = buckets.map((bucket) => {
        const value = Number(bucket.avgCompletionMs);
        return Number.isFinite(value) ? Math.round(value / 60000) : null;
      });
      const healthHistory = history.slice(-96);
      const runnerHistory = history.slice(-96);
      const activeRunnerSeries = getSnapshotSeries(runnerHistory, 'runners.active');
      const busyRunnerSeries = getSnapshotSeries(runnerHistory, 'runners.busy');
      const queuedSeries = getSnapshotSeries(runnerHistory, 'pool.queued');
      const runnerMax = Math.max(1, ...activeRunnerSeries, ...busyRunnerSeries, ...queuedSeries);
      const startedAt = windowInfo.start ? formatMetricDate(windowInfo.start) : 'unknown';
      const endedAt = windowInfo.end ? formatMetricDate(windowInfo.end) : 'now';

      metricsMetaEl.innerHTML =
        '<span>Updated ' + escapeHtml(new Date(metrics.generatedAt).toLocaleString()) + '</span>' +
        '<span>Window ' + escapeHtml(startedAt + ' to ' + endedAt) + '</span>' +
        '<span>' + escapeHtml(history.length + ' VPS snapshots') + '</span>';

      const kpis = '<section class="metrics-kpi-grid">' +
        renderMetricsKpi('Jobs', formatCount(totals.jobs || 0), (totals.active || 0) + ' active now') +
        renderMetricsKpi('Success rate', formatRatioPercent(totals.successRate), (totals.succeeded || 0) + ' succeeded · ' + (totals.failed || 0) + ' failed') +
        renderMetricsKpi('GitHub PRs', formatCount(totals.prOpened || 0), formatRatioPercent(totals.prRate) + ' of runner jobs') +
        renderMetricsKpi('Avg completion', formatDurationMs(totals.avgCompletionMs) || 'n/a', 'Queue ' + (formatDurationMs(totals.avgQueueWaitMs) || 'n/a') + ' · run ' + (formatDurationMs(totals.avgRunMs) || 'n/a')) +
        renderMetricsKpi('Fleet now', (latestSnapshot.runners?.active ?? 0) + ' / ' + (latestSnapshot.runners?.total ?? 0), (latestSnapshot.pool?.queued ?? 0) + ' queued · pool ' + (latestSnapshot.pool?.active ?? 0) + '/' + (latestSnapshot.pool?.max ?? 0)) +
      '</section>';

      const throughput = renderChartShell(
        'Job Throughput',
        'Queued, active, completed, failed, and canceled work by time bucket.',
        renderJobThroughputChart(buckets),
        renderLegend([
          { label: 'Succeeded', className: 'succeeded' },
          { label: 'Failed', className: 'failed' },
          { label: 'Queued or running', className: 'active' }
        ]),
        true
      );
      const completionTrend = renderChartShell(
        'Completion Time',
        'Average completed-job duration per bucket, in minutes.',
        renderLineChart([
          { label: 'Avg completion', color: '#74a8ff', values: completionSeries }
        ], {
          label: 'Average completion time'
        }),
        '<span><i class="legend-dot pr"></i>Average minutes</span>'
      );
      const vpsTrend = renderChartShell(
        'VPS Pressure',
        'CPU load, memory, and root disk utilization from local snapshots.',
        renderLineChart([
          { label: 'CPU', color: '#74a8ff', values: getSnapshotSeries(healthHistory, 'vps.cpuLoadPercent1m') },
          { label: 'Memory', color: '#2dd4bf', values: getSnapshotSeries(healthHistory, 'vps.memoryUsedPercent') },
          { label: 'Disk', color: '#f4c95d', values: getSnapshotSeries(healthHistory, 'vps.rootDiskUsedPercent') }
        ], {
          maxValue: 100,
          label: 'VPS pressure'
        }),
        '<span><i class="legend-dot pr"></i>CPU</span><span><i class="legend-dot succeeded"></i>Memory</span><span><i class="legend-dot active"></i>Disk</span>'
      );
      const runnerTrend = renderChartShell(
        'Runner Availability',
        'Active workers, busy workers, and queued pool work from VPS snapshots.',
        renderLineChart([
          { label: 'Active', color: '#35dd8b', values: activeRunnerSeries },
          { label: 'Busy', color: '#a78bfa', values: busyRunnerSeries },
          { label: 'Queued', color: '#f4c95d', values: queuedSeries }
        ], {
          maxValue: runnerMax,
          label: 'Runner availability'
        }),
        '<span><i class="legend-dot succeeded"></i>Active</span><span><i class="legend-dot"></i>Busy</span><span><i class="legend-dot active"></i>Queued</span>'
      );

      metricsContentEl.innerHTML =
        kpis +
        '<section class="metrics-layout">' +
          '<div class="chart-grid">' +
            throughput +
            completionTrend +
            vpsTrend +
            runnerTrend +
          '</div>' +
          '<aside class="metrics-aside">' +
            renderChartShell('Status Mix', 'Job outcomes in this window.', renderDistribution(jobs.byStatus, 'status'), '') +
            renderChartShell('Runner Workload', 'Jobs grouped by runner ID.', renderDistribution(jobs.byRunner, 'runnerId'), '') +
            renderChartShell('Sources', 'Where runner jobs originated.', renderDistribution(jobs.bySource, 'source'), '') +
            renderChartShell(
              'Crash Dedupe',
              (jobs.dedupe?.duplicateMessages || 0) + ' duplicate crash reports linked to existing work.',
              renderDedupeRows(jobs.dedupe),
              ''
            ) +
            renderChartShell('Recent Failures', 'Most recent failed runner jobs.', renderRecentFailures(jobs.recentFailures), '') +
          '</aside>' +
        '</section>';
    }

    function taskCanCancel(task) {
      return ['QUEUED', 'CLAIMED', 'RUNNING'].includes(task.status);
    }

    function taskCanRetry(task) {
      return ['FAILED', 'CANCELED'].includes(task.status);
    }

    function renderRunnerActionIcon(kind) {
      const base = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
      const icons = {
        start: '<path d="M5.5 3.5 12 8l-6.5 4.5z"/>',
        stop: '<path d="M5 5h6v6H5z"/>',
        restart: '<path d="M12.5 6.5A4.7 4.7 0 1 0 13 8"/><path d="M12.5 3.5v3h-3"/>',
        pause: '<path d="M5.5 4.5v7"/><path d="M10.5 4.5v7"/>',
        details: '<path d="M7.25 11.5a4.25 4.25 0 1 1 3-1.25L13 13"/><path d="M7.25 5.5v.01"/><path d="M7.25 7.5v2.25"/>'
      };
      return base + (icons[kind] || '') + '</svg>';
    }

    function renderRunnerActionButton(className, action, runnerId, label, icon, openRunnerId = '') {
      const actionAttribute = action ? ' data-runner-action="' + escapeHtml(action) + '"' : '';
      const openAttribute = openRunnerId ? ' data-runner-open="' + escapeHtml(openRunnerId) + '"' : '';
      return '<button class="' + escapeHtml(className) + '"' + actionAttribute + ' data-runner-id="' + escapeHtml(runnerId) + '"' + openAttribute + ' title="' + escapeHtml(label) + '">' +
        renderRunnerActionIcon(icon) +
        '<span>' + escapeHtml(label) + '</span>' +
      '</button>';
    }

    function renderRunnerActions(runner) {
      const runnerId = runner.runnerId;
      const powerAction = runner.active
        ? renderRunnerActionButton('danger', 'stop', runnerId, 'Stop', 'stop')
        : renderRunnerActionButton('primary', 'start', runnerId, 'Start', 'start');
      const pauseAction = runner.active
        ? renderRunnerActionButton('ghost', runner.paused ? 'resume' : 'pause', runnerId, runner.paused ? 'Resume' : 'Pause', runner.paused ? 'start' : 'pause')
        : '';
      return '<div class="runner-actions" aria-label="Controls for ' + escapeHtml(runnerId) + '">' +
        powerAction +
        renderRunnerActionButton('warn', 'restart', runnerId, 'Restart', 'restart') +
        pauseAction +
        renderRunnerActionButton('ghost', '', runnerId, 'Details', 'details', runnerId) +
      '</div>';
    }

    function renderRunner(runner) {
      const activeLabel = runner.paused ? 'Paused' : runner.active ? 'Active' : 'Inactive';
      const stateClass = runnerStateClass(runner);
      const current = runner.currentJob
        ? '<div class="mini">Running ' + escapeHtml(runner.currentJob.branchName || runner.currentJob.id) + '</div>' +
          (runner.currentJob.statusMessage ? '<div class="mini">' + escapeHtml(runner.currentJob.statusMessage) + '</div>' : '')
        : '<div class="mini">No current run</div>';
      return '<article class="runner-card ' + stateClass + '" data-runner-card-open="' + escapeHtml(runner.runnerId) + '">' +
        '<div class="runner-primary">' +
          '<div class="row"><span class="status-dot ' + stateClass + '"></span><span class="runner-name">' + escapeHtml(runner.runnerId) + '</span>' + renderBadge(activeLabel, stateClass) + '</div>' +
          '<div class="runner-subline"><span>' + escapeHtml(runner.hostname || 'unknown host') + '</span><span>PID ' + escapeHtml(runner.pid || 'n/a') + '</span></div>' +
          (stateClass === 'running' ? '<div class="activity-bar"><span></span></div>' : '') +
          current +
        '</div>' +
        '<div class="runner-kpi"><span>Status</span><strong>' + escapeHtml(runner.status || 'unknown') + '</strong></div>' +
        '<div class="runner-kpi"><span>Last seen</span><strong>' + escapeHtml(relativeTime(runner.lastSeenAt)) + '</strong></div>' +
        '<div class="runner-kpi"><span>Runs</span><strong>' + escapeHtml(runner.jobsProcessed || '0') + '</strong></div>' +
        renderRunnerActions(runner) +
      '</article>';
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
      const pr = task.prUrl ? '<a href="' + escapeHtml(task.prUrl) + '" target="_blank" rel="noreferrer">GitHub PR #' + escapeHtml(task.prNumber || '') + '</a>' : '<span class="muted">No PR</span>';
      const source = task.messageId ? renderBadge('Webhook', 'idle') : renderBadge('Dashboard', 'idle');
      const actions =
        '<button data-task-detail="' + id + '">Details</button>' +
        (taskCanCancel(task) ? '<button class="danger" data-task-cancel="' + id + '">Cancel</button>' : '') +
        (taskCanRetry(task) ? '<button class="warn" data-task-retry="' + id + '">Retry</button>' : '');
      return '<div class="history-row">' +
        '<div class="history-main">' +
          '<div class="row">' + renderBadge(task.status, statusClass(task.status)) + source + '<code>' + id + '</code></div>' +
          '<div><strong>' + escapeHtml(task.targetRepository) + '</strong> <span class="muted">on</span> <code>' + escapeHtml(task.baseBranch) + '</code></div>' +
          '<div class="mini">' + escapeHtml(task.statusMessage || 'No status message') + '</div>' +
        '</div>' +
        '<div>' + escapeHtml(relativeTime(task.createdAt)) + '</div>' +
        '<div>' + pr + '</div>' +
        '<div class="history-actions">' + actions + '</div>' +
      '</div>';
    }

    function taskContextValue(task, key) {
      return task && task.context && typeof task.context === 'object' ? task.context[key] : null;
    }

    function renderTaskLinkCard(label, title, detail, href) {
      const titleHtml = href
        ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer">' + escapeHtml(title || href) + '</a>'
        : '<strong>' + escapeHtml(title || 'none') + '</strong>';
      return '<div class="task-link-card">' +
        '<span>' + escapeHtml(label) + '</span>' +
        titleHtml +
        '<small class="mini">' + escapeHtml(detail || '') + '</small>' +
      '</div>';
    }

    function getNexusWebhookUrl(messageId) {
      return NEXUS_BASE_URL + '/admin/webhooks?messageId=' + encodeURIComponent(messageId);
    }

    function renderTaskBacklinks(task) {
      const codexCloud = task?.result?.codexCloud || {};
      const sourceTitle = task.messageId
        ? 'Webhook crash report'
        : taskContextValue(task, 'source') === 'runner-dashboard'
          ? 'Runner dashboard'
          : 'Nexus job queue';
      const sourceDetail = task.messageId
        ? 'Message ' + task.messageId
        : taskContextValue(task, 'title') || task.id;
      const sourceHref = task.messageId ? getNexusWebhookUrl(task.messageId) : null;
      return '<section class="task-link-grid">' +
        renderTaskLinkCard('Nexus source', sourceTitle, sourceDetail, sourceHref) +
        renderTaskLinkCard(
          'Codex task',
          codexCloud.taskUrl ? 'Open Codex Cloud task' : codexCloud.taskId || 'Not submitted yet',
          codexCloud.status ? 'Status: ' + codexCloud.status : 'Appears after the runner submits cloud work.',
          codexCloud.taskUrl
        ) +
        renderTaskLinkCard(
          'GitHub PR',
          task.prUrl ? 'Open pull request' : 'No PR yet',
          task.prNumber ? 'PR #' + task.prNumber : 'The runner opens this after validation and push.',
          task.prUrl
        ) +
      '</section>';
    }

    function renderTaskTimeline(task) {
      const codexCloud = task?.result?.codexCloud || null;
      const terminal = ['SUCCEEDED', 'FAILED', 'CANCELED'].includes(task.status);
      const steps = [
        {
          label: 'Queued',
          at: task.createdAt,
          detail: 'Nexus accepted the job.'
        },
        {
          label: 'Claimed',
          at: task.claimedAt,
          detail: task.runnerId ? 'Claimed by ' + task.runnerId + '.' : 'Waiting for a runner to claim it.'
        },
        {
          label: 'Started',
          at: task.startedAt,
          detail: task.branchName ? 'Runner branch ' + task.branchName + '.' : 'Preparing the worktree.'
        }
      ];

      if (codexCloud) {
        steps.push({
          label: 'Codex Cloud submitted',
          at: codexCloud.submittedAt,
          detail: codexCloud.taskUrl || codexCloud.taskId || 'Cloud task submitted.'
        });
        steps.push({
          label: 'Cloud status checked',
          at: codexCloud.lastCheckedAt,
          detail: codexCloud.status ? 'Cloud status: ' + codexCloud.status + '.' : 'Polling Codex Cloud for completion.'
        });
      }

      const statusText = String(task.status || 'PENDING');
      steps.push({
        label: terminal ? statusText.charAt(0) + statusText.slice(1).toLowerCase() : 'Finishing',
        at: task.completedAt,
        detail: task.prUrl
          ? 'Pull request opened.'
          : task.error || task.statusMessage || 'Waiting for the runner to finish and publish.'
      });

      const firstPending = steps.findIndex((step) => !step.at);
      return '<section class="task-timeline">' +
        steps.map((step, index) => {
          const isDone = Boolean(step.at);
          const isCurrent = !terminal && index === firstPending;
          const isFailed = terminal && task.status !== 'SUCCEEDED' && index === steps.length - 1;
          const className = isFailed ? 'failed' : isDone ? 'done' : isCurrent ? 'current' : '';
          return '<div class="timeline-step ' + escapeHtml(className) + '">' +
            '<span class="timeline-dot"></span>' +
            '<div class="timeline-main"><strong>' + escapeHtml(step.label) + '</strong><small>' + escapeHtml(step.detail || '') + '</small></div>' +
            '<span class="timeline-time">' + escapeHtml(step.at ? relativeTime(step.at) : isCurrent ? 'now' : 'pending') + '</span>' +
          '</div>';
        }).join('') +
      '</section>';
    }

    function eventClass(type) {
      const text = String(type || '').toLowerCase();
      if (text.includes('failed')) return 'failed';
      if (text.includes('running') || text.includes('started') || text.includes('submitted') || text.includes('status')) return 'current';
      return 'done';
    }

    function renderJobEvents(events) {
      const rows = Array.isArray(events) ? events : [];
      if (!rows.length) {
        return '<section class="job"><h3>Runner Events</h3><div class="empty">No structured events captured for this job yet.</div></section>';
      }
      return '<section class="job"><h3>Runner Events</h3><div class="task-timeline">' +
        rows.map((event) => {
          return '<div class="timeline-step ' + escapeHtml(eventClass(event.type)) + '">' +
            '<span class="timeline-dot"></span>' +
            '<div class="timeline-main">' +
              '<strong>' + escapeHtml(event.type || 'event') + '</strong>' +
              '<small>' + escapeHtml(event.message || '') + '</small>' +
              (event.runnerId ? '<small>Runner: ' + escapeHtml(event.runnerId) + '</small>' : '') +
            '</div>' +
            '<span class="timeline-time">' + escapeHtml(relativeTime(event.createdAt)) + '</span>' +
          '</div>';
        }).join('') +
      '</div></section>';
    }

    function renderJobArtifacts(artifacts) {
      const rows = Array.isArray(artifacts) ? artifacts : [];
      if (!rows.length) {
        return '<section class="job"><h3>Artifacts</h3><div class="empty">No artifacts captured for this job yet.</div></section>';
      }
      return '<section class="job"><h3>Artifacts</h3><div class="artifact-list">' +
        rows.map((artifact) => {
          const link = artifact.url
            ? '<a href="' + escapeHtml(artifact.url) + '" target="_blank" rel="noreferrer">' + escapeHtml(artifact.url) + '</a>'
            : '';
          const content = artifact.content
            ? '<pre>' + escapeHtml(artifact.content) + '</pre>'
            : '';
          return '<div class="artifact-row">' +
            '<div class="row">' + renderBadge(artifact.type || 'artifact', 'idle') + '<strong>' + escapeHtml(artifact.label || 'Artifact') + '</strong></div>' +
            '<div class="mini">' + escapeHtml(relativeTime(artifact.createdAt)) + (artifact.runnerId ? ' · ' + escapeHtml(artifact.runnerId) : '') + '</div>' +
            link +
            content +
          '</div>';
        }).join('') +
      '</div></section>';
    }

    function renderSummary(runners, tasks, service, integrations, pool, poolService) {
      const activeRunners = runners.filter((runner) => runner.active && !runner.paused).length;
      const pausedRunners = runners.filter((runner) => runner.paused).length;
      const activeTasks = tasks.filter((task) => ['QUEUED', 'CLAIMED', 'RUNNING'].includes(task.status)).length;
      const failedTasks = tasks.filter((task) => task.status === 'FAILED').length;
      const codexCloudReady = runners.some((runner) => runner.codexCloudConfigured);
      const github = integrations?.github || {};
      const queuedWork = pool?.queue?.queued ?? tasks.filter((task) => task.status === 'QUEUED').length;
      const poolTarget = pool?.pool?.target ?? 0;
      const poolMax = pool?.config?.maxRunners ?? 0;
      const poolManagerActive = poolService?.active === 'active';
      const runnerServiceActive = service?.active === 'active';
      const poolActive = pool?.pool?.active ?? 0;
      const succeededTasks = tasks.filter((task) => task.status === 'SUCCEEDED').length;
      const latestTask = tasks.reduce((latest, task) => {
        if (!latest) return task;
        const latestTime = new Date(latest.createdAt || 0).getTime();
        const taskTime = new Date(task.createdAt || 0).getTime();
        return taskTime > latestTime ? task : latest;
      }, null);
      const hasServiceIssue = !runnerServiceActive || !poolManagerActive;
      const latestTaskFailed = latestTask?.status === 'FAILED';
      const fleetState = hasServiceIssue || latestTaskFailed
        ? 'Attention Needed'
        : activeTasks > 0 || queuedWork > 0
          ? 'Work in Progress'
          : 'Operational';
      const fleetClass = hasServiceIssue || latestTaskFailed ? 'alert' : activeTasks > 0 || queuedWork > 0 ? 'warning' : '';
      const fleetDotClass = hasServiceIssue || latestTaskFailed ? 'inactive' : activeTasks > 0 || queuedWork > 0 ? 'paused' : 'active';
      const poolUtilization = poolMax > 0
        ? Math.max(0, Math.min(100, Math.round((poolActive / poolMax) * 100)))
        : 0;
      summaryStripEl.innerHTML =
        '<article class="ops-overview">' +
          '<div class="ops-pane">' +
            '<div class="ops-state">' +
              '<div class="ops-orb ' + escapeHtml(fleetClass) + '"><span class="status-dot ' + escapeHtml(fleetDotClass) + '"></span></div>' +
              '<div class="ops-state-main">' +
                '<span class="ops-label">Runner Fleet</span>' +
                '<strong class="ops-title">' + escapeHtml(fleetState) + '</strong>' +
                '<span class="ops-copy">' + escapeHtml(activeRunners + ' active · ' + queuedWork + ' queued · pool ' + poolTarget + '/' + poolMax) + '</span>' +
                '<div class="ops-track" aria-label="Pool utilization"><span style="width: ' + escapeHtml(poolUtilization) + '%"></span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ops-pane">' +
            '<div class="ops-stat-rail">' +
              renderOpsStat('Runners', activeRunners, pausedRunners + ' paused') +
              renderOpsStat('Queue', queuedWork, activeTasks + ' open') +
              renderOpsStat('Pool', poolTarget + ' / ' + poolMax, poolActive + ' active') +
              renderOpsStat('Failures', failedTasks, succeededTasks + ' succeeded') +
            '</div>' +
          '</div>' +
          '<div class="ops-pane">' +
            '<div class="ops-system-list">' +
              '<div class="ops-system-group">' +
                '<span class="ops-system-heading">Execution</span>' +
                renderOpsSystem(renderBrandMark('codex'), 'Codex Cloud', codexCloudReady ? 'ready' : 'not configured', codexCloudReady) +
                renderOpsSystem(renderBrandMark('github'), 'GitHub CLI', github.authenticated ? (github.login || 'authenticated') : 'needs auth', github.authenticated) +
              '</div>' +
              '<div class="ops-divider"></div>' +
              '<div class="ops-system-group">' +
                '<span class="ops-system-heading">Services</span>' +
                renderOpsSystem(null, 'Runner service', service?.active || 'unknown', runnerServiceActive) +
                renderOpsSystem(null, 'Pool manager', poolService?.active || 'unknown', poolManagerActive) +
              '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
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
      const runnerService = getRunnerServiceView(runner);
      serviceStateEl.innerHTML = renderBadge(runnerService?.active || 'unknown', runnerService?.active === 'active' ? 'active' : 'inactive');
      const github = latestIntegrations.github || {};
      runnerMetricsEl.innerHTML =
        '<section class="control-summary">' +
          '<div class="control-summary-main">' +
            '<span class="status-dot ' + stateClass + '"></span>' +
            '<div><strong>' + escapeHtml(runner.status || 'unknown') + '</strong><span>Seen ' + escapeHtml(relativeTime(runner.lastSeenAt)) + '</span></div>' +
          '</div>' +
          renderBadge(runner.paused ? 'Paused' : runner.active ? 'Active' : 'Inactive', stateClass) +
        '</section>' +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Integrations</span></div>' +
          '<div class="integration-grid">' +
            renderIntegrationCard(
              'codex',
              runner.executionMode === 'cloud-hybrid' ? 'Codex Cloud' : 'Codex CLI',
              runner.codexCloudConfigured ? 'Ready' : 'Local',
              runner.executionMode === 'cloud-hybrid'
                ? 'Cloud task diffs are applied, verified, and published by this VPS runner.'
                : 'Local Codex CLI mode is available for direct runner work.',
              runner.codexCloudConfigured || runner.executionMode === 'local'
            ) +
            renderIntegrationCard(
              'github',
              github.login ? 'GitHub: ' + github.login : 'GitHub CLI',
              github.authenticated ? 'Ready' : 'Needs auth',
              github.authenticated
                ? (runner.githubCliBin || github.cli || 'gh') + ' is authenticated for clone, push, and pull request creation.'
                : github.statusText || 'gh auth status did not report an authenticated account.',
              github.authenticated,
              github.profileUrl
            ) +
          '</div>' +
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
        renderPoolControlSection(runner) +
        '<section class="control-section">' +
          '<div class="control-section-title"><span>Timing</span></div>' +
          '<div class="metric-list">' +
            renderMetricRow('Mode', runner.executionMode || 'local') +
            renderMetricRow('Cloud ready', runner.codexCloudConfigured ? 'yes' : 'no') +
            renderMetricRow('Poll interval', formatDurationMs(runner.pollIntervalMs)) +
            renderMetricRow('Cancel check', formatDurationMs(runner.cancelCheckIntervalMs)) +
            renderMetricRow('Heartbeat', formatDurationMs(runner.heartbeatIntervalMs)) +
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
      healthViewEl.classList.add('hidden');
      metricsViewEl.classList.add('hidden');
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
        const [data, preflight] = await Promise.all([
          requestJson(API.overview + '?' + params.toString()),
          requestJson(API.preflight).catch((error) => ({
            error: error.message || String(error)
          }))
        ]);
        if (!data) return;
        latestRunners = data.runners || [];
        latestTasks = data.tasks || [];
        latestService = data.service || {};
        latestPoolService = data.poolService || {};
        latestPool = data.pool || null;
        latestIntegrations = data.integrations || {};
        latestPreflight = preflight;
        renderSummary(latestRunners, latestTasks, latestService, latestIntegrations, latestPool, latestPoolService);
        renderPreflight();
        generatedEl.textContent = 'Updated ' + new Date(data.generatedAt).toLocaleString();
        runnersEl.innerHTML = latestRunners.length ? latestRunners.map(renderRunner).join('') : '<div class="empty">No runner heartbeat files found yet.</div>';
        if (selectedRunnerId) {
          await loadRunnerHistory(selectedRunnerId, false);
          renderSelectedRunner();
        } else if (currentView === 'health') {
          await loadVpsHealth(false);
          renderVpsHealth();
        } else if (currentView === 'metrics') {
          await loadMetrics(false);
          renderMetrics();
        }
      } catch (error) {
        generatedEl.textContent = 'Unable to refresh';
        latestPreflight = { error: error.message || String(error) };
        renderPreflight();
        runnersEl.innerHTML = '<div class="error">' + escapeHtml(error.message || error) + '</div>';
      }
    }

    async function loadVpsHealth(render = true) {
      const data = await requestJson(API.vpsHealth);
      if (!data) return;
      latestHealth = data;
      if (render) renderVpsHealth();
    }

    async function loadMetrics(render = true) {
      const params = new URLSearchParams();
      params.set('days', metricsRangeEl.value || '30');
      const data = await requestJson(API.metrics + '?' + params.toString());
      if (!data) return;
      latestMetrics = data;
      if (render) renderMetrics();
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
      currentView = 'runner';
      selectedRunnerId = runnerId;
      window.location.hash = 'runner=' + encodeURIComponent(runnerId);
      logsEl.textContent = 'Select Refresh to load runner service logs.';
      logStatusEl.textContent = 'Logs load on demand.';
      await loadRunnerHistory(runnerId, false);
      renderSelectedRunner();
    }

    async function openHealth() {
      currentView = 'health';
      selectedRunnerId = null;
      runnerHistory = [];
      window.location.hash = 'health';
      landingViewEl.classList.add('hidden');
      detailViewEl.classList.add('hidden');
      metricsViewEl.classList.add('hidden');
      healthViewEl.classList.remove('hidden');
      healthContentEl.innerHTML = '<div class="empty">Loading VPS health...</div>';
      await loadVpsHealth();
    }

    async function openMetrics() {
      currentView = 'metrics';
      selectedRunnerId = null;
      runnerHistory = [];
      window.location.hash = 'metrics';
      landingViewEl.classList.add('hidden');
      detailViewEl.classList.add('hidden');
      healthViewEl.classList.add('hidden');
      metricsViewEl.classList.remove('hidden');
      metricsContentEl.innerHTML = '<div class="empty">Loading runner metrics...</div>';
      await loadMetrics();
    }

    function closeRunner() {
      currentView = 'landing';
      selectedRunnerId = null;
      runnerHistory = [];
      window.location.hash = '';
      detailViewEl.classList.add('hidden');
      healthViewEl.classList.add('hidden');
      metricsViewEl.classList.add('hidden');
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
        renderTaskBacklinks(task) +
        renderTaskTimeline(task) +
        renderJobEvents(task.events) +
        renderJobArtifacts(task.artifacts) +
        '<div class="grid">' +
          renderField('Status', task.status) +
          renderField('Repository', task.targetRepository, true) +
          renderField('Base branch', task.baseBranch, true) +
          renderField('Branch', task.branchName, true) +
          renderField('Runner', task.runnerId, true) +
          renderField('Retry count', (task.retryCount || 0) + ' / ' + (task.maxRetries ?? 0)) +
          renderField('Failure category', task.failureCategory || 'none') +
          renderField('Lease expires', task.leaseExpiresAt ? relativeTime(task.leaseExpiresAt) : 'none') +
          renderField('Heartbeat', task.lastHeartbeatAt ? relativeTime(task.lastHeartbeatAt) : 'none') +
          renderField('Created', relativeTime(task.createdAt)) +
          renderField('Updated', relativeTime(task.updatedAt)) +
        '</div>' +
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
      try {
        if (!button) {
          const runnerCard = event.target.closest('[data-runner-card-open]');
          if (runnerCard) await openRunner(runnerCard.dataset.runnerCardOpen);
          return;
        }
        if (button.hasAttribute('data-refresh')) {
          await refresh();
        } else if (button.hasAttribute('data-open-preflight')) {
          preflightModalEl.hidden = false;
          if (!latestPreflight || latestPreflight.error) {
            latestPreflight = await requestJson(API.preflight);
          }
          renderPreflight();
        } else if (button.hasAttribute('data-preflight-refresh')) {
          latestPreflight = await requestJson(API.preflight);
          renderPreflight();
        } else if (button.hasAttribute('data-pool-self-test')) {
          if (!window.confirm('Run a safe pool launch self-test? This starts one paused template runner, verifies its heartbeat, then stops it without allowing it to claim jobs.')) return;
          latestPoolSelfTest = await requestJson(API.poolSelfTest, {
            method: 'POST',
            body: JSON.stringify({})
          });
          latestPreflight = await requestJson(API.preflight);
          renderPreflight();
        } else if (button.hasAttribute('data-smoke-test')) {
          const smoke = latestPreflight?.smokeTest || {};
          const target = (smoke.repository || '${escapeJsString(config.defaultRepository)}') + ':' + (smoke.baseBranch || '${escapeJsString(config.defaultBaseBranch)}');
          if (!window.confirm('Queue a safe smoke-test run against ' + target + '? This creates or updates only .nexus/runner-smoke-test.md and opens a GitHub PR.')) return;
          const data = await requestJson(API.smokeTest, {
            method: 'POST',
            body: JSON.stringify({})
          });
          await refresh();
          if (data?.job?.id) await showTaskDetail(data.job.id);
        } else if (button.hasAttribute('data-open-create')) {
          createStatusEl.textContent = '';
          createModalEl.hidden = false;
        } else if (button.hasAttribute('data-open-health')) {
          await openHealth();
        } else if (button.hasAttribute('data-open-metrics')) {
          await openMetrics();
        } else if (button.hasAttribute('data-health-refresh')) {
          await loadVpsHealth();
        } else if (button.hasAttribute('data-metrics-refresh')) {
          await loadMetrics();
        } else if (button.hasAttribute('data-create-close')) {
          createModalEl.hidden = true;
        } else if (button.hasAttribute('data-preflight-close')) {
          preflightModalEl.hidden = true;
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
        } else if (button.dataset.poolAction) {
          const action = button.dataset.poolAction;
          if (!window.confirm(action + ' the runner pool manager?')) return;
          await requestJson(API.poolControl, {
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
    preflightModalEl.addEventListener('click', (event) => {
      if (event.target === preflightModalEl) preflightModalEl.hidden = true;
    });
    detailModalEl.addEventListener('click', (event) => {
      if (event.target === detailModalEl) detailModalEl.hidden = true;
    });
    detailStatusFilterEl.addEventListener('change', () => {
      if (selectedRunnerId) loadRunnerHistory(selectedRunnerId);
    });
    metricsRangeEl.addEventListener('change', () => {
      if (currentView === 'metrics') loadMetrics();
    });

    refresh().then(() => {
      const hashMatch = window.location.hash.match(/^#runner=(.+)$/);
      if (hashMatch) {
        openRunner(decodeURIComponent(hashMatch[1]));
      } else if (window.location.hash === '#health') {
        openHealth();
      } else if (window.location.hash === '#metrics') {
        openMetrics();
      }
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
  <title>Nexus Runners</title>
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
    statusMessage: stringOrNull(value.statusMessage),
    executionMode: stringOrNull(value.executionMode),
    codexCloud: normalizeCodexCloud(value.codexCloud),
    createdAt: stringOrNull(value.createdAt)
  };
}

function normalizeCodexCloud(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    taskId: stringOrNull(value.taskId),
    taskUrl: stringOrNull(value.taskUrl),
    envId: stringOrNull(value.envId),
    attempts: numberOrNull(value.attempts),
    status: stringOrNull(value.status),
    normalizedStatus: stringOrNull(value.normalizedStatus),
    submittedAt: stringOrNull(value.submittedAt),
    lastCheckedAt: stringOrNull(value.lastCheckedAt),
    completedAt: stringOrNull(value.completedAt),
    applyingAt: stringOrNull(value.applyingAt),
    appliedAt: stringOrNull(value.appliedAt)
  };
}

function sanitizeGitHubCliOutput(value) {
  return String(value || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*-\s*Token:/i.test(line))
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function parseGitHubLogin(value) {
  return stringOrNull(String(value || '').match(/\baccount\s+([^\s(]+)/i)?.[1]);
}

function parseGitHubProtocol(value) {
  return stringOrNull(String(value || '').match(/Git operations protocol:\s*([^\s]+)/i)?.[1]);
}

function parseGitHubScopes(value) {
  const scopes = String(value || '').match(/Token scopes:\s*(.+)$/im)?.[1];
  if (!scopes) {
    return [];
  }
  return scopes
    .split(',')
    .map((scope) => scope.replace(/['"`]/g, '').trim())
    .filter(Boolean);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function readTextIfExists(path) {
  if (!existsSync(path)) {
    return '';
  }
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function readTrimmedSysFile(path) {
  const value = await readTextIfExists(path);
  return value.trim() || null;
}

async function readSysNumber(path) {
  return parseSysNumber(await readTrimmedSysFile(path));
}

function parseSysNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseKeyValueBytes(value) {
  const result = {};
  for (const line of String(value || '').split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s+(\d+)\s*kB/i);
    if (match) {
      result[match[1]] = Number(match[2]) * 1024;
    }
  }
  return result;
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

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}
