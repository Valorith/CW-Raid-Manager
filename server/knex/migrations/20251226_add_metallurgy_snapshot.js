/**
 * Add MetallurgySnapshot table for tracking daily metallurgy snapshots.
 * Stores total weight and ore counts for trend analysis.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop table if it exists from a previous failed migration attempt
  await knex.schema.raw('DROP TABLE IF EXISTS `MetallurgySnapshot`;');

  await knex.schema.raw(`
    CREATE TABLE \`MetallurgySnapshot\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`snapshotDate\` DATE NOT NULL,
      \`totalWeight\` DECIMAL(10, 2) NOT NULL DEFAULT 0,
      \`accountCount\` INT NOT NULL DEFAULT 0,
      \`tinOreCount\` INT NOT NULL DEFAULT 0,
      \`copperOreCount\` INT NOT NULL DEFAULT 0,
      \`ironOreCount\` INT NOT NULL DEFAULT 0,
      \`zincOreCount\` INT NOT NULL DEFAULT 0,
      \`nickelOreCount\` INT NOT NULL DEFAULT 0,
      \`cobaltOreCount\` INT NOT NULL DEFAULT 0,
      \`manganeseOreCount\` INT NOT NULL DEFAULT 0,
      \`tungstenOreCount\` INT NOT NULL DEFAULT 0,
      \`chromiumOreCount\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`createdById\` VARCHAR(191) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`MetallurgySnapshot_snapshotDate_idx\` (\`snapshotDate\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `MetallurgySnapshot`;');
}
