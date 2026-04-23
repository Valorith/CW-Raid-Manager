/**
 * Add composite indexes for the hottest list/query paths.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await addIndexIfMissing(knex, 'RaidEvent', 'RaidEvent_guildId_startTime_idx', ['guildId', 'startTime']);
  await addIndexIfMissing(knex, 'RaidLootEvent', 'RaidLootEvent_guildId_createdAt_idx', ['guildId', 'createdAt']);
  await addIndexIfMissing(knex, 'InboundWebhookMessage', 'InboundWebhookMessage_webhook_archive_received_idx', ['webhookId', 'archivedAt', 'receivedAt']);
  await addIndexIfMissing(knex, 'InboundWebhookMessage', 'InboundWebhookMessage_status_archive_received_idx', ['status', 'archivedAt', 'receivedAt']);
  await addIndexIfMissing(knex, 'MarketListing', 'MarketListing_item_price_listed_idx', ['itemId', 'price', 'listedAt']);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await dropIndexIfExists(knex, 'MarketListing', 'MarketListing_item_price_listed_idx');
  await dropIndexIfExists(knex, 'InboundWebhookMessage', 'InboundWebhookMessage_status_archive_received_idx');
  await dropIndexIfExists(knex, 'InboundWebhookMessage', 'InboundWebhookMessage_webhook_archive_received_idx');
  await dropIndexIfExists(knex, 'RaidLootEvent', 'RaidLootEvent_guildId_createdAt_idx');
  await dropIndexIfExists(knex, 'RaidEvent', 'RaidEvent_guildId_startTime_idx');
}

async function addIndexIfMissing(knex, tableName, indexName, columns) {
  if (!(await knex.schema.hasTable(tableName)) || (await hasIndex(knex, tableName, indexName))) {
    return;
  }

  await knex.schema.alterTable(tableName, (table) => {
    table.index(columns, indexName);
  });
}

async function dropIndexIfExists(knex, tableName, indexName) {
  if (!(await knex.schema.hasTable(tableName)) || !(await hasIndex(knex, tableName, indexName))) {
    return;
  }

  await knex.schema.alterTable(tableName, (table) => {
    table.dropIndex([], indexName);
  });
}

async function hasIndex(knex, tableName, indexName) {
  const result = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [tableName, indexName]);
  const rows = Array.isArray(result) ? result[0] : result;
  return Array.isArray(rows) && rows.length > 0;
}
