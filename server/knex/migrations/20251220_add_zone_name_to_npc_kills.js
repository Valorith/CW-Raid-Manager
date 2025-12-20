/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const [hasColumn] = await knex('information_schema.COLUMNS')
    .where({
      TABLE_SCHEMA: knex.client.config.connection.database,
      TABLE_NAME: 'RaidNpcKillEvent',
      COLUMN_NAME: 'zoneName'
    })
    .count('* as count');

  if (!hasColumn?.count) {
    await knex.schema.raw(`
      ALTER TABLE \`RaidNpcKillEvent\`
      ADD COLUMN \`zoneName\` VARCHAR(191) NULL AFTER \`killerName\`;
    `);
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('ALTER TABLE `RaidNpcKillEvent` DROP COLUMN `zoneName`;');
}
