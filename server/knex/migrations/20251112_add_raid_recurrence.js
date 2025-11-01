/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`RaidEventSeries\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`guildId\` VARCHAR(191) NOT NULL,
        \`createdById\` VARCHAR(191) NOT NULL,
        \`frequency\` ENUM('DAILY','WEEKLY','MONTHLY') NOT NULL,
        \`interval\` INT NOT NULL DEFAULT 1,
        \`endDate\` DATETIME(3) NULL,
        \`isActive\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`RaidEventSeries_guildId_idx\`(\`guildId\`),
        INDEX \`RaidEventSeries_createdById_idx\`(\`createdById\`),
        CONSTRAINT \`RaidEventSeries_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`RaidEventSeries_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    const [hasColumn] = await trx('information_schema.COLUMNS')
      .where({
        TABLE_SCHEMA: trx.client.config.connection.database,
        TABLE_NAME: 'RaidEvent',
        COLUMN_NAME: 'recurrenceSeriesId'
      })
      .count('* as count');

    if (!hasColumn?.count) {
      await trx.schema.raw(`
        ALTER TABLE \`RaidEvent\`
        ADD COLUMN \`recurrenceSeriesId\` VARCHAR(191) NULL AFTER \`startedAt\`,
        ADD INDEX \`RaidEvent_recurrenceSeriesId_idx\`(\`recurrenceSeriesId\`),
        ADD CONSTRAINT \`RaidEvent_recurrenceSeriesId_fkey\` FOREIGN KEY (\`recurrenceSeriesId\`)
          REFERENCES \`RaidEventSeries\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
      `);
    }
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    const [hasColumn] = await trx('information_schema.COLUMNS')
      .where({
        TABLE_SCHEMA: trx.client.config.connection.database,
        TABLE_NAME: 'RaidEvent',
        COLUMN_NAME: 'recurrenceSeriesId'
      })
      .count('* as count');

    if (hasColumn?.count) {
      await trx.schema.raw(`
        ALTER TABLE \`RaidEvent\`
        DROP FOREIGN KEY \`RaidEvent_recurrenceSeriesId_fkey\`,
        DROP INDEX \`RaidEvent_recurrenceSeriesId_idx\`,
        DROP COLUMN \`recurrenceSeriesId\`;
      `);
    }

    await trx.schema.raw('DROP TABLE IF EXISTS `RaidEventSeries`;');
  });
}
