#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const label = 'com.valorith.cw-railway-maintenance';
const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
const plistPath = join(launchAgentsDir, `${label}.plist`);
const automationRoot = resolve(
  process.env.CODEX_RAILWAY_MAINTENANCE_HOME ||
    join(homedir(), '.codex', 'automations', 'cw-railway-maintenance')
);
const logsDir = join(automationRoot, 'logs');
const uid = process.getuid?.();
const domain = uid ? `gui/${uid}` : null;
const args = new Set(process.argv.slice(2));

if (args.has('--uninstall')) {
  await unload();
  await rm(plistPath, { force: true });
  console.log(`Removed ${plistPath}`);
  process.exit(0);
}

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(logsDir, { recursive: true });

const nodeBin = process.execPath;
const commandBins = {
  codexBin: resolveCommand('codex'),
  ghBin: resolveCommand('gh'),
  railwayBin: resolveCommand('railway')
};
const scriptPath = join(repoRoot, 'scripts', 'codex-railway-maintenance.mjs');
if (!existsSync(scriptPath)) {
  throw new Error(`Missing automation script: ${scriptPath}`);
}

const plist = buildPlist({
  label,
  nodeBin,
  ...commandBins,
  scriptPath,
  repoRoot,
  automationRoot,
  stdoutPath: join(logsDir, 'launchd.out.log'),
  stderrPath: join(logsDir, 'launchd.err.log')
});

await writeFile(plistPath, plist, 'utf8');
console.log(`Wrote ${plistPath}`);

if (args.has('--no-load')) {
  console.log('Skipped launchd load because --no-load was provided.');
  process.exit(0);
}

await unload();
const bootstrap = runLaunchctl(['bootstrap', domain, plistPath]);
if (bootstrap.status !== 0) {
  throw new Error(`launchctl bootstrap failed:\n${bootstrap.stderr || bootstrap.stdout}`);
}

const enable = runLaunchctl(['enable', `${domain}/${label}`]);
if (enable.status !== 0) {
  throw new Error(`launchctl enable failed:\n${enable.stderr || enable.stdout}`);
}

console.log(`${label} is loaded. It will run daily at 2:00 AM local time.`);

async function unload() {
  if (!domain) return;
  runLaunchctl(['bootout', domain, plistPath]);
  runLaunchctl(['bootout', `${domain}/${label}`]);
}

function runLaunchctl(commandArgs) {
  return spawnSync('launchctl', commandArgs, {
    encoding: 'utf8'
  });
}

function resolveCommand(command) {
  const result = spawnSync('/usr/bin/which', [command], {
    encoding: 'utf8'
  });
  if (result.status !== 0) return command;
  return result.stdout.trim().split('\n')[0] || command;
}

function buildPlist(config) {
  const pathValue = dedupePathEntries([
    join(homedir(), '.railway', 'bin'),
    join(homedir(), '.npm-global', 'bin'),
    join(homedir(), '.local', 'bin'),
    join(homedir(), 'homebrew', 'bin'),
    commandDir(config.codexBin),
    commandDir(config.ghBin),
    commandDir(config.railwayBin),
    dirname(config.nodeBin),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]).join(':');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(config.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>-i</string>
    <string>HOME=${escapeXml(homedir())}</string>
    <string>USER=${escapeXml(process.env.USER || '')}</string>
    <string>LOGNAME=${escapeXml(process.env.LOGNAME || process.env.USER || '')}</string>
    <string>SHELL=${escapeXml(process.env.SHELL || '/bin/zsh')}</string>
    <string>PATH=${escapeXml(pathValue)}</string>
    <string>CODEX_RAILWAY_MAINTENANCE_HOME=${escapeXml(config.automationRoot)}</string>
    <string>CODEX_BIN=${escapeXml(config.codexBin)}</string>
    <string>GH_BIN=${escapeXml(config.ghBin)}</string>
    <string>RAILWAY_BIN=${escapeXml(config.railwayBin)}</string>
    <string>${escapeXml(config.nodeBin)}</string>
    <string>${escapeXml(config.scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(config.repoRoot)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(config.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(config.stderrPath)}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;
}

function commandDir(commandPath) {
  return isAbsolute(commandPath) ? dirname(commandPath) : null;
}

function dedupePathEntries(entries) {
  return [...new Set(entries.filter(Boolean))];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
