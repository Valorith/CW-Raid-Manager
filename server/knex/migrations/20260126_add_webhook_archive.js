/**
 * Add archivedAt for inbound webhook messages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasArchivedAt = await knex.schema.hasColumn('InboundWebhookMessage', 'archivedAt');
  if (!hasArchivedAt) {
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.datetime('archivedAt', { precision: 3 }).nullable();
      table.index(['archivedAt'], 'InboundWebhookMessage_archivedAt_idx');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasArchivedAt = await knex.schema.hasColumn('InboundWebhookMessage', 'archivedAt');
  if (hasArchivedAt) {
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.dropIndex(['archivedAt'], 'InboundWebhookMessage_archivedAt_idx');
      table.dropColumn('archivedAt');
    });
  }
}
