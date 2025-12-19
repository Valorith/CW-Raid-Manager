/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    // Add isInstanceVariant column to track which variant the subscription is for
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      ADD COLUMN \`isInstanceVariant\` BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // Drop the old unique constraint (npcDefinitionId, userId)
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      DROP INDEX \`NpcRespawnSubscription_npcDefinitionId_userId_key\`;
    `);

    // Create new unique constraint including isInstanceVariant
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      ADD UNIQUE INDEX \`NpcRespawnSubscription_npcDef_user_variant_key\`(\`npcDefinitionId\`, \`userId\`, \`isInstanceVariant\`);
    `);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    // Drop the new unique constraint
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      DROP INDEX \`NpcRespawnSubscription_npcDef_user_variant_key\`;
    `);

    // Recreate the old unique constraint
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      ADD UNIQUE INDEX \`NpcRespawnSubscription_npcDefinitionId_userId_key\`(\`npcDefinitionId\`, \`userId\`);
    `);

    // Remove the isInstanceVariant column
    await trx.schema.raw(`
      ALTER TABLE \`NpcRespawnSubscription\`
      DROP COLUMN \`isInstanceVariant\`;
    `);
  });
}
