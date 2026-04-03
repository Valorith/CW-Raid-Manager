/**
 * Backfill item metadata columns onto the cached market listings table for
 * type and equipment-slot filtering.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketListing = await knex.schema.hasTable('MarketListing');
  if (!hasMarketListing) {
    return;
  }

  const hasItemType = await knex.schema.hasColumn('MarketListing', 'itemType');
  const hasItemSlots = await knex.schema.hasColumn('MarketListing', 'itemSlots');

  await knex.schema.alterTable('MarketListing', (table) => {
    if (!hasItemType) {
      table.integer('itemType').nullable();
    }

    if (!hasItemSlots) {
      table.integer('itemSlots').nullable();
    }
  });

  if (!hasItemType) {
    await knex.schema.alterTable('MarketListing', (table) => {
      table.index(['itemType'], 'MarketListing_itemType_idx');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMarketListing = await knex.schema.hasTable('MarketListing');
  if (!hasMarketListing) {
    return;
  }

  const hasItemType = await knex.schema.hasColumn('MarketListing', 'itemType');
  const hasItemSlots = await knex.schema.hasColumn('MarketListing', 'itemSlots');

  if (hasItemType) {
    await knex.schema.alterTable('MarketListing', (table) => {
      table.dropIndex(['itemType'], 'MarketListing_itemType_idx');
    });
  }

  await knex.schema.alterTable('MarketListing', (table) => {
    if (hasItemType) {
      table.dropColumn('itemType');
    }

    if (hasItemSlots) {
      table.dropColumn('itemSlots');
    }
  });
}
