/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('SystemSetting', (table) => {
    table.string('key', 100).primary();
    table.text('value').notNullable();
    table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNullable();
  });

  // Insert default value for webhook processing enabled
  await knex('SystemSetting').insert({
    key: 'webhookProcessingEnabled',
    value: 'true'
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('SystemSetting');
}
