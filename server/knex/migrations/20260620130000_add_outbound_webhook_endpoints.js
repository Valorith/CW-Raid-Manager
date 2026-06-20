/**
 * Add app-managed outbound webhook endpoints.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`OutboundWebhookEndpoint\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`label\` VARCHAR(120) NOT NULL,
      \`description\` VARCHAR(500) NULL,
      \`service\` VARCHAR(40) NOT NULL DEFAULT 'CUSTOM',
      \`url\` VARCHAR(1024) NOT NULL,
      \`isEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`lastSentAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`OutboundWebhookEndpoint_createdById_idx\` (\`createdById\`),
      INDEX \`OutboundWebhookEndpoint_service_idx\` (\`service\`),
      INDEX \`OutboundWebhookEndpoint_isEnabled_idx\` (\`isEnabled\`),
      CONSTRAINT \`OutboundWebhookEndpoint_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `OutboundWebhookEndpoint`;');
}
