/**
 * Add devMode setting for inbound webhooks.
 * When enabled, Discord messages are sent to the dev webhook URL instead of the production URL.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasDevMode = await knex.schema.hasColumn('InboundWebhook', 'devMode');
  if (!hasDevMode) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.boolean('devMode').notNullable().defaultTo(false);
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasDevMode = await knex.schema.hasColumn('InboundWebhook', 'devMode');
  if (hasDevMode) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.dropColumn('devMode');
    });
  }
}
