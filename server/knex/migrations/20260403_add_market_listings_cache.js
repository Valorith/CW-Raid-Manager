/**
 * Add persisted market listings cache sourced from the EQ trader table.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketListing = await knex.schema.hasTable('MarketListing');
  if (hasMarketListing) {
    return;
  }

  await knex.schema.createTable('MarketListing', (table) => {
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.string('id', 191).primary();
    table.integer('sellerCharacterId').notNullable();
    table.string('sellerCharacterName', 191).notNullable();
    table.integer('itemId').notNullable();
    table.string('itemName', 191).notNullable();
    table.integer('itemIconId').nullable();
    table.integer('itemType').nullable();
    table.integer('itemSlots').nullable();
    table.integer('price').notNullable();
    table.integer('charges').nullable();
    table.integer('slotId').notNullable();
    table.dateTime('listedAt', { precision: 3 }).nullable();
    table.dateTime('syncedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['listedAt'], 'MarketListing_listedAt_idx');
    table.index(['price'], 'MarketListing_price_idx');
    table.index(['sellerCharacterId'], 'MarketListing_sellerCharacterId_idx');
    table.index(['itemId'], 'MarketListing_itemId_idx');
    table.index(['itemType'], 'MarketListing_itemType_idx');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMarketListing = await knex.schema.hasTable('MarketListing');
  if (hasMarketListing) {
    await knex.schema.dropTable('MarketListing');
  }
}
