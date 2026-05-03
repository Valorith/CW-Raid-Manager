/**
 * Link webhook inbox reports to Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('TestChangeWebhookReport');
  if (!hasTable) {
    await knex.schema.raw(`
      CREATE TABLE \`TestChangeWebhookReport\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`changeId\` VARCHAR(191) NOT NULL,
        \`messageId\` VARCHAR(191) NOT NULL,
        \`linkedById\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`TestChangeWebhookReport_change_message_key\` (\`changeId\`, \`messageId\`),
        INDEX \`TestChangeWebhookReport_change_created_idx\` (\`changeId\`, \`createdAt\`),
        INDEX \`TestChangeWebhookReport_message_created_idx\` (\`messageId\`, \`createdAt\`),
        INDEX \`TestChangeWebhookReport_linkedById_idx\` (\`linkedById\`),
        CONSTRAINT \`TestChangeWebhookReport_changeId_fkey\` FOREIGN KEY (\`changeId\`) REFERENCES \`TestChange\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`TestChangeWebhookReport_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`TestChangeWebhookReport_linkedById_fkey\` FOREIGN KEY (\`linkedById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('TestChangeWebhookReport');
  if (hasTable) {
    await knex.schema.dropTable('TestChangeWebhookReport');
  }
}
