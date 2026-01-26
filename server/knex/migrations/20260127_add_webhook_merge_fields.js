/**
 * Add merge tracking fields to InboundWebhookMessage.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMergedFromIds = await knex.schema.hasColumn('InboundWebhookMessage', 'mergedFromIds');
  if (!hasMergedFromIds) {
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.json('mergedFromIds').nullable(); // Array of original message IDs
      table.datetime('mergedAt', { precision: 3 }).nullable();
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMergedFromIds = await knex.schema.hasColumn('InboundWebhookMessage', 'mergedFromIds');
  if (hasMergedFromIds) {
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.dropColumn('mergedFromIds');
      table.dropColumn('mergedAt');
    });
  }
}
