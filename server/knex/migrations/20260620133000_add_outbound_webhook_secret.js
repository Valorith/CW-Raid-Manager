/**
 * Add optional authentication secret support for outbound webhook targets.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('OutboundWebhookEndpoint');
  if (!hasTable) return;

  const hasWebhookSecret = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'webhookSecret'
  );
  const hasWebhookSecretHeaderName = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'webhookSecretHeaderName'
  );

  await knex.schema.alterTable('OutboundWebhookEndpoint', (table) => {
    if (!hasWebhookSecret) {
      table.text('webhookSecret').nullable();
    }
    if (!hasWebhookSecretHeaderName) {
      table.string('webhookSecretHeaderName', 120).notNullable().defaultTo('X-Webhook-Secret');
    }
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('OutboundWebhookEndpoint');
  if (!hasTable) return;

  const hasWebhookSecret = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'webhookSecret'
  );
  const hasWebhookSecretHeaderName = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'webhookSecretHeaderName'
  );

  await knex.schema.alterTable('OutboundWebhookEndpoint', (table) => {
    if (hasWebhookSecretHeaderName) {
      table.dropColumn('webhookSecretHeaderName');
    }
    if (hasWebhookSecret) {
      table.dropColumn('webhookSecret');
    }
  });
}
