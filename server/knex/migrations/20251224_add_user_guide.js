/**
 * Adds the guide field to the User table.
 * Guides have limited admin access (e.g., can view Server Connections page).
 * Admin and Guide are mutually exclusive roles.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('User', (table) => {
    table.boolean('guide').nullable().defaultTo(false).after('admin');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('User', (table) => {
    table.dropColumn('guide');
  });
}
