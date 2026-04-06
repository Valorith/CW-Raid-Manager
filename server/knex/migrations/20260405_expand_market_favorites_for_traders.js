/**
 * Expand market favorites to support a dedicated saved trader list.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (!hasMarketFavorite) {
    return;
  }

  await knex.raw(`
    ALTER TABLE \`MarketFavorite\`
    MODIFY COLUMN \`listType\` ENUM('FAVORITE_ITEMS', 'FAVORITE_CHARACTERS', 'MY_TRADERS') NOT NULL
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (!hasMarketFavorite) {
    return;
  }

  await knex('MarketFavorite').where({ listType: 'MY_TRADERS' }).del();
  await knex.raw(`
    ALTER TABLE \`MarketFavorite\`
    MODIFY COLUMN \`listType\` ENUM('FAVORITE_ITEMS', 'FAVORITE_CHARACTERS') NOT NULL
  `);
}
