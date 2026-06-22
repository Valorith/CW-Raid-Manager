/**
 * Add Codex runner reliability state, event timeline, and artifacts.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const addColumn = async (columnName, callback) => {
    const exists = await knex.schema.hasColumn('CodexJob', columnName);
    if (!exists) {
      await knex.schema.alterTable('CodexJob', callback);
    }
  };

  await addColumn('retryCount', (table) => {
    table.integer('retryCount').notNullable().defaultTo(0).after('result');
  });
  await addColumn('maxRetries', (table) => {
    table.integer('maxRetries').notNullable().defaultTo(1).after('retryCount');
  });
  await addColumn('failureCategory', (table) => {
    table.string('failureCategory', 80).nullable().after('maxRetries');
  });
  await addColumn('leaseExpiresAt', (table) => {
    table.dateTime('leaseExpiresAt', { precision: 3 }).nullable().after('failureCategory');
  });
  await addColumn('lastHeartbeatAt', (table) => {
    table.dateTime('lastHeartbeatAt', { precision: 3 }).nullable().after('leaseExpiresAt');
  });

  const indexes = await knex.raw('SHOW INDEX FROM `CodexJob` WHERE Key_name = ?', [
    'CodexJob_status_lease_idx'
  ]);
  const indexRows = Array.isArray(indexes) ? indexes[0] : [];
  if (!Array.isArray(indexRows) || indexRows.length === 0) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.index(['status', 'leaseExpiresAt'], 'CodexJob_status_lease_idx');
    });
  }

  const hasEventTable = await knex.schema.hasTable('CodexJobEvent');
  if (!hasEventTable) {
    await knex.schema.raw(`
      CREATE TABLE \`CodexJobEvent\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`jobId\` VARCHAR(191) NOT NULL,
        \`runnerId\` VARCHAR(120) NULL,
        \`type\` VARCHAR(80) NOT NULL,
        \`message\` TEXT NULL,
        \`data\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`CodexJobEvent_jobId_createdAt_idx\` (\`jobId\`, \`createdAt\`),
        INDEX \`CodexJobEvent_type_createdAt_idx\` (\`type\`, \`createdAt\`),
        CONSTRAINT \`CodexJobEvent_jobId_fkey\` FOREIGN KEY (\`jobId\`) REFERENCES \`CodexJob\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  const hasArtifactTable = await knex.schema.hasTable('CodexJobArtifact');
  if (!hasArtifactTable) {
    await knex.schema.raw(`
      CREATE TABLE \`CodexJobArtifact\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`jobId\` VARCHAR(191) NOT NULL,
        \`runnerId\` VARCHAR(120) NULL,
        \`type\` VARCHAR(80) NOT NULL,
        \`label\` VARCHAR(160) NOT NULL,
        \`content\` LONGTEXT NULL,
        \`url\` VARCHAR(1024) NULL,
        \`metadata\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`CodexJobArtifact_jobId_createdAt_idx\` (\`jobId\`, \`createdAt\`),
        INDEX \`CodexJobArtifact_type_createdAt_idx\` (\`type\`, \`createdAt\`),
        CONSTRAINT \`CodexJobArtifact_jobId_fkey\` FOREIGN KEY (\`jobId\`) REFERENCES \`CodexJob\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `CodexJobArtifact`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `CodexJobEvent`;');

  const indexes = await knex.raw('SHOW INDEX FROM `CodexJob` WHERE Key_name = ?', [
    'CodexJob_status_lease_idx'
  ]);
  const indexRows = Array.isArray(indexes) ? indexes[0] : [];
  if (Array.isArray(indexRows) && indexRows.length > 0) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.dropIndex(['status', 'leaseExpiresAt'], 'CodexJob_status_lease_idx');
    });
  }

  for (const columnName of [
    'lastHeartbeatAt',
    'leaseExpiresAt',
    'failureCategory',
    'maxRetries',
    'retryCount'
  ]) {
    const exists = await knex.schema.hasColumn('CodexJob', columnName);
    if (exists) {
      await knex.schema.alterTable('CodexJob', (table) => {
        table.dropColumn(columnName);
      });
    }
  }
}
