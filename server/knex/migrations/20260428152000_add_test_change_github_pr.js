/**
 * Add optional GitHub pull request linkage to Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasUrlColumn = await knex.schema.hasColumn('TestChange', 'githubPrUrl');
  const hasMetadataColumn = await knex.schema.hasColumn('TestChange', 'githubPrMetadata');

  if (!hasUrlColumn || !hasMetadataColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      if (!hasUrlColumn) {
        table.string('githubPrUrl', 500).nullable().after('targetBuild');
      }
      if (!hasMetadataColumn) {
        table.json('githubPrMetadata').nullable().after('githubPrUrl');
      }
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasUrlColumn = await knex.schema.hasColumn('TestChange', 'githubPrUrl');
  const hasMetadataColumn = await knex.schema.hasColumn('TestChange', 'githubPrMetadata');

  if (hasUrlColumn || hasMetadataColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      if (hasMetadataColumn) {
        table.dropColumn('githubPrMetadata');
      }
      if (hasUrlColumn) {
        table.dropColumn('githubPrUrl');
      }
    });
  }
}
