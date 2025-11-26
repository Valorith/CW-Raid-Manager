/**
 * Adds a GuildBankCharacter table to track bank alts per guild.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    const [[guildIdColumn]] = await trx.raw(
      "SHOW FULL COLUMNS FROM `Guild` LIKE 'id'"
    );
    const collation =
      (guildIdColumn && guildIdColumn.Collation) || 'utf8mb4_unicode_ci';
    const charset = typeof collation === 'string' ? collation.split('_')[0] || 'utf8mb4' : 'utf8mb4';

    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (hasTable) {
      return;
    }

    await trx.schema.createTable('GuildBankCharacter', (table) => {
      table.string('id', 191).notNullable().primary().collate(collation);
      table.string('guildId', 191).notNullable().collate(collation);
      table.string('name', 191).notNullable().collate(collation);
      table.string('normalizedName', 191).notNullable().collate(collation);
      table
        .dateTime('createdAt', { precision: 3 })
        .notNullable()
        .defaultTo(trx.fn.now(3));
      table
        .dateTime('updatedAt', { precision: 3 })
        .notNullable()
        .defaultTo(trx.fn.now(3));

      table
        .foreign('guildId')
        .references('Guild.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.index(['guildId'], 'GuildBankCharacter_guildId_idx');
      table.unique(['guildId', 'normalizedName'], 'GuildBankCharacter_guildId_normalizedName_key');
    }).charset(charset).collate(collation).engine('InnoDB');

    // Ensure updatedAt auto-updates on modify (MySQL/MariaDB)
    await trx.schema.raw(`
      ALTER TABLE \`GuildBankCharacter\`
      MODIFY \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    `);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (hasTable) {
      await trx.schema.dropTable('GuildBankCharacter');
    }
  });
}
