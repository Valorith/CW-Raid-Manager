/**
 * Add global BiS planner tables for candidate items, votes, and moderation bans.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasCandidates = await knex.schema.hasTable('BisSlotCandidate');
  if (!hasCandidates) {
    await knex.schema.createTable('BisSlotCandidate', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table
        .enu('characterClass', [
          'BARD',
          'BEASTLORD',
          'BERSERKER',
          'CLERIC',
          'DRUID',
          'ENCHANTER',
          'MAGICIAN',
          'MONK',
          'NECROMANCER',
          'PALADIN',
          'RANGER',
          'ROGUE',
          'SHADOWKNIGHT',
          'SHAMAN',
          'WARRIOR',
          'WIZARD',
          'UNKNOWN'
        ])
        .notNullable();
      table.integer('slotId').notNullable();
      table.integer('itemId').notNullable();
      table.string('itemName', 191).notNullable();
      table.integer('itemIconId').nullable();
      table.string('submittedById', 191).notNullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['characterClass', 'slotId', 'itemId'], {
        indexName: 'BisSlotCandidate_class_slot_item_key'
      });
      table.index(['characterClass', 'slotId'], 'BisSlotCandidate_class_slot_idx');
      table.index(['submittedById'], 'BisSlotCandidate_submitter_idx');
      table
        .foreign('submittedById', 'BisSlotCandidate_submittedById_fkey')
        .references('User.id')
        .onDelete('CASCADE');
    });
  }

  const hasVotes = await knex.schema.hasTable('BisVote');
  if (!hasVotes) {
    await knex.schema.createTable('BisVote', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('candidateId', 191).notNullable();
      table.string('userId', 191).notNullable();
      table
        .enu('characterClass', [
          'BARD',
          'BEASTLORD',
          'BERSERKER',
          'CLERIC',
          'DRUID',
          'ENCHANTER',
          'MAGICIAN',
          'MONK',
          'NECROMANCER',
          'PALADIN',
          'RANGER',
          'ROGUE',
          'SHADOWKNIGHT',
          'SHAMAN',
          'WARRIOR',
          'WIZARD',
          'UNKNOWN'
        ])
        .notNullable();
      table.integer('slotId').notNullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['userId', 'characterClass', 'slotId'], {
        indexName: 'BisVote_user_class_slot_key'
      });
      table.index(['candidateId'], 'BisVote_candidate_idx');
      table.index(['characterClass', 'slotId'], 'BisVote_class_slot_idx');
      table
        .foreign('candidateId', 'BisVote_candidateId_fkey')
        .references('BisSlotCandidate.id')
        .onDelete('CASCADE');
      table.foreign('userId', 'BisVote_userId_fkey').references('User.id').onDelete('CASCADE');
    });
  }

  const hasBans = await knex.schema.hasTable('BisBan');
  if (!hasBans) {
    await knex.schema.createTable('BisBan', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.string('bannedById', 191).notNullable();
      table.string('reason', 500).nullable();
      table.dateTime('expiresAt', { precision: 3 }).nullable();
      table.dateTime('revokedAt', { precision: 3 }).nullable();
      table.string('revokedById', 191).nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.index(['userId', 'revokedAt', 'expiresAt'], 'BisBan_user_active_idx');
      table.index(['bannedById'], 'BisBan_banned_by_idx');
      table.index(['revokedById'], 'BisBan_revoked_by_idx');
      table.foreign('userId', 'BisBan_userId_fkey').references('User.id').onDelete('CASCADE');
      table
        .foreign('bannedById', 'BisBan_bannedById_fkey')
        .references('User.id')
        .onDelete('CASCADE');
      table
        .foreign('revokedById', 'BisBan_revokedById_fkey')
        .references('User.id')
        .onDelete('SET NULL');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasBans = await knex.schema.hasTable('BisBan');
  if (hasBans) {
    await knex.schema.dropTable('BisBan');
  }

  const hasVotes = await knex.schema.hasTable('BisVote');
  if (hasVotes) {
    await knex.schema.dropTable('BisVote');
  }

  const hasCandidates = await knex.schema.hasTable('BisSlotCandidate');
  if (hasCandidates) {
    await knex.schema.dropTable('BisSlotCandidate');
  }
}
