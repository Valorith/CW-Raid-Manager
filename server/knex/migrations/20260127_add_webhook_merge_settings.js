/**
 * Add mergeWindowSeconds setting for inbound webhooks.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMergeWindowSeconds = await knex.schema.hasColumn('InboundWebhook', 'mergeWindowSeconds');
  if (!hasMergeWindowSeconds) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.integer('mergeWindowSeconds').notNullable().defaultTo(10);
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMergeWindowSeconds = await knex.schema.hasColumn('InboundWebhook', 'mergeWindowSeconds');
  if (hasMergeWindowSeconds) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.dropColumn('mergeWindowSeconds');
    });
  }
}
