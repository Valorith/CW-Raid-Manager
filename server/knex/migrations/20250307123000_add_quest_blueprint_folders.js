/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE \`QuestBlueprintFolder\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`iconKey\` VARCHAR(191) NULL,
      \`type\` ENUM('CLASS', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM',
      \`systemKey\` VARCHAR(191) NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`createdById\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`QuestBlueprintFolder_guildId_fkey\`
        FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`QuestBlueprintFolder_createdById_fkey\`
        FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE INDEX \`QuestBlueprintFolder_guildId_idx\`
    ON \`QuestBlueprintFolder\`(\`guildId\`);
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX \`QuestBlueprintFolder_system_key_unique\`
    ON \`QuestBlueprintFolder\`(\`guildId\`, \`systemKey\`);
  `);

  await knex.schema.raw(`
    ALTER TABLE \`QuestBlueprint\`
      ADD COLUMN \`folderId\` VARCHAR(191) NULL,
      ADD COLUMN \`folderSortOrder\` INTEGER NOT NULL DEFAULT 0,
      ADD CONSTRAINT \`QuestBlueprint_folderId_fkey\`
        FOREIGN KEY (\`folderId\`) REFERENCES \`QuestBlueprintFolder\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  await knex.schema.raw(`
    CREATE INDEX \`QuestBlueprint_folderId_idx\`
    ON \`QuestBlueprint\`(\`folderId\`);
  `);
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`QuestBlueprint\`
      DROP FOREIGN KEY \`QuestBlueprint_folderId_fkey\`,
      DROP INDEX \`QuestBlueprint_folderId_idx\`,
      DROP COLUMN \`folderId\`,
      DROP COLUMN \`folderSortOrder\`;
  `);

  await knex.schema.raw(`
    DROP INDEX \`QuestBlueprintFolder_system_key_unique\` ON \`QuestBlueprintFolder\`;
  `);

  await knex.schema.raw(`
    DROP INDEX \`QuestBlueprintFolder_guildId_idx\` ON \`QuestBlueprintFolder\`;
  `);

  await knex.schema.raw(`
    DROP TABLE \`QuestBlueprintFolder\`;
  `);
}
