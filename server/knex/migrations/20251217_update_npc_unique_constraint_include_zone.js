/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop the old unique constraint that only uses guildId and npcNameNormalized
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.dropUnique(['guildId', 'npcNameNormalized'], 'NpcDefinition_guild_npc_unique');
  });

  // Create a new unique constraint that includes zoneName
  // This allows NPCs with the same name in different zones
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.unique(['guildId', 'npcNameNormalized', 'zoneName'], {
      indexName: 'NpcDefinition_guild_npc_zone_unique'
    });
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Drop the new unique constraint
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.dropUnique(['guildId', 'npcNameNormalized', 'zoneName'], 'NpcDefinition_guild_npc_zone_unique');
  });

  // Restore the old unique constraint
  await knex.schema.alterTable('NpcDefinition', (table) => {
    table.unique(['guildId', 'npcNameNormalized'], {
      indexName: 'NpcDefinition_guild_npc_unique'
    });
  });
}
