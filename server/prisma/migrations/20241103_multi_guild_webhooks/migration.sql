ALTER TABLE `GuildDiscordWebhook`
  ADD COLUMN `label` VARCHAR(120) NOT NULL DEFAULT 'Primary Webhook';

ALTER TABLE `GuildDiscordWebhook`
  DROP INDEX `GuildDiscordWebhook_guildId_key`,
  ADD INDEX `GuildDiscordWebhook_guildId_idx` (`guildId`);
