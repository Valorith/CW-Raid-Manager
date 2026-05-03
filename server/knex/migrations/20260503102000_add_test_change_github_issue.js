/**
 * Add optional GitHub issue linkage to Test Manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasUrlColumn = await knex.schema.hasColumn('TestChange', 'githubIssueUrl');
  const hasMetadataColumn = await knex.schema.hasColumn('TestChange', 'githubIssueMetadata');

  if (!hasUrlColumn || !hasMetadataColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      if (!hasUrlColumn) {
        table.string('githubIssueUrl', 500).nullable().after('githubPrMetadata');
      }
      if (!hasMetadataColumn) {
        table.json('githubIssueMetadata').nullable().after('githubIssueUrl');
      }
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasUrlColumn = await knex.schema.hasColumn('TestChange', 'githubIssueUrl');
  const hasMetadataColumn = await knex.schema.hasColumn('TestChange', 'githubIssueMetadata');

  if (hasUrlColumn || hasMetadataColumn) {
    await knex.schema.alterTable('TestChange', (table) => {
      if (hasMetadataColumn) {
        table.dropColumn('githubIssueMetadata');
      }
      if (hasUrlColumn) {
        table.dropColumn('githubIssueUrl');
      }
    });
  }
}
