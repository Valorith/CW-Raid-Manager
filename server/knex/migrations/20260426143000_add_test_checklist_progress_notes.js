/**
 * Add per-tester notes for individual test checklist progress rows.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const tableExists = await knex.schema.hasTable('TestChangeChecklistProgress');
  if (!tableExists) {
    return;
  }

  const columnExists = await knex.schema.hasColumn('TestChangeChecklistProgress', 'notesHtml');
  if (!columnExists) {
    await knex.schema.alterTable('TestChangeChecklistProgress', (table) => {
      table.text('notesHtml', 'longtext').nullable();
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const tableExists = await knex.schema.hasTable('TestChangeChecklistProgress');
  if (!tableExists) {
    return;
  }

  const columnExists = await knex.schema.hasColumn('TestChangeChecklistProgress', 'notesHtml');
  if (columnExists) {
    await knex.schema.alterTable('TestChangeChecklistProgress', (table) => {
      table.dropColumn('notesHtml');
    });
  }
}
