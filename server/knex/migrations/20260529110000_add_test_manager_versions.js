/**
 * Add per-change test server version tracking for Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'testServerVersion');
  if (!hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.string('testServerVersion', 80).nullable().after('targetBuild');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'testServerVersion');
  if (hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.dropColumn('testServerVersion');
    });
  }
}
