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

const runnerId = process.env.CODEX_RUNNER_ID || `${hostname()}-codex-runner`;
const workRoot = resolve(process.env.CODEX_RUNNER_WORK_ROOT || join(process.cwd(), 'work'));
const registryDir = resolve(
  process.env.CODEX_RUNNER_REGISTRY_DIR || join(workRoot, 'runners')
);
const controlDir = resolve(
  process.env.CODEX_RUNNER_CONTROL_DIR || join(workRoot, 'runner-controls')
);

const config = {
  nexusBaseUrl: requireEnv('NEXUS_BASE_URL').replace(/\/+$/, ''),
  token: requireEnv('CODEX_RUNNER_TOKEN'),
  runnerId,
  workRoot,
  registryDir,
  controlDir,
  controlFile: resolve(
    process.env.CODEX_RUNNER_CONTROL_FILE || join(controlDir, `${sanitizeFileName(runnerId)}.json`)
  ),
  codexBin: process.env.CODEX_BIN || 'codex',
  codexHome: process.env.CODEX_HOME || undefined,
  githubCliBin: process.env.GITHUB_CLI_BIN || process.env.GH_BIN || 'gh',
  executionMode: normalizeExecutionMode(
    process.env.CODEX_RUNNER_EXECUTION_MODE || process.env.CODEX_RUNNER_MODE || 'local'
  ),
  codexCloudEnvId: process.env.CODEX_CLOUD_ENV_ID || process.env.CODEX_RUNNER_CLOUD_ENV_ID || '',
  codexCloudEnvByRepo: parseRepoEnvMap(
    process.env.CODEX_CLOUD_ENV_BY_REPO || process.env.CODEX_RUNNER_CLOUD_ENV_BY_REPO || ''
  ),
  codexCloudAttempts: parsePositiveInt(process.env.CODEX_CLOUD_ATTEMPTS, 1),
  codexCloudPollIntervalMs: parsePositiveInt(process.env.CODEX_CLOUD_POLL_INTERVAL_MS, 15_000),
  codexCloudTimeoutMs: parsePositiveInt(process.env.CODEX_CLOUD_TIMEOUT_MS, 2 * 60 * 60 * 1000),
  pollIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_POLL_INTERVAL_MS, 15_000),
  heartbeatIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_HEARTBEAT_INTERVAL_MS, 5_000),
  cancelCheckIntervalMs: parsePositiveInt(process.env.CODEX_RUNNER_CANCEL_CHECK_INTERVAL_MS, 5_000),
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
  executionMode: config.executionMode,
  codexCloudConfigured: Boolean(config.codexCloudEnvId || config.codexCloudEnvByRepo.size),
  githubCliBin: config.githubCliBin,
  pollIntervalMs: config.pollIntervalMs,
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  cancelCheckIntervalMs: config.cancelCheckIntervalMs,
  workRoot: config.workRoot,
  controlFile: config.controlFile,
  control: null
};
let heartbeatWriteChain = Promise.resolve();
let heartbeatWriteSequence = 0;

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
await mkdir(config.controlDir, { recursive: true });
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
  `Nexus Codex runner ${config.runnerId} polling ${config.nexusBaseUrl} every ${config.pollIntervalMs}ms in ${config.executionMode} mode`
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

  const control = await readRunnerControl();
  runnerState.control = control;
  if (control.paused) {
    runnerState.status = 'paused';
    runnerState.currentJob = null;
    runnerState.lastError = null;
    await writeHeartbeat();
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
    await ensureJobActive(job.id);

    await runCommand(
      config.githubCliBin,
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
      { cwd: jobDir, logPath, jobId: job.id }
    );

    await ensureJobActive(job.id);
    await runCommand('git', ['checkout', '-b', job.branchName], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });
    await runCommand('git', ['config', 'user.name', config.gitUserName], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });
    await runCommand('git', ['config', 'user.email', config.gitUserEmail], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });

    const executionResult =
      config.executionMode === 'cloud-hybrid'
        ? await runCloudHybridCodexJob(job, { jobDir, repoDir, logPath, lastMessagePath })
        : await runLocalCodexJob(job, { repoDir, logPath, lastMessagePath });
    await ensureJobActive(job.id);

    if (config.verifyCommand) {
      await updateJob(job.id, {
        status: 'RUNNING',
        statusMessage: `Running verification command: ${config.verifyCommand}`
      });
      await ensureJobActive(job.id);
      await runShell(config.verifyCommand, { cwd: repoDir, logPath, jobId: job.id });
    }

    const status = await runCommand('git', ['status', '--porcelain'], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });
    if (!status.stdout.trim()) {
      throw new Error('Codex completed without leaving any repository changes to commit.');
    }
    await ensureJobActive(job.id);

    await updateJob(job.id, {
      status: 'RUNNING',
      statusMessage: 'Committing Codex changes and opening a pull request.'
    });

    await ensureJobActive(job.id);
    await runCommand('git', ['add', '-A'], { cwd: repoDir, logPath, jobId: job.id });
    await runCommand('git', ['commit', '-m', buildCommitMessage(job)], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });
    await ensureJobActive(job.id);
    await runCommand('git', ['push', '--set-upstream', 'origin', job.branchName], {
      cwd: repoDir,
      logPath,
      jobId: job.id
    });
    await ensureJobActive(job.id);

    const codexLastMessage = await readTextIfExists(lastMessagePath);
    await writeFile(prBodyPath, buildPullRequestBody(job, codexLastMessage, executionResult), 'utf8');

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

    await ensureJobActive(job.id);
    const pr = await runCommand(config.githubCliBin, prArgs, { cwd: repoDir, logPath, jobId: job.id });
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
        draft: config.draftPr,
        executionMode: config.executionMode,
        ...(executionResult.codexCloud ? { codexCloud: executionResult.codexCloud } : {})
      }
    });
  } catch (error) {
    if (error instanceof JobCanceledError) {
      await updateJob(job.id, {
        status: 'CANCELED',
        statusMessage: 'Canceled by the Nexus runner control plane.',
        output: truncate(await readTextIfExists(logPath), 500_000)
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await updateJob(job.id, {
      status: 'FAILED',
      statusMessage: 'Codex runner failed.',
      error: message,
      output: truncate(await readTextIfExists(logPath), 500_000)
    });
  }
}

async function runLocalCodexJob(job, { repoDir, logPath, lastMessagePath }) {
  await updateJob(job.id, {
    status: 'RUNNING',
    statusMessage: 'Running local Codex CLI against the crash report.'
  });
  await ensureJobActive(job.id);

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
    jobId: job.id,
    env: getCodexEnv(),
    displayCommand: `${config.codexBin} -a never exec --cd ${repoDir} --sandbox workspace-write --output-last-message ${lastMessagePath} <prompt>`
  });

  return {
    executionMode: 'local'
  };
}

async function runCloudHybridCodexJob(job, { jobDir, repoDir, logPath, lastMessagePath }) {
  const cloudEnvId = resolveCodexCloudEnvId(job);
  if (!cloudEnvId) {
    throw new Error(
      `A Codex Cloud environment id is required for ${job.targetRepository}. Configure CODEX_CLOUD_ENV_ID or CODEX_CLOUD_ENV_BY_REPO.`
    );
  }

  const submittedAt = new Date().toISOString();
  const cloudPromptPath = join(jobDir, 'codex-cloud-prompt.md');
  await writeFile(cloudPromptPath, buildCodexCloudPrompt(job), 'utf8');

  await updateJob(job.id, {
    status: 'RUNNING',
    statusMessage: 'Submitting Codex Cloud task from the VPS runner.',
    result: {
      codexCloud: {
        envId: cloudEnvId,
        attempts: config.codexCloudAttempts,
        status: 'submitting',
        submittedAt
      }
    }
  });
  await ensureJobActive(job.id);

  const submit = await runCommand(
    config.codexBin,
    [
      'cloud',
      'exec',
      '--env',
      cloudEnvId,
      '--attempts',
      String(config.codexCloudAttempts),
      '--branch',
      job.baseBranch,
      await readFile(cloudPromptPath, 'utf8')
    ],
    {
      cwd: repoDir,
      logPath,
      jobId: job.id,
      env: getCodexEnv(),
      displayCommand: `${config.codexBin} cloud exec --env ${cloudEnvId} --attempts ${config.codexCloudAttempts} --branch ${job.baseBranch} <prompt>`
    }
  );

  let task = extractCloudTaskReference(`${submit.stdout}\n${submit.stderr}`);
  if (!task.id) {
    task =
      (await findNewestCloudTask(submittedAt, { cwd: repoDir, logPath, jobId: job.id, envId: cloudEnvId })) ||
      task;
  }
  if (!task.id) {
    throw new Error(
      'Codex Cloud task was submitted, but the runner could not determine its task id from the CLI output.'
    );
  }

  const codexCloud = {
    taskId: task.id,
    taskUrl: task.url,
    envId: cloudEnvId,
    attempts: config.codexCloudAttempts,
    status: 'submitted',
    submittedAt
  };

  await updateJob(job.id, {
    status: 'RUNNING',
    statusMessage: formatCloudStatusMessage('Codex Cloud task submitted.', codexCloud),
    result: {
      codexCloud
    }
  });

  const completedTask = await pollCodexCloudTask(job, codexCloud, { cwd: repoDir, logPath });
  const statusText = await readCodexCloudStatusText(codexCloud.taskId, {
    cwd: repoDir,
    logPath,
    jobId: job.id
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return `Unable to read Codex Cloud status details after completion: ${message}`;
  });

  await writeFile(
    lastMessagePath,
    buildCodexCloudLastMessage({
      codexCloud: completedTask,
      statusText
    }),
    'utf8'
  );

  await updateJob(job.id, {
    status: 'RUNNING',
    statusMessage: formatCloudStatusMessage('Applying Codex Cloud diff locally.', completedTask),
    result: {
      codexCloud: {
        ...completedTask,
        status: 'applying',
        applyingAt: new Date().toISOString()
      }
    }
  });
  await ensureJobActive(job.id);

  await runCommand(config.codexBin, ['apply', completedTask.taskId], {
    cwd: repoDir,
    logPath,
    jobId: job.id,
    env: getCodexEnv()
  });

  return {
    executionMode: 'cloud-hybrid',
    codexCloud: {
      ...completedTask,
      status: 'applied',
      appliedAt: new Date().toISOString()
    }
  };
}

async function pollCodexCloudTask(job, codexCloud, { cwd, logPath }) {
  const startedAt = Date.now();
  let lastStatus = codexCloud.status;
  let lastTask = codexCloud;

  while (Date.now() - startedAt < config.codexCloudTimeoutMs) {
    await sleep(config.codexCloudPollIntervalMs);
    await ensureJobActive(job.id);

    const listedTask = await findCloudTaskById(codexCloud.taskId, {
      cwd,
      logPath,
      jobId: job.id,
      envId: codexCloud.envId
    });
    const statusOutput =
      getCloudTaskStatus(listedTask) ||
      (await readCodexCloudStatusText(codexCloud.taskId, { cwd, logPath, jobId: job.id }).catch(
        () => ''
      ));
    const statusText = extractCloudStatusLabel(statusOutput);
    const normalizedStatus = normalizeCloudTaskStatus(statusText);
    lastTask = {
      ...codexCloud,
      ...summarizeCloudTask(listedTask),
      taskId: codexCloud.taskId,
      taskUrl: getCloudTaskUrl(listedTask) || codexCloud.taskUrl,
      status: statusText || normalizedStatus,
      normalizedStatus,
      lastCheckedAt: new Date().toISOString()
    };

    if (lastTask.status !== lastStatus) {
      lastStatus = lastTask.status;
      await updateJob(job.id, {
        status: 'RUNNING',
        statusMessage: formatCloudStatusMessage(`Codex Cloud task is ${lastTask.status}.`, lastTask),
        result: {
          codexCloud: lastTask
        }
      });
    }

    if (normalizedStatus === 'succeeded') {
      return {
        ...lastTask,
        status: lastTask.status || 'succeeded',
        completedAt: new Date().toISOString()
      };
    }
    if (normalizedStatus === 'failed') {
      throw new Error(`Codex Cloud task ended with status: ${lastTask.status || 'failed'}`);
    }
  }

  throw new Error(
    `Codex Cloud task did not finish within ${Math.round(config.codexCloudTimeoutMs / 1000)} seconds.`
  );
}

async function findNewestCloudTask(submittedAt, options) {
  const tasks = await listCodexCloudTasks(options);
  const cutoff = Date.parse(submittedAt) - 60_000;
  return (
    tasks
      .map((task) => ({
        ...summarizeCloudTask(task),
        id: getCloudTaskId(task),
        taskId: getCloudTaskId(task),
        url: getCloudTaskUrl(task),
        taskUrl: getCloudTaskUrl(task)
      }))
      .find((task) => {
        if (!task.id) {
          return false;
        }
        const taskTime = Date.parse(task.createdAt || task.updatedAt || task.lastUpdatedAt || '');
        return Number.isFinite(taskTime) ? taskTime >= cutoff : true;
      }) || null
  );
}

async function findCloudTaskById(taskId, options) {
  const tasks = await listCodexCloudTasks(options);
  return tasks.find((task) => getCloudTaskId(task) === taskId) || null;
}

async function listCodexCloudTasks({ cwd, logPath, jobId, envId }) {
  const response = await runCommand(
    config.codexBin,
    ['cloud', 'list', '--json', '--env', envId || config.codexCloudEnvId, '--limit', '20'],
    {
      cwd,
      logPath,
      jobId,
      env: getCodexEnv()
    }
  );
  const parsed = JSON.parse(response.stdout || '{}');
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.tasks)) {
    return parsed.tasks;
  }
  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }
  return [];
}

async function readCodexCloudStatusText(taskId, { cwd, logPath, jobId }) {
  const status = await runCommand(config.codexBin, ['cloud', 'status', taskId], {
    cwd,
    logPath,
    jobId,
    env: getCodexEnv()
  });
  return `${status.stdout}\n${status.stderr}`.trim();
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

async function apiGet(path) {
  const response = await fetch(`${config.nexusBaseUrl}/api/codex-runner${path}`, {
    headers: {
      authorization: `Bearer ${config.token}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nexus API ${path} responded with ${response.status}: ${text}`);
  }

  return response.json();
}

async function updateJob(jobId, patch) {
  updateCurrentJobFromPatch(jobId, patch);
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

function updateCurrentJobFromPatch(jobId, patch) {
  if (runnerState.currentJob?.id !== jobId) {
    return;
  }

  runnerState.currentJob = {
    ...runnerState.currentJob,
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.statusMessage ? { statusMessage: patch.statusMessage } : {}),
    ...(patch.error ? { error: patch.error } : {}),
    ...(patch.prUrl ? { prUrl: patch.prUrl } : {}),
    ...(patch.result?.codexCloud ? { codexCloud: patch.result.codexCloud } : {})
  };
  void writeHeartbeat();
}

async function ensureJobActive(jobId) {
  const response = await apiGet(`/jobs/${encodeURIComponent(jobId)}`);
  if (response.job?.status === 'CANCELED') {
    throw new JobCanceledError(`Codex job ${jobId} was canceled.`);
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
    let cancelError = null;
    let checkingCancel = false;
    let forceKillTimer = null;
    const startedAt = new Date().toISOString();
    const rendered =
      options.displayCommand || (options.shell ? command : [command, ...args].map(shellQuote).join(' '));

    void appendFile(options.logPath, `\n[${startedAt}] $ ${rendered}\n`, 'utf8');

    const cancelTimer = options.jobId
      ? setInterval(() => {
          if (checkingCancel || cancelError) {
            return;
          }
          checkingCancel = true;
          ensureJobActive(options.jobId)
            .catch((error) => {
              if (error instanceof JobCanceledError) {
                cancelError = error;
                void appendFile(
                  options.logPath,
                  `\n[${new Date().toISOString()}] ${error.message}; terminating subprocess.\n`,
                  'utf8'
                );
                child.kill('SIGTERM');
                forceKillTimer = setTimeout(() => {
                  child.kill('SIGKILL');
                }, 5_000);
                forceKillTimer.unref?.();
              } else {
                void appendFile(
                  options.logPath,
                  `\n[${new Date().toISOString()}] Cancellation check failed: ${
                    error instanceof Error ? error.message : String(error)
                  }\n`,
                  'utf8'
                );
              }
            })
            .finally(() => {
              checkingCancel = false;
            });
        }, config.cancelCheckIntervalMs)
      : null;

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
    child.on('error', (error) => {
      if (cancelTimer) {
        clearInterval(cancelTimer);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (cancelTimer) {
        clearInterval(cancelTimer);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      if (cancelError) {
        reject(cancelError);
        return;
      }
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

function buildPullRequestBody(job, codexLastMessage, executionResult) {
  const codexCloud = executionResult?.codexCloud;
  return [
    '## Summary',
    '- Automated Nexus Codex runner PR for a Webhook Inbox crash report.',
    `- Nexus job: ${job.id}`,
    job.messageId ? `- Nexus message: ${job.messageId}` : null,
    `- Execution mode: ${executionResult?.executionMode || config.executionMode}`,
    codexCloud?.taskUrl ? `- Codex Cloud task: ${codexCloud.taskUrl}` : null,
    codexCloud?.taskId && !codexCloud?.taskUrl ? `- Codex Cloud task: ${codexCloud.taskId}` : null,
    '',
    '## Runner Safety',
    '- Work was performed on an isolated runner branch.',
    '- The base branch was not mutated directly.',
    '- If this PR is rejected, closing the PR and deleting the branch removes the persistent code change.',
    '',
    '## Codex Notes',
    truncate(codexLastMessage || 'Codex did not write a final message.', 20_000)
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCodexCloudPrompt(job) {
  return [
    'You are Codex Cloud working on an automated Nexus crash-fix task.',
    '',
    'Runner contract:',
    '- Investigate the crash report and implement the smallest safe fix.',
    '- Run the most relevant tests or validation commands available in the repository.',
    '- Iterate between fixing and validating until you have the best solution you can produce.',
    '- Leave the final solution as a code diff in this Codex Cloud task.',
    '- Do not create or push branches.',
    '- Do not open a pull request.',
    '- Do not mutate production services, shared databases, or infrastructure.',
    '- The VPS runner will apply your final diff locally, run its configured verification command, commit, push, and open the PR.',
    '',
    `Repository: ${job.targetRepository}`,
    `Base branch: ${job.baseBranch}`,
    `Runner branch that will receive the final diff: ${job.branchName}`,
    '',
    'Original Nexus task prompt:',
    '',
    job.prompt
  ].join('\n');
}

function buildCodexCloudLastMessage({ codexCloud, statusText }) {
  return [
    'Codex Cloud task completed and the VPS runner applied its final diff locally.',
    '',
    `Task: ${codexCloud.taskUrl || codexCloud.taskId}`,
    `Environment: ${codexCloud.envId}`,
    `Final status: ${codexCloud.status}`,
    '',
    '## Cloud Status',
    truncate(statusText || 'No Codex Cloud status details were returned.', 20_000)
  ].join('\n');
}

function formatCloudStatusMessage(prefix, codexCloud) {
  const ref = codexCloud.taskUrl || codexCloud.taskId;
  return ref ? `${prefix} (${ref})` : prefix;
}

function extractCloudTaskReference(output) {
  const urls = Array.from(output.matchAll(/https?:\/\/[^\s)]+/g)).map((match) =>
    match[0].replace(/[.,;]+$/, '')
  );
  const url = urls.find((candidate) => /codex|chatgpt|openai/i.test(candidate)) || urls[0] || null;
  const idFromUrl = getCloudTaskIdFromUrl(url);
  const explicitId =
    output.match(/\b(?:task(?:\s+id)?|id)\s*[:#]\s*([A-Za-z0-9_-]{8,})\b/i)?.[1] ||
    output.match(/\b(task[_-][A-Za-z0-9_-]+)\b/)?.[1] ||
    output.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ||
    null;

  return {
    id: idFromUrl || explicitId,
    url
  };
}

function summarizeCloudTask(task) {
  if (!task || typeof task !== 'object') {
    return {};
  }
  return {
    title: firstString(task.title, task.name, task.query),
    status: getCloudTaskStatus(task),
    createdAt: firstString(task.createdAt, task.created_at, task.startedAt, task.started_at),
    updatedAt: firstString(task.updatedAt, task.updated_at, task.lastUpdatedAt, task.last_updated_at),
    taskUrl: getCloudTaskUrl(task)
  };
}

function getCloudTaskId(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }
  return (
    firstString(task.id, task.taskId, task.task_id, task.taskID) ||
    getCloudTaskIdFromUrl(getCloudTaskUrl(task))
  );
}

function getCloudTaskUrl(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }
  return firstString(task.url, task.taskUrl, task.task_url, task.webUrl, task.web_url);
}

function getCloudTaskIdFromUrl(url) {
  if (!url) {
    return null;
  }
  return (
    url.match(/\/(?:tasks?|codex)\/([A-Za-z0-9_-]{8,})(?:[/?#]|$)/i)?.[1] ||
    url.match(/[?&](?:taskId|task_id|id)=([A-Za-z0-9_-]{8,})/i)?.[1] ||
    null
  );
}

function getCloudTaskStatus(task) {
  if (!task || typeof task !== 'object') {
    return '';
  }
  return firstString(
    task.status,
    task.state,
    task.phase,
    task.result?.status,
    task.latestAttempt?.status,
    task.latest_attempt?.status
  );
}

function normalizeCloudTaskStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  const token = text.match(/\b(?:status|state|phase)\s*[:=]\s*([a-z_-]+)/)?.[1] || text;

  if (/^(completed|complete|succeeded|success|done|finished)$/.test(token)) {
    return 'succeeded';
  }
  if (/^(failed|failure|error|errored|canceled|cancelled)$/.test(token)) {
    return 'failed';
  }
  if (/\b(completed|succeeded|success|done|finished)\b/.test(text)) {
    return 'succeeded';
  }
  if (/\b(failed|failure|errored|canceled|cancelled)\b/.test(text)) {
    return 'failed';
  }
  return 'running';
}

function extractCloudStatusLabel(value) {
  const text = String(value || '').trim();
  const explicit = text.match(/\b(?:status|state|phase)\s*[:=]\s*([A-Za-z_-]+)/)?.[1];
  if (explicit) {
    return explicit;
  }
  if (/^\w[\w-]{0,40}$/.test(text)) {
    return text;
  }

  const lower = text.toLowerCase();
  if (/\b(completed|complete|succeeded|success|done|finished)\b/.test(lower)) {
    return 'completed';
  }
  if (/\b(failed|failure|errored|error|canceled|cancelled)\b/.test(lower)) {
    return 'failed';
  }
  if (/\b(queued|pending)\b/.test(lower)) {
    return 'queued';
  }
  if (/\b(running|in_progress|in-progress|working)\b/.test(lower)) {
    return 'running';
  }
  return 'running';
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractPullRequestUrl(stdout) {
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0] ?? null;
}

function extractPullRequestNumber(url) {
  const match = url?.match(/\/pull\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function readRunnerControl() {
  if (!existsSync(config.controlFile)) {
    return {
      paused: false,
      reason: null,
      updatedAt: null,
      updatedBy: null
    };
  }

  try {
    const raw = JSON.parse(await readFile(config.controlFile, 'utf8'));
    return {
      paused: raw.paused === true,
      reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason : null,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      updatedBy: typeof raw.updatedBy === 'string' && raw.updatedBy.trim() ? raw.updatedBy : null
    };
  } catch (error) {
    return {
      paused: false,
      reason: error instanceof Error ? `Invalid control file: ${error.message}` : 'Invalid control file',
      updatedAt: null,
      updatedBy: null
    };
  }
}

function writeHeartbeat() {
  const write = heartbeatWriteChain.catch(() => undefined).then(writeHeartbeatNow);
  heartbeatWriteChain = write.catch(() => undefined);
  return write;
}

async function writeHeartbeatNow() {
  const now = new Date().toISOString();
  const body = {
    ...runnerState,
    lastSeenAt: now
  };
  runnerState.lastSeenAt = now;
  const sequence = (heartbeatWriteSequence += 1);
  const tempFile = `${heartbeatFile}.${process.pid}.${Date.now()}.${sequence}.tmp`;
  try {
    await writeFile(tempFile, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    await rename(tempFile, heartbeatFile);
  } catch (error) {
    await rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

function summarizeJob(job) {
  return {
    id: job.id,
    messageId: job.messageId,
    targetRepository: job.targetRepository,
    baseBranch: job.baseBranch,
    branchName: job.branchName,
    status: job.status,
    createdAt: job.createdAt,
    executionMode: config.executionMode
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

function getCodexEnv() {
  return config.codexHome ? { CODEX_HOME: config.codexHome } : undefined;
}

function resolveCodexCloudEnvId(job) {
  return config.codexCloudEnvByRepo.get(normalizeRepositoryName(job.targetRepository)) || config.codexCloudEnvId;
}

function normalizeExecutionMode(value) {
  const normalized = String(value || 'local')
    .trim()
    .toLowerCase();
  if (normalized === 'cloud' || normalized === 'cloud_hybrid') {
    return 'cloud-hybrid';
  }
  if (normalized === 'cloud-hybrid' || normalized === 'local') {
    return normalized;
  }
  throw new Error(
    `Unsupported CODEX_RUNNER_EXECUTION_MODE "${value}". Expected "local" or "cloud-hybrid".`
  );
}

function parseRepoEnvMap(value) {
  const map = new Map();
  for (const entry of String(value || '').split(/[\n,;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.lastIndexOf('=');
    if (separator === -1) {
      continue;
    }
    const repo = normalizeRepositoryName(trimmed.slice(0, separator));
    const envId = trimmed.slice(separator + 1).trim();
    if (repo && envId) {
      map.set(repo, envId);
    }
  }
  return map;
}

function normalizeRepositoryName(value) {
  const raw = String(value || '')
    .trim()
    .replace(/\.git$/i, '');
  if (!raw) {
    return '';
  }
  const gitHubMatch = raw.match(/github\.com[:/]([^/]+\/[^/?#]+)$/i);
  if (gitHubMatch) {
    return gitHubMatch[1].toLowerCase();
  }
  const parts = raw.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join('/').toLowerCase();
  }
  return raw.toLowerCase();
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

class JobCanceledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JobCanceledError';
  }
}
