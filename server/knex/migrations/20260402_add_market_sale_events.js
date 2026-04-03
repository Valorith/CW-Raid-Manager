/**
 * Add persisted market sale events sourced from volatile EQ player_event_logs trader entries.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketSaleEvent = await knex.schema.hasTable('MarketSaleEvent');
  if (!hasMarketSaleEvent) {
    await knex.schema.createTable('MarketSaleEvent', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.bigInteger('eqLogId').notNullable();
      table.enu('eventType', ['TRADER_PURCHASE', 'TRADER_SELL']).notNullable();
      table.dateTime('occurredAt', { precision: 3 }).notNullable();
      table.dateTime('syncedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.integer('actorCharacterId').notNullable();
      table.string('actorCharacterName', 191).notNullable();
      table.integer('counterpartyCharacterId').nullable();
      table.string('counterpartyCharacterName', 191).nullable();
      table.integer('itemId').nullable();
      table.string('itemName', 191).notNullable();
      table.string('itemNameNormalized', 191).notNullable();
      table.integer('itemIconId').nullable();
      table.integer('price').notNullable();
      table.integer('quantity').notNullable().defaultTo(1);
      table.integer('charges').nullable();
      table.integer('totalCost').notNullable();
      table.integer('playerMoneyBalance').nullable();
      table.json('rawEventData').nullable();

      table.unique(['eqLogId'], { indexName: 'MarketSaleEvent_eqLogId_key' });
      table.index(['eventType', 'occurredAt'], 'MarketSaleEvent_eventType_occurredAt_idx');
      table.index(
        ['itemId', 'eventType', 'occurredAt'],
        'MarketSaleEvent_itemId_eventType_occurredAt_idx'
      );
      table.index(
        ['itemNameNormalized', 'eventType', 'occurredAt'],
        'MarketSaleEvent_itemName_eventType_occurredAt_idx'
      );
      table.index(
        ['actorCharacterId', 'eventType', 'occurredAt'],
        'MarketSaleEvent_actor_eventType_occurredAt_idx'
      );
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMarketSaleEvent = await knex.schema.hasTable('MarketSaleEvent');
  if (hasMarketSaleEvent) {
    await knex.schema.dropTable('MarketSaleEvent');
  }
}
