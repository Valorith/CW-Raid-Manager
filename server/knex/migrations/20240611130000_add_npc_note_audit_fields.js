/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  await knex.schema.alterTable('GuildNpcNote', (table) => {
    table.string('lastEditedById', 191).nullable().after('allaLink');
    table.string('lastEditedByName', 191).nullable().after('lastEditedById');
    table.string('deletionRequestedById', 191).nullable().after('lastEditedByName');
    table.string('deletionRequestedByName', 191).nullable().after('deletionRequestedById');
    table.dateTime('deletionRequestedAt', { precision: 3 }).nullable().after('deletionRequestedByName');
  });
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  await knex.schema.alterTable('GuildNpcNote', (table) => {
    table.dropColumn('lastEditedById');
    table.dropColumn('lastEditedByName');
    table.dropColumn('deletionRequestedById');
    table.dropColumn('deletionRequestedByName');
    table.dropColumn('deletionRequestedAt');
  });
}
