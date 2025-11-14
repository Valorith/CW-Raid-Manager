/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('QuestAssignment', (table) => {
      table.string('characterId', 191).nullable().after('userId');
    });

    await trx.schema.raw(
      'CREATE INDEX `QuestAssignment_characterId_idx` ON `QuestAssignment`(`characterId`);'
    );

    await trx.schema.raw(`
      ALTER TABLE \`QuestAssignment\`
      ADD CONSTRAINT \`QuestAssignment_characterId_fkey\`
        FOREIGN KEY (\`characterId\`)
        REFERENCES \`Characters\`(\`id\`)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
    `);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(
      'ALTER TABLE `QuestAssignment` DROP FOREIGN KEY `QuestAssignment_characterId_fkey`;'
    );
    await trx.schema.raw('DROP INDEX `QuestAssignment_characterId_idx` ON `QuestAssignment`;');
    await trx.schema.alterTable('QuestAssignment', (table) => {
      table.dropColumn('characterId');
    });
  });
}
