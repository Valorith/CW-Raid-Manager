/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`RaidNpcKillEvent\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`raidId\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`npcName\` VARCHAR(191) NOT NULL,
      \`npcNameNormalized\` VARCHAR(191) NOT NULL,
      \`killerName\` VARCHAR(191) NULL,
      \`occurredAt\` DATETIME(3) NOT NULL,
      \`logSignature\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`RaidNpcKillEvent_signature_idx\`(\`raidId\`, \`logSignature\`),
      INDEX \`RaidNpcKillEvent_raid_idx\`(\`raidId\`),
      INDEX \`RaidNpcKillEvent_guild_idx\`(\`guildId\`),
      INDEX \`RaidNpcKillEvent_raid_npc_idx\`(\`raidId\`, \`npcNameNormalized\`),
      CONSTRAINT \`RaidNpcKillEvent_raidId_fkey\` FOREIGN KEY (\`raidId\`) REFERENCES \`RaidEvent\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`RaidNpcKillEvent_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `RaidNpcKillEvent`;');
}
