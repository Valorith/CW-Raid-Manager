#!/usr/bin/env node
const { existsSync, readdirSync, statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const repoRoot = join(__dirname, '..');
const cliEntry = join(repoRoot, 'cli', 'build', 'index.js');
const cliSourceDir = join(repoRoot, 'cli', 'src');
const isWindows = process.platform === 'win32';

function resolveCommand(command) {
  if (!isWindows) {
    return command;
  }

  return command.endsWith('.cmd') ? command : `${command}.cmd`;
}

function newestTypeScriptMtime(directory) {
  let newest = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestTypeScriptMtime(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}

function needsBuild() {
  if (!existsSync(cliEntry)) {
    return true;
  }

  try {
    return newestTypeScriptMtime(cliSourceDir) > statSync(cliEntry).mtimeMs;
  } catch {
    return true;
  }
}

if (needsBuild()) {
  const build = spawnSync(
    resolveCommand('npm'),
    ['--workspace', 'cli', 'run', 'build', '--silent'],
    {
      cwd: repoRoot,
      shell: isWindows,
      stdio: 'inherit'
    }
  );
  if (build.error) {
    console.error(`Failed to build Nexus CLI: ${build.error.message}`);
  }
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const result = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(1);
