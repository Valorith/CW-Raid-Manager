/**
 * Add Codex runner jobs for direct Nexus-to-Codex handoff.
 *
 * Status is stored as VARCHAR to match the webhook inbox tables that use
 * Prisma enums over flexible string columns.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`CodexJob\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`messageId\` VARCHAR(191) NULL,
      \`createdById\` VARCHAR(191) NULL,
      \`status\` VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
      \`targetRepository\` VARCHAR(120) NOT NULL,
      \`baseBranch\` VARCHAR(120) NOT NULL,
      \`branchName\` VARCHAR(191) NOT NULL,
      \`prompt\` LONGTEXT NOT NULL,
      \`context\` JSON NULL,
      \`runnerId\` VARCHAR(120) NULL,
      \`statusMessage\` TEXT NULL,
      \`error\` LONGTEXT NULL,
      \`output\` LONGTEXT NULL,
      \`prUrl\` VARCHAR(1024) NULL,
      \`prNumber\` INT NULL,
      \`result\` JSON NULL,
      \`claimedAt\` DATETIME(3) NULL,
      \`startedAt\` DATETIME(3) NULL,
      \`completedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`CodexJob_messageId_idx\` (\`messageId\`),
      INDEX \`CodexJob_createdById_idx\` (\`createdById\`),
      INDEX \`CodexJob_status_createdAt_idx\` (\`status\`, \`createdAt\`),
      INDEX \`CodexJob_branchName_idx\` (\`branchName\`),
      CONSTRAINT \`CodexJob_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`CodexJob_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `CodexJob`;');
}
