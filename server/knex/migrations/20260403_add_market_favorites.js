/**
 * Add user-scoped Market favorites for item and character lists.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (hasMarketFavorite) {
    return;
  }

  await knex.schema.createTable('MarketFavorite', (table) => {
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.string('id', 191).primary();
    table.string('userId', 191).notNullable();
    table.enu('listType', ['FAVORITE_ITEMS', 'FAVORITE_CHARACTERS']).notNullable();
    table.string('targetKey', 191).notNullable();
    table.integer('itemId').nullable();
    table.string('itemName', 191).nullable();
    table.integer('itemIconId').nullable();
    table.string('characterName', 191).nullable();
    table.dateTime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.dateTime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.unique(['userId', 'listType', 'targetKey'], {
      indexName: 'MarketFavorite_user_list_target_key'
    });
    table.index(['userId', 'listType'], 'MarketFavorite_userId_listType_idx');
    table.foreign('userId').references('User.id').onDelete('CASCADE').onUpdate('CASCADE');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (hasMarketFavorite) {
    await knex.schema.dropTable('MarketFavorite');
  }
}
