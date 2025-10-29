/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('Guild', (table) => {
    table.boolean('discordWidgetEnabled').notNullable().defaultTo(false);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('Guild', (table) => {
    table.dropColumn('discordWidgetEnabled');
  });
}

