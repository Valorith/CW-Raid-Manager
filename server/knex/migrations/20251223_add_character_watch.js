/**
 * Add CharacterWatch table for tracking watched characters.
 * Characters on the watch list will have a pulsing border on the connections page.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`CharacterWatch\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`eqCharacterId\` INT NOT NULL,
      \`eqCharacterName\` VARCHAR(191) NOT NULL,
      \`eqAccountId\` INT NOT NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdByName\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`CharacterWatch_eqCharacterId_unique\` (\`eqCharacterId\`),
      INDEX \`CharacterWatch_eqAccountId_idx\` (\`eqAccountId\`),
      INDEX \`CharacterWatch_createdById_idx\` (\`createdById\`),
      CONSTRAINT \`CharacterWatch_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `CharacterWatch`;');
}
