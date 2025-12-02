/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`RaidSignup\`
    ADD COLUMN \`status\` ENUM('CONFIRMED', 'NOT_ATTENDING') NOT NULL DEFAULT 'CONFIRMED'
    AFTER \`isMain\`;
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('ALTER TABLE `RaidSignup` DROP COLUMN `status`;');
}
