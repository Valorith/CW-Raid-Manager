/**
 * Add guild bank tracking columns to MoneySnapshot table
 */
export function up(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.bigInteger('totalGuildBankPlatinum').notNullable().defaultTo(0);
    // JSON columns can't have default values in MySQL, so we use nullable
    // and handle the default in application code
    table.json('topGuildBanks').nullable();
    table.integer('guildBankCount').notNullable().defaultTo(0);
  });
}

export function down(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.dropColumn('totalGuildBankPlatinum');
    table.dropColumn('topGuildBanks');
    table.dropColumn('guildBankCount');
  });
}
