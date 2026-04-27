/**
 * Persist each tester's progress against each change checklist item.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('TestChangeChecklistProgress');
  if (exists) {
    return;
  }

  await knex.schema.createTable('TestChangeChecklistProgress', (table) => {
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.string('id', 191).primary();
    table.string('testerId', 191).notNullable();
    table.string('checklistItemId', 191).notNullable();
    table.boolean('completed').notNullable().defaultTo(false);
    table.dateTime('completedAt', { precision: 3 }).nullable();
    table.text('notesHtml', 'longtext').nullable();
    table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.unique(['testerId', 'checklistItemId'], {
      indexName: 'TestChecklistProgress_tester_item_key'
    });
    table.index(['checklistItemId'], 'TestChecklistProgress_item_idx');
    table.index(['testerId'], 'TestChecklistProgress_tester_idx');
    table
      .foreign('testerId', 'TestChecklistProgress_testerId_fkey')
      .references('TestChangeTester.id')
      .onDelete('CASCADE');
    table
      .foreign('checklistItemId', 'TestChecklistProgress_itemId_fkey')
      .references('TestChangeChecklistItem.id')
      .onDelete('CASCADE');
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const exists = await knex.schema.hasTable('TestChangeChecklistProgress');
  if (exists) {
    await knex.schema.dropTable('TestChangeChecklistProgress');
  }
}
