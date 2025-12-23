/**
 * Add AccountNote and CharacterAssociation tables for character admin modal.
 * AccountNote: Admin notes tied to EQ accounts
 * CharacterAssociation: Manual associations between characters/accounts
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Create AccountNote table
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`AccountNote\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`eqAccountId\` INT NOT NULL,
      \`content\` TEXT NOT NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdByName\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`AccountNote_eqAccountId_idx\` (\`eqAccountId\`),
      INDEX \`AccountNote_createdById_idx\` (\`createdById\`),
      CONSTRAINT \`AccountNote_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  // Create CharacterAssociation table
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`CharacterAssociation\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`sourceCharacterId\` INT NOT NULL,
      \`sourceCharacterName\` VARCHAR(191) NOT NULL,
      \`targetCharacterId\` INT NOT NULL,
      \`targetCharacterName\` VARCHAR(191) NOT NULL,
      \`targetAccountId\` INT NOT NULL,
      \`reason\` VARCHAR(500) NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdByName\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`CharacterAssociation_source_target_unique\` (\`sourceCharacterId\`, \`targetCharacterId\`),
      INDEX \`CharacterAssociation_sourceCharacterId_idx\` (\`sourceCharacterId\`),
      INDEX \`CharacterAssociation_targetCharacterId_idx\` (\`targetCharacterId\`),
      INDEX \`CharacterAssociation_createdById_idx\` (\`createdById\`),
      CONSTRAINT \`CharacterAssociation_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `CharacterAssociation`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `AccountNote`;');
}
