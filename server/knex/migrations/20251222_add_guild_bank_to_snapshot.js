/**
 * Add guild bank tracking columns to MoneySnapshot table
 */
export function up(knex) {
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.bigInteger('totalGuildBankPlatinum').notNullable().defaultTo(0);
    table.json('topGuildBanks').notNullable().defaultTo('[]');
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
