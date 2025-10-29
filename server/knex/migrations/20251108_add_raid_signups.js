/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`RaidSignup\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`raidId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`characterId\` VARCHAR(191) NOT NULL,
      \`characterName\` VARCHAR(64) NOT NULL,
      \`characterClass\` ENUM('BARD','BEASTLORD','BERSERKER','CLERIC','DRUID','ENCHANTER','MAGICIAN','MONK','NECROMANCER','PALADIN','RANGER','ROGUE','SHADOWKNIGHT','SHAMAN','WARRIOR','WIZARD','UNKNOWN') NOT NULL,
      \`characterLevel\` INT NULL,
      \`isMain\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`RaidSignup_raidId_characterId_key\`(\`raidId\`, \`characterId\`),
      INDEX \`RaidSignup_raidId_idx\`(\`raidId\`),
      INDEX \`RaidSignup_userId_idx\`(\`userId\`),
      CONSTRAINT \`RaidSignup_raidId_fkey\` FOREIGN KEY (\`raidId\`) REFERENCES \`RaidEvent\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`RaidSignup_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`RaidSignup_characterId_fkey\` FOREIGN KEY (\`characterId\`) REFERENCES \`Characters\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `RaidSignup`;');
}
