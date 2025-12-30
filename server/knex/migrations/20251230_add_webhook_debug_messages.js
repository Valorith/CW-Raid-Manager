/**
 * Migration: Add WebhookDebugMessage table
 *
 * This table stores debug webhook messages for cross-process delivery.
 * When a cron job (separate process) creates debug messages, they are stored
 * in this table so the web server can deliver them to connected SSE clients.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('WebhookDebugMessage', (table) => {
    table.string('id', 191).notNullable().primary();
    table.string('guildId', 191).notNullable();
    table.string('event', 100).notNullable();
    table.string('eventLabel', 200).notNullable();
    table.string('webhookLabel', 200).notNullable();
    table.json('payload').notNullable();
    table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['guildId', 'createdAt'], 'WebhookDebugMessage_guildId_createdAt_idx');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('WebhookDebugMessage');
};
