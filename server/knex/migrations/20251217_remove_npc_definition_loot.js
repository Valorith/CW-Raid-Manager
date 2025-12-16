/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `NpcDefinitionLoot`;');
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`NpcDefinitionLoot\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`npcDefinitionId\` VARCHAR(191) NOT NULL,
      \`itemId\` INT NULL,
      \`itemName\` VARCHAR(191) NOT NULL,
      \`itemIconId\` INT NULL,
      \`allaLink\` VARCHAR(512) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`NpcDefinitionLoot_npcDefinitionId_idx\`(\`npcDefinitionId\`),
      CONSTRAINT \`NpcDefinitionLoot_npcDefinitionId_fkey\` FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}
