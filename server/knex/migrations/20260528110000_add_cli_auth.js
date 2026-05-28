async function getUserIdCharacterSet(knex) {
  const [[userIdColumn]] = await knex.raw("SHOW FULL COLUMNS FROM `User` LIKE 'id'");
  const collation = (userIdColumn && userIdColumn.Collation) || 'utf8mb4_unicode_ci';
  const charset = typeof collation === 'string' ? collation.split('_')[0] || 'utf8mb4' : 'utf8mb4';
  return { charset, collation };
}

async function hasForeignKey(knex, constraintName) {
  const [rows] = await knex.raw(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = ?
    `,
    [constraintName]
  );
  return rows.length > 0;
}

async function alignTableCollation(knex, tableName, charset, collation) {
  await knex.raw(
    `ALTER TABLE ?? CONVERT TO CHARACTER SET ${charset} COLLATE ${collation}`,
    [tableName]
  );
}

async function ensureCliDeviceLoginForeignKey(knex) {
  const constraintName = 'CliDeviceLogin_approvedById_fkey';
  if (await hasForeignKey(knex, constraintName)) {
    return;
  }

  await knex.schema.alterTable('CliDeviceLogin', (table) => {
    table
      .foreign('approvedById', constraintName)
      .references('User.id')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
  });
}

async function ensureCliSessionForeignKey(knex) {
  const constraintName = 'CliSession_userId_fkey';
  if (await hasForeignKey(knex, constraintName)) {
    return;
  }

  await knex.schema.alterTable('CliSession', (table) => {
    table
      .foreign('userId', constraintName)
      .references('User.id')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
}

export async function up(knex) {
  const userIdCharacterSet = await getUserIdCharacterSet(knex);
  const hasDeviceLogins = await knex.schema.hasTable('CliDeviceLogin');
  if (!hasDeviceLogins) {
    await knex.schema.createTable('CliDeviceLogin', (table) => {
      table.charset(userIdCharacterSet.charset);
      table.collate(userIdCharacterSet.collation);
      table.string('id', 191).primary();
      table.string('deviceCodeHash', 64).notNullable().unique();
      table.string('userCodeHash', 64).notNullable().unique();
      table.string('userCode', 16).notNullable();
      table.string('clientName', 191).notNullable();
      table.json('requestedScopes').nullable();
      table.string('approvedById', 191).nullable();
      table.dateTime('approvedAt').nullable();
      table.dateTime('deniedAt').nullable();
      table.dateTime('consumedAt').nullable();
      table.dateTime('expiresAt').notNullable();
      table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

      table.index(['expiresAt'], 'CliDeviceLogin_expiresAt_idx');
      table.index(['approvedById'], 'CliDeviceLogin_approvedById_idx');
    });
  }
  await alignTableCollation(
    knex,
    'CliDeviceLogin',
    userIdCharacterSet.charset,
    userIdCharacterSet.collation
  );
  await ensureCliDeviceLoginForeignKey(knex);

  const hasSessions = await knex.schema.hasTable('CliSession');
  if (!hasSessions) {
    await knex.schema.createTable('CliSession', (table) => {
      table.charset(userIdCharacterSet.charset);
      table.collate(userIdCharacterSet.collation);
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.string('tokenHash', 64).notNullable().unique();
      table.string('name', 191).notNullable();
      table.json('scopes').nullable();
      table.dateTime('lastUsedAt').nullable();
      table.dateTime('expiresAt').notNullable();
      table.dateTime('revokedAt').nullable();
      table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

      table.index(['userId', 'revokedAt'], 'CliSession_user_revoked_idx');
      table.index(['expiresAt'], 'CliSession_expiresAt_idx');
    });
  }
  await alignTableCollation(
    knex,
    'CliSession',
    userIdCharacterSet.charset,
    userIdCharacterSet.collation
  );
  await ensureCliSessionForeignKey(knex);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasSessions = await knex.schema.hasTable('CliSession');
  if (hasSessions) {
    await knex.schema.dropTable('CliSession');
  }

  const hasDeviceLogins = await knex.schema.hasTable('CliDeviceLogin');
  if (hasDeviceLogins) {
    await knex.schema.dropTable('CliDeviceLogin');
  }
}
