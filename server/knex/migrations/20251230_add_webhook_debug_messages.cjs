/**
 * Migration: Add WebhookDebugMessage table (CommonJS stub)
 *
 * This mirrors the .js migration for knex history compatibility.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
async function up(knex) {
  const hasTable = await knex.schema.hasTable('WebhookDebugMessage');
  if (hasTable) {
    return;
  }

  await knex.schema.createTable('WebhookDebugMessage', (table) => {
    table.string('id', 191).notNullable().primary();
    table.string('guildId', 191).notNullable();
    table.string('event', 100).notNullable();
    table.string('eventLabel', 200).notNullable();
    table.string('webhookLabel', 200).notNullable();
    table.json('payload').notNullable();
    table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['guildId', 'createdAt'], 'WebhookDebugMessage_guildId_createdAt_idx');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
async function down(knex) {
  await knex.schema.dropTableIfExists('WebhookDebugMessage');
}

module.exports = {
  up,
  down
};
