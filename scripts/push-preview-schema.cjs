const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

async function archiveUninitializedKnexTables() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [tables] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const names = new Set(tables.map(({ name }) => name));
    if (names.size !== 2 || !names.has('knex_migrations') || !names.has('knex_migrations_lock')) {
      return;
    }

    const [[{ database, recordedMigrations, activeLocks }]] = await connection.query(
      `SELECT DATABASE() AS \`database\`,
              (SELECT COUNT(*) FROM knex_migrations) AS recordedMigrations,
              (SELECT COUNT(*) FROM knex_migrations_lock WHERE is_locked <> 0) AS activeLocks`
    );
    if (Number(recordedMigrations) !== 0 || Number(activeLocks) !== 0) {
      throw new Error('The preview database has applied Knex migrations or an active migration lock.');
    }

    const archive = `${database}_knex_archive`;
    await connection.query('CREATE DATABASE IF NOT EXISTS ??', [archive]);
    await connection.query('RENAME TABLE ?? TO ??, ?? TO ??', [
      `${database}.knex_migrations`,
      `${archive}.knex_migrations`,
      `${database}.knex_migrations_lock`,
      `${archive}.knex_migrations_lock`
    ]);
    console.info('Archived Knex bookkeeping from the uninitialized preview database.');
  } finally {
    await connection.end();
  }
}

async function main() {
  if (!/(?:^|-)pr-\d+$/i.test(process.env.RAILWAY_ENVIRONMENT_NAME ?? '')) {
    throw new Error('Preview schema setup requires a Railway PR environment.');
  }

  await archiveUninitializedKnexTables();
  const prisma = require.resolve('prisma/build/index.js', { paths: [process.cwd()] });
  const result = spawnSync(process.execPath, [prisma, 'db', 'push', '--skip-generate'], {
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
