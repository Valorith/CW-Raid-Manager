/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Add associationType column to CharacterAssociation table
  await knex.schema.raw(`
    ALTER TABLE \`CharacterAssociation\`
    ADD COLUMN \`associationType\` VARCHAR(20) NOT NULL DEFAULT 'indirect'
    AFTER \`targetAccountId\`;
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`CharacterAssociation\`
    DROP COLUMN \`associationType\`;
  `);
}
