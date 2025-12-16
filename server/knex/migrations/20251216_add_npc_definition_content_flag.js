/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.string('contentFlag', 50).nullable().after('isRaidTarget');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.dropColumn('contentFlag');
  });
}
