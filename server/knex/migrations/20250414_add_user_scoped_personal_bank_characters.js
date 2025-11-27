/**
 * Adds userId to GuildBankCharacter so personal entries are scoped to the creating user.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (!hasTable) return;

    // Match collation/charset of User.id
    const [[userIdColumn]] = await trx.raw("SHOW FULL COLUMNS FROM `User` LIKE 'id'");
    const userCollation =
      (userIdColumn && userIdColumn.Collation) || 'utf8mb4_unicode_ci';
    const userCharset =
      typeof userCollation === 'string'
        ? userCollation.split('_')[0] || 'utf8mb4'
        : 'utf8mb4';

    const hasColumn = await trx.schema.hasColumn('GuildBankCharacter', 'userId');
    if (!hasColumn) {
      await trx.schema.alterTable('GuildBankCharacter', (table) => {
        table.string('userId', 191).nullable().after('guildId').collate(userCollation);
      });
    } else {
      // Ensure collation/length align
      await trx.raw(
        `ALTER TABLE \`GuildBankCharacter\` MODIFY \`userId\` VARCHAR(191) CHARACTER SET ${userCharset} COLLATE ${userCollation} NULL`
      );
    }

    const [hasUserIdIndex] = await trx.raw(
      "SHOW INDEX FROM `GuildBankCharacter` WHERE Key_name = 'GuildBankCharacter_userId_idx'"
    );
    if (!hasUserIdIndex.length) {
      await trx.schema.alterTable('GuildBankCharacter', (table) => {
        table.index(['userId'], 'GuildBankCharacter_userId_idx');
      });
    }

    // Drop old unique if present and replace with scoped unique that includes isPersonal + userId
    const [oldIndex] = await trx.raw(
      "SHOW INDEX FROM `GuildBankCharacter` WHERE Key_name = 'GuildBankCharacter_guildId_normalizedName_key'"
    );
    if (oldIndex.length) {
      await trx.raw(
        'ALTER TABLE `GuildBankCharacter` DROP INDEX `GuildBankCharacter_guildId_normalizedName_key`'
      );
    }
    const [newIndex] = await trx.raw(
      "SHOW INDEX FROM `GuildBankCharacter` WHERE Key_name = 'GuildBankCharacter_guildId_normalizedName_isPersonal_userId_key'"
    );
    if (!newIndex.length) {
      await trx.raw(
        'ALTER TABLE `GuildBankCharacter` ADD UNIQUE INDEX `GuildBankCharacter_guildId_normalizedName_isPersonal_userId_key` (`guildId`, `normalizedName`, `isPersonal`, `userId`)'
      );
    }

    // Add FK if missing
    const [fkRows] = await trx.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'GuildBankCharacter' AND COLUMN_NAME = 'userId' AND REFERENCED_TABLE_NAME = 'User'"
    );
    if (!fkRows.length) {
      await trx.raw(`
        ALTER TABLE \`GuildBankCharacter\`
        ADD CONSTRAINT \`GuildBankCharacter_userId_fkey\`
        FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
      `);
    }
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    const hasTable = await trx.schema.hasTable('GuildBankCharacter');
    if (!hasTable) return;

    // Drop FK + new unique + index, then drop column
    const [fkRows] = await trx.raw(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'GuildBankCharacter' AND COLUMN_NAME = 'userId' AND REFERENCED_TABLE_NAME = 'User'"
    );
    if (fkRows.length) {
      await trx.raw(
        'ALTER TABLE `GuildBankCharacter` DROP FOREIGN KEY `GuildBankCharacter_userId_fkey`'
      );
    }
    const [newIndex] = await trx.raw(
      "SHOW INDEX FROM `GuildBankCharacter` WHERE Key_name = 'GuildBankCharacter_guildId_normalizedName_isPersonal_userId_key'"
    );
    if (newIndex.length) {
      await trx.raw(
        'ALTER TABLE `GuildBankCharacter` DROP INDEX `GuildBankCharacter_guildId_normalizedName_isPersonal_userId_key`'
      );
    }
    await trx.schema.alterTable('GuildBankCharacter', (table) => {
      table.dropIndex(['userId'], 'GuildBankCharacter_userId_idx');
      table.dropColumn('userId');
    });
    const [oldIndex] = await trx.raw(
      "SHOW INDEX FROM `GuildBankCharacter` WHERE Key_name = 'GuildBankCharacter_guildId_normalizedName_key'"
    );
    if (!oldIndex.length) {
      await trx.raw(
        'ALTER TABLE `GuildBankCharacter` ADD UNIQUE INDEX `GuildBankCharacter_guildId_normalizedName_key` (`guildId`, `normalizedName`)'
      );
    }
  });
}
