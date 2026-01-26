/**
 * Add assigned admin fields for inbound webhook messages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasAssignedAdminId = await knex.schema.hasColumn('InboundWebhookMessage', 'assignedAdminId');
  if (!hasAssignedAdminId) {
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.string('assignedAdminId', 191).nullable();
      table.datetime('assignedAt', { precision: 3 }).nullable();
      table.index(['assignedAdminId'], 'InboundWebhookMessage_assignedAdminId_idx');
    });
  }

  if (!hasAssignedAdminId) {
    await knex.schema.raw(`
      ALTER TABLE \`InboundWebhookMessage\`
      ADD CONSTRAINT \`InboundWebhookMessage_assignedAdminId_fkey\`
      FOREIGN KEY (\`assignedAdminId\`) REFERENCES \`User\`(\`id\`)
      ON DELETE SET NULL ON UPDATE CASCADE;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasAssignedAdminId = await knex.schema.hasColumn('InboundWebhookMessage', 'assignedAdminId');
  if (hasAssignedAdminId) {
    await knex.schema.raw(
      'ALTER TABLE `InboundWebhookMessage` DROP FOREIGN KEY `InboundWebhookMessage_assignedAdminId_fkey`'
    );
    await knex.schema.alterTable('InboundWebhookMessage', (table) => {
      table.dropIndex(['assignedAdminId'], 'InboundWebhookMessage_assignedAdminId_idx');
      table.dropColumn('assignedAdminId');
      table.dropColumn('assignedAt');
    });
  }
}
