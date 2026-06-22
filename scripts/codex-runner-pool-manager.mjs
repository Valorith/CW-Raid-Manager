#!/usr/bin/env node
import { execFile } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises';
import { hostname } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(scriptDir, 'codex-runner-pool.env'));

const workRoot = resolve(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work'));
const registryDir = resolve(process.env.CODEX_RUNNER_REGISTRY_DIR || join(workRoot, 'runners'));
const controlDir = resolve(process.env.CODEX_RUNNER_CONTROL_DIR || join(workRoot, 'runner-controls'));

const config = {
  nexusBaseUrl: requireEnv('NEXUS_BASE_URL').replace(/\/+$/, ''),
  token: requireEnv('CODEX_RUNNER_TOKEN'),
  poolPrefix: sanitizeInstanceName(process.env.CODEX_RUNNER_POOL_PREFIX || 'vps-codex-runner-pool'),
  minRunners: parseNonNegativeInt(process.env.CODEX_RUNNER_POOL_MIN, 0),
  maxRunners: parsePositiveInt(process.env.CODEX_RUNNER_POOL_MAX, 2),
  backlogPerRunner: parsePositiveInt(process.env.CODEX_RUNNER_POOL_SCALE_UP_BACKLOG_PER_RUNNER, 1),
  pollIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_POOL_POLL_INTERVAL_MS, 15_000),
  idleTtlMs: parsePositiveInt(process.env.CODEX_RUNNER_POOL_IDLE_TTL_MS, 10 * 60 * 1000),
  staleAfterMs: parsePositiveInt(process.env.CODEX_RUNNER_POOL_STALE_AFTER_MS, 60_000),
  stateFile: resolve(process.env.CODEX_RUNNER_POOL_STATE_FILE || join(workRoot, 'runner-pool.json')),
  templateServiceName: process.env.CODEX_RUNNER_POOL_TEMPLATE_SERVICE || 'nexus-codex-runner@.service',
  dryRun: parseBoolean(process.env.CODEX_RUNNER_POOL_DRY_RUN, false),
  workRoot,
  registryDir,
  controlDir
};

if (config.minRunners > config.maxRunners) {
  throw new Error('CODEX_RUNNER_POOL_MIN cannot be greater than CODEX_RUNNER_POOL_MAX.');
}

const runOnce = process.argv.includes('--once');
let shuttingDown = false;
let latestActions = [];

process.on('SIGINT', () => {
  shuttingDown = true;
});
process.on('SIGTERM', () => {
  shuttingDown = true;
});

await mkdir(config.registryDir, { recursive: true });
await mkdir(dirname(config.stateFile), { recursive: true });

console.log(
  `Nexus runner pool manager watching ${config.nexusBaseUrl} for ${config.poolPrefix}-1..${config.poolPrefix}-${config.maxRunners}`
);

if (runOnce) {
  await scaleOnce();
  process.exit(0);
}

while (!shuttingDown) {
  await scaleOnce().catch(async (error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    await writePoolState({
      generatedAt: new Date().toISOString(),
      hostname: hostname(),
      ok: false,
      error: message,
      config: serializeConfig(),
      queue: null,
      pool: null,
      instances: [],
      actions: latestActions
    }).catch((writeError) => {
      console.error(writeError instanceof Error ? writeError.stack || writeError.message : writeError);
    });
  });
  await sleep(config.pollIntervalMs);
}

async function scaleOnce() {
  const generatedAt = new Date().toISOString();
  const recovery = await recoverStaleJobs();
  const [jobs, heartbeats] = await Promise.all([listActiveJobs(), listRunnerHeartbeats()]);
  const queue = summarizeQueue(jobs);
  const desiredIds = buildDesiredRunnerIds();
  const heartbeatById = new Map(heartbeats.map((runner) => [runner.runnerId, runner]));
  const units = await Promise.all(
    desiredIds.map(async (runnerId, index) => {
      const unit = instantiateTemplateService(config.templateServiceName, runnerId);
      const service = await getServiceState(unit);
      const heartbeat = heartbeatById.get(runnerId) || null;
      return {
        runnerId,
        ordinal: index + 1,
        unit,
        service,
        heartbeat,
        poolManaged: true
      };
    })
  );
  const busyCount = units.filter((unit) => isBusyHeartbeat(unit.heartbeat)).length;
  const target = clamp(
    Math.max(
      config.minRunners,
      busyCount + Math.ceil(queue.queued / config.backlogPerRunner)
    ),
    config.minRunners,
    config.maxRunners
  );
  const actions = [];

  for (let index = 0; index < target; index += 1) {
    const unit = units[index];
    if (!isServiceActive(unit.service)) {
      const result = await runSystemctl('start', unit.unit);
      actions.push({
        action: 'start',
        runnerId: unit.runnerId,
        unit: unit.unit,
        dryRun: config.dryRun,
        ok: result.ok,
        output: trimCommandOutput(result.output),
        at: new Date().toISOString()
      });
    }
  }

  for (let index = units.length - 1; index >= target; index -= 1) {
    const unit = units[index];
    if (!isServiceActive(unit.service)) {
      continue;
    }
    const heartbeat = unit.heartbeat;
    if (!heartbeat || heartbeat.stale) {
      const result = await runSystemctl('stop', unit.unit);
      actions.push({
        action: 'stop',
        runnerId: unit.runnerId,
        unit: unit.unit,
        dryRun: config.dryRun,
        ok: result.ok,
        output: trimCommandOutput(result.output),
        reason: heartbeat ? 'stale-heartbeat' : 'missing-heartbeat',
        at: new Date().toISOString()
      });
      continue;
    }
    if (!isIdleHeartbeat(heartbeat)) {
      continue;
    }
    const idleMs = Math.max(0, Date.now() - (parseDateMs(heartbeat.lastPollAt) || parseDateMs(heartbeat.lastSeenAt) || 0));
    if (idleMs < config.idleTtlMs) {
      continue;
    }
    const result = await runSystemctl('stop', unit.unit);
    actions.push({
      action: 'stop',
      runnerId: unit.runnerId,
      unit: unit.unit,
      dryRun: config.dryRun,
      ok: result.ok,
      output: trimCommandOutput(result.output),
      idleMs,
      at: new Date().toISOString()
    });
  }

  latestActions = [...actions, ...latestActions].slice(0, 20);

  const refreshedUnits = actions.length
    ? await Promise.all(
        desiredIds.map(async (runnerId, index) => {
          const unit = instantiateTemplateService(config.templateServiceName, runnerId);
          return {
            runnerId,
            ordinal: index + 1,
            unit,
            service: await getServiceState(unit),
            heartbeat: heartbeatById.get(runnerId) || null,
            poolManaged: true
          };
        })
      )
    : units;

  await writePoolState({
    generatedAt,
    hostname: hostname(),
    ok: true,
    config: serializeConfig(),
    queue,
    recovery,
    pool: {
      target,
      busy: busyCount,
      active: refreshedUnits.filter((unit) => isServiceActive(unit.service)).length,
      idle: refreshedUnits.filter((unit) => isIdleHeartbeat(unit.heartbeat)).length,
      stale: refreshedUnits.filter((unit) => unit.heartbeat?.stale).length
    },
    instances: refreshedUnits.map((unit, index) => serializeInstance(unit, index < target)),
    actions: latestActions
  });
}

async function recoverStaleJobs() {
  const body = await nexusPost('/jobs/recover-stale', {});
  return {
    recovered: Array.isArray(body.recovered) ? body.recovered.length : 0,
    failed: Array.isArray(body.failed) ? body.failed.length : 0
  };
}

async function listActiveJobs() {
  const params = new URLSearchParams({
    status: 'QUEUED,CLAIMED,RUNNING',
    limit: '200'
  });
  const body = await nexusGet(`/jobs?${params.toString()}`);
  return Array.isArray(body.jobs) ? body.jobs : [];
}

function summarizeQueue(jobs) {
  const counts = {
    queued: 0,
    claimed: 0,
    running: 0,
    total: jobs.length
  };

  for (const job of jobs) {
    const status = String(job.status || '').toUpperCase();
    if (status === 'QUEUED') counts.queued += 1;
    if (status === 'CLAIMED') counts.claimed += 1;
    if (status === 'RUNNING') counts.running += 1;
  }

  return counts;
}

async function listRunnerHeartbeats() {
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
      if (!runnerId.startsWith(config.poolPrefix)) {
        continue;
      }
      const lastSeenMs = parseDateMs(data.lastSeenAt) || stats.mtimeMs;
      const ageMs = Math.max(0, now - lastSeenMs);
      runners.push({
        runnerId,
        status: String(data.status || 'unknown'),
        active: ageMs <= config.staleAfterMs,
        stale: ageMs > config.staleAfterMs,
        ageMs,
        lastSeenAt: toIso(lastSeenMs),
        lastPollAt: typeof data.lastPollAt === 'string' ? data.lastPollAt : null,
        currentJob: data.currentJob && typeof data.currentJob === 'object' ? data.currentJob : null,
        jobsProcessed: numberOrZero(data.jobsProcessed)
      });
    } catch (error) {
      runners.push({
        runnerId: entry.name.replace(/\.json$/, ''),
        status: 'unreadable',
        active: false,
        stale: true,
        ageMs: null,
        lastSeenAt: null,
        lastPollAt: null,
        currentJob: null,
        jobsProcessed: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return runners;
}

function buildDesiredRunnerIds() {
  return Array.from({ length: config.maxRunners }, (_value, index) => `${config.poolPrefix}-${index + 1}`);
}

function isBusyHeartbeat(heartbeat) {
  if (!heartbeat || heartbeat.stale) {
    return false;
  }
  if (heartbeat.currentJob) {
    return true;
  }
  return ['processing', 'running'].includes(String(heartbeat.status || '').toLowerCase());
}

function isIdleHeartbeat(heartbeat) {
  if (!heartbeat || heartbeat.stale) {
    return false;
  }
  if (heartbeat.currentJob) {
    return false;
  }
  return ['idle', 'paused', 'polling'].includes(String(heartbeat.status || '').toLowerCase());
}

function serializeInstance(unit, desired) {
  return {
    runnerId: unit.runnerId,
    unit: unit.unit,
    desired,
    active: isServiceActive(unit.service),
    service: unit.service,
    heartbeat: unit.heartbeat
      ? {
          status: unit.heartbeat.status,
          active: unit.heartbeat.active,
          stale: unit.heartbeat.stale,
          ageMs: unit.heartbeat.ageMs,
          lastSeenAt: unit.heartbeat.lastSeenAt,
          lastPollAt: unit.heartbeat.lastPollAt,
          currentJob: unit.heartbeat.currentJob,
          jobsProcessed: unit.heartbeat.jobsProcessed,
          error: unit.heartbeat.error || null
        }
      : null
  };
}

async function getServiceState(unitName) {
  const [active, enabled] = await Promise.all([
    runExecFile('systemctl', ['is-active', unitName], {
      allowNonZero: true,
      timeoutMs: 10_000
    }),
    runExecFile('systemctl', ['is-enabled', unitName], {
      allowNonZero: true,
      timeoutMs: 10_000
    })
  ]);

  return {
    name: unitName,
    active: active.stdout.trim() || active.stderr.trim() || 'unknown',
    enabled: enabled.stdout.trim() || enabled.stderr.trim() || 'unknown'
  };
}

function isServiceActive(service) {
  return service?.active === 'active' || service?.active === 'activating';
}

async function runSystemctl(action, unitName) {
  if (config.dryRun) {
    return {
      ok: true,
      output: `dry-run: systemctl ${action} ${unitName}`
    };
  }

  const result = await runExecFile('sudo', ['-n', 'systemctl', action, unitName], {
    allowNonZero: true,
    timeoutMs: 45_000
  });
  return {
    ok: result.code === 0,
    output: result.stdout || result.stderr || ''
  };
}

async function nexusGet(path) {
  const response = await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
    headers: {
      authorization: `Bearer ${config.token}`
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || body?.message || text || `Nexus responded with ${response.status}.`);
  }
  return body || {};
}

async function nexusPost(path, body) {
  const response = await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error || parsed?.message || text || `Nexus responded with ${response.status}.`);
  }
  return parsed || {};
}

async function writePoolState(state) {
  const tempFile = `${config.stateFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tempFile, config.stateFile);
}

function serializeConfig() {
  return {
    poolPrefix: config.poolPrefix,
    minRunners: config.minRunners,
    maxRunners: config.maxRunners,
    backlogPerRunner: config.backlogPerRunner,
    pollIntervalMs: config.pollIntervalMs,
    idleTtlMs: config.idleTtlMs,
    staleAfterMs: config.staleAfterMs,
    stateFile: config.stateFile,
    templateServiceName: config.templateServiceName,
    dryRun: config.dryRun
  };
}

function instantiateTemplateService(templateServiceName, instanceName) {
  const safeInstance = sanitizeInstanceName(instanceName);
  if (templateServiceName.includes('@.')) {
    return templateServiceName.replace('@.', `@${safeInstance}.`);
  }
  if (templateServiceName.endsWith('@')) {
    return `${templateServiceName}${safeInstance}.service`;
  }
  return `nexus-codex-runner@${safeInstance}.service`;
}

function runExecFile(file, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      file,
      args,
      {
        timeout: options.timeoutMs || 30_000,
        maxBuffer: options.maxBuffer || 1_000_000
      },
      (error, stdout, stderr) => {
        const code = typeof error?.code === 'number' ? error.code : 0;
        if (error && !options.allowNonZero) {
          reject(
            new Error(
              `${file} ${args.join(' ')} failed: ${stderr || stdout || error.message}`
            )
          );
          return;
        }
        resolvePromise({
          code,
          stdout: String(stdout || ''),
          stderr: String(stderr || '')
        });
      }
    );
    child.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function sanitizeInstanceName(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'runner';
}

function parseDateMs(value) {
  if (!value) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toIso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function trimCommandOutput(value) {
  return String(value || '').trim().slice(0, 2_000);
}
