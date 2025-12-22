/**
 * Remove unique constraint on snapshotDate to allow multiple snapshots per day
 */
export function up(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.dropUnique(['snapshotDate']);
  });
}

export function down(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.unique(['snapshotDate']);
  });
}
