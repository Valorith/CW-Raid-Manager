/**
 * Add NpcFavorite table for tracking user's favorite NPCs in the respawn tracker.
 * Favorites are per-user, per-guild, and unique to NPC name + instance variant.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('NpcFavorite', table => {
    table.string('id', 191).primary();
    table.string('userId', 191).notNullable();
    table.string('guildId', 191).notNullable();
    table.string('npcNameNormalized', 191).notNullable();
    table.boolean('isInstanceVariant').notNullable().defaultTo(false);
    table.timestamp('createdAt').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('userId').references('id').inTable('User').onDelete('CASCADE');
    table.foreign('guildId').references('id').inTable('Guild').onDelete('CASCADE');

    // Unique constraint: one favorite per user per NPC variant per guild
    table.unique(['userId', 'guildId', 'npcNameNormalized', 'isInstanceVariant']);

    // Indexes for efficient queries
    table.index(['userId', 'guildId']);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('NpcFavorite');
}
