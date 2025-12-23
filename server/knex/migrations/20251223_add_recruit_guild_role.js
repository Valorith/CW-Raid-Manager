/**
 * Adds the Recruit guild rank as the default rank for new guild members.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(`
      ALTER TABLE \`GuildMembership\`
      MODIFY \`role\` ENUM('LEADER','OFFICER','RAID_LEADER','MEMBER','RECRUIT','FRIENDS_FAMILY') NOT NULL;
    `);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    // First, update any RECRUIT members to MEMBER before removing the enum value
    await trx.raw(`
      UPDATE \`GuildMembership\`
      SET \`role\` = 'MEMBER'
      WHERE \`role\` = 'RECRUIT';
    `);

    await trx.schema.raw(`
      ALTER TABLE \`GuildMembership\`
      MODIFY \`role\` ENUM('LEADER','OFFICER','RAID_LEADER','MEMBER','FRIENDS_FAMILY') NOT NULL;
    `);
  });
}
