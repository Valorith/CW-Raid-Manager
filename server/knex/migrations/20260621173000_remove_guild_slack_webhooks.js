/**
 * Remove guild-managed Slack webhook destinations.
 *
 * Slack is scoped to admin surfaces only: Webhook Inbox actions and Test
 * Manager notifications. Historical guild Slack install sessions are removed
 * so Prisma never has to deserialize a retired target type.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(
    "DELETE FROM `SlackInstallSession` WHERE `targetType` = 'GUILD_SLACK_WEBHOOK';"
  );
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildSlackWebhook`;');
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
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
