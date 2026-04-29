/**
 * Track whether completed Test Manager changes should appear in the next patch list.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'includeInNextPatch');
  if (!hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.boolean('includeInNextPatch').notNullable().defaultTo(true).after('githubPrMetadata');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'includeInNextPatch');
  if (hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.dropColumn('includeInNextPatch');
    });
  }
}
