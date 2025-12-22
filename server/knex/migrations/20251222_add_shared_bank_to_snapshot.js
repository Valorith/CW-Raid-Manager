/**
 * Add shared bank tracking columns to MoneySnapshot table
 */
export function up(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.bigInteger('totalSharedPlatinum').notNullable().defaultTo(0);
    table.integer('sharedBankCount').notNullable().defaultTo(0);
  });
}

export function down(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.dropColumn('totalSharedPlatinum');
    table.dropColumn('sharedBankCount');
  });
}
