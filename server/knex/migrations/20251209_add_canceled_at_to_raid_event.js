/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const [hasColumn] = await knex('information_schema.COLUMNS')
    .where({
      TABLE_SCHEMA: knex.client.config.connection.database,
      TABLE_NAME: 'RaidEvent',
      COLUMN_NAME: 'canceledAt'
    })
    .count('* as count');

  if (!hasColumn?.count) {
    await knex.schema.raw(`
      ALTER TABLE \`RaidEvent\`
      ADD COLUMN \`canceledAt\` DATETIME(3) NULL AFTER \`startedAt\`;
    `);
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('ALTER TABLE `RaidEvent` DROP COLUMN `canceledAt`;');
}
