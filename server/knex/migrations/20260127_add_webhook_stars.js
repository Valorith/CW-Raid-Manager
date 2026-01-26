/**
 * Add per-user starring/flagging for webhook messages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('WebhookMessageStar');
  if (!hasTable) {
    await knex.schema.raw(`
      CREATE TABLE \`WebhookMessageStar\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`messageId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WebhookMessageStar_messageId_userId_key\` (\`messageId\`, \`userId\`),
        INDEX \`WebhookMessageStar_messageId_idx\` (\`messageId\`),
        INDEX \`WebhookMessageStar_userId_idx\` (\`userId\`),
        CONSTRAINT \`WebhookMessageStar_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`WebhookMessageStar_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('WebhookMessageStar');
  if (hasTable) {
    await knex.schema.dropTable('WebhookMessageStar');
  }
}
