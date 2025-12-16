/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.boolean('isRaidTarget').notNullable().defaultTo(false).after('respawnMaxMinutes');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.dropColumn('isRaidTarget');
  });
}
