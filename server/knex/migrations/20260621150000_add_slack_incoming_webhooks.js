/**
 * Add Slack incoming-webhook install sessions and guild Slack destinations.
 *
 * Inbound webhook action types are stored as VARCHAR, so adding SLACK_RELAY only
 * requires updating the Prisma enum and application code.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`SlackInstallSession\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`state\` VARCHAR(120) NOT NULL,
      \`targetType\` VARCHAR(40) NOT NULL,
      \`targetId\` VARCHAR(191) NULL,
      \`returnPath\` VARCHAR(512) NULL,
      \`metadata\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`createdById\` VARCHAR(191) NOT NULL,
      \`expiresAt\` DATETIME(3) NOT NULL,
      \`completedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`SlackInstallSession_state_key\` (\`state\`),
      INDEX \`SlackInstallSession_target_idx\` (\`targetType\`, \`targetId\`),
      INDEX \`SlackInstallSession_createdById_idx\` (\`createdById\`),
      INDEX \`SlackInstallSession_expiresAt_idx\` (\`expiresAt\`),
      CONSTRAINT \`SlackInstallSession_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildSlackWebhook\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`label\` VARCHAR(120) NOT NULL,
      \`webhookUrl\` TEXT NULL,
      \`configurationUrl\` VARCHAR(1024) NULL,
      \`isEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`slackTeamId\` VARCHAR(120) NULL,
      \`slackTeamName\` VARCHAR(191) NULL,
      \`slackChannelId\` VARCHAR(120) NULL,
      \`slackChannelName\` VARCHAR(191) NULL,
      \`eventSubscriptions\` JSON NOT NULL DEFAULT (JSON_OBJECT()),
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`lastSentAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`GuildSlackWebhook_guildId_idx\` (\`guildId\`),
      INDEX \`GuildSlackWebhook_createdById_idx\` (\`createdById\`),
      INDEX \`GuildSlackWebhook_isEnabled_idx\` (\`isEnabled\`),
      CONSTRAINT \`GuildSlackWebhook_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`GuildSlackWebhook_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildSlackWebhook`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `SlackInstallSession`;');
}
