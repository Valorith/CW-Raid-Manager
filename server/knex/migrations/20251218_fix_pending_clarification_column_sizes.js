/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Fix column sizes that were incorrectly set in initial migration
  await knex.schema.raw(`
    ALTER TABLE \`PendingNpcKillClarification\`
    MODIFY COLUMN \`id\` VARCHAR(191) NOT NULL,
    MODIFY COLUMN \`guildId\` VARCHAR(191) NOT NULL,
    MODIFY COLUMN \`raidId\` VARCHAR(191) NULL,
    MODIFY COLUMN \`npcDefinitionId\` VARCHAR(191) NULL;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Revert to smaller sizes (not recommended)
  await knex.schema.raw(`
    ALTER TABLE \`PendingNpcKillClarification\`
    MODIFY COLUMN \`id\` VARCHAR(30) NOT NULL,
    MODIFY COLUMN \`guildId\` VARCHAR(30) NOT NULL,
    MODIFY COLUMN \`raidId\` VARCHAR(30) NULL,
    MODIFY COLUMN \`npcDefinitionId\` VARCHAR(30) NULL;
  `);
}
