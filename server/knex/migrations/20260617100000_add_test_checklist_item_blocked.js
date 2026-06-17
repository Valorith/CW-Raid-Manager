/**
 * Add a persisted blocked flag for Test Manager checklist items.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const tableExists = await knex.schema.hasTable('TestChangeChecklistItem');
  if (!tableExists) {
    return;
  }

  const columnExists = await knex.schema.hasColumn('TestChangeChecklistItem', 'blocked');
  if (!columnExists) {
    await knex.schema.alterTable('TestChangeChecklistItem', (table) => {
      table.boolean('blocked').notNullable().defaultTo(false);
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const tableExists = await knex.schema.hasTable('TestChangeChecklistItem');
  if (!tableExists) {
    return;
  }

  const columnExists = await knex.schema.hasColumn('TestChangeChecklistItem', 'blocked');
  if (columnExists) {
    await knex.schema.alterTable('TestChangeChecklistItem', (table) => {
      table.dropColumn('blocked');
    });
  }
}
