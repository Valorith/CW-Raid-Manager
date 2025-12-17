/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Add hasInstanceVersion to NpcDefinition
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.boolean('hasInstanceVersion').notNullable().defaultTo(false).after('isRaidTarget');
  });

  // Add isInstance to NpcKillRecord
  await knex.schema.alterTable('NpcKillRecord', (table) => {
    table.boolean('isInstance').notNullable().defaultTo(false).after('notes');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('NpcKillRecord', (table) => {
    table.dropColumn('isInstance');
  });

  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.dropColumn('hasInstanceVersion');
  });
}
