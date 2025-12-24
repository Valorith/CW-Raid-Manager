/**
 * Fix auto-linked character associations that were incorrectly attributed to "Valgor"
 * instead of "System". Updates both createdByName and createdById for all auto-sourced
 * associations where the creator was mistakenly set to Valgor.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Update all auto-created associations where createdByName is 'Valgor' to use 'System'
  const result = await knex.raw(`
    UPDATE \`CharacterAssociation\`
    SET \`createdById\` = 'system',
        \`createdByName\` = 'System'
    WHERE \`source\` = 'auto'
    AND \`createdByName\` = 'Valgor';
  `);

  const affectedRows = result[0]?.affectedRows || 0;
  console.log(`[Migration] Fixed ${affectedRows} auto-linked associations from Valgor to System`);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Note: We cannot reliably restore the original createdById since we don't know
  // what Valgor's user ID was. This is a data fix migration and should not be rolled back.
  console.log('[Migration] Rollback not supported for this data fix migration');
}
