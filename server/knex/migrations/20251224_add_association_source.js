/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Add source column to CharacterAssociation table
  // 'manual' = admin added, 'auto' = IP sync created
  await knex.schema.raw(`
    ALTER TABLE \`CharacterAssociation\`
    ADD COLUMN \`source\` VARCHAR(20) NOT NULL DEFAULT 'manual'
    AFTER \`associationType\`;
  `);

  // Update existing associations that have "Same IP" reason to be 'auto'
  await knex.raw(`
    UPDATE \`CharacterAssociation\`
    SET \`source\` = 'auto'
    WHERE \`reason\` LIKE 'Same IP%';
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`CharacterAssociation\`
    DROP COLUMN \`source\`;
  `);
}
