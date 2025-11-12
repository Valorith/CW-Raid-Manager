/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`QuestBlueprint\`
    ADD COLUMN \`lastEditedById\` VARCHAR(191) NULL AFTER \`metadata\`,
    ADD COLUMN \`lastEditedByName\` VARCHAR(191) NULL AFTER \`lastEditedById\`;
  `);
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE \`QuestBlueprint\`
    DROP COLUMN \`lastEditedByName\`,
    DROP COLUMN \`lastEditedById\`;
  `);
}
