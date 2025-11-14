#!/usr/bin/env node

/**
 * Ensures server/node_modules/@prisma/client exists. If it's missing (like on CI),
 * installs it locally without modifying package-lock.json.
 */

const { existsSync, mkdirSync, cpSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const serverDir = process.cwd();
const prismaClientPath = path.join(serverDir, 'node_modules', '@prisma', 'client');
const rootPrismaPath = path.resolve(serverDir, '..', 'node_modules', '@prisma', 'client');

if (existsSync(prismaClientPath)) {
  process.exit(0);
}

if (existsSync(rootPrismaPath)) {
  mkdirSync(path.dirname(prismaClientPath), { recursive: true });
  cpSync(rootPrismaPath, prismaClientPath, { recursive: true });
  process.exit(0);
}

const result = spawnSync(
  'npm',
  ['install', '--no-save', '@prisma/client@5.22.0'],
  {
    cwd: serverDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);

process.exit(result.status ?? 0);
