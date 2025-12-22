/**
 * Add shared bank tracking columns to MoneySnapshot table
 */
exports.up = function (knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.bigInteger('totalSharedPlatinum').notNullable().defaultTo(0);
    table.integer('sharedBankCount').notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.dropColumn('totalSharedPlatinum');
    table.dropColumn('sharedBankCount');
  });
};
