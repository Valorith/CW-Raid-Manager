const changeStatuses = [
  'SUBMITTED',
  'AWAITING_TEST',
  'TESTING',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'RENEWED',
  'CLOSED',
  'ARCHIVED'
];

const previousChangeStatuses = changeStatuses.filter((status) => status !== 'ARCHIVED');

function enumList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * Add an archived terminal status for deployed test-manager changes.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.raw(
    `ALTER TABLE \`TestChange\` MODIFY \`status\` ENUM(${enumList(
      changeStatuses
    )}) NOT NULL DEFAULT 'SUBMITTED'`
  );
}

/**
 * Remove the archived status, preserving archived changes as closed.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex('TestChange').where({ status: 'ARCHIVED' }).update({ status: 'CLOSED' });
  await knex.raw(
    `ALTER TABLE \`TestChange\` MODIFY \`status\` ENUM(${enumList(
      previousChangeStatuses
    )}) NOT NULL DEFAULT 'SUBMITTED'`
  );
}
