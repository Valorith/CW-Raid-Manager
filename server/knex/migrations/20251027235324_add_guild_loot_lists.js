/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildLootListEntry\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`type\` ENUM('WHITELIST', 'BLACKLIST') NOT NULL,
      \`matchType\` ENUM('ITEM_ID', 'ITEM_NAME') NOT NULL,
      \`itemId\` INT NULL,
      \`itemName\` VARCHAR(191) NOT NULL,
      \`itemNameNormalized\` VARCHAR(191) NOT NULL,
      \`createdById\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`GuildLootListEntry_guild_type_idx\`(\`guildId\`, \`type\`),
      INDEX \`GuildLootListEntry_name_idx\`(\`guildId\`, \`itemNameNormalized\`),
      UNIQUE INDEX \`GuildLootListEntry_item_id_unique\`(\`guildId\`, \`type\`, \`itemId\`),
      UNIQUE INDEX \`GuildLootListEntry_name_unique\`(\`guildId\`, \`type\`, \`matchType\`, \`itemNameNormalized\`),
      CONSTRAINT \`GuildLootListEntry_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`GuildLootListEntry_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildLootListEntry`;');
}
