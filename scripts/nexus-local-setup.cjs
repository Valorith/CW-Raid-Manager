#!/usr/bin/env node
const { spawn, spawnSync } = require('node:child_process');
const {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} = require('node:fs');
const { homedir } = require('node:os');
const { dirname, join } = require('node:path');

const repoRoot = join(__dirname, '..');
const runtimeDir = join(repoRoot, '.nexus');
const logDir = join(runtimeDir, 'logs');
const processFile = join(runtimeDir, 'dev-processes.json');
const apiUrl = trimTrailingSlash(process.env.NEXUS_LOCAL_URL ?? 'http://localhost:4000');
const clientUrl = trimTrailingSlash(process.env.NEXUS_LOCAL_CLIENT_URL ?? 'http://localhost:5173');
const isWindows = process.platform === 'win32';

function resolveCommand(command) {
  if (!isWindows) {
    return command;
  }

  return command.endsWith('.cmd') ? command : `${command}.cmd`;
}

function parseArgs(argv) {
  const passthrough = [];
  const options = {
    fresh: false,
    help: false,
    skipDev: false,
    skipMigrations: false,
    stop: false
  };

  for (const arg of argv) {
    if (arg === '--fresh') {
      options.fresh = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--skip-dev') {
      options.skipDev = true;
    } else if (arg === '--skip-migrations') {
      options.skipMigrations = true;
    } else if (arg === '--stop') {
      options.stop = true;
    } else {
      passthrough.push(arg);
    }
  }

  return { options, passthrough };
}

async function main() {
  const { options, passthrough } = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.stop) {
    stopStartedDevProcesses();
    return;
  }

  ensureRuntimeDirs();

  if (options.fresh) {
    const profileName = stringArg(passthrough, 'profile') ?? 'local';
    removeProfile(profileName);
  }

  if (!options.skipMigrations) {
    runStep('Generating Prisma client', ['--workspace', 'server', 'run', 'prisma:generate']);
    runStep('Applying Knex migrations', ['--workspace', 'server', 'run', 'knex:migrate']);
  }

  if (!options.skipDev) {
    await ensureLocalDevStack();
  }

  console.log('');
  console.log('Starting Nexus CLI setup. The only expected manual step is browser authorization.');
  const setupArgs = ['setup', '--local', ...passthrough];
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'nexus.cjs'), ...setupArgs], {
    cwd: repoRoot,
    env: { ...process.env, NEXUS_LOCAL_URL: apiUrl },
    stdio: 'inherit'
  });

  process.exit(result.status ?? 1);
}

function runStep(label, args) {
  console.log(`${label}...`);
  const result = spawnSync(resolveCommand('npm'), args, {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function ensureLocalDevStack() {
  const apiReady = await isUrlReady(`${apiUrl}/health`);
  const clientReady = await isUrlReady(clientUrl);

  if (!apiReady) {
    startDetached('server', ['--workspace', 'server', 'run', 'dev']);
  } else {
    console.log(`API already running at ${apiUrl}.`);
  }

  if (!clientReady) {
    startDetached('client', ['--workspace', 'client', 'run', 'dev'], {
      OPEN_BROWSER: 'false'
    });
  } else {
    console.log(`Client already running at ${clientUrl}.`);
  }

  await waitForUrl(`${apiUrl}/health`, 'API');
  await waitForUrl(clientUrl, 'client');
}

function startDetached(name, args, extraEnv = {}) {
  const logPath = join(logDir, `${name}.log`);
  const logFd = openSync(logPath, 'a');
  const child = spawn(resolveCommand('npm'), args, {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', logFd, logFd],
    windowsHide: false
  });
  child.unref();
  closeSync(logFd);

  writeStartedProcess(name, child.pid, logPath);
  console.log(`Started ${name} dev process (pid ${child.pid}). Logs: ${logPath}`);
}

function writeStartedProcess(name, pid, logPath) {
  const current = readStartedProcesses();
  current[name] = {
    pid,
    logPath,
    startedAt: new Date().toISOString()
  };
  writeFileSync(processFile, `${JSON.stringify(current, null, 2)}\n`, 'utf-8');
}

function readStartedProcesses() {
  try {
    return JSON.parse(readFileSync(processFile, 'utf-8'));
  } catch {
    return {};
  }
}

function stopStartedDevProcesses() {
  const processes = readStartedProcesses();
  const entries = Object.entries(processes);
  if (!entries.length) {
    console.log('No Nexus dev processes are recorded.');
    return;
  }

  for (const [name, info] of entries) {
    const pid = Number(info.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      continue;
    }

    console.log(`Stopping ${name} dev process (pid ${pid})...`);
    if (isWindows) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process is already gone.
        }
      }
    }
  }

  writeFileSync(processFile, '{}\n', 'utf-8');
}

async function waitForUrl(url, label) {
  const timeoutMs = 120_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReady(url)) {
      console.log(`${label} is ready at ${url}.`);
      return;
    }
    await delay(1000);
  }

  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs / 1000}s.`);
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function removeProfile(profileName) {
  const configPath = defaultConfigPath();
  if (!existsSync(configPath)) {
    return;
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (!config.profiles?.[profileName]) {
    return;
  }

  delete config.profiles[profileName];
  if (config.activeProfile === profileName) {
    config.activeProfile = Object.keys(config.profiles)[0] ?? 'default';
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  console.log(`Removed existing "${profileName}" CLI profile for a fresh setup.`);
}

function defaultConfigPath() {
  if (process.env.NEXUS_CONFIG_PATH) {
    return process.env.NEXUS_CONFIG_PATH;
  }

  if (process.env.APPDATA) {
    return join(process.env.APPDATA, 'Nexus CLI', 'config.json');
  }

  return join(homedir(), '.config', 'nexus', 'config.json');
}

function stringArg(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === `--${name}`) {
      return args[index + 1];
    }
    if (value.startsWith(`--${name}=`)) {
      return value.slice(name.length + 3);
    }
  }
  return undefined;
}

function ensureRuntimeDirs() {
  mkdirSync(logDir, { recursive: true });
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHelp() {
  console.log(`Nexus local setup

Usage:
  npm run nexus:setup
  npm run nexus:setup:fresh
  npm run nexus:dev:stop

Options:
  --fresh             Remove the target CLI profile before setup
  --profile <name>    Profile to create, defaults to local
  --skip-migrations   Do not run Prisma generate or Knex migrations
  --skip-dev          Do not start or wait for local dev processes
  --no-open           Pass through to CLI setup without opening the browser

Environment:
  NEXUS_LOCAL_URL            API URL, defaults to http://localhost:4000
  NEXUS_LOCAL_CLIENT_URL     Client URL, defaults to http://localhost:5173
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
