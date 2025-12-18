/**
 * Add resolvedAt and resolvedById columns to PendingNpcKillClarification
 * This enables soft-delete behavior so that re-scanning raid logs
 * doesn't recreate previously actioned clarifications.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('PendingNpcKillClarification', table => {
    table.timestamp('resolvedAt').nullable();
    table.string('resolvedById', 191).nullable();
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('PendingNpcKillClarification', table => {
    table.dropColumn('resolvedAt');
    table.dropColumn('resolvedById');
  });
}
