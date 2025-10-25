ALTER TABLE `GuildDiscordWebhook`
  ADD COLUMN `mentionSubscriptions` JSON NOT NULL DEFAULT (JSON_OBJECT());
