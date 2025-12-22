/**
 * Add MoneyTrackerSettings table for configuring auto-snapshot behavior.
 * Uses a singleton pattern with a fixed ID.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop table if it exists from a previous failed migration attempt
  await knex.schema.raw('DROP TABLE IF EXISTS `MoneyTrackerSettings`;');

  await knex.schema.raw(`
    CREATE TABLE \`MoneyTrackerSettings\` (
      \`id\` VARCHAR(191) NOT NULL DEFAULT 'singleton',
      \`autoSnapshotEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`snapshotHour\` INT NOT NULL DEFAULT 3,
      \`snapshotMinute\` INT NOT NULL DEFAULT 0,
      \`lastSnapshotAt\` DATETIME(3) NULL,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`updatedById\` VARCHAR(191) NULL,
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  // Insert the default singleton row
  await knex.schema.raw(`
    INSERT INTO \`MoneyTrackerSettings\` (\`id\`, \`autoSnapshotEnabled\`, \`snapshotHour\`, \`snapshotMinute\`)
    VALUES ('singleton', 0, 3, 0);
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `MoneyTrackerSettings`;');
}
