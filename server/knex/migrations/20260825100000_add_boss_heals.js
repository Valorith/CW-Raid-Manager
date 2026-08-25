/**
 * Add the structured raid healing plan to boss pages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      ADD COLUMN \`raidHeals\` BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN \`cHealChainSize\` INTEGER NOT NULL DEFAULT 2;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      DROP COLUMN \`cHealChainSize\`,
      DROP COLUMN \`raidHeals\`;
  `);
}
