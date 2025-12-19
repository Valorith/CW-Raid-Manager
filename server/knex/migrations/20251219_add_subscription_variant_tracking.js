/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Add isInstanceVariant column to track which variant the subscription is for
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    ADD COLUMN \`isInstanceVariant\` BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Drop the foreign key constraint first (it depends on the unique index)
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    DROP FOREIGN KEY \`NpcRespawnSubscription_npcDefinitionId_fkey\`;
  `);

  // Drop the old unique constraint (npcDefinitionId, userId)
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    DROP INDEX \`NpcRespawnSubscription_npcDefinitionId_userId_key\`;
  `);

  // Create new unique constraint including isInstanceVariant
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    ADD UNIQUE INDEX \`NpcRespawnSubscription_npcDef_user_variant_key\`(\`npcDefinitionId\`, \`userId\`, \`isInstanceVariant\`);
  `);

  // Recreate the foreign key constraint
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    ADD CONSTRAINT \`NpcRespawnSubscription_npcDefinitionId_fkey\`
    FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`)
    ON DELETE CASCADE ON UPDATE CASCADE;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Drop the foreign key constraint first
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    DROP FOREIGN KEY \`NpcRespawnSubscription_npcDefinitionId_fkey\`;
  `);

  // Drop the new unique constraint
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    DROP INDEX \`NpcRespawnSubscription_npcDef_user_variant_key\`;
  `);

  // Delete any duplicate subscriptions that would violate the old constraint
  // (keep the one with isInstanceVariant=false)
  await knex.schema.raw(`
    DELETE s1 FROM \`NpcRespawnSubscription\` s1
    INNER JOIN \`NpcRespawnSubscription\` s2
    ON s1.npcDefinitionId = s2.npcDefinitionId AND s1.userId = s2.userId
    WHERE s1.isInstanceVariant = TRUE AND s2.isInstanceVariant = FALSE;
  `);

  // Recreate the old unique constraint
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    ADD UNIQUE INDEX \`NpcRespawnSubscription_npcDefinitionId_userId_key\`(\`npcDefinitionId\`, \`userId\`);
  `);

  // Recreate the foreign key constraint
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    ADD CONSTRAINT \`NpcRespawnSubscription_npcDefinitionId_fkey\`
    FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`)
    ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // Remove the isInstanceVariant column
  await knex.schema.raw(`
    ALTER TABLE \`NpcRespawnSubscription\`
    DROP COLUMN \`isInstanceVariant\`;
  `);
}
