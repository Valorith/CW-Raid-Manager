/**
 * Add per-outbound-endpoint automatic crash telemetry handoff setting.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('OutboundWebhookEndpoint');
  if (!hasTable) return;

  const hasAutoSendCrashTelemetry = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'autoSendCrashTelemetry'
  );

  if (!hasAutoSendCrashTelemetry) {
    await knex.schema.alterTable('OutboundWebhookEndpoint', (table) => {
      table.boolean('autoSendCrashTelemetry').notNullable().defaultTo(false);
      table.index(
        ['service', 'isEnabled', 'autoSendCrashTelemetry'],
        'OutboundWebhookEndpoint_auto_crash_idx'
      );
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('OutboundWebhookEndpoint');
  if (!hasTable) return;

  const hasAutoSendCrashTelemetry = await knex.schema.hasColumn(
    'OutboundWebhookEndpoint',
    'autoSendCrashTelemetry'
  );

  if (hasAutoSendCrashTelemetry) {
    await knex.schema.alterTable('OutboundWebhookEndpoint', (table) => {
      table.dropIndex(
        ['service', 'isEnabled', 'autoSendCrashTelemetry'],
        'OutboundWebhookEndpoint_auto_crash_idx'
      );
      table.dropColumn('autoSendCrashTelemetry');
    });
  }
}
