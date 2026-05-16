/**
 * Add general context links to Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'contextLinks');

  if (!hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.json('contextLinks').nullable().after('githubIssueMetadata');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('TestChange', 'contextLinks');

  if (hasColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      table.dropColumn('contextLinks');
    });
  }
}
