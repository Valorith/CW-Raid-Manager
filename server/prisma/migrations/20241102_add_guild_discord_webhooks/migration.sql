-- Create GuildDiscordWebhook table if it does not already exist
SET @table_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'GuildDiscordWebhook'
);

SET @ddl := IF(
  @table_exists = 0,
'CREATE TABLE `GuildDiscordWebhook` (
    `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `guildId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `webhookUrl` VARCHAR(512) NULL,
    `isEnabled` TINYINT(1) NOT NULL DEFAULT 0,
    `usernameOverride` VARCHAR(120) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `mentionRoleId` VARCHAR(120) NULL,
    `eventSubscriptions` JSON NOT NULL DEFAULT (JSON_OBJECT()),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `GuildDiscordWebhook_guildId_key` (`guildId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `GuildDiscordWebhook_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
  )',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
