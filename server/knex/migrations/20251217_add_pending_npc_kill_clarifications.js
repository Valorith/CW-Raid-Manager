/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`PendingNpcKillClarification\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`raidId\` VARCHAR(191) NULL,
      \`clarificationType\` VARCHAR(20) NOT NULL,
      \`npcName\` VARCHAR(191) NOT NULL,
      \`killedAt\` DATETIME(3) NOT NULL,
      \`killedByName\` VARCHAR(191) NULL,
      \`npcDefinitionId\` VARCHAR(191) NULL,
      \`zoneOptions\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`PendingNpcKillClarification_guildId_idx\`(\`guildId\`),
      INDEX \`PendingNpcKillClarification_raidId_idx\`(\`raidId\`),
      CONSTRAINT \`PendingNpcKillClarification_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`PendingNpcKillClarification_raidId_fkey\` FOREIGN KEY (\`raidId\`) REFERENCES \`RaidEvent\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT \`PendingNpcKillClarification_npcDefinitionId_fkey\` FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `PendingNpcKillClarification`;');
}
