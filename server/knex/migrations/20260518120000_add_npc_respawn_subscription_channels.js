/**
 * Store per-user NPC respawn notification channels.
 *
 * Existing subscriptions become browser-only, preserving the original bell behavior.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('NpcRespawnSubscription');
  if (!hasTable) {
    return;
  }

  const hasBrowserColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'browserNotificationsEnabled'
  );
  const hasTelegramColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'telegramNotificationsEnabled'
  );

  await knex.schema.alterTable('NpcRespawnSubscription', (table) => {
    if (!hasBrowserColumn) {
      table.boolean('browserNotificationsEnabled').notNullable().defaultTo(true);
    }
    if (!hasTelegramColumn) {
      table.boolean('telegramNotificationsEnabled').notNullable().defaultTo(false);
    }
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasTable = await knex.schema.hasTable('NpcRespawnSubscription');
  if (!hasTable) {
    return;
  }

  const hasTelegramColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'telegramNotificationsEnabled'
  );
  const hasBrowserColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'browserNotificationsEnabled'
  );

  await knex.schema.alterTable('NpcRespawnSubscription', (table) => {
    if (hasTelegramColumn) {
      table.dropColumn('telegramNotificationsEnabled');
    }
    if (hasBrowserColumn) {
      table.dropColumn('browserNotificationsEnabled');
    }
  });
}
