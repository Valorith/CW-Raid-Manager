/**
 * Add account-linked messenger notification channels, preferences, deliveries,
 * and per-watch market notification settings.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (hasMarketFavorite) {
    const hasNotificationSettings = await knex.schema.hasColumn(
      'MarketFavorite',
      'notificationSettings'
    );

    if (!hasNotificationSettings) {
      await knex.schema.alterTable('MarketFavorite', (table) => {
        table.json('notificationSettings').nullable();
      });
    }
  }

  const hasUserNotificationChannel = await knex.schema.hasTable('UserNotificationChannel');
  if (!hasUserNotificationChannel) {
    await knex.schema.createTable('UserNotificationChannel', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table
        .enu('provider', ['TELEGRAM', 'WHATSAPP'])
        .notNullable();
      table
        .enu('status', ['PENDING', 'ACTIVE', 'DISCONNECTED', 'FAILED'])
        .notNullable()
        .defaultTo('PENDING');
      table.string('externalUserId', 191).nullable();
      table.string('externalChatId', 191).nullable();
      table.string('externalPhone', 32).nullable();
      table.string('displayLabel', 191).nullable();
      table.json('metadata').nullable();
      table.dateTime('verifiedAt', { precision: 3 }).nullable();
      table.dateTime('lastInboundAt', { precision: 3 }).nullable();
      table.dateTime('lastTestedAt', { precision: 3 }).nullable();
      table.dateTime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['userId', 'provider'], {
        indexName: 'UserNotificationChannel_user_provider_key'
      });
      table.unique(['provider', 'externalChatId'], {
        indexName: 'UserNotificationChannel_provider_externalChat_unique'
      });
      table.unique(['provider', 'externalPhone'], {
        indexName: 'UserNotificationChannel_provider_externalPhone_unique'
      });
      table.index(['provider', 'externalUserId'], 'UserNotificationChannel_provider_externalUser_idx');
      table.index(['status'], 'UserNotificationChannel_status_idx');
      table.foreign('userId').references('User.id').onDelete('CASCADE').onUpdate('CASCADE');
    });
  }

  const hasUserNotificationPreference = await knex.schema.hasTable('UserNotificationPreference');
  if (!hasUserNotificationPreference) {
    await knex.schema.createTable('UserNotificationPreference', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.enu('scopeType', ['GLOBAL', 'GUILD']).notNullable();
      table.string('scopeId', 191).notNullable();
      table.string('eventKey', 191).notNullable();
      table.json('providerTargets').nullable();
      table.boolean('isEnabled').notNullable().defaultTo(true);
      table.dateTime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['userId', 'scopeType', 'scopeId', 'eventKey'], {
        indexName: 'UserNotificationPreference_scope_key'
      });
      table.index(['scopeType', 'scopeId'], 'UserNotificationPreference_scope_idx');
      table.foreign('userId').references('User.id').onDelete('CASCADE').onUpdate('CASCADE');
    });
  }

  const hasNotificationDelivery = await knex.schema.hasTable('NotificationDelivery');
  if (!hasNotificationDelivery) {
    await knex.schema.createTable('NotificationDelivery', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('userId', 191).notNullable();
      table.enu('scopeType', ['GLOBAL', 'GUILD']).notNullable();
      table.string('scopeId', 191).notNullable();
      table.enu('provider', ['TELEGRAM', 'WHATSAPP']).notNullable();
      table.string('eventKey', 191).notNullable();
      table
        .enu('status', ['PENDING', 'PROCESSING', 'SENT', 'FAILED'])
        .notNullable()
        .defaultTo('PENDING');
      table.json('payload').notNullable();
      table.dateTime('deliverAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.integer('attemptCount').notNullable().defaultTo(0);
      table.string('lastError', 1000).nullable();
      table.string('providerMessageId', 191).nullable();
      table.string('dedupeKey', 191).notNullable();
      table.dateTime('sentAt', { precision: 3 }).nullable();
      table.dateTime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['dedupeKey'], { indexName: 'NotificationDelivery_dedupeKey_key' });
      table.index(['status', 'deliverAt'], 'NotificationDelivery_status_deliverAt_idx');
      table.index(['userId', 'createdAt'], 'NotificationDelivery_user_createdAt_idx');
      table.foreign('userId').references('User.id').onDelete('CASCADE').onUpdate('CASCADE');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasNotificationDelivery = await knex.schema.hasTable('NotificationDelivery');
  if (hasNotificationDelivery) {
    await knex.schema.dropTable('NotificationDelivery');
  }

  const hasUserNotificationPreference = await knex.schema.hasTable('UserNotificationPreference');
  if (hasUserNotificationPreference) {
    await knex.schema.dropTable('UserNotificationPreference');
  }

  const hasUserNotificationChannel = await knex.schema.hasTable('UserNotificationChannel');
  if (hasUserNotificationChannel) {
    await knex.schema.dropTable('UserNotificationChannel');
  }

  const hasMarketFavorite = await knex.schema.hasTable('MarketFavorite');
  if (hasMarketFavorite) {
    const hasNotificationSettings = await knex.schema.hasColumn(
      'MarketFavorite',
      'notificationSettings'
    );

    if (hasNotificationSettings) {
      await knex.schema.alterTable('MarketFavorite', (table) => {
        table.dropColumn('notificationSettings');
      });
    }
  }
}
