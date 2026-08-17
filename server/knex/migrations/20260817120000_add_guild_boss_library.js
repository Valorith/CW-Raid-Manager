/**
 * Add the guild-scoped boss library and per-membership contributor permission.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasContributorFlag = await knex.schema.hasColumn('GuildMembership', 'isBossContributor');
  if (!hasContributorFlag) {
    await knex.schema.alterTable('GuildMembership', (table) => {
      table.boolean('isBossContributor').notNullable().defaultTo(false).after('role');
    });
  }

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBossGroup\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(120) NOT NULL,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`GuildBossGroup_guild_name_key\` (\`guildId\`, \`name\`),
      INDEX \`GuildBossGroup_guild_sort_idx\` (\`guildId\`, \`sortOrder\`),
      CONSTRAINT \`GuildBossGroup_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS \`GuildBoss\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`guildId\` VARCHAR(191) NOT NULL,
      \`groupId\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`imageUrl\` VARCHAR(2048) NULL,
      \`notes\` LONGTEXT NULL,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`lastEditedById\` VARCHAR(191) NULL,
      \`lastEditedByName\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`GuildBoss_guild_name_key\` (\`guildId\`, \`name\`),
      INDEX \`GuildBoss_guild_group_sort_idx\` (\`guildId\`, \`groupId\`, \`sortOrder\`),
      INDEX \`GuildBoss_group_idx\` (\`groupId\`),
      CONSTRAINT \`GuildBoss_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`GuildBoss_groupId_fkey\` FOREIGN KEY (\`groupId\`) REFERENCES \`GuildBossGroup\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBoss`;');
  await knex.schema.raw('DROP TABLE IF EXISTS `GuildBossGroup`;');

  const hasContributorFlag = await knex.schema.hasColumn('GuildMembership', 'isBossContributor');
  if (hasContributorFlag) {
    await knex.schema.alterTable('GuildMembership', (table) => {
      table.dropColumn('isBossContributor');
    });
  }
}
