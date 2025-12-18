/**
 * Add resolvedAt and resolvedById columns to PendingNpcKillClarification
 * This enables soft-delete behavior so that re-scanning raid logs
 * doesn't recreate previously actioned clarifications.
 */

exports.up = function(knex) {
  return knex.schema.alterTable('PendingNpcKillClarification', table => {
    table.timestamp('resolvedAt').nullable();
    table.string('resolvedById', 191).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('PendingNpcKillClarification', table => {
    table.dropColumn('resolvedAt');
    table.dropColumn('resolvedById');
  });
};
