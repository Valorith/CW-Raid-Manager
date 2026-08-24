export function canonicalizeTrackerLinkName(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u0060\u00b4\u02bc\u2018\u2019\u201b\u2032\uff07]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function buildObviousBossTrackerLinks(bosses, definitions) {
  const definitionsByName = new Map();
  for (const definition of definitions) {
    const key = `${definition.guildId}\u0000${canonicalizeTrackerLinkName(definition.npcName)}`;
    const candidates = definitionsByName.get(key) ?? [];
    candidates.push(definition);
    definitionsByName.set(key, candidates);
  }

  return bosses.flatMap((boss) => {
    const key = `${boss.guildId}\u0000${canonicalizeTrackerLinkName(boss.name)}`;
    const candidates = definitionsByName.get(key) ?? [];
    return candidates.length === 1
      ? [{ bossId: boss.id, npcDefinitionId: candidates[0].id }]
      : [];
  });
}

/**
 * Link Boss Library cards to explicit NPC Respawn Tracker definitions.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      ADD COLUMN \`npcDefinitionId\` VARCHAR(191) NULL,
      ADD INDEX \`GuildBoss_npcDefinition_idx\` (\`npcDefinitionId\`),
      ADD CONSTRAINT \`GuildBoss_npcDefinitionId_fkey\`
        FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  const [bosses, definitions] = await Promise.all([
    knex('GuildBoss')
      .select('id', 'guildId', 'name')
      .whereNull('npcDefinitionId'),
    knex('NpcDefinition').select('id', 'guildId', 'npcName')
  ]);
  const links = buildObviousBossTrackerLinks(bosses, definitions);
  for (const link of links) {
    await knex('GuildBoss')
      .where({ id: link.bossId })
      .whereNull('npcDefinitionId')
      .update({ npcDefinitionId: link.npcDefinitionId });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`GuildBoss\`
      DROP FOREIGN KEY \`GuildBoss_npcDefinitionId_fkey\`,
      DROP INDEX \`GuildBoss_npcDefinition_idx\`,
      DROP COLUMN \`npcDefinitionId\`;
  `);
}
