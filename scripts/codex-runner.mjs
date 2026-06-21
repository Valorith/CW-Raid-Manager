#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { hostname } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(scriptDir, 'codex-runner.env'));

const config = {
  nexusBaseUrl: requireEnv('NEXUS_BASE_URL').replace(/\/+$/, ''),
  token: requireEnv('CODEX_RUNNER_TOKEN'),
  runnerId: process.env.CODEX_RUNNER_ID || `${hostname()}-codex-runner`,
  workRoot: resolve(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work')),
  registryDir: resolve(
    process.env.CODEX_RUNNER_REGISTRY_DIR ||
      join(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work'), 'runners')
  ),
  codexBin: process.env.CODEX_BIN || 'codex',
  codexHome: process.env.CODEX_HOME || undefined,
  pollIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_POLL_INTERVAL_MS, 15_000),
  heartbeatIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_HEARTBEAT_INTERVAL_MS, 5_000),
  draftPr: parseBoolean(process.env.CODEX_RUNNER_DRAFT_PR, false),
  verifyCommand: process.env.CODEX_RUNNER_VERIFY_COMMAND || '',
  gitUserName: process.env.GIT_AUTHOR_NAME || 'Nexus Codex Runner',
  gitUserEmail: process.env.GIT_AUTHOR_EMAIL || 'codex-runner@local'
};

const runOnce = process.argv.includes('--once');
let active = false;
let shuttingDown = false;
const runnerStartedAt = new Date().toISOString();
const heartbeatFile = join(config.registryDir, `${sanitizeFileName(config.runnerId)}.json`);
const runnerState = {
  runnerId: config.runnerId,
  hostname: hostname(),
  pid: process.pid,
  status: 'starting',
  startedAt: runnerStartedAt,
  lastSeenAt: runnerStartedAt,
  lastPollAt: null,
  lastClaimAt: null,
  lastJobCompletedAt: null,
  currentJob: null,
  lastError: null,
  jobsProcessed: 0,
  nexusBaseUrl: config.nexusBaseUrl,
  pollIntervalMs: config.pollIntervalMs,
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  workRoot: config.workRoot
};

process.on('SIGINT', () => {
  shuttingDown = true;
  runnerState.status = 'stopping';
  void writeHeartbeat();
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  runnerState.status = 'stopping';
  void writeHeartbeat();
});

await mkdir(config.workRoot, { recursive: true });
await mkdir(config.registryDir, { recursive: true });
await writeHeartbeat();

if (runOnce) {
  const claimed = await pollOnce();
  runnerState.status = 'stopped';
  await writeHeartbeat();
  process.exit(claimed ? 0 : 2);
}

const heartbeatTimer = setInterval(() => {
  void writeHeartbeat();
}, config.heartbeatIntervalMs);

console.log(
  `Nexus Codex runner ${config.runnerId} polling ${config.nexusBaseUrl} every ${config.pollIntervalMs}ms`
);

while (!shuttingDown) {
  await pollOnce();
  await sleep(config.pollIntervalMs);
}

clearInterval(heartbeatTimer);
runnerState.status = 'stopped';
await writeHeartbeat();

async function pollOnce() {
  if (active) {
    return false;
  }

  active = true;
  runnerState.status = 'polling';
  runnerState.lastPollAt = new Date().toISOString();
  await writeHeartbeat();
  try {
    const job = await claimJob();
    if (!job) {
      runnerState.status = 'idle';
      runnerState.currentJob = null;
      runnerState.lastError = null;
      await writeHeartbeat();
      return false;
    }
    runnerState.status = 'processing';
    runnerState.lastClaimAt = new Date().toISOString();
    runnerState.currentJob = summarizeJob(job);
    await writeHeartbeat();
    await processJob(job);
    runnerState.jobsProcessed += 1;
    runnerState.lastJobCompletedAt = new Date().toISOString();
    runnerState.currentJob = null;
    runnerState.status = 'idle';
    await writeHeartbeat();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    runnerState.status = 'error';
    runnerState.lastError = message;
    await writeHeartbeat();
    console.error(message);
    return false;
  } finally {
    active = false;
  }
}

async function claimJob() {
  const response = await apiPost('/jobs/claim', {
    runnerId: config.runnerId
  });
  return response.job;
}

async function processJob(job) {
  const jobDir = join(config.workRoot, job.id);
  const repoDir = join(jobDir, 'repo');
  const promptPath = join(jobDir, 'prompt.md');
  const lastMessagePath = join(jobDir, 'codex-last-message.md');
  const logPath = join(jobDir, 'runner.log');
  const prBodyPath = join(jobDir, 'pull-request.md');

  await rm(jobDir, { recursive: true, force: true });
  await mkdir(jobDir, { recursive: true });
  await writeFile(promptPath, job.prompt, 'utf8');

  try {
    await updateJob(job.id, {
      status: 'RUNNING',
      statusMessage: 'Cloning repository on the VPS runner.'
    });

    await runCommand(
      'gh',
      [
        'repo',
        'clone',
        job.targetRepository,
        repoDir,
        '--',
        '--branch',
        job.baseBranch,
        '--single-branch'
      ],
      { cwd: jobDir, logPath }
    );

    await runCommand('git', ['checkout', '-b', job.branchName], { cwd: repoDir, logPath });
    await runCommand('git', ['config', 'user.name', config.gitUserName], { cwd: repoDir, logPath });
    await runCommand('git', ['config', 'user.email', config.gitUserEmail], {
      cwd: repoDir,
      logPath
    });

    await updateJob(job.id, {
      status: 'RUNNING',
      statusMessage: 'Running Codex against the crash report.'
    });

    const codexArgs = [
      '-a',
      'never',
      'exec',
      '--cd',
      repoDir,
      '--sandbox',
      'workspace-write',
      '--output-last-message',
      lastMessagePath,
      job.prompt
    ];
    await runCommand(config.codexBin, codexArgs, {
      cwd: repoDir,
      logPath,
      env: config.codexHome ? { CODEX_HOME: config.codexHome } : undefined,
      displayCommand: `${config.codexBin} -a never exec --cd ${repoDir} --sandbox workspace-write --output-last-message ${lastMessagePath} <prompt>`
    });

    if (config.verifyCommand) {
      await updateJob(job.id, {
        status: 'RUNNING',
        statusMessage: `Running verification command: ${config.verifyCommand}`
      });
      await runShell(config.verifyCommand, { cwd: repoDir, logPath });
    }

    const status = await runCommand('git', ['status', '--porcelain'], {
      cwd: repoDir,
      logPath
    });
    if (!status.stdout.trim()) {
      throw new Error('Codex completed without leaving any repository changes to commit.');
    }

    await updateJob(job.id, {
      status: 'RUNNING',
      statusMessage: 'Committing Codex changes and opening a pull request.'
    });

    await runCommand('git', ['add', '-A'], { cwd: repoDir, logPath });
    await runCommand('git', ['commit', '-m', buildCommitMessage(job)], {
      cwd: repoDir,
      logPath
    });
    await runCommand('git', ['push', '--set-upstream', 'origin', job.branchName], {
      cwd: repoDir,
      logPath
    });

    const codexLastMessage = await readTextIfExists(lastMessagePath);
    await writeFile(prBodyPath, buildPullRequestBody(job, codexLastMessage), 'utf8');

    const prArgs = [
      'pr',
      'create',
      '--repo',
      job.targetRepository,
      '--base',
      job.baseBranch,
      '--head',
      job.branchName,
      '--title',
      buildPullRequestTitle(job),
      '--body-file',
      prBodyPath
    ];
    if (config.draftPr) {
      prArgs.push('--draft');
    }

    const pr = await runCommand('gh', prArgs, { cwd: repoDir, logPath });
    const prUrl = extractPullRequestUrl(pr.stdout);

    await updateJob(job.id, {
      status: 'SUCCEEDED',
      statusMessage: prUrl ? `Pull request created: ${prUrl}` : 'Pull request created.',
      output: truncate(await readTextIfExists(logPath), 500_000),
      prUrl,
      prNumber: extractPullRequestNumber(prUrl),
      result: {
        branchName: job.branchName,
        pullRequestUrl: prUrl,
        draft: config.draftPr
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(job.id, {
      status: 'FAILED',
      statusMessage: 'Codex runner failed.',
      error: message,
      output: truncate(await readTextIfExists(logPath), 500_000)
    });
  }
}

async function apiPost(path, body) {
  const response = await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nexus API ${path} responded with ${response.status}: ${text}`);
  }

  return response.json();
}

async function updateJob(jobId, patch) {
  try {
    await apiPost(`/jobs/${encodeURIComponent(jobId)}/status`, {
      runnerId: config.runnerId,
      ...patch
    });
  } catch (error) {
    console.error(
      `Failed to update Nexus Codex job ${jobId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function runCommand(command, args, options) {
  return runProcess(command, args, {
    ...options,
    shell: false
  });
}

function runShell(command, options) {
  return runProcess(command, [], {
    ...options,
    shell: true
  });
}

function runProcess(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      shell: options.shell,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const startedAt = new Date().toISOString();
    const rendered =
      options.displayCommand || (options.shell ? command : [command, ...args].map(shellQuote).join(' '));

    void appendFile(options.logPath, `\n[${startedAt}] $ ${rendered}\n`, 'utf8');

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      void appendFile(options.logPath, text, 'utf8');
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      void appendFile(options.logPath, text, 'utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${rendered} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

function buildCommitMessage(job) {
  const shortId = (job.messageId || job.id).slice(-8);
  return `fix: address Nexus crash report ${shortId}`;
}

function buildPullRequestTitle(job) {
  const shortId = (job.messageId || job.id).slice(-8);
  return `Fix Nexus crash report ${shortId}`;
}

function buildPullRequestBody(job, codexLastMessage) {
  return [
    '## Summary',
    '- Automated Nexus Codex runner PR for a Webhook Inbox crash report.',
    `- Nexus job: ${job.id}`,
    job.messageId ? `- Nexus message: ${job.messageId}` : null,
    '',
    '## Runner Safety',
    '- Work was performed on an isolated runner branch.',
    '- The base branch was not mutated directly.',
    '- If this PR is rejected, deleting the PR branch removes the persistent code change.',
    '',
    '## Codex Notes',
    truncate(codexLastMessage || 'Codex did not write a final message.', 20_000)
  ]
    .filter(Boolean)
    .join('\n');
}

function extractPullRequestUrl(stdout) {
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0] ?? null;
}

function extractPullRequestNumber(url) {
  const match = url?.match(/\/pull\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function writeHeartbeat() {
  const now = new Date().toISOString();
  const body = {
    ...runnerState,
    lastSeenAt: now
  };
  runnerState.lastSeenAt = now;
  const tempFile = `${heartbeatFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  await rename(tempFile, heartbeatFile);
}

function summarizeJob(job) {
  return {
    id: job.id,
    messageId: job.messageId,
    targetRepository: job.targetRepository,
    baseBranch: job.baseBranch,
    branchName: job.branchName,
    status: job.status,
    createdAt: job.createdAt
  };
}

function sanitizeFileName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'runner';
}

async function readTextIfExists(path) {
  if (!existsSync(path)) {
    return '';
  }
  return readFile(path, 'utf8');
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
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... truncated by Nexus Codex runner ...`;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
