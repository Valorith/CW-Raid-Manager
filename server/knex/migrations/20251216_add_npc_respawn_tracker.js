/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    // NPC Definition table - stores NPC metadata and respawn times
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`NpcDefinition\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`guildId\` VARCHAR(191) NOT NULL,
        \`npcName\` VARCHAR(191) NOT NULL,
        \`npcNameNormalized\` VARCHAR(191) NOT NULL,
        \`zoneName\` VARCHAR(191) NULL,
        \`respawnMinMinutes\` INT NULL,
        \`respawnMaxMinutes\` INT NULL,
        \`notes\` LONGTEXT NULL,
        \`allaLink\` VARCHAR(512) NULL,
        \`createdById\` VARCHAR(191) NULL,
        \`createdByName\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`NpcDefinition_guildId_idx\`(\`guildId\`),
        UNIQUE INDEX \`NpcDefinition_guild_npc_unique\`(\`guildId\`, \`npcNameNormalized\`),
        CONSTRAINT \`NpcDefinition_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // NPC Loot table - stores known loot drops for NPCs
    await trx.schema.raw(`
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

    // NPC Kill Record table - tracks when NPCs were killed
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`NpcKillRecord\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`guildId\` VARCHAR(191) NOT NULL,
        \`npcDefinitionId\` VARCHAR(191) NOT NULL,
        \`killedAt\` DATETIME(3) NOT NULL,
        \`killedByName\` VARCHAR(191) NULL,
        \`killedById\` VARCHAR(191) NULL,
        \`notes\` VARCHAR(500) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`NpcKillRecord_guildId_idx\`(\`guildId\`),
        INDEX \`NpcKillRecord_npcDefinitionId_idx\`(\`npcDefinitionId\`),
        INDEX \`NpcKillRecord_guildId_killedAt_idx\`(\`guildId\`, \`killedAt\`),
        CONSTRAINT \`NpcKillRecord_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`NpcKillRecord_npcDefinitionId_fkey\` FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // NPC Respawn Subscription table - tracks user notification preferences
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`NpcRespawnSubscription\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`npcDefinitionId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`notifyMinutes\` INT NOT NULL DEFAULT 5,
        \`isEnabled\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`NpcRespawnSubscription_userId_idx\`(\`userId\`),
        UNIQUE INDEX \`NpcRespawnSubscription_npcDefinitionId_userId_key\`(\`npcDefinitionId\`, \`userId\`),
        CONSTRAINT \`NpcRespawnSubscription_npcDefinitionId_fkey\` FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw('DROP TABLE IF EXISTS `NpcRespawnSubscription`;');
    await trx.schema.raw('DROP TABLE IF EXISTS `NpcKillRecord`;');
    await trx.schema.raw('DROP TABLE IF EXISTS `NpcDefinitionLoot`;');
    await trx.schema.raw('DROP TABLE IF EXISTS `NpcDefinition`;');
  });
}
