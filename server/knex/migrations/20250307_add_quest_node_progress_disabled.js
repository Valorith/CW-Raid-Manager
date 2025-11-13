/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('QuestNodeProgress', (table) => {
    table.boolean('isDisabled').notNullable().defaultTo(false).after('status');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('QuestNodeProgress', (table) => {
    table.dropColumn('isDisabled');
  });
}
