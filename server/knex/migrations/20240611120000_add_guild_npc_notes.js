/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE \`GuildNpcNote\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`npcName\` VARCHAR(191) NOT NULL,
      \`npcNameNormalized\` VARCHAR(191) NOT NULL,
      \`notes\` LONGTEXT NULL,
      \`allaLink\` VARCHAR(512) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`GuildNpcNote_guild_npc_unique\`(\`guildId\`, \`npcNameNormalized\`),
      INDEX \`GuildNpcNote_guildId_idx\`(\`guildId\`),
      CONSTRAINT \`GuildNpcNote_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE \`GuildNpcNoteSpell\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`noteId\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`allaLink\` VARCHAR(512) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`GuildNpcNoteSpell_noteId_idx\`(\`noteId\`),
      CONSTRAINT \`GuildNpcNoteSpell_noteId_fkey\` FOREIGN KEY (\`noteId\`) REFERENCES \`GuildNpcNote\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE \`GuildNpcNoteAssociation\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`noteId\` VARCHAR(191) NOT NULL,
      \`associatedNpcName\` VARCHAR(191) NOT NULL,
      \`allaLink\` VARCHAR(512) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`GuildNpcNoteAssociation_noteId_idx\`(\`noteId\`),
      CONSTRAINT \`GuildNpcNoteAssociation_noteId_fkey\` FOREIGN KEY (\`noteId\`) REFERENCES \`GuildNpcNote\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildNpcNoteAssociation`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildNpcNoteSpell`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildNpcNote`;');
}
