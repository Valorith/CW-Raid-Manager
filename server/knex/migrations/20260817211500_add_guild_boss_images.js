/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBossImage\` (
      \`bossId\` VARCHAR(191) NOT NULL,
      \`mimeType\` VARCHAR(100) NOT NULL,
      \`fileName\` VARCHAR(191) NULL,
      \`data\` LONGBLOB NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`bossId\`),
      CONSTRAINT \`GuildBossImage_bossId_fkey\` FOREIGN KEY (\`bossId\`) REFERENCES \`GuildBoss\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBossImage`;');
}
