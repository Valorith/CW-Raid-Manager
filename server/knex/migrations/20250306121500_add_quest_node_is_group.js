/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`QuestNode\`
    ADD COLUMN \`isGroup\` BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`QuestNode\`
    DROP COLUMN \`isGroup\`;
  `);
}
