/**
 * Remove unique constraint on snapshotDate to allow multiple snapshots per day
 */
export async function up(knex) {
  // Check if the unique constraint exists before trying to drop it
  const [rows] = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'MoneySnapshot'
      AND CONSTRAINT_TYPE = 'UNIQUE'
      AND CONSTRAINT_NAME LIKE '%snapshotdate%'
  `);

  if (rows && rows.length > 0) {
    const constraintName = rows[0].CONSTRAINT_NAME;
    await knex.raw(`ALTER TABLE MoneySnapshot DROP INDEX \`${constraintName}\``);
  }
  // If no constraint exists, nothing to do - migration succeeds
}

export async function down(knex) {
  // Re-add the unique constraint
  return knex.schema.alterTable('MoneySnapshot', (table) => {
    table.unique(['snapshotDate']);
  });
}
