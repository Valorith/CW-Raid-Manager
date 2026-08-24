/**
 * Add renewable, database-backed edit leases for boss notes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBossEditLease\` (
      \`bossId\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`holderName\` VARCHAR(191) NOT NULL,
      \`token\` VARCHAR(36) NOT NULL,
      \`mode\` VARCHAR(20) NOT NULL,
      \`expiresAt\` DATETIME(3) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`bossId\`),
      UNIQUE INDEX \`GuildBossEditLease_token_key\` (\`token\`),
      INDEX \`GuildBossEditLease_guildId_idx\` (\`guildId\`),
      INDEX \`GuildBossEditLease_userId_idx\` (\`userId\`),
      INDEX \`GuildBossEditLease_expiresAt_idx\` (\`expiresAt\`),
      CONSTRAINT \`GuildBossEditLease_bossId_fkey\` FOREIGN KEY (\`bossId\`) REFERENCES \`GuildBoss\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBossEditLease`;');
}
