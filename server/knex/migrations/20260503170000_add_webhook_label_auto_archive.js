/**
 * Add auto-archive/delete behavior to webhook message labels.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasLabelTable = await knex.schema.hasTable('WebhookMessageLabel');
  if (!hasLabelTable) return;

  const hasAutoArchive = await knex.schema.hasColumn('WebhookMessageLabel', 'autoArchive');
  if (!hasAutoArchive) {
    await knex.schema.alterTable('WebhookMessageLabel', (table) => {
      table.boolean('autoArchive').notNullable().defaultTo(false).after('sortOrder');
    });
  }

  const hasAutoDelete = await knex.schema.hasColumn('WebhookMessageLabel', 'autoDelete');
  if (!hasAutoDelete) {
    await knex.schema.alterTable('WebhookMessageLabel', (table) => {
      table.boolean('autoDelete').notNullable().defaultTo(false).after('autoArchive');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasLabelTable = await knex.schema.hasTable('WebhookMessageLabel');
  if (!hasLabelTable) return;

  const hasAutoDelete = await knex.schema.hasColumn('WebhookMessageLabel', 'autoDelete');
  const hasAutoArchive = await knex.schema.hasColumn('WebhookMessageLabel', 'autoArchive');
  if (hasAutoDelete || hasAutoArchive) {
    await knex.schema.alterTable('WebhookMessageLabel', (table) => {
      if (hasAutoDelete) table.dropColumn('autoDelete');
      if (hasAutoArchive) table.dropColumn('autoArchive');
    });
  }
}
