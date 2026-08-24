/**
 * Add boss cure metadata, edit history, and reviewable member suggestions.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      ADD COLUMN \`cureCurse\` BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN \`curePoison\` BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN \`cureDisease\` BOOLEAN NOT NULL DEFAULT false;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBossEditHistory\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`bossId\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`editorUserId\` VARCHAR(191) NOT NULL,
      \`editorName\` VARCHAR(191) NOT NULL,
      \`editKind\` VARCHAR(40) NOT NULL,
      \`summary\` VARCHAR(255) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`GuildBossEditHistory_boss_created_idx\` (\`bossId\`, \`createdAt\`),
      INDEX \`GuildBossEditHistory_guild_created_idx\` (\`guildId\`, \`createdAt\`),
      CONSTRAINT \`GuildBossEditHistory_bossId_fkey\` FOREIGN KEY (\`bossId\`) REFERENCES \`GuildBoss\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBossEditSuggestion\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`bossId\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`submittedById\` VARCHAR(191) NOT NULL,
      \`submittedByName\` VARCHAR(191) NOT NULL,
      \`baseRevision\` CHAR(64) NOT NULL,
      \`proposedNotes\` LONGTEXT NULL,
      \`baseCureCurse\` BOOLEAN NOT NULL DEFAULT false,
      \`baseCurePoison\` BOOLEAN NOT NULL DEFAULT false,
      \`baseCureDisease\` BOOLEAN NOT NULL DEFAULT false,
      \`proposedCureCurse\` BOOLEAN NOT NULL DEFAULT false,
      \`proposedCurePoison\` BOOLEAN NOT NULL DEFAULT false,
      \`proposedCureDisease\` BOOLEAN NOT NULL DEFAULT false,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      \`reviewedById\` VARCHAR(191) NULL,
      \`reviewedByName\` VARCHAR(191) NULL,
      \`reviewedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`GuildBossEditSuggestion_boss_status_idx\` (\`bossId\`, \`status\`, \`createdAt\`),
      INDEX \`GuildBossEditSuggestion_guild_status_idx\` (\`guildId\`, \`status\`, \`createdAt\`),
      INDEX \`GuildBossEditSuggestion_submitter_status_idx\` (\`submittedById\`, \`status\`),
      CONSTRAINT \`GuildBossEditSuggestion_bossId_fkey\` FOREIGN KEY (\`bossId\`) REFERENCES \`GuildBoss\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBossEditSuggestion`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBossEditHistory`;');
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      DROP COLUMN \`cureDisease\`,
      DROP COLUMN \`curePoison\`,
      DROP COLUMN \`cureCurse\`;
  `);
}
