/**
 * Add AutoLinkSettings table for tracking last auto-link run time.
 * Uses a singleton pattern with a fixed ID.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop table if it exists from a previous failed migration attempt
  await knex.schema.raw('DROP TABLE IF EXISTS `AutoLinkSettings`;');

  await knex.schema.raw(`
    CREATE TABLE \`AutoLinkSettings\` (
      \`id\` VARCHAR(191) NOT NULL DEFAULT 'singleton',
      \`lastRunAt\` DATETIME(3) NULL,
      \`lastRunById\` VARCHAR(191) NULL,
      \`lastRunByName\` VARCHAR(191) NULL,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  // Insert the default singleton row
  await knex.schema.raw(`
    INSERT INTO \`AutoLinkSettings\` (\`id\`)
    VALUES ('singleton');
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `AutoLinkSettings`;');
}
