/**
 * Add per-user read status tracking for webhook messages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('WebhookMessageReadStatus');
  if (!hasTable) {
    await knex.schema.raw(`
      CREATE TABLE \`WebhookMessageReadStatus\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`messageId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`readAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WebhookMessageReadStatus_messageId_userId_key\` (\`messageId\`, \`userId\`),
        INDEX \`WebhookMessageReadStatus_messageId_idx\` (\`messageId\`),
        INDEX \`WebhookMessageReadStatus_userId_idx\` (\`userId\`),
        CONSTRAINT \`WebhookMessageReadStatus_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`WebhookMessageReadStatus_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('WebhookMessageReadStatus');
  if (hasTable) {
    await knex.schema.dropTable('WebhookMessageReadStatus');
  }
}
