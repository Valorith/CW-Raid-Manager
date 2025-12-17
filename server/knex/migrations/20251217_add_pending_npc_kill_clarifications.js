/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('PendingNpcKillClarification', (table) => {
    table.string('id', 30).primary();
    table.string('guildId', 30).notNullable();
    table.string('raidId', 30).nullable();
    table.string('clarificationType', 20).notNullable(); // 'instance' or 'zone'
    table.string('npcName', 191).notNullable();
    table.datetime('killedAt').notNullable();
    table.string('killedByName', 191).nullable();
    table.string('npcDefinitionId', 30).nullable();
    table.json('zoneOptions').nullable();
    table.datetime('createdAt').notNullable().defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('guildId').references('id').inTable('Guild').onDelete('CASCADE');
    table.foreign('raidId').references('id').inTable('RaidEvent').onDelete('SET NULL');
    table.foreign('npcDefinitionId').references('id').inTable('NpcDefinition').onDelete('CASCADE');

    // Indexes
    table.index(['guildId']);
    table.index(['raidId']);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('PendingNpcKillClarification');
}
