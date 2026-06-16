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

async function ensurePageFavoriteForeignKey(knex) {
  const constraintName = 'PageFavorite_userId_fkey';
  if (await hasForeignKey(knex, constraintName)) {
    return;
  }

  await knex.schema.alterTable('PageFavorite', (table) => {
    table
      .foreign('userId', constraintName)
      .references('User.id')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
}

/**
 * Add account-scoped navbar page favorites that sync across browsers/devices.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const userIdCharacterSet = await getUserIdCharacterSet(knex);
  const hasPageFavorite = await knex.schema.hasTable('PageFavorite');

  if (!hasPageFavorite) {
    await knex.schema.createTable('PageFavorite', (table) => {
      table.charset(userIdCharacterSet.charset);
      table.collate(userIdCharacterSet.collation);
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.string('label', 80).notNullable();
      table.string('path', 240).notNullable();
      table.integer('sortOrder').notNullable().defaultTo(0);
      table.dateTime('addedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['userId', 'path'], {
        indexName: 'PageFavorite_user_path_key'
      });
      table.index(['userId', 'sortOrder'], 'PageFavorite_user_sort_idx');
    });
  }

  await ensurePageFavoriteForeignKey(knex);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasPageFavorite = await knex.schema.hasTable('PageFavorite');
  if (hasPageFavorite) {
    await knex.schema.dropTable('PageFavorite');
  }
}
