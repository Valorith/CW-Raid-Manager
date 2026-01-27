/**
 * Add autoMerge setting for inbound webhooks.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasAutoMerge = await knex.schema.hasColumn('InboundWebhook', 'autoMerge');
  if (!hasAutoMerge) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.boolean('autoMerge').notNullable().defaultTo(false);
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasAutoMerge = await knex.schema.hasColumn('InboundWebhook', 'autoMerge');
  if (hasAutoMerge) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.dropColumn('autoMerge');
    });
  }
}
