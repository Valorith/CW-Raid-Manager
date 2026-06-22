/**
 * Add Codex job dedupe metadata for crash-fix handoffs.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasSourceType = await knex.schema.hasColumn('CodexJob', 'sourceType');
  if (!hasSourceType) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.string('sourceType', 40).nullable().after('status');
    });
  }

  const hasDedupeKey = await knex.schema.hasColumn('CodexJob', 'dedupeKey');
  if (!hasDedupeKey) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.string('dedupeKey', 128).nullable().after('sourceType');
    });
  }

  const indexes = await knex.raw('SHOW INDEX FROM `CodexJob` WHERE Key_name = ?', [
    'CodexJob_dedupe_target_status_idx'
  ]);
  const rows = Array.isArray(indexes) ? indexes[0] : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.index(
        ['dedupeKey', 'targetRepository', 'baseBranch', 'status'],
        'CodexJob_dedupe_target_status_idx'
      );
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const indexes = await knex.raw('SHOW INDEX FROM `CodexJob` WHERE Key_name = ?', [
    'CodexJob_dedupe_target_status_idx'
  ]);
  const rows = Array.isArray(indexes) ? indexes[0] : [];
  if (Array.isArray(rows) && rows.length > 0) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.dropIndex(
        ['dedupeKey', 'targetRepository', 'baseBranch', 'status'],
        'CodexJob_dedupe_target_status_idx'
      );
    });
  }

  const hasDedupeKey = await knex.schema.hasColumn('CodexJob', 'dedupeKey');
  if (hasDedupeKey) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.dropColumn('dedupeKey');
    });
  }

  const hasSourceType = await knex.schema.hasColumn('CodexJob', 'sourceType');
  if (hasSourceType) {
    await knex.schema.alterTable('CodexJob', (table) => {
      table.dropColumn('sourceType');
    });
  }
}
