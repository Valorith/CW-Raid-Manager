/**
 * Add MoneySnapshot table for tracking daily server currency snapshots.
 * Stores aggregated currency totals and top 20 wealthiest characters per day.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop table if it exists from a previous failed migration attempt
  await knex.schema.raw('DROP TABLE IF EXISTS `MoneySnapshot`;');

  await knex.schema.raw(`
    CREATE TABLE \`MoneySnapshot\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`snapshotDate\` DATE NOT NULL,
      \`totalPlatinum\` BIGINT NOT NULL DEFAULT 0,
      \`totalGold\` BIGINT NOT NULL DEFAULT 0,
      \`totalSilver\` BIGINT NOT NULL DEFAULT 0,
      \`totalCopper\` BIGINT NOT NULL DEFAULT 0,
      \`totalPlatinumBank\` BIGINT NOT NULL DEFAULT 0,
      \`totalGoldBank\` BIGINT NOT NULL DEFAULT 0,
      \`totalSilverBank\` BIGINT NOT NULL DEFAULT 0,
      \`totalCopperBank\` BIGINT NOT NULL DEFAULT 0,
      \`totalPlatinumCursor\` BIGINT NOT NULL DEFAULT 0,
      \`totalGoldCursor\` BIGINT NOT NULL DEFAULT 0,
      \`totalSilverCursor\` BIGINT NOT NULL DEFAULT 0,
      \`totalCopperCursor\` BIGINT NOT NULL DEFAULT 0,
      \`totalPlatinumEquivalent\` BIGINT NOT NULL DEFAULT 0,
      \`topCharacters\` JSON NOT NULL,
      \`characterCount\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`createdById\` VARCHAR(191) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`MoneySnapshot_snapshotDate_key\` (\`snapshotDate\`),
      INDEX \`MoneySnapshot_snapshotDate_idx\` (\`snapshotDate\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `MoneySnapshot`;');
}
