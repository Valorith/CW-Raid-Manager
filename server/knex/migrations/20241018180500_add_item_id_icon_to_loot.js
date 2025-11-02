/**
 * Adds EverQuest item metadata columns to raid loot events.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('RaidLootEvent', (table) => {
    table.integer('itemId').nullable().index();
    table.integer('itemIconId').nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('RaidLootEvent', (table) => {
    table.dropColumn('itemIconId');
    table.dropColumn('itemId');
  });
}
