#!/usr/bin/env node

// Ensures DATABASE_URL is always available for Prisma and runtime commands.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(rawArgs) {
  const options = {
    allowMissing: false
  };

  const commandParts = [];
  let commandSeen = false;

  for (const arg of rawArgs) {
    if (!commandSeen && arg?.startsWith('--')) {
      if (arg === '--allow-missing') {
        options.allowMissing = true;
        continue;
      }

      console.error(`[with-db-url] Unknown option "${arg}".`);
      process.exit(1);
    }

    commandSeen = true;
    commandParts.push(arg);
  }

  if (commandParts.length === 0) {
    console.error('[with-db-url] Usage: node run-with-db-url.cjs [--allow-missing] <command> [...args]');
    process.exit(1);
  }

  const [command, ...args] = commandParts;
  return { command, args, options };
}

function loadEnvFiles() {
  let dotenv;
  try {
    dotenv = require('dotenv');
  } catch {
    return;
  }

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../server/.env'),
    path.resolve(__dirname, '../server/prisma/.env')
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

function deriveDatabaseUrl(env) {
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
    return env.DATABASE_URL.trim();
  }

  const directMysqlUrl = env.MYSQL_URL || env.MYSQL_PUBLIC_URL;
  if (directMysqlUrl && directMysqlUrl.trim() !== '') {
    return directMysqlUrl.trim();
  }

  const database =
    env.MYSQL_DATABASE ||
    env.MYSQLDATABASE ||
    env.MYSQL_DB ||
    env.MYSQLNAME ||
    env.MYSQLSCHEMA;
  const host = env.MYSQLHOST || env.MYSQL_HOST;
  const port = env.MYSQLPORT || env.MYSQL_PORT;
  const user = env.MYSQLUSER || env.MYSQL_USER;
  const password =
    env.MYSQLPASSWORD || env.MYSQL_PASSWORD || env.MYSQL_ROOT_PASSWORD || env.MYSQLPWD;

  if (!host || !user || !database) {
    return undefined;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = password ? `:${encodeURIComponent(password)}` : '';
  const portSegment = port ? `:${port}` : '';

  return `mysql://${encodedUser}${encodedPassword}@${host}${portSegment}/${encodeURIComponent(
    database
  )}`;
}

function ensureDatabaseUrl({ allowMissing }) {
  loadEnvFiles();

  const derived = deriveDatabaseUrl(process.env);

  if (!process.env.DATABASE_URL && derived) {
    process.env.DATABASE_URL = derived;
    console.info('[with-db-url] Using derived DATABASE_URL value for this command.');
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return;
  }

  if (allowMissing) {
    const placeholder = 'mysql://user:password@localhost:3306/placeholder';
    process.env.DATABASE_URL = placeholder;
    console.warn(
      `[with-db-url] DATABASE_URL is not set. Using placeholder value (${placeholder}) for tooling that does not need a live connection.`
    );
    return;
  }

  const inspected = {
    DATABASE_URL: process.env.DATABASE_URL ? '<present>' : '<missing>',
    MYSQL_URL: process.env.MYSQL_URL ? '<present>' : '<missing>',
    MYSQL_PUBLIC_URL: process.env.MYSQL_PUBLIC_URL ? '<present>' : '<missing>',
    MYSQLHOST: process.env.MYSQLHOST ? '<present>' : '<missing>',
    MYSQLPORT: process.env.MYSQLPORT ? '<present>' : '<missing>',
    MYSQLUSER: process.env.MYSQLUSER ? '<present>' : '<missing>',
    MYSQLPASSWORD: process.env.MYSQLPASSWORD ? '<present>' : '<missing>',
    MYSQL_DATABASE: process.env.MYSQL_DATABASE ? '<present>' : '<missing>',
    MYSQLDATABASE: process.env.MYSQLDATABASE ? '<present>' : '<missing>'
  };

  console.error(
    '[with-db-url] DATABASE_URL is not set and could not be derived. Provide DATABASE_URL or the standard Railway MySQL variables (MYSQL_URL or MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQL_DATABASE).'
  );
  console.error('[with-db-url] Current MYSQL-related env inspection:', inspected);
  process.exit(1);
}

function runCommand({ command, args }) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(`[with-db-url] Failed to start "${command}":`, error);
    process.exit(1);
  });
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  ensureDatabaseUrl(parsed.options);
  runCommand(parsed);
}

main();
