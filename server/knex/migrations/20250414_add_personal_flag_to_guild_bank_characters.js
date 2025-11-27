/**
 * Adds an isPersonal flag to GuildBankCharacter to separate personal vs guild rosters.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (!hasTable) {
      return;
    }

    const hasColumn = await trx.schema.hasColumn('GuildBankCharacter', 'isPersonal');
    if (hasColumn) {
      return;
    }

    await trx.schema.alterTable('GuildBankCharacter', (table) => {
      table.boolean('isPersonal').notNullable().defaultTo(false).after('normalizedName');
    });
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (!hasTable) {
      return;
    }

    const hasColumn = await trx.schema.hasColumn('GuildBankCharacter', 'isPersonal');
    if (!hasColumn) {
      return;
    }

    await trx.schema.alterTable('GuildBankCharacter', (table) => {
      table.dropColumn('isPersonal');
    });
  });
}
