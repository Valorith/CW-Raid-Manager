/**
 * Add NpcFavorite table for tracking user's favorite NPCs in the respawn tracker.
 * Favorites are per-user, per-guild, and unique to NPC name + instance variant.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop table if it exists from a previous failed migration attempt
  await knex.schema.raw('DROP TABLE IF EXISTS `NpcFavorite`;');

  await knex.schema.raw(`
    CREATE TABLE \`NpcFavorite\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`npcNameNormalized\` VARCHAR(191) NOT NULL,
      \`isInstanceVariant\` TINYINT(1) NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`NpcFavorite_userId_guildId_npcNameNormalized_isInstanceVariant_key\` (\`userId\`, \`guildId\`, \`npcNameNormalized\`, \`isInstanceVariant\`),
      INDEX \`NpcFavorite_userId_guildId_idx\` (\`userId\`, \`guildId\`),
      CONSTRAINT \`NpcFavorite_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`NpcFavorite_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `NpcFavorite`;');
}
