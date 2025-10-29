/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable('RaidEvent', (table) => {
    table.string('discordVoiceUrl', 512).nullable();
  });

  await knex.schema.alterTable('Guild', (table) => {
    table.string('defaultDiscordVoiceUrl', 512).nullable();
    table.string('discordWidgetServerId', 64).nullable();
    table
      .enum('discordWidgetTheme', ['LIGHT', 'DARK'], {
        useNative: false,
        enumName: 'DiscordWidgetTheme'
      })
      .nullable();
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('RaidEvent', (table) => {
    table.dropColumn('discordVoiceUrl');
  });

  await knex.schema.alterTable('Guild', (table) => {
    table.dropColumn('defaultDiscordVoiceUrl');
    table.dropColumn('discordWidgetServerId');
    table.dropColumn('discordWidgetTheme');
  });
}
