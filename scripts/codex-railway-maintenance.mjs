#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const args = parseArgs(process.argv.slice(2));

const automationRoot = resolve(
  process.env.CODEX_RAILWAY_MAINTENANCE_HOME ||
    join(homedir(), '.codex', 'automations', 'cw-railway-maintenance')
);
const runId = toRunId(new Date());
const runDir = join(automationRoot, 'runs', runId);
const evidenceDir = join(runDir, 'evidence');
const workspacesDir = join(runDir, 'workspaces');
const stateDir = join(automationRoot, 'state');
const metricsDir = join(automationRoot, 'metrics');
const logPath = join(runDir, 'run.log');
const historyPath = join(metricsDir, 'history.jsonl');
const defaultSince = process.env.CODEX_RAILWAY_MAINTENANCE_SINCE || '24h';
const since = args.since || defaultSince;
const codexBin = process.env.CODEX_BIN || 'codex';
const ghBin = process.env.GH_BIN || 'gh';
const railwayBin = process.env.RAILWAY_BIN || 'railway';
const verifyCommand =
  args.verify === false
    ? ''
    : process.env.CODEX_RAILWAY_MAINTENANCE_VERIFY_COMMAND || 'git diff --check && npm test';
const prepareCommand =
  args.prepare === false ? '' : process.env.CODEX_RAILWAY_MAINTENANCE_PREP_COMMAND || 'npm install';
const taskFilter = new Set(args.task ? [args.task] : ['usage', 'bugs']);

await mkdir(evidenceDir, { recursive: true });
await mkdir(workspacesDir, { recursive: true });
await mkdir(stateDir, { recursive: true });
await mkdir(metricsDir, { recursive: true });

const runState = {
  runId,
  startedAt: new Date().toISOString(),
  since,
  repoRoot,
  automationRoot,
  collectOnly: args.collectOnly,
  tasks: [],
  evidence: [],
  status: 'running'
};

await log(`Starting CW Nexus Railway Codex maintenance run ${runId}`);
await writeJson(join(runDir, 'run-state.json'), runState);

try {
  await preflight();
  await collectRailwayEvidence();
  await appendHistory('evidence_collected');

  if (args.collectOnly) {
    runState.status = 'collected';
    await finishRun();
    process.exit(0);
  }

  if (taskFilter.has('usage')) {
    runState.tasks.push(await runCodexTask(buildUsageTask()));
  }

  if (taskFilter.has('bugs')) {
    runState.tasks.push(await runCodexTask(buildBugTask()));
  }

  runState.status = runState.tasks.some((task) => task.status === 'failed') ? 'completed_with_errors' : 'completed';
  await finishRun();
} catch (error) {
  runState.status = 'failed';
  runState.error = stringifyError(error);
  await log(`Run failed: ${runState.error}`);
  await finishRun();
  process.exitCode = 1;
}

async function preflight() {
  for (const command of [railwayBin, ghBin, codexBin]) {
    const result = await run(command, ['--version'], { allowFailure: true, timeoutMs: 30_000 });
    if (result.code !== 0) {
      throw new Error(`Required command is unavailable: ${command}`);
    }
  }

  await run(railwayBin, ['status', '--json'], { allowFailure: false, timeoutMs: 90_000 });
  await run(ghBin, ['auth', 'status'], { allowFailure: false, timeoutMs: 60_000 });
}

async function collectRailwayEvidence() {
  const commands = [
    {
      name: 'railway-status',
      args: ['status', '--json'],
      format: 'json',
      required: true
    },
    {
      name: 'deployments',
      args: ['deployment', 'list', '--json', '--limit', '20'],
      format: 'json'
    },
    {
      name: 'services',
      args: ['service', 'list', '--json'],
      format: 'json',
      required: true
    },
    {
      name: 'metrics-summary',
      args: ['metrics', '--all', '--json', '--since', since],
      format: 'json',
      required: true
    },
    {
      name: 'logs-app',
      args: ['logs', '--json', '--lines', '1000', '--since', since],
      format: 'jsonl'
    },
    {
      name: 'logs-app-issues',
      args: ['logs', '--json', '--lines', '500', '--since', since, '--filter', '@level:error OR @level:warn'],
      format: 'jsonl'
    },
    {
      name: 'logs-http-errors',
      args: ['logs', '--http', '--json', '--lines', '1000', '--since', since, '--status', '>=400'],
      format: 'jsonl'
    },
    {
      name: 'logs-http-slow',
      args: ['logs', '--http', '--json', '--lines', '500', '--since', since, '--filter', '@totalDuration:>=2000'],
      format: 'jsonl'
    }
  ];

  for (const command of commands) {
    const result = await run(railwayBin, command.args, {
      allowFailure: !command.required,
      timeoutMs: 180_000
    });
    const evidence = await writeEvidence(command, result);
    runState.evidence.push(evidence);
  }

  const services = await readCapturedServices();
  for (const service of services) {
    for (const metric of ['cpu', 'memory', 'network', 'http']) {
      const command = {
        name: `metrics-raw-${metric}-${slugify(service.name || service.id)}`,
        args: ['metrics', '--service', service.id, '--raw', '--json', `--${metric}`, '--since', since],
        format: 'json'
      };
      const result = await run(railwayBin, command.args, {
        allowFailure: true,
        timeoutMs: 180_000
      });
      const evidence = await writeEvidence(command, result);
      evidence.service = {
        id: service.id,
        name: service.name,
        status: service.status,
        stopped: service.deploymentStopped
      };
      runState.evidence.push(evidence);
    }
  }
}

async function writeEvidence(command, result) {
  const startedAt = new Date().toISOString();
  const basePath = join(evidenceDir, `${command.name}.${command.format === 'jsonl' ? 'jsonl' : 'json'}`);
  const stderrPath = join(evidenceDir, `${command.name}.stderr.txt`);
  const entry = {
    name: command.name,
    command: [railwayBin, ...command.args].join(' '),
    format: command.format,
    ok: result.code === 0,
    exitCode: result.code,
    path: basePath,
    stderrPath,
    capturedAt: startedAt
  };

  if (result.stderr.trim()) {
    await writeFile(stderrPath, redactSensitive(result.stderr), 'utf8');
  }

  if (command.format === 'jsonl') {
    const rows = parseJsonLines(result.stdout).map(redactValue);
    await writeFile(basePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
    entry.rows = rows.length;
    entry.digest = digestRows(rows);
    return entry;
  }

  const parsed = parseJsonOrText(result.stdout);
  const redacted = redactValue(parsed);
  if (typeof redacted === 'string') {
    await writeFile(basePath, JSON.stringify({ output: redacted }, null, 2), 'utf8');
  } else {
    await writeFile(basePath, JSON.stringify(redacted, null, 2), 'utf8');
  }
  entry.digest = digestJson(redacted);
  return entry;
}

function buildUsageTask() {
  return {
    id: 'usage',
    title: 'Railway usage optimization review',
    branchPrefix: 'codex/railway-usage',
    resultFile: join(runDir, 'codex-result-usage.json'),
    lastMessageFile: join(runDir, 'codex-last-message-usage.md'),
    outputJsonlFile: join(runDir, 'codex-events-usage.jsonl'),
    commitPrefix: 'chore(railway)',
    prTitlePrefix: 'Optimize Railway usage',
    telegramTitle: 'CW Nexus usage PR',
    buildPrompt: (workingRepoRoot, resultFile) => [
      'You are Codex running the daily CW Nexus Railway usage maintenance automation.',
      '',
      'Goal:',
      '- Review the captured Railway metrics for this app.',
      '- Implement a code/config optimization only when the evidence supports a small, safe change that should not cause a regression.',
      '- If there is no clearly safe optimization, make no repository changes.',
      '',
      'Hard safety rules:',
      '- Do not mutate Railway resources, environment variables, databases, production services, or live app data.',
      '- Do not run migrations.',
      '- Do not commit, push, create a pull request, or send Telegram. The wrapper handles those steps.',
      '- Keep any change small and targeted. Avoid broad refactors, dependency upgrades, or speculative tuning.',
      '- Low CPU or memory alone is not enough evidence for a change.',
      '- Prefer fixes that reduce waste visible in evidence: repeated asset misses, avoidable noisy logs, unnecessary polling, excessive payloads, or obviously inefficient code paths.',
      '- If you cannot prove the change from the evidence and local code, leave no diff.',
      '',
      sharedPromptContext(workingRepoRoot),
      '',
      `Before finishing, write JSON to ${resultFile} with this shape:`,
      resultSchemaText(),
      '',
      'Use action "no_change" when no safe usage optimization is warranted.'
    ].join('\n')
  };
}

function buildBugTask() {
  return {
    id: 'bugs',
    title: 'Railway log bug review',
    branchPrefix: 'codex/railway-log-fix',
    resultFile: join(runDir, 'codex-result-bugs.json'),
    lastMessageFile: join(runDir, 'codex-last-message-bugs.md'),
    outputJsonlFile: join(runDir, 'codex-events-bugs.jsonl'),
    commitPrefix: 'fix(railway-logs)',
    prTitlePrefix: 'Fix issue found in Railway logs',
    telegramTitle: 'CW Nexus log-fix PR',
    buildPrompt: (workingRepoRoot, resultFile) => [
      'You are Codex running the daily CW Nexus Railway log maintenance automation.',
      '',
      'Goal:',
      '- Review the captured Railway server and HTTP logs for repeated bugs, long error entries, exceptions, 5xxs, or clear client/server regressions.',
      '- Implement a bug fix only when the evidence points to a small, safe code change.',
      '- If there is no clearly safe bug fix, make no repository changes.',
      '',
      'Hard safety rules:',
      '- Do not mutate Railway resources, environment variables, databases, production services, or live app data.',
      '- Do not run migrations.',
      '- Do not commit, push, create a pull request, or send Telegram. The wrapper handles those steps.',
      '- Keep any fix small and targeted to one observed issue.',
      '- Do not combine unrelated bug fixes.',
      '- Do not expose raw logs, IPs, cookies, tokens, webhook URLs, or stack traces in PR text.',
      '- 404s for stale built assets after deploy may be browser-cache noise; only change code if there is a real app-side issue.',
      '',
      sharedPromptContext(workingRepoRoot),
      '',
      `Before finishing, write JSON to ${resultFile} with this shape:`,
      resultSchemaText(),
      '',
      'Use action "no_change" when no safe bug fix is warranted.'
    ].join('\n')
  };
}

function sharedPromptContext(workingRepoRoot) {
  return [
    `Workspace repository root: ${workingRepoRoot}`,
    `Source checkout used for Railway CLI context: ${repoRoot}`,
    `Run directory: ${runDir}`,
    `Evidence directory: ${evidenceDir}`,
    `Historical timeline JSONL: ${historyPath}`,
    `Evidence window: ${since}`,
    '',
    'Important local context:',
    '- Local development for this app can be wired to a shared Railway-backed database. Treat all DB writes as production-impacting.',
    '- Project instructions are in AGENTS.md. Follow them.',
    '- Generated output under server/build must not be edited.',
    '',
    'Evidence files captured for this run:',
    ...runState.evidence.map((entry) => `- ${entry.name}: ${entry.path}${entry.ok ? '' : ` (capture failed: ${entry.stderrPath})`}`),
    '',
    'Verification expectation:',
    `- The wrapper prepared the isolated workspace with: ${prepareCommand || 'no prep command configured'}`,
    `- The wrapper will run: ${verifyCommand || 'no verification command configured'}`,
    '- You may run narrower read-only inspection commands while investigating.'
  ].join('\n');
}

function resultSchemaText() {
  return JSON.stringify(
    {
      action: 'no_change | pr',
      category: 'usage | bug',
      title: 'Short PR title if action is pr',
      summary: 'One to three sentence human summary',
      rationale: 'Why the evidence supports the change',
      risk: 'low | medium',
      filesChanged: ['relative/path.ts'],
      testing: ['command or manual check performed'],
      telegramDescription: 'Brief message-safe description without raw logs or secrets'
    },
    null,
    2
  );
}

async function runCodexTask(task) {
  const taskState = {
    id: task.id,
    title: task.title,
    status: 'running',
    startedAt: new Date().toISOString(),
    branchName: `${task.branchPrefix}-${runId.toLowerCase()}`,
    workspaceDir: join(workspacesDir, task.id),
    repoDir: join(workspacesDir, task.id, 'repo')
  };
  await log(`Starting Codex task: ${task.title}`);
  let childResultFile = null;

  try {
    await prepareWorkspace(taskState);
    childResultFile = join(taskState.repoDir, `.codex-railway-result-${task.id}.json`);

    const codex = await run(codexBin, [
      '-a',
      'never',
      'exec',
      '--cd',
      taskState.repoDir,
      '--add-dir',
      runDir,
      '--sandbox',
      'workspace-write',
      '--json',
      '--output-last-message',
      task.lastMessageFile,
      task.buildPrompt(taskState.repoDir, childResultFile)
    ], {
      allowFailure: true,
      timeoutMs: Number(process.env.CODEX_RAILWAY_MAINTENANCE_CODEX_TIMEOUT_MS || 90 * 60 * 1000),
      stdoutPath: task.outputJsonlFile,
      cwd: taskState.repoDir
    });

    taskState.codexExitCode = codex.code;
    if (codex.code !== 0) {
      await removeChildResultFile(childResultFile);
      taskState.status = 'failed';
      taskState.error = `Codex exited with ${codex.code}`;
      await preserveWorkspacePatch(taskState);
      return taskState;
    }

    taskState.result = await consumeResultFile(task, childResultFile);
    childResultFile = null;

    const aheadCount = await getBranchAheadCount(taskState.repoDir);
    taskState.branchCommitsAhead = aheadCount;
    if (aheadCount > 0) {
      taskState.status = 'failed';
      taskState.error = 'Codex created commits directly; wrapper refuses to publish commits it did not create.';
      await preserveWorkspacePatch(taskState);
      return taskState;
    }

    const diffStatus = (await runGitIn(taskState.repoDir, ['status', '--porcelain'])).stdout.trim();
    if (!diffStatus) {
      taskState.status = 'no_change';
      await appendHistory(`task_${task.id}_no_change`);
      return taskState;
    }

    if (taskState.result.action !== 'pr') {
      taskState.status = 'failed';
      taskState.error = `Codex left a diff but result action was ${JSON.stringify(taskState.result.action)}`;
      await preserveWorkspacePatch(taskState);
      return taskState;
    }

    if (verifyCommand) {
      const verification = await run(verifyCommand, [], {
        shell: true,
        allowFailure: true,
        timeoutMs: Number(process.env.CODEX_RAILWAY_MAINTENANCE_VERIFY_TIMEOUT_MS || 30 * 60 * 1000),
        stdoutPath: join(runDir, `verify-${task.id}.log`),
        cwd: taskState.repoDir
      });
      taskState.verificationExitCode = verification.code;
      if (verification.code !== 0) {
        taskState.status = 'failed';
        taskState.error = `Verification failed with exit code ${verification.code}`;
        await preserveWorkspacePatch(taskState);
        return taskState;
      }
    }

    await runGitIn(taskState.repoDir, ['add', '-A']);
    await runGitIn(taskState.repoDir, ['commit', '-m', buildCommitMessage(task, taskState.result)]);
    await runGitIn(taskState.repoDir, ['push', '--force-with-lease', '--set-upstream', 'origin', taskState.branchName]);

    const prBodyPath = join(runDir, `pull-request-${task.id}.md`);
    await writeFile(prBodyPath, buildPullRequestBody(task, taskState), 'utf8');

    const pr = await run(ghBin, [
      'pr',
      'create',
      '--repo',
      'Valorith/CW-Raid-Manager',
      '--base',
      'main',
      '--head',
      taskState.branchName,
      '--title',
      buildPullRequestTitle(task, taskState.result),
      '--body-file',
      prBodyPath
    ], {
      timeoutMs: 120_000,
      cwd: taskState.repoDir
    });

    taskState.prUrl = extractPullRequestUrl(pr.stdout);
    taskState.status = 'pr_created';
    await sendTelegram(task, taskState);
    await appendHistory(`task_${task.id}_pr_created`);
    return taskState;
  } catch (error) {
    await removeChildResultFile(childResultFile);
    taskState.status = 'failed';
    taskState.error = stringifyError(error);
    await preserveWorkspacePatch(taskState);
    await appendHistory(`task_${task.id}_failed`);
    return taskState;
  }
}

async function consumeResultFile(task, childResultFile) {
  let result;
  try {
    result = await readResultFile(childResultFile);
  } finally {
    await removeChildResultFile(childResultFile);
  }
  await writeJson(task.resultFile, result);
  return result;
}

async function removeChildResultFile(childResultFile) {
  if (childResultFile) {
    await rm(childResultFile, { force: true });
  }
}

async function prepareWorkspace(taskState) {
  const originUrl = (await runGit(['remote', 'get-url', 'origin'])).stdout.trim();
  await rm(taskState.workspaceDir, { recursive: true, force: true });
  await mkdir(taskState.workspaceDir, { recursive: true });
  await run('git', ['clone', '--branch', 'main', '--single-branch', originUrl, taskState.repoDir], {
    cwd: taskState.workspaceDir,
    timeoutMs: Number(process.env.CODEX_RAILWAY_MAINTENANCE_CLONE_TIMEOUT_MS || 10 * 60 * 1000)
  });
  await runGitIn(taskState.repoDir, ['checkout', '-b', taskState.branchName]);
  await runGitIn(taskState.repoDir, ['config', 'user.name', process.env.GIT_AUTHOR_NAME || 'CW Nexus Codex Automation']);
  await runGitIn(taskState.repoDir, ['config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'codex-automation@local']);

  if (prepareCommand) {
    const prepare = await run(prepareCommand, [], {
      shell: true,
      allowFailure: true,
      cwd: taskState.repoDir,
      timeoutMs: Number(process.env.CODEX_RAILWAY_MAINTENANCE_PREP_TIMEOUT_MS || 30 * 60 * 1000),
      stdoutPath: join(runDir, `prepare-${taskState.id}.log`)
    });
    taskState.prepareExitCode = prepare.code;
    if (prepare.code !== 0) {
      throw new Error(`Workspace prepare command failed with exit code ${prepare.code}: ${prepareCommand}`);
    }
  }
}

async function preserveWorkspacePatch(taskState) {
  if (!taskState.repoDir || !existsSync(taskState.repoDir)) {
    return;
  }
  await runGitIn(taskState.repoDir, ['add', '-N', '.'], { allowFailure: true });
  const branchDiff = await runGitIn(taskState.repoDir, ['diff', '--binary', 'origin/main'], {
    allowFailure: true
  });
  if (branchDiff.stdout.trim()) {
    const patchPath = join(runDir, `unpublished-${taskState.id}.patch`);
    await writeFile(patchPath, branchDiff.stdout, 'utf8');
    taskState.patchPath = patchPath;
  }
}

async function getBranchAheadCount(cwd) {
  const result = await runGitIn(cwd, ['rev-list', '--count', 'origin/main..HEAD'], { allowFailure: true });
  const count = Number(result.stdout.trim());
  return Number.isFinite(count) ? count : 0;
}

async function readResultFile(path) {
  if (!existsSync(path)) {
    return {
      action: 'no_change',
      category: 'unknown',
      title: '',
      summary: 'Codex did not write a result file.',
      rationale: '',
      risk: 'low',
      filesChanged: [],
      testing: [],
      telegramDescription: ''
    };
  }
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function readCapturedServices() {
  const servicesPath = join(evidenceDir, 'services.json');
  if (!existsSync(servicesPath)) return [];
  const rows = JSON.parse(await readFile(servicesPath, 'utf8'));
  return Array.isArray(rows)
    ? rows.filter((service) => service?.id && service?.name && service.deploymentStopped !== true)
    : [];
}

function buildCommitMessage(task, result) {
  const title = cleanTitle(result.title || task.prTitlePrefix);
  return `${task.commitPrefix}: ${title}`;
}

function buildPullRequestTitle(task, result) {
  return cleanTitle(result.title || task.prTitlePrefix);
}

function buildPullRequestBody(task, taskState) {
  const result = taskState.result || {};
  return [
    '## Summary',
    `- ${result.summary || 'Automated Codex maintenance change.'}`,
    '',
    '## Evidence',
    `- Automation run: ${runId}`,
    `- Review category: ${task.id}`,
    `- Railway evidence window: ${since}`,
    `- Rationale: ${result.rationale || 'See Codex notes for details.'}`,
    '',
    '## Safety',
    '- Generated by the daily Codex Railway maintenance automation.',
    '- Scope is intentionally small and targeted.',
    '- Raw Railway logs and local evidence files are not included in the PR body.',
    '',
    '## Testing',
    ...(Array.isArray(result.testing) && result.testing.length
      ? result.testing.map((item) => `- ${item}`)
      : [`- ${verifyCommand || 'No verification command configured.'}`])
  ].join('\n');
}

async function sendTelegram(task, taskState) {
  const telegramScript = findTelegramScript();
  if (!telegramScript) {
    taskState.telegram = {
      sent: false,
      reason: 'Telegram plugin script was not found.'
    };
    await log('Telegram plugin script was not found; PR notification was not sent.');
    return;
  }

  const description =
    taskState.result?.telegramDescription ||
    taskState.result?.summary ||
    'Automated Codex maintenance PR is ready for review.';
  const message = [
    `${task.telegramTitle}`,
    taskState.prUrl || 'PR URL unavailable',
    '',
    description
  ].join('\n');

  const send = await run('python3', [telegramScript, 'send', message, '--title', 'CW Nexus Codex'], {
    allowFailure: true,
    timeoutMs: 60_000
  });
  taskState.telegram = {
    sent: send.code === 0,
    exitCode: send.code
  };
}

function findTelegramScript() {
  const configured = process.env.CODEX_RAILWAY_MAINTENANCE_TELEGRAM_SCRIPT;
  const candidates = [
    configured,
    join(homedir(), '.codex', 'plugins', 'cache', 'local-codex-plugins', 'telegram', '0.1.0', 'scripts', 'telegram.py'),
    join(homedir(), 'plugins', 'telegram', 'scripts', 'telegram.py')
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

async function appendHistory(event) {
  const entry = {
    event,
    runId,
    at: new Date().toISOString(),
    status: runState.status,
    since,
    evidence: runState.evidence.map((item) => ({
      name: item.name,
      ok: item.ok,
      rows: item.rows,
      digest: item.digest
    })),
    tasks: runState.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      branchName: task.branchName,
      prUrl: task.prUrl,
      error: task.error
    }))
  };
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function finishRun() {
  runState.finishedAt = new Date().toISOString();
  await writeJson(join(runDir, 'run-state.json'), runState);
  await writeJson(join(stateDir, 'last-run.json'), runState);
  await appendHistory(`run_${runState.status}`);
  await log(`Finished run ${runId} with status ${runState.status}`);
}

function runGit(args, options = {}) {
  return run('git', args, { cwd: repoRoot, ...options });
}

function runGitIn(cwd, args, options = {}) {
  return run('git', args, { cwd, ...options });
}

function run(command, commandArgs, options = {}) {
  const cwd = options.cwd || repoRoot;
  const timeoutMs = options.timeoutMs || 120_000;
  const shell = options.shell || false;
  const rendered = shell ? command : [command, ...commandArgs].map(shellQuote).join(' ');

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, NO_COLOR: '1', ...(options.env || {}) },
      shell,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
    }, timeoutMs);
    timer.unref?.();

    void log(`$ ${rendered}`);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.stdoutPath) {
        void appendFile(options.stdoutPath, redactSensitive(text), 'utf8');
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = {
        code: typeof code === 'number' ? code : 1,
        signal,
        stdout,
        stderr,
        timedOut
      };
      const failed = result.code !== 0 || timedOut;
      const message = timedOut
        ? `${rendered} timed out after ${timeoutMs}ms`
        : `${rendered} exited with ${signal || result.code}`;
      if (failed) {
        void log(message);
      }
      if (failed && !options.allowFailure) {
        reject(new Error(`${message}\n${stderr || stdout}`));
        return;
      }
      resolvePromise(result);
    });
  });
}

async function log(message) {
  await appendFile(logPath, `[${new Date().toISOString()}] ${redactSensitive(message)}\n`, 'utf8');
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(redactValue(value), null, 2), 'utf8');
}

function parseArgs(argv) {
  const parsed = {
    collectOnly: false,
    verify: true,
    prepare: true,
    since: null,
    task: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--collect-only') parsed.collectOnly = true;
    else if (arg === '--no-verify') parsed.verify = false;
    else if (arg === '--no-prepare') parsed.prepare = false;
    else if (arg === '--since') parsed.since = argv[++index];
    else if (arg === '--task') parsed.task = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/codex-railway-maintenance.mjs [--collect-only] [--since 24h] [--task usage|bugs] [--no-prepare] [--no-verify]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.task && !['usage', 'bugs'].includes(parsed.task)) {
    throw new Error('--task must be "usage" or "bugs".');
  }
  return parsed;
}

function parseJsonOrText(text) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { message: line };
      }
    });
}

function digestJson(value) {
  if (!value || typeof value !== 'object') {
    return { type: typeof value };
  }
  if (Array.isArray(value)) {
    return { type: 'array', rows: value.length };
  }
  const services = Array.isArray(value.services)
    ? value.services.map((service) => ({
        name: service.name,
        cpuPct: service.cpu?.utilization_pct,
        memoryPct: service.memory?.utilization_pct,
        httpTotal: service.http?.total,
        http5xx: service.http?.['5xx'],
        http4xx: service.http?.['4xx'],
        p95Ms: service.http?.p95_ms,
        p99Ms: service.http?.p99_ms
      }))
    : undefined;
  return {
    type: 'object',
    keys: Object.keys(value).slice(0, 20),
    ...(value.project ? { project: value.project } : {}),
    ...(value.environment ? { environment: value.environment } : {}),
    ...(services ? { services } : {})
  };
}

function digestRows(rows) {
  const statusCounts = {};
  const levelCounts = {};
  const pathCounts = {};
  for (const row of rows) {
    const status = row.httpStatus || row.res?.statusCode;
    if (status) statusCounts[String(status)] = (statusCounts[String(status)] || 0) + 1;
    const level = row.level;
    if (level) levelCounts[String(level)] = (levelCounts[String(level)] || 0) + 1;
    const path = row.path || row.req?.url;
    if (path) pathCounts[String(path)] = (pathCounts[String(path)] || 0) + 1;
  }
  return {
    rows: rows.length,
    statusCounts,
    levelCounts,
    topPaths: Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }))
  };
}

function redactValue(value) {
  if (typeof value === 'string') return redactSensitive(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = '<redacted>';
    } else {
      output[key] = redactValue(raw);
    }
  }
  return output;
}

function redactSensitive(text) {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer <redacted>')
    .replace(/\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g, '<redacted-github-token>')
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '<redacted-telegram-token>')
    .replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s"']+/gi, 'https://discord.com/api/webhooks/<redacted>')
    .replace(/(authorization|cookie|set-cookie|token|secret|password|api[_-]?key)(["'\s:=]+)([^"',\s}]+)/gi, '$1$2<redacted>');
}

function isSensitiveKey(key) {
  return /authorization|cookie|token|secret|password|api[_-]?key|webhookUrl|webhook_url/i.test(key);
}

function stringifyError(error) {
  return redactSensitive(error instanceof Error ? error.stack || error.message : String(error));
}

function extractPullRequestUrl(text) {
  return String(text).match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0] || null;
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function slugify(value) {
  return String(value || 'service')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'service';
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function toRunId(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '-');
}
