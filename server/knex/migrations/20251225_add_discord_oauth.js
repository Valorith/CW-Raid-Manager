/**
 * Adds the discordId field to the User table for Discord OAuth2 authentication.
 * Users can login with either Google or Discord OAuth2.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('User', (table) => {
    table.string('discordId', 191).nullable().unique().after('googleId');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('User', (table) => {
    table.dropColumn('discordId');
  });
}
