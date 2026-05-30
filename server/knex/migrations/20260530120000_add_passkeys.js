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

async function ensureUserPasskeyForeignKey(knex) {
  const constraintName = 'UserPasskey_userId_fkey';
  if (await hasForeignKey(knex, constraintName)) {
    return;
  }

  await knex.schema.alterTable('UserPasskey', (table) => {
    table
      .foreign('userId', constraintName)
      .references('User.id')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
}

async function ensurePasskeyChallengeForeignKey(knex) {
  const constraintName = 'PasskeyChallenge_userId_fkey';
  if (await hasForeignKey(knex, constraintName)) {
    return;
  }

  await knex.schema.alterTable('PasskeyChallenge', (table) => {
    table
      .foreign('userId', constraintName)
      .references('User.id')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
}

export async function up(knex) {
  const userIdCharacterSet = await getUserIdCharacterSet(knex);

  const hasUserPasskeys = await knex.schema.hasTable('UserPasskey');
  if (!hasUserPasskeys) {
    await knex.schema.createTable('UserPasskey', (table) => {
      table.charset(userIdCharacterSet.charset);
      table.collate(userIdCharacterSet.collation);
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.string('credentialIdHash', 64).notNullable().unique();
      table.text('credentialId').notNullable();
      table.text('publicKey').notNullable();
      table.bigInteger('counter').notNullable().defaultTo(0);
      table.json('transports').nullable();
      table.string('deviceType', 32).nullable();
      table.boolean('backedUp').notNullable().defaultTo(false);
      table.string('name', 191).notNullable();
      table.dateTime('lastUsedAt').nullable();
      table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

      table.index(['userId', 'createdAt'], 'UserPasskey_user_created_idx');
    });
  }
  await alignTableCollation(
    knex,
    'UserPasskey',
    userIdCharacterSet.charset,
    userIdCharacterSet.collation
  );
  await ensureUserPasskeyForeignKey(knex);

  const hasPasskeyChallenges = await knex.schema.hasTable('PasskeyChallenge');
  if (!hasPasskeyChallenges) {
    await knex.schema.createTable('PasskeyChallenge', (table) => {
      table.charset(userIdCharacterSet.charset);
      table.collate(userIdCharacterSet.collation);
      table.string('id', 191).primary();
      table.string('userId', 191).nullable();
      table.string('type', 32).notNullable();
      table.string('challengeHash', 64).notNullable().unique();
      table.dateTime('expiresAt').notNullable();
      table.dateTime('consumedAt').nullable();
      table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());

      table.index(['userId', 'type', 'expiresAt'], 'PasskeyChallenge_user_type_expires_idx');
      table.index(['type', 'expiresAt'], 'PasskeyChallenge_type_expires_idx');
    });
  }
  await alignTableCollation(
    knex,
    'PasskeyChallenge',
    userIdCharacterSet.charset,
    userIdCharacterSet.collation
  );
  await ensurePasskeyChallengeForeignKey(knex);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasPasskeyChallenges = await knex.schema.hasTable('PasskeyChallenge');
  if (hasPasskeyChallenges) {
    await knex.schema.dropTable('PasskeyChallenge');
  }

  const hasUserPasskeys = await knex.schema.hasTable('UserPasskey');
  if (hasUserPasskeys) {
    await knex.schema.dropTable('UserPasskey');
  }
}
