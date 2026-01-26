/**
 * Add inbound webhook tables for admin-managed webhook inbox.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`InboundWebhook\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`label\` VARCHAR(120) NOT NULL,
      \`description\` VARCHAR(500) NULL,
      \`isEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`token\` VARCHAR(120) NOT NULL,
      \`retentionPolicy\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`lastReceivedAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`InboundWebhook_createdById_idx\` (\`createdById\`),
      INDEX \`InboundWebhook_createdAt_idx\` (\`createdAt\`),
      CONSTRAINT \`InboundWebhook_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`InboundWebhookAction\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`webhookId\` VARCHAR(191) NOT NULL,
      \`type\` VARCHAR(40) NOT NULL,
      \`name\` VARCHAR(120) NOT NULL,
      \`isEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`config\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`InboundWebhookAction_webhookId_idx\` (\`webhookId\`),
      INDEX \`InboundWebhookAction_type_idx\` (\`type\`),
      CONSTRAINT \`InboundWebhookAction_webhookId_fkey\` FOREIGN KEY (\`webhookId\`) REFERENCES \`InboundWebhook\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`InboundWebhookMessage\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`webhookId\` VARCHAR(191) NOT NULL,
      \`receivedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`sourceIp\` VARCHAR(64) NULL,
      \`headers\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`payload\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`rawBody\` LONGTEXT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
      \`actionSummary\` JSON NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`InboundWebhookMessage_webhookId_idx\` (\`webhookId\`),
      INDEX \`InboundWebhookMessage_receivedAt_idx\` (\`receivedAt\`),
      INDEX \`InboundWebhookMessage_status_idx\` (\`status\`),
      CONSTRAINT \`InboundWebhookMessage_webhookId_fkey\` FOREIGN KEY (\`webhookId\`) REFERENCES \`InboundWebhook\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`InboundWebhookActionRun\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`messageId\` VARCHAR(191) NOT NULL,
      \`actionId\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
      \`error\` TEXT NULL,
      \`result\` JSON NULL,
      \`durationMs\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`InboundWebhookActionRun_messageId_idx\` (\`messageId\`),
      INDEX \`InboundWebhookActionRun_actionId_idx\` (\`actionId\`),
      INDEX \`InboundWebhookActionRun_createdAt_idx\` (\`createdAt\`),
      CONSTRAINT \`InboundWebhookActionRun_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`InboundWebhookActionRun_actionId_fkey\` FOREIGN KEY (\`actionId\`) REFERENCES \`InboundWebhookAction\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `InboundWebhookActionRun`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `InboundWebhookMessage`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `InboundWebhookAction`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `InboundWebhook`;');
}
