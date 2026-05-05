/**
 * Track whether a Test Manager change is ready for tester input.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'readyToTest');
  if (!hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.boolean('readyToTest').notNullable().defaultTo(true).after('includeInNextPatch');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'readyToTest');
  if (hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.dropColumn('readyToTest');
    });
  }
}
