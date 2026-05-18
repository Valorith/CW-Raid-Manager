/**
 * Track when Telegram respawn alerts were enabled for a user subscription.
 *
 * This lets the scheduler ignore already-open respawn states when a user turns
 * Telegram on for an NPC that is currently in-window or already up.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('NpcRespawnSubscription');
  if (!hasTable) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'telegramNotificationsEnabledAt'
  );

  if (!hasColumn) {
    await knex.schema.alterTable('NpcRespawnSubscription', (table) => {
      table.dateTime('telegramNotificationsEnabledAt', { precision: 3 }).nullable();
    });
  }

  await knex('NpcRespawnSubscription')
    .where('telegramNotificationsEnabled', true)
    .whereNull('telegramNotificationsEnabledAt')
    .update({
      telegramNotificationsEnabledAt: knex.raw('COALESCE(`updatedAt`, `createdAt`)')
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

  const hasColumn = await knex.schema.hasColumn(
    'NpcRespawnSubscription',
    'telegramNotificationsEnabledAt'
  );

  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('NpcRespawnSubscription', (table) => {
    table.dropColumn('telegramNotificationsEnabledAt');
  });
}
