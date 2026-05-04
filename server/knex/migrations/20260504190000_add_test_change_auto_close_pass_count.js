/**
 * Add an optional pass threshold for automatically closing Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'autoClosePassCount');
  if (!hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table
        .integer('autoClosePassCount')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('includeInNextPatch');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'autoClosePassCount');
  if (hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.dropColumn('autoClosePassCount');
    });
  }
}
