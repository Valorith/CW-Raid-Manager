/**
 * Adds the Friends/Family guild rank alongside Member for tracking purposes.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(`
      ALTER TABLE \`GuildMembership\`
      MODIFY \`role\` ENUM('LEADER','OFFICER','RAID_LEADER','MEMBER','FRIENDS_FAMILY') NOT NULL;
    `);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(`
      ALTER TABLE \`GuildMembership\`
      MODIFY \`role\` ENUM('LEADER','OFFICER','RAID_LEADER','MEMBER') NOT NULL;
    `);
  });
}
