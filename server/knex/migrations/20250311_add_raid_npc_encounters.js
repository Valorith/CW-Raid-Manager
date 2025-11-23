/**
 * No-op placeholder migration to restore sequence; original file was missing.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw('SELECT 1');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw('SELECT 1');
  });
}
