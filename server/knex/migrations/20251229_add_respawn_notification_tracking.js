/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    // NPC Respawn Notification table - tracks which notifications have been sent for current respawn cycle
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`NpcRespawnNotification\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`npcDefinitionId\` VARCHAR(191) NOT NULL,
        \`isInstanceVariant\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`lastKillRecordId\` VARCHAR(191) NULL,
        \`windowNotifiedAt\` DATETIME(3) NULL,
        \`upNotifiedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`NpcRespawnNotification_npcDef_variant_key\`(\`npcDefinitionId\`, \`isInstanceVariant\`),
        INDEX \`NpcRespawnNotification_npcDefinitionId_idx\`(\`npcDefinitionId\`),
        INDEX \`NpcRespawnNotification_lastKillRecordId_idx\`(\`lastKillRecordId\`),
        CONSTRAINT \`NpcRespawnNotification_npcDefinitionId_fkey\` FOREIGN KEY (\`npcDefinitionId\`) REFERENCES \`NpcDefinition\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`NpcRespawnNotification_lastKillRecordId_fkey\` FOREIGN KEY (\`lastKillRecordId\`) REFERENCES \`NpcKillRecord\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw('DROP TABLE IF EXISTS `NpcRespawnNotification`;');
  });
}
