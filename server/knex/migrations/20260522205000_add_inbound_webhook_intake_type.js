/**
 * Add endpoint-level intake classification for inbound webhooks.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasWebhookTable = await knex.schema.hasTable('InboundWebhook');
  if (!hasWebhookTable) return;

  const hasIntakeType = await knex.schema.hasColumn('InboundWebhook', 'intakeType');
  if (!hasIntakeType) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table
        .enu('intakeType', ['GENERIC', 'EQEMU_SERVER_CRASH_REPORT'], {
          useNative: true,
          enumName: 'InboundWebhookIntakeType'
        })
        .notNullable()
        .defaultTo('GENERIC')
        .after('isEnabled');
      table.index(['intakeType'], 'InboundWebhook_intakeType_idx');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasWebhookTable = await knex.schema.hasTable('InboundWebhook');
  if (!hasWebhookTable) return;

  const hasIntakeType = await knex.schema.hasColumn('InboundWebhook', 'intakeType');
  if (hasIntakeType) {
    await knex.schema.alterTable('InboundWebhook', (table) => {
      table.dropIndex(['intakeType'], 'InboundWebhook_intakeType_idx');
      table.dropColumn('intakeType');
    });
  }
}
